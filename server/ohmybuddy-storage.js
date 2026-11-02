'use strict';
// Application-owned locations. Native Pi identity/session formats stay upstream-owned.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { environmentValue } = require('./pi-local-env');
const value = (env, suffix) => environmentValue(env, suffix, false);
const pathApi = platform => platform === 'win32' ? path.win32 : path.posix;
function present(file) {
    try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function absolute(input, platform, label) {
    const p = pathApi(platform);
    if (typeof input !== 'string' || !p.isAbsolute(input) || /[\x00-\x1f\x7f]/.test(input) || input.trim() !== input)
        throw new Error(`${label} requires an absolute directory path`);
    return p.normalize(input);
}
function layout({ env = process.env, platform = process.platform, home } = {}) {
    home ||= platform === 'win32' ? env.USERPROFILE || os.homedir() : env.HOME || os.homedir();
    const p = pathApi(platform), base = value(env, 'HOME');
    let config, state, data, cache, program;
    if (platform === 'darwin') {
        const support = p.join(home, 'Library', 'Application Support', 'OhMyBuddy');
        config = p.join(support, 'config'); state = p.join(support, 'state'); data = p.join(support, 'data');
        cache = p.join(home, 'Library', 'Caches', 'OhMyBuddy'); program = p.join(support, 'app');
    } else if (platform === 'win32') {
        const local = env.LOCALAPPDATA || p.join(home, 'AppData', 'Local');
        config = p.join(env.APPDATA || p.join(home, 'AppData', 'Roaming'), 'OhMyBuddy');
        state = p.join(local, 'OhMyBuddy', 'state'); data = p.join(local, 'OhMyBuddy', 'data');
        cache = p.join(local, 'OhMyBuddy', 'cache'); program = p.join(local, 'Programs', 'OhMyBuddy');
    } else {
        config = p.join(env.XDG_CONFIG_HOME || p.join(home, '.config'), 'ohmybuddy');
        state = p.join(env.XDG_STATE_HOME || p.join(home, '.local', 'state'), 'ohmybuddy');
        data = p.join(env.XDG_DATA_HOME || p.join(home, '.local', 'share'), 'ohmybuddy');
        cache = p.join(env.XDG_CACHE_HOME || p.join(home, '.cache'), 'ohmybuddy');
        program = p.join(home, '.local', 'lib', 'ohmybuddy');
    }
    if (base) {
        absolute(base, platform, 'OHMYBUDDY_HOME');
        config = p.join(base, 'config'); state = p.join(base, 'state'); data = p.join(base, 'data'); cache = p.join(base, 'cache');
    }
    const result = { config, state, data, cache, workspaces: p.join(home, 'OhMyBuddy Workspaces'), program };
    for (const key of ['config', 'state', 'data', 'cache', 'workspaces'])
        result[key] = absolute(value(env, key.toUpperCase() + '_DIR') || result[key], platform, `OHMYBUDDY_${key.toUpperCase()}_DIR`);
    return result;
}
// Resolve even a not-yet-created leaf through its nearest existing ancestor.
function canonical(input) {
    let current = path.resolve(input), suffix = [];
    while (true) {
        try { return path.join(fs.realpathSync.native(current), ...suffix); }
        catch (error) {
            if (error.code !== 'ENOENT') throw error;
            const parent = path.dirname(current);
            if (parent === current) throw error;
            suffix.unshift(path.basename(current)); current = parent;
        }
    }
}
function within(parent, child, platform = process.platform) {
    const p = pathApi(platform), fold = s => platform === 'darwin' || platform === 'win32' ? s.toLowerCase() : s;
    parent = fold(p.normalize(parent)); child = fold(p.normalize(child));
    return child === parent || child.startsWith(parent.endsWith(p.sep) ? parent : parent + p.sep);
}
function overlaps(a, b, platform = process.platform) { return within(a, b, platform) || within(b, a, platform); }
function programRoots(root, env = process.env) {
    return [...new Set([root, path.resolve(__dirname, '..'), env.PI_MANAGED_BASE].filter(Boolean).map(canonical))];
}
function assertExternal(input, { root, env = process.env, privateRoots = [], managedContainer = false } = {}) {
    const target = canonical(absolute(input, process.platform, 'Storage'));
    const managedRelease = code => {
        if (!managedContainer) return false;
        const base = env.PI_MANAGED_BASE || root;
        if (!base) return false;
        const runtime = legacyRuntime(base) || value(env, 'RUNTIME_DIR') || path.join(layout({ env }).state, 'installations', installationId(base), 'runtime');
        const relative = path.relative(canonical(path.join(runtime, 'releases')), code);
        return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(relative);
    };
    // A launcher's control container may own its verified releases sibling to state.json.
    // Persistent data/config/work roots never get this exception.
    if (programRoots(root, env).some(code => overlaps(code, target) && !(within(target, code) && !within(code, target) && managedRelease(code)))
        || privateRoots.map(canonical).some(blocked => overlaps(blocked, target)))
        throw new Error('Storage directory overlaps application code or private data; choose an external location');
    for (let current = target; ; current = path.dirname(current)) {
        if (fs.existsSync(path.join(current, '.git')) || fs.existsSync(path.join(current, 'PI_INSTALL_COMPLETE.json'))
            || fs.existsSync(path.join(current, 'OHMYBUDDY_BUNDLE.json')) || fs.existsSync(path.join(current, 'PIVANE_BUNDLE.json')))
            throw new Error('Storage directory is inside a checkout or replaceable application version');
        if (path.dirname(current) === current) break;
    }
    return target;
}
function installationId(root) {
    const actual = canonical(root);
    return createHash('sha256').update(process.platform === 'darwin' || process.platform === 'win32' ? actual.toLowerCase() : actual).digest('hex').slice(0, 20);
}
function legacyRuntime(root) {
    const names = ['.ohmybuddy-runtime', '.pivane-runtime'].filter(name => present(path.join(root, name)));
    if (names.length > 1) throw new Error('Conflicting current and legacy maintenance directories');
    return names.length ? path.join(root, names[0]) : null;
}
function runtimeDirectory(root, env = process.env) {
    const configured = value(env, 'RUNTIME_DIR');
    const current = configured || path.join(layout({ env }).state, 'installations', installationId(root), 'runtime');
    const legacy = legacyRuntime(root);
    if (legacy && canonical(current) !== canonical(legacy) && present(current))
        throw new Error('Both legacy and external maintenance state exist; inspect storage before starting');
    if (legacy) {
        if (configured && canonical(configured) !== canonical(legacy)) throw new Error('Existing maintenance state requires an offline migration before changing OHMYBUDDY_RUNTIME_DIR');
        return legacy;
    }
    const folders = layout({ env });
    return assertExternal(current, { root, env, managedContainer: true, privateRoots: [folders.config, folders.data, folders.cache, folders.workspaces, nativeAgentDir(env)] });
}
function configFile(root, env = process.env) {
    const configured = value(env, 'CONFIG_FILE');
    if (configured) return absolute(configured, process.platform, 'OHMYBUDDY_CONFIG_FILE');
    for (const name of ['OHMYBUDDY_INSTALLATION.json', 'PIVANE_INSTALLATION.json']) {
        const file = path.join(root, name);
        if (!fs.existsSync(file)) continue;
        const record = JSON.parse(require('./pi-maintenance-files').readSafe(file, 64 * 1024));
        if (record.version === 1 && ['OhMyBuddy', 'Pivane'].includes(record.product) && canonical(record.root) === canonical(root) && record.configFile)
            return absolute(record.configFile, process.platform, 'Installation configFile');
    }
    const external = path.join(layout({ env }).config, 'instances', installationId(root) + '.env');
    const legacy = path.join(root, '.env');
    if (present(legacy) && present(external)) throw new Error('Both legacy and external instance configuration exist');
    return present(legacy) ? legacy : external;
}
function nativeAgentDir(env = process.env) {
    const input = env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent');
    return path.resolve(input.replace(/^~(?=$|[\\/])/, os.homedir()));
}
// Web settings are identity-scoped, as before. Existing files win without copying.
// Raw embedded services may keep passing explicit paths; normal entry points freeze
// CONFIG_DIR through applyEnvironment before constructing any service.
function settingsFile(agentDir, name, env = process.env) {
    const legacy = require('./ohmybuddy-compat').dataFile(agentDir, name);
    if (!value(env, 'CONFIG_DIR')) return legacy;
    const currentName = name.replace(/^(?:pivane|pi5)-/, 'ohmybuddy-');
    const current = path.join(layout({ env }).config, 'identities', installationId(agentDir), currentName);
    if (present(legacy)) {
        if (canonical(legacy) !== canonical(current) && present(current)) throw new Error('Conflicting legacy and external application settings');
        return legacy;
    }
    return current;
}
function workspacesRoot({ env = process.env, root } = {}) {
    const folders = layout({ env });
    return assertExternal(folders.workspaces, { root, env,
        privateRoots: [nativeAgentDir(env), folders.config, folders.state, folders.data, folders.cache] });
}
function prepareDirectory(directory, options = {}) {
    const target = assertExternal(directory, options);
    // Recheck every existing component immediately before creating the next one.
    const missing = []; let current = target;
    while (!fs.existsSync(current)) { missing.unshift(current); current = path.dirname(current); }
    for (const next of missing) {
        assertExternal(next, options);
        try { fs.mkdirSync(next, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
        if (fs.lstatSync(next).isSymbolicLink() || canonical(next) !== next) throw new Error('Storage directory changed during creation');
    }
    if (!fs.lstatSync(target).isDirectory() || canonical(target) !== target) throw new Error('Storage directory is not a stable directory');
    require('./pi-private-files').privateDirectory(target);
    return target;
}
function legacyMedia(root) {
    return ['generation_history.json', 'video_history.json', 'tts_history.json', 'media_chat_requests.json', 'prompts.json', 'media_references', 'public/images', 'public/videos', 'public/audio']
        .some(name => present(path.join(root, name)));
}
function applyEnvironment(root, env = process.env) {
    require('./pi-local-env').normalizeEnvironment(env);
    const folders = layout({ env });
    const protectedDirectories = ['config', 'state', 'data', 'cache', 'workspaces'];
    for (let i = 0; i < protectedDirectories.length; i++) for (let j = i + 1; j < protectedDirectories.length; j++) {
        if (overlaps(canonical(folders[protectedDirectories[i]]), canonical(folders[protectedDirectories[j]])))
            throw new Error('Storage lifecycle directories overlap; configure separate locations');
    }
    for (const key of ['config', 'state', 'data', 'cache']) {
        assertExternal(folders[key], { root, env, managedContainer: key === 'state', privateRoots: [nativeAgentDir(env)] });
        const suffix = key.toUpperCase() + '_DIR';
        env[`OHMYBUDDY_${suffix}`] ||= value(env, suffix) || folders[key];
    }
    assertExternal(nativeAgentDir(env), { root, env });
    workspacesRoot({ root, env });
    // Preserve explicit/old media configuration, never create a second empty catalog.
    const legacyMediaConfig = path.join(nativeAgentDir(env), 'media-lab');
    if (!env.PI_MEDIA_CONFIG_DIR) {
        const current = path.join(folders.config, 'media-lab');
        if (present(legacyMediaConfig) && present(current) && canonical(legacyMediaConfig) !== canonical(current))
            throw new Error('Conflicting legacy and external media configuration');
        env.PI_MEDIA_CONFIG_DIR = present(legacyMediaConfig) ? legacyMediaConfig : current;
    }
    if (!env.PI_MEDIA_DATA_DIR) {
        if (legacyMedia(root)) throw new Error('Legacy media is inside the application directory; inspect and migrate it before starting with external storage');
        env.PI_MEDIA_DATA_DIR = path.join(folders.data, 'media');
    }
    // Explicit legacy media remains discoverable but new installations never use code as data.
    require('./pi-local-env').normalizeEnvironment(env);
    return folders;
}
function inspect(root, env = process.env) {
    const folders = layout({ env }), issues = [], check = fn => { try { return fn(); } catch (error) { issues.push(error.message); return null; } };
    const agent = nativeAgentDir(env);
    const runtime = check(() => runtimeDirectory(root, env));
    const configuration = check(() => configFile(root, env));
    check(() => assertExternal(agent, { root, env }));
    for (const [kind, directory] of Object.entries(folders).filter(([kind]) => kind !== 'program'))
        check(() => assertExternal(directory, { root, env, managedContainer: kind === 'state' }));
    if (runtime && within(canonical(root), canonical(runtime))) issues.push('LEGACY_RUNTIME_IN_PROGRAM');
    if (configuration && within(canonical(root), canonical(configuration))) issues.push('LEGACY_CONFIG_IN_PROGRAM');
    const mediaData = env.PI_MEDIA_DATA_DIR || (legacyMedia(root) ? root : path.join(folders.data, 'media'));
    if (within(canonical(root), canonical(mediaData))) issues.push('LEGACY_MEDIA_IN_PROGRAM');
    const roots = [os.homedir(), ...String(env.PI_PROJECT_ROOTS || '').split(path.delimiter).filter(Boolean)];
    const legacyWorkspaces = [...new Set(roots.flatMap(base => [path.join(base, 'OhMyBuddyBots'), path.join(base, 'PivaneBots'), path.join(base, 'OhMyBuddy', 'Tasks')]))]
        .filter(directory => fs.existsSync(directory));
    return { version: 1, program: canonical(root), defaults: folders, instanceConfig: configuration,
        runtime, nativeAgent: agent, nativeSessions: path.join(agent, 'sessions'),
        mediaConfig: env.PI_MEDIA_CONFIG_DIR || (fs.existsSync(path.join(agent, 'media-lab')) ? path.join(agent, 'media-lab') : path.join(folders.config, 'media-lab')),
        mediaData, legacyWorkspaces, issues,
        migration: { automatic: false, requiresOfflineBackup: true, nativeSessionsRemainCanonical: true,
            preserveWorkingDirectories: true, workspaceMovesRequireNativeRelocation: true },
        cleanup: { automatic: ['verified-inactive-releases', 'verified-expired-maintenance-backups'],
            retained: ['native-identity', 'config', 'persistent-data', 'bot-workspaces', 'independent-workspaces', 'user-projects'] } };
}
module.exports = { layout, canonical, within, overlaps, assertExternal, installationId, runtimeDirectory, configFile,
    settingsFile, nativeAgentDir, workspacesRoot, prepareDirectory, applyEnvironment, inspect };
