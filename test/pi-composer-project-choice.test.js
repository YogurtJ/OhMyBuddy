'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { once } = require('node:events'), { randomUUID } = require('node:crypto');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-composer-project-')));
const agent = path.join(root, 'agent'), source = path.join(root, 'source'), target = path.join(root, 'target');
fs.mkdirSync(agent); fs.mkdirSync(source); fs.mkdirSync(target);
Object.assign(process.env, { PI_CODING_AGENT_DIR: agent, PI_PROJECT_ROOTS: root, PI_OFFLINE: '1',
    PI_WEB_DEFERRED_FILE: path.join(root, 'deferred.json'), OHMYBUDDY_WORKSPACES_DIR: path.join(root, 'workspaces') });
const { createPiAgentGateway } = require('../server/pi-agent-routes');
const { WorkspaceAccessService } = require('../server/workspace-access-service');
test('pre-conversation project choice keeps identity, rejects started branches and revision races', async t => {
    const access = new WorkspaceAccessService({ filePath: path.join(root, 'access.json'), envToken: () => '' });
    const gateway = createPiAgentGateway({ accessService: access, deferredFilePath: process.env.PI_WEB_DEFERRED_FILE });
    const app = require('express')(); app.use(require('express').json()); gateway.mount(app);
    const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    t.after(async () => { await gateway.dispose(); access.dispose(); server.closeAllConnections(); await new Promise(r => server.close(r)); fs.rmSync(root, { recursive: true, force: true }); });
    const call = async (url, body) => { const response = await fetch(base + '/api/pi' + url, { ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
        headers: { Origin: base, 'Content-Type': 'application/json' } }); return { code: response.status, data: await response.json() }; };
    const preview = (session, onlyEmpty = true) => call('/sessions/' + session.id + '/move?' + new URLSearchParams({ cwd: session.cwd, targetCwd: target, ...(onlyEmpty ? { onlyEmpty: 'true' } : {}) }));
    const created = await call('/sessions', { standalone: true, profileId: null }); assert.equal(created.code, 201);
    const session = created.data, before = fs.readFileSync(session.path), work = path.join(session.cwd, 'retained.txt'); fs.writeFileSync(work, 'keep work files');
    const checked = await preview(session); assert.equal(checked.data.canMove, true, JSON.stringify(checked.data));
    const input = { cwd: session.cwd, targetCwd: target, expectedRevision: checked.data.revision, onlyEmpty: true, requestId: 'composer-' + randomUUID() };
    const moved = await call('/sessions/' + session.id + '/move', input); assert.equal(moved.code, 200, JSON.stringify(moved.data));
    assert.equal(moved.data.session.id, session.id); assert.equal(moved.data.session.cwd, target); assert.equal(moved.data.session.standalone, false);
    assert.equal(fs.readFileSync(work, 'utf8'), 'keep work files'); assert.equal(fs.existsSync(session.path), false);
    const after = fs.readFileSync(moved.data.session.path); assert.deepEqual(after.subarray(after.indexOf(10) + 1), before.subarray(before.indexOf(10) + 1));
    assert.equal((await call('/sessions/' + session.id + '/move', { ...input, onlyEmpty: false })).code, 409, 'request identity includes the empty-only condition');
    const { SessionManager } = await require('../server/pi-session-store').getSdk();
    const racing = await gateway.store.createSession(source, 'Synthetic empty draft');
    const check = await preview(racing); assert.equal(check.data.canMove, true);
    const manager = SessionManager.open(racing.path), emptyLeaf = manager.getLeafId(), entry = manager.appendMessage({ role: 'user', content: 'Synthetic concurrent first message', timestamp: Date.now() });
    const refused = await call('/sessions/' + racing.id + '/move', { cwd: source, targetCwd: target, onlyEmpty: true, expectedRevision: check.data.revision, requestId: 'composer-' + randomUUID() });
    assert.equal(refused.code, 409); assert.match(refused.data.error, /会话已开始/); assert.equal(fs.existsSync(racing.path), true);
    manager.branch(emptyLeaf); // An empty current branch cannot erase messages on another native branch.
    const otherBranch = await preview(racing); assert.equal(otherBranch.data.canMove, false); assert(otherBranch.data.blockers.some(text => /会话已开始/.test(text)));
    assert.equal((await preview(racing, false)).data.canMove, true, 'ordinary explicit moves retain their existing behavior');
    assert.equal((await call('/sessions/' + racing.id + '/move?' + new URLSearchParams({ cwd: source, targetCwd: target, onlyEmpty: 'false' }))).code, 409);
    assert.equal((await call('/sessions/' + racing.id + '/move', { cwd: source, targetCwd: target, onlyEmpty: 'true', expectedRevision: check.data.revision, requestId: 'composer-' + randomUUID() })).code, 409);
    assert(entry);
});
