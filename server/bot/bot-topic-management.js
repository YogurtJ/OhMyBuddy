'use strict';
// Owner-only organization metadata. Groups never become native markers or model context.
const { randomUUID } = require('node:crypto');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_GROUPS = 50, MAX_GROUP_NAME = 60;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (message, status = 400, code) => { throw Object.assign(new Error(message), { status, code }); };
const validName = value => typeof value === 'string' && value.trim() === value && value.length > 0
    && value.length <= MAX_GROUP_NAME && !/[\x00-\x1f\x7f]/.test(value);
const iso = value => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
const validGroupId = value => value === null || typeof value === 'string' && UUID.test(value);
const nameKey = value => value.normalize('NFC').toLowerCase();
function validGroups(groups) {
    return Array.isArray(groups) && groups.length <= MAX_GROUPS && groups.every(group => object(group)
        && typeof group.id === 'string' && UUID.test(group.id) && validName(group.name) && iso(group.createdAt) && iso(group.updatedAt)
        && Object.keys(group).every(key => ['id', 'name', 'createdAt', 'updatedAt'].includes(key)))
        && new Set(groups.map(group => group.id)).size === groups.length
        && new Set(groups.map(group => nameKey(group.name))).size === groups.length;
}
function request(input, keys) {
    if (!object(input) || Object.keys(input).some(key => !['expectedRevision', ...keys].includes(key))
        || typeof input.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(input.expectedRevision)) fail('Invalid topic management request');
}
function windowIds(value) {
    if (!Array.isArray(value) || !value.length || value.length > 100 || !value.every(id => typeof id === 'string' && UUID.test(id))
        || new Set(value).size !== value.length) fail('Select between 1 and 100 distinct topics');
    return value;
}
function assertGroup(state, id) {
    if (!validGroupId(id)) fail('Invalid topic group');
    if (id !== null && !(state.groups || []).some(group => group.id === id)) fail('Topic group not found', 404, 'BOT_TOPIC_GROUP_NOT_FOUND');
}
function applyMoves(state, ids, groupId) {
    assertGroup(state, groupId);
    const topics = ids.map(id => state.windows.find(window => window.id === id));
    if (topics.some(window => !window || window.kind !== 'topic' || window.trashedAt || window.deleting))
        fail('One of the selected topics is no longer available; reload before moving', 409, 'BOT_TOPIC_UNAVAILABLE');
    for (const topic of topics) topic.groupId = groupId;
}
function mutateGroup(service, profileId, groupId, input, action) {
    request(input, action === 'create' ? ['name', 'windowIds'] : action === 'edit' ? ['name', 'beforeGroupId'] : []);
    if (action !== 'create' && (typeof groupId !== 'string' || !UUID.test(groupId))) fail('Invalid topic group');
    const name = Object.hasOwn(input, 'name') ? typeof input.name === 'string' ? input.name.trim() : null : undefined;
    if ((action === 'create' || name !== undefined) && !validName(name)) fail(`A group name of 1–${MAX_GROUP_NAME} characters is required`);
    if (action === 'edit' && name === undefined && !Object.hasOwn(input, 'beforeGroupId')) fail('Nothing to update');
    if (Object.hasOwn(input, 'beforeGroupId') && !validGroupId(input.beforeGroupId)) fail('Invalid group position');
    if (Object.hasOwn(input, 'windowIds')) windowIds(input.windowIds);
    return service.profiles.reserve(async () => {
        await service.bot(profileId);
        const saved = await service.windows.mutate(profileId, input.expectedRevision, state => {
            const groups = state.groups ||= [];
            const now = new Date().toISOString();
            let group = action === 'create' ? { id: randomUUID(), name, createdAt: now, updatedAt: now } : groups.find(item => item.id === groupId);
            if (!group) fail('Topic group not found', 404, 'BOT_TOPIC_GROUP_NOT_FOUND');
            if (action === 'delete') {
                state.groups = groups.filter(item => item.id !== group.id);
                // Includes archived/trashed topics, so a later restore cannot revive a removed group.
                for (const window of state.windows) if (window.groupId === group.id) window.groupId = null;
                return { group: null };
            }
            if (name !== undefined && groups.some(item => item.id !== group.id && nameKey(item.name) === nameKey(name)))
                fail('A group with this name already exists', 409, 'BOT_TOPIC_GROUP_EXISTS');
            if (action === 'create') {
                if (groups.length >= MAX_GROUPS) fail(`A Buddy can have at most ${MAX_GROUPS} topic groups`, 409, 'BOT_TOPIC_GROUP_LIMIT');
                groups.push(group);
                if (input.windowIds) applyMoves(state, input.windowIds, group.id);
            } else {
                if (name !== undefined) group.name = name;
                group.updatedAt = now;
                if (Object.hasOwn(input, 'beforeGroupId')) {
                    assertGroup(state, input.beforeGroupId);
                    if (input.beforeGroupId !== group.id) {
                        const ordered = groups.filter(item => item.id !== group.id);
                        const position = input.beforeGroupId === null ? ordered.length : ordered.findIndex(item => item.id === input.beforeGroupId);
                        ordered.splice(position, 0, group); state.groups = ordered;
                    }
                }
            }
            return { group };
        });
        return { ok: true, group: saved.group, groups: saved.state.groups, windowsRevision: saved.revision };
    });
}
function moveTopics(service, profileId, input) {
    request(input, ['windowIds', 'groupId']);
    const ids = windowIds(input.windowIds);
    if (!validGroupId(input.groupId)) fail('Invalid topic group');
    return service.profiles.reserve(async () => {
        await service.bot(profileId);
        const saved = await service.windows.mutate(profileId, input.expectedRevision, state => { applyMoves(state, ids, input.groupId); return {}; });
        return { ok: true, moved: ids.length, windowsRevision: saved.revision };
    });
}
module.exports = { validGroups, validGroupId, assertGroup, mutateGroup, moveTopics, request, UUID, MAX_GROUPS, MAX_GROUP_NAME };
