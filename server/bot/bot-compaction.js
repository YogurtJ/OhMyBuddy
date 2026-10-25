'use strict';
// Structured compaction of a Bot window (D-029), as pure functions: what to summarize,
// the request to the Bot's model, and the checks on its answer. The worker extension
// performs the model calls; the evaluation harness reuses the same functions.
//
// The model returns JSON: what the chat is about, dated episodes (merged with the earlier
// ones), where things stand, and notebook changes. Every notebook change must cite an
// entry of the summarized part and copy words from it; the program checks the quote and
// drops changes that fail. The summary text itself is assembled here, with the notebook
// rendered by the program, never written by the model.
const ledger = require('./bot-ledger');

const SUMMARY_SCHEMA = 1;
const MAX_TOPIC = 800;
const MAX_EPISODES = 40;
const MAX_EPISODE = 400;
const MAX_NOW = 600;
const MAX_TOOL_CHARS = 1200;
const MAX_MESSAGE_CHARS = 4000;
const MIN_QUOTE = 2, MAX_QUOTE = 300;
const REQUEST_RESERVE_TOKENS = 12000;

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fold = text => String(text ?? '').replace(/\s+/g, ' ').trim();

function textOf(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n');
}

function clip(text, max) {
    return text.length <= max ? text : `${text.slice(0, max)} …[+${text.length - max} chars]`;
}

// Rough token estimate that does not undercount CJK text (one token per CJK character).
function estimateTokens(text) {
    let cjk = 0;
    for (const ch of text) if (/[\u3000-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/u.test(ch)) cjk++;
    return Math.ceil(cjk + (text.length - cjk) / 3.5);
}

function shortId(id) { return String(id).slice(0, 8); }

// The message's own time (what was said when), else when the entry was written.
function stamp(entry, message) {
    const own = message?.timestamp, time = Number.isFinite(own) ? own : Date.parse(entry?.timestamp);
    return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 16).replace('T', ' ') : '';
}

// The summarized part: projected messages before the kept tail, each with the entry that
// owns it. projection = manager.buildSessionProjection().entries.
function summarizedEntries(projection, firstKeptEntryId) {
    const result = [];
    for (const item of projection) {
        const entry = item.sourceEntry;
        if (!entry || entry.id === firstKeptEntryId) break;
        // The compaction itself and earlier notebook renderings are passed separately.
        if (entry.type === 'compaction' || entry.type === 'custom_message' && entry.customType === 'pivane-bot-notebook') continue;
        for (const message of item.messages || []) {
            const role = message.role;
            if (role === 'user' || role === 'assistant' || role === 'toolResult' || role === 'custom' || role === 'bashExecution')
                result.push({ entry, message });
        }
    }
    return result;
}

// One line block per message; tool output and very long text are clipped (quotes are still
// checked against the full original text).
function serializeMessage({ entry, message }) {
    const head = `[e:${shortId(entry.id)}] ${stamp(entry, message)}`.trim();
    if (message.role === 'user') return `${head} User: ${clip(fold(textOf(message.content)), MAX_MESSAGE_CHARS)}`;
    if (message.role === 'assistant') {
        const lines = [`${head} Assistant: ${clip(fold(textOf(message.content)), MAX_MESSAGE_CHARS)}`];
        for (const part of Array.isArray(message.content) ? message.content : [])
            if (part?.type === 'toolCall') lines.push(`  → ${part.name} ${clip(JSON.stringify(part.arguments ?? {}), 300)}`);
        return lines.join('\n');
    }
    if (message.role === 'toolResult') return `${head} Tool result (${message.toolName}${message.isError ? ', failed' : ''}): ${clip(fold(textOf(message.content)), MAX_TOOL_CHARS)}`;
    if (message.role === 'bashExecution') return `${head} Command: ${clip(String(message.command ?? ''), 300)} → ${clip(fold(message.output), MAX_TOOL_CHARS)}`;
    return `${head} Context note: ${clip(fold(textOf(message.content)), MAX_MESSAGE_CHARS)}`;
}

// Splits the summarized messages into parts that fit one request, at user messages when possible.
function chunkMessages(messages, budgetTokens) {
    const chunks = [];
    let current = [], used = 0;
    for (const item of messages) {
        const tokens = estimateTokens(serializeMessage(item));
        if (current.length && used + tokens > budgetTokens && (item.message.role === 'user' || used > budgetTokens * 1.5)) {
            chunks.push(current); current = []; used = 0;
        }
        current.push(item); used += tokens;
    }
    if (current.length) chunks.push(current);
    return chunks;
}

function requestBudget(model) {
    const window = Number(model?.contextWindow) > 0 ? Number(model.contextWindow) : 128000;
    return Math.max(4000, Math.min(Math.floor(window * 0.6), 160000) - REQUEST_RESERVE_TOKENS);
}

// Earlier structured sections: the latest Bot compaction, else a generation seed.
function earlierSections(branch) {
    let sections = null;
    for (const entry of branch || []) {
        if (entry.type === 'compaction' && object(entry.details?.pivaneBot?.sections)) sections = entry.details.pivaneBot.sections;
        if (entry.type === 'custom_message' && object(entry.details?.sections) && entry.details.pivaneNotebook === true) sections = entry.details.sections;
    }
    return readSections(sections);
}

function readSections(value) {
    if (!object(value)) return null;
    const topic = typeof value.topic === 'string' ? value.topic : '';
    const episodes = Array.isArray(value.episodes) ? value.episodes.filter(item => typeof item === 'string') : [];
    const now = object(value.now) ? value.now : {};
    return { topic, episodes, now: { doing: String(now.doing ?? ''), next: String(now.next ?? ''), waiting: String(now.waiting ?? '') } };
}

function notebookLines(state) {
    const items = state.items.filter(item => item.status !== 'deleted');
    if (!items.length) return '(empty)';
    return items.map(item => `[${item.id}] (${item.kind}, ${item.status}${item.due ? `, due ${item.due}` : ''}) ${item.text}`).join('\n');
}

const SYSTEM_PROMPT = 'You maintain the long-term memory of one chat between a user and their personal assistant. '
    + 'Read the earlier memory, the notebook and the new part of the conversation, then answer with ONE JSON object and nothing else. '
    + 'Do not continue the conversation or answer questions in it.';

function requestText({ earlier, nativeSummary, state, chunk, today }) {
    const parts = [];
    if (earlier) parts.push('<earlier_memory>\n' + JSON.stringify(earlier, null, 1) + '\n</earlier_memory>');
    if (nativeSummary) parts.push('<earlier_summary>\n' + clip(nativeSummary, 20000) + '\n</earlier_summary>');
    parts.push('<notebook>\n' + notebookLines(state) + '\n</notebook>');
    parts.push('<conversation>\n' + chunk.map(serializeMessage).join('\n') + '\n</conversation>');
    parts.push(`Today is ${today}. Return this JSON object:
{
  "topic": "what this chat is about overall, 1-3 sentences",
  "episodes": ["YYYY-MM-DD: what happened or was decided", "..."],
  "now": { "doing": "what is in progress", "next": "agreed next steps", "waiting": "what is waiting for the user" },
  "notes": [
    { "op": "add", "kind": "decision|commitment|open|preference|ref", "text": "...", "due": "YYYY-MM-DD (optional)", "replaces": "n3 (optional)", "entry": "e-id", "quote": "..." },
    { "op": "update", "id": "n3", "text": "...", "due": "YYYY-MM-DD (optional)", "entry": "e-id", "quote": "..." },
    { "op": "done", "id": "n3", "entry": "e-id", "quote": "..." },
    { "op": "cancel", "id": "n3", "entry": "e-id", "quote": "..." }
  ]
}
Rules:
- episodes: merge the earlier memory's episodes with the new part, oldest first, at most ${MAX_EPISODES}; condense old ones, keep exact names, numbers and dates. Leave a "now" field empty when there is nothing.
- notes are changes to the notebook based only on the new conversation part:
  - decision and preference: only what the USER decided or stated. A suggestion by the assistant is not a decision unless the user accepted it; then quote the user's acceptance.
  - commitment: something the user or the assistant promised to do, with the due date if one was said. open: a question still waiting for an answer. ref: exact names, numbers, codes, addresses or dates worth keeping.
  - Do not add what the notebook already has; update that note instead (or add with "replaces" when it is a new decision replacing an old one). Use done or cancel only when the conversation says so.
  - "entry" is the e-id shown before the message (without "e:"); "quote" is copied exactly from that message, ${MIN_QUOTE}-${MAX_QUOTE} characters.
- Write topic, episodes, now and note texts in the user's language.`);
    return parts.join('\n\n');
}

function parseJson(text) {
    const raw = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('The summary was not JSON');
    return JSON.parse(raw.slice(start, end + 1));
}

function checkText(value, max, name) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') throw new Error(`Summary field ${name} is not text`);
    const text = value.trim();
    if (text.length > max) throw new Error(`Summary field ${name} is too long`);
    return text;
}

function readAnswer(value) {
    if (!object(value)) throw new Error('The summary was not an object');
    const topic = checkText(value.topic, MAX_TOPIC, 'topic');
    if (!Array.isArray(value.episodes ?? [])) throw new Error('Summary episodes are not a list');
    const episodes = (value.episodes ?? []).map((item, index) => checkText(item, MAX_EPISODE, `episodes[${index}]`)).filter(Boolean);
    if (episodes.length > MAX_EPISODES + 10) throw new Error('Too many episodes');
    const now = object(value.now) ? value.now : {};
    return { topic, episodes: episodes.slice(-MAX_EPISODES),
        now: { doing: checkText(now.doing, MAX_NOW, 'now.doing'), next: checkText(now.next, MAX_NOW, 'now.next'), waiting: checkText(now.waiting, MAX_NOW, 'now.waiting') },
        notes: Array.isArray(value.notes) ? value.notes.slice(0, 64) : [] };
}

const QUOTE_ROLES = Object.freeze({
    decision: ['user'], preference: ['user'], commitment: ['user', 'assistant'], open: ['user', 'assistant'],
    ref: ['user', 'assistant', 'toolResult'], status: ['user', 'assistant'], update: ['user', 'assistant']
});

// Checks one proposed change against the summarized messages and the current notebook.
// Returns { op } for the ledger, or { rejected: reason }.
function checkNote(note, state, byShortId, { at }) {
    if (!object(note)) return { rejected: 'not an object' };
    const sources = byShortId.get(String(note.entry ?? '').replace(/^e:/, '').slice(0, 8));
    if (!sources) return { rejected: 'unknown entry' };
    const quote = fold(note.quote);
    if (quote.length < MIN_QUOTE || quote.length > MAX_QUOTE) return { rejected: 'quote length' };
    const target = note.id ? state.items.find(item => item.id === note.id) : null;
    const kind = note.op === 'add' ? note.kind : target?.kind;
    const roles = note.op === 'add' ? QUOTE_ROLES[kind] : note.op === 'update' && ['decision', 'preference'].includes(kind) ? ['user']
        : QUOTE_ROLES[note.op === 'update' ? 'update' : 'status'];
    if (!roles) return { rejected: 'unknown kind' };
    const matching = sources.find(source => roles.includes(source.message.role) && fold(source.text).includes(quote));
    if (!matching) return { rejected: sources.some(source => fold(source.text).includes(quote)) ? 'quote from the wrong speaker' : 'quote not found' };
    const source = { sessionId: matching.sessionId, entryId: matching.entry.id, role: matching.message.role, quote };
    let raw;
    if (note.op === 'add') {
        const text = fold(note.text);
        if (state.items.some(item => item.status === 'active' && item.kind === note.kind && fold(item.text) === text)) return { rejected: 'already noted' };
        raw = { op: 'add', kind: note.kind, text: note.text, due: note.due || null, supersedes: note.replaces || undefined };
    } else if (note.op === 'update') raw = { op: 'update', id: note.id, text: note.text, due: note.due || undefined };
    else if (note.op === 'done' || note.op === 'cancel') raw = { op: 'status', id: note.id, status: note.op === 'done' ? 'done' : 'cancelled' };
    else return { rejected: 'unknown op' };
    try { return { op: ledger.normalizeOp(raw, state, { at, by: 'summary', source }) }; }
    catch (error) { return { rejected: error.message }; }
}

// Applies the checked changes of one answer. Returns the accepted operations, rejections and the new state.
function applyNotes(notes, state, byShortId, meta) {
    const ops = [], rejected = [];
    let current = state;
    for (const note of notes) {
        const result = checkNote(note, current, byShortId, meta);
        if (result.rejected) { rejected.push({ op: String(note?.op ?? ''), id: note?.id ?? null, reason: result.rejected }); continue; }
        current = ledger.applyOp(current, result.op);
        ops.push(result.op);
    }
    return { ops, rejected, state: current };
}

function indexSources(chunk, sessionId) {
    const byShortId = new Map();
    for (const item of chunk) {
        const key = shortId(item.entry.id);
        const text = item.message.role === 'toolResult' ? textOf(item.message.content) : item.message.role === 'bashExecution'
            ? String(item.message.output ?? '') : textOf(item.message.content);
        if (!byShortId.has(key)) byShortId.set(key, []);
        byShortId.get(key).push({ entry: item.entry, message: item.message, text, sessionId });
    }
    return byShortId;
}

function summaryText(sections, state, now) {
    const lines = ['[Chat memory, maintained by Pivane. Earlier messages of this chat were condensed into this.]', '', '## What this chat is about',
        sections.topic || '(not stated yet)', '', '## Notebook', ledger.renderLedger(state, { now }), '', '## What happened (oldest first)'];
    lines.push(...(sections.episodes.length ? sections.episodes.map(item => `- ${item}`) : ['- (nothing yet)']));
    lines.push('', '## Where things stand');
    lines.push(`- Doing: ${sections.now.doing || '—'}`, `- Next: ${sections.now.next || '—'}`, `- Waiting for the user: ${sections.now.waiting || '—'}`);
    return lines.join('\n');
}

// Runs the structured compaction with a caller-supplied model call:
//   complete({ systemPrompt, text, signal }) -> { text, usage, stopReason }
// Returns { summary, details, usage } or throws (the caller falls back to Pi's native summary).
async function structuredCompaction({ branch, projection, firstKeptEntryId, previousSummary, sessionId, model, now, complete, signal, reason }) {
    const messages = summarizedEntries(projection, firstKeptEntryId);
    if (!messages.length) throw new Error('Nothing to summarize');
    if (!branch.some(entry => entry.id === firstKeptEntryId)) throw new Error('The kept part is not on this branch');
    let state = ledger.replay(branch);
    let earlier = earlierSections(branch);
    const nativeSummary = previousSummary && !branch.some(entry => entry.type === 'compaction' && entry.summary === previousSummary
        && entry.details?.pivaneBot) ? previousSummary : '';
    const chunks = chunkMessages(messages, requestBudget(model));
    const ops = [], rejected = [], usage = [];
    let sections = null;
    for (const [index, chunk] of chunks.entries()) {
        const text = requestText({ earlier, nativeSummary: index === 0 ? nativeSummary : '', state, chunk, today: now.slice(0, 10) });
        const response = await complete({ systemPrompt: SYSTEM_PROMPT, text, signal });
        if (response.usage) usage.push(response.usage);
        if (response.stopReason === 'length') throw new Error('The summary was cut off');
        if (response.stopReason === 'error' || response.stopReason === 'aborted') throw new Error(response.errorMessage || 'The summary request failed');
        const answer = readAnswer(parseJson(response.text));
        const applied = applyNotes(answer.notes, state, indexSources(chunk, sessionId), { at: now });
        state = applied.state; ops.push(...applied.ops); rejected.push(...applied.rejected);
        sections = { topic: answer.topic, episodes: answer.episodes, now: answer.now };
        earlier = sections;
    }
    const summary = summaryText(sections, state, now);
    return {
        summary,
        usage: mergeUsage(usage),
        details: { pivaneBot: { v: SUMMARY_SCHEMA, kind: 'summary', reason, sections, chunks: chunks.length,
            model: model ? { provider: model.provider, id: model.id } : null,
            ledger: { ops, snapshot: state }, rejected: rejected.slice(0, 40) } }
    };
}

// The reasoning option of a summary request, set the way Pi sets it for its own summaries:
// the chat's thinking level when the model reasons, nothing when thinking is off.
function summaryReasoning(model, thinkingLevel) {
    return model?.reasoning && typeof thinkingLevel === 'string' && thinkingLevel && thinkingLevel !== 'off' ? { reasoning: thinkingLevel } : {};
}

function mergeUsage(list) {
    if (!list.length) return undefined;
    const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    for (const item of list) {
        for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens']) total[key] += Number(item?.[key]) || 0;
        for (const key of Object.keys(total.cost)) total.cost[key] += Number(item?.cost?.[key]) || 0;
    }
    return total;
}

module.exports = {
    SUMMARY_SCHEMA, SYSTEM_PROMPT, estimateTokens, summarizedEntries, serializeMessage, chunkMessages, requestBudget,
    earlierSections, readSections, requestText, parseJson, readAnswer, checkNote, applyNotes, indexSources, summaryText, structuredCompaction, summaryReasoning
};
