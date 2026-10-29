// Bot settings use the real SPA router/history with synthetic REST/WS owners only.
const assert = require('node:assert/strict');
const path = require('node:path'), fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, BOT2, MAIN, MAIN2, serve, botRecord, windowRecord, botPage, newWorld, settingsPage, layout } = require('./pi-bot-fixture');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5e8AAAAASUVORK5CYII=', 'base64');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
(async () => {
    const { base, close } = await serve(); let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const width of [1440, 393]) {
            const a = botRecord(), b = botRecord({ id: BOT2, name: '阿豆', windows: [windowRecord(MAIN2)] });
            const world = newWorld({ bots: () => [a, b] });
            let readGate = null, saveGate = null, failSave = false;
            const reads = [], patches = [];
            const { page, context, errors } = await botPage(browser, base, world, { width, api: async ({ pathname, method, body }) => {
                if (pathname.endsWith('/settings')) {
                    const id = pathname.split('/')[4]; reads.push(id);
                    if (id === BOT && readGate) await readGate.promise;
                    return { json: { revision: 'r1', bot: { ...(id === BOT ? a : b), soul: id === BOT ? '原来的性格' : '阿豆的性格' },
                        models: { defaults: {}, effectiveDefault: { provider: 'fixture', modelId: 'a' }, models: [{ provider: 'fixture', id: 'a', thinkingLevels: ['off', 'high'] }] } } };
                }
                if (method === 'PATCH') {
                    patches.push({ pathname, body }); if (saveGate) await saveGate.promise;
                    return failSave ? { status: 503, json: { error: 'Synthetic save failure' } } : { json: { revision: 'r2' } };
                }
                return undefined;
            } });
            const go = (tab, profileId = BOT) => page.evaluate(({ tab, profileId }) => PiWorkspaceRoute.navigate(tab, tab === 'bot' ? { profileId } : {}), { tab, profileId });
            const connected = async id => {
                await page.waitForFunction(id => document.querySelector('#pi-bot-header .pi-bot-who strong')?.textContent === (id === 'a' ? '小狸' : '阿豆')
                    && document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected', id);
                await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            };
            const open = async () => {
                if (width <= 900 && !await page.locator('#pi-session-pane').evaluate(node => node.classList.contains('open'))) await page.locator('#pi-bot-header .pi-bot-menu').click();
                await page.locator('.pi-bot-settings').click();
                const sheet = page.locator('.pi-bot-sheet[open]'); await settingsPage(sheet, 'profile'); return sheet;
            };
            const sheet = page.locator('.pi-bot-sheet[open]');
            const soul = () => sheet.locator('textarea').nth(1);
            const warning = () => sheet.locator('.pi-bot-sheet-status').filter({ hasText: '还有修改没保存' }).waitFor();
            const unchanged = async (hash, draft) => {
                try { await page.waitForFunction(hash => location.hash === hash, hash); }
                catch (error) { const facts = await page.evaluate(() => ({ hash: location.hash, state: history.state, trace: window.routeTrace })); if (process.env.PI_BOT_EVIDENCE) fs.writeFileSync(path.join(process.env.PI_BOT_EVIDENCE, 'route-diagnostic.json'), JSON.stringify({ expectedHash: hash, ...facts }, null, 2)); console.error(JSON.stringify(facts, null, 2)); throw error; }
                assert.equal(await sheet.count(), 1); assert.equal(await soul().inputValue(), draft);
                assert.equal(await sheet.getAttribute('data-edited'), 'true');
            };
            try {
                await connected('a');
                await page.evaluate(() => { window.routeTrace = []; for (const type of ['workspace:beforetabchange', 'workspace:tabchanged', 'popstate', 'hashchange']) addEventListener(type, event => routeTrace.push({ type, hash: location.hash, state: history.state, target: event.detail?.hash })); });
                // Seed real history entries and wait through the first lazy page load.
                await go('cron'); await page.waitForFunction(() => PiFeatures.ready('cron'));
                await go('bot'); await connected('a');
                await page.locator('#pi-input').fill('保留聊天草稿');
                await page.locator('#pi-file-input').setInputFiles({ name: 'draft.png', mimeType: 'image/png', buffer: PNG });
                await page.locator('.pi-attachment-chip').waitFor(); await open();
                await soul().fill('路由离开前保留这份草稿');
                const openedBefore = world.opened.length;
                assert.match(await page.evaluate(() => PiChatNavigation.openSession({ cwd: '/fixture/other', sessionId: 'foreign' }).then(() => 'opened', error => error.message)), /导航已改变/);
                assert.equal(world.opened.length, openedBefore);
                const ownerHash = await page.evaluate(() => location.hash);
                await go('cron'); await warning(); await unchanged(ownerHash, '路由离开前保留这份草稿');
                assert.equal(patches.length, 0, 'navigation never auto-saves');
                assert.equal(await page.locator('#pi-input').inputValue(), '保留聊天草稿');
                assert.equal(await page.locator('.pi-attachment-chip').count(), 1);
                await go('cron'); await sheet.waitFor({ state: 'detached' });
                assert.match(await page.evaluate(() => location.hash), /^#\/cron$/);
                // Explicit repeat discards; the original values are still the only saved values.
                await page.evaluate(() => history.back()); await connected('a'); await open();
                assert.equal(await soul().inputValue(), '原来的性格');
                await soul().fill('直接 hash 不丢草稿');
                const hashA = await page.evaluate(() => location.hash), hashB = `#/bot?profileId=${BOT2}`;
                await page.evaluate(hash => { location.hash = hash; }, hashB); await warning(); await unchanged(hashA, '直接 hash 不丢草稿');
                await page.evaluate(hash => { location.hash = hash; }, hashB); await sheet.waitFor({ state: 'detached' }); await connected('b');
                // Back/forward rejection restores the entry, preserving the destination in history.
                await go('bot'); await connected('a'); await open(); await soul().fill('back 草稿');
                const backHash = await page.evaluate(() => location.hash);
                await page.evaluate(() => history.back()); await warning(); await unchanged(backHash, 'back 草稿');
                await page.evaluate(() => history.back()); await sheet.waitFor({ state: 'detached' }); await connected('b');
                await open(); await soul().fill('forward 草稿');
                const forwardHash = await page.evaluate(() => location.hash);
                await page.evaluate(() => history.forward()); await warning(); await unchanged(forwardHash, 'forward 草稿');
                await page.evaluate(() => history.forward()); await sheet.waitFor({ state: 'detached' }); await connected('a');
                // An unaccepted route never begins lazy loading. Accepted loading cannot close a later owner's sheet.
                await open(); await soul().fill('loading 草稿');
                const loadingHash = await page.evaluate(() => location.hash);
                let artifactRequest = false; const artifactGate = deferred();
                await page.route('**/pi-artifacts.css', async route => { artifactRequest = true; await artifactGate.promise; await route.continue(); });
                await go('artifacts'); await warning(); await unchanged(loadingHash, 'loading 草稿'); assert.equal(artifactRequest, false);
                await go('artifacts'); await sheet.waitFor({ state: 'detached' });
                await page.waitForFunction(() => document.querySelector('#workspace-feature-state')?.getAttribute('aria-busy') === 'true');
                await go('bot', BOT2); await connected('b'); await open();
                artifactGate.resolve(); await page.waitForFunction(() => PiFeatures.ready('artifacts'));
                assert.equal(await soul().inputValue(), '阿豆的性格'); assert.equal(await sheet.locator('input[type="text"]').first().inputValue(), '阿豆');
                await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
                // A settings read that finishes after switching owner cannot reopen or overwrite the new sheet.
                await go('bot'); await connected('a'); readGate = deferred();
                if (width <= 900 && !await page.locator('#pi-session-pane').evaluate(node => node.classList.contains('open'))) await page.locator('#pi-bot-header .pi-bot-menu').click();
                const priorReads = reads.length; await page.locator('.pi-bot-settings').click();
                await page.waitForFunction(() => document.querySelector('.pi-bot-sheet[open] .pi-bot-sheet-state'));
                while (reads.length === priorReads) await page.waitForTimeout(10);
                await go('bot', BOT2); await sheet.waitFor({ state: 'detached' }); await connected('b'); await open();
                readGate.resolve(); readGate = null;
                assert.equal(await soul().inputValue(), '阿豆的性格'); assert.equal(await sheet.count(), 1);
                await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
                // A submitted save owns the original sheet and cannot be bypassed by repeated route/hash/history changes.
                await go('bot'); await connected('a'); await open(); await soul().fill('保存进行中保留');
                saveGate = deferred(); failSave = true; await sheet.locator('.pi-bot-sheet-save').click();
                await page.waitForFunction(() => document.querySelector('.pi-bot-sheet-save')?.disabled === true);
                const savingHash = await page.evaluate(() => location.hash);
                await go('bot', BOT2); await go('bot', BOT2);
                await page.evaluate(() => { location.hash = '#/cron'; });
                await unchanged(savingHash, '保存进行中保留');
                await page.evaluate(() => history.back()); await unchanged(savingHash, '保存进行中保留');
                assert.equal(patches.length, 1); assert.ok(patches[0].pathname.includes(BOT));
                saveGate.resolve(); saveGate = null;
                await sheet.locator('.pi-bot-sheet-status').filter({ hasText: 'Synthetic save failure' }).waitFor();
                assert.equal(await soul().inputValue(), '保存进行中保留');
                // Decoding is also owned by this sheet; route departure cannot discard it midway.
                await page.evaluate(() => {
                    const original = PiBot.pictureData;
                    window.PiBot = { ...PiBot, pictureData: () => new Promise(resolve => { window.finishBotPicture = () => resolve('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5e8AAAAASUVORK5CYII='); }) };
                    window.restoreBotPicture = () => { window.PiBot = { ...PiBot, pictureData: original }; };
                });
                await sheet.locator('[data-sheet-picture-file]').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: PNG });
                await page.waitForFunction(() => typeof finishBotPicture === 'function');
                await go('cron'); await go('cron'); await unchanged(savingHash, '保存进行中保留');
                await page.evaluate(() => { finishBotPicture(); restoreBotPicture(); });
                await sheet.locator('.pi-bot-sheet-status').filter({ hasText: '图片会在保存时上传' }).waitFor();
                assert.equal(await sheet.locator('[data-sheet-picture="clear"]').isVisible(), true);
                assert.equal(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); dispatchEvent(event); return event.defaultPrevented; }), true);
                await page.keyboard.press('Escape'); await warning();
                if (process.env.PI_BOT_EVIDENCE) await page.screenshot({ path: path.join(process.env.PI_BOT_EVIDENCE, `dirty-route-preserved-${width}.png`) });
                await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
                assert.equal(patches.length, 1, 'no implicit retry or auto-save');
                // Successful pending saves also block departure until the original owner settles.
                await open(); await soul().fill('明确保存这份修改'); failSave = false; saveGate = deferred();
                await sheet.locator('.pi-bot-sheet-save').click();
                await page.waitForFunction(() => document.querySelector('.pi-bot-sheet-save')?.disabled === true);
                const successfulHash = await page.evaluate(() => location.hash);
                await go('cron'); await go('cron'); await unchanged(successfulHash, '明确保存这份修改');
                saveGate.resolve(); saveGate = null; await sheet.waitFor({ state: 'detached' });
                assert.equal(patches.length, 2); assert.ok(patches.every(patch => patch.pathname.includes(BOT)));
                await page.locator('#pi-input').fill('');
                if (await page.locator('[data-remove-attachment]').count()) await page.locator('[data-remove-attachment]').click();
                // Read-only English activity copy describes the actual global source windows.
                await page.evaluate(() => PiI18n.save('en')); await page.reload(); await connected('a'); await open(); await settingsPage(sheet, 'notify');
                const activity = await sheet.locator('[data-bot-activity]').innerText();
                assert.match(activity, /globally/); assert.match(activity, /matching (?:this )?Buddy records/); assert.doesNotMatch(activity, /across this identity/);
                assert.equal((await layout(page)).overflow, false); assert.deepEqual(errors, []); assert.deepEqual(world.prompts, []);
                console.log(JSON.stringify({ width, route: 'guarded', hash: 'guarded', backForward: 'destinations retained', pendingSave: 'guarded', decode: 'guarded', lateOwner: 'isolated', EnglishScope: 'global', pageerrors: errors.length }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
