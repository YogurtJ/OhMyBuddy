const test = require('node:test');
const assert = require('node:assert/strict');
const ledger = require('../server/bot/bot-ledger');

const T0 = '2026-03-01T09:00:00.000Z', T1 = '2026-03-02T09:00:00.000Z', T2 = '2026-03-20T09:00:00.000Z';
const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = (content) => ({ role: 'assistant', content, api: 'openai-completions', provider: 'fixture', model: 'small', usage, stopReason: 'stop', timestamp: Date.now() });

test('notebook operations validate, assign ids in order and keep tombstones', () => {
    let { ops, state } = ledger.prepareOps(ledger.emptyLedger(), [
        { op: 'add', kind: 'decision', text: '  卫生间瓷砖定 60×120\n哑光灰 ' },
        { op: 'add', kind: 'commitment', text: '周五前整理三家报价', due: '2026-03-06' }
    ], { at: T0, by: 'bot', source: { sessionId: 's1', entryId: 'e1' } });
    assert.deepEqual(ops.map(op => op.id), ['n1', 'n2']);
    assert.equal(state.items[0].text, '卫生间瓷砖定 60×120 哑光灰', 'whitespace is folded');
    assert.deepEqual(state.items[1].source, { sessionId: 's1', entryId: 'e1' });
    ({ state } = ledger.prepareOps(state, [{ op: 'add', kind: 'decision', text: '瓷砖改成 75×150 浅灰', supersedes: 'n1' }], { at: T1, by: 'summary' }));
    assert.equal(state.items.find(item => item.id === 'n1').status, 'superseded');
    assert.equal(state.items.find(item => item.id === 'n3').supersedes, 'n1');
    ({ state } = ledger.prepareOps(state, [{ op: 'status', id: 'n2', status: 'done' }, { op: 'update', id: 'n3', due: '2026-04-01' }], { at: T2, by: 'user' }));
    assert.equal(state.items.find(item => item.id === 'n2').status, 'done');
    for (const [raw, by, pattern] of [
        [{ op: 'add', kind: 'wish', text: 'x' }, 'bot', /kind/],
        [{ op: 'add', kind: 'ref', text: '   ' }, 'bot', /1-500/],
        [{ op: 'add', kind: 'ref', text: 'x'.repeat(501) }, 'bot', /1-500/],
        [{ op: 'add', kind: 'ref', text: 'x', due: 'next friday' }, 'bot', /due/],
        [{ op: 'status', id: 'n9', status: 'done' }, 'bot', /No note n9/],
        [{ op: 'status', id: 'n2', status: 'done' }, 'bot', /already done/],
        [{ op: 'update', id: 'n3', due: '2026-04-01' }, 'bot', /already says/],
        [{ op: 'delete', id: 'n3' }, 'bot', /Only the user/],
        [{ op: 'add', kind: 'decision', text: 'y', supersedes: 'n1' }, 'bot', /No current note n1/],
        [{ op: 'add', kind: 'ref', text: 'x', source: { sessionId: 's1', entryId: 'e1', role: 'user' } }, 'bot', /source/],
        [{ op: 'add', kind: 'ref', text: 'x', source: { sessionId: 's1', entryId: 'e1', role: 'system', quote: 'hi' } }, 'bot', /source/],
        [{ op: 'add', kind: 'ref', text: 'x', source: { sessionId: 's1', entryId: 'e1', role: 'user', quote: 'q'.repeat(301) } }, 'bot', /source/]
    ]) assert.throws(() => ledger.prepareOps(state, [raw], { at: T2, by }), pattern);
    // A batch is all or nothing.
    assert.throws(() => ledger.prepareOps(state, [{ op: 'add', kind: 'ref', text: 'ok' }, { op: 'status', id: 'n77', status: 'done' }], { at: T2, by: 'bot' }));
    ({ state } = ledger.prepareOps(state, [{ op: 'delete', id: 'n3' }], { at: T2, by: 'user' }));
    const deleted = state.items.find(item => item.id === 'n3');
    assert.equal(deleted.status, 'deleted'); assert.equal(deleted.text, '', 'a tombstone keeps no text');
    assert.throws(() => ledger.prepareOps(state, [{ op: 'update', id: 'n3', text: 'again' }], { at: T2, by: 'user' }), /No note n3/);
    assert.equal(state.nextSeq, 4, 'ids are never reused');
    // A source may carry who said it and a short quote; long text is cut to a quote that fits.
    const quote = ledger.sourceQuote('长'.repeat(400));
    assert.equal(quote.length, ledger.MAX_QUOTE); assert.ok(quote.endsWith('…'));
    ({ state } = ledger.prepareOps(state, [{ op: 'add', kind: 'ref', text: '物业电话 6123', source: { sessionId: 's1', entryId: 'e2', role: 'toolResult', quote } }], { at: T2, by: 'bot' }));
    assert.deepEqual(state.items.at(-1).source, { sessionId: 's1', entryId: 'e2', role: 'toolResult', quote });
    ({ state } = ledger.prepareOps(state, [{ op: 'delete', id: 'n4' }], { at: T2, by: 'user' }));
    assert.deepEqual(ledger.readSnapshot(JSON.parse(JSON.stringify(state))), state, 'snapshots round-trip');
    assert.equal(ledger.readSnapshot({ ...state, nextSeq: 2 }), null, 'an id at or above nextSeq is rejected');
});

test('replay follows tool results, panel edits, seeds and Bot compactions in branch order', async () => {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const manager = SessionManager.inMemory('/tmp');
    // Seed of a generation: a snapshot from the previous one.
    const { state: seed } = ledger.prepareOps(ledger.emptyLedger(), [{ op: 'add', kind: 'ref', text: '物业电话 0571-0000' }], { at: T0, by: 'bot' });
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, snapshot: seed });
    manager.appendMessage({ role: 'user', content: '定了，用哑光灰', timestamp: Date.now() });
    manager.appendMessage(assistant([{ type: 'toolCall', id: 'c1', name: 'window_note', arguments: {} }]));
    const { ops: noted } = ledger.prepareOps(seed, [{ op: 'add', kind: 'decision', text: '瓷砖哑光灰' }], { at: T1, by: 'bot' });
    manager.appendMessage({ role: 'toolResult', toolCallId: 'c1', toolName: 'window_note', content: [{ type: 'text', text: 'ok' }], isError: false,
        details: { pivaneLedger: { v: 1, ops: noted } }, timestamp: Date.now() });
    // A failed tool result never counts.
    manager.appendMessage({ role: 'toolResult', toolCallId: 'c2', toolName: 'window_note', content: [{ type: 'text', text: 'no' }], isError: true,
        details: { pivaneLedger: { v: 1, ops: [{ ...noted[0], id: 'n3', text: 'bogus' }] } }, timestamp: Date.now() });
    let state = ledger.replay(manager.getBranch());
    assert.deepEqual(state.items.map(item => [item.id, item.text]), [['n1', '物业电话 0571-0000'], ['n2', '瓷砖哑光灰']]);
    // Panel edit, then a damaged operation that is skipped without losing the rest.
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, ops: [{ op: 'status', id: 'n2', status: 'done', at: T2, by: 'user' },
        { op: 'add', id: 'n9', kind: 'ref', text: 'skipped: wrong id', at: T2, by: 'user' }] });
    state = ledger.replay(manager.getBranch());
    assert.equal(state.items.find(item => item.id === 'n2').status, 'done');
    assert.equal(state.items.length, 2);
    // A Bot compaction: its own operations, then the snapshot after them.
    const { ops: reconciled, state: after } = ledger.prepareOps(state, [{ op: 'add', kind: 'commitment', text: '周五前发报价', due: '2026-03-27' }],
        { at: T2, by: 'summary' });
    manager.appendCompaction('summary', manager.getLeafId(), 100, { pivaneBot: { v: 1, ledger: { ops: reconciled, snapshot: after } } }, true);
    assert.deepEqual(ledger.replay(manager.getBranch()), after);
    // A snapshot that does not parse is ignored rather than erasing the notebook.
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, snapshot: { version: 1, nextSeq: 1, items: [{ id: 'n5' }] } });
    assert.deepEqual(ledger.replay(manager.getBranch()), after);
});

test('the rendering groups open notes and lists recently closed ones apart', () => {
    let { state } = ledger.prepareOps(ledger.emptyLedger(), [
        { op: 'add', kind: 'commitment', text: '周五前整理报价', due: '2026-03-06' },
        { op: 'add', kind: 'decision', text: '瓷砖哑光灰' },
        { op: 'add', kind: 'open', text: '等阿青确认预算上限' },
        { op: 'add', kind: 'ref', text: '水电师傅老周 138-0000-0000' }
    ], { at: T0, by: 'bot' });
    ({ state } = ledger.prepareOps(state, [{ op: 'status', id: 'n3', status: 'cancelled' }], { at: T1, by: 'user' }));
    const text = ledger.renderLedger(state, { now: T2 });
    assert.match(text, /### Decided\n- \[n2\] 瓷砖哑光灰/);
    assert.match(text, /### Promised[^\n]*\n- \[n1\] 周五前整理报价 \(due 2026-03-06, since 2026-03-01\)/);
    assert.match(text, /### Recently closed \(do not act on these\)\n- \[n3\] cancelled: 等阿青确认预算上限/);
    assert.ok(text.indexOf('Decided') < text.indexOf('Promised'), 'kinds keep a fixed order');
    assert.doesNotMatch(ledger.renderLedger(state, { now: '2026-06-01T00:00:00Z' }), /Recently closed/, 'old closed notes drop out');
    assert.match(ledger.renderLedger(ledger.emptyLedger()), /no open notes/);
});

test('the window_note tool writes branch-following operations and the model sees the notebook', async () => {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const file = require.resolve('../server/bot/bot-notebook.ts');
    const notebook = require(process.env.PIVANE_TEST_PI_JITI).createJiti(file)(file);
    const manager = SessionManager.inMemory('/tmp');
    const userId = manager.appendMessage({ role: 'user', content: '周五前把报价发我，瓷砖就定哑光灰', timestamp: Date.now() });
    const tools = new Map(), handlers = new Map();
    const pi = { registerTool(tool) { tools.set(tool.name, tool); }, on(name, fn) { handlers.set(name, fn); } };
    let bot = true;
    notebook.registerNotebook(pi, () => bot);
    const tool = tools.get(notebook.NOTE_TOOL);
    assert.equal(tool.executionMode, 'sequential');
    const ctx = { sessionManager: manager };
    const call = async (id, input) => {
        const result = await tool.execute(id, input, undefined, undefined, ctx);
        return result;
    };
    // Two calls in one assistant message, before Pi appended either result: distinct ids.
    manager.appendMessage(assistant([{ type: 'toolCall', id: 't1', name: 'window_note', arguments: {} }, { type: 'toolCall', id: 't2', name: 'window_note', arguments: {} }]));
    const first = await call('t1', { action: 'add', kind: 'decision', text: '瓷砖哑光灰' });
    const second = await call('t2', { action: 'add', kind: 'commitment', text: '周五前发报价', due: '2026-03-06' });
    assert.match(first.content[0].text, /added \[n1\] \(decision\): 瓷砖哑光灰/);
    assert.equal(second.details.pivaneLedger.ops[0].id, 'n2');
    // The note points at the user's words that led to it, not at the tool-call message.
    assert.deepEqual(first.details.pivaneLedger.ops[0].source, { sessionId: manager.getSessionId(), entryId: userId, role: 'user', quote: '周五前把报价发我，瓷砖就定哑光灰' });
    for (const [id, result] of [['t1', first], ['t2', second]])
        manager.appendMessage({ role: 'toolResult', toolCallId: id, toolName: 'window_note', content: result.content, details: result.details, isError: false, timestamp: Date.now() });
    await handlers.get('agent_settled')({});
    const third = await call('t3', { action: 'done', id: 'n2' });
    assert.match(third.content[0].text, /marked \[n2\] done: 周五前发报价/);
    await assert.rejects(call('t4', { action: 'update', id: 'n7', text: 'x' }), /No note n7/);
    await assert.rejects(call('t5', { action: 'shout' }), /Unknown notebook action/);
    bot = false;
    await assert.rejects(call('t6', { action: 'add', kind: 'ref', text: 'x' }), /only available in a Bot chat/);
    // Visibility: nothing was compacted yet, so the notebook is rendered once before the next run.
    let notice = notebook.notebookNotice(manager.getBranch(), T2);
    assert.equal(notice.customType, notebook.NOTEBOOK_MESSAGE);
    assert.match(notice.content, /\[n1\] 瓷砖哑光灰/);
    manager.appendCustomMessageEntry(notice.customType, notice.content, false, notice.details);
    assert.equal(notebook.notebookNotice(manager.getBranch(), T2), null, 'shown once');
    // A panel edit is reported as a change, not a full re-render.
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, ops: [{ op: 'status', id: 'n1', status: 'cancelled', at: T2, by: 'user' }] });
    notice = notebook.notebookNotice(manager.getBranch(), T2);
    assert.match(notice.content, /user changed these notes[^]*\[n1\] \(decision, cancelled\) 瓷砖哑光灰/);
    // A native (non-Bot) compaction hides the summary's notebook: render again.
    manager.appendCustomMessageEntry(notice.customType, notice.content, false, notice.details);
    manager.appendCompaction('native summary', manager.getLeafId(), 10);
    assert.match(notebook.notebookNotice(manager.getBranch(), T2).content, /Notebook of this chat/);
    // A Bot compaction carries it in the summary.
    manager.appendCompaction('bot summary', manager.getLeafId(), 10, { pivaneBot: { v: 1, ledger: { ops: [], snapshot: ledger.replay(manager.getBranch()) } } }, true);
    assert.equal(notebook.notebookNotice(manager.getBranch(), T2), null);
    // An empty notebook says nothing.
    assert.equal(notebook.notebookNotice(SessionManager.inMemory('/tmp').getBranch(), T2), null);
});

test('a full notebook with deletions is stored and carried over intact, and ids never repeat', () => {
    let state = ledger.emptyLedger();
    for (let start = 0; start < ledger.MAX_ITEMS; start += 50)
        state = ledger.prepareOps(state, Array.from({ length: 50 }, (_, index) => ({ op: 'add', kind: 'ref', text: `编号 ${start + index}` })), { at: T0, by: 'bot' }).state;
    assert.throws(() => ledger.prepareOps(state, [{ op: 'add', kind: 'ref', text: '满了' }], { at: T0, by: 'bot' }), /full/);
    state = ledger.prepareOps(state, [{ op: 'delete', id: 'n1' }], { at: T1, by: 'user' }).state;
    state = ledger.prepareOps(state, [{ op: 'add', kind: 'ref', text: '新的' }], { at: T1, by: 'bot' }).state;
    assert.equal(state.items.length, ledger.MAX_ITEMS + 1);
    assert.equal(ledger.storable(state), true, 'live notes and tombstones have their own limits');
    const seeded = ledger.replay([{ type: 'custom', customType: ledger.LEDGER_ENTRY, data: { v: 1, snapshot: JSON.parse(JSON.stringify(state)) } }]);
    assert.equal(ledger.ledgerVersion(seeded), ledger.ledgerVersion(state), 'a seed restores exactly this state');
    assert.equal(seeded.nextSeq, ledger.MAX_ITEMS + 2);
    assert.match(seeded.items[0].hash, /^[0-9a-f]{16}$/, 'a tombstone keeps a hash of what it said, not the text');
    assert.equal(seeded.items[0].text, '');
    // Tombstones are bounded: the oldest go first, the next id still continues.
    let churn = ledger.emptyLedger();
    for (let round = 0; round < 35; round++) {
        const added = ledger.prepareOps(churn, Array.from({ length: 32 }, (_, index) => ({ op: 'add', kind: 'open', text: `问题 ${round}-${index}` })),
            { at: new Date(Date.parse(T0) + round * 60000).toISOString(), by: 'bot' });
        churn = ledger.prepareOps(added.state, added.ops.map(op => ({ op: 'delete', id: op.id })),
            { at: new Date(Date.parse(T0) + round * 60000 + 1000).toISOString(), by: 'user' }).state;
    }
    assert.equal(churn.items.length, ledger.MAX_TOMBSTONES);
    assert.equal(churn.items.some(item => item.id === 'n1'), false, 'the oldest tombstones were dropped');
    assert.equal(churn.nextSeq, 35 * 32 + 1);
    assert.equal(ledger.storable(churn), true);
    assert.equal(ledger.readSnapshot({ ...churn, items: [...churn.items, { ...churn.items[0], id: 'n9999' }], nextSeq: 10000 }), null, 'too many tombstones');
});

test('panel edits reach the model as the notes stand now, every one of them', () => {
    const file = require('node:path').join(__dirname, '../server/bot/bot-notebook.ts');
    const notebook = require(process.env.PIVANE_TEST_PI_JITI).createJiti(file)(file);
    let { state } = ledger.prepareOps(ledger.emptyLedger(), [{ op: 'add', kind: 'commitment', text: '交三家报价', due: '2026-03-06' },
        ...Array.from({ length: 45 }, (_, index) => ({ op: 'add', kind: 'ref', text: `门牌 ${index}` }))], { at: T0, by: 'bot' });
    const branch = [{ type: 'custom', customType: ledger.LEDGER_ENTRY, data: { v: 1, snapshot: state } },
        { type: 'custom_message', customType: notebook.NOTEBOOK_MESSAGE, details: { v: 1 } }];
    const edit = raw => { const prepared = ledger.prepareOps(state, raw, { at: T1, by: 'user' }); state = prepared.state;
        branch.push({ type: 'custom', customType: ledger.LEDGER_ENTRY, data: { v: 1, ops: prepared.ops } }); };
    edit([{ op: 'update', id: 'n1', due: '2026-03-09' }]);
    assert.match(notebook.notebookNotice(branch, T1).content, /stand now:\n- \[n1\] \(commitment, active, due 2026-03-09\) 交三家报价$/, 'a changed date is seen');
    edit([{ op: 'update', id: 'n1', due: null }]);
    assert.match(notebook.notebookNotice(branch, T1).content, /- \[n1\] \(commitment, active, no due date\) 交三家报价$/, 'so is a removed one');
    for (let index = 2; index <= 22; index++) edit([{ op: 'status', id: `n${index}`, status: 'done' }]);
    edit([{ op: 'delete', id: 'n23' }]);
    const notice = notebook.notebookNotice(branch, T1);
    assert.equal(notice.content.split('\n').length, 1 + 23, 'no change is left out');
    assert.match(notice.content, /- \[n22\] \(ref, done\) 门牌 20\n- \[n23\] deleted by the user/);
    for (let index = 24; index <= 45; index++) edit([{ op: 'status', id: `n${index}`, status: 'done' }]);
    const many = notebook.notebookNotice(branch, T1);
    assert.match(many.content, /^Notebook of this chat/, 'many changes: the whole notebook again');
    assert.equal(many.details.reason, 'user-edits');
    assert.equal(notebook.notebookNotice([...branch, { type: 'custom_message', customType: notebook.NOTEBOOK_MESSAGE, details: { v: 1 } }], T1), null);
});
