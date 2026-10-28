// "微信" in Bot settings (M4-4, public/pi-bot-settings.js): the WeChat chats connected to this Bot,
// connecting an allowed WeChat user (with a confirmation when that chat talks to someone else now)
// and disconnecting. Actions apply at once and are not settings edits. Synthetic backend
// (pi-bot-fixture.js); desktop, phone and narrow phone.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, serve, botRecord, botPage, newWorld, layout, settingsPage } = require('./pi-bot-fixture.js');

const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', OTHER_MAIN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', MAIN = '11111111-1111-4111-8111-111111111111';

(async () => {
    const { base, close } = await serve();
    const evidence = process.env.PI_BOT_EVIDENCE;
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const width of [1440, 393, 320]) {
            const phone = width < 900;
            let revision = 'c1', allowedUsers = ['wx-owner', 'wx-friend'];
            let bindings = [{ id: 'b-friend', accountId: 'acct', peerId: 'wx-friend', cwd: '/w', sessionId: 'other-main', name: '阿木', replyMode: 'all',
                bot: { profileId: OTHER, windowId: OTHER_MAIN, main: true }, bots: [OTHER] }];
            const actions = [];
            const channels = () => ({ revision, error: null, busy: false, component: { installed: true },
                accounts: [{ id: 'acct', userId: 'wx-owner', enabled: true, allowedUsers, connection: 'connected' }],
                bindings, peers: [], jobs: [], login: null, capabilities: {} });
            const world = newWorld({ bots: () => [botRecord()] });
            const api = async ({ pathname, method, body }) => {
                if (pathname === `/api/pi/bots/${BOT}/settings`) return { json: { revision: 's1', bot: { id: BOT, name: '小狸', avatar: { kind: 'preset', id: 'pivane-bean' }, soul: '',
                    bot: botRecord().bot }, models: { defaults: null, models: [] } } };
                if (pathname === `/api/pi/bots/${BOT}/follow-ups`) return { json: { items: [] } };
                if (pathname === '/api/pi/channels' && method === 'GET') return { json: channels() };
                if (pathname === '/api/pi/channels/weixin/actions' && method === 'POST') {
                    actions.push(body);
                    assert.equal(body.expectedRevision, revision); assert.equal(body.confirmed, true);
                    if (body.action === 'bind') {
                        const previous = bindings.find(b => b.peerId === body.peerId);
                        bindings = bindings.filter(b => b.peerId !== body.peerId);
                        bindings.push({ id: `b-${body.peerId}`, accountId: 'acct', peerId: body.peerId, cwd: '/w', sessionId: 'main', name: '小狸', replyMode: 'all',
                            bot: { profileId: BOT, windowId: MAIN, main: true }, bots: [...new Set([...(previous?.bots || []), BOT])] });
                    } else if (body.action === 'unbind-bot') {
                        bindings = bindings.flatMap(b => b.peerId !== body.peerId ? [b] : b.bots.length > 1 ? [{ ...b, bots: b.bots.filter(id => id !== body.botProfileId) }] : []);
                    }
                    revision = `${revision}+`;
                    return { json: channels() };
                }
                return undefined;
            };
            const { context, page, errors } = await botPage(browser, base, world, { width, api });
            const shot = async label => { if (evidence) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(evidence, `${label}-${width}.png`) }); } };
            const openSettings = async () => {
                if (phone) { await page.locator('#pi-bot-header .pi-bot-menu').click(); await page.locator('#pi-session-pane.open .pi-bot-settings').waitFor(); }
                await page.locator('.pi-bot-settings').click();
                const sheet = page.locator('.pi-bot-sheet[open]');
                await settingsPage(sheet, 'wechat');
                return sheet;
            };
            try {
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected');
                const sheet = await openSettings();
                const box = sheet.locator('.pi-bot-sheet-wechat');
                await box.waitFor(); await box.scrollIntoViewIfNeeded();

                // 1. Not connected yet: both allowed users can be connected.
                assert.match(await box.innerText(), /还没有连接微信。连上后/);
                assert.deepEqual(await box.locator('[data-wechat-pick] option').allTextContents(), ['wx-owner', 'wx-friend']);
                if (phone) {
                    for (const control of await box.locator('select, .pi-bot-chip').all()) assert.ok((await control.boundingBox()).height >= 44, 'touch-sized controls');
                    assert.equal(await box.locator('select').evaluate(node => getComputedStyle(node).fontSize), '16px', 'no zoom on focus');
                }
                const sheetBox = await sheet.boundingBox();
                for (const control of await box.locator('select, button').all()) {
                    const b = await control.boundingBox();
                    assert.ok(b.x >= sheetBox.x - 1 && b.x + b.width <= sheetBox.x + sheetBox.width + 1, 'controls fit the sheet');
                }
                await shot('bot-wechat-empty');

                // 2. A free chat connects at once, without a question.
                await box.locator('[data-wechat-connect]').click();
                await page.locator('.pi-toast').filter({ hasText: '已连接微信' }).waitFor();
                assert.deepEqual(actions.map(a => [a.action, a.peerId, a.botProfileId]), [['bind', 'wx-owner', BOT]]);
                assert.match(await box.locator('[data-wechat-chat="acct/wx-owner"]').innerText(), /正在和 小狸 聊/);
                assert.deepEqual(await box.locator('[data-wechat-pick] option').allTextContents(), ['wx-friend']);
                assert.equal(await box.locator('.pi-bot-sheet-instant').innerText(), '立即生效');
                assert.equal(await sheet.locator('.pi-bot-sheet-nav [data-nav="wechat"] .pi-bot-sheet-nav-sub').textContent(), '已连接 1 个聊天');

                // 3. A chat talking to another Bot asks first; that Bot stays connected.
                await box.locator('[data-wechat-connect]').click();
                const confirm = page.locator('.pi-profile-confirm[open]');
                await confirm.waitFor();
                assert.match(await confirm.innerText(), /阿木/); assert.match(await confirm.innerText(), /\/切换/);
                await confirm.locator('.settings-primary-button').click();
                await page.locator('.pi-toast').filter({ hasText: '已连接微信' }).nth(0).waitFor();
                await box.locator('[data-wechat-chat="acct/wx-friend"]').waitFor();
                assert.deepEqual(actions.at(-1), { action: 'bind', accountId: 'acct', peerId: 'wx-friend', botProfileId: BOT, confirmed: true, expectedRevision: 'c1+' });
                assert.equal(await box.locator('[data-wechat-pick]').count(), 0, 'every allowed user is connected');
                await shot('bot-wechat-connected');

                // 4. Disconnecting asks, then applies at once; it is not a settings edit.
                await box.locator('[data-wechat-chat="acct/wx-owner"] [data-wechat-disconnect]').click();
                await confirm.waitFor();
                await confirm.locator('.settings-primary-button').click();
                await page.locator('.pi-toast').filter({ hasText: '已断开' }).waitFor();
                assert.deepEqual(actions.at(-1), { action: 'unbind-bot', accountId: 'acct', peerId: 'wx-owner', botProfileId: BOT, confirmed: true, expectedRevision: 'c1++' });
                assert.equal(await box.locator('[data-wechat-chat="acct/wx-owner"]').count(), 0);
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true);
                assert.equal(await sheet.locator('.pi-bot-sheet-nav .is-dirty').count(), 0);
                assert.equal(await sheet.locator('.pi-bot-sheet-dirty').textContent(), '');

                // 5. With no allowed users or connected chats, the empty state points to channel settings.
                await sheet.locator('.pi-bot-sheet-close').click();
                await sheet.waitFor({ state: 'detached' });
                allowedUsers = []; bindings = [];
                const emptySheet = await openSettings();
                const empty = emptySheet.locator('.pi-bot-sheet-wechat .pi-bot-sheet-empty');
                assert.equal(await empty.locator('h4').textContent(), '还没有连接微信');
                assert.equal(await empty.getByRole('button', { name: '打开消息渠道设置', exact: true }).isVisible(), true);
                assert.equal(await emptySheet.locator('[data-wechat-pick], [data-wechat-connect], [data-wechat-chat]').count(), 0);
                assert.equal(await emptySheet.locator('.pi-bot-sheet-save').isDisabled(), true);

                assert.equal((await layout(page)).overflow, false, `no horizontal overflow at ${width}`);
                assert.deepEqual(errors, []);
                console.log(JSON.stringify({ width, status: 'passed' }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
