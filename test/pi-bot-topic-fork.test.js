'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-buddy-forks-')));
const agentDir = path.join(root, 'agent'); fs.mkdirSync(agentDir);
Object.assign(process.env, { PI_CODING_AGENT_DIR: agentDir, PI_PROJECT_ROOTS: root, OHMYBUDDY_WORKSPACES_DIR: path.join(root, 'workspaces'),
    PI_OFFLINE: '1', PI_WEB_TOKEN: 'synthetic-buddy-fork', PI_WEB_DEFERRED_FILE: path.join(root, 'deferred.json') });
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('Buddy forks remain native branches, become durable topics once, retain rules, and adopt proven legacy forks', { timeout: 120000 }, async t => {
    let modelCalls = 0;
    const provider = http.createServer((_req, res) => { modelCalls++; res.writeHead(500); res.end(); });
    provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
    fs.writeFileSync(path.join(agentDir, 'models.json'), JSON.stringify({ providers: { fixture: { api: 'openai-completions', apiKey: 'synthetic',
        baseUrl: `http://127.0.0.1:${provider.address().port}/v1`, models: [{ id: 'small', input: ['text', 'image'], reasoning: false,
            contextWindow: 32000, maxTokens: 1000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
    fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify({ defaultProvider: 'fixture', defaultModel: 'small', defaultThinkingLevel: 'off',
        defaultProjectTrust: 'never', enableInstallTelemetry: false, compaction: { enabled: false }, retry: { enabled: false } }));
    const { createPiAgentGateway } = require('../server/pi-agent-routes');
    const gateway = createPiAgentGateway({ cronFilePath: path.join(root, 'cron.sqlite') });
    clearInterval(gateway.cron.timer); await gateway.cron.ready;
    const app = require('express')(); app.use(require('express').json()); gateway.mount(app);
    const server = http.createServer(app); gateway.attachWebSocket(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => {
        await gateway.dispose(); server.closeAllConnections(); provider.closeAllConnections();
        await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => provider.close(resolve))]);
    });
    const api = async (method, url, body) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/pi${url}`, { method,
            headers: { Authorization: 'Bearer synthetic-buddy-fork', 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
        return { status: response.status, data: await response.json() };
    };
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const { readWindowBinding } = require('../server/bot/bot-window-state');
    const created = await gateway.bots.create({ expectedRevision: (await gateway.bots.profiles.state()).revision });
    const profileId = created.bot.id, mainId = created.window.id;
    const main = (await gateway.bots.resolve(profileId, mainId)).session;
    const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const image = { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC' };
    function seed(session) {
        const manager = SessionManager.open(session.path);
        const user = manager.appendMessage({ role: 'user', content: [{ type: 'text', text: 'First question' }, image], timestamp: 1 });
        const reply = manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'First answer' }], timestamp: 2,
            api: 'openai-completions', provider: 'fixture', model: 'small', stopReason: 'stop', usage });
        const next = manager.appendMessage({ role: 'user', content: 'Next question', timestamp: 3 });
        return { user, reply, next, manager, snapshot: { entries: manager.getEntries(), leafId: manager.getLeafId() } };
    }
    const history = seed(main);
    const workflow = (await api('GET', `/sessions/${main.id}/workflow?cwd=${encodeURIComponent(main.cwd)}`)).data;
    const delayed = await api('POST', `/sessions/${main.id}/deferred`, { cwd: main.cwd, id: randomUUID(), message: 'Original reminder', dueAt: Date.now() + 600000 });
    assert.equal(delayed.status, 201, JSON.stringify(delayed));
    const body = { cwd: main.cwd, entryId: history.reply, position: 'at', expectedLeafId: workflow.leafId, topicTitle: 'Another approach', requestId: randomUUID() };
    const sourceBytes = fs.readFileSync(main.path);
    const completeWindow = gateway.bots.completeWindowLocked.bind(gateway.bots);
    let pendingAdmissionChecked = false;
    gateway.bots.completeWindowLocked = async (id, record, options) => {
        if (record.forkOrigin && !pendingAdmissionChecked) {
            const marker = (await gateway.bots.nativeMarkers(id, record.cwd)).find(item => item.windowId === record.id);
            assert.ok(marker);
            await assert.rejects(gateway.supervisor.getWorker({ cwd: record.cwd, sessionId: marker.sessionId, sessionPath: marker.path }),
                error => error.code === 'BOT_FORK_UNCERTAIN', 'a published fork cannot start with ordinary permissions before its index commits');
            pendingAdmissionChecked = true;
        }
        return completeWindow(id, record, options);
    };
    const [first, repeated] = await Promise.all([api('POST', `/sessions/${main.id}/fork`, body), api('POST', `/sessions/${main.id}/fork`, body)]);
    assert.equal(first.status, 201, JSON.stringify(first)); assert.equal(repeated.status, 201, JSON.stringify(repeated));
    assert.equal(first.data.session.id, repeated.data.session.id);
    assert.equal(pendingAdmissionChecked, true);
    const fork = first.data.session, binding = readWindowBinding(SessionManager.open(fork.path));
    assert.equal(binding.profileId, profileId); assert.notEqual(binding.windowId, mainId);
    assert.equal(fork.botWindow.windowId, binding.windowId);
    assert.equal(gateway.deferred.list(main.cwd, main.id).length, 1);
    assert.equal(gateway.deferred.list(fork.cwd, fork.id).length, 0, 'pending messages stay with the original conversation');
    assert.deepEqual(fs.readFileSync(main.path), sourceBytes, 'source worker and native branch stay unchanged');
    assert.deepEqual(SessionManager.open(fork.path).buildSessionContext().messages, history.manager.buildSessionContext().messages.slice(0, 2));
    let listing = await gateway.bots.list();
    assert.equal(listing.bots[0].windows.length, 2);
    assert.equal(listing.bots[0].windows.find(item => item.id === binding.windowId).title, 'Another approach');
    assert.deepEqual(listing.bots[0].windows.find(item => item.id === binding.windowId).forkOrigin,
        { windowId: mainId, sessionId: main.id, entryId: history.reply, title: '主聊天' });
    const recovered = await api('GET', `/sessions/${main.id}/forks/${body.requestId}?cwd=${encodeURIComponent(main.cwd)}`);
    assert.equal(recovered.data.result.session.botWindow.windowId, binding.windowId);
    assert.equal((await api('POST', `/sessions/${main.id}/fork`, { ...body, topicTitle: 'Changed title' })).status, 409);
    const reloaded = new (require('../server/bot/bot-service').BotService)({ store: gateway.store, profiles: gateway.bots.profiles, supervisor: gateway.supervisor,
        getAgentDir: async () => agentDir });
    assert.equal((await reloaded.resolve(profileId, binding.windowId)).session.id, fork.id, 'fresh service resolves the same native session');
    const worker = await gateway.supervisor.getWorker({ cwd: fork.cwd, sessionId: fork.id, sessionPath: fork.path });
    assert.equal(worker.loadedBot.profileId, profileId, 'opening the fork loads Buddy rules, not ordinary project rules');
    assert.equal(worker.loadedBot.windowId, binding.windowId);
    const nestedView = await worker.request('get_entries');
    const nested = await api('POST', `/sessions/${fork.id}/fork`, { cwd: fork.cwd, expectedLeafId: nestedView.leafId, requestId: randomUUID() });
    assert.equal(nested.status, 201, JSON.stringify(nested)); assert.equal(nested.data.session.botWindow.profileId, profileId);
    assert.equal(nested.data.session.botWindow.forkOrigin.windowId, binding.windowId);
    for (const entryId of [history.user, history.next]) {
        const before = await api('POST', `/sessions/${main.id}/fork`, { cwd: main.cwd, entryId, expectedLeafId: workflow.leafId, requestId: randomUUID() });
        assert.equal(before.status, 201, JSON.stringify(before)); assert.ok(before.data.session.botWindow);
        assert.equal(before.data.draft.message, entryId === history.user ? 'First question' : 'Next question');
        if (entryId === history.user) assert.deepEqual(before.data.draft.images, [image]);
        assert.equal((await gateway.bots.resolve(profileId, before.data.session.botWindow.windowId)).session.id, before.data.session.id);
    }
    // Workbench sessions with only the same profile never silently acquire Buddy permissions.
    const ordinary = await gateway.store.createSession(main.cwd, 'Project thread', { agentProfileId: profileId });
    seed(ordinary);
    const ordinaryView = (await api('GET', `/sessions/${ordinary.id}/workflow?cwd=${encodeURIComponent(main.cwd)}`)).data;
    const plain = await api('POST', `/sessions/${ordinary.id}/fork`, { cwd: ordinary.cwd, expectedLeafId: ordinaryView.leafId, requestId: randomUUID() });
    assert.equal(plain.status, 201, JSON.stringify(plain)); assert.equal(plain.data.session.botWindow, null);
    assert.equal((await api('GET', `/sessions/${plain.data.session.id}/buddy-topic?cwd=${encodeURIComponent(main.cwd)}`)).status, 409);
    // Preserve instructions, focus and group when the source is a topic.
    let revision = (await gateway.bots.windows.read(profileId)).revision;
    const group = await gateway.bots.createTopicGroup(profileId, { name: 'Plans', expectedRevision: revision });
    revision = (await gateway.bots.windows.read(profileId)).revision;
    const groupId = group.groups[0].id;
    const topic = await gateway.bots.createTopic(profileId, { title: 'Plan', focus: 'Keep focused', instructions: 'Use primary sources.\nGive concise answers.', groupId, expectedRevision: revision });
    const topicSession = (await gateway.bots.resolve(profileId, topic.window.id)).session, topicHistory = seed(topicSession);
    const topicView = (await api('GET', `/sessions/${topicSession.id}/workflow?cwd=${encodeURIComponent(main.cwd)}`)).data;
    const topicFork = await api('POST', `/sessions/${topicSession.id}/fork`, { cwd: topicSession.cwd, expectedLeafId: topicView.leafId, requestId: randomUUID() });
    assert.equal(topicFork.status, 201, JSON.stringify(topicFork));
    const row = await gateway.bots.windowRecord(profileId, topicFork.data.session.botWindow.windowId);
    assert.equal(row.instructions, 'Use primary sources.\nGive concise answers.'); assert.equal(row.groupId, groupId); assert.equal(row.focus, 'Keep focused');
    // An old fork is still the same native ID and bytes, with only an ownership marker appended.
    const legacy = await gateway.supervisor.getActiveWorker(topicSession.path).exclusive(async rpc =>
        gateway.store.forkSession(topicSession, await rpc('get_entries'), topicHistory.reply, 'at'));
    const legacyBytes = fs.readFileSync(legacy.session.path), legacyId = legacy.session.id;
    const preview = await api('GET', `/sessions/${legacyId}/buddy-topic?cwd=${encodeURIComponent(main.cwd)}`);
    assert.equal(preview.status, 200, JSON.stringify(preview)); assert.equal(preview.data.profileId, profileId);
    const adoption = { ...preview.data, cwd: main.cwd, title: 'Saved legacy branch' };
    assert.equal((await api('POST', `/sessions/${legacyId}/buddy-topic`, { ...adoption, expectedLeafId: 'stale' })).status, 409);
    const adopted = await api('POST', `/sessions/${legacyId}/buddy-topic`, adoption);
    assert.equal(adopted.status, 200, JSON.stringify(adopted));
    assert.equal((await gateway.bots.resolve(profileId, adopted.data.window.id)).session.id, legacyId);
    assert.ok(fs.readFileSync(legacy.session.path).subarray(0, legacyBytes.length).equals(legacyBytes));
    assert.equal((await api('POST', `/sessions/${legacyId}/buddy-topic`, adoption)).data.window.id, adopted.data.window.id, 'response loss never adds another topic');
    // A prepared fork lacking its native proof can never turn into an empty topic.
    const orphan = await gateway.bots.windowRecord(profileId, row.id);
    const orphanId = randomUUID(); revision = (await gateway.bots.windows.read(profileId)).revision;
    await gateway.bots.windows.mutate(profileId, revision, state => { state.windows.push({ ...orphan, id: orphanId, current: null, generations: [] }); return {}; });
    await assert.rejects(gateway.bots.resolve(profileId, orphanId), error => error.code === 'BOT_FORK_UNCERTAIN');
    const archived = await gateway.bots.updateWindow(profileId, topic.window.id, { expectedRevision: (await gateway.bots.windows.read(profileId)).revision, archived: true });
    assert.ok(archived.window.archivedAt);
    const refused = await api('POST', `/sessions/${topicSession.id}/fork`, { cwd: topicSession.cwd, expectedLeafId: topicView.leafId, requestId: randomUUID() });
    assert.equal(refused.status, 409); assert.equal(refused.data.code, 'BOT_WINDOW_ARCHIVED');
    assert.equal(modelCalls, 0, 'creating, adopting, listing and opening forks never calls a model');
});
