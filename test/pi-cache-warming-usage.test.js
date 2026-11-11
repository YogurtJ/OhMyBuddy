const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { UsageLedger, runLedger } = require('../server/pi-usage-ledger');
const { scanUsage, recordFromEntry } = require('../server/pi-usage-worker');
function fixture(t) {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-cache-usage-')));
    t.after(() => fs.rmSync(base, { recursive: true, force: true }));
    const root = path.join(base, 'sessions'), project = path.join(base, 'project');
    fs.mkdirSync(project); fs.mkdirSync(path.join(root, 'a'), { recursive: true });
    const file = path.join(root, 'a', 'a.jsonl');
    const header = { type: 'session', version: 3, id: 'a', cwd: project, timestamp: '2026-11-01T00:00:00Z' };
    const usage = { input: 0, output: 1, cacheRead: 100000, cacheWrite: 0, totalTokens: 100001, cost: { total: .25, totalFromProvider: true } };
    const warm = { type: 'usage', kind: 'cache_warm', id: 'warm', timestamp: '2026-11-10T12:00:00Z', provider: 'synthetic', model: 'cache', usage, note: 'PRIVATE_NOTE_MUST_NOT_PERSIST' };
    const assistant = { type: 'message', id: 'reply', timestamp: warm.timestamp, message: { role: 'assistant', provider: 'synthetic', model: 'cache', usage,
        content: [{ type: 'text', text: 'PRIVATE_REPLY_MUST_NOT_PERSIST' }] } };
    fs.writeFileSync(file, [header, assistant].map(row => JSON.stringify(row)).join('\n') + '\n');
    const input = { root, roots: [base], ledgerPath: path.join(base, 'ledger/ledger.sqlite'),
        filter: { from: '2026-11-01', to: '2026-11-30', timeZone: 'UTC' } };
    return { base, root, file, header, warm, assistant, input };
}
test('v2 ledger and old scan cursor backfill skipped native usage without changing existing facts or JSONL', async t => {
    const f = fixture(t), first = await runLedger(f.input);
    assert.equal(first.total.records, 1);
    fs.appendFileSync(f.file, JSON.stringify(f.warm) + '\n');
    const original = fs.readFileSync(f.file);
    let scanned;
    scanUsage({ ...f.input, incremental: { cached: () => false, save: data => { scanned = data; } } });
    const legacy = new UsageLedger(f.input.ledgerPath);
    let oldFacts;
    try {
        oldFacts = legacy.db.prepare('SELECT * FROM facts').all();
        // A 1.5.0 scanner already visited these bytes but ignored the usage row.
        legacy.db.prepare('UPDATE sources SET signature=? WHERE path=?').run(scanned.signature, f.file);
        legacy.db.prepare('UPDATE checkpoints SET signature=?,data=? WHERE path=?')
            .run(scanned.signature, JSON.stringify({ ...scanned.checkpoint, version: 1 }), f.file);
        legacy.db.exec("ALTER TABLE daily DROP COLUMN cacheWarmingCost; ALTER TABLE daily DROP COLUMN cacheWarmingRecords; UPDATE meta SET value='2' WHERE key='schema'");
    } finally { legacy.close(); }
    const result = await runLedger(f.input);
    assert.equal(result.total.records, 2); assert.equal(result.total.cost, .5);
    assert.equal(result.total.cacheWarmingCost, .25); assert.equal(result.total.cacheWarmingRecords, 1);
    assert.equal(result.total.providerReportedRecords, 2); assert.equal(result.total.providerReportedCost, .5);
    assert.equal(result.coverage.scannedFiles, 1); assert.equal(result.coverage.cachedFiles, 0);
    assert.deepEqual(fs.readFileSync(f.file), original);
    const ledger = new UsageLedger(f.input.ledgerPath);
    try {
        assert.equal(ledger.db.prepare("SELECT value FROM meta WHERE key='schema'").get().value, '3');
        assert.deepEqual(ledger.db.prepare('SELECT * FROM facts WHERE key=?').all(oldFacts[0].key), oldFacts);
        assert.doesNotMatch(JSON.stringify(ledger.db.prepare('SELECT data FROM facts').all()), /PRIVATE_/);
    } finally { ledger.close(); }
    assert.equal((await runLedger(f.input)).total.records, 2);
    fs.writeFileSync(path.join(f.root, 'a/copy.jsonl'), [f.header, f.warm].map(row => JSON.stringify(row)).join('\n') + '\n');
    assert.equal((await runLedger(f.input)).total.cacheWarmingRecords, 1, 'native copies do not double-charge');
    fs.unlinkSync(f.file); fs.unlinkSync(path.join(f.root, 'a/copy.jsonl'));
    assert.equal((await runLedger(f.input)).total.cacheWarmingCost, .25, 'deletion preserves the charged facts');
    assert.equal((await runLedger({ ...f.input, filter: { ...f.input.filter, timeZone: 'Asia/Shanghai' } })).total.cacheWarmingCost, .25);
});
test('native warming in side-chat usage retains its category and provider-reported zero', async t => {
    const f = fixture(t);
    const warm = { ...f.warm, usage: { ...f.warm.usage, cost: { total: 0, totalFromProvider: true } } };
    const record = recordFromEntry(warm, { format: () => '2026-11-10' }, f.input.filter);
    const sideBatch = { cwd: f.header.cwd, sessionId: '11111111-1111-4111-8111-111111111111', records: [record] };
    assert.equal((await runLedger({ ...f.input, filter: null, sideBatch })).inserted, 1);
    const result = await runLedger(f.input);
    assert.equal(result.total.records, 2); assert.equal(result.total.cacheWarmingRecords, 1);
    assert.equal(result.total.cacheWarmingCost, 0); assert.equal(result.total.providerReportedRecords, 2);
    assert.equal((await runLedger({ ...f.input, filter: null, sideBatch })).inserted, 0);
    assert.equal((await runLedger(f.input)).total.records, 2);
});
