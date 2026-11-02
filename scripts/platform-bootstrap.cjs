'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const { privateDir, readSafe, hashFileSafe, copySafe, atomicJson } = require('../server/pi-maintenance-files');
const compat = require('../server/ohmybuddy-compat');
const { supported, nodePath, runtimeEnvironment } = require('../server/pi-bundle-layout');
function inspectPayload(source, onProgress = () => {}) {
    const manifest = JSON.parse(readSafe(compat.metadataFile(source, 'BUNDLE'), 16 * 1024 ** 2));
    if (manifest.version !== 1 || !compat.isProduct(manifest.product) || manifest.platform !== process.platform || manifest.arch !== process.arch || !supported(process.platform, process.arch)
        || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 40000) throw Error('This installation is not built for this computer');
    const listed = new Set(); let bytes = 0;
    let completed = 0;
    for (const entry of manifest.files) {
        if (typeof entry.path !== 'string' || !entry.path || entry.path.includes('\\') || entry.path.split('/').some(part => !part || part === '.' || part === '..')
            || /[\x00-\x1f\x7f:]/.test(entry.path) || listed.has(entry.path.toLowerCase()) || ![0o644, 0o755].includes(entry.mode)
            || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || (bytes += entry.bytes) > 1024 ** 3) throw Error('Invalid installation manifest');
        listed.add(entry.path.toLowerCase());
        const proof = hashFileSafe(path.join(source, entry.path), 128 * 1024 ** 2);
        if (proof.sha256 !== entry.sha256 || proof.bytes !== entry.bytes) throw Error('Installation payload changed');
        if (++completed % 128 === 0 || completed === manifest.files.length) onProgress('validate', completed, manifest.files.length);
    }
    return manifest;
}
async function prepareInstallation({ source, root, agentDir, port = 11408, env = process.env, run, onProgress = () => {} }) {
    if (!supported(process.platform, process.arch)) throw Error('Unsupported installation platform');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid instance port');
    source = fs.realpathSync.native(source); root = path.resolve(root);
    if (fs.existsSync(root)) {
        const actual = fs.realpathSync.native(root), record = JSON.parse(readSafe(compat.metadataFile(actual, 'INSTALLATION')));
        if (record.version !== 1 || !compat.isProduct(record.product) || record.root !== actual) throw Error('An unknown installation already exists at this location');
        return { root: actual, existing: true, port: record.port };
    }
    const manifest = inspectPayload(source, onProgress);
    if (!agentDir) agentDir = execFileSync(nodePath(source), [path.join(source, 'scripts/pi-agent-dir.cjs')], { cwd: source, env: runtimeEnvironment(source, env), encoding: 'utf8', timeout: 30000 }).trim();
    for (const value of [root, agentDir]) if (!path.isAbsolute(value) || /[\r\n\x00]/.test(value) || value.trim() !== value) throw Error('Installation requires absolute single-line paths');
    privateDir(path.dirname(root)); root = path.join(fs.realpathSync.native(path.dirname(root)), path.basename(root));
    const staging = root + '.installing'; fs.mkdirSync(staging, { mode: 0o700 });
    const budget = { bytes: 0, files: 0, maxBytes: 1024 ** 3, maxFiles: 40001 };
    let copied = 0;
    for (const entry of [...manifest.files, { path: path.basename(compat.metadataFile(source, 'BUNDLE')), mode: 0o644 }]) {
        const target = path.join(staging, entry.path); privateDir(path.dirname(target));
        const result = copySafe(path.join(source, entry.path), target, budget);
        if (entry.sha256 && (result.sha256 !== entry.sha256 || result.bytes !== entry.bytes)) throw Error('Payload changed during installation');
        if (entry.mode === 0o755) fs.chmodSync(target, 0o700);
        if (++copied % 128 === 0 || copied === manifest.files.length + 1) onProgress('copy', copied, manifest.files.length + 1);
    }
    onProgress('probe', 0, 1);
    await require('../server/pi-platform-bundle').probeBundle(staging, manifest, { env, run });
    onProgress('probe', 1, 1);
    const storage = require('../server/ohmybuddy-storage');
    const folders = storage.layout({ env });
    for (const directory of [agentDir, folders.config, folders.state, folders.data, folders.cache, folders.workspaces])
        storage.assertExternal(directory, { root, env });
    const configPath = path.join(folders.config, 'instances', storage.installationId(root) + '.env');
    const config = { PORT: String(port), HOST: '127.0.0.1', PI_CODING_AGENT_DIR: agentDir, OHMYBUDDY_PROJECT_ROOTS: process.platform === 'win32' ? '' : '/',
        OHMYBUDDY_CONFIG_DIR: folders.config, OHMYBUDDY_STATE_DIR: folders.state, OHMYBUDDY_DATA_DIR: folders.data,
        OHMYBUDDY_CACHE_DIR: folders.cache, OHMYBUDDY_WORKSPACES_DIR: folders.workspaces,
        OHMYBUDDY_MEDIA_CONFIG_DIR: fs.existsSync(path.join(agentDir, 'media-lab')) ? path.join(agentDir, 'media-lab') : path.join(folders.config, 'media-lab'),
        OHMYBUDDY_MEDIA_DATA_DIR: path.join(folders.data, 'media'),
        OHMYBUDDY_WORKSPACE_BASE_URL: `http://127.0.0.1:${port}` };
    privateDir(path.dirname(configPath));
    if (fs.existsSync(configPath)) {
        // Reinstallation reattaches the existing external configuration, byte-for-byte.
        // Never overwrite it with installer defaults or create a second Pi identity.
        readSafe(configPath, 256 * 1024);
        const retained = {}; require('../server/pi-local-env').loadLocalEnv(configPath, retained);
        if (!retained.PI_CODING_AGENT_DIR || !Number.isInteger(Number(retained.PORT)) || Number(retained.PORT) < 1 || Number(retained.PORT) > 65535)
            throw Error('Existing external configuration needs inspection; it was not replaced');
        storage.assertExternal(retained.PI_CODING_AGENT_DIR, { root, env });
        port = Number(retained.PORT);
    } else require('../server/pi-private-files').writePrivateFileSync(configPath, Object.entries(config).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', true);
    atomicJson(path.join(staging, 'OHMYBUDDY_INSTALLATION.json'), { version: 1, product: 'OhMyBuddy', root, configFile: configPath, storageLayout: 1,
        port, installedVersion: manifest.appVersion, createdAt: new Date().toISOString() });
    if (fs.existsSync(root)) throw Error('Installation destination appeared; retained prepared files');
    fs.renameSync(staging, root); return { root, port, existing: false };
}
function defaultRoot({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
    const storage = require('../server/ohmybuddy-storage');
    const desired = storage.layout({ env, platform, home }).program;
    const p = platform === 'win32' ? path.win32 : path;
    const base = platform === 'darwin' ? p.join(home, 'Library', 'Application Support')
        : platform === 'win32' ? env.LOCALAPPDATA || p.join(home, 'AppData', 'Local')
            : env.XDG_DATA_HOME || p.join(home, '.local', 'share');
    const old = [p.join(base, platform === 'linux' ? 'ohmybuddy' : 'OhMyBuddy', 'desktop'),
        p.join(base, platform === 'linux' ? 'pivane' : 'Pivane', 'desktop')].filter(directory => fs.existsSync(directory));
    const candidates = [...new Set([...(fs.existsSync(desired) ? [desired] : []), ...old])];
    if (candidates.length > 1) throw Error('Multiple application installations exist; inspect them before installing');
    return candidates[0] || desired;
}
async function main() {
    const args = process.argv.slice(2), source = args.shift(), values = {};
    if (!source) throw Error('A verified payload directory is required');
    while (args.length) {
        const key = args.shift();
        if (['--prepare-only', '--no-browser'].includes(key)) values[key] = true;
        else if (['--root', '--agent-dir', '--port'].includes(key) && args.length && !values[key]) values[key] = args.shift();
        else throw Error('Invalid installation arguments');
    }
    const onProgress = (phase, completed, total) => console.log(`OHMYBUDDY_INSTALL_PROGRESS\t${phase}\t${completed}\t${total}`);
    const result = await prepareInstallation({ source, root: values['--root'] || defaultRoot(), agentDir: values['--agent-dir'], port: values['--port'] ? Number(values['--port']) : 11408, onProgress });
    if (values['--prepare-only']) { console.log(JSON.stringify(result)); return; }
    onProgress('service', 0, 1);
    const root = result.root, env = runtimeEnvironment(root);
    const serviceFile = path.join(compat.runtimeDirectory(root), 'service/installation.json');
    if (!fs.existsSync(serviceFile)) execFileSync(nodePath(root), [path.join(root, 'scripts/install-service.cjs')], { cwd: root, env, stdio: 'inherit', timeout: 180000 });
    const service = JSON.parse(readSafe(serviceFile));
    if (service.platform !== process.platform || service.phase !== 'http-ready') throw Error('Installation retained; startup is unconfirmed. Inspect the registered service before trying again.');
    if (process.platform === 'linux') execFileSync('systemctl', ['--user', 'start', service.id + '.service'], { stdio: 'inherit', timeout: 15000 });
    else if (process.platform === 'win32') require('./install-service.cjs').powershell(`Start-ScheduledTask -TaskName '${service.id.replace(/'/g, "''")}'`);
    const url = `http://127.0.0.1:${result.port}`;
    const response = await fetch(url + '/api/access/status', { signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) throw Error('The registered OhMyBuddy instance is not ready');
    onProgress('ready', 1, 1);
    console.log('OhMyBuddy is ready: ' + url);
    if (!values['--no-browser']) {
        if (process.platform === 'win32') execFileSync('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true });
        else if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) { try { execFileSync('xdg-open', [url], { stdio: 'ignore' }); } catch {} }
    }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { inspectPayload, prepareInstallation, defaultRoot, main };
