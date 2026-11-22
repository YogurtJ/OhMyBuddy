'use strict';
// Isolated Buddy and workbench navigation: fork, lost response recovery, source link,
// old fork adoption, draft/attachment retention and desktop/phone geometry.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, MAIN, WORKSPACE, say, serve, botRecord, windowRecord, botPage, newWorld, layout, settledShot } = require('./pi-bot-fixture');
const FORK = '55555555-5555-4555-8555-555555555555';
const COPY = '66666666-6666-4666-8666-666666666666';
const QUESTION = '77777777-7777-4777-8777-777777777777';
const image = { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC' };
const main = windowRecord(MAIN), messages = [say('user', 'Discuss the plan', '2026-10-26T06:00:00Z'), say('assistant', 'The original answer', '2026-10-26T06:00:02Z')];
const status = { ok: true, bots: true, agentProfiles: true, deliverables: true, sessionWorkflows: true, sessionForkRequests: true, buddyTopicForks: true,
    projectRoots: ['/fixture'], defaultProject: WORKSPACE };
const sessionRow = (id, extra = {}) => ({ id, cwd: WORKSPACE, path: `${WORKSPACE}/${id}.jsonl`, name: 'Legacy plan branch',
    firstMessage: 'Discuss the plan', messageCount: 2, created: '2026-10-24T00:00:00Z', modified: '2026-10-24T00:00:00Z', agentProfile: { id: BOT, name: '小狸' }, ...extra });
(async () => {
    const { base, close } = await serve(); let browser;
    const evidence = process.env.PIVANE_TEST_SCREENSHOT_DIR;
    if (evidence) fs.mkdirSync(evidence, { recursive: true });
    try {
        browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
        for (const width of [1440, 393, 320]) {
            let windows = [main], creates = 0, lastResult;
            const world = newWorld({ bots: () => [botRecord({ windows })], messages: () => messages, commands: [{ name: 'clone', source: 'builtin' }, { name: 'fork', source: 'builtin' }],
                historyEntries: { reply: { entryId: 'reply', kind: 'assistant', timestamp: messages[1].timestamp, text: 'The original answer', inCurrentBranch: true } } });
            const api = async ({ pathname, method, body }) => {
                if (pathname === '/api/pi/status') return { json: status };
                if (pathname.endsWith('/workflow')) return { json: { leafId: 'leaf', lastUserId: 'user', versions: [],
                    prompts: [{ entryId: 'user', timestamp: messages[0].timestamp, text: 'Discuss the plan' }],
                    replies: [{ entryId: 'reply', timestamp: messages[1].timestamp, text: 'The original answer' }] } };
                if (pathname.endsWith('/fork') && method === 'POST') {
                    const id = [FORK, COPY, QUESTION][creates++];
                    const topic = windowRecord(id, { kind: 'topic', emoji: '', title: body.topicTitle, sessionId: `fork-${id.slice(0, 8)}`,
                        forkOrigin: { windowId: MAIN, sessionId: main.sessionId, entryId: 'reply', title: '主聊天' } });
                    windows.push(topic);
                    lastResult = { session: sessionRow(topic.sessionId, { botWindow: { profileId: BOT, windowId: id } }),
                        draft: body.entryId && body.position !== 'at' ? { message: 'Discuss the plan', images: [image] } : null };
                    // Second creation succeeds on the server but its response is lost.
                    return creates === 2 ? { status: 503, json: { error: 'Synthetic response lost' } } : { json: lastResult };
                }
                if (pathname.includes('/forks/')) return { json: { status: 'completed', result: lastResult } };
                if (pathname.endsWith('/prompt/user')) return { json: { leafId: 'leaf', message: 'Discuss the plan', images: [image] } };
            };
            const { page, context, errors } = await botPage(browser, base, world, { width, mobile: width < 900, api });
            try {
                const forkButton = page.locator('[data-message-workflow="reply-fork"]').first();
                await forkButton.waitFor({ state: 'visible' });
                assert.equal(await forkButton.getAttribute('title'), '从这里另开话题');
                await page.locator('#pi-input').fill('Keep this unsent draft');
                await page.locator('#pi-file-input').setInputFiles({ name: 'draft.png', mimeType: 'image/png', buffer: Buffer.from(image.data, 'base64') });
                await page.locator('#pi-attachments .pi-attachment-chip').waitFor();
                await forkButton.click();
                await page.locator('#pi-workflow-dialog[open]').waitFor();
                assert.equal(await page.locator('#pi-workflow-title').textContent(), '从这里另开话题');
                await page.locator('#pi-workflow-topic-title').fill('Plan <branch>');
                const dialogBounds = await page.locator('#pi-workflow-dialog').evaluate(node => { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight }; });
                assert.ok(dialogBounds.left >= 0 && dialogBounds.right <= dialogBounds.width && dialogBounds.bottom <= dialogBounds.height, JSON.stringify(dialogBounds));
                if (evidence) await settledShot(page, path.join(evidence, `fork-dialog-${width}.png`));
                if (width < 900) assert.ok(await page.locator('#pi-workflow-topic-title').evaluate(node => parseFloat(getComputedStyle(node).fontSize)) >= 16);
                await page.locator('#pi-workflow-submit').click();
                await page.waitForFunction(id => location.hash.includes(id), FORK);
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-who-topic')?.textContent === 'Plan <branch>');
                await page.waitForFunction(() => !document.querySelector('#pi-input').disabled && document.querySelector('#pi-input').value === '');
                assert.equal(await page.locator('#pi-input').inputValue(), '');
                assert.equal(creates, 1); assert.equal(world.prompts.length, 0);
                if (width < 900) await page.locator('[data-bot-action="menu"]').click();
                await page.locator(`.pi-bot-windows [data-window-id="${FORK}"]`).first().waitFor({ state: 'visible' });
                assert.match(await page.locator('.pi-bot-origin').textContent(), /从「主聊天」继续/);
                if (evidence) await settledShot(page, path.join(evidence, `fork-topic-${width}.png`));
                assert.equal((await layout(page)).overflow, false);
                await page.locator('.pi-bot-origin').click();
                await page.waitForFunction(id => location.hash.includes(id), MAIN);
                await page.waitForFunction(() => document.querySelector('#pi-input').value === 'Keep this unsent draft');
                await page.locator('#pi-transcript-content article.assistant.pi-transcript-located').waitFor({ state: 'attached' });
                assert.equal(await page.locator('#pi-attachments .pi-attachment-chip').count(), 1);
                await page.locator('#pi-attachments [data-remove-attachment]').click();
                if (width < 900 && await page.locator('#pi-session-pane').evaluate(node => node.classList.contains('open'))) await page.locator('[data-bot-action="menu"]').click();
                // Full branch copy also stays in the Buddy, with one stable creation request.
                await page.locator('#pi-input').fill('/clone'); await page.locator('#pi-send-button').click();
                await page.locator('#pi-workflow-dialog[open]').waitFor();
                await page.locator('#pi-workflow-topic-title').fill('Recovered copy');
                await page.locator('#pi-workflow-submit').click();
                await page.locator('#pi-workflow-error:not([hidden])').waitFor();
                assert.equal(await page.locator('#pi-workflow-submit').textContent(), '查看创建结果');
                await page.locator('#pi-workflow-submit').click();
                await page.waitForFunction(id => location.hash.includes(id), COPY);
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-who-topic')?.textContent === 'Recovered copy');
                await page.waitForFunction(({ cwd, id }) => localStorage.getItem(`pi.web.session:${cwd}`) === id && !document.querySelector('#pi-input').disabled,
                    { cwd: WORKSPACE, id: 'fork-66666666' });
                assert.equal(creates, 2); assert.equal(windows.length, 3);
                assert.equal(world.opened.filter(id => id === 'fork-66666666').length, 1);
                assert.equal((await layout(page)).overflow, false);
                // From a historical question, its original image goes to the new topic's draft.
                await page.locator('#pi-input').fill('/fork'); await page.locator('#pi-send-button').click();
                await page.locator('[data-workflow-action="fork"]').first().click();
                await page.locator('#pi-workflow-topic-title').fill('Question branch');
                await page.locator('#pi-workflow-submit').click();
                await page.waitForFunction(({ cwd, id }) => localStorage.getItem(`pi.web.session:${cwd}`) === id && !document.querySelector('#pi-input').disabled,
                    { cwd: WORKSPACE, id: 'fork-77777777' });
                assert.equal(await page.locator('#pi-input').inputValue(), 'Discuss the plan');
                assert.equal(await page.locator('#pi-attachments .pi-attachment-chip').count(), 1);
                const widths = await page.locator('#pi-composer, #pi-attachments, #pi-input').evaluateAll(nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, viewport: innerWidth })));
                assert.ok(widths.every(item => item.width > 0 && item.width <= item.viewport), JSON.stringify(widths));
                assert.equal(creates, 3); assert.equal(world.prompts.length, 0); assert.deepEqual(errors, []);
            } catch (error) {
                console.error('Buddy fork UI state', await page.evaluate(() => ({ hash: location.hash, header: document.querySelector('#pi-bot-header')?.textContent,
                    error: document.querySelector('#pi-workflow-error')?.textContent, input: document.querySelector('#pi-input')?.value, toasts: [...document.querySelectorAll('.pi-toast')].map(node => node.textContent) })),
                    { errors, opened: world.opened, forks: world.requests.filter(item => item.pathname.endsWith('/fork')), windows });
                throw error;
            } finally { await context.close(); }

            // An existing workbench fork is previewed, then registered and opened in Buddy.
            let adopted = false, submissions = 0;
            const legacyWorld = newWorld({ bots: () => [botRecord({ windows: adopted ? [main, windowRecord(FORK, { kind: 'topic', emoji: '', title: 'Collected plan', sessionId: 'legacy',
                forkOrigin: { windowId: MAIN, sessionId: main.sessionId, entryId: 'reply', title: '主聊天' } })] : [main] })], messages: () => messages });
            const legacyRow = sessionRow('legacy', { buddyForkCandidate: true });
            const legacyApi = async ({ pathname, method, body }) => {
                if (pathname === '/api/pi/status') return { json: status };
                if (pathname === '/api/pi/projects') return { json: { projects: [{ cwd: WORKSPACE, name: 'Buddy workspace', sessionCount: 1 }], roots: ['/fixture'] } };
                if (pathname === '/api/pi/sessions') return { json: { sessions: [legacyRow] } };
                if (pathname.endsWith('/buddy-topic')) {
                    if (method === 'GET') return { json: { existing: false, profileId: BOT, name: '小狸', title: 'Legacy plan branch', windowsRevision: 'w1', expectedLeafId: 'leaf', origin: { title: '主聊天' } } };
                    submissions++; adopted = true;
                    assert.equal(body.title, 'Collected plan');
                    return { json: { profileId: BOT, window: { id: FORK } } };
                }
            };
            const old = await botPage(browser, base, legacyWorld, { width, mobile: width < 900, api: legacyApi, hash: `#/chat?cwd=${encodeURIComponent(WORKSPACE)}&sessionId=legacy` });
            try {
                await old.page.waitForFunction(() => Boolean(window.PiChatNavigation));
                await old.page.evaluate(cwd => window.PiChatNavigation.openSession({ cwd, sessionId: 'legacy' }), WORKSPACE);
                await old.page.waitForFunction(() => !document.querySelector('#pi-input').disabled);
                await old.page.locator('#pi-current-thread-menu').click();
                await old.page.getByText('收录为伙伴话题…', { exact: true }).click();
                await old.page.locator('#pi-workflow-topic-title').waitFor();
                assert.match(await old.page.locator('#pi-workflow-content').textContent(), /收录到 小狸/);
                await old.page.locator('#pi-workflow-topic-title').fill('Collected plan');
                await old.page.locator('#pi-workflow-submit').click();
                await old.page.waitForFunction(id => location.hash.includes('#/bot') && location.hash.includes(id), FORK);
                await old.page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-who-topic')?.textContent === 'Collected plan');
                assert.equal(submissions, 1); assert.equal(legacyWorld.prompts.length, 0);
                assert.equal((await layout(old.page)).overflow, false); assert.deepEqual(old.errors, []);
            } catch (error) {
                console.error('Legacy adoption UI state', await old.page.evaluate(() => ({ hash: location.hash, input: document.querySelector('#pi-input')?.disabled,
                    body: document.querySelector('#pi-connection-label')?.textContent, toasts: document.querySelector('#pi-toast-region')?.textContent })),
                    { errors: old.errors, opened: legacyWorld.opened, requests: legacyWorld.requests.slice(-18) });
                throw error;
            } finally { await old.context.close(); }
        }
        console.log('Buddy forks: desktop, phone, narrow phone, source navigation, request recovery and legacy adoption passed');
    } finally { await browser?.close(); await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
