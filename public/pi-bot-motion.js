// Ephemeral animation eligibility over the existing lifecycle projection; no business state.
((root, factory) => {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PiBotMotion = api;
})(globalThis, () => {
    const states = Object.freeze(['idle', 'thinking', 'working', 'waiting', 'done', 'failed', 'sleeping', 'greeting']);
    function create({ paint, schedule = setTimeout, cancel = clearTimeout }) {
        let current = { key: '', connected: false }, turn = null, effect = null, timer = null, generation = 0, hidden = false, disposed = false, failure = false;
        const greeted = new Set();
        const clear = () => { generation++; if (timer !== null) cancel(timer); timer = null; effect = null; };
        const base = () => !current.connected ? 'idle' : current.waiting ? 'waiting' : current.working ? 'working' : 'idle';
        const show = () => { if (!disposed) paint({ state: effect || (current.connected && failure && base() === 'idle' ? 'failed' : base()), live: current.connected && !hidden }); };
        function transient(state, duration) {
            clear(); effect = state;
            const token = generation, key = current.key;
            timer = schedule(() => {
                if (disposed || generation !== token || current.key !== key) return;
                effect = null; timer = null; show(); // Recompute, never unconditionally return to idle.
            }, duration);
            show();
        }
        return {
            update(next) {
                if (disposed) return;
                if (next.key !== current.key) { clear(); turn = null; failure = false; }
                current = next;
                if (!current.connected || current.stopping) turn = null;
                if (!current.connected || current.waiting || current.working || current.queued || current.stopping) clear();
                const greetingKey = current.greetingKey || current.key;
                if (!effect && current.greeting && current.connected && base() === 'idle' && !current.queued && !current.stopping && !hidden && !greeted.has(greetingKey)) {
                    greeted.add(greetingKey); transient('greeting', 1600); return;
                }
                show();
            },
            begin(key) { if (!disposed && current.key === key) { clear(); turn = { key, reason: null }; failure = false; show(); } },
            result(key, reason) { if (turn?.key === key) turn.reason = reason; },
            settle(key) {
                if (disposed || !turn || turn.key !== key) return;
                const reason = turn.reason; turn = null;
                if (!current.connected || current.key !== key || current.waiting || current.working || current.queued || current.stopping || hidden) return;
                if (reason === 'stop') transient('done', 1100);
                else if (reason === 'error') { clear(); failure = true; show(); }
            },
            visibility(value) { hidden = value; clear(); turn = null; show(); },
            dispose() { clear(); disposed = true; turn = null; }
        };
    }
    return Object.freeze({ states, create });
});
