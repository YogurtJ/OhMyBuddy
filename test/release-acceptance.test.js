const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { rehearsalRoot, rehearsalEnvironment } = require('./release/guard.cjs');
test('release acceptance only accepts its marked temporary directory and exact demo project', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-release-'));
    const original = process.env.PI_RELEASE_RUN_ID;
    t.after(() => { if (original === undefined) delete process.env.PI_RELEASE_RUN_ID; else process.env.PI_RELEASE_RUN_ID = original; fs.rmSync(root, { recursive: true, force: true }); });
    process.env.PI_RELEASE_RUN_ID = randomUUID();
    assert.throws(() => rehearsalRoot(root));
    fs.writeFileSync(path.join(root, '.pivane-release.json'), JSON.stringify({ kind: 'pivane-release-acceptance-v1', runId: randomUUID() }));
    assert.throws(() => rehearsalRoot(root), /identity mismatch/);
    fs.writeFileSync(path.join(root, '.pivane-release.json'), JSON.stringify({ kind: 'pivane-release-acceptance-v1', runId: process.env.PI_RELEASE_RUN_ID }));
    assert.doesNotThrow(() => rehearsalRoot(root));
    assert.doesNotThrow(() => rehearsalRoot(path.join(root, 'projects/demo'), true));
    const runId = process.env.PI_RELEASE_RUN_ID;
    delete process.env.PI_RELEASE_RUN_ID;
    assert.throws(() => rehearsalRoot(root), /explicit release run identity/);
    process.env.PI_RELEASE_RUN_ID = runId;
    fs.writeFileSync(path.join(root, '.pivane-release.json'), JSON.stringify({ kind: 'wrong-kind', runId }));
    assert.throws(() => rehearsalRoot(root));
    assert.throws(() => rehearsalRoot(path.join(root, 'projects/another'), true), /dedicated demo/);
    assert.throws(() => rehearsalRoot(os.tmpdir()), /dedicated temporary/);
    assert.throws(() => rehearsalRoot(path.dirname(root)), /dedicated temporary/);
});
test('release environment keeps native and external lifecycle data inside its marked fixture', t => {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-release-'))), original = process.env.PI_RELEASE_RUN_ID;
    process.env.PI_RELEASE_RUN_ID = randomUUID();
    fs.writeFileSync(path.join(root, '.pivane-release.json'), JSON.stringify({ kind: 'pivane-release-acceptance-v1', runId: process.env.PI_RELEASE_RUN_ID }));
    t.after(() => { if (original === undefined) delete process.env.PI_RELEASE_RUN_ID; else process.env.PI_RELEASE_RUN_ID = original; fs.rmSync(root, { recursive: true, force: true }); });
    const keys = ['PI_CODING_AGENT_DIR', 'PI_MEDIA_CONFIG_DIR', 'PI_MEDIA_DATA_DIR', 'PI_RELEASE_PROJECT_DIR', 'OHMYBUDDY_HOME', 'OHMYBUDDY_WORKSPACES_DIR'];
    const env = Object.fromEntries(keys.map((key, index) => { const directory = path.join(root, 'isolated-' + index); fs.mkdirSync(directory); return [key, directory]; }));
    env.PI_WEB_DEFERRED_FILE = path.join(env.PI_CODING_AGENT_DIR, 'deferred.json');
    env.PI_RELEASE_RUN_ID = process.env.PI_RELEASE_RUN_ID;
    delete process.env.PI_RELEASE_RUN_ID;
    assert.doesNotThrow(() => rehearsalEnvironment(root, env));
    process.env.PI_RELEASE_RUN_ID = env.PI_RELEASE_RUN_ID;
    assert.throws(() => rehearsalEnvironment(root, { ...env, PI_RELEASE_RUN_ID: undefined }), /explicit release run identity/);
    for (const key of keys) {
        assert.throws(() => rehearsalEnvironment(root, { ...env, [key]: undefined }), /explicit isolated/);
        assert.throws(() => rehearsalEnvironment(root, { ...env, [key]: fs.realpathSync.native(os.tmpdir()) }), /escapes release fixture/);
    }
    assert.throws(() => rehearsalEnvironment(root, { ...env, PI_WEB_DEFERRED_FILE: path.join(os.tmpdir(), 'outside.json') }), /escapes release fixture/);
    fs.mkdirSync(env.PI_WEB_DEFERRED_FILE);
    assert.throws(() => rehearsalEnvironment(root, env), /regular file/);
});
