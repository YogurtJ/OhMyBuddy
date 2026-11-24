const assert = require('node:assert/strict'), http = require('node:http'), path = require('node:path');
const { once } = require('node:events');
const express = require('express');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..'), cwd = '/synthetic/diagnostics';
const model = { provider: 'fixture', id: 'fixture', input: ['text', 'image'] };
const diagnostic = (reason, ids = [null]) => ({ type: 'openai_input_transformations', details: { transformations: [
    ...ids.map(id => ({ type: 'reasoning', action: 'removed', reason, ...(id ? { id } : {}) })),
    { type: 'reasoning', action: 'removed', reason: 'turn_boundary' }] } });
const anthropicDiagnostic = (count, reason = 'invalid_signature') => ({ type: 'anthropic_input_transformations', details: { transformations:
    Array.from({ length: count }, (_, i) => ({ type: 'thinking_dropped', path: `messages.${i}.content.0`, reason })) } });
async function run(browser, base, width, language) {
    const context = await browser.newContext({ locale: language, viewport: { width, height: 900 }, isMobile: width < 900, hasTouch: width < 900 });
    const page = await context.newPage(), errors = [], calls = [];
    let holdState = false, releaseState, stateHeld;
    const held = new Promise(resolve => { stateHeld = resolve; });
    let sessionId = 'one', socket, messages = [
        { role: 'user', timestamp: 1, content: 'Synthetic image question' },
        { role: 'assistant', timestamp: 2, stopReason: 'toolUse', content: [{ type: 'thinking', thinking: 'First thought' }, { type: 'toolCall', id: 'read-1', name: 'read', arguments: { path: 'fixture.png' } }], diagnostics: [diagnostic('prefix_mismatch', ['rs_a', 'rs_b'])] },
        { role: 'toolResult', timestamp: 3, toolCallId: 'read-1', toolName: 'read', content: [{ type: 'text', text: 'Read image' }], details: { imageUnsupportedByModel: 'text-only-fixture' } },
        { role: 'assistant', timestamp: 4, stopReason: 'toolUse', content: [{ type: 'thinking', thinking: 'Second thought' }, { type: 'toolCall', id: 'read-2', name: 'read', arguments: { path: 'fixture.txt' } }], diagnostics: [diagnostic('prefix_mismatch', ['rs_a', 'rs_b'])] },
        { role: 'toolResult', timestamp: 5, toolCallId: 'read-2', toolName: 'read', content: [{ type: 'text', text: 'Read text' }] },
        { role: 'assistant', timestamp: 6, stopReason: 'aborted', content: [] },
        { role: 'assistant', timestamp: 7, stopReason: 'stop', content: [{ type: 'text', text: 'Synthetic answer' }], diagnostics: [diagnostic('prefix_mismatch', ['rs_a', 'rs_b'])] }
    ];
    const compactedMessages = [
        { role: 'user', timestamp: 100, content: 'Before compaction' },
        { role: 'assistant', timestamp: 101, stopReason: 'stop', content: [{ type: 'text', text: 'Pre-compaction answer' }], diagnostics: [diagnostic('prefix_mismatch', ['rs_a'])] },
        { role: 'compactionSummary', timestamp: 102, summary: 'Compacted context summary', tokensBefore: 50000 },
        { role: 'assistant', timestamp: 103, stopReason: 'toolUse', content: [{ type: 'toolCall', id: 'cmp-1', name: 'read', arguments: { path: 'a.txt' } }], diagnostics: [diagnostic('prefix_mismatch', ['rs_a'])] },
        { role: 'toolResult', timestamp: 104, toolCallId: 'cmp-1', toolName: 'read', content: [{ type: 'text', text: 'ok' }] },
        { role: 'assistant', timestamp: 105, stopReason: 'toolUse', content: [{ type: 'toolCall', id: 'cmp-2', name: 'read', arguments: { path: 'b.txt' } }], diagnostics: [diagnostic('prefix_mismatch', ['rs_a'])] },
        { role: 'toolResult', timestamp: 106, toolCallId: 'cmp-2', toolName: 'read', content: [{ type: 'text', text: 'ok' }] },
        { role: 'assistant', timestamp: 107, stopReason: 'stop', content: [{ type: 'thinking', thinking: 'Only thought' }], diagnostics: [diagnostic('prefix_mismatch', ['rs_a', 'rs_b'])] }
    ];
    const sessionMessages = id => id === 'one' ? messages : id === 'compacted' ? compactedMessages : [];
    const notices = [{ type: 'warning', message: 'Synthetic extension warning <img src=x onerror=window.BAD=1>' }];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ cwd, language }) => {
        localStorage.setItem('pi.web.cwd', cwd); localStorage.setItem(`pi.web.session:${cwd}`, 'one');
        localStorage.setItem('pi.workspace.language', language); localStorage.setItem('pi.web.transcriptMode', 'full');
    }, { cwd, language });
    await page.route('**/api/**', route => {
        const endpoint = new URL(route.request().url()).pathname;
        let data = {};
        if (endpoint === '/api/pi/status') data = { projectRoots: ['/synthetic'] };
        else if (endpoint === '/api/pi/projects') data = { projects: [{ cwd, name: 'Fixture', sessionCount: 3 }] };
        else if (endpoint === '/api/pi/sessions') data = { sessions: ['one', 'two', 'compacted'].map(id => ({ cwd, id, name: id })) };
        else if (endpoint === '/api/pi/activity') data = { runtimes: [], pinnedProjects: [], hiddenProjects: [], replyNotices: [] };
        else if (endpoint.includes('history') || endpoint === '/api/prompts') data = [];
        return route.fulfill({ json: data });
    });
    await page.routeWebSocket('**/api/pi/ws', ws => {
        socket = ws;
        ws.onMessage(raw => {
            const command = JSON.parse(raw); calls.push(command.type);
            if (command.type === 'open_session') sessionId = command.sessionId;
            const state = { model, isStreaming: false, thinkingLevel: 'off', webDiagnostics: sessionId === 'one' ? notices : [] };
            let data = {};
            if (command.type === 'open_session') data = { session: { cwd, id: sessionId, name: sessionId }, state,
                messages: { messages: sessionMessages(sessionId) }, models: { models: [model] }, stats: {}, thinkingLevels: { levels: ['off'] }, commands: { commands: [] } };
            else if (command.type === 'get_state') {
                data = state;
                if (holdState) {
                    releaseState = () => ws.send(JSON.stringify({ type: 'response', id: command.id, command: command.type, success: true, data }));
                    stateHeld(); return;
                }
            }
            else if (command.type === 'get_messages') data = { messages: sessionMessages(sessionId) };
            ws.send(JSON.stringify({ type: 'response', id: command.id, command: command.type, success: true, data }));
        });
    });
    await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.abort());
    try {
        await page.goto(base);
        const panel = page.locator('#pi-runtime-diagnostics'); await panel.waitFor();
        await panel.locator('summary').click();
        assert.match(await panel.textContent(), /Synthetic extension warning/);
        assert.equal(await panel.locator('img').count(), 0); assert.equal(await page.evaluate(() => window.BAD), undefined);
        await page.locator('.pi-provider-diagnostic').waitFor();
        assert.equal(await page.locator('.pi-provider-diagnostic').count(), 1, 'repeated prefix_mismatch across turns and aborted message is deduplicated');
        const summary = await page.locator('.pi-provider-diagnostic summary').textContent();
        assert.match(summary, language === 'en' ? /2 historical/ : /2 段/);
        await page.locator('.pi-provider-diagnostic summary').click();
        assert.match(await page.locator('.pi-provider-diagnostic p').textContent(), /prefix_mismatch/);
        assert.equal(await page.locator('.pi-tool-image-warning').count(), 1);
        assert.match(await page.locator('.pi-tool-image-warning').getAttribute('title'), /text-only-fixture/);
        // Reading/compact modes keep consecutive tool-only calls merged in one process group
        // without turning a provider diagnostic into a reply header or breaking turn folding.
        await page.evaluate(() => {
            document.querySelector('[data-transcript-mode="reading"]')?.click();
        });
        await page.waitForFunction(() => document.querySelector('#pi-transcript-content')?.dataset.transcriptMode === 'reading');
        assert.equal(await page.locator('.pi-process-group:visible').count(), 1, 'provider diagnostic does not split consecutive tool calls');
        assert.equal(await page.locator('.pi-message.assistant.pi-process-only').count(), 2, 'tool-only message carrying diagnostic stays process-only');
        assert.equal(await page.locator('.pi-provider-diagnostic:visible').count(), 1);
        await page.evaluate(() => {
            document.querySelector('[data-transcript-mode="compact"]')?.click();
        });
        await page.waitForFunction(() => document.querySelector('#pi-transcript-content')?.dataset.transcriptMode === 'compact');
        assert.equal(await page.locator('.pi-turn-group:visible').count(), 1, 'completed turn folds intermediate tools and diagnostic cleanly');
        assert.equal(await page.locator('.pi-provider-diagnostic:visible').count(), 0, 'folded turn hides intermediate diagnostic until expanded');
        await page.evaluate(() => {
            document.querySelector('[data-transcript-mode="full"]')?.click();
        });
        await page.waitForFunction(() => document.querySelector('#pi-transcript-content')?.dataset.transcriptMode === 'full');
        await page.locator('#pi-input').fill('Keep this draft');
        holdState = true;
        socket.send(JSON.stringify({ type: 'agent_settled' }));
        await held;
        socket.send(JSON.stringify({ type: 'gateway_runtime_diagnostics', diagnostics: [{ type: 'error', message: 'A new runtime warning' }] }));
        await page.waitForFunction(() => document.querySelector('#pi-runtime-diagnostics').textContent.includes('A new runtime warning'));
        holdState = false; releaseState();
        await page.waitForTimeout(100);
        assert.match(await panel.textContent(), /A new runtime warning/, 'an older state response cannot erase a newer diagnostic');
        assert.equal(await page.locator('#pi-input').inputValue(), 'Keep this draft');
        const sendLive = message => {
            socket.send(JSON.stringify({ type: 'message_start', message: { role: 'assistant', timestamp: message.timestamp, content: [] } }));
            socket.send(JSON.stringify({ type: 'message_end', message }));
        };
        sendLive({ role: 'assistant', timestamp: 8, stopReason: 'stop', content: [{ type: 'text', text: 'Live repeat' }],
            diagnostics: [diagnostic('prefix_mismatch', ['rs_a', 'rs_b'])] });
        await page.waitForFunction(() => document.body.textContent.includes('Live repeat'));
        assert.equal(await page.locator('.pi-provider-diagnostic').count(), 1, 'live repeat with identical reasoning IDs is suppressed');
        sendLive({ role: 'assistant', timestamp: 9, stopReason: 'stop', content: [{ type: 'text', text: 'Live grew' }],
            diagnostics: [diagnostic('prefix_mismatch', ['rs_a', 'rs_b', 'rs_c'])] });
        await page.waitForFunction(() => document.querySelectorAll('.pi-provider-diagnostic').length === 2);
        assert.match(await page.locator('.pi-provider-diagnostic summary').nth(1).textContent(), language === 'en' ? /3 historical/ : /3 段/);
        sendLive({ role: 'assistant', timestamp: 10, stopReason: 'stop', content: [{ type: 'text', text: 'Live swapped ID' }],
            diagnostics: [diagnostic('prefix_mismatch', ['rs_a', 'rs_b', 'rs_d'])] });
        await page.waitForFunction(() => document.querySelectorAll('.pi-provider-diagnostic').length === 3);
        const final = { role: 'assistant', timestamp: 11, stopReason: 'stop', content: [{ type: 'text', text: 'Live answer' }],
            diagnostics: [diagnostic('model_mismatch'), { type: 'unknown', details: { transformations: [{ type: 'reasoning', reason: '<script>BAD</script>' }] } }] };
        sendLive(final);
        await page.waitForFunction(() => document.querySelectorAll('.pi-provider-diagnostic').length === 4);
        assert.equal(await page.locator('.pi-provider-diagnostic script').count(), 0);
        sendLive({ role: 'assistant', timestamp: 12, stopReason: 'stop', content: [{ type: 'text', text: 'Live model repeat' }],
            diagnostics: [diagnostic('model_mismatch')] });
        await page.waitForFunction(() => document.body.textContent.includes('Live model repeat'));
        assert.equal(await page.locator('.pi-provider-diagnostic').count(), 4, 'live repeat without IDs and same reason is suppressed');
        sendLive({ role: 'assistant', timestamp: 13, stopReason: 'stop', content: [{ type: 'text', text: 'Live anthropic 1' }],
            diagnostics: [anthropicDiagnostic(1)] });
        await page.waitForFunction(() => document.querySelectorAll('.pi-provider-diagnostic').length === 5);
        sendLive({ role: 'assistant', timestamp: 14, stopReason: 'stop', content: [{ type: 'text', text: 'Live anthropic repeat' }],
            diagnostics: [anthropicDiagnostic(1)] });
        await page.waitForFunction(() => document.body.textContent.includes('Live anthropic repeat'));
        assert.equal(await page.locator('.pi-provider-diagnostic').count(), 5, 'repeated Anthropic thinking_dropped is suppressed');
        sendLive({ role: 'assistant', timestamp: 15, stopReason: 'stop', content: [{ type: 'text', text: 'Live anthropic 2' }],
            diagnostics: [anthropicDiagnostic(2)] });
        await page.waitForFunction(() => document.querySelectorAll('.pi-provider-diagnostic').length === 6);
        if (width < 900) {
            await page.locator('#pi-mobile-context-trigger').click();
            assert.equal(await page.locator('#pi-mobile-session-dialog').isVisible(), true);
            await page.locator('#pi-mobile-session-dialog .pi-mobile-sheet-head button').click();
        }
        const dimensions = await page.locator('#pi-runtime-diagnostics, .pi-provider-diagnostic, .pi-tool-row').evaluateAll(nodes => nodes.map(node => ({ width: node.clientWidth, scroll: node.scrollWidth, right: node.getBoundingClientRect().right })));
        for (const item of dimensions) assert.ok(item.scroll <= item.width + 1 && item.right <= width + 1, JSON.stringify(item));
        await page.reload(); await page.locator('#pi-runtime-diagnostics').waitFor();
        assert.equal(await page.locator('.pi-provider-diagnostic').count(), 1, 'diagnostics rebuild from the original message, without duplicate notices');
        // Incremental render (keep > 0): appending a new user turn whose assistant repeats the
        // exact same historical drops keeps the previous turn's DOM and suppresses the repeat.
        await page.evaluate(() => { document.querySelector('.pi-provider-diagnostic').dataset.keptNode = '1'; });
        messages = [
            ...messages,
            { role: 'user', timestamp: 20, content: 'Follow-up turn' },
            { role: 'assistant', timestamp: 21, stopReason: 'stop', content: [{ type: 'text', text: 'Follow-up answer' }], diagnostics: [diagnostic('prefix_mismatch', ['rs_a', 'rs_b'])] }
        ];
        socket.send(JSON.stringify({ type: 'agent_settled' }));
        await page.waitForFunction(() => document.body.textContent.includes('Follow-up answer'));
        assert.equal(await page.locator('.pi-provider-diagnostic').count(), 1, 'incremental render suppresses repeated drops across turns');
        assert.equal(await page.locator('.pi-provider-diagnostic[data-kept-node="1"]').count(), 1, 'previous turn diagnostic DOM is preserved incrementally');
        await page.evaluate(cwd => window.PiChatNavigation.openSession({ sessionId: 'compacted', cwd }), cwd);
        await page.waitForFunction(() => Boolean(document.querySelector('.pi-summary-notice.compactionSummary')));
        assert.equal(await page.locator('.pi-provider-diagnostic').count(), 3, 'compaction summary resets baseline once, suppresses repeats, and shows grown tail drop');
        await page.evaluate(() => {
            document.querySelector('[data-transcript-mode="compact"]')?.click();
        });
        await page.waitForFunction(() => document.querySelector('#pi-transcript-content')?.dataset.transcriptMode === 'compact');
        assert.equal(await page.locator('.pi-turn-group:visible').count(), 0, 'diagnostic-only thinking tail without text is not mistaken for a final reply');
        await page.evaluate(cwd => window.PiChatNavigation.openSession({ sessionId: 'two', cwd }), cwd);
        await page.waitForFunction(() => document.querySelector('#pi-runtime-diagnostics').hidden);
        assert.equal(await page.locator('.pi-provider-diagnostic').count(), 0);
        assert.ok(!calls.includes('prompt')); assert.deepEqual(errors, []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        console.log(JSON.stringify({ width, language, status: 'passed', scenarios: ['startup-snapshot', 'live-notice', 'reasoning-diagnostics', 'dedup-live-and-reload', 'compaction-reset', 'transcript-folding', 'read-image', 'safe-dom', 'draft', 'mobile-drawer', 'width', 'reload', 'session-switch'] }));
    } finally { await context.close(); }
}
(async () => {
    const app = express();
    for (const [name, folder] of [['marked', 'marked/lib'], ['dompurify', 'dompurify/dist'], ['highlight', '@highlightjs/cdn-assets']]) app.use('/vendor/' + name, express.static(path.join(root, 'node_modules', folder)));
    app.use(express.static(path.join(root, 'public')));
    const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    try { for (const [width, language] of [[1440, 'zh-CN'], [393, 'zh-CN'], [320, 'en']]) await run(browser, `http://127.0.0.1:${server.address().port}`, width, language); }
    finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
