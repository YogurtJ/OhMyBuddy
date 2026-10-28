// Docked Bot panels on the real page (public/pi-bot.js docked panels, pi-bot.css): a setup card
// keeps its title clear of the floating identity and its actions in view, only its body scrolls,
// and its height follows the laid-out page (short phones, a keyboard-like shrink, large text). A
// redraw after a failed save keeps the scroll position, the focused control and every edit. A way
// of working carried along unchanged is not shown, and the save says so (workStyleShown: false);
// a card that only asks it (even with blank optional fields) shows the three choices and says so
// when left for later (true). Long "mainly helps with" text wraps and grows to a bound. An
// approval card stays usable on a short phone, and in Bot mode the empty row under the composer
// takes no room while Pi Agent keeps it. Synthetic backend (pi-bot-fixture.js); desktop, phone and
// narrow short phone; daylight and dark.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, APPROVAL, say, serve, botRecord, botPage, newWorld, layout, settingsPage } = require('./pi-bot-fixture.js');

const SELECT = { method: 'select', title: '保存这些设置？ / Save these settings?', options: ['保存 / Save', '先不改 / Not now'] };
const JOB = '帮助小王制作各类文稿与视觉材料，包括汇报幻灯片、海报、产品介绍页和社交媒体配图；先确认受众、用途和截止时间，再给出结构草稿，'
    + '按反馈逐步修改，最后整理成可以直接使用的文件，并提醒需要补充的素材和数据来源；遇到不确定的需求先问清楚，不要自己猜，'
    + '每次交付都附上一段简短说明，写清改了什么、还差什么。';
const PERSONALITY = '说话简短直接，先给结论。\n\n遇到不确定的事情，先说清楚依据和还不知道的地方。';
const MIXED = { name: '阿石', job: JOB, personality: PERSONALITY, workStyle: 'free', aboutUser: ['叫我小王', '在准备考研', '周末不安排工作'] };
// Blank optional fields propose nothing (as on the server): this is a card that only asks the way of working.
const DEDICATED = { name: '', job: ' ', aboutUser: [''], workStyle: 'free' };

(async () => {
    const { base, close } = await serve();
    const evidence = process.env.PI_BOT_EVIDENCE;
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const [width, height] of [[1440, 860], [393, 852], [320, 568]]) {
            const phone = width < 700;
            let revision = 'r1', fails = 1;
            const setups = [];
            const world = newWorld({
                bots: () => [botRecord({ name: '新伙伴', avatar: { kind: 'preset', id: 'pivane-pebble' },
                    bot: { job: '', onboarding: { version: 1, flowVersion: 2, phase: 'interview', firstBot: true, steps: {}, startedAt: null, completedAt: null } } })],
                messages: () => [say('user', '我们认识一下吧', '2026-10-27T06:00:00Z'), say('assistant', '好呀，我先把听到的整理成一张卡片，你看看对不对。', '2026-10-27T06:00:05Z')]
            });
            Object.defineProperty(world, 'revision', { get: () => revision });
            const api = async ({ pathname, method, body }) => {
                if (pathname === '/api/pi/status') return { json: { ok: true, bots: true, agentProfiles: true, deliverables: true, sessionWorkflows: true,
                    composerTools: true, projectRoots: ['/fixture'], defaultProject: '/fixture/project' } };
                if (pathname === '/api/pi/composer/catalog') return { json: { cwd: '/fixture/PivaneBots/bot-11111111', builtins: [], templates: [], warnings: [] } };
                if (pathname === `/api/pi/bots/${BOT}/settings`) return { json: { revision, bot: { id: BOT, name: '新伙伴', avatar: { kind: 'preset', id: 'pivane-pebble' },
                    soul: PERSONALITY, bot: world.bots()[0].bot }, models: { defaults: null, models: [] } } };
                if (pathname !== `/api/pi/bots/${BOT}/setup` || method !== 'POST') return undefined;
                setups.push(body);
                assert.equal(body.expectedRevision, revision);
                if (fails > 0) { fails--; revision = `${revision}x`; return { status: 409, json: { error: 'Profiles changed' } }; }
                revision = `${revision}+`;
                return { json: { ok: true, revision, bot: { id: BOT, bot: world.bots()[0].bot }, user: { added: [], documentSaved: true } } };
            };
            const { context, page, errors } = await botPage(browser, base, world, { width, height, api });
            const label = `${width}x${height}`;
            const shot = async name => { if (evidence) { await page.waitForTimeout(200); await page.screenshot({ path: path.join(evidence, `${name}-${label}.png`) }); } };
            const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
            // A soft keyboard may change only visual bounds. Layout height stays fixed; opaque
            // overlays make hit tests distinguish visible controls from ones behind the keyboard.
            const visualBounds = (top, height, event = 'resize') => page.evaluate(({ top, height, event }) => {
                for (const id of ['bot-test-visual-top', 'bot-test-keyboard']) document.getElementById(id)?.remove();
                if (height == null) { delete visualViewport.height; delete visualViewport.offsetTop; }
                else {
                    Object.defineProperties(visualViewport, { height: { configurable: true, get: () => height }, offsetTop: { configurable: true, get: () => top } });
                    for (const [id, start, end] of [['bot-test-visual-top', 0, top], ['bot-test-keyboard', top + height, innerHeight]]) {
                        const cover = document.createElement('div'); cover.id = id;
                        Object.assign(cover.style, { position: 'fixed', left: '0', right: '0', top: `${start}px`, height: `${Math.max(0, end - start)}px`, zIndex: '999999', background: '#dedede' });
                        document.body.append(cover);
                    }
                }
                visualViewport.dispatchEvent(new Event(event));
            }, { top, height, event });
            const propose = (call, ui, args) => {
                world.socket.send(JSON.stringify({ type: 'tool_execution_start', toolCallId: call, toolName: 'bot_setup_propose', args }));
                world.socket.send(JSON.stringify({ type: 'extension_ui_request', id: ui, ...SELECT }));
            };
            const settle = (call, ui) => {
                world.socket.send(JSON.stringify({ type: 'gateway_ui_resolved', id: ui }));
                world.socket.send(JSON.stringify({ type: 'tool_execution_end', toolCallId: call, toolName: 'bot_setup_propose', isError: false,
                    result: { content: [{ type: 'text', text: 'ok' }] } }));
            };
            // Where a docked panel's title, actions and body are, and whether each is really on top there.
            const facts = selector => page.evaluate(selector => {
                const rect = node => { const box = node.getBoundingClientRect(); return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height }; };
                const panel = document.querySelector(selector), title = panel.querySelector('.pi-bot-setup-head strong');
                const body = panel.querySelector('.pi-bot-setup-fields, .pi-bot-approval-detail');
                const hit = (x, y) => panel.contains(document.elementFromPoint(x, y));
                const t = rect(title), middle = (t.top + t.bottom) / 2;
                const buttons = [...panel.querySelectorAll('.pi-bot-setup-foot button')].filter(node => node.offsetParent).map(node => {
                    const box = rect(node); return { text: node.textContent, ...box, hit: hit((box.left + box.right) / 2, (box.top + box.bottom) / 2) };
                });
                const viewport = document.querySelector('.pi-transcript-viewport').getBoundingClientRect();
                return { panel: rect(panel), title: t, titleHit: [t.left + 3, (t.left + t.right) / 2, t.right - 3].every(x => hit(x, middle)),
                    identity: rect(document.querySelector('#pi-bot-header .pi-bot-identity')), composer: rect(document.querySelector('.pi-composer')),
                    transcript: viewport.height, buttons, scrollable: body.scrollHeight > body.clientHeight + 1, room: panel.style.getPropertyValue('--pi-bot-card-room'),
                    height: innerHeight };
            }, selector);
            // The title is readable and not under the identity, the actions are in view and usable, and
            // when the page has room for both the identity sits fully above the panel.
            const usable = async (selector, what) => {
                await frames();
                const g = await facts(selector);
                const where = `${what} at ${label} (room ${g.room}, transcript ${Math.round(g.transcript)}px)`;
                assert.ok(g.titleHit, `${where}: the title is not covered by the floating identity`);
                assert.ok(g.title.top >= g.panel.top && g.title.bottom <= g.panel.bottom && g.panel.top >= 0, `${where}: the title is inside the panel and on screen`);
                assert.ok(g.panel.bottom <= g.composer.top + 1, `${where}: the panel sits above the composer`);
                assert.ok(g.buttons.length >= 1, `${where}: actions shown`);
                for (const button of g.buttons) {
                    assert.ok(button.hit && button.bottom <= g.panel.bottom + 0.5 && button.bottom <= g.height && button.right <= width + 0.5, `${where}: "${button.text}" is in view and on top`);
                    // (a panel still rising in can measure a hair under its 44px)
                    if (phone) assert.ok(button.height >= 43.5, `${where}: "${button.text}" is touch sized (${JSON.stringify(button)})`);
                }
                if (g.height >= 560) assert.ok(g.identity.bottom <= g.panel.top + 1, `${where}: the identity stays clear of the panel`);
                assert.equal((await layout(page)).overflow, false, `${where}: no horizontal overflow`);
                return g;
            };
            try {
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected');

                // 1. Bottom of the page: in Bot mode the empty row under the composer takes no room;
                // the composer keeps its send and attach buttons, and an attachment problem still shows.
                const bottom = await page.evaluate(() => {
                    const wrap = document.querySelector('.pi-composer-wrap').getBoundingClientRect(), composer = document.querySelector('.pi-composer').getBoundingClientRect();
                    const visible = id => { const node = document.getElementById(id); return Boolean(node && node.offsetParent && node.getBoundingClientRect().height); };
                    return { gap: wrap.bottom - composer.bottom, meta: getComputedStyle(document.querySelector('.pi-composer-meta')).display,
                        send: visible('pi-send-button'), attach: visible('pi-composer-add-button') };
                });
                assert.deepEqual([bottom.meta, bottom.send, bottom.attach], ['none', true, true], JSON.stringify(bottom));
                assert.ok(bottom.gap <= 16, `only the composer's own spacing below it (${bottom.gap}px)`);
                await page.evaluate(() => { const status = document.getElementById('pi-attachment-status'); status.textContent = '附件太大了'; status.hidden = false; });
                assert.equal(await page.locator('#pi-attachment-status').isVisible(), true, 'attachment problems still show in Bot mode');
                await page.evaluate(() => { const status = document.getElementById('pi-attachment-status'); status.textContent = ''; status.hidden = true; });
                await shot('bot-composer-bottom');

                // 2. A card with an unchanged way of working among other fields: the title and actions stay
                // clear of the floating identity; only the body scrolls; no way-of-working choice is shown.
                propose('call-1', 'ui-1', MIXED);
                const card = page.locator('.pi-bot-setup:not(.pi-bot-approval):not(.pi-bot-closure):not([hidden])');
                await card.waitFor();
                assert.equal(await card.locator('[data-setup-work]').count(), 0, 'an unchanged way of working carried along is not shown');
                assert.deepEqual(await card.locator('[data-setup-field]').evaluateAll(nodes => nodes.map(node => [node.dataset.setupField, node.tagName])),
                    [['name', 'INPUT'], ['job', 'TEXTAREA'], ['personality', 'TEXTAREA']]);
                const first = await usable('.pi-bot-setup:not(.pi-bot-approval):not(.pi-bot-closure)', 'setup card');
                assert.deepEqual(await page.locator('.pi-composer-wrap').evaluate(node => [node.classList.contains('is-bot-dock-lifted'), node.style.getPropertyValue('--pi-bot-dock-lift'), getComputedStyle(node).transform]),
                    [false, '', 'none'], 'a visible card never lifts the composer when no keyboard occludes it');
                if (height < 700) assert.ok(first.scrollable, 'on a short phone the body scrolls inside the card');
                // Long "mainly helps with" text wraps over several lines, grows to its bound and then scrolls.
                const job = await card.locator('[data-setup-field="job"]').evaluate(node => {
                    const style = getComputedStyle(node), line = parseFloat(style.lineHeight);
                    return { lines: (node.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) / line,
                        wraps: node.scrollWidth <= node.clientWidth + 1, scrolls: node.scrollHeight > node.clientHeight + 1, font: style.fontSize, value: node.value };
                });
                assert.equal(job.value, JOB);
                assert.ok(job.wraps && job.lines >= 2.9 && job.lines <= 6.1, `the job wraps and grows to at most six lines (${job.lines.toFixed(1)})`);
                if (phone) assert.equal(job.font, '16px', 'no zoom on phone focus');
                assert.equal(job.scrolls, job.lines > 5.9, 'it scrolls only once at its bound');
                // The last part of the body can be reached.
                const reach = await card.locator('.pi-bot-setup-fields').evaluate(body => {
                    body.scrollTop = body.scrollHeight;
                    const last = [...body.querySelectorAll('.pi-bot-setup-fact')].at(-1).getBoundingClientRect(), box = body.getBoundingClientRect();
                    return last.top >= box.top - 1 && last.bottom <= box.bottom + 1;
                });
                assert.ok(reach, 'the last item of the body scrolls into view');
                await shot('bot-setup-card');

                // 3. A failed save redraws the card: every edit, the body's scroll position and the focus stay.
                await card.locator('[data-setup-field="name"]').fill('小石头');
                await card.locator('[data-setup-field="job"]').fill('整理文稿\n\n和海报 \t 以及配图');
                await card.locator('[data-setup-fact]').nth(1).uncheck();
                const scroll = await card.locator('.pi-bot-setup-fields').evaluate(body => { body.scrollTop = Math.min(40, body.scrollHeight - body.clientHeight); return body.scrollTop; });
                await card.locator('.pi-bot-setup-save').focus();
                await card.locator('.pi-bot-setup-save').click();
                await card.locator('.pi-bot-setup-note.is-error').filter({ hasText: '你的修改还在' }).waitFor();
                await page.waitForFunction(() => document.activeElement?.matches('.pi-bot-setup-save'));
                assert.equal(await card.locator('.pi-bot-setup-fields').evaluate(body => body.scrollTop), scroll, 'the body keeps its scroll position');
                assert.deepEqual(await card.locator('[data-setup-field]').evaluateAll(nodes => nodes.map(node => node.value)), ['小石头', '整理文稿\n\n和海报 \t 以及配图', PERSONALITY]);
                assert.deepEqual(await card.locator('[data-setup-fact]').evaluateAll(nodes => nodes.map(node => node.checked)), [true, false, true]);
                await usable('.pi-bot-setup:not(.pi-bot-approval):not(.pi-bot-closure)', 'setup card after an error');
                await shot('bot-setup-error');
                // A focused text field keeps focus and its caret across a redraw too.
                await card.locator('[data-setup-field="personality"]').focus();
                await card.locator('[data-setup-field="personality"]').evaluate(node => node.setSelectionRange(3, 5));
                fails = 1;
                // Saving disables the field while the request runs; focus and caret come back after the refusal.
                await page.evaluate(() => document.querySelector('.pi-bot-setup-save').dispatchEvent(new MouseEvent('click', { bubbles: true })));
                await page.waitForFunction(() => document.querySelectorAll('.pi-bot-setup-note.is-error').length && !document.querySelector('.pi-bot-setup-save').disabled);
                assert.deepEqual(await page.evaluate(() => [document.activeElement?.dataset.setupField, document.activeElement?.selectionStart, document.activeElement?.selectionEnd]),
                    ['personality', 3, 5]);

                // Keyboard-like shrink and large text: the card follows the page that is left.
                if (width === 393) {
                    await page.setViewportSize({ width, height: 470 });
                    await usable('.pi-bot-setup:not(.pi-bot-approval):not(.pi-bot-closure)', 'setup card with a keyboard-like shrink');
                    await shot('bot-setup-keyboard');
                    await page.setViewportSize({ width, height });
                    await card.locator('[data-setup-field="personality"]').focus();
                    await card.locator('[data-setup-field="personality"]').evaluate(node => node.setSelectionRange(3, 5));
                    for (const [top, event] of [[0, 'resize'], [80, 'scroll']]) {
                        await visualBounds(top, 470, event);
                        await frames();
                        const visible = await facts('.pi-bot-setup:not(.pi-bot-approval):not(.pi-bot-closure)');
                        assert.equal(visible.height, height, 'visual-only resizing leaves layout height unchanged');
                        assert.ok(visible.titleHit && visible.title.top >= top && visible.title.bottom <= top + 470, 'title stays inside the visible area');
                        assert.ok(visible.buttons.every(button => button.hit && button.top >= top && button.bottom <= top + 470), 'all actions stay above the keyboard and inside the visible area');
                        assert.deepEqual(await page.evaluate(() => [document.activeElement?.dataset.setupField, document.activeElement?.selectionStart, document.activeElement?.selectionEnd]), ['personality', 3, 5]);
                        assert.equal(await card.locator('[data-setup-field="job"]').inputValue(), '整理文稿\n\n和海报 \t 以及配图');
                    }
                    await shot('bot-setup-visual-keyboard');
                    // The separately fixed shared menu also fits the Bot's lifted composer.
                    await page.locator('#pi-composer-add-button').click();
                    const menu = page.locator('#pi-composer-add-menu');
                    await menu.waitFor({ state: 'visible' });
                    await page.keyboard.press('End');
                    assert.ok(await menu.evaluate(node => {
                        const box = node.getBoundingClientRect(), last = [...node.querySelectorAll('button')].filter(button => button.offsetParent).at(-1);
                        const item = last.getBoundingClientRect();
                        return box.top >= visualViewport.offsetTop && box.bottom <= visualViewport.offsetTop + visualViewport.height
                            && item.top >= box.top && item.bottom <= box.bottom
                            && last.contains(document.elementFromPoint((item.left + item.right) / 2, (item.top + item.bottom) / 2));
                    }), 'the lifted Bot composer keeps the shared menu and its last action visible');
                    await page.keyboard.press('Escape');
                    assert.equal(await menu.isVisible(), false);
                    assert.equal(await page.locator('#pi-composer-add-button').evaluate(node => node === document.activeElement), true);
                    await visualBounds(0, null);
                    await frames();
                    assert.equal(await page.locator('.pi-composer-wrap').evaluate(node => node.style.getPropertyValue('--pi-bot-dock-lift')), '', 'keyboard dismissal clears the lift');
                    await page.evaluate(() => { document.documentElement.style.fontSize = '125%'; });
                    await usable('.pi-bot-setup:not(.pi-bot-approval):not(.pi-bot-closure)', 'setup card with large text');
                    await shot('bot-setup-large-text');
                    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
                    await page.locator('html').evaluate(node => { node.dataset.theme = 'dark'; });
                    await usable('.pi-bot-setup:not(.pi-bot-approval):not(.pi-bot-closure)', 'setup card in dark theme');
                    await shot('bot-setup-dark');
                    await page.locator('html').evaluate(node => { node.dataset.theme = 'daylight'; });
                }

                // 4. Saving sends the visible fields only; the job is one line; workStyleShown is false.
                await card.locator('.pi-bot-setup-save').click();
                await page.waitForFunction(() => document.querySelector('.pi-bot-setup:not(.pi-bot-approval):not(.pi-bot-closure)').hidden);
                const saved = setups.at(-1);
                assert.deepEqual(saved.changes, { name: '小石头', job: '整理文稿 和海报 以及配图', personality: PERSONALITY, aboutUser: ['叫我小王', '周末不安排工作'] });
                assert.equal(saved.workStyleShown, false, 'the way of working was not on the card');
                assert.ok(setups.every(body => body.workStyleShown === false));
                assert.deepEqual(world.responses.map(item => [item.id, item.value]), [['ui-1', '保存 / Save']]);
                settle('call-1', 'ui-1');

                // 5. A card that only asks the way of working (blank fields propose nothing) shows the three
                // choices; leaving it for later says it was shown.
                propose('call-2', 'ui-2', DEDICATED);
                await card.waitFor();
                assert.deepEqual(await card.locator('[data-setup-work]').evaluateAll(nodes => nodes.map(node => [node.value, node.checked])),
                    [['free', true], ['balanced', false], ['ask', false]]);
                assert.equal(await card.locator('[data-setup-field]').count(), 0);
                await usable('.pi-bot-setup:not(.pi-bot-approval):not(.pi-bot-closure)', 'way-of-working card');
                await shot('bot-setup-work');
                await card.locator('.pi-bot-setup-later').click();
                await page.waitForFunction(() => document.querySelector('.pi-bot-setup:not(.pi-bot-approval):not(.pi-bot-closure)').hidden);
                assert.deepEqual([setups.at(-1).later, setups.at(-1).workStyleShown, 'changes' in setups.at(-1)], [true, true, false]);
                assert.deepEqual(world.responses.at(-1), { type: 'extension_ui_response', id: 'ui-2', value: '先不改 / Not now' });
                settle('call-2', 'ui-2');

                // 6. An approval with a long detail on this page: the request, the detail (scrolling) and
                // the answers all stay usable.
                const detail = Array.from({ length: 40 }, (_, index) => `第 ${index + 1} 行：rsync -av ./drafts/ /home/me/backup/drafts-${index}/`).join('\n');
                world.socket.send(JSON.stringify({ type: 'extension_ui_request', id: 'ask-1', method: 'confirm', title: APPROVAL, message: `command #${'1'.repeat(16)}\n\n${detail}` }));
                const approval = page.locator('.pi-bot-approval:not([hidden])');
                await approval.waitFor();
                const g = await usable('.pi-bot-approval', 'approval card');
                assert.ok(g.scrollable, 'the long detail scrolls inside the card');
                await approval.locator('.pi-bot-approval-detail').evaluate(node => { node.scrollTop = 120; });
                await approval.locator('.pi-bot-approval-allow').focus();
                // A second request arriving redraws the card; its reading position and focus stay.
                world.socket.send(JSON.stringify({ type: 'extension_ui_request', id: 'ask-2', method: 'confirm', title: APPROVAL, message: `outside #${'2'.repeat(16)}\n\n/home/me/notes.md` }));
                await approval.locator('.pi-bot-setup-note').filter({ hasText: '后面还有 1 步' }).waitFor();
                assert.deepEqual(await page.evaluate(() => [document.querySelector('.pi-bot-approval-detail').scrollTop, document.activeElement?.matches('.pi-bot-approval-allow')]), [120, true]);
                await shot('bot-approval-long');
                await approval.locator('.pi-bot-setup-later').click();
                assert.deepEqual(world.responses.at(-1), { type: 'extension_ui_response', id: 'ask-1', confirmed: false });
                for (const id of ['ask-1', 'ask-2']) world.socket.send(JSON.stringify({ type: 'gateway_ui_resolved', id }));
                await page.waitForFunction(() => document.querySelector('.pi-bot-approval').hidden);

                // 7. Bot settings: the job and personality boxes grow with their text up to a bound, then scroll.
                await page.locator('#pi-bot-header .pi-bot-identity > .pi-bot-face').click();
                const sheet = page.locator('.pi-bot-sheet[open]');
                await settingsPage(sheet, 'profile');
                const jobBox = sheet.locator('textarea.is-job'), soulBox = sheet.locator('textarea.is-soul');
                await jobBox.waitFor();
                const lines = box => box.evaluate(node => {
                    const style = getComputedStyle(node);
                    return { lines: (node.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) / parseFloat(style.lineHeight),
                        scrolls: node.scrollHeight > node.clientHeight + 1, wraps: node.scrollWidth <= node.clientWidth + 1 };
                });
                assert.ok((await lines(soulBox)).lines >= 3, 'the saved personality shows its paragraphs');
                await jobBox.fill(JOB);
                const grown = await lines(jobBox);
                assert.ok(grown.wraps && grown.lines >= (phone ? 3 : 1.9) && grown.lines <= 8.1, `the job box grows (${grown.lines.toFixed(1)} lines)`);
                await jobBox.fill(Array(12).fill('确认受众和用途，整理素材并说明修改。').join('\n'));
                const bounded = await lines(jobBox);
                assert.ok(bounded.lines <= 8.1 && (bounded.lines < 7.9 || bounded.scrolls), `the job box stops at its bound and scrolls (${bounded.lines.toFixed(1)} lines)`);
                await shot('bot-settings-long');
                await sheet.locator('.pi-bot-sheet-close').click();
                await sheet.locator('.pi-bot-sheet-close').click();
                await page.locator('.pi-bot-sheet').waitFor({ state: 'detached' });

                // 8. Pi Agent keeps the row and receives no Bot keyboard-positioning state.
                if (width === 393) {
                    propose('call-route', 'ui-route', { job: 'Check route reset' });
                    await card.waitFor();
                    await visualBounds(0, 470);
                    await frames();
                    assert.ok(await page.locator('.pi-composer-wrap').evaluate(node => node.classList.contains('is-bot-dock-lifted')));
                }
                await page.evaluate(() => window.PiWorkspaceRoute.navigate('chat'));
                await page.waitForFunction(() => !document.querySelector('#chat-tab').classList.contains('pi-bot-mode'));
                await frames();
                assert.deepEqual(await page.locator('.pi-composer-wrap').evaluate(node => [node.classList.contains('is-bot-dock-lifted'), node.style.getPropertyValue('--pi-bot-dock-lift'), getComputedStyle(node).transform]), [false, '', 'none']);
                await visualBounds(0, null);
                assert.notEqual(await page.locator('.pi-composer-meta').evaluate(node => getComputedStyle(node).display), 'none', 'Pi Agent keeps its status row');

                assert.deepEqual(errors, [], `page errors at ${label}`);
                console.log(JSON.stringify({ width, height, status: 'passed', setups: setups.length }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
