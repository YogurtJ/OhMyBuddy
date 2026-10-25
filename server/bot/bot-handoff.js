'use strict';
// Continuity seed for a new window generation (M2): the notebook snapshot, the latest
// structured summary with a freshly rendered notebook (or Pi's own summary plus the
// notebook when the last compaction fell back), and a bounded verbatim tail of recent text
// turns. Everything is read from the predecessor's verified native entries; nothing is invented.
const ledger = require('./bot-ledger');
const { readSections, summaryText } = require('./bot-compaction');

const HANDOFF_MESSAGE = 'pivane-bot-handoff';
// The recent part is carried verbatim: a rotation follows a summary, so this is about what Pi
// kept after it (its keepRecentTokens), which the model was seeing anyway.
const MAX_TAIL_CHARS = 64000;
const MAX_TAIL_MESSAGES = 400;
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
    // The model-visible projection after the latest compaction; only plain user/assistant text is carried.
    // complete: every user/assistant text since the latest summary is in the tail.
    const tail = [];
    let used = 0, complete = true;
    const entries = manager.buildContextEntries();
    for (let index = entries.length - 1; index >= 0; index--) {
        const entry = entries[index];
        if (entry.type !== 'message' || !['user', 'assistant'].includes(entry.message?.role)) continue;
        const text = textOf(entry.message.content).trim();
        if (!text) continue;
        const line = `${entry.message.role === 'user' ? 'User' : 'Assistant'}: ${text}`;
        if (tail.length >= MAX_TAIL_MESSAGES || used + line.length > MAX_TAIL_CHARS) {
            if (!tail.length) tail.unshift(clip(line, MAX_TAIL_CHARS));
            complete = false;
            break;
        }
        tail.unshift(line); used += line.length;
    }
    const sectionsText = [];
    if (sections) sectionsText.push(clip(summaryText(sections, state, now), MAX_SUMMARY_CHARS));
    else {
        if (summary) sectionsText.push('## Earlier conversation (summary)\n' + clip(summary.trim(), MAX_SUMMARY_CHARS));
        if (state.items.length) sectionsText.push('## Notebook\n' + ledger.renderLedger(state, { now }));
    }
    const parts = ['[Continuation] This chat window continues from earlier conversation with the same user. Carry on naturally; do not mention any change of storage or session.',
        ...sectionsText];
    if (tail.length) parts.push('## Most recent messages (verbatim)\n' + tail.join('\n\n'));
    const hasContent = sectionsText.length > 0 || tail.length > 0;
    return { model, thinkingLevel, lastEntryId: manager.getLeafId(), snapshot: state.items.length ? state : null,
        sections, notebook: state.items.length > 0, complete, text: hasContent ? parts.join('\n\n') : '' };
}

module.exports = { HANDOFF_MESSAGE, buildHandoff };
