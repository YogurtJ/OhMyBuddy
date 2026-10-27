'use strict';
// Bot setup proposals: the Bot proposes changes to its own identity or to what it knows
// about the user with the bot_setup_propose tool; nothing is saved until the user confirms
// an editable card. The server re-reads the still-pending tool call from the verified
// native transcript, accepts only the proposed fields (values may be edited or dropped),
// and saves under the profile reservation with revision checks.
const avatarPresets = require('../../public/pi-avatar-presets');
const SETUP_TOOL = 'bot_setup_propose';
const SETUP_TITLE = '保存这些设置？ / Save these settings?';
const SAVE = '保存 / Save', DECLINE = '先不改 / Not now';
const FIELDS = Object.freeze(['name', 'avatar', 'job', 'personality', 'workStyle', 'aboutUser', 'finish']);
// How the Bot works (its permission preset), from most freedom to most careful. A setup card
// may keep the current way or make it more careful; more freedom is only set in Bot settings.
const WORK_STYLES = Object.freeze(['free', 'balanced', 'ask']);
const moreCareful = (next, current) => WORK_STYLES.includes(next)
    && WORK_STYLES.indexOf(next) >= WORK_STYLES.indexOf(WORK_STYLES.includes(current) ? current : 'ask');
// An unchanged way of working belongs only to its own unanswered interview card.
// A stray copy on another card must not answer, skip or change that permission step.
function workStyleOffered(proposal, current, steps = {}) {
    return WORK_STYLES.includes(proposal.workStyle) && (proposal.workStyle !== current
        || !steps.work && Object.keys(proposal).every(key => key === 'workStyle' || key === 'finish'));
}
// The interview step each proposal field answers (onboarding.steps keys).
const STEP_OF = Object.freeze({ name: 'name', avatar: 'avatar', job: 'job', personality: 'personality', workStyle: 'work', aboutUser: 'about' });
const LIMITS = Object.freeze({ name: 40, avatar: 16, job: 300, personality: 6000, aboutItems: 6, aboutItem: 300 });

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const control = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const line = (value, max, label) => {
    if (typeof value !== 'string' || control.test(value) || /[\r\n]/.test(value)) fail(`Invalid ${label}`);
    const text = value.trim();
    if (!text || [...text].length > max) fail(`${label} must be 1–${max} characters`);
    return text;
};

// Shared by the worker tool, the browser card and the server: one definition of valid input.
// A field left empty (some models send "" for every optional field) counts as not proposed.
function normalizeProposal(raw, { partial = false } = {}) {
    if (!object(raw)) fail('Invalid setup proposal');
    const input = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, typeof value === 'string' && !value.trim() ? undefined
        : Array.isArray(value) ? value.filter(item => !(typeof item === 'string' && !item.trim())) : value]));
    const keys = Object.keys(input).filter(key => input[key] !== undefined && input[key] !== null);
    if (keys.some(key => !FIELDS.includes(key))) fail('Unknown setup field');
    const out = {};
    if (input.name != null) out.name = line(input.name, LIMITS.name, 'name');
    if (input.avatar != null) {
        if (object(input.avatar)) {
            if (input.avatar.kind !== 'preset' || Object.keys(input.avatar).length !== 2
                || Object.keys(input.avatar).some(key => !['kind', 'id'].includes(key))
                || !avatarPresets.find(input.avatar.id)) fail('Invalid preset avatar');
            out.avatar = { kind: 'preset', id: input.avatar.id };
        } else {
            out.avatar = line(input.avatar, LIMITS.avatar, 'avatar');
            if (Buffer.byteLength(out.avatar) > 64 || /[<>]/.test(out.avatar) || /[\p{L}\p{N}]/u.test(out.avatar)) fail('avatar must be an emoji');
        }
    }
    if (input.job != null) out.job = line(input.job, LIMITS.job, 'job');
    if (input.workStyle != null) {
        if (!WORK_STYLES.includes(input.workStyle)) fail('workStyle must be free, balanced or ask');
        out.workStyle = input.workStyle;
    }
    if (input.personality != null) {
        if (typeof input.personality !== 'string' || control.test(input.personality.replace(/\r?\n/g, ''))) fail('Invalid personality');
        const text = input.personality.replace(/\r\n/g, '\n').trim();
        if (!text || [...text].length > LIMITS.personality) fail(`personality must be 1–${LIMITS.personality} characters`);
        out.personality = text;
    }
    if (input.aboutUser != null) {
        if (!Array.isArray(input.aboutUser) || input.aboutUser.length > LIMITS.aboutItems) fail(`aboutUser must list at most ${LIMITS.aboutItems} items`);
        const items = [...new Set(input.aboutUser.map(item => line(item, LIMITS.aboutItem, 'aboutUser item')))];
        if (items.some(item => item.includes('§'))) fail('aboutUser items cannot contain §');
        if (items.length) out.aboutUser = items;
    }
    if (input.finish != null) {
        if (typeof input.finish !== 'boolean') fail('Invalid finish flag');
        if (input.finish) out.finish = true;
    }
    if (!partial && !Object.keys(out).length) fail('A setup proposal needs at least one change');
    return out;
}

// The proposal of a tool call that is still waiting for the user: the assistant message on
// the current branch carries it, and no tool result for it exists yet.
function pendingProposal(manager, toolCallId) {
    if (typeof toolCallId !== 'string' || !toolCallId || toolCallId.length > 200) fail('Invalid setup request');
    let call = null;
    for (const entry of manager.getBranch()) {
        const message = entry.type === 'message' ? entry.message : null;
        if (message?.role === 'assistant' && Array.isArray(message.content)) {
            const found = message.content.find(block => block?.type === 'toolCall' && block.id === toolCallId);
            if (found) call = found;
        }
        if (message?.role === 'toolResult' && message.toolCallId === toolCallId) fail('This setup card was already answered', 409);
    }
    if (!call || call.name !== SETUP_TOOL) fail('Setup card not found; it may have expired', 404);
    return normalizeProposal(call.arguments);
}

// changes: the user's edited card. Only proposed fields; null drops a field.
function confirmedChanges(proposal, changes) {
    if (!object(changes)) fail('Invalid setup confirmation');
    if (Object.keys(changes).some(key => !Object.hasOwn(proposal, key))) fail('Only the proposed fields can be saved');
    const kept = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== null && value !== undefined));
    return normalizeProposal(kept, { partial: true });
}

// About-you entries appended to USER.md, skipping ones already present.
// USER.md holds one fact per entry, separated by a line with only §.
function userEntries(content) {
    return typeof content === 'string' && content ? content.split('\n§\n').map(part => part.trim()).filter(Boolean) : [];
}

function appendUserEntries(content, items) {
    const parts = userEntries(content);
    const known = new Set(parts);
    const added = items.filter(item => !known.has(item));
    return { content: [...parts, ...added].join('\n§\n'), added };
}

module.exports = { SETUP_TOOL, SETUP_TITLE, SAVE, DECLINE, FIELDS, LIMITS, WORK_STYLES, STEP_OF, moreCareful, workStyleOffered, normalizeProposal, pendingProposal, confirmedChanges, userEntries, appendUserEntries };
