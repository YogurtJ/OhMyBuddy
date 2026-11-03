const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PI_PACKAGE_CHANGELOG_TEST_URL || 'http://127.0.0.1:3102';
const cwd = '/fixture/changelog';
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    try {
        for (const [width, language] of [[1440, 'zh-CN'], [393, 'zh-CN'], [320, 'zh-CN'], [1440, 'en']]) {
            const english = language === 'en';
            const context = await browser.newContext({ viewport: { width, height: 900 }, locale: language, isMobile: width < 900, hasTouch: width < 900 });
            const page = await context.newPage(), errors = [], reads = [], writes = [];
            let mode = 'ready', release;
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(({ cwd, language }) => { localStorage.setItem('pi.web.cwd', cwd); localStorage.setItem('pi.workspace.language', language); }, { cwd, language });
            await page.route('**/api/**', async route => {
                const request = route.request(), url = new URL(request.url()), p = url.pathname;
                if (p.endsWith('/native/packages/changelog')) {
                    const body = request.postDataJSON(); reads.push(body);
                    if (mode === 'hold') { mode = 'ready'; await new Promise(resolve => { release = resolve; }); return route.fulfill({ json: { status: 'ready', content: 'OLD_RESPONSE' } }); }
                    if (mode === 'error') return route.fulfill({ status: 409, json: { error: 'Synthetic revision conflict' } });
                    return route.fulfill({ json: { status: mode, version: '1.2.0', path: 'docs/CHANGES.md', content: '## 1.2.0\n\n**Synthetic improvement**\n\n[web](https://example.invalid/notes) [local](../../auth.json)\n\n<script>window.BAD_LOG = true</script><img src=x onerror="window.BAD_LOG=true">\n\n```js\n' + 'const longToken = 1; '.repeat(60) + '\n```' } });
                }
                if (request.method() !== 'GET') { writes.push(p); return route.fulfill({ json: { ok: true } }); }
                if (p === '/api/pi/status') return route.fulfill({ json: { nativeSettings: true, nativeResources: true, projectTrust: true, defaultProject: cwd, projectRoots: ['/fixture'] } });
                if (p.endsWith('/native/resources')) return route.fulfill({ json: { cwd, scope: url.searchParams.get('scope'), revision: 'r1', trust: { effective: true }, packageChangelogs: true,
                    packages: [{ source: 'npm:fixture', name: 'Fixture package', version: '1.2.0', scope: 'user', installed: true }], resources: [] } });
                if (p.endsWith('/settings/resources')) return route.fulfill({ json: { skills: [], packages: [], settings: {}, resources: {}, diagnostics: [] } });
                if (p.endsWith('/settings/models')) return route.fulfill({ json: { providers: [], models: [], preferences: {}, customProviders: [] } });
                if (p.endsWith('/projects')) return route.fulfill({ json: { projects: [{ cwd, name: 'Fixture', sessionCount: 0 }], roots: ['/fixture'] } });
                if (p.endsWith('/sessions')) return route.fulfill({ json: { sessions: [] } });
                if (p.endsWith('/activity')) return route.fulfill({ json: { runtimes: [], pinnedProjects: [], hiddenProjects: [], replyNotices: [] } });
                return route.fulfill({ json: p.includes('history') || p === '/api/prompts' ? [] : {} });
            });
            await page.routeWebSocket('**/api/pi/ws', () => { throw Error('changelog reads must not create workers'); });
            await page.goto(base);
            await page.locator('#workspace-settings-toggle').click();
            await page.locator('[data-manage-route="extensions"]').click();
            await page.locator('#extensions-nav [data-extensions-tab="installed"]').click();
            await page.locator('[data-package-source="npm:fixture"]').waitFor();
            const open = async () => {
                const row = page.locator('[data-package-source="npm:fixture"]');
                await row.locator('.native-item-menu summary').click();
                await row.getByRole('button', { name: (english ? 'Release notes' : '更新说明') + ' Fixture package', exact: true }).click();
            };
            const dialog = page.locator('#pi-package-changelog-dialog');
            await open(); await dialog.getByText('Synthetic improvement', { exact: true }).waitFor();
            assert.equal(reads.length, 1); assert.equal(reads[0].scope, 'global'); assert.equal(reads[0].expectedVersion, '1.2.0'); assert.equal(reads[0].expectedRevision, 'r1');
            assert.match(await dialog.locator('.native-changelog-version').textContent(), /v1.2.0.*docs\/CHANGES.md/);
            assert.equal(await dialog.locator('script,img,iframe').count(), 0);
            assert.equal(await page.evaluate(() => window.BAD_LOG), undefined);
            assert.equal(await dialog.getByText('local', { exact: true }).getAttribute('href'), null);
            assert.equal(await dialog.getByRole('link', { name: 'web' }).getAttribute('rel'), 'noopener noreferrer');
            const box = await dialog.boundingBox(); assert.ok(Math.abs(box.x + box.width / 2 - width / 2) < 2);
            const sizes = await page.evaluate(() => [...document.querySelectorAll('body,#pi-package-changelog-dialog,.native-changelog-body')].map(node => [node.clientWidth, node.scrollWidth]));
            assert.ok(sizes.every(([client, scroll]) => scroll <= client + 1), JSON.stringify(sizes));
            await page.screenshot({ path: `/tmp/pi-package-changelog-${width}-${language}.png` });
            await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
            mode = 'hold'; await open(); await dialog.getByText(english ? 'Reading release notes from the installed package…' : '正在读取已安装包的更新说明…').waitFor();
            await dialog.getByRole('button', { name: english ? 'Close' : '关闭', exact: true }).click();
            await open(); await dialog.getByText('Synthetic improvement', { exact: true }).waitFor();
            release(); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            assert.ok(!(await dialog.textContent()).includes('OLD_RESPONSE'));
            await page.keyboard.press('Escape');
            mode = 'disabled'; await open(); await dialog.getByText(english ? 'The package author disabled release notes.' : '包作者关闭了更新说明。', { exact: true }).waitFor();
            await page.keyboard.press('Escape');
            mode = 'error'; await open(); await dialog.getByText(english ? 'Could not read release notes. Refresh the list and try again.' : '无法读取更新说明，请刷新列表后重试。', { exact: true }).waitFor();
            await page.keyboard.press('Escape');
            assert.deepEqual(errors, []); assert.deepEqual(writes, []);
            console.log(`Package changelog ${width}: safe rendering, revision, late response, width and read-only passed`);
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
