/**
 * The completion owner of a result whose own owner process is dead: whichever session owns the run
 * delivers it. Delivery consumes the result.
 */
export declare const OWNING_SESSION_COMPLETION_OWNER = "owning-session";
/** Stable for one parent Pi process across extension reloads. */
export declare function currentCompletionOwnerId(): string;
