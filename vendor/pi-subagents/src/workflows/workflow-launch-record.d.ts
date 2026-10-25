/**
 * The public launch of an async top-level workflow, saved in its run directory so the run can be
 * relaunched later. A named resource is saved by name (its `runs.host` permit cannot be saved);
 * structured tasks/chain launches save no params, so they cannot be relaunched from this record.
 */
export type WorkflowLaunch = {
    source: "script" | "resource";
    params: Record<string, unknown>;
} | {
    source: "structured";
};
export type WorkflowLaunchRecord = WorkflowLaunch & {
    version: 1;
    scriptDigest: string;
};
type WorkflowLaunchRecordRead = {
    ok: true;
    record: WorkflowLaunchRecord;
} | {
    ok: false;
    missing: boolean;
    error: string;
};
/** Throws on a write failure; the launch must fail rather than start a run it cannot relaunch. */
export declare function writeWorkflowLaunchRecord(asyncDir: string, record: WorkflowLaunchRecord): void;
export declare function readWorkflowLaunchRecord(asyncDir: string): WorkflowLaunchRecordRead;
export {};
