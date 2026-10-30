// Whole-page topic organization and lifecycle with synthetic data only. Server CAS,
// native ownership, file deletion and interruption are covered by the matching Node test.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, MAIN, serve, botRecord, windowRecord, botPage, newWorld, layout, settledShot } = require('./pi-bot-fixture');
const T1 = '55555555-5555-4555-8555-555555555555', T2 = '66666666-6666-4666-8666-666666666666', T3 = '77777777-7777-4777-8777-777777777777';
const G1 = '88888888-8888-4888-8888-888888888888', G2 = '99999999-9999-4999-8999-999999999999';
(async () => {
    const { base, close } = await serve(); let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const [width, language, theme] of [[1440, 'zh-CN', 'daylight'], [393, 'en', 'dark'], [320, 'zh-CN', 'mint']]) {
            let revision = 1, groups = [], moved = 0, staleMove = true, trashReads = 0, staleRename = true, renameAttempts = 0;
            let windows = [windowRecord(MAIN), windowRecord(T1, { kind: 'topic', title: 'Reading', emoji: '', generations: 2 }),
                windowRecord(T2, { kind: 'topic', title: 'English', emoji: '🌍' }), windowRecord(T3, { kind: 'topic', title: 'Archived', emoji: '', archivedAt: '2026-10-25T00:00:00Z' }),
                ...Array.from({ length: 10 }, (_, index) => windowRecord(`90000000-0000-4000-8000-${String(index).padStart(12, '0')}`, { kind: 'topic', emoji: '', title: `Project notes ${index + 1} — a longer title for narrow layouts`, sessionId: `extra-${index}` }))];
            const rev = () => revision.toString(16).padStart(64, '0');
            const world = newWorld({ bots: () => [{ ...botRecord({ windows: windows.filter(topic => !topic.trashedAt), windowsRevision: rev() }), groups, trashCount: windows.filter(topic => topic.trashedAt).length }] });
            const writes = [];
            const api = ({ pathname, method, body }) => {
                if (method === 'GET') {
                    if (pathname.endsWith('/topics/trash')) { trashReads++; if (trashReads === 1) return { status: 503, json: { error: 'Synthetic read failure' } }; return { json: { windowsRevision: rev(), groups, windows: windows.filter(topic => topic.trashedAt) } }; }
                    const match = pathname.match(/\/windows\/([^/]+)\/session$/), topic = match && windows.find(item => item.id === match[1]);
                    if (topic?.trashedAt) return { status: 409, json: { code: 'BOT_TOPIC_TRASHED', error: 'Restore first' } };
                    return undefined;
                }
                if (!pathname.startsWith(`/api/pi/bots/${BOT}/`)) return undefined;
                writes.push({ pathname, method, body });
                assert.equal(body.expectedRevision, rev());
                if (pathname.endsWith('/topic-groups') && method === 'POST') {
                    const group = { id: groups.length ? G2 : G1, name: body.name }; groups.push(group);
                    windows = windows.map(topic => body.windowIds?.includes(topic.id) ? { ...topic, groupId: group.id } : topic); revision++;
                    return { json: { ok: true, group, groups, windowsRevision: rev() } };
                }
                const groupMatch = pathname.match(/\/topic-groups\/([^/]+)$/);
                if (groupMatch) {
                    const id = groupMatch[1], group = groups.find(item => item.id === id);
                    if (body.name !== undefined) { renameAttempts++; if (staleRename) { staleRename = false; revision++; return { status: 409, json: { error: 'Synthetic rename conflict' } }; } }
                    if (method === 'DELETE') { groups = groups.filter(item => item.id !== id); windows = windows.map(topic => topic.groupId === id ? { ...topic, groupId: null } : topic); }
                    else { if (body.name !== undefined) group.name = body.name; if (Object.hasOwn(body, 'beforeGroupId')) { groups = groups.filter(item => item.id !== id); const before = body.beforeGroupId === null ? groups.length : groups.findIndex(item => item.id === body.beforeGroupId); groups.splice(before, 0, group); } } revision++;
                    return { json: { ok: true, group, groups, windowsRevision: rev() } };
                }
                if (pathname.endsWith('/topics/move')) {
                    moved++; revision++;
                    if (staleMove) { staleMove = false; return { status: 409, json: { error: 'Synthetic revision conflict' } }; }
                    windows = windows.map(topic => body.windowIds.includes(topic.id) ? { ...topic, groupId: body.groupId } : topic);
                    return { json: { ok: true, moved: body.windowIds.length, windowsRevision: rev() } };
                }
                const match = pathname.match(/\/windows\/([^/]+)(?:\/(trash|restore))?$/);
                if (match) {
                    const id = match[1], action = match[2]; revision++;
                    if (action === 'trash') windows = windows.map(topic => topic.id === id ? { ...topic, trashedAt: '2026-10-29T12:00:00Z' } : topic);
                    else if (action === 'restore') windows = windows.map(topic => topic.id === id ? { ...topic, trashedAt: null } : topic);
                    else if (method === 'DELETE') { assert.equal(body.confirmed, true); windows = windows.filter(topic => topic.id !== id); }
                    else { const { expectedRevision, ...fields } = body; windows = windows.map(topic => topic.id === id ? { ...topic, ...fields } : topic); }
                    return { json: { ok: true, windowsRevision: rev() } };
                }
                throw new Error(`Unexpected write ${method} ${pathname}`);
            };
            const { page, context, errors } = await botPage(browser, base, world, { width, height: width === 320 ? 600 : 860, api });
            try {
                await page.evaluate(language => localStorage.setItem('pi.workspace.language', language), language); await page.reload({ waitUntil: 'domcontentloaded' });
                await page.locator('html').evaluate((node, theme) => { node.dataset.theme = theme; }, theme);
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected');
                const translate = source => page.evaluate(source => window.PiI18n.t(source), source);
                const manager = page.locator('.pi-bot-topic-manager[open]'), editor = page.locator('.pi-bot-topic-sheet[open]');
                const openPane = async () => { if (width < 900 && !await page.locator('#pi-session-pane.open').count()) await page.locator('#pi-bot-header .pi-bot-menu').click(); };
                const organize = async view => { await openPane(); await page.getByRole('button', { name: await translate('整理话题'), exact: true }).click(); if (view) await manager.locator(`[data-topic-tab="${view}"]`).click(); };
                const closeSheet = async sheet => sheet.locator('.pi-bot-sheet-close').click();
                const edit = async () => { await openPane(); await page.locator(`.pi-bot-topic-row:has([data-window-id="${T1}"]) .pi-bot-topic-edit`).click(); await editor.waitFor(); };
                const checkLayout = async () => {
                    assert.equal((await layout(page)).overflow, false);
                    const bad = await page.locator('dialog[open] input:not([type="checkbox"]),dialog[open] select,dialog[open] textarea').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && !node.hidden).map(node => ({ width: node.getBoundingClientRect().width, font: Number.parseFloat(getComputedStyle(node).fontSize), right: node.getBoundingClientRect().right })).filter(item => item.right > innerWidth + 1 || innerWidth < 900 && item.font < 16));
                    assert.deepEqual(bad, [], `controls fit and keep 16px text at ${width}`);
                    const opened = page.locator('dialog[open]').last(), box = await opened.boundingBox(), x = await opened.locator('.pi-bot-sheet-close').boundingBox();
                    if (box && x) assert.ok(x.x + x.width > box.x + box.width - 35, 'close control stays at the trailing edge');
                };
                const shot = async name => { if (process.env.PI_BOT_EVIDENCE) await settledShot(page, path.join(process.env.PI_BOT_EVIDENCE, `topic-manager-${name}-${width}-${language}.png`)); };
                await page.locator('#pi-input').fill('Unsent draft');
                await organize('groups'); await manager.locator('[data-topic-group-name]').fill('Study');
                await manager.getByRole('button', { name: await translate('新建分组'), exact: true }).click();
                await manager.locator(`[data-group-id="${G1}"]`).waitFor();
                await manager.locator('[data-topic-group-name]').fill('Languages'); await manager.getByRole('button', { name: await translate('新建分组'), exact: true }).click();
                const card = id => manager.locator(`[data-group-id="${id}"]`); await card(G2).waitFor();
                await card(G2).getByRole('button', { name: await translate('{0}分组“{1}”').then(text => text.replace('{0}', language === 'en' ? 'Move up' : '上移').replace('{1}', 'Languages')), exact: true }).click();
                await page.waitForFunction(id => document.querySelector('.pi-bot-topic-group-card')?.dataset.groupId === id, G2); assert.deepEqual(groups.map(group => group.id), [G2, G1]);
                await card(G1).getByRole('button', { name: await translate('改名分组“{0}”').then(text => text.replace('{0}', 'Study')), exact: true }).click();
                assert.equal(await card(G1).getByRole('button', { name: await translate('保存名称'), exact: true }).isEnabled(), false, 'unchanged names are not resubmitted');
                await card(G1).locator('[data-group-rename]').fill('Study plan'); await card(G1).getByRole('button', { name: await translate('保存名称'), exact: true }).click();
                await manager.locator('[role="status"]').filter({ hasText: await translate('话题列表刚刚有变化，请检查后重新确认。') }).waitFor();
                assert.equal(renameAttempts, 1); assert.equal(await card(G1).locator('[data-group-rename]').inputValue(), 'Study plan', 'rename conflicts preserve the draft and never replay');
                await card(G1).getByRole('button', { name: await translate('保存名称'), exact: true }).click();
                await card(G1).getByText('Study plan', { exact: true }).waitFor(); await checkLayout(); await shot('groups');
                await card(G2).getByRole('button', { name: await translate('删除分组“{0}”').then(text => text.replace('{0}', 'Languages')), exact: true }).click();
                await card(G2).getByRole('button', { name: await translate('确认删除分组'), exact: true }).click(); await card(G2).waitFor({ state: 'detached' });
                assert.equal(trashReads, 0, 'neither the ordinary list nor group management fetches trash');
                await checkLayout(); await closeSheet(manager);
                await organize('move');
                await manager.locator(`input[type="checkbox"][value="${T1}"]`).check(); await manager.locator(`input[type="checkbox"][value="${T2}"]`).check();
                await manager.locator('[data-topic-destination]').selectOption(G1);
                await shot('selection');
                await manager.getByRole('button', { name: await translate('移动'), exact: true }).click();
                await manager.locator('[role="status"]').filter({ hasText: await translate('话题列表刚刚有变化，请检查后重新确认。') }).waitFor();
                assert.equal(moved, 1, 'a stale move is not replayed');
                await manager.getByRole('button', { name: await translate('移动'), exact: true }).click();
                await page.waitForFunction(text => document.querySelector('.pi-bot-topic-manager [role="status"]')?.textContent === text, await translate('已保存'));
                assert.equal(moved, 2); assert.equal(windows.find(topic => topic.id === T1).groupId, G1); await checkLayout();
                assert.equal(await manager.locator(`input[value="${T1}"]`).count(), 0, 'the default ungrouped filter excludes already grouped topics');
                await manager.locator('[data-topic-source="*"]').click();
                assert.equal(await manager.locator(`.pi-bot-topic-check-row:has(input[value="${T1}"]) .pi-bot-topic-origin`).textContent(), 'Study plan');
                assert.equal(await manager.locator('.pi-bot-topic-check-group').count(), 2, 'all topics remain visibly separated by current group');
                const footerBox = await manager.locator('.pi-bot-sheet-foot').boundingBox(); assert.ok(footerBox.y + footerBox.height <= page.viewportSize().height + 1);
                await shot('bulk'); await closeSheet(manager);
                await openPane();
                assert.equal(await page.locator('.pi-bot-topic-group > summary').filter({ hasText: 'Study' }).count(), 1);
                await page.getByRole('combobox', { name: await translate('筛选话题分组') }).selectOption(G1);
                await page.getByRole('searchbox', { name: await translate('搜索话题') }).fill('Reading');
                assert.equal(await page.locator('.pi-bot-topic-row').count(), 1); await shot('list');
                const search = page.getByRole('searchbox', { name: await translate('搜索话题') });
                await search.evaluate(node => { node.setSelectionRange(1, 4); node.dataset.beforeRepaint = 'true'; });
                world.socket.send(JSON.stringify({ type: 'agent_start' })); world.socket.send(JSON.stringify({ type: 'agent_end', messages: [] })); world.socket.send(JSON.stringify({ type: 'agent_settled' }));
                await page.waitForFunction(() => !document.querySelector('[data-before-repaint]'), null, { timeout: 9000 });
                assert.deepEqual(await search.evaluate(node => ({ focused: document.activeElement === node, start: node.selectionStart, end: node.selectionEnd })), { focused: true, start: 1, end: 4 }, 'topic activity preserves search focus and selection');
                await edit(); await editor.locator('.pi-bot-topic-emoji-picker > summary').click();
                await editor.getByRole('button', { name: await translate('使用图标 {0}').then(text => text.replace('{0}', '❓')), exact: true }).click();
                assert.equal(await editor.locator('[data-topic-field="emoji"]').inputValue(), '❓'); await checkLayout(); await shot('emoji');
                await editor.locator('.pi-bot-sheet-save').click(); await editor.waitFor({ state: 'detached' });
                const patch = writes.findLast(item => item.method === 'PATCH'); assert.deepEqual(Object.keys(patch.body).sort(), ['emoji', 'expectedRevision']); assert.equal(patch.body.emoji, '❓');
                const trashOnce = async () => { await edit(); const trash = editor.locator('[data-topic-action="trash"]'); await trash.click(); await trash.click(); await editor.waitFor({ state: 'detached' }); };
                await trashOnce(); assert.ok(windows.find(topic => topic.id === T1).trashedAt); await organize('trash');
                await manager.getByText(await translate('回收站暂时无法读取，请重试。'), { exact: true }).waitFor();
                assert.equal(await manager.getByText(await translate('回收站是空的'), { exact: true }).count(), 0, 'a read error is not an empty trash');
                await manager.getByRole('button', { name: await translate('重试'), exact: true }).click();
                await manager.locator('.pi-bot-topic-trash-row').getByRole('button', { name: await translate('恢复'), exact: true }).click();
                await manager.locator('.pi-bot-topic-trash-row').waitFor({ state: 'detached' }); assert.equal(windows.find(topic => topic.id === T1).groupId, G1); await closeSheet(manager);
                await trashOnce(); await organize('trash');
                const row = manager.locator('.pi-bot-topic-trash-row'); await row.getByRole('button', { name: await translate('彻底删除'), exact: true }).click();
                const confirm = row.getByRole('button', { name: await translate('确认彻底删除'), exact: true }); assert.equal(await confirm.isEnabled(), false);
                await row.locator('[data-delete-confirm] input').fill('Wrong name'); assert.equal(await confirm.isEnabled(), false);
                assert.equal(writes.filter(item => item.method === 'DELETE' && item.pathname.includes('/windows/')).length, 0);
                await row.locator('[data-delete-confirm] input').fill('Reading'); assert.equal(await confirm.isEnabled(), true); await checkLayout(); await shot('delete');
                await confirm.click(); await row.waitFor({ state: 'detached' }); assert.equal(writes.filter(item => item.method === 'DELETE' && item.pathname.includes('/windows/')).length, 1); await closeSheet(manager);
                assert.equal(await page.locator('#pi-input').inputValue(), 'Unsent draft'); assert.equal(world.prompts.length, 0); assert.deepEqual(errors, []);
                console.log(JSON.stringify({ width, language, theme, writes: writes.length, errors, layout: await layout(page) }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
