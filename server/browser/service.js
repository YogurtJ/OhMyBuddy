'use strict';
const path = require('node:path');
const { createHash } = require('node:crypto');
const { privateDir, readSafe, atomicJson } = require('../pi-maintenance-files');
const storage = require('../ohmybuddy-storage');
const { BrowserComponent } = require('./component');
const SERVER_NAME = 'ohmybuddy_browser';
const fail = (code, status = 409) => Object.assign(new Error(code), { code, status });
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function readSettings(file) {
    let saved = {};
    try { saved = JSON.parse(readSafe(file, 16384)); }
    catch (error) { if (error.code !== 'ENOENT') throw fail('BROWSER_SETTINGS_INVALID', 500); }
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw fail('BROWSER_SETTINGS_INVALID', 500);
    const settings = { ...saved, enabled: saved.enabled === true, headless: saved.headless ?? process.platform === 'linux' };
    if (typeof settings.headless !== 'boolean') throw fail('BROWSER_SETTINGS_INVALID', 500);
    return settings;
}
// Product settings and component preparation only. Pi owns MCP connections;
// Microsoft's server owns pages, locators, actions, files and browser shutdown.
class BrowserService {
    constructor({ root, component, supervisor, suspended = () => false, env = process.env } = {}) {
        this.root = root || path.join(storage.layout({ env }).data, 'browser');
        this.file = path.join(this.root, 'settings.json');
        this.component = component || new BrowserComponent({ env });
        this.supervisor = supervisor;
        this.suspended = suspended;
        this.job = null; this.stopping = false;
        this.used = new Set();
    }
    get busy() { return Boolean(this.job); }
    get running() { return this.used.size > 0; }
    read() { return readSettings(this.file); }
    status() {
        const settings = this.read();
        return { enabled: settings.enabled, headless: settings.headless, revision: digest(settings),
            component: this.component.status(), running: this.running, sessions: this.used.size,
            busy: this.busy, host: 'deployment', persistentLogin: true, engine: 'playwright-mcp', server: SERVER_NAME };
    }
    exclusive(fn) {
        if (this.stopping || this.suspended()) throw fail('BROWSER_UNAVAILABLE', 503);
        if (this.job) throw fail('BROWSER_BUSY');
        const job = Promise.resolve().then(fn);
        this.job = job;
        return job.finally(() => { if (this.job === job) this.job = null; });
    }
    workers() {
        return [...(this.supervisor?.workers.values() || [])]
            .filter(worker => worker.client.env.OHMYBUDDY_BROWSER_MCP_CONFIG && !worker.disposed);
    }
    assertIdle(workers) {
        if (this.supervisor?.starting.size || workers.some(worker => !worker.isIdle() || worker.retainsBackgroundWork())) throw fail('BROWSER_BUSY');
    }
    async retire(workers) {
        this.assertIdle(workers);
        // No await before all retirements have reserved their supervisor slots.
        await Promise.all(workers.map(worker => this.supervisor.stopSession(worker.sessionPath)));
    }
    configure(input) {
        return this.exclusive(async () => {
            if (!input || Object.keys(input).some(key => !['revision', 'enabled', 'headless'].includes(key))
                || typeof input.enabled !== 'boolean' || typeof input.headless !== 'boolean') throw fail('BROWSER_SETTINGS', 400);
            const settings = this.read();
            if (input.revision !== digest(settings)) throw fail('BROWSER_REVISION');
            const workers = this.workers(); this.assertIdle(workers);
            privateDir(this.root);
            atomicJson(this.file, { ...settings, enabled: input.enabled, headless: input.headless });
            await this.retire(workers);
            return this.status();
        });
    }
    install() { return this.exclusive(async () => { await this.component.install(); return this.status(); }); }
    close() { return this.exclusive(async () => { await this.retire([...this.used]); return this.status(); }); }
    environment({ sessionId, cwd }) {
        if (this.stopping || this.job || this.suspended()) throw fail('BROWSER_BUSY');
        if (!this.read().enabled || !this.component.executable()) return { OHMYBUDDY_BROWSER_MCP_CONFIG: undefined };
        if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(sessionId || '') || !path.isAbsolute(cwd)) throw fail('BROWSER_SESSION_REQUIRED', 400);
        privateDir(this.root);
        const profiles = privateDir(path.join(this.root, 'profiles'));
        const profile = privateDir(path.join(profiles, sessionId));
        const args = [path.join(__dirname, 'launch.js'), '--executable-path', this.component.executable(),
            '--user-data-dir', profile, '--output-dir', path.join(cwd, 'browser-output', sessionId), '--ignore-roots', '--caps', 'vision,pdf'];
        if (this.read().headless) args.push('--headless');
        const config = { command: process.execPath, args, cwd, exposure: 'codemode', timeout: 90,
            env: { PLAYWRIGHT_BROWSERS_PATH: this.component.cache, DO_NOT_TRACK: '1' },
            description: 'Official Playwright browser automation: navigate, fill forms, upload/download and inspect results. Persistent login belongs to this conversation. Never blindly replay uncertain submissions.' };
        return { OHMYBUDDY_BROWSER_MCP_CONFIG: JSON.stringify({ sessionId, settingsFile: this.file, config }) };
    }
    track(worker) {
        if (!worker.client.env.OHMYBUDDY_BROWSER_MCP_CONFIG) return;
        const listener = event => {
            if (event.type === 'tool_execution_start' && event.toolName?.startsWith(`mcp__${SERVER_NAME}__`)) this.used.add(worker);
            // Official browser_close closes a page; it does not prove that the
            // persistent browser process has exited. Only retirements clear this.
        };
        worker.client.on('event', listener);
        const clear = () => { this.used.delete(worker); worker.client.off('event', listener); };
        worker.once('disposed', clear); worker.once('exit', clear);
    }
    async dispose() {
        this.stopping = true;
        await this.job?.catch(() => {});
        // The gateway disposes the supervisor and all native MCP transports.
    }
}
module.exports = { BrowserService, SERVER_NAME, readSettings };
