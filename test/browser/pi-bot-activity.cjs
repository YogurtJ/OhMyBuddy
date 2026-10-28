// Bounded Bot activity, honest usage/data scope and independent model/thinking settings.
// Full-page synthetic backend only; no providers, identities or live instance traffic.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, BOT2, MAIN, MAIN2, serve, botRecord, windowRecord, botPage, newWorld, layout, settingsPage } = require('./pi-bot-fixture');
const TOPIC = '55555555-5555-4555-8555-555555555555', ARCHIVED = '66666666-6666-4666-8666-666666666666', STALE = '77777777-7777-4777-8777-777777777777', UNKNOWN = '99999999-9999-4999-8999-999999999999';
const MODELS = { defaults: { provider: 'fixture', modelId: 'reasoner', thinkingLevel: 'high' }, models: [
    { provider: 'fixture', id: 'reasoner', name: 'Reasoner', thinkingLevels: ['low', 'high'] },
    { provider: 'fixture', id: 'plain', name: 'Plain', thinkingLevels: [] }
] };
const activity = (profileId, windowId) => ({ version: 1, profileId, generatedAt: Date.now(),
    sources: { proactive: 'available', scheduler: 'available', channels: 'available' },
    limits: { items: 30, schedulerRuns: 100, channelJobs: 60, jobs: 100, generationsPerWindow: 100 }, truncated: false,
    items: [
        { id: 'running', kind: 'scheduled', windowId, at: Date.now(), execution: 'running', delivery: 'unknown', reason: null },
        { id: 'done', kind: 'scheduled', windowId, at: Date.now(), execution: 'completed', delivery: 'uncertain', reason: 'delivery-unconfirmed' },
        { id: 'silent', kind: 'follow-up', windowId, at: Date.now(), execution: 'silent', delivery: 'none', reason: null },
        { id: 'skipped', kind: 'follow-up', windowId, at: Date.now(), execution: 'skipped', delivery: 'none', reason: 'off' },
        { id: 'failed', kind: 'channel', windowId, at: Date.now(), execution: 'unknown', delivery: 'failed', reason: 'wechat-login-expired' }
    ], quota: { proactivePushes: { used: 2, limit: 20, held: 1, day: '2026-10-28', timeZone: 'Asia/Shanghai' },
        scheduledTasks: { day: '2026-10-28', timeZone: 'UTC', scope: 'all-user-scheduled-tasks', runs: 3, maxRuns: 40, tokens: 6000, maxTokens: 400000, estimatedCost: null, maxCost: null } } });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5e8AAAAASUVORK5CYII=', 'base64');

(async () => {
    const { base, close } = await serve();
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const width of [1440, 393, 320]) {
            let revision = 's1', model = null, thinking = 'high', legacy = false, pending = true, failActivity = false, gate = null, firstTask = false, taskGate = null, deleted = false;
            const patches = [], deletes = [];
            const first = () => {
                const record = botRecord({ bot: { model, thinking }, windows: [windowRecord(MAIN), windowRecord(TOPIC, { kind: 'topic', title: '另一个话题' }), windowRecord(ARCHIVED, { kind: 'topic', title: '已归档话题', archivedAt: '2026-10-28T00:00:00Z' }), ...(deleted ? [] : [windowRecord(STALE, { kind: 'topic', title: '稍后删除的话题' })])] });
                if (firstTask) record.bot.onboarding = { ...record.bot.onboarding, flowVersion: 2, steps: { model: 'done' } };
                if (legacy) delete record.bot.thinking;
                return record;
            };
            const second = botRecord({ id: BOT2, name: '阿豆', windows: [windowRecord(MAIN2)] });
            const world = newWorld({ bots: () => [first(), second] });
            const api = async ({ pathname, method, body }) => {
                const settings = /^\/api\/pi\/bots\/([^/]+)\/settings$/.exec(pathname);
                if (settings) return { json: { revision, bot: settings[1] === BOT ? { ...first(), soul: '原来的性格' } : { ...second, soul: '' }, models: MODELS } };
                if (pathname.endsWith('/activity')) {
                    if (gate) { const wait = gate; gate = null; await wait; }
                    if (failActivity) return { status: 503, json: { error: 'Unavailable' } };
                    const profileId = pathname.split('/')[4];
                    const snap = activity(profileId, profileId === BOT ? MAIN : MAIN2);
                    if (profileId === BOT) for (const [id, windowId] of [['archived', ARCHIVED], ['stale', STALE], ['unknown', UNKNOWN]]) snap.items.push({ ...snap.items[1], id, windowId });
                    return { json: snap };
                }
                if (pathname === `/api/pi/bots/${BOT}/follow-ups`) return { json: { items: pending ? [{ id: 'a'.repeat(24), kind: 'due', windowId: MAIN, at: Date.now(), title: '待办提醒', state: 'pending' }] : [] } };
                if (pathname.includes('/follow-ups/') && method === 'DELETE') {
                    deletes.push(body); pending = false;
                    return { status: 409, json: { error: 'Already sending' } };
                }
                if (pathname === `/api/pi/profiles/${BOT}/learning`) return { json: { version: 1, revision: 1, status: 'ready',
                    settings: { enabled: true, maxRunsPerDay: 20 }, capabilities: { installed: true, settingsWrite: true },
                    health: { state: 'ok', today: { runs: 4, maxRuns: 20, reservedTokens: 24000, maxTokens: 120000, usedTokens: null } } } };
                if (pathname === `/api/pi/bots/${BOT}/onboarding` && method === 'POST') {
                    if (taskGate) await taskGate;
                    firstTask = false; revision += '+'; return { json: { revision } };
                }
                if (pathname === `/api/pi/bots/${BOT}` && method === 'PATCH') {
                    patches.push(body);
                    assert.equal(body.expectedRevision, revision);
                    if (Object.hasOwn(body.changes.bot || {}, 'model')) model = body.changes.bot.model;
                    if (Object.hasOwn(body.changes.bot || {}, 'thinking')) { thinking = body.changes.bot.thinking; legacy = false; }
                    revision += '+'; return { json: { revision } };
                }
                return undefined;
            };
            const { page, context, errors } = await botPage(browser, base, world, { width, api });
            const openSettings = async () => {
                if (width <= 900 && !await page.locator('#pi-session-pane').evaluate(node => node.classList.contains('open'))) await page.locator('#pi-bot-header .pi-bot-menu').click();
                await page.locator('.pi-bot-settings').click();
                const sheet = page.locator('.pi-bot-sheet[open]'); await sheet.locator('.pi-bot-sheet-nav').waitFor(); return sheet;
            };
            try {
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected');
                await page.locator('#pi-input').fill('保留这份聊天草稿');
                await page.locator('#pi-file-input').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: PNG });
                await page.locator('.pi-attachment-chip').waitFor();
                let sheet = await openSettings();
                await settingsPage(sheet, 'notify');
                const view = sheet.locator('[data-bot-activity]');
                assert.match(await view.innerText(), /执行：已完成 · 通知\/投递：结果不确定/);
                assert.match(await view.innerText(), /已完成，静默/);
                assert.match(await view.innerText(), /主动联系已关闭/);
                assert.match(await view.innerText(), /微信登录已过期/);
                assert.match(await view.innerText(), /全局最近 100 次定时运行/);
                const costs = sheet.locator('.pi-bot-costs'); await costs.locator('summary').click();
                assert.match(await costs.innerText(), /推送条数不是费用上限/);
                assert.match(await costs.innerText(), /2 \/ 20/);
                assert.match(await costs.innerText(), /全部用户定时任务今日共用额度（UTC）/);
                assert.match(await costs.innerText(), /定时任务费用估算未知/);
                assert.match(await costs.innerText(), /空闲整理摘要/);
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true);
                if (process.env.PI_BOT_EVIDENCE) await page.screenshot({ path: path.join(process.env.PI_BOT_EVIDENCE, `bot-activity-costs-${width}.png`) });
                const bounds = await sheet.boundingBox();
                for (const control of await sheet.locator('.pi-bot-activity-actions button').all()) {
                    const box = await control.boundingBox();
                    assert.ok(box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width + 1, 'activity actions fit actual sheet width');
                    if (width < 600) assert.ok(box.height >= 44);
                }
                // Dirty settings survive refresh failures and successful activity reads.
                await settingsPage(sheet, 'profile');
                await sheet.locator('textarea').nth(1).fill('我还没有保存的性格');
                await settingsPage(sheet, 'notify');
                failActivity = true; await sheet.locator('[data-activity-refresh]').click();
                await view.getByText('暂时读不到活动，不能据此判断没有任务。').waitFor();
                failActivity = false; await sheet.locator('[data-activity-refresh]').click();
                await view.locator('[data-activity-id="running"]').waitFor();
                assert.equal(await sheet.getAttribute('data-edited'), 'true');
                await sheet.locator('[data-follow-up-cancel]').click();
                await sheet.locator('.pi-bot-sheet-status').filter({ hasText: '没有取消' }).waitFor();
                assert.equal(deletes.length, 1);
                assert.equal(await sheet.locator('[data-follow-up-cancel]').count(), 0, 'conflicting pending list is reread');
                await settingsPage(sheet, 'profile');
                assert.equal(await sheet.locator('textarea').nth(1).inputValue(), '我还没有保存的性格');
                await settingsPage(sheet, 'learning');
                assert.match(await sheet.locator('.pi-bot-sheet-page[data-page="learning"]').innerText(), /运行 4\/20，预留 tokens 24000\/120000；实际 tokens：暂无报告/);
                await settingsPage(sheet, 'more');
                await sheet.locator('.pi-bot-data-notice > summary').click();
                assert.match(await sheet.locator('.pi-bot-data-notice').innerText(), /外部模型服务/);
                assert.match(await sheet.locator('.pi-bot-data-notice').innerText(), /普通 Pi 的工具和权限/);
                assert.match(await sheet.locator('.pi-bot-data-notice').innerText(), /不是整个 Bot 的备份/);
                assert.match(await sheet.locator('.pi-bot-backup-guide').getAttribute('href'), /INSTALL_RECOVERY.md/);
                // Existing dirty-exit warning also covers activity links; no chat draft/attachment is overwritten.
                await settingsPage(sheet, 'notify');
                const openedBefore = world.opened.length, hashBefore = await page.evaluate(() => location.hash);
                await view.locator(`[data-activity-chat="${ARCHIVED}"]`).click();
                await sheet.locator('.pi-bot-sheet-status').filter({ hasText: '这个话题已归档' }).waitFor();
                assert.equal(await sheet.getAttribute('data-edited'), 'true');
                assert.equal(await view.locator('[data-activity-windows]').count(), 1);
                await view.locator('[data-activity-windows]').click();
                assert.match(await sheet.locator('.pi-bot-sheet-status').textContent(), /还有修改没保存/);
                assert.equal(await sheet.getAttribute('open'), '');
                deleted = true;
                for (const windowId of [STALE, UNKNOWN]) {
                    await view.locator(`[data-activity-chat="${windowId}"]`).click();
                    await sheet.locator('.pi-bot-sheet-status').filter({ hasText: '暂时不能确认这个聊天' }).waitFor();
                    assert.equal(await sheet.getAttribute('open'), '');
                }
                assert.equal(world.opened.length, openedBefore, 'archived, deleted and unknown links never open another session');
                assert.equal(await page.evaluate(() => location.hash), hashBefore, 'no implicit main-chat navigation');
                await settingsPage(sheet, 'profile');
                assert.equal(await sheet.locator('textarea').nth(1).inputValue(), '我还没有保存的性格');
                await settingsPage(sheet, 'notify');
                const chat = view.locator('[data-activity-chat]').first();
                await chat.click();
                await sheet.locator('.pi-bot-sheet-status').filter({ hasText: '还有修改没保存' }).waitFor();
                assert.equal(await sheet.getAttribute('open'), '');
                assert.match(await sheet.locator('.pi-bot-sheet-status').textContent(), /还有修改没保存/);
                await chat.click(); await sheet.waitFor({ state: 'detached' });
                assert.equal(await page.locator('#pi-input').inputValue(), '保留这份聊天草稿');
                assert.equal(await page.locator('.pi-attachment-chip').count(), 1);
                // Explicitly opening the existing archived-topic list leaves the current chat alone.
                sheet = await openSettings(); await settingsPage(sheet, 'notify');
                await sheet.locator(`[data-activity-chat="${ARCHIVED}"]`).click();
                await sheet.locator('.pi-bot-sheet-status').filter({ hasText: '这个话题已归档' }).waitFor();
                await sheet.locator('[data-activity-windows]').click();
                await sheet.waitFor({ state: 'detached' });
                await page.locator('.pi-bot-archived[open]').waitFor();
                assert.equal(world.opened.length, openedBefore);
                assert.equal(await page.locator('#pi-input').inputValue(), '保留这份聊天草稿');
                assert.equal(await page.locator('.pi-attachment-chip').count(), 1);
                // Thinking alone on the default model never pins that model.
                sheet = await openSettings(); await settingsPage(sheet, 'model');
                const thinkingSelect = sheet.locator('select').nth(1);
                assert.equal(await thinkingSelect.inputValue(), 'high');
                await thinkingSelect.selectOption('low');
                if (width < 600) assert.equal(await thinkingSelect.evaluate(node => getComputedStyle(node).fontSize), '16px');
                await sheet.locator('.pi-bot-sheet-save').focus(); await page.keyboard.press('Enter');
                await sheet.waitFor({ state: 'detached' });
                assert.deepEqual(patches.at(-1).changes, { bot: { thinking: 'low' } }); assert.equal(model, null);
                // A WeChat /model default state and explicit null thinking are reflected on reopen.
                model = null; thinking = null;
                sheet = await openSettings(); await settingsPage(sheet, 'model');
                assert.match(await sheet.locator('[data-sheet-model-trigger]').innerText(), /跟随默认/);
                assert.equal(await sheet.locator('select').nth(1).inputValue(), '');
                await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
                // Legacy nested thinking remains readable, and migrates only when changed.
                legacy = true; model = { provider: 'fixture', id: 'reasoner', thinking: 'high' };
                sheet = await openSettings(); await settingsPage(sheet, 'model');
                assert.equal(await sheet.locator('select').nth(1).inputValue(), 'high');
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true);
                await sheet.locator('select').nth(1).selectOption('');
                await sheet.locator('.pi-bot-sheet-save').click(); await sheet.waitFor({ state: 'detached' });
                assert.deepEqual(patches.at(-1).changes, { bot: { thinking: null } });
                // A late read from Bot A cannot render into Bot B's newly opened sheet.
                sheet = await openSettings(); await settingsPage(sheet, 'notify');
                let release; gate = new Promise(resolve => { release = resolve; });
                await sheet.locator('[data-activity-refresh]').click();
                await page.evaluate(id => window.PiWorkspaceRoute.navigate('bot', { profileId: id }), BOT2);
                await sheet.waitFor({ state: 'detached' });
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-who strong')?.textContent === '阿豆');
                sheet = await openSettings(); await settingsPage(sheet, 'notify');
                release();
                await sheet.locator(`[data-activity-chat="${MAIN2}"]`).first().waitFor();
                assert.equal(await sheet.locator(`[data-activity-chat="${MAIN}"]`).count(), 0);
                if (process.env.PI_BOT_EVIDENCE) await page.screenshot({ path: path.join(process.env.PI_BOT_EVIDENCE, `bot-activity-${width}.png`) });
                // A first-task receipt arriving after a topic switch cannot send into that topic.
                await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
                firstTask = true;
                await page.evaluate(id => window.PiWorkspaceRoute.navigate('bot', { profileId: id }), BOT);
                const closure = page.locator('.pi-bot-closure:not([hidden])'); await closure.waitFor();
                await page.locator('#pi-input').fill('');
                await page.locator('[data-remove-attachment]').click();
                let releaseTask; taskGate = new Promise(resolve => { releaseTask = resolve; });
                await closure.locator('[data-closure-task="plan"]').click();
                await page.waitForFunction(() => document.querySelector('[data-closure-task="plan"]')?.disabled === true);
                await page.evaluate(ids => window.PiWorkspaceRoute.navigate('bot', { profileId: ids[0], windowId: ids[1] }), [BOT, TOPIC]);
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-who-topic')?.textContent.includes('另一个话题'));
                releaseTask();
                await page.waitForResponse(response => response.url().endsWith('/onboarding'));
                assert.equal((await layout(page)).overflow, false);
                assert.deepEqual(errors, []);
                assert.deepEqual(world.prompts, []);
                console.log(JSON.stringify({ width, status: 'passed', patches: patches.length, pageerrors: errors.length }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
