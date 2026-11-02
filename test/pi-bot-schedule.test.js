const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-schedule-')));
const agentDir = path.join(root, 'agent');
fs.mkdirSync(agentDir);
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_PROJECT_ROOTS = root; process.env.OHMYBUDDY_WORKSPACES_DIR = path.join(root, 'workspaces');
process.env.PI_OFFLINE = '1';
process.env.PI_WEB_DEFERRED_FILE = path.join(root, 'deferred.json');
const { createPiAgentGateway } = require('../server/pi-agent-routes');
const { WorkspaceAccessService } = require('../server/workspace-access-service');
const { profileRevision } = require('../server/pi-profile-registry');
const { localTime, normalizeScheduleInput, scheduleFor } = require('../server/bot/bot-schedule');
const { BLOCKED, parseApprovalMessage } = require('../server/bot/bot-guard');
const clock = Date.parse('2026-10-25T01:00:00Z');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

async function fixture(t) {
    const access = new WorkspaceAccessService({ envToken: () => 'synthetic-management' });
    const gateway = createPiAgentGateway({ accessService: access, cronFilePath: path.join(root, `${randomUUID()}.sqlite`) });
    const { bots, store, supervisor, cron } = gateway;
    clearInterval(cron.timer); await cron.ready; cron.healthy(); cron.now = () => clock;
    const app = require('express')(); app.use(require('express').json()); gateway.mount(app);
    const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => {
        supervisor.workers.clear();
        await gateway.dispose(); access.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    async function newBot() { return bots.create({ expectedRevision: (await store.profiles.state()).revision }); }
    const created = await newBot(), profileId = created.bot.id, windowId = created.window.id;
    const session = (await bots.resolve(profileId, windowId)).session;
    function workerFor(session, windowId, generation = 0) {
        const worker = { cwd: session.cwd, sessionPath: session.path, sessionId: session.id, navigationToken: `synthetic-${randomUUID()}`,
            loadedBot: { profileId, windowId, generation }, disposed: false, restarting: false, noSession: false };
        supervisor.workers.set(session.path, worker);
        return worker;
    }
    const worker = workerFor(session, windowId);
    async function call(action, input = {}, token = worker.navigationToken) {
        const response = await fetch(`${origin}/api/pi/bot-schedule/${action}`, { method: 'POST', headers: {
            'Content-Type': 'application/json', ...(token === null ? {} : { Authorization: `Bearer ${token}` }) }, body: JSON.stringify(input) });
        return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
    }
    const onceInput = { toolCallId: 'once-call', title: '吃晚饭', message: '提醒我吃晚饭', once: '2026-10-26 19:00', timeZone: 'Asia/Shanghai' };
    return { ...gateway, access, origin, profileId, windowId, session, worker, workerFor, call, newBot, onceInput };
}

test('bot_schedule authenticates only live Bot workers in their current generation and never trusts body identities', async t => {
    const f = await fixture(t);
    assert.equal((await f.call('list', {}, null)).status, 401);
    assert.equal((await f.call('list', {}, 'synthetic-management')).status, 403, 'management access is insufficient');
    const loaded = f.worker.loadedBot;
    f.worker.loadedBot = null;
    assert.equal((await f.call('list')).status, 403, 'a non-Bot worker has no schedule access');
    f.worker.loadedBot = loaded;
    for (const flag of ['disposed', 'restarting', 'noSession']) {
        f.worker[flag] = true;
        assert.equal((await f.call('list')).status, 401, flag);
        f.worker[flag] = false;
    }
    const other = await f.newBot();
    assert.equal((await f.call('create', { ...f.onceInput, profileId: other.bot.id, windowId: other.window.id })).status, 400);
    assert.equal(f.cron.db.jobs().length, 0, 'spoofed identity creates nothing');
    const created = await f.call('create', f.onceInput);
    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.deepEqual(f.cron.db.job(created.data.job.id).target, { kind: 'profile', profileId: f.profileId });
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    SessionManager.open(f.session.path).appendMessage({ role: 'user', content: 'hello', timestamp: clock });
    f.supervisor.workers.delete(f.session.path); // no runtime is involved in this synthetic rotation
    await f.bots.rotate(f.profileId, f.windowId, { expectedGeneration: 0 });
    f.supervisor.workers.set(f.session.path, f.worker);
    const stale = await f.call('list');
    assert.equal(stale.status, 409);
    assert.match(stale.data.error, /新的记录|generation/);
    assert.equal((await f.call('create', { ...f.onceInput, toolCallId: 'stale' })).status, 409);
    assert.equal((await f.call('cancel', { id: created.data.job.id })).status, 409);
    assert.equal(f.cron.db.job(created.data.job.id).deleted, undefined);
});

test('bot_schedule creates once and repeat tasks with stable ids, defaults and the documented JobView', async t => {
    const f = await fixture(t);
    const first = await f.call('create', { ...f.onceInput, message: 'x'.repeat(600) });
    assert.equal(first.status, 200, JSON.stringify(first.data)); assert.equal(first.cache, 'no-store');
    assert.deepEqual(first.data, { v: 1, action: 'created', job: {
        id: first.data.job.id, title: '吃晚饭', message: 'x'.repeat(500), schedule: { kind: 'once', at: Date.parse('2026-10-26T11:00:00Z'), timeZone: 'Asia/Shanghai' },
        nextAt: Date.parse('2026-10-26T11:00:00Z'), enabled: true, revision: 1, windowId: null, local: '2026-10-26 19:00'
    } });
    const job = f.cron.db.job(first.data.job.id);
    assert.equal(job.mode, 'text'); assert.equal(job.prompt.length, 600);
    assert.deepEqual(job.execution, { maxCalls: null, maxTokens: null, maxDurationSeconds: 21600,
        maxCost: null, maxIdleSeconds: 900, maxRepeatedErrors: 5 });
    assert.deepEqual(job.budget, { maxRunsPerDay: null, maxTokensPerDay: null, maxCostPerDay: null });
    const retried = await f.call('create', { ...f.onceInput, message: 'x'.repeat(600) });
    assert.deepEqual(retried.data, first.data); assert.equal(f.cron.db.jobs().length, 1);
    assert.equal((await f.call('create', { ...f.onceInput, message: 'changed' })).status, 409, 'same call cannot overwrite');
    f.cron.now = () => Date.parse('2026-10-27T00:00:00Z');
    assert.deepEqual((await f.call('create', { ...f.onceInput, message: 'x'.repeat(600) })).data, first.data, 'a retry after the date returns the original');
    f.cron.now = () => clock;
    const repeat = await f.call('create', { title: '工作日简报', message: '查天气再写简报', repeat: '0  9 * * 1-5', needsTools: true, toolCallId: 'repeat-call' });
    assert.equal(repeat.status, 200, JSON.stringify(repeat.data));
    assert.deepEqual(repeat.data.job.schedule, { kind: 'cron', expression: '0 9 * * 1-5', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    assert.equal(f.cron.db.job(repeat.data.job.id).mode, 'work');
    const listed = await f.call('list', { timeZone: 'Asia/Shanghai' });
    assert.equal(listed.data.now, '2026-10-25 09:00'); assert.equal(listed.data.action, 'listed');
    assert.equal(listed.data.jobs.length, 2);
});

test('bot_schedule refuses past dates, DST gaps, bad inputs and self-scheduling during unattended runs', async t => {
    const f = await fixture(t);
    for (const [change, message] of [
        [{ once: '2026-10-24 19:00' }, /past/],
        [{ once: '2027-03-14 02:30', timeZone: 'America/New_York' }, /does not exist.*gap/],
        [{ once: '2026-02-30 19:00' }, /date/],
        [{ repeat: '0 9 * * *' }, /exactly one/],
        [{ once: null }, /exactly one/],
        [{ timeZone: 'No/Such_Zone' }, /time zone/],
        [{ title: 'x'.repeat(121) }, /title/],
        [{ once: null, repeat: '0 9 * * * *' }, /five-field/],
        [{ needsTools: 'yes' }, /needsTools/]
    ]) {
        const result = await f.call('create', { ...f.onceInput, ...change });
        assert.equal(result.status, 400, JSON.stringify(change)); assert.match(result.data.error, message);
    }
    assert.equal((await f.call('list', { timeZone: 'Invalid/Zone' })).status, 400);
    f.worker.cronRun = 'synthetic-active';
    const denied = await f.call('create', f.onceInput);
    assert.equal(denied.status, 409); assert.match(denied.data.error, /unattended scheduled run/);
    assert.equal(f.cron.db.jobs().length, 0);
    assert.equal((await f.call('list')).status, 200, 'reading remains available');
});

test('Bot schedule lists and cancels only profile jobs for this Bot, across its windows', async t => {
    const f = await fixture(t);
    const mine = (await f.call('create', f.onceInput)).data.job;
    const topic = await f.store.profiles.reserve(() => f.bots.createWindowLocked(f.profileId, 'topic', { title: '读书' }));
    const topicSession = (await f.bots.resolve(f.profileId, topic.id)).session;
    const topicWorker = f.workerFor(topicSession, topic.id);
    const topicJob = await f.call('create', { ...f.onceInput, toolCallId: 'topic-call' }, topicWorker.navigationToken);
    assert.equal(topicJob.status, 200, JSON.stringify(topicJob.data)); assert.equal(topicJob.data.job.windowId, topic.id);
    const other = await f.newBot();
    const external = await f.cron.save({ id: randomUUID(), name: 'Other', prompt: 'Other Bot', mode: 'text', enabled: true,
        schedule: mine.schedule, target: { kind: 'profile', profileId: other.bot.id } });
    const direct = await f.cron.save({ ...external, id: randomUUID(), target: { kind: 'thread', cwd: f.session.cwd, sessionId: f.session.id } });
    assert.deepEqual(new Set((await f.call('list')).data.jobs.map(job => job.id)), new Set([mine.id, topicJob.data.job.id]));
    for (const id of [external.id, direct.id, randomUUID()]) {
        const result = await f.call('cancel', { id }); assert.equal(result.status, 404); assert.equal(result.data.error, 'Task not found');
    }
    const edited = await f.cron.save({ ...f.cron.db.job(mine.id), name: 'Changed' });
    const changed = await f.call('cancel', { id: mine.id, expectedRevision: mine.revision });
    assert.equal(changed.status, 409); assert.match(changed.data.error, /changed after it was approved; list again/);
    assert.equal(f.cron.db.job(mine.id).revision, edited.revision);
    assert.equal(f.cron.db.job(mine.id).deleted, undefined);
    const cancelled = await f.call('cancel', { id: topicJob.data.job.id }, f.worker.navigationToken);
    assert.equal(cancelled.status, 200); assert.equal(cancelled.data.action, 'cancelled');
    assert.equal(cancelled.data.job.enabled, false); assert.equal(cancelled.data.job.revision, 2);
    assert.deepEqual((await f.call('list')).data.jobs.map(job => job.id), [mine.id]);
    assert.equal(f.cron.db.job(external.id).deleted, undefined);
});

test('topic profile targets keep their window through edits and dispatch to the current generation after rotation', async t => {
    const f = await fixture(t);
    const topic = await f.store.profiles.reserve(() => f.bots.createWindowLocked(f.profileId, 'topic', { title: '读书' }));
    const first = (await f.bots.resolve(f.profileId, topic.id)).session;
    const worker = f.workerFor(first, topic.id);
    const result = await f.call('create', f.onceInput, worker.navigationToken);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    const saved = f.cron.db.job(result.data.job.id);
    assert.deepEqual(saved.target, { kind: 'profile', profileId: f.profileId, windowId: topic.id });
    assert.equal((await f.cron.target(saved.target)).id, first.id);
    await f.cron.save({ ...saved, name: 'Edited on the task page', target: { kind: 'profile', profileId: f.profileId } });
    assert.deepEqual(f.cron.db.job(saved.id).target, saved.target, 'an existing editor that omits windowId preserves the destination');
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    SessionManager.open(first.path).appendMessage({ role: 'user', content: 'topic hello', timestamp: clock });
    f.supervisor.workers.delete(first.path);
    await f.bots.rotate(f.profileId, topic.id, { expectedGeneration: 0 });
    const second = (await f.bots.resolve(f.profileId, topic.id)).session;
    assert.notEqual(second.id, first.id);
    assert.equal((await f.cron.target(saved.target)).id, second.id);
    const profile = await f.store.profiles.getProfile(f.profileId);
    const dispatched = [];
    const runtime = { loadedAgentProfileConfirmed: true, loadedAgentProfileId: profile.id, loadedAgentProfileRevision: profileRevision(profile),
        exclusive: fn => fn(null, {}), cron: async input => { dispatched.push(input); return { status: 'completed', usage: {} }; } };
    f.supervisor.isSessionIdle = () => true;
    f.supervisor.getWorker = async input => { assert.equal(input.sessionId, second.id); return runtime; };
    const latest = f.cron.db.job(saved.id);
    const run = await f.cron.action(saved.id, { action: 'run', revision: latest.revision, requestId: randomUUID() });
    await f.cron.dispatch(run);
    assert.equal(dispatched.length, 1, 'dispatch recheck must resolve the topic, not the main chat');
    assert.equal(f.cron.db.run(run.id).target.sessionId, second.id);
    for (const windowId of ['invalid', randomUUID()]) await assert.rejects(f.cron.save({ ...latest, id: randomUUID(), enabled: false,
        target: { kind: 'profile', profileId: f.profileId, windowId } }), /target|Window not found/);
    const other = await f.newBot();
    await assert.rejects(f.cron.save({ ...latest, id: randomUUID(), target: { kind: 'profile', profileId: other.bot.id, windowId: topic.id } }), /Window not found/);
});

async function workerTool(t, f) {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const manager = SessionManager.open(f.session.path);
    const context = await f.bots.windowContext(manager, { cwd: f.session.cwd, sessionId: f.session.id, sessionPath: f.session.path });
    const values = { PIVANE_BOT_CONTEXT: JSON.stringify(context), PI_WEB_NAVIGATION_TOKEN: f.worker.navigationToken, PI_WORKSPACE_INTERNAL_ORIGIN: f.origin };
    for (const [key, value] of Object.entries(values)) {
        const prior = process.env[key]; process.env[key] = value;
        t.after(() => { if (prior === undefined) delete process.env[key]; else process.env[key] = prior; });
    }
    const file = path.join(__dirname, '../server/bot/bot-context-extension.ts');
    const { registerBotContext } = await require(process.env.PIVANE_TEST_PI_JITI).createJiti(file).import(file);
    const handlers = new Map(), tools = new Map();
    const pi = { on(name, handler) { handlers.set(name, handler); }, registerTool(tool) { tools.set(tool.name, tool); }, getAllTools: () => [...tools.values()] };
    registerBotContext(pi, () => agentDir);
    const approvals = [];
    const ctx = { mode: 'rpc', cwd: f.session.cwd, sessionManager: manager, hasUI: true, model: null,
        ui: { notify() {}, confirm: async (_title, message) => { approvals.push(parseApprovalMessage(message)); return true; } } };
    await handlers.get('session_start')({}, ctx);
    return { manager, handlers, tools, ctx, approvals, pi, registerBotContext };
}

test('the verified Bot tool returns schedule details, reuses approval values, and protects cancellation revisions', async t => {
    const f = await fixture(t), w = await workerTool(t, f);
    const tool = w.tools.get('bot_schedule'); assert.ok(tool);
    assert.equal(Object.hasOwn(tool.parameters.properties, 'expectedRevision'), false, 'revision is not model input');
    await f.bots.update(f.profileId, { expectedRevision: (await f.store.profiles.state()).revision, changes: { bot: { permissions: { preset: 'balanced' } } } });
    const params = { action: 'create', title: 'Read', message: 'Read with me', repeat: '0  19 * * *' };
    const event = { toolName: 'bot_schedule', toolCallId: 'tool-create', input: params };
    assert.equal(await w.handlers.get('tool_call')(event, w.ctx), undefined);
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    assert.equal(w.approvals[0].kind, 'schedule');
    assert.equal(w.approvals[0].detail, `Create: Read\n0 19 * * * (${zone})`);
    const result = await tool.execute(event.toolCallId, { ...params, timeZone: 'Pacific/Honolulu' }, undefined, undefined, w.ctx);
    const details = result.details.pivaneBotSchedule;
    assert.deepEqual(JSON.parse(result.content[0].text), details);
    assert.equal(details.action, 'created'); assert.equal(details.job.schedule.timeZone, zone, 'execution uses the approved values');
    const id = details.job.id;
    const cancel = { toolName: 'bot_schedule', toolCallId: 'tool-cancel', input: { action: 'cancel', id } };
    assert.equal(await w.handlers.get('tool_call')(cancel, w.ctx), undefined);
    assert.equal(w.approvals[1].detail, `Cancel: Read\n0 19 * * * (${zone})`);
    const job = f.cron.db.job(id);
    await f.cron.save({ ...job, name: 'Edited after approval' });
    await assert.rejects(tool.execute(cancel.toolCallId, cancel.input, undefined, undefined, w.ctx), /changed after it was approved/);
    assert.equal(f.cron.db.job(id).deleted, undefined);
    assert.equal(await w.handlers.get('tool_call')(cancel, w.ctx), undefined);
    assert.match(w.approvals[2].detail, /Edited after approval/);
    const cancelled = await tool.execute(cancel.toolCallId, cancel.input, undefined, undefined, w.ctx);
    assert.equal(cancelled.details.pivaneBotSchedule.action, 'cancelled');
    const list = { toolName: 'bot_schedule', toolCallId: 'tool-list', input: { action: 'list', timeZone: 'Asia/Shanghai' } };
    const before = w.approvals.length;
    assert.equal(await w.handlers.get('tool_call')(list, w.ctx), undefined);
    const listed = await tool.execute(list.toolCallId, list.input, undefined, undefined, w.ctx);
    assert.deepEqual(listed.details.pivaneBotSchedule, { v: 1, action: 'listed', jobs: [], now: '2026-10-25 09:00' });
    const unknown = { ...cancel, toolCallId: 'unknown', input: { action: 'cancel', id: randomUUID() } };
    assert.equal(await w.handlers.get('tool_call')(unknown, w.ctx), undefined);
    await assert.rejects(tool.execute(unknown.toolCallId, unknown.input, undefined, undefined, w.ctx), /Task not found/);
    assert.equal(w.approvals.length, before, 'reading and unknown ids ask nothing');
    const tools = new Map();
    const staleCtx = { ...w.ctx, sessionManager: { getSessionId: () => randomUUID() } };
    await assert.rejects(tool.execute('stale', list.input, undefined, undefined, staleCtx), /unavailable/);
    // The same extension in an unverified conversation registers no Bot tools.
    const handlers = new Map();
    w.registerBotContext({ on(name, handler) { handlers.set(name, handler); }, registerTool(tool) { tools.set(tool.name, tool); } }, () => agentDir);
    await handlers.get('session_start')({}, staleCtx);
    assert.equal(tools.has('bot_schedule'), false);
});

test('schedule approval cleanup handles declines and aborted calls, while unattended creation is refused even in free mode', async t => {
    const f = await fixture(t), w = await workerTool(t, f), tool = w.tools.get('bot_schedule');
    await f.bots.update(f.profileId, { expectedRevision: (await f.store.profiles.state()).revision, changes: { bot: { permissions: { preset: 'ask' } } } });
    const params = { action: 'create', title: 'Check', message: 'Say hello', once: '2026-10-26 19:00', timeZone: 'Asia/Shanghai' };
    const event = { toolName: 'bot_schedule', toolCallId: 'blocked-call', input: params };
    w.ctx.ui.confirm = async () => false;
    assert.deepEqual(await w.handlers.get('tool_call')(event, w.ctx), { block: true, reason: BLOCKED.not_approved });
    // Synthetic direct execution after a blocked hook proves its cached values were discarded.
    const changed = { ...params, title: 'New title' };
    const output = await tool.execute(event.toolCallId, changed, undefined, undefined, w.ctx);
    assert.equal(output.details.pivaneBotSchedule.job.title, 'New title');
    const aborted = new AbortController();
    w.ctx.ui.confirm = async () => { aborted.abort(); return true; }; w.ctx.signal = aborted.signal;
    assert.deepEqual(await w.handlers.get('tool_call')({ ...event, toolCallId: 'aborted' }, w.ctx), { block: true, reason: BLOCKED.not_approved });
    delete w.ctx.signal;
    const afterAbort = await tool.execute('aborted', changed, undefined, undefined, w.ctx);
    assert.equal(afterAbort.details.pivaneBotSchedule.job.title, 'New title');
    w.manager.appendCustomEntry('pivane-cron-run', { sessionId: f.session.id, runId: 'synthetic-run', status: 'settled' });
    assert.deepEqual(await w.handlers.get('tool_call')({ ...event, toolCallId: 'unattended' }, w.ctx), { block: true, reason: BLOCKED.unattended });
    await f.bots.update(f.profileId, { expectedRevision: (await f.store.profiles.state()).revision, changes: { bot: { permissions: { preset: 'free' } } } });
    assert.equal(await w.handlers.get('tool_call')({ ...event, toolCallId: 'free-run' }, w.ctx), undefined);
    await assert.rejects(tool.execute('free-run', params, undefined, undefined, w.ctx), /unattended scheduled run/);
    const list = await tool.execute('list-during-run', { action: 'list' }, undefined, undefined, w.ctx);
    assert.equal(list.details.pivaneBotSchedule.action, 'listed');
});

test('the Bot\'s own check-ins skip approval; cancelling a commitment reminder asks like a task (M4-3)', async t => {
    const f = await fixture(t), w = await workerTool(t, f), tool = w.tools.get('bot_schedule');
    await f.bots.update(f.profileId, { expectedRevision: (await f.store.profiles.state()).revision, changes: { bot: { permissions: { preset: 'ask' } } } });
    const items = [{ id: 'a'.repeat(24), kind: 'due', windowId: f.windowId, at: Date.parse('2026-10-30T01:00:00Z'), title: '交房租', state: 'pending' },
        { id: 'b'.repeat(24), kind: 'checkin', windowId: f.windowId, at: Date.parse('2026-10-31T01:00:00Z'), title: '看看', state: 'pending' }];
    const calls = [];
    f.bots.proactive = {
        list: async () => items.slice(),
        cancel: async (profileId, id) => { calls.push(['cancel', id]); return { cancelled: items.find(item => item.id === id) }; },
        checkIn: async (profileId, windowId, input) => { calls.push(['checkIn', input]); return { item: { id: input.id, kind: 'checkin', windowId, at: input.at, title: input.title, state: 'pending' } }; }
    };
    const before = w.approvals.length;
    const create = { toolName: 'bot_schedule', toolCallId: 'own-checkin', input: { action: 'create', title: '回来看看', message: 'Ask how it went.', once: '2026-10-27 10:00', timeZone: 'Asia/Shanghai', proactive: true } };
    assert.equal(await w.handlers.get('tool_call')(create, w.ctx), undefined);
    const created = (await tool.execute(create.toolCallId, create.input, undefined, undefined, w.ctx)).details.pivaneBotSchedule;
    assert.deepEqual([created.action, created.proactive, created.followUp.kind], ['created', true, 'checkin']);
    assert.match(calls[0][1].id, /^[a-f0-9]{24}$/);
    assert.equal(f.cron.db.jobs().length, 0, 'never a saved task');
    const own = { toolName: 'bot_schedule', toolCallId: 'cancel-own', input: { action: 'cancel', id: 'b'.repeat(24) } };
    assert.equal(await w.handlers.get('tool_call')(own, w.ctx), undefined);
    assert.equal(w.approvals.length, before, 'its own check-in: no card');
    const due = { toolName: 'bot_schedule', toolCallId: 'cancel-due', input: { action: 'cancel', id: 'a'.repeat(24) } };
    w.ctx.ui.confirm = async (_title, message) => { w.approvals.push(parseApprovalMessage(message)); return false; };
    assert.deepEqual(await w.handlers.get('tool_call')(due, w.ctx), { block: true, reason: BLOCKED.not_approved });
    assert.equal(w.approvals.length, before + 1);
    assert.match(w.approvals.at(-1).detail, /^Cancel reminder: 交房租\n/);
    const listed = (await tool.execute('list-own', { action: 'list' }, undefined, undefined, w.ctx)).details.pivaneBotSchedule;
    assert.deepEqual(listed.followUps.map(item => item.id), [items[0].id, items[1].id]);
    for (const bad of [{ repeat: '0 9 * * *' }, { needsTools: true }]) {
        const input = { action: 'create', title: 'x', message: 'y', proactive: true, timeZone: 'Asia/Shanghai', ...(bad.repeat ? bad : { once: '2026-10-27 10:00', ...bad }) };
        await assert.rejects(w.handlers.get('tool_call')({ toolName: 'bot_schedule', toolCallId: `bad-${Object.keys(bad)[0]}`, input }, w.ctx),
            /single message/, 'a repeating or tool-using "check-in" is refused before running');
    }
});

test('schedule normalization treats empty optional fields as absent and resolves a DST fold once', () => {
    const normalized = normalizeScheduleInput({ action: 'create', title: 'Test', message: 'Hi', once: '2026-11-01 01:30', repeat: '', timeZone: 'America/New_York', needsTools: false, id: '' });
    assert.equal(scheduleFor(normalized).at, Date.parse('2026-11-01T05:30:00Z'));
    assert.equal(localTime(scheduleFor(normalized).at, normalized.timeZone), normalized.once);
    assert.deepEqual(normalizeScheduleInput({ action: 'cancel', id: randomUUID(), once: '', repeat: null }).action, 'cancel');
});
