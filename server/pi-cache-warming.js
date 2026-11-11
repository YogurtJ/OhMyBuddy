// Pi owns cache requests, deadlines, cancellation and native usage entries.
// OMB keeps its previous streaming default until idle warming is explicitly saved.
const MODES = Object.freeze(['off', 'streaming', 'idle']);
const registryKey = Symbol.for('ohmybuddy.cache-warming-sessions.v1');
const sessions = () => globalThis[registryKey] ??= new WeakMap();
function cacheWarmingMode(settings) {
    const mode = settings.getGlobalSettings().cacheWarming;
    return MODES.includes(mode) ? mode : 'streaming';
}
function cacheWarmingSettings(settings) {
    return new Proxy(settings, { get(target, key) {
        if (key === 'getCacheWarmingMode') return () => cacheWarmingMode(target);
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
    } });
}
function bindCacheWarmingSession(session) { sessions().set(session.sessionManager, session); }
function cacheWarmingSnapshot(manager) {
    const session = sessions().get(manager);
    if (!session || session.sessionManager !== manager) return null;
    const status = session.cacheWarmingStatus;
    if (!status || !['inactive', 'scheduled', 'refreshing'].includes(status.state)) return null;
    return { mode: cacheWarmingMode(session.settingsManager), state: status.state,
        ...(typeof status.reason === 'string' ? { reason: status.reason.slice(0, 200) } : {}),
        ...(Number.isFinite(status.nextWarmAt) ? { nextWarmAt: status.nextWarmAt } : {}),
        ...(typeof status.extensionOverride === 'boolean' ? { extensionOverride: status.extensionOverride } : {}) };
}
module.exports = { MODES, cacheWarmingMode, cacheWarmingSettings, bindCacheWarmingSession, cacheWarmingSnapshot };
