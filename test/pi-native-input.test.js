'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { registerChannelTurns, MESSAGE, STATE } = require('../server/channels/runtime');
const { nativeInputIndex, nativeMessage, textOf } = require('../server/pi-native-input');
const { buildHandoff } = require('../server/bot/bot-handoff');

test('actual AgentSession channel input retains user meaning across native system/loadout records', { timeout: 60000 }, async t => {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-native-input-')));
    const agentDir = path.join(root, 'agent'), cwd = path.join(root, 'project');
    fs.mkdirSync(agentDir); fs.mkdirSync(cwd);
    process.env.PI_CODING_AGENT_DIR = agentDir; process.env.PI_PROJECT_ROOTS = root;
    process.env.PI_OFFLINE = '1'; process.env.PI_TELEMETRY = '0';
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const requests = [];
    const server = http.createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        requests.push(JSON.parse(raw));
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(`data: ${JSON.stringify({ id: 'synthetic', choices: [{ index: 0, delta: { content: '收到这个约定。' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } })}\n\ndata: [DONE]\n\n`);
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const sdk = await import('@earendil-works/pi-coding-agent');
    const model = { provider: 'fixture', id: 'model', api: 'openai-completions', name: 'Synthetic', input: ['text'], reasoning: false,
        contextWindow: 32000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
    const settings = sdk.SettingsManager.inMemory({ enableInstallTelemetry: false, compaction: { enabled: false }, retry: { enabled: false } });
    let start, context;
    const loader = new sdk.DefaultResourceLoader({ cwd, agentDir, settingsManager: settings, noExtensions: true, noSkills: true, noPromptTemplates: true,
        noContextFiles: true, noThemes: true, extensionFactories: [pi => {
            start = registerChannelTurns(pi);
            pi.on('session_start', (_event, ctx) => { context = ctx; });
            pi.on('before_agent_start', event => {
                event.systemPromptOptions.sections.synthetic_input = 'Synthetic system context, never a user preference.';
                pi.appendEntry('synthetic-pre-input', { version: 1 });
                return { message: { customType: 'pivane-bot-notebook', content: 'Notebook context only.', display: false, details: { v: 1 } } };
            });
        }] });
    await loader.reload();
    const runtime = await sdk.ModelRuntime.create({ authPath: path.join(agentDir, 'auth.json'), modelsPath: null,
        modelsStorePath: path.join(agentDir, 'catalog.json'), allowModelNetwork: false });
    runtime.registerProvider('fixture', { api: 'openai-completions', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: 'synthetic', models: [model] });
    await runtime.refresh({ allowNetwork: false });
    const manager = sdk.SessionManager.create(cwd, path.join(root, 'sessions'));
    const { session } = await sdk.createAgentSession({ cwd, agentDir, modelRuntime: runtime, model: runtime.getModel('fixture', 'model'), resourceLoader: loader,
        settingsManager: settings, sessionManager: manager, tools: [] });
    t.after(() => session.dispose());
    await session.bindExtensions({ mode: 'print' });
    start(context, { action: 'start', id: 'a'.repeat(64), sessionId: manager.getSessionId(), peerId: 'synthetic-owner', text: '这个月预算就定7319元。' });
    await session.waitForIdle();
    assert.equal(requests.length, 1, 'one isolated loopback completion');
    const reopened = sdk.SessionManager.open(manager.getSessionFile()), branch = reopened.getBranch();
    const input = branch.find(entry => entry.customType === MESSAGE), marker = branch.find(entry => entry.customType === STATE);
    assert.ok(input); assert.notEqual(input.parentId, marker.id, 'real SDK adds intervening records');
    assert.ok(branch.slice(branch.indexOf(marker) + 1, branch.indexOf(input)).some(entry => entry.type === 'message' && entry.message.role === 'system'));
    const inputs = nativeInputIndex(branch, reopened.getSessionId()), message = nativeMessage(input, inputs);
    assert.equal(message.role, 'user'); assert.equal(textOf(message.content), '这个月预算就定7319元。');
    assert.equal(message.channel, 'weixin');
    const handoff = buildHandoff(reopened);
    assert.match(handoff.text, /User: 这个月预算就定7319元。/);
    assert.doesNotMatch(handoff.text, /Synthetic system context|Notebook context only|\/confirm/);
    assert.equal(branch.filter(entry => entry.type === 'message' && entry.message.role === 'user').length, 0, 'no rewritten or duplicate native user entry');
});
