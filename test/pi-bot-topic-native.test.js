'use strict';
// Real managed RPC worker, isolated identity, loopback synthetic provider. No live Bot
// data or installed credentials. Proves native confirmation → scoped HTTP → native result,
// and archive admission from both Bot and ordinary native-session entrypoints.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-topic-native-')));
const agentDir = path.join(root, 'agent'); fs.mkdirSync(agentDir);
process.env.PI_CODING_AGENT_DIR = agentDir; process.env.PI_PROJECT_ROOTS = root; process.env.PI_OFFLINE = '1';
process.env.PI_WEB_DEFERRED_FILE = path.join(root, 'deferred.json');
const TOKEN = 'synthetic-topic-management'; process.env.PI_WEB_TOKEN = TOKEN;
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
async function eventually(fn) {
    for (let i = 0; i < 400; i++) { const result = await fn(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 50)); }
    throw new Error('Synthetic worker fixture timed out');
}

test('native topic confirmation creates a durable receipt; archive stops current and older page workers, blocks both entrypoints, and restores the same history', { timeout: 120000 }, async t => {
    const calls = [];
    const provider = http.createServer(async (req, res) => {
        let raw = ''; for await (const part of req) raw += part;
        const input = JSON.parse(raw); calls.push(input);
        const user = input.messages.findLastIndex(message => message.role === 'user');
        const after = input.messages.slice(user + 1);
        const delta = after.some(message => message.role === 'tool') ? { content: 'Topic proposal finished.' } : {
            tool_calls: [{ index: 0, id: `native-topic-${calls.length}`, type: 'function', function: { name: 'bot_topic_propose',
                arguments: JSON.stringify({ title: 'Garden plan', focus: 'Choose plants for the balcony', emoji: '🌱' }) } }]
        };
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(`data: ${JSON.stringify({ id: 'synthetic-topic', choices: [{ index: 0, delta, finish_reason: delta.tool_calls ? 'tool_calls' : 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } })}\n\ndata: [DONE]\n\n`);
    });
    provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
    fs.writeFileSync(path.join(agentDir, 'models.json'), JSON.stringify({ providers: { fixture: {
        baseUrl: `http://127.0.0.1:${provider.address().port}/v1`, api: 'openai-completions', apiKey: 'synthetic',
        models: [{ id: 'small', reasoning: false, input: ['text'], contextWindow: 32000, maxTokens: 1000,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
    fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify({ defaultProvider: 'fixture', defaultModel: 'small', defaultThinkingLevel: 'off',
        defaultProjectTrust: 'never', enableInstallTelemetry: false, compaction: { enabled: false }, retry: { enabled: false } }));
    const { createPiAgentGateway } = require('../server/pi-agent-routes');
    const gateway = createPiAgentGateway({ cronFilePath: path.join(root, 'cron.sqlite') });
    clearInterval(gateway.cron.timer); await gateway.cron.ready;
    const app = require('express')(); app.use(require('express').json()); gateway.mount(app);
    const server = http.createServer(app); gateway.attachWebSocket(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const priorOrigin = process.env.PI_WORKSPACE_INTERNAL_ORIGIN; process.env.PI_WORKSPACE_INTERNAL_ORIGIN = origin;
    const sockets = [];
    t.after(async () => {
        for (const socket of sockets) socket.terminate(); await gateway.dispose();
        server.closeAllConnections(); provider.closeAllConnections();
        await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => provider.close(resolve))]);
        if (priorOrigin === undefined) delete process.env.PI_WORKSPACE_INTERNAL_ORIGIN; else process.env.PI_WORKSPACE_INTERNAL_ORIGIN = priorOrigin;
    });
    const rest = async (method, url, body) => {
        const response = await fetch(origin + '/api/pi' + url, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
        const value = await response.json();
        if (!response.ok) throw Object.assign(new Error(value.error), { status: response.status, code: value.code }); return value;
    };
    async function connect() {
        const socket = new WebSocket(origin.replace('http:', 'ws:') + '/api/pi/ws'); sockets.push(socket); await once(socket, 'open');
        const pending = new Map(), events = []; let sequence = 0, closed = null;
        socket.on('close', code => { closed = code; });
        socket.on('message', raw => {
            const event = JSON.parse(raw), entry = event.type === 'response' && pending.get(event.id);
            if (!entry) { events.push(event); return; }
            pending.delete(event.id); clearTimeout(entry.timer);
            event.success ? entry.resolve(event.data) : entry.reject(Object.assign(new Error(event.error), { code: event.errorCode }));
        });
        const call = (type, input = {}) => new Promise((resolve, reject) => {
            const id = String(++sequence), timer = setTimeout(() => { pending.delete(id); reject(new Error(`timeout ${type}`)); }, 60000);
            pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ type, id, ...input }));
        });
        return { socket, events, call, closed: () => closed };
    }
    const created = await rest('POST', '/bots', { expectedRevision: (await rest('GET', '/bots')).revision });
    const profileId = created.bot.id, mainId = created.window.id;
    const main = (await gateway.bots.resolve(profileId, mainId)).session;
    const page = await connect(); await page.call('open_session', { cwd: main.cwd, sessionId: main.id, token: TOKEN, botWindow: { profileId, windowId: mainId } });
    await eventually(() => gateway.supervisor.getActiveWorker(main.path)?.loadedBot);
    await page.call('prompt', { message: 'Please propose a garden topic.' });
    const confirm = await eventually(() => page.events.find(event => event.type === 'extension_ui_request' && event.method === 'confirm'));
    assert.equal(confirm.title, '允许这一步吗？ / Allow this step?');
    assert.match(confirm.message, /^topic #[a-f0-9]{16}\n\n🌱 Garden plan\nChoose plants for the balcony$/);
    assert.equal((await rest('GET', '/bots')).bots.find(bot => bot.id === profileId).windows.length, 1, 'nothing created while awaiting approval');
    page.socket.send(JSON.stringify({ type: 'extension_ui_response', id: confirm.id, confirmed: true }));
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const receipt = await eventually(() => SessionManager.open(main.path).getBranch().find(entry => entry.type === 'message'
        && entry.message.role === 'toolResult' && entry.message.details?.pivaneBotTopic)?.message.details.pivaneBotTopic);
    assert.equal(receipt.action, 'created'); assert.equal(receipt.profileId, profileId); assert.equal(receipt.window.title, 'Garden plan');
    await eventually(() => gateway.supervisor.isSessionIdle(main.path));
    assert.equal(calls.length, 2, 'index and proposal use no additional model request');
    assert.equal(gateway.supervisor.getActiveWorker(main.path).pendingUi.size, 0);
    const topicId = receipt.window.id, first = (await gateway.bots.resolve(profileId, topicId)).session;
    assert.equal(SessionManager.open(first.path).getBranch().filter(entry => entry.type === 'message').length, 0);
    await gateway.bots.rotate(profileId, topicId, { expectedGeneration: 0 });
    const current = (await gateway.bots.resolve(profileId, topicId)).session;
    const oldPage = await connect(); await oldPage.call('open_session', { cwd: first.cwd, sessionId: first.id, token: TOKEN });
    const currentPage = await connect(); await currentPage.call('open_session', { cwd: current.cwd, sessionId: current.id, token: TOKEN, botWindow: { profileId, windowId: topicId } });
    await eventually(() => gateway.supervisor.isSessionIdle(first.path) && gateway.supervisor.isSessionIdle(current.path));
    const original = fs.readFileSync(current.path);
    const archive = await rest('PATCH', `/bots/${profileId}/windows/${topicId}`, { expectedRevision: (await gateway.bots.windows.read(profileId)).revision, archived: true });
    assert.ok(archive.window.archivedAt); await eventually(() => oldPage.closed() && currentPage.closed());
    assert.equal(oldPage.closed(), 1012); assert.equal(currentPage.closed(), 1012);
    assert.equal(gateway.supervisor.getActiveWorker(first.path), undefined); assert.equal(gateway.supervisor.getActiveWorker(current.path), undefined);
    assert.deepEqual(fs.readFileSync(current.path), original);
    for (const session of [first, current]) {
        for (const botWindow of [undefined, { profileId, windowId: topicId }]) {
            const probe = await connect();
            await assert.rejects(probe.call('open_session', { cwd: session.cwd, sessionId: session.id, token: TOKEN, ...(botWindow ? { botWindow } : {}) }), error => error.code === 'BOT_WINDOW_ARCHIVED');
        }
    }
    const history = await rest('GET', `/bots/${profileId}/windows/${topicId}/history?generation=1`);
    assert.equal(history.generation, 1); assert.equal(gateway.supervisor.getActiveWorker(current.path), undefined);
    // A decline is an ordinary native result and does not create a second topic.
    page.events.length = 0;
    await page.call('prompt', { message: 'Offer another garden topic.' });
    const declined = await eventually(() => page.events.find(event => event.type === 'extension_ui_request' && event.method === 'confirm'));
    page.socket.send(JSON.stringify({ type: 'extension_ui_response', id: declined.id, confirmed: false }));
    await eventually(() => calls.length === 4 && gateway.supervisor.isSessionIdle(main.path));
    assert.equal((await rest('GET', '/bots')).bots.find(bot => bot.id === profileId).windows.length, 2);
    await rest('PATCH', `/bots/${profileId}/windows/${topicId}`, { expectedRevision: (await gateway.bots.windows.read(profileId)).revision, archived: false });
    assert.equal((await gateway.bots.resolve(profileId, topicId)).session.id, current.id);
    const restored = await connect(); await restored.call('open_session', { cwd: current.cwd, sessionId: current.id, token: TOKEN, botWindow: { profileId, windowId: topicId } });
    assert.ok(gateway.supervisor.getActiveWorker(current.path)); assert.equal(calls.length, 4);
});
