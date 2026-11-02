'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createHash } = require('node:crypto');
const { prepareInstallation } = require('../scripts/platform-bootstrap.cjs');
const storage = require('../server/ohmybuddy-storage');
const { nodePath } = require('../server/pi-bundle-layout');

test('package installation and reinstallation preserve external configuration, native identity and work files', async t => {
    const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-storage-install-')));
    t.after(() => fs.rmSync(base, { recursive: true, force: true }));
    const source = path.join(base, 'payload'), root = path.join(base, 'application'), agent = path.join(base, 'agent');
    fs.mkdirSync(source); fs.mkdirSync(agent); fs.writeFileSync(path.join(agent, 'auth.json'), 'synthetic native identity');
    const env = { OHMYBUDDY_HOME: path.join(base, 'private'), OHMYBUDDY_WORKSPACES_DIR: path.join(base, 'workspaces'), OPENAI_API_KEY: 'must-not-pass' };
    const files = { 'package.json': '{"name":"ohmybuddy","version":"1.11.1"}', 'package-lock.json': '{"version":"1.11.1"}',
        [path.relative(source, nodePath(source)).replaceAll('\\', '/')]: 'synthetic private runtime', 'server/pi-update-probe.js': 'synthetic probe' };
    const manifest = { version: 1, product: 'OhMyBuddy', appVersion: '1.11.1', piVersion: '1.4.0', nodeVersion: '22.23.4', platform: process.platform, arch: process.arch, files: [] };
    for (const [name, text] of Object.entries(files)) {
        const file = path.join(source, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text);
        manifest.files.push({ path: name, bytes: Buffer.byteLength(text), mode: name.startsWith('runtime/') ? 0o755 : 0o644, sha256: createHash('sha256').update(text).digest('hex') });
    }
    fs.writeFileSync(path.join(source, 'OHMYBUDDY_BUNDLE.json'), JSON.stringify(manifest));
    let probes = 0;
    const run = async (_args, options) => { probes++; assert.equal(options.env.OPENAI_API_KEY, undefined); assert.equal(options.env.PI_OFFLINE, '1'); };
    const first = await prepareInstallation({ source, root, agentDir: agent, env, port: 12345, run });
    assert.equal(first.existing, false); assert.equal(first.port, 12345); assert.ok(probes > 0);
    assert.equal(fs.existsSync(path.join(root, '.env')), false); assert.equal(fs.existsSync(path.join(root, 'data')), false);
    const config = storage.configFile(root, env), receipt = JSON.parse(fs.readFileSync(path.join(root, 'OHMYBUDDY_INSTALLATION.json')));
    assert.equal(receipt.configFile, config); assert.ok(storage.within(path.join(base, 'private/config'), config));
    assert.match(fs.readFileSync(config, 'utf8'), /OHMYBUDDY_WORKSPACES_DIR=/);
    fs.appendFileSync(config, 'UNKNOWN_FUTURE_FIELD=retained\n'); const before = fs.readFileSync(config);
    const work = storage.prepareDirectory(path.join(env.OHMYBUDDY_WORKSPACES_DIR, 'tasks', 'retained'));
    fs.writeFileSync(path.join(work, 'result.txt'), 'user work');
    fs.rmSync(root, { recursive: true });
    const again = await prepareInstallation({ source, root, agentDir: agent, env, port: 11408, run });
    assert.equal(again.port, 12345, 'reinstallation uses the retained instance configuration');
    assert.deepEqual(fs.readFileSync(config), before);
    assert.equal(fs.readFileSync(path.join(agent, 'auth.json'), 'utf8'), 'synthetic native identity');
    assert.equal(fs.readFileSync(path.join(work, 'result.txt'), 'utf8'), 'user work');
    const probeCount = probes;
    assert.equal((await prepareInstallation({ source, root, agentDir: agent, env, run })).existing, true);
    assert.equal(probes, probeCount, 'an existing installation is never recopied or reprobed');
});
