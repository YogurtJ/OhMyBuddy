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
// env, export and set are refused only when they print the whole environment (see dumpsEnvironment).
const CREDENTIAL_COMMANDS = new Set(['printenv', 'pass', 'secret-tool', 'get-credential', 'get-secret', 'get-childitem-env']);
const READ_COMMANDS = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'stat', 'file', 'realpath', 'readlink', 'du', 'df', 'which', 'whereis', 'uname', 'basename', 'dirname', 'sort', 'uniq', 'cut', 'tr', 'nl']);
const SEARCH_COMMANDS = new Set(['rg', 'grep', 'egrep', 'fgrep', 'find', 'fd', 'tree', 'jq']);
const PS_READ = new Set(['get-content', 'get-childitem', 'get-item', 'test-path', 'resolve-path']);
const SAFE_GIT = new Set(['status', 'diff', 'log', 'show', 'ls-files', 'rev-parse', 'branch', 'grep', 'blame', 'shortlog', 'describe', 'tag']);

// Splits simple bash pipelines (| and &&) when outside quotes and escapes, without
// permitting redirection (> <), background (&), subshells, or ; / ||.
function splitSimpleSegments(command) {
    const segments = [];
    let current = '', quote = '';
    for (let i = 0; i < command.length; i++) {
        const ch = command[i];
        if (quote) {
            if (ch === quote) { quote = ''; current += ch; continue; }
            if (ch === '\\' && quote === '"' && i + 1 < command.length) { current += ch + command[++i]; continue; }
            current += ch; continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
        if (ch === '\\' && i + 1 < command.length) { current += ch + command[++i]; continue; }
        if (ch === '|' && command[i + 1] !== '|') {
            if (!current.trim()) return null;
            segments.push(current.trim()); current = ''; continue;
        }
        if (ch === '&' && command[i + 1] === '&') {
            if (!current.trim()) return null;
            segments.push(current.trim()); current = ''; i++; continue;
        }
        if (/[;<>&(){}\n\r]/.test(ch)) return null;
        current += ch;
    }
    if (quote || !current.trim()) return null;
    segments.push(current.trim());
    return segments;
}

function commandName(value) { return path.posix.basename(value.replaceAll('\\', '/')).toLowerCase().replace(/\.exe$/, ''); }

// Best-effort walk over every simple command in literal text, including -c scripts, eval,
// wrappers such as sudo/xargs/timeout and find -exec. Splitting ignores quotes on purpose:
// it may visit a quoted fragment as a command (asking more), never fewer real commands.
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const PIECES = /\r?\n|;|&&|\|\||\||&|\$\(|`|\(|\)|\{|\}/;
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'pwsh', 'powershell', 'cmd']);
const WRAPPERS = new Map([['nohup', []], ['time', []], ['exec', ['-a']], ['command', []], ['builtin', []], ['caffeinate', ['-t', '-w']],
    ['env', ['-u', '--unset', '-C', '--chdir']], ['xargs', ['-I', '-n', '-P', '-s', '-L', '-d', '-E', '-a']], ['watch', ['-n', '-d']],
    ['timeout', ['-s', '-k', '--signal', '--kill-after']], ['nice', ['-n']], ['ionice', ['-c', '-n', '-p']], ['stdbuf', ['-i', '-o', '-e']],
    ['sudo', ['-u', '-g', '-h', '-p', '-C', '-U', '-r', '-t']], ['doas', ['-u', '-C']], ['gsudo', ['-u']], ['pkexec', ['--user']]]);
function visitCommands(text, tool, visit, depth = 0) {
    if (depth > 4) return true;
    return text.split(PIECES).some(piece => piece.trim() && visitWords(shellWords(piece, tool).words, tool, visit, depth));
}
function visitWords(words, tool, visit, depth) {
    if (depth > 4) return true;
    let i = 0;
    while (i < words.length && ASSIGNMENT.test(words[i])) i++;
    if (i >= words.length) return false;
    const name = commandName(words[i]), args = words.slice(i + 1);
    if (visit(name, args, tool)) return true;
    const valueFlags = WRAPPERS.get(name);
    if (valueFlags) {
        if (name === 'command' && /^-[vV]$/.test(args[0] || '')) return false;
        let j = 0;
        while (j < args.length && (args[j].startsWith('-') || ASSIGNMENT.test(args[j]))) { if (valueFlags.includes(args[j])) j++; j++; }
        if (name === 'timeout' && /^\d/.test(args[j] || '')) j++;
        return visitWords(args.slice(j), tool, visit, depth + 1);
    }
    if (SHELLS.has(name)) {
        const k = args.findIndex(arg => /^-[a-z]*c$/i.test(arg) || /^-command$/i.test(arg) || /^\/[ck]$/i.test(arg));
        return k >= 0 && visitCommands(args.slice(k + 1).join(' '), ['pwsh', 'powershell'].includes(name) ? 'powershell' : 'bash', visit, depth + 1);
    }
    if (['eval', 'invoke-expression', 'iex'].includes(name)) return visitCommands(args.join(' '), tool, visit, depth + 1);
    if (name === 'find') {
        const k = args.findIndex(arg => /^-(?:exec|execdir|ok|okdir)$/.test(arg));
        if (k >= 0) {
            const end = args.findIndex((arg, index) => index > k && (arg === ';' || arg === '+'));
            return visitWords(args.slice(k + 1, end < 0 ? undefined : end), tool, visit, depth + 1);
        }
    }
    return false;
}

// env/export/set themselves are ordinary; only printing the whole environment is refused.
function dumpsEnvironment(name, args) {
    if (name === 'env') {
        let j = 0;
        while (j < args.length && (args[j].startsWith('-') || ASSIGNMENT.test(args[j]))) { if (['-u', '--unset', '-C', '--chdir'].includes(args[j])) j++; j++; }
        return j >= args.length;
    }
    if (name === 'export') return args.every(arg => arg.startsWith('-'));
    if (name === 'set') return !args.length;
    return false;
}

// Hands-off mode runs every command except this short list, which still asks first:
// privilege escalation, recursive or disk-level deletion, power, process and service
// control, history-destroying Git, publishing, outgoing mail, persistent background jobs
// and anything that touches Pivane's own runtime. Best effort over literal text, not a sandbox.
const ELEVATE = new Set(['sudo', 'doas', 'su', 'runas', 'pkexec', 'gsudo']);
const ALWAYS_ASK = new Set(['shutdown', 'reboot', 'halt', 'poweroff', 'stop-computer', 'restart-computer',
    'kill', 'killall', 'pkill', 'skill', 'taskkill', 'stop-process', 'spps',
    'shred', 'wipefs', 'fdisk', 'sfdisk', 'gdisk', 'parted', 'diskpart', 'format-volume', 'clear-disk', 'initialize-disk', 'remove-partition',
    'sendmail', 'mail', 'mailx', 'mutt', 'msmtp', 'send-mailmessage', 'rimraf', 'systemd-run',
    'stop-service', 'restart-service', 'start-service', 'set-service', 'new-service', 'remove-service', 'suspend-service',
    'register-scheduledtask', 'set-scheduledtask', 'unregister-scheduledtask']);
const RUNTIME_TEXT = /\.pivane-runtime\b/i;
function dangerous(name, args, tool) {
    const lower = args.map(arg => arg.toLowerCase()), first = lower.find(arg => !arg.startsWith('-'));
    if (ELEVATE.has(name) || ALWAYS_ASK.has(name) || name.startsWith('mkfs')) return true;
    if (['rm', 'del', 'erase', 'rd', 'rmdir', 'remove-item', 'ri'].includes(name)) {
        if (lower.some(arg => /^\/s$/.test(arg))) return true;
        if (tool === 'powershell') return lower.some(arg => /^-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?(?::\$?true)?$/.test(arg));
        return name === 'rm' && args.some(arg => /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(arg) || arg === '--recursive');
    }
    if (name === 'find') return lower.includes('-delete');
    if (name === 'dd') return lower.some(arg => arg.startsWith('of='));
    if (name === 'diskutil') return /^(?:erase|zero|secureerase|partitiondisk|reformat|eject)/.test(first || '');
    if (name === 'systemctl') return !/^(?:status|show|cat|list-[a-z-]+|is-[a-z-]+|help)$/.test(first || 'status');
    if (name === 'launchctl') return !/^(?:list|print|print-disabled|blame|version|help)$/.test(first || 'list');
    if (name === 'service') return !lower.includes('status') && !lower.includes('--status-all');
    if (name === 'sc') return !/^(?:query|queryex|qc|qdescription|getdisplayname|getkeyname)$/.test(first || 'query');
    if (name === 'crontab') return !lower.includes('-l');
    if (['at', 'batch'].includes(name)) return !lower.includes('-l');
    if (name === 'schtasks') return !lower.includes('/query');
    if (name === 'git') {
        let k = 0;
        while (k < args.length && args[k].startsWith('-')) { if (['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(args[k])) k++; k++; }
        const sub = args[k], rest = args.slice(k + 1), force = rest.some(arg => arg === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(arg));
        return sub === 'push' || sub === 'reset' && rest.includes('--hard') || sub === 'clean' && force
            || sub === 'branch' && (rest.some(arg => /^-[a-zA-Z]*D[a-zA-Z]*$/.test(arg)) || rest.includes('--delete') && force);
    }
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(name)) return lower.includes('publish') || lower.includes('unpublish');
    if (['cargo'].includes(name)) return ['publish', 'yank'].includes(first);
    if (['vsce', 'ovsx', 'poetry', 'flit', 'hatch', 'uv'].includes(name)) return first === 'publish';
    if (name === 'twine') return first === 'upload';
    if (name === 'gem') return first === 'push';
    if (['gh', 'glab'].includes(name)) {
        const [area, action] = lower.filter(arg => !arg.startsWith('-'));
        return area === 'release' && !['list', 'view', 'download'].includes(action) || area === 'repo' && action === 'delete';
    }
    return false;
}
function freeModeAsks({ toolName, input }) {
    const command = input?.command;
    if (typeof command !== 'string' || !command.trim() || command.length > 20000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(command)) return true;
    return RUNTIME_TEXT.test(command) || visitCommands(command, toolName === 'powershell' ? 'powershell' : 'bash', dangerous);
}

function obviousPrivate(command, words, cwd, agentDir, resolve, tool = 'bash') {
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
    if (visitCommands(command, tool, dumpsEnvironment)) return true;
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
function isSafeDateArgs(args) {
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('+')) continue;
        if (/^(?:-[uR]|--utc|--universal|--rfc-email|--rfc-2822|--rfc-3339=(?:date|seconds|ns)|-I(?:date|hours|minutes|seconds|ns)?|--iso-8601(?:=(?:date|hours|minutes|seconds|ns))?)$/.test(arg)) continue;
        if (arg === '-d' || arg === '--date') {
            if (i + 1 >= args.length || !args[i + 1]) return false;
            i++; continue;
        }
        if (/^(?:-d.+|--date=.+)$/.test(arg)) continue;
        return false;
    }
    return true;
}
function classifySingleCommand({ toolName, command, cwd, agentDir }) {
    const { words, opaque } = shellWords(command, toolName);
    const resolve = toolName === 'powershell' ? resolvePowerShellPath : resolveShellPath;
    if (obviousPrivate(command, words, cwd, agentDir, resolve, toolName === 'powershell' ? 'powershell' : 'bash') || protectedPath(cwd, cwd, agentDir, resolve)) return { status: 'blocked' };
    if (!words.length) return { status: 'unknown' };
    const names = words.map(commandName), name = toolName === 'powershell' ? names[0] : path.posix.basename(words[0]), args = words.slice(1);
    // PowerShell expands -Path wildcards in quoted strings too. Without a strictly
    // literal operand, even '*' can select credentials or a private alias. Refuse
    // unsupported selectors rather than asking or offering a persistent grant.
    if (toolName === 'powershell' && PS_READ.has(names[0]) && args.some(arg => /[*?\[\]]/.test(arg))) {
        const literalPath = !opaque && args.length === 2 && args[0].toLowerCase() === '-literalpath'
            && !args[1].startsWith('-') && !args[1].includes(':');
        if (!literalPath) return { status: 'blocked' };
    }
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
    if (['pwd', 'whoami', 'id', 'hostname', 'uptime', 'true', 'false'].includes(name) && !args.length) return { status: 'safe' };
    if (name === 'date' && isSafeDateArgs(args)) return { status: 'safe' };
    if (['cal', 'ncal'].includes(name) && args.every(arg => /^(?:-[13jywmSM]+|\d{1,4})$/.test(arg))) return { status: 'safe' };
    if (name === 'cd' && args.length <= 1 && args.every(arg => !arg.startsWith('-'))) return { status: 'safe' };
    if (['echo', 'printf'].includes(name) && args.every(arg => !arg.startsWith('-'))) return { status: 'safe' };
    if (READ_COMMANDS.has(name)) {
        // Options which cause secondary file reads/writes or follow streams indefinitely
        // are not recognized. Literal operands have already passed the private-path check.
        const options = { ls: /^-(?:[alhAdF1rtS]+|-(?:all|almost-all|human-readable))$/, cat: /^-[nbEsTvA]+$/,
            head: /^-(?:n\d*|c\d*|[0-9]+)$/, tail: /^-(?:n\d*|c\d*|[0-9]+)$/, wc: /^-[lwmcL]+$/,
            stat: /^-(?:L|f|c)$/, file: /^-(?:b|L|i)$/, realpath: /^-(?:e|m|s)$/, readlink: /^-[fem]+$/,
            du: /^-(?:[shckmLxd]+|d\d+|--max-depth=\d+)$/, df: /^-[hTkiP]+$/, which: /^-a$/, whereis: /^-[bmsu]+$/,
            uname: /^-[asnrvmpio]+$/, basename: /^-a$/, dirname: /^$/, sort: /^-[rnuVfbk]+$/, uniq: /^-[cdiu]+$/,
            cut: /^-(?:[dfc]|d.|f[0-9,-]+|c[0-9,-]+)$/, tr: /^-[cds]+$/, nl: /^-[ba]+$/ };
        // uniq INPUT OUTPUT writes its second operand.
        if (name === 'uniq' && args.filter(arg => !arg.startsWith('-')).length > 1) return { status: 'unknown' };
        if (args.every(arg => !arg.startsWith('-') || arg === '--' || options[name]?.test(arg))) return { status: 'safe' };
    }
    if (SEARCH_COMMANDS.has(name)) {
        // Disallow find/rg/fd flags that execute external commands or delete files.
        const unsafeFlag = /^(?:-(?:exec|execdir|ok|okdir|delete|fls|fprint|fprint0|fprintf)|--(?:pre|pre-glob|exec|exec-batch))$/i;
        // Short-option clusters too: fd -x/-X run commands, tree -o writes a file, rg -z runs decompressors.
        const cluster = { fd: /^-[a-zA-Z]*[xX]/, tree: /^-[a-zA-Z]*o/, rg: /^-[a-zA-Z]*z/ }[name];
        const longUnsafe = { rg: /^--search-zip$/, tree: /^--output$/ }[name];
        if (args.some(arg => !arg.startsWith('--') && cluster?.test(arg) || longUnsafe?.test(arg.split('=')[0]))) return { status: 'unknown' };
        if (args.every(arg => !unsafeFlag.test(arg.split('=')[0]))) return { status: 'safe' };
    }
    if (name === 'git') {
        let gitArgs = args;
        if (gitArgs[0] === '-C' && gitArgs.length >= 3 && !gitArgs[1].startsWith('-')) gitArgs = gitArgs.slice(2);
        const [operation, ...options] = gitArgs;
        if (SAFE_GIT.has(operation)) {
            if (operation === 'branch' || operation === 'tag') {
                if (options.every(arg => /^(?:-a|-r|--all|--remotes|--list|-l|--show-current|--contains|--merged|--no-merged)$/.test(arg))) return { status: 'safe' };
                return { status: 'unknown' };
            }
            const unsafeGitOpt = /^(?:--help|-h|--output(?:=|$)|--ext-diff|--textconv|-c|--config-env|--exec-path|--git-dir|--work-tree)/;
            if (options.some(arg => unsafeGitOpt.test(arg))) return { status: 'unknown' };
            // Diff output may run configured external diff or textconv programs unless both are disabled.
            const showsPatch = operation === 'diff' || operation === 'show' && !options.some(arg => ['-s', '--no-patch'].includes(arg))
                || operation === 'log' && options.some(arg => ['-p', '--patch'].includes(arg));
            if (showsPatch && !(options.includes('--no-ext-diff') && options.includes('--no-textconv'))) return { status: 'unknown' };
            const flags = {
                status: /^(?:--short|-s|--branch|-b|--porcelain(?:=v[12])?|--untracked-files(?:=(?:no|normal|all))?|--ignored|--ignore-submodules)$/,
                diff: /^(?:--no-ext-diff|--no-textconv|--stat|--numstat|--shortstat|--name-only|--name-status|--cached|--staged|--check|--color(?:=(?:never|always|auto))?|--unified=\d+|-U\d+|-w|-b|--ignore-all-space|--ignore-space-change)$/,
                log: /^(?:--no-ext-diff|--no-textconv|--oneline|--stat|--name-only|--name-status|--graph|--all|--decorate|--no-decorate|--max-count=\d+|-n\d*|-\d+|--color(?:=(?:never|always|auto))?|--pretty=[^\s]+|--format=[^\s]+|--since=[^\s]+|--until=[^\s]+|--author=[^\s]+|-p|--patch)$/,
                show: /^(?:--no-ext-diff|--no-textconv|--stat|--name-only|--name-status|--oneline|--color(?:=(?:never|always|auto))?|--pretty=[^\s]+|--format=[^\s]+|-s|--no-patch)$/,
                'ls-files': /^(?:-z|--cached|--modified|--others|--deleted|--exclude-standard|--stage)$/,
                'rev-parse': /^(?:--show-toplevel|--show-prefix|--is-inside-work-tree|--short|--verify|--abbrev-ref)$/,
                grep: /^(?:-[inIlvweFEcph]+|--line-number|--ignore-case|--files-with-matches|--count|--heading|--break)$/,
                blame: /^(?:-[Llwfnes]+|--line-porcelain|--porcelain)$/,
                shortlog: /^(?:-[sne]+|--summary|--numbered|--email)$/,
                describe: /^(?:--tags|--always|--abbrev=\d+|--dirty|--long)$/
            };
            if (options.every(arg => arg === '--' || !arg.startsWith('-') || flags[operation]?.test(arg))) return { status: 'safe' };
        }
    }
    if (['mkdir', 'touch'].includes(name) && args.length && args.every(arg => !arg.startsWith('-') || name === 'mkdir' && arg === '-p')) {
        const files = args.filter(arg => !arg.startsWith('-'));
        if (!files.length) return { status: 'unknown' };
        if (files.some(file => !insideWorkspace(cwd, file, resolveShellPath) || systemPath(canonicalTarget(resolveShellPath(file, cwd)) ?? file))) return { status: 'risk' };
        return { status: 'safe' };
    }
    return { status: 'unknown' };
}
function classifyCommand({ toolName, input, cwd, agentDir }) {
    const command = input?.command;
    if (typeof command !== 'string' || !command.trim() || command.length > 20000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(command)) return { status: 'unknown' };
    const single = classifySingleCommand({ toolName, command, cwd, agentDir });
    if (single.status !== 'unknown' || toolName !== 'bash') return single;
    const segments = splitSimpleSegments(command);
    if (!segments || segments.length <= 1 || segments.length > 8) return single;
    let currentCwd = cwd;
    for (const segment of segments) {
        const result = classifySingleCommand({ toolName, command: segment, cwd: currentCwd, agentDir });
        if (result.status !== 'safe') return result;
        const { words } = shellWords(segment, toolName);
        if (words[0] === 'cd' && words[1]) currentCwd = resolveShellPath(words[1], currentCwd);
    }
    return { status: 'safe' };
}
module.exports = { shellWords, classifyCommand, freeModeAsks };
