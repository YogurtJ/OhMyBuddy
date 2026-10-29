'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createGzip } = require('node:zlib');
const { once } = require('node:events');
const { pipeline } = require('node:stream/promises');
const { readSafe, hash } = require('../server/pi-maintenance-files');
function header(name, bytes, mode) {
    const b = Buffer.alloc(512); let leaf = name, prefix = '';
    if (Buffer.byteLength(name) > 100) {
        const splits = [...name.matchAll(/\//g)].map(match => match.index).reverse();
        const split = splits.find(index => Buffer.byteLength(name.slice(0, index)) <= 155 && Buffer.byteLength(name.slice(index + 1)) <= 100);
        if (split === undefined) throw Error('Path cannot be represented by bounded ustar: ' + name);
        prefix = name.slice(0, split); leaf = name.slice(split + 1);
    }
    if (Buffer.byteLength(leaf) > 100 || Buffer.byteLength(prefix) > 155 || /[\x00-\x1f\x7f\\:]/.test(name)) throw Error('Path cannot be represented by bounded ustar: ' + name);
    b.write(leaf, 0); if (prefix) b.write(prefix, 345);
    const octal = (value, start, length) => { const text = value.toString(8); if (text.length > length - 1) throw Error('Tar numeric field overflow'); b.write(text.padStart(length - 1, '0') + '\0', start, length); };
    octal(mode, 100, 8); octal(0, 108, 8); octal(0, 116, 8); octal(bytes, 124, 12); octal(0, 136, 12);
    b.fill(32, 148, 156); b[156] = 48; b.write('ustar\0', 257); b.write('00', 263); b.write('root', 265); b.write('root', 297);
    const sum = b.reduce((n, value) => n + value, 0); b.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8); return b;
}
async function createArchive(root, prefix, manifest, destination) {
    const gz = createGzip({ level: 9 }), output = fs.createWriteStream(destination, { flags: 'wx', mode: 0o644 });
    const finished = pipeline(gz, output); finished.catch(() => {});
    const write = async bytes => { if (!gz.write(bytes)) await once(gz, 'drain'); };
    const metadata = require('../server/ohmybuddy-compat').metadataFile(root, 'BUNDLE');
    const files = [...manifest.files, { path: path.basename(metadata), mode: 0o644 }];
    try {
        for (const entry of files) {
            const bytes = readSafe(path.join(root, entry.path), 128 * 1024 ** 2);
            if (entry.sha256 && (hash(bytes) !== entry.sha256 || bytes.length !== entry.bytes)) throw Error('Payload changed before archive creation');
            await write(header(prefix + '/' + entry.path, bytes.length, entry.mode)); await write(bytes);
            if (bytes.length % 512) await write(Buffer.alloc(512 - bytes.length % 512));
        }
        await write(Buffer.alloc(1024)); gz.end(); await finished;
    } catch (error) { gz.destroy(error); await finished.catch(() => {}); throw error; }
}
function verifyArchive(archive, version, platform, arch, product = 'OhMyBuddy') {
    const { bundleName } = require('../server/pi-distribution');
    const entries = require('../server/pi-release-archive').parseArchive(readSafe(archive, 512 * 1024 ** 2), { prefix: bundleName(version, platform, arch, product).replace(/\.tar\.gz$/, '') + '/', maxExpanded: 1024 ** 3, maxFile: 128 * 1024 ** 2, maxFiles: 40000 });
    return require('../server/pi-platform-bundle').verifyManifest(JSON.parse(entries.get(product === 'OhMyBuddy' ? 'OHMYBUDDY_BUNDLE.json' : 'PIVANE_BUNDLE.json')?.bytes.toString() || 'null'), entries, { version, platform, arch, product });
}
module.exports = { header, createArchive, verifyArchive };
