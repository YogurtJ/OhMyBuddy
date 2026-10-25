/**
 * Package-owned workflow scripts for the data-only `tasks` and `chain` inputs.
 * Callers supply only data; every caller string is embedded with JSON.stringify
 * and never becomes code. Scripts run on the ordinary workflow runtime.
 */
export type StructuredWorkflowKind = "tasks" | "chain";
export declare const TOP_LEVEL_CONTROLS_HINT = " Put worktree and other child controls on the subagent call itself; they apply to every child.";
export declare function isPlainRecord(value: unknown): value is Record<string, unknown>;
/** Validate exact data shapes and expand them into a package-owned workflow script. */
export declare function buildStructuredWorkflowScript(kind: StructuredWorkflowKind, steps: unknown, originalTask: string | undefined): string;
