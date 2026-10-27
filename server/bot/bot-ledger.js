'use strict';
const { createHash } = require('node:crypto');
// The window notebook ("我记着的事", D-028): decisions, commitments, open questions,
// window preferences and key references of one Bot window. It lives only in the window's
// native session entries and is recomputed by replaying the active branch:
//   - window_note tool results written before 2026-10-26: details.pivaneLedger = { v: 1, ops }
//     (the tool now writes a custom entry, below, the moment it runs)
//   - Bot compactions: details.pivaneBot.ledger = { ops, snapshot } (ops applied, then the full state)
//   - edits from the notebook panel and window_note: custom entries `pivane-bot-ledger` with { v: 1, ops }
//   - each generation's seed: custom entry `pivane-bot-ledger` with { v: 1, snapshot }
// A snapshot replaces the state; operations apply in branch order. Deleting leaves a tombstone
// (kind, source and a hash of the text, so a summary does not bring the note back); at most
// MAX_TOMBSTONES are kept, oldest dropped first (ids never repeat: nextSeq only grows).
// Everything here is a pure function: no I/O, no clocks unless a time is passed in.

const LEDGER_ENTRY = 'pivane-bot-ledger';
const KINDS = Object.freeze(['decision', 'commitment', 'open', 'preference', 'ref']);
const STATUSES = Object.freeze(['active', 'done', 'cancelled', 'superseded', 'deleted']);
const ACTORS = Object.freeze(['bot', 'user', 'summary']);
const OPS = Object.freeze(['add', 'update', 'status', 'delete']);
const MAX_TEXT = 500;
const MAX_QUOTE = 300;
const SOURCE_ROLES = Object.freeze(['user', 'assistant', 'toolResult']);
const MAX_ITEMS = 1000;
const MAX_TOMBSTONES = 1000;
const HASH = /^[0-9a-f]{16}$/;
const MAX_OPS = 64;
const ID = /^n[1-9]\d{0,6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

const BAD_DUE = 'Invalid due date: use YYYY-MM-DD or YYYY-MM-DDTHH:MM with a UTC offset, or leave it out';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw Object.assign(new Error(message), { code: 'LEDGER_INVALID' }); };

function emptyLedger() {
    return { version: 1, nextSeq: 1, items: [] };
}

function cleanText(value) {
    if (typeof value !== 'string') return null;
    const text = value.replace(/\s+/g, ' ').trim();
    return text && text.length <= MAX_TEXT ? text : null;
}

function validDate(value) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string' || !DATE.test(value) || !Number.isFinite(Date.parse(value.length === 10 ? value + 'T00:00:00Z' : value))) return undefined;
    return value;
}

// Where a note came from: the entry, plus (optionally) who said it and a short quote so
// the panel can show it after the entry has moved to an earlier generation.
function validSource(value) {
    if (value === null || value === undefined) return null;
    if (!object(value) || typeof value.sessionId !== 'string' || typeof value.entryId !== 'string'
        || value.sessionId.length > 80 || value.entryId.length > 80) return undefined;
    const source = { sessionId: value.sessionId, entryId: value.entryId };
    if (value.role !== undefined || value.quote !== undefined) {
        const quote = typeof value.quote === 'string' ? value.quote.replace(/\s+/g, ' ').trim() : '';
        if (!SOURCE_ROLES.includes(value.role) || !quote || quote.length > MAX_QUOTE) return undefined;
        source.role = value.role; source.quote = quote;
    }
    return source;
}

// A quote of at most MAX_QUOTE characters from a message's text.
function sourceQuote(text) {
    const folded = String(text ?? '').replace(/\s+/g, ' ').trim();
    return folded.length > MAX_QUOTE ? folded.slice(0, MAX_QUOTE - 1) + '…' : folded;
}

// Hash of a note's text as the program compares texts (spacing, width and case folded).
function textHash(text) {
    return createHash('sha256').update(String(text ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()).digest('hex').slice(0, 16);
}

function validTime(value) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function cloneItem(item) {
    return { ...item, ...(item.source ? { source: { ...item.source } } : {}) };
}

function cloneLedger(state) {
    return { version: 1, nextSeq: state.nextSeq, items: state.items.map(cloneItem) };
}

// Validates a snapshot as stored in a seed or compaction entry. Invalid -> null.
function readSnapshot(value) {
    if (!object(value) || value.version !== 1 || !Number.isSafeInteger(value.nextSeq) || value.nextSeq < 1 || !Array.isArray(value.items)
        || value.items.length > MAX_ITEMS + MAX_TOMBSTONES) return null;
    const deleted = value.items.filter(item => item?.status === 'deleted').length;
    if (deleted > MAX_TOMBSTONES || value.items.length - deleted > MAX_ITEMS) return null;
    const seen = new Set(), items = [];
    for (const raw of value.items) {
        if (!object(raw) || !ID.test(raw.id) || seen.has(raw.id) || Number(raw.id.slice(1)) >= value.nextSeq) return null;
        const text = cleanText(raw.text), due = validDate(raw.due), source = validSource(raw.source);
        if (!KINDS.includes(raw.kind) || !STATUSES.includes(raw.status) || !ACTORS.includes(raw.by) || (text === null && raw.status !== 'deleted')
            || due === undefined || source === undefined || !validTime(raw.createdAt) || !validTime(raw.updatedAt)) return null;
        if (raw.supersedes !== undefined && raw.supersedes !== null && !ID.test(raw.supersedes)) return null;
        if (raw.hash !== undefined && (raw.status !== 'deleted' || !HASH.test(raw.hash))) return null;
        seen.add(raw.id);
        items.push({ id: raw.id, kind: raw.kind, text: raw.status === 'deleted' ? '' : text, status: raw.status, by: raw.by, due, source,
            supersedes: raw.supersedes ?? null, createdAt: raw.createdAt, updatedAt: raw.updatedAt, ...(raw.hash ? { hash: raw.hash } : {}) });
    }
    return { version: 1, nextSeq: value.nextSeq, items };
}

// Normalizes one operation from any writer. Returns the operation or throws LEDGER_INVALID.
// `state` is the ledger it will apply to; add operations get their id assigned here.
function normalizeOp(raw, state, { at, by, source = null } = {}) {
    if (!object(raw) || !OPS.includes(raw.op)) fail('Unknown notebook operation');
    if (!ACTORS.includes(by)) fail('Unknown notebook writer');
    const time = validTime(at); if (!time) fail('Notebook operation time is required');
    const origin = validSource(raw.source ?? source); if (origin === undefined) fail('Invalid notebook source');
    if (raw.op === 'add') {
        if (!KINDS.includes(raw.kind)) fail('Unknown notebook kind');
        const text = cleanText(raw.text); if (!text) fail(`Note text must be 1-${MAX_TEXT} characters`);
        const due = validDate(raw.due); if (due === undefined) fail(BAD_DUE);
        let supersedes = null;
        if (raw.supersedes !== undefined && raw.supersedes !== null) {
            const target = state.items.find(item => item.id === raw.supersedes);
            if (!target || ['deleted', 'superseded'].includes(target.status)) fail(`No current note ${raw.supersedes} to replace; leave replaces out for a new note`);
            supersedes = target.id;
        }
        if (state.items.filter(item => item.status !== 'deleted').length >= MAX_ITEMS) fail('The notebook is full');
        return { op: 'add', id: 'n' + state.nextSeq, kind: raw.kind, text, due, supersedes, at: time, by, source: origin };
    }
    if (typeof raw.id !== 'string' || !ID.test(raw.id)) fail('A note id like n3 is required');
    const target = state.items.find(item => item.id === raw.id);
    if (!target || target.status === 'deleted') fail(`No note ${raw.id}`);
    if (raw.op === 'delete') {
        if (by !== 'user') fail('Only the user deletes notes');
        return { op: 'delete', id: target.id, at: time, by, source: origin };
    }
    if (raw.op === 'status') {
        if (!['active', 'done', 'cancelled'].includes(raw.status)) fail('Status must be active, done or cancelled');
        if (target.status === raw.status) fail(`Note ${raw.id} is already ${raw.status}`);
        return { op: 'status', id: target.id, status: raw.status, at: time, by, source: origin };
    }
    const change = {};
    if (raw.text !== undefined) { const text = cleanText(raw.text); if (!text) fail(`Note text must be 1-${MAX_TEXT} characters`); change.text = text; }
    if (raw.kind !== undefined) { if (!KINDS.includes(raw.kind)) fail('Unknown notebook kind'); change.kind = raw.kind; }
    if (raw.due !== undefined) { const due = validDate(raw.due); if (due === undefined) fail(BAD_DUE); change.due = due; }
    if (!Object.keys(change).length) fail('Nothing to update');
    if (Object.entries(change).every(([key, value]) => target[key] === value)) fail(`Note ${raw.id} already says that`);
    return { op: 'update', id: target.id, ...change, at: time, by, source: origin };
}

// Applies one already-normalized operation. Invalid operations (for example from a damaged
// file) are skipped by replay rather than poisoning the whole notebook.
function applyOp(state, op) {
    const next = cloneLedger(state);
    if (op.op === 'add') {
        if (op.id !== 'n' + next.nextSeq) fail('Out-of-order notebook id');
        next.nextSeq += 1;
        if (op.supersedes) {
            const old = next.items.find(item => item.id === op.supersedes);
            if (old && !['deleted', 'superseded'].includes(old.status)) { old.status = 'superseded'; old.updatedAt = op.at; }
        }
        next.items.push({ id: op.id, kind: op.kind, text: op.text, status: 'active', by: op.by, due: op.due ?? null,
            source: op.source ?? null, supersedes: op.supersedes ?? null, createdAt: op.at, updatedAt: op.at });
        return next;
    }
    const item = next.items.find(entry => entry.id === op.id);
    if (!item || item.status === 'deleted') fail(`No note ${op.id}`);
    if (op.op === 'delete') {
        item.hash = textHash(item.text); item.status = 'deleted'; item.text = ''; item.updatedAt = op.at;
        const tombstones = next.items.filter(entry => entry.status === 'deleted');
        if (tombstones.length > MAX_TOMBSTONES) {
            const drop = new Set(tombstones.sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt) || Number(a.id.slice(1)) - Number(b.id.slice(1)))
                .slice(0, tombstones.length - MAX_TOMBSTONES).map(entry => entry.id));
            next.items = next.items.filter(entry => !drop.has(entry.id));
        }
        return next;
    }
    if (op.op === 'status') { item.status = op.status; item.updatedAt = op.at; return next; }
    for (const key of ['text', 'kind', 'due']) if (op[key] !== undefined) item[key] = op[key];
    item.updatedAt = op.at;
    return next;
}

// Validates a batch against the current state and returns { ops, state }. Ids of new notes
// are assigned in order. Throws on the first invalid operation; nothing is applied then.
function prepareOps(state, rawOps, meta) {
    if (!Array.isArray(rawOps) || !rawOps.length || rawOps.length > MAX_OPS) fail('One to 64 notebook operations are required');
    let current = state;
    const ops = [];
    for (const raw of rawOps) {
        const op = normalizeOp(raw, current, meta);
        current = applyOp(current, op);
        ops.push(op);
    }
    return { ops, state: current };
}

// A stored operation read back from an entry: same rules as when it was written.
function replayOp(state, raw) {
    if (!object(raw) || !ACTORS.includes(raw.by)) return state;
    try {
        const op = normalizeOp(raw.op === 'add' ? { ...raw, id: undefined } : raw, state, { at: raw.at, by: raw.by, source: raw.source });
        if (op.op === 'add' && raw.id !== op.id) return state;
        return applyOp(state, op);
    } catch { return state; }
}

// Ledger content carried by one native entry, or null.
function entryLedger(entry) {
    if (!entry || typeof entry !== 'object') return null;
    if (entry.type === 'custom' && entry.customType === LEDGER_ENTRY && object(entry.data) && entry.data.v === 1) {
        return { snapshot: entry.data.snapshot ?? null, ops: Array.isArray(entry.data.ops) ? entry.data.ops : [] };
    }
    if (entry.type === 'compaction' && object(entry.details?.pivaneBot) && object(entry.details.pivaneBot.ledger)) {
        const ledger = entry.details.pivaneBot.ledger;
        return { ops: Array.isArray(ledger.ops) ? ledger.ops : [], snapshot: ledger.snapshot ?? null, after: true };
    }
    if (entry.type === 'message' && entry.message?.role === 'toolResult' && !entry.message.isError
        && object(entry.message.details?.pivaneLedger) && entry.message.details.pivaneLedger.v === 1) {
        return { snapshot: null, ops: Array.isArray(entry.message.details.pivaneLedger.ops) ? entry.message.details.pivaneLedger.ops : [] };
    }
    return null;
}

// A snapshot written before tombstones kept a text hash: the same tombstone (id and deletion
// time) already rebuilt by replay keeps its hash. Nothing is guessed where the text is gone.
function withHashes(snapshot, before) {
    for (const item of snapshot.items) {
        if (item.status !== 'deleted' || item.hash) continue;
        const known = before.items.find(entry => entry.id === item.id && entry.status === 'deleted' && entry.hash && entry.updatedAt === item.updatedAt);
        if (known) item.hash = known.hash;
    }
    return snapshot;
}

// Replays the notebook from a branch (root to leaf). A compaction's snapshot is the state
// after its operations, so it replaces everything before it.
function replay(branch) {
    let state = emptyLedger();
    const take = value => { const snap = readSnapshot(value); if (snap) state = withHashes(snap, state); };
    for (const entry of branch || []) {
        const ledger = entryLedger(entry);
        if (!ledger) continue;
        if (ledger.snapshot && !ledger.after) take(ledger.snapshot);
        for (const op of ledger.ops.slice(0, MAX_OPS)) state = replayOp(state, op);
        if (ledger.snapshot && ledger.after) take(ledger.snapshot);
    }
    return state;
}

const HEADINGS = Object.freeze({
    decision: 'Decided', commitment: 'Promised (who does what, by when)', open: 'Open / waiting for an answer',
    preference: 'Preferences and constraints for this chat', ref: 'Key references'
});

function shortDate(value) {
    return typeof value === 'string' ? value.slice(0, 10) : '';
}

// Model-facing rendering. Active notes in full, grouped by kind; notes closed within
// `recentDays` of `now` briefly, so the Bot does not pick up something already settled.
function renderLedger(state, { now = null, recentDays = 21, maxClosed = 30 } = {}) {
    const lines = ['Notebook of this chat (kept by the program; refer to notes by id with window_note).'];
    const active = state.items.filter(item => item.status === 'active');
    if (!active.length) lines.push('- (no open notes)');
    for (const kind of KINDS) {
        const items = active.filter(item => item.kind === kind);
        if (!items.length) continue;
        lines.push(`### ${HEADINGS[kind]}`);
        for (const item of items) {
            const extra = [item.due ? `due ${item.due}` : '', `since ${shortDate(item.createdAt)}`].filter(Boolean).join(', ');
            lines.push(`- [${item.id}] ${item.text} (${extra})`);
        }
    }
    const limit = now && Number.isFinite(Date.parse(now)) ? Date.parse(now) - recentDays * 86400000 : -Infinity;
    const closed = state.items.filter(item => ['done', 'cancelled', 'superseded'].includes(item.status) && Date.parse(item.updatedAt) >= limit)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, maxClosed);
    if (closed.length) {
        lines.push('### Recently closed (do not act on these)');
        for (const item of closed) lines.push(`- [${item.id}] ${item.status}: ${item.text} (${shortDate(item.updatedAt)})`);
    }
    return lines.join('\n');
}

// One note as it stands now, for telling the model what changed (every field it acts on).
function describeItem(item) {
    if (!item) return null;
    if (item.status === 'deleted') return `[${item.id}] deleted by the user (forget it)`;
    const due = item.due ? `due ${item.due}` : item.kind === 'commitment' ? 'no due date' : '';
    const replaces = item.supersedes ? `replaces ${item.supersedes}` : '';
    return `[${item.id}] (${[item.kind, item.status, due, replaces].filter(Boolean).join(', ')}) ${item.text}`;
}

// Whether a state survives being stored and read back (a seed or compaction snapshot).
function storable(state) {
    const read = readSnapshot(JSON.parse(JSON.stringify(state)));
    return Boolean(read) && ledgerVersion(read) === ledgerVersion(state);
}

// Short human line for a tool result or a notice to the model.
function describeOp(op, state) {
    const item = state.items.find(entry => entry.id === op.id);
    const text = item?.text || op.text || '';
    if (op.op === 'add') return `added [${op.id}] (${op.kind}): ${op.text}${op.due ? ` — due ${op.due}` : ''}${op.supersedes ? ` (replaces ${op.supersedes})` : ''}`;
    if (op.op === 'update') return `updated [${op.id}]: ${text}`;
    if (op.op === 'status') return `marked [${op.id}] ${op.status}: ${text}`;
    return `deleted [${op.id}]`;
}

// Optimistic-concurrency token of a notebook state (panel edits name the version they saw).
function ledgerVersion(state) {
    return createHash('sha256').update(JSON.stringify({ nextSeq: state.nextSeq, items: state.items })).digest('hex').slice(0, 16);
}

module.exports = {
    ledgerVersion,
    LEDGER_ENTRY, KINDS, STATUSES, MAX_TEXT, MAX_ITEMS, MAX_TOMBSTONES, MAX_QUOTE,
    sourceQuote, textHash, describeItem, storable, emptyLedger, readSnapshot, normalizeOp, applyOp, prepareOps, replay, entryLedger, renderLedger, describeOp, cloneLedger
};
