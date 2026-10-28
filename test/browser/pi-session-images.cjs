const assert = require('node:assert/strict');
const path = require('node:path'), http = require('node:http');
const { createHash } = require('node:crypto');
const { displayMessages } = require('../../server/pi-session-images-routes');
const { runtimeMessage } = require('../../server/pi-session-image-context');
const { MARKER } = require('../../server/pi-session-images');
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
    let socket, echoMode = 'runtime', heldReply, heldEcho, promptReceived;
    const prompts = [];
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
            else if (command.type === 'prompt') {
                prompts.push(command);
                // Pi may resize prompt images and append dimension notes before message_start;
                // message_end then carries runtime references, A2 blocks or display URLs.
                const inline = { role: 'user', timestamp: 10 + prompts.length,
                    content: [{ type: 'text', text: command.message + '\n\n[Image: original 2400x1600, displayed at 2000x1333. Multiply coordinates by 1.20 to map to original image.]' },
                        ...command.images.map(() => ({ type: 'image', mimeType: 'image/png', data: png.toString('base64') }))] };
                const reference = { ...inline, content: inline.content.map(block => block.type === 'image' ? { type: 'text', text: MARKER,
                    pivaneImage: { version: 1, sha256: createHash('sha256').update(png).digest('hex'), bytes: png.length,
                        image: { type: 'image', mimeType: 'image/png' } } } : block) };
                const message = echoMode === 'runtime' ? runtimeMessage(reference) : echoMode === 'a2' ? reference
                    : echoMode === 'url' ? displayMessages([reference], cwd, session.id)[0] : inline;
                heldEcho = () => {
                    ws.send(JSON.stringify({ type: 'message_start', message: inline }));
                    for (let i = 0; i < 2; i++) ws.send(JSON.stringify({ type: 'message_end', message }));
                    messages.push(message);
                };
                heldReply = () => ws.send(JSON.stringify({ type: 'response', id: command.id, command: command.type, success: true, data: {} }));
                promptReceived();
                return;
            }
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
        const upload = await page.evaluate(() => {
            const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 1600;
            canvas.getContext('2d').fillRect(0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/png').split(',')[1];
        });
        const input = page.locator('#pi-input'), text = '文字与两张图片只显示一次';
        let expected = 0;
        for (const mode of ['runtime', 'runtime', 'a2', 'url', 'inline']) {
            echoMode = mode; heldReply = null;
            const received = new Promise(resolve => { promptReceived = resolve; });
            await input.fill(text);
            await page.locator('#pi-file-input').setInputFiles([1, 2].map(index => ({ name: `large-${index}.png`, mimeType: 'image/png', buffer: Buffer.from(upload, 'base64') })));
            await page.waitForFunction(() => document.querySelectorAll('#pi-attachments .pi-attachment-chip').length === 2 && document.querySelector('#pi-attachments').getAttribute('aria-busy') === 'false');
            await input.press('Enter'); expected++;
            await received;
            await page.waitForFunction(() => document.querySelector('#pi-send-button').disabled);
            assert.equal(await page.locator('article.user').filter({ hasText: text }).count(), expected - 1, 'image messages wait for the authoritative native echo');
            assert.equal(await page.locator('#pi-attachments .pi-attachment-chip').count(), 2, 'previews remain while the send is pending');
            await page.waitForFunction(() => document.querySelector('#pi-transcript-activity .pi-activity-live')?.dataset.phase === 'sending');
            heldEcho();
            await page.locator('article.user:not(.optimistic)').filter({ hasText: text }).nth(expected - 1).waitFor();
            assert.equal(prompts.length, expected, 'one prompt per explicit send');
            assert.equal(prompts.at(-1).images.length, 2);
            assert.equal(await page.locator('article.user').filter({ hasText: text }).count(), expected, `${mode}: native echo and pending send share one visible message`);
            assert.equal(await page.locator('article.user.optimistic').filter({ hasText: text }).count(), 0);
            assert.equal(await page.locator('article.user').filter({ hasText: text }).last().locator('img').count(), 2);
            await input.press('Enter');
            assert.equal(prompts.length, expected, 'submission stays locked while acknowledgement is pending');
            heldReply();
            await page.waitForFunction(() => document.querySelector('#pi-input').value === '' && !document.querySelectorAll('#pi-attachments .pi-attachment-chip').length);
            assert.equal(await page.locator('article.user').filter({ hasText: text }).count(), expected, 'explicitly resending identical content remains a separate message');
        }
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
