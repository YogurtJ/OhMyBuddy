'use strict';
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { fileOperation } = require('./bot-guard-paths');
const { classifyCommand } = require('./bot-guard-shell');
const defaultAgentDir = () => process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent');
const RULE_TOOLS = Object.freeze(['bash', 'powershell', 'write', 'edit']);
const RULE_KEYS = ['v', 'id', 'tool', 'value', 'cwd'];
const MAX_RULE_BYTES = 2048;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = () => { throw Object.assign(new Error('Invalid bot permission rule'), { status: 400 }); };

// Structural parsing is independent of filesystem availability, for approval envelopes.
// Unknown stored objects are not grants; callers preserve them as opaque profile data.
function parseRule(rule) {
    if (!object(rule) || Object.keys(rule).length !== RULE_KEYS.length || Object.keys(rule).some(key => !RULE_KEYS.includes(key))
        || rule.v !== 1 || typeof rule.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(rule.id)
        || !RULE_TOOLS.includes(rule.tool) || typeof rule.value !== 'string' || !rule.value.trim()
        || typeof rule.cwd !== 'string' || !path.isAbsolute(rule.cwd) || path.resolve(rule.cwd) !== rule.cwd
        || /[\x00-\x1f\x7f]/.test(rule.value + rule.cwd) || Buffer.byteLength(JSON.stringify(rule)) > MAX_RULE_BYTES) return null;
    if (['write', 'edit'].includes(rule.tool) && (!path.isAbsolute(rule.value) || path.resolve(rule.value) !== rule.value || /[*?\[\]{}]/.test(rule.value))) return null;
    return { v: 1, id: rule.id, tool: rule.tool, value: rule.value, cwd: rule.cwd };
}

// New owner-written grants must describe one understood, non-dangerous operation.
// Runtime checks also receive agentDir, so a saved grant never overrides private state.
function normalizeRule(rule, agentDir = defaultAgentDir()) {
    const parsed = parseRule(rule);
    if (!parsed) return invalid();
    let cwd;
    try { cwd = fs.realpathSync.native(parsed.cwd); if (!fs.statSync(cwd).isDirectory()) return invalid(); } catch { return invalid(); }
    if (['bash', 'powershell'].includes(parsed.tool)) {
        if (classifyCommand({ toolName: parsed.tool, input: { command: parsed.value }, cwd, agentDir }).status !== 'safe') return invalid();
        return { ...parsed, cwd };
    }
    const operation = fileOperation({ input: { path: parsed.value }, cwd, agentDir });
    if (operation.status !== 'safe') return invalid();
    return { ...parsed, cwd, value: operation.value };
}

function ruleFor({ toolName, input, cwd, agentDir }) {
    if (!RULE_TOOLS.includes(toolName)) return null;
    try {
        const root = fs.realpathSync.native(cwd);
        const command = ['bash', 'powershell'].includes(toolName);
        const operation = command ? classifyCommand({ toolName, input, cwd: root, agentDir }) : fileOperation({ input, cwd: root, agentDir });
        if (operation.status !== 'safe') return null;
        const rule = { v: 1, id: randomBytes(12).toString('hex'), tool: toolName, value: command ? input.command : operation.value, cwd: root };
        return parseRule(rule);
    } catch { return null; }
}
function matchesRule(rules, candidate, agentDir = defaultAgentDir()) {
    if (!candidate || !Array.isArray(rules)) return false;
    return rules.some(rule => {
        try {
            // Only a matching structural rule needs filesystem validation. Never
            // reinterpret a stored symlink or a malformed/future rule as a grant.
            if (!parseRule(rule) || rule.tool !== candidate.tool || rule.value !== candidate.value || rule.cwd !== candidate.cwd) return false;
            return isDeepStrictEqual(rule, normalizeRule(rule, agentDir));
        } catch { return false; }
    });
}
module.exports = { RULE_TOOLS, MAX_RULE_BYTES, parseRule, normalizeRule, ruleFor, matchesRule };
