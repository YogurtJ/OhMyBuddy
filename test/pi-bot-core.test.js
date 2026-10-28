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
    assert.equal(patched.notify.dailyProactiveLimit, 20, 'D-045: a generous default');
    assert.equal(patched.notify.proactive, true);
    assert.equal(patched.notify.version, 2);
    // Before version 2 nothing could set the limit: a stored 5 is the old default and reads as the new one.
    assert.equal(settings.normalizeBot({ ...bot, notify: { quietHours: null, dailyProactiveLimit: 5 } }).notify.dailyProactiveLimit, 20);
    const chosen = settings.applyBotPatch(patched, { notify: { dailyProactiveLimit: 5, proactive: false, timeZone: 'Asia/Shanghai' } });
    assert.deepEqual([chosen.notify.dailyProactiveLimit, chosen.notify.proactive, chosen.notify.timeZone], [5, false, 'Asia/Shanghai']);
    assert.equal(settings.normalizeBot(chosen).notify.dailyProactiveLimit, 5, 'a version 2 limit is the user\'s own');
    assert.equal(settings.applyBotPatch(chosen, { notify: { dailyProactiveLimit: null } }).notify.dailyProactiveLimit, null, 'null: no limit');
    for (const notify of [{ dailyProactiveLimit: -1 }, { dailyProactiveLimit: 201 }, { dailyProactiveLimit: 1.5 }, { proactive: 'yes' }, { timeZone: 'Mars/Base' },
        { quietHours: { start: '08:00', end: '08:00' } }])
        assert.throws(() => settings.applyBotPatch(chosen, { notify }), /Invalid/);
    for (const bad of [{ workspace: '/tmp' }, { onboarding: {} }, { permissions: { preset: 'root' } }, { permissions: { rules: [ { v: 99 } ] } },
        { model: { provider: '', id: 'x' } }, { notify: { quietHours: { start: '25:00', end: '08:00' } } }, { order: -1 }, { job: 'x'.repeat(501) }])
        assert.throws(() => settings.applyBotPatch(bot, bad), /Invalid/);
    // Unknown persisted fields survive normalization.
    assert.equal(settings.normalizeBot({ ...bot, future: { a: 1 } }).future.a, 1);
});

test('bots are profiles with a private workspace and a native-marked main window', { timeout: 30000 }, async t => {
    const access = new WorkspaceAccessService({ envToken: () => 'synthetic-test-token' });
    const gateway = createPiAgentGateway({ accessService: access, deferredFilePath: process.env.PI_WEB_DEFERRED_FILE });
    gateway.bots.catalog = async () => ({ models: [{ provider: 'fixture', modelId: 'small', thinkingLevels: ['off', 'low', 'high'] }] });
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
    assert.deepEqual(created.data.bot.avatar, { kind: 'preset', id: 'pivane-pebble' });
    assert.equal(created.data.bot.bot.onboarding.defaultAvatar, 'pivane-pebble');
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

    // Exercise card presence through the real owner HTTP route and verified native proposal.
    const secondWindowId = second.data.window.id;
    const secondResolved = await call('GET', `/bots/${second.data.bot.id}/windows/${secondWindowId}/session`);
    assert.equal(secondResolved.status, 200);
    const secondManager = SessionManager.open(secondResolved.data.session.path);
    secondManager.appendMessage({ role: 'user', content: 'Synthetic setup over HTTP', timestamp: Date.now() });
    const propose = (id, args) => secondManager.appendMessage({ role: 'assistant',
        content: [{ type: 'toolCall', id, name: 'bot_setup_propose', arguments: args }], api: 'openai-completions',
        provider: 'fixture', model: 'small', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'toolUse', timestamp: Date.now() });
    const answer = id => secondManager.appendMessage({ role: 'toolResult', toolCallId: id, toolName: 'bot_setup_propose',
        content: [{ type: 'text', text: '{}' }], isError: false, timestamp: Date.now() });
    propose('http-hidden-work', { job: 'Organize tasks', workStyle: 'ask' });
    const hidden = await call('POST', `/bots/${second.data.bot.id}/setup`, { expectedRevision: second.data.revision,
        windowId: secondWindowId, toolCallId: 'http-hidden-work', changes: { job: 'Organize tasks' }, workStyleShown: false });
    assert.equal(hidden.status, 200, JSON.stringify(hidden.data));
    assert.deepEqual(hidden.data.saved, { job: 'Organize tasks' });
    assert.equal(hidden.data.bot.bot.permissions.preset, 'free');
    assert.equal(hidden.data.bot.bot.onboarding.steps.work, undefined, 'the HTTP layer preserves the hidden-selector flag');
    answer('http-hidden-work');
    propose('http-visible-work', { workStyle: 'free' });
    const visible = await call('POST', `/bots/${second.data.bot.id}/setup`, { expectedRevision: hidden.data.revision,
        windowId: secondWindowId, toolCallId: 'http-visible-work', changes: { workStyle: 'free' }, workStyleShown: true });
    assert.equal(visible.status, 200, JSON.stringify(visible.data));
    assert.deepEqual(visible.data.saved, { workStyle: 'free' });
    assert.equal(visible.data.bot.bot.onboarding.steps.work, 'done');
    assert.equal(visible.data.bot.bot.permissions.preset, 'free');
    answer('http-visible-work');

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

    const { ruleFor } = require('../server/bot/bot-guard');
    const rule = ruleFor({ toolName: 'bash', input: { command: 'date' }, cwd: workspace, agentDir });
    const granted = await call('PATCH', `/bots/${botId}`, { expectedRevision: saved.data.revision,
        changes: { bot: { permissions: { rules: [rule] } } } });
    assert.equal(granted.status, 200, JSON.stringify(granted.data));
    assert.deepEqual((await call('GET', '/profiles')).data.profiles.find(item => item.id === botId).bot.permissions.rules, [rule]);
    assert.equal((await call('PATCH', `/bots/${botId}`, { expectedRevision: saved.data.revision,
        changes: { bot: { permissions: { rules: [] } } } })).status, 409, 'a stale owner patch cannot revoke a newer grant');
    assert.equal((await call('PATCH', `/bots/${botId}`, { expectedRevision: granted.data.revision,
        changes: { bot: { permissions: { rules: [] } } } })).status, 200);
    assert.deepEqual((await call('GET', '/profiles')).data.profiles.find(item => item.id === botId).bot.permissions.rules, []);

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
    // An approval request that ended in the worker leaves the pending requests; others stay.
    const { APPROVAL_TITLE, approvalMessage } = require('../server/bot/bot-guard');
    const token = 'a'.repeat(16), other = 'b'.repeat(16);
    worker._handleEvent({ type: 'extension_ui_request', id: 'ui-a', method: 'confirm', title: APPROVAL_TITLE, message: approvalMessage({ kind: 'command', detail: 'ls', token }) });
    worker._handleEvent({ type: 'extension_ui_request', id: 'ui-b', method: 'confirm', title: APPROVAL_TITLE, message: approvalMessage({ kind: 'command', detail: 'ls', token: other }) });
    worker._handleEvent({ type: 'extension_ui_request', id: 'ui-c', method: 'confirm', title: 'Something else', message: `command #${token}\n\nls` });
    seen.length = 0;
    notify({ event: 'approval-done', token }, 'foreign-session');
    notify({ event: 'approval-done', token: 'not-a-token' });
    assert.deepEqual([...worker.pendingUi.keys()], ['ui-a', 'ui-b', 'ui-c']);
    notify({ event: 'approval-done', token });
    assert.deepEqual([...worker.pendingUi.keys()], ['ui-b', 'ui-c'], 'only the matching approval is retired');
    assert.deepEqual(seen.map(({ webRuntimeId, webSequence, ...event }) => event), [{ type: 'gateway_ui_resolved', id: 'ui-a' }]);
    notify({ event: 'approval-done', token });
    assert.equal(worker.pendingUi.size, 2, 'a repeated record is harmless');
    for (const id of ['ui-b', 'ui-c']) worker.resolveUi(id);
});
