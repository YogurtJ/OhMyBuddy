'use strict';
// Renew timestamps on an already approved signed channel. This cannot add,
// remove or modify releases; a changed signing key requires a new publication.
const fs = require('node:fs');
const path = require('node:path');
const { createPrivateKey, createPublicKey, sign } = require('node:crypto');
const { readSafe, atomicJson } = require('../server/pi-maintenance-files');
const { signedManifest } = require('../server/pi-distribution');
function renew(envelope, privateKey, keyId, now = Date.now()) {
    if (!/^[a-z0-9-]{1,64}$/.test(keyId) || envelope.keyId !== keyId || privateKey.asymmetricKeyType !== 'ed25519') throw Error('Refresh requires the original channel signing identity');
    const config = { keys: [{ id: keyId, pem: createPublicKey(privateKey).export({ format: 'pem', type: 'spki' }).toString() }] };
    const previous = JSON.parse(Buffer.from(envelope.payload, 'base64').toString());
    const generated = Date.parse(previous.generatedAt);
    if (!Number.isFinite(generated) || generated > now + 5 * 60 * 1000) throw Error('Channel timestamp is in the future');
    // Expiration is a client freshness boundary. The maintainer can renew an
    // expired approval only after its original signature and metadata verify.
    const approved = signedManifest(envelope, config, { now: generated });
    const refreshed = { ...approved, generatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30 * 86400000).toISOString() };
    const payload = Buffer.from(JSON.stringify(refreshed));
    const result = { version: 1, keyId, payload: payload.toString('base64'), signature: sign(null, payload, privateKey).toString('base64') };
    signedManifest(result, config, { now });
    return result;
}
if (require.main === module) {
    const args = process.argv.slice(2), values = {};
    for (let i = 0; i < args.length; i += 2) { if (!['--channel-file', '--key', '--key-id'].includes(args[i]) || !args[i + 1] || values[args[i]]) throw Error('Usage: refresh-platform-channel.cjs --channel-file FILE --key PRIVATE_PEM --key-id ID'); values[args[i]] = args[i + 1]; }
    if (!['--channel-file', '--key', '--key-id'].every(key => values[key])) throw Error('Missing channel refresh arguments');
    const file = path.resolve(values['--channel-file']);
    const next = renew(JSON.parse(readSafe(file)), createPrivateKey(readSafe(path.resolve(values['--key']), 64 * 1024)), values['--key-id']);
    atomicJson(file, next); fs.chmodSync(file, 0o644);
    console.log(JSON.stringify({ channelFile: file, expiresAt: JSON.parse(Buffer.from(next.payload, 'base64').toString()).expiresAt }));
}
module.exports = { renew };
