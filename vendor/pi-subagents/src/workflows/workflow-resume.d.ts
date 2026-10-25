type WorkflowResumeTrigger = "auto" | "manual";
export type WorkflowResumeRefusalCode = "not-owned" | "not-interrupted" | "claim-busy" | "claim-resumed" | "launch-missing" | "launch-invalid" | "structured" | "digest" | "authority" | "capacity" | "attempts" | "launch-failed";
export interface WorkflowResumeRefusalReason {
    code: WorkflowResumeRefusalCode;
    reason: string;
    /** How to continue the run by hand; empty when there is nothing to add. */
    byHand: string;
}
export interface PreparedWorkflowResume {
    sourceRunId: string;
    sourceAsyncDir: string;
    newRunId: string;
    trigger: WorkflowResumeTrigger;
    /** Public launch params for executePublic: the saved launch with async, reuseFrom and the source's ceiling. */
    params: Record<string, unknown>;
    expectedScriptDigest: string;
    resumeOrigin: {
        sourceRunId: string;
        attempt: number;
    };
}
type WorkflowResumePreparation = {
    ok: true;
    prepared: PreparedWorkflowResume;
} | ({
    ok: false;
} & WorkflowResumeRefusalReason);
export declare function workflowResumeRefusal(code: WorkflowResumeRefusalCode, reason: string, runId: string): WorkflowResumeRefusalReason;
/** The tool error for a resume by id; the resume form is not repeated to a caller that just tried it. */
export declare function manualWorkflowResumeRefusalText(runId: string, refusal: Pick<WorkflowResumeRefusalReason, "reason" | "byHand">): string;
/**
 * The run id a resume action relaunches: no message, task, chain or index, and an id naming a
 * top-level workflow run. Anything else is a child resume.
 */
export declare function workflowResumeTargetId(asyncDirRoot: string, params: {
    id?: unknown;
    runId?: unknown;
    message?: unknown;
    task?: unknown;
    chain?: unknown;
    index?: unknown;
}): string | undefined;
/**
 * Checks a stopped workflow run can be resumed and claims it for a new run id. Synchronous and
 * cheap: the launch itself happens in the executor.
 * `newRunId` presets the new run's id: a reload claims a run again under the id of the launch it cancelled.
 */
export declare function prepareWorkflowResume(input: {
    asyncDirRoot: string;
    sourceRunId: string;
    trigger: WorkflowResumeTrigger;
    now: number;
    currentSessionId: string;
    newRunId?: string;
}): WorkflowResumePreparation;
export {};
