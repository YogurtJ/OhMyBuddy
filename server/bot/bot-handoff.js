'use strict';
// Continuity seed for a new window generation (M2): the notebook snapshot, the latest
// structured summary with a freshly rendered notebook (or Pi's own summary plus the
// notebook when the last compaction fell back), and a bounded verbatim tail of recent text
// turns. Everything is read from the predecessor's verified native entries; nothing is invented.
const ledger = require('./bot-ledger');
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
            summary = sections ? '' : textOf(entry.content);
        }
    }
    const state = ledger.replay(branch);
    if (!ledger.storable(state)) throw Object.assign(new Error('The notebook of this chat cannot be carried over'), { status: 409 });
    // The model-visible projection after the latest compaction; only plain user/assistant text is carried.
    // complete: every user/assistant text since the latest summary is in the tail.
    const tail = [], messages = [];
    let used = 0, complete = true;
    const entries = manager.buildContextEntries();
    for (let index = entries.length - 1; index >= 0; index--) {
        const entry = entries[index];
        if (entry.type !== 'message' || !['user', 'assistant'].includes(entry.message?.role)) continue;
        const text = textOf(entry.message.content).trim();
        if (!text) continue;
        const line = `${entry.message.role === 'user' ? 'User' : 'Assistant'}: ${text}`;
        const at = Number.isFinite(entry.message.timestamp) ? entry.message.timestamp : Date.parse(entry.timestamp);
        if (tail.length >= MAX_TAIL_MESSAGES || used + line.length > MAX_TAIL_CHARS) {
            if (!tail.length) {
                tail.unshift(clip(line, MAX_TAIL_CHARS));
                messages.unshift({ role: entry.message.role, text: clip(text, MAX_TAIL_CHARS), entryId: entry.id, ...(Number.isFinite(at) ? { at } : {}) });
            }
            complete = false;
            break;
        }
        tail.unshift(line); used += line.length;
        messages.unshift({ role: entry.message.role, text, entryId: entry.id, ...(Number.isFinite(at) ? { at } : {}) });
    }
    const sectionsText = [];
    if (sections) sectionsText.push(summaryText(sections, state, now));
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
