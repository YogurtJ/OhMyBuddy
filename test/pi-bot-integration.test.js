// Combined Bot owners with an actual managed channel turn and loopback-only model transport.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { once } = require('node:events');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-integration-')));
const agentDir = path.join(root, 'agent'); fs.mkdirSync(agentDir);
process.env.PI_CODING_AGENT_DIR = agentDir; process.env.PI_PROJECT_ROOTS = root; process.env.PI_OFFLINE = '1';
process.env.PI_WEB_DEFERRED_FILE = path.join(root, 'deferred.json');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('channel speech keeps notebook, summary, learning and recall provenance across model controls and rotation', { timeout: 120000 }, async t => {
    const body = '记住以后汇报进度时先列出已完成项，再写阻塞项。';
    const calls = [], sent = [];
    const provider = http.createServer(async (req, res) => {
        let text = ''; for await (const part of req) text += part;
        const input = JSON.parse(text); calls.push(input);
        const delta = calls.length === 1 ? { tool_calls: [{ index: 0, id: 'note1', type: 'function', function: {
            name: 'window_note', arguments: JSON.stringify({ action: 'add', kind: 'preference', text: '汇报进度先列出已完成项，再写阻塞项。' }) } }] }
            : { content: '记下了这个汇报偏好。' };
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(`data: ${JSON.stringify({ id: 'synthetic', choices: [{ index: 0, delta, finish_reason: delta.tool_calls ? 'tool_calls' : 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\ndata: [DONE]\n\n`);
    });
    provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
    fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify({ defaultProvider: 'fixture', defaultModel: 'text', defaultThinkingLevel: 'off',
        defaultProjectTrust: 'never', enableInstallTelemetry: false, compaction: { enabled: false } }));
    fs.writeFileSync(path.join(agentDir, 'models.json'), JSON.stringify({ providers: { fixture: { baseUrl: `http://127.0.0.1:${provider.address().port}/v1`,
        api: 'openai-completions', apiKey: 'synthetic', models: ['text', 'other'].map(id => ({ id, reasoning: false, input: ['text'], contextWindow: 32000, maxTokens: 1000 })) } } }));
    const { WorkspaceAccessService } = require('../server/workspace-access-service');
    const gateway = require('../server/pi-agent-routes').createPiAgentGateway({ accessService: new WorkspaceAccessService({ envToken: () => 'synthetic' }),
        deferredFilePath: process.env.PI_WEB_DEFERRED_FILE });
    t.after(async () => { await gateway.dispose(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); });
    const { bots, store, learning, knowledgeService } = gateway;
    const created = await bots.create({ expectedRevision: (await bots.profiles.state()).revision });
    const profileId = created.bot.id, windowId = created.window.id, source = (await bots.resolve(profileId, windowId)).session;
    const worker = await gateway.supervisor.getWorker({ cwd: source.cwd, sessionPath: source.path, sessionId: source.id });
    const patch = async bot => bots.update(profileId, { expectedRevision: (await bots.profiles.state()).revision, changes: { bot } });
    await patch({ model: { provider: 'fixture', id: 'other' }, thinking: 'off' });
    const messageId = 'b'.repeat(64);
    await worker.channelTurn({ id: messageId, peerId: 'synthetic-owner', text: body });
    assert.equal(calls.length, 2); assert.ok(calls.every(call => call.model === 'other'));
    const sdk = await import('@earendil-works/pi-coding-agent');
    const manager = sdk.SessionManager.open(source.path);
    const input = manager.getBranch().find(entry => entry.customType === 'pivane-channel-message');
    assert.ok(input);
    const ledger = require('../server/bot/bot-ledger');
    const note = ledger.replay(manager.getBranch()).items[0];
    assert.equal(note.source.entryId, input.id); assert.equal(note.source.role, 'user'); assert.equal(note.source.channel, 'weixin');
    assert.equal(note.source.messageId, messageId); assert.equal(note.source.quote, body);
    const context = await bots.profiles.context(manager, source.cwd);
    assert.ok(require('../server/profile-memory/scope').sourceProof(source.path, context, input.id));
    // Learning uses the real shared knowledge owner and native descriptor proof, with a
    // synthetic auxiliary completion. Enabling it does not send an unrelated chat turn.
    await learning.resumePromise; await learning.flushRegistrations();
    learning.preferences.writeDocument({ memoryModels: { 'memory-correction': { provider: 'fixture', modelId: 'text' } } });
    let learningCalls = 0;
    const model = { provider: 'fixture', id: 'text', input: ['text'], maxTokens: 1000 };
    learning.createModelRuntime = async () => ({ getModel: () => model, getAvailable: async () => [model], completeSimple: async (_model, request) => {
        learningCalls++; assert.match(request.messages[0].content, /先列出已完成项/); assert.doesNotMatch(request.messages[0].content, /\/confirm|已绑定/);
        return { stopReason: 'stop', usage: { input: 20, output: 10, totalTokens: 30 }, content: [{ type: 'text', text: JSON.stringify({
            action: 'create', kind: 'memory', target: 'memory', category: 'preference', content: '汇报进度先列出已完成项，再写阻塞项。' }) }] };
    } });
    await learning.save(profileId, { expectedRevision: (await learning.snapshot(profileId)).revision, changes: { enabled: true } });
    await learning.register({ cwd: source.cwd, sessionId: source.id, sessionPath: source.path });
    for (let n = 0; n < 200 && !(await learning.snapshot(profileId)).recentRuns.length; n++) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal((await learning.snapshot(profileId)).recentRuns[0]?.status, 'completed');
    assert.equal(learningCalls, 1);
    const knowledge = await knowledgeService.snapshot(profileId);
    assert.equal(knowledge.items[0].source.entryId, input.id); assert.equal(knowledge.receipts[0].source.sessionId, source.id);
    const compaction = require('../server/bot/bot-compaction');
    const summary = await compaction.structuredCompaction({ branch: manager.getBranch(), projection: manager.buildSessionProjection().entries,
        firstKeptEntryId: input.id, includeKept: true, sessionId: source.id, model: { contextWindow: 32000 }, now: new Date().toISOString(), reason: 'manual',
        complete: async ({ text }) => {
            assert.match(text, /User: 记住以后汇报进度/); assert.doesNotMatch(text, /\/confirm|已绑定/);
            return { stopReason: 'stop', text: JSON.stringify({ topic: '汇报偏好', episodes: ['用户选择先完成后阻塞'], now: {}, notes: [] }) };
        } });
    assert.equal(summary.details.pivaneBot.includedKept, true); assert.match(summary.summary, /汇报偏好/);
    // WeChat writes the same settings owner; it cannot mutate the currently idle native
    // model until the next actual turn. Transport sends are captured in memory only.
    const { ChannelStore } = require('../server/channels/store');
    const db = new ChannelStore(path.join(root, 'commands')); db.claim(); t.after(() => db.close());
    db.change(v => Object.assign(v, { accounts: [{ id: 'account', userId: 'owner', allowedUsers: ['owner'], enabled: true, token: 'synthetic', baseUrl: 'https://ilinkai.weixin.qq.com', cursor: '' }],
        bindings: [{ id: 'binding', accountId: 'account', peerId: 'owner', cwd: source.cwd, sessionId: source.id, bot: { profileId, windowId, main: true }, bots: [profileId] }],
        peers: [{ accountId: 'account', peerId: 'owner', contextToken: 'synthetic' }] }));
    const channels = Object.assign(Object.create(require('../server/channels/service').ChannelsService.prototype), {
        db, bots, store, supervisor: gateway.supervisor, runs: new Map(), operations: new Set(), pollers: new Map(), connections: new Map(),
        stopping: false, mutating: false, error: null, isSuspended: () => false, stopController: new AbortController(),
        adapter: { send: async (_account, _peer, text) => { sent.push(text); return {}; } },
        collectDeliverables: async () => [], collectMediaAssets: async () => [], startTyping: async () => async () => {} });
    db.change(v => v.jobs.push({ id: 'model-default', accountId: 'account', peerId: 'owner', bindingId: 'binding',
        target: { cwd: source.cwd, sessionId: source.id }, status: 'queued', text: '/model default' }));
    await channels.run('model-default', {});
    assert.match(sent.at(-1), /已保存/); assert.equal((await bots.settings(profileId)).bot.bot.model, null);
    assert.equal((await bots.settings(profileId)).bot.bot.thinking, 'off'); assert.equal(calls.length, 2);
    assert.equal((await worker.request('get_state')).model.id, 'other');
    await gateway.supervisor.stopSession(source.path); await learning.flushRegistrations();
    manager.appendCompaction(summary.summary, input.id, 100, summary.details);
    const moved = await bots.rotate(profileId, windowId, { expectedGeneration: 0 });
    const current = sdk.SessionManager.open(moved.session.path);
    const seed = current.getBranch().find(entry => entry.customType === 'pivane-bot-handoff');
    assert.equal(seed.details.tail.find(item => item.entryId === input.id).sessionId, source.id);
    assert.equal(ledger.replay(current.getBranch()).items[0].source.entryId, input.id);
    const { windowGenerations, recall, readAround } = require('../server/bot/bot-recall');
    const found = windowGenerations({ agentDir, context: { profileId, windowId, cwd: source.cwd }, current, pi: sdk });
    const hit = recall(found, '阻塞项').details.pivaneRecall.results.find(item => item.entryId === input.id);
    assert.equal(hit.role, 'user'); assert.equal(hit.channel, 'weixin');
    assert.match(readAround(found, { entry: input.id, before: 0, after: 0 }).text, /记住以后汇报进度/);
    await learning.register({ cwd: moved.session.cwd, sessionId: moved.session.id, sessionPath: moved.session.path });
    await learning.flushRegistrations(); assert.equal(learningCalls, 1, 'carried seeds are not fresh learning input');
    const next = await gateway.supervisor.getWorker({ cwd: moved.session.cwd, sessionPath: moved.session.path, sessionId: moved.session.id });
    assert.equal((await next.request('get_state')).model.id, 'text', 'new generation follows the model default persisted through WeChat');
});
