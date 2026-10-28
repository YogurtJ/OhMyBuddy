const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { collect } = require('../scripts/package-macos.cjs');
function fixture(t) { const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-macos-package-'))); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }
test('platform collection materializes hard-linked executables without changing their bytes or executable modes', t => {
    const root = fixture(t), first = path.join(root, 'a'), second = path.join(root, 'b');
    fs.writeFileSync(first, 'synthetic executable', { mode: 0o755 }); fs.linkSync(first, second);
    assert.equal(fs.statSync(first).nlink, 2);
    const files = collect(root);
    assert.equal(files.length, 2); assert.equal(files[0].sha256, files[1].sha256);
    assert.equal(fs.statSync(first).nlink, 1); assert.equal(fs.statSync(second).nlink, 1);
    assert.notEqual(fs.statSync(first).ino, fs.statSync(second).ino);
    if (process.platform !== 'win32') assert.ok(files.every(file => file.mode === 0o755));
});
test('platform collection rejects symlinks rather than following them into another tree', { skip: process.platform === 'win32' }, t => {
    const root = fixture(t); fs.symlinkSync(os.tmpdir(), path.join(root, 'outside'));
    assert.throws(() => collect(root), /link or special/);
});
