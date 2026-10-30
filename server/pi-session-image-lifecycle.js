'use strict';
// Deletion metadata only: native JSONL remains the sole conversation record.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SessionImages, isReference, reference } = require('./pi-session-images');
const { privateDir, atomicJson, readSafe, hash } = require('./pi-maintenance-files');
const { scanSession } = require('./pi-session-scan');
const HEX = /^[a-f0-9]{64}$/;
const MAX_REFS = 10000;
function imageReferences(entries) {
    const refs = new Map();
    for (const entry of entries) {
        const content = entry?.type === 'message' ? entry.message?.content : entry?.type === 'custom_message' ? entry.content
            : entry?.type === 'context_edit' ? entry.replacement?.content : null;
        for (const block of Array.isArray(content) ? content : []) if (isReference(block)) {
            const ref = reference(block);
            if (refs.has(ref.sha256) && refs.get(ref.sha256).bytes !== ref.bytes) throw new Error('图片引用大小不一致');
            refs.set(ref.sha256, { sha256: ref.sha256, bytes: ref.bytes });
            if (refs.size > MAX_REFS) throw new Error('删除记录的图片数量超过预算');
        }
    }
    return [...refs.values()].sort((a, b) => a.sha256.localeCompare(b.sha256));
}
function validRecord(record, id) {
    return record?.version === 1 && record.id === id && HEX.test(id) && ['session', 'buddy-topic'].includes(record.kind)
        && ['prepared', 'trashed', 'deleted', 'released', 'cancelled'].includes(record.state)
        && typeof record.name === 'string' && record.name.length <= 120 && Number.isFinite(Date.parse(record.createdAt))
        && Array.isArray(record.refs) && record.refs.length <= MAX_REFS
        && record.refs.every(ref => HEX.test(ref?.sha256) && Number.isSafeInteger(ref.bytes) && ref.bytes > 0 && ref.bytes <= 32 * 1024 ** 2)
        && new Set(record.refs.map(ref => ref.sha256)).size === record.refs.length;
}
class SessionImageLifecycle {
    constructor(agentDir) { this.images = new SessionImages(agentDir); }
    directories() {
        let root;
        try { root = this.images.directory(); }
        catch (error) { if (error.code !== 'ENOENT') throw error; root = this.images.directory(true); }
        const state = path.join(root, '.lifecycle');
        for (const dir of [state, path.join(state, 'deletions'), path.join(state, 'receipts'), path.join(root, '.quarantine')]) {
            try { fs.lstatSync(dir); } catch (error) { if (error.code !== 'ENOENT') throw error; privateDir(dir); }
            const stat = fs.lstatSync(dir);
            if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync.native(dir) !== dir) throw new Error('图片清理目录发生变化');
        }
        return { root, state, deletions: path.join(state, 'deletions'), receipts: path.join(state, 'receipts'), quarantine: path.join(root, '.quarantine') };
    }
    read(id) {
        if (!HEX.test(id)) throw new Error('删除记录编号无效');
        const { deletions } = this.directories(), record = JSON.parse(readSafe(path.join(deletions, id + '.json'), 2 * 1024 ** 2));
        if (!validRecord(record, id)) throw new Error('图片删除记录无效');
        return record;
    }
    prepare({ kind, key, name = '', refs = [] }) {
        if (!['session', 'buddy-topic'].includes(kind)) throw new Error('图片删除类型无效');
        const id = hash(JSON.stringify([kind, key]));
        // Text-only deletes do not create an image store. A resumed Buddy delete
        // may have already removed every generation: retain its prepared record.
        if (!refs.length && !fs.existsSync(path.join(this.images.root, '.lifecycle', 'deletions', id + '.json'))) return null;
        const { deletions } = this.directories(), file = path.join(deletions, id + '.json');
        if (fs.existsSync(file)) {
            const previous = this.read(id);
            if (previous.kind !== kind || refs.some(ref => !previous.refs.some(old => old.sha256 === ref.sha256 && old.bytes === ref.bytes)))
                throw new Error('待删除会话的图片引用已变化');
            return id;
        }
        const record = { version: 1, id, kind, name: String(name).slice(0, 120), state: 'prepared', createdAt: new Date().toISOString(), refs };
        if (!validRecord(record, id)) throw new Error('图片删除记录无效');
        atomicJson(file, record); return id;
    }
    prepareSession(session) {
        const refs = new Map();
        const proof = scanSession(session.path, entry => {
            for (const ref of imageReferences([entry])) refs.set(ref.sha256, ref);
            if (refs.size > MAX_REFS) throw new Error('删除记录的图片数量超过预算');
        });
        const id = this.prepare({ kind: 'session', key: [session.cwd, session.id, session.path, proof.sha256, randomUUID()], name: session.name, refs: [...refs.values()] });
        this.sourceProofs ||= new Map();
        if (id) this.sourceProofs.set(id, { file: session.path, sha256: proof.sha256 });
        return id;
    }
    cancelSession(id) {
        if (!id) return;
        const source = this.sourceProofs?.get(id);
        if (!source) return;
        try {
            const current = scanSession(source.file, () => {});
            if (current.sha256 === source.sha256) this.finish(id, 'cancelled');
        } catch { /* Unknown deletion outcome keeps every image protected. */ }
    }
    finish(id, state) {
        if (!id) return null;
        if (!['trashed', 'deleted', 'released', 'cancelled'].includes(state)) throw new Error('图片删除状态无效');
        const record = this.read(id);
        if (record.state === state) return record;
        if (!(record.state === 'prepared' && state !== 'released' || record.state === 'trashed' && state === 'released'))
            throw new Error('图片删除记录状态已变化');
        const next = { ...record, state, updatedAt: new Date().toISOString() };
        atomicJson(path.join(this.directories().deletions, id + '.json'), next); return next;
    }
}
module.exports = { SessionImageLifecycle, imageReferences, validRecord, HEX };
