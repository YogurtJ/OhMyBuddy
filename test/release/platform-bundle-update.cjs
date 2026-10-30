// pivane-browser: manual
// Explicit native platform trial: an isolated installed payload, real updater, private
// browser profile, native stop/backup/restore. No provider requests or real identity.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { X509Certificate } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const { prepareInstallation } = require('../../scripts/platform-bootstrap.cjs');
const { nodePath, runtimeEnvironment } = require('../../server/pi-bundle-layout');
const compat = require('../../server/ohmybuddy-compat');
const { readSafe, hashFileSafe } = require('../../server/pi-maintenance-files');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
    const args = process.argv.slice(2), values = {};
    for (let i = 0; i < args.length; i += 2) { if (!['--payload', '--output', '--expected', '--playwright', '--resume', '--tls-ca', '--browser'].includes(args[i]) || !args[i + 1] || values[args[i]]) throw Error('Invalid isolated native platform trial arguments'); values[args[i]] = args[i + 1]; }
    if (!['--payload', '--output', '--expected', '--playwright', '--browser'].every(key => values[key])) throw Error('Use --payload --output NEW_DIR --expected VERSION --playwright MODULE --browser EXECUTABLE');
    const output = path.resolve(values['--output']);
    if (values['--resume'] === 'true') assert.equal(readSafe(path.join(output, 'isolated-trial')).toString(), 'OhMyBuddy native platform update\n');
    else { assert.equal(fs.existsSync(output), false); fs.mkdirSync(output, { mode: 0o700 }); fs.writeFileSync(path.join(output, 'isolated-trial'), 'OhMyBuddy native platform update\n', { flag: 'wx', mode: 0o600 }); }
    const installation = path.join(output, 'installation'), agent = path.join(output, 'agent'), project = path.join(output, 'project'), home = path.join(output, 'home');
    for (const directory of [agent, project, home]) fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(agent, 'auth.json'), '{}\n', { mode: 0o600 });
    fs.writeFileSync(path.join(agent, 'settings.json'), JSON.stringify({ defaultProvider: 'fixture', defaultModel: 'fixture', defaultProjectTrust: 'ask', enableInstallTelemetry: false }), { mode: 0o600 });
    fs.writeFileSync(path.join(agent, 'models.json'), JSON.stringify({ providers: { fixture: { baseUrl: 'http://127.0.0.1:1/v1', api: 'openai-completions', apiKey: 'synthetic-fixture', models: [{ id: 'fixture', input: ['text'], contextWindow: 32000, maxTokens: 1000 }] } } }), { mode: 0o600 });
    const socket = net.createServer();
    const requestedPort = values['--resume'] === 'true' ? JSON.parse(readSafe(compat.metadataFile(installation, 'INSTALLATION'))).port : 0;
    socket.listen(requestedPort, '127.0.0.1'); await once(socket, 'listening'); const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
    const env = { HOME: home, ...(process.platform === 'win32' ? { USERPROFILE: home, SystemRoot: process.env.SystemRoot, TEMP: home, TMP: home } : {}), HOST: '127.0.0.1', PORT: String(port),
        PI_CODING_AGENT_DIR: agent, PI_PROJECT_ROOTS: project, PI_WEB_TOKEN: 'pivane-platform-trial-only', PI_OFFLINE: '1', PI_TELEMETRY: '0', PI_SKIP_VERSION_CHECK: '1' };
    if (values['--tls-ca']) {
        assert.ok(path.isAbsolute(values['--tls-ca']), 'Test TLS CA path must be absolute');
        const ca = fs.realpathSync.native(values['--tls-ca']);
        assert.equal(new X509Certificate(readSafe(ca, 64 * 1024)).ca, true, 'Test TLS certificate must be a CA');
        env.NODE_EXTRA_CA_CERTS = ca;
    }
    await prepareInstallation({ source: fs.realpathSync.native(values['--payload']), root: installation, agentDir: agent, port, env, run: require('../../server/pi-update-installer').runNode });
    const initial = JSON.parse(readSafe(path.join(installation, 'package.json'))).version;
    const node = nodePath(installation), logFile = fs.openSync(path.join(output, values['--resume'] ? 'service-resume.log' : 'service.log'), values['--resume'] ? 'a' : 'wx', 0o600);
    const media = path.join(installation, 'data/media/public/audio'); fs.mkdirSync(media, { recursive: true }); const fixtureMedia = path.join(media, 'fixture.wav'); fs.writeFileSync(fixtureMedia, 'synthetic media bytes');
    const servicePlan = require('../../scripts/install-service.cjs').plan({ root: installation, home, node, platform: process.platform, executablePath: runtimeEnvironment(installation, env).PATH, url: `http://127.0.0.1:${port}`, desktop: null, user: 'fixture' });
    fs.mkdirSync(servicePlan.directory, { recursive: true }); fs.writeFileSync(servicePlan.runner, servicePlan.runnerText, { mode: 0o600 });
    const stopFile = path.join(servicePlan.directory, 'stop-request');
    let child, browser, page, session, snapshot;
    const reviewResponses = [];
    const base = `http://127.0.0.1:${port}`;
    const api = async (route, body) => {
        const response = await fetch(base + '/api/pi/' + route, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer pivane-platform-trial-only', Origin: base, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
        const value = await response.json(); if (!response.ok) throw Error(`Trial API ${route}: ${response.status}: ${value.error}`); return value;
    };
    async function boot() {
        child = spawn(node, [servicePlan.runner], { cwd: installation, env, stdio: ['ignore', logFile, logFile] });
        const deadline = Date.now() + 120000;
        while (Date.now() < deadline) { if (child.exitCode !== null) throw Error('Isolated service exited'); try { const state = await api('settings/updates/maintenance'); if (!state.busy) return; } catch {} await delay(200); }
        throw Error('Isolated service readiness failed');
    }
    async function stop() { if (child?.exitCode === null) { const exited = once(child, 'exit'); fs.writeFileSync(stopFile, 'normal stop requested by isolated trial\n', { flag: 'wx', mode: 0o600 }); const [code, signal] = await exited; assert.equal(code, 0, `Unclean stop: ${signal}`); } }
    try {
        await boot();
        session = await api('sessions', { cwd: project, name: 'Synthetic native platform update validation' });
        const sdk = await import('@earendil-works/pi-coding-agent');
        const native = sdk.SessionManager.open(session.path);
        const images = new (require('../../server/pi-session-images').SessionImages)(agent);
        const image = images.save({ type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+tmF0AAAAASUVORK5CYII=' });
        const imageProof = hashFileSafe(path.join(images.root, image.pivaneImage.sha256));
        const original = native.appendMessage({ role: 'user', content: [{ type: 'text', text: 'Synthetic original transcript' }, image], timestamp: 1 });
        native.appendContextEdit(original, { content: 'Synthetic edited provider context' });
        const uiSession = await api('sessions', { cwd: project, name: 'Update interface fixture' });
        snapshot = hashFileSafe(session.path);
        const mediaProof = hashFileSafe(fixtureMedia);
        const versions = await api('settings/updates/check', {}); assert.equal(versions.installMode, 'managed-bundle'); assert.equal(versions.pivane.version, values['--expected']);
        assert.equal(versions.appVersion, initial);
        const { chromium } = require(values['--playwright']);
        browser = await chromium.launch({ executablePath: values['--browser'], headless: true });
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', extraHTTPHeaders: { Authorization: 'Bearer pivane-platform-trial-only' } });
        page = await context.newPage(); const errors = [];
        page.on('response', response => { if (response.url().endsWith('/settings/updates/review')) void response.json().then(body => reviewResponses.push({ status: response.status(), body })); });
        page.on('pageerror', error => errors.push(error.message));
        await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.abort());
        await page.addInitScript(({ cwd, id }) => { sessionStorage.setItem('pi.web.token', 'pivane-platform-trial-only'); localStorage.setItem('pi.web.cwd', cwd); localStorage.setItem('pi.web.session:' + cwd, id); }, { cwd: project, id: uiSession.id });
        await page.goto(base + '/#/settings?tab=updates', { waitUntil: 'domcontentloaded' });
        await page.locator('#updates-install-pivane:not([disabled])').waitFor({ timeout: 60000 });
        await page.locator('#updates-install-pivane').click(); await page.locator('#updates-confirm-install').waitFor({ timeout: 15000 });
        await page.locator('#updates-drafts-saved').check(); await page.locator('#updates-writers-stopped').check();
        let executes = 0; page.on('request', req => { if (req.url().endsWith('/settings/updates/execute')) executes++; });
        snapshot = hashFileSafe(session.path);
        await page.locator('#updates-confirm-install').click();
        const deadline = Date.now() + 35 * 60 * 1000; let state, previous;
        while (Date.now() < deadline) {
            try {
                state = await api('settings/updates/maintenance');
                if (state.job?.phase !== previous) { previous = state.job?.phase; console.log(JSON.stringify({ phase: previous || 'waiting' })); }
                if (state.job && ['failed', 'interrupted'].includes(state.job.phase)) throw Object.assign(Error('Update failed: ' + state.job.output), { terminal: true });
                if (state.job?.phase === 'succeeded' && !state.busy) break;
            } catch (error) { if (error.terminal) throw error; }
            await delay(1000);
        }
        assert.equal(state?.job?.phase, 'succeeded'); assert.equal(executes, 1);
        assert.ok(!/\$ npm (?:ci|install)/.test(state.job.output), 'Client must not install npm dependencies');
        const after = await api('settings/updates'); assert.equal(after.appVersion, values['--expected']); assert.equal(after.piVersion, versions.piVersion);
        assert.deepEqual(hashFileSafe(session.path), snapshot); assert.deepEqual(hashFileSafe(fixtureMedia), mediaProof); assert.deepEqual(hashFileSafe(path.join(images.root, image.pivaneImage.sha256)), imageProof);
        require('../../server/pi-maintenance-backup').inspectBackupContents(state.job.backup.directory);
        await page.waitForFunction(expected => {
            const card = document.getElementById('updates-pivane');
            const current = card?.querySelector('.updates-versions > .updates-version:first-child > strong');
            return current?.textContent.trim() === expected && card.closest('.updates-cards')?.getAttribute('aria-busy') === 'false';
        }, values['--expected'], { timeout: 30000 });
        await page.screenshot({ path: path.join(output, 'updated-platform.png') });
        // The page can report a connection error during the intentional restart;
        // JavaScript errors are recorded separately for diagnosis, never hidden.
        await browser.close(); browser = null; await stop();
        fs.writeFileSync(fixtureMedia, 'post-update synthetic change');
        const restored = await require('../../server/pi-maintenance-restore').restoreBackup(installation, state.job.id);
        assert.deepEqual(hashFileSafe(session.path), snapshot); assert.deepEqual(hashFileSafe(fixtureMedia), mediaProof); assert.deepEqual(hashFileSafe(path.join(images.root, image.pivaneImage.sha256)), imageProof);
        await boot(); assert.equal((await api('settings/updates')).appVersion, initial); await stop();
        assert.deepEqual(errors, [], 'Browser JavaScript errors during the real native platform update');
        const report = { platform: process.platform, arch: process.arch, node: process.versions.node, initial, updated: after.appVersion, executeCount: executes,
            freshIdentity: true, privateRuntime: true, clientNpmInstall: false, realBrowserUpdate: true, nativeSessionBytesPreserved: true, mediaBytesPreserved: true, backingImageBytesPreserved: true,
            stoppedBackupVerified: true, restoreVerified: true, normalShutdown: true, pageErrors: errors, backup: state.job.backup.directory, restored };
        fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 }); console.log(JSON.stringify(report, null, 2));
    } finally {
        if (browser) {
            try { await page?.screenshot({ path: path.join(output, 'failure.png') }); fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ reviewResponses, text: (await page.locator('body').innerText()).slice(-12000) }, null, 2), { mode: 0o600 }); } catch {}
            await browser.close();
        }
        await stop(); fs.closeSync(logFile);
    }
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
