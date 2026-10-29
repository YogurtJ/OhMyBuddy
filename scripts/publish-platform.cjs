'use strict';
const fs = require('node:fs'), path = require('node:path');
const { createPrivateKey, createPublicKey, sign, randomUUID } = require('node:crypto');
const { readSafe, hashFileSafe, inside } = require('../server/pi-maintenance-files');
const { signedManifest, bundleName, VERSION } = require('../server/pi-distribution');
const { supported } = require('../server/pi-bundle-layout');
const { compareVersions } = require('../server/pi-update-service');
function publicJson(file, data) {
    const temporary = file + '.' + randomUUID() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o644 }); fs.renameSync(temporary, file);
}
function publish({ buildFile, keyFile, keyId, channel, destination, notes = '', assetPrefix = '' }) {
    destination = path.resolve(destination); keyFile = fs.realpathSync.native(keyFile);
    if (inside(destination, keyFile) || !['stable', 'preview'].includes(channel) || !/^[a-z0-9-]{1,64}$/.test(keyId) || notes.length > 20000 || !/^[a-z0-9/_-]*$/i.test(assetPrefix)) throw Error('Invalid publication arguments or private signing-key location');
    const build = JSON.parse(readSafe(buildFile)), source = path.dirname(buildFile), product = build.product || 'Pivane';
    const name = bundleName(build.version, build.platform, build.arch, product), target = `${build.platform}-${build.arch}`;
    if (!VERSION.test(build.version) || !supported(build.platform, build.arch) || build.archive !== name || channel === 'stable' && build.version.includes('-')) throw Error('Invalid platform build receipt');
    const archive = path.join(source, name), proof = hashFileSafe(archive, 512 * 1024 ** 2);
    if (proof.sha256 !== build.sha256 || proof.bytes !== build.bytes) throw Error('Platform build changed');
    const candidate = build.installer || (build.dmg ? { ...build.dmg, kind: 'dmg', codeSigned: false } : null);
    let installer = null;
    if (candidate) {
        const extension = build.platform === 'darwin' ? '.dmg' : build.platform === 'win32' ? '.exe' : '.tar.gz';
        const expected = name.replace(/\.tar\.gz$/, extension), file = path.join(source, expected), check = hashFileSafe(file, 1024 ** 3);
        if (candidate.file !== expected || candidate.kind !== extension.slice(1) || candidate.sha256 !== check.sha256 || candidate.bytes !== check.bytes) throw Error('Installer asset changed');
        installer = { file: expected, kind: candidate.kind, ...check, codeSigned: candidate.codeSigned === true, ...(build.dmg ? { notarized: build.dmg.notarized === true } : {}) };
    }
    const privateKey = createPrivateKey(readSafe(keyFile, 64 * 1024)); if (privateKey.asymmetricKeyType !== 'ed25519') throw Error('Publication requires Ed25519');
    const keys = [{ id: keyId, pem: createPublicKey(privateKey).export({ format: 'pem', type: 'spki' }).toString() }];
    const channelFile = path.join(destination, 'channels', channel + '.json'); let releases = [];
    if (fs.existsSync(channelFile)) {
        const previous = JSON.parse(readSafe(channelFile)), date = Date.parse(JSON.parse(Buffer.from(previous.payload, 'base64').toString()).generatedAt);
        const verified = signedManifest(previous, { keys }, { now: date });
        if (verified.product !== product) throw Error('Do not mix product envelopes; use an explicit legacy bridge or a separate new-brand channel');
        releases = verified.releases;
    }
    if (releases.some(release => release.version === build.version && release.bundles[target])) throw Error('Published version already exists; never overwrite a release');
    let release = releases.find(item => item.version === build.version);
    if (release && (release.piVersion !== build.piVersion || release.sourceCommit && release.sourceCommit !== build.sourceCommit)) throw Error('Platform builds of one release must share source and Pi identities');
    const releaseDir = path.join(destination, 'releases', 'v' + build.version);
    fs.mkdirSync(releaseDir, { recursive: true, mode: 0o755 }); fs.mkdirSync(path.dirname(channelFile), { recursive: true, mode: 0o755 });
    function copy(file, sha256) {
        fs.copyFileSync(path.join(source, file), path.join(releaseDir, file), fs.constants.COPYFILE_EXCL); fs.chmodSync(path.join(releaseDir, file), 0o644);
        fs.writeFileSync(path.join(releaseDir, file + '.sha256'), `${sha256}  ${file}\n`, { flag: 'wx', mode: 0o644 });
    }
    copy(name, proof.sha256); if (installer && installer.file !== name) copy(installer.file, installer.sha256);
    if (!release) { release = { version: build.version, piVersion: build.piVersion, notes, sourceCommit: build.sourceCommit || null, bundles: {}, installers: {} }; releases.push(release); }
    release.bundles[target] = { sha256: build.sha256, bytes: build.bytes, nodeVersion: build.nodeVersion };
    if (installer) { release.installers ||= {}; release.installers[target] = installer; }
    releases.sort((a, b) => compareVersions(b.version, a.version));
    const now = Date.now(), manifest = { version: 1, product, channel, generatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30 * 86400000).toISOString(), releases };
    const bytes = Buffer.from(JSON.stringify(manifest)), envelope = { version: 1, keyId, payload: bytes.toString('base64'), signature: sign(null, bytes, privateKey).toString('base64') };
    signedManifest(envelope, { keys });
    const receipt = path.join(releaseDir, 'build-' + target + '.json'); if (fs.existsSync(receipt)) throw Error('Platform receipt already exists');
    publicJson(receipt, build); publicJson(channelFile, envelope);
    const html = require('./download-site.cjs').renderSite({ releases, channel, product, assetPrefix });
    const index = path.join(destination, 'index.html'), temporary = index + '.' + randomUUID() + '.tmp'; fs.writeFileSync(temporary, html, { flag: 'wx', mode: 0o644 }); fs.renameSync(temporary, index);
    return { version: build.version, channel, target, archiveSha256: build.sha256, expiresAt: manifest.expiresAt };
}
if (require.main === module) {
    const args = process.argv.slice(2), values = {};
    for (let i = 0; i < args.length; i += 2) { if (!['--build', '--key', '--key-id', '--channel', '--destination', '--notes', '--asset-prefix'].includes(args[i]) || !args[i + 1] || values[args[i]]) throw Error('Invalid publication arguments'); values[args[i]] = args[i + 1]; }
    if (!['--build', '--key', '--key-id', '--channel', '--destination'].every(key => values[key])) throw Error('Missing publication arguments');
    console.log(JSON.stringify(publish({ buildFile: path.resolve(values['--build']), keyFile: path.resolve(values['--key']), keyId: values['--key-id'], channel: values['--channel'], destination: values['--destination'], notes: values['--notes'] || '', assetPrefix: values['--asset-prefix'] || '' }), null, 2));
}
module.exports = { publish };
