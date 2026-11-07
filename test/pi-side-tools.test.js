const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { sideToolGate, STATUS_KEY, CONFIRM_TITLE } = require('../server/pi-side-tools');

const waitFor = async check => {
    const deadline = Date.now() + 15000;
    while (!await check()) { if (Date.now() > deadline) throw Error('Side tools fixture timeout'); await new Promise(resolve => setTimeout(resolve, 20)); }
};

test('side tool gate grants one reply, blocks rejected/expired/aborted operations, and never treats shell as read-only', async () => {
    const handlers = new Map(), states = [];
    sideToolGate({ on: (type, fn) => handlers.set(type, fn) });
    let confirms = 0, allow = true;
    const ctx = { cwd: '/fixture', hasUI: true, ui: { setStatus: (key, value) => states.push([key, value]), confirm: async () => { confirms++; return allow; } } };
    const call = name => handlers.get('tool_call')({ toolName: name, input: { path: 'file', command: 'pwd' } }, ctx);
    handlers.get('before_agent_start')({}, ctx);
    for (const name of ['read', 'grep', 'find', 'ls', 'read_document', 'get_attachment']) assert.equal(await call(name), undefined);
    assert.equal(confirms, 0);
    assert.equal(await call('bash'), undefined); assert.equal(confirms, 1);
    assert.equal(await call('write'), undefined); assert.equal(confirms, 1);
    assert.deepEqual(states.at(-1), [STATUS_KEY, 'write']);
    handlers.get('agent_settled')({}, ctx); allow = false;
    assert.equal((await call('edit')).block, true); assert.equal(confirms, 2);
    assert.equal((await call('powershell')).block, true); assert.equal(confirms, 2, 'decline does not cause repeated confirmation requests');
    assert.equal((await call('unknown_tool')).block, true);
    handlers.get('before_agent_start')({}, ctx);
    ctx.signal = AbortSignal.abort(); allow = true;
    assert.equal((await call('write')).block, true); assert.equal(confirms, 2);
    delete ctx.signal;
    handlers.get('before_agent_start')({}, ctx);
    let resolve;
    ctx.ui.confirm = () => new Promise(done => { resolve = done; });
    const pending = call('write');
    handlers.get('agent_settled')({}, ctx); resolve(true);
    assert.equal((await pending).block, true, 'late confirmation cannot authorize a later reply');
});

test('real side SDK reads, confirms edits/writes/commands, resets permission, denies forged responses and aborts pending approval', { timeout: 90000 }, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-side-tools-'));
    process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent');
    process.env.PI_PROJECT_ROOTS = root; process.env.PI_OFFLINE = '1';
    const input = path.join(root, 'input.txt'), output = path.join(root, 'output.txt'), commandOutput = path.join(root, 'command.txt');
    fs.writeFileSync(input, 'before');
    const requests = [], events = [];
    const provider = http.createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw); requests.push(body);
        const names = body.tools.map(tool => tool.function.name);
        for (const name of ['read', 'grep', 'find', 'ls', 'edit', 'write']) assert.ok(names.includes(name));
        assert.ok(!JSON.stringify(body.messages).includes('你没有任何工具'));
        const userIndex = body.messages.findLastIndex(message => message.role === 'user');
        const content = body.messages[userIndex].content;
        const prompt = typeof content === 'string' ? content : content.filter(block => block.type === 'text').map(block => block.text).join('');
        const results = body.messages.slice(userIndex + 1).filter(message => message.role === 'tool');
        const tools = [];
        if (!results.length) {
            if (prompt === 'READ') tools.push({ name: 'read', arguments: { path: input } });
            else if (prompt === 'CHANGE') tools.push({ name: 'edit', arguments: { path: input, edits: [{ oldText: 'before', newText: 'after' }] } }, { name: 'write', arguments: { path: output, content: 'written' } });
            else tools.push({ name: 'write', arguments: { path: output, content: prompt } });
        } else if (prompt === 'CHANGE' && results.length === 2) {
            tools.push({ name: process.platform === 'win32' ? 'powershell' : 'bash', arguments: { command: process.platform === 'win32' ? "Set-Content -LiteralPath command.txt -Value 'command-ran'" : "printf 'command-ran' > command.txt" } });
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);
        send({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta: tools.length ? { role: 'assistant', tool_calls: tools.map((tool, index) => ({ index, id: `tool-${requests.length}-${index}`, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.arguments) } })) } : { role: 'assistant', content: 'DONE' }, finish_reason: null }] });
        send({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: tools.length ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } });
        res.end('data: [DONE]\n\n');
    });
    provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
    const agentDir = process.env.PI_CODING_AGENT_DIR;
    fs.mkdirSync(path.join(agentDir, 'extensions'), { recursive: true });
    const sentinel = path.join(root, 'unexpected-extension');
    fs.writeFileSync(path.join(agentDir, 'extensions', 'sentinel.ts'), `import {writeFileSync} from 'node:fs'; export default function(){writeFileSync(${JSON.stringify(sentinel)},'unsafe')}`);
    const model = { provider: 'fixture', id: 'fixture', api: 'openai-completions', input: ['text'], contextWindow: 32000, maxTokens: 1000, reasoning: false };
    fs.writeFileSync(path.join(agentDir, 'models.json'), JSON.stringify({ providers: { fixture: { api: model.api, apiKey: 'fixture-key', baseUrl: `http://127.0.0.1:${provider.address().port}/v1`, models: [{ ...model, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
    fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify({ compaction: { enabled: false } }));
    const settings = fs.readFileSync(path.join(agentDir, 'settings.json'));
    const { PiAgentSupervisor } = require('../server/pi-agent-supervisor');
    const { PiSideChatService } = require('../server/pi-side-chat');
    const supervisor = new PiAgentSupervisor();
    const service = new PiSideChatService({ store: { resolveProject: value => value }, supervisor });
    t.after(async () => { await service.dispose(); await supervisor.dispose(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); });
    const owner = { readyState: 1 }, source = { cwd: root, sessionId: 'parent', request: async () => ({ model, sessionId: 'parent' }) };
    const prepared = await service.prepare(owner, source, { mode: 'blank', toolMode: 'assist', retainOnSwitch: true }, () => true);
    const side = service.claim(prepared.ticket, { close() {} }, event => events.push(event));
    const opened = await side.ready;
    assert.equal(opened.state.toolMode, 'assist'); assert.equal(opened.state.toolAccess, 'read');
    assert.equal(side.worker.client.sessionPath, undefined);
    assert.equal(fs.existsSync(sentinel), false);
    assert.equal((await side.handle({ type: 'set_side_model', provider: 'fixture', modelId: 'fixture' })).state.model.id, 'fixture');
    assert.deepEqual(fs.readFileSync(path.join(agentDir, 'settings.json')), settings);
    const settled = () => events.filter(event => event.type === 'agent_settled').length;
    const ask = async message => { const count = settled(); await side.handle({ type: 'prompt', message }); return count; };
    let count = await ask('READ'); await waitFor(() => settled() > count);
    assert.equal(events.filter(event => event.method === 'confirm').length, 0);
    assert.ok(JSON.stringify((await side.handle({ type: 'get_messages' })).messages).includes('before'));
    count = await ask('CHANGE');
    await waitFor(() => events.some(event => event.method === 'confirm'));
    const first = events.find(event => event.method === 'confirm'); assert.equal(first.title, CONFIRM_TITLE);
    assert.equal(fs.readFileSync(input, 'utf8'), 'before'); assert.equal(fs.existsSync(output), false);
    assert.equal((await side.handle({ type: 'get_state' })).pendingUi[0].id, first.id);
    await assert.rejects(side.handle({ type: 'set_side_model', provider: 'fixture', modelId: 'fixture' }), { code: 'SESSION_BUSY' });
    await assert.rejects(side.handle({ type: 'set_side_thinking', thinkingLevel: 'off' }), { code: 'SESSION_BUSY' });
    await assert.rejects(side.handle({ type: 'answer_side_confirmation', requestId: 'forged', confirmed: true }), /失效/);
    await assert.rejects(side.handle({ type: 'answer_side_confirmation', requestId: first.id, confirmed: 'yes' }), /无效/);
    await side.handle({ type: 'answer_side_confirmation', requestId: first.id, confirmed: true });
    await waitFor(() => settled() > count);
    assert.equal(fs.readFileSync(input, 'utf8'), 'after'); assert.equal(fs.readFileSync(output, 'utf8'), 'written');
    assert.equal(fs.readFileSync(commandOutput, 'utf8').trim(), 'command-ran');
    assert.equal(events.filter(event => event.method === 'confirm').length, 1, 'one grant covers the current reply only');
    await assert.rejects(side.handle({ type: 'answer_side_confirmation', requestId: first.id, confirmed: true }), /失效/);
    assert.equal((await side.handle({ type: 'get_state' })).toolAccess, 'read');
    count = await ask('DENIED'); await waitFor(() => events.filter(event => event.method === 'confirm').length === 2);
    const denied = events.filter(event => event.method === 'confirm').at(-1);
    await side.handle({ type: 'answer_side_confirmation', requestId: denied.id, confirmed: false });
    await waitFor(() => settled() > count); assert.equal(fs.readFileSync(output, 'utf8'), 'written');
    count = await ask('ABORT'); await waitFor(() => events.filter(event => event.method === 'confirm').length === 3);
    await side.handle({ type: 'abort' }); await waitFor(() => settled() > count);
    assert.equal(fs.readFileSync(output, 'utf8'), 'written');
    assert.deepEqual((await side.handle({ type: 'get_state' })).pendingUi, []);
    for (const type of ['extension_ui_response', 'bash', 'set_model', 'prepare_side_chat']) await assert.rejects(side.handle({ type }), /不支持/);
    assert.deepEqual(fs.readFileSync(path.join(agentDir, 'settings.json')), settings);
    // Real native idle guards also protect automatic expiry and new-segment close.
    const finalVisible = (await side.handle({ type: 'get_messages' })).messages;
    const final = await side.handle({ type: 'close_side_segment' });
    assert.deepEqual(final.messages, finalVisible);
    const fresh = await service.prepare(owner, source, { mode: 'blank', toolMode: 'assist' }, () => true);
    const next = service.claim(fresh.ticket, { close() {} }, event => events.push(event));
    await next.ready;
    assert.deepEqual((await next.handle({ type: 'get_messages' })).messages, [], 'old side history never seeds the next Agent');
    next.idleDeadline = Date.now() - 1;
    await next.expire();
    assert.ok(events.some(event => event.type === 'gateway_side_expired'));
    assert.equal(supervisor.ephemeralWorkers.size, 0);
    const closing = await service.prepare(owner, source, { mode: 'blank', toolMode: 'assist' }, () => true);
    const closeSide = service.claim(closing.ticket, { close() {} }, event => events.push(event)); await closeSide.ready;
    await closeSide.handle({ type: 'prompt', message: 'CLOSE' }); await waitFor(() => events.filter(event => event.method === 'confirm').length === 4);
    closeSide.idleDeadline = Date.now() - 1;
    await closeSide.expire(); assert.equal(closeSide.closed, false, 'pending confirmation is never expired');
    closeSide.cancelExpiry();
    await closeSide.dispose(); assert.equal(supervisor.ephemeralWorkers.size, 0);
    assert.equal(fs.readFileSync(output, 'utf8'), 'written', 'closing during confirmation must not execute the pending write');
});

test('side chat temporary uploads support documents, files, text and images, and release all resources on end', { timeout: 90000 }, async t => {
    const express = require('express');
    const { zip, docxFiles } = require('./document-fixtures.cjs');
    const { createPiAgentGateway } = require('../server/pi-agent-routes');
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pi-side-uploads-')));
    const agentDir = path.join(root, 'agent');
    fs.mkdirSync(agentDir, { recursive: true });
    process.env.PI_CODING_AGENT_DIR = agentDir;
    process.env.PI_PROJECT_ROOTS = root;
    process.env.PI_WEB_TOKEN = 'side-upload-token';
    process.env.PI_OFFLINE = '1';
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const docxBytes = zip(docxFiles());
    const binBytes = Buffer.from('SIDE_EPHEMERAL_BINARY_PAYLOAD');
    const requests = [], events = [];
    const provider = http.createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw); requests.push(body);
        const userIndex = body.messages.findLastIndex(message => message.role === 'user');
        const content = body.messages[userIndex].content;
        const text = typeof content === 'string' ? content : content.filter(block => block.type === 'text').map(block => block.text).join('');
        const results = body.messages.slice(userIndex + 1).filter(message => message.role === 'tool');
        const tools = [];
        if (!results.length) {
            const docMatch = text.match(/<pivane_document id="([a-f0-9]{64})"/);
            const attMatch = text.match(/<pivane_attachment id="([a-f0-9]{64})"/);
            if (docMatch) tools.push({ name: 'read_document', arguments: { id: docMatch[1], action: 'read', start: 1, count: 5 } });
            if (attMatch) tools.push({ name: 'get_attachment', arguments: { id: attMatch[1] } });
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);
        send({ id: 'fixture', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta: tools.length ? { role: 'assistant', tool_calls: tools.map((tool, index) => ({ index, id: `side-up-${requests.length}-${index}`, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.arguments) } })) } : { role: 'assistant', content: 'UPLOAD_DONE' }, finish_reason: null }] });
        send({ id: 'fixture', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta: {}, finish_reason: tools.length ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 80, completion_tokens: 10, total_tokens: 90 } });
        res.end('data: [DONE]\n\n');
    });
    provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
    const textOnlyModel = { provider: 'fixture', id: 'text-only', name: 'TextOnly', api: 'openai-completions', input: ['text'], contextWindow: 32000, maxTokens: 1000, reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
    const visionModel = { provider: 'fixture', id: 'vision', name: 'Vision', api: 'openai-completions', input: ['text', 'image'], contextWindow: 32000, maxTokens: 1000, reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
    fs.writeFileSync(path.join(agentDir, 'models.json'), JSON.stringify({ providers: { fixture: { api: 'openai-completions', apiKey: 'fixture-key', baseUrl: `http://127.0.0.1:${provider.address().port}/v1`, models: [textOnlyModel, visionModel] } } }));
    fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify({ defaultProvider: 'fixture', defaultModel: 'text-only', compaction: { enabled: false } }));
    const gateway = createPiAgentGateway();
    gateway.titles.saveSettings({ enabled: false });
    const app = express(); app.use(express.json()); gateway.mount(app);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const priorOrigin = process.env.PI_WORKSPACE_INTERNAL_ORIGIN;
    process.env.PI_WORKSPACE_INTERNAL_ORIGIN = origin;
    t.after(async () => {
        if (priorOrigin === undefined) delete process.env.PI_WORKSPACE_INTERNAL_ORIGIN;
        else process.env.PI_WORKSPACE_INTERNAL_ORIGIN = priorOrigin;
        await gateway.dispose(); provider.closeAllConnections();
        await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => provider.close(resolve))]);
        fs.rmSync(root, { recursive: true, force: true });
    });

    const owner = { readyState: 1 }, source = { cwd: root, sessionId: 'parent', request: async type => type === 'get_available_models' ? { models: [textOnlyModel, visionModel] } : { model: textOnlyModel, sessionId: 'parent' } };
    const prepared = await gateway.sideChat.prepare(owner, source, { mode: 'blank', toolMode: 'assist' }, () => true);
    const side = gateway.sideChat.claim(prepared.ticket, { close() {} }, event => events.push(event));
    const opened = await side.ready;
    const sideSessionId = opened.state.sessionId;
    const headers = { Authorization: 'Bearer side-upload-token', 'Content-Type': 'application/octet-stream' };

    const docRes = await fetch(`${origin}/api/pi/side-chat/uploads?${new URLSearchParams({ sideSessionId, name: 'spec.docx', requestId: 'doc-1' })}`, { method: 'POST', headers, body: docxBytes });
    assert.equal(docRes.status, 200);
    const docUploaded = await docRes.json();
    const dupRes = await fetch(`${origin}/api/pi/side-chat/uploads?${new URLSearchParams({ sideSessionId, name: 'spec.docx', requestId: 'doc-1' })}`, { method: 'POST', headers, body: docxBytes });
    assert.equal((await dupRes.json()).reused, true);
    const statusRes = await fetch(`${origin}/api/pi/side-chat/uploads/status?${new URLSearchParams({ sideSessionId, requestId: 'doc-1' })}`, { headers: { Authorization: 'Bearer side-upload-token' } });
    assert.equal(statusRes.status, 200);
    assert.equal((await statusRes.json()).reference.id, docUploaded.reference.id);

    const binRes = await fetch(`${origin}/api/pi/side-chat/uploads?${new URLSearchParams({ sideSessionId, name: 'archive.bin', requestId: 'bin-1' })}`, { method: 'POST', headers, body: binBytes });
    assert.equal(binRes.status, 200);
    const binUploaded = await binRes.json();
    assert.ok(side.tempDir && fs.existsSync(side.tempDir), 'side uploads live in an isolated temporary directory');
    const tempDir = side.tempDir;

    const dlRes = await fetch(`${origin}/api/pi/side-chat/uploads?${new URLSearchParams({ sideSessionId, id: binUploaded.reference.id })}`, { headers: { Authorization: 'Bearer side-upload-token' } });
    assert.equal(dlRes.status, 200);
    assert.deepEqual(Buffer.from(await dlRes.arrayBuffer()), binBytes);

    // Image prompt on a text-only model is rejected cleanly without marking the side chat uncertain.
    await assert.rejects(side.handle({ type: 'prompt', message: 'Check image', images: [{ type: 'image', mimeType: 'image/png', data: pngBase64 }] }), { code: 'RPC_REJECTED' });
    assert.equal(side.uncertain, false);
    await side.handle({ type: 'set_side_model', provider: 'fixture', modelId: 'vision' });

    const settled = () => events.filter(event => event.type === 'agent_settled').length;
    const beforeSettled = settled();
    const promptMessage = `Inspect uploads\n\n<attached_file name="notes.txt">\nINLINE_TEXT_ATTACHMENT\n</attached_file>\n\n${docUploaded.marker}\n\n${binUploaded.marker}`;
    await side.handle({ type: 'prompt', message: promptMessage, images: [{ type: 'image', mimeType: 'image/png', data: pngBase64 }] });
    await waitFor(() => settled() > beforeSettled);
    assert.equal(events.filter(event => event.method === 'confirm').length, 0, 'read_document and get_attachment are read-only in side chat');
    const visible = (await side.handle({ type: 'get_messages' })).messages;
    assert.ok(JSON.stringify(visible).includes('合同 & 分析'), 'read_document parsed the temporary DOCX');
    const toolResult = visible.find(m => m.role === 'toolResult' && m.toolName === 'get_attachment');
    const materializedPath = JSON.parse(toolResult.content[0].text).path;
    assert.ok(materializedPath.startsWith(tempDir), 'get_attachment stays inside the side tempDir');
    assert.equal(fs.readFileSync(materializedPath).toString('utf8'), 'SIDE_EPHEMERAL_BINARY_PAYLOAD');
    assert.equal(fs.existsSync(path.join(root, '.ohmybuddy-attachments')), false, 'never writes into project .ohmybuddy-attachments');
    assert.equal(fs.existsSync(path.join(agentDir, 'ohmybuddy-uploads')), false, 'never writes into persistent ohmybuddy-uploads');
    assert.equal(fs.existsSync(path.join(agentDir, 'ohmybuddy-session-images')), false, 'never writes into persistent ohmybuddy-session-images');

    await side.handle({ type: 'close_side_segment' });
    assert.equal(fs.existsSync(tempDir), false, 'ending the side segment immediately deletes the temporary directory');
    assert.equal(fs.existsSync(materializedPath), false, 'materialized file is deleted when side chat ends');
    const afterEndRes = await fetch(`${origin}/api/pi/side-chat/uploads?${new URLSearchParams({ sideSessionId, id: binUploaded.reference.id })}`, { headers: { Authorization: 'Bearer side-upload-token' } });
    assert.equal(afterEndRes.status, 409);
});
