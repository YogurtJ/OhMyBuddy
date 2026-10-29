'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ohmybuddy-categories-retired-')));
const agentDir = path.join(root, 'agent'), cwd = path.join(root, 'work');
for (const folder of [agentDir, cwd]) fs.mkdirSync(folder, { recursive: true });
Object.assign(process.env, { PI_CODING_AGENT_DIR: agentDir, PI_PROJECT_ROOTS: root, PI_OFFLINE: '1' });
const { createPiAgentGateway } = require('../server/pi-agent-routes');
const { WorkspaceAccessService } = require('../server/workspace-access-service');

test('retired categories reject legacy calls without touching native history, profiles or legacy storage', { timeout: 30000 }, async t => {
    const gateway = createPiAgentGateway({ accessService: new WorkspaceAccessService({ envToken: () => 'synthetic-token' }),
        deferredFilePath: path.join(root, 'deferred.json') });
    const app = require('express')(); app.use(require('express').json()); gateway.mount(app);
    const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => {
        await gateway.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        fs.rmSync(root, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${server.address().port}/api/pi`;
    const call = async (method, url, body, authenticated = true) => {
        const res = await fetch(base + url, { method, headers: { ...(authenticated ? { Authorization: 'Bearer synthetic-token' } : {}),
            'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: res.status, cache: res.headers.get('cache-control'), body: await res.json() };
    };
    const saved = await call('PUT', '/profiles', { expectedRevision: (await call('GET', '/profiles')).body.revision,
        profile: { name: 'Retained identity', description: '', soul: 'Preserved soul', enabled: true,
            memory: { enabled: false, autoLearn: false }, skills: { learnedEnabled: true } } });
    const id = saved.body.profile.id;
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const legacyFile = path.join(path.dirname((await gateway.store.profiles.paths()).file), 'assistant-projects.json');
    // Even malformed obsolete configuration must not prevent listing/opening sessions.
    fs.writeFileSync(legacyFile, '{retained invalid legacy registry');
    const legacyBytes = fs.readFileSync(legacyFile);
    const original = (await call('POST', '/sessions', { cwd, profileId: id })).body;
    const manager = SessionManager.open(original.path);
    manager.appendCustomEntry('pivane-assistant-project', { version: 1, sessionId: original.id, cwd,
        projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
    const question = manager.appendMessage({ role: 'user', content: 'Retained question', timestamp: 1 });
    const reply = manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'Retained answer' }], api: 'openai-completions',
        provider: 'synthetic', model: 'synthetic', stopReason: 'stop', timestamp: 2,
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
    manager.appendLabelChange(reply, 'Preserved bookmark');
    const nativeBytes = fs.readFileSync(original.path);
    const status = (await call('GET', '/status')).body;
    assert.equal(status.assistantProjects, false); assert.equal(status.sessionClassification, false); assert.equal(status.bots, true);
    const beforeCount = (await gateway.store.listSessions(cwd)).length;
    assert.equal((await call('GET', '/assistant-projects', undefined, false)).status, 401);
    for (const [method, url] of [['GET', '/assistant-projects'], ['PUT', '/assistant-projects'], ['DELETE', '/assistant-projects/old'],
        ['GET', '/assistant-projects/old/sessions'], ['GET', `/sessions/${original.id}/classification`], ['PUT', `/sessions/${original.id}/classification`]]) {
        const result = await call(method, url, method === 'GET' ? undefined : { cwd, projectId: null });
        assert.equal(result.status, 410); assert.equal(result.body.code, 'ASSISTANT_CATEGORIES_RETIRED'); assert.equal(result.cache, 'no-store');
    }
    for (const assistantProjectId of [null, '', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']) {
        assert.equal((await call('POST', '/sessions', { cwd, profileId: id, assistantProjectId })).status, 410);
    }
    assert.equal((await gateway.store.listSessions(cwd)).length, beforeCount, 'legacy requests must not silently create unclassified sessions');
    const session = await gateway.store.getSession(cwd, original.id);
    assert.equal(session.agentProfile.id, id); assert.equal('assistantProject' in session, false);
    const env = await gateway.supervisor.workerEnvironment({ cwd, sessionId: session.id, sessionPath: session.path });
    assert.equal(env.PIVANE_ASSISTANT_PROJECT_CONTEXT, undefined);
    assert.equal(JSON.parse(env.PIVANE_AGENT_PROFILE_CONTEXT).profileId, id);
    for (const [entryId, position] of [[reply, 'at'], [undefined, 'before'], [question, 'before']]) {
        const fresh = SessionManager.open(original.path);
        const fork = await gateway.store.forkSession(session, { entries: fresh.getEntries(), leafId: fresh.getLeafId() }, entryId, position);
        const branched = SessionManager.open(fork.session.path);
        assert.equal(fork.session.agentProfile.id, id);
        assert.equal(branched.getEntries().some(entry => entry.type === 'custom' && entry.customType.startsWith('pivane-assistant-project')
            && entry.data?.sessionId === fork.session.id), false, 'forks preserve raw history without adding a new category binding');
    }
    assert.deepEqual(fs.readFileSync(original.path), nativeBytes, 'all native records, bookmarks and historical markers remain byte-for-byte');
    assert.deepEqual(fs.readFileSync(legacyFile), legacyBytes);
    assert.equal((await call('GET', '/profiles')).body.profiles.find(profile => profile.id === id).soul, 'Preserved soul');
});
