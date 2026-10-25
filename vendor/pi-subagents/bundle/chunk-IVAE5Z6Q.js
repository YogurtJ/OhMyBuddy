import {
  SubagentFleetStatus,
  buildAsyncStatusSnapshotForState,
  clearLegacyResultAnimationTimer,
  readMainThinkingLevel,
  renderSubagentResult,
  renderSubagentSummary,
  renderWidget,
  resolveFleetViewPlacement,
  setInlineWorkflowCoverage,
  setMainThinkingLevelSource,
  widgetRenderKey
} from "./chunk-4Y2ROR7L.js";
import {
  package_default
} from "./chunk-UTT254JE.js";
import {
  EXTERNAL_JOB_BRIDGE_REQUEST_DIR,
  REVIVAL_ORIGIN_FILE,
  SUBAGENT_GUIDE_TOPICS,
  attachNestedChildrenToResultChildren,
  buildCompletionKey,
  buildSubagentResultIntercomPayload,
  clearProviderRetry,
  compactNestedResultChildren,
  controlNotificationKey,
  createParentWake,
  createScheduledRunManager,
  createWaitSubscriptionManager,
  deliverSubagentResultIntercomEvent,
  deriveChildSessionName,
  disposeChildSessions,
  editableAgentConfig,
  externalJobBridgeEligibility,
  flattenSubagentToolOptions,
  formatControlNoticeMessage,
  getInspectorPlugins,
  hasLiveSubagentWork,
  hasWorkflowResumeRefusal,
  listRetainedChildren,
  listScheduledRunSummaries,
  markSeenWithTtl,
  normalizePublicSubagentExecution,
  parseSubagentNotifyContent,
  prepareWorkflowResume,
  preservedAgentFrontmatterFields,
  readWorkflowReceipt,
  recordWorkflowResumeRefusal,
  refusalSentence,
  registerHerdrStatusBridge,
  registerInspectorEventListener,
  registerMainWatchdog,
  registerPiWebSessionLiveness,
  registerSubagentNotify,
  releaseWorkflowResumeClaim,
  resolveSubagentResultStatus,
  resumedRunStarted,
  runtimeReplacedAbortReason,
  sameProviderDiagnostics,
  serviceExternalJobBridgeRequests,
  snapshotProviderDiagnostics,
  workflowResumeClaimState,
  workflowResumeRefusal
} from "./chunk-ZIV4J4HG.js";
import {
  CONTACT_SUPERVISOR_TOOL_NAME,
  NATIVE_SUPERVISOR_TOOL_NAME,
  SUBAGENT_CHILD_ENV,
  SUBAGENT_PARENT_SESSION_ENV,
  SUPERVISOR_REPLY_ENTRY_TYPE,
  SUPERVISOR_REQUEST_MESSAGE_TYPE,
  SubagentFlatParams,
  completionReplayPath,
  createNativeSupervisorChannel,
  createSubagentParamsSchema,
  drainOutstandingWork,
  finalizeToolResult,
  normalizeWatchdogWarningDetails,
  parseSupervisorReplyData,
  parseSupervisorRequestDetails,
  readCompletionArchive,
  readCompletionReplay,
  recordWaitCompletion,
  recordedPromptSection,
  registerPinnedTool,
  registerWaitTool,
  resolveCurrentSessionId,
  resolvePiSessionId,
  resolveWaitToolConfig,
  setDeclarationPinning,
  topLevelSupervisorTool
} from "./chunk-VSUSLDNW.js";
import {
  deliverAsyncRunStop,
  ownerConfirmedDead,
  readSessionMessagesTail,
  resolveSubagentRunId,
  restoreForegroundRunHistory
} from "./chunk-FXUXCX2K.js";
import {
  ASYNC_STATUS_SNAPSHOT_KIND,
  ASYNC_STATUS_SNAPSHOT_VERSION,
  MODEL_ONLY_TOOL,
  canRenderComponents,
  decodeUtf8Tail,
  formatAsyncRunProgressLabel,
  formatWorkflowPreflightSummary,
  inheritedSessionIds,
  isStaleExtensionContextError,
  isStoppableAsyncStatusStep,
  listAsyncRuns,
  normalizeWorkflowPreflight,
  ownerSessionIds,
  ownsRun,
  parseWorkflowChildSummary,
  recordSessionReplacement,
  resolveAsyncRunLocation,
  resolveAsyncStatusChild,
  stopStoppableAsyncStatusChildren,
  withCachedUiContext
} from "./chunk-6XJB7PIX.js";
import "./chunk-NF7IEKBH.js";
import {
  disabledFeatureUseError,
  getActiveAsyncCapacitySnapshot,
  loadConfig,
  resolveAbandonedSlotReleaseAfterMs,
  resolveAsyncByDefault,
  resolveDisabledFeatureSurface,
  resolveMaxActiveAsyncRunsPerSession,
  resolveScheduledStoreRoot
} from "./chunk-UCPP4GNU.js";
import {
  ACTIVE_RUN_INDEX_DIR,
  MissionNotFoundError,
  OWNING_SESSION_COMPLETION_OWNER,
  WORKFLOW_STOP_CAUSE_OWNER_EXITED,
  acknowledgeMissionObserverSnapshot,
  checkRecordedPidLiveness,
  cleanupResultIndexes,
  currentCompletionOwnerId,
  encodeIndexSegment,
  findNestedRouteForRootId,
  hasLiveNestedDescendants,
  isRecordedPid,
  isReusableWorkflowStopCause,
  listMissions,
  missionObserverIndexPath,
  missionObserverResultCandidateFiles,
  missionStatePath,
  normalizeParallelGroups,
  previewSimpleWorkflowRun,
  projectNestedEvents,
  projectNestedRegistryForRoot,
  promotePendingResultFile,
  readMission,
  readMissionBinding,
  readProcessTerminal,
  readRecentTerminalRunIndex,
  readResultPayload,
  reconcileAsyncRun,
  reconcileNestedAsyncDescendants,
  resolveMissionStoreLocation,
  resultCandidateFilesForSession,
  resultFilePath,
  resultPayloadPathForIndexedRun,
  resultPayloadPathForMissionObserverRun,
  resultPayloadPathForSessionRun,
  resultSnapshotReplaced,
  retainNestedLookupRoute,
  retireResultSnapshot,
  sanitizeSummary,
  syncMissionFromAsyncCompletion,
  updateAsyncJobNestedProjection,
  updateMission,
  validHostStepNodes,
  withResultRunLease,
  withWorkflowChildRunModel,
  writeAsyncResultFile,
  writeResultIndexForData
} from "./chunk-46XKCPJR.js";
import "./chunk-OYF6AFDY.js";
import {
  shouldUseNativeFsWatch
} from "./chunk-NIXWDZZV.js";
import {
  validateIntercomBridgeConfig
} from "./chunk-XSWOTIA3.js";
import "./chunk-7F6RKT6W.js";
import "./chunk-4SDU2BZX.js";
import "./chunk-CTPAE36Y.js";
import {
  listHerdrProjectPaneRoots,
  restoreHerdrProjectPaneSnapshots
} from "./chunk-52UBALJL.js";
import "./chunk-7J4ZXMY7.js";
import {
  cleanupAllArtifactDirs,
  cleanupOldArtifacts,
  getArtifactPaths,
  getArtifactsDir
} from "./chunk-5TYMSZX3.js";
import {
  listBackgroundWorkProviders
} from "./chunk-N2BN7BF5.js";
import "./chunk-YYREO77V.js";
import "./chunk-UKG4V45O.js";
import {
  registerRuntimeAgentEventListener
} from "./chunk-43SCHIMD.js";
import {
  clearRuntimeAgentsForPi,
  listRuntimeAgentConfigs,
  mergeRuntimeAgents
} from "./chunk-YKEWIB4M.js";
import {
  DEFAULT_FILE_SYSTEM_RETRY_DELAYS_MS,
  EXTRA_AGENT_DIRS_ENV,
  FileLeaseBusyError,
  SUBAGENT_WATCHDOG_WARNING_TYPE,
  WATCHDOG_WARNING_IMPORTANCES,
  WATCHDOG_WARNING_SEVERITIES,
  cleanupOldChainDirs,
  clearAgentDiscoveryCache,
  discoverAgentSnapshot,
  discoverAgents,
  discoverAgentsAll,
  findBlockingAgentDiagnostic,
  findModelInfo,
  formatTokens,
  formatUnknownAgentError,
  frontmatterNameForConfig,
  getAgentDir,
  getPiSpawnCommand,
  getProjectConfigDir,
  getSupportedThinkingLevels,
  mergeBuiltinAgentOverride,
  parseFrontmatter,
  readStatus,
  removeBuiltinAgentOverrideFields,
  resolveAgentName,
  resolveExistingReadPaths,
  resolveWatchPath,
  runFileSystemOperationWithRetry,
  serializeAgent,
  shortenPath,
  splitKnownThinkingSuffix,
  toModelInfo,
  unknownAgentDiagnosticContext,
  validateOptionalMachine,
  validateToolBudgetConfig,
  waitForFileSystemRetry,
  withSettingsFileLease,
  writeAtomicJson
} from "./chunk-CIZQXJ5Q.js";
import {
  DEFAULT_ARTIFACT_CONFIG,
  DIRS,
  SLASH_RESULT_TYPE,
  SLASH_SUBAGENT_CANCEL_EVENT,
  SLASH_SUBAGENT_REQUEST_EVENT,
  SLASH_SUBAGENT_RESPONSE_EVENT,
  SLASH_SUBAGENT_STARTED_EVENT,
  SLASH_SUBAGENT_UPDATE_EVENT,
  SLASH_TEXT_RESULT_TYPE,
  SLASH_TEXT_VIEW_ONLY_DETAILS,
  SUBAGENT_ASYNC_COMPLETE_EVENT,
  SUBAGENT_ASYNC_STARTED_EVENT,
  SUBAGENT_CHILD_STATUS_EVENT,
  SUBAGENT_CONTROL_EVENT,
  SUBAGENT_CONTROL_INTERCOM_EVENT,
  SUBAGENT_LIFECYCLE_ARTIFACT_VERSION,
  SUBAGENT_PROCESS_TERMINAL_EVENT,
  SUBAGENT_STEERING_NOTICE_EVENT,
  WIDGET_ANIMATION_INTERVAL_MS,
  WIDGET_KEY,
  resolveMaxSubagentSpawnsPerSession
} from "./chunk-5LFLVSTM.js";
import {
  safeTerminalText,
  sanitizeDisplayText,
  truncateDisplayText
} from "./chunk-YFCK7H2S.js";
import "./chunk-62OCY2S4.js";
import {
  SUBAGENT_DELEGATION_CANCEL_EVENT,
  SUBAGENT_DELEGATION_REQUEST_EVENT,
  SUBAGENT_DELEGATION_RESPONSE_EVENT,
  SUBAGENT_DELEGATION_STARTED_EVENT,
  SUBAGENT_DELEGATION_UPDATE_EVENT
} from "./chunk-D4EHT5SJ.js";
import {
  isAgentAllowedByCapabilityCeiling,
  resolveCurrentSubagentCapabilityCeiling
} from "./chunk-Z7KVHQHL.js";

// src/extension/index.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import * as fs16 from "node:fs";
import * as os3 from "node:os";
import * as path16 from "node:path";
import { Box as Box2, Container as Container3, Spacer as Spacer3, Text as Text2 } from "@earendil-works/pi-tui";

// src/agents/global-npm-root.ts
import { exec, execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
async function resolveGlobalNpmRoot(options = {}) {
  const env = options.env ?? process.env;
  const offline = env.PI_OFFLINE?.toLowerCase();
  if (offline === "1" || offline === "true" || offline === "yes") return null;
  if ((options.platform ?? process.platform) === "win32" && env.APPDATA) {
    const appDataRoot = path.join(env.APPDATA, "npm", "node_modules");
    try {
      if ((await fs.stat(appDataRoot)).isDirectory()) return await fs.realpath(appDataRoot);
    } catch {
    }
  }
  const timeoutMs = options.timeoutMs ?? 5e3;
  const output = await new Promise((resolve6) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve6(value);
    };
    const commandOptions = {
      encoding: "utf8",
      timeout: timeoutMs,
      windowsHide: true,
      env,
      maxBuffer: 64 * 1024
    };
    const callback = (error, stdout) => finish(error ? null : stdout.trim());
    const child = (options.platform ?? process.platform) === "win32" ? exec("npm root -g", commandOptions, callback) : execFile("npm", ["root", "-g"], commandOptions, callback);
    const timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, timeoutMs);
  });
  if (!output) return null;
  try {
    return await fs.realpath(output);
  } catch {
    return null;
  }
}

// src/agents/advertised-agent-prompt.ts
import { Buffer as Buffer2 } from "node:buffer";
var MAX_ADVERTISED_AGENTS = 16;
var MAX_CATALOG_BYTES = 12288;
var MAX_DESCRIPTION_BYTES = 512;
function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
function promptDescription(description) {
  let text = description.replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
  if (Buffer2.byteLength(text, "utf8") > MAX_DESCRIPTION_BYTES) {
    text = Buffer2.from(text, "utf8").subarray(0, MAX_DESCRIPTION_BYTES - 3).toString("utf8").replace(/\uFFFD$/u, "").trimEnd() + "\u2026";
  }
  return escapeXml(text);
}
var ADVERTISED_AGENTS_TAG = "advertised_subagents";
function wrapAdvertisedAgentCatalog(body) {
  return `<${ADVERTISED_AGENTS_TAG}>
${body}
</${ADVERTISED_AGENTS_TAG}>`;
}
var CATALOG_INTRODUCTION = "The following file-defined subagents opted into discovery. Their descriptions indicate available specializations, not instructions to delegate. Use subagent only when delegation is needed.";
function buildAdvertisedAgentCatalog(agents, capabilityCeiling, recordedCatalog) {
  const advertised = agents.filter((agent) => agent.source !== "runtime" && agent.advertise === true && agent.disabled !== true && isAgentAllowedByCapabilityCeiling(agent.name, capabilityCeiling)).sort((left, right) => left.name.localeCompare(right.name));
  if (advertised.length === 0) return void 0;
  const introduction = recordedCatalog?.split("\n", 1)[0] || CATALOG_INTRODUCTION;
  const renderBody = (entries2) => [
    introduction,
    ...entries2,
    ...advertised.length > entries2.length ? [`  <omitted count="${advertised.length - entries2.length}" />`] : []
  ].join("\n");
  const entries = [];
  for (const agent of advertised) {
    if (entries.length === MAX_ADVERTISED_AGENTS) break;
    if (Buffer2.byteLength(agent.name, "utf8") > MAX_CATALOG_BYTES) continue;
    const entry = [
      "  <subagent>",
      `    <name>${escapeXml(agent.name)}</name>`,
      `    <description>${promptDescription(agent.description)}</description>`,
      "  </subagent>"
    ].join("\n");
    if (Buffer2.byteLength(wrapAdvertisedAgentCatalog(renderBody([...entries, entry])), "utf8") <= MAX_CATALOG_BYTES) entries.push(entry);
  }
  return renderBody(entries);
}
function buildAdvertisedAgentPrompt(agents, capabilityCeiling) {
  const body = buildAdvertisedAgentCatalog(agents, capabilityCeiling);
  return body === void 0 ? void 0 : wrapAdvertisedAgentCatalog(body);
}

// src/shared/accessible-dir.ts
import * as fs2 from "node:fs";
function ensureAccessibleDir(dirPath, options = {}) {
  const fsImpl = options.fs ?? fs2;
  const pid = options.pid ?? process.pid;
  const retryDirectoryErrors = options.retryDirectoryErrors ?? process.platform === "win32";
  const retryDelaysMs = retryDirectoryErrors ? options.retryDelaysMs ?? DEFAULT_FILE_SYSTEM_RETRY_DELAYS_MS.slice(0, 3) : [];
  const wait = options.wait ?? waitForFileSystemRetry;
  const mkdirWithRetry = (target) => {
    runFileSystemOperationWithRetry(() => {
      fsImpl.mkdirSync(target, { recursive: true });
    }, { retryDelaysMs, wait });
  };
  const accessWithRetry = (target) => {
    runFileSystemOperationWithRetry(() => {
      fsImpl.accessSync(target, fs2.constants.R_OK | fs2.constants.W_OK);
    }, { retryDelaysMs, wait });
  };
  const fallbackPath = () => {
    const fallback = `${dirPath}-${pid}`;
    mkdirWithRetry(fallback);
    accessWithRetry(fallback);
    return fallback;
  };
  try {
    mkdirWithRetry(dirPath);
    accessWithRetry(dirPath);
    return dirPath;
  } catch (error) {
    const code = error?.code;
    if (code !== "EPERM" && code !== "EACCES") throw error;
    return fallbackPath();
  }
}

// src/runs/background/async-job-tracker.ts
import * as fs3 from "node:fs";
import * as path2 from "node:path";
var CONTROL_EVENT_READ_CHUNK_BYTES = 64 * 1024;
var MAX_CONTROL_EVENT_LINE_BYTES = 1024 * 1024;
var CONTROL_EVENT_SCAN_WINDOW_BYTES = 2 * 1024 * 1024;
var MAX_RECENT_FLEET_JOBS = 20;
var DEFAULT_LIVENESS_INTERVAL_MS = 5e3;
var EVENT_REFRESH_DEBOUNCE_MS = 25;
var WATCH_ATTACHMENT_RETRY_MS = 100;
var SUPERVISOR_NOTICE_GRACE_MS = 6e4;
var isTerminalJobStatus = (status) => status === "complete" || status === "failed" || status === "partial" || status === "paused" || status === "rejected" || status === "stopped";
function rememberFleetJob(state, job) {
  state.fleetJobs ??= /* @__PURE__ */ new Map();
  state.fleetJobs.set(job.asyncId, job);
  const terminal = [...state.fleetJobs.values()].filter((candidate) => isTerminalJobStatus(candidate.status)).sort((left, right) => (right.updatedAt ?? right.startedAt ?? 0) - (left.updatedAt ?? left.startedAt ?? 0));
  for (const stale of terminal.slice(MAX_RECENT_FLEET_JOBS)) state.fleetJobs.delete(stale.asyncId);
}
function createAsyncJobTracker(pi, state, asyncDirRoot, options = {}) {
  const completionRetentionMs = options.completionRetentionMs ?? 1e4;
  const livenessIntervalMs = options.pollIntervalMs ?? DEFAULT_LIVENESS_INTERVAL_MS;
  const resultsDir = options.resultsDir ?? DIRS.results;
  const steeringNoticeSeen = /* @__PURE__ */ new Map();
  const jobWatchers = /* @__PURE__ */ new Map();
  const refreshTimers = /* @__PURE__ */ new Map();
  let widgetRerenderTimer;
  const runningJobIds = /* @__PURE__ */ new Set();
  const externalJobBridgeRuns = /* @__PURE__ */ new Set();
  const terminalPublications = /* @__PURE__ */ new Map();
  const supervisorNoticeTimers = /* @__PURE__ */ new Map();
  let rootWatcher;
  let nextLivenessAt = Date.now() + livenessIntervalMs;
  let nextWidgetAnimationAt = Date.now() + WIDGET_ANIMATION_INTERVAL_MS;
  const watch3 = options.watch ?? fs3.watch;
  const useNativeWatcher = () => shouldUseNativeFsWatch("async-job-tracker", options.platform);
  const withLastUiContext = (run) => {
    const cached = state.lastUiContext;
    return withCachedUiContext(cached, () => {
      if (state.lastUiContext === cached) state.lastUiContext = null;
    }, run);
  };
  const rerenderWidget = (ctx, jobs = Array.from(state.asyncJobs.values())) => {
    options.onJobsChanged?.();
    if (state.widgetsSuspended) return;
    renderWidget(ctx, options.widgetEnabled === false ? [] : jobs, options.widgetCollapsed, options.widgetLayout);
    ctx.ui.requestRender?.();
  };
  const rerenderLastWidget = (jobs = Array.from(state.asyncJobs.values())) => {
    withLastUiContext((ctx) => rerenderWidget(ctx, jobs));
  };
  const scheduleLastWidgetRerender = () => {
    if (widgetRerenderTimer) return;
    widgetRerenderTimer = setTimeout(() => {
      widgetRerenderTimer = void 0;
      rerenderLastWidget();
    }, EVENT_REFRESH_DEBOUNCE_MS);
    widgetRerenderTimer.unref?.();
  };
  const requestLastWidgetRender = () => {
    if (options.widgetEnabled === false) return;
    withLastUiContext((ctx) => {
      if (state.widgetsSuspended) return;
      const requestRender = ctx.ui.requestRender;
      if (requestRender) requestRender.call(ctx.ui);
      else renderWidget(ctx, Array.from(state.asyncJobs.values()), options.widgetCollapsed, options.widgetLayout);
    });
  };
  const refreshWidget = (ctx) => rerenderWidget(ctx);
  const restoredControlEventCursor = (asyncDir) => {
    try {
      return fs3.statSync(path2.join(asyncDir, "events.jsonl")).size;
    } catch (error) {
      if (error.code === "ENOENT") return 0;
      throw error;
    }
  };
  const findNestedRouteForJob = (runId) => {
    try {
      return findNestedRouteForRootId(runId);
    } catch (error) {
      console.error(`Failed to resolve nested event route for '${runId}':`, error);
      return void 0;
    }
  };
  const summaryToJob = (run) => {
    const groups = normalizeParallelGroups(run.parallelGroups, run.steps.length, run.chainStepCount ?? run.steps.length);
    const activeGroup = run.currentStep !== void 0 ? groups.find((group) => run.currentStep >= group.start && run.currentStep < group.start + group.count) : void 0;
    const visibleSteps = activeGroup ? run.steps.slice(activeGroup.start, activeGroup.start + activeGroup.count).map((step, index) => ({ ...step, index: activeGroup.start + index })) : run.steps.map((step, index) => ({ ...step, index }));
    return {
      asyncId: run.id,
      asyncDir: run.asyncDir,
      toolCallId: run.toolCallId,
      status: run.state,
      sessionId: run.sessionId,
      activityState: run.activityState,
      lastActivityAt: run.lastActivityAt,
      currentTool: run.currentTool,
      currentToolStartedAt: run.currentToolStartedAt,
      currentPath: run.currentPath,
      turnCount: run.turnCount,
      toolCount: run.toolCount,
      steering: run.steering,
      mode: run.mode,
      context: run.context,
      cwd: run.cwd,
      sessionRoot: run.sessionRoot,
      agents: visibleSteps.map((step) => step.agent),
      currentStep: run.currentStep,
      chainStepCount: run.chainStepCount,
      parallelGroups: groups,
      hostSteps: run.hostSteps,
      ...run.mode === "workflow" && run.workflowGraph ? { workflowGraph: run.workflowGraph } : {},
      preflight: run.preflight,
      steps: visibleSteps,
      stepsTotal: visibleSteps.length,
      runningSteps: visibleSteps.filter((step) => step.status === "running").length,
      completedSteps: visibleSteps.filter((step) => step.status === "complete" || step.status === "completed").length,
      hasParallelGroups: groups.length > 0,
      activeParallelGroup: Boolean(activeGroup),
      startedAt: run.startedAt,
      updatedAt: run.lastUpdate ?? run.startedAt,
      timeoutMs: run.timeoutMs,
      deadlineAt: run.deadlineAt,
      timedOut: run.timedOut,
      stopped: run.stopped,
      turnBudget: run.turnBudget,
      turnBudgetExceeded: run.turnBudgetExceeded,
      wrapUpRequested: run.wrapUpRequested,
      sessionDir: run.sessionDir,
      outputFile: run.outputFile,
      totalTokens: run.totalTokens,
      sessionFile: run.sessionFile,
      controlEventCursor: restoredControlEventCursor(run.asyncDir),
      nestedRoute: findNestedRouteForJob(run.id),
      nestedChildren: run.nestedChildren,
      parentWorkflowRunId: run.parentWorkflowRunId,
      workflowKey: run.workflowKey,
      workflow: run.workflow,
      workflowChildren: parseWorkflowChildSummary(run.workflowChildren)
    };
  };
  const cancelCleanup = (asyncId) => {
    const existingTimer = state.cleanupTimers.get(asyncId);
    if (!existingTimer) return;
    clearTimeout(existingTimer);
    state.cleanupTimers.delete(asyncId);
  };
  const scheduleCleanup = (asyncId) => {
    cancelCleanup(asyncId);
    const timer = setTimeout(() => {
      state.cleanupTimers.delete(asyncId);
      closeJobWatcher(asyncId);
      const job = state.asyncJobs.get(asyncId);
      retainNestedLookupRoute(state, job?.nestedRoute, job?.sessionId);
      state.asyncJobs.delete(asyncId);
      options.onJobCleanup?.(asyncId);
      rerenderLastWidget();
    }, completionRetentionMs);
    state.cleanupTimers.set(asyncId, timer);
  };
  const deliverControlRecord = (record, payload) => {
    if (record.channels.includes("event")) {
      pi.events.emit(SUBAGENT_CONTROL_EVENT, payload);
    }
    if (record.event.type !== "active_long_running" && record.channels.includes("intercom") && record.intercom?.to && record.intercom.message) {
      pi.events.emit(SUBAGENT_CONTROL_INTERCOM_EVENT, {
        ...payload,
        to: record.intercom.to,
        message: record.intercom.message
      });
    }
  };
  const readSupervisorRequestState = (event, asyncDir) => {
    try {
      return options.supervisorRequestState?.(event) ?? "unknown";
    } catch (error) {
      console.error(`Failed to resolve supervisor request state for async control event in '${asyncDir}':`, error);
      return "unknown";
    }
  };
  const scheduleSupervisorNotice = (asyncId, record, payload) => {
    const key = `${asyncId}:${record.event.index}:${record.event.toolCallId}`;
    if (supervisorNoticeTimers.has(key)) return;
    const timer = setTimeout(() => {
      supervisorNoticeTimers.delete(key);
      const job = state.asyncJobs.get(asyncId);
      if (job?.status !== "running" && job?.status !== "queued") return;
      if (readSupervisorRequestState(record.event, payload.asyncDir) === "resolved") return;
      deliverControlRecord(record, payload);
    }, SUPERVISOR_NOTICE_GRACE_MS);
    timer.unref?.();
    supervisorNoticeTimers.set(key, { asyncId, timer });
  };
  const clearSupervisorNotices = (asyncId) => {
    for (const [key, entry] of supervisorNoticeTimers) {
      if (asyncId !== void 0 && entry.asyncId !== asyncId) continue;
      clearTimeout(entry.timer);
      supervisorNoticeTimers.delete(key);
    }
  };
  const emitNewControlEvents = (job) => {
    const eventsPath = path2.join(job.asyncDir, "events.jsonl");
    let fd;
    try {
      fd = fs3.openSync(eventsPath, "r");
    } catch (error) {
      if (error.code === "ENOENT") return;
      console.error(`Failed to open async control events for '${job.asyncDir}':`, error);
      return;
    }
    try {
      const stat = fs3.fstatSync(fd);
      const savedCursor = job.controlEventCursor;
      let cursor = stat.size < (savedCursor ?? 0) ? 0 : savedCursor ?? 0;
      const startedFromTail = savedCursor === void 0 && stat.size > CONTROL_EVENT_SCAN_WINDOW_BYTES;
      if (startedFromTail) cursor = stat.size - CONTROL_EVENT_SCAN_WINDOW_BYTES;
      if (stat.size <= cursor) return;
      const previousByte = Buffer.alloc(1);
      const startsMidLine = cursor > 0 && fs3.readSync(fd, previousByte, 0, 1, cursor - 1) === 1 && previousByte[0] !== 10;
      const scanEnd = Math.min(stat.size, cursor + CONTROL_EVENT_SCAN_WINDOW_BYTES);
      const handleLine = (line) => {
        if (!line.trim()) return;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch (error) {
          console.error(`Ignoring malformed async control event in '${eventsPath}':`, error);
          return;
        }
        if (!parsed || typeof parsed !== "object") return;
        if (parsed.type === "subagent.child-status") {
          const event = parsed;
          if (event.version !== 1 || typeof event.runId !== "string" || typeof event.childId !== "string" || event.status !== "started" && event.status !== "stopping" && event.status !== "stopped" || typeof event.ts !== "number") return;
          try {
            pi.events.emit(SUBAGENT_CHILD_STATUS_EVENT, {
              type: "subagent.child-status",
              version: 1,
              runId: event.runId,
              childId: event.childId,
              status: event.status,
              ts: event.ts,
              ...typeof event.reason === "string" ? { reason: event.reason } : {},
              source: event.source === "rpc" ? "rpc" : "async",
              asyncDir: job.asyncDir,
              ...typeof event.stepIndex === "number" ? { stepIndex: event.stepIndex } : {},
              ...typeof event.agent === "string" ? { agent: event.agent } : {},
              ...typeof event.childRunId === "string" ? { childRunId: event.childRunId } : {},
              ...typeof event.workflowKey === "string" ? { workflowKey: event.workflowKey } : {},
              ...typeof event.phase === "string" ? { phase: event.phase } : {},
              ...typeof event.label === "string" ? { label: event.label } : {}
            });
          } catch (error) {
            console.error("Failed to emit async child status event:", error);
          }
          return;
        }
        if (parsed.type === "subagent.steering.notice") {
          const notice = parsed;
          if (typeof notice.requestId !== "string" || typeof notice.runId !== "string" || notice.state !== "failed" && notice.state !== "partial" && notice.state !== "recovered" || typeof notice.message !== "string") return;
          if (typeof state.currentSessionId === "string" && notice.currentSessionId !== state.currentSessionId) return;
          const key = `${notice.runId}:${notice.requestId}:${notice.state}`;
          if (steeringNoticeSeen.has(key)) return;
          const now = Date.now();
          steeringNoticeSeen.set(key, now);
          if (steeringNoticeSeen.size > 200) {
            for (const [seenKey, seenAt] of steeringNoticeSeen) {
              if (now - seenAt > 10 * 60 * 1e3 || steeringNoticeSeen.size > 200) steeringNoticeSeen.delete(seenKey);
            }
          }
          pi.events.emit(SUBAGENT_STEERING_NOTICE_EVENT, { ...notice, source: "async", asyncDir: job.asyncDir, noticeText: notice.message });
          return;
        }
        if (parsed.type !== "subagent.control") return;
        const candidate = parsed;
        if (!candidate.event || !Array.isArray(candidate.channels)) return;
        const record = candidate;
        const supervisorRequest = record.event.type === "needs_attention" && record.event.reason === "supervisor_request" && options.supervisorRequestState !== void 0;
        if (supervisorRequest && readSupervisorRequestState(record.event, job.asyncDir) === "resolved") return;
        const payload = {
          event: record.event,
          source: "async",
          asyncDir: job.asyncDir,
          childIntercomTarget: record.childIntercomTarget,
          noticeText: record.noticeText ?? formatControlNoticeMessage(record.event, record.childIntercomTarget)
        };
        if (supervisorRequest && record.event.currentTool !== "intercom") {
          if (record.channels.includes("event")) pi.events.emit(SUBAGENT_CONTROL_EVENT, { ...payload, noticeDeferred: true });
          scheduleSupervisorNotice(job.asyncId, record, payload);
          return;
        }
        deliverControlRecord(record, payload);
      };
      let readCursor2 = cursor;
      let lastCompleteCursor = cursor;
      let lineParts = [];
      let lineBytes = 0;
      let skippingOversizedLine = startedFromTail || startsMidLine;
      const appendLineSegment = (segment2) => {
        if (segment2.length === 0 || skippingOversizedLine) return;
        if (lineBytes + segment2.length > MAX_CONTROL_EVENT_LINE_BYTES) {
          lineParts = [];
          lineBytes = 0;
          skippingOversizedLine = true;
          return;
        }
        lineParts.push(segment2);
        lineBytes += segment2.length;
      };
      while (readCursor2 < scanEnd) {
        const toRead = Math.min(CONTROL_EVENT_READ_CHUNK_BYTES, scanEnd - readCursor2);
        const buffer = Buffer.alloc(toRead);
        const bytesRead = fs3.readSync(fd, buffer, 0, toRead, readCursor2);
        if (bytesRead <= 0) break;
        const chunk = bytesRead === buffer.length ? buffer : buffer.subarray(0, bytesRead);
        let lineStart = 0;
        for (let index = 0; index < chunk.length; index++) {
          if (chunk[index] !== 10) continue;
          appendLineSegment(chunk.subarray(lineStart, index));
          if (!skippingOversizedLine && lineBytes > 0) {
            handleLine(Buffer.concat(lineParts, lineBytes).toString("utf-8"));
          }
          lineParts = [];
          lineBytes = 0;
          skippingOversizedLine = false;
          lastCompleteCursor = readCursor2 + index + 1;
          lineStart = index + 1;
        }
        appendLineSegment(chunk.subarray(lineStart));
        readCursor2 += bytesRead;
        if (skippingOversizedLine) job.controlEventCursor = readCursor2;
      }
      if (lastCompleteCursor > cursor) job.controlEventCursor = lastCompleteCursor;
      else if (scanEnd < stat.size || startedFromTail) job.controlEventCursor = scanEnd;
    } catch (error) {
      console.error(`Failed to read async control events for '${job.asyncDir}':`, error);
    } finally {
      fs3.closeSync(fd);
    }
  };
  const closeJobWatcher = (asyncId) => {
    const watched = jobWatchers.get(asyncId);
    if (watched?.retryTimer) clearTimeout(watched.retryTimer);
    for (const watcher of watched?.watchers.values() ?? []) watcher.close();
    jobWatchers.delete(asyncId);
    const timer = refreshTimers.get(asyncId);
    if (timer) clearTimeout(timer);
    refreshTimers.delete(asyncId);
    runningJobIds.delete(asyncId);
    externalJobBridgeRuns.delete(asyncId);
    terminalPublications.delete(asyncId);
    clearSupervisorNotices(asyncId);
  };
  const refreshJob = (job) => {
    const widgetExpanded = withLastUiContext((ctx) => ctx.ui.getToolsExpanded?.() ?? false) ?? false;
    const widgetStateBefore = widgetRenderKey(job, widgetExpanded);
    let nestedRefreshFailed = false;
    const refreshNestedProjection = () => {
      try {
        updateAsyncJobNestedProjection(job);
      } catch (error) {
        nestedRefreshFailed = true;
        console.error(`Failed to refresh nested async descendants for '${job.asyncDir}':`, error);
      }
    };
    let bridgeSweepAttempted = false;
    try {
      emitNewControlEvents(job);
      const bridgeAlreadyRequired = externalJobBridgeRuns.has(job.asyncId) || externalJobBridgeEligibility(job.steps) === "required";
      if (bridgeAlreadyRequired) {
        externalJobBridgeRuns.add(job.asyncId);
        bridgeSweepAttempted = true;
        serviceExternalJobBridgeRequests(job.asyncDir);
      }
      try {
        if (job.nestedRoute) reconcileNestedAsyncDescendants(job.nestedRoute, { resultsDir, kill: options.kill, now: options.now });
      } catch (error) {
        nestedRefreshFailed = true;
        console.error(`Failed to refresh nested async descendants for '${job.asyncDir}':`, error);
      }
      refreshNestedProjection();
      const reconciliation = reconcileAsyncRun(job.asyncDir, {
        resultsDir,
        kill: options.kill,
        now: options.now,
        startedRun: {
          runId: job.asyncId,
          pid: job.pid,
          sessionId: job.sessionId,
          completionOwnerId: job.completionOwnerId,
          mode: job.mode,
          agents: job.agents,
          chainStepCount: job.chainStepCount,
          parallelGroups: job.parallelGroups,
          startedAt: job.startedAt,
          sessionFile: job.sessionFile
        }
      });
      const status = reconciliation.status ?? readStatus(job.asyncDir);
      if (!bridgeAlreadyRequired) {
        const bridgeEligibility = externalJobBridgeEligibility(status?.steps);
        if (bridgeEligibility === "required") externalJobBridgeRuns.add(job.asyncId);
        if (bridgeEligibility !== "not-required") {
          bridgeSweepAttempted = true;
          serviceExternalJobBridgeRequests(job.asyncDir);
        }
      }
      if (status) {
        const previousStatus = job.status;
        job.status = status.state;
        if (!isTerminalJobStatus(job.status)) terminalPublications.delete(job.asyncId);
        if (job.status === "running") runningJobIds.add(job.asyncId);
        else runningJobIds.delete(job.asyncId);
        if (!isTerminalJobStatus(job.status)) cancelCleanup(job.asyncId);
        job.sessionId = status.sessionId ?? job.sessionId;
        job.activityState = status.activityState;
        job.lastActivityAt = status.lastActivityAt ?? job.lastActivityAt;
        job.currentTool = status.currentTool;
        job.currentToolStartedAt = status.currentToolStartedAt;
        job.currentPath = status.currentPath;
        job.turnCount = status.turnCount ?? job.turnCount;
        job.toolCount = status.toolCount ?? job.toolCount;
        job.steering = status.steering ?? job.steering;
        job.mode = status.mode;
        job.parentWorkflowRunId = status.parentWorkflowRunId ?? job.parentWorkflowRunId;
        job.workflowKey = status.workflowKey ?? job.workflowKey;
        job.lane = status.lane ?? job.lane;
        job.workflow = status.workflow ?? job.workflow;
        if (status.mode === "workflow") job.workflowGraph = status.workflowGraph ?? job.workflowGraph;
        job.hostSteps = validHostStepNodes(status.workflowGraph);
        const workflowChildren = parseWorkflowChildSummary(status.workflowChildren);
        if (workflowChildren && status.mode === "workflow") workflowChildren.children = workflowChildren.children.map((child) => withWorkflowChildRunModel(job.asyncDir, child));
        if (workflowChildren && workflowChildren.workflowRunId !== status.runId) throw new Error("workflowChildren.workflowRunId does not match async status runId.");
        job.workflowChildren = workflowChildren ?? job.workflowChildren;
        job.currentStep = status.currentStep ?? job.currentStep;
        job.chainStepCount = status.chainStepCount ?? job.chainStepCount;
        job.startedAt = status.startedAt ?? job.startedAt;
        if (status.lastUpdate !== void 0) job.updatedAt = status.lastUpdate;
        if (status.steps?.length) {
          const groups = normalizeParallelGroups(status.parallelGroups, status.steps.length, status.chainStepCount ?? status.steps.length);
          job.parallelGroups = groups.length ? groups : job.parallelGroups;
          job.hasParallelGroups = groups.length > 0 || job.hasParallelGroups;
          const activeGroup = status.currentStep !== void 0 ? groups.find((group) => status.currentStep >= group.start && status.currentStep < group.start + group.count) : void 0;
          const visibleSteps = activeGroup ? status.steps.slice(activeGroup.start, activeGroup.start + activeGroup.count).map((step, index) => ({ ...step, index: activeGroup.start + index })) : status.steps.map((step, index) => ({ ...step, index }));
          job.activeParallelGroup = Boolean(activeGroup);
          if (status.mode === "workflow") {
            for (const step of visibleSteps) if (step.async === true) Object.assign(step, withWorkflowChildRunModel(job.asyncDir, step));
          }
          job.agents = visibleSteps.map((step) => step.agent);
          job.steps = visibleSteps;
          refreshNestedProjection();
          job.stepsTotal = visibleSteps.length;
          job.runningSteps = visibleSteps.filter((step) => step.status === "running").length;
          job.completedSteps = visibleSteps.filter((step) => step.status === "complete" || step.status === "completed").length;
          if (status.state === "complete") job.completedSteps = visibleSteps.length;
        }
        job.sessionDir = status.sessionDir ?? job.sessionDir;
        job.outputFile = status.outputFile ?? job.outputFile;
        job.totalTokens = status.totalTokens ?? job.totalTokens;
        job.timeoutMs = status.timeoutMs ?? job.timeoutMs;
        job.deadlineAt = status.deadlineAt ?? job.deadlineAt;
        job.timedOut = status.timedOut ?? job.timedOut;
        job.stopped = status.stopped ?? job.stopped;
        job.turnBudget = status.turnBudget ?? job.turnBudget;
        job.turnBudgetExceeded = status.turnBudgetExceeded ?? job.turnBudgetExceeded;
        job.wrapUpRequested = status.wrapUpRequested ?? job.wrapUpRequested;
        job.sessionFile = status.sessionFile ?? job.sessionFile;
        if (isTerminalJobStatus(job.status)) {
          let publication = terminalPublications.get(job.asyncId);
          if (!publication && status.mode !== "workflow" && status.processTerminal?.state === "pending" && status.runId === job.asyncId && status.completionOwnerId && (status.sessionId === state.currentSessionId && status.completionOwnerId === state.completionOwnerId || typeof status.sessionId === "string" && options.deliveryOwnerId?.(status.sessionId, status.completionOwnerId, status.completionOwnerProcess, status.parentWorkflowRunId) === OWNING_SESSION_COMPLETION_OWNER)) {
            publication = { instanceId: status.processTerminal.runnerProcessInstanceId, pending: true };
            terminalPublications.set(job.asyncId, publication);
          }
          const wasPending = publication?.pending;
          if (publication?.pending) {
            const published = reconciliation.resultPath && fs3.existsSync(reconciliation.resultPath);
            const closed = !published && readProcessTerminal(job.asyncDir, {
              runId: job.asyncId,
              runnerProcessInstanceId: publication.instanceId
            })?.state === "observed";
            if (published || closed) {
              publication = { pending: false };
              terminalPublications.set(job.asyncId, publication);
            } else cancelCleanup(job.asyncId);
          }
          if (!isTerminalJobStatus(previousStatus) || wasPending && !publication?.pending) options.onJobTerminal?.(job);
          rememberFleetJob(state, job);
          if (!publication?.pending && !nestedRefreshFailed && !hasLiveNestedDescendants(job.nestedChildren) && (previousStatus !== job.status || !state.cleanupTimers.has(job.asyncId))) {
            scheduleCleanup(job.asyncId);
          }
        }
        return widgetRenderKey(job, widgetExpanded) !== widgetStateBefore;
      }
      if (job.status === "queued") {
        job.status = "running";
        job.updatedAt = Date.now();
        runningJobIds.add(job.asyncId);
      }
    } catch (error) {
      if (!bridgeSweepAttempted) {
        try {
          bridgeSweepAttempted = true;
          serviceExternalJobBridgeRequests(job.asyncDir);
        } catch (bridgeError) {
          console.error(`Failed to service external job bridge for '${job.asyncDir}':`, bridgeError);
        }
      }
      if (job.status !== "failed") {
        console.error(`Failed to read async status for '${job.asyncDir}':`, error);
        job.status = "failed";
        job.updatedAt = Date.now();
      }
      runningJobIds.delete(job.asyncId);
      rememberFleetJob(state, job);
      if (!terminalPublications.get(job.asyncId)?.pending && !hasLiveNestedDescendants(job.nestedChildren) && !state.cleanupTimers.has(job.asyncId)) scheduleCleanup(job.asyncId);
    }
    return widgetRenderKey(job, widgetExpanded) !== widgetStateBefore;
  };
  const scheduleJobRefresh = (asyncId, delayMs = EVENT_REFRESH_DEBOUNCE_MS) => {
    if (refreshTimers.has(asyncId)) return;
    const timer = setTimeout(() => {
      refreshTimers.delete(asyncId);
      const job = state.asyncJobs.get(asyncId);
      if (job && refreshJob(job)) scheduleLastWidgetRerender();
    }, delayMs);
    timer.unref?.();
    refreshTimers.set(asyncId, timer);
  };
  const watchJob = (job) => {
    if (!useNativeWatcher()) return;
    const watched = jobWatchers.get(job.asyncId) ?? { watchers: /* @__PURE__ */ new Map() };
    const active = job.status === "queued" || job.status === "running";
    const watchPath = (watchPath2) => {
      if (watched.watchers.has(watchPath2)) return true;
      const nestedEventSink = job.nestedRoute?.eventSink === watchPath2;
      let watcher;
      try {
        watcher = watch3(resolveWatchPath(watchPath2), (_event, file) => {
          const rawFileName = file?.toString();
          const fileName = rawFileName ?? path2.basename(watchPath2);
          const nestedEventFile = nestedEventSink && (!rawFileName || rawFileName.endsWith(".json") || rawFileName.endsWith(".jsonl"));
          if (fileName === "status.json" || fileName === "events.jsonl" || fileName === EXTERNAL_JOB_BRIDGE_REQUEST_DIR || fileName.endsWith(".json") || nestedEventFile) {
            scheduleJobRefresh(job.asyncId);
          }
          if (watchPath2 !== job.asyncDir && !nestedEventSink) {
            watcher.close();
            watched.watchers.delete(watchPath2);
            watchJob(job);
          }
        });
      } catch {
        return false;
      }
      watcher.on("error", () => {
        watcher.close();
        watched.watchers.delete(watchPath2);
        if (watchPath2.endsWith("status.json") || nestedEventSink) watchJob(job);
      });
      watcher.unref?.();
      watched.watchers.set(watchPath2, watcher);
      return true;
    };
    watchPath(job.asyncDir);
    const statusPath = path2.join(job.asyncDir, "status.json");
    const hadStatusWatcher = watched.watchers.has(statusPath);
    const statusWatched = watchPath(statusPath);
    if (statusWatched && !hadStatusWatcher) scheduleJobRefresh(job.asyncId);
    watchPath(path2.join(job.asyncDir, "events.jsonl"));
    watchPath(path2.join(job.asyncDir, EXTERNAL_JOB_BRIDGE_REQUEST_DIR));
    if (job.nestedRoute) watchPath(job.nestedRoute.eventSink);
    if (!statusWatched && active && !watched.retryTimer) {
      watched.retryTimer = setTimeout(() => {
        watched.retryTimer = void 0;
        const current = state.asyncJobs.get(job.asyncId);
        if (current) watchJob(current);
      }, WATCH_ATTACHMENT_RETRY_MS);
      watched.retryTimer.unref?.();
    } else if (statusWatched && watched.retryTimer) {
      clearTimeout(watched.retryTimer);
      watched.retryTimer = void 0;
    }
    if (watched.watchers.size > 0 || watched.retryTimer) jobWatchers.set(job.asyncId, watched);
    else jobWatchers.delete(job.asyncId);
  };
  const watchAsyncRoot = () => {
    if (!useNativeWatcher()) return;
    if (rootWatcher) return;
    try {
      rootWatcher = watch3(resolveWatchPath(asyncDirRoot), (_event, file) => {
        const runDirName = file?.toString();
        for (const job of state.asyncJobs.values()) {
          if (jobWatchers.has(job.asyncId) || runDirName && path2.basename(job.asyncDir) !== runDirName) continue;
          watchJob(job);
          if (jobWatchers.has(job.asyncId)) scheduleJobRefresh(job.asyncId);
        }
      });
      rootWatcher.on("error", () => {
        rootWatcher?.close();
        rootWatcher = void 0;
      });
      rootWatcher.unref?.();
    } catch {
    }
  };
  const ensurePoller = () => {
    watchAsyncRoot();
    if (state.poller) return;
    nextLivenessAt = Date.now() + livenessIntervalMs;
    state.poller = setInterval(() => {
      if (state.asyncJobs.size === 0) {
        rerenderLastWidget([]);
        if (state.poller) clearInterval(state.poller);
        state.poller = null;
        rootWatcher?.close();
        rootWatcher = void 0;
        return;
      }
      const now = Date.now();
      if (now >= nextLivenessAt) {
        nextLivenessAt = now + livenessIntervalMs;
        let widgetChanged = false;
        for (const job of state.asyncJobs.values()) {
          watchJob(job);
          if (refreshJob(job)) widgetChanged = true;
        }
        if (widgetChanged) rerenderLastWidget();
      }
      if (runningJobIds.size > 0 && now >= nextWidgetAnimationAt) {
        nextWidgetAnimationAt = now + WIDGET_ANIMATION_INTERVAL_MS;
        requestLastWidgetRender();
      }
    }, Math.min(WIDGET_ANIMATION_INTERVAL_MS, livenessIntervalMs));
    state.poller.unref?.();
  };
  const handleStarted = (data) => {
    const info = data;
    if (!info.id) return;
    if (typeof state.currentSessionId === "string" && info.sessionId !== state.currentSessionId) return;
    const now = Date.now();
    const asyncDir = info.asyncDir ?? path2.join(asyncDirRoot, info.id);
    const rawAgents = info.agents?.length ? info.agents : info.chain && info.chain.length > 0 ? info.chain : info.agent ? [info.agent] : void 0;
    const validParallelGroups = normalizeParallelGroups(info.parallelGroups, Number.MAX_SAFE_INTEGER, info.chainStepCount ?? Number.MAX_SAFE_INTEGER);
    const firstGroup = validParallelGroups.find((group) => group.start === 0);
    const firstGroupCount = firstGroup?.count;
    const agents = firstGroupCount && firstGroupCount > 0 ? rawAgents?.slice(0, firstGroupCount) : rawAgents;
    const existingJob = state.asyncJobs.get(info.id);
    const sessionRoot = state.liveAsyncSessionRoots?.get(info.id) ?? existingJob?.sessionRoot;
    state.liveAsyncSessionRoots?.delete(info.id);
    externalJobBridgeRuns.delete(info.id);
    terminalPublications.delete(info.id);
    state.asyncJobs.set(info.id, {
      asyncId: info.id,
      asyncDir,
      ...typeof info.cwd === "string" ? { cwd: path2.resolve(info.cwd) } : {},
      ...sessionRoot ? { sessionRoot } : {},
      status: "queued",
      pid: typeof info.pid === "number" ? info.pid : void 0,
      ...typeof info.sessionId === "string" ? { sessionId: info.sessionId } : {},
      ...typeof info.completionOwnerId === "string" ? { completionOwnerId: info.completionOwnerId } : {},
      mode: info.mode ?? (info.chain ? "chain" : "single"),
      description: info.goal ?? info.task,
      agents,
      chainStepCount: info.chainStepCount,
      parallelGroups: validParallelGroups,
      nestedRoute: info.nestedRoute,
      stepsTotal: firstGroupCount ?? agents?.length,
      hasParallelGroups: validParallelGroups.length > 0,
      activeParallelGroup: Boolean(firstGroupCount && firstGroupCount > 0),
      startedAt: now,
      updatedAt: now,
      timeoutMs: info.timeoutMs,
      deadlineAt: info.deadlineAt,
      turnBudget: info.turnBudget,
      parentWorkflowRunId: info.parentWorkflowRunId,
      workflowKey: info.workflowKey,
      ...info.mode === "workflow" && info.workflowGraph ? { workflowGraph: info.workflowGraph } : {},
      controlEventCursor: 0
    });
    const job = state.asyncJobs.get(info.id);
    rememberFleetJob(state, job);
    watchJob(job);
    scheduleJobRefresh(info.id, 0);
    ensurePoller();
    rerenderLastWidget();
  };
  const handleComplete = (data) => {
    const result = data;
    if (typeof state.currentSessionId === "string" && result.sessionId !== state.currentSessionId) return;
    const asyncId = result.id;
    if (!asyncId) return;
    const job = state.asyncJobs.get(asyncId);
    let nestedRefreshFailed = false;
    if (job) {
      job.status = result.state ?? (result.success ? "complete" : "failed");
      runningJobIds.delete(asyncId);
      job.stopped = result.stopped ?? job.stopped;
      job.updatedAt = Date.now();
      if (result.asyncDir && result.asyncDir !== job.asyncDir) {
        closeJobWatcher(asyncId);
        job.asyncDir = result.asyncDir;
        watchJob(job);
      }
      terminalPublications.set(asyncId, { pending: false });
      try {
        updateAsyncJobNestedProjection(job);
      } catch (error) {
        nestedRefreshFailed = true;
        console.error(`Failed to refresh nested async descendants for '${job.asyncDir}':`, error);
      }
    }
    if (job) rememberFleetJob(state, job);
    rerenderLastWidget();
    if (!nestedRefreshFailed && !hasLiveNestedDescendants(job?.nestedChildren)) scheduleCleanup(asyncId);
  };
  const dispose = () => {
    if (state.poller) clearInterval(state.poller);
    state.poller = null;
    rootWatcher?.close();
    rootWatcher = void 0;
    for (const asyncId of jobWatchers.keys()) closeJobWatcher(asyncId);
    for (const timer of refreshTimers.values()) clearTimeout(timer);
    refreshTimers.clear();
    if (widgetRerenderTimer) clearTimeout(widgetRerenderTimer);
    widgetRerenderTimer = void 0;
    runningJobIds.clear();
    externalJobBridgeRuns.clear();
    terminalPublications.clear();
    clearSupervisorNotices();
  };
  const resetJobs = (ctx) => {
    dispose();
    state.statusProjectionSessionId = null;
    for (const timer of state.cleanupTimers.values()) clearTimeout(timer);
    state.cleanupTimers.clear();
    state.asyncJobs.clear();
    state.fleetJobs?.clear();
    state.foregroundControls?.clear();
    state.liveAsyncSessionRoots?.clear();
    state.lastForegroundControlId = null;
    state.resultFileCoalescer.clear();
    if (ctx?.hasUI) {
      state.lastUiContext = ctx;
      rerenderWidget(ctx, []);
    }
  };
  const restoreActiveJobs = (ctx, observeStatus) => {
    if (ctx?.hasUI) state.lastUiContext = ctx;
    state.statusProjectionSessionId = null;
    if (!state.currentSessionId) return;
    let runs;
    try {
      runs = listAsyncRuns(asyncDirRoot, { states: ["queued", "running"], sessionId: state.currentSessionId, resultsDir, kill: options.kill, now: options.now, adoptCompletionOwnerId: state.completionOwnerId }, observeStatus);
    } catch (error) {
      console.error(`Failed to restore active async jobs from '${asyncDirRoot}':`, error);
      return;
    }
    for (const run of runs) {
      const job = summaryToJob(run);
      state.asyncJobs.set(run.id, job);
      if (job.status === "running") runningJobIds.add(job.asyncId);
      rememberFleetJob(state, job);
      watchJob(job);
    }
    state.statusProjectionSessionId = state.currentSessionId;
    if (runs.length === 0) return;
    ensurePoller();
    rerenderLastWidget();
  };
  return { ensurePoller, refreshWidget, handleStarted, handleComplete, resetJobs, restoreActiveJobs, dispose };
}

// src/runs/background/async-retention.ts
import { execFile as execFile2 } from "node:child_process";
import * as fs4 from "node:fs";
import * as os from "node:os";
import * as path3 from "node:path";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
var ASYNC_RETENTION_DAYS = 30;
var ASYNC_RETENTION_BATCH_SIZE = 100;
var ASYNC_RETENTION_DELAY_MS = 6e4;
var ASYNC_RETENTION_TOMBSTONE_GRACE_MS = 24 * 60 * 60 * 1e3;
var RETENTION_MS = ASYNC_RETENTION_DAYS * 24 * 60 * 60 * 1e3;
var LOCK_NAME = ".async-retention.lock";
var CURSOR_NAME = ".async-retention-cursor.json";
var LOG_NAME = "async-retention-maintenance.jsonl";
var RUN_TOMBSTONE_PREFIX = ".deleting-run-";
var RESULT_TOMBSTONE_PREFIX = ".deleting-result-";
var RUN_TOMBSTONE_MARKERS_DIR = "async-retention-run-tombstones";
var LOCK_STALE_MS = 24 * 60 * 60 * 1e3;
var RUN_MODES = /* @__PURE__ */ new Set(["single", "parallel", "chain", "workflow"]);
var TERMINAL_STATES = /* @__PURE__ */ new Set(["complete", "failed", "stopped", "rejected"]);
var TERMINAL_MISSION_STATUSES = /* @__PURE__ */ new Set(["completed", "failed", "cancelled"]);
var RESULT_TIMESTAMP_FIELDS = ["endedAt", "completedAt", "createdAt", "writtenAt", "expiresAt", "timestamp"];
function isNotFound(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function compactError(error) {
  const message2 = error instanceof Error ? error.message : String(error);
  return message2.replace(/\s+/g, " ").slice(0, 240);
}
function listDir(dir) {
  try {
    return fs4.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}
function readJson(filePath) {
  try {
    const parsed = JSON.parse(fs4.readFileSync(filePath).toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function readStatus2(runDir) {
  const value = readJson(path3.join(runDir, "status.json"));
  if (!value || typeof value.runId !== "string" || typeof value.state !== "string" || typeof value.mode !== "string" || !RUN_MODES.has(value.mode) || typeof value.startedAt !== "number" || !Number.isFinite(value.startedAt)) return void 0;
  return value;
}
function existingRegularFile(filePath) {
  if (!filePath) return false;
  try {
    const stat = fs4.lstatSync(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (error) {
    return !isNotFound(error);
  }
}
function validRunId(runId) {
  return runId.length > 0 && runId !== "." && runId !== ".." && path3.basename(runId) === runId;
}
function statusTimestamp(status, runDir) {
  if (status.endedAt !== void 0 && (typeof status.endedAt !== "number" || !Number.isFinite(status.endedAt))) return void 0;
  if (status.lastUpdate !== void 0 && (typeof status.lastUpdate !== "number" || !Number.isFinite(status.lastUpdate))) return void 0;
  const logical = status.endedAt ?? status.lastUpdate;
  try {
    const physical = Math.max(fs4.statSync(runDir).mtimeMs, fs4.statSync(path3.join(runDir, "status.json")).mtimeMs);
    const timestamp = logical === void 0 ? physical : Math.max(logical, physical);
    return Number.isFinite(timestamp) ? timestamp : void 0;
  } catch {
    return void 0;
  }
}
function hasNestedReferences(status) {
  return status.isNested === true || (status.steps ?? []).some((step) => (step.children?.length ?? 0) > 0);
}
function hasResumableContract(runDir, status) {
  const statusSessionFiles = [status.sessionFile, ...(status.steps ?? []).map((step) => step.sessionFile)];
  if (statusSessionFiles.some(existingRegularFile)) return true;
  const descriptorPath = path3.join(runDir, "recovery-descriptor.json");
  if (!fs4.existsSync(descriptorPath)) return false;
  const descriptor = readJson(descriptorPath);
  if (!descriptor) return true;
  const sessionFiles = [
    typeof descriptor.sessionFile === "string" ? descriptor.sessionFile : void 0
  ];
  if (descriptor.sourceRunId !== status.runId) return true;
  return sessionFiles.some(existingRegularFile);
}
function activeMarkerExists(asyncDirRoot, runId) {
  return fs4.existsSync(path3.join(asyncDirRoot, ACTIVE_RUN_INDEX_DIR, runId));
}
function missionObserverIndexExists(resultsDir, runId) {
  return fs4.existsSync(path3.join(resultsDir, "result-index", "observers", "mission", `${encodeIndexSegment(runId)}.json`));
}
function missionReferenceBlocksReclaim(runDir, resultsDir, runId) {
  if (missionObserverIndexExists(resultsDir, runId)) return true;
  let binding;
  try {
    binding = readMissionBinding(runDir);
  } catch {
    return true;
  }
  if (!binding) return false;
  try {
    const mission = readMission(binding.location, binding.missionId);
    return !TERMINAL_MISSION_STATUSES.has(mission.status);
  } catch (error) {
    return !(error instanceof MissionNotFoundError);
  }
}
function runTombstoneMarkerPath(maintenanceRoot, runId) {
  return path3.join(maintenanceRoot, RUN_TOMBSTONE_MARKERS_DIR, `${encodeIndexSegment(runId)}.json`);
}
function writeRunTombstoneMarker(maintenanceRoot, runId, tombstonePath, now) {
  const markerPath = runTombstoneMarkerPath(maintenanceRoot, runId);
  fs4.mkdirSync(path3.dirname(markerPath), { recursive: true });
  writeAtomicJson(markerPath, { version: 1, runId, tombstonePath, createdAt: now });
}
function removeRunTombstoneMarker(maintenanceRoot, runId) {
  fs4.rmSync(runTombstoneMarkerPath(maintenanceRoot, runId), { force: true });
}
function readRunTombstoneMarker(maintenanceRoot, runId) {
  const markerPath = runTombstoneMarkerPath(maintenanceRoot, runId);
  try {
    const stat = fs4.lstatSync(markerPath);
    if (!stat.isFile() || stat.isSymbolicLink()) return "unreadable";
  } catch (error) {
    return isNotFound(error) ? void 0 : "unreadable";
  }
  const marker = readJson(markerPath);
  if (marker?.version !== 1 || marker.runId !== runId || typeof marker.tombstonePath !== "string" || !marker.tombstonePath) return "unreadable";
  return { runId, tombstonePath: marker.tombstonePath };
}
function runTombstoneMarkerMatches(maintenanceRoot, runId, tombstonePath) {
  const marker = readRunTombstoneMarker(maintenanceRoot, runId);
  return marker !== void 0 && marker !== "unreadable" && path3.resolve(marker.tombstonePath) === path3.resolve(tombstonePath);
}
function runTombstoneMarkerBlocks(maintenanceRoot, runId) {
  const marker = readRunTombstoneMarker(maintenanceRoot, runId);
  if (marker === void 0) return false;
  if (marker === "unreadable") return true;
  try {
    if (fs4.existsSync(marker.tombstonePath)) return true;
    removeRunTombstoneMarker(maintenanceRoot, runId);
    return false;
  } catch {
    return true;
  }
}
function unresolvedHandoff(manifestPath) {
  const manifest = readJson(manifestPath);
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.groups) || manifest.groups.length === 0) return true;
  return manifest.groups.some((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return true;
    const cleanup = value.cleanup;
    return !cleanup || typeof cleanup !== "object" || Array.isArray(cleanup) || cleanup.state !== "complete";
  });
}
function hasUnresolvedRunHandoff(runDir, status) {
  const paths = /* @__PURE__ */ new Set();
  if (status.parallelHandoff) {
    if (typeof status.parallelHandoff.path !== "string" || !status.parallelHandoff.path) return true;
    paths.add(status.parallelHandoff.path);
  }
  const localPath = path3.join(runDir, "handoff.json");
  if (fs4.existsSync(localPath)) paths.add(localPath);
  return [...paths].some(unresolvedHandoff);
}
function runSkipReason(input) {
  const { runDir, status } = input;
  if (!status) return "invalid-status";
  if (!validRunId(status.runId)) return "identity-mismatch";
  if (path3.basename(runDir) !== status.runId && !path3.basename(runDir).startsWith(RUN_TOMBSTONE_PREFIX)) return "identity-mismatch";
  if (input.protectedRunIds.has(status.runId)) return "runtime-reference";
  if (input.waitRunIds.has(status.runId)) return "wait-reference";
  if (activeMarkerExists(input.asyncDirRoot, status.runId)) return "active-index";
  if (!TERMINAL_STATES.has(status.state)) return "non-terminal";
  if (status.mode === "workflow" || status.parentWorkflowRunId || status.workflowKey) return "workflow-reference";
  if (fs4.existsSync(path3.join(runDir, REVIVAL_ORIGIN_FILE))) return "workflow-reference";
  if (hasNestedReferences(status)) return "nested-reference";
  if (missionReferenceBlocksReclaim(runDir, input.resultsDir, status.runId)) return "mission-reference";
  if (hasUnresolvedRunHandoff(runDir, status)) return "handoff-reference";
  if (hasResumableContract(runDir, status)) return "resumable";
  const timestamp = statusTimestamp(status, runDir);
  if (timestamp === void 0) return "unknown-age";
  if (timestamp > input.cutoff) return "recent";
  return void 0;
}
function parseWaitRunIds(dir) {
  const runIds = /* @__PURE__ */ new Set();
  for (const entry of listDir(dir)) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const record = readJson(path3.join(dir, entry.name));
    if (!record || typeof record.runId !== "string" || typeof record.expiresAt !== "number") return { runIds, safe: false };
    runIds.add(record.runId);
  }
  return { runIds, safe: true };
}
function readCursor(root) {
  const value = readJson(path3.join(root, CURSOR_NAME));
  return value?.version === 1 ? value : { version: 1 };
}
var currentProcessStartIdentity;
function processStartIdentity(pid) {
  if (pid !== process.pid) return computeProcessStartIdentity(pid);
  currentProcessStartIdentity ??= computeProcessStartIdentity(pid);
  return currentProcessStartIdentity;
}
async function computeProcessStartIdentity(pid) {
  if (process.platform === "linux") {
    try {
      const stat = fs4.readFileSync(`/proc/${pid}/stat`).toString("utf8");
      const commandEnd = stat.lastIndexOf(")");
      if (commandEnd === -1) return void 0;
      const fields = stat.slice(commandEnd + 1).trim().split(/\s+/);
      return fields[19] ? `linux:${fields[19]}` : void 0;
    } catch {
      return void 0;
    }
  }
  if (process.platform === "win32") {
    const started = await new Promise((resolve6) => {
      execFile2("powershell.exe", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CreationDate`], { encoding: "utf-8", windowsHide: true, timeout: 5e3 }, (error, stdout) => {
        resolve6(error ? "" : stdout.trim());
      });
    });
    return started ? `win:${started}` : void 0;
  }
  return void 0;
}
function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = error.code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    return void 0;
  }
}
function parseLockOwner(lockDir) {
  const owner = readJson(path3.join(lockDir, "owner.json"));
  if (owner?.version !== 1 || typeof owner.token !== "string" || typeof owner.pid !== "number" || !Number.isInteger(owner.pid) || owner.pid <= 0 || typeof owner.hostname !== "string" || typeof owner.startedAt !== "number" || !Number.isFinite(owner.startedAt)) return void 0;
  if (owner.processStartIdentity !== void 0 && typeof owner.processStartIdentity !== "string") return void 0;
  return owner;
}
async function staleLock(lockDir, now, options) {
  const owner = parseLockOwner(lockDir);
  if (!owner) {
    try {
      return { stale: now - fs4.statSync(lockDir).mtimeMs >= LOCK_STALE_MS };
    } catch {
      return { stale: false };
    }
  }
  if (owner.hostname !== options.hostname) return { stale: false };
  const alive = options.isProcessAlive(owner.pid);
  if (alive === false) return { stale: true, token: owner.token };
  if (alive === true && owner.processStartIdentity) {
    const currentIdentity = await options.getProcessStartIdentity(owner.pid);
    if (currentIdentity !== void 0 && currentIdentity !== owner.processStartIdentity) return { stale: true, token: owner.token };
  }
  return { stale: now - owner.startedAt >= LOCK_STALE_MS, token: owner.token };
}
function createLockDirectory(lockDir, owner) {
  try {
    fs4.mkdirSync(lockDir, { mode: 448 });
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
  try {
    fs4.writeFileSync(path3.join(lockDir, "owner.json"), JSON.stringify(owner), { encoding: "utf-8", mode: 384 });
    return true;
  } catch (error) {
    fs4.rmSync(lockDir, { recursive: true, force: true });
    throw error;
  }
}
async function acquireRetentionLock(lockDir, owner, options) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (createLockDirectory(lockDir, owner)) return true;
    const stale = await staleLock(lockDir, owner.startedAt, options);
    if (!stale.stale) return false;
    const staleKey = (stale.token ?? owner.token).replace(/[^A-Za-z0-9._-]/g, "-");
    const tombstone = `${lockDir}.stale-${staleKey}`;
    try {
      fs4.renameSync(lockDir, tombstone);
    } catch (error) {
      const code = error.code;
      if (code === "ENOENT" || fs4.existsSync(tombstone)) continue;
      throw error;
    }
  }
  return false;
}
function releaseRetentionLock(lockDir, token) {
  if (parseLockOwner(lockDir)?.token !== token) return;
  fs4.rmSync(lockDir, { recursive: true, force: true });
}
function resultRunId(candidate, data) {
  if (typeof data.runId === "string") return data.runId;
  if (typeof data.id === "string") return data.id;
  if ((candidate.kind === "public" || candidate.kind === "pending") && path3.basename(candidate.path).endsWith(".json")) return path3.basename(candidate.path, ".json");
  return void 0;
}
function resultTimestamp(data, filePath) {
  for (const field of RESULT_TIMESTAMP_FIELDS) {
    const value = data[field];
    if (value !== void 0 && (typeof value !== "number" || !Number.isFinite(value))) return void 0;
  }
  const logical = RESULT_TIMESTAMP_FIELDS.map((field) => data[field]).filter((value) => typeof value === "number" && Number.isFinite(value));
  try {
    return Math.max(fs4.statSync(filePath).mtimeMs, ...logical);
  } catch {
    return void 0;
  }
}
function terminalResult(data) {
  return data.success === true || data.success === false || typeof data.state === "string" && TERMINAL_STATES.has(data.state);
}
function resultHasResumableSession(data) {
  if (existingRegularFile(typeof data.sessionFile === "string" ? data.sessionFile : void 0)) return true;
  return Array.isArray(data.results) && data.results.some((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const sessionFile = value.sessionFile;
    return existingRegularFile(typeof sessionFile === "string" ? sessionFile : void 0);
  });
}
function hasUnresolvedResultHandoff(data) {
  if (data.parallelHandoff === void 0) return false;
  if (!data.parallelHandoff || typeof data.parallelHandoff !== "object" || Array.isArray(data.parallelHandoff)) return true;
  const manifestPath = data.parallelHandoff.path;
  return typeof manifestPath !== "string" || !manifestPath || unresolvedHandoff(manifestPath);
}
function completionMode(data) {
  return data.completion && typeof data.completion === "object" && !Array.isArray(data.completion) ? data.completion.mode : void 0;
}
function resultSkipReason(input) {
  if (!input.data) return "invalid-result";
  const runId = resultRunId(input.candidate, input.data);
  if (!runId || !validRunId(runId)) return "invalid-result";
  if (runTombstoneMarkerBlocks(input.maintenanceRoot, runId)) return "run-tombstone-present";
  if (input.protectedRunIds.has(runId)) return "runtime-reference";
  if (input.waitRunIds.has(runId)) return "wait-reference";
  if (activeMarkerExists(input.asyncDirRoot, runId)) return "active-index";
  if (fs4.existsSync(path3.join(input.asyncDirRoot, runId))) return "run-present";
  if (missionObserverIndexExists(input.resultsDir, runId)) return "mission-reference";
  if (input.data.mode === "workflow" || completionMode(input.data) === "workflow" || typeof input.data.parentWorkflowRunId === "string" || typeof input.data.workflowKey === "string") return "workflow-reference";
  if (hasUnresolvedResultHandoff(input.data)) return "handoff-reference";
  if (resultHasResumableSession(input.data)) return "resumable";
  if (input.candidate.kind === "archive" && fs4.existsSync(path3.join(input.resultsDir, "completion-replay", `${encodeURIComponent(runId)}.json`))) return "replay-reference";
  if (!terminalResult(input.data) && input.candidate.kind !== "replay" && input.candidate.kind !== "archive" && input.candidate.kind !== "tombstone") return "non-terminal-result";
  const timestamp = resultTimestamp(input.data, input.candidate.path);
  if (timestamp === void 0) return "unknown-age";
  if (timestamp > input.cutoff) return "recent";
  return void 0;
}
function appendMaintenanceLog(root, result, now, deletedIds) {
  fs4.mkdirSync(root, { recursive: true });
  fs4.appendFileSync(path3.join(root, LOG_NAME), `${JSON.stringify({
    at: new Date(now).toISOString(),
    acquired: result.acquired,
    scanned: result.scanned,
    repairedRuns: result.repairedRuns,
    deletedRuns: result.deletedRuns,
    deletedResults: result.deletedResults,
    reapedTombstones: result.reapedTombstones,
    skipped: result.skipped,
    deleted: deletedIds.slice(0, ASYNC_RETENTION_BATCH_SIZE),
    errors: result.errors.length,
    rawReads: result.rawReads,
    sourceExhausted: result.sourceExhausted,
    discoveryDurationMs: result.discoveryDurationMs,
    commitDurationMs: result.commitDurationMs,
    cancelled: result.cancelled,
    workerFailed: result.workerFailed,
    durationMs: result.durationMs
  })}
`, "utf-8");
}
function increment(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}
var RetentionCancelledError = class extends Error {
};
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function safeRelative(relative2) {
  return relative2.length > 0 && !path3.isAbsolute(relative2) && !relative2.split(path3.sep).includes("..");
}
function parseDiscoveryResult(message2, passId, runBudget, resultBudget) {
  if (!isRecord(message2) || message2.type !== "result" || message2.passId !== passId) throw new Error("Retention discovery worker returned a stale or malformed pass id.");
  if (!Number.isFinite(message2.discoveryDurationMs) || message2.discoveryDurationMs < 0) throw new Error("Retention discovery worker returned an invalid duration.");
  if (!Number.isInteger(message2.rawReads) || message2.rawReads < 0) throw new Error("Retention discovery worker returned an invalid raw-read count.");
  if (!isRecord(message2.sourceExhausted) || Object.values(message2.sourceExhausted).some((value) => typeof value !== "boolean")) throw new Error("Retention discovery worker returned invalid source telemetry.");
  if (!Array.isArray(message2.runCandidates) || message2.runCandidates.length > runBudget) throw new Error("Retention discovery worker exceeded the run budget.");
  if (!Array.isArray(message2.resultCandidates) || message2.resultCandidates.length > resultBudget) throw new Error("Retention discovery worker exceeded the result budget.");
  if (!Array.isArray(message2.cursorOps) || message2.cursorOps.length > runBudget + resultBudget + 8) throw new Error("Retention discovery worker returned invalid cursor operations.");
  for (const candidate of message2.runCandidates) {
    if (!isRecord(candidate) || typeof candidate.name !== "string" || typeof candidate.relative !== "string" || !validRunId(candidate.name) || candidate.relative !== candidate.name) throw new Error("Retention discovery worker returned an unsafe run candidate.");
  }
  const resultKinds = /* @__PURE__ */ new Set(["public", "pending", "replay", "archive", "tombstone"]);
  const resultKeys = /* @__PURE__ */ new Set(["resultPublicAfter", "resultReplayAfter", "resultArchiveAfter"]);
  for (const candidate of message2.resultCandidates) {
    if (!isRecord(candidate) || typeof candidate.name !== "string" || typeof candidate.relative !== "string" || path3.basename(candidate.name) !== candidate.name || !safeRelative(candidate.relative) || path3.basename(candidate.relative) !== candidate.name || !resultKinds.has(candidate.kind) || !isRecord(candidate.cursor)) throw new Error("Retention discovery worker returned an unsafe result candidate.");
    const cursor = candidate.cursor;
    if (cursor.type === "pending") {
      if (typeof cursor.session !== "string" || !validRunId(cursor.session) || path3.dirname(candidate.relative) !== path3.join("result-pending", cursor.session)) throw new Error("Retention discovery worker returned an invalid pending candidate.");
    } else if (cursor.type === "result") {
      if (typeof cursor.key !== "string" || !resultKeys.has(cursor.key)) throw new Error("Retention discovery worker returned an invalid result cursor.");
      const expectedDir = cursor.key === "resultPublicAfter" ? "." : cursor.key === "resultReplayAfter" ? "completion-replay" : "output-archives";
      if (path3.dirname(candidate.relative) !== expectedDir) throw new Error("Retention discovery worker returned a result from the wrong source.");
    } else throw new Error("Retention discovery worker returned an invalid result cursor target.");
  }
  const scalarKeys = /* @__PURE__ */ new Set(["runAfter", "resultPublicAfter", "resultReplayAfter", "resultArchiveAfter", "pendingSessionAfter"]);
  for (const operation of message2.cursorOps) {
    if (!isRecord(operation) || typeof operation.type !== "string") throw new Error("Retention discovery worker returned a malformed cursor operation.");
    if (operation.type === "set" || operation.type === "delete") {
      if (typeof operation.key !== "string" || !scalarKeys.has(operation.key) || operation.type === "set" && (typeof operation.value !== "string" || !safeRelative(operation.value))) throw new Error("Retention discovery worker returned an invalid scalar cursor operation.");
    } else if (operation.type === "set-pending" || operation.type === "delete-pending") {
      if (typeof operation.session !== "string" || !validRunId(operation.session) || operation.type === "set-pending" && (typeof operation.value !== "string" || !safeRelative(operation.value))) throw new Error("Retention discovery worker returned an invalid pending cursor operation.");
    } else throw new Error("Retention discovery worker returned an unknown cursor operation.");
  }
  return message2;
}
function runRetentionDiscovery(input) {
  return new Promise((resolve6, reject) => {
    if (input.signal?.aborted) {
      reject(new RetentionCancelledError("Retention discovery was cancelled."));
      return;
    }
    const worker = new Worker(input.workerUrl);
    let settled = false;
    const cleanup = () => {
      input.signal?.removeEventListener("abort", onAbort);
      void worker.terminate();
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => fail(new RetentionCancelledError("Retention discovery was cancelled."));
    input.signal?.addEventListener("abort", onAbort, { once: true });
    worker.once("error", (error) => fail(error instanceof Error ? error : new Error(String(error))));
    worker.once("exit", (code) => {
      if (!settled) fail(new Error(`Retention discovery worker exited before replying (${code}).`));
    });
    worker.once("message", (message2) => {
      if (settled) return;
      try {
        if (isRecord(message2) && message2.type === "error" && message2.passId === input.passId) throw new Error(`Retention discovery failed: ${String(message2.error)}`);
        const discovery = parseDiscoveryResult(message2, input.passId, input.runBudget, input.resultBudget);
        settled = true;
        cleanup();
        resolve6(discovery);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
    worker.postMessage({ type: "discover", passId: input.passId, asyncDirRoot: input.asyncDirRoot, resultsDir: input.resultsDir, cursor: input.cursor, runBudget: input.runBudget, resultBudget: input.resultBudget });
  });
}
function applyCursorOperations(cursor, operations) {
  for (const operation of operations) {
    if (operation.type === "set") cursor[operation.key] = operation.value;
    else if (operation.type === "delete") delete cursor[operation.key];
    else if (operation.type === "set-pending") {
      cursor.resultPendingAfterBySession ??= {};
      cursor.resultPendingAfterBySession[operation.session] = operation.value;
    } else {
      delete cursor.resultPendingAfterBySession?.[operation.session];
      if (cursor.resultPendingAfterBySession && Object.keys(cursor.resultPendingAfterBySession).length === 0) delete cursor.resultPendingAfterBySession;
    }
  }
}
async function cleanupAsyncRetention(options) {
  const startedWall = Date.now();
  const now = options.now ?? Date.now;
  const currentTime = now();
  const retentionMs = options.retentionMs ?? RETENTION_MS;
  const tombstoneGraceMs = options.tombstoneGraceMs ?? ASYNC_RETENTION_TOMBSTONE_GRACE_MS;
  const batchSize = Math.min(ASYNC_RETENTION_BATCH_SIZE, Math.max(1, Math.trunc(options.batchSize ?? ASYNC_RETENTION_BATCH_SIZE)));
  const randomId = options.randomId ?? randomUUID;
  const maintenanceRoot = options.maintenanceRoot ?? path3.dirname(options.asyncDirRoot);
  const lockDir = path3.join(maintenanceRoot, LOCK_NAME);
  const lockToken = randomId();
  const pid = options.pid ?? process.pid;
  const hostname2 = options.hostname ?? os.hostname();
  const getProcessStartIdentity = options.getProcessStartIdentity ?? processStartIdentity;
  const currentProcessStartIdentity2 = options.processStartIdentity ?? await getProcessStartIdentity(pid) ?? (pid === process.pid ? `runtime:${Math.round(Date.now() - process.uptime() * 1e3)}` : void 0);
  const lockOwner = { version: 1, token: lockToken, pid, hostname: hostname2, startedAt: currentTime, ...currentProcessStartIdentity2 ? { processStartIdentity: currentProcessStartIdentity2 } : {} };
  const lockOptions = { hostname: hostname2, isProcessAlive: options.isProcessAlive ?? processIsAlive, getProcessStartIdentity };
  const result = {
    acquired: false,
    scanned: 0,
    repairedRuns: 0,
    deletedRuns: 0,
    deletedResults: 0,
    reapedTombstones: 0,
    skipped: {},
    errors: [],
    rawReads: 0,
    sourceExhausted: {},
    discoveryDurationMs: 0,
    commitDurationMs: 0,
    cancelled: false,
    workerFailed: false,
    durationMs: 0
  };
  const deletedIds = [];
  const lstatSync2 = options.lstatSync ?? fs4.lstatSync;
  let commitStartedAt;
  let cursorCommitUnsafe = false;
  const finish = () => {
    if (commitStartedAt !== void 0) result.commitDurationMs = Math.max(0, Date.now() - commitStartedAt);
    result.durationMs = Math.max(0, Date.now() - startedWall);
    appendMaintenanceLog(maintenanceRoot, result, currentTime, deletedIds);
    return result;
  };
  const markCancelled = () => {
    if (!options.signal?.aborted) return false;
    result.cancelled = true;
    increment(result.skipped, "cancelled");
    return true;
  };
  fs4.mkdirSync(maintenanceRoot, { recursive: true });
  if (!await acquireRetentionLock(lockDir, lockOwner, lockOptions)) {
    increment(result.skipped, "lock-busy");
    return finish();
  }
  result.acquired = true;
  try {
    if (markCancelled()) return finish();
    const protectedRunIds = new Set(options.protectedRunIds ?? []);
    const cutoff = currentTime - retentionMs;
    const cursor = readCursor(maintenanceRoot);
    const runBudget = Math.ceil(batchSize / 2);
    const resultBudget = batchSize - runBudget;
    const discoveryStartedAt = Date.now();
    let discovery;
    try {
      discovery = await runRetentionDiscovery({
        passId: randomUUID(),
        asyncDirRoot: options.asyncDirRoot,
        resultsDir: options.resultsDir,
        cursor,
        runBudget,
        resultBudget,
        workerUrl: options.discoveryWorkerUrl ?? new URL("../../../async-retention-discovery-worker.mjs", new URL("../src/runs/background/async-retention.js", import.meta.url).href),
        signal: options.signal
      });
    } catch (error) {
      result.discoveryDurationMs = Math.max(0, Date.now() - discoveryStartedAt);
      if (error instanceof RetentionCancelledError) {
        result.cancelled = true;
        increment(result.skipped, "cancelled");
      } else {
        result.workerFailed = true;
        increment(result.skipped, "worker-failure");
        result.errors.push(compactError(error));
      }
      return finish();
    }
    result.discoveryDurationMs = Math.max(0, Date.now() - discoveryStartedAt);
    result.rawReads = discovery.rawReads;
    result.sourceExhausted = discovery.sourceExhausted;
    commitStartedAt = Date.now();
    if (markCancelled()) return finish();
    if (parseLockOwner(lockDir)?.token !== lockToken) {
      increment(result.skipped, "lock-owner-changed");
      return finish();
    }
    const waitSubscriptionsDir = options.waitSubscriptionsDir ?? path3.join(maintenanceRoot, "wait-subscriptions");
    const waitReferences = parseWaitRunIds(waitSubscriptionsDir);
    if (!waitReferences.safe) {
      increment(result.skipped, "wait-references-unknown");
      return finish();
    }
    for (const entry of discovery.runCandidates) {
      if (markCancelled()) return finish();
      result.scanned += 1;
      const runDir = path3.join(options.asyncDirRoot, entry.name);
      let mutationStateChanged = false;
      try {
        const stat = lstatSync2(runDir);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
          increment(result.skipped, "unsafe-run-path");
          continue;
        }
        let status = readStatus2(runDir);
        if (status?.state === "running" && validRunId(status.runId) && path3.basename(runDir) === status.runId && !protectedRunIds.has(status.runId)) {
          const reconciliation = reconcileAsyncRun(runDir, {
            resultsDir: options.resultsDir,
            kill: options.reconcileKill,
            now
          });
          status = reconciliation.status ?? void 0;
          if (reconciliation.repaired) result.repairedRuns += 1;
        }
        const initialReason = runSkipReason({ runDir, status, asyncDirRoot: options.asyncDirRoot, resultsDir: options.resultsDir, cutoff, protectedRunIds, waitRunIds: waitReferences.runIds });
        if (initialReason) {
          increment(result.skipped, initialReason);
          continue;
        }
        if (entry.name.startsWith(RUN_TOMBSTONE_PREFIX)) {
          if (!runTombstoneMarkerMatches(maintenanceRoot, status.runId, runDir)) {
            increment(result.skipped, "run-tombstone-marker");
            continue;
          }
          if (currentTime - stat.mtimeMs < tombstoneGraceMs) {
            increment(result.skipped, "tombstone-grace");
            continue;
          }
          const freshWaitReferences2 = parseWaitRunIds(waitSubscriptionsDir);
          const finalReason = freshWaitReferences2.safe ? runSkipReason({ runDir, status, asyncDirRoot: options.asyncDirRoot, resultsDir: options.resultsDir, cutoff, protectedRunIds, waitRunIds: freshWaitReferences2.runIds }) : "wait-references-unknown";
          if (finalReason) {
            increment(result.skipped, `recheck-${finalReason}`);
            continue;
          }
          mutationStateChanged = true;
          fs4.rmSync(runDir, { recursive: true });
          removeRunTombstoneMarker(maintenanceRoot, status.runId);
          result.reapedTombstones += 1;
          deletedIds.push(`run-tombstone:${status.runId}`);
          continue;
        }
        const tombstone = path3.join(options.asyncDirRoot, `${RUN_TOMBSTONE_PREFIX}${randomId()}`);
        writeRunTombstoneMarker(maintenanceRoot, status.runId, tombstone, currentTime);
        mutationStateChanged = true;
        try {
          fs4.renameSync(runDir, tombstone);
        } catch (error) {
          removeRunTombstoneMarker(maintenanceRoot, status.runId);
          mutationStateChanged = false;
          throw error;
        }
        const recheckStatus = readStatus2(tombstone);
        const freshWaitReferences = parseWaitRunIds(waitSubscriptionsDir);
        const recheckReason = freshWaitReferences.safe ? runSkipReason({ runDir: tombstone, status: recheckStatus, asyncDirRoot: options.asyncDirRoot, resultsDir: options.resultsDir, cutoff, protectedRunIds, waitRunIds: freshWaitReferences.runIds }) : "wait-references-unknown";
        if (recheckReason) {
          if (!fs4.existsSync(runDir)) {
            fs4.renameSync(tombstone, runDir);
            mutationStateChanged = false;
          }
          removeRunTombstoneMarker(maintenanceRoot, status.runId);
          if (mutationStateChanged) cursorCommitUnsafe = true;
          increment(result.skipped, `recheck-${recheckReason}`);
          continue;
        }
        fs4.rmSync(tombstone, { recursive: true });
        removeRunTombstoneMarker(maintenanceRoot, status.runId);
        result.deletedRuns += 1;
        deletedIds.push(`run:${status.runId}`);
      } catch (error) {
        if (mutationStateChanged) cursorCommitUnsafe = true;
        if (!isNotFound(error)) result.errors.push(compactError(error));
      }
    }
    for (const discoveredCandidate of discovery.resultCandidates) {
      if (markCancelled()) return finish();
      result.scanned += 1;
      const candidate = { ...discoveredCandidate, path: path3.join(options.resultsDir, discoveredCandidate.relative) };
      let mutationStateChanged = false;
      try {
        const stat = lstatSync2(candidate.path);
        if (!stat.isFile() || stat.isSymbolicLink()) {
          increment(result.skipped, "unsafe-result-path");
          continue;
        }
        const data = readJson(candidate.path);
        const reason = resultSkipReason({ candidate, data, asyncDirRoot: options.asyncDirRoot, resultsDir: options.resultsDir, maintenanceRoot, cutoff, protectedRunIds, waitRunIds: waitReferences.runIds });
        if (reason) {
          increment(result.skipped, reason);
          continue;
        }
        if (candidate.kind === "tombstone") {
          if (currentTime - stat.mtimeMs < tombstoneGraceMs) {
            increment(result.skipped, "tombstone-grace");
            continue;
          }
          const freshWaitReferences2 = parseWaitRunIds(waitSubscriptionsDir);
          const finalReason = freshWaitReferences2.safe ? resultSkipReason({ candidate, data, asyncDirRoot: options.asyncDirRoot, resultsDir: options.resultsDir, maintenanceRoot, cutoff, protectedRunIds, waitRunIds: freshWaitReferences2.runIds }) : "wait-references-unknown";
          if (finalReason) {
            increment(result.skipped, `recheck-${finalReason}`);
            continue;
          }
          fs4.rmSync(candidate.path);
          mutationStateChanged = true;
          result.reapedTombstones += 1;
          deletedIds.push(`result-tombstone:${resultRunId(candidate, data)}`);
          continue;
        }
        const tombstone = path3.join(path3.dirname(candidate.path), `${RESULT_TOMBSTONE_PREFIX}${candidate.kind}-${randomId()}`);
        fs4.renameSync(candidate.path, tombstone);
        mutationStateChanged = true;
        const tombstoneCandidate = { ...candidate, path: tombstone, kind: "tombstone" };
        const recheckData = readJson(tombstone);
        const freshWaitReferences = parseWaitRunIds(waitSubscriptionsDir);
        const recheckReason = freshWaitReferences.safe ? resultSkipReason({ candidate: tombstoneCandidate, data: recheckData, asyncDirRoot: options.asyncDirRoot, resultsDir: options.resultsDir, maintenanceRoot, cutoff, protectedRunIds, waitRunIds: freshWaitReferences.runIds }) : "wait-references-unknown";
        if (recheckReason) {
          if (!fs4.existsSync(candidate.path)) {
            fs4.renameSync(tombstone, candidate.path);
            mutationStateChanged = false;
          }
          if (mutationStateChanged) cursorCommitUnsafe = true;
          increment(result.skipped, `recheck-${recheckReason}`);
          continue;
        }
        fs4.rmSync(tombstone);
        result.deletedResults += 1;
        deletedIds.push(`result:${resultRunId(candidate, data)}`);
      } catch (error) {
        if (mutationStateChanged) cursorCommitUnsafe = true;
        if (!isNotFound(error)) result.errors.push(compactError(error));
      }
    }
    if (cursorCommitUnsafe) {
      increment(result.skipped, "commit-failure");
      return finish();
    }
    if (markCancelled()) return finish();
    if (parseLockOwner(lockDir)?.token !== lockToken) {
      increment(result.skipped, "lock-owner-changed");
      return finish();
    }
    applyCursorOperations(cursor, discovery.cursorOps);
    writeAtomicJson(path3.join(maintenanceRoot, CURSOR_NAME), cursor);
    return finish();
  } finally {
    try {
      releaseRetentionLock(lockDir, lockToken);
    } catch {
    }
  }
}

// src/runs/background/result-watcher.ts
import * as fs5 from "node:fs";
import * as path4 from "node:path";

// src/shared/file-coalescer.ts
var defaultTimerApi = {
  setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimeout: (handle) => clearTimeout(handle)
};
function createFileCoalescer(handler, defaultDelayMs, timerApi = defaultTimerApi) {
  const pending = /* @__PURE__ */ new Map();
  return {
    schedule(file, delayMs = defaultDelayMs) {
      if (pending.has(file)) return false;
      const timer = timerApi.setTimeout(() => {
        pending.delete(file);
        handler(file);
      }, delayMs);
      pending.set(file, timer);
      return true;
    },
    flush(file) {
      const timer = pending.get(file);
      if (timer === void 0) return false;
      timerApi.clearTimeout(timer);
      pending.delete(file);
      handler(file);
      return true;
    },
    clear() {
      for (const timer of pending.values()) {
        timerApi.clearTimeout(timer);
      }
      pending.clear();
    }
  };
}

// src/runs/background/result-watcher.ts
var WATCHER_RESTART_DELAY_MS = 3e3;
var POLL_INTERVAL_MS = 3e3;
var HEALTHY_SCAN_INTERVAL_MS = 6e4;
var RETRY_DELAY_MS = 100;
var CLEANUP_LEASE_WAIT_MS = 0;
var SLOW_RESULT_SCAN_MS = 500;
function jsonPropertyValue(raw, property, valuePattern) {
  let encoded;
  for (const match of raw.matchAll(new RegExp(`"${property}"\\s*:\\s*(${valuePattern})`, "g"))) encoded = match[1];
  if (!encoded) return void 0;
  try {
    return JSON.parse(encoded);
  } catch {
    return void 0;
  }
}
function jsonStringProperty(raw, property) {
  const value = jsonPropertyValue(raw, property, `"(?:\\\\.|[^"\\\\])*"`);
  return typeof value === "string" && value ? value : void 0;
}
function resultFileIdentity(raw, file) {
  return {
    sessionId: jsonStringProperty(raw, "sessionId"),
    completionOwnerId: jsonStringProperty(raw, "completionOwnerId"),
    // Recorded as a flat object, so a brace-free match is the whole value.
    completionOwnerProcess: jsonPropertyValue(raw, "completionOwnerProcess", `\\{[^{}]*\\}`),
    parentWorkflowRunId: jsonStringProperty(raw, "parentWorkflowRunId"),
    runId: file.replace(/\.json$/i, "")
  };
}
function sanitizeNestedResultChildren(value, resultPath, label) {
  if (value === void 0) return void 0;
  if (!Array.isArray(value)) {
    console.error(`Ignoring invalid nested children in subagent result file '${resultPath}' at ${label}: expected an array.`);
    return void 0;
  }
  const children = value.map((child) => sanitizeSummary(child)).filter((child) => Boolean(child));
  if (children.length !== value.length) {
    console.error(`Ignoring ${value.length - children.length} invalid nested child record(s) in subagent result file '${resultPath}' at ${label}.`);
  }
  return children.length ? children : void 0;
}
function errorCode(error) {
  return typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
}
function isNotFound2(error) {
  return errorCode(error) === "ENOENT";
}
function isAbsentResultCandidate(error) {
  return isNotFound2(error) || errorCode(error) === "ENAMETOOLONG";
}
function isAccessDenied(error) {
  const code = errorCode(error);
  return code === "EPERM" || code === "EACCES";
}
function shouldPoll(error) {
  const code = errorCode(error);
  return code === "EMFILE" || code === "ENOSPC";
}
function hasDeliveredNotification(data) {
  return typeof data.notificationDeliveredAt === "number" && Number.isFinite(data.notificationDeliveredAt);
}
function markDeliveredNotification(resultPath, data, read, now) {
  const marked = { ...data, runId: read.runId, notificationDeliveredAt: now };
  return withResultRunLease(path4.dirname(resultPath), read.runId, () => {
    if (resultSnapshotReplaced(resultPath, read)) return void 0;
    const { state } = writeAsyncResultFile(resultPath, marked);
    const snapshot = JSON.stringify(marked, null, 2);
    const stalePublic = state === "pending" ? readResultPayload(resultPath) : void 0;
    return { data: marked, read: { ...read, snapshot, stalePublic } };
  });
}
function createResultWatcher(pi, state, resultsDir, completionTtlMs, deps = {}) {
  const fsApi = deps.fs ?? fs5;
  const timers = deps.timers ?? { setTimeout, clearTimeout, setInterval, clearInterval };
  const notifier = deps.notifier ?? { deliver: async () => true };
  const parseResult = deps.parseResult ?? ((raw) => JSON.parse(raw));
  const deliverIntercomResults = deps.deliverIntercomResults !== false;
  const pendingTriggerTurn = /* @__PURE__ */ new Map();
  const processing = /* @__PURE__ */ new Set();
  const handling = /* @__PURE__ */ new Set();
  let deliveringPending = 0;
  const identityCache = /* @__PURE__ */ new Map();
  const reportedMissionSyncFailures = /* @__PURE__ */ new Map();
  let deliveryActive = true;
  let deliveryEpoch = 0;
  let resultScanTimer = null;
  let activeSessionId = null;
  const ownsResult = deps.ownership?.owns ?? ((sessionId, completionOwnerId) => sessionId === state.currentSessionId && typeof completionOwnerId === "string" && completionOwnerId === state.completionOwnerId);
  const claimedSessionIds = () => deps.ownership?.claimedSessionIds() ?? [];
  const deliveryOwnerId = deps.ownership?.deliveryOwnerId ?? ((_sessionId, completionOwnerId) => completionOwnerId);
  const ownsCompletion = (sessionId, completionOwnerId, epoch) => {
    if (!deliveryActive || epoch !== deliveryEpoch) return false;
    if (!activeSessionId && state.currentSessionId) activeSessionId = state.currentSessionId;
    return activeSessionId === state.currentSessionId && ownsResult(sessionId, completionOwnerId);
  };
  const scheduleResult = (file, triggerTurn, delayMs = 0) => {
    const pendingMode = pendingTriggerTurn.get(file);
    pendingTriggerTurn.set(file, pendingMode === false || !triggerTurn ? false : true);
    state.resultFileCoalescer.schedule(file, delayMs);
  };
  const publicResultPath = (file) => path4.join(resultsDir, file);
  const publicResultFileExists = (file) => {
    try {
      return fsApi.statSync(publicResultPath(file)).isFile();
    } catch (error) {
      if (!isAbsentResultCandidate(error)) console.error(`Failed to inspect subagent result file '${publicResultPath(file)}':`, error);
      return false;
    }
  };
  const resultPayloadPath = (file, observed) => {
    if (file !== path4.basename(file) || !file.endsWith(".json")) return void 0;
    const runId = file.replace(/\.json$/i, "");
    for (const sessionId of [state.currentSessionId, ...claimedSessionIds()]) {
      if (!sessionId) continue;
      const sessionResult = resultPayloadPathForSessionRun(resultsDir, sessionId, runId);
      if (sessionResult) return sessionResult;
    }
    const observerResult = resultPayloadPathForMissionObserverRun(resultsDir, runId);
    if (observerResult) return observerResult;
    if (observed?.has(runId)) {
      const indexedResult = resultPayloadPathForIndexedRun(resultsDir, runId);
      if (indexedResult) return indexedResult;
    }
    return publicResultFileExists(file) ? publicResultPath(file) : void 0;
  };
  const resultSignature = (file, observed) => {
    const resultPath = resultPayloadPath(file, observed);
    if (!resultPath) {
      identityCache.delete(file);
      return void 0;
    }
    try {
      const stat = fsApi.statSync(resultPath);
      if (!stat.isFile()) return void 0;
      return `${resultPath}:${stat.size}:${stat.mtimeMs}`;
    } catch (error) {
      identityCache.delete(file);
      if (isAccessDenied(error)) throw error;
      if (!isAbsentResultCandidate(error)) console.error(`Failed to inspect subagent result file '${resultPath}':`, error);
      return void 0;
    }
  };
  const inspectResult = (file, knownSignature, observed) => {
    const resultPath = resultPayloadPath(file, observed);
    if (!resultPath) return void 0;
    try {
      const signature = knownSignature ?? resultSignature(file, observed);
      if (!signature) return void 0;
      const cached = identityCache.get(file);
      if (cached?.signature === signature) return { identity: cached.identity, signature };
      const identity = resultFileIdentity(fsApi.readFileSync(resultPath, "utf-8"), file);
      identityCache.set(file, { signature, identity });
      return { identity, signature };
    } catch (error) {
      identityCache.delete(file);
      if (isAccessDenied(error)) throw error;
      if (!isAbsentResultCandidate(error)) console.error(`Failed to inspect subagent result file '${resultPath}':`, error);
      return void 0;
    }
  };
  const observedRunIds = () => {
    try {
      return new Set(deps.observedCompletionRunIds?.() ?? []);
    } catch (error) {
      console.error("Failed to inspect observed subagent completion ids:", error);
      return /* @__PURE__ */ new Set();
    }
  };
  const shouldProcessResult = (file, observed, knownSignature) => {
    const inspected = inspectResult(file, knownSignature, observed);
    if (!inspected) return false;
    const { identity } = inspected;
    if (!identity.sessionId) return true;
    if (ownsResult(identity.sessionId, deliveryOwnerId(identity.sessionId, identity.completionOwnerId, identity.completionOwnerProcess, identity.parentWorkflowRunId))) return true;
    if (identity.runId && fsApi.existsSync(missionObserverIndexPath(resultsDir, identity.runId))) return true;
    if (identity.runId && (observed ?? observedRunIds()).has(identity.runId)) return true;
    return Boolean(deps.observeCompletion && !deps.observedCompletionRunIds);
  };
  const removeDeliveredResult = (file, triggerTurn, read) => {
    identityCache.delete(file);
    try {
      if (retireResultSnapshot(publicResultPath(file), read, void 0, CLEANUP_LEASE_WAIT_MS) === "replaced") scheduleResult(file, triggerTurn);
    } catch (error) {
      if (isAbsentResultCandidate(error)) return;
      if (!(error instanceof FileLeaseBusyError)) console.error(`Failed to remove delivered subagent result '${publicResultPath(file)}'; will retry:`, error);
      scheduleResult(file, triggerTurn, RETRY_DELAY_MS);
    }
  };
  const handleResult = async (file, triggerTurn) => {
    if (processing.has(file)) return;
    let observed;
    try {
      if (!shouldProcessResult(file)) {
        const runId = file === path4.basename(file) && file.endsWith(".json") ? file.replace(/\.json$/i, "") : void 0;
        observed = observedRunIds();
        if (!runId || !observed.has(runId) || !shouldProcessResult(file, observed)) return;
      }
    } catch (error) {
      if (!isAccessDenied(error)) throw error;
      console.error(`Failed to inspect subagent result file '${publicResultPath(file)}'; will retry:`, error);
      scheduleResult(file, triggerTurn, RETRY_DELAY_MS);
      return;
    }
    processing.add(file);
    let rereadReplacedPayload = false;
    let resultPath = publicResultPath(file);
    let publicAtRead;
    const readPayload = (payloadPath) => {
      publicAtRead = readResultPayload(publicResultPath(file));
      return fsApi.readFileSync(payloadPath, "utf-8");
    };
    try {
      const payloadPath = resultPayloadPath(file, observed);
      if (!payloadPath) return;
      resultPath = payloadPath;
      let raw = readPayload(resultPath);
      let identity = resultFileIdentity(raw, file);
      if (identity.sessionId && identity.runId) {
        const pendingState = promotePendingResultFile(resultsDir, identity.sessionId, identity.runId, file);
        if (pendingState === "promoted") {
          identityCache.delete(file);
          resultPath = publicResultPath(file);
          raw = readPayload(resultPath);
          identity = resultFileIdentity(raw, file);
        } else if (pendingState === "pending") {
          const pendingPath = resultPayloadPathForSessionRun(resultsDir, identity.sessionId, identity.runId);
          if (!pendingPath) {
            scheduleResult(file, triggerTurn, RETRY_DELAY_MS);
            return;
          }
          resultPath = pendingPath;
          raw = readPayload(resultPath);
          identity = resultFileIdentity(raw, file);
        }
      }
      let data = parseResult(raw);
      if (typeof data.sessionId !== "string" || !data.sessionId) return;
      const sessionId = data.sessionId;
      const completionOwnerId = deliveryOwnerId(sessionId, data.completionOwnerId, data.completionOwnerProcess, data.parentWorkflowRunId);
      const runId = typeof data.runId === "string" && data.runId ? data.runId : typeof data.id === "string" && data.id ? data.id : file.replace(/\.json$/i, "");
      const toolCallId = typeof data.toolCallId === "string" ? data.toolCallId : void 0;
      let read = { runId, sessionId, toolCallId, snapshot: raw, ...publicAtRead !== void 0 && publicAtRead !== raw ? { stalePublic: publicAtRead } : {} };
      const markReplacedPayload = () => {
        try {
          if (!resultSnapshotReplaced(publicResultPath(file), read)) return false;
        } catch (error) {
          if (isAccessDenied(error)) throw error;
          console.error(`Failed to re-read subagent result file '${publicResultPath(file)}':`, error);
        }
        identityCache.delete(file);
        rereadReplacedPayload = true;
        return true;
      };
      let observerSucceeded = true;
      try {
        syncMissionFromAsyncCompletion({ ...data, runId });
        reportedMissionSyncFailures.delete(file);
      } catch (error) {
        observerSucceeded = false;
        const message2 = error instanceof Error ? error.message : String(error);
        if (reportedMissionSyncFailures.get(file) !== message2) {
          reportedMissionSyncFailures.set(file, message2);
          console.error(`Mission completion sync failed for '${resultPath}':`, error);
        }
      }
      try {
        deps.observeCompletion?.({ ...data, runId });
      } catch (error) {
        observerSucceeded = false;
        console.error(`Completion observer failed for '${resultPath}':`, error);
      }
      if (observerSucceeded) {
        try {
          if (acknowledgeMissionObserverSnapshot(publicResultPath(file), read, CLEANUP_LEASE_WAIT_MS) === "replaced") rereadReplacedPayload = true;
        } catch (error) {
          observerSucceeded = false;
          if (!(error instanceof FileLeaseBusyError)) console.error(`Failed to acknowledge the mission observer for '${resultPath}'; will retry:`, error);
        }
      }
      const epoch = deliveryEpoch;
      if (!ownsCompletion(sessionId, completionOwnerId, epoch)) return;
      const completionPersisted = recordWaitCompletion(state, runId, data, Date.now(), completionTtlMs, {
        resultsDir,
        sessionId
      });
      const hasExplicitNestedChildren = data.nestedChildren !== void 0;
      let nestedChildren = compactNestedResultChildren(sanitizeNestedResultChildren(data.nestedChildren, resultPath, "nestedChildren"));
      if (!nestedChildren?.length && !hasExplicitNestedChildren) {
        try {
          nestedChildren = compactNestedResultChildren(projectNestedRegistryForRoot(runId)?.children);
        } catch (error) {
          console.error(`Failed to enrich subagent result file '${resultPath}' with nested registry children; will retry later:`, error);
          scheduleResult(file, triggerTurn, RETRY_DELAY_MS);
          return;
        }
      }
      const completionKey = buildCompletionKey(data, `result:${file}`);
      const alreadyDelivered = hasDeliveredNotification(data);
      const lastSeenAt = state.completionSeen.get(completionKey);
      if (lastSeenAt !== void 0 && Date.now() - lastSeenAt > completionTtlMs) {
        state.completionSeen.delete(completionKey);
      } else if (lastSeenAt !== void 0) {
        if (!observerSucceeded) {
          scheduleResult(file, triggerTurn, RETRY_DELAY_MS);
          return;
        }
        if (!ownsCompletion(sessionId, completionOwnerId, epoch)) return;
        if (markReplacedPayload()) return;
        deps.onResultDelivered?.(runId);
        if (!completionPersisted) {
          scheduleResult(file, triggerTurn, RETRY_DELAY_MS);
          return;
        }
        removeDeliveredResult(file, triggerTurn, read);
        return;
      }
      const hasResultChildren = Array.isArray(data.results) && data.results.length > 0;
      const resultChildren = hasResultChildren ? data.results : [{ agent: data.agent ?? void 0, output: data.summary, outputState: "unknown", success: data.success }];
      const normalizedChildren = attachNestedChildrenToResultChildren(runId, resultChildren.map((result = {}, index) => {
        const baseOutput = hasResultChildren ? result.output : result.output ?? data.summary;
        const hasRealOutput = typeof baseOutput === "string" && baseOutput.trim().length > 0;
        const structuredPreview = result.structuredOutput === void 0 ? void 0 : JSON.stringify(result.structuredOutput, null, 2).slice(0, 4e3);
        const output = hasRealOutput ? baseOutput : structuredPreview ? `Structured output:
${structuredPreview}` : "(no output)";
        const summary = result.success === false && result.error ? `${result.error}${hasRealOutput ? `

Output:
${baseOutput}` : ""}` : output;
        const sessionPath = result.sessionFile ?? (resultChildren.length === 1 ? data.sessionFile : void 0);
        const childNestedChildren = sanitizeNestedResultChildren(result.children, resultPath, `results[${index}].children`);
        const childState = result.state === "running" || result.state === "queued" || result.state === "paused" || result.state === "stopped" ? result.state : result.stopped === true ? "stopped" : data.state === "paused" || !hasResultChildren && (data.state === "stopped" || typeof result.success !== "boolean") ? data.state : void 0;
        return {
          agent: result.agent ?? data.agent ?? `step-${index + 1}`,
          ...result.sessionName ? { sessionName: result.sessionName } : {},
          status: resolveSubagentResultStatus({
            success: result.success,
            state: childState,
            interrupted: result.interrupted,
            timedOut: result.timedOut,
            stopped: result.stopped,
            turnBudgetExceeded: result.turnBudgetExceeded,
            processSignal: result.processSignal
          }),
          outputState: result.outputState === "present" || result.outputState === "absent" || result.outputState === "unknown" ? result.outputState : "unknown",
          ...result.outputPartial === true ? { outputPartial: true } : {},
          summary,
          index,
          artifactPath: result.artifactPaths?.outputPath,
          ...typeof sessionPath === "string" && fsApi.existsSync(sessionPath) ? { sessionPath } : {},
          ...result.intercomTarget ? { intercomTarget: result.intercomTarget } : {},
          ...childNestedChildren ? { children: childNestedChildren } : {}
        };
      }), nestedChildren);
      if (alreadyDelivered) {
        markSeenWithTtl(state.completionSeen, completionKey, Date.now(), completionTtlMs);
        if (!observerSucceeded) {
          scheduleResult(file, triggerTurn, RETRY_DELAY_MS);
          return;
        }
        if (!ownsCompletion(sessionId, completionOwnerId, epoch)) return;
        if (markReplacedPayload()) return;
        deps.onResultDelivered?.(runId);
        if (!completionPersisted) {
          scheduleResult(file, triggerTurn, RETRY_DELAY_MS);
          return;
        }
        removeDeliveredResult(file, triggerTurn, read);
        return;
      }
      const intercomTarget = data.intercomTarget?.trim();
      let intercomDelivered = false;
      if (deliverIntercomResults && intercomTarget && triggerTurn) {
        const mode = data.mode === "single" || data.mode === "parallel" || data.mode === "chain" || data.mode === "workflow" ? data.mode : resultChildren.length > 1 ? "chain" : "single";
        intercomDelivered = await deliverSubagentResultIntercomEvent(pi.events, buildSubagentResultIntercomPayload({
          to: intercomTarget,
          runId,
          mode,
          source: "async",
          children: normalizedChildren,
          asyncId: data.id ?? void 0,
          asyncDir: data.asyncDir,
          ...data.parallelHandoff ? { parallelHandoff: data.parallelHandoff } : {}
        }));
        if (!ownsCompletion(sessionId, completionOwnerId, epoch)) return;
        if (!intercomDelivered) console.error(`Subagent async grouped result intercom delivery was not acknowledged for '${resultPath}'.`);
      }
      const delivery = notifier.deliver({
        ...data,
        id: data.id ?? runId,
        runId,
        completionOwnerId,
        triggerTurn,
        intercomDelivered,
        ...nestedChildren?.length ? { nestedChildren } : {},
        ...Array.isArray(data.results) ? {
          results: hasResultChildren ? normalizedChildren.map((child, index) => ({
            ...data.results[index],
            agent: child.agent,
            status: child.status,
            summary: child.summary,
            index: child.index,
            artifactPath: child.artifactPath,
            sessionPath: child.sessionPath,
            children: child.children
          })) : []
        } : {}
      });
      if (deliveringPending > 0) notifier.flush?.();
      const accepted = await delivery;
      if (!ownsCompletion(sessionId, completionOwnerId, epoch)) return;
      if (!accepted) {
        scheduleResult(file, triggerTurn, RETRY_DELAY_MS);
        return;
      }
      if (markReplacedPayload()) return;
      deps.onResultDelivered?.(runId);
      try {
        const marked = markDeliveredNotification(publicResultPath(file), data, read, Date.now());
        identityCache.delete(file);
        if (!marked) {
          rereadReplacedPayload = true;
          return;
        }
        ({ data, read } = marked);
      } catch (error) {
        console.error(`Failed to mark subagent result notification delivered for '${resultPath}'; will retry:`, error);
        scheduleResult(file, triggerTurn, RETRY_DELAY_MS);
        return;
      }
      markSeenWithTtl(state.completionSeen, completionKey, Date.now(), completionTtlMs);
      try {
        pi.events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, {
          ...data,
          runId,
          triggerTurn,
          intercomDelivered,
          ...nestedChildren?.length ? { nestedChildren } : {},
          ...Array.isArray(data.results) ? {
            results: hasResultChildren ? normalizedChildren.map((child, index) => ({
              ...data.results[index],
              agent: child.agent,
              status: child.status,
              summary: child.summary,
              index: child.index,
              artifactPath: child.artifactPath,
              sessionPath: child.sessionPath,
              children: child.children
            })) : []
          } : {}
        });
      } catch (error) {
        console.error(`Completion observer failed for '${resultPath}':`, error);
      }
      if (!observerSucceeded) {
        scheduleResult(file, triggerTurn, RETRY_DELAY_MS);
        return;
      }
      if (!ownsCompletion(sessionId, completionOwnerId, epoch)) return;
      if (!completionPersisted) {
        scheduleResult(file, triggerTurn, RETRY_DELAY_MS);
        return;
      }
      removeDeliveredResult(file, triggerTurn, read);
    } catch (error) {
      if (isAccessDenied(error)) {
        console.error(`Failed to process subagent result file '${resultPath}'; will retry:`, error);
        scheduleResult(file, triggerTurn, RETRY_DELAY_MS);
      } else if (!isNotFound2(error)) console.error(`Failed to process subagent result file '${resultPath}':`, error);
    } finally {
      processing.delete(file);
      if (rereadReplacedPayload) scheduleResult(file, triggerTurn);
    }
  };
  const resultFileCoalescer = createFileCoalescer((file) => {
    const triggerTurn = pendingTriggerTurn.get(file) !== false;
    pendingTriggerTurn.delete(file);
    const run = handleResult(file, triggerTurn);
    handling.add(run);
    void run.finally(() => handling.delete(run));
  }, deps.coalesceDelayMs ?? 50);
  state.resultFileCoalescer = resultFileCoalescer;
  const logScanStats = (stats) => {
    const elapsed = Date.now() - stats.startedAt;
    if (elapsed < SLOW_RESULT_SCAN_MS) return;
    const resultScanLogging = deps.resultScanLogging ?? "activity";
    if (resultScanLogging === "off") return;
    if (resultScanLogging === "activity" && stats.files === 0 && stats.scheduled === 0) return;
    console.error(`Subagent result scan inspected ${stats.files} indexed result file(s), scheduled ${stats.scheduled} in ${elapsed}ms (${resultsDir}).`);
  };
  const indexedResultCandidates = (observed) => {
    const files = /* @__PURE__ */ new Set();
    for (const sessionId of [state.currentSessionId, ...claimedSessionIds()]) {
      if (!sessionId) continue;
      for (const file of resultCandidateFilesForSession(resultsDir, sessionId)) files.add(file);
    }
    for (const runId of state.asyncJobs.keys()) files.add(`${runId}.json`);
    for (const file of missionObserverResultCandidateFiles(resultsDir)) files.add(file);
    for (const runId of observed) files.add(`${runId}.json`);
    return [...files];
  };
  const eligibleResultFiles = () => {
    const files = [];
    try {
      const stats = { files: 0, scheduled: 0, startedAt: Date.now() };
      const observed = observedRunIds();
      for (const file of indexedResultCandidates(observed)) {
        stats.files += 1;
        const signature = resultSignature(file, observed);
        if (!signature) continue;
        if (!shouldProcessResult(file, observed, signature)) continue;
        stats.scheduled += 1;
        files.push(file);
      }
      logScanStats(stats);
    } catch (error) {
      if (!isNotFound2(error)) console.error(`Failed to scan subagent result index in '${resultsDir}':`, error);
    }
    return files;
  };
  const primeExistingResults = (options = {}) => {
    const triggerTurn = options.triggerTurn !== false;
    for (const file of eligibleResultFiles()) scheduleResult(file, triggerTurn);
  };
  const deliverPendingResults = async () => {
    if (!deliveryActive) return;
    deliveringPending += 1;
    try {
      notifier.flush?.();
      for (const file of eligibleResultFiles()) {
        scheduleResult(file, true);
        resultFileCoalescer.flush(file);
      }
      await Promise.allSettled([...handling]);
    } finally {
      deliveringPending -= 1;
    }
  };
  const clearResultScan = () => {
    if (resultScanTimer) timers.clearInterval(resultScanTimer);
    resultScanTimer = null;
  };
  const useNativeWatcher = () => shouldUseNativeFsWatch("result-delivery", deps.platform);
  const hasDeliveryDemand = () => {
    try {
      return deps.hasDeliveryDemand?.() === true;
    } catch (error) {
      console.error("Failed to inspect subagent result delivery demand:", error);
      return false;
    }
  };
  const clearResultPoller = () => {
    if (!state.watcherRestartTimer) return;
    timers.clearTimeout(state.watcherRestartTimer);
    timers.clearInterval(state.watcherRestartTimer);
    state.watcherRestartTimer = null;
  };
  const startDemandPolling = () => {
    if (!deliveryActive || useNativeWatcher() || state.watcherRestartTimer) return;
    if (!hasDeliveryDemand()) return;
    state.watcherRestartTimer = timers.setInterval(() => {
      primeExistingResults();
      if (!hasDeliveryDemand()) clearResultPoller();
    }, POLL_INTERVAL_MS);
    state.watcherRestartTimer.unref?.();
  };
  const startPolling = (reason) => {
    state.watcher?.close();
    state.watcher = null;
    clearResultScan();
    if (state.watcherRestartTimer) return;
    console.error(`Subagent result watcher for '${resultsDir}' fell back to polling because native fs.watch is unavailable (${errorCode(reason) ?? "unknown error"}).`);
    primeExistingResults();
    state.watcherRestartTimer = timers.setInterval(primeExistingResults, POLL_INTERVAL_MS);
    state.watcherRestartTimer.unref?.();
  };
  const scheduleRestart = () => {
    clearResultScan();
    if (state.watcherRestartTimer) return;
    state.watcherRestartTimer = timers.setTimeout(() => {
      state.watcherRestartTimer = null;
      try {
        fsApi.mkdirSync(resultsDir, { recursive: true });
        startResultWatcher();
      } catch (error) {
        if (shouldPoll(error)) return startPolling(error);
        console.error(`Failed to restart subagent result watcher for '${resultsDir}':`, error);
        scheduleRestart();
      }
    }, WATCHER_RESTART_DELAY_MS);
    state.watcherRestartTimer.unref?.();
  };
  const startResultWatcher = () => {
    if (state.watcher) return;
    activeSessionId = state.currentSessionId;
    deliveryActive = true;
    deliveryEpoch += 1;
    if (state.watcherRestartTimer) {
      timers.clearTimeout(state.watcherRestartTimer);
      timers.clearInterval(state.watcherRestartTimer);
      state.watcherRestartTimer = null;
    }
    if (!useNativeWatcher()) {
      startDemandPolling();
      return;
    }
    try {
      const watchDir = resolveWatchPath(resultsDir, fsApi.realpathSync.native);
      state.watcher = fsApi.watch(watchDir, (_event, file) => {
        if (!file) {
          primeExistingResults();
          return;
        }
        const fileName = file.toString();
        if (fileName.endsWith(".json")) {
          identityCache.delete(fileName);
          try {
            writeResultIndexForData(path4.join(resultsDir, fileName), JSON.parse(fsApi.readFileSync(path4.join(resultsDir, fileName), "utf-8")));
          } catch {
          }
          scheduleResult(fileName, true);
        }
      });
      state.watcher.on("error", (error) => {
        if (shouldPoll(error)) return startPolling(error);
        console.error(`Subagent result watcher failed for '${resultsDir}':`, error);
        state.watcher?.close();
        state.watcher = null;
        scheduleRestart();
      });
      state.watcher.unref?.();
      resultScanTimer = timers.setInterval(primeExistingResults, HEALTHY_SCAN_INTERVAL_MS);
      resultScanTimer.unref?.();
    } catch (error) {
      if (shouldPoll(error)) return startPolling(error);
      console.error(`Failed to start subagent result watcher for '${resultsDir}':`, error);
      state.watcher = null;
      scheduleRestart();
    }
  };
  const transitionResultDelivery = () => {
    deliveryActive = true;
    activeSessionId = state.currentSessionId;
    deliveryEpoch += 1;
    identityCache.clear();
  };
  const stopResultWatcher = () => {
    deliveryActive = false;
    activeSessionId = null;
    deliveryEpoch += 1;
    state.watcher?.close();
    state.watcher = null;
    clearResultPoller();
    clearResultScan();
    state.resultFileCoalescer.clear();
    pendingTriggerTurn.clear();
    processing.clear();
    identityCache.clear();
  };
  return { startResultWatcher, transitionResultDelivery, primeExistingResults, deliverPendingResults, stopResultWatcher, refreshResultDelivery: () => {
    primeExistingResults();
    startDemandPolling();
  } };
}

// src/runs/background/result-delivery-ownership.ts
var deadCompletionOwnerIds = /* @__PURE__ */ new Set();
function createResultDeliveryOwnership(state) {
  const currentOwner = () => typeof state.completionOwnerId === "string" && state.completionOwnerId ? state.completionOwnerId : void 0;
  return {
    owns(sessionId, completionOwnerId) {
      const owner = currentOwner();
      if (!owner || completionOwnerId !== owner && completionOwnerId !== OWNING_SESSION_COMPLETION_OWNER) return false;
      return ownsRun(state.currentSessionId, sessionId);
    },
    deliveryOwnerId(sessionId, completionOwnerId, ownerProcess, parentWorkflowRunId) {
      const owner = currentOwner();
      if (!owner || typeof completionOwnerId !== "string" || completionOwnerId === owner || completionOwnerId === OWNING_SESSION_COMPLETION_OWNER || parentWorkflowRunId || !ownsRun(state.currentSessionId, sessionId)) return completionOwnerId;
      if (!deadCompletionOwnerIds.has(completionOwnerId)) {
        if (!isRecordedPid(ownerProcess) || checkRecordedPidLiveness(ownerProcess) !== "dead") return completionOwnerId;
        deadCompletionOwnerIds.add(completionOwnerId);
      }
      return OWNING_SESSION_COMPLETION_OWNER;
    },
    claimedSessionIds() {
      if (!currentOwner() || !state.currentSessionId) return [];
      return inheritedSessionIds(state.currentSessionId);
    }
  };
}

// src/slash/slash-commands.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import * as fs11 from "node:fs";
import * as path10 from "node:path";
import { keyText } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

// src/profiles/profiles.ts
import * as fs6 from "node:fs";
import * as os2 from "node:os";
import * as path5 from "node:path";
var DEFAULT_PROVIDER_MODELS_MAX_AGE_DAYS = 7;
function readJsonObjectFile(filePath) {
  const raw = fs6.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`File '${filePath}' must contain a JSON object.`);
  }
  return parsed;
}
function writeJsonFile(filePath, value) {
  fs6.mkdirSync(path5.dirname(filePath), { recursive: true });
  fs6.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}
`, "utf-8");
}
var SAFE_PATH_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
function normalizePathToken(value, label) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (!SAFE_PATH_TOKEN.test(trimmed) || trimmed === "." || trimmed === ".." || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error(`${label} must be a safe file name using only letters, numbers, dots, underscores, and hyphens.`);
  }
  return trimmed;
}
function normalizeProfileName(name) {
  const trimmed = name.trim();
  const stem = trimmed.endsWith(".json") ? trimmed.slice(0, -5) : trimmed;
  return normalizePathToken(stem, "Profile name");
}
function normalizeProviderName(provider) {
  return normalizePathToken(provider, "Provider");
}
function validateSubagentProfile(filePath, parsed) {
  const subagents = parsed.subagents;
  if (!subagents || typeof subagents !== "object" || Array.isArray(subagents)) {
    throw new Error(`Profile '${filePath}' must contain a 'subagents' object.`);
  }
  const agentOverrides = subagents.agentOverrides;
  if (!agentOverrides || typeof agentOverrides !== "object" || Array.isArray(agentOverrides)) {
    throw new Error(`Profile '${filePath}' must contain 'subagents.agentOverrides' as an object.`);
  }
  for (const [name, value] of Object.entries(agentOverrides)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Profile '${filePath}' has invalid override '${name}'; expected an object.`);
    }
    const override = value;
    const model = override.model;
    if (model !== void 0 && typeof model !== "string") {
      throw new Error(`Profile '${filePath}' has invalid model for '${name}'; expected a string.`);
    }
    const thinking = override.thinking;
    if (thinking !== void 0 && thinking !== false && typeof thinking !== "string") {
      throw new Error(`Profile '${filePath}' has invalid thinking for '${name}'; expected a string or false.`);
    }
    if (override.machine !== void 0 && override.machine !== false) {
      override.machine = validateOptionalMachine(override.machine, `Profile '${filePath}' has invalid machine for '${name}'`);
    }
    if (override.fallbackModels !== void 0) throw new Error(`Profile '${filePath}' uses removed field fallbackModels for '${name}'; configure one model instead.`);
  }
  const disableBuiltins = subagents.disableBuiltins;
  if (disableBuiltins !== void 0 && typeof disableBuiltins !== "boolean") {
    throw new Error(`Profile '${filePath}' has invalid subagents.disableBuiltins; expected a boolean.`);
  }
  return parsed;
}
function getUserSettingsPath() {
  return path5.join(getAgentDir(), "settings.json");
}
function readSettingsFile(filePath) {
  if (!fs6.existsSync(filePath)) return {};
  return readJsonObjectFile(filePath);
}
function extractVersionScore(id) {
  const match = id.match(/(\d+(?:\.\d+)?)/g);
  if (!match || match.length === 0) return 0;
  return Math.max(...match.map((value) => Number.parseFloat(value)).filter((value) => Number.isFinite(value)));
}
function modelNameTokens(modelName) {
  return modelName.toLowerCase().replace(/([a-z])([0-9])/g, "$1 $2").replace(/([0-9])([a-z])/g, "$1 $2").split(/[^a-z0-9.]+/).filter(Boolean);
}
function inferProfileBand(modelName) {
  const tokens = new Set(modelNameTokens(modelName));
  if (["spark", "flash", "nano", "tiny", "instant"].some((token) => tokens.has(token))) return 0;
  if (["mini", "haiku", "small"].some((token) => tokens.has(token))) return 1;
  if (["opus", "max", "ultra", "pro"].some((token) => tokens.has(token))) return 4;
  if (["sonnet", "turbo", "plus"].some((token) => tokens.has(token))) return 3;
  return 2;
}
function combinedCost(cost) {
  if (!cost) return void 0;
  const values = [cost.input, cost.output, cost.cacheRead, cost.cacheWrite].filter((value) => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return void 0;
  return values.reduce((sum, value) => sum + value, 0);
}
function collectStats(values) {
  const filtered = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (filtered.length === 0) return void 0;
  return { min: Math.min(...filtered), max: Math.max(...filtered) };
}
function normalize(value, stats) {
  if (value === void 0 || !stats) return void 0;
  if (stats.max <= stats.min) return 0.5;
  return (value - stats.min) / (stats.max - stats.min);
}
function buildClassificationContext(models) {
  return {
    cost: collectStats(models.map((model) => combinedCost(model.cost))),
    contextWindow: collectStats(models.map((model) => model.contextWindow)),
    maxTokens: collectStats(models.map((model) => model.maxTokens))
  };
}
function rankToCostTier(rank) {
  if (rank <= 0.33) return "cheap";
  if (rank <= 0.66) return "medium";
  return "expensive";
}
function scoreToQualityTier(score) {
  if (score <= 0.33) return "weak";
  if (score <= 0.66) return "medium";
  return "strong";
}
function qualityTierToRoleTier(quality, cost) {
  if (quality === "strong") return "strong";
  if (quality === "medium") return cost === "cheap" ? "cheap" : "medium";
  return "cheap";
}
function agentsForRoleTier(roleTier) {
  if (roleTier === "cheap") return ["scout", "delegate"];
  if (roleTier === "medium") return ["researcher", "reviewer"];
  return ["worker", "reviewer", "oracle"];
}
function classifyModel(input, context) {
  const modelName = input.name?.trim() || input.id;
  const tokens = new Set(modelNameTokens(modelName));
  const band = inferProfileBand(modelName);
  const versionScore = extractVersionScore(input.id);
  const costNorm = normalize(combinedCost(input.cost), context.cost);
  const contextNorm = normalize(input.contextWindow, context.contextWindow);
  const maxTokensNorm = normalize(input.maxTokens, context.maxTokens);
  const hasOfficialMetadata = costNorm !== void 0 || contextNorm !== void 0 || maxTokensNorm !== void 0;
  const classificationSources = hasOfficialMetadata ? ["official-metadata", "heuristic-name"] : ["heuristic-name"];
  const heuristicBase = band / 4;
  const qualitySignals = [
    heuristicBase,
    ...contextNorm !== void 0 ? [contextNorm] : [],
    ...maxTokensNorm !== void 0 ? [maxTokensNorm] : [],
    ...input.reasoning === true ? [1] : [],
    ...input.reasoning === false ? [0] : []
  ];
  const latencyHintsFast = tokens.has("highspeed") || tokens.has("flash") || tokens.has("instant") || tokens.has("turbo");
  const latencyHintsSlow = tokens.has("pro") || tokens.has("ultra") || tokens.has("opus") || tokens.has("max");
  let qualityScore = qualitySignals.reduce((sum, value) => sum + value, 0) / qualitySignals.length;
  if (latencyHintsFast) {
    qualityScore -= 0.2;
  }
  qualityScore = Math.max(0, Math.min(1, qualityScore));
  const costTier = costNorm !== void 0 ? rankToCostTier(costNorm) : band === 0 ? "cheap" : band >= 3 ? "expensive" : "medium";
  const qualityTier = scoreToQualityTier(qualityScore);
  const latencyTier = latencyHintsFast ? "fast" : latencyHintsSlow ? "slow" : costNorm !== void 0 ? costNorm <= 0.33 ? "fast" : costNorm <= 0.66 ? "medium" : "slow" : band <= 1 ? "fast" : band >= 3 ? "slow" : "medium";
  const recommendedRoleTier = qualityTierToRoleTier(qualityTier, costTier);
  const latencyPenalty = latencyHintsFast ? 125 : 0;
  const profileRank = Math.round(qualityScore * 100 * 10) + Math.round(versionScore * 25) - latencyPenalty;
  return {
    profileRank,
    costTier,
    qualityTier,
    latencyTier,
    recommendedRoleTier,
    recommendedAgents: agentsForRoleTier(recommendedRoleTier),
    classificationSources
  };
}
function resolveProbeStatus(text, timedOut) {
  if (timedOut) return "timeout";
  if (!text) return "error";
  if (/(unauthori[sz]ed|forbidden|api key|auth|billing|credit|quota)/i.test(text)) return "auth";
  if (/(not found|unknown model|model unavailable|model disabled|unsupported model|unavailable)/i.test(text)) return "unavailable";
  return "error";
}
async function probeModel(pi, fullId) {
  if (typeof pi.exec !== "function") {
    return { status: "skipped", message: "pi.exec is unavailable in this runtime." };
  }
  const spawnSpec = getPiSpawnCommand(["-p", "--model", fullId, "--no-tools", 'Reply with exactly "OK".']);
  const result = await pi.exec(spawnSpec.command, spawnSpec.args, {
    cwd: os2.tmpdir(),
    timeout: 45e3
  });
  const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
  const combined = [stderr, stdout].filter(Boolean).join("\n").trim();
  if (result.code === 0) return { status: "ok", message: stdout || "Probe succeeded." };
  return { status: resolveProbeStatus(combined, result.killed === true), message: combined || `Probe exited with code ${result.code ?? "unknown"}.` };
}
function roundIndex(count, position) {
  if (count <= 1) return 0;
  return Math.max(0, Math.min(count - 1, Math.round((count - 1) * position)));
}
function profilePositions(kind) {
  return kind === "quota" ? { cheap: 0, medium: 1 / 3, strong: 2 / 3 } : { cheap: 1 / 3, medium: 2 / 3, strong: 1 };
}
function pickTierModels(models, kind) {
  if (models.length === 0) throw new Error("No provider models are available for profile generation.");
  const selectionPool = kind === "quota" && models.length > 1 ? models.slice(0, -1) : models;
  const positions = profilePositions(kind);
  return {
    cheap: selectionPool[roundIndex(selectionPool.length, positions.cheap)].fullId,
    medium: selectionPool[roundIndex(selectionPool.length, positions.medium)].fullId,
    strong: selectionPool[roundIndex(selectionPool.length, positions.strong)].fullId
  };
}
function observedCombinedCost(model) {
  return combinedCost(model.observed.cost);
}
function dominatesModel(a, b) {
  const costA = observedCombinedCost(a);
  const costB = observedCombinedCost(b);
  if (costA === void 0 || costB === void 0) return false;
  if (costA > costB) return false;
  if (a.derived.profileRank < b.derived.profileRank) return false;
  if ((a.observed.reasoning === true ? 1 : 0) < (b.observed.reasoning === true ? 1 : 0)) return false;
  if ((a.observed.contextWindow ?? 0) < (b.observed.contextWindow ?? 0)) return false;
  if ((a.observed.maxTokens ?? 0) < (b.observed.maxTokens ?? 0)) return false;
  return costA < costB || a.derived.profileRank > b.derived.profileRank || a.observed.reasoning === true && b.observed.reasoning !== true || (a.observed.contextWindow ?? 0) > (b.observed.contextWindow ?? 0) || (a.observed.maxTokens ?? 0) > (b.observed.maxTokens ?? 0);
}
function filterDominatedModels(models) {
  return models.filter((candidate, index) => !models.some((other, otherIndex) => otherIndex !== index && dominatesModel(other, candidate)));
}
function buildProfileFile(models) {
  return {
    subagents: {
      agentOverrides: {
        scout: { model: models.cheap },
        delegate: { model: models.cheap },
        researcher: { model: models.medium },
        worker: { model: models.strong },
        reviewer: { model: models.strong },
        oracle: { model: models.strong }
      }
    }
  };
}
function catalogModelIsUsable(model) {
  return model.observed.availableInRegistry && model.observed.probe.status !== "unavailable" && model.observed.probe.status !== "auth" && model.observed.probe.status !== "timeout" && model.observed.probe.status !== "error";
}
function modelUsesHeuristicClassification(model) {
  return model.derived.classificationSources.includes("heuristic-name") && !model.derived.classificationSources.includes("official-metadata");
}
function warningLineForHeuristicFallback() {
  return "Classification fell back to name heuristics.";
}
function countHeuristicFallbackModels(catalog) {
  return catalog.models.filter(modelUsesHeuristicClassification).length;
}
function resolveProfilePath(name) {
  const dir = ensureSubagentProfilesDir();
  return path5.join(dir, `${normalizeProfileName(name)}.json`);
}
function getSubagentProfilesRootDir() {
  return path5.join(getAgentDir(), "profiles", "pi-subagents");
}
function getSubagentProfilesDir() {
  return getSubagentProfilesRootDir();
}
function ensureSubagentProfilesDir() {
  const dir = getSubagentProfilesDir();
  fs6.mkdirSync(dir, { recursive: true });
  return dir;
}
function getProviderModelsDir() {
  return path5.join(getSubagentProfilesRootDir(), "providers");
}
function ensureProviderModelsDir() {
  const dir = getProviderModelsDir();
  fs6.mkdirSync(dir, { recursive: true });
  return dir;
}
function getProviderModelsPath(provider) {
  return path5.join(ensureProviderModelsDir(), `${normalizeProviderName(provider)}.models.json`);
}
function listSubagentProfiles() {
  const dir = ensureSubagentProfilesDir();
  return fs6.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name.slice(0, -5)).sort((a, b) => a.localeCompare(b));
}
function readSubagentProfile(name) {
  const filePath = resolveProfilePath(name);
  if (!fs6.existsSync(filePath)) throw new Error(`Profile not found: ${name}`);
  const parsed = readJsonObjectFile(filePath);
  return { filePath, profile: validateSubagentProfile(filePath, parsed) };
}
function applySubagentProfile(name) {
  const { filePath, profile } = readSubagentProfile(name);
  const settingsPath = getUserSettingsPath();
  withSettingsFileLease(settingsPath, () => {
    const settings = readSettingsFile(settingsPath);
    const existing = settings.subagents && typeof settings.subagents === "object" && !Array.isArray(settings.subagents) ? settings.subagents : {};
    const agentOverrides = { ...profile.subagents.agentOverrides };
    const existingOverrides = existing.agentOverrides && typeof existing.agentOverrides === "object" && !Array.isArray(existing.agentOverrides) ? existing.agentOverrides : {};
    for (const [name2, value] of Object.entries(existingOverrides)) {
      const machine = value && typeof value === "object" && !Array.isArray(value) ? value.machine : void 0;
      if (typeof machine === "string" && agentOverrides[name2]?.machine === void 0) agentOverrides[name2] = { ...agentOverrides[name2], machine };
    }
    settings.subagents = {
      ...existing,
      ...profile.subagents,
      agentOverrides
    };
    writeJsonFile(settingsPath, settings);
  });
  return { filePath, settingsPath };
}
function readProviderModelCatalog(provider) {
  const filePath = getProviderModelsPath(provider);
  if (!fs6.existsSync(filePath)) return null;
  return readJsonObjectFile(filePath);
}
function isProviderModelCatalogStale(catalog, maxAgeDays = DEFAULT_PROVIDER_MODELS_MAX_AGE_DAYS) {
  const refreshedAt = Date.parse(catalog.refreshedAt);
  if (!Number.isFinite(refreshedAt)) return true;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1e3;
  return Date.now() - refreshedAt > maxAgeMs;
}
async function refreshProviderModelCatalog(pi, ctx, provider, options = {}) {
  const normalizedProvider = normalizeProviderName(provider);
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_PROVIDER_MODELS_MAX_AGE_DAYS;
  const filePath = getProviderModelsPath(normalizedProvider);
  if (!options.force) {
    const existing = readProviderModelCatalog(normalizedProvider);
    if (existing && !isProviderModelCatalogStale(existing, maxAgeDays)) {
      return { filePath, catalog: existing, reused: true, heuristicFallbackCount: countHeuristicFallbackModels(existing) };
    }
  }
  const availableModels = ctx.modelRegistry.getAvailable().filter((model) => model.provider === normalizedProvider);
  if (availableModels.length === 0) {
    throw new Error(`No models found in the current registry for provider '${normalizedProvider}'.`);
  }
  const observedModels = [];
  for (const rawModel of availableModels) {
    const modelRecord = rawModel;
    const fullId = `${modelRecord.provider}/${modelRecord.id}`;
    const probe = options.probe === false ? { status: "skipped", message: "Live probing disabled." } : await probeModel(pi, fullId);
    observedModels.push({ rawModel, modelRecord, fullId, probe });
  }
  const classificationContext = buildClassificationContext(observedModels.map(({ modelRecord }) => ({
    id: modelRecord.id,
    ...typeof modelRecord.name === "string" ? { name: modelRecord.name } : {},
    ...typeof modelRecord.reasoning === "boolean" ? { reasoning: modelRecord.reasoning } : {},
    ...typeof modelRecord.contextWindow === "number" ? { contextWindow: modelRecord.contextWindow } : {},
    ...typeof modelRecord.maxTokens === "number" ? { maxTokens: modelRecord.maxTokens } : {},
    ...modelRecord.cost && typeof modelRecord.cost === "object" ? { cost: modelRecord.cost } : {}
  })));
  const models = [];
  for (const { rawModel, modelRecord, fullId, probe } of observedModels) {
    const classification = classifyModel({
      id: modelRecord.id,
      ...typeof modelRecord.name === "string" ? { name: modelRecord.name } : {},
      ...typeof modelRecord.reasoning === "boolean" ? { reasoning: modelRecord.reasoning } : {},
      ...typeof modelRecord.contextWindow === "number" ? { contextWindow: modelRecord.contextWindow } : {},
      ...typeof modelRecord.maxTokens === "number" ? { maxTokens: modelRecord.maxTokens } : {},
      ...modelRecord.cost && typeof modelRecord.cost === "object" ? { cost: modelRecord.cost } : {}
    }, classificationContext);
    const warnings = classification.classificationSources.includes("heuristic-name") && !classification.classificationSources.includes("official-metadata") ? [warningLineForHeuristicFallback()] : [];
    models.push({
      id: modelRecord.id,
      fullId,
      observed: {
        availableInRegistry: true,
        ...typeof modelRecord.name === "string" ? { name: modelRecord.name } : {},
        ...typeof modelRecord.reasoning === "boolean" ? { reasoning: modelRecord.reasoning } : {},
        thinkingLevels: getSupportedThinkingLevels(toModelInfo(rawModel)).map((level) => level),
        ...typeof modelRecord.contextWindow === "number" ? { contextWindow: modelRecord.contextWindow } : {},
        ...typeof modelRecord.maxTokens === "number" ? { maxTokens: modelRecord.maxTokens } : {},
        ...modelRecord.cost && typeof modelRecord.cost === "object" ? { cost: modelRecord.cost } : {},
        probe: {
          status: probe.status,
          checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
          ...probe.message ? { message: probe.message } : {}
        }
      },
      derived: classification,
      warnings,
      notes: []
    });
  }
  models.sort((a, b) => a.derived.profileRank - b.derived.profileRank || a.fullId.localeCompare(b.fullId));
  const catalog = {
    provider: normalizedProvider,
    refreshedAt: (/* @__PURE__ */ new Date()).toISOString(),
    maxAgeDays,
    sources: ["runtime-registry", ...options.probe === false ? [] : ["live-probe"], "heuristic-classifier"],
    models
  };
  writeJsonFile(filePath, catalog);
  return { filePath, catalog, reused: false, heuristicFallbackCount: countHeuristicFallbackModels(catalog) };
}
async function generateProfilesForProvider(pi, ctx, provider, options = {}) {
  const normalizedProvider = normalizeProviderName(provider);
  const { filePath: catalogPath, catalog, heuristicFallbackCount } = await refreshProviderModelCatalog(pi, ctx, normalizedProvider, {
    maxAgeDays: options.maxAgeDays,
    force: options.forceRefresh,
    probe: options.probe
  });
  const usableModels = catalog.models.filter(catalogModelIsUsable);
  const profileModels = filterDominatedModels(usableModels);
  if (profileModels.length === 0) {
    throw new Error(`Provider '${normalizedProvider}' has no usable models after filtering.`);
  }
  const quotaModels = pickTierModels(profileModels, "quota");
  const qualityModels = pickTierModels(profileModels, "quality");
  const dir = ensureSubagentProfilesDir();
  const quotaPath = path5.join(dir, `${normalizedProvider}.quota.json`);
  const qualityPath = path5.join(dir, `${normalizedProvider}.quality.json`);
  writeJsonFile(quotaPath, buildProfileFile(quotaModels));
  writeJsonFile(qualityPath, buildProfileFile(qualityModels));
  const selectedModels = /* @__PURE__ */ new Set([...Object.values(quotaModels), ...Object.values(qualityModels)]);
  const selectedHeuristicFallbackCount = profileModels.filter((model) => selectedModels.has(model.fullId) && modelUsesHeuristicClassification(model)).length;
  return { quotaPath, qualityPath, catalogPath, quotaModels, qualityModels, heuristicFallbackCount, selectedHeuristicFallbackCount };
}
async function checkSubagentProfile(pi, ctx, name) {
  const { filePath, profile } = readSubagentProfile(name);
  const availableModels = ctx.modelRegistry.getAvailable().map(toModelInfo);
  const entries = Object.entries(profile.subagents.agentOverrides).filter(([, value]) => typeof value?.model === "string" && value.model.trim()).map(([agent, value]) => ({ agent, model: value.model.trim() }));
  const probeCache = /* @__PURE__ */ new Map();
  const results = [];
  for (const entry of entries) {
    const modelInfo = findModelInfo(entry.model, availableModels);
    const { thinkingSuffix } = splitKnownThinkingSuffix(entry.model);
    const probeModelId = modelInfo ? `${modelInfo.fullId}${thinkingSuffix}` : entry.model;
    let probe = probeCache.get(probeModelId);
    if (!probe) {
      probe = await probeModel(pi, probeModelId);
      probeCache.set(probeModelId, probe);
    }
    results.push({
      agent: entry.agent,
      model: entry.model,
      inRegistry: modelInfo !== void 0,
      probe
    });
  }
  return { profileName: name, filePath, results };
}

// src/runs/background/inspect-rpc.ts
import * as fs7 from "node:fs";
var INSPECT_REPLY_KIND = "pi-subagents.inspect-reply";
var INSPECT_REPLY_VERSION = 1;
var INSPECT_WIDGET_KEY = "subagent-inspect";
var INSPECT_WIDGET_PREFIX = "PI_SUBAGENT_INSPECT_JSON:";
var REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
var MAX_ID_LENGTH = 256;
var MAX_LABEL_LENGTH = 160;
var MAX_TASK_LENGTH = 2e3;
var MAX_FINAL_OUTPUT_LENGTH = 8e3;
var MAX_MESSAGE_TEXT_LENGTH = 1e3;
var DEFAULT_MESSAGE_LINES = 100;
var MAX_MESSAGE_LINES = 200;
var FAILED_OUTPUT_ARTIFACT_PREFIX = "Subagent run failed before producing output.\n\nError:\n";
var MAX_SERIALIZED_BYTES = 64 * 1024;
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function publicText(value, maxLength) {
  if (typeof value !== "string") return void 0;
  const normalized = sanitizeDisplayText(value.slice(0, maxLength * 4));
  return normalized ? truncateDisplayText(normalized, maxLength) : void 0;
}
function boundContent(value, maxLength) {
  const normalized = value.replace(/[\u2028\u2029]/g, "\n");
  return truncateDisplayText(normalized, maxLength);
}
function errorReply(request, code, message2) {
  return {
    kind: INSPECT_REPLY_KIND,
    version: INSPECT_REPLY_VERSION,
    requestId: typeof request.requestId === "string" && REQUEST_ID_PATTERN.test(request.requestId) ? request.requestId : "invalid",
    ...typeof request.asyncId === "string" ? { asyncId: truncateDisplayText(request.asyncId, MAX_ID_LENGTH) } : {},
    ...typeof request.childId === "string" ? { childId: truncateDisplayText(request.childId, MAX_ID_LENGTH) } : {},
    error: { code, message: message2 }
  };
}
function parseInspectRequest(args) {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const positional = [];
  let lines;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === "--lines") {
      const value = tokens[++index];
      const parsed = value === void 0 ? NaN : Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) return { error: "--lines requires an integer value." };
      lines = parsed;
      continue;
    }
    if (token.startsWith("--")) return { error: `Unknown flag: ${token}. Supported: --lines N.` };
    positional.push(token);
  }
  const [requestId, asyncId, childId, ...extra] = positional;
  if (!requestId || !REQUEST_ID_PATTERN.test(requestId)) {
    return { error: "requestId must match [A-Za-z0-9_-]{1,64}." };
  }
  if (!asyncId) return { error: "Usage: /subagents-inspect-rpc <requestId> <asyncId> [childId] [--lines N]." };
  if (asyncId.length > MAX_ID_LENGTH || childId !== void 0 && childId.length > MAX_ID_LENGTH) {
    return { error: "asyncId/childId exceed the maximum length." };
  }
  if (extra.length > 0) return { error: "Too many positional arguments. Usage: /subagents-inspect-rpc <requestId> <asyncId> [childId] [--lines N]." };
  if (lines !== void 0 && (lines < 1 || !Number.isSafeInteger(lines))) return { error: "--lines must be a positive integer." };
  return { request: { requestId, asyncId, childId, lines } };
}
function findChildNode(status, asyncDir, childId) {
  const steps = status.steps ?? [];
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    const ids = [step.workflowKey, step.runId, `step:${index}`];
    if (ids.includes(childId)) {
      return { asyncDir, status, stepIndex: index, label: step.label ?? step.agent };
    }
  }
  const findNested = (children) => {
    for (const child of children ?? []) {
      if (child.id === childId) return child;
      const deeper = findNested(child.children);
      if (deeper) return deeper;
    }
    return void 0;
  };
  for (const step of steps) {
    const nested = findNested(step.children);
    if (nested) {
      if (!nested.asyncDir) return { error: `Child '${childId}' has no async directory to inspect.` };
      const childStatus = readStatus(nested.asyncDir);
      if (!childStatus) return { error: `Child '${childId}' status is unavailable.` };
      return { asyncDir: nested.asyncDir, status: childStatus, label: nested.agent ?? nested.agents?.join(", ") };
    }
  }
  return { error: `Child '${childId}' was not found under async run '${status.runId}'.` };
}
function resultOutput(data, stepIndex) {
  if (!isRecord2(data)) throw new Error("Async result payload must be an object.");
  if (data.results !== void 0 && !Array.isArray(data.results)) throw new Error("Async result payload results must be an array.");
  if (data.summary !== void 0 && typeof data.summary !== "string") throw new Error("Async result payload summary must be a string.");
  const results = data.results;
  if (stepIndex !== void 0 && results) {
    const stepResult = results[stepIndex];
    if (stepResult === void 0) return {};
    if (!isRecord2(stepResult)) throw new Error("Async result payload step result must be an object.");
    if (stepResult.output !== void 0 && typeof stepResult.output !== "string") throw new Error("Async result payload step output must be a string.");
    if (stepResult.error !== void 0 && typeof stepResult.error !== "string") throw new Error("Async result payload step error must be a string.");
    return {
      ...typeof stepResult.output === "string" ? { output: stepResult.output } : {},
      ...typeof stepResult.error === "string" ? { errorText: stepResult.error } : {}
    };
  }
  if (typeof data.summary === "string") return { output: data.summary };
  if (results?.length === 1) {
    const result = results[0];
    if (!isRecord2(result)) throw new Error("Async result payload result must be an object.");
    if (result.output !== void 0 && typeof result.output !== "string") throw new Error("Async result payload output must be a string.");
    if (typeof result.output === "string") return { output: result.output };
  }
  return {};
}
function readOutputArtifact(outputPath) {
  const file = fs7.openSync(outputPath, "r");
  try {
    const prefix = Buffer.allocUnsafe(Buffer.byteLength(FAILED_OUTPUT_ARTIFACT_PREFIX, "utf-8"));
    const prefixBytes = fs7.readSync(file, prefix, 0, prefix.length, 0);
    const failedOutput = prefix.subarray(0, prefixBytes).toString("utf-8") === FAILED_OUTPUT_ARTIFACT_PREFIX;
    const size = fs7.fstatSync(file).size;
    const length = Math.min(size, MAX_FINAL_OUTPUT_LENGTH * 4);
    const buffer = Buffer.allocUnsafe(length);
    const bytesRead = fs7.readSync(file, buffer, 0, length, size - length);
    let text = decodeUtf8Tail(buffer.subarray(0, bytesRead));
    if (!failedOutput) return { output: text };
    const metadata = text.lastIndexOf("\nMetadata: ");
    if (metadata >= 0 && !text.slice(metadata + 1).includes("\n")) text = text.slice(0, metadata);
    const transcript = text.lastIndexOf("\n\nTranscript: ");
    if (transcript >= 0 && !text.slice(transcript + 2).includes("\n")) text = text.slice(0, transcript);
    return { errorText: text.startsWith(FAILED_OUTPUT_ARTIFACT_PREFIX) ? text.slice(FAILED_OUTPUT_ARTIFACT_PREFIX.length) : text };
  } finally {
    fs7.closeSync(file);
  }
}
function readSessionBackedOutput(sessionPath, trustedRoots, trustedSessionFileRoot) {
  if (trustedRoots.length === 0 && !trustedSessionFileRoot) return {};
  const tail = readSessionMessagesTail(sessionPath, MAX_MESSAGE_LINES, trustedRoots, [sessionPath], trustedSessionFileRoot);
  const last = tail.messages.findLast((message2) => message2.role === "assistant" && message2.kind === "text");
  if (!last) return {};
  const parts = tail.messages.filter((message2) => message2.recordIndex === last.recordIndex && message2.kind === "text");
  return { output: parts.map((part) => part.text).join("\n") };
}
function readResultOutput(resultsDir, sessionId, runId, stepIndex, trustedRoots, stepAgent, now, trustedSessionFileRoot) {
  const resultPath = resultPayloadPathForSessionRun(resultsDir, sessionId, runId);
  if (resultPath) return resultOutput(JSON.parse(fs7.readFileSync(resultPath, "utf-8")), stepIndex);
  const replayPath = completionReplayPath(resultsDir, runId);
  let rawReplay;
  try {
    rawReplay = JSON.parse(fs7.readFileSync(replayPath, "utf-8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const nowMs = now();
  const replay = readCompletionReplay(resultsDir, runId, { sessionId, now: nowMs });
  if (!replay) {
    if (isRecord2(rawReplay) && rawReplay.version === 1 && rawReplay.runId === runId && rawReplay.sessionId === sessionId && typeof rawReplay.expiresAt === "number" && rawReplay.expiresAt > nowMs) {
      throw new Error("Completion replay record failed validation.");
    }
    return {};
  }
  const archive = readCompletionArchive(replay.archivePath);
  const childEntries = archive?.entries.filter((entry) => entry.resultIndex !== void 0 || entry.agent !== void 0) ?? [];
  const singleChild = childEntries.length === 1;
  const uniqueLegacyAgent = (agent) => agent !== void 0 && archive?.entries.filter((entry) => entry.resultIndex === void 0 && entry.agent === agent).length === 1;
  const matches = (entry) => {
    if (stepIndex !== void 0) {
      if (entry.resultIndex !== void 0) return entry.resultIndex === stepIndex;
      return uniqueLegacyAgent(stepAgent) && entry.agent === stepAgent;
    }
    if (singleChild) return entry.resultIndex !== void 0 || entry.agent !== void 0;
    return entry.resultIndex === void 0 && entry.agent === void 0;
  };
  const artifact = archive?.entries.find((entry) => entry.source === "output-artifact" && matches(entry));
  const artifactPath = artifact?.source === "output-artifact" ? artifact.path : void 0;
  if (artifactPath) return readOutputArtifact(artifactPath);
  const sessionEntry = archive?.entries.find((entry) => entry.source === "session" && matches(entry));
  const sessionPath = sessionEntry?.source === "session" ? sessionEntry.path : void 0;
  if (sessionPath) return readSessionBackedOutput(sessionPath, trustedRoots, trustedSessionFileRoot);
  const output = archive?.entries.find((entry) => entry.source === "result-tail" && matches(entry))?.text;
  return output ? { output } : {};
}
function workflowChildRunModel(runId, workflowRunId, currentSessionId, asyncDirRoot, resultsDir, state) {
  const resolved = resolveSubagentRunId(runId, { asyncDirRoot, resultsDir, state });
  if (resolved?.kind !== "async" || resolved.id !== runId || !resolved.location.asyncDir) return void 0;
  const child = readStatus(resolved.location.asyncDir);
  if (!child || child.runId !== runId || child.parentWorkflowRunId !== workflowRunId || child.mode !== "single" || !ownsRun(currentSessionId, child.sessionId)) return void 0;
  return child.steps?.[0]?.resolvedModel;
}
function toReplyMessage(message2) {
  return {
    role: truncateDisplayText(sanitizeDisplayText(message2.role), 32),
    kind: message2.kind,
    text: boundContent(message2.text, MAX_MESSAGE_TEXT_LENGTH),
    ...message2.name ? { name: truncateDisplayText(sanitizeDisplayText(message2.name), 96) } : {},
    ...message2.isError === true ? { isError: true } : {}
  };
}
function enforceByteBudget(reply) {
  const truncated = reply.truncated ?? { task: false, messages: 0, finalOutput: false };
  const sized = () => Buffer.byteLength(JSON.stringify(reply), "utf-8");
  while (reply.messages && reply.messages.length > 0 && sized() > MAX_SERIALIZED_BYTES) {
    reply.messages.shift();
    truncated.messages += 1;
  }
  if (sized() > MAX_SERIALIZED_BYTES && reply.finalOutput) {
    reply.finalOutput = truncateDisplayText(reply.finalOutput, Math.max(0, reply.finalOutput.length - (sized() - MAX_SERIALIZED_BYTES) - 256));
    truncated.finalOutput = true;
  }
  if (sized() > MAX_SERIALIZED_BYTES && reply.task) {
    reply.task = truncateDisplayText(reply.task, Math.max(0, reply.task.length - (sized() - MAX_SERIALIZED_BYTES) - 256));
    truncated.task = true;
  }
  if (truncated.task || truncated.messages > 0 || truncated.finalOutput) reply.truncated = truncated;
  return reply;
}
function buildInspectReply(request, deps = {}) {
  const asyncDirRoot = deps.asyncDirRoot ?? DIRS.async;
  const resultsDir = deps.resultsDir ?? DIRS.results;
  const currentSessionId = deps.state?.currentSessionId ?? void 0;
  if (!currentSessionId) {
    return errorReply(request, "no_active_session", "Inspection requires an active session; the request could not be attributed to a session.");
  }
  let resolved;
  try {
    resolved = resolveSubagentRunId(request.asyncId, { asyncDirRoot, resultsDir, state: deps.state });
  } catch {
    return errorReply(request, "invalid_request", "The requested async run could not be resolved.");
  }
  if (!resolved || resolved.kind === "foreground") {
    return errorReply(request, "not_found", `Async run '${request.asyncId}' was not found.`);
  }
  try {
    let asyncDir;
    let status;
    if (resolved.kind === "nested") {
      reconcileNestedAsyncDescendants(resolved.match.route, { resultsDir, kill: deps.kill, now: deps.now });
      asyncDir = resolved.match.run.asyncDir ?? "";
      status = asyncDir ? readStatus(asyncDir) : null;
    } else {
      if (!resolved.location.asyncDir) return errorReply(request, "stale", `Async run '${request.asyncId}' has no remaining artifacts.`);
      asyncDir = resolved.location.asyncDir;
      status = reconcileAsyncRun(asyncDir, { resultsDir, kill: deps.kill, now: deps.now }).status ?? readStatus(asyncDir);
    }
    if (!status) return errorReply(request, "stale", `Async run '${request.asyncId}' artifacts are no longer available.`);
    if (!ownsRun(currentSessionId, status.sessionId)) {
      return errorReply(request, "foreign_session", "Inspection is only available for async runs owned by the current session.");
    }
    const node = request.childId === void 0 ? { asyncDir, status } : findChildNode(status, asyncDir, request.childId);
    if ("error" in node) return errorReply(request, "not_found", node.error);
    if (node.asyncDir !== asyncDir) {
      if (!ownsRun(currentSessionId, node.status.sessionId)) {
        return errorReply(request, "foreign_session", "Inspection is only available for async runs owned by the current session.");
      }
      reconcileAsyncRun(node.asyncDir, { resultsDir, kill: deps.kill, now: deps.now });
      node.status = readStatus(node.asyncDir) ?? node.status;
    }
    const step = node.stepIndex !== void 0 ? node.status.steps?.[node.stepIndex] : void 0;
    const lineLimit = Math.max(1, Math.min(MAX_MESSAGE_LINES, Math.trunc(request.lines ?? DEFAULT_MESSAGE_LINES)));
    const sessionFile = step?.sessionFile ?? node.status.sessionFile;
    const trustedRoots = [.../* @__PURE__ */ new Set([
      ...deps.state?.trustedSessionRoots ?? [],
      ...node.status.sessionRoot ? [node.status.sessionRoot] : []
    ])];
    let messages;
    let task;
    if (sessionFile && (trustedRoots.length > 0 || deps.state?.trustedSessionFileRoot)) {
      const tail = readSessionMessagesTail(sessionFile, lineLimit, trustedRoots, [sessionFile], deps.state?.trustedSessionFileRoot);
      if (tail.messages.length > 0) {
        messages = tail.messages.map(toReplyMessage);
        if (!tail.truncated && node.status.context !== "fork" && step?.context !== "fork") {
          const firstUser = tail.messages.find((message2) => message2.role === "user" && message2.kind === "text");
          if (firstUser) task = firstUser.text;
        }
      }
    }
    const result = readResultOutput(resultsDir, node.status.sessionId ?? currentSessionId, node.status.runId, node.stepIndex, trustedRoots, step?.agent, deps.now ?? Date.now, deps.state?.trustedSessionFileRoot);
    const failedText = step?.error ?? node.status.error;
    if (result.output === void 0 && result.errorText === void 0 && failedText !== void 0) {
      return errorReply(request, "internal", "Inspection could not read the async run artifacts.");
    }
    const finalOutputRaw = result.output ?? result.errorText;
    const truncated = { task: false, messages: 0, finalOutput: false };
    const boundedTask = task !== void 0 ? boundContent(task, MAX_TASK_LENGTH) : void 0;
    if (task !== void 0 && boundedTask !== task) truncated.task = true;
    const boundedFinal = finalOutputRaw !== void 0 ? boundContent(finalOutputRaw, MAX_FINAL_OUTPUT_LENGTH) : void 0;
    if (finalOutputRaw !== void 0 && boundedFinal !== finalOutputRaw) truncated.finalOutput = true;
    const label = publicText(node.label ?? step?.label ?? step?.agent ?? node.status.runId, MAX_LABEL_LENGTH);
    const recordedModel = (step ?? (node.status.mode === "single" ? node.status.steps?.[0] : void 0))?.resolvedModel ?? (step?.runId ? workflowChildRunModel(step.runId, node.status.runId, currentSessionId, asyncDirRoot, resultsDir, deps.state) : void 0);
    const resolvedProvider = publicText(recordedModel?.provider, 64);
    const resolvedModelId = publicText(recordedModel?.model, 160);
    const reply = {
      kind: INSPECT_REPLY_KIND,
      version: INSPECT_REPLY_VERSION,
      requestId: request.requestId,
      asyncId: node.status.runId,
      ...request.childId !== void 0 ? { childId: request.childId } : {},
      status: node.status.state,
      ...label ? { label } : {},
      ...boundedTask !== void 0 ? { task: boundedTask } : {},
      ...messages && messages.length > 0 ? { messages } : {},
      ...boundedFinal !== void 0 ? { finalOutput: boundedFinal } : {},
      ...resolvedProvider && resolvedModelId ? { resolvedModel: { provider: resolvedProvider, model: resolvedModelId } } : {},
      ...truncated.task || truncated.finalOutput || truncated.messages > 0 ? { truncated } : {}
    };
    return enforceByteBudget(reply);
  } catch {
    return errorReply(request, "internal", "Inspection could not read the async run artifacts.");
  }
}
function encodeInspectReply(reply) {
  return [`${INSPECT_WIDGET_PREFIX}${JSON.stringify(reply)}`];
}
function handleInspectRpcArgs(args, deps = {}) {
  const parsed = parseInspectRequest(args);
  if (parsed.error || !parsed.request) {
    const firstToken = args.trim().split(/\s+/)[0];
    const echo = firstToken !== void 0 && REQUEST_ID_PATTERN.test(firstToken) ? { requestId: firstToken } : {};
    return errorReply(echo, "invalid_request", parsed.error ?? "Invalid inspect request.");
  }
  return buildInspectReply(parsed.request, deps);
}

// src/slash/prompt-workflows.ts
import * as fs8 from "node:fs";
import * as path7 from "node:path";

// src/shared/prompt-resources.ts
import * as path6 from "node:path";
import { fileURLToPath } from "node:url";
function getPromptDirectories(cwd) {
  return {
    package: path6.resolve(path6.dirname(fileURLToPath(new URL("../src/shared/prompt-resources.js", import.meta.url).href)), "..", "..", "prompts"),
    user: path6.join(getAgentDir(), "prompts"),
    project: path6.join(getProjectConfigDir(cwd), "prompts")
  };
}

// src/slash/prompt-workflows.ts
var RESERVED_COMMAND_NAMES = /* @__PURE__ */ new Set([
  "chain-prompts",
  "prompt-workflow",
  "run",
  "chain",
  "parallel",
  "run-chain",
  "subagents-doctor",
  "subagents-models"
]);
function readPromptFiles(cwd) {
  const files = [];
  for (const dir of Object.values(getPromptDirectories(cwd))) {
    let entries;
    try {
      entries = fs8.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.name.endsWith(".md")) continue;
      const filePath = path7.join(dir, entry.name);
      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        try {
          isFile = fs8.statSync(filePath).isFile();
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          isFile = false;
        }
      }
      if (isFile) files.push(filePath);
    }
  }
  return files;
}
function firstNonEmptyLine(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "Prompt workflow";
}
function stringField(frontmatter, key) {
  const value = frontmatter[key]?.trim();
  return value ? value : void 0;
}
function booleanField(frontmatter, key) {
  const value = frontmatter[key]?.trim().toLowerCase();
  if (value === "true" || value === "yes" || value === "1") return true;
  if (value === "false" || value === "no" || value === "0") return false;
  return void 0;
}
function parseSkill(value) {
  if (!value) return void 0;
  if (value === "false") return false;
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts : parts[0];
}
function parseAgent(frontmatter) {
  const subagent = stringField(frontmatter, "subagent");
  if (!subagent || subagent === "true") return "delegate";
  return subagent;
}
function loadPromptWorkflow(filePath) {
  const content = fs8.readFileSync(filePath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);
  const name = path7.basename(filePath, ".md");
  if (!name || RESERVED_COMMAND_NAMES.has(name)) return void 0;
  const model = stringField(frontmatter, "model");
  const skill = parseSkill(stringField(frontmatter, "skill"));
  const cwd = stringField(frontmatter, "cwd");
  const chain = stringField(frontmatter, "chain");
  return {
    name,
    description: stringField(frontmatter, "description") ?? firstNonEmptyLine(body),
    body,
    filePath,
    agent: parseAgent(frontmatter),
    ...booleanField(frontmatter, "inheritContext") === true || booleanField(frontmatter, "fork") === true ? { context: "fork" } : {},
    ...booleanField(frontmatter, "fresh") === true ? { context: "fresh" } : {},
    ...model ? { model } : {},
    ...skill !== void 0 ? { skill } : {},
    ...cwd ? { cwd } : {},
    ...chain ? { chain } : {}
  };
}
function discoverPromptWorkflows(cwd) {
  const workflows = /* @__PURE__ */ new Map();
  for (const file of readPromptFiles(cwd)) {
    const workflow = loadPromptWorkflow(file);
    if (workflow) workflows.set(workflow.name, workflow);
  }
  return [...workflows.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function shellWords(input) {
  const words = [];
  let current = "";
  let quote;
  let escaped = false;
  for (const ch of input) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = void 0;
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) words.push(current);
  return words;
}
function substituteArgs(template, args) {
  const all = args.join(" ");
  return template.replace(/\$ARGUMENTS/g, all).replace(/\$@/g, all).replace(/\$\{(\d+):-([^}]*)\}/g, (_match, index, fallback) => args[Number(index) - 1] || fallback).replace(/\$(\d+)/g, (_match, index) => args[Number(index) - 1] ?? "");
}
function parseRuntimeOptions(words) {
  const args = [];
  let agentOverride;
  let fork = false;
  let fresh = false;
  let bg = false;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word === "--fork") {
      fork = true;
      continue;
    }
    if (word === "--fresh") {
      fresh = true;
      continue;
    }
    if (word === "--bg" || word === "--async") {
      bg = true;
      continue;
    }
    if (word === "--subagent") {
      agentOverride = words[++i];
      continue;
    }
    const eq = word.match(/^--subagent(?:=|:)(.+)$/);
    if (eq) {
      agentOverride = eq[1];
      continue;
    }
    args.push(word);
  }
  return { args, agentOverride, fork, fresh, bg };
}
function splitPromptChain(input) {
  return input.split(" -> ").map((part) => part.trim()).filter(Boolean);
}
function workflowParams(workflow, args, runtime) {
  const task = substituteArgs(workflow.body, args).trim();
  const context = runtime.fork ? "fork" : runtime.fresh ? "fresh" : workflow.context;
  return {
    agent: runtime.agentOverride ?? workflow.agent,
    task,
    agentScope: "both",
    ...context ? { context } : {},
    ...workflow.model ? { model: workflow.model } : {},
    ...workflow.skill !== void 0 ? { skill: workflow.skill } : {},
    ...workflow.cwd ? { cwd: workflow.cwd } : {}
  };
}
function promptWorkflowExecutionParams(workflows, args, runtime) {
  return {
    workflowScript: promptWorkflowScript(workflows, args, runtime),
    agentScope: "both",
    async: runtime.bg ? true : false
  };
}
function promptWorkflowScript(workflows, args, runtime) {
  const launches = workflows.map((workflow, index) => {
    const params = workflowParams(workflow, args, runtime);
    const task = params.task ?? "";
    const child = {
      agent: params.agent ?? "delegate",
      task,
      ...params.model ? { model: params.model } : {},
      ...params.skill !== void 0 ? { skill: params.skill } : {},
      ...params.cwd ? { cwd: params.cwd } : {},
      ...params.context ? { context: params.context } : {}
    };
    return `const step${index} = await runs.run(${JSON.stringify(`prompt-${index + 1}-${workflow.name}`)}, { ...${JSON.stringify(child)}, task: ${JSON.stringify(task)}.replaceAll("{previous}", previous) });
previous = step${index}.output;`;
  });
  return `let previous = "";
${launches.join("\n")}
return previous;`;
}
function findWorkflow(workflows, name) {
  return workflows.find((workflow) => workflow.name === name);
}
function formatWorkflowList(workflows) {
  if (workflows.length === 0) return "No prompt workflows found in package, user, or project prompts.";
  return [
    "Prompt workflows:",
    ...workflows.map((workflow) => `- ${workflow.name}: ${workflow.description} (${workflow.filePath})`)
  ].join("\n");
}
function registerPromptWorkflowCommands(input) {
  const { pi, run } = input;
  pi.registerCommand("prompt-workflow", {
    description: "Run a prompt template through native pi-subagents: /prompt-workflow <name> [args]",
    handler: async (rawArgs, ctx) => {
      const words = shellWords(rawArgs);
      const name = words.shift();
      const workflows = discoverPromptWorkflows(ctx.cwd);
      if (!name || name === "list") {
        pi.sendMessage({ content: formatWorkflowList(workflows), display: true });
        return;
      }
      const workflow = findWorkflow(workflows, name);
      if (!workflow) {
        ctx.ui.notify(`Unknown prompt workflow: ${name}`, "error");
        return;
      }
      const runtime = parseRuntimeOptions(words);
      try {
        if (workflow.chain) {
          const chain = splitPromptChain(workflow.chain).map((stepName) => {
            const step = findWorkflow(workflows, stepName);
            if (!step) throw new Error(`Unknown prompt workflow in chain '${workflow.name}': ${stepName}`);
            return step;
          });
          await run(promptWorkflowExecutionParams(chain, runtime.args, runtime), ctx);
          return;
        }
        await run(promptWorkflowExecutionParams([workflow], runtime.args, runtime), ctx);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    }
  });
}

// src/slash/subagent-cost.ts
import * as fs9 from "node:fs";
import * as path8 from "node:path";

// src/slash/slash-live-state.ts
var liveSnapshots = /* @__PURE__ */ new Map();
var finalSnapshots = /* @__PURE__ */ new Map();
var versionCounter = 1;
var EMPTY_MESSAGES = [];
var EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  turns: 0
};
function nextVersion() {
  return versionCounter++;
}
function cloneUsage() {
  return { ...EMPTY_USAGE };
}
function createPlaceholderResult(agent, task, status, index) {
  const sessionName = deriveChildSessionName({ agent, task });
  return {
    agent,
    task,
    ...sessionName ? { sessionName } : {},
    index,
    exitCode: 0,
    messages: EMPTY_MESSAGES,
    usage: cloneUsage(),
    progress: {
      index,
      agent,
      ...sessionName ? { sessionName } : {},
      status,
      task,
      recentTools: [],
      recentOutput: [],
      toolCount: 0,
      tokens: 0,
      durationMs: 0
    }
  };
}
function buildParallelInitialResult(params) {
  const tasks = params.tasks ?? [];
  return {
    content: [{ type: "text", text: tasks.map((task) => `${task.agent}: ${task.task}`).join("\n\n") }],
    details: {
      mode: "parallel",
      ...params.async ? { background: true } : {},
      ...params.context === "fresh" || params.context === "fork" ? { context: params.context } : {},
      results: tasks.map((task, index) => createPlaceholderResult(task.agent, task.task, "running", index)),
      progress: tasks.map((task, index) => {
        const sessionName = deriveChildSessionName({ agent: task.agent, task: task.task });
        return {
          index,
          agent: task.agent,
          ...sessionName ? { sessionName } : {},
          status: "running",
          task: task.task,
          recentTools: [],
          recentOutput: [],
          toolCount: 0,
          tokens: 0,
          durationMs: 0
        };
      })
    }
  };
}
function isParallelChainStep(step) {
  return "parallel" in step && Array.isArray(step.parallel);
}
function chainStepLabel(step) {
  if (isParallelChainStep(step)) {
    return `[${step.parallel.map((entry) => entry.agent).join("+")}]`;
  }
  return step.agent;
}
function flattenChainResults(chain, fallbackTask) {
  const results = [];
  let flatIndex = 0;
  for (const step of chain) {
    if (isParallelChainStep(step)) {
      for (const task of step.parallel) {
        results.push(createPlaceholderResult(task.agent, task.task ?? fallbackTask ?? "", results.length === 0 ? "running" : "pending", flatIndex));
        flatIndex++;
      }
      continue;
    }
    results.push(createPlaceholderResult(step.agent, step.task ?? fallbackTask ?? "", results.length === 0 ? "running" : "pending", flatIndex));
    flatIndex++;
  }
  return results;
}
function buildChainInitialResult(params) {
  const chain = params.chain ?? [];
  const results = flattenChainResults(chain, params.task);
  return {
    content: [{
      type: "text",
      text: results.map((result, index) => `Step ${index + 1}: ${result.agent}
${result.task}`).join("\n\n")
    }],
    details: {
      mode: "chain",
      ...params.async ? { background: true } : {},
      ...params.context === "fresh" || params.context === "fork" ? { context: params.context } : {},
      results,
      progress: results.map((result, index) => ({
        index,
        agent: result.agent,
        ...result.sessionName ? { sessionName: result.sessionName } : {},
        status: index === 0 ? "running" : "pending",
        task: result.task,
        recentTools: [],
        recentOutput: [],
        toolCount: 0,
        tokens: 0,
        durationMs: 0
      })),
      chainAgents: chain.map((step) => chainStepLabel(step)),
      totalSteps: chain.length,
      currentStepIndex: 0
    }
  };
}
function buildSingleInitialResult(params) {
  const preview = previewSimpleWorkflowRun(params.workflowScript) ?? {};
  const agent = params.agent ?? preview.agent ?? "subagent";
  const task = params.task ?? preview.task ?? "";
  const sessionName = deriveChildSessionName({ agent, task });
  return {
    content: [{ type: "text", text: task }],
    details: {
      mode: "single",
      ...params.async ? { background: true } : {},
      ...params.context === "fresh" || params.context === "fork" ? { context: params.context } : {},
      results: [createPlaceholderResult(agent, task, "running", 0)],
      progress: [{
        index: 0,
        agent,
        ...sessionName ? { sessionName } : {},
        status: "running",
        task,
        recentTools: [],
        recentOutput: [],
        toolCount: 0,
        tokens: 0,
        durationMs: 0
      }]
    }
  };
}
function buildSlashInitialResult(requestId, params) {
  const result = (params.tasks?.length ?? 0) > 0 ? buildParallelInitialResult(params) : (params.chain?.length ?? 0) > 0 ? buildChainInitialResult(params) : buildSingleInitialResult(params);
  liveSnapshots.set(requestId, { result, version: nextVersion() });
  finalSnapshots.delete(requestId);
  return { requestId, result };
}
function cloneResultsWithProgress(results, progress) {
  return results.map((result, index) => {
    const nextProgress = progress?.find((entry) => entry.index === index || entry.index === void 0 && entry.agent === result.agent) ?? result.progress;
    return nextProgress ? { ...result, progress: nextProgress } : result;
  });
}
function applySlashUpdate(requestId, update) {
  const snapshot = liveSnapshots.get(requestId);
  if (!snapshot) return;
  const progress = update.progress;
  if (!progress || !snapshot.result.details) return;
  const currentStepIndex = progress.findIndex((entry) => entry.status === "running");
  const nextDetails = {
    ...snapshot.result.details,
    progress,
    results: cloneResultsWithProgress(snapshot.result.details.results, progress),
    ...snapshot.result.details.mode === "chain" && currentStepIndex >= 0 ? { currentStepIndex } : {}
  };
  liveSnapshots.set(requestId, {
    result: {
      ...snapshot.result,
      details: nextDetails
    },
    version: nextVersion()
  });
}
function finalizeSlashResult(response) {
  const snapshot = {
    result: response.result,
    version: nextVersion()
  };
  finalSnapshots.set(response.requestId, snapshot);
  liveSnapshots.delete(response.requestId);
  return {
    requestId: response.requestId,
    result: response.result
  };
}
function failSlashResult(requestId, params, message2) {
  const initial = buildSlashInitialResult(requestId, params).result;
  const failedResults = initial.details.results.map((result2) => ({
    ...result2,
    exitCode: 1,
    error: message2,
    progress: result2.progress ? { ...result2.progress, status: "failed" } : result2.progress
  }));
  const result = {
    content: [{ type: "text", text: message2 }],
    details: {
      ...initial.details,
      results: failedResults,
      progress: failedResults.map((entry) => entry.progress).filter(Boolean)
    }
  };
  const snapshot = { result, version: nextVersion() };
  finalSnapshots.set(requestId, snapshot);
  liveSnapshots.delete(requestId);
  return { requestId, result };
}
function isSlashMessageDetails(value) {
  if (!value || typeof value !== "object") return false;
  const v = value;
  if (typeof v.requestId !== "string" || !v.requestId) return false;
  if (!v.result || !Array.isArray(v.result.content)) return false;
  return !!v.result.details && Array.isArray(v.result.details.results);
}
function resolveSlashMessageDetails(value) {
  return isSlashMessageDetails(value) ? value : void 0;
}
function getSlashRenderableSnapshot(details) {
  return finalSnapshots.get(details.requestId) ?? liveSnapshots.get(details.requestId) ?? { result: details.result, version: 0 };
}
function restoreSlashFinalSnapshots(entries) {
  liveSnapshots.clear();
  finalSnapshots.clear();
  for (const entry of entries) {
    const e = entry;
    if (e?.type !== "custom_message" || e.customType !== SLASH_RESULT_TYPE) continue;
    const details = resolveSlashMessageDetails(e.details);
    if (!details) continue;
    finalSnapshots.set(details.requestId, { result: details.result, version: nextVersion() });
  }
}
function clearSlashSnapshots() {
  liveSnapshots.clear();
  finalSnapshots.clear();
}

// src/slash/subagent-cost.ts
var SUBAGENT_COST_REPORT_VERSION = 1;
function emptyUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
}
function addUsage(target, source) {
  target.input += source.input;
  target.output += source.output;
  target.cacheRead += source.cacheRead;
  target.cacheWrite += source.cacheWrite;
  target.cost += source.cost;
  target.turns += source.turns;
}
function usageHasValue(usage) {
  return usage.input !== 0 || usage.output !== 0 || usage.cacheRead !== 0 || usage.cacheWrite !== 0 || usage.cost !== 0 || usage.turns !== 0;
}
function nonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function usageFromValue(value, turnsOverride) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const record = value;
  const costValue = typeof record.cost === "object" && record.cost !== null && !Array.isArray(record.cost) ? record.cost.total : record.cost;
  const turnsValue = turnsOverride ?? record.turns;
  const usage = {
    input: nonNegativeNumber(record.input) ?? 0,
    output: nonNegativeNumber(record.output) ?? 0,
    cacheRead: nonNegativeNumber(record.cacheRead) ?? 0,
    cacheWrite: nonNegativeNumber(record.cacheWrite) ?? 0,
    cost: nonNegativeNumber(costValue) ?? 0,
    turns: nonNegativeNumber(turnsValue) ?? 0
  };
  return Number.isSafeInteger(usage.turns) ? usage : void 0;
}
function assistantUsageFromMessage(message2) {
  if (!message2 || typeof message2 !== "object") return void 0;
  const msg = message2;
  return msg.role === "assistant" ? usageFromValue(msg.usage, 1) : void 0;
}
function compactionUsageFromEntry(entry) {
  if (!entry || typeof entry !== "object") return void 0;
  const record = entry;
  return record.type === "compaction" ? usageFromValue(record.usage, 0) : void 0;
}
var MAX_USAGE_METADATA_BYTES = 2 * 1024 * 1024;
function readUsageMetadata(metadataPath) {
  let fd;
  try {
    fd = fs9.openSync(metadataPath, "r");
    const stat = fs9.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_USAGE_METADATA_BYTES) return void 0;
    const buffer = Buffer.allocUnsafe(stat.size);
    let offset = 0;
    while (offset < buffer.length) {
      const bytesRead = fs9.readSync(fd, buffer, offset, buffer.length - offset, null);
      if (bytesRead <= 0) return void 0;
      offset += bytesRead;
    }
    const value = JSON.parse(buffer.toString("utf-8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
  } finally {
    if (fd !== void 0) fs9.closeSync(fd);
  }
}
function isSubagentDetails(value) {
  if (!value || typeof value !== "object") return false;
  const details = value;
  return typeof details.mode === "string" && Array.isArray(details.results);
}
function detailsFromSessionEntry(entry) {
  if (!entry || typeof entry !== "object") return void 0;
  const record = entry;
  if (record.type === "custom_message" && record.customType === SLASH_RESULT_TYPE) {
    const details = resolveSlashMessageDetails(record.details)?.result.details;
    return isSubagentDetails(details) ? details : void 0;
  }
  if (record.type !== "message" || !record.message || typeof record.message !== "object") return void 0;
  const message2 = record.message;
  if (message2.role !== "toolResult" || message2.toolName !== "subagent" && message2.toolName !== "bg_wait") return void 0;
  return isSubagentDetails(message2.details) ? message2.details : void 0;
}
function metadataUsage(artifactsDirs, input, indexes = [0, void 0]) {
  if (!/^[A-Za-z0-9._-]+$/.test(input.runId)) return void 0;
  for (const artifactsDir of artifactsDirs) {
    for (const index of indexes) {
      const metadataPath = getArtifactPaths(artifactsDir, input.runId, input.agent, index).metadataPath;
      try {
        const metadata = readUsageMetadata(metadataPath);
        if (!metadata) continue;
        if (metadata.runId !== input.runId || metadata.agent !== input.agent) continue;
        const usage = usageFromValue(metadata.usage);
        if (usage && usageHasValue(usage)) return usage;
      } catch (error) {
        if (error.code !== "ENOENT") console.error(`Failed to read subagent usage metadata '${metadataPath}':`, error);
      }
    }
  }
  return void 0;
}
function collectSubagentCost(ctx, state) {
  const parent = emptyUsage();
  const childTotal = emptyUsage();
  const total = emptyUsage();
  const children = [];
  const seenChildren = /* @__PURE__ */ new Set();
  const workflowRunIds = /* @__PURE__ */ new Set();
  const asyncRunIds = /* @__PURE__ */ new Set();
  const completedRunIds = /* @__PURE__ */ new Set();
  let unresolvedAsyncChildren = 0;
  const addChild = (input) => {
    if (!input.usage || !usageHasValue(input.usage)) return false;
    const identity = input.identity ?? (input.runId ? `run:${input.runId}` : input.sessionFile ? `session:${input.sessionFile}` : void 0);
    if (identity && seenChildren.has(identity)) return true;
    if (identity) seenChildren.add(identity);
    const usage = { ...input.usage };
    children.push({
      label: `Child ${children.length + 1} (${input.agent ?? "unknown"})`,
      ...input.agent ? { agent: input.agent } : {},
      ...input.runId ? { runId: input.runId } : {},
      usage,
      ...input.sessionFile ? { sessionFile: input.sessionFile } : {}
    });
    addUsage(childTotal, usage);
    return true;
  };
  for (const entry of ctx.sessionManager.getBranch()) {
    const message2 = entry.type === "message" ? entry.message : void 0;
    const parentUsage = assistantUsageFromMessage(message2) ?? compactionUsageFromEntry(entry);
    if (parentUsage) addUsage(parent, parentUsage);
    const details = detailsFromSessionEntry(entry);
    if (!details) continue;
    if (details.mode === "workflow" && details.runId && details.asyncId) workflowRunIds.add(details.runId);
    else if (details.asyncId && details.results.length === 0) asyncRunIds.add(details.asyncId);
    for (const result of details.results) {
      addChild({ agent: result.agent, runId: typeof result.runId === "string" ? result.runId : void 0, usage: usageFromValue(result.usage), sessionFile: result.sessionFile });
    }
    for (const completion of details.completions ?? []) {
      if (completion.mode === "workflow") workflowRunIds.add(completion.runId);
      completedRunIds.add(completion.runId);
      for (const result of completion.results ?? []) {
        addChild({ agent: result.agent, runId: result.runId, usage: usageFromValue(result.usage), sessionFile: result.sessionFile });
      }
    }
  }
  let sessionFile = null;
  try {
    sessionFile = ctx.sessionManager.getSessionFile() ?? null;
  } catch {
  }
  const artifactsDirs = /* @__PURE__ */ new Set();
  const addArtifactsDir = (cwd) => {
    try {
      artifactsDirs.add(getArtifactsDir(sessionFile, cwd, state.artifactDirPreference));
    } catch {
    }
  };
  addArtifactsDir(ctx.cwd);
  addArtifactsDir(state.baseCwd);
  for (const workflowRunId of workflowRunIds) {
    try {
      const status = readStatus(path8.join(DIRS.async, workflowRunId));
      addArtifactsDir(status?.cwd);
      const receipt = readWorkflowReceipt(DIRS.async, workflowRunId);
      const summaryChildren = new Map((receipt.workflowChildren?.children ?? []).map((child) => [child.childId, child]));
      const refsByRunId = /* @__PURE__ */ new Map();
      const addRef = (runId, agent) => {
        if (!runId) return;
        const existing = refsByRunId.get(runId);
        if (!existing || !existing.agent && agent) refsByRunId.set(runId, { runId, ...agent ? { agent } : {} });
      };
      for (const [key, entry] of Object.entries(receipt.entries)) {
        const summaryChild = summaryChildren.get(key);
        const runIds = entry.continuation?.runIds?.length ? entry.continuation.runIds : entry.latestRunId ? [entry.latestRunId] : summaryChild?.runId ? [summaryChild.runId] : [];
        for (const runId of runIds) addRef(runId, entry.agent ?? summaryChild?.agent);
      }
      for (const child of receipt.workflowChildren?.children ?? []) {
        if (!Object.hasOwn(receipt.entries, child.childId)) addRef(child.runId, child.agent);
      }
      for (const ref of refsByRunId.values()) {
        if (seenChildren.has(`run:${ref.runId}`)) continue;
        if (!ref.agent) {
          unresolvedAsyncChildren += 1;
          continue;
        }
        const usage = metadataUsage([...artifactsDirs], { runId: ref.runId, agent: ref.agent });
        if (!usage || !addChild({ ...ref, usage })) unresolvedAsyncChildren += 1;
      }
    } catch (error) {
      unresolvedAsyncChildren += 1;
      const missing = error.code === "ENOENT" || error.cause?.code === "ENOENT";
      if (!missing) console.error(`Failed to resolve async subagent usage for '${workflowRunId}':`, error);
    }
  }
  for (const asyncRunId of asyncRunIds) {
    if (completedRunIds.has(asyncRunId)) continue;
    try {
      const status = readStatus(path8.join(DIRS.async, asyncRunId));
      if (!status?.steps?.length) {
        unresolvedAsyncChildren += 1;
        continue;
      }
      addArtifactsDir(status.cwd);
      const steps = status.steps;
      steps.forEach((step, index) => {
        const flatIndex = steps.length > 1 ? index : void 0;
        const usage = metadataUsage([...artifactsDirs], { runId: asyncRunId, agent: step.agent }, flatIndex === void 0 ? [void 0, 0] : [flatIndex]);
        const identity = flatIndex === void 0 ? `run:${asyncRunId}` : `run:${asyncRunId}:${flatIndex}`;
        const settled = step.status !== "pending" && step.status !== "running";
        if (!addChild({ agent: step.agent, runId: asyncRunId, identity, usage }) && settled) unresolvedAsyncChildren += 1;
      });
    } catch (error) {
      unresolvedAsyncChildren += 1;
      if (error.code !== "ENOENT") console.error(`Failed to resolve async subagent usage for '${asyncRunId}':`, error);
    }
  }
  addUsage(total, parent);
  addUsage(total, childTotal);
  return { version: SUBAGENT_COST_REPORT_VERSION, parent, children, childTotal, total, unresolvedAsyncChildren };
}
function formatCostUsage(label, usage) {
  const extras = [
    usage.cacheRead ? `cache read ${formatTokens(usage.cacheRead)}` : "",
    usage.cacheWrite ? `cache write ${formatTokens(usage.cacheWrite)}` : "",
    usage.turns ? `${usage.turns} turn${usage.turns === 1 ? "" : "s"}` : ""
  ].filter(Boolean);
  return `${label}: \u2191${formatTokens(usage.input)} \u2193${formatTokens(usage.output)} $${usage.cost.toFixed(4)}${extras.length ? ` (${extras.join(", ")})` : ""}`;
}
function formatSubagentCostReport(report) {
  const lines = [
    "Subagent cost",
    "",
    formatCostUsage("Parent", report.parent)
  ];
  if (report.children.length === 0) {
    lines.push("No subagent child usage found in this session.");
  } else {
    for (const child of report.children) {
      lines.push(formatCostUsage(child.label, child.usage));
      if (child.sessionFile) lines.push(`  Session: ${child.sessionFile}`);
    }
  }
  if (report.unresolvedAsyncChildren > 0) lines.push(`Async child usage unavailable: ${report.unresolvedAsyncChildren}.`);
  lines.push("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500", formatCostUsage("Children", report.childTotal), formatCostUsage("Total", report.total));
  return lines.join("\n");
}

// src/slash/subagents-admin.ts
import * as fs10 from "node:fs";
import * as path9 from "node:path";

// src/slash/selector.ts
import { DynamicBorder, keyHint, rawKeyHint } from "@earendil-works/pi-coding-agent";
import { Container, fuzzyFilter, Input, Spacer, Text } from "@earendil-works/pi-tui";
var MAX_VISIBLE = 10;
var SelectorComponent = class extends Container {
  tui;
  theme;
  keybindings;
  items;
  done;
  searchInput;
  listContainer;
  filtered;
  selectedIndex = 0;
  constructor(tui, theme, keybindings, options) {
    super();
    this.tui = tui;
    this.theme = theme;
    this.keybindings = keybindings;
    this.items = options.items;
    this.done = options.done;
    this.filtered = [...this.items];
    const border = () => new DynamicBorder((str) => theme.fg("border", str));
    this.addChild(border());
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("accent", theme.bold(options.title)), 0, 0));
    if (options.subtitle) this.addChild(new Text(theme.fg("muted", options.subtitle), 0, 0));
    this.addChild(new Spacer(1));
    this.searchInput = new Input();
    this.searchInput.focused = true;
    this.searchInput.onSubmit = () => this.confirmSelection();
    this.addChild(this.searchInput);
    this.addChild(new Spacer(1));
    this.listContainer = new Container();
    this.addChild(this.listContainer);
    this.addChild(new Spacer(1));
    this.addChild(new Text(rawKeyHint("\u2191\u2193", "navigate") + "  " + keyHint("tui.select.confirm", "select") + "  " + keyHint("tui.select.cancel", "cancel"), 0, 0));
    this.addChild(new Spacer(1));
    this.addChild(border());
    const currentIndex = this.filtered.findIndex((item) => item.current);
    if (currentIndex >= 0) this.selectedIndex = currentIndex;
    this.updateList();
  }
  applyFilter(query) {
    const previous = this.filtered[this.selectedIndex]?.value;
    this.filtered = query ? fuzzyFilter(this.items, query, (item) => `${item.label} ${item.value} ${item.badge ?? ""}`) : [...this.items];
    const keepIndex = this.filtered.findIndex((item) => item.value === previous);
    this.selectedIndex = keepIndex >= 0 ? keepIndex : Math.min(this.selectedIndex, Math.max(0, this.filtered.length - 1));
    this.updateList();
  }
  updateList() {
    const th = this.theme;
    this.listContainer.clear();
    const startIndex = Math.max(0, Math.min(this.selectedIndex - Math.floor(MAX_VISIBLE / 2), this.filtered.length - MAX_VISIBLE));
    const endIndex = Math.min(startIndex + MAX_VISIBLE, this.filtered.length);
    for (let i = startIndex; i < endIndex; i++) {
      const item = this.filtered[i];
      const isSelected = i === this.selectedIndex;
      const badge = item.badge ? ` ${th.fg("muted", `[${item.badge}]`)}` : "";
      const checkmark = item.current ? th.fg("success", " \u2713") : "";
      const line = isSelected ? `${th.fg("accent", "\u2192 ")}${th.fg("accent", item.label)}${badge}${checkmark}` : `  ${item.label}${badge}${checkmark}`;
      this.listContainer.addChild(new Text(line, 0, 0));
    }
    if (startIndex > 0 || endIndex < this.filtered.length) {
      this.listContainer.addChild(new Text(th.fg("muted", `  (${this.selectedIndex + 1}/${this.filtered.length})`), 0, 0));
    }
    if (this.filtered.length === 0) {
      this.listContainer.addChild(new Text(th.fg("muted", "  No matching entries"), 0, 0));
    }
  }
  confirmSelection() {
    const selected = this.filtered[this.selectedIndex];
    this.done(selected ? { confirmed: true, value: selected.value } : { confirmed: false });
  }
  handleInput(keyData) {
    const kb = this.keybindings;
    if (kb.matches(keyData, "tui.select.up")) {
      if (this.filtered.length === 0) return;
      this.selectedIndex = this.selectedIndex === 0 ? this.filtered.length - 1 : this.selectedIndex - 1;
      this.updateList();
      this.tui.requestRender();
    } else if (kb.matches(keyData, "tui.select.down")) {
      if (this.filtered.length === 0) return;
      this.selectedIndex = this.selectedIndex === this.filtered.length - 1 ? 0 : this.selectedIndex + 1;
      this.updateList();
      this.tui.requestRender();
    } else if (kb.matches(keyData, "tui.select.confirm")) {
      this.confirmSelection();
    } else if (kb.matches(keyData, "tui.select.cancel")) {
      this.done({ confirmed: false });
    } else {
      this.searchInput.handleInput(keyData);
      this.applyFilter(this.searchInput.getValue());
      this.tui.requestRender();
    }
  }
};

// src/slash/subagents-admin.ts
var ADMIN_MESSAGE_TYPE = "subagents-admin";
var INHERIT_MODEL_CHOICE = "Default / inherit session model";
var INHERIT_THINKING_CHOICE = "Default / inherit session thinking";
function sourceRank(source) {
  if (source === "project") return 0;
  if (source === "user") return 1;
  if (source === "package") return 2;
  return 3;
}
function allVisibleAgents(pi, cwd, preferredModelProvider) {
  const d = discoverAgentsAll(cwd, preferredModelProvider);
  const allConfigured = [...d.project, ...d.user, ...d.package, ...d.builtin];
  const visibleConfigured = allConfigured.filter((agent) => !agent.disabled);
  const agents = mergeRuntimeAgents(pi, { agents: visibleConfigured }, allConfigured, { cwd, scope: "both", preferredModelProvider }).agents;
  return agents.sort((a, b) => a.name.localeCompare(b.name) || sourceRank(a.source) - sourceRank(b.source));
}
function agentLabel(agent) {
  const model = agent.model ? ` \xB7 ${agent.model}` : "";
  return `${agent.name} [${agent.source}]${model} \u2014 ${agent.description}`;
}
function agentChoices(agents) {
  const labels = agents.map(agentLabel);
  const counts = /* @__PURE__ */ new Map();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return new Map(agents.map((agent, index) => {
    const label = labels[index];
    return [counts.get(label) === 1 ? label : `${label} \xB7 ${agent.filePath}`, agent];
  }));
}
function agentSelectItems(byLabel) {
  return [...byLabel.keys()].map((label) => ({ value: label, label }));
}
function agentMatches(agent, rawName) {
  const name = rawName.trim();
  return agent.name === name || frontmatterNameForConfig(agent) === name;
}
function sendAdminMessage(pi, content) {
  pi.sendMessage({
    customType: ADMIN_MESSAGE_TYPE,
    content,
    display: true
  });
}
function modelFullId(model) {
  return `${model.provider}/${model.id}`;
}
async function liveAvailableModels(ctx) {
  try {
    const result = await ctx.modelRegistry.refresh?.({ allowNetwork: false, signal: AbortSignal.timeout(5e3) });
    const firstError = result?.errors.entries().next().value;
    if (firstError) {
      ctx.ui.notify(`Could not refresh ${firstError[0]}; using the currently loaded choices. ${firstError[1].message}`, "warning");
    } else if (result?.aborted) {
      ctx.ui.notify("Model registry refresh timed out; using the currently loaded choices.", "warning");
    }
  } catch (error) {
    const message2 = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Could not refresh the model registry; using the last loaded choices. ${message2}`, "warning");
  }
  return ctx.modelRegistry.getAvailable();
}
function buildBuiltinBase(agent) {
  return {
    ...agent.model !== void 0 ? { model: agent.model } : {},
    ...agent.thinking !== void 0 ? { thinking: agent.thinking } : {},
    systemPromptMode: agent.systemPromptMode,
    inheritProjectContext: agent.inheritProjectContext,
    inheritGlobalContext: agent.inheritGlobalContext,
    inheritSkills: agent.inheritSkills,
    ...agent.defaultContext !== void 0 ? { defaultContext: agent.defaultContext } : {},
    ...agent.acceptanceRole !== void 0 ? { acceptanceRole: agent.acceptanceRole } : {},
    ...agent.disabled !== void 0 ? { disabled: agent.disabled } : {},
    systemPrompt: agent.systemPrompt,
    ...agent.skills !== void 0 ? { skills: [...agent.skills] } : {},
    ...agent.tools !== void 0 ? { tools: [...agent.tools] } : {},
    ...agent.excludeTools !== void 0 ? { excludeTools: [...agent.excludeTools] } : {},
    ...agent.mcpDirectTools !== void 0 ? { mcpDirectTools: [...agent.mcpDirectTools] } : {},
    ...agent.subagentOnlyExtensions !== void 0 ? { subagentOnlyExtensions: [...agent.subagentOnlyExtensions] } : {},
    ...agent.mutationTools !== void 0 ? { mutationTools: [...agent.mutationTools] } : {},
    ...agent.toolBudget !== void 0 ? { toolBudget: agent.toolBudget } : {}
  };
}
function savesThroughSettings(agent, field) {
  if (agent.source === "builtin") return true;
  if (agent.source === "package") return true;
  if (!agent.override) return false;
  if (agent.override.fields?.includes(field) === true) return true;
  if (agent.source !== agent.override.scope) return false;
  return agent[field] !== agent.override.base[field];
}
function isReadOnlyExtraAgent(agent) {
  const configured = process.env[EXTRA_AGENT_DIRS_ENV];
  if (!configured || agent.source !== "user") return false;
  const filePath = path9.resolve(agent.filePath);
  return configured.split(path9.delimiter).map((dir) => dir.trim()).filter(Boolean).some((dir) => {
    const root = path9.resolve(dir);
    const relative2 = path9.relative(root, filePath);
    return relative2 !== "" && relative2 !== ".." && !relative2.startsWith(`..${path9.sep}`) && !path9.isAbsolute(relative2);
  });
}
function readOnlyAgentMessage(agent, field) {
  if (agent.source === "runtime") {
    return `Cannot update '${agent.name}' ${field} because that agent is runtime-registered by an extension; edit its source definition instead.`;
  }
  if (agent.source === "package") {
    return `Cannot update '${agent.name}' ${field} because that field is owned by its read-only package definition.`;
  }
  return isReadOnlyExtraAgent(agent) ? `Cannot update '${agent.name}' because its definition in PI_SUBAGENT_EXTRA_AGENT_DIRS is read-only.` : void 0;
}
async function selectAgent(pi, ctx, args) {
  const agents = allVisibleAgents(pi, ctx.cwd, ctx.model?.provider);
  const requestedName = args.trim().split(/\s+/)[0] ?? "";
  if (agents.length === 0) return { kind: "not-found", agents, requestedName: requestedName || void 0 };
  if (requestedName) {
    const matches = agents.filter((agent) => agentMatches(agent, requestedName));
    if (matches.length === 1) return { kind: "selected", agent: matches[0] };
    if (matches.length > 1 && !ctx.hasUI) return { kind: "ambiguous", requestedName, matches };
    if (matches.length > 1) {
      const byLabel2 = agentChoices(matches);
      const choice2 = await selectFromList(ctx, `Multiple subagents named '${requestedName}'`, void 0, agentSelectItems(byLabel2));
      return choice2 ? { kind: "selected", agent: byLabel2.get(choice2) } : { kind: "cancelled" };
    }
    return { kind: "not-found", agents, requestedName };
  }
  if (!ctx.hasUI) return { kind: "not-found", agents };
  const byLabel = agentChoices(agents);
  const choice = await selectFromList(ctx, "Select subagent", void 0, agentSelectItems(byLabel));
  return choice ? { kind: "selected", agent: byLabel.get(choice) } : { kind: "cancelled" };
}
function metadataFor(agent) {
  const tools = [...agent.tools ?? [], ...(agent.mcpDirectTools ?? []).map((tool) => `mcp:${tool}`)];
  const lines = [
    `Agent: ${agent.name} (${agent.source})`,
    `Path: ${agent.filePath}`,
    `Description: ${agent.description}`
  ];
  if (agent.packageName) {
    lines.push(`Local name: ${frontmatterNameForConfig(agent)}`);
    lines.push(`Package: ${agent.packageName}`);
  }
  lines.push(`Model: ${agent.model ?? "default / inherit"}`);
  if (agent.thinking !== void 0) lines.push(`Thinking: ${agent.thinking === false ? "off" : agent.thinking}`);
  if (tools.length) lines.push(`Tools: ${tools.join(", ")}`);
  if (agent.excludeTools?.length) lines.push(`Excluded tools: ${agent.excludeTools.join(", ")}`);
  if (agent.skills?.length) lines.push(`Skills: ${agent.skills.join(", ")}`);
  lines.push(`System prompt mode: ${agent.systemPromptMode}`);
  lines.push(`Inherit project context: ${agent.inheritProjectContext ? "true" : "false"}`);
  lines.push(`Inherit global context: ${agent.inheritGlobalContext ? "true" : "false"}`);
  lines.push(`Inherit skills: ${agent.inheritSkills ? "true" : "false"}`);
  if (agent.defaultContext) lines.push(`Default context: ${agent.defaultContext}`);
  if (agent.output) lines.push(`Output: ${agent.output}`);
  if (agent.defaultReads?.length) lines.push(`Reads: ${agent.defaultReads.join(", ")}`);
  if (agent.defaultProgress) lines.push("Progress: true");
  if (agent.maxSubagentDepth !== void 0) lines.push(`Max subagent depth: ${agent.maxSubagentDepth}`);
  if (agent.source === "builtin") lines.push(`Disabled: ${agent.disabled ? "true" : "false"}`);
  if (agent.override) lines.push(`Override: ${agent.override.scope} (${agent.override.path})`);
  if (agent.systemPrompt.trim()) lines.push("", "System Prompt:", agent.systemPrompt);
  return lines.join("\n");
}
async function selectFromList(ctx, title, subtitle, items) {
  if (canRenderComponents(ctx)) {
    const result = await ctx.ui.custom(
      (tui, theme, kb, done) => new SelectorComponent(tui, theme, kb, { title, subtitle, items, done }),
      { overlay: false }
    );
    return result?.confirmed ? result.value : void 0;
  }
  const flatTitle = subtitle ? `${title}
Current: ${subtitle}` : title;
  const labelToValue = new Map(items.map((item) => [item.label, item.value]));
  const choice = await ctx.ui.select(flatTitle, items.map((item) => item.value));
  return choice ? items.find((item) => item.value === choice)?.value ?? labelToValue.get(choice) : void 0;
}
async function chooseModel(ctx, agent) {
  const models = await liveAvailableModels(ctx);
  const current = agent.model ?? INHERIT_MODEL_CHOICE;
  const items = [{ value: INHERIT_MODEL_CHOICE, label: INHERIT_MODEL_CHOICE, current: !agent.model }];
  if (agent.model && !models.some((model) => modelFullId(model) === agent.model)) {
    items.push({ value: agent.model, label: agent.model, current: true });
  }
  for (const model of models) {
    const fullId = modelFullId(model);
    items.push({ value: fullId, label: model.id, badge: model.provider, current: fullId === agent.model });
  }
  const choice = await selectFromList(ctx, `Select model for ${agent.name}`, current, items);
  if (choice === void 0) return null;
  return choice === INHERIT_MODEL_CHOICE ? void 0 : choice;
}
async function chooseThinking(ctx, agent) {
  const availableModels = (await liveAvailableModels(ctx)).map(toModelInfo);
  const effectiveModel = agent.model ?? (ctx.model ? modelFullId(ctx.model) : void 0);
  const modelInfo = findModelInfo(effectiveModel, availableModels, ctx.model?.provider);
  const levels = getSupportedThinkingLevels(modelInfo);
  const current = agent.thinking === false ? "off" : agent.thinking ?? INHERIT_THINKING_CHOICE;
  const values = [INHERIT_THINKING_CHOICE, ...levels];
  if (current !== INHERIT_THINKING_CHOICE && !values.includes(current)) values.splice(1, 0, current);
  const modelNote = agent.model ? `Model: ${agent.model}` : effectiveModel ? `Session model: ${effectiveModel}` : "Model: default / inherit";
  const items = values.map((value) => ({ value, label: value, current: value === current }));
  const choice = await selectFromList(ctx, `Select thinking level for ${agent.name}`, `${modelNote} \xB7 ${current}`, items);
  if (choice === void 0) return null;
  return choice === INHERIT_THINKING_CHOICE ? void 0 : choice;
}
async function chooseOverrideScope(ctx, agent) {
  const d = discoverAgentsAll(ctx.cwd);
  if (agent.override?.scope) {
    return agent.source === "project" && agent.override.scope === "user" && d.projectSettingsPath ? "project" : agent.override.scope;
  }
  if (!d.projectSettingsPath || !ctx.hasUI) return "user";
  const choice = await ctx.ui.select(`Save subagent override for ${agent.name}`, ["user", "project"]);
  return choice === "user" || choice === "project" ? choice : void 0;
}
function persistSettingsField(ctx, agent, scope, field, value) {
  const base = agent.override?.base ?? buildBuiltinBase(agent);
  const shadowsLowerScope = scope === "project" && agent.override?.fieldScopes?.[field]?.includes("user") === true;
  if (shadowsLowerScope && (value === void 0 || value === base[field])) {
    const filePath = field === "model" ? mergeBuiltinAgentOverride(ctx.cwd, agent.name, scope, { model: value ?? base.model ?? false }) : field === "thinking" ? mergeBuiltinAgentOverride(ctx.cwd, agent.name, scope, { thinking: value ?? (base.thinking === false ? "off" : base.thinking) ?? false }) : mergeBuiltinAgentOverride(ctx.cwd, agent.name, scope, { systemPrompt: value ?? base.systemPrompt });
    return {
      filePath,
      overridden: true
    };
  }
  if (value === void 0 || value === base[field]) {
    return {
      filePath: removeBuiltinAgentOverrideFields(ctx.cwd, agent.name, scope, [field]).path,
      overridden: false
    };
  }
  return {
    filePath: mergeBuiltinAgentOverride(ctx.cwd, agent.name, scope, { [field]: value }),
    overridden: true
  };
}
async function saveAgentModel(ctx, agent, selectedModel) {
  if (savesThroughSettings(agent, "model")) {
    const scope = await chooseOverrideScope(ctx, agent);
    if (!scope) return null;
    const { filePath, overridden } = persistSettingsField(ctx, agent, scope, "model", selectedModel);
    return overridden ? `Saved ${scope} settings override for '${agent.name}' with model '${selectedModel}' in ${filePath}.` : `Cleared model settings override for '${agent.name}' in ${filePath}.`;
  }
  const readOnlyMessage = readOnlyAgentMessage(agent, "model");
  if (readOnlyMessage) return readOnlyMessage;
  const updated = editableAgentConfig(agent);
  if (selectedModel === void 0) delete updated.model;
  else updated.model = selectedModel;
  fs10.writeFileSync(updated.filePath, serializeAgent(updated, {
    preserveFrontmatterFields: preservedAgentFrontmatterFields(agent, { model: selectedModel })
  }), "utf-8");
  return selectedModel ? `Updated '${agent.name}' model to '${selectedModel}' in ${updated.filePath}.` : `Cleared '${agent.name}' model in ${updated.filePath}.`;
}
async function saveAgentThinking(ctx, agent, selectedThinking) {
  if (savesThroughSettings(agent, "thinking")) {
    const scope = await chooseOverrideScope(ctx, agent);
    if (!scope) return null;
    const { filePath, overridden } = persistSettingsField(ctx, agent, scope, "thinking", selectedThinking);
    return overridden ? `Saved ${scope} settings override for '${agent.name}' with thinking '${selectedThinking}' in ${filePath}.` : `Cleared thinking settings override for '${agent.name}' in ${filePath}.`;
  }
  const readOnlyMessage = readOnlyAgentMessage(agent, "thinking");
  if (readOnlyMessage) return readOnlyMessage;
  const updated = editableAgentConfig(agent);
  if (selectedThinking === void 0) delete updated.thinking;
  else updated.thinking = selectedThinking;
  fs10.writeFileSync(updated.filePath, serializeAgent(updated, {
    preserveFrontmatterFields: preservedAgentFrontmatterFields(agent, { thinking: selectedThinking })
  }), "utf-8");
  return selectedThinking ? `Updated '${agent.name}' thinking to '${selectedThinking}' in ${updated.filePath}.` : `Cleared '${agent.name}' thinking in ${updated.filePath}.`;
}
function metadataSummary(agent) {
  return [
    `Source: ${agent.source}`,
    `Model: ${agent.model ?? "default / inherit"}`,
    `Thinking: ${agent.thinking === false ? "off" : agent.thinking ?? "default / inherit"}`
  ].join(" \xB7 ");
}
async function saveAgentSystemPrompt(ctx, agent, systemPrompt) {
  const nextPrompt = systemPrompt.replace(/\s+$/, "");
  if (savesThroughSettings(agent, "systemPrompt")) {
    const scope = await chooseOverrideScope(ctx, agent);
    if (!scope) return null;
    const { filePath, overridden } = persistSettingsField(ctx, agent, scope, "systemPrompt", nextPrompt);
    return overridden ? `Saved ${scope} settings override for '${agent.name}' system prompt in ${filePath}.` : `Cleared system prompt settings override for '${agent.name}' in ${filePath}.`;
  }
  const readOnlyMessage = readOnlyAgentMessage(agent, "systemPrompt");
  if (readOnlyMessage) return readOnlyMessage;
  const updated = { ...editableAgentConfig(agent), systemPrompt: nextPrompt };
  fs10.writeFileSync(updated.filePath, serializeAgent(updated, {
    preserveFrontmatterFields: preservedAgentFrontmatterFields(agent, { systemPrompt: nextPrompt })
  }), "utf-8");
  return `Updated '${agent.name}' system prompt in ${updated.filePath}.`;
}
async function editSystemPrompt(ctx, agent) {
  const saveThroughSettings = savesThroughSettings(agent, "systemPrompt");
  if (!saveThroughSettings) {
    const readOnlyMessage = readOnlyAgentMessage(agent, "systemPrompt");
    if (readOnlyMessage) return readOnlyMessage;
  }
  const edited = await ctx.ui.editor(`Edit '${agent.name}' system prompt`, agent.systemPrompt ?? "");
  if (edited === void 0) return null;
  const projectOwnsLowerScopeOverride = agent.source === "project" && agent.override?.scope === "user" && discoverAgentsAll(ctx.cwd).projectSettingsPath;
  if (edited.replace(/\s+$/, "") === (agent.systemPrompt ?? "").replace(/\s+$/, "") && !(saveThroughSettings && projectOwnsLowerScopeOverride)) {
    return `System prompt for '${agent.name}' left unchanged.`;
  }
  return saveAgentSystemPrompt(ctx, agent, edited);
}
async function openSubagentsAdmin(pi, ctx, args = "") {
  const selection = await selectAgent(pi, ctx, args);
  if (selection.kind === "cancelled") return;
  if (selection.kind === "ambiguous") {
    sendAdminMessage(pi, `Subagent '${selection.requestedName}' is ambiguous. Choose a scope in interactive mode:
${selection.matches.map((agent2) => `- ${agent2.source}: ${agent2.filePath}`).join("\n")}`);
    return;
  }
  if (selection.kind === "not-found") {
    const text = selection.requestedName ? `Subagent '${selection.requestedName}' not found.

Available subagents:
${selection.agents.map((agent2) => `- ${agent2.name} (${agent2.source})`).join("\n") || "- (none)"}` : `Available subagents:
${selection.agents.map((agent2) => `- ${agent2.name} (${agent2.source})`).join("\n") || "- (none)"}`;
    sendAdminMessage(pi, text);
    return;
  }
  const agent = selection.agent;
  if (!ctx.hasUI) {
    sendAdminMessage(pi, metadataFor(agent));
    return;
  }
  const requestedAction = args.trim().split(/\s+/)[1]?.toLowerCase();
  let action;
  if (requestedAction === "model") action = "Change model";
  else if (requestedAction === "thinking") action = "Change thinking level";
  else if (requestedAction === "prompt" || requestedAction === "system-prompt" || requestedAction === "edit") action = "Edit system prompt";
  else if (requestedAction === "details" || requestedAction === "info") action = "Show details";
  if (!action) {
    action = await ctx.ui.select(
      `Administer ${agent.name}
${metadataSummary(agent)}`,
      ["Change model", "Change thinking level", "Edit system prompt", "Show details", "Done"]
    );
  }
  try {
    if (action === "Change model") {
      const selectedModel = await chooseModel(ctx, agent);
      if (selectedModel === null) return;
      const message2 = await saveAgentModel(ctx, agent, selectedModel);
      if (message2 === null) return;
      ctx.ui.notify(message2, "info");
      sendAdminMessage(pi, message2);
    } else if (action === "Change thinking level") {
      const selectedThinking = await chooseThinking(ctx, agent);
      if (selectedThinking === null) return;
      const message2 = await saveAgentThinking(ctx, agent, selectedThinking);
      if (message2 === null) return;
      ctx.ui.notify(message2, "info");
      sendAdminMessage(pi, message2);
    } else if (action === "Edit system prompt") {
      const message2 = await editSystemPrompt(ctx, agent);
      if (message2 === null) return;
      ctx.ui.notify(message2, "info");
      sendAdminMessage(pi, message2);
    } else if (action === "Show details") {
      sendAdminMessage(pi, metadataFor(agent));
    }
  } catch (error) {
    const message2 = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(message2, "error");
    sendAdminMessage(pi, `Failed to update '${agent.name}': ${message2}`);
  }
}

// src/slash/slash-commands.ts
var parseInlineConfig = (raw) => {
  const config = {};
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    switch (key) {
      case "output":
        config.output = val === "false" ? false : val;
        break;
      case "outputMode":
        if (val === "inline" || val === "file-only") config.outputMode = val;
        break;
      case "reads":
        config.reads = val === "false" ? false : val.split("+").filter(Boolean);
        break;
      case "model":
        config.model = val || void 0;
        break;
      case "skill":
      case "skills":
        config.skill = val === "false" ? false : val.split("+").filter(Boolean);
        break;
    }
  }
  return config;
};
var parseAgentToken = (token) => {
  const bracket = token.indexOf("[");
  if (bracket === -1) return { name: token, config: {} };
  const end = token.lastIndexOf("]");
  return { name: token.slice(0, bracket), config: parseInlineConfig(token.slice(bracket + 1, end !== -1 ? end : void 0)) };
};
var extractExecutionFlags = (rawArgs) => {
  let args = rawArgs.trim();
  let bg = false;
  let fork = false;
  while (true) {
    if (args.endsWith(" --bg") || args === "--bg") {
      bg = true;
      args = args === "--bg" ? "" : args.slice(0, -5).trim();
      continue;
    }
    if (args.endsWith(" --fork") || args === "--fork") {
      fork = true;
      args = args === "--fork" ? "" : args.slice(0, -7).trim();
      continue;
    }
    break;
  }
  return { args, bg, fork };
};
function discoverSlashAgents(pi, cwd, scope) {
  if (listRuntimeAgentConfigs(pi).length === 0) {
    const discovered2 = discoverAgents(cwd, scope);
    return { ...discovered2, unknownAgentDiagnosticContext: unknownAgentDiagnosticContext(discovered2) };
  }
  const snapshot = discoverAgentSnapshot(cwd, scope, void 0, { includeChains: false });
  const discovered = snapshot.effective;
  const all = snapshot.all;
  const configuredAgents = [
    ...all.builtin,
    ...all.package,
    ...scope !== "project" ? all.user : [],
    ...scope !== "user" ? all.project : []
  ];
  const merged = mergeRuntimeAgents(pi, discovered, configuredAgents, { cwd, scope });
  return { ...merged, unknownAgentDiagnosticContext: { ...unknownAgentDiagnosticContext(discovered), agents: merged.agents } };
}
var makeAgentCompletions = (pi, state) => (prefix) => {
  if (!state.baseCwd || prefix.includes(" ")) return null;
  return discoverSlashAgents(pi, state.baseCwd, "both").agents.filter((agent) => agent.name.startsWith(prefix)).map((agent) => ({ value: agent.name, label: agent.name }));
};
var makeProviderCompletions = (state) => (prefix) => {
  if (prefix.includes(" ")) return null;
  const available = state.lastUiContext?.modelRegistry?.getAvailable?.();
  if (!Array.isArray(available)) return null;
  const providers = [...new Set(available.map((model) => typeof model?.provider === "string" ? model.provider : "").filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return providers.filter((provider) => provider.startsWith(prefix)).map((provider) => ({ value: provider, label: provider }));
};
function sendSlashText(pi, text) {
  pi.sendMessage({ customType: SLASH_TEXT_RESULT_TYPE, content: text, display: true, details: SLASH_TEXT_VIEW_ONLY_DETAILS });
}
async function withSlashStatus(ctx, text, run) {
  if (ctx.hasUI) ctx.ui.setStatus("subagent-slash-text", text);
  try {
    return await run();
  } finally {
    if (ctx.hasUI) ctx.ui.setStatus("subagent-slash-text", void 0);
  }
}
function commandForTarget(target) {
  return target.kind === "scheduled" ? `subagent({ action: "schedule.pause", id: ${JSON.stringify(target.id)} })` : `subagent({ action: "stop", id: ${JSON.stringify(target.id)} })`;
}
function formatAsyncStopTarget(run) {
  const progress = formatAsyncRunProgressLabel(run);
  const cwd = run.cwd ? shortenPath(run.cwd) : shortenPath(run.asyncDir);
  return {
    kind: "async",
    id: run.id,
    label: `${run.id} \xB7 ${run.mode} \xB7 ${progress}`,
    detail: `${run.state} \xB7 ${cwd}`,
    actionLabel: "stop async run"
  };
}
function scheduledStopTargets(ctx, _state) {
  try {
    return listScheduledRunSummaries(ctx.cwd).filter((schedule) => !schedule.paused && !schedule.activeRunId && schedule.trigger.nextRunAt).sort((left, right) => left.trigger.nextRunAt.localeCompare(right.trigger.nextRunAt)).map((schedule) => ({
      kind: "scheduled",
      id: schedule.id,
      label: `${schedule.id} \xB7 ${schedule.name}`,
      detail: `scheduled \xB7 ${schedule.trigger.nextRunAt}`,
      actionLabel: "pause schedule"
    }));
  } catch {
    return [];
  }
}
function discoverStopTargets(ctx, state) {
  const sessionId = state.currentSessionId ?? ctx.sessionManager.getSessionId() ?? void 0;
  const asyncTargets = listAsyncRuns(DIRS.async, {
    states: ["queued", "running"],
    ...sessionId ? { sessionId } : {}
  }).map(formatAsyncStopTarget);
  return [...asyncTargets, ...scheduledStopTargets(ctx, state)];
}
function stopFallbackText(targets) {
  if (targets.length === 0) return "No active current-session async runs or scheduled subagent runs to stop.";
  const lines = ["Subagent stop targets:", ""];
  for (const target of targets) {
    lines.push(`- ${target.label}`);
    lines.push(`  ${target.detail}`);
    lines.push(`  ${target.actionLabel}: ${commandForTarget(target)}`);
    if (target.kind === "async") lines.push(`  slash: /subagents-stop ${target.id}`);
  }
  return lines.join("\n");
}
function stopPickerTargets(targets) {
  const ids = targets.filter((target) => target.kind === "async").map((target) => target.id);
  if (ids.length < 2) return targets;
  return [{ kind: "all", ids, label: `${ids.length} async runs`, detail: ids.join(", "), actionLabel: "stop all" }, ...targets];
}
function selectForegroundDetachControl(state, requested) {
  const controls = [...state.foregroundControls.values()];
  if (requested) {
    const matches = controls.filter((control) => control.runId === requested || control.runId.startsWith(requested));
    if (matches.length > 1) throw new Error(`Ambiguous foreground run id prefix '${requested}' matched: ${matches.map((control) => control.runId).join(", ")}. Provide a longer id.`);
    return matches[0];
  }
  const singleControls = controls.filter((control) => control.mode === "single");
  if (state.lastForegroundControlId) {
    const latest = state.foregroundControls.get(state.lastForegroundControlId);
    if (latest?.mode === "single") return latest;
  }
  return singleControls.sort((left, right) => right.updatedAt - left.updatedAt)[0];
}
var SubagentsStopSelector = class {
  width = 84;
  selected = 0;
  confirming = false;
  tui;
  theme;
  targets;
  done;
  constructor(tui, theme, targets, done) {
    this.tui = tui;
    this.theme = theme;
    this.targets = targets;
    this.done = done;
  }
  handleInput(data) {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.done({ confirmed: false });
      return;
    }
    if (this.confirming) {
      if (matchesKey(data, "return") || data.toLowerCase() === "y") {
        this.done({ confirmed: true, target: this.targets[this.selected] });
        return;
      }
      if (data.toLowerCase() === "n" || matchesKey(data, "backspace")) {
        this.confirming = false;
        this.tui.requestRender();
      }
      return;
    }
    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      this.selected = Math.max(0, this.selected - 1);
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "down") || matchesKey(data, "j")) {
      this.selected = Math.min(this.targets.length - 1, this.selected + 1);
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "return")) {
      this.confirming = true;
      this.tui.requestRender();
    }
  }
  invalidate() {
  }
  render(width) {
    const contentWidth = Math.max(0, Math.min(this.width, Math.floor(width)));
    const lines = [this.theme.bold("Stop subagent run"), this.theme.fg("dim", "Select a current-session async run to stop, or a scheduled run to cancel."), ""];
    const maxRows = 10;
    const start = Math.max(0, Math.min(this.selected - maxRows + 1, Math.max(0, this.targets.length - maxRows)));
    for (let index = start; index < Math.min(this.targets.length, start + maxRows); index++) {
      const target = this.targets[index];
      const selected = index === this.selected;
      const marker = selected ? "\u203A" : " ";
      const action = target.kind === "scheduled" ? this.theme.fg("warning", target.actionLabel) : this.theme.fg("accent", target.actionLabel);
      const labelWidth = Math.max(0, contentWidth - marker.length - target.actionLabel.length - 2);
      lines.push(`${marker} ${action} ${target.label.slice(0, labelWidth)}`);
      if (selected) lines.push(this.theme.fg("dim", `  ${target.detail}`.slice(0, contentWidth)));
    }
    if (this.targets.length > maxRows) lines.push(this.theme.fg("dim", `Showing ${start + 1}-${Math.min(this.targets.length, start + maxRows)} of ${this.targets.length}`));
    lines.push("");
    if (this.confirming) {
      const target = this.targets[this.selected];
      lines.push(this.theme.fg("warning", `Confirm: ${target.actionLabel} ${target.kind === "all" ? target.label : target.id}?`));
      if (target.kind !== "scheduled") lines.push(this.theme.fg("dim", target.kind === "all" ? "Stop ends these runs; scheduled runs are not paused." : "Stop ends this run; use interrupt for a resumable pause."));
      lines.push(this.theme.fg("dim", "Enter/Y confirms \xB7 N returns \xB7 Esc cancels"));
    } else {
      lines.push(this.theme.fg("dim", "\u2191\u2193/jk select \xB7 Enter confirm \xB7 Esc cancel"));
    }
    return lines.map((line) => truncateToWidth(line, contentWidth));
  }
};
function parseSingleRequiredArg(args, usage) {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 1) return { ok: false, message: usage };
  return { ok: true, value: parts[0] };
}
function getProfileWorkerModel(profile) {
  const model = profile.subagents?.agentOverrides?.worker?.model;
  return typeof model === "string" && model.trim() ? model.trim() : void 0;
}
function isStaleExtensionContextError2(error) {
  return error instanceof Error && (error.message.includes("This extension ctx is stale") || error.message.includes("Extension context no longer active"));
}
function slashHasUI(ctx) {
  try {
    return ctx.hasUI;
  } catch (error) {
    if (isStaleExtensionContextError2(error)) return void 0;
    throw error;
  }
}
async function requestSlashRun(pi, ctx, requestId, params, signal) {
  return new Promise((resolve6, reject) => {
    let done = false;
    let started = false;
    let startTimeout;
    const onStarted = (data) => {
      if (done || signal?.aborted || !data || typeof data !== "object") return;
      if (data.requestId !== requestId) return;
      started = true;
      if (startTimeout) clearTimeout(startTimeout);
      try {
        if (ctx.hasUI) ctx.ui.setStatus("subagent-slash", "running...");
      } catch (error) {
        if (isStaleExtensionContextError2(error)) {
          finish(() => reject(error));
          return;
        }
        throw error;
      }
    };
    const onResponse = (data) => {
      if (done || signal?.aborted || !data || typeof data !== "object") return;
      const response = data;
      if (response.requestId !== requestId) return;
      if (startTimeout) clearTimeout(startTimeout);
      finish(() => resolve6(response));
    };
    const onUpdate = (data) => {
      if (done || signal?.aborted || !data || typeof data !== "object") return;
      const update = data;
      if (update.requestId !== requestId) return;
      applySlashUpdate(requestId, update);
      try {
        if (!ctx.hasUI) return;
        const tool = update.currentTool ? ` ${update.currentTool}` : "";
        const count = update.toolCount ?? 0;
        const liveDetailKey = keyText("app.tools.expand");
        ctx.ui.setStatus("subagent-slash", `${count} tools${tool}${liveDetailKey ? ` | ${liveDetailKey} live detail` : ""}`);
      } catch (error) {
        if (isStaleExtensionContextError2(error)) {
          finish(() => reject(error));
          return;
        }
        throw error;
      }
    };
    const onTerminalInput = ctx.hasUI ? ctx.ui.onTerminalInput((input) => {
      if (!matchesKey(input, Key.escape)) return void 0;
      pi.events.emit(SLASH_SUBAGENT_CANCEL_EVENT, { requestId });
      finish(() => reject(new Error("Cancelled")));
      return { consume: true };
    }) : void 0;
    const unsubStarted = pi.events.on(SLASH_SUBAGENT_STARTED_EVENT, onStarted);
    const unsubResponse = pi.events.on(SLASH_SUBAGENT_RESPONSE_EVENT, onResponse);
    const unsubUpdate = pi.events.on(SLASH_SUBAGENT_UPDATE_EVENT, onUpdate);
    let onAbort;
    const finish = (next) => {
      if (done) return;
      done = true;
      if (startTimeout) clearTimeout(startTimeout);
      unsubStarted();
      unsubResponse();
      unsubUpdate();
      try {
        onTerminalInput?.();
      } catch (error) {
        if (!isStaleExtensionContextError2(error)) throw error;
      }
      signal?.removeEventListener("abort", onAbort);
      next();
    };
    onAbort = () => finish(() => reject(new Error("Slash subagent request canceled during session replacement or reload.")));
    startTimeout = setTimeout(() => {
      finish(() => reject(new Error(
        "Slash subagent bridge did not start within 15s. Ensure the extension is loaded correctly."
      )));
    }, 15e3);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      pi.events.emit(SLASH_SUBAGENT_REQUEST_EVENT, { requestId, params, ctx });
    } catch (error) {
      if (isStaleExtensionContextError2(error)) {
        finish(() => reject(error));
        return;
      }
      throw error;
    }
    if (!started && done) return;
    if (!started) {
      finish(() => reject(new Error(
        "No slash subagent bridge responded. Ensure the subagent extension is loaded correctly."
      )));
    }
  });
}
function extractSlashMessageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
}
function formatExportPathList(paths) {
  return paths.map((file) => `- \`${file}\``).join("\n");
}
function collectResultPaths(results, getPath) {
  return results.map(getPath).filter((file) => typeof file === "string" && file.length > 0);
}
function buildSlashExportText(response) {
  const output = extractSlashMessageText(response.result.content) || response.errorText || "(no output)";
  const results = response.result.details?.results ?? [];
  const sessionFiles = collectResultPaths(results, (result) => result.sessionFile);
  const savedOutputs = collectResultPaths(results, (result) => result.savedOutputPath);
  const artifactOutputs = collectResultPaths(results, (result) => result.artifactPaths?.outputPath);
  const sections = ["## Subagent result", output];
  if (sessionFiles.length > 0) sections.push("## Child session exports", formatExportPathList(sessionFiles));
  if (savedOutputs.length > 0) sections.push("## Saved outputs", formatExportPathList(savedOutputs));
  if (artifactOutputs.length > 0) sections.push("## Artifact outputs", formatExportPathList(artifactOutputs));
  return sections.join("\n\n");
}
function persistSlashSessionSnapshot(ctx) {
  try {
    if (!ctx.sessionManager) return;
    const sessionManager = ctx.sessionManager;
    const sessionFile = sessionManager.getSessionFile();
    if (!sessionFile || typeof sessionManager._rewriteFile !== "function") return;
    fs11.mkdirSync(path10.dirname(sessionFile), { recursive: true });
    sessionManager._rewriteFile();
    sessionManager.flushed = true;
  } catch (error) {
    console.error("Failed to persist slash session snapshot for export:", error);
  }
}
async function runSlashSubagent(pi, ctx, params, signal) {
  if (signal?.aborted) return;
  const initialHasUI = slashHasUI(ctx);
  if (initialHasUI === void 0) return;
  try {
    if (initialHasUI) ctx.ui.setToolsExpanded(false);
  } catch (error) {
    if (isStaleExtensionContextError2(error)) return;
    throw error;
  }
  const requestId = randomUUID2();
  const initialDetails = buildSlashInitialResult(requestId, params);
  const initialText = extractSlashMessageText(initialDetails.result.content) || "Running subagent...";
  try {
    pi.sendMessage({
      customType: SLASH_RESULT_TYPE,
      content: initialText,
      display: true,
      details: initialDetails
    });
  } catch (error) {
    if (isStaleExtensionContextError2(error)) return;
    throw error;
  }
  persistSlashSessionSnapshot(ctx);
  try {
    const response = await requestSlashRun(pi, ctx, requestId, params, signal);
    if (signal?.aborted) return;
    const hasUI = slashHasUI(ctx);
    if (hasUI === void 0) return;
    const finalDetails = finalizeSlashResult(response);
    pi.sendMessage({
      customType: SLASH_RESULT_TYPE,
      content: buildSlashExportText(response),
      display: !hasUI,
      details: finalDetails
    });
    persistSlashSessionSnapshot(ctx);
    if (hasUI) {
      ctx.ui.setStatus("subagent-slash", void 0);
    }
    if (response.isError && hasUI) {
      ctx.ui.notify(response.errorText || "Subagent failed", "error");
    }
  } catch (error) {
    if (signal?.aborted || isStaleExtensionContextError2(error)) return;
    const message2 = error instanceof Error ? error.message : String(error);
    const hasUI = slashHasUI(ctx);
    if (hasUI === void 0) return;
    const failedDetails = failSlashResult(requestId, params, message2);
    pi.sendMessage({
      customType: SLASH_RESULT_TYPE,
      content: `## Subagent result

${message2}`,
      display: !hasUI,
      details: failedDetails
    });
    persistSlashSessionSnapshot(ctx);
    if (hasUI) {
      ctx.ui.setStatus("subagent-slash", void 0);
    }
    if (message2 === "Cancelled") {
      if (hasUI) ctx.ui.notify("Cancelled", "warning");
      return;
    }
    if (hasUI) ctx.ui.notify(message2, "error");
  }
}
function slashRunWorkflowScript(key, child) {
  return `return runs.run(${JSON.stringify(key)}, ${JSON.stringify(child)})`;
}
function registerSlashCommands(pi, state, options = {}) {
  let fleetOpen = false;
  let disposed = false;
  const pendingRequests = /* @__PURE__ */ new Set();
  const runCommand = (ctx, params) => {
    if (disposed) return Promise.resolve();
    const controller = new AbortController();
    pendingRequests.add(controller);
    return runSlashSubagent(pi, ctx, params, controller.signal).finally(() => pendingRequests.delete(controller));
  };
  const launchCommand = (ctx, params) => {
    void runCommand(ctx, params);
  };
  const showFleet = async (ctx) => {
    state.lastUiContext = ctx;
    if (!canRenderComponents(ctx)) {
      await runCommand(ctx, { action: "status", view: "fleet" });
      return;
    }
    if (fleetOpen) {
      ctx.ui.notify("Subagent fleet inspector is already open.", "info");
      return;
    }
    fleetOpen = true;
    try {
      const { openSubagentFleet } = await import("./chunk-G4GZD3OJ.js");
      await openSubagentFleet(ctx, state, { asyncDirRoot: DIRS.async, inspectorPlugins: () => getInspectorPlugins(pi), resultsDir: DIRS.results, fleetKeybindings: options.fleetKeybindings });
    } finally {
      fleetOpen = false;
    }
  };
  pi.registerCommand("subagents", {
    description: "Administer subagents: inspect metadata and update models, thinking, or prompts",
    handler: async (args, ctx) => {
      await openSubagentsAdmin(pi, ctx, args);
    }
  });
  pi.registerCommand("run", {
    description: "Run one subagent through a workflow script: /run agent[output=file] [task] [--bg] [--fork]",
    getArgumentCompletions: makeAgentCompletions(pi, state),
    handler: async (args, ctx) => {
      const { args: cleanedArgs, bg, fork } = extractExecutionFlags(args);
      const input = cleanedArgs.trim();
      const firstSpace = input.indexOf(" ");
      if (!input) {
        ctx.ui.notify("Usage: /run <agent> [task] [--bg] [--fork]", "error");
        return;
      }
      const { name: agentName, config: inline } = parseAgentToken(firstSpace === -1 ? input : input.slice(0, firstSpace));
      const task = firstSpace === -1 ? "" : input.slice(firstSpace + 1).trim();
      if (!state.baseCwd) {
        ctx.ui.notify("Subagent session cwd is not initialized yet", "error");
        return;
      }
      const discovered = discoverSlashAgents(pi, state.baseCwd, "both");
      const resolvedAgent = resolveAgentName(agentName, discovered.agents);
      const candidates = resolvedAgent.error ? discovered.agents.filter((agent) => resolveAgentName(agentName, [agent]).agent) : resolvedAgent.agent;
      const diagnostic = findBlockingAgentDiagnostic(agentName, candidates, discovered.agentDiagnostics);
      if (diagnostic || resolvedAgent.error || !resolvedAgent.agent) {
        ctx.ui.notify(diagnostic ? `Agent '${agentName}' has invalid configuration: ${diagnostic.error}` : resolvedAgent.error ?? formatUnknownAgentError(agentName, discovered.unknownAgentDiagnosticContext), "error");
        return;
      }
      let finalTask = task;
      if (inline.reads && Array.isArray(inline.reads) && inline.reads.length > 0) {
        const existingReads = inline.reads.filter((read) => resolveExistingReadPaths([read], state.baseCwd).length > 0);
        if (existingReads.length > 0) finalTask = `[Read from: ${existingReads.join(", ")}]

${finalTask}`;
      }
      const child = { agent: agentName, task: finalTask, agentScope: "both" };
      if (inline.output !== void 0) child.output = inline.output;
      if (inline.outputMode !== void 0) child.outputMode = inline.outputMode;
      if (inline.skill !== void 0) child.skill = inline.skill;
      if (inline.model) child.model = inline.model;
      if (fork) child.context = "fork";
      launchCommand(ctx, options.workflowScriptsDisabled ? { ...child, async: bg } : { workflowScript: slashRunWorkflowScript("run", child), async: bg });
    }
  });
  pi.registerCommand("subagent-cost", {
    description: "Show parent and subagent child usage cost for this session",
    handler: async (_args, ctx) => {
      sendSlashText(pi, formatSubagentCostReport(collectSubagentCost(ctx, state)));
    }
  });
  pi.registerCommand("subagents-doctor", {
    description: "Show subagent diagnostics",
    handler: async (_args, ctx) => {
      await runCommand(ctx, { action: "doctor" });
    }
  });
  pi.registerCommand("subagents-inspect-rpc", {
    description: "Host integration bridge: answer an async child inspection request with a correlated widget payload (no model turn)",
    handler: async (args, ctx) => {
      if (ctx.mode === "tui") {
        ctx.ui.notify('Inspection replies are emitted only on RPC surfaces. Use /subagents or subagent({ action: "status", options: { view: "transcript" } }) interactively.', "info");
        return;
      }
      if (!ctx.hasUI) return;
      const reply = handleInspectRpcArgs(args, { state });
      ctx.ui.setWidget(INSPECT_WIDGET_KEY, encodeInspectReply(reply));
      ctx.ui.setWidget(INSPECT_WIDGET_KEY, void 0);
    }
  });
  pi.registerCommand("subagents-guide", {
    description: "Show a packaged subagents guide topic",
    getArgumentCompletions: (prefix) => prefix.includes(" ") ? null : SUBAGENT_GUIDE_TOPICS.filter((topic) => topic.startsWith(prefix)).map((topic) => ({ value: topic, label: topic })),
    handler: async (args, ctx) => {
      const topic = args.trim();
      if (topic.includes(" ")) {
        ctx.ui.notify("Usage: /subagents-guide [topic]", "error");
        return;
      }
      await runCommand(ctx, { action: "guide", ...topic ? { topic } : {} });
    }
  });
  pi.registerCommand("subagents-refine", {
    description: "Generate a bounded project-local refinement overlay for one subagent",
    getArgumentCompletions: makeAgentCompletions(pi, state),
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      if (parts.length !== 1) {
        ctx.ui.notify("Usage: /subagents-refine <agent>", "error");
        return;
      }
      await runCommand(ctx, { action: "refine", agent: parts[0] });
    }
  });
  pi.registerCommand("subagents-fleet", {
    description: "Open the live subagent fleet inspector",
    handler: async (_args, ctx) => showFleet(ctx)
  });
  const detachForegroundRun = (args, ctx) => {
    const id = args.trim();
    let control;
    try {
      control = selectForegroundDetachControl(state, id);
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      return;
    }
    if (!control) {
      ctx.ui.notify(id ? `No active foreground run found for '${id}'.` : "No active foreground single-subagent run to detach.", "info");
      return;
    }
    if (control.mode !== "single") {
      ctx.ui.notify("/subagents-detach currently supports single-subagent runs only.", "error");
      return;
    }
    if (!control.detach?.()) {
      ctx.ui.notify(`Foreground run ${control.runId} is not currently detachable.`, "info");
      return;
    }
    sendSlashText(pi, `Detached foreground run ${control.runId} without terminating its child. Use subagent({ action: "status", id: ${JSON.stringify(control.runId)} }) or bg_wait({ id: ${JSON.stringify(control.runId)} }) to recover the eventual result. This does not daemonize the process or guarantee survival across Pi reload/restart.`);
  };
  pi.registerCommand("subagents-detach", {
    description: "Detach the active foreground single-subagent run without terminating it",
    handler: async (args, ctx) => detachForegroundRun(args, ctx)
  });
  if (options.foregroundDetachShortcut) {
    pi.registerShortcut(options.foregroundDetachShortcut, {
      description: "Detach the active foreground subagent and keep it running in the background",
      handler: async (ctx) => detachForegroundRun("", ctx)
    });
  }
  pi.registerCommand("subagents-stop", {
    description: "Stop a current-session async subagent run, or one child of it with /subagents-stop <run-id> <child-id>",
    handler: async (args, ctx) => {
      const [id, childId, ...extra] = args.trim().split(/\s+/).filter(Boolean);
      if (extra.length > 0) {
        sendSlashText(pi, "Usage: /subagents-stop [run-id] [child-id]");
        return;
      }
      if (id) {
        await runCommand(ctx, childId ? { action: "stop", id, childId } : { action: "stop", id });
        return;
      }
      let targets;
      try {
        targets = discoverStopTargets(ctx, state);
      } catch (error) {
        const message2 = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(message2, "error");
        return;
      }
      if (!canRenderComponents(ctx)) {
        sendSlashText(pi, stopFallbackText(targets));
        return;
      }
      if (targets.length === 0) {
        ctx.ui.notify("No active current-session async runs or scheduled subagent runs to stop.", "info");
        return;
      }
      const result = await ctx.ui.custom(
        (tui, theme, _kb, done) => new SubagentsStopSelector(tui, theme, stopPickerTargets(targets), done),
        { overlay: true, overlayOptions: { anchor: "center", width: 88, maxHeight: "80%" } }
      );
      if (!result?.confirmed || !result.target) return;
      if (result.target.kind === "all") {
        for (const id2 of result.target.ids) await runCommand(ctx, { action: "stop", id: id2 });
        return;
      }
      if (result.target.kind === "scheduled") {
        await runCommand(ctx, { action: "schedule.pause", id: result.target.id });
        return;
      }
      await runCommand(ctx, { action: "stop", id: result.target.id });
    }
  });
  pi.registerCommand("subagents-steer", {
    description: "Steer a live async subagent run with a message, or one child of it with --child <child-id>",
    handler: async (args, ctx) => {
      const tokens = args.trim().split(/\s+/).filter(Boolean);
      const usage = "Usage: /subagents-steer <run-id> [--child <child-id>] <message>";
      const [id, ...rest] = tokens;
      if (!id || id.startsWith("--")) {
        sendSlashText(pi, usage);
        return;
      }
      let childId;
      let messageStart = 0;
      if (rest[0] === "--child" && rest[1] && !rest[1].startsWith("--")) {
        childId = rest[1];
        messageStart = 2;
      }
      const message2 = rest.slice(messageStart).join(" ").trim();
      if (!message2) {
        sendSlashText(pi, usage);
        return;
      }
      let targetId = id;
      let childIndex;
      if (childId !== void 0) {
        const sessionId = state.currentSessionId ?? ctx.sessionManager.getSessionId() ?? void 0;
        const run = listAsyncRuns(DIRS.async, {
          runId: id,
          states: ["queued", "running", "paused"],
          ...sessionId ? { sessionId } : {}
        })[0];
        const status = run ? readStatus(run.asyncDir) : null;
        if (!run || !status) {
          sendSlashText(pi, `No current-session async run found for '${id}'.`);
          return;
        }
        const resolutionStatus = {
          ...status,
          steps: status.steps?.map((step, index) => ({ ...step, children: run.steps[index]?.children ?? step.children }))
        };
        const resolution = resolveAsyncStatusChild(resolutionStatus, childId, { includeNested: true });
        if (!resolution.ok) {
          sendSlashText(pi, resolution.message);
          return;
        }
        if (resolution.child.nested) targetId = resolution.child.nested.id;
        else if (resolution.child.step.runId) targetId = resolution.child.step.runId;
        else childIndex = resolution.child.index;
      }
      await runCommand(ctx, {
        action: "steer",
        id: targetId,
        message: message2,
        ...childIndex !== void 0 ? { index: childIndex } : {},
        // Host-style exact-child authority, matching the extension RPC
        // nonRecoveringSteer guarantee: never swap the addressed child for
        // a pause-and-revive replacement after a missed acknowledgment.
        steeringRecovery: false
      });
    }
  });
  registerPromptWorkflowCommands({
    pi,
    run: async (params, ctx) => {
      launchCommand(ctx, params);
    }
  });
  pi.registerCommand("subagents-models", {
    description: "Show model mappings for discovered subagents",
    getArgumentCompletions: makeAgentCompletions(pi, state),
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (!trimmed) {
        await runCommand(ctx, { action: "models" });
        return;
      }
      const parts = trimmed.split(/\s+/).filter(Boolean);
      if (parts.length !== 1) {
        ctx.ui.notify("Usage: /subagents-models [agent-name]", "error");
        return;
      }
      await runCommand(ctx, { action: "models", agent: parts[0] });
    }
  });
  pi.registerCommand("subagents-profiles", {
    description: "List saved subagent profiles",
    handler: async (_args, _ctx) => {
      const profiles = listSubagentProfiles();
      if (profiles.length === 0) {
        sendSlashText(pi, "Subagent profiles\n\nNo subagent profiles found in ~/.pi/agent/profiles/pi-subagents/");
        return;
      }
      sendSlashText(pi, `Subagent profiles

${profiles.join("\n")}`);
    }
  });
  pi.registerCommand("subagents-load-profile", {
    description: "Load a subagent profile into ~/.pi/agent/settings.json",
    getArgumentCompletions: (prefix) => {
      if (prefix.includes(" ")) return null;
      return listSubagentProfiles().filter((name) => name.startsWith(prefix)).map((name) => ({ value: name, label: name }));
    },
    handler: async (args, ctx) => {
      const parsed = parseSingleRequiredArg(args, "Usage: /subagents-load-profile <name>");
      if (parsed.ok === false) {
        ctx.ui.notify(parsed.message, "error");
        return;
      }
      try {
        await withSlashStatus(ctx, `Loading profile ${parsed.value}\u2026`, async () => {
          const { profile } = readSubagentProfile(parsed.value);
          const workerModel = getProfileWorkerModel(profile);
          const result = applySubagentProfile(parsed.value);
          const lines = [
            `Loaded subagent profile: ${parsed.value}`,
            `Profile: ${result.filePath}`,
            `Updated: ${result.settingsPath}`
          ];
          if (workerModel && typeof pi.setModel === "function" && typeof ctx.modelRegistry?.find === "function" && typeof ctx.modelRegistry?.getAvailable === "function") {
            const shouldSwitch = await ctx.ui.confirm(
              "",
              `Profile loaded. Also switch this session to the profile worker model?

${workerModel}`
            );
            if (shouldSwitch) {
              const modelInfo = findModelInfo(workerModel, ctx.modelRegistry.getAvailable().map(toModelInfo));
              const model = modelInfo ? ctx.modelRegistry.find(modelInfo.provider, modelInfo.id) : void 0;
              if (!modelInfo || !model) {
                lines.push(`Could not switch current session model: '${workerModel}' is not available in the current model registry.`);
              } else {
                const success = await pi.setModel(model);
                if (success) lines.push(`Current session model switched to: ${modelInfo.fullId}`);
                else lines.push(`Could not switch current session model to '${workerModel}': no API key or provider access is available.`);
              }
            }
          } else if (workerModel) {
            lines.push(`Profile worker model: ${workerModel}`);
          }
          sendSlashText(pi, lines.join("\n"));
        });
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    }
  });
  pi.registerCommand("subagents-refresh-provider-models", {
    description: "Refresh the cached model catalog for one provider",
    getArgumentCompletions: makeProviderCompletions(state),
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const force = /(?:^|\s)--force$/.test(trimmed) || /(?:^|\s)force$/.test(trimmed);
      const withoutForce = trimmed.replace(/(?:^|\s)(?:--force|force)$/, "").trim();
      const parsed = parseSingleRequiredArg(withoutForce, "Usage: /subagents-refresh-provider-models <provider> [--force]");
      if (parsed.ok === false) {
        ctx.ui.notify(parsed.message, "error");
        return;
      }
      try {
        await withSlashStatus(ctx, `Refreshing provider models for ${parsed.value}\u2026`, async () => {
          const result = await refreshProviderModelCatalog(pi, ctx, parsed.value, { force, maxAgeDays: DEFAULT_PROVIDER_MODELS_MAX_AGE_DAYS });
          const lines = [
            "Provider model catalog",
            `Provider: ${parsed.value}`,
            `Status: ${result.reused ? "fresh cache reused" : "refreshed"}`,
            `File: ${result.filePath}`,
            `Models: ${result.catalog.models.length}`,
            `Refreshed at: ${result.catalog.refreshedAt}`
          ];
          if (result.heuristicFallbackCount > 0) {
            lines.push(`Warning: ${result.heuristicFallbackCount} model${result.heuristicFallbackCount === 1 ? " was" : "s were"} classified with name heuristics fallback.`);
          }
          sendSlashText(pi, lines.join("\n"));
        });
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    }
  });
  pi.registerCommand("subagents-generate-profiles", {
    description: "Generate <provider>.quota and <provider>.quality subagent profiles",
    getArgumentCompletions: makeProviderCompletions(state),
    handler: async (args, ctx) => {
      const parsed = parseSingleRequiredArg(args, "Usage: /subagents-generate-profiles <provider>");
      if (parsed.ok === false) {
        ctx.ui.notify(parsed.message, "error");
        return;
      }
      try {
        await withSlashStatus(ctx, `Generating profiles for ${parsed.value}\u2026`, async () => {
          const result = await generateProfilesForProvider(pi, ctx, parsed.value, { maxAgeDays: DEFAULT_PROVIDER_MODELS_MAX_AGE_DAYS });
          const lines = [
            "Generated subagent profiles",
            `Provider: ${parsed.value}`,
            `Catalog: ${result.catalogPath}`,
            `Quota: ${result.quotaPath}`,
            `  cheap=${result.quotaModels.cheap}`,
            `  medium=${result.quotaModels.medium}`,
            `  strong=${result.quotaModels.strong}`,
            `Quality: ${result.qualityPath}`,
            `  cheap=${result.qualityModels.cheap}`,
            `  medium=${result.qualityModels.medium}`,
            `  strong=${result.qualityModels.strong}`
          ];
          if (result.selectedHeuristicFallbackCount > 0) {
            lines.push(`Warning: generated profiles depend on heuristic-only classification for ${result.selectedHeuristicFallbackCount} selected model${result.selectedHeuristicFallbackCount === 1 ? "" : "s"}.`);
          } else if (result.heuristicFallbackCount > 0) {
            lines.push(`Warning: provider catalog still contains ${result.heuristicFallbackCount} heuristic-classified model${result.heuristicFallbackCount === 1 ? "" : "s"}.`);
          }
          sendSlashText(pi, lines.join("\n"));
        });
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    }
  });
  pi.registerCommand("subagents-check-profile", {
    description: "Check whether a saved profile still points to usable models",
    getArgumentCompletions: (prefix) => {
      if (prefix.includes(" ")) return null;
      return listSubagentProfiles().filter((name) => name.startsWith(prefix)).map((name) => ({ value: name, label: name }));
    },
    handler: async (args, ctx) => {
      const parsed = parseSingleRequiredArg(args, "Usage: /subagents-check-profile <name>");
      if (parsed.ok === false) {
        ctx.ui.notify(parsed.message, "error");
        return;
      }
      try {
        await withSlashStatus(ctx, `Checking profile ${parsed.value}\u2026`, async () => {
          const result = await checkSubagentProfile(pi, ctx, parsed.value);
          const lines = [
            "Subagent profile check",
            `Profile: ${result.profileName}`,
            `File: ${result.filePath}`,
            "",
            ...result.results.map((entry) => `${entry.agent} \u2192 ${entry.model} \u2014 registry ${entry.inRegistry ? "ok" : "missing"}; probe ${entry.probe.status}${entry.probe.message ? ` (${entry.probe.message.split(/\r?\n/, 1)[0]})` : ""}`)
          ];
          sendSlashText(pi, lines.join("\n"));
        });
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    }
  });
  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const controller of pendingRequests) controller.abort();
      pendingRequests.clear();
    }
  };
}

// src/slash/delegation-json.ts
var MAX_JSON_DEPTH = 64;
var MAX_JSON_ENTRIES = 1e5;
function cloneJsonWithinByteLimit(input, maxBytes) {
  let minimumBytes = 0;
  let entries = 0;
  const active = /* @__PURE__ */ new WeakSet();
  const addMinimumBytes = (bytes) => {
    minimumBytes += bytes;
    if (minimumBytes > maxBytes) throw new RangeError("too_large");
  };
  const visit = (value, depth) => {
    if (depth > MAX_JSON_DEPTH) throw new TypeError("invalid");
    if (value === null) {
      addMinimumBytes(4);
      return null;
    }
    if (typeof value === "boolean") {
      addMinimumBytes(value ? 4 : 5);
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new TypeError("invalid");
      const encoded = JSON.stringify(Object.is(value, -0) ? 0 : value);
      addMinimumBytes(Buffer.byteLength(encoded, "utf8"));
      return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value === "string") {
      addMinimumBytes(Buffer.byteLength(value, "utf8") + 2);
      return value;
    }
    if (typeof value !== "object") throw new TypeError("invalid");
    const object = value;
    if (active.has(object)) throw new TypeError("invalid");
    active.add(object);
    try {
      const prototype = Object.getPrototypeOf(object);
      const keys = Reflect.ownKeys(object);
      if (Array.isArray(object)) {
        if (prototype !== Array.prototype) throw new TypeError("invalid");
        const lengthDescriptor = Object.getOwnPropertyDescriptor(object, "length");
        if (!lengthDescriptor || !("value" in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
          throw new TypeError("invalid");
        }
        const length = lengthDescriptor.value;
        addMinimumBytes(2 + Math.max(0, length - 1));
        const output2 = [];
        for (const key of keys) {
          if (typeof key === "symbol") throw new TypeError("invalid");
          if (key === "length") continue;
          if (!/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= length) throw new TypeError("invalid");
        }
        for (let index = 0; index < length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(object, String(index));
          if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new TypeError("invalid");
          entries++;
          if (entries > MAX_JSON_ENTRIES) throw new TypeError("invalid");
          output2.push(visit(descriptor.value, depth + 1));
        }
        return output2;
      }
      if (prototype !== Object.prototype && prototype !== null) throw new TypeError("invalid");
      addMinimumBytes(2 + Math.max(0, keys.length - 1));
      const output = {};
      for (const key of keys) {
        if (typeof key === "symbol") throw new TypeError("invalid");
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new TypeError("invalid");
        entries++;
        if (entries > MAX_JSON_ENTRIES) throw new TypeError("invalid");
        addMinimumBytes(Buffer.byteLength(JSON.stringify(key), "utf8") + 1);
        Object.defineProperty(output, key, {
          value: visit(descriptor.value, depth + 1),
          enumerable: true,
          configurable: true,
          writable: true
        });
      }
      return output;
    } finally {
      active.delete(object);
    }
  };
  try {
    const value = visit(input, 0);
    const encoded = JSON.stringify(value);
    if (encoded === void 0) return { ok: false, reason: "invalid" };
    const encodedBytes = Buffer.byteLength(encoded, "utf8");
    if (encodedBytes > maxBytes) return { ok: false, reason: "too_large" };
    return { ok: true, value, encodedBytes };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof RangeError && error.message === "too_large" ? "too_large" : "invalid"
    };
  }
}

// src/slash/delegation-request.ts
var supportedFields = /* @__PURE__ */ new Set([
  "requestId",
  "ownerRunId",
  "nodeId",
  "agent",
  "task",
  "context",
  "cwd",
  "model",
  "thinking",
  "timeoutMs",
  "toolBudget",
  "skill",
  "artifacts",
  "intercomBridge",
  "result"
]);
var thinkingLevels = /* @__PURE__ */ new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
var MAX_SCHEMA_BYTES = 64 * 1024;
var MAX_TASK_BYTES = 1024 * 1024;
var MAX_CWD_BYTES = 32 * 1024;
var MAX_SHORT_TEXT_BYTES = 1024;
var MAX_SKILL_ENTRIES = 256;
var MAX_SKILL_AGGREGATE_BYTES = 64 * 1024;
function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function validateId(value) {
  if (!nonEmptyString(value) || value.length > 256 || /[\r\n]/.test(value)) return void 0;
  return value;
}
function parseSubagentDelegationRequest(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "Delegation request must be an object." };
  }
  const value = data;
  const requestId = validateId(value.requestId);
  if (!requestId) {
    return { ok: false, error: "Delegation requestId must be a non-empty string of at most 256 characters without newlines." };
  }
  const ownerRunId = validateId(value.ownerRunId);
  if (!ownerRunId) {
    return { ok: false, requestId, error: "Delegation ownerRunId must be a non-empty string of at most 256 characters without newlines." };
  }
  const nodeId = validateId(value.nodeId);
  if (!nodeId) {
    return { ok: false, requestId, ownerRunId, error: "Delegation nodeId must be a non-empty string of at most 256 characters without newlines." };
  }
  const identity = { requestId, ownerRunId, nodeId };
  const unsupportedField = Object.keys(value).find((key) => !supportedFields.has(key));
  if (unsupportedField) return { ok: false, ...identity, error: `Unsupported delegation field: ${unsupportedField}.` };
  if (!nonEmptyString(value.agent)) return { ok: false, ...identity, error: "Delegation agent must be a non-empty string." };
  if (!nonEmptyString(value.task)) return { ok: false, ...identity, error: "Delegation task must be a non-empty string." };
  if (value.context !== "fresh" && value.context !== "fork") {
    return { ok: false, ...identity, error: "Delegation context must be fresh or fork." };
  }
  if (!nonEmptyString(value.cwd)) return { ok: false, ...identity, error: "Delegation cwd must be a non-empty string." };
  if (value.model !== void 0 && !nonEmptyString(value.model)) {
    return { ok: false, ...identity, error: "model must be a non-empty string when provided." };
  }
  if (value.timeoutMs !== void 0 && (typeof value.timeoutMs !== "number" || !Number.isInteger(value.timeoutMs) || value.timeoutMs < 1)) {
    return { ok: false, ...identity, error: "timeoutMs must be an integer >= 1." };
  }
  const timeoutMs = typeof value.timeoutMs === "number" ? value.timeoutMs : void 0;
  if (timeoutMs !== void 0 && timeoutMs > 2147483647) {
    return { ok: false, ...identity, error: "timeoutMs must be <= 2147483647." };
  }
  if (value.toolBudget && typeof value.toolBudget === "object" && !Array.isArray(value.toolBudget)) {
    const unsupportedToolBudgetField = Object.keys(value.toolBudget).find((key) => key !== "soft" && key !== "hard" && key !== "block");
    if (unsupportedToolBudgetField) {
      return { ok: false, ...identity, error: `toolBudget.${unsupportedToolBudgetField} is not supported.` };
    }
  }
  const toolBudget = validateToolBudgetConfig(value.toolBudget, "toolBudget", { minimumHard: 0 });
  if (toolBudget.error) return { ok: false, ...identity, error: toolBudget.error };
  if (value.skill !== void 0) {
    const validSkill = typeof value.skill === "boolean" || nonEmptyString(value.skill) || Array.isArray(value.skill) && value.skill.length > 0 && value.skill.every(nonEmptyString);
    if (!validSkill) {
      return { ok: false, ...identity, error: "skill must be a boolean, non-empty string, or non-empty string array." };
    }
  }
  if (value.artifacts !== void 0 && typeof value.artifacts !== "boolean") {
    return { ok: false, ...identity, error: "artifacts must be a boolean." };
  }
  let intercomBridge;
  if (value.intercomBridge !== void 0) {
    const bridge = validateIntercomBridgeConfig({ value: value.intercomBridge, label: "intercomBridge" });
    if (!bridge.ok) return { ok: false, ...identity, error: bridge.error };
    if (typeof bridge.value.instructionFile === "string" && Buffer.byteLength(bridge.value.instructionFile, "utf8") > MAX_SHORT_TEXT_BYTES) {
      return { ok: false, ...identity, error: "intercomBridge.instructionFile exceeds 1 KiB when UTF-8 encoded." };
    }
    intercomBridge = bridge.value;
  }
  if (Buffer.byteLength(value.task, "utf8") > MAX_TASK_BYTES) {
    return { ok: false, ...identity, error: "Delegation task exceeds 1 MiB when UTF-8 encoded." };
  }
  if (Buffer.byteLength(value.cwd, "utf8") > MAX_CWD_BYTES) {
    return { ok: false, ...identity, error: "Delegation cwd exceeds 32 KiB when UTF-8 encoded." };
  }
  if (Buffer.byteLength(value.agent, "utf8") > MAX_SHORT_TEXT_BYTES) {
    return { ok: false, ...identity, error: "Delegation agent exceeds 1 KiB when UTF-8 encoded." };
  }
  if (typeof value.model === "string" && Buffer.byteLength(value.model, "utf8") > MAX_SHORT_TEXT_BYTES) {
    return { ok: false, ...identity, error: "Delegation model exceeds 1 KiB when UTF-8 encoded." };
  }
  const skillEntries = typeof value.skill === "string" ? [value.skill] : Array.isArray(value.skill) ? value.skill : [];
  if (skillEntries.length > MAX_SKILL_ENTRIES) {
    return { ok: false, ...identity, error: "Delegation skill supports at most 256 entries." };
  }
  if (skillEntries.some((entry) => Buffer.byteLength(entry, "utf8") > MAX_SHORT_TEXT_BYTES)) {
    return { ok: false, ...identity, error: "Delegation skill entry exceeds 1 KiB when UTF-8 encoded." };
  }
  if (skillEntries.reduce((total, entry) => total + Buffer.byteLength(entry, "utf8"), 0) > MAX_SKILL_AGGREGATE_BYTES) {
    return { ok: false, ...identity, error: "Delegation skill entries exceed 64 KiB in aggregate when UTF-8 encoded." };
  }
  if (value.thinking !== void 0 && (typeof value.thinking !== "string" || !thinkingLevels.has(value.thinking))) {
    return { ok: false, ...identity, error: "thinking must be one of off, minimal, low, medium, high, xhigh, or max." };
  }
  if (!value.result || typeof value.result !== "object" || Array.isArray(value.result)) {
    return { ok: false, ...identity, error: 'result must be { kind: "text" } or { kind: "structured", schema: object }.' };
  }
  const result = value.result;
  let structuredSchema;
  if (result.kind === "text") {
    const unsupportedResultField = Object.keys(result).find((key) => key !== "kind");
    if (unsupportedResultField) return { ok: false, ...identity, error: `result.${unsupportedResultField} is not supported for text results.` };
  } else if (result.kind === "structured") {
    const unsupportedResultField = Object.keys(result).find((key) => key !== "kind" && key !== "schema");
    if (unsupportedResultField) return { ok: false, ...identity, error: `result.${unsupportedResultField} is not supported for structured results.` };
    if (!result.schema || typeof result.schema !== "object" || Array.isArray(result.schema)) {
      return { ok: false, ...identity, error: "result.schema must be a JSON Schema object." };
    }
    const inspectedSchema = cloneJsonWithinByteLimit(result.schema, MAX_SCHEMA_BYTES);
    if (inspectedSchema.ok === false) {
      return {
        ok: false,
        ...identity,
        error: inspectedSchema.reason === "too_large" ? "result.schema exceeds 64 KiB when encoded." : "result.schema must be plain JSON data."
      };
    }
    structuredSchema = inspectedSchema.value;
  } else {
    return { ok: false, ...identity, error: "result.kind must be text or structured." };
  }
  return {
    ok: true,
    request: {
      ...value,
      // The validated copy replaces the caller's object so the request never aliases untrusted input.
      ...intercomBridge ? { intercomBridge } : {},
      result: structuredSchema ? { kind: "structured", schema: structuredSchema } : { kind: "text" }
    }
  };
}

// src/slash/delegation-adapters.ts
function parsePromptTemplateRequest(data) {
  if (!data || typeof data !== "object") return void 0;
  const value = data;
  if (value.tasks !== void 0 || value.worktree !== void 0) return void 0;
  if (typeof value.requestId !== "string" || !value.requestId) return void 0;
  if (typeof value.agent !== "string" || !value.agent) return void 0;
  if (typeof value.task !== "string" || !value.task) return void 0;
  if (typeof value.model !== "string" || !value.model) return void 0;
  if (typeof value.cwd !== "string" || !value.cwd) return void 0;
  if (value.context !== "fresh" && value.context !== "fork") return void 0;
  return {
    requestId: value.requestId,
    agent: value.agent,
    task: value.task,
    context: value.context,
    model: value.model,
    cwd: value.cwd
  };
}
function firstTextContent(content) {
  if (!Array.isArray(content)) return void 0;
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    if (part.type !== "text") continue;
    const text = part.text;
    if (typeof text === "string" && text.trim()) return text.trim();
  }
  return void 0;
}
function filterRecentOutput(lines) {
  if (!lines || lines.length === 0) return void 0;
  const filtered = lines.filter((line) => typeof line === "string" && line.trim() && line.trim() !== "(running...)");
  if (filtered.length === 0) return void 0;
  return filtered;
}
function sanitizeRecentTools(tools) {
  if (!tools || tools.length === 0) return void 0;
  const sanitized = tools.flatMap((entry) => {
    if (typeof entry.tool !== "string" || entry.tool.trim().length === 0) return [];
    return [{
      tool: entry.tool,
      args: typeof entry.args === "string" ? entry.args : String(entry.args ?? "")
    }];
  });
  return sanitized.length > 0 ? sanitized : void 0;
}
function resolveProgressModel(update, entry) {
  const results = update.details?.results;
  if (!results || results.length === 0) return void 0;
  if (typeof entry.index === "number" && entry.index >= 0) {
    const byIndex = results[entry.index];
    if (typeof byIndex?.model === "string") return byIndex.model;
  }
  if (entry.agent) {
    const byAgent = results.find((result) => result.agent === entry.agent && typeof result.model === "string");
    if (byAgent?.model) return byAgent.model;
  }
  const firstWithModel = results.find((result) => typeof result.model === "string");
  return firstWithModel?.model;
}
function toolCallNameFromSummary(summary) {
  const text = typeof summary.expandedText === "string" && summary.expandedText.trim().length > 0 ? summary.expandedText.trim() : typeof summary.text === "string" ? summary.text.trim() : "";
  if (!text) return void 0;
  if (text.startsWith("$ ")) return "bash";
  return text.match(/^[A-Za-z_][\w.-]*/)?.[0];
}
function buildDelegationMessages(result, fallbackText) {
  if (Array.isArray(result.messages) && result.messages.length > 0) return result.messages;
  const toolCallParts = (result.toolCalls ?? []).flatMap((summary) => {
    const name = toolCallNameFromSummary(summary);
    return name ? [{ type: "toolCall", name, arguments: { summary: summary.expandedText ?? summary.text ?? "" } }] : [];
  });
  const text = typeof result.finalOutput === "string" && result.finalOutput.trim().length > 0 ? result.finalOutput.trim() : fallbackText;
  const content = [
    ...toolCallParts,
    ...text ? [{ type: "text", text }] : []
  ];
  if (content.length === 0) return [];
  return [{ role: "assistant", content }];
}
function isFiniteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function buildDelegationUpdateUsage(entry) {
  if (!entry) return void 0;
  const { inputTokens, outputTokens, cacheRead, cacheWrite, turnCount } = entry;
  if (!isFiniteNonNegative(inputTokens) || !isFiniteNonNegative(outputTokens) || !isFiniteNonNegative(cacheRead) || !isFiniteNonNegative(cacheWrite) || !isFiniteNonNegative(turnCount)) return void 0;
  return { input: inputTokens, output: outputTokens, cacheRead, cacheWrite, turns: turnCount };
}
function toDelegationUpdate(requestId, update) {
  const progress = update.details?.progress?.[0];
  const taskProgress = update.details?.progress?.map((entry) => {
    const lastOutput2 = entry.recentOutput?.[entry.recentOutput.length - 1];
    const safeLastOutput2 = typeof lastOutput2 === "string" && lastOutput2.trim() && lastOutput2 !== "(running...)" ? lastOutput2 : void 0;
    return {
      index: entry.index,
      agent: entry.agent ?? "delegate",
      status: entry.status,
      currentTool: entry.currentTool,
      currentToolArgs: entry.currentToolArgs,
      recentOutput: safeLastOutput2,
      recentOutputLines: filterRecentOutput(entry.recentOutput),
      recentTools: sanitizeRecentTools(entry.recentTools),
      model: resolveProgressModel(update, entry),
      toolCount: entry.toolCount,
      durationMs: entry.durationMs,
      tokens: entry.tokens
    };
  });
  if (!progress && (!taskProgress || taskProgress.length === 0)) return void 0;
  const lastOutput = progress?.recentOutput?.[progress.recentOutput.length - 1];
  const safeLastOutput = typeof lastOutput === "string" && lastOutput.trim() && lastOutput !== "(running...)" ? lastOutput : void 0;
  return {
    requestId,
    ...update.details?.runId ? { runId: update.details.runId } : {},
    currentTool: progress?.currentTool,
    currentToolArgs: progress?.currentToolArgs,
    recentOutput: safeLastOutput,
    recentOutputLines: filterRecentOutput(progress?.recentOutput),
    recentTools: sanitizeRecentTools(progress?.recentTools),
    model: progress ? resolveProgressModel(update, progress) : void 0,
    toolCount: progress?.toolCount,
    usage: buildDelegationUpdateUsage(progress),
    durationMs: progress?.durationMs,
    tokens: progress?.tokens,
    taskProgress
  };
}
function toSubagentDelegationExecutionParams(request) {
  return {
    agent: request.agent,
    task: request.task,
    context: request.context,
    cwd: request.cwd,
    model: request.model,
    timeoutMs: request.timeoutMs,
    toolBudget: request.toolBudget,
    skill: request.skill,
    ...request.result.kind === "structured" ? { outputSchema: request.result.schema } : {},
    acceptance: false,
    artifacts: request.artifacts,
    ...request.intercomBridge !== void 0 ? { intercomBridge: request.intercomBridge } : {},
    delegatedThinkingOverride: request.thinking,
    delegatedAllowZeroToolBudget: true,
    async: false,
    foregroundOnly: true,
    clarify: false
  };
}
function toSubagentDelegationUpdate(request, result) {
  const legacy = toDelegationUpdate(request.requestId, result);
  if (!legacy) return void 0;
  return {
    requestId: request.requestId,
    ownerRunId: request.ownerRunId,
    nodeId: request.nodeId,
    ...legacy.runId ? { runId: legacy.runId } : {},
    ...legacy.currentTool ? { currentTool: legacy.currentTool } : {},
    ...legacy.currentToolArgs ? { currentToolArgs: legacy.currentToolArgs } : {},
    ...legacy.recentOutput ? { recentOutput: legacy.recentOutput } : {},
    ...legacy.recentOutputLines ? { recentOutputLines: legacy.recentOutputLines } : {},
    ...legacy.recentTools ? { recentTools: legacy.recentTools } : {},
    ...legacy.model ? { model: legacy.model } : {},
    ...typeof legacy.toolCount === "number" ? { toolCount: legacy.toolCount } : {},
    ...typeof legacy.durationMs === "number" ? { durationMs: legacy.durationMs } : {},
    ...typeof legacy.tokens === "number" ? { tokens: legacy.tokens } : {},
    ...legacy.usage ? { usage: legacy.usage } : {},
    ...result.details?.progress?.[0]?.providerDiagnostics ? {
      providerDiagnostics: snapshotProviderDiagnostics(result.details.progress[0].providerDiagnostics)
    } : {}
  };
}
function resolveSubagentDelegationStatus(result, aborted) {
  if (aborted) return "cancelled";
  const child = result.details?.results?.[0];
  if (!child) return "failed";
  if (result.details?.timedOut || child.timedOut) return "timed_out";
  if (child?.structuredOutputFailed) return "structured_output_failed";
  if (child?.toolBudgetBlocked) return "tool_budget_exhausted";
  if (child?.acceptance?.status === "rejected" && child.acceptance.explicit) return "acceptance_failed";
  if (result.details?.stopped || child?.stopped || child?.interrupted) return "interrupted";
  if (result.isError || child?.error || typeof child?.exitCode === "number" && child.exitCode !== 0) return "failed";
  return "completed";
}
var MAX_RESULT_BYTES = 1024 * 1024;
function toSubagentDelegationResponse(request, result, aborted) {
  const child = result.details?.results?.[0];
  const progress = child?.progressSummary ?? result.details?.progress?.[0];
  let status = resolveSubagentDelegationStatus(result, aborted);
  let error = child?.error ?? (status === "failed" ? firstTextContent(result.content) : void 0);
  let projectedResult;
  if (status === "completed") {
    if (request.result.kind === "text") {
      if (typeof child?.finalOutput !== "string") {
        status = "failed";
        error = "Delegated subagent did not capture a text result.";
      } else if (Buffer.byteLength(child.finalOutput, "utf8") > MAX_RESULT_BYTES) {
        status = "failed";
        error = "Delegated text result exceeds 1 MiB when UTF-8 encoded.";
      } else {
        projectedResult = { kind: "text", text: child.finalOutput };
      }
    } else if (child?.structuredOutput === void 0) {
      status = "failed";
      error = "Delegated subagent did not capture the requested structured result.";
    } else {
      const inspected = cloneJsonWithinByteLimit(child.structuredOutput, MAX_RESULT_BYTES);
      if (inspected.ok === false) {
        status = "failed";
        error = inspected.reason === "too_large" ? "Delegated structured result exceeds 1 MiB when encoded." : "Delegated structured result is not plain JSON data.";
      } else {
        projectedResult = { kind: "structured", value: inspected.value };
      }
    }
  }
  const usage = child?.usage;
  const childLaunchContractDigest = child?.launchContractDigest;
  return {
    requestId: request.requestId,
    ownerRunId: request.ownerRunId,
    nodeId: request.nodeId,
    status,
    ...error ? { error } : {},
    ...result.details?.runId ? { runId: result.details.runId } : {},
    ...child?.agent ? { agent: child.agent } : {},
    ...child?.model ? { model: child.model } : {},
    ...child?.thinking ? { thinking: child.thinking } : {},
    ...typeof child?.exitCode === "number" ? { exitCode: child.exitCode } : {},
    ...childLaunchContractDigest ? { launchContractDigest: childLaunchContractDigest } : {},
    ...projectedResult ? { result: projectedResult } : {},
    ...child?.providerDiagnostics ? {
      providerDiagnostics: snapshotProviderDiagnostics(clearProviderRetry(child.providerDiagnostics))
    } : {},
    ...usage ? {
      usage: {
        input: usage.input,
        output: usage.output,
        cacheRead: usage.cacheRead,
        cacheWrite: usage.cacheWrite,
        cost: usage.cost,
        turns: usage.turns,
        toolCalls: progress?.toolCount ?? 0,
        durationMs: progress?.durationMs ?? 0
      }
    } : {}
  };
}
function toPromptTemplateResponse(request, result) {
  const contentText2 = firstTextContent(result.content);
  const messages = buildDelegationMessages(result.details?.results?.[0] ?? {}, contentText2);
  return {
    ...request,
    messages,
    ...contentText2 ? { contentText: contentText2 } : {},
    isError: result.isError === true,
    errorText: result.isError ? contentText2 : void 0
  };
}

// src/slash/prompt-template-bridge.ts
var PROMPT_TEMPLATE_SUBAGENT_REQUEST_EVENT = SUBAGENT_DELEGATION_REQUEST_EVENT;
var PROMPT_TEMPLATE_SUBAGENT_STARTED_EVENT = SUBAGENT_DELEGATION_STARTED_EVENT;
var PROMPT_TEMPLATE_SUBAGENT_RESPONSE_EVENT = SUBAGENT_DELEGATION_RESPONSE_EVENT;
var PROMPT_TEMPLATE_SUBAGENT_UPDATE_EVENT = SUBAGENT_DELEGATION_UPDATE_EVENT;
var PROMPT_TEMPLATE_SUBAGENT_CANCEL_EVENT = SUBAGENT_DELEGATION_CANCEL_EVENT;
function hasStructuredDelegationMarker(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const value = data;
  return Object.hasOwn(value, "ownerRunId") || Object.hasOwn(value, "nodeId") || Object.hasOwn(value, "result") || Object.hasOwn(value, "version");
}
function validId(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256 && !/[\r\n]/.test(value);
}
function sameStringArray(left, right) {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}
function sameRecentTools(left, right) {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((tool, index) => tool.tool === right[index]?.tool && tool.args === right[index]?.args);
}
function sameUpdateUsage(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.input === right.input && left.output === right.output && left.cacheRead === right.cacheRead && left.cacheWrite === right.cacheWrite && left.turns === right.turns;
}
function sameStructuredDelegationUpdateProgress(left, right) {
  return left.requestId === right.requestId && left.ownerRunId === right.ownerRunId && left.nodeId === right.nodeId && left.runId === right.runId && left.currentTool === right.currentTool && left.currentToolArgs === right.currentToolArgs && left.recentOutput === right.recentOutput && sameStringArray(left.recentOutputLines, right.recentOutputLines) && sameRecentTools(left.recentTools, right.recentTools) && left.model === right.model && left.toolCount === right.toolCount && left.tokens === right.tokens && sameUpdateUsage(left.usage, right.usage) && sameProviderDiagnostics(left.providerDiagnostics, right.providerDiagnostics);
}
function registerPromptTemplateDelegationBridge(options) {
  const legacyControllers = /* @__PURE__ */ new Map();
  const pendingLegacyCancels = /* @__PURE__ */ new Map();
  const attemptControllers = /* @__PURE__ */ new Map();
  const pendingAttemptCancels = /* @__PURE__ */ new Map();
  const activeOwnedNodes = /* @__PURE__ */ new Map();
  const settledAttempts = /* @__PURE__ */ new Map();
  const subscriptions = [];
  let disposed = false;
  let identitySaturated = false;
  const subscribe = (event, handler) => {
    const unsubscribe = options.events.on(event, handler);
    if (typeof unsubscribe === "function") subscriptions.push(unsubscribe);
  };
  const ownsLegacyRequest = (requestId, controller) => !disposed && legacyControllers.get(requestId) === controller;
  const ownsAttempt = (attemptKey2, controller) => !disposed && attemptControllers.get(attemptKey2) === controller;
  const boundedRemember = (map, key) => {
    map.delete(key);
    map.set(key, true);
    while (map.size > 256) {
      const oldest = map.keys().next().value;
      if (typeof oldest !== "string") break;
      map.delete(oldest);
    }
  };
  const rememberIdentity = (map, key) => {
    if (map.has(key) || identitySaturated) return;
    if (map.size >= 8192) {
      identitySaturated = true;
      return;
    }
    map.set(key, true);
    if (map.size === 8192) {
      identitySaturated = true;
    }
  };
  const nodeKey = (ownerRunId, nodeId) => JSON.stringify([ownerRunId, nodeId]);
  const attemptKey = (requestId, ownerRunId, nodeId) => JSON.stringify([requestId, ownerRunId, nodeId]);
  const rememberPendingLegacyCancel = (requestId) => {
    boundedRemember(pendingLegacyCancels, requestId);
  };
  const emitTerminal = (key, payload) => {
    if (disposed || settledAttempts.has(key)) return;
    rememberIdentity(settledAttempts, key);
    options.events.emit(SUBAGENT_DELEGATION_RESPONSE_EVENT, payload);
  };
  subscribe(PROMPT_TEMPLATE_SUBAGENT_CANCEL_EVENT, (data) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return;
    const value = data;
    const requestId = value.requestId;
    if (!validId(requestId)) return;
    if (hasStructuredDelegationMarker(data)) {
      if (Object.keys(value).some((key2) => key2 !== "requestId" && key2 !== "ownerRunId" && key2 !== "nodeId")) return;
      const ownerRunId = value.ownerRunId;
      const nodeId = value.nodeId;
      if (!validId(ownerRunId) || !validId(nodeId)) return;
      const key = attemptKey(requestId, ownerRunId, nodeId);
      const controller2 = attemptControllers.get(key);
      if (controller2) controller2.abort();
      else rememberIdentity(pendingAttemptCancels, key);
      return;
    }
    const controller = legacyControllers.get(requestId);
    if (controller) {
      controller.abort();
      return;
    }
    rememberPendingLegacyCancel(requestId);
  });
  subscribe(PROMPT_TEMPLATE_SUBAGENT_REQUEST_EVENT, async (data) => {
    const structuredPayload = hasStructuredDelegationMarker(data);
    let requestId;
    let params;
    let structuredRequest;
    let key;
    let legacyRequest;
    if (structuredPayload) {
      const parsed = parseSubagentDelegationRequest(data);
      if (parsed.ok === false) {
        if (!disposed && parsed.requestId) {
          const payload = {
            requestId: parsed.requestId,
            ...parsed.ownerRunId ? { ownerRunId: parsed.ownerRunId } : {},
            ...parsed.nodeId ? { nodeId: parsed.nodeId } : {},
            status: "invalid_request",
            error: parsed.error
          };
          if (parsed.ownerRunId && parsed.nodeId) {
            const attemptedKey = attemptKey(parsed.requestId, parsed.ownerRunId, parsed.nodeId);
            if (!attemptControllers.has(attemptedKey)) emitTerminal(attemptedKey, payload);
          } else {
            options.events.emit(SUBAGENT_DELEGATION_RESPONSE_EVENT, payload);
          }
        }
        return;
      }
      structuredRequest = parsed.request;
      requestId = parsed.request.requestId;
      key = attemptKey(requestId, parsed.request.ownerRunId, parsed.request.nodeId);
      params = toSubagentDelegationExecutionParams(parsed.request);
    } else {
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const legacy = data;
        if ((legacy.tasks !== void 0 || legacy.worktree !== void 0) && typeof legacy.requestId === "string" && legacy.requestId) {
          options.events.emit(PROMPT_TEMPLATE_SUBAGENT_RESPONSE_EVENT, {
            requestId: legacy.requestId,
            messages: [],
            isError: true,
            errorText: "Legacy prompt-template tasks/worktree orchestration was removed; use a workflow script."
          });
          return;
        }
      }
      legacyRequest = parsePromptTemplateRequest(data);
      if (!legacyRequest) return;
      options.events.emit(PROMPT_TEMPLATE_SUBAGENT_RESPONSE_EVENT, {
        ...legacyRequest,
        messages: [],
        isError: true,
        errorText: "Legacy prompt-template direct delegation was removed; use a workflow script through the subagent tool or structured delegation."
      });
      return;
    }
    if (!structuredRequest && legacyControllers.has(requestId)) return;
    if (structuredRequest && key) {
      if (attemptControllers.has(key) || settledAttempts.has(key)) return;
      if (pendingAttemptCancels.delete(key)) {
        emitTerminal(key, {
          requestId,
          ownerRunId: structuredRequest.ownerRunId,
          nodeId: structuredRequest.nodeId,
          status: "cancelled"
        });
        return;
      }
      if (identitySaturated) {
        options.events.emit(SUBAGENT_DELEGATION_RESPONSE_EVENT, {
          requestId,
          ownerRunId: structuredRequest.ownerRunId,
          nodeId: structuredRequest.nodeId,
          status: "unavailable_context",
          error: "Delegation identity capacity is exhausted for this extension context."
        });
        return;
      }
      const active = activeOwnedNodes.get(nodeKey(structuredRequest.ownerRunId, structuredRequest.nodeId));
      if (active) {
        emitTerminal(key, {
          requestId,
          ownerRunId: structuredRequest.ownerRunId,
          nodeId: structuredRequest.nodeId,
          status: "duplicate_node"
        });
        return;
      }
    }
    const ctx = options.getContext();
    if (!ctx) {
      if (structuredRequest && key) {
        emitTerminal(key, {
          requestId,
          ownerRunId: structuredRequest.ownerRunId,
          nodeId: structuredRequest.nodeId,
          status: "unavailable_context",
          error: "No active extension context for delegated subagent execution."
        });
      } else if (legacyRequest) {
        options.events.emit(PROMPT_TEMPLATE_SUBAGENT_RESPONSE_EVENT, {
          ...legacyRequest,
          messages: [],
          isError: true,
          errorText: "No active extension context for delegated subagent execution."
        });
      }
      return;
    }
    const controller = new AbortController();
    if (structuredRequest && key) {
      attemptControllers.set(key, controller);
      activeOwnedNodes.set(nodeKey(structuredRequest.ownerRunId, structuredRequest.nodeId), { attemptKey: key, controller });
    } else {
      legacyControllers.set(requestId, controller);
      if (pendingLegacyCancels.delete(requestId)) controller.abort();
    }
    if (controller.signal.aborted) {
      if (structuredRequest && key) {
        emitTerminal(key, {
          requestId,
          ownerRunId: structuredRequest.ownerRunId,
          nodeId: structuredRequest.nodeId,
          status: "cancelled"
        });
        activeOwnedNodes.delete(nodeKey(structuredRequest.ownerRunId, structuredRequest.nodeId));
      } else if (legacyRequest) {
        options.events.emit(PROMPT_TEMPLATE_SUBAGENT_RESPONSE_EVENT, {
          ...legacyRequest,
          messages: [],
          isError: true,
          errorText: "Delegated prompt cancelled."
        });
      }
      if (key) attemptControllers.delete(key);
      else legacyControllers.delete(requestId);
      return;
    }
    options.events.emit(
      structuredRequest ? SUBAGENT_DELEGATION_STARTED_EVENT : PROMPT_TEMPLATE_SUBAGENT_STARTED_EVENT,
      structuredRequest ? { requestId, ownerRunId: structuredRequest.ownerRunId, nodeId: structuredRequest.nodeId } : { requestId }
    );
    try {
      const executeRequest = structuredRequest && options.executeStructured ? options.executeStructured : options.execute;
      let lastStructuredUpdate;
      const result = await executeRequest(
        requestId,
        params,
        controller.signal,
        ctx,
        (update) => {
          if (key ? !ownsAttempt(key, controller) : !ownsLegacyRequest(requestId, controller)) return;
          if (structuredRequest) {
            const payload2 = toSubagentDelegationUpdate(structuredRequest, update);
            if (payload2 && (!lastStructuredUpdate || !sameStructuredDelegationUpdateProgress(lastStructuredUpdate, payload2))) {
              lastStructuredUpdate = payload2;
              options.events.emit(SUBAGENT_DELEGATION_UPDATE_EVENT, payload2);
            }
            return;
          }
          const payload = toDelegationUpdate(requestId, update);
          if (payload) options.events.emit(PROMPT_TEMPLATE_SUBAGENT_UPDATE_EVENT, payload);
        }
      );
      if (key ? !ownsAttempt(key, controller) : !ownsLegacyRequest(requestId, controller)) return;
      if (structuredRequest && key) {
        emitTerminal(key, toSubagentDelegationResponse(structuredRequest, result, controller.signal.aborted));
      } else if (legacyRequest) {
        options.events.emit(
          PROMPT_TEMPLATE_SUBAGENT_RESPONSE_EVENT,
          controller.signal.aborted ? { ...legacyRequest, messages: [], isError: true, errorText: "Delegated prompt cancelled." } : toPromptTemplateResponse(legacyRequest, result)
        );
      }
    } catch (error) {
      if (key ? !ownsAttempt(key, controller) : !ownsLegacyRequest(requestId, controller)) return;
      if (structuredRequest && key) {
        emitTerminal(key, {
          requestId,
          ownerRunId: structuredRequest.ownerRunId,
          nodeId: structuredRequest.nodeId,
          status: controller.signal.aborted ? "cancelled" : "failed",
          ...controller.signal.aborted ? {} : { error: error instanceof Error ? error.message : String(error) }
        });
      } else if (legacyRequest) {
        options.events.emit(PROMPT_TEMPLATE_SUBAGENT_RESPONSE_EVENT, {
          ...legacyRequest,
          messages: [],
          isError: true,
          errorText: error instanceof Error ? error.message : String(error)
        });
      }
    } finally {
      if (key) {
        if (attemptControllers.get(key) === controller) attemptControllers.delete(key);
      } else if (legacyControllers.get(requestId) === controller) legacyControllers.delete(requestId);
      if (structuredRequest) {
        const ownedNodeKey = nodeKey(structuredRequest.ownerRunId, structuredRequest.nodeId);
        if (activeOwnedNodes.get(ownedNodeKey)?.controller === controller) activeOwnedNodes.delete(ownedNodeKey);
      }
    }
  });
  return {
    cancelAll: () => {
      for (const controller of legacyControllers.values()) controller.abort();
      for (const controller of attemptControllers.values()) controller.abort();
      legacyControllers.clear();
      attemptControllers.clear();
      pendingLegacyCancels.clear();
      pendingAttemptCancels.clear();
      activeOwnedNodes.clear();
      settledAttempts.clear();
      identitySaturated = false;
    },
    dispose: () => {
      disposed = true;
      for (const controller of legacyControllers.values()) controller.abort();
      for (const controller of attemptControllers.values()) controller.abort();
      legacyControllers.clear();
      attemptControllers.clear();
      for (const unsubscribe of subscriptions) unsubscribe();
      subscriptions.length = 0;
      pendingLegacyCancels.clear();
      pendingAttemptCancels.clear();
      activeOwnedNodes.clear();
      settledAttempts.clear();
    }
  };
}

// src/slash/slash-bridge.ts
function registerSlashSubagentBridge(options) {
  const controllers = /* @__PURE__ */ new Map();
  const pendingCancels = /* @__PURE__ */ new Set();
  const subscriptions = [];
  const subscribe = (event, handler) => {
    const unsubscribe = options.events.on(event, handler);
    if (typeof unsubscribe === "function") subscriptions.push(unsubscribe);
  };
  subscribe(SLASH_SUBAGENT_CANCEL_EVENT, (data) => {
    if (!data || typeof data !== "object") return;
    const requestId = data.requestId;
    if (typeof requestId !== "string") return;
    const controller = controllers.get(requestId);
    if (controller) {
      controller.abort();
      return;
    }
    pendingCancels.add(requestId);
  });
  subscribe(SLASH_SUBAGENT_REQUEST_EVENT, async (data) => {
    if (!data || typeof data !== "object") return;
    const request = data;
    if (typeof request.requestId !== "string" || !request.params) return;
    const { requestId } = request;
    const normalized = normalizePublicSubagentExecution(request.params);
    if (!normalized.ok) {
      options.events.emit(SLASH_SUBAGENT_RESPONSE_EVENT, {
        requestId,
        result: {
          content: [{ type: "text", text: normalized.error }],
          isError: true,
          details: { mode: normalized.mode, results: [] }
        },
        isError: true,
        errorText: normalized.error
      });
      return;
    }
    const params = normalized.params;
    const ctx = request.ctx ?? options.getContext();
    if (!ctx) {
      const response = {
        requestId,
        result: {
          content: [{ type: "text", text: "No active extension context for slash subagent execution." }],
          details: { mode: "single", results: [] }
        },
        isError: true,
        errorText: "No active extension context."
      };
      options.events.emit(SLASH_SUBAGENT_RESPONSE_EVENT, response);
      return;
    }
    const controller = new AbortController();
    controllers.set(requestId, controller);
    if (pendingCancels.delete(requestId)) {
      controller.abort();
      const response = {
        requestId,
        result: {
          content: [{ type: "text", text: "Cancelled." }],
          details: { mode: "single", results: [] }
        },
        isError: true,
        errorText: "Cancelled before start."
      };
      options.events.emit(SLASH_SUBAGENT_RESPONSE_EVENT, response);
      controllers.delete(requestId);
      return;
    }
    options.events.emit(SLASH_SUBAGENT_STARTED_EVENT, { requestId });
    try {
      const result = await options.execute(
        requestId,
        params,
        controller.signal,
        (update) => {
          const progress = update.details?.progress;
          const first = progress?.[0];
          const payload = {
            requestId,
            progress,
            currentTool: first?.currentTool,
            toolCount: first?.toolCount
          };
          options.events.emit(SLASH_SUBAGENT_UPDATE_EVENT, payload);
        },
        ctx
      );
      const response = {
        requestId,
        result,
        isError: result.isError === true,
        errorText: result.isError ? result.content.find((c) => c.type === "text")?.text : void 0
      };
      options.events.emit(SLASH_SUBAGENT_RESPONSE_EVENT, response);
    } catch (error) {
      const response = {
        requestId,
        result: {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          details: { mode: "single", results: [] }
        },
        isError: true,
        errorText: error instanceof Error ? error.message : String(error)
      };
      options.events.emit(SLASH_SUBAGENT_RESPONSE_EVENT, response);
    } finally {
      controllers.delete(requestId);
    }
  });
  return {
    cancelAll: () => {
      for (const controller of controllers.values()) {
        controller.abort();
      }
      controllers.clear();
      pendingCancels.clear();
    },
    dispose: () => {
      for (const unsubscribe of subscriptions) unsubscribe();
      subscriptions.length = 0;
      pendingCancels.clear();
    }
  };
}

// src/tui/subagent-messages.ts
import { getMarkdownTheme, keyText as keyText2 } from "@earendil-works/pi-coding-agent";
import { Box, Container as Container2, Markdown, MouseRegion, Spacer as Spacer2, truncateToWidth as truncateToWidth2 } from "@earendil-works/pi-tui";

// src/extension/control-notices.ts
var SUBAGENT_CONTROL_MESSAGE_TYPE = "subagent_control_notice";
function deliverControlNotice(input) {
  const childIntercomTarget = input.details.childIntercomTarget;
  const key = controlNotificationKey(input.details.event, childIntercomTarget);
  if (input.visibleControlNotices.has(key)) return;
  input.visibleControlNotices.add(key);
  const noticeText = input.details.noticeText ?? formatControlNoticeMessage(input.details.event, childIntercomTarget);
  input.pi.sendMessage(
    {
      customType: SUBAGENT_CONTROL_MESSAGE_TYPE,
      content: noticeText,
      display: true,
      details: { ...input.details, childIntercomTarget, noticeText }
    },
    { triggerTurn: input.details.source === "async" }
  );
}
function handleSubagentControlNotice(input) {
  if (!input.details?.event || input.details.event.type === "active_long_running") return;
  if (input.details.noticeDeferred) return;
  if (input.details.source === "foreground") {
    return;
  }
  deliverControlNotice(input);
}

// src/extension/steering-notices.ts
var SUBAGENT_STEERING_MESSAGE_TYPE = "subagent_steering_notice";
function formatSteeringNotice(details) {
  return [
    `Subagent steering ${details.state}: ${details.runId}`,
    `Request: ${details.requestId}`,
    details.message,
    "Inspect the run status before sending another correction."
  ].join("\n");
}
function handleSubagentSteeringNotice(input) {
  if (!input.details || input.details.state !== "failed" && input.details.state !== "partial" && input.details.state !== "recovered") return;
  if (!input.state.currentSessionId || input.details.currentSessionId !== input.state.currentSessionId) return;
  const noticeText = input.details.noticeText ?? formatSteeringNotice(input.details);
  input.pi.sendMessage({
    customType: SUBAGENT_STEERING_MESSAGE_TYPE,
    content: noticeText,
    display: true,
    details: { ...input.details, noticeText }
  }, { triggerTurn: true });
}

// src/watchdog/render.ts
function titleCase(value) {
  return value.split("-").map((part) => part ? `${part[0]?.toUpperCase()}${part.slice(1)}` : part).join(" ");
}
function stateLabels(warning) {
  const labels = [];
  if (warning.state === "displayed") labels.push("displayed");
  if (warning.stale || warning.state === "stale") labels.push("stale");
  if (warning.state === "failed") labels.push("failed review");
  if (warning.state === "stalemate") labels.push("stalemate");
  return labels;
}
function formatWatchdogWarningRenderText(warning) {
  const labels = stateLabels(warning);
  const subject = warning.severity === "blocker" ? "Blocker" : "Concern";
  const lines = [
    `Subagent watchdog ${subject}${labels.length ? ` (${labels.join(", ")})` : ""}: ${warning.summary}`,
    `Evidence: ${warning.evidence}`,
    `Recommended action: ${warning.recommendedAction}`,
    `Importance: ${titleCase(warning.importance)} \xB7 Category: ${titleCase(warning.category)} \xB7 Source: ${warning.source}${warning.agent ? ` \xB7 Agent: ${warning.agent}` : ""}${warning.runId ? ` \xB7 Run: ${warning.runId}` : ""}`
  ];
  if (warning.state === "failed" && warning.error) lines.push(`Failure: ${warning.error}`);
  if (warning.state === "stalemate" && warning.stalemateRepeats !== void 0) {
    lines.push(`Same warning ${warning.stalemateRepeats} time${warning.stalemateRepeats === 1 ? "" : "s"} in a row; the watchdog stopped continuing the run.`);
  }
  if (warning.stale || warning.state === "stale") lines.push("This warning arrived after the watchdog catch-up timeout.");
  return lines.join("\n");
}

// src/tui/subagent-messages.ts
var KIND_LABEL_COLORS = {
  ask: "customMessageLabel",
  attention: "customMessageLabel",
  reply: "customMessageText",
  result: "mdLink",
  watchdog: "toolTitle"
};
var STATUS_TONES = /* @__PURE__ */ new Map([
  ["completed", "success"],
  ["failed", "error"],
  ["partial", "error"],
  ["blocked", "error"],
  ["unhandled", "error"],
  ["blocker", "error"],
  ["save failed", "error"],
  ["reconciliation failed", "error"],
  ["could not be reconciled", "error"],
  ["paused", "warning"],
  ["stopped", "warning"],
  ["recovered", "warning"],
  ["unanswered", "warning"],
  ["concern", "warning"],
  ["timed out", "warning"],
  ["needs attention", "warning"],
  ["needs a decision", "warning"],
  ["needs clarification", "warning"],
  ["asks for structured answers", "warning"]
]);
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => isRecord3(part) && typeof part.text === "string" ? [part.text] : []).join("\n");
}
function readsContent(kind, headline) {
  return (message2) => ({ kind, headline: headline(message2), body: contentText(message2.content) });
}
function supervisorRequestHeadline(details) {
  const request = parseSupervisorRequestDetails(details);
  if (!request?.agent) return ["supervisor request"];
  if (request.reason === "interview_request") return [`${request.agent} `, { status: "asks for structured answers" }];
  if (request.reason === "progress_update") return [`${request.agent} sent a progress update`];
  return [`${request.agent} `, { status: "needs a decision" }];
}
function controlNoticeHeadline(details) {
  const event = isRecord3(details) ? details.event : void 0;
  if (!isRecord3(event) || typeof event.agent !== "string" || typeof event.type !== "string") return ["subagent notice"];
  if (event.type === "needs_attention") return [`${event.agent} `, { status: "needs attention" }];
  return [`${event.agent} ${event.type.replaceAll("_", " ")}`];
}
function steeringNoticeHeadline(details) {
  if (!isRecord3(details) || typeof details.runId !== "string") return ["steering notice"];
  const { state } = details;
  if (state !== "failed" && state !== "partial" && state !== "recovered") return ["steering notice"];
  return [`steering for run ${details.runId} `, { status: state }];
}
var RUN_STATUSES = ["completed", "failed", "paused", "stopped"];
function isRunStatus(value) {
  return RUN_STATUSES.some((status) => status === value);
}
function completionRuns(message2) {
  const runs = isRecord3(message2.details) ? message2.details.runs : void 0;
  if (Array.isArray(runs)) {
    const parsed = runs.flatMap((run) => isRecord3(run) && typeof run.agent === "string" && isRunStatus(run.status) ? [{ agent: run.agent, status: run.status }] : []);
    if (parsed.length === runs.length && parsed.length > 0) return parsed;
  }
  const saved = parseSubagentNotifyContent(contentText(message2.content));
  return saved ? [{ agent: saved.agent, status: saved.status }] : void 0;
}
function completionHeadline(message2) {
  const runs = completionRuns(message2);
  if (runs?.length === 1) return [`${runs[0].agent} `, { status: runs[0].status }];
  if (runs) {
    if (runs.every((run) => run.status === "completed")) return [`${runs.length} background runs `, { status: "completed" }];
    const counts = ["failed", "paused", "stopped"].flatMap((status) => {
      const count = runs.filter((run) => run.status === status).length;
      return count ? [` \xB7 ${count} `, { status }] : [];
    });
    return [`${runs.length} background runs finished`, ...counts];
  }
  const grouped = /^Background tasks completed \((\d+)\):/.exec(contentText(message2.content));
  return grouped ? [`${grouped[1]} background runs finished`] : ["background run finished"];
}
function supervisorReminderHeadline(details, status) {
  const ids = isRecord3(details) ? details.requestIds : void 0;
  if (!Array.isArray(ids) || ids.length === 0) return ["supervisor requests ", { status }];
  return [`${ids.length} supervisor ${ids.length === 1 ? "request" : "requests"} `, { status }];
}
function waitSubscriptionHeadline(details) {
  if (!isRecord3(details) || typeof details.runId !== "string" || typeof details.outcome !== "string") return ["bg_wait fired"];
  return [`bg_wait: run ${details.runId} `, { status: details.outcome }];
}
function workflowChildHeadline(message2) {
  const { details } = message2;
  if (isRecord3(details) && typeof details.childKey === "string" && isRunStatus(details.outcome)) {
    return [`workflow child ${details.childKey} `, { status: details.outcome }];
  }
  const saved = /^Workflow child (completed|failed|paused|stopped)(?: \(needs attention\))?: \*\*(.+)\*\*$/m.exec(contentText(message2.content));
  return saved ? [`workflow child ${saved[2]} `, { status: saved[1] }] : ["workflow child update"];
}
function isWatchdogWarning(value) {
  if (!isRecord3(value)) return false;
  return WATCHDOG_WARNING_SEVERITIES.some((known) => known === value.severity) && WATCHDOG_WARNING_IMPORTANCES.some((known) => known === value.importance) && (value.category === void 0 || typeof value.category === "string") && typeof value.summary === "string" && typeof value.evidence === "string" && typeof value.recommendedAction === "string";
}
function watchdogWarningView(details, fallbackBody) {
  if (!isWatchdogWarning(details)) return { kind: "watchdog", headline: ["watchdog warning"], body: fallbackBody };
  const labels = stateLabels(details).filter((label) => label !== "displayed");
  return {
    kind: "watchdog",
    headline: ["watchdog ", { status: details.severity }, ...labels.length ? [` \xB7 ${labels.join(", ")}`] : []],
    body: formatWatchdogWarningRenderText(normalizeWatchdogWarningDetails(details))
  };
}
function supervisorReplyView(data) {
  const reply = parseSupervisorReplyData(data);
  if (!reply) return { kind: "reply", headline: ["supervisor reply"], body: "" };
  return {
    kind: "reply",
    headline: [`reply sent to ${reply.agent}`],
    body: [
      `Request: ${reply.requestId}`,
      `Run: ${reply.runId}`,
      `Child index: ${reply.childIndex}`,
      ...reply.childTarget ? [`Child target: ${reply.childTarget}`] : [],
      "",
      reply.message
    ].join("\n")
  };
}
var MESSAGE_VIEWS = /* @__PURE__ */ new Map([
  [SUPERVISOR_REQUEST_MESSAGE_TYPE, readsContent("ask", (message2) => supervisorRequestHeadline(message2.details))],
  ["subagent-supervisor-unanswered", readsContent("ask", (message2) => supervisorReminderHeadline(message2.details, "unanswered"))],
  ["subagent-supervisor-blocked", readsContent("ask", (message2) => supervisorReminderHeadline(message2.details, "blocked"))],
  ["subagent-notify", readsContent("result", completionHeadline)],
  ["subagent-completion-unanswered", readsContent("result", () => ["completion results ", { status: "unanswered" }])],
  ["subagent-completion-unhandled", readsContent("result", () => ["completion results ", { status: "unhandled" }])],
  ["subagent-wait-subscription", readsContent("result", (message2) => waitSubscriptionHeadline(message2.details))],
  ["subagent-incremental-child-notify", readsContent("result", workflowChildHeadline)],
  ["subagent-workflow-result-write-failed", readsContent("result", () => ["workflow result ", { status: "save failed" }])],
  ["subagent-auto-resume", readsContent("result", () => ["workflow auto-resume ", { status: "failed" }])],
  [SUBAGENT_CONTROL_MESSAGE_TYPE, readsContent("attention", (message2) => controlNoticeHeadline(message2.details))],
  [SUBAGENT_STEERING_MESSAGE_TYPE, readsContent("attention", (message2) => steeringNoticeHeadline(message2.details))],
  [SUBAGENT_WATCHDOG_WARNING_TYPE, (message2) => watchdogWarningView(message2.details, contentText(message2.content))],
  ["subagent_watchdog_clarification", readsContent("watchdog", () => ["watchdog ", { status: "needs clarification" }])]
]);
var ENTRY_VIEWS = /* @__PURE__ */ new Map([
  [SUPERVISOR_REPLY_ENTRY_TYPE, (entry) => supervisorReplyView(entry.data)],
  [SUBAGENT_WATCHDOG_WARNING_TYPE, (entry) => watchdogWarningView(entry.data, "")]
]);
var SUBAGENT_MESSAGE_TYPES = [...MESSAGE_VIEWS.keys()];
var SUBAGENT_ENTRY_TYPES = [...ENTRY_VIEWS.keys()];
function headlineText(headline, theme) {
  let text = "";
  let plain = "";
  for (const part of headline) {
    const word = typeof part === "string" ? part : part.status;
    const tone = typeof part === "string" ? void 0 : STATUS_TONES.get(part.status);
    if (!tone) {
      plain += word;
      continue;
    }
    if (plain) text += theme.fg("customMessageText", safeTerminalText(plain));
    plain = "";
    text += theme.fg(tone, word);
  }
  return plain ? text + theme.fg("customMessageText", safeTerminalText(plain)) : text;
}
var clickedBlocks = /* @__PURE__ */ new WeakMap();
var SubagentMessageBlock = class extends Box {
  source;
  view;
  expandedByPi;
  theme;
  constructor(source, view, expandedByPi, theme) {
    super(1, 1, (text) => theme.bg("customMessageBg", text));
    this.source = source;
    this.view = view;
    this.expandedByPi = expandedByPi;
    this.theme = theme;
    const clicked = clickedBlocks.get(source);
    if (clicked && clicked.expandedByPi !== expandedByPi) clickedBlocks.delete(source);
    this.rebuild();
  }
  isExpanded() {
    return clickedBlocks.get(this.source)?.expanded ?? this.expandedByPi;
  }
  rebuild() {
    const { theme, view } = this;
    const content = new Container2();
    const title = `${theme.fg(KIND_LABEL_COLORS[view.kind], theme.bold("[subagent]"))} ${headlineText(view.headline, theme)}`;
    const expanded = this.isExpanded();
    const line = expanded ? title : `${title} ${theme.fg("dim", `(${keyText2("app.tools.expand") || "click"} to expand)`)}`;
    content.addChild({ render: (width) => [truncateToWidth2(line, width, "\u2026")], invalidate() {
    } });
    if (expanded && view.body.trim()) {
      content.addChild(new Spacer2(1));
      content.addChild(new Markdown(safeTerminalText(view.body), 0, 0, getMarkdownTheme(), { color: (text) => theme.fg("customMessageText", text) }));
    }
    this.clear();
    this.addChild(new MouseRegion(content, (event) => {
      if (event.type !== "click" || event.button !== "left") return void 0;
      clickedBlocks.set(this.source, { expandedByPi: this.expandedByPi, expanded: !this.isExpanded() });
      this.rebuild();
      return { handled: true };
    }));
  }
};
function renderSubagentMessage(message2, options, theme) {
  const view = MESSAGE_VIEWS.get(message2.customType)?.(message2);
  return view ? new SubagentMessageBlock(message2, view, options.expanded, theme) : void 0;
}
function renderSubagentEntry(entry, options, theme) {
  const view = ENTRY_VIEWS.get(entry.customType)?.(entry);
  return view ? new SubagentMessageBlock(entry, view, options.expanded, theme) : void 0;
}

// src/integrations/program-status.ts
import { createHash } from "node:crypto";
var ID_ROOT = "subagents";
var MAX_RECORDS = 64;
var MAX_MSG_BYTES = 2048;
var MAX_TITLE_BYTES = 192;
var RUN_SEGMENT_CHARS = 12;
var MAX_KEY_CHARS = 32 - RUN_SEGMENT_CHARS - 1;
function segment(value) {
  return value.replace(/[^A-Za-z0-9_+-]/g, "-");
}
function runSegment(runId) {
  return segment(runId.replace(/-/g, "").slice(0, RUN_SEGMENT_CHARS));
}
function keySegment(key) {
  if (key.length <= MAX_KEY_CHARS && /^[A-Za-z0-9_+-]+$/.test(key)) return key;
  return `${segment(key).slice(0, 12)}-${createHash("sha1").update(key).digest("hex").slice(0, 6)}`;
}
function recordId(job) {
  if (job.parentWorkflowRunId && job.workflowKey) {
    const parent = runSegment(job.parentWorkflowRunId);
    return parent ? `${ID_ROOT}/${parent}.${keySegment(job.workflowKey)}` : void 0;
  }
  const run = runSegment(job.asyncId);
  return run ? `${ID_ROOT}/${run}` : void 0;
}
function programState(job, blocked) {
  switch (job.status) {
    case "queued":
    case "running":
      return blocked ? "blocked" : "working";
    case "complete":
      return "done";
    case "failed":
    case "partial":
    case "rejected":
      return "error";
    case "stopped":
    case "paused":
      return "idle";
  }
}
function jobLabel(job) {
  if (job.workflowKey) return job.workflowKey;
  if (job.mode === "workflow") return "workflow";
  const agents = [...new Set(job.agents ?? [])];
  if (agents.length === 0) return "subagent";
  return agents.length > 3 ? `${agents.slice(0, 3).join(", ")} +${agents.length - 3}` : agents.join(", ");
}
function message(job, state) {
  switch (state) {
    case "working":
      return job.currentTool ? `Running ${job.currentTool}` : "Running";
    case "blocked":
      return "Waiting for a reply";
    case "done":
      return "Finished";
    case "error":
      return job.status === "partial" ? "Finished with failures" : job.status === "rejected" ? "Rejected" : "Failed";
    case "idle":
      return job.status === "paused" ? "Paused" : "Stopped";
  }
}
function encodeText(text, maxBytes) {
  let bytes = Buffer.from(sanitizeDisplayText(text), "utf-8");
  if (bytes.length > maxBytes) {
    let end = maxBytes;
    while (end > 0 && (bytes[end] & 192) === 128) end--;
    bytes = bytes.subarray(0, end);
  }
  return bytes.toString("base64");
}
function programStatusReport(fields) {
  const pairs = [`state=${fields.state}`, `id=${fields.id}`];
  if (fields.state !== "clear") pairs.push("app=pi-subagents");
  if (fields.kind) pairs.push(`kind=${fields.kind}`);
  if (fields.title !== void 0) pairs.push(`title=${encodeText(fields.title, MAX_TITLE_BYTES)}`);
  if (fields.msg !== void 0) pairs.push(`msg=${encodeText(fields.msg, MAX_MSG_BYTES)}`);
  return `\x1B]7501;${pairs.join(":")}\x1B\\`;
}
function registerProgramStatusReporter(options) {
  const write = options.write ?? ((data) => {
    process.stdout.write(data);
  });
  const env = options.env ?? process.env;
  const isTTY = options.isTTY ?? process.stdout.isTTY === true;
  const sent = /* @__PURE__ */ new Map();
  let active = false;
  let parentIdle = true;
  let unansweredAtSettle = /* @__PURE__ */ new Set();
  const resend = () => {
    if (!active) return;
    for (const report of sent.values()) write(report);
  };
  let listeningForResume = false;
  const sync = () => {
    if (!active) return;
    const blockedRuns = /* @__PURE__ */ new Set();
    if (parentIdle) {
      for (const request of options.getPendingRequests()) {
        if (unansweredAtSettle.has(request.id)) blockedRuns.add(request.runId);
      }
    }
    const candidates = [];
    for (const job of options.getJobs()) {
      const id = recordId(job);
      if (!id) continue;
      const state = programState(job, blockedRuns.has(job.asyncId));
      const report = programStatusReport({ state, id, ...state === "blocked" ? { kind: "question" } : {}, title: jobLabel(job), msg: message(job, state) });
      candidates.push({ id, report, active: state === "working" || state === "blocked", updatedAt: job.updatedAt ?? job.startedAt ?? 0 });
    }
    candidates.sort((left, right) => Number(right.active) - Number(left.active) || right.updatedAt - left.updatedAt || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    const desired = /* @__PURE__ */ new Map();
    for (const candidate of candidates) {
      if (desired.size === MAX_RECORDS) break;
      if (!desired.has(candidate.id)) desired.set(candidate.id, candidate.report);
    }
    for (const id of sent.keys()) {
      if (desired.has(id)) continue;
      sent.delete(id);
      write(programStatusReport({ state: "clear", id }));
    }
    for (const [id, report] of desired) {
      if (sent.get(id) === report) continue;
      sent.set(id, report);
      write(report);
    }
  };
  return {
    sessionStarted({ hasUI, mode }) {
      active = options.enabled && hasUI && mode === "tui" && isTTY && env.TERM !== "dumb" && env.PI_PROGRAM_STATUS !== "0";
      if (active && !listeningForResume && process.platform !== "win32") {
        process.on("SIGCONT", resend);
        listeningForResume = true;
      }
      sync();
    },
    sync,
    agentStarted() {
      parentIdle = false;
      sync();
    },
    agentSettled() {
      parentIdle = true;
      unansweredAtSettle = new Set([...options.getPendingRequests()].map((request) => request.id));
      sync();
    },
    dispose(shutdownReason) {
      if (active && shutdownReason !== "quit") {
        for (const id of sent.keys()) write(programStatusReport({ state: "clear", id }));
      }
      sent.clear();
      active = false;
      if (listeningForResume) {
        process.off("SIGCONT", resend);
        listeningForResume = false;
      }
    }
  };
}

// src/runs/background/retained-nested-route-tracker.ts
import * as fs12 from "node:fs";
var DEFAULT_POLL_INTERVAL_MS = 5e3;
var REFRESH_DEBOUNCE_MS = 25;
function createRetainedNestedRouteTracker(state, options = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const watch3 = options.watch ?? fs12.watch;
  const watchers = /* @__PURE__ */ new Map();
  const refreshTimers = /* @__PURE__ */ new Map();
  let poller;
  const close = (rootRunId) => {
    watchers.get(rootRunId)?.close();
    watchers.delete(rootRunId);
    const timer = refreshTimers.get(rootRunId);
    if (timer) clearTimeout(timer);
    refreshTimers.delete(rootRunId);
  };
  const refresh = (rootRunId) => {
    const retained = state.retainedForegroundNestedRoutes?.get(rootRunId);
    if (!retained) {
      close(rootRunId);
      return;
    }
    try {
      if (hasLiveNestedDescendants(projectNestedEvents(retained).children)) return;
      state.retainedForegroundNestedRoutes?.delete(rootRunId);
      close(rootRunId);
    } catch (error) {
      console.error(`Failed to refresh retained nested descendants for foreground run '${rootRunId}':`, error);
    }
  };
  const scheduleRefresh = (rootRunId) => {
    if (refreshTimers.has(rootRunId)) return;
    const timer = setTimeout(() => {
      refreshTimers.delete(rootRunId);
      refresh(rootRunId);
    }, REFRESH_DEBOUNCE_MS);
    timer.unref?.();
    refreshTimers.set(rootRunId, timer);
  };
  const ensurePoller = () => {
    if (poller || (state.retainedForegroundNestedRoutes?.size ?? 0) === 0) return;
    poller = setInterval(() => {
      for (const rootRunId of state.retainedForegroundNestedRoutes?.keys() ?? []) refresh(rootRunId);
      if ((state.retainedForegroundNestedRoutes?.size ?? 0) > 0) return;
      if (poller) clearInterval(poller);
      poller = void 0;
    }, pollIntervalMs);
    poller.unref?.();
  };
  const track = (rootRunId) => {
    const retained = state.retainedForegroundNestedRoutes?.get(rootRunId);
    if (!retained) return;
    if (shouldUseNativeFsWatch("retained-nested-route-tracker", options.platform) && !watchers.has(rootRunId)) {
      try {
        const watcher = watch3(retained.eventSink, () => scheduleRefresh(rootRunId));
        watcher.on("error", () => close(rootRunId));
        watcher.unref?.();
        watchers.set(rootRunId, watcher);
      } catch {
      }
    }
    scheduleRefresh(rootRunId);
    ensurePoller();
  };
  const clear = () => {
    if (poller) clearInterval(poller);
    poller = void 0;
    for (const rootRunId of watchers.keys()) close(rootRunId);
    for (const timer of refreshTimers.values()) clearTimeout(timer);
    refreshTimers.clear();
    state.retainedForegroundNestedRoutes?.clear();
  };
  return { track, clear };
}

// src/extension/rpc.ts
import * as path11 from "node:path";
import { Compile } from "typebox/compile";
var SUBAGENT_RPC_PROTOCOL_VERSION = 1;
var SUBAGENT_RPC_REQUEST_EVENT = "subagents:rpc:v1:request";
var SUBAGENT_RPC_READY_EVENT = "subagents:rpc:v1:ready";
var SUBAGENT_RPC_REPLY_EVENT_PREFIX = "subagents:rpc:v1:reply:";
var SUBAGENT_RPC_METHODS = ["ping", "status", "manage", "spawn", "steer", "interrupt", "stop", "resume", "cost"];
var SUBAGENT_RPC_MANAGEMENT_ACTIONS = [
  "schedule.list",
  "schedule.show",
  "schedule.history",
  "schedule.pause",
  "schedule.resume",
  "schedule.run",
  "schedule.delete"
];
var MAX_FLEET_ENTRIES = 16;
var MAX_FLEET_CANDIDATES = 256;
var MAX_AGENT_LENGTH = 96;
var MAX_GOAL_LENGTH = 512;
var MAX_METADATA_LENGTH = 128;
function displayText(value, maxLength) {
  if (typeof value !== "string") return void 0;
  const normalized = sanitizeDisplayText(value.slice(0, 4096));
  return normalized ? truncateDisplayText(normalized, maxLength) : void 0;
}
function publicTokens(value) {
  const record = isRecord4(value) ? value : {};
  const count = (field) => {
    const raw = record[field];
    return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(raw)) : 0;
  };
  const input = count("input");
  const output = count("output");
  const sum = Math.min(Number.MAX_SAFE_INTEGER, input + output);
  const optionalCount = (field) => {
    const raw = record[field];
    return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(raw)) : void 0;
  };
  const window = optionalCount("window");
  const windowPeak = optionalCount("windowPeak");
  return {
    input,
    output,
    total: Math.max(sum, count("total")),
    ...window !== void 0 ? { window } : {},
    ...windowPeak !== void 0 ? { windowPeak } : {}
  };
}
function activeState(value) {
  return value === "running" || value === "queued" || value === "pending";
}
function buildFleetStatus(state, keyState, sessionId) {
  const authoritativeSessionId = sessionId ?? null;
  if (keyState.sessionId !== authoritativeSessionId) {
    keyState.sessionId = authoritativeSessionId;
    keyState.next = 0;
    keyState.keys.clear();
  }
  if (!state || !authoritativeSessionId || state.currentSessionId !== authoritativeSessionId) {
    keyState.keys.clear();
    return { version: 1, entries: [], totalActive: 0, topLevelAsyncCapacity: { used: 0, limit: 0 }, omitted: 0 };
  }
  let totalActive = 0;
  const asyncOwners = ownerSessionIds(authoritativeSessionId);
  const candidates = [];
  const addCandidate = (candidate) => {
    totalActive += 1;
    if (candidates.length < MAX_FLEET_CANDIDATES) candidates.push(candidate);
  };
  for (const control of state.foregroundControls.values()) {
    if (control.sessionId !== authoritativeSessionId) continue;
    if (control.activeChildren?.size) {
      for (const child of control.activeChildren.values()) addCandidate({
        internalKey: `foreground:${control.runId}:${child.index}`,
        agent: child.agent,
        model: child.model,
        effort: child.thinking,
        startedAt: child.startedAt,
        tokens: { input: child.inputTokens ?? 0, output: child.outputTokens ?? 0, total: child.tokens ?? 0, ...child.window !== void 0 ? { window: child.window } : {}, ...child.windowPeak !== void 0 ? { windowPeak: child.windowPeak } : {} }
      });
    } else {
      addCandidate({
        internalKey: `foreground:${control.runId}:${control.currentIndex ?? 0}`,
        agent: control.currentAgent ?? control.mode,
        model: control.model,
        effort: control.thinking,
        startedAt: control.startedAt,
        tokens: { input: control.inputTokens ?? 0, output: control.outputTokens ?? 0, total: control.tokens ?? 0, ...control.window !== void 0 ? { window: control.window } : {}, ...control.windowPeak !== void 0 ? { windowPeak: control.windowPeak } : {} }
      });
    }
  }
  for (const job of state.asyncJobs.values()) {
    if (!asyncOwners.has(job.sessionId) || !activeState(job.status)) continue;
    const startedAt = job.startedAt ?? job.updatedAt;
    if (job.mode === "workflow") {
      addCandidate({
        internalKey: `async:${job.asyncId}`,
        agent: "workflow",
        startedAt,
        tokens: job.totalTokens
      });
      continue;
    }
    const steps = job.steps?.length ? job.steps : job.agents?.map((agent, index) => ({
      agent,
      index,
      status: job.status === "queued" ? "pending" : "running"
    }));
    if (!steps?.length) {
      addCandidate({
        internalKey: `async:${job.asyncId}`,
        agent: job.mode ?? "subagent",
        startedAt,
        tokens: job.totalTokens
      });
      continue;
    }
    for (const [offset, step] of steps.entries()) {
      if (!activeState(step.status)) continue;
      const index = step.index ?? offset;
      if (step.status === "pending" && job.mode === "chain" && !job.activeParallelGroup && index !== (job.currentStep ?? 0)) continue;
      addCandidate({
        internalKey: `async:${job.asyncId}:${index}`,
        agent: step.agent,
        role: step.label,
        model: step.model,
        effort: step.thinking,
        startedAt: step.startedAt ?? startedAt,
        tokens: step.tokens ?? (steps.length === 1 ? job.totalTokens : void 0)
      });
    }
  }
  candidates.sort((left, right) => {
    const leftStarted = typeof left.startedAt === "number" ? left.startedAt : Number.MAX_SAFE_INTEGER;
    const rightStarted = typeof right.startedAt === "number" ? right.startedAt : Number.MAX_SAFE_INTEGER;
    return leftStarted - rightStarted || left.internalKey.localeCompare(right.internalKey);
  });
  const activeKeys = new Set(candidates.map((candidate) => candidate.internalKey));
  const entries = [];
  for (const candidate of candidates) {
    if (entries.length >= MAX_FLEET_ENTRIES) break;
    const agent = displayText(candidate.agent, MAX_AGENT_LENGTH);
    const startedAt = candidate.startedAt;
    if (!agent || typeof startedAt !== "number" || !Number.isSafeInteger(startedAt) || startedAt < 0) continue;
    let key = keyState.keys.get(candidate.internalKey);
    if (!key) {
      key = `fleet-${++keyState.next}`;
      keyState.keys.set(candidate.internalKey, key);
    }
    const role = displayText(candidate.role, MAX_AGENT_LENGTH);
    const model = displayText(candidate.model, MAX_METADATA_LENGTH);
    const effort = displayText(candidate.effort, MAX_METADATA_LENGTH);
    const goal = displayText(candidate.goal, MAX_GOAL_LENGTH);
    entries.push({
      key,
      agent,
      ...role ? { role } : {},
      ...model ? { model } : {},
      ...effort ? { effort } : {},
      startedAt,
      tokens: publicTokens(candidate.tokens),
      ...goal ? { goal } : {}
    });
  }
  for (const internalKey of keyState.keys.keys()) {
    if (!activeKeys.has(internalKey)) keyState.keys.delete(internalKey);
  }
  const omitted = Math.max(0, totalActive - entries.length);
  return { version: 1, entries, totalActive, topLevelAsyncCapacity: state.activeAsyncCapacity ?? { used: 0, limit: 0 }, omitted };
}
function enabledManagementActions(options) {
  return SUBAGENT_RPC_MANAGEMENT_ACTIONS.filter((action) => !options.disabledFeatures?.actions.has(action));
}
var SubagentRpcError = class extends Error {
  code;
  constructor(code, message2) {
    super(message2);
    this.name = "SubagentRpcError";
    this.code = code;
  }
};
var subagentParamsValidator = Compile(SubagentFlatParams);
function subagentRpcReplyEvent(requestId) {
  return `${SUBAGENT_RPC_REPLY_EVENT_PREFIX}${requestId}`;
}
function isRecord4(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function assertRequestId(value) {
  if (typeof value !== "string" || value.trim().length === 0 || /[\r\n]/.test(value)) {
    throw new SubagentRpcError("invalid_request", "RPC requestId must be a non-empty string without newlines.");
  }
  return value;
}
function assertRecordParams(params, method) {
  if (params === void 0) return {};
  if (!isRecord4(params)) throw new SubagentRpcError("invalid_params", `RPC ${method} params must be an object.`);
  return params;
}
function assertSubagentParams(params, label) {
  if (subagentParamsValidator.Check(params)) return;
  const messages = [...subagentParamsValidator.Errors(params)].slice(0, 4).map((error) => error.message);
  throw new SubagentRpcError("invalid_params", `${label}: ${messages.join("; ") || "invalid subagent parameters"}`);
}
function textFromToolResult(result) {
  return result.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
}
function dataFromToolResult(result) {
  return {
    text: textFromToolResult(result),
    ...result.details ? { details: result.details } : {},
    ...result.isError ? { isError: true } : {}
  };
}
function failIfToolError(result) {
  if (!result.isError) return;
  throw new SubagentRpcError("execution_failed", textFromToolResult(result) || "Subagent RPC execution failed.");
}
function normalizeTargetParamsFromRecord(input) {
  const output = {};
  if (input.id !== void 0) output.id = input.id;
  if (input.runId !== void 0) output.runId = input.runId;
  if (input.dir !== void 0) output.dir = input.dir;
  if (input.index !== void 0) output.index = input.index;
  return output;
}
function normalizeTargetParams(params, method) {
  return normalizeTargetParamsFromRecord(assertRecordParams(params, method));
}
function normalizeStatusParams(params) {
  const input = assertRecordParams(params, "status");
  const output = normalizeTargetParamsFromRecord(input);
  if (input.view !== void 0) output.view = input.view;
  if (input.lines !== void 0) output.lines = input.lines;
  return output;
}
function hasStatusTarget(params) {
  return params.id !== void 0 || params.runId !== void 0 || params.dir !== void 0 || params.index !== void 0 || params.view !== void 0 || params.lines !== void 0;
}
function canUseInMemoryStatus(state, sessionId) {
  return Boolean(
    state && sessionId && state.currentSessionId === sessionId && state.statusProjectionSessionId === sessionId && state.foregroundControls instanceof Map && state.asyncJobs instanceof Map
  );
}
function inMemoryStatusSummary(fleet) {
  const noun = fleet.totalActive === 1 ? "child" : "children";
  return `In-memory subagent status: ${fleet.totalActive} active ${noun}.`;
}
function sessionData(ctx) {
  if (!ctx) return {};
  return {
    cwd: ctx.cwd,
    sessionId: ctx.sessionManager.getSessionId() ?? void 0,
    sessionFile: ctx.sessionManager.getSessionFile() ?? null
  };
}
function pingData(ctx, options) {
  return {
    version: SUBAGENT_RPC_PROTOCOL_VERSION,
    methods: [...SUBAGENT_RPC_METHODS],
    capabilities: {
      status: true,
      statusProjection: { version: 1, untargeted: "in-memory-when-ready", targeted: "executor" },
      managementActions: enabledManagementActions(options),
      fleetStatus: { version: 1 },
      asyncStatusSnapshot: { kind: ASYNC_STATUS_SNAPSHOT_KIND, version: ASYNC_STATUS_SNAPSHOT_VERSION },
      asyncSpawn: true,
      steer: true,
      nonRecoveringSteer: true,
      interrupt: true,
      stop: true,
      resume: true,
      launchResolvedExtensions: { version: 1, source: "launch-resolved" },
      runtimeAcknowledgedExtensions: { version: 1, source: "child-runtime", event: "subagent:acknowledge-extension" },
      processTerminalProof: { version: 1, lifecycleArtifactVersion: SUBAGENT_LIFECYCLE_ARTIFACT_VERSION },
      cost: { version: SUBAGENT_COST_REPORT_VERSION }
    },
    events: {
      ready: SUBAGENT_RPC_READY_EVENT,
      request: SUBAGENT_RPC_REQUEST_EVENT,
      replyPrefix: SUBAGENT_RPC_REPLY_EVENT_PREFIX,
      asyncComplete: SUBAGENT_ASYNC_COMPLETE_EVENT,
      childStatus: SUBAGENT_CHILD_STATUS_EVENT,
      processTerminal: SUBAGENT_PROCESS_TERMINAL_EVENT
    },
    session: sessionData(ctx)
  };
}
async function executeChecked(options, ctx, requestId, method, params) {
  assertSubagentParams(params, `RPC ${method} params`);
  const controller = new AbortController();
  const result = await options.execute(`rpc-${method}-${requestId}`, params, controller.signal, void 0, ctx);
  failIfToolError(result);
  return dataFromToolResult(result);
}
function manageParams(params, options) {
  const input = assertRecordParams(params, "manage");
  if (typeof input.action !== "string" || !SUBAGENT_RPC_MANAGEMENT_ACTIONS.includes(input.action)) {
    const enabled = enabledManagementActions(options);
    throw new SubagentRpcError(
      "invalid_params",
      enabled.length > 0 ? `RPC manage action must be one of: ${enabled.join(", ")}.` : "RPC manage actions are all disabled by config."
    );
  }
  if (input.id !== void 0 && (typeof input.id !== "string" || !input.id.trim())) {
    throw new SubagentRpcError("invalid_params", "RPC manage id must be a non-empty string.");
  }
  const action = input.action;
  const requiresId = action !== "schedule.list";
  if (requiresId && typeof input.id !== "string") {
    throw new SubagentRpcError("invalid_params", `RPC manage ${action} requires id.`);
  }
  if (action === "schedule.run" && input.quiet !== void 0 && typeof input.quiet !== "boolean") {
    throw new SubagentRpcError("invalid_params", "RPC manage quiet must be a boolean.");
  }
  const output = {
    action,
    ...typeof input.id === "string" ? { id: input.id.trim() } : {},
    ...action === "schedule.run" && input.quiet === true ? { quiet: true } : {}
  };
  assertSubagentParams(output, "RPC manage params");
  return output;
}
function spawnParams(params, options) {
  const { script, ...input } = assertRecordParams(params, "spawn");
  if (Object.hasOwn(input, "workflowScript")) throw new SubagentRpcError("invalid_params", "RPC spawn workflowScript was removed; pass inline script text as script.");
  if (Object.hasOwn(input, "workflowScriptPath")) throw new SubagentRpcError("invalid_params", 'RPC spawn workflowScriptPath was removed; pass the file as workflow: "./path/to/script.js".');
  if (input.workflow === true || input.workflow === "true") throw new SubagentRpcError("invalid_params", 'RPC spawn has no reply block for workflow: true; pass inline script text as script or a file as workflow: "./path/to/script.js".');
  if (script !== void 0) {
    if (typeof script !== "string" || !script.trim()) throw new SubagentRpcError("invalid_params", "RPC spawn script must be a non-empty string.");
    if (input.workflow !== void 0) throw new SubagentRpcError("invalid_params", "RPC spawn script cannot be combined with workflow.");
    input.workflowScript = script;
  }
  const disabledFeatureError = options.disabledFeatures?.features.has("workflow-scripts") ? disabledFeatureUseError(input, options.disabledFeatures, "RPC spawn") : void 0;
  if (disabledFeatureError) throw new SubagentRpcError("invalid_params", disabledFeatureError);
  const normalized = normalizePublicSubagentExecution(input);
  if (!normalized.ok) throw new SubagentRpcError("invalid_params", normalized.error);
  if (normalized.params.action !== void 0) {
    throw new SubagentRpcError("invalid_params", "RPC spawn does not accept management/control actions. Use status or interrupt RPC methods instead.");
  }
  if (input.async === false) {
    throw new SubagentRpcError("invalid_params", "RPC spawn only supports detached async launches; omit async or set async: true.");
  }
  return { ...normalized.params, async: true };
}
function steerParams(params) {
  const input = assertRecordParams(params, "steer");
  if (typeof input.message !== "string" || !input.message.trim())
    throw new SubagentRpcError("invalid_params", "RPC steer requires a non-empty message.");
  const target = normalizeTargetParams(input, "steer");
  if (!target.id && !target.runId && !target.dir) throw new SubagentRpcError("invalid_params", "RPC steer requires id, runId, or dir.");
  if (input.mode !== void 0 && input.mode !== "steer" && input.mode !== "follow_up" && input.mode !== "auto") throw new SubagentRpcError("invalid_params", "RPC steer mode must be steer, follow_up, or auto.");
  return {
    action: "steer",
    ...target,
    message: input.message.trim(),
    ...typeof input.mode === "string" ? { mode: input.mode } : {},
    steeringRecovery: false
  };
}
function resumeParams(params) {
  const input = assertRecordParams(params, "resume");
  if (typeof input.message !== "string" || !input.message.trim())
    throw new SubagentRpcError("invalid_params", "RPC resume requires a non-empty message.");
  const target = normalizeTargetParams(input, "resume");
  if (!target.id && !target.runId && !target.dir) throw new SubagentRpcError("invalid_params", "RPC resume requires id, runId, or dir.");
  if (input.output !== void 0 && (typeof input.output !== "string" || !input.output.trim()))
    throw new SubagentRpcError("invalid_params", "RPC resume output must be a non-empty path.");
  if (input.outputMode !== void 0 && input.outputMode !== "file-only")
    throw new SubagentRpcError("invalid_params", "RPC resume supports only file-only output mode.");
  return {
    action: "resume",
    ...target,
    message: input.message.trim(),
    ...typeof input.output === "string" ? { output: input.output.trim(), outputMode: "file-only" } : {}
  };
}
function stopAsyncRun(params, options, ctx) {
  const input = assertRecordParams(params, "stop");
  const rawChildId = input.childId;
  if (rawChildId !== void 0 && (typeof rawChildId !== "string" || !rawChildId.trim() || /[\r\n]/.test(rawChildId) || rawChildId.length > 256)) {
    throw new SubagentRpcError("invalid_params", "RPC stop childId must be a non-empty string without newlines and at most 256 characters.");
  }
  const childId = typeof rawChildId === "string" ? rawChildId : void 0;
  const target = normalizeTargetParams(input, "stop");
  assertSubagentParams({ action: "status", ...target }, "RPC stop target params");
  const asyncDirRoot = options.asyncDirRoot ?? DIRS.async;
  const resultsDir = options.resultsDir ?? DIRS.results;
  let location;
  try {
    location = resolveAsyncRunLocation(target, asyncDirRoot, resultsDir);
  } catch (error) {
    throw new SubagentRpcError("invalid_params", error instanceof Error ? error.message : String(error));
  }
  if (!location.asyncDir) {
    throw new SubagentRpcError("not_found", "Async run not found or already completed; stop requires a live async run directory.");
  }
  const currentSessionId = resolveCurrentSessionId(ctx.sessionManager);
  const initialStatus = readStatus(location.asyncDir);
  const initialRunId = initialStatus?.runId ?? location.resolvedId ?? path11.basename(location.asyncDir);
  if (!initialStatus) throw new SubagentRpcError("not_found", `Status file not found for async run '${initialRunId}'.`);
  if (!ownsRun(currentSessionId, initialStatus.sessionId)) {
    throw new SubagentRpcError("not_found", `Async run '${initialRunId}' was not found in the active session.`);
  }
  let child;
  const emitChildStopping = (runId2, asyncDir, stoppedChild, ts = options.now?.() ?? Date.now()) => {
    options.events.emit(SUBAGENT_CHILD_STATUS_EVENT, {
      type: "subagent.child-status",
      version: 1,
      runId: runId2,
      childId: stoppedChild.id,
      status: "stopping",
      ts,
      reason: "rpc",
      source: "rpc",
      asyncDir,
      stepIndex: stoppedChild.index,
      agent: stoppedChild.step.agent,
      ...stoppedChild.step.runId ? { childRunId: stoppedChild.step.runId } : {},
      ...stoppedChild.step.workflowKey ? { workflowKey: stoppedChild.step.workflowKey } : {},
      ...stoppedChild.step.phase ? { phase: stoppedChild.step.phase } : {},
      ...stoppedChild.step.label ? { label: stoppedChild.step.label } : {}
    });
  };
  if (childId !== void 0) {
    const resolution = resolveAsyncStatusChild(initialStatus, childId);
    if (!resolution.ok) throw new SubagentRpcError(resolution.code === "not_found" ? "not_found" : "invalid_params", resolution.message);
    child = resolution.child;
    if (!isStoppableAsyncStatusStep(child.step)) {
      throw new SubagentRpcError("invalid_state", `Child '${childId}' in async run '${initialRunId}' is ${child.step.status}; stop only supports pending or running children.`);
    }
  }
  if (initialStatus.mode === "workflow" && initialStatus.state === "running") {
    const stopChild = options.state?.workflowChildStops?.get(initialRunId);
    if (child) {
      if (stopChild) {
        if (!stopChild(child.id, `Workflow child '${child.id}' stopped by RPC.`)) throw new SubagentRpcError("invalid_state", `Child '${childId}' in workflow ${initialRunId} is not available to stop.`);
        emitChildStopping(initialRunId, location.asyncDir, child);
        return {
          runId: initialRunId,
          asyncDir: location.asyncDir,
          previousState: initialStatus.state,
          state: "stopping",
          childId: child.id,
          message: `Stop requested for child ${child.id} in async run ${initialRunId}.`
        };
      }
    }
    const workflowController = options.state?.workflowControllers?.get(initialRunId);
    if (workflowController && !child) {
      stopStoppableAsyncStatusChildren(initialStatus, stopChild, "Workflow stopped by RPC.");
      workflowController.abort(new Error("Workflow stopped by RPC."));
      return {
        runId: initialRunId,
        asyncDir: location.asyncDir,
        previousState: initialStatus.state,
        state: "stopping",
        message: `Stop requested for async run ${initialRunId}.`
      };
    }
    throw new SubagentRpcError("invalid_state", child ? `Child '${child.id}' in workflow ${initialRunId} has no live stop callback available.` : `Workflow ${initialRunId} has no live run controller available to stop.`);
  }
  let status;
  try {
    status = reconcileAsyncRun(location.asyncDir, { resultsDir, kill: options.kill, now: options.now }).status;
  } catch (error) {
    throw new SubagentRpcError("execution_failed", error instanceof Error ? error.message : String(error));
  }
  const runId = status?.runId ?? initialRunId;
  if (!status) throw new SubagentRpcError("not_found", `Status file not found for async run '${runId}'.`);
  if (!ownsRun(currentSessionId, status.sessionId)) {
    throw new SubagentRpcError("not_found", `Async run '${runId}' was not found in the active session.`);
  }
  const pausedWholeRun = status.state === "paused" && childId === void 0;
  if (status.state !== "running" && status.state !== "queued" && !pausedWholeRun) {
    throw new SubagentRpcError("invalid_state", `Async run ${runId} is ${status.state}; stop only supports running or queued async runs, or a paused whole run.`);
  }
  if (childId !== void 0) {
    const resolution = resolveAsyncStatusChild(status, childId);
    if (!resolution.ok) throw new SubagentRpcError(resolution.code === "not_found" ? "not_found" : "invalid_params", resolution.message);
    child = resolution.child;
    if (!isStoppableAsyncStatusStep(child.step)) {
      throw new SubagentRpcError("invalid_state", `Child '${childId}' in async run '${runId}' is ${child.step.status}; stop only supports pending or running children.`);
    }
  }
  try {
    const failure = deliverAsyncRunStop({
      asyncDir: location.asyncDir,
      status,
      resultsDir,
      pid: status.pid,
      kill: options.kill,
      now: options.now,
      source: "rpc-stop",
      ...child ? { targetIndex: child.index, childId: child.id } : {}
    });
    if (failure) throw new Error(`Stop request persisted for paused async run ${runId}, but terminal proof is not ready (${failure}). Retry stop after runner shutdown is observed.`);
  } catch (error) {
    throw new SubagentRpcError("execution_failed", error instanceof Error ? error.message : String(error));
  }
  if (child) emitChildStopping(runId, location.asyncDir, child);
  return {
    runId,
    asyncDir: location.asyncDir,
    previousState: status.state,
    state: "stopping",
    ...child ? { childId: child.id } : {},
    message: child ? `Stop requested for child ${child.id} in async run ${runId}.` : `Stop requested for async run ${runId}.`
  };
}
async function handleRequest(request, options, fleetKeys) {
  const ctx = options.getContext();
  if (request.method === "ping") return pingData(ctx, options);
  if (!ctx) throw new SubagentRpcError("no_active_session", "No active extension context for subagent RPC.");
  if (request.method === "manage") {
    return executeChecked(options, ctx, request.requestId, request.method, manageParams(request.params, options));
  }
  if (request.method === "spawn") {
    return executeChecked(options, ctx, request.requestId, request.method, spawnParams(request.params, options));
  }
  if (request.method === "status") {
    const statusParams = normalizeStatusParams(request.params);
    let sessionId;
    if (!hasStatusTarget(statusParams)) {
      try {
        sessionId = resolveCurrentSessionId(ctx.sessionManager);
      } catch {
      }
      if (canUseInMemoryStatus(options.state, sessionId)) {
        const fleet = buildFleetStatus(options.state, fleetKeys, sessionId);
        const asyncSnapshot = buildAsyncStatusSnapshotForState(options.state, sessionId);
        return {
          text: inMemoryStatusSummary(fleet),
          details: { mode: "management", results: [] },
          fleet,
          asyncSnapshot
        };
      }
    }
    const status = await executeChecked(
      options,
      ctx,
      request.requestId,
      request.method,
      { action: "status", ...statusParams }
    );
    sessionId ??= resolveCurrentSessionId(ctx.sessionManager);
    return {
      ...status,
      fleet: buildFleetStatus(
        options.state,
        fleetKeys,
        sessionId
      ),
      asyncSnapshot: buildAsyncStatusSnapshotForState(options.state, sessionId)
    };
  }
  if (request.method === "steer") {
    return executeChecked(options, ctx, request.requestId, request.method, steerParams(request.params));
  }
  if (request.method === "interrupt") {
    return executeChecked(options, ctx, request.requestId, request.method, { action: "interrupt", ...normalizeTargetParams(request.params, "interrupt") });
  }
  if (request.method === "stop") {
    return stopAsyncRun(request.params, options, ctx);
  }
  if (request.method === "resume") {
    return executeChecked(options, ctx, request.requestId, request.method, resumeParams(request.params));
  }
  if (request.method === "cost") {
    if (request.params !== void 0 && !isRecord4(request.params)) throw new SubagentRpcError("invalid_params", "RPC cost params must be an object when provided.");
    return collectSubagentCost(ctx, options.state ?? { baseCwd: ctx.cwd });
  }
  throw new SubagentRpcError("unsupported_method", `Unsupported subagent RPC method: ${String(request.method)}`);
}
function parseRequest(raw) {
  if (!isRecord4(raw)) throw new SubagentRpcError("invalid_request", "Subagent RPC request must be an object.");
  const requestId = assertRequestId(raw.requestId);
  if (raw.version !== SUBAGENT_RPC_PROTOCOL_VERSION) {
    throw new SubagentRpcError("unsupported_version", `Unsupported subagent RPC version: ${String(raw.version)}.`);
  }
  if (typeof raw.method !== "string" || !SUBAGENT_RPC_METHODS.includes(raw.method)) {
    throw new SubagentRpcError("unsupported_method", `Unsupported subagent RPC method: ${String(raw.method)}.`);
  }
  return {
    version: SUBAGENT_RPC_PROTOCOL_VERSION,
    requestId,
    method: raw.method,
    ...raw.params !== void 0 ? { params: raw.params } : {},
    ...isRecord4(raw.source) ? { source: raw.source } : {}
  };
}
function safeReplyRequestId(raw) {
  if (!isRecord4(raw)) return "unknown";
  const requestId = raw.requestId;
  return typeof requestId === "string" && requestId.trim().length > 0 && !/[\r\n]/.test(requestId) ? requestId : "unknown";
}
function errorReply2(raw, error) {
  const requestId = safeReplyRequestId(raw);
  const method = isRecord4(raw) && typeof raw.method === "string" && SUBAGENT_RPC_METHODS.includes(raw.method) ? raw.method : void 0;
  const rpcError = error instanceof SubagentRpcError ? error : new SubagentRpcError("execution_failed", error instanceof Error ? error.message : String(error));
  return {
    version: SUBAGENT_RPC_PROTOCOL_VERSION,
    requestId,
    ...method ? { method } : {},
    success: false,
    error: {
      code: rpcError.code,
      message: rpcError.message
    }
  };
}
function registerSubagentRpcBridge(options) {
  const fleetKeys = { sessionId: null, next: 0, keys: /* @__PURE__ */ new Map() };
  const unsubscribe = options.events.on(SUBAGENT_RPC_REQUEST_EVENT, async (raw) => {
    let request;
    try {
      request = parseRequest(raw);
      const data = await handleRequest(request, options, fleetKeys);
      options.events.emit(subagentRpcReplyEvent(request.requestId), {
        version: SUBAGENT_RPC_PROTOCOL_VERSION,
        requestId: request.requestId,
        method: request.method,
        success: true,
        data
      });
    } catch (error) {
      const reply = errorReply2(request ?? raw, error);
      options.events.emit(subagentRpcReplyEvent(reply.requestId), reply);
    }
  });
  return {
    emitReady: (ctx) => {
      options.events.emit(SUBAGENT_RPC_READY_EVENT, pingData(ctx ?? options.getContext(), options));
    },
    dispose: () => {
      if (typeof unsubscribe === "function") unsubscribe();
    }
  };
}

// src/extension/tool-activation.ts
import { Type } from "typebox";
var LOADER_NAME = "subagents_enable";
var SUBAGENT_NAME = "subagent";
var WAIT_NAME = "bg_wait";
var UNLOAD_SENTINELS = /* @__PURE__ */ new Set([LOADER_NAME, SUBAGENT_NAME, WAIT_NAME]);
function hasNativeToolSelection(messages) {
  return messages.some((message2) => message2.role === "system" && (Object.hasOwn(message2, "toolsAdded") || Object.hasOwn(message2, "toolsRemoved")));
}
function setSelection(pi, includeSubagent, includeLoader, includeWait, restore = [], keepParentSupervisor = false) {
  const next = [...pi.getActiveTools(), ...restore].filter((name) => (includeSubagent || name !== SUBAGENT_NAME && name !== CONTACT_SUPERVISOR_TOOL_NAME && (keepParentSupervisor || name !== NATIVE_SUPERVISOR_TOOL_NAME)) && (includeLoader || name !== LOADER_NAME) && (includeWait || name !== WAIT_NAME));
  if (includeSubagent) next.push(SUBAGENT_NAME, CONTACT_SUPERVISOR_TOOL_NAME, NATIVE_SUPERVISOR_TOOL_NAME);
  if (includeLoader) next.push(LOADER_NAME);
  if (includeWait) next.push(WAIT_NAME);
  pi.setActiveTools([...new Set(next)]);
}
function addsToolsWithoutCheckpoint(model) {
  const compat = model?.compat;
  if (!model || compat?.supportsMidConvoSystemMessages !== true) return false;
  switch (model.api) {
    case "anthropic-messages":
      return compat.supportsMidConvoToolChanges === true;
    case "openai-completions":
      return compat.supportsMidConvoToolAdditions === true;
    case "openai-responses":
    case "openai-codex-responses":
    case "azure-openai-responses":
      return compat.supportsAdditionalTools === true || compat.supportsToolSearch === true;
    default:
      return false;
  }
}
function applyRecordedSelection(pi, ctx, mode, replyOwed) {
  const available = pi.getAllTools();
  if (!Array.isArray(available) || !Array.isArray(pi.getActiveTools())) return true;
  if (!available.some((tool) => tool.name === LOADER_NAME)) return true;
  const messages = ctx.sessionManager.buildSessionContext().messages;
  const lost = messages.find((message2) => message2.role === "system" || message2.role === "compactionSummary")?.role === "compactionSummary";
  if (lost || hasNativeToolSelection(messages)) {
    const recorded = /* @__PURE__ */ new Set();
    const unloadedNames = /* @__PURE__ */ new Set();
    const declaredSentinels = /* @__PURE__ */ new Set();
    const evidenced = /* @__PURE__ */ new Set();
    for (const message2 of messages) {
      if (message2.role !== "system") continue;
      const removedSentinels = (message2.toolsRemoved ?? []).filter((tool) => UNLOAD_SENTINELS.has(tool.name));
      const allDeclared = removedSentinels.every((tool) => declaredSentinels.has(tool.name));
      for (const tool of message2.toolsRemoved ?? []) declaredSentinels.delete(tool.name);
      for (const tool of message2.toolsAdded ?? []) if (UNLOAD_SENTINELS.has(tool.name)) declaredSentinels.add(tool.name);
      const unloaded = removedSentinels.length > 0 && allDeclared && declaredSentinels.size === 0;
      for (const tool of message2.toolsRemoved ?? []) {
        if (unloaded) unloadedNames.add(tool.name);
        else {
          recorded.delete(tool.name);
          evidenced.add(tool.name);
        }
      }
      for (const tool of message2.toolsAdded ?? []) {
        recorded.add(tool.name);
        evidenced.add(tool.name);
      }
    }
    const fresh = lost && !evidenced.has(LOADER_NAME) && !evidenced.has(SUBAGENT_NAME);
    const startsEager = fresh && mode === "auto" && !addsToolsWithoutCheckpoint(ctx.model);
    const loaderSelected = mode === "dynamic" || recorded.has(LOADER_NAME) || fresh && !startsEager;
    const source = unloadedNames.size > 0 ? available.find((tool) => tool.name === LOADER_NAME)?.sourceInfo.path : void 0;
    const restore = source === void 0 ? [] : available.filter((tool) => unloadedNames.has(tool.name) && recorded.has(tool.name) && tool.sourceInfo.path === source).map((tool) => tool.name);
    setSelection(pi, recorded.has(SUBAGENT_NAME) || startsEager, loaderSelected, recorded.has(WAIT_NAME) || !evidenced.has(WAIT_NAME) && startsEager, replyOwed ? [...restore, NATIVE_SUPERVISOR_TOOL_NAME] : restore, replyOwed || recorded.has(NATIVE_SUPERVISOR_TOOL_NAME));
    return loaderSelected;
  }
  const eager = mode === "auto" && messages.length === 0 && !addsToolsWithoutCheckpoint(ctx.model);
  const kept = (name) => eager || messages.length > 0 && pi.getActiveTools().includes(name);
  setSelection(pi, kept(SUBAGENT_NAME), !eager, kept(WAIT_NAME), replyOwed ? [NATIVE_SUPERVISOR_TOOL_NAME] : [], replyOwed || messages.length > 0);
  return !eager;
}
function registerSubagentToolActivation(pi, options) {
  const mode = options.mode ?? "auto";
  if (mode === "eager") return;
  const parameters = Type.Object({});
  const loader = {
    name: LOADER_NAME,
    ...MODEL_ONLY_TOOL,
    label: "Enable Subagents",
    description: "Enable pi-subagents delegation and management tools without launching work. Call when delegation is authorized by the current request or applicable user/project instructions, or when managing existing runs. Direct execution is the default; complexity alone never authorizes delegation. Full tools are available on the next model request.",
    promptSnippet: "pi-subagents is installed. For authorized specialist, independent-review, or parallel work, call subagents_enable, then subagent. Authorization must come from the current request or applicable instructions; complexity alone is not authorization.",
    parameters,
    async execute() {
      if (!pi.getAllTools().some((tool) => tool.name === SUBAGENT_NAME)) return {
        isError: true,
        content: [{ type: "text", text: "Cannot enable unavailable tools: subagent." }],
        details: { unavailable: [SUBAGENT_NAME] }
      };
      try {
        setSelection(pi, true, true, true);
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `Activation failed: ${error instanceof Error ? error.message : String(error)}` }],
          details: { missing: [SUBAGENT_NAME] }
        };
      }
      if (!pi.getActiveTools().includes(SUBAGENT_NAME)) return {
        isError: true,
        content: [{ type: "text", text: "Activation failed: subagent." }],
        details: { missing: [SUBAGENT_NAME] }
      };
      const advertised = await options.advertisedPrompt();
      return {
        content: [{ type: "text", text: `Enabled: subagent. If your tool list includes subagent (possibly prefixed), call it now. Otherwise, wait for the next user prompt; do not retry now. Start Pi with --exclude-tools subagents_enable to keep subagent always available.${advertised ? `

${advertised}` : ""}` }],
        details: { enabled: [SUBAGENT_NAME] }
      };
    }
  };
  registerPinnedTool(pi, loader);
  let loaderSelected = true;
  const replyOwed = () => options.hasPendingSupervisorRequest?.() === true;
  pi.on("session_start", (_event, ctx) => {
    loaderSelected = applyRecordedSelection(pi, ctx, mode, replyOwed());
  });
  pi.on("session_tree", (_event, ctx) => {
    loaderSelected = applyRecordedSelection(pi, ctx, mode, replyOwed());
  });
  pi.on("before_agent_start", (event) => {
    const available = pi.getAllTools();
    if (!Array.isArray(available) || !available.some((tool) => tool.name === LOADER_NAME)) return;
    const providedWait = available.some((tool) => tool.name === WAIT_NAME) && listBackgroundWorkProviders().length > 0;
    const names = [...loaderSelected ? [LOADER_NAME] : [], ...providedWait ? [WAIT_NAME] : []];
    if (names.length === 0) return;
    const selectedTools = event.systemPromptOptions.selectedTools ??= [...pi.getActiveTools()];
    for (const name of names) if (!selectedTools.includes(name)) selectedTools.push(name);
    const inactive = names.filter((name) => !pi.getActiveTools().includes(name));
    if (inactive.length > 0) pi.setActiveTools([...pi.getActiveTools(), ...inactive]);
  });
}

// src/extension/active-runs-prompt.ts
var MAX_LISTED_RUNS = 10;
var MAX_LISTED_AGENTS = 3;
function buildActiveRunsSection(jobs, sessionId) {
  const active = [...jobs].filter((job) => (job.status === "queued" || job.status === "running") && (typeof sessionId !== "string" || job.sessionId === sessionId));
  if (active.length === 0) return void 0;
  const lines = active.slice(0, MAX_LISTED_RUNS).map((job) => {
    const agents = [...new Set(job.agents ?? [])];
    const agentText = agents.length > MAX_LISTED_AGENTS ? `${agents.slice(0, MAX_LISTED_AGENTS).join(", ")} +${agents.length - MAX_LISTED_AGENTS}` : agents.join(", ") || "subagent";
    const step = job.mode === "chain" && job.currentStep !== void 0 && (job.chainStepCount ?? 0) > 1 ? `, step ${job.currentStep + 1}/${job.chainStepCount}` : "";
    return `- ${job.asyncId} ${agentText} (${job.mode ?? "single"}${step})`;
  });
  if (active.length > MAX_LISTED_RUNS) lines.push(`- +${active.length - MAX_LISTED_RUNS} more`);
  return [
    `Background subagent runs still active in this session (${active.length}). Check them with subagent({ action: "status", id }) before launching duplicate work.`,
    ...lines
  ].join("\n");
}

// src/extension/tool-description.ts
import * as fs13 from "node:fs";
import * as path12 from "node:path";
var CUSTOM_TOOL_DESCRIPTION_FILE = "subagent-tool-description.md";
var CUSTOM_TOOL_DESCRIPTION_MAX_BYTES = 50 * 1024;
function featureText(disabled) {
  return (feature, text, disabledText = "") => disabled.features.has(feature) ? disabledText : text;
}
var SUBAGENT_SAFETY_GUIDANCE = `SAFETY-CRITICAL SUBAGENT GUIDANCE:
- Delegate only when the operator asked, directly or through applicable user/project instructions; size, complexity or risk alone is not authorization.
- Native async completion wakes this session: return control; do not sleep, poll or call bg_wait for it.
- One writer per cwd/worktree; isolate concurrent writers.
- After a launch or runtime failure, stop and report it; never silently switch to interactive_shell, pi -ne or another CLI.`;
var scriptCalls = 'One child: {agent,task}. Independent parallel children: {workflow:"parallel",args:{tasks:[{agent,task,cwd?,model?},...]}}. Dependent multi-step work: exactly one top-level subagent workflow call with async:true; write one ```js workflow block in this reply, then call subagent({workflow:true}); children launch only inside it.';
var structuredCalls = "One child: {agent,task}. Parallel: tasks:[{agent,task,cwd?,model?},...]. In order: chain:[{agent,task?,as?,cwd?,model?} or {parallel:[{agent,task,cwd?,model?},...]}]; step tasks can use {task}, {previous} and {outputs.name}. Use exactly one top-level subagent chain or tasks call with async:true.";
var essentials = (on) => `${on("workflow-scripts", scriptCalls, structuredCalls)}
Management: {action,id?,options:{...}}; fields not in this schema go in options.
Launch agents by name and pass models as exact provider/id; an unknown agent or model returns the valid choices.
Details: guide workflows/recommended-orchestration-pattern (async, review, failure recovery), ${on("workflow-scripts", "guide workflows/scripted-workflows, ")}guide tool-reference/retained-children, guide tool-reference/external-cli-agent-profiles.

${SUBAGENT_SAFETY_GUIDANCE}`;
var managementDiscovery = (on) => [
  ["list/get/models/guide"],
  [on("agent-management", "create/update/delete/eject/disable/enable/reset/refine")],
  [on("missions", "mission.*"), on("schedules", "schedule.*"), on("watchdog", "watchdog.*"), on("panes", "inspector.*, project.*"), on("lane-management", "lane.status/recordMerge/recordSupersession")],
  [on("lane-management", "worktree.discard and reviewed worktree.cleanup")],
  [`doctor${on("spawn-budget-grants", " and grant-spawn-budget")}`]
].map((group) => group.filter(Boolean).join(", ")).filter(Boolean).join("; ");
var scriptDetails = `\u2022 Scripts: JavaScript statement bodies with explicit return, top-level await, plain helpers/Promise chains; nested async function/arrow/method helpers are rejected. Await runs.run('key',{agent,task}) before .output; await runs.all([{key,agent,task},...]) for an ordered array, not a key map. Observe every stored run promise with direct await, Promise.race or Promise.all. Await/return runs.steer(key,message,options?) for a prior key, never raw run ids; queued/delivered/missed/failed receipts are not compliance proof.
\u2022 workflow:'./path.js' (any value with '/') loads a file from request cwd; other strings name a resource, such as {workflow:'review',args:{task:'...'}}. agent/task exclude workflow; task excludes action; validate accepts workflow:true or a path without launching. Raw-script sandboxes add deeply frozen args that persist as evidence, so never include secrets; raw scripts cannot use runs.host. Granted commands/relative outputs use workflow cwd, never per-step cwd.
\u2022 runs.lanes([{key,stages:[{key,agent,task},{key,resume:'previous',task}]}]) runs first stages together, later stages sequentially per lane. Failures stay lane-local; only explicit structuredOutput.verdict === 'blocked' blocks a successful stage, never reviewer prose.
`;
var fullDetails = (on) => `DETAILS:
${on("workflow-scripts", scriptDetails)}\u2022 ${on("workflow-scripts", "Workflow child controls default onto runs.run/runs.all items; child fields override them.", "Top-level child controls apply to every chain/tasks child.")} worktree:true requires clean source, isolates each child and returns handoff artifacts; options.baseRef defaults to HEAD at allocation or a supported named ref, never full 40/64-character commit IDs or revision expressions.${on("usage-budgets", " usageBudget is shared across the workflow; already-running children are not stopped.")}
\u2022 Async follows asyncByDefault (normally true); async:false only to block the parent, not for final reviews/gates. Consume results at dependency barriers. bg_wait is for provider/detached work without native notification that needs a same-turn result.
\u2022 Bind durable output ${on("workflow-scripts", "on runs.run/runs.all", "with output")}, not task filename prose; return actual outputReference/outputPathMapping/artifactPaths, evidence and residual risks.
\u2022 Ordinary child subagents are not orchestrators; only configured fanout within depth/session limits. Use fresh-context read-only reviewers when independent review was requested. Oracle/advisor unknowns use supervisor dialogue; one-shot only when requested.
\u2022 children.list is workflow-only, not an exhaustive list of direct native children: resume only resumable rows. When an intended child's exact run id is known, inspect it with {action:"status",id}; if status identifies the candidate, attempt {action:"resume",id,message}. Resume authoritatively checks eligibility and may reject it. Use a labeled same-role fallback only when no known candidate exists or resume rejects eligibility.${on("workflow-scripts", " Scripts await runs.run(newKey,{resume:runId,task}); continue from the latest returned runId. Each distinct resume pass needs a new stable key; same-key reuse requires identical launch parameters.")}
\u2022 External CLI agents need an installed, authenticated CLI; preflight at launch decides, and passive PATH/PATHEXT/X_OK is not authentication/version/launch proof. They support native options only when their runner declares them: model, structured output, acceptance/agentContract, ${on("tool-budgets", "tool budget, ")}fast, fork context or skills/tools.
\u2022 Model override: copy exact provider/id, not agent names. Thinking uses model suffix${on("watchdog", ", not watchdog-only thinking")}.
\u2022 Missions auto-attach${on("missions", " unless options.mission:false")}; ${on("workflow-scripts", "await state.get(key)/state.set(key,JSONValue) requires a mission. ")}See guide topic missions. Omit acceptance for reviewer/read-only calls; acceptance.review.required requests independent writer review.
\u2022 Inspect asyncId/asyncDir (status.json, events.jsonl, logs) with status/debug.run; control with interrupt/stop/resume/steer. For local Pi children explicitly granted subagent_command, command.status/yield/cancel targets one exact toolCallId without interrupting the child.
\u2022 After a failure, report the exact failure, run/status and repo/cwd/worktree/branch/ref, and verify a clean worktree or capture the partial diff before a same-protocol retry. Governed-workflow fallback to foreground/CLI needs explicit owner approval, not Pi core's generic pi -ne hint.
\u2022 Management discovery: ${managementDiscovery(on)}. Use guide topics agents, ${on("missions", "missions, ")}observability, tool-reference, configuration, models${on("watchdog", ", watchdog")} or extension-api for exact action fields.${on("schedules", on("workflow-scripts", " Schedules take script inputs, not direct children; recipes live in the missions guide."))}`;
var fullDescription = (on) => `${essentials(on)}

${fullDetails(on)}`;
var allEnabled = featureText(resolveDisabledFeatureSurface({}));
var DEFAULT_SUBAGENT_TOOL_DESCRIPTION = essentials(allEnabled);
var SUBAGENT_TOOL_PROMPT_SNIPPET = "Delegate focused work to child agents; compose multi-child work in one workflow call.";
var STRUCTURED_SUBAGENT_TOOL_PROMPT_SNIPPET = "Delegate focused work to child agents; compose multi-child work in one chain or tasks call.";
var COMPACT_SUBAGENT_TOOL_DESCRIPTION = DEFAULT_SUBAGENT_TOOL_DESCRIPTION;
var FULL_SUBAGENT_TOOL_DESCRIPTION = fullDescription(allEnabled);
function isToolDescriptionMode(value) {
  return value === "full" || value === "compact" || value === "custom";
}
function warn(options, message2) {
  (options?.warn ?? console.warn)(`[pi-subagents] ${message2}`);
}
function buildSubagentToolPromptMetadata(config = {}, disabledFeatures) {
  if (config.toolDescriptionMode !== void 0) return {};
  return { promptSnippet: disabledFeatures?.features.has("workflow-scripts") ? STRUCTURED_SUBAGENT_TOOL_PROMPT_SNIPPET : SUBAGENT_TOOL_PROMPT_SNIPPET };
}
function resolveToolDescriptionMode(config, options) {
  const mode = config.toolDescriptionMode;
  if (mode === void 0) return "full";
  if (isToolDescriptionMode(mode)) return mode;
  warn(options, `Ignoring invalid toolDescriptionMode ${JSON.stringify(mode)}; expected "full", "compact", or "custom".`);
  return "full";
}
function customDescriptionPaths(options) {
  const cwd = options?.cwd ?? process.cwd();
  const agentDir = options?.agentDir ?? getAgentDir();
  return [
    path12.join(getProjectConfigDir(cwd), CUSTOM_TOOL_DESCRIPTION_FILE),
    path12.join(agentDir, CUSTOM_TOOL_DESCRIPTION_FILE)
  ];
}
function renderCustomTemplate(template, options) {
  const cwd = options?.cwd ?? process.cwd();
  const agentDir = options?.agentDir ?? getAgentDir();
  const projectConfigDir = getProjectConfigDir(cwd);
  const variables = {
    fullDescription: () => FULL_SUBAGENT_TOOL_DESCRIPTION,
    full: () => FULL_SUBAGENT_TOOL_DESCRIPTION,
    compactDescription: () => COMPACT_SUBAGENT_TOOL_DESCRIPTION,
    compact: () => COMPACT_SUBAGENT_TOOL_DESCRIPTION,
    safetyGuidance: () => SUBAGENT_SAFETY_GUIDANCE,
    safety: () => SUBAGENT_SAFETY_GUIDANCE,
    agentDir: () => agentDir,
    projectConfigDir: () => projectConfigDir
  };
  return template.replace(/\{\{(\w+)\}\}/g, (raw, name) => {
    const replacement = variables[name];
    if (replacement) return replacement();
    warn(options, `${CUSTOM_TOOL_DESCRIPTION_FILE}: unknown placeholder ${raw} left unchanged.`);
    return raw;
  });
}
function loadCustomToolDescription(options) {
  for (const filePath of customDescriptionPaths(options)) {
    let stat;
    try {
      stat = fs13.statSync(filePath);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") continue;
      warn(options, `Failed to inspect custom tool description '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!stat.isFile()) {
      warn(options, `Ignoring custom tool description '${filePath}' because it is not a file.`);
      continue;
    }
    if (stat.size > CUSTOM_TOOL_DESCRIPTION_MAX_BYTES) {
      warn(options, `Ignoring custom tool description '${filePath}' because it is larger than ${CUSTOM_TOOL_DESCRIPTION_MAX_BYTES} bytes.`);
      continue;
    }
    try {
      const template = fs13.readFileSync(filePath, "utf-8").trim();
      if (!template) {
        warn(options, `Ignoring empty custom tool description '${filePath}'.`);
        continue;
      }
      const rendered = renderCustomTemplate(template, options).trim();
      if (!rendered) {
        warn(options, `Ignoring custom tool description '${filePath}' because it rendered empty.`);
        continue;
      }
      return rendered;
    } catch (error) {
      warn(options, `Failed to read custom tool description '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return void 0;
}
function withMandatorySafetyGuidance(description) {
  const customDescription = description.split(SUBAGENT_SAFETY_GUIDANCE).map((part) => part.trim()).filter(Boolean).join("\n\n");
  return customDescription ? `${customDescription}

${SUBAGENT_SAFETY_GUIDANCE}` : SUBAGENT_SAFETY_GUIDANCE;
}
function buildSubagentToolDescription(config = {}, options) {
  const on = options?.disabledFeatures ? featureText(options.disabledFeatures) : allEnabled;
  if (config.toolDescriptionMode === void 0) return essentials(on);
  const mode = resolveToolDescriptionMode(config, options);
  if (mode === "compact") return essentials(on);
  if (mode === "custom") {
    const custom = loadCustomToolDescription(options);
    if (custom) return withMandatorySafetyGuidance(custom);
    warn(options, `${CUSTOM_TOOL_DESCRIPTION_FILE} was not found or valid for toolDescriptionMode "custom"; using full description.`);
  }
  return fullDescription(on);
}

// src/workflows/workflow-auto-resume.ts
import * as path13 from "node:path";
var WORKFLOW_AUTO_RESUME_MESSAGE_TYPE = "subagent-auto-resume";
var AUTO_RESUME_MAX_AGE_MS = 24 * 60 * 60 * 1e3;
var AUTO_RESUME_SCAN_LIMIT = 50;
function interruptedAt(status) {
  return status.workflow?.stopCause === WORKFLOW_STOP_CAUSE_OWNER_EXITED ? status.workflow.ownerExitedAt : status.endedAt;
}
var registryKey = /* @__PURE__ */ Symbol.for("pi-subagents.workflow-auto-resume.v1");
var registryGlobal = globalThis;
var pendingAutoResumes = registryGlobal[registryKey] ?? (registryGlobal[registryKey] = /* @__PURE__ */ new Set());
function cancelPendingWorkflowAutoResumes(match) {
  for (const entry of pendingAutoResumes) {
    if (entry.state !== "pending" || !match(entry)) continue;
    entry.state = "cancelled";
    try {
      releaseWorkflowResumeClaim(entry.prepared.sourceAsyncDir, entry.prepared.newRunId);
    } catch (error) {
      console.error(`Failed to give back the auto-resume claim of workflow ${entry.prepared.sourceRunId}:`, error);
    }
  }
}
function finishWorkflowAutoResume(entry) {
  if (entry.state !== "cancelled") pendingAutoResumes.delete(entry);
}
function planWorkflowAutoResumes(input) {
  const { asyncDirRoot, currentSessionId, now } = input;
  cancelPendingWorkflowAutoResumes((entry) => entry.sessionId === currentSessionId);
  const reusableRunIds = /* @__PURE__ */ new Map();
  for (const entry of pendingAutoResumes) {
    if (entry.sessionId !== currentSessionId || entry.state !== "cancelled") continue;
    reusableRunIds.set(entry.prepared.sourceRunId, entry.prepared.newRunId);
    pendingAutoResumes.delete(entry);
  }
  let runIds;
  try {
    runIds = readRecentTerminalRunIndex(asyncDirRoot, { sessionId: currentSessionId, limit: AUTO_RESUME_SCAN_LIMIT, endedAfter: now - AUTO_RESUME_MAX_AGE_MS });
  } catch (error) {
    console.error("Failed to read interrupted workflows for auto-resume:", error);
    return [];
  }
  const planned = [];
  for (const runId of runIds) {
    const asyncDir = path13.join(asyncDirRoot, runId);
    try {
      const status = readStatus(asyncDir);
      if (!status || status.mode !== "workflow" || status.parentWorkflowRunId !== void 0 || status.sessionId !== currentSessionId) continue;
      if (!isReusableWorkflowStopCause(status.workflow?.stopCause)) continue;
      const at = interruptedAt(status);
      if (at === void 0 || now - at > AUTO_RESUME_MAX_AGE_MS) continue;
      if (workflowResumeClaimState(asyncDir).kind !== "none" || hasWorkflowResumeRefusal(asyncDir)) continue;
      const preparation = prepareWorkflowResume({ asyncDirRoot, sourceRunId: runId, trigger: "auto", now, currentSessionId, newRunId: reusableRunIds.get(runId) });
      if (preparation.ok) {
        const entry = { sessionId: currentSessionId, owner: input.owner, prepared: preparation.prepared, state: "pending" };
        pendingAutoResumes.add(entry);
        planned.push(entry);
        continue;
      }
      if (preparation.code === "claim-busy" || preparation.code === "claim-resumed") continue;
      recordWorkflowResumeRefusal(asyncDir, { reason: preparation.reason, byHand: preparation.byHand }, now);
    } catch (error) {
      console.error(`Failed to prepare auto-resume of workflow ${runId}:`, error);
    }
  }
  return planned;
}
function autoResumeFailureText(sourceRunId, refusal) {
  return `Workflow ${sourceRunId} was not auto-resumed: ${refusalSentence(refusal.reason, refusal.byHand)}`;
}

// src/missions/goal-driver.ts
import * as fs14 from "node:fs";
import * as path14 from "node:path";
var TERMINAL_MISSION_STATUSES2 = /* @__PURE__ */ new Set(["completed", "failed", "cancelled"]);
var ACTIVE_RUN_STATUSES = /* @__PURE__ */ new Set(["queued", "running", "active"]);
var MAX_ACTION_LENGTH = 180;
function bounded(value) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > MAX_ACTION_LENGTH ? `${normalized.slice(0, MAX_ACTION_LENGTH - 1)}\u2026` : normalized;
}
function tokenUsage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const total = value.total;
  return Number.isSafeInteger(total) && total >= 0 ? total : void 0;
}
function readLinkedRun(run) {
  if (!run.asyncDir) return run;
  const statusPath = path14.join(run.asyncDir, "status.json");
  if (!fs14.existsSync(statusPath)) return run;
  let parsed;
  try {
    parsed = JSON.parse(fs14.readFileSync(statusPath, "utf-8"));
  } catch (error) {
    throw new Error(`Failed to read linked run status '${statusPath}': ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`Linked run status '${statusPath}' must be an object`);
  const status = parsed;
  if (typeof status.state !== "string" || !status.state.trim()) throw new Error(`Linked run status '${statusPath}' is missing state`);
  const tokens = tokenUsage(status.totalTokens) ?? (Array.isArray(status.steps) ? status.steps.reduce((total, step) => {
    if (!step || typeof step !== "object") return total;
    return total + (tokenUsage(step.tokens) ?? 0);
  }, 0) : void 0);
  return {
    ...run,
    status: status.state,
    ...!ACTIVE_RUN_STATUSES.has(status.state) && !run.completedAt ? { completedAt: (/* @__PURE__ */ new Date()).toISOString() } : {},
    ...tokens !== void 0 ? { usage: { tokens } } : {}
  };
}
function refreshGoalMission(location, record) {
  const runs = record.runs.map(readLinkedRun);
  const changed = runs.some((run, index) => JSON.stringify(run) !== JSON.stringify(record.runs[index]));
  if (!changed) return record;
  const active = runs.some((run) => run.status && ACTIVE_RUN_STATUSES.has(run.status));
  return updateMission(location, record.id, {
    status: active ? "active" : record.goal ? "active" : record.status,
    addRuns: runs
  });
}
function readyActionFromValue(value, pathLabel = "state", depth = 0) {
  if (depth > 8 || !value || typeof value !== "object") return void 0;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = readyActionFromValue(value[index], `${pathLabel}[${index}]`, depth + 1);
      if (found) return found;
    }
    return void 0;
  }
  const input = value;
  for (const key of ["nextReadyAction", "nextAction"]) {
    if (typeof input[key] === "string" && input[key].trim()) return bounded(input[key]);
  }
  if (input.status === "ready") {
    for (const key of ["action", "task", "title", "summary"]) {
      if (typeof input[key] === "string" && input[key].trim()) return bounded(input[key]);
    }
    return `Continue ready mission state at ${pathLabel}`;
  }
  for (const [key, child] of Object.entries(input)) {
    const found = readyActionFromValue(child, `${pathLabel}.${key}`, depth + 1);
    if (found) return found;
  }
  return void 0;
}
function missionStateAction(location, record) {
  const statePath = missionStatePath(location, record.id);
  if (fs14.existsSync(statePath)) {
    const action = readyActionFromValue(JSON.parse(fs14.readFileSync(statePath, "utf-8")));
    if (action) return action;
  }
  const decision = record.decisions.find((item) => item.status === "open");
  if (decision) return bounded(decision.recommendation ?? `Resolve decision: ${decision.title}`);
  return void 0;
}
function retainedResumeTarget(record, retainedChildren) {
  const latestRun = record.runs.at(-1);
  if (!latestRun) return void 0;
  return retainedChildren.find(
    (child) => child.resumability.state === "resumable" && (child.runId === latestRun.runId || child.parentRunId === latestRun.runId)
  );
}
function nextReadyAction(location, record, retainedChildren) {
  const stateAction = missionStateAction(location, record);
  const latestRun = record.runs.at(-1);
  const action = stateAction ?? (latestRun?.status === "failed" || latestRun?.status === "paused" ? `Inspect linked run ${latestRun.runId} and continue the mission` : `Continue objective: ${record.objective}`);
  const retained = retainedResumeTarget(record, retainedChildren);
  return retained ? `Resume retained child ${retained.runId} (${retained.agent}) for: ${bounded(action)}` : bounded(action);
}
function collectGoalContinuationNotices(input) {
  const notices = [];
  const seen = /* @__PURE__ */ new Set();
  const onError = input.onError ?? ((missionId, error) => console.error("Failed to evaluate goal mission", missionId, error));
  for (const listed of listMissions(input.location).records) {
    if (listed.ownerSessionId !== input.ownerSessionId || !listed.goal || TERMINAL_MISSION_STATUSES2.has(listed.status)) continue;
    try {
      let record = refreshGoalMission(input.location, readMission(input.location, listed.id));
      if (!record.goal || record.goal.status !== "active" || !record.budget) continue;
      if ((record.usage?.tokens ?? 0) >= record.budget.tokens) {
        record = updateMission(input.location, record.id, { usage: record.usage ?? { tokens: 0 } });
        if (record.goal?.status === "budget-exhausted") continue;
      }
      if (record.runs.some((run) => run.status && ACTIVE_RUN_STATUSES.has(run.status))) continue;
      if (seen.has(record.id) || !record.budget) continue;
      seen.add(record.id);
      const budget = record.budget.tokens;
      const used = record.usage?.tokens ?? 0;
      const remaining = Math.max(0, budget - used);
      const message2 = [
        `Goal mission needs attention: ${bounded(record.title)}`,
        `Mission: ${record.id}`,
        `Remaining budget: ${remaining} tokens (${used}/${budget} used)`,
        `Next ready action: ${nextReadyAction(input.location, record, input.retainedChildren)}`
      ].join("\n");
      notices.push({
        missionId: record.id,
        message: message2,
        event: {
          type: "needs_attention",
          to: "needs_attention",
          ts: input.now ?? Date.now(),
          runId: `goal-${record.id}-turn-${input.turnId}`,
          agent: "goal mission",
          message: message2,
          reason: "idle"
        }
      });
    } catch (error) {
      onError(listed.id, error);
    }
  }
  return notices;
}

// src/runs/background/interrupted-elsewhere.ts
var INTERRUPTED_ELSEWHERE_MAX_AGE_MS = 24 * 60 * 60 * 1e3;
function interruptedElsewhereLine(reopenId, count) {
  const command = `\`pi --session ${reopenId}\``;
  return count === 1 ? `1 subagent run was interrupted in another session. Reopen it to resume it: ${command}` : `${count} subagent runs were interrupted in another session. Reopen it to resume them: ${command}`;
}
function createInterruptedElsewhereCollector(input) {
  const ownSessions = ownerSessionIds(input.currentSessionId);
  const candidates = /* @__PURE__ */ new Map();
  const recent = (at) => typeof at === "number" && input.now - at <= INTERRUPTED_ELSEWHERE_MAX_AGE_MS;
  const add = (sessionId, runId, ownerDead) => {
    if (ownSessions.has(sessionId)) return;
    const runs = candidates.get(sessionId) ?? /* @__PURE__ */ new Map();
    if (!runs.has(runId)) runs.set(runId, ownerDead);
    candidates.set(sessionId, runs);
  };
  return {
    observeStatus(observed) {
      const status = observed;
      if (!status || typeof status.sessionId !== "string" || typeof status.runId !== "string" || status.state !== "running" && status.state !== "queued") return;
      if (status.parentWorkflowRunId !== void 0 || status.cwd !== input.cwd || !recent(status.lastUpdate ?? status.startedAt)) return;
      const { pid, pidNamespaceScope, bootId } = status;
      if (typeof pid !== "number") return;
      add(status.sessionId, status.runId, () => checkRecordedPidLiveness({ pid, pidNamespaceScope, bootId }) === "dead");
    },
    observeForegroundRun(run) {
      if (!run.sessionId || run.parentWorkflowRunId !== void 0 || run.cwd !== input.cwd || !recent(run.updatedAt)) return;
      add(run.sessionId, run.runId, () => ownerConfirmedDead(run));
    },
    lines() {
      const lines = [];
      for (const [sessionId, runs] of candidates) {
        const reopenId = resolvePiSessionId(sessionId);
        if (!reopenId) continue;
        let interrupted = 0;
        for (const ownerDead of runs.values()) if (ownerDead()) interrupted += 1;
        if (interrupted > 0) lines.push(interruptedElsewhereLine(reopenId, interrupted));
      }
      return lines;
    }
  };
}

// src/extension/upgrade-notice.ts
import * as fs15 from "node:fs";
import * as path15 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var versionNumber = (version) => typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version) ? version.split(".").reduce((total, part) => total * 1e6 + Number(part), 0) : void 0;
async function showUpgradeNotice(ctx, stateDir = path15.join(getAgentDir(), "pi-subagents"), changelogPath = fileURLToPath2(new URL("../../CHANGELOG.md", new URL("../src/extension/upgrade-notice.js", import.meta.url).href)), version = package_default.version) {
  if (!ctx.hasUI) return;
  const statePath = path15.join(stateDir, "last-seen-version.json");
  const lastSeen = await fs15.promises.readFile(statePath, "utf-8").then((raw) => JSON.parse(raw).version).catch(() => void 0);
  const previous = versionNumber(lastSeen);
  const current = versionNumber(version);
  if (current === void 0 || previous === current) return;
  try {
    writeAtomicJson(statePath, { version });
  } catch {
    return;
  }
  if (previous === void 0 || previous > current) return;
  const bullets = (await fs15.promises.readFile(changelogPath, "utf-8")).split(/^## /m).flatMap((section) => {
    const released = versionNumber(/^\[([^\]]+)\]/.exec(section)?.[1]);
    if (released === void 0 || released <= previous || released > current) return [];
    const highlights = section.split(/^### /m).find((part) => part.startsWith("Highlights")) ?? "";
    return (highlights.match(/^- .*/gm) ?? []).map((bullet) => bullet.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim());
  });
  ctx.ui.notify([
    `pi-subagents updated from ${lastSeen} to ${version}`,
    ...bullets.slice(0, 5),
    ...bullets.length > 5 ? [`...and ${bullets.length - 5} more`] : [],
    "Changelog: https://github.com/nicobailon/pi-subagents/blob/main/CHANGELOG.md"
  ].join("\n"), "info");
}

// src/extension/index.ts
var SLOW_RELOAD_PHASE_MS = 250;
var MODULE_PRELOAD_DELAY_MS = 1e3;
var COMPACTION_RESUME_POLL_MS = 50;
var COMPACTION_RESUME_DEADLINE_MS = 1e4;
var RUNTIME_REGISTRY_STORE_KEY = "__piSubagentRuntimeRegistry";
function getRuntimeRegistry() {
  const globalStore = globalThis;
  const existing = globalStore[RUNTIME_REGISTRY_STORE_KEY];
  if (existing?.bySessionManager instanceof WeakMap && existing.activeEntries instanceof Set) {
    if (!(existing.visibleControlNoticesBySessionManager instanceof WeakMap)) {
      existing.visibleControlNoticesBySessionManager = /* @__PURE__ */ new WeakMap();
    }
    return existing;
  }
  const registry = {
    bySessionManager: /* @__PURE__ */ new WeakMap(),
    visibleControlNoticesBySessionManager: /* @__PURE__ */ new WeakMap(),
    activeEntries: /* @__PURE__ */ new Set()
  };
  globalStore[RUNTIME_REGISTRY_STORE_KEY] = registry;
  return registry;
}
function logSlowPhase(label, startedAt) {
  const elapsed = Date.now() - startedAt;
  if (elapsed >= SLOW_RELOAD_PHASE_MS) console.error(`Subagent reload phase '${label}' took ${elapsed}ms.`);
}
function formatWorkflowPreflightCall(input) {
  if (input === void 0) return "";
  try {
    return formatWorkflowPreflightSummary(normalizeWorkflowPreflight(input));
  } catch (error) {
    return `preflight \xB7 rejected: ${error instanceof Error ? error.message : String(error)}`;
  }
}
function getSubagentSessionRoot(parentSessionFile) {
  if (parentSessionFile) {
    const baseName = path16.basename(parentSessionFile, ".jsonl");
    const sessionsDir = path16.dirname(parentSessionFile);
    return path16.join(sessionsDir, baseName);
  }
  return fs16.mkdtempSync(path16.join(os3.tmpdir(), "pi-subagent-session-"));
}
function expandTilde(p) {
  return p.startsWith("~/") ? path16.join(os3.homedir(), p.slice(2)) : p;
}
function isSlashResultRunning(result) {
  return result.details?.progress?.some((entry) => entry.status === "running") || result.details?.results.some((entry) => entry.progress?.status === "running") || false;
}
function isSlashResultError(result) {
  return result.details?.results.some((entry) => entry.exitCode !== 0 && entry.progress?.status !== "running") || false;
}
function rebuildSlashResultContainer(container, result, options, theme, rendererConfig, foregroundDetachShortcut) {
  container.clear();
  container.addChild(new Spacer3(1));
  const boxTheme = isSlashResultRunning(result) ? "toolPendingBg" : isSlashResultError(result) ? "toolErrorBg" : "toolSuccessBg";
  const box = new Box2(1, 1, (text) => theme.bg(boxTheme, text));
  box.addChild(renderSubagentResult(result, options, theme, void 0, rendererConfig, foregroundDetachShortcut));
  container.addChild(box);
}
function createSlashResultComponent(details, options, theme, rendererConfig, foregroundDetachShortcut, getCurrentTheme = () => theme) {
  const container = new Container3();
  let lastVersion = -1;
  let lastTheme;
  container.render = (width) => {
    const snapshot = getSlashRenderableSnapshot(details);
    const currentTheme = getCurrentTheme();
    if (snapshot.version !== lastVersion || currentTheme !== lastTheme || isSlashResultRunning(snapshot.result)) {
      lastVersion = snapshot.version;
      lastTheme = currentTheme;
      rebuildSlashResultContainer(container, snapshot.result, options, currentTheme, rendererConfig, foregroundDetachShortcut);
    }
    return Container3.prototype.render.call(container, width);
  };
  return container;
}
function projectActiveHerdrRuns(state) {
  const active = (status) => status === "queued" || status === "running";
  const foregroundChildrenByWorkflow = /* @__PURE__ */ new Map();
  for (const control of state.foregroundControls.values()) {
    if (!control.parentWorkflowRunId) continue;
    const children = control.activeChildren?.size ? [...control.activeChildren.values()].map((child) => ({
      agent: child.agent,
      needsAttention: child.currentActivityState === "needs_attention"
    })) : control.currentAgent ? [{ agent: control.currentAgent, needsAttention: control.currentActivityState === "needs_attention" }] : [];
    if (children.length === 0) continue;
    const existing = foregroundChildrenByWorkflow.get(control.parentWorkflowRunId) ?? [];
    existing.push(...children);
    foregroundChildrenByWorkflow.set(control.parentWorkflowRunId, existing);
  }
  return [...state.asyncJobs.values()].filter((job) => active(job.status)).map((job) => {
    const currentStep = job.steps?.find((step) => step.status === "running") ?? (job.currentStep !== void 0 ? job.steps?.[job.currentStep] : void 0) ?? job.steps?.find((step) => step.status === "pending");
    if (job.mode === "workflow") {
      const children = foregroundChildrenByWorkflow.get(job.asyncId) ?? [];
      return {
        id: job.asyncId,
        coordinator: true,
        agents: children.map((child) => child.agent),
        ...currentStep?.label ? { taskLabel: currentStep.label } : {},
        needsAttention: job.activityState === "needs_attention" || children.some((child) => child.needsAttention)
      };
    }
    return {
      id: job.asyncId,
      agents: job.agents,
      ...currentStep?.label ? { taskLabel: currentStep.label } : {},
      needsAttention: job.activityState === "needs_attention"
    };
  });
}
function registerSubagentExtension(pi) {
  if (process.env[SUBAGENT_CHILD_ENV] === "1") {
    return;
  }
  const runtimeRegistry = getRuntimeRegistry();
  setMainThinkingLevelSource(() => readMainThinkingLevel(() => pi.getThinkingLevel()));
  DIRS.results = ensureAccessibleDir(DIRS.results);
  DIRS.async = ensureAccessibleDir(DIRS.async);
  cleanupOldChainDirs();
  const config = loadConfig();
  setDeclarationPinning(pi, config.pinToolDeclarations !== false);
  const waitToolConfig = resolveWaitToolConfig(config.waitTool);
  const asyncByDefault = resolveAsyncByDefault(config);
  const fleetViewEnabled = config.fleetView !== false;
  const slashCommandsEnabled = config.enableSlashCommands !== false;
  const foregroundDetachShortcut = slashCommandsEnabled ? config.foregroundDetachShortcut : void 0;
  const fleetViewPlacement = resolveFleetViewPlacement(config.fleetViewPlacement);
  const asyncWidgetEnabled = config.asyncWidget !== false;
  const asyncWidgetCollapsed = config.asyncWidgetCollapsed === true;
  const asyncWidgetLayout = config.asyncWidgetLayout ?? "adaptive";
  const summaryInlineToolDisplay = config.inlineToolDisplay === "summary";
  const tempArtifactsDir = getArtifactsDir(null);
  const artifactCleanupDays = config.artifactConfig?.cleanupDays ?? DEFAULT_ARTIFACT_CONFIG.cleanupDays;
  cleanupAllArtifactDirs(artifactCleanupDays);
  let resultIndexCleanupTimer;
  const state = {
    baseCwd: "",
    currentSessionId: null,
    statusProjectionSessionId: null,
    completionOwnerId: currentCompletionOwnerId(),
    artifactDirPreference: config.artifactDir ?? DEFAULT_ARTIFACT_CONFIG.dir,
    ...config.authorityPolicy ? { authorityPolicy: config.authorityPolicy } : {},
    ...config.missions ? { missionStoreConfig: config.missions } : {},
    parentSessionFile: null,
    trustedSessionRoots: [],
    subagentInProgress: false,
    subagentSpawns: {
      sessionId: null,
      count: 0,
      configuredLimit: resolveMaxSubagentSpawnsPerSession(config.maxSubagentSpawnsPerSession) ?? null,
      granted: 0,
      grantHistory: []
    },
    activeAsyncCapacity: { used: 0, limit: resolveMaxActiveAsyncRunsPerSession(config.maxActiveAsyncRunsPerSession) ?? 0 },
    herdrProjectPanes: /* @__PURE__ */ new Map(),
    asyncJobs: /* @__PURE__ */ new Map(),
    fleetJobs: /* @__PURE__ */ new Map(),
    foregroundRuns: /* @__PURE__ */ new Map(),
    foregroundControls: /* @__PURE__ */ new Map(),
    lastForegroundControlId: null,
    cleanupTimers: /* @__PURE__ */ new Map(),
    lastUiContext: null,
    poller: null,
    completionSeen: /* @__PURE__ */ new Map(),
    widgetsSuspended: false,
    watcher: null,
    watcherRestartTimer: null,
    resultFileCoalescer: {
      schedule: () => false,
      clear: () => {
      }
    }
  };
  const withLastUiContext = (run) => {
    const cached = state.lastUiContext;
    return withCachedUiContext(cached, () => {
      if (state.lastUiContext === cached) state.lastUiContext = null;
    }, run);
  };
  const parentWake = createParentWake(pi);
  const wakingPi = { events: pi.events, sendMessage: parentWake.sendMessage, isHeld: parentWake.isHeld, on: pi.on, appendEntry: (customType, data) => pi.appendEntry(customType, data) };
  const supervisorChannel = createNativeSupervisorChannel(pi, state, {
    // Owner states are created only by scheduled execution, which loads the executor first.
    getCurrentOwnerStates: () => executor?.getCurrentSupervisorOwnerStates() ?? [],
    parentWake
  });
  const waitSubscriptionManager = createWaitSubscriptionManager(wakingPi, state);
  const mainWatchdog = registerMainWatchdog(pi, { slashCommand: slashCommandsEnabled });
  const resultDeliveryOwnership = createResultDeliveryOwnership(state);
  const completionNotifier = registerSubagentNotify(wakingPi, state, { batchConfig: config.completionBatch, ownership: resultDeliveryOwnership });
  const owedResultRunIds = /* @__PURE__ */ new Set();
  const deliveredRunIds = /* @__PURE__ */ new Set();
  const holdOwedResult = (job) => {
    if (!job.parentWorkflowRunId && !deliveredRunIds.has(job.asyncId) && job.sessionId && resultDeliveryOwnership.owns(job.sessionId, job.completionOwnerId)) owedResultRunIds.add(job.asyncId);
  };
  let retainedNestedRouteTracker;
  const fleetStatus = fleetViewEnabled ? new SubagentFleetStatus(state, async (itemKey) => {
    const ctx = withLastUiContext((current) => current);
    if (!ctx) return;
    try {
      const { openSubagentFleet } = await import("./chunk-G4GZD3OJ.js");
      await openSubagentFleet(ctx, state, { initialKey: itemKey, asyncDirRoot: DIRS.async, resultsDir: DIRS.results, fleetKeybindings: config.fleetKeybindings, inspectorPlugins: () => getInspectorPlugins(pi) });
    } catch (error) {
      if (isStaleExtensionContextError(error)) {
        if (state.lastUiContext === ctx) state.lastUiContext = null;
        return;
      }
      throw error;
    }
  }, { placement: fleetViewPlacement, onWorkflowCoverageChange: setInlineWorkflowCoverage }) : void 0;
  let goalTurnId = 0;
  let releaseHostSessionLiveness = () => {
  };
  const scheduledStoreRoot = config.scheduledRuns?.storeRoot === void 0 ? void 0 : resolveScheduledStoreRoot(config.scheduledRuns.storeRoot);
  const scheduledRunManager = createScheduledRunManager({
    config,
    storeRoot: scheduledStoreRoot,
    launch: async (params, ctx, signal) => {
      await waitForAdvertisement();
      return (await getExecutor()).executeScheduled(randomUUID3(), params, signal, ctx);
    },
    resolveCapabilityCeiling: (sessionId) => resolveCurrentSubagentCapabilityCeiling(sessionId)
  });
  let refreshResultDelivery = () => {
  };
  let advertisedAgents = [];
  let advertisedContext;
  let advertisementGeneration = 0;
  let globalRoot = null;
  let advertisementReady = Promise.resolve();
  let notifySessionChange = () => {
  };
  let sessionChanged = Promise.resolve();
  const waitForAdvertisement = async () => {
    let pending;
    do {
      pending = advertisementReady;
      const result = await Promise.race([pending, sessionChanged]);
      if (pending === advertisementReady && result) throw result.error;
    } while (pending !== advertisementReady);
  };
  const refreshAdvertisedAgents = () => {
    advertisedAgents = [];
    if (!advertisedContext) return;
    clearAgentDiscoveryCache();
    advertisedAgents = discoverAgents(advertisedContext.cwd, "both", advertisedContext.model?.provider, { globalNpmRoot: globalRoot, projectTrusted: advertisedContext.projectTrusted }).agents.filter((agent) => agent.advertise === true);
  };
  const beginAdvertisement = (ctx) => {
    const generation = ++advertisementGeneration;
    notifySessionChange();
    sessionChanged = new Promise((resolve6) => {
      notifySessionChange = resolve6;
    });
    advertisedAgents = [];
    advertisedContext = { cwd: ctx.cwd, model: ctx.model, projectTrusted: typeof ctx.isProjectTrusted === "function" ? ctx.isProjectTrusted() : void 0 };
    globalRoot = null;
    advertisementReady = resolveGlobalNpmRoot().then((root) => {
      if (generation !== advertisementGeneration) return;
      globalRoot = root;
      refreshAdvertisedAgents();
    }).catch((error) => {
      if (generation !== advertisementGeneration) return;
      console.error("Failed to refresh advertised agents:", error);
      return { error };
    });
  };
  const activeAsyncJobCount = () => [...state.asyncJobs.values()].filter((job) => job.status === "queued" || job.status === "running").length;
  const hasResultDeliveryDemand = () => {
    if (owedResultRunIds.size > 0) return true;
    if (activeAsyncJobCount() > 0) return true;
    if (state.foregroundControls.size > 0) return true;
    if (scheduledRunManager.observedCompletionRunIds().size > 0) return true;
    return missionObserverResultCandidateFiles(DIRS.results).length > 0;
  };
  const discoverAgentsForRuntime = (cwd, scope, preferredModelProvider, options = {}) => {
    if (listRuntimeAgentConfigs(pi).length === 0) return discoverAgents(cwd, scope, preferredModelProvider, { globalNpmRoot: globalRoot, projectTrusted: options.projectTrusted });
    const snapshot = discoverAgentSnapshot(cwd, scope, preferredModelProvider, { includeChains: false, globalNpmRoot: globalRoot, projectTrusted: options.projectTrusted });
    const discovered = snapshot.effective;
    const all = snapshot.all;
    const configuredAgents = [
      ...all.builtin,
      ...all.package,
      ...all.user,
      ...all.project
    ];
    const merged = mergeRuntimeAgents(pi, discovered, configuredAgents, { cwd, scope: discovered.scope, preferredModelProvider, projectTrusted: options.projectTrusted });
    if (discovered.maxThinking === void 0) return merged;
    return {
      ...merged,
      agents: merged.agents.map((agent) => agent.maxThinking === discovered.maxThinking ? agent : { ...agent, maxThinking: discovered.maxThinking })
    };
  };
  const programStatus = registerProgramStatusReporter({
    enabled: config.programStatus !== false,
    // Fleet history keeps recent finished runs after the widget drops them.
    getJobs: () => new Map([...state.fleetJobs ?? [], ...state.asyncJobs]).values(),
    getPendingRequests: () => supervisorChannel.pending.values()
  });
  const { ensurePoller, refreshWidget, handleStarted, handleComplete, resetJobs, restoreActiveJobs, dispose: disposeAsyncJobTracker } = createAsyncJobTracker(pi, state, DIRS.async, {
    widgetEnabled: asyncWidgetEnabled,
    widgetCollapsed: asyncWidgetCollapsed,
    widgetLayout: asyncWidgetLayout,
    onJobTerminal: (job) => {
      holdOwedResult(job);
      refreshResultDelivery();
    },
    onJobCleanup: (asyncId) => deliveredRunIds.delete(asyncId),
    deliveryOwnerId: resultDeliveryOwnership.deliveryOwnerId,
    supervisorRequestState: supervisorChannel.getSupervisorRequestState,
    onJobsChanged: programStatus.sync
  });
  const resultWatcher = createResultWatcher(
    pi,
    state,
    DIRS.results,
    10 * 60 * 1e3,
    {
      notifier: completionNotifier,
      ownership: resultDeliveryOwnership,
      onResultDelivered: (runId) => {
        owedResultRunIds.delete(runId);
        if (state.asyncJobs.has(runId)) deliveredRunIds.add(runId);
      },
      observeCompletion: (result) => scheduledRunManager.handleAsyncCompletion(result),
      observedCompletionRunIds: () => scheduledRunManager.observedCompletionRunIds(),
      hasDeliveryDemand: hasResultDeliveryDemand,
      deliverIntercomResults: config.intercomBridge?.resultDelivery === true,
      resultScanLogging: config.resultScanLogging
    }
  );
  const { startResultWatcher, transitionResultDelivery, primeExistingResults, stopResultWatcher } = resultWatcher;
  refreshResultDelivery = resultWatcher.refreshResultDelivery;
  const asyncRetentionAbort = new AbortController();
  let asyncRetentionTimer;
  const startSessionMaintenance = () => {
    if (!resultIndexCleanupTimer) {
      resultIndexCleanupTimer = setTimeout(() => {
        try {
          cleanupResultIndexes(DIRS.results);
        } catch (error) {
          console.error("Failed to clean stale subagent result indexes:", error);
        }
      }, 3e4);
      resultIndexCleanupTimer.unref?.();
    }
    waitSubscriptionManager.start();
    if (!asyncRetentionTimer) {
      asyncRetentionTimer = setTimeout(async () => {
        try {
          await cleanupAsyncRetention({
            asyncDirRoot: DIRS.async,
            resultsDir: DIRS.results,
            signal: asyncRetentionAbort.signal,
            protectedRunIds: /* @__PURE__ */ new Set([
              ...state.asyncJobs.keys(),
              ...state.workflowControllers?.keys() ?? [],
              ...scheduledRunManager.referencedAsyncRunIds()
            ])
          });
        } catch (error) {
          console.error("Failed to clean retained async subagent state:", error);
        }
      }, ASYNC_RETENTION_DELAY_MS);
      asyncRetentionTimer.unref?.();
    }
  };
  const executorDeps = {
    pi,
    parentWake,
    state,
    config,
    asyncByDefault,
    waitToolEnabled: waitToolConfig.enabled,
    waitToolDefaultTimeoutMs: waitToolConfig.defaultTimeoutMs,
    handleScheduledRunAction: (params, ctx) => scheduledRunManager.handleToolCall(params, ctx),
    watchdog: mainWatchdog,
    tempArtifactsDir,
    getSubagentSessionRoot,
    expandTilde,
    discoverAgents: discoverAgentsForRuntime,
    discoverAgentsAll: (cwd, provider) => discoverAgentsAll(cwd, provider, { globalNpmRoot: globalRoot }),
    onAgentsChanged: () => {
      try {
        refreshAdvertisedAgents();
      } catch (error) {
        console.error("Failed to refresh advertised agents; catalog withdrawn until refresh:", error);
      }
    },
    activateSupervisorTransport: () => supervisorChannel.activateTransport(),
    findPendingAsks: (target) => supervisorChannel.findPendingAsks(target),
    refreshResultDelivery: () => refreshResultDelivery(),
    trackRetainedNestedRoute: void 0
  };
  let executor;
  let executorPromise;
  let executorModulePromise;
  const loadExecutorModule = () => executorModulePromise ??= import("./chunk-QE4AGIMG.js");
  const getExecutor = () => {
    executorPromise ??= loadExecutorModule().then(({ createSubagentExecutor }) => {
      executor = createSubagentExecutor(executorDeps);
      return executor;
    });
    return executorPromise;
  };
  let modulePreloadTimer;
  const scheduleModulePreload = () => {
    if (executorModulePromise || modulePreloadTimer) return;
    modulePreloadTimer = setTimeout(() => {
      loadExecutorModule().catch(() => {
      });
      if (fleetViewEnabled) import("./chunk-G4GZD3OJ.js").catch(() => {
      });
    }, MODULE_PRELOAD_DELAY_MS);
    modulePreloadTimer.unref?.();
  };
  for (const customType of SUBAGENT_MESSAGE_TYPES) pi.registerMessageRenderer(customType, renderSubagentMessage);
  const registerEntryRenderer = pi.registerEntryRenderer;
  if (typeof registerEntryRenderer === "function") {
    for (const customType of SUBAGENT_ENTRY_TYPES) registerEntryRenderer.call(pi, customType, renderSubagentEntry);
  }
  pi.registerMessageRenderer(SLASH_RESULT_TYPE, (message2, options, theme) => {
    const details = resolveSlashMessageDetails(message2.details);
    if (!details) return void 0;
    return createSlashResultComponent(
      details,
      options,
      theme,
      config.mainWindowRenderer,
      foregroundDetachShortcut,
      () => state.lastUiContext?.ui.theme ?? theme
    );
  });
  const markedMessageTypes = /* @__PURE__ */ new Set([...SUBAGENT_MESSAGE_TYPES, "subagent-compaction-resume", SLASH_RESULT_TYPE, SLASH_TEXT_RESULT_TYPE, ADMIN_MESSAGE_TYPE]);
  pi.on("context", (event) => {
    const messages = [];
    for (const message2 of event.messages) {
      if (message2.role !== "custom" || !markedMessageTypes.has(message2.customType)) {
        messages.push(message2);
        continue;
      }
      if (message2.customType === SLASH_TEXT_RESULT_TYPE && message2.details?.viewOnly === true) continue;
      const open = `<pi_subagents_notice type="${message2.customType}" origin="automated message from the pi-subagents extension, not typed by the user">`;
      const close = "</pi_subagents_notice>";
      messages.push({
        ...message2,
        content: typeof message2.content === "string" ? `${open}
${message2.content}
${close}` : [{ type: "text", text: `${open}
` }, ...message2.content, { type: "text", text: `
${close}` }]
      });
    }
    return { messages };
  });
  pi.registerMessageRenderer(SLASH_TEXT_RESULT_TYPE, (message2, _options, _theme) => {
    const content = typeof message2.content === "string" ? message2.content : message2.content.filter((entry) => entry.type === "text").map((entry) => entry.text).join("\n");
    return new Text2(content, 0, 0);
  });
  const executeSubagentReady = async (id, params, signal, onUpdate, ctx) => {
    await waitForAdvertisement();
    return (await getExecutor()).executePublic(id, params, signal, onUpdate, ctx);
  };
  const autoResumeOwner = {};
  const postAutoResumeFailure = (sourceRunId, refusal) => {
    pi.sendMessage({ customType: WORKFLOW_AUTO_RESUME_MESSAGE_TYPE, content: autoResumeFailureText(sourceRunId, refusal), display: true }, { triggerTurn: false });
  };
  const launchWorkflowAutoResume = async (entry, ctx) => {
    const { prepared } = entry;
    try {
      await new Promise((resolve6) => setImmediate(resolve6));
      await waitForAdvertisement();
      const executor2 = await getExecutor();
      if (entry.state !== "pending") return;
      entry.state = "started";
      const outcome = await executor2.executeWorkflowResume(randomUUID3(), prepared, new AbortController().signal, ctx);
      if (outcome.launched && runtimeCleaned) state.workflowControllers?.get(prepared.newRunId)?.abort(runtimeReplacedAbortReason());
      if (outcome.launched || runtimeCleaned) return;
      try {
        postAutoResumeFailure(prepared.sourceRunId, outcome.refusal);
      } catch (error) {
        console.error(`Failed to post the auto-resume failure of workflow ${prepared.sourceRunId}:`, error);
      }
    } catch (error) {
      if (entry.state === "cancelled") return;
      const message2 = error instanceof Error ? error.message : String(error);
      console.error(`Failed to auto-resume workflow ${prepared.sourceRunId}:`, error);
      try {
        if (resumedRunStarted(prepared.sourceAsyncDir, prepared.newRunId)) return;
        releaseWorkflowResumeClaim(prepared.sourceAsyncDir, prepared.newRunId);
        const refusal = workflowResumeRefusal("launch-failed", `launch failed: ${message2}`, prepared.sourceRunId);
        recordWorkflowResumeRefusal(prepared.sourceAsyncDir, { reason: refusal.reason, byHand: refusal.byHand, newRunId: prepared.newRunId });
        postAutoResumeFailure(prepared.sourceRunId, refusal);
      } catch (cleanupError) {
        console.error(`Failed to give back the auto-resume claim of workflow ${prepared.sourceRunId}:`, cleanupError);
      }
    } finally {
      finishWorkflowAutoResume(entry);
    }
  };
  const executeSubagentCollapsed = (id, params, signal, onUpdate, ctx) => {
    if (ctx.hasUI) ctx.ui.setToolsExpanded(false);
    return executeSubagentReady(id, params, signal, onUpdate, ctx);
  };
  const slashBridge = registerSlashSubagentBridge({
    events: pi.events,
    getContext: () => state.lastUiContext,
    execute: (id, params, signal, onUpdate, ctx) => executeSubagentCollapsed(id, params, signal, onUpdate, ctx)
  });
  const promptTemplateBridge = registerPromptTemplateDelegationBridge({
    events: pi.events,
    getContext: () => state.lastUiContext,
    execute: (requestId, params, signal, ctx, onUpdate) => executeSubagentCollapsed(requestId, params, signal, onUpdate, ctx),
    executeStructured: async (requestId, params, signal, ctx, onUpdate) => {
      if (ctx.hasUI) ctx.ui.setToolsExpanded(false);
      await waitForAdvertisement();
      return (await getExecutor()).executeDelegated(requestId, params, signal, onUpdate, ctx);
    }
  });
  const disabledFeatures = resolveDisabledFeatureSurface(config);
  const rpcBridge = registerSubagentRpcBridge({
    events: pi.events,
    getContext: () => state.lastUiContext,
    execute: executeSubagentReady,
    state,
    disabledFeatures
  });
  const parameters = createSubagentParamsSchema(disabledFeatures);
  const tool = {
    name: "subagent",
    ...MODEL_ONLY_TOOL,
    label: "Subagent",
    description: buildSubagentToolDescription(config, { disabledFeatures }),
    ...buildSubagentToolPromptMetadata(config, disabledFeatures),
    parameters,
    async execute(id, params, signal, onUpdate, ctx) {
      return finalizeToolResult(await executeSubagentCollapsed(id, flattenSubagentToolOptions(params, disabledFeatures), signal ?? new AbortController().signal, onUpdate, ctx));
    },
    renderCall(args, theme) {
      const gap = " ".repeat(config.mainWindowRenderer?.horizontalSpacing ?? 1);
      const title = theme.fg("toolTitle", theme.bold("subagent"));
      if (args.action) {
        const target = args.agent || "";
        return new Text2(
          `${title}${gap}${args.action}${target ? `${gap}${theme.fg("accent", target)}` : ""}`,
          0,
          0
        );
      }
      const preflight = args.options?.preflight ?? args.preflight;
      if (args.workflow !== void 0)
        return new Text2(
          `${title}${gap}${theme.fg("accent", args.workflow === true || args.workflow === "true" ? "workflow (reply block)" : `workflow ${String(args.workflow)}`)}${args.async === true ? `${gap}${theme.fg("warning", "[async]")}` : ""}${preflight !== void 0 ? `${gap}${theme.fg("dim", formatWorkflowPreflightCall(preflight))}` : ""}`,
          0,
          0
        );
      const asyncLabel = args.async === true ? `${gap}${theme.fg("warning", "[async]")}` : "";
      return new Text2(
        `${title}${gap}${theme.fg("accent", args.agent || "?")}${asyncLabel}`,
        0,
        0
      );
    },
    renderResult(result, options, theme, context) {
      clearLegacyResultAnimationTimer(context);
      const renderedResult = { ...result, isError: context.isError };
      return summaryInlineToolDisplay ? renderSubagentSummary(renderedResult, options, theme) : renderSubagentResult(renderedResult, options, theme, void 0, config.mainWindowRenderer, foregroundDetachShortcut);
    }
  };
  registerPinnedTool(pi, tool);
  registerPinnedTool(pi, topLevelSupervisorTool());
  pi.on("before_agent_start", async (event, ctx) => {
    await waitForAdvertisement();
    const sessionId = state.currentSessionId ?? resolveCurrentSessionId(ctx.sessionManager);
    const activeRuns = config.activeRunsPrompt === true ? buildActiveRunsSection(state.asyncJobs.values(), sessionId) : void 0;
    if (activeRuns) event.systemPromptOptions.sections.active_subagents = activeRuns;
    if (!event.systemPromptOptions.selectedTools.includes("subagent")) return;
    const catalog = buildAdvertisedAgentCatalog(advertisedAgents, resolveCurrentSubagentCapabilityCeiling(sessionId), recordedPromptSection(pi, "advertised_subagents"));
    if (catalog) event.systemPromptOptions.sections.advertised_subagents = catalog;
  });
  registerWaitTool(pi, state, waitToolConfig.enabled, waitSubscriptionManager, waitToolConfig.defaultTimeoutMs, void 0, supervisorChannel.hasPendingRequests);
  pi.on("agent_end", async (_event, ctx) => {
    try {
      if (ctx.hasUI && ctx.signal?.aborted) {
        parentWake.userAborted();
        const active = activeAsyncJobCount();
        if (active > 0) ctx.ui.notify(`${active} background subagent run${active === 1 ? " is" : "s are"} still active${slashCommandsEnabled ? " \xB7 /subagents-stop" : ""}`, "info");
      }
      if (!ctx.hasUI) await drainOutstandingWork({ state, events: pi.events, hasPendingSupervisorRequest: supervisorChannel.hasPendingRequests }).then(resultWatcher.deliverPendingResults);
    } finally {
      const ownerSessionId = state.currentSessionId;
      if (ownerSessionId) {
        goalTurnId += 1;
        try {
          const location = resolveMissionStoreLocation({ projectRoot: state.baseCwd, ...config.missions ? { config: config.missions } : {} });
          const retainedChildren = listRetainedChildren(DIRS.async, ownerSessionId);
          for (const notice of collectGoalContinuationNotices({ location, ownerSessionId, retainedChildren, turnId: goalTurnId })) {
            handleSubagentControlNotice({
              pi: parentWake,
              state,
              visibleControlNotices: /* @__PURE__ */ new Set(),
              details: { source: "goal", event: notice.event, noticeText: notice.message }
            });
          }
        } catch (error) {
          console.error("Failed to evaluate goal missions:", error);
        }
      }
    }
  });
  const disposeSlashCommands = slashCommandsEnabled ? registerSlashCommands(pi, state, {
    fleetKeybindings: config.fleetKeybindings,
    foregroundDetachShortcut,
    workflowScriptsDisabled: disabledFeatures.features.has("workflow-scripts")
  }) : { dispose: () => {
  } };
  let visibleControlNotices = /* @__PURE__ */ new Set();
  const activeHerdrRuns = () => projectActiveHerdrRuns(state);
  const herdrStatusBridge = registerHerdrStatusBridge({
    events: pi.events,
    getRuns: activeHerdrRuns,
    getProjectPaneCount: () => [...state.herdrProjectPanes?.values() ?? []].filter((pane) => pane.state === "open").length,
    async runHerdr(args) {
      await pi.exec(process.env.HERDR_BIN || "herdr", [...args], { timeout: 5e3 });
    }
  });
  const controlEventHandler = (payload) => {
    handleSubagentControlNotice({
      pi: parentWake,
      state,
      visibleControlNotices,
      details: payload
    });
  };
  const steeringNoticeHandler = (payload) => {
    handleSubagentSteeringNotice({ pi: parentWake, state, details: payload });
  };
  const asyncStartedHandler = (payload) => {
    handleStarted(payload);
    supervisorChannel.activateTransport();
    refreshResultDelivery();
    fleetStatus?.refresh();
  };
  const asyncCompleteHandler = (payload) => {
    handleComplete(payload);
    const job = state.asyncJobs.get(payload?.id ?? "");
    if (job && job.status !== "queued" && job.status !== "running" && fs16.existsSync(resultFilePath(DIRS.results, job.asyncId))) holdOwedResult(job);
    refreshResultDelivery();
    refreshActiveAsyncCapacity();
    scheduledRunManager.handleAsyncCompletion(payload);
    fleetStatus?.refresh();
  };
  const eventUnsubscribes = [
    registerRuntimeAgentEventListener(pi),
    registerInspectorEventListener(pi),
    pi.events.on(SUBAGENT_ASYNC_STARTED_EVENT, asyncStartedHandler),
    pi.events.on(SUBAGENT_ASYNC_COMPLETE_EVENT, asyncCompleteHandler),
    pi.events.on(SUBAGENT_PROCESS_TERMINAL_EVENT, () => {
      refreshActiveAsyncCapacity();
      fleetStatus?.refresh();
    }),
    pi.events.on(SUBAGENT_CONTROL_EVENT, controlEventHandler),
    pi.events.on(SUBAGENT_STEERING_NOTICE_EVENT, steeringNoticeHandler),
    herdrStatusBridge.dispose,
    rpcBridge.dispose
  ];
  pi.on("tool_result", (event, ctx) => {
    if (event.toolName !== "subagent") return;
    if (!ctx.hasUI) return;
    state.lastUiContext = ctx;
    const activeJobCount = state.asyncJobs.size;
    restoreActiveJobs(ctx);
    if (state.asyncJobs.size > activeJobCount) herdrStatusBridge.syncRuns();
    fleetStatus?.setContext(ctx);
    fleetStatus?.refresh();
    if (state.asyncJobs.size > 0) {
      refreshWidget(ctx);
      ensurePoller();
    }
  });
  const cleanupSessionArtifacts = (ctx) => {
    try {
      const sessionFile = ctx.sessionManager.getSessionFile();
      if (sessionFile) {
        cleanupOldArtifacts(getArtifactsDir(sessionFile), artifactCleanupDays);
      }
    } catch {
    }
  };
  const suspendWidgetsForCompaction = () => {
    if (state.widgetsSuspended) return;
    state.widgetsSuspended = true;
    withLastUiContext((ctx) => ctx.ui.setWidget(WIDGET_KEY, void 0));
    fleetStatus?.refresh();
  };
  const resumeWidgetsAfterCompaction = () => {
    if (!state.widgetsSuspended) return;
    state.widgetsSuspended = false;
    withLastUiContext((ctx) => refreshWidget(ctx));
    fleetStatus?.refresh();
  };
  const refreshActiveAsyncCapacity = () => {
    if (!state.currentSessionId) {
      state.activeAsyncCapacity = { used: 0, limit: resolveMaxActiveAsyncRunsPerSession(config.maxActiveAsyncRunsPerSession) ?? 0 };
      return;
    }
    state.activeAsyncCapacity = getActiveAsyncCapacitySnapshot(
      state.currentSessionId,
      resolveMaxActiveAsyncRunsPerSession(config.maxActiveAsyncRunsPerSession),
      { liveWorkflowRunIds: new Set(state.workflowControllers?.keys() ?? []), abandonedSlotReleaseAfterMs: resolveAbandonedSlotReleaseAfterMs(config.capacity?.abandonedSlotReleaseAfterMs) }
    );
  };
  const resetSessionState = (ctx, recovering, previousSessionFile) => {
    state.widgetsSuspended = false;
    state.baseCwd = ctx.cwd;
    goalTurnId = 0;
    state.currentSessionId = resolveCurrentSessionId(ctx.sessionManager);
    if (previousSessionFile) recordSessionReplacement(state.currentSessionId, previousSessionFile);
    state.supervisorOwnerSessionId = ctx.sessionManager.getSessionId() || null;
    transitionResultDelivery();
    owedResultRunIds.clear();
    deliveredRunIds.clear();
    state.parentSessionFile = ctx.sessionManager.getSessionFile();
    state.trustedSessionFileRoot = state.parentSessionFile ? path16.join(getAgentDir(), "sessions") : void 0;
    state.trustedSessionRoots = [.../* @__PURE__ */ new Set([
      ...config.defaultSessionDir ? [path16.resolve(expandTilde(config.defaultSessionDir))] : [],
      ...state.parentSessionFile ? [getSubagentSessionRoot(state.parentSessionFile)] : []
    ])];
    state.subagentSpawns = {
      sessionId: state.currentSessionId,
      count: 0,
      configuredLimit: resolveMaxSubagentSpawnsPerSession(config.maxSubagentSpawnsPerSession) ?? null,
      granted: 0,
      grantHistory: []
    };
    const projectPaneOwnerRoot = path16.resolve(ctx.cwd);
    restoreHerdrProjectPaneSnapshots(state, [.../* @__PURE__ */ new Set([...state.herdrProjectPanes?.keys() ?? [], ...listHerdrProjectPaneRoots(projectPaneOwnerRoot), projectPaneOwnerRoot])]);
    if (!process.env[SUBAGENT_CHILD_ENV]) {
      delete process.env[SUBAGENT_PARENT_SESSION_ENV];
    }
    state.lastUiContext = ctx;
    let phaseStartedAt = Date.now();
    refreshActiveAsyncCapacity();
    logSlowPhase("active-capacity", phaseStartedAt);
    phaseStartedAt = Date.now();
    cleanupSessionArtifacts(ctx);
    logSlowPhase("session-artifact-cleanup", phaseStartedAt);
    state.foregroundControls.clear();
    retainedNestedRouteTracker?.clear();
    retainedNestedRouteTracker = void 0;
    executorDeps.trackRetainedNestedRoute = void 0;
    state.lastForegroundControlId = null;
    phaseStartedAt = Date.now();
    resetJobs(ctx);
    logSlowPhase("reset-jobs", phaseStartedAt);
    phaseStartedAt = Date.now();
    const interruptedElsewhere = ctx.hasUI ? createInterruptedElsewhereCollector({ currentSessionId: state.currentSessionId, cwd: ctx.cwd, now: Date.now() }) : void 0;
    restoreForegroundRunHistory(state, { resultsDir: DIRS.results, observeForeign: interruptedElsewhere?.observeForegroundRun });
    logSlowPhase("foreground-history", phaseStartedAt);
    phaseStartedAt = Date.now();
    restoreActiveJobs(ctx, interruptedElsewhere?.observeStatus);
    logSlowPhase("active-job-restore", phaseStartedAt);
    phaseStartedAt = Date.now();
    if (interruptedElsewhere) for (const line of interruptedElsewhere.lines()) ctx.ui.notify(line, "info");
    logSlowPhase("cross-session-notice", phaseStartedAt);
    phaseStartedAt = Date.now();
    cancelPendingWorkflowAutoResumes((entry) => entry.owner === autoResumeOwner);
    if (recovering && ctx.hasUI && config.autoResume !== false) {
      for (const entry of planWorkflowAutoResumes({ asyncDirRoot: DIRS.async, currentSessionId: state.currentSessionId, now: Date.now(), owner: autoResumeOwner })) {
        void launchWorkflowAutoResume(entry, ctx);
      }
    }
    logSlowPhase("workflow-auto-resume", phaseStartedAt);
    phaseStartedAt = Date.now();
    scheduledRunManager.bindSession(ctx);
    logSlowPhase("scheduled-runs", phaseStartedAt);
    phaseStartedAt = Date.now();
    restoreSlashFinalSnapshots(ctx.sessionManager.getEntries());
    logSlowPhase("slash-snapshots", phaseStartedAt);
    phaseStartedAt = Date.now();
    waitSubscriptionManager.restore();
    logSlowPhase("wait-subscriptions", phaseStartedAt);
    phaseStartedAt = Date.now();
    startResultWatcher();
    logSlowPhase("result-watcher-start", phaseStartedAt);
    phaseStartedAt = Date.now();
    primeExistingResults({ triggerTurn: !recovering });
    logSlowPhase("result-prime", phaseStartedAt);
    fleetStatus?.setContext(ctx);
  };
  let runtimeCleaned = false;
  const runtimeEntry = {
    sessionManager: null,
    visibleControlNotices,
    cleanup(shutdownReason) {
      if (runtimeCleaned) return;
      runtimeCleaned = true;
      cancelPendingWorkflowAutoResumes((entry) => entry.owner === autoResumeOwner);
      programStatus.dispose(shutdownReason);
      releaseHostSessionLiveness();
      releaseHostSessionLiveness = () => {
      };
      for (const control of state.foregroundControls.values()) {
        try {
          control.stopForRuntimeReplacement?.();
        } catch (error) {
          console.error(`Failed to stop detached foreground run ${control.runId}:`, error);
        }
      }
      for (const controller of state.workflowControllers?.values() ?? []) {
        if (!controller.signal.aborted) controller.abort(runtimeReplacedAbortReason());
      }
      state.workflowControllers?.clear();
      state.workflowChildStops?.clear();
      clearRuntimeAgentsForPi(pi);
      if (resultIndexCleanupTimer) clearTimeout(resultIndexCleanupTimer);
      resultIndexCleanupTimer = void 0;
      if (asyncRetentionTimer) clearTimeout(asyncRetentionTimer);
      asyncRetentionTimer = void 0;
      if (modulePreloadTimer) clearTimeout(modulePreloadTimer);
      modulePreloadTimer = void 0;
      asyncRetentionAbort.abort();
      stopResultWatcher();
      completionNotifier.dispose();
      mainWatchdog.dispose();
      scheduledRunManager.stop();
      supervisorChannel.dispose();
      waitSubscriptionManager.dispose();
      fleetStatus?.dispose();
      disposeAsyncJobTracker();
      for (const timer of state.cleanupTimers.values()) clearTimeout(timer);
      state.cleanupTimers.clear();
      state.asyncJobs.clear();
      retainedNestedRouteTracker?.clear();
      retainedNestedRouteTracker = void 0;
      executorDeps.trackRetainedNestedRoute = void 0;
      for (const unsubscribe of eventUnsubscribes) {
        try {
          unsubscribe();
        } catch {
        }
      }
      disposeSlashCommands.dispose();
      slashBridge.cancelAll();
      slashBridge.dispose();
      promptTemplateBridge.cancelAll();
      promptTemplateBridge.dispose();
      state.widgetsSuspended = false;
      state.currentSessionId = null;
      state.supervisorOwnerSessionId = null;
      state.statusProjectionSessionId = null;
      state.parentSessionFile = null;
      if (runtimeEntry.sessionManager && runtimeRegistry.bySessionManager.get(runtimeEntry.sessionManager) === runtimeEntry) {
        runtimeRegistry.bySessionManager.delete(runtimeEntry.sessionManager);
      }
      runtimeRegistry.activeEntries.delete(runtimeEntry);
      if (runtimeRegistry.activeEntries.size === 0) clearSlashSnapshots();
      try {
        if (state.lastUiContext?.hasUI) state.lastUiContext.ui.setWidget(WIDGET_KEY, void 0);
      } catch (error) {
        if (!isStaleExtensionContextError(error)) throw error;
      }
      state.lastUiContext = null;
    }
  };
  const installRuntime = (ctx) => {
    if (runtimeCleaned) {
      throw new Error("Cannot restart a cleaned pi-subagents extension runtime; register a new extension instance.");
    }
    const sessionManager = ctx.sessionManager;
    const previousRuntime = runtimeRegistry.bySessionManager.get(sessionManager);
    const existingVisibleControlNotices = runtimeRegistry.visibleControlNoticesBySessionManager.get(sessionManager);
    if (existingVisibleControlNotices) {
      visibleControlNotices = existingVisibleControlNotices;
    } else {
      runtimeRegistry.visibleControlNoticesBySessionManager.set(sessionManager, visibleControlNotices);
    }
    runtimeEntry.visibleControlNotices = visibleControlNotices;
    if (runtimeEntry.sessionManager && runtimeEntry.sessionManager !== sessionManager && runtimeRegistry.bySessionManager.get(runtimeEntry.sessionManager) === runtimeEntry) {
      runtimeRegistry.bySessionManager.delete(runtimeEntry.sessionManager);
    }
    runtimeEntry.sessionManager = sessionManager;
    runtimeRegistry.bySessionManager.set(sessionManager, runtimeEntry);
    runtimeRegistry.activeEntries.add(runtimeEntry);
    if (previousRuntime && previousRuntime !== runtimeEntry) {
      try {
        previousRuntime.cleanup();
      } catch {
      }
    }
  };
  let compactionResumeTimer;
  const cancelCompactionResume = () => {
    clearTimeout(compactionResumeTimer);
    compactionResumeTimer = void 0;
  };
  pi.on("agent_start", () => {
    cancelCompactionResume();
    parentWake.agentStarted();
    resumeWidgetsAfterCompaction();
    herdrStatusBridge.agentStarted();
    programStatus.agentStarted();
  });
  pi.on("message_start", (event) => {
    resumeWidgetsAfterCompaction();
    completionNotifier.messageStarted(event.message);
  });
  pi.on("agent_settled", () => {
    resumeWidgetsAfterCompaction();
    programStatus.agentSettled();
  });
  pi.on("session_before_compact", (event) => {
    if (event.reason !== "manual") suspendWidgetsForCompaction();
  });
  pi.on("session_compact", (event) => {
    if (event.reason !== "manual") return;
    if (activeAsyncJobCount() === 0 || !withLastUiContext(() => true)) return;
    cancelCompactionResume();
    const sessionId = state.currentSessionId;
    const deadline = Date.now() + COMPACTION_RESUME_DEADLINE_MS;
    const resumeWhenIdle = () => {
      if (state.currentSessionId !== sessionId || activeAsyncJobCount() === 0) return;
      const idle = withLastUiContext((ctx) => ctx.isIdle());
      if (idle === void 0) return;
      if (!idle) {
        if (Date.now() < deadline) compactionResumeTimer = setTimeout(resumeWhenIdle, COMPACTION_RESUME_POLL_MS);
        return;
      }
      parentWake.releaseHold();
      parentWake.sendMessage(
        {
          customType: "subagent-compaction-resume",
          content: "Compaction is complete. Resume the parent task now; background subagent results will arrive separately when ready.",
          display: false
        },
        { triggerTurn: true }
      );
    };
    compactionResumeTimer = setTimeout(resumeWhenIdle, COMPACTION_RESUME_POLL_MS);
  });
  pi.on("session_start", (event, ctx) => {
    parentWake.bindSession(ctx);
    completionNotifier.bindSession(ctx.sessionManager);
    installRuntime(ctx);
    startSessionMaintenance();
    scheduleModulePreload();
    const recovering = event.reason === "startup" || event.reason === "reload" || event.reason === "resume";
    resetSessionState(ctx, recovering, event.previousSessionFile);
    releaseHostSessionLiveness();
    const sessionId = ctx.sessionManager.getSessionId();
    const sessionFile = ctx.sessionManager.getSessionFile();
    const liveness = sessionId ? registerPiWebSessionLiveness({
      sessionId,
      ...sessionFile ? { sessionFile } : {},
      isActive: () => owedResultRunIds.size > 0 || hasLiveSubagentWork(state) || completionNotifier.hasPendingDelivery() || parentWake.isPending()
    }) : { registered: false, release: () => {
    } };
    releaseHostSessionLiveness = liveness.release;
    if (liveness.registered) {
      retainedNestedRouteTracker = createRetainedNestedRouteTracker(state);
      executorDeps.trackRetainedNestedRoute = retainedNestedRouteTracker.track;
    }
    herdrStatusBridge.sessionStarted({
      hasUI: ctx.hasUI === true,
      runs: activeHerdrRuns()
    });
    programStatus.sessionStarted({ hasUI: ctx.hasUI === true, mode: ctx.mode });
    rpcBridge.emitReady(ctx);
    supervisorChannel.start();
    supervisorChannel.activateTransport();
  });
  pi.on("session_shutdown", async (event) => {
    cancelCompactionResume();
    completionNotifier.sessionShutdown(event?.reason);
    parentWake.sessionShutdown(event?.reason);
    runtimeEntry.cleanup(event?.reason);
    try {
      await disposeChildSessions();
    } catch (error) {
      console.error("Failed to dispose in-process child sessions:", error);
    }
    await herdrStatusBridge.flush();
  });
  pi.on("session_start", (_event, ctx) => void showUpgradeNotice(ctx).catch((error) => console.error("Failed to show the pi-subagents upgrade notice:", error)));
  pi.on("session_start", (_event, ctx) => beginAdvertisement(ctx));
  registerSubagentToolActivation(pi, {
    mode: config.toolActivation,
    // The channel's session_start poll already declared the reply tool for these; the replay must not drop it.
    hasPendingSupervisorRequest: () => [...supervisorChannel.pending.values()].some((request) => request.expectsReply),
    advertisedPrompt: async () => {
      await waitForAdvertisement();
      return buildAdvertisedAgentPrompt(advertisedAgents, resolveCurrentSubagentCapabilityCeiling(state.currentSessionId ?? void 0));
    }
  });
}
export {
  registerSubagentExtension as default,
  projectActiveHerdrRuns
};
