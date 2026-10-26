const test = require('node:test');
const assert = require('node:assert/strict');
const { TOPIC_INDEX_MESSAGE, TOPIC_INDEX_INTRO, topicIndexUnchanged, topicIndexContext, topicIndexRetirements } = require('../server/bot/bot-topic-context');
const ledger = require('../server/bot/bot-ledger');
const { structuredCompaction } = require('../server/bot/bot-compaction');
const notice = content => ({ customType: TOPIC_INDEX_MESSAGE, content, display: false, details: { v: 1, fingerprint: content } });
const append = (manager, message) => manager.appendCustomMessageEntry(message.customType, message.content, message.display, message.details);
const custom = entry => ({ role: 'custom', customType: entry.customType, content: entry.content,
    display: entry.display, details: entry.details, timestamp: Date.parse(entry.timestamp) });

test('index suppression requires the latest unchanged snapshot to remain in native projection, including empty snapshots and branches', async () => {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const manager = SessionManager.inMemory('/tmp');
    const empty = notice(TOPIC_INDEX_INTRO + '\n- No other active topics.');
    assert.equal(topicIndexUnchanged(manager.buildSessionProjection().entries, empty), false);
    const root = manager.appendMessage({ role: 'user', content: 'Before the index', timestamp: Date.now() });
    const first = append(manager, empty);
    assert.equal(topicIndexUnchanged(manager.buildSessionProjection().entries, empty), true);
    const changed = notice(TOPIC_INDEX_INTRO + '\n- A new topic');
    assert.equal(topicIndexUnchanged(manager.buildSessionProjection().entries, changed), false);
    append(manager, changed);
    assert.equal(topicIndexUnchanged(manager.buildSessionProjection().entries, empty), false, 'an older match does not hide a changed latest snapshot');
    manager.appendContextEdit(first, null);
    assert.equal(topicIndexUnchanged(manager.buildSessionProjection().entries, changed), true);
    manager.branch(root);
    assert.equal(topicIndexUnchanged(manager.buildSessionProjection().entries, changed), false, 'branch navigation invalidates visibility without an in-memory cache');
});

test('context hides superseded indexes immediately and native retirement preserves notebook content, metadata and raw history', async () => {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const manager = SessionManager.inMemory('/tmp');
    const notebook = { customType: 'pivane-bot-notebook', display: false, details: { v: 1, reason: 'user-edits', unknown: 'preserved' },
        content: 'Genuine notebook note\n\n' + TOPIC_INDEX_INTRO + '\nLEGACY_INDEX_ONLY' };
    const legacy = append(manager, notebook);
    const old = append(manager, notice('OLD_INDEX_ONLY'));
    const latest = append(manager, notice('CURRENT_INDEX_ONLY'));
    const before = manager.buildSessionContext().messages;
    const original = structuredClone(before);
    const filtered = topicIndexContext(before, manager.getBranch());
    assert.deepEqual(before, original, 'request transforms do not mutate native facts');
    assert.deepEqual(filtered.filter(message => message.customType === TOPIC_INDEX_MESSAGE).map(message => message.content), ['CURRENT_INDEX_ONLY']);
    assert.equal(filtered.find(message => message.customType === 'pivane-bot-notebook').content, 'Genuine notebook note');
    assert.deepEqual(filtered[0].details, notebook.details);
    const drafts = topicIndexRetirements(manager.buildSessionProjection().entries);
    assert.deepEqual(drafts, [{ type: 'context_edit', targetId: legacy, replacement: { content: 'Genuine notebook note' } },
        { type: 'context_edit', targetId: old, replacement: null }]);
    for (const draft of drafts) manager.appendContextEdit(draft.targetId, draft.replacement);
    assert.deepEqual(topicIndexRetirements(manager.buildSessionProjection().entries), [], 'unchanged turns append no more retirement edits');
    assert.deepEqual(manager.buildSessionContext().messages.filter(message => message.customType === TOPIC_INDEX_MESSAGE).map(message => message.content), ['CURRENT_INDEX_ONLY']);
    assert.equal(manager.getEntry(legacy).content, notebook.content); assert.equal(manager.getEntry(old).content, 'OLD_INDEX_ONLY');
    assert.equal(manager.getEntry(latest).content, 'CURRENT_INDEX_ONLY');
    const kept = manager.appendMessage({ role: 'user', content: 'kept', timestamp: Date.now() });
    manager.appendCompaction('Notebook note in summary', kept, 100, {}, true);
    const restored = topicIndexContext(manager.buildSessionContext().messages, manager.getBranch());
    assert.deepEqual(restored.filter(message => message.customType === TOPIC_INDEX_MESSAGE).map(message => message.content), ['CURRENT_INDEX_ONLY']);
    assert.deepEqual(restored.at(-1), custom(manager.getEntry(latest)), 'restoration is reconstructed from the native entry');
    assert.equal(manager.buildSessionContext().messages.some(message => message.customType === TOPIC_INDEX_MESSAGE), false, 'request-local restoration does not append history');
});

test('structured compaction excludes all index-only snapshots and combined index tails, retaining the genuine notebook', async () => {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const manager = SessionManager.inMemory('/tmp');
    const state = ledger.prepareOps(ledger.emptyLedger(), [{ op: 'add', kind: 'commitment', text: 'Genuine notebook promise', due: '2027-01-01' }],
        { at: '2026-10-25T00:00:00Z', by: 'bot' }).state;
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, snapshot: state });
    manager.appendMessage({ role: 'user', content: 'Ordinary conversation remains', timestamp: Date.now() });
    append(manager, notice('OBSOLETE_INDEX_ONLY'));
    append(manager, { customType: 'pivane-bot-notebook', display: false, details: { v: 1 },
        content: ledger.renderLedger(state) + '\n\n' + TOPIC_INDEX_INTRO + '\nCOMBINED_INDEX_ONLY' });
    append(manager, notice('LATEST_INDEX_ONLY'));
    const kept = manager.appendMessage({ role: 'user', content: 'kept', timestamp: Date.now() });
    let request;
    const result = await structuredCompaction({ branch: manager.getBranch(), projection: manager.buildSessionProjection().entries,
        firstKeptEntryId: kept, sessionId: manager.getSessionId(), model: { contextWindow: 32000 }, now: '2026-10-25T01:00:00Z', reason: 'manual',
        complete: async ({ text }) => {
            request = text;
            return { text: JSON.stringify({ topic: 'Synthetic topic', episodes: ['2026-10-25: A notebook promise'], now: {}, notes: [] }), stopReason: 'stop' };
        } });
    assert.doesNotMatch(request, /OBSOLETE_INDEX_ONLY|LATEST_INDEX_ONLY|COMBINED_INDEX_ONLY|Other topics of this Bot/);
    assert.match(request, /<notebook>[^]*Genuine notebook promise/);
    assert.match(request, /<conversation>[^]*Ordinary conversation remains/);
    assert.match(result.summary, /Genuine notebook promise/);
    assert.deepEqual(result.details.pivaneBot.ledger.snapshot, state);
});
