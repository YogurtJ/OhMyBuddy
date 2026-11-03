'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-pi150-')));
process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent');
process.env.PI_OFFLINE = '1'; process.env.PI_TELEMETRY = '0';
fs.mkdirSync(process.env.PI_CODING_AGENT_DIR);
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

test('Pi 1.5 validates TypeBox and plain MCP schemas through the same nested permission pipeline', async () => {
    const { Type } = await import('typebox');
    const { validateToolArguments } = await import('@earendil-works/pi-ai');
    const { runToolCall } = await import('@earendil-works/pi-agent-core');
    const schemas = [Type.Object({ limit: Type.Integer({ minimum: 1 }), ids: Type.Array(Type.String()), optional: Type.Optional(Type.String()) }),
        { type: 'object', properties: { limit: { type: 'integer', minimum: 1 }, ids: { type: 'array', items: { type: 'string' } }, optional: { type: 'string' } }, required: ['limit', 'ids'] }];
    for (const parameters of schemas) {
        const executed = [], checked = [];
        const tool = { name: 'fixture', label: 'Fixture', description: 'Synthetic nested tool', parameters,
            execute: async (_id, args) => { executed.push(args); return { content: [{ type: 'text', text: 'ok' }] }; } };
        const call = { type: 'toolCall', id: 'nested', name: tool.name, arguments: { limit: '2', ids: 'one', optional: null } };
        const before = structuredClone(call);
        const options = { tools: [tool], assistantMessage: { role: 'assistant', content: [call] }, context: { messages: [], tools: [tool] },
            beforeToolCall: async context => { checked.push(context.args); return { block: true, reason: 'synthetic permission denial' }; } };
        const denied = await runToolCall(call, options);
        assert.equal(denied.isError, true); assert.equal(executed.length, 0);
        assert.deepEqual(checked, [{ limit: 2, ids: ['one'] }]);
        const accepted = await runToolCall(call, { ...options, beforeToolCall: async context => { checked.push(context.args); } });
        assert.equal(accepted.isError, false); assert.deepEqual(executed, [{ limit: 2, ids: ['one'] }]);
        assert.deepEqual(call, before, 'coercion does not change native transcript arguments');
        assert.throws(() => validateToolArguments(tool, { ...call, arguments: { limit: 'bad' } }), /limit: expected integer, got string/);
    }
    const media = { name: 'media', parameters: Type.Object({ parameters: Type.Object({}, { patternProperties: { '^.*$': {} }, additionalProperties: true }) }) };
    const args = { parameters: { width: 1024, nested: { enabled: true } } };
    assert.deepEqual(validateToolArguments(media, { name: media.name, arguments: args }), args);
});

test('image-wrapped SDK summaries retain stored OAuth rather than passing an explicit API key', async t => {
    const sdk = await import('@earendil-works/pi-coding-agent');
    const { createAssistantMessageEventStream } = await import('@earendil-works/pi-ai');
    const { installImageCompatibility } = await import('../server/pi-image-runtime.mjs');
    for (const operation of ['branch', 'compact']) await t.test(operation, async () => {
        const cwd = path.join(root, operation); fs.mkdirSync(cwd);
        const authPath = path.join(cwd, 'auth.json');
        fs.writeFileSync(authPath, JSON.stringify({ 'oauth-fixture': { type: 'oauth', access: 'synthetic-oauth', refresh: 'synthetic-refresh', expires: Date.now() + 3600000 } }), { mode: 0o600 });
        const runtime = await sdk.ModelRuntime.create({ authPath, modelsPath: null, modelsStorePath: path.join(cwd, 'catalog.json'), allowModelNetwork: false });
        const model = { id: 'model', name: 'Fixture', provider: 'oauth-fixture', api: 'openai-completions', baseUrl: 'https://example.invalid/v1',
            reasoning: false, input: ['text', 'image'], contextWindow: 128000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
        const requests = [], overrides = [];
        runtime.registerProvider(model.provider, { name: 'Synthetic OAuth', api: model.api, baseUrl: model.baseUrl, apiKey: 'UNUSED_ENV_KEY',
            oauth: { name: 'Synthetic subscription', login: async () => ({ access: 'synthetic-oauth', refresh: 'synthetic-refresh', expires: Date.now() + 3600000 }),
                refreshToken: async credential => credential, getApiKey: credential => credential.access }, models: [model],
            streamSimple: (selected, _context, options) => {
                requests.push(options);
                const stream = createAssistantMessageEventStream();
                stream.end({ role: 'assistant', content: [{ type: 'text', text: 'Synthetic summary' }], api: selected.api, provider: selected.provider,
                    model: selected.id, usage, stopReason: 'stop', timestamp: Date.now() });
                return stream;
            } });
        const getAuth = runtime.getAuth.bind(runtime);
        runtime.getAuth = (...args) => { overrides.push(args[1]?.apiKey); return getAuth(...args); };
        const settings = sdk.SettingsManager.inMemory({ enableInstallTelemetry: false, compaction: { enabled: false, reserveTokens: 1024, keepRecentTokens: 16 } });
        const loader = new sdk.DefaultResourceLoader({ cwd, agentDir: cwd, settingsManager: settings, noExtensions: true, noSkills: true,
            noPromptTemplates: true, noContextFiles: true, noThemes: true });
        await loader.reload();
        const manager = sdk.SessionManager.inMemory(cwd);
        const { session } = await sdk.createAgentSession({ cwd, agentDir: cwd, modelRuntime: runtime, model, settingsManager: settings, sessionManager: manager, resourceLoader: loader });
        try {
            installImageCompatibility(session, { agentDir: cwd });
            const first = manager.appendMessage({ role: 'user', content: 'First requirement. '.repeat(200), timestamp: 1 });
            for (let i = 0; i < 4; i++) {
                manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'Earlier reply. '.repeat(200) }], api: model.api,
                    provider: model.provider, model: model.id, usage, stopReason: 'stop', timestamp: 2 + i * 2 });
                manager.appendMessage({ role: 'user', content: 'Continue requirement. '.repeat(200), timestamp: 3 + i * 2 });
            }
            if (operation === 'branch') assert.match((await session.navigateTree(first, { summarize: true })).summaryEntry.summary, /Synthetic summary/);
            else assert.match((await session.compact()).summary, /Synthetic summary/);
            assert.equal(requests.length, 1); assert.equal(requests[0].apiKey, 'synthetic-oauth');
            assert.ok(overrides.length > 0); assert.ok(overrides.every(value => value === undefined), 'summary auth stays runtime-owned after image wrapping');
            assert.equal(manager.getEntries().filter(entry => entry.type === 'message').length, 9, 'original entries are retained');
        } finally { session.dispose(); }
    });
});
