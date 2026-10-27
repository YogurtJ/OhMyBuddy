// src/shared/types.ts
import * as os from "node:os";
import * as path from "node:path";
var SUBAGENT_LIFECYCLE_ARTIFACT_VERSION = 3;
var INTERCOM_DETACH_REQUEST_EVENT = "pi-intercom:detach-request";
var INTERCOM_DETACH_RESPONSE_EVENT = "pi-intercom:detach-response";
var INTERCOM_SESSION_IDENTITY_EVENT = "intercom:session-identity";
var SUBAGENT_ASYNC_STARTED_EVENT = "subagent:async-started";
var RUNNER_LAUNCHER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
var RUNNER_LAUNCHER_NAME_RULE = "must start with a letter or digit and use only letters, digits, '.', '_' or '-' (at most 128 characters)";
var SUBAGENT_ASYNC_COMPLETE_EVENT = "subagent:async-complete";
var SUBAGENT_PROCESS_TERMINAL_EVENT = "subagent:process-terminal";
var SUBAGENT_FOREGROUND_COMPLETE_EVENT = "subagent:foreground-complete";
var SUBAGENT_CONTROL_EVENT = "subagent:control-event";
var SUBAGENT_CONTROL_INTERCOM_EVENT = "subagent:control-intercom";
var SUBAGENT_STEERING_NOTICE_EVENT = "subagent:steering-notice";
var SUBAGENT_CHILD_STATUS_EVENT = "subagent:child-status";
var SUBAGENT_RESULT_INTERCOM_EVENT = "subagent:result-intercom";
var SUBAGENT_RESULT_INTERCOM_DELIVERY_EVENT = "subagent:result-intercom-delivery";
var FLEET_KEYBINDING_ACTIONS = [
  "close",
  "scrollUp",
  "scrollDown",
  "selectUp",
  "selectDown",
  "selectFirst",
  "selectLast",
  "pageUp",
  "pageDown",
  "refresh",
  "steer",
  "inspect",
  "stop",
  "toggleTools"
];
var DEFAULT_MAX_OUTPUT = {
  bytes: 200 * 1024,
  lines: 5e3
};
var DEFAULT_ARTIFACT_CONFIG = {
  enabled: true,
  dir: "session",
  includeInput: true,
  includeOutput: true,
  includeJsonl: false,
  includeTranscript: true,
  includeMetadata: true,
  cleanupDays: 7
};
function sanitizeTempScopeSegment(value) {
  const sanitized = value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "unknown";
}
function resolveTempScopeId(options) {
  const env = options?.env ?? process.env;
  const getuid = options && Object.hasOwn(options, "getuid") ? options.getuid : process.getuid?.bind(process);
  if (typeof getuid === "function") {
    return `uid-${getuid()}`;
  }
  for (const key of ["USERNAME", "USER", "LOGNAME"]) {
    const value = env[key];
    if (value) return `user-${sanitizeTempScopeSegment(value)}`;
  }
  const userInfo2 = options && Object.hasOwn(options, "userInfo") ? options.userInfo : os.userInfo;
  try {
    const username = userInfo2?.().username;
    if (username) return `user-${sanitizeTempScopeSegment(username)}`;
  } catch {
  }
  const homedir2 = env.USERPROFILE ?? env.HOME;
  if (homedir2) return `home-${sanitizeTempScopeSegment(homedir2)}`;
  const resolveHomedir = options && Object.hasOwn(options, "homedir") ? options.homedir : os.homedir;
  try {
    const fallbackHomedir = resolveHomedir?.();
    if (fallbackHomedir) return `home-${sanitizeTempScopeSegment(fallbackHomedir)}`;
  } catch {
  }
  return "shared";
}
var configuredTempRoot = process.env.PI_SUBAGENTS_TEMP_ROOT?.trim();
var TEMP_ROOT_DIR = configuredTempRoot ? path.resolve(configuredTempRoot) : path.join(os.tmpdir(), `pi-subagents-${resolveTempScopeId()}`);
var RESULTS_DIR = path.join(TEMP_ROOT_DIR, "async-subagent-results");
var ASYNC_DIR = path.join(TEMP_ROOT_DIR, "async-subagent-runs");
var CHAIN_RUNS_DIR = path.join(TEMP_ROOT_DIR, "chain-runs");
var TEMP_ARTIFACTS_DIR = path.join(TEMP_ROOT_DIR, "artifacts");
var DIRS = {
  results: RESULTS_DIR,
  async: ASYNC_DIR,
  chain: CHAIN_RUNS_DIR,
  artifacts: TEMP_ARTIFACTS_DIR
};
var WIDGET_KEY = "subagent-async";
var SLASH_RESULT_TYPE = "subagent-slash-result";
var SLASH_TEXT_RESULT_TYPE = "subagent-slash-text-result";
var SLASH_TEXT_VIEW_ONLY_DETAILS = { viewOnly: true };
var SLASH_SUBAGENT_REQUEST_EVENT = "subagent:slash:request";
var SLASH_SUBAGENT_STARTED_EVENT = "subagent:slash:started";
var SLASH_SUBAGENT_RESPONSE_EVENT = "subagent:slash:response";
var SLASH_SUBAGENT_UPDATE_EVENT = "subagent:slash:update";
var SLASH_SUBAGENT_CANCEL_EVENT = "subagent:slash:cancel";
var POLL_INTERVAL_MS = 250;
var WIDGET_ANIMATION_INTERVAL_MS = 1e3;
var MAX_WIDGET_JOBS = 4;
var DEFAULT_SUBAGENT_MAX_DEPTH = 2;
var SUBAGENT_ACTIONS = ["list", "get", "models", "children.list", "guide", "validate", "create", "update", "delete", "eject", "disable", "enable", "reset", "mission.create", "mission.list", "mission.show", "mission.update", "mission.resolve-decision", "mission.attach-run", "mission.close", "worktree.discard", "worktree.cleanup", "lane.status", "lane.recordMerge", "lane.recordSupersession", "refine", "refine.show", "refine.rollback", "inspector.open", "inspector.command", "inspector.status", "inspector.close", "project.open", "project.status", "project.close", "status", "debug.run", "grant-spawn-budget", "interrupt", "resume", "steer", "stop", "command.status", "command.yield", "command.cancel", "dismiss", "doctor", "watchdog.status", "watchdog.check", "watchdog.configure", "watchdog.recommend-model", "schedule.create", "schedule.list", "schedule.show", "schedule.history", "schedule.pause", "schedule.resume", "schedule.run", "schedule.run-due", "schedule.delete"];
var DEFAULT_FORK_PREAMBLE = "You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.";
function getAsyncConfigPath(suffix) {
  return path.join(TEMP_ROOT_DIR, `async-cfg-${suffix}.json`);
}
function wrapForkTask(task, preamble) {
  if (preamble === false) return task;
  const effectivePreamble = preamble ?? DEFAULT_FORK_PREAMBLE;
  const wrappedPrefix = `${effectivePreamble}

Task:
`;
  if (task.startsWith(wrappedPrefix)) return task;
  return `${wrappedPrefix}${task}`;
}
function normalizeNonNegativeInteger(value) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < 0) return void 0;
  return parsed;
}
function normalizeMaxSubagentDepth(value) {
  return normalizeNonNegativeInteger(value);
}
var SUBAGENT_MAX_DEPTH_ENV = "PI_SUBAGENT_MAX_DEPTH";
function resolveCurrentMaxSubagentDepth(configMaxDepth, runtime) {
  return normalizeMaxSubagentDepth(runtime ? runtime.maxDepth : process.env[SUBAGENT_MAX_DEPTH_ENV]) ?? normalizeMaxSubagentDepth(configMaxDepth) ?? DEFAULT_SUBAGENT_MAX_DEPTH;
}
function resolveChildMaxSubagentDepth(parentMaxDepth, agentMaxDepth) {
  const normalizedParent = normalizeMaxSubagentDepth(parentMaxDepth) ?? DEFAULT_SUBAGENT_MAX_DEPTH;
  const normalizedAgent = normalizeMaxSubagentDepth(agentMaxDepth);
  return normalizedAgent === void 0 ? normalizedParent : Math.min(normalizedParent, normalizedAgent);
}
function resolveCurrentSubagentDepth(runtime) {
  const depth = runtime ? runtime.depth : 0;
  return Number.isFinite(depth) ? depth : 0;
}
function checkSubagentDepth(configMaxDepth, runtime) {
  const depth = resolveCurrentSubagentDepth(runtime);
  const maxDepth = resolveCurrentMaxSubagentDepth(configMaxDepth, runtime);
  const blocked = depth >= maxDepth;
  return { blocked, depth, maxDepth };
}
function resolveChildDepth(maxDepth, runtime) {
  return {
    depth: resolveCurrentSubagentDepth(runtime) + 1,
    maxDepth: normalizeMaxSubagentDepth(maxDepth) ?? resolveCurrentMaxSubagentDepth(void 0, runtime)
  };
}
function normalizeMaxSubagentSpawnsPerSession(value) {
  return normalizeNonNegativeInteger(value);
}
function resolveMaxSubagentSpawnsPerSession(configMaxSpawns) {
  const envMaxSpawns = normalizeMaxSubagentSpawnsPerSession(process.env.PI_SUBAGENT_MAX_SPAWNS_PER_SESSION);
  if (envMaxSpawns !== void 0) return envMaxSpawns === 0 ? void 0 : envMaxSpawns;
  const configuredMaxSpawns = normalizeMaxSubagentSpawnsPerSession(configMaxSpawns);
  return configuredMaxSpawns === 0 ? void 0 : configuredMaxSpawns;
}
var DEFAULT_MAX_SUBAGENT_SPAWNS_PER_RUN = 64;
function normalizeMaxSubagentSpawnsPerRun(value) {
  const normalized = normalizeNonNegativeInteger(value);
  return normalized !== void 0 && normalized > 0 ? normalized : void 0;
}
function resolveMaxSubagentSpawnsPerRun(configMaxSpawns) {
  return normalizeMaxSubagentSpawnsPerRun(process.env.PI_SUBAGENT_MAX_SPAWNS_PER_RUN) ?? normalizeMaxSubagentSpawnsPerRun(configMaxSpawns) ?? DEFAULT_MAX_SUBAGENT_SPAWNS_PER_RUN;
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
function truncateOutput(output, config, artifactPath) {
  const lines = output.split("\n");
  const bytes = Buffer.byteLength(output, "utf-8");
  if (bytes <= config.bytes && lines.length <= config.lines) {
    return { text: output, truncated: false };
  }
  let truncatedLines = lines;
  if (lines.length > config.lines) {
    truncatedLines = lines.slice(0, config.lines);
  }
  let result = truncatedLines.join("\n");
  if (Buffer.byteLength(result, "utf-8") > config.bytes) {
    let low = 0;
    let high = result.length;
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (Buffer.byteLength(result.slice(0, mid), "utf-8") <= config.bytes) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    result = result.slice(0, low);
  }
  const keptLines = result.split("\n").length;
  const marker = `[TRUNCATED: showing first ${keptLines} of ${lines.length} lines, ${formatBytes(Buffer.byteLength(result))} of ${formatBytes(bytes)}${artifactPath ? ` - full output at ${artifactPath}` : ""}]
`;
  return {
    text: marker + result,
    truncated: true,
    originalBytes: bytes,
    originalLines: lines.length,
    artifactPath
  };
}

export {
  SUBAGENT_LIFECYCLE_ARTIFACT_VERSION,
  INTERCOM_DETACH_REQUEST_EVENT,
  INTERCOM_DETACH_RESPONSE_EVENT,
  INTERCOM_SESSION_IDENTITY_EVENT,
  SUBAGENT_ASYNC_STARTED_EVENT,
  RUNNER_LAUNCHER_NAME_PATTERN,
  RUNNER_LAUNCHER_NAME_RULE,
  SUBAGENT_ASYNC_COMPLETE_EVENT,
  SUBAGENT_PROCESS_TERMINAL_EVENT,
  SUBAGENT_FOREGROUND_COMPLETE_EVENT,
  SUBAGENT_CONTROL_EVENT,
  SUBAGENT_CONTROL_INTERCOM_EVENT,
  SUBAGENT_STEERING_NOTICE_EVENT,
  SUBAGENT_CHILD_STATUS_EVENT,
  SUBAGENT_RESULT_INTERCOM_EVENT,
  SUBAGENT_RESULT_INTERCOM_DELIVERY_EVENT,
  FLEET_KEYBINDING_ACTIONS,
  DEFAULT_MAX_OUTPUT,
  DEFAULT_ARTIFACT_CONFIG,
  TEMP_ROOT_DIR,
  ASYNC_DIR,
  CHAIN_RUNS_DIR,
  TEMP_ARTIFACTS_DIR,
  DIRS,
  WIDGET_KEY,
  SLASH_RESULT_TYPE,
  SLASH_TEXT_RESULT_TYPE,
  SLASH_TEXT_VIEW_ONLY_DETAILS,
  SLASH_SUBAGENT_REQUEST_EVENT,
  SLASH_SUBAGENT_STARTED_EVENT,
  SLASH_SUBAGENT_RESPONSE_EVENT,
  SLASH_SUBAGENT_UPDATE_EVENT,
  SLASH_SUBAGENT_CANCEL_EVENT,
  POLL_INTERVAL_MS,
  WIDGET_ANIMATION_INTERVAL_MS,
  MAX_WIDGET_JOBS,
  SUBAGENT_ACTIONS,
  DEFAULT_FORK_PREAMBLE,
  getAsyncConfigPath,
  wrapForkTask,
  resolveCurrentMaxSubagentDepth,
  resolveChildMaxSubagentDepth,
  checkSubagentDepth,
  resolveChildDepth,
  resolveMaxSubagentSpawnsPerSession,
  normalizeMaxSubagentSpawnsPerRun,
  resolveMaxSubagentSpawnsPerRun,
  truncateOutput
};
