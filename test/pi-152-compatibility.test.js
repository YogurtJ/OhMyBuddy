'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-pi152-')));
process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent');
process.env.PI_OFFLINE = '1'; process.env.PI_TELEMETRY = '0';
fs.mkdirSync(process.env.PI_CODING_AGENT_DIR);
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const cache = require('../server/pi-cache-warming');

test('managed cache policy keeps streaming by default and applies only explicit global choices', async () => {
    const { SettingsManager } = await import('@earendil-works/pi-coding-agent');
    const settings = SettingsManager.inMemory({ enableInstallTelemetry: false });
    const before = settings.getGlobalSettings();
    const view = cache.cacheWarmingSettings(settings);
    const resources = require('../server/pi-bundled-resources').settingsView(settings, root, process.env.PI_CODING_AGENT_DIR);
    assert.equal(view.getCacheWarmingMode(), 'streaming');
    assert.equal(resources.getCacheWarmingMode(), 'streaming');
    assert.deepEqual(settings.getGlobalSettings(), before, 'reading a policy never materializes settings');
    settings.setCacheWarmingMode('idle'); assert.equal(view.getCacheWarmingMode(), 'idle');
    settings.setCacheWarmingMode('off'); assert.equal(view.getCacheWarmingMode(), 'off');
    assert.equal(cache.cacheWarmingMode({ getGlobalSettings: () => ({}), getProjectSettings: () => ({ cacheWarming: 'idle' }) }), 'streaming');
    const manager = {}, session = { sessionManager: manager, settingsManager: settings, cacheWarmingStatus: { state: 'scheduled', nextWarmAt: 1234, privatePayload: 'not exposed' } };
    cache.bindCacheWarmingSession(session);
    assert.deepEqual(cache.cacheWarmingSnapshot(manager), { mode: 'off', state: 'scheduled', nextWarmAt: 1234 });
    assert.equal(cache.cacheWarmingSnapshot({}), null);
});

test('native idle warming is cancellable without adding late usage and never continues a provider thread', async t => {
    const { CacheWarmer } = await import('../node_modules/@earendil-works/pi-coding-agent/dist/core/cache-warmer.js');
    const model = { provider: 'fixture', id: 'cache', api: 'openai-completions', promptCache: { short: 300 },
        cost: { input: 100, output: 1, cacheRead: 0.1, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 1024 };
    const usage = { input: 100000, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 100001,
        cost: { input: 10, output: 0.000001, cacheRead: 0, cacheWrite: 0, total: 10.000001 } };
    const calls = [], saved = []; let finish, mode = 'streaming';
    const warmer = new CacheWarmer({ streamSimple: (_model, _context, options) => {
        calls.push(options); return { result: () => new Promise(resolve => { finish = resolve; }) };
    } }, { getBranch: () => [{ type: 'message', message: { role: 'assistant', usage } }],
        appendUsage: (...args) => { saved.push(args); return {}; } }, () => mode);
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1800000000000 });
    t.after(() => warmer.cancel());
    const start = () => warmer.start({ model, context: { messages: [] }, options: { sessionId: 'fixture-session', cacheRetention: 'short' } }, () => true);
    start(); warmer.onAgentSettled();
    t.mock.timers.tick(270000); await new Promise(setImmediate); assert.equal(calls.length, 0);
    mode = 'idle'; start(); warmer.onAgentSettled();
    t.mock.timers.tick(270000); await new Promise(setImmediate); assert.equal(calls.length, 1);
    assert.equal(calls[0].disableContinuation, true); assert.equal(calls[0].maxTokens, 1); assert.equal(calls[0].maxRetries, 0);
    warmer.cancel(); assert.equal(calls[0].signal.aborted, true);
    finish({ provider: 'fixture', model: 'cache', usage, stopReason: 'stop' });
    await new Promise(setImmediate); assert.equal(saved.length, 0, 'cancelled work cannot write late usage');
    start(); warmer.onAgentSettled(); t.mock.timers.tick(270000); await new Promise(setImmediate);
    finish({ provider: 'fixture', model: 'cache', usage, stopReason: 'stop' }); await new Promise(setImmediate);
    assert.equal(saved.length, 1); assert.equal(saved[0][0], 'cache_warm');
});

test('Pi 1.5.2 public MCP naming preserves namespace and collision identities', async () => {
    const helpers = await import('@earendil-works/pi-mcp');
    const native = await import('../server/pi-native-mcp.mjs');
    assert.equal(native.nativeMcpNamespace, helpers.mcpNamespace);
    assert.equal(native.nativeMcpToolName, helpers.createMcpToolName);
    assert.equal(helpers.mcpNamespace('dev-radius'), 'mcp__dev_radius');
    assert.equal(helpers.createMcpToolName('fixture', 'a.b'), 'mcp__fixture__a_b');
    const collision = helpers.createMcpToolName('fixture', 'a.b', () => true);
    assert.match(collision, /^mcp__fixture__a_b_[a-f0-9]{8}$/);
    assert.ok(helpers.createMcpToolName('fixture', 'x'.repeat(100)).length <= 64);
});

test('new provider compatibility controls retain the native field types', async () => {
    const { compatSchema, validateMap } = require('../server/pi-model-advanced');
    const openai = await compatSchema('openai-completions'), anthropic = await compatSchema('anthropic-messages');
    for (const key of ['requiresToolsWithToolHistory', 'requiresNonNullAssistantContent']) assert.equal(openai[key].type, 'boolean');
    assert.deepEqual(openai.promptCacheKeyMode.choices, ['auto', 'enabled', 'disabled']);
    assert.equal(anthropic.supportsMessageThreads.type, 'boolean');
    validateMap({ requiresToolsWithToolHistory: true, promptCacheKeyMode: 'disabled' }, openai, 'compat');
    assert.throws(() => validateMap({ promptCacheKeyMode: 'guess' }, openai, 'compat'), /值无效/);
});

test('native schema coercion exposes the same BigInt/Undefined arguments to permission checks and execution', async () => {
    const { Type } = await import('typebox');
    const { compile } = await import('@earendil-works/pi-schema');
    const { runToolCall } = await import('@earendil-works/pi-agent-core');
    const seen = [], call = { type: 'toolCall', id: 'synthetic', name: 'fixture', arguments: { value: '42', empty: null } };
    const before = structuredClone(call);
    const tool = { name: 'fixture', label: 'Fixture', description: 'Synthetic', parameters: Type.Object({ value: Type.BigInt(), empty: Type.Undefined() }),
        execute: async (_id, args) => { seen.push(args); return { content: [{ type: 'text', text: String(args.value) }] }; } };
    const result = await runToolCall(call, { tools: [tool], assistantMessage: { role: 'assistant', content: [call] },
        context: { messages: [], tools: [tool] }, beforeToolCall: async context => { seen.push(context.args); } });
    assert.equal(result.isError, false); assert.equal(seen.length, 2);
    assert.deepEqual(seen[0], { value: 42n, empty: undefined }); assert.deepEqual(seen[1], seen[0]);
    assert.deepEqual(call, before);
    for (const value of [NaN, Infinity, -Infinity]) assert.equal(compile({ type: 'number' }).check(value), false);
});
