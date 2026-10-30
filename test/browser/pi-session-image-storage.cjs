const assert = require('node:assert/strict');
const path = require('node:path'), http = require('node:http');
const { once } = require('node:events');
const express = require('express');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
async function run(browser, base, width) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 900, hasTouch: width < 900 });
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    let executed = 0, previews = 0, lose = true, action;
    await page.route('**/api/pi/**', route => {
        const req = route.request(), endpoint = new URL(req.url()).pathname, body = req.method() === 'POST' ? req.postDataJSON() : null;
        if (endpoint === '/api/pi/uploads/storage/usage') return route.fulfill({ json: { items: [], totalBytes: 0, count: 0, complete: true, limits: { bytes: 2 ** 31 } } });
        if (endpoint.endsWith('/usage')) return route.fulfill({ json: { complete: true, totalBytes: 3000, quarantineBytes: 4000,
            reclaimableCount: 2, reclaimableBytes: 2000, purgeableCount: 1, purgeableBytes: 1000, trash: [
                { id: 'a'.repeat(64), name: '<img src=x onerror=alert(1)>', createdAt: new Date().toISOString(), bytes: 1000, images: 1 }] } });
        if (endpoint.endsWith('/preview')) { previews++; action = body.action; return route.fulfill({ json: { ticket: 'image-ticket', revision: 'image-revision', action, count: 1, bytes: 1000 } }); }
        if (endpoint.endsWith('/cleanup')) {
            executed++; assert.equal(body.confirmed, true); assert.equal(body.externalWritersStopped, true); assert.equal(body.externalRestoreReviewed, true); assert.ok(body.requestId);
            return lose ? route.abort() : route.fulfill({ json: { state: 'completed', action } });
        }
        if (endpoint.includes('/status?') || endpoint.endsWith('/status')) return route.fulfill({ json: { state: 'completed', action } });
        throw Error('Unexpected endpoint ' + endpoint);
    });
    try {
        await page.goto(base);
        await page.evaluate(() => { window.manager = PiDocumentStorage.mount({ getContext: () => ({ cwd: '/synthetic' }), sessionImagesEnabled: () => true,
            request: async (endpoint, options) => {
                const response = await fetch('/api/pi' + endpoint, { method: options.method, signal: options.signal, headers: { 'Content-Type': 'application/json' }, body: options.body && JSON.stringify(options.body) });
                const result = await response.json(); if (!response.ok) throw Object.assign(Error(result.error), { status: response.status, code: result.code }); return result;
            } }); manager.open(); });
        await page.getByText('当前项目还没有已上传附件', { exact: true }).waitFor();
        const section = page.locator('[data-session-image-storage]');
        await section.getByRole('button', { name: '检查会话图片用量', exact: true }).click();
        await section.getByText('<img src=x onerror=alert(1)>', { exact: false }).waitFor(); assert.equal(await section.locator('img').count(), 0);
        await section.getByRole('button', { name: /隔离无引用图片/ }).click();
        const confirm = section.getByRole('button', { name: '确认执行图片清理', exact: true }); await confirm.waitFor(); assert.equal(await confirm.isDisabled(), true);
        await section.getByText('这些图片没有找到保存引用。隔离期间仍可供恢复的会话读取；至少保留 30 天，不会立即释放磁盘空间。', { exact: true }).waitFor();
        await section.getByRole('button', { name: '取消', exact: true }).click(); assert.equal(executed, 0);
        await section.getByRole('button', { name: '检查会话图片用量', exact: true }).click();
        await section.getByRole('button', { name: /隔离无引用图片/ }).click(); await section.getByRole('checkbox').check();
        await confirm.evaluate(node => { node.click(); node.click(); });
        await section.getByRole('button', { name: '查询图片清理结果', exact: true }).waitFor(); assert.equal(executed, 1);
        await section.getByRole('button', { name: '查询图片清理结果', exact: true }).click();
        await section.getByText('图片清理操作已完成。', { exact: true }).waitFor(); assert.equal(executed, 1);
        lose = false;
        await section.getByRole('button', { name: '检查会话图片用量', exact: true }).click();
        await section.getByRole('button', { name: '放弃该会话的图片恢复保护', exact: true }).click();
        await section.getByText('这会放弃已删除会话的图片恢复保护，不会删除其他仍在使用这些图片的会话。', { exact: true }).waitFor();
        assert.equal(await confirm.isDisabled(), true); await section.getByRole('checkbox').check(); await confirm.click();
        await section.getByText('图片清理操作已完成。隔离中的图片仍会保留，永久清理后才释放对应空间。', { exact: true }).waitFor(); assert.equal(action, 'release');
        await section.getByRole('button', { name: '检查会话图片用量', exact: true }).click();
        await section.getByRole('button', { name: /永久清理到期图片/ }).click();
        await section.getByText('这些图片已隔离至少 30 天。永久清理后，只有外部备份才能恢复图片。', { exact: true }).waitFor();
        await section.getByRole('checkbox').check();
        const geometry = await page.locator('.pi-document-storage').evaluate(node => ({ width: node.getBoundingClientRect().width, scroll: node.scrollWidth, client: node.clientWidth,
            inputs: [...node.querySelectorAll('input,button')].filter(input => parseFloat(getComputedStyle(input).fontSize) < 16).length,
            overflow: [...node.querySelectorAll('*')].filter(child => child.clientWidth && child.scrollWidth > child.clientWidth + 1).map(child => child.tagName) }));
        assert.ok(geometry.width <= width); assert.ok(geometry.scroll <= geometry.client + 1); assert.equal(geometry.inputs, 0); assert.deepEqual(geometry.overflow, []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []); assert.equal(executed, 2); assert.ok(previews >= 4);
        console.log(JSON.stringify({ width, passed: true, scenarios: ['quarantine', 'trash-release', 'purge-confirmation', 'duplicate-click', 'uncertain-status-only', 'safe-dom', '16px', 'no-overflow'] }));
    } finally { await context.close(); }
}
(async () => {
    const app = express(); app.get('/', (_req, res) => res.type('html').send('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/pi-native-controls.css"><script src="/pi-document-storage.js"></script>'));
    app.use(express.static(path.join(root, 'public')));
    const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    try { for (const width of [1440, 393, 320]) await run(browser, `http://127.0.0.1:${server.address().port}`, width); }
    finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
