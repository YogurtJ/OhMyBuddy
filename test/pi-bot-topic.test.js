const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-topic-')));
const agentDir = path.join(root, 'agent'); fs.mkdirSync(agentDir);
process.env.PI_CODING_AGENT_DIR = agentDir; process.env.PI_PROJECT_ROOTS = root; process.env.PI_OFFLINE = '1';
process.env.PI_WEB_DEFERRED_FILE = path.join(root, 'deferred.json');
const { createPiAgentGateway } = require('../server/pi-agent-routes');
const { WorkspaceAccessService } = require('../server/workspace-access-service');
const { AgentWorker } = require('../server/pi-agent-supervisor');
const { readWindowBinding, WINDOW_ENTRY, windowMarker } = require('../server/bot/bot-window-state');
const { MAX_TOPICS } = require('../server/bot/bot-topic');
const { openItems, renderOpenItems } = require('../server/bot/bot-topic-index');
const ledger = require('../server/bot/bot-ledger');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

async function fixture(t) {
    const access = new WorkspaceAccessService({ envToken: () => 'synthetic-management' });
    const gateway = createPiAgentGateway({ accessService: access, cronFilePath: path.join(root, `${randomUUID()}.sqlite`) });
    const { bots, store, supervisor, cron } = gateway;
    const profiles = store.profiles;
    clearInterval(cron.timer); await cron.ready; cron.healthy();
    const app = require('express')(); app.use(require('express').json()); gateway.mount(app);
    const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => {
        supervisor.workers.clear(); await gateway.dispose(); access.dispose();
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, body, token = 'synthetic-management') => {
        const response = await fetch(origin + '/api/pi' + url, { method,
            headers: { 'Content-Type': 'application/json', ...(token === null ? {} : { Authorization: `Bearer ${token}` }) },
            body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
    };
    const newBot = () => profiles.state().then(({ revision }) => bots.create({ expectedRevision: revision }));
    const created = await newBot(), profileId = created.bot.id, mainId = created.window.id;
    const main = (await bots.resolve(profileId, mainId)).session;
    const revision = () => bots.windows.read(profileId).then(result => result.revision);
    const topic = async (fields = {}) => bots.createTopic(profileId, { expectedRevision: await revision(), title: '读书', ...fields });
    const patch = async (id, fields) => bots.updateWindow(profileId, id, { expectedRevision: await revision(), ...fields });
    const workerFor = (session, windowId, generation = 0) => {
        const worker = new AgentWorker({ cwd: session.cwd, sessionPath: session.path, sessionId: session.id });
        worker.loadedBot = { profileId, windowId, generation }; supervisor.workers.set(session.path, worker); return worker;
    };
    return { ...gateway, profiles, access, origin, call, newBot, profileId, mainId, main, revision, topic, patch, workerFor };
}

async function note(session, ops) {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const manager = SessionManager.open(session.path);
    const prepared = ledger.prepareOps(ledger.replay(manager.getBranch()), ops, { at: new Date().toISOString(), by: 'bot' });
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, ops: prepared.ops });
}

test('topic HTTP create and metadata CAS preserve Bot identity, defaults and a fresh independent native notebook', async t => {
    const f = await fixture(t), url = `/bots/${f.profileId}/windows`;
    await note(f.main, [{ op: 'add', kind: 'open', text: 'Main-only notebook' }]);
    const before = await f.revision();
    const created = await f.call('POST', url, { expectedRevision: before, title: '  阅读计划  ' });
    assert.equal(created.status, 200, JSON.stringify(created.data)); assert.equal(created.cache, 'no-store');
    const window = created.data.window;
    assert.equal(window.kind, 'topic'); assert.equal(window.title, '阅读计划'); assert.equal(window.focus, ''); assert.equal(window.emoji, '');
    assert.equal(window.generation, 0); assert.equal(window.generations, 1); assert.equal(window.archivedAt, null);
    assert.equal(window.windowsRevision, undefined); assert.notEqual(created.data.windowsRevision, before);
    const session = (await f.bots.resolve(f.profileId, window.id)).session;
    assert.notEqual(session.id, f.main.id); assert.equal(session.agentProfile.id, f.profileId);
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const manager = SessionManager.open(session.path);
    assert.equal(manager.getBranch().filter(entry => entry.type === 'message').length, 0, 'main conversation was not copied');
    assert.equal(ledger.replay(manager.getBranch()).items.length, 0, 'notebook is independent');
    assert.deepEqual(readWindowBinding(manager).topicSeed, { title: '阅读计划', focus: '', emoji: '' });
    assert.equal((await f.profiles.getProfile(f.profileId)).memory.enabled, true, 'same profile memory remains shared');
    assert.equal((await f.call('POST', url, { expectedRevision: before, title: 'stale' })).status, 409);
    const saved = await f.call('PATCH', `${url}/${window.id}`, { expectedRevision: await f.revision(), title: '新书', focus: '每周读两章', emoji: '📚' });
    assert.equal(saved.status, 200, JSON.stringify(saved.data)); assert.equal(saved.data.window.focus, '每周读两章');
    assert.equal(saved.data.window.sessionId, session.id); assert.equal(saved.data.window.generation, 0);
    assert.equal((await f.call('PATCH', `${url}/${window.id}`, { expectedRevision: created.data.windowsRevision, title: 'stale' })).status, 409);
    for (const fields of [{ title: 'main' }, { focus: 'main' }, { archived: true }, { archived: false }]) {
        const result = await f.call('PATCH', `${url}/${f.mainId}`, { expectedRevision: await f.revision(), ...fields });
        assert.equal(result.status, 409); assert.equal(result.data.code, 'BOT_MAIN_WINDOW_FIXED');
    }
    const quick = await f.call('POST', url, { expectedRevision: await f.revision() });
    assert.equal(quick.status, 200, JSON.stringify(quick.data));
    assert.equal(quick.data.window.title, '新话题');
    assert.equal(quick.data.window.focus, '');
    for (const bad of [{ title: '' }, { title: 'x'.repeat(81) }, { title: null }, { title: 'x', focus: 'x'.repeat(501) },
        { title: 'x', emoji: 'x'.repeat(17) }, { title: 'x', focus: null }, { title: 'x', extra: 1 }, { title: 'x', generation: 9 },
        { title: 'x', archived: false }, { title: 'x\nmalformed' }]) {
        const result = await f.call('POST', url, { expectedRevision: await f.revision(), ...bad });
        assert.equal(result.status, 400, JSON.stringify(bad));
    }
    for (const bad of [{ archived: 'true' }, { current: {} }, { generation: 2 }, { title: null }, {}])
        assert.equal((await f.call('PATCH', `${url}/${window.id}`, { expectedRevision: await f.revision(), ...bad })).status, 400, JSON.stringify(bad));
    const other = await f.newBot();
    assert.equal((await f.call('PATCH', `/bots/${other.bot.id}/windows/${window.id}`, { expectedRevision: await f.revision(), title: 'foreign' })).status, 404);
});

test('topic instructions: owner-set multi-line text up to 8192 UTF-8 bytes, CAS patch, public output, kept out of native markers', async t => {
    const f = await fixture(t), url = `/bots/${f.profileId}/windows`;
    const { validWindow } = require('../server/bot/bot-window-registry');
    const text = '  回答先给结论。\n\t引用资料时附上链接。\n  ';
    const created = await f.call('POST', url, { expectedRevision: await f.revision(), title: '论文', instructions: text });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.equal(created.data.window.instructions, text.trim(), 'trimmed, line breaks and tabs kept');
    const session = (await f.bots.resolve(f.profileId, created.data.window.id)).session;
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    assert.deepEqual(readWindowBinding(SessionManager.open(session.path)).topicSeed, { title: '论文', focus: '', emoji: '' }, 'instructions stay out of the native marker');
    const plain = await f.call('POST', url, { expectedRevision: await f.revision(), title: 'Plain' });
    assert.equal(plain.data.window.instructions, '', 'missing means empty');
    // 8192 UTF-8 bytes is the limit, whatever the characters; only LF and tab among control characters.
    const exact = '字'.repeat(2730) + 'ab';
    assert.equal(Buffer.byteLength(exact), 8192);
    const fits = await f.call('POST', url, { expectedRevision: await f.revision(), title: 'Fits', instructions: exact });
    assert.equal(fits.status, 200, JSON.stringify(fits.data)); assert.equal(fits.data.window.instructions, exact);
    for (const bad of [exact + 'c', 'x'.repeat(8193), 'a\rb', 'a\u0000b', 'a\u001bb', 'a\u007fb', null, 7, ['x']]) {
        const result = await f.call('POST', url, { expectedRevision: await f.revision(), title: 'x', instructions: bad });
        assert.equal(result.status, 400, JSON.stringify(bad).slice(0, 40));
        assert.equal((await f.call('PATCH', `${url}/${created.data.window.id}`, { expectedRevision: await f.revision(), instructions: bad })).status, 400);
    }
    // A patch of the instructions alone keeps the other fields; revisions are checked as for title and focus.
    const before = await f.revision();
    const saved = await f.call('PATCH', `${url}/${created.data.window.id}`, { expectedRevision: before, instructions: 'Line one\nLine two' });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.window.instructions, 'Line one\nLine two'); assert.equal(saved.data.window.title, '论文');
    assert.notEqual(saved.data.windowsRevision, before);
    assert.equal((await f.call('PATCH', `${url}/${created.data.window.id}`, { expectedRevision: before, instructions: 'stale' })).status, 409);
    const cleared = await f.patch(created.data.window.id, { instructions: '' });
    assert.equal(cleared.window.instructions, '');
    await f.patch(created.data.window.id, { instructions: 'Keep it short' });
    const main = await f.call('PATCH', `${url}/${f.mainId}`, { expectedRevision: await f.revision(), instructions: 'main' });
    assert.equal(main.status, 409); assert.equal(main.data.code, 'BOT_MAIN_WINDOW_FIXED');
    // Public output: every window carries the field; records written before it read as ''.
    const { revision } = await f.bots.windows.read(f.profileId);
    await f.bots.windows.mutate(f.profileId, revision, state => { delete state.windows.find(item => item.id === plain.data.window.id).instructions; return {}; });
    const listed = (await f.call('GET', '/bots')).data.bots.find(bot => bot.id === f.profileId).windows;
    const byId = new Map(listed.map(item => [item.id, item]));
    assert.equal(byId.get(f.mainId).instructions, ''); assert.equal(byId.get(plain.data.window.id).instructions, '');
    assert.equal(byId.get(created.data.window.id).instructions, 'Keep it short');
    // The index accepts topics with valid instructions only, and never a main chat with them.
    const record = (await f.bots.windows.read(f.profileId)).state.windows.find(item => item.id === created.data.window.id);
    const mainRecord = (await f.bots.windows.read(f.profileId)).state.windows.find(item => item.kind === 'main');
    assert.equal(validWindow(record), true); assert.equal(mainRecord.instructions, undefined);
    assert.equal(validWindow({ ...record, instructions: undefined }), true);
    for (const bad of [exact + 'c', 'a\rb', 1]) assert.equal(validWindow({ ...record, instructions: bad }), false);
    assert.equal(validWindow({ ...mainRecord, instructions: '' }), false);
});

test('topic instructions reach the model after the topic guidance, are read again each run, and never in the main chat', async t => {
    const { botPreamble } = require('../server/bot/bot-prompt');
    const topic = { kind: 'topic', title: '论文', focus: '', instructions: 'Cite sources.\nUse tables.' };
    const prompt = botPreamble({ name: 'Ada', bot: {}, cwd: '/fixture', window: topic });
    const header = 'Instructions the user set for this topic (follow them here unless they conflict with the safety rules or permissions above):';
    assert.ok(prompt.endsWith(`\n\n${header}\nCite sources.\nUse tables.`), prompt.slice(-300));
    assert.ok(prompt.indexOf('This is the topic chat') < prompt.indexOf(header));
    for (const window of [{ ...topic, instructions: '' }, { ...topic, instructions: '  \n ' }, { ...topic, instructions: undefined },
        { kind: 'main', title: '', focus: '', instructions: 'Never here' }])
        assert.ok(!botPreamble({ name: 'Ada', bot: {}, cwd: '/fixture', window }).includes('Instructions the user set'), JSON.stringify(window));
    // In a worker: the section is rebuilt from the window index before every run, so an edit applies to the next run.
    const f = await fixture(t), created = await f.topic({ instructions: 'Answer in haiku.' });
    const session = (await f.bots.resolve(f.profileId, created.window.id)).session;
    const w = await workerTool(t, f, session, created.window.id);
    const run = async () => {
        const event = { systemPromptOptions: { sections: {} } };
        await w.handlers.get('before_agent_start')(event, w.ctx);
        return event.systemPromptOptions.sections.pivane_bot || '';
    };
    assert.match(await run(), /set for this topic[^\n]*\nAnswer in haiku\.$/);
    await f.patch(created.window.id, { instructions: 'Answer in one line.\nNo emoji.' });
    assert.match(await run(), /set for this topic[^\n]*\nAnswer in one line\.\nNo emoji\.$/);
    await f.patch(created.window.id, { instructions: '' });
    assert.doesNotMatch(await run(), /Instructions the user set/);
});

test('topic creation reserves profiles and window CAS before native awaits; races and stale writes create nothing', async t => {
    const f = await fixture(t), before = await f.revision();
    const create = f.store.createSession.bind(f.store); let release, arrived;
    const ready = new Promise(resolve => { arrived = resolve; }), wait = new Promise(resolve => { release = resolve; });
    f.store.createSession = async (...args) => { arrived(); await wait; return create(...args); };
    const pending = f.bots.createTopic(f.profileId, { expectedRevision: before, title: 'One' });
    assert.equal(f.profiles.busy, true, 'reservation is synchronous'); await ready;
    const prepared = await f.bots.windows.read(f.profileId);
    const row = prepared.state.windows.find(window => window.title === 'One');
    assert.ok(row); assert.equal(row.current, null); assert.notEqual(prepared.revision, before, 'CAS committed before native creation');
    assert.throws(() => f.bots.createTopic(f.profileId, { expectedRevision: before, title: 'Race' }), error => error.status === 409);
    assert.throws(() => f.bots.updateWindow(f.profileId, row.id, { expectedRevision: prepared.revision, title: 'Race' }), error => error.status === 409);
    assert.throws(() => f.bots.update(f.profileId, { expectedRevision: 'x', changes: { name: 'Race' } }), error => error.status === 409);
    release(); const result = await pending; f.store.createSession = create;
    await assert.rejects(f.bots.createTopic(f.profileId, { expectedRevision: before, title: 'Stale' }), error => error.status === 409);
    assert.equal((await f.bots.windows.read(f.profileId)).state.windows.length, 2);
    assert.equal(result.window.title, 'One');
});

test('partial topic creation recovers the same marked session and preserves edited metadata; missing indexes adopt verified seeds only', async t => {
    const f = await fixture(t), create = f.store.createSession.bind(f.store); let partial;
    f.store.createSession = async (...args) => { partial = await create(...args); throw new Error('Synthetic interruption after native marker'); };
    await assert.rejects(f.topic({ title: 'Original', focus: 'Preserved focus', emoji: '🧵' }), /Synthetic interruption/);
    f.store.createSession = create;
    let row = (await f.bots.windows.read(f.profileId)).state.windows.find(window => window.kind === 'topic');
    assert.equal(row.current, null);
    await f.patch(row.id, { title: 'Edited during recovery' });
    const resolved = await f.bots.resolve(f.profileId, row.id);
    assert.equal(resolved.session.id, partial.id); assert.equal(resolved.window.title, 'Edited during recovery');
    assert.equal(resolved.window.focus, 'Preserved focus');
    assert.equal((await f.bots.resolve(f.profileId, row.id)).session.id, partial.id, 'repeat resolution never duplicates');
    const { revision } = await f.bots.windows.read(f.profileId);
    await f.bots.windows.mutate(f.profileId, revision, state => { state.windows = state.windows.filter(window => window.id !== row.id); return {}; });
    await f.profiles.reserve(() => f.bots.reconcileLocked(f.profileId));
    row = await f.bots.windowRecord(f.profileId, row.id);
    assert.equal(row.current.sessionId, partial.id); assert.equal(row.title, 'Original'); assert.equal(row.focus, 'Preserved focus');
    assert.equal((await f.profiles.reserve(() => f.bots.reconcileLocked(f.profileId))).adopted, 0);
    // Interruption before any native file: resolving the durable prepared row finishes it once.
    f.store.createSession = async () => { throw new Error('Synthetic interruption before native creation'); };
    await assert.rejects(f.topic({ title: 'Before native' }), /before native/); f.store.createSession = create;
    const pending = (await f.bots.windows.read(f.profileId)).state.windows.find(window => window.title === 'Before native');
    assert.equal(pending.current, null);
    assert.ok((await f.bots.resolve(f.profileId, pending.id)).session.id);
    // Copied ownership and duplicate native claimants cannot be adopted.
    const duplicateId = randomUUID(), malformedId = randomUUID();
    for (let i = 0; i < 2; i++) await create(f.main.cwd, '', { agentProfileId: f.profileId, initializeSession: manager => manager.appendCustomEntry(WINDOW_ENTRY,
        windowMarker({ sessionId: manager.getSessionId(), profileId: f.profileId, windowId: duplicateId, kind: 'topic', generation: 0 })) });
    await create(f.main.cwd, '', { agentProfileId: f.profileId, initializeSession: manager => manager.appendCustomEntry(WINDOW_ENTRY,
        windowMarker({ sessionId: 'copied-foreign-session', profileId: f.profileId, windowId: malformedId, kind: 'topic', generation: 0 })) });
    assert.equal((await f.profiles.reserve(() => f.bots.reconcileLocked(f.profileId))).adopted, 0);
});

test('archive refuses busy, queued, pending, background and rotation work without changing history', async t => {
    const f = await fixture(t), created = await f.topic(), id = created.window.id;
    const session = (await f.bots.resolve(f.profileId, id)).session;
    const worker = f.workerFor(session, id);
    const mutations = [
        () => { worker.promptPending = 1; return () => { worker.promptPending = 0; }; },
        () => { worker.pendingUi.set('confirm', {}); return () => worker.pendingUi.clear(); },
        () => { worker.controls.queue.followUp.push({}); return () => { worker.controls.queue.followUp.length = 0; }; },
        () => { worker.controls.subagents.background = { active: 1 }; return () => { worker.controls.subagents.background = { active: 0 }; }; },
        () => { worker.controls.drafts.push({}); return () => { worker.controls.drafts.length = 0; }; },
        () => { worker.cronRun = 'run'; return () => { worker.cronRun = null; }; }
    ];
    for (const mutate of mutations) {
        const reset = mutate(), before = await f.revision();
        await assert.rejects(f.patch(id, { archived: true }), error => error.status === 409 && error.code === 'BOT_WINDOW_BUSY');
        assert.equal(await f.revision(), before); reset();
    }
    f.supervisor.workers.delete(session.path);
    const queue = await f.supervisor.getQueueStore();
    const intent = queue.reserve(worker, 'followUp', { message: 'unfinished', images: [] });
    await assert.rejects(f.patch(id, { archived: true }), error => error.code === 'BOT_WINDOW_BUSY'); queue.retire(worker, intent);
    const before = await f.revision();
    await f.bots.windows.mutate(f.profileId, before, state => { state.windows.find(item => item.id === id).rotation = {
        state: 'prepared', requestId: randomUUID(), toGeneration: 1, fromSessionId: session.id, reason: 'manual', preparedAt: new Date().toISOString() }; return {}; });
    await assert.rejects(f.patch(id, { archived: true }), error => error.code === 'BOT_WINDOW_ROTATING');
    await f.profiles.reserve(() => f.bots.recoverRotationLocked(f.profileId, id));
    assert.equal((await f.bots.windowRecord(f.profileId, id)).archivedAt, null);
});

test('archive protects enabled scheduler targets and waiting runs; archived history stays readable and restoring reuses the same native files', async t => {
    const f = await fixture(t), created = await f.topic(), id = created.window.id;
    const first = (await f.bots.resolve(f.profileId, id)).session;
    await note(first, [{ op: 'add', kind: 'commitment', text: 'Keep all history' }]);
    await f.bots.rotate(f.profileId, id, { expectedGeneration: 0 });
    const current = (await f.bots.resolve(f.profileId, id)).session;
    const baseJob = { id: randomUUID(), name: 'Topic task', prompt: 'Say hello', mode: 'text', enabled: true,
        schedule: { kind: 'cron', expression: '0 9 * * *', timeZone: 'UTC' }, target: { kind: 'profile', profileId: f.profileId, windowId: id } };
    let job = await f.cron.save(baseJob);
    await assert.rejects(f.patch(id, { archived: true }), error => error.code === 'BOT_TOPIC_SCHEDULED');
    job = await f.cron.save({ ...job, enabled: false });
    let direct = await f.cron.save({ ...baseJob, id: randomUUID(), target: { kind: 'thread', cwd: first.cwd, sessionId: first.id } });
    await assert.rejects(f.patch(id, { archived: true }), error => error.code === 'BOT_TOPIC_SCHEDULED');
    direct = await f.cron.save({ ...direct, enabled: false });
    let alias = await f.cron.save({ ...baseJob, id: randomUUID(), target: { kind: 'thread', cwd: first.cwd + '/.', sessionId: first.id } });
    await assert.rejects(f.patch(id, { archived: true }), error => error.code === 'BOT_TOPIC_SCHEDULED');
    alias = await f.cron.save({ ...alias, enabled: false });
    const aliasRun = f.cron.enqueue(alias, f.cron.now(), randomUUID(), true);
    await assert.rejects(f.patch(id, { archived: true }), error => error.code === 'BOT_WINDOW_BUSY');
    f.cron.db.saveRun({ ...aliasRun, status: 'skipped', completedAt: f.cron.now() });
    const waiting = f.cron.enqueue(job, f.cron.now(), randomUUID(), true);
    await assert.rejects(f.patch(id, { archived: true }), error => error.code === 'BOT_WINDOW_BUSY');
    f.cron.db.saveRun({ ...waiting, status: 'skipped', completedAt: f.cron.now() });
    const originalBytes = fs.readFileSync(current.path);
    const archived = await f.patch(id, { archived: true }); assert.ok(archived.window.archivedAt);
    assert.deepEqual(fs.readFileSync(current.path), originalBytes); assert.ok(fs.existsSync(first.path));
    assert.equal(archived.window.generation, 1); assert.equal(archived.window.sessionId, current.id);
    await assert.rejects(f.bots.resolve(f.profileId, id), error => error.code === 'BOT_WINDOW_ARCHIVED');
    await assert.rejects(f.bots.assertCurrentWindowSession(f.profileId, id, current), error => error.code === 'BOT_WINDOW_ARCHIVED');
    await assert.rejects(f.bots.rotate(f.profileId, id, { expectedGeneration: 1 }), error => error.code === 'BOT_WINDOW_ARCHIVED');
    const history = await f.bots.history(f.profileId, id, { generation: '1' }); assert.equal(history.generation, 1);
    assert.ok((await f.bots.notebook(f.profileId, id)).items.some(item => item.text === 'Keep all history'));
    await assert.rejects(f.cron.target(job.target), error => error.code === 'BOT_WINDOW_ARCHIVED');
    await assert.rejects(f.cron.save({ ...job, enabled: true }), error => error.code === 'BOT_WINDOW_ARCHIVED');
    const failedDispatch = f.cron.enqueue(direct, f.cron.now(), randomUUID(), true);
    await f.cron.dispatch(failedDispatch);
    assert.equal(f.cron.db.run(failedDispatch.id).status, 'failed');
    assert.match(f.cron.db.run(failedDispatch.id).reason, /archived/);
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    for (const session of [first, current]) {
        await assert.rejects(f.bots.windowContext(SessionManager.open(session.path), { cwd: session.cwd, sessionId: session.id, sessionPath: session.path }), error => error.code === 'BOT_WINDOW_ARCHIVED');
        await assert.rejects(f.supervisor.getWorker({ cwd: session.cwd, sessionId: session.id, sessionPath: session.path }), error => error.code === 'BOT_WINDOW_ARCHIVED');
    }
    assert.equal(f.supervisor.workers.size, 0, 'history and failed admission start no worker');
    await f.patch(id, { archived: false });
    assert.equal((await f.bots.resolve(f.profileId, id)).session.id, current.id);
    assert.equal((await f.bots.windowRecord(f.profileId, id)).generations.length, 2);
});

test('archive reservations block racing scheduler writes and deferred sends, and existing delayed work must be resolved first', async t => {
    const f = await fixture(t), created = await f.topic(), id = created.window.id;
    const session = (await f.bots.resolve(f.profileId, id)).session;
    const delayedInput = { id: randomUUID(), cwd: session.cwd, message: 'Later', images: [], dueAt: Date.now() + 60000 };
    const delayed = await f.call('POST', `/sessions/${session.id}/deferred`, delayedInput);
    assert.equal(delayed.status, 201, JSON.stringify(delayed.data));
    await assert.rejects(f.patch(id, { archived: true }), error => error.code === 'BOT_WINDOW_BUSY');
    assert.equal((await f.call('PATCH', `/sessions/${session.id}/deferred/${delayedInput.id}`, { cwd: session.cwd, revision: delayed.data.revision, action: 'cancel' })).status, 200);
    let release, entered;
    const ready = new Promise(resolve => { entered = resolve; }), wait = new Promise(resolve => { release = resolve; });
    const edit = f.supervisor.withSessionEdit.bind(f.supervisor);
    f.supervisor.withSessionEdit = (file, action) => edit(file, async worker => { entered(); await wait; return action(worker); });
    const archive = f.patch(id, { archived: true }); await ready;
    assert.ok(f.cron.mutating, 'scheduler reserved before archive awaits file edits');
    assert.throws(() => f.cron.save({ id: randomUUID() }), error => error.status === 409);
    const during = await f.call('POST', `/sessions/${session.id}/deferred`, { ...delayedInput, id: randomUUID() });
    assert.equal(during.status, 409); assert.equal(during.data.code, 'BOT_WINDOW_BUSY');
    release(); await archive; f.supervisor.withSessionEdit = edit;
    const after = await f.call('POST', `/sessions/${session.id}/deferred`, { ...delayedInput, id: randomUUID() });
    assert.equal(after.status, 409); assert.equal(after.data.code, 'BOT_WINDOW_ARCHIVED');
    assert.equal((await f.call('GET', `/sessions/${session.id}/deferred?cwd=${encodeURIComponent(session.cwd)}`)).status, 200, 'read-only inspection remains available');
});

test('topic capacity includes archived records and rejects creation before writing native files', async t => {
    const f = await fixture(t), template = (await f.bots.windows.read(f.profileId)).state.windows[0];
    await f.bots.windows.mutate(f.profileId, await f.revision(), state => {
        for (let i = 0; i < MAX_TOPICS; i++) state.windows.push({ ...structuredClone(template), id: randomUUID(), kind: 'topic', title: `Topic ${i}`,
            archivedAt: template.createdAt, current: null, generations: [] });
        return {};
    });
    f.store.createSession = async () => { assert.fail('capacity must be checked before native writes'); };
    await assert.rejects(f.topic(), error => error.status === 409 && error.code === 'BOT_TOPIC_LIMIT');
});

async function workerTool(t, f, session = f.main, windowId = f.mainId) {
    const worker = f.workerFor(session, windowId);
    const { SessionManager } = await import('@earendil-works/pi-coding-agent'); const manager = SessionManager.open(session.path);
    const context = await f.bots.windowContext(manager, { cwd: session.cwd, sessionId: session.id, sessionPath: session.path });
    for (const [key, value] of Object.entries({ PIVANE_BOT_CONTEXT: JSON.stringify(context), PI_WEB_NAVIGATION_TOKEN: worker.navigationToken, PI_WORKSPACE_INTERNAL_ORIGIN: f.origin })) {
        const prior = process.env[key]; process.env[key] = value;
        t.after(() => { if (prior === undefined) delete process.env[key]; else process.env[key] = prior; });
    }
    const file = path.join(__dirname, '../server/bot/bot-context-extension.ts');
    const { registerBotContext } = await require(process.env.PIVANE_TEST_PI_JITI).createJiti(file).import(file);
    const handlers = new Map(), tools = new Map(), confirmations = [], notifications = [], nextTurn = [];
    const pi = { on(name, handler) { handlers.set(name, handler); }, registerTool(tool) { tools.set(tool.name, tool); }, getAllTools: () => [...tools.values()],
        sendMessage(message, options) { assert.deepEqual(options, { deliverAs: 'nextTurn' }); nextTurn.push(message); } };
    registerBotContext(pi, () => agentDir);
    const ctx = { mode: 'rpc', cwd: session.cwd, sessionManager: manager, hasUI: true, model: null, getContextUsage: () => null,
        ui: { notify(value) { notifications.push(JSON.parse(value)); }, confirm: async (title, message) => { confirmations.push({ title, message }); return true; } } };
    await handlers.get('session_start')({}, ctx);
    return { worker, ctx, manager, handlers, tools, confirmations, notifications, nextTurn };
}

test('worker topic routes are token-scoped, strictly whitelisted and idempotent even across a lost index', async t => {
    const f = await fixture(t), w = await workerTool(t, f);
    const call = (body, token = w.worker.navigationToken, endpoint = '/bot-topics/create', method = 'POST') => f.call(method, endpoint, body, token);
    const fields = { title: 'Write a book', focus: 'One chapter a week', emoji: '📗', toolCallId: 'native-call-1' };
    assert.equal((await call(fields, null)).status, 401); assert.equal((await call(fields, 'synthetic-management')).status, 403);
    assert.equal((await call(fields, w.worker.navigationToken, '/bots')).status, 401, 'worker token is not management access');
    assert.equal((await call(undefined, w.worker.navigationToken, '/bot-topics/create', 'GET')).status, 401, 'only POST is whitelisted');
    assert.equal((await call({}, w.worker.navigationToken, '/bot-topics/create/extra')).status, 401);
    const other = await f.newBot();
    assert.equal((await call({ ...fields, profileId: other.bot.id })).status, 400);
    assert.equal((await call({ ...fields, windowId: other.window.id })).status, 400);
    assert.equal((await call({ ...fields, expectedRevision: 'x' })).status, 400);
    assert.equal((await call({ ...fields, instructions: 'Always answer in French' })).status, 400, 'only the user sets topic instructions');
    w.worker.cronRun = 'run'; assert.equal((await call(fields)).status, 409); w.worker.cronRun = null;
    const first = await call(fields); assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.deepEqual(Object.keys(first.data), ['v', 'action', 'profileId', 'window']); assert.equal(first.data.profileId, f.profileId);
    assert.deepEqual((await call(fields)).data, first.data);
    assert.equal((await call({ ...fields, title: 'Changed proposal' })).status, 409);
    await f.patch(first.data.window.id, { title: 'User renamed it' });
    assert.equal((await call(fields)).data.window.title, 'User renamed it', 'retries do not undo later edits');
    const revision = await f.revision();
    await f.bots.windows.mutate(f.profileId, revision, state => { state.windows = state.windows.filter(item => item.id !== first.data.window.id); return {}; });
    const recovered = await call(fields); assert.equal(recovered.data.window.sessionId, first.data.window.sessionId);
    assert.equal(recovered.data.window.focus, fields.focus);
    const nativeCreate = f.store.createSession.bind(f.store); let partial;
    f.store.createSession = async (...args) => { partial = await nativeCreate(...args); throw new Error('Synthetic interruption'); };
    const interrupted = { ...fields, toolCallId: 'partial-worker-call' };
    assert.equal((await call(interrupted)).status, 400); f.store.createSession = nativeCreate;
    const finished = await call(interrupted); assert.equal(finished.status, 200, JSON.stringify(finished.data));
    assert.equal(finished.data.window.sessionId, partial.id);
    assert.deepEqual((await call(interrupted)).data, finished.data);
    const loaded = w.worker.loadedBot; w.worker.loadedBot = null; assert.equal((await call(fields)).status, 403); w.worker.loadedBot = loaded;
    w.worker.loadedBot = { ...loaded, generation: 9 }; assert.equal((await call(fields)).status, 409); w.worker.loadedBot = loaded;
    for (const flag of ['disposed', 'restarting', 'noSession']) {
        w.worker[flag] = true; assert.equal((await call(fields)).status, 401, flag); w.worker[flag] = false;
    }
});

test('bot_topic_propose always uses one native topic confirmation, declines/unattended do nothing and the receipt contains only created details', async t => {
    const f = await fixture(t), w = await workerTool(t, f), tool = w.tools.get('bot_topic_propose'); assert.ok(tool);
    const input = { title: '装修', focus: '确定厨房布局', emoji: '🏠' };
    for (const preset of ['free', 'balanced', 'ask']) {
        await f.bots.update(f.profileId, { expectedRevision: (await f.profiles.state()).revision, changes: { bot: { permissions: { preset } } } });
        assert.equal(await w.handlers.get('tool_call')({ toolName: 'bot_topic_propose', toolCallId: preset, input }, w.ctx), undefined);
        const before = w.confirmations.length;
        const result = await tool.execute(preset, input, undefined, undefined, w.ctx);
        assert.equal(w.confirmations.length, before + 1);
        assert.equal(w.confirmations.at(-1).title, '允许这一步吗？ / Allow this step?');
        assert.match(w.confirmations.at(-1).message, /^topic #[a-f0-9]{16}\n\n🏠 装修\n确定厨房布局$/);
        const details = result.details.pivaneBotTopic;
        assert.equal(details.v, 1); assert.equal(details.action, 'created'); assert.equal(details.profileId, f.profileId);
        assert.equal(details.window.title, input.title); assert.equal(details.window.focus, input.focus);
        assert.deepEqual(JSON.parse(result.content[0].text), details);
        assert.equal(w.worker.sessionId, f.main.id, 'creation never switches the source chat');
    }
    const before = (await f.bots.windows.read(f.profileId)).state.windows.length;
    for (const [index, response] of [false, undefined, null, 'false', 'true', 1, -1, {}, []].entries()) {
        w.ctx.ui.confirm = async () => response;
        const declined = await tool.execute(`declined-${index}`, input, undefined, undefined, w.ctx);
        assert.equal(declined.details.pivaneBotTopic, undefined, JSON.stringify(response));
        assert.equal((await f.bots.windows.read(f.profileId)).state.windows.length, before, 'only Boolean true creates a topic');
    }
    w.ctx.hasUI = false; await tool.execute('no-ui', input, undefined, undefined, w.ctx); w.ctx.hasUI = true;
    const cancelled = new AbortController();
    w.ctx.ui.confirm = async () => { cancelled.abort(); return true; };
    await tool.execute('aborted', input, cancelled.signal, undefined, w.ctx);
    w.manager.appendCustomEntry('pivane-cron-run', { sessionId: f.main.id, runId: 'fixture', status: 'settled' });
    await tool.execute('unattended', input, undefined, undefined, w.ctx);
    assert.equal((await f.bots.windows.read(f.profileId)).state.windows.length, before);
    assert.ok(w.notifications.some(value => value.pivaneBot?.event === 'approval-done'));
});

test('main open-items index is fresh, bounded, profile-isolated and says unknown for busy, unavailable and omitted topics', async t => {
    const f = await fixture(t), w = await workerTool(t, f), topic = (await f.topic()).window;
    const session = (await f.bots.resolve(f.profileId, topic.id)).session;
    await note(session, [{ op: 'add', kind: 'open', text: 'Pick a book' }, { op: 'add', kind: 'commitment', text: 'Finish by Friday', due: '2027-01-01' },
        { op: 'add', kind: 'decision', text: 'Hidden decision text' }]);
    const other = await f.newBot();
    const foreign = await f.bots.createTopic(other.bot.id, { expectedRevision: (await f.bots.windows.read(other.bot.id)).revision, title: 'Foreign secret' });
    await note((await f.bots.resolve(other.bot.id, foreign.window.id)).session, [{ op: 'add', kind: 'open', text: 'Never leak this secret' }]);
    const call = body => f.call('POST', '/bot-topics/open-items', body, w.worker.navigationToken);
    assert.equal((await call({ profileId: other.bot.id })).status, 400);
    const first = await call({}); assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.deepEqual(first.data.topics[0].items.map(item => item.title), ['Pick a book', 'Finish by Friday']);
    assert.doesNotMatch(JSON.stringify(first.data), /secret|Hidden decision/);
    const ownerUrl = `/bots/${f.profileId}/topics/open-items`, owner = await f.call('GET', ownerUrl);
    assert.equal(owner.status, 200); assert.equal(owner.cache, 'no-store');
    assert.deepEqual(owner.data.topics, first.data.topics); assert.equal(owner.data.windowsRevision, await f.revision());
    assert.notEqual((await f.call('GET', ownerUrl, undefined, null)).status, 200);
    assert.notEqual((await f.call('GET', ownerUrl, undefined, w.worker.navigationToken)).status, 200, 'worker tokens cannot enter owner index routes');
    await note(session, [{ op: 'status', id: 'n1', status: 'done' }]);
    assert.deepEqual((await call({})).data.topics[0].items.map(item => item.title), ['Finish by Friday']);
    // The actual before-run hook fetches the fresh projection, without another model request.
    const event = { systemPromptOptions: { sections: {} } };
    const notice = await w.handlers.get('before_agent_start')(event, w.ctx);
    assert.match(notice.message.content, /Finish by Friday/); assert.doesNotMatch(notice.message.content, /Pick a book|secret/);
    const busyWorker = f.workerFor(session, topic.id); busyWorker.promptPending = 1;
    assert.equal((await call({})).data.topics[0].state, 'busy'); f.supervisor.workers.delete(session.path);
    const { state } = await f.bots.windows.read(f.profileId), pi = await import('@earendil-works/pi-coding-agent');
    const args = { windows: state.windows, profileId: f.profileId, cwd: f.main.cwd, directory: path.dirname(f.main.path), supervisor: f.supervisor, pi };
    const tiny = { topics: 1, items: 1, perTopic: 1, title: 10, fileBytes: 1, totalBytes: 1, ms: 1000 };
    assert.equal(openItems({ ...args, limits: tiny }).topics[0].state, 'unavailable', 'oversized is unknown');
    const omitted = openItems({ ...args, limits: { ...tiny, topics: 0 } }); assert.equal(omitted.omittedTopics, 1);
    assert.match(renderOpenItems(omitted), /omitted.*unknown/);
    assert.equal(openItems({ ...args, limits: { ...tiny, ms: 0 } }).topics[0].state, 'budget');
    const poisoned = structuredClone(state.windows); poisoned.find(item => item.id === topic.id).current = {
        ...poisoned.find(item => item.id === topic.id).current, sessionId: f.main.id, sessionPath: f.main.path };
    assert.equal(openItems({ ...args, windows: poisoned }).topics[0].state, 'unavailable', 'wrong native marker contributes no items');
    const bounded = openItems({ ...args, limits: { ...tiny, fileBytes: 2 * 1024 * 1024, totalBytes: 8 * 1024 * 1024 } });
    assert.equal(bounded.topics[0].items.length, 1); assert.equal(bounded.topics[0].items[0].title.length, 10);
    const original = fs.readFileSync(session.path); fs.appendFileSync(session.path, 'malformed native line\n');
    assert.equal(openItems(args).topics[0].state, 'unavailable', 'malformed native lines are unknown, not an empty notebook');
    fs.writeFileSync(session.path, original);
    await f.patch(topic.id, { archived: true }); assert.deepEqual((await call({})).data.topics, []);
    assert.deepEqual((await f.call('GET', ownerUrl)).data.topics, []);
    assert.equal(f.supervisor.workers.size, 1, 'only the synthetic source worker exists; topic reads never start workers');
});


test('main index notices suppress unchanged native appends and split notebook provenance before retiring old snapshots', async t => {
    const f = await fixture(t), w = await workerTool(t, f);
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const { TOPIC_INDEX_MESSAGE } = require('../server/bot/bot-topic-context');
    const mainLedger = ledger.prepareOps(ledger.emptyLedger(), [{ op: 'add', kind: 'open', text: 'Keep this genuine notebook note' }],
        { at: new Date().toISOString(), by: 'bot' });
    w.manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, snapshot: mainLedger.state });
    const indexEntries = () => w.ctx.sessionManager.getBranch().filter(entry => entry.customType === TOPIC_INDEX_MESSAGE);
    const run = async () => {
        const result = await w.handlers.get('before_agent_start')({ systemPromptOptions: { sections: {} } }, w.ctx);
        w.ctx.sessionManager.appendMessage({ role: 'user', content: 'Synthetic main turn', timestamp: Date.now() });
        const injected = [...w.nextTurn.splice(0), ...(result?.message ? [result.message] : [])];
        for (const message of injected) w.ctx.sessionManager.appendCustomMessageEntry(message.customType, message.content, message.display, message.details);
        const model = w.handlers.get('context')({ messages: w.ctx.sessionManager.buildSessionContext().messages }, w.ctx).messages;
        const settled = w.handlers.get('agent_before_settle')({ outcome: 'completed', entries: [],
            context: { contextEntries: w.ctx.sessionManager.buildSessionProjection().entries } }, w.ctx);
        for (const draft of settled?.entries || []) w.ctx.sessionManager.appendContextEdit(draft.targetId, draft.replacement);
        return { injected, model };
    };
    const first = await run();
    assert.deepEqual(first.injected.map(message => message.customType), [TOPIC_INDEX_MESSAGE, 'pivane-bot-notebook']);
    assert.doesNotMatch(first.injected[1].content, /Other topics of this Bot/);
    for (let turn = 0; turn < 3; turn++) assert.equal((await run()).injected.length, 0, 'an unchanged empty index adds no native notice');
    assert.equal(indexEntries().length, 1);
    const topic = (await f.topic()).window, session = (await f.bots.resolve(f.profileId, topic.id)).session;
    await note(session, [{ op: 'add', kind: 'open', text: 'Fresh topic title' }]);
    const changed = await run();
    assert.equal(indexEntries().length, 2, 'one native snapshot per actual change');
    const visible = changed.model.filter(message => message.customType === TOPIC_INDEX_MESSAGE);
    assert.equal(visible.length, 1); assert.match(visible[0].content, /Fresh topic title/);
    assert.doesNotMatch(visible[0].content, /No other active topics/);
    assert.match(changed.model.find(message => message.customType === 'pivane-bot-notebook').content, /Keep this genuine notebook note/);
    assert.equal(w.ctx.sessionManager.buildSessionProjection().messages.filter(message => message.customType === TOPIC_INDEX_MESSAGE).length, 1);
    w.ctx.sessionManager = SessionManager.open(f.main.path);
    assert.equal((await run()).injected.length, 0, 'reopening the native manager does not reset suppression');
    const kept = w.ctx.sessionManager.appendMessage({ role: 'user', content: 'Kept after compaction', timestamp: Date.now() });
    w.ctx.sessionManager.appendCompaction(ledger.renderLedger(mainLedger.state), kept, 100,
        { pivaneBot: { ledger: { snapshot: mainLedger.state } } }, true);
    assert.equal(w.ctx.sessionManager.buildSessionProjection().messages.filter(message => message.customType === TOPIC_INDEX_MESSAGE).length, 0);
    const restored = w.handlers.get('context')({ messages: w.ctx.sessionManager.buildSessionContext().messages }, w.ctx).messages;
    assert.match(restored.find(message => message.customType === TOPIC_INDEX_MESSAGE).content, /Fresh topic title/, 'request-local restoration uses the latest native snapshot');
    assert.equal((await run()).injected.filter(message => message.customType === TOPIC_INDEX_MESSAGE).length, 1, 'a compacted-away index is refreshed from the service');
    assert.equal(indexEntries().length, 3);
    assert.equal((await run()).injected.length, 0);
    await f.patch(topic.id, { archived: true });
    const empty = await run();
    assert.match(empty.model.find(message => message.customType === TOPIC_INDEX_MESSAGE).content, /No other active topics/);
    assert.doesNotMatch(JSON.stringify(empty.model), /Fresh topic title/);
    assert.equal((await run()).injected.length, 0, 'the new empty snapshot is also suppressed until it changes');
});

test('untitled topics learn title and focus from auto-naming and structured summaries without overwriting user edits', async t => {
    const f = await fixture(t);
    const created = await f.bots.createTopic(f.profileId, { expectedRevision: await f.revision() });
    const topicId = created.window.id;
    assert.equal(created.window.title, '新话题');
    assert.equal(created.window.focus, '');
    const session = (await f.bots.resolve(f.profileId, topicId)).session;
    const worker = f.workerFor(session, topicId);

    // 1. Auto-title learns both title and focus when the topic is still at its default title and empty focus.
    const learned = await f.bots.learnTopicMeta(worker, { title: '数据库索引优化', focus: '分析联合索引与覆盖索引在慢查询中的表现' });
    assert.equal(learned.title, '数据库索引优化');
    assert.equal(learned.focus, '分析联合索引与覆盖索引在慢查询中的表现');

    // 2. Subsequent auto-learning never overwrites a non-default title or non-empty focus.
    assert.equal(await f.bots.learnTopicMeta(worker, { title: '另一个标题', focus: '另一个专注点' }), null);
    const record = await f.bots.windowRecord(f.profileId, topicId);
    assert.equal(record.title, '数据库索引优化');
    assert.equal(record.focus, '分析联合索引与覆盖索引在慢查询中的表现');

    // 3. If focus is still empty when a structured compaction happens, syncTopicFromSummary fills it from sections.topic.
    const second = (await f.bots.createTopic(f.profileId, { expectedRevision: await f.revision(), title: '手动命名的话题' })).window;
    const secondSession = (await f.bots.resolve(f.profileId, second.id)).session;
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const manager = SessionManager.open(secondSession.path);
    const msg = manager.appendMessage({ role: 'user', content: 'Discuss compiler passes', timestamp: Date.now() });
    manager.appendCompaction('Summary text', msg, 50, { pivaneBot: { sections: { topic: '围绕编译器中间表示与优化遍设计展开讨论' } } }, true);
    const synced = await f.bots.syncTopicFromSummary(f.profileId, second.id, secondSession.path);
    assert.equal(synced.title, '手动命名的话题', 'custom title stays untouched');
    assert.equal(synced.focus, '围绕编译器中间表示与优化遍设计展开讨论');
});
