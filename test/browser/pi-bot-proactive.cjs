// "主动找你" in Bot settings (M4-3, public/pi-bot-settings.js): the proactive switch, quiet hours,
// the daily push limit (default 20, D-045) and the follow-ups the Bot plans, each cancellable in
// place. Only changed notify fields are saved, with this browser's time zone; invalid quiet hours
// save nothing. A follow-up message in the chat shows only its short title. Synthetic backend
// (pi-bot-fixture.js); desktop, phone and narrow phone.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, say, serve, botRecord, botPage, newWorld, layout, settingsPage } = require('./pi-bot-fixture.js');

const DUE = { id: 'a'.repeat(24), kind: 'due', windowId: '22222222-2222-4222-8222-222222222222', at: Date.parse('2026-10-30T01:00:00Z'), title: '交房租', state: 'pending', noteId: 'n1', due: '2026-10-30' };
const CHECK = { id: 'b'.repeat(24), kind: 'checkin', windowId: '22222222-2222-4222-8222-222222222222', at: Date.parse('2026-11-02T07:00:00Z'), title: '看看论文进展', state: 'pending' };
const FOLLOW_UP = { role: 'custom', customType: 'pivane-cron-message', display: true, timestamp: Date.parse('2026-10-26T06:00:10Z'),
    content: '[Your own follow-up: 交房租; scheduled 2026-10-30T01:00:00.000Z; timezone Asia/Shanghai.]\n\nA commitment in this chat\'s notebook is due now: [n1] "交房租". Write one short, natural message.',
    details: { runId: 'c'.repeat(64), jobId: 'bot:x', name: '交房租', scheduledAt: 0, bodyOffset: 10, origin: 'bot', note: '交房租' } };

(async () => {
    const { base, close } = await serve();
    const evidence = process.env.PI_BOT_EVIDENCE;
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const width of [1440, 393, 320]) {
            const phone = width < 900;
            let revision = 's1', followUps = [DUE, CHECK], notify = { version: 2, proactive: true, quietHours: { start: '23:00', end: '08:00' }, dailyProactiveLimit: 20 };
            const patches = [], deletes = [];
            const world = newWorld({
                bots: () => [botRecord({ bot: { notify } })],
                messages: () => [say('user', '月底提醒我交房租', '2026-10-26T06:00:00Z'), say('assistant', '好，记下了。', '2026-10-26T06:00:05Z'), FOLLOW_UP, say('assistant', '房租今天到期了，交了吗？', '2026-10-26T06:00:12Z')]
            });
            const api = async ({ pathname, method, body }) => {
                if (pathname === `/api/pi/bots/${BOT}/settings`) return { json: { revision, bot: { id: BOT, name: '小狸', avatar: { kind: 'emoji', value: '🦊' }, soul: '',
                    bot: { ...botRecord().bot, notify } }, models: { defaults: null, models: [] } } };
                if (pathname === `/api/pi/bots/${BOT}/follow-ups` && method === 'GET') return { json: { items: followUps } };
                if (pathname.startsWith(`/api/pi/bots/${BOT}/follow-ups/`) && method === 'DELETE') {
                    const id = pathname.split('/').pop(); deletes.push(id);
                    followUps = followUps.filter(item => item.id !== id);
                    return { json: { cancelled: { id } } };
                }
                if (pathname === `/api/pi/bots/${BOT}` && method === 'PATCH') {
                    patches.push(body);
                    assert.equal(body.expectedRevision, revision);
                    notify = { ...notify, ...body.changes.bot.notify };
                    revision = `${revision}+`;
                    return { json: { ok: true, revision } };
                }
                return undefined;
            };
            const { context, page, errors } = await botPage(browser, base, world, { width, api });
            const shot = async label => { if (evidence) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(evidence, `${label}-${width}.png`) }); } };
            const openSettings = async () => {
                if (phone) { await page.locator('#pi-bot-header .pi-bot-menu').click(); await page.locator('#pi-session-pane.open .pi-bot-settings').waitFor(); }
                await page.locator('.pi-bot-settings').click();
                const sheet = page.locator('.pi-bot-sheet[open]');
                await settingsPage(sheet, 'notify');
                return sheet;
            };
            try {
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected');

                // 1. A follow-up in the chat shows its short title, never the model-facing instructions.
                const card = page.locator('[data-agent-card="follow-up"]');
                await card.waitFor();
                const cardText = await card.innerText();
                assert.match(cardText, /主动跟进/); assert.match(cardText, /交房租/);
                assert.doesNotMatch(cardText, /commitment|notebook|Write one/);

                // 2. The section shows the saved values; nothing changed means nothing to save.
                let sheet = await openSettings();
                const box = sheet.locator('.pi-bot-sheet-notify');
                await box.scrollIntoViewIfNeeded();
                assert.equal(await box.locator('[data-notify="proactive"]').isChecked(), true);
                assert.equal(await box.locator('[data-notify="quiet"]').isChecked(), true);
                for (const control of ['proactive', 'quiet']) {
                    const toggle = box.locator(`[data-notify="${control}"]`);
                    assert.equal(await toggle.getAttribute('role'), 'switch');
                    assert.equal(await toggle.evaluate(node => node.closest('label.pi-bot-sheet-item.pi-bot-sheet-check') !== null), true, 'the row labels its switch');
                }
                assert.deepEqual(await box.locator('input[type="time"]').evaluateAll(nodes => nodes.map(node => node.value)), ['23:00', '08:00']);
                assert.equal(await box.locator('[data-notify="limit"]').inputValue(), '20');
                assert.equal(await box.locator('[data-notify="limit"] option:checked').textContent(), '20 条');
                assert.equal(await box.locator('[data-notify="limit"] option[value="none"]').textContent(), '不限');
                assert.equal(await box.locator('.pi-bot-sheet-followups .pi-bot-sheet-instant').innerText(), '立即生效');
                assert.deepEqual(await box.locator('.pi-bot-sheet-rule strong').allTextContents(), ['交房租', '看看论文进展']);
                assert.match(await box.locator('.pi-bot-sheet-followups').innerText(), /到期提醒 ·/);
                assert.match(await box.locator('.pi-bot-sheet-followups').innerText(), /回来看看 ·/);
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true);
                if (phone) {
                    for (const control of await box.locator('.pi-bot-sheet-check, .pi-bot-sheet-rule .pi-bot-chip, input[type="time"], select').all())
                        assert.ok((await control.boundingBox()).height >= 44, 'touch-sized controls');
                    for (const input of await box.locator('input[type="time"], select').all())
                        assert.equal(await input.evaluate(node => getComputedStyle(node).fontSize), '16px', 'no zoom on focus');
                }
                const sheetBox = await sheet.boundingBox();
                for (const control of await box.locator('input, select, button').all()) {
                    const b = await control.boundingBox();
                    if (b) assert.ok(b.x >= sheetBox.x - 1 && b.x + b.width <= sheetBox.x + sheetBox.width + 1, 'controls fit the sheet');
                }
                await shot('bot-proactive-settings');

                // 3. Cancelling a follow-up happens at once, in place, and keeps focus in the list.
                await box.locator(`[data-follow-up-cancel="${DUE.id}"]`).click();
                await page.locator('.pi-toast').filter({ hasText: '已取消这次跟进' }).waitFor();
                assert.deepEqual(deletes, [DUE.id]);
                assert.deepEqual(await box.locator('.pi-bot-sheet-rule strong').allTextContents(), ['看看论文进展']);
                assert.equal(await page.evaluate(() => document.activeElement?.id), 'pi-bot-sheet-followups-title');
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true, 'a cancelled follow-up is not a settings edit');
                assert.equal(await sheet.locator('.pi-bot-sheet-nav .is-dirty').count(), 0);
                assert.equal(await sheet.locator('.pi-bot-sheet-dirty').textContent(), '');

                // 4. Same start and end saves nothing; then only the changed fields are saved, with the zone.
                await box.locator('input[type="time"]').nth(1).fill('23:00');
                await box.locator('input[type="time"]').nth(1).dispatchEvent('input');
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true);
                assert.equal(await sheet.locator('.pi-bot-sheet-dirty').evaluate(node => node.classList.contains('is-error')), true);
                assert.match(await sheet.locator('.pi-bot-sheet-dirty').innerText(), /安静时段的开始和结束要是两个不同的时间/);
                await box.locator('input[type="time"]').nth(1).fill('07:30');
                await box.locator('input[type="time"]').nth(1).dispatchEvent('input');
                await box.locator('[data-notify="limit"]').selectOption('none');
                await sheet.locator('.pi-bot-sheet-save').click();
                await page.locator('.pi-bot-sheet').waitFor({ state: 'detached' });
                const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
                assert.deepEqual(patches.at(-1).changes, { bot: { notify: { quietHours: { start: '23:00', end: '07:30' }, dailyProactiveLimit: null, timeZone: zone } } });

                // 5. Switching proactive messages off dims the rest and saves just that.
                sheet = await openSettings();
                assert.equal(await sheet.locator('[data-notify="limit"]').inputValue(), 'none');
                await sheet.locator('[data-notify="proactive"]').click();
                assert.equal(await sheet.locator('.pi-bot-sheet-notify .pi-bot-sheet-field').evaluate(node => node.classList.contains('is-off')), true);
                await sheet.locator('[data-notify="quiet"]').click();
                assert.equal(await sheet.locator('.pi-bot-sheet-times').isHidden(), true);
                await sheet.locator('.pi-bot-sheet-save').click();
                await page.locator('.pi-bot-sheet').waitFor({ state: 'detached' });
                assert.deepEqual(patches.at(-1).changes, { bot: { notify: { proactive: false, quietHours: null } } }, 'the zone is already saved');
                assert.equal(patches.length, 2);

                assert.equal((await layout(page)).overflow, false, `no horizontal overflow at ${width}`);
                assert.deepEqual(errors, []);
                console.log(JSON.stringify({ width, status: 'passed' }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
