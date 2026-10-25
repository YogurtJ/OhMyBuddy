import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import { type AsyncJobState, type AsyncWidgetLayout, type ControlEvent, type SubagentState } from "../../shared/types.ts";
import type { RawDrainStatusObserver } from "../shared/readonly-drain-observation.ts";
import type { ResultDeliveryOwnership } from "./result-delivery-ownership.ts";
interface AsyncJobTrackerOptions {
    completionRetentionMs?: number;
    /** Slow safety sweep for liveness repair when filesystem events are missed. */
    pollIntervalMs?: number;
    resultsDir?: string;
    widgetEnabled?: boolean;
    widgetCollapsed?: boolean;
    widgetLayout?: AsyncWidgetLayout;
    platform?: NodeJS.Platform;
    onJobTerminal?: (job: AsyncJobState) => void;
    onJobCleanup?: (asyncId: string) => void;
    /** Lets a run whose launching Pi exited hold its publication in the session that owns it. */
    deliveryOwnerId?: ResultDeliveryOwnership["deliveryOwnerId"];
    watch?: typeof fs.watch;
    kill?: (pid: number, signal?: NodeJS.Signals | 0) => boolean;
    now?: () => number;
    /** Resolve native supervisor requests without scanning supervisor mailboxes. */
    supervisorRequestState?: (event: ControlEvent) => "pending" | "resolved" | "unknown";
    /** Called whenever the tracked jobs changed enough to re-render the widget. */
    onJobsChanged?: () => void;
}
export declare function createAsyncJobTracker(pi: Pick<ExtensionAPI, "events">, state: SubagentState, asyncDirRoot: string, options?: AsyncJobTrackerOptions): {
    ensurePoller: () => void;
    refreshWidget: (ctx: ExtensionContext) => void;
    handleStarted: (data: unknown) => void;
    handleComplete: (data: unknown) => void;
    resetJobs: (ctx?: ExtensionContext) => void;
    /** `observeStatus` also sees the statuses of other sessions' runs that the listing skips. */
    restoreActiveJobs: (ctx?: ExtensionContext, observeStatus?: RawDrainStatusObserver) => void;
    dispose: () => void;
};
export {};
