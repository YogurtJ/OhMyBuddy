'use strict';
// Recall across the generations of one Bot window (D-031): window_recall searches the raw
// messages of every generation, window_read shows the messages around one entry. Earlier
// generations are read only, from their own verified file descriptor (same directory as the
// current generation, same file identity as the path, native window marker of this window),
// within byte, count and time budgets; results say which generations were covered.
// Pi's session parsing is passed in by the worker extension (this module stays CommonJS).
const fs = require('node:fs');
const { nativeInputIndex, nativeMessage, channelSource } = require('../pi-native-input');
const path = require('node:path');
const io = require('../pi-file-io');
const { descriptorPathSync } = require('../pi-file-descriptor');
const { readWindowRecord } = require('./bot-window-registry');
const { readWindowBinding } = require('./bot-window-state');

const LIMITS = Object.freeze({ fileBytes: 64 * 1024 * 1024, totalBytes: 256 * 1024 * 1024, generations: 80, ms: 4000 });
const EXCERPT = 160;
const MAX_READ_CHARS = 16000;

function textOf(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n');
}

// Full native identity of a file as stat reports it (BigInt, so nothing is rounded).
const stampOf = stat => [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');

// Reads a session file through one descriptor, the way session files are read elsewhere:
// a regular file (not a link) in the expected directory, opened without following links and
// without blocking, whose kernel path (Linux /proc, macOS F_GETPATH, Windows HANDLE) and full
// identity match the path before and after the read.
function readVerified(file, directory, maxBytes) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || path.dirname(file) !== directory)
        throw new Error('Generation file is outside this chat');
    const changed = () => new Error('Generation file changed');
    const listed = fs.lstatSync(file, { bigint: true });
    if (!listed.isFile() || listed.isSymbolicLink() || fs.realpathSync.native(file) !== file) throw new Error('Generation file is outside this chat');
    if (listed.size > BigInt(maxBytes)) throw new Error('Generation file is too large to search');
    const fd = io.openReadSync(file);
    let offset = 0;
    try {
        const opened = fs.fstatSync(fd, { bigint: true }), identity = io.identity(fd);
        if (!opened.isFile() || stampOf(opened) !== stampOf(listed) || descriptorPathSync(fd) !== file || !io.sameIdentityAtPath(file, identity)) throw changed();
        const size = Number(opened.size), buffer = Buffer.alloc(size);
        while (offset < size) {
            const read = fs.readSync(fd, buffer, offset, size - offset, offset);
            if (!read) break;
            offset += read;
        }
        if (offset !== size || stampOf(fs.fstatSync(fd, { bigint: true })) !== stampOf(opened)
            || stampOf(fs.lstatSync(file, { bigint: true })) !== stampOf(opened) || descriptorPathSync(fd) !== file
            || !io.sameIdentityAtPath(file, identity) || fs.realpathSync.native(file) !== file) throw changed();
        return buffer.toString('utf8');
    } catch (error) {
        // Whatever ends the read after data came in, the bytes read are reported (recall's budget).
        if (offset && error && typeof error === 'object') error.bytesRead = offset;
        throw error;
    } finally { try { fs.closeSync(fd); } catch { /* read-only descriptor */ } }
}

// The window's generations, newest first, each with the branch entries of a verified file.
// current: { manager } for the live generation. pi: { SessionManager, parseSessionEntries }.
function windowGenerations({ agentDir, context, current, pi, only = null, now = Date.now, limits = LIMITS }) {
    const window = readWindowRecord(agentDir, context.profileId, context.windowId);
    if (!window?.current || window.current.sessionId !== current.getSessionId()) throw new Error('This chat changed; try again');
    const directory = path.dirname(fs.realpathSync.native(current.getSessionFile()));
    const list = [...window.generations].sort((a, b) => b.generation - a.generation)
        .filter(item => only === null || item.generation === only);
    const started = now(), result = [], skipped = [];
    let bytes = 0;
    for (const item of list.slice(0, limits.generations)) {
        if (item.generation === window.current.generation) {
            result.push({ generation: item.generation, sessionId: item.sessionId, branch: current.getBranch() });
            continue;
        }
        // Each file is read within what is left of the total, so the total is never exceeded.
        const remaining = limits.totalBytes - bytes;
        if (now() - started > limits.ms || remaining <= 0) { skipped.push(item.generation); continue; }
        try {
            const text = readVerified(item.sessionPath, directory, Math.min(limits.fileBytes, remaining));
            bytes += Buffer.byteLength(text);
            const manager = pi.SessionManager.inMemory(context.cwd, undefined, pi.parseSessionEntries(text));
            const binding = readWindowBinding(manager);
            if (manager.getSessionId() !== item.sessionId || binding?.windowId !== context.windowId || binding.profileId !== context.profileId
                || binding.generation !== item.generation) throw new Error('marker');
            result.push({ generation: item.generation, sessionId: item.sessionId, branch: manager.getBranch() });
        } catch (error) {
            // What was read counts against the total even when the file is then refused.
            if (Number.isSafeInteger(error?.bytesRead)) bytes += error.bytesRead;
            skipped.push(item.generation);
        }
    }
    for (const item of list.slice(limits.generations)) skipped.push(item.generation);
    return { generations: result, skipped: skipped.sort((a, b) => a - b), total: window.generations.length, bytes };
}

function messagesOf(generation) {
    const rows = [], inputs = nativeInputIndex(generation.branch, generation.sessionId);
    for (const entry of generation.branch) {
        const message = nativeMessage(entry, inputs), role = message?.role;
        if (role !== 'user' && role !== 'assistant' && role !== 'toolResult') continue;
        const text = textOf(message.content).trim();
        if (!text) continue;
        rows.push({ generation: generation.generation, entry, role, tool: role === 'toolResult' ? message.toolName : null, text, ...channelSource(inputs.channels.get(entry.id)) });
    }
    return rows;
}

const SPLIT = /[\s,，。.!！?？;；:：、"“”'‘’()（）[\]【】<>《》/\\|]+/u;
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/u;

function queryTerms(query) {
    const folded = String(query ?? '').normalize('NFKC').toLowerCase().trim();
    const words = folded.split(SPLIT).filter(Boolean);
    const terms = new Map();
    for (const word of words) {
        terms.set(word, Math.min(word.length, 12) * 2);
        if (CJK.test(word) && word.length > 2) for (let index = 0; index + 2 <= word.length; index++) {
            const pair = word.slice(index, index + 2);
            if (!terms.has(pair)) terms.set(pair, 1);
        }
    }
    return { folded, terms };
}

function score(text, { folded, terms }) {
    const haystack = text.normalize('NFKC').toLowerCase();
    let total = 0, first = -1;
    for (const [term, weight] of terms) {
        const at = haystack.indexOf(term);
        if (at < 0) continue;
        total += weight;
        if (weight > 1 && (first < 0 || at < first)) first = at;
        if (first < 0) first = at;
    }
    if (folded.length > 1 && haystack.includes(folded)) total += 10;
    return { total, first };
}

function excerpt(text, at) {
    const start = Math.max(0, at - EXCERPT), end = Math.min(text.length, at + EXCERPT);
    return (start ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
}

// The message's own time (what was said when), else when the entry was written.
function stamp(entry) {
    const own = entry?.message?.timestamp, time = Number.isFinite(own) ? own : Date.parse(entry?.timestamp);
    return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
}

function coverage({ generations, skipped, total }) {
    const searched = generations.map(item => item.generation).sort((a, b) => a - b);
    return { searched, skipped, total, complete: skipped.length === 0 && searched.length === total };
}

function coverageLine(cover) {
    const range = cover.searched.length ? `${cover.searched.length} of ${cover.total} parts of this chat` : 'no part of this chat';
    return cover.complete ? `Searched all ${cover.total} part(s) of this chat.` : `Searched ${range}; not searched: ${cover.skipped.join(', ') || 'none'}.`;
}

// window_recall: the best matching messages across generations, newest first among equals.
function recall(found, query, { limit = 6 } = {}) {
    const terms = queryTerms(query);
    if (!terms.terms.size) throw new Error('Search words are required');
    const rows = [];
    for (const generation of found.generations) for (const row of messagesOf(generation)) {
        const { total, first } = score(row.text, terms);
        if (total <= 0) continue;
        rows.push({ ...row, score: row.role === 'toolResult' ? total * 0.6 : total, first });
    }
    const best = rows.reduce((max, row) => Math.max(max, row.score), 0);
    const kept = rows.filter(row => row.score >= Math.max(2, best * 0.35))
        .sort((a, b) => b.score - a.score || b.generation - a.generation || String(b.entry.timestamp).localeCompare(String(a.entry.timestamp)))
        .slice(0, Math.max(1, Math.min(12, limit)));
    const cover = coverage(found);
    const lines = [coverageLine(cover)];
    if (!kept.length) lines.push('No matching messages.');
    kept.forEach((row, index) => lines.push(`${index + 1}. [part ${row.generation} · entry ${row.entry.id.slice(0, 8)} · ${stamp(row.entry)} · ${row.tool ? `tool ${row.tool}` : row.role}] ${excerpt(row.text, Math.max(0, row.first))}`));
    if (kept.length) lines.push('Use window_read with the part and entry to see the full messages around a result.');
    return { text: lines.join('\n'), details: { pivaneRecall: { query: String(query).slice(0, 200), coverage: cover,
        results: kept.map(row => ({ generation: row.generation, entryId: row.entry.id, role: row.role, at: row.entry.timestamp ?? null, ...channelSource(row.channel === 'weixin' ? row : null) })) } } };
}

// window_read: messages around one entry (8+ characters of its id), verbatim within a budget.
function readAround(found, { entry, before = 3, after = 3 }) {
    const prefix = String(entry ?? '').replace(/^e:/, '').toLowerCase();
    if (prefix.length < 8) throw new Error('An entry id of at least 8 characters is required');
    for (const generation of found.generations) {
        const rows = messagesOf(generation);
        const index = rows.findIndex(row => row.entry.id.toLowerCase().startsWith(prefix));
        if (index < 0) continue;
        const slice = rows.slice(Math.max(0, index - Math.min(10, before)), index + 1 + Math.min(10, after));
        let used = 0;
        const lines = [`Part ${generation.generation} of this chat, around entry ${prefix.slice(0, 8)}:`];
        for (const row of slice) {
            const room = MAX_READ_CHARS - used;
            if (room <= 200) { lines.push('…(more messages not shown)'); break; }
            const body = row.text.length > Math.min(room, 6000) ? row.text.slice(0, Math.min(room, 6000)) + `…[+${row.text.length - Math.min(room, 6000)} chars]` : row.text;
            used += body.length;
            lines.push(`[entry ${row.entry.id.slice(0, 8)} · ${stamp(row.entry)} · ${row.tool ? `tool ${row.tool}` : row.role}${row === rows[index] ? ' · this one' : ''}]\n${body}`);
        }
        return { text: lines.join('\n\n'), details: { pivaneRecall: { read: { generation: generation.generation, entryId: rows[index].entry.id, role: rows[index].role, ...channelSource(rows[index].channel === 'weixin' ? rows[index] : null) } } } };
    }
    const cover = coverage(found);
    throw new Error(`No message with entry ${prefix.slice(0, 8)} found. ${coverageLine(cover)}`);
}

module.exports = { LIMITS, readVerified, windowGenerations, queryTerms, score, recall, readAround };
