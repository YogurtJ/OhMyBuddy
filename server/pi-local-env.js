const fs = require('node:fs');

// Public OhMyBuddy spellings normalize at the application boundary. Native Pi
// identity variables remain upstream; old PIVANE_ and documented PI_ aliases work.
const WORKSPACE_VARIABLES = Object.freeze([
    'PROJECT_ROOTS', 'ALLOWED_ORIGINS', 'WEB_TOKEN', 'WEB_SECURE_COOKIE', 'WEB_IDLE_MS', 'WEB_STARTUP_TIMEOUT_MS',
    'WEB_APPROVE_PROJECTS', 'WEB_CLI', 'WEB_DEFERRED_FILE', 'WORKSPACE_BASE_URL',
    'WORKSPACE_ACCESS_TOKEN', 'MEDIA_PLANNER_MODEL', 'MEDIA_CONFIG_DIR', 'MEDIA_DATA_DIR', 'MEDIA_PROFILE'
]);
function environmentValue(env, suffix, native = WORKSPACE_VARIABLES.includes(suffix)) {
    const names = [`OHMYBUDDY_${suffix}`, `PIVANE_${suffix}`, ...(native ? [`PI_${suffix}`] : [])];
    const present = names.filter(name => env[name] !== undefined && env[name] !== '');
    if (new Set(present.map(name => env[name])).size > 1) throw new Error(`Conflicting configuration: ${present.join(' and ')}`);
    return present.length ? env[present[0]] : undefined;
}
function suffixes(env) {
    return new Set([...WORKSPACE_VARIABLES, ...Object.keys(env).filter(key => /^(?:OHMYBUDDY|PIVANE)_/.test(key)).map(key => key.replace(/^(?:OHMYBUDDY|PIVANE)_/, ''))]);
}
function normalizeEnvironment(env) {
    for (const suffix of suffixes(env)) {
        const value = environmentValue(env, suffix);
        if (value === undefined) continue;
        // Existing internal adapters intentionally retain these established names.
        env[`PIVANE_${suffix}`] = value;
        if (WORKSPACE_VARIABLES.includes(suffix)) env[`PI_${suffix}`] = value;
    }
    return env;
}
function loadLocalEnv(envPath, env = process.env) {
    normalizeEnvironment(env);
    if (env.PI_MEDIA_PROFILE === 'clean' || !fs.existsSync(envPath)) return;
    const local = {};
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) continue;
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        local[match[1]] = value;
    }
    // An inherited setting wins over every spelling in the local file. Conflicts
    // within a single source fail closed and errors never include the value.
    for (const suffix of suffixes(local)) if (environmentValue(env, suffix) !== undefined) {
        delete local[`OHMYBUDDY_${suffix}`]; delete local[`PIVANE_${suffix}`];
        if (WORKSPACE_VARIABLES.includes(suffix)) delete local[`PI_${suffix}`];
    }
    normalizeEnvironment(local);
    for (const [key, value] of Object.entries(local)) if (!env[key]) env[key] = value;
    normalizeEnvironment(env);
}
module.exports = { loadLocalEnv, normalizeEnvironment, environmentValue, WORKSPACE_VARIABLES };
