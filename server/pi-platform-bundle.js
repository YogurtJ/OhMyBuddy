'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseArchive } = require('./pi-release-archive');
const { privateDir, readSafe, atomicJson, hash, hashFileSafe } = require('./pi-maintenance-files');
const { supported, nodePath, toolPath, runtimeEnvironment } = require('./pi-bundle-layout');
const { MAX_BUNDLE, VERSION, bundleName, assetUrl, configuration } = require('./pi-distribution');
function validBundle(release, platform = process.platform, arch = process.arch) {
    const bundle = release?.bundle;
    return bundle && supported(platform, arch) && bundle.platform === platform && bundle.arch === arch && Number.isSafeInteger(bundle.bytes) && bundle.bytes > 0 && bundle.bytes <= MAX_BUNDLE && (bundle.product === undefined || require('./ohmybuddy-compat').isProduct(bundle.product));
}
function verifyManifest(manifest, entries, { version, platform, arch, product }) {
    const expectedProduct = product || manifest?.product;
    const manifestName = expectedProduct === 'OhMyBuddy' ? 'OHMYBUDDY_BUNDLE.json' : 'PIVANE_BUNDLE.json';
    if (manifest?.version !== 1 || !require('./ohmybuddy-compat').isProduct(manifest.product) || manifest.product !== expectedProduct || manifest.appVersion !== version
        || manifest.platform !== platform || manifest.arch !== arch || !supported(platform, arch)
        || !/^22\.(\d+)\.\d+$/.test(manifest.nodeVersion) || Number(manifest.nodeVersion.split('.')[1]) < 19
        || !Array.isArray(manifest.files) || manifest.files.length !== entries.size - 1) throw Error('Platform bundle identity mismatch');
    if (!entries.has(manifestName) || entries.has(expectedProduct === 'OhMyBuddy' ? 'PIVANE_BUNDLE.json' : 'OHMYBUDDY_BUNDLE.json')) throw Error('Conflicting platform manifest identity');
    const listed = new Set();
    for (const entry of manifest.files) {
        const file = entries.get(entry.path);
        if (!file || listed.has(entry.path) || ['OHMYBUDDY_BUNDLE.json', 'PIVANE_BUNDLE.json'].includes(entry.path) || ![0o644, 0o755].includes(entry.mode)
            || file.mode !== entry.mode || entry.bytes !== file.bytes.length || hash(file.bytes) !== entry.sha256) throw Error('Platform bundle integrity mismatch');
        listed.add(entry.path);
    }
    for (const name of entries.keys()) if ((/^\.env(?:$|\.)/.test(name) && name !== '.env.example')
        || /^(?:auth\.json|(?:OHMYBUDDY|PIVANE)_INSTALLATION\.json|PI_.*\.json)$/.test(name)
        || /^(?:\.git|\.(?:ohmybuddy|pivane)-runtime|backups)(?:\/|$)/.test(name)
        || /^public\/(?:images|videos|audio)\//.test(name)) throw Error('Platform bundle contains user data');
    const executables = [platform === 'win32' ? 'runtime/node.exe' : 'runtime/bin/node', toolPath('rg', platform), toolPath('fd', platform)];
    if (platform === 'win32') executables.push('runtime/git/bin/bash.exe', 'runtime/git/cmd/git.exe', 'runtime/OhMyBuddyHost.exe');
    for (const file of [...executables, 'server/pi-update-probe.js', 'config/distribution.json']) if (!listed.has(file)) throw Error('Incomplete platform bundle');
    for (const file of executables) if (entries.get(file).mode !== 0o755) throw Error('Platform tool is not executable');
    const pkg = JSON.parse(entries.get('package.json')?.bytes.toString() || 'null');
    const lock = JSON.parse(entries.get('package-lock.json')?.bytes.toString() || 'null');
    const pi = JSON.parse(entries.get('node_modules/@earendil-works/pi-coding-agent/package.json')?.bytes.toString() || 'null');
    if (pkg?.name !== (expectedProduct === 'OhMyBuddy' ? 'ohmybuddy' : 'pivane') || pkg.version !== version || lock?.version !== version || lock.packages?.['']?.version !== version
        || pkg.dependencies?.['@earendil-works/pi-coding-agent'] !== manifest.piVersion || pi?.version !== manifest.piVersion
        || require('./ohmybuddy-compat').packageMetadata(pkg, 'Bundle')?.platform !== platform || require('./ohmybuddy-compat').packageMetadata(pkg, 'Bundle')?.arch !== arch || require('./ohmybuddy-compat').packageMetadata(pkg, 'Bundle')?.nodeVersion !== manifest.nodeVersion) throw Error('Platform package identity mismatch');
    return manifest;
}
function unpackBundle(bytes, { version, platform = process.platform, arch = process.arch, product = 'OhMyBuddy' }, directory) {
    if (!VERSION.test(version) || bytes.length > MAX_BUNDLE) throw Error('Invalid platform archive');
    const entries = parseArchive(bytes, { prefix: bundleName(version, platform, arch, product).replace(/\.tar\.gz$/, '') + '/', maxExpanded: 1024 ** 3, maxFile: 128 * 1024 ** 2, maxFiles: 40000 });
    const manifest = verifyManifest(JSON.parse(entries.get(product === 'OhMyBuddy' ? 'OHMYBUDDY_BUNDLE.json' : 'PIVANE_BUNDLE.json')?.bytes.toString() || 'null'), entries, { version, platform, arch, product });
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
    const node = nodePath(directory);
    if (hashFileSafe(node, 128 * 1024 ** 2).sha256 !== marker.runtimeNodeSha256) throw Error('Private runtime changed');
    return node;
}
async function probeBundle(directory, manifest, { env = process.env, signal, run = require('./pi-update-installer').runNode, onOutput, secretEnv = env } = {}) {
    const probe = privateDir(path.join(directory, 'probe-data'));
    const probeEnv = {};
    for (const key of ['HOME', 'USERPROFILE', 'SystemRoot', 'LANG', 'TMPDIR', 'TEMP', 'TMP']) if (env[key]) probeEnv[key] = env[key];
    Object.assign(probeEnv, runtimeEnvironment(directory, probeEnv), {
        PI_UPDATE_PROBE: probe, PI_CODING_AGENT_DIR: path.join(probe, 'agent'), PI_PROJECT_ROOTS: probe,
        PI_MEDIA_DATA_DIR: path.join(probe, 'media'), PI_MEDIA_CONFIG_DIR: path.join(probe, 'agent/media-lab'), PI_WEB_DEFERRED_FILE: path.join(probe, 'deferred.json'),
        PI_OFFLINE: '1', PI_TELEMETRY: '0', PI_SKIP_VERSION_CHECK: '1', PI_WORKSPACE_BASE_URL: 'http://127.0.0.1:1' });
    if (manifest.platform === 'win32') {
        const program = `const cp=require('node:child_process'),assert=require('node:assert/strict');assert.match(cp.execFileSync(${JSON.stringify(path.join(directory, 'runtime/git/bin/bash.exe'))},['-c','printf bundled-bash-ready'],{encoding:'utf8'}),/bundled-bash-ready/);cp.execFileSync(${JSON.stringify(path.join(directory, 'runtime/git/cmd/git.exe'))},['--version']);`;
        await run(['-e', program], { cwd: probe, env: probeEnv, timeout: 30000, signal, onOutput, secretEnv, executable: nodePath(directory) });
    }
    await run([path.join(directory, 'server/pi-update-probe.js')], { cwd: probe, env: probeEnv, timeout: 90000, signal, onOutput, secretEnv, executable: nodePath(directory) });
    atomicJson(path.join(directory, 'PI_INSTALL_COMPLETE.json'), { version: manifest.piVersion, appVersion: manifest.appVersion,
        runtimeNodeSha256: hashFileSafe(nodePath(directory), 128 * 1024 ** 2).sha256,
        completedAt: new Date().toISOString(), lockSha256: hash(readSafe(path.join(directory, 'package-lock.json'), 16 * 1024 ** 2)) });
}
async function stageBundle({ root, directory, release, env = process.env, signal, run, get = require('./pi-application-installer').download, progress = () => {}, onOutput }) {
    if (!validBundle(release)) throw Error('Unsupported platform bundle');
    const config = configuration(env, root);
    if (!config) throw Error('Platform distribution is not configured');
    progress('downloading');
    const url = assetUrl(config, release.version, release.bundle.platform, release.bundle.arch, release.bundle.product || 'OhMyBuddy');
    const bytes = await get(url, { env, signal, maxBytes: release.bundle.bytes, distributionOrigin: new URL(config.url).origin });
    if (bytes.length !== release.bundle.bytes || hash(bytes) !== release.sha256) throw Error('Platform archive SHA256 mismatch');
    progress('unpacking');
    const manifest = unpackBundle(bytes, { version: release.version, product: release.bundle.product || 'OhMyBuddy' }, directory);
    progress('verifying');
    await probeBundle(directory, manifest, { env, signal, run, onOutput });
    const markerPath = path.join(directory, 'PI_INSTALL_COMPLETE.json'), marker = JSON.parse(readSafe(markerPath));
    atomicJson(markerPath, { ...marker, archiveSha256: release.sha256 });
    return directory;
}
module.exports = { validBundle, verifyManifest, unpackBundle, runtimeNode, probeBundle, stageBundle };
