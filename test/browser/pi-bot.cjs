// Bot mode page: welcome → create (the new Bot starts as the 小石 preset; getting acquainted does
// not ask for a face) → main chat with the Bot's identity, rotation reopens the
// window's new generation (never the old one), and leaving restores Pi Agent controls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { settingsPage } = require('./pi-bot-fixture.js');

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
// A turn with one step (a delivered file) before the final reply.
const DELIVERY = 'd'.repeat(64), usage = messages[1].usage;
const toolTurn = [
    { role: 'user', content: '把计划做成文件', timestamp: Date.parse('2026-10-24T06:03:00Z') },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'tc-1', name: 'deliver_files', arguments: { files: ['计划.md'] } }], model: 'fixture-model', provider: 'fixture',
        api: 'openai-completions', stopReason: 'toolUse', usage, timestamp: Date.parse('2026-10-24T06:03:04Z') },
    { role: 'toolResult', toolCallId: 'tc-1', toolName: 'deliver_files', content: [{ type: 'text', text: 'Delivered 1 file' }], isError: false,
        details: { pivaneDeliverable: { reference: { id: DELIVERY, manifestRevision: 'e'.repeat(64) }, title: '一周学习计划',
            files: [{ name: '计划.md', size: 40, href: `#pi-delivery=${DELIVERY}/0` }] } }, timestamp: Date.parse('2026-10-24T06:03:05Z') },
    { role: 'assistant', content: [{ type: 'text', text: '放好啦。' }], model: 'fixture-model', provider: 'fixture',
        api: 'openai-completions', stopReason: 'stop', usage, timestamp: Date.parse('2026-10-24T06:03:15Z') }
];
const APPROVAL = '允许这一步吗？ / Allow this step?';
// The face a new Bot starts with (server/bot/bot-service.js); not a choice of the user's.
const NEW_FACE = { kind: 'preset', id: 'pivane-pebble' };

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
            let bots = [], revision = 'r0', generation = 0, sessionId = 'gen-0', socket = null, phase = 'greeting', name = '新伙伴', face = NEW_FACE;
            let history = [], prompts = [], responses = [], setupBodies = [], historyReads = [], second = false, known2 = undefined, aboutBodies = [];
            let modelCount = 0, profileList = [], reconnectHistory = null, scheduleDeletes = [];
            let patchBodies = [], settingsReads = 0, model = null, preset = 'free', quietHours = { start: '23:00', end: '08:00' }, soul = '温柔耐心，说话简短。';
            const botOpens = []; let lagging = null;
            const bot = () => ({ id: BOT, name, description: '', avatar: typeof face === 'string' ? { kind: 'emoji', value: face } : face, enabled: true, profileRevision: 'p',
                chosen: { name: name !== '新伙伴', avatar: face !== NEW_FACE },
                bot: { version: 1, enabled: true, order: 0, job: '', model, permissions: { preset, rules: 0 },
                    notify: { quietHours, dailyProactiveLimit: 20 },
                    onboarding: { version: 1, phase, firstBot: true, steps: {}, defaultAvatar: NEW_FACE.id, startedAt: null, completedAt: null }, createdAt: '2026-10-24T00:00:00Z' },
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
                if (pathname === '/api/pi/status') return route.fulfill({ json: { ok: true, bots: true, agentProfiles: true, assistantProjects: true, deliverables: true, filePreviews: true, fileViewer: true, sessionWorkflows: true,
                    projectRoots: ['/fixture'], defaultProject: geek } });
                if (pathname === '/api/pi/deliverables') return route.fulfill({ json: { name: '计划.md', mime: 'text/markdown', size: 40, kind: 'markdown',
                    createdAt: '2026-10-24T06:03:05Z', revision: 'f'.repeat(64),
                    content: '# 一周学习计划\n\n周六 15:00 数学' } });
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
                    return route.fulfill({ json: { revision, bot: { id: BOT, name, avatar: bot().avatar, soul, bot: bot().bot },
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
                if (pathname === '/api/pi/cron') return route.fulfill({ json: { jobs: [{ id: BOT, name: '今晚复习', revision: 2 }] } });
                if (pathname === `/api/pi/cron/jobs/${BOT}/actions`) {
                    scheduleDeletes.push(JSON.parse(route.request().postData())); return route.fulfill({ json: { ok: true } });
                }
                if (pathname === '/api/pi/projects') return route.fulfill({ json: { projects: [{ cwd: geek, name: 'project' }], roots: ['/fixture'] } });
                // Session workflows know the first exchange: the user's retry and the reply's fork both match.
                if (pathname.endsWith('/workflow')) return route.fulfill({ json: { leafId: 'e2', lastUserId: 'e1', versions: [],
                    prompts: [{ entryId: 'e1', text: messages[0].content, timestamp: messages[0].timestamp }],
                    replies: [{ entryId: 'e2', text: messages[1].content[0].text, timestamp: messages[1].timestamp }] } });
                if (pathname.endsWith('/deferred')) return route.fulfill({ json: { jobs: [] } });
                if (pathname === '/api/pi/sessions') return route.fulfill({ json: { sessions: [] } });
                if (pathname === '/api/pi/activity') return route.fulfill({ json: { runtimes: [], pinnedProjects: [], hiddenProjects: [], replyNotices: [] } });
                if (pathname === '/api/pi/profiles') return route.fulfill({ json: { version: 1, revision: 'p', profiles: profileList } });
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
                        data = { session: row(command.sessionId), state, messages: { messages: reconnectHistory || (command.sessionId === 'gen-0' ? history : []) }, stats: {},
                            models: { models: [state.model] }, thinkingLevels: { levels: ['off'] }, commands: { commands: [] } };
                    } else if (command.type === 'get_state') data = state;
                    else if (command.type === 'get_messages') data = { messages: reconnectHistory || [] };
                    ws.send(JSON.stringify({ type: 'response', id: command.id, command: command.type, success: true, data }));
                    if (command.type === 'prompt') {
                        prompts.push(command.message);
                        // The Bot answers with a setup card for the user to confirm.
                        ws.send(JSON.stringify({ type: 'tool_execution_start', toolCallId: 'call-1', toolName: 'bot_setup_propose',
                            args: { name: '阿狸', job: '帮我安排生活琐事', aboutUser: ['希望被叫做小王'] } }));
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
                assert.equal(await page.locator('.pi-bot-empty.is-welcome .pi-bot-face .pi-preset-svg[data-preset="pivane-pebble"]').count(), 1, 'the welcome shows the face a new Bot starts with');
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
                assert.equal(await page.locator('.pi-bot-greeting-head .pi-preset-svg[data-preset="pivane-pebble"]').count(), 1, 'a new Bot starts as 小石');
                assert.deepEqual(prompts, [], 'the hello costs no model call');
                if (evidence) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(evidence, `bot-greeting-${width}.png`) }); }
                await page.locator('.pi-bot-greeting [data-bot-action="greet-yes"]').click();
                await page.locator('.pi-bot-setup:not([hidden])').waitFor({ timeout: 8000 });
                assert.deepEqual(prompts, ['好呀']);
                assert.equal(phase, 'interview');
                assert.equal(await page.locator('#pi-request-dialog[open]').count(), 0, 'no generic dialog for the setup card');
                assert.equal(await page.locator('.pi-bot-setup [data-setup-field="name"]').inputValue(), '阿狸');
                assert.equal(await page.locator('.pi-bot-setup [data-setup-field="avatar"]').count(), 0, 'getting acquainted does not ask for a face');
                assert.equal(await page.locator('.pi-bot-setup [data-setup-field="job"]').evaluate(node => node.tagName), 'TEXTAREA', 'the job wraps');
                await page.locator('.pi-bot-setup [data-setup-field="name"]').fill('小狸');
                await page.locator('.pi-bot-setup [data-setup-field="job"]').fill('');
                if (evidence) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(evidence, `bot-setup-${width}.png`) }); }
                await page.locator('.pi-bot-setup .pi-bot-setup-save').click();
                await page.waitForFunction(() => document.querySelector('.pi-bot-setup').hidden);
                assert.deepEqual(setupBodies.map(body => [body.toolCallId, body.windowId, body.changes, body.workStyleShown]),
                    [['call-1', MAIN, { name: '小狸', job: null, aboutUser: ['希望被叫做小王'] }, false]], 'only the fields on the card');
                assert.deepEqual(responses.map(item => [item.id, item.value]), [['ui-1', '保存 / Save']], 'Save is answered only after the server saved');
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-who strong')?.textContent === '小狸');
                // Reopen with a conversation to check replies carry the Bot's identity.
                history = [...messages, ...toolTurn];
                await page.evaluate(() => window.PiWorkspaceRoute.navigate('chat'));
                await page.waitForFunction(() => !document.querySelector('#chat-tab').classList.contains('pi-bot-mode'));
                await page.evaluate(id => window.PiWorkspaceRoute.navigate('bot', { profileId: id }), BOT);
                await page.locator('.pi-message.assistant').first().waitFor({ timeout: 8000 });
                assert.equal(await page.locator('.pi-message.assistant > header > strong').first().textContent(), '小狸');
                assert.equal(await page.locator('.pi-message.assistant > header .pi-bot-face').count(), 0, 'no repeated avatar above replies');
                assert.equal(await page.locator('#pi-bot-header .pi-bot-identity > .pi-bot-face .pi-preset-svg[data-preset="pivane-pebble"]').count(), 1, 'still 小石');
                assert.equal(await page.locator('.pi-message.assistant > header').first().isVisible(), false);
                assert.equal(await page.locator('.pi-message.assistant > header > span:not(.pi-bot-face)').first().isVisible().catch(() => false), false, 'no model name');
                assert.equal(await page.locator('#pi-input').getAttribute('placeholder'), '给 小狸 发消息');
                for (const selector of ['.pi-composer-models', '.pi-tool-rail', '#pi-composer-status'])
                    assert.equal(await page.locator(selector).isVisible(), false, `${selector} hidden in a Bot chat`);
                assert.match(await page.locator('#pi-bot-header .pi-bot-who strong').textContent(), /小狸/);
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected');
                assert.deepEqual(opened, ['gen-0', 'gen-0']);
                // A Bot chat is never forked into an ordinary thread (UAT-06); editing the last question in place stays.
                await page.locator('#pi-transcript-content article.user [data-message-workflow="retry"]').first().waitFor({ state: 'attached' });
                assert.equal(await page.locator('[data-message-workflow="reply-fork"]').count(), 0, 'no reply fork in a Bot chat');

                // 2b. Everyday words for a turn's steps; a delivered file opens the preview panel,
                // and nothing else of the right panel (or its phone scrim) shows in Bot mode.
                const turnLabel = await page.locator('.pi-turn-group .pi-turn-label').first().textContent();
                assert.match(turnLabel, /^用时 .+ · 1 个步骤$/, turnLabel);
                await page.locator('.pi-delivery-receipt-open').first().click();
                await page.locator('#pi-inspector.open.show-changes').waitFor({ timeout: 8000 });
                assert.equal(await page.locator('#pi-inspector').isVisible(), true, 'the file preview shows in Bot mode');
                for (const selector of ['#pi-inspector-tabs', '#pi-inspector-title', '#pi-files-toolbar', '#pi-file-explorer', '#pi-changes-file-list'])
                    assert.equal(await page.locator(selector).isVisible(), false, `${selector} stays hidden in the preview`);
                // The delivered snapshot is read (the fixture page has no Markdown renderer, so the body itself is not checked).
                await page.waitForFunction(() => /交付快照/.test(document.querySelector('#pi-file-status')?.textContent || ''), null, { timeout: 8000 });
                assert.equal(await page.locator('#pi-changes-title').textContent(), '计划.md');
                if (evidence) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(evidence, `bot-preview-${width}.png`) }); }
                await page.locator('#pi-close-inspector').click();
                await page.waitForFunction(() => !document.querySelector('#pi-inspector').classList.contains('open'));
                await page.evaluate(() => { const panel = document.getElementById('pi-inspector'); panel.classList.remove('show-changes'); panel.classList.add('open'); });
                await page.waitForFunction(() => !document.querySelector('#pi-inspector').classList.contains('open'));
                assert.equal(await page.locator('.pi-drawer-scrim:not(.hidden)').count(), 0, 'no empty scrim');

                // 2c. A streaming reply is signed by the Bot, and careful-mode approvals are inline cards.
                socket.send(JSON.stringify({ type: 'agent_start' }));
                socket.send(JSON.stringify({ type: 'message_start', message: { role: 'assistant', content: [], timestamp: Date.now() } }));
                await page.locator('.pi-message.assistant.streaming').waitFor({ state: 'attached', timeout: 8000 });
                assert.equal(await page.locator('.pi-message.assistant.streaming > header > strong').textContent(), '小狸');
                assert.equal(await page.locator('.pi-message.assistant.streaming > header .pi-bot-face').count(), 0);
                socket.send(JSON.stringify({ type: 'tool_execution_start', toolCallId: 'call-2', toolName: 'bash', args: { command: 'ls -la' } }));
                socket.send(JSON.stringify({ type: 'extension_ui_request', id: 'ui-2', method: 'confirm', title: APPROVAL, message: `command #${'1'.repeat(16)}\n\nls -la` }));
                await page.locator('.pi-bot-approval:not([hidden])').waitFor({ timeout: 8000 });
                assert.equal(await page.locator('#pi-request-dialog[open]').count(), 0, 'no generic dialog for an approval');
                assert.equal(await page.locator('.pi-bot-approval header strong').textContent(), '小狸 想运行一条命令');
                assert.equal(await page.locator('.pi-bot-approval .pi-bot-approval-detail').textContent(), 'ls -la');
                await page.waitForFunction(() => document.querySelector('#pi-transcript-activity .pi-activity-label')?.textContent === '等你确认');
                if (evidence) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(evidence, `bot-approval-${width}.png`) }); }
                await page.locator('.pi-bot-approval-allow').click();
                assert.deepEqual(responses.at(-1), { type: 'extension_ui_response', id: 'ui-2', confirmed: true });
                socket.send(JSON.stringify({ type: 'gateway_ui_resolved', id: 'ui-2' }));
                await page.waitForFunction(() => document.querySelector('.pi-bot-approval').hidden);
                socket.send(JSON.stringify({ type: 'extension_ui_request', id: 'ui-3', method: 'confirm', title: APPROVAL, message: `outside #${'2'.repeat(16)}\n\n/home/me/notes.md` }));
                socket.send(JSON.stringify({ type: 'extension_ui_request', id: 'ui-4', method: 'confirm', title: APPROVAL, message: `action #${'3'.repeat(16)}\n\ndeliver_files` }));
                await page.waitForFunction(() => /后面还有 1 步/.test(document.querySelector('.pi-bot-approval:not([hidden])')?.textContent || ''));
                assert.equal(await page.locator('.pi-bot-approval header strong').textContent(), '小狸 想改工作目录以外的文件');
                await page.locator('.pi-bot-approval .pi-bot-setup-later').click();
                assert.deepEqual(responses.at(-1), { type: 'extension_ui_response', id: 'ui-3', confirmed: false });
                socket.send(JSON.stringify({ type: 'gateway_ui_resolved', id: 'ui-3' }));
                await page.waitForFunction(() => document.querySelector('.pi-bot-approval header strong')?.textContent === '小狸 想做这一步');
                assert.equal(await page.locator('.pi-bot-approval .pi-bot-approval-detail').textContent(), '把文件交给你', 'a familiar step reads as what it does');
                socket.send(JSON.stringify({ type: 'gateway_ui_resolved', id: 'ui-4' }));
                await page.waitForFunction(() => document.querySelector('.pi-bot-approval').hidden);
                socket.send(JSON.stringify({ type: 'tool_execution_end', toolCallId: 'call-2', toolName: 'bash', result: { content: [{ type: 'text', text: 'README.md' }] }, isError: false }));
                socket.send(JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: '好了。' }], stopReason: 'stop', timestamp: Date.now() } }));
                socket.send(JSON.stringify({ type: 'agent_end', messages: [] }));
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

                const headerBox = await page.locator('#pi-bot-header').boundingBox(), identityBox = await page.locator('#pi-bot-header .pi-bot-identity').boundingBox();
                assert.ok(Math.abs(headerBox.x + headerBox.width / 2 - identityBox.x - identityBox.width / 2) < 3, 'the large identity is centered in the chat column');
                assert.ok((await page.locator('#pi-bot-header .pi-bot-identity > .pi-bot-face').boundingBox()).width >= 64);
                // Live preset state uses the real WebSocket path; lists remain static.
                face = { kind: 'preset', id: 'pivane-bean' }; bots = list();
                await page.evaluate(() => window.dispatchEvent(new Event('workspace:agent-profiles-changed')));
                await page.locator('#pi-bot-header .pi-preset-svg[data-preset="pivane-bean"]').waitFor();
                assert.equal(await page.locator('.pi-bot-rail [data-avatar-live="true"]').count(), 0);
                // The identity overlays the scroller: it never consumes a full-width header row.
                const geometry = await page.evaluate(() => {
                    const viewport = document.querySelector('.pi-transcript-viewport').getBoundingClientRect();
                    const shell = document.querySelector('.pi-transcript-shell').getBoundingClientRect();
                    const face = document.querySelector('.pi-bot-identity > .pi-bot-face').getBoundingClientRect();
                    return { top: viewport.top - shell.top, faceTop: face.top - viewport.top };
                });
                assert.ok(Math.abs(geometry.top) < 2, 'messages use the full height of the chat column');
                assert.ok(geometry.faceTop >= 0 && geometry.faceTop < 8, 'the avatar sits at the top of the conversation');
                // A long synthetic reading sample checks scrolling and pointer access beside the badge.
                await page.evaluate(() => {
                    const article = document.createElement('article'); article.id = 'header-scroll-probe'; article.className = 'pi-message assistant';
                    const body = document.createElement('div'); body.className = 'pi-message-body';
                    const text = document.createElement('div'); text.className = 'pi-markdown';
                    for (let i = 0; i < 32; i++) {
                        const p = document.createElement('p');
                        p.textContent = i % 2 ? '头像留在聊天上方，翻看之前说过的话时，两侧的内容仍然沿着阅读区域自然向上滚动。'
                            : '把这周的安排慢慢理清：周三整理笔记，周五留一点时间回顾，周末带上相机出去走走。';
                        if (i === 12) {
                            const link = document.createElement('a'); link.href = '#probe'; link.id = 'header-probe-link'; link.textContent = '查看周末的安排';
                            link.addEventListener('click', event => { event.preventDefault(); link.dataset.clicked = 'true'; }); p.prepend(link, document.createElement('br'));
                        }
                        text.append(p);
                    }
                    body.append(text); article.append(body); document.querySelector('#pi-transcript-content').append(article);
                });
                const originalTheme = await page.locator('html').getAttribute('data-theme');
                const originalViewport = page.viewportSize();
                for (const variant of [{ width, theme: 'daylight' }, { width, theme: 'dark' }, ...(width < 700 ? [{ width: 320, theme: 'daylight' }] : [])]) {
                    await page.setViewportSize({ width: variant.width, height: 860 });
                    await page.locator('html').evaluate((node, theme) => node.dataset.theme = theme, variant.theme);
                    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                    const point = await page.evaluate(() => {
                        const scroller = document.querySelector('#pi-transcript'), link = document.querySelector('#header-probe-link');
                        scroller.scrollTop += link.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 70;
                        const box = link.getBoundingClientRect();
                        return { x: box.x + box.width / 2, y: box.y + box.height / 2, relativeTop: box.y - scroller.getBoundingClientRect().top };
                    });
                    assert.ok(Math.abs(point.relativeTop - 70) < 2, 'the link reaches the floating identity rather than staying below a header');
                    await page.mouse.click(point.x, point.y);
                    assert.equal(await page.locator('#header-probe-link').getAttribute('data-clicked'), 'true', 'the floating header does not intercept links beside it');
                    await page.locator('#header-probe-link').evaluate(node => delete node.dataset.clicked);
                    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the badge fits even a narrow phone');
                    if (evidence) await page.screenshot({ path: path.join(evidence, `bot-floating-${variant.theme}-${variant.width}.png`) });
                }
                await page.setViewportSize(originalViewport);
                await page.locator('html').evaluate((node, theme) => node.dataset.theme = theme, originalTheme);
                await page.locator('#header-scroll-probe').evaluate(node => node.remove());
                // Clicking the floating face, and keyboard activation of its button, still open settings.
                await page.locator('.pi-bot-identity > .pi-bot-face').click();
                await page.locator('.pi-bot-sheet[open]').waitFor();
                await page.locator('.pi-bot-sheet-close').click();
                await page.locator('.pi-bot-identity').focus(); await page.keyboard.press('Enter');
                await page.locator('.pi-bot-sheet[open]').waitFor(); await page.locator('.pi-bot-sheet-close').click();
                const pose = () => page.locator('#pi-bot-header .pi-bot-identity > .pi-bot-face').getAttribute('data-avatar-state');
                socket.send(JSON.stringify({ type: 'agent_start' }));
                await page.waitForFunction(() => document.querySelector('.pi-bot-identity > .pi-bot-face')?.dataset.avatarState === 'working');
                socket.send(JSON.stringify({ type: 'tool_execution_end', toolCallId: 'recoverable', toolName: 'read', isError: true, result: { content: [] } }));
                assert.equal(await pose(), 'working', 'a recoverable tool error does not fail the turn');
                socket.send(JSON.stringify({ type: 'extension_ui_request', id: 'pose-wait', method: 'confirm', title: APPROVAL, message: `command #${'4'.repeat(16)}\n\npwd` }));
                await page.waitForFunction(() => document.querySelector('.pi-bot-identity > .pi-bot-face')?.dataset.avatarState === 'waiting');
                assert.equal(await page.locator('.pi-bot-status').evaluate(node => node.classList.contains('is-quiet')), false, 'waiting keeps its status text');
                socket.send(JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [], stopReason: 'stop', timestamp: Date.now() } }));
                socket.send(JSON.stringify({ type: 'agent_settled' }));
                await page.waitForFunction(() => document.querySelector('.pi-bot-identity > .pi-bot-face')?.dataset.avatarState === 'waiting');
                socket.send(JSON.stringify({ type: 'gateway_ui_resolved', id: 'pose-wait' }));
                await page.waitForFunction(() => document.querySelector('.pi-bot-identity > .pi-bot-face')?.dataset.avatarState === 'idle');
                socket.send(JSON.stringify({ type: 'agent_start' }));
                socket.send(JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [], stopReason: 'stop', timestamp: Date.now() } }));
                socket.send(JSON.stringify({ type: 'agent_settled' }));
                await page.waitForFunction(() => document.querySelector('.pi-bot-identity > .pi-bot-face')?.dataset.avatarState === 'done');
                socket.send(JSON.stringify({ type: 'agent_start' }));
                await page.waitForFunction(() => document.querySelector('.pi-bot-identity > .pi-bot-face')?.dataset.avatarState === 'working');
                await page.waitForTimeout(1200);
                assert.equal(await pose(), 'working', 'new work interrupts the previous celebration timer');
                socket.send(JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [], stopReason: 'stop', timestamp: Date.now() } }));
                socket.send(JSON.stringify({ type: 'agent_settled', aborted: true }));
                await page.waitForFunction(() => document.querySelector('.pi-bot-identity > .pi-bot-face')?.dataset.avatarState === 'idle');
                if (evidence) await page.screenshot({ path: path.join(evidence, `bot-preset-header-${width}.png`) });
                face = '🦊'; bots = list();
                await page.evaluate(() => window.dispatchEvent(new Event('workspace:agent-profiles-changed')));

                // 3. Rotation: the page opens the new generation and never reconnects to the old one.
                generation = 1; sessionId = 'gen-1';
                socket.send(JSON.stringify({ type: 'gateway_window_rotated', profileId: BOT, windowId: MAIN, generation: 1 }));
                await socket.close({ code: 4007, reason: 'Window rotated' });
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected' && !document.querySelector('.pi-message.assistant'));
                assert.equal(await page.locator('.pi-bot-status').evaluate(node => node.classList.contains('is-quiet')), true, 'idle uses the compact dot while keeping an accessible label');
                assert.ok(await page.locator('.pi-bot-status').getAttribute('aria-label'));
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

                // Review R1: a persisted task receipt remains actionable through a same-session reconnect.
                reconnectHistory = [{ role: 'toolResult', toolName: 'bot_schedule', toolCallId: 'schedule-reconnect', timestamp: Date.now(),
                    content: [{ type: 'text', text: '{}' }], details: { pivaneBotSchedule: { v: 1, action: 'created', job: {
                        id: BOT, title: '今晚复习', message: '复习数学', schedule: { kind: 'once', at: Date.parse('2026-11-01T19:00:00+08:00'), timeZone: 'Asia/Shanghai' },
                        revision: 1, enabled: true } } } }];
                await socket.close({ code: 1012, reason: 'load persisted task' });
                await page.locator('.pi-bot-schedule-card').waitFor({ timeout: 15000 });
                await page.locator('.pi-bot-schedule-card').evaluate(node => { window.retainedTask = node; });
                const opensBeforeReconnect = opened.length;
                await socket.close({ code: 1012, reason: 'same-session reconnect' });
                for (let i = 0; i < 150 && opened.length <= opensBeforeReconnect; i++) await page.waitForTimeout(100);
                assert.equal(opened.length, opensBeforeReconnect + 1, 'the new socket actually reopened the same session');
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected', null, { timeout: 15000 });
                assert.equal(await page.evaluate(() => window.retainedTask === document.querySelector('.pi-bot-schedule-card')), true, 'unchanged history keeps the original card node');
                await page.locator('.pi-bot-schedule-card .pi-bot-chip').click();
                await page.waitForFunction(id => location.hash.includes(`jobId=${id}`), BOT);
                // Return to the same Bot, then cancel using the scheduler's fresh revision.
                await page.evaluate(id => window.PiWorkspaceRoute.navigate('bot', { profileId: id }), BOT);
                await page.locator('.pi-bot-schedule-cancel').click();
                await page.locator('.pi-profile-confirm[open] button').filter({ hasText: '取消任务' }).click();
                await page.waitForFunction(() => document.querySelector('.pi-bot-schedule-card small')?.textContent === '已取消');
                assert.deepEqual(scheduleDeletes, [{ revision: 2, action: 'delete' }]);
                reconnectHistory = null;

                // 4. Settings: one sheet; only what changed is saved, and a conflict keeps the edits.
                const settingsReadsBeforeConflict = settingsReads;
                if (width < 700) {
                    await page.locator('#pi-bot-header .pi-bot-menu').click();
                    await page.locator('#pi-session-pane.open .pi-bot-settings').waitFor();
                }
                await page.locator('.pi-bot-settings').click();
                await page.locator('.pi-bot-sheet[open] .pi-bot-sheet-nav').waitFor({ timeout: 8000 });
                const sheet = page.locator('.pi-bot-sheet[open]');
                assert.equal(await sheet.locator('h2').textContent(), '小狸 的设置');
                if (evidence) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(evidence, `bot-settings-open-${width}.png`) }); }
                await settingsPage(sheet, 'profile');
                assert.equal(await sheet.locator('textarea').nth(1).inputValue(), '温柔耐心，说话简短。');
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true, 'nothing to save yet');
                await settingsPage(sheet, 'model');
                assert.equal(await sheet.locator('[data-sheet-model-trigger] .pi-model-trigger-label').textContent(), '跟随默认（Small）');
                await sheet.locator('[data-sheet-model-trigger]').click();
                const sheetModelDialog = page.locator('#pi-bot-sheet-model-dialog[open]');
                await sheetModelDialog.waitFor();
                await sheetModelDialog.locator('.pi-model-all').click();
                await sheetModelDialog.locator('.pi-model-option').filter({ hasText: 'Large' }).click();
                await sheet.locator('select').nth(1).selectOption({ label: '高' });
                await settingsPage(sheet, 'mode');
                await sheet.locator('.pi-bot-sheet-preset', { hasText: '稳妥' }).click();
                if (evidence) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(evidence, `bot-settings-${width}.png`) }); }
                await sheet.locator('.pi-bot-sheet-save').click();
                await page.waitForFunction(() => /别处改过/.test(document.querySelector('.pi-bot-sheet-status')?.textContent || ''));
                assert.equal(settingsReads, settingsReadsBeforeConflict + 2, 'the conflict rereads the saved settings');
                assert.equal(await sheet.locator('.pi-bot-sheet-preset input:checked').evaluate(input => input.value), 'balanced', 'the edits stay');
                await settingsPage(sheet, 'model');
                assert.equal(await sheet.locator('[data-sheet-model-trigger] .pi-model-trigger-label').textContent(), 'Large');
                await settingsPage(sheet, 'profile');
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
                    // With Bots available the assistant chat page is retired (D-024, M4-5c): not in the bar, not in More.
                    assert.equal(cells.length, 5, JSON.stringify(cells));
                    assert.equal(await page.locator('.nav-menu [data-tab="assistant"]').isVisible(), false);
                    await page.locator('#workspace-more-toggle').click();
                    assert.equal(await page.locator('[data-more-tab="assistant"]').isVisible(), false);
                    assert.equal(await page.evaluate(() => document.activeElement?.dataset.moreTab), 'cron');
                    await page.locator('#workspace-more-toggle').click();
                    assert.ok(cells.every(cell => Math.abs(cell - cells[0]) <= 1), `equal bottom-bar cells ${JSON.stringify(cells)}`);
                }
                if (width >= 700) assert.equal(await page.locator('.nav-btn[data-tab="assistant"]').isVisible(), false, 'no assistant chat entry on desktop either');
                // 7. An old assistant-conversation link to a Bot opens the Bot; anything else lands in Pi Agent.
                profileList = [bot()];
                await page.evaluate(id => window.PiWorkspaceRoute.navigate('assistant', { profileId: id }), BOT);
                await page.waitForFunction(() => location.hash.startsWith('#/bot') && document.querySelector('#chat-tab').classList.contains('pi-bot-mode'), null, { timeout: 8000 });
                await page.evaluate(() => window.PiWorkspaceRoute.navigate('chat'));
                await page.waitForFunction(() => !document.querySelector('#chat-tab').classList.contains('pi-bot-mode'));
                profileList = [{ ...bot(), enabled: false }];
                await page.evaluate(id => window.PiWorkspaceRoute.navigate('assistant', { profileId: id }), BOT);
                await page.waitForFunction(() => location.hash.startsWith('#/chat'), null, { timeout: 8000 });
                assert.equal(await page.locator('#chat-tab').evaluate(node => node.classList.contains('pi-bot-mode')), false, 'a disabled Bot is not opened');
                assert.equal(await page.locator('#pi-assistant-switcher').isVisible(), false, 'the retired assistant page never shows');

                assert.deepEqual(errors, []);
                assert.equal(await page.evaluate(() => document.body.scrollWidth <= innerWidth), true, 'no horizontal overflow');
                console.log(JSON.stringify({ width, status: 'passed', opened }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
