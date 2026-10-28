const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const equal = (left, right) => { if (!isDeepStrictEqual(left, right)) throw new Error('Image migration native semantic comparison failed'); };
const { scanSession } = require('./pi-session-scan');
const { SessionImages, syncDirectory } = require('./pi-session-images');
const { readSafe, hash, privateDir, atomicJson, copySafe } = require('./pi-maintenance-files');
const privateFiles = require('./pi-private-files');
const { replaceFileSync } = require('./pi-win32-native');
const { randomUUID } = require('node:crypto');
function content(entry) { return entry?.type === 'message' ? entry.message?.content : entry?.type === 'custom_message' ? entry.content : entry?.type === 'context_edit' ? entry.replacement?.content : null; }
function inventory(sessionsRoot) {
    const root = fs.realpathSync.native(sessionsRoot), files = []; let visited = 0;
    const walk = directory => {
        for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (++visited > 100000) throw new Error('Session inventory exceeds entry budget');
            if (item.isSymbolicLink()) throw new Error('Session inventory contains a symlink');
            const file = path.join(directory, item.name);
            if (item.isDirectory()) walk(file);
            else if (item.isFile() && item.name.endsWith('.jsonl')) {
                let images = 0, imageBytes = 0, sessionId;
                const proof = scanSession(file, entry => {
                    if (entry?.type === 'session') sessionId = entry.id;
                    for (const block of content(entry) || []) if (block?.type === 'image' && typeof block.data === 'string') { images++; imageBytes += block.data.length; }
                });
                if (images) {
                    if (!sessionId) throw new Error('Image session has no native header');
                    files.push({ file: path.relative(root, file), sessionId, bytes: proof.bytes, sha256: proof.sha256, images, imageBytes });
                }
            }
        }
    };
    walk(root);
    return { version: 1, sessionsRoot: root, createdAt: new Date().toISOString(), files };
}
async function migrate(plan, { agentDir, directory, assertOffline, sdk }) {
    if (plan?.version !== 1 || !Array.isArray(plan.files) || !plan.files.length || typeof assertOffline !== 'function') throw new Error('Migration requires an explicit plan and offline ownership check');
    await assertOffline();
    const root = fs.realpathSync.native(plan.sessionsRoot);
    if (root !== path.join(fs.realpathSync.native(agentDir), 'sessions')) throw new Error('Migration identity mismatch');
    privateDir(directory);
    const receiptFile = path.join(directory, 'result.json'), started = path.join(directory, 'started.json');
    privateFiles.writePrivateFileSync(started, JSON.stringify({ planHash: hash(Buffer.from(JSON.stringify(plan))) }), true);
    const originals = privateDir(path.join(directory, 'originals')), images = new SessionImages(agentDir);
    const result = { version: 1, status: 'running', files: [], startedAt: new Date().toISOString() };
    atomicJson(receiptFile, result);
    try {
        // Fail before changing anything if even one approved source has changed.
        // Existing byte-prefix authorizations must not be invalidated by a
        // storage migration. A separate proof-preserving migration is required
        // for those sessions; never silently alter their receipts.
        let moves = '';
        const moveRecords = path.join(agentDir, 'pivane-session-moves', 'records.json');
        if (fs.existsSync(moveRecords)) moves = JSON.stringify(JSON.parse(readSafe(moveRecords, 16 * 1024 ** 2)));
        for (const row of plan.files) {
            if (moves.includes(JSON.stringify(row.sessionId))) throw new Error('Session has move evidence; image migration requires a preserved prefix proof');
            const file = path.resolve(root, row.file);
            if (!file.startsWith(root + path.sep) || fs.realpathSync.native(file) !== file) throw new Error('Migration path outside native sessions');
            const bytes = readSafe(file, 256 * 1024 ** 2);
            if (bytes.length !== row.bytes || hash(bytes) !== row.sha256) throw new Error('Approved session changed; prepare a new plan');
            scanSession(file, entry => {
                if (entry?.customType === 'pivane-fork-access') throw new Error('Session has fork evidence; image migration requires a preserved prefix proof');
            });
        }
        for (const [index, row] of plan.files.entries()) {
            await assertOffline();
            const file = path.join(root, row.file), backup = path.join(originals, String(index) + '.jsonl');
            const proof = copySafe(file, backup, { bytes: 0, files: 0, maxBytes: 256 * 1024 ** 2, maxFiles: 1 });
            if (proof.sha256 !== row.sha256) throw new Error('Session changed before backup');
            const load = filename => {
                const entries = []; scanSession(filename, entry => { if (entry) entries.push(entry); });
                const header = entries[0];
                return sdk.SessionManager.inMemory(header.cwd, undefined, entries);
            };
            const original = load(backup);
            if (original.getSessionId() !== row.sessionId) throw new Error('Migration native identity changed');
            const staged = path.join(path.dirname(file), '.pivane-image-migration-' + randomUUID());
            let fd = privateFiles.openPrivateFileSync(staged), replaced = 0;
            try {
                const source = scanSession(file, (entry, line, _number, newline) => {
                    const projected = entry ? images.entry(entry, 'save') : entry;
                    if (entry !== projected) {
                        equal(images.entry(projected), entry);
                        replaced++;
                    }
                    fs.writeFileSync(fd, entry !== projected ? JSON.stringify(projected) : line);
                    if (newline) fs.writeFileSync(fd, '\n');
                });
                fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
                if (source.sha256 !== row.sha256 || !replaced) throw new Error('Migration source changed or no images externalized');
                const next = load(staged);
                equal(next.getHeader(), original.getHeader());
                equal(next.getEntries().map(entry => images.entry(entry)), original.getEntries());
                const beforeEntries = original.getEntries(), parents = new Set(beforeEntries.map(entry => entry.parentId));
                for (const leaf of beforeEntries.filter(entry => !parents.has(entry.id))) {
                    original.branch(leaf.id); next.branch(leaf.id);
                    equal(images.messages(next.buildSessionContext().messages, 'restore', 256 * 1024 ** 2), original.buildSessionContext().messages);
                }
                await assertOffline();
                if (hash(readSafe(file, 256 * 1024 ** 2)) !== row.sha256) throw new Error('Session changed at publication');
                const after = readSafe(staged, 256 * 1024 ** 2);
                const item = { ...row, backup, mode: proof.mode, afterBytes: after.length, afterSha256: hash(after), replaced, status: 'prepared' };
                result.files.push(item); atomicJson(receiptFile, result);
                if (process.platform !== 'win32') fs.chmodSync(staged, proof.mode);
                replaceFileSync(staged, file); syncDirectory(path.dirname(file));
                item.status = 'committed'; atomicJson(receiptFile, result);
            } finally { if (fd !== undefined) fs.closeSync(fd); if (fs.existsSync(staged)) fs.unlinkSync(staged); }
        }
        result.status = 'succeeded'; result.finishedAt = new Date().toISOString(); atomicJson(receiptFile, result);
        return result;
    } catch (error) {
        result.status = 'failed'; result.error = error.message; atomicJson(receiptFile, result); throw error;
    }
}
async function rollback(plan, result, { assertOffline, directory }) {
    if (typeof assertOffline !== 'function' || !directory || !Array.isArray(result?.files)) throw new Error('Rollback requires offline ownership and a receipt');
    await assertOffline();
    const originals = new Map(plan.files.map(row => [row.file, row]));
    for (const row of [...result.files].reverse()) {
        await assertOffline();
        const approved = originals.get(row.file), file = path.resolve(plan.sessionsRoot, row.file);
        if (!approved || approved.sha256 !== row.sha256 || !file.startsWith(plan.sessionsRoot + path.sep)) throw new Error('Rollback plan mismatch');
        const current = hash(readSafe(file, 256 * 1024 ** 2));
        if (current === row.sha256) continue;
        if (current !== row.afterSha256) throw new Error('Session changed after migration; rollback refused');
        const original = readSafe(row.backup, 256 * 1024 ** 2);
        if (hash(original) !== row.sha256) throw new Error('Original backup checksum mismatch');
        const temporary = file + '.rollback-' + randomUUID();
        privateFiles.writePrivateFileSync(temporary, original, true);
        try {
            if (process.platform !== 'win32') fs.chmodSync(temporary, row.mode);
            replaceFileSync(temporary, file); syncDirectory(path.dirname(file));
        } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    }
    atomicJson(path.join(directory, 'rollback.json'), { status: 'succeeded', at: new Date().toISOString(), files: result.files.length });
}
module.exports = { inventory, migrate, rollback };
