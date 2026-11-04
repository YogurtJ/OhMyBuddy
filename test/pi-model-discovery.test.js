const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omb-discovery-agent-'));
process.env.PI_CODING_AGENT_DIR = agentDir;
const discovery = require('../server/pi-model-discovery');
const { PiSettingsService } = require('../server/pi-settings-service');
test.after(() => fs.rmSync(agentDir, { recursive: true, force: true }));

function reply(status, body, headers = {}) {
    const bytes = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    return { status, ok: status >= 200 && status < 300, headers: { get: name => headers[name.toLowerCase()] ?? null }, body: [bytes] };
}
function recorder(responses) {
    const calls = [];
    const fetch = async (url, options) => { calls.push({ url, options }); const next = responses.shift(); return typeof next === 'function' ? next(url, options) : next; };
    return { calls, fetch };
}
const catalog = discovery.buildCatalog([
    { provider: 'openai', id: 'gpt-5.4-mini', name: 'GPT-5.4 mini', contextWindow: 400000, maxTokens: 128000, input: ['text', 'image'], reasoning: true },
    { provider: 'openrouter', id: 'openai/gpt-5.4-mini', contextWindow: 1000, maxTokens: 10, input: ['text'] },
    { provider: 'openrouter', id: 'black-forest-labs/flux.2-pro', type: 'image', input: ['text'] }
]);

test('OpenAI-compatible discovery classifies models and fills chat metadata without selecting anything', async () => {
    const { calls, fetch } = recorder([reply(200, { object: 'list', data: [
        { id: 'gpt-5.4-mini' }, { id: 'vendor/gpt-5.4-mini' }, { id: 'gpt-image-2' }, { id: 'text-embedding-3-large' }, { id: 'whisper-1' },
        { id: 'tts-1' }, { id: 'gpt-4o-realtime-preview' }, { id: 'sora-2' }, { id: 'flux.2-pro' }, { id: 'mystery-model' }, { id: 'gpt-5.4-mini' }, { id: 'bad id' }, 'plain-string'
    ] })]);
    const result = await discovery.discoverModels({ api: 'openai-completions', baseUrl: 'https://relay.example.com/v1/', apiKey: 'sk-fixture', fetch, catalog });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://relay.example.com/v1/models');
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[0].options.redirect, 'manual');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer sk-fixture');
    assert.equal(result.ok, true);
    const kinds = Object.fromEntries(result.models.map(model => [model.id, model.kind]));
    assert.deepEqual(kinds, { 'flux.2-pro': 'image', 'gpt-4o-realtime-preview': 'realtime', 'gpt-5.4-mini': 'chat', 'gpt-image-2': 'image', 'mystery-model': 'chat',
        'plain-string': 'chat', 'sora-2': 'video', 'text-embedding-3-large': 'embedding', 'tts-1': 'tts', 'vendor/gpt-5.4-mini': 'chat', 'whisper-1': 'asr' });
    const mini = result.models.find(model => model.id === 'gpt-5.4-mini');
    assert.deepEqual([mini.contextWindow, mini.maxTokens, mini.imageInput, mini.reasoning, mini.metadata], [400000, 128000, true, true, 'catalog']);
    const prefixed = result.models.find(model => model.id === 'vendor/gpt-5.4-mini');
    assert.equal(prefixed.contextWindow, 400000, 'official catalog wins over relay catalogs for a prefixed exact suffix');
    const unknown = result.models.find(model => model.id === 'mystery-model');
    assert.deepEqual([unknown.contextWindow, unknown.maxTokens, unknown.metadata, unknown.kindSource], [128000, 16384, 'default', 'default']);
    assert.equal(result.models.some(model => 'selected' in model), false);
});

test('service metadata wins over names and the catalog, with clamped limits', async () => {
    const { fetch } = recorder([reply(200, { data: [
        { id: 'router/vision', name: 'Router Vision', context_length: 9000000, architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
            top_provider: { max_completion_tokens: 64000 }, supported_parameters: ['reasoning', 'tools'] },
        { id: 'router/image-out', architecture: { output_modalities: ['image', 'text'] } },
        { id: 'gpt-5.4-mini', context_length: 32000, architecture: { input_modalities: ['text'], output_modalities: ['text'] }, supported_parameters: ['tools'] },
        { id: 'endpoint-embed', supported_endpoint_types: ['embeddings'] }
    ] })]);
    const { models } = await discovery.discoverModels({ api: 'openai-completions', baseUrl: 'https://openrouter.example/api/v1', fetch, catalog });
    const byId = Object.fromEntries(models.map(model => [model.id, model]));
    assert.deepEqual([byId['router/vision'].name, byId['router/vision'].contextWindow, byId['router/vision'].maxTokens, byId['router/vision'].imageInput, byId['router/vision'].reasoning, byId['router/vision'].metadata],
        ['Router Vision', 4000000, 64000, true, true, 'service']);
    assert.equal(byId['router/image-out'].kind, 'image');
    assert.deepEqual([byId['gpt-5.4-mini'].contextWindow, byId['gpt-5.4-mini'].imageInput, byId['gpt-5.4-mini'].reasoning], [32000, false, false], 'service capabilities are not overridden by the catalog');
    assert.equal(byId['endpoint-embed'].kind, 'embedding');
});

test('Anthropic and Gemini use their native key headers, list paths and bounded pagination', async () => {
    const anthropic = recorder([
        reply(200, { data: [{ id: 'claude-a', display_name: 'Claude A' }], has_more: true, last_id: 'claude-a' }),
        reply(200, { data: [{ id: 'claude-b' }], has_more: false })
    ]);
    const first = await discovery.discoverModels({ api: 'anthropic-messages', baseUrl: 'https://claude.example.com', apiKey: 'ant-key', fetch: anthropic.fetch, catalog });
    assert.deepEqual(anthropic.calls.map(call => call.url), ['https://claude.example.com/v1/models?limit=1000', 'https://claude.example.com/v1/models?limit=1000&after_id=claude-a']);
    assert.equal(anthropic.calls[0].options.headers['x-api-key'], 'ant-key');
    assert.equal(anthropic.calls[0].options.headers['anthropic-version'], '2023-06-01');
    assert.equal(anthropic.calls[0].options.headers.Authorization, undefined);
    assert.deepEqual(first.models.map(model => [model.id, model.name]), [['claude-a', 'Claude A'], ['claude-b', 'claude-b']]);

    const gemini = recorder([
        reply(200, { models: [{ name: 'models/gemini-x', displayName: 'Gemini X', inputTokenLimit: 1048576, outputTokenLimit: 65536, supportedGenerationMethods: ['generateContent'], thinking: true }], nextPageToken: 'next' }),
        reply(200, { models: [{ name: 'models/imagen-4', supportedGenerationMethods: ['predict'] }, { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }] })
    ]);
    const second = await discovery.discoverModels({ api: 'google-generative-ai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'g-key', fetch: gemini.fetch, catalog });
    assert.equal(gemini.calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000');
    assert.equal(gemini.calls[1].url, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&pageToken=next');
    assert.equal(gemini.calls[0].options.headers['x-goog-api-key'], 'g-key');
    assert.equal(gemini.calls[0].url.includes('g-key'), false, 'the key is never put in the URL');
    const kinds = Object.fromEntries(second.models.map(model => [model.id, model.kind]));
    assert.deepEqual(kinds, { 'gemini-x': 'chat', 'imagen-4': 'image', 'text-embedding-004': 'embedding' });
    const chat = second.models.find(model => model.id === 'gemini-x');
    assert.deepEqual([chat.name, chat.contextWindow, chat.maxTokens, chat.reasoning], ['Gemini X', 1048576, 65536, true]);

    let pages = 0;
    const endless = async () => reply(200, { models: [{ name: `models/m-${pages++}` }], nextPageToken: 'again' });
    const bounded = await discovery.discoverModels({ api: 'google-generative-ai', baseUrl: 'https://g.example/v1beta', fetch: endless, catalog });
    assert.equal(pages, 5);
    assert.equal(bounded.truncated, true);
});

test('failures are classified, redirects are not followed, bodies are bounded and keys are redacted', async () => {
    const run = async (response, apiKey = 'sk-secret-value') => {
        const { calls, fetch } = recorder([response]);
        return { calls, result: await discovery.discoverModels({ api: 'openai-completions', baseUrl: 'https://relay.example.com/v1', apiKey, fetch, catalog }) };
    };
    const redirect = await run(reply(302, '', { location: 'https://evil.example/models' }));
    assert.equal(redirect.calls.length, 1);
    assert.deepEqual([redirect.result.ok, redirect.result.reason, redirect.result.httpStatus], [false, 'redirect', 302]);
    const denied = await run(reply(401, { error: { message: 'Invalid key sk-secret-value supplied' } }));
    assert.deepEqual([denied.result.reason, denied.result.httpStatus], ['auth', 401]);
    assert.equal(denied.result.detail, 'Invalid key *** supplied');
    assert.equal(JSON.stringify(denied.result).includes('sk-secret-value'), false);
    assert.equal((await run(reply(404, 'Not Found'))).result.reason, 'not_found');
    assert.equal((await run(reply(500, 'oops'))).result.reason, 'http');
    assert.equal((await run(reply(200, 'not json'))).result.reason, 'invalid');
    assert.equal((await run(reply(200, { unexpected: true }))).result.reason, 'invalid');
    assert.equal((await run(reply(200, '{}', { 'content-length': String(64 * 1024 * 1024) }))).result.reason, 'too_large');
    const streamed = await run({ status: 200, ok: true, headers: { get: () => null }, body: Array.from({ length: 9 }, () => Buffer.alloc(1024 * 1024, 32)) });
    assert.equal(streamed.result.reason, 'too_large');
    const offline = recorder([() => { throw new Error('ECONNREFUSED'); }]);
    const network = await discovery.discoverModels({ api: 'openai-completions', baseUrl: 'http://127.0.0.1:9/v1', fetch: offline.fetch, catalog });
    assert.equal(network.reason, 'network');
    const anonymous = await run(reply(200, { data: [] }), '');
    assert.equal(anonymous.calls[0].options.headers.Authorization, undefined);
});

test('generated provider IDs avoid built-in and existing IDs', () => {
    const taken = new Set(['openai', 'openai-custom', 'relay']);
    const has = id => taken.has(id);
    assert.equal(discovery.providerIdFor('OpenAI', 'https://api.openai.com/v1', has), 'openai-2');
    assert.equal(discovery.providerIdFor('My Relay!', 'https://x.example/v1', has), 'my-relay');
    assert.equal(discovery.providerIdFor('我的中转站', 'https://api.relay.cn/v1', has), 'relay-custom');
    assert.equal(discovery.providerIdFor('123', 'https://x.example/v1', has), 'custom-123');
    assert.equal(discovery.providerIdFor('', 'http://127.0.0.1:8080/v1', has), 'custom-127-0-0-1');
});

function providerFetch(models) {
    const calls = [];
    const fetch = async (url, options) => { calls.push({ url, headers: options.headers }); return reply(200, { data: models.map(id => ({ id })) }); };
    return { calls, fetch };
}

test('one-step setup writes provider, models and key; existing providers discover with the saved key', async () => {
    const { calls, fetch } = providerFetch(['gpt-5.4-mini', 'gpt-6', 'gpt-image-2']);
    const service = new PiSettingsService({ cwd: agentDir, fetch });
    const draft = await service.discoverCustomModels({ api: 'openai-completions', baseUrl: 'https://relay.example.com/v1', apiKey: 'sk-draft-key' });
    assert.equal(draft.ok, true);
    assert.equal(calls.at(-1).headers.Authorization, 'Bearer sk-draft-key');
    assert.equal(JSON.stringify(draft).includes('sk-draft-key'), false);
    assert.equal(fs.existsSync(path.join(agentDir, 'models.json')), false, 'discovery never writes configuration');

    await assert.rejects(service.createCustomProvider({ name: 'Relay', api: 'openai-completions', baseUrl: 'https://relay.example.com/v1', models: [] }), /至少添加一个模型/);
    await assert.rejects(service.createCustomProvider({ name: 'Relay', api: 'openai-completions', baseUrl: 'https://relay.example.com/v1', models: [{ id: 'a' }, { id: 'a' }] }), /重复/);
    await assert.rejects(service.createCustomProvider({ name: 'Relay', id: 'openai', api: 'openai-completions', baseUrl: 'https://relay.example.com/v1', models: [{ id: 'a' }] }),
        error => error.statusCode === 409);
    assert.equal(fs.existsSync(path.join(agentDir, 'models.json')), false, 'rejected setup leaves no file');

    const created = await service.createCustomProvider({ name: 'OpenAI', api: 'openai-completions', baseUrl: 'https://relay.example.com/v1', apiKey: 'sk-saved-key',
        models: [{ id: 'gpt-5.4-mini', contextWindow: 400000, maxTokens: 128000, imageInput: true, reasoning: true }] });
    assert.deepEqual(created, { ok: true, providerId: 'openai-custom', modelCount: 1, credential: 'saved', requiresRuntimeRestart: true });
    const saved = JSON.parse(fs.readFileSync(path.join(agentDir, 'models.json'), 'utf8')).providers['openai-custom'];
    assert.equal(saved.name, 'OpenAI');
    assert.equal(saved.apiKey, undefined, 'the key goes to the Pi credential store, not models.json');
    assert.deepEqual([saved.models[0].contextWindow, saved.models[0].input, saved.modelOverrides['gpt-5.4-mini'].contextWindow], [400000, ['text', 'image'], 400000]);
    assert.ok(saved.models[0].cost.input > 0, 'exact official IDs receive catalog prices');
    const snapshot = await service.getModelSnapshot();
    const provider = snapshot.providers.find(item => item.id === 'openai-custom');
    assert.deepEqual([provider.name, provider.configured, provider.storedCredential], ['OpenAI', true, 'api_key']);
    assert.equal(JSON.stringify(snapshot).includes('sk-saved-key'), false);

    const listed = await service.discoverCustomModels({ providerId: 'openai-custom' });
    assert.equal(calls.at(-1).headers.Authorization, 'Bearer sk-saved-key');
    assert.equal(JSON.stringify(listed).includes('sk-saved-key'), false);
    assert.deepEqual(listed.models.filter(model => model.added).map(model => model.id), ['gpt-5.4-mini']);

    const file = path.join(agentDir, 'models.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.providers['openai-custom'].models[0].cost = { input: 9, output: 9, cacheRead: 0, cacheWrite: 0 };
    data.providers['openai-custom'].models[0].futureField = 'keep';
    fs.writeFileSync(file, JSON.stringify(data));
    await service.addCustomModels('openai-custom', { models: [{ id: 'gpt-6', contextWindow: 200000, maxTokens: 32000 }] });
    const after = JSON.parse(fs.readFileSync(file, 'utf8')).providers['openai-custom'];
    assert.deepEqual(after.models.map(model => model.id), ['gpt-5.4-mini', 'gpt-6']);
    assert.deepEqual([after.models[0].cost.input, after.models[0].futureField], [9, 'keep'], 'batch add keeps existing models untouched');
    await assert.rejects(service.addCustomModels('missing-provider', { models: [{ id: 'x' }] }), /not found/);
    await assert.rejects(service.addCustomModels('openai-custom', { models: Array.from({ length: 201 }, (_, i) => ({ id: `m-${i}` })) }), /200/);
});

test('a failed key save is reported after the provider is written and never echoes the key', async () => {
    const service = new PiSettingsService({ cwd: agentDir, fetch: providerFetch([]).fetch });
    service.storeApiKey = async () => { throw new Error('store rejected sk-failing-key'); };
    const result = await service.createCustomProvider({ name: 'Local', api: 'openai-responses', baseUrl: 'http://127.0.0.1:8080/v1', apiKey: 'sk-failing-key', models: [{ id: 'local-model' }] });
    assert.equal(result.credential, 'failed');
    assert.equal(result.credentialError, 'store rejected ***');
    assert.ok((await service.listCustomProviders()).some(provider => provider.id === result.providerId));
    const anonymous = await service.createCustomProvider({ name: 'Local', api: 'openai-responses', baseUrl: 'http://127.0.0.1:8081/v1', models: [{ id: 'local-model' }] });
    assert.equal(anonymous.credential, 'none');
    assert.notEqual(anonymous.providerId, result.providerId, 'a second provider with the same name gets its own ID');
});
