const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-onboarding-steps-')));
const agentDir = path.join(root, 'agent');
fs.mkdirSync(agentDir, { recursive: true });
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_PROJECT_ROOTS = root; process.env.OHMYBUDDY_WORKSPACES_DIR = path.join(root, 'workspaces');
process.env.PI_OFFLINE = '1';
const { PiSessionStore } = require('../server/pi-session-store');
const { PiProfileRegistry } = require('../server/pi-profile-registry');
const { PiAgentSupervisor } = require('../server/pi-agent-supervisor');
const { BotService } = require('../server/bot/bot-service');
const { profileDocuments } = require('../server/pi-profile-documents');
const setup = require('../server/bot/bot-setup');
const { onboardingGuidance } = require('../server/bot/bot-prompt');

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

async function fixture(t) {
    const store = new PiSessionStore();
    const profiles = new PiProfileRegistry(store);
    store.profiles = profiles;
    const supervisor = new PiAgentSupervisor();
    t.after(() => supervisor.dispose());
    const documents = profileDocuments({ profiles, getAgentDir: async () => agentDir, bundlePath: null });
    const bots = new BotService({ store, profiles, supervisor, documents });
    const revision = async () => (await profiles.state()).revision;
    const created = await bots.create({ expectedRevision: await revision() });
    const id = created.bot.id, windowId = created.window.id;
    const { session } = await bots.resolve(id, windowId);
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const manager = SessionManager.open(session.path);
    manager.appendMessage({ role: 'user', content: 'Synthetic onboarding', timestamp: Date.now() });
    let serial = 0;
    const propose = args => {
        const callId = `onboarding-${++serial}`;
        manager.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id: callId, name: setup.SETUP_TOOL, arguments: args }],
            api: 'openai-completions', provider: 'fixture', model: 'small', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'toolUse', timestamp: Date.now() });
        return callId;
    };
    const confirm = async (toolCallId, input = {}) => bots.setup(id, { windowId, toolCallId, expectedRevision: await revision(), ...input });
    const update = async changes => bots.update(id, { changes, expectedRevision: await revision() });
    const onboarding = async action => bots.onboarding(id, { action, expectedRevision: await revision() });
    const record = () => profiles.getProfile(id);
    const listed = async () => (await bots.list()).bots.find(bot => bot.id === id);
    const patchRecord = async change => profiles.reserve(async () => profiles.mutate(await revision(), state => change(state.profiles.find(profile => profile.id === id))));
    return { store, profiles, bots, documents, id, windowId, session, manager, revision, propose, confirm, update, onboarding, record, listed, patchRecord };
}

test('new Bots use the built-in face without treating it as a user choice', { timeout: 60000 }, async t => {
    const f = await fixture(t);
    const before = await f.record();
    assert.deepEqual(before.avatar, { kind: 'preset', id: 'pivane-pebble' });
    assert.equal(before.bot.onboarding.defaultAvatar, 'pivane-pebble');
    assert.deepEqual((await f.listed()).chosen, { name: false, avatar: false });
    assert.deepEqual(before.bot.permissions, { preset: 'free', rules: [] });
    await f.onboarding('restart');
    assert.equal((await f.listed()).chosen.avatar, false, 'restarting does not turn the default into a chosen face');
    await f.confirm(f.propose({ avatar: { kind: 'preset', id: 'pivane-pebble' } }));
    assert.equal((await f.listed()).chosen.avatar, true, 'an explicit same-preset confirmation is still a choice');
    await f.onboarding('restart');
    assert.equal((await f.listed()).chosen.avatar, true, 'the explicit choice survives restart');
});

test('existing preset and legacy default avatars retain their values and choice meaning', { timeout: 60000 }, async t => {
    const f = await fixture(t);
    await f.patchRecord(profile => { delete profile.bot.onboarding.defaultAvatar; });
    const before = await f.record();
    assert.equal((await f.listed()).chosen.avatar, true, 'an older 小石 is an existing choice');
    await f.bots.create({ expectedRevision: await f.revision() });
    assert.deepEqual(await f.record(), before, 'creating a new Bot does not migrate an existing profile');
    await f.onboarding('restart');
    assert.deepEqual((await f.record()).avatar, before.avatar);
    assert.equal((await f.listed()).chosen.avatar, true);
    await f.patchRecord(profile => {
        profile.avatar = { kind: 'emoji', value: '✨' };
        delete profile.bot.chosen;
        profile.bot.onboarding.steps = {};
    });
    assert.equal((await f.listed()).chosen.avatar, false, 'the older default remains unchosen');
    await f.onboarding('restart');
    assert.deepEqual((await f.record()).avatar, { kind: 'emoji', value: '✨' }, 'existing stars are not replaced');
});

test('unchanged workStyle on other cards never answers or skips the work step', { timeout: 60000 }, async t => {
    const f = await fixture(t);
    const saved = await f.confirm(f.propose({ name: 'Cedar', workStyle: 'free' }), { changes: { name: 'Cedar' } });
    assert.deepEqual(saved.saved, { name: 'Cedar' });
    assert.deepEqual(saved.bot.bot.onboarding.steps, { name: 'done' });
    const adopted = await f.confirm(f.propose({ job: 'Organize tasks', workStyle: 'free' }));
    assert.deepEqual(adopted.saved, { job: 'Organize tasks' }, 'default proposal adoption also omits the hidden unchanged mode');
    assert.deepEqual(adopted.bot.bot.onboarding.steps, { name: 'done', job: 'done' });
    const later = await f.confirm(f.propose({ aboutUser: ['Call me Lee'], workStyle: 'free' }), { later: true });
    assert.deepEqual(later.bot.bot.onboarding.steps, { name: 'done', job: 'done', about: 'skipped' });
    assert.deepEqual((await f.record()).bot.permissions, { preset: 'free', rules: [] });
    const work = await f.confirm(f.propose({ workStyle: 'free' }), { changes: {} });
    assert.equal(work.bot.bot.onboarding.steps.work, 'done', 'the dedicated pending card confirms the current mode');
    const duplicate = await f.confirm(f.propose({ workStyle: 'free' }), { later: true });
    assert.deepEqual(duplicate.bot.bot.onboarding.steps, work.bot.bot.onboarding.steps);
});

test('a hidden work selector stays untouched after the retained card meets a changed current mode', { timeout: 60000 }, async t => {
    const f = await fixture(t);
    const call = f.propose({ name: 'Cedar', workStyle: 'free' });
    await f.patchRecord(profile => { profile.bot.permissions.preset = 'ask'; });
    const saved = await f.confirm(call, { changes: { name: 'Cedar' }, workStyleShown: false });
    assert.deepEqual(saved.saved, { name: 'Cedar' });
    assert.deepEqual(saved.bot.bot.onboarding.steps, { name: 'done' });
    assert.equal((await f.record()).bot.permissions.preset, 'ask');
    const later = await f.confirm(f.propose({ job: 'Organize tasks', workStyle: 'free' }), { later: true, workStyleShown: false });
    assert.deepEqual(later.bot.bot.onboarding.steps, { name: 'done', job: 'skipped' }, 'hidden work is not skipped after refresh either');
    assert.equal((await f.record()).bot.permissions.preset, 'ask');
    await assert.rejects(f.confirm(f.propose({ workStyle: 'free' }), { workStyleShown: true }),
        { status: 409, code: 'BOT_WORK_STYLE_FREER' }, 'showing a selector never authorizes more freedom');
});

test('work selector presence is a strict Boolean and cannot invent an unproposed field', { timeout: 60000 }, async t => {
    const f = await fixture(t);
    const call = f.propose({ name: 'Cedar' }), before = await f.record();
    for (const workStyleShown of [true, null, 'false', 0, 1, {}, []])
        await assert.rejects(f.confirm(call, { workStyleShown }), { status: 400 });
    assert.deepEqual(await f.record(), before);
});

test('actual workStyle changes remain effective on mixed cards and retain permission ordering', { timeout: 60000 }, async t => {
    const f = await fixture(t);
    // Older clients may still show the selector on a mixed card; an explicit stricter choice is valid.
    const edited = await f.confirm(f.propose({ job: 'Organize tasks', workStyle: 'free' }),
        { changes: { job: 'Organize tasks', workStyle: 'balanced' } });
    assert.equal(edited.saved.workStyle, 'balanced');
    assert.equal(edited.bot.bot.onboarding.steps.work, 'done');
    const changed = await f.confirm(f.propose({ name: 'Cedar', workStyle: 'ask' }));
    assert.equal(changed.saved.workStyle, 'ask');
    assert.equal((await f.record()).bot.permissions.preset, 'ask');
    const before = await f.record();
    await assert.rejects(f.confirm(f.propose({ name: 'Must not save', workStyle: 'free' })),
        { status: 409, code: 'BOT_WORK_STYLE_FREER' });
    assert.deepEqual(await f.record(), before);
});

test('setup marks only proposed steps; a name never settles the face', { timeout: 60000 }, async t => {
    const f = await fixture(t);
    const result = await f.confirm(f.propose({ name: 'Cedar' }));
    assert.deepEqual(result.saved, { name: 'Cedar' });
    assert.deepEqual(result.bot.bot.onboarding.steps, { name: 'done' });
    assert.equal(result.bot.bot.onboarding.phase, 'interview');
    assert.deepEqual((await f.listed()).chosen, { name: true, avatar: false });
    const partial = await f.confirm(f.propose({ avatar: '🦊', job: 'Organize tasks', personality: 'Be concise.', workStyle: 'balanced' }),
        { changes: { avatar: null, job: 'Organize tasks', personality: '', workStyle: null } });
    assert.deepEqual(partial.saved, { job: 'Organize tasks' });
    assert.deepEqual(partial.bot.bot.onboarding.steps, { name: 'done', avatar: 'skipped', job: 'done', personality: 'skipped', work: 'skipped' });
    assert.deepEqual((await f.listed()).chosen, { name: true, avatar: false }, 'model guesses and skipped faces are not choices');
    const allDropped = await f.confirm(f.propose({ avatar: '🦊', personality: 'Be warm.' }), { changes: {} });
    assert.deepEqual(allDropped.saved, {});
    assert.equal((await f.record()).soul, '');
    assert.equal(allDropped.bot.bot.onboarding.steps.personality, 'skipped');
});

test('later records skipped steps without saving facts, guesses, permissions or finish', { timeout: 60000 }, async t => {
    const f = await fixture(t);
    const before = await f.record();
    const toolCallId = f.propose({ name: 'Cedar', avatar: '🦊', job: 'Organize tasks', personality: 'Be concise.', workStyle: 'ask',
        aboutUser: ['Call me Lee'], finish: true });
    for (const invalid of [{ later: false }, { later: 'true' }, { later: true, changes: {} }, { later: true, changes: null },
        { later: true, picture: 'a'.repeat(64) }]) {
        await assert.rejects(f.confirm(toolCallId, invalid), { status: 400 });
        assert.deepEqual(await f.record(), before, 'invalid combinations write nothing');
    }
    await assert.rejects(f.confirm(toolCallId, { later: true, expectedRevision: 'f'.repeat(64) }), { status: 409 });
    const result = await f.confirm(toolCallId, { later: true });
    assert.equal(result.later, true);
    assert.deepEqual(result.saved, {});
    assert.equal(result.user, undefined);
    const after = await f.record();
    for (const key of ['name', 'avatar', 'soul']) assert.deepEqual(after[key], before[key]);
    assert.equal(after.bot.job, '');
    assert.equal(after.bot.permissions.preset, 'free');
    assert.deepEqual(after.bot.onboarding.steps, { name: 'skipped', avatar: 'skipped', job: 'skipped', personality: 'skipped', work: 'skipped', about: 'skipped' });
    assert.equal(after.bot.onboarding.phase, 'interview');
    assert.equal(after.bot.onboarding.completedAt, null);
    assert.deepEqual((await f.listed()).chosen, { name: false, avatar: false });
    assert.equal((await f.documents.run(f.id, 'user', false)).content, '');
    f.manager.appendMessage({ role: 'toolResult', toolCallId, toolName: setup.SETUP_TOOL, content: [{ type: 'text', text: '{}' }], isError: false, timestamp: Date.now() });
    await assert.rejects(f.confirm(toolCallId, { later: true }), { status: 409, message: /already answered/ });
    assert.deepEqual(await f.record(), after);
    const finishOnly = await f.confirm(f.propose({ finish: true }), { later: true });
    assert.deepEqual(finishOnly.bot.bot.onboarding.steps, after.bot.onboarding.steps);
    assert.equal(finishOnly.bot.bot.onboarding.phase, 'interview');
    const finished = await f.confirm(f.propose({ finish: true }));
    assert.equal(finished.bot.bot.onboarding.phase, 'done');
    assert.ok(finished.bot.bot.onboarding.completedAt);
    const laterAgain = await f.confirm(f.propose({ job: 'Another guess', finish: true }), { later: true });
    assert.equal(laterAgain.bot.bot.onboarding.phase, 'done');
    assert.equal(laterAgain.bot.bot.onboarding.completedAt, finished.bot.bot.onboarding.completedAt);
});

test('same-value confirmations settle steps and choices survive restarting the interview', { timeout: 60000 }, async t => {
    const f = await fixture(t);
    const before = await f.record();
    const proposal = { name: before.name, avatar: before.avatar };
    await f.confirm(f.propose(proposal), { later: true });
    const kept = await f.confirm(f.propose(proposal), { changes: {} });
    assert.deepEqual(kept.saved, {});
    assert.deepEqual(kept.bot.bot.onboarding.steps, { name: 'done', avatar: 'done' });
    await f.confirm(f.propose({ workStyle: 'free' }), { changes: {} });
    assert.deepEqual((await f.listed()).chosen, { name: true, avatar: true });
    const declined = await f.confirm(f.propose({ name: 'Guess', avatar: '🦊', workStyle: 'ask' }), { later: true });
    assert.deepEqual(declined.bot.bot.onboarding.steps, { ...kept.bot.bot.onboarding.steps, work: 'done' }, 'later preserves settled answers');
    await f.onboarding('restart');
    assert.deepEqual((await f.record()).bot.onboarding.steps, {});
    assert.deepEqual((await f.listed()).chosen, { name: true, avatar: true }, 'same-value choices survive cleared steps');
});

test('legacy identity settles both fields and remains chosen after restart', { timeout: 60000 }, async t => {
    const f = await fixture(t);
    await f.patchRecord(profile => { profile.bot.onboarding.steps = { identity: 'done' }; delete profile.bot.chosen; });
    const later = await f.confirm(f.propose({ name: 'Guess', avatar: '🦊', job: 'Organize tasks' }), { later: true });
    assert.deepEqual(later.bot.bot.onboarding.steps, { identity: 'done', job: 'skipped' });
    assert.deepEqual((await f.listed()).chosen, { name: true, avatar: true });
    await f.onboarding('restart');
    assert.deepEqual((await f.record()).bot.onboarding.steps, {});
    assert.deepEqual((await f.listed()).chosen, { name: true, avatar: true }, 'legacy choices of the defaults must not become guesses again');
});

test('workStyle confirmations may keep or tighten permissions, never loosen them', { timeout: 60000 }, async t => {
    const f = await fixture(t);
    const result = await f.confirm(f.propose({ workStyle: 'balanced' }));
    assert.equal(result.saved.workStyle, 'balanced');
    assert.equal((await f.record()).bot.permissions.preset, 'balanced');
    assert.equal(result.bot.bot.onboarding.steps.work, 'done');
    const before = await f.record();
    await assert.rejects(f.confirm(f.propose({ name: 'Must not save either', workStyle: 'free' })), { status: 409, code: 'BOT_WORK_STYLE_FREER' });
    assert.deepEqual(await f.record(), before, 'a freer preset rejects the whole mutation');
    await f.confirm(f.propose({ workStyle: 'ask' }));
    await assert.rejects(f.confirm(f.propose({ workStyle: 'balanced' })), { status: 409, code: 'BOT_WORK_STYLE_FREER' });
    assert.equal((await f.record()).bot.permissions.preset, 'ask');
    await f.patchRecord(profile => { delete profile.bot.permissions; });
    await f.confirm(f.propose({ workStyle: 'balanced' }));
    assert.equal((await f.record()).bot.permissions.preset, 'balanced', 'missing permissions uses the normalized legacy default');
    await f.patchRecord(profile => { profile.bot.permissions.preset = 'unknown'; });
    const invalid = await f.record();
    await assert.rejects(f.confirm(f.propose({ workStyle: 'free' })), { status: 404 });
    assert.deepEqual(await f.record(), invalid, 'invalid persisted permissions are not silently repaired to freer permissions');
});

test('workStyle ordering fails closed for unknown current or proposed presets', () => {
    for (const [currentIndex, current] of setup.WORK_STYLES.entries())
        for (const [nextIndex, next] of setup.WORK_STYLES.entries())
            assert.equal(setup.moreCareful(next, current), nextIndex >= currentIndex, `${current} -> ${next}`);
    for (const unknown of [undefined, null, '', 'unknown', {}, 1]) {
        assert.equal(setup.moreCareful('free', unknown), false);
        assert.equal(setup.moreCareful('balanced', unknown), false);
        assert.equal(setup.moreCareful('ask', unknown), true);
        assert.equal(setup.moreCareful(unknown, 'free'), false);
        assert.equal(setup.moreCareful(unknown, unknown), false);
    }
    assert.throws(() => setup.normalizeProposal({ workStyle: 'unknown' }), /workStyle/);
});

test('settings marks only edited steps during greeting or interview; uploaded pictures count as chosen', { timeout: 60000 }, async t => {
    const f = await fixture(t);
    const before = await f.record();
    await f.update({ name: before.name, soul: before.soul, avatar: before.avatar, bot: { job: '', permissions: { preset: 'free' } } });
    assert.deepEqual((await f.record()).bot.onboarding.steps, {}, 'saving a full default settings form does not invent choices');
    await f.update({ name: 'Cedar' });
    assert.deepEqual((await f.record()).bot.onboarding.steps, { name: 'done' });
    await f.onboarding('start');
    await f.update({ soul: 'Be concise.', bot: { job: 'Organize tasks', permissions: { preset: 'balanced' } } });
    assert.deepEqual((await f.record()).bot.onboarding.steps, { name: 'done', personality: 'done', job: 'done', work: 'done' });
    const version = 'c'.repeat(64);
    await f.patchRecord(profile => { profile.bot.onboarding.steps.avatar = 'skipped'; });
    await f.profiles.saveAvatar(f.id, await f.revision(), version, async () => () => {});
    await f.update({ avatar: { kind: 'image', version } });
    assert.equal((await f.record()).bot.onboarding.steps.avatar, 'done');
    assert.equal((await f.record()).bot.chosen.avatar, true, 'saving the already uploaded picture is an explicit face choice');
    await assert.rejects(f.update({ avatar: { kind: 'image', version: 'd'.repeat(64) } }), /must be uploaded/);
    for (const phase of ['done', 'skipped']) {
        await f.patchRecord(profile => { profile.bot.onboarding.phase = phase; profile.bot.onboarding.steps = {}; });
        await f.update({ name: `Cedar ${phase}`, avatar: { kind: 'emoji', value: '🦊' }, soul: phase,
            bot: { job: phase, permissions: { preset: phase === 'done' ? 'ask' : 'free' } } });
        assert.deepEqual((await f.record()).bot.onboarding.steps, {}, `settings leaves ${phase} interview steps alone`);
        assert.equal((await f.record()).bot.onboarding.phase, phase);
    }
    await f.onboarding('restart');
    assert.deepEqual((await f.listed()).chosen, { name: true, avatar: true });
});

test('setup reserves before awaits and stale revisions cannot overwrite concurrent settings', { timeout: 60000 }, async t => {
    const f = await fixture(t);
    const toolCallId = f.propose({ name: 'Guess', aboutUser: ['Call me Lee'] });
    const originalRead = f.store.withSessionRead.bind(f.store);
    let releaseRead, signalRead;
    const blocked = new Promise(resolve => { signalRead = resolve; });
    const released = new Promise(resolve => { releaseRead = resolve; });
    f.store.withSessionRead = async (...args) => { signalRead(); await released; return originalRead(...args); };
    const expectedRevision = await f.revision();
    const pending = f.bots.setup(f.id, { windowId: f.windowId, toolCallId, expectedRevision });
    assert.equal(f.profiles.busy, true, 'reservation is synchronous');
    assert.throws(() => f.bots.update(f.id, { expectedRevision, changes: { name: 'Concurrent' } }), { status: 409 });
    await blocked;
    // Model an out-of-process registry replacement while the native transcript is being read.
    await f.profiles.mutate(expectedRevision, state => { state.profiles.find(profile => profile.id === f.id).name = 'Other client'; });
    releaseRead();
    await assert.rejects(pending, { status: 409 });
    assert.equal(f.profiles.busy, false);
    assert.equal((await f.record()).name, 'Other client');
    assert.deepEqual((await f.record()).bot.onboarding.steps, {});
    assert.equal((await f.documents.run(f.id, 'user', false)).content, '');
    f.store.withSessionRead = originalRead;
});

test('failed about-user writes restore only their progress and finish while keeping identity changes', { timeout: 60000 }, async t => {
    for (const [about, phase, throws] of [[undefined, 'greeting', false], ['skipped', 'interview', true], ['done', 'interview', false], [undefined, 'done', true]]) {
        await t.test(`${phase}, previous about=${about}, write ${throws ? 'throws' : 'returns false'}`, async t => {
            const f = await fixture(t);
            const completedAt = phase === 'done' ? '2026-01-01T00:00:00.000Z' : null;
            await f.patchRecord(profile => {
                profile.bot.onboarding.phase = phase;
                profile.bot.onboarding.completedAt = completedAt;
                profile.bot.onboarding.steps = { job: 'skipped', ...(about ? { about } : {}) };
            });
            let firstRecord, writeCount = 0;
            const mutations = [];
            const mutate = f.profiles.mutate.bind(f.profiles);
            f.profiles.mutate = async (...args) => {
                assert.equal(f.profiles.busy, true, 'both profile mutations run inside the reservation');
                const result = await mutate(...args);
                mutations.push({ expected: args[0], revision: result.revision });
                return result;
            };
            f.bots.documents = { async run(id, target, write, input) {
                if (!write) { firstRecord = await f.record(); return f.documents.run(id, target, false); }
                writeCount++;
                assert.equal(f.profiles.busy, true);
                assert.match(input.content, /Call me Lee/);
                if (throws) throw new Error('Synthetic document write failed');
                return { documentSaved: false, error: 'Synthetic document write failed' };
            } };
            const events = [];
            f.bots.on('botChanged', event => events.push(event));
            const result = await f.confirm(f.propose({ name: 'Cedar', avatar: '🦊', aboutUser: ['Call me Lee'], finish: true }));
            assert.equal(result.user.documentSaved, false);
            assert.match(result.user.error, /Synthetic document write failed/);
            assert.equal(writeCount, 1);
            assert.equal(mutations.length, 2);
            assert.equal(mutations[1].expected, mutations[0].revision, 'correction uses the first mutation revision');
            assert.equal(result.revision, mutations[1].revision);
            assert.equal(result.revision, await f.revision(), 'response reports the corrected revision');
            assert.deepEqual(events, [{ profileId: f.id }], 'emit once after correction');
            const after = await f.record();
            assert.equal(after.name, 'Cedar');
            assert.deepEqual(after.avatar, { kind: 'emoji', value: '🦊' });
            assert.deepEqual(after.bot.onboarding.steps, { job: 'skipped', name: 'done', avatar: 'done', ...(about ? { about } : {}) });
            assert.equal(after.bot.onboarding.phase, phase);
            assert.equal(after.bot.onboarding.completedAt, completedAt);
            assert.deepEqual(result.bot.bot.onboarding, after.bot.onboarding);
            assert.equal((await f.documents.run(f.id, 'user', false)).content, '');
            assert.equal(result.progressReverted, undefined);
            firstRecord.bot.onboarding = after.bot.onboarding;
            assert.deepEqual(after, firstRecord, 'no other field changes in the correction');
        });
    }
});

test('duplicate about-user facts succeed without writing and keep finish applied', { timeout: 60000 }, async t => {
    const f = await fixture(t);
    f.bots.documents = { async run(_id, _target, write) {
        assert.equal(write, false, 'duplicates do not write the document again');
        return { status: 'ready', content: 'Call me Lee' };
    } };
    const result = await f.confirm(f.propose({ aboutUser: ['Call me Lee'], finish: true }));
    assert.deepEqual(result.user, { added: [], documentSaved: true });
    assert.equal(result.bot.bot.onboarding.steps.about, 'done');
    assert.equal(result.bot.bot.onboarding.phase, 'done');
    assert.equal(result.revision, await f.revision());
});

test('a failed progress correction returns the saved identity and an explicit flag', { timeout: 60000 }, async t => {
    const f = await fixture(t);
    f.bots.documents = { async run(_id, _target, write) {
        return write ? { documentSaved: false } : { status: 'ready', content: '' };
    } };
    const mutate = f.profiles.mutate.bind(f.profiles);
    let calls = 0;
    f.profiles.mutate = (...args) => {
        if (++calls === 2) throw new Error('Synthetic correction failure');
        return mutate(...args);
    };
    const events = [];
    f.bots.on('botChanged', event => events.push(event));
    const result = await f.confirm(f.propose({ name: 'Cedar', aboutUser: ['Call me Lee'], finish: true }));
    assert.equal(calls, 2);
    assert.equal(result.ok, true);
    assert.equal(result.user.documentSaved, false);
    assert.equal(result.progressReverted, false);
    assert.equal(result.bot.name, 'Cedar');
    assert.equal(result.revision, await f.revision());
    assert.equal((await f.record()).name, 'Cedar');
    assert.deepEqual(events, [{ profileId: f.id }]);
    assert.equal(f.profiles.busy, false, 'the reservation is released even when correction fails');
});

test('onboarding prompt renders only remaining steps, including legacy and partial state', () => {
    const guide = (steps, phase = 'interview', kind = 'main') => onboardingGuidance({ onboarding: { phase, steps } }, { kind });
    const remaining = text => text.split('\n').filter(line => /^  \d+\./.test(line));
    assert.equal(remaining(guide({})).length, 5);
    assert.doesNotMatch(remaining(guide({})).join('\n'), /Your face:|avatar|emoji/);
    const legacy = remaining(guide({ identity: 'done' })).join('\n');
    assert.doesNotMatch(legacy, /Your name:|Your face:/);
    assert.match(legacy, /Your personality:/);
    assert.match(remaining(guide({ identity: 'skipped' })).join('\n'), /Your name:/);
    const partial = remaining(guide({ about: 'done', job: 'skipped', name: 'done' }));
    assert.equal(partial.length, 2);
    assert.match(partial[0], /^  1\. Your personality:/);
    assert.match(partial[1], /^  2\. How you work:/);
    const allDone = guide({ about: 'done', job: 'done', name: 'done', avatar: 'skipped', personality: 'done', work: 'skipped' });
    assert.deepEqual(remaining(allDone), []);
    assert.doesNotMatch(allDone, /Steps still to do/);
    assert.match(allDone, /finish=true/);
    assert.equal(guide({}, 'done'), '');
    assert.equal(guide({}, 'skipped'), '');
    assert.equal(guide({}, 'interview', 'topic'), '');
});
