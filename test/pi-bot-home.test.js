const test = require('node:test');
const assert = require('node:assert/strict');
const home = require('../public/pi-bot-home');

const win = (id, extra = {}) => ({ id, kind: 'topic', title: id, generation: 0, archivedAt: null, sessionId: `s-${id}`, ...extra });
const bot = (id, windows, extra = {}) => ({ id, name: id, enabled: true, bot: { job: `${id} job`, onboarding: { phase: 'done' } }, windows, ...extra });
const activity = (runtimes = [], notices = []) => home.live({ runtimes: runtimes.map(([id, phase, busy]) => ({ cwd: '/w', sessionId: `s-${id}`, phase, busy })),
    replyNotices: notices.map(id => ({ cwd: '/w', sessionId: `s-${id}`, completionId: `c-${id}` })) });

test('a Bot is waiting before working, counts chats with new replies and picks one topic shortcut', () => {
    const b = bot('a', [win('main', { kind: 'main' }), win('t1'), win('t2'), win('t3'), win('old', { archivedAt: '2026-10-01T00:00:00Z' })]);
    const state = activity([['t1', 'tool', true], ['t2', 'waiting', true]], ['main', 't3', 'old']);
    const summary = home.summarize(b, state);
    assert.equal(summary.kind, 'waiting');
    assert.equal(summary.where.id, 't2');
    assert.equal(summary.unread, 2, 'archived chats do not count');
    assert.equal(summary.attention.id, 't2', 'waiting beats a new reply, which beats work');
    assert.equal(home.statusText(b, summary), '等你确认 · 话题“t2”');
    assert.equal(home.windowState(b.windows[1], state), 'working');
    assert.equal(home.windowState(b.windows[3], state), 'new');
});

test('unknown when activity cannot be read, loading before the first read, never shown as idle', () => {
    const b = bot('a', [win('main', { kind: 'main' })]);
    assert.equal(home.summarize(b, null).kind, 'loading');
    const unknown = home.summarize(b, home.live(null, false));
    assert.equal(unknown.kind, 'unknown');
    assert.equal(home.statusText(b, unknown), '暂时看不到它在做什么');
    assert.equal(home.windowState(b.windows[0], home.live(null, false)), null);
    assert.equal(home.statusText(b, home.summarize(b, activity())), 'a job');
    const greeting = bot('g', [win('main', { kind: 'main' })], { bot: { onboarding: { phase: 'interview' } } });
    assert.equal(home.summarize(greeting, activity()).kind, 'greeting');
});

test('others with news exclude the open Bot; rows keep the listed order through filters and search', () => {
    const bots = [bot('a', [win('a1', { kind: 'main' })]), bot('b', [win('b1', { kind: 'main' }), win('装修')]), bot('c', [win('c1', { kind: 'main' })])];
    const state = activity([['c1', 'waiting', true]], ['a1', '装修']);
    assert.equal(home.othersWithNews(bots, state, 'a'), 2);
    assert.equal(home.othersWithNews(bots, state, 'c'), 2);
    assert.deepEqual(home.rows(bots, state).map(row => row.bot.id), ['a', 'b', 'c']);
    assert.deepEqual(home.rows(bots, state, { filter: 'waiting' }).map(row => row.bot.id), ['c']);
    assert.deepEqual(home.rows(bots, state, { filter: 'unread' }).map(row => row.bot.id), ['a', 'b']);
    const found = home.rows(bots, state, { query: '装' });
    assert.deepEqual(found.map(row => [row.bot.id, row.match?.id]), [['b', '装修']]);
});

test('the repaint signature changes only with what is shown', () => {
    const bots = [bot('a', [win('a1', { kind: 'main' }), win('t')])];
    const first = home.signature(bots, activity([['a1', 'idle', false]], []));
    assert.equal(first, home.signature(bots, activity([['a1', 'running', false]], [])), 'an idle worker with another phase is not news');
    assert.notEqual(first, home.signature(bots, activity([['t', 'tool', true]], [])));
    assert.equal(home.signature(bots, home.live(null, false)), 'unknown');
    assert.equal(home.signature(bots, null), 'none');
});
