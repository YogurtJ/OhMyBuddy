const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-buddy-notebook-')));
const agentDir = path.join(root, 'agent'); fs.mkdirSync(agentDir);
Object.assign(process.env, { PI_CODING_AGENT_DIR: agentDir, PI_PROJECT_ROOTS: root,
    OHMYBUDDY_WORKSPACES_DIR: path.join(root, 'workspaces'), PI_OFFLINE: '1', PI_WEB_DEFERRED_FILE: path.join(root, 'deferred.json') });
const { createPiAgentGateway } = require('../server/pi-agent-routes');
const { WorkspaceAccessService } = require('../server/workspace-access-service');
const { AgentWorker } = require('../server/pi-agent-supervisor');
const { selectItems, renderSelection } = require('../server/bot/bot-buddy-notebook');
const ledger = require('../server/bot/bot-ledger');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

async function fixture(t) {
    const access = new WorkspaceAccessService({ envToken: () => 'synthetic-management' });
    const gateway = createPiAgentGateway({ accessService: access, cronFilePath: path.join(root, `${randomUUID()}.sqlite`) });
    const { bots, store, supervisor, cron } = gateway;
    clearInterval(cron.timer); await cron.ready; cron.healthy();
    const app = require('express')(); app.use(require('express').json()); gateway.mount(app);
    const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => { supervisor.workers.clear(); await gateway.dispose(); access.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, body, token = 'synthetic-management') => {
        const response = await fetch(origin + '/api/pi' + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
    };
    const created = await bots.create({ expectedRevision: (await store.profiles.state()).revision });
    const profileId = created.bot.id, mainId = created.window.id, main = (await bots.resolve(profileId, mainId)).session;
    const topic = async title => {
        const { window } = await bots.createTopic(profileId, { expectedRevision: (await bots.windows.read(profileId)).revision, title });
        return { window, session: (await bots.resolve(profileId, window.id)).session };
    };
    const workerFor = (session, windowId) => {
        const worker = new AgentWorker({ cwd: session.cwd, sessionPath: session.path, sessionId: session.id });
        worker.loadedBot = { profileId, windowId, generation: 0 }; supervisor.workers.set(session.path, worker); return worker;
    };
    return { ...gateway, origin, call, profileId, mainId, main, topic, workerFor, ownerUrl: `/bots/${profileId}/notebook` };
}
async function legacy(session, text, kind = 'commitment') {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const manager = SessionManager.open(session.path);
    const entryId = manager.appendMessage({ role: 'user', content: text, timestamp: Date.now() });
    const prepared = ledger.prepareOps(ledger.emptyLedger(), [{ op: 'add', kind, text }], { at: '2026-11-01T00:00:00Z', by: 'bot',
        source: { sessionId: manager.getSessionId(), entryId, role: 'user', quote: text } });
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, ops: prepared.ops });
    return fs.readFileSync(session.path, 'utf8');
}

test('Buddy notebook preserves notes from 22 chats once, with distinct global ids and unchanged original native files', async t => {
    const f = await fixture(t), originals = new Map();
    originals.set(f.main.path, await legacy(f.main, '周五交论文'));
    for (let i = 0; i < 21; i++) { const topic = await f.topic(`事情 ${i}`); originals.set(topic.session.path, await legacy(topic.session, `事项 ${i}`)); }
    const first = await f.call('GET', f.ownerUrl);
    assert.equal(first.status, 200, JSON.stringify(first.data)); assert.equal(first.cache, 'no-store'); assert.equal(first.data.scope, 'buddy');
    assert.equal(first.data.items.length, 22); assert.equal(new Set(first.data.items.map(item => item.id)).size, 22);
    assert.ok(first.data.items.every(item => /^b\d+$/.test(item.id) && item.source.windowId && item.createdAt === '2026-11-01T00:00:00Z'));
    for (const [file, original] of originals) assert.equal(fs.readFileSync(file, 'utf8'), original);
    const repeated = await f.call('GET', f.ownerUrl); assert.equal(repeated.data.version, first.data.version); assert.equal(repeated.data.items.length, 22);
    const record = await f.bots.notebooks.document(f.profileId, f.main.cwd);
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const journal = SessionManager.open(record.document.file);
    assert.equal(journal.getBranch().some(entry => entry.type === 'message'), false, 'journal contains no duplicate chat');
    assert.equal(ledger.replay(journal.getBranch()).items.length, 22, 'native replay restores all items');
    assert.equal(process.platform === 'win32' ? 0 : fs.statSync(record.document.file).mode & 0o777, process.platform === 'win32' ? 0 : 0o600);
});

test('cross-chat tools update one shared item, preserve sources, deduplicate requests and reject stale writes', async t => {
    const f = await fixture(t), a = await f.topic('论文'), b = await f.topic('近况');
    await legacy(a.session, '周五交论文'); await legacy(b.session, '论文已经提交');
    const wa = f.workerFor(a.session, a.window.id), wb = f.workerFor(b.session, b.window.id);
    const read = await f.call('POST', '/bot-notebook/read', { query: '周五' }, wb.navigationToken);
    assert.equal(read.status, 200, JSON.stringify(read.data)); assert.equal(read.data.items.length, 1);
    const id = read.data.items[0].id;
    const payload = { toolCallId: 'done-in-another-chat', expectedVersion: read.data.version, ops: [{ op: 'status', id, status: 'done' }] };
    const changed = await f.call('POST', '/bot-notebook/edit', payload, wb.navigationToken);
    assert.equal(changed.status, 200, JSON.stringify(changed.data)); assert.equal(changed.data.items[0].status, 'done');
    assert.equal(changed.data.items[0].source.windowId, a.window.id); assert.equal(changed.data.items[0].lastSource.windowId, b.window.id);
    const isolated = await f.bots.notebooks.snapshot(f.profileId); isolated.state.items.find(item => item.id === id).lastSource.quote = 'consumer edit';
    assert.notEqual((await f.bots.notebooks.snapshot(f.profileId)).state.items.find(item => item.id === id).lastSource.quote, 'consumer edit', 'returned snapshots cannot mutate authoritative cache state');
    const retry = await f.call('POST', '/bot-notebook/edit', payload, wb.navigationToken);
    assert.equal(retry.status, 200); assert.equal(retry.data.version, changed.data.version, 'same uncertain request cannot run twice');
    assert.equal((await f.call('POST', '/bot-notebook/edit', { ...payload, ops: [{ op: 'status', id, status: 'cancelled' }] }, wb.navigationToken)).data.code, 'NOTEBOOK_REQUEST_CONFLICT');
    assert.equal((await f.call('POST', '/bot-notebook/edit', { ...payload, toolCallId: 'stale', ops: [{ op: 'update', id, text: 'stale overwrite' }] }, wa.navigationToken)).data.code, 'NOTEBOOK_CHANGED');
    const owner = await f.call('GET', f.ownerUrl);
    const results = await Promise.all(['更新甲', '更新乙'].map(text => f.call('POST', f.ownerUrl, { expectedVersion: owner.data.version, ops: [{ op: 'update', id, text }] })));
    assert.deepEqual(results.map(item => item.status).sort(), [200, 409], 'concurrent writers cannot overwrite each other');
    const latest = await f.call('GET', f.ownerUrl);
    const removed = await f.call('POST', f.ownerUrl, { expectedVersion: latest.data.version, ops: [{ op: 'delete', id }] });
    assert.equal(removed.status, 200); assert.equal(removed.data.items.some(item => item.id === id), false);
    assert.equal((await f.call('GET', f.ownerUrl)).data.items.some(item => item.id === id), false, 'old chat cannot resurrect the deleted item');
    assert.equal((await f.call('POST', '/bot-notebook/edit', { toolCallId: 'bot-delete', expectedVersion: removed.data.version, ops: [{ op: 'delete', id: 'b2' }] }, wb.navigationToken)).status, 400);
    for (const [token, status] of [['synthetic-management', 403], [null, 401]]) assert.equal((await f.call('POST', '/bot-notebook/read', {}, token)).status, status);
    assert.notEqual((await f.call('GET', f.ownerUrl, undefined, wa.navigationToken)).status, 200);
    assert.equal((await f.call('POST', '/bot-notebook/read/extra', {}, wa.navigationToken)).status, 401);
    wb.loadedBot.generation = 1;
    assert.equal((await f.call('POST', '/bot-notebook/read', {}, wb.navigationToken)).data.code, 'BOT_WINDOW_STALE');
});

test('shared items survive topic archival/removal, new items use subjects, and complete search reports coverage', async t => {
    const f = await fixture(t), topic = await f.topic('东京旅行');
    await legacy(topic.session, '预算八千元', 'decision');
    let book = (await f.call('GET', f.ownerUrl)).data;
    assert.equal(book.items[0].subject, '东京旅行');
    await f.bots.updateWindow(f.profileId, topic.window.id, { expectedRevision: (await f.bots.windows.read(f.profileId)).revision, archived: true });
    book = (await f.call('GET', f.ownerUrl)).data;
    assert.equal(book.items.length, 1); assert.equal(book.items[0].source.archived, true);
    const extra = await f.call('POST', f.ownerUrl, { expectedVersion: book.version, ops: [{ op: 'add', kind: 'ref', text: '酒店确认号 1234', subject: '东京旅行' }] });
    assert.equal(extra.status, 200, JSON.stringify(extra.data)); assert.equal(extra.data.items[1].subject, '东京旅行');
    // A source disappearing changes its link, not the Buddy's saved item.
    const registry = await f.bots.windows.read(f.profileId);
    await f.bots.windows.mutate(f.profileId, registry.revision, state => { state.windows = state.windows.filter(window => window.id !== topic.window.id); });
    book = (await f.call('GET', f.ownerUrl)).data;
    assert.equal(book.items.length, 2); assert.equal(book.items[0].source.available, false); assert.equal(book.items[0].source.text, '预算八千元');
    const state = (await f.bots.notebooks.snapshot(f.profileId)).state;
    const selection = selectItems(state, { query: '东京', limit: 1 });
    assert.equal(selection.total, 2); assert.equal(selection.omitted, 1); assert.match(renderSelection(selection), /not the complete notebook/);
    assert.equal(selectItems(state, { query: '1234' }).items[0].id, 'b2');
});

test('shared notebook refuses malformed journals and symlinks; failed bootstrap saves no partial notebook', async t => {
    const f = await fixture(t), topic = await f.topic('来源'); await legacy(topic.session, '保留原记录');
    const original = fs.readFileSync(topic.session.path);
    fs.writeFileSync(topic.session.path, '{broken}\n');
    assert.notEqual((await f.call('GET', f.ownerUrl)).status, 200);
    const { document } = await f.bots.notebooks.document(f.profileId, f.main.cwd);
    assert.equal(fs.existsSync(document.file), false);
    const damagedUtf8 = Buffer.from(original), quote = damagedUtf8.indexOf(Buffer.from('保留原记录'));
    assert.ok(quote >= 0); damagedUtf8[quote] = 0xff; fs.writeFileSync(topic.session.path, damagedUtf8);
    assert.notEqual((await f.call('GET', f.ownerUrl)).status, 200, 'invalid UTF-8 is unknown, not replacement text to import');
    assert.equal(fs.existsSync(document.file), false);
    fs.writeFileSync(topic.session.path, original);
    const created = await f.call('GET', f.ownerUrl); assert.equal(created.status, 200, JSON.stringify(created.data));
    const bytes = fs.readFileSync(document.file);
    fs.appendFileSync(document.file, '{invalid}\n');
    assert.notEqual((await f.call('GET', f.ownerUrl)).status, 200);
    fs.writeFileSync(document.file, bytes);
    fs.renameSync(document.file, document.file + '.saved');
    fs.symlinkSync(document.file + '.saved', document.file);
    assert.notEqual((await f.call('GET', f.ownerUrl)).status, 200);
    assert.deepEqual(fs.readFileSync(document.file + '.saved'), bytes);
});

test('cross-chat recall verifies source identity, reads archived sources and refuses foreign or trashed chats', async t => {
    const f = await fixture(t), a = await f.topic('论文'), b = await f.topic('近况');
    await legacy(a.session, '论文预算最终确定为八千元', 'decision');
    const sdk = await import('@earendil-works/pi-coding-agent');
    const file = path.join(__dirname, '../server/bot/bot-recall-tools.ts');
    const adapter = require(process.env.PIVANE_TEST_PI_JITI).createJiti(file)(file), tools = new Map();
    adapter.registerRecall({ registerTool: tool => tools.set(tool.name, tool) }, { profileId: f.profileId, windowId: b.window.id, cwd: b.session.cwd }, () => agentDir, () => true);
    const ctx = { sessionManager: sdk.SessionManager.open(b.session.path) };
    const found = await tools.get('window_recall').execute('find', { windowId: a.window.id, query: '预算' }, undefined, undefined, ctx);
    const hit = found.details.pivaneRecall.results[0]; assert.ok(hit); assert.equal(hit.role, 'user');
    const read = await tools.get('window_read').execute('read', { windowId: a.window.id, entry: hit.entryId, part: hit.generation }, undefined, undefined, ctx);
    assert.match(read.content[0].text, /八千元/);
    await f.bots.updateWindow(f.profileId, a.window.id, { expectedRevision: (await f.bots.windows.read(f.profileId)).revision, archived: true });
    const archived = await tools.get('window_recall').execute('archived', { windowId: a.window.id, query: '预算' }, undefined, undefined, ctx);
    assert.equal(archived.details.pivaneRecall.results.length, 1);
    await assert.rejects(tools.get('window_recall').execute('foreign', { windowId: randomUUID(), query: '预算' }, undefined, undefined, ctx), /unavailable/);
    const registry = await f.bots.windows.read(f.profileId);
    await f.bots.windows.mutate(f.profileId, registry.revision, state => { state.windows.find(window => window.id === a.window.id).trashedAt = new Date().toISOString(); });
    await assert.rejects(tools.get('window_read').execute('trashed', { windowId: a.window.id, entry: hit.entryId }, undefined, undefined, ctx), /unavailable/);
    assert.equal(f.supervisor.workers.size, 0, 'recall starts no workers');
});

test('shared reminders keep legacy execution identity, follow archive routing and close from another chat', async t => {
    const f = await fixture(t), a = await f.topic('论文'), b = await f.topic('近况');
    await legacy(a.session, '提交论文');
    const sdk = await import('@earendil-works/pi-coding-agent'), manager = sdk.SessionManager.open(a.session.path);
    const due = new Date(Date.now() + 7 * 86400000).toISOString();
    const prepared = ledger.prepareOps(ledger.replay(manager.getBranch()), [{ op: 'update', id: 'n1', due }], { at: new Date().toISOString(), by: 'user' });
    manager.appendCustomEntry(ledger.LEDGER_ENTRY, { v: 1, ops: prepared.ops });
    const proactive = f.bots.proactive, notebooks = f.bots.notebooks;
    delete f.bots.notebooks;
    try { await proactive.syncNotes(f.profileId, a.window.id); } finally { f.bots.notebooks = notebooks; }
    const original = (await proactive.list(f.profileId))[0]; assert.ok(original);
    let book = await notebooks.read(f.profileId); const id = book.items[0].id;
    await proactive.syncBuddyNotes(f.profileId);
    const shared = await proactive.list(f.profileId);
    assert.equal(shared.length, 1); assert.equal(shared[0].id, original.id, 'adoption cannot schedule a duplicate reminder'); assert.equal(shared[0].noteId, id);
    await f.bots.updateWindow(f.profileId, a.window.id, { expectedRevision: (await f.bots.windows.read(f.profileId)).revision, archived: true });
    await proactive.syncBuddyNotes(f.profileId);
    const routed = (await proactive.list(f.profileId))[0]; assert.equal(routed.id, original.id); assert.equal(routed.windowId, f.mainId);
    await legacy(b.session, '论文已经提交'); const worker = f.workerFor(b.session, b.window.id);
    book = await notebooks.read(f.profileId);
    await notebooks.edit(f.profileId, { expectedVersion: book.version, toolCallId: 'finished', ops: [{ op: 'status', id, status: 'done' }] }, worker);
    await proactive.syncBuddyNotes(f.profileId);
    assert.deepEqual(await proactive.list(f.profileId), []);
});

test('shared tools support nested parallel saves, exact paging and provider-empty optional fields', async t => {
    const f = await fixture(t), topic = await f.topic('论文');
    const sdk = await import('@earendil-works/pi-coding-agent'), manager = sdk.SessionManager.open(topic.session.path);
    manager.appendMessage({ role: 'user', content: '论文周五交稿，预算两千元，按学校模板排版。', timestamp: Date.now() });
    const worker = f.workerFor(topic.session, topic.window.id);
    const values = { PI_WORKSPACE_INTERNAL_ORIGIN: f.origin, PI_WEB_NAVIGATION_TOKEN: worker.navigationToken };
    const old = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]])); Object.assign(process.env, values);
    t.after(() => { for (const [key, value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
    const file = path.join(__dirname, '../server/bot/bot-buddy-notebook-tool.ts');
    const adapter = require(process.env.PIVANE_TEST_PI_JITI).createJiti(file)(file), tools = new Map();
    const notebook = adapter.registerBuddyNotebook({ registerTool: tool => tools.set(tool.name, tool), appendEntry: (type, data) => manager.appendCustomEntry(type, data) }, () => true);
    const ctx = { sessionManager: manager }, run = (id, args) => tools.get('window_note').execute(id, args, undefined, undefined, ctx);
    await notebook.notice(manager, '论文');
    const first = await run('add1', { action: 'add', kind: 'commitment', text: '论文周五交稿', subject: '论文', due: '2027-01-01', id: '', replaces: '' });
    assert.deepEqual(first.details.pivaneNoteSaved.ids, ['b1']);
    const saved = await Promise.all([run('nested1', { action: 'add', kind: 'ref', text: '预算两千元', subject: '论文', due: '' }),
        run('nested2', { action: 'add', kind: 'preference', text: '按学校模板排版', subject: '论文', due: '' })]);
    assert.deepEqual(new Set(saved.flatMap(result => result.details.pivaneNoteSaved.ids)), new Set(['b2', 'b3']));
    const query = await tools.get('buddy_notes').execute('read', { query: 'b1' }, undefined, undefined, ctx);
    assert.equal(JSON.parse(query.content[0].text).items.length, 1);
    await run('update-empty-fields', { action: 'update', id: 'b1', due: 'none', subject: '', text: '', kind: undefined });
    const book = await f.bots.notebooks.read(f.profileId), item = book.items.find(item => item.id === 'b1');
    assert.equal(item.subject, '论文'); assert.equal(item.due, null, 'empty subject is omitted; the explicit due sentinel clears the date');
    const page = await f.bots.notebooks.read(f.profileId, { limit: 1, offset: 1 });
    assert.equal(page.items.length, 1); assert.equal(page.total, 3); assert.equal(page.nextOffset, 2); assert.equal(page.omitted, 1);
    assert.equal(manager.getBranch().filter(entry => entry.customType === 'pivane-buddy-note-receipt').length, 4);
    assert.equal(ledger.replay(manager.getBranch()).items.length, 0, 'the source chat carries receipts, not another notebook');
    await assert.rejects(run('old-local-id', { action: 'done', id: 'n1' }), /old chat-local n-ids/);
    const oldRoute = await f.call('POST', `/bots/${f.profileId}/windows/${topic.window.id}/notebook`,
        { expectedGeneration: 0, expectedVersion: 'old', ops: [{ op: 'status', id: 'n1', status: 'done' }] });
    assert.equal(oldRoute.data.code, 'NOTEBOOK_MOVED');
});

test('notebook queue reports maintenance activity and drains accepted writes before shutdown', async t => {
    const f = await fixture(t), notebook = f.bots.notebooks, book = await notebook.read(f.profileId);
    let enter, release;
    const entered = new Promise(resolve => { enter = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const first = notebook.run(f.profileId, async () => { enter(); await gate; });
    assert.equal(notebook.busy, true, 'queue ownership is reserved before awaiting'); await entered;
    const second = notebook.edit(f.profileId, { expectedVersion: book.version, ops: [{ op: 'add', kind: 'ref', text: '保留已受理的保存' }] });
    assert.equal((await f.call('GET', '/activity')).data.profilesBusy, true);
    const stopping = notebook.dispose();
    await assert.rejects(notebook.read(f.profileId), error => error.code === 'NOTEBOOK_STOPPING');
    assert.equal(notebook.busy, true, 'stopping does not pretend pending work was cancelled');
    release(); await first; const saved = await second; await stopping;
    assert.equal(saved.items[0].text, '保留已受理的保存'); assert.equal(notebook.busy, false);
    const { document } = await notebook.document(f.profileId, f.main.cwd), sdk = await import('@earendil-works/pi-coding-agent');
    assert.equal(ledger.replay(sdk.SessionManager.open(document.file).getBranch()).items[0].text, '保留已受理的保存');
});
