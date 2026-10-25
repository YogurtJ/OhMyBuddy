const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-rotation-test-')));
const agentDir = path.join(root, 'agent');
fs.mkdirSync(agentDir, { recursive: true });
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_PROJECT_ROOTS = root;
process.env.PI_OFFLINE = '1';
const { PiSessionStore } = require('../server/pi-session-store');
const { PiProfileRegistry } = require('../server/pi-profile-registry');
const { PiAgentSupervisor } = require('../server/pi-agent-supervisor');
const { BotService } = require('../server/bot/bot-service');
const { WINDOW_ENTRY, windowMarker, readWindowBinding } = require('../server/bot/bot-window-state');
const { HANDOFF_MESSAGE } = require('../server/bot/bot-handoff');

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

function services() {
    const store = new PiSessionStore();
    const profiles = new PiProfileRegistry(store);
    store.profiles = profiles;
    const supervisor = new PiAgentSupervisor();
    const bots = new BotService({ store, profiles, supervisor });
    return { store, profiles, supervisor, bots };
}

function talk(file, turns, prefix) {
    return import('@earendil-works/pi-coding-agent').then(({ SessionManager }) => {
        const manager = SessionManager.open(file);
        for (let index = 0; index < turns; index++) {
            manager.appendMessage({ role: 'user', content: `${prefix} question ${index}`, timestamp: Date.now() });
            manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: `${prefix} answer ${index}` }], api: 'openai-completions',
                provider: 'fixture', model: 'small', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: Date.now() });
        }
        return manager.getLeafId();
    });
}

test('windows rotate to new native generations with continuity, journal recovery and no replay', { timeout: 60000 }, async t => {
    const { profiles, supervisor, bots, store } = services();
    t.after(() => supervisor.dispose());
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const botId = created.bot.id, windowId = created.window.id;
    let resolved = await bots.resolve(botId, windowId);
    const firstPath = resolved.session.path;
    const leaf = await talk(firstPath, 3, 'gen0');
    const manager0 = SessionManager.open(firstPath);
    manager0.appendModelChange('fixture', 'small');
    manager0.appendThinkingLevelChange('low');
    const leafAfterModel = manager0.getLeafId();
    assert.notEqual(leaf, leafAfterModel);

    const rotated = await bots.rotate(botId, windowId, { expectedGeneration: 0 });
    assert.equal(rotated.window.generation, 1);
    assert.equal(rotated.window.generations, 2);
    assert.notEqual(rotated.session.id, resolved.session.id);
    const next = SessionManager.open(rotated.session.path);
    const binding = readWindowBinding(next);
    assert.deepEqual(binding.predecessor, { sessionId: resolved.session.id, lastEntryId: leafAfterModel });
    assert.equal(binding.generation, 1); assert.equal(binding.windowId, windowId);
    const handoff = next.getEntries().find(entry => entry.type === 'custom_message' && entry.customType === HANDOFF_MESSAGE);
    assert.match(handoff.content, /gen0 question 2/); assert.match(handoff.content, /gen0 answer 0/);
    assert.equal(handoff.display, false);
    const context = next.buildSessionContext();
    assert.deepEqual(context.model, { provider: 'fixture', modelId: 'small' });
    assert.equal(context.thinkingLevel, 'low');
    assert.ok(context.messages.some(message => JSON.stringify(message).includes('gen0 answer 2')), 'handoff reaches model context');
    // The window marker is the last initial entry: its presence proves the seed was written.
    assert.equal(next.getEntries().at(-1).customType, WINDOW_ENTRY);
    // The predecessor file is untouched by rotation.
    assert.equal(SessionManager.open(firstPath).getLeafId(), leafAfterModel);

    await assert.rejects(bots.rotate(botId, windowId, { expectedGeneration: 0 }), /changed/);
    resolved = await bots.resolve(botId, windowId);
    assert.equal(resolved.session.id, rotated.session.id);

    // Ten consecutive rotations keep an ordered, closed chain.
    for (let generation = 1; generation <= 10; generation++) {
        await talk((await bots.resolve(botId, windowId)).session.path, 1, `gen${generation}`);
        await bots.rotate(botId, windowId, { expectedGeneration: generation });
    }
    const { state } = await bots.windows.read(botId);
    const window = state.windows[0];
    assert.equal(window.current.generation, 11);
    assert.equal(window.generations.length, 12);
    assert.ok(window.generations.slice(0, -1).every(item => item.endedAt));
    const last = SessionManager.open(window.current.sessionPath);
    assert.equal(readWindowBinding(last).predecessor.sessionId, window.generations[10].sessionId);
    // Continuity carries the most recent turns, not the whole history.
    const lastHandoff = last.getEntries().find(entry => entry.customType === HANDOFF_MESSAGE).content;
    assert.match(lastHandoff, /gen10 answer 0/);
    assert.ok(lastHandoff.length < 40000);

    // The caller's observed generation is required; a missing or stale one changes nothing.
    const indexBefore = JSON.stringify((await bots.windows.read(botId)).state);
    for (const input of [{}, { expectedGeneration: null }, { expectedGeneration: -1 }, { expectedGeneration: '11' }])
        await assert.rejects(bots.rotate(botId, windowId, input), /Expected generation is required/);
    await assert.rejects(bots.rotate(botId, windowId, { expectedGeneration: 10 }), /changed/);
    assert.equal(JSON.stringify((await bots.windows.read(botId)).state), indexBefore);
    // Bot-mode admission: only the current generation may be opened as this window.
    const currentSession = (await bots.resolve(botId, windowId)).session;
    const old = window.generations[5];
    await assert.rejects(bots.assertCurrentWindowSession(botId, windowId, { id: old.sessionId, path: old.sessionPath }), error => error.code === 'BOT_WINDOW_STALE');
    await bots.assertCurrentWindowSession(botId, windowId, { id: currentSession.id, path: currentSession.path });

    // Interrupted rotation without a successor: the journal is cleared, routing unchanged.
    const before = await bots.windows.read(botId);
    await bots.windows.mutate(botId, before.revision, s => { s.windows[0].rotation = { state: 'prepared', requestId: randomUUID(), toGeneration: 12,
        fromSessionId: s.windows[0].current.sessionId, reason: 'size', preparedAt: new Date().toISOString() }; return {}; });
    assert.deepEqual(await profiles.reserve(() => bots.recoverRotationLocked(botId, windowId)), { recovered: true, committed: false });
    assert.equal((await bots.windows.read(botId)).state.windows[0].rotation, null);
    assert.equal((await bots.resolve(botId, windowId)).session.id, window.current.sessionId);

    // Interrupted after the successor was fully written: recovery adopts it.
    const currentPath = (await bots.resolve(botId, windowId)).session.path;
    const currentLeaf = SessionManager.open(currentPath).getLeafId();
    const journal = await bots.windows.read(botId);
    await bots.windows.mutate(botId, journal.revision, s => { s.windows[0].rotation = { state: 'prepared', requestId: randomUUID(), toGeneration: 12,
        fromSessionId: s.windows[0].current.sessionId, reason: 'size', preparedAt: new Date().toISOString() }; return {}; });
    const successor = await store.createSession(window.cwd, '', { agentProfileId: botId, initializeSession: manager =>
        manager.appendCustomEntry(WINDOW_ENTRY, windowMarker({ sessionId: manager.getSessionId(), profileId: botId, windowId, kind: 'main', generation: 12,
            predecessor: { sessionId: window.current.sessionId, lastEntryId: currentLeaf } })) });
    // While another edit holds the predecessor (no worker), opening waits: the window is moving.
    supervisor.withSessionEdit = async () => { throw Object.assign(new Error('editing'), { status: 409 }); };
    await assert.rejects(bots.resolve(botId, windowId), error => error.status === 409 && error.code === 'BOT_WINDOW_ROTATING');
    assert.ok((await bots.windows.read(botId)).state.windows[0].rotation, 'the journal waits for a later open');
    // A busy predecessor stays the conversation: the journal is cleared, the successor is not adopted.
    supervisor.getActiveWorker = () => ({ busy: true });
    assert.equal((await bots.resolve(botId, windowId)).session.id, window.current.sessionId);
    assert.equal((await bots.windows.read(botId)).state.windows[0].rotation, null);
    delete supervisor.withSessionEdit; delete supervisor.getActiveWorker;
    const rearmed = await bots.windows.read(botId);
    await bots.windows.mutate(botId, rearmed.revision, s => { s.windows[0].rotation = { state: 'prepared', requestId: randomUUID(), toGeneration: 12,
        fromSessionId: s.windows[0].current.sessionId, reason: 'size', preparedAt: new Date().toISOString() }; return {}; });
    const events = [];
    bots.on('windowRotated', event => events.push(event));
    // Nothing but the ordinary open path: it settles the journal before handing out a session.
    const reopened = new BotService({ store, profiles, supervisor });
    reopened.on('windowRotated', event => events.push(event));
    assert.equal((await reopened.resolve(botId, windowId)).session.id, successor.id);
    assert.equal((await bots.windows.read(botId)).state.windows[0].rotation, null);
    assert.equal(events.length, 1); assert.equal(events[0].to.generation, 12);

    // A successor written before the predecessor advanced is not adopted (that turn would be lost).
    const adoptedPath = (await bots.resolve(botId, windowId)).session.path;
    const staleLeaf = SessionManager.open(adoptedPath).getLeafId();
    const journal2 = await bots.windows.read(botId);
    await bots.windows.mutate(botId, journal2.revision, s => { s.windows[0].rotation = { state: 'prepared', requestId: randomUUID(), toGeneration: 13,
        fromSessionId: s.windows[0].current.sessionId, reason: 'size', preparedAt: new Date().toISOString() }; return {}; });
    await store.createSession(window.cwd, '', { agentProfileId: botId, initializeSession: manager =>
        manager.appendCustomEntry(WINDOW_ENTRY, windowMarker({ sessionId: manager.getSessionId(), profileId: botId, windowId, kind: 'main', generation: 13,
            predecessor: { sessionId: successor.id, lastEntryId: staleLeaf } })) });
    await talk(adoptedPath, 1, 'late');
    assert.deepEqual(await profiles.reserve(() => bots.recoverRotationLocked(botId, windowId)), { recovered: true, committed: false });
    assert.equal((await bots.resolve(botId, windowId)).session.id, successor.id);
    // A successor whose seed was cut off before its window marker is never adopted either.
    const journal3 = await bots.windows.read(botId);
    await bots.windows.mutate(botId, journal3.revision, s => { s.windows[0].rotation = { state: 'prepared', requestId: randomUUID(), toGeneration: 13,
        fromSessionId: s.windows[0].current.sessionId, reason: 'size', preparedAt: new Date().toISOString() }; return {}; });
    await store.createSession(window.cwd, '', { agentProfileId: botId, initializeSession: manager =>
        manager.appendCustomMessageEntry(HANDOFF_MESSAGE, 'partial seed', false, { version: 1, fromSessionId: successor.id, fromGeneration: 12 }) });
    assert.deepEqual(await profiles.reserve(() => bots.recoverRotationLocked(botId, windowId)), { recovered: true, committed: false });
    assert.equal((await bots.resolve(botId, windowId)).session.id, successor.id);
    // The next real rotation proceeds normally after the abandoned attempt.
    const after = await bots.rotate(botId, windowId, { expectedGeneration: 12 });
    assert.equal(after.window.generation, 13);
    assert.match(SessionManager.open(after.session.path).getEntries().find(entry => entry.customType === HANDOFF_MESSAGE).content, /late answer 0/);
});

test('Bot window workers get a verified identity section that follows edits without a restart', { timeout: 60000 }, async t => {
    const { profiles, supervisor, bots } = services();
    t.after(() => supervisor.dispose());
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const botId = created.bot.id, windowId = created.window.id;
    const { session } = await bots.resolve(botId, windowId);
    await talk(session.path, 1, 'hello');
    const manager = SessionManager.open(session.path);
    const env = { cwd: session.cwd, sessionId: session.id, sessionPath: session.path };
    const context = await bots.windowContext(manager, env);
    assert.deepEqual(context, { version: 1, profileId: botId, windowId, ...env });
    assert.equal(await bots.windowContext(manager, { ...env, sessionPath: session.path + '.other' }), null);
    // Ordinary sessions never become Bot windows.
    const plain = await services().store.createSession(session.cwd, '');
    assert.equal(await bots.windowContext(SessionManager.open(plain.path), { cwd: session.cwd, sessionId: plain.id, sessionPath: plain.path }), null);

    const jitiPath = process.env.PIVANE_TEST_PI_JITI;
    if (!jitiPath) return;
    const file = path.join(__dirname, '../server/bot/bot-context-extension.ts');
    const { botSection, registerBotContext, alignModel, BOT_SECTION } = require(jitiPath).createJiti(file)(file);
    const prior = { context: process.env.PIVANE_BOT_CONTEXT, token: process.env.PI_WEB_NAVIGATION_TOKEN };
    t.after(() => {
        for (const [key, name] of [['context', 'PIVANE_BOT_CONTEXT'], ['token', 'PI_WEB_NAVIGATION_TOKEN']])
            if (prior[key] === undefined) delete process.env[name]; else process.env[name] = prior[key];
    });
    process.env.PIVANE_BOT_CONTEXT = JSON.stringify(context);
    process.env.PI_WEB_NAVIGATION_TOKEN = 'synthetic-navigation';
    const handlers = new Map(), notices = [], calls = [];
    const models = { 'fixture/small': { provider: 'fixture', id: 'small' }, 'fixture/big': { provider: 'fixture', id: 'big' },
        'nokey/x': { provider: 'nokey', id: 'x' } };
    let thinking = 'medium';
    const pi = { on(name, fn) { handlers.set(name, fn); }, registerTool() {},
        async setModel(model) { calls.push(['model', model.id]); if (model.provider === 'nokey') return false; ctx.model = model; return true; },
        getThinkingLevel: () => thinking, setThinkingLevel(level) { calls.push(['thinking', level]); thinking = level; } };
    registerBotContext(pi, () => agentDir);
    const ctx = { mode: 'rpc', cwd: session.cwd, sessionManager: manager, model: models['fixture/small'],
        modelRegistry: { find: (provider, id) => models[`${provider}/${id}`] }, ui: { notify: text => notices.push(JSON.parse(text)) } };
    await handlers.get('session_start')({}, ctx);
    assert.deepEqual(notices[0], { pivaneBot: { event: 'loaded', profileId: botId, windowId, generation: 0 }, sessionId: session.id });
    assert.deepEqual(calls, [], 'no model is chosen for the Bot: the session keeps its model');
    const run = async () => {
        const event = { systemPromptOptions: { sections: { assistant_profile_soul: 'stale personality' } } };
        await handlers.get('before_agent_start')(event, ctx);
        return event.systemPromptOptions.sections;
    };
    let sections = await run();
    assert.match(sections[BOT_SECTION], /You are 新伙伴|You are New buddy/);
    assert.match(sections[BOT_SECTION], /main chat/);
    assert.match(sections[BOT_SECTION], /Hands-off mode/);
    assert.match(sections[BOT_SECTION], /Never read, reveal or send passwords/);
    assert.equal(sections.assistant_profile_soul, undefined, 'an empty personality removes the stale one');
    await bots.update(botId, { expectedRevision: (await profiles.state()).revision, changes: { name: 'Momo', soul: 'Warm and playful.',
        bot: { job: 'Plan my week', permissions: { preset: 'ask' }, model: { provider: 'fixture', id: 'big', thinking: 'high' } } } });
    sections = await run();
    assert.deepEqual(calls, [['model', 'big'], ['thinking', 'high']], 'the Bot model applies to this run');
    await run();
    assert.equal(calls.length, 2, 'an aligned model writes nothing');
    // A scheduled run was priced with the model it selected; the Bot model does not replace it.
    const runId = 'a'.repeat(64);
    manager.appendCustomEntry('pivane-cron-run', { version: 1, runId, sessionId: manager.getSessionId(), status: 'running', model: { provider: 'fixture', modelId: 'small' } });
    ctx.model = models['fixture/small']; thinking = 'low';
    await run();
    assert.equal(calls.length, 2, 'no alignment during a scheduled run');
    assert.equal(ctx.model.id, 'small'); assert.equal(thinking, 'low');
    manager.appendCustomEntry('pivane-cron-run', { version: 1, runId, sessionId: manager.getSessionId(), status: 'settled' });
    await run();
    assert.equal(calls.length, 2, 'a settled run is still active until it is finished or reviewed');
    manager.appendCustomEntry('pivane-cron-run', { version: 1, runId, sessionId: manager.getSessionId(), status: 'completed' });
    await run();
    assert.deepEqual(calls.slice(2), [['model', 'big'], ['thinking', 'high']], 'alignment resumes once the run is over');
    assert.match(sections[BOT_SECTION], /You are Momo, .* Your main job: Plan my week/);
    assert.match(sections[BOT_SECTION], /Ask-every-time mode[^]*approval card/);
    assert.equal(sections.assistant_profile_soul, 'Warm and playful.');
    // Careful presets: the worker asks on one approval confirm before a gated step runs.
    const { APPROVAL_TITLE } = require('../server/bot/bot-guard');
    const asked = []; let answer = true;
    Object.assign(ctx, { hasUI: true, signal: undefined });
    ctx.ui.confirm = async (title, message, options) => { asked.push([title, message, options.timeout]); return answer; };
    const call = (toolName, input) => handlers.get('tool_call')({ type: 'tool_call', toolCallId: `t${asked.length}`, toolName, input }, ctx);
    assert.equal(await call('read', { path: 'notes.md' }), undefined);
    assert.equal(await call('web_search', { query: 'weather' }), undefined);
    assert.deepEqual(asked, [], 'reading needs no approval');
    assert.equal(await call('bash', { command: 'ls -la' }), undefined, 'an approved command runs');
    assert.deepEqual(asked.at(-1), [APPROVAL_TITLE, 'command\n\nls -la', 30 * 60 * 1000]);
    assert.equal(await call('write', { path: 'plan.md', content: 'x' }), undefined);
    assert.equal(asked.at(-1)[1], 'write\n\nplan.md', 'Ask every time: even workspace writes ask');
    answer = false;
    const blocked = await call('memory_add', { content: 'Prefers short replies' });
    assert.equal(asked.at(-1)[1], 'memory\n\nPrefers short replies');
    assert.equal(blocked.block, true); assert.match(blocked.reason, /did not approve/);
    await bots.update(botId, { expectedRevision: (await profiles.state()).revision, changes: { bot: { permissions: { preset: 'balanced' } } } });
    answer = true; asked.length = 0;
    assert.equal(await call('write', { path: 'plan.md', content: 'x' }), undefined);
    assert.equal(await call('memory_add', { content: 'x' }), undefined);
    assert.deepEqual(asked, [], 'Careful: workspace writes and notes go ahead');
    await call('write', { path: '../elsewhere.md', content: 'x' });
    await call('bash', { command: 'date' });
    await call('subagent', { task: 'Research flights' });
    assert.deepEqual(asked.map(([, message]) => message.split('\n')[0]), ['outside', 'command', 'delegate']);
    // Nobody can approve an unattended step: it is refused without asking.
    ctx.hasUI = false;
    assert.match((await call('bash', { command: 'date' })).reason, /nobody can approve/);
    ctx.hasUI = true;
    manager.appendCustomEntry('pivane-cron-run', { version: 1, runId: 'b'.repeat(64), sessionId: manager.getSessionId(), status: 'running', model: { provider: 'fixture', modelId: 'small' } });
    assert.match((await call('bash', { command: 'date' })).reason, /scheduled or unattended run/);
    manager.appendCustomEntry('pivane-cron-run', { version: 1, runId: 'b'.repeat(64), sessionId: manager.getSessionId(), status: 'completed' });
    assert.equal(asked.length, 3, 'unattended refusals never ask');
    await bots.update(botId, { expectedRevision: (await profiles.state()).revision, changes: { bot: { permissions: { preset: 'free' } } } });
    assert.equal(await call('bash', { command: 'date' }), undefined);
    assert.equal(asked.length, 3, 'Hands-off stays guidance only');
    // An unavailable model keeps the current one and is reported once.
    const reported = new Set(), sent = [];
    assert.equal(await alignModel(pi, ctx, { provider: 'nokey', id: 'x' }, value => sent.push(value), reported), 'unavailable');
    assert.equal(await alignModel(pi, ctx, { provider: 'missing', id: 'y' }, value => sent.push(value), reported), 'unavailable');
    assert.equal(await alignModel(pi, ctx, { provider: 'nokey', id: 'x' }, value => sent.push(value), reported), 'unavailable');
    assert.deepEqual(sent.map(item => `${item.provider}/${item.id}`), ['nokey/x', 'missing/y']);
    assert.equal(ctx.model.id, 'big');
    // A different session in the same worker process is not treated as the Bot window.
    assert.equal(botSection(context, { ...manager, getSessionId: () => 'foreign', getCwd: () => session.cwd, getSessionFile: () => session.path },
        session.cwd, agentDir), null);
    // After rotation, the old generation's context no longer resolves.
    await bots.rotate(botId, windowId, { expectedGeneration: 0 });
    assert.equal(botSection(context, manager, session.cwd, agentDir), null);
    assert.deepEqual(await run(), { assistant_profile_soul: 'stale personality' });
});

test('earlier generations are paged read-only from verified native files', { timeout: 60000 }, async t => {
    const { profiles, supervisor, bots } = services();
    t.after(() => supervisor.dispose());
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const botId = created.bot.id, windowId = created.window.id;
    const first = (await bots.resolve(botId, windowId)).session;
    await talk(first.path, 3, 'early');
    // A native compaction inside the generation is part of its whole branch.
    const manager = SessionManager.open(first.path);
    manager.appendCompaction('Summary of early talk', manager.getBranch()[2].id, 1000);
    await talk(first.path, 2, 'later');
    await bots.rotate(botId, windowId, { expectedGeneration: 0 });
    await talk((await bots.resolve(botId, windowId)).session.path, 1, 'now');

    const listed = await bots.generations(botId, windowId);
    assert.deepEqual(listed.generations.map(item => [item.generation, item.current, item.reason]), [[0, false, 'initial'], [1, true, 'manual']]);
    assert.ok(listed.generations[0].endedAt && !listed.generations[1].endedAt);
    assert.equal(JSON.stringify(listed).includes(first.path), false, 'no paths leave the server');

    const before = fs.readFileSync(first.path);
    const index = await bots.history(botId, windowId, { generation: '0' });
    assert.equal(index.generation, 0);
    const kinds = index.turns.map(turn => turn.kind);
    assert.deepEqual(kinds, ['user', 'user', 'user', 'summary', 'user', 'user']);
    assert.equal(index.turns[0].title, 'early question 0');
    assert.equal(index.turns.at(-1).reply.excerpt, 'later answer 1');
    const turns = await bots.history(botId, windowId, { generation: '0', view: 'turns', start: '4', end: '6', revision: index.revision });
    assert.deepEqual(turns.turns.map(turn => turn.text), ['later question 0', 'later question 1']);
    assert.ok(fs.readFileSync(first.path).equals(before), 'reading history never writes');

    await assert.rejects(bots.history(botId, windowId, { generation: '1' }), /live view/);
    await assert.rejects(bots.history(botId, windowId, { generation: '7' }), /not found/);
    await assert.rejects(bots.history(botId, windowId, { generation: '0', view: 'turns', start: '0', end: '2', revision: 'f'.repeat(64) }), /变化/);
    await assert.rejects(bots.history(botId, windowId, { generation: '-1' }), /Invalid generation/);
    await assert.rejects(bots.history(botId, windowId, { generation: '0', offset: 'x' }), /Invalid history position/);
});
