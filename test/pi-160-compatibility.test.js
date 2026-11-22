'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-pi160-')));
process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent');
process.env.PI_OFFLINE = '1'; process.env.PI_TELEMETRY = '0';
fs.mkdirSync(process.env.PI_CODING_AGENT_DIR);
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const fixtureModel = { id: 'fixture', name: 'Fixture', provider: 'fixture', api: 'openai-completions', baseUrl: 'https://example.invalid/v1',
    reasoning: false, input: ['text'], contextWindow: 32000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
async function services(options = {}) {
    const sdk = await import('@earendil-works/pi-coding-agent');
    const runtime = await sdk.ModelRuntime.create({ modelsPath: null, modelsStorePath: path.join(root, 'catalog.json'), allowModelNetwork: false });
    runtime.registerProvider('fixture', { api: fixtureModel.api, baseUrl: fixtureModel.baseUrl, apiKey: 'synthetic', models: [fixtureModel] });
    return sdk.createAgentSessionServices({ cwd: root, agentDir: process.env.PI_CODING_AGENT_DIR, modelRuntime: runtime,
        settingsManager: sdk.SettingsManager.inMemory({ defaultProvider: 'fixture', defaultModel: 'fixture', enableInstallTelemetry: false, cacheWarming: 'off' }),
        resourceLoaderOptions: { noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, ...options } });
}

test('Pi 1.6 model limits and thinking follow the exact connection instead of the custom-model fallback', async () => {
    const { ModelRuntime } = await import('@earendil-works/pi-coding-agent');
    const { getSupportedThinkingLevels } = await import('@earendil-works/pi-ai');
    const runtime = await ModelRuntime.create({ allowModelNetwork: false });
    for (const [provider, id, window] of [['openai', 'gpt-6.2-sol', 272000], ['openai-codex', 'gpt-6.2-sol', 500000],
        ['openai-codex', 'gpt-6.2-astra', 272000], ['azure', 'gpt-6.2-sol', 1050000]]) {
        const model = runtime.getModel(provider, id);
        assert.equal(model.contextWindow, window); assert.ok(!getSupportedThinkingLevels(model).includes('off'));
        assert.equal(model.maxTokens, 128000);
    }
    const { compatSchema } = require('../server/pi-model-advanced');
    assert.equal((await compatSchema('mistral-conversations')).supportsStrictMode.type, 'boolean');
});

test('aborting a tool batch finalizes every call without invoking later permissions or tools', async () => {
    const { Agent } = await import('@earendil-works/pi-agent-core');
    const { createAssistantMessageEventStream } = await import('@earendil-works/pi-ai');
    const calls = ['first', 'second', 'third'].map(id => ({ type: 'toolCall', id, name: id, arguments: {} }));
    const executed = [], checked = [], events = [];
    let agent, streamCalls = 0;
    const tools = calls.map(call => ({ name: call.name, label: call.name, description: call.name, parameters: { type: 'object', properties: {} },
        execute: async () => { executed.push(call.id); agent.abort(); return { content: [{ type: 'text', text: 'first finished' }] }; } }));
    agent = new Agent({ initialState: { model: fixtureModel, tools }, toolExecution: 'sequential',
        beforeToolCall: async value => { checked.push(value.toolCall.id); },
        streamFn: () => { assert.equal(++streamCalls, 1, 'the synthetic provider must not repeat a tool batch'); const stream = createAssistantMessageEventStream(); stream.end({ role: 'assistant', content: calls,
            api: fixtureModel.api, provider: fixtureModel.provider, model: fixtureModel.id, timestamp: 1, stopReason: 'toolUse', usage }); return stream; } });
    agent.subscribe(event => events.push(event));
    await agent.prompt('Synthetic cancellation');
    assert.deepEqual(executed, ['first']); assert.deepEqual(checked, ['first']);
    const results = agent.state.messages.filter(message => message.role === 'toolResult');
    assert.deepEqual(results.map(message => message.toolCallId), ['first', 'second', 'third']);
    assert.ok(results.slice(1).every(message => message.isError && message.content[0].text === 'Operation aborted'));
    assert.equal(events.filter(event => event.type === 'tool_execution_end').length, 3);
});

test('a session_start that removes only its own tool preserves a delayed restored tool across resume and reload', async t => {
    const sdk = await import('@earendil-works/pi-coding-agent');
    const manager = sdk.SessionManager.inMemory(root);
    const late = { name: 'mcp__late__echo', label: 'Late MCP', description: 'Synthetic restored tool', parameters: { type: 'object', properties: {} },
        execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }) };
    manager.appendMessage({ role: 'system', content: 'Prior tool loadout', timestamp: 1,
        toolsAdded: [{ name: late.name, description: late.description, parameters: late.parameters }] });
    let host;
    const input = await services({ extensionFactories: [pi => {
        host = pi;
        pi.registerTool({ ...late, name: 'own-loader' });
        pi.on('session_start', () => pi.setActiveTools(pi.getActiveTools().filter(name => name !== 'own-loader')));
    }] });
    const { session } = await sdk.createAgentSessionFromServices({ services: input, sessionManager: manager });
    t.after(() => session.dispose());
    await session.bindExtensions({}); host.registerTool(late);
    assert.ok(session.getActiveToolNames().includes(late.name));
    await session.reload(); host.registerTool(late);
    assert.ok(session.getActiveToolNames().includes(late.name));
    assert.ok(!session.getActiveToolNames().includes('own-loader'));
});

test('SDK empty extension bindings restart exactly once on reload and runtime diagnostics are consumed once', async t => {
    const sdk = await import('@earendil-works/pi-coding-agent');
    const { installRuntimeDiagnostics, PiRuntimeDiagnostics } = require('../server/pi-runtime-diagnostics');
    let starts = 0;
    const create = async ({ sessionManager, sessionStartEvent }) => {
        const input = await services({ extensionFactories: [pi => pi.on('session_start', () => { starts++; })] });
        const result = await sdk.createAgentSessionFromServices({ services: input, sessionManager, sessionStartEvent });
        return { ...result, services: input, diagnostics: [{ type: 'warning', message: 'Synthetic warning api_key=private-fixture-secret' }] };
    };
    const runtime = await sdk.createAgentSessionRuntime(create, { cwd: root, agentDir: process.env.PI_CODING_AGENT_DIR, sessionManager: sdk.SessionManager.inMemory(root) });
    t.after(() => runtime.dispose());
    const frames = [], output = [];
    installRuntimeDiagnostics(runtime, { token: 'private-token', emit: frame => frames.push(frame), write: line => output.push(line), env: {} });
    assert.equal(output.length, 1); assert.equal(frames.length, 1); assert.doesNotMatch(JSON.stringify(frames), /private-fixture-secret/);
    assert.deepEqual(runtime.takeUnreportedDiagnostics(), []);
    await runtime.session.bindExtensions({}); assert.equal(starts, 1);
    await runtime.session.reload(); assert.equal(starts, 2);
    runtime.setRebindSession(async () => { await runtime.session.bindExtensions({}); runtime.takeUnreportedDiagnostics(); });
    await runtime.newSession(); assert.equal(starts, 3); assert.equal(frames.length, 1);
    const published = [], worker = { navigationToken: 'private-token', noSession: true, _broadcast: event => published.push(event) };
    const view = new PiRuntimeDiagnostics(worker);
    assert.equal(view.handle({ ...frames[0], token: 'foreign', diagnostics: [{ type: 'error', message: 'foreign secret' }] }), true);
    assert.deepEqual(view.snapshot(), []);
    view.handle(frames[0]); view.handle(frames[0]); assert.equal(view.snapshot().length, 1);
    assert.doesNotMatch(JSON.stringify(published), /private-token|foreign secret|private-fixture-secret/);
    const snapshot = view.snapshot(); snapshot[0].message = 'changed'; assert.notEqual(view.snapshot()[0].message, 'changed');
});

test('native RPC forwards startup entries and runs start/discovery handlers once for a replacement', { timeout: 60000 }, async t => {
    const { PiRpcClient } = require('../server/pi-rpc-client');
    const extension = path.join(root, 'rpc-extension.ts'), counter = path.join(root, 'counts.jsonl');
    fs.writeFileSync(extension, `import fs from 'node:fs'; export default function(pi) {
        pi.on('session_start', e => { fs.appendFileSync(${JSON.stringify(counter)}, JSON.stringify({kind:'start',reason:e.reason})+'\\n'); pi.appendEntry('startup-fixture',{reason:e.reason}); });
        pi.on('resources_discover', () => { fs.appendFileSync(${JSON.stringify(counter)}, JSON.stringify({kind:'discover'})+'\\n'); });
    }`);
    const client = new PiRpcClient({ cwd: root, noSession: true, extraArgs: ['--no-extensions', '-e', extension, '--no-skills', '--no-prompt-templates', '--no-context-files', '--no-mcp'] });
    t.after(() => client.dispose());
    const events = []; client.on('event', event => events.push(event));
    await client.start();
    assert.equal(events.filter(event => event.type === 'entry_appended' && event.entry?.customType === 'startup-fixture').length, 1);
    await client.request('new_session');
    const counts = fs.readFileSync(counter, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(counts.filter(row => row.kind === 'start').length, 2);
    assert.equal(counts.filter(row => row.kind === 'discover').length, 2);
    assert.equal(events.filter(event => event.type === 'entry_appended' && event.entry?.customType === 'startup-fixture').length, 2);
});

test('Codex request keeps system instructions in the prefix and changes effort without rewriting the cache prefix', async () => {
    const { streamSimple } = await import('@earendil-works/pi-ai/api/openai-codex-responses');
    const { ModelRuntime } = await import('@earendil-works/pi-coding-agent');
    const runtime = await ModelRuntime.create({ allowModelNetwork: false });
    const model = runtime.getModel('openai-codex', 'gpt-6.2-sol');
    const token = 'synthetic.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic' } })).toString('base64url') + '.synthetic';
    const payloads = [];
    for (const reasoning of ['low', 'high']) {
        const result = await streamSimple(model, { messages: [{ role: 'system', content: 'Stable system prefix', timestamp: 1 }, { role: 'user', content: 'Synthetic request', timestamp: 2 }] },
            { apiKey: token, reasoning, maxTokens: 123, maxRetries: 0, onPayload: payload => { payloads.push(payload); throw new Error('Synthetic stop before network'); } }).result();
        assert.match(result.errorMessage, /Synthetic stop before network/);
    }
    for (const payload of payloads) {
        assert.equal(payload.instructions, undefined); assert.equal(payload.input[0].role, 'developer');
        assert.equal(payload.input[0].content, 'Stable system prefix'); assert.equal(payload.max_output_tokens, 123);
        assert.equal(payload.reasoning.effort, 'medium');
    }
    const updates = payloads.map(payload => payload.input.filter(item => item.type === 'configuration_update'));
    assert.notDeepEqual(updates[0], updates[1]); assert.deepEqual(payloads[0].input[0], payloads[1].input[0]);
});
