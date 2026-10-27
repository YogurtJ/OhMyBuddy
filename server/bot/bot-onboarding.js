'use strict';
// User-owned local steps after the model interview. These never send a message or run a tool.
const { isDeepStrictEqual } = require('node:util');
const { normalizeModel } = require('./bot-settings');
const ACTIONS = Object.freeze(['start', 'skip', 'restart', 'model-choice', 'first-task']);
const FIRST_TASKS = Object.freeze(['study', 'plan', 'write', 'chat', 'own', 'later']);
const fail = (message, status = 400, code) => { throw Object.assign(new Error(message), { status, ...(code ? { code } : {}) }); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function validateOnboardingInput(input) {
    if (!object(input) || typeof input.expectedRevision !== 'string' || !ACTIONS.includes(input.action)) fail('Invalid onboarding change');
    const allowed = ['expectedRevision', 'action', ...(input.action === 'model-choice' ? ['model'] : input.action === 'first-task' ? ['choice'] : [])];
    if (Object.keys(input).some(key => !allowed.includes(key))) fail('Invalid onboarding change');
    if (input.action === 'model-choice' && !Object.hasOwn(input, 'model')) fail('Choose a model or keep the default');
    if (input.action === 'first-task' && !FIRST_TASKS.includes(input.choice)) fail('Invalid first-task choice');
}
async function modelChoice(bot, raw, catalog) {
    if (raw !== null && (!object(raw) || Object.keys(raw).some(key => !['provider', 'id', 'thinking'].includes(key)))) fail('Invalid bot model');
    const desired = normalizeModel(raw);
    // Keeping an unavailable existing choice, or following the default, does not need a fresh catalog.
    if (desired === null || isDeepStrictEqual(desired, bot.model)) return desired;
    let available;
    try { available = await catalog?.(bot.workspace); } catch { /* handled as unavailable */ }
    const found = available?.models?.find(model => model.provider === desired.provider && (model.modelId ?? model.id) === desired.id);
    if (!found || desired.thinking && !(found.thinkingLevels || []).includes(desired.thinking))
        fail('This model is not available; keep the current choice or choose another', 409, 'BOT_MODEL_UNAVAILABLE');
    return desired;
}
function localStep(bot, input, now, desiredModel) {
    const onboarding = { ...bot.onboarding, steps: { ...bot.onboarding.steps } };
    if (input.action === 'start') {
        if (onboarding.phase === 'greeting') { onboarding.phase = 'interview'; onboarding.flowVersion = 2; }
    } else if (input.action === 'skip') {
        onboarding.phase = 'skipped'; onboarding.completedAt = now;
    } else if (input.action === 'restart') {
        Object.assign(onboarding, { phase: 'interview', flowVersion: 2, steps: {}, startedAt: now, completedAt: null });
        delete onboarding.firstTaskChoice;
    } else {
        if (onboarding.flowVersion !== 2 || onboarding.phase === 'skipped')
            fail('Restart the introduction to use these steps', 409, 'BOT_ONBOARDING_LEGACY');
        if (input.action === 'model-choice') {
            onboarding.steps.model = 'done';
            return { ...bot, onboarding, model: desiredModel };
        }
        if (onboarding.phase !== 'done') fail('Finish the introduction before choosing a first task', 409, 'BOT_INTERVIEW_PENDING');
        onboarding.steps['first-task'] = input.choice === 'later' ? 'skipped' : 'done';
        onboarding.firstTaskChoice = input.choice;
        // This is an explicit choice to start with the current model; no model or permission is changed.
        if (!onboarding.steps.model) onboarding.steps.model = 'skipped';
    }
    return { ...bot, onboarding };
}
module.exports = { ACTIONS, FIRST_TASKS, validateOnboardingInput, modelChoice, localStep };
