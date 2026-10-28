const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const io = require('./pi-file-io');
const { descriptorPathSync } = require('./pi-file-descriptor');
const same = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
// Synchronous bounded scan for callers with existing synchronous provenance
// transactions. No full-file string and no unbounded readline accumulation.
function scanSession(file, visit, { maxBytes = 256 * 1024 ** 2, maxLine = 32 * 1024 ** 2, maxEntries = 200000 } = {}) {
    const fd = io.openReadSync(file);
    try {
        const stat = fs.fstatSync(fd, { bigint: true }), identity = io.identity(fd);
        const validate = () => {
            if (!same(stat, fs.fstatSync(fd, { bigint: true })) || !same(stat, fs.lstatSync(file, { bigint: true }))
                || descriptorPathSync(fd) !== path.resolve(file) || !io.sameIdentityAtPath(file, identity)) throw new Error('Session file changed');
        };
        if (!stat.isFile() || stat.size > BigInt(maxBytes) || descriptorPathSync(fd) !== path.resolve(file)) throw new Error('Session scan budget or identity invalid');
        const digest = createHash('sha256'), chunk = Buffer.alloc(256 * 1024), decoder = new TextDecoder('utf-8', { fatal: true });
        let readBytes = 0, parts = [], length = 0, count = 0;
        const record = (fragment, ended) => {
            length += fragment.length;
            if (length > maxLine) throw new Error('Session record exceeds scan budget');
            parts.push(fragment);
            if (!ended) return;
            const line = Buffer.concat(parts, length); parts = []; length = 0;
            if (++count > maxEntries) throw new Error('Session entries exceed scan budget');
            const text = decoder.decode(line);
            let entry = null;
            try { if (text.trim()) entry = JSON.parse(text); }
            catch { throw new Error('Invalid native JSONL record at line ' + count); }
            visit(entry, line, count, ended === true);
        };
        while (readBytes < Number(stat.size)) {
            const n = fs.readSync(fd, chunk, 0, Math.min(chunk.length, Number(stat.size) - readBytes), readBytes);
            if (!n) throw new Error('Session file truncated');
            digest.update(chunk.subarray(0, n)); readBytes += n;
            let start = 0;
            for (let i = 0; i < n; i++) if (chunk[i] === 10) { record(Buffer.from(chunk.subarray(start, i)), true); start = i + 1; }
            if (start < n) record(Buffer.from(chunk.subarray(start, n)), false);
        }
        if (length) record(Buffer.alloc(0), 'eof');
        validate();
        return { bytes: readBytes, sha256: digest.digest('hex'), count, stat };
    } finally { fs.closeSync(fd); }
}
module.exports = { scanSession };
