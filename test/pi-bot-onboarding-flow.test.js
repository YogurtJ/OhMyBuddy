const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-flow-'))), agentDir = path.join(root, 'agent');
fs.mkdirSync(agentDir); process.env.PI_CODING_AGENT_DIR = agentDir; process.env.PI_PROJECT_ROOTS = root; process.env.PI_OFFLINE = '1';
const { PiSessionStore } = require('../server/pi-session-store');
const { PiProfileRegistry } = require('../server/pi-profile-registry');
const { PiAgentSupervisor } = require('../server/pi-agent-supervisor');
const { BotService } = require('../server/bot/bot-service');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
async function fixture(t) {
    const store = new PiSessionStore(), profiles = new PiProfileRegistry(store); store.profiles = profiles;
    const supervisor = new PiAgentSupervisor(); t.after(() => supervisor.dispose());
    const bots = new BotService({ store, profiles, supervisor, catalog: async () => ({ models: [{ provider: 'fixture', modelId: 'small', thinkingLevels: ['low', 'high'] }] }) });
    const revision = async () => (await profiles.state()).revision;
    const created = await bots.create({ expectedRevision: await revision() }), id = created.bot.id;
    const record = () => profiles.getProfile(id);
    const change = async input => bots.onboarding(id, { expectedRevision: await revision(), ...input });
    const patch = async action => profiles.reserve(async () => profiles.mutate(await revision(), state => action(state.profiles.find(p => p.id === id))));
    const finish = () => patch(profile => { profile.bot.onboarding.phase = 'done'; profile.bot.onboarding.completedAt = new Date().toISOString(); });
    return { store, profiles, supervisor, bots, id, window: created.window, revision, record, change, patch, finish };
}
test('new flow persists local model and first-task choices without executing or modifying conversation data', async t => {
    const f = await fixture(t); assert.equal((await f.record()).bot.onboarding.flowVersion, 2);
    const before = fs.readFileSync((await f.bots.resolve(f.id, f.window.id)).session.path);
    const original = await f.record();
    await f.change({ action: 'start' });
    await assert.rejects(f.change({ action: 'first-task', choice: 'plan' }), { code: 'BOT_INTERVIEW_PENDING' });
    await f.change({ action: 'model-choice', model: { provider: 'fixture', id: 'small', thinking: 'high' } });
    assert.deepEqual((await f.record()).bot.model, { provider: 'fixture', id: 'small', thinking: 'high' });
    await f.finish(); await f.change({ action: 'first-task', choice: 'plan' });
    const saved = await f.record(); assert.equal(saved.bot.onboarding.phase, 'done');
    assert.equal(saved.bot.onboarding.steps.model, 'done'); assert.equal(saved.bot.onboarding.steps['first-task'], 'done');
    assert.equal(saved.bot.onboarding.firstTaskChoice, 'plan'); assert.deepEqual(saved.bot.permissions, original.bot.permissions);
    assert.deepEqual(fs.readFileSync((await f.bots.resolve(f.id, f.window.id)).session.path), before, 'choosing a starter does not send a message or create a worker');
    assert.equal(f.supervisor.workers.size, 0);
});
test('later records an explicit deferred first task without reopening the completed introduction', async t => {
    const f = await fixture(t); await f.finish(); await f.change({ action: 'first-task', choice: 'later' });
    const record = await f.record(); assert.equal(record.bot.onboarding.phase, 'done');
    assert.equal(record.bot.onboarding.steps['first-task'], 'skipped'); assert.equal(record.bot.onboarding.steps.model, 'skipped');
    assert.equal(record.bot.model, null);
});
test('unsupported models, thinking levels, stale revisions and extra fields cannot silently change a Bot', async t => {
    const f = await fixture(t), original = await f.record(), revision = await f.revision();
    for (const input of [{ action: 'model-choice' }, { action: 'model-choice', model: { provider: 'fixture', id: 'absent' } },
        { action: 'model-choice', model: { provider: 'fixture', id: 'small', thinking: 'max' } },
        { action: 'model-choice', model: null, permissions: { preset: 'free' } }, { action: 'first-task', choice: 'shell' }]) {
        await assert.rejects(f.change(input)); assert.deepEqual(await f.record(), original);
    }
    await f.change({ action: 'model-choice', model: null });
    await assert.rejects(f.bots.onboarding(f.id, { action: 'model-choice', model: { provider: 'fixture', id: 'small' }, expectedRevision: revision }), { status: 409 });
    assert.equal((await f.record()).bot.model, null);
});
test('keeping an unavailable selected model is possible without a catalog, but selecting a different one fails', async t => {
    const f = await fixture(t); const old = { provider: 'gone', id: 'saved', thinking: 'high' };
    await f.patch(p => { p.bot.model = old; }); f.bots.catalog = async () => { throw new Error('synthetic unavailable'); };
    await f.change({ action: 'model-choice', model: old }); assert.deepEqual((await f.record()).bot.model, old);
    await assert.rejects(f.change({ action: 'model-choice', model: { provider: 'gone', id: 'other' } }), { code: 'BOT_MODEL_UNAVAILABLE' });
    assert.deepEqual((await f.record()).bot.model, old);
});
test('legacy completed Bots are not enrolled in new steps; explicit restart preserves chosen identity and upgrades flow', async t => {
    const f = await fixture(t);
    await f.patch(p => { p.name = 'Cedar'; p.avatar = { kind: 'preset', id: 'pivane-bean' }; delete p.bot.onboarding.flowVersion;
        p.bot.onboarding.phase = 'done'; p.bot.onboarding.completedAt = new Date().toISOString(); p.bot.onboarding.steps = { name: 'done', avatar: 'done' }; });
    const before = await f.record();
    await assert.rejects(f.change({ action: 'model-choice', model: null }), { code: 'BOT_ONBOARDING_LEGACY' }); assert.deepEqual(await f.record(), before);
    await f.change({ action: 'restart' }); const after = await f.record();
    assert.equal(after.name, 'Cedar'); assert.deepEqual(after.avatar, before.avatar); assert.equal(after.bot.onboarding.flowVersion, 2);
    assert.equal(after.bot.onboarding.phase, 'interview'); assert.deepEqual(after.bot.onboarding.steps, {});
    assert.deepEqual(after.bot.chosen, { name: true, avatar: true });
});
test('settings expose editable rules while Bot lists keep their compact rule count', async t => {
    const f = await fixture(t); const opaque = { futureRule: { target: 'keep as data' } };
    await f.patch(profile => { profile.bot.permissions.rules = [opaque]; });
    const settings = await f.bots.settings(f.id), listed = (await f.bots.list()).bots.find(bot => bot.id === f.id);
    assert.deepEqual(settings.bot.bot.permissions.rules, [opaque]); assert.equal(listed.bot.permissions.rules, 1);
    assert.deepEqual((await f.record()).bot.permissions.rules, [opaque]);
});

test('model lookup holds the shared reservation before awaiting, and a competing settings save cannot enter', async t => {
    const f = await fixture(t); let release;
    f.bots.catalog = () => new Promise(resolve => { release = resolve; });
    const pending = f.change({ action: 'model-choice', model: { provider: 'fixture', id: 'small' } });
    while (!release) await new Promise(resolve => setImmediate(resolve));
    try { await assert.rejects(Promise.resolve().then(() => f.bots.update(f.id, { expectedRevision: 'irrelevant', changes: { name: 'Competing' } })), { status: 409 }); }
    finally { release({ models: [{ provider: 'fixture', modelId: 'small', thinkingLevels: [] }] }); }
    await pending; assert.equal((await f.record()).name, '新伙伴');
    assert.deepEqual((await f.record()).bot.model, { provider: 'fixture', id: 'small' });
});
