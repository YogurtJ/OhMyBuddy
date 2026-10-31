const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const express = require('express');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { randomUUID } = require('node:crypto');
const cwd = '/synthetic/assistant';
const profileId = randomUUID(), sessionId = randomUUID();
async function check(browser, base, width, language, scenario = 'normal') {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: language, isMobile: width < 680, hasTouch: width < 680 });
    const page = await context.newPage(), errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(language => { localStorage.setItem('pi.workspace.language', language); localStorage.setItem('pi.workspace.theme', 'daylight'); }, language);
    if (scenario !== 'normal') await page.addInitScript(() => {
        Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true });
        window.__cronLoadingSeen = false;
        document.addEventListener('DOMContentLoaded', () => new MutationObserver(() => {
            if (document.querySelector('#cron-tab .pv-skeleton[role="status"][aria-label]')) window.__cronLoadingSeen = true;
        }).observe(document.body, { subtree: true, childList: true }));
    });
    const jobs = [], homes = [], now = Date.now();
    // A Bot's home is derived from its main chat and cannot be replaced.
    const botHome = { profileId: 'bot-momo', status: 'ready', cwd, sessionId: 'bot-gen-1', name: 'Momo', revision: 0, bot: true };
    let limits = { maxRunsPerDay: null, maxTokensPerDay: null, maxCostPerDay: null }, settings = { maxConcurrent: 2 };
    await page.route('**/api/**', route => {
        const req = route.request(), url = new URL(req.url()), body = req.postDataJSON();
        const send = data => route.fulfill({ json: data });
        if (req.method() !== 'GET') writes.push({ path: url.pathname, body });
        if (url.pathname === '/api/pi/status') return send({ ok: true, scheduledTasks: true, projectRoots: ['/synthetic'] });
        if (url.pathname === '/api/pi/projects') return new Promise(resolve => setTimeout(() => { send({ projects: [{ cwd, name: 'Assistant', sessionCount: 1 }], roots: ['/synthetic'] }); resolve(); }, scenario === 'slow' ? 1800 : 0));
        if (url.pathname === '/api/pi/profiles') return send({ profiles: [{ id: profileId, name: 'Assistant <img src=x onerror=alert(1)>', enabled: true },
            { id: 'bot-momo', name: 'Momo', enabled: true }] });
        if (url.pathname === '/api/pi/sessions') return send({ sessions: url.searchParams.get('cwd') === cwd
            ? [{ id: sessionId, cwd, name: 'Main conversation', agentProfile: { id: profileId } }] : [] });
        if (url.pathname === '/api/pi/activity') return send({ runtimes: [], replyNotices: [] });
        if (url.pathname === '/api/pi/cron') return new Promise(resolve => setTimeout(() => { send({ jobs, homes: [...homes, botHome], limits, today: { runs: 0, tokens: 0, cost: 0 }, channelNotifications: { pending: 2, failed: 1, lastError: 'channel-admission-pending' } }); resolve(); }, scenario === 'slow' ? 350 : 0));
        if (url.pathname === '/api/pi/cron/limits') {
            if (req.method() === 'PUT') { limits = body.limits; settings = body.settings; }
            return send({ limits, settings, revision: 'synthetic-revision' });
        }
        if (url.pathname === '/api/pi/cron/preview') return send({ times: Array.from({ length: 5 }, (_, i) => now + (i + 1) * 86400000) });
        if (url.pathname === '/api/pi/cron/jobs') {
            const index = jobs.findIndex(job => job.id === body.id), saved = { ...body, revision: (body.revision || 0) + 1, nextAt: now + 86400000 };
            if (index < 0) jobs.push(saved); else jobs[index] = saved; return send(saved);
        }
        if (url.pathname === `/api/pi/cron/homes/${profileId}`) {
            const home = { profileId, revision: 1, status: 'ready', cwd: body.cwd, sessionId: body.sessionId, name: 'Main conversation' };
            homes.push(home); return send(home);
        }
        if (url.pathname.endsWith('/runs')) return send({ runs: [{ id: 'failed-fixture', status: 'stopped', scheduledAt: now, target: { cwd, sessionId },
            usage: { calls: 2, tokens: 255629, input: 127679, output: 462, cacheRead: 127488, cost: 0.2727 },
            feedback: { code: 'token-limit', title: '单次 Token 上限已用尽', suggestion: '调高或关闭 Token 上限后，核对已执行的操作，再手动运行。',
                usage: { tokens: 255629, calls: 2 }, limits: { maxTokens: 180000, maxCalls: 50 } } },
            { id: 'notice-fixture', status: 'completed', scheduledAt: now, channelNotify: { status: 'pending', lastError: 'channel-admission-pending' } }] });
        if (url.pathname.includes('history') || url.pathname === '/api/prompts') return send([]);
        return send({ configured: false });
    });
    await page.goto(base + '/#/cron');
    const zh = language === 'zh-CN';
    if (scenario === 'slow') {
        assert.equal(await page.evaluate(() => window.__cronLoadingSeen), true, 'initial task loading should have a visible placeholder');
        await page.locator('#cron-tab .pv-skeleton').first().waitFor({ state: 'detached', timeout: 1500 });
    }
    await page.locator('.cron-notice').filter({ hasText: zh ? '微信通知待处理 2' : 'WeChat notifications pending 2' }).waitFor();
    await page.getByRole('button', { name: zh ? '新建任务' : 'New task', exact: true }).click();
    await page.getByLabel(zh ? '任务名称' : 'Task name').fill('Daily briefing <img src=x onerror=alert(1)>');
    await page.getByLabel(zh ? '工作目录' : 'Working directory', { exact: false }).fill(cwd);
    await page.getByLabel(zh ? '工作目录' : 'Working directory', { exact: false }).press('Tab');
    await page.getByLabel(zh ? '目标线程' : 'Target thread', { exact: true }).selectOption(sessionId);
    await page.getByLabel(zh ? '时间' : 'Time', { exact: true }).fill('17:00');
    const futureStart = await page.evaluate(() => { const d = new Date(Date.now() + 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
    await page.getByLabel(zh ? '生效时间' : 'Starts on', { exact: true }).fill(futureStart);
    await page.getByLabel(zh ? '提示词' : 'Prompt', { exact: true }).fill('A warm, short greeting. Stay silent if the user is busy.');
    await page.getByLabel(zh ? '执行方式' : 'Execution mode', { exact: true }).selectOption('work');
    assert.equal(await page.getByLabel(zh ? '单次模型调用上限' : 'Model calls per run', { exact: true }).inputValue(), '100');
    assert.equal(await page.getByLabel(zh ? '最长执行（分钟）' : 'Maximum duration (minutes)', { exact: true }).inputValue(), '60');
    await page.locator('.cron-card summary').click();
    assert.equal(await page.getByLabel(zh ? '单次 Token 预算' : 'Token budget per run', { exact: true }).inputValue(), '');
    assert.equal(await page.getByLabel(zh ? '每日 Token 预算' : 'Daily token budget', { exact: true }).inputValue(), '');
    const overflow = await page.evaluate(() => [...document.querySelectorAll('#cron-tab input, #cron-tab select, #cron-tab textarea, #cron-tab button, #cron-tab .cron-card')]
        .filter(n => { const r = n.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(n => n.className));
    assert.deepEqual(overflow, []);
    if (width < 680) assert.ok(await page.locator('.cron-page textarea').evaluate(n => parseFloat(getComputedStyle(n).fontSize) >= 16));
    await page.screenshot({ path: `/tmp/pivane-cron-form-${width}-${language}.png`, fullPage: true });
    assert.equal(await page.getByLabel(zh ? '微信通知' : 'WeChat notification', { exact: true }).inputValue(), 'inherit');
    await page.getByRole('button', { name: zh ? '保存任务' : 'Save task', exact: true }).click();
    await page.locator('.cron-detail-head').waitFor();
    await page.getByText(zh ? '微信通知等待投递入队' : 'WeChat notification awaiting admission', { exact: true }).waitFor();
    assert.match(jobs[0].id, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
    assert.equal(jobs[0].schedule.expression, '0 17 * * *');
    assert.equal(jobs[0].target.sessionId, sessionId);
    assert.equal(jobs[0].enabled, false);
    assert.equal(jobs[0].weixinNotification, 'inherit');
    assert.ok(jobs[0].startsAt > now);
    assert.equal(jobs[0].execution.maxTokens, null); assert.equal(jobs[0].execution.maxCalls, 100);
    assert.equal(jobs[0].budget.maxTokensPerDay, null);
    await page.getByText(zh ? '单次 Token 上限已用尽' : 'Token limit for this run reached', { exact: true }).waitFor();
    assert.match(await page.locator('.cron-feedback').textContent(), /255,629.*180,000/);
    assert.equal(await page.getByRole('button', { name: zh ? '调整执行设置' : 'Adjust execution settings', exact: true }).count(), 1);
    await page.locator('.cron-feedback').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/pivane-cron-feedback-${width}-${language}.png`, fullPage: true });
    await page.getByRole('button', { name: zh ? '全局设置' : 'Global settings', exact: true }).click();
    await page.getByLabel(zh ? '同时执行的任务数' : 'Concurrent tasks', { exact: true }).fill('3');
    await page.getByLabel(zh ? '每日估算美元预算' : 'Daily estimated budget (USD)', { exact: true }).fill('5');
    await page.screenshot({ path: `/tmp/pivane-cron-settings-${width}-${language}.png`, fullPage: true });
    await page.getByRole('button', { name: zh ? '保存设置' : 'Save settings', exact: true }).click();
    await page.locator('.cron-detail-head').waitFor();
    assert.equal(settings.maxConcurrent, 3); assert.equal(limits.maxCostPerDay, 5); assert.equal(limits.maxTokensPerDay, null);
    jobs[0].policyVersion = 1; jobs[0].execution.maxTokens = 180000; jobs[0].budget.maxTokensPerDay = 200000;
    await page.getByRole('button', { name: zh ? '刷新' : 'Refresh', exact: true }).click();
    await page.locator('.cron-policy-summary').getByText('180,000', { exact: true }).waitFor();
    await page.getByRole('button', { name: zh ? '编辑' : 'Edit', exact: true }).click();
    await page.locator('.cron-legacy-note').filter({ hasText: zh ? '此任务保留旧版限制' : 'This task keeps its previous limits' }).waitFor();
    await page.getByRole('button', { name: zh ? '使用推荐设置' : 'Use recommended settings', exact: true }).click();
    await page.getByRole('button', { name: zh ? '保存任务' : 'Save task', exact: true }).click();
    await page.locator('.cron-detail-head').waitFor();
    assert.equal(jobs[0].policyVersion, 2); assert.equal(jobs[0].execution.maxTokens, null); assert.equal(jobs[0].budget.maxTokensPerDay, null);
    assert.equal(writes.filter(write => write.body?.action === 'run').length, 0, 'policy migration never starts or replays a task');
    assert.equal(await page.locator('#cron-tab [onerror]').count(), 0);
    await page.screenshot({ path: `/tmp/pivane-cron-detail-${width}-${language}.png`, fullPage: true });
    await page.getByRole('button', { name: zh ? '编辑' : 'Edit', exact: true }).click();
    await page.getByLabel(zh ? '任务名称' : 'Task name').fill('Unsaved draft');
    await page.evaluate(() => window.PiWorkspaceRoute.navigate('chat'));
    await page.evaluate(() => window.PiWorkspaceRoute.navigate('cron'));
    assert.equal(await page.getByLabel(zh ? '任务名称' : 'Task name').inputValue(), 'Unsaved draft');
    await page.getByRole('button', { name: zh ? '主线程' : 'Main threads', exact: true }).click();
    await page.getByRole('button', { name: zh ? '放弃修改' : 'Discard changes', exact: true }).click();
    await page.getByLabel(zh ? '目标线程' : 'Target thread', { exact: true }).selectOption(sessionId);
    await page.getByRole('button', { name: zh ? '设为主线程' : 'Set as main thread', exact: true }).click();
    await page.getByRole('button', { name: zh ? '打开主线程' : 'Open main thread', exact: true }).waitFor();
    assert.equal(homes[0].sessionId, sessionId);
    assert.equal(homes[0].cwd, cwd);
    await page.screenshot({ path: `/tmp/pivane-cron-main-${width}-${language}.png`, fullPage: true });
    const writesBefore = writes.length;
    // Scoped to the task form: the navigation rail also has an "Assistant profiles" button.
    await page.locator('#cron-tab').getByLabel(zh ? '助手身份' : 'Assistant profiles', { exact: true }).selectOption('bot-momo');
    await page.getByRole('button', { name: zh ? '打开主聊天' : 'Open main chat', exact: true }).waitFor();
    assert.match(await page.locator('.cron-form .cron-muted').last().textContent(), zh ? /伙伴的主线程就是它的主聊天/ : /A Buddy's main thread is its main chat/);
    assert.equal(await page.getByRole('button', { name: zh ? '设为主线程' : 'Set as main thread', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: zh ? '创建主线程' : 'Create main thread', exact: true }).count(), 0);
    assert.equal(await page.getByLabel(zh ? '工作目录' : 'Working directory', { exact: false }).isVisible(), false);
    assert.equal(writes.length, writesBefore, 'nothing is written for a Bot home');
    const receipt = await page.evaluate(() => {
        const message = { role: 'custom', customType: 'pivane-cron-result', content: 'Failure', details: { name: '<img src=x onerror=alert(1)>', status: 'stopped',
            feedback: { title: '单次 Token 上限已用尽', suggestion: '调高或关闭 Token 上限后，核对已执行的操作，再手动运行。', detail: '<img src=x onerror=alert(1)>' } } };
        const card = window.PiAgentCards.render(message, { link() {}, markdown: source => window.DOMPurify.sanitize(window.marked.parse(source)) });
        card.querySelector('details')._piRenderNow();
        return { handled: window.PiAgentCards.handles(message), title: card.querySelector('strong').textContent, text: card.textContent,
            unsafe: card.querySelectorAll('[onerror],img').length };
    });
    assert.equal(receipt.handled, true); assert.equal(receipt.unsafe, 0);
    assert.equal(receipt.title, zh ? '定时任务需要处理' : 'Scheduled task needs attention');
    assert.match(receipt.text, zh ? /Token 上限已用尽/ : /Token limit for this run reached/);
    assert.deepEqual(errors, []);
    assert.equal(writes.filter(w => w.path === '/api/pi/cron/jobs').length, 2);
    await context.close();
}
(async () => {
    const app = express(), root = path.resolve(__dirname, '../..');
    for (const [url, directory] of [['marked', 'marked/lib'], ['dompurify', 'dompurify/dist'], ['highlight', '@highlightjs/cdn-assets']]) app.use(`/vendor/${url}`, express.static(path.join(root, 'node_modules', directory)));
    app.use(express.static(path.join(root, 'public')));
    const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    try {
        for (const width of [1440, 393, 320]) for (const language of ['zh-CN', 'en']) await check(browser, `http://127.0.0.1:${server.address().port}`, width, language);
        for (const language of ['zh-CN', 'en']) await check(browser, `http://127.0.0.1:${server.address().port}`, language === 'zh-CN' ? 1440 : 393, language, 'slow');
        console.log('Scheduled tasks: desktop/mobile, two languages, HTTP UUID fallback, asynchronous loading and draft checks passed');
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
