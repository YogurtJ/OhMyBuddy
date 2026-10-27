const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-maintenance-test-')));
const agentDir = path.join(root, 'agent');
fs.mkdirSync(agentDir, { recursive: true });
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_PROJECT_ROOTS = root;
process.env.PI_OFFLINE = '1';
const { PiSessionStore } = require('../server/pi-session-store');
const { PiProfileRegistry } = require('../server/pi-profile-registry');
const { PiAgentSupervisor } = require('../server/pi-agent-supervisor');
const { BotService } = require('../server/bot/bot-service');
const { HANDOFF_MESSAGE } = require('../server/bot/bot-handoff');
const ledger = require('../server/bot/bot-ledger');
const maintenance = require('../server/bot/bot-maintenance');

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const usageRecord = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = (content) => ({ role: 'assistant', content, api: 'openai-completions', provider: 'fixture', model: 'small', usage: usageRecord, stopReason: 'stop', timestamp: Date.now() });

async function toolHeavy(turns, outputChars) {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const manager = SessionManager.inMemory('/tmp');
    const results = [];
    for (let index = 0; index < turns; index++) {
        manager.appendMessage({ role: 'user', content: `question ${index}`, timestamp: Date.now() });
        manager.appendMessage(assistant([{ type: 'toolCall', id: `c${index}`, name: index === 1 ? 'window_note' : 'read', arguments: {} }]));
        results.push(manager.appendMessage({ role: 'toolResult', toolCallId: `c${index}`, toolName: index === 1 ? 'window_note' : 'read',
            content: [{ type: 'text', text: 'x'.repeat(outputChars) }], isError: false, timestamp: Date.now() }));
        manager.appendMessage(assistant([{ type: 'text', text: `answer ${index}` }]));
    }
    return { manager, results };
}

test('S1 prunes old large tool outputs only when it saves enough, keeping the recent turns and notebook results', async () => {
    const { manager, results } = await toolHeavy(8, 60000);
    const projection = manager.buildSessionProjection().entries;
    const usage = { tokens: 150000, contextWindow: 400000, percent: 37.5 };
    const drafts = maintenance.pruneDrafts(projection, usage);
    // Turns 5-7 are the last three user turns; turn 1 is a notebook result.
    assert.deepEqual(drafts.map(draft => draft.targetId), [results[0], results[2], results[3], results[4]]);
    assert.match(drafts[0].replacement.content, /^\[Earlier output of read omitted \(about 59 KB\)\. Run it again, or use window_read with entry [0-9a-f]{8}/);
    assert.deepEqual(maintenance.pruneDrafts(projection, { ...usage, percent: 20 }), [], 'below 35% nothing is pruned');
    assert.deepEqual(maintenance.pruneDrafts(projection, { ...usage, tokens: 1000000 }), [], 'savings under 20% of the context do not pay off');
    assert.deepEqual(maintenance.pruneDrafts(projection, { tokens: null, percent: null, contextWindow: 400000 }), [], 'unknown usage is not zero');
    // Already pruned outputs are not pruned again.
    for (const draft of drafts) manager.appendContextEdit(draft.targetId, draft.replacement);
    assert.deepEqual(maintenance.pruneDrafts(manager.buildSessionProjection().entries, usage), []);
    const small = await toolHeavy(8, 1000);
    assert.deepEqual(maintenance.pruneDrafts(small.manager.buildSessionProjection().entries, usage), [], 'small outputs stay');
});

test('S2 waits for a cold cache and S4 names the rotation reason', async () => {
    assert.equal(maintenance.idleDelay(undefined), 10 * 60 * 1000);
    assert.equal(maintenance.idleDelay({ promptCache: { short: 300 } }), 10 * 60 * 1000);
    assert.equal(maintenance.idleDelay({ promptCache: { short: 3600 } }), 3600 * 1000);
    // 8 turns of 60 000 characters: Pi keeps the last ~80 000 characters (two turns) verbatim.
    const { manager } = await toolHeavy(8, 60000);
    const projection = manager.buildSessionProjection().entries;
    const full = { tokens: 120000, contextWindow: 200000, percent: 60 };
    const share = maintenance.summarizableTokens(projection, full);
    assert.ok(share > 85000 && share < 95000, `about three quarters of the context would be summarized: ${share}`);
    assert.equal(maintenance.idleCompactionWanted({ ...full, percent: 54.9 }, projection), false);
    assert.equal(maintenance.idleCompactionWanted(full, projection), true);
    assert.equal(maintenance.idleCompactionWanted({ tokens: null, percent: null }, projection), false);
    // Mostly what Pi keeps verbatim anyway: no repeated summary of a few messages at each pause.
    const recent = await toolHeavy(2, 60000);
    assert.equal(maintenance.idleCompactionWanted(full, recent.manager.buildSessionProjection().entries), false);
    assert.ok(maintenance.summarizableTokens(recent.manager.buildSessionProjection().entries, full) < 100);
    const now = Date.parse('2026-06-01T00:00:00Z');
    assert.equal(maintenance.rotationReason({ bytes: 8 * 1024 * 1024, entries: 1, startedAt: '2026-05-30T00:00:00Z', now }), 'size');
    assert.equal(maintenance.rotationReason({ bytes: 1, entries: 8000, startedAt: '2026-05-30T00:00:00Z', now }), 'entries');
    assert.equal(maintenance.rotationReason({ bytes: 1, entries: 1, startedAt: '2026-04-01T00:00:00Z', now }), 'age');
    assert.equal(maintenance.rotationReason({ bytes: 1, entries: 1, startedAt: '2026-05-30T00:00:00Z', now }), null);
});

test('S4 rotates an idle window that is due and carries the notebook and structured summary forward', { timeout: 60000 }, async t => {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const store = new PiSessionStore();
    const profiles = new PiProfileRegistry(store);
    store.profiles = profiles;
    const supervisor = new PiAgentSupervisor();
    t.after(() => supervisor.dispose());
    const bots = new BotService({ store, profiles, supervisor });
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const botId = created.bot.id, windowId = created.window.id;
    const { session } = await bots.resolve(botId, windowId);
    const manager = SessionManager.open(session.path);
    manager.appendMessage({ role: 'user', content: '瓷砖定哑光灰，周五前给我报价', timestamp: Date.now() });
    manager.appendMessage(assistant([{ type: 'text', text: '好的' }]));
    const { ops, state } = ledger.prepareOps(ledger.emptyLedger(), [{ op: 'add', kind: 'decision', text: '瓷砖哑光灰' },
        { op: 'add', kind: 'commitment', text: '周五前给报价', due: '2026-03-06' }], { at: new Date().toISOString(), by: 'summary' });
    const sections = { topic: '装修', episodes: ['2026-03-01: 定了瓷砖'], now: { doing: '', next: '报价', waiting: '' } };
    manager.appendCompaction('bot summary', manager.getLeafId(), 10, { pivaneBot: { v: 1, sections, ledger: { ops, snapshot: state } } }, true);
    const cancel = manager.appendMessage({ role: 'user', content: '报价不急了，取消吧', timestamp: Date.now() });
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, ops: [{ op: 'status', id: 'n2', status: 'cancelled', at: new Date().toISOString(), by: 'user' }] });
    manager.appendMessage(assistant([{ type: 'text', text: '已取消报价' }]));
    const before = ledger.replay(SessionManager.open(session.path).getBranch());
    const worker = { loadedBot: { profileId: botId, windowId, generation: 0 }, sessionPath: session.path };
    assert.equal(await bots.maintainWindow(worker, { trigger: 'compaction' }), null, 'a small, young window stays');
    const later = Date.now() + 61 * 24 * 3600 * 1000;
    // Due, but after an ordinary reply it waits for the worker's idle summary (D-033).
    assert.equal(await bots.maintainWindow(worker, { now: later }), null);
    // A compaction event whose summary is followed by a finished turn waits for the next summary.
    assert.equal(await bots.maintainWindow(worker, { now: later, trigger: 'compaction' }), null, 'a turn after the summary waits');
    // The summary made while due, which also read the kept part, lets the window move on.
    manager.appendCompaction('bot summary', cancel, 10, { pivaneBot: { v: 1, sections, includedKept: true, ledger: { ops: [], snapshot: before } } }, true);
    const rotated = await bots.maintainWindow(worker, { now: later, trigger: 'compaction' });
    assert.equal(rotated.window.generation, 1);
    const generations = await bots.generations(botId, windowId);
    assert.equal((await bots.windows.read(botId)).state.windows[0].generations[1].reason, 'age');
    const next = SessionManager.open(rotated.session.path);
    const branch = next.getBranch();
    assert.deepEqual(ledger.replay(branch), before, 'the notebook continues unchanged');
    const seed = branch.find(entry => entry.type === 'custom_message' && entry.customType === HANDOFF_MESSAGE);
    assert.equal(seed.details.pivaneNotebook, true);
    assert.deepEqual(seed.details.sections, sections);
    assert.match(seed.content, /## What this chat is about\n装修[^]*### Decided\n- \[n1\] 瓷砖哑光灰[^]*Recently closed[^]*\[n2\] cancelled: 周五前给报价[^]*## Most recent messages \(verbatim\)[^]*报价不急了/);
    const { notebookNotice } = require(process.env.PIVANE_TEST_PI_JITI).createJiti(__filename)(path.join(__dirname, '../server/bot/bot-notebook.ts'));
    assert.equal(notebookNotice(branch, new Date().toISOString()), null, 'the seed already shows the notebook');
    const compaction = require('../server/bot/bot-compaction');
    assert.deepEqual(compaction.earlierSections(branch), sections, 'the next compaction continues from these sections');
    assert.equal(seed.details.reconciled, true, 'the summary before the move read the verbatim part');
    assert.deepEqual(seed.details.tail.map(item => item.role + ':' + item.text), ['user:报价不急了，取消吧', 'assistant:已取消报价']);
    assert.deepEqual(compaction.summarizedEntries(next.buildSessionProjection().entries, null), [], 'so the next summary does not read it again');
    // The old worker's view is stale now: nothing happens; a busy window waits for its next run.
    assert.equal(await bots.maintainWindow(worker, { now: later, trigger: 'compaction' }), null);
    const current = { loadedBot: { profileId: botId, windowId, generation: 1 }, sessionPath: rotated.session.path };
    const idle = supervisor.isSessionIdle;
    supervisor.isSessionIdle = () => false;
    assert.equal(await bots.maintainWindow(current, { now: later + 61 * 24 * 3600 * 1000, trigger: 'compaction' }), null);
    supervisor.isSessionIdle = idle;
    assert.equal(generations.generations.length, 2);
});

test('S4 carries what follows the summary verbatim up to its limit', { timeout: 60000 }, async t => {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const store = new PiSessionStore();
    const profiles = new PiProfileRegistry(store);
    store.profiles = profiles;
    const supervisor = new PiAgentSupervisor();
    t.after(() => supervisor.dispose());
    const bots = new BotService({ store, profiles, supervisor });
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const botId = created.bot.id, windowId = created.window.id;
    const { session } = await bots.resolve(botId, windowId);
    const manager = SessionManager.open(session.path);
    const first = manager.appendMessage({ role: 'user', content: '旧'.repeat(70000), timestamp: Date.now() });
    manager.appendMessage(assistant([{ type: 'text', text: '收到' }]));
    manager.appendMessage({ role: 'user', content: '最近的话', timestamp: Date.now() });
    manager.appendMessage(assistant([{ type: 'text', text: '好的' }]));
    const sections = { topic: '闲聊', episodes: ['2026-03-01: 发来很长一段'], now: { doing: '', next: '', waiting: '' } };
    manager.appendCompaction('bot summary', first, 10, { pivaneBot: { v: 1, sections, includedKept: true, ledger: { ops: [], snapshot: ledger.emptyLedger() } } }, true);
    const worker = { loadedBot: { profileId: botId, windowId, generation: 0 }, sessionPath: session.path };
    const later = Date.now() + 61 * 24 * 3600 * 1000;
    assert.equal(await bots.maintainWindow(worker, { now: later }), null);
    assert.equal((await bots.windows.read(botId)).state.windows[0].generations.length, 1);
    // The worker's idle summary (S2, due to rotate) is followed by the move.
    const rotated = await bots.maintainWindow(worker, { now: later, trigger: 'compaction' });
    assert.equal(rotated.window.generation, 1);
    const seed = SessionManager.open(rotated.session.path).getBranch().find(entry => entry.customType === HANDOFF_MESSAGE);
    assert.match(seed.content, /## Most recent messages \(verbatim\)\nAssistant: 收到\n\nUser: 最近的话\n\nAssistant: 好的$/);
    assert.equal(seed.content.includes('旧旧旧'), false, 'what does not fit is left to the summary and recall');
});

test('S4 after an ordinary reply waits even when the recent text would fit', { timeout: 60000 }, async t => {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const store = new PiSessionStore();
    const profiles = new PiProfileRegistry(store);
    store.profiles = profiles;
    const supervisor = new PiAgentSupervisor();
    t.after(() => supervisor.dispose());
    const bots = new BotService({ store, profiles, supervisor });
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const botId = created.bot.id, windowId = created.window.id;
    const { session } = await bots.resolve(botId, windowId);
    const manager = SessionManager.open(session.path);
    // Short texts (the tail would be complete) but large early tool outputs: a summary first,
    // which also brings the notebook up to date with what was said.
    for (let index = 0; index < 3; index++) {
        manager.appendMessage({ role: 'user', content: `看看第 ${index} 份报价`, timestamp: Date.now() });
        manager.appendMessage(assistant([{ type: 'toolCall', id: `q${index}`, name: 'read', arguments: {} }]));
        manager.appendMessage({ role: 'toolResult', toolCallId: `q${index}`, toolName: 'read', content: [{ type: 'text', text: '价'.repeat(60000) }], isError: false, timestamp: Date.now() });
        manager.appendMessage(assistant([{ type: 'text', text: `第 ${index} 份看完了` }]));
    }
    const worker = { loadedBot: { profileId: botId, windowId, generation: 0 }, sessionPath: session.path };
    const later = Date.now() + 61 * 24 * 3600 * 1000;
    assert.equal(await bots.maintainWindow(worker, { now: later }), null);
    const last = manager.getBranch().filter(entry => entry.type === 'message' && entry.message.role === 'user').at(-1).id;
    // Pi's own summary (the structured one failed) never reconciled the kept part: wait.
    manager.appendCompaction('native summary', last, 10, undefined, false);
    assert.equal(await bots.maintainWindow(worker, { now: later, trigger: 'compaction' }), null, 'a fallback summary waits');
    // A Bot summary made without the kept part (not due when it ran) waits too.
    const sections = { topic: '报价', episodes: ['2026-03-01: 看了三份报价'], now: { doing: '', next: '', waiting: '' } };
    manager.appendCompaction('bot summary', last, 10, { pivaneBot: { v: 1, sections, ledger: { ops: [], snapshot: ledger.emptyLedger() } } }, true);
    assert.equal(await bots.maintainWindow(worker, { now: later, trigger: 'compaction' }), null, 'a summary without the kept part waits');
    manager.appendCompaction('bot summary', last, 10, { pivaneBot: { v: 1, sections, includedKept: true, ledger: { ops: [], snapshot: ledger.emptyLedger() } } }, true);
    assert.equal((await bots.maintainWindow(worker, { now: later, trigger: 'compaction' })).window.generation, 1);
    // The rotation path checks the same proof under the reservation.
    assert.equal(require('../server/bot/bot-maintenance').freshRotationSummary(SessionManager.open(session.path).getBranch()), true);
});

test('after a manual move the next summary reads the carried messages and can cite them', { timeout: 60000 }, async t => {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const compaction = require('../server/bot/bot-compaction');
    const store = new PiSessionStore();
    const profiles = new PiProfileRegistry(store);
    store.profiles = profiles;
    const supervisor = new PiAgentSupervisor();
    t.after(() => supervisor.dispose());
    const bots = new BotService({ store, profiles, supervisor });
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const botId = created.bot.id, windowId = created.window.id;
    const { session } = await bots.resolve(botId, windowId);
    const manager = SessionManager.open(session.path);
    manager.appendMessage({ role: 'user', content: '先聊装修', timestamp: Date.now() });
    const kept = manager.appendMessage(assistant([{ type: 'text', text: '好' }]));
    const sections = { topic: '装修', episodes: ['2026-03-01: 开始聊装修'], now: { doing: '', next: '', waiting: '' } };
    manager.appendCompaction('bot summary', kept, 10, { pivaneBot: { v: 1, sections, ledger: { ops: [], snapshot: ledger.emptyLedger() } } }, true);
    manager.appendMessage({ role: 'user', content: '对了，门牌改成 12 号了', timestamp: Date.now() });
    manager.appendMessage(assistant([{ type: 'text', text: '记住了，12 号' }]));
    const rotated = await bots.rotate(botId, windowId, { expectedGeneration: 0 });
    const next = SessionManager.open(rotated.session.path);
    const seed = next.getBranch().find(entry => entry.customType === HANDOFF_MESSAGE);
    assert.equal(seed.details.reconciled, undefined, 'a manual move does not prove the verbatim part was summarized');
    next.appendMessage({ role: 'user', content: '再聊点别的', timestamp: Date.now() });
    const latest = next.appendMessage(assistant([{ type: 'text', text: '好的' }]));
    let request = '';
    const answer = { topic: '装修', episodes: ['2026-03-01: 开始聊装修', '2026-03-02: 门牌改成 12 号'], now: { doing: '', next: '', waiting: '' },
        notes: [{ op: 'add', kind: 'ref', text: '门牌 12 号', entry: seed.id.slice(0, 8), quote: '门牌改成 12 号了' },
            { op: 'add', kind: 'decision', text: '记住 12 号', entry: seed.id.slice(0, 8), quote: '记住了，12 号' }] };
    const result = await compaction.structuredCompaction({ branch: next.getBranch(), projection: next.buildSessionProjection().entries,
        firstKeptEntryId: latest, sessionId: next.getSessionId(), model: { provider: 'fixture', id: 'small', contextWindow: 128000 },
        now: new Date().toISOString(), reason: 'threshold', complete: async ({ text }) => { request = text; return { text: JSON.stringify(answer), stopReason: 'stop', usage: usageRecord }; } });
    assert.match(request, new RegExp(`\\[e:${seed.id.slice(0, 8)}\\][^\\n]*User: 对了，门牌改成 12 号了\\n\\[e:${seed.id.slice(0, 8)}\\][^\\n]*Assistant: 记住了，12 号`));
    assert.doesNotMatch(request, /Context note/, 'the sections are the earlier memory, not repeated');
    const bot = result.details.pivaneBot;
    assert.deepEqual(bot.ledger.ops.map(op => [op.op, op.text, op.source.entryId, op.source.role]), [['add', '门牌 12 号', seed.id, 'user']]);
    assert.deepEqual(bot.rejected.map(item => item.reason), ['quote from the wrong speaker'], 'speakers are checked for carried messages too');
    assert.deepEqual(bot.sections.episodes.at(-1), '2026-03-02: 门牌改成 12 号');
});

test('a note deleted before a manual move does not come back from the carried messages', { timeout: 60000 }, async t => {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const compaction = require('../server/bot/bot-compaction');
    const store = new PiSessionStore();
    const profiles = new PiProfileRegistry(store);
    store.profiles = profiles;
    const supervisor = new PiAgentSupervisor();
    t.after(() => supervisor.dispose());
    const bots = new BotService({ store, profiles, supervisor });
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const botId = created.bot.id, windowId = created.window.id;
    const { session } = await bots.resolve(botId, windowId);
    const manager = SessionManager.open(session.path);
    const said = manager.appendMessage({ role: 'user', content: '对了，门牌改成 12 号了', timestamp: Date.now() });
    manager.appendMessage(assistant([{ type: 'text', text: '记住了，12 号' }]));
    const noted = ledger.prepareOps(ledger.emptyLedger(), [{ op: 'add', kind: 'ref', text: '门牌 12 号',
        source: { sessionId: manager.getSessionId(), entryId: said, role: 'user', quote: '对了，门牌改成 12 号了' } }], { at: new Date().toISOString(), by: 'bot' });
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, ops: noted.ops });
    await new Promise(resolve => setTimeout(resolve, 5));
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, ops: ledger.prepareOps(noted.state, [{ op: 'delete', id: 'n1' }], { at: new Date().toISOString(), by: 'user' }).ops });
    await new Promise(resolve => setTimeout(resolve, 5));
    const rotated = await bots.rotate(botId, windowId, { expectedGeneration: 0 });
    const next = SessionManager.open(rotated.session.path);
    const seed = next.getBranch().find(entry => entry.customType === HANDOFF_MESSAGE);
    assert.equal(seed.details.tail[0].entryId, said, 'carried messages keep the entry they had');
    const fresh = next.appendMessage({ role: 'user', content: '还是记一下：门牌 12 号', timestamp: Date.now() });
    const latest = next.appendMessage(assistant([{ type: 'text', text: '好的' }]));
    const cite = seed.id.slice(0, 8);
    const answer = { topic: '装修', episodes: ['2026-03-02: 门牌改成 12 号'], now: { doing: '', next: '', waiting: '' }, notes: [
        { op: 'add', kind: 'ref', text: '门牌 12 号', entry: cite, quote: '门牌改成 12 号了' },
        { op: 'add', kind: 'ref', text: '门牌号是 12', entry: cite, quote: '门牌改成 12 号了' },
        { op: 'add', kind: 'ref', text: '门牌 12 号', entry: fresh.slice(0, 8), quote: '还是记一下' }] };
    const result = await compaction.structuredCompaction({ branch: next.getBranch(), projection: next.buildSessionProjection().entries,
        firstKeptEntryId: latest, sessionId: next.getSessionId(), model: { provider: 'fixture', id: 'small', contextWindow: 128000 },
        now: new Date().toISOString(), reason: 'threshold', complete: async () => ({ text: JSON.stringify(answer), stopReason: 'stop', usage: usageRecord }) });
    const bot = result.details.pivaneBot;
    assert.deepEqual(bot.rejected.map(item => item.reason), ['deleted by the user', 'deleted by the user'], 'same text, or same original message');
    assert.deepEqual(bot.ledger.ops.map(op => [op.op, op.text, op.source.entryId]), [['add', '门牌 12 号', fresh]], 'a new statement after the deletion counts');
    // A carried message without its time is not taken as newer than the deletion.
    const unknown = compaction.checkNote(answer.notes[0], ledger.replay(next.getBranch()),
        new Map([[cite, [{ entry: seed, message: { role: 'user' }, text: '对了，门牌改成 12 号了', sessionId: 's', origin: { entryId: null, at: null } }]]]), { at: new Date().toISOString() });
    assert.equal(unknown.rejected, 'deleted by the user');
});
