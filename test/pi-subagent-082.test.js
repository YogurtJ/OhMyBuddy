const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-subagents-082-')));
process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent');
process.env.PI_SUBAGENTS_TEMP_ROOT = path.join(root, 'temporary');
process.env.PI_OFFLINE = '1';
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('Rex local placement fails explicitly outside a Rex session', async () => {
    const { resolveRexLocalPlacement } = await import('../vendor/pi-subagents/src/runs/shared/rex-machine.js');
    assert.throws(() => resolveRexLocalPlacement({ cwd: root, env: {} }), process.platform === 'win32' ? /not supported on Windows/ : /not running inside Rex/);
});

test('a prior boot cannot keep dead background work alive through a reused pid', async () => {
    const { checkRecordedPidLiveness, reconcileAsyncRun } = await import('../vendor/pi-subagents/src/runs/background/stale-run-reconciler.js');
    const { hasLiveSubagentWork } = await import('../vendor/pi-subagents/src/integrations/pi-web-session-liveness.js');
    let probes = 0;
    assert.equal(checkRecordedPidLiveness({ pid: process.pid, bootId: 'previous-boot' }, {
        observedScope: undefined, observedBootId: 'current-boot', probe: () => { probes++; return 'alive'; },
    }), 'dead');
    assert.equal(probes, 0, 'a reused pid is not probed under the wrong boot');
    const dir = path.join(root, 'async', 'old-boot'); fs.mkdirSync(dir, { recursive: true });
    const now = Date.now();
    fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ runId: 'old-boot', sessionId: 'fixture', mode: 'single',
        state: 'running', pid: process.pid, bootId: 'previous-boot', startedAt: now - 1000, lastUpdate: now - 1000,
        steps: [{ agent: 'fixture', task: 'Synthetic task', status: 'running' }] }));
    const repaired = reconcileAsyncRun(dir, { resultsDir: path.join(root, 'results'), now: () => now,
        bootId: () => 'current-boot', pidNamespaceScope: () => undefined, kill: () => { throw new Error('must not probe a reused pid'); } });
    assert.equal(repaired.repaired, true);
    assert.equal(repaired.status.state, 'failed');
    const state = { asyncJobs: new Map([['old-boot', { status: repaired.status.state }]]), foregroundControls: new Map() };
    assert.equal(hasLiveSubagentWork(state), false, 'reconciled terminal jobs release host retention');
    assert.equal(checkRecordedPidLiveness({ pid: 123, pidNamespaceScope: 'foreign', bootId: 'previous-boot' }, {
        observedScope: 'local', observedBootId: 'current-boot', probe: () => 'dead',
    }), 'unknown', 'different namespaces cannot establish local ownership');
});
