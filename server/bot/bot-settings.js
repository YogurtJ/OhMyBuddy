'use strict';
// The `bot` section of a profile record. A profile becomes a Bot when this section is
// present and enabled. Unknown persisted fields are preserved; known fields are
// normalized and validated on every write. Reads tolerate an invalid section by
// treating the profile as "not a usable Bot" instead of invalidating the registry.
const path = require('node:path');

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const iso = value => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
const plainText = (value, max) => typeof value === 'string' && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);

const PRESETS = Object.freeze(['free', 'balanced', 'ask']);
const ONBOARDING_PHASES = Object.freeze(['greeting', 'interview', 'done', 'skipped']);
const STEP = /^[a-z][a-z-]{0,31}$/;
const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const THINKING = /^[a-z]{1,16}$/;
const MAX_RULES = 200;

function defaultBot({ workspace, order = 0, firstBot = false, now = new Date().toISOString() }) {
    return {
        version: 1, enabled: true, order, job: '', model: null, workspace,
        permissions: { preset: 'free', rules: [] },
        notify: { quietHours: { start: '23:00', end: '08:00' }, dailyProactiveLimit: 5 },
        onboarding: { version: 1, phase: 'greeting', firstBot, steps: {}, startedAt: now, completedAt: null },
        createdAt: now
    };
}

function normalizeModel(model) {
    if (model === null || model === undefined) return null;
    if (!object(model) || !plainText(model.provider, 200) || !model.provider || !plainText(model.id, 300) || !model.id
        || model.thinking !== undefined && model.thinking !== null && !(typeof model.thinking === 'string' && THINKING.test(model.thinking))) fail('Invalid bot model');
    return { provider: model.provider, id: model.id, ...(model.thinking ? { thinking: model.thinking } : {}) };
}

function normalizePermissions(permissions, previous) {
    const value = permissions ?? previous ?? { preset: 'free', rules: [] };
    if (!object(value) || !PRESETS.includes(value.preset) || !Array.isArray(value.rules ?? []) || (value.rules ?? []).length > MAX_RULES
        || (value.rules ?? []).some(rule => !object(rule) || Buffer.byteLength(JSON.stringify(rule)) > 2048)) fail('Invalid bot permissions');
    return { ...value, preset: value.preset, rules: value.rules ?? [] };
}

function normalizeNotify(notify, previous) {
    const value = notify ?? previous ?? {};
    if (!object(value)) fail('Invalid bot notifications');
    const quiet = value.quietHours === undefined ? { start: '23:00', end: '08:00' } : value.quietHours;
    if (quiet !== null && (!object(quiet) || !CLOCK.test(quiet.start) || !CLOCK.test(quiet.end) || quiet.start === quiet.end)) fail('Invalid quiet hours');
    const limit = value.dailyProactiveLimit ?? 5;
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 50) fail('Invalid proactive message limit');
    return { ...value, quietHours: quiet && { start: quiet.start, end: quiet.end }, dailyProactiveLimit: limit };
}

function normalizeOnboarding(onboarding) {
    if (!object(onboarding) || onboarding.version !== 1 || !ONBOARDING_PHASES.includes(onboarding.phase)
        || typeof onboarding.firstBot !== 'boolean' || !object(onboarding.steps)
        || Object.entries(onboarding.steps).some(([key, value]) => !STEP.test(key) || !['done', 'skipped'].includes(value))
        || Object.keys(onboarding.steps).length > 32
        || onboarding.startedAt !== null && !iso(onboarding.startedAt)
        || onboarding.completedAt !== null && !iso(onboarding.completedAt)) fail('Invalid bot onboarding state');
    return { ...onboarding, steps: { ...onboarding.steps } };
}

// Full validation of a stored or proposed section. Returns a normalized copy.
function normalizeBot(bot) {
    if (!object(bot) || bot.version !== 1 || typeof bot.enabled !== 'boolean') fail('Invalid bot settings');
    if (!Number.isSafeInteger(bot.order) || bot.order < 0 || bot.order > 9999) fail('Invalid bot order');
    if (!plainText(bot.job, 500)) fail('Invalid bot job');
    if (typeof bot.workspace !== 'string' || !path.isAbsolute(bot.workspace) || bot.workspace.length > 4096) fail('Invalid bot workspace');
    if (!iso(bot.createdAt)) fail('Invalid bot creation time');
    return { ...bot, model: normalizeModel(bot.model), permissions: normalizePermissions(bot.permissions),
        notify: normalizeNotify(bot.notify), onboarding: normalizeOnboarding(bot.onboarding) };
}

function readBot(profile) {
    if (!object(profile?.bot)) return null;
    try { return normalizeBot(profile.bot); } catch { return null; }
}

// A usable Bot: valid, enabled section on a profile that is itself enabled and not trashed.
function isBot(profile) {
    const bot = readBot(profile);
    return Boolean(bot?.enabled && profile.enabled && profile.trashedAt === undefined);
}

// User-editable settings. workspace, createdAt and onboarding are server-owned.
const PATCH_KEYS = Object.freeze(['job', 'model', 'permissions', 'notify', 'order']);
function applyBotPatch(previous, patch) {
    if (!object(patch) || Object.keys(patch).some(key => !PATCH_KEYS.includes(key))) fail('Invalid bot settings change');
    const next = { ...previous };
    if (patch.job !== undefined) next.job = typeof patch.job === 'string' ? patch.job.trim() : patch.job;
    if (patch.model !== undefined) next.model = normalizeModel(patch.model);
    if (patch.permissions !== undefined) {
        if (!object(patch.permissions) || Object.keys(patch.permissions).some(key => key !== 'preset')) fail('Invalid bot permissions change');
        next.permissions = { ...previous.permissions, preset: patch.permissions.preset };
    }
    if (patch.notify !== undefined) next.notify = normalizeNotify({ ...previous.notify, ...patch.notify });
    if (patch.order !== undefined) next.order = patch.order;
    return normalizeBot(next);
}

module.exports = { PRESETS, ONBOARDING_PHASES, defaultBot, normalizeBot, readBot, isBot, applyBotPatch, normalizeModel };
