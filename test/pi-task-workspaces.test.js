'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-task-cleanup-')));
const agent = path.join(root, 'agent'); fs.mkdirSync(agent);
Object.assign(process.env, { PI_CODING_AGENT_DIR: agent, PI_PROJECT_ROOTS: root, PI_OFFLINE: '1', OHMYBUDDY_WORKSPACES_DIR: path.join(root, 'workspaces') });
const { PiSessionStore } = require('../server/pi-session-store');
const { PiSessionTransfer } = require('../server/pi-session-transfer');
const { createPiAgentGateway } = require('../server/pi-agent-routes');
const unlink = async file => fs.unlinkSync(file);
const revision = async (store, task) => (await store.inspectStandaloneWorkspace(task.cwd, task.id)).workspaceRevision;
const barrier = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('HTTP deletion excludes native publishers and runtime startup for both default empty and explicit nonempty cleanup', { timeout: 30000 }, async t => {
    const gateway = createPiAgentGateway({ deferredFilePath: path.join(root, 'deferred.json'),
        accessService: new (require('../server/workspace-access-service').WorkspaceAccessService)({ envToken: () => 'fixture' }) });
    const app = require('express')(); app.use(require('express').json()); gateway.mount(app);
    const server = require('node:http').createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => { await gateway.dispose(); server.closeAllConnections(); await new Promise(done => server.close(done)); });
    const call = async (method, route, body, auth = true) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/pi${route}`, { method,
            headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer fixture' } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: response.status, data: await response.json() };
    };
    const original = gateway.store.deleteSession.bind(gateway.store);
    for (const withFiles of [false, true]) {
        const task = (await call('POST', '/sessions', { standalone: true, profileId: null })).data;
        if (withFiles) fs.writeFileSync(path.join(task.cwd, 'output.txt'), 'valuable');
        const preview = (await call('GET', `/sessions/${task.id}/workspace-cleanup?cwd=${encodeURIComponent(task.cwd)}`)).data;
        const entered = barrier(), release = barrier(), requestId = randomUUID(), saved = path.join(root, 'saved-' + requestId);
        gateway.store.deleteSession = (cwd, id, options) => original(cwd, id, { ...options,
            trashFile: async file => { fs.unlinkSync(file); entered.resolve(); await release.promise; },
            trashDirectory: async directory => { assert.equal(withFiles, true); fs.renameSync(directory, saved); } });
        const query = new URLSearchParams({ cwd: task.cwd, workspaceRequestId: requestId,
            ...(withFiles ? { trashWorkspace: 'true', workspaceRevision: preview.workspaceRevision } : {}) });
        const deleting = call('DELETE', `/sessions/${task.id}?${query}`);
        try {
            await Promise.race([entered.promise, deleting.then(value => { throw new Error('Deletion did not reach barrier: ' + JSON.stringify(value)); })]);
            assert.equal((await call('GET', '/activity')).data.taskWorkspacesBusy, true);
            const pending = await call('GET', `/workspace-cleanups/${requestId}?cwd=${encodeURIComponent(task.cwd)}`);
            assert.equal(pending.data.state, 'pending'); assert.equal(pending.data.sessionDeleted, false);
            assert.equal((await call('GET', `/workspace-cleanups/${requestId}?cwd=${encodeURIComponent(task.cwd)}`, undefined, false)).status, 401);
            assert.ok((await call('POST', '/sessions', { cwd: task.cwd, profileId: null })).status >= 400);
            const anotherStore = new PiSessionStore();
            await assert.rejects(anotherStore.createSession(task.cwd), /正在清理/);
            await assert.rejects(gateway.store.forkSession(task, {}, undefined), /正在清理/);
            const transfer = new PiSessionTransfer({ store: gateway.store, supervisor: gateway.supervisor });
            await assert.rejects(transfer.import(task.cwd, 'not parsed during cleanup', randomUUID()), /正在清理/);
            for (const [cwd, targetCwd] of [[root, task.cwd], [task.cwd, root]]) {
                await assert.rejects(gateway.sessionMoves.move(cwd, task.id, { cwd, targetCwd, requestId: randomUUID(), expectedRevision: '0'.repeat(64) }), /正在清理/);
            }
            await assert.rejects(gateway.supervisor.getWorker({ cwd: task.cwd, sessionPath: task.path, sessionId: task.id }), /正在清理/);
            await assert.rejects(gateway.supervisor.createEphemeralWorker(task.cwd), /正在清理/);
        } finally { release.resolve(); }
        const deleted = await deleting;
        assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
        assert.equal(deleted.data.workspaceDisposition, withFiles ? 'trashed' : 'removed-empty');
        assert.equal(fs.existsSync(task.cwd), false);
        if (withFiles) assert.equal(fs.readFileSync(path.join(saved, 'output.txt'), 'utf8'), 'valuable');
        const status = await call('GET', `/workspace-cleanups/${requestId}?cwd=${encodeURIComponent(task.cwd)}`);
        assert.equal(status.data.sessionDeleted, true); assert.equal(status.data.result.workspaceDisposition, deleted.data.workspaceDisposition);
        assert.equal(gateway.store.taskWorkspaces.busy, false);
    }
});

test('a publisher admitted before deletion keeps the workspace until its new native session is durable', async () => {
    const store = new PiSessionStore(), task = await store.createStandaloneSession();
    const entered = barrier(), release = barrier();
    store.profiles = { select: async () => { entered.resolve(); await release.promise; return null; }, describe: async () => null, state: async () => null };
    const creating = store.createSession(task.cwd, 'concurrent survivor');
    await entered.promise;
    try {
        const deleted = await store.deleteSession(task.cwd, task.id, { trashFile: unlink });
        assert.equal(deleted.workspaceDisposition, 'retained');
        assert.match(deleted.workspaceCleanupWarning, /文件操作/);
        assert.equal(fs.existsSync(task.cwd), true);
    } finally { release.resolve(); }
    const survivor = await creating;
    assert.equal((await store.listSessions(task.cwd)).some(row => row.id === survivor.id), true);
    assert.equal(store.taskWorkspaces.busy, false);
});

test('preview binds directory identity and rejects replacements before stopping or deleting the session', async () => {
    const store = new PiSessionStore(), task = await store.createStandaloneSession(), expected = await revision(store, task);
    fs.renameSync(task.cwd, task.cwd + '-original'); fs.mkdirSync(task.cwd); fs.writeFileSync(path.join(task.cwd, 'unconfirmed'), 'keep');
    for (const trashWorkspace of [false, true])
        await assert.rejects(store.deleteSession(task.cwd, task.id, { trashWorkspace, workspaceRevision: expected, trashFile: unlink }), /确认版本/);
    assert.equal(fs.existsSync(task.path), true); assert.equal(fs.readFileSync(path.join(task.cwd, 'unconfirmed'), 'utf8'), 'keep');
    assert.equal(store.taskWorkspaces.busy, false);
});

test('replacement during native deletion never sends the unconfirmed directory to trash', async () => {
    const store = new PiSessionStore(), task = await store.createStandaloneSession();
    fs.writeFileSync(path.join(task.cwd, 'original'), 'old');
    let calls = 0;
    const result = await store.deleteSession(task.cwd, task.id, { trashWorkspace: true, workspaceRevision: await revision(store, task),
        trashFile: async file => { fs.unlinkSync(file); fs.renameSync(task.cwd, task.cwd + '-saved'); fs.mkdirSync(task.cwd); fs.writeFileSync(path.join(task.cwd, 'replacement'), 'new'); },
        trashDirectory: async () => { calls++; } });
    assert.equal(calls, 0); assert.equal(result.workspaceDisposition, 'uncertain'); assert.equal(result.workspaceRemoved, false);
    assert.equal(fs.readFileSync(path.join(task.cwd, 'replacement'), 'utf8'), 'new');
    assert.equal(fs.readFileSync(path.join(task.cwd + '-saved', 'original'), 'utf8'), 'old');
});

test('native references in descendant working folders and live ephemeral runtimes preserve the whole tree', async () => {
    for (const kind of ['native', 'ephemeral', 'retiring']) {
        const native = kind === 'native';
        const store = new PiSessionStore(), task = await store.createStandaloneSession(), nested = path.join(task.cwd, 'nested'); fs.mkdirSync(nested);
        let child;
        if (native) child = await store.createSession(nested);
        else store.taskWorkspaces.supervisor = { workers: new Map(), ephemeralWorkers: new Set([{ cwd: nested, disposed: kind === 'retiring' }]) };
        const preview = await store.inspectStandaloneWorkspace(task.cwd, task.id);
        assert.equal(preview.shared, true); assert.equal(preview.canTrash, false);
        const result = await store.deleteSession(task.cwd, task.id, { trashWorkspace: true, workspaceRevision: preview.workspaceRevision, trashFile: unlink,
            trashDirectory: async () => assert.fail('shared directory must never enter trash') });
        assert.equal(result.workspaceDisposition, 'shared'); assert.equal(fs.existsSync(nested), true);
        if (native) assert.equal((await store.getSession(nested, child.id)).id, child.id);
        store.taskWorkspaces.supervisor = null;
    }
});

test('unparseable native sessions fail closed for default empty cleanup', async () => {
    const bad = path.join(agent, 'sessions', 'opaque'); fs.mkdirSync(bad); fs.writeFileSync(path.join(bad, 'bad.jsonl'), '{broken');
    try {
        const store = new PiSessionStore(), task = await store.createStandaloneSession();
        const preview = await store.inspectStandaloneWorkspace(task.cwd, task.id);
        assert.equal(preview.unavailable, true); assert.equal(preview.canTrash, false);
        const result = await store.deleteSession(task.cwd, task.id, { trashFile: unlink });
        assert.equal(result.workspaceDisposition, 'retained'); assert.match(result.workspaceCleanupWarning, /无法完整核对/);
        assert.equal(fs.existsSync(task.cwd), true);
    } finally { fs.rmSync(bad, { recursive: true, force: true }); }
});

test('missing trash executable reports a durable recovery path, never an absent disposition or false in-place retention', async () => {
    const store = new PiSessionStore(), task = await store.createStandaloneSession(); fs.writeFileSync(path.join(task.cwd, 'work.txt'), 'recover me');
    const requestId = randomUUID(); let calls = 0;
    const result = await store.deleteSession(task.cwd, task.id, { trashWorkspace: true, workspaceRevision: await revision(store, task), workspaceRequestId: requestId,
        trashFile: unlink, trashDirectory: async () => { calls++; throw Object.assign(new Error('spawn gio ENOENT'), { code: 'ENOENT' }); } });
    assert.equal(calls, 1); assert.equal(result.workspaceDisposition, 'recovery'); assert.match(result.workspaceCleanupWarning, /恢复目录/);
    assert.equal(result.workspaceRemoved, true); assert.equal(fs.readFileSync(path.join(result.workspaceRecoveryPath, 'work.txt'), 'utf8'), 'recover me');
    const reopened = new PiSessionStore(), status = await reopened.taskWorkspaces.status(task.cwd, requestId);
    assert.equal(status.state, 'recovery'); assert.equal(status.sessionDeleted, true);
    const { id, trashed, ...workspaceResult } = result; assert.deepEqual(status.result, workspaceResult);
    if (process.platform !== 'win32') {
        assert.equal(fs.statSync(path.dirname(result.workspaceRecoveryPath)).mode & 0o777, 0o700);
        assert.equal(fs.statSync(path.join(agent, 'ohmybuddy-task-workspaces', requestId + '.json')).mode & 0o777, 0o600);
    }
});

test('a trash move followed by timeout is uncertain and status/reused request IDs never replay it', async () => {
    const store = new PiSessionStore(), task = await store.createStandaloneSession(); fs.writeFileSync(path.join(task.cwd, 'work'), 'keep');
    const saved = path.join(root, 'timeout-trash'), requestId = randomUUID(); let calls = 0;
    const trashDirectory = async directory => { calls++; fs.renameSync(directory, saved); throw Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }); };
    const result = await store.deleteSession(task.cwd, task.id, { trashWorkspace: true, workspaceRevision: await revision(store, task), workspaceRequestId: requestId, trashFile: unlink, trashDirectory });
    assert.equal(result.workspaceDisposition, 'uncertain'); assert.equal(result.workspaceRemoved, true);
    assert.doesNotMatch(result.workspaceCleanupWarning, /原位保留/); assert.equal(fs.readFileSync(path.join(saved, 'work'), 'utf8'), 'keep');
    assert.equal((await store.taskWorkspaces.status(task.cwd, requestId)).state, 'uncertain');
    fs.mkdirSync(task.cwd); const later = await store.createSession(task.cwd);
    await assert.rejects(store.deleteSession(later.cwd, later.id, { workspaceRequestId: requestId, trashFile: unlink, trashDirectory }), /已有记录/);
    assert.equal(fs.existsSync(later.path), true); assert.equal(calls, 1); assert.equal(store.taskWorkspaces.busy, false);
});

test('replacement at the final rename boundary is preserved without sending either object to trash', async () => {
    const store = new PiSessionStore(), task = await store.createStandaloneSession(); fs.writeFileSync(path.join(task.cwd, 'original'), 'original');
    const expected = await revision(store, task), rename = fs.renameSync; let calls = 0, result;
    fs.renameSync = (from, to) => {
        if (from === task.cwd) { rename(from, task.cwd + '-saved'); fs.mkdirSync(from); fs.writeFileSync(path.join(from, 'unconfirmed'), 'replacement'); }
        return rename(from, to);
    };
    try { result = await store.deleteSession(task.cwd, task.id, { trashWorkspace: true, workspaceRevision: expected, trashFile: unlink, trashDirectory: async () => { calls++; } }); }
    finally { fs.renameSync = rename; }
    assert.equal(calls, 0); assert.equal(result.workspaceDisposition, 'uncertain');
    const record = JSON.parse(fs.readFileSync(path.join(agent, 'ohmybuddy-task-workspaces', result.workspaceRequestId + '.json'), 'utf8'));
    assert.equal(fs.readFileSync(path.join(record.stage, 'unconfirmed'), 'utf8'), 'replacement');
    assert.equal(fs.readFileSync(path.join(task.cwd + '-saved', 'original'), 'utf8'), 'original');
});

test('staging paths reject publication during trash and after a timeout, including a fresh process', { timeout: 15000 }, async () => {
    const store = new PiSessionStore(), task = await store.createStandaloneSession(); fs.writeFileSync(path.join(task.cwd, 'work'), 'protected');
    const entered = barrier(), release = barrier(); let stage;
    const deleting = store.deleteSession(task.cwd, task.id, { trashWorkspace: true, workspaceRevision: await revision(store, task), trashFile: unlink,
        trashDirectory: async directory => { stage = directory; entered.resolve(); await release.promise; throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }); } });
    try {
        await Promise.race([entered.promise, deleting.then(() => assert.fail('trash did not reach the barrier'))]);
        const reopened = new PiSessionStore();
        for (const target of [stage, path.dirname(stage), path.join(stage, 'future-child')])
            await assert.rejects(reopened.createSession(target), /恢复目录不能作为工作目录/);
    } finally { release.resolve(); }
    const result = await deleting;
    assert.equal(result.workspaceDisposition, 'uncertain'); assert.equal(result.workspaceStagingPath, stage);
    assert.equal(result.workspaceRecoveryPath, undefined); assert.equal(store.taskWorkspaces.busy, false);
    assert.equal(fs.readFileSync(path.join(stage, 'work'), 'utf8'), 'protected');
    const child = require('node:child_process').spawnSync(process.execPath, ['-e', `
        new (require('./server/pi-session-store').PiSessionStore)().createSession(process.argv[1])
            .then(() => { process.exitCode = 1; }, error => {
                if (!error.message.includes('恢复目录不能作为工作目录')) { console.error(error.message); process.exitCode = 1; }
            });`, stage], { cwd: path.resolve(__dirname, '..'), timeout: 5000, encoding: 'utf8',
        env: { PATH: process.env.PATH, PI_CODING_AGENT_DIR: agent, PI_PROJECT_ROOTS: root, PI_OFFLINE: '1', OHMYBUDDY_WORKSPACES_DIR: path.join(root, 'workspaces') } });
    assert.equal(child.status, 0, child.stderr);
});

test('successful command cannot claim recovery when the staging path now names a replacement object', async () => {
    const store = new PiSessionStore(), task = await store.createStandaloneSession(); fs.writeFileSync(path.join(task.cwd, 'original'), 'original');
    const saved = path.join(root, 'post-trash-original'); let stage;
    const result = await store.deleteSession(task.cwd, task.id, { trashWorkspace: true, workspaceRevision: await revision(store, task), trashFile: unlink,
        trashDirectory: async directory => { stage = directory; fs.renameSync(stage, saved); fs.mkdirSync(stage); fs.writeFileSync(path.join(stage, 'unconfirmed'), 'replacement'); } });
    assert.equal(result.workspaceDisposition, 'uncertain'); assert.equal(result.workspaceRecoveryPath, undefined);
    assert.equal(fs.readFileSync(path.join(saved, 'original'), 'utf8'), 'original');
    assert.equal(fs.readFileSync(path.join(stage, 'unconfirmed'), 'utf8'), 'replacement');
});

test('macOS trash rejects a missing synthetic path with an ordinary error rather than crashing', { skip: process.platform !== 'darwin' }, async () => {
    await assert.rejects(require('../server/pi-task-workspace-trash').trashTaskDirectory(path.join(root, 'nonexistent-' + randomUUID())),
        error => error.code === 1 && !error.signal && /System directory trash did not complete/.test(error.stderr));
});
