import type { PlacementMachineReference, RexMachineReference } from "../../shared/types.ts";
import type { HerdrRunIdentity } from "./herdr-placed-run.ts";
import { PlacedRunOwner } from "./placed-run-owner.ts";
import { type PlacementEvidenceProof, type PlacementMachineAccess, type PlacementOwnedPane, type PlacementReconnectCheck, type PlacementSockets } from "./placement-host.ts";
/** On a Rex SSH machine, placed tabs open in the one session with this label. */
export declare const REX_SSH_SESSION_LABEL = "subagents";
interface RexEndpoint {
    access: PlacementMachineAccess;
    bin: string;
    session: string;
    server?: string;
}
export interface RexConnection extends RexEndpoint, PlacementSockets {
}
export interface RexPaneCandidate {
    present: boolean;
    foregroundPid?: number;
    bridgePid?: number;
}
/** The server must confirm the recorded session; a missing session fails closed. A Rex SSH machine's session is the one recorded at launch. */
export declare function connectRex(machine: PlacementMachineReference, options?: {
    bin?: string;
    access?: PlacementMachineAccess;
    session?: string;
}): Promise<RexConnection>;
/** Ownership is the never-reused block id in the recorded session. The block counts as closed only once `block inspect` exits 3. */
export declare function closeOwnedRexPane(connection: RexConnection, owned: PlacementOwnedPane): Promise<void>;
declare function reconcileRexPlacedRun(identity: HerdrRunIdentity, candidate: RexPaneCandidate, proveEvidence: () => PlacementEvidenceProof): PlacementReconnectCheck;
/**
 * Rex pane host: rex CLI calls on this machine, always with an explicit session. A local child opens as a background
 * window in the parent's session; a Rex SSH child in the remote `subagents` session, with every rex call run over SSH.
 * Pi starts through the login shell's environment (as Rex starts any window) with the bridge variables set by
 * /usr/bin/env. There is no status subscription: a dead Pi closes the bridge socket (directly, or through the SSH
 * forward), and the reconnect that follows checks the block with `rex block call process` and fails closed.
 */
export declare const rexPaneHost: {
    connect: typeof connectRex;
    sessionOf(connection: RexConnection): string;
    launch(connection: RexConnection, machine: PlacementMachineReference, runId: string, _runtimeDir: string, request: import("./placement-host.ts").PlacementLaunchRequest, onPane: (owned: PlacementOwnedPane) => Promise<void>): Promise<{
        owned: {
            workspaceId: string;
            tabId: string;
            paneId: string;
        };
        terminalId: string;
    }>;
    prompt(connection: RexConnection, identity: HerdrRunIdentity, text: string): Promise<void>;
    subscribe(): Promise<() => void>;
    paneEvent(): undefined;
    panes(connection: RexConnection, identity: HerdrRunIdentity): Promise<RexPaneCandidate>;
    reconcile: typeof reconcileRexPlacedRun;
    closeOwnedPane: typeof closeOwnedRexPane;
};
/** The placed-run owner bound to Rex and the pane machine's access. */
export declare class RexPlacedRunOwner extends PlacedRunOwner<RexConnection, RexMachineReference> {
    private constructor();
    /** A Rex SSH owner's machine carries the resolved remote cwd, and its host reconnects only to the session recorded here. */
    static create(machine: RexMachineReference, runId: string, options?: {
        sshAccess?: PlacementMachineAccess;
    }): Promise<RexPlacedRunOwner>;
}
export {};
