const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../server/pi-cron-policy');
const { registerCron, usageSince } = require('../server/pi-cron-runtime');
function fixture(t, overrides = {}) {
    const hooks = new Map(), entries = [], sent = [], tools = ['read']; let aborted = 0;
    const manager = { getSessionId: () => 'synthetic-session', getSessionFile: () => '/synthetic/session.jsonl', getEntries: () => entries, getBranch: () => entries };
    const ctx = { mode: 'rpc', sessionManager: manager, model: { provider: 'fixture', id: 'model' }, cwd: '/synthetic',
        modelRegistry: { find: () => ctx.model }, isIdle: () => true, hasPendingMessages: () => false,
        abort: () => { aborted++; }, ui: { notify() {} } };
    const pi = { on: (event, callback) => hooks.set(event, callback), appendEntry: (customType, data) => entries.push({ type: 'custom', customType, data }),
        registerTool() {}, getActiveTools: () => tools, setActiveTools() {}, getThinkingLevel: () => 'off', setThinkingLevel() {}, setModel: async () => true,
        sendMessage: message => { sent.push(message); entries.push({ type: 'custom_message', customType: message.customType, details: message.details }); } };
    const execute = registerCron(pi), emit = (name, event = {}) => hooks.get(name)?.(event, ctx);
    const original = process.env.PI_WEB_NAVIGATION_TOKEN; process.env.PI_WEB_NAVIGATION_TOKEN = 'synthetic'; emit('session_start');
    if (original === undefined) delete process.env.PI_WEB_NAVIGATION_TOKEN; else process.env.PI_WEB_NAVIGATION_TOKEN = original;
    t.after(() => emit('session_shutdown'));
    const input = { action: 'start', runId: 'a'.repeat(64), sessionId: manager.getSessionId(), jobId: 'synthetic-job', name: 'Long-context work', prompt: 'Do the work',
        mode: 'work', scheduledAt: Date.now(), timeZone: 'UTC', ...policy.executionDefaults('work'), ...overrides };
    const message = (usage = {}, stopReason = 'toolUse') => entries.push({ type: 'message', id: `reply-${entries.length}`, message: { role: 'assistant', stopReason,
        usage: { input: 200000, output: 100, cacheRead: 0, cacheWrite: 0, cost: { total: 0.01 }, ...usage } } });
    return { execute, emit, input, entries, sent, manager, message, ctx, aborted: () => aborted };
}
test('new policy meters long context across many calls and keeps optional limits null', async t => {
    assert.deepEqual(policy.limits(), { maxRunsPerDay: null, maxTokensPerDay: null, maxCostPerDay: null });
    const f = fixture(t); await f.execute(f.ctx, f.input);
    for (let i = 0; i < 250; i++) { f.emit('turn_start'); f.emit('before_provider_request'); f.message(); }
    assert.equal(f.aborted(), 0);
    assert.equal(usageSince(f.manager, f.entries.find(e => e.data?.status === 'prepared').data).usage.tokens, 50025000);
    f.emit('agent_settled');
});
test('explicit token and call limits stop at boundaries with distinct reasons and one native receipt', async t => {
    for (const [overrides, reason] of [[{ maxTokens: 180000 }, 'token-limit'], [{ maxCalls: 1 }, 'call-limit'], [{ maxCost: 0.005 }, 'cost-limit']]) {
        const f = fixture(t, overrides), ctx = f.ctx;
        await f.execute(ctx, f.input); f.emit('before_provider_request'); f.message(); f.emit('turn_start');
        assert.equal(f.aborted(), 1); f.emit('agent_before_settle', { outcome: 'aborted' }); f.emit('agent_settled');
        const result = await f.execute(ctx, { action: 'finish', runId: f.input.runId });
        assert.equal(result.status, 'stopped'); assert.equal(result.reason, reason); assert.equal(result.feedback.code, reason);
        await f.execute(ctx, { action: 'finish', runId: f.input.runId });
        assert.equal(f.sent.filter(m => m.customType === 'pivane-cron-result').length, 1);
    }
});
test('known zero-cost aborted placeholders preserve priced cache usage', async t => {
    const f = fixture(t), ctx = f.ctx; await f.execute(ctx, f.input); f.emit('before_provider_request');
    f.message({ input: 256, output: 286, cacheRead: 127488, cost: { total: 0.0161208 } });
    f.message({ input: 0, output: 0, cacheRead: 0, cost: { total: 0 } }, 'aborted');
    const state = f.entries.find(e => e.data?.status === 'prepared').data;
    const usage = usageSince(f.manager, { ...state, requests: 1 }).usage;
    assert.equal(usage.tokens, 128030); assert.equal(usage.cacheRead, 127488); assert.equal(usage.cost, 0.0161208);
    f.emit('agent_settled');
});
test('repeated identical tool errors stop while changed errors and successful tools reset the streak', async t => {
    const f = fixture(t, { maxRepeatedErrors: 2 }), ctx = f.ctx; await f.execute(ctx, f.input);
    const error = { toolName: 'read', input: { path: '/missing' }, content: [{ type: 'text', text: 'ENOENT' }], isError: true };
    f.emit('tool_result', error); f.emit('tool_result', { ...error, isError: false }); f.emit('tool_result', error);
    assert.equal(f.aborted(), 0); f.emit('tool_result', error); assert.equal(f.aborted(), 1);
    assert.equal(f.entries.at(-1).data.reason, 'repeated-errors'); f.emit('agent_settled');
});
test('inactivity excludes running tools and resets with streaming progress', async t => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: 100000 });
    const f = fixture(t, { maxIdleSeconds: 30 }), ctx = f.ctx; await f.execute(ctx, f.input);
    f.emit('tool_execution_start', { toolCallId: 'long-tool' }); t.mock.timers.tick(60000); assert.equal(f.aborted(), 0);
    f.emit('tool_execution_end', { toolCallId: 'long-tool' }); t.mock.timers.tick(29000); f.emit('message_update'); t.mock.timers.tick(29000); assert.equal(f.aborted(), 0);
    t.mock.timers.tick(2000); assert.equal(f.aborted(), 1); assert.equal(f.entries.at(-1).data.reason, 'idle-limit'); f.emit('agent_settled');
});
test('validation preserves explicit limits, separates old defaults and permits larger work policies', () => {
    const old = policy.execution({ maxCalls: 4, maxTokens: 32000, maxDurationSeconds: 300 }, 'work', 1);
    assert.equal(old.maxTokens, 32000); assert.equal(old.maxIdleSeconds, null);
    assert.equal(policy.execution({}, 'work').maxCalls, null);
    assert.equal(policy.execution({}, 'text').maxCalls, null);
    assert.equal(policy.execution({}, 'text').maxDurationSeconds, 21600);
    assert.equal(policy.execution({}, 'work', 2).maxCalls, 100);
    assert.equal(policy.execution({}, 'text', 2).maxCalls, 8);
    assert.throws(() => policy.execution({ maxCalls: 0 }, 'work'), /execution limits/);
    assert.equal(policy.execution({ maxTokens: null }, 'work').maxTokens, null);
    assert.throws(() => policy.execution({ maxTokens: 0 }, 'work'), /execution limits/);
    assert.throws(() => policy.limits({ maxCostPerDay: -1 }), /daily budget/);
    assert.throws(() => policy.settings({ maxConcurrent: 11 }), /concurrency/);
});
