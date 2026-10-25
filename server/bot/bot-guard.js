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
const { fileURLToPath } = require('node:url');
const { randomBytes } = require('node:crypto');

const APPROVAL_TITLE = '允许这一步吗？ / Allow this step?';
const KINDS = Object.freeze(['command', 'delegate', 'outside', 'write', 'memory', 'action']);
const PRESETS = Object.freeze(['free', 'balanced', 'ask']);
const DETAIL_LIMIT = 2000;

// Reading, looking up and answering. Tools that already ask the user themselves (setup
// cards, questions) and codemode, whose nested calls pass through this gate one by one,
// are not asked about again. Anything that writes, publishes or copies is not listed here.
const READING = new Set(['read', 'grep', 'find', 'ls', 'web_search', 'fetch_content', 'get_search_content', 'source_check',
    'read_document', 'memory_search', 'session_search', 'media_models', 'media_results',
    'media_get_capabilities', 'media_get_connection_schema', 'bg_wait']);
const SELF_ASKING = new Set(['bot_setup_propose', 'ask_user_question', 'codemode', 'update_plan']);
const COMMANDS = new Set(['bash', 'powershell']);
const DELEGATES = new Set(['subagent', 'agent_thread', 'agent_message']);
const WRITES = new Set(['write', 'edit']);
const MEMORY = new Set(['memory_add', 'memory_replace', 'memory_remove']);

const text = (value, max = DETAIL_LIMIT) => {
    const out = String(value ?? '').replace(/\r\n/g, '\n').trim();
    return out.length > max ? `${out.slice(0, max)}…` : out;
};

// Pi 1.4's resolveToCwd (dist/utils/paths.js normalizePath + resolvePath with
// normalizeUnicodeSpaces and stripAtPrefix), which the native write and edit tools use.
// Mirrored because Pi does not export it; test/pi-bot-guard.test.js compares the two.
const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
function windowsShellPath(value) {
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return value;
    const match = value.match(/^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i);
    if (!match) return value;
    const suffix = match[2]?.replaceAll('/', '\\');
    return `${match[1].toUpperCase()}:\\${suffix ?? ''}`;
}
function normalizePiPath(input, { spaces = false, at = false } = {}) {
    let value = input;
    if (spaces) value = value.replace(UNICODE_SPACES, ' ');
    if (at && value.startsWith('@')) value = value.slice(1);
    if (process.platform === 'win32') value = windowsShellPath(value);
    const home = os.homedir();
    if (value === '~') return home;
    if (value.startsWith('~/') || (process.platform === 'win32' && value.startsWith('~\\'))) return path.join(home, value.slice(2));
    if (/^file:\/\//.test(value)) return fileURLToPath(value);
    return value;
}
function resolvePiPath(input, cwd) {
    const value = normalizePiPath(input, { spaces: true, at: true });
    return path.isAbsolute(value) ? path.resolve(value) : path.resolve(normalizePiPath(cwd), value);
}

// The real location a write would reach. Missing trailing components are kept as they are;
// an existing entry that cannot be resolved (a dangling or looping symlink, no permission)
// or an existing file with other hard links is unknown, which counts as outside.
function canonicalTarget(target) {
    let current = target;
    const tail = [];
    for (;;) {
        let stat = null;
        try { stat = fs.lstatSync(current); } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') return null; }
        if (stat) {
            try {
                const real = fs.realpathSync.native(current);
                if (!tail.length && fs.statSync(real).isFile() && fs.statSync(real).nlink > 1) return null;
                return path.join(real, ...tail);
            } catch { return null; }
        }
        const parent = path.dirname(current);
        if (parent === current) return null;
        tail.unshift(path.basename(current));
        current = parent;
    }
}

function insideWorkspace(cwd, raw) {
    if (typeof raw !== 'string') return false;
    let root, target;
    try { root = fs.realpathSync.native(cwd); target = canonicalTarget(resolvePiPath(raw, cwd)); } catch { return false; }
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
// or null. Unknown presets fall back to hands-off, like the prompt guidance; the worker
// passes 'ask' when it cannot read the preset at all.
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

// The confirm message: "<kind> #<token>" on the first line, then the detail. The token
// lets the worker retire a request the user can no longer answer usefully (a cancelled
// nested call); the Bot page reads kind and detail, the generic dialog shows them as is.
const newToken = () => randomBytes(8).toString('hex');
const approvalMessage = ({ kind, detail, token }) => `${kind} #${token}\n\n${detail}`;
function parseApprovalMessage(message) {
    const match = /^([a-z]+) #([a-f0-9]{16})\n\n([\s\S]*)$/.exec(typeof message === 'string' ? message : '');
    return match && KINDS.includes(match[1]) ? { kind: match[1], token: match[2], detail: match[3] } : null;
}

// A native confirm answers false both when the user declines and when nobody answers in time.
const BLOCKED = Object.freeze({
    not_approved: 'The user did not approve this step (declined, or no answer in time), so it did not run. Do not try it again or work around it; say briefly what you could do instead, or ask what they prefer.',
    unattended: 'This step needs the user\'s approval in the current mode, and nobody can approve it right now (scheduled or unattended run). It did not run. Tell the user what you would like to do so they can approve it later.'
});

module.exports = { APPROVAL_TITLE, KINDS, PRESETS, BLOCKED, approvalFor, approvalMessage, parseApprovalMessage, newToken, insideWorkspace, resolvePiPath };
