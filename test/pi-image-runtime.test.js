const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { once } = require('node:events');
const express = require('express');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-image-requests-')));
const agent = path.join(root, 'agent'), cwd = path.join(root, 'project'); fs.mkdirSync(agent); fs.mkdirSync(cwd);
process.env.PI_CODING_AGENT_DIR = agent; process.env.PI_PROJECT_ROOTS = root; process.env.PI_OFFLINE = '1';
process.env.PI_WEB_DEFERRED_FILE = path.join(agent, 'deferred.json');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
let provider, server, gateway, access, origin, mode = 'reply', step = 0, reference;
const requests = [];
test.before(async () => {
    provider = http.createServer(async (req, res) => {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const request = JSON.parse(Buffer.concat(chunks)); requests.push(request);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const send = (delta, finish_reason) => res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: request.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
        if (mode !== 'reply' && step++ === 0) {
            send({ role: 'assistant', tool_calls: [{ index: 0, id: 'fixture-call', type: 'function', function: mode === 'attachment'
                ? { name: 'get_attachment', arguments: JSON.stringify({ id: reference.id }) }
                : { name: 'fixture_image', arguments: JSON.stringify({ valid: mode === 'good-tool' }) } }] }); send({}, 'tool_calls');
        } else { send({ role: 'assistant', content: 'Fixture complete' }); send({}, 'stop'); }
        res.end('data: [DONE]\n\n');
    });
    provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
    const extension = path.join(agent, 'fixture-image.ts');
    fs.writeFileSync(extension, `export default function(pi) { pi.registerTool({name:'fixture_image',label:'Fixture',description:'Fixture image',parameters:{type:'object',properties:{valid:{type:'boolean'}}},execute:async(_id,args)=>({content:[{type:'image',mimeType:'image/png',data:args.valid?'${png}':'AAAA'}]})}); }`);
    fs.writeFileSync(path.join(agent, 'settings.json'), JSON.stringify({ defaultProvider: 'fixture', defaultModel: 'text', defaultProjectTrust: 'never', enableInstallTelemetry: false, extensions: [extension], retry: { enabled: false } }));
    fs.writeFileSync(path.join(agent, 'models.json'), JSON.stringify({ providers: { fixture: { baseUrl: `http://127.0.0.1:${provider.address().port}/v1`, api: 'openai-completions', apiKey: 'synthetic', models: [
        { id: 'text', input: ['text'], contextWindow: 32000, maxTokens: 1000 }, { id: 'vision', input: ['text', 'image'], contextWindow: 32000, maxTokens: 1000 }
    ] } } }));
    const { WorkspaceAccessService } = require('../server/workspace-access-service'), { createPiAgentGateway } = require('../server/pi-agent-routes');
    access = new WorkspaceAccessService({ filePath: path.join(agent, 'access.json'), envToken: () => 'synthetic-image-token' });
    gateway = createPiAgentGateway({ accessService: access, deferredFilePath: path.join(agent, 'deferred.json'), cronFilePath: path.join(agent, 'cron.sqlite') });
    const app = express(); access.mount(app); app.use(express.json({ limit: '32mb' })); gateway.mount(app);
    server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    origin = `http://127.0.0.1:${server.address().port}`; process.env.PI_WORKSPACE_INTERNAL_ORIGIN = origin;
});
test.after(async () => {
    await gateway?.dispose(); access?.dispose();
    await Promise.all([server, provider].filter(Boolean).map(value => { value.closeAllConnections(); return new Promise(resolve => value.close(resolve)); }));
    fs.rmSync(root, { recursive: true, force: true });
});
async function prompt(worker, text) {
    let off;
    const settled = new Promise(resolve => { off = worker.subscribe(event => { if (event.type === 'agent_settled') resolve(); }); });
    try { await worker.request('prompt', { message: text }); await settled; } finally { off(); }
}

test('managed request drops historical user/tool images for text and restores originals after model switches', { timeout: 30000 }, async () => {
    const { getSdk } = require('../server/pi-session-store'), { SessionManager } = await getSdk();
    const session = await gateway.store.createSession(cwd, 'Images'), manager = SessionManager.open(session.path);
    const image = { type: 'image', mimeType: 'image/jpg', data: png };
    manager.appendModelChange('fixture', 'text');
    manager.appendMessage({ role: 'user', content: [{ type: 'text', text: 'historical screenshot' }, image], timestamp: 1 });
    manager.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id: 'historic-read', name: 'read', arguments: { path: 'screenshot.png' } }], timestamp: 2, api: 'openai-completions', provider: 'fixture', model: 'vision', usage, stopReason: 'toolUse' });
    manager.appendMessage({ role: 'toolResult', toolCallId: 'historic-read', toolName: 'read', content: [image], isError: false, timestamp: 3 });
    manager.appendModelChange('fixture', 'text');
    const worker = await gateway.supervisor.getWorker({ cwd, sessionPath: session.path, sessionId: session.id });
    const notices = [], off = worker.subscribe(event => { if (event.type === 'extension_ui_request' && event.method === 'notify') notices.push(event.message); });
    try {
        await prompt(worker, 'Continue as text');
        assert.ok(!JSON.stringify(requests.at(-1).messages).includes('image_url'));
        assert.match(JSON.stringify(requests.at(-1).messages), /原图保留/);
        await worker.request('set_model', { provider: 'fixture', modelId: 'vision' });
        await prompt(worker, 'Inspect original images');
        assert.match(JSON.stringify(requests.at(-1).messages), /data:image\/png;base64,/);
        const snapshot = await worker.request('get_entries');
        const originals = snapshot.entries.flatMap(entry => Array.isArray(entry.message?.content) ? entry.message.content.filter(block => block.type === 'image') : []);
        assert.deepEqual(originals, [image, image]);
        await worker.request('set_model', { provider: 'fixture', modelId: 'text' });
        assert.ok(notices.some(notice => /省略 2 张/.test(notice)));
        const count = requests.length;
        await assert.rejects(worker.request('prompt', { message: 'New unsupported image', images: [{ ...image, mimeType: 'image/png' }] }), /不接收图片/);
        assert.equal(requests.length, count);
    } finally { off(); }
});

test('new user images are externalized, remain model-identical after resume, and are session-scoped for display', { timeout: 30000 }, async () => {
    const { SessionImages, isReference } = require('../server/pi-session-images');
    const session = await gateway.store.createSession(cwd, 'Stored images');
    let worker = await gateway.supervisor.getWorker({ cwd, sessionPath: session.path, sessionId: session.id });
    await worker.request('set_model', { provider: 'fixture', modelId: 'vision' });
    let off;
    const settled = new Promise(resolve => { off = worker.subscribe(event => { if (event.type === 'agent_settled') resolve(); }); });
    await worker.request('prompt', { message: 'Inspect this image', images: [{ type: 'image', mimeType: 'image/png', data: png }] });
    await settled; off();
    assert.match(JSON.stringify(requests.at(-1)), new RegExp(png.slice(0, 30)));
    const entries = (await worker.request('get_entries')).entries;
    const block = entries.flatMap(entry => entry.message?.content || []).find(isReference);
    assert.ok(block, 'managed message_end persists an A2 reference');
    assert.ok(!fs.readFileSync(session.path, 'utf8').includes(png));
    assert.equal(new SessionImages(agent).restore(block).data, png);
    const url = `${origin}/api/pi/sessions/${session.id}/images/${block.pivaneImage.sha256}?${new URLSearchParams({ cwd })}`;
    assert.equal((await fetch(url)).status, 401);
    const response = await fetch(url, { headers: { Authorization: 'Bearer synthetic-image-token' } });
    assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(png, 'base64'));
    const unrelated = await gateway.store.createSession(cwd, 'Unrelated');
    assert.equal((await fetch(url.replace(session.id, unrelated.id), { headers: { Authorization: 'Bearer synthetic-image-token' } })).status, 404);
    await worker.dispose();
    worker = await gateway.supervisor.getWorker({ cwd, sessionPath: session.path, sessionId: session.id });
    await prompt(worker, 'Inspect it again');
    assert.match(JSON.stringify(requests.at(-1)), new RegExp(png.slice(0, 30)));
    const exported = await fetch(`${origin}/api/pi/sessions/${session.id}/export`, { method: 'POST', headers: { Authorization: 'Bearer synthetic-image-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ cwd, format: 'jsonl' }) });
    assert.equal(exported.status, 200);
    const exportedText = await exported.text(); assert.ok(exportedText.includes(png)); assert.ok(!exportedText.includes('pivaneImage'));
    const html = path.join(root, 'images.html'); await worker.request('export_html', { outputPath: html });
    const encoded = /<script id="session-data" type="application\/json">([^<]+)<\/script>/.exec(fs.readFileSync(html, 'utf8'))?.[1];
    assert.ok(encoded); assert.ok(Buffer.from(encoded, 'base64').toString('utf8').includes(png));
});

test('tool-produced images retain their bytes in the continuation while the native result stores a reference', { timeout: 30000 }, async () => {
    const session = await gateway.store.createSession(cwd, 'Tool image');
    const worker = await gateway.supervisor.getWorker({ cwd, sessionPath: session.path, sessionId: session.id });
    await worker.request('set_model', { provider: 'fixture', modelId: 'vision' });
    mode = 'good-tool'; step = 0;
    try { await prompt(worker, 'Call fixture_image'); } finally { mode = 'reply'; }
    assert.ok(JSON.stringify(requests.at(-1)).includes(png));
    const result = (await worker.request('get_entries')).entries.find(entry => entry.message?.toolName === 'fixture_image');
    assert.ok(result.message.content.some(require('../server/pi-session-images').isReference));
    assert.ok(!fs.readFileSync(session.path, 'utf8').includes(png));
});

test('bad historic images reject before prompt admission; bad new tool images stop before another provider call', { timeout: 30000 }, async () => {
    const { getSdk } = require('../server/pi-session-store'), { SessionManager } = await getSdk();
    const session = await gateway.store.createSession(cwd, 'Bad history'), manager = SessionManager.open(session.path);
    manager.appendModelChange('fixture', 'vision');
    manager.appendMessage({ role: 'user', content: [{ type: 'image', mimeType: 'image/png', data: 'AAAA' }], timestamp: 1 });
    const worker = await gateway.supervisor.getWorker({ cwd, sessionPath: session.path, sessionId: session.id }), before = requests.length;
    await assert.rejects(worker.request('prompt', { message: 'must retain draft' }), /图片格式无效/);
    assert.equal(requests.length, before);
    assert.ok(!JSON.stringify((await worker.request('get_entries')).entries).includes('must retain draft'));
    const clean = await gateway.store.createSession(cwd, 'Bad new tool image');
    const active = await gateway.supervisor.getWorker({ cwd, sessionPath: clean.path, sessionId: clean.id });
    await active.request('set_model', { provider: 'fixture', modelId: 'vision' });
    mode = 'bad-tool'; step = 0;
    await prompt(active, 'Run fixture image');
    assert.equal(requests.length, before + 1, 'invalid tool image never reaches the next HTTP request');
    const snapshot = await active.request('get_entries');
    assert.ok(snapshot.entries.some(entry => entry.message?.role === 'assistant' && /工具结果.*图片格式无效/.test(entry.message.errorMessage || '')));
    mode = 'reply';
});

test('raw audio upload is available to the actual managed get_attachment tool after sending its reference', { timeout: 30000 }, async () => {
    const session = await gateway.store.createSession(cwd, 'Audio'), bytes = Buffer.from([82, 73, 70, 70, 0, 1, 2]);
    const query = new URLSearchParams({ cwd, sessionId: session.id, requestId: 'audio', name: 'voice.wav' });
    const response = await fetch(`${origin}/api/pi/uploads?${query}`, { method: 'POST', headers: { Authorization: 'Bearer synthetic-image-token', 'Content-Type': 'application/octet-stream' }, body: bytes });
    assert.equal(response.status, 200); const uploaded = await response.json(); reference = uploaded.reference;
    const worker = await gateway.supervisor.getWorker({ cwd, sessionPath: session.path, sessionId: session.id });
    mode = 'attachment'; step = 0;
    await prompt(worker, 'Inspect the uploaded audio\n' + uploaded.marker);
    const snapshot = await worker.request('get_entries');
    const tool = snapshot.entries.find(entry => entry.message?.toolName === 'get_attachment')?.message;
    assert.ok(tool && !tool.isError, JSON.stringify(tool));
    assert.deepEqual(fs.readFileSync(tool.details.pivaneAttachment.path), bytes);
    assert.deepEqual(await gateway.documents.bytes(await gateway.documents.object(reference.id)), bytes);
    mode = 'reply';
});
