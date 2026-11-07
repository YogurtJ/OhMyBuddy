const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { approvalFor, approvalMessage, parseApprovalMessage, insideWorkspace, resolvePiPath, newToken, KINDS } = require('../server/bot/bot-guard');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-guard-test-')));
const workspace = path.join(root, 'bot'), outside = path.join(root, 'outside');
fs.mkdirSync(workspace); fs.mkdirSync(outside);
fs.symlinkSync(outside, path.join(workspace, 'link'));
fs.symlinkSync(outside, path.join(workspace, 'out dir'));
fs.symlinkSync(path.join(outside, 'new.md'), path.join(workspace, 'dangling.md'));
fs.symlinkSync(path.join(workspace, 'loop-b'), path.join(workspace, 'loop-a'));
fs.symlinkSync(path.join(workspace, 'loop-a'), path.join(workspace, 'loop-b'));
fs.writeFileSync(path.join(outside, 'shared.md'), 'x');
fs.linkSync(path.join(outside, 'shared.md'), path.join(workspace, 'hardlink.md'));
fs.writeFileSync(path.join(workspace, 'plan.md'), 'x');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const ask = (preset, toolName, input = {}, annotations) => approvalFor({ preset, toolName, input, cwd: workspace, annotations });

test('paths resolve exactly like the Pi write and edit tools', async () => {
    // Pi does not export its resolver; the installed copy is the reference.
    const paths = path.join(__dirname, '../node_modules/@earendil-works/pi-coding-agent/dist/core/tools/path-utils.js');
    const { resolveToCwd } = await import(pathToFileURL(paths).href);
    const inputs = ['plan.md', './a/../b.md', '@plan.md', '@@x.md', ' plan.md ', '~', '~/notes.md', '~\\notes.md', 'file:///tmp/outside/note.md',
        `file://${outside}/a.md`, 'out\u00a0dir/a.md', 'a\u3000b.md', '/abs/path.md', '../up.md', 'C:\\x.md', '/mnt/c/x.md', ''];
    for (const input of inputs) {
        let expected;
        try { expected = resolveToCwd(input, workspace); }
        catch (error) {
            assert.throws(() => resolvePiPath(input, workspace), { name: error.name, code: error.code }, JSON.stringify(input));
            continue;
        }
        assert.equal(resolvePiPath(input, workspace), expected, JSON.stringify(input));
    }
});

test('outside writes are recognised through URLs, spaces, symlinks and hard links', () => {
    for (const target of ['plan.md', './notes/new/deep.md', '@plan.md', path.join(workspace, 'a.md'), pathToFileURL(path.join(workspace, 'a.md')).href])
        assert.equal(insideWorkspace(workspace, target), true, target);
    for (const target of ['../outside/a.md', path.join(outside, 'a.md'), 'link/a.md', 'link/new/dir/a.md', '~/a.md', null,
        'file:///tmp/outside/note.md', pathToFileURL(path.join(outside, 'a.md')).href, 'out\u00a0dir/a.md', 'dangling.md', 'loop-a', 'loop-a/x.md', 'hardlink.md', 'file://host/x'])
        assert.equal(insideWorkspace(workspace, target), false, JSON.stringify(target));
});

test('presets decide which steps ask first', () => {
    assert.equal(ask('free', 'bash', { command: 'rm -rf x' }), null);
    assert.equal(ask('balanced', 'bash', { command: 'rm -rf x' }).kind, 'command');
    assert.equal(ask(undefined, 'bash', { command: 'ls' }).kind, 'command');
    assert.equal(ask('balanced', 'bash', { command: 'ls' }), null);
    assert.equal(ask('ask', 'bash', { command: 'ls' }).rule.value, 'ls');
    assert.equal(ask('ask', 'powershell', { command: 'Get-ChildItem' }).rule.value, 'Get-ChildItem');
    assert.equal(ask('balanced', 'agent_thread', { message: 'Do it' }), null);
    assert.deepEqual(ask('ask', 'agent_thread', { message: 'Do it' }), { kind: 'delegate', detail: 'Do it' });
    assert.equal(ask('balanced', 'write', { path: 'link/a.md' }), null);
    assert.equal(ask('ask', 'write', { path: 'link/a.md' }).kind, 'outside');
    assert.equal(ask('ask', 'write', { path: pathToFileURL(path.join(outside, 'note.md')).href }).kind, 'outside');
    assert.equal(ask('balanced', 'edit', { path: 'plan.md' }), null);
    for (const tool of ['memory_add', 'deliver_files', 'get_attachment', 'mcp_tool']) assert.equal(ask('balanced', tool, { content: 'x' }), null, tool);
    assert.deepEqual(ask('balanced', 'mcp_tool', {}, { destructiveHint: true }), { kind: 'action', detail: 'mcp_tool' });
    assert.equal(ask('ask', 'edit', { path: 'plan.md' }).rule.value, path.join(workspace, 'plan.md'));
    assert.deepEqual(ask('ask', 'memory_replace', { old_text: 'a', content: 'b' }), { kind: 'memory', detail: 'b' });
    for (const tool of ['media_generate', 'deliver_files', 'get_attachment']) assert.deepEqual(ask('ask', tool, {}), { kind: 'action', detail: tool }, tool);
    assert.equal(ask('ask', 'mcp_reader', {}, { readOnlyHint: true }), null);
    for (const tool of ['read', 'grep', 'web_search', 'memory_search', 'bot_setup_propose', 'ask_user_question', 'codemode'])
        assert.equal(ask('ask', tool, tool === 'read' ? { path: 'plan.md' } : {}), null, tool);
    assert.equal(ask('ask', 'bash', { command: 'echo x; '.repeat(400) }).detail.length, 2001, 'long details are clipped');
});

test('bot_schedule is reading for list, runs in free and balanced, and asks for create and cancel in ask mode', () => {
    const create = { action: 'create', title: '吃晚饭', once: '2026-10-26 19:00', timeZone: 'Asia/Shanghai' };
    const cancel = { action: 'cancel', id: 'task-id', approvalJob: { title: '工作日简报',
        schedule: { kind: 'cron', expression: '0 9 * * 1-5', timeZone: 'Asia/Shanghai' } } };
    for (const preset of ['free', 'balanced', 'ask']) {
        assert.equal(ask(preset, 'bot_schedule', { action: 'list' }), null);
        for (const [input, detail] of [[create, 'Create: 吃晚饭\n2026-10-26 19:00 (Asia/Shanghai)'],
            [cancel, 'Cancel: 工作日简报\n0 9 * * 1-5 (Asia/Shanghai)']]) {
            assert.deepEqual(ask(preset, 'bot_schedule', input, { readOnlyHint: true }), preset !== 'ask' ? null : { kind: 'schedule', detail });
        }
    }
    assert.deepEqual(ask('ask', 'bot_schedule', { ...cancel, approvalJob: { title: '晚饭',
        schedule: { kind: 'once', at: Date.parse('2026-10-26T11:00:00Z'), timeZone: 'Asia/Shanghai' } } }),
    { kind: 'schedule', detail: 'Cancel: 晚饭\n2026-10-26 19:00 (Asia/Shanghai)' });
});

test('the approval message carries a token, round-trips and rejects other confirms', () => {
    const token = newToken();
    assert.match(token, /^[a-f0-9]{16}$/);
    assert.notEqual(newToken(), token);
    for (const kind of KINDS) assert.deepEqual(parseApprovalMessage(approvalMessage({ kind, detail: 'a\n\nb', token })), { kind, token, detail: 'a\n\nb' });
    for (const message of ['Allow?', `unknown #${token}\n\nx`, 'command\n\nx', `command #${token.slice(1)}\n\nx`, undefined]) assert.equal(parseApprovalMessage(message), null);
});

test('Bot workspaces never land in the service directory, even when it is inside a project root', { timeout: 30000 }, async t => {
    const projects = path.join(root, 'projects'), app = path.join(projects, 'pivane'), other = path.join(root, 'other');
    fs.mkdirSync(app, { recursive: true }); fs.mkdirSync(other);
    const prior = { roots: process.env.PI_PROJECT_ROOTS, agent: process.env.PI_CODING_AGENT_DIR, cwd: process.cwd(), offline: process.env.PI_OFFLINE, workspaces: process.env.OHMYBUDDY_WORKSPACES_DIR };
    process.env.PI_PROJECT_ROOTS = `${projects}${path.delimiter}${other}`; process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent'); process.env.PI_OFFLINE = '1';
    process.env.OHMYBUDDY_WORKSPACES_DIR = path.join(other, 'workspaces');
    fs.mkdirSync(path.join(app, '.git'));
    fs.mkdirSync(process.env.PI_CODING_AGENT_DIR, { recursive: true });
    process.chdir(app);
    t.after(() => {
        process.chdir(prior.cwd);
        for (const [key, name] of [['roots', 'PI_PROJECT_ROOTS'], ['agent', 'PI_CODING_AGENT_DIR'], ['offline', 'PI_OFFLINE'], ['workspaces', 'OHMYBUDDY_WORKSPACES_DIR']])
            if (prior[key] === undefined) delete process.env[name]; else process.env[name] = prior[key];
    });
    const { PiSessionStore } = require('../server/pi-session-store');
    const { PiProfileRegistry } = require('../server/pi-profile-registry');
    const { BotService } = require('../server/bot/bot-service');
    const store = new PiSessionStore();
    assert.equal(store.defaultProject(), app, 'the generic default falls back to the working directory');
    const profiles = new PiProfileRegistry(store); store.profiles = profiles;
    const bots = new BotService({ store, profiles, supervisor: { on() {}, off() {} } });
    assert.equal(bots.workspaceBase(), path.join(other, 'workspaces'));
    const workspace = bots.prepareWorkspace('12345678-0000-4000-8000-000000000000', 'Test', 'en');
    assert.equal(path.dirname(workspace), path.join(other, 'workspaces', 'bots'));
    process.env.OHMYBUDDY_WORKSPACES_DIR = path.join(app, 'workspaces');
    assert.equal(bots.workspaceBase(), null, 'a checkout cannot become the managed work root');
    assert.throws(() => bots.prepareWorkspace('22345678-0000-4000-8000-000000000000', 'Test', 'en'), /external workspace/);
    assert.equal(fs.existsSync(path.join(app, 'workspaces')), false);
});
