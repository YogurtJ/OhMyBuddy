// "以身份新建…" in a Pi Agent project (M4-6, public/pi-identity-thread.js + pi-chat.js): the project
// menu offers it when identities are supported; the picker lists enabled identities and Bots (marked),
// explains what such a thread is, remembers the last choice, and creates an ordinary thread in that
// project with the chosen profileId. Cancelling creates nothing. Synthetic backend; desktop and phones.
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const cwd = '/srv/identity-thread';
const TUTOR = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', BOT = 'cccccccc-cccc-4ccc-cccc-cccccccccccc', OFF = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const profiles = [
    { id: TUTOR, name: '数学老师', description: '陪我学数学，先问思路再讲解。'.repeat(3), enabled: true, avatar: { kind: 'emoji', value: '📐' } },
    { id: BOT, name: '小狸', description: '', enabled: true, avatar: { kind: 'preset', id: 'pivane-bean' }, bot: { version: 1, enabled: true } },
    { id: OFF, name: '停用的', description: '', enabled: false, avatar: null }
];

async function main() {
    const app = express();
    for (const [name, folder] of [['marked', 'marked/lib'], ['dompurify', 'dompurify/dist'], ['highlight', '@highlightjs/cdn-assets']]) app.use(`/vendor/${name}`, express.static(path.join(root, 'node_modules', folder)));
    app.use(express.static(path.join(root, 'public')));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    try {
        for (const width of [1440, 393, 320]) {
            const phone = width < 900;
            const context = await browser.newContext({ viewport: { width, height: 860 }, locale: 'zh-CN', isMobile: phone, hasTouch: phone });
            const page = await context.newPage(), errors = [], writes = [];
            let serial = 0;
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(cwd => {
                localStorage.setItem('pi.workspace.language', 'zh-CN');
                localStorage.setItem('pi.web.cwd', cwd);
                localStorage.setItem('pi.web.expandedProjects', JSON.stringify([cwd]));
            }, cwd);
            await page.route('**/api/**', async route => {
                const req = route.request(), url = new URL(req.url()), p = url.pathname;
                const reply = (json, status = 200) => route.fulfill({ status, json });
                if (req.method() !== 'GET') {
                    const body = req.postDataJSON(); writes.push({ p, body });
                    if (p === '/api/pi/sessions') {
                        const profile = profiles.find(item => item.id === body.profileId);
                        return reply({ id: `thread-${++serial}`, cwd: body.cwd, name: '', firstMessage: '', messageCount: 0, modified: new Date().toISOString(),
                            path: `${body.cwd}/thread-${serial}.jsonl`, agentProfile: profile ? { id: profile.id, name: profile.name, available: true } : null }, 201);
                    }
                    return reply({ ok: true });
                }
                if (p === '/api/pi/status') return reply({ ok: true, agentProfiles: true, projectRoots: ['/srv'], defaultProject: cwd, projectIdentity: true });
                if (p === '/api/pi/projects') return reply({ projects: [{ cwd, name: 'identity-thread', sessionCount: 0 }], roots: ['/srv'], pinnedProjects: [], hiddenProjects: [] });
                if (p === '/api/pi/projects/resolve') return reply({ cwd: url.searchParams.get('cwd') });
                if (p === '/api/pi/profiles') return reply({ version: 1, revision: 'r1', cwd, profiles, trash: [], profileRevisions: {} });
                if (p === '/api/pi/sessions') return reply({ sessions: [] });
                if (p === '/api/pi/activity') return reply({ runtimes: [], pinnedProjects: [], hiddenProjects: [], replyNotices: [] });
                return reply({});
            });
            await page.routeWebSocket('**/api/pi/ws', ws => ws.close());
            await page.goto(`http://127.0.0.1:${server.address().port}/#/chat`);
            const menu = async () => {
                if (phone && !await page.locator('#pi-session-pane').evaluate(node => node.classList.contains('open'))) await page.locator('#pi-toggle-sessions').click();
                const trigger = page.locator(`[data-project-cwd="${cwd}"] [data-project-action="menu"]`);
                await trigger.waitFor();
                await trigger.click();
                return page.locator('[role=menuitem]').filter({ hasText: '以身份新建' });
            };
            try {
                let item = await menu();
                await item.waitFor();
                await item.click();
                const dialog = page.locator('dialog.pi-identity-thread[open]');
                await dialog.waitFor();
                await dialog.locator('.pi-identity-thread-row').first().waitFor();
                assert.match(await dialog.locator('.pi-identity-thread-note').textContent(), /identity-thread.*普通 Pi 线程.*不受 Bot 的做事方式限制/);
                const names = await dialog.locator('.pi-identity-thread-copy strong').allTextContents();
                assert.deepEqual(names, ['数学老师', '小狸Bot'], 'enabled identities and Bots; a Bot is marked; disabled ones are left out');
                assert.equal(await dialog.locator('input[value="' + TUTOR + '"]').isChecked(), true, 'the first one is preselected');
                if (process.env.PI_BOT_EVIDENCE) await page.screenshot({ path: path.join(process.env.PI_BOT_EVIDENCE, `identity-thread-${width}.png`) });
                const box = await dialog.boundingBox();
                assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'the picker fits the screen');
                for (const row of await dialog.locator('.pi-identity-thread-row').all()) {
                    const rowBox = await row.boundingBox();
                    assert.ok(rowBox.x + rowBox.width <= box.x + box.width + 1, 'rows fit the picker');
                    if (phone) assert.ok(rowBox.height >= 44, 'touch-sized rows');
                }
                // Cancel creates nothing.
                await page.keyboard.press('Escape');
                await dialog.waitFor({ state: 'detached' });
                assert.equal(writes.length, 0);
                // Choose the Bot: an ordinary thread in this project with its profileId.
                item = await menu(); await item.click();
                await dialog.locator('.pi-identity-thread-row').first().waitFor();
                await dialog.locator(`.pi-identity-thread-row:has(input[value="${BOT}"])`).click();
                await dialog.locator('.settings-primary-button').click();
                await dialog.waitFor({ state: 'detached' });
                for (let i = 0; i < 50 && !writes.length; i++) await page.waitForTimeout(100);
                assert.deepEqual(writes.map(write => [write.p, write.body.cwd, write.body.profileId, write.body.assistantProjectId]), [['/api/pi/sessions', cwd, BOT, undefined]]);
                // The choice is remembered next time.
                item = await menu(); await item.click();
                await dialog.locator('.pi-identity-thread-row').first().waitFor();
                assert.equal(await dialog.locator(`input[value="${BOT}"]`).isChecked(), true);
                await page.keyboard.press('Escape');
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
                assert.equal(overflow, false);
                assert.deepEqual(errors, []);
                console.log(JSON.stringify({ width, status: 'passed' }));
            } finally { await context.close(); }
        }
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
