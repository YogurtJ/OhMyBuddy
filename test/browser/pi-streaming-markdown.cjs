const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PI_RENDER_TEST_URL || 'http://127.0.0.1:3102';
const cwd = '/srv/render-fixture', session = { id: 'render', cwd, name: 'Render fixture' };
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    try {
        for (const width of [1440, 393, 320]) {
            const context = await browser.newContext({ locale: 'zh-CN', viewport: { width, height: 950 }, isMobile: width < 900, hasTouch: width < 900 });
            const page = await context.newPage(), errors = [];
            let socket, messages = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.addInitScript(({ cwd, id }) => {
                localStorage.setItem('pi.web.cwd', cwd); localStorage.setItem(`pi.web.session:${cwd}`, id);
                window.__copies = [];
                Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => window.__copies.push(text) } });
            }, { cwd, id: session.id });
            await page.route('**/api/**', route => {
                const endpoint = new URL(route.request().url()).pathname;
                let json = {};
                if (endpoint.endsWith('/status')) json = { ok: true, projectRoots: ['/srv'] };
                if (endpoint.endsWith('/projects')) json = { projects: [{ cwd, name: 'Fixture', sessionCount: 1 }], roots: ['/srv'] };
                if (endpoint.endsWith('/sessions')) json = { sessions: [session] };
                if (endpoint.endsWith('/activity')) json = { runtimes: [], pinnedProjects: [], replyNotices: [] };
                if (endpoint.includes('history') || endpoint.endsWith('/prompts')) json = [];
                return route.fulfill({ json });
            });
            await page.routeWebSocket('**/api/pi/ws', ws => {
                socket = ws;
                ws.onMessage(raw => {
                    const c = JSON.parse(raw), model = { id: 'fixture', provider: 'fixture', input: ['text'] }, state = { model, isStreaming: false };
                    const data = c.type === 'open_session' ? { session, state, messages: { messages }, models: { models: [model] }, stats: {}, thinkingLevels: { levels: ['off'] }, commands: { commands: [] } } : c.type === 'get_messages' ? { messages } : c.type === 'get_state' ? state : {};
                    ws.send(JSON.stringify({ type: 'response', id: c.id, command: c.type, success: true, data }));
                });
            });
            await page.goto(base, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => !document.querySelector('#pi-input').disabled);
            const parity = await page.evaluate(() => {
                const sequences = [
                    ['[late][ref]\n\nStable\n\n', '[ref]: https://example.invalid/target\n'],
                    ['\uFEFF\uFEFFHeading\n\n', 'tail'],
                    ['Heading\n', '===\n'], ['A | B\n', '--- | ---\n1 | 2\n'],
                    ['```js\nconst a = 1', ';\n```\n\nTail'],
                    ['<div>hello\n', '\nworld</div>\n\nTail'],
                    ['<table><tr><td>A', '</td></tr>outside</table>'],
                    ['- one\n', '  - nested\n', '\n- two\n'],
                    ['Prefix\n\n\\[a\n', '=\nb\\]\n\nTail'],
                    ['**CJK：**正文 $x', '^2$\n\nTail'],
                    ['[file](src/a.js)\n\n', '<img src="/safe.png" onerror="alert(1)"><script>bad()</script>'],
                    ['&lt;p&gt;a&lt;/p&gt;', '\n\n<p>a</p>'],
                    ['$x$\n\n', ('$' + 'x+'.repeat(160) + 'y$\n\n').repeat(100) + 'END']
                ];
                const failures = [];
                for (const parts of sequences) {
                    const root = document.createElement('div'), fast = document.createElement('div'); let source = '';
                    for (const part of parts) {
                        source += part; const html = PiFileViewer.markdown(source);
                        PiFileViewer.updateMarkdown(root, html);
                        PiFileViewer.renderStreamingMarkdown(fast, source);
                        const expected = document.createElement('div'); expected.innerHTML = html;
                        if (root.innerHTML !== expected.innerHTML || fast.innerHTML !== expected.innerHTML) failures.push(source);
                    }
                }
                // A cache limit is a replacement fallback, never a truncation.
                const root = document.createElement('div'), fast = document.createElement('div');
                for (const source of ['p\n\n'.repeat(2200), 'p\n\n'.repeat(2200) + 'END', 'short']) {
                    const html = PiFileViewer.markdown(source); PiFileViewer.updateMarkdown(root, html); PiFileViewer.renderStreamingMarkdown(fast, source);
                    const expected = document.createElement('div'); expected.innerHTML = html;
                    if (root.innerHTML !== expected.innerHTML || fast.innerHTML !== expected.innerHTML) failures.push('cache limit');
                }
                const changedBase = document.createElement('div'), source = '[file](src/a.js)';
                for (const base of ['C:/one/', 'D:/two/']) {
                    PiFileViewer.renderStreamingMarkdown(changedBase, source, { base });
                    if (changedBase.innerHTML !== PiFileViewer.markdown(source, base)) failures.push('base change');
                }
                const purifier = window.DOMPurify;
                try {
                    window.DOMPurify = null;
                    PiFileViewer.renderStreamingMarkdown(changedBase, '<img src=x>\nPlain');
                    if (changedBase.querySelector('img') || changedBase.textContent !== '<img src=x>Plain') failures.push('plain fallback');
                } finally { window.DOMPurify = purifier; }
                return failures;
            });
            assert.deepEqual(parity, [], `${width}: complete render parity`);
            const work = await page.evaluate(() => {
                const root = document.createElement('div');
                const original = DOMPurify.sanitize; let calls = 0, characters = 0;
                DOMPurify.sanitize = function(...args) { calls++; characters += String(args[0]).length; return original.apply(this, args); };
                const prefix = '# Stable code\n\n```js\n' + 'const stable = 1;\n'.repeat(1000) + '```\n\n';
                try {
                    PiFileViewer.renderStreamingMarkdown(root, prefix + 'Tail');
                    const code = root.querySelector('pre'), initial = calls, initialCharacters = characters;
                    for (let i = 0; i < 20; i++) PiFileViewer.renderStreamingMarkdown(root, prefix + 'Tail ' + i);
                    const changed = calls - initial, changedCharacters = characters - initialCharacters;
                    PiFileViewer.renderStreamingMarkdown(root, prefix + 'Tail 19');
                    const duplicate = calls - initial - changed;
                    const expected = document.createElement('div'); expected.innerHTML = PiFileViewer.markdown(prefix + 'Tail 19');
                    return { changed, changedCharacters, duplicate, retained: code === root.querySelector('pre'), parity: root.innerHTML === expected.innerHTML };
                } finally { DOMPurify.sanitize = original; }
            });
            assert.ok(work.changed <= 20, `${width}: stable prefix must not be sanitized again: ${JSON.stringify(work)}`);
            assert.ok(work.changedCharacters < 2000, `${width}: unchanged 1000-line code must not be sanitized again: ${JSON.stringify(work)}`);
            assert.equal(work.duplicate, 0); assert.equal(work.retained, true); assert.equal(work.parity, true);
            const prefix = '# Stable\n\n```js\nconst stable = 1;\n```\n\n[local](src/a.js)\n\n<details><summary>Details</summary>Body</details>\n\n$x^2$\n\n![pixel](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pNn8AAAAASUVORK5CYII=)\n\n';
            const send = event => socket.send(JSON.stringify(event));
            const delta = text => send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: text } });
            send({ type: 'message_start', message: { role: 'assistant', content: [], timestamp: 100 } });
            delta(prefix + 'Tail');
            await page.waitForSelector('.streaming .pi-code-copy');
            await page.evaluate(() => {
                const root = document.querySelector('.streaming .pi-markdown');
                window.__stable = [root.querySelector('h1'), root.querySelector('pre'), root.querySelector('a'), root.querySelector('details'), root.querySelector('.katex'), root.querySelector('img')];
                root.querySelector('details').open = true;
            });
            await page.locator('#pi-input').fill('Unsent draft');
            delta(' grows');
            await page.waitForFunction(() => document.querySelector('.streaming .pi-markdown').textContent.includes('Tail grows'));
            assert.equal(await page.evaluate(() => __stable.every(node => node.isConnected) && __stable[3].open), true);
            assert.equal(await page.locator('.streaming .pi-code-copy').count(), 1);
            await page.locator('.streaming .pi-code-copy').click();
            await page.waitForFunction(() => window.__copies.length === 1);
            assert.equal(await page.evaluate(() => __copies[0]), 'const stable = 1;\n');
            assert.equal(await page.locator('#pi-input').inputValue(), 'Unsent draft');
            // The authoritative end corrects the streamed text, including the code.
            const final = prefix.replace('stable = 1', 'stable = 2') + 'Final correction';
            const message = { role: 'assistant', content: [{ type: 'text', text: final }], timestamp: 100 };
            messages = [message]; send({ type: 'message_end', message });
            await page.waitForFunction(() => !document.querySelector('.streaming'));
            assert.equal(await page.locator('#pi-transcript-content .pi-code-copy').count(), 1);
            assert.match(await page.locator('#pi-transcript-content').textContent(), /Final correction/);
            assert.equal(await page.evaluate(() => __stable.every(node => !node.isConnected)), true);
            send({ type: 'message_start', message: { role: 'assistant', content: [], timestamp: 101 } });
            delta('# Next\n\n[late][ref]\n\n```js\nconst change = 1');
            await page.waitForFunction(() => document.querySelector('.streaming code')?.textContent === 'const change = 1\n');
            await page.evaluate(() => { window.__oldCode = document.querySelector('.streaming pre'); });
            delta(';\n```\n\n[ref]: https://example.invalid/target\n');
            await page.waitForSelector('.streaming a[href="https://example.invalid/target"]');
            assert.equal(await page.evaluate(() => __oldCode.isConnected), false, 'changed code is replaced');
            assert.equal(await page.locator('.streaming .pi-code-copy').count(), 1);
            await page.locator('.streaming .pi-code-copy').click();
            await page.waitForFunction(() => window.__copies.length === 2);
            assert.equal(await page.evaluate(() => __copies[1]), 'const change = 1;\n');
            for (const [scroll, client] of await page.evaluate(() => ['body', '#pi-transcript', '#pi-transcript-content'].map(selector => { const node = document.querySelector(selector); return [node.scrollWidth, node.clientWidth]; }))) assert.ok(scroll <= client + 1, `${width}: width ${scroll}/${client}`);
            assert.deepEqual(errors, []);
            console.log(`Streaming DOM ${width}: parity, identities, decoration, final correction, draft and width passed`);
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
