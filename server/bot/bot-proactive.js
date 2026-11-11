'use strict';
// Messages a Bot starts by itself (M4-3; D-007, D-045, D-047): a follow-up when a commitment noted
// in a chat's notebook falls due, and check-ins the Bot sets up on its own (bot_schedule with
// proactive). This module keeps each Bot's small schedule and decides whether a finished message is
// pushed now, held for the end of quiet hours (one combined push) or only left in the chat (the
// daily push limit is reached). Running the message goes through the scheduler's run engine
// (CronService.enqueueProactive), which keeps its one-run-per-ID, busy-session and uncertain-run
// protections. The user's own reminders, conversations and setup are never counted or delayed.
//
// <agentDir>/pivane-bots/<profileId>/proactive.json:
//   { version: 1, profileId, items: [item], push: { day, count }, held: [{ completionId, at, cwd?, sessionId? }] }
//   item.state: pending (cancellable), sending (claimed, being handed to the scheduler), queued, skipped
//   item: { id, kind: 'due'|'checkin', windowId, noteId?, due?, at, title, text, state, reason?, runId?, createdAt }
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { localParts, wallInstant, dayKey } = require('../pi-cron-schedule');
const { safeFile } = require('../pi-native-service');
const privateFiles = require('../pi-private-files');
const { PrivateJsonDocument } = require('./bot-json-store');
const settings = require('./bot-settings');

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const ITEM_ID = /^[a-f0-9]{24}$/;
const KINDS = Object.freeze(['due', 'checkin']);
const STATES = Object.freeze(['pending', 'sending', 'queued', 'skipped']);
const MAX_PENDING = 60;          // follow-ups and check-ins waiting, per Bot
const MAX_CHECKINS = 10;         // check-ins waiting, per Bot
const MAX_KEPT = 20;             // finished items kept for the settings list and idempotent retries
const MAX_HELD = 200;
const MAX_TOMBSTONES = 100;      // cancelled due follow-ups still ahead, so a sync does not add them back
const MAX_AHEAD = 60 * 86400000; // a check-in at most 60 days ahead
const LATE = 2 * 3600000;        // a message missed by more than this (service stopped) is dropped
const DUE_HOUR = 9;
const REPLY_SYNC = 2 * 60000;              // a date without a time is followed up that morning
const fail = (message, status = 400, code) => { throw Object.assign(new Error(message), { status, ...(code ? { code } : {}) }); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.length <= max;
const hash = (...parts) => createHash('sha256').update(JSON.stringify(['pivane-bot-proactive-v1', ...parts])).digest('hex');
const serverZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const zoneOf = notify => notify?.timeZone || serverZone();
const minutes = clock => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

// Quiet hours in the user's zone; a span that passes midnight (23:00-08:00) wraps.
function isQuiet(notify, at) {
    const quiet = notify?.quietHours;
    if (!quiet) return false;
    const p = localParts(at, zoneOf(notify)), now = p.hour * 60 + p.minute, start = minutes(quiet.start), end = minutes(quiet.end);
    return start < end ? now >= start && now < end : now >= start || now < end;
}

// The instant a due note is followed up: its time, or that morning for a date. null: not usable.
function dueInstant(due, zone) {
    if (typeof due !== 'string') return null;
    const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
    if (date) return wallInstant({ year: Number(date[1]), month: Number(date[2]), day: Number(date[3]) }, DUE_HOUR, 0, zone);
    if (/(?:Z|[+-]\d{2}:\d{2})$/.test(due)) { const at = Date.parse(due.replace(' ', 'T')); return Number.isFinite(at) ? at : null; }
    const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(due);
    return local ? wallInstant({ year: Number(local[1]), month: Number(local[2]), day: Number(local[3]) }, Number(local[4]), Number(local[5]), zone) : null;
}

function validItem(item) {
    return object(item) && ITEM_ID.test(item.id) && KINDS.includes(item.kind) && UUID.test(item.windowId) && Number.isSafeInteger(item.at)
        && text(item.title, 120) && item.title && text(item.text, 2000) && item.text && STATES.includes(item.state)
        && (item.noteId === undefined || text(item.noteId, 16)) && (item.due === undefined || text(item.due, 40))
        && (item.runId === undefined || /^[a-f0-9]{64}$/.test(item.runId)) && (item.reason === undefined || text(item.reason, 40))
        && Number.isSafeInteger(item.createdAt);
}
function validState(state, profileId) {
    return object(state) && state.version === 1 && state.profileId === profileId && Array.isArray(state.items) && state.items.length <= MAX_PENDING + MAX_TOMBSTONES + MAX_KEPT + 10
        && state.items.every(validItem) && object(state.push) && (state.push.day === null || text(state.push.day, 10)) && Number.isSafeInteger(state.push.count)
        && Array.isArray(state.held) && state.held.length <= MAX_HELD && state.held.every(entry => object(entry) && text(entry.completionId, 200) && Number.isSafeInteger(entry.at)
            && (entry.cwd === undefined || text(entry.cwd, 4096)) && (entry.sessionId === undefined || text(entry.sessionId, 200)));
}
const empty = profileId => ({ version: 1, profileId, items: [], push: { day: null, count: 0 }, held: [] });

// Pending and claimed items always stay, and so do cancelled due follow-ups still ahead (up to
// MAX_TOMBSTONES, the soonest); of the rest only the newest MAX_KEPT are kept.
const live = item => item.state === 'pending' || item.state === 'sending';
const tombstone = (item, now) => item.state === 'skipped' && item.reason === 'cancelled' && item.kind === 'due' && item.at > now;
function trim(state, now) {
    const stones = state.items.filter(item => tombstone(item, now)).sort((a, b) => a.at - b.at);
    const rest = state.items.filter(item => !live(item) && !tombstone(item, now)).sort((a, b) => b.at - a.at);
    const drop = new Set([...stones.slice(MAX_TOMBSTONES), ...rest.slice(MAX_KEPT)]);
    if (drop.size) state.items = state.items.filter(item => !drop.has(item));
}
const view = item => ({ id: item.id, kind: item.kind, windowId: item.windowId, at: item.at, title: item.title, state: item.state,
    ...(item.noteId ? { noteId: item.noteId } : {}), ...(item.due ? { due: item.due } : {}), ...(item.reason ? { reason: item.reason } : {}) });

// What the Bot is asked to do when a noted commitment falls due (model-facing).
function duePrompt(note) {
    return `A commitment in your Buddy-wide notebook is due now: [${note.id}] "${note.text}" (due ${note.due}).\n`
        + 'Write one short, natural message about it in your usual voice. If it was the user\'s commitment, remind them gently and ask how it is going. '
        + 'If it was yours, say where it stands or ask whether they still want it. Do not start the work itself. '
        + 'If it was already settled in this conversation, finish with cron_silent instead.';
}

class BotProactive {
    // preferences: reply notices, so pages without push also hear about held messages once quiet hours end.
    constructor({ profiles, bots, cron, notifications, preferences, getAgentDir, isSuspended = () => false, now = Date.now, interval = 60000 }) {
        Object.assign(this, { profiles, bots, cron, notifications, preferences, getAgentDir, isSuspended, now, interval });
        this.timer = null; this.ticking = null; this.syncing = new Map(); this.stopped = false; this.replies = new Map();
    }

    // After a reply: the notebook is read from the session file, so a busy chat is synced at most
    // every two minutes, always including its latest reply (a due time is never that close).
    afterReply(profileId, windowId) {
        if (this.stopped || !UUID.test(profileId || '') || !UUID.test(windowId || '')) return;
        const key = `${profileId}/${windowId}`, now = this.now(), entry = this.replies.get(key);
        const run = () => { void this.syncNotes(profileId, windowId).catch(() => {}); };
        if (!entry || now - entry.last >= REPLY_SYNC) {
            if (entry?.timer) clearTimeout(entry.timer);
            this.replies.set(key, { last: now, timer: null });
            if (this.replies.size > 2000) this.replies.delete(this.replies.keys().next().value);
            return run();
        }
        if (entry.timer) return;
        entry.timer = setTimeout(() => { entry.timer = null; entry.last = this.now(); run(); }, REPLY_SYNC - (now - entry.last));
        entry.timer.unref?.();
    }

    async document(profileId, create = false) {
        if (!UUID.test(profileId)) fail('Invalid bot ID');
        const file = safeFile(await this.getAgentDir(), ['pivane-bots', profileId, 'proactive.json'], create);
        const root = path.dirname(file);
        if (create) {
            privateFiles.privateDirectory(path.dirname(root)); privateFiles.privateDirectory(root);
            if (process.platform !== 'win32') { fs.chmodSync(path.dirname(root), 0o700); fs.chmodSync(root, 0o700); }
        }
        return new PrivateJsonDocument({ root, name: 'proactive.json', maxBytes: 512 * 1024, label: 'Bot proactive messages',
            validate: state => validState(state, profileId), empty: () => empty(profileId) });
    }

    async read(profileId) {
        if (!fs.existsSync(safeFile(await this.getAgentDir(), ['pivane-bots', profileId, 'proactive.json']))) return { state: empty(profileId), revision: null };
        const { state, revision } = (await this.document(profileId)).read();
        return { state, revision };
    }

    // Read, change and save with the revision just read; a concurrent change is retried once.
    async mutate(profileId, update) {
        for (let attempt = 0; ; attempt++) {
            const document = await this.document(profileId, true);
            const { revision } = document.read();
            try { return document.mutate(revision, state => { const result = update(state) ?? {}; trim(state, this.now()); return result; }); }
            catch (error) { if (error.status !== 409 || attempt) throw error; }
        }
    }

    async bot(profileId) {
        const profile = await this.profiles.getProfile(profileId);
        const bot = profile && settings.isBot(profile) ? settings.readBot(profile) : null;
        return bot ? { profile, bot, notify: bot.notify } : null;
    }

    // ---- schedule -------------------------------------------------------------------------

    // Follow-ups for the commitments with a due time in one chat's notebook, kept in step after
    // each reply and each notebook edit. A changed due time is a new follow-up; one already sent
    // is not sent again. Nothing new is added while proactive messages are off.
    syncBuddyNotes(profileId) { return this.syncNotes(profileId, null); }

    syncNotes(profileId, windowId) {
        const key = `${profileId}/${this.bots.notebooks ? 'buddy' : windowId}`;
        const previous = this.syncing.get(key) || Promise.resolve();
        const next = previous.catch(() => {}).then(() => this.syncNow(profileId, windowId));
        this.syncing.set(key, next);
        return next.finally(() => { if (this.syncing.get(key) === next) this.syncing.delete(key); });
    }
    async syncNow(profileId, windowId) {
        if (this.stopped) return { changed: 0 };
        const found = await this.bot(profileId);
        let notes = [];
        const shared = Boolean(this.bots.notebooks);
        const windows = (await this.bots.windows.read(profileId)).state.windows;
        const main = windows.find(window => window.kind === 'main' && window.current);
        const targetOf = note => windows.find(window => window.id === note.source?.windowId && window.current && !window.archivedAt && !window.trashedAt) || main;
        if (found?.notify.proactive) {
            if (shared) notes = (await this.bots.notebooks.read(profileId)).items
                .filter(item => item.kind === 'commitment' && item.status === 'active' && item.due && targetOf(item));
            else {
                const window = windows.find(item => item.id === windowId);
                if (window?.current && !window.archivedAt && !window.trashedAt) notes = (await this.bots.notebook(profileId, windowId)).items
                    .filter(item => item.kind === 'commitment' && item.status === 'active' && item.due);
            }
        }
        const zone = zoneOf(found?.notify), now = this.now();
        // keep: every active commitment's follow-up, even one about to be sent (the next tick sends it);
        // wanted: those far enough ahead to be added now.
        const keep = new Map(), wanted = new Map();
        for (const note of notes) {
            const at = dueInstant(note.due, zone);
            if (at === null) continue;
            const target = shared ? targetOf(note).id : windowId;
            const id = hash('due', shared ? note.legacy?.windowId || 'buddy' : windowId, shared ? note.legacy?.id || note.id : note.id, at).slice(0, 24);
            const item = { id, kind: 'due', windowId: target, noteId: note.id, due: note.due, at, title: note.text.slice(0, 120), text: duePrompt(note), state: 'pending', createdAt: now };
            keep.set(id, item);
            if (at > now + 60000) wanted.set(id, item);
        }
        if (!wanted.size && !(await this.read(profileId)).state.items.some(item => item.kind === 'due' && (shared || item.windowId === windowId) && item.state === 'pending')) return { changed: 0 };
        const { changed } = await this.mutate(profileId, state => {
            let changed = 0;
            state.items = state.items.filter(item => {
                if (item.kind !== 'due' || !shared && item.windowId !== windowId || item.state !== 'pending' || keep.has(item.id)) return true;
                changed++; return false;
            });
            for (const [id, item] of keep) {
                const existing = state.items.find(entry => entry.id === id);
                if (existing?.state === 'pending' && (existing.title !== item.title || existing.text !== item.text || existing.due !== item.due || existing.windowId !== item.windowId)) {
                    Object.assign(existing, { title: item.title, text: item.text, due: item.due, windowId: item.windowId, noteId: item.noteId }); changed++;
                }
            }
            for (const [id, item] of wanted) {
                if (state.items.some(entry => entry.id === id)) continue;
                if (state.items.filter(entry => entry.state === 'pending').length >= MAX_PENDING) break;
                state.items.push(item); changed++;
            }
            return { changed };
        });
        return { changed };
    }

    // A check-in the Bot sets up itself. id: stable per native tool call, so a retry finds it.
    async checkIn(profileId, windowId, { id, title, message, at }) {
        if (!ITEM_ID.test(id)) fail('Invalid follow-up id');
        if (typeof title !== 'string' || !title.trim() || title.length > 120 || typeof message !== 'string' || !message.trim() || message.length > 2000)
            fail('A title (up to 120 characters) and a message (up to 2000) are required');
        const found = await this.bot(profileId);
        if (!found) fail('Bot is unavailable', 409);
        if (!found.notify.proactive) fail('The user has turned off messages this Bot starts by itself', 409, 'BOT_PROACTIVE_OFF');
        const now = this.now();
        const { item } = await this.mutate(profileId, state => {
            const existing = state.items.find(item => item.id === id);
            if (existing) return { item: view(existing) };
            if (at <= now + 60000) fail('Choose a time in the future');
            if (at > now + MAX_AHEAD) fail('A check-in can be at most 60 days ahead');
            const pending = state.items.filter(item => item.state === 'pending');
            if (pending.filter(item => item.kind === 'checkin').length >= MAX_CHECKINS) fail('Too many check-ins are already waiting; cancel one first', 409, 'BOT_CHECKIN_LIMIT');
            if (pending.length >= MAX_PENDING) fail('Too many follow-ups are already waiting', 409, 'BOT_CHECKIN_LIMIT');
            const item = { id, kind: 'checkin', windowId, at, title: title.trim(), text: message.trim(), state: 'pending', createdAt: now };
            state.items.push(item);
            return { item: view(item) };
        });
        return { item };
    }

    async known(profileId) {
        if (!UUID.test(profileId || '')) fail('Invalid bot ID');
        const profile = await this.profiles.getProfile(profileId);
        if (!profile || !settings.readBot(profile)) fail('Bot not found', 404);
    }

    async list(profileId) {
        await this.known(profileId);
        const { state } = await this.read(profileId);
        return state.items.filter(item => item.state === 'pending').sort((a, b) => a.at - b.at).map(view);
    }

    // Cancelled by the user (settings) or the Bot. A follow-up already being sent cannot be taken back.
    async cancel(profileId, id) {
        if (!ITEM_ID.test(id)) fail('Invalid follow-up id');
        await this.known(profileId);
        const { cancelled } = await this.mutate(profileId, state => {
            const item = state.items.find(entry => entry.id === id);
            if (!item) fail('Follow-up not found', 404);
            if (item.state !== 'pending') fail('This follow-up is already being sent or was dropped', 409);
            state.items = state.items.filter(entry => entry !== item);
            // A cancelled due follow-up is remembered as skipped, so the next sync does not add it back.
            if (item.kind === 'due') state.items.push({ ...item, state: 'skipped', reason: 'cancelled' });
            return { cancelled: view(item) };
        });
        return { cancelled };
    }

    // ---- sending and pushing -----------------------------------------------------------------

    start() {
        if (this.timer || this.stopped) return;
        this.timer = setInterval(() => { void this.tick(); }, this.interval);
        this.timer.unref?.();
    }
    async dispose() {
        this.stopped = true;
        clearInterval(this.timer); this.timer = null;
        for (const entry of this.replies.values()) clearTimeout(entry.timer);
        this.replies.clear();
        await this.ticking?.catch(() => {});
        await Promise.allSettled([...this.syncing.values()]);
    }

    tick() {
        if (this.ticking || this.stopped || this.isSuspended()) return this.ticking;
        this.ticking = (async () => {
            const { state } = await this.profiles.state();
            for (const profile of state.profiles) {
                if (this.stopped || this.isSuspended()) break;
                // One Bot's failure must not stop the others; retried on the next tick.
                try {
                    if (!settings.readBot(profile) || !fs.existsSync(safeFile(await this.getAgentDir(), ['pivane-bots', profile.id, 'proactive.json']))) continue;
                    await this.tickBot(profile.id);
                } catch { /* next tick */ }
            }
        })().catch(() => { /* Registry unreadable: next tick. */ }).finally(() => { this.ticking = null; });
        return this.ticking;
    }

    async tickBot(profileId) {
        const now = this.now(), found = await this.bot(profileId);
        if (this.bots.notebooks) await this.syncBuddyNotes(profileId);
        const { state } = await this.read(profileId);
        const due = state.items.filter(item => live(item) && item.at <= now);
        if (due.length) {
            const windows = found ? (await this.bots.windows.read(profileId)).state.windows : [];
            const plan = new Map();
            for (const item of due) {
                const window = windows.find(entry => entry.id === item.windowId);
                const reason = !found ? 'bot-unavailable' : !found.notify.proactive ? 'off' : !window?.current || window.archivedAt || window.trashedAt ? 'chat-gone'
                    : now - item.at > LATE ? 'late' : null;
                plan.set(item.id, reason ? { state: 'skipped', reason } : { state: 'sending', runId: hash('run', profileId, item.id), window });
            }
            // Claimed first, so a cancellation from now on is refused instead of racing the scheduler.
            const { claimed } = await this.mutate(profileId, next => {
                const claimed = [];
                for (const item of next.items) {
                    const step = plan.get(item.id);
                    if (!step || !live(item)) continue;
                    if (step.state === 'skipped') { Object.assign(item, { state: 'skipped', reason: step.reason }); delete item.runId; continue; }
                    Object.assign(item, { state: 'sending', runId: step.runId });
                    claimed.push({ ...item, window: step.window });
                }
                return { claimed };
            });
            const outcome = new Map();
            for (const item of claimed) {
                try {
                    // Idempotent per runId: a claimed item retried after a crash or a busy scheduler is one run.
                    await this.cron.enqueueProactive({ runId: item.runId, profileId, windowId: item.window.kind === 'main' ? undefined : item.window.id, at: item.at,
                        name: item.title, prompt: item.text, note: item.title, kind: item.kind, timeZone: zoneOf(found.notify) });
                    outcome.set(item.id, { state: 'queued' });
                } catch (error) {
                    // Scheduler busy or stopping: stays claimed and is tried again next tick. Anything else drops it.
                    if (error.status !== 409 && error.status !== 503) outcome.set(item.id, { state: 'skipped', reason: 'refused' });
                }
            }
            if (outcome.size) await this.mutate(profileId, next => { for (const item of next.items) if (item.state === 'sending' && outcome.has(item.id)) Object.assign(item, outcome.get(item.id)); });
        }
        // The end of quiet hours: one push for everything held, if today's limit allows.
        if (state.held.length && found && !isQuiet(found.notify, now)) await this.flush(profileId, found);
    }

    // A finished proactive message: 'push' now, 'held' for the end of quiet hours, or 'capped'
    // (left in the chat only). Unknown Bots and read failures do not push.
    async decide(notice) {
        const profileId = notice?.proactive?.profileId;
        const found = UUID.test(profileId || '') ? await this.bot(profileId) : null;
        // Switched off after the message was queued: it stays in the chat without a push.
        if (!found || !found.notify.proactive) return 'capped';
        const now = this.now(), quiet = isQuiet(found.notify, now), day = dayKey(now, zoneOf(found.notify)), limit = found.notify.dailyProactiveLimit;
        return (await this.mutate(profileId, state => {
            if (state.push.day !== day) state.push = { day, count: 0 };
            if (quiet) {
                if (!state.held.some(entry => entry.completionId === notice.completionId)) state.held.push({ completionId: notice.completionId, at: now,
                    ...(typeof notice.cwd === 'string' && typeof notice.sessionId === 'string' ? { cwd: notice.cwd, sessionId: notice.sessionId } : {}) });
                if (state.held.length > MAX_HELD) state.held.splice(0, state.held.length - MAX_HELD);
                return { decision: 'held' };
            }
            if (limit !== null && state.push.count >= limit) return { decision: 'capped' };
            state.push.count++;
            return { decision: 'push' };
        })).decision;
    }

    // Held messages are cleared only after the push was taken by the notification service (or there
    // is nothing to push: switched off or over today's limit); a busy service is retried next tick.
    async flush(profileId, found) {
        const now = this.now(), day = dayKey(now, zoneOf(found.notify)), limit = found.notify.dailyProactiveLimit;
        const { state } = await this.read(profileId);
        const held = state.held;
        if (!held.length) return;
        const used = state.push.day === day ? state.push.count : 0;
        const push = found.notify.proactive && (limit === null || used < limit);
        if (push) {
            const count = held.length;
            const accepted = await this.notifications?.broadcast?.({ id: hash('digest', profileId, now).slice(0, 32), title: 'OhMyBuddy',
                body: count === 1 ? `${found.profile.name} 在安静时段给你留了 1 条消息。` : `${found.profile.name} 在安静时段给你留了 ${count} 条消息。` });
            if (accepted === false) return;
            this.reveal(held);
            // WeChat chats connected to the Bot get the held messages themselves.
            for (const entry of held) { try { this.cron?.notifyProactive?.(entry.completionId); } catch { /* best effort */ } }
        }
        const ids = new Set(held.map(entry => entry.completionId));
        await this.mutate(profileId, next => {
            next.held = next.held.filter(entry => !ids.has(entry.completionId));
            if (!push) return;
            if (next.push.day !== day) next.push = { day, count: 0 };
            next.push.count++;
        });
    }

    // Pages without push notifications hear about held messages too: a chat whose held reply is
    // still unread gets its notice again without quiet, under a new id, so open pages alert once.
    reveal(held) {
        if (!this.preferences) return;
        try {
            const notices = this.preferences.getReplyNotices();
            for (const entry of held) {
                const notice = entry.cwd && notices.find(item => item.cwd === entry.cwd && item.sessionId === entry.sessionId && item.completionId === entry.completionId && item.quiet);
                if (notice) this.preferences.recordReplyNotice({ cwd: notice.cwd, sessionId: notice.sessionId,
                    completionId: hash('reveal', notice.completionId).slice(0, 36), completedAt: new Date(this.now()).toISOString() });
            }
        } catch { /* Page alerts are best effort. */ }
    }
}

module.exports = { BotProactive, isQuiet, dueInstant, duePrompt, MAX_CHECKINS };
