import type { PlacementMachineReference } from "../../shared/types.ts";
import type { HerdrRunIdentity, HerdrRunSnapshot } from "./herdr-placed-run.ts";
import type { PlacementCommandOptions, PlacementLaunchRequest, PlacementMachineAccess, PlacementOwnedPane, PlacementPaneHost, PlacementSockets, PlacementStartOptions } from "./placement-host.ts";
export interface PlacedBridgeManifest {
    socketPath: string;
    nativeSessionId: string;
    packageVersion: string;
    protocol: number;
}
/** Prints `$1/manifest.json` when it is a regular file, never through a symlink. */
export declare const PLACED_MANIFEST_READ_SCRIPT = "p=\"$1/manifest.json\"; test -f \"$p\" && test ! -L \"$p\" && cat \"$p\"";
export declare function discoverPlacedBridgeManifest(access: PlacementMachineAccess, runId: string, runtimeDir: string, missing?: string): Promise<PlacedBridgeManifest>;
export declare function createPlacedRuntimeDir(access: PlacementMachineAccess, runId: string): Promise<string>;
export declare function removePlacedRuntimeDir(access: PlacementMachineAccess, runtimeDir: string): void;
/** The single private owner for allocation shared by every pane-native backend projection. */
export declare class PlacedRunOwner<C extends PlacementSockets, M extends PlacementMachineReference = PlacementMachineReference> {
    #private;
    readonly machine: M;
    readonly runId: string;
    readonly runtimeDir: string;
    connection: C;
    readonly host: PlacementPaneHost<C>;
    readonly access: PlacementMachineAccess;
    owned?: PlacementOwnedPane;
    terminalId?: string;
    agentName?: string;
    startedArgv?: string[];
    identity?: HerdrRunIdentity;
    protected constructor(machine: M, runId: string, runtimeDir: string, connection: C, host: PlacementPaneHost<C>, access: PlacementMachineAccess, removeRuntime?: () => void);
    observeEvent(event: unknown): void;
    markConnectionUnknown(observed: C): boolean;
    subscribe(listener: (event: unknown) => void, disconnected: (error: Error) => void): Promise<void>;
    /** Create the owned pane and start the agent in one host step; onPane runs once the pane exists and before the agent starts. */
    launch(request: PlacementLaunchRequest, onPane: (owned: PlacementOwnedPane) => Promise<void>, options?: PlacementStartOptions): Promise<{
        owned: PlacementOwnedPane;
        terminalId: string;
        argv: string[];
    }>;
    journal(identity: HerdrRunIdentity): void;
    get snapshot(): HerdrRunSnapshot;
    runRemote(command: string, options?: PlacementCommandOptions): import("./placement-host.ts").PlacementCommandResult;
    replaceConnection(input: {
        connection: C;
        unsubscribe: () => void;
        paneId: string;
        state: HerdrRunSnapshot["state"];
    }): Promise<void>;
    cleanup(closeStartedPane?: boolean): Promise<void>;
}
