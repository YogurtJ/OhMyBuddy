// M4-4: WeChat chats connected to Bots. Synthetic store, workers and Bot service; no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-channel-bot-'));
process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent'); process.env.PI_PROJECT_ROOTS = root; process.env.PI_OFFLINE = '1';
const { ChannelsService, parseSlash } = require('../server/channels/service');
const { ChannelStore } = require('../server/channels/store');
const botChannel = require('../server/channels/bot-channel');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const until = async fn => { for (let i = 0; i < 200; i++) { if (fn()) return; await delay(5); } throw Error('Fixture timed out'); };

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MAIN_A = 'a0000000-0000-4000-8000-000000000001', TOPIC_A = 'a0000000-0000-4000-8000-000000000002', MAIN_B = 'b0000000-0000-4000-8000-000000000001';

function fixture(t, { text = 'hello', binding: bindingOverride } = {}) {
    const cwd = path.join(root, String(Math.random())); fs.mkdirSync(cwd);
    const db = new ChannelStore(path.join(cwd, 'channel')); db.claim(); t.after(() => db.close());
    // Bot windows: profile → windows; each window's current generation is a session.
    const windows = {
        [A]: { name: '小狸', enabled: true, windows: [{ id: MAIN_A, kind: 'main', title: '', emoji: '', current: 'a-main-0', archived: false },
            { id: TOPIC_A, kind: 'topic', title: '旅行', emoji: '', current: 'a-topic-0', archived: false }] },
        [B]: { name: '阿木', enabled: true, windows: [{ id: MAIN_B, kind: 'main', title: '', emoji: '', current: 'b-main-0', archived: false }] }
    };
    const sessions = new Map();
    const addSession = (id, profileId, windowId) => sessions.set(id, { id, cwd, path: path.join(cwd, id + '.jsonl'), name: id,
        entries: [{ type: 'custom', customType: 'pivane-bot-window', data: { sessionId: id, profileId, windowId } }] });
    addSession('a-main-0', A, MAIN_A); addSession('a-topic-0', A, TOPIC_A); addSession('b-main-0', B, MAIN_B);
    sessions.set('plain', { id: 'plain', cwd, path: path.join(cwd, 'plain.jsonl'), name: 'plain', entries: [] });
    const windowOf = (profileId, windowId) => windows[profileId]?.windows.find(w => w.id === windowId);
    const publicWindow = w => ({ id: w.id, kind: w.kind, title: w.title, emoji: w.emoji, updatedAt: '2026-10-28T00:00:00Z' });
    const moved = new Set(), behaviour = { error: null };
    const bots = {
        async channelTarget(profileId, windowId = null) {
            if (behaviour.error) throw behaviour.error;
            const bot = windows[profileId];
            if (!bot) throw Object.assign(Error('Bot not found'), { status: 404 });
            if (!bot.enabled) throw Object.assign(Error('off'), { status: 409, code: 'BOT_DISABLED' });
            const w = windowId === null ? bot.windows.find(item => item.kind === 'main') : windowOf(profileId, windowId);
            if (!w) throw Object.assign(Error('Window not found'), { status: 404 });
            if (w.archived) throw Object.assign(Error('archived'), { status: 409, code: 'BOT_WINDOW_ARCHIVED' });
            return { name: bot.name, window: publicWindow(w), session: sessions.get(w.current) };
        },
        async channelWindows(profileId) {
            const bot = windows[profileId];
            return { name: bot.name, enabled: bot.enabled, windows: bot.windows.filter(w => !w.archived).map(publicWindow) };
        },
        async assertCurrentWindowSession(profileId, windowId, session) {
            if (windowOf(profileId, windowId)?.current !== session.id) throw Object.assign(Error('stale'), { status: 409, code: 'BOT_WINDOW_STALE' });
        },
        async list() { return { bots: Object.entries(windows).map(([id, bot]) => ({ id, name: bot.name, enabled: bot.enabled })) }; },
        sessionMoved: id => moved.has(id)
    };
    const binding = { id: 'binding', accountId: 'acct', peerId: 'owner', cwd, sessionId: 'a-main-0', name: '小狸',
        bot: { profileId: A, windowId: MAIN_A, main: true }, bots: [A], ...bindingOverride };
    db.change(v => Object.assign(v, { accounts: [{ id: 'acct', userId: 'owner', allowedUsers: ['owner'], enabled: true, token: 'fixture', baseUrl: 'https://ilinkai.weixin.qq.com', cursor: '' }],
        bindings: [binding], peers: [{ accountId: 'acct', peerId: 'owner', contextToken: 'fixture' }],
        jobs: text === null ? [] : [{ id: 'job', accountId: 'acct', peerId: 'owner', bindingId: 'binding', target: { cwd, sessionId: binding.sessionId }, status: 'queued', text }] }));
    const s = Object.create(ChannelsService.prototype), turns = [], sends = [];
    const worker = { isIdle: () => true, request: async () => ({}), async exclusive(callback) { return callback(this.request.bind(this), {}); },
        async channelTurn(input, hooks) {
            if (!hooks.admit()) return { cancelled: true };
            turns.push({ sessionId: worker.sessionId, text: input.text }); hooks.accepted(); return { status: 'completed' };
        } };
    Object.assign(s, { ready: Promise.resolve(), db, bots, runs: new Map(), operations: new Set(), pollers: new Map(), connections: new Map(),
        stopping: false, mutating: false, error: null, isSuspended: () => false, stopController: new AbortController(),
        adapter: { send: async (_a, _p, body) => { sends.push(body); return {}; } },
        store: {
            getSession: async (_cwd, id) => { if (!sessions.has(id)) throw Error('missing'); return sessions.get(id); },
            withSessionRead: async (_dir, id, fn) => fn(await s.store.getSession(_dir, id), { manager: () => ({ getEntries: () => sessions.get(id).entries, getBranch: () => sessions.get(id).entries }), validate() {} })
        },
        supervisor: { getActiveWorker: () => null, getWorker: async ({ sessionId }) => { worker.sessionId = sessionId; return worker; } },
        collectDeliverables: async () => [], collectMediaAssets: async () => [],
        readOutcome: async job => ({ status: 'completed', body: `reply from ${job.target.sessionId}` }) });
    return { s, db, cwd, windows, sessions, addSession, moved, behaviour, turns, sends };
}

test('Chinese Bot commands are recognised; unknown ones stay ordinary text', () => {
    assert.deepEqual(parseSlash('/切换 小狸'), { command: '/bot', args: '小狸' });
    assert.deepEqual(parseSlash('/话题'), { command: '/topic', args: '' });
    assert.deepEqual(parseSlash('/Help'), { command: '/help', args: '' });
    assert.equal(parseSlash('/随便说说'), null);
});

test('a Bot binding needs its window and connected Bot list on disk', t => {
    assert.equal(botChannel.validBotBinding({}), true);
    assert.equal(botChannel.validBotBinding({ bot: { profileId: A, windowId: MAIN_A, main: true }, bots: [A] }), true);
    assert.equal(botChannel.validBotBinding({ bot: { profileId: A, windowId: MAIN_A, main: true } }), false);
    assert.equal(botChannel.validBotBinding({ bot: { profileId: A, windowId: MAIN_A, main: true }, bots: [B] }), false, 'the current Bot is connected');
    const directory = path.join(root, 'invalid'); fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'state.json'), JSON.stringify({ version: 1, revision: 'r', accounts: [], peers: [], jobs: [],
        bindings: [{ id: 'b', accountId: 'a', peerId: 'p', cwd: root, sessionId: 's', bot: { profileId: A, windowId: MAIN_A, main: true }, bots: [] }] }), { mode: 0o600 });
    assert.throws(() => new ChannelStore(directory), /无效/);
});

test('a WeChat message runs in the window\'s current generation and the chat follows it', async t => {
    const { s, db, windows, addSession, turns, sends } = fixture(t);
    windows[A].windows[0].current = 'a-main-1'; addSession('a-main-1', A, MAIN_A);
    s.pump(); await until(() => s.job('job').status === 'delivered');
    assert.deepEqual(turns.map(turn => turn.sessionId), ['a-main-1']);
    assert.equal(db.value.bindings[0].sessionId, 'a-main-1', 'the binding was re-pointed');
    assert.deepEqual(sends, ['reply from a-main-1']);
});

test('a moving window keeps the message queued; nothing runs in the old generation', async t => {
    const { s, behaviour, moved, turns } = fixture(t);
    behaviour.error = Object.assign(Error('moving'), { status: 409, code: 'BOT_WINDOW_ROTATING' });
    s.pump(); await until(() => !s.runs.has('job'));
    assert.equal(s.job('job').status, 'queued'); assert.equal(turns.length, 0);
    // The move commits right before the hand-off: the turn is not cancelled, it waits.
    behaviour.error = null; moved.add('a-main-0');
    s.pump(); await until(() => !s.runs.has('job'));
    assert.equal(s.job('job').status, 'queued'); assert.equal(s.job('job').text, 'hello'); assert.equal(turns.length, 0);
});

test('a reply finished just before a move is still delivered from its own generation', async t => {
    const { s, db, cwd, addSession, sends } = fixture(t, { text: null });
    db.change(v => v.jobs.push({ id: 'done', accountId: 'acct', peerId: 'owner', bindingId: 'binding', target: { cwd, sessionId: 'a-main-0' },
        bot: { profileId: A, windowId: MAIN_A }, status: 'ready' }));
    addSession('a-main-1', A, MAIN_A);
    botChannel.windowRotated(s, { profileId: A, windowId: MAIN_A, from: { sessionId: 'a-main-0' }, to: { sessionId: 'a-main-1' } });
    assert.equal(db.value.bindings[0].sessionId, 'a-main-1');
    s.pump(); await until(() => s.job('done').status === 'delivered');
    assert.deepEqual(sends, ['reply from a-main-0']);
});

test('an archived topic sends the chat back to the main chat with an explanation', async t => {
    const { s, db, windows, turns, sends } = fixture(t, { binding: { sessionId: 'a-topic-0', bot: { profileId: A, windowId: TOPIC_A, main: false } } });
    windows[A].windows[1].archived = true;
    s.pump(); await until(() => ['delivered', 'failed', 'uncertain'].includes(s.job('job').status));
    assert.equal(s.job('job').status, 'delivered'); assert.equal(turns.length, 0);
    assert.match(sends[0], /归档/);
    assert.deepEqual([db.value.bindings[0].bot.windowId, db.value.bindings[0].sessionId], [MAIN_A, 'a-main-0']);
});

test('/切换 and /话题 move the chat; thread commands are not available', async t => {
    const { s, db, sends } = fixture(t, { text: '/切换' });
    s.pump(); await until(() => s.job('job').status === 'delivered');
    assert.match(sends[0], /\[1\] 小狸（当前）/); assert.match(sends[0], /\[2\] 阿木/);
    const send = async (id, text) => {
        db.change(v => v.jobs.push({ id, accountId: 'acct', peerId: 'owner', bindingId: 'binding', target: { cwd: v.bindings[0].cwd, sessionId: v.bindings[0].sessionId }, status: 'queued', text }));
        s.pump(); await until(() => ['delivered', 'failed', 'uncertain', 'reviewed'].includes(s.job(id).status));
        return sends.at(-1);
    };
    assert.match(await send('switch', '/切换 2'), /现在和 阿木 聊/);
    assert.deepEqual([db.value.bindings[0].id, db.value.bindings[0].bot.profileId, db.value.bindings[0].sessionId], ['binding', B, 'b-main-0']);
    assert.deepEqual(db.value.bindings[0].bots, [A, B]);
    assert.match(await send('back', '/切换 小狸'), /现在和 小狸 聊/);
    assert.match(await send('topic', '/话题 旅行'), /进入「旅行」/);
    assert.deepEqual([db.value.bindings[0].bot.windowId, db.value.bindings[0].sessionId], [TOPIC_A, 'a-topic-0']);
    assert.match(await send('new', '/new'), /不能用 \/new/);
    assert.match(await send('status', '/status'), /小狸 聊 · 旅行/);
});

test('pushes reach every chat connected to the Bot, with the speaker named when it is not current', async t => {
    const { s, db, cwd, sends } = fixture(t, { text: null, binding: { sessionId: 'b-main-0', name: '阿木', bot: { profileId: B, windowId: MAIN_B, main: true }, bots: [A, B] } });
    const event = { runId: 'run', jobId: 'job', name: '提醒', status: 'completed', notificationMode: 'inherit', replyEntryId: 'reply', proactive: true,
        target: { cwd, sessionId: 'a-main-0', bot: { profileId: A, windowId: null } } };
    event.recipients = s.captureScheduledRecipients(event);
    assert.equal(event.recipients.length, 1); assert.deepEqual(event.recipients[0].bot, { profileId: A, windowId: null });
    s.canNotifyScheduled = () => false; // a Bot-started message has no saved task
    const branch = [{ type: 'custom', customType: 'pivane-bot-window', data: { sessionId: 'a-main-0', profileId: A, windowId: MAIN_A } },
        { type: 'custom', customType: 'pivane-cron-run', data: { runId: 'run', sessionId: 'a-main-0', status: 'prepared' } },
        { type: 'custom', customType: 'pivane-cron-run', data: { runId: 'run', sessionId: 'a-main-0', status: 'running' } },
        { type: 'custom_message', customType: 'pivane-cron-message', details: { runId: 'run' } },
        { id: 'reply', type: 'message', message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: '记得带伞' }] } },
        { type: 'custom', customType: 'pivane-cron-run', data: { runId: 'run', sessionId: 'a-main-0', status: 'settled', replyEntryId: 'reply' } },
        { type: 'custom', customType: 'pivane-cron-run', data: { runId: 'run', sessionId: 'a-main-0', status: 'completed', replyEntryId: 'reply' } }];
    s.store.withSessionRead = async (_cwd, _id, fn) => fn({ id: 'a-main-0' }, { manager: () => ({ getSessionId: () => 'a-main-0', getBranch: () => branch, getEntries: () => branch }), validate() {} });
    assert.equal((await s.notifyScheduledRun(event)).status, 'accepted');
    const job = db.value.jobs.at(-1);
    assert.equal(job.kind, 'bot-push'); assert.equal(job.directReply, '记得带伞', 'no task header for a message the Bot started');
    assert.deepEqual([job.target.sessionId, job.bot], ['a-main-0', { profileId: A, windowId: MAIN_A }], 'the push keeps where it came from');
    s.store.getSession = async () => ({ path: '/x' });
    s.pump(); await until(() => !s.runs.size && s.job(job.id).status !== 'ready').catch(() => {});
    assert.equal(s.job(job.id).status, 'delivered', JSON.stringify(s.job(job.id)));
    assert.deepEqual(sends, ['【小狸】记得带伞']);
    // A chat that only receives replies to its own WeChat messages gets no Bot-started message.
    db.change(v => { v.bindings[0].replyMode = 'wechat'; });
    assert.equal(s.captureScheduledRecipients(event).length, 0);
});

test('a plain thread binding cannot target a Bot chat, and a Bot binding must match its marker', async t => {
    const { s, cwd } = fixture(t, { text: null });
    await assert.rejects(s.withBindingTarget(cwd, 'a-main-0', () => {}), /按 Bot 连接微信/);
    await assert.rejects(s.withBindingTarget(cwd, 'a-topic-0', () => {}, { bot: { profileId: A, windowId: MAIN_A } }), /不一致/);
    await s.withBindingTarget(cwd, 'a-main-0', () => {}, { bot: { profileId: A, windowId: MAIN_A } });
    await s.withBindingTarget(cwd, 'plain', () => {});
});

test('connecting and disconnecting Bots from the web keeps the chat on an available Bot', async t => {
    const { s, db } = fixture(t, { text: null, binding: { bots: [A] } });
    const account = db.value.accounts[0];
    s.healthy = () => {};
    await botChannel.bindBot(s, account, { botProfileId: B, peerId: 'owner', expectedRevision: db.value.revision });
    assert.deepEqual([db.value.bindings.length, db.value.bindings[0].bot.profileId, db.value.bindings[0].bots], [1, B, [A, B]]);
    await botChannel.unbindBot(s, { accountId: 'acct', peerId: 'owner', botProfileId: B, expectedRevision: db.value.revision });
    assert.deepEqual([db.value.bindings[0].bot.profileId, db.value.bindings[0].sessionId, db.value.bindings[0].bots], [A, 'a-main-0', [A]]);
    await botChannel.unbindBot(s, { accountId: 'acct', peerId: 'owner', botProfileId: A, expectedRevision: db.value.revision });
    assert.equal(db.value.bindings.length, 0);
});
