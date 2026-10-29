// Bot mode "我记着的事": the header and side entries open the notebook of the open chat; notes
// are grouped, show where they came from, and can be finished, edited, closed, reopened and
// deleted. Each change names the version it was made on; a newer change elsewhere refreshes
// the list, and a busy chat keeps the change for later. Notes taken in a turn are counted in
// its folded summary.
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BOT = '11111111-1111-4111-8111-111111111111', MAIN = '22222222-2222-4222-8222-222222222222';
const workspace = '/fixture/OhMyBuddyBots/bot-11111111', geek = '/fixture/project';
const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const reply = (content, stopReason, at) => ({ role: 'assistant', content, model: 'fixture-model', provider: 'fixture', api: 'openai-completions', stopReason, usage, timestamp: Date.parse(at) });
// One turn: the Bot notes a decision and a promise, then answers.
const history = [
    { role: 'user', content: '卫生间瓷砖就定 60×120 哑光灰，周五前把三家报价发我', timestamp: Date.parse('2026-10-24T06:02:00Z') },
    reply([{ type: 'toolCall', id: 'n-1', name: 'window_note', arguments: { action: 'add', kind: 'decision', text: '卫生间瓷砖用 60×120 哑光灰' } },
        { type: 'toolCall', id: 'n-2', name: 'window_note', arguments: { action: 'add', kind: 'commitment', text: '周五前发三家报价', due: '2026-10-30' } }], 'toolUse', '2026-10-24T06:02:04Z'),
    { role: 'toolResult', toolCallId: 'n-1', toolName: 'window_note', content: [{ type: 'text', text: 'Notebook added [n1]' }], isError: false, timestamp: Date.parse('2026-10-24T06:02:05Z') },
    { role: 'toolResult', toolCallId: 'n-2', toolName: 'window_note', content: [{ type: 'text', text: 'Notebook added [n2]' }], isError: false, timestamp: Date.parse('2026-10-24T06:02:05Z') },
    reply([{ type: 'text', text: '记下了：瓷砖哑光灰，周五前给你三家报价。' }], 'stop', '2026-10-24T06:02:12Z')
];
const said = { role: 'user', text: '卫生间瓷砖就定 60×120 哑光灰，周五前把三家报价发我' };
const startNotes = () => [
    { id: 'n1', kind: 'decision', text: '卫生间瓷砖用 60×120 哑光灰', status: 'active', due: null, by: 'bot', supersedes: null,
        createdAt: '2026-10-24T06:02:05Z', updatedAt: '2026-10-24T06:02:05Z', source: said },
    { id: 'n2', kind: 'commitment', text: '周五前发三家报价', status: 'active', due: '2026-10-30', by: 'bot', supersedes: null,
        createdAt: '2026-10-24T06:02:05Z', updatedAt: '2026-10-24T06:02:05Z', source: said },
    { id: 'n3', kind: 'open', text: '淋浴区要不要做挡水条', status: 'active', due: null, by: 'summary', supersedes: null,
        createdAt: '2026-10-22T03:00:00Z', updatedAt: '2026-10-22T03:00:00Z', source: { role: 'assistant', text: '淋浴区要不要做挡水条？等你看完样品再定。' } },
    { id: 'n4', kind: 'ref', text: '物业装修登记电话 6123', status: 'done', due: null, by: 'bot', supersedes: null,
        createdAt: '2026-10-20T03:00:00Z', updatedAt: '2026-10-21T03:00:00Z', source: null }
];

(async () => {
    const app = express(); app.use(express.static(path.join(__dirname, '../../public')));
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/`;
    const evidence = process.env.PI_BOT_EVIDENCE;
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const width of [1440, 393]) {
            const context = await browser.newContext({ viewport: { width, height: 860 }, locale: 'zh-CN' });
            const page = await context.newPage(), errors = [], posts = [];
            let notes = startNotes(), version = 1, refuse = null, reads = 0;
            const book = () => ({ generation: 2, version: `v${version}`, items: notes.map(note => ({ ...note })) });
            const bot = { id: BOT, name: '小狸', description: '', avatar: { kind: 'emoji', value: '🦊' }, enabled: true, profileRevision: 'p',
                bot: { version: 1, enabled: true, order: 0, job: '', model: null, permissions: { preset: 'free', rules: 0 }, notify: { quietHours: null, dailyProactiveLimit: 20 },
                    onboarding: { version: 1, phase: 'done', firstBot: true, steps: {}, startedAt: null, completedAt: '2026-10-24T00:00:00Z' }, createdAt: '2026-10-24T00:00:00Z' },
                windowsRevision: 'w', windows: [{ id: MAIN, kind: 'main', title: '主聊天', emoji: '💬', focus: '', createdAt: '2026-10-24T00:00:00Z',
                    updatedAt: '2026-10-24T00:00:00Z', archivedAt: null, generation: 0, sessionId: 'gen-0', generations: 1 }] };
            const row = { id: 'gen-0', cwd: workspace, path: `${workspace}/gen-0.jsonl`, name: '', firstMessage: '', messageCount: 5,
                agentProfile: { id: BOT, name: '小狸' }, assistantProject: null, created: '2026-10-24T00:00:00Z', modified: '2026-10-24T00:00:00Z' };
            page.on('pageerror', error => errors.push(error.message));
            await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.abort());
            await page.route('**/api/**', async route => {
                const url = new URL(route.request().url()), pathname = url.pathname, method = route.request().method();
                if (pathname === '/api/pi/status') return route.fulfill({ json: { ok: true, bots: true, agentProfiles: true, assistantProjects: true, deliverables: true,
                    filePreviews: true, fileViewer: true, projectRoots: ['/fixture'], defaultProject: geek } });
                if (pathname === '/api/pi/bots/readiness') return route.fulfill({ json: { models: 1 } });
                if (pathname === '/api/pi/bots') return route.fulfill({ json: { version: 1, revision: 'r1', bots: [bot] } });
                if (pathname === `/api/pi/bots/${BOT}/windows/${MAIN}/session`) return route.fulfill({ json: { window: bot.windows[0], session: row } });
                if (pathname === `/api/pi/bots/${BOT}/windows/${MAIN}/generations`) return route.fulfill({ json: { window: bot.windows[0],
                    generations: [{ generation: 0, startedAt: '2026-10-20T00:00:00Z', endedAt: null, reason: 'initial', current: true }] } });
                if (pathname === `/api/pi/bots/${BOT}/windows/${MAIN}/notebook`) {
                    if (method === 'GET') { reads++; return route.fulfill({ json: book() }); }
                    const body = JSON.parse(route.request().postData());
                    posts.push(body);
                    if (refuse) { const code = refuse; refuse = null;
                        if (code === 'NOTEBOOK_CHANGED') { notes = [...notes, { ...notes[0], id: 'n5', kind: 'preference', text: '不要深色吊顶', source: null }]; version++; }
                        return route.fulfill({ status: 409, json: { error: 'refused', code } }); }
                    assert.equal(body.expectedGeneration, 2); assert.equal(body.expectedVersion, `v${version}`);
                    for (const op of body.ops) {
                        const note = notes.find(item => item.id === op.id);
                        if (op.op === 'delete') notes = notes.filter(item => item.id !== op.id);
                        else if (op.op === 'status') Object.assign(note, { status: op.status, updatedAt: '2026-10-25T09:00:00Z' });
                        else Object.assign(note, op.text ? { text: op.text } : {}, op.due !== undefined ? { due: op.due } : {}, { updatedAt: '2026-10-26T09:00:00Z' });
                    }
                    version++;
                    return route.fulfill({ json: book() });
                }
                if (pathname === '/api/pi/projects') return route.fulfill({ json: { projects: [{ cwd: geek, name: 'project' }], roots: ['/fixture'] } });
                if (pathname === '/api/pi/sessions') return route.fulfill({ json: { sessions: [] } });
                if (pathname === '/api/pi/activity') return route.fulfill({ json: { runtimes: [], pinnedProjects: [], hiddenProjects: [], replyNotices: [] } });
                if (pathname === '/api/pi/profiles') return route.fulfill({ json: { version: 1, revision: 'p', profiles: [] } });
                return route.fulfill({ json: pathname.startsWith('/api/pi/') ? {} : [] });
            });
            await page.routeWebSocket('**/api/pi/ws', ws => {
                ws.onMessage(raw => {
                    const command = JSON.parse(raw);
                    const state = { model: { provider: 'fixture', id: 'fixture-model', name: 'Fixture' }, isStreaming: false, thinkingLevel: 'off' };
                    let data = {};
                    if (command.type === 'open_session') data = { session: row, state, messages: { messages: history }, stats: {},
                        models: { models: [state.model] }, thinkingLevels: { levels: ['off'] }, commands: { commands: [] } };
                    else if (command.type === 'get_state') data = state;
                    else if (command.type === 'get_messages') data = { messages: [] };
                    ws.send(JSON.stringify({ type: 'response', id: command.id, command: command.type, success: true, data }));
                });
            });
            // Desktop: the entry sits above the Bot's settings in the side pane; phones: the header button.
            const openNotes = () => width < 700 ? page.locator('#pi-bot-header .pi-bot-notes-button').click()
                : page.locator('.pi-bot-side .pi-bot-notes-link').click();
            // A note's actions: icons with the row on a pointer screen, labelled choices under "more" on a phone.
            const act = async (id, action) => {
                const note = page.locator(`.pi-bot-notes [data-note-id="${id}"]`);
                if (width >= 700) return note.locator(`.pi-bot-note-tools [data-note-action="${action}"]`).click();
                await note.locator('[data-note-action="more"]').click();
                assert.equal(await note.locator('[data-note-action="more"]').getAttribute('aria-expanded'), 'true');
                assert.equal(await page.evaluate(() => document.activeElement?.closest('.pi-bot-note-panel') != null), true, 'focus moves to the choices');
                if (evidence && action === 'edit') { await page.waitForTimeout(200); await page.screenshot({ path: path.join(evidence, `bot-notes-more-${width}.png`) }); }
                await note.locator(`.pi-bot-note-panel [data-note-action="${action}"]`).click();
            };
            try {
                await page.goto(`${base}#/bot?profileId=${BOT}`, { waitUntil: 'domcontentloaded' });
                await page.locator('.pi-turn-group').first().waitFor({ timeout: 8000 });
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected');

                // The folded turn says two things were noted; the steps read as what happened.
                assert.match(await page.locator('.pi-turn-group .pi-turn-label').first().textContent(), /2 个步骤 · 记下 2 件事$/);
                await page.locator('.pi-turn-group > summary').first().click();
                assert.deepEqual(await page.locator('.pi-tool-row[data-tool-name="window_note"] summary > strong').allTextContents(),
                    ['记到“我记着的事” · 卫生间瓷砖用 60×120 哑光灰', '记到“我记着的事” · 周五前发三家报价']);

                // The entry opens the sheet: active notes by kind, most actionable first; closed ones folded.
                assert.equal(await page.locator('#pi-bot-header .pi-bot-notes-button').isVisible(), true);
                if (width < 700) {
                    const box = await page.locator('#pi-bot-header .pi-bot-notes-button').boundingBox();
                    assert.ok(box.x + box.width >= width - 16, `the header entry sits at the right edge ${JSON.stringify(box)}`);
                }
                await openNotes();
                const sheet = page.locator('.pi-bot-notes[open]');
                await sheet.locator('.pi-bot-note').first().waitFor({ timeout: 8000 });
                assert.equal(await sheet.locator('h2').textContent(), '我记着的事');
                assert.deepEqual(await sheet.locator('.pi-bot-notes-group > h3').allTextContents(), ['答应的事', '等回答的问题', '已经定下的']);
                assert.match(await sheet.locator('[data-note-id="n2"] .pi-bot-note-meta').textContent(), /^截止 10月30日 · 10月24日 记下$/);
                assert.match(await sheet.locator('.pi-bot-notes-closed > summary').textContent(), /已完成或不需要了（1）/);
                assert.equal(await sheet.locator('[data-note-id="n4"]').isVisible(), false, 'closed notes start folded');
                await sheet.locator('[data-note-id="n3"] .pi-bot-note-source summary').click();
                assert.equal(await sheet.locator('[data-note-id="n3"] .pi-bot-note-source p').textContent(), '小狸 说：“淋浴区要不要做挡水条？等你看完样品再定。”');
                await sheet.locator('[data-note-id="n1"] .pi-bot-note-source summary').click();
                assert.match(await sheet.locator('[data-note-id="n1"] .pi-bot-note-source p').textContent(), /^你说：“卫生间瓷砖/);
                assert.equal(await sheet.locator('[data-note-id="n1"] [data-note-action="done"]').count(), 0, 'a decision has nothing to finish');
                if (evidence) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(evidence, `bot-notes-${width}.png`) }); }

                // Finish a promise: one status change on the version shown; it moves to the closed list.
                await sheet.locator('[data-note-id="n2"] [data-note-action="done"]').click();
                await page.waitForFunction(() => /已完成或不需要了（2）/.test(document.querySelector('.pi-bot-notes-closed > summary')?.textContent || ''));
                assert.deepEqual(posts.at(-1), { expectedGeneration: 2, expectedVersion: 'v1', ops: [{ op: 'status', id: 'n2', status: 'done' }] });
                assert.deepEqual(await sheet.locator('.pi-bot-notes-group > h3').allTextContents(), ['等回答的问题', '已经定下的']);

                // Edit: only what changed is sent; an emptied text is not saved.
                await act('n1', 'edit');
                const text = sheet.locator('[data-note-id="n1"] textarea');
                assert.equal(await text.evaluate(node => document.activeElement === node), true, 'the text is focused');
                await text.fill('   ');
                await sheet.locator('[data-note-id="n1"] [data-note-action="edit-save"]').click();
                assert.equal(await sheet.locator('.pi-bot-sheet-status').textContent(), '内容不能为空');
                assert.equal(posts.length, 1);
                await text.fill('卫生间瓷砖改成 75×150 浅灰');
                assert.notEqual(await sheet.locator('.pi-bot-sheet-status').textContent(), '内容不能为空', 'typing clears the error');
                if (evidence) { await page.waitForTimeout(200); await page.screenshot({ path: path.join(evidence, `bot-notes-edit-${width}.png`) }); }
                await sheet.locator('[data-note-id="n1"] [data-note-action="edit-save"]').click();
                await page.waitForFunction(() => document.querySelector('[data-note-id="n1"] .pi-bot-note-text')?.textContent === '卫生间瓷砖改成 75×150 浅灰');
                assert.deepEqual(posts.at(-1).ops, [{ op: 'update', id: 'n1', text: '卫生间瓷砖改成 75×150 浅灰' }]);
                assert.match(await sheet.locator('[data-note-id="n1"] .pi-bot-note-meta').textContent(), /10月26日 改过/);

                // A busy chat keeps the change for later; a newer change elsewhere refreshes the list.
                refuse = 'SESSION_BUSY';
                await act('n3', 'cancel');
                await page.waitForFunction(() => /正在回复/.test(document.querySelector('.pi-bot-sheet-status')?.textContent || ''));
                assert.equal(await sheet.locator('[data-note-id="n3"]').evaluate(node => node.classList.contains('is-active')), true);
                refuse = 'NOTEBOOK_CHANGED';
                const before = reads;
                await act('n3', 'cancel');
                await page.waitForFunction(() => /已刷新/.test(document.querySelector('.pi-bot-sheet-status')?.textContent || ''));
                assert.equal(reads, before + 1, 'the list was read again');
                assert.equal(await sheet.locator('[data-note-id="n5"]').count(), 1, 'the newer note shows');
                assert.equal(await sheet.locator('.pi-bot-sheet-status').getAttribute('data-tone'), 'warn');

                // Reopen from the closed list, then delete with a confirmation.
                await sheet.locator('.pi-bot-notes-closed > summary').click();
                await act('n4', 'reopen');
                await page.waitForFunction(() => document.querySelector('[data-note-id="n4"]')?.classList.contains('is-active'));
                assert.deepEqual(posts.at(-1).ops, [{ op: 'status', id: 'n4', status: 'active' }]);
                await act('n4', 'delete');
                assert.equal(await sheet.locator('[data-note-id="n4"] .pi-bot-note-ask').textContent(), '删掉这条？小狸 就不会再记得它。');
                assert.equal(await page.evaluate(() => document.activeElement?.dataset.noteAction), 'delete-cancel', 'focus goes to the safe choice');
                if (evidence) { await page.waitForTimeout(200); await page.screenshot({ path: path.join(evidence, `bot-notes-delete-${width}.png`) }); }
                const count = posts.length;
                await sheet.locator('[data-note-id="n4"] [data-note-action="delete-cancel"]').click();
                assert.equal(posts.length, count);
                await act('n4', 'delete');
                await sheet.locator('[data-note-id="n4"] [data-note-action="delete-confirm"]').click();
                await page.locator('[data-note-id="n4"]').waitFor({ state: 'detached', timeout: 8000 });
                assert.deepEqual(posts.at(-1).ops, [{ op: 'delete', id: 'n4' }]);

                // Escape closes it; on a phone the side drawer offers the same entry too.
                await page.keyboard.press('Escape');
                await page.locator('.pi-bot-notes').waitFor({ state: 'detached', timeout: 8000 });
                if (width < 700) {
                    await page.locator('#pi-bot-header .pi-bot-menu').click();
                    await page.locator('#pi-session-pane.open .pi-bot-notes-link').click();
                    await page.waitForFunction(() => !document.querySelector('#pi-session-pane').classList.contains('open'));
                    await sheet.locator('.pi-bot-note').first().waitFor({ timeout: 8000 });
                    const box = await sheet.boundingBox();
                    assert.ok(box.width === width && box.height >= 800, `full-screen sheet on a phone ${JSON.stringify(box)}`);
                    const sizes = await sheet.locator('.pi-bot-note-action, .pi-bot-note-panel button').evaluateAll(nodes => nodes
                        .filter(node => node.getClientRects().length).map(node => Math.round(node.getBoundingClientRect().height)));
                    assert.ok(sizes.length && sizes.every(size => size >= 40), `touch targets ${sizes}`);
                    assert.equal(await sheet.locator('.pi-bot-note-tools').first().isVisible(), false, 'no row of icons on a phone');
                }
                // An empty notebook explains what will show up.
                await page.keyboard.press('Escape');
                notes = []; version++;
                await openNotes();
                await sheet.locator('.pi-bot-notes-empty').waitFor({ timeout: 8000 });
                assert.match(await sheet.locator('.pi-bot-notes-empty').innerText(), /还没有记下的事[\s\S]*小狸 会记在这里/);
                if (evidence) { await page.waitForTimeout(200); await page.screenshot({ path: path.join(evidence, `bot-notes-empty-${width}.png`) }); }
                await page.keyboard.press('Escape');

                assert.deepEqual(errors, []);
                assert.equal(await page.evaluate(() => document.body.scrollWidth <= innerWidth), true, 'no horizontal overflow');
                console.log(JSON.stringify({ width, status: 'passed', posts: posts.length }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
