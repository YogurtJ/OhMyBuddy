import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir } from "../../shared/utils.js";
/** Prints `$1/manifest.json` when it is a regular file, never through a symlink. */
export const PLACED_MANIFEST_READ_SCRIPT = 'p="$1/manifest.json"; test -f "$p" && test ! -L "$p" && cat "$p"';
export async function discoverPlacedBridgeManifest(access, runId, runtimeDir, missing = "The placed Pi's pi-subagents bridge manifest is not in its runtime directory; the Pi may have exited.") {
    for (let attempt = 0; attempt < 100; attempt++) {
        const result = await access.runAsync(access.shellCommand(PLACED_MANIFEST_READ_SCRIPT, [runtimeDir]), { timeout: 5_000, maxBuffer: 64 * 1024 });
        if (result.error)
            throw new Error(`Remote bridge manifest discovery failed: ${result.error.message}`, { cause: result.error });
        if (result.status === 0 && result.stdout.trim()) {
            let value;
            try {
                value = JSON.parse(result.stdout);
            }
            catch {
                throw new Error("Remote bridge manifest is malformed.");
            }
            const p = value;
            if (p.runId !== runId || typeof p.socketPath !== "string" || path.posix.dirname(p.socketPath) !== runtimeDir || typeof p.nativeSessionId !== "string" || typeof p.packageVersion !== "string" || typeof p.protocol !== "number")
                throw new Error("Remote bridge manifest identity is incomplete or outside its owned runtime directory.");
            return { socketPath: p.socketPath, nativeSessionId: p.nativeSessionId, packageVersion: p.packageVersion, protocol: p.protocol };
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(missing);
}
export async function createPlacedRuntimeDir(access, runId) { const result = await access.runAsync(access.shellCommand("umask 077; mktemp -d \"${TMPDIR:-/tmp}/pi-subagents-herdr-$1-XXXXXXXX\"", [runId]), { timeout: 10_000, maxBuffer: 4096 }); if (result.error)
    throw new Error(`Could not provision a run-private remote bridge runtime directory: ${result.error.message}`, { cause: result.error }); const value = result.stdout.trim(); if (result.status !== 0 || !path.posix.isAbsolute(value) || value.includes("\n"))
    throw new Error("Could not provision a run-private remote bridge runtime directory."); return value; }
export function removePlacedRuntimeDir(access, runtimeDir) { const result = access.run(access.shellCommand("p=$1; case \"${p##*/}\" in pi-subagents-herdr-*) test -d \"$p\" && test ! -L \"$p\" && rm -rf -- \"$p\";; *) exit 64;; esac", [runtimeDir]), { timeout: 10_000, maxBuffer: 4096 }); if (result.status !== 0 || result.stdout)
    throw new Error(`Could not remove the exact owned remote runtime directory: ${String(result.stderr).slice(0, 512)}`); }
/** The single private owner for allocation shared by every pane-native backend projection. */
export class PlacedRunOwner {
    machine;
    runId;
    runtimeDir;
    connection;
    host;
    access;
    owned;
    terminalId;
    agentName;
    startedArgv;
    identity;
    #unsubscribe = () => { };
    #snapshot = { connection: "connected", state: "ready", revision: 0 };
    #cleanupPromise;
    #removeRuntime;
    constructor(machine, runId, runtimeDir, connection, host, access, removeRuntime = () => removePlacedRuntimeDir(access, runtimeDir)) { this.machine = machine; this.runId = runId; this.runtimeDir = runtimeDir; this.connection = connection; this.#removeRuntime = removeRuntime; this.host = host; this.access = access; }
    observeEvent(event) { const data = this.host.paneEvent(event, this.#snapshot.state); if (data && (!this.terminalId || data.terminalId === this.terminalId || data.paneId === this.owned?.paneId))
        this.#snapshot = { ...this.#snapshot, revision: this.#snapshot.revision + 1, state: data.state }; }
    markConnectionUnknown(observed) { if (this.connection !== observed)
        return false; this.#snapshot = { ...this.#snapshot, connection: "unknown", state: "unknown", revision: this.#snapshot.revision + 1 }; return true; }
    async subscribe(listener, disconnected) { const observed = this.connection, paneId = this.owned?.paneId; let adopted = false, candidateLost; if (!paneId)
        throw new Error("Herdr status subscription requires a provisioned pane."); const unsubscribe = await this.host.subscribe(observed, paneId, (event) => { this.observeEvent(event); listener(event); }, (error) => { if (!adopted) {
        candidateLost ??= error;
        return;
    } if (!this.markConnectionUnknown(observed))
        return; disconnected(error); }); if (candidateLost) {
        unsubscribe();
        throw candidateLost;
    } this.#unsubscribe = unsubscribe; adopted = true; }
    /** Create the owned pane and start the agent in one host step; onPane runs once the pane exists and before the agent starts. */
    async launch(request, onPane, options = {}) {
        const { owned, terminalId } = await this.host.launch(this.connection, this.machine, this.runId, this.runtimeDir, request, async (pane) => { this.owned = pane; await onPane(pane); }, options), argv = [request.kind, ...request.args];
        this.agentName = request.name;
        this.terminalId = terminalId;
        this.startedArgv = argv;
        return { owned, terminalId, argv };
    }
    journal(identity) { this.identity = identity; this.#snapshot = { ...this.#snapshot, identity }; const journalDir = path.join(getAgentDir(), "pi-subagents", "herdr-run-journal"); fs.mkdirSync(journalDir, { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(journalDir, `${this.runId}.json`), JSON.stringify({ version: 1, identity, state: "ready", updatedAt: Date.now() }), { mode: 0o600, flag: "wx" }); }
    get snapshot() { return this.#snapshot; }
    runRemote(command, options = {}) { return this.access.run(command, options); }
    async replaceConnection(input) { const oldConnection = this.connection, oldUnsubscribe = this.#unsubscribe; this.connection = input.connection; this.#unsubscribe = input.unsubscribe; if (this.identity)
        this.identity = { ...this.identity, paneId: input.paneId }; this.#snapshot = { connection: "connected", state: input.state, identity: this.identity, revision: this.#snapshot.revision + 1 }; oldUnsubscribe(); await oldConnection.close(); }
    cleanup(closeStartedPane = true) { return this.#cleanupPromise ??= this.#performCleanup(closeStartedPane); }
    async #performCleanup(closeStartedPane) { let failure; try {
        if (closeStartedPane && this.owned)
            await this.host.closeOwnedPane(this.connection, this.owned, this.terminalId, this.agentName);
    }
    catch (error) {
        failure = error;
    } try {
        this.#unsubscribe();
        await this.connection.close();
        this.#removeRuntime();
    }
    catch (error) {
        failure ??= error;
    } this.#snapshot = { ...this.#snapshot, connection: "closed", revision: this.#snapshot.revision + 1 }; if (failure)
        throw failure; }
}
