'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { privateDir, readSafe, hashFileSafe, copySafe, atomicJson } = require('../server/pi-maintenance-files');
const { probeBundle } = require('../server/pi-platform-bundle');
function inspectPayload(source) {
    const manifest = JSON.parse(readSafe(require('../server/ohmybuddy-compat').metadataFile(source, 'BUNDLE'), 16 * 1024 ** 2));
    if (manifest.version !== 1 || !require('../server/ohmybuddy-compat').isProduct(manifest.product) || manifest.platform !== 'darwin' || manifest.arch !== process.arch
        || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 40000) throw Error('This installation is not built for this Mac');
    const listed = new Set(); let bytes = 0;
    for (const entry of manifest.files) {
        if (typeof entry.path !== 'string' || !entry.path || entry.path.includes('\\') || entry.path.split('/').some(part => !part || part === '.' || part === '..')
            || /[\x00-\x1f\x7f:]/.test(entry.path) || listed.has(entry.path.toLowerCase()) || ![0o644, 0o755].includes(entry.mode)
            || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || (bytes += entry.bytes) > 1024 ** 3) throw Error('Invalid installation manifest');
        listed.add(entry.path.toLowerCase());
        const proof = hashFileSafe(path.join(source, entry.path), 128 * 1024 ** 2);
        if (proof.sha256 !== entry.sha256 || proof.bytes !== entry.bytes) throw Error('Installation payload changed');
    }
    return manifest;
}
async function prepareInstallation({ source, root, agentDir, port = 11408, env = process.env, run }) {
    if (process.platform !== 'darwin') throw Error('The desktop installer requires macOS');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid instance port');
    source = fs.realpathSync.native(source); root = path.resolve(root);
    if (fs.existsSync(root)) {
        const record = JSON.parse(readSafe(require('../server/ohmybuddy-compat').metadataFile(root, 'INSTALLATION')));
        if (record.version !== 1 || !require('../server/ohmybuddy-compat').isProduct(record.product) || record.root !== fs.realpathSync.native(root)) throw Error('An unknown installation already exists at this location');
        return { root, existing: true, port: record.port };
    }
    const manifest = inspectPayload(source);
    if (!agentDir) {
        agentDir = execFileSync(path.join(source, 'runtime/bin/node'), [path.join(source, 'scripts/pi-agent-dir.cjs')], {
            cwd: source, env: { ...env, PATH: path.join(source, 'runtime/bin') + path.delimiter + (env.PATH || '') }, encoding: 'utf8', timeout: 30000
        }).trim();
    }
    for (const value of [root, agentDir]) if (!path.isAbsolute(value) || /[\r\n\x00]/.test(value) || value.trim() !== value) throw Error('Installation requires absolute single-line paths');
    privateDir(path.dirname(root));
    const staging = root + '.installing';
    fs.mkdirSync(staging, { mode: 0o700 }); // Also reserves first installation; never adopt a failed or concurrent one.
    const budget = { bytes: 0, files: 0, maxBytes: 1024 ** 3, maxFiles: 40001 };
    for (const entry of [...manifest.files, { path: path.basename(require('../server/ohmybuddy-compat').metadataFile(source, 'BUNDLE')), mode: 0o644 }]) {
        const target = path.join(staging, entry.path); privateDir(path.dirname(target));
        const result = copySafe(path.join(source, entry.path), target, budget);
        if (entry.sha256 && (result.sha256 !== entry.sha256 || result.bytes !== entry.bytes)) throw Error('Payload changed during installation');
        if (entry.mode === 0o755) fs.chmodSync(target, 0o700);
    }
    await probeBundle(staging, manifest, { env, run });
    const data = path.join(root, 'data');
    const config = { PORT: String(port), HOST: '127.0.0.1', PI_CODING_AGENT_DIR: agentDir, PI_PROJECT_ROOTS: '/',
        PI_MEDIA_CONFIG_DIR: path.join(data, 'media-lab'), PI_MEDIA_DATA_DIR: path.join(data, 'media'),
        PI_WEB_DEFERRED_FILE: path.join(data, 'ohmybuddy-deferred-messages.json'), PI_WORKSPACE_BASE_URL: `http://127.0.0.1:${port}` };
    fs.writeFileSync(path.join(staging, '.env'), Object.entries(config).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
    atomicJson(path.join(staging, 'OHMYBUDDY_INSTALLATION.json'), { version: 1, product: 'OhMyBuddy', root, port, installedVersion: manifest.appVersion, createdAt: new Date().toISOString() });
    if (fs.existsSync(root)) throw Error('Installation destination appeared; retained prepared files');
    fs.renameSync(staging, root);
    return { root, port, existing: false };
}
async function main() {
    if (process.argv.length !== 3) throw Error('Usage: macos-bootstrap.cjs /path/to/verified/payload');
    const support = path.join(os.homedir(), 'Library/Application Support');
    const source = path.resolve(process.argv[2]), root = path.join(support, require('../server/ohmybuddy-compat').selectName(support, ['OhMyBuddy', 'Pivane']), 'desktop');
    const result = await prepareInstallation({ source, root });
    const serviceFile = path.join(require('../server/ohmybuddy-compat').runtimeDirectory(root), 'service/installation.json');
    if (!fs.existsSync(serviceFile)) {
        execFileSync(path.join(root, 'runtime/bin/node'), [path.join(root, 'scripts/install-service.cjs'), '--no-shortcut'], {
            cwd: root, env: { ...process.env, PATH: [path.join(root, 'bin'), path.join(root, 'runtime/bin'), process.env.PATH || ''].join(path.delimiter) }, stdio: 'inherit', timeout: 180000
        });
    }
    const service = JSON.parse(readSafe(serviceFile));
    if (service.platform !== 'darwin' || service.phase !== 'http-ready') throw Error('Installation was retained, but startup is unconfirmed. Inspect the service log before trying again.');
    const label = path.basename(service.service, '.plist');
    if (!['app.ohmybuddy.', 'app.pivane.'].some(prefix => label === prefix + service.id)) throw Error('Unexpected service identity');
    // A subsequent click starts the registered instance if it was stopped.
    try { execFileSync('/bin/launchctl', ['kickstart', `gui/${process.getuid()}/${label}`], { stdio: 'ignore', timeout: 15000 }); } catch { /* Readiness below is authoritative. */ }
    const response = await fetch(`http://127.0.0.1:${result.port}/api/access/status`, { signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) throw Error('The registered OhMyBuddy instance did not become ready');
    execFileSync('/usr/bin/open', [`http://127.0.0.1:${result.port}`]);
}
if (require.main === module) main().catch(error => {
    console.error(error.message);
    // argv prevents shell/AppleScript interpolation of filenames or diagnostics.
    try { execFileSync('/usr/bin/osascript', ['-e', 'on run argv\ndisplay alert "OhMyBuddy" message (item 1 of argv) as warning\nend run', error.message], { stdio: 'ignore', timeout: 60000 }); } catch {}
    process.exitCode = 1;
});
module.exports = { inspectPayload, prepareInstallation };
