const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
function rehearsalRoot(value, project = false, runId = process.env.PI_RELEASE_RUN_ID) {
    const normalized = String(value).replace(/\\/g, '/');
    const root = project ? normalized.replace(/\/projects\/demo$/, '') : normalized;
    assert.ok(!project || root !== normalized, 'dedicated demo project required');
    const temp = fs.realpathSync.native(os.tmpdir());
    const actual = fs.realpathSync.native(root);
    const relative = path.relative(temp, actual);
    assert.match(relative, /^pivane-release-[A-Za-z0-9_-]+$/, 'dedicated temporary release directory required');
    const marker = JSON.parse(fs.readFileSync(path.join(actual, '.pivane-release.json'), 'utf8'));
    assert.ok(/^[a-f0-9-]{36}$/.test(runId || ''), 'explicit release run identity required');
    assert.equal(marker.runId, runId, 'release run identity mismatch');
    assert.equal(marker.kind, 'pivane-release-acceptance-v1');
}
function rehearsalEnvironment(root, env) {
    rehearsalRoot(root, false, env.PI_RELEASE_RUN_ID || null);
    const actualRoot = fs.realpathSync.native(root);
    const directory = value => {
        assert.ok(typeof value === 'string' && path.isAbsolute(value), 'explicit isolated lifecycle directory required');
        const actual = fs.realpathSync.native(value), relative = path.relative(actualRoot, actual);
        assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'lifecycle directory escapes release fixture');
        assert.equal(actual, path.resolve(value), 'lifecycle directory must use its canonical path');
        assert.ok(fs.lstatSync(value).isDirectory() && !fs.lstatSync(value).isSymbolicLink(), 'lifecycle directory must be a regular directory');
    };
    for (const key of ['PI_CODING_AGENT_DIR', 'PI_MEDIA_CONFIG_DIR', 'PI_MEDIA_DATA_DIR', 'PI_RELEASE_PROJECT_DIR', 'OHMYBUDDY_HOME', 'OHMYBUDDY_WORKSPACES_DIR']) directory(env[key]);
    assert.ok(typeof env.PI_WEB_DEFERRED_FILE === 'string' && path.isAbsolute(env.PI_WEB_DEFERRED_FILE), 'explicit isolated queue required');
    directory(path.dirname(env.PI_WEB_DEFERRED_FILE));
    try {
        const state = fs.lstatSync(env.PI_WEB_DEFERRED_FILE);
        assert.ok(state.isFile() && !state.isSymbolicLink(), 'isolated queue must be a regular file');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
module.exports = { rehearsalRoot, rehearsalEnvironment };
