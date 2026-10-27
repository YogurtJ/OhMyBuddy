import {
  checkPidLiveness,
  checkRecordedPidLiveness,
  currentBootId,
  currentPidNamespaceScope,
  isTerminalAsyncState,
  normalizeWorktreeBranchPrefix,
  readProcessTerminal,
  readWorkflowChildEvidence,
  readWorkflowChildProcessEvidence,
  validateAuthorityPolicy,
  validateMissionStoreConfig,
  validateModelResponseAliases
} from "./chunk-46XKCPJR.js";
import {
  getAgentDir,
  readStatus,
  validatePermissionConfig,
  writePrivateAtomicJson
} from "./chunk-CIZQXJ5Q.js";
import {
  FLEET_KEYBINDING_ACTIONS,
  RUNNER_LAUNCHER_NAME_PATTERN,
  RUNNER_LAUNCHER_NAME_RULE,
  TEMP_ROOT_DIR
} from "./chunk-5LFLVSTM.js";

// src/shared/disabled-features.ts
var SUBAGENT_FEATURES = {
  "agent-management": {
    actions: ["create", "update", "delete", "eject", "disable", "enable", "reset", "refine", "refine.show", "refine.rollback"],
    params: ["config"]
  },
  watchdog: {
    actions: ["watchdog.status", "watchdog.check", "watchdog.configure", "watchdog.recommend-model"],
    params: ["scope", "target", "thinking"]
  },
  panes: {
    actions: ["inspector.open", "inspector.command", "inspector.status", "inspector.close", "project.open", "project.status", "project.close"],
    params: ["focus"]
  },
  missions: {
    actions: ["mission.create", "mission.list", "mission.show", "mission.update", "mission.resolve-decision", "mission.attach-run", "mission.close"],
    params: ["mission", "missionUpdate", "missionStatus", "missionScope", "missionId", "runMode", "runStatus", "summary"]
  },
  "lane-management": {
    actions: ["lane.status", "lane.recordMerge", "lane.recordSupersession", "worktree.discard", "worktree.cleanup"],
    params: ["handoffPath", "laneId", "merge", "supersession", "repo", "planId"]
  },
  "spawn-budget-grants": { actions: ["grant-spawn-budget"], params: ["additional"] },
  preflight: { actions: [], params: ["preflight"] },
  "lane-metadata": { actions: [], params: ["lane"] },
  gates: { actions: [], params: ["gate"] },
  "usage-budgets": { actions: [], params: ["usageBudget"] },
  "tool-budgets": { actions: [], params: ["toolBudget"] },
  "control-overrides": { actions: [], params: ["control"] },
  "extension-bindings": { actions: [], params: ["extensionBindings"] },
  "external-machines": { actions: [], params: ["machine"] },
  "workflow-scripts": { actions: ["validate"], params: ["workflow", "args", "preflight", "globalConcurrencyLimit", "maxSubagentSpawnsPerRun"] }
};
var SCHEDULE_SURFACE = {
  actions: ["schedule.create", "schedule.list", "schedule.show", "schedule.history", "schedule.pause", "schedule.resume", "schedule.run", "schedule.run-due", "schedule.delete"],
  params: ["name", "at", "every", "sessionOnly", "quiet", "on", "timezone", "overlap", "catchUp"]
};
function validateDisabledFeatures(value) {
  if (value === void 0) return;
  if (!Array.isArray(value)) throw new Error("config.disabledFeatures must be an array of feature names");
  const seen = /* @__PURE__ */ new Set();
  for (const entry of value) {
    if (entry === "schedules") throw new Error(`config.disabledFeatures does not accept "schedules"; set config.scheduledRuns.enabled to false instead`);
    if (typeof entry !== "string" || !Object.hasOwn(SUBAGENT_FEATURES, entry)) {
      throw new Error(`config.disabledFeatures entry ${JSON.stringify(entry)} is not one of: ${Object.keys(SUBAGENT_FEATURES).join(", ")}`);
    }
    if (seen.has(entry)) throw new Error(`config.disabledFeatures lists "${entry}" more than once`);
    seen.add(entry);
  }
}
function featureSurface(feature) {
  if (feature === "schedules") return { ...SCHEDULE_SURFACE, disabledBy: "scheduledRuns.enabled=false" };
  return { ...SUBAGENT_FEATURES[feature], disabledBy: `disabledFeatures "${feature}"` };
}
function resolveDisabledFeatureSurface(config) {
  const features = new Set(config.disabledFeatures);
  if (config.scheduledRuns?.enabled === false) features.add("schedules");
  const params = /* @__PURE__ */ new Map();
  const actions = /* @__PURE__ */ new Map();
  for (const feature of features) {
    const surface = featureSurface(feature);
    for (const param of surface.params) if (feature === "workflow-scripts" || !params.has(param)) params.set(param, surface.disabledBy);
    for (const action of surface.actions) actions.set(action, surface.disabledBy);
  }
  return { features, params, actions };
}
function disabledFeatureUseError(request, surface, label = "subagent") {
  const params = request;
  const action = typeof params.action === "string" ? params.action.trim() : void 0;
  const disabledAction = action === void 0 ? void 0 : surface.actions.get(action);
  if (disabledAction) return `${label} action '${action}' is disabled by config ${disabledAction}.`;
  for (const [param, disabledBy] of surface.params) {
    if (params[param] !== void 0) return `${label} option '${param}' is disabled by config ${disabledBy}.`;
  }
  if (params.workflowScript !== void 0 && surface.features.has("workflow-scripts")) {
    return `${label} workflow scripts are disabled by config ${featureSurface("workflow-scripts").disabledBy}.`;
  }
  return void 0;
}
function disabledFeatureNotice(surface) {
  if (surface.features.size === 0) return void 0;
  const lines = [...surface.features].map((feature) => {
    const { actions, params, disabledBy } = featureSurface(feature);
    const parts = [`options ${params.join(", ")}`, ...actions.length > 0 ? [`actions ${actions.join(", ")}`] : []];
    return `- ${disabledBy}: ${parts.join("; ")}`;
  });
  return `Disabled by config in this session. The reference below still lists these, but calls that use them are rejected:
${lines.join("\n")}`;
}

// src/runs/background/active-async-capacity.ts
import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
var ACTIVE_ASYNC_CAPACITY_DIR = path.join(TEMP_ROOT_DIR, "session-active-async-capacity");
var DEFAULT_ABANDONED_SLOT_RELEASE_AFTER_MS = 20 * 60 * 1e3;
var MIN_ABANDONED_SLOT_RELEASE_AFTER_MS = 5 * 60 * 1e3;
var MAX_ABANDONED_SLOT_RELEASE_AFTER_MS = 24 * 60 * 60 * 1e3;
var ActiveAsyncCapacityError = class extends Error {
  snapshot;
  constructor(snapshot) {
    super(`Active async run capacity exhausted: ${snapshot.used}/${snapshot.limit} used.`);
    this.name = "ActiveAsyncCapacityError";
    this.snapshot = snapshot;
  }
};
function resolveMaxActiveAsyncRunsPerSession(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return void 0;
  return value === 0 ? void 0 : value;
}
function resolveAbandonedSlotReleaseAfterMs(value) {
  if (value === false) return false;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return DEFAULT_ABANDONED_SLOT_RELEASE_AFTER_MS;
  return value;
}
function activeAsyncCapacitySessionKey(sessionId) {
  return createHash("sha256").update(sessionId).digest("hex");
}
function sessionDir(sessionId, rootDir) {
  return path.join(rootDir, activeAsyncCapacitySessionKey(sessionId));
}
function slotDir(poolDir, slot) {
  return path.join(poolDir, `slot-${slot}`);
}
function parseOwner(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const owner = value;
  if (owner.version !== 1 || typeof owner.reservationToken !== "string" || !owner.reservationToken || typeof owner.ownerSessionId !== "string" || !owner.ownerSessionId || typeof owner.ownerSessionKey !== "string" || !owner.ownerSessionKey || typeof owner.slot !== "number" || !Number.isInteger(owner.slot) || owner.slot < 0 || typeof owner.runId !== "string" || !owner.runId || typeof owner.generation !== "number" || !Number.isInteger(owner.generation) || owner.generation < 0 || owner.kind !== "runner" && owner.kind !== "workflow" || typeof owner.asyncDir !== "string" || !owner.asyncDir || typeof owner.reservedAt !== "number" || !Number.isFinite(owner.reservedAt)) return void 0;
  if (owner.sourceRunId !== void 0 && typeof owner.sourceRunId !== "string") return void 0;
  if (owner.runnerProcessInstanceId !== void 0 && (typeof owner.runnerProcessInstanceId !== "string" || !owner.runnerProcessInstanceId)) return void 0;
  if (owner.runnerStartedAt !== void 0 && (typeof owner.runnerStartedAt !== "number" || !Number.isFinite(owner.runnerStartedAt))) return void 0;
  return owner;
}
function readOwner(dir) {
  try {
    return parseOwner(JSON.parse(fs.readFileSync(path.join(dir, "owner.json"), "utf-8")));
  } catch {
    return void 0;
  }
}
function occupiedSlots(poolDir) {
  try {
    return fs.readdirSync(poolDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^slot-\d+$/.test(entry.name)).map((entry) => path.join(poolDir, entry.name));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
function snapshotFor(sessionId, limit, rootDir) {
  return { used: occupiedSlots(sessionDir(sessionId, rootDir)).length, limit: limit ?? 0 };
}
function matchingOwner(dir, expected) {
  const owner = readOwner(dir);
  return owner?.reservationToken === expected.reservationToken && owner.runId === expected.runId && owner.generation === expected.generation ? owner : void 0;
}
function withSlotClaim(dir, operation) {
  const claimPath = path.join(dir, "capacity.claim");
  const claimToken = randomUUID();
  let claim;
  try {
    claim = fs.openSync(claimPath, "wx", 384);
    fs.writeFileSync(claim, claimToken, "utf-8");
    fs.closeSync(claim);
    claim = void 0;
  } catch (error) {
    if (claim !== void 0) fs.closeSync(claim);
    if (error.code === "EEXIST" || error.code === "ENOENT") return { acquired: false };
    throw error;
  }
  try {
    return { acquired: true, value: operation() };
  } finally {
    try {
      if (fs.readFileSync(claimPath, "utf-8") === claimToken) fs.rmSync(claimPath, { force: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
function removeOwnedSlot(dir, expected, options, requireUnstarted = false, release) {
  if (requireUnstarted && (expected.runnerProcessInstanceId || expected.runnerStartedAt)) return false;
  const claimed = withSlotClaim(dir, () => {
    const current = matchingOwner(dir, expected);
    if (!current || requireUnstarted && (current.runnerProcessInstanceId || current.runnerStartedAt)) return false;
    const releasedDir = path.join(path.dirname(dir), `.${path.basename(dir)}.released-${randomUUID()}`);
    fs.renameSync(dir, releasedDir);
    options.afterSlotRename?.(releasedDir);
    if (release?.state === "releasable" && release.evidence) {
      appendAbandonedReleaseEvent(expected.asyncDir, expected, release.evidence, options.now?.() ?? Date.now());
    }
    fs.rmSync(releasedDir, { recursive: true, force: true });
    return true;
  });
  return claimed.acquired && claimed.value;
}
function appendAbandonedReleaseEvent(asyncDir, owner, evidence, now) {
  try {
    const eventsPath = path.join(asyncDir, "events.jsonl");
    fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
    fs.appendFileSync(eventsPath, `${JSON.stringify({
      type: "subagent.capacity.released",
      ts: now,
      runId: owner.runId,
      sessionId: owner.ownerSessionId,
      ...evidence
    })}
`, "utf-8");
  } catch {
  }
}
function runnerReleaseVerdict(owner, status, options) {
  if (!status) return { state: "retained", reason: "status file is missing or unreadable" };
  if (!owner.runnerProcessInstanceId) return { state: "retained", reason: "runner process identity has not been recorded" };
  if (status.sessionId !== owner.ownerSessionId) return { state: "retained", reason: `status session ${status.sessionId ?? "unknown"} does not match owner session ${owner.ownerSessionId}` };
  if (status.runId !== owner.runId) return { state: "retained", reason: `status run ${status.runId} does not match owner run ${owner.runId}` };
  if (!isTerminalAsyncState(status.state)) return { state: "retained", reason: `run is still ${status.state}` };
  if (status.processTerminal?.state === "not-started" && status.processTerminal.runId === owner.runId && status.processTerminal.runnerProcessInstanceId === owner.runnerProcessInstanceId && typeof status.error === "string" && status.error) return { state: "releasable", reason: "run failed before child startup completed" };
  const proof = readProcessTerminal(owner.asyncDir, {
    runId: owner.runId,
    runnerProcessInstanceId: owner.runnerProcessInstanceId
  });
  return proof?.state === "observed" && proof.runId === owner.runId && proof.runnerProcessInstanceId === owner.runnerProcessInstanceId ? { state: "releasable", reason: "matching observed process-terminal proof is present" } : abandonedRunnerReleaseVerdict(status, proof?.state ?? "missing", options);
}
function abandonedRunnerReleaseVerdict(status, proofState, options, anyTerminalState = false) {
  const proofReason = `process-terminal proof is ${proofState}`;
  const thresholdMs = resolveAbandonedSlotReleaseAfterMs(options.abandonedSlotReleaseAfterMs);
  if (thresholdMs === false) return { state: "retained", reason: `${proofReason}; abandoned-timeout policy is disabled` };
  if (anyTerminalState ? !isTerminalAsyncState(status.state) : status.state !== "failed") return { state: "retained", reason: `${proofReason}; abandoned-timeout policy requires a ${anyTerminalState ? "terminal" : "failed"} run, not ${status.state}` };
  if (typeof status.pid !== "number" || !Number.isInteger(status.pid) || status.pid < 1) return { state: "retained", reason: `${proofReason}; runner PID is missing or invalid` };
  const observedScope = (options.pidNamespaceScope ?? currentPidNamespaceScope)();
  if (status.pidNamespaceScope !== void 0 && status.pidNamespaceScope !== observedScope) return { state: "retained", reason: `${proofReason}; runner PID namespace differs from this process, so liveness is unknown` };
  const liveness = checkRecordedPidLiveness({ pid: status.pid, pidNamespaceScope: status.pidNamespaceScope, bootId: status.bootId }, {
    observedScope,
    observedBootId: (options.bootId ?? currentBootId)(),
    probe: options.pidLiveness ?? ((pid) => checkPidLiveness(pid))
  });
  if (liveness !== "dead") return { state: "retained", reason: `${proofReason}; runner PID liveness is ${liveness}` };
  const lastActivityAt = status.lastActivityAt ?? status.lastUpdate ?? status.endedAt;
  if (typeof lastActivityAt !== "number" || !Number.isFinite(lastActivityAt)) return { state: "retained", reason: `${proofReason}; last activity timestamp is missing or invalid` };
  const now = options.now?.() ?? Date.now();
  const lastActivityAgeMs = Math.max(0, now - lastActivityAt);
  if (lastActivityAgeMs <= thresholdMs) return { state: "retained", reason: `${proofReason}; last activity age ${lastActivityAgeMs}ms has not exceeded abandoned-timeout ${thresholdMs}ms` };
  const evidence = {
    releasedBy: "abandoned-timeout",
    processProof: "unknown",
    runnerPid: "gone",
    lastActivityAgeMs,
    abandonedSlotReleaseAfterMs: thresholdMs
  };
  return {
    state: "releasable",
    reason: `${evidence.releasedBy}: ${proofReason}; runner PID is gone; process proof unknown; last activity age ${lastActivityAgeMs}ms exceeds ${thresholdMs}ms`,
    evidence
  };
}
function workflowReleaseVerdict(owner, status, liveWorkflowRunIds, options) {
  if (!status) return { state: "retained", reason: "status file is missing or unreadable" };
  if (status.sessionId !== owner.ownerSessionId) return { state: "retained", reason: `status session ${status.sessionId ?? "unknown"} does not match owner session ${owner.ownerSessionId}` };
  if (status.runId !== owner.runId) return { state: "retained", reason: `status run ${status.runId} does not match owner run ${owner.runId}` };
  if (status.mode !== "workflow") return { state: "retained", reason: `status mode is ${status.mode}, not workflow` };
  if (!isTerminalAsyncState(status.state)) return { state: "retained", reason: `workflow is still ${status.state}` };
  if (liveWorkflowRunIds.has(owner.runId)) return { state: "retained", reason: "workflow controller is still live" };
  const evidence = readWorkflowChildProcessEvidence(owner.asyncDir, status.steps);
  if (evidence.state === "observed") return { state: "releasable", reason: "workflow is terminal, controller is gone, and async children have observed proof" };
  return abandonedWorkflowReleaseVerdict(owner, status, evidence.reason, options);
}
function abandonedWorkflowReleaseVerdict(owner, status, proofReason, options) {
  const thresholdMs = resolveAbandonedSlotReleaseAfterMs(options.abandonedSlotReleaseAfterMs);
  if (thresholdMs === false) return { state: "retained", reason: `${proofReason}; abandoned-timeout policy is disabled` };
  if (!status.steps) return { state: "retained", reason: proofReason };
  if (typeof status.endedAt !== "number" || !Number.isFinite(status.endedAt)) return { state: "retained", reason: `${proofReason}; workflow end timestamp is missing or invalid` };
  const workflowEndedAgeMs = (options.now?.() ?? Date.now()) - status.endedAt;
  if (workflowEndedAgeMs <= thresholdMs) return { state: "retained", reason: `${proofReason}; workflow ended ${workflowEndedAgeMs}ms ago, within abandoned-timeout ${thresholdMs}ms` };
  const abandonedChildren = [];
  for (const step of status.steps) {
    const child = readWorkflowChildEvidence(owner.asyncDir, step);
    if (!child || child.state === "resolved") continue;
    const unresolved = child.unresolvedProof;
    if (!unresolved) return { state: "retained", reason: child.reason };
    if (unresolved.status.sessionId !== owner.ownerSessionId) return { state: "retained", reason: `${child.reason}; child session ${unresolved.status.sessionId ?? "unknown"} does not match owner session ${owner.ownerSessionId}` };
    const verdict = abandonedRunnerReleaseVerdict(unresolved.status, unresolved.proofState, options, true);
    if (verdict.state !== "releasable") return { state: "retained", reason: `async workflow child ${unresolved.status.runId}: ${verdict.reason}` };
    abandonedChildren.push({ runId: unresolved.status.runId, state: unresolved.status.state, lastActivityAgeMs: verdict.evidence.lastActivityAgeMs });
  }
  const evidence = {
    releasedBy: "abandoned-timeout",
    processProof: "unknown",
    controller: "unregistered",
    workflowEndedAgeMs,
    abandonedChildren,
    abandonedSlotReleaseAfterMs: thresholdMs
  };
  return {
    state: "releasable",
    reason: `${evidence.releasedBy}: ${proofReason}; workflow controller is unregistered; terminal async children ${abandonedChildren.map((child) => child.runId).join(", ")} have dead runner PIDs; process proof unknown; workflow ended ${workflowEndedAgeMs}ms ago, over ${thresholdMs}ms`,
    evidence
  };
}
function ownerReleaseVerdict(owner, liveWorkflowRunIds, options) {
  const status = readStatus(owner.asyncDir);
  return owner.kind === "runner" ? runnerReleaseVerdict(owner, status, options) : workflowReleaseVerdict(owner, status, liveWorkflowRunIds, options);
}
function capacitySessionDirs(rootDir, sessionId) {
  if (sessionId) return [sessionDir(sessionId, rootDir)];
  try {
    return fs.readdirSync(rootDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(rootDir, entry.name));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
function inspectActiveAsyncCapacityOwner(input, options = {}) {
  const rootDir = options.rootDir ?? ACTIVE_ASYNC_CAPACITY_DIR;
  const liveWorkflowRunIds = options.liveWorkflowRunIds ?? /* @__PURE__ */ new Set();
  for (const poolDir of capacitySessionDirs(rootDir, input.sessionId)) {
    for (const dir of occupiedSlots(poolDir)) {
      const owner = readOwner(dir);
      if (!owner) continue;
      const sameRun = owner.runId === input.runId || input.asyncDir !== void 0 && path.resolve(owner.asyncDir) === path.resolve(input.asyncDir);
      const sourceRun = owner.sourceRunId === input.runId;
      if (!sameRun && !sourceRun) continue;
      if (sourceRun && !sameRun) {
        return {
          owner,
          relation: "source",
          slotDir: dir,
          release: { state: "not-owned", reason: `slot was transferred to ${owner.runId}` }
        };
      }
      return { owner, relation: "current", slotDir: dir, release: ownerReleaseVerdict(owner, liveWorkflowRunIds, options) };
    }
  }
  return { relation: "none", release: { state: "not-owned", reason: "no active-capacity slot records this run" } };
}
function reconcileActiveAsyncCapacity(sessionId, limit, options = {}) {
  const rootDir = options.rootDir ?? ACTIVE_ASYNC_CAPACITY_DIR;
  const poolDir = sessionDir(sessionId, rootDir);
  const liveWorkflowRunIds = options.liveWorkflowRunIds ?? /* @__PURE__ */ new Set();
  for (const dir of occupiedSlots(poolDir)) {
    const owner = readOwner(dir);
    if (!owner || owner.ownerSessionId !== sessionId || owner.ownerSessionKey !== activeAsyncCapacitySessionKey(sessionId) || path.basename(dir) !== `slot-${owner.slot}`) continue;
    const release = ownerReleaseVerdict(owner, liveWorkflowRunIds, options);
    if (release.state !== "releasable") continue;
    removeOwnedSlot(dir, owner, options, false, release);
  }
  return snapshotFor(sessionId, limit, rootDir);
}
function getActiveAsyncCapacitySnapshot(sessionId, limit, options = {}) {
  return reconcileActiveAsyncCapacity(sessionId, limit, options);
}
function createSlot(poolDir, owner) {
  const destination = slotDir(poolDir, owner.slot);
  fs.mkdirSync(poolDir, { recursive: true, mode: 448 });
  try {
    fs.mkdirSync(destination, { mode: 448 });
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
  fs.writeFileSync(path.join(destination, "owner.json"), `${JSON.stringify(owner, null, 2)}
`, { encoding: "utf-8", mode: 384 });
  return true;
}
function handleFor(owner, limit, options, rollbackOwner) {
  const rootDir = options.rootDir ?? ACTIVE_ASYNC_CAPACITY_DIR;
  const writeOwner = options.writeOwner ?? writePrivateAtomicJson;
  const dir = slotDir(sessionDir(owner.ownerSessionId, rootDir), owner.slot);
  return {
    owner,
    markStarted(runnerProcessInstanceId) {
      const claimed = withSlotClaim(dir, () => {
        const current = matchingOwner(dir, owner);
        if (!current) return false;
        const next = { ...current, runnerProcessInstanceId, runnerStartedAt: options.now?.() ?? Date.now() };
        Object.assign(owner, next);
        writeOwner(path.join(dir, "owner.json"), next);
        return true;
      });
      if (!claimed.acquired || !claimed.value) throw new Error(`Active async capacity ownership changed for run '${owner.runId}'.`);
    },
    markWorkflowStarted() {
      const claimed = withSlotClaim(dir, () => {
        const current = matchingOwner(dir, owner);
        if (!current || current.kind !== "workflow") return false;
        const next = { ...current, runnerStartedAt: options.now?.() ?? Date.now() };
        Object.assign(owner, next);
        try {
          writePrivateAtomicJson(path.join(dir, "owner.json"), next);
        } catch (error) {
          console.error(`Failed to mark async workflow '${owner.runId}' started; capacity will remain occupied:`, error);
        }
        return true;
      });
      if (!claimed.acquired || !claimed.value) throw new Error(`Active async capacity ownership changed for workflow '${owner.runId}'.`);
    },
    rollback() {
      if (!rollbackOwner) return removeOwnedSlot(dir, owner, options, true);
      if (owner.runnerProcessInstanceId || owner.runnerStartedAt) return false;
      const claimed = withSlotClaim(dir, () => {
        const current = matchingOwner(dir, owner);
        if (!current || current.runnerProcessInstanceId || current.runnerStartedAt) return false;
        writePrivateAtomicJson(path.join(dir, "owner.json"), rollbackOwner);
        Object.assign(owner, rollbackOwner);
        return true;
      });
      return claimed.acquired && claimed.value;
    },
    rollbackBeforeRunnerProceed(runnerProcessInstanceId) {
      const claimed = withSlotClaim(dir, () => {
        const current = matchingOwner(dir, owner);
        if (!current) return false;
        const boundToRunner = current.runnerProcessInstanceId === runnerProcessInstanceId;
        const bindingFailedBeforeProceed = current.runnerProcessInstanceId === void 0 && current.runnerStartedAt === void 0 && owner.runnerProcessInstanceId === runnerProcessInstanceId;
        if (!boundToRunner && !bindingFailedBeforeProceed) return false;
        if (rollbackOwner) {
          writePrivateAtomicJson(path.join(dir, "owner.json"), rollbackOwner);
          Object.assign(owner, rollbackOwner);
          return true;
        }
        const releasedDir = path.join(path.dirname(dir), `.${path.basename(dir)}.released-${randomUUID()}`);
        fs.renameSync(dir, releasedDir);
        options.afterSlotRename?.(releasedDir);
        fs.rmSync(releasedDir, { recursive: true, force: true });
        return true;
      });
      return claimed.acquired && claimed.value;
    },
    reconcile(liveWorkflowRunIds) {
      return reconcileActiveAsyncCapacity(owner.ownerSessionId, limit, { ...options, rootDir, liveWorkflowRunIds });
    }
  };
}
function acquireActiveAsyncCapacity(input, options = {}) {
  if (input.limit === void 0) return void 0;
  const rootDir = options.rootDir ?? ACTIVE_ASYNC_CAPACITY_DIR;
  const reconciled = reconcileActiveAsyncCapacity(input.sessionId, input.limit, options);
  if (reconciled.used >= input.limit) throw new ActiveAsyncCapacityError(reconciled);
  const poolDir = sessionDir(input.sessionId, rootDir);
  const token = options.token?.() ?? randomUUID();
  for (let slot = 0; slot < input.limit; slot++) {
    const owner = {
      version: 1,
      reservationToken: token,
      ownerSessionId: input.sessionId,
      ownerSessionKey: activeAsyncCapacitySessionKey(input.sessionId),
      slot,
      runId: input.runId,
      generation: 0,
      kind: input.kind,
      asyncDir: input.asyncDir,
      reservedAt: options.now?.() ?? Date.now()
    };
    if (createSlot(poolDir, owner)) return handleFor(owner, input.limit, { ...options, rootDir });
  }
  throw new ActiveAsyncCapacityError(snapshotFor(input.sessionId, input.limit, rootDir));
}
function transferActiveAsyncCapacity(input, options = {}) {
  const limit = input.limit ?? 0;
  const rootDir = options.rootDir ?? ACTIVE_ASYNC_CAPACITY_DIR;
  const poolDir = sessionDir(input.sessionId, rootDir);
  for (const dir of occupiedSlots(poolDir)) {
    const source = readOwner(dir);
    if (!source || source.ownerSessionId !== input.sessionId || source.runId !== input.sourceRunId) continue;
    const claimed = withSlotClaim(dir, () => {
      const current = matchingOwner(dir, source);
      const status = readStatus(source.asyncDir);
      if (!current || !status || status.runId !== input.sourceRunId || status.state === "queued" || status.state === "running") {
        throw new Error(`Active async capacity source '${input.sourceRunId}' is not transferable.`);
      }
      const next = {
        ...current,
        runId: input.runId,
        sourceRunId: input.sourceRunId,
        generation: current.generation + 1,
        kind: "runner",
        asyncDir: input.asyncDir,
        reservedAt: options.now?.() ?? Date.now()
      };
      delete next.runnerProcessInstanceId;
      delete next.runnerStartedAt;
      writePrivateAtomicJson(path.join(dir, "owner.json"), next);
      return handleFor(next, limit, { ...options, rootDir }, current);
    });
    if (!claimed.acquired) throw new Error(`Active async capacity transfer is already in progress for run '${input.sourceRunId}'.`);
    return claimed.value;
  }
  return acquireActiveAsyncCapacity({ sessionId: input.sessionId, limit: input.limit, runId: input.runId, kind: "runner", asyncDir: input.asyncDir }, options);
}

// src/extension/config.ts
import * as fs2 from "node:fs";
import * as os from "node:os";
import * as path2 from "node:path";
import { Key } from "@earendil-works/pi-tui";
var FAIL_CLOSED_CONFIG_KEYS = ["worktreeProvider", "worktreeBranchPrefix", "modelResponseAliases", "modelExclusions", "checkpointBeforeDeadlineMs", "disabledFeatures", "scheduledRuns", "toolActivation", "authorityPolicy", "permissions", "toolBudget", "runnerLaunchers"];
var ARTIFACT_DIR_PREFERENCES = /* @__PURE__ */ new Set(["project", "session", "temp"]);
var FLEET_KEYBINDING_ACTION_SET = new Set(FLEET_KEYBINDING_ACTIONS);
var KEY_MODIFIERS = /* @__PURE__ */ new Set(["ctrl", "shift", "alt", "super"]);
var BASE_KEY_IDS = /* @__PURE__ */ new Set([
  ..."abcdefghijklmnopqrstuvwxyz0123456789",
  ...Object.values(Key).flatMap((value) => typeof value === "string" ? [value.toLowerCase()] : [])
]);
var PrunedForkConfigError = class extends Error {
};
function validateForkContextConfig(value) {
  if (value === void 0) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("config.forkContext must be a JSON object");
  const config = value;
  if (config.mode !== void 0 && config.mode !== "full" && config.mode !== "pruned") {
    throw new Error('config.forkContext.mode must be "full" or "pruned"');
  }
  if (config.model !== void 0 && (typeof config.model !== "string" || !config.model.trim())) {
    throw new PrunedForkConfigError("config.forkContext.model must be a non-empty string");
  }
  if (config.mode === "pruned" && config.model === void 0) {
    throw new PrunedForkConfigError('config.forkContext.model is required when config.forkContext.mode is "pruned"');
  }
}
function isValidKeyId(value) {
  if (value !== value.trim()) return false;
  const parts = value.toLowerCase().split("+");
  const base = parts.pop();
  if (!base || !BASE_KEY_IDS.has(base)) return false;
  return parts.length <= KEY_MODIFIERS.size && new Set(parts).size === parts.length && parts.every((modifier) => KEY_MODIFIERS.has(modifier));
}
function resolveScheduledStoreRoot(value) {
  const expanded = value.startsWith("~/") ? path2.join(os.homedir(), value.slice(2)) : value;
  if (!path2.isAbsolute(expanded)) throw new Error(`config.scheduledRuns.storeRoot must be an absolute path or "~/...", got ${JSON.stringify(value)}`);
  return path2.normalize(expanded);
}
function validateScheduledRunsConfig(value) {
  if (value === void 0) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("config.scheduledRuns must be a JSON object");
  const enabled = value.enabled;
  if (enabled !== void 0 && typeof enabled !== "boolean") throw new Error("config.scheduledRuns.enabled must be a boolean");
  const storeRoot = value.storeRoot;
  if (storeRoot === void 0) return;
  if (typeof storeRoot !== "string" || !storeRoot.trim()) throw new Error("config.scheduledRuns.storeRoot must be a non-empty string");
  resolveScheduledStoreRoot(storeRoot);
}
function validateFleetKeybindingsConfig(value) {
  if (value === void 0) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("config.fleetKeybindings must be a JSON object");
  for (const [action, bindings] of Object.entries(value)) {
    if (!FLEET_KEYBINDING_ACTION_SET.has(action)) throw new Error(`config.fleetKeybindings.${action} is not a supported Fleet action`);
    if (!Array.isArray(bindings) || bindings.length === 0) throw new Error(`config.fleetKeybindings.${action} must be a non-empty array of strings`);
    for (const binding of bindings) {
      if (typeof binding !== "string" || !binding.trim()) throw new Error(`config.fleetKeybindings.${action} entries must be non-empty strings`);
    }
  }
}
function validateArtifactConfig(value) {
  if (value === void 0) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("config.artifactConfig must be a JSON object");
  const cleanupDays = value.cleanupDays;
  if (cleanupDays !== void 0 && (typeof cleanupDays !== "number" || !Number.isInteger(cleanupDays) || cleanupDays < 0)) {
    throw new Error("config.artifactConfig.cleanupDays must be a non-negative integer");
  }
}
function validateCapacityConfig(value) {
  if (value === void 0) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("config.capacity must be a JSON object");
  const abandonedSlotReleaseAfterMs = value.abandonedSlotReleaseAfterMs;
  if (abandonedSlotReleaseAfterMs !== void 0 && abandonedSlotReleaseAfterMs !== false && (typeof abandonedSlotReleaseAfterMs !== "number" || !Number.isInteger(abandonedSlotReleaseAfterMs) || abandonedSlotReleaseAfterMs < MIN_ABANDONED_SLOT_RELEASE_AFTER_MS || abandonedSlotReleaseAfterMs > MAX_ABANDONED_SLOT_RELEASE_AFTER_MS)) {
    throw new Error(`config.capacity.abandonedSlotReleaseAfterMs must be false or an integer from ${MIN_ABANDONED_SLOT_RELEASE_AFTER_MS} to ${MAX_ABANDONED_SLOT_RELEASE_AFTER_MS}`);
  }
}
function validateRunnerLaunchersConfig(value) {
  if (value === void 0) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("config.runnerLaunchers must be a JSON object mapping launcher names to argv arrays");
  for (const [name, argv] of Object.entries(value)) {
    const label = `config.runnerLaunchers[${JSON.stringify(name)}]`;
    if (!RUNNER_LAUNCHER_NAME_PATTERN.test(name)) throw new Error(`${label} has an invalid name; launcher names ${RUNNER_LAUNCHER_NAME_RULE}`);
    if (!Array.isArray(argv) || argv.length === 0 || argv.some((arg) => typeof arg !== "string" || !arg.trim() || arg.includes("\0"))) {
      throw new Error(`${label} must be a non-empty argv array of non-blank strings without NUL characters`);
    }
  }
}
function validateOrcaProgressTabsConfig(value) {
  if (value === void 0) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("config.orcaProgressTabs must be a JSON object");
  const config = value;
  for (const key of Object.keys(config)) {
    if (key !== "enabled") throw new Error(`config.orcaProgressTabs.${key} is not supported`);
  }
  if (config.enabled !== void 0 && typeof config.enabled !== "boolean") {
    throw new Error("config.orcaProgressTabs.enabled must be a boolean");
  }
}
function validateMainWindowRendererConfig(value) {
  if (value === void 0) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("config.mainWindowRenderer must be a JSON object");
  const rendererConfig = value;
  if (rendererConfig.horizontalSpacing !== void 0 && (typeof rendererConfig.horizontalSpacing !== "number" || !Number.isInteger(rendererConfig.horizontalSpacing) || rendererConfig.horizontalSpacing < 0 || rendererConfig.horizontalSpacing > 4)) {
    throw new Error("config.mainWindowRenderer.horizontalSpacing must be an integer from 0 to 4");
  }
  if (rendererConfig.compactResultMaxLines !== void 0 && (typeof rendererConfig.compactResultMaxLines !== "number" || !Number.isInteger(rendererConfig.compactResultMaxLines) || rendererConfig.compactResultMaxLines < 1)) {
    throw new Error("config.mainWindowRenderer.compactResultMaxLines must be a positive integer");
  }
}
function validateConfig(config) {
  if (config.worktree !== void 0 && typeof config.worktree !== "boolean") {
    throw new Error("config.worktree must be a boolean");
  }
  if (config.worktreeProvider !== void 0 && config.worktreeProvider !== "auto" && config.worktreeProvider !== "native" && config.worktreeProvider !== "worktrunk") {
    throw new Error('config.worktreeProvider must be "auto", "native", or "worktrunk"');
  }
  if (config.worktreeBranchPrefix !== void 0) {
    if (typeof config.worktreeBranchPrefix !== "string") throw new Error("config.worktreeBranchPrefix must be a string");
    normalizeWorktreeBranchPrefix(config.worktreeBranchPrefix);
  }
  if (config.defaultSubagentContext !== void 0 && config.defaultSubagentContext !== "fresh" && config.defaultSubagentContext !== "fork") {
    throw new Error('config.defaultSubagentContext must be "fresh" or "fork"');
  }
  validateForkContextConfig(config.forkContext);
  if (config.checkpointBeforeDeadlineMs !== void 0 && (typeof config.checkpointBeforeDeadlineMs !== "number" || !Number.isInteger(config.checkpointBeforeDeadlineMs) || config.checkpointBeforeDeadlineMs <= 0 || config.checkpointBeforeDeadlineMs > 2147483647)) {
    throw new Error("config.checkpointBeforeDeadlineMs must be a positive integer no larger than 2147483647");
  }
  if (config.foregroundDetachShortcut !== void 0 && (typeof config.foregroundDetachShortcut !== "string" || !isValidKeyId(config.foregroundDetachShortcut))) {
    throw new Error('config.foregroundDetachShortcut must be a valid keybinding string such as "ctrl+b"');
  }
  if (config.artifactDir !== void 0 && !ARTIFACT_DIR_PREFERENCES.has(config.artifactDir)) {
    throw new Error(`config.artifactDir must be "project", "session", or "temp"`);
  }
  if (config.maxActiveAsyncRunsPerSession !== void 0 && (typeof config.maxActiveAsyncRunsPerSession !== "number" || !Number.isInteger(config.maxActiveAsyncRunsPerSession) || config.maxActiveAsyncRunsPerSession < 0)) {
    throw new Error("config.maxActiveAsyncRunsPerSession must be a non-negative integer");
  }
  if (config.resultScanLogging !== void 0 && config.resultScanLogging !== "all" && config.resultScanLogging !== "activity" && config.resultScanLogging !== "off") {
    throw new Error('config.resultScanLogging must be "all", "activity", or "off"');
  }
  if (config.asyncWidgetCollapsed !== void 0 && typeof config.asyncWidgetCollapsed !== "boolean") {
    throw new Error("config.asyncWidgetCollapsed must be a boolean");
  }
  if (config.asyncWidgetLayout !== void 0 && config.asyncWidgetLayout !== "adaptive" && config.asyncWidgetLayout !== "rows") {
    throw new Error('config.asyncWidgetLayout must be "adaptive" or "rows"');
  }
  if (config.programStatus !== void 0 && typeof config.programStatus !== "boolean") {
    throw new Error("config.programStatus must be a boolean");
  }
  if (config.activeRunsPrompt !== void 0 && typeof config.activeRunsPrompt !== "boolean") {
    throw new Error("config.activeRunsPrompt must be a boolean");
  }
  if (config.pinToolDeclarations !== void 0 && typeof config.pinToolDeclarations !== "boolean") {
    throw new Error("config.pinToolDeclarations must be a boolean");
  }
  if (config.enableSlashCommands !== void 0 && typeof config.enableSlashCommands !== "boolean") {
    throw new Error("config.enableSlashCommands must be a boolean");
  }
  if (config.autoResume !== void 0 && typeof config.autoResume !== "boolean") {
    throw new Error("config.autoResume must be a boolean");
  }
  if (config.toolActivation !== void 0 && config.toolActivation !== "auto" && config.toolActivation !== "dynamic" && config.toolActivation !== "eager") {
    throw new Error('config.toolActivation must be "auto", "dynamic", or "eager"');
  }
  validateMissionStoreConfig(config.missions);
  validateAuthorityPolicy(config.authorityPolicy);
  validatePermissionConfig(config.permissions);
  validateScheduledRunsConfig(config.scheduledRuns);
  validateDisabledFeatures(config.disabledFeatures);
  validateFleetKeybindingsConfig(config.fleetKeybindings);
  validateArtifactConfig(config.artifactConfig);
  validateCapacityConfig(config.capacity);
  if (config.modelExclusions !== void 0) throw new Error("config.modelExclusions was removed; model failures are no longer persisted or used for automatic switching");
  validateModelResponseAliases(config.modelResponseAliases);
  validateMainWindowRendererConfig(config.mainWindowRenderer);
  validateOrcaProgressTabsConfig(config.orcaProgressTabs);
  validateRunnerLaunchersConfig(config.runnerLaunchers);
}
function getConfigPath() {
  return path2.join(getAgentDir(), "extensions", "subagent", "config.json");
}
function readConfigForUpdate(configPath = getConfigPath()) {
  if (!fs2.existsSync(configPath)) return {};
  const parsed = JSON.parse(fs2.readFileSync(configPath, "utf-8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Subagent config at '${configPath}' must be a JSON object`);
  }
  validateConfig(parsed);
  return parsed;
}
function resolveAsyncByDefault(config) {
  return config.asyncByDefault !== false;
}
function loadConfig() {
  const configPath = getConfigPath();
  try {
    return readConfigForUpdate(configPath);
  } catch (error) {
    if (error instanceof PrunedForkConfigError) throw error;
    try {
      const raw = JSON.parse(fs2.readFileSync(configPath, "utf-8"));
      if (raw && typeof raw === "object" && !Array.isArray(raw) && FAIL_CLOSED_CONFIG_KEYS.some((key) => Object.hasOwn(raw, key))) throw error;
    } catch (readError) {
      if (readError === error) throw error;
    }
    console.error(`Failed to load subagent config from '${configPath}':`, error);
  }
  return {};
}

export {
  resolveDisabledFeatureSurface,
  disabledFeatureUseError,
  disabledFeatureNotice,
  ActiveAsyncCapacityError,
  resolveMaxActiveAsyncRunsPerSession,
  resolveAbandonedSlotReleaseAfterMs,
  inspectActiveAsyncCapacityOwner,
  getActiveAsyncCapacitySnapshot,
  acquireActiveAsyncCapacity,
  transferActiveAsyncCapacity,
  resolveScheduledStoreRoot,
  resolveAsyncByDefault,
  loadConfig
};
