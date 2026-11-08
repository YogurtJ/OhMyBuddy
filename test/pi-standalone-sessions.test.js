'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ohmybuddy-standalone-')));
const agentDir = path.join(root, 'agent');
fs.mkdirSync(agentDir);
Object.assign(process.env, { PI_CODING_AGENT_DIR: agentDir, PI_PROJECT_ROOTS: root, PI_OFFLINE: '1', OHMYBUDDY_WORKSPACES_DIR: path.join(root, 'workspaces') });
const { PiSessionStore, getSdk } = require('../server/pi-session-store');
const { createPiAgentGateway } = require('../server/pi-agent-routes');
const { WorkspaceAccessService } = require('../server/workspace-access-service');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('standalone HTTP creation allocates independent persistent native sessions and retains work files on deletion', { timeout: 30000 }, async t => {
    const gateway = createPiAgentGateway({ accessService: new WorkspaceAccessService({ envToken: () => 'synthetic-token' }),
        deferredFilePath: path.join(root, 'deferred.json') });
    const app = require('express')(); app.use(require('express').json()); gateway.mount(app);
    const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => { await gateway.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const call = async (method, route, body, authenticated = true) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/pi${route}`, {
            method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer synthetic-token' } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        return { status: response.status, data: await response.json() };
    };
    assert.equal((await call('GET', '/status')).data.standaloneSessions, true);
    assert.equal(fs.existsSync(gateway.store.standaloneRoot()), false, 'read-only startup must not allocate a workspace');
    assert.equal((await call('POST', '/sessions', { standalone: true }, false)).status, 401);
    for (const body of [{}, { standalone: 'true' }, { standalone: true, cwd: root }]) {
        assert.equal((await call('POST', '/sessions', body)).status, 400);
    }
    assert.equal(fs.existsSync(gateway.store.standaloneRoot()), false);
    const results = await Promise.all([call('POST', '/sessions', { standalone: true, name: 'First' }),
        call('POST', '/sessions', { standalone: true, name: 'Second', profileId: null })]);
    for (const result of results) assert.equal(result.status, 201);
    const [first, second] = results.map(result => result.data);
    assert.notEqual(first.id, second.id); assert.notEqual(first.cwd, second.cwd);
    assert.equal(path.dirname(first.cwd), gateway.store.standaloneRoot());
    assert.equal(first.standalone, true);
    const { SessionManager } = await getSdk();
    assert.equal(SessionManager.open(first.path).getCwd(), first.cwd);
    assert.equal(SessionManager.open(second.path).getSessionId(), second.id);
    fs.writeFileSync(path.join(first.cwd, 'result.txt'), 'retained output');
    if (process.platform !== 'win32') assert.equal(fs.statSync(first.cwd).mode & 0o777, 0o700);
    const reopened = new PiSessionStore();
    assert.equal((await reopened.getSession(first.cwd, first.id)).standalone, true);
    const projects = (await call('GET', '/projects')).data.projects;
    assert.equal(projects.filter(project => project.standalone).length, 2);
    assert.equal(projects.find(project => project.cwd === first.cwd).sessions[0].id, first.id);
    assert.equal(reopened.isStandaloneProject(path.join(reopened.standaloneRoot(), '-'.repeat(36))), false);
    const sessions = (await call('GET', '/sessions?cwd=' + encodeURIComponent(first.cwd))).data.sessions;
    assert.equal(sessions[0].id, first.id); assert.equal(sessions[0].standalone, true);
    assert.equal((await reopened.listSessions(second.cwd)).some(session => session.id === first.id), false);
    const locations = await reopened.listDirectories(root);
    assert.ok(locations.locations.every(location => reopened.resolveProject(location.path) === location.path));
    assert.deepEqual((await call('GET', '/sessions/' + first.id + '/workspace-cleanup?cwd=' + encodeURIComponent(first.cwd))).data,
        { standalone: true, shared: false, fileCount: 1 });
    assert.deepEqual((await call('GET', '/sessions/' + second.id + '/workspace-cleanup?cwd=' + encodeURIComponent(second.cwd))).data,
        { standalone: true, shared: false, fileCount: 0 });
    assert.equal((await call('DELETE', '/sessions/' + first.id + '?cwd=' + encodeURIComponent(first.cwd) + '&trashWorkspace=invalid')).status, 400);
    const deletedFirst = await call('DELETE', '/sessions/' + first.id + '?cwd=' + encodeURIComponent(first.cwd));
    assert.equal(deletedFirst.status, 200);
    assert.equal(deletedFirst.data.workspaceDisposition, 'retained');
    assert.equal(fs.readFileSync(path.join(first.cwd, 'result.txt'), 'utf8'), 'retained output');
    assert.equal((await reopened.getSession(second.cwd, second.id)).id, second.id);
    const deletedSecond = await call('DELETE', '/sessions/' + second.id + '?cwd=' + encodeURIComponent(second.cwd));
    assert.equal(deletedSecond.status, 200);
    assert.equal(deletedSecond.data.workspaceDisposition, 'removed-empty');
    assert.equal(fs.existsSync(second.cwd), false, 'empty unshared standalone workspace is automatically removed');
});

test('standalone workspace cleanup respects shared sessions and optional trash disposition', async () => {
    const store = new PiSessionStore();
    const sharedPrimary = await store.createStandaloneSession('Shared primary');
    const sharedSecondary = await store.createSession(sharedPrimary.cwd, 'Shared secondary');
    assert.deepEqual(await store.inspectStandaloneWorkspace(sharedPrimary.cwd, sharedPrimary.id),
        { standalone: true, shared: true, fileCount: 0 });
    const removedPrimary = await store.deleteSession(sharedPrimary.cwd, sharedPrimary.id);
    assert.equal(removedPrimary.workspaceDisposition, 'shared');
    assert.equal(fs.existsSync(sharedPrimary.cwd), true);
    const removedSecondary = await store.deleteSession(sharedPrimary.cwd, sharedSecondary.id);
    assert.equal(removedSecondary.workspaceDisposition, 'removed-empty');
    assert.equal(fs.existsSync(sharedPrimary.cwd), false);

    const withFiles = await store.createStandaloneSession('With files');
    fs.writeFileSync(path.join(withFiles.cwd, 'artifact.txt'), 'important');
    const trashDir = path.join(root, 'synthetic-trash');
    fs.mkdirSync(trashDir, { recursive: true });
    const trashedResult = await store.deleteSession(withFiles.cwd, withFiles.id, {
        trashWorkspace: true,
        trashFile: async target => {
            fs.renameSync(target, path.join(trashDir, path.basename(target)));
        }
    });
    assert.equal(trashedResult.trashed, true);
    assert.equal(trashedResult.workspaceDisposition, 'trashed');
    assert.equal(fs.existsSync(withFiles.cwd), false);
    assert.equal(fs.readFileSync(path.join(trashDir, path.basename(withFiles.cwd), 'artifact.txt'), 'utf8'), 'important');

    const trashUnavailable = await store.createStandaloneSession('Trash unavailable');
    fs.writeFileSync(path.join(trashUnavailable.cwd, 'keep.txt'), 'never rm -rf');
    const fallbackResult = await store.deleteSession(trashUnavailable.cwd, trashUnavailable.id, {
        trashWorkspace: true,
        trashFile: async () => { throw new Error('trash unavailable'); }
    });
    assert.equal(fallbackResult.trashed, false);
    assert.equal(fallbackResult.workspaceDisposition, 'retained');
    assert.match(fallbackResult.workspaceCleanupWarning, /已原位保留/);
    assert.equal(fs.readFileSync(path.join(trashUnavailable.cwd, 'keep.txt'), 'utf8'), 'never rm -rf');
});

test('standalone allocation respects roots and refuses redirected managed directories outside scope', async () => {
    const store = new PiSessionStore();
    store.roots = [];
    await assert.rejects(store.createStandaloneSession(), /不在允许范围/);
    const restricted = path.join(root, 'restricted'), outside = path.join(root, 'outside');
    fs.mkdirSync(restricted); fs.mkdirSync(outside);
    store.roots = [restricted];
    const prior = process.env.OHMYBUDDY_WORKSPACES_DIR;
    process.env.OHMYBUDDY_WORKSPACES_DIR = path.join(restricted, 'redirect');
    fs.symlinkSync(outside, process.env.OHMYBUDDY_WORKSPACES_DIR, 'junction');
    try { await assert.rejects(store.createStandaloneSession(), /不在允许范围|Storage/); }
    finally { process.env.OHMYBUDDY_WORKSPACES_DIR = prior; }
    assert.deepEqual(fs.readdirSync(outside), []);
});
