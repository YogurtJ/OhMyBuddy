const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { approvalFor, approvalMessage, parseApprovalMessage, insideWorkspace, KINDS } = require('../server/bot/bot-guard');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-guard-test-')));
const workspace = path.join(root, 'bot'), outside = path.join(root, 'outside');
fs.mkdirSync(workspace); fs.mkdirSync(outside);
fs.symlinkSync(outside, path.join(workspace, 'link'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const ask = (preset, toolName, input = {}, annotations) => approvalFor({ preset, toolName, input, cwd: workspace, annotations });

test('workspace writes are judged like Pi resolves them, through symlinks', () => {
    for (const target of ['plan.md', './notes/new/deep.md', '@plan.md', path.join(workspace, 'a.md')]) assert.equal(insideWorkspace(workspace, target), true, target);
    for (const target of ['../outside/a.md', path.join(outside, 'a.md'), 'link/a.md', 'link/new/dir/a.md', '~/a.md', '', null]) assert.equal(insideWorkspace(workspace, target), false, String(target));
});

test('careful presets decide which steps ask first', () => {
    assert.equal(ask('free', 'bash', { command: 'rm -rf x' }), null, 'hands-off stays guidance only');
    assert.equal(ask(undefined, 'bash', { command: 'ls' }), null);
    assert.deepEqual(ask('balanced', 'bash', { command: 'ls' }), { kind: 'command', detail: 'ls' });
    assert.deepEqual(ask('balanced', 'agent_thread', { message: 'Do it' }), { kind: 'delegate', detail: 'Do it' });
    assert.deepEqual(ask('balanced', 'write', { path: 'link/a.md' }), { kind: 'outside', detail: 'link/a.md' });
    assert.equal(ask('balanced', 'edit', { path: 'plan.md' }), null);
    assert.equal(ask('balanced', 'memory_add', { content: 'x' }), null);
    assert.equal(ask('balanced', 'mcp_tool', {}), null);
    assert.deepEqual(ask('balanced', 'mcp_tool', {}, { destructiveHint: true }), { kind: 'action', detail: 'mcp_tool' });
    assert.deepEqual(ask('ask', 'edit', { path: 'plan.md' }), { kind: 'write', detail: 'plan.md' });
    assert.deepEqual(ask('ask', 'memory_replace', { old_text: 'a', content: 'b' }), { kind: 'memory', detail: 'b' });
    assert.deepEqual(ask('ask', 'media_generate', {}), { kind: 'action', detail: 'media_generate' });
    assert.equal(ask('ask', 'mcp_reader', {}, { readOnlyHint: true }), null);
    for (const tool of ['read', 'grep', 'web_search', 'memory_search', 'bot_setup_propose', 'ask_user_question', 'codemode', 'deliver_files'])
        assert.equal(ask('ask', tool), null, tool);
    assert.equal(ask('balanced', 'bash', { command: 'x'.repeat(3000) }).detail.length, 2001, 'long details are clipped');
});

test('the approval message round-trips and rejects other confirms', () => {
    for (const kind of KINDS) assert.deepEqual(parseApprovalMessage(approvalMessage({ kind, detail: 'a\n\nb' })), { kind, detail: 'a\n\nb' });
    assert.equal(parseApprovalMessage('Allow?'), null);
    assert.equal(parseApprovalMessage('unknown\n\nx'), null);
    assert.equal(parseApprovalMessage(undefined), null);
});

test('Bot workspaces never land in the service directory, even when it is inside a project root', { timeout: 30000 }, async t => {
    const projects = path.join(root, 'projects'), app = path.join(projects, 'pivane');
    fs.mkdirSync(app, { recursive: true });
    const prior = { roots: process.env.PI_PROJECT_ROOTS, agent: process.env.PI_CODING_AGENT_DIR, cwd: process.cwd(), offline: process.env.PI_OFFLINE };
    process.env.PI_PROJECT_ROOTS = projects; process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent'); process.env.PI_OFFLINE = '1';
    fs.mkdirSync(process.env.PI_CODING_AGENT_DIR, { recursive: true });
    process.chdir(app);
    t.after(() => {
        process.chdir(prior.cwd);
        for (const [key, name] of [['roots', 'PI_PROJECT_ROOTS'], ['agent', 'PI_CODING_AGENT_DIR'], ['offline', 'PI_OFFLINE']])
            if (prior[key] === undefined) delete process.env[name]; else process.env[name] = prior[key];
    });
    const { PiSessionStore } = require('../server/pi-session-store');
    const { PiProfileRegistry } = require('../server/pi-profile-registry');
    const { BotService } = require('../server/bot/bot-service');
    const store = new PiSessionStore();
    assert.equal(store.defaultProject(), app, 'the generic default falls back to the working directory');
    const profiles = new PiProfileRegistry(store); store.profiles = profiles;
    const bots = new BotService({ store, profiles, supervisor: { on() {}, off() {} } });
    assert.equal(bots.workspaceBase(), projects);
    const workspace = bots.prepareWorkspace('12345678-0000-4000-8000-000000000000', 'Test', 'en');
    assert.equal(path.dirname(workspace), path.join(projects, 'PivaneBots'));
    assert.equal(fs.existsSync(path.join(app, 'PivaneBots')), false);
});
