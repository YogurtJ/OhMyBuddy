'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { createPublicKey, verify } = require('node:crypto');
const { readSafe } = require('./pi-maintenance-files');
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-z0-9]+(?:\.[a-z0-9]+)*)?$/;
const MAX_BUNDLE = 512 * 1024 * 1024;
function baseUrl(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/')) throw Error('Distribution requires a fixed HTTPS base URL ending in /');
    return url.href;
}
function configuration(env = process.env, root = env.PI_MANAGED_BASE || path.resolve(__dirname, '..')) {
    const file = path.join(root, 'config/distribution.json');
    if (!fs.existsSync(file)) return null;
    const config = JSON.parse(readSafe(file, 64 * 1024));
    if (config.version !== 1) throw Error('Invalid distribution configuration');
    if (config.url === null) return null;
    config.url = baseUrl(config.url);
    if (config.channel !== undefined && !['stable', 'preview'].includes(config.channel)) throw Error('Invalid distribution channel');
    if (!Array.isArray(config.keys) || !config.keys.length || config.keys.length > 5) throw Error('Distribution verification keys are required');
    const ids = new Set();
    for (const entry of config.keys) {
        if (!/^[a-z0-9-]{1,64}$/.test(entry.id) || ids.has(entry.id) || createPublicKey(entry.pem).asymmetricKeyType !== 'ed25519') throw Error('Invalid distribution verification key');
        ids.add(entry.id);
    }
    return config;
}
function bundleName(version, platform, arch) { return `pivane-${version}-${platform}-${arch}.tar.gz`; }
function assetUrl(config, version, platform, arch) {
    if (!VERSION.test(version) || version.length > 79 || platform !== 'darwin' || !['arm64', 'x64'].includes(arch)) throw Error('Unsupported platform release');
    return new URL(`releases/v${version}/${bundleName(version, platform, arch)}`, baseUrl(config.url)).href;
}
function signedManifest(envelope, config, { now = Date.now() } = {}) {
    if (envelope?.version !== 1 || typeof envelope.payload !== 'string' || envelope.payload.length > 2 * 1024 * 1024
        || typeof envelope.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)) throw Error('Invalid signed release envelope');
    const key = config.keys.find(entry => entry.id === envelope.keyId);
    const bytes = Buffer.from(envelope.payload, 'base64');
    if (!key || bytes.toString('base64') !== envelope.payload || !verify(null, bytes, key.pem, Buffer.from(envelope.signature, 'base64'))) throw Error('Release signature verification failed');
    const data = JSON.parse(bytes.toString('utf8'));
    const generated = Date.parse(data.generatedAt), expires = Date.parse(data.expiresAt);
    if (data.version !== 1 || data.product !== 'Pivane' || !['stable', 'preview'].includes(data.channel)
        || !Number.isFinite(generated) || !Number.isFinite(expires) || generated > now + 5 * 60 * 1000 || expires <= now
        || expires <= generated || expires - generated > 31 * 86400000 || !Array.isArray(data.releases) || data.releases.length > 100) throw Error('Invalid or expired release manifest');
    const seen = new Set();
    for (const release of data.releases) {
        if (!VERSION.test(release.version) || release.version.length > 79 || seen.has(release.version)
            || data.channel === 'stable' && release.version.includes('-') || !/^\d+\.\d+\.\d+$/.test(release.piVersion)
            || typeof release.notes !== 'string' || release.notes.length > 20000 || !release.bundles || typeof release.bundles !== 'object' || Array.isArray(release.bundles)) throw Error('Invalid release metadata');
        seen.add(release.version);
        for (const [target, bundle] of Object.entries(release.bundles)) {
            if (!['darwin-arm64', 'darwin-x64'].includes(target) || !/^[a-f0-9]{64}$/.test(bundle.sha256)
                || !Number.isSafeInteger(bundle.bytes) || bundle.bytes < 1 || bundle.bytes > MAX_BUNDLE
                || !/^22\.(?:\d+)\.(?:\d+)$/.test(bundle.nodeVersion) || Number(bundle.nodeVersion.split('.')[1]) < 19) throw Error('Invalid platform bundle metadata');
        }
    }
    return data;
}
module.exports = { configuration, baseUrl, bundleName, assetUrl, signedManifest, MAX_BUNDLE, VERSION };
