const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { renew } = require('../scripts/refresh-platform-channel.cjs');
const { signedManifest } = require('../server/pi-distribution');
test('maintainer refresh renews an expired approval without changing its releases or unknown metadata', () => {
    const key = generateKeyPairSync('ed25519'), now = Date.now(), before = now - 60 * 86400000;
    const data = { version: 1, product: 'Pivane', channel: 'preview', generatedAt: new Date(before).toISOString(), expiresAt: new Date(before + 30 * 86400000).toISOString(), releases: [], publicationNote: 'synthetic approval' };
    const bytes = Buffer.from(JSON.stringify(data)), envelope = { version: 1, keyId: 'fixture', payload: bytes.toString('base64'), signature: sign(null, bytes, key.privateKey).toString('base64') };
    const config = { keys: [{ id: 'fixture', pem: key.publicKey.export({ format: 'pem', type: 'spki' }).toString() }] };
    assert.throws(() => signedManifest(envelope, config, { now }), /expired/);
    const next = signedManifest(renew(envelope, key.privateKey, 'fixture', now), config, { now });
    assert.deepEqual(next.releases, data.releases); assert.equal(next.publicationNote, data.publicationNote);
    assert.equal(Date.parse(next.expiresAt), now + 30 * 86400000);
    const changed = { ...envelope, payload: Buffer.from(JSON.stringify({ ...data, publicationNote: 'tampered' })).toString('base64') };
    assert.throws(() => renew(changed, key.privateKey, 'fixture', now), /signature/);
    assert.throws(() => renew(envelope, generateKeyPairSync('ed25519').privateKey, 'fixture', now), /signature/);
});
