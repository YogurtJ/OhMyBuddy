// Bot mode page: welcome → create → main chat with the Bot's identity, rotation reopens the
// window's new generation (never the old one), and leaving restores Pi Agent controls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BOT = '11111111-1111-4111-8111-111111111111', MAIN = '22222222-2222-4222-8222-222222222222';
const BOT2 = '33333333-3333-4333-8333-333333333333', MAIN2 = '44444444-4444-4444-8444-444444444444';
const workspace = '/fixture/PivaneBots/bot-11111111', geek = '/fixture/project';
const row = id => ({ id, cwd: workspace, path: `${workspace}/${id}.jsonl`, name: '', firstMessage: '', messageCount: 2,
    agentProfile: { id: BOT, name: '新伙伴' }, assistantProject: null, created: '2026-10-24T00:00:00Z', modified: '2026-10-24T00:00:00Z' });
const messages = [
    { role: 'user', content: '周六去杭州要带伞吗', timestamp: Date.parse('2026-10-24T06:02:00Z') },
    { role: 'assistant', content: [{ type: 'text', text: '大概率小雨，带把折叠伞就好。' }], model: 'fixture-model', provider: 'fixture',
        api: 'openai-completions', stopReason: 'stop', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        timestamp: Date.parse('2026-10-24T06:02:05Z') }
];

(async () => {
    const app = express(); app.use(express.static(path.join(__dirname, '../../public')));
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/`;
    const evidence = process.env.PI_BOT_EVIDENCE;
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const width of [1440, 393]) {
            const context = await browser.newContext({ viewport: { width, height: 860 }, locale: 'zh-CN' });
            const page = await context.newPage(), errors = [], opened = [];
            let bots = [], revision = 'r0', generation = 0, sessionId = 'gen-0', socket = null, phase = 'greeting', name = '新伙伴', face = '🦊';
            let history = [], prompts = [], responses = [], setupBodies = [], historyReads = [], second = false, known2 = undefined, aboutBodies = [];
            let modelCount = 0;
            let patchBodies = [], settingsReads = 0, model = null, preset = 'free', quietHours = { start: '23:00', end: '08:00' }, soul = '温柔耐心，说话简短。';
            const botOpens = []; let lagging = null;
            const bot = () => ({ id: BOT, name, description: '', avatar: { kind: 'emoji', value: face }, enabled: true, profileRevision: 'p',
                bot: { version: 1, enabled: true, order: 0, job: '', model, permissions: { preset, rules: 0 },
                    notify: { quietHours, dailyProactiveLimit: 5 },
                    onboarding: { version: 1, phase, firstBot: true, steps: {}, startedAt: null, completedAt: null }, createdAt: '2026-10-24T00:00:00Z' },
                windowsRevision: 'w', windows: [{ id: MAIN, kind: 'main', title: '主聊天', emoji: '💬', focus: '', createdAt: '2026-10-24T00:00:00Z',
                    updatedAt: '2026-10-24T00:00:00Z', archivedAt: null, generation, sessionId, generations: generation + 1 }] });
            // A later Bot: not the first, so it first offers to keep what 小狸 knows.
            const bot2 = () => ({ ...bot(), id: BOT2, name: '新伙伴', avatar: { kind: 'emoji', value: '🐼' },
                bot: { ...bot().bot, order: 1, onboarding: { version: 1, phase: 'greeting', firstBot: false, steps: known2 ? { known: known2 } : {}, startedAt: null, completedAt: null } },
                windows: [{ ...bot().windows[0], id: MAIN2, generation: 0, sessionId: 'b2-gen-0', generations: 1 }] });
            const list = () => second ? [bot(), bot2()] : [bot()];
            page.on('pageerror', error => errors.push(error.message));
            await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.abort());
            await page.route('**/api/**', async route => {
                const url = new URL(route.request().url()), pathname = url.pathname, method = route.request().method();
                if (pathname === '/api/pi/status') return route.fulfill({ json: { ok: true, bots: true, agentProfiles: true, projectRoots: ['/fixture'], defaultProject: geek } });
                if (pathname === '/api/pi/bots/readiness') return route.fulfill({ json: { models: modelCount } });
                if (pathname === '/api/pi/bots' && method === 'GET') return route.fulfill({ json: { version: 1, revision, bots } });
                if (pathname === '/api/pi/bots' && method === 'POST') {
                    assert.equal(JSON.parse(route.request().postData()).expectedRevision, revision);
                    if (bots.length) { second = true; bots = list(); revision = 'r2';
                        return route.fulfill({ json: { ok: true, revision, bot: { id: BOT2, name: '新伙伴' }, window: bots[1].windows[0] } }); }
                    bots = [bot()]; revision = 'r1';
                    return route.fulfill({ json: { ok: true, revision, bot: { id: BOT, name: '新伙伴' }, window: bots[0].windows[0] } });
                }
                if (pathname === `/api/pi/bots/${BOT}/onboarding`) {
                    const body = JSON.parse(route.request().postData());
                    assert.equal(body.expectedRevision, revision);
                    phase = body.action === 'skip' ? 'skipped' : 'interview'; revision = `r${Date.now()}`; bots = list();
                    return route.fulfill({ json: { ok: true, revision, bot: { id: BOT, bot: bots[0].bot } } });
                }
                if (pathname === `/api/pi/bots/${BOT}/setup`) {
                    const body = JSON.parse(route.request().postData());
                    setupBodies.push(body);
                    assert.equal(body.expectedRevision, revision);
                    name = body.changes.name ?? name; face = body.changes.avatar ?? face; revision = `r${Date.now()}`; bots = list();
                    return route.fulfill({ json: { ok: true, revision, bot: { id: BOT, name, avatar: bots[0].avatar, bot: bots[0].bot }, saved: body.changes,
                        user: { added: body.changes.aboutUser || [], documentSaved: true } } });
                }
                if (pathname === `/api/pi/bots/${BOT}/windows/${MAIN}/generations`) {
                    return route.fulfill({ json: { window: bot().windows[0], generations: Array.from({ length: generation + 1 }, (_, index) => ({ generation: index,
                        startedAt: '2026-10-20T00:00:00Z', endedAt: index === generation ? null : '2026-10-24T00:00:00Z', reason: index ? 'size' : 'initial', current: index === generation })) } });
                }
                if (pathname === `/api/pi/bots/${BOT}/windows/${MAIN}/history`) {
                    const view = url.searchParams.get('view'), revision = 'a'.repeat(64), timestamp = '2026-10-24T06:02:00Z';
                    historyReads.push([url.searchParams.get('generation'), view]);
                    const asked = Number(url.searchParams.get('generation'));
                    if (asked !== 0) return route.fulfill({ json: { generation: asked, revision: String(asked).repeat(64), total: 0, offset: 0, hasMore: false,
                        pageSize: 100, continues: false, compactionId: null, turns: [] } });
                    if (view === 'index') return route.fulfill({ json: { generation: 0, revision, total: 1, offset: 0, hasMore: false, pageSize: 100, continues: false, compactionId: null,
                        turns: [{ index: 0, kind: 'user', entryId: 'e1', timestamp, title: '周六去杭州要带伞吗', images: 0, tools: 0, reply: { entryId: 'e2', excerpt: '大概率小雨' } }] } });
                    return route.fulfill({ json: { generation: 0, revision, total: 1, start: 0, end: 1, turns: [{ index: 0, kind: 'user', entryId: 'e1', timestamp,
                        text: '周六去杭州要带伞吗', textTruncated: false, images: 0, reply: { entryId: 'e2', timestamp, model: 'm', stopReason: 'stop', errorMessage: '',
                            text: '大概率小雨，带把折叠伞就好。', truncated: false }, process: { steps: 0, tools: 0, errors: 0, startedAt: timestamp, endedAt: timestamp } }] } });
                }
                if (pathname === `/api/pi/bots/${BOT}/settings`) {
                    settingsReads++;
                    return route.fulfill({ json: { revision, bot: { id: BOT, name, avatar: { kind: 'emoji', value: face }, soul, bot: bot().bot },
                        models: { defaults: { provider: 'fixture', modelId: 'small', thinkingLevel: 'medium' }, models: [
                            { provider: 'fixture', id: 'small', name: 'Small', thinkingLevels: [] },
                            { provider: 'fixture', id: 'large', name: 'Large', thinkingLevels: ['low', 'high'] }] } } });
                }
                if (pathname === `/api/pi/bots/${BOT}` && method === 'PATCH') {
                    const body = JSON.parse(route.request().postData());
                    patchBodies.push(body);
                    // The first save meets a change made elsewhere: another device changed the personality.
                    if (patchBodies.length === 1) { revision = `r${Date.now()}`; soul = '活泼一点，多用表情。'; return route.fulfill({ status: 409, json: { error: 'Profiles changed' } }); }
                    assert.equal(body.expectedRevision, revision);
                    model = body.changes.bot?.model ?? model; preset = body.changes.bot?.permissions?.preset ?? preset;
                    if (body.changes.bot?.notify) quietHours = body.changes.bot.notify.quietHours;
                    revision = `r${Date.now()}`; bots = list();
                    return route.fulfill({ json: { ok: true, revision, bot: { id: BOT, name, avatar: bots[0].avatar, bot: bots[0].bot } } });
                }
                if (pathname === `/api/pi/bots/${BOT2}/about-sources`) return route.fulfill({ json: { sources: [{ profileId: BOT, name, avatar: { kind: 'emoji', value: face },
                    entries: ['叫我小王', '在准备考研', '周末不安排工作，消息可以晚点回，除非是家里人或者特别着急的事情'] }] } });
                if (pathname === `/api/pi/bots/${BOT2}/about`) {
                    const body = JSON.parse(route.request().postData());
                    aboutBodies.push(body); assert.equal(body.expectedRevision, revision);
                    known2 = body.action === 'copy' ? 'done' : 'skipped'; revision = `r${Date.now()}`; bots = list();
                    return route.fulfill({ json: { ok: true, revision, bot: { id: BOT2, bot: bots[1].bot }, added: body.entries || [] } });
                }
                if (pathname === `/api/pi/bots/${BOT2}/windows/${MAIN2}/session`) return route.fulfill({ json: { window: bot2().windows[0], session: { ...row('b2-gen-0'), messageCount: 0 } } });
                if (pathname === `/api/pi/bots/${BOT}/windows/${MAIN}/session`) {
                    // A resolve that lands just before the window moves on again.
                    if (lagging) { const answer = lagging; lagging = null; return route.fulfill({ json: { window: { ...bot().windows[0], sessionId: answer }, session: row(answer) } }); }
                    bots = list();
                    return route.fulfill({ json: { window: bots[0].windows[0], session: row(sessionId) } });
                }
                if (pathname === '/api/pi/projects') return route.fulfill({ json: { projects: [{ cwd: geek, name: 'project' }], roots: ['/fixture'] } });
                if (pathname === '/api/pi/sessions') return route.fulfill({ json: { sessions: [] } });
                if (pathname === '/api/pi/activity') return route.fulfill({ json: { runtimes: [], pinnedProjects: [], hiddenProjects: [], replyNotices: [] } });
                if (pathname === '/api/pi/profiles') return route.fulfill({ json: { version: 1, revision: 'p', profiles: [] } });
                return route.fulfill({ json: pathname.startsWith('/api/pi/') ? {} : [] });
            });
            await page.routeWebSocket('**/api/pi/ws', ws => {
                socket = ws;
                ws.onMessage(raw => {
                    const command = JSON.parse(raw);
                    if (command.type === 'extension_ui_response') { responses.push(command); return; }
                    const state = { model: { provider: 'fixture', id: 'fixture-model', name: 'Fixture' }, isStreaming: false, thinkingLevel: 'off' };
                    let data = {};
                    if (command.type === 'open_session' && command.botWindow) {
                        botOpens.push([command.sessionId, command.botWindow.windowId]);
                        const current = command.botWindow.profileId === BOT2 ? 'b2-gen-0' : sessionId;
                        if (command.sessionId !== current) {
                            ws.send(JSON.stringify({ type: 'response', id: command.id, command: command.type, success: false, error: 'This chat has moved to a new conversation file', errorCode: 'BOT_WINDOW_STALE' }));
                            return;
                        }
                    }
                    if (command.type === 'open_session') {
                        opened.push(command.sessionId);
                        data = { session: row(command.sessionId), state, messages: { messages: command.sessionId === 'gen-0' ? history : [] }, stats: {},
                            models: { models: [state.model] }, thinkingLevels: { levels: ['off'] }, commands: { commands: [] } };
                    } else if (command.type === 'get_state') data = state;
                    else if (command.type === 'get_messages') data = { messages: [] };
                    ws.send(JSON.stringify({ type: 'response', id: command.id, command: command.type, success: true, data }));
                    if (command.type === 'prompt') {
                        prompts.push(command.message);
                        // The Bot answers with a setup card for the user to confirm.
                        ws.send(JSON.stringify({ type: 'tool_execution_start', toolCallId: 'call-1', toolName: 'bot_setup_propose',
                            args: { name: '阿狸', avatar: '🦊', job: '帮我安排生活琐事', aboutUser: ['希望被叫做小王'] } }));
                        ws.send(JSON.stringify({ type: 'extension_ui_request', id: 'ui-1', method: 'select', title: '保存这些设置？ / Save these settings?',
                            options: ['保存 / Save', '先不改 / Not now'] }));
                    }
                });
            });
            try {
                // 1. No Bot yet: a welcome page instead of the Pi Agent start page and controls.
                await page.goto(`${base}#/bot`, { waitUntil: 'domcontentloaded' });
                await page.locator('.pi-bot-empty.is-welcome').waitFor({ timeout: 8000 });
                assert.match(await page.locator('.pi-bot-empty h2').textContent(), /认识你的 Bot/);
                // Without any chat model the page asks for one instead of starting.
                await page.locator('.pi-bot-empty [data-bot-action="models"]').waitFor({ timeout: 8000 });
                assert.equal(await page.locator('.pi-bot-empty [data-bot-action="create"]').count(), 0);
                if (evidence) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(evidence, `bot-no-model-${width}.png`) }); }
                modelCount = 1;
                await page.evaluate(() => window.dispatchEvent(new CustomEvent('workspace:models-changed')));
                await page.locator('.pi-bot-empty [data-bot-action="create"]').waitFor({ timeout: 8000 });
                for (const selector of ['#pi-project-button', '.pi-runtime-controls', '#pi-connection-banner', '#pi-session-list'])
                    assert.equal(await page.locator(selector).isVisible(), false, `${selector} hidden in Bot mode`);
                assert.equal(await page.locator('.pi-start').count(), 0, 'the Pi Agent start page never shows');
                for (const selector of ['.pi-composer-wrap', '#pi-session-pane .pi-bot-rail'])
                    assert.equal(await page.locator(selector).isVisible(), false, `${selector} hidden on the welcome page`);
                if (evidence) { await page.waitForTimeout(900); await page.screenshot({ path: path.join(evidence, `bot-welcome-${width}.png`) }); }

                // 2. Create: the main chat greets locally, then the interview's setup card is edited and saved.
                await page.locator('.pi-bot-empty .pi-bot-primary').click();
                await page.waitForFunction(() => location.hash.includes('windowId='));
                await page.locator('.pi-bot-greeting').waitFor({ timeout: 8000 });
                assert.match(await page.locator('.pi-bot-greeting p').textContent(), /还没有名字/);
                assert.deepEqual(prompts, [], 'the hello costs no model call');
                if (evidence) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(evidence, `bot-greeting-${width}.png`) }); }
                await page.locator('.pi-bot-greeting [data-bot-action="greet-yes"]').click();
                await page.locator('.pi-bot-setup:not([hidden])').waitFor({ timeout: 8000 });
                assert.deepEqual(prompts, ['好呀']);
                assert.equal(phase, 'interview');
                assert.equal(await page.locator('#pi-request-dialog[open]').count(), 0, 'no generic dialog for the setup card');
                assert.equal(await page.locator('.pi-bot-setup [data-setup-field="name"]').inputValue(), '阿狸');
                await page.locator('.pi-bot-setup [data-setup-field="name"]').fill('小狸');
                await page.locator('.pi-bot-setup [data-setup-field="job"]').fill('');
                if (evidence) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(evidence, `bot-setup-${width}.png`) }); }
                await page.locator('.pi-bot-setup .pi-bot-setup-save').click();
                await page.waitForFunction(() => document.querySelector('.pi-bot-setup').hidden);
                assert.deepEqual(setupBodies.map(body => [body.toolCallId, body.windowId, body.changes]),
                    [['call-1', MAIN, { name: '小狸', avatar: '🦊', job: null, aboutUser: ['希望被叫做小王'] }]]);
                assert.deepEqual(responses.map(item => [item.id, item.value]), [['ui-1', '保存 / Save']], 'Save is answered only after the server saved');
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-who strong')?.textContent === '小狸');
                // Reopen with a conversation to check replies carry the Bot's identity.
                history = messages;
                await page.evaluate(() => window.PiWorkspaceRoute.navigate('chat'));
                await page.waitForFunction(() => !document.querySelector('#chat-tab').classList.contains('pi-bot-mode'));
                await page.evaluate(id => window.PiWorkspaceRoute.navigate('bot', { profileId: id }), BOT);
                await page.locator('.pi-message.assistant').waitFor({ timeout: 8000 });
                assert.equal(await page.locator('.pi-message.assistant > header > strong').first().textContent(), '小狸');
                assert.equal(await page.locator('.pi-message.assistant > header .pi-bot-face').first().textContent(), '🦊');
                assert.equal(await page.locator('.pi-message.assistant > header > span:not(.pi-bot-face)').first().isVisible().catch(() => false), false, 'no model name');
                assert.equal(await page.locator('#pi-input').getAttribute('placeholder'), '给 小狸 发消息');
                for (const selector of ['.pi-composer-models', '.pi-tool-rail', '#pi-composer-status'])
                    assert.equal(await page.locator(selector).isVisible(), false, `${selector} hidden in a Bot chat`);
                assert.match(await page.locator('#pi-bot-header .pi-bot-who strong').textContent(), /小狸/);
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected');
                assert.deepEqual(opened, ['gen-0', 'gen-0']);
                if (width < 700) {
                    await page.locator('#pi-bot-header .pi-bot-menu').click();
                    await page.locator('#pi-session-pane.open .pi-bot-window[aria-current="page"]').waitFor();
                    if (evidence) { await page.waitForTimeout(400); await page.screenshot({ path: path.join(evidence, `bot-drawer-${width}.png`) }); }
                    await page.locator('#pi-session-pane .pi-bot-window[aria-current="page"]').click();
                    await page.waitForFunction(() => !document.querySelector('#pi-session-pane').classList.contains('open'));
                } else {
                    assert.equal(await page.locator('.pi-bot-rail-item[aria-current="true"]').count(), 1);
                    assert.equal(await page.locator('.pi-bot-window[aria-current="page"] .pi-bot-window-title').textContent(), '主聊天');
                }
                if (evidence) { await page.waitForTimeout(400); await page.screenshot({ path: path.join(evidence, `bot-chat-${width}.png`) }); }

                // 3. Rotation: the page opens the new generation and never reconnects to the old one.
                generation = 1; sessionId = 'gen-1';
                socket.send(JSON.stringify({ type: 'gateway_window_rotated', profileId: BOT, windowId: MAIN, generation: 1 }));
                await socket.close({ code: 4007, reason: 'Window rotated' });
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected' && !document.querySelector('.pi-message.assistant'));
                await page.waitForTimeout(2200); // past the ordinary reconnect delay
                assert.deepEqual(opened, ['gen-0', 'gen-0', 'gen-1']);
                assert.ok((await page.evaluate(() => location.hash)).includes(`windowId=${MAIN}`), 'the route names the window, not the session');
                // The earlier generation continues above, read from the server, without a hero in between.
                await page.locator('#pi-bot-history .pi-bot-history-generation .pi-archive-head-text').waitFor({ timeout: 8000 });
                assert.match(await page.locator('#pi-bot-history .pi-archive-head-text').textContent(), /更早的聊天/);
                assert.equal(await page.locator('.pi-bot-empty.is-continuing').count(), 1);
                await page.locator('#pi-bot-history .pi-archive-load').click();
                await page.locator('#pi-bot-history .pi-archive-reply').waitFor({ timeout: 8000 });
                assert.match(await page.locator('#pi-bot-history').innerText(), /周六去杭州要带伞吗[\s\S]*大概率小雨/);
                assert.deepEqual(historyReads, [['0', 'index'], ['0', 'turns']]);
                assert.equal(await page.locator('#pi-bot-history .pi-message.assistant > header > strong').first().textContent(), '小狸');
                if (evidence) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(evidence, `bot-history-${width}.png`) }); }

                // 3b. The window moves on while the page is offline (no rotation notice), and the
                // generation it skipped has no turns: an ordinary reconnect resolves the window
                // again and opens the new generation, and history steps past the empty one.
                generation = 2; sessionId = 'gen-2'; historyReads = [];
                await socket.close({ code: 1011, reason: 'Connection lost' });
                await page.waitForFunction(() => document.querySelector('#pi-bot-history .pi-archive-head-text') && document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected', null, { timeout: 15000 });
                await page.waitForTimeout(400);
                assert.deepEqual(opened, ['gen-0', 'gen-0', 'gen-1', 'gen-2'], 'the retired generation is never reopened');
                assert.ok(botOpens.every(([id]) => id.startsWith('gen-')) && botOpens.length === opened.length, 'every Bot open names its window');
                assert.deepEqual(historyReads.filter(([, view]) => view === 'index'), [['1', 'index'], ['0', 'index']], 'the empty generation is skipped');
                assert.match(await page.locator('#pi-bot-history .pi-bot-history-generation:not([hidden]) .pi-archive-head-text').first().textContent(), /更早的聊天/);
                // A runtime restart (1012) on the same generation is a plain reconnect.
                await socket.close({ code: 1012, reason: 'Session runtime changed' });
                for (let i = 0; i < 100 && opened.length < 5; i++) await page.waitForTimeout(100);
                assert.deepEqual(opened.slice(3), ['gen-2', 'gen-2']);
                // The window moves on between resolving and opening: the server refuses the stale
                // open and the page resolves again, skipping two empty generations in history.
                generation = 4; sessionId = 'gen-4'; lagging = 'gen-2'; historyReads = [];
                await socket.close({ code: 1011, reason: 'Connection lost' });
                for (let i = 0; i < 150 && opened.at(-1) !== 'gen-4'; i++) await page.waitForTimeout(100);
                assert.deepEqual(opened.slice(5), ['gen-4']);
                assert.deepEqual(botOpens.slice(-4).map(([id]) => id), ['gen-2', 'gen-2', 'gen-2', 'gen-4'], 'the stale open was refused, then the current one opened');
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected', null, { timeout: 15000 });
                for (let i = 0; i < 50 && historyReads.length < 4; i++) await page.waitForTimeout(100);
                assert.deepEqual(historyReads.filter(([, view]) => view === 'index').map(([g]) => g), ['3', '2', '1', '0']);

                // 4. Settings: one sheet; only what changed is saved, and a conflict keeps the edits.
                if (width < 700) {
                    await page.locator('#pi-bot-header .pi-bot-menu').click();
                    await page.locator('#pi-session-pane.open .pi-bot-settings').waitFor();
                }
                await page.locator('.pi-bot-settings').click();
                await page.locator('.pi-bot-sheet[open] select').first().waitFor({ timeout: 8000 });
                const sheet = page.locator('.pi-bot-sheet[open]');
                assert.equal(await sheet.locator('h2').textContent(), '小狸 的设置');
                if (evidence) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(evidence, `bot-settings-open-${width}.png`) }); }
                assert.equal(await sheet.locator('textarea').nth(1).inputValue(), '温柔耐心，说话简短。');
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true, 'nothing to save yet');
                assert.equal(await sheet.locator('select').first().locator('option').first().textContent(), '跟随默认（Small）');
                await sheet.locator('select').first().selectOption({ label: 'Large' });
                await sheet.locator('select').nth(1).selectOption({ label: '高' });
                await sheet.locator('.pi-bot-sheet-preset', { hasText: '稳妥' }).click();
                if (evidence) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(evidence, `bot-settings-${width}.png`) }); }
                await sheet.locator('.pi-bot-sheet-save').click();
                await page.waitForFunction(() => /别处改过/.test(document.querySelector('.pi-bot-sheet-status')?.textContent || ''));
                assert.equal(settingsReads, 2, 'the conflict rereads the saved settings');
                assert.equal(await sheet.locator('.pi-bot-sheet-preset input:checked').evaluate(input => input.value), 'balanced', 'the edits stay');
                assert.equal(await sheet.locator('select').first().evaluate(select => select.selectedOptions[0].textContent), 'Large');
                assert.equal(await sheet.locator('textarea').nth(1).inputValue(), '活泼一点，多用表情。', 'untouched fields follow the newer saved value');
                await sheet.locator('.pi-bot-sheet-save').click();
                await page.locator('.pi-bot-sheet').waitFor({ state: 'detached', timeout: 8000 });
                const expected = { bot: { model: { provider: 'fixture', id: 'large', thinking: 'high' }, permissions: { preset: 'balanced' } } };
                assert.deepEqual(patchBodies.map(body => body.changes), [expected, expected]);
                assert.equal(preset, 'balanced');

                // 5. A second Bot first offers to keep what 小狸 knows; only ticked notes are copied.
                if (width < 700) {
                    await page.locator('#pi-bot-header .pi-bot-menu').click();
                    await page.locator('#pi-session-pane.open .pi-bot-rail-add').waitFor();
                }
                await page.locator('.pi-bot-rail-add').click();
                await page.locator('.pi-bot-greeting.is-known').waitFor({ timeout: 8000 });
                assert.match(await page.locator('.pi-bot-greeting').innerText(), /小狸 已经知道你的这些事/);
                assert.equal(await page.locator('.pi-bot-known-list input:checked').count(), 3, 'everything is ticked to start with');
                await page.locator('.pi-bot-known-list label', { hasText: '在准备考研' }).click();
                assert.equal(await page.locator('[data-bot-action="known-copy"]').textContent(), '记住这 2 条');
                assert.deepEqual(prompts, ['好呀'], 'no model call for the offer');
                if (evidence) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(evidence, `bot-known-${width}.png`) }); }
                await page.locator('[data-bot-action="known-copy"]').click();
                await page.waitForFunction(() => /这些我都记下了/.test(document.querySelector('.pi-bot-greeting')?.textContent || ''));
                assert.deepEqual(aboutBodies.map(body => [body.action, body.fromProfileId, body.entries]),
                    [['copy', BOT, ['叫我小王', '周末不安排工作，消息可以晚点回，除非是家里人或者特别着急的事情']]]);
                assert.equal(await page.locator('.pi-bot-greeting [data-bot-action="greet-yes"]').isVisible(), true);

                // 6. Leaving Bot mode restores the Pi Agent controls.
                await page.evaluate(() => window.PiWorkspaceRoute.navigate('chat'));
                await page.waitForFunction(() => !document.querySelector('#chat-tab').classList.contains('pi-bot-mode'));
                assert.equal(await page.locator('#pi-bot-pane').isVisible(), false);
                if (width >= 700) assert.equal(await page.locator('#pi-project-button').isVisible(), true);
                assert.notEqual(await page.locator('#pi-input').getAttribute('placeholder'), '给 小狸 发消息');

                if (width < 700) {
                    const cells = await page.evaluate(() => [...document.querySelectorAll('#workspace-sidebar .nav-btn, #workspace-sidebar .sidebar-tool-button')]
                        .filter(node => node.offsetParent).map(node => Math.round(node.getBoundingClientRect().width)));
                    assert.equal(cells.length, 6, JSON.stringify(cells));
                    assert.ok(cells.every(cell => Math.abs(cell - cells[0]) <= 1), `equal bottom-bar cells ${JSON.stringify(cells)}`);
                }
                assert.deepEqual(errors, []);
                assert.equal(await page.evaluate(() => document.body.scrollWidth <= innerWidth), true, 'no horizontal overflow');
                console.log(JSON.stringify({ width, status: 'passed', opened }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
