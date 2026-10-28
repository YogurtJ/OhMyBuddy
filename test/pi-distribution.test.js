'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { generateKeyPairSync, sign } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { signedManifest, assetUrl, baseUrl } = require('../server/pi-distribution');
const { unpackBundle, validBundle, runtimeNode } = require('../server/pi-platform-bundle');
const { hash } = require('../server/pi-maintenance-files');
const { download } = require('../server/pi-application-installer');
const { UpdateService } = require('../server/pi-update-service');
const key = generateKeyPairSync('ed25519');
const config = { version: 1, channel: 'preview', url: 'https://downloads.example:8443/pivane/', keys: [{ id: 'test', pem: key.publicKey.export({ format: 'pem', type: 'spki' }).toString() }] };
const now = Date.now();
function payload() { return { version: 1, product: 'Pivane', channel: 'preview', generatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 86400000).toISOString(),
    releases: [{ version: '1.11.0-rc.2', piVersion: '1.4.0', notes: 'Synthetic update', bundles: { 'darwin-arm64': { sha256: 'a'.repeat(64), bytes: 42, nodeVersion: '22.23.4' } } }] }; }
function envelope(data) { const bytes = Buffer.from(JSON.stringify(data)); return { version: 1, keyId: 'test', payload: bytes.toString('base64'), signature: sign(null, bytes, key.privateKey).toString('base64') }; }
function archive(extra = {}, mutate = () => {}) {
    const pkg = { name: 'pivane', version: '1.11.0-rc.2', dependencies: { '@earendil-works/pi-coding-agent': '1.4.0' }, pivaneBundle: { platform: 'darwin', arch: 'arm64', nodeVersion: '22.23.4' } };
    const values = { 'package.json': JSON.stringify(pkg), 'package-lock.json': JSON.stringify({ version: pkg.version, packages: { '': { version: pkg.version } } }),
        'node_modules/@earendil-works/pi-coding-agent/package.json': '{"version":"1.4.0"}', 'runtime/bin/node': 'synthetic-node', 'bin/rg': 'synthetic-rg', 'bin/fd': 'synthetic-fd',
        'server/pi-update-probe.js': 'synthetic-probe', 'config/distribution.json': JSON.stringify(config), ...extra };
    const files = Object.entries(values).map(([name, text]) => ({ path: name, bytes: Buffer.byteLength(text), sha256: hash(Buffer.from(text)), mode: /^(runtime\/bin\/node|bin\/rg|bin\/fd)$/.test(name) ? 0o755 : 0o644 }));
    const manifest = { version: 1, product: 'Pivane', appVersion: pkg.version, piVersion: '1.4.0', platform: 'darwin', arch: 'arm64', nodeVersion: '22.23.4', files };
    mutate(manifest);
    values['PIVANE_BUNDLE.json'] = JSON.stringify(manifest);
    const blocks = [];
    for (const [name, value] of Object.entries(values)) {
        const bytes = Buffer.from(value), header = Buffer.alloc(512), full = 'pivane-1.11.0-rc.2-darwin-arm64/' + name;
        const split = full.lastIndexOf('/'); header.write(full.slice(split + 1)); header.write(full.slice(0, split), 345);
        header.write((files.find(file => file.path === name)?.mode || 0o644).toString(8).padStart(7, '0') + '\0', 100);
        header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124); header.fill(32, 148, 156); header.write('0', 156);
        header.write(header.reduce((sum, value) => sum + value, 0).toString(8).padStart(6, '0') + '\0 ', 148);
        blocks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
    }
    return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}
function directory(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bundle-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return path.join(root, 'release'); }
test('signed distribution rejects tampering, expired feeds, channel confusion and invalid platform metadata', () => {
    assert.equal(signedManifest(envelope(payload()), config, { now }).releases[0].version, '1.11.0-rc.2');
    const bad = envelope(payload()); bad.payload = Buffer.from('{}').toString('base64'); assert.throws(() => signedManifest(bad, config, { now }), /signature/);
    for (const mutate of [p => p.expiresAt = new Date(now - 1).toISOString(), p => p.channel = 'stable', p => p.releases[0].version = '../bad',
        p => p.releases[0].bundles['darwin-arm64'].bytes = 1024 ** 3, p => p.releases[0].bundles['darwin-arm64'].nodeVersion = '26.1.0']) {
        const p = payload(); mutate(p); assert.throws(() => signedManifest(envelope(p), config, { now }));
    }
    assert.equal(assetUrl(config, '1.11.0-rc.2', 'darwin', 'arm64'), config.url + 'releases/v1.11.0-rc.2/pivane-1.11.0-rc.2-darwin-arm64.tar.gz');
    for (const url of ['http://example/', 'https://user:password@example/', 'https://example/?url=bad']) assert.throws(() => baseUrl(url));
});
test('distribution checks use only the signed origin for both application and paired Pi, never GitHub/npm', async () => {
    const calls = [];
    const service = new UpdateService({ env: {}, distribution: config, platform: 'darwin', arch: 'arm64', appVersion: '1.11.0-rc.1', piVersion: '1.4.0', now: () => now,
        fetch: async url => { calls.push(url); return { ok: true, json: async () => envelope(payload()) }; } });
    const result = await service.check();
    assert.equal(result.channel, 'preview'); assert.equal(result.pivane.status, 'available'); assert.equal(result.pi.status, 'current');
    assert.equal(result.pivane.release.bundle.bytes, 42); assert.deepEqual(calls, [config.url + 'channels/preview.json']);
});
test('platform unpack verifies every file before writing, preserves executable tools and rejects wrong architecture/private paths', t => {
    const root = directory(t);
    const manifest = unpackBundle(archive(), { version: '1.11.0-rc.2', platform: 'darwin', arch: 'arm64' }, root);
    assert.equal(manifest.piVersion, '1.4.0'); if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(root, 'runtime/bin/node')).mode & 0o777, 0o700);
    for (const bytes of [archive({ '.env': 'private' }), archive({ '../escape': 'bad' }), archive({}, m => m.files[0].sha256 = '0'.repeat(64))]) {
        const dest = directory(t); assert.throws(() => unpackBundle(bytes, { version: '1.11.0-rc.2', platform: 'darwin', arch: 'arm64' }, dest)); assert.equal(fs.existsSync(dest), false);
    }
    assert.throws(() => unpackBundle(archive(), { version: '1.11.0-rc.2', platform: 'darwin', arch: 'x64' }, directory(t)));
    assert.equal(validBundle({ bundle: { platform: 'darwin', arch: 'arm64', bytes: 42 } }, 'darwin', 'arm64'), true);
    assert.equal(validBundle({ bundle: { platform: 'darwin', arch: 'arm64', bytes: 42 } }, 'linux', 'arm64'), false);
    assert.equal(runtimeNode(root, { runtimeNodeSha256: hash(Buffer.from('synthetic-node')) }), path.join(root, 'runtime/bin/node'));
    assert.throws(() => runtimeNode(root, { runtimeNodeSha256: '0'.repeat(64) }), /changed/);
});
test('platform download rejects a redirect outside the pinned distribution origin before sending a second request', async () => {
    let calls = 0;
    await assert.rejects(download(config.url + 'release', { env: {}, distributionOrigin: new URL(config.url).origin,
        request: async () => { calls++; return { status: 302, body: { destroy() {} }, headers: { get: () => 'https://evil.invalid/payload' } }; } }), /Untrusted/);
    assert.equal(calls, 1);
});
