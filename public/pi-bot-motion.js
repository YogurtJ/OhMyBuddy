// Ephemeral presentation over the existing lifecycle projection; never a second business state.
((root, factory) => {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PiBotMotion = api;
})(globalThis, () => {
    const states = Object.freeze(['idle', 'thinking', 'working', 'waiting', 'done', 'failed', 'sleeping', 'greeting']);
    function create({ paint, schedule = setTimeout, cancel = clearTimeout, sleepAfter = 300000 }) {
        let current = { key: '', connected: false }, turn = null, effect = null, timer = null, generation = 0;
        let hidden = false, disposed = false, failure = false, sleepTimer = null, sleeping = false, sleepGeneration = 0;
        const greeted = new Set();
        const clear = () => { generation++; if (timer !== null) cancel(timer); timer = null; effect = null; };
        const wake = () => { sleepGeneration++; if (sleepTimer !== null) cancel(sleepTimer); sleepTimer = null; sleeping = false; };
        const base = () => !current.connected ? 'idle' : current.waiting ? 'waiting' : current.working ? (current.thinking ? 'thinking' : 'working') : 'idle';
        const eligible = () => current.connected && current.sleepAllowed && !hidden && !failure && !turn && !effect
            && base() === 'idle' && !current.queued && !current.stopping;
        function show() {
            if (disposed) return;
            if (!eligible()) wake();
            else if (sleepTimer === null && !sleeping) {
                const key = current.key, token = sleepGeneration;
                sleepTimer = schedule(() => {
                    if (disposed || sleepGeneration !== token || current.key !== key) return;
                    sleepTimer = null;
                    if (eligible()) { sleeping = true; show(); }
                }, sleepAfter);
            }
            paint({ state: effect || (current.connected && failure && base() === 'idle' ? 'failed' : sleeping ? 'sleeping' : base()), live: current.connected && !hidden });
        }
        function transient(state, duration) {
            clear(); wake(); effect = state;
            const token = generation, key = current.key;
            timer = schedule(() => {
                if (disposed || generation !== token || current.key !== key) return;
                effect = null; timer = null; show();
            }, duration);
            show();
        }
        return {
            update(next) {
                if (disposed) return;
                if (next.key !== current.key) { clear(); wake(); turn = null; failure = false; }
                current = next;
                if (!current.connected || current.stopping) turn = null;
                if (!current.connected || current.waiting || current.working || current.queued || current.stopping) clear();
                const greetingKey = current.greetingKey || current.key;
                if (!effect && current.greeting && current.connected && base() === 'idle' && !current.queued && !current.stopping && !hidden && !greeted.has(greetingKey)) {
                    greeted.add(greetingKey); transient('greeting', 1100); return;
                }
                show();
            },
            begin(key) { if (!disposed && current.key === key) { clear(); wake(); turn = { key, reason: null }; failure = false; show(); } },
            result(key, reason) { if (turn?.key === key) turn.reason = reason; },
            settle(key) {
                if (disposed || !turn || turn.key !== key) return;
                const reason = turn.reason; turn = null;
                if (!current.connected || current.key !== key || current.waiting || current.working || current.queued || current.stopping || hidden) return;
                if (reason === 'stop') transient('done', 1100);
                else if (reason === 'error') { clear(); failure = true; show(); }
                else show();
            },
            interact() { if (!disposed) { wake(); show(); } },
            visibility(value) { hidden = value; clear(); wake(); turn = null; show(); },
            dispose() { clear(); wake(); disposed = true; turn = null; }
        };
    }
    return Object.freeze({ states, create });
});
