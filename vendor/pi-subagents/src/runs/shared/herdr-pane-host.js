import { createHash } from "node:crypto";
import { connectHerdrMachine, sshMachineAccess } from "./herdr-connection.js";
import { HERDR_PI_MODE_ENV, HERDR_PI_RUN_ENV, HERDR_PI_RUNTIME_DIR_ENV } from "./herdr-pi-protocol.js";
import { createPlacedRuntimeDir, discoverPlacedBridgeManifest, PlacedRunOwner, removePlacedRuntimeDir } from "./placed-run-owner.js";
import { herdrPaneAllocationKey, withHerdrPaneAllocationLock } from "./placement-host.js";
function herdrRunState(status, fallback = "unknown") {
    return status === "working" ? "working" : status === "blocked" ? "blocked" : status === "idle" || status === "done" ? "settled" : status === "unknown" ? "unknown" : fallback;
}
export function herdrStatusSubscriptions(paneId) {
    return [{ type: "pane.agent_status_changed", pane_id: paneId }, { type: "pane.closed" }, { type: "pane.moved" }];
}
export function reconcileHerdrPlacedRun(identity, candidate, proveEvidence) {
    if (candidate.endpoint.session !== identity.session)
        return { ok: false, reason: "Herdr session changed during reconnect." };
    const matches = candidate.agents.filter((agent) => agent.terminal_id === identity.terminalId);
    if (matches.length !== 1 || typeof matches[0].pane_id !== "string")
        return { ok: false, reason: matches.length ? "Terminal identity is ambiguous." : "Owned terminal is missing." };
    const proof = proveEvidence();
    if (!proof.ok)
        return proof;
    return { ok: true, state: herdrRunState(matches[0].agent_status), paneId: matches[0].pane_id, cursor: proof.cursor };
}
function idOf(value, key) { const found = value && typeof value === "object" ? value[key] : undefined; if (typeof found !== "string" || !found)
    throw new Error(`Herdr did not return ${key}.`); return found; }
function list(value, key) { if (Array.isArray(value))
    return value; const found = value && typeof value === "object" ? value[key] : undefined; return Array.isArray(found) ? found : []; }
function tagged(value, type, key) { if (!value || typeof value !== "object" || value.type !== type || !(key in value) || typeof value[key] !== "object")
    throw new Error(`Herdr returned an invalid ${type} envelope.`); return value[key]; }
export function parseHerdrCreated(value, type) { const envelope = value; if (envelope?.type !== type)
    throw new Error(`Herdr returned an invalid ${type} envelope.`); const tab = envelope.tab; const pane = envelope.root_pane; return { ...(type === "workspace_created" ? { workspaceId: idOf(envelope.workspace, "workspace_id") } : {}), tabId: idOf(tab, "tab_id"), paneId: idOf(pane, "pane_id") }; }
export function parseHerdrAgent(value, type) { return tagged(value, type, "agent"); }
export function parseHerdrSessionSnapshot(value) { return tagged(value, "session_snapshot", "snapshot"); }
export function ownsHerdrPane(agent, terminalId, paneId) { return agent.terminal_id === terminalId && agent.pane_id === paneId; }
function snapshotAgents(snapshot) { return list(snapshot, "agents").filter((agent) => Boolean(agent && typeof agent === "object")).map((agent) => ({ terminal_id: typeof agent.terminal_id === "string" ? agent.terminal_id : undefined, pane_id: typeof agent.pane_id === "string" ? agent.pane_id : undefined, agent_status: typeof agent.agent_status === "string" ? agent.agent_status : undefined })); }
export const HERDR_MAX_OWNED_PANES = 20;
export async function provisionHerdrPane(client, cwd, runId, runtimeDir, environment, allocationKey = cwd) {
    return withHerdrPaneAllocationLock(allocationKey, async () => {
        const snapshot = parseHerdrSessionSnapshot(await client.call("session.snapshot"));
        const panes = list(snapshot, "panes").filter((item) => Boolean(item && typeof item === "object")), workspaces = list(snapshot, "workspaces").filter((item) => Boolean(item && typeof item === "object"));
        const ownedLabel = `pi-subagents-${createHash("sha256").update(cwd).digest("hex").slice(0, 10)}`, owned = workspaces.filter((item) => item.label === ownedLabel);
        if (owned.length > 1)
            throw new Error("Herdr deterministic owned workspace identity is ambiguous.");
        const cwdWorkspaceIds = new Set(panes.filter((item) => item.cwd === cwd || item.foreground_cwd === cwd).map((item) => item.workspace_id).filter((id) => typeof id === "string")), cwdWorkspaces = workspaces.filter((item) => typeof item.workspace_id === "string" && cwdWorkspaceIds.has(item.workspace_id));
        const selected = owned[0] ?? (cwdWorkspaces.length === 1 ? cwdWorkspaces[0] : undefined), selectedId = selected ? idOf(selected, "workspace_id") : undefined, actual = selectedId ? panes.filter((pane) => pane.workspace_id === selectedId).length : 0;
        if (actual >= HERDR_MAX_OWNED_PANES)
            throw new Error(`Herdr workspace pane limit of ${HERDR_MAX_OWNED_PANES} is reached; close an existing pane before launching another placed run.`);
        const env = environment ?? { [HERDR_PI_MODE_ENV]: "1", [HERDR_PI_RUN_ENV]: runId, [HERDR_PI_RUNTIME_DIR_ENV]: runtimeDir };
        if (selectedId) {
            const tab = parseHerdrCreated(await client.call("tab.create", { workspace_id: selectedId, cwd, label: `subagent-${runId.slice(-8)}`, env, focus: false }), "tab_created");
            return { workspaceId: selectedId, tabId: tab.tabId, paneId: tab.paneId };
        }
        const workspace = parseHerdrCreated(await client.call("workspace.create", { cwd, label: ownedLabel, env, focus: false }), "workspace_created");
        return { workspaceId: workspace.workspaceId, tabId: workspace.tabId, paneId: workspace.paneId };
    });
}
function provisionHerdrOwnedPane(connection, machine, runId, runtimeDir, environment) { return provisionHerdrPane(connection.client, machine.cwd, runId, runtimeDir, environment, herdrPaneAllocationKey(machine.target, connection.endpoint.session, machine.cwd)); }
function asHerdrMachine(machine) { if (machine.provider !== "herdr")
    throw new Error("The Herdr pane host only places runs on Herdr saved machines."); return machine; }
async function startHerdrAgent(connection, owned, kind, name, args, options = {}) {
    const clock = options.clock ?? { now: () => Date.now(), wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }, deadline = clock.now() + (options.timeoutMs ?? 5_000), pollMs = options.pollMs ?? 50;
    let response;
    for (;;) {
        try {
            response = await connection.client.call("agent.start", { name, kind, pane_id: owned.paneId, args, timeout_ms: 45_000 }, 60_000);
            break;
        }
        catch (error) {
            if (!(error instanceof Error) || !error.message.includes("is not an available shell"))
                throw error;
            const pane = tagged(await connection.client.call("pane.get", { pane_id: owned.paneId }), "pane_info", "pane");
            if (pane.pane_id !== owned.paneId || pane.workspace_id !== owned.workspaceId || pane.tab_id !== owned.tabId)
                throw new Error("Herdr startup pane identity changed after a transient start rejection.", { cause: error });
            if (pane.agent != null || pane.agent_session != null)
                throw new Error("Herdr startup pane became occupied after a transient start rejection.", { cause: error });
            if (clock.now() >= deadline)
                throw new Error("Herdr owned pane remained unavailable until the startup deadline.", { cause: error });
            await clock.wait(Math.min(pollMs, deadline - clock.now()));
        }
    }
    const started = parseHerdrAgent(response, "agent_started"), terminalId = idOf(started, "terminal_id"), paneId = idOf(started, "pane_id");
    if (paneId !== owned.paneId)
        throw new Error("Herdr started the native agent in an unexpected pane.");
    return { terminalId, paneId };
}
async function closeOwnedHerdrPane(connection, owned, terminalId, agentName) {
    let closed = false;
    if (terminalId && agentName) {
        const current = parseHerdrAgent(await connection.client.call("agent.get", { target: agentName }), "agent_info");
        if (ownsHerdrPane(current, terminalId, owned.paneId)) {
            await connection.client.call("pane.close", { pane_id: owned.paneId });
            closed = true;
        }
    }
    if (!closed) {
        const snapshot = parseHerdrSessionSnapshot(await connection.client.call("session.snapshot"));
        const occupants = snapshotAgents(snapshot).filter((agent) => agent.pane_id === owned.paneId);
        if (occupants.length !== 0)
            throw new Error("Refusing cleanup because startup pane ownership is uncertain.");
        await connection.client.call("pane.close", { pane_id: owned.paneId });
    }
}
/** Herdr pane host: Herdr RPC over the SSH-forwarded Herdr socket. Ownership is the Herdr terminal_id/pane_id pair; run state comes from agent_status. */
export const herdrPaneHost = {
    connect(machine) { return connectHerdrMachine(asHerdrMachine(machine)); },
    sessionOf(connection) { return connection.endpoint.session; },
    async launch(connection, machine, runId, runtimeDir, request, onPane, options) { const owned = await provisionHerdrOwnedPane(connection, asHerdrMachine(machine), runId, runtimeDir, request.environment); await onPane(owned); const { terminalId } = await startHerdrAgent(connection, owned, request.kind, request.name, request.args, options); return { owned, terminalId }; },
    async prompt(connection, identity, text) { await connection.client.call("agent.prompt", { target: identity.agentName, text }); },
    subscribe(connection, paneId, listener, onDisconnect) { return connection.client.subscribe(herdrStatusSubscriptions(paneId), listener, onDisconnect); },
    paneEvent(event, fallback) { const data = event && typeof event === "object" ? event.data : undefined; return data ? { terminalId: data.terminal_id, paneId: data.pane_id, state: herdrRunState(data.agent_status, fallback) } : undefined; },
    async panes(connection) { return { endpoint: connection.endpoint, agents: snapshotAgents(parseHerdrSessionSnapshot(await connection.client.call("session.snapshot"))) }; },
    reconcile: reconcileHerdrPlacedRun,
    closeOwnedPane: closeOwnedHerdrPane,
};
/** SSH entry points for the host-neutral runtime-dir and manifest helpers. */
export function discoverBridgeManifest(machine, runId, runtimeDir, options = {}) { return discoverPlacedBridgeManifest(sshMachineAccess(machine, options), runId, runtimeDir); }
export function createRemoteRuntimeDir(machine, runId, options = {}) { return createPlacedRuntimeDir(sshMachineAccess(machine, options), runId); }
export function removeRemoteRuntimeDir(machine, runtimeDir, options = {}) { removePlacedRuntimeDir(sshMachineAccess(machine, options), runtimeDir); }
/** The placed-run owner bound to Herdr and SSH access, plus the separate provision and start steps the external CLI adapters use. */
export class HerdrPlacedRunOwner extends PlacedRunOwner {
    constructor(machine, runId, runtimeDir, connection, removeRuntime) { super(machine, runId, runtimeDir, connection, herdrPaneHost, sshMachineAccess(machine), removeRuntime); }
    static async create(machine, runId, beforePane) { const runtimeDir = await createRemoteRuntimeDir(machine, runId); let connection; try {
        connection = await herdrPaneHost.connect(machine);
        const owner = new HerdrPlacedRunOwner(machine, runId, runtimeDir, connection);
        await beforePane?.(owner);
        return owner;
    }
    catch (error) {
        const cleanupErrors = [];
        try {
            await connection?.close();
        }
        catch (cleanupError) {
            cleanupErrors.push(cleanupError);
        }
        try {
            removeRemoteRuntimeDir(machine, runtimeDir);
        }
        catch (cleanupError) {
            cleanupErrors.push(cleanupError);
        }
        if (cleanupErrors.length)
            throw new AggregateError([error, ...cleanupErrors], "Herdr owner creation failed and cleanup also failed.", { cause: error });
        throw error;
    } }
    async provision(environment) { this.owned = await provisionHerdrOwnedPane(this.connection, this.machine, this.runId, this.runtimeDir, environment); return this.owned; }
    async start(kind, name, args, options = {}) {
        if (!this.owned)
            throw new Error("Herdr placement owner has not provisioned its pane.");
        const { terminalId, paneId } = await startHerdrAgent(this.connection, this.owned, kind, name, args, options), argv = [kind, ...args];
        this.agentName = name;
        this.terminalId = terminalId;
        this.startedArgv = argv;
        return { terminalId, paneId, argv };
    }
}
