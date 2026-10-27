import {
  isTrustedRecordedSessionFile,
  resolveSubagentRunId
} from "./chunk-FXUXCX2K.js";
import {
  agentStreamOptions,
  opencodeSessionHeaders,
  ownsRun,
  resolveAsyncResumeTarget
} from "./chunk-6XJB7PIX.js";
import {
  currentCompletionOwnerId,
  listMissions,
  missionRecordPath,
  readMissionBinding,
  reconcileAsyncRun,
  resolveAuthorityDecision,
  resolveMissionStoreLocation
} from "./chunk-46XKCPJR.js";
import {
  deliverInterruptRequest,
  queueRevivalBrief,
  requestAsyncSteer
} from "./chunk-OYF6AFDY.js";
import {
  formatShellCommand
} from "./chunk-7J4ZXMY7.js";
import {
  readStatus,
  redactSecretValues,
  resolveNodeExecutable,
  tryLease,
  writeAtomicJson,
  writePrivateAtomicJson
} from "./chunk-CIZQXJ5Q.js";
import {
  DIRS
} from "./chunk-5LFLVSTM.js";
import {
  previewDisplayText,
  safeTerminalText
} from "./chunk-YFCK7H2S.js";

// src/runs/background/steering.ts
import * as fs from "node:fs";
import * as path from "node:path";
var MAX_STEERING_REQUESTS = 20;
var STEERING_MESSAGE_PREVIEW_LIMIT = 160;
function steeringMessagePreview(message) {
  return previewDisplayText(redactSecretValues(message), STEERING_MESSAGE_PREVIEW_LIMIT);
}
function steeringReceipt(message, receipt) {
  const preview = steeringMessagePreview(message);
  const longestFence = Math.max(2, ...[...preview.matchAll(/`{3,}/g)].map((match) => match[0].length));
  const fence = "`".repeat(longestFence + 1);
  return `${receipt}

Message sent:
${fence}text
${preview}
${fence}`;
}
function createSteeringStatus() {
  return { requested: 0, scheduled: 0, pending: 0, delivered: 0, failed: 0, recovered: 0, recent: [] };
}
function steeringStatus(status) {
  return status.steering ?? createSteeringStatus();
}
function recordSteeringRequest(status, input) {
  const existing = status.recent.find((request2) => request2.id === input.id);
  if (existing) return existing;
  const request = {
    id: input.id,
    requestedAt: input.requestedAt,
    ...input.source ? { source: input.source } : {},
    messagePreview: steeringMessagePreview(input.message),
    targets: input.targets.map((target) => ({ index: target.index, state: target.state, ...target.reason ? { reason: target.reason } : {} }))
  };
  status.requested++;
  status.lastRequestedAt = input.requestedAt;
  status.recent = [...status.recent, request].slice(-MAX_STEERING_REQUESTS);
  for (const target of request.targets) incrementStateCount(status, target.state);
  return request;
}
function incrementStateCount(status, state) {
  if (state === "scheduled") status.scheduled++;
  else if (state === "routed" || state === "queued") status.pending++;
  else if (state === "delivered" || state === "late") status.delivered++;
  else if (state === "failed") status.failed++;
  else if (state === "recovered") status.recovered++;
}
function updateSteeringTarget(status, requestId, index, state, now, fields = {}) {
  const request = status.recent.find((candidate) => candidate.id === requestId);
  const target = request?.targets.find((candidate) => candidate.index === index);
  if (!target) return void 0;
  if (state === "late" && target.state === "recovered") {
    if (target.lateDeliveredAt === void 0) {
      target.lateDeliveredAt = now;
      status.delivered++;
      status.lastDeliveredAt = now;
    }
    if (fields.reason) target.reason = fields.reason;
    return target;
  }
  if (target.state === state) {
    if (state === "routed" && target.routedAt === void 0) target.routedAt = now;
    if (state === "delivered" && target.deliveredAt === void 0) target.deliveredAt = now;
    if (state === "late" && target.lateDeliveredAt === void 0) target.lateDeliveredAt = now;
    if (fields.reason) target.reason = fields.reason;
    if (fields.replacementRunId) target.replacementRunId = fields.replacementRunId;
    return target;
  }
  const wasPending = target.state === "routed" || target.state === "queued";
  const nowPending = state === "routed" || state === "queued";
  if (wasPending && !nowPending) status.pending = Math.max(0, status.pending - 1);
  target.state = state;
  if (state === "routed") target.routedAt = now;
  if (state === "delivered") {
    target.deliveredAt = now;
    status.lastDeliveredAt = now;
  }
  if (state === "late") {
    target.lateDeliveredAt = now;
    status.lastDeliveredAt = now;
  }
  if (state === "failed") target.failedAt = now;
  if (state === "recovered") target.recoveredAt = now;
  if (fields.reason) target.reason = fields.reason;
  if (fields.replacementRunId) target.replacementRunId = fields.replacementRunId;
  if (!wasPending || !nowPending) incrementStateCount(status, state);
  return target;
}
function findSteeringRequest(status, requestId) {
  return status.recent.find((request) => request.id === requestId);
}
function actionResultFromSteeringStatus(status, sourceRunId, requestId, replacementRunId) {
  const request = findSteeringRequest(status, requestId);
  if (!request) return void 0;
  const targets = request.targets.map((target) => ({
    index: target.index,
    state: target.state,
    ...target.deliveredAt !== void 0 ? { deliveredAt: target.deliveredAt } : {},
    ...target.lateDeliveredAt !== void 0 ? { lateDeliveredAt: target.lateDeliveredAt } : {},
    ...target.reason ? { reason: target.reason } : {},
    ...target.replacementRunId ? { replacementRunId: target.replacementRunId } : {}
  }));
  const states = targets.map((target) => target.state);
  let state = "pending";
  if (states.length > 0 && states.every((candidate) => candidate === "delivered")) state = "delivered";
  else if (states.length > 0 && states.every((candidate) => candidate === "scheduled")) state = "scheduled";
  else if (states.length > 0 && states.every((candidate) => candidate === "recovered")) state = "recovered";
  else if (states.length > 0 && states.every((candidate) => candidate === "failed" || candidate === "late")) state = "failed";
  else if (states.some((candidate) => candidate === "failed" || candidate === "late") && states.some((candidate) => candidate !== "failed" && candidate !== "late")) state = "partial";
  const effectiveReplacementRunId = replacementRunId ?? request.targets.find((target) => target.replacementRunId)?.replacementRunId;
  const deliveryStatus = states.length > 0 && states.every((candidate) => candidate === "delivered" || candidate === "recovered") ? "delivered" : "queued";
  return { requestId, state, deliveryStatus, sourceRunId, ...effectiveReplacementRunId ? { replacementRunId: effectiveReplacementRunId } : {}, targets };
}
function steeringActionIsTerminal(result2) {
  return (result2?.targets.length ?? 0) > 0 && result2?.targets.every((target) => target.state === "queued" || target.state === "delivered") === true || result2?.state === "delivered" || result2?.state === "scheduled" || result2?.state === "partial" || result2?.state === "recovered" || result2?.state === "failed";
}
function claimSteeringRecovery(asyncDir, input) {
  const recoveryDir = path.join(asyncDir, "control", "steer-recovery");
  fs.mkdirSync(recoveryDir, { recursive: true, mode: 448 });
  const claimPath = path.join(recoveryDir, "claim.json");
  let fd;
  try {
    fd = fs.openSync(claimPath, "wx", 384);
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error("Another steering recovery is already committed for this source run.");
    }
    throw error;
  }
  let writeError;
  try {
    fs.writeFileSync(fd, JSON.stringify({ version: 1, ...input }, null, 2), "utf-8");
    fs.fsyncSync(fd);
  } catch (error) {
    writeError = error;
  } finally {
    fs.closeSync(fd);
  }
  if (writeError !== void 0) {
    fs.rmSync(claimPath, { force: true });
    throw writeError;
  }
  const markerPath = path.join(recoveryDir, `${Buffer.from(input.requestId).toString("base64url")}.json`);
  try {
    writePrivateAtomicJson(markerPath, { version: 1, ...input });
  } catch (error) {
    fs.rmSync(claimPath, { force: true });
    throw error;
  }
  return { claimPath, markerPath };
}
function readSteeringStatus(asyncDir) {
  return readStatus(asyncDir)?.steering;
}
function remainingSteeringRecoveryLimits(descriptor, status, now = Date.now()) {
  const limits = {};
  if (descriptor.absoluteDeadlineAt !== void 0) {
    const timeoutMs = descriptor.absoluteDeadlineAt - now;
    if (timeoutMs <= 0) throw new Error("Source run has no remaining deadline budget; it remains paused.");
    limits.timeoutMs = timeoutMs;
    limits.absoluteDeadlineAt = descriptor.absoluteDeadlineAt;
  }
  if (descriptor.initialToolBudget) {
    const consumed = status.toolBudget?.toolCount ?? status.toolCount ?? 0;
    const hard = descriptor.initialToolBudget.hard - consumed;
    if (hard <= 0) throw new Error("Source run has no remaining tool budget; it remains paused.");
    const soft = descriptor.initialToolBudget.soft === void 0 ? void 0 : descriptor.initialToolBudget.soft - consumed;
    limits.toolBudget = {
      hard,
      ...soft !== void 0 && soft > 0 && soft < hard ? { soft } : {},
      block: descriptor.initialToolBudget.block
    };
  }
  return limits;
}
async function waitForSteeringAction(input) {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() <= deadline) {
    if (input.signal?.aborted) return void 0;
    const status2 = readSteeringStatus(input.asyncDir);
    const result2 = status2 ? actionResultFromSteeringStatus(status2, input.sourceRunId, input.requestId) : void 0;
    if (steeringActionIsTerminal(result2)) return result2;
    await new Promise((resolve3) => setTimeout(resolve3, Math.min(50, Math.max(1, deadline - Date.now()))));
  }
  const status = readSteeringStatus(input.asyncDir);
  return status ? actionResultFromSteeringStatus(status, input.sourceRunId, input.requestId) : void 0;
}

// src/runs/foreground/async-steering-action.ts
import { randomUUID } from "node:crypto";
import * as fs2 from "node:fs";
import * as path2 from "node:path";
function steerTargetsAccepted(result2) {
  const targets = result2?.targets ?? [];
  return targets.length > 0 && targets.every((target) => target.state === "queued" || target.state === "delivered");
}
function canQueueRetainedAsyncFollowUp(status, index) {
  const steps = status.steps ?? [];
  return status.state === "complete" && Boolean(status.parentWorkflowRunId) && steps.length === 1 && (steps[0]?.status === "complete" || steps[0]?.status === "completed") && Boolean(steps[0]?.sessionFile ?? status.sessionFile) && (index === void 0 || index === 0);
}
async function steerAsyncRun(input) {
  if (!input.location.asyncDir) {
    return {
      content: [{ type: "text", text: `Async run '${input.runId}' has no live run directory to steer.` }],
      isError: true,
      details: { mode: "management", results: [] }
    };
  }
  const asyncDir = input.location.asyncDir;
  const snapshot = input.findPendingAsks ? readStatus(asyncDir) : null;
  if (snapshot?.mode === "single" && (!input.state.currentSessionId || ownsRun(input.state.currentSessionId, snapshot.sessionId)) && (snapshot.state === "running" || snapshot.state === "queued") && snapshot.steps?.length === 1 && (input.index === void 0 || input.index === 0) && (snapshot.steps[0]?.status === "running" || snapshot.steps[0]?.status === "pending")) {
    const asks = input.findPendingAsks?.({ runId: snapshot.runId, agent: snapshot.steps[0].agent, childIndex: 0 }) ?? [];
    if (asks.length > 0) {
      const replies = asks.map((replyTo) => `subagent_supervisor(${JSON.stringify({ action: "reply", replyTo, message: "<explicit answer>" })})`).join("\n");
      return {
        content: [{ type: "text", text: `Steering not delivered or queued: async run ${snapshot.runId} is blocked on ${asks.length === 1 ? "a pending supervisor ask" : "ambiguous pending supervisor asks"}. No reply or recovery was attempted. Reply explicitly${asks.length > 1 ? " to the intended request ID" : ""}:
${replies}` }],
        isError: true,
        details: { mode: "management", results: [] }
      };
    }
  }
  const status = reconcileAsyncRun(asyncDir, { kill: input.kill }).status;
  if (input.state.currentSessionId && !ownsRun(input.state.currentSessionId, status?.sessionId)) {
    return {
      content: [{ type: "text", text: `Async run '${input.runId}' was not found in the active session.` }],
      isError: true,
      details: { mode: "management", results: [] }
    };
  }
  if (!status) {
    return {
      content: [{ type: "text", text: `Async run '${input.runId}' was not found.` }],
      isError: true,
      details: { mode: "management", results: [] }
    };
  }
  const steps = status.steps ?? [];
  if (status.state !== "running" && status.state !== "queued") {
    const followUpEligible = canQueueRetainedAsyncFollowUp(status, input.index);
    const retained = input.mode === "follow_up" && followUpEligible;
    if (!retained) {
      let resumeHint = `Continue it with action "resume", or read its saved result.`;
      try {
        resolveAsyncResumeTarget({ dir: asyncDir, index: input.index }, { kill: input.kill }, { requireSessionFile: false, sessionId: input.state.currentSessionId ?? void 0 });
      } catch (error) {
        resumeHint = `action "resume" is not available either: ${error instanceof Error ? error.message : String(error)}`;
      }
      const hint = followUpEligible ? `Queue this message for its next resume with mode "follow_up", or continue the run now with action "resume".` : input.mode === "follow_up" ? `mode "follow_up" requires a completed single-child workflow run with a persisted session. ${resumeHint}` : resumeHint;
      return {
        content: [{ type: "text", text: `Async run '${input.runId}' is ${status.state} and cannot be steered; steering requires state "running" or "queued". ${hint}` }],
        isError: true,
        details: { mode: "management", results: [] }
      };
    }
    const request = { type: "steer", id: randomUUID(), ts: Date.now(), message: input.message.trim(), mode: "follow_up", targetIndex: 0, source: "steer-action" };
    try {
      queueRevivalBrief(asyncDir, request);
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to queue retained follow-up for async run ${status.runId}: ${error instanceof Error ? error.message : String(error)}` }], isError: true, details: { mode: "management", results: [] } };
    }
    status.steering ??= createSteeringStatus();
    recordSteeringRequest(status.steering, { id: request.id, requestedAt: request.ts, source: request.source, message: request.message, targets: [{ index: 0, state: "scheduled" }] });
    writeAtomicJson(path2.join(asyncDir, "status.json"), status);
    const queued = { requestId: request.id, state: "scheduled", deliveryStatus: "queued", sourceRunId: status.runId, targets: [{ index: 0, state: "scheduled" }] };
    return { content: [{ type: "text", text: steeringReceipt(request.message, `Follow-up queued for the next resume of retained async run ${status.runId} (request ${request.id}).`) }], details: { mode: "management", results: [], steering: queued } };
  }
  if (input.index !== void 0) {
    if (input.index < 0 || input.index >= steps.length) {
      return {
        content: [{ type: "text", text: `Async run '${status.runId}' has ${steps.length} children. Index ${input.index} is out of range.` }],
        isError: true,
        details: { mode: "management", results: [] }
      };
    }
    const targetStep = steps[input.index];
    if (targetStep && targetStep.status !== "running" && targetStep.status !== "pending") {
      return {
        content: [{ type: "text", text: `Async run '${status.runId}' child ${input.index} is ${targetStep.status} and cannot be steered.` }],
        isError: true,
        details: { mode: "management", results: [] }
      };
    }
  } else {
    const running2 = steps.filter((step) => step.status === "running");
    if (running2.length === 0 && steps.length > 1) {
      return {
        content: [{ type: "text", text: `Async run '${status.runId}' has no running child yet. Provide index to steer a queued child.` }],
        isError: true,
        details: { mode: "management", results: [] }
      };
    }
  }
  const runningIndexes = steps.map((step, index) => step.status === "running" ? index : void 0).filter((index) => index !== void 0);
  const effectiveTargetIndex = input.index ?? (status.mode === "single" && runningIndexes.length === 0 && steps[0]?.status === "pending" ? 0 : void 0);
  const targetIndexes = effectiveTargetIndex !== void 0 ? [effectiveTargetIndex] : runningIndexes;
  if (targetIndexes.length === 0) {
    return {
      content: [{ type: "text", text: `Async run '${status.runId}' has no running child to steer.` }],
      isError: true,
      details: { mode: "management", results: [] }
    };
  }
  const requestId = randomUUID();
  let requestPath;
  try {
    requestPath = requestAsyncSteer(asyncDir, {
      message: input.message,
      mode: input.mode,
      ...effectiveTargetIndex !== void 0 ? { targetIndex: effectiveTargetIndex } : { targetIndexes },
      source: "steer-action",
      id: requestId
    });
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to queue steering for async run ${status.runId}: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
      details: { mode: "management", results: [] }
    };
  }
  input.onRequestQueued?.(requestPath);
  const tracked = input.state.asyncJobs.get(status.runId);
  if (tracked) tracked.updatedAt = Date.now();
  const targets = targetIndexes.map((index) => ({ index, state: status.steps?.[index]?.status === "pending" ? "scheduled" : "pending" }));
  if (targets.every((target) => target.state === "scheduled")) {
    const scheduled = { requestId, state: "scheduled", deliveryStatus: "queued", sourceRunId: status.runId, targets };
    return { content: [{ type: "text", text: steeringReceipt(input.message, `Steering scheduled for async run ${status.runId} (request ${requestId}).`) }], details: { mode: "management", results: [], steering: scheduled } };
  }
  const waited = await waitForSteeringAction({ asyncDir, sourceRunId: status.runId, requestId, timeoutMs: input.ackTimeoutMs ?? 3e3, signal: input.signal });
  const result2 = waited ?? { requestId, state: "pending", deliveryStatus: "queued", sourceRunId: status.runId, targets };
  if (input.signal?.aborted) {
    return { content: [{ type: "text", text: steeringReceipt(input.message, `Steering pending for async run ${status.runId} (request ${requestId}); caller aborted before recovery.`) }], details: { mode: "management", results: [], steering: result2 } };
  }
  const finalStatus = readStatus(asyncDir);
  const finalResult = finalStatus?.steering ? actionResultFromSteeringStatus(finalStatus.steering, status.runId, requestId) : void 0;
  const acceptedReply = (accepted) => {
    const acceptedState = accepted.state === "delivered" ? "delivered" : "queued";
    return { content: [{ type: "text", text: steeringReceipt(input.message, `Steering ${acceptedState} for async run ${status.runId} (request ${requestId}).`) }], details: { mode: "management", results: [], steering: accepted } };
  };
  if (finalResult && steerTargetsAccepted(finalResult)) return acceptedReply(finalResult);
  const running = (finalStatus?.steps ?? status.steps ?? []).filter((step) => step.status === "running");
  const recoveryAllowed = (input.mode ?? "steer") === "steer" && status.mode === "single" && status.isNested !== true && running.length === 1 && Boolean(finalStatus?.steering) && (input.index === void 0 || input.index === 0);
  if (recoveryAllowed && finalResult?.state !== "scheduled" && input.recover) {
    const appendSteeringNotice = (state, message) => {
      try {
        fs2.appendFileSync(path2.join(asyncDir, "events.jsonl"), `${JSON.stringify({ type: "subagent.steering.notice", ts: Date.now(), runId: status.runId, requestId, state, message, ...status.sessionId ? { currentSessionId: status.sessionId } : {} })}
`);
      } catch {
      }
    };
    try {
      const latest = readStatus(asyncDir);
      const latestResult = latest?.steering ? actionResultFromSteeringStatus(latest.steering, status.runId, requestId) : void 0;
      if (latestResult && steerTargetsAccepted(latestResult)) return acceptedReply(latestResult);
      const committedAt = Date.now();
      input.onBeforeRecoveryClaim?.(requestId, committedAt);
      const { claimPath, markerPath } = claimSteeringRecovery(asyncDir, { requestId, sourceRunId: status.runId, committedAt });
      input.onRecoveryCommitted?.(requestId, committedAt);
      const preCommitStatus = readStatus(asyncDir);
      const preCommitResult = preCommitStatus?.steering ? actionResultFromSteeringStatus(preCommitStatus.steering, status.runId, requestId) : void 0;
      if (preCommitResult && preCommitResult.targets.length > 0 && preCommitResult.targets.every((target) => target.state === "queued" || target.deliveredAt !== void 0 && target.deliveredAt <= committedAt)) {
        fs2.rmSync(markerPath, { force: true });
        fs2.rmSync(claimPath, { force: true });
        return acceptedReply(preCommitResult);
      }
      try {
        deliverInterruptRequest({ asyncDir, source: "steering-recovery" });
      } catch (error) {
        fs2.rmSync(markerPath, { force: true });
        fs2.rmSync(claimPath, { force: true });
        throw new Error(`Failed to commit steering recovery interrupt: ${error instanceof Error ? error.message : String(error)}`);
      }
      const pauseBudgetMs = input.recoveryTimeoutMs ?? 15e3;
      const pauseDeadline = Date.now() + pauseBudgetMs;
      let paused = null;
      let lastObservedState;
      while (Date.now() <= pauseDeadline) {
        if (input.signal?.aborted) break;
        const candidate = readStatus(asyncDir);
        lastObservedState = candidate?.state;
        if (candidate?.state === "paused" && candidate.endedAt !== void 0) {
          paused = candidate;
          break;
        }
        await new Promise((resolve3) => setTimeout(resolve3, 50));
      }
      if (!paused) {
        fs2.rmSync(claimPath, { force: true });
        throw new Error(`Source run did not confirm a paused state within ${pauseBudgetMs / 1e3} seconds after the recovery interrupt (last observed state: ${lastObservedState ?? "unknown"}). No replacement was launched and the steering message was not applied. Once it pauses, continue it with action "resume" and id "${status.runId}".`);
      }
      let recoveryTarget;
      try {
        recoveryTarget = resolveAsyncResumeTarget(
          { id: status.runId },
          { kill: input.kill },
          { sessionId: input.state.currentSessionId ?? void 0 }
        );
      } catch (error) {
        throw new Error(`Source run remains paused and cannot be revived safely: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (recoveryTarget.kind !== "revive" || !recoveryTarget.sessionFile) throw new Error("Source run has no valid persisted child session; it remains paused and requires a new run.");
      if (!recoveryTarget.recoveryDescriptor) throw new Error("Source run has no private recovery descriptor; it remains paused and is not safely resumable.");
      const limits = remainingSteeringRecoveryLimits(recoveryTarget.recoveryDescriptor, paused);
      const revived = await input.recover(limits);
      if (revived.isError || !revived.details.asyncId) throw new Error(revived.content[0]?.type === "text" ? revived.content[0].text : "Replacement launch failed; source run remains paused.");
      const targetIndex = input.index ?? paused.steering?.recent.find((request) => request.id === requestId)?.targets[0]?.index ?? status.steps?.findIndex((step) => step.status === "running") ?? -1;
      if (paused.steering && targetIndex >= 0) {
        updateSteeringTarget(paused.steering, requestId, targetIndex, "recovered", Date.now(), { replacementRunId: revived.details.asyncId });
        const stepSteering = paused.steps?.[targetIndex]?.steering;
        if (stepSteering) updateSteeringTarget(stepSteering, requestId, targetIndex, "recovered", Date.now(), { replacementRunId: revived.details.asyncId });
        writeAtomicJson(path2.join(asyncDir, "status.json"), paused);
      }
      const recovered = paused.steering ? actionResultFromSteeringStatus(paused.steering, status.runId, requestId, revived.details.asyncId) : void 0;
      appendSteeringNotice("recovered", `Steering recovered for run ${status.runId}; replacement ${revived.details.asyncId} launched.`);
      return { content: [{ type: "text", text: steeringReceipt(input.message, `Steering recovered for async run ${status.runId}; replacement ${revived.details.asyncId} launched after the source paused.`) }], details: { mode: "management", results: [], steering: recovered ?? { requestId, state: "recovered", sourceRunId: status.runId, replacementRunId: revived.details.asyncId, deliveryStatus: "delivered", targets: [{ index: input.index ?? 0, state: "recovered" }] } } };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const failedStatus = readStatus(asyncDir);
      const targetIndex = input.index ?? status.steps?.findIndex((step) => step.status === "running") ?? -1;
      if (failedStatus && failedStatus.state !== "running" && failedStatus.state !== "queued" && failedStatus.steering && targetIndex >= 0) {
        updateSteeringTarget(failedStatus.steering, requestId, targetIndex, "failed", Date.now(), { reason });
        const stepSteering = failedStatus.steps?.[targetIndex]?.steering;
        if (stepSteering) updateSteeringTarget(stepSteering, requestId, targetIndex, "failed", Date.now(), { reason });
        failedStatus.activityState = "needs_attention";
        writeAtomicJson(path2.join(asyncDir, "status.json"), failedStatus);
      }
      const failed = failedStatus?.steering ? actionResultFromSteeringStatus(failedStatus.steering, status.runId, requestId) : void 0;
      appendSteeringNotice("failed", `Steering failed for run ${status.runId}: ${reason}`);
      return { content: [{ type: "text", text: steeringReceipt(input.message, `Steering failed for async run ${status.runId} (request ${requestId}): ${reason}`) }], isError: true, details: { mode: "management", results: [], steering: failed ?? { requestId, state: "failed", sourceRunId: status.runId, deliveryStatus: "queued", targets: [{ index: input.index ?? 0, state: "failed", reason }] } } };
    }
  }
  const stateText = result2.state === "failed" ? "failed" : result2.state === "partial" ? "partial" : result2.deliveryStatus === "queued" ? "queued" : result2.state === "delivered" ? "delivered" : result2.state === "scheduled" ? "scheduled" : result2.state === "recovered" ? "recovered" : "pending";
  const isError = result2.state === "failed" || result2.state === "partial";
  return {
    content: [{ type: "text", text: steeringReceipt(input.message, `Steering ${stateText} for async run ${status.runId} (request ${requestId}).`) }],
    ...isError ? { isError: true } : {},
    details: { mode: "management", results: [], steering: result2 }
  };
}

// src/runs/foreground/workflow-foreground-steering.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import * as path3 from "node:path";

// src/runs/shared/workflow-async-child-guidance.ts
function workflowAsyncChildSteeringGuidance(status, state) {
  if (status.mode !== "workflow" || status.state !== "running" && status.state !== "queued" || !state?.currentSessionId || status.sessionId !== state.currentSessionId || !state.workflowControllers?.has(status.runId)) return [];
  const ids = new Set((status.steps ?? []).flatMap((step) => step.async === true && step.status === "running" && step.runner?.type !== "external-cli" && step.runner?.type !== "external-job" && typeof step.runId === "string" && /^[A-Za-z0-9_-]+$/.test(step.runId) && step.runId !== status.runId ? [step.runId] : []));
  if (ids.size === 0) return [];
  return [
    "Async children recorded as running; direct steering rechecks controls. Choose an exact child ID (queued does not mean consumed):",
    ...[...ids].map((id) => `  subagent({ action: "steer", id: "${id}", message: "...", options: { mode: "follow_up" } })`)
  ];
}

// src/runs/foreground/workflow-foreground-steering.ts
function activeWorkflowError(state, workflowRunId, asyncDirRoot) {
  if (!state.currentSessionId) return "Workflow steering requires an active parent session.";
  if (!state.workflowControllers?.has(workflowRunId)) return `Workflow '${workflowRunId}' has no live foreground child.`;
  const status = readStatus(path3.join(asyncDirRoot, workflowRunId));
  if (!status || status.mode !== "workflow" || status.state !== "running" && status.state !== "queued") {
    return `Workflow '${workflowRunId}' has no live foreground child.`;
  }
  if (status.sessionId !== state.currentSessionId) return `Workflow '${workflowRunId}' was not found in the active session.`;
  return void 0;
}
function controlIsLiveInWorkflow(control, workflowRunId, sessionId) {
  return control.parentWorkflowRunId === workflowRunId && control.sessionId === sessionId && (control.activeChildren?.size ?? 0) > 0;
}
function resolveWorkflowForegroundSteeringTarget(input) {
  const { state, childRunId, asyncDirRoot } = input;
  if (childRunId) {
    const control = state.foregroundControls.get(childRunId);
    if (!control?.parentWorkflowRunId) return { ok: false, message: `Foreground run '${childRunId}' is not a live workflow-owned child.` };
    const workflowRunId2 = control.parentWorkflowRunId;
    const workflowError2 = activeWorkflowError(state, workflowRunId2, asyncDirRoot);
    if (workflowError2) return { ok: false, message: workflowError2 };
    if (!controlIsLiveInWorkflow(control, workflowRunId2, state.currentSessionId)) {
      return { ok: false, message: `Foreground run '${childRunId}' is not a live workflow-owned child in the active session.` };
    }
    return { ok: true, target: { control, workflowRunId: workflowRunId2, sourceRunId: childRunId } };
  }
  const workflowRunId = input.workflowRunId;
  if (!workflowRunId) return { ok: false, message: "Workflow steering requires a workflow or child run id." };
  const workflowError = activeWorkflowError(state, workflowRunId, asyncDirRoot);
  if (workflowError) return { ok: false, message: workflowError };
  const controls = [...state.foregroundControls.values()].filter((control) => controlIsLiveInWorkflow(control, workflowRunId, state.currentSessionId));
  if (controls.length === 0) return { ok: false, message: `Workflow '${workflowRunId}' has no live foreground child.` };
  if (controls.length > 1) return { ok: false, message: `Workflow '${workflowRunId}' has ${controls.length} live foreground children; steer a child run id instead.` };
  return { ok: true, target: { control: controls[0], workflowRunId, sourceRunId: workflowRunId } };
}
function managementError(message) {
  return { content: [{ type: "text", text: message }], isError: true, details: { mode: "management", results: [] } };
}
async function steerWorkflowRun(input) {
  const { state, runId, asyncDir } = input;
  const status = readStatus(asyncDir);
  if (!status || status.mode !== "workflow" || status.runId !== runId || path3.basename(asyncDir) !== runId) {
    return managementError(`Workflow '${runId}' does not match its resolved run directory.`);
  }
  if (state.workflowControllers?.has(runId)) {
    const route = resolveWorkflowForegroundSteeringTarget({ state, workflowRunId: runId, asyncDirRoot: path3.dirname(asyncDir) });
    if (!route.ok) return managementError([route.message, ...workflowAsyncChildSteeringGuidance(status, state)].join("\n"));
    return steerWorkflowForegroundTarget({ target: route.target, message: input.message, mode: input.mode, index: input.index });
  }
  if (!state.currentSessionId) return managementError("Workflow steering requires an active parent session.");
  if (status.sessionId !== state.currentSessionId) return managementError(`Workflow '${runId}' was not found in the active session.`);
  if (status.state !== "running" && status.state !== "queued") return managementError(`Workflow '${runId}' is not running or queued and cannot be steered.`);
  if (typeof status.completionOwnerId !== "string" || !status.completionOwnerId.trim() || status.completionOwnerId === (state.completionOwnerId ?? currentCompletionOwnerId()) || [...state.foregroundControls.values()].some((control) => control.parentWorkflowRunId === runId)) {
    return managementError(`Workflow '${runId}' has no live foreground child and is not a recorded foreign workflow.`);
  }
  if (input.index !== void 0) {
    const step = status.steps?.[input.index];
    if (!Number.isInteger(input.index) || input.index < 0 || !step) return managementError(`Workflow '${runId}' index ${input.index} is out of range or invalid.`);
    if (step.status !== "running" && step.status !== "pending") return managementError(`Workflow '${runId}' child ${input.index} is ${step.status} and cannot be steered.`);
    if (typeof step.workflowKey !== "string" || !step.workflowKey.trim()) return managementError(`Workflow '${runId}' child ${input.index} has no projected workflow key.`);
  }
  const requestId = randomUUID2();
  try {
    requestAsyncSteer(asyncDir, { id: requestId, message: input.message, mode: input.mode, ...input.index !== void 0 ? { targetIndex: input.index } : {}, source: "steer-action" });
  } catch (error) {
    return managementError(`Failed to queue steering for workflow ${runId}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const steering = await waitForSteeringAction({ asyncDir, sourceRunId: runId, requestId, timeoutMs: input.ackTimeoutMs ?? 3e3, signal: input.signal }) ?? { requestId, state: "pending", deliveryStatus: "queued", sourceRunId: runId, targets: input.index === void 0 ? [] : [{ index: input.index, state: "pending" }] };
  const failed = steering.state === "failed" || steering.state === "partial";
  return {
    content: [{ type: "text", text: steeringReceipt(input.message, `Steering ${failed ? steering.state : steering.deliveryStatus === "delivered" ? "delivered" : "queued"} for workflow ${runId} (request ${requestId}).`) }],
    ...failed ? { isError: true } : {},
    details: { mode: "management", results: [], steering }
  };
}
async function steerWorkflowForegroundTarget(input) {
  const { control, sourceRunId } = input.target;
  const activeIndexes = [...control.activeChildren?.keys() ?? []].sort((left, right) => left - right);
  const index = input.index ?? (activeIndexes.length === 1 ? activeIndexes[0] : void 0);
  if (index === void 0) {
    return managementError(activeIndexes.length === 0 ? `Foreground run '${control.runId}' has no live child session.` : `Foreground run '${control.runId}' has ${activeIndexes.length} live child sessions; provide index.`);
  }
  const child = control.activeChildren?.get(index);
  if (!child) return managementError(`Foreground run '${control.runId}' child ${index} is not live.`);
  if (!child.steer) return managementError(`Foreground run '${control.runId}' child ${index} does not support steering.`);
  const message = input.message.trim();
  const requestId = randomUUID2();
  const outcome = await child.steer({ message, ...input.mode && input.mode !== "steer" ? { mode: input.mode } : {} });
  const target = outcome.state === "delivered" ? { index, state: "delivered", deliveredAt: Date.now() } : outcome.state === "queued" ? { index, state: "queued" } : { index, state: "failed", reason: outcome.reason };
  const steering = {
    requestId,
    state: outcome.state === "delivered" ? "delivered" : outcome.state === "failed" ? "failed" : "pending",
    deliveryStatus: outcome.state === "delivered" ? "delivered" : "queued",
    sourceRunId,
    targets: [target]
  };
  if (outcome.state === "delivered") {
    return { content: [{ type: "text", text: steeringReceipt(message, `Steering delivered for foreground run ${control.runId} (request ${requestId}).`) }], details: { mode: "management", results: [], steering } };
  }
  if (outcome.state === "queued") {
    return { content: [{ type: "text", text: steeringReceipt(message, `Steering queued for foreground run ${control.runId} (request ${requestId}).`) }], details: { mode: "management", results: [], steering } };
  }
  return { content: [{ type: "text", text: steeringReceipt(message, `Steering failed for foreground run ${control.runId} (request ${requestId}): ${outcome.reason ?? "unknown error"}`) }], isError: true, details: { mode: "management", results: [], steering } };
}

// src/tui/fleet-transcript.ts
import * as fs3 from "node:fs";
import * as path4 from "node:path";
import { getLanguageFromPath, highlightCode } from "@earendil-works/pi-coding-agent";
import { Markdown, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
var DEFAULT_MAX_RECORDS = 240;
var DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
var MAX_MESSAGE_CHARS = 64 * 1024;
var TOOL_PREVIEW_LINES = 7;
function sanitizeJsonDisplayValue(value) {
  if (typeof value === "string") {
    const safe = safeTerminalText(value);
    return { value: safe, changed: safe !== value };
  }
  if (Array.isArray(value)) {
    const sanitized = value.map(sanitizeJsonDisplayValue);
    return {
      value: sanitized.map((entry) => entry.value),
      changed: sanitized.some((entry) => entry.changed)
    };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const sanitized = /* @__PURE__ */ Object.create(null);
    for (const [key, nested] of Object.entries(value)) {
      const safeKey = safeTerminalText(key);
      const safeValue = sanitizeJsonDisplayValue(nested);
      sanitized[safeKey] = safeValue.value;
      changed ||= safeKey !== key || safeValue.changed;
    }
    return { value: changed ? sanitized : value, changed };
  }
  return { value, changed: false };
}
function safeToolArgsPayload(payload) {
  try {
    const sanitized = sanitizeJsonDisplayValue(JSON.parse(payload));
    return sanitized.changed ? JSON.stringify(sanitized.value) : safeTerminalText(payload);
  } catch {
    return safeTerminalText(payload);
  }
}
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function stringValue(value) {
  return typeof value === "string" && value.trim() ? value : void 0;
}
function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function pathWithin(base, candidate) {
  const resolvedBase = path4.resolve(base);
  const resolvedCandidate = path4.resolve(candidate);
  return resolvedCandidate === resolvedBase || resolvedCandidate.startsWith(`${resolvedBase}${path4.sep}`);
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function isNotFoundError(error) {
  return Boolean(objectValue(error)?.code === "ENOENT");
}
function validateTranscriptPath(filePath, trustedRoots, trustedFiles = [], trustedFileRoot) {
  if (trustedRoots.length === 0 && (!trustedFileRoot || trustedFiles.length === 0)) return { warning: `Transcript preview has no trusted root: ${filePath}` };
  const resolvedPath = path4.resolve(filePath);
  const recordedCandidate = trustedFileRoot && pathWithin(trustedFileRoot, resolvedPath) && trustedFiles.some((file) => path4.resolve(file) === resolvedPath);
  if (!trustedRoots.some((root) => pathWithin(root, resolvedPath)) && !recordedCandidate) {
    return { warning: `Transcript is outside trusted roots: ${filePath}` };
  }
  let stat;
  try {
    stat = fs3.lstatSync(resolvedPath);
  } catch (error) {
    if (isNotFoundError(error)) return {};
    return { warning: `Transcript could not be inspected: ${errorMessage(error)}` };
  }
  if (stat.isSymbolicLink()) return { warning: `Transcript preview refused a symlink: ${filePath}` };
  if (!stat.isFile()) return { warning: `Transcript path is not a file: ${filePath}` };
  try {
    const realPath = fs3.realpathSync(resolvedPath);
    const realRoots = trustedRoots.filter((root) => fs3.existsSync(root)).map((root) => fs3.realpathSync(root));
    if (!realRoots.some((root) => pathWithin(root, realPath)) && !isTrustedRecordedSessionFile(realPath, trustedFiles, trustedFileRoot)) {
      return { warning: `Transcript resolves outside trusted roots: ${filePath}` };
    }
    return { resolvedPath: realPath };
  } catch (error) {
    return { warning: `Transcript path could not be resolved: ${errorMessage(error)}` };
  }
}
function isCompleteRecord(line) {
  if (!line?.trim()) return false;
  try {
    return objectValue(JSON.parse(line)) !== void 0;
  } catch {
    return false;
  }
}
function readTailLines(filePath, maxBytes) {
  let fd;
  try {
    const noFollow = typeof fs3.constants.O_NOFOLLOW === "number" ? fs3.constants.O_NOFOLLOW : 0;
    fd = fs3.openSync(filePath, fs3.constants.O_RDONLY | noFollow);
    const stat = fs3.fstatSync(fd);
    if (!stat.isFile()) return { lines: [], truncated: false, warning: `Transcript path is not a file: ${filePath}` };
    if (stat.size === 0) return { lines: [], truncated: false };
    const bytesToRead = Math.min(stat.size, maxBytes);
    const start = stat.size - bytesToRead;
    const buffer = Buffer.alloc(bytesToRead);
    const bytesRead = fs3.readSync(fd, buffer, 0, bytesToRead, start);
    const content = buffer.subarray(0, bytesRead).toString("utf-8");
    const endsWithNewline = content.endsWith("\n");
    let lines = content.split(/\r?\n/);
    if (start > 0 && lines.length > 0) lines = lines.slice(1);
    if (lines.at(-1) === "") lines = lines.slice(0, -1);
    else if (!endsWithNewline && !isCompleteRecord(lines.at(-1))) lines = lines.slice(0, -1);
    return { lines, truncated: start > 0 };
  } catch (error) {
    return { lines: [], truncated: false, warning: `Transcript could not be read: ${errorMessage(error)}` };
  } finally {
    if (fd !== void 0) fs3.closeSync(fd);
  }
}
function clipMessage(text) {
  if (text.length <= MAX_MESSAGE_CHARS) return text;
  return `${text.slice(0, MAX_MESSAGE_CHARS)}

\u2026 message truncated`;
}
function safeTranscriptEvent(event) {
  if (event.kind === "assistant") {
    return {
      ...event,
      text: safeTerminalText(event.text),
      ...event.model ? { model: safeTerminalText(event.model) } : {}
    };
  }
  if (event.kind === "user" || event.kind === "notice") {
    return { ...event, text: safeTerminalText(event.text) };
  }
  return {
    ...event,
    name: safeTerminalText(event.name),
    ...event.args !== void 0 ? { args: safeTerminalText(event.args) } : {},
    ...event.argsPayload !== void 0 ? { argsPayload: safeToolArgsPayload(event.argsPayload) } : {},
    ...event.output !== void 0 ? { output: safeTerminalText(event.output) } : {},
    ...event.error !== void 0 ? { error: safeTerminalText(event.error) } : {}
  };
}
function findTool(events, toolCallId, name) {
  if (toolCallId) {
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (event?.kind === "tool" && event.toolCallId === toolCallId) return event;
    }
    return void 0;
  }
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.kind !== "tool") continue;
    const tool = event;
    if ((!name || tool.name === name) && !tool.resultSeen) return tool;
  }
  return void 0;
}
function appendTextEvent(events, kind, text, metadata) {
  const clipped = clipMessage(text.trim());
  if (!clipped) return;
  const previous = events.at(-1);
  if (previous?.kind === kind && previous.text === clipped) return;
  events.push({ kind, text: clipped, ...metadata });
}
function parseTranscriptLines(lines, conversationStarted = false) {
  const events = [];
  let malformed = 0;
  let explicitTruncation = false;
  let assistantSeen = conversationStarted;
  for (const line of lines) {
    if (!line.trim()) continue;
    let record;
    try {
      record = objectValue(JSON.parse(line));
    } catch {
      malformed++;
      continue;
    }
    if (!record) {
      malformed++;
      continue;
    }
    const recordType = stringValue(record.recordType);
    const timestamp = numberValue(record.ts);
    if (recordType === "truncated") {
      explicitTruncation = true;
      continue;
    }
    if (recordType === "tool_start") {
      const name = stringValue(record.toolName) ?? "tool";
      events.push({
        kind: "tool",
        ...stringValue(record.toolCallId) ? { toolCallId: stringValue(record.toolCallId) } : {},
        name,
        ...stringValue(record.argsPreview) ? { args: stringValue(record.argsPreview) } : {},
        ...stringValue(record.argsPayload) ? { argsPayload: stringValue(record.argsPayload) } : {},
        status: "running",
        ...timestamp !== void 0 ? { timestamp, startedAt: timestamp } : {}
      });
      continue;
    }
    if (recordType === "tool_end") {
      const tool = findTool(events, stringValue(record.toolCallId), stringValue(record.toolName));
      if (tool && !tool.resultSeen) tool.status = record.isError === true ? "error" : "complete";
      if (tool && timestamp !== void 0 && tool.endedAt === void 0) tool.endedAt = timestamp;
      continue;
    }
    if (recordType === "stderr") {
      const text2 = stringValue(record.text);
      if (text2) events.push({ kind: "notice", text: clipMessage(text2), tone: "error", ...timestamp !== void 0 ? { timestamp } : {} });
      continue;
    }
    if (recordType !== "message") continue;
    const message = objectValue(record.message);
    const role = stringValue(record.role) ?? stringValue(message?.role);
    const text = stringValue(record.text) ?? stringValue(message?.text) ?? stringValue(message?.content);
    if (role === "toolResult" || role === "tool_result") {
      const toolCallId = stringValue(record.toolCallId) ?? stringValue(message?.toolCallId);
      const name = stringValue(record.toolName) ?? stringValue(message?.toolName) ?? "tool";
      const failed = record.isError === true || message?.isError === true;
      let tool = findTool(events, toolCallId, name);
      if (!tool) {
        tool = {
          kind: "tool",
          ...toolCallId ? { toolCallId } : {},
          name,
          status: failed ? "error" : "complete",
          ...timestamp !== void 0 ? { timestamp } : {}
        };
        events.push(tool);
      }
      if (!tool.resultSeen) {
        tool.resultSeen = true;
        tool.status = failed ? "error" : "complete";
        if (timestamp !== void 0 && tool.endedAt === void 0) tool.endedAt = timestamp;
        if (text && (!failed || tool.output === void 0)) {
          tool.output = clipMessage(text);
          tool.outputTruncated = record.outputTruncated === true || text.includes("\u2026 payload truncated") || text.includes("[Showing lines");
        }
        if (failed && text) tool.error = clipMessage(text.split(/\r?\n/).find((candidate) => candidate.trim()) ?? text);
      }
      continue;
    }
    if (role === "assistant") {
      assistantSeen = true;
      const rawModel = stringValue(record.model) ?? stringValue(message?.model);
      const provider = stringValue(message?.provider);
      const model = rawModel && provider ? `${provider}/${rawModel}` : rawModel;
      if (text) appendTextEvent(events, "assistant", text, {
        ...model ? { model } : {},
        ...timestamp !== void 0 ? { timestamp } : {}
      });
      continue;
    }
    if (role === "user" && assistantSeen && text) {
      appendTextEvent(events, "user", text, timestamp !== void 0 ? { timestamp } : {});
    }
  }
  for (const event of events) {
    if (event.kind === "tool") delete event.resultSeen;
  }
  return { events: events.map(safeTranscriptEvent), malformed, explicitTruncation };
}
function readFleetTranscript(filePath, options) {
  const validated = validateTranscriptPath(filePath, options.trustedRoots, options.trustedFiles, options.trustedFileRoot);
  if (!validated.resolvedPath) {
    return { path: filePath, events: [], truncated: false, readFailed: true, ...validated.warning ? { warning: safeTerminalText(validated.warning) } : {} };
  }
  const maxRecords = Math.max(1, options.maxRecords ?? DEFAULT_MAX_RECORDS);
  const tail = readTailLines(validated.resolvedPath, Math.max(1024, options.maxBytes ?? DEFAULT_MAX_BYTES));
  const recordsOmitted = tail.truncated || tail.lines.length > maxRecords;
  const selectedLines = tail.lines.slice(-maxRecords);
  const parsed = parseTranscriptLines(selectedLines, recordsOmitted);
  const warnings = [
    tail.warning,
    parsed.malformed > 0 ? `Skipped ${parsed.malformed} malformed transcript record${parsed.malformed === 1 ? "" : "s"}.` : void 0
  ].filter((value) => Boolean(value));
  return {
    path: filePath,
    events: parsed.events,
    truncated: tail.truncated || tail.lines.length > maxRecords || parsed.explicitTruncation,
    ...tail.warning ? { readFailed: true } : {},
    ...warnings.length ? { warning: safeTerminalText(warnings.join(" ")) } : {}
  };
}
function statusGlyph(event, theme) {
  if (event.status === "running") return theme.fg("warning", "\u25CF");
  if (event.status === "error") return theme.fg("error", "\u2717");
  return theme.fg("success", "\u2713");
}
function jsonScalar(value) {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return void 0;
}
function parseToolArgs(event) {
  if (!event.argsPayload) return void 0;
  try {
    return objectValue(JSON.parse(event.argsPayload));
  } catch {
    return void 0;
  }
}
function toolDuration(event) {
  if (event.startedAt === void 0 || event.endedAt === void 0) return void 0;
  return `${((event.endedAt - event.startedAt) / 1e3).toFixed(1)}s`;
}
function renderExpandedTool(event, width, theme) {
  const lines = [];
  const args = parseToolArgs(event);
  const glyph = statusGlyph(event, theme);
  const output = event.output ?? event.error;
  const outputColor = event.status === "error" ? "error" : "toolOutput";
  if (event.name === "bash") {
    const command = jsonScalar(args?.command) ?? event.args ?? "(unknown command)";
    lines.push(railLine(`${glyph} ${theme.fg("toolTitle", theme.bold(`$ ${command}`))}`, width, theme));
    if (output) {
      for (const outputLine of output.replace(/\s+$/, "").split(/\r?\n/)) {
        for (const wrapped of renderWrapped(theme.fg(outputColor, outputLine), Math.max(1, width - 4))) {
          lines.push(railLine(`  ${wrapped}`, width, theme));
        }
      }
    }
    const duration = toolDuration(event);
    if (duration) lines.push(railLine(theme.fg("dim", `  Took ${duration}`), width, theme));
    return lines;
  }
  if (event.name === "read") {
    const filePath = jsonScalar(args?.path ?? args?.file_path);
    const language = filePath ? getLanguageFromPath(filePath) : void 0;
    const rendered = !output ? [] : event.status === "error" ? output.split("\n").map((line) => theme.fg("error", line)) : language ? highlightCode(output, language) : output.split("\n");
    lines.push(railLine(`${glyph} ${theme.fg("toolTitle", theme.bold(`read ${filePath ?? event.args ?? ""}`))}`, width, theme));
    for (const line of rendered) {
      for (const wrapped of renderWrapped(line, Math.max(1, width - 4))) lines.push(railLine(`  ${wrapped}`, width, theme));
    }
    return lines;
  }
  lines.push(railLine(`${glyph} ${theme.fg("toolTitle", theme.bold(event.name))}`, width, theme));
  if (event.argsPayload) {
    lines.push(railLine(theme.fg("dim", "  args"), width, theme));
    for (const argLine of event.argsPayload.split(/\r?\n/)) {
      for (const wrapped of renderWrapped(theme.fg("muted", argLine), Math.max(1, width - 4))) lines.push(railLine(`  ${wrapped}`, width, theme));
    }
  }
  if (output) {
    lines.push(railLine(theme.fg(event.status === "error" ? "error" : "dim", event.status === "error" ? "  error" : "  output"), width, theme));
    for (const outputLine of output.split(/\r?\n/)) {
      for (const wrapped of renderWrapped(theme.fg(outputColor, outputLine), Math.max(1, width - 4))) lines.push(railLine(`  ${wrapped}`, width, theme));
    }
  }
  return lines;
}
function bounded(text, width) {
  return truncateToWidth(text, Math.max(0, width));
}
function railLine(content, width, theme) {
  return bounded(`${theme.fg("borderMuted", "\u2502")} ${content}`, width);
}
function renderWrapped(text, width) {
  return wrapTextWithAnsi(text, Math.max(1, width));
}
function renderFleetTranscript(transcript, width, theme, markdownTheme, options = {}) {
  if (width <= 0) return [];
  const lines = [];
  if (transcript.truncated) lines.push(bounded(theme.fg("dim", "\u2191 Earlier activity omitted"), width));
  if (transcript.warning) {
    for (const line of renderWrapped(safeTerminalText(transcript.warning), Math.max(1, width - 2))) {
      lines.push(bounded(`${theme.fg("warning", "!")} ${theme.fg("warning", line)}`, width));
    }
  }
  for (const rawEvent of transcript.events) {
    const event = safeTranscriptEvent(rawEvent);
    if (event.kind === "tool") {
      if (options.expandedTools && (event.output || event.argsPayload || event.error)) {
        lines.push(...renderExpandedTool(event, width, theme));
        lines.push(railLine(theme.fg("dim", "  x to collapse"), width, theme));
        continue;
      }
      const title = theme.fg("toolTitle", theme.bold(event.name));
      const args = event.args ? ` ${theme.fg("dim", event.args)}` : "";
      const suffix = event.status === "running" ? theme.fg("warning", " running") : "";
      lines.push(bounded(`${theme.fg("borderMuted", "\u251C\u2500")} ${statusGlyph(event, theme)} ${title}${args}${suffix}`, width));
      if (event.output && event.status !== "error" && event.name === "bash") {
        const outputLines = event.output.replace(/\s+$/, "").split(/\r?\n/);
        const visible = outputLines.slice(-TOOL_PREVIEW_LINES);
        const hidden = Math.max(0, outputLines.length - visible.length);
        for (const outputLine of visible) {
          for (const wrapped of renderWrapped(theme.fg("toolOutput", outputLine), Math.max(1, width - 4))) {
            lines.push(railLine(`  ${wrapped}`, width, theme));
          }
        }
        if (hidden > 0) lines.push(railLine(theme.fg("dim", `  \u2026 ${hidden} earlier lines \xB7 x to expand`), width, theme));
        const duration = toolDuration(event);
        lines.push(railLine(theme.fg("dim", `  Took${duration ? ` ${duration}` : ""}`), width, theme));
      } else if (event.output && event.status !== "error") {
        const summary = truncateToWidth(event.output.replace(/\s+/g, " ").trim(), Math.max(1, width - 18), "\u2026");
        if (summary) lines.push(railLine(theme.fg("dim", `  ${summary} \xB7 x to expand`), width, theme));
      }
      if (event.error) {
        for (const errorLine of renderWrapped(event.error, Math.max(1, width - 4))) {
          lines.push(railLine(theme.fg("error", `  ${errorLine}`), width, theme));
        }
      }
      continue;
    }
    if (event.kind === "notice") {
      const color = event.tone === "error" ? "error" : event.tone === "warning" ? "warning" : "dim";
      for (const noticeLine of renderWrapped(event.text, Math.max(1, width - 2))) {
        lines.push(railLine(theme.fg(color, noticeLine), width, theme));
      }
      continue;
    }
    const assistant = event.kind === "assistant";
    const label = assistant ? "Assistant" : "Supervisor";
    const marker = assistant ? theme.fg("accent", "\u25C6") : theme.fg("warning", "\u25C7");
    const model = assistant && event.model ? theme.fg("dim", ` \xB7 ${event.model}`) : "";
    lines.push(bounded(`${marker} ${theme.bold(label)}${model}`, width));
    if (assistant) {
      const rendered = new Markdown(event.text, 0, 0, markdownTheme).render(Math.max(1, width - 2));
      for (const markdownLine of rendered) lines.push(railLine(markdownLine, width, theme));
    } else {
      for (const userLine of renderWrapped(event.text, Math.max(1, width - 2))) {
        lines.push(railLine(userLine, width, theme));
      }
    }
    lines.push(theme.fg("borderMuted", "\u2502"));
  }
  while (lines.length > 0 && visibleWidth(lines.at(-1) ?? "") === 1) lines.pop();
  return lines;
}

// src/inspectors/types.ts
var INSPECTOR_ACTIONS = ["inspector.open", "inspector.command", "inspector.status", "inspector.close"];

// src/inspectors/actions.ts
import * as fs4 from "node:fs";
import * as path5 from "node:path";
import { fileURLToPath } from "node:url";

// src/inspectors/session-roots-codec.ts
function encodeSessionRoots(roots) {
  return Buffer.from(JSON.stringify(roots), "utf-8").toString("base64");
}

// src/inspectors/actions.ts
var INSPECTOR_LEASE_WAIT_MS = 3e4;
function result(text, isError = false) {
  const response = {
    content: [{ type: "text", text }],
    details: { mode: "management", results: [] }
  };
  if (isError) response.isError = true;
  return response;
}
function pathWithin2(base, candidate) {
  const resolvedBase = path5.resolve(base);
  const resolvedCandidate = path5.resolve(candidate);
  return resolvedCandidate === resolvedBase || resolvedCandidate.startsWith(`${resolvedBase}${path5.sep}`);
}
function trustedDir(dir, deps) {
  try {
    if (fs4.lstatSync(dir).isSymbolicLink() || !fs4.statSync(dir).isDirectory()) return false;
    const real = fs4.realpathSync(dir);
    if ([...deps.state?.asyncJobs.values() ?? [], ...deps.state?.fleetJobs?.values() ?? []].some((job) => {
      try {
        return fs4.realpathSync(job.asyncDir) === real;
      } catch {
        return false;
      }
    })) return true;
    const root = deps.asyncDirRoot ?? DIRS.async;
    return fs4.existsSync(root) && pathWithin2(root, dir) && pathWithin2(fs4.realpathSync(root), real);
  } catch {
    return false;
  }
}
function resolveTarget(params, deps) {
  const requested = params.id ?? params.runId;
  let runId;
  let asyncDir;
  if (params.dir) {
    asyncDir = path5.resolve(params.dir);
    if (!trustedDir(asyncDir, deps)) return { error: `Async run directory '${asyncDir}' is outside trusted run roots.` };
    const status2 = readStatus(asyncDir);
    if (!status2) return { error: `No async run status found in '${asyncDir}'.` };
    if (requested && requested !== status2.runId && !status2.runId.startsWith(requested)) return { error: `Run '${requested}' does not match status run '${status2.runId}'.` };
    runId = status2.runId;
  } else {
    if (!requested) return { error: "Inspector actions require id or dir." };
    try {
      const found = resolveSubagentRunId(requested, { state: deps.state, asyncDirRoot: deps.asyncDirRoot ?? DIRS.async, resultsDir: deps.resultsDir ?? DIRS.results });
      if (!found) return { error: `No subagent run found for '${requested}'.` };
      if (found.kind !== "async" || !found.location.asyncDir) return { error: `Run '${found.id}' is not an inspectable async run with lifecycle artifacts.` };
      runId = found.id;
      asyncDir = found.location.asyncDir;
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : String(cause) };
    }
  }
  const status = readStatus(asyncDir);
  if (!status) return { error: `No lifecycle status exists for async run '${runId}'.` };
  if (params.index !== void 0 && (params.index < 0 || params.index >= (status.steps?.length ?? 0))) return { error: `Async run '${runId}' has ${status.steps?.length ?? 0} children. Index ${params.index} is out of range.` };
  const target = { runId, asyncDir, status: { cwd: status.cwd, state: status.state, steps: status.steps } };
  if (params.index !== void 0) target.index = params.index;
  return target;
}
function missionFor(target, deps) {
  try {
    const binding = readMissionBinding(target.asyncDir);
    if (binding) return { id: binding.missionId, path: missionRecordPath(binding.location, binding.missionId) };
    const location = resolveMissionStoreLocation(deps.missions ? { projectRoot: deps.cwd, config: deps.missions } : { projectRoot: deps.cwd });
    const mission = listMissions(location).records.find((record) => record.runs.some((run) => run.runId === target.runId));
    return mission ? { id: mission.id, path: missionRecordPath(location, mission.id) } : void 0;
  } catch {
    return void 0;
  }
}
function launchFor(target, deps) {
  const mission = missionFor(target, deps);
  const runnerPath = deps.runnerPath ?? fileURLToPath(new URL("../../inspector-runner.mjs", new URL("../src/inspectors/actions.js", import.meta.url).href));
  const job = deps.state?.asyncJobs.get(target.runId) ?? deps.state?.fleetJobs?.get(target.runId);
  const sessionRoots = [.../* @__PURE__ */ new Set([...deps.sessionRoots ?? deps.state?.trustedSessionRoots ?? [], ...job?.sessionRoot ? [job.sessionRoot] : []])];
  const allowSteer = resolveAuthorityDecision({ action: "steerRun", policy: deps.authorityPolicy }) === "auto";
  const allowStop = resolveAuthorityDecision({ action: "stopRun", policy: deps.authorityPolicy }) === "auto";
  const argv = [runnerPath, "--async-dir", target.asyncDir, "--run-id", target.runId, "--allow-steer", String(allowSteer), "--allow-stop", String(allowStop), "--session-roots", encodeSessionRoots(sessionRoots)];
  if (target.index !== void 0) argv.push("--index", String(target.index));
  if (mission) argv.push("--mission-path", mission.path);
  const executable = resolveNodeExecutable();
  const launch = { executable, argv, displayCommand: formatShellCommand(executable, argv), allowSteer, allowStop, sessionRoots };
  if (mission) launch.mission = mission;
  return launch;
}
async function handleInspectorAction(action, params, deps) {
  const target = resolveTarget(params, deps);
  if ("error" in target) return result(target.error, true);
  const context = {
    cwd: deps.cwd,
    signal: deps.signal,
    env: deps.env ?? process.env,
    target
  };
  if (deps.now) context.now = deps.now;
  if (action === "inspector.command") return result(launchFor(target, deps).displayCommand);
  const plugins = deps.plugins ?? [];
  if (action === "inspector.status") {
    const owner = plugins.find((plugin) => plugin.owns(context));
    if (!owner) return result(`No inspector plugin owns this binding for async run ${target.runId}.`);
    return owner.status ? owner.status(context) : result(`Inspector plugin '${owner.name}' does not support status for async run ${target.runId}.`, true);
  }
  const label = target.index === void 0 ? "" : ` child ${target.index}`;
  const lockPath = path5.join(fs4.realpathSync.native(target.asyncDir), `inspector-${target.index ?? "root"}.lock`);
  const deadline = Date.now() + (deps.leaseWaitMs ?? INSPECTOR_LEASE_WAIT_MS);
  let release = tryLease(lockPath);
  while (!release) {
    if (deps.signal?.aborted) return result(`Inspector ${action} for async run ${target.runId}${label} was cancelled while waiting for another inspector open or close to finish.`, true);
    if (Date.now() >= deadline) return result(`Another inspector open or close for async run ${target.runId}${label} is still in progress. Try again when it finishes.`, true);
    await new Promise((resolve3) => setTimeout(resolve3, 50));
    release = tryLease(lockPath);
  }
  try {
    if (deps.signal?.aborted) return result(`Inspector ${action} for async run ${target.runId}${label} was cancelled while waiting for another inspector open or close to finish.`, true);
    if (action === "inspector.open") {
      for (const plugin of plugins) {
        if (await plugin.available(context)) return await plugin.open(context, launchFor(target, deps), params);
      }
      return result("No inspector plugin is available. Start a supported inspector host, or use inspector.command for a standalone command.", true);
    }
    const owner = plugins.find((plugin) => plugin.owns(context));
    if (!owner) return result(`No inspector plugin owns this binding for async run ${target.runId}.`);
    return owner.close ? await owner.close(context) : result(`Inspector plugin '${owner.name}' does not support close for async run ${target.runId}.`, true);
  } finally {
    release();
  }
}

// src/runs/foreground/prompt-audit.ts
var livePrompts = /* @__PURE__ */ new WeakMap();
function fullModelId(model) {
  return `${model.provider}/${model.id}`;
}
function textContent(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((item) => item && typeof item === "object" && item.type === "text" ? String(item.text ?? "") : "").join("");
}
function finalAssistantText(agent) {
  for (let index = agent.state.messages.length - 1; index >= 0; index--) {
    const message = agent.state.messages[index];
    if (message && typeof message === "object" && message.role === "assistant") {
      return textContent(message.content).trim();
    }
  }
  return "";
}
async function resolveRewriteAuth(ctx, model) {
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (auth.ok === false) throw new Error(`Prompt redo model auth failed for ${fullModelId(model)}: ${auth.error}`);
  return {
    ...auth.apiKey ? { apiKey: auth.apiKey } : {},
    ...auth.headers ? { headers: auth.headers } : {},
    ...auth.env ? { env: auth.env } : {}
  };
}
async function rewritePromptWithGuidance(input) {
  const model = input.ctx.model;
  if (!model) throw new Error("Prompt redo needs the current session model to rewrite the authored task.");
  const [{ Agent }, { convertToLlm }] = await Promise.all([
    import("@earendil-works/pi-agent-core"),
    import("@earendil-works/pi-coding-agent")
  ]);
  const auth = await resolveRewriteAuth(input.ctx, model);
  const baseStreamFn = input.streamFn ?? ((nextModel, context, streamOptions) => input.ctx.modelRegistry.streamSimple(nextModel, context, streamOptions));
  const sessionId = input.ctx.sessionManager.getSessionId();
  const streamFn = (nextModel, context, streamOptions) => baseStreamFn(nextModel, context, {
    ...streamOptions,
    ...auth.apiKey ? { apiKey: auth.apiKey } : {},
    env: auth.env || streamOptions?.env ? { ...auth.env ?? {}, ...streamOptions?.env ?? {} } : void 0,
    headers: { ...opencodeSessionHeaders(nextModel, sessionId), ...streamOptions?.headers ?? {}, ...auth.headers ?? {} }
  });
  const ctxThinking = input.ctx.getThinkingLevel?.();
  const agent = new Agent({
    initialState: {
      systemPrompt: [
        "Rewrite one subagent authored task from Prompt Audit context.",
        "Return only the revised authored task text.",
        "Do not add Markdown fences, explanations, labels, or commentary.",
        "Preserve the original intent unless the guidance explicitly changes it.",
        "Do not include runtime additions unless they are needed as ordinary task context."
      ].join("\n"),
      model,
      thinkingLevel: ctxThinking ?? "off",
      tools: []
    },
    convertToLlm,
    ...agentStreamOptions(streamFn),
    getApiKey: (providerName) => providerName === model.provider ? auth.apiKey : void 0,
    toolExecution: "sequential"
  });
  const abort = () => agent.abort();
  input.ctx.signal?.addEventListener("abort", abort, { once: true });
  input.signal?.addEventListener("abort", abort, { once: true });
  try {
    await agent.prompt([
      "Guidance from the human:",
      input.guidance.trim(),
      "",
      "Authored task:",
      input.authoredTask,
      "",
      "Runtime additions for context only:",
      input.runtimeAdditions,
      "",
      "Final effective prompt for context only:",
      input.finalEffectivePrompt
    ].join("\n"));
  } finally {
    input.ctx.signal?.removeEventListener("abort", abort);
    input.signal?.removeEventListener("abort", abort);
  }
  const rewritten = finalAssistantText(agent);
  if (!rewritten) throw new Error("Prompt redo rewrite returned an empty prompt.");
  return rewritten;
}
function runtimeAdditions(authoredTask, effectivePrompt) {
  if (!authoredTask) return effectivePrompt;
  const authoredIndex = effectivePrompt.indexOf(authoredTask);
  if (authoredIndex < 0) return "(runtime additions unavailable)";
  const before = effectivePrompt.slice(0, authoredIndex).trim();
  const after = effectivePrompt.slice(authoredIndex + authoredTask.length).trim();
  return [before, after].filter(Boolean).join("\n\n") || "(none)";
}
function registerLivePromptAudit(control, index, authoredTask, effectivePrompt, metadata = {}) {
  let prompts = livePrompts.get(control);
  if (!prompts) {
    prompts = /* @__PURE__ */ new Map();
    livePrompts.set(control, prompts);
  }
  prompts.set(index, {
    authoredTask,
    runtimeAdditions: runtimeAdditions(authoredTask, effectivePrompt),
    finalEffectivePrompt: effectivePrompt,
    ...metadata.cwd ? { cwd: metadata.cwd } : {},
    ...metadata.outputPath ? { outputPath: metadata.outputPath } : {},
    ...metadata.rerun ? { rerun: metadata.rerun } : {}
  });
}
function updateLiveEffectivePrompt(control, index, effectivePrompt) {
  const prompt = livePrompts.get(control)?.get(index);
  if (!prompt) return;
  prompt.finalEffectivePrompt = effectivePrompt;
  prompt.runtimeAdditions = runtimeAdditions(prompt.authoredTask, effectivePrompt);
}
function getLivePromptAudit(control, index) {
  return livePrompts.get(control)?.get(index);
}
function removeLivePromptAudit(control, index) {
  const prompts = livePrompts.get(control);
  if (!prompts) return;
  prompts.delete(index);
  if (prompts.size === 0) livePrompts.delete(control);
}

export {
  steeringReceipt,
  createSteeringStatus,
  steeringStatus,
  recordSteeringRequest,
  updateSteeringTarget,
  waitForSteeringAction,
  canQueueRetainedAsyncFollowUp,
  steerAsyncRun,
  workflowAsyncChildSteeringGuidance,
  resolveWorkflowForegroundSteeringTarget,
  steerWorkflowRun,
  steerWorkflowForegroundTarget,
  readFleetTranscript,
  renderFleetTranscript,
  INSPECTOR_ACTIONS,
  handleInspectorAction,
  rewritePromptWithGuidance,
  registerLivePromptAudit,
  updateLiveEffectivePrompt,
  getLivePromptAudit,
  removeLivePromptAudit
};
