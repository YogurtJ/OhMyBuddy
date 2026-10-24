'use strict';
// Continuity seed for a new window generation. M1 carries the latest native compaction
// summary plus a bounded verbatim tail of recent text turns. The structured summary and
// ledger replace this in M2. Everything here is read from the predecessor's verified
// native entries; nothing is invented.
const HANDOFF_MESSAGE = 'pivane-bot-handoff';
const MAX_TAIL_CHARS = 16000;
const MAX_TAIL_MESSAGES = 16;
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
function buildHandoff(manager) {
    const branch = manager.getBranch();
    let model = null, thinkingLevel = null, summary = '';
    for (const entry of branch) {
        if (entry.type === 'model_change' && entry.provider && entry.modelId) model = { provider: entry.provider, modelId: entry.modelId };
        if (entry.type === 'thinking_level_change' && entry.thinkingLevel) thinkingLevel = entry.thinkingLevel;
        if (entry.type === 'compaction' && typeof entry.summary === 'string') summary = entry.summary;
        if (entry.type === 'custom_message' && entry.customType === HANDOFF_MESSAGE && !summary) summary = textOf(entry.content);
    }
    // The model-visible projection after the latest compaction; only plain user/assistant text is carried.
    const tail = [];
    let used = 0;
    const entries = manager.buildContextEntries();
    for (let index = entries.length - 1; index >= 0 && tail.length < MAX_TAIL_MESSAGES; index--) {
        const entry = entries[index];
        if (entry.type !== 'message' || !['user', 'assistant'].includes(entry.message?.role)) continue;
        const text = textOf(entry.message.content).trim();
        if (!text) continue;
        const line = `${entry.message.role === 'user' ? 'User' : 'Assistant'}: ${text}`;
        if (used + line.length > MAX_TAIL_CHARS) {
            if (!tail.length) tail.unshift(clip(line, MAX_TAIL_CHARS));
            break;
        }
        tail.unshift(line); used += line.length;
    }
    const sections = ['[Continuation] This chat window continues from earlier conversation with the same user. Carry on naturally; do not mention any change of storage or session.'];
    if (summary) sections.push('## Earlier conversation (summary)\n' + clip(summary.trim(), MAX_SUMMARY_CHARS));
    if (tail.length) sections.push('## Most recent messages (verbatim)\n' + tail.join('\n\n'));
    return { model, thinkingLevel, lastEntryId: manager.getLeafId(), text: summary || tail.length ? sections.join('\n\n') : '' };
}

module.exports = { HANDOFF_MESSAGE, buildHandoff };
