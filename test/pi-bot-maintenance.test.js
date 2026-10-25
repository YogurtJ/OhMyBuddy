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

test('S2 waits for a cold cache and S4 names the rotation reason', () => {
    assert.equal(maintenance.idleDelay(undefined), 10 * 60 * 1000);
    assert.equal(maintenance.idleDelay({ promptCache: { short: 300 } }), 10 * 60 * 1000);
    assert.equal(maintenance.idleDelay({ promptCache: { short: 3600 } }), 3600 * 1000);
    assert.equal(maintenance.idleCompactionWanted({ tokens: 10, percent: 54.9 }), false);
    assert.equal(maintenance.idleCompactionWanted({ tokens: 10, percent: 55 }), true);
    assert.equal(maintenance.idleCompactionWanted({ tokens: null, percent: null }), false);
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
    manager.appendMessage({ role: 'user', content: '报价不急了，取消吧', timestamp: Date.now() });
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, ops: [{ op: 'status', id: 'n2', status: 'cancelled', at: new Date().toISOString(), by: 'user' }] });
    manager.appendMessage(assistant([{ type: 'text', text: '已取消报价' }]));
    const before = ledger.replay(SessionManager.open(session.path).getBranch());
    const worker = { loadedBot: { profileId: botId, windowId, generation: 0 }, sessionPath: session.path };
    assert.equal(await bots.maintainWindow(worker), null, 'a small, young window stays');
    const later = Date.now() + 61 * 24 * 3600 * 1000;
    const rotated = await bots.maintainWindow(worker, { now: later });
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
    // The old worker's view is stale now: nothing happens; a busy window waits for its next run.
    assert.equal(await bots.maintainWindow(worker, { now: later }), null);
    const current = { loadedBot: { profileId: botId, windowId, generation: 1 }, sessionPath: rotated.session.path };
    const idle = supervisor.isSessionIdle;
    supervisor.isSessionIdle = () => false;
    assert.equal(await bots.maintainWindow(current, { now: later + 61 * 24 * 3600 * 1000 }), null);
    supervisor.isSessionIdle = idle;
    assert.equal(generations.generations.length, 2);
});
