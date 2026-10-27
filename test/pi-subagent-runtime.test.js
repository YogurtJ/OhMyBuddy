const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { snapshotWidget, normalizeSnapshot, snapshotKey, privateWidget, backgroundWork, validateControl, controlResult } = require('../server/pi-subagent-runtime');
const { PiRuntimeControls } = require('../server/pi-runtime-controls');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-subagent-runtime-')));
process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent');
process.env.PI_PROJECT_ROOTS = root;
process.env.PI_OFFLINE = '1';
const cwd = path.join(root, 'project');
fs.mkdirSync(path.join(root, 'agent/extensions'), { recursive: true });
fs.mkdirSync(cwd, { recursive: true });
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const snapshot = (runs = [{ id: 'run-1', kind: 'workflow', label: 'Review auth', state: 'running', startedAt: 1700000000000,
    activity: { currentTool: 'read', turnCount: 2, toolCount: 5, secret: 'x' },
    children: [{ id: 'run-1:0', kind: 'step', label: 'reviewer', state: 'complete' }] }]) =>
    ({ kind: 'pi-subagents.async-status-snapshot', version: 1, generatedAt: 1700000001000, caps: {}, omitted: { runs: 3, children: 0, byteLimitExceeded: false }, runs });
const widget = value => ({ type: 'extension_ui_request', method: 'setWidget', widgetKey: 'subagent-async', widgetLines: ['PI_SUBAGENT_ASYNC_JSON:' + JSON.stringify(value)] });

test('status snapshots are parsed from the raw line, bounded and never shown as generic widgets', () => {
    const normalized = snapshotWidget(widget(snapshot())).snapshot;
    assert.equal(normalized.runs[0].label, 'Review auth');
    assert.deepEqual(normalized.runs[0].activity, { currentTool: 'read', turnCount: 2, toolCount: 5 });
    assert.equal(normalized.runs[0].children[0].state, 'complete');
    assert.equal(normalized.omitted.runs, 3);
    // Larger than the 16000-character generic widget display limit.
    const long = snapshot(Array.from({ length: 20 }, (_, index) => ({ id: `run-${index}`, kind: 'subagent', label: 'x'.repeat(900), state: 'queued' })));
    assert.ok(widget(long).widgetLines[0].length > 16000);
    const parsed = snapshotWidget(widget(long)).snapshot;
    assert.equal(parsed.runs.length, 20);
    assert.equal(parsed.runs[0].label.length, 200);
    assert.deepEqual(snapshotWidget({ widgetKey: 'subagent-async', widgetLines: null }), { snapshot: null });
    assert.deepEqual(snapshotWidget({ widgetKey: 'subagent-inspect', widgetLines: ['PI_SUBAGENT_INSPECT:{}'] }), { ignore: true });
    assert.deepEqual(snapshotWidget({ widgetKey: 'subagent-async', widgetLines: ['PI_SUBAGENT_ASYNC_JSON:{broken'] }), { ignore: true });
    assert.equal(snapshotWidget({ widgetKey: 'subagent-async', widgetLines: ['A TUI line'] }), undefined, 'older text widgets stay generic');
    assert.equal(snapshotWidget({ widgetKey: 'other', widgetLines: ['x'] }), undefined);
    assert.equal(normalizeSnapshot({ ...snapshot(), kind: 'foreign' }), null);
    const hostile = normalizeSnapshot(snapshot([{ id: 'a', kind: 'subagent', label: 'ok', state: 'hacked' }, { id: 'b', kind: 'unknown', label: 'x', state: 'running' }, { id: 'c', kind: 'subagent', label: 'fine\u0007', state: 'failed', startedAt: -1 }]));
    assert.deepEqual(hostile.runs, [{ id: 'c', kind: 'subagent', label: 'fine', state: 'failed' }]);

    const controls = new PiRuntimeControls();
    assert.equal(controls.handle(widget(snapshot())), true);
    assert.equal(controls.snapshot().subagents.snapshot.runs.length, 1);
    assert.deepEqual(controls.snapshot().extension.widgets, [], 'raw JSON is not an extension widget');
    assert.equal(controls.handle({ type: 'extension_ui_request', method: 'setWidget', widgetKey: 'subagent-inspect', widgetLines: ['x'] }), false);
    assert.equal(controls.handle({ type: 'extension_ui_request', method: 'setWidget', widgetKey: 'subagent-async', widgetLines: null }), true);
    assert.equal(controls.snapshot().subagents.snapshot, null);
    controls.handle({ type: 'extension_ui_request', method: 'setWidget', widgetKey: 'plain', widgetLines: ['hello'] });
    assert.equal(controls.snapshot().extension.widgets[0][1].lines, 'hello');
    assert.equal(controls.setBackgroundWork({ supported: true, active: true, sources: ['pi-subagents'] }), true);
    assert.equal(controls.setBackgroundWork({ supported: true, active: true, sources: ['pi-subagents'] }), false, 'unchanged state is not rebroadcast');
});

test('step identity, activity and host monitor facts survive; only a content change is rebroadcast', () => {
    const rich = snapshot([{ id: 'wf', kind: 'workflow', label: 'worker, worker', state: 'running', startedAt: 1700000000000,
        children: [
            { id: 'lane-a', kind: 'step', label: 'Validate Linux', state: 'running', agent: 'worker', model: 'bit-gpt/gpt-6.1-sol', thinking: 'xhigh',
                activity: { state: 'needs_attention', currentTool: 'bash', currentToolStartedAt: 1700000000500, lastActivityAt: 1700000000400 } },
            { id: 'lane-b', kind: 'step', label: 'Validate macOS', state: 'complete', agent: 'worker', thinking: 'ultra', activity: { state: 'made-up' } },
            { id: 'gate', kind: 'host-step', label: 'CI', state: 'failed', hostStep: { kind: 'ci', state: 'done', verdict: 'fail', detail: 'lint failed', stale: true,
                report: 'report.md', target: 'main', provider: 'gh', reasonCode: 'x' } }
        ] }]);
    const [linux, mac, gate] = normalizeSnapshot(rich).runs[0].children;
    assert.deepEqual([linux.agent, linux.model, linux.thinking], ['worker', 'bit-gpt/gpt-6.1-sol', 'xhigh']);
    assert.deepEqual(linux.activity, { state: 'needs_attention', currentTool: 'bash', currentToolStartedAt: 1700000000500, lastActivityAt: 1700000000400 });
    assert.equal(mac.thinking, undefined, 'unknown thinking levels are dropped');
    assert.equal(mac.activity, undefined, 'unknown activity states are dropped');
    assert.deepEqual(gate.hostStep, { kind: 'ci', state: 'done', verdict: 'fail', detail: 'lint failed', stale: true }, 'report paths and other host fields stay private');

    const controls = new PiRuntimeControls();
    assert.equal(controls.handle(widget(rich)), true);
    const revision = controls.revision;
    assert.equal(controls.handle(widget({ ...rich, generatedAt: rich.generatedAt + 1000 })), false, 'a heartbeat with a new generatedAt only is not a change');
    assert.equal(controls.revision, revision);
    const changed = structuredClone(rich); changed.runs[0].children[0].activity.currentTool = 'read';
    assert.equal(controls.handle(widget(changed)), true);
    assert.equal(snapshotKey(null), 'null');
    assert.equal(controls.handle({ type: 'extension_ui_request', method: 'setWidget', widgetKey: 'subagent-async', widgetLines: null }), true);
    assert.equal(controls.handle({ type: 'extension_ui_request', method: 'setWidget', widgetKey: 'subagent-async', widgetLines: null }), false, 'repeated clears are not rebroadcast');

    assert.equal(privateWidget(widget(rich)), true);
    assert.equal(privateWidget({ type: 'extension_ui_request', method: 'setWidget', widgetKey: 'subagent-async', widgetLines: null }), true);
    assert.equal(privateWidget({ type: 'extension_ui_request', method: 'setWidget', widgetKey: 'subagent-inspect', widgetLines: ['PI_SUBAGENT_INSPECT_JSON:{}'] }), true);
    assert.equal(privateWidget({ type: 'extension_ui_request', method: 'setWidget', widgetKey: 'subagent-async', widgetLines: ['A TUI line'] }), false, 'older text widgets still reach the generic widget view');
    assert.equal(privateWidget({ type: 'extension_ui_request', method: 'setWidget', widgetKey: 'other', widgetLines: ['x'] }), false);
    assert.equal(privateWidget({ type: 'extension_ui_request', method: 'notify', widgetKey: 'subagent-async' }), false);
});

test('steer and resume results carry the plugin receipt, not an assumed delivery', () => {
    assert.deepEqual(controlResult('steer', { text: 'Steering queued', delivery: 'queued', state: 'pending' }), { text: 'Steering queued', state: 'pending', delivery: 'queued' });
    assert.equal(controlResult('steer', { text: 'ok', delivery: 'teleported' }).delivery, undefined);
    assert.equal(controlResult('steer', { text: 'ok' }).delivery, undefined, 'missing receipts stay unknown');
    assert.equal(controlResult('resume', { text: 'Resumed', runId: 'run-2' }).runId, 'run-2');
    assert.equal(controlResult('resume', { text: 'Resumed', runId: '../x' }).runId, undefined);
    assert.equal(controlResult('stop', { text: 'x', runId: 'run-2', delivery: 'delivered' }).runId, undefined);
    assert.equal(controlResult('stop', { text: 'x', delivery: 'delivered' }).delivery, undefined);
});

test('control requests are allow-listed and results keep private fields out', () => {
    assert.throws(() => validateControl({ method: 'spawn', params: {} }), /不支持/);
    assert.throws(() => validateControl({ method: 'manage', params: {} }), /不支持/);
    assert.throws(() => validateControl({ method: 'stop', params: {} }), /有效/);
    assert.throws(() => validateControl({ method: 'stop', params: { id: '../x' } }), /有效/);
    assert.throws(() => validateControl({ method: 'stop', params: { id: 'run-1', dir: '/tmp' } }), /不支持的参数/);
    assert.throws(() => validateControl({ method: 'steer', params: { id: 'run-1', message: ' ' } }), /说明/);
    assert.throws(() => validateControl({ method: 'steer', params: { id: 'run-1', message: 'x', mode: 'auto' } }), /引导方式/);
    assert.throws(() => validateControl({ method: 'status', params: { view: 'transcript' } }), /指定运行/);
    assert.throws(() => validateControl({ method: 'status', params: { id: 'run-1', view: 'fleet' } }), /查看方式/);
    assert.deepEqual(validateControl({ method: 'status', params: {} }), { method: 'status', params: {} });
    assert.deepEqual(validateControl({ method: 'cost' }), { method: 'cost', params: undefined });
    assert.deepEqual(validateControl({ method: 'resume', params: { id: 'run-1', index: 0, message: 'go' } }).params, { id: 'run-1', index: 0, message: 'go' });
    const cost = controlResult('cost', { cost: { total: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cost: 0.5, turns: 2, extra: 'x' },
        childTotal: { input: 4, output: 1, cost: 0.1 }, parent: null, unresolvedAsyncChildren: 1,
        children: [{ label: 'reviewer: check', agent: 'reviewer', usage: { input: 4, output: 1, cost: 0.1 }, sessionFile: '/private/path' }] } });
    assert.deepEqual(cost.cost.total, { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, turns: 2, cost: 0.5 });
    assert.equal(JSON.stringify(cost).includes('/private/path'), false);
    assert.equal(controlResult('status', { text: 'ok', asyncSnapshot: snapshot(), details: { asyncDir: '/private' } }).snapshot.runs[0].id, 'run-1');
    assert.equal(JSON.stringify(controlResult('status', { text: 'ok', details: { asyncDir: '/private' } })).includes('/private'), false);
    assert.equal(backgroundWork({ version: 1, sessionId: 'other', active: true }, 'mine'), null);
    assert.deepEqual(backgroundWork({ version: 1, sessionId: 'mine', supported: true, active: true, sources: ['pi-subagents', 5] }, 'mine'), { supported: true, active: true, sources: ['pi-subagents'] });
});

test('managed worker hosts the liveness registry, retains background work and relays controls privately', { timeout: 120000 }, async () => {
    const flag = path.join(root, 'active.flag');
    const requests = path.join(root, 'requests.jsonl');
    fs.writeFileSync(path.join(root, 'agent/settings.json'), JSON.stringify({ enableInstallTelemetry: false, defaultProjectTrust: 'never', pivaneBuiltins: { subagents: { extensions: [] } } }));
    // Emulates the pi-subagents host protocol: session liveness provider, RPC event bus and snapshot widget.
    fs.writeFileSync(path.join(root, 'agent/extensions/fixture-subagents.ts'), `import fs from 'node:fs';
    export default function (pi) {
        pi.on('session_start', (_event, ctx) => {
            const registry = globalThis[Symbol.for('@agegr/pi-web/session-liveness/v1')];
            if (!registry || registry.version !== 1) throw new Error('registry missing');
            registry.register({ name: 'pi-subagents', sessionId: ctx.sessionManager.getSessionId(), sessionFile: ctx.sessionManager.getSessionFile(), isActive: () => fs.existsSync(${JSON.stringify(flag)}) });
            ctx.ui.setWidget('subagent-async', ['PI_SUBAGENT_ASYNC_JSON:' + JSON.stringify(${JSON.stringify(snapshot())})]);
        });
        pi.events.on('subagents:rpc:v1:request', request => {
            fs.appendFileSync(${JSON.stringify(requests)}, JSON.stringify(request) + '\\n');
            const reply = data => pi.events.emit('subagents:rpc:v1:reply:' + request.requestId, { version: 1, requestId: request.requestId, method: request.method, success: true, data });
            if (request.method === 'ping') return reply({ version: 1, capabilities: { cost: { version: 1 } } });
            if (request.method === 'status') return reply({ text: 'log line', details: { asyncDir: '/private/async' }, asyncSnapshot: ${JSON.stringify(snapshot())} });
            if (request.method === 'steer') return reply({ text: 'Steering queued', details: { mode: 'management', results: [], steering: { requestId: 'r', state: 'pending', deliveryStatus: 'queued', sourceRunId: 'run-1', targets: [] } } });
            if (request.method === 'resume') return reply({ text: 'Resumed', details: { mode: 'single', results: [], asyncId: 'run-2', asyncDir: '/private/async/run-2' } });
            if (request.method === 'cost') return reply({ version: 1, parent: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1 }, children: [], childTotal: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 }, total: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1 }, unresolvedAsyncChildren: 0 });
            pi.events.emit('subagents:rpc:v1:reply:' + request.requestId, { version: 1, requestId: request.requestId, success: false, error: { code: 'invalid_state', message: 'Async run run-1 is complete; stop only supports running async runs.' } });
        });
    }`);
    const { PiSessionStore } = require('../server/pi-session-store');
    const { PiAgentSupervisor } = require('../server/pi-agent-supervisor');
    const store = new PiSessionStore(), supervisor = new PiAgentSupervisor({ idleMs: 60000 });
    const source = await store.createSession(cwd, 'Subagent fixture');
    try {
        const worker = await supervisor.getWorker({ cwd, sessionPath: source.path, sessionId: source.id });
        const events = []; const unsubscribe = worker.subscribe(event => events.push(event));
        const waitFor = async predicate => { for (let i = 0; i < 100 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 100)); assert.ok(predicate()); };
        await waitFor(() => worker.controls.subagents.background?.supported === true && worker.controls.subagents.snapshot);
        assert.equal(worker.controls.subagents.background.active, false);
        assert.equal(worker.controls.snapshot().subagents.snapshot.runs[0].id, 'run-1');
        assert.equal(worker.retainsBackgroundWork(), false);

        fs.writeFileSync(flag, '');
        await waitFor(() => worker.retainsBackgroundWork());
        assert.deepEqual(worker.controls.subagents.background.sources, ['pi-subagents']);
        assert.ok(events.some(event => event.type === 'gateway_controls' && event.controls.subagents.background?.active));
        assert.equal(events.some(event => event.type === 'extension_ui_request' && /pivaneBackgroundWork|pivaneSubagents/.test(event.message || '')), false, 'bridge replies stay private');
        unsubscribe(); worker.lastUsedAt = 0;
        assert.equal(worker.isIdle(), true, 'turn-level idle is unchanged for task receipts');
        assert.equal(worker.canEvict(Date.now(), 1), false, 'background work keeps the unwatched worker');
        assert.equal(supervisor.isIdle(), false, 'maintenance waits for background work');
        assert.equal(supervisor.getActivity()[0].backgroundWork, true);
        await supervisor._sweep();
        assert.equal(supervisor.workers.has(source.path), true);

        const status = await worker.subagentRequest({ method: 'status', params: {} });
        assert.equal(status.text, 'log line');
        assert.equal(status.snapshot.runs[0].label, 'Review auth');
        assert.equal(JSON.stringify(status).includes('/private/async'), false);
        const cost = await worker.subagentRequest({ method: 'cost' });
        assert.deepEqual(cost.cost.total, { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, turns: 1, cost: 0 });
        const steer = await worker.subagentRequest({ method: 'steer', params: { id: 'run-1', message: 'focus', mode: 'steer' } });
        assert.deepEqual([steer.delivery, steer.state], ['queued', 'pending']);
        const resume = await worker.subagentRequest({ method: 'resume', params: { id: 'run-1', message: 'go on' } });
        assert.equal(resume.runId, 'run-2');
        assert.equal(JSON.stringify(resume).includes('/private'), false);
        await assert.rejects(worker.subagentRequest({ method: 'stop', params: { id: 'run-1' } }), /stop only supports running/);
        await assert.rejects(worker.subagentRequest({ method: 'spawn', params: { agent: 'worker' } }), /不支持/);
        const relayed = fs.readFileSync(requests, 'utf8').trim().split('\n').map(line => JSON.parse(line));
        assert.deepEqual(relayed.filter(item => item.method !== 'ping').map(item => [item.method, item.params]),
            [['status', {}], ['cost', undefined], ['steer', { id: 'run-1', message: 'focus', mode: 'steer' }], ['resume', { id: 'run-1', message: 'go on' }], ['stop', { id: 'run-1' }]]);
        assert.equal(events.some(event => event.type === 'extension_ui_request' && event.widgetKey === 'subagent-async'), false, 'raw snapshot lines are not relayed to browsers');
        assert.equal(worker.subagentResults.size, 0);

        fs.rmSync(flag);
        await waitFor(() => !worker.retainsBackgroundWork());
        assert.equal(worker.canEvict(Date.now(), 1), true);
        assert.equal(supervisor.isIdle(), true);
    } finally { await supervisor.dispose(); }
});
