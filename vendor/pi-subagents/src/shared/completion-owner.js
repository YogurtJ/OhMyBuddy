import { randomUUID } from "node:crypto";
const COMPLETION_OWNER_KEY = Symbol.for("pi-subagents.completion-owner-id");
/**
 * The completion owner of a result whose own owner process is dead: whichever session owns the run
 * delivers it. Delivery consumes the result.
 */
export const OWNING_SESSION_COMPLETION_OWNER = "owning-session";
/** Stable for one parent Pi process across extension reloads. */
export function currentCompletionOwnerId() {
    const runtime = globalThis;
    runtime[COMPLETION_OWNER_KEY] ??= randomUUID();
    return runtime[COMPLETION_OWNER_KEY];
}
