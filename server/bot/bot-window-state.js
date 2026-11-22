'use strict';
// Native ownership marker for one generation of a Bot window. Written once, at session
// creation, next to the `pivane-agent-profile` marker. Like the profile marker it is
// bound to the native session ID: copied, duplicated or malformed markers never give a
// session window ownership. The window registry is an index rebuilt from these markers.
const { readProfileBinding } = require('../pi-profile-state');

const WINDOW_ENTRY = 'pivane-bot-window';
const UUID = /^[a-f0-9-]{36}$/;
const MAX_GENERATION = 1_000_000;

function validTopicSeed(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).some(key => !['title', 'focus', 'emoji'].includes(key))) return false;
    try { require('./bot-topic').topicFields(value); return true; } catch { return false; }
}

function validForkOrigin(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).every(key => ['windowId', 'sessionId', 'entryId', 'title'].includes(key))
        && typeof value.windowId === 'string' && UUID.test(value.windowId)
        && typeof value.sessionId === 'string' && value.sessionId.length > 0 && value.sessionId.length <= 128
        && (value.entryId === null || typeof value.entryId === 'string' && value.entryId.length > 0 && value.entryId.length <= 160)
        && typeof value.title === 'string' && value.title.length <= 80 && !/[\x00-\x1f\x7f]/.test(value.title);
}

function windowMarker({ sessionId, profileId, windowId, kind, generation, predecessor = null, topicSeed, forkOrigin }) {
    return { version: 1, sessionId, profileId, windowId, kind, generation, predecessor, ...(topicSeed ? { topicSeed } : {}), ...(forkOrigin ? { forkOrigin } : {}) };
}

function validPredecessor(value) {
    return value === null || value !== null && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).every(key => ['sessionId', 'lastEntryId'].includes(key))
        && typeof value.sessionId === 'string' && value.sessionId.length > 0 && value.sessionId.length <= 128
        && (value.lastEntryId === null || typeof value.lastEntryId === 'string' && value.lastEntryId.length > 0 && value.lastEntryId.length <= 128);
}

function readWindowBinding(manager) {
    const sessionId = manager.getSessionId();
    if (typeof sessionId !== 'string' || !sessionId) return null;
    const entries = manager.getEntries().filter(entry => entry.type === 'custom' && entry.customType === WINDOW_ENTRY
        && entry.data?.sessionId === sessionId);
    if (entries.length !== 1) return null;
    const data = entries[0].data;
    if (data.version !== 1 || typeof data.profileId !== 'string' || !UUID.test(data.profileId)
        || typeof data.windowId !== 'string' || !UUID.test(data.windowId) || !['main', 'topic'].includes(data.kind)
        || !Number.isSafeInteger(data.generation) || data.generation < 0 || data.generation > MAX_GENERATION
        || !validPredecessor(data.predecessor ?? null) || data.generation > 0 && !data.predecessor
        || data.topicSeed !== undefined && (data.kind !== 'topic' || data.generation !== 0 || !validTopicSeed(data.topicSeed))
        || data.forkOrigin !== undefined && (data.kind !== 'topic' || data.generation !== 0 || !validForkOrigin(data.forkOrigin))) return null;
    // The window marker never overrides the immutable profile identity of the session.
    if (readProfileBinding(manager)?.profileId !== data.profileId) return null;
    return { sessionId, profileId: data.profileId, windowId: data.windowId, kind: data.kind, generation: data.generation, predecessor: data.predecessor ?? null,
        ...(data.topicSeed ? { topicSeed: data.topicSeed } : {}), ...(data.forkOrigin ? { forkOrigin: data.forkOrigin } : {}) };
}

module.exports = { WINDOW_ENTRY, windowMarker, readWindowBinding, validTopicSeed, validForkOrigin };
