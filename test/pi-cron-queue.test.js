const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-cron-queue-'));
process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent'); fs.mkdirSync(process.env.PI_CODING_AGENT_DIR);
const { CronService, validateJob } = require('../server/pi-cron-service');
const { CronStore } = require('../server/pi-cron-store');
const job = (extra = {}) => ({ id: randomUUID(), revision: 1, name: 'Greeting', prompt: 'Say hello', enabled: true, mode: 'text',
    target: { kind: 'thread', cwd: root, sessionId: randomUUID() }, schedule: { kind: 'cron', expression: '* * * * *', timeZone: 'UTC' },
    misfire: { policy: 'skip', graceMinutes: 30 }, execution: { maxCalls: 2, maxTokens: 10000, maxDurationSeconds: 60 },
    budget: { maxRunsPerDay: 8, maxTokensPerDay: 200000, maxCostPerDay: null }, ...extra });
function fixture(filename, clock) {
    const calls = []; let idle = false;
    const worker = { disposed: false, exclusive: async callback => {
        if (!idle) throw Object.assign(new Error('busy'), { code: 'SESSION_BUSY' });
        await callback(null, { model: { cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1 } } });
    }, cron: async input => { calls.push(input); return { status: 'running', model: { provider: 'fixture', modelId: 'model' } }; } };
    const service = new CronService({ filename, now: () => clock.value, profiles: {}, catalog: async () => ({ models: [] }),
        store: { getSession: async (cwd, id) => ({ cwd, id, path: path.join(root, id) }) },
        supervisor: { workers: new Map(), isSessionIdle: () => idle, getWorker: async () => worker, getActiveWorker: () => null, emit: () => {} } });
    clearInterval(service.timer);
    return { service, calls, setIdle: value => { idle = value; } };
}
test('offline greetings skip, catch-up collapses to the latest occurrence, and uncertain runs never replay', async () => {
    const clock = { value: Date.parse('2026-09-28T12:05:30Z') }, filename = path.join(root, 'offline.sqlite');
    const store = new CronStore(filename);
    const skip = job({ nextAt: clock.value - 5 * 60000 }), catchup = job({ nextAt: clock.value - 5 * 60000, misfire: { policy: 'latest', graceMinutes: 30 } });
    store.saveJob(skip); store.saveJob(catchup);
    const uncertain = job({ nextAt: clock.value + 60000 }); store.saveJob(uncertain);
    store.saveRun({ id: 'interrupted', jobId: uncertain.id, status: 'running', scheduledAt: clock.value - 60000, job: uncertain, target: uncertain.target, reservedTokens: 10000, budgetDay: '2026-09-28' });
    store.close();
    const { service, calls, setIdle } = fixture(filename, clock);
    try {
        await service.ready;
        assert.equal(service.db.runs(skip.id)[0].reason, 'offline');
        assert.equal(service.db.job(catchup.id).nextAt, Date.parse('2026-09-28T12:05:00Z'));
        assert.equal(service.db.run('interrupted').status, 'uncertain');
        await service.tick();
        assert.equal(calls.length, 0, 'busy threads wait');
        assert.equal(service.db.activeRuns(catchup.id).length, 1);
        clock.value += 2 * 60000; await service.tick();
        assert.equal(service.db.activeRuns(catchup.id).length, 1, 'only one waiting run per task');
        assert.equal(service.db.activeRuns(uncertain.id).length, 1, 'unknown results block future execution');
        const uncertainSnapshot = (await service.snapshot()).jobs.find(item => item.id === uncertain.id);
        assert.equal(uncertainSnapshot.lastRun.status, 'skipped', 'a later overlap can be newer than an unfinished run');
        assert.equal(uncertainSnapshot.activeRun.id, 'interrupted', 'unfinished execution remains visible independently of the latest history row');
        assert.equal(uncertainSnapshot.activeRun.status, 'uncertain');
        setIdle(true); await service.tick();
        assert.equal(calls.filter(c => c.action === 'start').length, 1);
        assert.equal(calls[0].jobId, catchup.id);
        const dispatched = service.db.activeRuns(catchup.id)[0];
        service.db.saveRun({ ...dispatched, status: 'completed' });
        assert.equal(service.enqueue(catchup, dispatched.scheduledAt).status, 'completed', 'a consumed occurrence never becomes pending again');
    } finally { await service.dispose(); }
});
test('busy skip-policy greetings expire and pausing cancels only waiting work', async () => {
    const clock = { value: Date.parse('2026-09-28T12:00:00Z') }, fixtureState = fixture(path.join(root, 'busy.sqlite'), clock);
    const { service, calls } = fixtureState;
    try {
        await service.ready; const task = job({ nextAt: clock.value }); service.db.saveJob(task);
        await service.tick(); assert.equal(service.db.activeRuns(task.id).length, 1);
        clock.value += 61000; await service.tick();
        assert.equal(service.db.activeRuns(task.id).length, 0); assert.equal(calls.length, 0);
        const waiting = await service.action(task.id, { action: 'run', revision: 1, requestId: randomUUID() });
        await service.action(task.id, { action: 'pause', revision: 1 });
        assert.equal(service.db.run(waiting.id).status, 'cancelled');
        assert.equal(service.db.job(task.id).enabled, false);
    } finally { await service.dispose(); }
});
test('scheduler ownership rejects a second live owner and validation projects execution fields', () => {
    const filename = path.join(root, 'owner.sqlite'), store = new CronStore(filename);
    try { assert.throws(() => new CronStore(filename), /already has/); }
    finally { store.close(); }
    const input = job({ execution: { maxCalls: 2, maxTokens: 10000, maxDurationSeconds: 60, action: 'acknowledge', sessionId: 'foreign' } });
    assert.deepEqual(validateJob(input, Date.now()).execution, { maxCalls: 2, maxTokens: 10000, maxDurationSeconds: 60,
        maxCost: null, maxIdleSeconds: 900, maxRepeatedErrors: 5 });
    const now = Date.parse('2026-09-28T06:00:00Z');
    const future = job({ startsAt: Date.parse('2026-09-29T00:00:00Z') });
    assert.equal(validateJob(future, now).startsAt, future.startsAt);
    assert.throws(() => validateJob({ ...future, startsAt: -1 }, now), /start time/);
});
test('future start dates survive saving and resume, while manual runs stay explicit', async () => {
    const clock = { value: Date.parse('2026-09-28T06:00:00Z') };
    const { service } = fixture(path.join(root, 'future.sqlite'), clock);
    try {
        await service.ready;
        const startsAt = Date.parse('2026-09-29T00:00:00Z');
        const saved = await service.save({ ...job(), startsAt, enabled: false });
        assert.equal(saved.nextAt, startsAt);
        const enabled = await service.action(saved.id, { action: 'resume', revision: saved.revision });
        assert.equal(enabled.nextAt, startsAt);
        await service.tick(); assert.equal(service.db.activeRuns(saved.id).length, 0);
        const manual = await service.action(saved.id, { action: 'run', revision: enabled.revision, requestId: randomUUID() });
        assert.equal(manual.status, 'waiting');
    } finally { await service.dispose(); }
});
test('meter-only jobs remain counted without token reservations and explicit daily quotas still reserve atomically', async () => {
    const clock = { value: Date.parse('2026-10-31T06:00:00Z') }, f = fixture(path.join(root, 'meter.sqlite'), clock);
    try {
        await f.service.ready; f.setIdle(true);
        const task = await f.service.save({ ...job(), budget: {}, execution: undefined, mode: 'work', enabled: false });
        const run = f.service.enqueue(task, clock.value); await f.service.dispatch(run);
        const active = f.service.db.run(run.id);
        assert.equal(active.reservedTokens, null); assert.equal(active.execution.maxCalls, null);
        f.service.applyResult(active, { status: 'completed', usage: { tokens: 4000000, cost: 0.5, calls: 20 } });
        assert.equal(f.service.db.usage('2026-10-31').tokens, 4000000);
        assert.equal(f.service.db.usage('2026-10-31').runs, 1);
        const next = f.service.enqueue(task, clock.value + 1); await f.service.dispatch(next);
        assert.equal(f.service.db.run(next.id).status, 'running', 'old 400k daily default no longer blocks later tasks');
        f.service.applyResult(f.service.db.run(next.id), { status: 'completed', usage: { tokens: 100, cost: 0.1, calls: 1 } });
        f.service.db.setMeta('limits', { maxRunsPerDay: null, maxTokensPerDay: 5000000, maxCostPerDay: null });
        const limited = f.service.enqueue(task, clock.value + 2); await f.service.dispatch(limited);
        assert.equal(f.service.db.run(limited.id).reservedTokens, 999900);
        const other = await f.service.save({ ...job(), budget: {}, execution: undefined, enabled: false });
        const denied = f.service.enqueue(other, clock.value + 3); await f.service.dispatch(denied);
        assert.equal(f.service.db.run(denied.id).reason, 'daily-tokens');
        assert.ok(f.service.db.run(denied.id).feedback.suggestion);
    } finally { await f.service.dispose(); }
});
test('editing a legacy task preserves its policy unless the operator explicitly changes it', async () => {
    const clock = { value: Date.parse('2026-10-31T06:00:00Z') }, f = fixture(path.join(root, 'legacy-policy.sqlite'), clock);
    try {
        await f.service.ready;
        const old = job({ enabled: false, nextAt: clock.value + 60000 }); f.service.db.saveJob(old);
        const saved = await f.service.save({ ...old, name: 'Renamed' });
        assert.equal(saved.policyVersion, 1); assert.equal(saved.execution.maxTokens, 10000); assert.equal(saved.execution.maxIdleSeconds, null);
        assert.equal(saved.budget.maxTokensPerDay, 200000);
        const changed = await f.service.save({ ...saved, policyVersion: 2, execution: undefined, budget: {} });
        assert.equal(changed.execution.maxTokens, null); assert.equal(changed.budget.maxTokensPerDay, null);
        assert.equal(f.service.db.runs(old.id).length, 0, 'changing policy never runs the task');
    } finally { await f.service.dispose(); }
});
test('a rejected fee policy records feedback and a durable failure notification before model execution', async () => {
    const clock = { value: Date.parse('2026-10-31T06:00:00Z') }, f = fixture(path.join(root, 'fee-policy.sqlite'), clock);
    try {
        await f.service.ready; f.setIdle(true); const events = [];
        f.service.supervisor.emit = (type, event) => events.push({ type, event });
        f.service.captureChannelNotify = () => [];
        const task = await f.service.save({ ...job(), execution: { maxCost: 1 }, budget: {}, enabled: false });
        f.service.db.setMeta('limits', { maxRunsPerDay: null, maxTokensPerDay: null, maxCostPerDay: 0.5 });
        f.service.db.saveRun({ id: 'unknown-cost', jobId: 'other', scheduledAt: clock.value - 1, status: 'uncertain', budgetDay: '2026-10-31', startedAt: clock.value - 1, reservedTokens: null, reservedCost: null });
        const run = f.service.enqueue(task, clock.value); await f.service.dispatch(run);
        const result = f.service.db.run(run.id);
        assert.equal(result.status, 'failed'); assert.equal(result.reason, 'daily-cost'); assert.ok(result.feedback.title);
        assert.equal(result.channelNotify.status, 'pending'); assert.equal(result.channelNotify.event.admissionFailure, true);
        assert.equal(events[0].type, 'attention'); assert.equal(f.calls.length, 0);
    } finally { await f.service.dispose(); }
});
test('older editors preserve hidden spending and stall controls until explicitly cleared', async () => {
    const clock = { value: Date.parse('2026-10-31T06:00:00Z') }, f = fixture(path.join(root, 'partial-policy.sqlite'), clock);
    try {
        await f.service.ready;
        const task = await f.service.save({ ...job(), enabled: false, execution: { maxCost: 2, maxIdleSeconds: 300, maxRepeatedErrors: 3 }, budget: { maxCostPerDay: 5 } });
        const edited = await f.service.save({ ...task, name: 'Older client edit', execution: { maxCalls: 200 }, budget: { maxRunsPerDay: 12 } });
        assert.equal(edited.execution.maxCost, 2); assert.equal(edited.execution.maxIdleSeconds, 300); assert.equal(edited.execution.maxRepeatedErrors, 3);
        assert.equal(edited.budget.maxCostPerDay, 5);
        const cleared = await f.service.save({ ...edited, execution: { maxCost: null }, budget: { maxCostPerDay: null } });
        assert.equal(cleared.execution.maxCost, null); assert.equal(cleared.budget.maxCostPerDay, null);
    } finally { await f.service.dispose(); }
});
test('policy-only edits update expired tasks without changing schedule, target, enabled state or history', async () => {
    const clock = { value: Date.parse('2026-10-31T06:00:00Z') }, f = fixture(path.join(root, 'expired-policy.sqlite'), clock);
    try {
        await f.service.ready;
        const old = job({ enabled: false, nextAt: null, schedule: { kind: 'once', timeZone: 'UTC', at: clock.value - 86400000 } });
        f.service.db.saveJob(old); f.service.db.saveRun({ id: 'old-completion', jobId: old.id, scheduledAt: old.schedule.at, status: 'completed', replyEntryId: 'native-original' });
        f.service.target = async () => { throw Error('Policy editing must not open or retarget the thread'); };
        const result = await f.service.configurePolicy(old.id, { revision: old.revision, execution: { maxCalls: null, maxTokens: null, maxDurationSeconds: 21600 }, budget: { maxRunsPerDay: null, maxTokensPerDay: null } });
        assert.equal(result.policyVersion, 3); assert.equal(result.execution.maxCalls, null); assert.equal(result.execution.maxTokens, null);
        assert.deepEqual(result.schedule, old.schedule); assert.deepEqual(result.target, old.target); assert.equal(result.enabled, false); assert.equal(result.nextAt, null);
        assert.equal(f.service.db.run('old-completion').replyEntryId, 'native-original'); assert.equal(f.calls.length, 0);
        await assert.rejects(f.service.configurePolicy(old.id, { revision: old.revision, execution: { maxCalls: null } }), /changed/);
        f.service.db.saveRun({ id: 'still-active', jobId: old.id, scheduledAt: clock.value, status: 'uncertain', job: result });
        await assert.rejects(f.service.configurePolicy(old.id, { revision: result.revision, execution: { maxCalls: null } }), /active run/);
    } finally { await f.service.dispose(); }
});
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
