'use strict';
// Tool-level approval for the careful presets (DESIGN §3.5, minimal M1.1 form of bot-guard).
// "Careful" asks before any command, any hand-off to another agent and any file write
// outside the Bot's workspace; "Ask every time" asks before everything except reading.
// "Hands-off" stays prompt guidance here; classifying dangerous commands is M3 work.
// The worker asks with one native confirm whose title is fixed, so the Bot page can show
// it as an inline card; the message stays readable in the generic dialog elsewhere.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const APPROVAL_TITLE = '允许这一步吗？ / Allow this step?';
const KINDS = Object.freeze(['command', 'delegate', 'outside', 'write', 'memory', 'action']);
const DETAIL_LIMIT = 2000;

// Reading, looking up and answering. Tools that already ask the user themselves
// (setup cards, questions) and tools whose nested calls pass through this gate
// individually (codemode) are not asked about again.
const READING = new Set(['read', 'grep', 'find', 'ls', 'web_search', 'fetch_content', 'get_search_content', 'source_check',
    'read_document', 'get_attachment', 'memory_search', 'session_search', 'media_models', 'media_results',
    'media_get_capabilities', 'media_get_connection_schema', 'bg_wait']);
const SELF_ASKING = new Set(['bot_setup_propose', 'ask_user_question', 'codemode', 'update_plan', 'deliver_files']);
const COMMANDS = new Set(['bash']);
const DELEGATES = new Set(['subagent', 'agent_thread', 'agent_message']);
const WRITES = new Set(['write', 'edit']);
const MEMORY = new Set(['memory_add', 'memory_replace', 'memory_remove']);

const text = (value, max = DETAIL_LIMIT) => {
    const out = String(value ?? '').replace(/\r\n/g, '\n').trim();
    return out.length > max ? `${out.slice(0, max)}…` : out;
};

// Mirrors Pi's own path resolution for write/edit: an "@" prefix is dropped and "~"
// means the home folder. The deepest existing ancestor is resolved through symlinks.
function resolveTarget(cwd, raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    let value = raw.trim().replace(/^@/, '');
    if (value === '~') value = os.homedir();
    else if (value.startsWith('~/')) value = path.join(os.homedir(), value.slice(2));
    // Lexical resolution first, as Pi does before touching the file system.
    let current = path.resolve(cwd, value);
    const tail = [];
    for (;;) {
        try { return path.join(fs.realpathSync.native(current), ...tail); } catch {}
        const parent = path.dirname(current);
        if (parent === current) return null;
        tail.unshift(path.basename(current));
        current = parent;
    }
}

function insideWorkspace(cwd, raw) {
    let root;
    try { root = fs.realpathSync.native(cwd); } catch { return false; }
    const target = resolveTarget(root, raw);
    return Boolean(target) && (target === root || target.startsWith(root.endsWith(path.sep) ? root : root + path.sep));
}

function detailFor(kind, toolName, input) {
    if (kind === 'command') return text(input?.command);
    if (kind === 'outside' || kind === 'write') return text(input?.path, 500);
    if (kind === 'memory') return text(input?.content ?? input?.old_text ?? '', 500);
    if (kind === 'delegate') return text(input?.task ?? input?.message ?? input?.title ?? '', 500) || toolName;
    return toolName;
}

// Returns { kind, detail } when this call needs the user's approval under the preset,
// or null. Unknown presets fall back to hands-off, like the prompt guidance.
function approvalFor({ preset, toolName, input, cwd, annotations }) {
    if (preset !== 'balanced' && preset !== 'ask') return null;
    if (typeof toolName !== 'string' || SELF_ASKING.has(toolName)) return null;
    const ask = kind => ({ kind, detail: detailFor(kind, toolName, input) });
    if (COMMANDS.has(toolName)) return ask('command');
    if (DELEGATES.has(toolName)) return ask('delegate');
    if (WRITES.has(toolName)) {
        if (!insideWorkspace(cwd, input?.path)) return ask('outside');
        return preset === 'ask' ? ask('write') : null;
    }
    if (preset === 'balanced') return annotations?.destructiveHint === true ? ask('action') : null;
    if (READING.has(toolName) || annotations?.readOnlyHint === true) return null;
    return ask(MEMORY.has(toolName) ? 'memory' : 'action');
}

// The confirm message: the kind on the first line, then the detail. The Bot page reads
// both; the generic dialog shows them as they are.
const approvalMessage = ({ kind, detail }) => `${kind}\n\n${detail}`;
function parseApprovalMessage(message) {
    const match = /^([a-z]+)\n\n([\s\S]*)$/.exec(typeof message === 'string' ? message : '');
    return match && KINDS.includes(match[1]) ? { kind: match[1], detail: match[2] } : null;
}

// A native confirm answers false both when the user declines and when nobody answers in time.
const BLOCKED = Object.freeze({
    not_approved: 'The user did not approve this step (declined, or no answer in time), so it did not run. Do not try it again or work around it; say briefly what you could do instead, or ask what they prefer.',
    unattended: 'This step needs the user\'s approval in the current mode, and nobody can approve it right now (scheduled or unattended run). It did not run. Tell the user what you would like to do so they can approve it later.'
});

module.exports = { APPROVAL_TITLE, KINDS, BLOCKED, approvalFor, approvalMessage, parseApprovalMessage, insideWorkspace };
