'use strict';
// Continuity seed for a new window generation (M2): the notebook snapshot, the latest
// structured summary with a freshly rendered notebook (or Pi's own summary plus the
// notebook when the last compaction fell back), and a bounded verbatim tail of recent text
// turns. Everything is read from the predecessor's verified native entries; nothing is invented.
const ledger = require('./bot-ledger');
const { nativeInputIndex, projectNativeMessage, channelSource } = require('../pi-native-input');
const { readSections, summaryText } = require('./bot-compaction');

const HANDOFF_MESSAGE = 'pivane-bot-handoff';
const TAIL_HEADING = '## Most recent messages (verbatim)';
// The recent part is carried verbatim: a rotation follows a summary, so this is about what Pi
// kept after it (its keepRecentTokens), which the model was seeing anyway.
const MAX_TAIL_CHARS = 64000;
const MAX_TAIL_MESSAGES = 400;
// Pi's own summary (after a fallback) is clipped; structured sections are bounded when read
// and the notebook is always rendered whole, so the seed can be marked as showing it.
const MAX_SUMMARY_CHARS = 24000;

function textOf(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n');
}

function clip(text, max) {
    return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

// manager: a verified, read-only SessionManager for the predecessor generation.
function buildHandoff(manager, { now = new Date().toISOString() } = {}) {
    const branch = manager.getBranch();
    let model = null, thinkingLevel = null, summary = '', sections = null;
    for (const entry of branch) {
        if (entry.type === 'model_change' && entry.provider && entry.modelId) model = { provider: entry.provider, modelId: entry.modelId };
        if (entry.type === 'thinking_level_change' && entry.thinkingLevel) thinkingLevel = entry.thinkingLevel;
        if (entry.type === 'compaction' && typeof entry.summary === 'string') {
            summary = entry.summary;
            sections = readSections(entry.details?.pivaneBot?.sections);
        }
        // A generation that has not compacted yet carries its own seed forward.
        if (entry.type === 'custom_message' && entry.customType === HANDOFF_MESSAGE && !summary) {
            sections = readSections(entry.details?.sections);
            summary = sections ? '' : textOf(entry.content).split(TAIL_HEADING)[0].trim();
        }
    }
    const sharedNotebook = branch.findLast(entry => entry.type === 'compaction')?.details?.pivaneBot?.notebook?.scope === 'buddy';
    const state = sharedNotebook ? ledger.emptyLedger() : ledger.replay(branch);
    if (!ledger.storable(state)) throw Object.assign(new Error('The notebook of this chat cannot be carried over'), { status: 409 });
    // Read the model-visible projection, including edits. A carried tail keeps its
    // original entry, session and age through further manual generation changes.
    const inputs = nativeInputIndex(branch, manager.getSessionId()), candidates = [];
    let complete = true;
    for (const { sourceEntry: entry, messages: projected } of manager.buildSessionProjection().entries) {
        if (entry.type === 'custom_message' && entry.customType === HANDOFF_MESSAGE) {
            if (!projected.length) continue;
            if (entry.details?.complete === false) complete = false;
            const visible = projected.map(message => textOf(message.content)).join('\n').replace(/\s+/g, ' ').trim();
            for (const item of Array.isArray(entry.details?.tail) ? entry.details.tail : []) {
                if (!item || !['user', 'assistant'].includes(item.role) || typeof item.text !== 'string' || !item.text.trim() || !visible.includes(item.text.replace(/\s+/g, ' ').trim())) continue;
                candidates.push({ role: item.role, text: item.text, entryId: typeof item.entryId === 'string' ? item.entryId : null,
                    sessionId: typeof item.sessionId === 'string' ? item.sessionId : typeof entry.details?.fromSessionId === 'string' ? entry.details.fromSessionId : null,
                    ...(Number.isFinite(item.at) ? { at: item.at } : {}), ...channelSource(item.channel === 'weixin' ? item : null) });
            }
            continue;
        }
        for (const projectedMessage of projected) {
            const message = projectNativeMessage(entry, projectedMessage, inputs);
            if (!['user', 'assistant'].includes(message.role)) continue;
            const text = textOf(message.content).trim();
            if (!text) continue;
            const at = Number.isFinite(message.timestamp) ? message.timestamp : Date.parse(entry.timestamp);
            candidates.push({ role: message.role, text, entryId: entry.id, sessionId: manager.getSessionId(),
                ...(Number.isFinite(at) ? { at } : {}), ...channelSource(inputs.channels.get(entry.id)) });
        }
    }
    const tail = [], messages = [];
    let used = 0;
    for (let index = candidates.length - 1; index >= 0; index--) {
        const item = candidates[index], label = item.role === 'user' ? 'User: ' : 'Assistant: ', line = label + item.text;
        if (tail.length >= MAX_TAIL_MESSAGES || used + line.length > MAX_TAIL_CHARS) {
            if (!tail.length) {
                const text = clip(item.text, MAX_TAIL_CHARS - label.length);
                tail.unshift(label + text); messages.unshift({ ...item, text });
            }
            complete = false;
            break;
        }
        tail.unshift(line); used += line.length;
        messages.unshift(item);
    }
    const sectionsText = [];
    if (sections) sectionsText.push(summaryText(sections, state, now, sharedNotebook));
    else {
        if (summary) sectionsText.push('## Earlier conversation (summary)\n' + clip(summary.trim(), MAX_SUMMARY_CHARS));
        if (state.items.length) sectionsText.push('## Notebook\n' + ledger.renderLedger(state, { now }));
    }
    const parts = ['[Continuation] This chat window continues from earlier conversation with the same user. Carry on naturally; do not mention any change of storage or session.',
        ...sectionsText];
    if (tail.length) parts.push(TAIL_HEADING + '\n' + tail.join('\n\n'));
    const hasContent = sectionsText.length > 0 || tail.length > 0;
    // tail: the verbatim part as messages (with the entry and time they had), kept in the seed's
    // details so the next summary can read (and cite) them when the summary before the move did
    // not already cover them.
    return { model, thinkingLevel, lastEntryId: manager.getLeafId(), snapshot: state.items.length ? state : null,
        sections, notebook: state.items.length > 0, complete, tail: messages, text: hasContent ? parts.join('\n\n') : '' };
}

module.exports = { HANDOFF_MESSAGE, TAIL_HEADING, buildHandoff };
