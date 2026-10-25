const test = require('node:test');
const assert = require('node:assert/strict');
const ledger = require('../server/bot/bot-ledger');
const compaction = require('../server/bot/bot-compaction');

const NOW = '2026-03-20T09:00:00.000Z';
const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = (content) => ({ role: 'assistant', content, api: 'openai-completions', provider: 'fixture', model: 'small', usage, stopReason: 'stop', timestamp: Date.now() });

async function conversation() {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const manager = SessionManager.inMemory('/tmp');
    const { state: seed } = ledger.prepareOps(ledger.emptyLedger(), [{ op: 'add', kind: 'commitment', text: '周五前整理三家报价', due: '2026-03-06' }],
        { at: '2026-03-01T00:00:00Z', by: 'bot' });
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, snapshot: seed });
    const ids = {};
    ids.user1 = manager.appendMessage({ role: 'user', content: '瓷砖就定 60×120 哑光灰吧，亮面的不要。报价我已经整理好了。', timestamp: Date.now() });
    ids.assistant1 = manager.appendMessage(assistant([{ type: 'text', text: '好的。我建议踢脚线用同色系，下周三我把清单发给你。' },
        { type: 'toolCall', id: 'c1', name: 'web_search', arguments: { q: '60x120 哑光灰' } }]));
    ids.tool1 = manager.appendMessage({ role: 'toolResult', toolCallId: 'c1', toolName: 'web_search', content: [{ type: 'text', text: '某品牌 型号 GT-6120M 哑光灰 168 元/片' + ' 填充'.repeat(800) }], isError: false, timestamp: Date.now() });
    ids.user2 = manager.appendMessage({ role: 'user', content: '好，就按这个来', timestamp: Date.now() });
    ids.kept = manager.appendMessage(assistant([{ type: 'text', text: '收到。' }]));
    return { manager, ids };
}

const answerWith = notes => JSON.stringify({ topic: '装修：瓷砖与报价', episodes: ['2026-03-01: 定了瓷砖'], now: { doing: '', next: '发清单', waiting: '' }, notes });

test('notebook changes are kept only when the quote is real and comes from the right speaker', async () => {
    const { manager, ids } = await conversation();
    const short = id => id.slice(0, 8);
    const notes = [
        { op: 'add', kind: 'decision', text: '瓷砖 60×120 哑光灰', entry: short(ids.user1), quote: '瓷砖就定 60×120 哑光灰吧' },
        { op: 'add', kind: 'decision', text: '踢脚线同色系', entry: short(ids.assistant1), quote: '我建议踢脚线用同色系' },
        { op: 'add', kind: 'commitment', text: '下周三发清单', entry: `e:${short(ids.assistant1)}`, quote: '下周三我把清单发给你' },
        { op: 'add', kind: 'ref', text: '型号 GT-6120M', entry: short(ids.tool1), quote: 'GT-6120M' },
        { op: 'add', kind: 'preference', text: '不要亮面', entry: short(ids.user1), quote: '亮面的 不要' },
        { op: 'done', id: 'n1', entry: short(ids.user1), quote: '报价我已经整理好了' },
        { op: 'cancel', id: 'n9', entry: short(ids.user1), quote: '亮面的不要' },
        { op: 'add', kind: 'decision', text: '瓷砖 60×120 哑光灰', entry: short(ids.user2), quote: '就按这个来' },
        { op: 'add', kind: 'open', text: '没有出处', entry: 'deadbeef', quote: '就按这个来' },
        { op: 'add', kind: 'ref', text: '太短', entry: short(ids.user2), quote: '好' }
    ];
    const complete = async ({ text }) => {
        assert.match(text, /<notebook>\n\[n1\] \(commitment, active, due 2026-03-06\) 周五前整理三家报价/);
        assert.match(text, new RegExp(`\\[e:${short(ids.tool1)}\\][^\\n]*Tool result \\(web_search\\)[^\\n]*…\\[\\+\\d+ chars\\]`), 'tool output is clipped');
        assert.doesNotMatch(text, new RegExp(`e:${short(ids.kept)}`), 'the kept tail is not summarized');
        return { text: '```json\n' + answerWith(notes) + '\n```', stopReason: 'stop', usage };
    };
    const result = await compaction.structuredCompaction({ branch: manager.getBranch(), projection: manager.buildSessionProjection().entries,
        firstKeptEntryId: ids.kept, sessionId: manager.getSessionId(), model: { provider: 'fixture', id: 'small', contextWindow: 128000 },
        now: NOW, complete, reason: 'manual' });
    const bot = result.details.pivaneBot;
    assert.deepEqual(bot.ledger.ops.map(op => [op.op, op.id, op.kind ?? op.status]),
        [['add', 'n2', 'decision'], ['add', 'n3', 'commitment'], ['add', 'n4', 'ref'], ['status', 'n1', 'done']]);
    assert.deepEqual(bot.ledger.ops[0].source, { sessionId: manager.getSessionId(), entryId: ids.user1, role: 'user', quote: '瓷砖就定 60×120 哑光灰吧' });
    assert.deepEqual(bot.rejected.map(item => item.reason), ['quote from the wrong speaker', 'quote not found', 'No note n9', 'already noted', 'unknown entry', 'quote length']);
    assert.deepEqual(bot.ledger.snapshot, ledger.replay([...manager.getBranch(), { type: 'compaction', details: result.details }]));
    assert.match(result.summary, /## Notebook\nNotebook of this chat[^]*### Decided\n- \[n2\] 瓷砖 60×120 哑光灰[^]*Recently closed[^]*\[n1\] done/);
    assert.match(result.summary, /## What happened \(oldest first\)\n- 2026-03-01: 定了瓷砖/);
    assert.equal(result.usage.totalTokens, 2);
});

test('long parts are summarized in chunks that carry the earlier memory and notebook forward', async () => {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const manager = SessionManager.inMemory('/tmp');
    const ids = [];
    for (let index = 0; index < 12; index++) {
        ids.push(manager.appendMessage({ role: 'user', content: `第${index}天：` + '我们继续聊装修的细节。'.repeat(60), timestamp: Date.now() }));
        manager.appendMessage(assistant([{ type: 'text', text: '好的，记下了。'.repeat(40) }]));
    }
    const kept = manager.appendMessage({ role: 'user', content: '最后一句', timestamp: Date.now() });
    const texts = [];
    const complete = async ({ text }) => {
        texts.push(text);
        const first = texts.length === 1;
        const entry = ids.find(id => text.includes(`[e:${id.slice(0, 8)}]`));
        return { text: JSON.stringify({ topic: `part ${texts.length}`, episodes: [`episode ${texts.length}`], now: {},
            notes: first ? [{ op: 'add', kind: 'decision', text: '第一段的决定', entry: entry.slice(0, 8), quote: '我们继续聊装修的细节' }]
                : [{ op: 'update', id: 'n1', text: '后来改了', entry: entry.slice(0, 8), quote: '我们继续聊装修的细节' }] }), stopReason: 'stop' };
    };
    const result = await compaction.structuredCompaction({ branch: manager.getBranch(), projection: manager.buildSessionProjection().entries,
        firstKeptEntryId: kept, sessionId: manager.getSessionId(), model: { provider: 'fixture', id: 'small', contextWindow: 16000 }, now: NOW, complete, reason: 'threshold' });
    assert.ok(texts.length >= 3, `split into ${texts.length} requests`);
    assert.ok(texts.every(text => compaction.estimateTokens(text) < 9000), 'each request fits the summary budget');
    assert.match(texts[1], /<earlier_memory>[^]*"part 1"/);
    assert.match(texts[1], /<notebook>\n\[n1\] \(decision, active\) 第一段的决定/);
    assert.equal(result.details.pivaneBot.chunks, texts.length);
    assert.equal(result.details.pivaneBot.sections.topic, `part ${texts.length}`);
    assert.equal(result.details.pivaneBot.ledger.snapshot.items[0].text, '后来改了');
    // The next compaction starts from these sections.
    assert.deepEqual(compaction.earlierSections([{ type: 'compaction', details: result.details }]), result.details.pivaneBot.sections);
});

test('a summary that is cut off, not JSON or over budget is refused so Pi can summarize instead', async () => {
    const { manager, ids } = await conversation();
    const run = complete => compaction.structuredCompaction({ branch: manager.getBranch(), projection: manager.buildSessionProjection().entries,
        firstKeptEntryId: ids.kept, sessionId: manager.getSessionId(), model: { contextWindow: 128000 }, now: NOW, complete, reason: 'manual' });
    await assert.rejects(run(async () => ({ text: answerWith([]), stopReason: 'length' })), /cut off/);
    await assert.rejects(run(async () => ({ text: 'Sure! Here is a summary.', stopReason: 'stop' })), /not JSON/);
    await assert.rejects(run(async () => ({ text: JSON.stringify({ topic: 'x'.repeat(900) }), stopReason: 'stop' })), /topic is too long/);
    await assert.rejects(run(async () => ({ text: '', stopReason: 'error', errorMessage: 'provider down' })), /provider down/);
    await assert.rejects(compaction.structuredCompaction({ branch: manager.getBranch(), projection: manager.buildSessionProjection().entries,
        firstKeptEntryId: 'not-on-branch', sessionId: 's', model: {}, now: NOW, complete: async () => ({}), reason: 'manual' }), /Nothing to summarize|not on this branch/);
});

test('summary requests carry the chat thinking level only for reasoning models', () => {
    const { summaryReasoning } = require('../server/bot/bot-compaction');
    assert.deepEqual(summaryReasoning({ reasoning: true }, 'high'), { reasoning: 'high' });
    assert.deepEqual(summaryReasoning({ reasoning: true }, 'off'), {});
    assert.deepEqual(summaryReasoning({ reasoning: false }, 'high'), {});
    assert.deepEqual(summaryReasoning(null, 'medium'), {});
});

test('before the window moves on, the part Pi keeps verbatim is reconciled too', async () => {
    const { manager, ids } = await conversation();
    const kept = manager.appendMessage({ role: 'user', content: '报价那件事不用了，撤掉吧', timestamp: Date.now() });
    manager.appendMessage(assistant([{ type: 'text', text: '好，撤掉。' }]));
    const notes = [{ op: 'cancel', id: 'n1', entry: kept.slice(0, 8), quote: '报价那件事不用了' }];
    const seen = [];
    const complete = async ({ text }) => { seen.push(text); return { text: answerWith(notes), stopReason: 'stop', usage }; };
    const input = { branch: manager.getBranch(), projection: manager.buildSessionProjection().entries, firstKeptEntryId: ids.kept,
        sessionId: manager.getSessionId(), model: { provider: 'fixture', id: 'small', contextWindow: 128000 }, now: NOW, complete, reason: 'threshold' };
    const ordinary = await compaction.structuredCompaction(input);
    assert.doesNotMatch(seen[0], /撤掉吧/);
    assert.deepEqual(ordinary.details.pivaneBot.rejected.map(item => item.reason), ['unknown entry'], 'the kept part cannot be cited normally');
    const moving = await compaction.structuredCompaction({ ...input, includeKept: true });
    assert.match(seen[1], /撤掉吧/);
    assert.deepEqual(moving.details.pivaneBot.ledger.ops.map(op => [op.op, op.id, op.status]), [['status', 'n1', 'cancelled']]);
    assert.equal(moving.details.pivaneBot.includedKept, true);
});

test('a note the user deleted does not come back from what was said before the deletion', async () => {
    const { manager, ids } = await conversation();
    const short = id => id.slice(0, 8);
    const source = { sessionId: manager.getSessionId(), entryId: ids.user1, role: 'user', quote: '瓷砖就定 60×120 哑光灰吧' };
    const added = ledger.prepareOps(ledger.replay(manager.getBranch()), [{ op: 'add', kind: 'decision', text: '瓷砖 60×120 哑光灰', source }], { at: new Date().toISOString(), by: 'bot' });
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, ops: added.ops });
    await new Promise(resolve => setTimeout(resolve, 5));
    const removed = ledger.prepareOps(added.state, [{ op: 'delete', id: 'n2' }], { at: new Date().toISOString(), by: 'user' });
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, ops: removed.ops });
    await new Promise(resolve => setTimeout(resolve, 5));
    const fresh = manager.appendMessage({ role: 'user', content: '想了想还是记下：瓷砖 60×120 哑光灰', timestamp: Date.now() });
    const notes = [
        { op: 'add', kind: 'decision', text: '瓷砖定为 60×120 哑光灰', entry: short(ids.user1), quote: '瓷砖就定 60×120 哑光灰吧' },
        { op: 'add', kind: 'decision', text: '瓷砖 60×120 哑光灰', entry: short(ids.user2), quote: '就按这个来' },
        { op: 'add', kind: 'decision', text: '瓷砖 60×120 哑光灰', entry: short(fresh), quote: '还是记下' }];
    let request = '';
    const result = await compaction.structuredCompaction({ branch: manager.getBranch(), projection: manager.buildSessionProjection().entries,
        firstKeptEntryId: ids.kept, sessionId: manager.getSessionId(), model: { provider: 'fixture', id: 'small', contextWindow: 128000 },
        now: NOW, reason: 'threshold', includeKept: true, complete: async ({ text }) => { request = text; return { text: answerWith(notes), stopReason: 'stop', usage }; } });
    assert.match(request, /Deleted by the user[^\n]*\n- \(decision\) from: "瓷砖就定 60×120 哑光灰吧"/);
    const bot = result.details.pivaneBot;
    assert.deepEqual(bot.rejected.map(item => item.reason), ['deleted by the user', 'deleted by the user'], 'same message, or same text said before');
    assert.deepEqual(bot.ledger.ops.map(op => [op.op, op.id, op.source.entryId]), [['add', 'n3', fresh]], 'said anew after the deletion: noted again');
});

test('an answer missing a section is not taken as the summary; Pi\'s own summary is used instead', async () => {
    const now = { doing: '', next: '', waiting: '' };
    for (const bad of [{}, { topic: '装修', now }, { topic: '装修', episodes: ['a'], now: null }, { topic: ' ', episodes: ['a'], now },
        { topic: '装修', episodes: [], now }, { topic: '装修', episodes: ['a'], now, notes: 'n1 done' }, { topic: '装修', episodes: ['a'], now }])
        assert.throws(() => compaction.readAnswer(bad), /summary/i, JSON.stringify(bad));
    assert.throws(() => compaction.readAnswer({ topic: '装修', episodes: [' '], now }, { earlier: { episodes: ['2026-03-01: 定了瓷砖'] } }), /dropped the earlier episodes/);
    assert.deepEqual(compaction.readAnswer({ topic: '装修', episodes: ['a'], now: {}, notes: [] }), { topic: '装修', episodes: ['a'], now, notes: [] });
    const { manager, ids } = await conversation();
    await assert.rejects(compaction.structuredCompaction({ branch: manager.getBranch(), projection: manager.buildSessionProjection().entries,
        firstKeptEntryId: ids.kept, sessionId: manager.getSessionId(), model: { provider: 'fixture', id: 'small', contextWindow: 128000 },
        now: NOW, reason: 'threshold', complete: async () => ({ text: '{}', stopReason: 'stop', usage }) }), /no topic/);
});

test('long messages reach the summary whole, in parts that keep their entry and speaker', async () => {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const manager = SessionManager.inMemory('/tmp');
    const { state: seed } = ledger.prepareOps(ledger.emptyLedger(), [{ op: 'add', kind: 'commitment', text: '周五前整理三家报价' }], { at: '2026-03-01T00:00:00Z', by: 'bot' });
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, snapshot: seed });
    const long = manager.appendMessage({ role: 'user', content: '规格说明：' + '细节'.repeat(3000) + '。另外，报价那件事取消了，不用整理了。', timestamp: Date.now() });
    const kept = manager.appendMessage(assistant([{ type: 'text', text: '好' }]));
    const requests = [];
    const notes = [{ op: 'cancel', id: 'n1', entry: long.slice(0, 8), quote: '报价那件事取消了' }];
    const result = await compaction.structuredCompaction({ branch: manager.getBranch(), projection: manager.buildSessionProjection().entries,
        firstKeptEntryId: kept, sessionId: manager.getSessionId(), model: { provider: 'fixture', id: 'tiny', contextWindow: 20000 },
        now: NOW, reason: 'threshold', complete: async ({ text }) => { requests.push(text); return { text: answerWith(notes), stopReason: 'stop', usage }; } });
    assert.ok(requests.length >= 2, 'more than one request');
    const all = requests.join('\n');
    assert.match(all, new RegExp(`\\[e:${long.slice(0, 8)}\\][^\\n]*User \\(part 1/\\d\\): 规格说明`));
    assert.match(all, /User \(part (\d)\/\1\): [^\n]*报价那件事取消了，不用整理了。/, 'the end of the message is read');
    assert.doesNotMatch(all, /…\[\+\d+ chars\]/, 'nothing the user said is clipped');
    assert.deepEqual(result.details.pivaneBot.ledger.ops.map(op => [op.op, op.id, op.status]), [['status', 'n1', 'cancelled']]);
});

test('a new generation shows the whole notebook however long it is', async () => {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const { buildHandoff } = require('../server/bot/bot-handoff');
    const manager = SessionManager.inMemory('/tmp');
    const { ops, state } = ledger.prepareOps(ledger.emptyLedger(), Array.from({ length: 60 }, (_, index) => ({ op: 'add', kind: 'ref',
        text: `第 ${index + 1} 条：` + '记'.repeat(480) })), { at: '2026-03-01T00:00:00Z', by: 'bot' });
    const first = manager.appendMessage({ role: 'user', content: '记下这些', timestamp: Date.now() });
    manager.appendMessage(assistant([{ type: 'text', text: '记好了' }]));
    const sections = { topic: '资料', episodes: ['2026-03-01: 记了 60 条'.padEnd(900, '。')], now: { doing: '', next: '', waiting: '' } };
    manager.appendCompaction('bot summary', first, 10, { pivaneBot: { v: 1, sections, includedKept: true, ledger: { ops, snapshot: state } } }, true);
    const handoff = buildHandoff(manager, { now: NOW });
    assert.ok(handoff.text.length > 24000);
    for (let index = 1; index <= 60; index++) assert.ok(handoff.text.includes(`[n${index}] 第 ${index} 条`), `n${index} is shown`);
    assert.equal(handoff.sections.episodes[0].length, 400, 'stored sections are read within the answer limits');
    assert.match(handoff.text, /## Most recent messages \(verbatim\)\nUser: 记下这些\n\nAssistant: 记好了$/);
});
