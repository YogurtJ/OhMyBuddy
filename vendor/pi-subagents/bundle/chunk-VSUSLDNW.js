import {
  MODEL_ONLY_TOOL,
  agentStreamOptions,
  formatAsyncRunList,
  formatTimeoutRecoveryLines,
  inheritedSessionIds,
  listAsyncRuns,
  opencodeSessionHeaders,
  ownsRun,
  parseWorkflowChildSummary,
  projectTimeoutRecovery,
  readAsyncRecoveryDescriptor,
  utf8Tail
} from "./chunk-6XJB7PIX.js";
import {
  MAX_ARGS_BYTES,
  MAX_ARGS_DEPTH,
  MAX_ARGS_FIELDS,
  MAX_ARGS_ITEMS
} from "./chunk-NF7IEKBH.js";
import {
  fallbackResultPayloadPathForSessionRun,
  nestedRunScope,
  resultFilePath,
  resultPayloadMatchesSessionRun,
  resultPayloadPathForSessionRun
} from "./chunk-46XKCPJR.js";
import {
  shouldUseNativeFsWatch
} from "./chunk-NIXWDZZV.js";
import {
  PROJECT_SUBAGENTS_RELATIVE_DIR
} from "./chunk-5TYMSZX3.js";
import {
  listBackgroundWorkWakeChannels,
  snapshotBackgroundWork
} from "./chunk-N2BN7BF5.js";
import {
  SUBAGENT_WATCHDOG_WARNING_TYPE,
  THINKING_LEVELS,
  WATCHDOG_WARNING_CATEGORIES,
  WATCHDOG_WARNING_IMPORTANCES,
  WATCHDOG_WARNING_SEVERITIES,
  errorWithoutReplyText,
  formatDuration,
  getAgentDir,
  getProjectConfigDir,
  readStatus,
  resolveEffectiveThinking,
  resolveModelCandidate,
  shortenPath,
  splitKnownThinkingSuffix,
  toAgentToolUsage,
  toModelInfo,
  withSettingsFileLease,
  writeAtomicJson,
  writePrivateAtomicJson
} from "./chunk-CIZQXJ5Q.js";
import {
  ASYNC_DIR,
  DIRS,
  INTERCOM_DETACH_REQUEST_EVENT,
  POLL_INTERVAL_MS,
  SUBAGENT_ASYNC_COMPLETE_EVENT,
  SUBAGENT_CONTROL_EVENT,
  SUBAGENT_CONTROL_INTERCOM_EVENT,
  SUBAGENT_FOREGROUND_COMPLETE_EVENT,
  SUBAGENT_RESULT_INTERCOM_EVENT,
  TEMP_ROOT_DIR
} from "./chunk-5LFLVSTM.js";

// src/intercom/native-supervisor-channel.ts
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { Type } from "typebox";

// src/intercom/supervisor-ui.ts
var SUPERVISOR_REQUEST_MESSAGE_TYPE = "subagent_supervisor_request";
var SUPERVISOR_REPLY_ENTRY_TYPE = "subagent_supervisor_reply";
function supervisorReplyHint(requestId) {
  return `subagent_supervisor({ action: "reply", replyTo: "${requestId}", message: "..." })`;
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isSupervisorReason(value) {
  return value === "need_decision" || value === "interview_request" || value === "progress_update";
}
function optionalString(value) {
  return value === void 0 || typeof value === "string";
}
function parseSupervisorRequestDetails(value) {
  if (!isRecord(value)) return void 0;
  if (!optionalString(value.id) || !optionalString(value.requestId) || !optionalString(value.replyHint) || !optionalString(value.requestBody) || !optionalString(value.runId) || !optionalString(value.agent) || !optionalString(value.childTarget)) return void 0;
  if (value.reason !== void 0 && !isSupervisorReason(value.reason)) return void 0;
  if (value.expectsReply !== void 0 && typeof value.expectsReply !== "boolean") return void 0;
  if (value.childIndex !== void 0 && (typeof value.childIndex !== "number" || !Number.isFinite(value.childIndex))) return void 0;
  return value;
}
function parseSupervisorReplyData(value) {
  if (!isRecord(value)) return void 0;
  if (typeof value.requestId !== "string" || typeof value.runId !== "string" || typeof value.agent !== "string" || typeof value.message !== "string") return void 0;
  if (value.reason !== void 0 && !isSupervisorReason(value.reason)) return void 0;
  if (value.childTarget !== void 0 && typeof value.childTarget !== "string") return void 0;
  if (typeof value.childIndex !== "number" || !Number.isFinite(value.childIndex) || typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) return void 0;
  return {
    requestId: value.requestId,
    ...value.reason === void 0 ? {} : { reason: value.reason },
    runId: value.runId,
    agent: value.agent,
    childIndex: value.childIndex,
    ...value.childTarget === void 0 ? {} : { childTarget: value.childTarget },
    message: value.message,
    createdAt: value.createdAt
  };
}

// src/intercom/native-supervisor-channel.ts
var SUPERVISOR_CHANNEL_ROOT = path.join(TEMP_ROOT_DIR, "supervisor-channels");
var REQUESTS_DIR = "requests";
var REPLIES_DIR = "replies";
var NATIVE_SUPERVISOR_TOOL_NAME = "subagent_supervisor";
var MAX_MESSAGE_BYTES = 64 * 1024;
var DEFAULT_ASK_TIMEOUT_MS = 10 * 60 * 1e3;
var CHANNEL_POLL_MS = Math.min(POLL_INTERVAL_MS, 500);
var CHANNEL_SAFETY_POLL_MS = 5e3;
var STALE_EMPTY_CHANNEL_AGE_MS = 60 * 1e3;
var STALE_EMPTY_CHANNEL_CLEANUP_INTERVAL_MS = 60 * 1e3;
var MAX_SUPERVISOR_REQUEST_CORRELATIONS = 256;
var SUPERVISOR_REQUEST_CORRELATION_RETENTION_MS = 10 * 60 * 1e3;
var ContactSupervisorParamsSchema = Type.Object({
  reason: Type.String({ enum: ["need_decision", "interview_request", "progress_update"] }),
  message: Type.Optional(Type.String()),
  interview: Type.Optional(Type.Unsafe({ type: "object", additionalProperties: true }))
}, { additionalProperties: false });
var IntercomParamsSchema = Type.Object({
  action: Type.String({ enum: ["list", "pending", "status", "reply"] }),
  to: Type.Optional(Type.String()),
  message: Type.Optional(Type.String()),
  replyTo: Type.Optional(Type.String())
}, { additionalProperties: false });
function safeSegment(value) {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}
function resolveSupervisorChannelDir(runId, agent2, childIndex) {
  return path.join(SUPERVISOR_CHANNEL_ROOT, `${safeSegment(runId)}-${safeSegment(agent2)}-${childIndex}`);
}
function ensureSupervisorChannelDir(channelDir) {
  fs.mkdirSync(path.join(channelDir, REQUESTS_DIR), { recursive: true, mode: 448 });
  fs.mkdirSync(path.join(channelDir, REPLIES_DIR), { recursive: true, mode: 448 });
}
function requestPath(channelDir, requestId) {
  return path.join(channelDir, REQUESTS_DIR, `${safeSegment(requestId)}.json`);
}
function replyPath(channelDir, requestId) {
  return path.join(channelDir, REPLIES_DIR, `${safeSegment(requestId)}.json`);
}
function reasonHeading(reason) {
  if (reason === "interview_request") return "Subagent requests a structured supervisor interview.";
  if (reason === "progress_update") return "Subagent progress update.";
  return "Subagent needs a supervisor decision.";
}
function parseStructuredReply(message2) {
  const trimmed = message2.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  try {
    return { value: JSON.parse(fenced ?? trimmed) };
  } catch (error) {
    return { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}
function askTimeoutMs() {
  const parsed = Number(process.env.PI_INTERCOM_ASK_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ASK_TIMEOUT_MS;
}
function delay(ms, signal) {
  return new Promise((resolve5, reject) => {
    if (signal?.aborted) {
      reject(new Error("Supervisor request cancelled."));
      return;
    }
    let timer;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new Error("Supervisor request cancelled."));
    };
    timer = setTimeout(() => {
      cleanup();
      resolve5();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
function extendedDeadline(requestFile, deadline) {
  try {
    const expiresAt = JSON.parse(fs.readFileSync(requestFile, "utf-8")).expiresAt;
    return typeof expiresAt === "number" && Number.isFinite(expiresAt) ? Math.max(deadline, expiresAt) : deadline;
  } catch {
    return deadline;
  }
}
async function waitForReply(channelDir, requestId, initialDeadline, signal) {
  const file = replyPath(channelDir, requestId);
  const request = requestPath(channelDir, requestId);
  let deadline = initialDeadline;
  while (Date.now() <= deadline) {
    if (signal?.aborted) throw new Error("Supervisor request cancelled.");
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (parsed.type === "subagent.supervisor.reply" && parsed.requestId === requestId && typeof parsed.message === "string") {
        if (typeof parsed.error === "string") throw new Error(parsed.error);
        return parsed;
      }
    }
    await delay(250, signal);
    deadline = extendedDeadline(request, deadline);
  }
  throw new Error("Timed out waiting for supervisor reply.");
}
async function sendSupervisorRequest(params, metadata, signal, toolCallId) {
  if (!params.message?.trim() && params.reason !== "interview_request") {
    throw new Error("message is required for supervisor decisions and progress updates.");
  }
  ensureSupervisorChannelDir(metadata.channelDir);
  const requestId = randomUUID();
  const expectsReply = params.reason !== "progress_update";
  const createdAt = Date.now();
  const replyDeadline = createdAt + askTimeoutMs();
  const expiresAt = expectsReply ? replyDeadline : void 0;
  const message2 = params.message?.trim() ?? "";
  const requestToolCallId = typeof toolCallId === "string" && toolCallId.length > 0 ? toolCallId : void 0;
  const request = {
    type: "subagent.supervisor.request",
    id: requestId,
    createdAt,
    ...expiresAt !== void 0 ? { expiresAt } : {},
    reason: params.reason,
    message: message2,
    expectsReply,
    ...metadata.orchestratorTarget ? { orchestratorTarget: metadata.orchestratorTarget } : {},
    ...metadata.orchestratorSessionId ? { orchestratorSessionId: metadata.orchestratorSessionId } : {},
    runId: metadata.runId,
    agent: metadata.agent,
    childIndex: metadata.childIndex,
    ...requestToolCallId ? { toolCallId: requestToolCallId } : {},
    ...metadata.childTarget ? { childTarget: metadata.childTarget } : {},
    ...params.interview !== void 0 ? { interview: params.interview } : {}
  };
  const serialized = JSON.stringify(request, null, "	");
  if (Buffer.byteLength(serialized, "utf-8") > MAX_MESSAGE_BYTES) throw new Error("Supervisor request is too large.");
  writeAtomicJson(requestPath(metadata.channelDir, requestId), request);
  if (!expectsReply) {
    return {
      content: [{ type: "text", text: "Supervisor progress update queued." }],
      details: { delivered: true, requestId, reason: params.reason }
    };
  }
  try {
    const reply = await waitForReply(metadata.channelDir, requestId, replyDeadline, signal);
    const details = { requestId, reason: params.reason };
    if (params.reason === "interview_request") {
      const structured = parseStructuredReply(reply.message);
      if (structured.error) details.structuredReplyParseError = structured.error;
      else details.structuredReply = structured.value;
    }
    return {
      content: [{ type: "text", text: `**Reply from supervisor:**
${reply.message}` }],
      details
    };
  } catch (error) {
    removeRequestFile(requestPath(metadata.channelDir, requestId));
    throw error;
  }
}
function hasTool(pi, name) {
  try {
    return pi.getAllTools?.().some((tool) => tool.name === name) === true;
  } catch {
    return false;
  }
}
var CONTACT_SUPERVISOR_TOOL_NAME = "contact_supervisor";
var CONTACT_SUPERVISOR_DECLARATION = {
  name: CONTACT_SUPERVISOR_TOOL_NAME,
  ...MODEL_ONLY_TOOL,
  label: "Contact Supervisor",
  description: "Contact the parent/supervisor session for a blocking decision, structured interview, or progress update.",
  parameters: ContactSupervisorParamsSchema
};
var TOP_LEVEL_SUPERVISOR_REFUSAL = "contact_supervisor works only inside a subagent; this session has no supervisor.";
function topLevelSupervisorTool() {
  return {
    ...CONTACT_SUPERVISOR_DECLARATION,
    async execute() {
      return { isError: true, content: [{ type: "text", text: TOP_LEVEL_SUPERVISOR_REFUSAL }], details: {} };
    }
  };
}
function registerNativeSupervisorClient(pi, metadata) {
  if (!metadata || hasTool(pi, CONTACT_SUPERVISOR_TOOL_NAME)) return;
  const tool = {
    ...CONTACT_SUPERVISOR_DECLARATION,
    execute(id2, params, signal) {
      return sendSupervisorRequest(params, metadata, signal, id2);
    }
  };
  pi.registerTool(tool);
}
function parseRequestFile(file, channelDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (parsed.type !== "subagent.supervisor.request") return void 0;
    if (typeof parsed.id !== "string" || !parsed.id) return void 0;
    if (parsed.reason !== "need_decision" && parsed.reason !== "interview_request" && parsed.reason !== "progress_update") return void 0;
    if (typeof parsed.message !== "string" || !parsed.message.trim() && parsed.reason !== "interview_request") return void 0;
    if (typeof parsed.runId !== "string" || typeof parsed.agent !== "string" || typeof parsed.childIndex !== "number") return void 0;
    return {
      ...parsed,
      ...typeof parsed.toolCallId === "string" && parsed.toolCallId.length > 0 ? { toolCallId: parsed.toolCallId } : { toolCallId: void 0 },
      channelDir,
      requestFile: file
    };
  } catch {
    return void 0;
  }
}
function isMissingSupervisorDirectory(error, platform) {
  const code = error.code;
  return code === "ENOENT" || platform === "win32" && code === "UNKNOWN";
}
function listRequestFiles(channelDirs, platform) {
  if (!channelDirs) {
    try {
      channelDirs = fs.readdirSync(SUPERVISOR_CHANNEL_ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(SUPERVISOR_CHANNEL_ROOT, entry.name));
    } catch (error) {
      if (isMissingSupervisorDirectory(error, platform)) return [];
      throw error;
    }
  }
  const files = [];
  for (const channelDir of channelDirs) {
    const requestsDir = path.join(channelDir, REQUESTS_DIR);
    let requestEntries;
    try {
      requestEntries = fs.readdirSync(requestsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const requestEntry of requestEntries) {
      if (requestEntry.isFile() && requestEntry.name.endsWith(".json")) files.push({ channelDir, file: path.join(requestsDir, requestEntry.name) });
    }
  }
  return files;
}
function readDirectoryEntries(dir, platform) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissingSupervisorDirectory(error, platform)) return [];
    return void 0;
  }
}
function directoryMtimeMs(dir) {
  try {
    return fs.statSync(dir).mtimeMs;
  } catch {
    return 0;
  }
}
function removeEmptyDirectory(dir) {
  try {
    fs.rmdirSync(dir);
    return true;
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT") return true;
    if (code === "ENOTEMPTY" || code === "EEXIST" || code === "EPERM" || code === "EBUSY") return false;
    throw error;
  }
}
function removeStaleEmptySupervisorChannel(channelDir, nowMs, platform) {
  const requestsDir = path.join(channelDir, REQUESTS_DIR);
  const repliesDir = path.join(channelDir, REPLIES_DIR);
  const newestKnownMtimeMs = Math.max(
    directoryMtimeMs(channelDir),
    directoryMtimeMs(requestsDir),
    directoryMtimeMs(repliesDir)
  );
  if (nowMs - newestKnownMtimeMs < STALE_EMPTY_CHANNEL_AGE_MS) return false;
  const requestEntries = readDirectoryEntries(requestsDir, platform);
  if (!requestEntries || requestEntries.length > 0) return false;
  const replyEntries = readDirectoryEntries(repliesDir, platform);
  if (!replyEntries || replyEntries.length > 0) return false;
  if (!removeEmptyDirectory(requestsDir)) return false;
  if (!removeEmptyDirectory(repliesDir)) return false;
  if (!removeEmptyDirectory(channelDir)) return false;
  return true;
}
function cleanupStaleEmptySupervisorChannels(nowMs = Date.now(), platform = process.platform) {
  let channelEntries;
  try {
    channelEntries = fs.readdirSync(SUPERVISOR_CHANNEL_ROOT, { withFileTypes: true });
  } catch (error) {
    if (isMissingSupervisorDirectory(error, platform)) return 0;
    throw error;
  }
  let removed = 0;
  for (const entry of channelEntries) {
    if (!entry.isDirectory()) continue;
    try {
      if (removeStaleEmptySupervisorChannel(path.join(SUPERVISOR_CHANNEL_ROOT, entry.name), nowMs, platform)) removed++;
    } catch {
    }
  }
  return removed;
}
function requestMatchesOwner(request, state) {
  const currentSessionId = state.supervisorOwnerSessionId;
  if (currentSessionId && request.orchestratorSessionId === currentSessionId) return true;
  if (!state.currentSessionId || inheritedSessionIds(state.currentSessionId).length === 0) return false;
  if (!request.runId || request.runId.startsWith(".") || path.basename(request.runId) !== request.runId) return false;
  try {
    return ownsRun(state.currentSessionId, readStatus(path.join(ASYNC_DIR, request.runId))?.sessionId);
  } catch {
    return false;
  }
}
function rememberedForegroundChild(request, state) {
  const run = state.foregroundRuns?.get(request.runId);
  const child = run?.children.find((candidate) => candidate.index === request.childIndex && candidate.agent === request.agent) ?? run?.children[request.childIndex];
  return run && child ? { run, child } : void 0;
}
function markForegroundSupervisorAttention(request, state) {
  const remembered = rememberedForegroundChild(request, state);
  if (!remembered || remembered.child.status !== "detached") return;
  const updatedAt = Date.now();
  remembered.run.updatedAt = updatedAt;
  remembered.child.activityState = "needs_attention";
  remembered.child.lastActivityAt = request.createdAt;
  remembered.child.currentTool = "contact_supervisor";
  remembered.child.currentToolStartedAt = request.createdAt;
  remembered.child.updatedAt = updatedAt;
}
function clearForegroundSupervisorAttention(request, pending, state) {
  if ([...pending.values()].some(
    (candidate) => candidate.expectsReply && candidate.runId === request.runId && candidate.agent === request.agent && candidate.childIndex === request.childIndex
  )) return;
  const remembered = rememberedForegroundChild(request, state);
  if (!remembered || remembered.child.status !== "detached") return;
  const updatedAt = Date.now();
  remembered.run.updatedAt = updatedAt;
  remembered.child.activityState = void 0;
  remembered.child.lastActivityAt = updatedAt;
  remembered.child.currentTool = void 0;
  remembered.child.currentToolStartedAt = void 0;
  remembered.child.updatedAt = updatedAt;
}
function removeRequestFile(file) {
  try {
    fs.rmSync(file, { force: true });
  } catch {
  }
}
function requestExpiresAt(request, now) {
  const expiresAt = request.expiresAt;
  if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) return expiresAt;
  return Number.isFinite(request.createdAt) ? request.createdAt + askTimeoutMs() : now;
}
function requestRunInactive(request, state) {
  if (state.foregroundControls.has(request.runId)) return false;
  const foreground = rememberedForegroundChild(request, state);
  if (foreground) return foreground.child.status !== "detached";
  const asyncJob = state.asyncJobs.get(request.runId);
  if (!asyncJob) return false;
  if (asyncJob.status === "complete" || asyncJob.status === "failed" || asyncJob.status === "paused") return true;
  const stepStatus = asyncJob.steps?.[request.childIndex]?.status;
  return stepStatus === "complete" || stepStatus === "completed" || stepStatus === "failed" || stepStatus === "paused";
}
function requestLifecycle(request, state, now, runState) {
  if (!requestMatchesOwner(request, state)) return "wrong-session";
  if (!fs.existsSync(request.requestFile)) return "missing";
  if (request.expectsReply && fs.existsSync(replyPath(request.channelDir, request.id))) return "resolved";
  if (request.expectsReply && now > requestExpiresAt(request, now)) return "expired";
  if (request.expectsReply && requestRunInactive(request, runState)) return "inactive";
  return "pending";
}
function cleanupRequestLifecycle(request, lifecycle) {
  if (lifecycle === "resolved" || lifecycle === "expired" || lifecycle === "inactive") removeRequestFile(request.requestFile);
}
function refreshPendingRequests(pending, state, onLifecycle, runState) {
  const now = Date.now();
  for (const request of pending.values()) {
    const lifecycle = requestLifecycle(request, state, now, runState(request));
    if (lifecycle === "pending") continue;
    pending.delete(request.id);
    onLifecycle(request, lifecycle);
    cleanupRequestLifecycle(request, lifecycle);
  }
}
function pendingHeader(request) {
  return `- ${request.id}: ${request.agent} [${request.runId}#${request.childIndex}] ${request.reason}.`;
}
function formatPendingLine(request) {
  const replyHint = request.expectsReply ? ` Reply: ${supervisorReplyHint(request.id)}` : "";
  const header = `${pendingHeader(request)}${replyHint}`;
  return request.message ? `${header}
  ${request.message.replace(/\n/g, "\n  ")}` : header;
}
function requestVisibleText(request) {
  const lines = [
    reasonHeading(request.reason),
    `Run: ${request.runId}`,
    `Agent: ${request.agent}`,
    `Child index: ${request.childIndex}`
  ];
  lines.push("");
  if (request.message) lines.push(request.message);
  if (request.reason === "interview_request") {
    lines.push(
      "",
      "Structured response requested. Reply with JSON, optionally fenced in ```json, matching the requested interview shape."
    );
    if (request.interview !== void 0) lines.push(JSON.stringify(request.interview, null, "	"));
  }
  if (request.expectsReply) lines.push("", `Reply with: ${supervisorReplyHint(request.id)}`);
  lines.push("", `Live guidance: subagent({ action: "steer", id: ${JSON.stringify(request.runId)}, message: "...", options: { index: ${request.childIndex} } })${request.expectsReply ? " (Reply to the pending request first.)" : ""}`);
  return lines.join("\n").trimEnd();
}
function writeReply(request, message2) {
  if (!message2.trim()) throw new Error("message is required for supervisor replies.");
  const reply = {
    type: "subagent.supervisor.reply",
    requestId: request.id,
    createdAt: Date.now(),
    message: message2.trim()
  };
  writeAtomicJson(replyPath(request.channelDir, request.id), reply);
  removeRequestFile(request.requestFile);
  return reply;
}
function appendSupervisorReplyEntry(pi, request, reply) {
  const appendEntry = pi.appendEntry;
  if (typeof appendEntry !== "function") return;
  try {
    appendEntry.call(pi, SUPERVISOR_REPLY_ENTRY_TYPE, {
      requestId: request.id,
      reason: request.reason,
      runId: request.runId,
      agent: request.agent,
      childIndex: request.childIndex,
      ...request.childTarget ? { childTarget: request.childTarget } : {},
      message: reply.message,
      createdAt: reply.createdAt
    });
  } catch (error) {
    console.error("Failed to journal native supervisor reply:", error);
  }
}
function resolvePendingRequest(pending, params) {
  const requests = [...pending.values()].filter((request) => request.expectsReply);
  if (params.replyTo) {
    const request = pending.get(params.replyTo);
    if (!request) {
      const current = requests.length ? `Pending now:
${requests.map(pendingHeader).join("\n")}` : "No pending supervisor requests.";
      throw new Error(`No pending supervisor request found for replyTo '${params.replyTo}'. It was answered, expired or withdrawn. ${current}`);
    }
    return request;
  }
  if (params.to) {
    const normalizedTo = params.to.toLowerCase();
    const matches = requests.filter(
      (request) => request.id.toLowerCase().startsWith(normalizedTo) || request.agent.toLowerCase() === normalizedTo || request.childTarget?.toLowerCase() === normalizedTo
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Multiple pending supervisor requests match '${params.to}'. Use replyTo.`);
    throw new Error(`No pending supervisor request matches '${params.to}'. Use replyTo.`);
  }
  if (requests.length === 1) return requests[0];
  if (requests.length === 0) throw new Error("No pending supervisor requests need a reply.");
  throw new Error("Multiple pending supervisor requests need replies. Use replyTo.");
}
function publicPendingRequests(pending) {
  return [...pending.values()].map((request) => ({
    id: request.id,
    runId: request.runId,
    agent: request.agent,
    childIndex: request.childIndex,
    reason: request.reason,
    expectsReply: request.expectsReply
  }));
}
function buildParentSupervisorTool(pi, pending, state, onLifecycle, discover, runState) {
  return {
    name: NATIVE_SUPERVISOR_TOOL_NAME,
    ...MODEL_ONLY_TOOL,
    label: "Subagent Supervisor",
    description: "Native pi-subagents supervisor channel. Use reply/pending/status to answer child subagent requests without overriding pi-intercom.",
    parameters: IntercomParamsSchema,
    async execute(_id, params) {
      discover();
      refreshPendingRequests(pending, state, onLifecycle, runState);
      const input = params;
      if (input.action === "status") {
        return { content: [{ type: "text", text: `Native supervisor channel active. Pending replies: ${pending.size}.` }], details: { active: true, pending: pending.size, root: SUPERVISOR_CHANNEL_ROOT } };
      }
      if (input.action === "pending" || input.action === "list") {
        const lines = [...pending.values()].filter((request) => request.expectsReply).map(formatPendingLine);
        return { content: [{ type: "text", text: lines.length ? lines.join("\n") : "No pending supervisor requests." }], details: { pending: publicPendingRequests(pending) } };
      }
      if (input.action === "reply") {
        const request = resolvePendingRequest(pending, input);
        const reply = writeReply(request, input.message ?? "");
        appendSupervisorReplyEntry(pi, request, reply);
        pending.delete(request.id);
        onLifecycle(request, "resolved");
        clearForegroundSupervisorAttention(request, pending, state);
        return { content: [{ type: "text", text: `Replied to supervisor request ${request.id}.` }], details: { replyTo: request.id, runId: request.runId, agent: request.agent } };
      }
      throw new Error(`Unsupported supervisor action: ${input.action}`);
    }
  };
}
function createNativeSupervisorChannel(pi, state, deps = {}) {
  const watch2 = deps.watch ?? fs.watch;
  const timers = deps.timers ?? globalThis;
  const runState = (request) => {
    for (const ownerState of deps.getCurrentOwnerStates?.() ?? []) {
      if (ownerState.asyncJobs.has(request.runId)) return ownerState;
    }
    return state;
  };
  const pending = /* @__PURE__ */ new Map();
  const settleNotices = /* @__PURE__ */ new Map();
  let unsubscribeSettle;
  const queuedNotices = /* @__PURE__ */ new Set();
  let unsubscribeDelivery;
  const requestCorrelations = /* @__PURE__ */ new Map();
  const correlationKey = (request) => {
    if (!request.toolCallId) return void 0;
    return JSON.stringify([request.runId, request.agent, request.childIndex, request.toolCallId]);
  };
  const pruneRequestCorrelations = (now = Date.now()) => {
    for (const [key, correlation] of requestCorrelations) {
      if (correlation.state === "resolved" && now - correlation.updatedAt > SUPERVISOR_REQUEST_CORRELATION_RETENTION_MS) requestCorrelations.delete(key);
    }
    while (requestCorrelations.size > MAX_SUPERVISOR_REQUEST_CORRELATIONS) {
      const oldest = requestCorrelations.keys().next().value;
      if (oldest === void 0) break;
      requestCorrelations.delete(oldest);
    }
  };
  const rememberPendingRequest = (request) => {
    const key = correlationKey(request);
    if (!key || !request.expectsReply) return;
    requestCorrelations.set(key, { request, state: "pending", updatedAt: Date.now() });
    pruneRequestCorrelations();
  };
  const rememberResolvedRequest = (request) => {
    const key = correlationKey(request);
    if (!key || !request.expectsReply) return;
    requestCorrelations.set(key, { request, state: "resolved", updatedAt: Date.now() });
    pruneRequestCorrelations();
  };
  const observeRequestLifecycle = (request, lifecycle) => {
    settleNotices.delete(request.id);
    if (queuedNotices.delete(request.id)) updateDeliverySubscription();
    if (lifecycle !== "wrong-session") rememberResolvedRequest(request);
    updateSettleSubscription();
  };
  const getSupervisorRequestState = (event) => {
    if (event.currentTool === "intercom" || event.index === void 0) return "unknown";
    const toolCallId = typeof event.toolCallId === "string" && event.toolCallId.length > 0 ? event.toolCallId : void 0;
    if (!toolCallId) return "unknown";
    pruneRequestCorrelations();
    const key = correlationKey({ runId: event.runId, agent: event.agent, childIndex: event.index, toolCallId });
    if (!key) return "unknown";
    const correlation = requestCorrelations.get(key);
    if (!correlation) return "unknown";
    if (correlation.state === "resolved") return "resolved";
    const now = Date.now();
    if (!fs.existsSync(correlation.request.requestFile) || fs.existsSync(replyPath(correlation.request.channelDir, correlation.request.id)) || now > requestExpiresAt(correlation.request, now) || requestRunInactive(correlation.request, runState(correlation.request))) {
      rememberResolvedRequest(correlation.request);
      return "resolved";
    }
    return "pending";
  };
  const seenFiles = /* @__PURE__ */ new Set();
  const requestWatchers = /* @__PURE__ */ new Map();
  let rootWatcher;
  let poller;
  let safetyPoller;
  let deferredWatcherRefresh;
  let started = false;
  let lastStaleCleanupAt = 0;
  const platform = deps.platform ?? process.platform;
  const useNativeWatcher = () => !deps.getChannelDirs && shouldUseNativeFsWatch("supervisor-channel", platform) && platform !== "win32";
  const hasTransportDemand = () => {
    if (pending.size > 0) return true;
    if (state.foregroundControls.size > 0) return true;
    if (deps.getChannelDirs?.().dirs.length) return true;
    if ([...state.asyncJobs.values()].some((job) => job.status === "queued" || job.status === "running")) return true;
    for (const ownerState of deps.getCurrentOwnerStates?.() ?? []) {
      for (const job of ownerState.asyncJobs.values()) {
        if (job.status === "queued" || job.status === "running") return true;
      }
    }
    return false;
  };
  const registerParentTools = () => {
    if (!hasTool(pi, NATIVE_SUPERVISOR_TOOL_NAME)) pi.registerTool(buildParentSupervisorTool(pi, pending, state, observeRequestLifecycle, () => poll(), runState));
  };
  const declareParentTool = () => {
    if (typeof pi.getActiveTools !== "function" || typeof pi.setActiveTools !== "function") return;
    const active = pi.getActiveTools();
    if (!Array.isArray(active) || active.includes(NATIVE_SUPERVISOR_TOOL_NAME) || !hasTool(pi, NATIVE_SUPERVISOR_TOOL_NAME)) return;
    pi.setActiveTools([...active, NATIVE_SUPERVISOR_TOOL_NAME]);
  };
  const cleanupStaleChannelsIfDue = () => {
    if (deps.getChannelDirs) return;
    const nowMs = Date.now();
    if (nowMs - lastStaleCleanupAt < STALE_EMPTY_CHANNEL_CLEANUP_INTERVAL_MS) return;
    lastStaleCleanupAt = nowMs;
    try {
      cleanupStaleEmptySupervisorChannels(nowMs, platform);
    } catch {
    }
  };
  const poll = () => {
    cleanupStaleChannelsIfDue();
    refreshPendingRequests(pending, state, observeRequestLifecycle, runState);
    if (queuedNotices.size) extendQueuedNotices();
    const now = Date.now();
    const channels = deps.getChannelDirs?.();
    for (const { channelDir, file } of listRequestFiles(channels?.dirs, platform)) {
      if (seenFiles.has(file)) continue;
      const request = parseRequestFile(file, channelDir);
      if (!request || !requestMatchesOwner(request, state)) continue;
      const lifecycle = requestLifecycle(request, state, now, runState(request));
      if (lifecycle !== "pending") {
        seenFiles.add(file);
        observeRequestLifecycle(request, lifecycle);
        cleanupRequestLifecycle(request, lifecycle);
        continue;
      }
      if (request.expectsReply && runState(request).blockingWorkflowChildren?.has(request.runId)) {
        try {
          writePrivateAtomicJson(replyPath(channelDir, request.id), {
            type: "subagent.supervisor.reply",
            requestId: request.id,
            createdAt: now,
            message: "",
            error: "Supervisor unavailable: the parent is blocked in an async:false workflow and cannot answer this request. Report the blocker and any partial results, then stop. Relaunch the workflow with async:true to allow supervisor replies."
          });
        } catch (error) {
          console.error(`Failed to report unreachable supervisor request ${request.id}; will retry:`, error);
          continue;
        }
        seenFiles.add(file);
        observeRequestLifecycle(request, "resolved");
        cleanupRequestLifecycle(request, "resolved");
        continue;
      }
      seenFiles.add(file);
      if (!request.expectsReply) {
        removeRequestFile(request.requestFile);
        continue;
      }
      rememberPendingRequest(request);
      pending.set(request.id, request);
      declareParentTool();
      updateSettleSubscription();
      markForegroundSupervisorAttention(request, state);
      try {
        const appended = (deps.parentWake ?? pi).sendMessage({
          customType: SUPERVISOR_REQUEST_MESSAGE_TYPE,
          content: requestVisibleText(request),
          display: true,
          details: {
            id: request.id,
            requestId: request.id,
            reason: request.reason,
            expectsReply: request.expectsReply,
            runId: request.runId,
            agent: request.agent,
            childIndex: request.childIndex,
            ...request.childTarget ? { childTarget: request.childTarget } : {},
            ...request.interview !== void 0 ? { interview: request.interview } : {},
            requestBody: request.message,
            replyHint: supervisorReplyHint(request.id)
          }
        }, { triggerTurn: true });
        if (appended === false && started && pending.has(request.id)) {
          queuedNotices.add(request.id);
          updateDeliverySubscription();
        }
      } catch (error) {
        console.error(`Failed to surface supervisor request ${request.id} as a user turn:`, error);
      }
      pi.events?.emit(INTERCOM_DETACH_REQUEST_EVENT, {
        requestId: request.id,
        runId: request.runId,
        agent: request.agent,
        childIndex: request.childIndex
      });
      if (pending.has(request.id)) markForegroundSupervisorAttention(request, state);
    }
    channels?.retire?.();
    updateSettleSubscription();
  };
  const handleBeforeSettle = (event) => {
    if (!started || event.outcome !== "completed")
      return;
    refreshPendingRequests(pending, state, observeRequestLifecycle, runState);
    if (event.continue || event.context.pendingMessages.length)
      return;
    const messages = event.context.contextMessages;
    const requests = [...pending.values()].filter((request) => {
      if (!request.expectsReply || settleNotices.get(request.id) === "warned" || settleNotices.get(request.id) === "handled") return false;
      const index = messages.findLastIndex((message2) => message2.role === "custom" && message2.customType === SUPERVISOR_REQUEST_MESSAGE_TYPE && message2.details?.requestId === request.id);
      const acted = index !== -1 && messages.slice(index + 1).some((message2) => message2.role === "assistant" && message2.content.some((part) => part.type === "toolCall" || part.type === "text" && part.text.trim()));
      if (index === -1 || acted) {
        settleNotices.set(request.id, "handled");
        return false;
      }
      return true;
    });
    updateSettleSubscription();
    if (!requests.length) return;
    declareParentTool();
    const unanswered = requests.filter((request) => !settleNotices.has(request.id));
    if (unanswered.length) {
      for (const request of unanswered)
        settleNotices.set(request.id, "reminded");
      return {
        entries: [...event.entries, {
          type: "custom_message",
          customType: "subagent-supervisor-unanswered",
          content: "Silent supervisor wake. Pending request IDs: " + requests.map((request) => request.id).join(", ") + '. Check subagent_supervisor({ action: "pending" }) and reply within existing authority, or explicitly ask the user for approval. Do not auto-approve.',
          display: true,
          details: { requestIds: requests.map((request) => request.id) }
        }],
        continue: true
      };
    }
    const unflagged = requests.filter((request) => settleNotices.get(request.id) !== "warned");
    if (!unflagged.length)
      return;
    for (const request of unflagged)
      settleNotices.set(request.id, "warned");
    updateSettleSubscription();
    return {
      entries: [...event.entries, {
        type: "custom_message",
        customType: "subagent-supervisor-blocked",
        content: "BLOCKED: unanswered supervisor request IDs: " + unflagged.map((request) => request.id).join(", ") + '. Reminder budget exhausted; no reply or approval sent. Inspect subagent_supervisor({ action: "pending" }).',
        display: true,
        details: { blocked: true, requestIds: unflagged.map((request) => request.id) }
      }]
    };
  };
  const updateSettleSubscription = () => {
    const needed = started && [...pending.values()].some((request) => request.expectsReply && settleNotices.get(request.id) !== "warned" && settleNotices.get(request.id) !== "handled");
    if (needed && !unsubscribeSettle) unsubscribeSettle = pi.on?.("agent_before_settle", handleBeforeSettle);
    if (!needed) {
      unsubscribeSettle?.();
      unsubscribeSettle = void 0;
    }
  };
  const noticeDelivered = (event) => {
    const message2 = event.message;
    if (message2.role !== "custom" || message2.customType !== SUPERVISOR_REQUEST_MESSAGE_TYPE) return;
    const requestId = message2.details?.requestId;
    if (typeof requestId === "string" && queuedNotices.delete(requestId)) updateDeliverySubscription();
  };
  const parentRunSettled = () => {
    queuedNotices.clear();
    updateDeliverySubscription();
  };
  const updateDeliverySubscription = () => {
    const needed = started && queuedNotices.size > 0;
    if (needed && !unsubscribeDelivery) {
      unsubscribeDelivery = [pi.on?.("message_start", noticeDelivered), pi.on?.("agent_settled", parentRunSettled)];
    }
    if (!needed) {
      for (const unsubscribe of unsubscribeDelivery ?? []) unsubscribe?.();
      unsubscribeDelivery = void 0;
    }
  };
  const extendQueuedNotices = () => {
    const now = Date.now();
    const timeoutMs = askTimeoutMs();
    for (const id2 of queuedNotices) {
      const request = pending.get(id2);
      if (!request || requestExpiresAt(request, now) - now > timeoutMs / 2 || !fs.existsSync(request.requestFile)) continue;
      const { channelDir: _channelDir, requestFile, ...stored } = request;
      try {
        writePrivateAtomicJson(requestFile, { ...stored, expiresAt: now + timeoutMs });
        request.expiresAt = now + timeoutMs;
      } catch (error) {
        queuedNotices.delete(id2);
        updateDeliverySubscription();
        console.error(`Failed to extend supervisor request ${id2} while its notice is queued; it keeps its current deadline:`, error);
      }
    }
  };
  const startPolling = () => {
    if (poller) return;
    poller = timers.setInterval(() => {
      poll();
      if (!useNativeWatcher() && !hasTransportDemand()) {
        if (poller) timers.clearInterval(poller);
        poller = void 0;
      }
    }, CHANNEL_POLL_MS);
    poller.unref?.();
  };
  const startSafetyPolling = () => {
    if (safetyPoller) return;
    safetyPoller = timers.setInterval(() => {
      watchExistingRequestDirs();
      poll();
    }, CHANNEL_SAFETY_POLL_MS);
    safetyPoller.unref?.();
  };
  const watchRequestDir = (requestsDir) => {
    if (requestWatchers.has(requestsDir)) return;
    try {
      const watcher = watch2(requestsDir, () => poll());
      watcher.on("error", () => {
        try {
          watcher.close();
        } catch {
        }
        requestWatchers.delete(requestsDir);
        startPolling();
      });
      watcher.unref?.();
      requestWatchers.set(requestsDir, watcher);
    } catch (error) {
      if (error.code !== "ENOENT") startPolling();
    }
  };
  const watchExistingRequestDirs = () => {
    let channelEntries;
    try {
      channelEntries = fs.readdirSync(SUPERVISOR_CHANNEL_ROOT, { withFileTypes: true });
    } catch (error) {
      if (isMissingSupervisorDirectory(error, platform)) return;
      startPolling();
      return;
    }
    for (const entry of channelEntries) {
      if (entry.isDirectory()) watchRequestDir(path.join(SUPERVISOR_CHANNEL_ROOT, entry.name, REQUESTS_DIR));
    }
  };
  const scheduleWatcherRefresh = () => {
    if (deferredWatcherRefresh) return;
    deferredWatcherRefresh = timers.setImmediate(() => {
      deferredWatcherRefresh = void 0;
      if (!started) return;
      watchExistingRequestDirs();
      poll();
    });
    deferredWatcherRefresh.unref?.();
  };
  return {
    registerTools: registerParentTools,
    activateTransport: () => {
      if (!started) return;
      poll();
      if (!useNativeWatcher() && hasTransportDemand()) startPolling();
    },
    findPendingAsks: (target) => {
      const channelDir = resolveSupervisorChannelDir(target.runId, target.agent, target.childIndex);
      let files;
      try {
        files = fs.readdirSync(path.join(channelDir, REQUESTS_DIR));
      } catch (error) {
        if (isMissingSupervisorDirectory(error, platform)) return [];
        throw error;
      }
      const now = Date.now();
      return files.filter((file) => file.endsWith(".json")).flatMap((file) => {
        const request = parseRequestFile(path.join(channelDir, REQUESTS_DIR, file), channelDir);
        return request?.expectsReply && request.runId === target.runId && request.agent === target.agent && request.childIndex === target.childIndex && requestLifecycle(request, state, now, runState(request)) === "pending" ? [request.id] : [];
      }).sort();
    },
    hasPendingRequests: () => {
      if (!started) return false;
      poll();
      return pending.size > 0;
    },
    start: () => {
      if (started) return;
      started = true;
      registerParentTools();
      poll();
      if (deps.getChannelDirs) return;
      try {
        fs.mkdirSync(SUPERVISOR_CHANNEL_ROOT, { recursive: true });
        if (!useNativeWatcher()) {
          if (platform === "win32") startPolling();
          return;
        }
        watchExistingRequestDirs();
        rootWatcher = watch2(SUPERVISOR_CHANNEL_ROOT, () => {
          watchExistingRequestDirs();
          poll();
          scheduleWatcherRefresh();
        });
        rootWatcher.on("error", startPolling);
        startSafetyPolling();
        scheduleWatcherRefresh();
      } catch {
        startPolling();
      }
    },
    dispose: () => {
      started = false;
      updateSettleSubscription();
      queuedNotices.clear();
      updateDeliverySubscription();
      try {
        rootWatcher?.close();
      } catch {
      }
      rootWatcher = void 0;
      for (const watcher of requestWatchers.values()) {
        try {
          watcher.close();
        } catch {
        }
      }
      requestWatchers.clear();
      if (poller) timers.clearInterval(poller);
      poller = void 0;
      if (safetyPoller) timers.clearInterval(safetyPoller);
      safetyPoller = void 0;
      if (deferredWatcherRefresh) timers.clearImmediate(deferredWatcherRefresh);
      deferredWatcherRefresh = void 0;
      pending.clear();
      settleNotices.clear();
      requestCorrelations.clear();
      seenFiles.clear();
    },
    pending,
    getSupervisorRequestState
  };
}

// src/shared/session-identity.ts
import * as fs2 from "node:fs";
function resolveCurrentSessionId(sessionManager) {
  const sessionId = sessionManager.getSessionFile() ?? sessionManager.getSessionId();
  if (!sessionId) throw new Error("Current session identity is unavailable.");
  return sessionId;
}
function resolvePiSessionId(sessionFile) {
  if (!sessionFile) return void 0;
  try {
    const fd = fs2.openSync(sessionFile, "r");
    try {
      const buffer = Buffer.alloc(16 * 1024);
      const bytes = fs2.readSync(fd, buffer, 0, buffer.length, 0);
      const line = buffer.toString("utf-8", 0, bytes).split("\n", 1)[0];
      if (!line) return void 0;
      const header = JSON.parse(line);
      if (header.type === "session" && typeof header.id === "string" && /^[A-Za-z0-9-]{8,}$/.test(header.id)) return header.id;
      return void 0;
    } finally {
      fs2.closeSync(fd);
    }
  } catch {
    return void 0;
  }
}

// src/watchdog/settings.ts
import * as fs3 from "node:fs";
import * as path2 from "node:path";
var DEFAULT_WATCHDOG_CONFIG = {
  enabled: false,
  clarification: false,
  agentEndTimeoutMs: 3e4,
  severityThreshold: "concern",
  maxWarnings: null,
  guidance: {
    watchdogMd: true
  },
  stalemateRepeats: 3,
  scope: {
    enabled: true
  },
  cadence: {
    everyNTools: null
  },
  main: {
    enabled: false
  },
  children: {
    enabled: false,
    watchdogTailTimeoutMs: 12e4,
    overrides: {}
  },
  lsp: {
    enabled: true,
    timeoutMs: 3e3,
    maxFiles: 20,
    maxDiagnostics: 50
  }
};
var WATCHDOG_FIELDS = /* @__PURE__ */ new Set([
  "enabled",
  "clarification",
  "agentEndTimeoutMs",
  "severityThreshold",
  "maxWarnings",
  "guidance",
  "stalemateRepeats",
  "scope",
  "cadence",
  "main",
  "children",
  "lsp",
  "rules"
]);
var RULES_FIELDS = /* @__PURE__ */ new Set(["action", "roleModels"]);
var ROLE_MODEL_RULE_FIELDS = /* @__PURE__ */ new Set(["allow", "deny", "note"]);
var GUIDANCE_FIELDS = /* @__PURE__ */ new Set(["watchdogMd"]);
var SCOPE_FIELDS = /* @__PURE__ */ new Set(["enabled"]);
var CADENCE_FIELDS = /* @__PURE__ */ new Set(["everyNTools"]);
var ENDPOINT_FIELDS = /* @__PURE__ */ new Set(["enabled", "model", "thinking"]);
var CHILDREN_FIELDS = /* @__PURE__ */ new Set(["enabled", "model", "thinking", "watchdogTailTimeoutMs", "cadence", "overrides"]);
var CHILD_OVERRIDE_FIELDS = /* @__PURE__ */ new Set(["enabled", "model", "thinking", "cadence"]);
var LSP_FIELDS = /* @__PURE__ */ new Set(["enabled", "timeoutMs", "maxFiles", "maxDiagnostics"]);
function cloneDefaultConfig() {
  return {
    ...DEFAULT_WATCHDOG_CONFIG,
    guidance: { ...DEFAULT_WATCHDOG_CONFIG.guidance },
    scope: { ...DEFAULT_WATCHDOG_CONFIG.scope },
    cadence: { ...DEFAULT_WATCHDOG_CONFIG.cadence },
    main: { ...DEFAULT_WATCHDOG_CONFIG.main },
    children: {
      ...DEFAULT_WATCHDOG_CONFIG.children,
      overrides: {}
    },
    lsp: { ...DEFAULT_WATCHDOG_CONFIG.lsp }
  };
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function sourceName(meta) {
  return meta.path ? `'${meta.path}'` : "session override";
}
function invalid(meta, field, expected) {
  return new Error(`Watchdog settings in ${sourceName(meta)} have invalid '${field}'; expected ${expected}.`);
}
function unknown(meta, field) {
  return new Error(`Watchdog settings in ${sourceName(meta)} have unknown field '${field}'.`);
}
function assertKnownFields(input, allowed, fieldPrefix, meta) {
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw unknown(meta, `${fieldPrefix}.${key}`);
  }
}
function parseObject(value, field, meta) {
  if (isPlainObject(value)) return value;
  throw invalid(meta, field, "an object");
}
function parseBoolean(value, field, meta) {
  if (typeof value === "boolean") return value;
  throw invalid(meta, field, "a boolean");
}
function parseNonEmptyString(value, field, meta) {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw invalid(meta, field, "a non-empty string");
}
function parseThinking(value, field, meta) {
  if (value === false) return false;
  if (typeof value === "string" && THINKING_LEVELS.includes(value)) return value;
  throw invalid(meta, field, `${THINKING_LEVELS.map((level) => `'${level}'`).join(" or ")} or false`);
}
function parseInteger(value, field, meta, expected, check) {
  if (typeof value === "number" && Number.isInteger(value) && check(value)) return value;
  throw invalid(meta, field, expected);
}
function parseNullableInteger(value, field, meta, expected, check) {
  if (value === null) return null;
  return parseInteger(value, field, meta, expected, check);
}
function parseEnum(value, field, meta, values) {
  if (typeof value === "string" && values.includes(value)) return value;
  throw invalid(meta, field, values.map((item) => `'${item}'`).join(" or "));
}
function parseGuidancePatch(value, field, meta) {
  const input = parseObject(value, field, meta);
  assertKnownFields(input, GUIDANCE_FIELDS, field, meta);
  const patch = {};
  if ("watchdogMd" in input) patch.watchdogMd = parseBoolean(input.watchdogMd, `${field}.watchdogMd`, meta);
  return patch;
}
function parseScopePatch(value, field, meta) {
  const input = parseObject(value, field, meta);
  assertKnownFields(input, SCOPE_FIELDS, field, meta);
  const patch = {};
  if ("enabled" in input) patch.enabled = parseBoolean(input.enabled, `${field}.enabled`, meta);
  return patch;
}
function parseCadencePatch(value, field, meta) {
  const input = parseObject(value, field, meta);
  assertKnownFields(input, CADENCE_FIELDS, field, meta);
  const patch = {};
  if ("everyNTools" in input) {
    patch.everyNTools = input.everyNTools === null ? null : parseInteger(input.everyNTools, `${field}.everyNTools`, meta, "null or an integer >= 5", (candidate) => candidate >= 5);
  }
  return patch;
}
function parseEndpointPatch(value, field, meta) {
  const input = parseObject(value, field, meta);
  assertKnownFields(input, ENDPOINT_FIELDS, field, meta);
  const patch = {};
  if ("enabled" in input) patch.enabled = parseBoolean(input.enabled, `${field}.enabled`, meta);
  if ("model" in input) patch.model = parseNonEmptyString(input.model, `${field}.model`, meta);
  if ("thinking" in input) patch.thinking = parseThinking(input.thinking, `${field}.thinking`, meta);
  return patch;
}
function parseChildOverridePatch(value, field, meta) {
  const input = parseObject(value, field, meta);
  assertKnownFields(input, CHILD_OVERRIDE_FIELDS, field, meta);
  const patch = {};
  if ("enabled" in input) patch.enabled = parseBoolean(input.enabled, `${field}.enabled`, meta);
  if ("model" in input) patch.model = parseNonEmptyString(input.model, `${field}.model`, meta);
  if ("thinking" in input) patch.thinking = parseThinking(input.thinking, `${field}.thinking`, meta);
  if ("cadence" in input) patch.cadence = parseCadencePatch(input.cadence, `${field}.cadence`, meta);
  return patch;
}
function parseChildrenPatch(value, field, meta) {
  const input = parseObject(value, field, meta);
  assertKnownFields(input, CHILDREN_FIELDS, field, meta);
  const patch = {};
  if ("enabled" in input) patch.enabled = parseBoolean(input.enabled, `${field}.enabled`, meta);
  if ("model" in input) patch.model = parseNonEmptyString(input.model, `${field}.model`, meta);
  if ("thinking" in input) patch.thinking = parseThinking(input.thinking, `${field}.thinking`, meta);
  if ("watchdogTailTimeoutMs" in input) {
    patch.watchdogTailTimeoutMs = parseInteger(input.watchdogTailTimeoutMs, `${field}.watchdogTailTimeoutMs`, meta, "a positive integer", (candidate) => candidate >= 1);
  }
  if ("cadence" in input) patch.cadence = parseCadencePatch(input.cadence, `${field}.cadence`, meta);
  if ("overrides" in input) {
    const overrides = parseObject(input.overrides, `${field}.overrides`, meta);
    patch.overrides = {};
    for (const [agent2, override] of Object.entries(overrides)) {
      if (!agent2.trim()) throw invalid(meta, `${field}.overrides`, "agent names to be non-empty");
      patch.overrides[agent2] = parseChildOverridePatch(override, `${field}.overrides.${agent2}`, meta);
    }
  }
  return patch;
}
function parseLspPatch(value, field, meta) {
  const input = parseObject(value, field, meta);
  assertKnownFields(input, LSP_FIELDS, field, meta);
  const patch = {};
  if ("enabled" in input) patch.enabled = parseBoolean(input.enabled, `${field}.enabled`, meta);
  if ("timeoutMs" in input) patch.timeoutMs = parseInteger(input.timeoutMs, `${field}.timeoutMs`, meta, "a positive integer", (candidate) => candidate >= 1);
  if ("maxFiles" in input) patch.maxFiles = parseInteger(input.maxFiles, `${field}.maxFiles`, meta, "a positive integer", (candidate) => candidate >= 1);
  if ("maxDiagnostics" in input) patch.maxDiagnostics = parseInteger(input.maxDiagnostics, `${field}.maxDiagnostics`, meta, "a non-negative integer", (candidate) => candidate >= 0);
  return patch;
}
function parseStringList(value, field, meta) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) throw invalid(meta, field, "an array of non-empty strings");
  return value.map((entry) => entry.trim());
}
function parseRoleModelRule(value, field, meta) {
  const input = parseObject(value, field, meta);
  assertKnownFields(input, ROLE_MODEL_RULE_FIELDS, field, meta);
  const rule = {};
  if ("allow" in input) rule.allow = parseStringList(input.allow, `${field}.allow`, meta);
  if ("deny" in input) rule.deny = parseStringList(input.deny, `${field}.deny`, meta);
  if ("note" in input) rule.note = parseNonEmptyString(input.note, `${field}.note`, meta);
  return rule;
}
function parseRules(value, field, meta) {
  const input = parseObject(value, field, meta);
  assertKnownFields(input, RULES_FIELDS, field, meta);
  const rules = { action: "warn", roleModels: {} };
  if ("action" in input) rules.action = parseEnum(input.action, `${field}.action`, meta, ["warn", "block"]);
  if ("roleModels" in input) {
    for (const [agent2, rule] of Object.entries(parseObject(input.roleModels, `${field}.roleModels`, meta))) {
      if (!agent2.trim()) throw invalid(meta, `${field}.roleModels`, "agent names to be non-empty");
      rules.roleModels[agent2] = parseRoleModelRule(rule, `${field}.roleModels.${agent2}`, meta);
    }
  }
  return rules;
}
function parseWatchdogPatch(value, field, meta) {
  const input = parseObject(value, field, meta);
  assertKnownFields(input, WATCHDOG_FIELDS, field, meta);
  const patch = {};
  if ("enabled" in input) patch.enabled = parseBoolean(input.enabled, `${field}.enabled`, meta);
  if ("clarification" in input) patch.clarification = parseBoolean(input.clarification, `${field}.clarification`, meta);
  if ("agentEndTimeoutMs" in input) {
    patch.agentEndTimeoutMs = parseInteger(input.agentEndTimeoutMs, `${field}.agentEndTimeoutMs`, meta, "a positive integer", (candidate) => candidate >= 1);
  }
  if ("severityThreshold" in input) {
    patch.severityThreshold = parseEnum(input.severityThreshold, `${field}.severityThreshold`, meta, WATCHDOG_WARNING_SEVERITIES);
  }
  if ("maxWarnings" in input) {
    patch.maxWarnings = parseNullableInteger(input.maxWarnings, `${field}.maxWarnings`, meta, "null or a non-negative integer", (candidate) => candidate >= 0);
  }
  if ("guidance" in input) patch.guidance = parseGuidancePatch(input.guidance, `${field}.guidance`, meta);
  if ("stalemateRepeats" in input) {
    patch.stalemateRepeats = parseInteger(input.stalemateRepeats, `${field}.stalemateRepeats`, meta, "a positive integer", (candidate) => candidate >= 1);
  }
  if ("scope" in input) patch.scope = parseScopePatch(input.scope, `${field}.scope`, meta);
  if ("cadence" in input) patch.cadence = parseCadencePatch(input.cadence, `${field}.cadence`, meta);
  if ("main" in input) patch.main = parseEndpointPatch(input.main, `${field}.main`, meta);
  if ("children" in input) patch.children = parseChildrenPatch(input.children, `${field}.children`, meta);
  if ("lsp" in input) patch.lsp = parseLspPatch(input.lsp, `${field}.lsp`, meta);
  if ("rules" in input) patch.rules = parseRules(input.rules, `${field}.rules`, meta);
  return patch;
}
function parseSettingsObject(settings, meta) {
  if (!("subagents" in settings)) return {};
  const subagents = parseObject(settings.subagents, "subagents", meta);
  if (!("watchdog" in subagents)) return {};
  return parseWatchdogPatch(subagents.watchdog, "subagents.watchdog", meta);
}
function readSettingsFileStrict(filePath) {
  if (!fs3.existsSync(filePath)) return {};
  let raw;
  try {
    raw = fs3.readFileSync(filePath, "utf-8");
  } catch (error) {
    const message2 = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read settings file '${filePath}': ${message2}`, { cause: error });
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message2 = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse settings file '${filePath}': ${message2}`, { cause: error });
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`Settings file '${filePath}' must contain a JSON object.`);
  }
  return parsed;
}
function isDirectory(dir) {
  try {
    return fs3.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
function getUserSettingsPath() {
  return path2.join(getAgentDir(), "settings.json");
}
function getWatchdogUserSettingsPath() {
  return getUserSettingsPath();
}
function getProjectSettingsPath(cwd2) {
  let currentDir = cwd2;
  while (true) {
    if (isDirectory(getProjectConfigDir(currentDir)) || isDirectory(path2.join(currentDir, ".agents"))) {
      return path2.join(getProjectConfigDir(currentDir), "settings.json");
    }
    const parentDir = path2.dirname(currentDir);
    if (parentDir === currentDir) return void 0;
    currentDir = parentDir;
  }
}
function getWatchdogProjectSettingsPath(cwd2) {
  return path2.join(getProjectConfigDir(cwd2), "settings.json");
}
function deepMerge(base, patch) {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = next[key];
    next[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return next;
}
function resolvePatch(patch) {
  const config = deepMerge(cloneDefaultConfig(), patch);
  config.enabled = patch.enabled ?? DEFAULT_WATCHDOG_CONFIG.enabled;
  config.main.enabled = patch.main?.enabled ?? config.enabled;
  return config;
}
function parseSourceFile(filePath, scope) {
  return parseSettingsObject(readSettingsFileStrict(filePath), { scope, path: filePath });
}
function parseSessionOverride(value) {
  if ("subagents" in value) return parseSettingsObject(value, { scope: "session" });
  return parseWatchdogPatch(value, "subagents.watchdog", { scope: "session" });
}
function ensureObjectField(parent, key, field, meta) {
  if (!(key in parent)) parent[key] = {};
  if (!isPlainObject(parent[key])) throw invalid(meta, field, "an object");
  return parent[key];
}
function ensureWatchdogSettings(settings, meta) {
  const subagents = ensureObjectField(settings, "subagents", "subagents", meta);
  return ensureObjectField(subagents, "watchdog", "subagents.watchdog", meta);
}
function settingsPathForWrite(scope, cwd2) {
  return scope === "user" ? getUserSettingsPath() : getWatchdogProjectSettingsPath(cwd2 ?? process.cwd());
}
function targetSettingsObject(watchdog, target, meta) {
  if (target.kind === "main") return ensureObjectField(watchdog, "main", "subagents.watchdog.main", meta);
  const children = ensureObjectField(watchdog, "children", "subagents.watchdog.children", meta);
  if (target.kind === "children") return children;
  if (!target.agent.trim()) throw invalid(meta, "subagents.watchdog.children.overrides.<agent>", "a non-empty agent name");
  const overrides = ensureObjectField(children, "overrides", "subagents.watchdog.children.overrides", meta);
  return ensureObjectField(overrides, target.agent.trim(), `subagents.watchdog.children.overrides.${target.agent.trim()}`, meta);
}
function writeSettingsFile(settingsPath, settings) {
  fs3.mkdirSync(path2.dirname(settingsPath), { recursive: true });
  fs3.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}
`, "utf-8");
  return settingsPath;
}
function writeUserWatchdogEnabled(enabled) {
  const settingsPath = getUserSettingsPath();
  const meta = { scope: "user", path: settingsPath };
  return withSettingsFileLease(settingsPath, () => {
    const settings = readSettingsFileStrict(settingsPath);
    const watchdog = ensureWatchdogSettings(settings, meta);
    watchdog.enabled = enabled;
    targetSettingsObject(watchdog, { kind: "main" }, meta).enabled = enabled;
    return writeSettingsFile(settingsPath, settings);
  });
}
function writeWatchdogModelSettings(input) {
  const settingsPath = settingsPathForWrite(input.scope, input.cwd);
  const meta = { scope: input.scope, path: settingsPath };
  return withSettingsFileLease(settingsPath, () => {
    const settings = readSettingsFileStrict(settingsPath);
    const watchdog = ensureWatchdogSettings(settings, meta);
    const target = targetSettingsObject(watchdog, input.target, meta);
    if (input.model === null) delete target.model;
    else if (input.model !== void 0) target.model = input.model;
    if (input.thinking === null) delete target.thinking;
    else if (input.thinking !== void 0) target.thinking = input.thinking;
    return writeSettingsFile(settingsPath, settings);
  });
}
function resolveWatchdogConfig(cwd2, options = {}) {
  const sources = [];
  const errors = [];
  let patch = {};
  const sourceSpecs = [
    { scope: "user", path: getUserSettingsPath() },
    { scope: "project", path: getProjectSettingsPath(cwd2) }
  ];
  for (const source of sourceSpecs) {
    if (!source.path) continue;
    sources.push({ scope: source.scope, path: source.path, exists: fs3.existsSync(source.path) });
    try {
      patch = deepMerge(patch, parseSourceFile(source.path, source.scope));
    } catch (error) {
      errors.push({ scope: source.scope, path: source.path, message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (options.session) {
    sources.push({ scope: "session", exists: true });
    try {
      patch = deepMerge(patch, parseSessionOverride(options.session));
    } catch (error) {
      errors.push({ scope: "session", message: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    ok: errors.length === 0,
    config: errors.length === 0 ? resolvePatch(patch) : cloneDefaultConfig(),
    errors,
    sources
  };
}

// src/watchdog/warning-format.ts
function escapeXmlText(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeXmlAttribute(value) {
  return escapeXmlText(value).replace(/"/g, "&quot;");
}
function tag(name, value) {
  if (value === void 0) return void 0;
  return `<${name}>${escapeXmlText(String(value))}</${name}>`;
}
function normalizeWatchdogWarningDetails(warning, extras = {}) {
  return {
    ...warning,
    category: warning.category ?? extras.category ?? "other",
    source: warning.source ?? extras.source ?? "main",
    ...extras
  };
}
function formatWatchdogWarningContent(warning) {
  const details = normalizeWatchdogWarningDetails(warning);
  const attrs = [
    `severity="${escapeXmlAttribute(details.severity)}"`,
    `importance="${escapeXmlAttribute(details.importance)}"`,
    `category="${escapeXmlAttribute(details.category)}"`,
    `source="${escapeXmlAttribute(details.source)}"`,
    `guidance="weigh, don't blindly obey"`
  ];
  const optionalTags = [
    tag("agent", details.agent),
    tag("run_id", details.runId),
    tag("state", details.state),
    tag("stale", details.stale)
  ];
  return [
    `<subagent_watchdog ${attrs.join(" ")}>`,
    `<summary>${escapeXmlText(details.summary)}</summary>`,
    `<evidence>${escapeXmlText(details.evidence)}</evidence>`,
    `<recommended_action>${escapeXmlText(details.recommendedAction)}</recommended_action>`,
    ...optionalTags.filter((line) => Boolean(line)),
    details.severity === "blocker" ? "<blocker_guidance>If this warning changes the outcome, produce a new self-contained final answer after addressing it.</blocker_guidance>" : void 0,
    "</subagent_watchdog>"
  ].filter((line) => Boolean(line)).join("\n");
}
function createWatchdogWarningMessage(warning, options = {}) {
  const details = normalizeWatchdogWarningDetails(warning, options.details);
  return {
    customType: SUBAGENT_WATCHDOG_WARNING_TYPE,
    content: formatWatchdogWarningContent(details),
    display: options.display ?? true,
    details
  };
}

// src/watchdog/rules.ts
function loadWatchdogLaunchRules(cwd2) {
  const result2 = resolveWatchdogConfig(cwd2);
  return result2.ok ? result2.config.rules : void 0;
}
function watchdogGlobMatch(pattern, value) {
  const source = pattern.split("").map((char) => char === "*" ? ".*" : char === "?" ? "." : char.replace(/[.+^${}()|[\]\\]/g, "\\$&")).join("");
  return new RegExp(`^${source}$`).test(value);
}
function modelMatches(patterns, model2) {
  const base = splitKnownThinkingSuffix(model2).baseModel;
  return patterns.find((pattern) => watchdogGlobMatch(pattern, model2) || watchdogGlobMatch(pattern, base));
}
function evaluateLaunchRule(rules, agent2, model2) {
  const roleRule = rules?.roleModels[agent2];
  if (!roleRule || !model2) return void 0;
  const note = roleRule.note ? ` ${roleRule.note}` : "";
  const denied = roleRule.deny?.length ? modelMatches(roleRule.deny, model2) : void 0;
  if (denied !== void 0) {
    return {
      agent: agent2,
      summary: `Agent '${agent2}' was launched with denied model '${model2}'.`,
      evidence: `subagents.watchdog.rules.roleModels.${agent2}.deny matches '${denied}'.${note}`,
      recommendedAction: roleRule.allow?.length ? `Use one of: ${roleRule.allow.join(", ")}.` : "Choose a different model for this role."
    };
  }
  if (!roleRule.allow?.length || modelMatches(roleRule.allow, model2) !== void 0) return void 0;
  return {
    agent: agent2,
    summary: `Agent '${agent2}' was launched with model '${model2}', which is not in its allowed list.`,
    evidence: `subagents.watchdog.rules.roleModels.${agent2}.allow is [${roleRule.allow.join(", ")}].${note}`,
    recommendedAction: `Use one of: ${roleRule.allow.join(", ")}.`
  };
}
function ruleViolationWarning(violation) {
  return { severity: "concern", category: "missed-constraint", importance: "high", source: "main", ...violation };
}
function applyWatchdogLaunchRules(input) {
  const rules = loadWatchdogLaunchRules(input.cwd);
  const violation = evaluateLaunchRule(rules, input.agent, input.model);
  if (!violation) return void 0;
  if (rules?.action === "block") return `Launch blocked by subagents.watchdog.rules: ${violation.summary}`;
  input.warn?.(violation);
  return void 0;
}
function sendRuleViolationWarning(pi, violation) {
  const warning = ruleViolationWarning(violation);
  pi.sendMessage(createWatchdogWarningMessage(warning, { display: true, details: { state: "displayed", displayedAt: (/* @__PURE__ */ new Date()).toISOString() } }), { deliverAs: "steer" });
}

// src/extension/schemas.ts
import { Type as Type2 } from "typebox";
function keepTopLevelParameterDescriptions(schema) {
  return pruneNestedDescriptions(schema, []);
}
function pruneNestedDescriptions(value, path9) {
  if (!value || typeof value !== "object") return value;
  const result2 = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if (key === "description" && !isTopLevelParameterDescription(path9)) continue;
    if ("value" in descriptor) {
      const nextPath = typeof key === "string" ? [...path9, key] : path9;
      descriptor.value = pruneNestedDescriptions(descriptor.value, nextPath);
    }
    Object.defineProperty(result2, key, descriptor);
  }
  return result2;
}
function isTopLevelParameterDescription(path9) {
  return path9.length === 2 && path9[0] === "properties";
}
var SkillOverride = Type2.Unsafe({
  anyOf: [
    { type: "array", items: { type: "string" } },
    { type: "boolean" },
    { type: "string" }
  ],
  description: "Skills: names/CSV/array; false disables, true uses default."
});
var OutputModeOverride = Type2.String({
  enum: ["inline", "file-only"],
  description: "Default inline; file-only requires output path."
});
var JsonSchemaObject = Type2.Unsafe({
  type: "object",
  additionalProperties: true,
  description: "Strict structured output; object-root JSON Schema only."
});
var OutputSchemaOverride = Type2.Unsafe({
  anyOf: [JsonSchemaObject, { type: "boolean" }],
  description: "Structured output schema override; false disables an agent default."
});
var AcceptanceOverride = Type2.Unsafe({
  anyOf: [
    { type: "string", enum: ["auto", "attested", "checked"] },
    {
      type: "string",
      enum: ["reviewed"],
      description: "Invalid as an explicit policy. Recognized only so preflight can explain that reviewed is an achieved status."
    },
    {
      type: "string",
      pattern: "^\\s*\\{[\\s\\S]*$"
    },
    { type: "boolean" },
    { type: "object", additionalProperties: true }
  ],
  description: "Evidence policy; omit for read-only/review. false disables; true invalid. Prefer object; see guide tool-reference for levels, evidence and review.required."
});
var AgentContractOverride = Type2.Object({
  version: Type2.Integer({ minimum: 1, maximum: 1, description: "Enable compatibility behavior for this run/child." })
}, { additionalProperties: false, description: "Compatibility behavior. Omit for the default behavior." });
var WorkflowLaneMetadata = Type2.Object({
  version: Type2.Integer({ minimum: 1, maximum: 1 }),
  key: Type2.String({ minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" }),
  mode: Type2.Optional(Type2.String({ enum: ["mutation", "review", "scout", "gate"] })),
  sourceRef: Type2.Optional(Type2.String({ minLength: 1, maxLength: 128 })),
  claims: Type2.Optional(Type2.Array(Type2.String({ minLength: 1, maxLength: 160 }), { maxItems: 20 })),
  outputPaths: Type2.Optional(Type2.Array(Type2.String({ minLength: 1, maxLength: 256 }), { maxItems: 10 }))
}, { additionalProperties: false, description: "Display/triage only; sourceRef is opaque, never resolved by status." });
var ToolBudgetBlock = Type2.Unsafe({
  anyOf: [
    { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
    { type: "string", enum: ["*"] }
  ]
});
var ToolBudgetOverride = Type2.Object({
  soft: Type2.Optional(Type2.Integer({ minimum: 1 })),
  hard: Type2.Integer({ minimum: 1 }),
  block: Type2.Optional(ToolBudgetBlock)
}, { additionalProperties: false, description: "soft <= hard; after hard block read/grep/find/ls or '*' for all." });
var UsageBudgetLimitOverride = Type2.Object({
  soft: Type2.Optional(Type2.Number({ exclusiveMinimum: 0 })),
  hard: Type2.Number({ exclusiveMinimum: 0 })
}, { additionalProperties: false });
var UsageBudgetOverride = Type2.Object({
  tokens: Type2.Optional(UsageBudgetLimitOverride),
  costUsd: Type2.Optional(UsageBudgetLimitOverride)
}, { additionalProperties: false, minProperties: 1, description: "tokens or costUsd; soft <= hard. Root-only reported usage; blocks launches. Running children are not stopped." });
var WorkflowPreflightLane = Type2.Object({
  key: Type2.String({ minLength: 1, maxLength: 128 }),
  mode: Type2.Optional(Type2.String({ enum: ["mutation", "review", "scout", "gate"] })),
  decision: Type2.Optional(Type2.String({ maxLength: 256 })),
  claims: Type2.Optional(Type2.Array(Type2.String({ maxLength: 256 }), { maxItems: 16 })),
  expectedOutput: Type2.Optional(Type2.String({ maxLength: 256 })),
  independence: Type2.Optional(Type2.String({ maxLength: 256 }))
}, { additionalProperties: false });
var WorkflowPreflightOverride = Type2.Object({
  version: Type2.Integer({ minimum: 1, maximum: 1 }),
  coverage: Type2.Optional(Type2.String({ enum: ["complete", "partial"] })),
  lanes: Type2.Array(WorkflowPreflightLane, { maxItems: 64 })
}, { additionalProperties: false, description: "workflow: true or a script path only; display-only hints; coverage warns." });
var MissionLaunchOverride = Type2.Unsafe({
  anyOf: [
    { type: "object", additionalProperties: true },
    { type: "boolean" }
  ]
});
var MissionUpdateOverride = Type2.Unsafe({ type: "object", additionalProperties: true });
var ControlOverrides = Type2.Object({
  enabled: Type2.Optional(Type2.Boolean({ description: "Enable/disable subagent control attention tracking for this run" })),
  needsAttentionAfterMs: Type2.Optional(Type2.Integer({ minimum: 1, description: "No-observed-activity window before a run needs attention" })),
  activeNoticeAfterMs: Type2.Optional(Type2.Integer({ minimum: 1, description: "Active-long-running notice threshold by elapsed ms (default: 240000)" })),
  activeNoticeAfterTurns: Type2.Optional(Type2.Integer({ minimum: 1, description: "Optional active-long-running notice threshold by assistant turns (disabled by default)" })),
  activeNoticeAfterTokens: Type2.Optional(Type2.Integer({ minimum: 1, description: "Optional active-long-running notice threshold by total tokens (disabled by default)" })),
  failedToolAttemptsBeforeAttention: Type2.Optional(Type2.Integer({ minimum: 1, description: "Consecutive mutating-tool failures before escalating to needs_attention (default: 3)" })),
  notifyOn: Type2.Optional(Type2.Array(Type2.String({ enum: ["active_long_running", "needs_attention"] }), {
    description: "Control event types that should notify the parent/orchestrator. Defaults to active_long_running and needs_attention."
  })),
  notifyChannels: Type2.Optional(Type2.Array(Type2.String({ enum: ["event", "async", "intercom"] }), {
    description: "Notification channels to use when available. Defaults to event, async, and intercom."
  }))
});
var SubagentParamProperties = {
  agent: Type2.Optional(Type2.String({ description: "One-child agent or management target." })),
  task: Type2.Optional(Type2.String({ description: "One-child task; requires agent." })),
  extensionBindings: Type2.Optional(Type2.Unsafe({ type: "object", maxProperties: 16, additionalProperties: true, description: "Child-only plain JSON; package.name/1; depth 16, 256 props, 16 KiB." })),
  // Management action (when present, tool operates in management mode)
  action: Type2.Optional(Type2.String({
    minLength: 1,
    description: 'Management/control only; omit for execution. validate accepts workflow: true or a script path. Discover actions with {action:"guide",options:{topic:"tool-reference"}}.'
  })),
  capabilities: Type2.Optional(Type2.Boolean({ description: "list: compact capability rows/details without system prompts." })),
  name: Type2.Optional(Type2.String({ description: "schedule.create name." })),
  id: Type2.Optional(Type2.String({
    description: "Run id/prefix for status/control."
  })),
  runId: Type2.Optional(Type2.String({
    description: "Target run ID; prefer id."
  })),
  dir: Type2.Optional(Type2.String({
    description: "Async directory for status/control."
  })),
  handoffPath: Type2.Optional(Type2.String({ description: "Existing manifest for worktree/lane actions." })),
  repo: Type2.Optional(Type2.String({ description: "Cleanup repo; apply requires it." })),
  planId: Type2.Optional(Type2.String({ description: "Reviewed cleanup plan for apply." })),
  laneId: Type2.Optional(Type2.String({ minLength: 1, maxLength: 128, description: "Exact manifest run id for lane actions." })),
  merge: Type2.Optional(Type2.Unsafe({ type: "object", additionalProperties: true, description: "lane.recordMerge evidence; read guide tool-reference." })),
  supersession: Type2.Optional(Type2.Unsafe({ type: "object", additionalProperties: true, description: "lane.recordSupersession evidence; read guide tool-reference." })),
  index: Type2.Optional(Type2.Integer({ minimum: 0, description: "Zero-based child/transcript index." })),
  childId: Type2.Optional(Type2.String({ minLength: 1, maxLength: 256, description: "Child-scoped stop identity." })),
  toolCallId: Type2.Optional(Type2.String({ description: "Command tool-call id." })),
  view: Type2.Optional(Type2.String({
    enum: ["fleet", "transcript"],
    description: "status view: fleet overview or transcript tail with id/dir and optional index."
  })),
  lines: Type2.Optional(Type2.Integer({ minimum: 1, maximum: 500, description: "Transcript tail lines; default 80." })),
  topic: Type2.Optional(Type2.String()),
  message: Type2.Optional(Type2.String({ description: "resume/steer guidance or project.open prompt." })),
  mode: Type2.Optional(Type2.String({ enum: ["steer", "follow_up", "auto", "plan", "apply"], description: "steer delivery; worktree.cleanup plan/apply (reviewed planId)." })),
  steeringRecovery: Type2.Optional(Type2.Boolean({ description: "steer: pause/revive after missed acknowledgment; default true in direct steer mode, forced false by extension RPC for exact ownership." })),
  additional: Type2.Optional(Type2.Integer({ minimum: 1, description: "grant-spawn-budget: root interactive parent + native user confirmation only; total grants capped at original configured cap." })),
  scope: Type2.Optional(Type2.String({ enum: ["session", "user", "project"], description: "watchdog.configure scope; default session, persistent only if explicit." })),
  target: Type2.Optional(Type2.String({ enum: ["main", "children", "child"], description: "Watchdog target." })),
  focus: Type2.Optional(Type2.Boolean({ description: "Focus inspector.open/project.open pane." })),
  thinking: Type2.Optional(Type2.Unsafe({ anyOf: [{ type: "string" }, { type: "boolean" }], description: "watchdog.configure only: off/minimal/low/medium/high/xhigh/max, inherit, false=off; true invalid. Dispatch ignores this; use model suffix." })),
  at: Type2.Optional(Type2.String({ description: "Delay/ISO or local HH:mm." })),
  every: Type2.Optional(Type2.String({ description: "Duration or day/week." })),
  sessionOnly: Type2.Optional(Type2.Boolean()),
  quiet: Type2.Optional(Type2.Boolean()),
  on: Type2.Optional(Type2.Array(Type2.String({ enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }), { minItems: 1, description: "Weekly." })),
  timezone: Type2.Optional(Type2.String({ description: "IANA/UTC." })),
  overlap: Type2.Optional(Type2.String({ enum: ["skip"] })),
  catchUp: Type2.Optional(Type2.String({ enum: ["none", "latest"], description: "Missed; default latest." })),
  missionId: Type2.Optional(Type2.String({ description: "Existing mission to attach to a workflow or schedule.create; read guide missions for lifecycle and retention." })),
  mission: Type2.Optional(Type2.Unsafe({ ...MissionLaunchOverride, description: "false disables; true invalid. Object: exactly one non-empty title or summary; objective/labels optional; goal only true, requires budget.tokens." })),
  missionUpdate: Type2.Optional(Type2.Unsafe({ ...MissionUpdateOverride, description: "Mission patch; read guide missions." })),
  missionStatus: Type2.Optional(Type2.String()),
  missionScope: Type2.Optional(Type2.String({ description: "project (default) or global pointer index." })),
  runMode: Type2.Optional(Type2.String({ description: "Attached run mode." })),
  runStatus: Type2.Optional(Type2.String({ description: "Attached run status." })),
  summary: Type2.Optional(Type2.String({ description: "Mission close summary." })),
  // Agent configuration for create/update (nested to avoid conflicts with execution fields)
  config: Type2.Optional(Type2.Unsafe({
    anyOf: [
      { type: "object", additionalProperties: true },
      { type: "string" }
    ],
    description: "create/update agent config; object or JSON string."
  })),
  workflow: Type2.Optional(Type2.Unsafe({
    anyOf: [{ type: "boolean" }, { type: "string", minLength: 1 }],
    description: "true: run the one ```js workflow block written in this same reply (false invalid). String with '/': script file read from request cwd. Other string: named workflow resource. Raw scripts (true or path) have no runs.host."
  })),
  args: Type2.Optional(Type2.Unsafe({ type: "object", maxProperties: MAX_ARGS_FIELDS, additionalProperties: true, description: `Plain-JSON args for workflow; ${MAX_ARGS_FIELDS} fields/object, ${MAX_ARGS_ITEMS} items/array, depth ${MAX_ARGS_DEPTH}, ${MAX_ARGS_BYTES / 1024} KiB total; raw-script args are exposed deeply frozen and persisted, so do not include secrets.` })),
  reuseFrom: Type2.Optional(Type2.String({ minLength: 1, description: "Exact id of a workflow run ended by a reload, handoff or Pi exit; this async workflow reuses its finished children and re-attaches to its running ones." })),
  globalConcurrencyLimit: Type2.Optional(Type2.Integer({ minimum: 1 })),
  maxSubagentSpawnsPerRun: Type2.Optional(Type2.Integer({ minimum: 1 })),
  preflight: Type2.Optional(WorkflowPreflightOverride),
  chatProgress: Type2.Optional(Type2.String({ enum: ["auto", "off", "live-card"], description: "auto: live card only for watched foreground in same Git repository. live-card requires same-repo async:false; async: omit or auto/off." })),
  isolation: Type2.Optional(Type2.String({ enum: ["none", "worktree"], description: "Shared cwd or managed git worktrees." })),
  worktree: Type2.Optional(Type2.Boolean({ description: "Isolate each workflow child in a managed git worktree; child worktree:false overrides default." })),
  baseRef: Type2.Optional(Type2.String()),
  lane: Type2.Optional(WorkflowLaneMetadata),
  context: Type2.Optional(Type2.String({
    enum: ["fresh", "fork", "profile"],
    description: "fresh/fork overrides every child; profile requires agent's declared defaultContext, ignoring config. Omitted: defaultSubagentContext wins over each agent defaultContext; implicit fork needs persisted parent + leaf, else fresh. forkContext may prune forks before spawn."
  })),
  async: Type2.Optional(Type2.Boolean({ description: "Background; default asyncByDefault. false only to block parent." })),
  timeoutMs: Type2.Optional(Type2.Integer({ minimum: 1, description: "Foreground and single async runs use config timeoutMs, else 30m; async composites have no default parent deadline. Alias maxRuntimeMs; must agree." })),
  maxRuntimeMs: Type2.Optional(Type2.Integer({ minimum: 1, description: "Alias timeoutMs (same defaults)." })),
  checkpointBeforeDeadlineMs: Type2.Optional(Type2.Integer({ minimum: 1, maximum: 2147483647, description: "Async single-agent runs only: the runner requests that the child checkpoint and stop this many ms before the run deadline (best-effort; the deadline kill still applies)." })),
  toolTimeoutMs: Type2.Optional(Type2.Integer({ minimum: 1, description: "Per-tool deadline (ms); fast builtins default 5m." })),
  toolBudget: Type2.Optional(ToolBudgetOverride),
  usageBudget: Type2.Optional(UsageBudgetOverride),
  agentScope: Type2.Optional(Type2.String({ description: "user/project/both (default); project wins collisions." })),
  cwd: Type2.Optional(Type2.String({ description: "Execution/project-pane directory." })),
  machine: Type2.Optional(Type2.String({ minLength: 1, maxLength: 128, description: 'Herdr saved machine id or label (runs an external CLI agent), a Rex host named in settings (runs a Pi child), or "local" (a Pi child in a Rex pane here). On another machine, cwd is a directory there.' })),
  artifacts: Type2.Optional(Type2.Boolean({ description: "Debug artifacts; default true." })),
  includeProgress: Type2.Optional(Type2.Boolean({ description: "Full result progress; default false." })),
  share: Type2.Optional(Type2.Boolean({ description: "Upload session to GitHub Gist; default false." })),
  sessionDir: Type2.Optional(
    Type2.String({ description: "Session log directory; default temp, independent of share." })
  ),
  control: Type2.Optional(ControlOverrides),
  // Workflow defaults forwarded to each runs.run/runs.all child unless overridden there.
  output: Type2.Optional(Type2.Unsafe({
    anyOf: [
      { type: "string" },
      { type: "boolean" }
    ],
    description: "Child output path or false; relative workflow paths use managed artifact routing. Bind durable output here, not task prose; return outputReference/outputPathMapping/artifactPaths."
  })),
  outputMode: Type2.Optional(OutputModeOverride),
  maxOutput: Type2.Optional(Type2.Object({ bytes: Type2.Optional(Type2.Integer({ minimum: 1 })), lines: Type2.Optional(Type2.Integer({ minimum: 1 })) }, { additionalProperties: false })),
  skill: Type2.Optional(SkillOverride),
  model: Type2.Optional(Type2.String({ description: "Child model provider/id; bare id only if unique. Suffix :off/minimal/low/medium/high/xhigh/max overrides agent thinking default." })),
  fast: Type2.Optional(Type2.Boolean({ description: "Native OpenAI-Codex priority tier; default false, may cost more/quota." })),
  outputSchema: Type2.Optional(OutputSchemaOverride),
  agentContract: Type2.Optional(AgentContractOverride),
  acceptance: Type2.Optional(AcceptanceOverride),
  gate: Type2.Optional(Type2.Unsafe({
    anyOf: [
      { type: "string", minLength: 1 },
      { type: "object", properties: { command: { type: "string", minLength: 1 }, output: { type: "string", enum: ["json"] }, schema: { type: "object" }, timeoutMs: { type: "integer", minimum: 1 } }, required: ["command"], additionalProperties: false }
    ],
    description: 'Host gate command run after the child finishes: a string, or an object; with output "json", passing stdout becomes structuredOutput (not with outputSchema). Cannot be combined with acceptance except false (treated as omitted).'
  }))
};
var SubagentFlatParams = Type2.Object(SubagentParamProperties);
var { runId: _runId, maxRuntimeMs: _maxRuntimeMs, isolation: _isolation, ...ModelProperties } = SubagentParamProperties;
var { agent, task, workflow, args, async, model, cwd, worktree, output, action, id, message, ...SubagentOptionProperties } = ModelProperties;
var SUBAGENT_OPTION_KEYS = Object.keys(SubagentOptionProperties);
var SubagentOptionParams = Type2.Object(SubagentOptionProperties, { additionalProperties: false });
var ModelTopLevelProperties = {
  agent,
  task,
  workflow,
  args,
  async,
  model,
  cwd,
  worktree,
  output,
  action,
  id,
  message,
  options: Type2.Optional(Type2.Unsafe({ type: "object", additionalProperties: true, description: "Every field not listed here, such as acceptance, timeoutMs, context, view and index; guide tool-reference/parameter-reference." }))
};
var SubagentParams = keepTopLevelParameterDescriptions(Type2.Object(ModelTopLevelProperties));
var StructuredTask = { type: "object", properties: { agent: { type: "string", minLength: 1 }, task: { type: "string" }, cwd: { type: "string" }, model: { type: "string" } }, required: ["agent", "task"], additionalProperties: false };
var StructuredWorkflowProperties = {
  action: Type2.Optional(Type2.String({ minLength: 1, description: 'Management/control only; omit for execution. Discover actions with {action:"guide",options:{topic:"tool-reference"}}.' })),
  task: Type2.Optional(Type2.String({ description: "One-child task with agent, or the original request ({task}) with chain/tasks." })),
  tasks: Type2.Optional(Type2.Unsafe({ type: "array", minItems: 1, items: StructuredTask, description: "Parallel children; results in order." })),
  // Flattened step: {agent, task?, as?} or {parallel}; no object-shape union for provider converters.
  chain: Type2.Optional(Type2.Unsafe({
    type: "array",
    minItems: 1,
    items: { type: "object", properties: { agent: { type: "string", minLength: 1 }, task: { type: "string" }, as: { type: "string" }, cwd: { type: "string" }, model: { type: "string" }, parallel: { type: "array", minItems: 1, items: StructuredTask } }, additionalProperties: false },
    description: "Sequential steps: {agent,task?,as?,cwd?,model?} or {parallel:[{agent,task,cwd?,model?}]}."
  }))
};
function createSubagentParamsSchema(disabled) {
  if (!disabled || disabled.params.size === 0) return SubagentParams;
  const structured = disabled.features.has("workflow-scripts");
  const enabledProperties = Object.fromEntries(Object.entries(ModelTopLevelProperties).flatMap(([name, schema]) => {
    if (disabled.params.has(name)) return [];
    if (structured && name === "action") return [[name, StructuredWorkflowProperties.action]];
    if (structured && name === "task") return [[name, StructuredWorkflowProperties.task], ["tasks", StructuredWorkflowProperties.tasks], ["chain", StructuredWorkflowProperties.chain]];
    return [[name, schema]];
  }));
  return keepTopLevelParameterDescriptions(Type2.Object(enabledProperties));
}
var SubagentWaitParamsSchema = Type2.Object({
  id: Type2.Optional(Type2.String({ description: "Run id or prefix." })),
  nonBlocking: Type2.Optional(Type2.Boolean({ description: "Subscribe to id's wake and return immediately; requires id, not with all." })),
  all: Type2.Optional(Type2.Boolean({ description: "Wait for all work active at call time." })),
  timeoutMs: Type2.Optional(Type2.Integer({ minimum: 1, description: "Max wait; default waitTool.defaultTimeoutMs, then 30 min." })),
  stopOnAttention: Type2.Optional(Type2.Boolean({ description: "false: keep waiting through all attention except supervisor requests." }))
});
var SubagentWaitParams = keepTopLevelParameterDescriptions(SubagentWaitParamsSchema);

// src/runs/background/wait-config.ts
var WAIT_TOOL_ENABLED_ENV = "PI_SUBAGENT_WAIT_TOOL_ENABLED";
var WAIT_TOOL_DEFAULT_TIMEOUT_MS_ENV = "PI_SUBAGENT_WAIT_TOOL_DEFAULT_TIMEOUT_MS";
var TRUE_VALUES = /* @__PURE__ */ new Set(["1", "true", "yes", "on", "enabled"]);
var FALSE_VALUES = /* @__PURE__ */ new Set(["0", "false", "no", "off", "disabled"]);
function environmentValue(value) {
  if (value === void 0) return void 0;
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  throw new Error(`${WAIT_TOOL_ENABLED_ENV} must be one of true/false, 1/0, yes/no, on/off, or enabled/disabled.`);
}
function environmentDefaultTimeoutMs(value) {
  if (value === void 0) return void 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${WAIT_TOOL_DEFAULT_TIMEOUT_MS_ENV} must be a positive integer.`);
  return parsed;
}
function configuredValue(config) {
  if (config === void 0) return {};
  if (typeof config === "boolean") return { enabled: config };
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("config.waitTool must be a boolean or an object with optional enabled and defaultTimeoutMs values.");
  }
  const { enabled, defaultTimeoutMs } = config;
  if (enabled !== void 0 && typeof enabled !== "boolean") throw new Error("config.waitTool.enabled must be a boolean.");
  if (defaultTimeoutMs !== void 0 && (!Number.isInteger(defaultTimeoutMs) || defaultTimeoutMs < 1)) {
    throw new Error("config.waitTool.defaultTimeoutMs must be a positive integer.");
  }
  return { enabled, ...defaultTimeoutMs !== void 0 ? { defaultTimeoutMs } : {} };
}
function resolveWaitToolConfig(config, env = process.env) {
  const configured = configuredValue(config);
  const envDefaultTimeoutMs = environmentDefaultTimeoutMs(env[WAIT_TOOL_DEFAULT_TIMEOUT_MS_ENV]);
  return {
    enabled: environmentValue(env[WAIT_TOOL_ENABLED_ENV]) ?? configured.enabled ?? true,
    ...envDefaultTimeoutMs ?? configured.defaultTimeoutMs !== void 0 ? { defaultTimeoutMs: envDefaultTimeoutMs ?? configured.defaultTimeoutMs } : {}
  };
}

// src/runs/background/subagent-wait.ts
import * as fs7 from "node:fs";
import * as path4 from "node:path";

// src/runs/background/wait-completions.ts
import * as fs5 from "node:fs";

// src/runs/background/completion-replay.ts
import * as fs4 from "node:fs";
import * as path3 from "node:path";
var REPLAY_VERSION = 1;
var ARCHIVE_VERSION = 1;
var ARCHIVE_TEXT_LIMIT_BYTES = 64 * 1024;
var REPLAY_DIR_NAME = "completion-replay";
var ARCHIVE_DIR_NAME = "output-archives";
var CLEANUP_INTERVAL_MS = 6e4;
var lastCleanupByResultsDir = /* @__PURE__ */ new Map();
function safeRunFile(runId) {
  return `${encodeURIComponent(runId)}.json`;
}
function completionReplayPath(resultsDir, runId) {
  return path3.join(resultsDir, REPLAY_DIR_NAME, safeRunFile(runId));
}
function completionArchivePath(resultsDir, runId) {
  return path3.join(resultsDir, ARCHIVE_DIR_NAME, safeRunFile(runId));
}
function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function existingFile(value) {
  const filePath = nonEmptyString(value);
  if (!filePath) return void 0;
  try {
    return fs4.statSync(filePath).isFile() ? filePath : void 0;
  } catch {
    return void 0;
  }
}
function outputArtifactPath(child) {
  if (!child.artifactPaths || typeof child.artifactPaths !== "object" || Array.isArray(child.artifactPaths)) return void 0;
  return existingFile(child.artifactPaths.outputPath);
}
function writeCompletionArchive(resultsDir, runId, data, createdAt) {
  const entries = [];
  const results = Array.isArray(data.results) ? data.results : [];
  for (let resultIndex = 0; resultIndex < results.length; resultIndex++) {
    const value = results[resultIndex];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const child = value;
    const agent2 = nonEmptyString(child.agent);
    const artifactPath = outputArtifactPath(child);
    if (artifactPath) {
      entries.push({ ...agent2 ? { agent: agent2 } : {}, resultIndex, source: "output-artifact", path: artifactPath });
      continue;
    }
    const sessionPath = existingFile(child.sessionFile);
    if (sessionPath) {
      entries.push({ ...agent2 ? { agent: agent2 } : {}, resultIndex, source: "session", path: sessionPath });
      continue;
    }
    const output2 = nonEmptyString(child.output);
    const error = nonEmptyString(child.error);
    if (output2 || error) {
      const bounded = utf8Tail([error ? `Error: ${error}` : void 0, output2].filter(Boolean).join("\n"), ARCHIVE_TEXT_LIMIT_BYTES);
      entries.push({
        ...agent2 ? { agent: agent2 } : {},
        resultIndex,
        source: "result-tail",
        text: bounded.text,
        ...bounded.truncated ? { truncated: true } : {}
      });
    }
  }
  if (results.length === 0) {
    const sessionPath = existingFile(data.sessionFile);
    if (sessionPath) entries.push({ source: "session", path: sessionPath });
  }
  if (entries.length === 0) {
    const summary = nonEmptyString(data.summary);
    if (summary) {
      const bounded = utf8Tail(summary, ARCHIVE_TEXT_LIMIT_BYTES);
      entries.push({ source: "result-tail", text: bounded.text, ...bounded.truncated ? { truncated: true } : {} });
    }
  }
  const archive = { version: ARCHIVE_VERSION, runId, createdAt, entries };
  const archivePath = completionArchivePath(resultsDir, runId);
  writePrivateAtomicJson(archivePath, archive);
  return archivePath;
}
function parseCompletion(value, runId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const completion = value;
  if (completion.runId !== runId) return void 0;
  return completion;
}
function parseReplay(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const record = value;
  if (record.version !== REPLAY_VERSION || typeof record.runId !== "string" || typeof record.sessionId !== "string" || typeof record.completedAt !== "number" || typeof record.expiresAt !== "number" || typeof record.archivePath !== "string") return void 0;
  const completion = parseCompletion(record.completion, record.runId);
  return completion ? { ...record, completion } : void 0;
}
function validateReplayRecord(resultsDir, runId, record) {
  if (record.runId !== runId) return void 0;
  const archivePath = completionArchivePath(resultsDir, runId);
  return path3.resolve(record.archivePath) === path3.resolve(archivePath) ? { ...record, archivePath, completion: { ...record.completion, archivePath } } : void 0;
}
function runIdFromReplayFile(file) {
  if (!file.endsWith(".json")) return void 0;
  try {
    const runId = decodeURIComponent(file.slice(0, -".json".length));
    return safeRunFile(runId) === file ? runId : void 0;
  } catch {
    return void 0;
  }
}
function removeBestEffort(filePath) {
  try {
    fs4.rmSync(filePath, { force: true });
  } catch {
  }
}
function parseArchive(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const archive = value;
  if (archive.version !== ARCHIVE_VERSION || typeof archive.runId !== "string" || typeof archive.createdAt !== "number" || !Array.isArray(archive.entries)) return void 0;
  const entries = archive.entries.flatMap((value2) => {
    if (!value2 || typeof value2 !== "object" || Array.isArray(value2)) return [];
    const entry = value2;
    if (entry.source !== "output-artifact" && entry.source !== "session" && entry.source !== "result-tail") return [];
    return [{
      ...typeof entry.agent === "string" ? { agent: entry.agent } : {},
      ...typeof entry.resultIndex === "number" && Number.isSafeInteger(entry.resultIndex) && entry.resultIndex >= 0 ? { resultIndex: entry.resultIndex } : {},
      source: entry.source,
      ...typeof entry.path === "string" ? { path: entry.path } : {},
      ...typeof entry.text === "string" ? { text: entry.text } : {},
      ...entry.truncated === true ? { truncated: true } : {}
    }];
  });
  return { version: ARCHIVE_VERSION, runId: archive.runId, createdAt: archive.createdAt, entries };
}
function writeCompletionReplay(input) {
  const archivePath = writeCompletionArchive(input.resultsDir, input.runId, input.data, input.now);
  const completion = { ...input.completion, archivePath };
  const record = {
    version: REPLAY_VERSION,
    runId: input.runId,
    sessionId: input.sessionId,
    completedAt: input.now,
    expiresAt: input.now + input.ttlMs,
    completion,
    archivePath
  };
  writePrivateAtomicJson(completionReplayPath(input.resultsDir, input.runId), record);
  cleanupCompletionReplayIfDue(input.resultsDir, input.now, input.ttlMs);
  return record;
}
function readCompletionReplay(resultsDir, runId, options = {}) {
  const replayPath = completionReplayPath(resultsDir, runId);
  let parsed;
  try {
    parsed = parseReplay(JSON.parse(fs4.readFileSync(replayPath, "utf-8")));
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
  if (!parsed) return void 0;
  const safeRecord = validateReplayRecord(resultsDir, runId, parsed);
  if (!safeRecord) {
    removeBestEffort(replayPath);
    return void 0;
  }
  parsed = safeRecord;
  if (options.sessionId !== void 0 && parsed.sessionId !== options.sessionId) return void 0;
  if (parsed.expiresAt <= (options.now ?? Date.now())) {
    removeBestEffort(replayPath);
    removeBestEffort(parsed.archivePath);
    return void 0;
  }
  return parsed;
}
function readCompletionArchive(archivePath) {
  try {
    const archive = parseArchive(JSON.parse(fs4.readFileSync(archivePath, "utf-8")));
    if (!archive) throw new Error("Completion archive is malformed.");
    return archive;
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
}
function cleanupCompletionReplayIfDue(resultsDir, now, maxAgeMs, intervalMs = CLEANUP_INTERVAL_MS) {
  const last = lastCleanupByResultsDir.get(resultsDir);
  if (last !== void 0 && now - last < intervalMs) return false;
  lastCleanupByResultsDir.set(resultsDir, now);
  cleanupCompletionReplay(resultsDir, now, maxAgeMs);
  return true;
}
function cleanupCompletionReplay(resultsDir, now, maxAgeMs) {
  const replayDir = path3.join(resultsDir, REPLAY_DIR_NAME);
  try {
    for (const file of fs4.readdirSync(replayDir)) {
      const runId = runIdFromReplayFile(file);
      if (!runId) continue;
      const filePath = path3.join(replayDir, file);
      try {
        const record = parseReplay(JSON.parse(fs4.readFileSync(filePath, "utf-8")));
        const safeRecord = record ? validateReplayRecord(resultsDir, runId, record) : void 0;
        if (record && !safeRecord) {
          fs4.rmSync(filePath, { force: true });
        } else if (safeRecord && safeRecord.expiresAt <= now) {
          fs4.rmSync(filePath, { force: true });
          fs4.rmSync(safeRecord.archivePath, { force: true });
        } else if (!record && now - fs4.statSync(filePath).mtimeMs > maxAgeMs) {
          fs4.rmSync(filePath, { force: true });
        }
      } catch {
      }
    }
  } catch {
  }
  const archiveDir = path3.join(resultsDir, ARCHIVE_DIR_NAME);
  try {
    for (const file of fs4.readdirSync(archiveDir)) {
      const filePath = path3.join(archiveDir, file);
      try {
        if (now - fs4.statSync(filePath).mtimeMs > maxAgeMs) fs4.rmSync(filePath, { force: true });
      } catch {
      }
    }
  } catch {
  }
}

// src/runs/background/wait-completions.ts
function asNonEmptyString(value) {
  return typeof value === "string" && value ? value : void 0;
}
function nonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function projectedUsage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const record = value;
  const input = nonNegativeNumber(record.input);
  const output2 = nonNegativeNumber(record.output);
  const cacheRead = nonNegativeNumber(record.cacheRead);
  const cacheWrite = nonNegativeNumber(record.cacheWrite);
  const cost = nonNegativeNumber(record.cost);
  const turns = nonNegativeNumber(record.turns);
  if (input === void 0 || output2 === void 0 || cacheRead === void 0 || cacheWrite === void 0 || cost === void 0 || turns === void 0 || !Number.isSafeInteger(turns)) return void 0;
  return { input, output: output2, cacheRead, cacheWrite, cost, turns };
}
function errorCode(error) {
  return typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
}
function isAccessDenied(error) {
  const code = errorCode(error);
  return code === "EPERM" || code === "EACCES";
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
var STRUCTURED_OUTPUT_INLINE_LIMIT_BYTES = 4 * 1024;
function waitResultPayloadCandidate(resultsDir, run) {
  const publicPath = resultFilePath(resultsDir, run.id);
  if (!run.sessionId) return publicPath;
  try {
    const indexedPath = resultPayloadPathForSessionRun(resultsDir, run.sessionId, run.id);
    return indexedPath ?? publicPath;
  } catch (error) {
    if (!isAccessDenied(error)) throw error;
    const pendingPath = fallbackResultPayloadPathForSessionRun(resultsDir, run.sessionId, run.id);
    return pendingPath ?? publicPath;
  }
}
function readWaitResultPayload(candidatePath, run) {
  if (!run.sessionId) return void 0;
  const payload = JSON.parse(fs5.readFileSync(candidatePath, "utf-8"));
  if (!resultPayloadMatchesSessionRun(payload, run.sessionId, run.id)) return void 0;
  return payload;
}
function projectStructuredOutput(value) {
  if (value === void 0) return void 0;
  const serialized = JSON.stringify(value);
  if (typeof serialized !== "string") throw new Error("Structured output must be JSON-serializable");
  return Buffer.byteLength(serialized, "utf8") <= STRUCTURED_OUTPUT_INLINE_LIMIT_BYTES ? JSON.parse(serialized) : void 0;
}
function toWaitCompletion(data, runId) {
  const results = Array.isArray(data.results) ? data.results.flatMap((entry) => {
    if (entry === null || typeof entry !== "object") return [];
    const child = entry;
    const outputState = child.outputState === "present" || child.outputState === "absent" || child.outputState === "unknown" ? child.outputState : void 0;
    const artifactPaths = child.artifactPaths !== null && typeof child.artifactPaths === "object" ? child.artifactPaths : void 0;
    const agent3 = asNonEmptyString(child.agent);
    const childRunId = asNonEmptyString(child.runId);
    const usage = projectedUsage(child.usage);
    const sessionFile = asNonEmptyString(child.sessionFile);
    const error = asNonEmptyString(child.error);
    const model2 = asNonEmptyString(child.model);
    const structuredOutput = projectStructuredOutput(child.structuredOutput);
    const structuredOutputPath = asNonEmptyString(child.structuredOutputPath);
    const contextOverflow = child.contextOverflow === true;
    const timeoutRecovery = projectTimeoutRecovery(child.timeoutRecovery);
    return [{
      ...agent3 ? { agent: agent3 } : {},
      ...childRunId ? { runId: childRunId } : {},
      ...usage ? { usage } : {},
      ...sessionFile ? { sessionFile } : {},
      ...typeof child.success === "boolean" ? { success: child.success } : {},
      ...outputState ? { outputState } : {},
      ...child.outputPartial === true ? { outputPartial: true } : {},
      ...structuredOutput !== void 0 ? { structuredOutput } : {},
      ...structuredOutputPath ? { structuredOutputPath } : {},
      ...error ? { error } : {},
      ...model2 ? { model: model2 } : {},
      ...contextOverflow ? { contextOverflow: true } : {},
      ...artifactPaths ? { artifactPaths } : {},
      ...timeoutRecovery ? { timeoutRecovery } : {}
    }];
  }) : void 0;
  const agent2 = asNonEmptyString(data.agent);
  const receipt = data.workflowReceipt;
  const workflowReceiptPath = receipt && typeof receipt === "object" && !Array.isArray(receipt) ? asNonEmptyString(receipt.path) : void 0;
  const mode = asNonEmptyString(data.mode);
  const state = asNonEmptyString(data.state);
  const workflowChildren = parseWorkflowChildSummary(data.workflowChildren);
  if (workflowChildren && workflowChildren.workflowRunId !== runId) throw new Error("workflowChildren.workflowRunId does not match its completion run id.");
  return {
    runId,
    ...agent2 ? { agent: agent2 } : {},
    ...mode ? { mode } : {},
    ...workflowReceiptPath ? { workflowReceiptPath } : {},
    ...state ? { state } : {},
    ...typeof data.success === "boolean" ? { success: data.success } : {},
    ...results && results.length > 0 ? { results } : {},
    ...workflowChildren ? { workflowChildren } : {}
  };
}
function recordWaitCompletion(state, runId, data, now, ttlMs, persistence) {
  const sessionId = asNonEmptyString(data.sessionId);
  if (!sessionId || !resultPayloadMatchesSessionRun(data, sessionId, runId)) return false;
  if (persistence && persistence.sessionId !== sessionId) return false;
  const store = state.completedResults ??= /* @__PURE__ */ new Map();
  for (const [key, entry] of store) {
    if (now - entry.seenAt > ttlMs) store.delete(key);
  }
  let completion = toWaitCompletion(data, runId);
  if (persistence) {
    try {
      completion = writeCompletionReplay({
        ...persistence,
        runId,
        completion,
        data,
        now,
        ttlMs
      }).completion;
    } catch (error) {
      console.error(`Failed to persist completion replay for '${runId}':`, error);
    }
  }
  store.set(runId, { sessionId, seenAt: now, completion });
  return completion.archivePath !== void 0;
}
function collectWaitCompletions(terminal, state, resultsDir, onReference) {
  if (terminal.length === 0) return void 0;
  const completions = [];
  const add = (completion, resultPath) => {
    completions.push(completion);
    const reference = completion.archivePath ?? resultPath;
    if (reference) onReference?.(`Result [${completion.runId}]: ${reference}`);
  };
  for (const run of terminal) {
    const recorded = state.completedResults?.get(run.id);
    if (recorded && recorded.sessionId === run.sessionId) {
      if (recorded.completion.archivePath) {
        add(recorded.completion);
        continue;
      }
      try {
        const candidatePath2 = waitResultPayloadCandidate(resultsDir, run);
        if (!readWaitResultPayload(candidatePath2, run)) {
          const replay2 = readCompletionReplay(resultsDir, run.id, { sessionId: run.sessionId });
          add(replay2?.completion ?? recorded.completion);
          continue;
        }
        add(recorded.completion, candidatePath2);
        continue;
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
      const replay = readCompletionReplay(resultsDir, run.id, { sessionId: run.sessionId });
      add(replay?.completion ?? recorded.completion);
      continue;
    }
    let candidatePath;
    try {
      candidatePath = waitResultPayloadCandidate(resultsDir, run);
    } catch (error) {
      const publicResultPath = resultFilePath(resultsDir, run.id);
      throw new Error(`Failed to read subagent result '${publicResultPath}': ${errorMessage(error)}`, {
        cause: error instanceof Error ? error : void 0
      });
    }
    try {
      const payload = readWaitResultPayload(candidatePath, run);
      if (!payload) {
        const replay = readCompletionReplay(resultsDir, run.id, { sessionId: run.sessionId });
        if (replay) add(replay.completion);
        continue;
      }
      add(toWaitCompletion(payload, run.id), candidatePath);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        throw new Error(`Failed to read subagent result '${candidatePath}': ${errorMessage(error)}`, {
          cause: error instanceof Error ? error : void 0
        });
      }
      const late = state.completedResults?.get(run.id);
      if (late && late.sessionId === run.sessionId) {
        add(late.completion);
        continue;
      }
      try {
        const replay = readCompletionReplay(resultsDir, run.id, { sessionId: run.sessionId });
        if (replay) add(replay.completion);
      } catch (replayError) {
        throw new Error(`Failed to read completion replay for '${run.id}': ${errorMessage(replayError)}`, {
          cause: replayError instanceof Error ? replayError : void 0
        });
      }
    }
  }
  return completions.length > 0 ? completions : void 0;
}

// src/runs/background/resume-guidance.ts
import * as fs6 from "node:fs";
var INTERCOM_DETACH_ERROR = "detached for intercom coordination";
function isIntercomDetached(run) {
  return run.steps.some((step) => step.execution?.status === "detached" || errorWithoutReplyText(step.error)?.toLowerCase().includes(INTERCOM_DETACH_ERROR) === true) || errorWithoutReplyText(run.error)?.toLowerCase().includes(INTERCOM_DETACH_ERROR) === true;
}
function formatIntercomDetachGuidance(run) {
  if (!isIntercomDetached(run)) return void 0;
  return `Run "${run.id}" detached for intercom coordination. Reply to the supervisor request first, then wait with bg_wait({ id: "${run.id}" }). Use subagent({ action: "status", id: "${run.id}" }) to recover the result; do not resume or launch a replacement while it remains detached.`;
}
function formatAsyncReviveCommand(run) {
  const step = run.steps.find((candidate) => candidate.status === "failed");
  const sessionFile = step?.sessionFile ?? (run.steps.length === 1 ? run.sessionFile : void 0);
  if (!step || !sessionFile || !fs6.existsSync(sessionFile)) return void 0;
  try {
    const descriptor = readAsyncRecoveryDescriptor(run.asyncDir);
    if (!descriptor || descriptor.sourceRunId !== run.id || descriptor.agent !== step.agent) return void 0;
  } catch {
    return void 0;
  }
  const index = run.steps.length === 1 ? "" : `, options: { index: ${step.index} }`;
  return `subagent({ action: "resume", id: "${run.id}", message: "Continue from the persisted child session and report the result."${index} })`;
}
function formatResumeFirstFailedRunDetail(run) {
  if (run.state !== "failed") return void 0;
  const detachGuidance = formatIntercomDetachGuidance(run);
  if (detachGuidance) return detachGuidance;
  const command = formatAsyncReviveCommand(run);
  if (!command) return void 0;
  return `Resume-first: failed run "${run.id}" has a persisted child session. Revive the original run with ${command} before reporting failure or launching a replacement. Launch a replacement only if revive fails or the user explicitly asks for one.`;
}
function formatResumeFirstFailedRunsNote(runs) {
  const failedRuns = runs.filter((run) => run.state === "failed" || run.state === "partial");
  const detachGuidance = failedRuns.map(formatIntercomDetachGuidance).filter((guidance) => Boolean(guidance));
  const resumable = failedRuns.filter((run) => !isIntercomDetached(run)).map((run) => ({ run, command: formatAsyncReviveCommand(run) })).filter((entry) => Boolean(entry.command));
  const resumeGuidance = resumable.length === 0 ? "" : resumable.length === 1 ? ` Resume-first: failed run "${resumable[0].run.id}" has a persisted child session. Revive the original run with ${resumable[0].command} before reporting failure or launching a replacement. Launch a replacement only if revive fails or the user explicitly asks for one.` : ` Resume-first: ${resumable.length} failed runs have persisted child sessions. Inspect status and revive each original run before reporting failure or launching a replacement. Launch a replacement only if revive fails or the user explicitly asks for one.`;
  return `${detachGuidance.length > 0 ? ` ${detachGuidance.join(" ")}` : ""}${resumeGuidance}`;
}

// src/runs/background/subagent-wait.ts
var ACTIVE_STATES = ["queued", "running"];
var DEFAULT_TIMEOUT_MS = 30 * 60 * 1e3;
var MIN_POLL_INTERVAL_MS = 250;
var DEFAULT_POLL_INTERVAL_MS = 1e3;
var WAKE_CHANNELS = [
  INTERCOM_DETACH_REQUEST_EVENT,
  SUBAGENT_ASYNC_COMPLETE_EVENT,
  SUBAGENT_FOREGROUND_COMPLETE_EVENT,
  SUBAGENT_CONTROL_EVENT,
  SUBAGENT_CONTROL_INTERCOM_EVENT,
  SUBAGENT_RESULT_INTERCOM_EVENT
];
function defaultSleep(ms, signal) {
  return new Promise((resolve5) => {
    if (signal?.aborted) {
      resolve5();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve5();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve5();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
function waitForWake(ms, signal, deps) {
  const sleep = deps.sleep ?? defaultSleep;
  const events = deps.events;
  if (!events) return sleep(ms, signal);
  const providerChannels = deps.backgroundWork?.wakeChannels() ?? listBackgroundWorkWakeChannels();
  return new Promise((resolve5, reject) => {
    let settled = false;
    const unsubs = [];
    const wakeController = new AbortController();
    const done = () => {
      if (settled) return;
      settled = true;
      wakeController.abort();
      signal?.removeEventListener("abort", done);
      for (const u of unsubs) {
        try {
          u();
        } catch {
        }
      }
      resolve5();
    };
    if (signal?.aborted) {
      done();
      return;
    }
    signal?.addEventListener("abort", done, { once: true });
    try {
      for (const channel of [.../* @__PURE__ */ new Set([...WAKE_CHANNELS, ...providerChannels])]) {
        unsubs.push(events.on(channel, done));
      }
    } catch (error) {
      signal?.removeEventListener("abort", done);
      for (const unsubscribe of unsubs) {
        try {
          unsubscribe();
        } catch {
        }
      }
      reject(error);
      return;
    }
    void sleep(ms, wakeController.signal).then(done);
  });
}
function wakeSignal(signal, deps) {
  if (!deps.userInputSignal) return signal;
  return signal ? AbortSignal.any([signal, deps.userInputSignal]) : deps.userInputSignal;
}
function matchesId(run, id2) {
  return run.id === id2 || run.id.startsWith(id2);
}
function activeDetachedForegroundRuns(params, deps) {
  const sessionId = deps.state.currentSessionId;
  if (!sessionId || !deps.state.foregroundRuns) return [];
  const runs = [...deps.state.foregroundRuns.values()].filter(
    (run) => run.sessionId === sessionId && run.children.some((child) => child.status === "detached")
  );
  if (params.id) return runs.filter((run) => run.runId === params.id || run.runId.startsWith(params.id));
  return params.all === true ? runs : [];
}
function summarizeForegroundChildren(run, indices) {
  const counts = /* @__PURE__ */ new Map();
  for (const child of run.children) {
    if (!indices.has(child.index) || child.status === "detached") continue;
    counts.set(child.status, (counts.get(child.status) ?? 0) + 1);
  }
  return [...counts.entries()].map(([status, count]) => `${count} ${status}`).join(", ");
}
function foregroundChildrenNeedingAttention(run, indices) {
  return run.children.filter((child) => indices.has(child.index) && child.status === "detached" && child.activityState === "needs_attention" && child.currentTool === "contact_supervisor");
}
function formatForegroundAttention(run, children, elapsedMs) {
  const childList = children.map((child) => `${child.agent}${child.index !== void 0 ? `#${child.index}` : ""}`).join(", ");
  return result(
    `Waited ${formatDuration(elapsedMs)} for remembered detached foreground run "${run.runId}"; attention required. ${children.length} child run(s) need attention: ${childList}. Reply to any pending supervisor request, then call bg_wait({ id: "${run.runId}" }) again or inspect status; do not resume or launch a replacement while it remains detached.`
  );
}
function needsAttention(run) {
  return run.activityState === "needs_attention" || run.steps.some((step) => step.activityState === "needs_attention");
}
function hasSupervisorTool(run) {
  return run.currentTool === "contact_supervisor" || run.currentTool === "intercom" || run.steps.some((step) => step.currentTool === "contact_supervisor" || step.currentTool === "intercom");
}
function backgroundWorkIdentity(item) {
  return `${item.provider}\0${item.sessionId}\0${item.id}`;
}
function backgroundWorkForSession(deps, nowMs) {
  const sessionId = deps.state.currentSessionId;
  if (!sessionId) throw new Error("bg_wait requires an active session identity to scope background work safely.");
  return deps.backgroundWork?.snapshot(sessionId, nowMs) ?? snapshotBackgroundWork(sessionId, nowMs);
}
function waitRunScopes(deps) {
  return [
    { asyncDirRoot: deps.asyncDirRoot ?? DIRS.async, resultsDir: deps.resultsDir ?? DIRS.results },
    ...deps.nestedRootRunId ? [nestedRunScope(deps.nestedRootRunId)] : []
  ];
}
function collectScopedCompletions(terminal, deps, references) {
  const completions = waitRunScopes(deps).flatMap((scope) => collectWaitCompletions(
    terminal.filter((run) => path4.resolve(path4.dirname(run.asyncDir)) === path4.resolve(scope.asyncDirRoot)),
    deps.state,
    scope.resultsDir,
    (reference) => references.push(reference)
  ) ?? []);
  return completions.length ? completions : void 0;
}
function runsForSession(params, deps, activeOnly = true) {
  const runs = waitRunScopes(deps).flatMap(({ asyncDirRoot, resultsDir }) => listAsyncRuns(asyncDirRoot, {
    states: activeOnly ? [...ACTIVE_STATES] : void 0,
    sessionId: deps.state.currentSessionId ?? void 0,
    resultsDir,
    kill: deps.kill,
    now: deps.now,
    includeNested: false,
    ...params.id ? { runId: params.id } : {}
  }));
  return params.id ? runs.filter((run) => matchesId(run, params.id)) : runs;
}
function activeRunsForSession(params, deps) {
  return runsForSession(params, deps);
}
function attentionRunsForSession(params, deps, initialIds) {
  return activeRunsForSession(params, deps).filter((run) => needsAttention(run) && initialIds.has(run.id));
}
function runsForIds(runIds, deps) {
  return waitRunScopes(deps).flatMap(({ asyncDirRoot, resultsDir }) => [...runIds].flatMap((runId) => listAsyncRuns(asyncDirRoot, {
    sessionId: deps.state.currentSessionId ?? void 0,
    resultsDir,
    kill: deps.kill,
    now: deps.now,
    includeNested: false,
    runId,
    exactRunId: true
  })));
}
function summarizeTerminalRuns(runs, providerFinishedCount = 0) {
  if (runs.length === 0 && providerFinishedCount === 0) return "";
  const counts = { complete: 0, failed: 0, paused: 0 };
  for (const run of runs) {
    const count = counts[run.state];
    if (count !== void 0) counts[run.state] = count + 1;
  }
  const parts = [];
  if (counts.complete) parts.push(`${counts.complete} complete`);
  if (counts.failed) parts.push(`${counts.failed} failed`);
  if (counts.paused) parts.push(`${counts.paused} paused`);
  if (providerFinishedCount > 0) parts.push(`${providerFinishedCount} provider item(s) finished`);
  return parts.join(", ");
}
function completionUsage(completions) {
  if (!completions?.length) return void 0;
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
  let projected = false;
  for (const completion of completions) {
    for (const child of completion.results ?? []) {
      if (!child.usage || child.usage.input === 0 && child.usage.output === 0 && child.usage.cacheRead === 0 && child.usage.cacheWrite === 0 && child.usage.cost === 0 && child.usage.turns === 0) continue;
      projected = true;
      usage.input += child.usage.input;
      usage.output += child.usage.output;
      usage.cacheRead += child.usage.cacheRead;
      usage.cacheWrite += child.usage.cacheWrite;
      usage.cost += child.usage.cost;
      usage.turns += child.usage.turns;
    }
  }
  return projected ? usage : void 0;
}
function result(text, isError = false, completions) {
  const usage = completionUsage(completions);
  for (const completion of completions ?? []) {
    if (completion.workflowReceiptPath) text += `
Workflow receipt [${completion.runId}]: ${completion.workflowReceiptPath}`;
  }
  return {
    content: [{ type: "text", text }],
    ...isError ? { isError: true } : {},
    ...usage ? { usage: toAgentToolUsage(usage) } : {},
    details: {
      mode: "management",
      results: [],
      ...completions && completions.length > 0 ? { completions } : {}
    }
  };
}
function formatCompletionRecovery(completions) {
  const lines = (completions ?? []).flatMap((completion) => (completion.results ?? []).flatMap((child) => formatTimeoutRecoveryLines(child.timeoutRecovery)));
  return lines.length > 0 ? `
${lines.join("\n")}` : "";
}
function windowElapsedResult(text, activeRunIds, activeProviderItems = []) {
  return {
    content: [{ type: "text", text }],
    details: {
      mode: "management",
      results: [],
      wait: {
        reason: "window_elapsed",
        timedOut: true,
        activeRunIds,
        activeProviderItems: activeProviderItems.map(({ provider, id: id2 }) => ({ provider, id: id2 }))
      }
    }
  };
}
var WAIT_YIELD_TEXT = {
  supervisor_request: "Wait yielded for a pending supervisor request. Background work remains active and will continue after the supervisor reply.",
  user_input: "Wait yielded because the user sent a message. Background work remains active; read the message before waiting again."
};
function yieldResult(reason, activeRunIds, activeProviderItems = []) {
  return {
    content: [{ type: "text", text: WAIT_YIELD_TEXT[reason] }],
    details: {
      mode: "management",
      results: [],
      wait: {
        reason,
        timedOut: false,
        activeRunIds,
        activeProviderItems: activeProviderItems.map(({ provider, id: id2 }) => ({ provider, id: id2 }))
      }
    }
  };
}
function yieldForScope(reason, scope, params, deps, nowMs) {
  try {
    const activeAsyncIds = new Set(activeRunsForSession(params.id ? { id: params.id } : {}, deps).map((run) => run.id));
    const activeRunIds = new Set([...scope.asyncRunIds].filter((id2) => activeAsyncIds.has(id2)));
    for (const initial of scope.foregroundRuns) {
      const current = deps.state.foregroundRuns?.get(initial.runId);
      if (!current || current.sessionId !== initial.sessionId) continue;
      if (current.children.some((child) => initial.detachedIndices.has(child.index) && child.status === "detached")) activeRunIds.add(initial.runId);
    }
    const activeProviderItems = scope.providerIds.size > 0 ? backgroundWorkForSession(deps, nowMs).items.filter((item) => scope.providerIds.has(backgroundWorkIdentity(item))) : [];
    return yieldResult(reason, [...activeRunIds], activeProviderItems);
  } catch (error) {
    return result(error instanceof Error ? error.message : String(error), true);
  }
}
function asyncWaitUpdate(runs, providerCount, elapsedMs) {
  const activity = runs.flatMap((run) => {
    const activeSteps = run.steps.filter((step) => step.status === "pending" || step.status === "running");
    if (activeSteps.length === 0) {
      return [`${run.id}: ${run.state}`];
    }
    return activeSteps.map((step) => {
      const current = step.currentTool ?? (step.status === "pending" ? "queued" : "thinking\u2026");
      return `${step.agent}: ${current}${step.currentPath ? ` ${shortenPath(step.currentPath)}` : ""}`;
    });
  });
  const headline = [
    `Waiting ${formatDuration(elapsedMs)} for ${runs.length} async run(s) and ${providerCount} provider item(s).`,
    ...activity
  ].join(" \xB7 ");
  return result([headline, runs.length > 0 ? formatAsyncRunList(runs) : ""].filter(Boolean).join("\n"));
}
var TRANSCRIPT_TAIL_BYTES = 128 * 1024;
var TRANSCRIPT_PREVIEW_LINES = 3;
var TRANSCRIPT_PREVIEW_WIDTH = 220;
function compactTranscriptText(value, maxWidth = TRANSCRIPT_PREVIEW_WIDTH) {
  if (typeof value !== "string") return void 0;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return void 0;
  return compact.length <= maxWidth ? compact : `${compact.slice(0, Math.max(1, maxWidth - 1))}\u2026`;
}
function readTranscriptActivity(transcriptPath) {
  if (!transcriptPath) return void 0;
  let fd;
  try {
    const stat = fs7.statSync(transcriptPath);
    if (!stat.isFile() || stat.size <= 0) return void 0;
    const start = Math.max(0, stat.size - TRANSCRIPT_TAIL_BYTES);
    const length = stat.size - start;
    const buffer = Buffer.allocUnsafe(length);
    fd = fs7.openSync(transcriptPath, "r");
    const bytesRead = fs7.readSync(fd, buffer, 0, length, start);
    let lines = buffer.subarray(0, bytesRead).toString("utf-8").split(/\r?\n/);
    if (start > 0) lines = lines.slice(1);
    let currentTool;
    let currentToolArgs;
    let latestAt;
    const recent = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof record.ts === "number" && Number.isFinite(record.ts)) latestAt = record.ts;
      if (record.recordType === "tool_start" && typeof record.toolName === "string") {
        currentTool = record.toolName;
        currentToolArgs = compactTranscriptText(record.argsPreview, 140);
        const preview = currentToolArgs ? `${currentTool}: ${currentToolArgs}` : currentTool;
        recent.push(`tool: ${preview}`);
        continue;
      }
      if (record.recordType === "tool_end") {
        currentTool = void 0;
        currentToolArgs = void 0;
        continue;
      }
      if (record.recordType === "message") {
        if (record.sourceEventType === "initial_prompt" || record.role === "user") continue;
        const text = compactTranscriptText(record.text);
        if (text) recent.push(`${typeof record.role === "string" ? record.role : "message"}: ${text}`);
        continue;
      }
      if (record.recordType === "stdout" || record.recordType === "stderr") {
        const text = compactTranscriptText(record.text);
        if (text) recent.push(`${record.recordType}: ${text}`);
      }
    }
    return { currentTool, currentToolArgs, latestAt, recent: recent.slice(-TRANSCRIPT_PREVIEW_LINES) };
  } catch {
    return void 0;
  } finally {
    if (fd !== void 0) {
      try {
        fs7.closeSync(fd);
      } catch {
      }
    }
  }
}
function detachedForegroundWaitUpdate(run, pendingIndices, nowMs, elapsedMs) {
  const lines = [`Waiting for detached foreground run "${run.runId}" \xB7 ${formatDuration(elapsedMs)}`];
  for (const child of run.children) {
    if (!pendingIndices.has(child.index) || child.status !== "detached") continue;
    const activity = readTranscriptActivity(child.transcriptPath);
    const age = activity?.latestAt !== void 0 ? ` \xB7 activity ${formatDuration(Math.max(0, nowMs - activity.latestAt))} ago` : "";
    lines.push(`${child.agent} \xB7 working after supervisor handoff${age}`);
    if (activity?.currentTool) {
      lines.push(`  current: ${activity.currentTool}${activity.currentToolArgs ? `: ${activity.currentToolArgs}` : ""}`);
    }
    for (const preview of activity?.recent ?? []) lines.push(`  ${preview}`);
    if (!activity && child.transcriptPath) lines.push("  live transcript has no new activity yet");
    if (!child.transcriptPath) lines.push("  live transcript unavailable; waiting for completion event");
  }
  return result(lines.join("\n"));
}
async function waitForDetachedForegroundRun(run, signal, deps, startedAt, now, pollIntervalMs, timeoutMs, yieldWait) {
  const wake = wakeSignal(signal, deps);
  const initialDetachedIndices = new Set(run.children.filter((child) => child.status === "detached").map((child) => child.index));
  while (true) {
    if (deps.state.currentSessionId !== run.sessionId) {
      return result(`Wait stopped because the active session changed while remembered foreground run "${run.runId}" was still detached. Return to the originating session to inspect or wait for it. Reply to any pending supervisor request before resuming or launching a replacement.`, true);
    }
    const current = deps.state.foregroundRuns?.get(run.runId);
    if (!current || current.sessionId !== run.sessionId) {
      return result(`Remembered foreground run "${run.runId}" disappeared before a terminal child result was recorded. Completion cannot be confirmed; do not launch a replacement without checking the originating child session.`, true);
    }
    if (deps.hasPendingSupervisorRequest?.()) return yieldWait("supervisor_request");
    if (deps.userInputSignal?.aborted) return yieldWait("user_input");
    const pending = current.children.filter((child) => initialDetachedIndices.has(child.index) && child.status === "detached");
    const attention = foregroundChildrenNeedingAttention(current, initialDetachedIndices);
    if (attention.length > 0) return formatForegroundAttention(current, attention, now() - startedAt);
    if (pending.length === 0) {
      const outcome = summarizeForegroundChildren(current, initialDetachedIndices);
      return result(
        `Waited ${formatDuration(now() - startedAt)} for remembered detached foreground run "${run.runId}"; done. Outcome: ${outcome || "no recovered child status"}. Completion event observed; inspect with subagent({ action: "status", id: "${run.runId}" }) for recovered output.`
      );
    }
    const updateNow = now();
    deps.onUpdate?.(detachedForegroundWaitUpdate(current, initialDetachedIndices, updateNow, updateNow - startedAt));
    if (signal?.aborted) {
      return result(`Wait aborted after ${formatDuration(now() - startedAt)}. Remembered foreground run "${run.runId}" remains detached. Reply to any pending supervisor request before resuming or launching a replacement.`, true);
    }
    if (now() - startedAt >= timeoutMs) {
      return windowElapsedResult(
        `Wait window elapsed after ${formatDuration(timeoutMs)} with remembered foreground run "${run.runId}" still detached. Reply to any pending supervisor request, then call bg_wait({ id: "${run.runId}" }) again or inspect status; do not resume or launch a replacement while it remains detached.`,
        [run.runId]
      );
    }
    await waitForWake(pollIntervalMs, wake, deps);
  }
}
async function waitForSessionDetachedForegroundRuns(runs, signal, deps, startedAt, now, pollIntervalMs, timeoutMs, yieldWait) {
  const texts = [];
  for (const run of runs) {
    const one = await waitForDetachedForegroundRun(run, signal, deps, startedAt, now, pollIntervalMs, timeoutMs, yieldWait);
    if (one.isError) return one;
    if (one.details.wait && one.details.wait.reason !== "window_elapsed") return one;
    if (one.details.wait?.reason === "window_elapsed") {
      const activeRunIds = runs.filter((initial) => {
        const current = deps.state.foregroundRuns?.get(initial.runId);
        if (!current || current.sessionId !== initial.sessionId) return false;
        return initial.children.some((child) => child.status === "detached" && current.children.some((candidate) => candidate.index === child.index && candidate.status === "detached"));
      }).map((activeRun) => activeRun.runId);
      return windowElapsedResult(
        one.content.map((part) => part.type === "text" ? part.text : "").join("\n"),
        activeRunIds
      );
    }
    texts.push(one.content.map((part) => part.type === "text" ? part.text : "").join("\n").trim());
  }
  return result(texts.filter(Boolean).join("\n") || `Waited ${formatDuration(now() - startedAt)} for remembered detached foreground run(s); done.`);
}
async function waitForSubagents(params, signal, deps) {
  if (deps.enabled === false) {
    return result('bg_wait is disabled by config.waitTool or PI_SUBAGENT_WAIT_TOOL_ENABLED; returning immediately without blocking background work. Active work keeps going, and you can inspect subagents with subagent({ action: "status" }) or rely on completion notifications.');
  }
  if (!deps.state.currentSessionId) {
    return result("bg_wait requires an active session identity to scope background work safely.", true);
  }
  const now = deps.now ?? Date.now;
  const pollIntervalMs = Math.max(MIN_POLL_INTERVAL_MS, deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  const timeoutMs = params.timeoutMs !== void 0 && params.timeoutMs > 0 ? params.timeoutMs : deps.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = now();
  const sessionId = deps.state.currentSessionId;
  const waitForAll = params.id ? true : params.all === true;
  if (params.nonBlocking && !params.id) {
    return result("Non-blocking wait subscriptions require id so the registration can bind one exact run identity.", true);
  }
  if (params.nonBlocking && params.all) {
    return result("nonBlocking cannot be combined with all; subscribe to one exact run id.", true);
  }
  let active;
  let foreground;
  let providerSnapshot;
  try {
    active = runsForSession(params, deps, !params.id);
    foreground = activeDetachedForegroundRuns(params, deps).map((run) => ({
      ...run,
      children: run.children.map((child) => ({ ...child }))
    }));
    providerSnapshot = params.id ? { providers: [], items: [] } : backgroundWorkForSession(deps, startedAt);
  } catch (error) {
    return result(error instanceof Error ? error.message : String(error), true);
  }
  let selectedForeground;
  if (params.id) {
    const candidates = [
      ...active.map((run) => ({ kind: "async", id: run.id, run })),
      ...foreground.map((run) => ({ kind: "foreground", id: run.runId, run }))
    ];
    const exact = candidates.filter((candidate) => candidate.id === params.id);
    const matches = exact.length > 0 ? exact : candidates;
    if (matches.length > 1) {
      return result(`Ambiguous subagent run id prefix "${params.id}" matched ${matches.length} runs: ${matches.map((candidate) => candidate.id).join(", ")}. Pass a longer id.`, true);
    }
    const selected = matches[0];
    if (selected?.kind === "async" && !ACTIVE_STATES.includes(selected.run.state)) {
      try {
        const references2 = [];
        const completions2 = collectScopedCompletions([selected.run], deps, references2);
        return result(
          `Run "${selected.id}" is terminal. Outcome: ${summarizeTerminalRuns([selected.run])}.${formatCompletionRecovery(completions2)}${references2.length ? `
${references2.join("\n")}` : ""}`,
          deps.failOnFailedRuns === true && (selected.run.state === "failed" || selected.run.state === "partial"),
          completions2
        );
      } catch (error) {
        return result(error instanceof Error ? error.message : String(error), true);
      }
    }
    if (selected && params.nonBlocking) {
      if (!deps.subscribe) {
        return result("Non-blocking wait subscriptions require a long-lived interactive subagent runtime; this runtime can only use blocking bg_wait calls.", true);
      }
      try {
        const registration = deps.subscribe({ targetKind: selected.kind, runId: selected.id, requestedId: params.id, timeoutMs });
        return result(`Armed wait subscription ${registration.token} for exact ${selected.kind} run ${selected.id}. Returning immediately; this session will be woken on completion, failure, attention, reconciliation failure, or timeout. Inspect armed subscriptions with subagent({ action: "status" }).`);
      } catch (error) {
        return result(error instanceof Error ? error.message : String(error), true);
      }
    }
    selectedForeground = selected?.kind === "foreground" ? selected.run : void 0;
    active = selected?.kind === "async" ? [selected.run] : [];
  }
  let providerActive = providerSnapshot.items;
  const scopedForeground = selectedForeground ? [selectedForeground] : params.id ? [] : foreground;
  const initialAsyncIds = new Set(active.map((run) => run.id));
  const initialProviderIds = new Set(providerActive.map(backgroundWorkIdentity));
  const initialScope = {
    asyncRunIds: initialAsyncIds,
    foregroundRuns: scopedForeground.map((run) => ({
      runId: run.runId,
      sessionId: run.sessionId,
      detachedIndices: new Set(run.children.filter((child) => child.status === "detached").map((child) => child.index))
    })),
    providerIds: initialProviderIds
  };
  const yieldWait = (reason) => yieldForScope(reason, initialScope, params, deps, now());
  const wake = wakeSignal(signal, deps);
  if (selectedForeground) {
    return waitForDetachedForegroundRun(selectedForeground, signal, deps, startedAt, now, pollIntervalMs, timeoutMs, yieldWait);
  }
  if (active.length === 0 && providerActive.length === 0) {
    if (waitForAll && !params.id && foreground.length > 0) {
      return waitForSessionDetachedForegroundRuns(foreground, signal, deps, startedAt, now, pollIntervalMs, timeoutMs, yieldWait);
    }
    return result(params.id ? `No active run matched "${params.id}". Nothing to wait for.` : "No active async runs or registered provider work in this session. Nothing to wait for.");
  }
  const waitParams = params.id ? { ...params, id: active[0].id } : params;
  const initialProviderNames = new Set(providerActive.map((item) => item.provider));
  const initialCount = initialAsyncIds.size + initialProviderIds.size;
  const stopOnAttention = params.stopOnAttention ?? deps.stopOnAttention !== false;
  let attention = active.filter((run) => needsAttention(run));
  let supervisorBarrier = false;
  const isDone = () => {
    if (deps.hasPendingSupervisorRequest?.()) {
      supervisorBarrier = true;
      return true;
    }
    if (attention.some((run) => initialAsyncIds.has(run.id) && (stopOnAttention || hasSupervisorTool(run)))) return true;
    const activeAsyncIds = new Set(active.map((run) => run.id));
    const activeProviderIds2 = new Set(providerActive.map(backgroundWorkIdentity));
    if (waitForAll) {
      return [...initialAsyncIds].every((id2) => !activeAsyncIds.has(id2)) && [...initialProviderIds].every((id2) => !activeProviderIds2.has(id2));
    }
    return [...initialAsyncIds].some((id2) => !activeAsyncIds.has(id2)) || [...initialProviderIds].some((id2) => !activeProviderIds2.has(id2));
  };
  while (!isDone()) {
    const activeInitialRuns = active.filter((run) => initialAsyncIds.has(run.id));
    const activeInitialProviderItems = providerActive.filter((item) => initialProviderIds.has(backgroundWorkIdentity(item)));
    const stillActive = [
      ...activeInitialRuns.map((run) => `${run.id} (${run.state})`),
      ...activeInitialProviderItems.map((item) => `${item.provider}/${item.id}`)
    ].join(", ");
    deps.onUpdate?.(asyncWaitUpdate(activeInitialRuns, activeInitialProviderItems.length, now() - startedAt));
    if (deps.userInputSignal?.aborted) return yieldWait("user_input");
    if (signal?.aborted) {
      return result(`Wait aborted after ${formatDuration(now() - startedAt)}. Still active: ${stillActive}.`, true);
    }
    if (now() - startedAt >= timeoutMs) {
      return windowElapsedResult(
        `Wait window elapsed after ${formatDuration(timeoutMs)} with ${activeInitialRuns.length} async run(s) and ${activeInitialProviderItems.length} provider item(s) still active: ${stillActive}. The work keeps going; call bg_wait again or inspect subagent status.`,
        activeInitialRuns.map((run) => run.id),
        activeInitialProviderItems
      );
    }
    try {
      await waitForWake(pollIntervalMs, wake, deps);
      if (deps.state.currentSessionId !== sessionId) return result("Wait stopped because the active session changed.", true);
      active = activeRunsForSession(waitParams, deps);
      attention = attentionRunsForSession(waitParams, deps, initialAsyncIds);
      providerSnapshot = params.id ? providerSnapshot : backgroundWorkForSession(deps, now());
      for (const provider of initialProviderNames) {
        if (!providerSnapshot.providers.includes(provider)) {
          return result(`Background-work provider '${provider}' disappeared while bg_wait was tracking its active work; completion cannot be confirmed.`, true);
        }
      }
      providerActive = providerSnapshot.items;
    } catch (error) {
      return result(error instanceof Error ? error.message : String(error), true);
    }
  }
  if (supervisorBarrier) {
    return yieldWait("supervisor_request");
  }
  let terminalSummary;
  let finishedAsyncCount;
  let failedAsyncCount;
  let completions;
  let resumeGuidance = "";
  const references = [];
  const activeProviderIds = new Set(providerActive.map(backgroundWorkIdentity));
  const providerFinishedCount = [...initialProviderIds].filter((id2) => !activeProviderIds.has(id2)).length;
  try {
    const allNow = runsForIds(initialAsyncIds, deps);
    const terminal = allNow.filter((run) => !ACTIVE_STATES.includes(run.state) && initialAsyncIds.has(run.id));
    finishedAsyncCount = terminal.length;
    failedAsyncCount = terminal.filter((run) => run.state === "failed" || run.state === "partial").length;
    terminalSummary = summarizeTerminalRuns(terminal, providerFinishedCount);
    resumeGuidance = formatResumeFirstFailedRunsNote(terminal);
    completions = collectScopedCompletions(terminal, deps, references);
  } catch (error) {
    return result(error instanceof Error ? error.message : String(error), true);
  }
  const relevantAttention = attention.filter((run) => initialAsyncIds.has(run.id));
  const supervisorAttentionHint = relevantAttention.some(hasSupervisorTool) ? ' Reply to any pending supervisor request. If subagent_supervisor({ action: "pending" }) is empty, check intercom({ action: "pending" }) because an external intercom tool may own the request.' : "";
  const keepWaitingHint = stopOnAttention && supervisorAttentionHint === "" && (waitForAll || finishedAsyncCount + providerFinishedCount === 0) ? " These runs are still running and none is waiting on a supervisor reply. To keep waiting through this kind of attention, call bg_wait again with stopOnAttention: false; supervisor requests still end that wait." : "";
  const attentionNote = relevantAttention.length > 0 ? ` ${relevantAttention.length} run(s) need attention: ${relevantAttention.map((run) => run.id).join(", ")} \u2014${supervisorAttentionHint} inspect with subagent({ action: "status" }) then steer a top-level live async child, resume a paused/completed/failed child, or interrupt explicitly.${keepWaitingHint}` : "";
  const stillRunning = active.filter((run) => initialAsyncIds.has(run.id)).length + providerActive.filter((item) => initialProviderIds.has(backgroundWorkIdentity(item))).length;
  const elapsed = formatDuration(now() - startedAt);
  const outcome = terminalSummary ? ` Outcome: ${terminalSummary}.` : "";
  const recoveryNote = formatCompletionRecovery(completions) + (references.length ? `
${references.join("\n")}
` : "");
  if (waitForAll) {
    const foregroundResult = !params.id && foreground.length > 0 && relevantAttention.length === 0 ? await waitForSessionDetachedForegroundRuns(foreground, signal, deps, startedAt, now, pollIntervalMs, timeoutMs, yieldWait) : void 0;
    if (foregroundResult?.isError) return foregroundResult;
    if (foregroundResult?.details.wait) return foregroundResult;
    const foregroundNote = foregroundResult ? `
${foregroundResult.content.map((part) => part.type === "text" ? part.text : "").join("\n")}` : "";
    const scope = params.id ? `run "${params.id}"` : initialProviderIds.size === 0 ? `${initialAsyncIds.size} async run(s)` : `${initialAsyncIds.size} async run(s) and ${initialProviderIds.size} provider item(s)`;
    const status = relevantAttention.length > 0 ? "attention required" : "done";
    return result(
      `Waited ${elapsed} for ${scope}; ${status}.${outcome}${recoveryNote}${resumeGuidance}${attentionNote}${foregroundNote} Completion/control events have been observed; inspect status if a notification is not visible yet.`,
      deps.failOnFailedRuns === true && failedAsyncCount > 0 || deps.failOnAttention === true && relevantAttention.length > 0,
      completions
    );
  }
  const finishedCount = finishedAsyncCount + providerFinishedCount;
  const subject = initialProviderIds.size === 0 ? "run(s)" : "item(s)";
  const remainder = stillRunning > 0 ? ` ${stillRunning} ${subject} still in flight \u2014 call bg_wait again to catch the next one.` : relevantAttention.length > 0 ? " No other work is waitable until attention is handled." : initialProviderIds.size === 0 ? " No runs remain in flight." : " No work remains in flight.";
  const progress = relevantAttention.length > 0 && finishedCount === 0 ? `${relevantAttention.length} of ${initialCount} ${subject} need attention` : `${finishedCount} of ${initialCount} ${subject} finished`;
  return result(
    `Waited ${elapsed}; ${progress}.${outcome}${recoveryNote}${resumeGuidance}${attentionNote}${remainder} Relevant completion/control events have been observed; inspect status if a notification is not visible yet.`,
    deps.failOnFailedRuns === true && failedAsyncCount > 0 || deps.failOnAttention === true && relevantAttention.length > 0,
    completions
  );
}

// src/extension/tool-result.ts
function finalizeToolResult(result2) {
  if (result2.isError !== true) return result2;
  const message2 = result2.content.flatMap((item) => item.type === "text" && typeof item.text === "string" ? [item.text] : []).join("\n").trim();
  throw new Error(message2 || "pi-subagents reported a logical tool failure.");
}

// src/extension/declaration-pinning.ts
import { declarationsEqual, getCurrentSystemMessage, toToolDeclaration } from "@earendil-works/pi-ai";
var pinsByApi = /* @__PURE__ */ new WeakMap();
var GUIDELINES_PLACEHOLDER = "\0pi-subagents guidelines";
function undecorated(recorded, current) {
  const paragraphs = recorded.split("\n\n");
  while (paragraphs.length > 1 && paragraphs.at(-1) === paragraphs.at(-2)) paragraphs.pop();
  const stripped = paragraphs.join("\n\n");
  return stripped.startsWith(`${current}

`) ? current : stripped;
}
function pinnedDefinition(tool, pin) {
  const { constrainedSampling, promptSnippet, promptGuidelines, ...rest } = tool;
  const recorded = pin ? { ...pin.declaration, description: undecorated(pin.declaration.description, rest.description) } : void 0;
  const declaration = recorded && !declarationsEqual(recorded, tool) ? recorded : void 0;
  const definition = { ...rest, description: declaration?.description ?? rest.description, parameters: declaration?.parameters ?? rest.parameters };
  const sampling = declaration ? declaration.constrainedSampling : constrainedSampling;
  if (sampling !== void 0) definition.constrainedSampling = sampling;
  const snippet = pin?.snippet ? pin.snippet.text : promptSnippet;
  if (snippet !== void 0) definition.promptSnippet = snippet;
  const guidelines = pin?.guidelines ?? promptGuidelines;
  if (guidelines !== void 0) definition.promptGuidelines = guidelines;
  return definition;
}
function register(pi, pins, name) {
  const definition = pinnedDefinition(pins.current.get(name), pins.declared.get(name));
  const key = JSON.stringify([toToolDeclaration(definition), definition.promptSnippet, definition.promptGuidelines]);
  if (pins.registered.get(name) === key) return;
  pins.registered.set(name, key);
  pi.registerTool(definition);
}
function sectionLines(text, name) {
  const lines = text?.split("\n") ?? [];
  const start = lines.indexOf(`<${name}>`);
  const end = lines.indexOf(`</${name}>`, start + 1);
  return start >= 0 && end > start ? lines.slice(start + 1, end) : void 0;
}
function ruleLines(activeTools, guidelines) {
  const lines = [];
  const add = (rule) => {
    const line = `- ${rule.trim()}`;
    if (line !== "- " && !lines.includes(line)) lines.push(line);
  };
  const active = (name) => activeTools.includes(name);
  if ((active("bash") || active("powershell")) && !active("grep") && !active("find") && !active("ls")) {
    if (active("bash") && active("powershell")) add("Use bash or PowerShell for file operations like listing, searching, and finding files");
    else if (active("powershell")) add("Use PowerShell for file operations like listing, searching, and finding files");
    else add("Use bash for file operations like ls, rg, find");
  }
  for (const name of activeTools) for (const rule of guidelines.get(name) ?? []) add(rule);
  add("Be concise in your responses");
  add("Show file paths clearly when working with files");
  return lines;
}
var sameLines = (left, right) => left.length === right.length && left.every((line, index) => line === right[index]);
function recordedGuidelines(pi, ctx, recorded, names) {
  const recovered = /* @__PURE__ */ new Map();
  const activeTools = pi.getActiveTools();
  const guidelines = new Map(pi.getAllTools().map((tool) => [tool.name, tool.promptGuidelines ?? []]));
  const current = sectionLines(ctx.getSystemPrompt(), "rules");
  if (!current || !sameLines(ruleLines(activeTools, guidelines), current)) return recovered;
  const rebuild = (name, candidate) => ruleLines(activeTools, new Map(guidelines).set(name, candidate));
  for (const name of names) {
    const start = rebuild(name, [GUIDELINES_PLACEHOLDER]).indexOf(`- ${GUIDELINES_PLACEHOLDER}`);
    if (start < 0) continue;
    const candidate = recorded.slice(start, start + recorded.length - rebuild(name, []).length).map((line) => line.slice(2));
    if (!sameLines(rebuild(name, candidate), recorded)) continue;
    guidelines.set(name, candidate);
    recovered.set(name, candidate);
  }
  return recovered;
}
function recordedSystemMessage(ctx) {
  const sessionManager = ctx?.sessionManager;
  if (typeof sessionManager?.buildSessionContext !== "function") return void 0;
  return getCurrentSystemMessage(sessionManager.buildSessionContext().messages);
}
function declaredPins(pi, pins, ctx, system) {
  if (!ctx || !system) return /* @__PURE__ */ new Map();
  const declarations = system.toolsAdded ?? [];
  const snippets = sectionLines(system.sections?.tools ?? void 0, "tools");
  const rules = sectionLines(system.sections?.rules ?? void 0, "rules");
  const guidelines = rules ? recordedGuidelines(pi, ctx, rules, declarations.map((tool) => tool.name).filter((name) => pins.current.has(name))) : /* @__PURE__ */ new Map();
  return new Map(declarations.map((declaration) => {
    const pin = { declaration };
    if (snippets) pin.snippet = { text: snippets.find((line) => line.startsWith(`- ${declaration.name}: `))?.slice(declaration.name.length + 4) };
    const recovered = guidelines.get(declaration.name);
    if (recovered) pin.guidelines = recovered;
    return [declaration.name, pin];
  }));
}
function pinsFor(pi) {
  const existing = pinsByApi.get(pi);
  if (existing) return existing;
  const pins = { current: /* @__PURE__ */ new Map(), declared: /* @__PURE__ */ new Map(), registered: /* @__PURE__ */ new Map(), sections: {}, pinned: true };
  pinsByApi.set(pi, pins);
  const refresh = (ctx) => {
    const system = pins.pinned ? recordedSystemMessage(ctx) : void 0;
    pins.sections = system?.sections ?? {};
    pins.declared = declaredPins(pi, pins, ctx, system);
    for (const name of pins.current.keys()) register(pi, pins, name);
  };
  pi.on("session_start", (_event, ctx) => refresh(ctx));
  pi.on("session_tree", (_event, ctx) => refresh(ctx));
  return pins;
}
function recordedPromptSection(pi, name) {
  return sectionLines(pinsFor(pi).sections[name] ?? void 0, name)?.join("\n");
}
function registerPinnedTool(pi, tool) {
  const pins = pinsFor(pi);
  pins.current.set(tool.name, tool);
  pins.registered.delete(tool.name);
  register(pi, pins, tool.name);
}
function setDeclarationPinning(pi, pinned) {
  pinsFor(pi).pinned = pinned;
}

// src/runs/background/wait-tool.ts
function registerWaitTool(pi, state, enabled = resolveWaitToolConfig().enabled, subscriptions, defaultTimeoutMs, child, hasPendingSupervisorRequest) {
  const description = `Wait for background work, then return. ${child ? "This child runtime has no native completion notifier: use blocking bg_wait to collect your owned descendants this turn and read their result references; agent_end draining does not synthesize results." : "Ordinary async subagent runs already wake this session natively; use bg_wait only for provider, detached, or other background work without native notification, when a same-turn result is needed."}
{} \u2014 first active run or provider item to finish or need attention.
{all:true} \u2014 all work active at call time.
{id} \u2014 one run; a finished async run returns its result references.
{id,nonBlocking:true} \u2014 subscribe to that run's wake and return now.
Timeout or a user message ends the wait without error; work keeps running.${enabled ? "" : "\nDisabled by config.waitTool or PI_SUBAGENT_WAIT_TOOL_ENABLED: returns immediately."}`;
  const userInputWaits = /* @__PURE__ */ new Set();
  pi.on("input", (event) => {
    if (event.source === "extension" || !event.streamingBehavior) return;
    for (const controller of userInputWaits) controller.abort();
  });
  const execute = async (_id, params, signal, onUpdate, ctx) => {
    const userInput = new AbortController();
    userInputWaits.add(userInput);
    try {
      return finalizeToolResult(await waitForSubagents(params, signal, {
        state,
        nestedRootRunId: child?.nestedRootRunId,
        events: pi.events,
        enabled,
        hasPendingSupervisorRequest,
        userInputSignal: userInput.signal,
        ...defaultTimeoutMs !== void 0 ? { defaultTimeoutMs } : {},
        onUpdate,
        ...subscriptions && ctx?.hasUI ? { subscribe: (input) => subscriptions.arm(input) } : {}
      }));
    } finally {
      userInputWaits.delete(userInput);
    }
  };
  const primaryTool = {
    name: "bg_wait",
    label: "Background Wait",
    description,
    parameters: SubagentWaitParams,
    execute
  };
  registerPinnedTool(pi, primaryTool);
}

// src/runs/background/auto-drain.ts
var DEFAULT_AUTO_DRAIN_TIMEOUT_MS = 30 * 60 * 1e3;
function resultText(value) {
  return value.content.map((part) => part.type === "text" ? part.text : "").join(" ").trim();
}
function hasOutstandingWork(deps, sessionId, nowMs, observation) {
  const asyncRuns = waitRunScopes(deps).flatMap(({ asyncDirRoot, resultsDir }) => listAsyncRuns(asyncDirRoot, {
    states: ["queued", "running"],
    sessionId,
    resultsDir,
    now: () => nowMs,
    includeNested: false
  }, observation?.status));
  const detachedForeground = [...deps.state.foregroundRuns?.values() ?? []].some(
    (run) => run.sessionId === sessionId && run.children.some((child) => child.status === "detached")
  );
  return asyncRuns.length > 0 || snapshotBackgroundWork(sessionId, nowMs).items.length > 0 || detachedForeground;
}
async function drainOutstandingWork(deps, observation) {
  const sessionId = deps.state.currentSessionId;
  observation?.begin(sessionId, !deps.hasWork && !deps.wait && !deps.now && !deps.hasPendingSupervisorRequest);
  try {
    if (!sessionId) throw new Error("Cannot auto-drain background work without an active session identity.");
    const now = deps.now ?? Date.now;
    const timeoutMs = deps.timeoutMs ?? DEFAULT_AUTO_DRAIN_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Auto-drain timeoutMs must be a positive finite number.");
    const deadlineAt = now() + timeoutMs;
    const hasWork = deps.hasWork ?? ((id2, time) => hasOutstandingWork(deps, id2, time, observation));
    const wait = deps.wait ?? waitForSubagents;
    while (true) {
      if (deps.state.currentSessionId !== sessionId) throw new Error("Auto-drain stopped because the active session changed.");
      if (deps.hasPendingSupervisorRequest?.()) break;
      const work = hasWork(sessionId, now());
      observation?.predicate(work);
      if (!work) break;
      const remainingMs = deadlineAt - now();
      if (remainingMs <= 0) {
        throw new Error(`Auto-drain timed out after ${timeoutMs}ms with background work still active in session '${sessionId}'.`);
      }
      const waitResult = await wait(
        { all: true, timeoutMs: remainingMs },
        void 0,
        {
          state: deps.state,
          asyncDirRoot: deps.asyncDirRoot,
          resultsDir: deps.resultsDir,
          nestedRootRunId: deps.nestedRootRunId,
          events: deps.events,
          now,
          stopOnAttention: false,
          failOnFailedRuns: true,
          failOnAttention: true,
          hasPendingSupervisorRequest: deps.hasPendingSupervisorRequest
        }
      );
      if (waitResult.isError) {
        throw new Error(`Auto-drain failed for session '${sessionId}': ${resultText(waitResult) || "bg_wait returned an error without details"}.`);
      }
      if (waitResult.details.wait?.reason === "supervisor_request") break;
      if (deps.hasPendingSupervisorRequest?.()) break;
    }
    observation?.complete();
  } catch (error) {
    observation?.deny();
    throw error;
  }
}

// src/runs/shared/child-runtime-config.ts
var SUBAGENT_CHILD_ENV = "PI_SUBAGENT_CHILD";
var SUBAGENT_PARENT_SESSION_ENV = "PI_SUBAGENT_PARENT_SESSION";
function childSupervisorMetadata(config) {
  if (!config.supervisorChannelDir || !config.runId || !config.agent || !config.orchestratorSessionId || config.childIndex === void 0) return void 0;
  return {
    channelDir: config.supervisorChannelDir,
    runId: config.runId,
    agent: config.agent,
    childIndex: config.childIndex,
    ...config.orchestratorTarget ? { orchestratorTarget: config.orchestratorTarget } : {},
    orchestratorSessionId: config.orchestratorSessionId,
    ...config.intercomSessionName ? { childTarget: config.intercomSessionName } : {}
  };
}
function evaluateChildToolDiagnostic(config, availableTools) {
  if (!config.requiredTools) return void 0;
  const available = new Set(availableTools);
  const missing = config.requiredTools.filter((name) => !available.has(name));
  if (missing.length === 0) return void 0;
  const missingMcpDirectTools = config.mcpDirectTools?.length ? missing.filter((name) => config.mcpDirectTools.includes(name)) : [];
  return {
    ...config.agent ? { agent: config.agent } : {},
    required: config.requiredTools,
    available: availableTools,
    missing,
    ...missingMcpDirectTools.length > 0 ? { missingMcpDirectTools } : {}
  };
}

// src/watchdog/diff-tool.ts
import { execFile, spawnSync } from "node:child_process";
import * as path5 from "node:path";
import { Type as Type3 } from "typebox";
var WATCHDOG_DIFF_TOOL_NAME = "watchdog_diff";
var WATCHDOG_DIFF_MAX_CHARS = 24e3;
var WATCHDOG_DIFF_UNAVAILABLE_BASELINE = "watchdog_diff unavailable: this cwd has no valid Git HEAD baseline. No diff can be shown; inspect files with independent read-only tools instead.";
var MAX_UNTRACKED_FILES = 50;
var WatchdogDiffParams = Type3.Object({
  path: Type3.Optional(Type3.String({ description: "Restrict the diff to one file or directory, relative to the repo root." })),
  stat: Type3.Optional(Type3.Boolean({ description: "Return per-file change counts instead of the full diff." }))
}, { additionalProperties: false });
function runGit(root, args2) {
  const result2 = spawnSync("git", ["-C", root, ...args2], { encoding: "utf-8", maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  return { ok: result2.status === 0, stdout: result2.stdout ?? "", stderr: (result2.stderr ?? "").trim() };
}
var BASELINE_ARGS = ["rev-parse", "--show-toplevel", "HEAD"];
function parseBaseline(stdout) {
  const lines = stdout.trim().split(/\r?\n/);
  const ref = lines.pop();
  const root = lines.join("\n");
  return root && ref ? { root, ref } : void 0;
}
function captureWatchdogDiffBaseline(cwd2) {
  const result2 = runGit(cwd2, BASELINE_ARGS);
  return result2.ok ? parseBaseline(result2.stdout) : void 0;
}
function startWatchdogDiffBaselineCapture(cwd2) {
  return new Promise((resolve5) => {
    try {
      execFile("git", ["-C", cwd2, ...BASELINE_ARGS], { encoding: "utf-8", windowsHide: true }, (error, stdout) => {
        resolve5(error ? void 0 : parseBaseline(stdout));
      });
    } catch {
      resolve5(void 0);
    }
  });
}
function validatePath(value) {
  const trimmed = value?.trim();
  if (!trimmed) return void 0;
  if (trimmed.startsWith("-")) throw new Error("watchdog_diff path must not start with '-'.");
  if (path5.isAbsolute(trimmed)) throw new Error("watchdog_diff path must be relative to the repo root.");
  if (trimmed.split(/[\\/]/).includes("..")) throw new Error("watchdog_diff path must not contain '..'.");
  return trimmed;
}
function bound(text) {
  if (text.length <= WATCHDOG_DIFF_MAX_CHARS) return text;
  const marker = `

[... ${text.length - WATCHDOG_DIFF_MAX_CHARS} characters omitted; call again with a narrower path ...]`;
  return `${text.slice(0, WATCHDOG_DIFF_MAX_CHARS - marker.length)}${marker}`;
}
function createWatchdogDiffTool(baseline, options = {}) {
  const workingTreeAtLaunch = options.workingTreeAtLaunch === true;
  return {
    name: WATCHDOG_DIFF_TOOL_NAME,
    label: "Watchdog diff",
    description: !baseline ? "Report that a Git HEAD diff baseline is unavailable in this cwd. No diff is generated." : workingTreeAtLaunch ? "Show the current staged and unstaged working-tree delta against reviewer-launch HEAD, plus untracked file paths, including edits by other sessions in this checkout. Committed ranges are not included. Optional path narrows it; stat:true returns per-file counts only." : "Show the repository diff since the review baseline, plus untracked file paths, including edits by other sessions in this checkout. Optional path narrows it; stat:true returns per-file counts only.",
    parameters: WatchdogDiffParams,
    executionMode: "sequential",
    async execute(_toolCallId, params) {
      if (!baseline) {
        return { content: [{ type: "text", text: WATCHDOG_DIFF_UNAVAILABLE_BASELINE }], details: { chars: WATCHDOG_DIFF_UNAVAILABLE_BASELINE.length } };
      }
      const pathFilter = validatePath(params.path);
      const diff = runGit(baseline.root, ["diff", "--no-color", "--no-ext-diff", ...params.stat === true ? ["--stat"] : [], baseline.ref, "--", ...pathFilter ? [pathFilter] : []]);
      if (!diff.ok) throw new Error(`git diff failed: ${diff.stderr || "unknown error"}`);
      const untrackedResult = runGit(baseline.root, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...pathFilter ? [pathFilter] : []]);
      if (workingTreeAtLaunch) {
        const currentHead = runGit(baseline.root, ["rev-parse", "HEAD"]);
        if (!currentHead.ok || currentHead.stdout.trim() !== baseline.ref) {
          const text2 = "Reviewer-launch HEAD changed or is unavailable. Committed changes are unsupported; relaunch the reviewer or supply a diff artifact.";
          return { content: [{ type: "text", text: text2 }], details: { chars: text2.length } };
        }
      }
      const untracked = untrackedResult.ok ? untrackedResult.stdout.split("\0").filter(Boolean) : [];
      const sections = [diff.stdout.trimEnd()];
      if (untracked.length) {
        const shown = untracked.slice(0, MAX_UNTRACKED_FILES);
        sections.push(["Untracked files (use read to inspect):", ...shown.map((file) => ` ${file}`)].join("\n"));
        if (untracked.length > shown.length) sections.push(`... ${untracked.length - shown.length} more untracked files`);
      }
      const text = bound(sections.filter(Boolean).join("\n\n")) || (workingTreeAtLaunch ? `No working-tree changes against reviewer-launch HEAD ${baseline.ref.slice(0, 12)}. Committed changes are not included.` : `No changes since baseline ${baseline.ref.slice(0, 12)}.`);
      return { content: [{ type: "text", text }], details: { chars: text.length } };
    }
  };
}

// src/watchdog/runtime.ts
import { createHash as createHash3 } from "node:crypto";

// src/watchdog/change-signature.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs8 from "node:fs";
import * as os from "node:os";
import * as path6 from "node:path";
var IGNORED_CHANGE_PREFIXES = [`${PROJECT_SUBAGENTS_RELATIVE_DIR}/`, "tmp/", "node_modules/"];
var IGNORED_CHANGE_PATHS = /* @__PURE__ */ new Set([PROJECT_SUBAGENTS_RELATIVE_DIR, "tmp", "node_modules"]);
var IGNORED_CHANGE_SEGMENTS = /* @__PURE__ */ new Set([".git", "node_modules"]);
var DEFAULT_MAX_HASH_FILE_BYTES = 64 * 1024 * 1024;
var DEFAULT_MAX_HASH_TOTAL_BYTES = 64 * 1024 * 1024;
var DEFAULT_MAX_HASH_ENTRIES = 2e3;
var TRACKED_ENTRY_PROBE_MAX_BYTES = 1024;
function positiveEnvNumber(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function maxHashFileBytes() {
  return positiveEnvNumber("PI_SUBAGENTS_MAX_HASH_FILE_BYTES", DEFAULT_MAX_HASH_FILE_BYTES);
}
function maxHashTotalBytes() {
  return positiveEnvNumber("PI_SUBAGENTS_MAX_HASH_TOTAL_BYTES", DEFAULT_MAX_HASH_TOTAL_BYTES);
}
function maxHashEntries() {
  return positiveEnvNumber("PI_SUBAGENTS_MAX_HASH_ENTRIES", DEFAULT_MAX_HASH_ENTRIES);
}
function git(cwd2, args2) {
  const result2 = spawnSync2("git", ["-C", cwd2, ...args2], { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024, windowsHide: true });
  if (result2.status !== 0) return void 0;
  return result2.stdout;
}
function comparablePath(value) {
  let resolved = path6.resolve(value);
  try {
    resolved = fs8.realpathSync.native(resolved);
  } catch {
  }
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
function isHomeRepoRoot(root) {
  return comparablePath(root) === comparablePath(os.homedir());
}
function hasTrackedEntries(root) {
  const result2 = spawnSync2("git", ["-C", root, "ls-files", "--cached", "--error-unmatch", "--", "."], {
    encoding: "utf-8",
    maxBuffer: TRACKED_ENTRY_PROBE_MAX_BYTES,
    windowsHide: true
  });
  const errorCode2 = result2.error?.code;
  if (result2.status === 0 || errorCode2 === "ENOBUFS") return true;
  if (result2.status === 1) return false;
  return void 0;
}
function normalizeRelPath(value) {
  return value.replaceAll(path6.sep, "/").replace(/^\.\//, "");
}
function ignoredRelPath(relPath) {
  const normalized = normalizeRelPath(relPath);
  return IGNORED_CHANGE_PATHS.has(normalized) || IGNORED_CHANGE_PREFIXES.some((prefix) => normalized.startsWith(prefix)) || normalized.split("/").some((segment) => IGNORED_CHANGE_SEGMENTS.has(segment));
}
function useHashEntryBudget(budget) {
  if (budget.entries >= budget.maxEntries) return false;
  budget.entries++;
  return true;
}
function hashFile(filePath) {
  return createHash("sha256").update(fs8.readFileSync(filePath)).digest("hex");
}
function largeFileHash(stat) {
  return "large:" + stat.size + ":" + Math.floor(stat.mtimeMs);
}
function hashFileEntry(normalized, fullPath, stat, budget) {
  let hash;
  if (stat.size > maxHashFileBytes() || budget.bytes + stat.size > budget.maxBytes) {
    hash = largeFileHash(stat);
  } else {
    try {
      hash = hashFile(fullPath);
      budget.bytes += stat.size;
    } catch (error) {
      const code = error.code;
      if (code === "ENOENT") return { path: normalized, state: "deleted" };
      hash = largeFileHash(stat);
      if (code !== "ERR_FS_FILE_TOO_LARGE") {
        console.warn("[pi-subagents] watchdog hashFile fell back to metadata for", normalized + ":", error?.message);
      }
    }
  }
  return { path: normalized, state: "file", mode: stat.mode & 511, size: stat.size, hash };
}
function gitWorktreeEntry(normalized, fullPath) {
  const status = git(fullPath, ["status", "--porcelain=v1", "-z", "--untracked-files=no"]);
  return {
    path: normalized,
    state: "git-worktree",
    head: git(fullPath, ["rev-parse", "HEAD"])?.trim(),
    dirty: Boolean(status),
    statusKey: status ? createHash("sha256").update(status).digest("hex") : void 0
  };
}
function hashPath(root, relPath, budget) {
  const normalized = normalizeRelPath(relPath);
  if (!useHashEntryBudget(budget)) return { path: normalized, state: "skipped", reason: "entry-limit" };
  const fullPath = path6.join(root, normalized);
  let stat;
  try {
    stat = fs8.lstatSync(fullPath);
  } catch (error) {
    if (error.code === "ENOENT") return { path: normalized, state: "deleted" };
    throw error;
  }
  if (stat.isSymbolicLink()) {
    return { path: normalized, state: "symlink", target: fs8.readlinkSync(fullPath) };
  }
  if (stat.isDirectory()) {
    if (fs8.existsSync(path6.join(fullPath, ".git"))) return gitWorktreeEntry(normalized, fullPath);
    const entries = fs8.readdirSync(fullPath).map((entry) => normalizeRelPath(path6.posix.join(normalized, entry))).filter((entry) => !ignoredRelPath(entry)).sort();
    const remainingEntries = Math.max(0, budget.maxEntries - budget.entries);
    const selectedEntries = entries.slice(0, remainingEntries);
    const childEntries = selectedEntries.map((entry) => hashPath(root, entry, budget));
    if (selectedEntries.length < entries.length) {
      childEntries.push({ path: normalized, state: "skipped-children", reason: "entry-limit", count: entries.length - selectedEntries.length });
    }
    return { path: normalized, state: "dir", entries: childEntries };
  }
  if (stat.isFile()) return hashFileEntry(normalized, fullPath, stat, budget);
  return { path: normalized, state: "other", mode: stat.mode };
}
function parsePorcelainZ(raw) {
  const tokens = raw.split("\0").filter(Boolean);
  const entries = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.length < 4) continue;
    const status = token.slice(0, 2);
    const relPath = token.slice(3);
    const paths = [relPath];
    if (status[0] === "R" || status[0] === "C") {
      const originalPath = tokens[++index];
      if (originalPath) paths.push(originalPath);
    }
    entries.push({ status, paths });
  }
  return entries;
}
function buildRepoChangeSignature(root, statusOutput) {
  const entries = parsePorcelainZ(statusOutput).map((entry) => ({
    status: entry.status,
    paths: entry.paths.map(normalizeRelPath).filter((relPath) => !ignoredRelPath(relPath))
  })).filter((entry) => entry.paths.length > 0).sort((a, b) => `${a.status} ${a.paths.join("\0")}`.localeCompare(`${b.status} ${b.paths.join("\0")}`));
  const changedPaths = [...new Set(entries.flatMap((entry) => entry.paths))].sort();
  const budget = { entries: 0, bytes: 0, maxEntries: maxHashEntries(), maxBytes: maxHashTotalBytes() };
  const payload = entries.map((entry) => ({
    status: entry.status,
    paths: entry.paths,
    content: entry.paths.map((relPath) => hashPath(root, relPath, budget))
  }));
  const key = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return { root, key, changedPaths };
}
function computeWatchdogRepoChangeSignature(cwd2) {
  const root = git(cwd2, ["rev-parse", "--show-toplevel"])?.trim();
  if (!root) return void 0;
  const skipUntracked = isHomeRepoRoot(root) || hasTrackedEntries(root) === false;
  const statusOutput = git(root, [
    "status",
    "--porcelain=v1",
    "-z",
    `--untracked-files=${skipUntracked ? "no" : "all"}`
  ]);
  if (statusOutput === void 0) return void 0;
  try {
    return buildRepoChangeSignature(root, statusOutput);
  } catch (error) {
    console.warn("[pi-subagents] watchdog repo change signature failed:", error?.message);
    return void 0;
  }
}
function toolNameFromMessage(message2) {
  const value = message2.toolName ?? message2.name;
  return typeof value === "string" ? value : "";
}
function toolResultSucceeded(message2) {
  return message2.isError !== true && message2.error === void 0;
}
function messageIndicatesRepoEdit(message2) {
  if (!message2 || typeof message2 !== "object") return false;
  const input = message2;
  const role = input.role;
  if (role !== "toolResult" && role !== "tool") return false;
  const toolName = toolNameFromMessage(input);
  return (toolName === "edit" || toolName === "write") && toolResultSucceeded(input);
}
function eventIndicatesRepoEdit(event) {
  if (!event || typeof event !== "object") return false;
  const input = event;
  if (input.type === "turn_end" || input.event === "turn_end") {
    return [input.message, ...Array.isArray(input.toolResults) ? input.toolResults : []].some(messageIndicatesRepoEdit);
  }
  if (input.type === "tool_result" || input.event === "tool_result") return messageIndicatesRepoEdit({ role: "toolResult", ...input });
  return false;
}

// src/watchdog/emission-guard.ts
var CONTENT_FREE_PHRASES = /* @__PURE__ */ new Set([
  "stop",
  "done",
  "complete",
  "completed",
  "no issue",
  "no issues",
  "no concern",
  "no concerns",
  "nothing to add",
  "lgtm",
  "looks good",
  "looks good to me",
  "all good",
  "ok",
  "okay",
  "none",
  "n a"
]);
function normalizeWatchdogEmissionText(value) {
  return value.normalize("NFKC").toLowerCase().replace(/[’'`]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function watchdogWarningUnderlyingIdentity(warning) {
  return [normalizeWatchdogEmissionText(warning.summary), normalizeWatchdogEmissionText(warning.evidence)].join("\n");
}
function watchdogWarningIdentity(warning) {
  return [warning.severity, watchdogWarningUnderlyingIdentity(warning)].join("\n");
}
function isContentFree(value) {
  const normalized = normalizeWatchdogEmissionText(value);
  return !normalized || CONTENT_FREE_PHRASES.has(normalized);
}
var WatchdogEmissionGuard = class {
  maxWarnings;
  dedupeHistoryLimit;
  acceptedCount = 0;
  acceptedByUnderlyingIdentity = /* @__PURE__ */ new Map();
  historyOrder = [];
  updateAcceptedUnderlyingIdentity;
  updateAcceptedSeverity;
  constructor(options = {}) {
    this.maxWarnings = options.maxWarnings ?? null;
    this.dedupeHistoryLimit = options.dedupeHistoryLimit ?? 200;
  }
  startModelUpdate() {
    this.updateAcceptedUnderlyingIdentity = void 0;
    this.updateAcceptedSeverity = void 0;
  }
  reset() {
    this.acceptedCount = 0;
    this.acceptedByUnderlyingIdentity.clear();
    this.historyOrder = [];
    this.startModelUpdate();
  }
  /** `allowRepeatOf`: one already-accepted identity that may repeat (boundary re-findings before stalemate). */
  evaluate(warning, options = {}) {
    if (isContentFree(warning.summary) || isContentFree(warning.evidence) || isContentFree(warning.recommendedAction)) {
      return { accepted: false, reason: "content-free" };
    }
    const underlyingIdentity = watchdogWarningUnderlyingIdentity(warning);
    const identity = watchdogWarningIdentity(warning);
    const priorSeverity = this.acceptedByUnderlyingIdentity.get(underlyingIdentity);
    const escalation = priorSeverity === "concern" && warning.severity === "blocker";
    if (this.updateAcceptedUnderlyingIdentity !== void 0) {
      const updateEscalation = this.updateAcceptedUnderlyingIdentity === underlyingIdentity && this.updateAcceptedSeverity === "concern" && warning.severity === "blocker";
      if (!updateEscalation) return { accepted: false, reason: "update-budget", identity, underlyingIdentity };
    }
    const repeat = priorSeverity !== void 0 && options.allowRepeatOf === identity;
    if (priorSeverity !== void 0 && !escalation && !repeat) return { accepted: false, reason: "duplicate", identity, underlyingIdentity };
    if (this.maxWarnings !== null && this.acceptedCount >= this.maxWarnings && !escalation && !repeat) {
      return { accepted: false, reason: "max-warnings", identity, underlyingIdentity };
    }
    this.acceptedByUnderlyingIdentity.set(underlyingIdentity, warning.severity);
    if (!priorSeverity) {
      this.acceptedCount++;
      this.historyOrder.push(underlyingIdentity);
    }
    while (this.historyOrder.length > this.dedupeHistoryLimit) {
      const stale = this.historyOrder.shift();
      if (stale) this.acceptedByUnderlyingIdentity.delete(stale);
    }
    this.updateAcceptedUnderlyingIdentity = underlyingIdentity;
    this.updateAcceptedSeverity = warning.severity;
    return { accepted: true, identity, underlyingIdentity, escalation };
  }
};

// src/watchdog/lsp-diagnostics.ts
import { spawn } from "node:child_process";
import { createHash as createHash2 } from "node:crypto";
import * as fs9 from "node:fs";
import * as path7 from "node:path";
import { pathToFileURL } from "node:url";
var TS_JS_EXTENSIONS = /* @__PURE__ */ new Map([
  [".ts", "typescript"],
  [".tsx", "typescriptreact"],
  [".mts", "typescript"],
  [".cts", "typescript"],
  [".js", "javascript"],
  [".jsx", "javascriptreact"],
  [".mjs", "javascript"],
  [".cjs", "javascript"]
]);
var PROVIDER_NAME = "typescript-language-server";
var MAX_MESSAGE_LENGTH = 500;
var MAX_STDERR_LENGTH = 2e3;
var SHUTDOWN_TIMEOUT_MS = 250;
function normalizeRelPath2(value) {
  return value.replaceAll(path7.sep, "/").replace(/^\.\//, "");
}
function isPathInsideRoot(absPath, root) {
  const rel = path7.relative(root, absPath);
  return rel === "" || !rel.startsWith("..") && !path7.isAbsolute(rel);
}
function languageIdForPath(filePath) {
  return TS_JS_EXTENSIONS.get(path7.extname(filePath).toLowerCase());
}
function trimDiagnosticMessage(message2) {
  const normalized = message2.replace(/\s+/g, " ").trim();
  return normalized.length > MAX_MESSAGE_LENGTH ? `${normalized.slice(0, MAX_MESSAGE_LENGTH - 1)}\u2026` : normalized;
}
function severityFromLsp(value) {
  if (value === 1) return "error";
  if (value === 2) return "warning";
  if (value === 3) return "info";
  return "hint";
}
function pathExecutable(filePath) {
  try {
    const stat = fs9.statSync(filePath);
    if (!stat.isFile()) return false;
    if (process.platform === "win32") return true;
    fs9.accessSync(filePath, fs9.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function pathExecutableNames(name) {
  if (process.platform !== "win32") return [name];
  const extensions = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean);
  return [name, ...extensions.map((ext) => `${name}${ext.toLowerCase()}`), ...extensions.map((ext) => `${name}${ext.toUpperCase()}`)];
}
function resolveTypeScriptLanguageServer(root) {
  for (const name of pathExecutableNames(PROVIDER_NAME)) {
    const local = path7.join(root, "node_modules", ".bin", name);
    if (pathExecutable(local)) return { command: local, args: ["--stdio"], label: `${PROVIDER_NAME} (project)` };
  }
  for (const dir of (process.env.PATH ?? "").split(path7.delimiter).filter(Boolean)) {
    for (const name of pathExecutableNames(PROVIDER_NAME)) {
      const candidate = path7.join(dir, name);
      if (pathExecutable(candidate)) return { command: candidate, args: ["--stdio"], label: PROVIDER_NAME };
    }
  }
  return void 0;
}
function collectTargetFiles(root, changedPaths, maxFiles) {
  const targets = [];
  const skippedPaths = [];
  for (const changedPath of changedPaths) {
    const relPath = normalizeRelPath2(changedPath);
    const absPath = path7.resolve(root, relPath);
    const languageId = languageIdForPath(absPath);
    if (!languageId || !isPathInsideRoot(absPath, root)) {
      skippedPaths.push(relPath);
      continue;
    }
    let stat;
    try {
      stat = fs9.statSync(absPath);
    } catch (error) {
      if (error.code === "ENOENT") {
        skippedPaths.push(relPath);
        continue;
      }
      throw error;
    }
    if (!stat.isFile()) {
      skippedPaths.push(relPath);
      continue;
    }
    if (targets.length >= maxFiles) {
      skippedPaths.push(relPath);
      continue;
    }
    targets.push({ relPath, absPath, uri: pathToFileURL(absPath).href, languageId });
  }
  return { targets, skippedPaths };
}
function diagnosticIdentity(diagnostic) {
  return createHash2("sha256").update([
    diagnostic.path,
    diagnostic.severity,
    diagnostic.source,
    diagnostic.code ?? "",
    diagnostic.message
  ].join("\n")).digest("hex");
}
var WatchdogLspDiagnosticsLedger = class {
  seen = /* @__PURE__ */ new Map();
  reset() {
    this.seen.clear();
  }
  reduce(result2) {
    if (result2.status === "disabled" || result2.status === "unavailable" || result2.status === "failed") return result2;
    const currentByPath = /* @__PURE__ */ new Map();
    const fresh = [];
    for (const diagnostic of result2.diagnostics) {
      const identity = diagnosticIdentity(diagnostic);
      const current = currentByPath.get(diagnostic.path) ?? /* @__PURE__ */ new Set();
      current.add(identity);
      currentByPath.set(diagnostic.path, current);
      if (!this.seen.get(diagnostic.path)?.has(identity)) fresh.push(diagnostic);
    }
    for (const [filePath, identities] of currentByPath) this.seen.set(filePath, identities);
    if (result2.status === "ok") {
      for (const checkedPath of result2.checkedPaths) {
        if (!currentByPath.has(checkedPath)) this.seen.delete(checkedPath);
      }
    }
    return { ...result2, diagnostics: fresh };
  }
};
function formatDiagnostic(diagnostic) {
  const code = diagnostic.code ? ` ${diagnostic.code}` : "";
  return `${diagnostic.path}:${diagnostic.line}:${diagnostic.column} ${diagnostic.severity}${code} ${diagnostic.source}: ${diagnostic.message}`;
}
function formatWatchdogLspDiagnosticsBlock(result2) {
  const actionable = result2.diagnostics.filter((diagnostic) => diagnostic.severity === "error" || diagnostic.severity === "warning");
  if (!actionable.length) return "";
  return [
    "LSP diagnostics:",
    ...actionable.map((diagnostic) => `- ${formatDiagnostic(diagnostic)}`)
  ].join("\n");
}
function watchdogWarningFromLspDiagnostics(result2) {
  const actionable = result2.diagnostics.filter((diagnostic) => diagnostic.severity === "error" || diagnostic.severity === "warning");
  if (!actionable.length) return void 0;
  const errors = actionable.filter((diagnostic) => diagnostic.severity === "error");
  const severity = errors.length ? "blocker" : "concern";
  const primary = errors[0] ?? actionable[0];
  const count = errors.length || actionable.length;
  const kind = errors.length ? "error" : "warning";
  const evidence = actionable.slice(0, 5).map(formatDiagnostic).join("\n");
  return {
    severity,
    category: "correctness",
    importance: "high",
    source: "lsp",
    summary: `LSP found ${count} ${kind}${count === 1 ? "" : "s"} in changed ${count === 1 ? "file" : "files"}.`,
    evidence: evidence || formatDiagnostic(primary),
    recommendedAction: "Fix the reported diagnostics or explain why they are expected before accepting the change."
  };
}
function withTimeout(promise, timeoutMs, message2, signal) {
  if (signal?.aborted) return Promise.reject(new Error("aborted"));
  let timer;
  return new Promise((resolve5, reject) => {
    const onAbort = () => {
      if (timer) clearTimeout(timer);
      reject(new Error("aborted"));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error(message2));
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve5(value);
      },
      (error) => {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}
var JsonRpcLspClient = class {
  nextId = 1;
  stdoutBuffer = Buffer.alloc(0);
  pending = /* @__PURE__ */ new Map();
  diagnostics = /* @__PURE__ */ new Map();
  child;
  stderr = "";
  exited = false;
  terminating = false;
  exitWaiters = [];
  constructor(child) {
    this.child = child;
    child.stdout.on("data", (chunk) => this.handleStdout(chunk));
    child.stderr.on("data", (chunk) => {
      this.stderr = `${this.stderr}${chunk.toString("utf-8")}`.slice(-MAX_STDERR_LENGTH);
    });
    child.on("error", (error) => {
      this.exited = true;
      this.rejectPending(error);
      this.resolveExitWaiters();
    });
    child.on("exit", (code, signal) => {
      this.exited = true;
      this.rejectPending(new Error(`language server exited${code === null ? "" : ` with code ${code}`}${signal ? ` signal ${signal}` : ""}`));
      this.resolveExitWaiters();
    });
  }
  request(method, params, timeoutMs, signal) {
    const id2 = this.nextId++;
    const promise = new Promise((resolve5, reject) => {
      this.pending.set(id2, { resolve: resolve5, reject });
      this.send({ jsonrpc: "2.0", id: id2, method, params });
    });
    return withTimeout(promise, timeoutMs, `${method} timed out`, signal);
  }
  notify(method, params) {
    this.send({ jsonrpc: "2.0", method, params });
  }
  async shutdown() {
    if (this.exited) return;
    if (!this.terminating) {
      try {
        await this.request("shutdown", null, SHUTDOWN_TIMEOUT_MS);
        this.notify("exit", null);
      } catch {
        this.kill();
      }
    }
    await this.waitForExit(SHUTDOWN_TIMEOUT_MS);
  }
  kill() {
    if (this.exited || this.terminating) return;
    this.terminating = true;
    this.child.kill("SIGTERM");
  }
  stderrTail() {
    return this.stderr.trim();
  }
  send(payload) {
    if (this.exited) throw new Error("language server already exited");
    const body = JSON.stringify(payload);
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf-8")}\r
\r
${body}`);
  }
  handleStdout(chunk) {
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
    while (true) {
      const headerEnd = this.stdoutBuffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = this.stdoutBuffer.slice(0, headerEnd).toString("utf-8");
      const match = header.match(/content-length:\s*(\d+)/i);
      if (!match) {
        this.stdoutBuffer = this.stdoutBuffer.slice(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (this.stdoutBuffer.length < bodyEnd) return;
      const body = this.stdoutBuffer.slice(bodyStart, bodyEnd).toString("utf-8");
      this.stdoutBuffer = this.stdoutBuffer.slice(bodyEnd);
      try {
        this.handleMessage(JSON.parse(body));
      } catch (error) {
        const message2 = error instanceof Error ? error.message : String(error);
        this.failProtocol(new Error(`Invalid LSP JSON-RPC response: ${message2}`));
        return;
      }
    }
  }
  handleMessage(message2) {
    if (message2.method === "textDocument/publishDiagnostics") {
      const params = message2.params;
      if (typeof params?.uri === "string" && Array.isArray(params.diagnostics)) {
        this.diagnostics.set(params.uri, params.diagnostics);
      }
      return;
    }
    if (message2.id === void 0 || message2.id === null) return;
    const pending = this.pending.get(message2.id);
    if (!pending) return;
    this.pending.delete(message2.id);
    if (message2.error) {
      pending.reject(new Error(message2.error.message || `LSP request ${message2.id} failed`));
    } else {
      pending.resolve(message2.result);
    }
  }
  failProtocol(error) {
    if (this.exited) return;
    this.rejectPending(error);
    this.kill();
  }
  waitForExit(timeoutMs) {
    if (this.exited) return Promise.resolve();
    return new Promise((resolve5) => {
      const timer = setTimeout(resolve5, timeoutMs);
      this.exitWaiters.push(() => {
        clearTimeout(timer);
        resolve5();
      });
    });
  }
  resolveExitWaiters() {
    for (const resolve5 of this.exitWaiters.splice(0)) resolve5();
  }
  rejectPending(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
};
function convertDiagnostics(target, diagnostics) {
  return diagnostics.filter((diagnostic) => typeof diagnostic.message === "string" && diagnostic.range?.start).map((diagnostic) => ({
    path: target.relPath,
    line: Math.max(1, (diagnostic.range?.start?.line ?? 0) + 1),
    column: Math.max(1, (diagnostic.range?.start?.character ?? 0) + 1),
    severity: severityFromLsp(diagnostic.severity),
    source: diagnostic.source || PROVIDER_NAME,
    ...diagnostic.code !== void 0 ? { code: String(diagnostic.code) } : {},
    message: trimDiagnosticMessage(diagnostic.message ?? "")
  }));
}
function initializeParams(root) {
  const rootUri = pathToFileURL(root).href;
  return {
    processId: process.pid,
    rootUri,
    capabilities: {
      textDocument: {
        publishDiagnostics: { relatedInformation: false, versionSupport: true }
      },
      workspace: { configuration: false, workspaceFolders: true }
    },
    workspaceFolders: [{ uri: rootUri, name: path7.basename(root) || "workspace" }]
  };
}
async function waitForDiagnostics(client, targets, timeoutMs, signal) {
  const started = Date.now();
  while (!signal?.aborted && Date.now() - started < timeoutMs) {
    if (targets.every((target) => client.diagnostics.has(target.uri))) return true;
    await new Promise((resolve5) => setTimeout(resolve5, Math.min(50, Math.max(1, timeoutMs - (Date.now() - started)))));
  }
  return targets.every((target) => client.diagnostics.has(target.uri));
}
async function collectWithTypeScriptLanguageServer(input) {
  const started = Date.now();
  const child = spawn(input.command.command, input.command.args, {
    windowsHide: true,
    cwd: input.root,
    stdio: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(input.command.command)
  });
  const client = new JsonRpcLspClient(child);
  const remaining = () => Math.max(1, input.config.timeoutMs - (Date.now() - started));
  const abort = () => client.kill();
  input.signal?.addEventListener("abort", abort, { once: true });
  try {
    await client.request("initialize", initializeParams(input.root), remaining(), input.signal);
    client.notify("initialized", {});
    for (const target of input.targets) {
      const text = fs9.readFileSync(target.absPath, "utf-8");
      client.notify("textDocument/didOpen", {
        textDocument: { uri: target.uri, languageId: target.languageId, version: 1, text }
      });
      client.notify("textDocument/didSave", {
        textDocument: { uri: target.uri },
        text
      });
    }
    const complete = await waitForDiagnostics(client, input.targets, remaining(), input.signal);
    const diagnostics = input.targets.flatMap((target) => convertDiagnostics(target, client.diagnostics.get(target.uri) ?? [])).slice(0, input.config.maxDiagnostics);
    return {
      status: complete ? "ok" : "timeout",
      provider: input.command.label,
      checkedPaths: input.targets.map((target) => target.relPath),
      skippedPaths: input.skippedPaths,
      diagnostics,
      ...complete ? {} : { message: `Timed out waiting ${input.config.timeoutMs}ms for fresh LSP diagnostics.` }
    };
  } catch (error) {
    const message2 = error instanceof Error ? error.message : String(error);
    const timedOut = message2.includes("timed out") || message2 === "aborted";
    const stderr = client.stderrTail();
    return {
      status: timedOut ? "timeout" : "failed",
      provider: input.command.label,
      checkedPaths: input.targets.map((target) => target.relPath),
      skippedPaths: input.skippedPaths,
      diagnostics: [],
      message: stderr ? `${message2}; ${stderr}` : message2
    };
  } finally {
    input.signal?.removeEventListener("abort", abort);
    await client.shutdown();
  }
}
async function collectWatchdogLspDiagnostics(request) {
  if (!request.config.enabled) {
    return { status: "disabled", checkedPaths: [], skippedPaths: [], diagnostics: [] };
  }
  const root = path7.resolve(request.root || request.cwd);
  const { targets, skippedPaths } = collectTargetFiles(root, request.changedPaths, request.config.maxFiles);
  if (!targets.length) {
    return {
      status: "skipped",
      checkedPaths: [],
      skippedPaths,
      diagnostics: [],
      message: "No changed TypeScript or JavaScript files to check."
    };
  }
  const command = resolveTypeScriptLanguageServer(root);
  if (!command) {
    return {
      status: "unavailable",
      provider: PROVIDER_NAME,
      checkedPaths: [],
      skippedPaths: [...skippedPaths, ...targets.map((target) => target.relPath)],
      diagnostics: [],
      message: `${PROVIDER_NAME} was not found in project node_modules/.bin or PATH.`
    };
  }
  try {
    return await collectWithTypeScriptLanguageServer({ root, targets, skippedPaths, command, config: request.config, signal: request.signal });
  } catch (error) {
    return {
      status: "failed",
      provider: command.label,
      checkedPaths: targets.map((target) => target.relPath),
      skippedPaths,
      diagnostics: [],
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

// src/watchdog/scope.ts
var MAX_SCOPE_ENTRIES = 8;
var MAX_SCOPE_ENTRY_CHARS = 2e3;
var MAX_SCOPE_TOTAL_CHARS = 16e3;
var WatchdogScopeArtifact = class {
  entries = [];
  addPrompt(prompt, options = {}) {
    const normalized = prompt.trim();
    if (!normalized) return;
    this.entries.push({
      prompt: normalized.length > MAX_SCOPE_ENTRY_CHARS ? normalized.slice(0, MAX_SCOPE_ENTRY_CHARS) : normalized,
      createdAt: options.createdAt ?? (/* @__PURE__ */ new Date()).toISOString()
    });
    this.trim();
  }
  reset() {
    this.entries = [];
  }
  snapshot() {
    return this.entries.map((entry) => ({ ...entry }));
  }
  render() {
    if (!this.entries.length) return "";
    return [
      "Current scope:",
      "The following real user prompts are the current scope record, newest last. Side questions are additive, not scope drift or cancellation of older objectives; only explicit changes supersede requirements. Use watchdog_warn for evidence-backed reminders of forgotten authorized work, not dependencies still pending or explicit holds. The orchestrator owns task tracking. Flag unauthorized work as category 'scope-drift'.",
      ...this.entries.map((entry, index) => [
        `Scope prompt ${index + 1} (${entry.createdAt}):`,
        entry.prompt
      ].join("\n"))
    ].join("\n\n");
  }
  trim() {
    while (this.entries.length > MAX_SCOPE_ENTRIES) this.entries.shift();
    let total = this.entries.reduce((sum, entry) => sum + entry.prompt.length, 0);
    while (this.entries.length > 1 && total > MAX_SCOPE_TOTAL_CHARS) {
      const removed = this.entries.shift();
      if (removed) total -= removed.prompt.length;
    }
  }
};

// src/watchdog/turn-delta.ts
function textFromContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (typeof block === "string") return block;
      if (block && typeof block === "object") {
        const item = block;
        if (item.type === "text" && typeof item.text === "string") return item.text;
        if (item.type === "thinking" && typeof item.thinking === "string") return ["Thinking:", item.thinking].join("\n");
        if (item.type === "toolCall") return formatToolCall(item.name, item.input ?? item.args ?? item.arguments);
        if (typeof item.content === "string") return item.content;
      }
      return "";
    }).filter(Boolean).join("\n");
  }
  if (content === void 0 || content === null) return "";
  return formatValue(content);
}
function formatValue(value, indent = "") {
  if (typeof value === "string") return value;
  if (value === void 0) return "undefined";
  if (value === null || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return value.map((item) => `${indent}- ${formatValue(item, `${indent}  `)}`).join("\n");
  }
  if (typeof value === "object") {
    const lines = [];
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "string" && item.includes("\n")) lines.push(`${indent}${key}:
${item}`);
      else lines.push(`${indent}${key}: ${formatValue(item, `${indent}  `)}`);
    }
    return lines.join("\n");
  }
  return String(value);
}
function redactEditWriteInput(input) {
  if (Array.isArray(input)) return input.map(redactEditWriteInput);
  if (!input || typeof input !== "object") return input;
  const sanitized = {};
  for (const [key, value] of Object.entries(input)) {
    sanitized[key] = ["oldText", "newText", "content"].includes(key) && typeof value === "string" ? `[omitted ${value.length} chars; use tool result diff]` : redactEditWriteInput(value);
  }
  return sanitized;
}
function formatToolArguments(name, input) {
  if (name === "edit" || name === "write") return formatValue(redactEditWriteInput(input));
  return formatValue(input);
}
function formatToolCall(name, input) {
  const toolName = typeof name === "string" && name ? name : "tool";
  return [`Tool call: ${toolName}`, "Arguments:", formatToolArguments(toolName, input ?? {})].join("\n");
}
function formatToolResult(name, content, details, error, isError) {
  const failed = isError === true || Boolean(error);
  const lines = [`Tool result: ${name}`];
  if (failed) lines.push(`Error: ${error ? typeof error === "string" ? error : formatValue(error) : "tool reported an error"}`);
  if (!failed && details && typeof details === "object" && "diff" in details && typeof details.diff === "string") {
    lines.push("Diff:", details.diff);
  } else {
    const body = textFromContent(content);
    if (body) lines.push(failed ? "Output:" : "Result:", body);
  }
  return lines.join("\n");
}
function messagesFromEvent(event) {
  if (!event || typeof event !== "object") return [];
  const input = event;
  if (input.type === "turn_end" || input.event === "turn_end") {
    return [input.message, ...Array.isArray(input.toolResults) ? input.toolResults : []].filter(Boolean);
  }
  if (input.message) return [input.message];
  if (input.type === "tool_execution_start" || input.event === "tool_execution_start") {
    return [{ role: "toolCall", name: input.toolName ?? input.name, input: input.args ?? input.input }];
  }
  if (input.type === "tool_execution_end" || input.event === "tool_execution_end") {
    const result2 = input.result && typeof input.result === "object" && !Array.isArray(input.result) ? input.result : void 0;
    return [{
      role: "toolResult",
      toolName: input.toolName ?? input.name,
      content: result2?.content ?? input.content ?? input.result,
      details: result2?.details ?? input.details,
      error: input.error,
      isError: input.isError
    }];
  }
  if (input.type === "tool_result" || input.event === "tool_result") {
    return [{ role: "toolResult", toolName: input.toolName ?? input.name, content: input.content, details: input.details, error: input.error, isError: input.isError }];
  }
  return [];
}
function formatWatchdogReviewMessage(message2, options = {}) {
  if (!message2 || typeof message2 !== "object") return void 0;
  const input = message2;
  if (input.role === "custom" && input.customType === SUBAGENT_WATCHDOG_WARNING_TYPE) return void 0;
  if (input.role === "assistant") {
    const text = textFromContent(input.content);
    const lines = text ? ["Assistant:", text] : [options.structuredTerminal ? "Assistant: (validated structured output is the terminal response; no prose is required)" : "Assistant: (no text)"];
    if (input.stopReason === "stop") lines.push("Assistant stop: stop");
    return lines.join("\n");
  }
  if (input.role === "toolCall") return formatToolCall(input.name ?? input.toolName, input.input ?? input.args ?? input.arguments);
  if (input.role === "toolResult" || input.role === "tool") {
    return formatToolResult(input.toolName ?? input.name ?? "tool", input.content, input.details, input.error, input.isError);
  }
  if (input.role === "user") {
    const text = textFromContent(input.content);
    return text ? ["User:", text].join("\n") : void 0;
  }
  return void 0;
}
function formatWatchdogTurnDelta(input) {
  const sections = [];
  if (input.includeUserPrompt && input.userPrompt?.trim()) sections.push(["User prompt:", input.userPrompt].join("\n"));
  for (const message2 of input.messages ?? []) {
    const section = formatWatchdogReviewMessage(message2, { structuredTerminal: input.structuredTerminal });
    if (section) sections.push(section);
  }
  for (const event of input.events ?? []) {
    for (const message2 of messagesFromEvent(event)) {
      const section = formatWatchdogReviewMessage(message2, { structuredTerminal: input.structuredTerminal });
      if (section) sections.push(section);
    }
  }
  if (input.finalAssistantStop) sections.push(input.structuredTerminal ? "Final assistant stop: validated structured output completed the response" : "Final assistant stop: stop without tool call");
  return sections.join("\n\n---\n\n");
}
function formatWatchdogOrchestrationActivity(event) {
  const turn = event;
  if (turn?.type !== "turn_end" || !Array.isArray(turn.message?.content) || !Array.isArray(turn.toolResults)) return "";
  const sections = [];
  for (const call of turn.message.content) {
    if (call?.type !== "toolCall" || typeof call.id !== "string") continue;
    const args2 = call.arguments;
    if (!args2 || typeof args2 !== "object") continue;
    const eligible = call.name === "bg_wait" || call.name === "subagent_supervisor" && ["pending", "list", "reply"].includes(args2.action) || call.name === "subagent" && (["status", "resume", "interrupt", "steer", "stop"].includes(args2.action) || args2.action === void 0 && (typeof args2.agent === "string" || args2.workflow !== void 0));
    if (!eligible) continue;
    const result2 = turn.toolResults.find((value) => {
      const result3 = value;
      return result3?.role === "toolResult" && result3.toolCallId === call.id && result3.toolName === call.name;
    });
    if (result2) sections.push(formatToolCall(call.name, args2), formatWatchdogReviewMessage(result2) ?? "");
  }
  return sections.join("\n\n");
}

// src/watchdog/runtime.ts
var DEFAULT_REVIEW = () => ({ warnings: [] });
var MAX_REVIEW_INPUT_CHARS = 24e3;
var REVIEW_INPUT_HEAD_CHARS = 6e3;
var REVIEW_DELTA_SEPARATOR = "\n\n---\n\n";
function boundWatchdogReviewText(text, cap = MAX_REVIEW_INPUT_CHARS) {
  if (text.length <= cap) return text;
  const head = Math.min(REVIEW_INPUT_HEAD_CHARS, Math.floor(cap / 4));
  const marker = `

[... about ${text.length - cap} characters omitted ...]

`;
  return `${text.slice(0, head)}${marker}${text.slice(text.length - (cap - head - marker.length))}`;
}
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}
function promptFromBeforeAgentStart(event) {
  if (!event || typeof event !== "object") return void 0;
  const input = event;
  if (input.messageType === "custom") return void 0;
  return typeof input.prompt === "string" ? input.prompt : void 0;
}
function reviewInputSignature(input) {
  return createHash3("sha256").update(input).digest("hex");
}
var MainWatchdogRuntime = class {
  cwd;
  resolveConfig;
  review;
  reviewConnected;
  reviewDescription;
  displayWarning;
  displayUserWarning;
  reviewChangesOnly;
  lspDiagnostics;
  repoChangeSignature;
  lspLedger = new WatchdogLspDiagnosticsLedger();
  scope = new WatchdogScopeArtifact();
  configResult;
  sessionOverrideEnabled;
  sessionModelOverride;
  status = "idle";
  pendingDeltas = [];
  pendingDeltaChars = 0;
  guard = new WatchdogEmissionGuard();
  guardMaxWarnings = null;
  epoch = 0;
  reviewIdCounter = 0;
  agentEndIdCounter = 0;
  activeAgentEndId;
  activeAgentEndAbortController;
  activeReviewId;
  activeReviewWarning;
  reviewing = false;
  waitingAtAgentEnd = false;
  disposed = false;
  includeUserPromptInNextDelta = false;
  userPrompt;
  waiters = [];
  lastWarning;
  lastError;
  lastReviewInputSignature;
  turnStartChangeSignature;
  lastReviewedChangeSignature;
  currentChangedPaths;
  lastLspSnapshot;
  observedRepoEditThisTurn = false;
  toolResultsThisRun = 0;
  midRunReviewing = false;
  lastBoundaryIdentity;
  boundaryRepeats = 0;
  stalemate = false;
  ruleWarningsThisRun = /* @__PURE__ */ new Set();
  midRunGeneration = 0;
  activeReviewAbortController;
  failedReviews = 0;
  staleReviews = 0;
  displayClarification;
  askedThisPrompt = false;
  activityTail = "";
  activityPending = false;
  activityReviewUsed = false;
  constructor(options = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.resolveConfig = options.resolveConfig ?? resolveWatchdogConfig;
    this.review = options.review ?? DEFAULT_REVIEW;
    this.reviewConnected = Boolean(options.review);
    this.reviewDescription = options.reviewDescription ?? (options.review ? "injected seam" : "not wired");
    this.displayWarning = options.displayWarning;
    this.displayUserWarning = options.displayUserWarning;
    this.displayClarification = options.displayClarification;
    this.reviewChangesOnly = options.reviewChangesOnly === true;
    this.lspDiagnostics = options.lspDiagnostics ?? collectWatchdogLspDiagnostics;
    this.repoChangeSignature = options.repoChangeSignature ?? computeWatchdogRepoChangeSignature;
    this.configResult = this.resolveConfig(this.cwd);
    this.guardMaxWarnings = this.configResult.config.maxWarnings;
    this.guard = new WatchdogEmissionGuard({ maxWarnings: this.guardMaxWarnings });
    this.turnStartChangeSignature = this.currentRepoChangeSignature();
    this.lastReviewedChangeSignature = this.turnStartChangeSignature?.key;
  }
  bindSession(ctx) {
    this.cwd = ctx.cwd;
    this.sessionOverrideEnabled = void 0;
    this.sessionModelOverride = void 0;
    this.refreshConfig(ctx.cwd);
    this.reset("session_start", { clearReviewInputSignature: true, resetChangeSignature: true, clearLspLedger: true, clearScope: true });
    this.resetBoundaryRepeats();
  }
  refreshConfig(cwd2 = this.cwd) {
    this.cwd = cwd2;
    const wasEnabled = this.isEnabled();
    const hadClarification = this.configResult.config.clarification;
    const previousMain = this.configResult.config.main;
    const session = this.sessionOverrideEnabled === void 0 && this.sessionModelOverride === void 0 ? void 0 : {
      ...this.sessionOverrideEnabled === void 0 ? {} : { enabled: this.sessionOverrideEnabled },
      main: {
        ...this.sessionOverrideEnabled === void 0 ? {} : { enabled: this.sessionOverrideEnabled },
        ...this.sessionModelOverride ?? {}
      }
    };
    this.configResult = this.resolveConfig(this.cwd, session === void 0 ? void 0 : { session });
    if (this.configResult.config.maxWarnings !== this.guardMaxWarnings) {
      this.guardMaxWarnings = this.configResult.config.maxWarnings;
      this.guard = new WatchdogEmissionGuard({ maxWarnings: this.guardMaxWarnings });
    }
    if (wasEnabled && !this.isEnabled()) this.invalidateActiveReview("watchdog disabled");
    if (!this.isEnabled() || !this.configResult.config.clarification) this.clearActivity();
    if (this.displayClarification && (hadClarification || this.configResult.config.clarification) && (this.reviewing || this.waitingAtAgentEnd)) {
      if (!this.configResult.config.clarification || previousMain.model !== this.configResult.config.main.model || previousMain.thinking !== this.configResult.config.main.thinking) this.invalidateActiveReview("clarification configuration changed");
    }
    return this.configResult;
  }
  setSessionEnabled(enabled, cwd2 = this.cwd) {
    this.sessionOverrideEnabled = enabled;
    this.reset("session override");
    this.refreshConfig(cwd2);
    return this.getSnapshot();
  }
  setSessionModel(patch, cwd2 = this.cwd) {
    const next = { ...this.sessionModelOverride ?? {} };
    if (patch.model === null) delete next.model;
    else if (patch.model !== void 0) next.model = patch.model;
    if (patch.thinking === null) delete next.thinking;
    else if (patch.thinking !== void 0) next.thinking = patch.thinking;
    this.sessionModelOverride = next.model === void 0 && next.thinking === void 0 ? void 0 : next;
    this.reset("session model override");
    this.refreshConfig(cwd2);
    return this.getSnapshot();
  }
  clearSessionModel(cwd2 = this.cwd) {
    this.sessionModelOverride = void 0;
    this.reset("session model override cleared");
    this.refreshConfig(cwd2);
    return this.getSnapshot();
  }
  clearSessionOverride(cwd2 = this.cwd) {
    this.sessionOverrideEnabled = void 0;
    this.sessionModelOverride = void 0;
    this.reset("session override cleared");
    this.refreshConfig(cwd2);
    return this.getSnapshot();
  }
  reset(_reason = "reset", options = {}) {
    this.activeReviewAbortController?.abort();
    this.abortActiveAgentEnd();
    this.epoch++;
    this.status = "idle";
    this.clearPendingDeltas();
    this.reviewing = false;
    this.waitingAtAgentEnd = false;
    this.activeReviewId = void 0;
    this.activeReviewWarning = void 0;
    this.includeUserPromptInNextDelta = false;
    this.userPrompt = void 0;
    this.lastError = void 0;
    this.currentChangedPaths = void 0;
    this.observedRepoEditThisTurn = false;
    this.toolResultsThisRun = 0;
    this.midRunReviewing = false;
    this.ruleWarningsThisRun.clear();
    if (options.clearLspLedger) {
      this.lspLedger.reset();
      this.lastLspSnapshot = void 0;
    }
    if (options.clearScope) this.scope.reset();
    if (options.clearScope || options.clearActivity) this.clearActivity();
    if (options.clearReviewInputSignature) this.lastReviewInputSignature = void 0;
    if (options.resetChangeSignature) this.resetRepoChangeBaseline({ reviewed: true });
    this.guard.reset();
    this.resolveWaiters(true);
  }
  dispose() {
    this.clearActivity();
    this.activeReviewAbortController?.abort();
    this.disposed = true;
    this.abortActiveAgentEnd();
    this.epoch++;
    this.status = "idle";
    this.clearPendingDeltas();
    this.reviewing = false;
    this.waitingAtAgentEnd = false;
    this.activeReviewId = void 0;
    this.activeReviewWarning = void 0;
    this.lastReviewInputSignature = void 0;
    this.currentChangedPaths = void 0;
    this.lastLspSnapshot = void 0;
    this.lspLedger.reset();
    this.scope.reset();
    this.observedRepoEditThisTurn = false;
    this.toolResultsThisRun = 0;
    this.midRunReviewing = false;
    this.resolveWaiters(false);
  }
  handleBeforeAgentStart(event, ctx) {
    if (this.disposed) return;
    const incomingPrompt = promptFromBeforeAgentStart(event);
    this.reset("before_agent_start");
    this.askedThisPrompt = false;
    this.activityReviewUsed = false;
    this.resetBoundaryRepeats();
    this.refreshConfig(ctx.cwd);
    this.userPrompt = incomingPrompt;
    if (this.userPrompt?.trim()) {
      this.includeUserPromptInNextDelta = true;
      this.scope.addPrompt(this.userPrompt);
    } else {
      this.includeUserPromptInNextDelta = false;
    }
    this.resetRepoChangeBaseline();
  }
  handleTurnEnd(event, ctx, structuredTerminal = false) {
    if (this.disposed) return;
    this.refreshConfig(ctx.cwd);
    if (!this.isEnabled()) return;
    try {
      if (this.displayClarification && this.configResult.config.clarification && this.boundaryRepeats === 0) {
        const activity = formatWatchdogOrchestrationActivity(event);
        if (activity) {
          this.activityTail = [this.activityTail, boundWatchdogReviewText(activity, 3e3)].filter(Boolean).join(REVIEW_DELTA_SEPARATOR).slice(-6e3);
          this.activityPending = true;
        }
      }
      this.observedRepoEditThisTurn ||= eventIndicatesRepoEdit(event);
      const delta = formatWatchdogTurnDelta({
        includeUserPrompt: this.includeUserPromptInNextDelta,
        userPrompt: this.userPrompt,
        events: [event],
        structuredTerminal
      });
      this.includeUserPromptInNextDelta = false;
      this.enqueueDelta(delta);
    } catch (error) {
      this.fail(`Failed to format watchdog turn delta: ${errorMessage2(error)}`);
    }
  }
  enqueueDelta(delta) {
    if (this.disposed || !delta.trim() || !this.isEnabled()) return;
    this.appendBoundedDelta(delta);
    if (!this.reviewing && !this.waitingAtAgentEnd && !this.midRunReviewing) this.status = "queued";
  }
  handleToolResult(ctx) {
    if (this.disposed) return;
    this.refreshConfig(ctx.cwd);
    if (!this.isEnabled()) return;
    const everyNTools = this.configResult.config.cadence.everyNTools;
    if (everyNTools === null) return;
    this.toolResultsThisRun++;
    if (this.toolResultsThisRun % everyNTools !== 0) return;
    if (this.reviewing || this.waitingAtAgentEnd || this.midRunReviewing) return;
    const delta = this.buildReviewInput(void 0, "");
    if (!delta.trim()) return;
    void this.reviewMidRunDelta(delta);
  }
  async handleAgentEnd(_event, ctx) {
    if (this.disposed) return;
    this.refreshConfig(ctx.cwd);
    if (!this.isEnabled()) return;
    if (ctx.signal?.aborted) return;
    const changeSignature = this.resolveReviewChangeSignature(this.currentRepoChangeSignature(ctx.cwd), ctx.cwd);
    const activityReview = Boolean(this.displayClarification && this.configResult.config.clarification && !this.activityReviewUsed && this.boundaryRepeats === 0 && this.activityPending);
    const knownEvidence = changeSignature && changeSignature.key === this.lastReviewedChangeSignature;
    if (!activityReview && (knownEvidence || this.reviewChangesOnly && !changeSignature)) {
      this.clearPendingDeltas();
      if (knownEvidence || this.status === "queued") this.status = "idle";
      this.resolveWaiters(true);
      return;
    }
    this.cancelMidRunReview();
    if (activityReview && (!changeSignature || knownEvidence)) this.activityReviewUsed = true;
    this.activityPending = false;
    this.waitingAtAgentEnd = true;
    const agentEndEpoch = this.epoch;
    const agentEndId = ++this.agentEndIdCounter;
    const lspAbortController = new AbortController();
    this.activeAgentEndId = agentEndId;
    this.activeAgentEndAbortController = lspAbortController;
    try {
      this.guard.startModelUpdate();
      const lspBlock = await this.collectLspDiagnostics(changeSignature, {
        epoch: agentEndEpoch,
        agentEndId,
        signal: lspAbortController.signal
      });
      if (this.activeAgentEndAbortController === lspAbortController) this.activeAgentEndAbortController = void 0;
      if (!this.isAgentEndCurrent(agentEndEpoch, agentEndId)) return;
      const delta = this.buildReviewInput(changeSignature, lspBlock);
      this.clearPendingDeltas();
      if (!delta.trim()) {
        this.waitingAtAgentEnd = false;
        if (this.status === "queued") this.status = "idle";
        this.resolveWaiters(true);
        return;
      }
      const signature = reviewInputSignature(delta);
      if (!this.reviewChangesOnly && signature === this.lastReviewInputSignature) {
        this.waitingAtAgentEnd = false;
        this.status = "idle";
        this.resolveWaiters(true);
        return;
      }
      const outcome = await this.reviewDelta(delta, this.configResult.config.agentEndTimeoutMs, { allowClarification: true });
      if (!this.isAgentEndCurrent(agentEndEpoch, agentEndId)) return;
      this.waitingAtAgentEnd = false;
      if (outcome === "timeout") {
        this.staleReviews++;
        this.invalidateActiveReview("agent-end timeout");
        this.status = "stale";
        this.markLastWarningStale();
        this.resolveWaiters(true);
        return;
      }
      if ((outcome === "completed" || typeof outcome === "object") && this.status !== "failed" && this.status !== "stale") {
        this.lastReviewInputSignature = signature;
        if (changeSignature) this.lastReviewedChangeSignature = changeSignature.key;
        this.currentChangedPaths = changeSignature?.changedPaths;
        this.status = "idle";
        if (typeof outcome === "object" && !ctx.signal?.aborted) this.displayClarification?.([
          "Main watchdog clarification:",
          outcome.question,
          `Evidence: ${outcome.evidence}`,
          "Consider this missing context as you continue the task. This is not approval, permission, or a warning. The reviewer has yielded; no reply or follow-up review is required."
        ].join("\n"));
      }
      this.resolveWaiters(true);
    } finally {
      if (this.activeAgentEndAbortController === lspAbortController) this.activeAgentEndAbortController = void 0;
      if (this.activeAgentEndId === agentEndId) this.activeAgentEndId = void 0;
    }
  }
  displayRuleWarning(violation) {
    if (this.disposed || this.ruleWarningsThisRun.has(violation.summary)) return;
    this.ruleWarningsThisRun.add(violation.summary);
    const details = normalizeWatchdogWarningDetails(ruleViolationWarning(violation), { state: "displayed", displayedAt: (/* @__PURE__ */ new Date()).toISOString() });
    this.lastWarning = details;
    this.routeWarning(details, { deliverAs: "steer" });
  }
  displayRecordedWarning(warning) {
    const details = normalizeWatchdogWarningDetails(warning, { state: "displayed", source: warning.source ?? "main" });
    this.lastWarning = details;
    this.routeWarning(details);
  }
  getSnapshot(cwd2) {
    if (cwd2) this.refreshConfig(cwd2);
    return {
      status: this.status,
      enabled: this.isEnabled(),
      config: this.configResult.config,
      configOk: this.configResult.ok,
      errors: [...this.configResult.errors],
      sources: [...this.configResult.sources],
      bufferedDeltas: this.pendingDeltas.length,
      epoch: this.epoch,
      ...this.activeReviewId !== void 0 ? { activeReviewId: this.activeReviewId } : {},
      ...this.sessionOverrideEnabled !== void 0 ? { sessionOverride: this.sessionOverrideEnabled } : {},
      ...this.sessionModelOverride !== void 0 ? { sessionModelOverride: { ...this.sessionModelOverride } } : {},
      ...this.lastWarning ? { lastWarning: this.lastWarning } : {},
      ...this.lastError ? { lastError: this.lastError } : {},
      failedReviews: this.failedReviews,
      staleReviews: this.staleReviews,
      reviewConnected: this.reviewConnected,
      reviewDescription: this.reviewDescription,
      boundaryRepeats: this.boundaryRepeats,
      stalemate: this.stalemate,
      reviewTrigger: this.reviewChangesOnly ? "repo-edits" : "turn-delta",
      ...this.currentChangedPaths?.length ? { changedPaths: [...this.currentChangedPaths] } : {},
      lsp: this.lspSnapshot()
    };
  }
  /** A real user input sent while the agent streams reaches the loop without before_agent_start, so record it in scope here. */
  handleUserInput(event) {
    if (this.disposed || event.source === "extension") return;
    if (this.displayClarification && this.configResult.config.clarification && (this.reviewing || this.waitingAtAgentEnd)) this.reset("new user input");
    if (event.streamingBehavior) this.scope.addPrompt(event.text);
  }
  handleModelChange() {
    if (this.displayClarification && this.configResult.config.clarification && (this.reviewing || this.waitingAtAgentEnd)) this.reset("model changed");
  }
  async waitForIdle(timeoutMs = 1e3) {
    return this.waitForSettled(timeoutMs);
  }
  isEnabled() {
    return this.configResult.ok && this.configResult.config.main.enabled;
  }
  abortActiveAgentEnd() {
    this.activeAgentEndAbortController?.abort();
    this.activeAgentEndAbortController = void 0;
    this.activeAgentEndId = void 0;
  }
  isAgentEndCurrent(epoch, agentEndId) {
    return !this.disposed && this.epoch === epoch && this.activeAgentEndId === agentEndId && this.waitingAtAgentEnd && this.isEnabled();
  }
  isCurrent(epoch, reviewId) {
    return !this.disposed && this.epoch === epoch && this.activeReviewId === reviewId;
  }
  warningMeetsThreshold(warning) {
    return WATCHDOG_WARNING_IMPORTANCES.includes(warning.importance) && (this.configResult.config.severityThreshold === "concern" || warning.severity === "blocker");
  }
  routeWarning(details, options) {
    if (details.importance === "high") this.displayWarning?.(details, options);
    else this.displayUserWarning?.(details);
  }
  acceptWarning(epoch, reviewId, warning) {
    if (!this.isCurrent(epoch, reviewId) || !this.isEnabled() || !this.warningMeetsThreshold(warning)) return false;
    const decision = this.guard.evaluate(warning, { allowRepeatOf: this.repeatableBoundaryIdentity() });
    if (!decision.accepted) return false;
    const details = normalizeWatchdogWarningDetails(warning, {
      state: "candidate",
      source: warning.source ?? "main",
      identity: decision.identity
    });
    this.lastWarning = details;
    this.activeReviewWarning = details;
    return true;
  }
  displayBoundaryWarning(warning) {
    if (!this.isEnabled() || !this.warningMeetsThreshold(warning)) return false;
    const decision = this.guard.evaluate(warning, { allowRepeatOf: this.repeatableBoundaryIdentity() });
    if (!decision.accepted) return false;
    const details = normalizeWatchdogWarningDetails(warning, {
      state: "displayed",
      source: warning.source ?? "main",
      identity: decision.identity,
      displayedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    this.deliverBoundaryWarning(details);
    return true;
  }
  invalidateActiveReview(_reason) {
    this.activeReviewAbortController?.abort();
    this.abortActiveAgentEnd();
    this.epoch++;
    this.status = "idle";
    this.clearPendingDeltas();
    this.reviewing = false;
    this.waitingAtAgentEnd = false;
    this.activeReviewId = void 0;
    this.activeReviewWarning = void 0;
  }
  async reviewMidRunDelta(delta) {
    if (this.midRunReviewing || this.reviewing || this.waitingAtAgentEnd || this.disposed) return;
    this.midRunReviewing = true;
    const generation = this.midRunGeneration;
    try {
      const outcome = await this.reviewDelta(delta, this.configResult.config.agentEndTimeoutMs, { correction: true });
      if (generation !== this.midRunGeneration) return;
      if (outcome === "timeout") {
        this.staleReviews++;
        this.status = "stale";
        this.markLastWarningStale();
      }
    } finally {
      if (generation === this.midRunGeneration) {
        this.midRunReviewing = false;
        if (this.status === "reviewing") this.status = this.pendingDeltas.length ? "queued" : "idle";
        this.resolveWaiters(this.isSettled());
      }
    }
  }
  // The agent-end boundary review is authoritative; an in-flight cadence review is superseded.
  cancelMidRunReview() {
    if (!this.midRunReviewing) return;
    this.midRunGeneration++;
    this.activeReviewAbortController?.abort();
    this.activeReviewAbortController = void 0;
    this.staleReviews++;
    this.reviewing = false;
    this.midRunReviewing = false;
    this.activeReviewId = void 0;
    this.activeReviewWarning = void 0;
  }
  async reviewDelta(delta, timeoutMs, options = {}) {
    if (this.reviewing || this.disposed) return "stale";
    this.reviewing = true;
    const reviewEpoch = this.epoch;
    const reviewId = ++this.reviewIdCounter;
    this.activeReviewId = reviewId;
    this.activeReviewWarning = void 0;
    this.status = "reviewing";
    let timeout;
    const abortController = new AbortController();
    this.activeReviewAbortController = abortController;
    const allowClarification = Boolean(options.allowClarification && this.displayClarification && this.configResult.config.clarification && !this.askedThisPrompt && !this.stalemate);
    const reviewPromise = Promise.resolve().then(() => this.review({
      delta,
      epoch: reviewEpoch,
      reviewId,
      config: this.configResult.config,
      hasScope: this.scopeBlock().trim().length > 0,
      signal: abortController.signal,
      emitWarning: (warning) => this.acceptWarning(reviewEpoch, reviewId, warning),
      ...allowClarification ? { allowClarification: true } : {}
    }));
    try {
      const result2 = await Promise.race([
        reviewPromise,
        new Promise((resolve5) => {
          timeout = setTimeout(() => resolve5("timeout"), timeoutMs);
        })
      ]);
      if (result2 === "timeout") {
        abortController.abort();
        return "timeout";
      }
      if (!this.isCurrent(reviewEpoch, reviewId)) return "stale";
      if (!result2) return "stale";
      if (allowClarification && this.configResult.config.clarification && result2.clarification && (!result2.stopReason || result2.stopReason === "stop") && !this.activeReviewWarning && !result2.warnings?.length && !abortController.signal.aborted) {
        const question = result2.clarification.question.trim();
        const evidence = result2.clarification.evidence.trim();
        if (question && evidence) {
          this.askedThisPrompt = true;
          return { question: boundWatchdogReviewText(question, 1e3), evidence: boundWatchdogReviewText(evidence, 2e3) };
        }
      }
      for (const warning of result2.warnings ?? []) this.acceptWarning(reviewEpoch, reviewId, warning);
      if (result2.stopReason && result2.stopReason !== "stop") {
        const detail = result2.errorMessage?.trim() ? ` ${boundWatchdogReviewText(result2.errorMessage.trim(), 600)}` : "";
        this.fail(`Watchdog review ended with stop reason '${result2.stopReason}'.${detail}`);
        return "completed";
      }
      this.displayAcceptedReviewWarning(options.correction);
      return "completed";
    } catch (error) {
      if (this.isCurrent(reviewEpoch, reviewId)) {
        this.fail(`Watchdog review failed: ${errorMessage2(error)}`);
        return "completed";
      }
      return "stale";
    } finally {
      if (timeout) clearTimeout(timeout);
      if (this.activeReviewAbortController === abortController) this.activeReviewAbortController = void 0;
      if (this.epoch === reviewEpoch && this.activeReviewId === reviewId) {
        this.reviewing = false;
        this.activeReviewId = void 0;
        this.activeReviewWarning = void 0;
      }
      this.resolveWaiters(this.isSettled());
    }
  }
  displayAcceptedReviewWarning(correction = false) {
    if (!this.activeReviewWarning) return;
    const details = {
      ...this.activeReviewWarning,
      state: "displayed",
      displayedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (correction) {
      this.lastWarning = details;
      this.routeWarning(details, { deliverAs: "steer" });
      return;
    }
    this.deliverBoundaryWarning(details);
  }
  // A displayed boundary warning continues the run; the same identity back from consecutive
  // boundaries means no progress, so it is shown held instead of continuing again.
  deliverBoundaryWarning(details) {
    const identity = details.identity ?? reviewInputSignature([details.severity, details.summary, details.evidence].join("\n"));
    if (this.lastBoundaryIdentity === identity) this.boundaryRepeats++;
    else {
      this.lastBoundaryIdentity = identity;
      this.boundaryRepeats = 1;
    }
    const stalemate = this.boundaryRepeats >= this.configResult.config.stalemateRepeats;
    const delivered = stalemate ? { ...details, state: "stalemate", stalemateRepeats: this.boundaryRepeats } : details;
    this.stalemate = stalemate;
    this.lastWarning = delivered;
    this.routeWarning(delivered, stalemate ? { triggerTurn: false } : void 0);
  }
  // The previous boundary finding is a repeat to count, not a duplicate, until stalemate.
  repeatableBoundaryIdentity() {
    return this.waitingAtAgentEnd && !this.stalemate ? this.lastBoundaryIdentity : void 0;
  }
  resetBoundaryRepeats() {
    this.lastBoundaryIdentity = void 0;
    this.boundaryRepeats = 0;
    this.stalemate = false;
  }
  currentRepoChangeSignature(cwd2 = this.cwd) {
    return this.reviewChangesOnly && this.isEnabled() ? this.repoChangeSignature(cwd2) : void 0;
  }
  resetRepoChangeBaseline(options = {}) {
    this.turnStartChangeSignature = this.currentRepoChangeSignature(options.cwd ?? this.cwd);
    if (options.reviewed) this.lastReviewedChangeSignature = this.turnStartChangeSignature?.key;
    else this.lastReviewedChangeSignature ??= this.turnStartChangeSignature?.key;
    this.currentChangedPaths = this.turnStartChangeSignature?.changedPaths;
    this.observedRepoEditThisTurn = false;
  }
  resolveReviewChangeSignature(current, cwd2) {
    if (!this.reviewChangesOnly) return void 0;
    if (current) {
      this.currentChangedPaths = current.changedPaths;
      if (current.key === this.turnStartChangeSignature?.key) return void 0;
      if (current.changedPaths.length === 0) return void 0;
      return current;
    }
    return this.observedRepoEditThisTurn ? { root: cwd2, key: `observed-edit:${this.epoch}:${this.reviewIdCounter}:${this.pendingDeltaChars}`, changedPaths: [] } : void 0;
  }
  async collectLspDiagnostics(changeSignature, current) {
    const config = this.configResult.config.lsp;
    if (!config.enabled || !changeSignature?.changedPaths.length) {
      this.lastLspSnapshot = {
        enabled: config.enabled,
        status: config.enabled ? "skipped" : "disabled",
        checkedPaths: [],
        skippedPaths: [],
        diagnostics: [],
        diagnosticCount: 0,
        freshDiagnosticCount: 0,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      return "";
    }
    try {
      const raw = await this.lspDiagnostics({
        cwd: this.cwd,
        root: changeSignature.root,
        changedPaths: changeSignature.changedPaths,
        config,
        signal: current.signal
      });
      if (!this.isAgentEndCurrent(current.epoch, current.agentEndId)) return "";
      const diagnosticCount = raw.diagnostics.length;
      const fresh = this.lspLedger.reduce(raw);
      this.lastLspSnapshot = {
        ...fresh,
        enabled: true,
        diagnosticCount,
        freshDiagnosticCount: fresh.diagnostics.length,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const warning = watchdogWarningFromLspDiagnostics(fresh);
      if (warning) this.displayBoundaryWarning(warning);
      return formatWatchdogLspDiagnosticsBlock(fresh);
    } catch (error) {
      if (!this.isAgentEndCurrent(current.epoch, current.agentEndId)) return "";
      this.lastLspSnapshot = {
        enabled: true,
        status: "failed",
        checkedPaths: [],
        skippedPaths: changeSignature.changedPaths,
        diagnostics: [],
        diagnosticCount: 0,
        freshDiagnosticCount: 0,
        message: `LSP diagnostics failed: ${errorMessage2(error)}`,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      return "";
    }
  }
  lspSnapshot() {
    if (this.lastLspSnapshot) return {
      ...this.lastLspSnapshot,
      checkedPaths: [...this.lastLspSnapshot.checkedPaths],
      skippedPaths: [...this.lastLspSnapshot.skippedPaths],
      diagnostics: [...this.lastLspSnapshot.diagnostics]
    };
    const enabled = this.isEnabled() && this.configResult.config.lsp.enabled;
    return {
      enabled,
      status: enabled ? "skipped" : "disabled",
      checkedPaths: [],
      skippedPaths: [],
      diagnostics: [],
      diagnosticCount: 0,
      freshDiagnosticCount: 0
    };
  }
  appendBoundedDelta(delta) {
    let entry = delta.trim();
    if (!entry) return;
    if (entry.length > MAX_REVIEW_INPUT_CHARS) entry = boundWatchdogReviewText(entry);
    this.pendingDeltas.push(entry);
    this.pendingDeltaChars += entry.length;
    while (this.pendingDeltas.length > 1 && this.pendingDeltaChars + (this.pendingDeltas.length - 1) * REVIEW_DELTA_SEPARATOR.length > MAX_REVIEW_INPUT_CHARS) {
      const removed = this.pendingDeltas.shift();
      if (removed) this.pendingDeltaChars -= removed.length;
    }
  }
  buildReviewInput(changeSignature, lspBlock = "") {
    const input = this.pendingDeltas.join(REVIEW_DELTA_SEPARATOR);
    const scopeBlock = this.scopeBlock();
    const changes = changeSignature?.changedPaths.length ? ["Changed repo paths: every dirty path in the working tree. Authorship is not verified; a path may predate this session or come from another session.", ...changeSignature.changedPaths.slice(0, 200).map((file) => `- ${file}`)].join("\n") : "";
    const activity = this.activityTail ? `Recent delivered orchestration activity (oldest first; bounded observations, not a task board; waits/holds are not evidence of neglect):
${this.activityTail}` : "";
    const contextPieces = [scopeBlock, changes, lspBlock, activity].filter(Boolean);
    if (!contextPieces.length) return boundWatchdogReviewText(input);
    const maxContextLength = Math.floor(MAX_REVIEW_INPUT_CHARS / 2);
    const maxPieceLength = Math.max(1e3, Math.floor(maxContextLength / contextPieces.length));
    const boundedContext = contextPieces.map((piece) => piece.length > maxPieceLength ? piece === activity ? boundWatchdogReviewText(piece, maxPieceLength) : `${piece.slice(0, maxPieceLength - 6)}
- ...` : piece).join(REVIEW_DELTA_SEPARATOR);
    const separatorLength = input ? REVIEW_DELTA_SEPARATOR.length : 0;
    const inputBudget = MAX_REVIEW_INPUT_CHARS - boundedContext.length - separatorLength;
    const boundedInput = inputBudget <= 0 ? "" : boundWatchdogReviewText(input, inputBudget);
    return [boundedContext, boundedInput].filter(Boolean).join(REVIEW_DELTA_SEPARATOR);
  }
  scopeBlock() {
    return this.configResult.config.scope.enabled ? this.scope.render() : "";
  }
  clearPendingDeltas() {
    this.pendingDeltas = [];
    this.pendingDeltaChars = 0;
  }
  clearActivity() {
    if (!this.activityTail) return;
    this.activityTail = "";
    this.activityPending = false;
  }
  fail(message2) {
    this.failedReviews++;
    this.lastError = message2;
    this.status = "failed";
    this.clearPendingDeltas();
    this.resolveWaiters(true);
  }
  markLastWarningStale() {
    if (!this.lastWarning || this.lastWarning.state === "displayed") return;
    this.lastWarning = { ...this.lastWarning, stale: true, state: "stale" };
  }
  isSettled() {
    return !this.reviewing && this.pendingDeltas.length === 0;
  }
  waitForSettled(timeoutMs) {
    if (this.isSettled()) return Promise.resolve(true);
    return new Promise((resolve5) => {
      const waiter = {
        resolve: resolve5,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((entry) => entry !== waiter);
          resolve5(false);
        }, timeoutMs)
      };
      this.waiters.push(waiter);
    });
  }
  resolveWaiters(settled) {
    if (!settled && !this.disposed) return;
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(settled);
    }
  }
};

// src/watchdog/review.ts
import { Agent } from "@earendil-works/pi-agent-core";
import { createReadOnlyTools, convertToLlm } from "@earendil-works/pi-coding-agent";
import { Type as Type4 } from "typebox";

// src/watchdog/guidance.ts
import * as fs10 from "node:fs";
import * as path8 from "node:path";
var WATCHDOG_GUIDANCE_MAX_CHARS = 8e3;
function readOptional(filePath) {
  try {
    return fs10.readFileSync(filePath, "utf-8").trim();
  } catch {
    return "";
  }
}
function loadWatchdogGuidance(cwd2, enabled) {
  if (!enabled) return "";
  const sections = [getProjectConfigDir(cwd2), getAgentDir()].map((dir) => readOptional(path8.join(dir, "WATCHDOG.md"))).filter(Boolean);
  return sections.join("\n\n").slice(0, WATCHDOG_GUIDANCE_MAX_CHARS);
}

// src/watchdog/review.ts
var WATCHDOG_ALLOWED_TOOL_NAMES = /* @__PURE__ */ new Set(["read", "grep", "find", "ls", "watchdog_warn", WATCHDOG_DIFF_TOOL_NAME]);
var WatchdogAskParams = Type4.Object({ question: Type4.String(), evidence: Type4.String() }, { additionalProperties: false });
var WatchdogWarnParams = Type4.Object({
  severity: Type4.String({ enum: WATCHDOG_WARNING_SEVERITIES, description: "concern for actionable risk, blocker for a likely wrong or unsafe outcome" }),
  importance: Type4.String({ enum: WATCHDOG_WARNING_IMPORTANCES, description: "low or medium for user-only visibility; high when the parent model must receive the finding" }),
  summary: Type4.String({ description: "One concise sentence naming the issue." }),
  evidence: Type4.String({ description: "Specific evidence from the turn delta or inspected files." }),
  recommendedAction: Type4.String({ description: "Specific action the parent should take before accepting or continuing." }),
  category: Type4.Optional(Type4.String({ enum: WATCHDOG_WARNING_CATEGORIES }))
}, { additionalProperties: false });
function fullModelId(model2) {
  return `${model2.provider}/${model2.id}`;
}
function splitProviderModel(value) {
  const slashIndex = value.indexOf("/");
  if (slashIndex <= 0 || slashIndex === value.length - 1) return void 0;
  return { provider: value.slice(0, slashIndex), id: value.slice(slashIndex + 1) };
}
function assertThinkingLevel(value, source) {
  if (THINKING_LEVELS.includes(value)) return value;
  throw new Error(`Unsupported watchdog thinking level '${value}' from ${source}; expected ${THINKING_LEVELS.join(", ")} or false.`);
}
function contextThinkingLevel(ctx, currentThinkingLevel) {
  if (currentThinkingLevel) return currentThinkingLevel;
  const value = ctx.thinkingLevel;
  return typeof value === "string" && THINKING_LEVELS.includes(value) ? value : void 0;
}
function resolveReviewThinking(input) {
  const fromModelOrConfig = resolveEffectiveThinking(input.modelString, input.configThinking);
  if (fromModelOrConfig) return assertThinkingLevel(fromModelOrConfig, "watchdog model/config");
  if (input.configThinking === false) return "off";
  if (input.configThinking !== void 0) return assertThinkingLevel(input.configThinking, "watchdog config");
  if (input.allowContextThinking) return contextThinkingLevel(input.ctx, input.currentThinkingLevel) ?? "off";
  return "off";
}
function resolveConfiguredModel(ctx, rawModel) {
  const availableModels = ctx.modelRegistry.getAvailable().map(toModelInfo);
  const preferredProvider = typeof ctx.model?.provider === "string" ? ctx.model.provider : void 0;
  const resolved = resolveModelCandidate(rawModel, availableModels, preferredProvider);
  if (!resolved) {
    throw new Error(`Configured watchdog model '${rawModel}' did not match exactly one authenticated available model. Use provider/model or configure credentials for the intended provider.`);
  }
  const { baseModel } = splitKnownThinkingSuffix(resolved);
  const named = splitProviderModel(baseModel);
  if (!named) {
    throw new Error(`Configured watchdog model '${rawModel}' did not match exactly one authenticated available model. Use provider/model or configure credentials for the intended provider.`);
  }
  const model2 = ctx.modelRegistry.find(named.provider, named.id);
  if (!model2) throw new Error(`Configured watchdog model '${rawModel}' was not found as '${baseModel}'.`);
  if (!ctx.modelRegistry.hasConfiguredAuth(model2)) {
    throw new Error(`Configured watchdog model '${baseModel}' is not authenticated. Configure credentials for provider '${named.provider}' or choose an authenticated model.`);
  }
  return { model: model2, modelString: resolved };
}
var WatchdogAuthError = class extends Error {
};
async function resolveReviewAuth(ctx, model2) {
  let auth;
  try {
    auth = await ctx.modelRegistry.getApiKeyAndHeaders(model2);
  } catch (error) {
    throw new WatchdogAuthError(`Watchdog model auth failed for ${fullModelId(model2)}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  if (auth.ok === false) throw new WatchdogAuthError(`Watchdog model auth failed for ${fullModelId(model2)}: ${auth.error}`);
  return {
    ...auth.apiKey ? { apiKey: auth.apiKey } : {},
    ...auth.headers ? { headers: auth.headers } : {},
    ...auth.env ? { env: auth.env } : {}
  };
}
async function resolveWatchdogReviewModel(ctx, config, options = {}) {
  if (config.main.model) {
    const resolved = resolveConfiguredModel(ctx, config.main.model);
    return {
      model: resolved.model,
      thinkingLevel: resolveReviewThinking({
        modelString: resolved.modelString,
        configThinking: config.main.thinking,
        ctx,
        allowContextThinking: false,
        currentThinkingLevel: options.currentThinkingLevel
      }),
      auth: await resolveReviewAuth(ctx, resolved.model),
      explicit: true
    };
  }
  const currentModel = ctx.model;
  if (!currentModel) {
    throw new Error("Main watchdog review cannot run because the current Pi session model is unavailable and subagents.watchdog.main.model is not configured.");
  }
  return {
    model: currentModel,
    thinkingLevel: resolveReviewThinking({
      modelString: fullModelId(currentModel),
      configThinking: config.main.thinking,
      ctx,
      allowContextThinking: true,
      currentThinkingLevel: options.currentThinkingLevel
    }),
    auth: await resolveReviewAuth(ctx, currentModel),
    explicit: false
  };
}
function nonEmptyString2(value, field) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`watchdog_warn.${field} must be a non-empty string.`);
  return trimmed;
}
function toWatchdogWarning(params) {
  return {
    severity: params.severity,
    importance: params.importance,
    category: params.category ?? "other",
    source: "main",
    summary: nonEmptyString2(params.summary, "summary"),
    evidence: nonEmptyString2(params.evidence, "evidence"),
    recommendedAction: nonEmptyString2(params.recommendedAction, "recommendedAction")
  };
}
function createWatchdogWarnTool(request) {
  return {
    name: "watchdog_warn",
    label: "Watchdog warning",
    description: [
      "Emit one actionable main-session watchdog warning.",
      "Set importance explicitly: low or medium for user-only visibility, high only when the parent model must receive the finding.",
      "Do not use for nits, praise, informational notes, or clean reviews."
    ].join(" "),
    parameters: WatchdogWarnParams,
    executionMode: "sequential",
    async execute(_toolCallId, params) {
      const warning = toWatchdogWarning(params);
      const accepted = request.emitWarning(warning);
      return {
        content: [{
          type: "text",
          text: accepted ? "Watchdog warning recorded." : "Watchdog warning was ignored by the runtime guard because it was stale, duplicate, or over budget."
        }],
        details: { accepted }
      };
    }
  };
}
function formatWatchdogCwdSection(cwd2) {
  if (/[\p{Cc}\p{Zl}\p{Zp}<>]/u.test(cwd2)) throw new Error("Watchdog cwd cannot contain control, line-separator, or angle-bracket characters.");
  return `<cwd>
${cwd2}
</cwd>`;
}
function buildWatchdogSystemPrompt(ctx, options = {}) {
  const guidance = options.guidance?.trim();
  return [
    "You are the main-session subagent watchdog for Pi.",
    "Review only the supplied parent turn delta. Inspect repository files only when needed to verify a concrete concern.",
    options.hasScope ? "Use the Current scope record alongside supplied activity evidence; an unrelated user question does not cancel older authorized work." : void 0,
    `You are read-only. You may use ${options.hasDiff ? "read, grep, find, ls, and watchdog_diff (the full repo diff since the session baseline; pass a path to narrow it)" : "read, grep, find, and ls"}. Do not edit files, run shell commands, spawn agents, or mutate state.`,
    "Emit warnings only by calling watchdog_warn. Freeform assistant text is ignored and must not be used to report warnings.",
    "Emit only actionable concerns or blockers: missed user constraints, correctness risks, test gaps that matter, unsafe changes, stale facts, loop risks, or scope drift.",
    "Do not emit nits, style preferences, unsupported guesses, informational notes, praise, or summaries.",
    "If the turn is clean, call no tools and end normally.",
    "Use severity='blocker' only when the issue should stop acceptance until addressed; otherwise use severity='concern'.",
    guidance ? `
Standing instructions from WATCHDOG.md (project first, then user):
${guidance}` : void 0,
    `
${formatWatchdogCwdSection(ctx.cwd)}`
  ].filter((line) => Boolean(line)).join("\n");
}
function buildReviewPrompt(request, selection) {
  return [
    "Review this parent-session turn delta for subagent-watchdog-worthy issues.",
    `Review id: ${request.reviewId}; epoch: ${request.epoch}; review model: ${fullModelId(selection.model)}; thinking: ${selection.thinkingLevel}.`,
    "Call watchdog_warn for each qualifying concern or blocker. Call no tools when clean.",
    "<turn_delta>",
    request.delta,
    "</turn_delta>"
  ].join("\n\n");
}
function resolveContext(provider) {
  return typeof provider === "function" ? provider() : provider;
}
function createMainWatchdogReview(provider, options = {}) {
  return async (request) => {
    const ctx = resolveContext(provider);
    if (!ctx) throw new Error("Main watchdog review cannot run without an active Pi extension context.");
    const aborted = () => ctx.signal?.aborted || request.signal?.aborted;
    if (aborted()) return { stopReason: "aborted" };
    try {
      return (await runWatchdogAttempt(ctx, request, options)).result;
    } catch (error) {
      if (error instanceof WatchdogAuthError) throw error.cause ?? error;
      throw error;
    }
  };
}
async function runWatchdogAttempt(ctx, request, options) {
  const selection = await resolveWatchdogReviewModel(ctx, request.config, {
    currentThinkingLevel: options.getThinkingLevel?.()
  });
  if (ctx.signal?.aborted || request.signal?.aborted) return { result: { stopReason: "aborted" } };
  const auth = selection.auth;
  const baseStreamFn = options.streamFn ?? ((model2, context, streamOptions) => ctx.modelRegistry.streamSimple(model2, context, streamOptions));
  const sessionId = ctx.sessionManager.getSessionId();
  const streamFn = (model2, context, streamOptions) => {
    if (clarification) throw new Error("Watchdog review yielded for clarification.");
    return baseStreamFn(model2, context, {
      ...streamOptions,
      ...auth.apiKey ? { apiKey: auth.apiKey } : {},
      env: auth.env || streamOptions?.env ? { ...auth.env ?? {}, ...streamOptions?.env ?? {} } : void 0,
      headers: { ...opencodeSessionHeaders(model2, sessionId), ...streamOptions?.headers ?? {}, ...auth.headers ?? {} }
    });
  };
  const diffBaseline = await options.diffBaseline?.();
  let clarification;
  let warned = false;
  let toolCount = 0;
  const warnRequest = request.allowClarification ? { ...request, emitWarning: (warning) => {
    if (clarification) return false;
    const accepted = request.emitWarning(warning);
    warned ||= accepted;
    return accepted;
  } } : request;
  const tools = [
    ...(options.createReadOnlyTools ?? createReadOnlyTools)(ctx.cwd).filter((tool) => WATCHDOG_ALLOWED_TOOL_NAMES.has(tool.name) && tool.name !== "watchdog_warn"),
    createWatchdogWarnTool(warnRequest),
    ...diffBaseline ? [createWatchdogDiffTool(diffBaseline)] : []
  ];
  if (request.allowClarification) tools.push({
    name: "watchdog_ask",
    label: "Watchdog clarification",
    description: "Send one focused question when missing task status, intent or other orchestrator context prevents a concrete review judgment. Yields and ends this review so the orchestrator can handle the message and continue; no answer or follow-up review is required. Never ask for approval or permission, or after recording a warning. Question and evidence are capped at 1000 and 2000 characters.",
    parameters: WatchdogAskParams,
    executionMode: "sequential",
    async execute(_id, rawParams) {
      const params = rawParams;
      if (warned || clarification || ctx.signal?.aborted || request.signal?.aborted) throw new Error("Clarification unavailable after warning, yield, or cancellation.");
      if (!params.question.trim() || !params.evidence.trim()) throw new Error("A focused question and concrete evidence are required.");
      clarification = { question: boundWatchdogReviewText(params.question.trim(), 1e3), evidence: boundWatchdogReviewText(params.evidence.trim(), 2e3) };
      agent2.abort();
      return { content: [{ type: "text", text: "Review yielded for clarification." }], details: {} };
    }
  });
  const systemPrompt = buildWatchdogSystemPrompt(ctx, {
    hasScope: request.hasScope,
    guidance: loadWatchdogGuidance(ctx.cwd, request.config.guidance.watchdogMd),
    hasDiff: diffBaseline !== void 0
  });
  const agent2 = new Agent({
    initialState: {
      systemPrompt,
      model: selection.model,
      thinkingLevel: selection.thinkingLevel,
      tools
    },
    convertToLlm,
    ...agentStreamOptions(streamFn),
    getApiKey: (providerName) => providerName === selection.model.provider ? auth.apiKey : void 0,
    beforeToolCall: async ({ toolCall }) => !clarification && (WATCHDOG_ALLOWED_TOOL_NAMES.has(toolCall.name) || request.allowClarification && toolCall.name === "watchdog_ask") ? void 0 : { block: true, reason: `Watchdog reviews are read-only; tool '${toolCall.name}' is not allowed.` },
    toolExecution: "sequential"
  });
  agent2.subscribe((event) => {
    if (event.type === "tool_execution_start") toolCount++;
  });
  const abort = () => agent2.abort();
  ctx.signal?.addEventListener("abort", abort, { once: true });
  request.signal?.addEventListener("abort", abort, { once: true });
  try {
    if (ctx.signal?.aborted || request.signal?.aborted) return { result: { stopReason: "aborted" } };
    await agent2.prompt(buildReviewPrompt(request, selection));
  } finally {
    ctx.signal?.removeEventListener("abort", abort);
    request.signal?.removeEventListener("abort", abort);
  }
  if (ctx.signal?.aborted || request.signal?.aborted) return { result: { stopReason: "aborted" } };
  const terminal = agent2.state.messages.findLast((message2) => message2.role === "assistant");
  const reason = terminal && "stopReason" in terminal ? terminal.stopReason : void 0;
  const stopReason = reason === "error" || reason === "aborted" || reason === "length" ? reason : "stop";
  const error = terminal && "errorMessage" in terminal && typeof terminal.errorMessage === "string" ? terminal.errorMessage : void 0;
  return {
    result: clarification ? { clarification } : error ? { stopReason, errorMessage: error } : { stopReason }
  };
}

export {
  SUPERVISOR_REQUEST_MESSAGE_TYPE,
  SUPERVISOR_REPLY_ENTRY_TYPE,
  parseSupervisorRequestDetails,
  parseSupervisorReplyData,
  NATIVE_SUPERVISOR_TOOL_NAME,
  resolveSupervisorChannelDir,
  CONTACT_SUPERVISOR_TOOL_NAME,
  topLevelSupervisorTool,
  registerNativeSupervisorClient,
  createNativeSupervisorChannel,
  resolveCurrentSessionId,
  resolvePiSessionId,
  WATCHDOG_DIFF_TOOL_NAME,
  captureWatchdogDiffBaseline,
  startWatchdogDiffBaselineCapture,
  createWatchdogDiffTool,
  DEFAULT_WATCHDOG_CONFIG,
  getWatchdogUserSettingsPath,
  writeUserWatchdogEnabled,
  writeWatchdogModelSettings,
  resolveWatchdogConfig,
  normalizeWatchdogWarningDetails,
  createWatchdogWarningMessage,
  applyWatchdogLaunchRules,
  sendRuleViolationWarning,
  MainWatchdogRuntime,
  resolveWatchdogReviewModel,
  formatWatchdogCwdSection,
  createMainWatchdogReview,
  SubagentFlatParams,
  SUBAGENT_OPTION_KEYS,
  SubagentOptionParams,
  createSubagentParamsSchema,
  completionReplayPath,
  readCompletionReplay,
  readCompletionArchive,
  recordWaitCompletion,
  formatResumeFirstFailedRunDetail,
  resolveWaitToolConfig,
  finalizeToolResult,
  recordedPromptSection,
  registerPinnedTool,
  setDeclarationPinning,
  registerWaitTool,
  drainOutstandingWork,
  SUBAGENT_CHILD_ENV,
  SUBAGENT_PARENT_SESSION_ENV,
  childSupervisorMetadata,
  evaluateChildToolDiagnostic
};
