const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { WebSocket } = require('ws');

// Real gateway and Pi worker, offline, synthetic identity. Covers Bot-window admission on the
// WebSocket: a page may only open (or reconnect to) the window's current generation.
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pi-bot-gateway-')));
delete process.env.PORT;
process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent'); process.env.PI_PROJECT_ROOTS = root;
process.env.PI_WEB_DEFERRED_FILE = path.join(root, 'deferred.json'); process.env.PI_OFFLINE = '1'; process.env.PI_WEB_TOKEN = 'bot-gateway-fixture';
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('a Bot window opens only its current generation; a rotation moves open pages on', { timeout: 120000 }, async t => {
    const provider = http.createServer(async (req, res) => { for await (const _ of req) {} res.writeHead(500); res.end(); });
    provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
    fs.mkdirSync(process.env.PI_CODING_AGENT_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.PI_CODING_AGENT_DIR, 'models.json'), JSON.stringify({ providers: { fixture: { baseUrl: `http://127.0.0.1:${provider.address().port}/v1`, api: 'openai-completions', apiKey: 'fixture', models: [{ id: 'fixture', input: ['text'], contextWindow: 32000, maxTokens: 1000 }] } } }));
    fs.writeFileSync(path.join(process.env.PI_CODING_AGENT_DIR, 'settings.json'), JSON.stringify({ defaultProvider: 'fixture', defaultModel: 'fixture', compaction: { enabled: false } }));
    const { createPiAgentGateway } = require('../server/pi-agent-routes'), gateway = createPiAgentGateway({ deferredFilePath: process.env.PI_WEB_DEFERRED_FILE });
    const app = require('express')(); app.use(require('express').json()); gateway.mount(app);
    const server = http.createServer(app); gateway.attachWebSocket(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const sockets = [];
    t.after(async () => { for (const socket of sockets) socket.terminate(); await gateway.dispose(); server.closeAllConnections(); provider.closeAllConnections(); await Promise.all([new Promise(r => server.close(r)), new Promise(r => provider.close(r))]); });
    const base = `http://127.0.0.1:${server.address().port}/api/pi`;
    const rest = async (method, url, body) => {
        const response = await fetch(base + url, { method, headers: { Authorization: 'Bearer bot-gateway-fixture', 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
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

    const { revision } = await rest('GET', '/bots');
    const created = await rest('POST', '/bots', { expectedRevision: revision });
    const botId = created.bot.id, windowId = created.window.id, botWindow = { profileId: botId, windowId };
    const first = (await rest('GET', `/bots/${botId}/windows/${windowId}/session`)).session;
    // Missing or wrong window identity is refused before any worker starts.
    const probe = await connect();
    await assert.rejects(probe.call('open_session', { cwd: first.cwd, sessionId: first.id, token: 'bot-gateway-fixture', botWindow: { profileId: botId } }), /Invalid Bot window/);

    const page = await connect();
    await page.call('open_session', { cwd: first.cwd, sessionId: first.id, token: 'bot-gateway-fixture', botWindow });
    assert.ok(gateway.supervisor.getActiveWorker(first.path), 'the page holds an idle worker on generation 0');
    await assert.rejects(rest('POST', `/bots/${botId}/windows/${windowId}/rotate`, {}), error => error.status === 400);
    await rest('POST', `/bots/${botId}/windows/${windowId}/rotate`, { expectedGeneration: 0 });
    await assert.rejects(rest('POST', `/bots/${botId}/windows/${windowId}/rotate`, { expectedGeneration: 0 }), error => error.status === 409, 'a repeated request does not rotate again');
    for (let i = 0; i < 100 && page.closed() === null; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(page.closed(), 4007, 'the open page is moved on by the rotation');
    const second = (await rest('GET', `/bots/${botId}/windows/${windowId}/session`)).session;
    assert.notEqual(second.id, first.id);

    // A reconnect that still names the retired generation is refused with a code the page acts on.
    const stale = await connect();
    await assert.rejects(stale.call('open_session', { cwd: first.cwd, sessionId: first.id, token: 'bot-gateway-fixture', botWindow }), error => error.code === 'BOT_WINDOW_STALE');
    assert.equal(gateway.supervisor.getActiveWorker(first.path), undefined, 'no worker was started on the retired generation');
    const current = await connect();
    await current.call('open_session', { cwd: second.cwd, sessionId: second.id, token: 'bot-gateway-fixture', botWindow });
    assert.ok(gateway.supervisor.getActiveWorker(second.path));
    // The Pi Agent page can still open any native session (no Bot window named).
    const plain = await connect();
    await plain.call('open_session', { cwd: first.cwd, sessionId: first.id, token: 'bot-gateway-fixture' });
});
