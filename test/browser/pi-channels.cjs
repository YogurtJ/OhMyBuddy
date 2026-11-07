const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const server = http.createServer((req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/public/brand/fontawesome-6.4.0/css/all.min.css"><link rel="stylesheet" href="/public/pi-channels.css"><style>:root{--text-main:#25312c;--text-muted:#64706a;--surface-1:#fff;--surface-2:#edf4ed;--line:#c9d1ca;--accent:#137757}body{margin:0;font:16px sans-serif;background:var(--surface-2);color:var(--text-main)}.workspace-settings-content{padding:12px;box-sizing:border-box;max-width:100%}button{padding:10px}</style><main class="workspace-settings-content"></main><script src="/public/pi-channels.js"></script>'); }
    if (req.url.startsWith('/public/')) { const file = path.join(root, req.url); if (fs.existsSync(file) && fs.statSync(file).isFile()) { res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : req.url.endsWith('.js') ? 'text/javascript' : 'font/woff2'); return res.end(fs.readFileSync(file)); } }
    res.writeHead(404); res.end();
});
(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    try {
        for (const width of [1440, 393, 320]) {
            const page = await browser.newPage({ viewport: { width, height: 900 } }), errors = [];
            page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
            await page.goto(`http://127.0.0.1:${server.address().port}`);
            if (width === 393) await page.evaluate(() => { for (const [key, value] of Object.entries({ '--text-main': '#e3e9e5', '--text-muted': '#a8b6ae', '--surface-1': '#18241e', '--surface-2': '#101b15', '--line': '#3b5044', '--accent': '#77c69a' })) document.documentElement.style.setProperty(key, value); });
            await page.evaluate(() => {
                window.PiI18n = { locale: 'en' }; window.writes = []; window.failure = false;
                window.data = { revision: 'r1', component: { installed: false }, accounts: [], bindings: [], peers: [], jobs: [], login: null };
                window.host = { currentCwd: () => '/fixture', apiFetch: async (url, options) => {
                    if (options) {
                        const body = JSON.parse(options.body); writes.push(body); if (failure) throw Error('uncertain');
                        if (body.action === 'install') data.component = { installed: true, version: '2.4.10' };
                        if (body.action === 'login') data.login = { id: 'qr-one', status: 'wait', matrix: [[true, false], [false, true]], expiresAt: Date.now() + 60000 };
                        if (body.action === 'cancel-login') data.login = null;
                        if (body.action === 'bind') data.bindings = [{ ...body, id: 'binding', name: 'Chosen thread' }];
                        if (body.action === 'account') Object.assign(data.accounts[0], body);
                        return structuredClone(data);
                    }
                    if (url === '/api/pi/projects') return { projects: [{ cwd: '/fixture', name: 'Fixture' }, { cwd: '/other', name: 'Other' }, { cwd: '/removed', name: 'Removed', sessionCount: 0 }], hiddenProjects: ['/removed'] };
                    if (url === '/api/pi/bots') return { bots: window.botsList || [] };
                    if (url.startsWith('/api/pi/sessions')) return { sessions: [{ id: 'thread-one', name: 'Thread one' }, { id: 'thread-two', name: 'Thread two' }] };
                    if (window.delayedRead) return new Promise(resolve => { window.resolveRead = resolve; });
                    return structuredClone(data);
                } };
                window.panel = PiChannels.create(host); document.querySelector('main').append(panel.root); panel.setTarget({ cwd: '/fixture', sessionId: 'thread-two' }); panel.open();
            });
            await page.getByRole('button', { name: 'Install WeChat connector', exact: true }).waitFor();
            assert.equal(await page.evaluate(() => writes.length), 0);
            assert.equal(await page.locator('select[aria-label="Thread"]').inputValue(), 'thread-two');
            assert.deepEqual(await page.locator('select[aria-label="Project or Buddy"] option').evaluateAll(options => options.map(o => o.value)), ['/fixture', '/other'], 'removed projects stay out of channel binding selectors');
            const headingOverlap = () => page.evaluate(() => {
                const a = document.querySelector('.channel-header .channel-icon-button').getBoundingClientRect();
                return [...document.querySelectorAll('.channel-feedback, .channel-card, .channel-overview')].filter(n => n.getClientRects().length)
                    .some(n => { const b = n.getBoundingClientRect(); return a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right; });
            });
            assert.equal(await headingOverlap(), false, 'the refresh control stays inside the page heading');
            await page.getByRole('button', { name: 'Install WeChat connector', exact: true }).click();
            assert.equal(await page.locator('.channel-step[data-state="current"] button').textContent(), 'Connect with QR code', 'the setup guide carries the next action');
            await page.getByRole('button', { name: 'Connect with QR code', exact: true }).click();
            await page.getByRole('img', { name: 'Scan with WeChat to connect' }).waitFor();
            assert.equal(await page.locator('img').count(), 0, 'QR payload is rendered locally, not requested from an external image origin');
            await page.evaluate(() => { data.login = null; data.accounts = [{ id: '<script>bot</script>', userId: 'owner', enabled: true, allowedUsers: ['owner'], connection: 'connected' }]; data.peers = [{ peerId: 'owner' }]; });
            await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
            const addUser = page.getByRole('textbox', { name: 'Add allowed WeChat user ID', exact: true });
            await addUser.waitFor();
            assert.equal(await headingOverlap(), false);
            assert.deepEqual(await page.locator('select[aria-label="WeChat user"] option').evaluateAll(options => options.map(o => o.value)), ['owner'], 'binding only offers saved allowed users');
            assert.equal(await page.getByRole('button', { name: 'Uninstall connector', exact: true }).isVisible(), false, 'destructive connector actions stay in the overflow menu');
            assert.equal(await page.getByRole('button', { name: 'Save allowed users', exact: true }).isVisible(), false, 'the save bar appears only for unsaved changes');
            await page.getByRole('button', { name: 'Go to binding', exact: true }).click();
            assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'WeChat user');
            await page.getByRole('button', { name: 'Bind thread', exact: true }).click();
            assert.equal(await page.evaluate(() => writes.at(-1).sessionId), 'thread-two');
            assert.equal(await page.evaluate(() => writes.at(-1).peerId), 'owner');
            assert.equal(await page.evaluate(() => writes.at(-1).expectedRevision), 'r1');
            assert.equal(await page.evaluate(() => writes.at(-1).replyMode), 'all');
            await page.getByRole('button', { name: 'Receive settings', exact: true }).click();
            assert.equal(await page.getByLabel('Receive', { exact: true }).inputValue(), 'all');
            await page.getByLabel('Receive', { exact: true }).selectOption('wechat');
            await page.getByRole('button', { name: 'Bind thread', exact: true }).click();
            assert.equal(await page.evaluate(() => writes.at(-1).replyMode), 'wechat');
            await page.getByText('WeChat replies only', { exact: true }).waitFor();
            await page.locator('.channel-ready').waitFor();
            const chips = () => page.locator('.channel-chip-name').allTextContents();
            await addUser.fill('other');
            await addUser.press('Enter');
            assert.deepEqual(await chips(), ['owner', 'other']);
            assert.equal(await page.getByRole('button', { name: 'Save allowed users', exact: true }).isVisible(), true);
            await addUser.fill('typed-but-not-added');
            await page.evaluate(() => { data.accounts[0].connection = 'error'; });
            await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
            await page.locator('.channel-account-card .channel-badge[data-kind="error"]').waitFor();
            assert.deepEqual(await chips(), ['owner', 'other'], 'connection refresh preserves drafts');
            assert.equal(await addUser.inputValue(), 'typed-but-not-added', 'rebuilding the card keeps the pending input');
            await addUser.fill('');
            await page.evaluate(() => { failure = true; });
            await page.getByRole('button', { name: 'Save allowed users', exact: true }).click();
            await page.getByRole('status').filter({ hasText: 'needs review' }).waitFor();
            const writes = await page.evaluate(() => window.writes.length);
            assert.equal(await page.getByRole('button', { name: 'Save allowed users', exact: true }).isDisabled(), true);
            await page.waitForTimeout(1500);
            assert.equal(await page.evaluate(() => window.writes.length), writes, 'failed writes are not replayed');
            assert.equal(await page.getByRole('button', { name: 'Save allowed users', exact: true }).isDisabled(), true, 'background reads do not reenable uncertain writes');
            await page.evaluate(() => { failure = false; });
            await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
            assert.equal(await page.getByRole('button', { name: 'Save allowed users', exact: true }).isDisabled(), false);
            await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
            assert.deepEqual(await chips(), ['owner']);
            assert.equal(await page.getByRole('button', { name: 'Save allowed users', exact: true }).isVisible(), false);
            await page.getByRole('button', { name: 'Remove owner', exact: true }).click();
            assert.equal(await page.getByRole('button', { name: 'Save allowed users', exact: true }).isDisabled(), true, 'an enabled account cannot save an empty allow list');
            await page.getByRole('button', { name: 'Allow owner', exact: true }).click();
            assert.equal(await page.getByRole('button', { name: 'Save allowed users', exact: true }).isVisible(), false, 'restoring the saved list clears the draft');
            await page.evaluate(() => {
                data.jobs = Array.from({ length: 12 }, (_, i) => ({ id: 'job-' + i, peerId: 'wechat-user-with-a-long-identifier@im.wechat', at: Date.UTC(2026, 9, 20, 8, 30 - i), status: i === 5 ? 'uncertain' : i === 0 ? 'running' : 'delivered', sentChunks: i === 0 ? 0 : 2, sentMedia: i === 1 ? 1 : 0, canRecover: i === 5, kind: i === 2 ? 'cron' : i === 3 ? 'thread' : undefined }));
            });
            await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
            assert.equal(await page.locator('.channel-job').count(), 5);
            await page.getByText('Thread final result', { exact: true }).waitFor();
            assert.equal(await page.getByRole('button', { name: 'Previous', exact: true }).isDisabled(), true);
            const beforePaging = await page.evaluate(() => writes.length);
            await page.getByRole('button', { name: 'Next', exact: true }).click();
            assert.equal(await page.locator('.channel-job').first().getAttribute('data-job-id'), 'job-5');
            await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
            assert.equal(await page.locator('.channel-job').first().getAttribute('data-job-id'), 'job-5', 'polling keeps the current page');
            await page.getByRole('button', { name: 'Next', exact: true }).click();
            assert.equal(await page.locator('.channel-job').count(), 2);
            assert.equal(await page.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
            assert.equal(await page.evaluate(() => writes.length), beforePaging, 'paging is read-only');
            await page.getByRole('button', { name: 'Previous', exact: true }).click();
            await page.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
            assert.equal(await page.evaluate(() => writes.at(-1).jobId), 'job-5', 'actions target the visible record');
            await page.getByRole('button', { name: 'Previous', exact: true }).click();
            await page.evaluate(() => { window.preservedRow = document.querySelector('.channel-job'); });
            await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
            assert.equal(await page.evaluate(() => preservedRow === document.querySelector('.channel-job')), true, 'unchanged records do not lose focus on refresh');
            const overflow = await page.evaluate(() => [...document.querySelectorAll('input,select,textarea,button,canvas,.channel-card')].filter(n => n.getBoundingClientRect().right > innerWidth + 1).map(n => n.outerHTML));
            assert.deepEqual(overflow, []);
            assert.equal(await page.getByLabel('WeChat user', { exact: true }).evaluate(n => getComputedStyle(n).fontSize), '16px');
            assert.equal(await addUser.evaluate(n => getComputedStyle(n).fontSize), '16px');
            if (process.env.PIVANE_TEST_SCREENSHOT_DIR) {
                fs.mkdirSync(process.env.PIVANE_TEST_SCREENSHOT_DIR, { recursive: true });
                await page.screenshot({ path: path.join(process.env.PIVANE_TEST_SCREENSHOT_DIR, `channels-${width}.png`), fullPage: true });
            }
            await page.locator('[data-job-filter="attention"]').click();
            assert.deepEqual(await page.locator('.channel-job').evaluateAll(rows => rows.map(r => r.dataset.jobId)), ['job-5'], 'the attention filter lists records that need a person');
            assert.equal(await page.locator('.channel-job[data-attention="true"]').count(), 1);
            await page.locator('[data-job-filter="active"]').click();
            assert.deepEqual(await page.locator('.channel-job').evaluateAll(rows => rows.map(r => r.dataset.jobId)), ['job-0']);
            await page.locator('[data-job-filter="all"]').click();
            assert.equal(await page.locator('.channel-job').count(), 5);
            assert.equal(await page.evaluate(() => writes.length), beforePaging + 1, 'filters are read-only');
            await page.getByRole('button', { name: 'Next', exact: true }).click();
            await page.evaluate(() => { data.jobs = data.jobs.slice(0, 2); });
            await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
            assert.equal(await page.locator('.channel-job').count(), 2);
            assert.equal(await page.locator('.channel-job').first().getAttribute('data-job-id'), 'job-0', 'shrinking snapshots clamp the page');
            assert.equal(await page.getByRole('button', { name: 'Next', exact: true }).isVisible(), false);
            await page.evaluate(() => { data.jobs = []; });
            await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
            assert.equal(await page.locator('.channel-job').count(), 0);
            assert.equal(await page.locator('.channel-jobs-card .channel-empty-note').isVisible(), true);
            await page.evaluate(() => {
                data.typing = [{ accountId: data.accounts[0].id, peerId: 'owner', status: 'degraded', failures: 2, reason: 'typing-failed' }];
                data.jobs = [{ id: 'partial-fixture', kind: 'cron', accountId: data.accounts[0].id, peerId: 'owner', status: 'partial', at: Date.now(), reason: 'attachments-incomplete', sentChunks: 1, sentMedia: 1, deliveryIssues: [{ name: '<img src=x onerror=alert(1)>.pdf', reason: 'size' }] }];
            });
            await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
            await page.getByText('Partially delivered', { exact: true }).waitFor();
            await page.getByText('Typing feedback is unavailable.', { exact: false }).waitFor();
            assert.match(await page.locator('.channel-job').innerText(), /Exceeds 16 MiB/);
            assert.equal(await page.locator('[onerror]').count(), 0, 'diagnostic file names use safe text');
            const diagnosticOverflow = await page.evaluate(() => [...document.querySelectorAll('.channel-job,.channel-inline-alert')].some(n => n.getBoundingClientRect().right > innerWidth + 1));
            assert.equal(diagnosticOverflow, false);
            await page.evaluate(() => {
                data.jobs = [
                    { id: 'unconfirmed-delivery', status: 'uncertain', kind: 'cron', at: Date.now(), reason: 'execution-or-delivery-uncertain', blocksFollowing: false, sentChunks: 1 },
                    { id: 'blocked-execution', status: 'uncertain', at: Date.now(), blocksFollowing: true, canRecover: true },
                    { id: 'expired-login', status: 'failed', at: Date.now(), reason: 'wechat-login-expired', blocksFollowing: false, platformCode: -14 },
                    { id: 'retrying-delivery', status: 'sending', at: Date.now(), reason: 'delivery-retrying', blocksFollowing: false },
                    { id: 'context-wait', status: 'ready', kind: 'cron', at: Date.now(), reason: 'reply-context-expired', blocksFollowing: false, platformCode: -2 },
                    { id: 'startup-skipped', status: 'cancelled', kind: 'notice', startupNotice: true, at: Date.now(), reason: 'reply-context-expired', blocksFollowing: false, platformCode: -2 }
                ];
            });
            await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
            const unconfirmed = page.locator('[data-job-id="unconfirmed-delivery"]');
            assert.match(await unconfirmed.innerText(), /Delivery unconfirmed/);
            assert.match(await unconfirmed.innerText(), /No manual release is needed/);
            assert.equal(await unconfirmed.getByRole('button', { name: 'Check and send native reply' }).count(), 0);
            assert.match(await page.locator('[data-job-id="blocked-execution"]').innerText(), /Task execution is unresolved/);
            assert.match(await page.locator('[data-job-id="expired-login"]').innerText(), /WeChat credentials expired/);
            assert.match(await page.locator('[data-job-id="expired-login"]').innerText(), /WeChat response code: -14/);
            assert.match(await page.locator('[data-job-id="retrying-delivery"]').innerText(), /Automatically retrying/);
            const contextWait = page.locator('[data-job-id="context-wait"]');
            assert.match(await contextWait.innerText(), /Waiting for WeChat/);
            assert.match(await contextWait.innerText(), /Send any WeChat message.*no manual release is needed/);
            assert.equal(await contextWait.getByRole('button', { name: 'Mark reviewed' }).count(), 1, 'review stays optional for an undelivered result');
            assert.match(await page.locator('[data-job-id="blocked-execution"]').innerText(), /at most 5 minutes/);
            await page.locator('[data-job-filter="attention"]').click();
            assert.equal(await page.locator('.channel-job').count(), 4, 'silently skipped startup notices do not count as issues');
            await page.locator('[data-job-filter="all"]').click();
            await page.getByRole('button', { name: 'Next', exact: true }).click();
            assert.match(await page.locator('[data-job-id="startup-skipped"]').innerText(), /silently skipped and will not be sent later/);
            await page.getByRole('button', { name: 'Previous', exact: true }).click();
            const deliveryOverflow = await page.evaluate(() => [...document.querySelectorAll('.channel-job,.channel-job-reason')].some(n => n.getBoundingClientRect().right > innerWidth + 1));
            assert.equal(deliveryOverflow, false);
            // Bot chats (M4-4): Bots are targets in the project select; a Bot binding names the Bot and offers per-Bot disconnects.
            const fox = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
            await page.evaluate(({ fox, other }) => {
                window.botsList = [{ id: fox, name: 'Fox', enabled: true }, { id: other, name: 'Owl', enabled: true }];
                data.bindings = [{ id: 'bb', accountId: data.accounts[0].id, peerId: data.accounts[0].allowedUsers[0], cwd: '/w', sessionId: 's', name: 'Fox', replyMode: 'all',
                    bot: { profileId: fox, windowId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', main: true }, bots: [other, fox] }];
                panel.close(); panel.open();
            }, { fox, other });
            const botRow = page.locator(`[data-bot-binding="${fox}"]`);
            await botRow.waitFor();
            assert.match(await botRow.innerText(), /Fox/); assert.match(await botRow.innerText(), /also connected: Owl/);
            assert.equal(await botRow.getByRole('button', { name: 'Open Buddy' }).isVisible(), true);
            const targets = await page.locator('select[aria-label="Project or Buddy"] option').evaluateAll(options => options.map(o => o.value));
            assert.deepEqual(targets.slice(0, 2), [`bot:${fox}`, `bot:${other}`]);
            await page.locator('select[aria-label="Project or Buddy"]').selectOption(`bot:${other}`);
            assert.equal(await page.locator('select[aria-label="Thread"]').isVisible(), false, 'a Bot has no thread to choose');
            await page.getByRole('button', { name: 'Connect Buddy', exact: true }).click();
            await page.waitForFunction(() => writes.at(-1)?.action === 'bind');
            assert.equal(await page.evaluate(() => writes.at(-1).botProfileId), other);
            assert.equal(await page.evaluate(() => 'cwd' in writes.at(-1) || 'sessionId' in writes.at(-1)), false);
            await page.evaluate(({ fox, other }) => { data.bindings = [{ id: 'bb', accountId: data.accounts[0].id, peerId: data.accounts[0].allowedUsers[0], cwd: '/w', sessionId: 's', name: 'Fox', replyMode: 'all',
                bot: { profileId: fox, windowId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', main: true }, bots: [other, fox] }]; }, { fox, other });
            await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
            await botRow.waitFor();
            await botRow.locator('.channel-menu summary').click();
            await botRow.getByRole('button', { name: 'Disable startup notice' }).click();
            await page.waitForFunction(() => writes.at(-1)?.action === 'startup-notice');
            assert.deepEqual(await page.evaluate(() => [writes.at(-1).bindingId, writes.at(-1).startupNotice]), ['bb', false]);
            await botRow.locator('.channel-menu summary').click();
            await botRow.getByRole('button', { name: 'Disconnect Owl' }).click();
            await page.waitForFunction(() => writes.at(-1)?.action === 'unbind-bot');
            assert.deepEqual(await page.evaluate(() => [writes.at(-1).botProfileId, 'botName' in writes.at(-1)]), [other, false]);
            const botOverflow = await page.evaluate(() => [...document.querySelectorAll('.channel-binding')].some(n => n.getBoundingClientRect().right > innerWidth + 1));
            assert.equal(botOverflow, false);
            await page.evaluate(() => { delayedRead = true; });
            await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
            await page.waitForFunction(() => typeof resolveRead === 'function');
            await page.evaluate(() => { panel.close(); resolveRead({ ...data, login: { id: 'late', status: 'wait', matrix: [[true]] } }); });
            await page.waitForTimeout(30);
            assert.equal(await page.locator('canvas').count(), 0, 'late QR response is discarded on close');
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('Messaging channels: desktop/mobile, optional install, QR, binding, drafts, uncertain writes, late responses and widths passed');
    } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
