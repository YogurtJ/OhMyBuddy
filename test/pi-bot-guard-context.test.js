const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BLOCKED, APPROVAL_TITLE, parseApprovalMessage } = require('../server/bot/bot-guard');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-guard-context-')));
const agentDir = path.join(root, 'agent'); fs.mkdirSync(agentDir);
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_PROJECT_ROOTS = root;
process.env.PI_OFFLINE = '1';
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('managed Bot gate rereads rules on every call, refuses protected steps before UI, and keeps native Boolean approvals', async t => {
    const { PiSessionStore } = require('../server/pi-session-store');
    const { PiProfileRegistry } = require('../server/pi-profile-registry');
    const { BotService } = require('../server/bot/bot-service');
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const store = new PiSessionStore(), profiles = new PiProfileRegistry(store); store.profiles = profiles;
    t.after(() => profiles.dispose());
    const bots = new BotService({ store, profiles, supervisor: { on() {}, off() {} } });
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const id = created.bot.id, { session } = await bots.resolve(id, created.window.id), manager = SessionManager.open(session.path);
    const context = await bots.windowContext(manager, { cwd: session.cwd, sessionId: session.id, sessionPath: session.path });
    for (const [key, value] of Object.entries({ PIVANE_BOT_CONTEXT: JSON.stringify(context), PI_WEB_NAVIGATION_TOKEN: 'synthetic-navigation' })) {
        const prior = process.env[key]; process.env[key] = value;
        t.after(() => { if (prior === undefined) delete process.env[key]; else process.env[key] = prior; });
    }
    const file = path.join(__dirname, '../server/bot/bot-context-extension.ts');
    const { registerBotContext, botPermissions, botPreset } = require(process.env.PIVANE_TEST_PI_JITI).createJiti(file)(file);
    const handlers = new Map(), asked = [], retired = [];
    let answer = true, agentRoot = agentDir;
    registerBotContext({ on(name, fn) { handlers.set(name, fn); }, registerTool() {}, getAllTools: () => [] }, () => agentRoot);
    const ctx = { mode: 'rpc', cwd: session.cwd, sessionManager: manager, hasUI: true,
        ui: { async confirm(title, message) { assert.equal(title, APPROVAL_TITLE); asked.push(parseApprovalMessage(message)); return answer; },
            notify(message) { retired.push(JSON.parse(message)); } } };
    let serial = 0;
    const call = (toolName, input) => handlers.get('tool_call')({ toolName, input, toolCallId: `call-${serial++}` }, ctx);
    const update = async permissions => bots.update(id, { expectedRevision: (await profiles.state()).revision, changes: { bot: { permissions } } });
    await update({ preset: 'balanced' });
    assert.equal(await call('bash', { command: 'pwd' }), undefined);
    assert.equal(asked.length, 1); assert.equal(asked[0].rule.value, 'pwd');
    const rule = asked[0].rule;
    await update({ rules: [rule] });
    assert.deepEqual((await botPermissions(context, manager, session.cwd, agentDir)).rules, [rule]);
    assert.equal(await botPreset(context, manager, session.cwd, agentDir), 'balanced');
    assert.equal(await call('bash', { command: 'pwd' }), undefined);
    assert.equal(asked.length, 1, 'freshly persisted rule is used without a worker restart');
    await update({ rules: [] });
    answer = false;
    assert.deepEqual(await call('bash', { command: 'pwd' }), { block: true, reason: BLOCKED.not_approved });
    assert.equal(asked.length, 2);
    answer = 'true';
    assert.deepEqual(await call('bash', { command: 'pwd' }), { block: true, reason: BLOCKED.not_approved }, 'only native Boolean true authorizes execution');
    answer = true;
    const beforeProtected = asked.length;
    for (const preset of ['free', 'balanced', 'ask']) {
        await update({ preset });
        for (const [tool, input] of [['read', { path: '.env' }], ['write', { path: path.join(agentDir, 'settings.json') }],
            ['bash', { command: 'cat auth.json' }], ['powershell', { command: 'Get-Content .env' }]])
            assert.deepEqual(await call(tool, input), { block: true, reason: BLOCKED.protected });
        assert.equal(await call('bot_topic_propose', { title: 'A topic' }), undefined);
    }
    assert.equal(asked.length, beforeProtected, 'protected paths never reach confirmation UI');
    await update({ preset: 'free' });
    ctx.hasUI = false;
    assert.deepEqual(await call('bash', { command: 'rm -rf notes' }), { block: true, reason: BLOCKED.unattended });
    ctx.hasUI = true;
    manager.appendCustomEntry('pivane-cron-run', { sessionId: session.id, runId: 'synthetic', status: 'running' });
    assert.deepEqual(await call('bash', { command: 'systemctl restart example' }), { block: true, reason: BLOCKED.unattended });
    assert.equal(asked.length, beforeProtected);
    manager.appendCustomEntry('pivane-cron-run', { sessionId: session.id, runId: 'synthetic', status: 'completed' });
    const broken = path.join(root, 'broken'); fs.mkdirSync(path.join(broken, 'pivane-profiles', 'profiles.json'), { recursive: true });
    assert.deepEqual(await botPermissions(context, manager, session.cwd, broken, async () => {}), { preset: 'ask', rules: [] });
    assert.equal(await botPermissions(context, { getSessionId: () => 'foreign' }, session.cwd, agentDir), null);
    await update({ preset: 'balanced', rules: [rule] });
    agentRoot = broken;
    answer = false;
    assert.deepEqual(await call('bash', { command: 'pwd' }), { block: true, reason: BLOCKED.not_approved });
    assert.equal(asked.length, beforeProtected + 1, 'read failure does not reuse a cached grant');
    assert.ok(retired.every(item => item.pivaneBot?.event === 'approval-done'));
});
