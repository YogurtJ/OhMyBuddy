const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, MAIN, botRecord, newWorld, serve, botPage, layout } = require('./pi-bot-fixture.js');

(async () => {
    const service = await serve();
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    try {
        for (const width of [1440, 393, 320]) {
            const world = newWorld({ bots: () => [botRecord()] });
            const { page, context, errors } = await botPage(browser, service.base, world, { width,
                api: request => request.pathname === '/api/pi/status' ? { json: { ok: true, bots: true, agentProfiles: true,
                    sideChat: true, sideChatContext: true, sideChatRetention: true, sideChatTools: true, sideChatModels: true, sideChatLifecycle: true,
                    projectRoots: ['/fixture'], defaultProject: '/fixture/project' } } : undefined });
            await page.waitForFunction(() => !document.querySelector('#pi-input').disabled);
            const main = world.socket;
            const model = { provider: 'fixture', id: 'fixture-model', name: 'Fixture' };
            let side, messages = [], busy = false, prepares = [], prompts = [], pendingPrepare;
            const ref = { mode: 'context', capturedAt: new Date().toISOString(), preview: [], messageCount: 0 };
            const reply = (ws, command, data) => ws.send(JSON.stringify({ type: 'response', id: command.id, command: command.type, success: true, data }));
            const send = event => side.send(JSON.stringify(event));
            // The main connection already exists. Only new side sockets use this handler.
            await page.routeWebSocket('**/api/pi/ws', ws => ws.onMessage(raw => {
                const cmd = JSON.parse(raw);
                let data = {};
                if (cmd.type === 'open_side_chat') { side = ws; data = { state: { model, isStreaming: busy, toolMode: 'assist' }, reference: ref, messages, stats: {}, limits: { messageCharacters: 8000 } }; }
                else if (cmd.type === 'get_side_models') data = { models: [model], levels: ['off'] };
                else if (cmd.type === 'get_state') data = { model, isStreaming: busy, toolMode: 'assist' };
                else if (cmd.type === 'get_messages') data = { messages };
                else if (cmd.type === 'get_session_stats') data = {};
                else if (cmd.type === 'prompt') {
                    prompts.push(cmd); busy = true;
                    const user = { role: 'user', content: cmd.message, timestamp: Date.now() };
                    messages.push(user); reply(ws, cmd, { accepted: true }); send({ type: 'agent_start' }); send({ type: 'message_end', message: user }); return;
                } else if (cmd.type === 'abort') { busy = false; send({ type: 'agent_settled' }); }
                else throw new Error('Unexpected side command ' + cmd.type);
                reply(ws, cmd, data);
            }));
            // Add main side-chat commands to the already-open synthetic main connection.
            main.onMessage(raw => {
                const cmd = JSON.parse(raw);
                if (cmd.type === 'prepare_side_chat') { prepares.push(cmd); pendingPrepare = () => reply(main, cmd, { ticket: 'side-ticket', reference: ref }); return; }
                if (cmd.type === 'get_side_model_options') return reply(main, cmd, { model, models: [{ ...model, levels: ['off'] }], thinkingLevel: 'off' });
                if (cmd.type === 'prompt') world.prompts.push(cmd.message);
                reply(main, cmd, cmd.type === 'get_messages' ? { messages: [] } : cmd.type === 'get_state' ? { model, isStreaming: false } : {});
            });
            const more = page.locator('#pi-bot-header [data-bot-action="more"]');
            const menu = page.locator('.pi-bot-more-menu');
            await more.click();
            await page.waitForFunction(() => document.querySelector('[data-bot-action="more"]').getAttribute('aria-expanded') === 'true');
            assert.equal(await menu.locator('[role="menuitem"]').count(), 5);
            assert.equal(await menu.locator('[data-bot-action="progress"]').count(), 0, 'progress is part of side chat, not a duplicate menu entry');
            await page.keyboard.press('End');
            assert.equal(await menu.locator('[data-bot-action="settings"]').evaluate(n => n === document.activeElement), true);
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => !document.querySelector('.pi-bot-more-menu').matches(':popover-open'));
            await more.click(); await menu.locator('[data-bot-action="side"]').click();
            assert.equal(await page.locator('.pi-side-main-progress').evaluate(n => n.open), false);
            await page.locator('.pi-side-main-progress > summary').click();
            assert.equal(prepares.length, 0, 'viewing progress inside side chat must not capture context or start an agent');
            assert.equal(await page.locator('.pi-side-main-progress').evaluate(n => n.open), true);
            main.send(JSON.stringify({ type: 'gateway_progress', progress: { version: 1, id: 'live-plan', explanation: '正在核对资料',
                plan: [{ step: '收集资料', status: 'completed' }, { step: '比较两个方案', status: 'in_progress' }] } }));
            await page.waitForFunction(() => document.querySelector('.pi-side-main-progress').textContent.includes('比较两个方案'));
            assert.equal(prepares.length, 0);
            await page.locator('#pi-close-inspector').click();
            await page.locator('#pi-input').fill('保留主聊草稿');
            await more.click(); await menu.locator('[data-bot-action="side"]').click();
            assert.equal(prepares.length, 0);
            assert.equal(await page.locator('#pi-side-input').getAttribute('placeholder'), '和 小狸 侧聊');
            await page.locator('.pi-side-main-progress').evaluate(n => { n.open = false; });
            await page.locator('#pi-side-input').fill('顺便解释一下这个方案'); await page.locator('#pi-side-send').click();
            await page.waitForFunction(() => document.querySelector('.pi-side-delivery')?.textContent === '正在发送…');
            assert.match(await page.locator('#pi-side-messages').textContent(), /顺便解释一下这个方案/);
            assert.equal(prompts.length, 0, 'pending startup must not silently submit twice');
            assert.equal(await page.locator('#pi-side-send').isDisabled(), true);
            assert.equal(await page.locator('.pi-side-pending-reply').isVisible(), true);
            pendingPrepare();
            await page.waitForFunction(() => document.querySelector('#pi-side-input').value === '');
            assert.equal(prompts.length, 1); assert.equal(prepares[0].toolMode, 'assist');
            assert.equal(world.prompts.length, 0); assert.equal(await page.locator('#pi-input').inputValue(), '保留主聊草稿');
            assert.equal(await page.locator('#pi-side-messages .user').count(), 1, 'optimistic message reconciles with native user message');
            await page.locator('#pi-close-inspector').click();
            const answer = { role: 'assistant', content: [{ type: 'text', text: '这是侧聊的独立回答。' }], timestamp: Date.now(), stopReason: 'stop' };
            messages.push(answer); busy = false; send({ type: 'message_end', message: answer }); send({ type: 'agent_settled' });
            await page.waitForFunction(() => document.querySelector('[data-bot-action="more"]').dataset.sideState === 'unread');
            await more.click(); assert.match(await menu.textContent(), /有新回复/);
            await menu.locator('[data-bot-action="side"]').click();
            await page.waitForFunction(() => document.querySelector('[data-bot-action="more"]').dataset.sideState === '');
            assert.match(await page.locator('#pi-side-messages .assistant > header').textContent(), /小狸/);
            assert.equal(await page.locator('#pi-side-send').evaluate(n => { const box = n.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight; }), true);
            assert.equal((await layout(page)).overflow, false);
            for (const selector of ['#pi-side-chat', '#pi-side-content', '#pi-side-form']) assert.equal(await page.locator(selector).evaluate(n => n.scrollWidth <= n.clientWidth + 1), true, selector);
            if (width < 900) {
                assert.ok(await page.locator('#pi-inspector').evaluate(n => n.getBoundingClientRect().width >= innerWidth - 1));
                assert.ok(await page.locator('#pi-side-input').evaluate(n => parseFloat(getComputedStyle(n).fontSize) >= 16));
            }
            await page.screenshot({ path: `/tmp/pi-buddy-side-${width}.png` });
            await page.locator('#pi-close-inspector').click();
            await more.click(); await menu.locator('[data-bot-action="schedule"]').click();
            await page.waitForFunction(id => location.hash.includes('/cron') && location.hash.includes(id), BOT);
            assert.deepEqual(errors, []); await context.close(); console.log('PASS Buddy side chat', width);
        }
    } finally { await browser.close(); await service.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
