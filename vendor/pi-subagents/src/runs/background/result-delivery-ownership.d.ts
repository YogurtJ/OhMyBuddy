import type { SubagentState } from "../../shared/types.ts";
type ResultDeliveryState = Pick<SubagentState, "currentSessionId" | "completionOwnerId">;
export interface ResultDeliveryOwnership {
    owns(sessionId: string, completionOwnerId: unknown): boolean;
    /**
     * The completion owner a result is delivered under: `owning-session` when its own owner is another Pi
     * process that is confirmed dead and this session owns the run, so nothing else can ever deliver it;
     * otherwise `completionOwnerId`.
     */
    deliveryOwnerId(sessionId: string | undefined, completionOwnerId: string | null | undefined, ownerProcess: unknown, parentWorkflowRunId: unknown): string | null | undefined;
    claimedSessionIds(): readonly string[];
}
export declare function createResultDeliveryOwnership(state: ResultDeliveryState): ResultDeliveryOwnership;
export {};
