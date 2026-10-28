'use strict';
// Bounded, read-only projections of existing owners. No session reads, worker admission or
// copied messages. A run's historical target must belong to an indexed Bot generation;
// mutable job targets are used only for future work and not as proof for finished runs.
const { createHash } = require('node:crypto');
const { readBot } = require('./bot-settings');
const { dayKey } = require('../pi-cron-schedule');
const LIMITS = Object.freeze({ items: 30, schedulerRuns: 100, channelJobs: 60, jobs: 100, generationsPerWindow: 100 });
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const unavailable = () => Object.assign(new Error('Bot activity is unavailable'), { status: 503, code: 'BOT_ACTIVITY_UNAVAILABLE' });
const id = (kind, value) => createHash('sha256').update(`${kind}:${value}`).digest('hex').slice(0, 24);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const time = value => Number.isFinite(value) ? value : null;
const REASONS = new Set(['cancelled', 'off', 'chat-gone', 'late', 'refused', 'bot-unavailable', 'expired', 'offline', 'proactive-off',
    'reply-context-missing', 'wechat-login-expired', 'wechat-rate-limited', 'wechat-rejected', 'delivery-unconfirmed',
    'execution-or-delivery-uncertain', 'attachments-incomplete', 'notification-revoked', 'delivery-revoked', 'stop-request',
    'run-limit', 'time-limit', 'user-active', 'reviewed-uncertain', 'worker-exited', 'dropped', 'target-deleted',
    'restart', 'binding-changed', 'execution-not-started', 'reply-read-pending', 'delivery-interrupted', 'delivery-retrying']);
const reason = value => typeof value === 'string' && value ? (REASONS.has(value) ? value : 'other') : null;
const execution = status => ({ waiting: 'pending', dispatching: 'running', running: 'running', completed: 'completed', silent: 'silent',
    skipped: 'skipped', cancelled: 'skipped', stopped: 'stopped', failed: 'failed', error: 'failed', uncertain: 'uncertain' })[status] || 'unknown';
const delivery = status => ({ queued: 'pending', dispatching: 'pending', running: 'pending', ready: 'pending', sending: 'sending', delivered: 'delivered',
    partial: 'partial', failed: 'failed', uncertain: 'uncertain', cancelled: 'skipped', ignored: 'skipped', reviewed: 'reviewed' })[status] || 'unknown';

class BotActivity {
    constructor({ bots, cron, proactive, channels, now = Date.now }) { Object.assign(this, { bots, cron, proactive, channels, now }); }

    async snapshot(profileId) {
        if (typeof profileId !== 'string' || !UUID.test(profileId)) throw Object.assign(new Error('Invalid bot ID'), { status: 400 });
        let profile;
        try { profile = await this.bots.profiles.getProfile(profileId); }
        catch { throw unavailable(); }
        const bot = readBot(profile);
        if (!bot || profile.trashedAt !== undefined) throw Object.assign(new Error('Bot not found'), { status: 404 });
        let windows;
        try { windows = (await this.bots.windows.read(profileId)).state.windows; }
        catch { throw unavailable(); }
        const byWindow = new Map(windows.map(window => [window.id, window]));
        const bySession = new Map();
        for (const window of windows) for (const generation of window.generations.slice(-LIMITS.generationsPerWindow)) {
            const key = JSON.stringify([window.cwd, generation.sessionId]);
            bySession.set(key, bySession.has(key) ? null : window);
        }
        const windowById = windowId => byWindow.get(windowId);
        const main = windows.find(window => window.kind === 'main');
        const futureWindow = target => target?.kind === 'profile' && target.profileId === profileId
            ? windowById(target.windowId ?? main?.id) : target?.kind === 'thread' ? actualWindow(target) : null;
        const actualWindow = target => {
            if (!target || target.bot && target.bot.profileId !== profileId) return null;
            const window = bySession.get(JSON.stringify([target.cwd, target.sessionId]));
            return window && (!target.bot || (target.bot.windowId ?? main?.id) === window.id) ? window : null;
        };
        const now = this.now(), items = [], sources = { proactive: 'unavailable', scheduler: 'unavailable', channels: 'unavailable' };
        const quota = { proactivePushes: null, scheduledTasks: null };
        let held = new Set();
        if (this.proactive) try {
            const { state } = await this.proactive.read(profileId);
            const zone = bot.notify?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
            const day = dayKey(now, zone);
            quota.proactivePushes = { day, timeZone: zone, used: state.push.day === day ? count(state.push.count) : 0,
                limit: bot.notify?.dailyProactiveLimit ?? null, held: state.held.length };
            held = new Set(state.held.map(entry => entry.completionId));
            for (const item of state.items) {
                if (!windowById(item.windowId)) continue;
                items.push({ id: item.runId ? id('run', item.runId) : id('follow-up', item.id), kind: 'follow-up', windowId: item.windowId, at: time(item.at),
                    execution: item.state === 'pending' || item.state === 'sending' ? 'pending' : item.state === 'skipped' ? 'skipped' : 'unknown',
                    delivery: item.state === 'skipped' ? 'none' : 'unknown', reason: reason(item.reason) });
            }
            sources.proactive = 'available';
        } catch { /* Unknown is not an empty result. */ }
        if (this.cron) try {
            await this.cron.ready; this.cron.healthy();
            const db = this.cron.db, day = new Date(now).toISOString().slice(0, 10);
            const limits = db.limits(), today = db.usage(day);
            quota.scheduledTasks = { day, timeZone: 'UTC', scope: 'all-user-scheduled-tasks',
                runs: count(today.runs), maxRuns: count(limits.maxRunsPerDay), tokens: count(today.tokens), maxTokens: count(limits.maxTokensPerDay),
                estimatedCost: today.unknownCost || !Number.isFinite(today.cost) ? null : today.cost,
                maxCost: Number.isFinite(limits.maxCostPerDay) ? limits.maxCostPerDay : null };
            for (const run of db.runs().slice(0, LIMITS.schedulerRuns)) {
                const window = run.target ? actualWindow(run.target) : run.status === 'waiting' ? futureWindow(run.job?.target) : null;
                if (!window) continue;
                const runId = id('run', run.id), existing = items.findIndex(item => item.id === runId);
                if (existing >= 0) items.splice(existing, 1);
                items.push({ id: runId, kind: run.origin === 'bot' ? 'follow-up' : 'scheduled', windowId: window.id,
                    at: time(run.completedAt ?? run.startedAt ?? run.scheduledAt), execution: execution(run.status),
                    delivery: held.has(run.id) ? 'held' : ['silent', 'skipped', 'cancelled'].includes(run.status) ? 'none'
                        : run.channelNotify?.status === 'pending' ? 'pending' : run.channelNotify?.status === 'skipped' ? 'skipped' : 'unknown',
                    reason: reason(run.reason), ...(run.origin !== 'bot' && /^[a-f0-9-]{36}$/.test(run.jobId) ? { jobId: run.jobId } : {}) });
            }
            for (const job of db.jobs().slice(0, LIMITS.jobs)) {
                const window = futureWindow(job.target);
                if (!window || job.deleted || !job.enabled || !Number.isFinite(job.nextAt)) continue;
                items.push({ id: id('job', job.id), kind: 'scheduled', windowId: window.id, at: job.nextAt,
                    execution: 'pending', delivery: 'unknown', reason: null, ...(/^[a-f0-9-]{36}$/.test(job.id) ? { jobId: job.id } : {}) });
            }
            sources.scheduler = 'available';
        } catch { /* Do not expose raw scheduler errors. */ }
        if (this.channels) try {
            await this.channels.ready;
            if (this.channels.error || !this.channels.db?.value) throw new Error('Unavailable');
            for (const job of this.channels.db.value.jobs.slice(-LIMITS.channelJobs).reverse()) {
                const window = actualWindow({ ...job.target, ...(job.bot ? { bot: job.bot } : {}) });
                if (!window) continue;
                items.push({ id: id('channel', job.id), kind: 'channel', windowId: window.id, at: time(job.at),
                    execution: 'unknown', delivery: delivery(job.status), reason: reason(job.deliveryError || job.reason) });
            }
            sources.channels = 'available';
        } catch { /* Do not include account IDs, recipients, credentials or message bodies. */ }
        const ordered = items.sort((a, b) => {
            const priority = item => ['running', 'uncertain', 'failed'].includes(item.execution) || ['uncertain', 'failed', 'partial'].includes(item.delivery) ? 0 : item.execution === 'pending' ? 1 : 2;
            return priority(a) - priority(b) || (priority(a) === 1 ? a.at - b.at : b.at - a.at);
        });
        return { version: 1, profileId, generatedAt: now, sources, limits: LIMITS, truncated: ordered.length > LIMITS.items,
            items: ordered.slice(0, LIMITS.items), quota };
    }
}

module.exports = { BotActivity, LIMITS };
