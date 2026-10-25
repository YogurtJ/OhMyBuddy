import {
  ACTIVE_RUN_INDEX_DIR,
  DEFAULT_STALE_TERMINAL_ACTIVE_MARKER_MS,
  HOST_STEP_MAX_COUNT,
  HOST_STEP_MAX_DETAIL_CHARS,
  HOST_STEP_MAX_LABEL_CHARS,
  HOST_STEP_MAX_PROVIDER_CHARS,
  HOST_STEP_MAX_REASON_CHARS,
  HOST_STEP_MAX_REF_CHARS,
  HOST_STEP_MAX_ROLE_CHARS,
  HOST_STEP_MAX_TARGET_CHARS,
  TERMINAL_RUN_INDEX_DIR,
  activeRunMarkerAgeMs,
  assertWorkflowGraphHostSteps,
  attachRootChildrenToSteps,
  buildNestedRouteIndex,
  cleanupWorktrees,
  findNestedRouteForRootId,
  flatToLogicalStepIndex,
  hashedSegment,
  hostStepReportName,
  hostStepVerdictLabel,
  isActiveAsyncState,
  normalizeParallelGroups,
  normalizeWorktreeBaseRef,
  parseHostStepNode,
  projectNestedEvents,
  readActiveRunIndex,
  readProcessTerminal,
  readRecentTerminalRunIndex,
  reconcileAsyncRun,
  reconcileNestedAsyncDescendants,
  releaseActiveRunIndex,
  resultFilePath,
  resultPayloadPathForIndexedRun,
  sanitizeProcessTerminal,
  updateActiveRunIndex,
  validHostStepNodes,
  validateModelResponseAliases,
  withWorkflowChildRunModel,
  withWorktreeTransaction
} from "./chunk-46XKCPJR.js";
import {
  validateIntercomBridgeConfig
} from "./chunk-XSWOTIA3.js";
import {
  stableJsonDigest
} from "./chunk-7F6RKT6W.js";
import {
  snapshotRequiredChildExtensions
} from "./chunk-CTPAE36Y.js";
import {
  DEFAULT_FILE_SYSTEM_RETRY_DELAYS_MS,
  assertWorkflowLaneKey,
  childThinkingLevel,
  childWatchdogProgressForModel,
  formatDuration,
  formatModelThinking,
  formatTokenUsage,
  formatTokens,
  intersectThinkingCeilings,
  isDynamicParallelStep,
  isParallelStep,
  normalizeExtensionBindings,
  normalizeWorkflowLaneMetadata,
  parseThinkingLevel,
  readStatus,
  shortenPath,
  splitKnownThinkingSuffix,
  tryLease,
  validateAcceptanceInput,
  validateAsyncStatusLaneMetadata,
  validateToolBudgetConfig,
  waitForFileSystemRetry,
  writeAtomicJson
} from "./chunk-CIZQXJ5Q.js";
import {
  DIRS,
  RUNNER_LAUNCHER_NAME_PATTERN,
  TEMP_ROOT_DIR
} from "./chunk-5LFLVSTM.js";
import {
  previewDisplayText,
  sanitizeDisplayText,
  truncateDisplayText
} from "./chunk-YFCK7H2S.js";
import {
  intersectSubagentCapabilityCeilings,
  normalizeCapabilityCeilingAllowedAgents,
  parseSubagentCapabilityCeiling
} from "./chunk-Z7KVHQHL.js";

// src/shared/session-succession.ts
var SUCCESSION_KEY = /* @__PURE__ */ Symbol.for("pi-subagents.session-succession");
var MAX_INHERITED_SESSIONS = 8;
var MAX_RECORDED_SESSIONS = 64;
function successions() {
  const runtime = globalThis;
  runtime[SUCCESSION_KEY] ??= /* @__PURE__ */ new Map();
  return runtime[SUCCESSION_KEY];
}
function recordSessionReplacement(sessionId, previousSessionId) {
  const chain = [.../* @__PURE__ */ new Set([previousSessionId, ...successions().get(previousSessionId) ?? []])].filter((id) => id !== sessionId);
  successions().delete(sessionId);
  successions().set(sessionId, chain.slice(0, MAX_INHERITED_SESSIONS));
  while (successions().size > MAX_RECORDED_SESSIONS) successions().delete(successions().keys().next().value);
}
function inheritedSessionIds(sessionId) {
  return successions().get(sessionId) ?? [];
}

// src/shared/extension-context.ts
var MODEL_ONLY_TOOL = { exposure: "model-only" };
function isStaleExtensionContextError(error) {
  return error instanceof Error && /extension ctx is stale|extension context no longer active|stale after session replacement or reload/i.test(error.message);
}
function canRenderComponents(ctx) {
  return ctx.mode === "tui" || process.env.PI_SUBAGENTS_COMPONENT_UI === "1";
}
function isUnboundExtensionRuntimeError(error) {
  return error instanceof Error && /extension runtime not initialized/i.test(error.message);
}
function withCachedUiContext(ctx, onStale, run) {
  if (!ctx) return void 0;
  try {
    if (!ctx.hasUI) return void 0;
    return run(ctx);
  } catch (error) {
    if (!isStaleExtensionContextError(error)) throw error;
    onStale();
    return void 0;
  }
}

// src/shared/status-format.ts
function formatActivityAge(ms) {
  if (ms < 1e3) return "now";
  if (ms < 6e4) return `${Math.floor(ms / 1e3)}s`;
  return `${Math.floor(ms / 6e4)}m`;
}
function formatActivityLabel(lastActivityAt, activityState, now = Date.now()) {
  if (lastActivityAt === void 0) {
    if (activityState === "needs_attention") return "needs attention";
    if (activityState === "active_long_running") return "active but long-running";
    return void 0;
  }
  const age = formatActivityAge(Math.max(0, now - lastActivityAt));
  if (activityState === "needs_attention") return `no activity for ${age}`;
  if (activityState === "active_long_running") {
    const activityAge = age === "now" ? "now" : `${age} ago`;
    return `active but long-running \xB7 last activity ${activityAge}`;
  }
  return age === "now" ? "active now" : `active ${age} ago`;
}
function isCompletedStepStatus(status) {
  return status === "complete" || status === "completed";
}
function aggregateStepStatus(steps) {
  if (steps.some((step) => step.status === "running")) return "running";
  if (steps.some((step) => step.status === "failed")) return "failed";
  if (steps.some((step) => step.status === "stopped")) return "stopped";
  if (steps.some((step) => step.status === "paused")) return "paused";
  if (steps.length > 0 && steps.every((step) => isCompletedStepStatus(step.status))) return "complete";
  return "pending";
}
function formatAgentRunningLabel(count2) {
  return count2 === 1 ? "1 agent running" : `${count2} agents running`;
}
function formatParallelOutcome(steps, total, options = {}) {
  const running = steps.filter((step) => step.status === "running").length;
  const done = steps.filter((step) => isCompletedStepStatus(step.status)).length;
  const failed = steps.filter((step) => step.status === "failed").length;
  const stopped = steps.filter((step) => step.status === "stopped").length;
  const paused = steps.filter((step) => step.status === "paused").length;
  const parts = [`${done}/${total} done`];
  if (options.showRunning !== false && running > 0) parts.unshift(formatAgentRunningLabel(running));
  if (failed > 0) parts.push(`${failed} failed`);
  if (stopped > 0) parts.push(`${stopped} stopped`);
  if (paused > 0) parts.push(`${paused} paused`);
  return parts.join(" \xB7 ");
}

// src/runs/shared/nested-render.ts
function countNestedRuns(children) {
  const counts = { total: 0, running: 0, paused: 0, complete: 0, failed: 0, partial: 0, rejected: 0, stopped: 0, queued: 0 };
  for (const child of children ?? []) {
    counts.total++;
    counts[child.state]++;
    const nested = countNestedRuns([...child.children ?? [], ...child.steps?.flatMap((step) => step.children ?? []) ?? []]);
    counts.total += nested.total;
    counts.running += nested.running;
    counts.paused += nested.paused;
    counts.complete += nested.complete;
    counts.failed += nested.failed;
    counts.partial += nested.partial;
    counts.rejected += nested.rejected;
    counts.stopped += nested.stopped;
    counts.queued += nested.queued;
  }
  return counts;
}
function formatNestedAggregate(children) {
  const counts = countNestedRuns(children);
  if (counts.total === 0) return void 0;
  const parts = [
    counts.running > 0 ? `${counts.running} running` : "",
    counts.paused > 0 ? `${counts.paused} paused` : "",
    counts.failed > 0 ? `${counts.failed} failed` : "",
    counts.partial > 0 ? `${counts.partial} partial` : "",
    counts.rejected > 0 ? `${counts.rejected} rejected` : "",
    counts.stopped > 0 ? `${counts.stopped} stopped` : "",
    counts.complete > 0 ? `${counts.complete} complete` : "",
    counts.queued > 0 ? `${counts.queued} queued` : ""
  ].filter(Boolean);
  return `+${counts.total} nested run${counts.total === 1 ? "" : "s"}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}
function nestedRunLabel(run) {
  if (run.sessionName?.trim()) return run.sessionName.trim();
  if (run.agent) return run.agent;
  if (run.agents?.length) return run.agents.length === 1 ? run.agents[0] : `${run.agents.slice(0, 2).join(", ")}${run.agents.length > 2 ? ` +${run.agents.length - 2}` : ""}`;
  return run.id;
}
function formatNestedActivity(input) {
  const facts = [];
  if (input.currentTool && input.currentToolStartedAt !== void 0) facts.push(`tool ${input.currentTool} ${formatDuration(Math.max(0, Date.now() - input.currentToolStartedAt))}`);
  else if (input.currentTool) facts.push(`tool ${input.currentTool}`);
  if (input.currentPath) facts.push(shortenPath(input.currentPath));
  if (input.turnCount !== void 0) facts.push(`${input.turnCount} turns`);
  if (input.toolCount !== void 0) facts.push(`${input.toolCount} tools`);
  if (input.totalTokens) facts.push(formatTokenUsage(input.totalTokens));
  const activity = formatActivityLabel(input.lastActivityAt, input.activityState);
  return activity || facts.length ? [activity, ...facts].filter(Boolean).join(" | ") : void 0;
}
function formatNestedRunLines(children, options) {
  const lines = [];
  const append = (items, depth, indent) => {
    if (!items?.length || lines.length >= options.maxLines) return;
    if (depth > options.maxDepth) {
      const aggregate = formatNestedAggregate(items);
      if (aggregate && lines.length < options.maxLines) lines.push(`${indent}\u21B3 ${aggregate}`);
      return;
    }
    for (let index = 0; index < items.length; index++) {
      const child = items[index];
      if (lines.length >= options.maxLines) {
        const aggregate = formatNestedAggregate(items.slice(index));
        if (aggregate) lines[lines.length - 1] = `${indent}\u21B3 ${aggregate}`;
        return;
      }
      const activity = child.state === "running" ? formatNestedActivity(child) : void 0;
      const error = child.error ? ` | error: ${child.error}` : "";
      const modelThinking = formatModelThinking(child.model, child.thinking);
      lines.push(`${indent}\u21B3 ${nestedRunLabel(child)} [${child.id}] ${child.state}${modelThinking ? ` | ${modelThinking}` : ""}${activity ? ` | ${activity}` : ""}${error}`);
      if (options.commandHints && lines.length < options.maxLines) lines.push(`${indent}  Status: subagent({ action: "status", id: "${child.id}" })`);
      if (depth === options.maxDepth) {
        const aggregate = formatNestedAggregate([...child.steps?.flatMap((step) => step.children ?? []) ?? [], ...child.children ?? []]);
        if (aggregate && lines.length < options.maxLines) lines.push(`${indent}  \u21B3 ${aggregate}`);
        continue;
      }
      for (const [stepIndex, step] of (child.steps ?? []).entries()) {
        if (lines.length >= options.maxLines) return;
        const stepActivity = step.status === "running" ? formatNestedActivity(step) : void 0;
        const stepModelThinking = formatModelThinking(step.model, step.thinking);
        lines.push(`${indent}  ${stepIndex + 1}. ${step.sessionName?.trim() || step.agent} ${step.status}${stepModelThinking ? ` | ${stepModelThinking}` : ""}${stepActivity ? ` | ${stepActivity}` : ""}${step.error ? ` | error: ${step.error}` : ""}`);
        append(step.children, depth + 1, `${indent}    `);
      }
      append(child.children, depth + 1, `${indent}  `);
    }
  };
  append(children, 0, options.indent);
  return lines;
}
function formatNestedRunStatusLines(children, options = {}) {
  return formatNestedRunLines(children, {
    indent: options.indent ?? "  ",
    maxDepth: options.maxDepth ?? 2,
    maxLines: options.maxLines ?? 40,
    commandHints: options.commandHints ?? false
  });
}

// src/runs/shared/run-fanout-budget.ts
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
var RUN_FANOUT_ROOT = path.join(TEMP_ROOT_DIR, "run-fanout-budgets");
var RunFanoutLimitError = class extends Error {
  rejection;
  snapshot;
  constructor(rejection) {
    super(formatRunFanoutRejection(rejection));
    this.name = "RunFanoutLimitError";
    this.rejection = rejection;
    this.snapshot = { used: rejection.used, limit: rejection.limit, remaining: rejection.remaining };
  }
};
function safeRootRunId(rootRunId) {
  return rootRunId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || randomUUID();
}
function parseManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const manifest = value;
  if (manifest.version !== 1 || typeof manifest.rootRunId !== "string" || !manifest.rootRunId || !Number.isInteger(manifest.limit) || (manifest.limit ?? 0) <= 0 || typeof manifest.createdAt !== "number" || !Number.isFinite(manifest.createdAt)) return void 0;
  return manifest;
}
function readManifest(directory) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf-8"));
  } catch (error) {
    throw new Error(`Run fan-out budget manifest is unreadable at '${directory}': ${error instanceof Error ? error.message : String(error)}`);
  }
  const manifest = parseManifest(parsed);
  if (!manifest) throw new Error(`Run fan-out budget manifest is invalid at '${directory}'.`);
  return manifest;
}
function validateDirectory(directory) {
  let realDirectory;
  let realRoot;
  try {
    realDirectory = fs.realpathSync(path.resolve(directory));
    realRoot = fs.realpathSync(path.resolve(RUN_FANOUT_ROOT));
  } catch (error) {
    throw new Error(`Run fan-out budget directory is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (realDirectory !== realRoot && !realDirectory.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error("Run fan-out budget directory resolves outside the managed budget root.");
  }
  return realDirectory;
}
function createRunFanoutBudget(rootRunId, limit) {
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("Run fan-out limit must be a positive integer.");
  fs.mkdirSync(RUN_FANOUT_ROOT, { recursive: true, mode: 448 });
  let directory;
  do
    directory = path.join(RUN_FANOUT_ROOT, `${safeRootRunId(rootRunId)}-${randomUUID()}`);
  while (fs.existsSync(directory));
  fs.mkdirSync(path.join(directory, "claims"), { recursive: true, mode: 448 });
  const manifest = { version: 1, rootRunId, limit, createdAt: Date.now() };
  fs.writeFileSync(path.join(directory, "manifest.json"), `${JSON.stringify(manifest)}
`, { mode: 384, flag: "wx" });
  return { version: 1, rootRunId, directory, limit };
}
function validateRunFanoutBudgetDescriptor(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Run fan-out budget descriptor is missing or invalid.");
  const descriptor = value;
  if (descriptor.version !== 1 || typeof descriptor.rootRunId !== "string" || !descriptor.rootRunId || typeof descriptor.directory !== "string" || !descriptor.directory || !Number.isInteger(descriptor.limit) || (descriptor.limit ?? 0) <= 0 || descriptor.parentPath !== void 0 && typeof descriptor.parentPath !== "string") {
    throw new Error("Run fan-out budget descriptor is invalid.");
  }
  const directory = validateDirectory(descriptor.directory);
  const manifest = readManifest(directory);
  if (manifest.rootRunId !== descriptor.rootRunId || manifest.limit !== descriptor.limit) {
    throw new Error("Run fan-out budget descriptor does not match its manifest.");
  }
  return { version: 1, rootRunId: descriptor.rootRunId, directory, limit: descriptor.limit, ...descriptor.parentPath ? { parentPath: descriptor.parentPath } : {} };
}
function writeRunFanoutBudgetDescriptor(asyncDir, descriptor) {
  const valid = validateRunFanoutBudgetDescriptor(descriptor);
  fs.mkdirSync(asyncDir, { recursive: true });
  fs.writeFileSync(path.join(asyncDir, "run-fanout-budget.json"), `${JSON.stringify(valid)}
`, { mode: 384 });
}
function readRunFanoutBudgetDescriptor(asyncDir) {
  if (!asyncDir) return void 0;
  const descriptorPath = path.join(asyncDir, "run-fanout-budget.json");
  if (!fs.existsSync(descriptorPath)) return void 0;
  try {
    return validateRunFanoutBudgetDescriptor(JSON.parse(fs.readFileSync(descriptorPath, "utf-8")));
  } catch (error) {
    throw new Error(`Invalid persisted run fan-out budget '${descriptorPath}': ${error instanceof Error ? error.message : String(error)}`);
  }
}
var ADMISSION_LOCK_STALE_MS = 6e4;
function readAdmissionLockOwner(lockPath) {
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(lockPath, "owner.json"), "utf-8"));
    if (Number.isSafeInteger(owner.pid) && (owner.pid ?? 0) > 0 && typeof owner.token === "string" && owner.token) return owner;
  } catch {
  }
  return void 0;
}
function admissionLockIsStale(lockPath) {
  const owner = readAdmissionLockOwner(lockPath);
  if (owner) {
    try {
      process.kill(owner.pid, 0);
      return false;
    } catch (error) {
      return error.code !== "EPERM";
    }
  }
  try {
    return Date.now() - fs.statSync(lockPath).mtimeMs > ADMISSION_LOCK_STALE_MS;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
function withAdmissionLock(directory, operation) {
  const lockPath = path.join(directory, "admission.lock");
  const owner = { pid: process.pid, token: randomUUID() };
  for (let attempt = 0; ; attempt++) {
    try {
      fs.mkdirSync(lockPath, { mode: 448 });
      try {
        fs.writeFileSync(path.join(lockPath, "owner.json"), JSON.stringify(owner), { mode: 384 });
      } catch (error) {
        fs.rmSync(lockPath, { recursive: true, force: true });
        throw error;
      }
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (admissionLockIsStale(lockPath)) {
        const stalePath = path.join(directory, `admission.stale-${randomUUID()}`);
        try {
          fs.renameSync(lockPath, stalePath);
          fs.rmSync(stalePath, { recursive: true, force: true });
          continue;
        } catch (reclaimError) {
          if (reclaimError.code !== "ENOENT") throw reclaimError;
        }
      }
      const delay = DEFAULT_FILE_SYSTEM_RETRY_DELAYS_MS[attempt];
      if (delay === void 0) throw new Error(`Timed out acquiring run fan-out admission lock at '${directory}'.`);
      waitForFileSystemRetry(delay);
    }
  }
  try {
    return operation();
  } finally {
    if (readAdmissionLockOwner(lockPath)?.token === owner.token) fs.rmSync(lockPath, { recursive: true, force: true });
  }
}
function claimCount(directory) {
  const claimsDir = path.join(directory, "claims");
  let entries;
  try {
    entries = fs.readdirSync(claimsDir, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Run fan-out claims directory is unreadable at '${claimsDir}': ${error instanceof Error ? error.message : String(error)}`);
  }
  return entries.filter((entry) => /^\d{6}\.json$/.test(entry.name)).length;
}
function getRunFanoutBudgetSnapshot(descriptor) {
  const valid = validateRunFanoutBudgetDescriptor(descriptor);
  const used = claimCount(valid.directory);
  return { used, limit: valid.limit, remaining: Math.max(0, valid.limit - used) };
}
function qualifyRunFanoutPaths(descriptor, paths) {
  const prefix = descriptor.parentPath?.trim();
  return paths.map((item) => prefix ? `${prefix}/${item}` : item);
}
function commitRunFanoutBatch(descriptor, paths, commit) {
  const valid = validateRunFanoutBudgetDescriptor(descriptor);
  if (paths.length === 0) return commit(getRunFanoutBudgetSnapshot(valid));
  const qualified = qualifyRunFanoutPaths(valid, paths);
  return withAdmissionLock(valid.directory, () => {
    const before = getRunFanoutBudgetSnapshot(valid);
    if (qualified.length > before.remaining) {
      throw new RunFanoutLimitError({ code: "RUN_FANOUT_LIMIT", path: qualified[before.remaining] ?? qualified[0], requested: qualified.length, ...before });
    }
    const created = [];
    try {
      for (const claimPath of qualified) {
        for (let slot = 0; slot < valid.limit; slot++) {
          const slotPath = path.join(valid.directory, "claims", `${String(slot).padStart(6, "0")}.json`);
          try {
            const fd = fs.openSync(slotPath, "wx", 384);
            created.push(slotPath);
            try {
              const claim = { version: 1, claimId: randomUUID(), path: claimPath, claimedAt: Date.now() };
              fs.writeFileSync(fd, `${JSON.stringify(claim)}
`, "utf-8");
            } finally {
              fs.closeSync(fd);
            }
            break;
          } catch (error) {
            if (error.code === "EEXIST") continue;
            throw error;
          }
        }
      }
      return commit(getRunFanoutBudgetSnapshot(valid));
    } catch (error) {
      for (const slotPath of created) {
        try {
          fs.unlinkSync(slotPath);
        } catch {
        }
      }
      throw error;
    }
  });
}
function claimRunFanoutBatch(descriptor, paths) {
  return commitRunFanoutBatch(descriptor, paths, (snapshot) => snapshot);
}
function claimRunFanoutBatchWithCommit(descriptor, paths, commit) {
  return commitRunFanoutBatch(descriptor, paths, commit);
}
function formatRunFanoutBudget(snapshot) {
  return `Run fan-out: ${snapshot.used}/${snapshot.limit} used, ${snapshot.remaining} remaining`;
}
function formatRunFanoutRejection(rejection) {
  return `Run fan-out limit reached at ${rejection.path} (${rejection.used}/${rejection.limit} used; ${rejection.requested} requested, ${rejection.remaining} remaining). No children from this admission group were started. Start a new top-level run or raise config.maxSubagentSpawnsPerRun.`;
}

// src/runs/shared/context-mode.ts
function isContextMode(value) {
  return value === "fresh" || value === "fork";
}
function summarizeContextModes(modes) {
  const resolved = modes.filter(isContextMode);
  if (resolved.length === 0) return void 0;
  const first = resolved[0];
  return resolved.every((mode) => mode === first) ? first : "mixed";
}
function contextModeLabel(mode) {
  if (mode === "fork") return "[fork]";
  if (mode === "fresh") return "[fresh]";
  if (mode === "mixed") return "[mixed]";
  return "";
}
function contextModeBadge(theme, mode) {
  const label = contextModeLabel(mode);
  if (!label) return "";
  if (mode === "fork") return theme.fg("warning", ` ${label}`);
  return theme.fg("dim", ` ${label}`);
}
function contextModePrefix(theme, mode) {
  const label = contextModeLabel(mode);
  if (!label) return "";
  if (mode === "fork") return `${theme.fg("warning", label)} `;
  return `${theme.fg("dim", label)} `;
}

// src/runs/shared/child-identity.ts
function asyncStatusChildIdentity(step, index) {
  return asyncStatusChildIdentityCandidates(step, index)[0];
}
function asyncStatusChildIdentityCandidates(step, index) {
  return [...new Set([step.childId, step.workflowKey, step.runId, `step:${index}`].filter((value) => typeof value === "string" && value.length > 0))];
}
function resolveAsyncStatusChild(status, childId, options = {}) {
  const matches = [];
  for (const [index, step] of (status.steps ?? []).entries()) {
    if (asyncStatusChildIdentityCandidates(step, index).includes(childId)) {
      matches.push({ index, step, id: asyncStatusChildIdentity(step, index) });
    }
    if (options.includeNested) {
      const findNested = (children) => {
        for (const nested of children ?? []) {
          if (nested.id === childId) matches.push({ index, step, id: nested.id, nested });
          findNested(nested.children);
        }
      };
      findNested(step.children);
    }
  }
  if (matches.length === 1) return { ok: true, child: matches[0] };
  if (matches.length > 1) return { ok: false, code: "ambiguous", message: `Child '${childId}' is ambiguous under async run '${status.runId}'.` };
  return { ok: false, code: "not_found", message: `Child '${childId}' was not found under async run '${status.runId}'.` };
}
function isStoppableAsyncStatusStep(step) {
  return step.status === "pending" || step.status === "running";
}
function stopStoppableAsyncStatusChildren(status, stopChild, message) {
  if (!stopChild) return;
  for (const [index, step] of (status.steps ?? []).entries()) {
    if (isStoppableAsyncStatusStep(step)) stopChild(asyncStatusChildIdentity(step, index), message);
  }
}

// src/workflows/workflow-child-summary.ts
var KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
var TERMINAL_STATES = /* @__PURE__ */ new Set(["completed", "failed", "paused", "stopped", "rejected", "detached"]);
var MAX_REQUIRED_ID_BYTES = 4096;
var ACTIVITY_COUNTERS = ["currentToolStartedAt", "lastActivityAt", "durationMs", "toolCount", "turnCount", "tokens", "inputTokens", "outputTokens"];
function workflowChildProgress(progress) {
  return {
    ...workflowChildActivity(progress),
    agent: bounded(progress.agent, 256) ?? "",
    ...bounded(progress.sessionName, 256) ? { sessionName: progress.sessionName } : {},
    ...bounded(progress.model, 256) ? { model: progress.model } : {},
    ...bounded(progress.thinking, 32) ? { thinking: progress.thinking } : {}
  };
}
function workflowChildActivity(progress) {
  const activity = {};
  if (bounded(progress.currentTool, 256)) activity.currentTool = progress.currentTool;
  for (const field of ACTIVITY_COUNTERS) {
    const value = progress[field];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) activity[field] = value;
  }
  return activity;
}
function parseActivity(value) {
  if (value === void 0) return void 0;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("workflowChildren child activity is invalid.");
  const input = value;
  for (const [key, value2] of Object.entries(input)) {
    if (key === "currentTool" ? !bounded(value2, 256) : !ACTIVITY_COUNTERS.includes(key) || typeof value2 !== "number" || !Number.isFinite(value2) || value2 < 0) throw new Error("workflowChildren child activity is invalid.");
  }
  return { ...input };
}
function bounded(value, maxBytes) {
  if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value, "utf8") > maxBytes) return void 0;
  return value;
}
function requiredId(value, label) {
  const id = bounded(value, MAX_REQUIRED_ID_BYTES);
  if (!id) throw new Error(`${label} must be a non-empty identifier of at most ${MAX_REQUIRED_ID_BYTES} UTF-8 bytes.`);
  return id;
}
function parentToolCallId(value, label) {
  if (typeof value === "string" && value.trim() && Buffer.byteLength(value, "utf8") > MAX_REQUIRED_ID_BYTES) return hashedSegment(value);
  return requiredId(value, label);
}
function workflowChildSummary(input) {
  const rows = /* @__PURE__ */ new Map();
  const runningAsyncKeys = new Set(input.children?.filter((child) => child.state === "running").map((child) => child.key));
  for (const entry of input.trace ?? []) {
    if (entry.operation !== "run" || !KEY_PATTERN.test(entry.key)) continue;
    const previous = rows.get(entry.key);
    const state = entry.state === "completed" ? "completed" : entry.state === "failed" ? "failed" : entry.state === "stopped" ? "stopped" : entry.state === "detached" ? "detached" : previous?.state ?? "running";
    rows.set(entry.key, {
      childId: entry.key,
      state,
      ...bounded(entry.runId, 256) ? { runId: bounded(entry.runId, 256) } : {},
      ...previous?.agent ? { agent: previous.agent } : {},
      ...previous?.sessionName ? { sessionName: previous.sessionName } : {},
      ...previous?.model ? { model: previous.model } : {},
      ...previous?.thinking ? { thinking: previous.thinking } : {}
    });
  }
  for (const step of input.steps ?? []) {
    const key = step.workflowKey;
    if (!key || !KEY_PATTERN.test(key)) continue;
    if (step.async && step.runId && step.status === "running") runningAsyncKeys.add(key);
    const state = step.status === "complete" || step.status === "completed" ? "completed" : step.status === "failed" ? "failed" : step.status === "paused" ? "paused" : step.status === "stopped" ? "stopped" : step.status === "rejected" ? "rejected" : step.status === "pending" ? "pending" : "running";
    const launchResolved = step.async !== void 0 || step.sessionFile !== void 0 || step.runId !== void 0 || step.model !== void 0;
    rows.set(key, {
      childId: key,
      state,
      ...bounded(step.runId, 256) ? { runId: bounded(step.runId, 256) } : {},
      ...launchResolved && bounded(step.agent, 256) ? { agent: bounded(step.agent, 256) } : {},
      ...bounded(step.sessionName, 256) ? { sessionName: bounded(step.sessionName, 256) } : {},
      ...bounded(step.model, 256) ? { model: bounded(step.model, 256) } : {},
      ...bounded(step.thinking, 32) ? { thinking: bounded(step.thinking, 32) } : {}
    });
  }
  for (const child of input.children ?? []) {
    if (!KEY_PATTERN.test(child.key)) continue;
    const result = Array.isArray(child.results) ? child.results.find((value) => value && typeof value === "object") : void 0;
    const state = child.state === "running" ? "running" : child.detached ? "detached" : child.stopped ? "stopped" : child.interrupted ? "paused" : child.ok ? "completed" : result?.acceptance && typeof result.acceptance === "object" && result.acceptance.status === "rejected" ? "rejected" : "failed";
    rows.set(child.key, {
      childId: child.key,
      state,
      ...bounded(child.runId, 256) ? { runId: bounded(child.runId, 256) } : {},
      ...bounded(child.agent, 256) ? { agent: bounded(child.agent, 256) } : {},
      ...bounded(result?.sessionName, 256) ? { sessionName: bounded(result?.sessionName, 256) } : {},
      ...bounded(result?.model, 256) ? { model: bounded(result?.model, 256) } : {},
      ...bounded(result?.thinking, 32) ? { thinking: bounded(result?.thinking, 32) } : {}
    });
  }
  if (input.inventoryComplete) {
    for (const [key, row] of rows) {
      if (!TERMINAL_STATES.has(row.state) && !runningAsyncKeys.has(key)) rows.set(key, { ...row, state: input.workflowState === "stopped" ? "stopped" : "failed" });
    }
  }
  for (const [key, launch] of input.launches ?? []) {
    const row = rows.get(key);
    if (!row || row.state !== "running") continue;
    rows.set(key, {
      ...row,
      ...!row.runId && bounded(launch.runId, 256) ? { runId: launch.runId } : {},
      ...!row.agent && bounded(launch.agent, 256) ? { agent: launch.agent } : {}
    });
  }
  for (const [key, progress] of input.progress ?? []) {
    const row = rows.get(key);
    if (!row || row.state !== "running") continue;
    rows.set(key, {
      ...row,
      ...bounded(progress.agent, 256) ? { agent: progress.agent } : {},
      ...bounded(progress.sessionName, 256) ? { sessionName: progress.sessionName } : {},
      ...bounded(progress.model, 256) ? { model: progress.model } : {},
      ...bounded(progress.thinking, 32) ? { thinking: progress.thinking } : {},
      activity: workflowChildActivity(progress)
    });
  }
  return {
    version: 1,
    parentToolCallId: parentToolCallId(input.parentToolCallId, "parentToolCallId"),
    workflowRunId: requiredId(input.workflowRunId, "workflowRunId"),
    inventoryComplete: input.inventoryComplete,
    workflowState: input.workflowState,
    children: [...rows.values()]
  };
}
function parseWorkflowChildSummary(value) {
  if (value === void 0) return void 0;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("workflowChildren must be an object.");
  const input = value;
  const allowed = /* @__PURE__ */ new Set(["version", "parentToolCallId", "workflowRunId", "inventoryComplete", "workflowState", "children"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error("workflowChildren has unsupported fields.");
  if (input.version !== 1 || typeof input.inventoryComplete !== "boolean" || !Array.isArray(input.children)) throw new Error("workflowChildren is invalid.");
  const workflowState = input.workflowState;
  if (workflowState !== "queued" && workflowState !== "running" && workflowState !== "completed" && workflowState !== "failed" && workflowState !== "paused" && workflowState !== "stopped") throw new Error("workflowChildren.workflowState is invalid.");
  const children = input.children.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("workflowChildren child row is invalid.");
    const child = row;
    if (Object.keys(child).some((key) => !["childId", "runId", "agent", "sessionName", "model", "thinking", "state", "activity"].includes(key))) throw new Error("workflowChildren child row has unsupported fields.");
    if (typeof child.childId !== "string" || !KEY_PATTERN.test(child.childId)) throw new Error("workflowChildren childId is invalid.");
    const state = child.state;
    if (state !== "pending" && state !== "running" && state !== "completed" && state !== "failed" && state !== "paused" && state !== "stopped" && state !== "rejected" && state !== "detached") throw new Error("workflowChildren child state is invalid.");
    for (const [field, maxBytes] of [["runId", 256], ["agent", 256], ["sessionName", 256], ["model", 256], ["thinking", 32]]) {
      if (child[field] !== void 0 && bounded(child[field], maxBytes) === void 0) throw new Error(`workflowChildren child ${field} is invalid.`);
    }
    const activity = parseActivity(child.activity);
    if (activity && state !== "running") throw new Error("workflowChildren child activity requires running state.");
    return { childId: child.childId, state, ...activity ? { activity } : {}, ...child.runId ? { runId: child.runId } : {}, ...child.agent ? { agent: child.agent } : {}, ...child.sessionName ? { sessionName: child.sessionName } : {}, ...child.model ? { model: child.model } : {}, ...child.thinking ? { thinking: child.thinking } : {} };
  });
  if (new Set(children.map((child) => child.childId)).size !== children.length) throw new Error("workflowChildren has duplicate childId values.");
  if (typeof input.parentToolCallId !== "string") throw new Error("workflowChildren.parentToolCallId is invalid.");
  if (typeof input.workflowRunId !== "string") throw new Error("workflowChildren.workflowRunId is invalid.");
  return { version: 1, parentToolCallId: parentToolCallId(input.parentToolCallId, "workflowChildren.parentToolCallId"), workflowRunId: requiredId(input.workflowRunId, "workflowChildren.workflowRunId"), inventoryComplete: input.inventoryComplete, workflowState, children };
}

// src/workflows/workflow-preflight.ts
var WORKFLOW_PREFLIGHT_VERSION = 1;
var WORKFLOW_PREFLIGHT_MAX_LANES = 64;
var WORKFLOW_PREFLIGHT_MAX_STRING_LENGTH = 256;
var WORKFLOW_PREFLIGHT_MAX_CLAIMS = 16;
var WORKFLOW_PREFLIGHT_MAX_DEPTH = 3;
var WORKFLOW_PREFLIGHT_MAX_BYTES = 16 * 1024;
var WORKFLOW_PREFLIGHT_MAX_WARNINGS = 16;
var WORKFLOW_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
var PREFLIGHT_FIELDS = /* @__PURE__ */ new Set(["version", "coverage", "lanes"]);
var LANE_FIELDS = /* @__PURE__ */ new Set(["key", "mode", "decision", "claims", "expectedOutput", "independence"]);
var PREFLIGHT_MODES = /* @__PURE__ */ new Set(["mutation", "review", "scout", "gate"]);
function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function assertPlainObject(value, path7) {
  if (!isPlainObject(value)) throw new Error(`${path7} must be a plain JSON object.`);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new Error(`${path7} must not contain symbol keys.`);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable || !("value" in descriptor)) throw new Error(`${path7}.${key} must be an enumerable data property.`);
  }
}
function assertKnownFields(value, allowed, path7) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${path7} contains unsupported field '${key}'.`);
  }
}
function normalizeDisplayString(value, path7) {
  if (typeof value !== "string") throw new Error(`${path7} must be a string.`);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error(`${path7} must be a non-empty string.`);
  if (normalized.length > WORKFLOW_PREFLIGHT_MAX_STRING_LENGTH) {
    throw new Error(`${path7} exceeds the maximum length of ${WORKFLOW_PREFLIGHT_MAX_STRING_LENGTH}.`);
  }
  return normalized;
}
function normalizeLane(value, index) {
  const path7 = `preflight.lanes[${index}]`;
  assertPlainObject(value, path7);
  assertKnownFields(value, LANE_FIELDS, path7);
  const key = normalizeDisplayString(value.key, `${path7}.key`);
  if (!WORKFLOW_KEY_PATTERN.test(key)) throw new Error(`${path7}.key must be 1-128 characters using letters, numbers, '.', '_' or '-', and start with a letter or number.`);
  let mode;
  if (value.mode !== void 0) {
    if (typeof value.mode !== "string" || !PREFLIGHT_MODES.has(value.mode)) {
      throw new Error(`${path7}.mode must be one of: mutation, review, scout, gate.`);
    }
    mode = value.mode;
  }
  let claims;
  if (value.claims !== void 0) {
    if (!Array.isArray(value.claims)) throw new Error(`${path7}.claims must be an array of strings.`);
    if (value.claims.length > WORKFLOW_PREFLIGHT_MAX_CLAIMS) throw new Error(`${path7}.claims supports at most ${WORKFLOW_PREFLIGHT_MAX_CLAIMS} entries.`);
    claims = value.claims.map((claim, claimIndex) => normalizeDisplayString(claim, `${path7}.claims[${claimIndex}]`));
    for (let claimIndex = 0; claimIndex < value.claims.length; claimIndex += 1) {
      if (!Object.prototype.hasOwnProperty.call(value.claims, claimIndex)) throw new Error(`${path7}.claims must not contain sparse arrays.`);
    }
  }
  return {
    key,
    ...mode ? { mode } : {},
    ...value.decision !== void 0 ? { decision: normalizeDisplayString(value.decision, `${path7}.decision`) } : {},
    ...claims ? { claims } : {},
    ...value.expectedOutput !== void 0 ? { expectedOutput: normalizeDisplayString(value.expectedOutput, `${path7}.expectedOutput`) } : {},
    ...value.independence !== void 0 ? { independence: normalizeDisplayString(value.independence, `${path7}.independence`) } : {}
  };
}
function normalizeWorkflowPreflight(input) {
  if (input === void 0) return void 0;
  assertPlainObject(input, "preflight");
  assertKnownFields(input, PREFLIGHT_FIELDS, "preflight");
  if (input.version !== WORKFLOW_PREFLIGHT_VERSION) throw new Error(`preflight.version must be ${WORKFLOW_PREFLIGHT_VERSION}.`);
  const coverage = input.coverage === void 0 ? "partial" : input.coverage;
  if (coverage !== "complete" && coverage !== "partial") throw new Error("preflight.coverage must be 'complete' or 'partial'.");
  if (!Array.isArray(input.lanes)) throw new Error("preflight.lanes must be an array.");
  if (input.lanes.length > WORKFLOW_PREFLIGHT_MAX_LANES) throw new Error(`preflight.lanes supports at most ${WORKFLOW_PREFLIGHT_MAX_LANES} lanes.`);
  for (let index = 0; index < input.lanes.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(input.lanes, index)) throw new Error("preflight.lanes must not contain sparse arrays.");
  }
  const lanes = input.lanes.map(normalizeLane);
  const seenKeys = /* @__PURE__ */ new Set();
  for (const lane of lanes) {
    if (seenKeys.has(lane.key)) throw new Error(`preflight.lanes contains duplicate key '${lane.key}'.`);
    seenKeys.add(lane.key);
  }
  const normalized = { version: WORKFLOW_PREFLIGHT_VERSION, coverage, lanes };
  const depth = 1 + (lanes.length > 0 ? 1 : 0) + (lanes.some((lane) => lane.claims !== void 0) ? 1 : 0);
  if (depth > WORKFLOW_PREFLIGHT_MAX_DEPTH) throw new Error(`preflight exceeds the maximum nesting depth of ${WORKFLOW_PREFLIGHT_MAX_DEPTH}.`);
  const bytes = Buffer.byteLength(JSON.stringify(normalized), "utf8");
  if (bytes > WORKFLOW_PREFLIGHT_MAX_BYTES) throw new Error(`preflight canonical JSON is ${bytes} bytes; maximum is ${WORKFLOW_PREFLIGHT_MAX_BYTES}.`);
  return normalized;
}
function warningLimit(messages) {
  if (messages.length <= WORKFLOW_PREFLIGHT_MAX_WARNINGS) return messages;
  const omitted = messages.length - WORKFLOW_PREFLIGHT_MAX_WARNINGS + 1;
  return [...messages.slice(0, WORKFLOW_PREFLIGHT_MAX_WARNINGS - 1), `Preflight advisory: ${omitted} additional mismatch warning(s) omitted.`];
}
function declaredKeys(preflight) {
  return new Set(preflight.lanes.map((lane) => lane.key));
}
function workflowKeyMatchesPreflightLane(key, laneKey, generatedLaneKey) {
  return generatedLaneKey === laneKey || key === laneKey || key.startsWith(`${laneKey}.`);
}
function workflowPreflightLaneForRuntimeKey(preflight, key, preferredKeys = []) {
  const lanes = preflight?.lanes;
  if (!lanes) return void 0;
  const exact = lanes.find((lane) => lane.key === key);
  if (exact) return exact;
  let closestRoot;
  for (const lane of lanes) {
    if (key.startsWith(`${lane.key}.`) && (!closestRoot || lane.key.length > closestRoot.key.length)) closestRoot = lane;
  }
  if (closestRoot) return closestRoot;
  for (const preferredKey of preferredKeys) {
    if (!preferredKey) continue;
    const preferred = lanes.find((lane) => lane.key === preferredKey);
    if (preferred) return preferred;
  }
  return void 0;
}
function declaredLaneCoversWorkflowKey(entry, laneKey) {
  return workflowKeyMatchesPreflightLane(entry.key, laneKey, entry.generatedLaneKey);
}
function keyCoveredByDeclaredLane(entry, declared) {
  for (const laneKey of declared) if (declaredLaneCoversWorkflowKey(entry, laneKey)) return true;
  return false;
}
function launchedEntries(trace) {
  const entries = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of trace) {
    if (entry.operation !== "run" || entry.phase === "auto-resume" || seen.has(entry.key)) continue;
    seen.add(entry.key);
    entries.push(entry);
  }
  return entries;
}
function undeclaredWarning(key) {
  return `Preflight advisory: workflow key '${key}' launched without a declared lane.`;
}
function unlaunchedWarning(key) {
  return `Preflight advisory: declared lane '${key}' was not launched.`;
}
function workflowPreflightWarnings(preflight, trace, options = {}) {
  if (!preflight) return [];
  const declared = declaredKeys(preflight);
  const launched = launchedEntries(trace);
  const messages = launched.filter((entry) => !keyCoveredByDeclaredLane(entry, declared)).map((entry) => undeclaredWarning(entry.key));
  if (options.settled === true) {
    for (const lane of preflight.lanes) if (!launched.some((entry) => declaredLaneCoversWorkflowKey(entry, lane.key))) messages.push(unlaunchedWarning(lane.key));
  }
  return warningLimit(messages);
}
function annotateWorkflowPreflightTrace(trace, preflight) {
  if (!preflight) return [...trace];
  const declared = declaredKeys(preflight);
  const warned = /* @__PURE__ */ new Set();
  return trace.map((entry) => {
    if (entry.operation !== "run" || entry.phase === "auto-resume" || keyCoveredByDeclaredLane(entry, declared) || warned.has(entry.key)) return entry;
    warned.add(entry.key);
    return { ...entry, warning: entry.warning ?? undeclaredWarning(entry.key) };
  });
}
function laneCell(value) {
  return value ?? "\u2014";
}
var WORKFLOW_PREFLIGHT_PLAN_LABEL_LENGTH = 96;
function planLaneLabel(lane) {
  const value = lane.decision?.trim() || lane.key;
  if (value.length <= WORKFLOW_PREFLIGHT_PLAN_LABEL_LENGTH) return value;
  return `${value.slice(0, WORKFLOW_PREFLIGHT_PLAN_LABEL_LENGTH - 1).trimEnd()}\u2026`;
}
function formatWorkflowPreflight(preflight, options = {}) {
  if (!preflight) return "";
  const indent = options.indent ?? "";
  const count2 = preflight.lanes.length;
  const lines = [
    `${indent}Preflight: v${preflight.version} \xB7 ${preflight.coverage} \xB7 ${count2} lane${count2 === 1 ? "" : "s"}`,
    `${indent}  key | mode | decision | claims | expected output | independence`
  ];
  for (const lane of preflight.lanes) {
    lines.push(`${indent}  ${[
      lane.key,
      laneCell(lane.mode),
      laneCell(lane.decision),
      lane.claims?.join(", ") ?? "\u2014",
      laneCell(lane.expectedOutput),
      laneCell(lane.independence)
    ].join(" | ")}`);
  }
  return lines.join("\n");
}
function formatWorkflowPreflightSummary(preflight) {
  if (!preflight) return "";
  const keys = preflight.lanes.slice(0, 4).map((lane) => lane.key).join(", ");
  const remainder = preflight.lanes.length > 4 ? `, +${preflight.lanes.length - 4}` : "";
  return `preflight \xB7 ${preflight.coverage} \xB7 ${preflight.lanes.length} lane${preflight.lanes.length === 1 ? "" : "s"}${keys ? `: ${keys}${remainder}` : ""}`;
}
function formatWorkflowPreflightPlanSummary(preflight, options = {}) {
  if (!preflight) return "";
  const indent = options.indent ?? "";
  const count2 = preflight.lanes.length;
  const labels = count2 === 1 ? planLaneLabel(preflight.lanes[0]) : preflight.lanes.slice(0, 4).map((lane) => lane.key).join(", ") + (count2 > 4 ? `, +${count2 - 4}` : "");
  return `${indent}Plan: ${count2} lane${count2 === 1 ? "" : "s"}${labels ? ` \xB7 ${labels}` : ""}`;
}
function formatWorkflowPreflightWarningSummary(warnings, options = {}) {
  if (!warnings?.length) return "";
  const indent = options.indent ?? "";
  const hint = options.hint ?? "details available for debug";
  const count2 = warnings.length;
  return `${indent}Plan note: ${count2} preflight mismatch${count2 === 1 ? "" : "es"} \xB7 ${hint}.`;
}
function formatWorkflowPreflightWarnings(warnings, options = {}) {
  if (!warnings?.length) return "";
  const indent = options.indent ?? "";
  return [`${indent}Preflight warnings:`, ...warnings.map((warning) => `${indent}  - ${warning.replace(/\s+/g, " ").trim()}`)].join("\n");
}

// src/runs/background/async-status.ts
import * as fs3 from "node:fs";
import * as path3 from "node:path";

// src/runs/background/run-id-query.ts
var MIN_SAFE_ASYNC_RUN_PREFIX_LENGTH = 8;
var FULL_ASYNC_RUN_ID_LENGTH = 36;
function canScanAsyncRunPrefix(id) {
  return id.length >= MIN_SAFE_ASYNC_RUN_PREFIX_LENGTH && id.length < FULL_ASYNC_RUN_ID_LENGTH;
}

// src/runs/shared/workflow-graph.ts
function workflowGraphStageNodes(graph) {
  const nodes = graph?.nodes;
  if (!nodes?.length) return [];
  const stages = [];
  const visit = (node) => {
    if (node.kind === "parallel-group" || node.kind === "dynamic-parallel-group") {
      for (const child of node.children ?? []) visit(child);
      return;
    }
    if (node.kind !== "host-step") stages.push(node);
  };
  for (const node of nodes) visit(node);
  return stages;
}
function normalizeStatus(status) {
  switch (status) {
    case "complete":
    case "completed":
      return "completed";
    case "running":
      return "running";
    case "failed":
      return "failed";
    case "paused":
      return "paused";
    case "detached":
      return "detached";
    case "rejected":
      return "rejected";
    case "pending":
      return "pending";
    default:
      return void 0;
  }
}
function resultStatus(result) {
  if (!result) return void 0;
  if (result.detached) return "detached";
  if (result.interrupted) return "paused";
  return result.exitCode === 0 ? "completed" : "failed";
}
function nodeStatus(input, flatIndex) {
  return normalizeStatus(input.stepStatuses?.[flatIndex]?.status) ?? resultStatus(input.results?.[flatIndex]) ?? (input.currentFlatIndex === flatIndex ? "running" : "pending");
}
function pushPhase(phases, phase, nodeId) {
  if (!phase) return;
  let group = phases.find((candidate) => candidate.title === phase);
  if (!group) {
    group = { title: phase, nodeIds: [] };
    phases.push(group);
  }
  group.nodeIds.push(nodeId);
}
function seqLabel(step, stepIndex) {
  return step.label?.trim() || step.agent || `Step ${stepIndex + 1}`;
}
function summarizeParallelStatuses(statuses) {
  if (statuses.some((status) => status === "running")) return "running";
  if (statuses.some((status) => status === "rejected")) return "rejected";
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "paused")) return "paused";
  if (statuses.some((status) => status === "detached")) return "detached";
  if (statuses.length > 0 && statuses.every((status) => status === "completed")) return "completed";
  if (statuses.some((status) => status === "completed")) return "running";
  return "pending";
}
function buildWorkflowGraphSnapshot(input) {
  const nodes = [];
  const phases = [];
  let flatIndex = 0;
  let currentNodeId;
  for (let stepIndex = 0; stepIndex < input.steps.length; stepIndex++) {
    const step = input.steps[stepIndex];
    if (isParallelStep(step)) {
      const groupId = `step-${stepIndex}`;
      const children = [];
      const childStatuses = [];
      for (let taskIndex = 0; taskIndex < step.parallel.length; taskIndex++) {
        const task = step.parallel[taskIndex];
        const status2 = nodeStatus(input, flatIndex);
        childStatuses.push(status2);
        const childId = `step-${stepIndex}-agent-${taskIndex}`;
        const child = {
          id: childId,
          kind: "agent",
          agent: task.agent,
          phase: task.phase,
          label: task.label?.trim() || task.agent || `Agent ${taskIndex + 1}`,
          status: status2,
          flatIndex,
          stepIndex,
          outputName: task.as,
          structured: Boolean(task.outputSchema),
          acceptanceStatus: input.results?.[flatIndex]?.acceptance?.status,
          error: input.stepStatuses?.[flatIndex]?.error ?? input.results?.[flatIndex]?.error
        };
        children.push(child);
        pushPhase(phases, task.phase, childId);
        if (status2 === "running" || input.currentFlatIndex === flatIndex) currentNodeId = childId;
        flatIndex++;
      }
      const groupStatus = summarizeParallelStatuses(childStatuses);
      if (input.currentStepIndex === stepIndex && !currentNodeId) currentNodeId = groupId;
      nodes.push({
        id: groupId,
        kind: "parallel-group",
        label: step.parallel.length === 1 ? "Parallel task" : `Parallel group (${step.parallel.length})`,
        status: groupStatus,
        stepIndex,
        children
      });
      continue;
    }
    if (isDynamicParallelStep(step)) {
      const groupId = `step-${stepIndex}`;
      const materialized = input.dynamicChildren?.[stepIndex] ?? [];
      const groupOverride = input.dynamicGroupStatuses?.[stepIndex];
      const children = [];
      const childStatuses = [];
      for (let taskIndex = 0; taskIndex < materialized.length; taskIndex++) {
        const task = materialized[taskIndex];
        const status2 = nodeStatus(input, task.flatIndex);
        childStatuses.push(status2);
        const childId = `step-${stepIndex}-item-${task.itemKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
        const child = {
          id: childId,
          kind: "agent",
          agent: task.agent,
          phase: step.parallel.phase ?? step.phase,
          label: task.label?.trim() || step.parallel.label?.trim() || `${task.agent} ${task.itemKey}`,
          status: status2,
          flatIndex: task.flatIndex,
          stepIndex,
          itemKey: task.itemKey,
          outputName: task.outputName,
          structured: task.structured,
          acceptanceStatus: input.results?.[task.flatIndex]?.acceptance?.status,
          error: input.stepStatuses?.[task.flatIndex]?.error ?? input.results?.[task.flatIndex]?.error ?? task.error
        };
        children.push(child);
        pushPhase(phases, child.phase, childId);
        if (status2 === "running" || input.currentFlatIndex === task.flatIndex) currentNodeId = childId;
      }
      const groupStatus = groupOverride?.status ?? (children.length > 0 ? summarizeParallelStatuses(childStatuses) : input.currentStepIndex === stepIndex ? "running" : "pending");
      if (input.currentStepIndex === stepIndex && !currentNodeId) currentNodeId = groupId;
      nodes.push({
        id: groupId,
        kind: "dynamic-parallel-group",
        label: step.label?.trim() || step.parallel.label?.trim() || `Dynamic fanout (${step.collect.as})`,
        status: groupStatus,
        stepIndex,
        outputName: step.collect.as,
        structured: Boolean(step.collect.outputSchema),
        acceptanceStatus: groupOverride?.acceptance?.status,
        error: groupOverride?.error,
        dynamic: {
          sourceOutput: step.expand.from.output,
          sourcePath: step.expand.from.path,
          itemName: step.expand.item ?? "item",
          maxItems: step.expand.maxItems,
          collectAs: step.collect.as
        },
        children
      });
      if (materialized.length > 0) flatIndex = Math.max(flatIndex, ...materialized.map((child) => child.flatIndex + 1));
      continue;
    }
    const seq = step;
    const status = nodeStatus(input, flatIndex);
    const id = `step-${stepIndex}`;
    nodes.push({
      id,
      kind: "step",
      agent: seq.agent,
      phase: seq.phase,
      label: seqLabel(seq, stepIndex),
      status,
      flatIndex,
      stepIndex,
      outputName: seq.as,
      structured: Boolean(seq.outputSchema),
      acceptanceStatus: input.results?.[flatIndex]?.acceptance?.status,
      error: input.stepStatuses?.[flatIndex]?.error ?? input.results?.[flatIndex]?.error
    });
    pushPhase(phases, seq.phase, id);
    if (status === "running" || input.currentFlatIndex === flatIndex || input.currentStepIndex === stepIndex) currentNodeId = id;
    flatIndex++;
  }
  return {
    runId: input.runId,
    mode: input.mode ?? "chain",
    phases,
    nodes,
    currentNodeId
  };
}

// src/runs/shared/async-status-projection.ts
var ASYNC_STATUS_SNAPSHOT_KIND = "pi-subagents.async-status-snapshot";
var ASYNC_STATUS_SNAPSHOT_VERSION = 1;
var DEFAULT_MAX_RUNS = 20;
var DEFAULT_MAX_CHILDREN_PER_NODE = 8;
var DEFAULT_MAX_DEPTH = 3;
var DEFAULT_MAX_STRING_LENGTH = 160;
var DEFAULT_MAX_SERIALIZED_BYTES = 32 * 1024;
var ASYNC_STATUS_SNAPSHOT_STATES = {
  queued: true,
  running: true,
  complete: true,
  failed: true,
  partial: true,
  paused: true,
  stopped: true,
  rejected: true
};
function isAsyncStatusSnapshotState(value) {
  return Object.hasOwn(ASYNC_STATUS_SNAPSHOT_STATES, value);
}
function validHostStepList(source) {
  if (source && "nodes" in source) return validHostStepNodes(source);
  const hostSteps = [];
  for (const [index, value] of (source ?? []).slice(0, HOST_STEP_MAX_COUNT).entries()) {
    try {
      hostSteps.push(parseHostStepNode(value, `hostSteps[${index}]`));
    } catch {
    }
  }
  return hostSteps;
}
function resolveCaps(options) {
  return {
    maxRuns: Math.max(0, Math.floor(options.maxRuns ?? DEFAULT_MAX_RUNS)),
    maxChildrenPerNode: Math.max(0, Math.floor(options.maxChildrenPerNode ?? DEFAULT_MAX_CHILDREN_PER_NODE)),
    maxDepth: Math.max(0, Math.floor(options.maxDepth ?? DEFAULT_MAX_DEPTH)),
    maxStringLength: Math.max(0, Math.floor(options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH)),
    maxSerializedBytes: Math.max(256, Math.floor(options.maxSerializedBytes ?? DEFAULT_MAX_SERIALIZED_BYTES))
  };
}
function publicText(value, fallback, maxLength) {
  if (typeof value !== "string") return fallback;
  const normalized = sanitizeDisplayText(value.slice(0, Math.max(0, maxLength * 4)));
  return truncateDisplayText(normalized || fallback, maxLength);
}
function publicOptionalText(value, maxLength) {
  if (typeof value !== "string") return void 0;
  const normalized = sanitizeDisplayText(value.slice(0, Math.max(0, maxLength * 4)));
  return normalized ? truncateDisplayText(normalized, maxLength) : void 0;
}
function publicTime(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
}
function publicCount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
}
function normalizeState(value) {
  if (value === "completed") return "complete";
  if (value === "pending") return "queued";
  if (isAsyncStatusSnapshotState(value)) return value;
  return "partial";
}
function terminalState(state) {
  return state === "complete" || state === "failed" || state === "partial" || state === "paused" || state === "stopped" || state === "rejected";
}
function kindForMode(mode) {
  return mode === "workflow" ? "workflow" : "subagent";
}
function labelForAgents(agents, fallback, maxLength) {
  if (!agents?.length) return publicText(fallback, fallback, maxLength);
  const visible = agents.slice(0, 3).map((agent) => publicText(agent, "agent", maxLength)).join(", ");
  const suffix = agents.length > 3 ? `, +${agents.length - 3} more` : "";
  return truncateDisplayText(`${visible}${suffix}`, maxLength);
}
function activityFor(source, ctx) {
  const currentTool = publicOptionalText(source.currentTool, ctx.caps.maxStringLength);
  const lastActivityAt = publicTime(source.lastActivityAt);
  const currentToolStartedAt = publicTime(source.currentToolStartedAt);
  const turnCount = publicCount(source.turnCount);
  const toolCount = publicCount(source.toolCount);
  const activity = {
    ...typeof source.activityState === "string" ? { state: publicText(source.activityState, "unknown", ctx.caps.maxStringLength) } : {},
    ...currentTool ? { currentTool } : {},
    ...lastActivityAt !== void 0 ? { lastActivityAt } : {},
    ...currentToolStartedAt !== void 0 ? { currentToolStartedAt } : {},
    ...turnCount !== void 0 ? { turnCount } : {},
    ...toolCount !== void 0 ? { toolCount } : {}
  };
  return Object.keys(activity).length ? activity : void 0;
}
function setStepModel(node, ctx, ...sources) {
  const { baseModel, thinkingSuffix } = splitKnownThinkingSuffix(sources.find((source) => source?.model)?.model ?? "");
  const model = publicOptionalText(baseModel, ctx.caps.maxStringLength);
  if (model) node.model = model;
  const thinking = childThinkingLevel(...sources, { thinking: thinkingSuffix.slice(1) });
  if (thinking) node.thinking = thinking;
}
function appendBoundedChildren(children, source, ctx) {
  const remaining = Math.max(0, ctx.caps.maxChildrenPerNode - children.length);
  children.push(...source.slice(0, remaining));
  ctx.omitted.children += Math.max(0, source.length - remaining);
}
function stepIdentity(step, index, ctx) {
  return {
    id: publicText("workflowKey" in step && step.workflowKey ? step.workflowKey : "runId" in step && step.runId ? step.runId : `step:${index}`, `step:${index}`, ctx.caps.maxStringLength),
    label: publicText("label" in step && step.label ? step.label : step.agent, "step", ctx.caps.maxStringLength)
  };
}
function projectStep(step, index, depth, ctx) {
  const state = normalizeState(step.status);
  const startedAt = publicTime(step.startedAt);
  const durationMs = "durationMs" in step ? publicTime(step.durationMs) : void 0;
  const endedAt = publicTime(step.endedAt) ?? (terminalState(state) && startedAt !== void 0 && durationMs !== void 0 ? publicTime(startedAt + durationMs) : void 0);
  const updatedAt = endedAt ?? publicTime(step.lastActivityAt) ?? startedAt;
  const activity = activityFor(step, ctx);
  const { id, label } = stepIdentity(step, index, ctx);
  const agent = publicOptionalText(step.agent, ctx.caps.maxStringLength);
  const node = {
    id,
    kind: "step",
    label,
    state,
    ...startedAt !== void 0 ? { startedAt } : {},
    ...updatedAt !== void 0 ? { updatedAt } : {},
    ...terminalState(state) && endedAt !== void 0 ? { endedAt } : {},
    ...activity ? { activity } : {}
  };
  if (agent) node.agent = agent;
  setStepModel(node, ctx, step);
  if (depth < ctx.caps.maxDepth && step.children?.length) {
    const nested = step.children.map((child, childIndex) => projectNestedRun(child, childIndex, depth + 1, ctx));
    const bounded2 = [];
    appendBoundedChildren(bounded2, nested, ctx);
    if (bounded2.length) node.children = bounded2;
  } else if (step.children?.length) {
    ctx.omitted.children += step.children.length;
  }
  return node;
}
function projectNestedRun(child, index, depth, ctx) {
  const state = normalizeState(child.state);
  const startedAt = publicTime(child.startedAt);
  const endedAt = publicTime(child.endedAt);
  const updatedAt = publicTime(child.lastUpdate) ?? endedAt ?? publicTime(child.lastActivityAt) ?? startedAt;
  const activity = activityFor(child, ctx);
  const node = {
    id: publicText(child.id, `nested:${index}`, ctx.caps.maxStringLength),
    kind: kindForMode(child.mode),
    label: child.agent ? publicText(child.agent, "subagent", ctx.caps.maxStringLength) : labelForAgents(child.agents, child.mode ?? "subagent", ctx.caps.maxStringLength),
    state,
    ...startedAt !== void 0 ? { startedAt } : {},
    ...updatedAt !== void 0 ? { updatedAt } : {},
    ...terminalState(state) && endedAt !== void 0 ? { endedAt } : {},
    ...activity ? { activity } : {}
  };
  if (depth < ctx.caps.maxDepth) {
    const nestedSteps = child.steps?.map((step, stepIndex) => projectStep(step, stepIndex, depth + 1, ctx)) ?? [];
    const nestedChildren = child.children?.map((nested, childIndex) => projectNestedRun(nested, childIndex, depth + 1, ctx)) ?? [];
    const bounded2 = [];
    appendBoundedChildren(bounded2, [...nestedSteps, ...nestedChildren], ctx);
    if (bounded2.length) node.children = bounded2;
  } else {
    ctx.omitted.children += (child.steps?.length ?? 0) + (child.children?.length ?? 0);
  }
  return node;
}
function hostStepSnapshotState(state, verdict) {
  if (state === "pending") return "queued";
  if (state === "running") return "running";
  if (state === "cancelled") return "stopped";
  if (state === "error" || verdict === "fail") return "failed";
  return verdict === void 0 || verdict === "inconclusive" ? "partial" : "complete";
}
function projectHostStep(hostStep, ctx) {
  const state = hostStepSnapshotState(hostStep.state, hostStep.verdict);
  const detail = publicOptionalText(hostStep.detail, ctx.caps.maxStringLength);
  const report = publicOptionalText(hostStepReportName(hostStep.reportPath), ctx.caps.maxStringLength);
  const hostMetadata = {
    kind: hostStep.monitorKind,
    state: hostStep.state,
    ...hostStep.provider ? { provider: publicText(hostStep.provider, "provider", ctx.caps.maxStringLength) } : {},
    ...hostStep.role ? { role: publicText(hostStep.role, "role", ctx.caps.maxStringLength) } : {},
    ...hostStep.verdict ? { verdict: hostStep.verdict } : {},
    ...hostStep.reasonCode ? { reasonCode: publicText(hostStep.reasonCode, "reason", ctx.caps.maxStringLength) } : {},
    ...detail ? { detail } : {},
    ...hostStep.target ? { target: publicText(hostStep.target, "target", ctx.caps.maxStringLength) } : {},
    ...hostStep.freshness?.stale !== void 0 ? { stale: hostStep.freshness.stale } : {},
    ...report ? { report } : {}
  };
  return {
    id: publicText(hostStep.id, "host-step", ctx.caps.maxStringLength),
    kind: "host-step",
    label: publicText(hostStep.label, "host step", ctx.caps.maxStringLength),
    state,
    updatedAt: hostStep.updatedAt,
    ...terminalState(state) ? { endedAt: hostStep.updatedAt } : {},
    hostStep: hostMetadata
  };
}
function asyncJobOrder(left, right) {
  const leftRank = left.status === "running" ? 0 : left.status === "queued" ? 1 : 2;
  const rightRank = right.status === "running" ? 0 : right.status === "queued" ? 1 : 2;
  const leftTime = left.updatedAt ?? left.startedAt ?? 0;
  const rightTime = right.updatedAt ?? right.startedAt ?? 0;
  return leftRank - rightRank || rightTime - leftTime || left.asyncId.localeCompare(right.asyncId);
}
function hasCyclicWorkflowParent(job, parents) {
  const seen = /* @__PURE__ */ new Set([job.asyncId]);
  let parentId = job.parentWorkflowRunId;
  while (parentId) {
    if (seen.has(parentId)) return true;
    seen.add(parentId);
    parentId = parents.get(parentId)?.parentWorkflowRunId;
  }
  return false;
}
function groupMaterializedChildren(jobs) {
  const parents = new Map(jobs.filter((job) => job.mode === "workflow").map((job) => [job.asyncId, job]));
  const childrenByParent = /* @__PURE__ */ new Map();
  const liveRoots = /* @__PURE__ */ new Set();
  const roots = [];
  for (const job of jobs) {
    const parent = job.parentWorkflowRunId ? parents.get(job.parentWorkflowRunId) : void 0;
    const keepLiveRoot = (job.status === "running" || job.status === "queued") && parent?.status !== "running";
    if (parent && !hasCyclicWorkflowParent(job, parents)) {
      const siblings = childrenByParent.get(parent.asyncId) ?? [];
      siblings.push(job);
      childrenByParent.set(parent.asyncId, siblings);
      if (keepLiveRoot) {
        liveRoots.add(job);
        roots.push(job);
      }
    } else {
      roots.push(job);
    }
  }
  for (const children of childrenByParent.values()) children.sort(asyncJobOrder);
  return { roots, childrenByParent, liveRoots };
}
function assignMaterializedChildren(steps, children) {
  const assigned = /* @__PURE__ */ new Map();
  const claimed = /* @__PURE__ */ new Set();
  for (const step of steps) {
    if (!step.runId) continue;
    const child = children.find((candidate) => !claimed.has(candidate) && candidate.asyncId === step.runId);
    if (child) {
      assigned.set(step, child);
      claimed.add(child);
    }
  }
  for (const step of steps) {
    if (assigned.has(step) || !step.workflowKey) continue;
    const child = children.find((candidate) => !claimed.has(candidate) && candidate.workflowKey === step.workflowKey);
    if (child) {
      assigned.set(step, child);
      claimed.add(child);
    }
  }
  return assigned;
}
function projectMaterializedStep(step, index, child, depth, ctx, childrenByParent, liveRoots) {
  const { id, label } = stepIdentity(step, index, ctx);
  const selfStep = child.mode === void 0 || child.mode === "single" ? child.steps?.[0] : void 0;
  const live = projectRun(child, ctx, depth, childrenByParent, liveRoots, selfStep !== void 0);
  const laneActivity = activityFor(step, ctx);
  const selfActivity = selfStep ? activityFor(selfStep, ctx) : void 0;
  const activity = laneActivity || selfActivity || live.activity ? { ...laneActivity, ...selfActivity, ...live.activity } : void 0;
  const node = { ...live, id, kind: "step", label };
  const agent = publicOptionalText(selfStep?.agent || step.agent, ctx.caps.maxStringLength);
  if (agent) node.agent = agent;
  if (activity) node.activity = activity;
  setStepModel(node, ctx, selfStep, step);
  return node;
}
function projectRun(job, ctx, depth, childrenByParent, liveRoots, omitSteps = false) {
  const state = normalizeState(job.status);
  const startedAt = publicTime(job.startedAt);
  const updatedAt = publicTime(job.updatedAt) ?? startedAt;
  const activity = activityFor(job, ctx);
  const node = {
    id: publicText(job.asyncId, "async", ctx.caps.maxStringLength),
    kind: kindForMode(job.mode),
    label: labelForAgents(job.agents, job.mode ?? "subagent", ctx.caps.maxStringLength),
    state,
    ...startedAt !== void 0 ? { startedAt } : {},
    ...updatedAt !== void 0 ? { updatedAt } : {},
    ...terminalState(state) && updatedAt !== void 0 ? { endedAt: updatedAt } : {},
    ...activity ? { activity } : {}
  };
  const steps = omitSteps ? [] : job.steps ?? [];
  const materialized = childrenByParent.get(job.asyncId) ?? [];
  const nestedSummaries = (job.nestedChildren ?? []).filter((child) => !materialized.some((live) => live.asyncId === child.id));
  const loadedKeys = new Set(steps.flatMap((step) => step.workflowKey ? [step.workflowKey] : []));
  const graphStages = job.mode === "workflow" ? workflowGraphStageNodes(job.workflowGraph).filter((graphNode) => !loadedKeys.has(graphNode.id)) : [];
  const graphSteps = graphStages.map((node2, index) => ({
    step: { agent: node2.agent ?? node2.label, status: workflowGraphStepStatus(node2.status), workflowKey: node2.id, label: node2.label },
    index: node2.flatIndex ?? index
  }));
  const lanes = [...steps, ...graphSteps.map(({ step }) => step)];
  const assigned = assignMaterializedChildren(lanes, materialized);
  const claimed = new Set(assigned.values());
  if (depth < ctx.caps.maxDepth) {
    const childDepth = depth + 1;
    const projectLane = (step, index) => {
      const child = assigned.get(step);
      if (!child) return projectStep(step, index, childDepth, ctx);
      if (liveRoots.has(child)) return void 0;
      return projectMaterializedStep(step, index, child, childDepth, ctx, childrenByParent, liveRoots);
    };
    const stepChildren = steps.map((step, index) => projectLane(step, step.index ?? index)).filter((child) => child !== void 0);
    const graphChildren = graphSteps.map(({ step, index }) => projectLane(step, index)).filter((child) => child !== void 0);
    const nestedChildren = nestedSummaries.map((child, index) => projectNestedRun(child, index, childDepth, ctx));
    const unclaimedChildren = materialized.filter((child) => !claimed.has(child) && !liveRoots.has(child)).map((child) => projectRun(child, ctx, childDepth, childrenByParent, liveRoots));
    const hostStepChildren = validHostStepList(job.hostSteps).map((hostStep) => projectHostStep(hostStep, ctx));
    const ordinaryChildren = [...stepChildren, ...graphChildren, ...nestedChildren, ...unclaimedChildren];
    const retainedHostSteps = hostStepChildren.slice(0, ctx.caps.maxChildrenPerNode);
    const retainedOrdinaryChildren = ordinaryChildren.slice(0, ctx.caps.maxChildrenPerNode - retainedHostSteps.length);
    const bounded2 = [];
    bounded2.push(...retainedOrdinaryChildren, ...retainedHostSteps);
    ctx.omitted.children += ordinaryChildren.length - retainedOrdinaryChildren.length + hostStepChildren.length - retainedHostSteps.length;
    if (bounded2.length) node.children = bounded2;
  } else {
    const rootAssignments = [...assigned.values()].filter((child) => liveRoots.has(child)).length;
    const unclaimedChildren = materialized.filter((child) => !claimed.has(child) && !liveRoots.has(child)).length;
    ctx.omitted.children += lanes.length - rootAssignments + nestedSummaries.length + unclaimedChildren + validHostStepList(job.hostSteps).length;
  }
  return node;
}
function snapshotBytes(snapshot) {
  return Buffer.byteLength(JSON.stringify(snapshot), "utf8");
}
function enforceByteLimit(snapshot) {
  if (snapshotBytes(snapshot) <= snapshot.caps.maxSerializedBytes) return;
  snapshot.omitted.byteLimitExceeded = true;
  const runs = snapshot.runs;
  const initialOmittedRuns = snapshot.omitted.runs;
  let lower = 0;
  let upper = Math.max(0, runs.length - 1);
  while (lower < upper) {
    const retained = Math.ceil((lower + upper) / 2);
    snapshot.runs = runs.slice(0, retained);
    snapshot.omitted.runs = initialOmittedRuns + runs.length - retained;
    if (snapshotBytes(snapshot) <= snapshot.caps.maxSerializedBytes) lower = retained;
    else upper = retained - 1;
  }
  snapshot.runs = runs.slice(0, lower);
  snapshot.omitted.runs = initialOmittedRuns + runs.length - lower;
}
function workflowStepActivity(step) {
  if (step.currentTool) return `tool ${step.currentTool}`;
  if (step.currentPath) return step.currentPath.split(/[\\/]/).at(-1);
  if (step.activityState === "needs_attention") return "needs attention";
  if (step.activityState === "active_long_running") return "long-running";
  if (step.turnCount !== void 0) return `${step.turnCount} turns`;
  if (step.toolCount !== void 0) return `${step.toolCount} tools`;
  return void 0;
}
function workflowStepName(step, index) {
  const key = step.workflowKey ?? `step ${index + 1}`;
  const label = step.label && step.label !== key ? ` \xB7 ${step.label}` : "";
  const phase = step.phase ? `${step.phase}: ` : "";
  return `${phase}${key}${label} (${step.agent})`;
}
function hostStepRow(hostStep) {
  const freshness = hostStep.freshness ? {
    expectedRef: publicText(hostStep.freshness.expectedRef, "ref", HOST_STEP_MAX_REF_CHARS),
    ...hostStep.freshness.observedRef ? { observedRef: publicText(hostStep.freshness.observedRef, "ref", HOST_STEP_MAX_REF_CHARS) } : {},
    ...hostStep.freshness.stale !== void 0 ? { stale: hostStep.freshness.stale } : {}
  } : void 0;
  return {
    name: publicText(hostStep.label, "host step", HOST_STEP_MAX_LABEL_CHARS),
    kind: hostStep.monitorKind,
    state: hostStep.state,
    ...hostStep.role ? { role: publicText(hostStep.role, "role", HOST_STEP_MAX_ROLE_CHARS) } : {},
    ...hostStep.provider ? { provider: publicText(hostStep.provider, "provider", HOST_STEP_MAX_PROVIDER_CHARS) } : {},
    ...hostStep.verdict ? { verdict: hostStep.verdict } : {},
    ...hostStep.reasonCode ? { reasonCode: publicText(hostStep.reasonCode, "reason", HOST_STEP_MAX_REASON_CHARS) } : {},
    ...hostStep.detail ? { detail: publicText(hostStep.detail, "detail", HOST_STEP_MAX_DETAIL_CHARS) } : {},
    ...hostStep.target ? { target: publicText(hostStep.target, "target", HOST_STEP_MAX_TARGET_CHARS) } : {},
    ...freshness ? { freshness } : {},
    ...hostStep.reportPath ? { reportPath: hostStepReportName(hostStep.reportPath) } : {}
  };
}
function isWorkflowPreflight(value) {
  return value !== void 0 && !Array.isArray(value) && "lanes" in value;
}
function isWorkflowGraph(value) {
  return value !== void 0 && !Array.isArray(value) && "nodes" in value;
}
function workflowGraphRowState(status) {
  switch (status) {
    case "pending":
      return "planned";
    case "completed":
      return "complete";
    case "detached":
      return "paused";
    default:
      return status;
  }
}
function workflowGraphStepStatus(status) {
  switch (status) {
    case "completed":
      return "complete";
    case "detached":
      return "paused";
    default:
      return status;
  }
}
function workflowGraphRowName(node) {
  const key = publicText(node.id, "stage", HOST_STEP_MAX_LABEL_CHARS);
  const label = publicOptionalText(node.label, HOST_STEP_MAX_LABEL_CHARS);
  const phase = publicOptionalText(node.phase, HOST_STEP_MAX_LABEL_CHARS);
  const agent = publicOptionalText(node.agent, HOST_STEP_MAX_LABEL_CHARS);
  return `${phase ? `${phase}: ` : ""}${key}${label && label !== node.id ? ` \xB7 ${label}` : ""}${agent ? ` (${agent})` : ""}`;
}
function projectWorkflowGraphRow(node, preflight) {
  return {
    name: workflowGraphRowName(node),
    state: workflowGraphRowState(node.status),
    ...preflight ? { preflight } : {}
  };
}
function projectAsyncWorkflowRows(steps, hostStepsOrPreflight, preflightOverride) {
  const preflight = preflightOverride ?? (isWorkflowPreflight(hostStepsOrPreflight) ? hostStepsOrPreflight : void 0);
  const graph = isWorkflowGraph(hostStepsOrPreflight) ? hostStepsOrPreflight : void 0;
  const hostSteps = isWorkflowPreflight(hostStepsOrPreflight) || graph ? void 0 : hostStepsOrPreflight;
  const loaded = steps ?? [];
  const preflightForKey = (key, groupKeys = []) => workflowPreflightLaneForRuntimeKey(preflight, key, groupKeys);
  if (graph) {
    const loadedIndexesByKey = /* @__PURE__ */ new Map();
    for (const [index, step] of loaded.entries()) {
      if (!step.workflowKey) continue;
      const indexes = loadedIndexesByKey.get(step.workflowKey) ?? [];
      indexes.push(index);
      loadedIndexesByKey.set(step.workflowKey, indexes);
    }
    const consumed = /* @__PURE__ */ new Set();
    const childRows = [];
    const graphStages = workflowGraphStageNodes(graph);
    const graphKeys = new Set(graphStages.map((node) => node.id));
    const graphPhaseByNodeId = /* @__PURE__ */ new Map();
    for (const phase of graph.phases) {
      for (const nodeId of phase.nodeIds) {
        if (graphKeys.has(nodeId) && !graphPhaseByNodeId.has(nodeId)) graphPhaseByNodeId.set(nodeId, phase.title);
      }
    }
    for (const node of graphStages) {
      const lane = preflightForKey(node.id, [node.phase, graphPhaseByNodeId.get(node.id)]);
      const indexes = (loadedIndexesByKey.get(node.id) ?? []).filter((index) => !consumed.has(index));
      if (indexes.length > 0) {
        for (const index of indexes) {
          consumed.add(index);
          childRows.push(projectLoadedWorkflowRow(loaded[index], index, lane));
        }
      } else {
        childRows.push(projectWorkflowGraphRow(node, lane));
      }
    }
    for (const [index, step] of loaded.entries()) {
      if (!consumed.has(index)) childRows.push(projectLoadedWorkflowRow(step, index, step.workflowKey ? preflightForKey(step.workflowKey, [step.phase]) : void 0));
    }
    return [...childRows, ...validHostStepList(graph).map(hostStepRow)];
  }
  return [
    ...loaded.map((step, index) => projectLoadedWorkflowRow(step, index, step.workflowKey ? preflightForKey(step.workflowKey, [step.phase]) : void 0)),
    ...validHostStepList(hostSteps).map(hostStepRow)
  ];
}
function projectLoadedWorkflowRow(step, index, preflight) {
  const modelThinking = formatModelThinking(step.model, step.thinking) || void 0;
  const thinking = childThinkingLevel(step);
  const activity = workflowStepActivity(step);
  return {
    name: workflowStepName(step, index),
    state: step.status,
    ...step.context ? { context: step.context } : {},
    ...modelThinking ? { modelThinking } : {},
    ...thinking ? { thinking } : {},
    ...activity ? { activity } : {},
    ...step.startedAt !== void 0 ? { startedAt: step.startedAt } : {},
    ...step.endedAt !== void 0 ? { endedAt: step.endedAt } : {},
    ...step.durationMs !== void 0 ? { durationMs: step.durationMs } : {},
    ...step.tokens?.total !== void 0 ? { tokens: step.tokens.total } : {},
    ...step.tokens?.window !== void 0 ? { window: step.tokens.window } : {},
    ...preflight ? { preflight } : {}
  };
}
function projectAsyncStatusSnapshot(jobs, options = {}) {
  const caps = resolveCaps(options);
  const ctx = { caps, omitted: { runs: 0, children: 0, byteLimitExceeded: false } };
  const { roots, childrenByParent, liveRoots } = groupMaterializedChildren([...jobs]);
  const sorted = roots.sort(asyncJobOrder);
  ctx.omitted.runs += Math.max(0, sorted.length - caps.maxRuns);
  const snapshot = {
    kind: ASYNC_STATUS_SNAPSHOT_KIND,
    version: ASYNC_STATUS_SNAPSHOT_VERSION,
    generatedAt: options.generatedAt ?? Date.now(),
    caps,
    omitted: ctx.omitted,
    runs: sorted.slice(0, caps.maxRuns).map((job) => projectRun(job, ctx, 0, childrenByParent, liveRoots))
  };
  enforceByteLimit(snapshot);
  return snapshot;
}

// src/runs/shared/mutation-evidence.ts
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs2 from "node:fs";
import * as os from "node:os";
import * as path2 from "node:path";
var MAX_TRACKED_PATHS = 500;
var MAX_HASH_BYTES = 1024 * 1024;
var MAX_TIMEOUT_FILES = 20;
function gitArguments(args) {
  return ["-c", "core.fsmonitor=false", ...args];
}
function gitOutput(cwd, args, maxBuffer = MAX_HASH_BYTES) {
  return execFileSync("git", gitArguments(args), { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer, windowsHide: true });
}
function splitNul(output) {
  return output.split("\0").filter((part) => part.length > 0);
}
function hashLargeDiff(cwd, relativePath) {
  const tempDir = fs2.mkdtempSync(path2.join(os.tmpdir(), "pi-subagents-tracked-diff-"));
  const diffPath = path2.join(tempDir, "diff.patch");
  try {
    execFileSync("git", gitArguments(["diff", "--no-ext-diff", "--binary", `--output=${diffPath}`, "HEAD", "--", relativePath]), { cwd, stdio: "ignore", windowsHide: true });
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    const fd = fs2.openSync(diffPath, "r");
    try {
      for (; ; ) {
        const bytesRead = fs2.readSync(fd, buffer, 0, buffer.length, null);
        if (bytesRead === 0) break;
        hash.update(buffer.subarray(0, bytesRead));
      }
    } finally {
      fs2.closeSync(fd);
    }
    return hash.digest("hex");
  } finally {
    fs2.rmSync(tempDir, { recursive: true, force: true });
  }
}
function listChangedTrackedFiles(cwd) {
  const paths = splitNul(gitOutput(cwd, ["diff", "--no-ext-diff", "--name-only", "-z", "HEAD", "--"], MAX_HASH_BYTES));
  return { paths: paths.slice(0, MAX_TRACKED_PATHS), truncated: paths.length > MAX_TRACKED_PATHS };
}
function fingerprintPath(cwd, relativePath) {
  try {
    const diff = gitOutput(cwd, ["diff", "--no-ext-diff", "--binary", "HEAD", "--", relativePath], MAX_HASH_BYTES);
    return { kind: "diff", digest: createHash("sha256").update(diff).digest("hex") };
  } catch {
    return { kind: "diff", digest: hashLargeDiff(cwd, relativePath) };
  }
}
function sameFingerprint(left, right) {
  if (!left || left.kind !== "diff" || right.kind !== "diff") return false;
  return left.digest === right.digest;
}
function snapshotTrackedMutations(cwd) {
  try {
    const changed = listChangedTrackedFiles(cwd);
    const fingerprints = {};
    for (const file of changed.paths) fingerprints[file] = fingerprintPath(cwd, file);
    return { source: "tracked-files", trackedOnly: true, cwd, dirtyFiles: changed.paths, fingerprints, truncated: changed.truncated };
  } catch (error) {
    return { source: "tracked-files", trackedOnly: true, cwd, dirtyFiles: [], fingerprints: {}, unavailable: error instanceof Error ? error.message : String(error) };
  }
}
function collectTrackedMutationEvidence(snapshot, cwd = snapshot.cwd) {
  if (snapshot.unavailable) {
    return { source: "tracked-files", trackedOnly: true, changedFiles: [], attemptedMutation: false, unavailable: snapshot.unavailable };
  }
  try {
    const current = listChangedTrackedFiles(cwd);
    const startDirty = new Set(snapshot.dirtyFiles);
    const candidates = /* @__PURE__ */ new Set([...snapshot.dirtyFiles, ...current.paths]);
    const changedFiles = [];
    for (const file of candidates) {
      if (!startDirty.has(file)) {
        if (!snapshot.truncated) changedFiles.push(file);
        continue;
      }
      if (!sameFingerprint(snapshot.fingerprints[file], fingerprintPath(cwd, file))) changedFiles.push(file);
    }
    changedFiles.sort();
    return {
      source: "tracked-files",
      trackedOnly: true,
      changedFiles,
      attemptedMutation: changedFiles.length > 0,
      truncated: snapshot.truncated || current.truncated || void 0
    };
  } catch (error) {
    return { source: "tracked-files", trackedOnly: true, changedFiles: [], attemptedMutation: false, unavailable: error instanceof Error ? error.message : String(error) };
  }
}
function formatPathList(paths) {
  if (paths.length === 0) return "none";
  const shown = paths.slice(0, MAX_TIMEOUT_FILES).join(", ");
  return paths.length > MAX_TIMEOUT_FILES ? `${shown}, ... (${paths.length - MAX_TIMEOUT_FILES} more)` : shown;
}
function projectTimeoutRecovery(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const source = value;
  const termination = source.termination === "timed-out" || source.termination === "stopped" ? source.termination : void 0;
  if (!termination || !Array.isArray(source.changedFiles)) return void 0;
  const allChangedFiles = source.changedFiles.filter((file) => typeof file === "string");
  const changedFiles = allChangedFiles.slice(0, MAX_TIMEOUT_FILES);
  const reportStatus = source.reportStatus === "missing" || source.reportStatus === "written" || source.reportStatus === "not-requested" || source.reportStatus === "unknown" ? source.reportStatus : void 0;
  return {
    termination,
    changedFiles,
    ...source.truncated === true || allChangedFiles.length > changedFiles.length ? { truncated: true } : {},
    ...source.recoveryNeeded === true ? { recoveryNeeded: true } : {},
    ...source.reason === "timed-out-with-dirty-worktree" ? { reason: source.reason } : {},
    ...reportStatus ? { reportStatus } : {}
  };
}
function formatTimeoutRecoveryLines(value, indent = "") {
  const recovery = projectTimeoutRecovery(value);
  if (!recovery?.recoveryNeeded) return [];
  const changedFiles = recovery.changedFiles.length > 0 ? `${recovery.changedFiles.join(", ")}${recovery.truncated ? ", \u2026" : ""}` : "none";
  const changedFileCount = recovery.changedFiles.length > 0 ? `${recovery.changedFiles.length}${recovery.truncated ? "+" : ""}` : "0";
  return [
    `${indent}Recovery needed: review the diff and artifacts before resuming or launching dependent stages.`,
    `${indent}Recovery evidence: requested report: ${recovery.reportStatus ?? "unknown"}; changed tracked files: ${changedFiles} (${changedFileCount}); classification: ${recovery.reason ?? recovery.termination}`
  ];
}
function buildTimeoutRecoverySummary(input) {
  const warning = "Inspect partial changes before retrying or resuming the child.";
  const changedFiles = input.evidence.changedFiles.slice(0, MAX_TIMEOUT_FILES);
  let reportStatus = "not-requested";
  if (input.requiredOutputMissing === true) reportStatus = "missing";
  else if (input.requiredOutputMissing === false) reportStatus = "written";
  const recoveryNeeded = input.termination === "timed-out" && reportStatus === "missing" && input.evidence.changedFiles.length > 0;
  const lines = [
    "Recovery summary:",
    `- termination: ${input.termination}`,
    `- changed tracked files: ${input.evidence.unavailable ? `unavailable (${input.evidence.unavailable})` : formatPathList(input.evidence.changedFiles)}`
  ];
  if (input.requiredOutputMissing !== void 0) lines.push(`- requested report: ${reportStatus}`);
  if (recoveryNeeded) lines.push("- Recovery needed: review the diff and artifacts before resuming or launching dependent stages.");
  if (input.currentTool) lines.push(`- active tool: ${input.currentTool}${input.currentToolArgs ? ` \u2014 ${input.currentToolArgs}` : ""}`);
  if (input.currentPath) lines.push(`- active path: ${input.currentPath}`);
  if (input.sessionFile) lines.push(`- session file: ${input.sessionFile}`);
  if (input.transcriptPath) lines.push(`- transcript: ${input.transcriptPath}`);
  if (input.artifactPaths?.outputPath) lines.push(`- output artifact: ${input.artifactPaths.outputPath}`);
  if (input.artifactPaths?.metadataPath) lines.push(`- metadata artifact: ${input.artifactPaths.metadataPath}`);
  lines.push(`Warning: ${warning}`);
  return {
    termination: input.termination,
    changedFiles,
    truncated: input.evidence.changedFiles.length > changedFiles.length || input.evidence.truncated || void 0,
    ...recoveryNeeded ? { recoveryNeeded: true, reason: "timed-out-with-dirty-worktree" } : {},
    reportStatus,
    currentTool: input.currentTool,
    currentToolArgs: input.currentToolArgs,
    currentPath: input.currentPath,
    sessionFile: input.sessionFile,
    transcriptPath: input.transcriptPath,
    artifactPaths: input.artifactPaths,
    warning,
    message: lines.join("\n")
  };
}

// src/workflows/workflow-checklist.ts
var MAX_TEXT = 160;
var TERMINAL_STATES2 = /* @__PURE__ */ new Set(["complete", "blocked", "failed", "paused", "stopped"]);
function text(value, fallback) {
  if (typeof value !== "string") return fallback;
  const clean = sanitizeDisplayText(value).replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, MAX_TEXT) : fallback;
}
function keyText(value, fallback) {
  return text(value, fallback) ?? fallback;
}
function normalizedStatus(value) {
  return typeof value === "string" ? value.toLowerCase() : "queued";
}
function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function count(value) {
  const number = finite(value);
  return number !== void 0 && number >= 0 ? Math.round(number) : void 0;
}
function explicitBlocked(source) {
  const acceptance = normalizedStatus(source.acceptance?.status);
  const review = normalizedStatus(source.review?.status ?? source.acceptance?.reviewResult?.status);
  return source.toolBudgetBlocked === true || source.turnBudgetExceeded === true || source.activityState === "needs_attention" || source.timedOut === true || source.watchdog?.phase === "stale" || source.stale === true || source.verdict === "inconclusive" || acceptance === "rejected" || acceptance === "blockers" || review === "blockers" || review === "review-required";
}
function checklistState(source) {
  if (explicitBlocked(source)) return "blocked";
  switch (normalizedStatus(source.status)) {
    case "complete":
    case "completed":
    case "done":
    case "pass":
    case "accepted":
      return "complete";
    case "running":
    case "started":
    case "active":
      return "running";
    case "failed":
    case "error":
    case "fail":
      return "failed";
    case "blocked":
    case "rejected":
    case "partial":
    case "needs_attention":
      return "blocked";
    case "paused":
    case "detached":
      return "paused";
    case "stopped":
    case "cancelled":
    case "canceled":
      return "stopped";
    default:
      return "queued";
  }
}
function duration(step, now, state) {
  const explicit = finite(step.durationMs);
  const startedAt = finite(step.startedAt);
  if (explicit !== void 0) return Math.max(0, explicit);
  if (startedAt === void 0) return void 0;
  const end = state === "running" ? now : finite(step.endedAt);
  return end === void 0 ? void 0 : Math.max(0, end - startedAt);
}
function stepKey(step) {
  return step.key ?? step.workflowKey ?? step.runId;
}
function stepItem(step, index, phase, key = stepKey(step) ?? `step-${index + 1}`, label = step.label ?? step.description ?? stepKey(step) ?? step.agent ?? key, preflight) {
  const state = checklistState(step);
  const thinking = childThinkingLevel(step);
  return {
    key: keyText(key, `step-${index + 1}`),
    label: keyText(label, key),
    phase,
    state,
    ...text(step.agent) ? { agent: text(step.agent) } : {},
    ...thinking ? { thinking } : {},
    ...step.context ? { context: step.context } : {},
    ...finite(step.startedAt) !== void 0 ? { startedAt: finite(step.startedAt) } : {},
    ...duration(step, void 0, state) !== void 0 ? { durationMs: duration(step, void 0, state) } : {},
    ...text(step.currentTool) ? { currentTool: text(step.currentTool) } : {},
    ...finite(step.currentToolStartedAt) !== void 0 ? { currentToolStartedAt: finite(step.currentToolStartedAt) } : {},
    ...text(step.currentPath) ? { currentPath: text(step.currentPath) } : {},
    ...count(step.toolCount) !== void 0 ? { toolCount: count(step.toolCount) } : {},
    ...text(step.outputName) ? { outputName: text(step.outputName) } : {},
    ...text(step.error) ? { error: text(step.error) } : {},
    ...preflight ? { preflight } : {}
  };
}
function hostItem(host, phase, key = host.id) {
  const state = checklistState({ status: host.state, verdict: host.verdict, stale: host.freshness?.stale });
  return {
    key: keyText(key, "host-step"),
    label: keyText(host.label, "host step"),
    phase,
    state,
    kind: "host",
    monitorKind: host.monitorKind,
    ...text(host.provider) ? { provider: text(host.provider) } : {},
    ...text(host.role) ? { role: text(host.role) } : {},
    ...host.verdict ? { verdict: host.verdict } : {},
    ...text(host.target) ? { target: text(host.target) } : {},
    ...text(host.reasonCode) ? { reasonCode: text(host.reasonCode) } : {},
    ...text(host.detail) ? { error: text(host.detail) } : {},
    ...host.freshness?.stale !== void 0 ? { stale: host.freshness.stale } : {},
    ...text(host.reportPath) ? { reportPath: text(host.reportPath) } : {}
  };
}
function graphNodes(graph) {
  const out = [];
  const visit = (node) => {
    if (node.kind === "parallel-group" || node.kind === "dynamic-parallel-group") {
      for (const child of node.children ?? []) visit(child);
      if (!node.children?.length) out.push(node);
    } else {
      out.push(node);
    }
  };
  for (const node of graph?.nodes ?? []) visit(node);
  return out;
}
function traceSources(trace) {
  const latest = /* @__PURE__ */ new Map();
  for (const entry of trace ?? []) {
    const state = normalizedStatus(entry.state);
    if (entry.operation !== void 0 && entry.operation !== "run" && entry.operation !== "host" || !entry.key || state === "delivered" || state === "missed") continue;
    const existing = latest.get(entry.key);
    latest.set(entry.key, state === "reused" && existing ? { ...existing, ...entry, state: existing.state } : { ...existing, ...entry });
  }
  return [...latest.values()];
}
function traceItem(entry, index, preflight) {
  const phase = keyText(preflight?.key ?? entry.generatedLaneKey ?? entry.phase, "Workflow");
  const item = stepItem({ key: entry.key, label: entry.label, phase, agent: entry.agent, status: entry.state === "started" ? "running" : entry.state, durationMs: entry.durationMs, error: entry.error }, index, phase, entry.key, entry.label ?? entry.key, preflight);
  if (entry.operation === "host") item.kind = "host";
  return item;
}
function phaseFor(phases, label) {
  let phase = phases.get(label);
  if (!phase) {
    phase = { key: label, label, state: "queued", items: [], total: 0, done: 0, running: 0, queued: 0, blocked: 0, failed: 0, paused: 0, stopped: 0, parallel: false };
    phases.set(label, phase);
  }
  return phase;
}
function add(phases, phase, item) {
  phaseFor(phases, phase).items.push(item);
}
function mergeNodeStep(node, step, phase, trace, preflight) {
  const state = checklistState(step);
  const nodeState = checklistState({ status: node.status, acceptance: node.acceptanceStatus ? { status: node.acceptanceStatus } : void 0 });
  const status = TERMINAL_STATES2.has(nodeState) && !TERMINAL_STATES2.has(state) ? nodeState : trace && !TERMINAL_STATES2.has(state) ? trace.state === "started" ? "running" : trace.state : normalizedStatus(step.status) === "pending" && normalizedStatus(node.status) !== "pending" ? node.status : step.status;
  return stepItem({ ...step, status, key: node.id, label: step.label ?? node.label, phase: step.phase ?? phase, agent: step.agent ?? node.agent, outputName: step.outputName ?? node.outputName, error: step.error ?? trace?.error ?? node.error, acceptance: step.acceptance ?? (node.acceptanceStatus ? { status: node.acceptanceStatus } : void 0), durationMs: step.durationMs ?? trace?.durationMs }, node.flatIndex ?? 0, phase, node.id, step.label ?? node.label, preflight);
}
function priority(item) {
  return item.state === "blocked" ? 0 : item.state === "failed" ? 1 : item.state === "running" ? 2 : item.state === "paused" ? 3 : item.state === "stopped" ? 4 : item.state === "queued" ? 5 : 6;
}
function applyNow(item, now) {
  return item.state === "running" && item.startedAt !== void 0 && now !== void 0 ? { ...item, durationMs: Math.max(0, now - item.startedAt) } : item;
}
function finalize(phase) {
  phase.total = phase.items.length;
  phase.done = phase.items.filter((item) => item.state === "complete").length;
  phase.running = phase.items.filter((item) => item.state === "running").length;
  phase.queued = phase.items.filter((item) => item.state === "queued").length;
  phase.blocked = phase.items.filter((item) => item.state === "blocked").length;
  phase.failed = phase.items.filter((item) => item.state === "failed").length;
  phase.paused = phase.items.filter((item) => item.state === "paused").length;
  phase.stopped = phase.items.filter((item) => item.state === "stopped").length;
  phase.parallel = phase.total > 1;
  phase.state = phase.blocked ? "blocked" : phase.failed ? "failed" : phase.running ? "running" : phase.paused ? "paused" : phase.stopped ? "stopped" : phase.queued ? "queued" : "complete";
}
function projectWorkflowChecklist(input) {
  const phases = /* @__PURE__ */ new Map();
  const steps = input.steps ?? [];
  const nodes = graphNodes(input.graph);
  const trace = traceSources(input.trace);
  const traceByKey = new Map(trace.map((entry) => [entry.key, entry]));
  const phaseByNode = /* @__PURE__ */ new Map();
  for (const phase of input.graph?.phases ?? []) {
    const title = keyText(phase.title, "Workflow");
    phaseFor(phases, title);
    for (const nodeId of phase.nodeIds) if (!phaseByNode.has(nodeId)) phaseByNode.set(nodeId, title);
  }
  const stepsByKey = /* @__PURE__ */ new Map();
  for (const [index, step] of steps.entries()) {
    const key = stepKey(step);
    if (!key) continue;
    stepsByKey.set(key, [...stepsByKey.get(key) ?? [], { step, index }]);
  }
  const usedSteps = /* @__PURE__ */ new Set();
  const hostById = new Map((input.hostSteps ?? []).map((host) => [host.id, host]));
  const graphKeys = new Set(nodes.map((node) => node.id));
  const stepKeys = /* @__PURE__ */ new Set([...stepsByKey.keys()]);
  const hostKeys = new Set(hostById.keys());
  for (const node of nodes) {
    const host = node.hostStep ?? hostById.get(node.id);
    const phase = keyText(phaseByNode.get(node.id) ?? node.phase ?? (host ? host.label : node.label), "Workflow");
    if (host) {
      add(phases, phase, hostItem(host, phase, node.id));
      hostById.delete(node.id);
      continue;
    }
    const matches = (stepsByKey.get(node.id) ?? []).filter(({ index }) => !usedSteps.has(index));
    if (matches.length) {
      for (const match of matches) {
        usedSteps.add(match.index);
        add(phases, phase, applyNow(mergeNodeStep(node, match.step, phase, traceByKey.get(stepKey(match.step) ?? node.id), workflowPreflightLaneForRuntimeKey(input.preflight, node.id, [phase])), input.now));
      }
      continue;
    }
    add(phases, phase, applyNow(mergeNodeStep(node, { key: node.id, label: node.label, phase, agent: node.agent, status: node.status, outputName: node.outputName, error: node.error, acceptance: node.acceptanceStatus ? { status: node.acceptanceStatus } : void 0 }, phase, traceByKey.get(node.id), workflowPreflightLaneForRuntimeKey(input.preflight, node.id, [phase])), input.now));
  }
  for (const [index, step] of steps.entries()) {
    if (usedSteps.has(index)) continue;
    const key = keyText(stepKey(step), `step-${index + 1}`);
    const traceEntry = traceByKey.get(key);
    const lane = workflowPreflightLaneForRuntimeKey(input.preflight, key, [step.phase, traceEntry?.generatedLaneKey, traceEntry?.phase]);
    const phase = keyText(lane?.key ?? step.phase ?? traceEntry?.generatedLaneKey ?? traceEntry?.phase, "Workflow");
    add(phases, phase, applyNow(stepItem(step, index, phase, key, step.label ?? step.key ?? step.agent, lane), input.now));
  }
  for (const host of hostById.values()) add(phases, keyText(host.label, "Host"), hostItem(host, keyText(host.label, "Host")));
  for (const entry of trace) {
    if (graphKeys.has(entry.key) || stepKeys.has(entry.key) || hostKeys.has(entry.key)) continue;
    const item = traceItem(entry, phases.size, workflowPreflightLaneForRuntimeKey(input.preflight, entry.key, [entry.generatedLaneKey, entry.phase]));
    add(phases, item.phase, item);
  }
  const finalized = [...phases.values()].filter((phase) => phase.items.length > 0);
  for (const phase of finalized) {
    phase.items = phase.items.map((item) => applyNow(item, input.now));
    finalize(phase);
  }
  const all = finalized.flatMap((phase) => phase.items);
  const counts = (state) => all.filter((item) => item.state === state).length;
  const bottleneck = [...all].sort((left, right) => priority(left) - priority(right))[0];
  return { phases: finalized, total: all.length, done: counts("complete"), running: counts("running"), queued: counts("queued"), blocked: counts("blocked"), failed: counts("failed"), paused: counts("paused"), stopped: counts("stopped"), ...bottleneck && bottleneck.state !== "complete" ? { bottleneck } : {} };
}
function stateLabel(state) {
  return state === "running" ? "active" : state;
}
function formatWorkflowChecklistSummary(projection) {
  if (!projection.total) return "";
  return [`${projection.done}/${projection.total} done`, projection.running ? `${projection.running} active` : void 0, projection.queued ? `${projection.queued} queued` : void 0, projection.blocked ? `${projection.blocked} blocked` : void 0, projection.failed ? `${projection.failed} failed` : void 0, projection.paused ? `${projection.paused} paused` : void 0, projection.stopped ? `${projection.stopped} stopped` : void 0].filter((value) => Boolean(value)).join(" \xB7 ");
}
function formatWorkflowChecklistPhase(phase) {
  const counts = [phase.total > 1 && phase.done ? `${phase.done} done` : void 0, phase.running ? `${phase.running} active` : void 0, phase.queued ? `${phase.queued} queued` : void 0, phase.blocked ? `${phase.blocked} blocked` : void 0, phase.failed ? `${phase.failed} failed` : void 0, phase.paused ? `${phase.paused} paused` : void 0, phase.stopped ? `${phase.stopped} stopped` : void 0].filter((value) => Boolean(value));
  return counts.length ? `${phase.label} ${counts.join(" \xB7 ")}` : phase.label;
}
function formatWorkflowChecklistBottleneck(item, options = {}) {
  if (!item) return void 0;
  const identity = [item.label, item.agent && item.agent !== item.label ? item.agent : void 0].filter((value) => Boolean(value)).join(" \xB7 ") || item.key;
  const includeOutput = options.includeOutput ?? true;
  const includeError = options.includeError ?? true;
  const details = [item.context ? `(${item.context})` : void 0, item.currentTool ? `${item.currentTool}${item.durationMs !== void 0 ? ` ${formatDurationText(item.durationMs)}` : ""}` : void 0, !item.currentTool && item.currentPath ? item.currentPath : void 0, !item.currentTool && item.durationMs !== void 0 ? formatDurationText(item.durationMs) : void 0, item.toolCount !== void 0 ? `${item.toolCount} tools` : void 0, includeOutput && item.outputName ? `out:${item.outputName}` : void 0, includeError && item.error ? `error:${item.error.replace(/\bOutput:/g, "output:")}` : void 0].filter((value) => Boolean(value));
  return [identity, ...details].join(" \xB7 ");
}
function formatWorkflowChecklistItem(item) {
  const identity = [item.label, item.agent && item.agent !== item.label ? item.agent : void 0].filter((value) => Boolean(value)).join(" \xB7 ") || item.key;
  const details = [item.kind && item.monitorKind ? item.monitorKind : void 0, item.provider ? `provider:${item.provider}` : void 0, item.role ? `role:${item.role}` : void 0, item.target, item.currentTool, !item.currentTool && item.currentPath ? item.currentPath : void 0, item.durationMs !== void 0 ? formatDurationText(item.durationMs) : void 0, item.toolCount !== void 0 ? `${item.toolCount} tools` : void 0, item.outputName ? `out:${item.outputName}` : void 0, item.reportPath ? `out:${item.reportPath}` : void 0, item.stale ? "stale" : void 0, item.reasonCode ? `reason:${item.reasonCode}` : void 0, item.error ? `error:${item.error.replace(/\bOutput:/g, "output:")}` : void 0].filter((value) => Boolean(value));
  return `${identity}${item.context ? ` (${item.context})` : ""}${item.state === "complete" ? "" : ` \xB7 ${stateLabel(item.state)}`}${details.length ? ` \xB7 ${details.join(" \xB7 ")}` : ""}`;
}
function formatDurationText(ms) {
  const seconds = Math.max(0, Math.round(ms / 1e3));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
function formatWorkflowChecklistText(projection, indent = "", options = {}) {
  if (!projection.total) return [];
  const lines = [`${indent}Workflow checklist: ${formatWorkflowChecklistSummary(projection)}`];
  for (const phase of projection.phases) {
    const phaseMarker = phase.state === "complete" ? "\u2713" : phase.state === "running" ? "\u283C" : phase.state === "blocked" ? "!" : phase.state === "failed" ? "\u2717" : phase.state === "paused" || phase.state === "stopped" ? "\u25A0" : "\u25E6";
    lines.push(`${indent}  ${phaseMarker} ${formatWorkflowChecklistPhase(phase)}`);
    if (options.includeItems === false) continue;
    for (const item of phase.items) {
      const marker = item.state === "complete" ? "\u2713" : item.state === "running" ? "\u283C" : item.state === "blocked" ? "!" : item.state === "failed" ? "\u2717" : item.state === "paused" || item.state === "stopped" ? "\u25A0" : "\u25E6";
      lines.push(`${indent}    ${marker} ${formatWorkflowChecklistItem(item)}`);
    }
  }
  const bottleneck = formatWorkflowChecklistBottleneck(projection.bottleneck, { includeError: options.includeItems === false });
  if (bottleneck) lines.push(`${indent}  bottleneck \xB7 ${bottleneck}`);
  return lines;
}

// src/runs/shared/run-ownership.ts
function ownerSessionIds(sessionId) {
  return /* @__PURE__ */ new Set([sessionId, ...inheritedSessionIds(sessionId)]);
}
function ownsRun(currentSessionId, runSessionId) {
  return currentSessionId ? ownerSessionIds(currentSessionId).has(runSessionId) : false;
}

// src/runs/background/async-status.ts
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function isAsyncStatusIsolationError(asyncDir, error) {
  const statusPath = path3.join(asyncDir, "status.json");
  const message = getErrorMessage(error);
  return /^(?:Failed to (?:inspect|read|parse|validate) async status file|Invalid async status file) '/.test(message) || message.startsWith(`Invalid async status '${statusPath}'`) || message.startsWith(`Invalid host step '${statusPath}`) || /^(workflowChildren|Invalid workflowChildren)/.test(message);
}
var reportedCorruptStatus = /* @__PURE__ */ new Map();
function isolateCorruptActiveRun(asyncDir, runId, error, now) {
  const statusPath = path3.join(asyncDir, "status.json");
  const processTerminal = readProcessTerminal(asyncDir, { runId });
  let markerAge;
  try {
    markerAge = activeRunMarkerAgeMs(asyncDir, now?.());
  } catch (markerError) {
    console.error(`Failed to inspect corrupt async active-run marker for '${runId}':`, markerError);
  }
  const markerCanBeReleased = processTerminal?.state === "observed" || markerAge !== void 0 && markerAge > DEFAULT_STALE_TERMINAL_ACTIVE_MARKER_MS;
  let markerAction = "active marker retained because runner liveness is unknown";
  if (markerCanBeReleased) {
    try {
      releaseActiveRunIndex(asyncDir);
      markerAction = processTerminal?.state === "observed" ? "active marker released after observed process-terminal proof" : "stale active marker released";
    } catch (releaseError) {
      markerAction = `failed to release active marker: ${getErrorMessage(releaseError)}`;
    }
  }
  const line = `[pi-subagents] Skipping corrupt active async run '${runId}' at '${statusPath}': ${getErrorMessage(error)}; ${markerAction}.`;
  let fileSignature = "";
  try {
    const stat = fs3.statSync(statusPath);
    fileSignature = `${stat.size}:${stat.mtimeMs}`;
  } catch {
  }
  const signature = `${fileSignature}
${line}`;
  if (reportedCorruptStatus.get(statusPath) === signature) return;
  reportedCorruptStatus.set(statusPath, signature);
  console.error(line);
}
function isNotFoundError(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function isAsyncRunDir(root, entry) {
  const entryPath = path3.join(root, entry);
  try {
    return fs3.statSync(entryPath).isDirectory();
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw new Error(`Failed to inspect async run path '${entryPath}': ${getErrorMessage(error)}`, {
      cause: error instanceof Error ? error : void 0
    });
  }
}
function resolveTargetedAsyncRun(asyncDirRoot, id, sessionId) {
  if (!id || id === "." || id === ".." || id === ACTIVE_RUN_INDEX_DIR || id === TERMINAL_RUN_INDEX_DIR || path3.basename(id) !== id) return { kind: "reject" };
  const asyncDir = path3.join(asyncDirRoot, id);
  let entryStat;
  try {
    entryStat = fs3.lstatSync(asyncDir);
  } catch (error) {
    if (isNotFoundError(error)) return canScanAsyncRunPrefix(id) ? { kind: "prefix" } : { kind: "reject" };
    throw new Error(`Failed to inspect async run path '${asyncDir}': ${getErrorMessage(error)}`, {
      cause: error instanceof Error ? error : void 0
    });
  }
  if (!entryStat.isDirectory() || entryStat.isSymbolicLink()) return { kind: "reject" };
  try {
    const canonicalRoot = fs3.realpathSync(asyncDirRoot);
    const canonicalDir = fs3.realpathSync(asyncDir);
    if (canonicalDir !== canonicalRoot && !canonicalDir.startsWith(`${canonicalRoot}${path3.sep}`)) return { kind: "reject" };
  } catch (error) {
    if (isNotFoundError(error)) return { kind: "reject" };
    throw new Error(`Failed to resolve async run path '${asyncDir}': ${getErrorMessage(error)}`, {
      cause: error instanceof Error ? error : void 0
    });
  }
  if (sessionId !== void 0) {
    const status = readStatus(asyncDir);
    if (!ownerSessionIds(sessionId).has(status?.sessionId)) return canScanAsyncRunPrefix(id) ? { kind: "prefix" } : { kind: "reject" };
  }
  return { kind: "exact", id };
}
function outputFileMtime(outputFile) {
  if (!outputFile) return void 0;
  try {
    return fs3.statSync(outputFile).mtimeMs;
  } catch (error) {
    if (isNotFoundError(error)) return void 0;
    throw new Error(`Failed to inspect async output file '${outputFile}': ${getErrorMessage(error)}`, {
      cause: error instanceof Error ? error : void 0
    });
  }
}
function deriveAsyncActivityState(asyncDir, status) {
  if (status.state !== "running") return { activityState: status.activityState, lastActivityAt: status.lastActivityAt };
  const outputPath = status.outputFile ? path3.isAbsolute(status.outputFile) ? status.outputFile : path3.join(asyncDir, status.outputFile) : void 0;
  const currentStep = typeof status.currentStep === "number" ? status.steps?.[status.currentStep] : void 0;
  return {
    activityState: status.activityState,
    lastActivityAt: status.lastActivityAt ?? outputFileMtime(outputPath) ?? currentStep?.lastActivityAt ?? (status.mode === "workflow" ? void 0 : currentStep?.startedAt ?? status.startedAt)
  };
}
function statusToSummary(asyncDir, status, nestedWarnings = [], nestedRoute) {
  const statusPath = path3.join(asyncDir, "status.json");
  validateAsyncStatusLaneMetadata(status, `Invalid async status '${statusPath}'`);
  const workflowChildren = parseWorkflowChildSummary(status.workflowChildren);
  if (workflowChildren && status.mode === "workflow") workflowChildren.children = workflowChildren.children.map((child) => withWorkflowChildRunModel(asyncDir, child));
  if (workflowChildren && workflowChildren.workflowRunId !== status.runId) throw new Error(`Invalid async status '${statusPath}': workflowChildren.workflowRunId does not match.`);
  assertWorkflowGraphHostSteps(status.workflowGraph, statusPath, status.runId);
  const hostSteps = validHostStepNodes(status.workflowGraph);
  if (status.sessionId !== void 0 && typeof status.sessionId !== "string") {
    throw new Error(`Invalid async status '${statusPath}': sessionId must be a string.`);
  }
  if (status.outputFile !== void 0 && typeof status.outputFile !== "string") throw new Error(`Invalid async status '${statusPath}': outputFile must be a string.`);
  const { activityState, lastActivityAt } = deriveAsyncActivityState(asyncDir, status);
  const processTerminal = readProcessTerminal(asyncDir, { runId: status.runId, runnerProcessInstanceId: status.processTerminal?.runnerProcessInstanceId }) ?? sanitizeProcessTerminal(status.processTerminal, { runId: status.runId, runnerProcessInstanceId: status.processTerminal?.runnerProcessInstanceId }, path3.join(asyncDir, "status.json"));
  const nestedProjectionAllowed = nestedWarnings.length === 0;
  let runFanoutBudget = status.runFanoutBudget;
  try {
    const runFanoutBudgetDescriptor = readRunFanoutBudgetDescriptor(asyncDir);
    if (runFanoutBudgetDescriptor) runFanoutBudget = getRunFanoutBudgetSnapshot(runFanoutBudgetDescriptor);
  } catch (error) {
    nestedWarnings.push(`Run fan-out status unavailable: ${getErrorMessage(error)}`);
  }
  const steps = status.steps ?? [];
  const chainStepCount = status.chainStepCount ?? steps.length;
  const parallelGroups = normalizeParallelGroups(status.parallelGroups, steps.length, chainStepCount);
  let nestedChildren = [];
  if (nestedProjectionAllowed && nestedRoute) {
    try {
      nestedChildren = projectNestedEvents(nestedRoute)?.children ?? [];
    } catch (error) {
      nestedWarnings.push(`Nested status unavailable: ${getErrorMessage(error)}`);
    }
  }
  const summarizedSteps = steps.map((step, index) => {
    const stepActivityState = step.activityState;
    const stepLastActivityAt = step.lastActivityAt;
    const timeoutRecovery = projectTimeoutRecovery(step.timeoutRecovery);
    const { model: stepModel, thinking: stepThinking } = status.mode === "workflow" && step.async === true ? withWorkflowChildRunModel(asyncDir, step) : step;
    return {
      index,
      childId: asyncStatusChildIdentity(step, index),
      agent: step.agent,
      ...step.sessionName ? { sessionName: step.sessionName } : {},
      ...step.context ? { context: step.context } : {},
      ...step.label ? { label: step.label } : {},
      ...step.description ? { description: step.description } : {},
      ...step.phase ? { phase: step.phase } : {},
      ...step.workflowKey ? { workflowKey: step.workflowKey } : {},
      ...step.lane ? { lane: step.lane } : {},
      ...step.worktreePath ? { worktreePath: step.worktreePath } : {},
      ...step.branch ? { branch: step.branch } : {},
      ...step.provider ? { provider: step.provider } : {},
      ...step.naming ? { naming: step.naming } : {},
      ...step.runId ? { runId: step.runId } : {},
      ...step.outputName ? { outputName: step.outputName } : {},
      ...step.structured ? { structured: step.structured } : {},
      status: step.status,
      ...step.runner ? { runner: step.runner } : {},
      ...step.externalProcess ? { externalProcess: step.externalProcess } : {},
      ...stepActivityState ? { activityState: stepActivityState } : {},
      ...stepLastActivityAt ? { lastActivityAt: stepLastActivityAt } : {},
      ...step.currentTool ? { currentTool: step.currentTool } : {},
      ...step.currentToolArgs ? { currentToolArgs: step.currentToolArgs } : {},
      ...step.currentToolStartedAt ? { currentToolStartedAt: step.currentToolStartedAt } : {},
      ...step.currentPath ? { currentPath: step.currentPath } : {},
      ...step.recentTools ? { recentTools: step.recentTools.map((tool) => ({ ...tool })) } : {},
      ...step.recentOutput ? { recentOutput: [...step.recentOutput] } : {},
      ...step.turnCount !== void 0 ? { turnCount: step.turnCount } : {},
      ...step.toolCount !== void 0 ? { toolCount: step.toolCount } : {},
      ...step.steering ? { steering: step.steering } : {},
      ...step.durationMs !== void 0 ? { durationMs: step.durationMs } : {},
      ...step.tokens ? { tokens: step.tokens } : {},
      ...step.totalCost ? { totalCost: step.totalCost } : {},
      ...step.skills ? { skills: step.skills } : {},
      ...stepModel ? { model: stepModel } : {},
      ...step.contextLimit !== void 0 ? { contextLimit: step.contextLimit } : {},
      ...stepThinking ? { thinking: stepThinking } : {},
      ...step.thinkingCeiling ? { thinkingCeiling: step.thinkingCeiling } : {},
      ...step.requestedModel ? { requestedModel: step.requestedModel } : {},
      ...step.sessionFile ? { sessionFile: step.sessionFile } : {},
      ...step.transcriptPath ? { transcriptPath: step.transcriptPath } : {},
      ...step.error ? { error: step.error } : {},
      ...step.timedOut !== void 0 ? { timedOut: step.timedOut } : {},
      ...step.stopped !== void 0 ? { stopped: step.stopped } : {},
      ...step.stopRequested !== void 0 ? { stopRequested: step.stopRequested } : {},
      ...step.stopRequestedAt !== void 0 ? { stopRequestedAt: step.stopRequestedAt } : {},
      ...step.turnBudget ? { turnBudget: step.turnBudget } : {},
      ...step.turnBudgetExceeded !== void 0 ? { turnBudgetExceeded: step.turnBudgetExceeded } : {},
      ...step.toolBudgetBlocked !== void 0 ? { toolBudgetBlocked: step.toolBudgetBlocked } : {},
      ...step.wrapUpRequested !== void 0 ? { wrapUpRequested: step.wrapUpRequested } : {},
      ...step.acceptance ? { acceptance: step.acceptance } : {},
      ...step.agentContract ? { agentContract: step.agentContract } : {},
      ...step.launchContractDigest ? { launchContractDigest: step.launchContractDigest } : {},
      ...step.launchResolvedExtensions ? { launchResolvedExtensions: step.launchResolvedExtensions } : {},
      ...step.runtimeAcknowledgedExtensions ? { runtimeAcknowledgedExtensions: step.runtimeAcknowledgedExtensions } : {},
      ...step.execution ? { execution: step.execution } : {},
      ...step.review ? { review: step.review } : {},
      ...step.effects ? { effects: step.effects } : {},
      ...step.watchdog ? { watchdog: childWatchdogProgressForModel(step.watchdog) } : {},
      ...step.processTerminal ? { processTerminal: sanitizeProcessTerminal(step.processTerminal, { runId: status.runId, runnerProcessInstanceId: step.processTerminal.runnerProcessInstanceId }, `${path3.join(asyncDir, "status.json")} step ${index}`) } : {},
      ...timeoutRecovery ? { timeoutRecovery } : {},
      ...step.capabilityCeiling ? { capabilityCeiling: step.capabilityCeiling } : {},
      ...step.capabilityAudit ? { capabilityAudit: step.capabilityAudit } : {},
      ...step.children?.length ? { children: step.children } : {}
    };
  });
  attachRootChildrenToSteps(status.runId || path3.basename(asyncDir), summarizedSteps, nestedChildren);
  return {
    id: status.runId || path3.basename(asyncDir),
    asyncDir,
    ...status.toolCallId ? { toolCallId: status.toolCallId } : {},
    ...status.sessionId ? { sessionId: status.sessionId } : {},
    state: status.state,
    ...status.error ? { error: status.error } : {},
    activityState,
    lastActivityAt,
    currentTool: status.currentTool,
    currentToolStartedAt: status.currentToolStartedAt,
    currentPath: status.currentPath,
    turnCount: status.turnCount,
    toolCount: status.toolCount,
    steering: status.steering,
    mode: status.mode,
    ...summarizeContextModes(summarizedSteps.map((step) => step.context)) ? { context: summarizeContextModes(summarizedSteps.map((step) => step.context)) } : {},
    cwd: status.cwd,
    ...status.sessionRoot ? { sessionRoot: status.sessionRoot } : {},
    startedAt: status.startedAt,
    lastUpdate: status.lastUpdate,
    endedAt: status.endedAt,
    ...status.timeoutMs !== void 0 ? { timeoutMs: status.timeoutMs } : {},
    ...status.deadlineAt !== void 0 ? { deadlineAt: status.deadlineAt } : {},
    ...status.timedOut !== void 0 ? { timedOut: status.timedOut } : {},
    ...status.stopped !== void 0 ? { stopped: status.stopped } : {},
    ...status.turnBudget ? { turnBudget: status.turnBudget } : {},
    ...status.turnBudgetExceeded !== void 0 ? { turnBudgetExceeded: status.turnBudgetExceeded } : {},
    ...status.wrapUpRequested !== void 0 ? { wrapUpRequested: status.wrapUpRequested } : {},
    currentStep: status.currentStep,
    ...status.chainStepCount !== void 0 ? { chainStepCount: status.chainStepCount } : {},
    ...status.pendingAppends !== void 0 ? { pendingAppends: status.pendingAppends } : {},
    ...parallelGroups.length ? { parallelGroups } : {},
    ...hostSteps.length ? { hostSteps } : {},
    ...status.mode === "workflow" && status.workflowGraph ? { workflowGraph: status.workflowGraph } : {},
    steps: summarizedSteps,
    ...nestedChildren.length ? { nestedChildren } : {},
    ...nestedWarnings.length ? { nestedWarnings } : {},
    ...processTerminal ? { processTerminal } : {},
    ...runFanoutBudget ? { runFanoutBudget } : {},
    ...status.launchContractDigest ? { launchContractDigest: status.launchContractDigest } : {},
    ...status.launchResolvedExtensions ? { launchResolvedExtensions: status.launchResolvedExtensions } : {},
    ...status.runtimeAcknowledgedExtensions ? { runtimeAcknowledgedExtensions: status.runtimeAcknowledgedExtensions } : {},
    ...status.capabilityCeiling ? { capabilityCeiling: status.capabilityCeiling } : {},
    ...status.capabilityAudit ? { capabilityAudit: status.capabilityAudit } : {},
    ...status.parentWorkflowRunId ? { parentWorkflowRunId: status.parentWorkflowRunId } : {},
    ...status.workflowKey ? { workflowKey: status.workflowKey } : {},
    ...status.lane ? { lane: status.lane } : {},
    ...status.workflow ? { workflow: status.workflow } : {},
    ...workflowChildren ? { workflowChildren } : {},
    ...status.preflight ? { preflight: status.preflight } : {},
    ...status.sessionDir ? { sessionDir: status.sessionDir } : {},
    ...status.outputFile ? { outputFile: status.outputFile } : {},
    ...status.totalTokens ? { totalTokens: status.totalTokens } : {},
    ...status.totalCost ? { totalCost: status.totalCost } : {},
    ...status.usageBudget ? { usageBudget: status.usageBudget } : {},
    ...status.sessionFile ? { sessionFile: status.sessionFile } : {}
  };
}
function sortRuns(runs) {
  const rank = (state) => {
    switch (state) {
      case "running":
        return 0;
      case "queued":
        return 1;
      case "failed":
        return 2;
      case "partial":
        return 2;
      case "stopped":
        return 2;
      case "paused":
        return 2;
      case "complete":
        return 3;
      default:
        return 4;
    }
  };
  return [...runs].sort((a, b) => {
    const byState = rank(a.state) - rank(b.state);
    if (byState !== 0) return byState;
    const aTime = a.lastUpdate ?? a.endedAt ?? a.startedAt;
    const bTime = b.lastUpdate ?? b.endedAt ?? b.startedAt;
    return bTime - aTime;
  });
}
function listAsyncRuns(asyncDirRoot, options = {}, observeStatus) {
  let entries;
  const activeEntries = /* @__PURE__ */ new Set();
  const wantsActive = options.states === void 0 || options.states.some(isActiveAsyncState);
  const wantsTerminal = options.states === void 0 || options.states.some((state) => !isActiveAsyncState(state));
  const includeNested = options.includeNested !== false;
  const owners = options.sessionId === void 0 ? void 0 : ownerSessionIds(options.sessionId);
  try {
    if (options.runId !== void 0) {
      const resolution = resolveTargetedAsyncRun(asyncDirRoot, options.runId, options.sessionId);
      entries = resolution.kind === "exact" ? [resolution.id] : resolution.kind === "prefix" && options.exactRunId !== true ? fs3.readdirSync(asyncDirRoot).filter(
        (entry) => (entry === options.runId || entry.startsWith(options.runId)) && resolveTargetedAsyncRun(asyncDirRoot, entry, options.sessionId).kind === "exact"
      ) : [];
    } else if (options.repairScan === true) {
      entries = fs3.readdirSync(asyncDirRoot).filter((entry) => entry !== ACTIVE_RUN_INDEX_DIR && entry !== TERMINAL_RUN_INDEX_DIR && isAsyncRunDir(asyncDirRoot, entry));
    } else {
      const indexed = /* @__PURE__ */ new Set();
      if (wantsActive) {
        for (const entry of readActiveRunIndex(asyncDirRoot) ?? []) {
          if (resolveTargetedAsyncRun(asyncDirRoot, entry).kind === "exact") {
            indexed.add(entry);
            activeEntries.add(entry);
          } else {
            observeStatus?.(null);
            updateActiveRunIndex(path3.join(asyncDirRoot, entry), "failed");
          }
        }
      }
      if (wantsTerminal) {
        for (const sessionId of owners ?? [void 0]) {
          for (const entry of readRecentTerminalRunIndex(asyncDirRoot, { sessionId, onCorruptStatus: options.onCorruptStatus, ...options.entryLimit !== void 0 ? { limit: options.entryLimit } : {} })) indexed.add(entry);
        }
      }
      entries = [...indexed];
    }
  } catch (error) {
    if (isNotFoundError(error)) return [];
    observeStatus?.(null);
    throw new Error(`Failed to list async runs in '${asyncDirRoot}': ${getErrorMessage(error)}`, {
      cause: error instanceof Error ? error : void 0
    });
  }
  const allowedStates = options.states ? new Set(options.states) : void 0;
  const runs = [];
  let nestedRouteIndex;
  const resolveNestedRoute = (rootRunId) => {
    if (!includeNested) return void 0;
    if (activeEntries.has(rootRunId)) return findNestedRouteForRootId(rootRunId);
    if (!nestedRouteIndex) nestedRouteIndex = buildNestedRouteIndex();
    return nestedRouteIndex.get(rootRunId);
  };
  for (const entry of entries) {
    const asyncDir = path3.join(asyncDirRoot, entry);
    let status;
    try {
      let owned = false;
      if (owners) {
        const stored = readStatus(asyncDir);
        if (stored && !owners.has(stored.sessionId)) {
          observeStatus?.(stored);
          continue;
        }
        owned = stored !== null;
      }
      const reconciliation = options.reconcile === false ? void 0 : reconcileAsyncRun(asyncDir, { resultsDir: options.resultsDir, kill: options.kill, now: options.now, adoptCompletionOwnerId: owned ? options.adoptCompletionOwnerId : void 0 }, observeStatus);
      status = reconciliation?.status ?? readStatus(asyncDir);
      if (options.reconcile === false) observeStatus?.(status);
    } catch (error) {
      observeStatus?.(null);
      if (!activeEntries.has(entry) || !isAsyncStatusIsolationError(asyncDir, error)) throw error;
      isolateCorruptActiveRun(asyncDir, entry, error, options.now);
      continue;
    }
    if (!status) {
      observeStatus?.(null);
      if (activeEntries.has(entry)) updateActiveRunIndex(asyncDir, "failed");
      continue;
    }
    if (activeEntries.has(entry) && !isActiveAsyncState(status.state)) {
      const processTerminal = readProcessTerminal(asyncDir, { runId: status.runId, runnerProcessInstanceId: status.processTerminal?.runnerProcessInstanceId });
      if (processTerminal?.state === "observed" || (activeRunMarkerAgeMs(asyncDir, options.now?.()) ?? 0) > DEFAULT_STALE_TERMINAL_ACTIVE_MARKER_MS) {
        updateActiveRunIndex(asyncDir, status.state, status.toolCallId, { terminalIndexBeforeRelease: true });
      }
    }
    if (status.displayDismissedAt !== void 0) continue;
    if (allowedStates && !allowedStates.has(status.state)) continue;
    if (owners && !owners.has(status.sessionId)) continue;
    const nestedWarnings = [];
    let nestedRoute;
    if (options.reconcile !== false && includeNested) {
      try {
        nestedRoute = resolveNestedRoute(status.runId || path3.basename(asyncDir));
        if (nestedRoute) reconcileNestedAsyncDescendants(nestedRoute, { resultsDir: options.resultsDir, kill: options.kill, now: options.now });
      } catch (error) {
        observeStatus?.(null);
        nestedWarnings.push(`Nested status unavailable: ${getErrorMessage(error)}`);
      }
    }
    let summary;
    try {
      summary = statusToSummary(asyncDir, status, nestedWarnings, nestedRoute);
    } catch (error) {
      observeStatus?.(null);
      if (!activeEntries.has(entry) || !isAsyncStatusIsolationError(asyncDir, error)) throw error;
      isolateCorruptActiveRun(asyncDir, entry, error, options.now);
      continue;
    }
    runs.push(summary);
  }
  const sorted = sortRuns(runs);
  return options.limit !== void 0 ? sorted.slice(0, options.limit) : sorted;
}
function formatActivityFacts(input) {
  const facts = [];
  if (input.currentTool && input.currentToolStartedAt !== void 0) facts.push(`tool ${input.currentTool} ${formatDuration(Math.max(0, Date.now() - input.currentToolStartedAt))}`);
  else if (input.currentTool) facts.push(`tool ${input.currentTool}`);
  if (input.currentPath) facts.push(shortenPath(input.currentPath));
  if (input.turnCount !== void 0) facts.push(`${input.turnCount} turns`);
  if (input.turnBudgetExceeded && input.turnBudget) facts.push(`turn budget exceeded ${input.turnBudget.turnCount}/${input.turnBudget.maxTurns}+${input.turnBudget.graceTurns}`);
  else if (input.turnBudget?.outcome === "termination-deferred") facts.push(`turn-budget termination deferred ${input.turnBudget.turnCount}/${input.turnBudget.maxTurns}+${input.turnBudget.graceTurns}`);
  else if (input.wrapUpRequested && input.turnBudget) facts.push(`wrap-up requested ${input.turnBudget.turnCount}/${input.turnBudget.maxTurns}`);
  else if (input.turnBudget) facts.push(`turn budget ${input.turnBudget.turnCount}/${input.turnBudget.maxTurns}+${input.turnBudget.graceTurns}`);
  if (input.toolCount !== void 0) facts.push(`${input.toolCount} tools`);
  if (input.steering) facts.push(`steering ${input.steering.scheduled} scheduled, ${input.steering.pending} pending, ${input.steering.delivered} delivered, ${input.steering.failed} failed, ${input.steering.recovered} recovered`);
  const activity = formatActivityLabel(input.lastActivityAt, input.activityState);
  return activity || facts.length ? [activity, ...facts].filter(Boolean).join(" | ") : void 0;
}
function formatStepLine(step) {
  const display = step.sessionName?.trim() || (step.label ? `${step.label} (${step.agent})` : step.agent);
  const context = contextModeLabel(step.context);
  const phase = step.phase ? `[${step.phase}] ` : "";
  const parts = [`${step.index + 1}. ${phase}${display}${context ? ` ${context}` : ""}`, step.status];
  const activity = formatActivityFacts(step);
  if (activity) parts.push(activity);
  const modelThinking = formatModelThinking(step.model, step.thinking);
  if (modelThinking) parts.push(modelThinking);
  if (step.durationMs !== void 0) parts.push(formatDuration(step.durationMs));
  if (step.tokens) parts.push(`${formatTokens(step.tokens.total)} tok`);
  if (step.lane) parts.push(`lane ${step.lane.key}`);
  if (step.worktreePath) parts.push(`worktree ${shortenPath(step.worktreePath)} \xB7 branch ${step.branch ?? "unknown"}${step.provider ? ` \xB7 provider ${step.provider}` : ""}`);
  return parts.join(" | ");
}
function formatHostStepLine(row) {
  if (!row.kind) return "";
  const state = hostStepVerdictLabel(row.state, row.verdict);
  const details = [
    row.provider ? `provider:${row.provider}` : void 0,
    row.role ? `role:${row.role}` : void 0,
    row.target,
    row.detail,
    row.reasonCode ? `reason:${row.reasonCode}` : void 0,
    row.freshness?.stale ? "stale" : row.freshness?.observedRef ? `ref:${row.freshness.observedRef}` : void 0,
    row.reportPath ? `out:${hostStepReportName(row.reportPath)}` : void 0
  ].filter((value) => Boolean(value));
  return `host ${row.kind}: ${row.name} | ${state}${details.length ? ` | ${details.join(" | ")}` : ""}`;
}
function workflowStageStateLabel(status) {
  switch (status) {
    case "completed":
      return "complete";
    case "detached":
      return "paused";
    default:
      return status;
  }
}
function formatWorkflowStageLine(node, index, total) {
  const state = workflowStageStateLabel(node.status);
  const id = previewDisplayText(node.id, 160);
  const label = node.label ? previewDisplayText(node.label, 160) : "";
  const display = label && label !== id ? ` | ${label}` : "";
  const agent = node.agent ? ` | ${previewDisplayText(node.agent, 80)}` : "";
  const error = node.error ? ` | ${previewDisplayText(node.error, 240)}` : "";
  return `stage ${index + 1}/${total}: ${id}${display}${agent} | ${state}${error}`;
}
function formatAsyncRunOutputPath(run) {
  if (!run.outputFile) return void 0;
  return path3.isAbsolute(run.outputFile) ? run.outputFile : path3.join(run.asyncDir, run.outputFile);
}
function formatAsyncRunProgressLabel(run) {
  const graphStages = run.mode === "workflow" ? workflowGraphStageNodes(run.workflowGraph) : [];
  if (graphStages.length > 0) {
    const currentNode = graphStages.find((node) => node.id === run.workflowGraph?.currentNodeId);
    if (currentNode && currentNode.status !== "completed") return `stage ${graphStages.indexOf(currentNode) + 1}/${graphStages.length}`;
    const activeNode = graphStages.find((node) => node.status === "running") ?? graphStages.find((node) => node.status !== "completed");
    if (activeNode) return `stage ${graphStages.indexOf(activeNode) + 1}/${graphStages.length}`;
    return `stage ${graphStages.length}/${graphStages.length}`;
  }
  const stepCount = run.steps.length || 1;
  const chainStepCount = run.chainStepCount ?? stepCount;
  const groups = normalizeParallelGroups(run.parallelGroups, run.steps.length, chainStepCount);
  const activeGroup = run.currentStep !== void 0 ? groups.find((group) => run.currentStep >= group.start && run.currentStep < group.start + group.count) : void 0;
  if (activeGroup) {
    const groupSteps = run.steps.slice(activeGroup.start, activeGroup.start + activeGroup.count);
    const groupLabel = formatParallelOutcome(groupSteps, activeGroup.count, { showRunning: run.state === "running" });
    if (run.mode === "parallel") return groupLabel;
    return `step ${activeGroup.stepIndex + 1}/${chainStepCount} \xB7 parallel group: ${groupLabel}`;
  }
  if (run.mode === "parallel") return formatParallelOutcome(run.steps, stepCount, { showRunning: run.state === "running" });
  if (run.mode === "chain" && run.currentStep !== void 0 && groups.length > 0) {
    const logicalStep = flatToLogicalStepIndex(run.currentStep, chainStepCount, groups);
    return `step ${logicalStep + 1}/${chainStepCount}`;
  }
  return run.currentStep !== void 0 ? `step ${run.currentStep + 1}/${stepCount}` : `steps ${stepCount}`;
}
function formatRunHeader(run) {
  const stepLabel = formatAsyncRunProgressLabel(run);
  const cwd = run.cwd ? shortenPath(run.cwd) : shortenPath(run.asyncDir);
  const activity = formatActivityFacts(run);
  const pending = run.pendingAppends ? ` | ${run.pendingAppends} pending append${run.pendingAppends === 1 ? "" : "s"}` : "";
  const context = contextModeLabel(run.context);
  const lane = run.lane ? ` | lane ${run.lane.key}` : "";
  return `${run.id} | ${run.state}${activity ? ` | ${activity}` : ""} | ${run.mode}${context ? ` ${context}` : ""} | ${stepLabel}${pending}${lane} | ${cwd}`;
}
function formatAsyncRunList(runs, heading = "Active async runs") {
  if (runs.length === 0) return `No ${heading.toLowerCase()}.`;
  const lines = [`${heading}: ${runs.length}`, ""];
  for (const run of runs) {
    lines.push(`- ${formatRunHeader(run)}`);
    if (run.preflight) lines.push(formatWorkflowPreflightPlanSummary(run.preflight, { indent: "  " }));
    const preflightWarning = formatWorkflowPreflightWarningSummary(run.workflow?.preflightWarnings, { indent: "  " });
    if (preflightWarning) lines.push(preflightWarning);
    if (run.mode === "workflow") {
      const checklist = projectWorkflowChecklist({
        graph: run.workflowGraph,
        steps: run.steps,
        hostSteps: run.hostSteps,
        preflight: run.preflight,
        trace: run.workflow?.trace,
        now: run.lastUpdate ?? run.endedAt ?? Date.now()
      });
      lines.push(...formatWorkflowChecklistText(checklist, "  ", { includeItems: false }));
    }
    for (const step of run.steps) {
      lines.push(`  ${formatStepLine(step)}`);
      lines.push(...formatTimeoutRecoveryLines(step.timeoutRecovery, "    "));
      lines.push(...formatNestedRunStatusLines(step.children, { indent: "    ", maxLines: 12 }));
    }
    const loadedWorkflowKeys = new Set(run.steps.flatMap((step) => step.workflowKey ? [step.workflowKey] : []));
    const graphStages = run.mode === "workflow" ? workflowGraphStageNodes(run.workflowGraph) : [];
    for (const [index, node] of graphStages.entries()) {
      if (!loadedWorkflowKeys.has(node.id)) lines.push(`  ${formatWorkflowStageLine(node, index, graphStages.length)}`);
    }
    for (const row of projectAsyncWorkflowRows([], run.hostSteps)) {
      const line = formatHostStepLine(row);
      if (line) lines.push(`  ${line}`);
    }
    const attached = new Set(run.steps.flatMap((step) => step.children?.map((child) => child.id) ?? []));
    const unattached = run.nestedChildren?.filter((child) => !attached.has(child.id)) ?? [];
    lines.push(...formatNestedRunStatusLines(unattached, { indent: "  ", maxLines: 12 }));
    if (run.runFanoutBudget) lines.push(`  ${formatRunFanoutBudget(run.runFanoutBudget)}`);
    if (run.error) lines.push(`  Error: ${run.error}`);
    for (const warning of run.nestedWarnings ?? []) lines.push(`  Warning: ${warning}`);
    const outputPath = formatAsyncRunOutputPath(run);
    if (outputPath) lines.push(`  output: ${shortenPath(outputPath)}`);
    if (run.sessionFile) lines.push(`  session: ${shortenPath(run.sessionFile)}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

// src/shared/utf8.ts
function decodeUtf8Tail(bytes) {
  let start = 0;
  while (start < bytes.length && (bytes[start] & 192) === 128) start += 1;
  return bytes.subarray(start).toString("utf-8");
}
function utf8Tail(value, maxBytes) {
  const bytes = Buffer.from(value, "utf-8");
  if (bytes.length <= maxBytes) return { text: value, truncated: false };
  return { text: decodeUtf8Tail(bytes.subarray(bytes.length - maxBytes)), truncated: true };
}

// src/runs/shared/worktree-lock.ts
import { spawnSync } from "node:child_process";
import * as fs4 from "node:fs";
import * as path4 from "node:path";
function withHandoffWriteLock(manifestPath, action) {
  const requested = path4.resolve(manifestPath);
  fs4.mkdirSync(path4.dirname(requested), { recursive: true });
  const absolute = path4.join(fs4.realpathSync.native(path4.dirname(requested)), path4.basename(requested));
  const release = tryLease(`${absolute}.write-lock`);
  if (!release) throw new Error(`Handoff is being updated or cleaned: ${absolute}. Retry after the current operation completes.`);
  try {
    return action();
  } finally {
    release();
  }
}
async function withRepositoryWorktreeLock(repo, action, options = {}) {
  const git = spawnSync("git", ["-C", repo, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf-8", windowsHide: true });
  if (git.status !== 0) throw new Error(git.error?.message || git.stderr.trim() || "Cannot resolve Git common directory.");
  const lockPath = path4.join(fs4.realpathSync(git.stdout.trim()), "pi-subagents-worktree.lock");
  const deadline = Date.now() + (options.waitMs ?? 2e3);
  while (true) {
    options.signal?.throwIfAborted();
    const release = tryLease(lockPath);
    if (release) {
      try {
        return await action();
      } finally {
        release();
      }
    }
    if (Date.now() >= deadline) throw new Error("Repository worktree maintenance is busy; retry later.");
    await new Promise((resolve5) => setTimeout(resolve5, 25));
  }
}

// src/runs/shared/parallel-handoff.ts
import * as fs5 from "node:fs";
import * as path5 from "node:path";
function optionalIdentity(value, label) {
  if (value === void 0) return void 0;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}
function nonNegativeIndex(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
  return value;
}
function normalizeLaneBinding(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const binding = value;
  const unknown = Object.keys(binding).filter((field) => !["index", "taskIndex", "workflowKey", "runId", "lane"].includes(field));
  if (unknown.length > 0) throw new Error(`${label} has unsupported fields: ${unknown.join(", ")}.`);
  const index = nonNegativeIndex(binding.index, `${label}.index`);
  const taskIndex = nonNegativeIndex(binding.taskIndex, `${label}.taskIndex`);
  const workflowKey = optionalIdentity(binding.workflowKey, `${label}.workflowKey`);
  const runId = optionalIdentity(binding.runId, `${label}.runId`);
  const lane = normalizeWorkflowLaneMetadata(binding.lane, `${label}.lane`);
  assertWorkflowLaneKey(lane, workflowKey, `${label}.lane`);
  return {
    index,
    taskIndex,
    ...workflowKey ? { workflowKey } : {},
    ...runId ? { runId } : {},
    ...lane ? { lane } : {}
  };
}
function validateManifestIdentity(parsed, manifestPath) {
  if (parsed.version !== 1 || !Array.isArray(parsed.groups)) {
    throw new Error(`Invalid parallel handoff manifest: ${manifestPath}`);
  }
  if (typeof parsed.runId !== "string" || !parsed.runId.trim()) throw new Error(`Invalid parallel handoff manifest '${manifestPath}': runId must be a non-empty string.`);
  parsed.runId = parsed.runId.trim();
  const workflowKeys = /* @__PURE__ */ new Set();
  const childRunIds = /* @__PURE__ */ new Set();
  const childIndexes = /* @__PURE__ */ new Set();
  for (const [groupIndex, group] of parsed.groups.entries()) {
    if (!group || typeof group !== "object" || !Array.isArray(group.children) || !group.cleanup || !Array.isArray(group.cleanup.tasks)) throw new Error(`Invalid parallel handoff manifest '${manifestPath}': groups[${groupIndex}] is malformed.`);
    if (group.laneBindings !== void 0) {
      if (!Array.isArray(group.laneBindings)) throw new Error(`Invalid parallel handoff manifest '${manifestPath}': groups[${groupIndex}].laneBindings must be an array.`);
      const taskIndexes2 = /* @__PURE__ */ new Set();
      const cleanupIndexes = new Set(group.cleanup.tasks.map((task) => task.index));
      group.laneBindings = group.laneBindings.map((binding, bindingIndex) => {
        const normalized = normalizeLaneBinding(binding, `Invalid parallel handoff manifest '${manifestPath}': groups[${groupIndex}].laneBindings[${bindingIndex}]`);
        if (taskIndexes2.has(normalized.taskIndex)) throw new Error(`Invalid parallel handoff manifest '${manifestPath}': groups[${groupIndex}] has duplicate lane binding taskIndex ${normalized.taskIndex}.`);
        if (!cleanupIndexes.has(normalized.taskIndex)) throw new Error(`Invalid parallel handoff manifest '${manifestPath}': groups[${groupIndex}].laneBindings[${bindingIndex}] has no cleanup task for taskIndex ${normalized.taskIndex}.`);
        taskIndexes2.add(normalized.taskIndex);
        return normalized;
      });
    }
    const taskIndexes = /* @__PURE__ */ new Set();
    for (const [childIndex, child] of group.children.entries()) {
      if (!child || typeof child !== "object" || !child.patch || typeof child.patch !== "object") throw new Error(`Invalid parallel handoff manifest '${manifestPath}': groups[${groupIndex}].children[${childIndex}] is malformed.`);
      const childRecord = child;
      const index = nonNegativeIndex(childRecord.index, `Invalid parallel handoff manifest '${manifestPath}': groups[${groupIndex}].children[${childIndex}].index`);
      const taskIndex = nonNegativeIndex(childRecord.taskIndex, `Invalid parallel handoff manifest '${manifestPath}': groups[${groupIndex}].children[${childIndex}].taskIndex`);
      if (taskIndexes.has(taskIndex)) throw new Error(`Invalid parallel handoff manifest '${manifestPath}': groups[${groupIndex}] has duplicate child taskIndex ${taskIndex}.`);
      taskIndexes.add(taskIndex);
      if (childIndexes.has(index)) throw new Error(`Invalid parallel handoff manifest '${manifestPath}': duplicate child index ${index}.`);
      childIndexes.add(index);
      if (!group.cleanup.tasks.some((task) => task.index === taskIndex)) throw new Error(`Invalid parallel handoff manifest '${manifestPath}': groups[${groupIndex}].children[${childIndex}] has no cleanup task for taskIndex ${taskIndex}.`);
      const workflowKey = optionalIdentity(childRecord.workflowKey, `Invalid parallel handoff manifest '${manifestPath}': groups[${groupIndex}].children[${childIndex}].workflowKey`);
      const runId = optionalIdentity(childRecord.runId, `Invalid parallel handoff manifest '${manifestPath}': groups[${groupIndex}].children[${childIndex}].runId`);
      const lane = normalizeWorkflowLaneMetadata(childRecord.lane, `Invalid parallel handoff manifest '${manifestPath}': groups[${groupIndex}].children[${childIndex}].lane`);
      assertWorkflowLaneKey(lane, workflowKey, `Invalid parallel handoff manifest '${manifestPath}': groups[${groupIndex}].children[${childIndex}].lane`);
      if (workflowKey && workflowKeys.has(workflowKey)) throw new Error(`Invalid parallel handoff manifest '${manifestPath}': duplicate workflow key '${workflowKey}'.`);
      if (workflowKey) workflowKeys.add(workflowKey);
      if (runId && childRunIds.has(runId)) throw new Error(`Invalid parallel handoff manifest '${manifestPath}': duplicate child run id '${runId}'.`);
      if (runId) childRunIds.add(runId);
      if (lane) childRecord.lane = lane;
      if (workflowKey) childRecord.workflowKey = workflowKey;
      if (runId) childRecord.runId = runId;
      childRecord.index = index;
      childRecord.taskIndex = taskIndex;
    }
  }
  return parsed;
}
function readParallelHandoffManifest(manifestPath) {
  if (!fs5.existsSync(manifestPath)) return void 0;
  const parsed = JSON.parse(fs5.readFileSync(manifestPath, "utf-8"));
  return validateManifestIdentity(parsed, manifestPath);
}
function resolveExistingPath(candidate) {
  try {
    return fs5.realpathSync(candidate);
  } catch {
    return path5.resolve(candidate);
  }
}
function pathInside(root, candidate) {
  const relative3 = path5.relative(root, candidate);
  return relative3 === "" || relative3 !== ".." && !relative3.startsWith(`..${path5.sep}`) && !path5.isAbsolute(relative3);
}
async function protectRetainedWorktreeForResume(manifestPath, runId, childIndex, signal) {
  const original = readParallelHandoffManifest(manifestPath);
  const group = original?.groups.find((item) => item.children.some((child) => child.index === childIndex));
  if (!group) throw new Error("Retained worktree handoff disappeared before resume admission.");
  return withWorktreeTransaction(() => withRepositoryWorktreeLock(group.repoRoot, () => withHandoffWriteLock(manifestPath, () => {
    signal?.throwIfAborted();
    const cwd = resolveRetainedWorktreeCwd(manifestPath, runId, childIndex);
    if (!cwd) throw new Error("Retained worktree ownership disappeared before resume admission.");
    const manifest = readParallelHandoffManifest(manifestPath);
    const currentGroup = manifest.groups.find((item) => item.children.some((child2) => child2.index === childIndex));
    const child = currentGroup.children.find((item) => item.index === childIndex);
    const task = currentGroup.cleanup.tasks.find((item) => item.index === child.taskIndex);
    task.preserved = true;
    task.reason = "retained child resume requires managed worktree cwd";
    manifest.updatedAt = Date.now();
    writeAtomicJson(manifestPath, manifest);
    return cwd;
  }), { signal }));
}
function resolveRetainedWorktreeCwd(manifestPath, runId, childIndex) {
  const manifest = readParallelHandoffManifest(manifestPath);
  if (!manifest) return void 0;
  if (manifest.runId !== runId) throw new Error(`Managed worktree handoff belongs to run '${manifest.runId}', not '${runId}'.`);
  const match = manifest.groups.flatMap((group) => group.children.map((child) => ({ group, child }))).find(({ child }) => child.index === childIndex);
  if (!match) return void 0;
  const cleanup = match.group.cleanup.tasks.find((task) => task.index === match.child.taskIndex);
  if (!cleanup) throw new Error(`Async run '${runId}' child ${childIndex} has no managed worktree cleanup record.`);
  const relativeCwd = path5.relative(resolveExistingPath(match.group.repoRoot), resolveExistingPath(manifest.cwd));
  if (path5.isAbsolute(relativeCwd) || relativeCwd === ".." || relativeCwd.startsWith(`..${path5.sep}`)) throw new Error(`Async run '${runId}' has an invalid managed worktree cwd.`);
  const requiredCwd = path5.join(cleanup.path, relativeCwd);
  if (cleanup.worktreeRemoved || cleanup.branchRemoved) throw new Error(`Async run '${runId}' required managed worktree was removed: ${requiredCwd}`);
  let worktreeRoot = "";
  let resolvedRequiredCwd = "";
  try {
    const rootStat = fs5.lstatSync(cleanup.path);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("worktree root is not a directory");
    worktreeRoot = fs5.realpathSync(cleanup.path);
    if (!fs5.statSync(requiredCwd).isDirectory()) throw new Error("path is not a directory");
    resolvedRequiredCwd = fs5.realpathSync(requiredCwd);
  } catch (error) {
    throw new Error(`Async run '${runId}' required managed worktree cwd is missing: ${requiredCwd}`, { cause: error instanceof Error ? error : void 0 });
  }
  if (!pathInside(worktreeRoot, resolvedRequiredCwd)) throw new Error(`Async run '${runId}' has an invalid managed worktree cwd.`);
  return requiredCwd;
}
function referenceFor(manifestPath, manifest) {
  const children = manifest.groups.flatMap((group) => group.children);
  return {
    version: 1,
    path: manifestPath,
    groupCount: manifest.groups.length,
    childCount: children.length,
    changedPatches: children.filter((child) => child.patch.changed).length,
    cleanupState: manifest.groups.every((group) => group.cleanup.state === "complete") ? "complete" : "partial",
    ...Object.prototype.hasOwnProperty.call(manifest, "cleanupEligibility") ? { cleanupEligibility: trustedStoredCleanupEligibility(manifest) } : {}
  };
}
var COMMIT_PATTERN = /^[0-9a-f]{40}$/i;
var MANIFEST_DIGEST_PATTERN = /^[0-9a-f]{64}$/i;
var MAX_ATTESTATION_ACTOR_LENGTH = 128;
var MAX_ATTESTATION_TIMESTAMP_LENGTH = 64;
var MAX_SUPERSESSION_ID_LENGTH = 128;
function boundedString(value, label, maxBytes) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  const normalized = value.trim();
  if (normalized.includes("\n") || normalized.includes("\r")) throw new Error(`${label} must not contain newlines.`);
  if (Buffer.byteLength(normalized, "utf-8") > maxBytes) throw new Error(`${label} must be at most ${maxBytes} bytes.`);
  return normalized;
}
function commitString(value, label) {
  const normalized = boundedString(value, label, 64).toLowerCase();
  if (!COMMIT_PATTERN.test(normalized)) throw new Error(`${label} must be a full 40-character commit SHA.`);
  return normalized;
}
function manifestDigestString(value, label) {
  const normalized = boundedString(value, label, 64).toLowerCase();
  if (!MANIFEST_DIGEST_PATTERN.test(normalized)) throw new Error(`${label} must be a full 64-character SHA-256 digest.`);
  return normalized;
}
function manifestFactsDigest(manifest) {
  return stableJsonDigest({
    version: manifest.version,
    runId: manifest.runId,
    mode: manifest.mode,
    source: manifest.source,
    cwd: manifest.cwd,
    groups: manifest.groups
  });
}
function attestationTimestamp(value) {
  const normalized = boundedString(value, "attestedAt", MAX_ATTESTATION_TIMESTAMP_LENGTH);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error("attestedAt must be a valid timestamp.");
  return normalized;
}
function normalizeMergeEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("merge must be an object.");
  const merge = value;
  const prNumber = merge.prNumber;
  if (typeof prNumber !== "number" || !Number.isInteger(prNumber) || prNumber < 1) throw new Error("merge.prNumber must be a positive integer.");
  const treeEquivalent = merge.treeEquivalent;
  if (treeEquivalent !== true && treeEquivalent !== false && treeEquivalent !== "unknown") throw new Error("merge.treeEquivalent must be true, false, or 'unknown'.");
  const postMergeChecks = merge.postMergeChecks;
  if (postMergeChecks !== "recorded" && postMergeChecks !== "unknown") throw new Error("merge.postMergeChecks must be 'recorded' or 'unknown'.");
  return {
    prNumber,
    reviewedHead: commitString(merge.reviewedHead, "merge.reviewedHead"),
    mergeCommit: commitString(merge.mergeCommit, "merge.mergeCommit"),
    treeEquivalent,
    postMergeChecks,
    attestedBy: boundedString(merge.attestedBy, "merge.attestedBy", MAX_ATTESTATION_ACTOR_LENGTH),
    attestedAt: attestationTimestamp(merge.attestedAt),
    ...merge.manifestDigest === void 0 ? {} : { manifestDigest: manifestDigestString(merge.manifestDigest, "merge.manifestDigest") }
  };
}
function normalizeSupersessionEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("supersession must be an object.");
  const supersession = value;
  return {
    supersededBy: boundedString(supersession.supersededBy, "supersession.supersededBy", MAX_SUPERSESSION_ID_LENGTH),
    attestedBy: boundedString(supersession.attestedBy, "supersession.attestedBy", MAX_ATTESTATION_ACTOR_LENGTH),
    attestedAt: attestationTimestamp(supersession.attestedAt),
    ...supersession.manifestDigest === void 0 ? {} : { manifestDigest: manifestDigestString(supersession.manifestDigest, "supersession.manifestDigest") }
  };
}
function normalizeStoredCleanupEligibility(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { state: "unknown" };
  const eligibility = value;
  if (eligibility.state === "active" || eligibility.state === "terminal-eligible" || eligibility.state === "superseded-eligible" || eligibility.state === "unknown") {
    return { state: eligibility.state };
  }
  if (eligibility.state === "terminal-blocked" && typeof eligibility.reason === "string" && eligibility.reason.trim() && !eligibility.reason.includes("\n") && !eligibility.reason.includes("\r")) {
    return { state: "terminal-blocked", reason: eligibility.reason.trim().slice(0, 256) };
  }
  return { state: "unknown" };
}
var STORED_CHILD_STATUSES = /* @__PURE__ */ new Set(["pending", "running", "completed", "complete", "failed", "paused", "stopped", "detached", "rejected"]);
function isTerminalParallelHandoffChildStatus(status) {
  return status === "completed" || status === "complete" || status === "failed" || status === "paused" || status === "stopped" || status === "rejected";
}
function hasValidStoredLaneShape(manifest) {
  if (!manifest || typeof manifest !== "object" || manifest.version !== 1 || typeof manifest.runId !== "string" || !manifest.runId.trim() || !Array.isArray(manifest.groups) || manifest.groups.length === 0) return false;
  let hasManagedTask = false;
  const valid = manifest.groups.every((group) => {
    if (!group || typeof group !== "object" || typeof group.baseCommit !== "string" || !group.baseCommit.trim() || typeof group.repoRoot !== "string" || !group.repoRoot.trim()) return false;
    const cleanup = group.cleanup;
    if (!cleanup || typeof cleanup !== "object" || cleanup.state !== "complete" && cleanup.state !== "partial" || !Array.isArray(cleanup.tasks) || !Array.isArray(group.children)) return false;
    if (cleanup.tasks.some((task) => !task || typeof task !== "object" || !Number.isSafeInteger(task.index) || task.index < 0 || typeof task.path !== "string" || !task.path.trim() || typeof task.branch !== "string" || !task.branch.trim())) return false;
    if (cleanup.tasks.length > 0) hasManagedTask = true;
    return group.children.every((child) => Boolean(child) && typeof child === "object" && typeof child.status === "string" && STORED_CHILD_STATUSES.has(child.status));
  });
  return valid && hasManagedTask;
}
function trustedStoredCleanupEligibility(manifest) {
  const eligibility = normalizeStoredCleanupEligibility(manifest.cleanupEligibility);
  if (!hasValidStoredLaneShape(manifest)) return { state: "unknown" };
  if (hasActiveChildren(manifest)) return { state: "active" };
  if (eligibility.state === "active") return cleanupEligibilityForEvidence(manifest);
  if (eligibility.state === "terminal-eligible" || eligibility.state === "superseded-eligible") {
    const current = cleanupEligibilityForEvidence(manifest);
    if (current.state === eligibility.state || current.state === "terminal-blocked" && / evidence is stale$/.test(current.reason)) return current;
    return { state: "unknown" };
  }
  return eligibility;
}
function hasActiveChildren(manifest) {
  return Array.isArray(manifest.groups) && manifest.groups.some((group) => {
    if (!group || typeof group !== "object") return false;
    const children = Array.isArray(group.children) ? group.children : [];
    if (children.length === 0 && Array.isArray(group.cleanup?.tasks) && group.cleanup.tasks.length > 0) return true;
    return children.some((child) => !child || typeof child !== "object" || !isTerminalParallelHandoffChildStatus(child.status));
  });
}
function hasManagedWorktreeTasks(manifest) {
  return manifest.groups.length > 0 && manifest.groups.some((group) => Array.isArray(group.cleanup?.tasks) && group.cleanup.tasks.length > 0);
}
function validateManifestForLaneEvidence(manifest, laneId) {
  if (manifest.runId !== laneId) throw new Error(`Lane '${laneId}' does not match manifest run '${manifest.runId}'.`);
  if (!hasValidStoredLaneShape(manifest)) throw new Error("Lane manifest is malformed.");
  if (!manifest.groups.length || !hasManagedWorktreeTasks(manifest)) throw new Error("Lane manifest has no managed worktree tasks.");
  if (hasActiveChildren(manifest)) throw new Error("Lane has an active child owner; merge evidence must be recorded after local reconciliation.");
  for (const group of manifest.groups) {
    if (typeof group.repoRoot !== "string" || !group.repoRoot.trim()) throw new Error("Lane manifest has no valid repository root.");
    if (group.cleanup.state !== "complete" && group.cleanup.state !== "partial") throw new Error("Lane manifest has an invalid cleanup state.");
    if (!Array.isArray(group.cleanup.tasks) || group.cleanup.tasks.some((task) => typeof task.path !== "string" || !task.path.trim() || typeof task.branch !== "string" || !task.branch.trim())) {
      throw new Error("Lane manifest has an invalid cleanup task.");
    }
    if (!Array.isArray(group.children)) throw new Error("Lane manifest has invalid child records.");
    for (const child of group.children) {
      if (!STORED_CHILD_STATUSES.has(child.status)) {
        throw new Error("Lane manifest has an invalid child status.");
      }
    }
  }
}
function cleanupEligibilityForEvidence(manifest) {
  if (hasActiveChildren(manifest)) return { state: "active" };
  let merge;
  if (manifest.merge) {
    try {
      merge = normalizeMergeEvidence(manifest.merge);
    } catch {
      return { state: "terminal-blocked", reason: "stored merge evidence is invalid" };
    }
  }
  if (manifest.supersession) {
    try {
      const supersession = normalizeSupersessionEvidence(manifest.supersession);
      if (supersession.manifestDigest !== manifestFactsDigest(manifest)) return { state: "terminal-blocked", reason: "stored supersession evidence is stale" };
    } catch {
      return { state: "terminal-blocked", reason: "stored supersession evidence is invalid" };
    }
    return { state: "superseded-eligible" };
  }
  if (!merge) return { state: "terminal-blocked", reason: "no merge or supersession evidence recorded" };
  if (merge.manifestDigest !== manifestFactsDigest(manifest)) return { state: "terminal-blocked", reason: "stored merge evidence is stale" };
  if (merge.treeEquivalent !== true) {
    return { state: "terminal-blocked", reason: merge.treeEquivalent === "unknown" ? "merged tree equivalence was not attested" : "merged tree is not equivalent to the reviewed head" };
  }
  if (merge.postMergeChecks !== "recorded") return { state: "terminal-blocked", reason: "required post-merge checks were not recorded" };
  return { state: "terminal-eligible" };
}
function sameMergeEvidence(left, right) {
  return left.prNumber === right.prNumber && left.reviewedHead === right.reviewedHead && left.mergeCommit === right.mergeCommit && left.treeEquivalent === right.treeEquivalent && left.postMergeChecks === right.postMergeChecks && left.attestedBy === right.attestedBy && left.attestedAt === right.attestedAt;
}
function sameSupersessionEvidence(left, right) {
  return left.supersededBy === right.supersededBy && left.attestedBy === right.attestedBy && left.attestedAt === right.attestedAt;
}
function firstRepositoryRoot(manifest) {
  const repoRoot = Array.isArray(manifest.groups) ? manifest.groups[0]?.repoRoot : void 0;
  return typeof repoRoot === "string" && repoRoot.trim() ? repoRoot.trim() : void 0;
}
function formatCleanupCommand(manifestPath, manifest) {
  const repoRoot = firstRepositoryRoot(manifest);
  return repoRoot ? `subagent({ action: "worktree.cleanup", options: { repo: ${JSON.stringify(repoRoot)}, handoffPath: ${JSON.stringify(manifestPath)}, mode: "plan" } })` : void 0;
}
function formatStoredParallelHandoffCleanup(manifestPath, manifest) {
  let stored = manifest;
  if (!stored) {
    try {
      stored = readParallelHandoffManifest(manifestPath);
    } catch {
      stored = void 0;
    }
  }
  if (!stored) return ["Cleanup eligibility: unknown", "Reason: lane manifest is missing or invalid; removal is not safe.", `Plan command: subagent({ action: "worktree.cleanup", options: { handoffPath: ${JSON.stringify(manifestPath)}, mode: "plan" } })`].join("\n");
  const eligibility = trustedStoredCleanupEligibility(stored);
  const lines = [`Cleanup eligibility: ${eligibility.state}`];
  if (eligibility.state === "terminal-blocked") lines.push(`Reason: ${eligibility.reason}`);
  if (eligibility.state === "unknown") lines.push("Reason: stored eligibility is missing or invalid; removal is not safe.");
  if (eligibility.state === "active") lines.push("Reason: a child owner is still active; removal is not safe.");
  const command = formatCleanupCommand(manifestPath, stored);
  if (command) lines.push(`Plan command: ${command}`);
  return lines.join("\n");
}
function recordParallelHandoffMerge(...args) {
  return withHandoffWriteLock(args[0].manifestPath, () => recordParallelHandoffMergeUnlocked(...args));
}
function recordParallelHandoffMergeUnlocked(input) {
  const manifest = readParallelHandoffManifest(input.manifestPath);
  if (!manifest) throw new Error(`Parallel handoff manifest not found: ${input.manifestPath}`);
  validateManifestForLaneEvidence(manifest, boundedString(input.laneId, "laneId", MAX_SUPERSESSION_ID_LENGTH));
  if (hasActiveChildren(manifest)) throw new Error("Lane has an active child owner; merge evidence must be recorded after local reconciliation.");
  const merge = { ...normalizeMergeEvidence(input.merge), manifestDigest: manifestFactsDigest(manifest) };
  if (manifest.merge) {
    const existing = normalizeMergeEvidence(manifest.merge);
    if (existing.reviewedHead !== merge.reviewedHead) throw new Error(`Lane manifest is stale: reviewed head is already recorded as ${existing.reviewedHead}.`);
    if (!sameMergeEvidence(existing, merge)) throw new Error("Lane manifest already contains different merge evidence for this reviewed head.");
  }
  const reconciled = { ...manifest, merge };
  delete reconciled.supersession;
  const updated = { ...reconciled, cleanupEligibility: cleanupEligibilityForEvidence(reconciled), updatedAt: input.now ?? Date.now() };
  writeAtomicJson(input.manifestPath, updated);
  return { manifest: updated, reference: referenceFor(input.manifestPath, updated), text: formatStoredParallelHandoffCleanup(input.manifestPath, updated) };
}
function recordParallelHandoffSupersession(...args) {
  return withHandoffWriteLock(args[0].manifestPath, () => recordParallelHandoffSupersessionUnlocked(...args));
}
function recordParallelHandoffSupersessionUnlocked(input) {
  const manifest = readParallelHandoffManifest(input.manifestPath);
  if (!manifest) throw new Error(`Parallel handoff manifest not found: ${input.manifestPath}`);
  const laneId = boundedString(input.laneId, "laneId", MAX_SUPERSESSION_ID_LENGTH);
  validateManifestForLaneEvidence(manifest, laneId);
  if (hasActiveChildren(manifest)) throw new Error("Lane has an active child owner; supersession must be recorded after local reconciliation.");
  const supersession = { ...normalizeSupersessionEvidence(input.supersession), manifestDigest: manifestFactsDigest(manifest) };
  if (supersession.supersededBy === laneId) throw new Error("supersession.supersededBy must identify a different replacement lane.");
  if (manifest.supersession) {
    const existing = normalizeSupersessionEvidence(manifest.supersession);
    if (!sameSupersessionEvidence(existing, supersession)) throw new Error("Lane manifest already contains different supersession evidence.");
  }
  const updated = { ...manifest, supersession, cleanupEligibility: cleanupEligibilityForEvidence({ ...manifest, supersession }), updatedAt: input.now ?? Date.now() };
  writeAtomicJson(input.manifestPath, updated);
  return { manifest: updated, reference: referenceFor(input.manifestPath, updated), text: formatStoredParallelHandoffCleanup(input.manifestPath, updated) };
}
function safeHandoffAgentName(agent) {
  return agent.replace(/[^\w.-]/g, "_");
}
function missingDiff(input) {
  const patchPath = path5.join(path5.dirname(input.manifestPath), `missing-diff-step-${input.stepIndex}-task-${input.taskIndex}-${safeHandoffAgentName(input.agent)}.patch`);
  try {
    fs5.mkdirSync(path5.dirname(patchPath), { recursive: true });
    fs5.writeFileSync(patchPath, "", "utf-8");
  } catch {
  }
  return {
    index: input.taskIndex,
    agent: input.agent,
    branch: input.branch ?? "",
    diffStat: "",
    filesChanged: 0,
    insertions: 0,
    deletions: 0,
    patchPath,
    error: "diff artifact unavailable; no patch was captured"
  };
}
function writeParallelHandoffGroup(...args) {
  return withHandoffWriteLock(args[0].manifestPath, () => writeParallelHandoffGroupUnlocked(...args));
}
function writeParallelHandoffGroupUnlocked(input) {
  const now = input.now ?? Date.now();
  const existing = readParallelHandoffManifest(input.manifestPath);
  if (existing && (existing.runId !== input.runId || existing.mode !== input.mode || existing.source !== input.source)) {
    throw new Error(`Parallel handoff manifest belongs to a different run: ${input.manifestPath}`);
  }
  const laneBindings = input.laneBindings?.map((binding, index) => normalizeLaneBinding(binding, `parallel handoff lane binding ${index}`));
  if (laneBindings) {
    const taskIndexes = /* @__PURE__ */ new Set();
    for (const binding of laneBindings) {
      if (taskIndexes.has(binding.taskIndex)) throw new Error(`Parallel handoff has duplicate lane binding taskIndex ${binding.taskIndex}.`);
      if (!input.setup.worktrees.some((worktree) => worktree.index === binding.taskIndex)) throw new Error(`Parallel handoff lane binding taskIndex ${binding.taskIndex} has no managed worktree.`);
      if (binding.index !== input.flatStartIndex + binding.taskIndex) throw new Error(`Parallel handoff lane binding index ${binding.index} does not match taskIndex ${binding.taskIndex}.`);
      taskIndexes.add(binding.taskIndex);
    }
  }
  const bindingForTask = (taskIndex) => laneBindings?.find((binding) => binding.taskIndex === taskIndex);
  const group = {
    stepIndex: input.stepIndex,
    baseCommit: input.setup.baseCommit,
    repoRoot: input.setup.cwd,
    children: input.results.map((result, taskIndex) => {
      const binding = bindingForTask(taskIndex);
      const runId = optionalIdentity(result.runId ?? binding?.runId, `parallel handoff child ${taskIndex}.runId`);
      const lane = normalizeWorkflowLaneMetadata(result.lane ?? binding?.lane, `parallel handoff child ${taskIndex}.lane`);
      const workflowKey = optionalIdentity(result.workflowKey ?? binding?.workflowKey, `parallel handoff child ${taskIndex}.workflowKey`);
      assertWorkflowLaneKey(lane, workflowKey, `parallel handoff child ${taskIndex}.lane`);
      const diff = input.diffs[taskIndex] ?? missingDiff({
        manifestPath: input.manifestPath,
        stepIndex: input.stepIndex,
        taskIndex,
        agent: result.agent,
        branch: input.setup.worktrees[taskIndex]?.branch
      });
      return {
        index: input.flatStartIndex + taskIndex,
        taskIndex,
        agent: result.agent,
        ...workflowKey ? { workflowKey } : {},
        ...runId ? { runId } : {},
        ...lane ? { lane } : {},
        status: result.status,
        summary: result.summary,
        ...result.outputPath ? { outputPath: result.outputPath } : {},
        ...result.structuredOutput !== void 0 ? { structuredOutput: result.structuredOutput } : {},
        ...result.structuredOutputPath ? { structuredOutputPath: result.structuredOutputPath } : {},
        ...result.sessionPath ? { sessionPath: result.sessionPath } : {},
        patch: {
          path: diff.patchPath,
          branch: diff.branch,
          changed: diff.filesChanged > 0 || diff.insertions > 0 || diff.deletions > 0 || diff.diffStat.trim().length > 0,
          diffStat: diff.diffStat,
          filesChanged: diff.filesChanged,
          insertions: diff.insertions,
          deletions: diff.deletions,
          ...diff.error ? { error: diff.error } : {}
        }
      };
    }),
    ...laneBindings && laneBindings.length > 0 && input.results.length === 0 ? { laneBindings } : {},
    cleanup: input.cleanup ?? {
      state: "partial",
      pruned: false,
      tasks: input.setup.worktrees.map((worktree) => ({
        index: worktree.index,
        path: worktree.path,
        branch: worktree.branch,
        ...worktree.provider ? { provider: worktree.provider } : {},
        ...worktree.naming ? { naming: worktree.naming } : {},
        ...worktree.recordedBaseDir ? { recordedBaseDir: worktree.recordedBaseDir } : {},
        worktreeRemoved: false,
        branchRemoved: false,
        preserved: true,
        reason: "cleanup pending durable handoff capture"
      }))
    }
  };
  for (const task of group.cleanup.tasks) {
    const previous = existing?.groups.flatMap((item) => item.cleanup.tasks).find((item) => item.path === task.path && item.branch === task.branch);
    if (previous?.worktreeRemoved) task.worktreeRemoved = true;
    if (previous?.branchRemoved) task.branchRemoved = true;
    if (!task.worktreeRemoved && previous?.reason?.includes("retained child resume")) {
      task.preserved = true;
      task.reason = previous.reason;
    }
  }
  const groups = existing?.groups.filter((candidate) => candidate.stepIndex !== input.stepIndex) ?? [];
  groups.push(group);
  groups.sort((left, right) => left.stepIndex - right.stepIndex);
  const manifestWithoutEligibility = {
    version: 1,
    runId: input.runId,
    mode: input.mode,
    source: input.source,
    cwd: input.cwd,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    groups,
    ...existing && Object.hasOwn(existing, "merge") ? { merge: existing.merge } : {},
    ...existing && Object.hasOwn(existing, "supersession") ? { supersession: existing.supersession } : {}
  };
  const carriesCleanupMetadata = existing !== void 0 && (Object.hasOwn(existing, "merge") || Object.hasOwn(existing, "supersession") || Object.hasOwn(existing, "cleanupEligibility"));
  const manifest = {
    ...manifestWithoutEligibility,
    ...carriesCleanupMetadata ? { cleanupEligibility: cleanupEligibilityForEvidence(manifestWithoutEligibility) } : {}
  };
  writeAtomicJson(input.manifestPath, manifest);
  return referenceFor(input.manifestPath, manifest);
}
function parallelHandoffPath(baseDir, runId) {
  return runId ? path5.join(baseDir, "handoffs", `${runId}.json`) : path5.join(baseDir, "handoff.json");
}
function writeWorktreeSetupHandoff(input) {
  const { progress, ...handoff } = input;
  const { setup, attempts, cleanup } = progress;
  if (attempts.length === 0 && setup.worktrees.length === 0) return void 0;
  if (!setup.cwd || !setup.baseCommit) throw new Error("Cannot publish worktree allocation evidence without repository and base commit.");
  const diagnostic = (text2) => text2.slice(0, 512);
  const commandEvidence = (command) => command && {
    pid: command.pid,
    processGroupId: command.processGroupId,
    ...command.result ? {
      status: command.result.status,
      signal: command.result.signal,
      failed: Boolean(command.result.error),
      outputIncomplete: command.result.outputIncomplete,
      processTree: command.result.processTree?.state
    } : {}
  };
  const errors = [
    `Worktree setup ${JSON.stringify({
      runId: input.runId,
      stepIndex: input.stepIndex,
      phase: progress.phase,
      unknown: Boolean(progress.unknown),
      command: commandEvidence(progress.command)
    })}`,
    ...attempts.map((attempt) => {
      const task = cleanup?.tasks.find((candidate) => candidate.index === attempt.index);
      return `Allocation attempt ${JSON.stringify({
        index: attempt.index,
        branch: attempt.branch,
        path: attempt.path ?? null,
        validated: attempt.validated,
        command: commandEvidence(attempt.command),
        hookCommand: commandEvidence(attempt.hookCommand),
        ...task ? {
          worktreeRemoved: task.worktreeRemoved,
          branchRemoved: task.branchRemoved,
          preserved: task.preserved,
          reason: task.reason && diagnostic(task.reason),
          errors: task.errors?.map(diagnostic)
        } : {}
      })}`;
    }),
    ...cleanup?.errors?.map(diagnostic) ?? [],
    ...progress.unknown ? ["Setup settlement unknown; manual reconciliation required."] : []
  ];
  return writeParallelHandoffGroup({
    ...handoff,
    setup,
    diffs: [],
    results: [],
    laneBindings: input.laneBindings?.filter((binding) => setup.worktrees.some((worktree) => worktree.index === binding.taskIndex)),
    cleanup: {
      state: cleanup?.state ?? "partial",
      pruned: cleanup?.pruned ?? false,
      errors,
      // An attempted native path is not a validated recovery task, even during rollback.
      tasks: setup.worktrees.map((worktree) => {
        const task = cleanup?.tasks.find((candidate) => candidate.index === worktree.index);
        return task ? { ...task, reason: task.reason && diagnostic(task.reason), errors: task.errors?.map(diagnostic) } : {
          index: worktree.index,
          path: worktree.path,
          branch: worktree.branch,
          provider: worktree.provider,
          naming: worktree.naming,
          recordedBaseDir: worktree.recordedBaseDir,
          worktreeRemoved: false,
          branchRemoved: false,
          preserved: true,
          reason: "setup pending durable handoff capture"
        };
      })
    }
  });
}
function formatParallelHandoffReference(reference) {
  return `Worktree handoff: ${reference.path} (${reference.childCount} children, ${reference.changedPatches} changed patches, cleanup ${reference.cleanupState})`;
}
function formatParallelHandoffError(error) {
  return `Worktree handoff unavailable: ${error instanceof Error ? error.message : String(error)}`;
}
function discardPreservedWorktrees(...args) {
  return withHandoffWriteLock(args[0], () => discardPreservedWorktreesUnlocked(...args));
}
function discardPreservedWorktreesUnlocked(manifestPath, authorization) {
  const resolvedPath = path5.resolve(manifestPath);
  const manifest = readParallelHandoffManifest(resolvedPath);
  if (!manifest) throw new Error(`Parallel handoff manifest not found: ${resolvedPath}`);
  let attempted = 0;
  for (const group of manifest.groups) {
    const pending = group.cleanup.tasks.filter((task) => task.preserved && (!task.worktreeRemoved || !task.branchRemoved));
    if (pending.length === 0) continue;
    attempted += pending.length;
    const report = cleanupWorktrees({
      cwd: group.repoRoot,
      baseCommit: group.baseCommit,
      worktrees: pending.map((task) => ({
        path: task.path,
        agentCwd: task.path,
        branch: task.branch,
        ...task.provider ? { provider: task.provider } : {},
        ...task.naming ? { naming: task.naming } : {},
        ...task.recordedBaseDir ? { recordedBaseDir: task.recordedBaseDir } : {},
        index: task.index,
        nodeModulesLinked: false,
        syntheticPaths: []
      }))
    }, { kind: "discard", authorization });
    const updates = new Map(report.tasks.map((task) => [task.index, task.worktreeRemoved && task.branchRemoved ? task : { ...task, preserved: true, reason: task.reason ?? "discard cleanup remains incomplete" }]));
    group.cleanup = {
      state: group.cleanup.tasks.every((task) => {
        const next = updates.get(task.index) ?? task;
        return next.worktreeRemoved && next.branchRemoved;
      }) && report.pruned ? "complete" : "partial",
      tasks: group.cleanup.tasks.map((task) => updates.get(task.index) ?? task),
      pruned: report.pruned,
      ...report.errors ? { errors: report.errors } : {}
    };
  }
  manifest.updatedAt = Date.now();
  writeAtomicJson(resolvedPath, manifest);
  const remaining = manifest.groups.flatMap((group) => group.cleanup.tasks.map((task) => ({ group, task }))).filter(({ task }) => task.preserved && (!task.worktreeRemoved || !task.branchRemoved));
  const lines = attempted === 0 ? [`No preserved worktrees remain in ${resolvedPath}.`] : [`Discard processed ${attempted} preserved worktree${attempted === 1 ? "" : "s"}.`, `Manifest: ${resolvedPath}`];
  if (remaining.length > 0) {
    lines.push("", "Some worktrees remain. Inspect and remove them manually if appropriate:");
    for (const { group, task } of remaining) {
      lines.push(
        `  git -C ${JSON.stringify(group.repoRoot)} status --short`,
        `  git -C ${JSON.stringify(group.repoRoot)} worktree remove --force ${JSON.stringify(task.path)}`,
        `  git -C ${JSON.stringify(group.repoRoot)} branch -D ${JSON.stringify(task.branch)}`
      );
    }
  }
  return { manifest, text: lines.join("\n") };
}

// src/runs/background/async-resume.ts
import * as fs6 from "node:fs";
import * as path6 from "node:path";
function getErrorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}
function ensureObject(value, source) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Async result file '${source}' must contain a JSON object.`);
  }
  return value;
}
function validateOptionalString(value, field, source, displayField = field) {
  const fieldValue = value[field];
  if (fieldValue === void 0) return void 0;
  if (typeof fieldValue !== "string") throw new Error(`Invalid async result file '${source}': ${displayField} must be a string.`);
  return fieldValue;
}
function validateResultFile(value, resultPath) {
  const data = ensureObject(value, resultPath);
  const resultsValue = data.results;
  let results;
  if (resultsValue !== void 0) {
    if (!Array.isArray(resultsValue)) throw new Error(`Invalid async result file '${resultPath}': results must be an array.`);
    results = resultsValue.map((entry, index) => {
      const child = ensureObject(entry, `${resultPath} results[${index}]`);
      const agent = validateOptionalString(child, "agent", resultPath, `results[${index}].agent`);
      const sessionFile = validateOptionalString(child, "sessionFile", resultPath, `results[${index}].sessionFile`);
      const sessionName = validateOptionalString(child, "sessionName", resultPath, `results[${index}].sessionName`);
      const intercomTarget = validateOptionalString(child, "intercomTarget", resultPath, `results[${index}].intercomTarget`);
      const model = validateOptionalString(child, "model", resultPath, `results[${index}].model`);
      const thinking = validateOptionalString(child, "thinking", resultPath, `results[${index}].thinking`);
      const launchContractDigest = validateOptionalString(child, "launchContractDigest", resultPath, `results[${index}].launchContractDigest`);
      const capabilityCeiling = child.capabilityCeiling === void 0 ? void 0 : parseSubagentCapabilityCeiling(child.capabilityCeiling, `async result file '${resultPath}' results[${index}].capabilityCeiling`);
      const success2 = child.success;
      if (success2 !== void 0 && typeof success2 !== "boolean") throw new Error(`Invalid async result file '${resultPath}': results[${index}].success must be a boolean.`);
      return { agent, sessionName, sessionFile, intercomTarget, model, thinking, launchContractDigest, ...capabilityCeiling ? { capabilityCeiling } : {}, ...typeof success2 === "boolean" ? { success: success2 } : {} };
    });
  }
  const success = data.success;
  if (success !== void 0 && typeof success !== "boolean") throw new Error(`Invalid async result file '${resultPath}': success must be a boolean.`);
  return {
    id: validateOptionalString(data, "id", resultPath),
    runId: validateOptionalString(data, "runId", resultPath),
    agent: validateOptionalString(data, "agent", resultPath),
    mode: validateOptionalString(data, "mode", resultPath),
    state: validateOptionalString(data, "state", resultPath),
    cwd: validateOptionalString(data, "cwd", resultPath),
    sessionId: validateOptionalString(data, "sessionId", resultPath),
    sessionFile: validateOptionalString(data, "sessionFile", resultPath),
    model: validateOptionalString(data, "model", resultPath),
    thinking: validateOptionalString(data, "thinking", resultPath),
    launchContractDigest: validateOptionalString(data, "launchContractDigest", resultPath),
    ...data.capabilityCeiling === void 0 ? {} : { capabilityCeiling: parseSubagentCapabilityCeiling(data.capabilityCeiling, `async result file '${resultPath}' capabilityCeiling`) },
    ...data.admissionCapabilityCeiling === void 0 ? {} : { admissionCapabilityCeiling: parseSubagentCapabilityCeiling(data.admissionCapabilityCeiling, `async result file '${resultPath}' admissionCapabilityCeiling`) },
    ...typeof success === "boolean" ? { success } : {},
    ...results ? { results } : {}
  };
}
function readResultFile(resultPath) {
  let raw;
  try {
    raw = fs6.readFileSync(resultPath, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read async result file '${resultPath}': ${getErrorMessage2(error)}`, {
      cause: error instanceof Error ? error : void 0
    });
  }
  try {
    return validateResultFile(JSON.parse(raw), resultPath);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse async result file '${resultPath}': ${getErrorMessage2(error)}`, {
        cause: error
      });
    }
    throw error;
  }
}
function assertRunId(value, field) {
  if (value === void 0) return void 0;
  if (value.trim() === "") throw new Error(`${field} must not be empty.`);
  if (path6.isAbsolute(value) || /[\\/]/.test(value) || value.includes("..")) {
    throw new Error(`${field} must be an async run id or prefix, not a path.`);
  }
  return value;
}
function assertInsideRoot(root, target, label) {
  const rootPath = path6.resolve(root);
  const targetPath = path6.resolve(target);
  const relative3 = path6.relative(rootPath, targetPath);
  if (relative3 === "" || !relative3.startsWith("..") && !path6.isAbsolute(relative3)) return;
  throw new Error(`${label} must be inside ${rootPath}.`);
}
function prefixedRunIds(dir, prefix, suffix = "") {
  if (!fs6.existsSync(dir)) return [];
  return fs6.readdirSync(dir).filter((entry) => entry.startsWith(prefix) && (!suffix || entry.endsWith(suffix))).map((entry) => suffix ? entry.slice(0, -suffix.length) : entry).sort();
}
function exactResultPath(resultsDir, runId) {
  const indexed = resultPayloadPathForIndexedRun(resultsDir, runId);
  if (indexed) return indexed;
  const resultPath = resultFilePath(resultsDir, runId);
  assertInsideRoot(resultsDir, resultPath, "Async result file");
  return fs6.existsSync(resultPath) ? resultPath : null;
}
function findAsyncRunPrefixMatches(prefix, asyncDirRoot, resultsDir) {
  const requestedId = assertRunId(prefix, "id");
  if (!requestedId) return [];
  if (!canScanAsyncRunPrefix(requestedId)) return [];
  const asyncRoot = path6.resolve(asyncDirRoot);
  const resultRoot = path6.resolve(resultsDir);
  const matchingIds = prefixedRunIds(asyncRoot, requestedId).sort();
  return matchingIds.map((id) => {
    const asyncDir = path6.join(asyncRoot, id);
    assertInsideRoot(asyncRoot, asyncDir, "Async run directory");
    return {
      id,
      location: {
        asyncDir: fs6.existsSync(asyncDir) ? asyncDir : null,
        resultPath: exactResultPath(resultRoot, id),
        resolvedId: id
      }
    };
  });
}
function resolveAsyncRunLocation(params, asyncDirRoot, resultsDir) {
  const asyncRoot = path6.resolve(asyncDirRoot);
  const resultRoot = path6.resolve(resultsDir);
  const requestedId = assertRunId(params.id, "id") ?? assertRunId(params.runId, "runId");
  if (params.dir) {
    const asyncDir = path6.resolve(params.dir);
    assertInsideRoot(asyncRoot, asyncDir, "Async run directory");
    const resolvedId = requestedId ?? path6.basename(asyncDir);
    if (requestedId && requestedId !== path6.basename(asyncDir)) {
      throw new Error(`Async run id '${requestedId}' does not match directory '${path6.basename(asyncDir)}'.`);
    }
    return { asyncDir, resultPath: exactResultPath(resultRoot, resolvedId), resolvedId };
  }
  if (!requestedId) return { asyncDir: null, resultPath: null };
  const directAsyncDir = path6.join(asyncRoot, requestedId);
  assertInsideRoot(asyncRoot, directAsyncDir, "Async run directory");
  const directResultPath = exactResultPath(resultRoot, requestedId);
  if (fs6.existsSync(directAsyncDir) || directResultPath) {
    return {
      asyncDir: fs6.existsSync(directAsyncDir) ? directAsyncDir : null,
      resultPath: directResultPath,
      resolvedId: requestedId
    };
  }
  if (requestedId.length < MIN_SAFE_ASYNC_RUN_PREFIX_LENGTH) {
    throw new Error(`Async run id prefix '${requestedId}' is too short. Provide at least ${MIN_SAFE_ASYNC_RUN_PREFIX_LENGTH} characters.`);
  }
  if (!canScanAsyncRunPrefix(requestedId)) return { asyncDir: null, resultPath: null, resolvedId: requestedId };
  const matching = findAsyncRunPrefixMatches(requestedId, asyncRoot, resultRoot);
  if (matching.length === 0) return { asyncDir: null, resultPath: null, resolvedId: requestedId };
  if (matching.length > 1) {
    throw new Error(`Ambiguous async run id prefix '${requestedId}' matched: ${matching.map((match) => match.id).join(", ")}. Provide a longer id.`);
  }
  return matching[0].location;
}
function resultState(result) {
  if (result.state === "complete" || result.state === "failed" || result.state === "partial" || result.state === "paused" || result.state === "stopped" || result.state === "running" || result.state === "queued") {
    return result.state;
  }
  return result.success ? "complete" : "failed";
}
function validateStatusForResume(status, source) {
  if (!status) return;
  if (typeof status.runId !== "string") throw new Error(`Invalid async status '${source}': runId must be a string.`);
  assertWorkflowGraphHostSteps(status.workflowGraph, source, status.runId);
  if (status.sessionId !== void 0 && typeof status.sessionId !== "string") throw new Error(`Invalid async status '${source}': sessionId must be a string.`);
  if (status.cwd !== void 0 && typeof status.cwd !== "string") throw new Error(`Invalid async status '${source}': cwd must be a string.`);
  if (status.sessionFile !== void 0 && typeof status.sessionFile !== "string") throw new Error(`Invalid async status '${source}': sessionFile must be a string.`);
  if (status.capabilityCeiling !== void 0) status.capabilityCeiling = parseSubagentCapabilityCeiling(status.capabilityCeiling, `async status '${source}' capabilityCeiling`);
  if (status.admissionCapabilityCeiling !== void 0) status.admissionCapabilityCeiling = parseSubagentCapabilityCeiling(status.admissionCapabilityCeiling, `async status '${source}' admissionCapabilityCeiling`);
  if (status.steps !== void 0) {
    if (!Array.isArray(status.steps)) throw new Error(`Invalid async status '${source}': steps must be an array.`);
    status.steps.forEach((step, index) => {
      if (!step || typeof step !== "object" || Array.isArray(step)) throw new Error(`Invalid async status '${source}': steps[${index}] must be an object.`);
      const stepRecord = step;
      if (typeof stepRecord.agent !== "string") throw new Error(`Invalid async status '${source}': steps[${index}].agent must be a string.`);
      if (stepRecord.sessionFile !== void 0 && typeof stepRecord.sessionFile !== "string") throw new Error(`Invalid async status '${source}': steps[${index}].sessionFile must be a string.`);
      if (stepRecord.sessionName !== void 0 && typeof stepRecord.sessionName !== "string") throw new Error(`Invalid async status '${source}': steps[${index}].sessionName must be a string.`);
      if (stepRecord.model !== void 0 && typeof stepRecord.model !== "string") throw new Error(`Invalid async status '${source}': steps[${index}].model must be a string.`);
      if (stepRecord.launchModel !== void 0 && typeof stepRecord.launchModel !== "string") throw new Error(`Invalid async status '${source}': steps[${index}].launchModel must be a string.`);
      if (stepRecord.thinking !== void 0 && typeof stepRecord.thinking !== "string") throw new Error(`Invalid async status '${source}': steps[${index}].thinking must be a string.`);
      if (stepRecord.thinkingCeiling !== void 0) stepRecord.thinkingCeiling = parseThinkingLevel(stepRecord.thinkingCeiling, `async status '${source}' steps[${index}].thinkingCeiling`);
      if (stepRecord.launchContractDigest !== void 0 && typeof stepRecord.launchContractDigest !== "string") throw new Error(`Invalid async status '${source}': steps[${index}].launchContractDigest must be a string.`);
      if (stepRecord.capabilityCeiling !== void 0) stepRecord.capabilityCeiling = parseSubagentCapabilityCeiling(stepRecord.capabilityCeiling, `async status '${source}' steps[${index}].capabilityCeiling`);
    });
  }
}
function normalizeRecoveryAcceptance(value, descriptorPath) {
  const errors = validateAcceptanceInput(value, "recoveryDescriptor.acceptance");
  if (errors.length) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': ${errors.join(" ")}`);
  return value;
}
function asyncReviveRequiresRecoveryDescriptor(target) {
  if (target.recoveryDescriptor) return false;
  return !(target.mode === "workflow" && target.sessionFile && target.capabilityCeiling);
}
function resumeTargetMode(status, result) {
  if (status?.mode) return status.mode;
  if (result?.mode === "single" || result?.mode === "parallel" || result?.mode === "chain" || result?.mode === "workflow") return result.mode;
  return void 0;
}
function readAsyncRecoveryDescriptor(asyncDir) {
  if (!asyncDir) return void 0;
  const descriptorPath = path6.join(asyncDir, "recovery-descriptor.json");
  if (!fs6.existsSync(descriptorPath)) return void 0;
  let value;
  try {
    value = JSON.parse(fs6.readFileSync(descriptorPath, "utf-8"));
  } catch (error) {
    throw new Error(`Failed to parse async recovery descriptor '${descriptorPath}': ${getErrorMessage2(error)}`, { cause: error instanceof Error ? error : void 0 });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': expected an object.`);
  const parsed = value;
  const allowedFields = /* @__PURE__ */ new Set([
    "modelResponseAliases",
    "version",
    "launchContractDigest",
    "sourceRunId",
    "agentContract",
    "agent",
    "sessionFile",
    "cwd",
    "model",
    "modelProvider",
    "modelOverrideFromParent",
    "modelOrigin",
    "fast",
    "thinking",
    "thinkingCeiling",
    "tools",
    "allowNestedSubagents",
    "allowedAgents",
    "extensions",
    "subagentOnlyExtensions",
    "mcpDirectTools",
    "excludeTools",
    "mutationTools",
    "systemPrompt",
    "systemPromptMode",
    "inheritProjectContext",
    "inheritGlobalContext",
    "inheritSkills",
    "skills",
    "skillPath",
    "agentFilePath",
    "memory",
    "outputPath",
    "outputMode",
    "structuredOutputSchema",
    "acceptance",
    "sessionDir",
    "artifactConfig",
    "artifactsDir",
    "maxOutput",
    "controlConfig",
    "context",
    "intercomBridge",
    "absoluteDeadlineAt",
    "initialTurnBudget",
    "initialToolBudget",
    "maxSubagentDepth",
    "share",
    "capabilityCeiling",
    "launchResolvedExtensions",
    "runFanoutBudget",
    "lane",
    "baseRef",
    "launcher",
    "extensionBindings",
    "requiredExtensions"
  ]);
  for (const field of Object.keys(parsed)) {
    if (!allowedFields.has(field)) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': unknown field '${field}'.`);
  }
  const requiredStrings = ["sourceRunId", "agent", "cwd", "systemPromptMode", "outputMode"];
  for (const field of requiredStrings) {
    if (typeof parsed[field] !== "string" || !parsed[field].trim()) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': ${field} must be a non-empty string.`);
  }
  if (parsed.version !== 1) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': version must be 1.`);
  if (parsed.launcher !== void 0 && (typeof parsed.launcher !== "string" || !RUNNER_LAUNCHER_NAME_PATTERN.test(parsed.launcher))) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': launcher must be a launcher name.`);
  try {
    parsed.runFanoutBudget = validateRunFanoutBudgetDescriptor(parsed.runFanoutBudget);
  } catch (error) {
    throw new Error(`Invalid async recovery descriptor '${descriptorPath}': ${error instanceof Error ? error.message : String(error)}`);
  }
  validateModelResponseAliases(parsed.modelResponseAliases, `async recovery descriptor '${descriptorPath}' modelResponseAliases`);
  if (parsed.capabilityCeiling !== void 0) parsed.capabilityCeiling = parseSubagentCapabilityCeiling(parsed.capabilityCeiling, `async recovery descriptor '${descriptorPath}' capabilityCeiling`);
  if (parsed.thinkingCeiling !== void 0) parsed.thinkingCeiling = parseThinkingLevel(parsed.thinkingCeiling, `async recovery descriptor '${descriptorPath}' thinkingCeiling`);
  if (parsed.extensionBindings !== void 0) parsed.extensionBindings = normalizeExtensionBindings(parsed.extensionBindings).value;
  if (parsed.requiredExtensions !== void 0) {
    try {
      parsed.requiredExtensions = snapshotRequiredChildExtensions(parsed.requiredExtensions, "requiredExtensions");
    } catch (error) {
      throw new Error(`Invalid async recovery descriptor '${descriptorPath}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (parsed.lane !== void 0) parsed.lane = normalizeWorkflowLaneMetadata(parsed.lane, `Invalid async recovery descriptor '${descriptorPath}': lane`);
  if (parsed.agentContract !== void 0) {
    if (!parsed.agentContract || typeof parsed.agentContract !== "object" || Array.isArray(parsed.agentContract)) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': agentContract must be an object.`);
    const contract = parsed.agentContract;
    if (contract.version !== 1 || Object.keys(contract).some((key) => key !== "version")) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': agentContract must be { version: 1 }.`);
  }
  if (parsed.systemPromptMode !== "append" && parsed.systemPromptMode !== "replace") throw new Error(`Invalid async recovery descriptor '${descriptorPath}': systemPromptMode is invalid.`);
  if (parsed.outputMode !== "inline" && parsed.outputMode !== "file-only") throw new Error(`Invalid async recovery descriptor '${descriptorPath}': outputMode is invalid.`);
  if (parsed.context !== void 0 && parsed.context !== "fresh" && parsed.context !== "fork") throw new Error(`Invalid async recovery descriptor '${descriptorPath}': context is invalid.`);
  if (parsed.modelOverrideFromParent !== void 0 && typeof parsed.modelOverrideFromParent !== "boolean") throw new Error(`Invalid async recovery descriptor '${descriptorPath}': modelOverrideFromParent must be a boolean.`);
  if (parsed.fast !== void 0 && typeof parsed.fast !== "boolean") throw new Error(`Invalid async recovery descriptor '${descriptorPath}': fast must be a boolean.`);
  if (parsed.modelOrigin !== void 0 && parsed.modelOrigin !== "explicit" && parsed.modelOrigin !== "inherited" && parsed.modelOrigin !== "configured") throw new Error(`Invalid async recovery descriptor '${descriptorPath}': modelOrigin must be 'explicit', 'inherited', or 'configured'.`);
  if (parsed.modelOrigin === void 0 && parsed.model !== void 0) parsed.modelOrigin = parsed.modelOverrideFromParent ? "inherited" : "configured";
  for (const field of ["inheritProjectContext", "inheritSkills", "share"]) {
    if (typeof parsed[field] !== "boolean") throw new Error(`Invalid async recovery descriptor '${descriptorPath}': ${field} must be a boolean.`);
  }
  if (parsed.inheritGlobalContext === void 0) parsed.inheritGlobalContext = parsed.inheritProjectContext;
  else if (typeof parsed.inheritGlobalContext !== "boolean") throw new Error(`Invalid async recovery descriptor '${descriptorPath}': inheritGlobalContext must be a boolean.`);
  if (parsed.allowNestedSubagents !== void 0 && typeof parsed.allowNestedSubagents !== "boolean") throw new Error(`Invalid async recovery descriptor '${descriptorPath}': allowNestedSubagents must be a boolean.`);
  if (parsed.allowedAgents !== void 0) {
    try {
      parsed.allowedAgents = normalizeCapabilityCeilingAllowedAgents(parsed.allowedAgents);
    } catch (error) {
      throw new Error(`Invalid async recovery descriptor '${descriptorPath}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!Number.isInteger(parsed.maxSubagentDepth) || parsed.maxSubagentDepth < 0) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': maxSubagentDepth must be a non-negative integer.`);
  for (const field of ["tools", "excludeTools", "extensions", "subagentOnlyExtensions", "mcpDirectTools", "mutationTools", "skills", "skillPath"]) {
    const item = parsed[field];
    if (item !== void 0 && (!Array.isArray(item) || item.some((entry) => typeof entry !== "string" || !entry.trim()))) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': ${field} must contain non-empty strings.`);
  }
  if (parsed.systemPrompt !== void 0 && typeof parsed.systemPrompt !== "string") throw new Error(`Invalid async recovery descriptor '${descriptorPath}': systemPrompt must be a string.`);
  for (const field of ["launchContractDigest", "sessionFile", "model", "modelProvider", "thinking", "agentFilePath", "outputPath", "sessionDir", "artifactsDir"]) {
    if (parsed[field] !== void 0 && (typeof parsed[field] !== "string" || !parsed[field].trim())) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': ${field} must be a non-empty string.`);
  }
  if (parsed.baseRef !== void 0) {
    if (typeof parsed.baseRef !== "string") throw new Error(`Invalid async recovery descriptor '${descriptorPath}': baseRef must be a string.`);
    try {
      parsed.baseRef = normalizeWorktreeBaseRef(parsed.baseRef);
    } catch (error) {
      throw new Error(`Invalid async recovery descriptor '${descriptorPath}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (parsed.structuredOutputSchema !== void 0 && (!parsed.structuredOutputSchema || typeof parsed.structuredOutputSchema !== "object" || Array.isArray(parsed.structuredOutputSchema))) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': structuredOutputSchema must be an object.`);
  if (parsed.memory !== void 0) {
    if (!parsed.memory || typeof parsed.memory !== "object" || Array.isArray(parsed.memory)) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': memory must be an object.`);
    const memory = parsed.memory;
    if (memory.scope !== "project" && memory.scope !== "user" || typeof memory.path !== "string" || !memory.path.trim()) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': memory is invalid.`);
  }
  if (parsed.absoluteDeadlineAt !== void 0 && (!Number.isFinite(parsed.absoluteDeadlineAt) || parsed.absoluteDeadlineAt <= 0)) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': absoluteDeadlineAt must be a positive timestamp.`);
  if (parsed.initialTurnBudget !== void 0) {
    delete parsed.initialTurnBudget;
  }
  if (parsed.initialToolBudget !== void 0) {
    const result = validateToolBudgetConfig(parsed.initialToolBudget, "recoveryDescriptor.initialToolBudget");
    if (result.error) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': ${result.error}`);
  }
  if (parsed.maxOutput !== void 0) {
    if (!parsed.maxOutput || typeof parsed.maxOutput !== "object" || Array.isArray(parsed.maxOutput)) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': maxOutput must be an object.`);
    for (const field of ["bytes", "lines"]) {
      const item = parsed.maxOutput[field];
      if (item !== void 0 && (!Number.isInteger(item) || item < 1)) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': maxOutput.${field} must be a positive integer.`);
    }
  }
  if (parsed.artifactConfig !== void 0) {
    if (!parsed.artifactConfig || typeof parsed.artifactConfig !== "object" || Array.isArray(parsed.artifactConfig)) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': artifactConfig must be an object.`);
    const artifact = parsed.artifactConfig;
    for (const field of ["enabled", "includeInput", "includeOutput", "includeJsonl", "includeMetadata"]) {
      if (typeof artifact[field] !== "boolean") throw new Error(`Invalid async recovery descriptor '${descriptorPath}': artifactConfig.${field} must be a boolean.`);
    }
    if (artifact.includeTranscript !== void 0 && typeof artifact.includeTranscript !== "boolean") throw new Error(`Invalid async recovery descriptor '${descriptorPath}': artifactConfig.includeTranscript must be a boolean.`);
    if (!Number.isInteger(artifact.cleanupDays) || artifact.cleanupDays < 0) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': artifactConfig.cleanupDays must be a non-negative integer.`);
  }
  if (parsed.intercomBridge !== void 0) {
    const bridge = validateIntercomBridgeConfig({ value: parsed.intercomBridge, label: "intercomBridge" });
    if (!bridge.ok) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': ${bridge.error}`);
  }
  if (parsed.controlConfig !== void 0) {
    if (!parsed.controlConfig || typeof parsed.controlConfig !== "object" || Array.isArray(parsed.controlConfig)) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': controlConfig must be an object.`);
    const control = parsed.controlConfig;
    if (typeof control.enabled !== "boolean") throw new Error(`Invalid async recovery descriptor '${descriptorPath}': controlConfig.enabled must be a boolean.`);
    for (const field of ["needsAttentionAfterMs", "activeNoticeAfterMs", "failedToolAttemptsBeforeAttention"]) {
      if (!Number.isInteger(control[field]) || control[field] < 1) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': controlConfig.${field} must be a positive integer.`);
    }
    for (const field of ["activeNoticeAfterTurns", "activeNoticeAfterTokens"]) {
      if (control[field] !== void 0 && (!Number.isInteger(control[field]) || control[field] < 1)) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': controlConfig.${field} must be a positive integer.`);
    }
    if (!Array.isArray(control.notifyOn) || control.notifyOn.some((item) => item !== "active_long_running" && item !== "needs_attention")) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': controlConfig.notifyOn is invalid.`);
    if (!Array.isArray(control.notifyChannels) || control.notifyChannels.some((item) => item !== "event" && item !== "async" && item !== "intercom")) throw new Error(`Invalid async recovery descriptor '${descriptorPath}': controlConfig.notifyChannels is invalid.`);
  }
  if (parsed.acceptance !== void 0) parsed.acceptance = normalizeRecoveryAcceptance(parsed.acceptance, descriptorPath);
  return parsed;
}
function validateResumeSessionFile(runId, sessionFile) {
  if (path6.extname(sessionFile) !== ".jsonl") throw new Error(`Async run '${runId}' session file must be a .jsonl file: ${sessionFile}`);
  const resolved = path6.resolve(sessionFile);
  if (!fs6.existsSync(resolved)) throw new Error(`Async run '${runId}' session file does not exist: ${sessionFile}`);
  return resolved;
}
function validateResumeCwd(runId, cwd) {
  if (!cwd) return void 0;
  const resolved = path6.resolve(cwd);
  try {
    if (!fs6.statSync(resolved).isDirectory()) throw new Error("path is not a directory");
  } catch (error) {
    throw new Error(`Async run '${runId}' required cwd does not exist: ${cwd}`, { cause: error instanceof Error ? error : void 0 });
  }
  return resolved;
}
function resolveAsyncResumeTarget(params, deps = {}, options = {}) {
  const asyncDirRoot = deps.asyncDirRoot ?? DIRS.async;
  const resultsDir = deps.resultsDir ?? DIRS.results;
  const requireSessionFile = options.requireSessionFile ?? true;
  const location = resolveAsyncRunLocation(params, asyncDirRoot, resultsDir);
  if (!location.asyncDir && !location.resultPath) {
    throw new Error("Async run not found. Provide id or dir.");
  }
  const reconciliation = location.asyncDir ? reconcileAsyncRun(location.asyncDir, { resultsDir, kill: deps.kill, now: deps.now }) : void 0;
  const status = reconciliation?.status ?? null;
  validateStatusForResume(status, location.asyncDir ? path6.join(location.asyncDir, "status.json") : "status.json");
  const recoveryDescriptor = readAsyncRecoveryDescriptor(location.asyncDir ?? void 0);
  const result = location.resultPath ? readResultFile(location.resultPath) : void 0;
  const runId = status?.runId ?? result?.runId ?? result?.id ?? location.resolvedId ?? (location.asyncDir ? path6.basename(location.asyncDir) : "unknown");
  const mode = resumeTargetMode(status, result);
  if (options.sessionId && (status && !ownsRun(options.sessionId, status.sessionId) || result && !ownsRun(options.sessionId, result.sessionId))) {
    throw new Error(`Async run '${runId}' was not found in the active session.`);
  }
  if (recoveryDescriptor && recoveryDescriptor.sourceRunId !== runId) throw new Error(`Async run '${runId}' has a recovery descriptor for a different source run.`);
  const state = status?.state ?? (result ? resultState(result) : void 0);
  if (!state) throw new Error(`Status file not found for async run '${runId}'.`);
  if (state === "stopped") throw new Error(`Async run '${runId}' was stopped and cannot be resumed. Start a new run instead.`);
  const statusSteps = status?.steps ?? [];
  const resultSteps = result?.results ?? [];
  const stepCount = statusSteps.length || resultSteps.length || (result?.agent ? 1 : 0);
  const requestedIndex = params.index;
  if (requestedIndex !== void 0 && !Number.isInteger(requestedIndex)) throw new Error(`Async run '${runId}' index must be an integer.`);
  const terminalStepStatuses = /* @__PURE__ */ new Set(["complete", "completed", "failed", "paused"]);
  if (state === "running") {
    if (requestedIndex !== void 0) {
      if (requestedIndex < 0 || requestedIndex >= stepCount) throw new Error(`Async run '${runId}' has ${stepCount} children. Index ${requestedIndex} is out of range.`);
      const selectedStep = statusSteps[requestedIndex];
      if (selectedStep?.status === "running") {
        const capabilityCeiling2 = intersectSubagentCapabilityCeilings(status?.capabilityCeiling, selectedStep.capabilityCeiling);
        return {
          kind: "live",
          runId,
          asyncDir: location.asyncDir ?? void 0,
          state,
          ...mode ? { mode } : {},
          agent: selectedStep.agent,
          ...selectedStep.sessionName ?? result?.results?.[requestedIndex]?.sessionName ? { sessionName: selectedStep.sessionName ?? result?.results?.[requestedIndex]?.sessionName } : {},
          index: requestedIndex,
          cwd: status?.cwd ?? result?.cwd,
          sessionFile: selectedStep.sessionFile ?? status?.sessionFile ?? result?.sessionFile,
          model: selectedStep.model,
          thinking: selectedStep.thinking,
          launchContractDigest: selectedStep.launchContractDigest ?? result?.results?.[requestedIndex]?.launchContractDigest ?? result?.launchContractDigest ?? recoveryDescriptor?.launchContractDigest,
          ...selectedStep.runner ? { runner: selectedStep.runner } : {},
          ...selectedStep.externalJob ? { externalJob: selectedStep.externalJob } : {},
          ...capabilityCeiling2 ? { capabilityCeiling: capabilityCeiling2 } : {},
          ...selectedStep.thinkingCeiling ? { thinkingCeiling: selectedStep.thinkingCeiling } : {},
          ...recoveryDescriptor ? { recoveryDescriptor } : {}
        };
      }
      if (selectedStep?.status === "pending") throw new Error(`Async run '${runId}' child ${requestedIndex} is pending and has not started yet. Wait for it to run or complete before resuming.`);
      if (selectedStep && !terminalStepStatuses.has(selectedStep.status)) throw new Error(`Async run '${runId}' child ${requestedIndex} is ${selectedStep.status} and cannot be revived yet.`);
    } else {
      const running = statusSteps.map((step, index2) => ({ step, index: index2 })).filter(({ step }) => step.status === "running");
      const selected = running.length === 1 ? running[0] : void 0;
      if (!selected) {
        throw new Error(`Async run '${runId}' has ${running.length} running children. Provide index to choose one.`);
      }
      const capabilityCeiling2 = intersectSubagentCapabilityCeilings(status?.capabilityCeiling, selected.step.capabilityCeiling);
      return {
        kind: "live",
        runId,
        asyncDir: location.asyncDir ?? void 0,
        state,
        ...mode ? { mode } : {},
        agent: selected.step.agent,
        ...selected.step.sessionName ?? result?.results?.[selected.index]?.sessionName ? { sessionName: selected.step.sessionName ?? result?.results?.[selected.index]?.sessionName } : {},
        index: selected.index,
        cwd: status?.cwd ?? result?.cwd,
        sessionFile: selected.step.sessionFile ?? status?.sessionFile ?? result?.sessionFile,
        model: selected.step.model,
        thinking: selected.step.thinking,
        launchContractDigest: selected.step.launchContractDigest ?? result?.results?.[selected.index]?.launchContractDigest ?? result?.launchContractDigest ?? recoveryDescriptor?.launchContractDigest,
        ...selected.step.runner ? { runner: selected.step.runner } : {},
        ...selected.step.externalJob ? { externalJob: selected.step.externalJob } : {},
        ...capabilityCeiling2 ? { capabilityCeiling: capabilityCeiling2 } : {},
        ...selected.step.thinkingCeiling ? { thinkingCeiling: selected.step.thinkingCeiling } : {},
        ...recoveryDescriptor ? { recoveryDescriptor } : {}
      };
    }
  }
  if (stepCount > 1 && requestedIndex === void 0) {
    throw new Error(`Async run '${runId}' has ${stepCount} children. Provide index to choose one.`);
  }
  const index = requestedIndex ?? 0;
  if (!Number.isInteger(index)) throw new Error(`Async run '${runId}' index must be an integer.`);
  if (index < 0 || index >= stepCount) throw new Error(`Async run '${runId}' has ${stepCount} children. Index ${index} is out of range.`);
  const selectedStatusStep = statusSteps[index];
  if (selectedStatusStep?.status === "stopped" || selectedStatusStep?.stopped === true) {
    throw new Error(`Async run '${runId}' child ${index} was stopped and cannot be resumed. Start a new run instead.`);
  }
  const agent = selectedStatusStep?.agent ?? resultSteps[index]?.agent ?? result?.agent;
  if (!agent) throw new Error(`Could not determine child agent for async run '${runId}'.`);
  if (recoveryDescriptor && recoveryDescriptor.agent !== agent) throw new Error(`Async run '${runId}' has a recovery descriptor for '${recoveryDescriptor.agent}', not '${agent}'.`);
  const sessionFile = statusSteps[index]?.sessionFile ?? resultSteps[index]?.sessionFile ?? (stepCount === 1 ? status?.sessionFile ?? result?.sessionFile : void 0);
  if (!sessionFile && requireSessionFile) throw new Error(`Async run '${runId}' child ${index} does not have a persisted session file to resume from.`);
  const resolvedSessionFile = sessionFile ? validateResumeSessionFile(runId, sessionFile) : void 0;
  const stepModel = statusSteps[index]?.launchModel ?? statusSteps[index]?.model ?? resultSteps[index]?.model ?? (stepCount === 1 ? result?.model : void 0);
  const stepThinking = statusSteps[index]?.thinking ?? resultSteps[index]?.thinking ?? (stepCount === 1 ? result?.thinking : void 0);
  const thinkingCeiling = statusSteps[index]?.thinkingCeiling ?? (stepCount === 1 ? recoveryDescriptor?.thinkingCeiling : void 0);
  const capabilityCeiling = mode === "workflow" ? intersectSubagentCapabilityCeilings(status?.admissionCapabilityCeiling, result?.admissionCapabilityCeiling) : intersectSubagentCapabilityCeilings(status?.capabilityCeiling, statusSteps[index]?.capabilityCeiling, result?.capabilityCeiling, resultSteps[index]?.capabilityCeiling);
  const managedWorktreeCwd = location.asyncDir ? resolveRetainedWorktreeCwd(parallelHandoffPath(location.asyncDir), runId, index) : void 0;
  const resumeCwd = validateResumeCwd(runId, managedWorktreeCwd ?? status?.cwd ?? result?.cwd ?? recoveryDescriptor?.cwd);
  return {
    kind: "revive",
    runId,
    asyncDir: location.asyncDir ?? void 0,
    state,
    ...mode ? { mode } : {},
    agent,
    ...statusSteps[index]?.sessionName ?? resultSteps[index]?.sessionName ? { sessionName: statusSteps[index]?.sessionName ?? resultSteps[index]?.sessionName } : {},
    index,
    ...resumeCwd ? { cwd: resumeCwd } : {},
    ...managedWorktreeCwd ? { managedWorktree: true } : {},
    ...resolvedSessionFile ? { sessionFile: resolvedSessionFile } : {},
    ...stepModel ? { model: stepModel } : {},
    ...stepThinking ? { thinking: stepThinking } : {},
    launchContractDigest: statusSteps[index]?.launchContractDigest ?? resultSteps[index]?.launchContractDigest ?? result?.launchContractDigest ?? recoveryDescriptor?.launchContractDigest,
    ...statusSteps[index]?.runner ? { runner: statusSteps[index].runner } : {},
    ...statusSteps[index]?.externalJob ? { externalJob: statusSteps[index].externalJob } : {},
    ...capabilityCeiling ? { capabilityCeiling } : {},
    ...thinkingCeiling ? { thinkingCeiling } : {},
    ...recoveryDescriptor ? { recoveryDescriptor } : {}
  };
}
function applySteeringRecoveryAgentConfig(agentConfig, descriptor) {
  return {
    ...agentConfig,
    model: descriptor.model,
    modelProvider: descriptor.modelProvider,
    thinking: descriptor.thinking,
    maxThinking: intersectThinkingCeilings(descriptor.thinkingCeiling, agentConfig.maxThinking),
    tools: descriptor.tools ? [...descriptor.tools] : void 0,
    excludeTools: descriptor.excludeTools ? [...descriptor.excludeTools] : void 0,
    allowNestedSubagents: descriptor.allowNestedSubagents,
    allowedAgents: descriptor.allowedAgents === void 0 ? void 0 : [...descriptor.allowedAgents],
    extensions: descriptor.extensions ? [...descriptor.extensions] : void 0,
    subagentOnlyExtensions: descriptor.subagentOnlyExtensions ? [...descriptor.subagentOnlyExtensions] : void 0,
    mcpDirectTools: descriptor.mcpDirectTools ? [...descriptor.mcpDirectTools] : void 0,
    mutationTools: descriptor.mutationTools ? [...descriptor.mutationTools] : void 0,
    systemPrompt: descriptor.systemPrompt ?? agentConfig.systemPrompt,
    systemPromptMode: descriptor.systemPromptMode,
    inheritProjectContext: descriptor.inheritProjectContext,
    inheritGlobalContext: descriptor.inheritGlobalContext,
    inheritSkills: descriptor.inheritSkills,
    skills: descriptor.skills ? [...descriptor.skills] : void 0,
    skillPath: descriptor.skillPath ? [...descriptor.skillPath] : void 0,
    filePath: descriptor.agentFilePath,
    memory: descriptor.memory ? { ...descriptor.memory } : void 0,
    output: descriptor.outputPath,
    toolBudget: descriptor.initialToolBudget,
    maxSubagentDepth: descriptor.maxSubagentDepth,
    // The recorded launcher wins over the current agent file, including recorded absence.
    launcher: descriptor.launcher
  };
}
function buildRevivedAsyncTask(target, message) {
  return [
    "You are reviving a previous subagent conversation.",
    "",
    `Original run: ${target.runId}`,
    `Original agent: ${target.agent}`,
    target.sessionFile ? `Original session file: ${target.sessionFile}` : void 0,
    "",
    "Use the stored session context as background. Answer the orchestrator's follow-up below. Do not assume the original child session is still running.",
    "",
    "Follow-up:",
    message
  ].filter((line) => line !== void 0).join("\n");
}

// src/shared/agent-stream-options.ts
function agentStreamOptions(streamFn) {
  return { streamFunction: streamFn, streamFn };
}

// src/shared/opencode-session-headers.ts
var OPENCODE_HOST = "opencode.ai";
function matchesOpenCodeHost(baseUrl) {
  try {
    return new URL(baseUrl).hostname === OPENCODE_HOST;
  } catch {
    return false;
  }
}
function opencodeSessionHeaders(model, sessionId) {
  if (!sessionId) return void 0;
  if (model.provider !== "opencode" && model.provider !== "opencode-go" && !matchesOpenCodeHost(model.baseUrl)) return void 0;
  return { "x-opencode-session": sessionId, "x-opencode-client": "pi" };
}

export {
  recordSessionReplacement,
  inheritedSessionIds,
  ownerSessionIds,
  ownsRun,
  MODEL_ONLY_TOOL,
  isStaleExtensionContextError,
  canRenderComponents,
  isUnboundExtensionRuntimeError,
  withCachedUiContext,
  agentStreamOptions,
  opencodeSessionHeaders,
  formatActivityLabel,
  aggregateStepStatus,
  formatAgentRunningLabel,
  formatParallelOutcome,
  formatNestedAggregate,
  formatNestedRunStatusLines,
  RunFanoutLimitError,
  createRunFanoutBudget,
  writeRunFanoutBudgetDescriptor,
  readRunFanoutBudgetDescriptor,
  getRunFanoutBudgetSnapshot,
  claimRunFanoutBatch,
  claimRunFanoutBatchWithCommit,
  formatRunFanoutBudget,
  summarizeContextModes,
  contextModeLabel,
  contextModeBadge,
  contextModePrefix,
  resolveAsyncStatusChild,
  isStoppableAsyncStatusStep,
  stopStoppableAsyncStatusChildren,
  workflowChildProgress,
  workflowChildSummary,
  parseWorkflowChildSummary,
  normalizeWorkflowPreflight,
  workflowPreflightLaneForRuntimeKey,
  workflowPreflightWarnings,
  annotateWorkflowPreflightTrace,
  formatWorkflowPreflight,
  formatWorkflowPreflightSummary,
  formatWorkflowPreflightPlanSummary,
  formatWorkflowPreflightWarningSummary,
  formatWorkflowPreflightWarnings,
  workflowGraphStageNodes,
  buildWorkflowGraphSnapshot,
  ASYNC_STATUS_SNAPSHOT_KIND,
  ASYNC_STATUS_SNAPSHOT_VERSION,
  projectAsyncWorkflowRows,
  projectAsyncStatusSnapshot,
  snapshotTrackedMutations,
  collectTrackedMutationEvidence,
  projectTimeoutRecovery,
  formatTimeoutRecoveryLines,
  buildTimeoutRecoverySummary,
  projectWorkflowChecklist,
  formatWorkflowChecklistSummary,
  formatWorkflowChecklistPhase,
  formatWorkflowChecklistBottleneck,
  formatWorkflowChecklistText,
  listAsyncRuns,
  formatWorkflowStageLine,
  formatAsyncRunOutputPath,
  formatAsyncRunProgressLabel,
  formatAsyncRunList,
  decodeUtf8Tail,
  utf8Tail,
  withHandoffWriteLock,
  withRepositoryWorktreeLock,
  readParallelHandoffManifest,
  protectRetainedWorktreeForResume,
  resolveRetainedWorktreeCwd,
  isTerminalParallelHandoffChildStatus,
  formatStoredParallelHandoffCleanup,
  recordParallelHandoffMerge,
  recordParallelHandoffSupersession,
  writeParallelHandoffGroup,
  parallelHandoffPath,
  writeWorktreeSetupHandoff,
  formatParallelHandoffReference,
  formatParallelHandoffError,
  discardPreservedWorktrees,
  findAsyncRunPrefixMatches,
  resolveAsyncRunLocation,
  asyncReviveRequiresRecoveryDescriptor,
  readAsyncRecoveryDescriptor,
  resolveAsyncResumeTarget,
  applySteeringRecoveryAgentConfig,
  buildRevivedAsyncTask
};
