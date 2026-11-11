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
const { nativeInputIndex, projectNativeMessage, channelSource } = require('../pi-native-input');
const { TOPIC_INDEX_MESSAGE } = require('./bot-topic-context');

const SUMMARY_SCHEMA = 1;
const MAX_TOPIC = 800;
const MAX_EPISODES = 40;
const MAX_EPISODE = 400;
const MAX_NOW = 600;
const MAX_TOOL_CHARS = 1200;
// Context notes (other extensions' messages) are clipped; what the user and the assistant
// said is sent whole, split into numbered parts when one message is too long for a request.
const MAX_CONTEXT_CHARS = 4000;
const MAX_DELETED_LINES = 30;
const HANDOFF_MESSAGE = 'pivane-bot-handoff';
const TAIL_HEADING = '## Most recent messages (verbatim)';
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

// The summarized part: projected messages before the kept tail (or all of them, when the
// generation moves on after this summary), each with the entry that owns it.
// projection = manager.buildSessionProjection().entries.
function summarizedEntries(projection, firstKeptEntryId, { branch = projection.map(item => item.sourceEntry).filter(Boolean), sessionId } = {}) {
    const result = [], inputs = nativeInputIndex(branch, sessionId);
    for (const item of projection) {
        const entry = item.sourceEntry;
        if (!entry || entry.id === firstKeptEntryId) break;
        // The compaction itself and earlier notebook renderings are passed separately.
        if (entry.type === 'compaction' || entry.type === 'custom_message' && ['pivane-bot-notebook', TOPIC_INDEX_MESSAGE].includes(entry.customType)) continue;
        if (entry.type === 'custom_message' && entry.customType === HANDOFF_MESSAGE) {
            for (const message of item.messages || []) result.push(...seedItems(entry, message));
            continue;
        }
        for (const projected of item.messages || []) {
            const message = projectNativeMessage(entry, projected, inputs), role = message.role;
            if (role === 'user' || role === 'assistant' || role === 'toolResult' || role === 'custom' || role === 'bashExecution')
                result.push({ entry, message });
        }
    }
    return result;
}

// What a generation seed adds to the summarized part. Its sections are the earlier memory
// already. When the summary before the move also read the verbatim part (reconciled), nothing
// else; otherwise (a manual move, or a seed of an older version) the carried messages are read
// as what the user and the assistant said (citable, with the seed as their entry; origin keeps
// the entry and time they had, so a deletion made after them still holds), and the seed's own
// summary when it has no sections (Pi's summary after a fallback).
function seedItems(entry, message) {
    const details = object(entry.details) ? entry.details : {};
    const sections = object(details.sections);
    if (sections && details.reconciled === true) return [];
    const text = textOf(message.content), cut = text.indexOf(TAIL_HEADING), items = [];
    if (!sections) {
        const head = (cut >= 0 ? text.slice(0, cut) : text).trim();
        if (head) items.push({ entry, message: { role: 'custom', content: head }, whole: true });
    }
    if (Array.isArray(details.tail)) {
        for (const item of details.tail) if (object(item) && (item.role === 'user' || item.role === 'assistant') && typeof item.text === 'string' && item.text.trim() && fold(text).includes(fold(item.text)))
            items.push({ entry, message: { role: item.role, content: item.text, ...(Number.isFinite(item.at) ? { timestamp: item.at } : {}), ...channelSource(item.channel === 'weixin' ? item : null) },
                origin: { sessionId: typeof item.sessionId === 'string' ? item.sessionId : typeof details.fromSessionId === 'string' ? details.fromSessionId : null, entryId: typeof item.entryId === 'string' ? item.entryId : null, at: Number.isFinite(item.at) ? item.at : null } });
    } else if (cut >= 0) items.push({ entry, message: { role: 'custom', content: text.slice(cut) }, whole: true });
    return items;
}

// One line block per message (or per part of a long one, see splitLong). Tool output and
// context notes are clipped; quotes are checked against the full original text.
function serializeMessage({ entry, message, part, whole }) {
    const head = `[e:${shortId(entry.id)}] ${stamp(entry, message)}`.trim();
    const label = part ? ` (part ${part.index}/${part.total})` : '';
    const said = () => part ? part.text : fold(textOf(message.content));
    if (message.role === 'user') return `${head} User${label}: ${said()}`;
    if (message.role === 'assistant') {
        const lines = [`${head} Assistant${label}: ${said()}`];
        if (!part || part.index === part.total) for (const item of Array.isArray(message.content) ? message.content : [])
            if (item?.type === 'toolCall') lines.push(`  → ${item.name} ${clip(JSON.stringify(item.arguments ?? {}), 300)}`);
        return lines.join('\n');
    }
    if (message.role === 'toolResult') return `${head} Tool result (${message.toolName}${message.isError ? ', failed' : ''}): ${clip(fold(textOf(message.content)), MAX_TOOL_CHARS)}`;
    if (message.role === 'bashExecution') return `${head} Command: ${clip(String(message.command ?? ''), 300)} → ${clip(fold(message.output), MAX_TOOL_CHARS)}`;
    return `${head} Context note${label}: ${part ? part.text : whole ? fold(textOf(message.content)) : clip(fold(textOf(message.content)), MAX_CONTEXT_CHARS)}`;
}

// A user or assistant message longer than about half a request becomes numbered parts that
// keep its entry and speaker, so nothing said is cut before the model reads it.
function splitLong(messages, budgetTokens) {
    const size = Math.max(2000, Math.floor(budgetTokens / 2));
    const result = [];
    for (const item of messages) {
        const role = item.message.role;
        const text = role === 'user' || role === 'assistant' || item.whole ? fold(textOf(item.message.content)) : '';
        if (text.length <= size) { result.push(item); continue; }
        const total = Math.ceil(text.length / size);
        for (let index = 0; index < total; index++)
            result.push({ ...item, part: { index: index + 1, total, text: text.slice(index * size, (index + 1) * size) } });
    }
    return result;
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

// Stored sections read back within the limits a summary answer has to meet.
function readSections(value) {
    if (!object(value)) return null;
    const text = (item, max) => typeof item === 'string' ? item.slice(0, max) : '';
    const topic = text(value.topic, MAX_TOPIC);
    const episodes = Array.isArray(value.episodes) ? value.episodes.filter(item => typeof item === 'string').slice(-MAX_EPISODES).map(item => item.slice(0, MAX_EPISODE)) : [];
    const now = object(value.now) ? value.now : {};
    return { topic, episodes, now: { doing: text(now.doing, MAX_NOW), next: text(now.next, MAX_NOW), waiting: text(now.waiting, MAX_NOW) } };
}

function notebookLines(state) {
    const available = state.items.filter(item => item.status !== 'deleted');
    const items = state.scope === 'buddy' ? available.slice(-80) : available;
    const lines = items.length ? items.map(item => `[${item.id}] (${item.kind}, ${item.status}${item.subject ? `, subject ${JSON.stringify(item.subject)}` : ''}${item.due ? `, due ${item.due}` : ''}) ${item.text}`) : ['(empty)'];
    if (items.length < available.length) lines.push(`${available.length - items.length} other Buddy items omitted. Do not infer their state from this selection.`);
    const deleted = state.items.filter(item => item.status === 'deleted' && item.source?.quote).slice(-MAX_DELETED_LINES);
    if (deleted.length) lines.push('Deleted by the user (do not add these again unless the user brings them up anew):',
        ...deleted.map(item => `- (${item.kind}) from: "${item.source.quote}"`));
    return lines.join('\n');
}

const SYSTEM_PROMPT = 'You maintain the long-term memory of one chat between a user and their personal assistant. '
    + 'Read the earlier memory, the notebook and the new part of the conversation, then answer with ONE JSON object and nothing else. '
    + 'Do not continue the conversation or answer questions in it.';

function requestText({ earlier, nativeSummary, state, chunk, today, subject = '' }) {
    const exampleId = state.scope === 'buddy' ? 'b3' : 'n3';
    const parts = [];
    if (earlier) parts.push('<earlier_memory>\n' + JSON.stringify(earlier, null, 1) + '\n</earlier_memory>');
    if (nativeSummary) parts.push('<earlier_summary>\n' + clip(nativeSummary, 20000) + '\n</earlier_summary>');
    parts.push('<notebook>\n' + notebookLines(state) + '\n</notebook>');
    if (state.scope === 'buddy') parts.push('This notebook belongs to the Buddy across all chats. Current work label: ' + JSON.stringify(subject)
        + '. Only add information that needs to survive this conversation; omit temporary formatting requests and already-answered routine questions. '
        + 'For additions, include subject using this label or an existing notebook subject when it is clearly the same work. '
        + 'Different papers, trips or other work may have different requirements even when their note text is identical. Omit ambiguous updates.');
    parts.push('<conversation>\n' + chunk.map(serializeMessage).join('\n') + '\n</conversation>');
    parts.push(`Today is ${today}. Return this JSON object:
{
  "notes": [
    { "op": "done", "id": "${exampleId}", "entry": "e-id", "quote": "..." },
    { "op": "cancel", "id": "${exampleId}", "entry": "e-id", "quote": "..." },
    { "op": "update", "id": "${exampleId}", "text": "...", "due": "YYYY-MM-DD (optional)", "entry": "e-id", "quote": "..." },
    { "op": "add", "kind": "decision|commitment|open|preference|ref", "text": "...", "due": "YYYY-MM-DD (optional)", "replaces": "${exampleId} (optional)", "entry": "e-id", "quote": "..." }
  ],
  "topic": "what this chat is about overall, 1-3 sentences",
  "episodes": ["YYYY-MM-DD: what happened or was decided", "..."],
  "now": { "doing": "what is in progress", "next": "agreed next steps", "waiting": "what is waiting for the user" }
}
Rules:
- First go through every ACTIVE note in the notebook, one by one. If the new conversation part shows that it was done, answered, settled, cancelled, withdrawn, no longer needed, or changed (new date, new text), add the done, cancel or update for it, quoting the message that says so. This matters most: a note left active after the user settled or withdrew it misleads the assistant for months.
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

// The answer must have every section: a topic, a list of episodes (not empty when the earlier
// memory had some, and never empty after a conversation), the "now" object and a notes list.
// Anything less is not a replacement for what the chat remembered, so Pi's own summary is used.
function readAnswer(value, { earlier = null } = {}) {
    if (!object(value)) throw new Error('The summary was not an object');
    const topic = checkText(value.topic, MAX_TOPIC, 'topic');
    if (!topic) throw new Error('The summary has no topic');
    if (!Array.isArray(value.episodes)) throw new Error('Summary episodes are not a list');
    const episodes = value.episodes.map((item, index) => checkText(item, MAX_EPISODE, `episodes[${index}]`)).filter(Boolean);
    if (episodes.length > MAX_EPISODES + 10) throw new Error('Too many episodes');
    if (!episodes.length) throw new Error(earlier?.episodes?.length ? 'The summary dropped the earlier episodes' : 'The summary has no episodes');
    if (!object(value.now)) throw new Error('The summary has no "now" section');
    if (!Array.isArray(value.notes)) throw new Error('The summary has no notes list');
    const now = value.now;
    return { topic, episodes: episodes.slice(-MAX_EPISODES),
        now: { doing: checkText(now.doing, MAX_NOW, 'now.doing'), next: checkText(now.next, MAX_NOW, 'now.next'), waiting: checkText(now.waiting, MAX_NOW, 'now.waiting') },
        notes: value.notes.slice(0, 64) };
}

const QUOTE_ROLES = Object.freeze({
    decision: ['user'], preference: ['user'], commitment: ['user', 'assistant'], open: ['user', 'assistant'],
    ref: ['user', 'assistant', 'toolResult'], status: ['user', 'assistant'], update: ['user', 'assistant']
});

// Checks one proposed change against the summarized messages and the current notebook.
// Returns { op } for the ledger, or { rejected: reason }.
function checkNote(note, state, byShortId, { at, subject = '' }) {
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
    const candidates = sources.filter(source => roles.includes(source.message.role) && fold(source.text).includes(quote));
    if (!candidates.length) return { rejected: sources.some(source => fold(source.text).includes(quote)) ? 'quote from the wrong speaker' : 'quote not found' };
    let matching = candidates[0], raw;
    if (note.op === 'add') {
        const text = fold(note.text), noteSubject = state.scope === 'buddy' ? (note.subject ?? subject) : undefined;
        const sameSubject = item => state.scope !== 'buddy' || fold(item.subject || '') === fold(noteSubject || '');
        if (state.items.some(item => item.status === 'active' && item.kind === note.kind && fold(item.text) === text && sameSubject(item))) return { rejected: 'already noted' };
        // A note the user deleted does not come back from what was said before the deletion. A
        // message carried in a generation seed counts from when it was said (unknown: not newer);
        // when its original entry is unknown, any older deletion of the same kind bars it. Of
        // several messages with the quote (a seed carries many), one said anew counts.
        const hash = ledger.textHash(note.text);
        const barred = candidate => {
            const origin = candidate.origin;
            const said = origin ? (origin.at ?? NaN) : Date.parse(candidate.entry.timestamp);
            const entries = [candidate.entry.id, origin?.entryId].filter(Boolean);
            return state.items.some(item => item.status === 'deleted' && !(said > Date.parse(item.updatedAt)) && (item.hash === hash && sameSubject(item)
                || item.kind === note.kind && (entries.includes(item.source?.entryId) || entries.includes(item.source?.origin?.entryId) || Boolean(origin) && !origin.entryId)));
        };
        matching = candidates.find(candidate => !barred(candidate));
        if (!matching) return { rejected: 'deleted by the user' };
        raw = { op: 'add', kind: note.kind, text: note.text, due: note.due || null, supersedes: note.replaces || undefined,
            ...(noteSubject !== undefined ? { subject: noteSubject } : {}) };
    } else if (note.op === 'update') raw = { op: 'update', id: note.id, text: note.text, due: note.due || undefined };
    else if (note.op === 'done' || note.op === 'cancel') raw = { op: 'status', id: note.id, status: note.op === 'done' ? 'done' : 'cancelled' };
    else return { rejected: 'unknown op' };
    const source = { sessionId: matching.sessionId, entryId: matching.entry.id, role: matching.message.role, quote, ...channelSource(matching.message.channel === 'weixin' ? matching.message : null),
        ...(matching.origin ? { origin: { sessionId: matching.origin.sessionId ?? null, entryId: matching.origin.entryId ?? null, at: matching.origin.at ?? null } } : {}) };
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
        byShortId.get(key).push({ entry: item.entry, message: item.message, text, sessionId, ...(item.origin ? { origin: item.origin } : {}) });
    }
    return byShortId;
}

function summaryText(sections, state, now, shared = false) {
    const lines = ['[Chat memory, maintained by OhMyBuddy. Earlier messages of this chat were condensed into this.]', '', '## What this chat is about',
        sections.topic || '(not stated yet)', '', '## Notebook', shared
            ? 'This Buddy has one shared notebook, maintained separately from this chat summary. Use buddy_notes for its current items and status.'
            : ledger.renderLedger(state, { now }), '', '## What happened (oldest first)'];
    lines.push(...(sections.episodes.length ? sections.episodes.map(item => `- ${item}`) : ['- (nothing yet)']));
    lines.push('', '## Where things stand');
    lines.push(`- Doing: ${sections.now.doing || '—'}`, `- Next: ${sections.now.next || '—'}`, `- Waiting for the user: ${sections.now.waiting || '—'}`);
    return lines.join('\n');
}

// Runs the structured compaction with a caller-supplied model call:
//   complete({ systemPrompt, text, signal }) -> { text, usage, stopReason }
// Returns { summary, details, usage } or throws (the caller falls back to Pi's native summary).
// includeKept: the window moves to a new generation right after this summary (D-033), so the
// part Pi keeps verbatim is read too; it is reconciled with the notebook here or never.
async function structuredCompaction({ branch, projection, firstKeptEntryId, previousSummary, sessionId, model, now, complete, signal, reason, includeKept = false, sharedNotebook = null, subject = '' }) {
    const messages = summarizedEntries(projection, includeKept ? null : firstKeptEntryId, { branch, sessionId });
    if (!messages.length) throw new Error('Nothing to summarize');
    if (!branch.some(entry => entry.id === firstKeptEntryId)) throw new Error('The kept part is not on this branch');
    let state = sharedNotebook ? ledger.readSnapshot(sharedNotebook) : ledger.replay(branch);
    if (!state) throw new Error('Shared notebook snapshot is invalid');
    let earlier = earlierSections(branch);
    const nativeSummary = previousSummary && !branch.some(entry => entry.type === 'compaction' && entry.summary === previousSummary
        && entry.details?.pivaneBot) ? previousSummary : '';
    // What every request carries besides the conversation part.
    const budget = Math.max(4000, requestBudget(model) - estimateTokens(notebookLines(state)) - estimateTokens(JSON.stringify(earlier ?? {}))
        - estimateTokens(clip(nativeSummary, 20000)));
    const chunks = chunkMessages(splitLong(messages, budget), budget);
    const ops = [], rejected = [], usage = [];
    let sections = null;
    for (const [index, chunk] of chunks.entries()) {
        const text = requestText({ earlier, nativeSummary: index === 0 ? nativeSummary : '', state, chunk, today: now.slice(0, 10), subject });
        const response = await complete({ systemPrompt: SYSTEM_PROMPT, text, signal });
        if (response.usage) usage.push(response.usage);
        if (response.stopReason === 'length') throw new Error('The summary was cut off');
        if (response.stopReason === 'error' || response.stopReason === 'aborted') throw new Error(response.errorMessage || 'The summary request failed');
        const answer = readAnswer(parseJson(response.text), { earlier });
        const applied = applyNotes(answer.notes, state, indexSources(chunk, sessionId), { at: now, subject });
        state = applied.state; ops.push(...applied.ops); rejected.push(...applied.rejected);
        sections = { topic: answer.topic, episodes: answer.episodes, now: answer.now };
        earlier = sections;
    }
    if (!ledger.storable(state)) throw new Error('The notebook could not be stored');
    const summary = summaryText(sections, state, now, Boolean(sharedNotebook));
    return {
        summary,
        ...(sharedNotebook ? { notebookOps: ops } : {}),
        usage: mergeUsage(usage),
        details: { pivaneBot: { v: SUMMARY_SCHEMA, kind: 'summary', reason, sections, chunks: chunks.length, ...(includeKept ? { includedKept: true } : {}),
            model: model ? { provider: model.provider, id: model.id } : null,
            ...(sharedNotebook ? { notebook: { scope: 'buddy' } } : { ledger: { ops, snapshot: state } }), rejected: rejected.slice(0, 40) } }
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
    earlierSections, readSections, requestText, splitLong, notebookLines, parseJson, readAnswer, checkNote, applyNotes, indexSources, summaryText, structuredCompaction, summaryReasoning
};
