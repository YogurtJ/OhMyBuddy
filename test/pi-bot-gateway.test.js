const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const { WebSocket } = require('ws');

// Real gateway and Pi worker, offline, synthetic identity and a local fixture provider.
// Covers Bot-window admission on the WebSocket, interrupted-rotation recovery with attached
// pages, and scheduled runs that reopen a stale Bot main chat.
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pi-bot-gateway-')));
delete process.env.PORT;
process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent'); process.env.PI_PROJECT_ROOTS = root; process.env.OHMYBUDDY_WORKSPACES_DIR = path.join(root, 'workspaces');
process.env.PI_WEB_DEFERRED_FILE = path.join(root, 'deferred.json'); process.env.PI_OFFLINE = '1'; process.env.PI_WEB_TOKEN = 'bot-gateway-fixture';
const TOKEN = 'bot-gateway-fixture';
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const deadline = async (fn, tries = 400) => {
    for (let i = 0; i < tries; i++) { const value = await fn(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 50)); }
    throw new Error('Fixture timed out');
};

async function setup(t) {
    const calls = [];
    const provider = http.createServer(async (req, res) => {
        let body = ''; for await (const part of req) body += part;
        const input = JSON.parse(body); calls.push(input);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const chunk = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: input.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
        chunk({ role: 'assistant', content: 'Scheduled greeting fixture' }); chunk({}, 'stop');
        res.end('data: [DONE]\n\n');
    });
    provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
    fs.mkdirSync(process.env.PI_CODING_AGENT_DIR, { recursive: true });
    // Two differently priced models: the Bot's own and the one a scheduled task selects.
    const model = (id, input) => ({ id, reasoning: false, input: ['text'], contextWindow: 32000, maxTokens: 1000, cost: { input, output: input * 2, cacheRead: 0, cacheWrite: 0 } });
    fs.writeFileSync(path.join(process.env.PI_CODING_AGENT_DIR, 'models.json'), JSON.stringify({ providers: { fixture: { baseUrl: `http://127.0.0.1:${provider.address().port}/v1`, api: 'openai-completions', apiKey: 'fixture', models: [model('normal', 1), model('scheduled', 5)] } } }));
    fs.writeFileSync(path.join(process.env.PI_CODING_AGENT_DIR, 'settings.json'), JSON.stringify({ defaultProvider: 'fixture', defaultModel: 'normal', defaultThinkingLevel: 'off', defaultProjectTrust: 'never', enableInstallTelemetry: false, compaction: { enabled: false } }));
    const { createPiAgentGateway } = require('../server/pi-agent-routes'), gateway = createPiAgentGateway({ deferredFilePath: process.env.PI_WEB_DEFERRED_FILE });
    const app = require('express')(); app.use(require('express').json()); gateway.mount(app);
    const server = http.createServer(app); gateway.attachWebSocket(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const sockets = [];
    t.after(async () => { for (const socket of sockets) socket.terminate(); await gateway.dispose(); server.closeAllConnections(); provider.closeAllConnections(); await Promise.all([new Promise(r => server.close(r)), new Promise(r => provider.close(r))]); });
    const base = `http://127.0.0.1:${server.address().port}/api/pi`;
    const rest = async (method, url, body) => {
        const response = await fetch(base + url, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
        const data = await response.json(); if (!response.ok) throw Object.assign(Error(data.error), { status: response.status, code: data.code }); return data;
    };
    const connect = async () => {
        const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/pi/ws`); sockets.push(socket); await once(socket, 'open');
        const pending = new Map(), events = []; let next = 0, closed = null;
        socket.on('close', code => { closed = code; });
        socket.on('message', raw => { const e = JSON.parse(raw), p = e.type === 'response' && pending.get(e.id); if (p) { pending.delete(e.id); clearTimeout(p.timer); e.success ? p.resolve(e.data) : p.reject(Object.assign(Error(e.error), { code: e.errorCode })); } else events.push(e); });
        const call = (type, input = {}) => new Promise((resolve, reject) => { const id = String(++next), timer = setTimeout(() => { pending.delete(id); reject(Error(`timeout ${type}`)); }, 60000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ type, id, ...input })); });
        return { socket, call, events, closed: () => closed };
    };
    const createBot = async () => {
        const created = await rest('POST', '/bots', { expectedRevision: (await rest('GET', '/bots')).revision });
        const botId = created.bot.id, windowId = created.window.id;
        const session = async () => (await rest('GET', `/bots/${botId}/windows/${windowId}/session`)).session;
        return { botId, windowId, botWindow: { profileId: botId, windowId }, session };
    };
    return { gateway, calls, rest, connect, createBot };
}

test('a Bot window opens only its current generation; a rotation moves open pages on', { timeout: 120000 }, async t => {
    const { gateway, rest, connect, createBot } = await setup(t);
    const { botId, windowId, botWindow, session } = await createBot();
    const activity = await rest('GET', `/bots/${botId}/activity`);
    assert.equal(activity.profileId, botId);
    assert.equal(activity.version, 1);
    assert.deepEqual(activity.sources, { proactive: 'available', scheduler: 'available', channels: 'available' });
    assert.deepEqual(activity.items, []);
    const first = await session();
    // Missing or wrong window identity is refused before any worker starts.
    const probe = await connect();
    await assert.rejects(probe.call('open_session', { cwd: first.cwd, sessionId: first.id, token: TOKEN, botWindow: { profileId: botId } }), /Invalid Bot window/);

    const page = await connect();
    await page.call('open_session', { cwd: first.cwd, sessionId: first.id, token: TOKEN, botWindow });
    assert.ok(gateway.supervisor.getActiveWorker(first.path), 'the page holds an idle worker on generation 0');
    await assert.rejects(rest('POST', `/bots/${botId}/windows/${windowId}/rotate`, {}), error => error.status === 400);
    await rest('POST', `/bots/${botId}/windows/${windowId}/rotate`, { expectedGeneration: 0 });
    await assert.rejects(rest('POST', `/bots/${botId}/windows/${windowId}/rotate`, { expectedGeneration: 0 }), error => error.status === 409, 'a repeated request does not rotate again');
    await deadline(() => page.closed() !== null, 100);
    assert.equal(page.closed(), 4007, 'the open page is moved on by the rotation');
    const second = await session();
    assert.notEqual(second.id, first.id);

    // A reconnect that still names the retired generation is refused with a code the page acts on.
    const stale = await connect();
    await assert.rejects(stale.call('open_session', { cwd: first.cwd, sessionId: first.id, token: TOKEN, botWindow }), error => error.code === 'BOT_WINDOW_STALE');
    assert.equal(gateway.supervisor.getActiveWorker(first.path), undefined, 'no worker was started on the retired generation');
    const current = await connect();
    await current.call('open_session', { cwd: second.cwd, sessionId: second.id, token: TOKEN, botWindow });
    assert.ok(gateway.supervisor.getActiveWorker(second.path));
    // The Pi Agent page can still open any native session (no Bot window named).
    const plain = await connect();
    await plain.call('open_session', { cwd: first.cwd, sessionId: first.id, token: TOKEN });
});

test('recovering an interrupted rotation never strands an attached page on a stopped runtime', { timeout: 120000 }, async t => {
    const { gateway, connect, createBot } = await setup(t);
    const { WINDOW_ENTRY, windowMarker } = require('../server/bot/bot-window-state');
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const { botId, windowId, botWindow, session } = await createBot();
    const main = await session(), bots = gateway.bots;
    const prepare = async () => {
        const { revision } = await bots.windows.read(botId);
        await bots.windows.mutate(botId, revision, s => { s.windows[0].rotation = { state: 'prepared', requestId: randomUUID(), toGeneration: 1,
            fromSessionId: main.id, reason: 'size', preparedAt: new Date().toISOString() }; return {}; });
    };
    // An ordinary Pi Agent page is attached to the predecessor.
    const ordinary = await connect();
    await ordinary.call('open_session', { cwd: main.cwd, sessionId: main.id, token: TOKEN });
    const worker = gateway.supervisor.getActiveWorker(main.path);
    assert.ok(worker);

    // Abandon: no successor was written. A Bot page asks to open while the journal is pending.
    await prepare();
    const waiting = await connect();
    await assert.rejects(waiting.call('open_session', { cwd: main.cwd, sessionId: main.id, token: TOKEN, botWindow }), error => error.code === 'BOT_WINDOW_ROTATING');
    assert.equal((await session()).id, main.id, 'routing is unchanged');
    assert.equal((await bots.windows.read(botId)).state.windows[0].rotation, null);
    assert.equal(gateway.supervisor.getActiveWorker(main.path), worker, 'the attached runtime keeps running');
    assert.equal(worker.disposed, false);
    assert.equal(ordinary.closed(), null);
    assert.equal((await ordinary.call('get_state')).sessionId, main.id, 'the attached page still works');

    // Adopt: a complete successor. The attached page is told to reconnect before its runtime stops.
    const leaf = SessionManager.open(main.path).getLeafId();
    await prepare();
    const successor = await gateway.store.createSession(main.cwd, '', { agentProfileId: botId, initializeSession: manager =>
        manager.appendCustomEntry(WINDOW_ENTRY, windowMarker({ sessionId: manager.getSessionId(), profileId: botId, windowId, kind: 'main', generation: 1,
            predecessor: { sessionId: main.id, lastEntryId: leaf } })) });
    assert.equal((await session()).id, successor.id);
    await deadline(() => ordinary.closed() !== null, 100);
    assert.equal(ordinary.closed(), 1012, 'the attached page reconnects instead of keeping a stopped runtime');
    assert.equal(worker.disposed, true);
});

test('a scheduled task reopens a stale Bot main chat through the guarded restart and keeps the model it was priced with', { timeout: 120000 }, async t => {
    const { gateway, calls, rest, connect, createBot } = await setup(t);
    const { botId, botWindow, session } = await createBot();
    const main = await session();
    const page = await connect();
    await page.call('open_session', { cwd: main.cwd, sessionId: main.id, token: TOKEN, botWindow });
    const first = gateway.supervisor.getActiveWorker(main.path);
    await deadline(() => first.loadedBot, 100);
    // The Bot picks its own model; saving it also leaves the open runtime on old settings.
    await rest('PATCH', `/bots/${botId}`, { expectedRevision: (await rest('GET', '/bots')).revision,
        changes: { bot: { model: { provider: 'fixture', id: 'normal' } } } });
    const service = gateway.cron;
    const job = await service.save({ id: randomUUID(), name: 'Morning', prompt: 'GREETING_FIXTURE', enabled: false, mode: 'text', target: { kind: 'profile', profileId: botId },
        schedule: { kind: 'cron', expression: '30 10 * * *', timeZone: 'Asia/Shanghai' }, model: { provider: 'fixture', modelId: 'scheduled', thinkingLevel: 'off' },
        budget: { maxRunsPerDay: 3, maxTokensPerDay: 200000, maxCostPerDay: null } });
    const submitted = await service.action(job.id, { action: 'run', revision: job.revision, requestId: randomUUID() });
    // 'uncertain' can be passing: reconciliation may read the session while the turn is still
    // writing it, and applies the finished result on a later tick. Wait for an outcome.
    const result = await deadline(async () => { await service.tick(); const run = service.db.run(submitted.id); return ['completed', 'silent', 'skipped', 'stopped', 'error', 'failed'].includes(run.status) && run; });
    assert.equal(result.status, 'completed', result.reason);
    assert.equal(page.closed(), 1012, 'the open page was told to reconnect to the replacement');
    const replacement = gateway.supervisor.getActiveWorker(main.path);
    assert.notEqual(replacement, first);
    assert.equal(first.disposed, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, 'scheduled', 'the run used the model it was admitted and priced with');
    assert.equal((await replacement.request('get_state')).model.id, 'normal', "the Bot's own model is back after the run");
    // The page reconnects to the replacement and sees the scheduled reply.
    const again = await connect();
    const opened = await again.call('open_session', { cwd: main.cwd, sessionId: main.id, token: TOKEN, botWindow });
    assert.match(JSON.stringify(opened.messages), /Scheduled greeting fixture/);
});

test('notebook edits are written by the running worker, or with the file reserved when none runs', { timeout: 120000 }, async t => {
    const { gateway, rest, connect, createBot } = await setup(t);
    const { botId, windowId, botWindow, session } = await createBot();
    const current = await session();
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const ledger = require('../server/bot/bot-ledger');
    // Fixture notes, as a window_note result would leave them (no worker runs yet).
    const manager = SessionManager.open(current.path);
    const userEntry = manager.appendMessage({ role: 'user', content: '瓷砖定哑光灰，周五前给我报价', timestamp: Date.now() });
    const { state } = ledger.prepareOps(ledger.emptyLedger(), [{ op: 'add', kind: 'decision', text: '瓷砖哑光灰' },
        { op: 'add', kind: 'commitment', text: '周五前给报价', due: '2026-03-06' },
        // Carried over from an earlier generation: only its kept quote can be shown.
        { op: 'add', kind: 'ref', text: '物业电话 6123', source: { sessionId: 'earlier-generation', entryId: 'e9', role: 'toolResult', quote: '物业服务中心 6123' } }],
        { at: new Date().toISOString(), by: 'bot', source: { sessionId: current.id, entryId: userEntry } });
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, snapshot: state });
    const url = `/bots/${botId}/windows/${windowId}/notebook`;
    let book = await rest('GET', url);
    assert.equal(book.generation, 0);
    assert.deepEqual(book.items.map(item => [item.id, item.kind, item.status]), [['n1', 'decision', 'active'], ['n2', 'commitment', 'active'], ['n3', 'ref', 'active']]);
    assert.deepEqual(book.items[0].source, { role: 'user', text: '瓷砖定哑光灰，周五前给我报价' });
    assert.deepEqual(book.items[2].source, { role: 'toolResult', text: '物业服务中心 6123' });
    // No worker: appended with the file reserved.
    book = await rest('POST', url, { expectedGeneration: 0, expectedVersion: book.version, ops: [{ op: 'status', id: 'n2', status: 'done' }] });
    assert.equal(book.items[1].status, 'done');
    assert.equal(gateway.supervisor.getActiveWorker(current.path), undefined, 'no worker was started for it');
    // A running worker writes it itself and keeps running.
    const page = await connect();
    await page.call('open_session', { cwd: current.cwd, sessionId: current.id, token: TOKEN, botWindow });
    const worker = await deadline(() => gateway.supervisor.getActiveWorker(current.path)?.loadedBot && gateway.supervisor.getActiveWorker(current.path));
    book = await rest('POST', url, { expectedGeneration: 0, expectedVersion: book.version, ops: [{ op: 'update', id: 'n1', text: '瓷砖改成浅灰' }, { op: 'delete', id: 'n2' }] });
    assert.deepEqual(book.items.map(item => [item.id, item.text]), [['n1', '瓷砖改成浅灰'], ['n3', '物业电话 6123']], 'a deleted note leaves the panel');
    assert.equal(gateway.supervisor.getActiveWorker(current.path), worker, 'the page keeps its runtime');
    const written = SessionManager.open(current.path).getEntries().filter(entry => entry.customType === ledger.LEDGER_ENTRY && entry.data.ops);
    assert.deepEqual(written.map(entry => entry.data.ops.map(op => `${op.by}:${op.op}:${op.id}`)), [['user:status:n2'], ['user:update:n1', 'user:delete:n2']]);
    // Stale version, stale generation and invalid edits are refused without writing.
    await assert.rejects(rest('POST', url, { expectedGeneration: 0, expectedVersion: '0000000000000000', ops: [{ op: 'status', id: 'n1', status: 'done' }] }),
        error => error.status === 409 && error.code === 'NOTEBOOK_CHANGED');
    await assert.rejects(rest('POST', url, { expectedGeneration: 3, expectedVersion: book.version, ops: [{ op: 'status', id: 'n1', status: 'done' }] }),
        error => error.status === 409 && error.code === 'BOT_WINDOW_STALE');
    await assert.rejects(rest('POST', url, { expectedGeneration: 0, expectedVersion: book.version, ops: [{ op: 'status', id: 'n9', status: 'done' }] }),
        error => error.status === 400 && /No note n9/.test(error.message));
    await assert.rejects(rest('POST', url, { expectedGeneration: 0, expectedVersion: book.version, ops: [{ op: 'add', kind: 'ref', text: 'x' }] }), /Invalid notebook edit/);
    assert.equal(SessionManager.open(current.path).getEntries().filter(entry => entry.customType === ledger.LEDGER_ENTRY && entry.data.ops).length, 2);
    // The model is told about the panel edits before its next run.
    page.call('prompt', { message: 'hello' }).catch(() => {});
    await deadline(() => SessionManager.open(current.path).getEntries().some(entry => entry.type === 'custom_message' && entry.customType === 'pivane-bot-notebook'));
    const notice = SessionManager.open(current.path).getEntries().find(entry => entry.customType === 'pivane-bot-notebook');
    assert.match(notice.content, /Notebook of this chat[^]*\[n1\] 瓷砖改成浅灰/, 'never shown before, so the whole notebook');
});
