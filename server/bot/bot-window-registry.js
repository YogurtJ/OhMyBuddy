'use strict';
// Per-Bot window index: <agentDir>/pivane-bots/<profileId>/windows.json.
// A window is the permanent conversation container the user sees (main chat or a
// topic). Each window points at its current native session generation and keeps the
// ordered list of earlier generations. This file is an index: every generation's
// native session carries a `pivane-bot-window` marker, so the index can be rebuilt.
const fs = require('node:fs');
const path = require('node:path');
const { safeFile } = require('../pi-native-service');
const privateFiles = require('../pi-private-files');
const { PrivateJsonDocument } = require('./bot-json-store');

const UUID = /^[a-f0-9-]{36}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const iso = value => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
const text = (value, max) => typeof value === 'string' && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const MAX_WINDOWS = 200;
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

function validWindow(value) {
    if (!object(value) || typeof value.id !== 'string' || !UUID.test(value.id) || !KINDS.includes(value.kind)
        || !text(value.title, 80) || !text(value.emoji, 16) || typeof value.focus !== 'string' || value.focus.length > 500
        || typeof value.cwd !== 'string' || !path.isAbsolute(value.cwd) || !iso(value.createdAt) || !iso(value.updatedAt)
        || value.archivedAt !== null && !iso(value.archivedAt) || !Array.isArray(value.generations)
        || value.generations.length > MAX_GENERATIONS || !value.generations.every(validGeneration) || !validRotation(value.rotation ?? null)) return false;
    const last = value.generations.at(-1);
    if (value.current === null) return value.generations.length === 0;
    return object(value.current) && Boolean(last) && value.current.generation === last.generation
        && value.current.sessionId === last.sessionId && value.current.sessionPath === last.sessionPath && last.endedAt === null
        && value.generations.slice(0, -1).every(item => item.endedAt !== null);
}

function validState(state, profileId) {
    return object(state) && state.version === 1 && state.profileId === profileId && Array.isArray(state.windows)
        && state.windows.length <= MAX_WINDOWS && state.windows.every(validWindow)
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

module.exports = { BotWindowRegistry, validWindow, validState, KINDS, ROTATION_REASONS, MAX_WINDOWS };
