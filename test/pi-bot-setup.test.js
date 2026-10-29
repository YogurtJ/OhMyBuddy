const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-setup-test-')));
const agentDir = path.join(root, 'agent');
fs.mkdirSync(agentDir, { recursive: true });
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_PROJECT_ROOTS = root;
process.env.PI_OFFLINE = '1';
const { PiSessionStore } = require('../server/pi-session-store');
const { PiProfileRegistry } = require('../server/pi-profile-registry');
const { PiAgentSupervisor } = require('../server/pi-agent-supervisor');
const { BotService } = require('../server/bot/bot-service');
const { profileDocuments } = require('../server/pi-profile-documents');
const setup = require('../server/bot/bot-setup');

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('setup proposals are bounded and only proposed fields can be confirmed', () => {
    assert.deepEqual(setup.normalizeProposal({ name: ' 阿狸 ', avatar: '🦊', aboutUser: ['叫我小王', '叫我小王'], finish: false }),
        { name: '阿狸', avatar: '🦊', aboutUser: ['叫我小王'] });
    for (const bad of [{}, { name: '' }, { name: 'x'.repeat(41) }, { avatar: 'ab' }, { avatar: '<b>' }, { job: 'a\nb' },
        { aboutUser: new Array(7).fill('x') }, { aboutUser: ['a § b'] }, { other: 1 }, { finish: 'yes' }])
        assert.throws(() => setup.normalizeProposal(bad), undefined, JSON.stringify(bad));
    const proposal = { name: '阿狸', job: '帮我安排生活' };
    assert.deepEqual(setup.confirmedChanges(proposal, { name: '小狸', job: null }), { name: '小狸' });
    assert.throws(() => setup.confirmedChanges(proposal, { personality: '偷偷加的' }), /Only the proposed fields/);
    assert.deepEqual(setup.appendUserEntries('A\n§\nB', ['B', 'C']), { content: 'A\n§\nB\n§\nC', added: ['C'] });
    assert.deepEqual(setup.appendUserEntries('', ['A']), { content: 'A', added: ['A'] });
});

test('a confirmed card saves identity, onboarding progress and about-you notes once', { timeout: 60000 }, async t => {
    const store = new PiSessionStore();
    const profiles = new PiProfileRegistry(store);
    store.profiles = profiles;
    const supervisor = new PiAgentSupervisor();
    t.after(() => supervisor.dispose());
    const documents = profileDocuments({ profiles, getAgentDir: async () => agentDir, bundlePath: null });
    const bots = new BotService({ store, profiles, supervisor, documents });
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const botId = created.bot.id, windowId = created.window.id;
    assert.deepEqual((await bots.list()).bots[0].chosen, { name: false, avatar: false }, 'a new Bot has nothing chosen yet');
    const { session } = await bots.resolve(botId, windowId);
    const manager = SessionManager.open(session.path);
    const callAssistant = (id, args) => manager.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id, name: setup.SETUP_TOOL, arguments: args }],
        api: 'openai-completions', provider: 'fixture', model: 'small', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'toolUse', timestamp: Date.now() });
    manager.appendMessage({ role: 'user', content: '好呀', timestamp: Date.now() });
    callAssistant('call-1', { name: '阿狸', avatar: '🦊', job: '帮我安排生活琐事', aboutUser: ['希望被叫做小王'] });

    const events = [];
    bots.on('botChanged', event => events.push(event));
    const stale = 'f'.repeat(64);
    await assert.rejects(bots.setup(botId, { windowId, toolCallId: 'call-1', expectedRevision: stale }), /changed|revision/i);
    await assert.rejects(bots.setup(botId, { windowId, toolCallId: 'missing', expectedRevision: (await profiles.state()).revision }), /not found/);
    await assert.rejects(bots.setup(botId, { windowId, toolCallId: 'call-1', expectedRevision: (await profiles.state()).revision,
        changes: { personality: 'sneaky' } }), /Only the proposed fields/);

    // The user renames the suggestion and drops the job before saving.
    const result = await bots.setup(botId, { windowId, toolCallId: 'call-1', expectedRevision: (await profiles.state()).revision,
        changes: { name: '小狸', avatar: '🦊', job: null, aboutUser: ['希望被叫做小王'] } });
    assert.deepEqual(result.saved, { name: '小狸', avatar: '🦊', aboutUser: ['希望被叫做小王'] });
    assert.deepEqual(result.user, { added: ['希望被叫做小王'], documentSaved: true });
    assert.equal(events.length, 1);
    const listed = (await bots.list()).bots[0];
    assert.equal(listed.name, '小狸');
    assert.deepEqual(listed.avatar, { kind: 'emoji', value: '🦊' });
    assert.equal(listed.bot.job, '', 'a dropped field is not saved');
    assert.equal(listed.bot.onboarding.phase, 'interview');
    // Each step is its own; the job the user dropped from the card is left for later (UAT-14).
    assert.deepEqual(listed.bot.onboarding.steps, { name: 'done', avatar: 'done', job: 'skipped', about: 'done' });
    const userFile = path.join(agentDir, 'ohmybuddy-profiles', 'data', botId, 'USER.md');
    assert.equal(fs.readFileSync(userFile, 'utf8'), '希望被叫做小王');

    // Once the tool has its result, the card cannot be saved again.
    manager.appendMessage({ role: 'toolResult', toolCallId: 'call-1', toolName: setup.SETUP_TOOL, content: [{ type: 'text', text: '{}' }], isError: false, timestamp: Date.now() });
    await assert.rejects(bots.setup(botId, { windowId, toolCallId: 'call-1', expectedRevision: (await profiles.state()).revision }), /already answered/);

    // A proposed face answered with a picture: the card uploads the picture first and names its
    // version; the emoji is not applied, and a face changed elsewhere in between is not taken.
    callAssistant('call-p', { avatar: '👋', job: '整理计划' });
    const version = 'a'.repeat(64), another = 'b'.repeat(64);
    const changed = { status: 409, code: 'BOT_PICTURE_CHANGED' };
    await assert.rejects(bots.setup(botId, { windowId, toolCallId: 'call-p', picture: version, changes: { avatar: null, job: '整理计划' },
        expectedRevision: (await profiles.state()).revision }), changed);
    for (const picture of ['yes', true, 'A'.repeat(64)])
        await assert.rejects(bots.setup(botId, { windowId, toolCallId: 'call-p', picture, expectedRevision: (await profiles.state()).revision }), /Invalid/);
    await profiles.saveAvatar(botId, (await profiles.state()).revision, another, async () => () => {});
    await assert.rejects(bots.setup(botId, { windowId, toolCallId: 'call-p', picture: version, changes: { avatar: null, job: '整理计划' },
        expectedRevision: (await profiles.state()).revision }), changed, 'another picture is not the one the user chose');
    assert.equal((await bots.list()).bots[0].bot.job, '', 'nothing saved');
    await profiles.saveAvatar(botId, (await profiles.state()).revision, version, async () => () => {});
    const pictured = await bots.setup(botId, { windowId, toolCallId: 'call-p', picture: version, changes: { avatar: '👋', job: '整理计划' },
        expectedRevision: (await profiles.state()).revision });
    assert.deepEqual(pictured.saved, { job: '整理计划', picture: true });
    assert.deepEqual((await profiles.getProfile(botId)).avatar, { kind: 'image', version }, 'the picture stays');
    manager.appendMessage({ role: 'toolResult', toolCallId: 'call-p', toolName: setup.SETUP_TOOL, content: [{ type: 'text', text: '{}' }], isError: false, timestamp: Date.now() });
    callAssistant('call-q', { job: '整理计划' });
    await assert.rejects(bots.setup(botId, { windowId, toolCallId: 'call-q', picture: version, expectedRevision: (await profiles.state()).revision }), /Only the proposed fields/);
    manager.appendMessage({ role: 'toolResult', toolCallId: 'call-q', toolName: setup.SETUP_TOOL, content: [{ type: 'text', text: '{}' }], isError: false, timestamp: Date.now() });

    // Personality and finish complete onboarding; existing notes are not duplicated.
    callAssistant('call-2', { personality: '温柔耐心，说话简短。', aboutUser: ['希望被叫做小王', '在准备考研'], finish: true });
    const second = await bots.setup(botId, { windowId, toolCallId: 'call-2', expectedRevision: (await profiles.state()).revision });
    assert.deepEqual(second.user.added, ['在准备考研']);
    assert.equal(fs.readFileSync(userFile, 'utf8'), '希望被叫做小王\n§\n在准备考研');
    const done = (await bots.list()).bots[0];
    assert.equal(done.bot.onboarding.phase, 'done');
    assert.ok(done.bot.onboarding.completedAt);
    assert.equal((await profiles.getProfile(botId)).soul, '温柔耐心，说话简短。');

    // A card from another window's conversation is never accepted here.
    const other = await services2(store, profiles, supervisor, documents);
    await assert.rejects(other.setup(botId, { windowId: '00000000-0000-4000-8000-000000000000', toolCallId: 'call-2',
        expectedRevision: (await profiles.state()).revision }), /not found/i);

    // Onboarding without a model call.
    const restarted = await bots.onboarding(botId, { action: 'restart', expectedRevision: (await profiles.state()).revision });
    assert.equal(restarted.bot.bot.onboarding.phase, 'interview');
    assert.deepEqual(restarted.bot.bot.onboarding.steps, {});
    assert.deepEqual((await bots.list()).bots.find(bot => bot.id === botId).chosen, { name: true, avatar: true }, 'meeting again keeps the chosen name and face');
    // A name picked in Bot settings, before the interview got there, counts as chosen too.
    const manual = await bots.create({ expectedRevision: (await profiles.state()).revision });
    await bots.update(manual.bot.id, { expectedRevision: (await profiles.state()).revision, changes: { name: '阿青' } });
    const listedManual = (await bots.list()).bots.find(bot => bot.id === manual.bot.id);
    assert.deepEqual([listedManual.bot.onboarding.steps, listedManual.chosen], [{ name: 'done' }, { name: true, avatar: false }],
        'a name set in settings while getting to know each other is not asked again');
    await bots.update(manual.bot.id, { expectedRevision: (await profiles.state()).revision, changes: { avatar: { kind: 'emoji', value: '🐼' } } });
    assert.deepEqual((await bots.list()).bots.find(bot => bot.id === manual.bot.id).chosen, { name: true, avatar: true });
    // An explicit choice that looks like a new Bot's (the other language's placeholder) is recorded,
    // and stays chosen when the interview starts over.
    const lookalike = await bots.create({ expectedRevision: (await profiles.state()).revision });
    await bots.update(lookalike.bot.id, { expectedRevision: (await profiles.state()).revision, changes: { name: 'New buddy' } });
    await bots.onboarding(lookalike.bot.id, { action: 'restart', expectedRevision: (await profiles.state()).revision });
    assert.deepEqual((await bots.list()).bots.find(bot => bot.id === lookalike.bot.id).chosen, { name: true, avatar: false });
    assert.deepEqual((await profiles.getProfile(lookalike.bot.id)).bot.chosen, { name: true });
    const skipped = await bots.onboarding(botId, { action: 'skip', expectedRevision: (await profiles.state()).revision });
    assert.equal(skipped.bot.bot.onboarding.phase, 'skipped');
    await assert.rejects(bots.onboarding(botId, { action: 'other', expectedRevision: (await profiles.state()).revision }), /Invalid/);
});

test('the setup tool reports only what the Bot page actually saved', { timeout: 60000 }, async t => {
    const jitiPath = process.env.PIVANE_TEST_PI_JITI;
    if (!jitiPath) return;
    const store = new PiSessionStore();
    const profiles = new PiProfileRegistry(store);
    store.profiles = profiles;
    const supervisor = new PiAgentSupervisor();
    t.after(() => supervisor.dispose());
    const documents = profileDocuments({ profiles, getAgentDir: async () => agentDir, bundlePath: null });
    const bots = new BotService({ store, profiles, supervisor, documents });
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const botId = created.bot.id, windowId = created.window.id;
    const { session } = await bots.resolve(botId, windowId);
    const manager = SessionManager.open(session.path);
    manager.appendMessage({ role: 'user', content: 'hi', timestamp: Date.now() });
    const context = await bots.windowContext(manager, { cwd: session.cwd, sessionId: session.id, sessionPath: session.path });
    const prior = { context: process.env.PIVANE_BOT_CONTEXT, token: process.env.PI_WEB_NAVIGATION_TOKEN };
    t.after(() => {
        for (const [key, name] of [['context', 'PIVANE_BOT_CONTEXT'], ['token', 'PI_WEB_NAVIGATION_TOKEN']])
            if (prior[key] === undefined) delete process.env[name]; else process.env[name] = prior[key];
    });
    process.env.PIVANE_BOT_CONTEXT = JSON.stringify(context);
    process.env.PI_WEB_NAVIGATION_TOKEN = 'synthetic-navigation';
    const file = path.join(__dirname, '../server/bot/bot-context-extension.ts');
    const { registerBotContext } = await require(jitiPath).createJiti(file).import(file);
    const handlers = new Map(), tools = new Map();
    registerBotContext({ on(name, fn) { handlers.set(name, fn); }, registerTool(tool) { tools.set(tool.name, tool); } }, () => agentDir);
    let answer = null, onSelect = null;
    const ctx = { mode: 'rpc', cwd: session.cwd, sessionManager: manager, hasUI: true, model: null, modelRegistry: { find: () => null },
        ui: { notify() {}, async select(title, options) {
            assert.equal(title, setup.SETUP_TITLE); assert.deepEqual(options, [setup.SAVE, setup.DECLINE]);
            if (onSelect) await onSelect();
            return answer;
        } } };
    await handlers.get('session_start')({}, ctx);
    const tool = tools.get(setup.SETUP_TOOL);
    assert.ok(tool, 'the setup tool exists in a verified Bot window');
    const run = async args => JSON.parse((await tool.execute('call', args, undefined, undefined, ctx)).content[0].text);

    answer = setup.SAVE;
    const initial = (await profiles.getProfile(botId));
    const now = { name: initial.name, avatar: initial.avatar, job: '', personality: initial.soul, workStyle: 'free', interview: 'greeting' };
    assert.deepEqual(await run({ name: '阿狸', avatar: '', job: ' ' }), { status: 'not_saved', saved: {}, kept: ['name'], current: now,
        note: 'Nothing was changed; "current" is how things stand.' }, 'answering Save elsewhere saves nothing; empty fields are not proposed');
    await assert.rejects(tool.execute('call', { name: '', avatar: '' }, undefined, undefined, ctx), /at least one change/);
    // The Bot page saves an edited value through the server, then answers Save.
    manager.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id: 'call-x', name: setup.SETUP_TOOL, arguments: { name: '阿狸', aboutUser: ['叫我小王'] } }],
        api: 'openai-completions', provider: 'fixture', model: 'small', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'toolUse', timestamp: Date.now() });
    onSelect = async () => bots.setup(botId, { windowId, toolCallId: 'call-x', changes: { name: '小狸', aboutUser: ['叫我小王'] },
        expectedRevision: (await profiles.state()).revision });
    assert.deepEqual(await run({ name: '阿狸', aboutUser: ['叫我小王'] }), { status: 'saved', saved: { name: '小狸', aboutUser: ['叫我小王'] },
        current: { ...now, name: '小狸', interview: 'interview' } });
    // The user unticks the face the Bot proposed again (or sets it back): reported as kept, with the identity as it stands.
    manager.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id: 'call-y', name: setup.SETUP_TOOL, arguments: { avatar: '👋', job: '整理计划', finish: true } }],
        api: 'openai-completions', provider: 'fixture', model: 'small', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'toolUse', timestamp: Date.now() });
    onSelect = async () => bots.setup(botId, { windowId, toolCallId: 'call-y', changes: { avatar: null, job: '整理计划', finish: true },
        expectedRevision: (await profiles.state()).revision });
    assert.deepEqual(await run({ avatar: '👋', job: '整理计划', finish: true }), { status: 'saved', saved: { job: '整理计划', finish: true }, kept: ['avatar'],
        current: { ...now, name: '小狸', job: '整理计划', interview: 'done' } });
    onSelect = null;
    answer = setup.DECLINE;
    assert.deepEqual(await run({ job: '陪我聊天' }), { status: 'declined' });
    answer = undefined;
    assert.deepEqual(await run({ job: '陪我聊天' }), { status: 'no_answer' });
    await assert.rejects(tool.execute('call', { other: 1 }, undefined, undefined, ctx), /Unknown setup field/);

    // The page persists Later before answering DECLINE. Only newly skipped steps belong in
    // the receipt, including about-user facts but never finish or already settled answers.
    await bots.onboarding(botId, { action: 'restart', expectedRevision: (await profiles.state()).revision });
    const laterProposal = { name: 'Another guess', avatar: '🦉', job: 'Study plans', personality: 'Be warm.', workStyle: 'ask',
        aboutUser: ['Another fact'], finish: true };
    manager.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id: 'call-later', name: setup.SETUP_TOOL, arguments: laterProposal }],
        api: 'openai-completions', provider: 'fixture', model: 'small', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'toolUse', timestamp: Date.now() });
    onSelect = async () => bots.setup(botId, { windowId, toolCallId: 'call-later', later: true, expectedRevision: (await profiles.state()).revision });
    answer = setup.DECLINE;
    assert.deepEqual(await run(laterProposal), { status: 'declined', later: ['name', 'avatar', 'job', 'personality', 'workStyle', 'aboutUser'] });
    assert.deepEqual(await run(laterProposal), { status: 'declined' }, 'steps already skipped before this call are not newly skipped');
    onSelect = null;
    assert.deepEqual(await run({ finish: true }), { status: 'declined' }, 'declining finish does not invent a skipped step');
    assert.equal((await profiles.getProfile(botId)).bot.onboarding.phase, 'interview');

    await bots.onboarding(botId, { action: 'restart', expectedRevision: (await profiles.state()).revision });
    manager.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id: 'call-work', name: setup.SETUP_TOOL, arguments: { workStyle: 'free' } }],
        api: 'openai-completions', provider: 'fixture', model: 'small', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'toolUse', timestamp: Date.now() });
    onSelect = async () => bots.setup(botId, { windowId, toolCallId: 'call-work', expectedRevision: (await profiles.state()).revision });
    answer = setup.SAVE;
    const workReceipt = await run({ workStyle: 'free' });
    assert.equal(workReceipt.status, 'saved', 'confirming the current way of working answers the interview');
    assert.deepEqual(workReceipt.saved, { workStyle: 'free' });
    assert.equal(workReceipt.current.workStyle, 'free');
    assert.equal(workReceipt.current.interview, 'interview');
    assert.equal(workReceipt.kept, undefined);

    // A failed final fact still saves the identity, but cannot tell the model the interview
    // finished or that the fact was remembered.
    const failedProposal = { name: 'Cedar', aboutUser: ['This fact must not be reported as saved'], finish: true };
    manager.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id: 'call-failed-fact', name: setup.SETUP_TOOL, arguments: failedProposal }],
        api: 'openai-completions', provider: 'fixture', model: 'small', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'toolUse', timestamp: Date.now() });
    bots.documents = { async run(id, target, write) {
        if (write) throw new Error('Synthetic final fact failure');
        return documents.run(id, target, false);
    } };
    onSelect = async () => bots.setup(botId, { windowId, toolCallId: 'call-failed-fact', expectedRevision: (await profiles.state()).revision });
    const failedReceipt = await run(failedProposal);
    assert.equal(failedReceipt.status, 'saved');
    assert.deepEqual(failedReceipt.saved, { name: 'Cedar' });
    assert.equal(failedReceipt.current.interview, 'interview');
    assert.equal(failedReceipt.current.workStyle, 'free');
    assert.equal((await profiles.getProfile(botId)).bot.onboarding.steps.about, undefined);


    const preset = { kind: 'preset', id: 'pivane-bean' };
    const avatarSchema = tool.parameters.properties.avatar.anyOf;
    assert.equal(avatarSchema[0].type, 'string', 'legacy clients can still propose an emoji');
    assert.equal(avatarSchema[1].additionalProperties, false);
    assert.equal(avatarSchema[1].properties.kind.const, 'preset');
    assert.deepEqual(avatarSchema[1].properties.id.anyOf.map(item => item.const), ['pivane-pebble', 'pivane-bean', 'pivane-tile']);
    const appendPresetCall = (id, avatar) => manager.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id, name: setup.SETUP_TOOL, arguments: { avatar } }],
        api: 'openai-completions', provider: 'fixture', model: 'small', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'toolUse', timestamp: Date.now() });
    appendPresetCall('preset-save', preset);
    onSelect = async () => bots.setup(botId, { windowId, toolCallId: 'preset-save', expectedRevision: (await profiles.state()).revision });
    const presetReceipt = await run({ avatar: preset });
    assert.equal(presetReceipt.status, 'saved');
    assert.deepEqual(presetReceipt.saved, { avatar: preset });
    assert.deepEqual(presetReceipt.current.avatar, preset);
    await bots.onboarding(botId, { action: 'restart', expectedRevision: (await profiles.state()).revision });
    appendPresetCall('preset-kept', { id: preset.id, kind: 'preset' });
    onSelect = async () => bots.setup(botId, { windowId, toolCallId: 'preset-kept', changes: {}, expectedRevision: (await profiles.state()).revision });
    const keptReceipt = await run({ avatar: preset });
    assert.equal(keptReceipt.status, 'not_saved', 'rereading an equal preset object is not an avatar change');
    assert.deepEqual(keptReceipt.saved, {});
    assert.deepEqual(keptReceipt.kept, ['avatar']);
    assert.deepEqual(keptReceipt.current.avatar, preset);
    assert.equal((await profiles.getProfile(botId)).bot.onboarding.steps.avatar, 'done');
    onSelect = null;
    assert.deepEqual((await run({ avatar: '🦊' })).current.avatar, preset, 'later cards keep the preset until a change is saved');
    const version = 'f'.repeat(64);
    await profiles.saveAvatar(botId, (await profiles.state()).revision, version, async () => () => {});
    assert.equal((await run({ avatar: preset })).current.avatar, '(picture ffffffff)', 'picture snapshot compatibility stays intact');
});

async function services2(store, profiles, supervisor, documents) { return new BotService({ store, profiles, supervisor, documents }); }

test('a Bot profile target resolves to its main chat, following rotation', { timeout: 60000 }, async t => {
    const { CronService } = require('../server/pi-cron-service');
    const store = new PiSessionStore();
    const profiles = new PiProfileRegistry(store);
    store.profiles = profiles;
    const supervisor = new PiAgentSupervisor();
    const bots = new BotService({ store, profiles, supervisor });
    const cron = new CronService({ store, supervisor, profiles, bots, catalog: async () => ({ models: [] }),
        filename: path.join(root, 'cron-bot.sqlite') });
    t.after(async () => { await cron.dispose(); await supervisor.dispose(); });
    await cron.ready;
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const botId = created.bot.id, windowId = created.window.id;
    const first = (await bots.resolve(botId, windowId)).session;
    assert.deepEqual(await cron.homeRef(botId), { cwd: first.cwd, sessionId: first.id, status: 'ready', bot: true });
    assert.equal((await cron.target({ kind: 'profile', profileId: botId })).id, first.id);
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    SessionManager.open(first.path).appendMessage({ role: 'user', content: 'hello', timestamp: Date.now() });
    await bots.rotate(botId, windowId, { expectedGeneration: 0 });
    const second = (await bots.resolve(botId, windowId)).session;
    assert.notEqual(second.id, first.id);
    assert.equal((await cron.target({ kind: 'profile', profileId: botId })).id, second.id, 'new runs go to the current generation');
    // The overview shows the Bot's home as its main chat; it is derived and cannot be replaced.
    const home = (await cron.snapshot()).homes.find(item => item.profileId === botId);
    assert.deepEqual({ cwd: home.cwd, sessionId: home.sessionId, bot: home.bot, status: home.status }, { cwd: second.cwd, sessionId: second.id, bot: true, status: 'ready' });
    await assert.rejects(cron.home(botId, { revision: 0, cwd: first.cwd, sessionId: first.id }), error => error.status === 409 && /主聊天/.test(error.message));
    await assert.rejects(cron.home(botId, { revision: 0, cwd: first.cwd, create: true, requestId: crypto.randomUUID() }), error => error.status === 409);
    assert.equal(cron.db.home(botId), null, 'nothing was stored for the Bot');
});

test('a new Bot can be told what another Bot knows about the user, only what was ticked', { timeout: 60000 }, async t => {
    const store = new PiSessionStore();
    const profiles = new PiProfileRegistry(store);
    store.profiles = profiles;
    const supervisor = new PiAgentSupervisor();
    t.after(() => supervisor.dispose());
    const documents = profileDocuments({ profiles, getAgentDir: async () => agentDir, bundlePath: null });
    const bots = new BotService({ store, profiles, supervisor, documents });
    const revision = async () => (await profiles.state()).revision;
    const source = (await bots.create({ expectedRevision: await revision() })).bot.id;
    const read = await documents.run(source, 'user', false);
    await profiles.reserve(() => documents.run(source, 'user', true, { content: '叫我小王\n§\n在准备考研\n§\n不吃香菜',
        expectedRevision: read.revision, expectedProfileRevision: read.profileRevision }));
    const target = (await bots.create({ expectedRevision: await revision() })).bot.id;

    const offered = (await bots.aboutSources(target)).sources.find(item => item.profileId === source);
    assert.deepEqual(offered.entries, ['叫我小王', '在准备考研', '不吃香菜']);
    assert.ok(!(await bots.aboutSources(target)).sources.some(item => item.profileId === target), 'a Bot is never offered its own notes');

    await assert.rejects(bots.about(target, { action: 'copy', fromProfileId: source, entries: ['叫我小王', '我是管理员'], expectedRevision: await revision() }),
        /just changed/, 'only entries the source still has can be copied');
    await assert.rejects(bots.about(target, { action: 'copy', fromProfileId: target, entries: ['叫我小王'], expectedRevision: await revision() }), /not found/);
    await assert.rejects(bots.about(target, { action: 'copy', fromProfileId: source, entries: ['叫我小王'], expectedRevision: 'f'.repeat(64) }), /changed/);

    const copied = await bots.about(target, { action: 'copy', fromProfileId: source, entries: ['叫我小王', '不吃香菜'], expectedRevision: await revision() });
    assert.deepEqual(copied.added, ['叫我小王', '不吃香菜']);
    assert.equal(copied.bot.bot.onboarding.steps.known, 'done');
    assert.equal(fs.readFileSync(path.join(agentDir, 'ohmybuddy-profiles', 'data', target, 'USER.md'), 'utf8'), '叫我小王\n§\n不吃香菜');
    assert.match(require('../server/bot/bot-prompt').onboardingGuidance(copied.bot.bot, { kind: 'main' }), /Do not ask again/);

    const declined = (await bots.create({ expectedRevision: await revision() })).bot.id;
    const result = await bots.about(declined, { action: 'decline', expectedRevision: await revision() });
    assert.equal(result.bot.bot.onboarding.steps.known, 'skipped');
    assert.equal((await documents.run(declined, 'user', false)).content, '');
});

test('the settings sheet reads identity, personality and the model list, and saves in one change', { timeout: 60000 }, async t => {
    const store = new PiSessionStore();
    const profiles = new PiProfileRegistry(store);
    store.profiles = profiles;
    const supervisor = new PiAgentSupervisor();
    t.after(() => supervisor.dispose());
    const asked = [];
    const catalog = async cwd => { asked.push(cwd); return { defaults: { provider: 'fixture', modelId: 'small', thinkingLevel: 'medium' },
        models: [{ provider: 'fixture', modelId: 'small', name: 'Small', thinkingLevels: ['off', 'low'] }, { provider: 'fixture', modelId: 'large', name: 'Large', thinkingLevels: [] }] }; };
    const bots = new BotService({ store, profiles, supervisor, catalog });
    const id = (await bots.create({ expectedRevision: (await profiles.state()).revision })).bot.id;
    const read = await bots.settings(id);
    assert.equal(read.bot.soul, '');
    assert.deepEqual(read.models.models.map(model => model.id), ['small', 'large']);
    assert.equal(read.models.defaults.modelId, 'small');
    assert.equal(asked.length, 1);
    assert.match(asked[0], /OhMyBuddyBots[\\/]bot-/, 'models are listed for the Bot workspace');

    const events = [];
    bots.on('botChanged', event => events.push(event));
    await bots.update(id, { expectedRevision: read.revision, changes: { name: '阿福', soul: '说话简短。', avatar: { kind: 'emoji', value: '🐼' },
        bot: { job: '记账', model: { provider: 'fixture', id: 'large' }, permissions: { preset: 'balanced' }, notify: { quietHours: null } } } });
    assert.deepEqual(events, [{ profileId: id }]);
    const after = await bots.settings(id);
    assert.equal(after.bot.name, '阿福');
    assert.equal(after.bot.soul, '说话简短。');
    assert.deepEqual(after.bot.bot.model, { provider: 'fixture', id: 'large' });
    assert.equal(after.bot.bot.permissions.preset, 'balanced');
    assert.equal(after.bot.bot.notify.quietHours, null);
    await assert.rejects(bots.update(id, { expectedRevision: read.revision, changes: { name: 'x' } }), /changed|revision/i, 'a stale sheet cannot overwrite');

    assert.deepEqual(await bots.readiness(), { models: 2 });
    const failing = new BotService({ store, profiles, supervisor, catalog: async () => { throw new Error('catalog offline'); } });
    assert.deepEqual(await failing.readiness(), { models: null, error: 'catalog offline' }, 'unknown is not "no model"');
    const partial = await failing.settings(id);
    assert.equal(partial.models, null);
    assert.equal(partial.modelsError, 'catalog offline');
});
