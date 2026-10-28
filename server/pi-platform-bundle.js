'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseArchive } = require('./pi-release-archive');
const { privateDir, readSafe, atomicJson, hash, hashFileSafe } = require('./pi-maintenance-files');
const { MAX_BUNDLE, VERSION, bundleName, assetUrl, configuration } = require('./pi-distribution');
function validBundle(release, platform = process.platform, arch = process.arch) {
    const bundle = release?.bundle;
    return bundle && platform === 'darwin' && bundle.platform === platform && bundle.arch === arch
        && ['arm64', 'x64'].includes(arch) && Number.isSafeInteger(bundle.bytes) && bundle.bytes > 0 && bundle.bytes <= MAX_BUNDLE;
}
function verifyManifest(manifest, entries, { version, platform, arch }) {
    if (manifest?.version !== 1 || manifest.product !== 'Pivane' || manifest.appVersion !== version
        || manifest.platform !== platform || manifest.arch !== arch || platform !== 'darwin' || !['arm64', 'x64'].includes(arch)
        || !/^22\.(\d+)\.\d+$/.test(manifest.nodeVersion) || Number(manifest.nodeVersion.split('.')[1]) < 19
        || !Array.isArray(manifest.files) || manifest.files.length !== entries.size - 1) throw Error('Platform bundle identity mismatch');
    const listed = new Set();
    for (const entry of manifest.files) {
        const file = entries.get(entry.path);
        if (!file || listed.has(entry.path) || entry.path === 'PIVANE_BUNDLE.json' || ![0o644, 0o755].includes(entry.mode)
            || file.mode !== entry.mode || entry.bytes !== file.bytes.length || hash(file.bytes) !== entry.sha256) throw Error('Platform bundle integrity mismatch');
        listed.add(entry.path);
    }
    for (const name of entries.keys()) if ((/^\.env(?:$|\.)/.test(name) && name !== '.env.example')
        || /^(?:auth\.json|PIVANE_INSTALLATION\.json|\.git(?:\/|$)|\.pivane-runtime(?:\/|$)|backups(?:\/|$)|PI_.*\.json)$/.test(name)
        || /^public\/(?:images|videos|audio)\//.test(name)) throw Error('Platform bundle contains user data');
    for (const file of ['runtime/bin/node', 'bin/rg', 'bin/fd', 'server/pi-update-probe.js', 'config/distribution.json']) if (!listed.has(file)) throw Error('Incomplete platform bundle');
    for (const file of ['runtime/bin/node', 'bin/rg', 'bin/fd']) if (entries.get(file).mode !== 0o755) throw Error('Platform tool is not executable');
    const pkg = JSON.parse(entries.get('package.json')?.bytes.toString() || 'null');
    const lock = JSON.parse(entries.get('package-lock.json')?.bytes.toString() || 'null');
    const pi = JSON.parse(entries.get('node_modules/@earendil-works/pi-coding-agent/package.json')?.bytes.toString() || 'null');
    if (pkg?.name !== 'pivane' || pkg.version !== version || lock?.version !== version || lock.packages?.['']?.version !== version
        || pkg.dependencies?.['@earendil-works/pi-coding-agent'] !== manifest.piVersion || pi?.version !== manifest.piVersion
        || pkg.pivaneBundle?.platform !== platform || pkg.pivaneBundle?.arch !== arch || pkg.pivaneBundle?.nodeVersion !== manifest.nodeVersion) throw Error('Platform package identity mismatch');
    return manifest;
}
function unpackBundle(bytes, { version, platform = process.platform, arch = process.arch }, directory) {
    if (!VERSION.test(version) || bytes.length > MAX_BUNDLE) throw Error('Invalid platform archive');
    const entries = parseArchive(bytes, { prefix: bundleName(version, platform, arch).replace(/\.tar\.gz$/, '') + '/', maxExpanded: 1024 ** 3, maxFile: 128 * 1024 ** 2, maxFiles: 40000 });
    const manifest = verifyManifest(JSON.parse(entries.get('PIVANE_BUNDLE.json')?.bytes.toString() || 'null'), entries, { version, platform, arch });
    privateDir(directory);
    // All content is authenticated and checked before any entry is extracted.
    for (const [name, file] of entries) {
        const target = path.join(directory, name); privateDir(path.dirname(target));
        fs.writeFileSync(target, file.bytes, { flag: 'wx', mode: file.mode === 0o755 ? 0o700 : 0o600 });
    }
    return manifest;
}
function runtimeNode(directory, marker) {
    if (!marker?.runtimeNodeSha256) return process.execPath;
    const node = path.join(directory, 'runtime/bin/node');
    if (hashFileSafe(node, 128 * 1024 ** 2).sha256 !== marker.runtimeNodeSha256) throw Error('Private runtime changed');
    return node;
}
async function probeBundle(directory, manifest, { env = process.env, signal, run = require('./pi-update-installer').runNode, onOutput, secretEnv = env } = {}) {
    const probe = privateDir(path.join(directory, 'probe-data'));
    const probeEnv = {};
    for (const key of ['HOME', 'USERPROFILE', 'SystemRoot', 'LANG', 'TMPDIR', 'TEMP', 'TMP']) if (env[key]) probeEnv[key] = env[key];
    Object.assign(probeEnv, { PATH: [path.join(directory, 'bin'), path.join(directory, 'runtime/bin'), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(path.delimiter),
        PI_UPDATE_PROBE: probe, PI_CODING_AGENT_DIR: path.join(probe, 'agent'), PI_PROJECT_ROOTS: probe,
        PI_MEDIA_DATA_DIR: path.join(probe, 'media'), PI_MEDIA_CONFIG_DIR: path.join(probe, 'agent/media-lab'), PI_WEB_DEFERRED_FILE: path.join(probe, 'deferred.json'),
        PI_OFFLINE: '1', PI_TELEMETRY: '0', PI_SKIP_VERSION_CHECK: '1', PI_WORKSPACE_BASE_URL: 'http://127.0.0.1:1' });
    await run([path.join(directory, 'server/pi-update-probe.js')], { cwd: probe, env: probeEnv, timeout: 90000, signal, onOutput, secretEnv, executable: path.join(directory, 'runtime/bin/node') });
    atomicJson(path.join(directory, 'PI_INSTALL_COMPLETE.json'), { version: manifest.piVersion, appVersion: manifest.appVersion,
        runtimeNodeSha256: hashFileSafe(path.join(directory, 'runtime/bin/node'), 128 * 1024 ** 2).sha256,
        completedAt: new Date().toISOString(), lockSha256: hash(readSafe(path.join(directory, 'package-lock.json'), 16 * 1024 ** 2)) });
}
async function stageBundle({ root, directory, release, env = process.env, signal, run, get = require('./pi-application-installer').download, progress = () => {}, onOutput }) {
    if (!validBundle(release)) throw Error('Unsupported platform bundle');
    const config = configuration(env, root);
    if (!config) throw Error('Platform distribution is not configured');
    progress('downloading');
    const url = assetUrl(config, release.version, release.bundle.platform, release.bundle.arch);
    const bytes = await get(url, { env, signal, maxBytes: release.bundle.bytes, distributionOrigin: new URL(config.url).origin });
    if (bytes.length !== release.bundle.bytes || hash(bytes) !== release.sha256) throw Error('Platform archive SHA256 mismatch');
    progress('unpacking');
    const manifest = unpackBundle(bytes, { version: release.version }, directory);
    progress('verifying');
    await probeBundle(directory, manifest, { env, signal, run, onOutput });
    const markerPath = path.join(directory, 'PI_INSTALL_COMPLETE.json'), marker = JSON.parse(readSafe(markerPath));
    atomicJson(markerPath, { ...marker, archiveSha256: release.sha256 });
    return directory;
}
module.exports = { validBundle, verifyManifest, unpackBundle, runtimeNode, probeBundle, stageBundle };
