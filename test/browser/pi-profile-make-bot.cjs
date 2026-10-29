// "变成 Bot" on the identity page (M4-5b, public/pi-agent-profiles.js): offered for enabled identities
// that are not Bots, explained in a confirmation (what stays, where earlier chats are, how many
// scheduled tasks move to the Bot's main chat), sent with the revision the page read, then opens the
// new Bot. Refusals are explained and nothing is retried. Synthetic data; desktop, phone, narrow phone.
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const cwd = '/synthetic/profile-bot';
const TUTOR = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', OFF = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', BOT = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const profile = (id, name, extra = {}) => ({ id, name, description: '', avatar: { kind: 'emoji', value: '📐' }, enabled: true, soul: '耐心。',
    memory: { enabled: true, autoLearn: false }, skills: { learnedEnabled: true }, ...extra });

async function main() {
    const app = express();
    for (const [name, folder] of [['marked', 'marked/lib'], ['dompurify', 'dompurify/dist'], ['highlight', '@highlightjs/cdn-assets']]) app.use(`/vendor/${name}`, express.static(path.join(root, 'node_modules', folder)));
    app.use(express.static(path.join(root, 'public')));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    try {
        for (const width of [1440, 393, 320]) {
            const context = await browser.newContext({ viewport: { width, height: 860 }, locale: 'zh-CN', isMobile: width < 681, hasTouch: width < 681 });
            const page = await context.newPage(), errors = [], writes = [];
            const rows = [profile(TUTOR, '数学老师'), profile(OFF, '停用的', { enabled: false }), profile(BOT, '小狸', { bot: { version: 1, enabled: true } })];
            let revision = 1, plan = ['conflict'];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(cwd => { localStorage.setItem('pi.workspace.language', 'zh-CN'); localStorage.setItem('pi.web.cwd', cwd); }, cwd);
            await page.route('**/api/**', async route => {
                const req = route.request(), url = new URL(req.url()), p = url.pathname;
                const reply = (data, status = 200) => route.fulfill({ status, json: data });
                if (req.method() !== 'GET') {
                    const body = req.postDataJSON(); writes.push({ p, body });
                    if (p === '/api/pi/bots/from-profile') {
                        if (plan.shift() === 'conflict') { revision++; return reply({ error: 'Profiles changed; reload before saving' }, 409); }
                        assert.equal(body.expectedRevision, `r${revision}`);
                        rows.find(row => row.id === body.profileId).bot = { version: 1, enabled: true };
                        revision++;
                        return reply({ ok: true, revision: `r${revision}`, bot: { id: body.profileId }, window: { id: 'w', kind: 'main' } });
                    }
                    return reply({ ok: true });
                }
                if (p === '/api/pi/status') return reply({ ok: true, agentProfiles: true, assistantProjects: true, profileMemory: true, projectRoots: ['/synthetic'], defaultProject: cwd });
                if (p === '/api/pi/projects') return reply({ projects: [{ cwd, name: 'Synthetic', sessionCount: 0 }], roots: ['/synthetic'] });
                if (p === '/api/pi/profiles') return reply({ version: 1, revision: `r${revision}`, cwd, profiles: rows, trash: [], profileRevisions: {} });
                if (p === '/api/pi/cron') return reply({ jobs: [{ id: 'j1', target: { kind: 'profile', profileId: TUTOR } }, { id: 'j2', deleted: true, target: { kind: 'profile', profileId: TUTOR } },
                    { id: 'j3', target: { kind: 'profile', profileId: BOT } }] });
                if (p.endsWith('/learning')) return reply({ version: 1, revision: 1, health: { state: 'off' }, drafts: { pending: 0 }, proposals: [], settings: {}, jobs: [], recentRuns: [], capabilities: {} });
                if (p.endsWith('/knowledge')) return reply({ version: 1, status: 'ready', revision: 'a'.repeat(64), items: [], counts: { memory: { total: 0 }, skill: { total: 0 } }, receipts: [], hasMore: false, usage: {}, capabilities: {} });
                if (p === '/api/pi/sessions') return reply({ sessions: [] });
                if (p === '/api/pi/activity') return reply({ runtimes: [], pinnedProjects: [], hiddenProjects: [], replyNotices: [] });
                if (p === '/api/pi/bots') return reply({ version: 1, revision: `r${revision}`, bots: [] });
                return reply({});
            });
            await page.routeWebSocket('**/api/pi/ws', ws => ws.close());
            await page.goto(`http://127.0.0.1:${server.address().port}/#/profiles`);
            const open = async id => {
                if (width < 681 && await page.locator('#pi-profile-list-back').isVisible()) await page.locator('#pi-profile-list-back').click();
                await page.locator(`.pi-profile-row[data-profile-id="${id}"]`).click();
                await page.locator('.pi-id-header-actions .pi-id-menu > button').click();
                return page.locator('.pi-id-header-actions [role=menuitem]');
            };
            const close = () => page.keyboard.press('Escape');
            try {
                await page.locator('.pi-profile-row').first().waitFor();
                // Offered only for an enabled identity that is not a Bot yet.
                let items = await open(OFF);
                assert.equal(await items.filter({ hasText: '变成伙伴' }).isDisabled(), true, 'a disabled identity has to be turned on first');
                await close();
                items = await open(BOT);
                assert.equal(await items.filter({ hasText: '变成伙伴' }).count(), 0, 'a Bot is not offered again');
                await close();
                items = await open(TUTOR);
                const make = items.filter({ hasText: '变成伙伴' });
                assert.equal(await make.isDisabled(), false);
                if (width < 681) assert.ok((await make.boundingBox()).height >= 44, 'touch-sized menu item');
                await make.click();
                const confirm = page.locator('.pi-profile-confirm[open]');
                await confirm.waitFor();
                assert.equal(await confirm.locator('h2').textContent(), '把“数学老师”变成伙伴？');
                assert.equal(await confirm.locator('.pi-profile-confirm-item').count(), 3, 'structured confirmation highlights');
                assert.equal(await confirm.locator('.pi-profile-confirm-primary').count(), 1, 'primary action tone');
                const text = await confirm.innerText();
                assert.match(text, /保留名字、头像、性格、记忆和技能/); assert.match(text, /工作台的线程列表/);
                assert.match(text, /以它为目标的 1 个定时任务以后会发到伙伴的主聊天/, 'only live tasks aimed at this identity are counted');
                assert.match(text, /不能再变回普通身份/);
                const box = await confirm.boundingBox();
                assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'the confirmation fits the screen');
                // Cancel sends nothing.
                await page.keyboard.press('Escape');
                assert.equal(writes.length, 0);
                // A conflict changes nothing and says so; the next try uses the fresh revision and opens the Bot.
                await (await open(TUTOR)).filter({ hasText: '变成伙伴' }).click();
                await confirm.locator('.settings-primary-button').click();
                await page.locator('.pi-id-toast').filter({ hasText: '身份已变化' }).first().waitFor();
                assert.match(location(page), /#\/profiles/);
                await (await open(TUTOR)).filter({ hasText: '变成伙伴' }).click();
                await confirm.locator('.settings-primary-button').click();
                await page.waitForFunction(id => decodeURIComponent(location.hash).includes('bot') && decodeURIComponent(location.hash).includes(id), TUTOR);
                const sent = writes.filter(write => write.p === '/api/pi/bots/from-profile');
                assert.deepEqual(sent.map(write => [write.body.profileId, write.body.expectedRevision, write.body.language]), [[TUTOR, 'r1', 'zh-CN'], [TUTOR, 'r2', 'zh-CN']]);
                assert.deepEqual(errors, []);
                console.log(JSON.stringify({ width, status: 'passed' }));
            } finally { await context.close(); }
        }
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
const location = page => page.url();
main().catch(error => { console.error(error); process.exitCode = 1; });
