import type { ForegroundResumeRun } from "../../shared/types.ts";
import type { RawDrainStatusObserver } from "../shared/readonly-drain-observation.ts";
interface InterruptedElsewhereCollector {
    /** Observer for the async statuses session start already reads; keeps foreign ones that may be interrupted. */
    observeStatus: RawDrainStatusObserver;
    /** Receives the foreground records of other sessions that session start already reads. */
    observeForegroundRun: (run: ForegroundResumeRun) => void;
    /** One line per other session that can be reopened and has runs whose Pi is dead. */
    lines: () => string[];
}
/**
 * Collects runs of other sessions in this folder that were cut off because their Pi died, from what
 * session start reads anyway. Read-only: nothing is written to those runs or sessions. The cheap
 * filters run as records arrive; `lines` reads each session file's header once, then probes each
 * candidate's pid once.
 */
export declare function createInterruptedElsewhereCollector(input: {
    currentSessionId: string;
    cwd: string;
    now: number;
}): InterruptedElsewhereCollector;
export {};
