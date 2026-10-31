const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { CronStore } = require('../server/pi-cron-store');

const cleanups = new Map();
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmybuddy-cron-owner-'));
    const filename = path.join(root, 'scheduler.sqlite');
    cleanups.set(filename, []);
    t.after(async () => {
        try { for (const cleanup of cleanups.get(filename).reverse()) await cleanup(); }
        finally { cleanups.delete(filename); fs.rmSync(root, { recursive: true, force: true }); }
    });
    return filename;
}
function staleOwner(filename, owner) {
    const db = new DatabaseSync(filename);
    try { db.prepare("INSERT OR REPLACE INTO meta VALUES ('owner',?)").run(JSON.stringify(owner)); }
    finally { db.close(); }
}
const childScript = `
    const { CronStore } = require(process.argv[1]);
    const store = new CronStore(process.argv[2]);
    for (const status of ['dispatching', 'running']) store.saveRun({
        id: status, jobId: 'job', status, scheduledAt: 1, job: { id: 'job', prompt: 'Keep this snapshot' },
        reservedTokens: 1000, budgetDay: '2026-10-30'
    });
    process.on('message', message => {
        if (message === 'close') { store.close(); process.exit(0); }
    });
    process.send({ owner: store.owner });
`;
async function startOwner(t, filename) {
    const child = spawn(process.execPath, ['-e', childScript, require.resolve('../server/pi-cron-store'), filename], {
        cwd: path.dirname(filename), stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    });
    let stderr = '';
    child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-4000); });
    const exited = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
    cleanups.get(filename).push(async () => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await exited;
    });
    const message = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Owner fixture timed out: ' + stderr)), 10000);
        child.once('error', reject);
        child.once('message', message => { clearTimeout(timer); resolve(message); });
        child.once('close', () => { clearTimeout(timer); reject(new Error('Owner fixture exited before ready: ' + stderr)); });
    });
    return { child, exited, owner: message.owner };
}

test('a stale owner pointing at an unrelated live PID does not block startup', t => {
    const filename = fixture(t), initial = new CronStore(filename);
    initial.saveJob({ id: 'job', prompt: 'Keep the scheduled task' });
    initial.saveHome('profile', { sessionId: 'session', revision: 2 });
    initial.setMeta('limits', { maxRunsPerDay: 12 });
    initial.close();
    staleOwner(filename, `${process.ppid}:${randomUUID()}`);
    const store = new CronStore(filename);
    try {
        assert.equal(store.job('job').prompt, 'Keep the scheduled task');
        assert.equal(store.home('profile').sessionId, 'session');
        assert.deepEqual(store.limits(), { maxRunsPerDay: 12 });
        assert.equal(store.meta('owner'), store.owner);
    } finally { store.close(); }
});

test('ownership does not depend on permission to probe a recorded PID', t => {
    const filename = fixture(t), initial = new CronStore(filename);
    initial.close();
    staleOwner(filename, `${process.ppid}:${randomUUID()}`);
    t.mock.method(process, 'kill', () => { throw Object.assign(new Error('Permission denied'), { code: 'EPERM' }); });
    const store = new CronStore(filename);
    try { assert.equal(process.kill.mock.callCount(), 0); }
    finally { store.close(); }
});

test('a live owner is exclusive across processes and normal close releases it', { timeout: 20000 }, async t => {
    const filename = fixture(t), owner = await startOwner(t, filename);
    assert.throws(() => new CronStore(filename), /already has a scheduler owner/);
    staleOwner(filename, null);
    assert.throws(() => new CronStore(filename), /already has a scheduler owner/, 'the lock still excludes peers without an owner row');
    owner.child.send('close');
    assert.equal((await owner.exited).code, 0);
    const store = new CronStore(filename);
    try { assert.equal(store.meta('owner'), store.owner); }
    finally { store.close(); }
});

test('forced exit releases ownership and interrupted runs stay uncertain across recovery', { timeout: 20000 }, async t => {
    const filename = fixture(t), owner = await startOwner(t, filename);
    owner.child.kill('SIGKILL');
    await owner.exited;
    // Model PID reuse without rebooting the machine or depending on PID allocation.
    staleOwner(filename, `${process.ppid}:${randomUUID()}`);
    for (let attempt = 0; attempt < 2; attempt++) {
        const store = new CronStore(filename);
        try {
            for (const id of ['dispatching', 'running']) {
                const run = store.run(id);
                assert.equal(run.status, 'uncertain');
                assert.equal(run.reason, 'restart');
                assert.equal(run.job.prompt, 'Keep this snapshot');
                assert.equal(run.reservedTokens, 1000);
            }
            assert.equal(store.runCount(), 2, 'recovery does not create replacement runs');
        } finally { store.close(); }
    }
});

test('constructor failure releases ownership and permits a corrected database to reopen', t => {
    const filename = fixture(t), initial = new CronStore(filename);
    initial.setMeta('version', 99); initial.close();
    assert.throws(() => new CronStore(filename), /Unsupported scheduler database/);
    const db = new DatabaseSync(filename);
    try { db.prepare("UPDATE meta SET data='1' WHERE key='version'").run(); }
    finally { db.close(); }
    const store = new CronStore(filename);
    store.close(); store.close();
});

test('simultaneous first starts grant ownership to exactly one process', { timeout: 20000 }, async t => {
    const filename = fixture(t);
    const results = await Promise.allSettled([startOwner(t, filename), startOwner(t, filename)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1,
        JSON.stringify(results.map(result => result.status === 'rejected' ? { error: result.reason.message } : { owner: true })));
    const rejected = results.find(result => result.status === 'rejected');
    assert.match(rejected.reason.message, /already has a scheduler owner/);
});

test('failed schema initialization and failed close both release the owner lock', t => {
    const filename = fixture(t);
    fs.writeFileSync(filename, 'Not a SQLite database');
    assert.throws(() => new CronStore(filename), /not a database/);
    fs.unlinkSync(filename);
    const store = new CronStore(filename);
    store.db.prepare("UPDATE meta SET data='invalid-json' WHERE key='owner'").run();
    assert.throws(() => store.close(), SyntaxError);
    const reopened = new CronStore(filename);
    reopened.close();
});

test('lock files remain private and stable across normal close and reopen', t => {
    const filename = fixture(t), store = new CronStore(filename), lockfile = filename + '.owner.sqlite';
    const before = fs.statSync(lockfile, { bigint: true });
    if (process.platform !== 'win32') assert.equal(Number(before.mode & 0o777n), 0o600);
    store.close();
    assert.equal(fs.statSync(lockfile, { bigint: true }).ino, before.ino);
    const reopened = new CronStore(filename);
    try { assert.equal(fs.statSync(lockfile, { bigint: true }).ino, before.ino); }
    finally { reopened.close(); }
});

test('non-file lock paths and sidecars fail closed without taking ownership', async t => {
    const filename = fixture(t);
    for (const suffix of ['.owner.sqlite', '.owner.sqlite-journal', '.owner.sqlite-wal', '.owner.sqlite-shm']) {
        await t.test(suffix, () => {
            const unsafe = filename + suffix;
            fs.mkdirSync(unsafe);
            try { assert.throws(() => new CronStore(filename), /Unsafe scheduler database/); }
            finally { fs.rmdirSync(unsafe); }
            const store = new CronStore(filename);
            store.close();
            if (suffix === '.owner.sqlite') fs.unlinkSync(filename + suffix);
        });
    }
});

test('ownership is per database and also excludes duplicate connections in one process', t => {
    const filename = fixture(t), store = new CronStore(filename);
    const other = new CronStore(path.join(path.dirname(filename), 'other.sqlite'));
    try {
        assert.throws(() => new CronStore(filename), /already has a scheduler owner/);
        store.close();
        const reopened = new CronStore(filename);
        try { assert.throws(() => new CronStore(filename), /already has a scheduler owner/); }
        finally { reopened.close(); }
        assert.equal(other.meta('owner'), other.owner);
    } finally { store.close(); other.close(); }
});
