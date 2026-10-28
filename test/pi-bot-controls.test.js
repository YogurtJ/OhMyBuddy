// Real Bot/profile/window/channel stores with synthetic workers; no network or provider calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-controls-')));
const agentDir = path.join(root, 'agent'); fs.mkdirSync(agentDir);
process.env.PI_CODING_AGENT_DIR = agentDir; process.env.PI_PROJECT_ROOTS = root; process.env.PI_OFFLINE = '1';
const { PiSessionStore } = require('../server/pi-session-store');
const { PiProfileRegistry } = require('../server/pi-profile-registry');
const { PiAgentSupervisor } = require('../server/pi-agent-supervisor');
const { BotService } = require('../server/bot/bot-service');
const { ChannelStore } = require('../server/channels/store');
const { ChannelsService } = require('../server/channels/service');
const { registerChannelTurns } = require('../server/channels/runtime');
const settings = require('../server/bot/bot-settings');
const { WINDOW_ENTRY } = require('../server/bot/bot-window-state');
const models = [{ provider: 'fixture', modelId: 'text', name: 'Text', thinkingLevels: ['off', 'low', 'medium', 'high'] },
    { provider: 'fixture', modelId: 'vision', name: 'Vision', thinkingLevels: ['off', 'low', 'medium', 'high'] },
    { provider: 'other', modelId: 'vision', name: 'Other vision', thinkingLevels: ['off', 'low'] }];
const catalog = () => ({ defaults: { provider: 'fixture', modelId: 'text', thinkingLevel: 'medium' }, models });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
let sequence = 0;
async function fixture(t) {
    const store = new PiSessionStore(), profiles = new PiProfileRegistry(store); store.profiles = profiles;
    const supervisor = new PiAgentSupervisor(); t.after(() => supervisor.dispose());
    const bots = new BotService({ store, profiles, supervisor, catalog: async () => catalog() });
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const id = created.bot.id, windowId = created.window.id;
    const resolved = await bots.resolve(id, windowId), session = resolved.session;
    const db = new ChannelStore(path.join(root, 'channels-' + sequence++)); db.claim(); t.after(() => db.close());
    db.change(v => Object.assign(v, { accounts: [{ id: 'account', userId: 'owner', allowedUsers: ['owner'], enabled: true, token: 'synthetic', baseUrl: 'https://ilinkai.weixin.qq.com', cursor: '' }],
        bindings: [{ id: 'binding', accountId: 'account', peerId: 'owner', cwd: session.cwd, sessionId: session.id, name: 'Bot', bot: { profileId: id, windowId, main: true }, bots: [id] }],
        peers: [{ accountId: 'account', peerId: 'owner', contextToken: 'synthetic' }] }));
    const s = Object.create(ChannelsService.prototype), calls = [], sent = [];
    const state = { model: { provider: 'fixture', id: 'text' }, thinkingLevel: 'medium', webCompaction: null };
    const worker = { operation: false, isIdle() { return !this.operation; },
        async request(type, payload, timeout, token, prepared) {
            (prepared || (typeof token === 'function' ? token : null))?.(); calls.push(type);
            if (type === 'get_state') return structuredClone(state);
            if (type === 'get_session_stats') return { tokens: { input: 30, output: 5 }, cost: 0.012, contextUsage: { tokens: 100, contextWindow: 1000 } };
            if (type === 'compact') { await s.onCompact?.(); state.webCompaction = s.compactionResult; }
            return {};
        },
        async exclusive(callback) { if (this.operation) throw Object.assign(Error('busy'), { code: 'SESSION_BUSY' }); this.operation = true;
            try { return await callback(this.request.bind(this), state); } finally { this.operation = false; } },
        async reloadResources({ rpc }) { await rpc('reload_resources'); return { commands: [1, 2] }; } };
    supervisor.getWorker = async () => worker;
    Object.assign(s, { db, bots, store, supervisor, runs: new Map(), operations: new Set(), pollers: new Map(), connections: new Map(),
        stopping: false, mutating: false, error: null, isSuspended: () => false, stopController: new AbortController(),
        adapter: { send: async (_a, _p, text) => { sent.push(text); return {}; } },
        collectDeliverables: async () => [], collectMediaAssets: async () => [], startTyping: async () => async () => {},
        readOutcome: async () => ({ status: 'completed', body: '' }) });
    const enqueue = text => {
        const jobId = 'command-' + sequence++, binding = db.value.bindings[0];
        db.change(v => v.jobs.push({ id: jobId, accountId: 'account', peerId: 'owner', bindingId: binding.id,
            target: { cwd: binding.cwd, sessionId: binding.sessionId }, status: 'queued', text }));
        return jobId;
    };
    const send = async text => { const jobId = enqueue(text); await s.run(jobId, {}); return { text: sent.at(-1), job: s.job(jobId) }; };
    const record = async () => (await bots.bot(id)).bot;
    const patch = async bot => bots.update(id, { expectedRevision: (await profiles.state()).revision, changes: { bot } });
    return { s, db, bots, profiles, store, supervisor, worker, state, calls, sent, id, windowId, session, send, enqueue, record, patch };
}

test('top-level thinking precedence and omission compatibility survive normalization', () => {
    const original = settings.defaultBot({ workspace: root });
    const legacy = { ...original, model: { provider: 'gone', id: 'old', thinking: 'high' } }; delete legacy.thinking;
    assert.equal(settings.normalizeBot(legacy).thinking, 'high');
    assert.equal(settings.normalizeBot({ ...legacy, thinking: null }).thinking, null);
    const saved = settings.normalizeBot(legacy);
    assert.equal(settings.applyBotPatch(saved, { model: null }).thinking, 'high');
    assert.equal(settings.applyBotPatch(saved, { model: { provider: 'p', id: 'm' } }).thinking, 'high');
    assert.equal(settings.applyBotPatch(saved, { model: { provider: 'p', id: 'm', thinking: 'low' } }).thinking, 'low');
    assert.equal(settings.applyBotPatch(saved, { model: { provider: 'p', id: 'm', thinking: 'low' }, thinking: null }).thinking, null);
});

test('real settings/onboarding/list share thinking; omitted fields preserve it and revision conflicts protect it', async t => {
    const f = await fixture(t);
    const local = async body => f.bots.onboarding(f.id, { action: 'model-choice', expectedRevision: (await f.profiles.state()).revision, ...body });
    await local({ model: null, thinking: 'high' });
    assert.equal((await f.record()).thinking, 'high');
    await local({ model: { provider: 'fixture', id: 'vision' } });
    assert.equal((await f.record()).thinking, 'high');
    await local({ model: { provider: 'fixture', id: 'text', thinking: 'low' } });
    assert.equal((await f.record()).thinking, 'low');
    await local({ model: { provider: 'fixture', id: 'vision', thinking: 'high' }, thinking: null });
    assert.equal((await f.record()).thinking, null);
    const old = (await f.profiles.state()).revision;
    await f.patch({ thinking: 'high' });
    await assert.rejects(f.bots.update(f.id, { expectedRevision: old, changes: { bot: { thinking: null } } }), { status: 409 });
    assert.equal((await f.bots.settings(f.id)).bot.bot.thinking, 'high');
    assert.equal((await f.bots.list()).bots.find(item => item.id === f.id).bot.thinking, 'high');
    await assert.rejects(f.patch({ model: { provider: 'other', id: 'vision' } }), { code: 'BOT_MODEL_UNAVAILABLE' });
    assert.equal((await f.record()).model.provider, 'fixture');
    f.bots.catalog = async () => { throw Error('offline'); };
    await f.patch({ job: 'Keep working' });
    await f.patch({ model: null });
    assert.equal((await f.record()).thinking, 'high');
    await f.patch({ thinking: null });
});

test('automatic effective defaults support independent thinking without persisting or guessing a model', async t => {
    const f = await fixture(t), { resolveEffectiveDefault } = require('../server/bot/bot-model-runtime');
    f.bots.catalog = async () => ({ models });
    const before = fs.readFileSync(f.session.path);
    const snapshot = await f.bots.settings(f.id);
    assert.equal(snapshot.models.defaults, undefined, 'the saved catalog default remains absent');
    assert.deepEqual(snapshot.models.effectiveDefault, { provider: 'fixture', modelId: 'text' });
    await f.patch({ thinking: 'high' });
    assert.equal((await f.record()).model, null); assert.equal((await f.record()).thinking, 'high');
    assert.match((await f.send('/thinking')).text, /high/);
    assert.match((await f.send('/model')).text, /跟随工作区默认（fixture\/text）/);
    assert.deepEqual(fs.readFileSync(f.session.path), before); assert.deepEqual(f.calls, []);
    const known = await f.record();
    f.bots.catalog = async () => ({ models: [] });
    assert.equal((await f.bots.settings(f.id)).models.effectiveDefault, null);
    await assert.rejects(f.patch({ thinking: 'low' }), { code: 'BOT_MODEL_UNAVAILABLE' });
    assert.deepEqual(await f.record(), known);
    f.bots.catalog = async () => { throw Error('synthetic resolution failure'); };
    await assert.rejects(f.patch({ thinking: 'low' }), { code: 'BOT_MODEL_UNAVAILABLE' });
    assert.deepEqual(await f.record(), known); assert.deepEqual(f.calls, []);
    assert.equal(await resolveEffectiveDefault({ defaults: { provider: 'gone', modelId: 'old' }, models }), null);
    assert.deepEqual(await resolveEffectiveDefault({ models, effectiveDefault: { provider: 'fixture', modelId: 'vision' } }),
        { provider: 'fixture', modelId: 'vision' }, 'a caller-provided effective selection is preserved when available');
    assert.equal(await resolveEffectiveDefault({ models, effectiveDefault: null }), null, 'an unverified selection stays null');
});

test('WeChat model/thinking persist for the whole Bot without touching a running worker', async t => {
    const f = await fixture(t);
    f.worker.operation = true; f.supervisor.getActiveWorker = () => f.worker;
    f.s.runs.set('turn', { target: { cwd: f.session.cwd, sessionId: f.session.id }, worker: f.worker });
    assert.match((await f.send('/model')).text, /fixture\/vision/);
    assert.match((await f.send('/model vision')).text, /多个匹配/);
    assert.match((await f.send('/thinking high')).text, /已保存/);
    assert.match((await f.send('/model fixture/vision')).text, /已保存/);
    assert.equal((await f.record()).model.id, 'vision'); assert.equal((await f.record()).thinking, 'high');
    assert.match((await f.send('/model default')).text, /跟随工作区默认/);
    assert.equal((await f.record()).model, null); assert.equal((await f.record()).thinking, 'high');
    await f.send('/thinking default'); assert.equal((await f.record()).thinking, null);
    assert.deepEqual(f.calls, [], 'settings commands never submit temporary worker model/thinking RPCs');
    assert.equal(f.worker.operation, true); assert.equal(f.state.model.id, 'text');
    const waiting = f.enqueue('/model');
    f.s.pump(); await f.s.runs.get(waiting).promise;
    assert.equal(f.s.job(waiting).status, 'delivered', 'model query bypasses a running channel turn');
    f.s.runs.delete('turn');
});

test('revoked command during catalog lookup has no persisted or native side effects', async t => {
    const f = await fixture(t), started = deferred(), release = deferred();
    f.bots.catalog = async () => { started.resolve(); await release.promise; return catalog(); };
    const id = f.enqueue('/model fixture/vision'), pending = f.s.run(id, {}); await started.promise;
    f.db.change(v => { v.accounts[0].allowedUsers = []; }); release.resolve(); await pending;
    assert.equal((await f.record()).model, null); assert.equal(f.s.job(id).status, 'cancelled');
    assert.notEqual(f.s.job(id).commandSubmitted, true); assert.deepEqual(f.calls, []);
});

test('last-write admission guard and owner revision reject revoked and concurrent settings commands', async t => {
    const f = await fixture(t), started = deferred(), release = deferred(); let reads = 0;
    f.bots.catalog = async () => { if (++reads === 2) { started.resolve(); await release.promise; } return catalog(); };
    const id = f.enqueue('/model fixture/vision'), pending = f.s.run(id, {}); await started.promise;
    await assert.rejects(Promise.resolve().then(() => f.patch({ job: 'concurrent' })), { status: 409 });
    f.db.change(v => { v.accounts[0].enabled = false; }); release.resolve(); await pending;
    assert.equal((await f.record()).model, null); assert.equal(f.s.job(id).status, 'cancelled');
    assert.notEqual(f.s.job(id).commandSubmitted, true);
});

test('/new durably creates a topic, follows queued inputs, renames only that topic, and deduplicates request IDs', async t => {
    const f = await fixture(t), originalBytes = fs.readFileSync(f.session.path);
    const id = f.enqueue('/new 旅行计划'), follow = f.enqueue('next message');
    await f.s.run(id, {});
    assert.equal(f.s.job(id).status, 'delivered');
    const binding = f.db.value.bindings[0], topic = (await f.bots.channelWindows(f.id)).windows.find(w => w.id === binding.bot.windowId);
    assert.equal(topic.kind, 'topic'); assert.equal(topic.title, '旅行计划');
    assert.equal(f.s.job(follow).target.sessionId, binding.sessionId);
    assert.equal(f.s.job(follow).bot, undefined); assert.deepEqual(fs.readFileSync(f.session.path), originalBytes);
    const requestId = JSON.stringify(['account', 'owner', id]);
    const again = await f.bots.createChannelTopic(f.id, { requestId, title: '旅行计划', windowId: topic.id,
        session: await f.store.getSession(binding.cwd, binding.sessionId), expectedRevision: 'stale-on-purpose' }, () => {});
    assert.equal(again.window.id, topic.id); assert.equal((await f.bots.channelWindows(f.id)).windows.length, 2);
    assert.match((await f.send('/name 旅行安排')).text, /旅行安排/);
    assert.match((await f.send('/topic main')).text, /主聊天/);
    assert.match((await f.send('/name Main rename')).text, /Bot 设置/);
    assert.match((await f.send('/reset')).text, /\/new/); assert.match((await f.send('/resume')).text, /\/topic/);
});

test('unknown topic creation is not replayed after restart, and the prepared row recovers without a second topic', async t => {
    const f = await fixture(t), complete = f.bots.completeWindowLocked.bind(f.bots); let interrupted = true;
    f.bots.completeWindowLocked = (...args) => { if (interrupted) throw Error('synthetic interrupted native create'); return complete(...args); };
    const id = f.enqueue('/new Recover me'); f.s.pump(); await f.s.runs.get(id).promise;
    assert.equal(f.s.job(id).status, 'uncertain'); assert.equal(f.s.job(id).commandSubmitted, true);
    assert.equal((await f.bots.channelWindows(f.id)).windows.length, 2);
    const reopened = new ChannelStore(f.db.directory); assert.equal(reopened.value.jobs.find(j => j.id === id).status, 'uncertain');
    f.s.pump(); assert.equal(f.s.runs.size, 0, 'uncertain slash requests are never replayed');
    interrupted = false;
    const saved = await f.bots.createChannelTopic(f.id, { requestId: JSON.stringify(['account', 'owner', id]), title: 'Recover me',
        windowId: f.windowId, session: f.session, expectedRevision: 'old' }, () => {});
    assert.ok(saved.window.sessionId); assert.equal((await f.bots.channelWindows(f.id)).windows.length, 2);
});

test('topic indices 100/101 and duplicate names work at the real topic boundary', async t => {
    const f = await fixture(t);
    const created = await f.bots.createTopic(f.id, { title: 'Duplicate', expectedRevision: (await f.bots.windows.read(f.id)).revision });
    const { state, revision } = await f.bots.windows.read(f.id);
    await f.bots.windows.mutate(f.id, revision, current => {
        const topic = current.windows.find(w => w.id === created.window.id);
        for (let i = 1; i < 100; i++) current.windows.push({ ...structuredClone(topic), id: require('node:crypto').randomUUID(),
            title: i === 1 ? 'Duplicate' : 'Topic ' + i, current: null, generations: [], createdAt: new Date(Date.now() + i).toISOString() });
        return {};
    });
    const windows = (await f.bots.channelWindows(f.id)).windows;
    assert.equal(windows.length, 101); assert.equal(state.windows.length, 2);
    assert.match((await f.send('/topic Duplicate')).text, /名字相近/);
    assert.match((await f.send('/topic 100')).text, /进入/);
    assert.equal(f.db.value.bindings[0].bot.windowId, windows[99].id);
    assert.match((await f.send('/topic 101')).text, /进入/);
    assert.equal(f.db.value.bindings[0].bot.windowId, windows[100].id);
});

test('advanced controls retain proof/cancellation; extra summary instructions are rejected explicitly', async t => {
    const f = await fixture(t);
    assert.match((await f.send('/help')).text, /同意 A3/);
    assert.match((await f.send('/help advanced')).text, /\/compact/);
    assert.match((await f.send('/compact keep this')).text, /不接受附加压缩要求/);
    assert.deepEqual(f.calls, []);
    f.s.compactionResult = { status: 'cancelled' }; assert.match((await f.send('/compact')).text, /已取消/);
    f.s.compactionResult = { status: 'success', tokensBefore: 1000, estimatedTokensAfter: 100 };
    assert.match((await f.send('/compact')).text, /压缩完成/);
    assert.match((await f.send('/reload')).text, /重新加载/);
    f.s.compactionResult = null; const id = f.enqueue('/compact'); f.s.pump(); await f.s.runs.get(id).promise;
    assert.equal(f.s.job(id).status, 'uncertain');
    f.supervisor.getActiveWorker = () => f.worker;
    const detail = await f.send('/status detail');
    assert.match(detail.text, /不是整个 Bot 或话题跨代累计/); assert.match(detail.text, /本代费用：\$0.012/);
    assert.match(detail.text, /配置模型.*跟随/); assert.match(detail.text, /当前运行模型.*fixture\/text/);
});

test('media confirmation uses proven predecessor cards after rotation, and never repeats failed or unknown attempts', async t => {
    const f = await fixture(t), { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const plan = { id: 'plan-11111111-1111-4111-8111-111111111111', modelId: 'synthetic-video', kind: 'video', summary: 'Trip', parameters: {} };
    SessionManager.open(f.session.path).appendMessage({ role: 'toolResult', toolCallId: 'media', toolName: 'media_generate', isError: false,
        content: [{ type: 'text', text: 'synthetic plan' }], details: { plan }, timestamp: Date.now() });
    await f.bots.rotate(f.id, f.windowId, { expectedGeneration: 0 });
    const attempts = [], runs = [];
    f.s.mediaLabService = { chatRequests: { publicState: () => ({ attempts }),
        run: async input => { runs.push(input); attempts.push({ status: 'running' }); return { status: 'running' }; },
        waitFor: async () => ({ attempts }) } };
    assert.match((await f.send('/confirm A3')).text, /没有找到匹配/); assert.equal(runs.length, 0);
    assert.match((await f.send('/confirm')).text, /已确认并开始生成/); assert.equal(runs.length, 1);
    assert.equal(f.db.value.bindings[0].sessionId, (await f.bots.channelTarget(f.id)).session.id);
    assert.match((await f.send('/confirm')).text, /无需重复确认/);
    attempts[0].status = 'failed'; assert.match((await f.send('/confirm')).text, /没有待确认/);
    attempts[0].status = 'uncertain'; await f.send('/confirm'); assert.equal(runs.length, 1);
    attempts[0].status = 'done'; assert.match((await f.send('/confirm')).text, /已完成生成/);
    assert.equal(runs.length, 1);
});

async function runtimeFixture(t) {
    const f = await fixture(t), { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const manager = SessionManager.open(f.session.path);
    const file = path.join(__dirname, '../server/bot/bot-context-extension.ts');
    const api = await require(process.env.PIVANE_TEST_PI_JITI).createJiti(file).import(file);
    const prior = { context: process.env.PIVANE_BOT_CONTEXT, token: process.env.PI_WEB_NAVIGATION_TOKEN };
    process.env.PIVANE_BOT_CONTEXT = JSON.stringify({ version: 1, profileId: f.id, windowId: f.windowId,
        cwd: f.session.cwd, sessionPath: f.session.path, sessionId: f.session.id });
    process.env.PI_WEB_NAVIGATION_TOKEN = 'synthetic';
    t.after(() => { for (const [field, name] of [['context', 'PIVANE_BOT_CONTEXT'], ['token', 'PI_WEB_NAVIGATION_TOKEN']])
        if (prior[field] === undefined) delete process.env[name]; else process.env[name] = prior[field]; });
    const definitions = { text: { provider: 'fixture', id: 'text', reasoning: true, input: ['text'] },
        vision: { provider: 'fixture', id: 'vision', reasoning: true, input: ['text', 'image'] } };
    const handlers = new Map(), changes = [], messages = [], notices = [];
    let thinking = 'medium', idle = true;
    const ctx = { mode: 'rpc', cwd: f.session.cwd, sessionManager: manager, model: definitions.text,
        isIdle: () => idle, hasPendingMessages: () => false,
        modelRegistry: { find: (provider, id) => provider === 'fixture' ? definitions[id] : undefined, getAvailable: () => Object.values(definitions) },
        ui: { notify: message => notices.push(message) } };
    const pi = { on(name, handler) { if (!handlers.has(name)) handlers.set(name, handler); }, registerTool() {},
        setModel: async model => { changes.push(['model', model.id]); ctx.model = model; return true; },
        getThinkingLevel: () => thinking, setThinkingLevel: level => { changes.push(['thinking', level]); thinking = level; },
        appendEntry: (type, data) => manager.appendCustomEntry(type, data), sendMessage: message => messages.push(message) };
    api.registerBotContext(pi, () => agentDir);
    const ingress = () => registerChannelTurns(pi, { prepareStart: api.prepareBotModel });
    const input = (overrides = {}) => ({ action: 'start', sessionId: manager.getSessionId(), peerId: 'owner',
        id: require('node:crypto').createHash('sha256').update(String(sequence++)).digest('hex'), text: 'Hello', ...overrides });
    const defaults = values => fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify(values), { mode: 0o600 });
    defaults({ defaultProvider: 'fixture', defaultModel: 'text', defaultThinkingLevel: 'medium' });
    return { ...f, api, manager, definitions, handlers, changes, messages, notices, ctx, pi, ingress, input, defaults,
        setIdle: value => { idle = value; }, thinking: () => thinking };
}

test('runtime follows current defaults at open, next turn, explicit reset, independent thinking, and after rotation/restart', async t => {
    const f = await runtimeFixture(t);
    await f.patch({ model: { provider: 'fixture', id: 'vision' }, thinking: 'high' });
    await f.handlers.get('session_start')({}, f.ctx);
    assert.equal(f.ctx.model.id, 'vision'); assert.equal(f.thinking(), 'high');
    const before = () => f.handlers.get('before_agent_start')({ systemPromptOptions: { sections: {} } }, f.ctx);
    await f.patch({ model: null });
    await before(); assert.equal(f.ctx.model.id, 'text'); assert.equal(f.thinking(), 'high');
    f.defaults({ defaultProvider: 'fixture', defaultModel: 'vision', defaultThinkingLevel: 'low' });
    await before(); assert.equal(f.ctx.model.id, 'vision'); assert.equal(f.thinking(), 'high');
    await f.patch({ thinking: null }); await before(); assert.equal(f.thinking(), 'low');
    f.defaults({ defaultProvider: 'fixture', defaultModel: 'vision', defaultThinkingLevel: 'low', modelThinkingLevels: { 'fixture/vision': 'high' } });
    await before(); assert.equal(f.thinking(), 'high', 'per-model native default applies');
    const moved = await f.bots.rotate(f.id, f.windowId, { expectedGeneration: 0 });
    f.ctx.sessionManager = (await import('@earendil-works/pi-coding-agent')).SessionManager.open(moved.session.path);
    process.env.PIVANE_BOT_CONTEXT = JSON.stringify({ version: 1, profileId: f.id, windowId: f.windowId, sessionId: moved.session.id,
        cwd: moved.session.cwd, sessionPath: moved.session.path });
    f.handlers.clear(); f.api.registerBotContext(f.pi, () => agentDir); f.ctx.model = f.definitions.text;
    await f.handlers.get('session_start')({}, f.ctx); assert.equal(f.ctx.model.id, 'vision'); assert.equal(f.thinking(), 'high');
    f.defaults({}); f.ctx.model = f.definitions.vision;
    await f.api.alignModel(f.pi, f.ctx, null, () => {}, new Set(), null, agentDir);
    assert.equal(f.ctx.model.id, 'text', 'no saved default uses the native automatic selection, not the old explicit model');
});

test('first WeChat image uses persisted vision selection, including model default before the first image', async t => {
    const f = await runtimeFixture(t);
    const image = { type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' };
    await f.patch({ model: { provider: 'fixture', id: 'vision' } });
    await f.ingress()(f.ctx, f.input({ images: [image] }));
    assert.equal(f.ctx.model.id, 'vision'); assert.equal(f.messages.length, 1);
    assert.equal(f.messages[0].details.imageCount, 1);
    f.defaults({ defaultProvider: 'fixture', defaultModel: 'vision', defaultThinkingLevel: 'low' });
    await f.patch({ model: null }); f.ctx.model = f.definitions.text;
    await f.ingress()(f.ctx, f.input({ images: [image] }));
    assert.equal(f.ctx.model.id, 'vision'); assert.equal(f.messages.length, 2);
});

test('invalid, busy, reused and query channel requests never prepare models; concurrent preparation reserves admission', async t => {
    const f = await runtimeFixture(t);
    await f.patch({ model: { provider: 'fixture', id: 'vision' } });
    const request = f.input(), command = f.ingress();
    // Use the runtime's source-named state marker rather than an invented execution record.
    const { STATE } = require('../server/channels/runtime');
    f.manager.appendCustomEntry(STATE, { version: 1, id: request.id, sessionId: request.sessionId, status: 'running', startedAt: Date.now() });
    assert.equal(command(f.ctx, request).reused, true);
    command(f.ctx, { ...request, action: 'status' }); command(f.ctx, { ...request, action: 'thread-status' });
    assert.throws(() => command(f.ctx, f.input({ peerId: null })), /Invalid channel message/);
    assert.throws(() => command(f.ctx, f.input({ id: 'invalid' })), /Invalid channel turn/);
    assert.throws(() => command(f.ctx, f.input({ images: [{ type: 'image', mimeType: 'text/plain', data: 'x' }] })), /Invalid channel image/);
    f.setIdle(false); assert.throws(() => command(f.ctx, f.input()), /busy/); f.setIdle(true);
    assert.deepEqual(f.changes, []);
    const started = deferred(), release = deferred(); let preparations = 0;
    const guarded = registerChannelTurns(f.pi, { prepareStart: async ctx => { preparations++; started.resolve(); await release.promise; await f.api.prepareBotModel(ctx); } });
    const first = guarded(f.ctx, f.input()); await started.promise;
    assert.throws(() => guarded(f.ctx, f.input()), /busy/); release.resolve(); await first;
    assert.equal(preparations, 1); assert.equal(f.ctx.model.id, 'vision');
    const delayed = registerChannelTurns(f.pi, { prepareStart: async () => { f.setIdle(false); } });
    await assert.rejects(delayed(f.ctx, f.input()), /changed or is busy/);
    f.setIdle(true); await f.bots.rotate(f.id, f.windowId, { expectedGeneration: 0 });
    const sentBefore = f.messages.length;
    await assert.rejects(f.ingress()(f.ctx, f.input()), /no longer current/);
    assert.equal(f.messages.length, sentBefore, 'a retired native generation never accepts a channel turn');
});

test('admitted scheduled tasks keep their model through opening, channel preparation, settlement and review', async t => {
    const f = await runtimeFixture(t); await f.patch({ model: { provider: 'fixture', id: 'vision' }, thinking: 'high' });
    const runId = 'a'.repeat(64), mark = status => f.manager.appendCustomEntry('pivane-cron-run', {
        version: 1, runId, sessionId: f.manager.getSessionId(), status, model: { provider: 'fixture', modelId: 'text' } });
    const before = () => f.handlers.get('before_agent_start')({ systemPromptOptions: { sections: {} } }, f.ctx);
    mark('running'); await f.handlers.get('session_start')({}, f.ctx); await f.api.prepareBotModel(f.ctx); await before();
    assert.deepEqual(f.changes, []); assert.equal(f.ctx.model.id, 'text');
    mark('settled'); await before(); assert.deepEqual(f.changes, []);
    mark('completed'); await before(); assert.equal(f.ctx.model.id, 'vision'); assert.equal(f.thinking(), 'high');
});

test('rotation and archive races reject stale settings and native commands before any old worker opens', async t => {
    const f = await fixture(t), started = deferred(), release = deferred(); let opened = 0;
    f.bots.catalog = async () => { started.resolve(); await release.promise; return catalog(); };
    const id = f.enqueue('/model fixture/vision'), pending = f.s.run(id, {}); await started.promise;
    await f.bots.rotate(f.id, f.windowId, { expectedGeneration: 0 }); release.resolve(); await pending;
    assert.equal((await f.record()).model, null); assert.notEqual(f.s.job(id).commandSubmitted, true);
    f.supervisor.getWorker = async () => { opened++; return f.worker; };
    const stale = f.enqueue('/reload');
    f.s.updateJob(stale, { status: 'dispatching', bot: { profileId: f.id, windowId: f.windowId } });
    const control = require('../server/channels/command-control').commandControl(f.s, f.s.job(stale), {});
    await assert.rejects(control.withWorker(() => {}), { code: 'CHANNEL_ADMISSION_CHANGED' }); assert.equal(opened, 0);
    f.bots.catalog = async () => catalog();
    const created = await f.bots.createTopic(f.id, { title: 'Archive boundary', expectedRevision: (await f.bots.windows.read(f.id)).revision });
    await f.send('/topic Archive boundary');
    await f.bots.updateWindow(f.id, created.window.id, { expectedRevision: (await f.bots.windows.read(f.id)).revision, archived: true });
    const result = await f.send('/name Must not apply'); assert.match(result.text, /已经归档/);
    assert.equal((await f.bots.windowRecord(f.id, created.window.id)).title, 'Archive boundary');
});

test('/new rechecks authorization inside the window CAS and rejects a lost request without creating a row', async t => {
    const f = await fixture(t), mutate = f.bots.windows.mutate.bind(f.bots.windows); let revoke = true;
    f.bots.windows.mutate = async (profileId, revision, update) => {
        if (revoke) { revoke = false; f.db.change(v => { v.accounts[0].enabled = false; }); }
        return mutate(profileId, revision, update);
    };
    const result = await f.send('/new Do not create');
    assert.equal(result.job.status, 'cancelled'); assert.notEqual(result.job.commandSubmitted, true);
    assert.equal((await f.bots.channelWindows(f.id)).windows.length, 1);
});

test('native command worker startup holds current-window reservation and releases it for the long operation', async t => {
    const f = await fixture(t), opened = deferred(), proceed = deferred(), compacted = deferred(), finish = deferred();
    f.supervisor.getWorker = async () => { opened.resolve(); await proceed.promise; return f.worker; };
    f.s.compactionResult = { status: 'success' }; f.s.onCompact = async () => { compacted.resolve(); await finish.promise; };
    const id = f.enqueue('/compact'), pending = f.s.run(id, {}); await opened.promise;
    await assert.rejects(Promise.resolve().then(() => f.bots.rotate(f.id, f.windowId, { expectedGeneration: 0 })), { status: 409 });
    proceed.resolve(); await compacted.promise;
    assert.equal(f.profiles.busy, false, 'long compaction does not hold global settings reservation');
    assert.equal(f.worker.operation, true, 'native work remains exclusive until it actually finishes');
    await f.patch({ thinking: 'high' }); assert.equal((await f.record()).thinking, 'high');
    finish.resolve(); await pending; assert.equal(f.s.job(id).status, 'delivered');
});
