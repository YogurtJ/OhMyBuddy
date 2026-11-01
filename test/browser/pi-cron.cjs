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
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: language, isMobile: width < 680, hasTouch: width < 680,
        ...(scenario === 'organization' ? { timezoneId: 'America/New_York' } : {}) });
    const page = await context.newPage(), errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ language, theme }) => { localStorage.setItem('pi.workspace.language', language); localStorage.setItem('pi.workspace.theme', theme); },
        { language, theme: scenario === 'organization' ? width === 393 ? 'dark' : width === 320 ? 'mint' : 'daylight' : 'daylight' });
    if (scenario !== 'normal') await page.addInitScript(() => {
        Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true });
        window.__cronLoadingSeen = false;
        document.addEventListener('DOMContentLoaded', () => new MutationObserver(() => {
            if (document.querySelector('#cron-tab .pv-skeleton[role="status"][aria-label]')) window.__cronLoadingSeen = true;
        }).observe(document.body, { subtree: true, childList: true }));
    });
    const jobs = [], homes = [], now = Date.now();
    const sessionRows = [{ id: sessionId, cwd, name: 'Main conversation', agentProfile: { id: profileId, name: 'Assistant' } },
        ...Array.from({ length: 230 }, (_, i) => ({ id: `thread-${i}`, cwd, name: `Project discussion ${i}`, agentProfile: { id: profileId, name: 'Assistant' } })),
        { id: 'management', name: 'Management hidden', assistant: true }];
    if (scenario === 'organization') {
        const baseJob = { revision: 1, prompt: 'Synthetic task', enabled: true, mode: 'work', target: { kind: 'thread', cwd, sessionId },
            schedule: { kind: 'cron', expression: '0 9 * * *', timeZone: 'UTC' }, nextAt: now + 86400000, misfire: { policy: 'skip', graceMinutes: 30 }, execution: { maxDurationSeconds: 21600 }, budget: {} };
        jobs.push({ ...baseJob, id: 'recurring', name: 'Daily long-term check', lastRun: { status: 'failed' } },
            { ...baseJob, id: 'upcoming', name: 'Upcoming one-time check', nextAt: now + 86445678, startsAt: now + 30017, schedule: { kind: 'once', at: now + 86445678, timeZone: 'UTC' }, lastRun: { status: 'completed', completedAt: now - 1000 } },
            ...['completed', 'failed', 'stopped'].map((status, i) => ({ ...baseJob, id: `past-${status}`, name: `Past task ${status}`, enabled: false, nextAt: null, schedule: { kind: 'once', at: now - (i + 1) * 86400000, timeZone: 'UTC' }, lastRun: { status, completedAt: now - (i + 1) * 86400000 } })),
            { ...baseJob, id: 'review', name: 'Uncertain one-time check', enabled: false, nextAt: null, schedule: { kind: 'once', at: now - 86400000, timeZone: 'UTC' }, lastRun: { status: 'skipped' }, activeRun: { id: 'unfinished', status: 'uncertain' } });
    }
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
        if (url.pathname === '/api/pi/files/directories') {
            const requested = url.searchParams.get('path');
            return send({ current: requested || null, parent: requested && requested !== '/synthetic' ? '/synthetic' : null,
                directories: requested === cwd ? [{ name: 'Subfolder', path: `${cwd}/subfolder` }] : requested?.endsWith('/subfolder') ? [] : [{ name: 'Assistant', path: cwd }], partial: false });
        }
        if (url.pathname === '/api/pi/sessions' && url.searchParams.get('cwd') === '/synthetic/slow') return new Promise(resolve => setTimeout(() => {
            send({ sessions: [{ id: 'stale-thread', cwd: '/synthetic/slow', name: 'Stale response' }] }); resolve();
        }, 500));
        if (url.pathname === '/api/pi/sessions') return send({ sessions: url.searchParams.get('cwd') === cwd ? sessionRows : [] });
        if (url.pathname === '/api/pi/activity') return send({ runtimes: [], replyNotices: [] });
        if (url.pathname === '/api/pi/cron') return new Promise(resolve => setTimeout(() => { send({ serverTime: now, jobs, homes: [...homes, botHome], limits, today: { runs: 0, tokens: 0, cost: 0 }, channelNotifications: { pending: 2, failed: 1, lastError: 'channel-admission-pending' } }); resolve(); }, scenario === 'slow' ? 350 : 0));
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
    const chooseThread = async () => {
        await page.getByRole('button', { name: zh ? '目标线程' : 'Target thread', exact: true }).click();
        const picker = page.getByRole('dialog', { name: zh ? '选择目标线程' : 'Choose target thread', exact: true });
        await picker.getByRole('searchbox').fill(sessionId);
        await picker.getByRole('searchbox').press('ArrowDown'); await page.keyboard.press('Enter');
        await picker.waitFor({ state: 'detached' });
    };
    if (scenario === 'slow') {
        assert.equal(await page.evaluate(() => window.__cronLoadingSeen), true, 'initial task loading should have a visible placeholder');
        await page.locator('#cron-tab .pv-skeleton').first().waitFor({ state: 'detached', timeout: 1500 });
    }
    await page.locator('.cron-notice').filter({ hasText: zh ? '微信通知待处理 2' : 'WeChat notifications pending 2' }).waitFor();
    if (scenario === 'organization') {
        assert.equal(await page.locator('.cron-row').count(), 3);
        assert.equal(await page.locator('.cron-list-group').first().locator('h3').textContent(), zh ? '正在进行 · 1' : 'In progress · 1');
        assert.equal(await page.locator('.cron-list').getByText('Past task failed', { exact: true }).count(), 0);
        assert.equal(await page.locator('.cron-stat').last().locator('strong').textContent(), '1', 'only uncertain runs contribute to the review count');
        await page.screenshot({ path: `/tmp/pivane-cron-current-${width}-${language}.png`, fullPage: true });
        await page.getByRole('button', { name: zh ? '历史任务 3' : 'Past tasks 3', exact: true }).click();
        assert.equal(await page.locator('.cron-row').count(), 3);
        assert.equal(await page.locator('.cron-list .cron-status.failed').count(), 0, 'historical failures use quiet styling');
        await page.locator('.cron-row').filter({ hasText: 'Past task failed' }).click();
        await page.getByRole('button', { name: zh ? '重新安排' : 'Reschedule', exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: zh ? '启用' : 'Enable', exact: true }).count(), 0, 'expired tasks do not offer an impossible resume');
        await page.screenshot({ path: `/tmp/pivane-cron-history-${width}-${language}.png`, fullPage: true });
        await page.getByRole('button', { name: zh ? '重新安排' : 'Reschedule', exact: true }).click();
        assert.equal(await page.getByLabel(zh ? '执行日期与时间' : 'Date and time').inputValue(), '');
        assert.equal(writes.filter(w => w.path === '/api/pi/cron/jobs').length, 0, 'rescheduling opens a new draft without executing');
        await page.getByRole('button', { name: zh ? '取消' : 'Cancel', exact: true }).click();
        if (width < 680) await page.getByRole('button', { name: zh ? '返回列表' : 'Back to list', exact: true }).click();
        await page.getByRole('searchbox', { name: zh ? '搜索定时任务' : 'Search scheduled tasks' }).fill('Uncertain');
        assert.equal(await page.locator('.cron-row').count(), 1, 'search includes both views');
        await page.locator('.cron-row').click(); await page.locator('.cron-live-banner').waitFor();
        assert.equal(await page.getByRole('button', { name: zh ? '运行一次' : 'Run once', exact: true }).isDisabled(), true);
        assert.equal(await page.locator('.cron-live-banner').getByRole('button', { name: zh ? '核对并结束' : 'Review and close', exact: true }).count(), 1, 'an unfinished run has its own action even if absent from recent history');
        const upcoming = jobs.find(job => job.id === 'upcoming'), originalAt = upcoming.schedule.at, originalStart = upcoming.startsAt;
        if (width < 680) await page.getByRole('button', { name: zh ? '返回列表' : 'Back to list', exact: true }).click();
        await page.getByRole('searchbox', { name: zh ? '搜索定时任务' : 'Search scheduled tasks' }).fill('Upcoming');
        assert.equal(await page.locator('.cron-list-group > h3').textContent(), zh ? '单次安排 · 1' : 'One-time tasks · 1', 'an early completed manual run does not hide a future scheduled occurrence');
        await page.locator('.cron-row').click();
        await page.getByRole('button', { name: zh ? '编辑' : 'Edit', exact: true }).click();
        await page.getByLabel(zh ? '任务名称' : 'Task name').fill('Upcoming one-time renamed');
        await page.getByRole('button', { name: zh ? '保存任务' : 'Save task', exact: true }).click();
        await page.locator('.cron-detail-head').waitFor();
        const renamed = jobs.find(job => job.id === 'upcoming');
        assert.equal(renamed.schedule.at, originalAt, 'editing a name preserves the scheduled instant, including seconds and milliseconds, across device time zones');
        assert.equal(renamed.startsAt, originalStart, 'untouched start times retain their original precision');
        assert.deepEqual(errors, []); await context.close(); return;
    }
    await page.getByRole('button', { name: zh ? '新建任务' : 'New task', exact: true }).click();
    await page.getByLabel(zh ? '任务名称' : 'Task name').fill('Daily briefing <img src=x onerror=alert(1)>');
    await page.locator('.cron-directory-input button').click();
    let picker = page.getByRole('dialog', { name: zh ? '选择工作目录' : 'Choose working directory', exact: true });
    await picker.getByRole('searchbox').fill('Assistant'); await picker.locator('.cron-picker-result').click();
    assert.equal(await page.getByLabel(zh ? '工作目录' : 'Working directory', { exact: true }).inputValue(), cwd);
    await chooseThread();
    await page.getByRole('button', { name: zh ? '目标线程' : 'Target thread', exact: true }).click();
    picker = page.getByRole('dialog', { name: zh ? '选择目标线程' : 'Choose target thread', exact: true });
    await picker.getByRole('searchbox').fill('discussion 229');
    assert.equal(await picker.locator('.cron-picker-result').count(), 1, 'search reaches threads beyond the first page');
    const pickerOverflow = await picker.evaluate(dialog => [...dialog.querySelectorAll('input, button, .cron-picker-results'), dialog]
        .filter(n => { const r = n.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(n => n.className));
    assert.deepEqual(pickerOverflow, []);
    await page.screenshot({ path: `/tmp/pivane-cron-picker-${width}-${language}.png`, fullPage: true });
    await picker.getByRole('searchbox').fill('Management hidden');
    assert.equal(await picker.locator('.cron-picker-result').count(), 0, 'management threads are excluded');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button', { name: zh ? '目标线程' : 'Target thread', exact: true }).evaluate(n => document.activeElement === n), true);
    await page.locator('.cron-directory-input button').click();
    picker = page.getByRole('dialog', { name: zh ? '选择工作目录' : 'Choose working directory', exact: true });
    await picker.getByRole('button', { name: zh ? '浏览目录' : 'Browse folders', exact: true }).click();
    await picker.getByRole('button', { name: 'Subfolder', exact: false }).click();
    await picker.getByRole('button', { name: zh ? '使用此目录' : 'Use this folder', exact: true }).click();
    await page.getByRole('button', { name: zh ? '目标线程' : 'Target thread', exact: true }).filter({ hasText: zh ? '请选择线程' : 'Choose a thread' }).waitFor();
    await page.getByLabel(zh ? '工作目录' : 'Working directory', { exact: true }).fill(cwd);
    await page.getByLabel(zh ? '工作目录' : 'Working directory', { exact: true }).press('Tab');
    await chooseThread();
    const staleResponse = page.waitForResponse(response => response.url().includes('/api/pi/sessions?cwd=') && new URL(response.url()).searchParams.get('cwd') === '/synthetic/slow');
    await page.getByLabel(zh ? '工作目录' : 'Working directory', { exact: true }).fill('/synthetic/slow');
    await page.getByLabel(zh ? '工作目录' : 'Working directory', { exact: true }).press('Tab');
    await page.getByLabel(zh ? '工作目录' : 'Working directory', { exact: true }).fill(cwd);
    await page.getByLabel(zh ? '工作目录' : 'Working directory', { exact: true }).press('Tab');
    await chooseThread(); await staleResponse;
    assert.match(await page.locator('.cron-thread-trigger').textContent(), /Main conversation/, 'late results from the previous directory cannot replace the selection');
    await page.getByLabel(zh ? '时间' : 'Time', { exact: true }).fill('17:00');
    const futureStart = await page.evaluate(() => { const d = new Date(Date.now() + 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
    await page.getByLabel(zh ? '生效时间' : 'Starts on', { exact: true }).fill(futureStart);
    await page.getByLabel(zh ? '提示词' : 'Prompt', { exact: true }).fill('A warm, short greeting. Stay silent if the user is busy.');
    assert.equal(await page.getByLabel(zh ? '执行方式' : 'Execution mode', { exact: true }).inputValue(), 'work');
    await page.locator('.cron-execution-settings > summary').click();
    assert.equal(await page.getByLabel(zh ? '单次模型调用上限' : 'Model calls per run', { exact: true }).inputValue(), '');
    assert.equal(await page.getByLabel(zh ? '最长执行（分钟）' : 'Maximum duration (minutes)', { exact: true }).inputValue(), '360');
    await page.getByLabel(zh ? '执行方式' : 'Execution mode', { exact: true }).selectOption('text');
    assert.equal(await page.getByLabel(zh ? '单次模型调用上限' : 'Model calls per run', { exact: true }).inputValue(), '');
    assert.equal(await page.getByLabel(zh ? '最长执行（分钟）' : 'Maximum duration (minutes)', { exact: true }).inputValue(), '360');
    await page.getByLabel(zh ? '执行方式' : 'Execution mode', { exact: true }).selectOption('work');
    await page.locator('.cron-card:not(.cron-execution-settings) > summary').click();
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
    assert.equal(jobs[0].execution.maxTokens, null); assert.equal(jobs[0].execution.maxCalls, null);
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
    jobs[0].policyVersion = 1; jobs[0].execution.maxTokens = 180000; jobs[0].budget.maxTokensPerDay = 200000; jobs[0].schedule.expression = '0 17 * * 1-5';
    await page.getByRole('button', { name: zh ? '刷新' : 'Refresh', exact: true }).click();
    await page.locator('.cron-policy-summary').getByText('180,000', { exact: true }).waitFor();
    await page.getByRole('button', { name: zh ? '编辑' : 'Edit', exact: true }).click();
    assert.equal(await page.getByLabel(zh ? '频率' : 'Frequency', { exact: true }).inputValue(), 'weekdays');
    assert.equal(await page.getByLabel(zh ? '时间' : 'Time', { exact: true }).inputValue(), '17:00');
    await page.getByLabel(zh ? '频率' : 'Frequency', { exact: true }).selectOption('weekly');
    await page.getByLabel(zh ? '星期' : 'Weekday', { exact: true }).selectOption('1');
    await page.locator('.cron-execution-settings > summary').click();
    await page.locator('.cron-legacy-note').filter({ hasText: zh ? '此任务保留旧版限制' : 'This task keeps its previous limits' }).waitFor();
    await page.getByRole('button', { name: zh ? '使用推荐设置' : 'Use recommended settings', exact: true }).click();
    await page.getByRole('button', { name: zh ? '保存任务' : 'Save task', exact: true }).click();
    await page.locator('.cron-detail-head').waitFor();
    assert.equal(jobs[0].schedule.expression, '0 17 * * 1');
    assert.equal(jobs[0].policyVersion, 3); assert.equal(jobs[0].execution.maxTokens, null); assert.equal(jobs[0].budget.maxTokensPerDay, null);
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
    await chooseThread();
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
        for (const width of [1440, 393, 320]) await check(browser, `http://127.0.0.1:${server.address().port}`, width, width === 320 ? 'en' : 'zh-CN', 'organization');
        console.log('Scheduled tasks: desktop/mobile, two languages, searchable destinations, directory browsing, task history, HTTP UUID fallback, asynchronous loading and draft checks passed');
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
