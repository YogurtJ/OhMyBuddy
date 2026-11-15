// Isolated HTML documents: native fragment navigation must never resolve to the host app.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { once } = require('node:events');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = path.resolve(__dirname, '../..');
const content = `<nav>
<a id="toc" href="#section" target="_blank">Section</a>
<a id="chinese" href="#%E7%AB%A0%E8%8A%82%20%E4%B8%80">中文章节</a>
<a id="named" href="#legacy">Named anchor</a>
<a id="missing" href="#missing">Missing section</a>
<a id="relative" href="other.html">Relative page</a>
<a id="remote" href="https://invalid.test/page">Remote page</a>
<a id="root" href="/#/artifacts">App page</a>
</nav>
<button id="counter" onclick="this.textContent='Clicked'">Click</button>
<img src="https://invalid.test/image"><iframe src="https://invalid.test/frame"></iframe>
<meta http-equiv="refresh" content="0;url=https://invalid.test/refresh">
<form action="https://invalid.test/form"><input value="private"></form>
<div style="height:1600px"></div>
<h2 id="section">Section target</h2><a id="top" href="#">Back to top</a>
<div style="height:800px"></div>
<h2 id="章节 一">中文章节目标</h2>
<a name="legacy">Legacy target</a><div style="height:1000px"></div>
<script>
window.started = true;
try { parent.document.body.dataset.escaped = 'yes'; } catch {}
try { localStorage.setItem('escaped', 'yes'); } catch {}
const a = document.createElement('a'); a.id = 'dynamic'; a.href = '#section'; a.textContent = 'Dynamic section'; document.querySelector('nav').append(a);
</script>`;
async function run(browser, base, width, interactive, full) {
    const context = await browser.newContext({ viewport: { width, height: 852 }, hasTouch: width < 900 });
    const page = await context.newPage(), errors = [], requests = [], popups = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('popup', p => popups.push(p));
    await page.route('https://invalid.test/**', r => { requests.push(r.request().url()); return r.abort(); });
    await page.goto(base + '/host?view=files#/bot');
    const hostUrl = page.url();
    await page.evaluate(({ content, interactive, full }) => {
        const raw = full ? '<!doctype html><html lang="zh-CN" class="report"><head><base href="https://invalid.test/base/"><style>body{margin:8px}nav{display:flex;flex-wrap:wrap;gap:8px}h2{margin:0}</style></head><body data-report="yes">' + content + '</body></html>' : content;
        const frame = document.createElement('iframe'); frame.id = 'preview'; frame.title = 'HTML preview';
        frame.setAttribute('sandbox', interactive ? 'allow-scripts' : ''); frame.referrerPolicy = 'no-referrer'; frame.setAttribute('credentialless', '');
        frame.style.cssText = 'width:100%;height:650px;border:0;display:block';
        frame.srcdoc = PiFilePreviews.htmlDocument(raw, { interactive }); document.body.append(frame);
    }, { content, interactive, full });
    const frame = page.frameLocator('#preview');
    await frame.locator('#toc').waitFor();
    const child = await page.locator('#preview').elementHandle().then(h => h.contentFrame());
    const state = await child.evaluate(() => ({ base: document.baseURI, lang: document.documentElement.lang, report: document.body.dataset.report,
        started: window.started === true, scripts: document.querySelectorAll('script').length,
        parentBlocked: (() => { try { void parent.document; return false; } catch { return true; } })() }));
    assert.equal(state.base, 'about:srcdoc'); assert.equal(state.started, interactive); assert.equal(state.parentBlocked, true);
    if (full) { assert.equal(state.lang, 'zh-CN'); assert.equal(state.report, 'yes'); }
    if (!interactive) {
        assert.equal(state.scripts, 0);
        for (const id of ['relative', 'remote', 'root']) assert.equal(await frame.locator('#' + id).getAttribute('href'), null);
    }
    assert.equal(await frame.locator('#toc').getAttribute('target'), null);
    // Exercise native keyboard activation here; the viewer regressions cover pointer clicks.
    const activate = async id => { await frame.locator('#' + id).focus(); await page.keyboard.press('Enter'); };
    await activate('counter');
    if (interactive) await frame.locator('#counter').filter({ hasText: /^Clicked$/ }).waitFor();
    else assert.equal(await frame.locator('#counter').textContent(), 'Click');
    // Native keyboard activation must scroll the original document.
    await activate('toc');
    await child.waitForFunction(() => location.hash === '#section' && scrollY > 1000);
    assert.ok(await frame.locator('#section').evaluate(n => Math.abs(n.getBoundingClientRect().top) < 2));
    await activate('top'); await child.waitForFunction(() => scrollY === 0);
    await activate('chinese');
    await child.waitForFunction(() => decodeURIComponent(location.hash) === '#章节 一' && scrollY > 2000);
    await activate('named'); await child.waitForFunction(() => location.hash === '#legacy' && scrollY > 2000);
    await activate('missing'); await child.waitForFunction(() => location.hash === '#missing');
    assert.equal(await frame.locator('#section').textContent(), 'Section target');
    if (interactive) { await activate('dynamic'); await child.waitForFunction(() => location.hash === '#section' && scrollY > 1000); }
    assert.equal(page.url(), hostUrl); assert.deepEqual(popups, []);
    assert.equal(await page.locator('body').getAttribute('data-escaped'), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('escaped')), null);
    assert.deepEqual(requests, []); assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await child.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    console.log(`PASS HTML anchors ${width}px ${interactive ? 'interactive' : 'static'} ${full ? 'document' : 'fragment'}`);
    await context.close();
}
(async () => {
    const server = http.createServer((req, res) => {
        if (req.url === '/pi-file-previews.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(fs.readFileSync(path.join(source, 'public/pi-file-previews.js'))); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}</style><script src="/pi-file-previews.js"></script>');
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    let browser;
    try {
        browser = process.env.PI_HTML_PREVIEW_ENGINE === 'webkit'
            ? await webkit.launch({ executablePath: process.env.WEBKIT_PATH, headless: true })
            : await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
        const base = `http://127.0.0.1:${server.address().port}`;
        for (const width of [1440, 393, 320]) for (const interactive of [false, true]) for (const full of [true, false]) await run(browser, base, width, interactive, full);
    } finally { await browser?.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
