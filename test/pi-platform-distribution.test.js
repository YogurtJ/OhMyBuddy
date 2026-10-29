const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { generateKeyPairSync } = require('node:crypto');
const { atomicJson, hash } = require('../server/pi-maintenance-files');
const { collect } = require('../scripts/package-macos.cjs');
const { createArchive, verifyArchive } = require('../scripts/platform-archive.cjs');
const { runtimeEnvironment } = require('../server/pi-bundle-layout');
const { publish } = require('../scripts/publish-platform.cjs');
const { signedManifest, bundleName, assetUrl } = require('../server/pi-distribution');
function temp(t) { const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ohmybuddy-platform-'))); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }
function payload(root, platform, arch) {
    const pkg = { name: 'ohmybuddy', version: '1.11.1-rc.1', dependencies: { '@earendil-works/pi-coding-agent': '1.4.0' }, ohmybuddyBundle: { platform, arch, nodeVersion: '22.23.4' } };
    const files = { 'package.json': JSON.stringify(pkg), 'package-lock.json': JSON.stringify({ version: pkg.version, packages: { '': { version: pkg.version } } }), 'node_modules/@earendil-works/pi-coding-agent/package.json': '{"version":"1.4.0"}', 'server/pi-update-probe.js': 'probe', 'config/distribution.json': '{}', [platform === 'win32' ? 'runtime/node.exe' : 'runtime/bin/node']: 'node', ['bin/rg' + (platform === 'win32' ? '.exe' : '')]: 'rg', ['bin/fd' + (platform === 'win32' ? '.exe' : '')]: 'fd' };
    if (platform === 'win32') Object.assign(files, { 'runtime/git/bin/bash.exe': 'bash', 'runtime/git/cmd/git.exe': 'git', 'runtime/OhMyBuddyHost.exe': 'host' });
    files['nested/' + 'a'.repeat(95) + '/' + 'b'.repeat(65) + '/short.txt'] = 'deep ustar prefix split';
    for (const [name, value] of Object.entries(files)) { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, { mode: /^(runtime\/bin\/node|bin\/)/.test(name) ? 0o755 : 0o644 }); }
    const manifest = { version: 1, product: 'OhMyBuddy', appVersion: pkg.version, piVersion: '1.4.0', platform, arch, nodeVersion: '22.23.4', files: collect(root, platform) };
    atomicJson(path.join(root, 'OHMYBUDDY_BUNDLE.json'), manifest); return manifest;
}
test('cross-platform ustar writer preserves deep paths and Windows executable modes, and detects source changes', async t => {
    for (const [platform, arch] of [['linux', 'arm64'], ['linux', 'x64'], ['win32', 'x64']]) {
        const base = temp(t), root = path.join(base, 'payload'); fs.mkdirSync(root);
        const manifest = payload(root, platform, arch), file = path.join(base, 'release.tar.gz');
        await createArchive(root, bundleName(manifest.appVersion, platform, arch).replace(/\.tar\.gz$/, ''), manifest, file);
        assert.equal(verifyArchive(file, manifest.appVersion, platform, arch).platform, platform);
        fs.writeFileSync(path.join(root, 'package.json'), 'changed');
        await assert.rejects(createArchive(root, 'changed', manifest, path.join(base, 'changed.tar.gz')), /changed/);
    }
});
test('private Windows runtime PATH is canonical without replacing system identity or ProgramFiles', () => {
    const result = runtimeEnvironment('C:\\OhMyBuddy', { Path: 'legacy-path', SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files', USERPROFILE: 'C:\\Users\\fixture' }, 'win32');
    assert.equal(result.Path, undefined); assert.ok(result.PATH.includes('legacy-path')); assert.ok(result.PATH.includes('git')); assert.equal(result.ProgramFiles, 'C:\\Program Files'); assert.equal(result.USERPROFILE, 'C:\\Users\\fixture');
    assert.match(assetUrl({ url: 'https://example.test/ohmybuddy/' }, '1.11.1-rc.1', 'win32', 'x64'), /win32-x64.tar.gz$/);
    assert.throws(() => assetUrl({ url: 'https://example.test/' }, '1.11.1-rc.1', 'win32', 'arm64'));
});
test('publisher merges native platform receipts, signs matching installers and refuses overwrite or source confusion', t => {
    const base = temp(t), key = generateKeyPairSync('ed25519'), keyFile = path.join(base, 'key.pem'), destination = path.join(base, 'public');
    fs.writeFileSync(keyFile, key.privateKey.export({ format: 'pem', type: 'pkcs8' }));
    const keys = [{ id: 'fixture', pem: key.publicKey.export({ format: 'pem', type: 'spki' }).toString() }];
    function build(platform, arch, sourceCommit = 'a'.repeat(40)) {
        const dir = path.join(base, platform + arch + sourceCommit[0]); fs.mkdirSync(dir);
        const archive = bundleName('1.11.1-rc.1', platform, arch), bytes = Buffer.from('synthetic ' + platform + arch); fs.writeFileSync(path.join(dir, archive), bytes);
        const installerFile = platform === 'win32' ? archive.replace(/\.tar\.gz$/, '.exe') : archive;
        if (installerFile !== archive) fs.writeFileSync(path.join(dir, installerFile), bytes);
        const receipt = { version: '1.11.1-rc.1', product: 'OhMyBuddy', platform, arch, archive, bytes: bytes.length, sha256: hash(bytes), nodeVersion: '22.23.4', piVersion: '1.4.0', sourceCommit, installer: { file: installerFile, bytes: bytes.length, sha256: hash(bytes), kind: platform === 'win32' ? 'exe' : 'tar.gz' } };
        const file = path.join(dir, 'build.json'); atomicJson(file, receipt); return file;
    }
    const options = { keyFile, keyId: 'fixture', channel: 'preview', destination, assetPrefix: '/ohmybuddy/' };
    const first = build('linux', 'x64'); publish({ ...options, buildFile: first }); publish({ ...options, buildFile: build('win32', 'x64') });
    const envelope = JSON.parse(fs.readFileSync(path.join(destination, 'channels/preview.json'))), release = signedManifest(envelope, { keys }).releases[0];
    assert.equal(Object.keys(release.bundles).length, 2); assert.equal(release.installers['win32-x64'].kind, 'exe');
    assert.throws(() => publish({ ...options, buildFile: first }), /already exists/);
    assert.throws(() => publish({ ...options, buildFile: build('linux', 'arm64', 'b'.repeat(40)) }), /share source/);
    const html = fs.readFileSync(path.join(destination, 'index.html'), 'utf8'); assert.ok(html.includes('/ohmybuddy/releases/')); assert.ok(html.includes('OhMyBuddy'));
});
