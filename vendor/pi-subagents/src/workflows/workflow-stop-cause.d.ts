/** The extension runtime that owned the workflow was replaced (/reload, resume, project switch). */
export declare const WORKFLOW_STOP_CAUSE_RUNTIME_REPLACED = "runtime-replaced";
/** Stale-run reconciliation found the Pi process that ran the workflow dead (crash, kill, reboot). */
export declare const WORKFLOW_STOP_CAUSE_OWNER_EXITED = "owner-exited";
export type WorkflowStopCause = typeof WORKFLOW_STOP_CAUSE_RUNTIME_REPLACED | typeof WORKFLOW_STOP_CAUSE_OWNER_EXITED;
export declare function isReusableWorkflowStopCause(cause: unknown): cause is WorkflowStopCause;
