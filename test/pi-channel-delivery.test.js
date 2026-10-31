const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-channel-delivery-')));
process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent'); process.env.PI_PROJECT_ROOTS = root; process.env.PI_OFFLINE = '1';
const { ChannelsService } = require('../server/channels/service');
const { ChannelStore, blocksFollowing } = require('../server/channels/store');
const { ChannelDeliveryError } = require('../server/channels/delivery-errors');
const { WeixinAdapter, createTransport, BASE } = require('../server/channels/weixin-adapter');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
function fixture(t) {
    const directory = path.join(root, String(Math.random())); const db = new ChannelStore(directory); db.claim(); t.after(() => db.close());
    db.change(v => Object.assign(v, {
        accounts: [{ id: 'bot', userId: 'owner', enabled: true, allowedUsers: ['peer'], token: 'synthetic', baseUrl: 'https://ilinkai.weixin.qq.com', cursor: '' }],
        bindings: [{ id: 'binding', accountId: 'bot', peerId: 'peer', cwd: root, sessionId: 'thread' }],
        peers: [{ accountId: 'bot', peerId: 'peer', contextToken: 'synthetic' }]
    }));
    const event = { runId: 'run', jobId: 'cron-job', name: 'Report', status: 'completed', replyEntryId: 'reply', target: { cwd: root, sessionId: 'thread' } };
    const marker = status => ({ type: 'custom', customType: 'pivane-cron-run', data: { runId: 'run', sessionId: 'thread', status, ...(['settled', 'completed'].includes(status) ? { replyEntryId: 'reply' } : {}) } });
    const branch = [marker('prepared'), marker('running'), { type: 'custom_message', customType: 'pivane-cron-message', details: { runId: 'run' } },
        { type: 'custom', customType: 'pivane-deliverable', data: { id: 'own-report', manifestRevision: 'v1' } },
        { id: 'reply', type: 'message', message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Report complete' }] } }, marker('settled'), marker('completed'),
        { type: 'message', message: { role: 'user', content: 'Later web input' } },
        { type: 'custom', customType: 'pivane-deliverable', data: { id: 'later-private', manifestRevision: 'v2' } }];
    const sends = [], media = [], s = Object.create(ChannelsService.prototype);
    Object.assign(s, { db, ready: Promise.resolve(), stopping: false, error: null, mutating: false, runs: new Map(), operations: new Set(), isSuspended: () => false,
        canNotifyScheduled: () => true,
        store: { withSessionRead: async (_cwd, _id, fn) => fn({}, { manager: () => ({ getSessionId: () => 'thread', getBranch: () => branch, getEntries: () => branch }), validate() {} }) },
        adapter: { send: async (_a, _p, text) => { sends.push(text); return {}; }, sendMedia: async (_a, _p, value) => { media.push(value); return {}; } },
        deliverables: { manifest: async () => ({ manifest: { files: [] } }), root: async () => root },
        mediaRoot: root });
    event.recipients = s.captureScheduledRecipients(event);
    return { s, db, event, branch, sends, media };
}

test('cron admission persists only owned bounded artifacts, without inline network delivery', async t => {
    const { s, db, event, sends } = fixture(t);
    assert.equal((await s.notifyScheduledRun(event)).status, 'accepted');
    assert.equal(sends.length, 0); assert.equal(db.value.jobs[0].status, 'ready');
    assert.deepEqual(db.value.jobs[0].deliverables, [{ id: 'own-report', manifestRevision: 'v1' }]);
    assert.match(db.value.jobs[0].directReply, /Report complete/);
});

test('pre-execution failures require scheduler proof and deliver the concrete reason once', async t => {
    const { s, db, event } = fixture(t);
    Object.assign(event, { status: 'failed', admissionFailure: true });
    s.store.withSessionRead = async () => { throw new Error('No native execution exists'); };
    assert.equal((await s.notifyScheduledRun(event)).status, 'skipped');
    s.getScheduledRun = () => ({ id: event.runId, jobId: event.jobId, status: 'failed', target: event.target,
        feedback: { code: 'daily-tokens', title: '每日 Token 额度不足', suggestion: '调整任务或实例的每日 Token 上限，或等待次日。' } });
    assert.equal((await s.notifyScheduledRun(event)).status, 'accepted');
    assert.match(db.value.jobs[0].directReply, /每日 Token 额度不足/);
    assert.match(db.value.jobs[0].directReply, /调整任务或实例/);
    assert.equal((await s.notifyScheduledRun(event)).status, 'accepted'); assert.equal(db.value.jobs.length, 1);
});

test('runtime failure notifications read the reason from the proven native result', async t => {
    const { s, db, event, branch } = fixture(t);
    event.status = 'stopped'; branch[6].data.status = 'stopped';
    branch[6].data.reason = 'token-limit'; branch[6].data.feedback = { code: 'token-limit', title: '单次 Token 上限已用尽', suggestion: '调高或关闭 Token 上限后，核对已执行的操作，再手动运行。' };
    assert.equal((await s.notifyScheduledRun(event)).status, 'accepted');
    assert.match(db.value.jobs[0].directReply, /Token 上限已用尽/);
});

test('lost admission acknowledgement and reopened channel storage do not duplicate a job', async t => {
    const { s, db, event } = fixture(t); await s.notifyScheduledRun(event);
    const directory = db.directory; db.close(); const reopened = new ChannelStore(directory); reopened.claim(); t.after(() => reopened.close()); s.db = reopened;
    assert.equal((await s.notifyScheduledRun(event)).status, 'accepted'); assert.equal(reopened.value.jobs.length, 1);
});

test('replacement bindings cannot receive old frozen notifications', async t => {
    const { s, db, event } = fixture(t);
    db.change(v => { v.bindings[0].id = 'new-binding'; });
    assert.equal((await s.notifyScheduledRun(event)).status, 'skipped'); assert.equal(db.value.jobs.length, 0);
});

test('permission revoked while native results are read is checked again at admission', async t => {
    const { s, db, event } = fixture(t), read = s.store.withSessionRead;
    s.store.withSessionRead = async (...args) => { const result = await read(...args); db.change(v => { v.accounts[0].allowedUsers = []; }); return result; };
    assert.equal((await s.notifyScheduledRun(event)).status, 'skipped'); assert.equal(db.value.jobs.length, 0);
});

test('transient native read failure preserves local retry; missing proof never invents a reply', async t => {
    const { s, db, event, branch } = fixture(t), read = s.store.withSessionRead;
    s.store.withSessionRead = async () => { throw Error('Synthetic read race'); };
    assert.equal((await s.notifyScheduledRun(event)).status, 'retry'); assert.equal(db.value.jobs.length, 0);
    s.store.withSessionRead = read; branch.splice(5, 2);
    assert.equal((await s.notifyScheduledRun(event)).status, 'retry'); assert.equal(db.value.jobs.length, 0);
});

test('unacknowledged terminal cron receipts survive normal channel history trimming', t => {
    const { s, db } = fixture(t); s.scheduledAdmissionPending = id => id === 'run';
    db.change(v => { v.jobs = [{ id: 'protected', kind: 'cron', cronRunId: 'run', status: 'delivered' }, ...Array.from({ length: 4500 }, (_, i) => ({ id: 'old-' + i, status: 'delivered' }))]; s.trimJobs(v); });
    assert.equal(db.value.jobs.length, 4500); assert.equal(db.value.jobs[0].id, 'protected');
});

test('oversized or invalid attachments produce a partial delivery with specific explanation', async t => {
    const { s, db, event, sends, media } = fixture(t); await s.notifyScheduledRun(event);
    s.deliverables.manifest = async () => ({ manifest: { files: [
        { index: 0, name: 'large.pdf', size: 17 * 1024 * 1024, revision: 'r' },
        { index: 1, name: 'corrupt.txt', size: 4, revision: 'r' },
        { index: 2, name: 'good.txt', size: 4, revision: 'r' }
    ] } });
    s.deliverables.readObject = async (_root, filename) => ({ bytes: Buffer.from('text'), size: 4, revision: filename.endsWith('1.bin') ? 'wrong' : 'r' });
    await s.run(db.value.jobs[0].id, {});
    assert.equal(db.value.jobs[0].status, 'partial'); assert.equal(media.length, 1); assert.equal(media[0].name, 'good.txt');
    assert.match(sends[0], /large.pdf：超过 16 MiB/); assert.match(sends[0], /corrupt.txt：无法读取或校验/);
    assert.deepEqual(db.value.jobs[0].deliveryIssues.map(i => i.reason), ['size', 'unreadable']);
});

test('generated media still running is reported pending instead of being silently omitted', async t => {
    const { s } = fixture(t); s.mediaLabService = { chatRequests: { publicState: () => ({ attempts: [{ status: 'running' }] }) } };
    const issues = [];
    assert.deepEqual(await s.collectMediaAssets([{ id: 'plan', summary: 'Audio' }], 6, issues), []);
    assert.deepEqual(issues, [{ name: 'Audio', reason: 'pending' }]); assert.match(s.deliveryWarning(issues), /confirm/);
});

test('attachment limits are visible and diagnostic payload remains bounded', async t => {
    const { s } = fixture(t); s.deliverables.manifest = async () => ({ manifest: { files: Array.from({ length: 40 }, (_, i) => ({ index: i, name: 'f' + i, size: 4, revision: 'r' })) } });
    s.deliverables.readObject = async () => ({ bytes: Buffer.from('text'), size: 4, revision: 'r' });
    const issues = [], files = await s.collectDeliverables([{ id: 'report', manifestRevision: 'v' }], issues);
    assert.equal(files.length, 6); assert.equal(issues.length, 20); assert.equal(issues[0].reason, 'limit');
});

test('uncertain network delivery is never retried by ordinary pumping or admission retry', async t => {
    const { s, db, event, sends } = fixture(t); await s.notifyScheduledRun(event);
    s.adapter.send = async (_a, _p, body) => { sends.push(body); throw Error('ambiguous send'); };
    s.pump(); for (let i = 0; i < 100 && s.runs.size; i++) await delay(5);
    assert.equal(db.value.jobs[0].status, 'uncertain'); assert.equal(sends.length, 1);
    assert.equal((await s.notifyScheduledRun(event)).status, 'accepted'); s.pump(); await delay(20);
    assert.equal(sends.length, 1);
});

test('turning off scheduled notifications cancels an admitted unsent delivery', async t => {
    const { s, db, event, sends } = fixture(t); await s.notifyScheduledRun(event); s.canNotifyScheduled = () => false;
    s.pump(); assert.equal(db.value.jobs[0].status, 'cancelled'); assert.equal(sends.length, 0);
});

const drain = async s => { await Promise.all([...s.runs.values()].map(r => r.promise)); };

test('unconfirmed legacy notifications do not block later deliveries, binding changes or input quota', async t => {
    const { s, db, event, sends } = fixture(t); await s.notifyScheduledRun(event);
    const original = db.value.jobs[0];
    db.change(v => {
        v.jobs = Array.from({ length: 25 }, (_, i) => ({ ...original, id: 'old-' + i, status: 'uncertain', reason: 'execution-or-delivery-uncertain', sendStarted: true }));
    });
    assert.doesNotThrow(() => s.assertPeerIdle('bot', 'peer'));
    s.adapter.message = raw => raw;
    s.receive('bot', { msgs: [{ messageId: 'new-input', peerId: 'peer', text: 'continue', contextToken: 'fresh' }] });
    assert.equal(db.value.jobs.at(-1).status, 'queued', 'old delivery receipts do not fill the input queue');
    s.updateJob(db.value.jobs.at(-1).id, { status: 'cancelled' });
    db.change(v => v.jobs.push({ ...original, id: 'new-notification' }));
    s.pump(); await drain(s);
    assert.equal(db.value.jobs.at(-1).status, 'delivered'); assert.equal(sends.length, 1);
    assert.equal(db.value.jobs[0].status, 'uncertain', 'no invented review or old replay');
});

test('unresolved executions still hold new input but not completed notifications', async t => {
    const { s, db, event, sends } = fixture(t); await s.notifyScheduledRun(event);
    const original = db.value.jobs[0];
    db.change(v => v.jobs.unshift({ ...original, id: 'execution', kind: undefined, directReply: undefined, status: 'uncertain', recoveryAttempts: 5 },
        { ...original, id: 'queued', kind: undefined, directReply: undefined, status: 'queued', text: 'must wait' }));
    assert.equal(blocksFollowing(db.value.jobs[0]), true);
    s.pump(); await drain(s);
    assert.equal(db.value.jobs[1].status, 'queued'); assert.equal(db.value.jobs[2].status, 'delivered'); assert.equal(sends.length, 1);
});

test('native completion is automatically recovered after restart without replaying a task', async t => {
    const { s, db, event, sends } = fixture(t); await s.notifyScheduledRun(event);
    const id = db.value.jobs[0].id;
    s.updateJob(id, { kind: undefined, status: 'running', directReply: undefined });
    const directory = db.directory; db.close(); const reopened = new ChannelStore(directory); reopened.claim(); t.after(() => reopened.close()); s.db = reopened;
    let reads = 0;
    s.readOutcome = async () => { reads++; return { status: 'completed', body: 'recovered' }; };
    s.pump(); await drain(s); assert.equal(s.job(id).status, 'ready'); assert.equal(reads, 1); assert.equal(sends.length, 0);
    // Subsequent delivery consumes the proven native result, with no worker start.
    s.store.getSession = async () => ({ path: 'synthetic' }); s.supervisor = { getActiveWorker: () => null };
    s.pump(); await drain(s); assert.equal(s.job(id).status, 'delivered'); assert.deepEqual(sends, ['recovered']);
});

test('missing native completion proof never restarts a task or invents delivery', async t => {
    const { s, db, event, sends } = fixture(t); await s.notifyScheduledRun(event);
    const id = db.value.jobs[0].id; s.updateJob(id, { kind: undefined, status: 'uncertain', directReply: undefined });
    s.readOutcome = async () => ({ status: 'running' });
    s.pump(); await drain(s);
    assert.equal(s.job(id).status, 'uncertain'); assert.equal(s.job(id).recoveryAttempts, 1); assert.equal(sends.length, 0);
    s.pump(); assert.equal(s.runs.size, 0, 'recovery reads are bounded by backoff');
});

test('scheduled results wait for reply context and send once it is established', async t => {
    const { s, db, event, sends } = fixture(t); db.change(v => { v.peers = []; });
    await s.notifyScheduledRun(event); s.pump(); await drain(s);
    assert.equal(db.value.jobs[0].status, 'ready'); assert.equal(db.value.jobs[0].reason, 'reply-context-missing'); assert.equal(sends.length, 0);
    db.change(v => v.peers.push({ accountId: 'bot', peerId: 'peer', contextToken: 'fresh' }));
    s.pump(); await drain(s); assert.equal(db.value.jobs[0].status, 'delivered'); assert.equal(sends.length, 1);
});

test('definite pre-send failure retries only the current text chunk', async t => {
    const { s, db, event, sends } = fixture(t); await s.notifyScheduledRun(event);
    const id = db.value.jobs[0].id; s.updateJob(id, { directReply: 'a'.repeat(2000) });
    let calls = 0;
    s.adapter.send = async (_a, _p, body) => { calls++; if (calls === 2) throw new ChannelDeliveryError('connection-unavailable', true); sends.push(body); return {}; };
    await s.run(id, {});
    assert.equal(calls, 3); assert.deepEqual(sends.map(s => s.length), [1800, 200]);
    assert.equal(s.job(id).status, 'delivered'); assert.equal(s.job(id).retryCount, 1); assert.equal(s.job(id).sentChunks, 2);
});

test('a failed or unconfirmed attachment does not discard later files or block the chat', async t => {
    const { s, db, event, sends } = fixture(t); await s.notifyScheduledRun(event);
    s.collectDeliverables = async () => ['upload.txt', 'uncertain.txt', 'good.txt'].map(name => ({ name, bytes: Buffer.from('x') }));
    const attempts = [];
    s.adapter.sendMedia = async (_a, _p, media) => {
        attempts.push(media.name);
        if (media.name === 'upload.txt') throw new ChannelDeliveryError('media-upload-failed', true);
        if (media.name === 'uncertain.txt') throw Error('ambiguous send');
        return {};
    };
    await s.run(db.value.jobs[0].id, {});
    assert.deepEqual(attempts, ['upload.txt', 'upload.txt', 'upload.txt', 'uncertain.txt', 'good.txt']);
    const job = db.value.jobs[0]; assert.equal(job.status, 'partial'); assert.equal(job.sentMedia, 1); assert.equal(blocksFollowing(job), false);
    assert.deepEqual(job.deliveryIssues.map(i => i.reason), ['media-upload-failed', 'send-unconfirmed']);
    assert.match(sends.at(-1), /后续消息仍可正常使用/);
});

test('permission is checked again before a delayed upload becomes a message', async t => {
    const { s, db, event, sends } = fixture(t); await s.notifyScheduledRun(event);
    s.collectDeliverables = async () => [{ name: 'file.txt', bytes: Buffer.from('x') }];
    const adapter = new WeixinAdapter({ api: { sendMessage: async () => { throw Error('must not send revoked media'); } } });
    adapter.prepareMedia = async () => { db.change(v => { v.accounts[0].allowedUsers = []; }); return {}; };
    s.adapter.sendMedia = adapter.sendMedia.bind(adapter);
    await s.run(db.value.jobs[0].id, {});
    assert.equal(db.value.jobs[0].status, 'partial'); assert.equal(db.value.jobs[0].reason, 'delivery-revoked'); assert.equal(sends.length, 1);
});

test('transport distinguishes explicit rejection and pre-connect failure from ambiguous sends without exposing provider text', async t => {
    require('node-fetch'); let status = 200, body = '{}', networkError = null;
    t.mock.method(require.cache[require.resolve('node-fetch')], 'exports', async () => {
        if (networkError) throw networkError;
        return { ok: status === 200, status, headers: {}, buffer: async () => Buffer.from(body) };
    });
    const transport = createTransport(new AbortController().signal), send = () => transport(BASE + '/ilink/bot/sendmessage');
    for (const value of [{ ret: -14, errmsg: 'private' }, { errcode: 7, errmsg: 'private' }]) {
        body = JSON.stringify(value);
        await assert.rejects(send(), e => e instanceof ChannelDeliveryError && !e.retryable && !e.message.includes('private'));
    }
    status = 429; body = 'private'; await assert.rejects(send(), e => e instanceof ChannelDeliveryError && e.retryable);
    status = 502; body = '{}'; await assert.rejects(send(), e => !(e instanceof ChannelDeliveryError));
    status = 200; body = 'private'; await assert.rejects(send(), e => !(e instanceof ChannelDeliveryError));
    networkError = Object.assign(Error('private'), { code: 'EAI_AGAIN' }); await assert.rejects(send(), e => e instanceof ChannelDeliveryError && e.retryable);
    networkError.code = 'ECONNRESET'; await assert.rejects(send(), e => !(e instanceof ChannelDeliveryError));
});

test('temporary reply read failure stays retryable without blocking or executing again', async t => {
    const { s, db, event, sends } = fixture(t); await s.notifyScheduledRun(event);
    const id = db.value.jobs[0].id;
    s.updateJob(id, { directReply: undefined });
    s.store.getSession = async () => ({ path: 'synthetic' }); s.supervisor = { getActiveWorker: () => null };
    s.readOutcome = async () => { throw Error('temporary native read failure'); };
    s.pump(); await drain(s);
    assert.equal(s.job(id).status, 'ready'); assert.equal(s.job(id).readAttempts, 1); assert.equal(s.job(id).sendStarted, undefined);
    s.readOutcome = async () => ({ status: 'completed', body: 'ready again' });
    s.updateJob(id, { nextAttemptAt: 0 }); s.pump(); await drain(s);
    assert.equal(s.job(id).status, 'delivered'); assert.deepEqual(sends, ['ready again']);
});

test('a lost receipt checkpoint never causes an already sent message to be retried', async t => {
    const { s, db, event, sends } = fixture(t); await s.notifyScheduledRun(event);
    const id = db.value.jobs[0].id, update = s.updateJob.bind(s); let failed = false;
    s.updateJob = (jobId, changes) => {
        if (!failed && changes.sentChunks === 1) { failed = true; throw Error('receipt storage interrupted'); }
        update(jobId, changes);
    };
    s.pump(); await drain(s);
    assert.equal(s.job(id).status, 'uncertain'); assert.equal(s.job(id).sendStarted, true);
    s.pump(); await drain(s); assert.equal(sends.length, 1); assert.equal(blocksFollowing(s.job(id)), false);
});

test('adapter distinguishes CDN preparation errors from uncertain sendMessage and inspects errcode', async () => {
    const adapter = new WeixinAdapter({ api: { sendMessage: async () => { throw Error('ambiguous'); } } });
    const account = {}, peer = { peerId: 'peer', contextToken: 'context' };
    adapter.prepareMedia = async () => { throw Error('private upload error'); };
    await assert.rejects(adapter.sendMedia(account, peer, {}, 'id'), e => e instanceof ChannelDeliveryError && e.reason === 'media-upload-failed');
    adapter.prepareMedia = async () => ({});
    await assert.rejects(adapter.sendMedia(account, peer, {}, 'id'), e => !(e instanceof ChannelDeliveryError));
    adapter.api.sendMessage = async () => ({ errcode: -14 });
    await assert.rejects(adapter.send(account, peer, 'hello', 'id'), e => e instanceof ChannelDeliveryError && e.reason === 'wechat-login-expired');
});
