'use strict';
// M4-5b: an existing assistant identity becomes a Bot. The profile keeps its name, face,
// personality and memory, gets a private workspace and a main chat, and its first chat only asks
// what is still open. Earlier sessions keep their identity; nothing is moved or deleted.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-from-profile-')));
const agentDir = path.join(root, 'agent');
fs.mkdirSync(agentDir, { recursive: true });
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_PROJECT_ROOTS = root;
process.env.PI_OFFLINE = '1';
const { PiSessionStore } = require('../server/pi-session-store');
const { PiProfileRegistry } = require('../server/pi-profile-registry');
const { PiAgentSupervisor } = require('../server/pi-agent-supervisor');
const { BotService } = require('../server/bot/bot-service');
const { onboardingGuidance } = require('../server/bot/bot-prompt');

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('an identity becomes a Bot once, keeping what it is; ineligible identities are refused', { timeout: 60000 }, async t => {
    const store = new PiSessionStore();
    const profiles = new PiProfileRegistry(store);
    store.profiles = profiles;
    const supervisor = new PiAgentSupervisor();
    t.after(() => supervisor.dispose());
    const bots = new BotService({ store, profiles, supervisor });
    const revision = async () => (await profiles.state()).revision;
    const save = async profile => (await profiles.save({ expectedRevision: await revision(), profile })).profile;
    const tutor = await save({ name: '数学老师', description: '陪我学数学', soul: '说话耐心，先问思路。', enabled: true, avatar: { kind: 'emoji', value: '📐' } });
    const plain = await save({ name: '写作', description: '', soul: '', enabled: true });
    const off = await save({ name: '停用的', description: '', soul: '', enabled: false });
    // An earlier conversation with the identity, in a real project folder.
    const project = path.join(root, 'project'); fs.mkdirSync(project);
    const earlier = await store.createSession(project, '旧对话', { agentProfileId: tutor.id });

    const events = [];
    bots.on('botChanged', event => events.push(event));
    await assert.rejects(bots.fromProfile({ profileId: tutor.id, expectedRevision: 'f'.repeat(64) }), /changed|revision/i, 'a stale page changes nothing');
    assert.equal((await profiles.getProfile(tutor.id)).bot, undefined);
    const made = await bots.fromProfile({ profileId: tutor.id, expectedRevision: await revision() });
    assert.equal(made.ok, true);
    assert.equal(made.window.kind, 'main');
    assert.deepEqual(events, [{ profileId: tutor.id }]);
    const saved = await profiles.getProfile(tutor.id);
    assert.deepEqual([saved.name, saved.description, saved.soul, saved.avatar], ['数学老师', '陪我学数学', '说话耐心，先问思路。', { kind: 'emoji', value: '📐' }], 'nothing about it is replaced');
    assert.match(saved.bot.workspace, /OhMyBuddyBots[\\/]bot-/);
    assert.equal(fs.statSync(saved.bot.workspace).isDirectory(), true);
    const onboarding = saved.bot.onboarding;
    assert.deepEqual([onboarding.phase, onboarding.converted, onboarding.flowVersion], ['greeting', true, 2]);
    assert.deepEqual(onboarding.steps, { name: 'done', avatar: 'done', known: 'done', personality: 'done' });
    const listed = (await bots.list()).bots.find(bot => bot.id === tutor.id);
    assert.deepEqual(listed.chosen, { name: true, avatar: true });
    assert.equal(listed.windows.length, 1);
    // The first chat asks only what is open and does not present itself as new.
    const guidance = onboardingGuidance(saved.bot, { kind: 'main' });
    assert.match(guidance, /assistant identity before/);
    assert.doesNotMatch(guidance, /Your name:|Your personality:/);
    assert.match(guidance, /What they mainly want your help with/);
    assert.match(guidance, /memory from before/);
    // Its earlier conversation still belongs to it, untouched.
    const reread = await store.getSession(project, earlier.id);
    assert.equal(reread.agentProfile?.id, tutor.id);
    assert.equal(reread.cwd, project);

    // A second time, a disabled identity, a missing one: refused, nothing changes.
    await assert.rejects(bots.fromProfile({ profileId: tutor.id, expectedRevision: await revision() }), error => error.code === 'PROFILE_ALREADY_BOT');
    await assert.rejects(bots.fromProfile({ profileId: off.id, expectedRevision: await revision() }), error => error.code === 'PROFILE_DISABLED');
    await assert.rejects(bots.fromProfile({ profileId: '00000000-0000-4000-8000-000000000000', expectedRevision: await revision() }), error => error.status === 404);
    await assert.rejects(bots.fromProfile({ profileId: 'nope', expectedRevision: await revision() }), /Invalid/);
    await assert.rejects(bots.fromProfile({ profileId: plain.id }), /Expected revision/);
    assert.equal((await profiles.getProfile(off.id)).bot, undefined);
    // Without a personality, that step stays open.
    await bots.fromProfile({ profileId: plain.id, expectedRevision: await revision() });
    assert.equal((await profiles.getProfile(plain.id)).bot.onboarding.steps.personality, undefined);
    assert.match(onboardingGuidance((await profiles.getProfile(plain.id)).bot, { kind: 'main' }), /Your personality:/);
    assert.deepEqual((await bots.list()).bots.map(bot => bot.id), [tutor.id, plain.id], 'in the order they became Bots');
});
