const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-recall-test-')));
const agentDir = path.join(root, 'agent');
fs.mkdirSync(agentDir, { recursive: true });
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_PROJECT_ROOTS = root;
process.env.PI_OFFLINE = '1';
const { PiSessionStore } = require('../server/pi-session-store');
const { PiProfileRegistry } = require('../server/pi-profile-registry');
const { PiAgentSupervisor } = require('../server/pi-agent-supervisor');
const { BotService } = require('../server/bot/bot-service');
const recall = require('../server/bot/bot-recall');

test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = text => ({ role: 'assistant', content: [{ type: 'text', text }], api: 'openai-completions', provider: 'fixture', model: 'small', usage, stopReason: 'stop', timestamp: Date.now() });

test('recall searches every generation of the window and reads around an entry', { timeout: 60000 }, async t => {
    const pi = await import('@earendil-works/pi-coding-agent');
    const { SessionManager, parseSessionEntries } = pi;
    const store = new PiSessionStore();
    const profiles = new PiProfileRegistry(store);
    store.profiles = profiles;
    const supervisor = new PiAgentSupervisor();
    t.after(() => supervisor.dispose());
    const bots = new BotService({ store, profiles, supervisor });
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const botId = created.bot.id, windowId = created.window.id;
    const first = (await bots.resolve(botId, windowId)).session;
    const old = SessionManager.open(first.path);
    old.appendMessage({ role: 'user', content: '卫生间瓷砖最后定 60×120 哑光灰，物业电话 0571-8888', timestamp: Date.parse('2026-03-01T10:00:00Z') });
    const oldAnswer = old.appendMessage(assistant('好的，记下了：哑光灰。'));
    old.appendMessage({ role: 'user', content: 'The Plumber is called Zhou, visits on Tuesday', timestamp: Date.now() });
    old.appendMessage(assistant('Noted.'));
    await bots.rotate(botId, windowId, { expectedGeneration: 0 });
    const second = (await bots.resolve(botId, windowId)).session;
    const live = SessionManager.open(second.path);
    live.appendMessage({ role: 'user', content: '客厅想要木地板', timestamp: Date.now() });
    live.appendMessage(assistant('木地板可以，注意防潮。'));
    const context = { profileId: botId, windowId, cwd: second.cwd };
    const found = recall.windowGenerations({ agentDir, context, current: live, pi: { SessionManager, parseSessionEntries } });
    assert.deepEqual(found.generations.map(item => item.generation), [1, 0], 'newest first, all parts');
    const tile = recall.recall(found, '瓷砖 哑光灰');
    assert.match(tile.text, /^Searched all 2 part\(s\) of this chat\./);
    assert.match(tile.text, /1\. \[part 0 · entry [0-9a-f]{8} · 2026-03-01 · user\] 卫生间瓷砖最后定 60×120 哑光灰/);
    assert.equal(tile.details.pivaneRecall.coverage.complete, true);
    assert.match(recall.recall(found, 'plumber zhou').text, /The Plumber is called Zhou/, 'case-insensitive words');
    assert.match(recall.recall(found, '木地板').text, /\[part 1 /, 'the live generation is searched too');
    assert.match(recall.recall(found, '游泳池').text, /No matching messages/);
    assert.throws(() => recall.recall(found, ' ，。 '), /Search words are required/);
    // Reading around an entry of an earlier generation, by id prefix.
    const around = recall.readAround(found, { entry: oldAnswer.slice(0, 8), before: 1, after: 0 });
    assert.match(around.text, /^Part 0 of this chat, around entry [0-9a-f]{8}:/);
    assert.match(around.text, /· user\]\n卫生间瓷砖[^]*· assistant · this one\]\n好的，记下了/);
    assert.doesNotMatch(around.text, /Plumber/, 'after: 0');
    assert.throws(() => recall.readAround(found, { entry: 'abc' }), /at least 8 characters/);
    assert.throws(() => recall.readAround(found, { entry: '00000000' }), /No message with entry 00000000 found\. Searched all 2/);
    // Only one part when asked.
    const only = recall.windowGenerations({ agentDir, context, current: live, pi: { SessionManager, parseSessionEntries }, only: 0 });
    assert.deepEqual(only.generations.map(item => item.generation), [0]);
    // A stale worker (no longer the current generation) cannot search.
    assert.throws(() => recall.windowGenerations({ agentDir, context, current: old, pi: { SessionManager, parseSessionEntries } }), /This chat changed/);
    // A budget overrun is reported as partial coverage rather than hidden.
    let clock = 0;
    const slow = recall.windowGenerations({ agentDir, context, current: live, pi: { SessionManager, parseSessionEntries }, now: () => (clock += 5000) });
    assert.deepEqual(slow.skipped, [0]);
    assert.match(recall.recall(slow, '木地板').text, /^Searched 1 of 2 parts of this chat; not searched: 0\./);
});

test('earlier generation files are read only through a descriptor that matches the path', () => {
    const dir = fs.mkdtempSync(path.join(root, 'sessions-'));
    const real = path.join(dir, 'a.jsonl');
    fs.writeFileSync(real, '{"type":"session"}\n');
    assert.equal(recall.readVerified(real, dir, 1024), '{"type":"session"}\n');
    const link = path.join(dir, 'link.jsonl');
    fs.symlinkSync(real, link);
    assert.throws(() => recall.readVerified(link, dir, 1024), /outside this chat/);
    const elsewhere = fs.mkdtempSync(path.join(root, 'other-'));
    fs.writeFileSync(path.join(elsewhere, 'b.jsonl'), 'x');
    assert.throws(() => recall.readVerified(path.join(elsewhere, 'b.jsonl'), dir, 1024), /outside this chat/);
    assert.throws(() => recall.readVerified(real, dir, 4), /too large/);
});
