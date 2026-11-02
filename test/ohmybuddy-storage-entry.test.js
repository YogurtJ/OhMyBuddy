'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

test('real source entry keeps web settings, media and work files outside program code across a normal restart', { timeout: 45000 }, async t => {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-storage-entry-')));
    const home = path.join(root, 'home'), agent = path.join(root, 'agent'), appHome = path.join(root, 'private');
    for (const directory of [home, agent]) fs.mkdirSync(directory);
    const auth = path.join(agent, 'auth.json'); fs.writeFileSync(auth, '{}\n', { mode: 0o600 });
    const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
    const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
    const env = { ...process.env, HOME: home, ...(process.platform === 'win32' ? { USERPROFILE: home } : {}),
        HOST: '127.0.0.1', PORT: String(port), PI_CODING_AGENT_DIR: agent, PI_PROJECT_ROOTS: root,
        OHMYBUDDY_HOME: appHome, OHMYBUDDY_WORKSPACES_DIR: path.join(root, 'workspaces'),
        PI_MEDIA_DATA_DIR: path.join(appHome, 'data/media'), PI_MEDIA_CONFIG_DIR: path.join(appHome, 'config/media-lab'),
        PI_MEDIA_PROFILE: 'clean', PI_OFFLINE: '1', PI_TELEMETRY: '0' };
    delete env.PI_MANAGED_LAUNCHER; delete env.PI_MANAGED_BASE;
    let child, logs = '';
    const base = `http://127.0.0.1:${port}`;
    const call = async (route, body) => {
        const response = await fetch(base + '/api/pi' + route, { method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', Origin: base }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(1500) });
        return { status: response.status, data: await response.json() };
    };
    async function stop() {
        if (!child || child.exitCode !== null) return;
        const closed = once(child, 'exit'); child.send({ type: 'stop-storage-fixture' }); const [code] = await closed;
        assert.equal(code, 0, 'isolated service must shut down normally');
    }
    t.after(async () => { await stop(); fs.rmSync(root, { recursive: true, force: true }); });
    async function boot() {
        const wrapper = "process.on('message', message => { if (message?.type === 'stop-storage-fixture') process.emit('SIGTERM'); }); require(process.argv[1]);";
        child = spawn(process.execPath, ['-e', wrapper, path.resolve(__dirname, '../server.js')], { cwd: path.resolve(__dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
        child.stdout.on('data', bytes => { logs = (logs + bytes).slice(-8000); }); child.stderr.on('data', bytes => { logs = (logs + bytes).slice(-8000); });
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            if (child.exitCode !== null) throw new Error('Isolated startup failed: ' + logs);
            try { if ((await call('/status')).status === 200) return; } catch {}
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error('Isolated startup timed out: ' + logs);
    }
    await boot();
    const independent = await call('/sessions', { standalone: true }); assert.equal(independent.status, 201, JSON.stringify(independent.data));
    assert.equal(path.dirname(path.dirname(independent.data.cwd)), env.OHMYBUDDY_WORKSPACES_DIR);
    fs.writeFileSync(path.join(independent.data.cwd, 'saved.txt'), 'user work survives');
    const profiles = await call('/bots');
    const created = await call('/bots', { expectedRevision: profiles.data.revision, language: 'en' });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const identities = await call('/profiles');
    const workspace = identities.data.profiles.find(profile => profile.id === created.data.bot.id).bot.workspace;
    assert.ok(workspace.startsWith(path.join(env.OHMYBUDDY_WORKSPACES_DIR, 'bots') + path.sep));
    const nativeFile = independent.data.path, nativeBytes = fs.readFileSync(nativeFile);
    await stop(); await boot();
    const listed = await call('/sessions?cwd=' + encodeURIComponent(independent.data.cwd));
    assert.equal(listed.data.sessions[0].id, independent.data.id);
    assert.deepEqual(fs.readFileSync(nativeFile), nativeBytes);
    assert.equal(fs.readFileSync(path.join(independent.data.cwd, 'saved.txt'), 'utf8'), 'user work survives');
    assert.equal(fs.readFileSync(auth, 'utf8'), '{}\n');
    assert.ok(fs.existsSync(path.join(appHome, 'config/identities')));
    const privateScope = await call('/files/content?' + new URLSearchParams({ cwd: path.join(appHome, 'config'), path: 'not-exposed' }));
    assert.equal(privateScope.status, 403);
});
