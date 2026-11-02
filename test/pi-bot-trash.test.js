const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-trash-'))), agentDir = path.join(root, 'agent');
fs.mkdirSync(agentDir); process.env.PI_CODING_AGENT_DIR = agentDir; process.env.PI_PROJECT_ROOTS = root; process.env.OHMYBUDDY_WORKSPACES_DIR = path.join(root, 'workspaces'); process.env.PI_OFFLINE = '1';
const { PiSessionStore } = require('../server/pi-session-store');
const { PiProfileRegistry } = require('../server/pi-profile-registry');
const { PiAgentSupervisor } = require('../server/pi-agent-supervisor');
const { BotService } = require('../server/bot/bot-service');
const { createTrashBlockers } = require('../server/bot/bot-trash');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
async function fixture(t) {
    const store = new PiSessionStore(), profiles = new PiProfileRegistry(store); store.profiles = profiles;
    const supervisor = new PiAgentSupervisor(); t.after(() => supervisor.dispose());
    const bots = new BotService({ store, profiles, supervisor }); bots.trashBlockers = () => [];
    const revision = async () => (await profiles.state()).revision, created = await bots.create({ expectedRevision: await revision() });
    const id = created.bot.id, window = created.window, session = (await bots.resolve(id, window.id)).session;
    const record = () => profiles.getProfile(id), originalBytes = fs.readFileSync(session.path);
    const trash = async extra => bots.trash(id, { expectedRevision: await revision(), ...extra });
    const worker = { cwd: session.cwd, sessionId: session.id, sessionPath: session.path, loadedBot: { profileId: id }, disposed: false, busy: false, stops: 0,
        isIdle() { return !this.busy; }, retainsBackgroundWork() { return false; }, exclusive(action) { return action(); },
        async dispose() { this.disposed = true; this.stops++; } };
    return { store, profiles, supervisor, bots, revision, id, window, session, record, trash, worker, originalBytes };
}
test('Bot trash stops its idle worker, uses reversible profile trash, preserves history and restores the same window', async t => {
    const f = await fixture(t); f.supervisor.workers.set(f.session.path, f.worker);
    const saved = await f.trash(); assert.equal(saved.trashed, true); assert.equal(saved.recoverable, true); assert.equal(saved.stoppedSessions, 1);
    assert.equal(f.worker.stops, 1); assert.equal(f.supervisor.workers.has(f.session.path), false);
    assert.equal((await f.record()).enabled, false); assert.ok((await f.record()).trashedAt);
    assert.deepEqual(fs.readFileSync(f.session.path), f.originalBytes); assert.equal(fs.existsSync(f.session.cwd), true);
    assert.equal((await f.bots.list()).bots.some(p => p.id === f.id), false);
    await f.profiles.restore(f.id, { expectedRevision: await f.revision() });
    assert.equal((await f.bots.resolve(f.id, f.window.id)).session.id, f.session.id);
    assert.equal((await f.record()).enabled, true); assert.deepEqual(fs.readFileSync(f.session.path), f.originalBytes);
});
test('stale confirmations, malformed requests and damaged current references fail before stopping anything', async t => {
    const f = await fixture(t); f.supervisor.workers.set(f.session.path, f.worker); const before = await f.record();
    await assert.rejects(f.trash({ expectedRevision: 'stale' }), { code: 'BOT_TRASH_STALE' });
    await assert.rejects(f.trash({ permanently: true }), { code: 'BOT_TRASH_INVALID' });
    f.bots.nativeMarkers = async () => [];
    await assert.rejects(f.trash(), { code: 'BOT_WINDOW_STALE' });
    assert.equal(f.worker.stops, 0); assert.deepEqual(await f.record(), before);
});
test('busy or background work is not stopped or falsely reported trashed', async t => {
    for (const background of [false, true]) {
        const f = await fixture(t); f.worker.busy = !background; f.worker.retainsBackgroundWork = () => background;
        f.supervisor.workers.set(f.session.path, f.worker); const before = await f.record();
        await assert.rejects(f.trash(), { code: 'SESSION_BUSY' });
        assert.equal(f.worker.stops, 0); assert.deepEqual(await f.record(), before);
    }
});
test('persistent queue recovery refuses with conflict and never drops queued messages', async t => {
    const f = await fixture(t), before = await f.record(); f.supervisor.workers.set(f.session.path, f.worker);
    f.supervisor.getQueueStore = async () => ({ assertMovable() { throw Object.assign(new Error('synthetic recovery'), { code: 'SESSION_QUEUE_RECOVERY' }); } });
    await assert.rejects(f.trash(), { code: 'SESSION_QUEUE_RECOVERY', status: 409 });
    assert.equal(f.worker.stops, 0); assert.deepEqual(await f.record(), before);
});
test('failed worker termination keeps the profile enabled and preserves all native data', async t => {
    const f = await fixture(t), before = await f.record(); f.supervisor.workers.set(f.session.path, f.worker);
    f.worker.dispose = async () => { throw new Error('synthetic stop failed'); };
    await assert.rejects(f.trash(), /synthetic stop failed/); assert.deepEqual(await f.record(), before);
    assert.deepEqual(fs.readFileSync(f.session.path), f.originalBytes);
});
test('a scheduler write or pending message appearing during retirement is caught in the final synchronous CAS', async t => {
    const f = await fixture(t), before = await f.record(); f.supervisor.workers.set(f.session.path, f.worker);
    let late = false; f.bots.trashBlockers = () => late ? [{ code: 'BOT_HAS_SCHEDULES', message: 'synthetic late work' }] : [];
    f.worker.dispose = async () => { f.worker.disposed = true; late = true; };
    await assert.rejects(f.trash(), { code: 'BOT_HAS_SCHEDULES' });
    assert.deepEqual(await f.record(), before); assert.deepEqual(fs.readFileSync(f.session.path), f.originalBytes);
});
test('profile reservation and session gates cover asynchronous startup until the profile is retired', async t => {
    const f = await fixture(t); let release;
    const starting = new Promise(resolve => { release = resolve; }); f.supervisor.starting.set(f.session.path, starting);
    const pending = f.trash();
    while (!f.supervisor.editing.has(f.session.path)) await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(Promise.resolve().then(() => f.profiles.trash(f.id, { expectedRevision: 'unused' })), { status: 409 });
    f.supervisor.workers.set(f.session.path, f.worker); f.supervisor.starting.delete(f.session.path); release();
    assert.equal((await pending).trashed, true); assert.equal(f.worker.stops, 1);
    assert.equal(f.supervisor.editing.size, 0);
});
test('production blocker check catches enabled profile/thread schedules, deferred states and profile learning without modifying them', () => {
    const cron = { db: { jobs: () => jobs, activeRuns: () => runs }, busy: false, mutating: null }, deferred = { jobs: [], assertHealthy() {} }, learning = { active: new Map() };
    const store = { resolveProject: cwd => path.resolve(cwd) };
    let jobs = [], runs = []; const check = createTrashBlockers({ cron, deferred, learning, store }), target = { profileId: 'bot-a', sessionRefs: [{ cwd: path.resolve('/fixture'), sessionId: 's' }] };
    assert.deepEqual(check(target), []);
    jobs = [{ enabled: true, target: { kind: 'profile', profileId: 'bot-a' } }]; assert.equal(check(target)[0].code, 'BOT_HAS_SCHEDULES');
    jobs[0].enabled = false; assert.deepEqual(check(target), []);
    for (const status of ['waiting', 'uncertain']) {
        runs = [{ status, job: { target: { kind: 'profile', profileId: 'bot-a' } } }];
        assert.ok(check(target).some(item => item.code === 'BOT_HAS_SCHEDULES'), 'a disabled one-time job can still own accepted work');
        runs = [{ status, job: { target: { kind: 'profile', profileId: 'other' } }, target: { cwd: '/fixture/.', sessionId: 's' } }];
        assert.ok(check(target).some(item => item.code === 'BOT_HAS_SCHEDULES'), 'resolved native targets remain protected after retargeting');
        runs = [{ status, job: { target: { kind: 'thread', cwd: '/fixture/.', sessionId: 's' } } }];
        assert.ok(check(target).some(item => item.code === 'BOT_HAS_SCHEDULES'), 'unresolved thread targets use canonical directory identity');
    }
    runs = [{ status: 'waiting', job: { target: { kind: 'profile', profileId: 'other' } }, target: { cwd: '/fixture', sessionId: 'other' } }];
    assert.deepEqual(check(target), []); runs = [];
    jobs = [{ enabled: true, target: { kind: 'thread', cwd: '/fixture', sessionId: 's' } }]; assert.equal(check(target)[0].code, 'BOT_HAS_SCHEDULES');
    jobs[0].deleted = true; assert.deepEqual(check(target), []); cron.mutating = Promise.resolve(); assert.equal(check(target)[0].code, 'BOT_WORK_PENDING'); cron.mutating = null;
    for (const status of ['scheduled', 'waiting', 'paused', 'dispatching', 'failed', 'expired', 'uncertain']) {
        deferred.jobs = [{ cwd: '/fixture', sessionId: 's', status }]; assert.equal(check(target)[0].code, 'BOT_HAS_DEFERRED'); assert.equal(deferred.jobs[0].status, status);
    }
    deferred.jobs[0].sessionId = 'other'; assert.deepEqual(check(target), []);
    learning.active.set('job', { profileId: 'bot-a' }); assert.equal(check(target)[0].code, 'BOT_WORK_PENDING');
    learning.active.set('job', { profileId: 'other' }); assert.deepEqual(check(target), []);
});
