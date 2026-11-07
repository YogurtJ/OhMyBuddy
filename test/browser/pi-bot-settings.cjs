// Bot settings grants and trash (public/pi-bot-settings.js, pi-bot-rules.js and the approval
// card in pi-bot.js). "Always allow" on an approval card reads the settings fresh, appends the
// offered grant (keeping unknown ones and the way of working) and allows the step only if the
// same request is still waiting; a conflict saves nothing and answers nothing. Protected kinds
// never offer it. Settings show grants exactly, revoke them as a draft, and keep unknown ones.
// Moving a Bot to the trash needs an explicit confirmation, keeps the sheet on refusal and goes
// on to another Bot. Synthetic backend (pi-bot-fixture.js); desktop, phone and narrow phone.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, BOT2, MAIN2, APPROVAL, say, serve, botRecord, windowRecord, botPage, newWorld, layout, settingsPage } = require('./pi-bot-fixture.js');

const CWD = '/fixture/OhMyBuddyBots/bot-11111111';
const grant = (id, tool, value) => ({ v: 1, id, tool, value, cwd: CWD });
const R1 = grant('r1aaaaaaaaaaaaaaaaaaaaaa', 'bash', 'npm test'), R2 = grant('r2bbbbbbbbbbbbbbbbbbbbbb', 'write', '/home/me/notes.md');
const R3 = grant('r3cccccccccccccccccccccc', 'bash', 'ls -la'), R4 = grant('r4dddddddddddddddddddddd', 'edit', '/home/me/plan.md');
const FUTURE = { v: 2, id: 'future-1', tool: 'browser', pattern: 'https://example.invalid/*' };
const token = digit => digit.repeat(16);

(async () => {
    const { base, close } = await serve();
    const evidence = process.env.PI_BOT_EVIDENCE;
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const width of [1440, 768, 393, 320]) {
            const phone = width <= 600;
            let rules = [R1, R2, FUTURE], revision = 's1', trashed = false, patchGate = null, name = '小狸';
            const patchPlan = ['conflict'], trashPlan = ['blocked', 'unavailable'], patches = [], trashes = [];
            const second = botRecord({ id: BOT2, name: '阿豆', avatar: { kind: 'emoji', value: '🐼' }, windows: [windowRecord(MAIN2)] });
            const world = newWorld({
                bots: () => trashed ? [second] : [botRecord({ name, bot: { permissions: { preset: 'balanced', rules: rules.length } } }), second],
                messages: () => [say('user', '帮我看看目录', '2026-10-26T06:00:00Z'), say('assistant', '好的。', '2026-10-26T06:00:05Z')]
            });
            Object.defineProperty(world, 'revision', { get: () => revision });
            const api = async ({ pathname, method, body }) => {
                if (pathname === `/api/pi/bots/${BOT}/settings`) return { json: { revision, bot: { id: BOT, name, avatar: { kind: 'emoji', value: '🦊' }, soul: '',
                    bot: { ...botRecord().bot, permissions: { preset: 'balanced', rules } } },
                    // A long default model name: the section summaries must shrink, not widen the phone overview.
                    models: { defaults: { provider: 'fixture', modelId: 'long' }, models: [{ provider: 'fixture', id: 'long', name: 'Fixture Extended Reasoning Model With A Very Long Name' }] } } };
                if (pathname === `/api/pi/bots/${BOT}` && method === 'PATCH') {
                    patches.push(body);
                    if (patchGate) { const wait = patchGate; patchGate = null; await wait; }
                    if (patchPlan.length && patchPlan.shift() === 'conflict') { revision = patches.length === 1 ? 's2' : `${revision}c`; return { status: 409, json: { error: 'Profiles changed' } }; }
                    assert.equal(body.expectedRevision, revision);
                    if (body.changes.bot?.permissions?.rules) rules = body.changes.bot.permissions.rules;
                    if (body.changes.name) name = body.changes.name;
                    revision = `${revision}+`;
                    return { json: { ok: true, revision } };
                }
                if (pathname === `/api/pi/bots/${BOT}/trash` && method === 'POST') {
                    trashes.push(body);
                    const refusal = trashPlan.shift();
                    if (refusal === 'blocked') return { status: 409, json: { error: 'Bot has scheduled tasks', code: 'BOT_HAS_SCHEDULES' } };
                    if (refusal === 'unavailable') return { status: 503, json: { error: 'Bot trash is unavailable until its activity checks are ready', code: 'BOT_TRASH_UNAVAILABLE' } };
                    assert.equal(body.expectedRevision, revision);
                    trashed = true; revision = 's9';
                    return { json: { ok: true, revision } };
                }
                return undefined;
            };
            const { context, page, errors } = await botPage(browser, base, world, { width, api });
            const shot = async label => { if (evidence) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(evidence, `${label}-${width}.png`) }); } };
            const ask = (id, message) => world.socket.send(JSON.stringify({ type: 'extension_ui_request', id, method: 'confirm', title: APPROVAL, message }));
            const resolved = id => world.socket.send(JSON.stringify({ type: 'gateway_ui_resolved', id }));
            const card = page.locator('.pi-bot-approval:not([hidden])');
            const openSettings = async () => {
                if (width <= 900) { await page.locator('#pi-bot-header .pi-bot-menu').click(); await page.locator('#pi-session-pane.open .pi-bot-settings').waitFor(); }
                await page.locator('.pi-bot-settings').click();
                await page.locator('.pi-bot-sheet[open] .pi-bot-sheet-nav').waitFor();
                return page.locator('.pi-bot-sheet[open]');
            };
            try {
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected');

                // 1. "Always allow" is a second, explicit step that shows exactly what it covers.
                ask('keep-1', `command #${token('1')}\nrule ${JSON.stringify(R3)}\n\nls -la`);
                await card.waitFor();
                assert.equal(await card.locator('.pi-bot-approval-allow').textContent(), '允许这次');
                await card.locator('.pi-bot-approval-keep').click();
                const scope = await card.locator('.pi-bot-approval-scope').innerText();
                assert.match(scope, /运行这条命令/); assert.match(scope, /ls -la/); assert.match(scope, new RegExp(`在 ${CWD} 中`));
                assert.match(scope, /完全相同的这条命令/); assert.match(scope, /不是系统沙箱/);
                assert.equal(patches.length, 0, 'the first click only explains');
                const cardBox = await card.boundingBox();
                for (const control of await card.locator('footer button').all()) {
                    const box = await control.boundingBox();
                    assert.ok(box.x >= cardBox.x - 1 && box.x + box.width <= cardBox.x + cardBox.width + 1, 'the card\'s buttons fit its width');
                    if (phone) assert.ok(box.height >= 44, 'touch-sized buttons');
                }
                await shot('bot-approval-keep');
                // A conflict saves nothing and answers nothing; the card stays.
                await card.locator('.pi-bot-approval-keep').click();
                await card.locator('.pi-bot-setup-note.is-error').filter({ hasText: '规则还没保存' }).waitFor();
                assert.deepEqual(world.responses, []);
                await card.locator('.pi-bot-approval-keep').click();
                await page.waitForFunction(() => document.querySelectorAll('.pi-bot-approval button:disabled').length > 0);
                for (let i = 0; i < 50 && !world.responses.length; i++) await page.waitForTimeout(100);
                assert.deepEqual(world.responses, [{ type: 'extension_ui_response', id: 'keep-1', confirmed: true }]);
                assert.deepEqual(patches.map(body => [body.expectedRevision, body.changes]), [
                    ['s1', { bot: { permissions: { rules: [R1, R2, FUTURE, R3] } } }],
                    ['s2', { bot: { permissions: { rules: [R1, R2, FUTURE, R3] } } }]], 'fresh settings each time; unknown grants and the preset kept');
                resolved('keep-1');
                await page.waitForFunction(() => document.querySelector('.pi-bot-approval').hidden);

                // 2. A request that stops waiting during the save is not answered afterwards.
                let release;
                patchGate = new Promise(resolve => { release = resolve; });
                ask('keep-2', `write #${token('2')}\nrule ${JSON.stringify(R4)}\n\n/home/me/plan.md`);
                await card.waitFor();
                assert.match(await card.locator('header strong').textContent(), /想写入文件/);
                await card.locator('.pi-bot-approval-keep').click();
                await card.locator('.pi-bot-approval-keep').click();
                for (let i = 0; i < 50 && patches.length < 3; i++) await page.waitForTimeout(50);
                resolved('keep-2');
                await page.waitForFunction(() => document.querySelector('.pi-bot-approval').hidden);
                release();
                await page.locator('.pi-toast').filter({ hasText: '那一步已经不在等待' }).waitFor();
                assert.equal(world.responses.length, 1, 'no answer for a request that is gone');
                assert.deepEqual(rules, [R1, R2, FUTURE, R3, R4]);

                // 3. Protected or mismatched requests never offer it; a broken header still asks once.
                for (const [id, message] of [['memory', `memory #${token('3')}\nrule ${JSON.stringify(R1)}\n\n记住这件事`],
                    ['mismatch', `command #${token('4')}\nrule ${JSON.stringify(R2)}\n\nrm -rf build`],
                    ['broken', `command #${token('5')}\nrule {"v":1,"id":"x","tool":"bash","value":"pwd","cwd":"relative"}\n\npwd`],
                    ['plain', `outside #${token('6')}\n\n/etc/hosts`]]) {
                    ask(id, message);
                    await card.waitFor();
                    assert.equal(await card.locator('.pi-bot-approval-keep').count(), 0, `${id}: no "always allow"`);
                    assert.equal(await card.locator('.pi-bot-approval-allow').textContent(), '允许');
                    await card.locator('.pi-bot-setup-later').click();
                    assert.deepEqual(world.responses.at(-1), { type: 'extension_ui_response', id, confirmed: false });
                    resolved(id);
                    await page.waitForFunction(() => document.querySelector('.pi-bot-approval').hidden);
                }

                // 4. The side list and phone overview reach every section; only the chosen page shows.
                let sheet = await openSettings();
                const sections = ['profile', 'model', 'mode', 'notify', 'wechat', 'learning', 'more'];
                const labels = ['资料', '模型', '做事方式', '主动联系', '微信', '学习与记忆', '更多'];
                const nav = sheet.locator('.pi-bot-sheet-nav');
                assert.equal(await sheet.locator('h2').textContent(), '小狸 的设置');
                assert.equal(await sheet.getAttribute('data-view'), phone ? 'overview' : 'page');
                assert.deepEqual(await sheet.locator('.pi-bot-sheet-page:visible').evaluateAll(nodes => nodes.map(node => node.dataset.page)), phone ? [] : ['profile']);
                assert.equal(await nav.locator('.pi-bot-sheet-nav-item:visible').count(), phone ? 6 : 7);
                assert.equal(await nav.locator('.pi-bot-sheet-hero').isVisible(), phone);
                if (!phone) assert.equal(await nav.locator('[data-nav="profile"]').last().getAttribute('aria-current'), 'page');
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true);
                if (phone) assert.equal(await sheet.locator('.pi-bot-sheet-foot').isVisible(), false, 'nothing edited: no footer');
                const checkLayout = async () => {
                    assert.equal((await layout(page)).overflow, false, `no horizontal overflow at ${width}`);
                    const bounds = await sheet.boundingBox();
                    for (const control of await sheet.locator('input:visible, textarea:visible, select:visible, button:visible').all()) {
                        const box = await control.boundingBox();
                        assert.ok(box.x >= bounds.x - 1 && box.x + box.width <= bounds.x + bounds.width + 1, 'controls fit the sheet');
                    }
                    if (width <= 900) {
                        for (const control of await sheet.locator('.pi-bot-sheet-nav-item:visible, .pi-bot-sheet-preset:visible, .pi-bot-sheet-check:visible, .pi-bot-sheet-rule .pi-bot-chip:visible').all())
                            assert.ok((await control.boundingBox()).height >= 44, 'touch-sized rows and grant controls up to 900px');
                    }
                    if (phone) {
                        for (const input of await sheet.locator('input[type="text"]:visible, input[type="time"]:visible, textarea:visible, select:visible').all())
                            assert.equal(await input.evaluate(node => getComputedStyle(node).fontSize), '16px', 'no zoom on phone focus');
                    }
                };
                await checkLayout();
                for (const [index, id] of sections.entries()) {
                    await settingsPage(sheet, id);
                    assert.equal(await sheet.getAttribute('data-view'), 'page');
                    assert.deepEqual(await sheet.locator('.pi-bot-sheet-page:visible').evaluateAll(nodes => nodes.map(node => node.dataset.page)), [id]);
                    assert.equal(await nav.locator(`.pi-bot-sheet-nav-item[data-nav="${id}"]`).getAttribute('aria-current'), 'page');
                    assert.equal(await nav.locator('[aria-current="page"]').count(), 1);
                    assert.equal(await sheet.locator('h2').textContent(), phone ? labels[index] : '小狸 的设置');
                    await checkLayout();
                    if (phone) {
                        await sheet.locator('.pi-bot-sheet-back').click();
                        assert.equal(await sheet.getAttribute('data-view'), 'overview');
                        assert.equal(await sheet.locator('.pi-bot-sheet-page:visible').count(), 0);
                        assert.equal(await sheet.locator('h2').textContent(), '小狸 的设置');
                        assert.equal(await sheet.locator('.pi-bot-sheet-back').isVisible(), false);
                        assert.equal(await page.evaluate(() => document.activeElement?.dataset.nav), id, 'back focuses the section that opened the page');
                    }
                }
                // Invalid input shows a problem and submitting from elsewhere returns to its section.
                await settingsPage(sheet, 'profile');
                await sheet.locator('input[required]').fill('');
                assert.equal(await sheet.locator('.pi-bot-sheet-dirty').evaluate(node => node.classList.contains('is-error')), true);
                assert.equal(await sheet.locator('.pi-bot-sheet-dirty').textContent(), '名字不能为空');
                await settingsPage(sheet, 'more');
                await sheet.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
                await sheet.locator('.pi-bot-sheet-page[data-page="profile"]').waitFor();
                assert.equal(await sheet.locator('input[required]').evaluate(node => node === document.activeElement), true);
                assert.equal(await sheet.locator('.pi-bot-sheet-status[data-tone="error"]').textContent(), '名字不能为空');
                assert.equal(await sheet.locator('.pi-bot-sheet-dirty').isVisible(), false, 'a status message replaces the dirty note');
                await sheet.locator('input[required]').fill('小狸');
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true);

                // Changing the way of working updates its scope and summary, and reverting clears the draft mark.
                await settingsPage(sheet, 'mode');
                const modeNav = nav.locator('[data-nav="mode"]');
                const workScope = sheet.locator('.pi-bot-sheet-scope');
                assert.ok((await workScope.locator('.is-direct li').allTextContents()).includes('运行命令和脚本'));
                assert.ok((await workScope.locator('.is-ask li').allTextContents()).includes('密码和密钥文件'));
                assert.equal(await workScope.locator('.pi-bot-sheet-scope-never').count(), 0);
                assert.equal(await modeNav.locator('.pi-bot-sheet-nav-sub').textContent(), '稳妥');
                await sheet.locator('.pi-bot-sheet-preset[data-preset="free"]').click();
                assert.equal(await workScope.locator('.pi-bot-sheet-scope-never').count(), 0);
                assert.ok((await workScope.locator('.is-direct li').allTextContents()).includes('运行任何命令和脚本'));
                assert.ok((await workScope.locator('.is-ask li').allTextContents()).includes('建议新建话题'));
                assert.equal(await modeNav.locator('.pi-bot-sheet-nav-sub').textContent(), '放手');
                assert.equal(await modeNav.evaluate(node => node.classList.contains('is-dirty')), true);
                assert.equal(await sheet.locator('.pi-bot-sheet-dirty').innerText(), '未保存：做事方式');
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isEnabled(), true);
                await sheet.locator('.pi-bot-sheet-preset[data-preset="ask"]').click();
                assert.match(await workScope.locator('.pi-bot-sheet-scope-never').textContent(), /密码和密钥文件：直接拒绝/);
                if (phone) {
                    await sheet.locator('.pi-bot-sheet-back').click();
                    assert.equal(await modeNav.isVisible(), true);
                    assert.equal(await modeNav.evaluate(node => node.classList.contains('is-dirty')), true);
                    await settingsPage(sheet, 'mode');
                }
                await sheet.locator('.pi-bot-sheet-preset[data-preset="balanced"]').click();
                assert.ok((await workScope.locator('.is-direct li').allTextContents()).includes('运行命令和脚本'));
                assert.ok((await workScope.locator('.is-ask li').allTextContents()).includes('密码和密钥文件'));
                assert.equal(await workScope.locator('.pi-bot-sheet-scope-never').count(), 0);
                assert.equal(await modeNav.locator('.pi-bot-sheet-nav-sub').textContent(), '稳妥');
                assert.equal(await modeNav.evaluate(node => node.classList.contains('is-dirty')), false);
                assert.equal(await sheet.locator('.pi-bot-sheet-dirty').isVisible(), false);
                assert.equal(await sheet.locator('.pi-bot-sheet-save').isDisabled(), true);

                // Grants start folded; the count includes unknown grants and excludes draft revocations.
                const grants = sheet.locator('.pi-bot-sheet-rules');
                const items = grants.locator('.pi-bot-sheet-rule');
                assert.equal(await grants.evaluate(node => node.open), false);
                assert.equal(await grants.locator('.pi-bot-sheet-count').textContent(), '5');
                assert.equal(await items.first().isVisible(), false);
                assert.equal(await sheet.locator('details.is-boundary').evaluate(node => node.open), false);
                assert.match(await sheet.locator('details.is-boundary > summary').textContent(), /安全边界.*不是系统沙箱/);
                await grants.locator(':scope > summary').click();
                assert.equal(await items.count(), 4);
                assert.deepEqual(await grants.locator('.pi-bot-sheet-rule code').allTextContents(), ['npm test', '/home/me/notes.md', 'ls -la', '/home/me/plan.md']);
                assert.match(await grants.innerText(), /另有 1 条这个版本看不懂的规则/);
                assert.doesNotMatch(await grants.innerText(), /不是系统沙箱/);
                await checkLayout();
                await grants.locator(`[data-rule-id="${R1.id}"]`).click();
                assert.equal(await items.first().evaluate(node => node.classList.contains('is-revoked')), true);
                assert.equal(await grants.locator('.pi-bot-sheet-count').textContent(), '4');
                assert.equal(await page.evaluate(() => document.activeElement?.dataset.ruleId), R1.id, 'focus stays on the toggled grant');
                await grants.locator(`[data-rule-id="${R1.id}"]`).click();
                assert.equal(await grants.locator('.pi-bot-sheet-count').textContent(), '5');
                assert.equal(await modeNav.evaluate(node => node.classList.contains('is-dirty')), false);
                await grants.locator(`[data-rule-id="${R1.id}"]`).click();
                await shot('bot-settings-grants');
                await page.keyboard.press('Escape');
                await sheet.locator('.pi-bot-sheet-status').filter({ hasText: '还有修改没保存' }).waitFor();
                patchPlan.push('conflict');
                await sheet.locator('.pi-bot-sheet-save').click();
                await sheet.locator('.pi-bot-sheet-status[data-tone="warn"]').filter({ hasText: '别处改过' }).waitFor();
                assert.equal(await grants.evaluate(node => node.open), true, 'a conflict reread keeps the disclosure open');
                assert.equal(await sheet.locator('.pi-bot-sheet-page[data-page="mode"]').isVisible(), true, 'a conflict keeps the current section');
                assert.equal(await grants.locator('.pi-bot-sheet-count').textContent(), '4');
                assert.equal(await items.first().evaluate(node => node.classList.contains('is-revoked')), true, 'the revocation draft survives');
                await sheet.locator('.pi-bot-sheet-save').click();
                await page.locator('.pi-bot-sheet').waitFor({ state: 'detached' });
                assert.deepEqual(patches.at(-1).changes, { bot: { permissions: { rules: [R2, FUTURE, R3, R4] } } });

                // 5. Trash: one confirmation names unsaved edits; a refusal keeps
                // the sheet and the edits, and success goes on to the other Bot.
                sheet = await openSettings();
                const reviewed = revision;
                await settingsPage(sheet, 'profile');
                await sheet.locator('input[required]').fill('小狸二号');
                await settingsPage(sheet, 'more');
                await sheet.locator('[data-sheet-action="trash"]').click();
                const confirm = page.locator('.pi-profile-confirm[open]');
                await confirm.waitFor();
                assert.equal(await confirm.locator('h2').textContent(), '把 小狸 移到回收站？');
                assert.match(await confirm.locator('ul.pi-profile-confirm-list li').first().textContent(), /聊天记录.*都会保留.*回收站恢复/);
                assert.match(await confirm.locator('.pi-profile-confirm-item.is-warn').textContent(), /还有修改没保存，继续会放弃这些修改/);
                assert.equal(trashes.length, 0, 'confirmation has not moved anything yet');
                await confirm.getByRole('button', { name: '保留', exact: true }).click();
                assert.equal(trashes.length, 0, 'cancelling does not send a request');
                await settingsPage(sheet, 'profile');
                assert.equal(await sheet.locator('input[required]').inputValue(), '小狸二号');
                await settingsPage(sheet, 'more');
                await sheet.locator('[data-sheet-action="trash"]').click();
                await confirm.waitFor();
                await shot('bot-trash-confirm');
                await confirm.locator('.pi-profile-confirm-discard').click();
                await sheet.locator('.pi-bot-sheet-status[data-tone="error"]').filter({ hasText: '还有定时任务发给 小狸' }).waitFor();
                await settingsPage(sheet, 'profile');
                assert.equal(await sheet.locator('input[required]').inputValue(), '小狸二号', 'the edits survive a refusal');
                await settingsPage(sheet, 'more');
                assert.equal(trashed, false);
                // Checks that are not ready yet are explained in the user's language, not the server's.
                await sheet.locator('[data-sheet-action="trash"]').click();
                await confirm.waitFor();
                await confirm.locator('.pi-profile-confirm-discard').click();
                await sheet.locator('.pi-bot-sheet-status[data-tone="error"]').filter({ hasText: '回收站前的检查暂时还没准备好' }).waitFor();
                assert.doesNotMatch(await sheet.locator('.pi-bot-sheet-status').textContent(), /unavailable|activity/i);
                assert.equal(trashed, false);
                await sheet.locator('[data-sheet-action="trash"]').click();
                await confirm.waitFor();
                await confirm.locator('.pi-profile-confirm-discard').click();
                await page.locator('.pi-bot-sheet').waitFor({ state: 'detached' });
                assert.deepEqual(trashes, [{ expectedRevision: reviewed }, { expectedRevision: reviewed }, { expectedRevision: reviewed }], 'the settings the user reviewed, no silent reread');
                await page.locator('.pi-toast').filter({ hasText: '已移到回收站' }).waitFor();
                await page.waitForFunction(id => decodeURIComponent(location.hash).includes(`profileId=${id}`), BOT2);
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-who strong')?.textContent === '阿豆');
                assert.equal(patches.filter(body => body.changes.name).length, 0, 'the unsaved name was never saved');

                assert.equal((await layout(page)).overflow, false, `no horizontal overflow at ${width}`);
                assert.deepEqual(errors, []);
                console.log(JSON.stringify({ width, status: 'passed', patches: patches.length }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
