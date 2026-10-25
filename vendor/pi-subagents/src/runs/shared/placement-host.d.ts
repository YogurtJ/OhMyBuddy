import type { PlacementMachineReference } from "../../shared/types.ts";
import type { HerdrRunIdentity } from "./herdr-placed-run.ts";
export type PlacementRunState = "ready" | "working" | "blocked" | "settled" | "unknown";
export type PlacementAgentKind = "pi" | "claude" | "cursor" | "codex";
export interface PlacementOwnedPane {
    workspaceId: string;
    tabId: string;
    paneId: string;
}
export interface PlacementBridgeIdentity {
    runId?: string;
    nativeSessionId?: string;
    packageVersion?: string;
    protocol?: number;
    evidenceCursor?: number;
    evidenceFloor?: number;
}
export type PlacementEvidenceProof = {
    ok: true;
    cursor: number;
} | {
    ok: false;
    reason: string;
};
export type PlacementReconnectCheck = {
    ok: true;
    state: PlacementRunState;
    paneId: string;
    cursor: number;
} | {
    ok: false;
    reason: string;
};
export interface PlacementStartOptions {
    timeoutMs?: number;
    pollMs?: number;
    clock?: {
        now(): number;
        wait(ms: number): Promise<void>;
    };
}
/** What to start in a new pane; the pane is created in the machine's cwd with this environment. */
export interface PlacementLaunchRequest {
    kind: PlacementAgentKind;
    name: string;
    args: string[];
    environment?: Record<string, string>;
}
export interface PlacementCommandOptions {
    timeout?: number;
    maxBuffer?: number;
}
export interface PlacementCommandResult {
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
}
export interface PlacementSocketForward {
    socketPath: string;
    close(): Promise<void>;
}
/** Unix sockets on the pane machine made reachable from the parent; close() ends every forward opened through it. */
export interface PlacementSockets {
    forwardRemoteSocket(remotePath: string, name: string): Promise<PlacementSocketForward>;
    close(): Promise<void>;
}
/** Runs commands on, and reaches unix sockets on, the machine that hosts the pane: over SSH (`sshMachineAccess`) or directly (`localMachineAccess`). */
export interface PlacementMachineAccess {
    shellCommand(script: string, args?: string[]): string;
    run(command: string, options?: PlacementCommandOptions): PlacementCommandResult;
    runAsync(command: string, options?: PlacementCommandOptions): Promise<PlacementCommandResult>;
    openSockets(): PlacementSockets;
}
/** Every pane operation a placed native run and its owner need. The connection carries the host's socket forwarding; P is the host's reconnect view of its panes. */
export interface PlacementPaneHost<C extends PlacementSockets = PlacementSockets, P extends object = object> {
    connect(machine: PlacementMachineReference): Promise<C>;
    sessionOf(connection: C): string | null;
    /** Create the pane and start the agent in it; call onPane after the pane exists and before the agent starts. */
    launch(connection: C, machine: PlacementMachineReference, runId: string, runtimeDir: string, request: PlacementLaunchRequest, onPane: (owned: PlacementOwnedPane) => Promise<void>, options?: PlacementStartOptions): Promise<{
        owned: PlacementOwnedPane;
        terminalId: string;
    }>;
    prompt(connection: C, identity: HerdrRunIdentity, text: string): Promise<void>;
    subscribe(connection: C, paneId: string, listener: (event: unknown) => void, onDisconnect: (error: Error) => void): Promise<() => void>;
    paneEvent(event: unknown, fallback: PlacementRunState): {
        terminalId: unknown;
        paneId: unknown;
        state: PlacementRunState;
    } | undefined;
    panes(connection: C, identity: HerdrRunIdentity): Promise<P>;
    reconcile(identity: HerdrRunIdentity, panes: P, proveEvidence: () => PlacementEvidenceProof): PlacementReconnectCheck;
    closeOwnedPane(connection: C, owned: PlacementOwnedPane, terminalId: string | undefined, agentName: string | undefined): Promise<void>;
}
export declare function herdrPaneAllocationKey(target: string, session: string | null, cwd: string): string;
export declare function withHerdrPaneAllocationLock<T>(key: string, action: () => Promise<T>, options?: {
    timeoutMs?: number;
    pollMs?: number;
}): Promise<T>;
