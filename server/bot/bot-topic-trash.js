'use strict';
// Whole-topic lifecycle. The caller's profiles reservation and every generation's
// Supervisor edit gate cover the final CAS. Native records are never rewritten for trash.
const fs = require('node:fs');
const path = require('node:path');
const io = require('../pi-file-io');
const { descriptorPathSync } = require('../pi-file-descriptor');
const { readWindowBinding } = require('./bot-window-state');
const { request } = require('./bot-topic-management');
const { MAX_TOPICS } = require('./bot-topic');
const { mediaPlanRecord, MEDIA_PLAN_ENTRY, MEDIA_TOOLS, PLAN_KEY } = require('../pi-media-plan-format');
const fail = (message, status = 409, code) => { throw Object.assign(new Error(message), { status, code }); };
const stamp = stat => [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');
function fingerprint(file) {
    let fd;
    try {
        const before = fs.lstatSync(file, { bigint: true });
        if (!before.isFile() || before.isSymbolicLink() || fs.realpathSync.native(file) !== file) fail('Topic file identity changed', 409, 'BOT_WINDOW_STALE');
        fd = io.openReadSync(file);
        const opened = fs.fstatSync(fd, { bigint: true }), identity = io.identity(fd);
        if (stamp(before) !== stamp(opened) || descriptorPathSync(fd) !== file || !io.sameIdentityAtPath(file, identity)
            || stamp(opened) !== stamp(fs.lstatSync(file, { bigint: true }))) fail('Topic file identity changed', 409, 'BOT_WINDOW_STALE');
        return { stamp: stamp(opened), identity };
    } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function topicOnly(window) {
    if (window.kind !== 'topic') fail('The main chat cannot use topic deletion', 409, 'BOT_MAIN_WINDOW_FIXED');
    if (window.rotation) fail('Wait for the topic to finish moving', 409, 'BOT_WINDOW_ROTATING');
}
async function readGeneration(service, profileId, window, generation, action = () => {}) {
    return service.store.withSessionRead(window.cwd, generation.sessionId, (session, read) => {
        const manager = read.manager(), binding = readWindowBinding(manager);
        if (session.path !== generation.sessionPath || binding?.profileId !== profileId || binding.windowId !== window.id
            || binding.kind !== 'topic' || binding.generation !== generation.generation)
            fail('A topic generation does not match its native marker', 409, 'BOT_WINDOW_STALE');
        read.validate();
        return action(manager, read);
    });
}
async function verifyTopic(service, profileId, window, { deleting = false } = {}) {
    const markers = (await service.nativeMarkers(profileId, window.cwd)).filter(marker => marker.windowId === window.id);
    const expected = new Map(window.generations.map(generation => [generation.sessionPath, generation]));
    if (markers.some(marker => !expected.has(marker.path) || expected.get(marker.path).sessionId !== marker.sessionId
        || expected.get(marker.path).generation !== marker.generation)) fail('Unindexed topic history requires recovery', 409, 'BOT_WINDOW_STALE');
    const plans = new Set(deleting ? window.deleting.planIds : []), files = [];
    for (const generation of window.generations) {
        // Only an already-journalled permanent deletion may have missing generations.
        if (deleting && !fs.existsSync(generation.sessionPath)) {
            try { fs.lstatSync(generation.sessionPath); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        }
        await readGeneration(service, profileId, window, generation, (manager, read) => {
            for (const entry of manager.getEntries()) {
                const native = entry.type === 'custom' && entry.customType === MEDIA_PLAN_ENTRY ? mediaPlanRecord(entry.data) : null;
                const message = entry.type === 'message' ? entry.message : null;
                const plan = native?.plan || (message?.role === 'toolResult' && !message.isError && MEDIA_TOOLS.has(message.toolName) ? message.details?.plan : null);
                if (typeof plan?.id === 'string' && PLAN_KEY.test(plan.id)) plans.add(plan.id);
            }
            const current = fingerprint(generation.sessionPath);
            const original = deleting && window.deleting.files.find(file => file.generation === generation.generation);
            if (original && (original.stamp !== current.stamp || original.identity !== current.identity))
                fail('A file changed after permanent deletion began; it was preserved', 409, 'BOT_WINDOW_STALE');
            read.validate(); files.push({ generation: generation.generation, ...current });
        });
    }
    return { plans, files };
}
function activity(service, profileId, window, plans) {
    if (typeof service.assertTopicQuiescent !== 'function') fail('Topic activity checks are unavailable', 503, 'BOT_TOPIC_ACTIVITY_UNAVAILABLE');
    service.assertWindowQuiescent?.(window);
    service.assertTopicQuiescent({ profileId, window, planIds: [...plans] });
}
function reserved(service, operation) {
    return service.profiles.reserve(() => service.cron ? service.cron.reserve(operation) : operation());
}
async function currentTopic(service, profileId, windowId, input) {
    const window = await service.windowRecord(profileId, windowId, { includeTrashed: true }); topicOnly(window);
    const snapshot = await service.windows.read(profileId);
    if (snapshot.revision !== input.expectedRevision) fail('Bot windows changed; reload before continuing', 409);
    return { window, snapshot };
}
function trashTopic(service, profileId, windowId, input) {
    request(input, []);
    return reserved(service, async () => {
        const { window, snapshot } = await currentTopic(service, profileId, windowId, input);
        if (window.trashedAt) fail('This topic is already in trash', 409, 'BOT_TOPIC_TRASHED');
        if (snapshot.state.windows.filter(item => item.trashedAt).length >= 100)
            fail('The topic trash is full; permanently delete unneeded topics first', 409, 'BOT_TOPIC_TRASH_LIMIT');
        let verified = await verifyTopic(service, profileId, window);
        activity(service, profileId, window, verified.plans);
        return service.archiveWindowLocked(profileId, window, async () => {
            verified = await verifyTopic(service, profileId, window);
            const saved = await service.windows.mutate(profileId, input.expectedRevision, state => {
                activity(service, profileId, window, verified.plans);
                const item = state.windows.find(topic => topic.id === windowId);
                item.trashedAt = new Date().toISOString(); return {};
            });
            service.emit('botChanged', { profileId, windowId, trashed: true });
            return { ok: true, trashed: true, recoverable: true, windowsRevision: saved.revision };
        }, { verify: () => verifyTopic(service, profileId, window) });
    });
}
function restoreTopic(service, profileId, windowId, input) {
    request(input, []);
    return reserved(service, async () => {
        const { window } = await currentTopic(service, profileId, windowId, input);
        if (!window.trashedAt) fail('This topic is not in trash', 409, 'BOT_TOPIC_NOT_TRASHED');
        if (window.deleting) fail('Permanent deletion already started; this topic cannot be restored', 409, 'BOT_TOPIC_DELETING');
        await verifyTopic(service, profileId, window);
        const saved = await service.windows.mutate(profileId, input.expectedRevision, state => {
            if (state.windows.filter(item => item.kind === 'topic' && !item.trashedAt).length >= MAX_TOPICS)
                fail('Topic limit reached (including archived topics)', 409, 'BOT_TOPIC_LIMIT');
            state.windows.find(item => item.id === windowId).trashedAt = null; return {};
        });
        service.emit('botChanged', { profileId, windowId, restored: true });
        return { ok: true, restored: true, archived: Boolean(window.archivedAt), windowsRevision: saved.revision };
    });
}
function deleteTopic(service, profileId, windowId, input) {
    request(input, ['confirmed']);
    if (input.confirmed !== true) fail('Confirm permanent deletion explicitly', 400, 'BOT_TOPIC_DELETE_CONFIRMATION');
    return reserved(service, async () => {
        let { window, snapshot } = await currentTopic(service, profileId, windowId, input);
        if (!window.trashedAt) fail('Move the topic to trash before permanently deleting it', 409, 'BOT_TOPIC_NOT_TRASHED');
        if ((snapshot.state.deletedTopicIds || []).length >= 10000) fail('Topic deletion record limit reached', 409, 'BOT_TOPIC_DELETE_LIMIT');
        let verified = await verifyTopic(service, profileId, window, { deleting: Boolean(window.deleting) });
        activity(service, profileId, window, verified.plans);
        return service.archiveWindowLocked(profileId, window, async () => {
            verified = await verifyTopic(service, profileId, window, { deleting: Boolean(window.deleting) });
            activity(service, profileId, window, verified.plans);
            if (!window.deleting) {
                const saved = await service.windows.mutate(profileId, input.expectedRevision, state => {
                    activity(service, profileId, window, verified.plans);
                    state.windows.find(item => item.id === windowId).deleting = { startedAt: new Date().toISOString(), files: verified.files, planIds: [...verified.plans] }; return {};
                });
                window = saved.state.windows.find(item => item.id === windowId); snapshot = saved;
            }
            for (const generation of window.generations) {
                try { fs.lstatSync(generation.sessionPath); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
                await readGeneration(service, profileId, window, generation, (_manager, read) => {
                    const current = fingerprint(generation.sessionPath), original = window.deleting.files.find(file => file.generation === generation.generation);
                    if (!original || current.stamp !== original.stamp || current.identity !== original.identity)
                        fail('A file changed after permanent deletion began; it was preserved', 409, 'BOT_WINDOW_STALE');
                    activity(service, profileId, window, verified.plans);
                    read.validate(); // full descriptor/path identity and native proof, immediately before synchronous unlink.
                    fs.unlinkSync(generation.sessionPath);
                    if (process.platform !== 'win32') {
                        const directory = io.openReadSync(path.dirname(generation.sessionPath));
                        try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
                    }
                    service.store.sessionLists.delete(window.cwd); service.store.sessionListCache?.delete(window.cwd);
                });
            }
            const saved = await service.windows.mutate(profileId, snapshot.revision, state => {
                activity(service, profileId, window, verified.plans);
                if (window.generations.some(generation => fs.existsSync(generation.sessionPath))) fail('Some topic files were not deleted', 409, 'BOT_TOPIC_DELETING');
                state.windows = state.windows.filter(item => item.id !== windowId);
                (state.deletedTopicIds ||= []).push(windowId); return {};
            });
            service.emit('botChanged', { profileId, windowId, deleted: true });
            return { ok: true, deleted: true, recoverable: false, generations: window.generations.length, windowsRevision: saved.revision };
        }, { verify: () => verifyTopic(service, profileId, window, { deleting: Boolean(window.deleting) }) });
    });
}
module.exports = { trashTopic, restoreTopic, deleteTopic, verifyTopic };
