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

    assert.equal(bots.sessionMoved(resolved.session.id), false);
    const rotated = await bots.rotate(botId, windowId, { expectedGeneration: 0 });
    assert.equal(rotated.window.generation, 1);
    // WeChat admission (M4-4) sees the move synchronously; the window's chat target follows it.
    assert.equal(bots.sessionMoved(resolved.session.id), true);
    assert.equal(bots.sessionMoved(rotated.session.id), false);
    const target = await bots.channelTarget(botId, null);
    assert.deepEqual([target.window.id, target.session.id], [windowId, rotated.session.id]);
    assert.equal((await bots.channelWindows(botId)).windows[0].kind, 'main');
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
    assert.equal(bots.sessionMoved(window.current.sessionId), false, 'an abandoned recovery leaves the conversation admissible');

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
    let movingDuringRecovery = null;
    const edit = supervisor.withSessionEdit;
    supervisor.withSessionEdit = async (file, callback) => { movingDuringRecovery = reopened.sessionMoved(window.current.sessionId);
        return edit ? edit.call(supervisor, file, callback) : callback(null); };
    assert.equal((await reopened.resolve(botId, windowId)).session.id, successor.id);
    if (edit) supervisor.withSessionEdit = edit; else delete supervisor.withSessionEdit;
    assert.equal(movingDuringRecovery, true, 'channel admission sees the predecessor as moving while recovery decides');
    assert.equal(reopened.sessionMoved(window.current.sessionId), true);
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
    const { botSection, botPreset, registerBotContext, alignModel, BOT_SECTION } = require(jitiPath).createJiti(file)(file);
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
    // Keeps the first handler per event (the Bot context's own; later ones belong to helper modules).
    const pi = { on(name, fn) { if (!handlers.has(name)) handlers.set(name, fn); }, registerTool() {},
        async setModel(model) { calls.push(['model', model.id]); if (model.provider === 'nokey') return false; ctx.model = model; return true; },
        getThinkingLevel: () => thinking, setThinkingLevel(level) { calls.push(['thinking', level]); thinking = level; } };
    let agentRoot = agentDir;
    registerBotContext(pi, () => agentRoot);
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
    const { APPROVAL_TITLE, parseApprovalMessage } = require('../server/bot/bot-guard');
    const asked = []; let answer = true;
    Object.assign(ctx, { hasUI: true, signal: undefined });
    ctx.ui.confirm = async (title, message, options) => {
        const parsed = parseApprovalMessage(message);
        asked.push([title, `${parsed.kind}\n\n${parsed.detail}`, options.timeout, parsed.token]);
        return answer;
    };
    const retired = () => notices.filter(item => item.pivaneBot?.event === 'approval-done').map(item => item.pivaneBot.token);
    const call = (toolName, input) => handlers.get('tool_call')({ type: 'tool_call', toolCallId: `t${asked.length}`, toolName, input }, ctx);
    assert.equal(await call('read', { path: 'notes.md' }), undefined);
    assert.equal(await call('web_search', { query: 'weather' }), undefined);
    assert.deepEqual(asked, [], 'reading needs no approval');
    assert.equal(await call('bash', { command: 'ls -la' }), undefined, 'an approved command runs');
    assert.deepEqual(asked.at(-1).slice(0, 3), [APPROVAL_TITLE, 'command\n\nls -la', 30 * 60 * 1000]);
    assert.deepEqual(retired(), [asked.at(-1)[3]], 'an answered request is reported as over');
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
    // A nested call waiting for approval is cancelled with its parent tool, and its request retired.
    await bots.update(botId, { expectedRevision: (await profiles.state()).revision, changes: { bot: { permissions: { preset: 'balanced' } } } });
    let pendingSignal = null;
    ctx.ui.confirm = (title, message, options) => new Promise(resolve => {
        pendingSignal = options.signal; asked.push([title, message, options.timeout, parseApprovalMessage(message).token]);
        options.signal.addEventListener('abort', () => resolve(false), { once: true });
    });
    const waiting = handlers.get('tool_call')({ type: 'tool_call', toolCallId: 'parent-1/1', parentToolCallId: 'parent-1', toolName: 'bash', input: { command: 'pwd' } }, ctx);
    for (let i = 0; i < 50 && !pendingSignal; i++) await new Promise(done => setTimeout(done, 10));
    handlers.get('tool_execution_end')({ type: 'tool_execution_end', toolCallId: 'other' });
    assert.equal(pendingSignal.aborted, false, 'another call ending does not cancel it');
    handlers.get('tool_execution_end')({ type: 'tool_execution_end', toolCallId: 'parent-1' });
    assert.match((await waiting).reason, /did not approve/);
    assert.equal(retired().at(-1), asked.at(-1)[3]);
    // The gate fails closed: an unreadable profile store counts as "Ask every time"; another session is not the Bot.
    const broken = path.join(root, 'broken-agent');
    fs.mkdirSync(path.join(broken, 'pivane-profiles', 'profiles.json'), { recursive: true });
    assert.equal(await botPreset(context, manager, session.cwd, broken, async () => {}), 'ask');
    assert.equal(await botPreset(context, { ...manager, getSessionId: () => 'foreign' }, session.cwd, agentDir), null);
    assert.equal(await botPreset(context, manager, '/elsewhere', agentDir), 'ask');
    assert.equal(await botPreset(context, manager, session.cwd, agentDir), 'balanced');
    // The parent ends while the preset is still being read (the read retries): nothing is asked.
    agentRoot = broken;
    const before = asked.length, retiredBefore = retired().length;
    const late = handlers.get('tool_call')({ type: 'tool_call', toolCallId: 'parent-2/1', parentToolCallId: 'parent-2', toolName: 'bash', input: { command: 'pwd' } }, ctx);
    handlers.get('tool_execution_end')({ type: 'tool_execution_end', toolCallId: 'parent-2' });
    assert.match((await late).reason, /did not approve/);
    assert.equal(asked.length, before, 'no approval opens for an already cancelled call');
    assert.equal(retired().length, retiredBefore);
    agentRoot = agentDir;
    // An unavailable model keeps the current one and is reported once.
    const reported = new Set(), sent = [];
    assert.equal(await alignModel(pi, ctx, { provider: 'nokey', id: 'x' }, value => sent.push(value), reported), 'unavailable');
    assert.equal(await alignModel(pi, ctx, { provider: 'missing', id: 'y' }, value => sent.push(value), reported), 'unavailable');
    assert.equal(await alignModel(pi, ctx, { provider: 'nokey', id: 'x' }, value => sent.push(value), reported), 'unavailable');
    assert.deepEqual(sent.map(item => `${item.provider}/${item.id}`), ['nokey/x', 'missing/y']);
    assert.equal(ctx.model.id, 'big');
    // Compaction: the structured summary with checked notebook changes, made with the Bot's model; Pi's own on failure.
    const branch = manager.getBranch();
    const userEntry = branch.find(entry => entry.type === 'message' && entry.message.role === 'user');
    const kept = branch.find(entry => entry.type === 'message' && entry.message.role === 'assistant');
    const requests = [];
    let reply = JSON.stringify({ topic: 'Greetings', episodes: ['2026-03-01: said hello'], now: { next: 'say hello again' }, notes: [
        { op: 'add', kind: 'decision', text: 'Keep saying hello', entry: userEntry.id.slice(0, 8), quote: 'question 0' },
        { op: 'add', kind: 'decision', text: 'An assistant idea', entry: kept.id.slice(0, 8), quote: 'answer 0' }] });
    // Provider-neutral request, like Pi's own summaries (a plain complete() without reasoning is
    // rejected by some reasoning models).
    ctx.modelRegistry.streamSimple = (model, request, options) => {
        requests.push({ model: model.id, request, options });
        return { result: async () => ({ content: [{ type: 'text', text: reply }], stopReason: 'stop',
            usage: { input: 5, output: 7, cacheRead: 0, cacheWrite: 0, totalTokens: 12, cost: { total: 0 } } }) };
    };
    ctx.model.reasoning = true;
    const compactEvent = { branchEntries: branch, preparation: { firstKeptEntryId: kept.id, tokensBefore: 123 }, reason: 'manual', signal: new AbortController().signal };
    const compacted = await handlers.get('session_before_compact')(compactEvent, ctx);
    assert.equal(requests[0].model, 'big', 'the Bot model writes the summary');
    assert.equal(requests[0].options.cacheRetention, 'none');
    assert.equal(requests[0].options.reasoning, thinking, 'with the chat\'s thinking level');
    assert.equal(requests[0].options.maxTokens, 16000);
    assert.equal(compacted.compaction.firstKeptEntryId, kept.id);
    assert.equal(compacted.compaction.tokensBefore, 123);
    assert.match(compacted.compaction.summary, /## What this chat is about\nGreetings[^]*## Notebook[^]*\[n1\] Keep saying hello[^]*- Next: say hello again/);
    assert.deepEqual(compacted.compaction.details.pivaneBot.rejected, [{ op: 'add', id: null, reason: 'unknown entry' }], 'the kept tail cannot be cited');
    assert.equal(compacted.compaction.details.pivaneBot.ledger.snapshot.items.length, 1);
    assert.equal(compacted.compaction.usage.totalTokens, 12);
    reply = 'not json';
    const level = thinking; thinking = 'off';
    assert.equal(await handlers.get('session_before_compact')(compactEvent, ctx), undefined, 'a failed summary falls back to Pi');
    assert.equal('reasoning' in requests.at(-1).options, false, 'no reasoning option when thinking is off');
    thinking = level;
    assert.equal(notices.at(-1).pivaneBot.structured, false);
    // S1 at the end of a completed run keeps other extensions' drafts; nothing for an aborted run.
    const heavy = SessionManager.inMemory('/tmp');
    const outputs = [];
    for (let index = 0; index < 6; index++) {
        heavy.appendMessage({ role: 'user', content: `q${index}`, timestamp: Date.now() });
        heavy.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id: `r${index}`, name: 'read', arguments: {} }], api: 'openai-completions',
            provider: 'fixture', model: 'small', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { total: 0 } }, stopReason: 'toolUse', timestamp: Date.now() });
        outputs.push(heavy.appendMessage({ role: 'toolResult', toolCallId: `r${index}`, toolName: 'read', content: [{ type: 'text', text: 'y'.repeat(80000) }], isError: false, timestamp: Date.now() }));
    }
    const other = { type: 'custom', customType: 'someone-else' };
    const settle = outcome => handlers.get('agent_before_settle')({ outcome, entries: [other], context: { contextEntries: heavy.buildSessionProjection().entries } }, ctx);
    ctx.getContextUsage = () => ({ tokens: 120000, contextWindow: 200000, percent: 60 });
    const pruned = settle('completed');
    assert.deepEqual(pruned.entries.map(entry => entry.targetId ?? entry.customType), ['someone-else', outputs[0], outputs[1], outputs[2]]);
    assert.equal(settle('aborted'), undefined);
    // S2: a summary in the background once the cache is cold, unless a new run starts first;
    // only when much of the context lies before what Pi keeps verbatim.
    for (let index = 0; index < 6; index++) {
        manager.appendMessage({ role: 'user', content: `long ${index} ` + 'z'.repeat(60000), timestamp: Date.now() });
        manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: `ok ${index}` }], api: 'openai-completions', provider: 'fixture', model: 'small',
            usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { total: 0 } }, stopReason: 'stop', timestamp: Date.now() });
    }
    const realNow = Date.now();
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: realNow });
    const compacts = [];
    Object.assign(ctx, { isIdle: () => true, hasPendingMessages: () => false, compact: options => compacts.push(options) });
    handlers.get('agent_settled')({ aborted: false }, ctx);
    t.mock.timers.tick(10 * 60 * 1000 - 1);
    assert.equal(compacts.length, 0);
    t.mock.timers.tick(1);
    assert.equal(compacts[0].customInstructions, 'pivane-bot-idle');
    handlers.get('agent_settled')({ aborted: false }, ctx);
    handlers.get('agent_start')({}, ctx);
    t.mock.timers.tick(20 * 60 * 1000);
    assert.equal(compacts.length, 1, 'a new run cancels the idle summary');
    // S2 counts what Pi keeps verbatim the way Pi's last compaction of this model was prepared.
    await handlers.get('session_before_compact')({ ...compactEvent, preparation: { ...compactEvent.preparation, settings: { keepRecentTokens: 200000 } } }, ctx);
    handlers.get('agent_settled')({ aborted: false }, ctx);
    t.mock.timers.tick(20 * 60 * 1000);
    assert.equal(compacts.length, 1, 'nothing worth summarizing when Pi keeps all of it');
    await handlers.get('session_before_compact')({ ...compactEvent, preparation: { ...compactEvent.preparation, settings: { keepRecentTokens: 20000 } } }, ctx);
    ctx.getContextUsage = () => ({ tokens: 1000, contextWindow: 200000, percent: 0.5 });
    handlers.get('agent_settled')({ aborted: false }, ctx);
    t.mock.timers.tick(20 * 60 * 1000);
    assert.equal(compacts.length, 1, 'a window with room left is not summarized');
    // A generation due to move on is summarized anyway; the server moves it after that compaction.
    t.mock.timers.setTime(realNow + 61 * 24 * 3600 * 1000);
    handlers.get('agent_settled')({ aborted: false }, ctx);
    t.mock.timers.tick(10 * 60 * 1000);
    assert.equal(compacts.length, 2);
    assert.equal(compacts[1].customInstructions, 'pivane-bot-rotate');
    // A summary made while due also reads the part Pi keeps verbatim (the server moves on right after).
    reply = JSON.stringify({ topic: 'Greetings', episodes: ['2026-03-01: said hello'], now: { doing: '', next: '', waiting: '' }, notes: [] });
    const due = await handlers.get('session_before_compact')(compactEvent, ctx);
    assert.equal(due.compaction.details.pivaneBot.includedKept, true);
    assert.match(requests.at(-1).request.messages[0].content[0].text, /long 5 /);
    t.mock.timers.reset();
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
