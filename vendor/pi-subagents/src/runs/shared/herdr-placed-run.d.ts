import * as net from "node:net";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { HerdrRemoteGitStatus, PlacementMachineReference } from "../../shared/types.ts";
import type { ChildSession, ChildSessionEvent, ChildSessionFactory, ChildSessionLaunch } from "./child-session.ts";
import type { ChildRuntimeConfig } from "./child-runtime-config.ts";
import { HerdrPiFrameDecoder, type HerdrPiFrame } from "./herdr-pi-protocol.ts";
import { type PlacedBridgeManifest, type PlacedRunOwner } from "./placed-run-owner.ts";
import type { PlacementBridgeIdentity, PlacementPaneHost, PlacementReconnectCheck, PlacementRunState, PlacementSockets } from "./placement-host.ts";
export interface HerdrRunIdentity {
    runId: string;
    machineId: string;
    target: string;
    session: string | null;
    workspaceId: string;
    tabId: string;
    paneId: string;
    terminalId: string;
    agentName: string;
    nativeSessionId: string;
    cwd: string;
    runtimeDir: string;
}
export interface HerdrRunSnapshot {
    connection: "connected" | "unknown" | "closed";
    state: PlacementRunState;
    identity?: HerdrRunIdentity;
    revision: number;
}
/** The pane half comes from the host; the bridge half (run, package, protocol, native session, evidence cursor) is host-neutral. */
export declare function reconcileHerdrReconnect(identity: HerdrRunIdentity, candidate: {
    bridge: PlacementBridgeIdentity;
}, lastEvidenceCursor: number, host?: Pick<PlacementPaneHost, "reconcile">): PlacementReconnectCheck;
export declare function boundedHerdrReconnect(identity: HerdrRunIdentity, lastEvidenceCursor: number, attempt: (number: number) => Promise<{
    bridge: PlacementBridgeIdentity;
}>, options?: {
    attempts?: number;
    deadlineMs?: number;
    disposed?: () => boolean;
    host?: Pick<PlacementPaneHost, "reconcile">;
}): Promise<{
    ok: true;
    state: PlacementRunState;
    paneId: string;
    cursor: number;
} | {
    ok: false;
    reason: string;
}>;
export declare function serializeHerdrPiLaunch(launch: ChildSessionLaunch): {
    args: string[];
    resources: {
        agent: string;
        skills?: string[];
        toolCeiling?: string[];
        reads?: string[] | false;
    };
};
export declare class BridgeChannel {
    #private;
    readonly socket: net.Socket;
    readonly decoder: HerdrPiFrameDecoder;
    readonly listeners: Set<(frame: HerdrPiFrame) => void>;
    readonly waiters: Map<string, {
        resolve(frame: HerdrPiFrame): void;
        reject(error: Error): void;
    }>;
    readonly runId: string;
    readonly frames: HerdrPiFrame[];
    readonly failure: Promise<never>;
    constructor(socketPath: string, runId: string);
    fail(error: Error): void;
    get failed(): boolean;
    adopt(listener: (frame: HerdrPiFrame) => void): HerdrPiFrame[];
    wait(type: string, requestId: string): Promise<HerdrPiFrame>;
    configure(resources: {
        agent: string;
        skills?: string[];
        toolCeiling?: string[];
        reads?: string[] | false;
    }): Promise<HerdrPiFrame>;
    supervisorDelivered(requestId: string): void;
    prepare(requestId: string, operation: string, text?: string, supervisorId?: string, supervisorError?: string): Promise<HerdrPiFrame>;
    close(): void;
}
export declare class HerdrPiSession<C extends PlacementSockets = PlacementSockets> implements ChildSession {
    #private;
    bridgeForward: {
        close(): Promise<void>;
    };
    bridge: BridgeChannel;
    readonly requestedTools: string[] | undefined;
    readonly model: string | undefined;
    readonly supervisorDir: string | undefined;
    readonly runtime: ChildRuntimeConfig;
    readonly owner: PlacedRunOwner<C>;
    constructor(owner: PlacedRunOwner<C>, bridgeForward: {
        close(): Promise<void>;
    }, bridge: BridgeChannel, requestedTools: string[] | undefined, model: string | undefined, runtime: ChildRuntimeConfig, initialGit?: HerdrRemoteGitStatus);
    get host(): PlacementPaneHost<C>;
    get identity(): HerdrRunIdentity;
    set identity(value: HerdrRunIdentity);
    get connection(): C;
    set connection(value: C);
    armReconnect(factory: () => Promise<void>): void;
    get evidenceCursor(): number;
    reconnect(): Promise<void>;
    replaceTransport(input: {
        connection: C;
        bridgeForward: {
            close(): Promise<void>;
        };
        bridge: BridgeChannel;
        unsubscribe: () => void;
        paneId: string;
        cursor: number;
        state: HerdrRunSnapshot["state"];
    }): Promise<void>;
    subscribe(listener: (event: ChildSessionEvent) => void): () => boolean;
    prompt(text: string): Promise<void>;
    steer(text: string): Promise<void>;
    followUp(text: string): Promise<void>;
    abort(): Promise<void>;
    dispose(): Promise<void>;
    get messages(): AgentMessage[];
    get sessionFile(): undefined;
    get sessionId(): string;
    get modelId(): string | undefined;
    get machineEvidence(): {
        final?: HerdrRemoteGitStatus | undefined;
        initial?: HerdrRemoteGitStatus | undefined;
        provider: "herdr" | "rex";
        machineId: string;
    };
    get placementSnapshot(): HerdrRunSnapshot;
}
export declare function reconnectHerdrPiSession<C extends PlacementSockets>(session: HerdrPiSession<C>, launch: ChildSessionLaunch, dependencies?: {
    connect?: (machine: PlacementMachineReference) => Promise<C>;
    discoverManifest?: (runId: string, runtimeDir: string) => Promise<PlacedBridgeManifest>;
    createBridge?: (socketPath: string, runId: string) => BridgeChannel;
}): Promise<void>;
export declare function createHerdrPiSession(launch: ChildSessionLaunch): Promise<ChildSession>;
/** A Rex machine: the same bridge session, with the Rex pane host and local (`machine: "local"`) or SSH machine access. */
export declare function createRexPiSession(launch: ChildSessionLaunch): Promise<ChildSession>;
export declare function createPlacementAwareChildSessionFactory(local: ChildSessionFactory, createRemote?: (launch: ChildSessionLaunch) => Promise<ChildSession>): ChildSessionFactory;
