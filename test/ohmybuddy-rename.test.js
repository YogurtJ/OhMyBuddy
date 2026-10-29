const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const compat = require('../server/ohmybuddy-compat');
const { normalizeEnvironment, loadLocalEnv } = require('../server/pi-local-env');
const { safeFile } = require('../server/pi-native-service');
function fixture(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ohmybuddy-rename-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}
test('fresh data defaults use OhMyBuddy; a prior namespace is retained without copying and conflicts fail closed', t => {
    const root = fixture(t);
    assert.equal(compat.dataFile(root, 'pivane-workspace.json'), path.join(root, 'ohmybuddy-workspace.json'));
    assert.equal(compat.runtimeDirectory(root), path.join(root, '.ohmybuddy-runtime'));
    fs.mkdirSync(path.join(root, '.pivane-runtime'));
    fs.writeFileSync(path.join(root, '.pivane-runtime/state.json'), 'original');
    assert.equal(compat.runtimeDirectory(root), path.join(root, '.pivane-runtime'));
    assert.equal(fs.existsSync(path.join(root, '.ohmybuddy-runtime')), false);
    fs.mkdirSync(path.join(root, '.ohmybuddy-runtime'));
    assert.throws(() => compat.runtimeDirectory(root), /Conflicting/);
    assert.equal(fs.readFileSync(path.join(root, '.pivane-runtime/state.json'), 'utf8'), 'original');
});
test('private profile roots retain existing data and reject concurrent new/old locations through the real safe-file boundary', t => {
    const root = fixture(t);
    assert.equal(safeFile(root, ['pivane-profiles', 'profiles.json'], true), path.join(root, 'ohmybuddy-profiles/profiles.json'));
    const old = fixture(t); fs.mkdirSync(path.join(old, 'pivane-profiles'));
    fs.writeFileSync(path.join(old, 'pivane-profiles/profiles.json'), '{"original":true}');
    assert.equal(safeFile(old, ['ohmybuddy-profiles', 'profiles.json']), path.join(old, 'pivane-profiles/profiles.json'));
    fs.mkdirSync(path.join(old, 'ohmybuddy-profiles'));
    assert.throws(() => safeFile(old, ['pivane-profiles', 'profiles.json']), /Conflicting/);
});
test('knowledge pending marker and ledger stay in the same existing namespace', t => {
    const root = fixture(t);
    assert.equal(compat.knowledgeFile(root, '.json'), path.join(root, '.ohmybuddy-knowledge.json'));
    fs.writeFileSync(path.join(root, '.pivane-knowledge.pending'), 'original pending operation');
    assert.equal(compat.knowledgeFile(root, '.json'), path.join(root, '.pivane-knowledge.json'));
    fs.writeFileSync(path.join(root, '.ohmybuddy-knowledge.json'), '{}');
    assert.throws(() => compat.knowledgeFile(root, '.pending'), /Conflicting/);
});
test('three environment spellings retain source precedence, clean isolation and native Pi identity', t => {
    const root = fixture(t), file = path.join(root, '.env');
    fs.writeFileSync(file, 'OHMYBUDDY_WEB_TOKEN=file-only\nPIVANE_PROJECT_ROOTS=/from-file\nOHMYBUDDY_RETAIN_RELEASES=7\n');
    const env = { PI_WEB_TOKEN: 'inherited-only', PI_CODING_AGENT_DIR: '/native' };
    loadLocalEnv(file, env);
    assert.equal(env.PI_WEB_TOKEN, 'inherited-only'); assert.equal(env.PI_PROJECT_ROOTS, '/from-file');
    assert.equal(env.PIVANE_RETAIN_RELEASES, '7'); assert.equal(env.PI_CODING_AGENT_DIR, '/native');
    assert.equal(env.OHMYBUDDY_CODING_AGENT_DIR, undefined);
    for (const aliases of [{ OHMYBUDDY_WEB_TOKEN: 'secret-one', PIVANE_WEB_TOKEN: 'secret-two' }, { OHMYBUDDY_WEB_TOKEN: 'secret-one', PI_WEB_TOKEN: 'secret-two' }]) {
        assert.throws(() => normalizeEnvironment(aliases), error => /Conflicting/.test(error.message) && !/secret-one|secret-two/.test(error.message));
    }
    const clean = { OHMYBUDDY_MEDIA_PROFILE: 'clean' }; loadLocalEnv(file, clean);
    assert.equal(clean.PI_WEB_TOKEN, undefined);
    assert.equal(require('../server/pi-file-limits').fileLimits({ OHMYBUDDY_FILE_DOWNLOAD_MAX_MIB: '10' }).downloadBytes, 10 * 1024 ** 2);
    assert.equal(require('../server/pi-managed-retention').retentionLimits({ OHMYBUDDY_RETAIN_RELEASES: '7' }).releases, 7);
});
test('new and legacy installation metadata are explicitly selected and conflicting identities rejected', t => {
    const root = fixture(t);
    fs.writeFileSync(path.join(root, 'PIVANE_INSTALLATION.json'), 'legacy');
    assert.equal(compat.metadataFile(root, 'INSTALLATION'), path.join(root, 'PIVANE_INSTALLATION.json'));
    fs.writeFileSync(path.join(root, 'OHMYBUDDY_INSTALLATION.json'), 'current');
    assert.throws(() => compat.metadataFile(root, 'INSTALLATION'), /Conflicting/);
    assert.equal(compat.packageMetadata({ pivaneBundle: { version: 1 } }, 'Bundle').version, 1);
    assert.throws(() => compat.packageMetadata({ pivaneBundle: {}, ohmybuddyBundle: {} }, 'Bundle'), /Conflicting/);
});
test('both branded private paths remain restricted and legacy attachment image blocks still restore', t => {
    const policy = require('../public/pi-file-policy');
    for (const name of ['ohmybuddy-access.json', 'ohmybuddy-network.json', '.ohmybuddy-runtime/state.json', 'pivane-access.json']) assert.equal(policy.restricted(name), true, name);
    const { SessionImages } = require('../server/pi-session-images');
    const root = fixture(t), store = new SessionImages(root);
    const image = { type: 'image', data: Buffer.from('synthetic-image').toString('base64'), mimeType: 'image/png' };
    const block = store.save(image);
    const legacy = { ...block, text: '[图片已单独保存；Pivane 会在看图时自动读取]' };
    assert.deepEqual(store.restore(legacy), image);
    assert.equal(legacy.text, '[图片已单独保存；Pivane 会在看图时自动读取]');
});
