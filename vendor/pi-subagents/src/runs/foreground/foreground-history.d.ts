import type { ForegroundResumeChild, ForegroundResumeRun, SubagentState } from "../../shared/types.ts";
export declare const MAX_REMEMBERED_FOREGROUND_RUNS = 50;
export declare const FOREGROUND_OWNER_EXITED_STOP_ERROR = "Subagent stopped because the Pi process that ran it exited before the run finished.";
/**
 * Saves one foreground run to its own history file. A run with a `running` child is a launch-time
 * record; the run's final save replaces it.
 */
export declare function persistForegroundRun(run: ForegroundResumeRun, options?: {
    resultsDir?: string;
    limit?: number;
}): void;
/** Drops this process's `running` record for a launch that threw, so it never loads as interrupted. */
export declare function discardRunningForegroundRun(runId: string, options?: {
    resultsDir?: string;
}): void;
/** For a record with a `running` child: its owning Pi process is gone. */
export declare function ownerConfirmedDead(run: ForegroundResumeRun): boolean;
/** State text for a remembered child; a child cut off by a Pi exit names the resume target. */
export declare function foregroundChildStateLabel(run: Pick<ForegroundResumeRun, "runId">, child: Pick<ForegroundResumeChild, "status" | "error" | "sessionFile">): string;
export declare function restoreForegroundRunHistory(state: SubagentState, options?: {
    resultsDir?: string;
    sessionId?: string | null;
    limit?: number;
    observeForeign?: (run: ForegroundResumeRun) => void;
}): number;
