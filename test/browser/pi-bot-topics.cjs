// Bot topics (public/pi-bot-topics.js with the session pane in pi-bot.js): create with a
// windows-revision conflict that keeps the draft, edit only what changed, archive refused while
// busy and then archived, restore from the archived list, the open-items index, the topic
// approval card, and the receipt card's explicit "Open topic" (also safe for a stale owner).
// Synthetic backend (pi-bot-fixture.cjs); desktop, phone and narrow phone; dark and reduced motion.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, MAIN, APPROVAL, say, serve, botRecord, windowRecord, botPage, newWorld, layout } = require('./pi-bot-fixture.cjs');

const T1 = '55555555-5555-4555-8555-555555555555', T2 = '66666666-6666-4666-8666-666666666666', T3 = '77777777-7777-4777-8777-777777777777';
const REV = letter => letter.repeat(64);

(async () => {
    const { base, close } = await serve();
    const evidence = process.env.PI_BOT_EVIDENCE;
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const width of [1440, 393, 320]) {
            const phone = width < 900;
            let windows = [windowRecord(MAIN),
                windowRecord(T1, { kind: 'topic', title: '英语考试', emoji: '📚', focus: '每天练一点听力' }),
                windowRecord(T2, { kind: 'topic', title: '旧计划', emoji: '', focus: '', archivedAt: '2026-10-25T00:00:00Z' })];
            let windowsRevision = REV('a'), creates = 0, archives = 0, gate = null;
            const receipt = { v: 1, action: 'created', profileId: BOT,
                window: windowRecord(T3, { kind: 'topic', title: '日本旅行', emoji: '✈️', focus: '十二月去大阪' }) };
            const mainHistory = [say('user', '帮我开个话题聊旅行', '2026-10-26T06:00:00Z'),
                { role: 'toolResult', toolCallId: 'topic-call-1', toolName: 'bot_topic', content: [{ type: 'text', text: '{}' }], isError: false,
                    details: { pivaneBotTopic: receipt }, timestamp: Date.parse('2026-10-26T06:00:05Z') },
                say('assistant', '好，开好了“日本旅行”，想聊的时候点开它就行。', '2026-10-26T06:00:09Z')];
            const world = newWorld({
                bots: () => [botRecord({ windows, windowsRevision })],
                messages: sessionId => sessionId === windowRecord(MAIN).sessionId ? mainHistory : []
            });
            const bodies = [];
            const api = async ({ pathname, method, body }) => {
                if (pathname === `/api/pi/bots/${BOT}/topics/open-items`) return { json: { v: 1, omittedTopics: 0, topics: [
                    { windowId: T1, title: '英语考试', state: 'ready', items: [{ title: '周五交作文', kind: 'commitment' }], omitted: 1 },
                    { windowId: T3, title: '日本旅行', state: 'busy', items: [] }] } };
                if (pathname === '/api/pi/bots' && method === 'GET' && gate) { const wait = gate; gate = null; await wait; return undefined; }
                if (pathname === `/api/pi/bots/${BOT}/windows` && method === 'POST') {
                    bodies.push(['POST', body]);
                    // Another device changed the windows first: a plain revision conflict.
                    if (creates++ === 0) { windowsRevision = REV('b'); return { status: 409, json: { error: 'Windows changed' } }; }
                    assert.equal(body.expectedRevision, windowsRevision);
                    const window = windowRecord(T3, { kind: 'topic', title: body.title, emoji: body.emoji, focus: body.focus });
                    windows = [...windows, window]; windowsRevision = REV('c');
                    return { json: { ok: true, window, windowsRevision } };
                }
                const patch = new RegExp(`^/api/pi/bots/${BOT}/windows/([^/]+)$`).exec(pathname);
                if (patch && method === 'PATCH') {
                    bodies.push(['PATCH', patch[1], body]);
                    assert.equal(body.expectedRevision, windowsRevision);
                    if (body.archived === true && archives++ === 0) return { status: 409, json: { error: 'Topic is busy', code: 'BOT_WINDOW_BUSY' } };
                    const { expectedRevision, archived, ...fields } = body;
                    windows = windows.map(item => item.id !== patch[1] ? item : { ...item, ...fields,
                        ...(archived === true ? { archivedAt: '2026-10-26T07:00:00Z' } : archived === false ? { archivedAt: null } : {}) });
                    windowsRevision = REV(String.fromCharCode(windowsRevision.charCodeAt(0) + 1));
                    return { json: { ok: true, window: windows.find(item => item.id === patch[1]), windowsRevision } };
                }
                return undefined;
            };
            const { context, page, errors } = await botPage(browser, base, world, { width, api });
            const shot = async name => { if (evidence) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(evidence, `${name}-${width}.png`) }); } };
            const openPane = async () => { if (phone && !await page.locator('#pi-session-pane.open').count()) { await page.locator('#pi-bot-header .pi-bot-menu').click(); await page.locator('#pi-session-pane.open').waitFor(); } };
            const hash = () => page.evaluate(() => decodeURIComponent(location.hash));
            try {
                await page.locator('.pi-bot-topic-receipt').waitFor();
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected');

                // 1. The pane lists topics with their open items, an add button and the archived list.
                await openPane();
                const t1 = page.locator(`.pi-bot-topic-row:has([data-window-id="${T1}"])`);
                await t1.locator('.pi-bot-topic-badge').waitFor();
                assert.equal((await t1.locator('.pi-bot-topic-badge').textContent()).trim(), '2', 'shown items plus omitted ones');
                assert.equal(await t1.locator('.pi-bot-sr').textContent(), '2 件没办完');
                assert.equal(await page.locator('.pi-bot-archived > summary').textContent(), '已归档（1）');
                assert.equal(await page.locator('.pi-bot-archived-row .pi-bot-window').count(), 0, 'an archived topic is never opened as a live chat');
                await shot('bot-topics-pane');

                // 2. Create: a conflict keeps the draft and rereads the revision; the second save opens the topic.
                await page.locator('.pi-bot-topic-add').click();
                const sheet = page.locator('.pi-bot-topic-sheet[open]');
                await sheet.waitFor();
                assert.equal(await page.locator('#pi-session-pane.open').count(), 0, 'the phone drawer closes for the sheet');
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true, 'a topic needs a name');
                await sheet.locator('[data-topic-field="emoji"]').fill('✈️');
                await sheet.locator('[data-topic-field="title"]').fill('日本旅行');
                await sheet.locator('[data-topic-field="focus"]').fill('十二月去大阪');
                if (phone) for (const field of ['emoji', 'title', 'focus'])
                    assert.equal(await sheet.locator(`[data-topic-field="${field}"]`).evaluate(node => getComputedStyle(node).fontSize), '16px', `${field} does not zoom on phones`);
                await shot('bot-topic-create');
                await sheet.locator('.pi-bot-sheet-save').click();
                await sheet.locator('.pi-bot-sheet-status[data-tone="warn"]').filter({ hasText: '别处改过' }).waitFor();
                assert.deepEqual(await sheet.locator('[data-topic-field]').evaluateAll(nodes => nodes.map(node => node.value)), ['✈️', '日本旅行', '十二月去大阪']);
                await sheet.locator('.pi-bot-sheet-save').click();
                await page.waitForFunction(id => decodeURIComponent(location.hash).includes(`windowId=${id}`), T3);
                assert.deepEqual(bodies.slice(0, 2).map(([, body]) => body), [
                    { expectedRevision: REV('a'), title: '日本旅行', focus: '十二月去大阪', emoji: '✈️' },
                    { expectedRevision: REV('b'), title: '日本旅行', focus: '十二月去大阪', emoji: '✈️' }], 'no blind retry: the second save is the user\'s');
                await page.locator('.pi-bot-empty h2').filter({ hasText: '日本旅行' }).waitFor();
                assert.match(await page.locator('.pi-bot-empty p').textContent(), /这个话题专心聊：十二月去大阪/);
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-who-topic')?.textContent === '✈️ 日本旅行');
                const badge = await page.locator('#pi-bot-header .pi-bot-who').boundingBox();
                assert.ok(badge.x >= 0 && badge.x + badge.width <= width, 'the name badge with the topic fits');
                await shot('bot-topic-open');

                // 3. Edit only what changed.
                await openPane();
                await t1.locator('.pi-bot-topic-edit').click();
                await sheet.waitFor();
                assert.equal(await sheet.locator('h2').textContent(), '编辑话题');
                await sheet.locator('[data-topic-field="focus"]').fill('每天练听力，周五交作文');
                // Closing with an unsaved edit warns once.
                await page.keyboard.press('Escape');
                await sheet.locator('.pi-bot-sheet-status').filter({ hasText: '还有修改没保存' }).waitFor();
                await sheet.locator('.pi-bot-sheet-save').click();
                await page.locator('.pi-bot-topic-sheet').waitFor({ state: 'detached' });
                assert.deepEqual(bodies.at(-1), ['PATCH', T1, { expectedRevision: REV('c'), focus: '每天练听力，周五交作文' }]);

                // 4. Archive: two clicks; a busy topic is refused and the sheet stays; then it is archived.
                await openPane();
                await t1.locator('.pi-bot-topic-edit').click();
                await sheet.waitFor();
                await sheet.locator('[data-topic-action="archive"]').click();
                assert.equal(await sheet.locator('[data-topic-action="archive"] span').textContent(), '再点一次确认归档');
                assert.equal(bodies.filter(([method]) => method === 'PATCH').length, 1, 'the first click only asks');
                await sheet.locator('[data-topic-action="archive"]').click();
                await sheet.locator('.pi-bot-sheet-status[data-tone="error"]').filter({ hasText: '还在忙' }).waitFor();
                await shot('bot-topic-archive-refused');
                await sheet.locator('[data-topic-action="archive"]').click();
                await sheet.locator('[data-topic-action="archive"]').click();
                await page.locator('.pi-bot-topic-sheet').waitFor({ state: 'detached' });
                assert.deepEqual(bodies.filter(([method, , body]) => method === 'PATCH' && body.archived).map(([, id, body]) => [id, Object.keys(body).sort()]),
                    [[T1, ['archived', 'expectedRevision']], [T1, ['archived', 'expectedRevision']]]);
                await page.locator('.pi-toast').filter({ hasText: '话题已归档' }).waitFor();
                await openPane();
                await page.waitForFunction(() => document.querySelector('.pi-bot-archived > summary')?.textContent === '已归档（2）');

                // 5. Restore from the archived list; it is a live topic again.
                await page.locator('.pi-bot-archived > summary').click();
                await page.locator(`.pi-bot-topic-restore[data-window-id="${T2}"]`).click();
                await page.locator(`.pi-bot-topic-row .pi-bot-window[data-window-id="${T2}"]`).waitFor();
                assert.deepEqual(bodies.at(-1)[2].archived, false);
                assert.equal(await page.locator('.pi-bot-archived > summary').textContent(), '已归档（1）');
                assert.equal(await page.locator('.pi-bot-archived').evaluate(node => node.open), true, 'the archived list stays open across redraws');
                await shot('bot-topics-archived');
                if (phone) { await page.locator('#pi-session-pane .pi-bot-window[aria-current="page"]').click(); await page.waitForFunction(() => !document.querySelector('#pi-session-pane').classList.contains('open')); }

                // 6. In the main chat, the receipt opens the topic only when clicked; an archived one says so.
                await page.evaluate(id => window.PiWorkspaceRoute.navigate('bot', { profileId: id, windowId: '22222222-2222-4222-8222-222222222222' }), BOT);
                const card = page.locator('.pi-bot-topic-receipt');
                await card.waitFor();
                assert.equal(await card.locator('strong').textContent(), '日本旅行');
                assert.equal(await card.locator('p').textContent(), '十二月去大阪');
                assert.equal(await card.locator('.pi-bot-topic-mark').textContent(), '✈️');
                assert.ok((await hash()).includes(`windowId=${MAIN}`), 'the result never switches chats by itself');
                await shot('bot-topic-receipt');
                await card.locator('.pi-bot-topic-open').click();
                await page.waitForFunction(id => decodeURIComponent(location.hash).includes(`windowId=${id}`), T3);
                const settled = topic => page.waitForFunction(topic => (document.querySelector('#pi-bot-header .pi-bot-who-topic')?.textContent || '') === topic
                    && document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected', topic);
                await settled('✈️ 日本旅行');
                await page.evaluate(() => window.PiWorkspaceRoute.navigate('bot', { profileId: '11111111-1111-4111-8111-111111111111', windowId: '22222222-2222-4222-8222-222222222222' }));
                await settled('');
                await card.waitFor();
                windows = windows.map(item => item.id === T3 ? { ...item, archivedAt: '2026-10-26T08:00:00Z' } : item);
                await card.locator('.pi-bot-topic-open').click();
                await card.locator('.pi-bot-topic-receipt-state').filter({ hasText: '已归档' }).waitFor();
                assert.ok((await hash()).includes(`windowId=${MAIN}`));
                // A stale owner: the chat changes while the topic is being checked; nothing navigates.
                windows = windows.map(item => item.id === T3 ? { ...item, archivedAt: null } : item);
                let release;
                gate = new Promise(resolve => { release = resolve; });
                await card.locator('.pi-bot-topic-open').click();
                await page.evaluate(id => window.PiWorkspaceRoute.navigate('bot', { profileId: '11111111-1111-4111-8111-111111111111', windowId: id }), T2);
                await page.waitForFunction(id => document.querySelector('.pi-bot-window[aria-current="page"]')?.dataset.windowId === id, T2);
                release();
                await page.waitForTimeout(500);
                assert.ok((await hash()).includes(`windowId=${T2}`), 'a late answer for an old chat does not navigate');

                // 7. The Bot asks before opening a topic: kind "topic", title and focus as sent.
                await page.evaluate(() => window.PiWorkspaceRoute.navigate('bot', { profileId: '11111111-1111-4111-8111-111111111111', windowId: '22222222-2222-4222-8222-222222222222' }));
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected' && document.querySelector('.pi-bot-topic-receipt'));
                world.socket.send(JSON.stringify({ type: 'extension_ui_request', id: 'topic-ask', method: 'confirm', title: APPROVAL,
                    message: `topic #${'9'.repeat(16)}\n\n🎹 学钢琴\n每周练三次`, timeout: 1800000 }));
                const approval = page.locator('.pi-bot-approval:not([hidden])');
                await approval.waitFor();
                assert.equal(await approval.locator('header strong').textContent(), '小狸 想开一个新话题');
                assert.equal(await approval.locator('.pi-bot-approval-detail').textContent(), '🎹 学钢琴\n每周练三次');
                assert.equal(await approval.locator('.pi-bot-approval-keep').count(), 0, 'opening a topic is never remembered');
                await shot('bot-topic-approval');
                await approval.locator('.pi-bot-approval-allow').click();
                assert.deepEqual(world.responses.at(-1), { type: 'extension_ui_response', id: 'topic-ask', confirmed: true });
                world.socket.send(JSON.stringify({ type: 'gateway_ui_resolved', id: 'topic-ask' }));
                await page.waitForFunction(() => document.querySelector('.pi-bot-approval').hidden);

                // 8. Theme, motion and width checks for the pane and the receipt.
                const facts = await layout(page);
                assert.equal(facts.overflow, false, `no horizontal overflow at ${width}`);
                const cardBox = await card.boundingBox();
                assert.ok(cardBox.x >= 0 && cardBox.x + cardBox.width <= width + 1, 'the receipt fits the chat column');
                if (width === 393) {
                    await page.emulateMedia({ reducedMotion: 'reduce' });
                    await page.locator('html').evaluate(node => { node.dataset.theme = 'dark'; });
                    await openPane();
                    assert.equal(await page.locator('.pi-bot-topic-badge.is-busy .pi-bot-status-dot').evaluate(node => getComputedStyle(node).animationName), 'none');
                    await shot('bot-topics-dark-reduced');
                }
                assert.deepEqual(errors, []);
                console.log(JSON.stringify({ width, status: 'passed', requests: bodies.length }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
