import { type WorkflowResumeClaimOutcome } from "./workflow-resume-claim.ts";
import { type WorkflowScriptChildResult } from "./scripted-workflow.ts";
import { WORKFLOW_STOP_CAUSE_RUNTIME_REPLACED } from "./workflow-stop-cause.ts";
/** What a runtime replacement left; the notice's resume line says how the run continues. */
export declare const WORKFLOW_RUNTIME_REPLACED_STOP_NOTICE = "Async children that were still running keep running, and finished children are kept.";
/** Abort reason for workflow controllers torn down by runtime replacement; carries the cause as data, not text. */
export declare function runtimeReplacedAbortReason(): Error;
export declare function workflowStopCause(reason: unknown): typeof WORKFLOW_STOP_CAUSE_RUNTIME_REPLACED | undefined;
export declare function workflowScriptDigest(script: string): string;
/** Hash of the canonical launch params the script host uses to detect duplicate keys. */
export declare function workflowChildFingerprint(params: Record<string, unknown>): string;
type WorkflowChildJournalRecord = {
    type: "start";
    key: string;
    fingerprint: string;
    runId: string;
} | {
    type: "settle";
    key: string;
    fingerprint: string;
    result: WorkflowScriptChildResult;
};
/** Appends synchronously. A lost record only means a later relaunch runs that child again. */
export declare function appendWorkflowChildJournal(workflowAsyncDir: string, record: WorkflowChildJournalRecord): void;
interface WorkflowReuseSource {
    runId: string;
    started: Map<string, {
        fingerprint: string;
        runId: string;
    }>;
    settled: Map<string, {
        fingerprint: string;
        result: WorkflowScriptChildResult;
    }>;
}
type WorkflowReuseMatch = {
    kind: "settled";
    result: WorkflowScriptChildResult;
} | {
    kind: "started";
    runId: string;
};
/** Why a relaunch of `runId` is refused when another relaunch already continues it. */
export declare function claimedWorkflowRunRefusal(runId: string, claim: Exclude<WorkflowResumeClaimOutcome, {
    kind: "owner";
}>, named: boolean): string;
/**
 * The newest terminal workflow of this session with the same script and args,
 * when that run stopped because its runtime was replaced or its Pi process exited.
 * Throws when another relaunch already continues that run.
 */
export declare function findWorkflowReuseSource(asyncDirRoot: string, sessionId: string, scriptDigest: string, argsDigest: string | undefined): WorkflowReuseSource | undefined;
/**
 * The interrupted workflow run named by `options.reuseFrom`, from any session. Only the script
 * must match: each child is still reused only when its key and launch params match. The run is
 * reconciled first, so a run whose Pi process died is marked `owner-exited` before it is read.
 */
export declare function readNamedWorkflowReuseSource(asyncDirRoot: string, runId: string, scriptDigest: string, cwd: string, claimOwnerRunId?: string): WorkflowReuseSource;
/** A settled match is reusable only when that child succeeded; failed or stopped children run again. */
export declare function matchWorkflowReuse(source: WorkflowReuseSource, key: string, fingerprint: string): WorkflowReuseMatch | undefined;
export {};
