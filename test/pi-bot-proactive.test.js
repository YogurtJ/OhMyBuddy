'use strict';
// M4-3: messages a Bot starts itself (D-007, D-045). Follow-ups for due commitments and the Bot's
// own check-ins, quiet hours (held, then one combined push), the daily push limit, and the
// scheduler's separate per-Bot accounting.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-proactive-'));
process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent'); fs.mkdirSync(process.env.PI_CODING_AGENT_DIR);
const settings = require('../server/bot/bot-settings');
const { BotProactive, isQuiet, dueInstant } = require('../server/bot/bot-proactive');
const { normalizeScheduleInput } = require('../server/bot/bot-schedule');
const { approvalFor } = require('../server/bot/bot-guard');
const { CronService } = require('../server/pi-cron-service');
const { profileRevision } = require('../server/pi-profile-registry');

test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const ZONE = 'Asia/Shanghai';
const at = local => Date.parse(`${local}+08:00`);

function world({ notify = {}, now = at('2026-10-28T10:00:00') } = {}) {
    const agentDir = fs.mkdtempSync(path.join(root, 'agent-'));
    const id = randomUUID(), main = randomUUID(), topic = randomUUID();
    const bot = settings.normalizeBot({ ...settings.defaultBot({ workspace: path.join(root, 'ws') }), notify: { ...settings.defaultBot({ workspace: root }).notify, timeZone: ZONE, ...notify } });
    const profile = { id, name: '小狸', enabled: true, bot };
    const windows = [{ id: main, kind: 'main', current: { generation: 0 }, archivedAt: null }, { id: topic, kind: 'topic', current: { generation: 0 }, archivedAt: null }];
    const notes = new Map([[main, []], [topic, []]]);
    const enqueued = [], pushed = [];
    const clock = { value: now };
    const cron = { fail: null, async enqueueProactive(input) { if (cron.fail) throw cron.fail; enqueued.push(input); return { id: input.runId }; } };
    const proactive = new BotProactive({
        profiles: { getProfile: async pid => pid === id ? profile : null, state: async () => ({ state: { profiles: [profile] } }) },
        bots: { windows: { read: async () => ({ state: { windows } }) }, notebook: async (_pid, wid) => ({ items: notes.get(wid) || [] }) },
        cron, notifications: { broadcast: async payload => { pushed.push(payload); } },
        getAgentDir: async () => agentDir, now: () => clock.value });
    return { id, main, topic, profile, windows, notes, enqueued, pushed, clock, cron, proactive, agentDir };
}
const note = (id, text, due, extra = {}) => ({ id, kind: 'commitment', status: 'active', text, due, ...extra });

test('quiet hours wrap past midnight in the user zone; due dates become instants', () => {
    const notify = { quietHours: { start: '23:00', end: '08:00' }, timeZone: ZONE };
    assert.equal(isQuiet(notify, at('2026-10-28T23:30:00')), true);
    assert.equal(isQuiet(notify, at('2026-10-29T07:59:00')), true);
    assert.equal(isQuiet(notify, at('2026-10-29T08:00:00')), false);
    assert.equal(isQuiet(notify, at('2026-10-29T12:00:00')), false);
    assert.equal(isQuiet({ quietHours: { start: '13:00', end: '14:00' }, timeZone: ZONE }, at('2026-10-29T13:30:00')), true);
    assert.equal(isQuiet({ quietHours: null, timeZone: ZONE }, at('2026-10-29T03:00:00')), false, 'quiet hours off');
    assert.equal(dueInstant('2026-11-02', ZONE), at('2026-11-02T09:00:00'), 'a date is followed up that morning');
    assert.equal(dueInstant('2026-11-02 18:30', ZONE), at('2026-11-02T18:30:00'));
    assert.equal(dueInstant('2026-11-02T18:30:00Z', ZONE), Date.parse('2026-11-02T18:30:00Z'));
    assert.equal(dueInstant('next week', ZONE), null);
});

test('due commitments in a notebook become follow-ups that track edits; sent ones are not repeated', async () => {
    const w = world();
    w.notes.set(w.main, [note('n1', '交房租', '2026-10-30'), note('n2', '已经过期', '2026-10-01'), note('n3', '做完了', '2026-10-30', { status: 'done' }),
        { id: 'n4', kind: 'decision', status: 'active', text: '用 A 方案', due: '2026-10-30' }]);
    assert.equal((await w.proactive.syncNotes(w.id, w.main)).changed, 1);
    let list = await w.proactive.list(w.id);
    assert.deepEqual(list.map(item => [item.kind, item.noteId, item.at]), [['due', 'n1', at('2026-10-30T09:00:00')]]);
    const file = path.join(w.agentDir, 'pivane-bots', w.id, 'proactive.json');
    assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'a private file');
    assert.equal((await w.proactive.syncNotes(w.id, w.main)).changed, 0, 'unchanged notes change nothing');
    // A moved due time replaces the follow-up.
    w.notes.set(w.main, [note('n1', '交房租', '2026-10-31 20:00')]);
    await w.proactive.syncNotes(w.id, w.main);
    list = await w.proactive.list(w.id);
    assert.deepEqual(list.map(item => item.at), [at('2026-10-31T20:00:00')]);
    // Sent, then the same note is synced again: not added back.
    w.clock.value = at('2026-10-31T20:00:30');
    await w.proactive.tickBot(w.id);
    assert.equal(w.enqueued.length, 1);
    assert.equal(w.enqueued[0].windowId, undefined, 'the main chat is the Bot target itself');
    assert.equal(w.enqueued[0].kind, 'due');
    assert.match(w.enqueued[0].prompt, /交房租/);
    w.clock.value = at('2026-10-31T19:00:00');
    await w.proactive.syncNotes(w.id, w.main);
    assert.equal((await w.proactive.list(w.id)).length, 0, 'the queued follow-up is not planned again');
    // A closed commitment drops its follow-up; a cancelled one stays dropped.
    w.notes.set(w.topic, [note('t1', '写周报', '2026-11-01'), note('t2', '买票', '2026-11-02')]);
    await w.proactive.syncNotes(w.id, w.topic);
    const [first] = await w.proactive.list(w.id);
    await w.proactive.cancel(w.id, first.id);
    w.notes.set(w.topic, [note('t1', '写周报', '2026-11-01'), note('t2', '买票', '2026-11-02', { status: 'done' })]);
    await w.proactive.syncNotes(w.id, w.topic);
    assert.equal((await w.proactive.list(w.id)).length, 0, 'cancelled and closed follow-ups do not come back');
});

test('check-ins are idempotent, bounded, and refused while proactive messages are off', async () => {
    const w = world();
    const id = 'a'.repeat(24), plan = { id, title: '看看进展', message: 'Ask how the project is going.', at: at('2026-10-30T15:00:00') };
    const { item } = await w.proactive.checkIn(w.id, w.topic, plan);
    assert.equal(item.kind, 'checkin');
    assert.deepEqual((await w.proactive.checkIn(w.id, w.topic, plan)).item, item, 'a retried tool call finds the same check-in');
    await assert.rejects(w.proactive.checkIn(w.id, w.topic, { ...plan, id: 'b'.repeat(24), at: w.clock.value }), /future/);
    await assert.rejects(w.proactive.checkIn(w.id, w.topic, { ...plan, id: 'b'.repeat(24), at: w.clock.value + 61 * 86400000 }), /60 days/);
    for (let n = 1; n < 10; n++) await w.proactive.checkIn(w.id, w.topic, { ...plan, id: n.toString(16).padStart(24, 'c') });
    await assert.rejects(w.proactive.checkIn(w.id, w.topic, { ...plan, id: 'd'.repeat(24) }), error => error.code === 'BOT_CHECKIN_LIMIT');
    await w.proactive.cancel(w.id, id);
    assert.equal((await w.proactive.list(w.id)).length, 9);
    await assert.rejects(w.proactive.cancel(w.id, id), /not found/);
    const off = world({ notify: { proactive: false } });
    await assert.rejects(off.proactive.checkIn(off.id, off.main, plan), error => error.code === 'BOT_PROACTIVE_OFF');
    await assert.rejects(w.proactive.list(randomUUID()), /not found/);
});

test('sending: late, switched-off or gone chats are skipped; a busy scheduler retries', async () => {
    const w = world();
    const plan = n => ({ id: String(n).repeat(24), title: `check ${n}`, message: 'Check in.', at: at('2026-10-28T12:00:00') });
    await w.proactive.checkIn(w.id, w.topic, plan(1));
    w.clock.value = at('2026-10-28T12:00:05');
    w.cron.fail = Object.assign(new Error('busy'), { status: 409 });
    await w.proactive.tickBot(w.id);
    assert.equal((await w.proactive.list(w.id)).length, 1, 'still pending after a busy scheduler');
    w.cron.fail = null;
    await w.proactive.tickBot(w.id);
    assert.equal(w.enqueued.length, 1);
    assert.equal(w.enqueued[0].windowId, w.topic);
    assert.match(w.enqueued[0].runId, /^[a-f0-9]{64}$/);
    // Missed by more than two hours (service stopped): dropped.
    w.clock.value = at('2026-10-28T13:00:00');
    await w.proactive.checkIn(w.id, w.main, { ...plan(2), at: at('2026-10-28T13:30:00') });
    w.clock.value = at('2026-10-28T16:00:00');
    await w.proactive.tickBot(w.id);
    assert.equal(w.enqueued.length, 1);
    // A chat archived before its time: dropped.
    w.clock.value = at('2026-10-28T16:00:00');
    await w.proactive.checkIn(w.id, w.topic, { ...plan(3), at: at('2026-10-28T17:00:00') });
    w.windows[1].archivedAt = '2026-10-28T16:30:00Z';
    w.clock.value = at('2026-10-28T17:00:10');
    await w.proactive.tickBot(w.id);
    assert.equal(w.enqueued.length, 1);
    const { state } = await w.proactive.read(w.id);
    assert.deepEqual(state.items.filter(item => item.state === 'skipped').map(item => item.reason).sort(), ['chat-gone', 'late']);
});

test('pushes: held in quiet hours and combined once they end; the daily limit only stops pushing', async () => {
    const w = world({ notify: { dailyProactiveLimit: 2 } });
    const notice = n => ({ completionId: `run-${n}`, proactive: { profileId: w.id } });
    assert.equal(await w.proactive.decide(notice(1)), 'push');
    assert.equal(await w.proactive.decide(notice(2)), 'push');
    assert.equal(await w.proactive.decide(notice(3)), 'capped', 'over the limit: the message stays in the chat, unpushed');
    w.clock.value = at('2026-10-28T23:30:00');
    assert.equal(await w.proactive.decide(notice(4)), 'held');
    w.clock.value = at('2026-10-29T02:00:00');
    assert.equal(await w.proactive.decide(notice(5)), 'held');
    await w.proactive.tickBot(w.id);
    assert.equal(w.pushed.length, 0, 'nothing is pushed during quiet hours');
    w.clock.value = at('2026-10-29T08:01:00');
    await w.proactive.tickBot(w.id);
    assert.equal(w.pushed.length, 1, 'one combined push, on a new day');
    assert.match(w.pushed[0].body, /2 条/);
    await w.proactive.tickBot(w.id);
    assert.equal(w.pushed.length, 1, 'held messages are pushed once');
    assert.equal(await w.proactive.decide(notice(6)), 'push', 'the combined push counted as one');
    assert.equal(await w.proactive.decide(notice(7)), 'capped');
    assert.equal(await w.proactive.decide({ completionId: 'x', proactive: { profileId: randomUUID() } }), 'capped', 'an unknown Bot never pushes');
    const open = world({ notify: { dailyProactiveLimit: null, quietHours: null } });
    for (let n = 0; n < 30; n++) assert.equal(await open.proactive.decide({ completionId: `r${n}`, proactive: { profileId: open.id } }), 'push');
});

test('the Bot sets its own check-in without an approval card; user-asked tasks still ask', () => {
    const input = normalizeScheduleInput({ action: 'create', title: '回来看看', message: 'Ask how it went.', once: '2099-01-01 10:00', proactive: true });
    assert.equal(input.proactive, true);
    assert.equal(approvalFor({ permissions: { preset: 'ask', rules: [] }, toolName: 'bot_schedule', input, cwd: root, agentDir: root }), null);
    const asked = normalizeScheduleInput({ action: 'create', title: '提醒', message: 'Remind me.', once: '2099-01-01 10:00' });
    assert.equal(approvalFor({ permissions: { preset: 'ask', rules: [] }, toolName: 'bot_schedule', input: asked, cwd: root, agentDir: root }).kind, 'schedule');
    assert.throws(() => normalizeScheduleInput({ action: 'create', title: 'x', message: 'y', repeat: '0 9 * * *', proactive: true }), /single message/);
    assert.throws(() => normalizeScheduleInput({ action: 'create', title: 'x', message: 'y', once: '2099-01-01 10:00', needsTools: true, proactive: true }), /single message/);
    assert.equal(normalizeScheduleInput({ action: 'cancel', id: 'e'.repeat(24) }).id, 'e'.repeat(24), 'a follow-up id can be cancelled');
});

test('the scheduler runs a Bot follow-up once, text only, counted apart from the user budget', async () => {
    const id = randomUUID(), cwd = path.join(root, 'bot-ws'), sessionId = randomUUID();
    const profile = { id, name: '小狸', enabled: true, bot: settings.normalizeBot(settings.defaultBot({ workspace: cwd })) };
    const clock = { value: Date.parse('2026-10-28T04:00:00Z') }, calls = [], emitted = [];
    const worker = { disposed: false, loadedBot: { profileId: id }, loadedAgentProfileConfirmed: true, loadedAgentProfileId: id, loadedAgentProfileRevision: profileRevision(profile),
        exclusive: async callback => callback(null, { model: { cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 } } }),
        cron: async input => { calls.push(input); return { status: 'completed', replyEntryId: 'e1', completedAt: clock.value }; } };
    const service = new CronService({ filename: path.join(root, `${randomUUID()}.sqlite`), now: () => clock.value, catalog: async () => ({ models: [] }),
        profiles: { getProfile: async () => profile }, bots: { mainSession: async () => ({ cwd, id: sessionId }) },
        store: { getSession: async (c, s) => ({ cwd: c, id: s, path: path.join(root, s), agentProfile: { id, available: true } }) },
        supervisor: { workers: new Map(), isSessionIdle: () => true, getWorker: async () => worker, getActiveWorker: () => null, emit: (...args) => emitted.push(args) } });
    clearInterval(service.timer);
    try {
        await service.ready;
        const runId = 'f'.repeat(64);
        const input = { runId, profileId: id, at: clock.value, name: '看看进展', prompt: 'Ask how it went.', note: '看看进展', kind: 'checkin', timeZone: ZONE };
        const run = await service.enqueueProactive(input);
        assert.equal(run.status, 'waiting');
        assert.equal((await service.enqueueProactive(input)).id, runId, 'the same follow-up is one run');
        await assert.rejects(service.enqueueProactive({ ...input, runId: 'e'.repeat(64), kind: 'other' }), /Invalid/);
        assert.equal(service.db.jobs().length, 0, 'never a saved task');
        await service.tick();
        assert.equal(calls.length, 1);
        assert.deepEqual([calls[0].mode, calls[0].origin, calls[0].note, calls[0].maxTokens], ['text', 'bot', '看看进展', 32000]);
        assert.equal(service.db.run(runId).status, 'completed');
        const completion = emitted.find(([name]) => name === 'completion')[1];
        assert.deepEqual(completion.proactive, { profileId: id });
        const day = new Date(clock.value).toISOString().slice(0, 10);
        assert.equal(service.db.usage(day).runs, 0, 'the user\'s daily budget is untouched');
        assert.equal(service.db.proactiveRuns(day, id), 1);
    } finally { await service.dispose(); }
});

test('replies sync the notebook at most every two minutes, always including the latest', async t => {
    const w = world();
    const calls = [];
    w.proactive.syncNotes = async (pid, wid) => { calls.push([pid, wid, w.clock.value]); return { changed: 0 }; };
    t.mock.timers.enable({ apis: ['setTimeout'] });
    w.proactive.afterReply(w.id, w.main);
    w.proactive.afterReply(w.id, w.main);
    w.proactive.afterReply(w.id, w.main);
    assert.equal(calls.length, 1, 'the first reply syncs at once');
    t.mock.timers.tick(119000);
    assert.equal(calls.length, 1);
    w.clock.value += 120000; t.mock.timers.tick(1000);
    assert.equal(calls.length, 2, 'one trailing sync for the replies in between');
    w.proactive.afterReply(w.id, w.topic);
    assert.equal(calls.length, 3, 'each chat on its own');
    w.proactive.afterReply(w.id, 'not-a-window');
    await w.proactive.dispose();
    w.proactive.afterReply(w.id, w.main);
    assert.equal(calls.length, 3, 'nothing after stopping');
});
