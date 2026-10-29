// Full product page with synthetic data only: branding, retained preferences,
// bilingual desktop/phone widths, process receipts, navigation and attachment UI.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const express = require('express');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, MAIN, say, botRecord, windowRecord, botPage, newWorld, layout, bottomBar, settledShot } = require('./pi-bot-fixture');
(async () => {
    const output = process.env.PI_BRAND_EVIDENCE || path.join(os.tmpdir(), 'ohmybuddy-brand');
    fs.mkdirSync(output, { recursive: true });
    const app = express(), root = path.resolve(__dirname, '../..');
    for (const [name, folder] of [['marked', 'marked/lib'], ['dompurify', 'dompurify/dist'], ['highlight', '@highlightjs/cdn-assets']]) app.use('/vendor/' + name, express.static(path.join(root, 'node_modules', folder)));
    app.use(express.static(path.join(root, 'public')));
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    let browser;
    const reports = [];
    try {
        browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
        const base = `http://127.0.0.1:${server.address().port}/`;
        const manifest = await (await fetch(base + 'site.webmanifest')).json();
        assert.equal(manifest.name, 'OhMyBuddy'); assert.equal(manifest.short_name, 'OhMyBuddy');
        for (const language of ['en', 'zh-CN']) for (const width of [1440, 393, 320]) {
            const en = language === 'en', height = width === 1440 ? 900 : 852;
            const labels = en ? { name: 'Clover', job: 'A little help with everyday life', user: 'Keep the three supplier quotes together for Friday. And keep your replies short and direct.', note: 'Compare three supplier quotes by Friday', style: 'Short and direct', memory: 'Prefers concise replies', reply: 'Done — the three quotes are on your list for Friday.\n\nI’ll keep my replies short and direct.', topic: 'Weekend plans' }
                : { name: '小苜', job: '帮你记住生活里的小事', user: '帮我把三家供应商的报价放在一起，周五前对比一下。以后回复也简洁直接一些。', note: '周五前对比三家供应商的报价', style: '简洁直接', memory: '喜欢简洁直接的回复', reply: '记好了，周五前对比三家报价。\n\n以后我会简洁直接地回复你。', topic: '周末安排' };
            const start = Date.parse('2026-10-29T09:00:00Z'), at = offset => new Date(start + offset).toISOString();
            const history = [say('user', labels.user, at(0))];
            const tool = (id, name, args, offset, details) => {
                history.push({ ...say('assistant', '', at(offset)), stopReason: 'toolUse', content: [{ type: 'toolCall', id, name, arguments: args }] });
                history.push({ role: 'toolResult', toolCallId: id, toolName: name, timestamp: start + offset + 100, content: [{ type: 'text', text: 'Saved' }], isError: false, details });
            };
            tool('notes', 'window_note', { action: 'add', text: labels.note }, 1000, { pivaneNoteSaved: { v: 1, ids: ['quote-plan'] } });
            tool('style', 'bot_setup_propose', { personality: labels.style }, 3000, { pivaneBotSetup: { status: 'saved', saved: { personality: labels.style } } });
            tool('memory', 'codemode', { title: labels.memory }, 5000, { pivaneBotChanges: { v: 1, changes: [{ area: 'memory', action: 'added', count: 1, previews: [labels.memory] }] } });
            history.push(say('assistant', labels.reply, at(7000)));
            const bot = botRecord({ name: labels.name, avatar: { kind: 'preset', id: 'pivane-pebble' }, bot: { job: labels.job }, windows: [windowRecord(MAIN), windowRecord('55555555-5555-4555-8555-555555555555', { kind: 'topic', title: labels.topic, emoji: '🌿' })] });
            const world = newWorld({ bots: () => [bot], messages: () => history });
            const prepared = { newContext: async options => {
                const context = await browser.newContext({ ...options, locale: en ? 'en-US' : 'zh-CN', reducedMotion: 'reduce' });
                await context.addInitScript(({ language }) => {
                    localStorage.setItem('pi.workspace.language', language);
                    localStorage.setItem('pi.workspace.theme', 'daylight');
                    localStorage.setItem('pi.workspace.sidebarCollapsed', 'false');
                    localStorage.setItem('pivane.models.recent', JSON.stringify([JSON.stringify(['fixture', 'kept-model'])]));
                }, { language });
                return context;
            } };
            const { context, page, errors } = await botPage(prepared, base, world, { width, height, hash: `#/bot?profileId=${BOT}`, api: ({ pathname }) => {
                if (pathname.endsWith('/notebook')) return { json: { generation: 0, version: 'v1', items: [{ id: 'quote-plan', text: labels.note }] } };
                if (pathname === `/api/pi/bots/${BOT}/settings`) return { json: { bot, profile: bot, revision: 'r1', profileRevision: 'p', fields: {}, models: [] } };
            } });
            try {
                await page.locator('#pi-input:not([disabled])').waitFor();
                await page.waitForFunction(() => document.querySelectorAll('.pi-bot-change-receipt').length === 3);
                await page.waitForFunction(() => !document.documentElement.classList.contains('pv-booting') && !document.documentElement.classList.contains('pv-boot-leaving'));
                assert.equal(await page.title(), 'OhMyBuddy');
                assert.equal(await page.locator('.logo-brand h2').textContent(), 'OhMyBuddy');
                if (width === 1440) assert.equal(await page.locator('.logo-brand h2').evaluate(node => node.scrollWidth <= node.clientWidth), true, 'the full product name fits the expanded sidebar');
                assert.equal(await page.locator('.pi-bot-process-line').count(), 1);
                assert.equal(await page.locator('.pi-bot-process-line').getAttribute('open'), null);
                const buttons = await page.locator('.pi-bot-change-receipt button').allTextContents();
                assert.ok(buttons.length === 3 && buttons.every(text => text.trim() === (en ? 'View' : '查看')), JSON.stringify(buttons));
                assert.equal((await layout(page)).overflow, false);
                assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pivane.models.recent')).includes(JSON.stringify(['fixture', 'kept-model']))), true);
                if (width < 680) assert.equal((await bottomBar(page)).bar, true);
                const filename = `bot-${en ? 'en' : 'zh'}-${width}.png`;
                await page.locator('[data-area="memory"]').scrollIntoViewIfNeeded();
                await settledShot(page, path.join(output, filename));
                await page.locator('.pi-bot-process-line > summary').click();
                await page.locator('.pi-tool-row').first().waitFor({ state: 'visible' });
                assert.equal(await page.locator('.pi-tool-row:visible').count(), 3);
                await page.locator('.pi-bot-process-line > summary').click();
                await page.locator('#pi-input').fill(en ? 'Keep this draft' : '保留这份草稿');
                await page.locator('#pi-composer-add-button').click();
                assert.equal(await page.locator('#pi-attach-button').isVisible(), true);
                await page.keyboard.press('Escape');
                assert.equal(await page.locator('#pi-input').inputValue(), en ? 'Keep this draft' : '保留这份草稿');
                assert.deepEqual(errors, []); assert.deepEqual(world.prompts, []);
                reports.push({ language, width, height, filename, title: await page.title(), receiptButtons: buttons, pageErrors: errors, overflow: false, retainedLegacyPreference: true, draftPreserved: true, toolRows: 3, businessRequests: 0 });
            } catch (error) { await page.screenshot({ path: path.join(output, `failure-${language}-${width}.png`) }); throw error; }
            finally { await context.close(); }
        }
        fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ status: 'passed', browser: browser.version(), reports }, null, 2));
        console.log(JSON.stringify({ status: 'passed', views: reports.length, output }));
    } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
