// What each Bot is doing (public/pi-bot-home.js with pi-bot.js): rail marks for other Bots
// (waiting, chats with new replies), chat states in the list (waiting, new reply, working; none for
// the open chat), and on phones the drawer's "All Bots" row with the count of other Bots with news
// and the All Bots home: stable GET /bots order, status lines, unread counts, a topic shortcut,
// filters, search, an unknown state when /activity cannot be read, Esc back to the chat and opening
// a Bot or its topics. Synthetic backend (pi-bot-fixture.js); desktop, phone and narrow phone.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, MAIN, BOT2, MAIN2, serve, botRecord, windowRecord, botPage, newWorld, layout } = require('./pi-bot-fixture.js');

const BOT3 = '88888888-8888-4888-8888-888888888888', MAIN3 = '99999999-9999-4999-8999-999999999999';
const T1 = '55555555-5555-4555-8555-555555555555', T2 = '66666666-6666-4666-8666-666666666666', T3 = '77777777-7777-4777-8777-777777777777';
const session = id => windowRecord(id).sessionId;

(async () => {
    const { base, close } = await serve();
    const evidence = process.env.PI_BOT_EVIDENCE;
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const width of [1440, 393, 320]) {
            const phone = width <= 900;
            const bots = [
                botRecord({ windows: [windowRecord(MAIN), windowRecord(T1, { kind: 'topic', title: '功能开发', emoji: '' }), windowRecord(T2, { kind: 'topic', title: '读书笔记', emoji: '' })] }),
                botRecord({ id: BOT2, name: '阿豆', avatar: { kind: 'preset', id: 'pivane-bean' }, bot: { order: 1, job: '学习和写作' },
                    windows: [windowRecord(MAIN2), windowRecord(T3, { kind: 'topic', title: '十一出行：杭州到黄山的路线、住宿和预算安排', emoji: '' })] }),
                botRecord({ id: BOT3, name: '方方一个名字非常非常非常非常长的周末做饭和家庭采购助手', avatar: { kind: 'preset', id: 'pivane-tile' }, bot: { order: 2, job: '' },
                    windows: [windowRecord(MAIN3)] })];
            let failing = false;
            const world = newWorld({ bots: () => bots });
            const api = ({ pathname }) => {
                if (pathname !== '/api/pi/activity') return undefined;
                if (failing) return { status: 500, json: { error: 'down' } };
                return { json: { pinnedProjects: [], hiddenProjects: [], runtimes: [
                    { cwd: '/fixture/OhMyBuddyBots/bot-11111111', sessionId: session(T1), phase: 'waiting', busy: true },
                    { cwd: '/fixture/OhMyBuddyBots/bot-33333333', sessionId: session(T3), phase: 'tool', busy: true },
                    { cwd: '/fixture/OhMyBuddyBots/bot-88888888', sessionId: session(MAIN3), phase: 'waiting', busy: true },
                    { cwd: '/fixture/OhMyBuddyBots/bot-11111111', sessionId: session(MAIN), phase: 'idle', busy: false }],
                    replyNotices: [{ cwd: '/fixture/OhMyBuddyBots/bot-33333333', sessionId: session(MAIN2), completionId: 'c1' },
                        { cwd: '/fixture/OhMyBuddyBots/bot-11111111', sessionId: session(T2), completionId: 'c2' }] } };
            };
            const { context, page, errors } = await botPage(browser, base, world, { width, api, reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
            const shot = async name => { if (evidence) { await page.waitForTimeout(200); await page.screenshot({ path: path.join(evidence, `${name}-${width}.png`) }); } };
            const hash = () => page.evaluate(() => decodeURIComponent(location.hash));
            try {
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected');
                // The rail marks follow the first activity read.
                await page.locator(`.pi-bot-rail-item[data-bot-id="${BOT2}"] .pi-bot-rail-unread`).waitFor({ state: 'attached' });

                // 1. Rail: other Bots carry a waiting mark or their count of chats with new replies; the open Bot none.
                assert.equal(await page.locator(`.pi-bot-rail-item[data-bot-id="${BOT2}"] .pi-bot-rail-unread`).textContent(), '1');
                assert.equal(await page.locator(`.pi-bot-rail-item[data-bot-id="${BOT2}"]`).getAttribute('aria-label'), '阿豆，1 个聊天有新回复');
                assert.equal(await page.locator(`.pi-bot-rail-item[data-bot-id="${BOT3}"] .pi-bot-rail-waiting`).count(), 1);
                assert.equal(await page.locator(`.pi-bot-rail-item[data-bot-id="${BOT}"] :is(.pi-bot-rail-waiting, .pi-bot-rail-unread)`).count(), 0);

                // 2. The chat list: a waiting topic says so, a topic with a reply not yet seen has a dot; the open chat none.
                const t1 = page.locator(`.pi-bot-window[data-window-id="${T1}"]`), t2 = page.locator(`.pi-bot-window[data-window-id="${T2}"]`);
                assert.equal(await t1.getAttribute('data-state'), 'waiting');
                assert.equal((await t1.locator('.pi-bot-window-state').textContent()).trim(), '等你确认');
                assert.equal(await t2.getAttribute('data-state'), 'new');
                assert.equal(await t2.locator('.pi-bot-sr').textContent(), '新回复');
                assert.equal(await page.locator(`.pi-bot-window[data-window-id="${MAIN}"]`).getAttribute('data-state'), null);
                const requests = world.requests.length;
                await page.waitForTimeout(3500);
                assert.ok(world.requests.slice(requests).every(request => request.pathname === '/api/pi/activity' || request.pathname.endsWith('/tasks') || !request.pathname.startsWith('/api/pi/bots')),
                    'polling activity rereads no Bot data');

                if (!phone) {
                    assert.equal(await page.locator('.pi-bot-all').isVisible(), false, 'wide screens show every Bot in the rail');
                    assert.equal(await page.locator('.pi-bot-home').isVisible(), false);
                    assert.equal((await layout(page)).overflow, false);
                    await shot('bot-home-rail');
                    assert.deepEqual(errors, []);
                    continue;
                }

                // 3. Phone drawer: "All Bots" with the number of other Bots with news.
                await page.locator('#pi-bot-header .pi-bot-menu').click();
                await page.locator('#pi-session-pane.open').waitFor();
                const all = page.locator('.pi-bot-all');
                assert.equal(await all.isVisible(), true);
                assert.equal((await all.locator('.pi-bot-all-news').textContent()).trim(), '另有 2 个有动静');
                assert.ok((await all.boundingBox()).height >= 44);
                await shot('bot-home-drawer');

                // 4. The home: GET /bots order, status lines, unread count, the topic shortcut, focus on the Bot just left.
                await all.click();
                const home = page.locator('.pi-bot-home');
                await home.waitFor();
                await page.waitForFunction(() => !document.getElementById('pi-session-pane').classList.contains('open'));
                assert.equal(await page.evaluate(() => document.activeElement?.closest('.pi-bot-home-row')?.dataset.botId), BOT);
                const rows = home.locator('.pi-bot-home-row');
                assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => node.dataset.botId)), [BOT, BOT2, BOT3]);
                const row = id => home.locator(`.pi-bot-home-row[data-bot-id="${id}"]`);
                assert.equal((await row(BOT).locator('.pi-bot-home-state').textContent()).trim(), '等你确认 · 话题“功能开发”');
                assert.equal(await row(BOT).locator('.pi-bot-home-unread').textContent(), '1');
                assert.equal((await row(BOT2).locator('.pi-bot-home-state').textContent()).trim(), '正在忙 · 话题“十一出行：杭州到黄山的路线、住宿和预算安排”');
                assert.equal(await row(BOT2).locator('.pi-bot-home-unread').textContent(), '1');
                assert.equal(await row(BOT2).locator('.pi-bot-home-topic').getAttribute('data-window-id'), T3);
                assert.equal(await row(BOT2).locator('.pi-bot-home-topic-state > span').count(), 0, 'the state line already names this topic');
                assert.equal((await row(BOT3).locator('.pi-bot-home-state').textContent()).trim(), '等你确认 · 主聊天');
                assert.equal(await row(BOT3).locator('.pi-bot-home-topic').count(), 0);
                assert.equal((await row(BOT3).locator('.pi-bot-home-all').textContent()).trim(), '话题 0');
                const name = await row(BOT3).locator('.pi-bot-home-name').evaluate(node => ({ clipped: node.scrollWidth > node.clientWidth, style: getComputedStyle(node).textOverflow }));
                assert.deepEqual(name, { clipped: true, style: 'ellipsis' });
                const facts = await page.evaluate(() => {
                    const home = document.querySelector('.pi-bot-home');
                    const small = [...home.querySelectorAll('button, input')].filter(node => node.offsetParent && node.getBoundingClientRect().height < 44)
                        .map(node => node.className);
                    const wide = [...home.querySelectorAll('*')].filter(node => node.getBoundingClientRect().right > innerWidth + 0.5).map(node => node.className);
                    return { small, wide, input: getComputedStyle(home.querySelector('#pi-bot-home-query')).fontSize, scroll: home.scrollWidth <= home.clientWidth,
                        statics: home.querySelectorAll('[data-avatar-live="true"]').length };
                });
                assert.deepEqual(facts, { small: [], wide: [], input: '16px', scroll: true, statics: 0 });
                assert.equal((await layout(page)).overflow, false);
                await shot('bot-home');

                // 5. Filters and search keep the order; an empty result offers to clear.
                await home.locator('[data-filter="waiting"]').click();
                assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => node.dataset.botId)), [BOT, BOT3]);
                await home.locator('[data-filter="unread"]').click();
                assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => node.dataset.botId)), [BOT, BOT2]);
                await home.locator('[data-filter="all"]').click();
                await home.locator('#pi-bot-home-query').fill('黄山');
                assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => node.dataset.botId)), [BOT2]);
                await home.locator('#pi-bot-home-query').fill('没有这个');
                await home.locator('.pi-bot-home-calm').waitFor();
                await home.locator('[data-home-action="clear"]').click();
                assert.equal(await rows.count(), 3);
                // A poll while typing keeps the caret in the search box.
                await home.locator('#pi-bot-home-query').fill('阿');
                failing = true;
                await page.waitForFunction(() => document.querySelector('.pi-bot-home-state.is-unknown'), null, { timeout: 9000 });
                assert.equal(await page.evaluate(() => document.activeElement?.id), 'pi-bot-home-query');
                assert.equal((await row(BOT2).locator('.pi-bot-home-state').textContent()).trim(), '暂时看不到它在做什么');
                assert.equal(await row(BOT2).locator('.pi-bot-home-unread').count(), 0, 'unknown is not shown as news either');
                failing = false;
                await page.waitForFunction(() => !document.querySelector('.pi-bot-home-state.is-unknown'), null, { timeout: 9000 });
                await home.locator('#pi-bot-home-query').fill('');

                // 6. Esc returns to the chat with focus on the menu; the route never changed.
                const before = await hash();
                await page.keyboard.press('Escape');
                await home.waitFor({ state: 'hidden' });
                assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('pi-bot-menu')), true);
                assert.equal(await hash(), before);

                // 7. Opening a Bot from the home, and another Bot's topics from its row.
                await page.locator('#pi-bot-header .pi-bot-menu').click();
                await page.locator('.pi-bot-all').click();
                await home.waitFor();
                await row(BOT2).locator('.pi-bot-home-open').click();
                await home.waitFor({ state: 'hidden' });
                await page.waitForFunction(id => decodeURIComponent(location.hash).includes(`profileId=${id}`), BOT2);
                await page.waitForFunction(() => document.querySelector('#pi-bot-header strong')?.textContent === '阿豆');
                await page.locator('#pi-bot-header .pi-bot-menu').click();
                await page.locator('.pi-bot-all').click();
                await home.waitFor();
                await row(BOT).locator('.pi-bot-home-all').click();
                await page.waitForFunction(id => decodeURIComponent(location.hash).includes(`profileId=${id}`), BOT);
                await page.locator('#pi-session-pane.open').waitFor();
                assert.equal(await page.locator('.pi-bot-side-copy strong').textContent(), '小狸');
                assert.equal(await page.locator(`.pi-bot-window[data-window-id="${T1}"]`).getAttribute('data-state'), 'waiting');
                assert.deepEqual(errors, []);
            } finally { await context.close(); }
        }
        console.log('pi-bot-home: rail marks, chat states, phone All Bots home: ok');
    } finally {
        await browser?.close();
        await close();
    }
})().catch(error => { console.error(error); process.exit(1); });
