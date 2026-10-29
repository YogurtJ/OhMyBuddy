'use strict';
// Private, revisioned JSON documents for Bot Mode metadata (window registries).
// Same protocol as the profile registry: descriptor-verified
// reads, a lock directory, compare-and-swap on the raw-text revision, private atomic
// replacement, post-write verification and a directory fsync. These files are
// indexes; native session markers stay the source of truth.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const io = require('../pi-file-io');
const { descriptorPathSync } = require('../pi-file-descriptor');
const { replaceFileSync } = require('../pi-win32-native');
const privateFiles = require('../pi-private-files');

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const stamp = stat => [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');
const revisionOf = raw => createHash('sha256').update(raw ?? '').digest('hex');

function readJsonDocument(file, { maxBytes, validate, empty, label }) {
    const changed = () => fail(`${label} changed during read`, 409);
    let fd, existed = false;
    try {
        const before = fs.lstatSync(file, { bigint: true });
        existed = true;
        if (!before.isFile() || before.isSymbolicLink() || before.size > BigInt(maxBytes)) fail(`Invalid ${label} file`);
        fd = io.openReadSync(file);
        const opened = fs.fstatSync(fd, { bigint: true }), identity = io.identity(fd);
        if (!opened.isFile() || stamp(before) !== stamp(opened) || descriptorPathSync(fd) !== file) changed();
        const bytes = Buffer.alloc(maxBytes + 1);
        let size = 0, n;
        while (size < bytes.length && (n = fs.readSync(fd, bytes, size, bytes.length - size, size))) size += n;
        if (size > maxBytes) fail(`${label} is too large`);
        if (size !== Number(opened.size) || stamp(opened) !== stamp(fs.fstatSync(fd, { bigint: true }))
            || stamp(opened) !== stamp(fs.lstatSync(file, { bigint: true }))
            || descriptorPathSync(fd) !== file || !io.sameIdentityAtPath(file, identity)) changed();
        const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size));
        const state = JSON.parse(raw);
        if (!validate(state)) fail(`${label} is invalid`);
        return { raw, state };
    } catch (error) {
        if (error.code === 'ENOENT') {
            if (!existed) return { raw: null, state: empty() };
            changed();
        }
        if (error instanceof SyntaxError || error instanceof TypeError && error.message.includes('encoded data')) fail(`${label} contains invalid JSON or UTF-8`);
        throw error;
    } finally { if (fd !== undefined) fs.closeSync(fd); }
}

class PrivateJsonDocument {
    // root: an already safe, private directory; name: file name within it.
    constructor({ root, name, maxBytes = 4 * 1024 * 1024, validate, empty, label }) {
        Object.assign(this, { root, name, maxBytes, validate, empty, label });
        this.file = path.join(root, name);
    }

    read() {
        const data = readJsonDocument(this.file, this);
        return { ...data, revision: revisionOf(data.raw) };
    }

    // update(state) mutates the parsed state in place and returns a result object.
    // Synchronous from revision comparison through replacement.
    mutate(expectedRevision, update) {
        if (typeof expectedRevision !== 'string') fail('Expected revision is required');
        const changed = () => fail(`${this.label} changed during save`, 409);
        const root = this.root, file = this.file, lock = path.join(root, `${this.name}.lock`);
        let directoryFd;
        try {
            directoryFd = io.openReadSync(root);
            const parent = fs.fstatSync(directoryFd, { bigint: true }), identity = io.identity(directoryFd);
            const checkParent = () => {
                try {
                    const current = fs.lstatSync(root, { bigint: true }), opened = fs.fstatSync(directoryFd, { bigint: true });
                    if (!parent.isDirectory() || !current.isDirectory() || current.isSymbolicLink()
                        || stamp(current) !== stamp(opened) || parent.dev !== current.dev || parent.ino !== current.ino
                        || parent.mode !== current.mode || descriptorPathSync(directoryFd) !== root
                        || fs.realpathSync.native(root) !== root || !io.sameIdentityAtPath(root, identity)) changed();
                } catch (error) { if (error.status) throw error; changed(); }
            };
            checkParent();
            try { fs.mkdirSync(lock, { mode: 0o700 }); } catch { fail(`${this.label} is being saved`, 409); }
            try {
                checkParent();
                const { state, raw } = readJsonDocument(file, this);
                if (revisionOf(raw) !== expectedRevision) fail(`${this.label} changed; reload before saving`, 409);
                const result = update(state);
                if (!this.validate(state)) fail(`Invalid ${this.label}`);
                const text = JSON.stringify(state, null, 2) + '\n';
                if (Buffer.byteLength(text) > this.maxBytes) fail(`${this.label} is too large`);
                const tmp = `${file}.${randomUUID()}.tmp`;
                try {
                    privateFiles.writePrivateFileSync(tmp, text, true);
                    checkParent();
                    if (readJsonDocument(file, this).raw !== raw) changed();
                    replaceFileSync(tmp, file);
                    privateFiles.privateFileMode(file);
                    checkParent();
                    if (readJsonDocument(file, this).raw !== text) changed();
                    if (process.platform !== 'win32') fs.fsyncSync(directoryFd);
                } finally { try { fs.unlinkSync(tmp); } catch {} }
                return { ...result, revision: revisionOf(text), state };
            } finally { checkParent(); fs.rmdirSync(lock); }
        } finally { if (directoryFd !== undefined) fs.closeSync(directoryFd); }
    }
}

module.exports = { PrivateJsonDocument, readJsonDocument, revisionOf };
