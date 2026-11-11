const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-pi152-provider-')));
process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent');
process.env.PI_OFFLINE = '1'; process.env.PI_TELEMETRY = '0';
fs.mkdirSync(process.env.PI_CODING_AGENT_DIR);
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('settings service waits for a rotating OAuth refresh to be saved during shutdown', async () => {
    const file = path.join(process.env.PI_CODING_AGENT_DIR, 'auth.json');
    fs.writeFileSync(file, JSON.stringify({ 'synthetic-oauth': { type: 'oauth', access: 'synthetic-expired', refresh: 'synthetic-old', expires: 1 } }), { mode: 0o600 });
    const { PiSettingsService } = require('../server/pi-settings-service');
    const service = new PiSettingsService({ cwd: root });
    const runtime = await service.createModelRuntime();
    let release, started;
    const refreshing = new Promise(resolve => { started = resolve; });
    runtime.registerProvider('synthetic-oauth', { name: 'Synthetic', api: 'openai-completions', baseUrl: 'https://example.invalid/v1', apiKey: 'SYNTHETIC_UNUSED_ENV',
        models: [], oauth: { name: 'Synthetic', login: async () => { throw new Error('No interactive login expected'); },
            refreshToken: async () => { started(); await new Promise(resolve => { release = resolve; }); return { access: 'synthetic-new', refresh: 'synthetic-rotated', expires: Date.now() + 3600000 }; },
            getApiKey: credential => credential.access } });
    const auth = runtime.getAuth('synthetic-oauth'); await refreshing;
    let disposed = false;
    const disposal = service.dispose().then(() => { disposed = true; });
    await new Promise(setImmediate); assert.equal(disposed, false);
    release(); await auth; await disposal;
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))['synthetic-oauth'];
    assert.equal(saved.access, 'synthetic-new'); assert.equal(saved.refresh, 'synthetic-rotated');
    await assert.rejects(service.createModelRuntime(), /shutting down/);
});

test('Anthropic threads send deltas, survive cache warming, and restart from full context after changes or expiry', async t => {
    const { streamSimple } = await import('@earendil-works/pi-ai/api/anthropic-messages');
    const { cleanupSessionResources } = await import('@earendil-works/pi-ai');
    const requests = []; let expireNext = false;
    const server = http.createServer(async (req, res) => {
        let body = ''; for await (const chunk of req) body += chunk;
        const input = JSON.parse(body); requests.push(input);
        if (expireNext && input.thread?.type === 'continue') {
            expireNext = false; res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'expired synthetic thread', details: { error_code: 'thread_not_found' } } })); return;
        }
        const id = 'msg-' + requests.length;
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const event = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
        event('message_start', { message: { id, type: 'message', role: 'assistant', model: 'synthetic-thread', content: [], usage: { input_tokens: 10, output_tokens: 0 } } });
        event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
        event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'synthetic reply' } });
        event('content_block_stop', { index: 0 });
        event('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } });
        event('message_stop', {}); res.end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { cleanupSessionResources('synthetic-thread-session'); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const model = { id: 'synthetic-thread', name: 'Synthetic', provider: 'anthropic', api: 'anthropic-messages',
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`, input: ['text'], reasoning: false, contextWindow: 128000, maxTokens: 4096,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, compat: { supportsMessageThreads: true } };
    const options = { apiKey: 'synthetic-only', sessionId: 'synthetic-thread-session', maxRetries: 0 };
    const user = text => ({ role: 'user', content: text, timestamp: Date.now() });
    const context = { messages: [{ role: 'system', content: 'original system', timestamp: Date.now() }, user('first')] };
    const send = async extra => { const result = await streamSimple(model, context, { ...options, ...extra }).result(); assert.equal(result.stopReason, 'stop', result.errorMessage); return result; };
    const first = await send(); assert.equal(requests[0].thread.type, 'create');
    await send({ disableContinuation: true }); assert.equal(requests[1].thread, undefined);
    context.messages.push(first, user('second')); const second = await send();
    assert.equal(requests[2].thread.type, 'continue'); assert.equal(requests[2].messages.length, 1); assert.equal(requests[2].system, undefined);
    context.messages.push(second, user('third')); context.messages[0] = { ...context.messages[0], content: 'changed system' }; const third = await send();
    assert.equal(requests[3].thread.type, 'create'); assert.ok(requests[3].messages.length > 1);
    context.messages.push(third, user('fourth')); expireNext = true;
    await send(); assert.equal(requests[4].thread.type, 'continue'); assert.equal(requests[5].thread.type, 'create');
    assert.ok(requests[5].messages.length > 1);
});
