const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-runtime-notices-')));
process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent'); process.env.PI_PROJECT_ROOTS = root;
process.env.PI_OFFLINE = '1'; process.env.PI_TELEMETRY = '0';
fs.mkdirSync(path.join(process.env.PI_CODING_AGENT_DIR, 'extensions'), { recursive: true });
fs.writeFileSync(path.join(process.env.PI_CODING_AGENT_DIR, 'settings.json'), JSON.stringify({ enableInstallTelemetry: false, enabledModels: ['fixture/does-not-exist'] }));
fs.writeFileSync(path.join(process.env.PI_CODING_AGENT_DIR, 'extensions/broken.ts'), "throw new Error('Synthetic load failure api_key=fixture-private-key');");
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('managed startup diagnostics survive a late subscription and private frames never reach clients', { timeout: 60000 }, async t => {
    const { PiSessionStore } = require('../server/pi-session-store');
    const { PiAgentSupervisor } = require('../server/pi-agent-supervisor');
    const store = new PiSessionStore(), supervisor = new PiAgentSupervisor();
    t.after(() => supervisor.dispose());
    const saved = await store.createSession(root, 'Synthetic diagnostic session');
    const worker = await supervisor.getWorker({ cwd: root, sessionPath: saved.path, sessionId: saved.id });
    const state = await worker.request('get_state');
    assert.ok(state.webDiagnostics.some(row => row.message.includes('Synthetic load failure')));
    assert.ok(state.webDiagnostics.some(row => row.message.includes('does-not-exist')));
    assert.doesNotMatch(JSON.stringify(state.webDiagnostics), /fixture-private-key/);
    assert.deepEqual((await worker.request('get_messages')).webSnapshot.webDiagnostics, state.webDiagnostics);
    const events = []; const off = worker.subscribe(event => events.push(event)); t.after(off);
    for (const value of [{ token: 'unknown', sessionId: saved.id }, { token: worker.navigationToken, sessionId: '00000000-0000-0000-0000-000000000000' }]) {
        worker._handleEvent({ type: 'ohmybuddy_runtime_diagnostics', ...value, diagnostics: [{ type: 'error', message: 'PRIVATE_FRAME_SENTINEL' }] });
    }
    assert.doesNotMatch(JSON.stringify(events), /PRIVATE_FRAME_SENTINEL|ohmybuddy_runtime_diagnostics/);
    worker._handleEvent({ type: 'ohmybuddy_runtime_diagnostics', token: worker.navigationToken, sessionId: saved.id,
        diagnostics: [{ type: 'warning', message: 'A later diagnostic' }, ...Array.from({ length: 70 }, (_, i) => ({ type: 'warning', message: `${i}:` + '中'.repeat(4000) }))] });
    const next = await worker.request('get_state');
    assert.ok(next.webDiagnostics.length <= 50); assert.ok(Buffer.byteLength(JSON.stringify(next.webDiagnostics)) <= 32 * 1024);
    assert.ok(events.some(event => event.type === 'gateway_runtime_diagnostics'));
    assert.doesNotMatch(JSON.stringify(events), new RegExp(worker.navigationToken));
    assert.ok(!(await worker.request('get_entries')).entries.some(entry => JSON.stringify(entry).includes('Synthetic load failure')), 'runtime notices do not become conversation history');
});
