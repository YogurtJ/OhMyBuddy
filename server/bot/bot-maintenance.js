'use strict';
// Maintenance decisions of a long-lived Bot window (D-030), as pure functions:
//   S1 prune old large tool outputs with context edits (only when it saves a lot, since
//      it invalidates the cached prompt from the first edited entry on)
//   S2 summarize in the background once the prompt cache has gone cold anyway (also when the
//      generation is due to move on, so the new one starts from a fresh summary)
//   S3 Pi's native threshold/overflow compaction (summarized by the same Bot logic)
//   S4 move the window to a new generation when the file gets large, long or old
const { estimateTokens } = require('./bot-compaction');

const STUB_PREFIX = '[Earlier output of ';
const PRUNE = Object.freeze({ keepUserTurns: 3, minChars: 4000, minPercent: 35, minSaveTokens: 10000, minSaveShare: 0.2 });
// minSummarize*: an idle summary must take in a good part of the context, not just re-summarize
// what Pi keeps verbatim anyway (Pi keeps about keepRecentTokens of chars/4 from the end, which
// for Chinese text is several times more real tokens).
const IDLE = Object.freeze({ minDelayMs: 10 * 60 * 1000, minPercent: 55, minSummarizeTokens: 20000, minSummarizeShare: 0.2, keepRecentTokens: 20000 });
const ROTATE = Object.freeze({ bytes: 8 * 1024 * 1024, entries: 8000, ageMs: 60 * 24 * 3600 * 1000 });
// Tools whose results carry notebook or setup state the model should keep seeing as is.
const KEEP_TOOLS = new Set(['window_note', 'bot_setup_propose']);

function toolText(message) {
    if (typeof message.content === 'string') return message.content;
    return Array.isArray(message.content) ? message.content.filter(part => part?.type === 'text').map(part => part.text).join('\n') : '';
}

function stubFor(message, entryId) {
    const kb = Math.max(1, Math.round(toolText(message).length / 1024));
    return `${STUB_PREFIX}${message.toolName || 'a tool'} omitted (about ${kb} KB). Run it again, or use window_read with entry ${String(entryId).slice(0, 8)}, if you need it.]`;
}

// S1: context edits for old large tool outputs, or [] when pruning would not pay off.
// projection: ProjectedSessionEntry[] (sourceEntry + model-visible messages after edits).
function pruneDrafts(projection, usage, options = {}) {
    const rules = { ...PRUNE, ...options };
    if (!usage || !Number.isFinite(usage.tokens) || !Number.isFinite(usage.percent) || usage.percent < rules.minPercent) return [];
    let users = 0, boundary = projection.length;
    for (let index = projection.length - 1; index >= 0; index--) {
        if ((projection[index].messages || []).some(message => message.role === 'user')) {
            users++;
            if (users === rules.keepUserTurns) { boundary = index; break; }
        }
    }
    if (users < rules.keepUserTurns) return [];
    const drafts = [];
    let saved = 0;
    for (const item of projection.slice(0, boundary)) {
        const entry = item.sourceEntry, message = (item.messages || [])[0];
        if (entry?.type !== 'message' || !message || message.role !== 'toolResult' || KEEP_TOOLS.has(message.toolName)) continue;
        if ((message.content || []).some?.(part => part?.type === 'image' || require('../pi-session-images').isReference(part))) continue;
        const text = toolText(message);
        if (text.length < rules.minChars || text.startsWith(STUB_PREFIX)) continue;
        const stub = stubFor(message, entry.id);
        saved += estimateTokens(text) - estimateTokens(stub);
        drafts.push({ type: 'context_edit', targetId: entry.id, replacement: { content: stub } });
    }
    return saved >= Math.max(rules.minSaveTokens, usage.tokens * rules.minSaveShare) ? drafts : [];
}

// S2: how long after a run to wait before a background summary. The prompt cache is cold
// by then, so summarizing costs no extra cache misses; at least ten minutes either way.
function idleDelay(model) {
    const ttl = Number(model?.promptCache?.long) > 0 && model?.cacheRetention === 'long' ? Number(model.promptCache.long)
        : Number(model?.promptCache?.short) > 0 ? Number(model.promptCache.short) : 0;
    return Math.max(IDLE.minDelayMs, ttl * 1000);
}

function messageChars(message) {
    if (!message || ['compactionSummary', 'branchSummary'].includes(message.role)) return 0;
    if (typeof message.content === 'string') return message.content.length;
    if (!Array.isArray(message.content)) return 0;
    return message.content.reduce((total, part) => total + (require('../pi-session-images').isReference(part) ? 4800 : part?.type === 'text' ? part.text.length : part?.type === 'thinking' ? String(part.thinking ?? '').length
        : part?.type === 'toolCall' ? JSON.stringify(part.arguments ?? {}).length : part?.type === 'image' ? 4800 : 0), 0);
}

// Characters of the model-visible messages before the part Pi keeps verbatim at a compaction
// (about keepRecentTokens of its chars/4 estimate from the end), and in total. Earlier
// summaries are not counted: summarizing them again frees nothing.
function keptSplit(projection, keepRecentTokens = IDLE.keepRecentTokens) {
    const sizes = (Array.isArray(projection) ? projection : []).map(item => (item.messages || []).reduce((total, message) => total + messageChars(message), 0));
    const total = sizes.reduce((sum, size) => sum + size, 0);
    let kept = 0, index = sizes.length;
    while (index > 0 && kept / 4 < keepRecentTokens) kept += sizes[--index];
    return { before: total - kept, total };
}

// About how many real tokens a compaction would take in now, with the measured context split
// in proportion to characters.
function summarizableTokens(projection, usage, keepRecentTokens = IDLE.keepRecentTokens) {
    if (!usage || !Number.isFinite(usage.tokens) || !Array.isArray(projection)) return 0;
    const { before, total } = keptSplit(projection, keepRecentTokens);
    return total ? Math.round(usage.tokens * before / total) : 0;
}

function idleCompactionWanted(usage, projection, keepRecentTokens = IDLE.keepRecentTokens) {
    if (!usage || !Number.isFinite(usage.percent) || usage.percent < IDLE.minPercent) return false;
    const window = Number.isFinite(usage.contextWindow) && usage.contextWindow > 0 ? usage.contextWindow : usage.tokens * 100 / usage.percent;
    return summarizableTokens(projection, usage, keepRecentTokens) >= Math.max(IDLE.minSummarizeTokens, window * IDLE.minSummarizeShare);
}

// S4: why the current generation should move to a new one, or null.
function rotationReason({ bytes, entries, startedAt, now }) {
    if (bytes >= ROTATE.bytes) return 'size';
    if (entries >= ROTATE.entries) return 'entries';
    const started = Date.parse(startedAt);
    if (Number.isFinite(started) && Number.isFinite(now) && now - started >= ROTATE.ageMs) return 'age';
    return null;
}

// D-033: an automatic move to a new generation needs native proof that the latest compaction
// on the branch is a Bot summary that also read the part Pi keeps verbatim, and that nothing
// was said after it (a Pi fallback summary or a later turn means: wait for the next summary).
const CONVERSATION = new Set(['message', 'custom_message', 'branch_summary']);
function freshRotationSummary(branch) {
    for (let index = (branch || []).length - 1; index >= 0; index--) {
        const entry = branch[index];
        if (entry?.type === 'compaction') {
            const bot = entry.details?.pivaneBot;
            return Boolean(bot && bot.ledger && bot.includedKept === true);
        }
        if (CONVERSATION.has(entry?.type)) return false;
    }
    return false;
}

module.exports = { PRUNE, IDLE, ROTATE, STUB_PREFIX, pruneDrafts, stubFor, idleDelay, keptSplit, summarizableTokens, idleCompactionWanted, rotationReason,
    freshRotationSummary };
