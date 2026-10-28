'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { randomUUID } = require('node:crypto');
const { BotActivity, LIMITS } = require('../server/bot/bot-activity');
const { CronStore } = require('../server/pi-cron-store');
const { defaultBot } = require('../server/bot/bot-settings');
const { mountBotRoutes } = require('../server/bot/bot-routes');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-activity-'));
    const db = new CronStore(path.join(root, 'cron.sqlite'));
    t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
    const profileId = randomUUID(), main = randomUUID(), topic = randomUUID(), foreign = randomUUID(), jobId = randomUUID();
    const now = Date.parse('2026-10-28T10:00:00Z'), cwd = '/fixture/bot';
    const profile = { id: profileId, enabled: true, bot: defaultBot({ workspace: cwd }) };
    const windows = [{ id: main, kind: 'main', cwd, current: { sessionId: 'new' }, generations: [{ sessionId: 'old' }, { sessionId: 'new' }] },
        { id: topic, kind: 'topic', cwd, current: { sessionId: 'topic' }, generations: [{ sessionId: 'topic' }] }];
    const bots = { profiles: { getProfile: async id => id === profileId ? profile : null }, windows: { read: async () => ({ state: { windows } }) } };
    const state = { push: { day: '2026-10-28', count: 2 }, held: [{ completionId: 'held', at: now }], items: [] };
    const proactive = { read: async () => ({ state }) };
    const cron = { ready: Promise.resolve(), healthy() {}, db };
    const channels = { ready: Promise.resolve(), db: { value: { jobs: [] } } };
    const activity = new BotActivity({ bots, cron, proactive, channels, now: () => now });
    const target = sessionId => ({ cwd, sessionId, bot: { profileId, windowId: null } });
    return { profileId, main, topic, foreign, jobId, now, cwd, profile, bots, state, cron, channels, activity, db, target };
}

test('Bot activity proves historical ownership, separates execution/delivery, strips private fields and never writes', async t => {
    const w = fixture(t), { db, profileId, main, topic, foreign, jobId, now, target } = w;
    db.saveJob({ id: jobId, name: 'secret-title', prompt: 'secret-body', enabled: true, nextAt: now + 1000, target: { kind: 'profile', profileId, windowId: topic } });
    const run = (id, status, sessionId = 'old', extra = {}) => db.saveRun({ id, jobId, scheduledAt: now - 1000, status, target: target(sessionId), reason: '/secret/error?key=secret-key', ...extra });
    run('done', 'completed');
    run('quiet', 'silent');
    run('held', 'completed');
    run('uncertain', 'uncertain');
    run('failed', 'failed');
    run('wrong-owner', 'completed', 'old', { target: { ...target('old'), bot: { profileId: foreign, windowId: null } } });
    run('wrong-window', 'completed', 'old', { target: { ...target('old'), bot: { profileId, windowId: topic } } });
    run('foreign-session', 'completed', 'foreign');
    // A completed run without a historical target must not inherit the job's current Bot target.
    db.saveRun({ id: 'no-proof', jobId, scheduledAt: now, status: 'completed' });
    db.saveRun({ id: 'waiting', jobId, scheduledAt: now + 1000, status: 'waiting', job: { target: { kind: 'profile', profileId } } });
    w.state.items.push({ id: 'check', title: 'secret-title', text: 'secret-body', kind: 'checkin', at: now + 2000, windowId: main, state: 'pending' },
        { id: 'skipped', runId: 'refused', at: now, windowId: main, state: 'skipped', reason: 'refused' },
        { id: 'gone', at: now, windowId: foreign, state: 'pending' });
    w.channels.db.value.jobs.push({ id: 'secret-account/secret-peer', accountId: 'secret-account', peerId: 'secret-peer', text: 'secret-body',
        kind: 'thread', bot: { profileId, windowId: main }, target: { cwd: w.cwd, sessionId: 'old' }, status: 'uncertain', reason: 'delivery-unconfirmed', at: now });
    w.channels.db.value.jobs.push({ id: 'other-channel', bot: { profileId: foreign, windowId: main }, target: { cwd: w.cwd, sessionId: 'old' }, status: 'failed', at: now });
    const before = JSON.stringify({ runs: db.runs(), jobs: db.jobs(), proactive: w.state, channels: w.channels.db.value });
    const snap = await w.activity.snapshot(profileId);
    assert.equal(snap.version, 1);
    assert.deepEqual(snap.sources, { proactive: 'available', scheduler: 'available', channels: 'available' });
    assert.equal(snap.items.length, 10);
    assert.equal(snap.items.filter(item => item.execution === 'completed').length, 2);
    assert.ok(snap.items.some(item => item.execution === 'silent' && item.delivery === 'none'));
    assert.ok(snap.items.some(item => item.execution === 'completed' && item.delivery === 'unknown'), 'execution completion is not delivery proof');
    assert.ok(snap.items.some(item => item.execution === 'completed' && item.delivery === 'held'));
    assert.ok(snap.items.some(item => item.execution === 'unknown' && item.delivery === 'uncertain' && item.kind === 'channel'));
    assert.ok(snap.items.some(item => item.execution === 'skipped' && item.reason === 'refused'));
    assert.ok(snap.items.some(item => item.execution === 'pending' && item.windowId === topic && item.jobId === jobId && item.delivery === 'unknown'), 'future task delivery is not yet known');
    assert.equal(snap.quota.proactivePushes.used, 2);
    assert.equal(snap.quota.scheduledTasks.scope, 'all-user-scheduled-tasks');
    assert.doesNotMatch(JSON.stringify(snap), /secret-|\/fixture|foreign-session|wrong-owner|no-proof/);
    assert.equal(JSON.stringify({ runs: db.runs(), jobs: db.jobs(), proactive: w.state, channels: w.channels.db.value }), before);
});

test('Bot activity bounds output and distinguishes unavailable owners from empty facts', async t => {
    const w = fixture(t);
    for (let n = 0; n < 80; n++) w.channels.db.value.jobs.push({ id: `job-${n}`, target: w.target('new'), status: n === 79 ? 'partial' : 'delivered', at: w.now + n });
    const snap = await w.activity.snapshot(w.profileId);
    assert.equal(snap.items.length, LIMITS.items);
    assert.equal(snap.truncated, true);
    assert.equal(snap.items[0].delivery, 'partial');
    w.channels.db.value.jobs = [];
    w.state.items = Array.from({ length: 60 }, (_, index) => ({ id: `pending-${index}`, windowId: w.main, state: 'pending', at: w.now + 1000 + index }));
    w.db.saveRun({ id: 'execution-failed', jobId: w.jobId, scheduledAt: w.now - 1000, status: 'failed', target: w.target('new') });
    const withFailure = await w.activity.snapshot(w.profileId);
    assert.equal(withFailure.items[0].execution, 'failed', 'a full pending queue must not hide a known execution failure');
    w.state.items = [];
    w.cron.healthy = () => { throw new Error('secret error'); };
    w.proactive = null;
    w.channels.error = 'secret channel error';
    w.activity.proactive = null;
    const unavailable = await w.activity.snapshot(w.profileId);
    assert.deepEqual(unavailable.sources, { proactive: 'unavailable', scheduler: 'unavailable', channels: 'unavailable' });
    assert.deepEqual(unavailable.items, []);
    assert.deepEqual(unavailable.quota, { proactivePushes: null, scheduledTasks: null });
    assert.doesNotMatch(JSON.stringify(unavailable), /secret/);
    await assert.rejects(w.activity.snapshot(randomUUID()), { status: 404 });
    w.bots.windows.read = async () => { throw new Error('secret path'); };
    await assert.rejects(w.activity.snapshot(w.profileId), { status: 503, code: 'BOT_ACTIVITY_UNAVAILABLE', message: 'Bot activity is unavailable' });
});

test('Bot activity HTTP endpoint is no-store, read-only and retains unavailable status', async t => {
    const w = fixture(t), app = express(), router = express.Router();
    mountBotRoutes(router, { bots: w.bots, activity: w.activity }); app.use(router);
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/bots/${w.profileId}/activity`);
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await response.json()).items, []);
    const missing = await fetch(`http://127.0.0.1:${server.address().port}/bots/${randomUUID()}/activity`);
    assert.equal(missing.status, 404);
});


test('Bot activity uses only recent unambiguous generations and hides underlying profile errors', async t => {
    const w = fixture(t);
    const windows = (await w.bots.windows.read(w.profileId)).state.windows;
    windows[0].generations = Array.from({ length: 102 }, (_, index) => ({ sessionId: `generation-${index}` }));
    w.db.saveRun({ id: 'too-old', jobId: w.jobId, scheduledAt: w.now, status: 'completed', target: w.target('generation-0') });
    w.db.saveRun({ id: 'recent', jobId: w.jobId, scheduledAt: w.now, status: 'completed', target: w.target('generation-101') });
    assert.equal((await w.activity.snapshot(w.profileId)).items.length, 1);
    windows[1].generations.push({ sessionId: 'generation-101' });
    assert.deepEqual((await w.activity.snapshot(w.profileId)).items, [], 'ambiguous indexed ownership is not a usable chat link');
    await assert.rejects(w.activity.snapshot('../private-path'), { status: 400, message: 'Invalid bot ID' });
    w.bots.profiles.getProfile = async () => { throw new Error('secret identity file path'); };
    await assert.rejects(w.activity.snapshot(w.profileId), { status: 503, code: 'BOT_ACTIVITY_UNAVAILABLE', message: 'Bot activity is unavailable' });
});
