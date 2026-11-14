const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const express = require('express');
const { WebSocket, WebSocketServer } = require('ws');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-realtime-test-')));
process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent');
process.env.PI_PROJECT_ROOTS = root;
process.env.PI_WEB_TOKEN = 'synthetic-realtime-access';
const { MediaProviderService } = require('../server/media-provider-service');
const { PiRealtimeVoiceService, realtimeModels, realtimeWsUrl } = require('../server/pi-realtime-voice-service');
const pcm = Buffer.alloc(640).toString('base64');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

async function fixture(t, options = {}) {
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await once(wss, 'listening');
    const received = [], peers = [], events = [], values = new Map();
    wss.on('connection', (ws, req) => {
        peers.push(ws);
        assert.equal(req.headers.authorization, 'Bearer synthetic-private-key');
        assert.match(req.url, /^\/api-ws\/v1\/realtime\?model=qwen-audio-3.0-realtime-plus$/);
        ws.send(JSON.stringify({ type: 'session.created', session: { id: 'synthetic' } }));
        ws.on('message', raw => {
            const message = JSON.parse(raw); received.push(message);
            if (message.type === 'session.update' && !options.noReady) ws.send(JSON.stringify({ type: 'session.updated', session: { id: 'synthetic' } }));
        });
    });
    const credentials = { list: async () => new Set(values.keys()), save: async (id, key) => values.set(id, key), get: async id => values.get(id), remove: async id => values.delete(id) };
    const providers = new MediaProviderService({ directory: fs.mkdtempSync(path.join(root, 'media-')), credentials, clean: false });
    const runtime = { getAvailable: async () => [], getModels: () => [] };
    const service = new PiRealtimeVoiceService({ createModelRuntime: async () => runtime, providerService: providers, handshakeTimeoutMs: 200, ...options });
    const stamp = () => ({ confirmed: true, expectedRevision: providers.read().revision });
    const model = { id: 'qwen-rt', name: 'Qwen realtime', remoteModel: 'qwen-audio-3.0-realtime-plus', providerId: 'qwen', protocol: 'qwen-realtime', voice: 'longanqian', turnDetection: 'push_to_talk' };
    await service.saveModel({ ...stamp(), model, provider: { id: 'qwen', name: 'Qwen', baseUrl: `http://127.0.0.1:${wss.address().port}`, auth: { mode: 'bearer' } }, apiKey: 'synthetic-private-key' });
    const input = async () => { const c = await service.catalog(); return { confirmed: true, modelId: c.models[0].id, revision: c.revision }; };
    t.after(async () => { await service.dispose(); for (const ws of peers) ws.terminate(); await new Promise(resolve => wss.close(resolve)); });
    return { service, providers, stamp, model, input, peers, received, events, wss };
}

const until = async predicate => {
    const end = Date.now() + 2000;
    while (!predicate()) { if (Date.now() > end) throw Error('Timed out waiting for fixture event'); await new Promise(resolve => setTimeout(resolve, 5)); }
};

test('Qwen native catalog and URLs use exact provider domains and native WS paths', () => {
    const m = { provider: 'qwen', id: 'qwen3.8-max', baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1' };
    assert.equal(realtimeModels([m, { ...m, provider: 'evil', baseUrl: 'https://dashscope.aliyuncs.com.evil' }], [m, { provider: 'evil' }]).length, 1);
    const { wsUrl } = realtimeWsUrl(m.baseUrl, 'qwen-audio-3.0-realtime-plus');
    assert.equal(wsUrl.href, 'wss://token-plan.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=qwen-audio-3.0-realtime-plus');
});

test('duplex connection holds shared credentials until socket close, uses PCM and projects speech/transcripts', async t => {
    const f = await fixture(t), input = await f.input();
    const session = await f.service.openSession(input, event => f.events.push(event));
    const ready = await session.ready;
    assert.equal(ready.inputSampleRate, 16000); assert.equal(ready.outputSampleRate, 24000);
    assert.equal(f.providers.active, 1); assert.equal(f.service.sessions.size, 1);
    await assert.rejects(f.service.saveModel({ ...f.stamp(), model: f.model }), /finish the current operation/);
    assert.equal(JSON.stringify(await f.service.configuration()).includes('synthetic-private-key'), false);
    assert.deepEqual(await f.providers.catalogModels(), []);
    assert.equal(f.received[0].session.turn_detection, null);
    assert.equal(f.received[0].session.input_audio_format, 'pcm');
    await session.handle({ type: 'realtime_voice_audio', audio: pcm });
    await session.handle({ type: 'realtime_voice_commit' });
    await until(() => f.received.length === 4);
    assert.deepEqual(f.received.slice(1).map(e => e.type), ['input_audio_buffer.append', 'input_audio_buffer.commit', 'response.create']);
    for (const event of [{ type: 'input_audio_buffer.speech_started', item_id: 'u' }, { type: 'conversation.item.input_audio_transcription.completed', item_id: 'u', transcript: '<user>' }, { type: 'response.audio.delta', response_id: 'r', delta: pcm }]) f.peers[0].send(JSON.stringify(event));
    await until(() => f.events.length === 3);
    assert.equal(f.events[1].event.transcript, '<user>');
    assert.equal(f.events[2].event.delta, pcm);
    await assert.rejects(session.handle({ type: 'realtime_voice_audio', audio: 'invalid' }), /格式无效/);
    await session.dispose(); assert.equal(f.providers.active, 0); assert.equal(f.service.sessions.size, 0);
    await f.service.saveModel({ ...f.stamp(), model: f.model });
    await assert.rejects(f.service.openSession(input, () => {}), /配置已变化/);
    assert.equal(f.peers.length, 1);
});

test('failed upstream setup sanitizes errors and releases the provider without replay', async t => {
    const f = await fixture(t, { noReady: true });
    const s = await f.service.openSession(await f.input(), () => {});
    await until(() => f.peers.length > 0);
    f.peers[0].send(JSON.stringify({ type: 'error', error: { message: 'synthetic-private-key', type: 'server_error' } }));
    await assert.rejects(s.ready, error => !error.message.includes('synthetic-private-key'));
    await s.dispose(); assert.equal(f.providers.active, 0); assert.equal(f.peers.length, 1);
});

test('cancel during credential lookup and shutdown do not dial a late upstream', async t => {
    const f = await fixture(t); const input = await f.input();
    let release;
    f.providers.credentials.get = () => new Promise(resolve => { release = () => resolve('synthetic-private-key'); });
    const signal = new AbortController();
    const opening = f.service.openSession(input, () => {}, signal.signal);
    await until(() => release); signal.abort();
    const stopping = f.service.dispose();
    assert.ok(f.service.active > 0); release();
    await assert.rejects(opening, /未发起连接/); await stopping;
    assert.equal(f.providers.active, 0); assert.equal(f.peers.length, 0);
});

test('capacity is reserved before catalog await; disconnect cancels handshake; source rebinding disables catalog', async t => {
    const f = await fixture(t, { maxSessions: 1, noReady: true }), input = await f.input();
    const first = f.service.openSession(input, () => {});
    await assert.rejects(f.service.openSession(input, () => {}), /数量已达上限/);
    const s = await first;
    const rejection = assert.rejects(s.ready, /取消/);
    await s.dispose(); await rejection; assert.equal(f.providers.active, 0);
    const p = f.providers.read().document.providers[0];
    const { models, credentialOrigin, ...fields } = p;
    await f.providers.saveProvider({ ...f.stamp(), provider: { ...fields, baseUrl: 'https://other.invalid' } });
    assert.equal((await f.service.catalog()).models.length, 0);
});

test('assembled gateway checks auth, origin, project and separate socket; tracks activity without workers', async t => {
    const f = await fixture(t);
    const { createPiAgentGateway } = require('../server/pi-agent-routes');
    const gateway = createPiAgentGateway({ realtimeVoiceService: f.service, mediaLabService: { providerService: f.providers } });
    const app = express(); app.use(express.json()); gateway.mount(app);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const wss = gateway.attachWebSocket(server);
    t.after(async () => { for (const s of wss.clients) s.terminate(); await gateway.dispose(); await new Promise(resolve => server.close(resolve)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base + '/api/pi/composer/realtime-voice')).status, 401);
    const headers = { Authorization: 'Bearer synthetic-realtime-access' };
    assert.equal((await fetch(base + '/api/pi/composer/realtime-voice', { headers: { ...headers, Origin: 'http://evil.invalid' } })).status, 403);
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/api/pi/ws'); await once(ws, 'open');
    const reply = once(ws, 'message');
    ws.send(JSON.stringify({ type: 'open_realtime_voice', id: 'start', token: 'synthetic-realtime-access', cwd: root, ...await f.input() }));
    const result = JSON.parse((await reply)[0]); assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(gateway.supervisor.workers.size, 0);
    const activity = await (await fetch(base + '/api/pi/activity', { headers })).json(); assert.equal(activity.realtimeVoiceActive, 1);
    const disallowed = once(ws, 'message'); ws.send(JSON.stringify({ type: 'open_ephemeral', id: 'other', cwd: root }));
    assert.equal(JSON.parse((await disallowed)[0]).success, false);
    ws.close(); await once(ws, 'close'); await until(() => f.providers.active === 0);
    assert.equal(gateway.supervisor.workers.size, 0);
});

test('setup timeout releases the lease and a duration limit ends a ready connection', async t => {
    const f = await fixture(t, { noReady: true, handshakeTimeoutMs: 40 });
    const session = await f.service.openSession(await f.input(), () => {});
    await assert.rejects(session.ready, /超时/); await session.dispose();
    assert.equal(f.providers.active, 0); assert.equal(f.peers.length, 1);
    const g = await fixture(t, { maxDurationMs: 70 });
    const live = await g.service.openSession(await g.input(), event => g.events.push(event)); await live.ready;
    await until(() => g.events.some(e => e.type === 'gateway_realtime_voice_closed'));
    await live.dispose(); assert.equal(g.providers.active, 0);
});

test('realtime model validation rejects malformed settings and deletion preserves shared credentials', async t => {
    const f = await fixture(t);
    for (const patch of [{ instructions: {} }, { speechRate: 9 }, { turnDetection: 'arbitrary' }, { enableSearch: 'true' }]) {
        assert.throws(() => f.service.saveModel({ ...f.stamp(), model: { ...f.model, ...patch } }));
    }
    await assert.rejects(f.providers.removeProvider('qwen', f.stamp()), /Remove the provider models/);
    await f.service.removeModel('qwen-rt', f.stamp());
    assert.equal((await f.service.catalog()).models.length, 0);
    assert.equal(await f.providers.credentials.get('qwen'), 'synthetic-private-key');
});

test('streaming resampler preserves time over nonintegral chunk boundaries and PCM sign', () => {
    const vm = require('node:vm'), scope = { window: {}, globalThis: {}, Uint8Array, Float32Array, DataView, ArrayBuffer };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/pi-realtime-voice.js'), 'utf8'), scope);
    for (const rate of [44100, 48000]) {
        const r = new scope.window.PiRealtimeVoice.PcmResampler(rate);
        let count = 0, total = 0;
        for (let i = 0; i < 100; i++) { const chunk = new Float32Array(2048).fill(-1); total += chunk.length; const pcm = r.push(chunk); count += pcm.length / 2; assert.equal(new DataView(pcm.buffer).getInt16(0, true), -32768); }
        assert.ok(Math.abs(count - Math.floor(total * 16000 / rate)) <= 1);
    }
});
