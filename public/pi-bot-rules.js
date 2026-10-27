// Narrow "always allow" grants of one Bot (bot.permissions.rules). A grant names one tool and
// one exact command (in one working directory) or one exact file; the server decides what is
// rememberable and matches grants in the Bot's tool gate. This module only reads and shows
// them: it never widens a grant, and rules it does not understand are kept as they are.
(() => {
    const translateUi = globalThis.PiI18n?.t || ((text, ...values) => text.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? `{${index}}`));
    const TOOLS = Object.freeze(['bash', 'powershell', 'write', 'edit']);
    // Same bounds as the server's permissions section (server/bot/bot-settings.js).
    const MAX_RULES = 200, MAX_RULE_BYTES = 2048;
    const KEYS = 'cwd,id,tool,v,value';
    const isCommand = rule => rule.tool === 'bash' || rule.tool === 'powershell';
    const CONTROL = /[\x00-\x1f\x7f]/;
    // An absolute path as the server writes it (POSIX, drive letter or UNC).
    const absolute = value => /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(value);
    const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;

    // A version-1 grant this page understands exactly (the server's structural check in
    // bot-guard-rules.js); anything else is shown as "other" and kept as it is.
    function valid(rule) {
        if (rule === null || typeof rule !== 'object' || Array.isArray(rule) || Object.keys(rule).sort().join(',') !== KEYS) return false;
        if (rule.v !== 1 || typeof rule.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(rule.id) || !TOOLS.includes(rule.tool)) return false;
        if (typeof rule.value !== 'string' || !rule.value.trim() || typeof rule.cwd !== 'string' || !absolute(rule.cwd)
            || CONTROL.test(rule.value + rule.cwd) || bytes(rule) > MAX_RULE_BYTES) return false;
        return isCommand(rule) || absolute(rule.value) && !/[*?[\]{}]/.test(rule.value);
    }

    // The optional "rule <JSON>" line of an approval request; null unless it is a valid grant.
    function parse(json) {
        if (typeof json !== 'string' || json.length > MAX_RULE_BYTES * 2) return null;
        try { const rule = JSON.parse(json); return valid(rule) ? Object.freeze({ ...rule }) : null; } catch { return null; }
    }

    // Commands are remembered from command requests, files from write requests; nothing else.
    const fits = (kind, rule) => Boolean(rule) && (kind === 'command' ? ['bash', 'powershell'].includes(rule.tool)
        : ['write', 'outside'].includes(kind) && ['write', 'edit'].includes(rule.tool));
    // The same grant: one tool, one exact value, one place.
    const same = (a, b) => valid(a) && valid(b) && a.tool === b.tool && a.value === b.value && a.cwd === b.cwd;

    const LABELS = {
        bash: () => translateUi("运行这条命令"), powershell: () => translateUi("运行这条 PowerShell 命令"),
        write: () => translateUi("写入这个文件"), edit: () => translateUi("修改这个文件")
    };
    const label = rule => LABELS[rule.tool]();
    // Where a command runs; files are named by their full path already.
    const place = rule => isCommand(rule) ? translateUi("在 {0} 中", rule.cwd) : '';
    // What "always allow" covers, in one sentence.
    const scope = (rule, name) => isCommand(rule)
        ? translateUi("以后 {0} 在同一个目录里运行完全相同的这条命令时，不再问你；命令有任何不同都照常询问。", name)
        : translateUi("以后 {0} {1}时不再问你；其他文件照常询问。", name, rule.tool === 'edit' ? translateUi("修改这个文件") : translateUi("写入这个文件"));

    globalThis.PiBotRules = Object.freeze({ TOOLS, MAX_RULES, valid, parse, fits, same, isCommand, label, place, scope });
})();
