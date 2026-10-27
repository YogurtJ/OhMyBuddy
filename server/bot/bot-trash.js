'use strict';
// Reversible Bot retirement. The caller owns profiles.reserve for the entire operation.
// No session, memory, document, media or workspace is deleted.
const fs = require('node:fs');
const { readBot } = require('./bot-settings');
const { sameThreadTarget } = require('./bot-topic');
const fail = (message, status = 409, code) => { throw Object.assign(new Error(message), { status, code }); };
async function trashBot(service, profileId, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.expectedRevision !== 'string'
        || Object.keys(input).some(key => key !== 'expectedRevision')) fail('Invalid Bot trash request', 400, 'BOT_TRASH_INVALID');
    const before = await service.profiles.state();
    if (before.revision !== input.expectedRevision) fail('Profiles changed; reload before saving', 409, 'BOT_TRASH_STALE');
    const { bot } = await service.bot(profileId), supervisor = service.supervisor;
    if (!supervisor?.withSessionEdit || !supervisor.stopSession || !supervisor.getQueueStore || typeof service.trashBlockers !== 'function')
        fail('Bot trash is unavailable until its activity checks are ready', 503, 'BOT_TRASH_UNAVAILABLE');
    const windows = (await service.windows.read(profileId)).state.windows;
    if (windows.some(window => window.rotation)) fail('Wait for the Bot chat to finish moving', 409, 'BOT_WINDOW_ROTATING');
    const markers = await service.nativeMarkers(profileId, bot.workspace);
    const paths = new Set(markers.map(marker => marker.path));
    const refs = new Map(markers.map(marker => [marker.path, { cwd: bot.workspace, sessionId: marker.sessionId }]));
    // Reject a damaged current index rather than stopping a worker owned by another profile.
    for (const window of windows) if (window.current && !markers.some(marker => marker.path === window.current.sessionPath
        && marker.windowId === window.id && marker.generation === window.current.generation))
        fail('A Bot window no longer matches its native records', 409, 'BOT_WINDOW_STALE');
    for (const worker of supervisor.workers?.values?.() || []) {
        if (!worker.disposed && (worker.loadedAgentProfileId === profileId || worker.loadedBot?.profileId === profileId)) {
            if (fs.realpathSync.native(worker.sessionPath) !== worker.sessionPath) fail('Bot worker identity changed', 409, 'BOT_WINDOW_STALE');
            paths.add(worker.sessionPath);
            refs.set(worker.sessionPath, { cwd: worker.cwd, sessionId: worker.sessionId });
        }
    }
    const targets = [...paths].sort(), queue = await supervisor.getQueueStore();
    const check = () => {
        for (const file of targets) {
            try { queue.assertMovable(file); }
            catch (error) { if (error.code === 'SESSION_QUEUE_RECOVERY') error.status = 409; throw error; }
        }
        const blockers = service.trashBlockers({ profileId, workspace: bot.workspace, windows, sessionPaths: targets, sessionRefs: [...refs.values()] });
        if (!Array.isArray(blockers)) fail('Bot activity checks are unavailable', 503, 'BOT_TRASH_UNAVAILABLE');
        if (blockers.length) fail(blockers[0].message || 'Handle the Bot pending work before moving it to trash', 409, blockers[0].code || 'BOT_WORK_PENDING');
    };
    check();
    // Each gate is registered before its first await. Hold every gate through the final CAS.
    const gated = index => index < targets.length ? supervisor.withSessionEdit(targets[index], () => gated(index + 1)) : retire();
    const retire = async () => {
        check();
        // All gates have verified idleness. A failed stop leaves the profile enabled and reports failure.
        let stopped = 0;
        for (const file of targets) {
            const active = Boolean(supervisor.getActiveWorker(file));
            await supervisor.stopSession(file);
            if (active) stopped++;
        }
        const saved = await service.profiles.trashReserved(profileId, input, state => {
            check(); // synchronous with the registry replacement: no late schedule/queue race.
            const profile = state.profiles.find(item => item.id === profileId);
            if (!readBot(profile) || profile.trashedAt !== undefined) fail('Bot not found', 404, 'BOT_NOT_FOUND');
        });
        service.emit('botChanged', { profileId, trashed: true });
        return { ok: true, revision: saved.revision, trashed: true,
            bot: { id: saved.profile.id, name: saved.profile.name, trashedAt: saved.profile.trashedAt },
            profile: saved.profile, stoppedSessions: stopped, recoverable: true };
    };
    return gated(0);
}
module.exports = { trashBot, createTrashBlockers };

// These sources are inspected synchronously again inside the profile CAS callback.
// In-flight scheduler writes are blocked too: an earlier target lookup is not a lease.
function createTrashBlockers({ cron, deferred, learning, store }) {
    return ({ profileId, sessionRefs }) => {
        if (!cron?.db || cron.error) return [{ code: 'BOT_ACTIVITY_UNAVAILABLE', message: 'Scheduled task checks are not ready; try again shortly' }];
        if (cron.busy || cron.mutating) return [{ code: 'BOT_WORK_PENDING', message: 'Wait for scheduled task operations to finish' }];
        const sameThread = target => sameThreadTarget(target, sessionRefs, store ? cwd => store.resolveProject(cwd) : undefined);
        const sameTarget = target => target?.kind === 'profile' && target.profileId === profileId
            || target?.kind === 'thread' && sameThread(target);
        // A Bot's own follow-up that has not started yet is simply not sent once the Bot is in the trash.
        const accepted = cron.db.activeRuns().some(run => !(run.origin === 'bot' && run.status === 'waiting') && (sameTarget(run.job?.target) || sameThread(run.target)));
        if (accepted) return [{ code: 'BOT_HAS_SCHEDULES', message: 'Wait for accepted scheduled work to finish before moving this Bot to trash' }];
        const scheduled = cron.db.jobs().some(job => !job.deleted && job.enabled && sameTarget(job.target));
        if (scheduled) return [{ code: 'BOT_HAS_SCHEDULES', message: 'Disable or cancel this Bot scheduled tasks before moving it to trash' }];
        deferred.assertHealthy();
        if (deferred.jobs.some(job => ['scheduled', 'waiting', 'paused', 'dispatching', 'failed', 'expired', 'uncertain'].includes(job.status)
            && sameThread(job))) return [{ code: 'BOT_HAS_DEFERRED', message: 'Handle this Bot pending messages before moving it to trash' }];
        if (learning?.recovering || [...(learning?.active?.values() || [])].some(item => item.profileId === profileId))
            return [{ code: 'BOT_WORK_PENDING', message: 'Wait for this Bot learning work to finish' }];
        return [];
    };
}
