// Real isolated gateway + native RPC; no production identity or model credentials.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repository = path.resolve(__dirname, '../..');
const { createPiAgentGateway } = require('../../server/pi-agent-routes');
const { WorkspaceAccessService } = require('../../server/workspace-access-service');

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    try {
        for (const width of [1440, 393, 320]) {
            const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-first-use-')));
            const agent = path.join(root, 'agent'), project = path.join(root, 'project');
            fs.mkdirSync(agent); fs.mkdirSync(project);
            Object.assign(process.env, { PI_CODING_AGENT_DIR: agent, PI_PROJECT_ROOTS: root, PI_OFFLINE: '1',
                PI_WEB_DEFERRED_FILE: path.join(root, 'deferred.json'), OHMYBUDDY_WORKSPACES_DIR: path.join(root, 'workspaces') });
            const access = new WorkspaceAccessService({ filePath: path.join(root, 'access.json'), envToken: () => '' });
            const pickerResults = [null, project];
            const gateway = createPiAgentGateway({ accessService: access, deferredFilePath: path.join(root, 'deferred.json'),
                directoryPickerOptions: { command: () => ({ command: 'synthetic', args: [] }), run: async () => pickerResults.shift() } });
            const app = require('express')(); app.use(require('express').json()); gateway.mount(app);
            for (const [route, directory] of [['marked', 'marked/lib'], ['dompurify', 'dompurify/dist'], ['highlight', '@highlightjs/cdn-assets']])
                app.use('/vendor/' + route, require('express').static(path.join(repository, 'node_modules', directory)));
            app.use(require('express').static(path.join(repository, 'public')));
            const server = require('node:http').createServer(app), wss = gateway.attachWebSocket(server);
            server.listen(0, '127.0.0.1'); await once(server, 'listening');
            const base = `http://127.0.0.1:${server.address().port}`;
            const context = await browser.newContext({ locale: 'zh-CN', viewport: { width, height: 1000 } });
            try {
                const page = await context.newPage(), errors = [], creates = [];
                page.on('pageerror', error => errors.push(error.message));
                page.on('request', request => {
                    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/pi/sessions') creates.push(request.postDataJSON());
                });
                // Keep the test independent of external fonts and remote catalog endpoints.
                await page.route('https://**', route => route.abort());
                await page.goto(base, { waitUntil: 'domcontentloaded' });
                await page.getByRole('button', { name: '新建任务', exact: true }).waitFor();
                await page.locator('.pv-boot').waitFor({ state: 'hidden' });
                assert.equal(await page.locator('#pi-connection-text').textContent(), '等待会话');
                assert.equal(await page.locator('#pi-project-dialog').isVisible(), false);
                assert.equal(fs.existsSync(gateway.store.standaloneRoot()), false);
                await page.screenshot({ path: path.join(os.tmpdir(), `omb-first-use-${width}.png`) });
                await page.getByRole('button', { name: '新建任务', exact: true }).click();
                await page.waitForFunction(() => !document.querySelector('#pi-model-guidance').hidden);
                await page.waitForFunction(() => document.querySelector('#pi-model-guidance-text').textContent.includes('还没有可用'));
                assert.equal(await page.locator('#pi-model-choose').isVisible(), false);
                assert.equal(await page.locator('#pi-model-refresh').isVisible(), false);
                assert.equal(await page.locator('#pi-model-setup').isVisible(), true);
                assert.doesNotMatch(await page.locator('#pi-model-select').textContent(), /unknown/);
                assert.doesNotMatch(await page.locator('#pi-mobile-composer-model').textContent(), /unknown/);
                const first = await page.evaluate(() => localStorage.getItem('pi.web.cwd'));
                assert.equal(path.dirname(first), gateway.store.standaloneRoot());
                fs.writeFileSync(path.join(first, 'retained.txt'), 'persistent task output');
                await page.locator('#pi-input').fill('未配置模型时保留草稿');
                await page.locator('#pi-send-button').click();
                assert.equal(await page.locator('#pi-input').inputValue(), '未配置模型时保留草稿');
                await page.locator('#pi-model-setup').click();
                await page.locator('[data-settings-panel=providers].active').waitFor();
                await page.locator('#workspace-settings-close').click();
                await page.screenshot({ path: path.join(os.tmpdir(), `omb-model-setup-${width}.png`) });
                await page.reload({ waitUntil: 'domcontentloaded' });
                await page.waitForFunction(() => !document.querySelector('#pi-model-guidance').hidden);
                assert.equal(await page.evaluate(() => localStorage.getItem('pi.web.cwd')), first);
                assert.equal(fs.readFileSync(path.join(first, 'retained.txt'), 'utf8'), 'persistent task output');
                const openPicker = () => page.locator(width <= 680 ? '#pi-mobile-summary' : '#pi-project-button').click();
                if (width <= 680) await page.locator('#pi-toggle-sessions').click();
                await page.locator('[data-standalone-create]').click();
                await page.waitForFunction(previous => localStorage.getItem('pi.web.cwd') !== previous, first);
                await page.waitForFunction(() => !document.querySelector('#pi-model-guidance').hidden);
                const second = await page.evaluate(() => localStorage.getItem('pi.web.cwd'));
                assert.notEqual(first, second);
                if (width <= 680) await page.locator('#pi-toggle-sessions').click();
                assert.equal(await page.locator('.pi-standalone-group .pi-session-item').count(), 2);
                assert.equal(await page.locator('.pi-project-group').count(), 0, 'independent directories must not appear as individual projects');
                await page.screenshot({ path: path.join(os.tmpdir(), `omb-tasks-projects-${width}.png`) });
                if (width <= 680) await page.locator('#pi-toggle-sessions').click();
                await openPicker();
                assert.equal(await page.locator('#pi-start-standalone, #pi-project-locations').count(), 0);
                await page.locator('#pi-project-input').fill(root);
                await page.locator('#pi-project-form [type=submit]').click();
                await page.waitForFunction(value => document.querySelector('#pi-directory-current [aria-current]')?.title === value, root);
                await page.locator('#pi-directory-filter').fill('PROJ');
                await page.waitForFunction(() => document.querySelectorAll('#pi-directory-list [data-path]').length === 1);
                await page.locator('#pi-directory-list [data-path=' + JSON.stringify(project) + ']').click();
                await page.waitForFunction(value => document.querySelector('#pi-directory-current [aria-current]')?.title === value, project);
                await page.locator('#pi-directory-current [data-browse-path=' + JSON.stringify(root) + ']').click();
                await page.waitForFunction(value => document.querySelector('#pi-project-input').value === value, root);
                await page.locator('#pi-directory-list [data-path=' + JSON.stringify(project) + ']').click();
                await page.waitForFunction(value => document.querySelector('#pi-directory-current [aria-current]')?.title === value, project);
                for (const selector of ['body', '#pi-project-dialog .project-dialog', '#pi-project-form', '#pi-directory-list', '#pi-model-guidance']) {
                    const m = await page.locator(selector).evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth }));
                    assert.ok(m.scroll <= m.width + 1, selector + JSON.stringify(m));
                }
                await page.setViewportSize({ width, height: 500 });
                await page.addStyleTag({ content: 'html { font-size: 24px !important; }' });
                const bounds = await page.locator('#pi-directory-select').evaluate(button => {
                    const b = button.getBoundingClientRect(), d = button.closest('.project-dialog').getBoundingClientRect();
                    return { top: b.top, bottom: b.bottom, dialogBottom: d.bottom, height: innerHeight };
                });
                assert(bounds.top >= 0 && bounds.bottom <= bounds.dialogBottom + 1 && bounds.bottom <= bounds.height, JSON.stringify(bounds));
                await page.screenshot({ path: path.join(os.tmpdir(), `omb-folder-picker-compact-${width}.png`) });
                await page.setViewportSize({ width, height: 1000 });
                await page.addStyleTag({ content: 'html { font-size: 16px !important; }' });
                await page.screenshot({ path: path.join(os.tmpdir(), `omb-directory-picker-${width}.png`) });
                await page.locator('#pi-project-input').fill(project + '-unvalidated');
                assert.equal(await page.locator('#pi-directory-select').isDisabled(), true);
                await page.locator('#pi-project-input').fill(project);
                assert.equal(await page.locator('#pi-directory-select').isEnabled(), true);
                await page.locator('#pi-directory-select').click();
                await page.waitForFunction(value => localStorage.getItem('pi.web.cwd') === value, project);
                await page.waitForFunction(() => !document.querySelector('#pi-model-guidance').hidden);
                await openPicker();
                await page.locator('#pi-native-directory-picker').click();
                await page.waitForFunction(() => !document.querySelector('#pi-native-directory-picker').disabled);
                assert.equal(await page.locator('#pi-project-dialog').isVisible(), true, 'native cancellation preserves the browser picker');
                const nativeCreated = page.waitForResponse(response => new URL(response.url()).pathname === '/api/pi/sessions' && response.request().method() === 'POST' && response.status() === 201);
                await page.locator('#pi-native-directory-picker').click();
                const nativeSession = await (await nativeCreated).json();
                await page.waitForFunction(id => Boolean(document.querySelector('.pi-session-item.active[data-session-id="' + id + '"]')), nativeSession.id);
                await page.locator('#pi-project-dialog').waitFor({ state: 'hidden' });
                await page.waitForFunction(() => !document.querySelector('#pi-model-guidance').hidden);
                assert.deepEqual(creates, [{ standalone: true, profileId: null }, { standalone: true, profileId: null }, { cwd: project, profileId: null }, { cwd: project, profileId: null }]);
                assert.equal((await gateway.store.listSessions(project)).length, 2);
                if (width === 1440) {
                    const catalog = await (await page.request.get(base + '/api/pi/bots')).json();
                    const response = await page.request.post(base + '/api/pi/bots', { data: { expectedRevision: catalog.revision, language: 'en' } });
                    const created = await response.json(); assert.equal(response.status(), 200, JSON.stringify(created));
                    const target = { profileId: created.bot.id, windowId: created.window.id };
                    await page.evaluate(target => window.PiWorkspaceRoute.navigate('bot', target), target);
                    await page.waitForFunction(() => document.querySelector('#chat-tab').classList.contains('pi-bot-mode') && !document.querySelector('#pi-input').disabled);
                    await page.locator('#pi-input').fill('Retain the Buddy draft');
                    await page.evaluate(() => window.dispatchEvent(new CustomEvent('pi:extension-assistant', { detail: { need: 'Check this Buddy capability' } })));
                    const helperCreated = page.waitForResponse(response => new URL(response.url()).pathname === '/api/pi/extension-assistant/sessions' && response.status() === 201);
                    await page.locator('#pi-extension-assistant-create').click();
                    const helper = await (await helperCreated).json();
                    assert.equal(helper.assistant.ownerProfileId, target.profileId);
                    assert.deepEqual(helper.assistant.returnBotWindow, target);
                    assert.equal(helper.cwd, path.join(root, 'workspaces', 'bots', 'bot-' + target.profileId));
                    await page.waitForFunction(() => !document.querySelector('#chat-tab').classList.contains('pi-bot-mode') && document.querySelector('#pi-input').value === 'Check this Buddy capability');
                    await page.locator('#pi-extension-assistant-return').click();
                    await page.waitForFunction(() => document.querySelector('#chat-tab').classList.contains('pi-bot-mode') && document.querySelector('#pi-input').value === 'Retain the Buddy draft');
                }
                assert.deepEqual(errors, []);
                console.log(JSON.stringify({ width, nativeRpc: true, noProjectRequired: true, separateDirectories: true, reloadRestored: true,
                    flatStandaloneList: true, modelSetup: true, folderStart: true, pageerrors: errors.length }));
            } finally {
                await context.close();
                for (const socket of wss.clients) socket.terminate();
                await gateway.dispose(); access.dispose();
                await new Promise(resolve => wss.close(resolve));
                server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
                fs.rmSync(root, { recursive: true, force: true });
            }
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
