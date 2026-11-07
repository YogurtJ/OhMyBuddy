// A one-click Buddy topic starts with a default title in the resolved interface language; the
// server still recognises both defaults for automatic naming. Synthetic API only.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, MAIN, botRecord, windowRecord, botPage, newWorld, layout } = require('./pi-bot-fixture.js');

const TOPIC = '55555555-5555-4555-8555-555555555555';

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
    try {
        for (const width of [1440, 320]) for (const [locale, language, title] of [
            ['en-US', 'system', 'New topic'], ['zh-CN', 'system', '新话题'], ['zh-CN', 'en', 'New topic'], ['en-US', 'zh-CN', '新话题']
        ]) {
            let windows = [windowRecord(MAIN)], windowsRevision = 'a'.repeat(64);
            const world = newWorld({ bots: () => [botRecord({ windows, windowsRevision })] });
            const bodies = [];
            const api = ({ pathname, method, body }) => {
                if (pathname === `/api/pi/bots/${BOT}/topics/open-items`) return { json: { v: 1, omittedTopics: 0, topics: [] } };
                if (pathname !== `/api/pi/bots/${BOT}/windows` || method !== 'POST') return undefined;
                bodies.push(body);
                const window = windowRecord(TOPIC, { kind: 'topic', title: body.title, emoji: '', focus: '' });
                windows = [...windows, window]; windowsRevision = 'b'.repeat(64);
                return { json: { ok: true, window, windowsRevision } };
            };
            const { context, page, errors } = await botPage(browser, process.env.PI_BOT_TOPIC_LANGUAGE_URL + '/', world,
                { width, locale, language, mobile: width < 900, api });
            try {
                const label = `${width}/${locale}/${language}`;
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected');
                if (width < 900) { await page.locator('#pi-bot-header .pi-bot-menu').click(); await page.locator('#pi-session-pane.open').waitFor(); }
                await page.locator('.pi-bot-topic-add').click();
                await page.waitForFunction(id => decodeURIComponent(location.hash).includes(`windowId=${id}`), TOPIC);
                assert.deepEqual(bodies, [{ expectedRevision: 'a'.repeat(64), title, groupId: null }], label);
                await page.waitForFunction(title => document.querySelector('#pi-bot-header .pi-bot-who-topic')?.textContent === title, title);
                assert.equal((await layout(page)).overflow, false, label);
                assert.deepEqual(world.prompts, [], 'creating a topic never sends a model prompt');
                assert.deepEqual(errors, [], label);
            } finally { await context.close(); }
        }
        console.log('Buddy topic default title follows the interface language; desktop and phone: ok');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
