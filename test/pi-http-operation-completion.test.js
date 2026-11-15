const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { once } = require('node:events');
const express = require('express');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pi-http-completion-')));
const cwd = path.join(root, 'project'); fs.mkdirSync(cwd);
Object.assign(process.env, { PI_CODING_AGENT_DIR: path.join(root, 'agent'), PI_PROJECT_ROOTS: root, PI_OFFLINE: '1',
    OHMYBUDDY_HOME: path.join(root, 'app'), OHMYBUDDY_WORKSPACES_DIR: path.join(root, 'workspaces'), PI_MEDIA_DATA_DIR: path.join(root, 'media'),
    PI_WEB_TOKEN: 'http-completion-fixture', PI_WEB_DEFERRED_FILE: path.join(root, 'deferred.json') });
const { MaintenanceClient } = require('../server/pi-maintenance-client');
const { createPiAgentGateway } = require('../server/pi-agent-routes');
const { PiFileBrowser } = require('../server/pi-file-browser');
const { PiSessionSearch } = require('../server/pi-session-search');
const { PiFileRoots } = require('../server/pi-file-roots');
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('cancelled HTTP routes release their original maintenance admission only after handler cleanup', { timeout: 60000 }, async t => {
    const maintenance = new MaintenanceClient({ managed: false });
    const gateway = createPiAgentGateway({ maintenance, artifactMediaRoot: path.join(root, 'media') });
    const app = express(); let closeGate = null;
    app.use((req, res, next) => { res.once('close', () => closeGate?.resolve()); maintenance.http(req, res, next); });
    app.use(express.json()); gateway.mount(app);
    const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`, query = encodeURIComponent(cwd);
    const targets = [
        { name: 'artifact discovery', object: gateway.artifacts, method: 'list', url: '/api/pi/artifacts' },
        { name: 'artifact batch', object: gateway.artifacts.management, method: 'batch', url: '/api/pi/artifacts/batch', body: {} },
        { name: 'session search', object: PiSessionSearch.prototype, method: 'search', url: `/api/pi/sessions/search?cwd=${query}&q=fixture` },
        { name: 'file listing', object: PiFileBrowser.prototype, method: 'request', url: `/api/pi/files/list?cwd=${query}&path=` },
        { name: 'file search', object: PiFileBrowser.prototype, method: 'request', url: `/api/pi/files/search?cwd=${query}&q=fixture` },
        { name: 'linked directory listing', object: PiFileRoots.prototype, method: 'list', url: `/api/pi/files/roots?cwd=${query}` },
        { name: 'linked directory write', object: PiFileRoots.prototype, method: 'change', url: '/api/pi/files/roots', body: {} },
        { name: 'server directories', object: PiFileRoots.prototype, method: 'directories', url: '/api/pi/files/directories?path=' },
        { name: 'file resolution', object: PiFileRoots.prototype, method: 'resolve', url: `/api/pi/files/resolve?cwd=${query}&path=report.md` },
        { name: 'native directory picker', object: gateway.directoryPicker, method: 'pick', url: '/api/pi/directories/picker', body: { path: cwd } }
    ];
    let allowCleanup;
    t.after(async () => {
        allowCleanup?.resolve(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        await gateway.dispose(); fs.rmSync(root, { recursive: true, force: true });
    });
    for (const target of targets) for (const disconnected of [false, true]) for (const reject of [false, true]) {
        const started = gate(), cleaned = gate(); allowCleanup = gate(); closeGate = gate();
        const mocked = t.mock.method(target.object, target.method, async () => {
            started.resolve();
            try { await allowCleanup.promise; if (reject) throw Object.assign(new Error('fixture failure'), { status: 409, code: 'FILE_CHANGED' }); return target.name === 'native directory picker' ? null : { items: [] }; }
            finally { cleaned.resolve(); }
        });
        const headers = { Authorization: 'Bearer http-completion-fixture', Origin: base, 'Content-Type': 'application/json' };
        const request = http.request(base + target.url, { method: target.body ? 'POST' : 'GET', headers });
        request.on('error', () => {});
        const responseDone = new Promise(resolve => request.once('response', res => { res.resume(); res.once('end', () => resolve(res.statusCode)); }));
        request.end(target.body ? JSON.stringify(target.body) : undefined);
        try {
            await started.promise; assert.equal(maintenance.active, 1, target.name + ' is admitted once across app and gateway');
            if (disconnected) { request.destroy(); await closeGate.promise; assert.equal(maintenance.active, 1, target.name + ' must retain admission while cleanup is pending'); }
            // An unrelated operation must remain counted when this request completes.
            const releaseOther = maintenance.enter();
            try {
                assert.equal(maintenance.active, 2);
                allowCleanup.resolve(); await cleaned.promise;
                if (!disconnected) assert.equal(await responseDone, reject ? 409 : 200, target.name + ' preserves its response status');
                await new Promise(resolve => setImmediate(resolve));
                assert.equal(maintenance.active, 1, `${target.name}: disconnected=${disconnected}, reject=${reject} must release exactly its own admission after cleanup`);
            } finally { releaseOther(); }
            assert.equal(maintenance.active, 0);
        } finally { allowCleanup.resolve(); mocked.mock.restore(); request.destroy(); }
    }
});
