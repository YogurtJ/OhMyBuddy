// Plus-menu placement beside tall drafts: every action stays inside the visible area
// (phone header and safe area, short screens, landscape, a shrinking visual viewport)
// and reachable by scrolling only the menu itself.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const express = require('express');
const evidence = process.env.PIVANE_TEST_SCREENSHOT_DIR || path.join(os.tmpdir(), 'pivane-browser', 'pi-composer-add-menu');
const cwd = '/srv/composer-menu-fixture';
const sessions = [{ id: 'a', cwd, name: 'Composer menu', messageCount: 2 }];
const model = { provider: 'fixture', id: 'fixture', name: 'Fixture model', input: ['text', 'image'], contextWindow: 32000 };
const messages = [{ role: 'user', content: 'fixture question', timestamp: 1 }, { role: 'assistant', content: [{ type: 'text', text: 'Fixture reply' }], timestamp: 2 }];
const longDraft = '这是一段很长的中文草稿，用来让输入框长到最大高度：附件菜单仍要完整显示在顶部栏下方，不能被安全区或项目栏遮住；'.repeat(8);
const ACTIONS = ['pi-attach-button', 'pi-document-storage-open', 'pi-delivery-toggle', 'pi-schedule-button', 'pi-cron-add-button', 'pi-extension-assistant-add'];
let base, debugPage;

// Geometry measured independently of the implementation: hit tests honour ancestor
// clipping, the visual viewport covers keyboard and zoom.
const ancestorsScroll = page => page.evaluate(() => window.scrolledAncestors(document.getElementById('pi-composer-add-menu').parentElement));
const measure = page => page.evaluate(() => {
    const menu = document.getElementById('pi-composer-add-menu'), plus = document.getElementById('pi-composer-add-button');
    const composer = menu.closest('.pi-composer'), view = visualViewport;
    const rect = node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width }; };
    const inside = (node, x, y) => { const hit = document.elementFromPoint(x, y); return Boolean(hit && node.contains(hit)); };
    const box = rect(menu), mid = (box.left + box.right) / 2;
    const visibleTop = view.offsetTop, visibleBottom = view.offsetTop + view.height;
    const items = [...menu.querySelectorAll('button')].filter(b => !b.closest('[hidden]'));
    const fully = button => { const r = rect(button); return r.top >= box.top - .5 && r.bottom <= box.bottom + .5 && r.top >= visibleTop - .5 && r.bottom <= visibleBottom + .5
        && inside(button, mid, r.top + 3) && inside(button, mid, r.bottom - 3); };
    const plusBox = rect(plus);
    return {
        open: !menu.hidden, menu: box, composer: rect(composer), plus: plusBox, view: { top: visibleTop, bottom: visibleBottom },
        topEdgeVisible: box.top >= visibleTop - .5 && inside(menu, mid, box.top + 2), bottomEdgeVisible: box.bottom <= visibleBottom + .5 && inside(menu, mid, box.bottom - 2),
        plusUncovered: inside(plus, (plusBox.left + plusBox.right) / 2, (plusBox.top + plusBox.bottom) / 2),
        ids: items.map(b => b.id), first: items.length && fully(items[0]), last: items.length && fully(items.at(-1)), scrollTop: menu.scrollTop,
        scrollable: menu.scrollHeight > menu.clientHeight + 1, scrolled: scrolledAncestors(menu.parentElement), focus: document.activeElement?.id,
        overflow: ['body', '.pi-composer', '.pi-composer-wrap'].filter(s => { const n = document.querySelector(s); return n.scrollWidth > n.clientWidth + 1; })
    };
});

async function run(browser, { name, viewport, safeTop = 0, cover = false, extended = false, landscape = false }) {
    const mobile = viewport.width < 900;
    const context = await browser.newContext({ locale: 'zh-CN', viewport, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage(), errors = [], writes = [];
    debugPage = page;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ cwd, safeTop }) => {
        localStorage.setItem('pi.web.cwd', cwd); localStorage.setItem(`pi.web.session:${cwd}`, 'a');
        window.scrolledAncestors = node => { const out = []; for (; node; node = node.parentElement) if (node.scrollTop || node.scrollLeft) out.push(`${node.id || node.className || node.tagName}:${node.scrollTop}`); return out; };
        // Chromium reports no safe area; reproduce the iPhone standalone inset that
        // pi-workbench.css applies through env(safe-area-inset-top).
        if (safeTop) document.addEventListener('DOMContentLoaded', () => {
            const style = document.createElement('style');
            style.textContent = `@media (max-width: 900px) { body { padding-top: ${safeTop}px !important; } .app-container { height: calc(100dvh - ${safeTop}px) !important; } }`;
            document.head.append(style);
        });
    }, { cwd, safeTop });
    await page.route('**/api/**', route => {
        const req = route.request(), endpoint = new URL(req.url()).pathname;
        if (req.method() !== 'GET') { writes.push(endpoint); return route.fulfill({ status: 500, json: { error: 'unexpected write' } }); }
        if (endpoint === '/api/pi/status') return route.fulfill({ json: { ok: true, composerTools: true, sessionWorkflows: true, runtimeControls: true, scheduledTasks: true, documentStorage: true, extensionAssistant: true, projectRoots: ['/srv'] } });
        if (endpoint === '/api/pi/cron') return route.fulfill({ json: { jobs: [], homes: [], limits: { maxRunsPerDay: 40 }, today: { runs: 0 } } });
        if (endpoint === '/api/pi/profiles') return route.fulfill({ json: { profiles: [] } });
        if (endpoint === '/api/pi/projects') return route.fulfill({ json: { projects: [{ cwd, name: 'Menu fixture', sessionCount: 1 }], roots: ['/srv'] } });
        if (endpoint === '/api/pi/sessions') return route.fulfill({ json: { sessions } });
        if (endpoint === '/api/pi/activity') return route.fulfill({ json: { runtimes: [], pinnedProjects: [], hiddenProjects: [], replyNotices: [] } });
        if (endpoint.endsWith('/deferred')) return route.fulfill({ json: { jobs: [] } });
        if (endpoint.endsWith('/workflow')) return route.fulfill({ json: { prompts: [], replies: [], versions: [], leafId: 'fixture' } });
        if (endpoint === '/api/pi/composer/catalog') return route.fulfill({ json: { cwd, builtins: [], templates: [], warnings: [] } });
        return route.fulfill({ json: endpoint.includes('history') ? [] : {} });
    });
    await page.routeWebSocket('**/api/pi/ws', ws => {
        const runtime = { model, thinkingLevel: 'off', isStreaming: false, isCompacting: false };
        const controls = { runtimeId: 'a', revision: 1, stopping: false, queue: { steering: [], followUp: [] }, recoveries: [], extension: { title: '', statuses: [], widgets: [] } };
        const reply = (cmd, data = {}) => ws.send(JSON.stringify({ type: 'response', id: cmd.id, command: cmd.type, success: true, data }));
        ws.onMessage(raw => {
            const cmd = JSON.parse(raw);
            if (cmd.type === 'open_session') return reply(cmd, { session: sessions[0], state: runtime, controls, commands: { commands: [] }, messages: { messages }, stats: {}, models: { models: [model] }, thinkingLevels: { levels: ['off'] } });
            if (cmd.type === 'get_state') return reply(cmd, { ...runtime, webControls: controls });
            if (cmd.type === 'get_messages') return reply(cmd, { messages });
            if (['get_session_stats', 'get_available_thinking_levels'].includes(cmd.type)) return reply(cmd, cmd.type === 'get_session_stats' ? {} : { levels: ['off'] });
            writes.push(`rpc:${cmd.type}`); return reply(cmd, {});
        });
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.querySelector('#pi-input').disabled
        && !document.getElementById('pi-extension-assistant-add')?.hidden && !document.getElementById('pi-document-storage-open')?.hidden);
    const input = page.locator('#pi-input'), plus = page.locator('#pi-composer-add-button'), addMenu = page.locator('#pi-composer-add-menu');
    const press = locator => mobile ? locator.tap() : locator.click();
    // Opening must not scroll overflow-hidden ancestors. Compare with the state right before
    // opening: Playwright brings the target into view first, and in landscape a maximal
    // draft already overflows the conversation column before any menu exists.
    let baseline = [];
    const open = async (how = () => press(plus)) => {
        await plus.scrollIntoViewIfNeeded(); baseline = await ancestorsScroll(page);
        if (baseline.length) console.log(`note ${name}: ancestors already scrolled before opening: ${baseline.join(', ')}`);
        await how();
    };
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const check = async (label, expectCover = cover) => {
        await settle();
        const g = await measure(page), detail = `${name} ${label}: ${JSON.stringify(g)}`;
        assert.equal(g.open, true, detail);
        assert.deepEqual(g.ids, ACTIONS, detail);
        assert.ok(g.topEdgeVisible && g.bottomEdgeVisible, `menu stays inside the visible area: ${detail}`);
        assert.ok(g.menu.left >= -1 && g.menu.right <= viewport.width + 1 && Math.abs(g.menu.width - g.composer.width) <= 2, `menu follows the composer width: ${detail}`);
        assert.ok(g.plusUncovered, `the plus button stays reachable: ${detail}`);
        if (expectCover) assert.ok(g.menu.bottom > g.composer.top && g.menu.bottom <= g.plus.top, `a cramped menu extends over the draft only: ${detail}`);
        else assert.ok(g.menu.bottom <= g.composer.top, `menu sits above the composer: ${detail}`);
        assert.deepEqual(g.scrolled, baseline, `opening never scrolls clipped ancestors: ${detail}`);
        assert.deepEqual(g.overflow, [], detail);
        return g;
    };
    // Scroll the menu like a finger would (raw touch swipes on phones); scrolling must not
    // chain to the page. Headless Chromium ignores synthesized touch scroll gestures.
    const scrollMenu = async distance => {
        const box = await addMenu.boundingBox(), x = box.x + box.width / 2;
        if (mobile) {
            const cdp = await context.newCDPSession(page), [from, to] = distance > 0 ? [.8, .2] : [.2, .8];
            for (let swipe = 0; swipe < 4; swipe++) {
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: box.y + box.height * from }] });
                for (let step = 1; step <= 10; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: box.y + box.height * (from + (to - from) * step / 10) }] });
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            }
            await cdp.detach();
        } else { await page.mouse.move(x, box.y + box.height / 2); await page.mouse.wheel(0, distance); }
        await page.waitForTimeout(200);
    };
    const shrinkVisualViewport = async scale => {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: scale }); await cdp.detach();
        await page.waitForTimeout(150);
        if (scale > 1) { await page.mouse.wheel(0, 2000); await page.waitForTimeout(250); }
        return page.evaluate(() => ({ top: visualViewport.offsetTop, height: visualViewport.height, scale: visualViewport.scale }));
    };

    await input.fill(longDraft);
    assert.ok(await input.evaluate(n => n.getBoundingClientRect().height >= 170), 'the draft grows the input to its maximum');
    await open();
    assert.equal(await plus.getAttribute('aria-expanded'), 'true');
    const opened = await check('open');
    assert.equal(opened.first, true, `"添加附件" is visible without scrolling: ${JSON.stringify(opened)}`);
    assert.equal(opened.focus, 'pi-attach-button');
    await page.screenshot({ path: path.join(evidence, `${name}-open.png`) });
    if (opened.scrollable) {
        await scrollMenu(1200);
        const end = await check('scrolled to end');
        assert.ok(end.scrollTop > 0 && end.last, `the last action is reachable by scrolling the menu: ${JSON.stringify(end)}`);
        await page.screenshot({ path: path.join(evidence, `${name}-scrolled.png`) });
        await scrollMenu(-1200);
        assert.equal((await check('scrolled back')).first, true);
    } else assert.equal(opened.last, true, `all actions fit: ${JSON.stringify(opened)}`);

    await page.keyboard.press('Escape');
    assert.equal(await addMenu.isVisible(), false);
    assert.equal(await plus.evaluate(n => n === document.activeElement), true, 'Escape returns focus to the plus button');
    assert.equal(await input.inputValue(), longDraft);
    await open(() => plus.press('ArrowUp'));
    const last = await check('keyboard to last');
    assert.equal(last.focus, 'pi-extension-assistant-add'); assert.equal(last.last, true, `keyboard focus scrolls the last action into view: ${JSON.stringify(last)}`);
    await page.keyboard.press('Home');
    assert.equal((await check('keyboard home')).first, true);
    await page.keyboard.press('Escape');

    await open(); await check('reopen');
    const chooser = page.waitForEvent('filechooser');
    await press(page.locator('#pi-attach-button'));
    await (await chooser).setFiles({ name: 'menu-fixture.txt', mimeType: 'text/plain', buffer: Buffer.from('Composer menu fixture') });
    await page.locator('.pi-attachment-chip').waitFor();
    assert.equal(await addMenu.isVisible(), false, 'choosing an action closes the menu');
    assert.equal(await input.inputValue(), longDraft, 'uploading keeps the draft');
    // The chip row moves the composer; the menu still fits above it. (At a 393px landscape
    // height a maximal draft plus a chip row already pushes the composer below the screen.)
    if (!landscape) {
        await open(); await check('with attachment');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.pi-attachment-chip').count(), 1, 'closing the menu keeps the attachment');
    }

    if (extended) {
        await open(); const before = await check('before viewport changes');
        // A soft keyboard or zoom shrinks only the visual viewport; the open menu follows it.
        const shrunk = await shrinkVisualViewport(2);
        assert.ok(shrunk.top > 0 && shrunk.height < viewport.height * .6, JSON.stringify(shrunk));
        const small = await check('visual viewport shrunk', true);
        assert.ok(small.menu.top >= shrunk.top && small.first, JSON.stringify(small));
        await page.screenshot({ path: path.join(evidence, `${name}-visual-viewport.png`) });
        await shrinkVisualViewport(1);
        const restored = await check('visual viewport restored');
        assert.ok(Math.abs(restored.menu.top - before.menu.top) <= 1, `the menu regains its room: ${JSON.stringify({ before: before.menu, restored: restored.menu })}`);
        // Resizing the window re-fits the menu instead of dropping it.
        await page.setViewportSize({ width: viewport.width, height: 640 }); await check('window shorter', true);
        await page.setViewportSize(viewport); await check('window restored');
        await page.keyboard.press('Escape');
        // The composer can grow while the menu is open without typing (typing closes it),
        // for example when the host resizes a restored draft. The menu must not rise past the header.
        await input.fill('短草稿'); await open();
        const short = await check('short draft');
        assert.ok(short.last && short.menu.bottom > before.menu.bottom + 60, `a short draft leaves room for every action: ${JSON.stringify(short)}`);
        await input.evaluate(n => { n.style.height = '180px'; });
        const grown = await check('composer grown while open');
        assert.ok(grown.composer.top < short.composer.top - 100 && grown.first, `the open menu re-fits above the taller composer: ${JSON.stringify(grown)}`);
        await page.screenshot({ path: path.join(evidence, `${name}-grown-while-open.png`) });
        await input.evaluate(n => { n.style.height = ''; n.dispatchEvent(new Event('input', { bubbles: true })); });
        assert.equal(await addMenu.isVisible(), false, 'typing still closes the menu');
        assert.equal(await input.inputValue(), '短草稿');
    }
    assert.deepEqual(writes, [], 'opening and closing the menu writes nothing');
    assert.deepEqual(errors, []);
    console.log(`PASS ${name} ${viewport.width}x${viewport.height}: ${cover ? 'cover' : 'above'} placement, menu-only scrolling, keyboard focus, file chooser, draft and attachment kept${extended ? ', visual viewport/window/composer changes while open' : ''}`);
    await context.close();
}

(async () => {
    fs.mkdirSync(evidence, { recursive: true });
    const app = express(), root = path.resolve(__dirname, '../..');
    app.use('/vendor/marked', express.static(path.join(root, 'node_modules/marked/lib')));
    app.use('/vendor/dompurify', express.static(path.join(root, 'node_modules/dompurify/dist')));
    app.use('/vendor/highlight', express.static(path.join(root, 'node_modules/@highlightjs/cdn-assets')));
    app.use(express.static(path.join(root, 'public')));
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    try {
        for (const scenario of [
            { name: 'phone-safe-area', viewport: { width: 393, height: 852 }, safeTop: 59, extended: true },
            { name: 'phone-320', viewport: { width: 320, height: 740 } },
            { name: 'phone-short', viewport: { width: 320, height: 568 }, cover: true },
            { name: 'phone-landscape', viewport: { width: 852, height: 393 }, cover: true, landscape: true },
            { name: 'desktop', viewport: { width: 1440, height: 1000 } }
        ]) await run(browser, scenario);
    } catch (error) {
        await debugPage?.screenshot({ path: path.join(evidence, 'failure.png'), timeout: 5000 }).catch(() => {});
        throw error;
    } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
