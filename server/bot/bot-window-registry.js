'use strict';
// Per-Bot window index: <agentDir>/pivane-bots/<profileId>/windows.json.
// A window is the permanent conversation container the user sees (main chat or a
// topic). Each window points at its current native session generation and keeps the
// ordered list of earlier generations. Generation pointers are verified against native
// `pivane-bot-window` markers. Groups, trash and deletion intent are owner metadata:
// they must be backed up with the native files, not rebuilt from creation markers.
const fs = require('node:fs');
const path = require('node:path');
const { safeFile } = require('../pi-native-service');
const privateFiles = require('../pi-private-files');
const { PrivateJsonDocument } = require('./bot-json-store');
const { validTopicSeed } = require('./bot-window-state');
const { validInstructions } = require('./bot-topic');
const { validGroups, validGroupId } = require('./bot-topic-management');

const UUID = /^[a-f0-9-]{36}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const iso = value => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
const text = (value, max) => typeof value === 'string' && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const MAX_WINDOWS = 201; // Main + 100 active/archived topics + 100 recoverable topics.
const MAX_GENERATIONS = 10000;
const KINDS = Object.freeze(['main', 'topic']);
const ROTATION_REASONS = Object.freeze(['initial', 'size', 'entries', 'age', 'manual']);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

function validGeneration(value, index) {
    return object(value) && value.generation === index && typeof value.sessionId === 'string' && value.sessionId.length > 0
        && value.sessionId.length <= 128 && typeof value.sessionPath === 'string' && path.isAbsolute(value.sessionPath)
        && iso(value.startedAt) && (value.endedAt === null || iso(value.endedAt)) && ROTATION_REASONS.includes(value.reason);
}

function validRotation(value) {
    return value === null || object(value) && value.state === 'prepared' && typeof value.requestId === 'string'
        && UUID.test(value.requestId) && Number.isSafeInteger(value.toGeneration) && iso(value.preparedAt)
        && ROTATION_REASONS.includes(value.reason) && value.reason !== 'initial'
        && typeof value.fromSessionId === 'string' && value.fromSessionId.length > 0 && value.fromSessionId.length <= 128;
}

function validDeletion(value, generations) {
    return object(value) && iso(value.startedAt) && Object.keys(value).every(key => ['startedAt', 'files', 'planIds'].includes(key))
        && Array.isArray(value.planIds) && value.planIds.length <= 50000
        && value.planIds.every(id => typeof id === 'string' && /^plan-[a-f0-9-]{36}$/.test(id))
        && new Set(value.planIds).size === value.planIds.length
        && Array.isArray(value.files) && value.files.length === generations.length
        && value.files.every((file, index) => object(file) && file.generation === generations[index].generation
            && typeof file.stamp === 'string' && file.stamp.length <= 512
            && (file.identity === null || typeof file.identity === 'string' && file.identity.length <= 512)
            && Object.keys(file).every(key => ['generation', 'stamp', 'identity'].includes(key)));
}

function validWindow(value) {
    if (!object(value) || typeof value.id !== 'string' || !UUID.test(value.id) || !KINDS.includes(value.kind)
        || !text(value.title, 80) || !text(value.emoji, 16) || typeof value.focus !== 'string' || value.focus.length > 500
        || typeof value.cwd !== 'string' || !path.isAbsolute(value.cwd) || !iso(value.createdAt) || !iso(value.updatedAt)
        || value.archivedAt !== null && !iso(value.archivedAt) || !Array.isArray(value.generations)
        || value.generations.length > MAX_GENERATIONS || !value.generations.every(validGeneration) || !validRotation(value.rotation ?? null)) return false;
    if (value.groupId !== undefined && (value.kind !== 'topic' || !validGroupId(value.groupId))) return false;
    if (value.trashedAt !== undefined && (value.kind !== 'topic' || value.trashedAt !== null && !iso(value.trashedAt))) return false;
    if (value.deleting !== undefined && (!value.trashedAt || !validDeletion(value.deleting, value.generations))) return false;
    if (value.topicSeed !== undefined && (value.kind !== 'topic' || !validTopicSeed(value.topicSeed))) return false;
    // Topics only; records written before topic instructions have none (read as '').
    if (value.instructions !== undefined && (value.kind !== 'topic' || !validInstructions(value.instructions))) return false;
    const last = value.generations.at(-1);
    if (value.current === null) return value.generations.length === 0;
    return object(value.current) && Boolean(last) && value.current.generation === last.generation
        && value.current.sessionId === last.sessionId && value.current.sessionPath === last.sessionPath && last.endedAt === null
        && value.generations.slice(0, -1).every(item => item.endedAt !== null);
}

function validState(state, profileId) {
    return object(state) && state.version === 1 && state.profileId === profileId && Array.isArray(state.windows)
        && state.windows.length <= MAX_WINDOWS && state.windows.every(validWindow)
        && validGroups(state.groups ?? [])
        && state.windows.every(item => item.groupId == null || (state.groups || []).some(group => group.id === item.groupId))
        && Array.isArray(state.deletedTopicIds ?? []) && (state.deletedTopicIds || []).length <= 10000
        && (state.deletedTopicIds || []).every(id => typeof id === 'string' && UUID.test(id))
        && new Set(state.deletedTopicIds || []).size === (state.deletedTopicIds || []).length
        && state.windows.every(item => !(state.deletedTopicIds || []).includes(item.id))
        && new Set(state.windows.map(item => item.id)).size === state.windows.length
        && state.windows.filter(item => item.kind === 'main').length <= 1
        && state.windows.filter(item => item.kind === 'main').every(item => item.archivedAt === null);
}

class BotWindowRegistry {
    constructor({ getAgentDir }) { this.getAgentDir = getAgentDir; }

    async document(profileId, create = false) {
        if (typeof profileId !== 'string' || !UUID.test(profileId)) fail('Invalid bot ID');
        const agentDir = await this.getAgentDir();
        const file = safeFile(agentDir, ['pivane-bots', profileId, 'windows.json'], create);
        const root = path.dirname(file);
        if (create) {
            privateFiles.privateDirectory(path.dirname(root)); privateFiles.privateDirectory(root);
            if (process.platform !== 'win32') { fs.chmodSync(path.dirname(root), 0o700); fs.chmodSync(root, 0o700); }
        }
        return new PrivateJsonDocument({ root, name: 'windows.json', label: 'Bot windows',
            validate: state => validState(state, profileId), empty: () => ({ version: 1, profileId, windows: [] }) });
    }

    async read(profileId) { return (await this.document(profileId)).read(); }

    async mutate(profileId, expectedRevision, update) {
        return (await this.document(profileId, true)).mutate(expectedRevision, update);
    }
}

// Synchronous, read-only lookup for worker extensions (title/focus/instructions may change between runs).
function readWindowRecord(agentDir, profileId, windowId) {
    if (typeof profileId !== 'string' || !UUID.test(profileId)) return null;
    const file = safeFile(agentDir, ['pivane-bots', profileId, 'windows.json']);
    const { state } = new PrivateJsonDocument({ root: path.dirname(file), name: 'windows.json', label: 'Bot windows',
        validate: value => validState(value, profileId), empty: () => ({ version: 1, profileId, windows: [] }) }).read();
    return state.windows.find(item => item.id === windowId) ?? null;
}

module.exports = { BotWindowRegistry, readWindowRecord, validWindow, validState, KINDS, ROTATION_REASONS, MAX_WINDOWS };
