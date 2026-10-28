const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
(async () => {
    const app = express(); app.use(express.json());
    app.use(express.static(path.join(root, 'public')));
    const ticket = '11111111-1111-4111-8111-111111111111';
    let mode, writes, state;
    app.get('/fixture', (_req, res) => res.type('html').send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/pi-updates.css"><style>:root{--line:#ddd;--surface-1:white;--text-muted:#555;--accent:blue}body{margin:8px}button{max-width:100%;white-space:normal}main{max-width:650px}</style><main><textarea id="draft">unsent draft</textarea><span id="attachment">notes.txt</span><div id="mount"></div></main><script src="/pi-i18n-catalog.js"></script><script src="/pi-i18n.js"></script><script src="/pi-application-update.js"></script>'));
    app.post('/api/pi/settings/updates/review', (_req, res) => { writes.push('review'); if (mode === 'busy') return res.status(409).json({ error: '实例仍有任务' }); res.json({ id: ticket, version: '1.11.0-rc.2' }); });
    app.post('/api/pi/settings/updates/execute', (req, res) => {
        writes.push('execute'); assert.deepEqual(req.body, { ticket, confirmed: true, draftsSaved: true, externalWritersStopped: true });
        state = { supported: true, appUpdateSupported: true, busy: true, job: { id: ticket, phase: 'installing', output: '<img src=x onerror=alert(1)>' } };
        // The request was accepted but its reply was lost. The client must inspect
        // this exact job, never send execute again.
        res.status(503).json({ error: 'Uncertain transport' });
    });
    app.get('/api/pi/settings/updates/maintenance', (_req, res) => res.json(state));
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    try {
        for (const width of [393, 1440]) for (const locale of ['zh-CN', 'en-US']) {
            mode = 'busy'; writes = []; state = { supported: true, appUpdateSupported: true, busy: false, idle: false };
            const context = await browser.newContext({ viewport: { width, height: 900 }, locale });
            const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
            await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
            await page.evaluate(() => {
                const apiFetch = async (url, options) => { const response = await fetch(url, options), data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error), { status: response.status }); return data; };
                window.updater = window.PiApplicationUpdate.create({ apiFetch });
                window.snapshot = { installMode: 'managed-bundle', appVersion: '1.11.0-rc.1', channel: 'preview', pivane: { status: 'available', version: '1.11.0-rc.2' } };
                document.getElementById('mount').append(window.updater.render(window.snapshot));
            });
            await page.locator('#updates-install-pivane').waitFor();
            assert.equal(await page.locator('#updates-install-pivane').isDisabled(), true, 'startup/other operations keep update disabled');
            state.idle = true;
            await page.locator('#updates-install-pivane:not([disabled])').waitFor();
            await page.locator('#updates-install-pivane').click(); await page.getByText('实例仍有任务', { exact: true }).waitFor(); assert.deepEqual(writes, ['review']);
            mode = 'ready'; await page.locator('#updates-install-pivane').click();
            await page.locator('#updates-confirm-install').waitFor(); assert.equal(await page.locator('#updates-confirm-install').isDisabled(), true);
            await page.locator('#updates-drafts-saved').check(); assert.equal(await page.locator('#updates-confirm-install').isDisabled(), true);
            await page.locator('#updates-writers-stopped').check();
            assert.equal(await page.locator('#updates-confirm-install').textContent(), locale === 'en-US' ? 'Update and restart' : '更新并重启');
            await page.locator('#updates-confirm-install').click();
            await page.locator('.updates-operation-output').waitFor({ state: 'attached' });
            await page.locator('.updates-application details summary').click();
            await page.locator('.updates-operation-output').waitFor(); assert.equal(await page.locator('.updates-operation-output img').count(), 0);
            await page.evaluate(() => { window.updater.close(); document.getElementById('mount').append(window.updater.render(window.snapshot)); });
            state = { ...state, busy: false, job: { ...state.job, phase: 'failed' } };
            await page.locator('#updates-install-pivane:not([disabled])').waitFor();
            assert.equal(writes.filter(write => write === 'execute').length, 1);
            assert.equal(await page.locator('#draft').inputValue(), 'unsent draft'); assert.equal(await page.locator('#attachment').textContent(), 'notes.txt');
            const overflow = await page.evaluate(() => [...document.querySelectorAll('main, .updates-application, .updates-application *')].filter(node => node.clientWidth && node.scrollWidth > node.clientWidth + 1).map(node => node.className || node.tagName));
            assert.deepEqual(overflow, []); assert.deepEqual(errors, []);
            console.log(JSON.stringify({ width, locale, executeCount: 1, uncertainSubmissionInspected: true, draftsPreserved: true }));
            await context.close();
        }
    } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
