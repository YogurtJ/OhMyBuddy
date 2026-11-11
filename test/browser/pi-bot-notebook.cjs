// Full-page Buddy notebook: all-chat retrieval, scoped information, safe edits and mobile layout.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, MAIN, serve, botRecord, windowRecord, botPage, newWorld, settledShot } = require('./pi-bot-fixture');
const TOPIC = '55555555-5555-4555-8555-555555555555';
const evidence = process.env.PI_BOT_EVIDENCE_DIR;
const now = new Date().toISOString();
const note = (id, kind, text, extra = {}) => ({ id, kind, text, subject: '论文修改', status: 'active', due: null,
    createdAt: now, updatedAt: now, by: 'bot', source: { role: 'user', text: '周五之前把论文修改稿交给导师', title: '论文修改', windowId: TOPIC, available: true }, ...extra });
(async () => {
    const server = await serve(); let browser;
    if (evidence) fs.mkdirSync(evidence, { recursive: true });
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
        for (const width of [1440, 390, 360]) {
            let notes = [note('b1', 'commitment', '周五前把修改稿发给导师', { due: '2026-11-13' }),
                note('b2', 'open', '等待导师确认实验方案'), note('b3', 'decision', '东京旅行的总预算定为 8000 元', { subject: '东京旅行' }),
                note('b4', 'ref', '酒店确认编号 ABC123456', { subject: '东京旅行' }), note('b5', 'commitment', '论文初稿已提交', { status: 'done' })];
            let version = 1, refusal = null, reads = 0; const posts = [];
            const bot = botRecord({ windows: [windowRecord(MAIN), windowRecord(TOPIC, { kind: 'topic', title: '论文修改' }),
                ...Array.from({ length: 21 }, (_, index) => windowRecord(`66666666-6666-4666-8666-${String(index).padStart(12, '0')}`, { kind: 'topic', title: `工作 ${index}` }))] });
            const world = newWorld({ bots: () => [bot] });
            const book = () => ({ scope: 'buddy', version: `v${version}`, items: notes.map(item => ({ ...item })), total: notes.length, omitted: 0 });
            const { context, page, errors } = await botPage(browser, server.base, world, { width, height: 900, mobile: width < 600,
                hash: `#/bot?profileId=${BOT}`, api: request => {
                    if (request.pathname === `/api/pi/bots/${BOT}/topics/open-items`) return { json: { v: 1, topics: [], omittedTopics: 0 } };
                    if (request.pathname !== `/api/pi/bots/${BOT}/notebook`) return;
                    if (request.method === 'GET') { reads++; return { json: book() }; }
                    posts.push(request.body);
                    if (refusal) {
                        const code = refusal; refusal = null;
                        if (code === 'NOTEBOOK_CHANGED') { notes.find(item => item.id === 'b1').due = '2026-11-14'; version++; }
                        return { status: 409, json: { error: 'changed elsewhere', code } };
                    }
                    assert.equal(request.body.expectedVersion, `v${version}`); assert.equal(request.body.expectedGeneration, undefined);
                    for (const op of request.body.ops) {
                        if (op.op === 'add') { notes.push(note('b6', op.kind, op.text, { ...op, id: 'b6', source: null })); continue; }
                        if (op.op === 'delete') { notes = notes.filter(item => item.id !== op.id); continue; }
                        const item = notes.find(item => item.id === op.id); Object.assign(item, op.op === 'status' ? { status: op.status } : op, { updatedAt: new Date().toISOString() });
                    }
                    version++; return { json: book() };
                } });
            const sheet = page.locator('.pi-bot-notes[open]');
            const openNotes = async () => {
                if (width > 900) await page.locator('.pi-bot-notebook-nav .pi-bot-notes-link').click();
                else { await page.locator('#pi-bot-header [data-bot-action="more"]').click(); await page.locator('.pi-bot-more-menu [data-bot-action="notes"]').click(); }
                await sheet.locator('[data-note-id="b1"]').waitFor();
            };
            const action = async (id, action) => {
                const row = sheet.locator(`[data-note-id="${id}"]`);
                if (width > 600) await row.locator(`.pi-bot-note-tools [data-note-action="${action}"]`).click();
                else { await row.locator('[data-note-action="more"]').click(); assert.equal(await page.evaluate(() => document.activeElement?.closest('.pi-bot-note-panel') != null), true); await row.locator(`.pi-bot-note-panel [data-note-action="${action}"]`).click(); }
            };
            try {
                await page.locator('#pi-bot-header [data-bot-action="more"]').waitFor(); await openNotes();
                assert.match(await sheet.locator('.pi-bot-notes-subtitle').textContent(), /所有聊天/);
                assert.equal(await sheet.locator('.pi-bot-note').count(), 2);
                assert.deepEqual(await sheet.locator('.pi-bot-notes-count').allTextContents(), ['2', '2', '1']);
                const geometry = await sheet.evaluate(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
                    overflow: node.scrollWidth > node.clientWidth, bodyOverflow: node.querySelector('.pi-bot-sheet-body').scrollWidth > node.querySelector('.pi-bot-sheet-body').clientWidth }));
                assert.equal(geometry.overflow || geometry.bodyOverflow, false, JSON.stringify(geometry));
                if (width < 600) { assert.equal(geometry.width, width); assert.equal(geometry.height, 900); }
                if (evidence) await settledShot(page, path.join(evidence, `buddy-notebook-${width}.png`));
                await sheet.locator('[data-note-id="b1"] .pi-bot-note-source summary').click();
                assert.match(await sheet.locator('[data-note-id="b1"] .pi-bot-note-source p').textContent(), /你说.*论文修改稿/);
                assert.equal(await sheet.locator('[data-note-id="b1"] .pi-bot-note-source-link').textContent(), '论文修改');
                const search = sheet.locator('input[type="search"]');
                await search.fill('预算'); assert.equal(await sheet.locator('[data-note-id="b3"]').count(), 1, 'search finds references from the waiting tab');
                await search.fill('初稿'); assert.equal(await sheet.locator('[data-note-id="b5"]').count(), 1, 'search includes completed notes');
                await sheet.locator('[data-notes-tab="reference"]').click();
                assert.equal(await search.inputValue(), '');
                assert.equal(await sheet.locator('[data-note-id="b3"]').count(), 1);
                await search.fill('ABC123456');
                assert.equal(await sheet.locator('.pi-bot-note').count(), 1); assert.equal(await sheet.locator('[data-note-id="b4"]').count(), 1);
                await search.fill('不存在的事项'); assert.match(await sheet.locator('.pi-bot-notes-empty').textContent(), /没有找到/);
                await sheet.locator('.pi-bot-notes-clear').click();
                await sheet.locator('[data-notes-tab="waiting"]').click();
                await action('b1', 'edit');
                assert.equal(await page.locator('[data-note-field="text"]').evaluate(node => node === document.activeElement), true);
                await sheet.locator('[data-note-field="text"]').fill('   '); await sheet.locator('[data-note-action="edit-save"]').click();
                assert.equal(await sheet.locator('.pi-bot-sheet-status').textContent(), '内容不能为空'); assert.equal(posts.length, 0);
                await sheet.locator('[data-note-field="text"]').fill('周六前把修改稿发给导师');
                refusal = 'NOTEBOOK_CHANGED'; const before = reads;
                await sheet.locator('[data-note-action="edit-save"]').click();
                await sheet.locator('.pi-bot-sheet-status').filter({ hasText: /已刷新/ }).waitFor();
                assert.equal(reads, before + 1); assert.equal(await sheet.locator('[data-note-field="text"]').inputValue(), '周六前把修改稿发给导师');
                assert.equal(await sheet.locator('[data-note-field="due"]').inputValue(), '2026-11-14');
                if (width < 600) assert.equal(await sheet.locator('[data-note-field="text"]').evaluate(node => parseFloat(getComputedStyle(node).fontSize)), 16);
                if (evidence) await settledShot(page, path.join(evidence, `buddy-notebook-edit-${width}.png`));
                await sheet.locator('[data-note-action="edit-save"]').click();
                await sheet.locator('[data-note-id="b1"] .pi-bot-note-text').filter({ hasText: '周六前' }).waitFor();
                assert.deepEqual(posts.at(-1).ops, [{ op: 'update', id: 'b1', text: '周六前把修改稿发给导师' }]);
                await sheet.locator('[data-note-id="b1"] [data-note-action="done"]').click();
                await sheet.locator('[data-note-id="b1"]').waitFor({ state: 'detached' });
                await sheet.locator('[data-notes-tab="closed"]').click(); assert.equal(await sheet.locator('[data-note-id="b1"]').count(), 1);
                await action('b5', 'reopen'); await sheet.locator('[data-note-id="b5"]').waitFor({ state: 'detached' });
                await sheet.locator('[data-notes-tab="waiting"]').click();
                await action('b5', 'delete'); assert.match(await sheet.locator('.pi-bot-note-ask').textContent(), /所有聊天/);
                assert.equal(await page.evaluate(() => document.activeElement?.dataset.noteAction), 'delete-cancel');
                const count = posts.length; await sheet.locator('[data-note-action="delete-cancel"]').click(); assert.equal(posts.length, count);
                await action('b5', 'delete'); await sheet.locator('[data-note-action="delete-confirm"]').click(); await sheet.locator('[data-note-id="b5"]').waitFor({ state: 'detached' });
                await sheet.locator('.pi-bot-notes-add').click();
                await sheet.locator('[data-note-field="text"]').fill('周一核对实验数据');
                await sheet.locator('.pi-bot-sheet-close').click(); assert.match(await sheet.locator('.pi-bot-sheet-status').textContent(), /修改还没保存/);
                assert.equal(await sheet.locator('[data-note-field="text"]').inputValue(), '周一核对实验数据');
                await sheet.locator('[data-note-field="subject"]').fill('实验设计');
                await sheet.locator('[data-note-action="edit-save"]').click(); await sheet.locator('[data-note-id="b6"] .pi-bot-note-text').waitFor();
                assert.deepEqual(posts.at(-1).ops, [{ op: 'add', kind: 'commitment', text: '周一核对实验数据', subject: '实验设计', due: null }]);
                await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
                if (width < 600) {
                    await page.locator('#pi-bot-header .pi-bot-menu').click(); await page.locator('#pi-session-pane.open .pi-bot-notes-link').click();
                    await sheet.waitFor(); assert.equal(await page.locator('#pi-session-pane').evaluate(node => node.classList.contains('open')), false);
                    assert.equal(await sheet.locator('.pi-bot-note-tools').first().isVisible(), false);
                    const sizes = await sheet.locator('[data-note-action="more"]').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height)); assert.ok(sizes.every(size => size >= 40));
                    await page.keyboard.press('Escape');
                }
                assert.equal(world.prompts.length, 0, 'no test prompts submitted'); assert.deepEqual(errors, []);
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth), true);
                console.log(JSON.stringify({ width, status: 'passed', writes: posts.length }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
