const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-avatar-presets-')));
const agentDir = path.join(root, 'agent');
fs.mkdirSync(agentDir);
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_PROJECT_ROOTS = root; process.env.OHMYBUDDY_WORKSPACES_DIR = path.join(root, 'workspaces');
process.env.PI_OFFLINE = '1';
const catalog = require('../public/pi-avatar-presets');
const { PiSessionStore } = require('../server/pi-session-store');
const { PiProfileRegistry } = require('../server/pi-profile-registry');
const { readProfileRuntime } = require('../server/pi-profile-runtime');
const { PiAgentSupervisor } = require('../server/pi-agent-supervisor');
const { BotService } = require('../server/bot/bot-service');
const { mountProfileAvatarRoutes } = require('../server/pi-profile-avatar');
const setup = require('../server/bot/bot-setup');
const preset = id => ({ kind: 'preset', id });
const basic = { name: 'Synthetic friend', description: '', soul: 'Be concise.', enabled: true };
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

async function fixture(t) {
    const store = new PiSessionStore(), profiles = new PiProfileRegistry(store), supervisor = new PiAgentSupervisor();
    store.profiles = profiles;
    t.after(() => supervisor.dispose());
    const bots = new BotService({ store, profiles, supervisor });
    const revision = async () => (await profiles.state()).revision;
    const save = async profile => profiles.save({ expectedRevision: await revision(), profile });
    const update = async (id, changes) => bots.update(id, { expectedRevision: await revision(), changes });
    return { store, profiles, bots, revision, save, update };
}

test('composed avatars persist through Bot edits, profile runtime and missing-part tolerance', async t => {
    const f = await fixture(t);
    const avatar = { ...catalog.find('ohmybuddy-sprout').recipe, eyes: 'display' };
    const created = await f.bots.create({ expectedRevision: await f.revision() });
    await f.update(created.bot.id, { avatar });
    await f.update(created.bot.id, { name: 'Composed friend', soul: 'Remember this identity.' });
    assert.deepEqual((await f.bots.settings(created.bot.id)).bot.avatar, avatar);
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const { session } = await f.bots.resolve(created.bot.id, created.window.id);
    const manager = SessionManager.open(session.path), cwd = manager.getCwd();
    const context = await f.profiles.context(manager, cwd);
    assert.equal(readProfileRuntime(manager, cwd, agentDir, path.join(agentDir, 'sessions'), JSON.stringify(context)).soul, 'Remember this identity.');
    const { file } = await f.profiles.paths();
    const missing = { ...avatar, eyes: 'future-eyes', version: 2 };
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    state.profiles.find(p => p.id === created.bot.id).avatar = missing;
    fs.writeFileSync(file, JSON.stringify(state));
    await f.update(created.bot.id, { soul: 'Keep unknown parts.' });
    await f.update(created.bot.id, { avatar: { ...missing } });
    assert.deepEqual((await f.profiles.getProfile(created.bot.id)).avatar, missing);
    await assert.rejects(f.update(created.bot.id, { avatar: { ...missing, eyes: 'other-future' } }), /Invalid avatar/);
    await f.update(created.bot.id, { avatar });
    const before = await f.revision();
    for (const bad of [{ ...avatar, eyes: '../x' }, { ...avatar, version: '1' }, { ...avatar, svg: '<svg/>' },
        { ...avatar, shape: 'drop', decoration: 'sprout' }, { ...avatar, palette: 'not-a-palette' }])
        await assert.rejects(f.update(created.bot.id, { avatar: bad }), /Invalid avatar/);
    assert.equal(await f.revision(), before);
});

test('combination resolution is stable and randomization respects locks and compatibility', () => {
    const current = catalog.find('ohmybuddy-sprout').recipe;
    assert.ok(Object.isFrozen(current));
    for (let seed = 0; seed < 100; seed++) {
        const value = catalog.randomize(current, ['decoration', 'palette'], String(seed));
        assert.equal(value.decoration, current.decoration);
        assert.equal(value.palette, current.palette);
        assert.ok(catalog.knownComposition(value));
        assert.deepEqual(value, catalog.randomize(current, ['decoration', 'palette'], String(seed)));
    }
    assert.deepEqual(catalog.randomize(current, catalog.fields, 'anything'), current);
    assert.equal(catalog.resolve({ ...current, version: 2 }), null);
    assert.equal(catalog.same(current, Object.fromEntries(Object.entries(current).reverse())), true);
});

const malformed = [
    { kind: 'preset' }, { kind: 'preset', id: null }, { kind: 'preset', id: 1 },
    preset('../pivane-bean'), preset('pivane-../bean'), preset('pivane-bean.svg'), preset('pivane-Bean'),
    preset('<svg onload="alert(1)"/>'), preset('pivane-' + 'a'.repeat(80)),
    { ...preset('pivane-bean'), value: '🦊' }, { ...preset('pivane-bean'), version: 'a'.repeat(64) },
    { ...preset('pivane-bean'), svg: '<svg/>' }, { ...preset('pivane-bean'), extra: true },
    { kind: 'emoji', value: '🦊', id: 'pivane-bean' }, { kind: 'image', version: 'a'.repeat(64), id: 'pivane-bean' },
    ['preset', 'pivane-bean'], '<svg/>', { kind: 'image', id: 'pivane-bean' }
];

test('all built-in presets persist through refresh, unrelated saves, trash and profile runtime validation', async t => {
    const f = await fixture(t);
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    for (const { id } of catalog.presets) {
        const created = await f.save({ ...basic, avatar: preset(id) });
        const profileId = created.profile.id;
        assert.deepEqual((await new PiProfileRegistry(f.store).getProfile(profileId)).avatar, preset(id));
        const renamed = await f.save({ ...created.profile, name: 'Renamed', avatar: undefined });
        const changed = await f.save({ ...renamed.profile, soul: 'Be warm.' });
        assert.deepEqual(changed.profile.avatar, preset(id));
        const trashed = await f.profiles.trash(profileId, { expectedRevision: await f.revision() });
        assert.deepEqual((await f.profiles.list()).trash.find(item => item.id === profileId).avatar, preset(id));
        assert.deepEqual((await f.profiles.restore(profileId, { expectedRevision: trashed.revision })).profile.avatar, preset(id));
        assert.deepEqual((await f.profiles.list()).profiles.find(item => item.id === profileId).avatar, preset(id));
        const cwd = f.store.defaultProject();
        const session = await f.store.createSession(cwd, 'Preset runtime', { agentProfileId: profileId });
        const manager = SessionManager.open(session.path);
        const context = await f.profiles.context(manager, cwd);
        const runtime = readProfileRuntime(manager, cwd, agentDir, path.join(agentDir, 'sessions'), JSON.stringify(context));
        assert.equal(runtime.soul, 'Be warm.', 'a preset must not invalidate the whole profile context');
    }
});

test('unknown well-formed references survive reads and unchanged writes, but cannot be newly selected', async t => {
    const f = await fixture(t);
    const created = await f.save({ ...basic, avatar: preset('pivane-bean') });
    const unknown = preset('pivane-missing-asset');
    const { file } = await f.profiles.paths();
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    state.profiles.find(item => item.id === created.profile.id).avatar = unknown;
    fs.writeFileSync(file, JSON.stringify(state));
    const loaded = await f.profiles.getProfile(created.profile.id);
    assert.deepEqual(loaded.avatar, unknown);
    const renamed = await f.save({ ...loaded, name: 'Still available', avatar: undefined });
    assert.deepEqual(renamed.profile.avatar, unknown);
    assert.deepEqual((await f.save({ ...renamed.profile, soul: 'Keep this reference.' })).profile.avatar, unknown);
    const before = await f.revision();
    await assert.rejects(f.save({ ...basic, avatar: unknown }), /Invalid avatar/);
    await assert.rejects(f.save({ ...loaded, avatar: preset('pivane-other-missing') }), /Invalid avatar/);
    assert.equal(await f.revision(), before);
    const trashed = await f.profiles.trash(loaded.id, { expectedRevision: before });
    assert.deepEqual((await f.profiles.list()).trash.find(item => item.id === loaded.id).avatar, unknown);
    assert.deepEqual((await f.profiles.restore(loaded.id, { expectedRevision: trashed.revision })).profile.avatar, unknown);
});

test('malformed and mixed preset avatars reject both writes and registry reads without losing saved choices', async t => {
    const f = await fixture(t);
    const saved = await f.save({ ...basic, avatar: preset('pivane-tile') });
    const { file } = await f.profiles.paths();
    const original = fs.readFileSync(file, 'utf8');
    for (const avatar of malformed) {
        await assert.rejects(f.save({ ...saved.profile, avatar }), /Invalid avatar/, JSON.stringify(avatar));
        assert.equal(fs.readFileSync(file, 'utf8'), original);
        const state = JSON.parse(original);
        state.profiles.find(item => item.id === saved.profile.id).avatar = avatar;
        fs.writeFileSync(file, JSON.stringify(state));
        try { await assert.rejects(f.profiles.state(), /Profile registry is invalid/, JSON.stringify(avatar)); }
        finally { fs.writeFileSync(file, original); }
    }
    assert.deepEqual((await f.profiles.getProfile(saved.profile.id)).avatar, preset('pivane-tile'));
});

function png() {
    const crc = bytes => { let n = -1; for (const byte of bytes) { n ^= byte;
        for (let i = 0; i < 8; i++) n = n >>> 1 ^ (n & 1 ? 0xedb88320 : 0); } return (n ^ -1) >>> 0; };
    const chunk = (type, data) => { const size = Buffer.alloc(4), tail = Buffer.alloc(4), raw = Buffer.concat([Buffer.from(type), data]);
        size.writeUInt32BE(data.length); tail.writeUInt32BE(crc(raw)); return Buffer.concat([size, raw, tail]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))]);
}

test('PNG upload switches a preset only after CAS, keeps private assets and never serves a preset as a picture', async t => {
    const f = await fixture(t);
    let saved = await f.save({ ...basic, avatar: preset('pivane-pebble') });
    const id = saved.profile.id, routes = new Map();
    mountProfileAvatarRoutes({ get(route, fn) { routes.set('GET', fn); }, post(route, fn) { routes.set('POST', fn); } },
        { profiles: f.profiles, getAgentDir: async () => agentDir });
    const call = async (method, body = {}, query = {}) => {
        const res = { statusCode: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(code) { this.statusCode = code; return this; },
            type() { return this; }, json(value) { this.data = value; }, send(value) { this.data = value; } };
        await routes.get(method)({ params: { id }, body, query }, res);
        assert.equal(res.headers['Cache-Control'], 'no-store');
        return res;
    };
    const image = png(), dataUrl = `data:image/png;base64,${image.toString('base64')}`;
    assert.equal((await call('POST', { expectedRevision: 'stale', dataUrl })).statusCode, 409);
    assert.deepEqual((await f.profiles.getProfile(id)).avatar, preset('pivane-pebble'));
    const uploaded = await call('POST', { expectedRevision: await f.revision(), dataUrl });
    assert.equal(uploaded.statusCode, 200);
    const { version } = uploaded.data.profile.avatar;
    assert.deepEqual((await call('GET', {}, { version })).data, image);
    const asset = path.join(require('../server/pi-profile-documents').location(agentDir, id, false), `avatar-${version}.png`);
    saved = await f.save({ ...uploaded.data.profile, avatar: preset('pivane-bean') });
    assert.equal((await call('GET', {}, { version })).statusCode, 404);
    assert.deepEqual(fs.readFileSync(asset), image, 'switching away never deletes a private image');
    saved = await f.save({ ...saved.profile, avatar: { kind: 'emoji', value: '🦊' } });
    assert.deepEqual(saved.profile.avatar, { kind: 'emoji', value: '🦊' });
    saved = await f.save({ ...saved.profile, avatar: null });
    assert.equal(saved.profile.avatar, null);
    await assert.rejects(f.save({ ...saved.profile, avatar: { kind: 'image', version } }), /must be uploaded/);
    assert.equal((await call('POST', { expectedRevision: await f.revision(), dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' })).statusCode, 400);
    assert.equal((await call('POST', { expectedRevision: await f.revision(), dataUrl })).statusCode, 200, 'the retained PNG can be uploaded again');
});

test('Bot presets stay chosen through setup, unrelated edits and interview restart, including missing catalog entries', async t => {
    const f = await fixture(t);
    const created = await f.bots.create({ expectedRevision: await f.revision() });
    const id = created.bot.id, windowId = created.window.id;
    const { session } = await f.bots.resolve(id, windowId);
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const manager = SessionManager.open(session.path);
    manager.appendMessage({ role: 'user', content: 'Synthetic preset choices', timestamp: Date.now() });
    let serial = 0;
    const confirm = async (proposal, input = {}) => {
        const toolCallId = `preset-${++serial}`;
        manager.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id: toolCallId, name: setup.SETUP_TOOL, arguments: proposal }],
            api: 'openai-completions', provider: 'fixture', model: 'small', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'toolUse', timestamp: Date.now() });
        return f.bots.setup(id, { expectedRevision: await f.revision(), windowId, toolCallId, ...input });
    };
    for (const { id: presetId } of catalog.presets) {
        // An old client's emoji proposal can be answered with a built-in face.
        const selected = preset(presetId);
        assert.deepEqual((await confirm({ avatar: '🦊' }, { changes: { avatar: selected } })).bot.avatar, selected);
        assert.deepEqual((await confirm({ avatar: selected })).saved, { avatar: selected });
        await f.update(id, { name: `Friend ${presetId}`, soul: 'Speak warmly.' });
        assert.deepEqual((await f.bots.settings(id)).bot.avatar, selected);
        await f.bots.onboarding(id, { action: 'restart', expectedRevision: await f.revision() });
        assert.equal((await f.bots.list()).bots.find(item => item.id === id).chosen.avatar, true);
        assert.deepEqual((await f.profiles.getProfile(id)).bot.onboarding.steps, {});
        await confirm({ avatar: { id: presetId, kind: 'preset' } }, { changes: {} });
        assert.equal((await f.profiles.getProfile(id)).bot.onboarding.steps.avatar, 'done', 'same preset by value settles its step');
        await confirm({ avatar: '🐼', personality: 'Be concise.' }, { changes: { personality: 'Be concise.' } });
        assert.deepEqual((await f.profiles.getProfile(id)).avatar, selected, 'a later card keeps the chosen face');
    }
    await f.update(id, { avatar: { kind: 'emoji', value: '🐼' } });
    assert.deepEqual((await f.profiles.getProfile(id)).avatar, { kind: 'emoji', value: '🐼' });
    await f.update(id, { avatar: preset('pivane-tile') });
    const version = 'a'.repeat(64);
    await assert.rejects(confirm({ avatar: preset('pivane-bean') }, { picture: version }), { code: 'BOT_PICTURE_CHANGED' });
    await f.profiles.saveAvatar(id, await f.revision(), version, async () => () => {});
    await confirm({ avatar: preset('pivane-bean') }, { picture: version });
    assert.deepEqual((await f.profiles.getProfile(id)).avatar, { kind: 'image', version });
    await confirm({ avatar: preset('pivane-bean') });
    const unknown = preset('pivane-unavailable');
    await f.profiles.reserve(async () => f.profiles.mutate(await f.revision(), state => {
        const profile = state.profiles.find(item => item.id === id);
        profile.avatar = unknown;
        delete profile.bot.chosen;
        profile.bot.onboarding.steps = {};
    }));
    assert.equal((await f.bots.list()).bots.find(item => item.id === id).chosen.avatar, true, 'any persisted preset counts as chosen');
    await f.update(id, { name: 'Keep unknown', soul: 'Still available.' });
    await f.update(id, { avatar: { id: unknown.id, kind: 'preset' } });
    await confirm({ personality: 'Name and personality only.' });
    assert.deepEqual((await f.profiles.getProfile(id)).avatar, unknown);
    await f.bots.onboarding(id, { action: 'restart', expectedRevision: await f.revision() });
    assert.equal((await f.bots.list()).bots.find(item => item.id === id).chosen.avatar, true);
    for (const avatar of [preset('pivane-new-unknown'), ...malformed])
        await assert.rejects(f.update(id, { avatar }), /Invalid avatar/);
    await assert.rejects(confirm({ avatar: preset('pivane-new-unknown') }), /Invalid preset avatar/);
    await assert.rejects(confirm({ avatar: '🦊' }, { changes: { avatar: unknown } }), /Invalid preset avatar/);
});

test('setup proposals accept legacy emoji or exact known preset objects only', () => {
    for (const { id } of catalog.presets) {
        const avatar = preset(id);
        assert.deepEqual(setup.normalizeProposal({ avatar }), { avatar });
        assert.deepEqual(setup.confirmedChanges({ avatar: '🦊' }, { avatar }), { avatar });
    }
    assert.deepEqual(setup.normalizeProposal({ avatar: ' 🦊 ' }), { avatar: '🦊' });
    for (const avatar of [preset('pivane-unknown'), ...malformed]) assert.throws(() => setup.normalizeProposal({ avatar }), undefined, JSON.stringify(avatar));
});
