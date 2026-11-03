const assert = require('node:assert/strict');
const http = require('node:http'), path = require('node:path'), fs = require('node:fs'), os = require('node:os');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BrowserService } = require('../../server/browser/service');
const { mountBrowserRoutes } = require('../../server/browser/routes');
async function run(browser, base, width, locale) {
    const context = await browser.newContext({ locale, viewport: { width, height: 960 }, isMobile: width < 600, hasTouch: width < 600 });
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { localStorage.setItem('pi.web.cwd', '/fixture'); localStorage.setItem('pi.web.session:/fixture', 'fixture'); });
    await page.route('**/api/**', route => {
        const request = route.request(), url = new URL(request.url()), p = url.pathname;
        if (p.startsWith('/api/pi/browser')) { requests.push({ method: request.method(), path: p }); return route.continue(); }
        if (p === '/api/pi/status') return route.fulfill({ json: { ok: true, browserAssistant: true, extensionAssistant: false, nativeSettings: true, nativeResources: true, defaultProject: '/fixture', projectRoots: ['/fixture'] } });
        if (p === '/api/pi/projects') return route.fulfill({ json: { roots: ['/fixture'], projects: [{ cwd: '/fixture', name: 'Fixture' }] } });
        if (p === '/api/pi/sessions') return route.fulfill({ json: { sessions: [{ id: 'fixture', cwd: '/fixture', name: 'Fixture', messageCount: 1 }] } });
        if (p === '/api/pi/activity') return route.fulfill({ json: { runtimes: [], replyNotices: [] } });
        if (p === '/api/pi/settings/mcp') return route.fulfill({ json: { scope: 'global', revision: 'fixture', trust: { effective: true }, autoEnableCodemode: { value: true }, servers: [] } });
        if (p === '/api/pi/settings/native/resources') return route.fulfill({ json: { scope: url.searchParams.get('scope'), revision: 'fixture', packages: [], resources: [], trust: { effective: true } } });
        if (p === '/api/pi/settings/models') return route.fulfill({ json: { preferences: {}, providers: [], models: [], customProviders: [] } });
        return route.fulfill({ json: p.includes('history') || p === '/api/prompts' ? [] : {} });
    });
    await page.routeWebSocket('**/api/pi/ws', ws => ws.onMessage(raw => {
        const command = JSON.parse(raw), model = { provider: 'fixture', id: 'fixture', name: 'Fixture', input: ['text'], contextWindow: 32000 };
        const data = command.type === 'open_session' ? { session: { id: 'fixture', cwd: '/fixture', name: 'Fixture' }, state: { sessionId: 'fixture', model, isStreaming: false }, messages: { messages: [] }, commands: { commands: [] }, stats: {}, models: { models: [model] }, thinkingLevels: { levels: ['off'] } } : {};
        ws.send(JSON.stringify({ type: 'response', id: command.id, command: command.type, success: true, data }));
    }));
    try {
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('workspace:open-settings', { detail: { tab: 'extensions' } })));
        await page.locator('#extension-ohmybuddy-browser .extensions-card-cta').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#extension-ohmybuddy-browser .extensions-card-cta').isEnabled(), true);
        await page.locator('#extension-ohmybuddy-browser .extensions-card-cta').click();
        const panel = page.locator('.browser-panel'); await panel.waitFor({ state: 'visible' });
        const enabled = panel.getByRole('checkbox', { name: locale === 'en' ? 'Enable browser assistant' : '启用浏览器助手', exact: true });
        await page.waitForFunction(() => !document.querySelector('.browser-choice input').disabled);
        assert.equal(requests.some(request => request.method !== 'GET'), false, 'opening settings must not start a server or change settings');
        assert.match(await panel.textContent(), /Playwright MCP/);
        assert.equal(await panel.locator('.browser-preview, .browser-manual').count(), 0, 'the custom executor and remote-control UI have been removed');
        await enabled.check();
        await panel.getByRole('checkbox', { name: locale === 'en' ? 'Run in background' : '在后台运行', exact: true }).check();
        await panel.getByRole('button', { name: locale === 'en' ? 'Save settings' : '保存设置', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.browser-summary').textContent.includes('已启用') || document.querySelector('.browser-summary').textContent.includes('Enabled'));
        assert.equal(requests.filter(request => request.method === 'PUT').length, 1);
        const overflow = await panel.evaluate(root => [root, ...root.querySelectorAll('.browser-controls, button')].filter(node => node.clientWidth && node.scrollWidth > node.clientWidth + 2).map(node => node.className));
        assert.deepEqual(overflow, []); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: path.join(os.tmpdir(), `omb-playwright-mcp-panel-${width}-${locale}.png`) });
        await panel.getByRole('button', { name: locale === 'en' ? 'View MCP connections' : '查看 MCP 连接', exact: true }).click();
        await page.locator('[data-settings-panel="mcp"]').waitFor({ state: 'visible' });
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
}
(async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-browser-ui-')));
    const executable = process.env.CHROMIUM_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const service = new BrowserService({ root });
    const express = require('express'), app = express(), router = express.Router();
    app.use(express.json()); mountBrowserRoutes(router, service); app.use('/api/pi', router);
    app.use(express.static(path.resolve(__dirname, '../../public'))); app.use('/vendor', express.static(path.resolve(__dirname, '../../node_modules')));
    const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const browser = await chromium.launch({ executablePath: executable, headless: true });
    try {
        for (const [width, locale] of [[1440, 'zh-CN'], [393, 'zh-CN'], [320, 'en']]) {
            await service.configure({ revision: service.status().revision, enabled: false, headless: true });
            await run(browser, `http://127.0.0.1:${server.address().port}`, width, locale); console.log(`PASS Playwright MCP browser settings ${width} ${locale}`);
        }
    } finally { await browser.close(); await service.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
