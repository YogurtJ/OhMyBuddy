// New Buddy names follow the resolved interface language, not the browser language or a
// saved preference awaiting reload. Synthetic API only; no live identity or model calls.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, MAIN, BOT2, MAIN2, botRecord, windowRecord, botPage, newWorld, layout } = require('./pi-bot-fixture.js');

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
    try {
        for (const width of [1440, 320]) for (const [locale, language, expected] of [
            ['en-US', 'system', 'en'], ['zh-CN', 'system', 'zh-CN'],
            ['zh-CN', 'en', 'en'], ['en-US', 'zh-CN', 'zh-CN'], ['fr-FR', 'system', 'en']
        ]) {
            const bots = [], world = newWorld({ bots: () => bots });
            const api = ({ pathname, method, body }) => {
                if (pathname.endsWith('/about-sources')) return { json: { sources: [] } };
                if (pathname !== '/api/pi/bots' || method !== 'POST') return undefined;
                const firstBot = bots.length === 0;
                const bot = botRecord({ id: firstBot ? BOT : BOT2, name: body.language === 'en' ? 'New buddy' : '新伙伴',
                    windows: [windowRecord(firstBot ? MAIN : MAIN2)],
                    bot: { job: '', onboarding: { version: 1, flowVersion: 2, phase: 'greeting', firstBot, steps: {} } } });
                bot.chosen = { name: false, avatar: false };
                bots.push(bot); world.revision = `r${bots.length + 1}`;
                return { json: { ok: true, revision: world.revision, bot, window: bot.windows[0] } };
            };
            const { context, page, errors } = await botPage(browser, process.env.PI_BOT_CREATION_URL + '/', world,
                { width, locale, language, mobile: width < 900, api });
            try {
                const label = `${width}/${locale}/${language}`;
                assert.equal(await page.evaluate(() => PiI18n.locale), expected, label);
                await page.locator('.pi-bot-empty [data-bot-action="create"]').click();
                const name = expected === 'en' ? 'New buddy' : '新伙伴';
                const checkCreated = async count => {
                    await page.waitForFunction(id => document.querySelector('#pi-bot-header .pi-bot-identity') && location.hash.includes(id), count === 1 ? BOT : BOT2);
                    const posts = world.requests.filter(request => request.pathname === '/api/pi/bots' && request.method === 'POST');
                    assert.equal(posts.length, count, label);
                    assert.deepEqual(posts.at(-1).body, { expectedRevision: `r${count}`, language: expected }, label);
                    assert.equal(await page.locator('#pi-bot-header .pi-bot-who strong').textContent(), name, label);
                    assert.equal((await layout(page)).overflow, false, label);
                };
                await checkCreated(1);
                // Saving another preference does not change this page's active interface language.
                await page.evaluate(value => PiI18n.save(value), expected === 'en' ? 'zh-CN' : 'en');
                if (width < 900) await page.locator('#pi-bot-header .pi-bot-menu').click();
                await page.locator('.pi-bot-rail-add').click();
                await checkCreated(2);
                assert.deepEqual(world.prompts, [], 'creation never sends a model prompt');
                assert.deepEqual(errors, [], label);
            } finally { await context.close(); }
        }
        console.log('Buddy creation language: system, explicit and pending preferences; desktop and phone: ok');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
