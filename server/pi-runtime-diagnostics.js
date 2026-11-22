const { outputRedactor } = require('./pi-update-output');
const MAX_ROWS = 50, MAX_MESSAGE = 2000, MAX_BYTES = 32 * 1024;
const installed = new WeakSet();

// Diagnostics are a bounded, disposable view of this runtime, never session entries.
function diagnosticRows(values, redact = text => text) {
    const rows = []; let bytes = 2;
    for (const value of Array.isArray(values) ? values.slice(0, MAX_ROWS) : []) {
        if (!['error', 'warning', 'info'].includes(value?.type) || typeof value.message !== 'string') continue;
        const message = redact(value.message.slice(0, 16384)).slice(0, MAX_MESSAGE);
        if (!message.trim()) continue;
        const row = { type: value.type, message };
        bytes += Buffer.byteLength(JSON.stringify(row)) + (rows.length ? 1 : 0);
        if (bytes > MAX_BYTES) break;
        rows.push(row);
    }
    return rows;
}

// Pi 1.6 calls this public method after runtime replacement. Consume the startup
// batch here too, so warnings do not repeat when the first replacement happens.
function installRuntimeDiagnostics(runtime, { token, emit, write = text => process.stderr.write(text), env = process.env }) {
    if (installed.has(runtime)) return;
    installed.add(runtime);
    const take = runtime.takeUnreportedDiagnostics.bind(runtime), redact = outputRedactor(env);
    runtime.takeUnreportedDiagnostics = () => {
        const values = take();
        const diagnostics = diagnosticRows(values, redact);
        if (diagnostics.length && token) emit({ type: 'ohmybuddy_runtime_diagnostics', token,
            sessionId: runtime.session.sessionManager.getSessionId(), diagnostics });
        return values;
    };
    for (const row of diagnosticRows(runtime.takeUnreportedDiagnostics(), redact)) write(`${row.type}: ${row.message}\n`);
}

class PiRuntimeDiagnostics {
    constructor(worker) { this.worker = worker; this.rows = []; }
    handle(event) {
        if (event.type !== 'ohmybuddy_runtime_diagnostics') return false;
        const worker = this.worker;
        // Consume unknown and late private frames even when they cannot be accepted.
        if (worker.exited || event.token !== worker.navigationToken || !/^[a-f0-9-]{36}$/.test(event.sessionId || '')
            || !worker.noSession && event.sessionId !== worker.sessionId) return true;
        const rows = diagnosticRows(event.diagnostics);
        const merged = new Map([...this.rows, ...rows].map(row => [JSON.stringify(row), row]));
        this.rows = diagnosticRows([...merged.values()].slice(-MAX_ROWS));
        worker._broadcast({ type: 'gateway_runtime_diagnostics', diagnostics: this.snapshot() });
        return true;
    }
    snapshot() { return this.rows.map(row => ({ ...row })); }
}
module.exports = { diagnosticRows, installRuntimeDiagnostics, PiRuntimeDiagnostics };
