'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { safeFile: profilePath } = require('../pi-native-service');
const { readRegistry } = require('../pi-profile-registry');
const { safeFile, safeDir, projectRoots, skillFiles, entryText } = require('../profile-memory/management');

const KEY = 'pivaneBotChanges';
const MAX_PENDING = 32;
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const STRUCTURED_TOOLS = new Set(['memory_add', 'memory_replace', 'memory_remove', 'skill_manage',
    'bot_setup_propose', 'bot_schedule', 'window_note', 'bot_topic_propose', 'deliver_files']);
const READ_ONLY_TOOLS = new Set(['read', 'grep', 'find', 'ls', 'window_recall', 'window_read', 'web_search',
    'fetch_content', 'get_search_content', 'memory_search', 'session_search']);
const shouldWatchTool = event => !event.parentToolCallId && typeof event.toolName === 'string'
    && !STRUCTURED_TOOLS.has(event.toolName) && !READ_ONLY_TOOLS.has(event.toolName);

function fingerprint(file) {
    try {
        const stat = fs.lstatSync(file, { bigint: true });
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe receipt source');
        return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function settingsSnapshot(profile) {
    if (!profile?.bot || typeof profile.bot !== 'object' || Array.isArray(profile.bot)) throw new Error('Missing Bot');
    return { name: profile.name, avatar: profile.avatar, personality: profile.soul, job: profile.bot.job,
        workStyle: profile.bot.permissions?.preset, model: profile.bot.model, thinking: profile.bot.thinking, notify: profile.bot.notify };
}

const memoryEntries = text => new Set(text.split('\n§\n').map(entryText).filter(Boolean));
function skillName(text, fallback) {
    const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1] || '';
    return /^name:\s*(.+)$/m.exec(front)?.[1]?.replace(/^['"]|['"]$/g, '') || fallback;
}

// Capture through the same descriptor-verified readers as profile management. On the
// second capture unchanged fingerprints reuse decoded content; an incomplete scan is unknown.
function captureBotChanges(agentDir, profileId, previous = null) {
    try {
        if (!path.isAbsolute(agentDir) || !/^[a-f0-9-]{36}$/.test(profileId) || !safeDir(agentDir)) return null;
        if (previous?.agentDir !== agentDir || previous?.profileId !== profileId) previous = null;
        const registryFile = profilePath(agentDir, ['pivane-profiles', 'profiles.json']);
        const registryFingerprint = fingerprint(registryFile);
        if (!registryFingerprint) return null;
        const settings = previous?.registryFingerprint === registryFingerprint ? previous.settings
            : settingsSnapshot(readRegistry(registryFile).state.profiles.find(profile => profile.id === profileId));
        if (fingerprint(registryFile) !== registryFingerprint) return null;
        const root = path.dirname(profilePath(agentDir, ['pivane-profiles', 'data', profileId, 'USER.md']));
        const projects = safeDir(root) ? projectRoots(root) : [];
        const candidates = new Map([
            ...['USER.md', 'MEMORY.md', 'failures.md'].map(name => [path.join(root, name), { area: name === 'USER.md' ? 'user' : 'memory' }]),
            ...projects.map(dir => [path.join(dir, 'MEMORY.md'), { area: 'memory' }]),
            ...skillFiles(root, projects).map(candidate => [candidate.file, { area: 'skill', fallbackName: candidate.fallbackName }])
        ]);
        // Also validate disappeared candidates: a symlink or unreadable parent is not a deletion.
        for (const [file, prior] of previous?.files || []) if (!candidates.has(file)) candidates.set(file, prior);
        const files = new Map();
        let bytes = 0;
        for (const [file, candidate] of candidates) {
            profilePath(agentDir, path.relative(agentDir, file).split(path.sep));
            const stamp = fingerprint(file), prior = previous?.files.get(file);
            let record;
            if (prior && prior.fingerprint === stamp) record = prior;
            else {
                const data = safeFile(file);
                if (fingerprint(file) !== stamp || Boolean(data) !== Boolean(stamp)) return null;
                record = { area: candidate.area, fallbackName: candidate.fallbackName, fingerprint: stamp,
                    bytes: data ? Buffer.byteLength(data.text) : 0,
                    ...(candidate.area === 'skill' ? { name: data ? skillName(data.text, candidate.fallbackName) : null, revision: data?.revision }
                        : { entries: memoryEntries(data?.text || '') }) };
            }
            bytes += record.bytes;
            if (bytes > MAX_SNAPSHOT_BYTES) return null;
            files.set(file, record);
        }
        return { agentDir, profileId, registryFingerprint, settings, files };
    } catch { return null; }
}

// Memory replacements are the removed and added entry sets. Metadata-only writes do
// not change entries. Nothing from these internal file keys or settings values is returned.
function compareBotChanges(before, after) {
    if (!before || !after || before.agentDir !== after.agentDir || before.profileId !== after.profileId) return [];
    const groups = new Map();
    const add = (area, action, values) => {
        if (!values.length) return;
        const key = `${area}:${action}`;
        if (!groups.has(key)) groups.set(key, { area, action, count: 0,
            ...(area === 'skill' ? { names: [] } : action === 'added' ? { previews: [] } : {}) });
        const change = groups.get(key);
        change.count += values.length;
        if (area === 'skill') change.names = [...new Set([...change.names, ...values])].slice(0, 10);
        else if (action === 'added') change.previews.push(...values.slice(0, 3 - change.previews.length).map(text => Array.from(text).slice(0, 160).join('')));
    };
    for (const file of new Set([...before.files.keys(), ...after.files.keys()])) {
        const old = before.files.get(file), current = after.files.get(file), area = current?.area || old.area;
        if (old?.fingerprint === current?.fingerprint) continue;
        if (area === 'skill') {
            if (!old?.fingerprint && current?.fingerprint) add(area, 'added', [current.name]);
            else if (old?.fingerprint && !current?.fingerprint) add(area, 'removed', [old.name]);
            else if (old?.revision !== current?.revision) add(area, 'updated', [current.name]);
        } else {
            const previousEntries = old?.entries || new Set(), currentEntries = current?.entries || new Set();
            add(area, 'added', [...currentEntries].filter(entry => !previousEntries.has(entry)));
            add(area, 'removed', [...previousEntries].filter(entry => !currentEntries.has(entry)));
        }
    }
    const names = Object.keys(after.settings).filter(key => !isDeepStrictEqual(before.settings[key], after.settings[key]));
    if (names.length) groups.set('settings', { area: 'settings', action: 'updated', names });
    return [...groups.values()];
}

function changeDetails(details, changes) {
    if (!changes.length || details != null && (typeof details !== 'object' || Array.isArray(details)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(details))) || details && Object.hasOwn(details, KEY)) return;
    return { details: { ...details, [KEY]: { v: 1, changes } } };
}

function registerBotChangeReceipts(pi, getTarget) {
    const pending = new Map();
    pi.on('tool_call', (event, ctx) => {
        try {
            if (!shouldWatchTool(event) || typeof event.toolCallId !== 'string' || event.toolCallId.length > 256) return;
            pending.delete(event.toolCallId);
            const target = getTarget(ctx);
            if (!target) return;
            const before = captureBotChanges(target.agentDir, target.profileId);
            if (!before) return;
            if (pending.size >= MAX_PENDING) pending.delete(pending.keys().next().value);
            pending.set(event.toolCallId, { toolName: event.toolName, before });
        } catch { /* Best-effort presentation must never change tool execution. */ }
    });
    pi.on('tool_result', (event, ctx) => {
        const saved = pending.get(event.toolCallId); pending.delete(event.toolCallId);
        try {
            if (!saved || saved.toolName !== event.toolName || !shouldWatchTool(event)) return;
            const target = getTarget(ctx);
            if (!target || saved.before.agentDir !== target.agentDir || saved.before.profileId !== target.profileId) return;
            return changeDetails(event.details, compareBotChanges(saved.before, captureBotChanges(target.agentDir, target.profileId, saved.before)));
        } catch { /* Leave content, isError, usage and control signals untouched. */ }
    });
    pi.on('tool_execution_end', event => { pending.delete(event.toolCallId); });
    for (const event of ['session_start', 'agent_end', 'session_shutdown']) pi.on(event, () => pending.clear());
}

module.exports = { captureBotChanges, compareBotChanges, changeDetails, registerBotChangeReceipts,
    shouldWatchTool, MAX_PENDING, MAX_SNAPSHOT_BYTES };
