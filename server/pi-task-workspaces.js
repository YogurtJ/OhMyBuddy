'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const io = require('./pi-file-io');
const { descriptorPathSync } = require('./pi-file-descriptor');
const { sessionListRevision } = require('./pi-session-list-revision');
const { privateDir, atomicJson, readSafe } = require('./pi-maintenance-files');
const within = (root, file) => file === root || file.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = message => Object.assign(new Error(message), { status: 409, code: 'TASK_WORKSPACE_CHANGED' });
const ID = /^[A-Za-z0-9_-]{16,80}$/;
const coordinators = new Map();
const identity = stat => ['dev', 'ino', 'birthtimeNs', 'mode', 'uid', 'gid'].map(k => String(stat[k])).join(':');
const stamp = stat => [identity(stat), stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');
function canonical(input) {
    const name = path.resolve(require('./pi-platform-path').windowsPath(String(input || '')));
    let parent = name; const tail = [];
    for (let depth = 0; depth < 256; depth++) {
        try { return path.join(fs.realpathSync.native(parent), ...tail); }
        catch (error) {
            if (error.code !== 'ENOENT' || path.dirname(parent) === parent) throw error;
            tail.unshift(path.basename(parent)); parent = path.dirname(parent);
        }
    }
    throw fail('工作目录路径超过检查预算');
}
function pin(directory) {
    const listed = fs.lstatSync(directory, { bigint: true });
    if (!listed.isDirectory() || listed.isSymbolicLink() || fs.realpathSync.native(directory) !== directory) throw fail('工作目录身份已变化，请重新检查');
    const fd = io.openReadSync(directory);
    try {
        const before = fs.fstatSync(fd, { bigint: true }), native = io.identity(fd);
        const value = identity(before), initial = stamp(before);
        const check = (at = directory) => {
            const current = fs.lstatSync(at, { bigint: true });
            if (!current.isDirectory() || current.isSymbolicLink() || identity(current) !== value
                || identity(fs.fstatSync(fd, { bigint: true })) !== value || !io.sameIdentityAtPath(at, native)
                || descriptorPathSync(fd) !== at || fs.realpathSync.native(at) !== at) throw fail('工作目录身份已变化，请重新检查');
        };
        if (stamp(listed) !== initial) throw fail('工作目录在读取时变化，请重新检查');
        check();
        return { fd, identity: value, native, initial, check, stamp: () => stamp(fs.fstatSync(fd, { bigint: true })), close: () => fs.closeSync(fd) };
    } catch (error) { fs.closeSync(fd); throw error; }
}
function syncDirectory(directory) {
    if (process.platform === 'win32') return;
    const fd = io.openReadSync(directory);
    try {
        if (!fs.fstatSync(fd).isDirectory() || descriptorPathSync(fd) !== directory) throw fail('处理记录目录已变化');
        fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
}
function entries(directory) {
    const result = [];
    const handle = fs.opendirSync(directory);
    try {
        let entry;
        while ((entry = handle.readSync())) {
            if (result.length >= 10000) throw fail('目录项目过多，工作目录将保留');
            result.push(entry);
        }
        return result;
    } finally { handle.closeSync(); }
}

// Coordinates cooperating native publishers and runtime startup. No conversation
// data is copied here. Unknown scans/operations never authorize another removal.
class TaskWorkspaces {
    constructor(store, getSdk) {
        Object.assign(this, { store, getSdk });
        const identity = canonical(process.env.PI_CODING_AGENT_DIR || path.join(require('node:os').homedir(), '.pi', 'agent'));
        if (!coordinators.has(identity)) coordinators.set(identity, { identity, uses: new Map(), removing: new Set(), scans: 0, owners: new Set() });
        this.coordination = coordinators.get(identity);
        this.uses = this.coordination.uses; this.removing = this.coordination.removing;
    }
    get scans() { return this.coordination.scans; }
    set scans(value) { this.coordination.scans = value; }
    get supervisor() { return this.runtimeOwner; }
    set supervisor(value) {
        this.coordination.owners.delete(this);
        this.runtimeOwner = value;
        if (value) this.coordination.owners.add(this);
    }
    externalOperations() {
        return Boolean(this.externalBusy?.() || [...this.coordination.owners].some(owner => owner !== this && owner.externalBusy?.()));
    }
    get busy() { return this.removing.size > 0 || this.scans > 0 || this.uses.size > 0 || [...this.coordination.owners].some(owner => owner.runtimeOwner.disposing); }
    stagingPath(input) {
        let directory = input;
        for (let depth = 0; depth < 256; depth++) {
            if (path.basename(directory).startsWith('.ohmybuddy-cleanup-')
                && this.store.isStandaloneProject(path.join(path.dirname(directory), '00000000-0000-4000-8000-000000000000'))) return true;
            const parent = path.dirname(directory); if (parent === directory) return false; directory = parent;
        }
        throw fail('工作目录路径超过检查预算');
    }
    use(inputs, action) {
        let names;
        try { names = [...new Set((Array.isArray(inputs) ? inputs : [inputs]).filter(Boolean).map(canonical))]; }
        catch (error) { return Promise.reject(error); }
        try {
            if (names.some(name => this.stagingPath(name))) return Promise.reject(fail('任务恢复目录不能作为工作目录，请先核对并复制文件到普通目录'));
        } catch (error) { return Promise.reject(error); }
        if (names.some(name => [...this.removing].some(root => within(root, name))))
            return Promise.reject(fail('任务工作目录正在清理，请稍后再试'));
        for (const name of names) this.uses.set(name, (this.uses.get(name) || 0) + 1);
        const release = () => {
            for (const name of names) { const n = this.uses.get(name) - 1; if (n) this.uses.set(name, n); else this.uses.delete(name); }
        };
        // Enter synchronously: Supervisor publishes startup ownership before its first await.
        try { return Promise.resolve(action()).finally(release); }
        catch (error) { release(); return Promise.reject(error); }
    }
    prepare(input, sessionId, options = {}) {
        if (options.workspaceRequestId !== undefined && (typeof options.workspaceRequestId !== 'string' || !ID.test(options.workspaceRequestId))) throw fail('工作目录请求编号无效');
        const cwd = this.store.resolveProject(input);
        if (!this.store.isStandaloneProject(cwd)) {
            if (options.trashWorkspace) throw fail('只能清理独立任务工作目录');
            return null;
        }
        if ([...this.removing].some(root => within(root, cwd) || within(cwd, root))) throw fail('任务工作目录正在清理，请稍后再试');
        const busy = [...this.uses.keys()].some(name => within(cwd, name)) || this.externalOperations();
        if (!busy) this.removing.add(cwd); // reserve synchronously, before any await
        let root, directory;
        try {
            root = pin(path.dirname(cwd)); directory = pin(cwd);
            const revision = hash([cwd, root.identity, root.native, directory.initial, directory.native]);
            if ((options.trashWorkspace || options.workspaceRevision !== undefined) && options.workspaceRevision !== revision) throw fail('工作目录已变化或缺少确认版本，请重新打开删除窗口');
            let closed = false;
            return { owner: this, cwd, sessionId, busy, root, directory, revision,
                id: options.workspaceRequestId || randomUUID(), trash: options.trashWorkspace === true,
                check() { root.check(); directory.check(); },
                close: () => { if (closed) return; closed = true; if (!busy) this.removing.delete(cwd); for (const h of [directory, root]) { try { h.close(); } catch {} } } };
        } catch (error) { if (!busy) this.removing.delete(cwd); for (const h of [directory, root]) { try { h?.close(); } catch {} } throw error; }
    }
    async references(session, { preview = false } = {}) {
        this.scans++;
        const handles = [];
        try {
            const sdk = await this.getSdk(), agent = fs.realpathSync.native(sdk.getAgentDir());
            if (agent !== this.coordination.identity) throw fail('原生身份目录已变化');
            const root = fs.realpathSync.native(path.join(agent, 'sessions'));
            const rootHandle = pin(root); handles.push(rootHandle);
            const folders = entries(root), membership = folders.map(e => e.name).sort();
            if (folders.length > 1000) throw fail('会话目录数量超过清理检查预算');
            const proofs = []; let count = 0, bytes = 0, shared = false;
            for (const entry of folders) {
                if (!entry.isDirectory()) { if (entry.isSymbolicLink() || entry.name.endsWith('.jsonl')) throw fail('会话目录无法完整核对'); continue; }
                const folder = path.join(root, entry.name);
                if (entries(folder).some(child => child.isDirectory() || child.isSymbolicLink())) throw fail('存在无法完整核对的原生会话子目录');
                const proof = sessionListRevision(folder);
                if (!proof) throw fail('会话目录无法完整核对');
                const members = JSON.parse(proof)[3]; count += members.length;
                for (const [, stat] of members) { const size = Number(stat.split(':')[3]); if (size > 64 * 1024 ** 2) throw fail('会话文件超过清理检查预算'); bytes += size; }
                if (count > 10000 || bytes > 256 * 1024 ** 2) throw fail('会话引用检查超过预算');
                const rows = await this.store.sessionMetadata.list(folder, sdk, () => sdk.SessionManager.list(undefined, folder));
                if (rows.length !== members.length) throw fail('存在无法解析的会话，工作目录将保留');
                const names = new Set(members.map(([name]) => path.join(folder, name)));
                for (const row of rows) {
                    if (!names.delete(row.path) || typeof row.id !== 'string' || !row.id || typeof row.cwd !== 'string' || !path.isAbsolute(row.cwd)) throw fail('会话引用无法完整核对');
                    if ((!preview || row.path !== session.path || row.id !== session.id) && within(session.cwd, canonical(row.cwd))) shared = true;
                }
                if (names.size || sessionListRevision(folder) !== proof) throw fail('会话目录在检查期间变化');
                proofs.push([folder, proof]);
            }
            rootHandle.check();
            if (rootHandle.stamp() !== rootHandle.initial || JSON.stringify(entries(root).map(e => e.name).sort()) !== JSON.stringify(membership)) throw fail('会话目录在检查期间变化');
            for (const [folder, proof] of proofs) if (sessionListRevision(folder) !== proof) throw fail('会话引用在检查期间变化');
            const workers = [];
            for (const supervisor of new Set([...this.coordination.owners].map(owner => owner.runtimeOwner))) {
                if (supervisor.disposing) throw fail('运行管理器仍在停止，工作目录将保留');
                workers.push(...(supervisor.workers?.values() || []), ...(supervisor.ephemeralWorkers || []));
            }
            for (const worker of workers) {
                if (typeof worker.cwd !== 'string' || !path.isAbsolute(worker.cwd)) throw fail('运行实例目录无法完整核对');
                if (within(session.cwd, canonical(worker.cwd))
                    && !(preview && worker.sessionPath === session.path && worker.sessionId === session.id)) shared = true;
            }
            return { complete: true, shared };
        } catch { return { complete: false, shared: false }; }
        finally { for (const handle of handles) { try { handle.close(); } catch {} } this.scans--; }
    }
    async preview(session) {
        if (!session.standalone) return { standalone: false };
        const root = pin(path.dirname(session.cwd)); let directory;
        try {
            directory = pin(session.cwd);
            const revision = hash([session.cwd, root.identity, root.native, directory.initial, directory.native]);
            const refs = await this.references(session, { preview: true });
            root.check(); directory.check();
            if (directory.stamp() !== directory.initial) throw fail('工作目录已变化，请重新检查');
            const fileCount = refs.shared ? 0 : entries(session.cwd).length;
            return { standalone: true, shared: refs.shared, fileCount, workspaceRevision: revision,
                canTrash: refs.complete && !refs.shared && require('./pi-task-workspace-trash').trashTaskDirectory.supported, ...(!refs.complete ? { unavailable: true } : {}) };
        } finally { for (const handle of [directory, root]) { try { handle?.close(); } catch {} } }
    }
    async record(context, session) {
        if (!context) return;
        context.check();
        const { getAgentDir } = await this.getSdk();
        context.check();
        const directory = privateDir(path.join(getAgentDir(), 'ohmybuddy-task-workspaces'));
        const file = path.join(directory, context.id + '.json');
        if (fs.existsSync(file)) throw fail('该目录清理请求已有记录，请查询原结果，不要重试');
        const record = { version: 1, id: context.id, cwd: context.cwd, sessionId: session.id, state: 'pending', sessionDeleted: false,
            directoryIdentity: context.directory.identity, nativeIdentity: context.directory.native, createdAt: new Date().toISOString() };
        // Exclusive intent reservation. Later transitions are private atomic replacements.
        require('./pi-private-files').writePrivateFileSync(file, JSON.stringify(record) + '\n', true);
        syncDirectory(directory);
        context.file = file; context.record = record;
    }
    save(context, state, extra = {}) {
        context.record = { ...context.record, state, ...extra, updatedAt: new Date().toISOString() };
        atomicJson(context.file, context.record);
        return context.record;
    }
    async finish(context, session, trash) {
        if (!context) return {};
        let slot, slotHandle, stage;
        const result = (state, warning, extra = {}) => {
            const value = { workspaceRequestId: context.id, workspaceDisposition: state,
                ...(state === 'uncertain' && stage ? { workspaceStagingPath: stage } : {}), ...extra,
                ...(warning ? { workspaceCleanupWarning: warning } : {}) };
            try { this.save(context, state, { sessionDeleted: true, result: value, ...(stage ? { stage } : {}) }); }
            catch { value.workspaceCleanupWarning = '工作目录处理记录待核对，请保留相关文件'; }
            return value;
        };
        const originalPresent = () => { try { context.check(); return true; } catch { return false; } };
        const pathMissing = () => { try { context.root.check(); fs.lstatSync(context.cwd); return false; } catch (error) { return error.code === 'ENOENT'; } };
        try {
            this.save(context, 'checking', { sessionDeleted: true });
            context.check();
            if (context.busy) return result('retained', '工作目录仍有文件操作，已保留');
            const refs = await this.references(session);
            context.check();
            if (this.externalOperations()) return result('retained', '工作目录仍有文件操作，已保留');
            if (!refs.complete) return result('retained', '无法完整核对工作目录引用，已保留');
            if (refs.shared) return result('shared', '工作目录或子目录仍有其他会话使用，已保留');
            const files = entries(context.cwd);
            if (files.length && !context.trash) return result('retained');
            if (files.length && trash.supported === false) return result('retained', '当前平台无法安全移入回收站，工作文件已保留');
            if (context.directory.stamp() !== context.directory.initial) return result('retained', '工作目录内容已变化，工作文件已保留');
            context.check();
            slot = fs.mkdtempSync(path.join(path.dirname(context.cwd), '.ohmybuddy-cleanup-'));
            require('./pi-private-files').privateDirectory(slot); slotHandle = pin(slot);
            stage = path.join(slot, path.basename(context.cwd));
            this.save(context, 'prepared', { stage });
            context.check(); slotHandle.check();
            fs.renameSync(context.cwd, stage);
            // Verify the moved object through the original opened descriptor.
            context.root.check(); slotHandle.check(); context.directory.check(stage);
            syncDirectory(path.dirname(context.cwd)); syncDirectory(slot);
            this.save(context, 'staged', { stage });
            if (!files.length) {
                context.directory.check(stage); slotHandle.check(); fs.rmdirSync(stage);
                return result('removed-empty', null, { workspaceRemoved: true });
            }
            this.save(context, 'trashing', { stage });
            context.directory.check(stage); slotHandle.check();
            try { await trash(stage); }
            catch (error) {
                const uncertain = error?.killed || error?.signal || ['ETIMEDOUT', 'ABORT_ERR', 'ERR_CHILD_PROCESS_TIMEOUT'].includes(error?.code);
                if (uncertain) return result('uncertain', '工作目录回收结果不确定，请核对回收站和处理记录', { workspaceRemoved: pathMissing() });
                try { context.root.check(); slotHandle.check(); context.directory.check(stage); return result('recovery', '回收站未完成，工作文件保存在恢复目录', { workspaceRemoved: true, workspaceRecoveryPath: stage }); }
                catch { return result('uncertain', '工作目录回收结果不确定，请核对回收站和处理记录', { workspaceRemoved: pathMissing() }); }
            }
            context.root.check(); slotHandle.check();
            let missing = false;
            try { fs.lstatSync(stage); }
            catch (error) { if (error.code !== 'ENOENT') throw error; missing = true; }
            context.root.check(); slotHandle.check();
            if (missing) return result('trashed', null, { workspaceRemoved: true });
            context.directory.check(stage);
            return result('recovery', '回收站未移走工作文件，文件保存在恢复目录', { workspaceRemoved: true, workspaceRecoveryPath: stage });
        } catch {
            if (originalPresent()) return result('retained', '工作目录清理未完成，原目录已保留');
            if (stage) {
                try { context.root.check(); slotHandle.check(); context.directory.check(stage);
                    return result('recovery', '清理未完成，工作文件保存在恢复目录', { workspaceRemoved: pathMissing(), workspaceRecoveryPath: stage });
                } catch {}
            }
            return result('uncertain', '工作目录身份或处理结果已变化，请核对处理记录', { workspaceRemoved: pathMissing() });
        } finally {
            // Never recursively clean a staging area. A recovery/unknown object stays there.
            if (slotHandle) { try { context.root.check(); slotHandle.check(); fs.rmdirSync(slot); } catch {} }
            try { slotHandle?.close(); } catch {}
        }
    }
    async status(input, id) {
        if (typeof id !== 'string' || !ID.test(id) || typeof input !== 'string' || !path.isAbsolute(input)) throw fail('工作目录清理查询参数无效');
        const { getAgentDir } = await this.getSdk();
        const directory = fs.realpathSync.native(path.join(getAgentDir(), 'ohmybuddy-task-workspaces'));
        const value = JSON.parse(readSafe(path.join(directory, id + '.json'), 65536));
        if (value.version !== 1 || value.id !== id || value.cwd !== path.resolve(input) || !this.store.roots.some(root => within(root, value.cwd))) throw fail('工作目录清理记录不属于当前范围');
        return { id, state: value.state, sessionDeleted: value.sessionDeleted === true, result: value.result || null };
    }
}
module.exports = { TaskWorkspaces };
