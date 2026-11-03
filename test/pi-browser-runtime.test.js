'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { once } = require('node:events');
const express = require('express');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-browser-runtime-'))), agent = path.join(root, 'agent'), cwd = path.join(root, 'project');
fs.mkdirSync(agent); fs.mkdirSync(cwd);
process.env.PI_CODING_AGENT_DIR = agent; process.env.PI_PROJECT_ROOTS = root; process.env.PI_OFFLINE = '1';
process.env.OHMYBUDDY_HOME = path.join(root, 'storage');
// Keep Windows system identity intact; app and agent storage are already scoped above.
if (process.platform !== 'win32') { process.env.HOME = root; process.env.USERPROFILE = root; }
process.env.PI_WEB_DEFERRED_FILE = path.join(agent, 'deferred.json');
process.env.PRIVATE_BROWSER_FIXTURE_SECRET = 'synthetic-value-that-must-not-reach-the-browser-server';
test.after(() => fs.promises.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
test('official Playwright MCP uses native Pi tools, isolates conversations and restores persistent login', { timeout: 120000 }, async t => {
    const executable = process.env.CHROMIUM_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (!fs.existsSync(executable)) return t.skip('Set CHROMIUM_PATH for the native browser fixture');
    fs.writeFileSync(path.join(cwd, 'upload.txt'), 'synthetic upload');
    let origin, stage = 0, submissions = 0, late = 0, started;
    const browserStarted = new Promise(resolve => { started = resolve; });
    const provider = http.createServer(async (req, res) => {
        if (req.method === 'GET') {
            if (req.url === '/submit') { submissions++; return res.end('Fixture saved 73'); }
            if (req.url === '/started') { started(); return res.end('started'); }
            if (req.url === '/late') { late++; return res.end('late'); }
            if (req.url === '/download') { res.setHeader('Content-Disposition', 'attachment; filename=fixture.csv'); return res.end('id,value\n73,fixture\n'); }
            res.setHeader('Content-Type', 'text/html');
            return res.end('<!doctype html><label>Full name <input></label><button onclick="fetch(\'/submit\').then(r=>r.text()).then(t=>document.querySelector(\'output\').textContent=t)">Save</button><output></output><label>Upload file <input id=upload type=file></label><a href=/download>Download CSV</a>');
        }
        for await (const _chunk of req) { /* synthetic provider; no real model or credentials */ }
        let code;
        const navigate = `await tools.mcp__ohmybuddy_browser__browser_navigate({url:${JSON.stringify(origin)}});`;
        if (stage === 0) {
            const flow = `async page=>{
                await page.getByLabel('Full name').fill('Ada');
                await page.getByRole('button',{name:'Save'}).click();
                await page.getByText('Fixture saved 73',{exact:true}).waitFor();
                await page.getByLabel('Upload file').setInputFiles(${JSON.stringify(path.join(cwd, 'upload.txt'))});
                const downloading=page.waitForEvent('download');
                await page.getByRole('link',{name:'Download CSV'}).click();
                const download=await downloading; await download.path();
                await page.evaluate(()=>{document.cookie='fixture_login=kept;path=/;max-age=3600';localStorage.setItem('fixture_login','kept')});
                return {receipt:await page.locator('output').innerText(),uploaded:await page.locator('#upload').evaluate(e=>e.files[0].name),downloaded:download.suggestedFilename(),secretPresent:typeof process!=='undefined'&&Boolean(process.env.PRIVATE_BROWSER_FIXTURE_SECRET)}
            }`;
            code = navigate + `text(await tools.mcp__ohmybuddy_browser__browser_run_code_unsafe({code:${JSON.stringify(flow)}}));`;
        }
        if (stage === 2) code = navigate + `text(await tools.mcp__ohmybuddy_browser__browser_evaluate({function:"()=>({cookies:document.cookie,storage:localStorage.getItem('fixture_login')})"}));`;
        if (stage === 4) code = navigate + `text(await tools.mcp__ohmybuddy_browser__browser_evaluate({function:"()=>({cookies:document.cookie,storage:localStorage.getItem('fixture_login')})"}));text(await tools.mcp__ohmybuddy_browser__browser_close({}));`;
        if (stage === 6) {
            const slow = `async page=>{await page.request.get(${JSON.stringify(origin + '/started')});await page.waitForTimeout(2000);await page.goto(${JSON.stringify(origin + '/late')})}`;
            code = `text(await tools.mcp__ohmybuddy_browser__browser_run_code_unsafe({code:${JSON.stringify(slow)}}));`;
        }
        if (stage === 7) code = navigate + `text(await tools.mcp__ohmybuddy_browser__browser_evaluate({function:"()=>({cookies:document.cookie,storage:localStorage.getItem('fixture_login')})"}));text(await tools.mcp__ohmybuddy_browser__browser_close({}));`;
        stage++;
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const send = (delta, finish_reason) => res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
        if (code) {
            send({ role: 'assistant', tool_calls: [{ index: 0, id: `browser-${stage}`, type: 'function', function: { name: 'codemode', arguments: JSON.stringify({ code }) } }] }); send({}, 'tool_calls');
        } else { send({ role: 'assistant', content: 'Browser fixture complete.' }); send({}, 'stop'); }
        res.end('data: [DONE]\n\n');
    });
    provider.listen(0, '127.0.0.1'); await once(provider, 'listening'); origin = `http://127.0.0.1:${provider.address().port}`;
    fs.writeFileSync(path.join(agent, 'settings.json'), JSON.stringify({ defaultProvider: 'fixture', defaultModel: 'fixture', defaultProjectTrust: 'never', enableInstallTelemetry: false }));
    fs.writeFileSync(path.join(agent, 'models.json'), JSON.stringify({ providers: { fixture: { baseUrl: `${origin}/v1`, api: 'openai-completions', apiKey: 'synthetic', models: [{ id: 'fixture', input: ['text'], contextWindow: 32000, maxTokens: 2000 }] } } }));
    process.env.OHMYBUDDY_BROWSER_EXECUTABLE = executable;
    const { WorkspaceAccessService } = require('../server/workspace-access-service'), { createPiAgentGateway } = require('../server/pi-agent-routes');
    const access = new WorkspaceAccessService({ filePath: path.join(agent, 'access.json'), envToken: () => 'synthetic-browser-token' });
    const gateway = createPiAgentGateway({ accessService: access, deferredFilePath: path.join(agent, 'deferred.json'), cronFilePath: path.join(agent, 'cron.sqlite') });
    const browser = gateway.browser;
    await browser.configure({ revision: browser.status().revision, enabled: true, headless: true });
    const app = express(); access.mount(app); app.use(express.json({ limit: '32mb' })); gateway.mount(app);
    const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const gatewayOrigin = `http://127.0.0.1:${server.address().port}`; process.env.PI_WORKSPACE_INTERNAL_ORIGIN = gatewayOrigin;
    const results = async worker => (await worker.request('get_entries')).entries.filter(entry => entry.message?.role === 'toolResult' && entry.message.toolName === 'codemode').map(entry => entry.message);
    const run = async worker => {
        const before = (await results(worker)).length;
        let off; const settled = new Promise(resolve => { off = worker.subscribe(event => { if (event.type === 'agent_settled') resolve(); }); });
        try { await worker.request('prompt', { message: 'Use official Playwright MCP on the synthetic fixture.' }); await settled; } finally { off(); }
        const list = (await results(worker)).slice(before); assert(list.length > 0); assert(list.every(result => !result.isError), JSON.stringify(list)); return JSON.stringify(list.at(-1));
    };
    try {
        const session = await gateway.store.createSession(cwd, 'Browser fixture');
        const worker = await gateway.supervisor.getWorker({ cwd, sessionPath: session.path, sessionId: session.id });
        assert(!(await worker.getNativeResources()).tools.some(tool => tool.name === 'omb_browser'));
        const first = await run(worker);
        assert.match(first, /Fixture saved 73/); assert.match(first, /secretPresent[^a-z]+false/); assert.equal(submissions, 1);
        assert.match(first, /upload.txt/); assert.match(first, /fixture.csv/);
        const output = path.join(cwd, 'browser-output', session.id);
        const csv = fs.readdirSync(output).find(name => name.endsWith('.csv'));
        assert(csv, 'official MCP downloads into this conversation’s project output directory');
        assert.equal(fs.readFileSync(path.join(output, csv), 'utf8'), 'id,value\n73,fixture\n');
        assert.equal(browser.running, true, 'nested native MCP calls must participate in maintenance');
        const session2 = await gateway.store.createSession(cwd, 'Separate browser fixture');
        const worker2 = await gateway.supervisor.getWorker({ cwd, sessionPath: session2.path, sessionId: session2.id });
        const second = await run(worker2);
        assert.match(second, /storage[^a-z]+null/); assert(!second.includes('fixture_login=kept'));
        const unauthorized = await fetch(gatewayOrigin + '/api/pi/browser/close', { method: 'POST', headers: { Authorization: `Bearer ${worker.navigationToken}`, 'Content-Type': 'application/json' }, body: '{}' });
        assert.equal(unauthorized.status, 401, 'MCP worker cannot impersonate the management UI');
        await browser.close(); assert.equal(browser.running, false);
        const restarted = await gateway.supervisor.getWorker({ cwd, sessionPath: session.path, sessionId: session.id });
        const restored = await run(restarted);
        assert.match(restored, /fixture_login=kept/); assert.match(restored, /kept/); assert.equal(submissions, 1);
        assert.equal(stage, 6);
        let off; const settled = new Promise(resolve => { off = restarted.subscribe(event => { if (event.type === 'agent_settled') resolve(); }); });
        const pending = restarted.request('prompt', { message: 'Run the synthetic cancellation fixture.' });
        await browserStarted;
        await restarted.request('abort'); await pending; await settled; off();
        assert.equal(browser.running, true, 'uncertain cancellation keeps the maintenance blocker until process cleanup');
        assert((await results(restarted)).some(result => result.isError && JSON.stringify(result).includes('Script aborted')), 'native cancellation remains an error in the original transcript');
        if (!restarted.isIdle()) await new Promise(resolve => {
            const check = () => { if (restarted.isIdle()) { restarted.client.off('event', check); resolve(); } };
            restarted.client.on('event', check); check();
        });
        assert.deepEqual(restarted.lifecycle().blockers, [], 'wait for native call cleanup, not only agent_settled');
        await new Promise(resolve => setTimeout(resolve, 2200));
        assert.equal(late, 0, 'native cancellation cleanup must prevent later actions without requiring manual close');
        assert.match(await run(restarted), /fixture_login=kept/, 'the next run reconnects the official server and preserves login');
        await browser.close();
        assert.equal(browser.running, false);
    } finally {
        await gateway.dispose(); access.dispose(); server.closeAllConnections(); provider.closeAllConnections();
        await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => provider.close(resolve))]);
    }
});
