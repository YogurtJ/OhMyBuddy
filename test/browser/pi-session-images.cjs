const assert = require('node:assert/strict');
const path = require('node:path'), http = require('node:http');
const { once } = require('node:events');
const express = require('express');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..'), cwd = '/synthetic/session-images';
const session = { cwd, id: 'images', name: 'Image fixture' }, model = { provider: 'fixture', id: 'vision', input: ['text', 'image'] };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
const imageUrl = key => `/api/pi/sessions/images/images/${key.repeat(64)}?${new URLSearchParams({ cwd })}`;
async function run(browser, origin, width) {
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width, height: 900 }, isMobile: width < 900, hasTouch: width < 900 });
    const page = await context.newPage(), errors = [], imageReads = [];
    page.on('pageerror', error => errors.push(error.message));
    let socket;
    const messages = [
        { role: 'user', timestamp: 1, content: [{ type: 'text', text: '查看这张图片' }, { type: 'image', mimeType: 'image/png', pivaneImageUrl: imageUrl('a') }] },
        { role: 'assistant', timestamp: 2, content: [{ type: 'toolCall', name: 'read', id: 'image-tool', arguments: { path: 'fixture.png' } }], stopReason: 'toolUse' },
        { role: 'toolResult', timestamp: 3, toolCallId: 'image-tool', toolName: 'read', content: [{ type: 'image', mimeType: 'image/png', pivaneImageUrl: imageUrl('b') }] },
        { role: 'assistant', timestamp: 4, content: [{ type: 'text', text: '图片已核对。' }], stopReason: 'stop' }
    ];
    await page.addInitScript(({ cwd, id }) => {
        localStorage.setItem('pi.web.cwd', cwd); localStorage.setItem(`pi.web.session:${cwd}`, id); localStorage.setItem('pi.web.transcriptMode', 'full');
    }, { cwd, id: session.id });
    await page.route('**/api/**', route => {
        const endpoint = new URL(route.request().url()).pathname;
        if (endpoint.includes('/images/')) { imageReads.push(endpoint); return route.fulfill({ contentType: 'image/png', body: png }); }
        let data = {};
        if (endpoint === '/api/pi/status') data = { ok: true, projectRoots: ['/synthetic'] };
        else if (endpoint === '/api/pi/projects') data = { projects: [{ cwd, name: 'Fixture', sessionCount: 1 }] };
        else if (endpoint === '/api/pi/sessions') data = { sessions: [session] };
        else if (endpoint === '/api/pi/activity') data = { runtimes: [], pinnedProjects: [], hiddenProjects: [], replyNotices: [] };
        else if (endpoint.includes('history') || endpoint === '/api/prompts') data = [];
        return route.fulfill({ json: data });
    });
    await page.routeWebSocket('**/api/pi/ws', ws => {
        socket = ws;
        ws.onMessage(raw => {
            const command = JSON.parse(raw), state = { model, isStreaming: false, thinkingLevel: 'off' }; let data = {};
            if (command.type === 'open_session') data = { session, state, messages: { messages }, models: { models: [model] }, stats: {}, thinkingLevels: { levels: ['off'] }, commands: { commands: [] } };
            else if (command.type === 'get_messages') data = { messages };
            else if (command.type === 'get_state') data = state;
            ws.send(JSON.stringify({ type: 'response', id: command.id, command: command.type, success: true, data }));
        });
    });
    try {
        await page.goto(origin, { waitUntil: 'networkidle' });
        await page.waitForSelector('.pi-message.user img');
        await page.locator('.pi-message.user img').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.querySelector('.pi-message.user img')?.naturalWidth > 0);
        assert.equal(imageReads.some(url => url.includes('b'.repeat(64))), false, 'collapsed tool images are not downloaded');
        await page.locator('[data-tool-id="image-tool"]').evaluate(el => { el.open = true; });
        await page.locator('[data-tool-id="image-tool"] img').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.querySelector('[data-tool-id="image-tool"] img')?.naturalWidth > 0);
        assert.ok(imageReads.some(url => url.includes('b'.repeat(64))));
        const live = { role: 'user', timestamp: 5, content: [{ type: 'text', text: '新引用图片' }, { type: 'text', text: '[图片已单独保存；Pivane 会在看图时自动读取]',
            pivaneImage: { version: 1, sha256: 'c'.repeat(64), bytes: png.length, image: { type: 'image', mimeType: 'image/png' } } }] };
        socket.send(JSON.stringify({ type: 'message_end', message: live }));
        await page.locator('.pi-message.user img').last().scrollIntoViewIfNeeded();
        await page.waitForFunction(() => [...document.querySelectorAll('.pi-message.user img')].at(-1)?.naturalWidth > 0);
        assert.ok(imageReads.some(url => url.includes('c'.repeat(64))));
        assert.ok(!await page.locator('#pi-transcript-content').textContent().then(value => value.includes('Pivane 会在看图')));
        assert.deepEqual(errors, []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.ok(await page.locator('.pi-message-image').evaluateAll(images => images.every(image => image.getBoundingClientRect().width <= innerWidth)));
        console.log(JSON.stringify({ width, status: 'passed', imageRequests: imageReads.length }));
    } finally { await context.close(); }
}
(async () => {
    const app = express();
    for (const [name, directory] of [['marked', 'marked/lib'], ['dompurify', 'dompurify/dist'], ['highlight', '@highlightjs/cdn-assets']]) app.use(`/vendor/${name}`, express.static(path.join(root, 'node_modules', directory)));
    app.use(express.static(path.join(root, 'public')));
    const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    try { for (const width of [1440, 393]) await run(browser, `http://127.0.0.1:${server.address().port}`, width); }
    finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
