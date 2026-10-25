import { type AsyncParallelGroupStatus, type AsyncStatus, type SubagentRunMode } from "../../shared/types.ts";
import { type NestedRoute } from "../shared/nested-events.ts";
import type { RawDrainStatusObserver } from "../shared/readonly-drain-observation.ts";
export type PidLiveness = "alive" | "dead" | "unknown";
type KillFn = (pid: number, signal?: NodeJS.Signals | 0) => boolean;
interface StartedRunMetadata {
    runId: string;
    pid?: number;
    sessionId?: string;
    completionOwnerId?: string;
    mode?: SubagentRunMode;
    agents?: string[];
    chainStepCount?: number;
    parallelGroups?: AsyncParallelGroupStatus[];
    startedAt?: number;
    sessionFile?: string;
    sessionName?: string;
}
interface ReconcileAsyncRunOptions {
    resultsDir?: string;
    kill?: KillFn;
    now?: () => number;
    startedRun?: StartedRunMetadata;
    missingStatusGraceMs?: number;
    staleAlivePidMs?: number;
    pidNamespaceScope?: () => string | undefined;
    bootId?: () => string | undefined;
    /**
     * This process's completion owner, for an owner-exited workflow repair to adopt so the session that
     * reopened it delivers its notice. Only callers whose session owns the run pass it.
     */
    adoptCompletionOwnerId?: string;
}
interface ReconcileAsyncRunResult {
    status: AsyncStatus | null;
    repaired: boolean;
    resultPath?: string;
    message?: string;
}
export declare function reconcileNestedAsyncDescendants(route: NestedRoute, options?: ReconcileAsyncRunOptions): void;
export declare function checkPidLiveness(pid: number, kill?: KillFn, probeZombie?: boolean): PidLiveness;
export interface RecordedPid {
    pid: number;
    pidNamespaceScope?: string;
    bootId?: string;
}
export declare function isRecordedPid(value: unknown): value is RecordedPid;
export interface RecordedPidObservation {
    observedScope: string | undefined;
    observedBootId: string | undefined;
    kill?: KillFn;
    /** Replaces the default `checkPidLiveness` probe. */
    probe?: (pid: number) => PidLiveness;
}
/**
 * Liveness of a pid saved in a status file. A pid saved under another boot is dead without a
 * probe, but only when both sides are in the same pid namespace or neither records one: a
 * macOS host reading a Linux container's runs must not compare their boot ids.
 */
export declare function checkRecordedPidLiveness(recorded: RecordedPid, observation?: RecordedPidObservation): PidLiveness;
export declare function reconcileAsyncRun(asyncDir: string, options?: ReconcileAsyncRunOptions, observeStatus?: RawDrainStatusObserver): ReconcileAsyncRunResult;
export {};
