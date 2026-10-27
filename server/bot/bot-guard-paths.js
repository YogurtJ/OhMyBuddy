'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

// Mirrors Pi 1.4 resolveToCwd; native file tools normalize these before resolving.
const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
function windowsShellPath(value) {
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return value;
    const match = value.match(/^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i);
    if (!match) return value;
    return `${match[1].toUpperCase()}:\\${match[2]?.replaceAll('/', '\\') ?? ''}`;
}
function normalizePiPath(input, { spaces = false, at = false } = {}) {
    let value = input;
    if (spaces) value = value.replace(UNICODE_SPACES, ' ');
    if (at && value.startsWith('@')) value = value.slice(1);
    if (process.platform === 'win32') value = windowsShellPath(value);
    if (value === '~') return os.homedir();
    if (value.startsWith('~/') || (process.platform === 'win32' && value.startsWith('~\\'))) return path.join(os.homedir(), value.slice(2));
    if (/^file:\/\//.test(value)) return fileURLToPath(value);
    return value;
}
function resolvePiPath(input, cwd) {
    const value = normalizePiPath(input, { spaces: true, at: true });
    return path.isAbsolute(value) ? path.resolve(value) : path.resolve(normalizePiPath(cwd), value);
}

// Missing trailing components are retained; unresolved existing entries stay unknown.
// Hard links cannot prove that another name is not private state, so are never allowed.
function canonicalTarget(target) {
    let current = target;
    const tail = [];
    for (;;) {
        let stat;
        try { stat = fs.lstatSync(current); } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) return null; }
        if (stat) {
            try {
                const real = fs.realpathSync.native(current), resolved = fs.statSync(real);
                if (!resolved.isFile() && !resolved.isDirectory() || resolved.isFile() && (resolved.nlink > 1 || tail.length)) return null;
                return path.join(real, ...tail);
            } catch { return null; }
        }
        const parent = path.dirname(current);
        if (parent === current) return null;
        tail.unshift(path.basename(current)); current = parent;
    }
}
const within = (root, target) => {
    const relative = path.relative(root, target);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};
function insideWorkspace(cwd, raw, resolve = resolvePiPath) {
    if (typeof raw !== 'string') return false;
    try {
        const target = canonicalTarget(resolve(raw, cwd));
        return Boolean(target) && within(fs.realpathSync.native(cwd), target);
    } catch { return false; }
}

// Deliberately names only recognizable credential stores and Pivane/Pi private state.
// This is tool-layer policy, not a filesystem sandbox or a scan of file contents.
function privateName(value) {
    const parts = value.replaceAll('\\', '/').toLowerCase().split(/[/:]/);
    return /^\/(?:proc|dev\/fd)(?:\/|$)/.test(value.replaceAll('\\', '/')) || parts.some((part, index) => /^\.env(?:[.*?\[].*)?$/.test(part)
        || /^(?:auth\.json|shadow|gshadow|master\.passwd|credentials(?:\..*)?|secrets?(?:\..*)?|\.netrc|_netrc|\.npmrc|\.pypirc|\.git-credentials)$/.test(part)
        || /^(?:\.ssh|\.aws|\.azure|\.kube|\.gnupg|\.pivane|pivane-profiles|pivane-bots)$/.test(part)
        || /^(?:id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/.test(part)
        || part === '.pi' && ['agent', 'settings.json', 'trust.json', 'auth.json'].includes(parts[index + 1])
        || part === '.docker' && parts[index + 1] === 'config.json'
        || part === '.config' && ['gcloud', 'pivane'].includes(parts[index + 1]));
}
function protectedPath(raw, cwd, agentDir, resolve = resolvePiPath) {
    if (typeof raw !== 'string' || !raw || /[\x00-\x1f\x7f]/.test(raw)) return true;
    if (privateName(raw)) return true;
    try {
        const lexical = resolve(raw, cwd), target = canonicalTarget(lexical);
        if (!target || privateName(lexical) || privateName(target)) return true;
        if (agentDir) {
            const root = path.resolve(agentDir), real = canonicalTarget(root);
            if (within(root, lexical) || real && within(real, target)) return true;
        }
        return false;
    } catch { return true; }
}
// Shell arguments do not use Pi's @ prefix or Unicode-space normalization. Quoted
// paths must be checked exactly as the shell will use them. Unquoted ~ remains opaque.
function resolveShellPath(input, cwd) { return path.resolve(cwd, input); }
function resolvePowerShellPath(input, cwd) { return path.resolve(cwd, input.replaceAll('\\', path.sep)); }
// Writes here still ask even in Hands-off mode: Pivane's own running releases, state and
// backups, and locations that start programs automatically at login or on a schedule.
function criticalPath(target) {
    const normalized = target.replaceAll('\\', '/').toLowerCase();
    return /(?:^|\/)\.pivane-runtime(?:\/|$)/.test(normalized)
        || /(?:^|\/)(?:library\/(?:launchagents|launchdaemons)|\.config\/(?:systemd|launchd|autostart)|start menu\/programs\/startup)(?:\/|$)/.test(normalized)
        || /^\/(?:etc\/(?:cron[^/]*|systemd|init\.d)|var\/spool\/cron)(?:\/|$)/.test(normalized);
}
function systemPath(target) {
    const normalized = target.replaceAll('\\', '/').toLowerCase();
    if (criticalPath(target)) return true;
    return /(?:^|\/)(?:\.git(?:\/|$)|\.config\/(?:systemd|launchd)(?:\/|$)|\.(?:bashrc|bash_profile|zshrc|profile|gitconfig)$|microsoft\.powershell_profile\.ps1$)/.test(normalized)
        || /^\/(?:etc|usr|bin|sbin|boot|dev|proc|sys|run|var\/lib|var\/run)(?:\/|$)/.test(normalized)
        || /^[a-z]:\/(?:windows|program files(?: \(x86\))?|programdata)(?:\/|$)/.test(normalized);
}
function fileOperation({ input, cwd, agentDir }) {
    const raw = input?.path;
    if (protectedPath(raw, cwd, agentDir)) return { status: 'blocked' };
    const value = canonicalTarget(resolvePiPath(raw, cwd));
    let directory = false;
    try { directory = fs.statSync(value).isDirectory(); } catch { /* New files are allowed. */ }
    return { status: systemPath(value) || directory ? 'risk' : 'safe', critical: directory || criticalPath(value), value };
}
module.exports = { resolvePiPath, resolveShellPath, resolvePowerShellPath, canonicalTarget, insideWorkspace, privateName, protectedPath, systemPath, criticalPath, fileOperation, within };
