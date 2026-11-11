// Notebook localization, long content and internal scrolling across themes and viewports.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, MAIN, serve, botRecord, botPage, newWorld, settledShot } = require('./pi-bot-fixture');
(async () => {
    const server = await serve(); let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
        for (const [width, language, theme, height] of [[1440, 'en', 'daylight', 900], [390, 'en', 'dark', 900], [820, 'zh-CN', 'dark', 620]]) {
            const notes = Array.from({ length: 70 }, (_, index) => ({ id: `b${index + 1}`, kind: 'ref', status: 'active', due: null,
                text: index ? `Reference ${index} · 东京旅行确认资料` : 'A'.repeat(500), subject: 'Tokyo trip · ' + '长标题'.repeat(20),
                createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
                source: { role: 'user', text: '原话'.repeat(140), title: '来源话题'.repeat(15), windowId: MAIN, available: true } }));
            const world = newWorld({ bots: () => [botRecord()] });
            const { context, page, errors } = await botPage(browser, server.base, world, { width, height, language, mobile: width < 600,
                hash: `#/bot?profileId=${BOT}`, api: request => request.pathname === `/api/pi/bots/${BOT}/notebook`
                    ? { json: { scope: 'buddy', version: 'v1', items: notes, total: notes.length, omitted: 0 } } : undefined });
            try {
                await page.locator('html').evaluate((node, value) => { node.dataset.theme = value; }, theme);
                if (width > 900) await page.locator('.pi-bot-notebook-nav .pi-bot-notes-link').click();
                else { await page.locator('#pi-bot-header [data-bot-action="more"]').click(); await page.locator('.pi-bot-more-menu [data-bot-action="notes"]').click(); }
                const sheet = page.locator('.pi-bot-notes[open]');
                await sheet.locator('.pi-bot-notes-empty').waitFor();
                if (language === 'en') { assert.equal(await sheet.locator('h2').textContent(), "What I'm keeping in mind"); assert.match(await sheet.locator('.pi-bot-notes-subtitle').textContent(), /every chat/); }
                await sheet.locator('[data-notes-tab="reference"]').click();
                assert.equal(await sheet.locator('.pi-bot-note').count(), 60);
                await sheet.locator('[data-note-id="b1"] .pi-bot-note-source summary').click();
                const dimensions = await sheet.evaluate(node => {
                    const body = node.querySelector('.pi-bot-sheet-body'), box = node.getBoundingClientRect(), footer = node.querySelector('footer').getBoundingClientRect();
                    return { overflow: node.scrollWidth > node.clientWidth || body.scrollWidth > body.clientWidth,
                        scrolling: body.scrollHeight > body.clientHeight, fits: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
                        footerVisible: footer.bottom <= box.bottom, fieldsFit: [...node.querySelectorAll('input,select')].every(field => !field.getClientRects().length || field.getBoundingClientRect().right <= box.right) };
                });
                assert.deepEqual(dimensions, { overflow: false, scrolling: true, fits: true, footerVisible: true, fieldsFit: true }, JSON.stringify(await sheet.locator('.pi-bot-sheet-form,.pi-bot-notes-controls,.pi-bot-notes-filters,.pi-bot-notes-search,.pi-bot-notes-add,input,select').evaluateAll(nodes => nodes.map(node => ({ tag: node.tagName, cls: node.className, width: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right, min: getComputedStyle(node).minWidth, box: getComputedStyle(node).boxSizing, grid: getComputedStyle(node).gridTemplateColumns })))));
                if (process.env.PI_BOT_EVIDENCE_DIR) { fs.mkdirSync(process.env.PI_BOT_EVIDENCE_DIR, { recursive: true }); await settledShot(page, path.join(process.env.PI_BOT_EVIDENCE_DIR, `buddy-notebook-${language}-${theme}-${width}.png`)); }
                await sheet.locator('.pi-bot-notes-load-more').click(); assert.equal(await sheet.locator('.pi-bot-note').count(), 70);
                await sheet.locator('input[type="search"]').fill('Reference 69'); assert.equal(await sheet.locator('.pi-bot-note').count(), 1);
                assert.deepEqual(errors, []); assert.equal(world.prompts.length, 0);
                console.log(JSON.stringify({ width, language, theme, status: 'passed' }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
