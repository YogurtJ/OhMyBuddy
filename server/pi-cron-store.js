const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { privateDir } = require('./pi-maintenance-files');
const privateFiles = require('./pi-private-files');
const ACTIVE = new Set(['waiting', 'dispatching', 'running', 'uncertain']);
const { DEFAULT_LIMITS, DEFAULT_SETTINGS } = require('./pi-cron-policy');
function prepareDatabase(filename) {
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
        try { if (!fs.lstatSync(filename + suffix).isFile()) throw new Error('Unsafe scheduler database'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    try { fs.closeSync(privateFiles.openPrivateFileSync(filename)); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (!fs.lstatSync(filename).isFile()) throw new Error('Unsafe scheduler database');
    privateFiles.privateFileMode(filename);
}
function acquireOwnerLock(filename) {
    prepareDatabase(filename);
    const db = new DatabaseSync(filename);
    try {
        // Keep this transaction open on a separate database so the task database
        // can still commit each update durably. SQLite uses OS file locks, which
        // are released even after SIGKILL or a reboot. Never unlink this file:
        // replacing its inode would let another process acquire a different lock.
        // Simultaneous first opens can briefly hold shared locks while SQLite
        // reads the journal mode. Let those readers finish so both contenders
        // do not fail before either owns the exclusive transaction.
        db.exec('PRAGMA busy_timeout=1000; PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE');
        return db;
    } catch (error) {
        db.close();
        if (error.errcode === 5 || error.errcode === 6) throw new Error('This identity already has a scheduler owner', { cause: error });
        throw error;
    }
}
class CronStore {
    constructor(filename) {
        const directory = privateDir(path.dirname(filename));
        filename = path.join(directory, path.basename(filename));
        this.filename = filename;
        this.ownerLock = acquireOwnerLock(filename + '.owner.sqlite');
        this.db = null;
        this.owner = `${process.pid}:${randomUUID()}`;
        try {
            prepareDatabase(filename);
            this.db = new DatabaseSync(filename);
            this.db.exec(`PRAGMA busy_timeout=1000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
                CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, jobId TEXT NOT NULL, at INTEGER NOT NULL, data TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS runs_job ON runs(jobId,at);
                CREATE TABLE IF NOT EXISTS homes (profileId TEXT PRIMARY KEY, data TEXT NOT NULL);`);
            this.transaction(() => {
                const version = this.meta('version');
                if (version && version !== 1) throw new Error('Unsupported scheduler database');
                // Retain the legacy row for older readers, but only the OS lock
                // establishes ownership. A stored PID can belong to anyone now.
                this.setMeta('version', 1); this.setMeta('owner', this.owner);
                for (const run of this.activeRuns()) if (['dispatching', 'running'].includes(run.status)) {
                    this.saveRun({ ...run, status: 'uncertain', reason: 'restart' });
                }
            });
        } catch (error) {
            try { this.db?.close(); }
            finally { this.db = null; this.ownerLock.close(); this.ownerLock = null; }
            throw error;
        }
    }
    transaction(callback) {
        this.db.exec('BEGIN IMMEDIATE');
        try { const result = callback(); this.db.exec('COMMIT'); return result; }
        catch (error) { this.db.exec('ROLLBACK'); throw error; }
    }
    meta(key) { const row = this.db.prepare('SELECT data FROM meta WHERE key=?').get(key); return row ? JSON.parse(row.data) : null; }
    setMeta(key, data) { this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run(key, JSON.stringify(data)); }
    jobs() { return this.db.prepare('SELECT data FROM jobs').all().map(row => JSON.parse(row.data)); }
    job(id) { const row = this.db.prepare('SELECT data FROM jobs WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; }
    saveJob(job) { this.db.prepare('INSERT OR REPLACE INTO jobs VALUES (?,?)').run(job.id, JSON.stringify(job)); }
    runs(jobId) { return (jobId ? this.db.prepare('SELECT data FROM runs WHERE jobId=? ORDER BY at DESC LIMIT 100').all(jobId)
        : this.db.prepare('SELECT data FROM runs ORDER BY at DESC LIMIT 100').all()).map(row => JSON.parse(row.data)); }
    activeRuns(jobId) {
        const sql = "SELECT data FROM runs WHERE json_extract(data,'$.status') IN ('waiting','dispatching','running','uncertain')";
        return (jobId ? this.db.prepare(sql + ' AND jobId=? ORDER BY at').all(jobId) : this.db.prepare(sql + ' ORDER BY at').all()).map(row => JSON.parse(row.data));
    }
    runCount() { return this.db.prepare('SELECT count(*) AS n FROM runs').get().n; }
    run(id) { const row = this.db.prepare('SELECT data FROM runs WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; }
    saveRun(run) {
        // Notification acknowledgements and stale worker results must not erase each other.
        const previous = this.run(run.id);
        if (previous?.channelNotify) run = { ...run, channelNotify: previous.channelNotify };
        if (!ACTIVE.has(run.status)) { run = { ...run, jobRevision: run.job?.revision ?? run.jobRevision }; delete run.job; }
        this.db.prepare('INSERT OR REPLACE INTO runs VALUES (?,?,?,?)').run(run.id, run.jobId, run.scheduledAt, JSON.stringify(run));
    }
    pendingChannelNotifications() {
        return this.db.prepare("SELECT data FROM runs WHERE json_extract(data,'$.channelNotify.status')='pending' ORDER BY at")
            .all().map(row => JSON.parse(row.data));
    }
    channelNotificationSummary() {
        const row = this.db.prepare(`SELECT
            count(*) FILTER (WHERE json_extract(data,'$.channelNotify.status')='pending') AS pending,
            count(*) FILTER (WHERE json_extract(data,'$.channelNotify.status')='skipped'
                AND json_extract(data,'$.channelNotify.reason')='capture-error') AS failed,
            count(*) FILTER (WHERE json_extract(data,'$.channelNotify.status')='pending'
                AND json_extract(data,'$.channelNotify.lastError') IS NOT NULL) AS retrying
            FROM runs WHERE json_type(data,'$.channelNotify') IS NOT NULL`).get();
        return { pending: row.pending, failed: row.failed,
            lastError: row.retrying ? 'channel-admission-pending' : row.failed ? 'channel-capture-failed' : null };
    }
    updateChannelNotification(id, attempts, notification) {
        return this.transaction(() => {
            const run = this.run(id);
            if (run?.channelNotify?.status !== 'pending' || run.channelNotify.attempts !== attempts) return false;
            this.db.prepare('UPDATE runs SET data=? WHERE id=?').run(JSON.stringify({ ...run, channelNotify: notification }), id);
            return true;
        });
    }
    home(id) { const row = this.db.prepare('SELECT data FROM homes WHERE profileId=?').get(id); return row ? JSON.parse(row.data) : null; }
    homes() { return this.db.prepare('SELECT profileId,data FROM homes').all().map(row => ({ profileId: row.profileId, ...JSON.parse(row.data) })); }
    saveHome(id, data) { this.db.prepare('INSERT OR REPLACE INTO homes VALUES (?,?)').run(id, JSON.stringify(data)); }
    limits() { return this.meta('limits') || { ...DEFAULT_LIMITS }; }
    settings() { return this.meta('settings') || { ...DEFAULT_SETTINGS }; }
    // The user's scheduled tasks; messages Bots start themselves (origin 'bot') have their own
    // per-Bot count (proactiveRuns) and never use up the user's daily budget.
    usage(day, jobId) {
        const sql = "SELECT json_extract(data,'$.usage') AS usage, json_extract(data,'$.reservedTokens') AS reservedTokens, json_extract(data,'$.reservedCost') AS reservedCost FROM runs WHERE json_extract(data,'$.budgetDay')=? AND (json_extract(data,'$.startedAt') IS NOT NULL OR json_extract(data,'$.reservedTokens')>0) AND json_extract(data,'$.origin') IS NULL";
        const runs = (jobId ? this.db.prepare(sql + ' AND jobId=?').all(day, jobId) : this.db.prepare(sql).all(day)).map(row => ({ ...row, usage: row.usage ? JSON.parse(row.usage) : null }));
        return { runs: runs.length, tokens: runs.reduce((sum, run) => sum + (run.usage?.tokens ?? run.reservedTokens ?? 0), 0),
            cost: runs.reduce((sum, run) => sum + (run.usage?.cost ?? run.reservedCost ?? 0), 0),
            unknownCost: runs.some(run => run.usage?.cost == null && run.reservedCost == null) };
    }
    proactiveRuns(day, profileId) {
        return this.db.prepare("SELECT count(*) AS n FROM runs WHERE json_extract(data,'$.origin')='bot' AND json_extract(data,'$.profileId')=? AND json_extract(data,'$.budgetDay')=?")
            .get(profileId, day).n;
    }
    close() {
        if (!this.db) return;
        const db = this.db;
        try {
            try {
                if (fs.existsSync(this.filename) && this.meta('owner') === this.owner) db.prepare("DELETE FROM meta WHERE key='owner'").run();
            } finally { db.close(); }
        } finally {
            this.db = null;
            this.ownerLock.close(); this.ownerLock = null;
        }
    }
}
module.exports = { CronStore, ACTIVE, DEFAULT_LIMITS };
