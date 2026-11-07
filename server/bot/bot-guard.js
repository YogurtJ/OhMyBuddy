'use strict';
// Bounded tool-layer policy. It recognizes literal paths and a small command subset;
// it does not sandbox shell execution, inspect program contents or replace OS isolation.
const { randomBytes } = require('node:crypto');
const { insideWorkspace, resolvePiPath, pathAccess, credentialName, privateStateName, protectedPath, privateName, fileOperation } = require('./bot-guard-paths');
const { classifyCommand, freeModeAsks, shellWords } = require('./bot-guard-shell');
const { parseRule, normalizeRule, ruleFor, matchesRule } = require('./bot-guard-rules');
const { scheduleDetail } = require('./bot-schedule');

const APPROVAL_TITLE = '允许这一步吗？ / Allow this step?';
const KINDS = Object.freeze(['command', 'delegate', 'outside', 'write', 'memory', 'action', 'schedule', 'topic']);
const PRESETS = Object.freeze(['free', 'balanced', 'ask']);
const DETAIL_LIMIT = 2000;

// Reading, looking up and answering. Tools that already ask the user themselves (setup
// cards, questions) and codemode, whose nested calls pass through this gate one by one,
// are not asked about again. Anything that writes, publishes or copies is not listed here.
const READING = new Set(['read', 'grep', 'find', 'ls', 'web_search', 'fetch_content', 'get_search_content', 'source_check',
    'read_document', 'memory_search', 'session_search', 'media_models', 'media_results',
    'media_get_capabilities', 'media_get_connection_schema', 'bg_wait']);
const SELF_ASKING = new Set(['bot_setup_propose', 'bot_topic_propose', 'ask_user_question', 'codemode', 'update_plan']);
const COMMANDS = new Set(['bash', 'powershell']);
const DELEGATES = new Set(['subagent', 'agent_thread', 'agent_message']);
const WRITES = new Set(['write', 'edit']);
const MEMORY = new Set(['memory_add', 'memory_replace', 'memory_remove']);

const text = (value, max = DETAIL_LIMIT) => {
    const out = String(value ?? '').replace(/\r\n/g, '\n').trim();
    return out.length > max ? `${out.slice(0, max)}…` : out;
};

function detailFor(kind, toolName, input) {
    if (kind === 'schedule') return text(scheduleDetail(input));
    if (kind === 'command') return text(input?.command);
    if (kind === 'outside' || kind === 'write') return text(input?.path, 500);
    if (kind === 'memory') return text(input?.content ?? input?.old_text ?? '', 500);
    if (kind === 'delegate') return text(input?.task ?? input?.message ?? input?.title ?? '', 500) || toolName;
    if (kind === 'action' && typeof input?.path === 'string' && input.path.trim()) return text(`${toolName} ${input.path}`, 500);
    return toolName;
}

// Returns null (proceed), { kind, detail, rule? } (ask), or { block, reason }
// (refuse before opening UI). Unknown presets and unreadable permissions use 'ask'.
function approvalFor({ permissions, preset = permissions?.preset, toolName, input, cwd, agentDir, annotations }) {
    if (!PRESETS.includes(preset)) { preset = 'ask'; permissions = undefined; }
    if (typeof toolName !== 'string') return { block: true, reason: BLOCKED.protected };
    // Hands-off ('free') is unrestricted like the workspace Pi Agent: no tool-layer gate.
    if (preset === 'free') return null;
    const ask = (kind, remember = false) => {
        const rule = remember ? ruleFor({ toolName, input, cwd, agentDir }) : null;
        if (matchesRule(permissions?.rules, rule, agentDir)) return null;
        return { kind, detail: detailFor(kind, toolName, input), ...(rule ? { rule } : {}) };
    };
    // Reading tools check path access: credentials ask once in Careful ('balanced') and are refused
    // in Ask-every-time ('ask'); OhMyBuddy/Pi state paths run in Careful and ask once in Ask-every-time.
    const fileRead = ['read', 'grep', 'find', 'ls'].includes(toolName);
    if (!WRITES.has(toolName) && (fileRead || typeof input?.path === 'string')) {
        const access = pathAccess(input?.path ?? (toolName === 'read' ? null : cwd), cwd, agentDir);
        const selectors = fileRead ? [input?.glob, input?.pattern].filter(value => typeof value === 'string') : [];
        if (access === 'invalid') return { block: true, reason: BLOCKED.protected };
        if (access === 'credential' || selectors.some(credentialName))
            return preset === 'balanced' ? ask('action') : { block: true, reason: BLOCKED.protected };
        if ((access === 'state' || selectors.some(privateStateName)) && preset !== 'balanced')
            return ask('action');
    }
    if (SELF_ASKING.has(toolName)) return null;
    // A check-in the Bot sets for itself is one message, governed by the user's proactive settings
    // (on/off, quiet hours, daily limit) and cancellable in settings, so it does not ask each time.
    if (toolName === 'bot_schedule') return preset === 'balanced' || input?.action === 'list' || input?.action === 'create' && input?.proactive === true ? null : ask('schedule');
    if (COMMANDS.has(toolName)) {
        const command = classifyCommand({ toolName, input, cwd, agentDir });
        if (command.status === 'blocked') return { block: true, reason: BLOCKED.protected };
        if (command.status === 'credential') return preset === 'balanced' ? ask('command') : { block: true, reason: BLOCKED.protected };
        // Careful ('balanced') runs ordinary commands and state paths directly; only the short list of dangerous commands asks.
        if (preset === 'balanced') return freeModeAsks({ toolName, input }) || annotations?.destructiveHint === true ? ask('command') : null;
        if (command.status === 'state') return ask('command');
        return ask('command', command.status === 'safe' && annotations?.destructiveHint !== true);
    }
    if (DELEGATES.has(toolName)) return preset === 'balanced' ? null : ask('delegate');
    if (WRITES.has(toolName)) {
        const operation = fileOperation({ input, cwd, agentDir });
        if (operation.status === 'blocked') return { block: true, reason: BLOCKED.protected };
        const outside = !insideWorkspace(cwd, input?.path);
        const kind = outside ? 'outside' : 'write';
        if (operation.status === 'credential') return preset === 'balanced' ? ask(kind) : { block: true, reason: BLOCKED.protected };
        // Careful ('balanced') asks only for credentials, OhMyBuddy's own runtime, autostart/scheduler locations and directories.
        if (preset === 'balanced') return operation.critical || annotations?.destructiveHint === true ? ask(kind) : null;
        if (operation.status === 'state' || operation.status === 'risk' || annotations?.destructiveHint === true) return ask(kind);
        return outside ? ask('outside', true) : ask('write', true);
    }
    if (annotations?.destructiveHint === true) return ask('action');
    if (preset !== 'ask') return null;
    if (READING.has(toolName) || annotations?.readOnlyHint === true) return null;
    return ask(MEMORY.has(toolName) ? 'memory' : 'action');
}

// The optional rule header is machine-readable; older no-rule envelopes remain valid.
const newToken = () => randomBytes(8).toString('hex');
function approvalMessage({ kind, detail, token, rule }) {
    const parsed = parseRule(rule);
    return `${kind} #${token}\n${parsed ? `rule ${JSON.stringify(parsed)}\n` : ''}\n${detail}`;
}
function parseApprovalMessage(message) {
    const match = /^([a-z]+) #([a-f0-9]{16})\n(?:rule ([^\n]+)\n)?\n([\s\S]*)$/.exec(typeof message === 'string' ? message : '');
    if (!match || !KINDS.includes(match[1])) return null;
    let rule;
    if (match[3] !== undefined) {
        try { rule = parseRule(JSON.parse(match[3])); } catch { return null; }
        if (!rule) return null;
    }
    return { kind: match[1], token: match[2], detail: match[4], ...(rule ? { rule } : {}) };
}

// A native confirm answers false both when the user declines and when nobody answers in time.
const BLOCKED = Object.freeze({
    protected: 'This step could access credentials or private application state, or its file identity could not be verified. It did not run. Do not retry or work around this restriction; use the supported settings or memory tools instead.',
    not_approved: 'The user did not approve this step (declined, or no answer in time), so it did not run. Do not try it again or work around it; say briefly what you could do instead, or ask what they prefer.',
    unattended: 'This step needs the user\'s approval in the current mode, and nobody can approve it right now (scheduled or unattended run). It did not run. Tell the user what you would like to do so they can approve it later.'
});

module.exports = { APPROVAL_TITLE, KINDS, PRESETS, BLOCKED, approvalFor, approvalMessage, parseApprovalMessage, newToken, insideWorkspace, resolvePiPath, parseRule, normalizeRule, ruleFor, classifyCommand, shellWords };
