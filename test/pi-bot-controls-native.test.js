// Actual managed Bot worker with a loopback synthetic provider. No real provider or WeChat calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-controls-native-')));
const agentDir = path.join(root, 'agent'); fs.mkdirSync(agentDir);
process.env.PI_CODING_AGENT_DIR = agentDir; process.env.PI_PROJECT_ROOTS = root; process.env.PI_OFFLINE = '1';
process.env.PI_WEB_DEFERRED_FILE = path.join(root, 'deferred.json');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('a real Bot worker applies explicit/default vision before the first image and keeps queries read-only', { timeout: 120000 }, async t => {
    const calls = [];
    const provider = http.createServer(async (req, res) => {
        let text = ''; for await (const part of req) text += part;
        const input = JSON.parse(text); calls.push(input);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        for (const [delta, finish] of [[{ role: 'assistant', content: 'Synthetic Bot reply' }, null], [{}, 'stop']])
            res.write(`data: ${JSON.stringify({ id: 'synthetic', object: 'chat.completion.chunk', model: input.model,
                choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
        res.end('data: [DONE]\n\n');
    });
    provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
    const writeDefaults = model => fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify({ defaultProvider: 'fixture',
        defaultModel: model, defaultThinkingLevel: 'off', defaultProjectTrust: 'never', enableInstallTelemetry: false, compaction: { enabled: false } }));
    writeDefaults('text');
    fs.writeFileSync(path.join(agentDir, 'models.json'), JSON.stringify({ providers: { fixture: { baseUrl: `http://127.0.0.1:${provider.address().port}/v1`,
        api: 'openai-completions', apiKey: 'synthetic', models: ['text', 'vision'].map(id => ({ id, reasoning: false,
            input: id === 'vision' ? ['text', 'image'] : ['text'], contextWindow: 32000, maxTokens: 1000 })) } } }));
    const { WorkspaceAccessService } = require('../server/workspace-access-service');
    const gateway = require('../server/pi-agent-routes').createPiAgentGateway({
        accessService: new WorkspaceAccessService({ envToken: () => 'synthetic' }), deferredFilePath: process.env.PI_WEB_DEFERRED_FILE });
    t.after(async () => { await gateway.dispose(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); });
    const created = await gateway.bots.create({ expectedRevision: (await gateway.bots.profiles.state()).revision });
    const { session } = await gateway.bots.resolve(created.bot.id, created.window.id);
    const worker = await gateway.supervisor.getWorker({ cwd: session.cwd, sessionPath: session.path, sessionId: session.id });
    assert.equal((await worker.request('get_state')).model.id, 'text');
    const patch = async model => gateway.bots.update(created.bot.id, { expectedRevision: (await gateway.bots.profiles.state()).revision,
        changes: { bot: { model } } });
    const input = n => ({ id: createHash('sha256').update(String(n)).digest('hex'), peerId: 'owner', text: 'Read the attached image',
        images: [{ type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==' }] });
    const beforeRejectedImage = (await worker.request('get_entries')).entries.length;
    await assert.rejects(worker.channelTurn(input(0)), { code: 'CHANNEL_IMAGE_UNSUPPORTED' });
    assert.equal((await worker.request('get_entries')).entries.length, beforeRejectedImage, 'coded image preflight adds no native entry');
    await patch({ provider: 'fixture', id: 'vision' });
    await worker.channelTurn(input(1));
    assert.equal(calls.at(-1).model, 'vision');
    assert.ok(calls.at(-1).messages.some(message => Array.isArray(message.content) && message.content.some(part => part.type === 'image_url')));
    await patch({ provider: 'fixture', id: 'text' });
    await worker.channelTurn({ ...input(2), text: 'Plain text turn', images: [] });
    assert.equal(calls.at(-1).model, 'text');
    writeDefaults('vision'); await patch(null);
    const query = { mode: 'channel', input: { action: 'status', sessionId: session.id, id: input(1).id } };
    await worker.exclusive(rpc => worker.navigate(rpc, query));
    assert.equal((await worker.request('get_state')).model.id, 'text', 'querying a prior turn never applies the new default');
    await worker.channelTurn(input(3));
    assert.equal(calls.at(-1).model, 'vision'); assert.equal(calls.length, 3);
    assert.equal((await gateway.bots.bot(created.bot.id)).bot.model, null);
    const globalSettings = JSON.parse(fs.readFileSync(path.join(agentDir, 'settings.json')));
    delete globalSettings.defaultProvider; delete globalSettings.defaultModel;
    fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify(globalSettings));
    const savedDefaults = fs.readFileSync(path.join(agentDir, 'settings.json'));
    const callsBeforeValidation = calls.length;
    const automatic = await gateway.bots.settings(created.bot.id);
    assert.equal(automatic.models.defaults.provider, undefined); assert.equal(automatic.models.defaults.modelId, undefined);
    assert.deepEqual(automatic.models.effectiveDefault, { provider: 'fixture', modelId: 'text' });
    await gateway.bots.update(created.bot.id, { expectedRevision: (await gateway.bots.profiles.state()).revision,
        changes: { bot: { thinking: 'off' } } });
    assert.equal((await gateway.bots.bot(created.bot.id)).bot.thinking, 'off');
    assert.equal((await gateway.bots.bot(created.bot.id)).bot.model, null);
    assert.equal(calls.length, callsBeforeValidation, 'catalog resolution and independent thinking validation do not send model requests');
    assert.deepEqual(fs.readFileSync(path.join(agentDir, 'settings.json')), savedDefaults, 'validation never persists an automatic global default');
    await worker.channelTurn({ ...input(4), text: 'Use the automatic model', images: [] });
    assert.equal(calls.at(-1).model, automatic.models.effectiveDefault.modelId, 'runtime and public effective default agree');
    assert.deepEqual(fs.readFileSync(path.join(agentDir, 'settings.json')), savedDefaults);
    fs.writeFileSync(path.join(agentDir, 'models.json'), JSON.stringify({ providers: {} }));
    const unavailable = await gateway.bots.settings(created.bot.id);
    assert.equal(unavailable.models.effectiveDefault, null);
    const preserved = (await gateway.bots.bot(created.bot.id)).bot;
    await assert.rejects(gateway.bots.update(created.bot.id, { expectedRevision: (await gateway.bots.profiles.state()).revision,
        changes: { bot: { thinking: 'low' } } }), { code: 'BOT_MODEL_UNAVAILABLE' });
    assert.deepEqual((await gateway.bots.bot(created.bot.id)).bot, preserved);
    assert.equal(calls.length, callsBeforeValidation + 1);

});

test('a real Bot worker follows saved global thinking with an automatic model, without requests or saved-model side effects', { timeout: 120000 }, async t => {
    const calls = [];
    const provider = http.createServer(async (req, res) => { calls.push(req.url); res.writeHead(500); res.end(); });
    provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
    const settingsFile = path.join(agentDir, 'settings.json'), modelsFile = path.join(agentDir, 'models.json');
    fs.writeFileSync(settingsFile, JSON.stringify({ defaultThinkingLevel: 'high', defaultProjectTrust: 'never', enableInstallTelemetry: false }));
    fs.writeFileSync(modelsFile, JSON.stringify({ providers: { fixture: { baseUrl: `http://127.0.0.1:${provider.address().port}/v1`,
        api: 'openai-completions', apiKey: 'synthetic', models: [{ id: 'reasoner', reasoning: true, input: ['text'], contextWindow: 32000, maxTokens: 1000 }] } } }));
    const { WorkspaceAccessService } = require('../server/workspace-access-service');
    const gateway = require('../server/pi-agent-routes').createPiAgentGateway({
        accessService: new WorkspaceAccessService({ envToken: () => 'synthetic' }), deferredFilePath: process.env.PI_WEB_DEFERRED_FILE });
    t.after(async () => { await gateway.dispose(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); });
    const created = await gateway.bots.create({ expectedRevision: (await gateway.bots.profiles.state()).revision });
    const { session } = await gateway.bots.resolve(created.bot.id, created.window.id);
    const open = () => gateway.supervisor.getWorker({ cwd: session.cwd, sessionPath: session.path, sessionId: session.id });
    const saved = fs.readFileSync(settingsFile);
    const settings = await gateway.bots.settings(created.bot.id);
    assert.deepEqual(settings.models.effectiveDefault, { provider: 'fixture', modelId: 'reasoner' });
    assert.equal(settings.bot.bot.model, null); assert.equal(settings.bot.bot.thinking, null);
    const worker = await open(), state = await worker.request('get_state');
    assert.equal(state.model.id, 'reasoner'); assert.equal(state.thinkingLevel, 'high');
    assert.deepEqual(fs.readFileSync(settingsFile), saved); assert.deepEqual(calls, [], 'catalog resolution and opening send no provider request');
});
