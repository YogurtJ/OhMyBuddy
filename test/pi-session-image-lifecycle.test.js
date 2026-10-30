const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { SessionImageLifecycle, imageReferences } = require('../server/pi-session-image-lifecycle');
const { SessionImages } = require('../server/pi-session-images');
const { SessionImageStorage, RETENTION_MS } = require('../server/pi-session-image-storage');
const { PiSessionStore } = require('../server/pi-session-store');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ohmybuddy-image-lifecycle-')));
process.env.PI_CODING_AGENT_DIR = root; process.env.PI_PROJECT_ROOTS = root; process.env.PI_OFFLINE = '1';
const image = { type: 'image', mimeType: 'image/png', data: Buffer.from('synthetic image bytes').toString('base64') };
const secondImage = { ...image, data: Buffer.from('second image bytes').toString('base64') };
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
let number = 0;
async function fixture(t) {
    const cwd = path.join(root, 'project-' + ++number); fs.mkdirSync(cwd);
    const sdk = await import('@earendil-works/pi-coding-agent'), store = new PiSessionStore(), session = await store.createSession(cwd, 'Image deletion');
    const manager = sdk.SessionManager.open(session.path), images = new SessionImages(root), block = images.save(image), lifecycle = new SessionImageLifecycle(root);
    manager.appendMessage({ role: 'user', content: [block], timestamp: 1 });
    return { cwd, sdk, store, session, manager, images, block, lifecycle };
}
test('normal trash records image recovery before native removal; permanent deletion only queues reference checks', async t => {
    const f = await fixture(t), moved = path.join(root, 'synthetic-trash.jsonl');
    const result = await f.store.deleteSession(f.cwd, f.session.id, { trashFile: async file => {
        const dir = f.lifecycle.directories().deletions;
        assert.ok(fs.readdirSync(dir).some(name => f.lifecycle.read(name.slice(0, -5)).state === 'prepared'));
        fs.renameSync(file, moved);
    } });
    assert.equal(result.trashed, true); assert.equal(result.imageRetention, 'trash-protected');
    assert.equal(f.lifecycle.read(result.imageDeletionId).state, 'trashed'); assert.equal(f.images.restore(f.block).data, image.data);
    fs.renameSync(moved, f.session.path); f.store.sessionLists.clear(); f.store.sessionListCache.clear();
    // A restored trash record still protects bytes: a later permanent deletion
    // cannot silently discard an earlier recovery promise.
    const g = await fixture(t), permanent = await g.store.deleteSession(g.cwd, g.session.id, { trashFile: async () => { throw Error('No system trash in fixture'); } });
    assert.equal(permanent.trashed, false); assert.equal(g.lifecycle.read(permanent.imageDeletionId).state, 'deleted');
    assert.equal(g.images.restore(g.block).data, image.data);
});
test('reference collection covers abandoned branches, custom images and context replacements', async t => {
    const f = await fixture(t), first = f.manager.getLeafId(), other = f.images.save(secondImage);
    f.manager.appendMessage({ role: 'user', content: [other], timestamp: 2 });
    f.manager.branch(first); f.manager.appendCustomMessageEntry('fixture', [f.block], true);
    f.manager.appendContextEdit(first, { content: [other] });
    assert.equal(imageReferences(f.manager.getEntries()).length, 2);
    const id = f.lifecycle.prepareSession(f.session); assert.equal(f.lifecycle.read(id).refs.length, 2);
});
test('failed file removal cancels image retirement only after proving the original native bytes still exist', async t => {
    const f = await fixture(t), unlink = fs.unlinkSync;
    const before = new Set(fs.readdirSync(f.lifecycle.directories().deletions));
    fs.unlinkSync = file => { if (file === f.session.path) throw Error('synthetic unlink failure'); return unlink(file); };
    try { await assert.rejects(f.store.deleteSession(f.cwd, f.session.id, { trashFile: async () => { throw Error('synthetic trash failure'); } }), /unlink failure/); }
    finally { fs.unlinkSync = unlink; }
    assert.ok(fs.existsSync(f.session.path));
    const added = fs.readdirSync(f.lifecycle.directories().deletions).filter(name => !before.has(name));
    assert.equal(added.length, 1); assert.equal(f.lifecycle.read(added[0].slice(0, -5)).state, 'cancelled');
    assert.equal(f.images.restore(f.block).data, image.data);
});
test('a successful trash command that leaves the path present is not reported as a completed deletion', async t => {
    const f = await fixture(t);
    await assert.rejects(f.store.deleteSession(f.cwd, f.session.id, { trashFile: async () => {} }), /删除结果待核对/);
    assert.ok(fs.existsSync(f.session.path)); assert.equal(f.images.restore(f.block).data, image.data);
});

test('unknown trash completion retains recovery protection when the original path disappeared', async t => {
    const f = await fixture(t), before = new Set(fs.readdirSync(f.lifecycle.directories().deletions));
    const moved = path.join(root, 'unknown-trash-' + number + '.jsonl');
    await assert.rejects(f.store.deleteSession(f.cwd, f.session.id, { trashFile: async file => { fs.renameSync(file, moved); throw Error('Lost system trash response'); } }));
    const added = fs.readdirSync(f.lifecycle.directories().deletions).filter(name => !before.has(name));
    assert.equal(added.length, 1); assert.equal(f.lifecycle.read(added[0].slice(0, -5)).state, 'prepared');
    assert.equal(f.images.restore(f.block).data, image.data);
});

// The HTTP integration test exercises the real maintenance lease. This bounded
// fixture isolates reference proof, quarantine, expiry, and durable no-replay.
async function storageFixture(t) {
    const f = await fixture(t), unique = { ...image, data: Buffer.from('unreferenced-' + number).toString('base64') }, block = f.images.save(unique);
    let time = Date.now(), held = false;
    const uploads = { store: f.store, active: 0, writing: false, reserve() { this.active++; return () => this.active--; } };
    const guard = { acquire() { assert.equal(held, false); held = true; return { check() { assert.ok(held); }, async ready() {}, release() { held = false; } }; } };
    const storage = new SessionImageStorage(uploads, { storageGuard: guard, protectedDocuments: async () => ({ complete: true, ids: [], revision: 'fixture' }), now: () => time });
    const preview = async (action, extra = {}) => storage.preview({ cwd: f.cwd, action, ...extra });
    const execute = async (p, id) => storage.cleanup({ cwd: f.cwd, ticket: p.ticket, revision: p.revision, requestId: id, confirmed: true, externalWritersStopped: true, externalRestoreReviewed: true });
    return { ...f, unique, block, storage, preview, execute, advance: ms => { time += ms; } };
}
test('shared images stay protected; unreferenced images quarantine, survive restore, and purge only after 30 days and a fresh check', async t => {
    const f = await storageFixture(t), id = f.block.pivaneImage.sha256;
    const preview = await f.preview('quarantine');
    const result = await f.execute(preview, 'quarantine-' + number); assert.equal(result.state, 'completed'); assert.ok(result.ids.includes(id));
    assert.ok(!fs.existsSync(path.join(f.images.root, id))); assert.equal(f.images.restore(f.block).data, f.unique.data);
    await assert.rejects(f.preview('purge'), /没有符合条件/);
    f.advance(RETENTION_MS + 1000);
    const entry = f.manager.appendMessage({ role: 'user', content: [f.block], timestamp: 4 });
    assert.ok(!(await f.storage.snapshot(f.cwd)).purge.some(object => object.id === id), 'restored session protects its quarantined image');
    // Remove this synthetic session entirely, like a permanently deleted topic.
    fs.unlinkSync(f.session.path);
    const purge = await f.preview('purge'); const purged = await f.execute(purge, 'purge-' + number);
    assert.equal(purged.state, 'completed'); assert.ok(purged.ids.includes(id)); assert.throws(() => f.images.restore(f.block));
    assert.deepEqual(await f.execute(purge, 'purge-' + number), purged, 'same request only reads the receipt');
});
test('new shared reference after preview invalidates cleanup without moving image bytes', async t => {
    const f = await storageFixture(t), preview = await f.preview('quarantine');
    f.manager.appendMessage({ role: 'user', content: [f.block], timestamp: 5 });
    await assert.rejects(f.execute(preview, 'stale-' + number), { code: 'IMAGE_STORAGE_CHANGED' });
    assert.equal(f.images.restore(f.block).data, f.unique.data);
});
test('trash recovery protection requires its own explicit release and never overrides another saved reference', async t => {
    const f = await storageFixture(t);
    const id = f.lifecycle.prepare({ kind: 'session', key: ['old-trash', number], name: 'Old', refs: [{ sha256: f.block.pivaneImage.sha256, bytes: f.block.pivaneImage.bytes }] });
    f.lifecycle.finish(id, 'trashed');
    assert.ok(!(await f.storage.snapshot(f.cwd)).candidates.some(object => object.id === f.block.pivaneImage.sha256));
    const release = await f.preview('release', { recordId: id }); await f.execute(release, 'release-' + number);
    assert.equal(f.lifecycle.read(id).state, 'released');
    assert.ok((await f.storage.snapshot(f.cwd)).candidates.some(object => object.id === f.block.pivaneImage.sha256));
});
test('saving a quarantined hash again can be quarantined without overwriting its recovery copy', async t => {
    const f = await storageFixture(t), id = f.block.pivaneImage.sha256;
    await f.execute(await f.preview('quarantine'), 'first-quarantine-' + number);
    f.images.save(f.unique); assert.ok(fs.existsSync(path.join(f.images.root, id)));
    const preview = await f.preview('quarantine'); await f.execute(preview, 'second-quarantine-' + number);
    assert.ok(!fs.existsSync(path.join(f.images.root, id))); assert.equal(f.images.restore(f.block).data, f.unique.data);
});
test('expired previews, corrupt recovery records and incomplete scans cannot authorize cleanup', async t => {
    const f = await storageFixture(t), preview = await f.preview('quarantine'); f.advance(5 * 60000 + 1);
    await assert.rejects(f.execute(preview, 'expired-' + number), { code: 'IMAGE_STORAGE_CHANGED' });
    f.storage.maxBytes = 1; await assert.rejects(f.preview('quarantine'));
    assert.equal((await f.storage.usage({ cwd: f.cwd })).complete, false);
    f.storage.maxBytes = undefined;
    const dirs = f.lifecycle.directories(), file = path.join(dirs.deletions, '0'.repeat(64) + '.json');
    fs.writeFileSync(file, '{"version":999}');
    try { await assert.rejects(f.preview('quarantine')); } finally { fs.unlinkSync(file); }
    assert.equal(f.images.restore(f.block).data, f.unique.data);
});

test('a partial quarantine remains uncertain and is never automatically replayed', async t => {
    const f = await storageFixture(t), preview = await f.preview('quarantine'), rename = fs.renameSync;
    fs.renameSync = (from, to) => { if (path.dirname(to) === path.join(f.images.root, '.quarantine')) throw Error('synthetic quarantine failure'); return rename(from, to); };
    try { await assert.rejects(f.execute(preview, 'uncertain-' + number), /quarantine failure/); }
    finally { fs.renameSync = rename; }
    const receipt = await f.execute(preview, 'uncertain-' + number); assert.equal(receipt.state, 'uncertain');
    assert.equal(f.images.restore(f.block).data, f.unique.data);
    const snapshot = await f.storage.snapshot(f.cwd); assert.ok(!snapshot.candidates.some(object => object.id === f.block.pivaneImage.sha256));
});
