import { type PreparedWorkflowResume, type WorkflowResumeRefusalReason } from "./workflow-resume.ts";
/** Custom message posted when an auto-resume launch did not start. */
export declare const WORKFLOW_AUTO_RESUME_MESSAGE_TYPE = "subagent-auto-resume";
/** One planned auto-resume: its claim is held from session start until the launch starts or is cancelled. */
export interface PendingWorkflowAutoResume {
    readonly sessionId: string;
    /** The extension runtime that planned it. */
    readonly owner: object;
    readonly prepared: PreparedWorkflowResume;
    /** `cancelled` before it started: its run id is reused by the next scan. */
    state: "pending" | "started" | "cancelled";
}
/** Cancels matching launches that have not started and gives their claims back, synchronously. */
export declare function cancelPendingWorkflowAutoResumes(match: (entry: PendingWorkflowAutoResume) => boolean): void;
/** A cancelled entry stays recorded until its session's next scan reuses its run id. */
export declare function finishWorkflowAutoResume(entry: PendingWorkflowAutoResume): void;
/**
 * Claims this session's interrupted top-level workflows for auto-resume. Synchronous and bounded:
 * one listing of the session's terminal index, reads only for runs that ended in the last 24 h,
 * then the cheap filters before any claim. A refusal is recorded in the run, so each run gets one
 * automatic attempt; the launch itself happens later, off session start. Launches of this session
 * that another runtime (or an earlier session start) planned but did not start are cancelled first,
 * so their claims do not hide the runs from this scan.
 */
export declare function planWorkflowAutoResumes(input: {
    asyncDirRoot: string;
    currentSessionId: string;
    now: number;
    owner: object;
}): PendingWorkflowAutoResume[];
/** The one line posted when an auto-resume launch did not start. */
export declare function autoResumeFailureText(sourceRunId: string, refusal: Pick<WorkflowResumeRefusalReason, "reason" | "byHand">): string;
