import { isRetryableAssistantError } from "@earendil-works/pi-ai";
// Account exhaustion can also carry 429. Do not present it as transient throttling.
// Pi's classifier supplies its own provider-specific quota/billing exclusions too.
const ACCOUNT_LIMIT = /quota|billing|out of budget|available balance|(?:account|subscription|credits?|balance|usage)[\s_-]*(?:(?:is|are|has been|have been)[\s_-]*)?(?:limit|exhaust|deplet|exceed)|(?:insufficient|exhausted|depleted|low|no(?:[\s_-]+remaining)?)[\s_-]*(?:credits?|balance|fund)/i;
const RATE_LIMIT = /\brate[\s_-]*limit(?:ed|ing|s|_(?:exceeded|error))?\b|\btoo[\s_-]+many[\s_-]+requests\b|\b(?:HTTP(?:\/\d(?:\.\d)?)?\s*[:=]?\s*429|(?:status|statusCode|status_code)["']?\s*[:=]?\s*429)\b|^\s*429\b/i;
function classifyError(message) {
    const text = message.errorMessage;
    if (!text || ACCOUNT_LIMIT.test(text) || !isRetryableAssistantError(message))
        return "unknown";
    return RATE_LIMIT.test(text) ? "rate_limited" : "transient_other";
}
const SAFE_ERROR_MESSAGES = {
    rate_limited: "Assistant request was rate limited.",
    transient_other: "Assistant request encountered a transient provider or transport error.",
    unknown: "Assistant request failed.",
};
/** Immutable, bounded observations only. This never decides whether to retry. */
export function observeProviderDiagnostics(current, event, at) {
    if (event.type === "message_end") {
        const message = event.message;
        if (message?.role === "assistant" && message.stopReason === "error") {
            const kind = classifyError(message);
            return {
                ...current,
                errorCount: (current?.errorCount ?? 0) + 1,
                lastError: { kind, message: SAFE_ERROR_MESSAGES[kind], at },
            };
        }
    }
    else if (event.type === "auto_retry_start") {
        const { attempt, maxAttempts, delayMs } = event;
        if (typeof attempt === "number" && Number.isSafeInteger(attempt) && attempt > 0
            && typeof maxAttempts === "number" && Number.isSafeInteger(maxAttempts) && maxAttempts >= attempt
            && typeof delayMs === "number" && Number.isFinite(delayMs) && delayMs >= 0) {
            return { ...current, errorCount: current?.errorCount ?? 0, retry: { phase: "backoff", attempt, maxAttempts, delayMs, scheduledAt: at } };
        }
    }
    else if ((event.type === "agent_start" || event.type === "turn_start") && current?.retry?.phase === "backoff") {
        return { ...current, retry: { ...current.retry, phase: "in_flight" } };
    }
    else if (event.type === "auto_retry_end" || event.type === "agent_settled") {
        return clearProviderRetry(current);
    }
    return current;
}
export function clearProviderRetry(current) {
    if (!current?.retry)
        return current;
    const { retry: _retry, ...history } = current;
    return history;
}
export function snapshotProviderDiagnostics(current) {
    if (!current)
        return undefined;
    return {
        errorCount: current.errorCount,
        ...(current.lastError ? { lastError: { ...current.lastError } } : {}),
        ...(current.retry ? { retry: { ...current.retry } } : {}),
    };
}
export function sameProviderDiagnostics(left, right) {
    if (left === right)
        return true;
    if (!left || !right)
        return false;
    return left.errorCount === right.errorCount
        && left.lastError?.kind === right.lastError?.kind
        && left.lastError?.message === right.lastError?.message
        && left.lastError?.at === right.lastError?.at
        && left.retry?.phase === right.retry?.phase
        && left.retry?.attempt === right.retry?.attempt
        && left.retry?.maxAttempts === right.retry?.maxAttempts
        && left.retry?.delayMs === right.retry?.delayMs
        && left.retry?.scheduledAt === right.retry?.scheduledAt;
}
