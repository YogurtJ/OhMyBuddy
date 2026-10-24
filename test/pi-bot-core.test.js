const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-core-test-')));
const agentDir = path.join(root, 'agent');
fs.mkdirSync(agentDir, { recursive: true });
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_PROJECT_ROOTS = root;
process.env.PI_OFFLINE = '1';
process.env.PI_WEB_DEFERRED_FILE = path.join(root, 'deferred.json');
const { createPiAgentGateway } = require('../server/pi-agent-routes');
const { WorkspaceAccessService } = require('../server/workspace-access-service');
const { readProfileBinding } = require('../server/pi-profile-state');
const { WINDOW_ENTRY, readWindowBinding } = require('../server/bot/bot-window-state');
const settings = require('../server/bot/bot-settings');

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('bot settings normalize, tolerate invalid reads and accept only user-editable patches', () => {
    const bot = settings.normalizeBot(settings.defaultBot({ workspace: root, firstBot: true }));
    assert.equal(bot.permissions.preset, 'free');
    assert.deepEqual(bot.notify.quietHours, { start: '23:00', end: '08:00' });
    assert.equal(bot.onboarding.phase, 'greeting');
    assert.equal(settings.readBot({ bot: { ...bot, version: 2 } }), null);
    assert.equal(settings.isBot({ enabled: true, bot: { ...bot, enabled: false } }), false);
    assert.equal(settings.isBot({ enabled: true, trashedAt: new Date().toISOString(), bot }), false);
    const patched = settings.applyBotPatch(bot, { job: '  生活琐事 ', model: { provider: 'p', id: 'm', thinking: 'low' },
        permissions: { preset: 'balanced' }, notify: { quietHours: null } });
    assert.equal(patched.job, '生活琐事');
    assert.deepEqual(patched.model, { provider: 'p', id: 'm', thinking: 'low' });
    assert.equal(patched.permissions.preset, 'balanced');
    assert.equal(patched.notify.quietHours, null);
    assert.equal(patched.notify.dailyProactiveLimit, 5);
    for (const bad of [{ workspace: '/tmp' }, { onboarding: {} }, { permissions: { preset: 'root' } }, { permissions: { rules: [] } },
        { model: { provider: '', id: 'x' } }, { notify: { quietHours: { start: '25:00', end: '08:00' } } }, { order: -1 }, { job: 'x'.repeat(501) }])
        assert.throws(() => settings.applyBotPatch(bot, bad), /Invalid/);
    // Unknown persisted fields survive normalization.
    assert.equal(settings.normalizeBot({ ...bot, future: { a: 1 } }).future.a, 1);
});

test('bots are profiles with a private workspace and a native-marked main window', { timeout: 30000 }, async t => {
    const access = new WorkspaceAccessService({ envToken: () => 'synthetic-test-token' });
    const gateway = createPiAgentGateway({ accessService: access, deferredFilePath: process.env.PI_WEB_DEFERRED_FILE });
    const express = require('express'), app = express(); app.use(express.json()); gateway.mount(app);
    const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => { await gateway.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const base = `http://127.0.0.1:${server.address().port}/api/pi`;
    const call = async (method, url, body, headers = {}) => {
        const response = await fetch(base + url, { method, headers: { Authorization: 'Bearer synthetic-test-token', 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: response.status, cache: response.headers.get('cache-control'), data: await response.json() };
    };
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');

    assert.equal((await call('GET', '/status')).data.bots, true);
    const empty = await call('GET', '/bots');
    assert.equal(empty.status, 200); assert.equal(empty.cache, 'no-store'); assert.deepEqual(empty.data.bots, []);
    assert.equal((await call('POST', '/bots', {})).status, 400);
    assert.equal((await call('POST', '/bots', { expectedRevision: empty.data.revision }, { Origin: 'https://evil.invalid' })).status, 403);

    const created = await call('POST', '/bots', { expectedRevision: empty.data.revision, language: 'zh-CN' });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const botId = created.data.bot.id;
    assert.equal(created.data.bot.name, '新伙伴');
    assert.equal(created.data.bot.bot.onboarding.firstBot, true);
    assert.equal(created.data.window.kind, 'main');
    assert.equal((await call('POST', '/bots', { expectedRevision: empty.data.revision })).status, 409);

    const listed = await call('GET', '/bots');
    const entry = listed.data.bots[0];
    assert.equal(entry.id, botId); assert.equal(entry.enabled, true); assert.equal(entry.windows.length, 1);
    const profiles = (await call('GET', '/profiles')).data;
    const profile = profiles.profiles.find(item => item.id === botId);
    assert.equal(profile.memory.enabled, true);
    const workspace = profile.bot.workspace;
    assert.equal(path.dirname(path.dirname(workspace)), root);
    assert.equal(path.basename(path.dirname(workspace)), 'PivaneBots');
    assert.match(fs.readFileSync(path.join(workspace, 'README.md'), 'utf8'), new RegExp(botId));
    if (process.platform !== 'win32') {
        assert.equal(fs.statSync(workspace).mode & 0o777, 0o700);
        assert.equal(fs.statSync(path.join(agentDir, 'pivane-bots', botId, 'windows.json')).mode & 0o777, 0o600);
    }

    const resolved = await call('GET', `/bots/${botId}/windows/${entry.windows[0].id}/session`);
    assert.equal(resolved.status, 200, JSON.stringify(resolved.data));
    assert.equal(resolved.data.session.cwd, workspace);
    const manager = SessionManager.open(resolved.data.session.path);
    assert.equal(readProfileBinding(manager).profileId, botId);
    assert.deepEqual(readWindowBinding(manager), { sessionId: manager.getSessionId(), profileId: botId, windowId: entry.windows[0].id,
        kind: 'main', generation: 0, predecessor: null });
    assert.equal((await call('GET', `/bots/${botId}/windows/00000000-0000-0000-0000-000000000000/session`)).status, 404);

    // A copied or duplicated marker never confers window ownership.
    manager.appendCustomEntry(WINDOW_ENTRY, { version: 1, sessionId: manager.getSessionId(), profileId: botId, windowId: entry.windows[0].id, kind: 'main', generation: 0, predecessor: null });
    assert.equal(readWindowBinding(SessionManager.open(resolved.data.session.path)), null);
    assert.equal((await call('GET', `/bots/${botId}/windows/${entry.windows[0].id}/session`)).status, 409);

    // Second Bot: not the first, next order, its own workspace.
    const second = await call('POST', '/bots', { expectedRevision: listed.data.revision, language: 'en' });
    assert.equal(second.status, 200, JSON.stringify(second.data));
    assert.equal(second.data.bot.name, 'New buddy');
    assert.equal(second.data.bot.bot.onboarding.firstBot, false);
    assert.equal(second.data.bot.bot.order, 1);

    // Settings: user-editable fields only, revision-checked.
    const before = await call('GET', '/bots');
    const patch = await call('PATCH', `/bots/${botId}`, { expectedRevision: before.data.revision,
        changes: { name: '阿狸', avatar: { kind: 'emoji', value: '🦊' }, soul: '说话干脆。', bot: { job: '生活琐事', model: { provider: 'fixture', id: 'small' } } } });
    assert.equal(patch.status, 200, JSON.stringify(patch.data));
    assert.equal(patch.data.bot.name, '阿狸'); assert.equal(patch.data.bot.bot.job, '生活琐事');
    assert.equal((await call('PATCH', `/bots/${botId}`, { expectedRevision: before.data.revision, changes: { name: 'x' } })).status, 409);
    const fresh = (await call('GET', '/bots')).data.revision;
    assert.equal((await call('PATCH', `/bots/${botId}`, { expectedRevision: fresh, changes: { bot: { workspace: '/tmp' } } })).status, 400);
    assert.equal((await call('PATCH', `/bots/${botId}`, { expectedRevision: fresh, changes: { enabled: false } })).status, 400);

    // The profile editor keeps the bot section when saving base fields.
    const editor = (await call('GET', '/profiles')).data;
    const record = editor.profiles.find(item => item.id === botId);
    const saved = await call('PUT', '/profiles', { expectedRevision: editor.revision, profile: { id: botId, name: '阿狸2', description: record.description,
        soul: record.soul, enabled: true, memory: record.memory, skills: record.skills } });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.profile.bot.job, '生活琐事');

    // An interrupted creation (native session written, index missing) is adopted, not duplicated.
    const secondId = second.data.bot.id;
    const secondMain = (await call('GET', '/bots')).data.bots.find(bot => bot.id === secondId).windows[0];
    fs.rmSync(path.join(agentDir, 'pivane-bots', secondId, 'windows.json'));
    const repaired = await call('POST', `/bots/${secondId}/main-window`);
    assert.equal(repaired.status, 200, JSON.stringify(repaired.data));
    assert.equal(repaired.data.id, secondMain.id); assert.equal(repaired.data.sessionId, secondMain.sessionId);
    assert.equal((await call('POST', `/bots/${secondId}/main-window`)).data.id, secondMain.id);

    // Trashed Bots disappear from Bot Mode and cannot be resolved.
    const revision = (await call('GET', '/profiles')).data.revision;
    assert.equal((await call('POST', `/profiles/${secondId}/trash`, { expectedRevision: revision })).status, 200);
    assert.deepEqual((await call('GET', '/bots')).data.bots.map(bot => bot.id), [botId]);
    assert.equal((await call('GET', `/bots/${secondId}/windows/${secondMain.id}/session`)).status, 404);
});

test('Bot bridge records stay private: loaded state is recorded and model problems become a clean notice', () => {
    const { AgentWorker } = require('../server/pi-agent-supervisor');
    const worker = new AgentWorker({ cwd: os.tmpdir(), sessionId: 'synthetic-session', sessionPath: path.join(os.tmpdir(), 'synthetic.jsonl') });
    const seen = [];
    worker.subscribers.add(event => seen.push(event));
    const id = '11111111-2222-3333-4444-555555555555';
    const notify = (value, sessionId = 'synthetic-session') => worker._handleEvent({ type: 'extension_ui_request', method: 'notify',
        message: JSON.stringify({ pivaneBot: value, sessionId }) });
    notify({ event: 'loaded', profileId: id, windowId: id, generation: 2 });
    assert.deepEqual(worker.loadedBot, { profileId: id, windowId: id, generation: 2 });
    notify({ event: 'loaded', profileId: null }, 'foreign-session');
    assert.deepEqual(worker.loadedBot, { profileId: id, windowId: id, generation: 2 }, 'records for another session are ignored');
    notify({ event: 'model', status: 'unavailable', provider: 'fixture', id: 'gone' });
    notify({ event: 'model', status: 'unavailable', provider: 'x'.repeat(201), id: 'gone' });
    notify({ event: 'loaded', profileId: null });
    assert.equal(worker.loadedBot, null);
    assert.deepEqual(seen.map(({ webRuntimeId, webSequence, ...event }) => event),
        [{ type: 'gateway_bot_notice', notice: 'model_unavailable', provider: 'fixture', id: 'gone' }]);
});
