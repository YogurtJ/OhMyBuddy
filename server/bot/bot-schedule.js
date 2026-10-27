'use strict';
const { createHash } = require('node:crypto');
const { localParts, wallInstant, parseCron } = require('../pi-cron-schedule');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
const defaultTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const followUpId = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);

function localTime(at, timeZone) {
    const p = localParts(at, timeZone), pad = value => String(value).padStart(2, '0');
    return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

// Shared by the worker approval and execution: provider-materialized empty optionals
// are omitted, and the default zone is fixed before showing the approval card.
function normalizeScheduleInput(raw) {
    const fields = { create: ['title', 'message', 'once', 'repeat', 'timeZone', 'needsTools', 'proactive'], list: ['timeZone'], cancel: ['id'] };
    const known = new Set(['action', ...Object.values(fields).flat()]);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.hasOwn(fields, raw.action)
        || Object.keys(raw).some(key => !known.has(key))) fail('Invalid bot_schedule arguments');
    const input = { action: raw.action };
    for (const key of fields[raw.action]) {
        const value = raw[key];
        if (value === undefined || value === null || typeof value === 'string' && !value.trim()) continue;
        input[key] = value;
    }
    if (input.action !== 'cancel') {
        input.timeZone ??= defaultTimeZone();
        localParts(0, input.timeZone); // Validate even when listing an empty schedule.
    }
    if (input.action === 'create') {
        if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120
            || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 40000) fail('A title (up to 120 characters) and message are required');
        input.title = input.title.trim();
        if ((input.once === undefined) === (input.repeat === undefined)) fail('Specify exactly one of once or repeat');
        if (input.needsTools !== undefined && typeof input.needsTools !== 'boolean') fail('Invalid needsTools');
        if (input.proactive !== undefined && typeof input.proactive !== 'boolean') fail('Invalid proactive');
        if (input.proactive === false) delete input.proactive;
        // A check-in the Bot starts itself: once, a message only, short.
        if (input.proactive && (input.repeat !== undefined || input.needsTools === true || input.message.length > 2000))
            fail('A proactive check-in is a single message (once, no tools, up to 2000 characters)');
        if (input.repeat !== undefined) input.repeat = parseCron(input.repeat).expression;
        if (input.once !== undefined) onceInstant(input.once, input.timeZone);
    }
    if (input.action === 'cancel' && !uuid(input.id) && !followUpId(input.id)) fail('A valid task id is required');
    return input;
}
function onceInstant(once, timeZone) {
    const match = typeof once === 'string' && /^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):([0-5]\d)$/.exec(once);
    if (!match) fail('Use once as YYYY-MM-DD HH:mm in the task time zone');
    const [, year, month, day, hour, minute] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 1000 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) fail('Invalid local date');
    const at = wallInstant({ year, month, day }, hour, minute, timeZone);
    if (at === null) fail('This local time does not exist in this time zone (daylight-saving gap); choose another time');
    return at;
}
function scheduleFor(input) {
    return input.once !== undefined ? { kind: 'once', at: onceInstant(input.once, input.timeZone), timeZone: input.timeZone }
        : { kind: 'cron', expression: input.repeat, timeZone: input.timeZone };
}
function jobView(job) {
    return { id: job.id, title: job.name, message: job.prompt.slice(0, 500), schedule: job.schedule, nextAt: job.nextAt,
        enabled: job.enabled, revision: job.revision, windowId: job.target.windowId ?? null,
        local: job.nextAt === null ? null : localTime(job.nextAt, job.schedule.timeZone) };
}
function scheduleDetail(input) {
    if (input.action === 'cancel') {
        const job = input.approvalJob;
        if (!job) return `Cancel: ${input.id}`;
        const time = job.schedule.kind === 'cron' ? job.schedule.expression : localTime(job.schedule.at, job.schedule.timeZone);
        return `Cancel: ${job.title}\n${time} (${job.schedule.timeZone})`;
    }
    if (input.proactive) return `Check back with you (my own follow-up): ${input.title}\n${input.once} (${input.timeZone ?? defaultTimeZone()})`;
    return `Create: ${input.title}\n${input.once ?? input.repeat} (${input.timeZone ?? defaultTimeZone()})`;
}
// UUID with a private, stable namespace. Retries of one native tool call address one job.
function scheduleId(sessionId, toolCallId) {
    const hex = createHash('sha256').update(JSON.stringify(['pivane-bot-schedule-v1', sessionId, toolCallId])).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function mountBotSchedule(router, { cron, bots, authenticate }) {
    for (const action of ['create', 'list', 'cancel']) router.post(`/bot-schedule/${action}`, async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            // Never accept a workspace Cookie or management token in place of the worker token.
            const worker = authenticate(req)?.worker;
            if (!worker || worker.disposed || worker.restarting || worker.noSession || !worker.loadedBot) fail('A live Bot window worker is required', 403);
            const { profileId, windowId, generation } = worker.loadedBot;
            const window = await bots.assertCurrentWindowSession(profileId, windowId, { id: worker.sessionId, path: worker.sessionPath });
            if (window.cwd !== worker.cwd || window.current.generation !== generation) fail('Bot window generation changed', 409);
            const { toolCallId, expectedRevision, ...raw } = req.body || {};
            if (raw.action !== undefined || action !== 'create' && toolCallId !== undefined
                || action !== 'cancel' && expectedRevision !== undefined) fail('Invalid bot_schedule request');
            const input = normalizeScheduleInput({ ...raw, action });
            await cron.ready; cron.healthy();
            const belongs = job => job && !job.deleted && job.target.kind === 'profile' && job.target.profileId === profileId;
            const followUps = async () => (await bots.proactive?.list(profileId) || []).map(item => ({ ...item, local: localTime(item.at, input.timeZone ?? defaultTimeZone()) }));
            if (action === 'list') {
                const planned = await followUps();
                return res.json({ v: 1, action: 'listed', jobs: cron.db.jobs().filter(belongs).map(jobView), ...(planned.length ? { followUps: planned } : {}), now: localTime(cron.now(), input.timeZone) });
            }
            if (action === 'cancel' && followUpId(input.id)) {
                if (!bots.proactive) fail('Follow-ups are unavailable', 503);
                const { cancelled } = await bots.proactive.cancel(profileId, input.id);
                return res.json({ v: 1, action: 'cancelled', proactive: true, profileId, followUp: cancelled });
            }
            if (action === 'cancel') {
                const job = cron.db.job(input.id);
                if (!belongs(job)) fail('Task not found', 404);
                if (expectedRevision !== undefined && expectedRevision !== job.revision) fail('The task changed after it was approved; list again', 409);
                const cancelled = await cron.action(job.id, { action: 'delete', revision: job.revision });
                return res.json({ v: 1, action: 'cancelled', job: jobView(cancelled) });
            }
            if (worker.cronRun) fail('Cannot create scheduled tasks during an unattended scheduled run', 409);
            if (typeof toolCallId !== 'string' || !toolCallId.trim() || toolCallId.length > 500) fail('A stable toolCallId is required');
            if (input.proactive) {
                if (!bots.proactive) fail('Follow-ups are unavailable', 503);
                const at = onceInstant(input.once, input.timeZone);
                const { item } = await bots.proactive.checkIn(profileId, windowId, { id: scheduleId(worker.sessionId, toolCallId).replace(/-/g, '').slice(0, 24),
                    title: input.title, message: input.message, at });
                return res.json({ v: 1, action: 'created', proactive: true, profileId, followUp: { ...item, local: localTime(item.at, input.timeZone) } });
            }
            const schedule = scheduleFor(input), id = scheduleId(worker.sessionId, toolCallId);
            const job = { id, name: input.title, prompt: input.message, enabled: true, mode: input.needsTools === true ? 'work' : 'text', schedule,
                target: { kind: 'profile', profileId, ...(window.kind === 'topic' ? { windowId } : {}) } };
            const previous = cron.db.job(id);
            // A successful once-task retry remains readable even after its time has passed.
            if (previous && !previous.deleted) {
                const fingerprint = createHash('sha256').update(JSON.stringify(require('../pi-cron-service').validateJob(job, previous.createdAt))).digest('hex');
                if (previous.fingerprint === fingerprint) return res.json({ v: 1, action: 'created', job: jobView(previous) });
            }
            if (schedule.kind === 'once' && schedule.at <= cron.now()) fail('The requested local time is in the past; choose a future time');
            return res.json({ v: 1, action: 'created', job: jobView(await cron.save(job)) });
        } catch (error) { res.status(error.status || 400).json({ error: error.message }); }
    });
}
module.exports = { normalizeScheduleInput, scheduleFor, scheduleDetail, scheduleId, localTime, jobView, mountBotSchedule };
