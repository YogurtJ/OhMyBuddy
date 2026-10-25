import { type PidLiveness, type RecordedPid } from "../runs/background/stale-run-reconciler.ts";
/**
 * Who continues a stopped workflow run. Claims are generation files `resumed-by.<n>.json` in the
 * stopped run's directory, and the highest n is the current claim. A claimant whose process is dead
 * is superseded by creating the next generation, so a takeover never moves a file another taker
 * may have just created. An owner whose launch did not start renames its own claim to
 * `resumed-by.<n>.json.released-<uuid>`; a released top means no claim, and the next taker creates
 * n+1, so claims below it are never judged again. Only the owner launches; once the claimed new
 * run's status.json exists the claim is permanent.
 */
interface WorkflowResumeClaim extends RecordedPid {
    version: 1;
    claimedAt: number;
    newRunId: string;
    trigger: "auto" | "manual" | "reuse";
}
interface WorkflowResumeRefusal {
    version: 1;
    reason: string;
    byHand: string;
    newRunId?: string;
    refusedAt: number;
}
export type WorkflowResumeClaimOutcome = {
    kind: "owner";
} | {
    kind: "resumed";
    newRunId: string;
} | {
    kind: "busy";
    pid: number;
}
/** The current claim file exists but cannot be read, so nothing proves its claimant dead. */
 | {
    kind: "unreadable";
};
type WorkflowResumeClaimState = {
    kind: "none";
} | {
    kind: "resumed";
    newRunId: string;
} | {
    kind: "busy";
    pid: number;
    newRunId: string;
} | {
    kind: "unreadable";
};
type ClaimLiveness = (claim: WorkflowResumeClaim) => PidLiveness;
export declare function readWorkflowResumeClaim(asyncDir: string): WorkflowResumeClaim | undefined;
/** True once the run that resumes the run in `sourceAsyncDir` as `newRunId` has written its first status. */
export declare function resumedRunStarted(sourceAsyncDir: string, newRunId: string): boolean;
/** Read-only view for reuse readers and auto-resume: a dead, corrupt, or missing claim blocks nothing. */
export declare function workflowResumeClaimState(asyncDir: string, options?: {
    liveness?: ClaimLiveness;
}): WorkflowResumeClaimState;
/**
 * Claims the right to continue the stopped run in `asyncDir` as `newRunId`. A dead claimant is
 * superseded by the next generation file; of several takers, the one whose exclusive create
 * succeeds owns the run, and the others see its live claim on their next read.
 */
export declare function claimWorkflowResume(asyncDir: string, input: {
    newRunId: string;
    trigger: WorkflowResumeClaim["trigger"];
    now?: number;
    liveness?: ClaimLiveness;
}): WorkflowResumeClaimOutcome;
/** Gives up this process's claim on a launch that did not start, so the run can be continued again. */
export declare function releaseWorkflowResumeClaim(asyncDir: string, newRunId: string): void;
export declare function recordWorkflowResumeRefusal(asyncDir: string, refusal: Omit<WorkflowResumeRefusal, "version" | "refusedAt">, now?: number): void;
export declare function resumeByHandText(runId: string): string;
export declare function relaunchByHandText(runId: string): string;
/** `<reason>. <byHand>`; some reasons quote a message that already ends in a period. */
export declare function refusalSentence(reason: string, byHand: string): string;
/** A refusal was recorded for this run; the run is not tried again automatically. */
export declare function hasWorkflowResumeRefusal(asyncDir: string): boolean;
/**
 * The one line an interrupted workflow's notice carries about what happens next: the recorded
 * auto-resume refusal, else who continues the run, else how to continue it by hand.
 */
export declare function describeWorkflowResume(asyncDir: string, runId: string): string;
export {};
