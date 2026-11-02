'use strict';
// The notebook in a real Pi agent session (UAT-04): window_note called directly and from inside
// another tool (the way codemode scripts call tools, ctx.executeTool), in parallel, with empty
// optional fields. Every reported change is in the session file and replays after reopening.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-note-native-')));
const agentDir = path.join(root, 'agent'), cwd = path.join(root, 'project');
for (const dir of [agentDir, cwd]) fs.mkdirSync(dir);
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_PROJECT_ROOTS = root; process.env.OHMYBUDDY_WORKSPACES_DIR = path.join(root, 'workspaces');
process.env.PI_OFFLINE = '1';
process.env.PI_TELEMETRY = '0';
const ledger = require('../server/bot/bot-ledger');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const model = { provider: 'fixture', id: 'model', api: 'openai-completions', name: 'Synthetic', input: ['text'],
    reasoning: false, contextWindow: 32000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };

test('window_note changes reach the session file whether called directly or from inside another tool', { timeout: 60000 }, async t => {
    const sdk = await import('@earendil-works/pi-coding-agent');
    const file = path.join(__dirname, '../server/bot/bot-notebook.ts');
    const notebook = require(process.env.PIVANE_TEST_PI_JITI).createJiti(file)(file);
    const call = (id, name, args) => ({ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
    const steps = [
        // One assistant message: a direct call with empty optional fields, and a script-like tool.
        { tool_calls: [call('d1', 'window_note', { action: 'add', kind: 'decision', text: '分享主题定为《如何整理工作资料》', id: '', due: '', replaces: '' }),
            { ...call('r1', 'relay', {}), index: 1 }] },
        { content: '记下了。' },
        { tool_calls: [call('d2', 'window_note', { action: 'update', id: 'n2', due: 'none', text: '' })] },
        { content: '改好了。' }
    ];
    const requests = [];
    const server = http.createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        requests.push(JSON.parse(raw));
        const delta = steps[requests.length - 1] || { content: '…' };
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(`data: ${JSON.stringify({ id: 'synthetic', choices: [{ index: 0, delta, finish_reason: delta.tool_calls ? 'tool_calls' : 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } })}\n\ndata: [DONE]\n\n`);
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const selected = { ...model, baseUrl: `http://127.0.0.1:${server.address().port}/v1` };

    const nested = [];
    const relay = { name: 'relay', label: 'Relay', description: 'Runs other tools like a script.', parameters: { type: 'object', properties: {} },
        execute: async (_id, _input, _signal, _update, ctx) => {
            // Two calls at once, as Promise.all in a codemode script: the results never reach the session file.
            const results = await Promise.all([
                ctx.executeTool('window_note', { action: 'add', kind: 'commitment', text: '11 月 6 日 17:30 前准备好分享', due: '2026-11-06T17:30+08:00', replaces: '' }),
                ctx.executeTool('window_note', { action: 'add', kind: 'ref', text: '预算上限 280 元', due: '' })]);
            nested.push(...results);
            return { content: [{ type: 'text', text: results.map(item => item.isError ? 'failed' : 'ok').join(',') }], details: {} };
        } };
    const sessions = path.join(root, 'sessions');
    const manager = sdk.SessionManager.create(cwd, sessions);
    const settings = sdk.SettingsManager.inMemory({ defaultTools: ['read'], enableInstallTelemetry: false, compaction: { enabled: false }, retry: { enabled: false } });
    const loader = new sdk.DefaultResourceLoader({ cwd, agentDir, settingsManager: settings, noExtensions: true, noSkills: true, noPromptTemplates: true,
        noContextFiles: true, noThemes: true, extensionFactories: [pi => notebook.registerNotebook(pi, () => true)] });
    await loader.reload();
    const runtime = await sdk.ModelRuntime.create({ authPath: path.join(agentDir, 'auth.json'), modelsPath: null,
        modelsStorePath: path.join(agentDir, 'catalog.json'), allowModelNetwork: false });
    runtime.registerProvider('fixture', { api: 'openai-completions', baseUrl: selected.baseUrl, apiKey: 'synthetic', models: [selected] });
    await runtime.refresh({ allowNetwork: false });
    const { session } = await sdk.createAgentSession({ cwd, agentDir, modelRuntime: runtime, model: runtime.getModel('fixture', 'model'),
        resourceLoader: loader, settingsManager: settings, sessionManager: manager, customTools: [relay], tools: ['read', 'window_note', 'relay'] });
    await session.bindExtensions({ mode: 'print' });
    t.after(() => session.dispose());

    await session.prompt('这次分享定为“如何整理工作资料”，11 月 6 日 17:30 前准备好，预算上限 280 元。');
    assert.equal(nested.length, 2);
    assert.deepEqual(nested.map(item => item.isError), [false, false]);
    const reopened = () => sdk.SessionManager.open(manager.getSessionFile());
    let state = ledger.replay(reopened().getBranch());
    assert.deepEqual(state.items.map(item => [item.id, item.kind, item.text, item.due]).sort(), [
        ['n1', 'decision', '分享主题定为《如何整理工作资料》', null],
        ['n2', 'commitment', '11 月 6 日 17:30 前准备好分享', '2026-11-06T17:30+08:00'],
        ['n3', 'ref', '预算上限 280 元', null]].sort(), 'every reported change is in the file, ids distinct');
    // The nested results themselves are not in the transcript; the custom entries are.
    const branch = reopened().getBranch();
    assert.equal(branch.filter(entry => entry.type === 'message' && entry.message.role === 'toolResult').length, 2, 'only the model-issued calls');
    assert.equal(branch.filter(entry => entry.customType === ledger.LEDGER_ENTRY).length, 3);
    // The model's context still pairs each tool call with its result.
    // (the first message is Pi's system prompt; the notebook entries stay out of the model's context)
    const context = reopened().buildSessionContext().messages.map(message => message.role).filter(role => role !== 'system');
    assert.deepEqual(context, ['user', 'assistant', 'toolResult', 'toolResult', 'assistant']);

    await session.prompt('截止时间先不定了。');
    state = ledger.replay(reopened().getBranch());
    assert.equal(state.items.find(item => item.id === 'n2').due, null, 'update with due "none" removes it');
    assert.equal(state.nextSeq, 4);
    // The second request showed the model its own results (the notebook rendering is separate).
    assert.match(JSON.stringify(requests[1].messages), /added \[n1\]/);
});
