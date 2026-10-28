// Native-message fixture: Bot process folding, live text/tool transitions and state-change receipts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, MAIN, APPROVAL, say, serve, botRecord, botPage, newWorld, layout, settledShot } = require('./pi-bot-fixture.js');

(async () => {
    const { base, close } = await serve();
    const evidence = process.env.PIVANE_EVIDENCE_DIR;
    if (evidence) fs.mkdirSync(evidence, { recursive: true });
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const width of [1440, 393]) for (const theme of ['daylight', 'dark']) {
            let clock = Date.now() - 12000;
            const at = () => new Date(clock += 1000).toISOString();
            const history = [say('user', '帮我记住周五发三家报价，以后说话简洁一些。', at())];
            const bot = botRecord();
            const world = newWorld({ bots: () => [bot], messages: () => history });
            const api = ({ pathname }) => {
                if (pathname.endsWith('/notebook')) return { json: { generation: 0, version: 'v1', items: [] } };
                if (pathname === `/api/pi/bots/${BOT}/settings`) return { json: { bot, profile: bot, revision: 'r1', profileRevision: 'p', fields: {}, models: [] } };
                if (pathname === '/api/pi/projects') return { json: { projects: [{ cwd: '/fixture/project', name: 'project' }], roots: ['/fixture'] } };
                if (pathname === '/api/pi/sessions') return { json: { sessions: [{ id: 'agent', cwd: '/fixture/project', name: 'Agent fixture' }] } };
            };
            const { context, page, errors } = await botPage(browser, base, world, { width, height: width === 1440 ? 900 : 852, api, hash: `#/bot?profileId=${BOT}` });
            page.on('pageerror', error => console.error(error));
            const send = event => world.socket.send(JSON.stringify(event));
            const waitLine = text => page.waitForFunction(value => document.querySelector('.pi-bot-process-line .pi-turn-label')?.textContent.includes(value), text);
            const shot = async scene => { if (evidence) await settledShot(page, path.join(evidence, `bot-process-${scene}-${theme}-${width}.png`)); };
            const tool = async (id, name, args, { text = '', thinking = '', error = false, details = {}, pending = false, output = '完成' } = {}) => {
                const content = [...(thinking ? [{ type: 'thinking', thinking }] : []), ...(text ? [{ type: 'text', text }] : []), { type: 'toolCall', id, name, arguments: args }];
                const message = { ...say('assistant', '', at()), content, stopReason: 'toolUse' };
                send({ type: 'message_start', message }); send({ type: 'message_end', message }); history.push(message);
                send({ type: 'tool_execution_start', toolCallId: id, toolName: name, args });
                if (!pending) {
                    const result = { role: 'toolResult', toolCallId: id, toolName: name, content: [{ type: 'text', text: output }], details, isError: error, timestamp: clock + 50 };
                    history.push(result); send({ type: 'tool_execution_end', toolCallId: id, toolName: name, isError: error, result });
                    send({ type: 'message_end', message: result });
                }
                await page.locator(`.pi-tool-row[data-tool-id="${id}"]`).waitFor({ state: 'attached' });
            };
            try {
                await page.locator('#pi-input:not([disabled])').waitFor();
                await page.locator('html').evaluate((item, value) => item.dataset.theme = value, theme);
                send({ type: 'agent_start' });
                await page.locator('#pi-transcript-activity .pi-activity-live').waitFor();
                await tool('read', 'read', { path: '/fixture/MEMORY.md' }, { text: '我先看看已有的安排。', thinking: '先确认已有偏好，再记下这次的要求。' });
                await tool('failed', 'bash', { command: 'find quotes -type f\nprintf ignored' }, { error: true, output: 'Folder not found' });
                await tool('note', 'window_note', { action: 'add', text: '周五前发三家报价' }, { text: '换种方式再试。', details: { pivaneNoteSaved: { v: 1, ids: ['n1', 'n2'] } } });
                await tool('settings', 'bot_setup_propose', { personality: '简洁直接' }, { details: { pivaneBotSetup: { status: 'saved', saved: { personality: '简洁直接' } } } });
                await tool('edit', 'edit', { path: '/fixture/preferences.md' }, { pending: true });
                await waitLine('换种方式再试。');
                assert.equal(await page.locator('.pi-message.assistant:visible').count(), 0, 'tool commentary makes no reply bubbles');
                assert.equal(await page.locator('.pi-bot-process-line:visible').count(), 1);
                assert.equal(await page.locator('#pi-transcript-activity .pi-activity-live').isVisible(), false, 'one live process line');
                send({ type: 'auto_retry_start', attempt: 1, delayMs: 1000 });
                await waitLine('连接不太顺，正在重试');
                send({ type: 'auto_retry_end', success: true });
                send({ type: 'extension_ui_request', id: 'approval', method: 'confirm', title: APPROVAL, message: `write #${'1'.repeat(16)}\n\n/fixture/preferences.md` });
                await waitLine('等你确认');
                await page.locator('.pi-bot-approval:not([hidden])').waitFor();
                await shot('running-approval');
                await page.locator('.pi-bot-approval .pi-bot-setup-later').click();
                send({ type: 'gateway_ui_resolved', id: 'approval' });
                const denied = { role: 'toolResult', toolCallId: 'edit', toolName: 'edit', timestamp: clock + 100, isError: true,
                    content: [{ type: 'text', text: 'The user did not approve this step (declined, or no answer in time), so it did not run.' }] };
                history.push(denied); send({ type: 'tool_execution_end', toolCallId: 'edit', toolName: 'edit', isError: true, result: denied }); send({ type: 'message_end', message: denied });
                // A script's fallback receipt carries validated changes even when its tool is not a memory tool.
                const change = { role: 'toolResult', toolCallId: 'changes', toolName: 'codemode', timestamp: clock + 200, isError: false, content: [], details: {
                    pivaneBotChanges: { v: 1, changes: [{ area: 'skill', action: 'added', names: ['报价对比'] }, { area: 'unrecognized', action: 'updated' }] } } };
                history.push(change); send({ type: 'message_end', message: change });
                const reply = say('assistant', '记好了，周五前给你三家报价。以后我会说得简洁一些。', at());
                send({ type: 'message_start', message: { ...reply, content: [] } });
                send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: '记好了，周五前给你三家报价。' } });
                await page.locator('.pi-message.assistant.streaming:visible .pi-markdown').waitFor();
                assert.equal(await page.locator('.pi-message.assistant:visible').count(), 1, 'streaming answer remains a bubble');
                // Starting a tool after text immediately demotes that same streaming article.
                send({ type: 'message_update', assistantMessageEvent: { type: 'toolcall_start', contentIndex: 1, id: 'live-tool', toolName: 'read' } });
                await page.waitForFunction(() => !document.querySelector('.pi-message.assistant.streaming')?.checkVisibility());
                send({ type: 'message_end', message: { ...reply, stopReason: 'toolUse', content: [{ type: 'text', text: '核对一下。' }, { type: 'toolCall', id: 'live-tool', name: 'read', arguments: { path: 'MEMORY.md' } }] } });
                // Persist only the authoritative completed answer in the settled snapshot.
                history.push(reply); send({ type: 'message_start', message: reply }); send({ type: 'message_end', message: reply });
                send({ type: 'agent_settled' });
                await page.waitForFunction(() => document.querySelector('.pi-bot-process-line') && !document.querySelector('.pi-bot-process-line.is-running'));
                await page.waitForFunction(() => document.querySelectorAll('.pi-bot-change-receipt').length === 3);
                assert.equal(await page.locator('.pi-message.assistant:visible').count(), 1);
                assert.equal(await page.locator('.pi-turn-group.has-error').count(), 0, 'recovered errors do not color the summary');
                assert.match(await page.locator('.pi-turn-label').textContent(), /^用时 .+ · 6 个步骤 · 记下 2 件事$/);
                assert.equal(await page.locator('.pi-turn-status').textContent(), '');
                assert.match(await page.locator('[data-area="notebook"]').textContent(), /记在“我记着的事” · 2 件 · 周五前发三家报价/);
                assert.match(await page.locator('[data-area="settings"]').textContent(), /更新了设置 · 性格/);
                assert.match(await page.locator('[data-area="skill"]').textContent(), /新增技能 · 报价对比/);
                assert.equal(await page.locator('.pi-bot-turn-receipts').evaluate(group => Boolean(group.previousElementSibling?.matches('.pi-message.assistant'))), true, 'receipts follow the final reply');
                await shot('completed-collapsed');
                await page.locator('.pi-turn-group > summary').click();
                await page.locator('.pi-tool-row[data-tool-id="failed"]').waitFor();
                assert.equal(await page.locator('[data-tool-id="failed"]').getAttribute('data-bot-outcome'), 'continued');
                assert.equal(await page.locator('[data-tool-id="edit"]').getAttribute('data-bot-outcome'), 'denied');
                assert.match(await page.locator('[data-tool-id="edit"] summary').textContent(), /没有执行（你没有允许）/);
                assert.equal(await page.locator('.pi-process-group:visible').count(), 0, 'no nested execution cards');
                assert.equal(await page.locator('.pi-thinking-block > summary > span').textContent(), '想了想');
                await page.locator('.pi-thinking-block > summary').click();
                assert.match(await page.locator('.pi-thinking-content:visible').textContent(), /先确认已有偏好/);
                await page.locator('.pi-thinking-block > summary').click();
                await page.locator('[data-tool-id="failed"] > summary').click();
                assert.match(await page.locator('[data-tool-id="failed"] .pi-tool-output:visible').textContent(), /Folder not found/);
                await page.locator('[data-tool-id="failed"] > summary').click();
                await page.locator('.pi-turn-group').scrollIntoViewIfNeeded();
                await shot('timeline-expanded');
                assert.equal((await layout(page)).overflow, false);
                const wide = await page.locator('#pi-transcript-content').evaluate(root => [...root.querySelectorAll('.pi-tool-row, .pi-bot-turn-receipts, .pi-message-body')]
                    .filter(item => item.checkVisibility()).some(item => item.getBoundingClientRect().right > innerWidth + 1));
                assert.equal(wide, false, 'actual transcript items fit');
                if (width === 1440 && theme === 'daylight') {
                    // Knowledge hints use the same end-of-turn group, keeping all correction actions.
                    await page.evaluate(({ profileId, timestamp }) => {
                        const root = document.createElement('div'); root.hidden = true; document.body.append(root);
                        window.processKnowledge = window.PiChatKnowledge.create({ root, transcript: document.getElementById('pi-transcript-content'),
                            scope: () => ({ cwd: '/fixture', sessionId: 'memory-fixture', profileId, generation: 1 }),
                            anchors: () => [['entry-user', 'user', timestamp, '']],
                            fetch: async url => url.includes('/learning') ? {} : ({ version: 1, status: 'ready', revision: 'a'.repeat(64), items: [],
                                capabilities: { memory: true, skill: true, operations: ['undo', 'delete'] }, receipts: [{ id: 'receipt', kind: 'memory', target: 'user',
                                    status: 'saved', origin: 'agent', itemId: 'b'.repeat(64), afterRevision: 'c'.repeat(64), preview: '喜欢简洁的回答',
                                    source: { sessionId: 'memory-fixture', entryId: 'entry-user' } }] }) });
                        window.processKnowledge.update();
                    }, { profileId: BOT, timestamp: history[0].timestamp });
                    await page.locator('.pi-bot-turn-receipts .pi-memory-hints').waitFor();
                    assert.deepEqual(await page.locator('.pi-memory-hints button').allTextContents(), ['撤销', '不对', '编辑']);
                    assert.equal(await page.locator('.pi-bot-turn-receipts .pi-memory-hints').evaluate(item => item.closest('.pi-bot-turn-receipts').previousElementSibling.matches('.pi-message.assistant')), true);
                    await page.evaluate(() => window.processKnowledge.reset());
                    const extra = { role: 'toolResult', toolCallId: 'extra-changes', toolName: 'codemode', timestamp: clock + 300, isError: false, content: [], details: {
                        pivaneNoteSaved: { v: 1, ids: ['n3'] }, pivaneBotChanges: { v: 1, changes: [
                            { area: 'user', action: 'updated', count: 1, previews: ['喜欢简洁的回答'] },
                            { area: 'memory', action: 'removed', count: 1 },
                            { area: 'settings', action: 'updated', names: ['personality', 'model', 'thinking', 'notify'] }] } } };
                    history.splice(-1, 0, extra);
                    const unknown = { ...extra, toolCallId: 'unknown-version', timestamp: clock + 400, details: { pivaneBotChanges: { v: 9, changes: [{ area: 'skill', action: 'added', names: ['IGNORED'] }] } } };
                    history.splice(-1, 0, unknown);
                    send({ type: 'gateway_context_changed', messages: history });
                    await page.waitForFunction(() => document.querySelectorAll('.pi-bot-change-receipt').length === 6);
                    assert.equal(await page.locator('[data-area="notebook"]').count(), 1, 'multiple notebook writes merge');
                    assert.match(await page.locator('[data-area="notebook"]').textContent(), /3 件/);
                    assert.match(await page.locator('[data-area="user"]').textContent(), /更新了关于你 · 1 条：喜欢简洁/);
                    assert.match(await page.locator('[data-area="memory"]').textContent(), /删掉了长期记忆 · 1 条/);
                    assert.match(await page.locator('[data-area="settings"]').last().textContent(), /改了设置 · 性格、模型、思考程度、主动联系/);
                    assert.equal(await page.locator('.pi-bot-turn-receipts').textContent().then(text => text.includes('IGNORED')), false);
                    for (const area of ['user', 'memory']) {
                        await page.locator(`[data-area="${area}"] button`).click();
                        await page.waitForFunction(section => location.hash.includes(`section=${section}`), area);
                        await page.evaluate(id => window.PiWorkspaceRoute.navigate('bot', { profileId: id }), BOT);
                        await page.locator('[data-area="notebook"]').waitFor();
                    }
                }
                await page.locator('[data-area="notebook"] button').click();
                await page.locator('.pi-bot-notes[open]').waitFor();
                await page.keyboard.press('Escape');
                await page.locator('[data-area="settings"] button').first().click();
                await page.locator('.pi-bot-sheet[open]').waitFor();
                await page.keyboard.press('Escape');
                await page.locator('[data-area="skill"] button').click();
                await page.waitForFunction(() => location.hash.includes('section=skills') && location.hash.includes('profileId='));
                if (width === 1440 && theme === 'daylight') {
                    await page.evaluate(id => window.PiWorkspaceRoute.navigate('bot', { profileId: id }), BOT);
                    await page.locator('[data-area="notebook"]').waitFor();
                    const schedule = { role: 'toolResult', toolCallId: 'schedule', toolName: 'bot_schedule', timestamp: clock + 500, content: [], details: {
                        pivaneBotSchedule: { v: 1, action: 'created', job: { id: '77777777-7777-4777-8777-777777777777', title: '周五报价', message: '提醒我看看报价',
                            revision: 1, schedule: { kind: 'once', at: '2026-11-06T09:00:00Z', timeZone: 'Asia/Shanghai' } } } } };
                    history.splice(-1, 0, schedule); send({ type: 'gateway_context_changed', messages: history });
                    await page.locator('.pi-bot-schedule-receipt').waitFor();
                    await page.evaluate(() => { window.keptSchedule = document.querySelector('.pi-bot-schedule-receipt'); });
                    const nextUser = say('user', '好的，谢谢。', at()); history.push(nextUser);
                    send({ type: 'gateway_context_changed', messages: history });
                    await page.getByText('好的，谢谢。', { exact: true }).waitFor();
                    assert.equal(await page.evaluate(() => window.keptSchedule === document.querySelector('.pi-bot-schedule-receipt') && window.keptSchedule.isConnected), true,
                        'appending a turn retains native receipts moved after the preceding answer');
                    assert.equal(await page.locator('[data-area="notebook"]').count(), 1);
                }
                // Same native history in Pi Agent keeps the existing compact/reading/full modes.
                await page.evaluate(() => window.PiWorkspaceRoute.navigate('chat', { cwd: '/fixture/project', sessionId: 'agent' }));
                await page.locator('#chat-tab:not(.pi-bot-mode) .pi-turn-group').waitFor();
                assert.equal(await page.locator('.pi-bot-process-line').count(), 0);
                assert.ok(await page.locator('.pi-process-group').count() > 0);
                await page.locator('[data-transcript-mode="reading"]').evaluate(button => button.click());
                assert.ok(await page.locator('.pi-message.assistant:visible').count() > 1);
                await page.locator('[data-transcript-mode="full"]').evaluate(button => button.click());
                assert.equal(await page.locator('[data-tool-id="failed"] summary > strong').textContent(), 'bash');
                assert.equal(await page.locator('[data-tool-id="failed"]').isVisible(), true);
                if (width === 1440 && theme === 'daylight') {
                    // Bot folding ignores the Agent's saved full mode; final stop/error stays visible even with a tool call.
                    history.push(say('user', '这一步先停下。', at()));
                    const stopped = { ...say('assistant', '我停下了。', at()), stopReason: 'aborted', content: [
                        { type: 'text', text: '我停下了。' }, { type: 'toolCall', id: 'stopped-tool', name: 'read', arguments: { path: 'notes.md' } }] };
                    history.push(stopped);
                    await page.evaluate(id => window.PiWorkspaceRoute.navigate('bot', { profileId: id }), BOT);
                    await page.locator('.pi-inline-stopped:visible').waitFor();
                    assert.equal(await page.locator('.pi-turn-group.has-error').count(), 1);
                    assert.equal(await page.locator('[data-tool-id="stopped-tool"]').isVisible(), false);
                    stopped.stopReason = 'error'; stopped.errorMessage = '连接失败，请稍后再试。';
                    send({ type: 'gateway_context_changed', messages: history });
                    await page.locator('.pi-inline-error:visible').waitFor();
                    assert.equal(await page.locator('.pi-turn-group.has-error .pi-turn-status').textContent(), '回复失败');
                }
                assert.deepEqual(errors, []);
                console.log(`pi-bot-process ${width} ${theme}: passed`);
            } catch (error) { console.error('page errors:', errors); throw error; } finally { await context.close(); }
        }
    } finally { await browser?.close(); await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
