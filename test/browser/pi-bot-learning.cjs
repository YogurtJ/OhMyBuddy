// "自己学习" in Bot settings (public/pi-bot-settings.js): the background-learning switch,
// daily budget note, health hints (needs-model, quota-exhausted, failing), unavailable state,
// and the link to the identity page's learning tab. Turning learning on or off applies at once
// via PUT /api/pi/profiles/:id/learning and never counts as a sheet edit. Synthetic backend
// (pi-bot-fixture.js); desktop, phone and narrow phone.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, serve, botRecord, botPage, newWorld, layout } = require('./pi-bot-fixture.js');

(async () => {
    const { base, close } = await serve();
    const evidence = process.env.PI_BOT_EVIDENCE;
    if (evidence) require('node:fs').mkdirSync(evidence, { recursive: true });
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const width of [1440, 393, 320]) {
            const phone = width < 900;
            let revision = 3, enabled = false, maxRunsPerDay = 20, healthState = 'off', status = 'ready', installed = true;
            let nextPutError = null;
            const puts = [];
            const learningSnapshot = () => ({
                version: 1, status, revision,
                settings: { enabled, correctionEnabled: true, reviewEnabled: false, extractionEnabled: false,
                    periodicReviewMinutes: 0, maxRunsPerDay, maxTokensPerDay: 200000, consolidationInputChars: 12000,
                    triggerPhrases: { correction: [], preference: [], temporary: [], ignore: [] } },
                health: { state: healthState, missingModels: healthState === 'needs-model' ? ['memory-correction'] : [],
                    lastFailure: null, today: { runs: 0, maxRuns: maxRunsPerDay, reservedTokens: 0, maxTokens: 200000,
                        exhaustedBy: healthState === 'quota-exhausted' ? 'runs' : null, resetsAt: '2026-10-25T00:00:00.000Z', usedTokens: null } },
                legacy: null, proposals: [], drafts: { pending: 0 }, jobs: [], recentRuns: [],
                capabilities: { installed, settingsWrite: true, actions: ['save', 'enable', 'cancel'] }
            });
            const world = newWorld({ bots: () => [botRecord()] });
            const api = async ({ pathname, method, body }) => {
                if (pathname === `/api/pi/bots/${BOT}/settings`) return { json: { revision: 's1', bot: { id: BOT, name: '小狸', avatar: { kind: 'preset', id: 'pivane-bean' }, soul: '',
                    bot: botRecord().bot }, models: { defaults: null, models: [] } } };
                if (pathname === `/api/pi/bots/${BOT}/follow-ups`) return { json: { items: [] } };
                if (pathname === `/api/pi/profiles/${BOT}/learning` && method === 'GET') {
                    if (status === 'error-get') return { status: 503, json: { error: 'Learning unavailable' } };
                    return { json: learningSnapshot() };
                }
                if (pathname === `/api/pi/profiles/${BOT}/learning` && method === 'PUT') {
                    puts.push(body);
                    if (nextPutError) {
                        const err = nextPutError; nextPutError = null;
                        if (err.status === 409) { revision += 1; enabled = err.serverEnabled ?? enabled; healthState = err.serverHealth ?? healthState; }
                        return { status: err.status, json: { error: err.message } };
                    }
                    assert.equal(body.expectedRevision, revision);
                    enabled = Boolean(body.changes.enabled);
                    revision += 1;
                    healthState = enabled ? 'needs-model' : 'off';
                    return { json: learningSnapshot() };
                }
                if (pathname === '/api/pi/profiles' && method === 'GET') {
                    return { json: { version: 1, revision: 'p1', profiles: [{ id: BOT, name: '小狸', description: '', soul: '',
                        avatar: { kind: 'preset', id: 'pivane-bean' }, enabled: true,
                        memory: { enabled: true, autoLearn: false, memoryCharLimit: 16000, userCharLimit: 8000 },
                        skills: { learnedEnabled: true }, bot: botRecord().bot }] } };
                }
                return undefined;
            };
            const { context, page, errors } = await botPage(browser, base, world, { width, api });
            const shot = async label => { if (evidence) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(evidence, `${label}-${width}.png`) }); } };
            const openSettings = async () => {
                if (phone) { await page.locator('#pi-bot-header .pi-bot-menu').click(); await page.locator('#pi-session-pane.open .pi-bot-settings').waitFor(); }
                await page.locator('.pi-bot-settings').click();
                const sheet = page.locator('.pi-bot-sheet[open]');
                await sheet.locator('.pi-bot-sheet-learning').waitFor();
                return sheet;
            };
            try {
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected');
                let sheet = await openSettings();
                const box = sheet.locator('.pi-bot-sheet-learning');
                await box.scrollIntoViewIfNeeded();

                // 1. Off state is shown with the plain note and daily limit; Save is disabled.
                const toggle = box.locator('[data-learning-switch]');
                assert.equal(await toggle.isChecked(), false);
                const noteText = await box.innerText();
                assert.match(noteText, /让它从聊天里学习/);
                assert.match(noteText, /纠正、偏好.*记忆或技能草稿.*看过才会启用/);
                assert.match(noteText, /每天最多 20 次/);
                assert.equal(await box.locator('[data-learning-health]').count(), 0);
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true);
                if (phone) {
                    for (const control of await box.locator('.pi-bot-sheet-check, .pi-bot-sheet-link').all())
                        assert.ok((await control.boundingBox()).height >= 44, 'touch-sized controls');
                }
                const sheetBox = await sheet.boundingBox();
                for (const control of await box.locator('input, button').all()) {
                    const b = await control.boundingBox();
                    assert.ok(b.x >= sheetBox.x - 1 && b.x + b.width <= sheetBox.x + sheetBox.width + 1, 'controls fit the sheet');
                }
                await shot('bot-learning-off');

                // 2. Turning it on sends the exact PUT body, shows a toast, shows the needs-model hint,
                // and does not count as a sheet edit (Save stays disabled).
                await toggle.click();
                await page.locator('.pi-toast').filter({ hasText: '已开启学习' }).waitFor();
                assert.deepEqual(puts, [{ expectedRevision: 3, changes: { enabled: true } }]);
                assert.equal(await box.locator('[data-learning-switch]').isChecked(), true);
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true, 'switch is not a sheet edit');
                await box.locator('[data-learning-health="needs-model"]').waitFor();
                assert.match(await box.locator('[data-learning-health="needs-model"]').textContent(), /辅助模型/);
                const modelBtn = box.locator('[data-learning-models]');
                await modelBtn.waitFor();
                if (phone) assert.ok((await modelBtn.boundingBox()).height >= 44, 'touch-sized needs-model button');
                await shot('bot-learning-needs-model');

                // 3. A failure keeps the sheet open, reverts the switch to the server state, and shows an error.
                nextPutError = { status: 400, message: '辅助模型暂不可用' };
                await box.locator('[data-learning-switch]').click();
                await sheet.locator('.pi-bot-sheet-status[data-tone="error"]').filter({ hasText: '没有完成：辅助模型暂不可用' }).waitFor();
                assert.equal(await sheet.isVisible(), true);
                assert.equal(await box.locator('[data-learning-switch]').isChecked(), true);
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true);

                // 4. A 409 conflict rereads the server state and updates the switch.
                nextPutError = { status: 409, message: 'Learning settings changed', serverEnabled: false, serverHealth: ' quota-exhausted'.trim() };
                maxRunsPerDay = 30;
                await box.locator('[data-learning-switch]').click();
                await sheet.locator('.pi-bot-sheet-status[data-tone="warn"]').filter({ hasText: '已刷新' }).waitFor();
                assert.equal(await box.locator('[data-learning-switch]').isChecked(), false);
                assert.match(await box.innerText(), /每天最多 30 次/);
                assert.match(await box.locator('[data-learning-health="quota-exhausted"]').textContent(), /已经用完/);

                // 5. Unavailable learning shows a quiet note instead of the switch.
                await sheet.locator('.pi-bot-sheet-close').click();
                await sheet.waitFor({ state: 'detached' });
                installed = false; status = 'disabled';
                sheet = await openSettings();
                await sheet.locator('.pi-bot-sheet-learning').scrollIntoViewIfNeeded();
                assert.equal(await sheet.locator('[data-learning-switch]').count(), 0);
                assert.match(await sheet.locator('.pi-bot-sheet-learning').innerText(), /暂时不能用学习功能/);

                // 6. "更多学习设置" closes the sheet and navigates to the identity page's learning tab for this Bot.
                await sheet.locator('[data-learning-more]').click();
                await sheet.waitFor({ state: 'detached' });
                await page.waitForFunction(id => location.hash.startsWith('#/profiles?') && location.hash.includes(`profileId=${id}`) && location.hash.includes('section=learning'), BOT);

                assert.equal((await layout(page)).overflow, false, `no horizontal overflow at ${width}`);
                assert.deepEqual(errors, []);
                console.log(JSON.stringify({ width, status: 'passed' }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
