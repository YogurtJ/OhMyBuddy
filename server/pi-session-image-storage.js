'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SessionImageLifecycle, validRecord, HEX } = require('./pi-session-image-lifecycle');
const { SessionImages, syncDirectory } = require('./pi-session-images');
const { readSafe, hash, atomicJson } = require('./pi-maintenance-files');
const { scanReferences, prove, verifyAll } = require('./pi-document-storage-references');
const { getSdk } = require('./pi-session-store');
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const fail = (message, code = 'IMAGE_STORAGE_CHANGED', status = 409) => Object.assign(new Error(message), { code, status });
const changed = () => fail('会话图片或引用已变化，请重新检查');
const incomplete = () => fail('无法完整核对全部会话图片引用，图片已保留', 'IMAGE_STORAGE_INCOMPLETE');
const validRequest = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(id);
class SessionImageStorage {
    constructor(uploads, { storageGuard, protectedDocuments, now = Date.now, maxBytes } = {}) {
        Object.assign(this, { uploads, storageGuard, protectedDocuments, now, maxBytes });
        this.busy = false; this.tickets = new Map();
    }
    scope(raw, keys) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !keys.includes(key)) || typeof raw.cwd !== 'string')
            throw fail('会话图片管理参数无效', 'IMAGE_STORAGE_INPUT', 400);
        return this.uploads.store.resolveProject(raw.cwd);
    }
    async operation(action, exclusive = false) {
        if (this.busy || exclusive && (this.uploads.active || this.uploads.writing)) throw fail('图片或附件正在使用，请稍后再试', 'IMAGE_STORAGE_BUSY');
        const release = this.uploads.reserve();
        let lease;
        if (exclusive) this.busy = true;
        try {
            if (exclusive) {
                if (!this.storageGuard?.acquire || !this.protectedDocuments) throw incomplete();
                lease = this.storageGuard.acquire(); lease.check(); await lease.ready?.(); lease.check();
            }
            return await action(lease);
        } finally { try { lease?.release(); } finally { this.busy = false; release(); } }
    }
    async inventory() {
        const agent = fs.realpathSync.native((await getSdk()).getAgentDir()), lifecycle = new SessionImageLifecycle(agent), dirs = lifecycle.directories();
        const proofs = [prove(dirs.root, true), prove(dirs.state, true), prove(dirs.deletions, true), prove(dirs.receipts, true), prove(dirs.quarantine, true)];
        if (proofs.some(proof => proof.names.length > 20000)) throw incomplete();
        const records = [], receipts = [], objects = [], quarantined = [];
        for (const name of fs.readdirSync(dirs.deletions).sort()) {
            if (!/^[a-f0-9]{64}\.json$/.test(name)) throw incomplete();
            proofs.push(prove(path.join(dirs.deletions, name)));
            const record = lifecycle.read(name.slice(0, -5));
            if (!validRecord(record, name.slice(0, -5))) throw incomplete();
            records.push(record);
        }
        for (const name of fs.readdirSync(dirs.receipts).sort()) {
            if (!/^[a-f0-9]{64}\.json$/.test(name)) throw incomplete();
            const file = path.join(dirs.receipts, name); proofs.push(prove(file));
            const receipt = JSON.parse(readSafe(file, 2 * 1024 ** 2));
            if (!this.validReceipt(receipt) || name !== hash(JSON.stringify([receipt.cwd, receipt.requestId])) + '.json') throw incomplete();
            receipts.push(receipt);
        }
        let total = 0;
        const object = (directory, name) => {
            if (!HEX.test(name)) throw incomplete();
            const file = path.join(directory, name), proof = prove(file); proofs.push(proof);
            const bytes = readSafe(file, Math.min(32 * 1024 ** 2, 4 * 1024 ** 3 - total)); total += bytes.length;
            if (total > 4 * 1024 ** 3 || hash(bytes) !== name) throw incomplete();
            return { id: name, bytes: bytes.length, file, modifiedAt: fs.statSync(file).mtimeMs };
        };
        for (const name of fs.readdirSync(dirs.root).sort()) {
            if (['.lifecycle', '.quarantine'].includes(name)) continue;
            objects.push(object(dirs.root, name));
        }
        for (const name of fs.readdirSync(dirs.quarantine).sort()) quarantined.push(object(dirs.quarantine, name));
        verifyAll(proofs);
        return { agent, lifecycle, dirs, proofs, records, receipts, objects, quarantined };
    }
    validReceipt(receipt) {
        return receipt?.version === 1 && validRequest(receipt.requestId) && typeof receipt.cwd === 'string'
            && ['quarantine', 'purge', 'release'].includes(receipt.action) && ['uncertain', 'completed'].includes(receipt.state)
            && Array.isArray(receipt.ids) && receipt.ids.length <= 10000 && receipt.ids.every(id => HEX.test(id))
            && Number.isFinite(Date.parse(receipt.createdAt));
    }
    async snapshot(cwd, lease) {
        const inventory = await this.inventory(); lease?.check();
        const ids = new Set([...inventory.objects, ...inventory.quarantined].map(object => object.id));
        const native = await scanReferences(inventory.agent, ids, this.maxBytes); lease?.check();
        const external = await this.protectedDocuments?.({ nativeScope: native.scope }); lease?.check();
        if (!external || external.complete !== true || !Array.isArray(external.ids) || typeof external.revision !== 'string') throw incomplete();
        const protectedIds = new Set([...native.found, ...external.ids]);
        for (const record of inventory.records) if (['prepared', 'trashed'].includes(record.state))
            for (const ref of record.refs) protectedIds.add(ref.sha256);
        const uncertain = new Set(inventory.receipts.filter(receipt => receipt.state === 'uncertain' && receipt.action !== 'release').flatMap(receipt => receipt.ids));
        const candidates = inventory.objects.filter(object => !protectedIds.has(object.id) && !uncertain.has(object.id));
        const purge = inventory.quarantined.filter(object => !protectedIds.has(object.id) && !uncertain.has(object.id)
            && inventory.receipts.some(receipt => receipt.action === 'quarantine' && receipt.state === 'completed' && receipt.ids.includes(object.id))
            && this.now() - object.modifiedAt >= RETENTION_MS);
        const proofs = [...inventory.proofs, ...native.proofs]; verifyAll(proofs); lease?.check();
        this.uploads.store.resolveProject(cwd);
        const revision = hash(JSON.stringify([cwd, proofs, external.revision, [...protectedIds].sort(), [...uncertain].sort()]));
        return { ...inventory, proofs, protectedIds, candidates, purge, uncertain, revision };
    }
    summary(snapshot, complete, warning = null) {
        const size = objects => objects.reduce((sum, object) => sum + object.bytes, 0);
        return { complete, revision: complete ? snapshot.revision : null, totalBytes: size(snapshot.objects), count: snapshot.objects.length,
            quarantineBytes: size(snapshot.quarantined), quarantineCount: snapshot.quarantined.length,
            reclaimableBytes: complete ? size(snapshot.candidates) : 0, reclaimableCount: complete ? snapshot.candidates.length : 0,
            purgeableBytes: complete ? size(snapshot.purge) : 0, purgeableCount: complete ? snapshot.purge.length : 0, retentionDays: 30,
            trash: snapshot.records.filter(record => record.state === 'trashed').map(record => ({ id: record.id, name: record.name,
                createdAt: record.createdAt, images: record.refs.length, bytes: record.refs.reduce((sum, ref) => sum + ref.bytes, 0) })),
            pendingRecords: snapshot.records.filter(record => record.state === 'prepared').length, warning };
    }
    async usage(raw) {
        const cwd = this.scope(raw, ['cwd']);
        return this.operation(async () => {
            try { const snapshot = await this.snapshot(cwd); return this.summary(snapshot, true, snapshot.uncertain.size ? '有图片清理结果待核对，相关图片继续保留' : null); }
            catch { return this.summary(await this.inventory(), false, '图片或保存引用正在变化，或无法完整扫描；当前不能清理'); }
        });
    }
    async preview(raw) {
        const cwd = this.scope(raw, ['cwd', 'action', 'recordId']);
        if (!['quarantine', 'purge', 'release'].includes(raw.action) || raw.action === 'release' && !HEX.test(raw.recordId)) throw fail('图片清理操作无效', 'IMAGE_STORAGE_INPUT', 400);
        return this.operation(async lease => {
            const snapshot = await this.snapshot(cwd, lease);
            const objects = raw.action === 'quarantine' ? snapshot.candidates : raw.action === 'purge' ? snapshot.purge : [];
            const record = raw.action === 'release' ? snapshot.records.find(record => record.id === raw.recordId && record.state === 'trashed') : null;
            if (raw.action === 'release' ? !record : !objects.length) throw fail('没有符合条件的图片或回收站记录', 'IMAGE_STORAGE_PROTECTED');
            if (objects.length > 10000) throw incomplete();
            for (const [key, value] of this.tickets) if (value.expires <= this.now()) this.tickets.delete(key);
            if (this.tickets.size >= 100) throw fail('图片清理预览过多，请稍后再试', 'IMAGE_STORAGE_BUSY');
            const ticket = randomUUID(), result = { ticket, revision: snapshot.revision, action: raw.action, count: record ? record.refs.length : objects.length,
                bytes: record ? record.refs.reduce((sum, ref) => sum + ref.bytes, 0) : objects.reduce((sum, object) => sum + object.bytes, 0),
                retentionDays: 30, expiresAt: new Date(this.now() + 5 * 60000).toISOString(), ...(record ? { recordId: record.id, name: record.name } : {}) };
            this.tickets.set(ticket, { ...result, cwd, ids: record ? [record.id] : objects.map(object => object.id), expires: this.now() + 5 * 60000 });
            return result;
        }, true);
    }
    receiptPath(dirs, cwd, requestId) { return path.join(dirs.receipts, hash(JSON.stringify([cwd, requestId])) + '.json'); }
    async status(raw) {
        const cwd = this.scope(raw, ['cwd', 'requestId']);
        if (!validRequest(raw.requestId)) throw fail('图片清理请求编号无效', 'IMAGE_STORAGE_INPUT', 400);
        return this.operation(async () => {
            const dirs = new SessionImageLifecycle(fs.realpathSync.native((await getSdk()).getAgentDir())).directories();
            const receipt = JSON.parse(readSafe(this.receiptPath(dirs, cwd, raw.requestId), 2 * 1024 ** 2));
            if (!this.validReceipt(receipt) || receipt.cwd !== cwd || receipt.requestId !== raw.requestId) throw changed();
            return receipt;
        });
    }
    async cleanup(raw) {
        const cwd = this.scope(raw, ['cwd', 'ticket', 'revision', 'requestId', 'confirmed', 'externalWritersStopped', 'externalRestoreReviewed']);
        if (!validRequest(raw.requestId) || raw.confirmed !== true || raw.externalWritersStopped !== true || raw.externalRestoreReviewed !== true
            || typeof raw.ticket !== 'string' || typeof raw.revision !== 'string') throw fail('请确认外部会话、回收站和运行状态后再清理', 'IMAGE_STORAGE_INPUT', 400);
        return this.operation(async lease => {
            const lifecycle = new SessionImageLifecycle(fs.realpathSync.native((await getSdk()).getAgentDir())), dirs = lifecycle.directories(); lease.check();
            const file = this.receiptPath(dirs, cwd, raw.requestId);
            if (fs.existsSync(file)) {
                const previous = JSON.parse(readSafe(file, 2 * 1024 ** 2));
                if (!this.validReceipt(previous) || previous.ticket !== raw.ticket || previous.revision !== raw.revision || previous.cwd !== cwd) throw changed();
                return previous; // Result lookup only. Never resume an uncertain deletion.
            }
            const ticket = this.tickets.get(raw.ticket);
            if (!ticket || ticket.cwd !== cwd || ticket.revision !== raw.revision || ticket.expires <= this.now()) throw changed();
            const snapshot = await this.snapshot(cwd, lease);
            if (snapshot.revision !== ticket.revision) throw changed();
            const eligible = ticket.action === 'quarantine' ? snapshot.candidates : snapshot.purge;
            const objects = ticket.action === 'release' ? [] : ticket.ids.map(id => eligible.find(object => object.id === id));
            if (objects.some(object => !object)) throw changed();
            lease.check(); verifyAll(snapshot.proofs); this.uploads.store.resolveProject(cwd);
            const receipt = { version: 1, cwd, requestId: raw.requestId, ticket: raw.ticket, revision: raw.revision, action: ticket.action,
                ids: ticket.ids, state: 'uncertain', createdAt: new Date(this.now()).toISOString() };
            // The complete final mutation window is synchronous and leased.
            atomicJson(file, receipt); this.tickets.delete(raw.ticket);
            if (ticket.action === 'release') lifecycle.finish(ticket.ids[0], 'released');
            else for (const object of objects) {
                if (ticket.action === 'quarantine') {
                    const destination = path.join(dirs.quarantine, object.id);
                    if (fs.existsSync(destination)) fs.unlinkSync(object.file); // Both copies were independently hash-verified in this snapshot.
                    else fs.renameSync(object.file, destination);
                    const at = new Date(this.now()); fs.utimesSync(destination, at, at);
                } else fs.unlinkSync(object.file);
            }
            syncDirectory(dirs.root); syncDirectory(dirs.quarantine);
            receipt.state = 'completed'; atomicJson(file, receipt); return receipt;
        }, true);
    }
}
function mountSessionImageStorage(router, storage) {
    const respond = action => async (req, res) => {
        res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        try { res.json(await action(req)); }
        catch (error) { res.status(error.status || (error.code === 'ENOENT' ? 404 : 409)).json({ error: error.code === 'ENOENT' ? '尚无此图片清理结果' : error.message, code: error.code }); }
    };
    router.post('/session-images/storage/usage', respond(req => storage.usage(req.body)));
    router.post('/session-images/storage/preview', respond(req => storage.preview(req.body)));
    router.post('/session-images/storage/cleanup', respond(req => storage.cleanup(req.body)));
    router.get('/session-images/storage/status', respond(req => storage.status(req.query)));
}
module.exports = { SessionImageStorage, mountSessionImageStorage, RETENTION_MS };
