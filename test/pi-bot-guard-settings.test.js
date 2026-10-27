const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const settings = require('../server/bot/bot-settings');
const { ruleFor, approvalFor } = require('../server/bot/bot-guard');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-guard-settings-')));
const agentDir = path.join(root, 'agent'), cwd = path.join(root, 'workspace');
fs.mkdirSync(agentDir); fs.mkdirSync(cwd);
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_PROJECT_ROOTS = root;
process.env.PI_OFFLINE = '1';
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('owner permission patches add, replace and revoke exact grants without changing defaults', () => {
    const bot = settings.defaultBot({ workspace: cwd });
    const unknown = { v: 20, id: 'future', match: '**', unknown: { preserved: true, futureData: 'x'.repeat(2200) } };
    const invalidOld = { v: 1, id: 'legacy', tool: 'bash', value: 'rm -rf .', cwd };
    bot.permissions = { ...bot.permissions, future: { preserved: true }, rules: [unknown, invalidOld] };
    assert.deepEqual(settings.readBot({ bot }).permissions, bot.permissions);
    assert.deepEqual(settings.applyBotPatch(bot, { job: 'routine' }).permissions, bot.permissions);
    const rule = ruleFor({ toolName: 'bash', input: { command: 'pwd' }, cwd, agentDir });
    const patched = settings.applyBotPatch(bot, { permissions: { preset: 'balanced', rules: [unknown, invalidOld, rule] } });
    assert.deepEqual(patched.permissions, { preset: 'balanced', future: { preserved: true }, rules: [unknown, invalidOld, rule] });
    assert.equal(approvalFor({ permissions: patched.permissions, toolName: 'bash', input: { command: 'pwd' }, cwd, agentDir }), null);
    const revoked = settings.applyBotPatch(patched, { permissions: { rules: [unknown, invalidOld] } });
    assert.equal(revoked.permissions.preset, 'balanced');
    assert.deepEqual(revoked.permissions.future, { preserved: true });
    assert.equal(approvalFor({ permissions: revoked.permissions, toolName: 'bash', input: { command: 'pwd' }, cwd, agentDir }).kind, 'command');
    assert.deepEqual(settings.defaultBot({ workspace: cwd }).permissions, { preset: 'free', rules: [] });
    for (const rules of [[{ ...unknown, id: 'new' }], [{ ...rule, value: 'sudo pwd' }], [{ ...rule, value: 'eval pwd' }],
        [{ ...rule, extra: true }], [rule, { ...rule }], Array(201).fill(rule), [null]])
        assert.throws(() => settings.applyBotPatch(patched, { permissions: { rules } }), /Invalid|Duplicate/);
    assert.throws(() => settings.applyBotPatch(patched, { permissions: { future: 3 } }), /Invalid/);
});

test('Bot settings service keeps revision CAS for permission grants and leaves unrelated profile fields intact', async t => {
    const { PiSessionStore } = require('../server/pi-session-store');
    const { PiProfileRegistry } = require('../server/pi-profile-registry');
    const { BotService } = require('../server/bot/bot-service');
    const store = new PiSessionStore(), profiles = new PiProfileRegistry(store); store.profiles = profiles;
    const bots = new BotService({ store, profiles, supervisor: { on() {}, off() {} } });
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const id = created.bot.id;
    const rule = ruleFor({ toolName: 'bash', input: { command: 'date' }, cwd: (await profiles.getProfile(id)).bot.workspace, agentDir });
    const revision = (await profiles.state()).revision;
    await bots.update(id, { expectedRevision: revision, changes: { bot: { permissions: { rules: [rule] } } } });
    await assert.rejects(bots.update(id, { expectedRevision: revision, changes: { bot: { permissions: { rules: [] } } } }), error => error.status === 409);
    const saved = await profiles.getProfile(id);
    assert.deepEqual(saved.bot.permissions.rules, [rule]);
    assert.equal(saved.bot.permissions.preset, 'free');
    await profiles.mutate((await profiles.state()).revision, state => {
        const profile = state.profiles.find(item => item.id === id);
        profile.future = { opaque: true };
        profile.bot.permissions.future = 'preserve';
        profile.bot.permissions.rules.push({ version: 200, data: ['unknown'] });
    });
    const before = await profiles.getProfile(id);
    await bots.update(id, { expectedRevision: (await profiles.state()).revision, changes: { bot: { job: 'new job' } } });
    const after = await profiles.getProfile(id);
    assert.deepEqual(after.future, before.future);
    assert.deepEqual(after.bot.permissions, before.bot.permissions);
    await bots.update(id, { expectedRevision: (await profiles.state()).revision, changes: { bot: { permissions: { rules: [] } } } });
    assert.deepEqual((await profiles.getProfile(id)).bot.permissions, { preset: 'free', rules: [], future: 'preserve' });
});
