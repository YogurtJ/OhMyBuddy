// A Bot made from an existing identity (M4-5b) greets as itself: its name, no "I have no name yet",
// and no offer to borrow another Bot's notes; starting still costs no model call until the user agrees.
// Synthetic backend (pi-bot-fixture.js); desktop and phone.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { serve, botRecord, botPage, newWorld, layout } = require('./pi-bot-fixture.js');

(async () => {
    const { base, close } = await serve();
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const width of [1440, 393]) {
            const world = newWorld({ bots: () => [botRecord({ name: '数学老师', avatar: { kind: 'emoji', value: '📐' }, bot: {
                job: '', onboarding: { version: 1, phase: 'greeting', firstBot: false, converted: true, flowVersion: 2,
                    steps: { name: 'done', avatar: 'done', known: 'done', personality: 'done' }, startedAt: null, completedAt: null } } })] });
            const { context, page, errors } = await botPage(browser, base, world, { width });
            try {
                await page.locator('.pi-bot-greeting').waitFor();
                const text = await page.locator('.pi-bot-greeting p').first().textContent();
                assert.match(text, /我是数学老师/); assert.match(text, /记得的事都还在/);
                assert.doesNotMatch(text, /还没有名字/);
                assert.equal(await page.locator('.pi-bot-greeting.is-known').count(), 0, 'no offer to borrow another Bot\'s notes');
                assert.equal(await page.locator('.pi-bot-greeting [data-bot-action="greet-yes"]').count(), 1);
                assert.deepEqual(world.prompts, [], 'the hello costs no model call');
                assert.equal((await layout(page)).overflow, false);
                assert.deepEqual(errors, []);
                console.log(JSON.stringify({ width, status: 'passed' }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
