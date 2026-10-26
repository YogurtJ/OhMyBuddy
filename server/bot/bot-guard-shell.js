'use strict';
const path = require('node:path');
const { privateName, protectedPath, insideWorkspace, systemPath, canonicalTarget, resolveShellPath, resolvePowerShellPath } = require('./bot-guard-paths');

// A small literal-command recognizer, not a shell interpreter. Shell expansion, control
// syntax, wrappers and executable scripts require one-time approval and cannot be saved.
function shellWords(command, tool = 'bash') {
    const words = [];
    let word = '', active = false, quote = '', opaque = false;
    const flush = () => { if (active) words.push(word); word = ''; active = false; };
    for (let i = 0; i < command.length; i++) {
        const ch = command[i];
        if (quote) {
            if (ch === quote) {
                if (tool === 'powershell' && command[i + 1] === quote) { word += quote; i++; continue; }
                quote = ''; continue;
            }
            if (quote === '"' && /[$`]/.test(ch)) opaque = true;
            if (ch === '\\' && tool === 'bash' && quote === '"' && /["\\$`\n]/.test(command[i + 1] ?? '')) {
                if (command[i + 1] === '\n') { opaque = true; i++; continue; }
                word += command[++i]; continue;
            }
            word += ch; continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; active = true; continue; }
        if (ch === '\\' && tool === 'bash') {
            if (i + 1 >= command.length) { opaque = true; continue; }
            if (command[i + 1] === '\n') { opaque = true; i++; continue; }
            word += command[++i]; active = true; continue;
        }
        if (/\s/.test(ch)) { if (ch !== ' ' && ch !== '\t') opaque = true; flush(); continue; }
        if (/[;&|<>(){}]/.test(ch)) { opaque = true; flush(); continue; }
        if (/[$`*?\[\]#!~]/.test(ch) || tool === 'powershell' && /[@,]/.test(ch)) opaque = true;
        word += ch; active = true;
    }
    flush();
    return { words, opaque: opaque || Boolean(quote) };
}
const DANGEROUS = new Set(('sudo doas su runas rm rmdir unlink shred truncate dd mkfs mount umount chmod chown chgrp setfacl '
    + 'kill killall pkill reboot shutdown halt poweroff systemctl service launchctl sc net reg crontab at '
    + 'apt apt-get dpkg yum dnf rpm pacman brew snap pip pip3 npm npx yarn pnpm docker podman kubectl helm '
    + 'curl wget ssh scp sftp rsync nc ncat netcat telnet ftp sendmail mail mailx mutt gh glab '
    + 'cp mv install tee sed perl awk '
    + 'remove-item clear-content set-content add-content out-file move-item copy-item rename-item '
    + 'start-process stop-process stop-service restart-service start-service set-service invoke-webrequest invoke-restmethod '
    + 'set-executionpolicy set-itemproperty new-service unregister-scheduledtask').split(' '));
const CREDENTIAL_COMMANDS = new Set(['printenv', 'env', 'set', 'export', 'pass', 'secret-tool', 'get-credential', 'get-secret', 'get-childitem-env']);
const READ_COMMANDS = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'stat', 'file', 'realpath', 'readlink']);
const PS_READ = new Set(['get-content', 'get-childitem', 'get-item', 'test-path', 'resolve-path']);
const SAFE_GIT = new Set(['status', 'diff', 'log', 'show', 'ls-files', 'rev-parse', 'branch']);

function commandName(value) { return path.posix.basename(value.replaceAll('\\', '/')).toLowerCase().replace(/\.exe$/, ''); }
function obviousPrivate(command, words, cwd, agentDir, resolve) {
    // Inspect literals even in opaque programs before deciding whether to ask. Splitting
    // quoted program text catches obvious interpreter/eval attempts without evaluating it.
    const fragments = [command, ...words].flatMap(value => value.split(/[\s'"`=;,:|<>(){}]+/));
    for (const fragment of fragments) {
        if (!fragment) continue;
        if (privateName(fragment) || /(?:^|[/:])(?:environ|self\/fd)(?:\/|$)/i.test(fragment)) return true;
        if (!fragment.startsWith('-') && protectedPath(fragment, cwd, agentDir, resolve)) return true;
        if (agentDir && fragment.toLowerCase().includes(agentDir.replaceAll('\\', '/').toLowerCase())) return true;
    }
    if (/\$(?:\{)?(?:[a-z0-9_]*(?:token|secret|password|api_key|private_key|credential)[a-z0-9_]*)(?:\})?\b/i.test(command)
        || /\$env\s*:/i.test(command) || /\b(?:env|variable):\s*[^\s]*/i.test(command)) return true;
    for (const word of words) {
        const name = commandName(word);
        if (CREDENTIAL_COMMANDS.has(name) || name === 'security' || name === 'credential') return true;
        // Option values can name a file too. A plain word is checked for symlinks and
        // hard links as well; this intentionally prefers refusal to a private alias.
        for (const candidate of word.startsWith('-') && word.includes('=') ? [word.slice(word.indexOf('=') + 1)] : [word]) {
            if (candidate && !candidate.startsWith('-') && protectedPath(candidate, cwd, agentDir, resolve)) return true;
        }
    }
    return false;
}
function classifyCommand({ toolName, input, cwd, agentDir }) {
    const command = input?.command;
    if (typeof command !== 'string' || !command.trim() || command.length > 20000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(command)) return { status: 'unknown' };
    const { words, opaque } = shellWords(command, toolName);
    const resolve = toolName === 'powershell' ? resolvePowerShellPath : resolveShellPath;
    if (obviousPrivate(command, words, cwd, agentDir, resolve) || protectedPath(cwd, cwd, agentDir, resolve)) return { status: 'blocked' };
    if (!words.length) return { status: 'unknown' };
    const names = words.map(commandName), name = toolName === 'powershell' ? names[0] : path.posix.basename(words[0]), args = words.slice(1);
    if (names.some(value => DANGEROUS.has(value)) || /\b(?:push|publish|deploy|upload|delete|destroy|reset|clean|format-volume)\b/i.test(words.join(' '))) return { status: 'risk' };
    if (opaque) return { status: 'unknown' };
    // A relative executable, an alternate absolute binary or a command wrapper is opaque.
    if (words[0].includes('/') && !/^\/(?:usr\/)?bin\/[a-z-]+$/.test(words[0]) || words[0].includes('\\')) return { status: 'unknown' };
    if (toolName === 'powershell') {
        if (words[0].includes('/')) return { status: 'unknown' };
        if (['get-date', 'get-location'].includes(name) && !args.length) return { status: 'safe' };
        if (name === 'write-output' && args.every(arg => !arg.startsWith('-'))) return { status: 'safe' };
        if (PS_READ.has(name) && args.every(arg => !arg.includes(':') && (!arg.startsWith('-') || ['-path', '-literalpath', '-name', '-force'].includes(arg.toLowerCase())))) return { status: 'safe' };
        return { status: 'unknown' };
    }
    if (['pwd', 'whoami', 'date', 'true', 'false'].includes(name) && !args.length) return { status: 'safe' };
    if (['echo', 'printf'].includes(name) && args.every(arg => !arg.startsWith('-'))) return { status: 'safe' };
    if (READ_COMMANDS.has(name)) {
        // Options which cause secondary file reads/writes or follow streams indefinitely
        // are not recognized. Literal operands have already passed the private-path check.
        const options = { ls: /^-(?:[alhAdF1rtS]+|-(?:all|almost-all|human-readable))$/, cat: /^-[nbEsTvA]+$/,
            head: /^-(?:n|c|[0-9]+)$/, tail: /^-(?:n|c|[0-9]+)$/, wc: /^-[lwmcL]+$/,
            stat: /^-(?:L|f)$/, file: /^-(?:b|L|i)$/, realpath: /^-(?:e|m|s)$/, readlink: /^-[fem]+$/ };
        if (args.every(arg => !arg.startsWith('-') || arg === '--' || options[name].test(arg))) return { status: 'safe' };
    }
    if (name === 'git' && SAFE_GIT.has(args[0])) {
        const [operation, ...options] = args;
        if (operation === 'branch') return { status: options.length ? 'unknown' : 'safe' };
        // Only named display options are understood; help, output files, alternate
        // configuration and other executable helpers remain one-time approvals.
        const flags = {
            status: /^(?:--short|-s|--branch|-b|--porcelain(?:=v[12])?|--untracked-files(?:=(?:no|normal|all))?|--ignored|--ignore-submodules)$/,
            diff: /^(?:--no-ext-diff|--no-textconv|--stat|--numstat|--shortstat|--name-only|--name-status|--cached|--staged|--check|--color=never|--unified=\d+)$/,
            log: /^(?:--no-ext-diff|--no-textconv|--oneline|--stat|--name-only|--name-status|--graph|--all|--decorate|--no-decorate|--max-count=\d+|--color=never)$/,
            show: /^(?:--no-ext-diff|--no-textconv|--stat|--name-only|--name-status|--oneline|--color=never)$/,
            'ls-files': /^(?:-z|--cached|--modified|--others|--deleted|--exclude-standard|--stage)$/,
            'rev-parse': /^(?:--show-toplevel|--show-prefix|--is-inside-work-tree|--short|--verify)$/
        };
        if (!options.every(arg => arg === '--' || !arg.startsWith('-') || flags[operation].test(arg))) return { status: 'unknown' };
        // Disable repository-configured executable diff/textconv helpers explicitly.
        if (['diff', 'show', 'log'].includes(operation) && !(options.includes('--no-ext-diff') && options.includes('--no-textconv'))) return { status: 'unknown' };
        return { status: 'safe' };
    }
    if (['mkdir', 'touch'].includes(name) && args.length && args.every(arg => !arg.startsWith('-') || name === 'mkdir' && arg === '-p')) {
        const files = args.filter(arg => !arg.startsWith('-'));
        if (!files.length) return { status: 'unknown' };
        if (files.some(file => !insideWorkspace(cwd, file, resolveShellPath) || systemPath(canonicalTarget(resolveShellPath(file, cwd)) ?? file))) return { status: 'risk' };
        return { status: 'safe' };
    }
    return { status: 'unknown' };
}
module.exports = { shellWords, classifyCommand };
