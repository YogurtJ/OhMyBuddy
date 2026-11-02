// Browser controls backed by the real isolated Bot settings/onboarding service. Chat WS alone
// stays synthetic; catalog reads and owner writes use the mounted HTTP routes, never a provider.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const express = require('express');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { serve, botPage, newWorld, settingsPage, layout } = require('./pi-bot-fixture');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-model-contract-')));
const agentDir = path.join(root, 'agent'); fs.mkdirSync(agentDir);
process.env.PI_CODING_AGENT_DIR = agentDir; process.env.PI_PROJECT_ROOTS = root; process.env.OHMYBUDDY_WORKSPACES_DIR = path.join(root, 'workspaces'); process.env.PI_OFFLINE = '1';
const { PiSessionStore } = require('../../server/pi-session-store');
const { PiProfileRegistry } = require('../../server/pi-profile-registry');
const { PiAgentSupervisor } = require('../../server/pi-agent-supervisor');
const { BotService } = require('../../server/bot/bot-service');
const { mountBotRoutes } = require('../../server/bot/bot-routes');

(async () => {
    const store = new PiSessionStore(), profiles = new PiProfileRegistry(store), supervisor = new PiAgentSupervisor();
    store.profiles = profiles;
    // SDK chooses Text automatically here; the UI must not infer a choice from catalog order.
    let catalog = { models: [
        { provider: 'fixture', modelId: 'text', name: 'Automatic Text', thinkingLevels: ['off', 'low', 'high'] },
        { provider: 'fixture', modelId: 'vision', name: 'Vision', thinkingLevels: ['off'] }
    ] };
    const bots = new BotService({ store, profiles, supervisor, catalog: async () => catalog });
    const app = express(); app.use(express.json()); mountBotRoutes(app, { bots });
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const apiBase = `http://127.0.0.1:${server.address().port}`;
    let browser, staticSite;
    try {
        staticSite = await serve();
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const width of [1440, 393, 320]) {
            const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
            const botId = created.bot.id;
            await profiles.mutate((await profiles.state()).revision, state => {
                const bot = state.profiles.find(item => item.id === botId).bot;
                bot.onboarding = { ...bot.onboarding, flowVersion: 2, phase: 'done', steps: {}, completedAt: new Date().toISOString() };
                return {};
            });
            let list = await bots.list();
            const world = newWorld({ bots: () => list.bots });
            const bodies = [];
            const { page, context, errors } = await botPage(browser, staticSite.base, world, { width, hash: `#/bot?profileId=${botId}`, api: async ({ pathname, method, body }) => {
                if (!/^\/api\/pi\/bots(?:$|\/[^/]+(?:\/settings|\/onboarding)?$)/.test(pathname) || pathname.endsWith('/readiness')) return undefined;
                if (body) bodies.push(body);
                const response = await fetch(apiBase + pathname.slice('/api/pi'.length), { method,
                    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
                const json = await response.json();
                list = await bots.list(); world.revision = list.revision;
                return { status: response.status, json };
            } });
            const open = async () => {
                if (width <= 900 && !await page.locator('#pi-session-pane').evaluate(node => node.classList.contains('open'))) await page.locator('#pi-bot-header .pi-bot-menu').click();
                await page.locator('.pi-bot-settings').click();
                const sheet = page.locator('.pi-bot-sheet[open]'); await settingsPage(sheet, 'model'); return sheet;
            };
            try {
                const closure = page.locator('.pi-bot-closure:not([hidden])');
                await closure.locator('[data-closure-model-trigger]').waitFor();
                assert.match(await closure.locator('[data-closure-model-trigger]').innerText(), /跟随默认（Automatic Text）/);
                await closure.locator('[data-closure-thinking]').selectOption('high');
                await closure.locator('[data-closure-action="model"]').click();
                await closure.locator('.pi-bot-closure-saved').waitFor();
                assert.deepEqual(bodies.at(-1).model, null); assert.equal(bodies.at(-1).thinking, 'high');
                assert.equal((await bots.bot(botId)).bot.model, null); assert.equal((await bots.bot(botId)).bot.thinking, 'high');
                let sheet = await open();
                assert.match(await sheet.locator('[data-sheet-model-trigger]').innerText(), /跟随默认（Automatic Text）/);
                const thinking = sheet.locator('[data-sheet-thinking]');
                assert.deepEqual(await thinking.locator('option').evaluateAll(nodes => nodes.map(node => node.value)), ['', 'off', 'low', 'high']);
                await thinking.selectOption('low');
                if (width < 600) assert.equal(await thinking.evaluate(node => getComputedStyle(node).fontSize), '16px');
                await sheet.locator('.pi-bot-sheet-save').click(); await sheet.waitFor({ state: 'detached' });
                assert.deepEqual(bodies.at(-1).changes, { bot: { thinking: 'low' } });
                assert.equal((await bots.bot(botId)).bot.model, null); assert.equal((await bots.bot(botId)).bot.thinking, 'low');
                const projection = await bots.settings(botId);
                assert.equal(projection.models.defaults, undefined);
                assert.deepEqual(projection.models.effectiveDefault, { provider: 'fixture', modelId: 'text' });
                // An explicitly unknown effective default must not fall back to a stale saved one.
                catalog = { ...catalog, defaults: { provider: 'fixture', modelId: 'vision' }, effectiveDefault: null };
                sheet = await open();
                assert.match(await sheet.locator('[data-sheet-model-trigger]').innerText(), /^跟随默认\n⌄$/);
                assert.deepEqual(await sheet.locator('[data-sheet-thinking]').locator('option').evaluateAll(nodes => nodes.map(node => node.value)), ['', 'low']);
                await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
                catalog = { models: catalog.models };
                assert.equal((await layout(page)).overflow, false); assert.deepEqual(errors, []); assert.deepEqual(world.prompts, []);
                if (process.env.PI_BOT_EVIDENCE) await page.screenshot({ path: path.join(process.env.PI_BOT_EVIDENCE, `bot-model-contract-${width}.png`) });
                console.log(JSON.stringify({ width, realSettings: true, realOnboarding: true, model: null, thinking: 'low', pageerrors: errors.length }));
            } finally { await context.close(); }
        }
    } finally {
        await browser?.close(); await staticSite?.close();
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        await supervisor.dispose(); await profiles.dispose(); fs.rmSync(root, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
