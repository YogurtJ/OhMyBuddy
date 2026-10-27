import { ownsRun } from "../shared/run-ownership.js";
import { inheritedSessionIds } from "../../shared/session-succession.js";
import { OWNING_SESSION_COMPLETION_OWNER } from "../../shared/completion-owner.js";
import { checkRecordedPidLiveness, isRecordedPid } from "./stale-run-reconciler.js";
// A dead process cannot come back, so only that verdict is kept.
const deadCompletionOwnerIds = new Set();
export function createResultDeliveryOwnership(state) {
    const currentOwner = () => typeof state.completionOwnerId === "string" && state.completionOwnerId
        ? state.completionOwnerId
        : undefined;
    return {
        owns(sessionId, completionOwnerId) {
            const owner = currentOwner();
            if (!owner || (completionOwnerId !== owner && completionOwnerId !== OWNING_SESSION_COMPLETION_OWNER))
                return false;
            return ownsRun(state.currentSessionId, sessionId);
        },
        deliveryOwnerId(sessionId, completionOwnerId, ownerProcess, parentWorkflowRunId) {
            const owner = currentOwner();
            // A workflow child is reported by its workflow, which has its own owner-exited notice.
            if (!owner || typeof completionOwnerId !== "string" || completionOwnerId === owner
                || completionOwnerId === OWNING_SESSION_COMPLETION_OWNER || parentWorkflowRunId
                || !ownsRun(state.currentSessionId, sessionId))
                return completionOwnerId;
            if (!deadCompletionOwnerIds.has(completionOwnerId)) {
                if (!isRecordedPid(ownerProcess) || checkRecordedPidLiveness(ownerProcess) !== "dead")
                    return completionOwnerId;
                deadCompletionOwnerIds.add(completionOwnerId);
            }
            return OWNING_SESSION_COMPLETION_OWNER;
        },
        claimedSessionIds() {
            if (!currentOwner() || !state.currentSessionId)
                return [];
            return inheritedSessionIds(state.currentSessionId);
        },
    };
}
