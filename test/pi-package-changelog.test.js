const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { PiResourceService } = require('../server/pi-resource-service');
const { MAX_CHANGELOG_BYTES } = require('../server/pi-package-changelog');

function fixture(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-package-log-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const pkg = path.join(root, 'package'); fs.mkdirSync(pkg);
    let revision = 'r1', trusted = true;
    const native = { busy: false, context: async () => ({ revision }), mutate: () => assert.fail('reading logs must never mutate configuration') };
    const service = new PiResourceService(native);
    const packages = [{ source: 'npm:fixture', scope: 'user', installedPath: pkg }];
    service.context = async () => ({ cwd: root, revision, trust: { effective: trusted }, manager: { listConfiguredPackages: () => packages } });
    const manifest = pi => fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.2.0', pi }));
    manifest({}); fs.writeFileSync(path.join(pkg, 'CHANGELOG.md'), '# Changes\n\n## 1.2.0\n\n- Synthetic improvement.\n');
    const input = { cwd: root, scope: 'global', source: 'npm:fixture', expectedRevision: 'r1', expectedVersion: '1.2.0' };
    return { root, pkg, native, service, packages, manifest, input, read: changes => service.packageChangelog({ ...input, ...changes }),
        setRevision: value => { revision = value; }, untrust: () => { trusted = false; } };
}

test('installed package changelogs follow native manifest paths, opt-out and version/revision checks', async t => {
    const f = fixture(t), before = fs.readFileSync(path.join(f.pkg, 'package.json'));
    let result = await f.read();
    assert.equal(result.status, 'ready'); assert.equal(result.path, 'CHANGELOG.md');
    assert.equal(result.version, '1.2.0'); assert.match(result.content, /Synthetic improvement/);
    assert.match(result.revision, /^[a-f0-9]{64}$/); assert.deepEqual(fs.readFileSync(path.join(f.pkg, 'package.json')), before);
    await assert.rejects(f.read({ expectedVersion: '1.1.0' }), { status: 409 });
    await assert.rejects(f.read({ expectedRevision: 'stale' }), { status: 409 });
    await assert.rejects(f.read({ source: 'npm:foreign' }), /没有已安装/);
    await assert.rejects(f.read({ path: '/private/credentials' }), /请求无效/);
    fs.mkdirSync(path.join(f.pkg, 'docs'));
    fs.writeFileSync(path.join(f.pkg, 'docs/UPDATES.md'), '\uFEFF## 1.2.0\n\nCustom log.');
    f.manifest({ changelogPath: './docs/UPDATES.md' });
    result = await f.read(); assert.equal(result.path, 'docs/UPDATES.md'); assert.ok(result.content.startsWith('##'));
    f.manifest({ changelogPath: '' }); assert.equal((await f.read()).status, 'disabled');
    f.manifest({ changelogPath: 'MISSING.md' }); assert.equal((await f.read()).status, 'missing');
    f.packages[0].scope = 'project'; f.untrust();
    await assert.rejects(f.read({ scope: 'project' }), /信任/);
});

test('log reading rejects package escapes, symlinks, non-Markdown, oversized and invalid UTF-8 content', async t => {
    const f = fixture(t), secret = path.join(f.root, 'SECRET.md'); fs.writeFileSync(secret, 'PRIVATE_SENTINEL');
    const pointer = path.join(f.pkg, 'LINK.md'); fs.symlinkSync(secret, pointer);
    for (const changelogPath of ['../SECRET.md', secret, 'LINK.md', 'auth.json', 'docs\\SECRET.md']) {
        f.manifest({ changelogPath });
        await assert.rejects(f.read(), error => !error.message.includes('PRIVATE_SENTINEL') && !error.message.includes(f.root));
    }
    f.manifest({}); fs.writeFileSync(path.join(f.pkg, 'CHANGELOG.md'), 'x'.repeat(MAX_CHANGELOG_BYTES + 1));
    await assert.rejects(f.read(), { status: 413 });
    fs.writeFileSync(path.join(f.pkg, 'CHANGELOG.md'), Buffer.from([255, 254]));
    await assert.rejects(f.read(), /无法安全读取/);
});

test('changes during read are rejected and at most two reads reserve admission before awaits', async t => {
    const f = fixture(t), context = f.native.context;
    f.native.context = async () => { f.setRevision('r2'); return context(); };
    await assert.rejects(f.read(), { status: 409 });
    f.setRevision('r1'); f.native.context = context;
    const original = f.service.context, releases = [];
    f.service.context = async (...args) => { await new Promise(resolve => releases.push(resolve)); return original(...args); };
    const first = f.read(), second = f.read();
    await assert.rejects(f.read(), { status: 429 });
    for (const release of releases) release();
    assert.deepEqual((await Promise.all([first, second])).map(result => result.status), ['ready', 'ready']);
    assert.equal(f.service.changelogReads, 0);
});
