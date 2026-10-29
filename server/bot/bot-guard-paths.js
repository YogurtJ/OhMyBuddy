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

// Deliberately separates recognizable credential stores/private keys from OhMyBuddy/Pi
// private application state. This is tool-layer policy, not a filesystem sandbox.
function forbiddenName(value) {
    return /^\/(?:proc|dev\/fd)(?:\/|$)/.test(value.replaceAll('\\', '/').toLowerCase());
}
function credentialName(value) {
    const parts = value.replaceAll('\\', '/').toLowerCase().split(/[/:]/);
    return forbiddenName(value) || parts.some((part, index) => /^\.env(?:[.*?\[].*)?$/.test(part)
        || /^(?:auth\.json|shadow|gshadow|master\.passwd|credentials(?:\..*)?|secrets?(?:\..*)?|\.netrc|_netrc|\.npmrc|\.pypirc|\.git-credentials|(?:ohmybuddy|pivane|pi5)-access\.json)$/.test(part)
        || /^(?:\.ssh|\.aws|\.azure|\.kube|\.gnupg|(?:ohmybuddy|pivane|pi5)-channels)$/.test(part)
        || /^(?:id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/.test(part)
        || part === '.docker' && parts[index + 1] === 'config.json'
        || part === '.config' && parts[index + 1] === 'gcloud');
}
function privateStateName(value) {
    const parts = value.replaceAll('\\', '/').toLowerCase().split(/[/:]/);
    return parts.some((part, index) => /^(?:\.(?:ohmybuddy|pivane)|(?:ohmybuddy|pivane)-(?:profiles|bots))$/.test(part)
        || part === '.pi' && ['agent', 'settings.json', 'trust.json'].includes(parts[index + 1])
        || part === '.config' && ['ohmybuddy', 'pivane'].includes(parts[index + 1]));
}
function privateName(value) { return credentialName(value) || privateStateName(value); }
function pathAccess(raw, cwd, agentDir, resolve = resolvePiPath) {
    if (typeof raw !== 'string' || !raw || /[\x00-\x1f\x7f]/.test(raw) || forbiddenName(raw)) return 'invalid';
    const cred = credentialName(raw);
    const state = privateStateName(raw);
    try {
        const lexical = resolve(raw, cwd), target = canonicalTarget(lexical);
        if (!target || forbiddenName(lexical) || forbiddenName(target)) return 'invalid';
        if (cred || credentialName(lexical) || credentialName(target)) return 'credential';
        if (state || privateStateName(lexical) || privateStateName(target)) return 'state';
        if (agentDir) {
            const root = path.resolve(agentDir), real = canonicalTarget(root);
            if (within(root, lexical) || real && within(real, target)) return 'state';
        }
        return 'ok';
    } catch { return 'invalid'; }
}
function credentialPath(raw, cwd, agentDir, resolve = resolvePiPath) {
    const access = pathAccess(raw, cwd, agentDir, resolve);
    return access === 'invalid' || access === 'credential';
}
function privateStatePath(raw, cwd, agentDir, resolve = resolvePiPath) {
    return pathAccess(raw, cwd, agentDir, resolve) === 'state';
}
function protectedPath(raw, cwd, agentDir, resolve = resolvePiPath) {
    return pathAccess(raw, cwd, agentDir, resolve) !== 'ok';
}
// Shell arguments do not use Pi's @ prefix or Unicode-space normalization. Quoted
// paths must be checked exactly as the shell will use them. Unquoted ~ remains opaque.
function resolveShellPath(input, cwd) { return path.resolve(cwd, input); }
function resolvePowerShellPath(input, cwd) { return path.resolve(cwd, input.replaceAll('\\', path.sep)); }
// Darwin's /etc and /var resolve under /private; classify both spellings alike.
const systemLocation = target => target.replaceAll('\\', '/').toLowerCase().replace(/^\/private\/(?=(?:etc|var)(?:\/|$))/, '/');
// Writes here still ask even in Hands-off mode: OhMyBuddy's own running releases, state and
// backups, and locations that start programs automatically at login or on a schedule.
function criticalPath(target) {
    const normalized = systemLocation(target);
    return /(?:^|\/)\.(?:ohmybuddy|pivane)-runtime(?:\/|$)/.test(normalized)
        || /(?:^|\/)(?:library\/(?:launchagents|launchdaemons)|\.config\/(?:systemd|launchd|autostart)|start menu\/programs\/startup)(?:\/|$)/.test(normalized)
        || /^\/(?:etc\/(?:cron[^/]*|systemd|init\.d)|var\/spool\/cron)(?:\/|$)/.test(normalized);
}
function systemPath(target) {
    const normalized = systemLocation(target);
    if (criticalPath(target)) return true;
    return /(?:^|\/)(?:\.git(?:\/|$)|\.config\/(?:systemd|launchd)(?:\/|$)|\.(?:bashrc|bash_profile|zshrc|profile|gitconfig)$|microsoft\.powershell_profile\.ps1$)/.test(normalized)
        || /^\/(?:etc|usr|bin|sbin|boot|dev|proc|sys|run|var\/lib|var\/run)(?:\/|$)/.test(normalized)
        || /^[a-z]:\/(?:windows|program files(?: \(x86\))?|programdata)(?:\/|$)/.test(normalized);
}
function fileOperation({ input, cwd, agentDir }) {
    const raw = input?.path;
    const access = pathAccess(raw, cwd, agentDir);
    if (access === 'invalid') return { status: 'blocked' };
    const value = canonicalTarget(resolvePiPath(raw, cwd));
    let directory = false;
    try { directory = fs.statSync(value).isDirectory(); } catch { /* New files are allowed. */ }
    if (access === 'credential') return { status: 'credential', critical: true, value };
    if (access === 'state') return { status: 'state', critical: directory || criticalPath(value), value };
    return { status: systemPath(value) || directory ? 'risk' : 'safe', critical: directory || criticalPath(value), value };
}
module.exports = { resolvePiPath, resolveShellPath, resolvePowerShellPath, canonicalTarget, insideWorkspace, credentialName, privateStateName, privateName, pathAccess, credentialPath, privateStatePath, protectedPath, systemPath, criticalPath, fileOperation, within };
