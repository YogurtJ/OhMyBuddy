// Bot topics (public/pi-bot-topics.js with the session pane in pi-bot.js): create with just a
// title, focus and optional emoji/group metadata, a topic
// limit refusal and a windows-revision conflict that keep the draft, multi-line text saved as one
// line, multi-line topic instructions (grow then scroll, byte limit, lines kept), edit only what
// changed (with refusals in plain words), archive refused while busy and then
// archived, restore from the archived list, the open-items index reread on events (a reply
// settling, the phone drawer opening) and never polled, the topic approval card, the receipt
// card's explicit "Open topic" (also safe for a stale owner), and a chat archived or a Bot moved to
// the trash on another device ending the reconnect with a notice instead of retrying forever.
// Synthetic backend (pi-bot-fixture.js); desktop, phone and narrow phone; dark and reduced motion.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, MAIN, BOT2, MAIN2, APPROVAL, say, serve, botRecord, windowRecord, botPage, newWorld, layout, bottomBar, settledShot } = require('./pi-bot-fixture.js');

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
            let windowsRevision = REV('a'), creates = 0, archives = 0, edits = 0, gate = null, t1Busy = false, trashed = false;
            const second = botRecord({ id: BOT2, name: '阿豆', avatar: { kind: 'emoji', value: '🐼' }, windows: [windowRecord(MAIN2)] });
            const receipt = { v: 1, action: 'created', profileId: BOT,
                window: windowRecord(T3, { kind: 'topic', title: '日本旅行', emoji: '✈️', focus: '十二月去大阪' }) };
            const mainHistory = [say('user', '帮我开个话题聊旅行', '2026-10-26T06:00:00Z'),
                { role: 'toolResult', toolCallId: 'topic-call-1', toolName: 'bot_topic_propose', content: [{ type: 'text', text: '{}' }], isError: false,
                    details: { pivaneBotTopic: receipt }, timestamp: Date.parse('2026-10-26T06:00:05Z') },
                say('assistant', '好，开好了“日本旅行”，想聊的时候点开它就行。', '2026-10-26T06:00:09Z')];
            const world = newWorld({
                bots: () => trashed ? [second] : [botRecord({ windows, windowsRevision })],
                messages: sessionId => sessionId === windowRecord(MAIN).sessionId ? mainHistory : []
            });
            const bodies = [];
            const api = async ({ pathname, method, body }) => {
                if (pathname === `/api/pi/bots/${BOT}/topics/open-items`) return { json: { v: 1, omittedTopics: 0, topics: [
                    t1Busy ? { windowId: T1, title: '英语考试', state: 'busy', items: [] }
                        : { windowId: T1, title: '英语考试', state: 'ready', items: [{ title: '周五交作文', kind: 'commitment' }], omitted: 1 },
                    { windowId: T3, title: '日本旅行', state: 'busy', items: [] }] } };
                if (pathname === '/api/pi/bots' && method === 'GET' && gate) { const wait = gate; gate = null; await wait; return undefined; }
                if (pathname === `/api/pi/bots/${BOT}/windows` && method === 'POST') {
                    bodies.push(['POST', body]);
                    // The topic limit, then another device changing the windows first (a plain conflict).
                    const attempt = creates++;
                    if (attempt === 0) return { status: 409, json: { error: 'Topic limit reached (including archived topics)', code: 'BOT_TOPIC_LIMIT' } };
                    if (attempt === 1) { windowsRevision = REV('b'); return { status: 409, json: { error: 'Windows changed' } }; }
                    assert.equal(body.expectedRevision, windowsRevision);
                    // As the server: a topic created without an emoji has none.
                    const window = windowRecord(T3, { kind: 'topic', title: body.title || '新话题', emoji: body.emoji ?? '', focus: body.focus ?? '' });
                    windows = [...windows, window]; windowsRevision = REV('c');
                    return { json: { ok: true, window, windowsRevision } };
                }
                const patch = new RegExp(`^/api/pi/bots/${BOT}/windows/([^/]+)$`).exec(pathname);
                if (patch && method === 'PATCH') {
                    bodies.push(['PATCH', patch[1], body]);
                    if (body.archived === undefined) {
                        // An edit: another device renames the topic first, then a validation refusal.
                        const attempt = edits++;
                        if (attempt === 0) {
                            windows = windows.map(item => item.id === patch[1] ? { ...item, title: '英语考试（12月）' } : item); windowsRevision = REV('d');
                            return { status: 409, json: { error: 'Bot windows changed; reload before saving' } };
                        }
                        if (attempt === 1) return { status: 400, json: { error: 'Invalid topic focus (maximum 500 characters)' } };
                    }
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
            const indexReads = () => world.requests.filter(request => request.pathname === `/api/pi/bots/${BOT}/topics/open-items`).length;
            const sessionReads = id => world.requests.filter(request => request.pathname === `/api/pi/bots/${BOT}/windows/${id}/session`).length;
            // One reply of the open chat: working, then settled.
            const turn = async () => {
                world.socket.send(JSON.stringify({ type: 'agent_start' }));
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'working');
                world.socket.send(JSON.stringify({ type: 'agent_end', messages: [] }));
                world.socket.send(JSON.stringify({ type: 'agent_settled' }));
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected');
            };
            const connected = topic => page.waitForFunction(topic => (document.querySelector('#pi-bot-header .pi-bot-who-topic')?.textContent || '') === topic
                && document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected', topic);
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

                // 1b. The index follows events: a reply of the open chat settling rereads it (throttled), and on
                // phones so does opening the drawer. Nothing polls it in between.
                t1Busy = true;
                await turn();
                await t1.locator('.pi-bot-topic-badge.is-busy').waitFor({ timeout: 9000 });
                t1Busy = false;
                if (phone) {
                    await page.locator('#pi-session-pane .pi-bot-window[aria-current="page"]').click();
                    await page.waitForFunction(() => !document.getElementById('pi-session-pane').classList.contains('open'));
                    await openPane();
                } else await turn();
                await page.waitForFunction(() => document.querySelector('.pi-bot-topic-badge:not(.is-busy)')?.textContent.trim() === '2', null, { timeout: 9000 });
                const reads = indexReads();
                await page.waitForTimeout(6500);
                assert.equal(indexReads(), reads, 'no polling without an event');

                // 2. Create: clicking "+ 新话题" opens a fresh topic chat immediately without a modal,
                // handles a topic limit refusal with a toast, retries once after a windowsRevision conflict,
                // and focuses the composer ready for the user's first question.
                const sheet = page.locator('.pi-bot-topic-sheet[open]');
                await page.locator('.pi-bot-topic-add').click();
                assert.equal(await sheet.count(), 0, 'no modal blocks starting a new topic');
                await page.locator('.pi-toast').filter({ hasText: '话题已经到上限了' }).waitFor();
                await openPane();
                await page.locator('.pi-bot-topic-add').click();
                await page.waitForFunction(id => decodeURIComponent(location.hash).includes(`windowId=${id}`), T3);
                assert.equal(await page.locator('#pi-session-pane.open').count(), 0, 'the phone drawer closes when opening the new topic');
                assert.deepEqual(bodies.slice(0, 3).map(([, body]) => body), [
                    { expectedRevision: REV('a'), title: '新话题', groupId: null },
                    { expectedRevision: REV('a'), title: '新话题', groupId: null },
                    { expectedRevision: REV('b'), title: '新话题', groupId: null }]);
                await page.locator('.pi-bot-empty h2').filter({ hasText: '新话题' }).waitFor();
                assert.match(await page.locator('.pi-bot-empty p').textContent(), /想聊什么都可以直接说/);
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-who-topic')?.textContent === '新话题');
                assert.equal(await page.evaluate(() => document.activeElement?.id), 'pi-input', 'composer is focused immediately');
                assert.equal(await page.locator(`.pi-bot-window[data-window-id="${T3}"] .pi-bot-window-mark i.fa-hashtag`).count(), 1, 'the usual topic mark');
                const badge = await page.locator('#pi-bot-header .pi-bot-who').boundingBox();
                assert.ok(badge.x >= 0 && badge.x + badge.width <= width, 'the name badge with the topic fits');
                await shot('bot-topic-open');

                // 3. Edit only what changed. A line break in the focus is saved as a space; after another device
                // renamed the topic the new name is taken and the user's focus kept; a refusal is in plain words.
                await openPane();
                await t1.locator('.pi-bot-topic-edit').click();
                await sheet.waitFor();
                assert.equal(await sheet.locator('h2').textContent(), '编辑话题');
                await sheet.locator('[data-topic-field="focus"]').fill('a\nb');
                await sheet.locator('[data-topic-rules] > summary').click();
                await sheet.locator('[data-topic-field="instructions"]').fill('每次先列出单词\n再出题');
                // Closing with an unsaved edit warns once.
                await page.keyboard.press('Escape');
                await sheet.locator('.pi-bot-sheet-status').filter({ hasText: '还有修改没保存' }).waitFor();
                await sheet.locator('.pi-bot-sheet-save').click();
                await sheet.locator('.pi-bot-sheet-status[data-tone="warn"]').filter({ hasText: '别处改过' }).waitFor();
                assert.deepEqual(await sheet.locator('[data-topic-field]').evaluateAll(nodes => nodes.map(node => node.value)),
                    ['📚', '英语考试（12月）', '', 'a\nb', '每次先列出单词\n再出题'], 'the draft stays, the other device’s name is taken');
                await sheet.locator('.pi-bot-sheet-save').click();
                await sheet.locator('.pi-bot-sheet-status[data-tone="error"]').filter({ hasText: '内容没有通过检查' }).waitFor();
                assert.doesNotMatch(await sheet.locator('.pi-bot-sheet-status').textContent(), /Invalid|maximum/);
                await shot('bot-topic-edit-refused');
                await sheet.locator('.pi-bot-sheet-save').click();
                await page.locator('.pi-bot-topic-sheet').waitFor({ state: 'detached' });
                assert.deepEqual(bodies.filter(([method, , body]) => method === 'PATCH' && body.archived === undefined).map(([, id, body]) => [id, body]), [
                    [T1, { expectedRevision: REV('c'), focus: 'a b', instructions: '每次先列出单词\n再出题' }],
                    [T1, { expectedRevision: REV('d'), focus: 'a b', instructions: '每次先列出单词\n再出题' }],
                    [T1, { expectedRevision: REV('d'), focus: 'a b', instructions: '每次先列出单词\n再出题' }]],
                    'only the changed fields; the focus as one line, the instructions keep theirs');
                assert.equal(windows.find(item => item.id === T1).emoji, '📚', 'the older topic keeps its emoji');
                // A topic without an emoji is edited as a title and a focus too.
                await openPane();
                await page.locator(`.pi-bot-topic-edit[data-window-id="${T3}"]`).click();
                await sheet.waitFor();
                assert.deepEqual(await sheet.locator('[data-topic-field]').evaluateAll(nodes => nodes.map(node => node.dataset.topicField)), ['emoji', 'title', 'groupId', 'focus', 'instructions']);
                await sheet.locator('[data-topic-field="title"]').fill('日本旅行');
                await sheet.locator('[data-topic-field="focus"]').fill('十二月去大阪\n先订酒店');
                await sheet.locator('.pi-bot-sheet-save').click();
                await page.locator('.pi-bot-topic-sheet').waitFor({ state: 'detached' });
                assert.deepEqual(bodies.at(-1), ['PATCH', T3, { expectedRevision: REV('e'), title: '日本旅行', focus: '十二月去大阪 先订酒店' }]);
                await page.locator('.pi-bot-topic-sheet').waitFor({ state: 'detached' });

                // 3b. Topic instructions, under the focus: the box grows with its lines up to a bound and then scrolls
                // inside, is 16px on phones and fits the width; over the byte limit it says so and cannot be saved;
                // only the changed field is sent, with its lines; reopened, it shows what was saved.
                await openPane();
                await page.locator(`.pi-bot-topic-edit[data-window-id="${T3}"]`).click();
                await sheet.waitFor();
                const area = sheet.locator('[data-topic-field="instructions"]');
                const rules = sheet.locator('[data-topic-rules]');
                assert.equal(await rules.evaluate(node => node.open), false, 'optional instructions start folded');
                assert.equal(await rules.locator('.pi-bot-topic-rules-title > span').textContent(), '话题指令');
                await rules.locator('summary').click();
                assert.match(await rules.locator('.pi-bot-topic-rules-help').textContent(), /回答格式、资料来源/);
                assert.equal(await rules.locator('.pi-bot-topic-count').textContent(), '0/8 KB');
                const metrics = () => area.evaluate(node => {
                    const style = getComputedStyle(node), box = node.getBoundingClientRect();
                    return { height: box.height, left: box.left, right: box.right, client: node.clientHeight, scroll: node.scrollHeight,
                        max: parseFloat(style.maxHeight), font: style.fontSize, overflowY: style.overflowY };
                });
                const empty = await metrics();
                await area.fill(Array.from({ length: 6 }, (_, index) => `第 ${index + 1} 条：先给结论。`).join('\n'));
                const grown = await metrics();
                assert.ok(grown.height > empty.height + 20, `grows with its lines (${empty.height} → ${grown.height})`);
                assert.ok(grown.scroll <= grown.client + 1, 'no inner scrolling while it fits');
                await area.fill(Array.from({ length: 40 }, (_, index) => `第 ${index + 1} 条`).join('\n'));
                const full = await metrics();
                assert.ok(Math.abs(full.height - full.max) <= 1, `stops at its bound (${full.height} vs ${full.max})`);
                assert.ok(full.scroll > full.client + 20, 'then scrolls inside'); assert.equal(full.overflowY, 'auto');
                if (phone) assert.equal(full.font, '16px', 'no zoom on phones');
                assert.ok(full.left >= 0 && full.right <= width, 'the box fits the width');
                assert.equal((await layout(page)).overflow, false, `no horizontal overflow with the sheet at ${width}`);
                await shot('bot-topic-instructions');
                await area.fill('字'.repeat(2731));
                await sheet.locator('.pi-bot-sheet-status[data-tone="error"]').filter({ hasText: '话题指令太长了' }).waitFor();
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true, 'over 8192 bytes cannot be saved');
                assert.equal(await area.getAttribute('aria-invalid'), 'true');
                await area.fill('  先给结论再展开。\n\t引用资料时附上链接。\n');
                assert.equal(await sheet.locator('.pi-bot-sheet-status').textContent(), '');
                assert.equal(await area.getAttribute('aria-invalid'), 'false');
                await sheet.locator('.pi-bot-sheet-save').click();
                await page.locator('.pi-bot-topic-sheet').waitFor({ state: 'detached' });
                assert.deepEqual(bodies.at(-1), ['PATCH', T3, { expectedRevision: REV('f'), instructions: '先给结论再展开。\n\t引用资料时附上链接。' }],
                    'only the instructions, trimmed, with their lines and tab');
                await openPane();
                await page.locator(`.pi-bot-topic-edit[data-window-id="${T3}"]`).click();
                await sheet.waitFor();
                assert.equal(await area.inputValue(), '先给结论再展开。\n\t引用资料时附上链接。');
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true, 'nothing to save yet');
                await sheet.locator('.pi-bot-sheet-close').click();
                await page.locator('.pi-bot-topic-sheet').waitFor({ state: 'detached' });

                // 4. Archive: two clicks; a busy topic is refused and the sheet stays; then it is archived.
                await openPane();
                await t1.locator('.pi-bot-topic-edit').click();
                await sheet.waitFor();
                await sheet.locator('[data-topic-action="archive"]').click();
                assert.equal(await sheet.locator('[data-topic-action="archive"] span').textContent(), '再点一次确认归档');
                assert.equal(bodies.filter(([method]) => method === 'PATCH').length, 5, 'the first click only asks');
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
                await settled('日本旅行');
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
                    // The phone's bottom bar is in place after two painted frames (no passing toast over it).
                    await page.waitForFunction(() => !document.querySelector('.pi-toast'), null, { timeout: 9000 });
                    assert.deepEqual(await bottomBar(page), { bar: true, active: true, tab: 'bot' });
                    if (evidence) await settledShot(page, path.join(evidence, `bot-topics-dark-reduced-${width}.png`));
                }

                // 9. Archived on another device while this page shows the topic: the reconnect looks once, stops,
                // says so once and continues in the main chat. A Bot moved to the trash elsewhere continues with
                // another Bot. Neither retries in the background.
                if (await page.locator('#pi-session-pane.open').count()) {
                    await page.locator('#pi-session-pane .pi-bot-window[aria-current="page"]').click();
                    await page.waitForFunction(() => !document.getElementById('pi-session-pane').classList.contains('open'));
                }
                await page.evaluate(([profileId, windowId]) => window.PiWorkspaceRoute.navigate('bot', { profileId, windowId }), [BOT, T3]);
                await connected('日本旅行');
                windows = windows.map(item => item.id === T3 ? { ...item, archivedAt: '2026-10-26T09:00:00Z' } : item);
                const looked = sessionReads(T3);
                await page.waitForTimeout(300); // nothing of the opening still in flight
                world.socket.close({ code: 1012, reason: 'Session runtime changed' });
                await page.locator('.pi-toast').filter({ hasText: '这个话题已在别处归档' }).waitFor({ timeout: 9000 });
                await page.waitForFunction(id => decodeURIComponent(location.hash).includes(`windowId=${id}`), MAIN);
                await connected('');
                assert.equal(await page.locator('.pi-toast').filter({ hasText: '这个话题已在别处归档' }).count(), 1, 'said once');
                const tried = sessionReads(T3);
                assert.equal(tried - looked, 1, 'one look at the archived topic');
                await shot('bot-topic-archived-elsewhere');
                await page.waitForTimeout(4000);
                assert.equal(sessionReads(T3), tried, 'no reconnect loop for an archived topic');
                await openPane();
                assert.equal(await page.locator(`.pi-bot-topic-row [data-window-id="${T3}"]`).count(), 0, 'the pane no longer lists it as live');
                if (phone) {
                    await page.locator('#pi-session-pane .pi-bot-window[aria-current="page"]').click();
                    await page.waitForFunction(() => !document.getElementById('pi-session-pane').classList.contains('open'));
                }
                trashed = true;
                await page.waitForTimeout(300);
                world.socket.close({ code: 1012, reason: 'Session runtime changed' });
                await page.locator('.pi-toast').filter({ hasText: '找不到 小狸 了' }).waitFor({ timeout: 9000 });
                await page.waitForFunction(id => decodeURIComponent(location.hash).includes(`profileId=${id}`), BOT2);
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-who strong')?.textContent === '阿豆'
                    && document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected');
                const gone = sessionReads(MAIN);
                await page.waitForTimeout(3000);
                assert.equal(sessionReads(MAIN), gone, 'no reconnect loop for a Bot in the trash');
                assert.deepEqual(errors, []);
                console.log(JSON.stringify({ width, status: 'passed', requests: bodies.length }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
