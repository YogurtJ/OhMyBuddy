// M4-5c: with Bots available the assistant chat page is retired. Old links open the thread in the
// Pi Agent list (or the Bot, or Pi Agent), also when the page is loaded at such a link; the entry is
// gone from the navigation; "用此身份对话" on the identity page opens a new Pi Agent thread with the
// identity (in a related category's folder it keeps the category). Synthetic backend; desktop and phone.
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const cwd = '/srv/retired', research = '/srv/research';
const TUTOR = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', BOT = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const profiles = [
    { id: TUTOR, name: '数学老师', description: '', enabled: true, avatar: { kind: 'emoji', value: '📐' }, soul: '', memory: { enabled: true, autoLearn: false }, skills: { learnedEnabled: true } },
    { id: BOT, name: '小狸', description: '', enabled: true, avatar: { kind: 'preset', id: 'pivane-bean' }, soul: '', memory: { enabled: true, autoLearn: false }, skills: { learnedEnabled: true }, bot: { version: 1, enabled: true } }
];
const categories = [{ id: 'proj-1', name: '研究笔记', cwd: research, description: '', profileIds: [TUTOR], archived: false }];

async function main() {
    const app = express();
    for (const [name, folder] of [['marked', 'marked/lib'], ['dompurify', 'dompurify/dist'], ['highlight', '@highlightjs/cdn-assets']]) app.use(`/vendor/${name}`, express.static(path.join(root, 'node_modules', folder)));
    app.use(express.static(path.join(root, 'public')));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    try {
        for (const width of [1440, 393]) {
            const phone = width < 900;
            const context = await browser.newContext({ viewport: { width, height: 860 }, locale: 'zh-CN', isMobile: phone, hasTouch: phone });
            const page = await context.newPage(), errors = [], writes = [], resolved = [];
            page.setDefaultTimeout(8000);
            let serial = 0;
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(cwd => { localStorage.setItem('pi.workspace.language', 'zh-CN'); localStorage.setItem('pi.web.cwd', cwd); }, cwd);
            await page.route('**/api/**', async route => {
                const req = route.request(), url = new URL(req.url()), p = url.pathname;
                const reply = (json, status = 200) => route.fulfill({ status, json });
                if (req.method() !== 'GET') {
                    const body = req.postDataJSON(); writes.push({ p, body });
                    if (p === '/api/pi/sessions') return reply({ id: `new-${++serial}`, cwd: body.cwd, name: '', firstMessage: '', messageCount: 0, modified: new Date().toISOString(),
                        path: `${body.cwd}/new-${serial}.jsonl`, agentProfile: { id: body.profileId, name: '数学老师', available: true } }, 201);
                    return reply({ ok: true });
                }
                const resolve = /^\/api\/pi\/sessions\/([^/]+)\/resolve$/.exec(p);
                if (resolve) {
                    resolved.push([resolve[1], url.searchParams.get('cwd')]);
                    return reply({ session: { id: resolve[1], cwd: url.searchParams.get('cwd'), name: '旧对话', firstMessage: '', messageCount: 0, modified: new Date().toISOString(),
                        path: `${url.searchParams.get('cwd')}/${resolve[1]}.jsonl`, agentProfile: { id: TUTOR, name: '数学老师', available: true } } });
                }
                if (p === '/api/pi/status') return reply({ ok: true, bots: true, agentProfiles: true, assistantProjects: true, sessionMoves: true, projectRoots: ['/srv'], defaultProject: cwd });
                if (p === '/api/pi/projects') return reply({ projects: [{ cwd, name: 'retired', sessionCount: 0 }, { cwd: research, name: 'research', sessionCount: 1 }], roots: ['/srv'], pinnedProjects: [], hiddenProjects: [] });
                if (p === '/api/pi/projects/resolve') return reply({ cwd: url.searchParams.get('cwd') });
                if (p === '/api/pi/profiles') return reply({ version: 1, revision: 'r1', cwd: url.searchParams.get('cwd') ?? cwd, profiles, trash: [], profileRevisions: {} });
                if (p === '/api/pi/assistant-projects') return reply({ version: 1, revision: 'a1', projects: categories });
                if (p === '/api/pi/bots') return reply({ version: 1, revision: 'r1', bots: [] });
                if (p === '/api/pi/bots/readiness') return reply({ models: 1 });
                if (p.endsWith('/learning')) return reply({ version: 1, revision: 1, health: { state: 'off' }, drafts: { pending: 0 }, proposals: [], settings: {}, jobs: [], recentRuns: [], capabilities: {} });
                if (p.endsWith('/knowledge')) return reply({ version: 1, status: 'ready', revision: 'a'.repeat(64), items: [], counts: { memory: { total: 0 }, skill: { total: 0 } }, receipts: [], hasMore: false, usage: {}, capabilities: {} });
                if (p === '/api/pi/sessions') return reply({ sessions: [] });
                if (p === '/api/pi/activity') return reply({ runtimes: [], pinnedProjects: [], hiddenProjects: [], replyNotices: [] });
                return reply({});
            });
            await page.routeWebSocket('**/api/pi/ws', ws => ws.close());
            // The list may render twice while it loads; select until the details open.
            const openIdentity = async () => {
                await page.locator(`.pi-profile-row[data-profile-id="${TUTOR}"]`).waitFor();
                for (let i = 0; i < 20 && !await page.locator('[data-profile-chat]').isVisible(); i++) {
                    if (phone && await page.locator('#pi-profile-list-back').isVisible()) break;
                    await page.locator(`.pi-profile-row[data-profile-id="${TUTOR}"]`).click().catch(() => {});
                    await page.waitForTimeout(250);
                }
            };
            try {
                // 1. Loaded at an old assistant thread link: the thread opens in Pi Agent, in its real folder.
                await page.goto(`${base}/#/assistant?profileId=${TUTOR}&projectId=proj-1&sessionId=old-1`);
                await page.waitForFunction(() => location.hash.startsWith('#/chat'));
                const hash = new URLSearchParams((await page.evaluate(() => location.hash)).split('?')[1]);
                assert.deepEqual([hash.get('cwd'), hash.get('sessionId')], [research, 'old-1']);
                for (let i = 0; i < 50 && !resolved.length; i++) await page.waitForTimeout(100);
                assert.deepEqual(resolved[0], ['old-1', research], 'the old thread is opened');
                assert.equal(await page.locator('#pi-assistant-switcher').isVisible(), false);
                // 2. No entry in the navigation.
                assert.equal(await page.locator('.nav-btn[data-tab="assistant"]').isVisible(), false);
                if (phone) {
                    await page.locator('#workspace-more-toggle').click();
                    assert.equal(await page.locator('[data-more-tab="assistant"]').isVisible(), false);
                    await page.locator('#workspace-more-toggle').click();
                }
                // 3. Runtime links: a Bot opens the Bot; another identity lands in Pi Agent.
                await page.evaluate(id => window.PiWorkspaceRoute.navigate('assistant', { profileId: id }), BOT);
                await page.waitForFunction(id => location.hash.startsWith('#/bot') && location.hash.includes(id), BOT);
                await page.evaluate(id => window.PiWorkspaceRoute.navigate('assistant', { profileId: id }), TUTOR);
                await page.waitForFunction(() => location.hash === '#/chat');
                // 4. "用此身份对话": a new Pi Agent thread with the identity in the current project.
                await page.evaluate(() => window.PiWorkspaceRoute.navigate('profiles'));
                if (phone && await page.locator('#pi-profile-list-back').isVisible()) await page.locator('#pi-profile-list-back').click();
                await openIdentity();
                await page.locator('[data-profile-chat]').click();
                await page.waitForFunction(() => location.hash.startsWith('#/chat') && location.hash.includes('sessionId=new-1'));
                const first = writes.find(write => write.p === '/api/pi/sessions').body;
                assert.equal(first.profileId, TUTOR); assert.equal(first.assistantProjectId, undefined); assert.ok([cwd, research].includes(first.cwd), 'the project open in Pi Agent');
                // 5. From a related category: its folder and category are kept.
                await page.evaluate(() => window.PiWorkspaceRoute.navigate('profiles'));
                if (phone && await page.locator('#pi-profile-list-back').isVisible()) await page.locator('#pi-profile-list-back').click();
                await openIdentity();
                await page.locator('[data-profile-section="overview"]').click().catch(() => {});
                const projectButton = page.locator('.pi-profile-project .pi-id-btn').filter({ hasText: '在此项目对话' });
                await projectButton.waitFor();
                await projectButton.click();
                await page.waitForFunction(() => location.hash.includes('sessionId=new-2'));
                const second = writes.filter(write => write.p === '/api/pi/sessions')[1].body;
                assert.deepEqual(second, { cwd: research, profileId: TUTOR, assistantProjectId: 'proj-1' });
                assert.deepEqual(errors, []);
                console.log(JSON.stringify({ width, status: 'passed' }));
            } finally { await context.close(); }
        }
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
