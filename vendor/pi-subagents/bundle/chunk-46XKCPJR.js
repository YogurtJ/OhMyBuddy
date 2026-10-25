import {
  PROJECT_SUBAGENTS_RELATIVE_DIR
} from "./chunk-5TYMSZX3.js";
import {
  DEFAULT_FILE_SYSTEM_RETRY_DELAYS_MS,
  DEFAULT_GLOBAL_CONCURRENCY_LIMIT,
  PROMPT_REDACTED,
  Semaphore,
  THINKING_LEVELS,
  createOwnedProcessTreeController,
  describeGateAcceptanceConflict,
  getAgentDir,
  isRetryableFileSystemError,
  isStorageCapacityError,
  parseGateInput,
  quoteExecutableForShell,
  readStatus,
  resolveEffectiveThinking,
  resolveSingleOutputClaimPath,
  runFileSystemOperationWithRetry,
  waitForFileSystemRetry,
  withFileLease,
  writeAtomicJson,
  writePrivateAtomicJson
} from "./chunk-CIZQXJ5Q.js";
import {
  DIRS,
  SUBAGENT_LIFECYCLE_ARTIFACT_VERSION,
  TEMP_ROOT_DIR
} from "./chunk-5LFLVSTM.js";

// src/runs/background/index-segment.ts
import { createHash } from "node:crypto";
var MAX_INDEX_SEGMENT_BYTES = 255;
var HASHED_INDEX_SEGMENT_PREFIX = "~sha256-";
var WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
function hashedSegment(value) {
  return `${HASHED_INDEX_SEGMENT_PREFIX}${createHash("sha256").update(value).digest("hex")}`;
}
function isPortableSegment(value) {
  return value.length > 0 && value !== "." && value !== ".." && !value.endsWith(".") && !WINDOWS_RESERVED_NAME.test(value) && !/%5C/i.test(value) && !/\.[A-Za-z][A-Za-z0-9]{0,7}$/.test(value);
}
function encodeIndexSegment(value, maxBytes = MAX_INDEX_SEGMENT_BYTES) {
  let encoded;
  try {
    encoded = encodeURIComponent(value);
  } catch {
    return hashedSegment(value);
  }
  if (Buffer.byteLength(encoded, "utf-8") <= maxBytes && isPortableSegment(encoded)) return encoded;
  return hashedSegment(value);
}
function historicallyReadableSegment(value, maxBytes) {
  try {
    const encoded = encodeURIComponent(value);
    if (encoded.length === 0 || encoded === "." || encoded === ".." || encoded.endsWith(".") || WINDOWS_RESERVED_NAME.test(encoded)) return void 0;
    if (Buffer.byteLength(encoded, "utf-8") > maxBytes) return void 0;
    return encoded;
  } catch {
    return void 0;
  }
}
function indexSegmentAliases(value, maxBytes = MAX_INDEX_SEGMENT_BYTES) {
  const current = encodeIndexSegment(value, maxBytes);
  const historical = historicallyReadableSegment(value, maxBytes);
  return historical && historical !== current ? [current, historical] : [current];
}

// src/runs/background/active-run-index.ts
import * as fs2 from "node:fs";
import * as path3 from "node:path";

// src/runs/background/terminal-run-index.ts
import * as fs from "node:fs";
import * as path2 from "node:path";

// src/runs/shared/nested-path.ts
import * as path from "node:path";
var MAX_NESTED_ID_LENGTH = 128;
var MAX_NESTED_PATH_ENTRIES = 4;
function isSafeNestedPathId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_NESTED_ID_LENGTH && !path.isAbsolute(value) && !value.includes("/") && !value.includes("\\") && !value.includes("..");
}
function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function nonEmptyString(value, max) {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : void 0;
}
function sanitizeNestedPath(value) {
  if (!Array.isArray(value)) return [];
  return value.map((part) => {
    if (!part || typeof part !== "object") return void 0;
    const record = part;
    if (!isSafeNestedPathId(record.runId)) return void 0;
    return {
      runId: record.runId,
      ...finiteNumber(record.stepIndex) !== void 0 ? { stepIndex: finiteNumber(record.stepIndex) } : {},
      ...nonEmptyString(record.agent, 128) ? { agent: nonEmptyString(record.agent, 128) } : {}
    };
  }).filter((part) => Boolean(part)).slice(0, MAX_NESTED_PATH_ENTRIES);
}

// src/runs/background/terminal-run-index.ts
var TERMINAL_RUN_INDEX_DIR = ".terminal-runs";
var TERMINAL_RUN_INDEX_VERSION = 1;
var TIMESTAMP_WIDTH = 16;
var TOOL_CALL_INDEX_DIR = "@tool-calls";
function isTerminalState(state) {
  return state === "complete" || state === "failed" || state === "partial" || state === "paused" || state === "stopped" || state === "rejected";
}
function isCorruptStatusError(error, statusPath) {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith(`Failed to parse async status file '${statusPath}'`) || message.startsWith(`Failed to validate async status file '${statusPath}'`);
}
var reportedCorruptTerminalStatus = /* @__PURE__ */ new Map();
function warnCorruptTerminalStatus(runId, statusPath, error, onCorruptStatus) {
  let fileSignature = "unavailable";
  try {
    const stat = fs.statSync(statusPath);
    fileSignature = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}`;
  } catch (statError) {
    if (statError.code !== "ENOENT") throw statError;
  }
  const message = error instanceof Error ? error.message : String(error);
  const signature = `${fileSignature}
${message}`;
  if (reportedCorruptTerminalStatus.get(statusPath) === signature) return;
  reportedCorruptTerminalStatus.set(statusPath, signature);
  const warning = `Skipping indexed terminal run '${runId}' with corrupt status at '${statusPath}': ${message}`;
  if (onCorruptStatus) onCorruptStatus(warning);
  else console.error(`[pi-subagents] ${warning}`);
}
function indexRoot(asyncDirRoot) {
  return path2.join(asyncDirRoot, TERMINAL_RUN_INDEX_DIR);
}
function sessionIndexDir(asyncDirRoot, sessionId) {
  return path2.join(indexRoot(asyncDirRoot), encodeIndexSegment(sessionId));
}
function toolCallIndexDir(asyncDirRoot, toolCallId) {
  return path2.join(indexRoot(asyncDirRoot), TOOL_CALL_INDEX_DIR, encodeIndexSegment(toolCallId));
}
function toolCallMarkerName(runId) {
  return `${encodeIndexSegment(runId, 250)}.json`;
}
function markerName(endedAt, runId) {
  return `${Math.max(0, Math.floor(endedAt)).toString().padStart(TIMESTAMP_WIDTH, "0")}-${encodeIndexSegment(runId)}.json`;
}
function markerPath(asyncDir, sessionId, endedAt) {
  return path2.join(sessionIndexDir(path2.dirname(asyncDir), sessionId), markerName(endedAt, path2.basename(asyncDir)));
}
function parseEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const entry = value;
  if (entry.version !== TERMINAL_RUN_INDEX_VERSION || typeof entry.runId !== "string" || !entry.runId || typeof entry.sessionId !== "string" || !entry.sessionId || typeof entry.endedAt !== "number" || !Number.isFinite(entry.endedAt)) return void 0;
  return { version: TERMINAL_RUN_INDEX_VERSION, runId: entry.runId, sessionId: entry.sessionId, endedAt: entry.endedAt };
}
function updateTerminalRunIndex(asyncDir, status) {
  if (!isTerminalState(status.state) || typeof status.sessionId !== "string" || !status.sessionId) return;
  const endedAt = status.endedAt ?? status.lastUpdate ?? status.startedAt;
  const marker = markerPath(asyncDir, status.sessionId, endedAt);
  const entry = {
    version: TERMINAL_RUN_INDEX_VERSION,
    runId: status.runId || path2.basename(asyncDir),
    sessionId: status.sessionId,
    endedAt
  };
  writeAtomicJson(marker, entry);
  if (status.toolCallId) {
    try {
      writeAtomicJson(path2.join(toolCallIndexDir(path2.dirname(asyncDir), status.toolCallId), toolCallMarkerName(entry.runId)), entry);
    } catch (error) {
      console.error(`Failed to write async terminal-run tool-call index for '${asyncDir}':`, error);
    }
  }
}
function removeInvalidMarker(marker) {
  try {
    fs.rmSync(marker, { force: true });
  } catch {
  }
}
function markerFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => ({ dir, name: entry.name }));
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw error;
  }
}
function sessionDirs(asyncDirRoot, sessionId) {
  if (sessionId) return [sessionIndexDir(asyncDirRoot, sessionId)];
  try {
    return fs.readdirSync(indexRoot(asyncDirRoot), { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== TOOL_CALL_INDEX_DIR).map((entry) => path2.join(indexRoot(asyncDirRoot), entry.name));
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw error;
  }
}
function recentMarkerFiles(dirs, limit, endedAfter) {
  return dirs.flatMap(markerFiles).filter((marker) => endedAfter === void 0 || !(Number(marker.name.slice(0, TIMESTAMP_WIDTH)) < endedAfter)).sort((left, right) => right.name.localeCompare(left.name)).slice(0, limit).map((marker) => path2.join(marker.dir, marker.name));
}
function readTerminalRunToolCallIndex(asyncDirRoot, toolCallId) {
  const runIds = [];
  for (const file of markerFiles(toolCallIndexDir(asyncDirRoot, toolCallId))) {
    const marker = path2.join(file.dir, file.name);
    let entry;
    try {
      entry = parseEntry(JSON.parse(fs.readFileSync(marker, "utf-8")));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      if (!(error instanceof SyntaxError)) throw error;
    }
    if (!entry || !isSafeNestedPathId(entry.runId) || file.name !== toolCallMarkerName(entry.runId)) {
      removeInvalidMarker(marker);
      continue;
    }
    const status = readStatus(path2.join(asyncDirRoot, entry.runId));
    if (!status || !isTerminalState(status.state) || status.runId !== entry.runId || status.sessionId !== entry.sessionId || status.toolCallId !== toolCallId) {
      removeInvalidMarker(marker);
      continue;
    }
    runIds.push(entry.runId);
  }
  return runIds;
}
function readRecentTerminalRunIndex(asyncDirRoot, options = {}) {
  const limit = options.limit === void 0 ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(options.limit));
  const candidates = recentMarkerFiles(sessionDirs(asyncDirRoot, options.sessionId), limit, options.endedAfter);
  const runIds = [];
  const seen = /* @__PURE__ */ new Set();
  for (const marker of candidates) {
    let entry;
    try {
      entry = parseEntry(JSON.parse(fs.readFileSync(marker, "utf-8")));
    } catch (error) {
      if (error.code === "ENOENT") continue;
    }
    if (!entry || options.sessionId !== void 0 && entry.sessionId !== options.sessionId) {
      removeInvalidMarker(marker);
      continue;
    }
    const asyncDir = path2.join(asyncDirRoot, entry.runId);
    const statusPath = path2.join(asyncDir, "status.json");
    let status;
    try {
      status = readStatus(asyncDir);
    } catch (error) {
      if (!isCorruptStatusError(error, statusPath)) throw error;
      warnCorruptTerminalStatus(entry.runId, statusPath, error, options.onCorruptStatus);
      continue;
    }
    if (!status || !isTerminalState(status.state) || status.sessionId !== entry.sessionId || status.runId && status.runId !== entry.runId) {
      removeInvalidMarker(marker);
      continue;
    }
    if (seen.has(entry.runId)) {
      removeInvalidMarker(marker);
      continue;
    }
    seen.add(entry.runId);
    runIds.push(entry.runId);
  }
  return runIds;
}

// src/runs/background/active-run-index.ts
var ACTIVE_RUN_INDEX_DIR = ".active-runs";
var DEFAULT_STALE_TERMINAL_ACTIVE_MARKER_MS = 24 * 60 * 60 * 1e3;
var TOOL_CALL_INDEX_DIR2 = "tool-calls";
function indexDir(asyncDirRoot) {
  return path3.join(asyncDirRoot, ACTIVE_RUN_INDEX_DIR);
}
function toolCallIndexDir2(asyncDirRoot, toolCallId) {
  return path3.join(indexDir(asyncDirRoot), TOOL_CALL_INDEX_DIR2, encodeIndexSegment(toolCallId));
}
function toolCallIndexPath(asyncDir, toolCallId) {
  return path3.join(toolCallIndexDir2(path3.dirname(asyncDir), toolCallId), path3.basename(asyncDir));
}
function markerPath2(asyncDir) {
  return path3.join(indexDir(path3.dirname(asyncDir)), path3.basename(asyncDir));
}
function removeEmptyAncestors(start, stop) {
  let current = start;
  while (current !== stop && current.startsWith(`${stop}${path3.sep}`)) {
    try {
      fs2.rmdirSync(current);
    } catch {
      return;
    }
    current = path3.dirname(current);
  }
}
function isActiveAsyncState(state) {
  return state === "queued" || state === "running";
}
function releaseToolCallAliases(asyncDir) {
  const root = path3.join(indexDir(path3.dirname(asyncDir)), TOOL_CALL_INDEX_DIR2);
  let entries;
  try {
    entries = fs2.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    const code = error.code;
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      console.error(`Failed to inspect async active-run tool-call index root '${root}':`, error);
    }
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const aliasMarker = path3.join(root, entry.name, path3.basename(asyncDir));
    try {
      fs2.rmSync(aliasMarker, { force: true });
      removeEmptyAncestors(path3.dirname(aliasMarker), root);
    } catch {
    }
  }
}
function releaseActiveRunIndex(asyncDir) {
  try {
    fs2.rmSync(markerPath2(asyncDir));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  releaseToolCallAliases(asyncDir);
}
function updateActiveRunIndex(asyncDir, state, toolCallId, options = {}) {
  const marker = markerPath2(asyncDir);
  if (isActiveAsyncState(state)) {
    fs2.mkdirSync(path3.dirname(marker), { recursive: true });
    fs2.writeFileSync(marker, "", { flag: "a" });
    if (toolCallId) {
      try {
        const toolCallMarker = toolCallIndexPath(asyncDir, toolCallId);
        fs2.mkdirSync(path3.dirname(toolCallMarker), { recursive: true });
        fs2.writeFileSync(toolCallMarker, "", { flag: "a" });
      } catch (error) {
        console.error(`Failed to write async active-run tool-call index for '${asyncDir}':`, error);
      }
    }
    return;
  }
  if (options.terminalIndexBeforeRelease) {
    fs2.mkdirSync(path3.dirname(marker), { recursive: true });
    fs2.writeFileSync(marker, "", { flag: "a" });
    const status2 = readStatus(asyncDir);
    if (status2?.state === state) {
      try {
        updateTerminalRunIndex(asyncDir, status2);
      } catch (error) {
        if (options.retryCapacityErrors) throw error;
        console.error(`Failed to write async terminal-run index for '${asyncDir}':`, error);
        return;
      }
    }
    releaseActiveRunIndex(asyncDir);
    return;
  }
  releaseActiveRunIndex(asyncDir);
  const status = readStatus(asyncDir);
  if (status && status.state === state) {
    try {
      updateTerminalRunIndex(asyncDir, status);
    } catch (error) {
      if (options.retryCapacityErrors && isStorageCapacityError(error)) throw error;
      console.error(`Failed to write async terminal-run index for '${asyncDir}':`, error);
    }
  }
}
function activeRunMarkerAgeMs(asyncDir, now = Date.now()) {
  try {
    return Math.max(0, now - fs2.statSync(markerPath2(asyncDir)).mtimeMs);
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
}
function readActiveRunIndex(asyncDirRoot) {
  try {
    return fs2.readdirSync(indexDir(asyncDirRoot), { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
}
function readActiveRunToolCallIndex(asyncDirRoot, toolCallId) {
  try {
    return fs2.readdirSync(toolCallIndexDir2(asyncDirRoot, toolCallId), { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw error;
  }
}

// src/runs/background/process-terminal-candidate.ts
import * as fs3 from "node:fs";
import * as path4 from "node:path";
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function validProcessInstance(value, kind) {
  if (!isRecord(value)) return false;
  if (typeof value.processInstanceId !== "string" || value.processInstanceId.length === 0) return false;
  if (kind ? value.kind !== kind : value.kind !== "runner" && value.kind !== "pi-writer") return false;
  if (typeof value.closeObservedAt !== "number" || !Number.isFinite(value.closeObservedAt)) return false;
  if (typeof value.exitCode !== "number" && value.exitCode !== null) return false;
  if (typeof value.signal !== "string" && value.signal !== null) return false;
  if (value.kind === "runner") return value.attempt === void 0;
  if (typeof value.attempt !== "number" || !Number.isInteger(value.attempt) || value.attempt < 0 || !isRecord(value.processTree)) return false;
  if (value.processTree.state === "observed") {
    return value.processTree.mechanism === "posix-process-group" && typeof value.processTree.processGroupId === "number" && Number.isInteger(value.processTree.processGroupId) && value.processTree.processGroupId > 0 && typeof value.processTree.verifiedAt === "number" && Number.isFinite(value.processTree.verifiedAt);
  }
  return value.processTree.state === "unknown" && ["unsupported-platform", "signal-failed", "verification-failed"].includes(String(value.processTree.reason)) && (value.processTree.diagnostic === void 0 || typeof value.processTree.diagnostic === "string");
}
function validInstance(value) {
  return validProcessInstance(value, "pi-writer");
}
function processTerminalCandidatePath(asyncDir) {
  return path4.join(asyncDir, "process-terminal-candidate.json");
}
function readProcessTerminalCandidate(asyncDir) {
  try {
    const raw = JSON.parse(fs3.readFileSync(processTerminalCandidatePath(asyncDir), "utf-8"));
    if (!isRecord(raw) || raw.version !== 1 || typeof raw.runId !== "string" || typeof raw.runnerProcessInstanceId !== "string" || !isRecord(raw.writers)) {
      throw new Error(`Invalid process-terminal candidate in '${asyncDir}'.`);
    }
    const writers = {};
    for (const [index, entries] of Object.entries(raw.writers)) {
      if (!Array.isArray(entries) || !entries.every(validInstance)) throw new Error(`Invalid writer process records for child '${index}'.`);
      writers[index] = entries;
    }
    let expectedWriters;
    if (raw.expectedWriters !== void 0) {
      if (!isRecord(raw.expectedWriters)) throw new Error("Invalid expected writer process records.");
      expectedWriters = {};
      for (const [index, count] of Object.entries(raw.expectedWriters)) {
        if (typeof count !== "number" || !Number.isInteger(count) || count < 0) throw new Error(`Invalid expected writer count for child '${index}'.`);
        expectedWriters[index] = count;
      }
    }
    if (raw.sessionFile !== void 0 && typeof raw.sessionFile !== "string") throw new Error("Invalid process-terminal candidate sessionFile.");
    if (raw.revivalLeaseToken !== void 0 && typeof raw.revivalLeaseToken !== "string") throw new Error("Invalid process-terminal candidate lease token.");
    if (raw.revivalLeaseReleaseAcknowledged !== void 0 && typeof raw.revivalLeaseReleaseAcknowledged !== "boolean") throw new Error("Invalid process-terminal lease release acknowledgement.");
    return {
      version: 1,
      runId: raw.runId,
      runnerProcessInstanceId: raw.runnerProcessInstanceId,
      writers,
      ...expectedWriters ? { expectedWriters } : {},
      ...typeof raw.sessionFile === "string" && raw.sessionFile ? { sessionFile: raw.sessionFile } : {},
      ...typeof raw.revivalLeaseToken === "string" && raw.revivalLeaseToken ? { revivalLeaseToken: raw.revivalLeaseToken } : {},
      ...typeof raw.revivalLeaseReleaseAcknowledged === "boolean" ? { revivalLeaseReleaseAcknowledged: raw.revivalLeaseReleaseAcknowledged } : {}
    };
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
}
function writeProcessTerminalCandidate(asyncDir, candidate) {
  writePrivateAtomicJson(processTerminalCandidatePath(asyncDir), candidate);
}

// src/runs/background/process-terminal.ts
import * as fs5 from "node:fs";
import * as path6 from "node:path";

// src/runs/shared/session-lease.ts
import { createHash as createHash2, randomUUID } from "node:crypto";
import * as fs4 from "node:fs";
import * as path5 from "node:path";
var SESSION_LEASES_DIR = path5.join(TEMP_ROOT_DIR, "session-leases");
function canonicalSessionFilePath(sessionFile) {
  return fs4.realpathSync.native(path5.resolve(sessionFile));
}
function canonicalSessionId(sessionFile) {
  const canonical = canonicalSessionFilePath(sessionFile);
  const key = process.platform === "win32" ? canonical.toLowerCase() : canonical;
  return createHash2("sha256").update(key).digest("hex");
}
function inspectSessionLease(sessionFile, rootDir = SESSION_LEASES_DIR) {
  const canonicalSessionFile = canonicalSessionFilePath(sessionFile);
  const canonicalSessionIdValue = canonicalSessionId(canonicalSessionFile);
  const leaseDir = path5.join(rootDir, canonicalSessionIdValue);
  if (!fs4.existsSync(leaseDir)) return { state: "free", canonicalSessionFile, canonicalSessionId: canonicalSessionIdValue };
  const owner = readLeaseOwner(leaseDir);
  return owner ? { state: "owned", canonicalSessionFile, canonicalSessionId: canonicalSessionIdValue, owner } : { state: "unreadable", canonicalSessionFile, canonicalSessionId: canonicalSessionIdValue };
}
function parseOwner(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const owner = value;
  if (owner.version !== 1 || typeof owner.token !== "string" || typeof owner.canonicalSessionFile !== "string" || typeof owner.runId !== "string" || typeof owner.sourceRunId !== "string" || typeof owner.pid !== "number" || !Number.isInteger(owner.pid) || owner.pid <= 0 || typeof owner.hostname !== "string" || owner.writerState !== "none" && owner.writerState !== "spawning" && owner.writerState !== "running" || typeof owner.acquiredAt !== "string" || typeof owner.acquiredAtMs !== "number" || typeof owner.updatedAtMs !== "number") return void 0;
  if (owner.parentSessionId !== void 0 && typeof owner.parentSessionId !== "string") return void 0;
  if (owner.processStartIdentity !== void 0 && typeof owner.processStartIdentity !== "string") return void 0;
  if (owner.writerPid !== void 0 && (typeof owner.writerPid !== "number" || !Number.isInteger(owner.writerPid) || owner.writerPid <= 0)) return void 0;
  if (owner.writerProcessStartIdentity !== void 0 && typeof owner.writerProcessStartIdentity !== "string") return void 0;
  if (owner.writerState === "running" && owner.writerPid === void 0) return void 0;
  if (owner.writerState !== "running" && (owner.writerPid !== void 0 || owner.writerProcessStartIdentity !== void 0)) return void 0;
  return owner;
}
function readLeaseOwner(leaseDir) {
  try {
    return parseOwner(JSON.parse(fs4.readFileSync(path5.join(leaseDir, "owner.json"), "utf-8")));
  } catch {
    return void 0;
  }
}

// src/runs/background/process-terminal.ts
function processTerminalPath(asyncDir) {
  return path6.join(asyncDir, "process-terminal.json");
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function initializeProcessTerminal(asyncDir, runId, runnerProcessInstanceId) {
  writeProcessTerminalCandidate(asyncDir, {
    version: 1,
    runId,
    runnerProcessInstanceId,
    writers: {}
  });
  writeAtomicJson(processTerminalPath(asyncDir), {
    version: 1,
    state: "pending",
    runId,
    runnerProcessInstanceId
  });
}
function unknownProof(runId, runnerProcessInstanceId, reason, diagnostic) {
  return { version: 1, state: "unknown", runId, runnerProcessInstanceId, reason, ...diagnostic ? { diagnostic } : {} };
}
function resumeDisposition(state, sessionFile) {
  if (state === "stopped") return "non-resumable";
  if (state !== "complete" && state !== "completed" && state !== "failed" && state !== "paused") return "unavailable";
  return sessionFile && fs5.existsSync(sessionFile) ? "resumable" : "unavailable";
}
function sessionProjection(candidate, lease) {
  if (!candidate.sessionFile || lease.state !== "free") return void 0;
  if (candidate.revivalLeaseToken && candidate.revivalLeaseReleaseAcknowledged !== true) return void 0;
  return {
    canonicalSessionId: canonicalSessionId(candidate.sessionFile),
    leaseDisposition: candidate.revivalLeaseToken ? "released" : "not-held",
    freeAtObservation: true,
    ...candidate.revivalLeaseToken ? { canonicalSessionLeaseReleased: true } : {}
  };
}
function validateProof(raw, asyncDir, fallback) {
  if (!isRecord(raw) || raw.version !== 1 || !["pending", "observed", "unknown", "not-started"].includes(String(raw.state)) || typeof raw.runId !== "string" || !raw.runId || typeof raw.runnerProcessInstanceId !== "string" || !raw.runnerProcessInstanceId) {
    throw new Error(`Invalid process-terminal proof in '${asyncDir}'.`);
  }
  if (fallback?.runId && raw.runId !== fallback.runId) throw new Error(`Process-terminal proof in '${asyncDir}' belongs to run '${raw.runId}', expected '${fallback.runId}'.`);
  if (fallback?.runnerProcessInstanceId && raw.runnerProcessInstanceId !== fallback.runnerProcessInstanceId) throw new Error(`Process-terminal proof in '${asyncDir}' belongs to runner '${raw.runnerProcessInstanceId}', expected '${fallback.runnerProcessInstanceId}'.`);
  if (raw.instances !== void 0 && (!Array.isArray(raw.instances) || !raw.instances.every((entry) => validProcessInstance(entry)))) {
    throw new Error(`Invalid process-terminal instances in '${asyncDir}'.`);
  }
  if (raw.state === "observed") {
    if (typeof raw.observedAt !== "number" || !Number.isFinite(raw.observedAt)) throw new Error(`Observed process-terminal proof in '${asyncDir}' is missing observedAt.`);
    if (!Array.isArray(raw.instances)) throw new Error(`Observed process-terminal proof in '${asyncDir}' is missing instances.`);
    const runner = raw.instances.find((entry) => isRecord(entry) && entry.kind === "runner");
    if (!validProcessInstance(runner, "runner") || runner.processInstanceId !== raw.runnerProcessInstanceId) throw new Error(`Observed process-terminal proof in '${asyncDir}' has no matching runner instance.`);
  }
  if (raw.resumeDisposition !== void 0 && !["resumable", "non-resumable", "unavailable"].includes(String(raw.resumeDisposition))) throw new Error(`Invalid process-terminal resume disposition in '${asyncDir}'.`);
  return true;
}
function sanitizeProcessTerminal(value, fallback, label = "status") {
  if (value === void 0) return void 0;
  try {
    validateProof(value, label, fallback);
    return value;
  } catch (error) {
    return unknownProof(fallback.runId ?? label, fallback.runnerProcessInstanceId ?? "unknown", "proof-write-failed", errorMessage(error));
  }
}
function readProcessTerminal(asyncDir, fallback) {
  try {
    const raw = JSON.parse(fs5.readFileSync(processTerminalPath(asyncDir), "utf-8"));
    validateProof(raw, asyncDir, fallback);
    return raw;
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    return unknownProof(fallback?.runId ?? path6.basename(asyncDir), fallback?.runnerProcessInstanceId ?? "unknown", "proof-write-failed", errorMessage(error));
  }
}
function stepProcessTerminalProof(proof, childIndex, state, records, resumeDispositionValue) {
  const base = {
    version: 1,
    runId: proof.runId,
    childIndex,
    runnerProcessInstanceId: proof.runnerProcessInstanceId,
    ...resumeDispositionValue ? { resumeDisposition: resumeDispositionValue } : {}
  };
  if (state === "observed") {
    return { ...base, state, observedAt: proof.state === "observed" ? proof.observedAt : Date.now(), instances: records };
  }
  if (state === "unknown") {
    return { ...base, state, reason: proof.state === "unknown" ? proof.reason : "writer-close-unverified" };
  }
  return { ...base, state };
}
function overlayStatus(asyncDir, proof, candidate) {
  const statusPath = path6.join(asyncDir, "status.json");
  try {
    const status = JSON.parse(fs5.readFileSync(statusPath, "utf-8"));
    status.processTerminal = proof;
    if (status.steps) {
      for (const [index, step] of status.steps.entries()) {
        const records = candidate?.writers[String(index)] ?? [];
        const expected = candidate?.expectedWriters?.[String(index)] ?? (records.length > 0 ? records.length : 0);
        const stepState = expected === 0 ? "not-started" : proof.state === "observed" && records.length === expected ? "observed" : proof.state === "pending" ? "pending" : "unknown";
        step.processTerminal = stepProcessTerminalProof(proof, index, stepState, records, resumeDisposition(step.status, step.sessionFile ?? candidate?.sessionFile));
      }
    }
    writeAtomicJson(statusPath, status);
  } catch {
  }
}
function finalizeProcessTerminal(asyncDir, runId, runnerClose) {
  const existing = readProcessTerminal(asyncDir, { runId, runnerProcessInstanceId: runnerClose.processInstanceId });
  if (existing && fs5.existsSync(processTerminalPath(asyncDir))) {
    if (existing.state === "observed" && existing.runId === runId && existing.runnerProcessInstanceId === runnerClose.processInstanceId) return existing;
    if (existing.state === "unknown") {
      if (existing.instances?.length || existing.reason === "proof-write-failed") return existing;
      const withExit = { ...existing, instances: [{ kind: "runner", ...runnerClose }] };
      try {
        writeAtomicJson(processTerminalPath(asyncDir), withExit);
        return withExit;
      } catch {
        return existing;
      }
    }
  }
  let proof;
  let candidateForOverlay;
  try {
    const candidate = readProcessTerminalCandidate(asyncDir);
    candidateForOverlay = candidate;
    if (!candidate) proof = unknownProof(runId, runnerClose.processInstanceId, "runner-candidate-missing");
    else if (candidate.runId !== runId || candidate.runnerProcessInstanceId !== runnerClose.processInstanceId) proof = unknownProof(runId, runnerClose.processInstanceId, "runner-instance-mismatch");
    else {
      const allWriters = Object.values(candidate.writers).flat();
      const status = (() => {
        try {
          return JSON.parse(fs5.readFileSync(path6.join(asyncDir, "status.json"), "utf-8"));
        } catch {
          return void 0;
        }
      })();
      const session = candidate.sessionFile ? inspectSessionLease(candidate.sessionFile) : void 0;
      const writerEntries = Object.entries(candidate.writers);
      const expectedWriters = candidate.expectedWriters ?? Object.fromEntries(writerEntries.map(([index, records]) => [index, records.length]));
      const expectedEntries = Object.entries(expectedWriters);
      const expectedIndexes = new Set(expectedEntries.map(([index]) => index));
      const writerIndexes = new Set(writerEntries.map(([index]) => index));
      const inconsistentWriters = writerEntries.some(([index, records]) => !expectedIndexes.has(index) || records.length !== expectedWriters[index]) || expectedEntries.some(([index, expected]) => !writerIndexes.has(index) && expected !== 0);
      if (session && session.state !== "free") {
        proof = unknownProof(runId, runnerClose.processInstanceId, session.state === "owned" ? "canonical-session-lease-active" : "canonical-session-unavailable");
      } else if (candidate.revivalLeaseToken && candidate.revivalLeaseReleaseAcknowledged !== true) {
        proof = unknownProof(runId, runnerClose.processInstanceId, "canonical-session-release-unverified");
      } else if (inconsistentWriters || allWriters.length === 0 && expectedEntries.length === 0) {
        proof = unknownProof(runId, runnerClose.processInstanceId, "writer-close-unverified");
      } else if (allWriters.some((writer) => writer.kind === "pi-writer" && writer.processTree.state !== "observed")) {
        proof = unknownProof(runId, runnerClose.processInstanceId, "process-tree-unverified");
      } else {
        const runner = { kind: "runner", ...runnerClose };
        const canonicalSession = session && sessionProjection(candidate, session);
        proof = {
          version: 1,
          state: "observed",
          runId,
          runnerProcessInstanceId: runnerClose.processInstanceId,
          observedAt: runnerClose.closeObservedAt,
          instances: [runner, ...allWriters],
          resumeDisposition: resumeDisposition(status?.state, candidate.sessionFile ?? status?.sessionFile),
          ...canonicalSession ? { canonicalSession } : {}
        };
      }
    }
  } catch (error) {
    proof = unknownProof(runId, runnerClose.processInstanceId, "proof-write-failed", errorMessage(error));
  }
  if (proof.state === "unknown") proof = { ...proof, instances: [{ kind: "runner", ...runnerClose }] };
  let durable = false;
  try {
    writeAtomicJson(processTerminalPath(asyncDir), proof);
    durable = true;
    if (proof.state === "observed") releaseActiveRunIndex(asyncDir);
    overlayStatus(asyncDir, proof, candidateForOverlay);
    fs5.appendFileSync(path6.join(asyncDir, "events.jsonl"), `${JSON.stringify({ type: "subagent.run.process_terminal", lifecycleArtifactVersion: SUBAGENT_LIFECYCLE_ARTIFACT_VERSION, ts: Date.now(), runId, processTerminal: proof })}
`, "utf-8");
  } catch {
  }
  return durable ? proof : unknownProof(runId, runnerClose.processInstanceId, "proof-write-failed", "Failed to persist process-terminal proof.");
}

// src/runs/shared/nested-events.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import * as fs6 from "node:fs";
import * as path7 from "node:path";
var NESTED_EVENTS_DIR = path7.join(TEMP_ROOT_DIR, "nested-subagent-events");
var ROUTE_FILE = "route.json";
var REGISTRY_FILE = "registry.json";
var ROUTE_INDEX_DIR = ".route-index";
var MAX_EVENT_BYTES = 64 * 1024;
var MAX_STEPS = 12;
var MAX_CHILDREN = 16;
var MAX_DEPTH = 3;
function isSafeNestedId(value) {
  return isSafeNestedPathId(value);
}
function assertSafeNestedId(label, value) {
  if (!isSafeNestedId(value)) throw new Error(`${label} must be a non-empty safe id token.`);
}
function assertSafeId(label, value) {
  assertSafeNestedId(label, value);
}
function containedPath(base, candidate) {
  const resolvedBase = path7.resolve(base);
  const resolvedCandidate = path7.resolve(candidate);
  return resolvedCandidate === resolvedBase || resolvedCandidate.startsWith(`${resolvedBase}${path7.sep}`);
}
function commonRouteRoot(route) {
  return path7.dirname(path7.resolve(route.eventSink));
}
function routeIndexRoot() {
  return path7.join(NESTED_EVENTS_DIR, ROUTE_INDEX_DIR, "roots");
}
function routeIndexDir(rootRunId) {
  return path7.join(routeIndexRoot(), encodeURIComponent(rootRunId));
}
function routeIndexPath(rootRunId, capabilityToken) {
  return path7.join(routeIndexDir(rootRunId), `${encodeURIComponent(capabilityToken)}.json`);
}
function validateRouteShape(route) {
  assertSafeId("rootRunId", route.rootRunId);
  assertSafeId("capabilityToken", route.capabilityToken);
  if (!containedPath(NESTED_EVENTS_DIR, route.eventSink)) throw new Error("Nested event sink is outside the subagent nested event root.");
  if (!containedPath(NESTED_EVENTS_DIR, route.controlInbox)) throw new Error("Nested control inbox is outside the subagent nested event root.");
  if (commonRouteRoot(route) !== path7.dirname(path7.resolve(route.controlInbox))) throw new Error("Nested event sink and control inbox must share one route root.");
}
function createNestedRoute(rootRunId) {
  assertSafeId("rootRunId", rootRunId);
  const capabilityToken = randomUUID2();
  const routeRoot = path7.join(NESTED_EVENTS_DIR, `${rootRunId}-${capabilityToken}`);
  const eventSink = path7.join(routeRoot, "events");
  const controlInbox = path7.join(routeRoot, "controls");
  fs6.mkdirSync(eventSink, { recursive: true, mode: 448 });
  fs6.mkdirSync(controlInbox, { recursive: true, mode: 448 });
  const createdAt = Date.now();
  fs6.mkdirSync(routeIndexDir(rootRunId), { recursive: true, mode: 448 });
  writeAtomicJson(routeIndexPath(rootRunId, capabilityToken), { rootRunId, capabilityToken, routeRoot: path7.basename(routeRoot), createdAt });
  writeAtomicJson(path7.join(routeRoot, ROUTE_FILE), { rootRunId, capabilityToken, createdAt });
  return { rootRunId, eventSink, controlInbox, capabilityToken };
}
function resolveNestedRoute(route) {
  const { rootRunId, capabilityToken } = route;
  validateRouteShape(route);
  const routeFile = path7.join(commonRouteRoot(route), ROUTE_FILE);
  const metadata = JSON.parse(fs6.readFileSync(routeFile, "utf-8"));
  if (metadata.rootRunId !== rootRunId || metadata.capabilityToken !== capabilityToken) {
    throw new Error("Nested event route metadata does not match the provided root id and capability token.");
  }
  return route;
}
function resolveInheritedNestedRoute(route) {
  try {
    return resolveNestedRoute(route);
  } catch (error) {
    console.error("Ignoring invalid nested subagent event route:", error);
    return void 0;
  }
}
function inheritedNestedRouteOf(runtime2) {
  return runtime2?.nestedRoute ? resolveInheritedNestedRoute(runtime2.nestedRoute) : void 0;
}
function inheritedNestedParentAddressOf(runtime2) {
  const parent = runtime2?.nestedParent;
  if (!parent || !isSafeNestedId(parent.parentRunId)) return void 0;
  const depth = Math.min(Math.max(1, clampNumber(parent.depth) ?? 1), MAX_DEPTH);
  return {
    parentRunId: parent.parentRunId,
    ...parent.parentChildIndex !== void 0 ? { parentStepIndex: parent.parentChildIndex } : {},
    depth,
    path: parent.path.length ? parent.path : [{ runId: parent.parentRunId, ...parent.parentChildIndex !== void 0 ? { stepIndex: parent.parentChildIndex } : {} }]
  };
}
function nestedRunNotActiveMessage(runId) {
  return `Nested run ${runId} is not active in this fanout child.`;
}
function resolveNestedAsyncDir(rootRunId, run) {
  if (!run.asyncDir) return void 0;
  const resolved2 = path7.resolve(run.asyncDir);
  const nestedRoot = path7.resolve(TEMP_ROOT_DIR, "nested-subagent-runs", rootRunId, run.id);
  const relative4 = path7.relative(nestedRoot, resolved2);
  return resolved2 === nestedRoot || !relative4.startsWith("..") && !path7.isAbsolute(relative4) ? resolved2 : void 0;
}
function clampNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function stringValue(value, max = 512) {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : void 0;
}
function sanitizeTokenUsage(value) {
  if (!value || typeof value !== "object") return void 0;
  const raw = value;
  const input = clampNumber(raw.input);
  const output = clampNumber(raw.output);
  const total = clampNumber(raw.total);
  const window = clampNumber(raw.window);
  const windowPeak = clampNumber(raw.windowPeak);
  return input !== void 0 && output !== void 0 && total !== void 0 ? { input, output, total, ...window !== void 0 ? { window } : {}, ...windowPeak !== void 0 ? { windowPeak } : {} } : void 0;
}
function sanitizeCost(value) {
  if (!value || typeof value !== "object") return void 0;
  const raw = value;
  const inputTokens = clampNumber(raw.inputTokens);
  const outputTokens = clampNumber(raw.outputTokens);
  const costUsd = clampNumber(raw.costUsd);
  return inputTokens !== void 0 && outputTokens !== void 0 && costUsd !== void 0 ? { inputTokens, outputTokens, costUsd } : void 0;
}
function sanitizeLaunchResolvedExtensions(value) {
  if (!value || typeof value !== "object") return void 0;
  const raw = value;
  if (raw.version !== 1 || raw.source !== "launch-resolved" || typeof raw.disableAmbientExtensions !== "boolean") return void 0;
  const stringList = (input) => Array.isArray(input) ? input.filter((item) => typeof item === "string" && /^sha256:[a-f0-9]{16}$/.test(item)).slice(0, 32) : [];
  const omitted = raw.omitted && typeof raw.omitted === "object" ? raw.omitted : {};
  const omittedCount = (key) => Math.max(0, Math.floor(clampNumber(omitted[key]) ?? 0));
  return {
    version: 1,
    source: "launch-resolved",
    disableAmbientExtensions: raw.disableAmbientExtensions,
    runtime: stringList(raw.runtime),
    configured: stringList(raw.configured),
    required: Array.isArray(raw.required) ? raw.required.filter((item) => typeof item === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(item)).slice(0, 32) : [],
    effective: stringList(raw.effective),
    omitted: {
      runtime: omittedCount("runtime"),
      configured: omittedCount("configured"),
      required: omittedCount("required"),
      effective: omittedCount("effective")
    }
  };
}
function sanitizeRuntimeAcknowledgedExtensions(value) {
  if (!value || typeof value !== "object") return void 0;
  const raw = value;
  if (raw.version !== 1 || raw.source !== "child-runtime" || !Array.isArray(raw.ids)) return void 0;
  const ids = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of raw.ids) {
    if (typeof item !== "string" || item.length === 0 || item.length > 128 || !/^[A-Za-z0-9._:@+-]+$/.test(item) || item.includes("..") || item.includes("/") || item.includes("\\") || seen.has(item)) continue;
    seen.add(item);
    ids.push(item);
  }
  if (ids.length === 0) return void 0;
  return {
    version: 1,
    source: "child-runtime",
    ids: ids.slice(0, 32),
    omitted: Math.max(0, ids.length - 32) + Math.max(0, Math.floor(clampNumber(raw.omitted) ?? 0))
  };
}
function runtimeAcknowledgedEntry(value) {
  const sanitized = sanitizeRuntimeAcknowledgedExtensions(value);
  return sanitized ? { runtimeAcknowledgedExtensions: sanitized } : {};
}
function sanitizeTurnBudget(value) {
  if (!value || typeof value !== "object") return void 0;
  const raw = value;
  const maxTurns = clampNumber(raw.maxTurns);
  const graceTurns = clampNumber(raw.graceTurns);
  const turnCount = clampNumber(raw.turnCount);
  const outcome = raw.outcome === "within-budget" || raw.outcome === "wrap-up-requested" || raw.outcome === "termination-deferred" || raw.outcome === "exceeded" ? raw.outcome : void 0;
  if (maxTurns === void 0 || graceTurns === void 0 || turnCount === void 0 || !outcome) return void 0;
  return {
    maxTurns,
    graceTurns,
    turnCount,
    outcome,
    ...clampNumber(raw.wrapUpRequestedAtTurn) !== void 0 ? { wrapUpRequestedAtTurn: clampNumber(raw.wrapUpRequestedAtTurn) } : {},
    ...clampNumber(raw.terminationDeferredAtTurn) !== void 0 ? { terminationDeferredAtTurn: clampNumber(raw.terminationDeferredAtTurn) } : {},
    ...clampNumber(raw.exceededAtTurn) !== void 0 ? { exceededAtTurn: clampNumber(raw.exceededAtTurn) } : {}
  };
}
function sanitizeState(value, fallback) {
  return value === "queued" || value === "running" || value === "complete" || value === "failed" || value === "partial" || value === "paused" || value === "stopped" || value === "rejected" ? value : fallback;
}
function sanitizeStep(input, depth) {
  if (!input || typeof input !== "object") return void 0;
  const raw = input;
  const agent = stringValue(raw.agent, 128);
  if (!agent) return void 0;
  const status = raw.status === "pending" || raw.status === "running" || raw.status === "complete" || raw.status === "completed" || raw.status === "failed" || raw.status === "partial" || raw.status === "paused" || raw.status === "stopped" || raw.status === "rejected" ? raw.status : "pending";
  const model = stringValue(raw.model);
  const thinking = THINKING_LEVELS.find((level) => level === raw.thinking);
  return {
    agent,
    status,
    ...model ? { model } : {},
    ...thinking ? { thinking } : {},
    ...stringValue(raw.sessionName, 256) ? { sessionName: stringValue(raw.sessionName, 256) } : {},
    ...stringValue(raw.sessionFile, 2048) ? { sessionFile: stringValue(raw.sessionFile, 2048) } : {},
    ...raw.activityState === "active_long_running" || raw.activityState === "needs_attention" ? { activityState: raw.activityState } : {},
    ...clampNumber(raw.lastActivityAt) !== void 0 ? { lastActivityAt: clampNumber(raw.lastActivityAt) } : {},
    ...stringValue(raw.currentTool, 128) ? { currentTool: stringValue(raw.currentTool, 128) } : {},
    ...clampNumber(raw.currentToolStartedAt) !== void 0 ? { currentToolStartedAt: clampNumber(raw.currentToolStartedAt) } : {},
    ...stringValue(raw.currentPath, 2048) ? { currentPath: stringValue(raw.currentPath, 2048) } : {},
    ...clampNumber(raw.turnCount) !== void 0 ? { turnCount: clampNumber(raw.turnCount) } : {},
    ...clampNumber(raw.toolCount) !== void 0 ? { toolCount: clampNumber(raw.toolCount) } : {},
    ...clampNumber(raw.startedAt) !== void 0 ? { startedAt: clampNumber(raw.startedAt) } : {},
    ...clampNumber(raw.endedAt) !== void 0 ? { endedAt: clampNumber(raw.endedAt) } : {},
    ...stringValue(raw.error, 1024) ? { error: stringValue(raw.error, 1024) } : {},
    ...raw.timedOut === true ? { timedOut: true } : {},
    ...raw.stopped === true ? { stopped: true } : {},
    ...sanitizeTurnBudget(raw.turnBudget) ? { turnBudget: sanitizeTurnBudget(raw.turnBudget) } : {},
    ...raw.turnBudgetExceeded === true ? { turnBudgetExceeded: true } : {},
    ...raw.wrapUpRequested === true ? { wrapUpRequested: true } : {},
    ...sanitizeLaunchResolvedExtensions(raw.launchResolvedExtensions) ? { launchResolvedExtensions: sanitizeLaunchResolvedExtensions(raw.launchResolvedExtensions) } : {},
    ...sanitizeRuntimeAcknowledgedExtensions(raw.runtimeAcknowledgedExtensions) ? { runtimeAcknowledgedExtensions: sanitizeRuntimeAcknowledgedExtensions(raw.runtimeAcknowledgedExtensions) } : {},
    ...depth < MAX_DEPTH && Array.isArray(raw.children) ? { children: raw.children.map((child) => sanitizeSummary(child, depth + 1)).filter((child) => Boolean(child)).slice(0, MAX_CHILDREN) } : {}
  };
}
function sanitizeSummary(input, depth = 0) {
  if (!input || typeof input !== "object") return void 0;
  const raw = input;
  if (!isSafeNestedId(raw.id) || !isSafeNestedId(raw.parentRunId)) return void 0;
  const pathParts = sanitizeNestedPath(raw.path);
  const steps = Array.isArray(raw.steps) ? raw.steps.map((step) => sanitizeStep(step, depth + 1)).filter((step) => Boolean(step)).slice(0, MAX_STEPS) : void 0;
  const totalTokens = sanitizeTokenUsage(raw.totalTokens);
  const totalCost = sanitizeCost(raw.totalCost);
  return {
    id: raw.id,
    parentRunId: raw.parentRunId,
    ...clampNumber(raw.parentStepIndex) !== void 0 ? { parentStepIndex: clampNumber(raw.parentStepIndex) } : {},
    ...stringValue(raw.parentAgent, 128) ? { parentAgent: stringValue(raw.parentAgent, 128) } : {},
    depth: Math.min(Math.max(0, clampNumber(raw.depth) ?? 0), MAX_DEPTH),
    path: pathParts,
    state: sanitizeState(raw.state, "running"),
    ...stringValue(raw.sessionName, 256) ? { sessionName: stringValue(raw.sessionName, 256) } : {},
    ...stringValue(raw.model) ? { model: stringValue(raw.model) } : {},
    ...THINKING_LEVELS.find((level) => level === raw.thinking) ? { thinking: THINKING_LEVELS.find((level) => level === raw.thinking) } : {},
    ...stringValue(raw.asyncDir, 2048) ? { asyncDir: stringValue(raw.asyncDir, 2048) } : {},
    ...clampNumber(raw.pid) !== void 0 && clampNumber(raw.pid) > 0 && Number.isInteger(clampNumber(raw.pid)) ? { pid: clampNumber(raw.pid) } : {},
    ...stringValue(raw.sessionId, 256) ? { sessionId: stringValue(raw.sessionId, 256) } : {},
    ...stringValue(raw.sessionFile, 2048) ? { sessionFile: stringValue(raw.sessionFile, 2048) } : {},
    ...isSafeNestedId(raw.revivedFrom) ? { revivedFrom: raw.revivedFrom } : {},
    ...stringValue(raw.intercomTarget, 256) ? { intercomTarget: stringValue(raw.intercomTarget, 256) } : {},
    ...stringValue(raw.ownerIntercomTarget, 256) ? { ownerIntercomTarget: stringValue(raw.ownerIntercomTarget, 256) } : {},
    ...stringValue(raw.leafIntercomTarget, 256) ? { leafIntercomTarget: stringValue(raw.leafIntercomTarget, 256) } : {},
    ...raw.ownerState === "live" || raw.ownerState === "gone" || raw.ownerState === "unknown" ? { ownerState: raw.ownerState } : {},
    ...stringValue(raw.controlInbox, 2048) ? { controlInbox: stringValue(raw.controlInbox, 2048) } : {},
    ...stringValue(raw.capabilityToken, 128) ? { capabilityToken: stringValue(raw.capabilityToken, 128) } : {},
    ...raw.mode === "single" || raw.mode === "parallel" || raw.mode === "chain" ? { mode: raw.mode } : {},
    ...stringValue(raw.agent, 128) ? { agent: stringValue(raw.agent, 128) } : {},
    ...Array.isArray(raw.agents) ? { agents: raw.agents.map((agent) => stringValue(agent, 128)).filter((agent) => Boolean(agent)).slice(0, MAX_STEPS) } : {},
    ...clampNumber(raw.currentStep) !== void 0 ? { currentStep: clampNumber(raw.currentStep) } : {},
    ...clampNumber(raw.chainStepCount) !== void 0 ? { chainStepCount: clampNumber(raw.chainStepCount) } : {},
    ...raw.activityState === "active_long_running" || raw.activityState === "needs_attention" ? { activityState: raw.activityState } : {},
    ...clampNumber(raw.lastActivityAt) !== void 0 ? { lastActivityAt: clampNumber(raw.lastActivityAt) } : {},
    ...stringValue(raw.currentTool, 128) ? { currentTool: stringValue(raw.currentTool, 128) } : {},
    ...clampNumber(raw.currentToolStartedAt) !== void 0 ? { currentToolStartedAt: clampNumber(raw.currentToolStartedAt) } : {},
    ...stringValue(raw.currentPath, 2048) ? { currentPath: stringValue(raw.currentPath, 2048) } : {},
    ...clampNumber(raw.turnCount) !== void 0 ? { turnCount: clampNumber(raw.turnCount) } : {},
    ...clampNumber(raw.toolCount) !== void 0 ? { toolCount: clampNumber(raw.toolCount) } : {},
    ...totalTokens ? { totalTokens } : {},
    ...totalCost ? { totalCost } : {},
    ...clampNumber(raw.startedAt) !== void 0 ? { startedAt: clampNumber(raw.startedAt) } : {},
    ...clampNumber(raw.endedAt) !== void 0 ? { endedAt: clampNumber(raw.endedAt) } : {},
    ...clampNumber(raw.lastUpdate) !== void 0 ? { lastUpdate: clampNumber(raw.lastUpdate) } : {},
    ...clampNumber(raw.timeoutMs) !== void 0 ? { timeoutMs: clampNumber(raw.timeoutMs) } : {},
    ...clampNumber(raw.deadlineAt) !== void 0 ? { deadlineAt: clampNumber(raw.deadlineAt) } : {},
    ...raw.timedOut === true ? { timedOut: true } : {},
    ...raw.stopped === true ? { stopped: true } : {},
    ...sanitizeTurnBudget(raw.turnBudget) ? { turnBudget: sanitizeTurnBudget(raw.turnBudget) } : {},
    ...raw.turnBudgetExceeded === true ? { turnBudgetExceeded: true } : {},
    ...raw.wrapUpRequested === true ? { wrapUpRequested: true } : {},
    ...stringValue(raw.error, 1024) ? { error: stringValue(raw.error, 1024) } : {},
    ...sanitizeLaunchResolvedExtensions(raw.launchResolvedExtensions) ? { launchResolvedExtensions: sanitizeLaunchResolvedExtensions(raw.launchResolvedExtensions) } : {},
    ...sanitizeRuntimeAcknowledgedExtensions(raw.runtimeAcknowledgedExtensions) ? { runtimeAcknowledgedExtensions: sanitizeRuntimeAcknowledgedExtensions(raw.runtimeAcknowledgedExtensions) } : {},
    ...steps && steps.length > 0 ? { steps } : {},
    ...depth < MAX_DEPTH && Array.isArray(raw.children) ? { children: raw.children.map((child) => sanitizeSummary(child, depth + 1)).filter((child) => Boolean(child)).slice(0, MAX_CHILDREN) } : {}
  };
}
function parseRecord(content, route) {
  if (Buffer.byteLength(content, "utf-8") > MAX_EVENT_BYTES) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return void 0;
  }
  if (!parsed || typeof parsed !== "object") return void 0;
  const raw = parsed;
  if (raw.type !== "subagent.nested.started" && raw.type !== "subagent.nested.updated" && raw.type !== "subagent.nested.completed") return void 0;
  if (raw.rootRunId !== route.rootRunId || raw.capabilityToken !== route.capabilityToken) return void 0;
  if (!isSafeNestedId(raw.parentRunId)) return void 0;
  const ts = clampNumber(raw.ts);
  if (ts === void 0) return void 0;
  const child = sanitizeSummary(raw.child);
  if (!child || child.id === route.rootRunId) return void 0;
  const routedChild = {
    ...child,
    controlInbox: route.controlInbox,
    capabilityToken: route.capabilityToken,
    ownerState: child.ownerState ?? "unknown"
  };
  return {
    type: raw.type,
    ts,
    rootRunId: route.rootRunId,
    parentRunId: raw.parentRunId,
    ...clampNumber(raw.parentStepIndex) !== void 0 ? { parentStepIndex: clampNumber(raw.parentStepIndex) } : {},
    capabilityToken: route.capabilityToken,
    child: routedChild
  };
}
function parseNestedEventRecords(content, route) {
  if (!content.includes("\n")) {
    const record = parseRecord(content.trim(), route);
    return record ? [record] : [];
  }
  return content.split("\n").slice(0, content.endsWith("\n") ? void 0 : -1).map((line) => line.trim() ? parseRecord(line, route) : void 0).filter((event) => Boolean(event));
}
function terminal(state) {
  return state === "complete" || state === "failed" || state === "partial" || state === "paused" || state === "rejected" || state === "stopped";
}
function mergeBoundedChildren(existing, incoming) {
  if (incoming === void 0) return existing?.slice(0, MAX_CHILDREN);
  const incomingById = new Map(incoming.map((child) => [child.id, child]));
  const merged = (existing ?? []).map((child) => incomingById.get(child.id) ?? child);
  for (const child of incoming) {
    if (!existing?.some((prior) => prior.id === child.id)) merged.push(child);
  }
  return merged.slice(0, MAX_CHILDREN);
}
function mergeStepSummary(existing, incoming) {
  if (!existing || existing.agent !== incoming.agent) return { ...incoming, ...incoming.children ? { children: incoming.children.slice(0, MAX_CHILDREN) } : {} };
  const metadata = { ...existing };
  delete metadata.status;
  delete metadata.activityState;
  delete metadata.lastActivityAt;
  delete metadata.currentTool;
  delete metadata.currentToolStartedAt;
  delete metadata.currentPath;
  delete metadata.turnCount;
  delete metadata.toolCount;
  delete metadata.children;
  const children = mergeBoundedChildren(existing.children, incoming.children);
  return {
    ...metadata,
    ...incoming,
    ...children ? { children } : {}
  };
}
function mergeSummary(existing, event) {
  const incomingState = event.type === "subagent.nested.completed" && event.child.state === "running" ? "complete" : event.child.state;
  const incoming = { ...event.child, state: incomingState, lastUpdate: event.child.lastUpdate ?? event.ts };
  if (!existing) return incoming;
  const existingUpdate = existing.lastUpdate ?? 0;
  const incomingUpdate = incoming.lastUpdate ?? event.ts;
  if (incomingUpdate < existingUpdate) return existing;
  if (terminal(existing.state) && !terminal(incoming.state)) return existing;
  if (terminal(existing.state) && terminal(incoming.state) && incomingUpdate === existingUpdate) return existing;
  const existingSteps = existing.steps ?? [];
  const incomingSteps = incoming.steps;
  const steps = incomingSteps === void 0 ? existing.steps : Array.from({ length: Math.min(MAX_STEPS, Math.max(existingSteps.length, incomingSteps.length)) }, (_, index) => incomingSteps[index] ? mergeStepSummary(existingSteps[index], incomingSteps[index]) : existingSteps[index]).filter((step) => Boolean(step));
  const children = mergeBoundedChildren(existing.children, incoming.children);
  return {
    ...existing,
    ...incoming,
    ...steps ? { steps } : {},
    ...children ? { children } : {},
    state: incoming.state,
    lastUpdate: Math.max(existingUpdate, incomingUpdate)
  };
}
function attachChild(children, event) {
  let updated = false;
  const walk = (items) => items.map((item) => {
    if (item.id === event.parentRunId) {
      const existingChildren = item.children ?? [];
      const childIndex2 = existingChildren.findIndex((child) => child.id === event.child.id);
      const nextChild2 = mergeSummary(childIndex2 >= 0 ? existingChildren[childIndex2] : void 0, event);
      const nextChildren2 = childIndex2 >= 0 ? existingChildren.map((child, index) => index === childIndex2 ? nextChild2 : child) : [...existingChildren, nextChild2];
      updated = true;
      return { ...item, children: nextChildren2.slice(0, MAX_CHILDREN), lastUpdate: Math.max(item.lastUpdate ?? 0, event.ts) };
    }
    if (!item.children?.length) return item;
    const nextChildren = walk(item.children);
    return nextChildren === item.children ? item : { ...item, children: nextChildren };
  });
  const next = walk(children);
  if (updated) return next;
  const childIndex = next.findIndex((child) => child.id === event.child.id);
  const nextChild = mergeSummary(childIndex >= 0 ? next[childIndex] : void 0, event);
  return childIndex >= 0 ? next.map((child, index) => index === childIndex ? nextChild : child) : [...next, nextChild].slice(0, MAX_CHILDREN);
}
function applyNestedEvent(registry, event) {
  return {
    ...registry,
    updatedAt: Math.max(registry.updatedAt, event.ts),
    children: attachChild(registry.children, event)
  };
}
function registryPath(route) {
  return path7.join(commonRouteRoot(route), REGISTRY_FILE);
}
function routeFromIndexEntry(rootRunId, filePath) {
  try {
    const metadata = JSON.parse(fs6.readFileSync(filePath, "utf-8"));
    if (metadata.rootRunId !== rootRunId || typeof metadata.capabilityToken !== "string" || typeof metadata.routeRoot !== "string") return void 0;
    const routeRoot = path7.join(NESTED_EVENTS_DIR, path7.basename(metadata.routeRoot));
    const route = {
      rootRunId,
      eventSink: path7.join(routeRoot, "events"),
      controlInbox: path7.join(routeRoot, "controls"),
      capabilityToken: metadata.capabilityToken
    };
    validateRouteShape(route);
    if (!fs6.statSync(route.eventSink).isDirectory() || !fs6.statSync(route.controlInbox).isDirectory()) return void 0;
    const routeFilePath = path7.join(routeRoot, ROUTE_FILE);
    try {
      const routeFile = JSON.parse(fs6.readFileSync(routeFilePath, "utf-8"));
      if (routeFile.rootRunId !== rootRunId || routeFile.capabilityToken !== metadata.capabilityToken) return void 0;
    } catch (error) {
      if (error.code !== "ENOENT") return void 0;
      try {
        writeAtomicJson(routeFilePath, { rootRunId, capabilityToken: metadata.capabilityToken, createdAt: typeof metadata.createdAt === "number" ? metadata.createdAt : Date.now() });
      } catch {
      }
    }
    return route;
  } catch {
    return void 0;
  }
}
function findNestedRouteForRootId(rootRunId) {
  assertSafeId("rootRunId", rootRunId);
  let entries;
  try {
    entries = fs6.readdirSync(routeIndexDir(rootRunId));
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
  for (const entry of entries) {
    const route = routeFromIndexEntry(rootRunId, path7.join(routeIndexDir(rootRunId), entry));
    if (route) return route;
  }
  return void 0;
}
function buildNestedRouteIndex() {
  const index = /* @__PURE__ */ new Map();
  for (const route of listNestedRoutes()) {
    if (!index.has(route.rootRunId)) index.set(route.rootRunId, route);
  }
  return index;
}
function projectNestedRegistryForRoot(rootRunId) {
  const route = findNestedRouteForRootId(rootRunId);
  return route ? projectNestedEvents(route) : void 0;
}
function retainNestedLookupRoute(state, route, sessionId) {
  if (!route || !sessionId || sessionId !== state.currentSessionId) return;
  if (state.retainedNestedLookupRoutes?.sessionId !== sessionId) {
    state.retainedNestedLookupRoutes = { sessionId, routes: /* @__PURE__ */ new Map() };
  }
  state.retainedNestedLookupRoutes.routes.set(route.rootRunId, route);
}
function collectNestedRuns(children, output = []) {
  for (const child of children ?? []) {
    output.push(child);
    collectNestedRuns(child.children, output);
    collectNestedRuns(child.steps?.flatMap((step) => step.children ?? []), output);
  }
  return output;
}
function collectScopedNestedRuns(children, scope, output = []) {
  if (!scope) return collectNestedRuns(children, output);
  for (const child of children ?? []) {
    if (child.parentRunId === scope.parentRunId && (scope.parentStepIndex === void 0 || child.parentStepIndex === scope.parentStepIndex)) {
      collectNestedRuns([child], output);
      continue;
    }
    collectScopedNestedRuns(child.children, scope, output);
    collectScopedNestedRuns(child.steps?.flatMap((step) => step.children ?? []), scope, output);
  }
  return output;
}
function listNestedRoutes() {
  let rootEntries;
  try {
    rootEntries = fs6.readdirSync(routeIndexRoot());
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const routes = [];
  for (const rootEntry of rootEntries) {
    let rootRunId;
    try {
      rootRunId = decodeURIComponent(rootEntry);
    } catch {
      continue;
    }
    try {
      for (const entry of fs6.readdirSync(path7.join(routeIndexRoot(), rootEntry))) {
        const route = routeFromIndexEntry(rootRunId, path7.join(routeIndexRoot(), rootEntry, entry));
        if (route) routes.push(route);
      }
    } catch {
      continue;
    }
  }
  return routes;
}
function findNestedRunMatchesById(id, options = {}) {
  assertSafeId("id", id);
  const matches = [];
  for (const route of options.scope?.routes ?? listNestedRoutes()) {
    try {
      const registry = projectNestedEvents(route);
      for (const run of collectScopedNestedRuns(registry.children, options.scope?.descendantOf)) {
        if (options.prefix ? run.id.startsWith(id) : run.id === id) matches.push({ rootRunId: route.rootRunId, route, run });
      }
    } catch {
      continue;
    }
  }
  return matches;
}
function readNestedRegistry(route) {
  validateRouteShape(route);
  try {
    const parsed = JSON.parse(fs6.readFileSync(registryPath(route), "utf-8"));
    return {
      rootRunId: route.rootRunId,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      children: Array.isArray(parsed.children) ? parsed.children.map((child) => sanitizeSummary(child)).filter((child) => Boolean(child)) : [],
      processedEvents: Array.isArray(parsed.processedEvents) ? parsed.processedEvents.filter((item) => typeof item === "string") : []
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { rootRunId: route.rootRunId, updatedAt: 0, children: [], processedEvents: [] };
  }
}
function projectNestedEvents(route) {
  validateRouteShape(route);
  let registry = readNestedRegistry(route);
  const seen = new Set(registry.processedEvents);
  let changed = false;
  let entries = [];
  try {
    entries = fs6.readdirSync(route.eventSink).filter((entry) => entry.endsWith(".json") || entry.endsWith(".jsonl")).sort();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const entry of entries) {
    if (seen.has(entry)) continue;
    const eventPath = path7.join(route.eventSink, entry);
    if (!containedPath(route.eventSink, eventPath)) continue;
    let content;
    try {
      const stat = fs6.statSync(eventPath);
      if (!stat.isFile() || stat.size > MAX_EVENT_BYTES) continue;
      content = fs6.readFileSync(eventPath, "utf-8");
    } catch {
      continue;
    }
    const records = parseNestedEventRecords(content, route);
    if (records.length === 0) continue;
    for (const event of records) {
      registry = applyNestedEvent(registry, event);
      changed = true;
    }
    seen.add(entry);
    changed = true;
  }
  if (changed) {
    const processedEvents = [...seen];
    const retainedEvents = processedEvents.slice(-1e3);
    const evictedEvents = processedEvents.slice(0, -1e3);
    registry = { ...registry, processedEvents: retainedEvents };
    writeAtomicJson(registryPath(route), registry);
    for (const entry of evictedEvents) {
      const eventPath = path7.join(route.eventSink, entry);
      if (!containedPath(route.eventSink, eventPath)) continue;
      try {
        const stat = fs6.statSync(eventPath);
        if (!stat.isFile() || stat.size > MAX_EVENT_BYTES) continue;
        const content = fs6.readFileSync(eventPath, "utf-8");
        const hasStatusRecord = parseNestedEventRecords(content, route).length > 0;
        const hasControlResult = content.split("\n").some((line) => line.trim() && parseControlResult(line.trim(), route));
        if (hasStatusRecord && !hasControlResult) fs6.unlinkSync(eventPath);
      } catch {
      }
    }
  }
  return registry;
}
function writeRouteRecord(dir, ts, payload) {
  const content = `${JSON.stringify(payload)}
`;
  if (Buffer.byteLength(content, "utf-8") > MAX_EVENT_BYTES) throw new Error("Nested route record exceeds the maximum size.");
  fs6.mkdirSync(dir, { recursive: true, mode: 448 });
  const name = `${String(ts).padStart(13, "0")}-${randomUUID2()}.json`;
  const tmp = path7.join(dir, `.${name}.tmp`);
  const finalPath = path7.join(dir, name);
  fs6.writeFileSync(tmp, content, { mode: 384 });
  fs6.renameSync(tmp, finalPath);
  return finalPath;
}
function writeNestedEvent(route, event) {
  validateRouteShape(route);
  const record = {
    ...event,
    rootRunId: route.rootRunId,
    capabilityToken: route.capabilityToken
  };
  const sanitized = parseRecord(JSON.stringify(record), route);
  if (!sanitized) throw new Error("Nested event record failed validation.");
  writeRouteRecord(route.eventSink, sanitized.ts, sanitized);
}
function parseControlRequest(content, route) {
  if (Buffer.byteLength(content, "utf-8") > MAX_EVENT_BYTES) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return void 0;
  }
  if (!parsed || typeof parsed !== "object") return void 0;
  const raw = parsed;
  if (raw.type !== "subagent.nested.control-request") return void 0;
  if (raw.rootRunId !== route.rootRunId || raw.capabilityToken !== route.capabilityToken) return void 0;
  if (!isSafeNestedId(raw.requestId) || !isSafeNestedId(raw.targetRunId)) return void 0;
  if (raw.action !== "interrupt" && raw.action !== "resume") return void 0;
  const ts = clampNumber(raw.ts);
  if (ts === void 0) return void 0;
  return {
    type: "subagent.nested.control-request",
    ts,
    rootRunId: route.rootRunId,
    capabilityToken: route.capabilityToken,
    requestId: raw.requestId,
    targetRunId: raw.targetRunId,
    action: raw.action,
    ...stringValue(raw.message, 16e3) ? { message: stringValue(raw.message, 16e3) } : {}
  };
}
function parseControlResult(content, route) {
  if (Buffer.byteLength(content, "utf-8") > MAX_EVENT_BYTES) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return void 0;
  }
  if (!parsed || typeof parsed !== "object") return void 0;
  const raw = parsed;
  if (raw.type !== "subagent.nested.control-result") return void 0;
  if (raw.rootRunId !== route.rootRunId || raw.capabilityToken !== route.capabilityToken) return void 0;
  if (!isSafeNestedId(raw.requestId) || !isSafeNestedId(raw.targetRunId)) return void 0;
  const ts = clampNumber(raw.ts);
  if (ts === void 0 || typeof raw.ok !== "boolean") return void 0;
  return {
    type: "subagent.nested.control-result",
    ts,
    rootRunId: route.rootRunId,
    capabilityToken: route.capabilityToken,
    requestId: raw.requestId,
    targetRunId: raw.targetRunId,
    ok: raw.ok,
    message: stringValue(raw.message, 16e3) ?? (raw.ok ? "Control request completed." : "Control request failed.")
  };
}
function writeNestedControlRequest(route, request) {
  validateRouteShape(route);
  assertSafeId("requestId", request.requestId);
  assertSafeId("targetRunId", request.targetRunId);
  const record = {
    type: "subagent.nested.control-request",
    ...request,
    rootRunId: route.rootRunId,
    capabilityToken: route.capabilityToken
  };
  const sanitized = parseControlRequest(JSON.stringify(record), route);
  if (!sanitized) throw new Error("Nested control request failed validation.");
  return writeRouteRecord(route.controlInbox, sanitized.ts, sanitized);
}
function readNestedControlRequests(route) {
  validateRouteShape(route);
  let entries = [];
  try {
    entries = fs6.readdirSync(route.controlInbox).filter((entry) => entry.endsWith(".json")).sort();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const requests = [];
  for (const entry of entries) {
    const filePath = path7.join(route.controlInbox, entry);
    if (!containedPath(route.controlInbox, filePath)) continue;
    try {
      const stat = fs6.statSync(filePath);
      if (!stat.isFile() || stat.size > MAX_EVENT_BYTES) continue;
      const request = parseControlRequest(fs6.readFileSync(filePath, "utf-8"), route);
      if (request) requests.push({ ...request, filePath });
    } catch {
      continue;
    }
  }
  return requests;
}
function writeNestedControlResult(route, result) {
  validateRouteShape(route);
  assertSafeId("requestId", result.requestId);
  assertSafeId("targetRunId", result.targetRunId);
  const record = {
    type: "subagent.nested.control-result",
    ...result,
    rootRunId: route.rootRunId,
    capabilityToken: route.capabilityToken
  };
  const sanitized = parseControlResult(JSON.stringify(record), route);
  if (!sanitized) throw new Error("Nested control result failed validation.");
  writeRouteRecord(route.eventSink, sanitized.ts, sanitized);
}
function readControlResultsFromFile(route, eventPath) {
  if (!containedPath(route.eventSink, eventPath)) return [];
  try {
    const stat = fs6.statSync(eventPath);
    if (!stat.isFile() || stat.size > MAX_EVENT_BYTES) return [];
    const content = fs6.readFileSync(eventPath, "utf-8");
    const lines = content.includes("\n") ? content.split("\n").filter((line) => line.trim()) : [content];
    return lines.map((line) => parseControlResult(line, route)).filter((result) => Boolean(result));
  } catch {
    return [];
  }
}
function listNestedEventFiles(route) {
  validateRouteShape(route);
  try {
    return fs6.readdirSync(route.eventSink).filter((entry) => entry.endsWith(".json") || entry.endsWith(".jsonl"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
function snapshotNestedEventFiles(route) {
  return new Set(listNestedEventFiles(route));
}
function findNestedControlResult(route, requestId, targetRunId, ignoredFiles) {
  const entries = listNestedEventFiles(route).filter((entry) => !ignoredFiles.has(entry)).sort().reverse();
  for (const entry of entries) {
    const result = readControlResultsFromFile(route, path7.join(route.eventSink, entry)).find((candidate) => candidate.requestId === requestId && candidate.targetRunId === targetRunId);
    if (result) return result;
  }
  return void 0;
}
function attachRootChildrenToSteps(rootRunId, steps, children) {
  if (!steps?.length) return;
  for (const step of steps) {
    step.children = void 0;
  }
  if (!children?.length) return;
  for (const child of children) {
    if (child.parentRunId !== rootRunId || child.parentStepIndex === void 0) continue;
    const step = steps.find((candidate, index) => (candidate.index ?? index) === child.parentStepIndex);
    if (!step) continue;
    step.children ??= [];
    step.children = [...step.children.filter((existing) => existing.id !== child.id), child].slice(0, MAX_CHILDREN);
  }
}
function updateAsyncJobNestedProjection(job) {
  if (!job.nestedRoute) return;
  const registry = projectNestedEvents(job.nestedRoute);
  job.nestedChildren = registry.children;
  attachRootChildrenToSteps(job.asyncId, job.steps, registry.children);
}
function updateForegroundNestedProjection(control) {
  if (!control.nestedRoute) return;
  const registry = projectNestedEvents(control.nestedRoute);
  control.nestedChildren = registry.children;
}
function hasLiveNestedDescendants(children) {
  if (!children?.length) return false;
  for (const child of children) {
    if (!terminal(child.state)) return true;
    if (hasLiveNestedDescendants(child.children)) return true;
    if (hasLiveNestedDescendants(child.steps?.flatMap((step) => step.children ?? []))) return true;
  }
  return false;
}
function nestedSummaryFromAsyncStatus(status, asyncDir, fallback) {
  return {
    id: status.runId || fallback.id,
    parentRunId: fallback.parentRunId,
    ...fallback.parentStepIndex !== void 0 ? { parentStepIndex: fallback.parentStepIndex } : {},
    depth: fallback.depth,
    path: fallback.path ?? [{ runId: fallback.parentRunId, ...fallback.parentStepIndex !== void 0 ? { stepIndex: fallback.parentStepIndex } : {} }],
    asyncDir,
    ...status.pid ? { pid: status.pid } : {},
    ...status.sessionId ? { sessionId: status.sessionId } : {},
    ...status.revivedFrom ? { revivedFrom: status.revivedFrom } : {},
    mode: status.mode ?? fallback.mode,
    ...status.steps?.length === 1 && status.steps[0]?.model ? { model: status.steps[0].model } : {},
    ...status.steps?.length === 1 && status.steps[0]?.thinking ? { thinking: status.steps[0].thinking } : {},
    ...status.steps?.length === 1 && status.steps[0]?.sessionName ? { sessionName: status.steps[0].sessionName } : {},
    ...status.processTerminal ? { processTerminal: sanitizeProcessTerminal(status.processTerminal, { runId: status.runId || fallback.id, runnerProcessInstanceId: status.processTerminal.runnerProcessInstanceId }, `${asyncDir}/status.json`) } : {},
    ...status.launchResolvedExtensions ? { launchResolvedExtensions: status.launchResolvedExtensions } : {},
    ...runtimeAcknowledgedEntry(status.runtimeAcknowledgedExtensions),
    ...status.capabilityCeiling ? { capabilityCeiling: status.capabilityCeiling } : {},
    ...status.capabilityAudit ? { capabilityAudit: status.capabilityAudit } : {},
    state: status.state,
    ...status.currentStep !== void 0 ? { currentStep: status.currentStep } : {},
    ...status.chainStepCount !== void 0 ? { chainStepCount: status.chainStepCount } : {},
    ...status.activityState ? { activityState: status.activityState } : {},
    ...status.lastActivityAt !== void 0 ? { lastActivityAt: status.lastActivityAt } : {},
    ...status.currentTool ? { currentTool: status.currentTool } : {},
    ...status.currentToolStartedAt !== void 0 ? { currentToolStartedAt: status.currentToolStartedAt } : {},
    ...status.currentPath ? { currentPath: status.currentPath } : {},
    ...status.turnCount !== void 0 ? { turnCount: status.turnCount } : {},
    ...status.toolCount !== void 0 ? { toolCount: status.toolCount } : {},
    ...status.totalTokens ? { totalTokens: status.totalTokens } : {},
    ...status.timeoutMs !== void 0 ? { timeoutMs: status.timeoutMs } : {},
    ...status.deadlineAt !== void 0 ? { deadlineAt: status.deadlineAt } : {},
    ...status.timedOut !== void 0 ? { timedOut: status.timedOut } : {},
    ...status.stopped !== void 0 ? { stopped: status.stopped } : {},
    ...status.turnBudget ? { turnBudget: status.turnBudget } : {},
    ...status.turnBudgetExceeded !== void 0 ? { turnBudgetExceeded: status.turnBudgetExceeded } : {},
    ...status.wrapUpRequested !== void 0 ? { wrapUpRequested: status.wrapUpRequested } : {},
    ...status.error ? { error: status.error } : {},
    ...status.startedAt !== void 0 ? { startedAt: status.startedAt } : { startedAt: fallback.ts },
    ...status.endedAt !== void 0 ? { endedAt: status.endedAt } : {},
    lastUpdate: status.lastUpdate ?? fallback.ts,
    ...status.sessionFile ? { sessionFile: status.sessionFile } : {},
    ...status.steps?.length ? { steps: status.steps.map((step, index) => ({
      agent: step.agent,
      ...step.sessionName ? { sessionName: step.sessionName } : {},
      status: step.status,
      ...step.model ? { model: step.model } : {},
      ...step.thinking ? { thinking: step.thinking } : {},
      ...step.sessionFile ? { sessionFile: step.sessionFile } : {},
      ...step.activityState ? { activityState: step.activityState } : {},
      ...step.lastActivityAt !== void 0 ? { lastActivityAt: step.lastActivityAt } : {},
      ...step.currentTool ? { currentTool: step.currentTool } : {},
      ...step.currentToolStartedAt !== void 0 ? { currentToolStartedAt: step.currentToolStartedAt } : {},
      ...step.currentPath ? { currentPath: step.currentPath } : {},
      ...step.turnCount !== void 0 ? { turnCount: step.turnCount } : {},
      ...step.toolCount !== void 0 ? { toolCount: step.toolCount } : {},
      ...step.startedAt !== void 0 ? { startedAt: step.startedAt } : {},
      ...step.endedAt !== void 0 ? { endedAt: step.endedAt } : {},
      ...step.error ? { error: step.error } : {},
      ...step.launchResolvedExtensions ? { launchResolvedExtensions: step.launchResolvedExtensions } : {},
      ...runtimeAcknowledgedEntry(step.runtimeAcknowledgedExtensions),
      ...step.timedOut !== void 0 ? { timedOut: step.timedOut } : {},
      ...step.stopped !== void 0 ? { stopped: step.stopped } : {},
      ...step.turnBudget ? { turnBudget: step.turnBudget } : {},
      ...step.turnBudgetExceeded !== void 0 ? { turnBudgetExceeded: step.turnBudgetExceeded } : {},
      ...step.wrapUpRequested !== void 0 ? { wrapUpRequested: step.wrapUpRequested } : {},
      ...step.processTerminal ? { processTerminal: sanitizeProcessTerminal(step.processTerminal, { runId: status.runId || fallback.id, runnerProcessInstanceId: step.processTerminal.runnerProcessInstanceId }, `${asyncDir}/status.json step ${index}`) } : {},
      ...step.capabilityCeiling ? { capabilityCeiling: step.capabilityCeiling } : {},
      ...step.capabilityAudit ? { capabilityAudit: step.capabilityAudit } : {}
    })).slice(0, MAX_STEPS) } : {}
  };
}
function nestedRunScope(rootRunId) {
  assertSafeId("rootRunId", rootRunId);
  return {
    asyncDirRoot: path7.join(TEMP_ROOT_DIR, "nested-subagent-runs", rootRunId),
    resultsDir: path7.join(DIRS.results, "nested", rootRunId)
  };
}
function nestedResultsPath(rootRunId, id) {
  assertSafeId("id", id);
  return path7.join(nestedRunScope(rootRunId).resultsDir, `${id}.json`);
}

// src/runs/shared/host-step-status.ts
var HOST_STEP_MAX_ID_CHARS = 128;
var HOST_STEP_MAX_LABEL_CHARS = 80;
var HOST_STEP_MAX_ROLE_CHARS = 32;
var HOST_STEP_MAX_PROVIDER_CHARS = 64;
var HOST_STEP_MAX_REASON_CHARS = 64;
var HOST_STEP_MAX_DETAIL_CHARS = 200;
var HOST_STEP_MAX_TARGET_CHARS = 128;
var HOST_STEP_MAX_REF_CHARS = 128;
var HOST_STEP_MAX_REPORT_PATH_CHARS = 240;
var HOST_STEP_MAX_COUNT = 32;
var HOST_STEP_FIELDS = /* @__PURE__ */ new Set([
  "version",
  "kind",
  "monitorKind",
  "id",
  "label",
  "role",
  "provider",
  "state",
  "verdict",
  "reasonCode",
  "detail",
  "target",
  "freshness",
  "reportPath",
  "exitCode",
  "updatedAt",
  "deadlineAt"
]);
var FRESHNESS_FIELDS = /* @__PURE__ */ new Set(["expectedRef", "observedRef", "stale"]);
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function assertBoundedString(value, field, maxChars, source, required = false) {
  if (value === void 0 && !required) return;
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid host step '${source}': ${field} must be a non-empty string.`);
  if (value.length > maxChars) throw new Error(`Invalid host step '${source}': ${field} exceeds ${maxChars} characters.`);
  if (/\r|\n/.test(value)) throw new Error(`Invalid host step '${source}': ${field} must be single-line.`);
}
function assertTimestamp(value, field, source, required = false) {
  if (value === void 0 && !required) return;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid host step '${source}': ${field} must be a non-negative safe integer.`);
}
function assertFreshness(value, source) {
  if (!isRecord2(value)) throw new Error(`Invalid host step '${source}': freshness must be an object.`);
  const unknownFields = Object.keys(value).filter((field) => !FRESHNESS_FIELDS.has(field));
  if (unknownFields.length > 0) throw new Error(`Invalid host step '${source}': freshness has unsupported fields: ${unknownFields.join(", ")}.`);
  assertBoundedString(value.expectedRef, "freshness.expectedRef", HOST_STEP_MAX_REF_CHARS, source, true);
  assertBoundedString(value.observedRef, "freshness.observedRef", HOST_STEP_MAX_REF_CHARS, source);
  if (value.stale !== void 0 && typeof value.stale !== "boolean") throw new Error(`Invalid host step '${source}': freshness.stale must be a boolean.`);
}
function assertHostStepNode(value, source = "status") {
  if (!isRecord2(value)) throw new Error(`Invalid host step '${source}': expected an object.`);
  const unknownFields = Object.keys(value).filter((field) => !HOST_STEP_FIELDS.has(field));
  if (unknownFields.length > 0) throw new Error(`Invalid host step '${source}': unsupported fields: ${unknownFields.join(", ")}.`);
  if (value.version !== 1) throw new Error(`Invalid host step '${source}': version must be 1.`);
  if (value.kind !== "host-step") throw new Error(`Invalid host step '${source}': kind must be 'host-step'.`);
  if (value.monitorKind !== "command" && value.monitorKind !== "ci" && value.monitorKind !== "gate") throw new Error(`Invalid host step '${source}': monitorKind must be 'command', 'ci', or 'gate'.`);
  assertBoundedString(value.id, "id", HOST_STEP_MAX_ID_CHARS, source, true);
  assertBoundedString(value.label, "label", HOST_STEP_MAX_LABEL_CHARS, source, true);
  assertBoundedString(value.role, "role", HOST_STEP_MAX_ROLE_CHARS, source);
  assertBoundedString(value.provider, "provider", HOST_STEP_MAX_PROVIDER_CHARS, source);
  if (value.state !== "pending" && value.state !== "running" && value.state !== "done" && value.state !== "cancelled" && value.state !== "error") {
    throw new Error(`Invalid host step '${source}': state is invalid.`);
  }
  if (value.verdict !== void 0 && value.verdict !== "pass" && value.verdict !== "fail" && value.verdict !== "inconclusive") {
    throw new Error(`Invalid host step '${source}': verdict is invalid.`);
  }
  if (value.state !== "done" && value.verdict !== void 0) throw new Error(`Invalid host step '${source}': verdict is only valid for done state.`);
  assertBoundedString(value.reasonCode, "reasonCode", HOST_STEP_MAX_REASON_CHARS, source);
  assertBoundedString(value.detail, "detail", HOST_STEP_MAX_DETAIL_CHARS, source);
  assertBoundedString(value.target, "target", HOST_STEP_MAX_TARGET_CHARS, source);
  if (value.freshness !== void 0) assertFreshness(value.freshness, source);
  if (value.freshness && value.freshness.stale === true && (value.state !== "done" || value.verdict !== "inconclusive")) {
    throw new Error(`Invalid host step '${source}': stale freshness requires done/inconclusive state.`);
  }
  assertBoundedString(value.reportPath, "reportPath", HOST_STEP_MAX_REPORT_PATH_CHARS, source);
  const reportName = hostStepReportName(value.reportPath);
  if (value.reportPath !== void 0 && (!reportName || reportName === "." || reportName === "..")) throw new Error(`Invalid host step '${source}': reportPath must name a report.`);
  if (value.exitCode !== void 0 && value.exitCode !== null && (typeof value.exitCode !== "number" || !Number.isSafeInteger(value.exitCode) || value.exitCode < 0)) throw new Error(`Invalid host step '${source}': exitCode must be a non-negative safe integer or null.`);
  if (value.monitorKind !== "command" && value.exitCode !== void 0) throw new Error(`Invalid host step '${source}': exitCode is only valid for command steps.`);
  if ((value.state === "pending" || value.state === "running") && value.exitCode !== void 0) throw new Error(`Invalid host step '${source}': exitCode is only valid after command settlement.`);
  assertTimestamp(value.updatedAt, "updatedAt", source, true);
  assertTimestamp(value.deadlineAt, "deadlineAt", source);
}
function parseHostStepNode(value, source = "status") {
  assertHostStepNode(value, source);
  return {
    ...value,
    ...value.freshness ? { freshness: { ...value.freshness } } : {}
  };
}
function assertUniqueHostStepIds(hostSteps, source = "status") {
  const ids = /* @__PURE__ */ new Set();
  for (const hostStep of hostSteps) {
    if (ids.has(hostStep.id)) throw new Error(`Invalid host step '${source}': duplicate host step id '${hostStep.id}'.`);
    ids.add(hostStep.id);
  }
}
function validHostStepNodes(graph) {
  const nodes = graph?.nodes ?? [];
  const nodeIdCounts = /* @__PURE__ */ new Map();
  for (const node of nodes) nodeIdCounts.set(node.id, (nodeIdCounts.get(node.id) ?? 0) + 1);
  const hostSteps = [];
  for (const [index, node] of nodes.entries()) {
    if (node.kind !== "host-step") continue;
    try {
      const hostStep = parseHostStepNode(node.hostStep, `workflowGraph.nodes[${index}].hostStep`);
      if (node.id !== hostStep.id || node.label !== hostStep.label) continue;
      if (nodeIdCounts.get(hostStep.id) !== 1) continue;
      hostSteps.push(hostStep);
    } catch {
    }
  }
  return hostSteps.slice(0, HOST_STEP_MAX_COUNT);
}
function assertWorkflowGraphHostSteps(graph, source = "status", expectedRunId) {
  if (!graph) return;
  if (expectedRunId !== void 0 && graph.runId !== expectedRunId) throw new Error(`Invalid host step '${source}': workflowGraph.runId does not match the status run id.`);
  if (!Array.isArray(graph.nodes)) throw new Error(`Invalid host step '${source}.workflowGraph': nodes must be an array.`);
  const hostStepCount = graph.nodes.filter((node) => node.kind === "host-step").length;
  if (hostStepCount > HOST_STEP_MAX_COUNT) throw new Error(`Invalid host step '${source}': workflowGraph contains more than ${HOST_STEP_MAX_COUNT} host steps.`);
  const hostSteps = [];
  for (const [index, node] of graph.nodes.entries()) {
    if (node.kind !== "host-step") continue;
    const hostStep = parseHostStepNode(node.hostStep, `${source}.workflowGraph.nodes[${index}].hostStep`);
    if (node.id !== hostStep.id) throw new Error(`Invalid host step '${source}': workflowGraph.nodes[${index}].id does not match hostStep.id.`);
    if (node.label !== hostStep.label) throw new Error(`Invalid host step '${source}': workflowGraph.nodes[${index}].label does not match hostStep.label.`);
    hostSteps.push(hostStep);
  }
  assertUniqueHostStepIds(hostSteps, source);
  for (const hostStep of hostSteps) {
    if (graph.nodes.filter((node) => node.id === hostStep.id).length !== 1) throw new Error(`Invalid host step '${source}': workflowGraph id '${hostStep.id}' is not unique.`);
  }
}
function hostStepWorkflowNode(hostStep) {
  assertHostStepNode(hostStep, hostStep.id);
  return {
    id: hostStep.id,
    kind: "host-step",
    label: hostStep.label,
    status: workflowNodeStatus(hostStep),
    hostStep: { ...hostStep, ...hostStep.freshness ? { freshness: { ...hostStep.freshness } } : {} }
  };
}
function workflowNodeStatus(hostStep) {
  if (hostStep.state === "pending") return "pending";
  if (hostStep.state === "running") return "running";
  if (hostStep.state === "cancelled") return "stopped";
  if (hostStep.state === "error") return "failed";
  if (hostStep.verdict === void 0 || hostStep.verdict === "inconclusive") return "partial";
  return hostStep.verdict === "fail" ? "failed" : "completed";
}
function upsertHostStep(input) {
  const hostStep = parseHostStepNode(input.hostStep, input.hostStep.id);
  assertWorkflowGraphHostSteps(input.status.workflowGraph, "host-step", input.status.runId);
  const graph = input.status.workflowGraph ? {
    ...input.status.workflowGraph,
    nodes: [...input.status.workflowGraph.nodes]
  } : {
    runId: input.status.runId,
    mode: input.status.mode,
    phases: [],
    nodes: []
  };
  const existingIndex = graph.nodes.findIndex((node2) => node2.id === hostStep.id);
  const existing = existingIndex >= 0 ? graph.nodes[existingIndex] : void 0;
  if (existing && existing.kind !== "host-step") throw new Error(`Host step '${hostStep.id}' conflicts with an existing workflow node.`);
  if (existingIndex < 0 && graph.nodes.filter((candidate) => candidate.kind === "host-step").length >= HOST_STEP_MAX_COUNT) {
    throw new Error(`Host step limit of ${HOST_STEP_MAX_COUNT} has been reached.`);
  }
  const node = hostStepWorkflowNode(hostStep);
  if (existingIndex >= 0) graph.nodes[existingIndex] = node;
  else graph.nodes.push(node);
  const nextStatus = {
    ...input.status,
    workflowGraph: graph,
    lastUpdate: Math.max(input.status.lastUpdate ?? 0, hostStep.updatedAt)
  };
  input.persist(nextStatus);
  return nextStatus;
}
function hostStepVerdictLabel(state, verdict) {
  return state === "done" ? verdict ?? "inconclusive" : state;
}
function hostStepReportName(reportPath) {
  if (!reportPath) return void 0;
  return reportPath.split(/[\\/]/).filter(Boolean).at(-1);
}

// src/workflows/host-command.ts
import { spawn } from "node:child_process";
import { randomUUID as randomUUID3 } from "node:crypto";
import * as fs7 from "node:fs";
import * as path8 from "node:path";
var MAX_COMMAND_BYTES = 16 * 1024;
var MAX_OUTPUT_PATH_BYTES = 240;
var MAX_CAPTURE_BYTES = 1024 * 1024;
var MAX_PREVIEW_BYTES = 4 * 1024;
var MAX_TIMEOUT_MS = 24 * 60 * 60 * 1e3;
function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}
function boundedText(value, maxBytes) {
  if (byteLength(value) <= maxBytes) return value;
  let end = Math.max(0, maxBytes - 3);
  while (end > 0 && byteLength(value.slice(0, end)) > maxBytes - 3) end -= 1;
  return `${value.slice(0, end)}...`;
}
function normalizeWorkflowHostCommandParams(value, label = "runs.host params") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const params = value;
  const unknownFields = Object.keys(params).filter((field) => !["kind", "command", "timeoutMs", "output", "role", "provider"].includes(field));
  if (unknownFields.length) {
    const cwdHint = unknownFields.includes("cwd") ? " The host step does not accept per-step cwd; commands and relative output paths use the workflow cwd. Set cwd on the outer subagent request, or put a trusted directory change in command (for example, 'cd /path/to/worktree && npm test')." : "";
    throw new Error(`${label} has unsupported fields: ${unknownFields.join(", ")}.${cwdHint}`);
  }
  if (params.kind !== "command") throw new Error(`${label}.kind must be 'command'.`);
  if (typeof params.command !== "string" || !params.command.trim()) throw new Error(`${label}.command must be a non-empty string.`);
  const command = params.command.trim();
  if (byteLength(command) > MAX_COMMAND_BYTES || /[\u0000]/.test(command)) throw new Error(`${label}.command exceeds the ${MAX_COMMAND_BYTES}-byte limit or contains NUL.`);
  if (typeof params.timeoutMs !== "number" || !Number.isInteger(params.timeoutMs) || params.timeoutMs < 1 || params.timeoutMs > MAX_TIMEOUT_MS) throw new Error(`${label}.timeoutMs must be an integer from 1 to ${MAX_TIMEOUT_MS}.`);
  let output;
  if (params.output !== void 0) {
    if (typeof params.output !== "string" || !params.output.trim()) throw new Error(`${label}.output must be a non-empty relative path.`);
    output = params.output.trim();
    if (path8.isAbsolute(output) || output.split(/[\\/]/).includes("..") || /[\u0000-\u001f\u007f]/.test(output) || byteLength(output) > MAX_OUTPUT_PATH_BYTES) throw new Error(`${label}.output must be a bounded relative path without traversal or control characters.`);
  }
  if (params.role !== void 0 && params.role !== "ci" && params.role !== "gate") throw new Error(`${label}.role must be 'ci' or 'gate'.`);
  let provider;
  if (params.provider !== void 0) {
    if (typeof params.provider !== "string" || !params.provider.trim() || /[\r\n\u0000]/.test(params.provider) || byteLength(params.provider.trim()) > 64) throw new Error(`${label}.provider must be a non-empty single-line string of at most 64 bytes.`);
    provider = params.provider.trim();
  }
  return {
    kind: "command",
    command,
    timeoutMs: params.timeoutMs,
    ...output ? { output } : {},
    ...params.role ? { role: params.role } : {},
    ...provider ? { provider } : {}
  };
}
function appendBounded(current, chunk, limit) {
  if (byteLength(current) >= limit) return current;
  return boundedText(current + chunk.toString("utf8"), limit);
}
function resolveWorkflowHostOutputClaimPath(outputPath) {
  return resolveSingleOutputClaimPath(outputPath);
}
function assertSafeExplicitOutput(cwd, outputPath, key) {
  const root = fs7.realpathSync(cwd);
  const outputParent = path8.dirname(outputPath);
  let existingParent = outputParent;
  while (!fs7.existsSync(existingParent)) existingParent = path8.dirname(existingParent);
  const existingParentReal = fs7.realpathSync(existingParent);
  const existingRelative = path8.relative(root, existingParentReal);
  if (existingRelative === ".." || existingRelative.startsWith(`..${path8.sep}`) || path8.isAbsolute(existingRelative)) throw new Error(`runs.host('${key}') output resolves outside the workflow cwd.`);
  fs7.mkdirSync(outputParent, { recursive: true });
  const parent = fs7.realpathSync(outputParent);
  const relative4 = path8.relative(root, parent);
  if (relative4 === ".." || relative4.startsWith(`..${path8.sep}`) || path8.isAbsolute(relative4)) throw new Error(`runs.host('${key}') output resolves outside the workflow cwd.`);
  try {
    const stat = fs7.lstatSync(outputPath);
    if (!stat.isFile() || stat.nlink > 1) throw new Error(`runs.host('${key}') output must be a regular, non-linked file path.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return parent;
}
function writeExplicitOutput(outputParent, outputPath, capture, key) {
  const destination = path8.join(outputParent, path8.basename(outputPath));
  const temporaryPath = path8.join(outputParent, `.pi-host-output-${process.pid}-${randomUUID3()}.tmp`);
  let descriptor;
  try {
    descriptor = fs7.openSync(temporaryPath, fs7.constants.O_WRONLY | fs7.constants.O_CREAT | fs7.constants.O_EXCL, 384);
    fs7.writeFileSync(descriptor, capture, { encoding: "utf8" });
    fs7.closeSync(descriptor);
    descriptor = void 0;
    fs7.chmodSync(temporaryPath, 384);
    runFileSystemOperationWithRetry(() => fs7.renameSync(temporaryPath, destination), {
      retryDelaysMs: process.platform === "win32" ? DEFAULT_FILE_SYSTEM_RETRY_DELAYS_MS : []
    });
  } catch (error) {
    throw new Error(`runs.host('${key}') could not atomically replace its output.`, { cause: error instanceof Error ? error : void 0 });
  } finally {
    if (descriptor !== void 0) fs7.closeSync(descriptor);
    try {
      fs7.unlinkSync(temporaryPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
function terminateProcessTree(pid, controller) {
  if (process.platform !== "win32") return controller.terminate();
  return new Promise((resolve6) => {
    const cleanup = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    cleanup.once("error", () => {
      void controller.terminate().then(resolve6);
    });
    cleanup.once("close", () => {
      void controller.terminate().then(resolve6);
    });
  });
}
async function executeWorkflowHostCommand(input) {
  const outputPath = input.params.output ? path8.resolve(input.cwd, input.params.output) : input.defaultOutputPath;
  const relative4 = path8.relative(input.cwd, outputPath);
  if (input.params.output && (relative4 === "" || relative4 === ".." || relative4.startsWith(`..${path8.sep}`) || path8.isAbsolute(relative4))) throw new Error(`runs.host('${input.key}') output escapes the workflow cwd.`);
  const explicitOutputParent = input.params.output ? assertSafeExplicitOutput(input.cwd, outputPath, input.key) : void 0;
  if (!input.params.output) fs7.mkdirSync(path8.dirname(outputPath), { recursive: true });
  const startedAt = Date.now();
  let stdout = "";
  let stderr = "";
  let capture = "";
  let timedOut = false;
  let stopped = false;
  let settled = false;
  return new Promise((resolve6, reject) => {
    const child = spawn(quoteExecutableForShell(input.params.command), {
      cwd: input.cwd,
      env: process.env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32"
    });
    const processTree = typeof child.pid === "number" ? createOwnedProcessTreeController(child.pid, { termGraceMs: 1e3 }) : void 0;
    let termination;
    const terminate = (reason) => {
      if (settled) return;
      timedOut = reason === "timeout";
      stopped = reason === "abort";
      if (processTree && child.pid !== void 0) termination ??= terminateProcessTree(child.pid, processTree);
      else {
        child.kill("SIGTERM");
        termination ??= Promise.resolve({ state: "unknown", reason: "missing-process-id" });
      }
    };
    const timeout = setTimeout(() => terminate("timeout"), input.params.timeoutMs);
    timeout.unref?.();
    const onAbort = () => terminate("abort");
    if (input.signal.aborted) onAbort();
    else input.signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk, MAX_PREVIEW_BYTES);
      capture = appendBounded(capture, chunk, MAX_CAPTURE_BYTES);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk, MAX_PREVIEW_BYTES);
      capture = appendBounded(capture, chunk, MAX_CAPTURE_BYTES);
    });
    const finish = async (exitCode, spawnError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      input.signal.removeEventListener("abort", onAbort);
      const terminal3 = termination ? await termination : await processTree?.finishAfterWriterClose();
      const cleanupError = process.platform !== "win32" && terminal3?.state === "unknown" ? terminal3.reason : void 0;
      const state = timedOut ? "timed-out" : stopped ? "stopped" : exitCode === 0 && !spawnError && !cleanupError ? "passed" : "failed";
      const error = spawnError instanceof Error ? spawnError.message : spawnError ? String(spawnError) : cleanupError ? `Process-tree cleanup failed: ${cleanupError}.` : state === "timed-out" ? `Command timed out after ${input.params.timeoutMs}ms.` : state === "stopped" ? "Command stopped because the workflow was aborted." : state === "failed" ? `Command exited with code ${exitCode ?? "unknown"}.` : void 0;
      try {
        if (input.claimedOutputPath && resolveWorkflowHostOutputClaimPath(outputPath) !== input.claimedOutputPath) throw new Error(`output path changed after it was claimed.`);
        if (explicitOutputParent) {
          const currentParent = assertSafeExplicitOutput(input.cwd, outputPath, input.key);
          if (currentParent !== explicitOutputParent) throw new Error(`output parent changed while the command was running.`);
          writeExplicitOutput(explicitOutputParent, outputPath, capture, input.key);
        } else {
          fs7.writeFileSync(outputPath, capture, { encoding: "utf8", mode: 384 });
        }
      } catch (writeError) {
        reject(new Error(`runs.host('${input.key}') could not save command output: ${writeError instanceof Error ? writeError.message : String(writeError)}`, { cause: writeError instanceof Error ? writeError : void 0 }));
        return;
      }
      resolve6({ key: input.key, kind: "command", ok: state === "passed", state, exitCode, stdout, stderr, outputPath, durationMs: Date.now() - startedAt, ...error ? { error } : {} });
    };
    child.on("close", (code) => {
      void finish(code);
    });
    child.on("error", (error) => {
      void finish(null, error);
    });
  });
}

// src/workflows/scripted-workflow.ts
import { accessSync, constants as constants2, readFileSync as readFileSync6, realpathSync as realpathSync3, statSync as statSync4 } from "node:fs";
import { createRequire } from "node:module";
import { dirname as dirname6, resolve as resolvePath } from "node:path";
import { Worker } from "node:worker_threads";
var KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
var BASE_REF_VALIDATION_ERROR = "baseRef must be a valid Git ref: use HEAD or a supported named ref (for example, refs/heads/main). Full 40/64-character commit IDs and revision expressions are unsupported.";
function validGitRef(ref) {
  if (typeof ref !== "string" || !ref || ref === "@" || Buffer.byteLength(ref, "utf-8") > 1024 || ref.startsWith("/") || ref.endsWith("/") || ref.includes("//") || ref.includes("..") || ref.includes("@{")) return false;
  if (/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(ref)) return false;
  if (/[[\]\\~^:?*\u0000-\u0020\u007f]/u.test(ref) || ref.endsWith(".") || ref.endsWith(".lock")) return false;
  return ref.split("/").every((component) => component.length > 0 && component !== "." && component !== ".." && !component.startsWith(".") && !component.endsWith(".") && !component.endsWith(".lock"));
}
var requireFromPackage = createRequire(new URL("../src/workflows/scripted-workflow.js", import.meta.url).href);
var WORKFLOW_ASSEMBLY_FLUSH_TIMEOUT_MS = 5e3;
var WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require("node:worker_threads");
const vm = require("node:vm");
const { inspect } = require("node:util");
const { parse } = require(workerData.acornPath);

let promiseHooks;
try {
  ({ promiseHooks } = require("node:v8"));
} catch {}

function createWorkflowPromiseHook(callbacks) {
  if (!promiseHooks || typeof promiseHooks.createHook !== "function") return () => {};
  try {
    return promiseHooks.createHook(callbacks);
  } catch (error) {
    if (error?.name !== "NotImplementedError") throw error;
    return () => {};
  }
}

let nextCallId = 0;
let topLevelWorkflowPromise;
let suppressNativePromiseConsumption = 0;
const activeNativePromises = [];
const pending = new Map();
const workflowErrorKinds = new WeakMap();
const runKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function validGitRef(ref) {
  if (typeof ref !== "string" || !ref || ref === "@" || new TextEncoder().encode(ref).length > 1024 || ref.startsWith("/") || ref.endsWith("/") || ref.includes("//") || ref.includes("..") || ref.includes("@{")) return false;
  if (/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(ref)) return false;
  if (/[[\]\\~^:?*\u0000-\u0020\u007f]/u.test(ref) || ref.endsWith(".") || ref.endsWith(".lock")) return false;
  return ref.split("/").every((component) => component.length > 0 && component !== "." && component !== ".." && !component.startsWith(".") && !component.endsWith(".") && !component.endsWith(".lock"));
}
const trackedPromiseTrackers = new WeakMap();
const trackedPromiseTargets = new WeakMap();
let nativePromiseTrackers = new WeakMap();
let nativePromiseParents = new WeakMap();
const observedCallIds = new Set();

function stableRunJson(value) {
  if (Array.isArray(value)) return "[" + value.map(stableRunJson).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableRunJson(value[key])).join(",") + "}";
  return JSON.stringify(value) ?? "undefined";
}

function canonicalRunParams(params) {
  if (params.gate === undefined || params.acceptance !== false) return params;
  const { acceptance: _acceptance, ...withoutAcceptance } = params;
  return withoutAcceptance;
}

function isDirectWorkflowScriptPromiseHandlerCall() {
  const stack = new Error().stack;
  if (typeof stack !== "string") return false;
  return stack.split("\n").some((line) => line.includes("workflow-script.js") && !line.includes("at async "));
}

function nativePromiseTracker(promise) {
  if (!promise || (typeof promise !== "object" && typeof promise !== "function")) return undefined;
  let tracker = nativePromiseTrackers.get(promise);
  if (!tracker) {
    tracker = { observations: [], consumed: false, dependencies: [] };
    nativePromiseTrackers.set(promise, tracker);
  }
  return tracker;
}

function promiseObservationTracker(value) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return undefined;
  return trackedPromiseTrackers.get(value) ?? nativePromiseTrackers.get(value);
}

function addTrackerDependency(tracker, dependency) {
  if (!dependency) return;
  tracker.dependencies ??= [];
  if (!tracker.dependencies.includes(dependency)) tracker.dependencies.push(dependency);
  if (tracker.consumed) markTrackedObservationsConsumed(dependency);
}

function descendsFromTopLevelWorkflow(promise) {
  const seen = new Set();
  for (let current = promise; current && !seen.has(current); current = nativePromiseParents.get(current)) {
    if (current === topLevelWorkflowPromise) return true;
    seen.add(current);
  }
  return false;
}

function withSuppressedNativePromiseConsumption(callback) {
  suppressNativePromiseConsumption++;
  try {
    return callback();
  } finally {
    suppressNativePromiseConsumption--;
  }
}

function mergeObservations(...groups) {
  const seen = new Set();
  const merged = [];
  for (const group of groups) {
    for (const observation of group) {
      if (!observation || typeof observation.callId !== "number" || typeof observation.key !== "string" || typeof observation.operation !== "string" || seen.has(observation.callId)) continue;
      seen.add(observation.callId);
      merged.push(observation);
    }
  }
  return merged;
}

function trackedObservationTracker(value) {
  return value && (typeof value === "object" || typeof value === "function") ? trackedPromiseTrackers.get(value) : undefined;
}

function trackedPromiseTarget(value) {
  return value && (typeof value === "object" || typeof value === "function") ? trackedPromiseTargets.get(value) ?? value : value;
}

function addTrackedObservations(tracker, observations) {
  tracker.observations = mergeObservations(tracker.observations, observations);
  if (!tracker.consumed) return;
  for (const observation of tracker.observations) {
    if (observedCallIds.has(observation.callId)) continue;
    observedCallIds.add(observation.callId);
    parentPort.postMessage({ type: "callObserved", callId: observation.callId, key: observation.key, operation: observation.operation });
  }
}

function markTrackedObservationsConsumed(tracker, seen = new Set()) {
  if (seen.has(tracker)) return;
  seen.add(tracker);
  tracker.consumed = true;
  addTrackedObservations(tracker, []);
  for (const dependency of tracker.dependencies ?? []) markTrackedObservationsConsumed(dependency, seen);
}

function consumeTrackedObservations(tracker) {
  if (isDirectWorkflowScriptPromiseHandlerCall()) return;
  const activePromise = activeNativePromises.at(-1);
  if (activePromise === topLevelWorkflowPromise || descendsFromTopLevelWorkflow(activePromise)) {
    markTrackedObservationsConsumed(tracker);
  } else if (activePromise) {
    addTrackerDependency(nativePromiseTracker(activePromise), tracker);
  } else {
    markTrackedObservationsConsumed(tracker);
  }
}

function trackObservationTracker(tracker, promise, allowFutureObservations = false) {
  const target = trackedPromiseTarget(promise);
  if ((!allowFutureObservations && tracker.observations.length === 0) || !target || typeof target.then !== "function") return promise;

  const tracked = new Proxy(target, {
    get(promiseTarget, prop) {
      if (prop === "then") return function promiseThen(onFulfilled, onRejected) {
        consumeTrackedObservations(tracker);
        const chainTracker = { observations: tracker.observations, consumed: false, dependencies: [tracker] };
        const wrapHandler = (handler) => typeof handler === "function"
          ? function trackedThenHandler(...args) {
            const value = handler.apply(this, args);
            addTrackerDependency(chainTracker, promiseObservationTracker(value));
            return trackedPromiseTarget(value);
          }
          : handler;
        return trackObservationTracker(chainTracker, promiseTarget.then(wrapHandler(onFulfilled), wrapHandler(onRejected)), true);
      };
      if (prop === "catch") return function promiseCatch(onRejected) {
        consumeTrackedObservations(tracker);
        return trackObservationTracker({ observations: tracker.observations, consumed: false, dependencies: [tracker] }, promiseTarget.catch(onRejected), true);
      };
      if (prop === "finally") return function promiseFinally(onFinally) {
        consumeTrackedObservations(tracker);
        return trackObservationTracker({ observations: tracker.observations, consumed: false, dependencies: [tracker] }, promiseTarget.finally(onFinally), true);
      };
      return Reflect.get(promiseTarget, prop, promiseTarget);
    },
  });
  trackedPromiseTrackers.set(tracked, tracker);
  trackedPromiseTargets.set(tracked, target);
  return tracked;
}

function trackRunObservation(observations, promise) {
  const tracker = trackedObservationTracker(promise) ?? { observations: [], consumed: false };
  addTrackedObservations(tracker, observations);
  return trackObservationTracker(tracker, promise);
}

function trackPromiseCombinator(items, createPromise) {
  const values = Array.from(items);
  const dependencies = [...new Set(values.map(promiseObservationTracker).filter(Boolean))];
  const promise = withSuppressedNativePromiseConsumption(() => createPromise(values.map(trackedPromiseTarget)));
  if (dependencies.length === 0) return promise;
  return trackObservationTracker({ observations: [], consumed: false, dependencies }, promise, true);
}

// Hosts that freeze built-ins make Promise.all and friends non-writable and non-configurable, and a
// Proxy over Promise itself may not return wrappers for those. Proxy a plain constructor instead.
const workflowPromiseTarget = function Promise() {};
workflowPromiseTarget.prototype = Promise.prototype;
const workflowPromise = new Proxy(workflowPromiseTarget, {
  apply() {
    throw new TypeError("Promise constructor cannot be invoked without 'new'");
  },
  construct(_proxyTarget, [executor]) {
    const target = Promise;
    if (typeof executor !== "function") return new target(executor);
    const tracker = { observations: [], consumed: false };
    const promise = new target((resolve, reject) => {
      let settled = false;
      try {
        executor((value) => {
          if (settled) return;
          settled = true;
          addTrackerDependency(tracker, promiseObservationTracker(value));
          resolve(trackedPromiseTarget(value));
        }, (reason) => {
          if (settled) return;
          settled = true;
          reject(reason);
        });
      } catch (error) {
        settled = true;
        throw error;
      }
    });
    return trackObservationTracker(tracker, promise, true);
  },
  get(_proxyTarget, prop) {
    const target = Promise;
    if (prop === "all") return (items) => trackPromiseCombinator(items, (values) => target.all(values));
    if (prop === "allSettled") return (items) => trackPromiseCombinator(items, (values) => target.allSettled(values));
    if (prop === "race") return (items) => trackPromiseCombinator(items, (values) => target.race(values));
    if (prop === "any") return (items) => trackPromiseCombinator(items, (values) => target.any(values));
    if (prop === "resolve") return (value) => {
      const dependency = promiseObservationTracker(value);
      const promise = withSuppressedNativePromiseConsumption(() => target.resolve(trackedPromiseTarget(value)));
      if (!dependency) return promise;
      return trackObservationTracker({ observations: [], consumed: false, dependencies: [dependency] }, promise, true);
    };
    const value = target[prop];
    return typeof value === "function" ? value.bind(target) : value;
  },
});

function hostCall(method, args, observation) {
  const callId = ++nextCallId;
  const promise = new Promise((resolve, reject) => {
    pending.set(callId, { resolve, reject });
    parentPort.postMessage({ type: "call", callId, method, args });
  });
  return observation && typeof observation.key === "string" && typeof observation.operation === "string"
    ? trackRunObservation([{ key: observation.key, operation: observation.operation, callId }], promise)
    : promise;
}

function runHostCall(key, params, collectFailure, batch, generatedLaneKey) {
  const callId = ++nextCallId;
  const promise = new Promise((resolve, reject) => {
    pending.set(callId, { resolve, reject });
    parentPort.postMessage({ type: "call", callId, method: "run", args: { key, params, ...(collectFailure ? { collectFailure: true } : {}), ...(batch ? { batch } : {}), ...(generatedLaneKey ? { generatedLaneKey } : {}) } });
  });
  return { key, callId, promise };
}

function isArrayIndexProperty(prop) {
  if (!/^(0|[1-9]\d*)$/.test(prop)) return false;
  const index = Number(prop);
  return Number.isSafeInteger(index) && index >= 0 && index < 4294967295;
}

const runsAllResultTargets = new WeakMap();

const MAX_LANES = 32;
const MAX_LANE_STAGES = 16;
const MAX_LANE_STAGE_COUNT = 64;
const MAX_LANE_SPEC_BYTES = 64 * 1024;
const MAX_LANE_TASK_BYTES = 1024 * 1024;
const MAX_LANE_PATH_BYTES = 32 * 1024;
const MAX_LANE_BOARD_TEXT_BYTES = 256;
const LANE_PATH_FIELDS = new Set(["cwd", "output", "sessionDir"]);

function runsAllKeyAccessError(prop) {
  return new Error("Cannot read runs.all result property '" + prop + "'. runs.all resolves to an ordered array, not a key map. Use results[0], array destructuring, or results.map((result) => result.output), not results." + prop + ".");
}

function wrapRunsAllResults(results, keys) {
  const keySet = new Set(keys);
  const proxy = new Proxy(results, {
    get(target, prop, receiver) {
      if (typeof prop !== "string") return Reflect.get(target, prop, receiver);
      if (prop === "then" || prop === "toJSON") return undefined;
      if (prop in target || isArrayIndexProperty(prop)) return Reflect.get(target, prop, receiver);
      if (keySet.has(prop)) throw runsAllKeyAccessError(prop);
      throw runsAllKeyAccessError(prop);
    },
  });
  runsAllResultTargets.set(proxy, results);
  return proxy;
}

function laneByteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function laneBoardText(value) {
  if (typeof value !== "string" || !value) return undefined;
  if (laneByteLength(value) <= MAX_LANE_BOARD_TEXT_BYTES) return value;
  const bytes = new TextEncoder().encode(value).subarray(0, MAX_LANE_BOARD_TEXT_BYTES - 3);
  return new TextDecoder().decode(bytes) + "...";
}

function laneBoardPath(value) {
  if (typeof value !== "string" || !value || laneByteLength(value) > MAX_LANE_BOARD_TEXT_BYTES) return undefined;
  return value;
}

function validateLaneStageBounds(params, label) {
  if (typeof params.task === "string" && laneByteLength(params.task) > MAX_LANE_TASK_BYTES) throw new Error(label + " task exceeds 1 MiB when UTF-8 encoded.");
  for (const field of LANE_PATH_FIELDS) if (typeof params[field] === "string" && laneByteLength(params[field]) > MAX_LANE_PATH_BYTES) throw new Error(label + " " + field + " exceeds 32 KiB when UTF-8 encoded.");
}

function validateLaneKey(value, owner) {
  if (typeof value !== "string" || !runKeyPattern.test(value)) throw new Error(owner + " key must be 1-128 characters using letters, numbers, '.', '_' or '-', and start with a letter or number.");
  return value;
}

function laneStageParams(stage, previous) {
  const resume = stage.resume;
  const params = { ...stage.params };
  if (resume !== "previous") return params;
  if (!previous || typeof previous.runId !== "string" || !previous.runId.trim()) return undefined;
  return { ...params, resume: previous.runId.trim() };
}

function laneStageVerdict(result) {
  const structured = result && typeof result === "object" && !Array.isArray(result) ? result.structuredOutput : undefined;
  const verdict = structured && typeof structured === "object" && !Array.isArray(structured) ? structured.verdict : undefined;
  return typeof verdict === "string" && verdict.trim() ? laneBoardText(verdict.trim()) : undefined;
}

function laneStageIsBlocked(result) {
  const structured = result && typeof result === "object" && !Array.isArray(result) ? result.structuredOutput : undefined;
  return structured && typeof structured === "object" && !Array.isArray(structured) && structured.verdict === "blocked";
}

function laneStageRecord(stageKey, child, forcedState) {
  const result = child && typeof child === "object" && !Array.isArray(child) ? child : undefined;
  const ok = result?.ok === true;
  const verdict = laneStageVerdict(result);
  const blocked = laneStageIsBlocked(result);
  const state = forcedState ?? (result?.state === "running" ? "running" : result?.stopped ? "stopped" : result?.detached ? "detached" : ok ? blocked ? "blocked" : "completed" : "failed");
  const error = state !== "completed" && state !== "running"
    ? state === "blocked" && blocked
      ? "Stage returned a blocked verdict."
      : typeof result?.error === "string"
        ? result.error
        : typeof result?.output === "string"
          ? result.output
          : "Stage did not complete successfully."
    : undefined;
  return {
    key: stageKey,
    ...(typeof result?.runId === "string" && result.runId.trim() ? { runId: laneBoardText(result.runId.trim()) } : {}),
    ...(result ? { ok } : {}),
    state,
    ...(typeof result?.outputReference === "string" ? (laneBoardPath(result.outputReference) ? { outputReference: laneBoardPath(result.outputReference) } : {}) : {}),
    ...(verdict ? { verdict } : {}),
    ...(error ? { error: laneBoardText(error) } : {}),
  };
}

function laneFailure(stageKey, error) {
  const text = error instanceof Error ? error.message : String(error);
  return { key: stageKey, ok: false, output: text, error: text, artifactPaths: [] };
}

function runCollected(key, params, observe, generatedLaneKey) {
  validateRunCall(key, params, "runs.lanes stage", runFingerprints);
  const launched = runHostCall(key, params, true, undefined, generatedLaneKey);
  observe([{ key, operation: "run", callId: launched.callId }]);
  return launched.promise.then(decorateWorkflowChildResult);
}

function validateLaneSpecs(laneSpecs) {
  if (!Array.isArray(laneSpecs)) throw new Error("runs.lanes(lanes) requires an array.");
  if (laneSpecs.length === 0) throw new Error("runs.lanes(lanes) requires at least one lane.");
  if (laneSpecs.length > MAX_LANES) throw new Error("runs.lanes supports at most " + MAX_LANES + " lanes.");
  assertJsonValue(laneSpecs, "runs.lanes lanes");
  if (laneByteLength(stableRunJson(laneSpecs)) > MAX_LANE_SPEC_BYTES) throw new Error("runs.lanes canonical JSON exceeds 64 KiB.");
  const generatedKeys = new Set();
  const validationFingerprints = new Map();
  let stageCount = 0;
  const normalized = [];
  for (let laneIndex = 0; laneIndex < laneSpecs.length; laneIndex++) {
    const lane = laneSpecs[laneIndex];
    const laneLabel = "runs.lanes lane " + laneIndex;
    if (!lane || typeof lane !== "object" || Array.isArray(lane)) throw new Error(laneLabel + " must be an object.");
    const laneFields = Object.keys(lane);
    if (laneFields.some((field) => field !== "key" && field !== "stages")) throw new Error(laneLabel + " contains unsupported fields.");
    const laneKey = validateLaneKey(lane.key, laneLabel);
    if (!Array.isArray(lane.stages) || lane.stages.length === 0) throw new Error(laneLabel + " stages must contain at least one stage.");
    if (lane.stages.length > MAX_LANE_STAGES) throw new Error(laneLabel + " supports at most " + MAX_LANE_STAGES + " stages.");
    const stageKeys = new Set();
    const stages = [];
    for (let stageIndex = 0; stageIndex < lane.stages.length; stageIndex++) {
      stageCount++;
      if (stageCount > MAX_LANE_STAGE_COUNT) throw new Error("runs.lanes supports at most " + MAX_LANE_STAGE_COUNT + " total stages.");
      const stage = lane.stages[stageIndex];
      const stageLabel = laneLabel + " stage " + stageIndex;
      if (!stage || typeof stage !== "object" || Array.isArray(stage)) throw new Error(stageLabel + " must be an object.");
      const stageKey = validateLaneKey(stage.key, stageLabel);
      if (stageKeys.has(stageKey)) throw new Error(laneLabel + " contains duplicate stage key '" + stageKey + "'.");
      stageKeys.add(stageKey);
      const generatedKey = laneKey + "." + stageKey;
      validateLaneKey(generatedKey, stageLabel + " generated");
      if (generatedKeys.has(generatedKey)) throw new Error("runs.lanes generated child key '" + generatedKey + "' is duplicated.");
      generatedKeys.add(generatedKey);
      const resume = stage.resume;
      if (resume !== undefined && resume !== "previous") {
        if (stageIndex === 0 && typeof resume === "string") {
          throw new Error(stageLabel + " cannot resume a retained run id in runs.lanes; use runs.run(key, { resume: id }) outside lanes, or start the lane with an agent stage and use resume: \"previous\" later.");
        }
        throw new Error(stageLabel + " resume must be 'previous'.");
      }
      if (stageIndex === 0 && resume === "previous") throw new Error(stageLabel + " cannot resume previous without a predecessor stage.");
      const { key: _stageKey, resume: _resume, ...params } = stage;
      const validationParams = resume === "previous" ? { ...params, resume: "retained-run-placeholder" } : params;
      validateLaneStageBounds(validationParams, stageLabel);
      validateRunCall(generatedKey, validationParams, stageLabel, validationFingerprints);
      const existingFingerprint = runFingerprints.get(generatedKey);
      if (existingFingerprint !== undefined && (resume === "previous" || existingFingerprint !== stableRunJson(canonicalRunParams(params)))) {
        throw new Error("runs.lanes generated child key '" + generatedKey + "' is already used with incompatible launch params.");
      }
      stages.push({ key: stageKey, generatedKey, resume, params });
    }
    normalized.push({ key: laneKey, stages });
  }
  return normalized;
}

function runLane(lane, firstResult, observe) {
  const records = [];
  const appendSkipped = (start) => {
    for (let index = start; index < lane.stages.length; index++) records.push({ key: lane.stages[index].key, state: "skipped" });
  };
  const finish = (state, failedStage) => ({ key: lane.key, state, ...(failedStage ? { failedStage } : {}), stages: records });
  const visit = (index, previous) => {
    if (index >= lane.stages.length) return Promise.resolve(finish("complete"));
    const stage = lane.stages[index];
    if (index === 0) {
      const record = laneStageRecord(stage.key, previous);
      records.push(record);
      if (record.state !== "completed") {
        appendSkipped(index + 1);
        return Promise.resolve(finish("blocked", stage.key));
      }
      return visit(index + 1, previous);
    }
    if (stage.resume === "previous" && (!previous || typeof previous.runId !== "string" || !previous.runId.trim())) {
      records.push({ key: stage.key, state: "blocked", error: "Previous stage did not return a retained run id." });
      appendSkipped(index + 1);
      return Promise.resolve(finish("blocked", stage.key));
    }
    if (!previous || previous.ok !== true || laneStageIsBlocked(previous)) {
      records.push({ key: stage.key, state: "blocked", error: "Previous stage did not complete successfully." });
      appendSkipped(index + 1);
      return Promise.resolve(finish("blocked", stage.key));
    }
    const params = laneStageParams(stage, previous);
    if (!params) {
      records.push({ key: stage.key, state: "blocked", error: "Previous stage did not return a retained run id." });
      appendSkipped(index + 1);
      return Promise.resolve(finish("blocked", stage.key));
    }
    let launched;
    try {
      launched = runCollected(stage.generatedKey, params, observe, lane.key);
    } catch (error) {
      const failed = laneFailure(stage.generatedKey, error);
      records.push(laneStageRecord(stage.key, failed));
      appendSkipped(index + 1);
      return Promise.resolve(finish("blocked", stage.key));
    }
    return launched.then((result) => {
      const record = laneStageRecord(stage.key, result);
      records.push(record);
      if (record.state === "completed") return visit(index + 1, result);
      appendSkipped(index + 1);
      return finish("blocked", stage.key);
    }, (error) => {
      const failed = laneFailure(stage.generatedKey, error);
      records.push(laneStageRecord(stage.key, failed));
      appendSkipped(index + 1);
      return finish("blocked", stage.key);
    });
  };
  return visit(0, firstResult);
}

function workflowPlanStringMetadata(params) {
  return {
    ...(typeof params.phase === "string" && params.phase.trim() ? { phase: params.phase.trim() } : {}),
    ...(typeof params.label === "string" && params.label.trim() ? { label: params.label.trim() } : {}),
    ...(typeof params.agent === "string" && params.agent.trim() ? { agent: params.agent.trim() } : {}),
  };
}

function runLanes(laneSpecs) {
  const lanes = validateLaneSpecs(laneSpecs);
  parentPort.postMessage({ type: "lanePlan", lanes: lanes.map((lane) => ({
    key: lane.key,
    stages: lane.stages.map((stage) => ({
      key: stage.key,
      generatedKey: stage.generatedKey,
      ...workflowPlanStringMetadata(stage.params),
      ...(typeof stage.params.as === "string" && stage.params.as.trim() ? { outputName: stage.params.as.trim() } : {}),
      ...(stage.params.outputSchema ? { structured: true } : {}),
    })),
  })) });
  const firstItems = lanes.map((lane) => {
    const first = lane.stages[0];
    return { key: first.generatedKey, ...first.params };
  });
  // Share the runs.all batch launcher while allowing each lane to advance independently.
  const firstBatch = launchRunsAll(firstItems, lanes.map((lane) => lane.key));
  const firstResults = firstBatch.launched.map(({ promise }) => promise.then(decorateWorkflowChildResult));
  let trackedAggregate;
  const observe = (observations) => trackRunObservation(observations, trackedAggregate);
  const laneAggregate = Promise.all(lanes.map((lane, index) => firstResults[index].then(
    (result) => runLane(lane, result, observe),
    (error) => runLane(lane, laneFailure(lane.stages[0].generatedKey, error), observe),
  )));
  trackedAggregate = trackRunObservation(firstBatch.launched.map(({ key, callId }) => ({ key, operation: "run", callId })), laneAggregate);
  return trackedAggregate;
}

function formatRef(result) {
  if (!result || typeof result !== "object") throw new Error("runs.ref(result) requires a run result object.");
  const parts = ["run " + (result.key || "unknown")];
  if (result.runId) parts.push("id=" + String(result.runId).slice(0, 8));
  return "[" + parts.join("; ") + "]";
}

function formatChildResultString(result) {
  const output = typeof result?.output === "string" ? result.output.trim() : "";
  return output || formatRef(result);
}

function decorateWorkflowChildResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  Object.defineProperties(result, {
    toString: { value() { return formatChildResultString(this); }, enumerable: false, configurable: true },
  });
  return result;
}

let runFingerprints = new Map();

function validateExtensionBindings(value, label) {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(label + " extensionBindings must be a plain JSON object.");
  const keys = Object.keys(value);
  if (keys.length > 16) throw new Error(label + " extensionBindings supports at most 16 namespaces.");
  for (const key of keys) if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62})\/[1-9][0-9]{0,8}$/.test(key)) throw new Error(label + " extensionBindings namespace '" + key + "' must use a package-like name followed by '/<positive-version>'.");
  assertJsonValue(value, label + " extensionBindings");
  let propertyCount = 0;
  function visit(entry, depth) {
    if (!entry || typeof entry !== "object") return;
    if (depth > 16) throw new Error(label + " extensionBindings exceeds the maximum nesting depth of 16.");
    if (Array.isArray(entry)) { for (const item of entry) visit(item, depth + 1); return; }
    for (const child of Object.values(entry)) {
      propertyCount++;
      if (propertyCount > 256) throw new Error(label + " extensionBindings exceeds 256 total properties.");
      visit(child, depth + 1);
    }
  }
  visit(value, 0);
  if (new TextEncoder().encode(stableRunJson(value)).byteLength > 16384) throw new Error(label + " extensionBindings canonical JSON exceeds 16384 bytes.");
}

function validateLaneMetadata(value, label, workflowKey) {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(label + " must be a plain JSON object.");
  const fields = Object.keys(value);
  const allowed = ["version", "key", "mode", "sourceRef", "claims", "outputPaths"];
  const unknown = fields.filter((field) => !allowed.includes(field));
  if (unknown.length > 0) throw new Error(label + " has unsupported fields: " + unknown.join(", ") + ".");
  if (value.version !== 1) throw new Error(label + ".version must be 1.");
  if (typeof value.key !== "string" || !value.key.trim() || !runKeyPattern.test(value.key.trim())) throw new Error(label + ".key is invalid.");
  if (workflowKey !== undefined && value.key.trim() !== workflowKey) throw new Error(label + ".key must match workflow key '" + workflowKey + "'.");
  if (value.mode !== undefined && !["mutation", "review", "scout", "gate"].includes(value.mode)) throw new Error(label + ".mode is invalid.");
  const bounded = (entry, maxBytes) => typeof entry === "string" && entry.trim() && new TextEncoder().encode(entry.trim()).byteLength <= maxBytes && !/[\r\n\u0000]/.test(entry);
  if (value.sourceRef !== undefined && !bounded(value.sourceRef, 128)) throw new Error(label + ".sourceRef is invalid.");
  for (const [name, maxItems, maxLength] of [["claims", 20, 160], ["outputPaths", 10, 256]]) {
    if (value[name] === undefined) continue;
    if (!Array.isArray(value[name]) || value[name].length > maxItems || value[name].some((entry) => !bounded(entry, maxLength))) throw new Error(label + "." + name + " is invalid.");
  }
}

// Mirrors parseGateInput in src/runs/shared/acceptance.ts; the sandbox cannot import it.
function describeGateShapeError(gate) {
  const shape = "gate must be a non-empty command string or { command, output?: \"json\", schema?, timeoutMs? }.";
  if (typeof gate === "string") return gate.trim() ? undefined : shape;
  if (!gate || typeof gate !== "object" || Array.isArray(gate)) return shape;
  for (const key of Object.keys(gate)) {
    if (!["command", "output", "schema", "timeoutMs"].includes(key)) return "gate." + key + " is not supported.";
  }
  if (typeof gate.command !== "string" || !gate.command.trim()) return shape;
  if (gate.output !== undefined && gate.output !== "json") return "gate.output must be \"json\" when present.";
  if (gate.schema !== undefined) {
    if (gate.output !== "json") return "gate.schema requires gate.output: \"json\".";
    if (!gate.schema || typeof gate.schema !== "object" || Array.isArray(gate.schema)) return "gate.schema must be a JSON Schema object.";
  }
  if (gate.timeoutMs !== undefined && (!Number.isInteger(gate.timeoutMs) || gate.timeoutMs < 1)) return "gate.timeoutMs must be an integer >= 1.";
  return undefined;
}

function describeGateAcceptanceConflict(gate, acceptance) {
  const render = (value) => {
    let encoded;
    try {
      encoded = JSON.stringify(value) ?? String(value);
    } catch {
      encoded = String(value);
    }
    return encoded.length > 120 ? encoded.slice(0, 120) + "..." : encoded;
  };
  return " Both fields were present: gate=" + render(gate) + " acceptance=" + render(acceptance) + ".";
}

function validateRunCall(key, params, label, fingerprints) {
  if (typeof key !== "string" || !runKeyPattern.test(key)) throw new Error(label + " has an invalid key.");
  if (hostKeys.has(key)) throw new Error("Workflow key '" + key + "' is already used by runs.host.");
  if (!params || typeof params !== "object" || Array.isArray(params)) throw new Error(label + " requires a params object.");
  if (Object.prototype.hasOwnProperty.call(params, "action") || Object.prototype.hasOwnProperty.call(params, "workflowScript") || Object.prototype.hasOwnProperty.call(params, "globalConcurrencyLimit") || Object.prototype.hasOwnProperty.call(params, "maxSubagentSpawnsPerRun") || Object.prototype.hasOwnProperty.call(params, "tasks") || Object.prototype.hasOwnProperty.call(params, "chain") || Object.prototype.hasOwnProperty.call(params, "parallel") || Object.prototype.hasOwnProperty.call(params, "concurrency") || Object.prototype.hasOwnProperty.call(params, "chainDir")) {
    const hint = label === "runs.run" ? "; use runs.all(...) and JavaScript control flow for orchestration." : ".";
    throw new Error(label + " accepts one child via { agent, task } and execution controls only" + hint);
  }
  if (Object.prototype.hasOwnProperty.call(params, "clarify")) throw new Error(label + " does not support clarify UI.");
  if (params.worktree !== undefined && typeof params.worktree !== "boolean") throw new Error(label + " worktree must be true or false.");
  if (params.baseRef !== undefined && (typeof params.baseRef !== "string" || !validGitRef(params.baseRef))) throw new Error(label + " baseRef must be a valid Git ref: use HEAD or a supported named ref (for example, refs/heads/main). Full 40/64-character commit IDs and revision expressions are unsupported.");
  validateLaneMetadata(params.lane, label + " lane", key);
  if (params.gate !== undefined) {
    const gateError = describeGateShapeError(params.gate);
    if (gateError) throw new Error(label + " " + gateError);
  }
  if (params.gate !== undefined && params.acceptance !== undefined && params.acceptance !== false) throw new Error(label + " gate cannot be combined with acceptance; use one gate command or acceptance.verify." + describeGateAcceptanceConflict(params.gate, params.acceptance));
  if (params.gate !== undefined && params.resume !== undefined) throw new Error(label + " gate is not supported with retained resume.");
  if (params.extensionBindings !== undefined && params.resume !== undefined) throw new Error(label + " extensionBindings is not supported with retained resume; resume uses the original retained child binding.");
  if (params.resume !== undefined && typeof params.resume !== "string") {
    const reference = params.resume;
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) throw new Error(label + " resume must be a retained run id or keyed workflow receipt reference.");
    const fields = Object.keys(reference);
    if (fields.some((field) => field !== "workflowRunId" && field !== "key" && field !== "latest")) throw new Error(label + " keyed resume contains unsupported fields.");
    if (typeof reference.workflowRunId !== "string" || !reference.workflowRunId.trim()) throw new Error(label + " keyed resume workflowRunId must be non-empty.");
    if (typeof reference.key !== "string" || !runKeyPattern.test(reference.key)) throw new Error(label + " keyed resume key is invalid.");
    if (reference.latest !== true) throw new Error(label + " keyed resume requires latest: true.");
  }
  if (typeof params.resume === "string" && !params.resume.trim()) throw new Error(label + " resume must be a non-empty retained run id.");
  if (params.resume !== undefined && params.agent !== undefined) throw new Error(label + " resume and agent are mutually exclusive.");
  if (params.resume !== undefined && (typeof params.task !== "string" || !params.task.trim())) throw new Error(label + " resume requires a non-empty task follow-up.");
  validateExtensionBindings(params.extensionBindings, label);
  assertJsonValue(params, label + " params");
  const fingerprint = stableRunJson(canonicalRunParams(params));
  const existing = fingerprints.get(key);
  if (existing !== undefined && existing !== fingerprint) throw new Error("Duplicate workflow key '" + key + "' used with incompatible launch params.");
  fingerprints.set(key, fingerprint);
}

const hostKeys = new Set();

function validateHostCommand(key, params) {
  validateLaneKey(key, "runs.host");
  if (!params || typeof params !== "object" || Array.isArray(params)) throw new Error("runs.host('" + key + "') params must be an object.");
  const allowed = new Set(["kind", "command", "timeoutMs", "output", "role", "provider"]);
  const unknown = Object.keys(params).filter((field) => !allowed.has(field));
  if (unknown.length) {
    const cwdHint = unknown.includes("cwd")
      ? " The host step does not accept per-step cwd; commands and relative output paths use the workflow cwd. Set cwd on the outer subagent request, or put a trusted directory change in command (for example, 'cd /path/to/worktree && npm test')."
      : "";
    throw new Error("runs.host('" + key + "') params have unsupported fields: " + unknown.join(", ") + "." + cwdHint);
  }
  if (params.kind !== "command") throw new Error("runs.host('" + key + "') kind must be 'command'.");
  if (typeof params.command !== "string" || !params.command.trim() || params.command.includes("\u0000") || new TextEncoder().encode(params.command.trim()).byteLength > 16384) throw new Error("runs.host('" + key + "') command must be a non-empty string of at most 16384 bytes without NUL.");
  if (!Number.isInteger(params.timeoutMs) || params.timeoutMs < 1 || params.timeoutMs > 86400000) throw new Error("runs.host('" + key + "') timeoutMs must be an integer from 1 to 86400000.");
  if (params.output !== undefined && (typeof params.output !== "string" || !params.output.trim() || /^[/\\]|(?:^|[/\\])\.\.(?:[/\\]|$)/.test(params.output) || /[\u0000-\u001f\u007f]/.test(params.output) || new TextEncoder().encode(params.output.trim()).byteLength > 240)) throw new Error("runs.host('" + key + "') output must be a bounded relative path without traversal or control characters.");
  if (params.role !== undefined && params.role !== "ci" && params.role !== "gate") throw new Error("runs.host('" + key + "') role must be 'ci' or 'gate'.");
  if (params.provider !== undefined && (typeof params.provider !== "string" || !params.provider.trim() || /[\r\n\u0000]/.test(params.provider) || new TextEncoder().encode(params.provider.trim()).byteLength > 64)) throw new Error("runs.host('" + key + "') provider must be a non-empty single-line string of at most 64 bytes.");
  assertJsonValue(params, "runs.host('" + key + "') params");
  if (hostKeys.has(key) || runFingerprints.has(key)) throw new Error("Workflow key '" + key + "' is already in use.");
  if (hostKeys.size >= 32) throw new Error("workflowScript supports at most 32 runs.host calls.");
  hostKeys.add(key);
}

const RUNS_ALL_PERMISSIVE_WARNING = "runs.all received runs.run(...) launch promise(s) or thenable(s). Those children were already launched individually, so runs.all cannot apply batch fingerprint validation, batch grouping in the fleet view, or collectFailure semantics; a failed child will throw at the runs.all boundary instead of returning as { ok: false }. To get full runs.all semantics, pass config objects: runs.all(items.map((item) => ({ key: item.key, agent: item.agent, task: item.task }))).";

function runsAllItemThenableInfo(item, index) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  if (typeof item.then !== "function") return null;
  const tracker = promiseObservationTracker(item);
  const observation = tracker && Array.isArray(tracker.observations) ? tracker.observations.find((entry) => entry && entry.operation === "run") : undefined;
  return {
    key: observation && typeof observation.key === "string" ? observation.key : ("runs.all[" + index + "]"),
    callId: observation && typeof observation.callId === "number" ? observation.callId : null,
    promise: item,
  };
}

let warnedPermissiveRunsAll = false;

function launchRunsAll(items, generatedLaneKeys) {
  if (!Array.isArray(items)) throw new Error("runs.all(items) requires an array.");
  const anyThenable = items.some((item, index) => runsAllItemThenableInfo(item, index) !== null);
  if (anyThenable) return launchRunsAllPermissive(items);
  const fingerprints = new Map(runFingerprints);
  const calls = [];
  for (let index = 0; index < items.length; index++) {
    if (!Object.prototype.hasOwnProperty.call(items, index)) throw new Error("runs.all items must not contain sparse entries.");
    const item = items[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("runs.all item " + index + " must be an object.");
    const { key, ...params } = item;
    validateRunCall(key, params, "runs.all item " + index, fingerprints);
    calls.push({ key, params });
  }
  runFingerprints = fingerprints;
  const batch = { id: "batch-" + (++nextCallId), calls };
  const launched = calls.map(({ key, params }, index) => runHostCall(key, params, true, batch, generatedLaneKeys?.[index]));
  return { calls, launched };
}

function launchRunsAllPermissive(items) {
  if (!warnedPermissiveRunsAll) {
    warnedPermissiveRunsAll = true;
    try { capturedConsole.warn(RUNS_ALL_PERMISSIVE_WARNING); } catch { /* console emission is best-effort */ }
  }
  const fingerprints = new Map(runFingerprints);
  const calls = [];
  const launched = [];
  for (let index = 0; index < items.length; index++) {
    if (!Object.prototype.hasOwnProperty.call(items, index)) throw new Error("runs.all items must not contain sparse entries.");
    const item = items[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("runs.all item " + index + " must be an object or a runs.run(...) launch promise.");
    const thenable = runsAllItemThenableInfo(item, index);
    if (thenable) {
      calls.push({ key: thenable.key, params: {} });
      launched.push(thenable);
      continue;
    }
    const { key, ...params } = item;
    validateRunCall(key, params, "runs.all item " + index, fingerprints);
    calls.push({ key, params });
    launched.push(null);
  }
  runFingerprints = fingerprints;
  return { calls, launched: launched.map((entry, index) => entry ?? runHostCall(calls[index].key, calls[index].params, false, undefined)) };
}

const runs = Object.freeze({
  run(key, params) {
    validateRunCall(key, params, "runs.run", runFingerprints);
    const launched = runHostCall(key, params, false);
    return trackRunObservation([{ key, operation: "run", callId: launched.callId }], launched.promise.then(decorateWorkflowChildResult));
  },
  all(items) {
    const { calls, launched } = launchRunsAll(items);
    return trackRunObservation(launched.map(({ key, callId }) => ({ key, operation: "run", callId })), trackPromiseCombinator(launched.map(({ promise }) => promise), (values) => Promise.all(values).then((results) => wrapRunsAllResults(results.map(decorateWorkflowChildResult), calls.map(({ key }) => key)))));
  },
  lanes(laneSpecs) {
    return runLanes(laneSpecs);
  },
  host(key, params) {
    validateHostCommand(key, params);
    return hostCall("host", { key, params }, { key, operation: "host" });
  },
  steer(key, message, options = {}) {
    if (typeof key !== "string" || !runKeyPattern.test(key)) throw new Error("runs.steer has an invalid key.");
    if (typeof message !== "string" || !message.trim()) throw new Error("runs.steer message must be a non-empty string.");
    if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("runs.steer options must be an object.");
    const allowed = new Set(["mode", "index", "ackTimeoutMs"]);
    for (const option of Object.keys(options)) if (!allowed.has(option)) throw new Error("runs.steer options contain unsupported field '" + option + "'.");
    if (options.mode !== undefined && options.mode !== "steer" && options.mode !== "follow_up" && options.mode !== "auto") throw new Error("runs.steer mode must be 'steer', 'follow_up', or 'auto'.");
    if (options.index !== undefined && (!Number.isInteger(options.index) || options.index < 0 || options.index > 1000000)) throw new Error("runs.steer index must be an integer between 0 and 1000000.");
    if (options.ackTimeoutMs !== undefined && (!Number.isInteger(options.ackTimeoutMs) || options.ackTimeoutMs < 1)) throw new Error("runs.steer ackTimeoutMs must be a positive integer.");
    return hostCall("steer", { key, message: message.trim(), options }, { key, operation: "steer" });
  },
  status(keyOrRunId) { return hostCall("status", { keyOrRunId }); },
  ref: formatRef,
  refs(results) {
    if (!Array.isArray(results)) throw new Error("runs.refs(results) requires an array.");
    return results.map(formatRef).join("\n");
  },
});

function validateStateKey(key) {
  if (typeof key !== "string" || !runKeyPattern.test(key)) throw new Error("state key must be 1-128 characters using letters, numbers, '.', '_' or '-', and start with a letter or number.");
  return key;
}

const state = Object.freeze({
  get(key) { return hostCall("state.get", { key: validateStateKey(key) }); },
  set(key, value) {
    const validKey = validateStateKey(key);
    assertJsonValue(value, "state.set('" + validKey + "') value");
    return hostCall("state.set", { key: validKey, value });
  },
});

let contextObjectPrototype;

const capturedConsole = Object.freeze(Object.fromEntries(
  ["log", "info", "warn", "error"].map((level) => [level, (...args) => {
    parentPort.postMessage({ type: "console", level, text: args.map((value) => typeof value === "string" ? value : inspect(value, { depth: 4, breakLength: 120 })).join(" ") });
  }]),
));

function formatWorkflowScriptSyntaxError(error) {
  const details = formatWorkflowScriptError(error);
  return [
    "workflowScript must be valid JavaScript.",
    "If task text contains Markdown fences or backticks, use an array joined with \"\\n\" or escaped strings instead of a raw backtick template literal.",
    "",
    "Original SyntaxError:",
    details,
  ].join("\n");
}

function formatWorkflowScriptError(error) {
  const message = error && typeof error.message === "string" ? error.message : String(error);
  const stack = error && typeof error.stack === "string" ? error.stack : "";
  if (!stack) return message;
  return stack.includes(message) ? stack : message + "\n" + stack;
}

function isSyntaxError(error) {
  return error instanceof SyntaxError || error?.name === "SyntaxError";
}

function postWorkflowError(error) {
  // Pre-run syntax and portability errors are tagged "validation" where the script is compiled;
  // anything reaching here was thrown while the script ran, including a runtime SyntaxError.
  const taggedKind = error && (typeof error === "object" || typeof error === "function") ? workflowErrorKinds.get(error) : undefined;
  parentPort.postMessage({ type: "error", error: isSyntaxError(error) ? formatWorkflowScriptSyntaxError(error) : formatWorkflowScriptError(error), errorKind: taggedKind ?? "script" });
}

process.on("unhandledRejection", postWorkflowError);

const NESTED_ASYNC_WORKFLOW_ERROR = "workflowScript validation failed before child launch; no children launched. workflowScript does not support nested async functions. Use top-level await, plain helper functions that return runs.run(...), or explicit Promise chains so workflows stay portable across Node and Bun. Parallel plus sequential rewrite: const a = runs.run(\"a\", { agent: \"worker\", task: \"A\" }); const writer = await runs.run(\"writer\", { agent: \"worker\", task: \"Write\" }); const review = await runs.run(\"review\", { agent: \"reviewer\", task: writer.output }); const [aResult] = await Promise.all([a]); return { a: aResult.output, issue: { writerRunId: writer.runId, reviewRunId: review.runId } };";
const AST_SCALAR_KEYS = new Set(["type", "start", "end"]);

function assertPortableWorkflowScript(source) {
  const wrapped = "(async () => {\n" + source + "\n})()";
  let ast;
  try {
    ast = parse(wrapped, { ecmaVersion: "latest", sourceType: "script" });
  } catch (error) {
    // The wrapper adds one line before the script; report the script's own line.
    if (isSyntaxError(error) && typeof error.message === "string") {
      const message = error.message.replace(/\((\d+):(\d+)\)$/, (_match, line, column) => "(" + Math.max(1, Number(line) - 1) + ":" + column + ")");
      if (typeof error.stack === "string") error.stack = error.stack.replace(error.message, message);
      error.message = message;
    }
    throw error;
  }
  const wrapper = workflowWrapperFunction(ast);
  walkWorkflowAst(wrapper.body, wrapper);
}

function workflowWrapperFunction(ast) {
  const wrapper = ast.body?.[0]?.expression?.callee;
  if (!wrapper || wrapper.type !== "ArrowFunctionExpression") throw new Error("workflowScript wrapper parse invariant failed.");
  return wrapper;
}

function isAsyncFunctionNode(node) {
  return node.async === true && (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression");
}

function walkWorkflowAst(node, allowedAsyncFunction) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkWorkflowAst(item, allowedAsyncFunction);
    return;
  }
  if (node !== allowedAsyncFunction && isAsyncFunctionNode(node)) {
    throw new Error(NESTED_ASYNC_WORKFLOW_ERROR);
  }
  for (const [key, child] of Object.entries(node)) {
    if (AST_SCALAR_KEYS.has(key)) continue;
    walkWorkflowAst(child, allowedAsyncFunction);
  }
}

function assertJsonValue(value, path = "emit", seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(path + " must contain only finite JSON numbers.");
    return;
  }
  if (typeof value !== "object") throw new Error(path + " must be a JSON value; received " + typeof value + ".");
  if (seen.has(value)) throw new Error(path + " must not contain cycles.");
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) throw new Error(path + " must not contain sparse array entries.");
      assertJsonValue(value[index], path + "[" + index + "]", seen);
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== Object.prototype && prototype !== contextObjectPrototype) throw new Error(path + " must contain only plain JSON objects.");
    if (Object.getOwnPropertySymbols(value).length > 0) throw new Error(path + " must not contain symbol keys.");
    for (const [key, entry] of Object.entries(value)) assertJsonValue(entry, path + "." + key, seen);
  }
  seen.delete(value);
}

function isPlainWorkflowObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype || prototype === contextObjectPrototype;
}

function unwrapRunsAllResults(value, seen = new Map()) {
  if (value === null || typeof value !== "object") return value;
  const runsAllTarget = runsAllResultTargets.get(value);
  const target = runsAllTarget || value;
  if (seen.has(target)) return seen.get(target);
  if (Array.isArray(target)) {
    const copy = [];
    seen.set(target, copy);
    let changed = !!runsAllTarget;
    for (let index = 0; index < target.length; index++) {
      copy[index] = unwrapRunsAllResults(target[index], seen);
      changed ||= copy[index] !== target[index];
    }
    return changed ? copy : target;
  }
  if (!isPlainWorkflowObject(target) || Object.getOwnPropertySymbols(target).length > 0) return target;
  let changed = false;
  const entries = Object.entries(target).map(([key, entry]) => {
    const unwrapped = unwrapRunsAllResults(entry, seen);
    changed ||= unwrapped !== entry;
    return [key, unwrapped];
  });
  return changed ? Object.fromEntries(entries) : target;
}

function omitUndefinedWorkflowValues(value, seen = new Set()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  const normalized = Array.isArray(value)
    ? value.map((entry) => entry === undefined ? null : omitUndefinedWorkflowValues(entry, seen))
    : isPlainWorkflowObject(value) && Object.getOwnPropertySymbols(value).length === 0
      ? Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => entry === undefined ? [] : [[key, omitUndefinedWorkflowValues(entry, seen)]]))
      : value;
  seen.delete(value);
  return normalized;
}

function deepFreezeWorkflowArgs(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreezeWorkflowArgs(entry);
  return Object.freeze(value);
}

parentPort.on("message", async (message) => {
  if (message.type === "response") {
    const entry = pending.get(message.callId);
    if (!entry) return;
    pending.delete(message.callId);
    if (message.ok) entry.resolve(message.value);
    else {
      const error = new Error(message.error);
      if (message.errorKind === "child" || message.errorKind === "detached-child") workflowErrorKinds.set(error, message.errorKind);
      entry.reject(error);
    }
    return;
  }
  if (message.type !== "start") return;
  try {
    const sandbox = { runs, Promise: workflowPromise, emit(value) { const unwrapped = unwrapRunsAllResults(value); const emittedValue = unwrapped === undefined ? null : omitUndefinedWorkflowValues(unwrapped); assertJsonValue(emittedValue); parentPort.postMessage({ type: "emit", value: emittedValue }); }, console: capturedConsole };
    if (message.stateEnabled) sandbox.state = state;
    const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
    contextObjectPrototype = vm.runInContext("Object.prototype", context);
    // Rebuild args inside the VM realm: a worker-realm object would expose the worker's unrestricted
    // Function through args.constructor.constructor, bypassing codeGeneration.strings: false.
    sandbox.args = deepFreezeWorkflowArgs(vm.runInContext("JSON.parse", context)(JSON.stringify(message.args ?? {})));
    let compiled;
    try {
      assertPortableWorkflowScript(message.script);
      compiled = new vm.Script("(async () => {\n" + message.script + "\n})()", { filename: "workflow-script.js", lineOffset: -1 });
    } catch (error) {
      parentPort.postMessage({ type: "error", errorKind: "validation", error: isSyntaxError(error) ? formatWorkflowScriptSyntaxError(error) : formatWorkflowScriptError(error) });
      return;
    }
    const nativePromisePrototype = vm.runInContext("(async () => {})().constructor.prototype", context);
    const nativeThenDescriptor = Object.getOwnPropertyDescriptor(nativePromisePrototype, "then");
    if (!nativeThenDescriptor || typeof nativeThenDescriptor.value !== "function") throw new Error("workflowScript could not inspect the VM Promise.prototype.then method.");
    const nativeThen = nativeThenDescriptor.value;
    let stopWorkflowPromiseHook;
    let value;
    try {
      // Some hosts freeze built-ins in every realm, which makes then read-only. The promise hooks
      // below still track observation, so skip the wrapper rather than fail every workflow.
      if (nativeThenDescriptor.configurable) Object.defineProperty(nativePromisePrototype, "then", {
        ...nativeThenDescriptor,
        value: function workflowPromiseThen(...args) {
          if (isDirectWorkflowScriptPromiseHandlerCall() || suppressNativePromiseConsumption > 0) {
            return withSuppressedNativePromiseConsumption(() => Reflect.apply(nativeThen, this, args));
          }
          return Reflect.apply(nativeThen, this, args);
        },
      });
      stopWorkflowPromiseHook = createWorkflowPromiseHook({
        before(promise) {
          activeNativePromises.push(promise);
        },
        after(promise) {
          const index = activeNativePromises.lastIndexOf(promise);
          if (index !== -1) activeNativePromises.splice(index, 1);
        },
        init(promise, parent) {
          const childTracker = nativePromiseTracker(promise);
          if (!parent) return;
          nativePromiseParents.set(promise, parent);
          const parentTracker = nativePromiseTracker(parent);
          addTrackerDependency(childTracker, parentTracker);
          const activePromise = activeNativePromises.at(-1);
          if (activePromise && activePromise !== parent) {
            addTrackerDependency(nativePromiseTracker(activePromise), parentTracker);
          } else if (!activePromise && suppressNativePromiseConsumption === 0) {
            markTrackedObservationsConsumed(parentTracker);
          }
        },
      });
      const workflowResultPromise = compiled.runInContext(context);
      topLevelWorkflowPromise = workflowResultPromise;
      markTrackedObservationsConsumed(nativePromiseTracker(workflowResultPromise));
      value = await workflowResultPromise;
    } finally {
      try {
        stopWorkflowPromiseHook?.();
      } finally {
        try {
          if (nativeThenDescriptor.configurable) Object.defineProperty(nativePromisePrototype, "then", nativeThenDescriptor);
        } finally {
          topLevelWorkflowPromise = undefined;
          activeNativePromises.length = 0;
          suppressNativePromiseConsumption = 0;
          nativePromiseTrackers = new WeakMap();
          nativePromiseParents = new WeakMap();
        }
      }
    }
    const persistedValue = value === undefined ? null : omitUndefinedWorkflowValues(value);
    try {
      assertJsonValue(persistedValue, "return");
    } catch (error) {
      parentPort.postMessage({ type: "error", errorKind: "return-serialization", errorPhase: "return-serialization", error: formatWorkflowScriptError(error) });
      return;
    }
    parentPort.postMessage({ type: "complete", value: persistedValue });
  } catch (error) {
    postWorkflowError(error);
  }
});
`;
function isWorkflowScriptFailureKind(value) {
  return value === "validation" || value === "script" || value === "child" || value === "return-serialization" || value === "timeout" || value === "detached-child" || value === "runtime";
}
function taggedWorkflowError(message, kind) {
  return Object.assign(new Error(message), { workflowErrorKind: kind });
}
var WorkflowScriptError = class extends Error {
  partial;
  errorKind;
  constructor(message, partial, errorKind, options) {
    super(message, options);
    this.name = "WorkflowScriptError";
    this.partial = partial;
    this.errorKind = errorKind;
  }
};
function combinedAbortSignal(signals) {
  const controller = new AbortController();
  const abort = (signal) => {
    if (controller.signal.aborted) return;
    controller.abort(signal.reason);
  };
  for (const signal of signals) {
    if (signal.aborted) {
      abort(signal);
      break;
    }
    signal.addEventListener("abort", () => abort(signal), { once: true });
  }
  return controller.signal;
}
function isRecord3(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function isAcceptanceMetadataRecovery(result) {
  return !result.ok && result.recovery?.status === "available-for-review" && result.recovery.reason === "acceptance-metadata-rejected";
}
var RECOVERY_REVIEW_MUTATION_VERB_PATTERN = /\b(?:add(?:ing)?|append(?:ing)?|apply(?:ing)?|cherry[ -]pick(?:ing)?|change|changing|clean(?:ing)?|commit(?:ting)?|cop(?:y|ying)|create|creating|delete|deleting|edit(?:ing)?|fix(?:ing)?|implement(?:ing)?|insert(?:ing)?|make|making|merge|merging|mov(?:e|ing)|modify(?:ing)?|mutate|mutating|open(?:ing)?|patch(?:ing)?|prepend(?:ing)?|push(?:ing)?|rebase|rebasing|refactor(?:ing)?|remove|removing|rename|renaming|replace|replacing|revert(?:ing)?|revise|revising|rewrite|rewriting|sav(?:e|ing)|stag(?:e|ing)|stash(?:ing)?|tag(?:ging)?|touch(?:ing)?|update|updating|write|writing)\b/i;
var RECOVERY_REVIEW_READ_ONLY_PATTERN = /\b(?:read[- ]only|review only|only return findings|return findings only|suggest fixes only|without\s+(?:editing|modifying|changing|writing|touching)|do not\s+(?:edit|modify|change|write|touch)|don't\s+(?:edit|modify|change|write|touch)|must not\s+(?:edit|modify|change|write|touch))\b/i;
var RECOVERY_REVIEW_NO_MUTATION_CLAUSE_PATTERN = /\b(?:do not|don't|must not)\s+(?:edit|modify|change|write|touch)(?:\s+files?)?(?:\s*,\s*(?:commit|push|comment|merge|launch(?:\s+subagents?)?)(?=\s*(?:,|\bor\b|[.;!?\n)]|$)))*(?:\s*,?\s*or\s+(?:commit|push|comment|merge|launch(?:\s+subagents?)?)(?=\s*(?:[.;!?\n)]|$)))?/gi;
var RECOVERY_REVIEW_DELIVERABLE_PATTERN = /\b(?:compose|create|draft|prepare|produce|write)\s+(?:(?:a|an|the|your)\s+)?(?:findings?|review|report|summary|analysis|recommendations?)(?:\s+(?:to|at|in)\s+\S+)?/gi;
var RECOVERY_REVIEW_CONTEXT_OBJECT_PATTERN = /\breview\s+(?:(?:the|this|that|saved)\s+)?(?:patch|diff|changes?|implementation|report)\b/gi;
var RECOVERY_REVIEW_MUTATION_NOUN_CONTEXT_PATTERN = /\b(?:later\s+real\s+)?update\s+imperatives?\b/gi;
var RECOVERY_REVIEW_PRIOR_FIX_CONTEXT_PATTERN = /\bthe\s+prior\s+fix\s+keeps\b/gi;
var RECOVERY_REVIEW_DETECTION_CONTEXT_PATTERN = /\b(?:mutation\s+detection\s+now\s+includes\s+move\/rename\/copy\s+file\s+mutation\s+imperatives|delegation\s+detection\s+now\s+blocks\s+get\/let\/have\/tell\/ask\s+follow-up\s+forms)(?=[,.;!?\n]|\b(?:and|but|then|however|nevertheless|nonetheless|yet)\b|$)/gi;
var RECOVERY_REVIEW_PATTERN_CHANGE_CONTEXT_PATTERN = /\bRECOVERY_REVIEW_MUTATION_VERB_PATTERN\s+now\s+includes\s+append,\s+prepend,\s+and\s+sav(?:e|ing)\b(?=\s*(?:[,.;!?\n)]|$))/gi;
var RECOVERY_REVIEW_GIT_PATTERN_CHANGE_CONTEXT_PATTERN = /\bfixed\s+mutating\s+git\s+follow-up\s+bypasses\b|\b(?:added|adding)\s+[a-z][a-z-]*(?:\/[a-z][a-z-]*)*(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)[a-z][a-z-]*(?:\/[a-z][a-z-]*)*)*\s+to\s+the\s+(?:mutation\s+imperative|mutating\s+git\s+command)\s+pattern\b|\band\s+[a-z][a-z-]*(?:\/[a-z][a-z-]*)*(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)[a-z][a-z-]*(?:\/[a-z][a-z-]*)*)*\s+to\s+the\s+mutating\s+git\s+command\s+pattern\b/gi;
var RECOVERY_REVIEW_VALIDATION_EVIDENCE_PATTERN = /\bvalidation(?:\s+after\s+fix)?\s*:/gi;
var RECOVERY_REVIEW_CONTRACT_PROHIBITION_PATTERN = /\b(?:do not|don't|must not)\s+(?:mutate\s+durable\s+state|launch\s+(?:mutating|destructive|mutating\/destructive)\s+work)(?:\s+or\s+(?:mutate\s+durable\s+state|launch\s+(?:mutating|destructive|mutating\/destructive)\s+work))*/gi;
var RECOVERY_REVIEW_ONLY_REVIEW_CONTRACT_PATTERN = /\bmay\s+only\s+launch\s+explicit\s+read-only\s+review\s+children\s+with\s+acceptance:false\b/gi;
var RECOVERY_REVIEW_BLOCKED_CONTEXT_FRAGMENT_PATTERN = /\bstate\.set, runs\.host, runs\.steer, ordinary\/mutating children, and destructive command wording are blocked(?=[,.;!?\n)\]}]|$)/gi;
var RECOVERY_REVIEW_REGRESSION_EVIDENCE_PATTERN = /\b(?:existing regressions cover plain rm and git clean\/reset\/restore|prior regressions covering rm\/git clean as evidence only)(?=[,.;!?\n)\]}]|$)/gi;
var RECOVERY_REVIEW_BLOCKED_QUOTED_EXAMPLE_PATTERN = /(?:`[^`\n]+`|'[^'\n]+'|"[^"\n]+")(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)(?:`[^`\n]+`|'[^'\n]+'|"[^"\n]+"))*\s+(?:is|are|remains?)\s+(?:blocked|(?:an?\s+)?blocked\s+examples?)(?=[,.;!?\n)\]}]|$)/gi;
var RECOVERY_REVIEW_CONTEXT_QUOTED_EXAMPLE_PATTERN = /\b(?:examples?|phrasing|forms|variants):\s*(?:`[^`\n]+`|'[^'\n]+'|"[^"\n]+")(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)(?:`[^`\n]+`|'[^'\n]+'|"[^"\n]+"))*/gi;
var RECOVERY_REVIEW_LISTED_BLOCKED_EXAMPLE_PATTERN = /(?:^|[.;!?\n]\s*)blocked\s+examples:\s*(?:\r?\n[ \t]*(?:[-*]|\d+[.)])\s+[^\r\n]+)+/gim;
var RECOVERY_REVIEW_BLOCKS_QUOTED_EXAMPLE_PATTERN = /\b(?:this\s+)?blocks?\s+examples?\s+like\s+(?:`[^`\n]+`|'[^'\n]+'|"[^"\n]+")(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)(?:`[^`\n]+`|'[^'\n]+'|"[^"\n]+"))*/gi;
var RECOVERY_REVIEW_EXAMPLES_LIKE_BLOCKED_PATTERN = /\bexamples?\s+like\s+(?:`[^`\n]+`|'[^'\n]+'|"[^"\n]+")(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)(?:`[^`\n]+`|'[^'\n]+'|"[^"\n]+"))*\s+(?:is|are|remains?)\s+blocked\b/gi;
var RECOVERY_REVIEW_QUOTED_VISIBLE_BLOCKED_PATTERN = /(?:\b(?:(?:the\s+)?examples?|commands?\s+hidden\s+in)\s+|(?:^|[\s([{]))(?:`[^`\n]+`|'[^'\n]+'|"[^"\n]+")(?:(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+)(?:`[^`\n]+`|'[^'\n]+'|"[^"\n]+"))*\s+(?:(?:is|are|remains?)\s+)?visible\s+and\s+blocked\b/gi;
var RECOVERY_REVIEW_PROMPTS_LIKE_BLOCKED_PATTERN = /\bdescribed\s+prompts?\s+like\s+Run\s+git\s+rebase\s+main,\s+git\s+rebase\s+main,\s+Run\s+git\s+cherry-pick\s+abc123,\s+cherry-pick\s+abc123,\s+and\s+Stage\s+the\s+changed\s+files\s+as\s+blocked\b/gi;
var RECOVERY_REVIEW_GIT_MUTATIONS_BROADER_CONTEXT_PATTERN = /\bpositive\s+git\s+mutations\s+are\s+broader:\s*git\s+branch\s+-D\s+old,\s+git\s+tag\s+-d\s+v1\.0,\s+git\s+stash,\s+git\s+revert\s+abc123,\s+and\s+natural\s+cherry\s+pick\s+abc123\s+now\s+trips?\s+the\s+recovery\s+barrier\b/gi;
var RECOVERY_REVIEW_GIT_COVERAGE_CONTEXT_PATTERN = /\bbroadened\s+positive\s+git\s+mutation\s+coverage\s+for\s+natural\s+`cherry\s+pick`,\s+`revert`,\s+`stash`,\s+`tag`,\s+plus\s+git\s+`branch\|revert\|stash\|tag`/gi;
var RECOVERY_REVIEW_REGRESSION_QUOTED_EXAMPLE_PATTERN = /\b(?:added\s+)?exact\s+regressions?\s+for\s+(?:`[^`\n]+`|'[^'\n]+'|"[^"\n]+")(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)(?:`[^`\n]+`|'[^'\n]+'|"[^"\n]+"))*/gi;
var RECOVERY_REVIEW_REGRESSION_ANAPHORIC_EXAMPLE_PATTERN = /\b(?:added\s+)?exact\s+regressions?\s+for\s+(?:do|run|execute|perform|apply)\s+(?:it|that|this|(?:the\s+)?(?:(?:previous(?:ly)?|prior|above|quoted|blocked)\s+){0,4}(?:command|example|operation|action|phrase|instruction|request))(?:[\s,]+(?:now|still|again|really|actually|immediately)){0,3}[\s,]+anyway(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)(?:do|run|execute|perform|apply)\s+(?:it|that|this|(?:the\s+)?(?:(?:previous(?:ly)?|prior|above|quoted|blocked)\s+){0,4}(?:command|example|operation|action|phrase|instruction|request))(?:[\s,]+(?:now|still|again|really|actually|immediately)){0,3}[\s,]+anyway)*/gi;
var RECOVERY_REVIEW_REGRESSION_FOLLOWED_BY_ANAPHORIC_PATTERN = /\badded\s+(?:exact\s+)?regressions?\s+for\s+quoted\s+rm\s+remaining\s+blocked\s+followed\s+by\s+execute\s+the\s+previous\s+command\b(?=\s*(?:[,.;!?\n)]|\bwhile\b|$))/gi;
var RECOVERY_REVIEW_REGRESSION_FOLLOWED_BY_NAMED_RM_PATTERN = /\b(?:added\s+)?(?:exact\s+)?regressions?\s+for\s+quoted\s+rm\s+remaining\s+blocked\s+followed\s+by\s+(?:do|run|execute|perform|apply)\s+(?:it|that|this|(?:the\s+)?(?:(?:previous(?:ly)?|prior|above|quoted|blocked)\s+){0,4}(?:command|example|operation|action|phrase|instruction|request))(?:[\s,]+(?:now|still|again|really|actually|immediately)){0,3}(?:[\s,]+anyway)?(?=\s*(?:[,.;!?\n)]|\bwhile\b|$))/gi;
var RECOVERY_REVIEW_BLOCKED_LIVE_VARIANT_CONTEXT_PATTERN = /\b(?:while\s+)?keeping\s+live-command\s+variants\s+such\s+as\s+followed\s+by\s+execute\s+the\s+previous\s+command\s+then\s+update\s+tests\s+blocked\b(?=\s*(?:[,.;!?\n)]|$))/gi;
var RECOVERY_REVIEW_ANAPHORIC_REFERENCES_CONTEXT_PATTERN = /\bdirect\s+anaphoric\s+references\s+now\s+include\s+numeric\s+and\s+word\s+ordinals\s+through\s+tenth\s+plus\s+one,\s+so\s+(?:do|run|execute|perform|apply)\s+(?:it|that|this|(?:the\s+)?(?:(?:\d+(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|next|previous(?:ly)?|prior|above|quoted|blocked)\s+){0,4}(?:command|example|operation|action|phrase|instruction|request|one))(?:[\s,]+(?:right|now|still|again|really|actually|immediately)){0,4}[\s,]+anyway(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)(?:do|run|execute|perform|apply)\s+(?:it|that|this|(?:the\s+)?(?:(?:\d+(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|next|previous(?:ly)?|prior|above|quoted|blocked)\s+){0,4}(?:command|example|operation|action|phrase|instruction|request|one))(?:[\s,]+(?:right|now|still|again|really|actually|immediately)){0,4}[\s,]+anyway)*\s+(?:is|are|remains?)\s+blocked\b(?:\s+after\s+quoted\s+destructive\s+examples\s+are\s+scrubbed)?/gi;
var RECOVERY_REVIEW_NO_ANAPHORIC_MUTATION_CLAUSE_PATTERN = /\b(?:do not|don't|must not)\s+(?:do|run|execute|perform|apply)\s+(?:it|that|this|(?:the\s+)?(?:(?:\d+(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|next|previous(?:ly)?|prior|above|quoted|blocked)\s+){0,4}(?:command|example|operation|action|phrase|instruction|request|one))(?:(?!\b(?:and|but|then|however|nevertheless|nonetheless|yet)\b)[^,.;!?\n—–-]){0,80}/gi;
var RECOVERY_REVIEW_NO_DELEGATION_CLAUSE_PATTERN = /\b(?:do not|don't|must not)\s+(?:(?:launch|start|spawn|run)\b(?:(?!\b(?:and|but|then|however|nevertheless|nonetheless|yet)\b)[^,.;!?\n])*(?:workers?|reviewers?|agents?|subagents?|children|child|runs?)|(?:get|let|request|hand\s+off|assign|use|have|tell)\b(?:(?!\b(?:and|but|then|however|nevertheless|nonetheless|yet)\b)[^,.;!?\n])*(?:workers?|reviewers?|agents?|subagents?|children|child)|(?:get|let|have|tell|request)\b(?:(?!\b(?:and|but|then|however|nevertheless|nonetheless|yet)\b)[^,.;!?\n])*(?:review|implementation|fix(?:es)?|changes?|follow-up)\b(?:(?!\b(?:and|but|then|however|nevertheless|nonetheless|yet)\b)[^,.;!?\n])*\b(?:from|with|via|by)\b(?:(?!\b(?:and|but|then|however|nevertheless|nonetheless|yet)\b)[^,.;!?\n])*(?:workers?|reviewers?|agents?|subagents?|children|child)|ask\b(?:(?!\b(?:and|but|then|however|nevertheless|nonetheless|yet)\b)[^,.;!?\n])*(?:(?:workers?|reviewers?|agents?|subagents?|children|child)\b(?:(?!\b(?:and|but|then|however|nevertheless|nonetheless|yet)\b)[^,.;!?\n])*\b(?:continue|implement|review|fix|edit|write|modify|change|patch|update|delete|remove|create|follow-up)|(?:review|implementation|fix(?:es)?|changes?|follow-up)\b(?:(?!\b(?:and|but|then|however|nevertheless|nonetheless|yet)\b)[^,.;!?\n])*\b(?:from|via)\b(?:(?!\b(?:and|but|then|however|nevertheless|nonetheless|yet)\b)[^,.;!?\n])*(?:workers?|reviewers?|agents?|subagents?|children|child)))\b/gi;
var RECOVERY_REVIEW_DELEGATION_PATTERN = /\b(?:launch|start|spawn|run)\b[^,.;!?\n]*(?:workers?|reviewers?|agents?|subagents?|children|child|runs?)\b|\b(?:delegate|hand\s+off|assign)\s+(?:remediation|implementation(?:\s+follow-up)?|changes?|fix(?:es)?|follow-up)\s+to\s+(?:(?:a|an|the)\s+)?(?:workers?|reviewers?|agents?|subagents?|children|child)\b|\b(?:get|let|have|tell|request)\b[^,.;!?\n]*(?:workers?|reviewers?|agents?|subagents?|children|child)\b[^,.;!?\n]*\b(?:continue|implement|review|fix|edit|write|modify|change|patch|update|delete|remove|create|follow-up)\b|\b(?:get|let|have|tell|request)\b[^,.;!?\n]*(?:review|implementation|fix(?:es)?|changes?|follow-up)\b[^,.;!?\n]*\b(?:from|with|via|by)\b[^,.;!?\n]*(?:workers?|reviewers?|agents?|subagents?|children|child)\b|\bask\b[^,.;!?\n]*(?:(?:workers?|reviewers?|agents?|subagents?|children|child)\b[^,.;!?\n]*\b(?:continue|implement|review|fix|edit|write|modify|change|patch|update|delete|remove|create|follow-up)|(?:review|implementation|fix(?:es)?|changes?|follow-up)\b[^,.;!?\n]*\b(?:from|via)\b[^,.;!?\n]*(?:workers?|reviewers?|agents?|subagents?|children|child))\b|\buse\b[^,.;!?\n]*(?:workers?|reviewers?|agents?|subagents?|children|child|runs?)\s+(?:for|to)\s+(?:implementation|follow-up|remediation|fix|edit|write|modify|change|patch|update|delete|remove|create)\b/i;
var RECOVERY_REVIEW_ANAPHORIC_MUTATION_PATTERN = /\b(?:do|run|execute|perform|apply)\s+(?:it|that|this|(?:the\s+)?(?:(?:\d+(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|next|previous(?:ly)?|prior|above|quoted|blocked)\s+){0,4}(?:command|example|operation|action|phrase|instruction|request|one))(?!(?:\s+(?:(?:now|still|also|already)\s+)*(?:is|are|remains?)\s+blocked\b))(?:(?:[\s,]+\w+){0,4}[\s,]+anyway|(?:(?!\b(?:and|but|then|however|nevertheless|nonetheless|yet)\b)[^,.;!?\n]){0,80})(?=\s*(?:[,.;!?\n)]|\b(?:and|but|then|however|nevertheless|nonetheless|yet)\b|$))/i;
var RECOVERY_REVIEW_DESTRUCTIVE_COMMAND_PATTERN = /(?:^|[\s;,.`'"([{])(?:\S*\/)?(?:rm|rmdir|unlink|truncate|mv|cp|chmod|chown)\b|\bgit\b(?:\s+(?:-[A-Za-z](?:\s+(?:"[^"\n]*"|'[^'\n]*'|\S+))?|--(?:git-dir|work-tree|namespace|exec-path|config-env)(?:=(?:"[^"\n]*"|'[^'\n]*'|\S+)|\s+(?:"[^"\n]*"|'[^'\n]*'|\S+))|--[A-Za-z0-9-]+(?:=(?:"[^"\n]*"|'[^'\n]*'|\S+))?))*\s+(?:add|branch|cherry-pick|clean|commit|merge|rebase|reset|restore|revert|stash|tag|checkout|switch)\b/i;
var RECOVERY_REVIEW_DASH_LIVE_ACTION_PATTERN = /(?:[—–]|--|\s-\s|:|\s\/\s)\s*(?:then\s+)?(?:(?:add|append|apply|change|cherry[ -]pick|clean|commit|copy|create|delete|edit|fix|implement|insert|make|merge|move|modify|mutate|open|patch|prepend|push|rebase|refactor|remove|rename|replace|revert|revise|rewrite|save|stage|stash|tag|touch|update|write)\b|(?:launch|start|spawn|run)\b[^,.;!?\n]*(?:workers?|reviewers?|agents?|subagents?|children|child|runs?)\b|(?:\S*\/)?(?:rm|rmdir|unlink|truncate|mv|cp|chmod|chown)\b|git\b[^,.;!?\n]*\b(?:add|branch|cherry-pick|clean|commit|merge|rebase|reset|restore|revert|stash|tag|checkout|switch)\b)/i;
function isExplicitReadOnlyRecoveryReview(params) {
  const agent = typeof params.agent === "string" ? params.agent.trim() : "";
  const task = typeof params.task === "string" ? params.task.trim() : "";
  const taskDestructiveCommandText = task.replace(RECOVERY_REVIEW_BLOCKED_CONTEXT_FRAGMENT_PATTERN, " ").replace(RECOVERY_REVIEW_REGRESSION_EVIDENCE_PATTERN, " ").replace(RECOVERY_REVIEW_BLOCKED_QUOTED_EXAMPLE_PATTERN, " ").replace(RECOVERY_REVIEW_CONTEXT_QUOTED_EXAMPLE_PATTERN, " ").replace(RECOVERY_REVIEW_LISTED_BLOCKED_EXAMPLE_PATTERN, " ").replace(RECOVERY_REVIEW_BLOCKS_QUOTED_EXAMPLE_PATTERN, " ").replace(RECOVERY_REVIEW_EXAMPLES_LIKE_BLOCKED_PATTERN, " ").replace(RECOVERY_REVIEW_QUOTED_VISIBLE_BLOCKED_PATTERN, " ").replace(RECOVERY_REVIEW_PROMPTS_LIKE_BLOCKED_PATTERN, " ").replace(RECOVERY_REVIEW_GIT_MUTATIONS_BROADER_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_GIT_COVERAGE_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_REGRESSION_FOLLOWED_BY_NAMED_RM_PATTERN, " ");
  const taskDashLiveActionText = task.replace(RECOVERY_REVIEW_DELIVERABLE_PATTERN, " ").replace(RECOVERY_REVIEW_CONTEXT_OBJECT_PATTERN, " ").replace(RECOVERY_REVIEW_MUTATION_NOUN_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_PRIOR_FIX_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_DETECTION_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_PATTERN_CHANGE_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_GIT_PATTERN_CHANGE_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_VALIDATION_EVIDENCE_PATTERN, " ").replace(RECOVERY_REVIEW_CONTRACT_PROHIBITION_PATTERN, " ").replace(RECOVERY_REVIEW_ONLY_REVIEW_CONTRACT_PATTERN, " ").replace(RECOVERY_REVIEW_BLOCKED_QUOTED_EXAMPLE_PATTERN, " ").replace(RECOVERY_REVIEW_CONTEXT_QUOTED_EXAMPLE_PATTERN, " ").replace(RECOVERY_REVIEW_LISTED_BLOCKED_EXAMPLE_PATTERN, " ").replace(RECOVERY_REVIEW_BLOCKS_QUOTED_EXAMPLE_PATTERN, " ").replace(RECOVERY_REVIEW_EXAMPLES_LIKE_BLOCKED_PATTERN, " ").replace(RECOVERY_REVIEW_QUOTED_VISIBLE_BLOCKED_PATTERN, " ").replace(RECOVERY_REVIEW_PROMPTS_LIKE_BLOCKED_PATTERN, " ").replace(RECOVERY_REVIEW_GIT_MUTATIONS_BROADER_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_GIT_COVERAGE_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_REGRESSION_QUOTED_EXAMPLE_PATTERN, " ").replace(RECOVERY_REVIEW_REGRESSION_ANAPHORIC_EXAMPLE_PATTERN, " ").replace(RECOVERY_REVIEW_REGRESSION_FOLLOWED_BY_ANAPHORIC_PATTERN, " ").replace(RECOVERY_REVIEW_BLOCKED_LIVE_VARIANT_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_ANAPHORIC_REFERENCES_CONTEXT_PATTERN, " ");
  const taskMutationText = task.replace(RECOVERY_REVIEW_DELIVERABLE_PATTERN, " ").replace(RECOVERY_REVIEW_CONTEXT_OBJECT_PATTERN, " ").replace(RECOVERY_REVIEW_MUTATION_NOUN_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_PRIOR_FIX_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_DETECTION_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_PATTERN_CHANGE_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_GIT_PATTERN_CHANGE_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_VALIDATION_EVIDENCE_PATTERN, " ").replace(RECOVERY_REVIEW_CONTRACT_PROHIBITION_PATTERN, " ").replace(RECOVERY_REVIEW_ONLY_REVIEW_CONTRACT_PATTERN, " ").replace(RECOVERY_REVIEW_BLOCKED_CONTEXT_FRAGMENT_PATTERN, " ").replace(RECOVERY_REVIEW_REGRESSION_EVIDENCE_PATTERN, " ").replace(RECOVERY_REVIEW_BLOCKED_QUOTED_EXAMPLE_PATTERN, " ").replace(RECOVERY_REVIEW_CONTEXT_QUOTED_EXAMPLE_PATTERN, " ").replace(RECOVERY_REVIEW_LISTED_BLOCKED_EXAMPLE_PATTERN, " ").replace(RECOVERY_REVIEW_BLOCKS_QUOTED_EXAMPLE_PATTERN, " ").replace(RECOVERY_REVIEW_EXAMPLES_LIKE_BLOCKED_PATTERN, " ").replace(RECOVERY_REVIEW_QUOTED_VISIBLE_BLOCKED_PATTERN, " ").replace(RECOVERY_REVIEW_PROMPTS_LIKE_BLOCKED_PATTERN, " ").replace(RECOVERY_REVIEW_GIT_MUTATIONS_BROADER_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_GIT_COVERAGE_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_REGRESSION_QUOTED_EXAMPLE_PATTERN, " ").replace(RECOVERY_REVIEW_REGRESSION_ANAPHORIC_EXAMPLE_PATTERN, " ").replace(RECOVERY_REVIEW_REGRESSION_FOLLOWED_BY_ANAPHORIC_PATTERN, " ").replace(RECOVERY_REVIEW_BLOCKED_LIVE_VARIANT_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_ANAPHORIC_REFERENCES_CONTEXT_PATTERN, " ").replace(RECOVERY_REVIEW_NO_ANAPHORIC_MUTATION_CLAUSE_PATTERN, " ").replace(RECOVERY_REVIEW_NO_DELEGATION_CLAUSE_PATTERN, " ").replace(RECOVERY_REVIEW_NO_MUTATION_CLAUSE_PATTERN, " ").replace(new RegExp(RECOVERY_REVIEW_READ_ONLY_PATTERN.source, "gi"), " ");
  return params.acceptance === false && agent !== "" && /\b(?:advisor|oracle|review|reviewer)\b/i.test(agent) && RECOVERY_REVIEW_READ_ONLY_PATTERN.test(task) && !RECOVERY_REVIEW_DESTRUCTIVE_COMMAND_PATTERN.test(taskDestructiveCommandText) && !RECOVERY_REVIEW_MUTATION_VERB_PATTERN.test(taskMutationText) && !RECOVERY_REVIEW_DELEGATION_PATTERN.test(taskMutationText) && !RECOVERY_REVIEW_ANAPHORIC_MUTATION_PATTERN.test(taskMutationText) && !RECOVERY_REVIEW_DESTRUCTIVE_COMMAND_PATTERN.test(taskMutationText) && !RECOVERY_REVIEW_DASH_LIVE_ACTION_PATTERN.test(taskDashLiveActionText);
}
function recoveryBarrierMessage(sourceKey, target) {
  return `Run '${target}' cannot launch after run '${sourceKey}' returned rejected acceptance recovery; only explicit read-only review children with acceptance:false may follow.`;
}
function isPlainJsonObject(value) {
  if (!isRecord3(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}
function parseWorkflowResumeReference(value) {
  if (!isRecord3(value)) return void 0;
  const fields = Object.keys(value);
  if (fields.some((field) => field !== "workflowRunId" && field !== "key" && field !== "latest")) throw new Error("keyed resume contains unsupported fields.");
  if (typeof value.workflowRunId !== "string" || !value.workflowRunId.trim()) throw new Error("keyed resume workflowRunId must be non-empty.");
  const key = validateKey(value.key, "keyed resume");
  if (value.latest !== true) throw new Error("keyed resume requires latest: true.");
  return { workflowRunId: value.workflowRunId.trim(), key, latest: true };
}
function omitUndefinedWorkflowValues(value, seen = /* @__PURE__ */ new Set()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  const normalized = Array.isArray(value) ? value.map((entry) => entry === void 0 ? null : omitUndefinedWorkflowValues(entry, seen)) : isPlainJsonObject(value) ? Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => entry === void 0 ? [] : [[key, omitUndefinedWorkflowValues(entry, seen)]])) : value;
  seen.delete(value);
  return normalized;
}
function omitNonJsonWorkflowResultMetadata(value) {
  const normalized = omitUndefinedWorkflowValues(value);
  if (!isPlainJsonObject(normalized) || !Object.hasOwn(normalized, "results")) return normalized;
  try {
    assertWorkflowJsonValue(normalized.results, "runs.run result.results");
    return normalized;
  } catch {
    const { results: _results, ...safeResult } = normalized;
    return safeResult;
  }
}
function assertWorkflowJsonValue(value, path17 = "value", seen = /* @__PURE__ */ new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path17} must contain only finite JSON numbers.`);
    return;
  }
  if (typeof value !== "object") throw new Error(`${path17} must be a JSON value; received ${typeof value}.`);
  if (seen.has(value)) throw new Error(`${path17} must not contain cycles.`);
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) throw new Error(`${path17} must not contain sparse array entries.`);
      assertWorkflowJsonValue(value[index], `${path17}[${index}]`, seen);
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== Object.prototype) throw new Error(`${path17} must contain only plain JSON objects.`);
    if (Object.getOwnPropertySymbols(value).length > 0) throw new Error(`${path17} must not contain symbol keys.`);
    for (const [key, entry] of Object.entries(value)) assertWorkflowJsonValue(entry, `${path17}.${key}`, seen);
  }
  seen.delete(value);
}
function formatWorkflowJsonPreview(value, maxLength) {
  try {
    assertWorkflowJsonValue(value);
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") return void 0;
    return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}\u2026` : serialized;
  } catch {
    return void 0;
  }
}
function workflowReturnRecoveryHint(children) {
  if (children.length === 0) return " Return only plain JSON data. For a child result, select fields such as { runId: child.runId, ok: child.ok, outputReference: child.outputReference }.";
  const references = children.slice(0, 10).map((child) => {
    const fields = [child.runId ? `runId=${child.runId.slice(0, 500)}` : void 0, child.outputReference ? `outputReference=${child.outputReference.slice(0, 500)}` : void 0, child.artifactPaths[0] ? `artifact=${child.artifactPaths[0].slice(0, 500)}` : void 0].filter((field) => field !== void 0);
    return `'${child.key}'${fields.length > 0 ? ` (${fields.join(", ")})` : ""}`;
  });
  return ` ${children.some((child) => child.state === "running") ? "Child calls returned before return serialization failed; launch receipts do not prove completion." : "Child work completed before return serialization failed."} Recover outputs from: ${references.join(", ")}${children.length > references.length ? `, and ${children.length - references.length} more` : ""}. Return a plain projection such as { runId: child.runId, ok: child.ok, outputReference: child.outputReference }.`;
}
function previewSimpleWorkflowRun(script) {
  const body = script?.match(/^\s*return\s+(?:await\s+)?runs\.run\s*\(\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`$\\]*`)\s*,\s*\{([\s\S]*)\}\s*\)\s*;?\s*$/)?.[1];
  if (body === void 0) return void 0;
  const readProperty = (name) => {
    const match = body.match(new RegExp(`(?:^|,)\\s*(?:${name}|["']${name}["'])\\s*:\\s*("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`[^\`$\\\\]*\`)`));
    if (!match?.[1]) return void 0;
    const literal = match[1];
    if (literal.startsWith('"')) {
      try {
        return JSON.parse(literal);
      } catch {
        return void 0;
      }
    }
    if (literal.slice(1, -1).includes("\\")) return void 0;
    return literal.slice(1, -1);
  };
  const agent = readProperty("agent");
  const task = readProperty("task");
  return { ...agent !== void 0 ? { agent } : {}, ...task !== void 0 ? { task } : {} };
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord3(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
function canonicalRunParams(params) {
  if (params.gate === void 0 || params.acceptance !== false) return params;
  const { acceptance: _acceptance, ...withoutAcceptance } = params;
  return withoutAcceptance;
}
function workflowRunParamsFingerprint(params) {
  return stableJson(canonicalRunParams(params));
}
function validateKey(value, owner = "runs.run") {
  if (typeof value !== "string" || !KEY_PATTERN.test(value)) {
    throw new Error(`${owner} key must be 1-128 characters using letters, numbers, '.', '_' or '-', and start with a letter or number.`);
  }
  return value;
}
var AST_LOCATION_KEYS = /* @__PURE__ */ new Set(["type", "start", "end", "loc", "range"]);
function astNode(value) {
  return Boolean(value) && typeof value === "object" && typeof value.type === "string";
}
function literalString(node) {
  if (!astNode(node)) return void 0;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && Array.isArray(node.expressions) && node.expressions.length === 0 && Array.isArray(node.quasis)) {
    const first = node.quasis[0];
    if (typeof first?.value?.cooked === "string") return first.value.cooked;
  }
  return void 0;
}
function directRunsCall(node, method) {
  if (!astNode(node) || node.type !== "CallExpression" || !astNode(node.callee) || node.callee.type !== "MemberExpression") return false;
  const property = node.callee.computed === true ? literalString(node.callee.property) : astNode(node.callee.property) && node.callee.property.type === "Identifier" ? node.callee.property.name : void 0;
  return property === method && astNode(node.callee.object) && node.callee.object.type === "Identifier" && node.callee.object.name === "runs";
}
function validateStaticHostCall(call) {
  const args = Array.isArray(call.arguments) ? call.arguments : [];
  const keyNode = astNode(args[0]) ? args[0] : void 0;
  const params = astNode(args[1]) ? args[1] : void 0;
  const errors = [];
  const key = literalString(keyNode);
  if (keyNode && key !== void 0 && !KEY_PATTERN.test(key)) errors.push({ message: "runs.host key must be 1-128 characters using letters, numbers, '.', '_' or '-', and start with a letter or number.", ...nodeLocation(keyNode) });
  if (!params || params.type !== "ObjectExpression" || !Array.isArray(params.properties) || params.properties.some((property) => !astNode(property) || property.type !== "Property")) return errors;
  const allowed = /* @__PURE__ */ new Set(["kind", "command", "timeoutMs", "output", "role", "provider"]);
  for (const property of params.properties) {
    if (!astNode(property)) continue;
    const name = staticPropertyKey(property);
    if (name !== void 0 && !allowed.has(name)) errors.push({ message: name === "cwd" ? "runs.host params contain unsupported field 'cwd'. The host step does not accept per-step cwd; commands and relative output paths use the workflow cwd. Set cwd on the outer subagent request, or put a trusted directory change in command (for example, 'cd /path/to/worktree && npm test')." : `runs.host params contain unsupported field '${name}'.`, ...nodeLocation(property) });
  }
  const kindNode = directObjectPropertyValue(params, "kind");
  const commandNode = directObjectPropertyValue(params, "command");
  const timeoutNode = directObjectPropertyValue(params, "timeoutMs");
  const kind = literalString(kindNode);
  const command = literalString(commandNode);
  const timeout = astNode(timeoutNode) && timeoutNode.type === "Literal" ? timeoutNode.value : void 0;
  if (!kindNode) errors.push({ message: "runs.host params require kind: 'command'.", ...nodeLocation(params) });
  else if (kind !== void 0 && kind !== "command") errors.push({ message: "runs.host params kind must be 'command'.", ...nodeLocation(kindNode) });
  if (!commandNode) errors.push({ message: "runs.host params require command.", ...nodeLocation(params) });
  else if (command !== void 0 && !command.trim()) errors.push({ message: "runs.host params command must be non-empty.", ...nodeLocation(commandNode) });
  if (!timeoutNode) errors.push({ message: "runs.host params require timeoutMs.", ...nodeLocation(params) });
  else if (typeof timeout === "number" && (!Number.isInteger(timeout) || timeout < 1)) errors.push({ message: "runs.host params timeoutMs must be a positive integer.", ...nodeLocation(timeoutNode) });
  const outputNode = directObjectPropertyValue(params, "output");
  const output = literalString(outputNode);
  if (outputNode && output !== void 0 && (!output.trim() || /^[/\\]|(?:^|[/\\])\.\.(?:[/\\]|$)/.test(output))) errors.push({ message: "runs.host params output must be a non-empty relative path without traversal.", ...nodeLocation(outputNode) });
  const roleNode = directObjectPropertyValue(params, "role");
  const role = literalString(roleNode);
  if (roleNode && role !== void 0 && role !== "ci" && role !== "gate") errors.push({ message: "runs.host params role must be 'ci' or 'gate'.", ...nodeLocation(roleNode) });
  return errors;
}
function nodeLocation(node) {
  return node.loc ? { line: Math.max(1, node.loc.start.line - 1), column: node.loc.start.column + 1 } : {};
}
function walkAst(node, visit, includeNestedFunctions = true) {
  if (Array.isArray(node)) {
    for (const item of node) walkAst(item, visit, includeNestedFunctions);
    return;
  }
  if (!astNode(node)) return;
  visit(node);
  if (!includeNestedFunctions && (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression")) return;
  for (const [key, child] of Object.entries(node)) {
    if (!AST_LOCATION_KEYS.has(key)) walkAst(child, visit, includeNestedFunctions);
  }
}
function bindingPatternContainsName(node, name) {
  if (!astNode(node)) return false;
  if (node.type === "Identifier") return node.name === name;
  if (node.type === "RestElement") return bindingPatternContainsName(node.argument, name);
  if (node.type === "AssignmentPattern") return bindingPatternContainsName(node.left, name);
  if (node.type === "ArrayPattern" && Array.isArray(node.elements)) return node.elements.some((element) => bindingPatternContainsName(element, name));
  if (node.type === "ObjectPattern" && Array.isArray(node.properties)) return node.properties.some((property) => {
    if (!astNode(property)) return false;
    return property.type === "RestElement" ? bindingPatternContainsName(property.argument, name) : property.type === "Property" && bindingPatternContainsName(property.value, name);
  });
  return false;
}
function definitelyReassignsBinding(node, name) {
  let assignment = node;
  while (astNode(assignment) && assignment.type === "AssignmentExpression" && assignment.operator !== "&&=" && assignment.operator !== "||=" && assignment.operator !== "??=") {
    if (bindingPatternContainsName(assignment.left, name)) return true;
    assignment = assignment.right;
  }
  return false;
}
function lexicalDeclarationContainsName(node, name) {
  if (!astNode(node)) return false;
  if (node.type === "VariableDeclaration" && node.kind !== "var" && Array.isArray(node.declarations)) {
    return node.declarations.some((declaration) => astNode(declaration) && bindingPatternContainsName(declaration.id, name));
  }
  return (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && bindingPatternContainsName(node.id, name);
}
function scopeShadowsIdentifier(node, name) {
  if (node.type === "BlockStatement" && Array.isArray(node.body)) return node.body.some((statement) => lexicalDeclarationContainsName(statement, name));
  if (node.type === "CatchClause") return bindingPatternContainsName(node.param, name);
  if (node.type === "ForStatement") return lexicalDeclarationContainsName(node.init, name);
  if (node.type === "ForInStatement" || node.type === "ForOfStatement") return lexicalDeclarationContainsName(node.left, name);
  if (node.type === "SwitchStatement" && Array.isArray(node.cases)) {
    return node.cases.some((entry) => astNode(entry) && Array.isArray(entry.consequent) && entry.consequent.some((statement) => lexicalDeclarationContainsName(statement, name)));
  }
  return false;
}
function walkAstWithoutShadowedIdentifier(node, name, visit) {
  if (Array.isArray(node)) {
    for (const item of node) walkAstWithoutShadowedIdentifier(item, name, visit);
    return;
  }
  if (!astNode(node) || scopeShadowsIdentifier(node, name)) return;
  visit(node);
  if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") return;
  for (const [key, child] of Object.entries(node)) {
    if (!AST_LOCATION_KEYS.has(key)) walkAstWithoutShadowedIdentifier(child, name, visit);
  }
}
function definitelyNonJson(node, normalizeUndefined = false) {
  if (node.type === "Literal") {
    if (typeof node.bigint === "string") return "BigInt values are not JSON-representable";
    if (node.regex !== void 0) return "regular expressions are not JSON-representable";
    return void 0;
  }
  if (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") return "functions are not JSON-representable";
  if (node.type === "Identifier" && node.name === "undefined") return normalizeUndefined ? void 0 : "undefined is not JSON-representable";
  if (node.type === "UnaryExpression" && node.operator === "void") return normalizeUndefined ? void 0 : "undefined is not JSON-representable";
  if (node.type === "ArrayExpression" && Array.isArray(node.elements)) {
    if (node.elements.some((entry) => entry === null)) return "sparse arrays are not JSON-representable";
    for (const entry of node.elements) if (astNode(entry)) {
      const error = definitelyNonJson(entry, normalizeUndefined);
      if (error) return error;
    }
  }
  if (node.type === "ObjectExpression" && Array.isArray(node.properties)) {
    const values = /* @__PURE__ */ new Map();
    for (const property of node.properties) {
      if (!astNode(property) || property.type !== "Property" || !astNode(property.value) || property.kind !== "init") return void 0;
      const key = staticPropertyKey(property);
      if (key === void 0) return void 0;
      values.set(key, property.value);
    }
    for (const value of values.values()) {
      const error = definitelyNonJson(value, normalizeUndefined);
      if (error) return error;
    }
  }
  return void 0;
}
function staticPropertyKey(property) {
  return property.computed === true ? literalString(property.key) : literalString(property.key) ?? (astNode(property.key) && property.key.type === "Identifier" ? property.key.name : void 0);
}
function directObjectPropertyValue(node, name) {
  if (node.type !== "ObjectExpression" || !Array.isArray(node.properties)) return void 0;
  let value;
  for (const property of node.properties) {
    if (!astNode(property) || property.type !== "Property" || !astNode(property.value)) continue;
    if (staticPropertyKey(property) === name) value = property.value;
  }
  return value;
}
function validateStaticBaseRef(params, owner) {
  if (params.type !== "ObjectExpression" || !Array.isArray(params.properties)) return [];
  for (let index = params.properties.length - 1; index >= 0; index--) {
    const property = params.properties[index];
    if (!astNode(property) || property.type !== "Property") return [];
    const key = staticPropertyKey(property);
    if (key === void 0) return [];
    if (key !== "baseRef") continue;
    if (property.kind !== "init" || !astNode(property.value)) return [];
    const valueNode = property.value;
    const value = literalString(valueNode);
    if ((value !== void 0 || valueNode.type === "Literal") && !validGitRef(value)) {
      return [{ message: `${owner} ${BASE_REF_VALIDATION_ERROR}`, ...nodeLocation(valueNode) }];
    }
    return [];
  }
  return [];
}
function staticChildAgentNode(params) {
  if (!astNode(params) || params.type !== "ObjectExpression" || !Array.isArray(params.properties)) return void 0;
  let agent;
  for (const property of params.properties) {
    if (!astNode(property) || property.type !== "Property") return void 0;
    const key = staticPropertyKey(property);
    if (key === void 0 || key === "cwd" || key === "agentScope" || key === "resume") return void 0;
    if (key === "agent") agent = property.kind === "init" && astNode(property.value) ? property.value : void 0;
  }
  return literalString(agent) === void 0 ? void 0 : agent;
}
function validateStaticChildAgents(call, agentNameError) {
  const args = Array.isArray(call.arguments) ? call.arguments : [];
  const elements = (node) => astNode(node) && node.type === "ArrayExpression" && Array.isArray(node.elements) ? node.elements : [];
  const staticLane = (lane) => astNode(lane) && lane.type === "ObjectExpression" && Array.isArray(lane.properties) && lane.properties.every((property) => astNode(property) && property.type === "Property" && staticPropertyKey(property) !== void 0);
  const children = directRunsCall(call, "run") ? [{ owner: "runs.run", params: args[1] }] : directRunsCall(call, "all") ? elements(args[0]).map((params) => ({ owner: "runs.all item", params })) : directRunsCall(call, "lanes") ? elements(args[0]).flatMap((lane) => staticLane(lane) ? elements(directObjectPropertyValue(lane, "stages")).map((params) => ({ owner: "runs.lanes stage", params })) : []) : [];
  const errors = [];
  for (const child of children) {
    const agentNode = staticChildAgentNode(child.params);
    const agentName = literalString(agentNode);
    const error = agentName === void 0 ? void 0 : agentNameError(agentName);
    if (agentNode && error) errors.push({ kind: "agent", message: `${child.owner}: ${error}`, ...nodeLocation(agentNode) });
  }
  return errors;
}
function directRunsAllKeys(call) {
  const args = Array.isArray(call.arguments) ? call.arguments : [];
  const items = astNode(args[0]) && args[0].type === "ArrayExpression" && Array.isArray(args[0].elements) ? args[0].elements : [];
  return items.flatMap((item) => {
    if (!astNode(item)) return [];
    const keyNode = directObjectPropertyValue(item, "key");
    const key = literalString(keyNode);
    return keyNode && key !== void 0 ? [{ key, node: keyNode }] : [];
  });
}
function containsWorkflowLaunch(node) {
  let found = false;
  walkAst(node, (candidate) => {
    if (directRunsCall(candidate, "run") || directRunsCall(candidate, "all") || directRunsCall(candidate, "lanes")) found = true;
  });
  return found;
}
function containsRunsIdentifier(node) {
  let found = false;
  walkAst(node, (candidate) => {
    if (candidate.type === "Identifier" && candidate.name === "runs") found = true;
  });
  return found;
}
function invalidatesRunsBinding(workflowBody) {
  let invalidated = false;
  walkAst(workflowBody, (node) => {
    if ((node.type === "VariableDeclarator" || node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ClassDeclaration" || node.type === "ClassExpression") && containsRunsIdentifier(node.id)) invalidated = true;
    if ((node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") && Array.isArray(node.params) && node.params.some(containsRunsIdentifier)) invalidated = true;
    if (node.type === "CatchClause" && containsRunsIdentifier(node.param)) invalidated = true;
    if ((node.type === "AssignmentExpression" || node.type === "UpdateExpression") && containsRunsIdentifier(node.left ?? node.argument)) invalidated = true;
  });
  return invalidated;
}
function containsAbruptControl(node) {
  let found = false;
  walkAst(node, (candidate) => {
    if (candidate !== node && (candidate.type === "ReturnStatement" || candidate.type === "ThrowStatement" || candidate.type === "BreakStatement" || candidate.type === "ContinueStatement")) found = true;
  }, false);
  return found;
}
function directLaunchCall(expression) {
  if (!astNode(expression)) return void 0;
  const candidate = expression.type === "AwaitExpression" && astNode(expression.argument) ? expression.argument : expression;
  return directRunsCall(candidate, "run") || directRunsCall(candidate, "all") ? candidate : void 0;
}
function staticWorkflowLaunchPlan(workflowBody) {
  if (workflowBody.type !== "BlockStatement" || !Array.isArray(workflowBody.body) || invalidatesRunsBinding(workflowBody)) {
    return { keys: [], dynamic: containsWorkflowLaunch(workflowBody) };
  }
  const keys = /* @__PURE__ */ new Set();
  let dynamic = false;
  let remainderUncertain = false;
  const addCall = (call) => {
    const args = Array.isArray(call.arguments) ? call.arguments : [];
    let nestedLaunch = false;
    for (const argument of args) walkAst(argument, (node) => {
      if (node !== call && (directRunsCall(node, "run") || directRunsCall(node, "all") || directRunsCall(node, "lanes"))) nestedLaunch = true;
    });
    if (nestedLaunch) {
      dynamic = true;
      return;
    }
    if (directRunsCall(call, "run")) {
      const key = literalString(args[0]);
      if (key === void 0) dynamic = true;
      else keys.add(key);
      return;
    }
    const array = astNode(args[0]) && args[0].type === "ArrayExpression" && Array.isArray(args[0].elements) ? args[0] : void 0;
    if (!array) {
      dynamic = true;
      return;
    }
    const batchKeys = [];
    for (const item of array.elements) {
      if (!astNode(item) || item.type !== "ObjectExpression" || !Array.isArray(item.properties) || item.properties.some((property) => !astNode(property) || property.type !== "Property" || staticPropertyKey(property) === void 0)) {
        dynamic = true;
        return;
      }
      const key = literalString(directObjectPropertyValue(item, "key"));
      if (key === void 0) {
        dynamic = true;
        return;
      }
      batchKeys.push(key);
    }
    for (const key of batchKeys) keys.add(key);
  };
  for (const statement of workflowBody.body) {
    if (!astNode(statement)) continue;
    if (remainderUncertain) {
      if (containsWorkflowLaunch(statement)) dynamic = true;
      continue;
    }
    const expressions = [];
    if (statement.type === "VariableDeclaration" && Array.isArray(statement.declarations)) {
      for (const declaration of statement.declarations) if (astNode(declaration)) expressions.push(declaration.init);
    } else if (statement.type === "ExpressionStatement") expressions.push(statement.expression);
    else if (statement.type === "ReturnStatement" || statement.type === "ThrowStatement") expressions.push(statement.argument);
    let handledLaunch = false;
    for (const expression of expressions) {
      const call = directLaunchCall(expression);
      if (call) {
        addCall(call);
        handledLaunch = true;
      } else if (containsWorkflowLaunch(expression)) dynamic = true;
    }
    if (!handledLaunch && expressions.length === 0 && containsWorkflowLaunch(statement)) dynamic = true;
    if (statement.type === "ReturnStatement" || statement.type === "ThrowStatement") remainderUncertain = true;
    else if (containsAbruptControl(statement)) remainderUncertain = true;
  }
  return { keys: [...keys], dynamic };
}
function validateWorkflowScript(script, options = {}) {
  const errors = [];
  if (!script.trim()) return { ok: false, errors: [{ message: "workflowScript must not be empty." }] };
  let root;
  try {
    const parser = requireFromPackage(resolveWorkflowParserEntry());
    root = parser.parse(`(async () => {
${script}
})()`, { ecmaVersion: "latest", sourceType: "script", locations: true });
  } catch (error) {
    const location = error && typeof error === "object" && "loc" in error && error.loc && typeof error.loc === "object" ? error.loc : void 0;
    const message = (error instanceof Error ? error.message : String(error)).replace(/\s+\(\d+:\d+\)$/, "");
    return { ok: false, errors: [{ message, ...typeof location?.line === "number" ? { line: Math.max(1, location.line - 1) } : {}, ...typeof location?.column === "number" ? { column: location.column + 1 } : {} }] };
  }
  const wrapper = astNode(root.body) ? void 0 : Array.isArray(root.body) && astNode(root.body[0]) && astNode(root.body[0].expression) && astNode(root.body[0].expression.callee) ? root.body[0].expression.callee : void 0;
  const workflowBody = wrapper && astNode(wrapper.body) ? wrapper.body : root;
  const agentNameError = options.agentNameError && !invalidatesRunsBinding(workflowBody) ? options.agentNameError : void 0;
  walkAst(workflowBody, (node) => {
    if (node !== wrapper && node.async === true && (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression")) {
      errors.push({ message: "workflowScript does not support nested async functions. Use top-level await, plain helper functions that return runs.run(...), or explicit Promise chains.", ...nodeLocation(node) });
    }
    if (directRunsCall(node, "run")) {
      const args = Array.isArray(node.arguments) ? node.arguments : [];
      const keyNode = astNode(args[0]) ? args[0] : void 0;
      const key = literalString(keyNode);
      if (keyNode && key !== void 0 && !KEY_PATTERN.test(key)) errors.push({ message: "runs.run key must be 1-128 characters using letters, numbers, '.', '_' or '-', and start with a letter or number.", ...nodeLocation(keyNode) });
      if (astNode(args[1])) {
        errors.push(...validateStaticBaseRef(args[1], "runs.run"));
        const message = definitelyNonJson(args[1]);
        if (message) errors.push({ message: `runs.run params are invalid: ${message}.`, ...nodeLocation(args[1]) });
      }
    }
    if (directRunsCall(node, "all")) {
      for (const entry of directRunsAllKeys(node)) if (!KEY_PATTERN.test(entry.key)) errors.push({ message: "runs.all item key must be 1-128 characters using letters, numbers, '.', '_' or '-', and start with a letter or number.", ...nodeLocation(entry.node) });
      const args = Array.isArray(node.arguments) ? node.arguments : [];
      if (astNode(args[0]) && args[0].type === "ArrayExpression" && Array.isArray(args[0].elements)) {
        for (const item of args[0].elements) if (astNode(item)) {
          errors.push(...validateStaticBaseRef(item, "runs.all item"));
          const message = definitelyNonJson(item);
          if (message) errors.push({ message: `runs.all item params are invalid: ${message}.`, ...nodeLocation(item) });
        }
      }
    }
    if (directRunsCall(node, "host")) errors.push(...validateStaticHostCall(node));
    if (agentNameError) errors.push(...validateStaticChildAgents(node, agentNameError));
    const boundaryValue = node.type === "CallExpression" && astNode(node.callee) && node.callee.type === "Identifier" && node.callee.name === "emit" && Array.isArray(node.arguments) && astNode(node.arguments[0]) ? node.arguments[0] : node.type === "CallExpression" && astNode(node.callee) && node.callee.type === "MemberExpression" && astNode(node.callee.object) && node.callee.object.type === "Identifier" && node.callee.object.name === "state" && astNode(node.callee.property) && node.callee.property.type === "Identifier" && node.callee.property.name === "set" && Array.isArray(node.arguments) && astNode(node.arguments[1]) ? node.arguments[1] : void 0;
    if (boundaryValue) {
      const message = definitelyNonJson(boundaryValue, Array.isArray(node.arguments) && boundaryValue === node.arguments[0]);
      if (message) errors.push({ message: `workflowScript boundary value is invalid: ${message}.`, ...nodeLocation(boundaryValue) });
    }
  });
  walkAst(workflowBody, (node) => {
    if (node.type !== "ReturnStatement" || !astNode(node.argument)) return;
    const message = definitelyNonJson(node.argument, true);
    if (message) errors.push({ message: `workflowScript boundary value is invalid: ${message}.`, ...nodeLocation(node.argument) });
  }, false);
  if (workflowBody.type === "BlockStatement" && Array.isArray(workflowBody.body)) {
    for (let statementIndex = 0; statementIndex < workflowBody.body.length; statementIndex++) {
      const statement = workflowBody.body[statementIndex];
      if (!astNode(statement) || statement.type !== "VariableDeclaration" || !Array.isArray(statement.declarations)) continue;
      for (const declaration of statement.declarations) {
        if (!astNode(declaration) || !astNode(declaration.id) || declaration.id.type !== "Identifier" || !astNode(declaration.init) || declaration.init.type !== "AwaitExpression" || !astNode(declaration.init.argument) || !directRunsCall(declaration.init.argument, "all")) continue;
        const name = declaration.id.name;
        const laterStatements = workflowBody.body.slice(statementIndex + 1);
        const keys = new Set(directRunsAllKeys(declaration.init.argument).map((entry) => entry.key));
        if (keys.size === 0) continue;
        const args = Array.isArray(declaration.init.argument.arguments) ? declaration.init.argument.arguments : [];
        const itemCount = astNode(args[0]) && args[0].type === "ArrayExpression" && Array.isArray(args[0].elements) ? args[0].elements.length : 0;
        const arrayResultShape = Array.from({ length: itemCount });
        for (const later of laterStatements) {
          walkAstWithoutShadowedIdentifier(later, name, (node) => {
            if (node.type !== "MemberExpression" || !astNode(node.object) || node.object.type !== "Identifier" || node.object.name !== name) return;
            const property = node.computed === true ? literalString(node.property) : astNode(node.property) && node.property.type === "Identifier" ? node.property.name : void 0;
            if (property && keys.has(property) && !(property in arrayResultShape)) errors.push({ message: `runs.all returns an ordered array; '${name}.${property}' is keyed access. Use an index, destructuring, or map(...).`, ...nodeLocation(node) });
          });
          if (statement.kind !== "const" && astNode(later) && later.type === "ExpressionStatement" && definitelyReassignsBinding(later.expression, name)) break;
        }
      }
    }
  }
  const warnings = [];
  if (options.maxSubagentSpawnsPerRun !== void 0) {
    const plan = staticWorkflowLaunchPlan(workflowBody);
    if (plan.keys.length > options.maxSubagentSpawnsPerRun) {
      errors.push({
        kind: "spawn-budget",
        message: `workflowScript statically requires child launches ${plan.keys.map((key) => `'${key}'`).join(", ")}; minimum required: ${plan.keys.length}; configured: ${options.maxSubagentSpawnsPerRun}.`
      });
    }
    if (plan.dynamic) {
      warnings.push({
        kind: "dynamic-spawn-count",
        message: `workflowScript contains dynamic child launches; static validation proved ${plan.keys.length} launch(es), so runtime fan-out enforcement remains authoritative for the configured budget of ${options.maxSubagentSpawnsPerRun}.`
      });
    }
  }
  const unique = errors.filter((error, index) => errors.findIndex((candidate) => candidate.message === error.message && candidate.line === error.line && candidate.column === error.column) === index);
  return { ok: unique.length === 0, errors: unique, ...warnings.length > 0 ? { warnings } : {} };
}
function workflowStringMetadata(params) {
  return {
    ...typeof params.phase === "string" && params.phase.trim() ? { phase: params.phase.trim() } : {},
    ...typeof params.label === "string" && params.label.trim() ? { label: params.label.trim() } : {},
    // Requested agent name, so a child is identifiable while it runs. Launch
    // resolution overwrites this with the canonical name on the terminal entry.
    ...typeof params.agent === "string" && params.agent.trim() ? { agent: params.agent.trim() } : {}
  };
}
function resolveWorkflowParserEntry() {
  try {
    return requireFromPackage.resolve("acorn");
  } catch (primaryError) {
    try {
      const manifestPath = requireFromPackage.resolve("acorn/package.json");
      const manifest = JSON.parse(readFileSync6(manifestPath, "utf8"));
      const entry = typeof manifest.main === "string" && manifest.main ? manifest.main : "./dist/acorn.js";
      return resolvePath(dirname6(manifestPath), entry);
    } catch {
      throw primaryError;
    }
  }
}
var AUTO_RESUME_PARAM_KEYS = ["acceptance", "agentContract", "baseRef", "index", "intercomBridge", "label", "lane", "maxRuntimeMs", "output", "outputMode", "outputSchema", "phase", "skill", "skills", "task", "timeoutMs", "toolBudget", "worktree"];
function isZeroUsage(usage) {
  if (!isRecord3(usage)) return false;
  const cost = usage.cost;
  return (usage.input ?? 0) === 0 && (usage.output ?? 0) === 0 && (usage.cacheRead ?? 0) === 0 && (usage.cacheWrite ?? 0) === 0 && (!isRecord3(cost) || (cost.total ?? 0) === 0);
}
function setupAbortResumeParams(params, result, signal) {
  if (signal.aborted || result.state === "running" || result.ok || result.stopped || result.interrupted || !result.runId) return void 0;
  const childResult = Array.isArray(result.results) && result.results.length === 1 && isRecord3(result.results[0]) ? result.results[0] : void 0;
  const error = typeof childResult?.error === "string" ? childResult.error : result.error;
  if (error !== "This operation was aborted" || !isZeroUsage(childResult?.usage)) return void 0;
  const messages = Array.isArray(childResult?.messages) ? childResult.messages : [];
  const message = messages.findLast((entry) => isRecord3(entry) && entry.role === "assistant");
  if (message !== void 0) {
    if (!isRecord3(message)) return void 0;
    if (message.stopReason !== "error" || message.errorMessage !== error) return void 0;
    if (!Array.isArray(message.content) || message.content.length > 0 || !isZeroUsage(message.usage)) return void 0;
    if (Object.hasOwn(message, "diagnostics") || Object.hasOwn(message, "responseId")) return void 0;
  }
  const task = typeof params.task === "string" && params.task.trim() ? params.task.trim() : "Continue after the setup abort.";
  const resumeParams = { resume: result.runId, task };
  for (const key of AUTO_RESUME_PARAM_KEYS) {
    if (Object.hasOwn(params, key)) resumeParams[key] = params[key];
  }
  resumeParams.resume = result.runId;
  resumeParams.task = task;
  return resumeParams;
}
async function runWorkflowScript(options) {
  const emptyPartial = () => ({ emits: [], console: [], trace: [], children: [] });
  if (!options.script.trim()) throw new WorkflowScriptError("workflowScript must not be empty.", emptyPartial(), "validation");
  if (options.timeoutMs !== void 0 && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1)) throw new WorkflowScriptError("workflow script timeout must be a positive integer.", emptyPartial(), "runtime");
  if (options.globalConcurrencyLimit !== void 0 && (!Number.isSafeInteger(options.globalConcurrencyLimit) || options.globalConcurrencyLimit < 1)) {
    throw new WorkflowScriptError("workflow script global concurrency limit must be a positive integer.", emptyPartial(), "runtime");
  }
  const launchSemaphore = new Semaphore(options.globalConcurrencyLimit ?? DEFAULT_GLOBAL_CONCURRENCY_LIMIT);
  if (options.processCwd !== void 0) {
    let staleCwd = false;
    try {
      realpathSync3(process.cwd());
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
      if (code !== "ENOENT") throw new WorkflowScriptError("Workflow current cwd could not be validated.", emptyPartial(), "runtime", { cause: error });
      staleCwd = true;
    }
    try {
      if (staleCwd) process.chdir(options.processCwd);
      else {
        const target = realpathSync3(options.processCwd);
        if (!statSync4(target).isDirectory()) {
          const error = new Error(`ENOTDIR: not a directory, access '${target}'`);
          error.code = "ENOTDIR";
          throw error;
        }
        accessSync(target, constants2.X_OK);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new WorkflowScriptError(`Workflow process cwd is unavailable: ${options.processCwd}: ${detail}`, emptyPartial(), "runtime", { cause: error });
    }
  }
  let acornPath;
  try {
    acornPath = resolveWorkflowParserEntry();
  } catch (error) {
    throw new WorkflowScriptError("Workflow parser dependency 'acorn' is unavailable from pi-subagents. Reinstall pi-subagents dependencies before launching workflowScript.", emptyPartial(), "runtime", { cause: error });
  }
  let worker;
  try {
    worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { acornPath } });
  } catch (error) {
    throw new WorkflowScriptError(`Workflow worker could not start: ${error instanceof Error ? error.message : String(error)}`, emptyPartial(), "runtime", { cause: error });
  }
  const emits = [];
  const consoleEntries = [];
  const trace = [];
  const children = /* @__PURE__ */ new Map();
  const childOrder = [];
  const launches = /* @__PURE__ */ new Map();
  const steers = /* @__PURE__ */ new Map();
  const hostCalls = /* @__PURE__ */ new Map();
  const stoppedLaunches = /* @__PURE__ */ new Set();
  const childStopControllers = /* @__PURE__ */ new Map();
  const batchAdmissions = /* @__PURE__ */ new Map();
  const observedRunCalls = /* @__PURE__ */ new Set();
  const observedSteerCalls = /* @__PURE__ */ new Set();
  const observedHostCalls = /* @__PURE__ */ new Set();
  const childController = new AbortController();
  let acceptanceRecoveryBarrier;
  let settled = false;
  let finishing = false;
  let assemblyAbortRequested = false;
  let assemblyFlushTimer;
  let abortError;
  const partial = () => ({ emits, console: consoleEntries, trace, children: childOrder.flatMap((key) => {
    const child = children.get(key);
    return child ? [child] : [];
  }) });
  const traceChanged = () => {
    try {
      options.onTrace?.([...trace]);
    } catch (error) {
      console.error("Workflow onTrace callback failed:", error);
    }
  };
  const lanePlanChanged = (lanes) => {
    try {
      options.onLanePlan?.(lanes);
    } catch (error) {
      console.error("Workflow onLanePlan callback failed:", error);
    }
  };
  const hostStepChanged = (hostStep) => {
    try {
      options.onHostStep?.(hostStep);
    } catch (error) {
      console.error("Workflow onHostStep callback failed:", error);
    }
  };
  const stoppedChildResult = (key, message) => ({ key, ok: false, stopped: true, output: message, error: message, artifactPaths: [] });
  const responseBoundaryFailure = (key, error) => {
    const text = error instanceof Error ? error.message : String(error);
    return { key, ok: false, output: text, error: text, artifactPaths: [] };
  };
  const assertRecoveryBarrierAllowsRun = (key, params) => {
    if (!acceptanceRecoveryBarrier || isExplicitReadOnlyRecoveryReview(params)) return;
    throw new Error(recoveryBarrierMessage(acceptanceRecoveryBarrier.key, key));
  };
  const recordAcceptanceRecoveryBarrier = (key, result) => {
    if (isAcceptanceMetadataRecovery(result)) acceptanceRecoveryBarrier = { key };
  };
  const stopChild = (key, message = `Workflow child '${key}' stopped.`) => {
    if (!launches.has(key) || children.has(key)) return false;
    stoppedLaunches.add(key);
    children.set(key, stoppedChildResult(key, message));
    childStopControllers.get(key)?.abort(new Error(message));
    const started = trace.findLast((entry) => entry.operation === "run" && entry.key === key && entry.state === "started");
    trace.push({
      operation: "run",
      key,
      state: "stopped",
      ...started?.agent ? { agent: started.agent } : {},
      ...started?.phase ? { phase: started.phase } : {},
      ...started?.label ? { label: started.label } : {},
      ...started?.generatedLaneKey ? { generatedLaneKey: started.generatedLaneKey } : {},
      error: message
    });
    traceChanged();
    return true;
  };
  const notifyChildSettled = (key, result) => {
    if (result.state === "running" || !options.onChildSettled || !options.workflowRunId) return;
    const outcome = result.ok ? "completed" : result.stopped ? "stopped" : result.detached ? "paused" : "failed";
    const outputReference = result.outputReference ?? result.outputArtifactPath;
    try {
      options.onChildSettled({
        workflowRunId: options.workflowRunId,
        childKey: key,
        ...result.runId ? { childRunId: result.runId } : {},
        outcome,
        ...outputReference ? { outputReference } : {},
        ...!result.ok && result.error ? { error: result.error } : {},
        workflowRunning: !settled && !finishing,
        result
      });
    } catch (error) {
      console.error("Workflow onChildSettled callback failed:", error);
    }
  };
  options.registerStopChild?.(stopChild);
  return await new Promise((resolve6, reject) => {
    const finish = (outcome) => {
      if (settled || finishing) return;
      finishing = true;
      if (assemblyFlushTimer !== void 0) {
        clearTimeout(assemblyFlushTimer);
        assemblyFlushTimer = void 0;
      }
      childController.abort("error" in outcome ? outcome.error : new Error("Workflow script completed."));
      void Promise.allSettled([...steers.values(), ...hostCalls.values()].map(({ promise }) => promise)).then(() => {
        if (settled) return;
        settled = true;
        options.registerStopChild?.(void 0);
        if (timer) clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        void worker.terminate();
        const unobservedKeys = "value" in outcome ? [...launches].filter(([, launch]) => !launch.observed).map(([key]) => key) : [];
        const completionError = unobservedKeys.length > 0 ? new Error(`workflowScript completed with unawaited runs.run launch(es): ${unobservedKeys.map((key) => `'${key}'`).join(", ")}. For ordinary parallel fanout use await runs.all([{key, agent, task}, ...]); do not read .output from unawaited launches.`) : "value" in outcome ? (() => {
          const unobservedSteers = [...steers.values()].filter((steer) => !steer.observed).map((steer) => steer.key);
          if (unobservedSteers.length > 0) return new Error(`workflowScript completed with unawaited runs.steer call(s): ${unobservedSteers.map((key) => `'${key}'`).join(", ")}. Await or return each call.`);
          const unobservedHosts = [...hostCalls.values()].filter((host) => !host.observed).map((host) => host.key);
          return unobservedHosts.length > 0 ? new Error(`workflowScript completed with unawaited runs.host call(s): ${unobservedHosts.map((key) => `'${key}'`).join(", ")}. Await or return each call.`) : void 0;
        })() : void 0;
        if ("error" in outcome) reject(new WorkflowScriptError(outcome.error.message, partial(), isWorkflowScriptFailureKind(outcome.error.workflowErrorKind) ? outcome.error.workflowErrorKind : void 0));
        else if (completionError) reject(new WorkflowScriptError(completionError.message, partial(), "validation"));
        else resolve6({ value: outcome.value, ...partial() });
      });
    };
    const onAbort = () => {
      const signalReason = options.signal?.reason;
      const error = signalReason instanceof Error ? signalReason : typeof signalReason === "string" ? new Error(signalReason) : new Error("Workflow script aborted.");
      if (finishing) return;
      abortError = error;
      const allChildrenSettled = launches.size > 0 && [...launches.keys()].every((key) => children.has(key));
      let mayFlushAssembly = false;
      try {
        mayFlushAssembly = options.continueAfterAbortWhenChildrenSettled?.(error) === true;
      } catch (callbackError) {
        const callbackMessage = callbackError instanceof Error ? callbackError.message : String(callbackError);
        return finish({ error: taggedWorkflowError(`Workflow assembly flush eligibility failed: ${callbackMessage}`, "runtime") });
      }
      if (mayFlushAssembly && allChildrenSettled) {
        assemblyAbortRequested = true;
        childController.abort(error);
        assemblyFlushTimer = setTimeout(() => finish({ error }), WORKFLOW_ASSEMBLY_FLUSH_TIMEOUT_MS);
        return;
      }
      for (const key of launches.keys()) {
        if (children.has(key)) continue;
        stoppedLaunches.add(key);
        const started = trace.findLast((entry) => entry.operation === "run" && entry.key === key && entry.state === "started");
        trace.push({
          operation: "run",
          key,
          state: "stopped",
          ...started?.agent ? { agent: started.agent } : {},
          ...started?.phase ? { phase: started.phase } : {},
          ...started?.label ? { label: started.label } : {},
          ...started?.generatedLaneKey ? { generatedLaneKey: started.generatedLaneKey } : {},
          error: error.message
        });
      }
      traceChanged();
      finish({ error });
    };
    const timer = options.timeoutMs === void 0 ? void 0 : setTimeout(() => {
      finish({ error: taggedWorkflowError(`Workflow script timed out after ${options.timeoutMs}ms.`, "timeout") });
    }, options.timeoutMs);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) return onAbort();
    worker.on("error", (error) => finish({ error: taggedWorkflowError(`Workflow worker failed: ${error instanceof Error ? error.message : String(error)}`, "runtime") }));
    worker.on("exit", (code) => {
      if (!settled && code !== 0) finish({ error: taggedWorkflowError(`Workflow worker exited with code ${code}.`, "runtime") });
    });
    worker.on("message", (message) => {
      if (settled) return;
      if (message.type === "lanePlan" && Array.isArray(message.lanes)) {
        lanePlanChanged(message.lanes);
        return;
      }
      if (message.type === "emit") {
        try {
          assertWorkflowJsonValue(message.value, "emit");
        } catch (error) {
          finish({ error: taggedWorkflowError(`Workflow emit could not be persisted: ${error instanceof Error ? error.message : String(error)}`, "runtime") });
          return;
        }
        emits.push(message.value);
        try {
          options.onEmit?.([...emits]);
        } catch (error) {
          emits.pop();
          finish({ error: taggedWorkflowError(`Workflow emit could not be persisted: ${error instanceof Error ? error.message : String(error)}`, "runtime") });
        }
        return;
      }
      if (message.type === "console") {
        const level = message.level;
        if ((level === "log" || level === "info" || level === "warn" || level === "error") && typeof message.text === "string") consoleEntries.push({ level, text: message.text });
        return;
      }
      if (message.type === "complete") {
        try {
          assertWorkflowJsonValue(message.value, "return");
        } catch (error) {
          return finish({ error: taggedWorkflowError(`Workflow return could not be persisted: ${error instanceof Error ? error.message : String(error)}`, "return-serialization") });
        }
        return finish({ value: message.value });
      }
      if (message.type === "error") {
        const rawError = typeof message.error === "string" ? message.error : "Workflow script failed.";
        const text = message.errorPhase === "return-serialization" ? `${rawError}${workflowReturnRecoveryHint(partial().children)}` : rawError;
        return finish({ error: isWorkflowScriptFailureKind(message.errorKind) ? taggedWorkflowError(text, message.errorKind) : new Error(text) });
      }
      if (message.type === "callObserved" && typeof message.callId === "number") {
        const key2 = typeof message.key === "string" ? message.key : void 0;
        if (message.operation === "run") {
          const launch = key2 ? launches.get(key2) : void 0;
          if (launch) launch.observed = true;
          else observedRunCalls.add(message.callId);
        } else if (message.operation === "steer") {
          const steer = steers.get(message.callId);
          if (steer) steer.observed = true;
          else observedSteerCalls.add(message.callId);
        } else if (message.operation === "host") {
          const host = hostCalls.get(message.callId);
          if (host) host.observed = true;
          else observedHostCalls.add(message.callId);
        }
        return;
      }
      if (message.type !== "call" || typeof message.callId !== "number" || typeof message.method !== "string" || !isRecord3(message.args)) return;
      if (assemblyAbortRequested) return finish({ error: abortError ?? new Error("Workflow context was replaced or reloaded.") });
      const respond = (promise2, responsePath, onBoundaryError) => {
        void promise2.then(
          (value) => {
            if (settled) return;
            const normalized = responsePath ? omitNonJsonWorkflowResultMetadata(value) : omitUndefinedWorkflowValues(value);
            if (!responsePath) {
              worker.postMessage({ type: "response", callId: message.callId, ok: true, value: normalized });
              return;
            }
            try {
              assertWorkflowJsonValue(normalized, responsePath);
              worker.postMessage({ type: "response", callId: message.callId, ok: true, value: normalized });
            } catch (error) {
              onBoundaryError?.(error);
              worker.postMessage({ type: "response", callId: message.callId, ok: false, error: `${responsePath} must contain only JSON data before it can be returned from workflowScript. Return a plain projection such as { runId, ok, output }. ${error instanceof Error ? error.message : String(error)}` });
            }
          },
          (error) => {
            if (!settled) {
              const errorKind = error instanceof Error ? error.workflowErrorKind : void 0;
              worker.postMessage({ type: "response", callId: message.callId, ok: false, error: error instanceof Error ? error.message : String(error), ...isWorkflowScriptFailureKind(errorKind) ? { errorKind } : {} });
            }
          }
        );
      };
      if (message.method === "state.get" || message.method === "state.set") {
        if (!options.state) return respond(Promise.reject(new Error("Workflow state is unavailable without a mission.")));
        let key2;
        try {
          key2 = validateKey(message.args.key, "state");
        } catch (error) {
          return respond(Promise.reject(error));
        }
        if (message.method === "state.get") return respond(Promise.resolve().then(() => options.state.get(key2)));
        if (acceptanceRecoveryBarrier) return respond(Promise.reject(new Error(recoveryBarrierMessage(acceptanceRecoveryBarrier.key, `state.set('${key2}')`))));
        const value = message.args.value;
        try {
          assertWorkflowJsonValue(value, `state.set('${key2}') value`);
        } catch (error) {
          return respond(Promise.reject(error));
        }
        return respond(Promise.resolve().then(() => options.state.set(key2, value)));
      }
      if (message.method === "status") {
        const keyOrRunId = message.args.keyOrRunId;
        if (typeof keyOrRunId !== "string" || !keyOrRunId.trim()) return respond(Promise.reject(new Error("runs.status(keyOrRunId) requires a non-empty string.")));
        const known = children.get(keyOrRunId);
        const target = known?.runId ?? keyOrRunId;
        trace.push({ operation: "status", key: keyOrRunId, state: "started", ...known?.runId ? { runId: known.runId } : {} });
        traceChanged();
        if (settled || finishing) return;
        respond(options.status(target, childController.signal).then((result) => {
          if (settled || finishing) return result;
          trace.push({ operation: "status", key: keyOrRunId, state: result.ok ? "completed" : "failed", ...result.runId ? { runId: result.runId } : {}, ...!result.ok ? { error: result.output } : {} });
          traceChanged();
          if (!result.ok) throw new Error(`Status '${keyOrRunId}' failed: ${result.output}`);
          return result;
        }));
        return;
      }
      if (message.method === "steer") {
        let key2;
        try {
          key2 = validateKey(message.args.key, "runs.steer");
        } catch (error) {
          return respond(Promise.reject(error));
        }
        const steerMessage = message.args.message;
        if (typeof steerMessage !== "string" || !steerMessage.trim()) return respond(Promise.reject(new Error(`runs.steer('${key2}') requires a non-empty message.`)));
        const steerOptions = isRecord3(message.args.options) ? message.args.options : {};
        if (acceptanceRecoveryBarrier) return respond(Promise.reject(new Error(recoveryBarrierMessage(acceptanceRecoveryBarrier.key, `runs.steer('${key2}')`))));
        const startedAt2 = Date.now();
        trace.push({ operation: "steer", key: key2, state: "started" });
        traceChanged();
        const promise2 = Promise.resolve().then(() => {
          if (!launches.has(key2)) throw new Error(`runs.steer('${key2}') requires a prior runs.run/runs.all launch with that key.`);
          if (!options.steer) throw new Error("Workflow steering is unavailable in this host.");
          return options.steer(key2, steerMessage.trim(), steerOptions, childController.signal);
        }).then((receipt) => {
          trace.push({ operation: "steer", key: key2, state: receipt.state, durationMs: Date.now() - startedAt2, ...receipt.error ? { error: receipt.error } : {} });
          traceChanged();
          return receipt;
        }, (error) => {
          const text = error instanceof Error ? error.message : String(error);
          trace.push({ operation: "steer", key: key2, state: "failed", durationMs: Date.now() - startedAt2, error: text });
          traceChanged();
          throw error;
        });
        steers.set(message.callId, { key: key2, promise: promise2, observed: observedSteerCalls.delete(message.callId) });
        respond(promise2);
        return;
      }
      if (message.method === "host") {
        let key2;
        let params2;
        try {
          key2 = validateKey(message.args.key, "runs.host");
          params2 = normalizeWorkflowHostCommandParams(message.args.params, `runs.host('${key2}') params`);
        } catch (error) {
          return respond(Promise.reject(error));
        }
        if (acceptanceRecoveryBarrier) return respond(Promise.reject(new Error(recoveryBarrierMessage(acceptanceRecoveryBarrier.key, `runs.host('${key2}')`))));
        if (!options.host) return respond(Promise.reject(new Error("runs.host is unavailable in this host context.")));
        if (hostCalls.size >= HOST_STEP_MAX_COUNT) return respond(Promise.reject(new Error(`workflowScript supports at most ${HOST_STEP_MAX_COUNT} runs.host calls.`)));
        const startedAt2 = Date.now();
        const startedStep = {
          version: 1,
          kind: "host-step",
          monitorKind: "command",
          id: key2,
          label: key2,
          ...params2.role ? { role: params2.role } : {},
          ...params2.provider ? { provider: params2.provider } : {},
          state: "running",
          updatedAt: startedAt2,
          deadlineAt: startedAt2 + params2.timeoutMs
        };
        hostStepChanged(startedStep);
        trace.push({ operation: "host", key: key2, state: "started" });
        traceChanged();
        const promise2 = Promise.resolve().then(() => options.host(key2, params2, childController.signal)).then((result) => {
          const state = result.state === "stopped" ? "cancelled" : result.ok ? "done" : "error";
          const detail = [result.error, result.stderr.trim() || result.stdout.trim()].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 200);
          hostStepChanged({ ...startedStep, state, ...state === "done" ? { verdict: "pass" } : {}, ...!result.ok ? { reasonCode: result.state === "timed-out" ? "timed_out" : result.state === "stopped" ? "aborted" : "command_failed" } : {}, ...detail ? { detail } : {}, reportPath: params2.output ?? result.outputPath.split(/[\\/]/).at(-1), exitCode: result.exitCode, updatedAt: Date.now() });
          trace.push({ operation: "host", key: key2, state: result.ok ? "completed" : result.state === "stopped" ? "stopped" : "failed", durationMs: result.durationMs, ...!result.ok ? { error: result.error ?? "Host command failed." } : {} });
          traceChanged();
          if (!result.ok) throw new Error(`Host command '${key2}' failed: ${detail || result.error || `exit code ${result.exitCode ?? "unknown"}`}`);
          return result;
        }, (error) => {
          const text = error instanceof Error ? error.message : String(error);
          hostStepChanged({ ...startedStep, state: "error", reasonCode: "execution_failed", detail: text.replace(/\s+/g, " ").slice(0, 200), updatedAt: Date.now() });
          trace.push({ operation: "host", key: key2, state: "failed", durationMs: Date.now() - startedAt2, error: text });
          traceChanged();
          throw error;
        });
        hostCalls.set(message.callId, { key: key2, promise: promise2, observed: observedHostCalls.delete(message.callId) });
        respond(promise2, `runs.host('${key2}') result`);
        return;
      }
      if (message.method !== "run") return respond(Promise.reject(new Error(`Unknown runs API method '${message.method}'.`)));
      let key;
      try {
        key = validateKey(message.args.key);
      } catch (error) {
        return respond(Promise.reject(error));
      }
      const params = message.args.params;
      if (!isRecord3(params)) return respond(Promise.reject(new Error(`runs.run('${key}', params) requires a params object.`)));
      const generatedLaneKey = typeof message.args.generatedLaneKey === "string" && KEY_PATTERN.test(message.args.generatedLaneKey) && key.startsWith(`${message.args.generatedLaneKey}.`) ? message.args.generatedLaneKey : void 0;
      const collectFailure = message.args.collectFailure === true;
      const callObserved = observedRunCalls.delete(message.callId);
      const deliver = (promise2) => collectFailure ? promise2 : promise2.then((result) => {
        const recoverableAcceptanceMetadata = result.recovery?.status === "available-for-review" && result.recovery.reason === "acceptance-metadata-rejected";
        if (!result.ok && result.state !== "running" && !result.stopped && !recoverableAcceptanceMetadata) {
          throw taggedWorkflowError(`Run '${key}' ${result.detached ? "detached" : "failed"}: ${result.error ?? result.output}`, result.detached ? "detached-child" : "child");
        }
        return result;
      });
      const fingerprint = workflowRunParamsFingerprint(params);
      const existing = launches.get(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) return respond(Promise.reject(new Error(`Duplicate workflow key '${key}' used with incompatible launch params.`)));
        if (callObserved) existing.observed = true;
        trace.push({ operation: "run", key, state: "reused", ...workflowStringMetadata(params), ...existing.generatedLaneKey ? { generatedLaneKey: existing.generatedLaneKey } : {} });
        traceChanged();
        return respond(deliver(existing.promise), `runs.run('${key}') result`, (error) => children.set(key, responseBoundaryFailure(key, error)));
      }
      const permitError = options.oneUsePermit?.claim(key);
      if (permitError) return respond(Promise.reject(new Error(permitError)));
      if (options.oneUsePermit && message.args.batch !== void 0) return respond(Promise.reject(new Error("Workflow child permit does not support runs.all.")));
      if (options.oneUsePermit && params.resume !== void 0) return respond(Promise.reject(new Error("Workflow child permit does not support retained resume.")));
      if (params.action !== void 0) return respond(Promise.reject(new Error(`runs.run('${key}') accepts execution params only; management action is not allowed.`)));
      if (params.workflowScript !== void 0) return respond(Promise.reject(new Error(`runs.run('${key}') cannot start a nested workflow script.`)));
      if (params.tasks !== void 0 || params.chain !== void 0 || params.parallel !== void 0 || params.concurrency !== void 0 || params.chainDir !== void 0) {
        return respond(Promise.reject(new Error(`runs.run('${key}') accepts one child via { agent, task }; use runs.all(...) and JavaScript control flow for orchestration.`)));
      }
      if (params.worktree !== void 0 && typeof params.worktree !== "boolean") {
        return respond(Promise.reject(new Error(`runs.run('${key}') worktree must be true or false.`)));
      }
      if (params.baseRef !== void 0 && (typeof params.baseRef !== "string" || !validGitRef(params.baseRef))) {
        return respond(Promise.reject(new Error(`runs.run('${key}') ${BASE_REF_VALIDATION_ERROR}`)));
      }
      if (params.gate !== void 0) {
        const parsedGate = parseGateInput(params.gate);
        if (!parsedGate.ok) return respond(Promise.reject(new Error(`runs.run('${key}') ${parsedGate.error}`)));
      }
      if (params.gate !== void 0 && params.acceptance !== void 0 && params.acceptance !== false) {
        return respond(Promise.reject(new Error(`runs.run('${key}') gate cannot be combined with acceptance; use one gate command or acceptance.verify.` + describeGateAcceptanceConflict(params.gate, params.acceptance))));
      }
      if (params.gate !== void 0 && params.resume !== void 0) {
        return respond(Promise.reject(new Error(`runs.run('${key}') gate is not supported with retained resume.`)));
      }
      let resumeReference;
      try {
        if (params.resume !== void 0 && typeof params.resume !== "string") resumeReference = parseWorkflowResumeReference(params.resume);
      } catch (error) {
        return respond(Promise.reject(new Error(`runs.run('${key}') ${error instanceof Error ? error.message : String(error)}`)));
      }
      if (typeof params.resume === "string" && !params.resume.trim()) return respond(Promise.reject(new Error(`runs.run('${key}') resume must be a non-empty retained run id.`)));
      if (params.resume !== void 0 && params.agent !== void 0) {
        return respond(Promise.reject(new Error(`runs.run('${key}') resume and agent are mutually exclusive.`)));
      }
      if (params.resume !== void 0 && (typeof params.task !== "string" || !params.task.trim())) {
        return respond(Promise.reject(new Error(`runs.run('${key}') resume requires a non-empty task follow-up.`)));
      }
      const startedAt = Date.now();
      const batch = isRecord3(message.args.batch) && typeof message.args.batch.id === "string" && Array.isArray(message.args.batch.calls) ? { id: message.args.batch.id, calls: message.args.batch.calls.filter((call) => isRecord3(call) && typeof call.key === "string" && isRecord3(call.params)) } : void 0;
      let admission = batch ? batchAdmissions.get(batch.id) : void 0;
      if (!admission) {
        const seenKeys = /* @__PURE__ */ new Set();
        const calls = (batch?.calls ?? [{ key, params }]).filter((call) => {
          if (seenKeys.has(call.key) || launches.has(call.key)) return false;
          seenKeys.add(call.key);
          return true;
        });
        admission = Promise.resolve().then(() => {
          if (settled || finishing) return;
          for (const call of calls) assertRecoveryBarrierAllowsRun(call.key, call.params);
          return options.admit?.(calls, childController.signal);
        });
        if (batch) batchAdmissions.set(batch.id, admission);
      }
      let resolvedResumeLineage;
      const promise = admission.then(async () => {
        if (settled || finishing || stoppedLaunches.has(key)) {
          const reason = childController.signal.reason;
          const text = children.get(key)?.error ?? (reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "Workflow script aborted.");
          return stoppedChildResult(key, text);
        }
        const childStopController = new AbortController();
        childStopControllers.set(key, childStopController);
        const childSignal = combinedAbortSignal([childController.signal, childStopController.signal]);
        const resumeInput = resumeReference ?? (typeof params.resume === "string" && options.resolveResume ? params.resume : void 0);
        const resolvedResumeValue = resumeInput ? await Promise.resolve().then(() => {
          if (!options.resolveResume) throw new Error("Keyed workflow receipt resume is unavailable in this host.");
          return options.resolveResume(resumeInput, childSignal, typeof params.index === "number" ? params.index : void 0);
        }) : void 0;
        const resolvedResume = typeof resolvedResumeValue === "string" ? resolvedResumeValue : isRecord3(resolvedResumeValue) && typeof resolvedResumeValue.runId === "string" ? resolvedResumeValue.runId : void 0;
        if (resumeReference && (typeof resolvedResume !== "string" || !resolvedResume.trim())) throw new Error("Keyed workflow receipt resume resolved without a retained run id.");
        const resolvedResumeId = resolvedResume?.trim();
        if (isRecord3(resolvedResumeValue)) {
          const lineage = Array.isArray(resolvedResumeValue.runIds) ? resolvedResumeValue.runIds.filter((runId) => typeof runId === "string" && Boolean(runId.trim())).map((runId) => runId.trim()) : [];
          resolvedResumeLineage = [...new Set(lineage.length ? lineage : [resolvedResumeId])];
          if (resolvedResumeLineage.at(-1) !== resolvedResumeId) resolvedResumeLineage.push(resolvedResumeId);
          if (typeof resumeInput === "string") {
            const predecessor = [...children.values()].find((child) => child.runId === resolvedResumeId);
            if (predecessor?.continuation && predecessor.continuation.runIds.at(-1) === resolvedResumeId) resolvedResumeLineage = predecessor.continuation.runIds;
          }
        }
        const launchParams = resolvedResumeId ? { ...params, resume: resolvedResumeId } : params;
        await launchSemaphore.acquire();
        try {
          if (settled || finishing || stoppedLaunches.has(key) || childSignal.aborted) {
            const reason = childSignal.reason;
            const text = children.get(key)?.error ?? (reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "Workflow script aborted.");
            return stoppedChildResult(key, text);
          }
          const result = await options.launch(key, launchParams, childSignal, { admitted: true, batch: batch !== void 0 });
          const autoResumeParams = setupAbortResumeParams(params, result, childSignal);
          if (!autoResumeParams) return result;
          resolvedResumeLineage = [.../* @__PURE__ */ new Set([...resolvedResumeLineage ?? [], result.runId])];
          trace.push({ operation: "run", key, state: "started", ...workflowStringMetadata(autoResumeParams), ...generatedLaneKey ? { generatedLaneKey } : {}, phase: "auto-resume", runId: result.runId });
          traceChanged();
          return options.launch(key, autoResumeParams, childSignal, { admitted: true, batch: batch !== void 0 });
        } finally {
          launchSemaphore.release();
        }
      }, (error) => {
        if (!childController.signal.aborted) throw error;
        const reason = childController.signal.reason;
        return stoppedChildResult(key, reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "Workflow script aborted.");
      }).then((result) => {
        let normalized = !result.ok && result.state !== "running" && !result.error ? { ...result, error: result.output } : result;
        if (resolvedResumeLineage?.length && normalized.runId) {
          normalized = { ...normalized, continuation: { runIds: [.../* @__PURE__ */ new Set([...resolvedResumeLineage, normalized.runId])] } };
        }
        childStopControllers.delete(key);
        if (stoppedLaunches.has(key)) return children.get(key) ?? normalized;
        children.set(key, normalized);
        recordAcceptanceRecoveryBarrier(key, normalized);
        const state = normalized.state === "running" ? "started" : normalized.ok ? "completed" : normalized.stopped ? "stopped" : normalized.detached ? "detached" : "failed";
        const settledEntry = { operation: "run", key, state, durationMs: Date.now() - startedAt, ...workflowStringMetadata(params), ...generatedLaneKey ? { generatedLaneKey } : {}, ...normalized.agent ? { agent: normalized.agent } : {}, ...normalized.runId ? { runId: normalized.runId } : {}, ...!normalized.ok && normalized.state !== "running" ? { error: normalized.error ?? normalized.output } : {} };
        if (normalized.reused) settledEntry.reused = true;
        trace.push(settledEntry);
        traceChanged();
        notifyChildSettled(key, normalized);
        return normalized;
      }, (error) => {
        const text = error instanceof Error ? error.message : String(error);
        const failure = { key, ok: false, output: text, error: text, artifactPaths: [] };
        childStopControllers.delete(key);
        if (stoppedLaunches.has(key)) return children.get(key) ?? { ...failure, stopped: true };
        children.set(key, failure);
        trace.push({ operation: "run", key, state: "failed", durationMs: Date.now() - startedAt, ...workflowStringMetadata(params), ...generatedLaneKey ? { generatedLaneKey } : {}, error: text });
        traceChanged();
        notifyChildSettled(key, failure);
        return failure;
      });
      launches.set(key, { fingerprint, promise, observed: callObserved, ...generatedLaneKey ? { generatedLaneKey } : {} });
      childOrder.push(key);
      trace.push({ operation: "run", key, state: "started", ...workflowStringMetadata(params), ...generatedLaneKey ? { generatedLaneKey } : {} });
      traceChanged();
      respond(deliver(promise), `runs.run('${key}') result`, (error) => children.set(key, responseBoundaryFailure(key, error)));
    });
    worker.postMessage({ type: "start", script: options.script, ...options.args ? { args: options.args } : {}, stateEnabled: options.state !== void 0 });
  });
}

// src/missions/store.ts
import { createHash as createHash3, randomUUID as randomUUID4 } from "node:crypto";
import * as fs8 from "node:fs";
import * as os from "node:os";
import * as path9 from "node:path";

// src/missions/types.ts
var MISSION_STATUSES = [
  "planned",
  "active",
  "waiting",
  "needs_decision",
  "completed",
  "failed",
  "cancelled"
];

// src/missions/store.ts
var MISSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
var MISSION_RUN_MODES = /* @__PURE__ */ new Set(["single", "parallel", "chain", "workflow", "scheduled", "external"]);
var MISSION_ARTIFACT_KINDS = /* @__PURE__ */ new Set(["status", "output", "patch", "manifest", "review", "note", "other"]);
var MISSION_RECEIPT_KINDS = /* @__PURE__ */ new Set(["pull_request", "ci", "deployment", "release"]);
var MISSION_RECEIPT_STATUSES = /* @__PURE__ */ new Set(["pending", "ready", "succeeded", "failed"]);
var MISSION_STATUS_SET = new Set(MISSION_STATUSES);
var TERMINAL_MISSION_STATUSES = /* @__PURE__ */ new Set(["completed", "failed", "cancelled"]);
var DEFAULT_TERMINAL_MISSION_RETENTION = 200;
function asObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object`);
  return value;
}
function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}
function optionalString(value, label) {
  if (value === void 0) return void 0;
  return requiredString(value, label);
}
function timestamp(value, label) {
  const result = requiredString(value, label);
  if (Number.isNaN(Date.parse(result))) throw new Error(`${label} must be an ISO timestamp`);
  return result;
}
function missionStatus(value, label) {
  if (typeof value !== "string" || !MISSION_STATUS_SET.has(value)) {
    throw new Error(`${label} must be one of ${MISSION_STATUSES.join(", ")}`);
  }
  return value;
}
function positiveTokenCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}
function nonNegativeTokenCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}
function parseGoal(value, label) {
  const input = asObject(value, label);
  if (input.status !== "active" && input.status !== "paused" && input.status !== "budget-exhausted") throw new Error(`${label}.status is invalid`);
  return { status: input.status };
}
function parseBudget(value, label) {
  const input = asObject(value, label);
  return { tokens: positiveTokenCount(input.tokens, `${label}.tokens`) };
}
function parseUsage(value, label) {
  const input = asObject(value, label);
  return { tokens: nonNegativeTokenCount(input.tokens, `${label}.tokens`) };
}
function stringArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array of non-empty strings`);
  const result = value.map((item, index) => requiredString(item, `${label}[${index}]`).trim());
  return [...new Set(result)];
}
function validateMissionId(value, label = "missionId") {
  const id = requiredString(value, label);
  if (!MISSION_ID_PATTERN.test(id) || id.includes("..")) {
    throw new Error(`${label} must contain only letters, numbers, '.', '_', or '-' and cannot contain '..'`);
  }
  return id;
}
function parseRunLink(value, label) {
  const input = asObject(value, label);
  const runId = requiredString(input.runId, `${label}.runId`);
  const mode = requiredString(input.mode, `${label}.mode`);
  if (!MISSION_RUN_MODES.has(mode)) throw new Error(`${label}.mode is invalid`);
  if (input.childIndex !== void 0 && (!Number.isInteger(input.childIndex) || input.childIndex < 0)) {
    throw new Error(`${label}.childIndex must be a non-negative integer`);
  }
  return {
    runId,
    mode,
    ...optionalString(input.asyncDir, `${label}.asyncDir`) ? { asyncDir: input.asyncDir } : {},
    ...input.childIndex !== void 0 ? { childIndex: input.childIndex } : {},
    ...optionalString(input.agent, `${label}.agent`) ? { agent: input.agent } : {},
    ...optionalString(input.status, `${label}.status`) ? { status: input.status } : {},
    ...input.startedAt !== void 0 ? { startedAt: timestamp(input.startedAt, `${label}.startedAt`) } : {},
    ...input.completedAt !== void 0 ? { completedAt: timestamp(input.completedAt, `${label}.completedAt`) } : {},
    ...input.usage !== void 0 ? { usage: parseUsage(input.usage, `${label}.usage`) } : {}
  };
}
function parseDecision(value, label) {
  const input = asObject(value, label);
  const status = input.status;
  if (status !== "open" && status !== "resolved") throw new Error(`${label}.status must be "open" or "resolved"`);
  return {
    id: validateMissionId(input.id, `${label}.id`),
    status,
    title: requiredString(input.title, `${label}.title`),
    createdAt: timestamp(input.createdAt, `${label}.createdAt`),
    ...optionalString(input.prompt, `${label}.prompt`) ? { prompt: input.prompt } : {},
    ...input.options !== void 0 ? { options: stringArray(input.options, `${label}.options`) } : {},
    ...optionalString(input.recommendation, `${label}.recommendation`) ? { recommendation: input.recommendation } : {},
    ...input.resolvedAt !== void 0 ? { resolvedAt: timestamp(input.resolvedAt, `${label}.resolvedAt`) } : {},
    ...optionalString(input.resolution, `${label}.resolution`) ? { resolution: input.resolution } : {}
  };
}
function parseWorkflowChild(value, label) {
  const input = asObject(value, label);
  const artifactPaths = input.artifactPaths === void 0 ? [] : stringArray(input.artifactPaths, `${label}.artifactPaths`);
  const heartbeat = input.heartbeat === void 0 ? void 0 : asObject(input.heartbeat, `${label}.heartbeat`);
  return {
    workflowRunId: requiredString(input.workflowRunId, `${label}.workflowRunId`),
    key: validateMissionId(input.key, `${label}.key`),
    status: requiredString(input.status, `${label}.status`),
    startedAt: timestamp(input.startedAt, `${label}.startedAt`),
    updatedAt: timestamp(input.updatedAt, `${label}.updatedAt`),
    artifactPaths,
    ...optionalString(input.runId, `${label}.runId`) ? { runId: input.runId } : {},
    ...optionalString(input.agent, `${label}.agent`) ? { agent: input.agent } : {},
    ...optionalString(input.task, `${label}.task`) ? { task: input.task } : {},
    ...optionalString(input.label, `${label}.label`) ? { label: input.label } : {},
    ...optionalString(input.phase, `${label}.phase`) ? { phase: input.phase } : {},
    ...input.completedAt !== void 0 ? { completedAt: timestamp(input.completedAt, `${label}.completedAt`) } : {},
    ...optionalString(input.sessionPath, `${label}.sessionPath`) ? { sessionPath: input.sessionPath } : {},
    ...heartbeat ? { heartbeat: {
      updatedAt: timestamp(heartbeat.updatedAt, `${label}.heartbeat.updatedAt`),
      ...optionalString(heartbeat.status, `${label}.heartbeat.status`) ? { status: heartbeat.status } : {},
      ...optionalString(heartbeat.phase, `${label}.heartbeat.phase`) ? { phase: heartbeat.phase } : {},
      ...optionalString(heartbeat.message, `${label}.heartbeat.message`) ? { message: heartbeat.message } : {}
    } } : {}
  };
}
function parseArtifact(value, label) {
  const input = asObject(value, label);
  const kind = requiredString(input.kind, `${label}.kind`);
  if (!MISSION_ARTIFACT_KINDS.has(kind)) throw new Error(`${label}.kind is invalid`);
  return {
    kind,
    path: requiredString(input.path, `${label}.path`),
    ...optionalString(input.description, `${label}.description`) ? { description: input.description } : {}
  };
}
function parseReceipt(value, label) {
  const input = asObject(value, label);
  const kind = requiredString(input.kind, `${label}.kind`);
  const status = requiredString(input.status, `${label}.status`);
  if (!MISSION_RECEIPT_KINDS.has(kind)) throw new Error(`${label}.kind is invalid`);
  if (!MISSION_RECEIPT_STATUSES.has(status)) throw new Error(`${label}.status is invalid`);
  const url = requiredString(input.url, `${label}.url`);
  try {
    new URL(url);
  } catch {
    throw new Error(`${label}.url must be an absolute URL`);
  }
  return {
    kind,
    status,
    title: requiredString(input.title, `${label}.title`),
    url,
    createdAt: timestamp(input.createdAt, `${label}.createdAt`),
    ...optionalString(input.description, `${label}.description`) ? { description: input.description } : {}
  };
}
function parseMissionRecord(value, source = "mission record") {
  const input = asObject(value, source);
  if (input.schemaVersion !== 1) throw new Error(`${source}.schemaVersion must be 1`);
  if (!Array.isArray(input.runs)) throw new Error(`${source}.runs must be an array`);
  if (input.workflowChildren !== void 0 && !Array.isArray(input.workflowChildren)) throw new Error(`${source}.workflowChildren must be an array`);
  if (!Array.isArray(input.decisions)) throw new Error(`${source}.decisions must be an array`);
  if (!Array.isArray(input.artifacts)) throw new Error(`${source}.artifacts must be an array`);
  if (input.receipts !== void 0 && !Array.isArray(input.receipts)) throw new Error(`${source}.receipts must be an array`);
  const runs = input.runs;
  const workflowChildren = input.workflowChildren ?? [];
  const decisions = input.decisions;
  const artifacts = input.artifacts;
  const receipts = input.receipts ?? [];
  const goal = input.goal !== void 0 ? parseGoal(input.goal, `${source}.goal`) : void 0;
  const budget = input.budget !== void 0 ? parseBudget(input.budget, `${source}.budget`) : void 0;
  const usage = input.usage !== void 0 ? parseUsage(input.usage, `${source}.usage`) : void 0;
  const objective = optionalString(input.objective, `${source}.objective`)?.trim();
  if (!objective) throw new Error(`${source}.objective must be a non-empty string`);
  if (goal && !budget) throw new Error(`${source}.budget is required for a goal mission`);
  return {
    schemaVersion: 1,
    id: validateMissionId(input.id, `${source}.id`),
    title: requiredString(input.title, `${source}.title`),
    objective,
    ...goal ? { goal } : {},
    ...budget ? { budget } : {},
    ...usage ? { usage } : {},
    status: missionStatus(input.status, `${source}.status`),
    createdAt: timestamp(input.createdAt, `${source}.createdAt`),
    updatedAt: timestamp(input.updatedAt, `${source}.updatedAt`),
    runs: runs.map((item, index) => parseRunLink(item, `${source}.runs[${index}]`)),
    workflowChildren: workflowChildren.map((item, index) => parseWorkflowChild(item, `${source}.workflowChildren[${index}]`)),
    decisions: decisions.map((item, index) => parseDecision(item, `${source}.decisions[${index}]`)),
    artifacts: artifacts.map((item, index) => parseArtifact(item, `${source}.artifacts[${index}]`)),
    receipts: receipts.map((item, index) => parseReceipt(item, `${source}.receipts[${index}]`)),
    ...optionalString(input.cwd, `${source}.cwd`) ? { cwd: input.cwd } : {},
    ...optionalString(input.ownerSessionId, `${source}.ownerSessionId`) ? { ownerSessionId: input.ownerSessionId } : {},
    ...optionalString(input.summary, `${source}.summary`) ? { summary: input.summary } : {},
    ...input.acceptance !== void 0 ? { acceptance: input.acceptance } : {},
    ...input.labels !== void 0 ? { labels: stringArray(input.labels, `${source}.labels`) } : {}
  };
}
function expandConfiguredPath(value, projectRoot) {
  const expanded = value.startsWith("~/") ? path9.join(os.homedir(), value.slice(2)) : value;
  return path9.isAbsolute(expanded) ? path9.normalize(expanded) : path9.resolve(projectRoot, expanded);
}
function projectMissionDirectory(agentDir, projectRoot) {
  const projectKey = createHash3("sha256").update(projectRoot).digest("hex");
  return path9.join(agentDir, "missions", "projects", projectKey);
}
function validateMissionStoreConfig(value, label = "config.missions") {
  if (value === void 0) return void 0;
  const input = asObject(value, label);
  for (const key of Object.keys(input)) {
    if (key !== "enabled" && key !== "directory" && key !== "globalIndex" && key !== "globalIndexDir" && key !== "retainTerminal") {
      throw new Error(`${label}.${key} is unknown`);
    }
  }
  if (input.enabled !== void 0 && typeof input.enabled !== "boolean") throw new Error(`${label}.enabled must be boolean`);
  if (input.globalIndex !== void 0 && typeof input.globalIndex !== "boolean") throw new Error(`${label}.globalIndex must be boolean`);
  if (input.retainTerminal !== void 0 && (!Number.isInteger(input.retainTerminal) || input.retainTerminal < 1)) {
    throw new Error(`${label}.retainTerminal must be a positive integer`);
  }
  const directory = optionalString(input.directory, `${label}.directory`);
  const globalIndexDir = optionalString(input.globalIndexDir, `${label}.globalIndexDir`);
  return {
    ...typeof input.enabled === "boolean" ? { enabled: input.enabled } : {},
    ...directory ? { directory } : {},
    ...typeof input.globalIndex === "boolean" ? { globalIndex: input.globalIndex } : {},
    ...globalIndexDir ? { globalIndexDir } : {},
    ...input.retainTerminal !== void 0 ? { retainTerminal: input.retainTerminal } : {}
  };
}
function canonicalProjectRoot(root) {
  const missing = [];
  let current = root;
  for (; ; ) {
    try {
      return path9.join(fs8.realpathSync.native(current), ...missing.reverse());
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path9.dirname(current);
      if (parent === current) return root;
      missing.push(path9.basename(current));
      current = parent;
    }
  }
}
function resolveMissionStoreLocation(input) {
  const givenRoot = path9.resolve(input.projectRoot);
  const configuredDir = input.config?.directory;
  const projectRoot = configuredDir ? givenRoot : canonicalProjectRoot(givenRoot);
  const agentDir = input.agentDir ?? getAgentDir();
  const missionDir = configuredDir ? expandConfiguredPath(configuredDir, givenRoot) : projectMissionDirectory(agentDir, projectRoot);
  const globalIndexDir = input.config?.globalIndexDir ? expandConfiguredPath(input.config.globalIndexDir, givenRoot) : path9.join(agentDir, "missions", "index");
  return {
    projectRoot,
    missionDir,
    globalIndexDir,
    writeGlobalIndex: input.config?.globalIndex !== false,
    ...input.config?.retainTerminal !== void 0 ? { retainTerminal: input.config.retainTerminal } : {}
  };
}
function missionRecordPath(location, missionId) {
  return path9.join(location.missionDir, `${validateMissionId(missionId)}.json`);
}
function parseIndexEntry(value, source) {
  const input = asObject(value, source);
  if (input.schemaVersion !== 1) throw new Error(`${source}.schemaVersion must be 1`);
  return {
    schemaVersion: 1,
    missionId: validateMissionId(input.missionId, `${source}.missionId`),
    projectRoot: requiredString(input.projectRoot, `${source}.projectRoot`),
    recordPath: requiredString(input.recordPath, `${source}.recordPath`),
    title: requiredString(input.title, `${source}.title`),
    status: missionStatus(input.status, `${source}.status`),
    updatedAt: timestamp(input.updatedAt, `${source}.updatedAt`),
    ...optionalString(input.lastRunId, `${source}.lastRunId`) ? { lastRunId: input.lastRunId } : {}
  };
}
function indexPath(location, record) {
  const key = createHash3("sha256").update(`${location.projectRoot}\0${record.id}`).digest("hex");
  return path9.join(location.globalIndexDir, `${key}.json`);
}
function writeMission(location, record) {
  const validated = parseMissionRecord(record);
  writePrivateAtomicJson(missionRecordPath(location, validated.id), validated);
  if (location.writeGlobalIndex) {
    const lastRunId = validated.runs.at(-1)?.runId;
    const entry = {
      schemaVersion: 1,
      missionId: validated.id,
      projectRoot: location.projectRoot,
      recordPath: missionRecordPath(location, validated.id),
      title: validated.title,
      status: validated.status,
      updatedAt: validated.updatedAt,
      ...lastRunId ? { lastRunId } : {}
    };
    writePrivateAtomicJson(indexPath(location, validated), entry);
  }
  return validated;
}
function pruneTerminalMissions(location, maxTerminal) {
  const terminal3 = listMissions(location).records.filter((record) => TERMINAL_MISSION_STATUSES.has(record.status)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  for (const record of terminal3.slice(maxTerminal)) {
    try {
      fs8.rmSync(missionRecordPath(location, record.id), { force: true });
      fs8.rmSync(path9.join(location.missionDir, record.id), { recursive: true, force: true });
      if (location.writeGlobalIndex) fs8.rmSync(indexPath(location, record), { force: true });
    } catch {
    }
  }
}
function createMission(location, input, now = /* @__PURE__ */ new Date(), retainTerminal = location.retainTerminal ?? DEFAULT_TERMINAL_MISSION_RETENTION) {
  const createdAt = now.toISOString();
  const record = {
    schemaVersion: 1,
    id: randomUUID4(),
    title: requiredString(input.title, "mission.title").trim(),
    objective: requiredString(input.objective, "mission.objective").trim(),
    ...input.goal === true ? { goal: { status: "active" } } : {},
    ...input.budget ? { budget: parseBudget(input.budget, "mission.budget") } : {},
    ...input.goal === true ? { usage: { tokens: 0 } } : {},
    status: input.status ?? "planned",
    createdAt,
    updatedAt: createdAt,
    cwd: location.projectRoot,
    runs: [],
    workflowChildren: [],
    decisions: [],
    artifacts: [],
    receipts: [],
    ...input.ownerSessionId ? { ownerSessionId: requiredString(input.ownerSessionId, "mission.ownerSessionId") } : {},
    ...input.labels ? { labels: stringArray(input.labels, "mission.labels") } : {}
  };
  if (input.goal === true && !input.budget) throw new Error("mission.budget is required when mission.goal is true");
  const created = writeMission(location, record);
  pruneTerminalMissions(location, retainTerminal);
  return created;
}
var MissionNotFoundError = class extends Error {
  code = "MISSION_NOT_FOUND";
  missionId;
  missionDir;
  constructor(missionId, location) {
    super(`Mission '${missionId}' was not found in mission directory '${location.missionDir}' for project root '${location.projectRoot}'. If it was created in another worktree, run the request from that worktree.`);
    this.name = "MissionNotFoundError";
    this.missionId = missionId;
    this.missionDir = location.missionDir;
  }
};
function readMission(location, missionId) {
  const filePath = missionRecordPath(location, missionId);
  let raw;
  try {
    raw = fs8.readFileSync(filePath, "utf-8");
  } catch (error) {
    if (error.code === "ENOENT") throw new MissionNotFoundError(missionId, location);
    throw error;
  }
  try {
    return parseMissionRecord(JSON.parse(raw), filePath);
  } catch (error) {
    throw new Error(`Invalid mission file '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
  }
}
function listMissions(location) {
  if (!fs8.existsSync(location.missionDir)) return { records: [], warnings: [] };
  const records = [];
  const warnings = [];
  for (const name of fs8.readdirSync(location.missionDir).filter((item) => item.endsWith(".json")).sort()) {
    const filePath = path9.join(location.missionDir, name);
    try {
      records.push(parseMissionRecord(JSON.parse(fs8.readFileSync(filePath, "utf-8")), filePath));
    } catch (error) {
      warnings.push(`Skipped corrupt mission '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return { records, warnings };
}
function updateMission(location, missionId, update, now = /* @__PURE__ */ new Date(), retainTerminal = location.retainTerminal ?? DEFAULT_TERMINAL_MISSION_RETENTION) {
  const current = readMission(location, missionId);
  const runs = [...current.runs];
  for (const candidate of update.addRuns ?? []) {
    const run = parseRunLink(candidate, "mission.update.addRuns[]");
    const existingIndex = runs.findIndex((item) => item.runId === run.runId && item.childIndex === run.childIndex);
    if (existingIndex === -1) runs.push(run);
    else runs[existingIndex] = { ...runs[existingIndex], ...run };
  }
  const workflowChildren = [...current.workflowChildren];
  for (const candidate of update.upsertWorkflowChildren ?? []) {
    const nowIso = now.toISOString();
    const parsed = parseWorkflowChild({
      ...candidate,
      startedAt: candidate.startedAt ?? nowIso,
      updatedAt: nowIso,
      artifactPaths: candidate.artifactPaths ?? [],
      ...candidate.heartbeat ? { heartbeat: { ...candidate.heartbeat, updatedAt: nowIso } } : {}
    }, "mission.update.upsertWorkflowChildren[]");
    const existingIndex = workflowChildren.findIndex((child) => child.workflowRunId === parsed.workflowRunId && child.key === parsed.key);
    if (existingIndex === -1) workflowChildren.push(parsed);
    else {
      const existing = workflowChildren[existingIndex];
      workflowChildren[existingIndex] = parseWorkflowChild({
        ...existing,
        ...parsed,
        startedAt: existing.startedAt,
        artifactPaths: [.../* @__PURE__ */ new Set([...existing.artifactPaths, ...parsed.artifactPaths])]
      }, "mission.update.upsertWorkflowChildren[]");
    }
  }
  const artifacts = [...current.artifacts];
  for (const candidate of update.addArtifacts ?? []) {
    const artifact = parseArtifact(candidate, "mission.update.addArtifacts[]");
    const existingIndex = artifacts.findIndex((item) => item.kind === artifact.kind && path9.resolve(item.path) === path9.resolve(artifact.path));
    if (existingIndex === -1) artifacts.push(artifact);
    else artifacts[existingIndex] = { ...artifacts[existingIndex], ...artifact };
  }
  const createdAt = now.toISOString();
  const receipts = [...current.receipts];
  for (const candidate of update.addReceipts ?? []) {
    const receipt = parseReceipt({ ...candidate, createdAt }, "mission.update.addReceipts[]");
    const existingIndex = receipts.findIndex((item) => item.kind === receipt.kind && item.url === receipt.url);
    if (existingIndex === -1) receipts.push(receipt);
    else receipts[existingIndex] = { ...receipt, createdAt: receipts[existingIndex].createdAt };
  }
  const decisions = [
    ...current.decisions,
    ...(update.addDecisions ?? []).map((decision) => ({
      id: randomUUID4(),
      status: "open",
      title: requiredString(decision.title, "mission.update.addDecisions[].title"),
      createdAt,
      ...decision.prompt ? { prompt: requiredString(decision.prompt, "mission.update.addDecisions[].prompt") } : {},
      ...decision.options ? { options: stringArray(decision.options, "mission.update.addDecisions[].options") } : {},
      ...decision.recommendation ? { recommendation: requiredString(decision.recommendation, "mission.update.addDecisions[].recommendation") } : {}
    }))
  ];
  if (update.resolveDecision) {
    const decisionId = validateMissionId(update.resolveDecision.id, "mission.update.resolveDecision.id");
    const decisionIndex = decisions.findIndex((decision) => decision.id === decisionId);
    if (decisionIndex === -1) throw new Error(`Decision '${decisionId}' was not found in mission '${missionId}'`);
    if (decisions[decisionIndex].status === "resolved") throw new Error(`Decision '${decisionId}' is already resolved`);
    decisions[decisionIndex] = {
      ...decisions[decisionIndex],
      status: "resolved",
      resolvedAt: createdAt,
      resolution: requiredString(update.resolveDecision.resolution, "mission.update.resolveDecision.resolution").trim()
    };
  }
  const budget = update.budget !== void 0 ? parseBudget(update.budget, "mission.update.budget") : current.budget;
  const usage = update.usage !== void 0 ? parseUsage(update.usage, "mission.update.usage") : { tokens: runs.reduce((total, run) => total + (run.usage?.tokens ?? 0), 0) };
  let goal = update.goal === false ? void 0 : update.goal !== void 0 ? parseGoal(update.goal, "mission.update.goal") : current.goal;
  if (goal && !budget) throw new Error("mission.update.budget is required when enabling a goal mission");
  if (goal && budget) {
    goal = usage.tokens >= budget.tokens ? { status: "budget-exhausted" } : goal.status === "budget-exhausted" ? { status: "active" } : goal;
  }
  const hasOpenDecisions = decisions.some((decision) => decision.status === "open");
  const requestedStatus = update.status !== void 0 ? missionStatus(update.status, "mission.update.status") : void 0;
  const candidateStatus = requestedStatus ?? (update.addDecisions?.length && current.status === "active" ? "needs_decision" : update.resolveDecision && current.status === "needs_decision" && !hasOpenDecisions ? "active" : current.status);
  const decisionStatus = hasOpenDecisions && (candidateStatus === "active" || candidateStatus === "completed") ? "needs_decision" : candidateStatus;
  const next = {
    ...current,
    updatedAt: createdAt,
    runs,
    workflowChildren,
    artifacts,
    receipts,
    decisions,
    ...update.title !== void 0 ? { title: requiredString(update.title, "mission.update.title").trim() } : {},
    ...update.objective !== void 0 ? { objective: requiredString(update.objective, "mission.update.objective").trim() } : {},
    ...budget ? { budget } : {},
    ...goal ? { goal, usage } : {},
    status: decisionStatus,
    ...update.summary !== void 0 ? { summary: requiredString(update.summary, "mission.update.summary") } : {},
    ...update.labels !== void 0 ? { labels: stringArray(update.labels, "mission.update.labels") } : {},
    ...update.acceptance !== void 0 ? { acceptance: update.acceptance } : {}
  };
  if (!goal) delete next.goal;
  const updated = writeMission(location, next);
  if (TERMINAL_MISSION_STATUSES.has(updated.status)) pruneTerminalMissions(location, retainTerminal);
  return updated;
}
function listGlobalMissions(globalIndexDir) {
  if (!fs8.existsSync(globalIndexDir)) return { entries: [], warnings: [] };
  const entries = [];
  const warnings = [];
  for (const name of fs8.readdirSync(globalIndexDir).filter((item) => item.endsWith(".json")).sort()) {
    const filePath = path9.join(globalIndexDir, name);
    try {
      const entry = parseIndexEntry(JSON.parse(fs8.readFileSync(filePath, "utf-8")), filePath);
      try {
        const record = parseMissionRecord(JSON.parse(fs8.readFileSync(entry.recordPath, "utf-8")), entry.recordPath);
        if (record.id !== entry.missionId) throw new Error(`record id '${record.id}' does not match index id '${entry.missionId}'`);
        const projection = {
          ...entry,
          title: record.title,
          status: record.status,
          updatedAt: record.updatedAt
        };
        delete projection.lastRunId;
        const lastRunId = record.runs.at(-1)?.runId;
        if (lastRunId) projection.lastRunId = lastRunId;
        entries.push({ ...projection, stale: false });
      } catch (error) {
        if (error.code === "ENOENT") {
          try {
            fs8.rmSync(filePath, { force: true });
            warnings.push(`Removed stale global mission pointer '${filePath}' because '${entry.recordPath}' no longer exists.`);
          } catch (removeError) {
            warnings.push(`Failed to remove stale global mission pointer '${filePath}': ${removeError instanceof Error ? removeError.message : String(removeError)}`);
          }
          continue;
        }
        entries.push({ ...entry, stale: true, staleReason: error instanceof Error ? error.message : String(error) });
      }
    } catch (error) {
      warnings.push(`Skipped corrupt global mission index entry '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  entries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return { entries, warnings };
}

// src/missions/workflow-state.ts
import { execFileSync } from "node:child_process";
import { randomUUID as randomUUID5 } from "node:crypto";
import * as fs9 from "node:fs";
import * as path10 from "node:path";
var STATE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
var STATE_LOCK_STALE_MS = 6e4;
var MISSION_STATE_MAX_BYTES = 256 * 1024;
function missionStatePath(location, missionId) {
  return path10.join(location.missionDir, validateMissionId(missionId), "state.json");
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
function linuxProcessStartKey(pid) {
  try {
    const raw = fs9.readFileSync(`/proc/${pid}/stat`, "utf-8");
    const tail = raw.slice(raw.lastIndexOf(")") + 2).trim().split(/\s+/);
    return tail[19] ? `linux:${tail[19]}` : void 0;
  } catch {
    return void 0;
  }
}
function psProcessStartKey(pid) {
  try {
    const raw = execFileSync("ps", ["-p", String(pid), "-o", "lstart="], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], timeout: 1e3 }).trim();
    return raw ? `ps:${raw}` : void 0;
  } catch {
    return void 0;
  }
}
function windowsProcessStartKey(pid) {
  try {
    const raw = execFileSync("powershell.exe", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CreationDate`], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], timeout: 1e3, windowsHide: true }).trim();
    return raw ? `win:${raw}` : void 0;
  } catch {
    return void 0;
  }
}
var currentProcessKey = null;
function processStartKey(pid) {
  if (pid !== process.pid) return computeProcessStartKey(pid);
  if (currentProcessKey === null) currentProcessKey = computeProcessStartKey(pid);
  return currentProcessKey;
}
function computeProcessStartKey(pid) {
  if (process.platform === "linux") return linuxProcessStartKey(pid) ?? psProcessStartKey(pid);
  if (process.platform === "win32") return windowsProcessStartKey(pid);
  return void 0;
}
function readStateLockOwner(lockPath) {
  try {
    const owner = JSON.parse(fs9.readFileSync(path10.join(lockPath, "owner.json"), "utf-8"));
    if (Number.isSafeInteger(owner.pid) && owner.pid > 0 && typeof owner.token === "string" && owner.token && Number.isSafeInteger(owner.createdAt)) {
      return {
        pid: owner.pid,
        token: owner.token,
        createdAt: owner.createdAt,
        ...typeof owner.processKey === "string" && owner.processKey ? { processKey: owner.processKey } : {}
      };
    }
  } catch {
    return void 0;
  }
  return void 0;
}
function stateLockIsStale(lockPath, options, now = Date.now()) {
  const owner = readStateLockOwner(lockPath);
  if (owner) {
    if (!options.isProcessAlive(owner.pid)) return true;
    if (owner.processKey) {
      const observedProcessKey = options.getProcessStartKey(owner.pid);
      if (observedProcessKey) return owner.processKey !== observedProcessKey;
      if (owner.pid === process.pid) return true;
    }
    return false;
  }
  try {
    return now - fs9.statSync(lockPath).mtimeMs > STATE_LOCK_STALE_MS;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
function removeOwnedStateLock(lockPath, owner) {
  const current = readStateLockOwner(lockPath);
  if (current?.token !== owner.token) return;
  fs9.rmSync(lockPath, { recursive: true, force: true });
}
function staleDirectoryExists(dirPath, now = Date.now()) {
  try {
    return now - fs9.statSync(dirPath).mtimeMs > STATE_LOCK_STALE_MS;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
function tryMakeDirectory(dirPath, mode) {
  try {
    fs9.mkdirSync(dirPath, { mode });
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
}
function waitForStateLock(delayMs, lockPath) {
  if (delayMs === void 0) throw new Error(`Timed out acquiring mission state lock '${lockPath}'.`);
  waitForFileSystemRetry(delayMs);
}
function reclaimStaleStateLock(lockPath, reclaimPath, options) {
  if (!stateLockIsStale(lockPath, options)) return false;
  if (!tryMakeDirectory(reclaimPath, 448)) return false;
  try {
    if (!stateLockIsStale(lockPath, options)) return false;
    fs9.rmSync(lockPath, { recursive: true, force: true });
    return true;
  } finally {
    fs9.rmSync(reclaimPath, { recursive: true, force: true });
  }
}
function withStateFileLock(filePath, operation, options) {
  fs9.mkdirSync(path10.dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  const reclaimPath = `${lockPath}.reclaim`;
  let owner;
  for (let attempt = 0; ; attempt++) {
    if (fs9.existsSync(reclaimPath)) {
      if (staleDirectoryExists(reclaimPath)) {
        fs9.rmSync(reclaimPath, { recursive: true, force: true });
        continue;
      }
      waitForStateLock(options.retryDelaysMs[attempt], lockPath);
      continue;
    }
    let acquired = false;
    try {
      acquired = tryMakeDirectory(lockPath, 448);
    } catch (error) {
      if (isRetryableFileSystemError(error)) {
        waitForStateLock(options.retryDelaysMs[attempt], lockPath);
        continue;
      }
      throw new Error(`Failed to acquire mission state lock '${lockPath}': ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!acquired) {
      if (reclaimStaleStateLock(lockPath, reclaimPath, options)) continue;
      waitForStateLock(options.retryDelaysMs[attempt], lockPath);
      continue;
    }
    const key = options.getProcessStartKey(process.pid);
    owner = { pid: process.pid, token: randomUUID5(), createdAt: Date.now(), ...key ? { processKey: key } : {} };
    try {
      fs9.writeFileSync(path10.join(lockPath, "owner.json"), JSON.stringify(owner), { encoding: "utf-8", mode: 384 });
    } catch (error) {
      fs9.rmSync(lockPath, { recursive: true, force: true });
      owner = void 0;
      throw error;
    }
    break;
  }
  try {
    return operation();
  } finally {
    if (owner) removeOwnedStateLock(lockPath, owner);
  }
}
function validateStateKey(value) {
  if (typeof value !== "string" || !STATE_KEY_PATTERN.test(value)) {
    throw new Error("state key must be 1-128 characters using letters, numbers, '.', '_' or '-', and start with a letter or number.");
  }
  return value;
}
function createMissionWorkflowState(location, missionId, options = {}) {
  const filePath = missionStatePath(location, missionId);
  const lockOptions = {
    isProcessAlive: options.isProcessAlive ?? isProcessAlive,
    getProcessStartKey: options.getProcessStartKey ?? processStartKey,
    retryDelaysMs: options.retryDelaysMs ?? DEFAULT_FILE_SYSTEM_RETRY_DELAYS_MS
  };
  let loaded = false;
  let values = /* @__PURE__ */ Object.create(null);
  const readStateFile = () => {
    let raw;
    try {
      raw = fs9.readFileSync(filePath, "utf-8");
    } catch (error) {
      if (error.code === "ENOENT") return /* @__PURE__ */ Object.create(null);
      throw new Error(`Failed to read mission state '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
    }
    const bytes = Buffer.byteLength(raw);
    if (bytes > MISSION_STATE_MAX_BYTES) throw new Error(`Mission state file '${filePath}' exceeds the 256 KiB limit (${bytes} bytes).`);
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("root must be a JSON object");
      assertWorkflowJsonValue(parsed, "mission state");
      return Object.assign(/* @__PURE__ */ Object.create(null), parsed);
    } catch (error) {
      throw new Error(`Invalid mission state file '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const load = () => {
    if (loaded) return values;
    values = readStateFile();
    loaded = true;
    return values;
  };
  return {
    path: filePath,
    get(key) {
      const validKey = validateStateKey(key);
      const current = load();
      return Object.hasOwn(current, validKey) ? current[validKey] : void 0;
    },
    set(key, value) {
      const validKey = validateStateKey(key);
      assertWorkflowJsonValue(value, `state.set('${validKey}') value`);
      withStateFileLock(filePath, () => {
        const next = Object.assign(/* @__PURE__ */ Object.create(null), readStateFile(), { [validKey]: value });
        const bytes = Buffer.byteLength(JSON.stringify(next, null, 2));
        if (bytes > MISSION_STATE_MAX_BYTES) throw new Error(`Mission state exceeds the 256 KiB limit (${bytes} bytes; maximum ${MISSION_STATE_MAX_BYTES} bytes).`);
        writePrivateAtomicJson(filePath, next);
        values = next;
        loaded = true;
      }, lockOptions);
    }
  };
}

// src/missions/actions.ts
import * as fs10 from "node:fs";
import * as path11 from "node:path";
var MISSION_ACTIONS = [
  "mission.create",
  "mission.list",
  "mission.show",
  "mission.update",
  "mission.resolve-decision",
  "mission.attach-run",
  "mission.close"
];
function textResult(text, details) {
  return { content: [{ type: "text", text }], details };
}
function requireMissionId(params) {
  return validateMissionId(params.missionId, "missionId");
}
function validateStatus(value, label) {
  if (typeof value !== "string" || !MISSION_STATUSES.includes(value)) {
    throw new Error(`${label} must be one of ${MISSION_STATUSES.join(", ")}`);
  }
  return value;
}
function validateMissionLaunch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("mission must be an object");
  const input = value;
  for (const key of Object.keys(input)) {
    if (key !== "title" && key !== "summary" && key !== "objective" && key !== "goal" && key !== "budget" && key !== "labels") throw new Error(`mission.${key} is unknown`);
  }
  if (input.title !== void 0 && input.summary !== void 0) throw new Error("mission.title and mission.summary cannot both be set");
  const title = input.title ?? input.summary;
  if (typeof title !== "string" || !title.trim()) throw new Error("mission.title or mission.summary must be a non-empty string");
  if (input.objective !== void 0 && (typeof input.objective !== "string" || !input.objective.trim())) throw new Error("mission.objective must be a non-empty string");
  if (input.goal !== void 0 && input.goal !== true) throw new Error("mission.goal must be true when supplied");
  const budget = input.budget;
  if (budget !== void 0 && (!budget || typeof budget !== "object" || Array.isArray(budget) || !Number.isSafeInteger(budget.tokens) || budget.tokens < 1)) {
    throw new Error("mission.budget.tokens must be a positive integer");
  }
  if (input.goal === true && budget === void 0) throw new Error("mission.budget is required when mission.goal is true");
  if (input.labels !== void 0 && (!Array.isArray(input.labels) || input.labels.some((label) => typeof label !== "string" || !label.trim()))) {
    throw new Error("mission.labels must contain only non-empty strings");
  }
  return {
    title: title.trim(),
    ...typeof input.objective === "string" ? { objective: input.objective.trim() } : {},
    ...input.goal === true ? { goal: true } : {},
    ...budget !== void 0 ? { budget: { tokens: budget.tokens } } : {},
    ...input.labels !== void 0 ? { labels: input.labels.map((label) => label.trim()) } : {}
  };
}
function validateArtifact(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`missionUpdate.artifacts[${index}] must be an object`);
  const input = value;
  const kinds = ["status", "output", "patch", "manifest", "review", "note", "other"];
  if (typeof input.kind !== "string" || !kinds.includes(input.kind)) throw new Error(`missionUpdate.artifacts[${index}].kind is invalid`);
  if (typeof input.path !== "string" || !input.path.trim()) throw new Error(`missionUpdate.artifacts[${index}].path must be a non-empty string`);
  if (input.description !== void 0 && (typeof input.description !== "string" || !input.description.trim())) throw new Error(`missionUpdate.artifacts[${index}].description must be a non-empty string`);
  return {
    kind: input.kind,
    path: input.path,
    ...typeof input.description === "string" ? { description: input.description } : {}
  };
}
function validateReceipt(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`missionUpdate.receipts[${index}] must be an object`);
  const input = value;
  for (const key of Object.keys(input)) {
    if (!["kind", "status", "title", "url", "description"].includes(key)) throw new Error(`missionUpdate.receipts[${index}].${key} is unknown`);
  }
  const kinds = ["pull_request", "ci", "deployment", "release"];
  const statuses = ["pending", "ready", "succeeded", "failed"];
  if (typeof input.kind !== "string" || !kinds.includes(input.kind)) throw new Error(`missionUpdate.receipts[${index}].kind is invalid`);
  if (typeof input.status !== "string" || !statuses.includes(input.status)) throw new Error(`missionUpdate.receipts[${index}].status is invalid`);
  for (const field of ["title", "url"]) {
    if (typeof input[field] !== "string" || !input[field].trim()) throw new Error(`missionUpdate.receipts[${index}].${field} must be a non-empty string`);
  }
  try {
    new URL(input.url);
  } catch {
    throw new Error(`missionUpdate.receipts[${index}].url must be an absolute URL`);
  }
  if (input.description !== void 0 && (typeof input.description !== "string" || !input.description.trim())) throw new Error(`missionUpdate.receipts[${index}].description must be a non-empty string`);
  return {
    kind: input.kind,
    status: input.status,
    title: input.title.trim(),
    url: input.url.trim(),
    ...typeof input.description === "string" ? { description: input.description.trim() } : {}
  };
}
function validateMissionUpdate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("missionUpdate must be an object");
  const input = value;
  for (const key of Object.keys(input)) {
    if (!["title", "objective", "goal", "budget", "status", "summary", "labels", "artifacts", "receipts", "decisions"].includes(key)) throw new Error(`missionUpdate.${key} is unknown`);
  }
  const update = {};
  for (const field of ["title", "objective", "summary"]) {
    const candidate = input[field];
    if (candidate === void 0) continue;
    if (typeof candidate !== "string" || !candidate.trim()) throw new Error(`missionUpdate.${field} must be a non-empty string`);
    update[field] = candidate.trim();
  }
  if (input.goal !== void 0) {
    if (typeof input.goal === "boolean") update.goal = input.goal ? { status: "active" } : false;
    else {
      if (!input.goal || typeof input.goal !== "object" || Array.isArray(input.goal) || typeof input.goal.paused !== "boolean" || Object.keys(input.goal).some((key) => key !== "paused")) {
        throw new Error("missionUpdate.goal must be boolean or { paused: boolean }");
      }
      update.goal = { status: input.goal.paused ? "paused" : "active" };
    }
  }
  if (input.budget !== void 0) {
    if (!input.budget || typeof input.budget !== "object" || Array.isArray(input.budget) || !Number.isSafeInteger(input.budget.tokens) || input.budget.tokens < 1) {
      throw new Error("missionUpdate.budget.tokens must be a positive integer");
    }
    update.budget = { tokens: input.budget.tokens };
  }
  if (input.status !== void 0) update.status = validateStatus(input.status, "missionUpdate.status");
  if (input.labels !== void 0) {
    if (!Array.isArray(input.labels) || input.labels.some((label) => typeof label !== "string" || !label.trim())) throw new Error("missionUpdate.labels must contain only non-empty strings");
    update.labels = input.labels;
  }
  if (input.artifacts !== void 0) {
    if (!Array.isArray(input.artifacts)) throw new Error("missionUpdate.artifacts must be an array");
    update.addArtifacts = input.artifacts.map(validateArtifact);
  }
  if (input.receipts !== void 0) {
    if (!Array.isArray(input.receipts)) throw new Error("missionUpdate.receipts must be an array");
    update.addReceipts = input.receipts.map(validateReceipt);
  }
  if (input.decisions !== void 0) {
    if (!Array.isArray(input.decisions)) throw new Error("missionUpdate.decisions must be an array");
    update.addDecisions = input.decisions.map((value2, index) => {
      if (!value2 || typeof value2 !== "object" || Array.isArray(value2)) throw new Error(`missionUpdate.decisions[${index}] must be an object`);
      const decision = value2;
      if (typeof decision.title !== "string" || !decision.title.trim()) throw new Error(`missionUpdate.decisions[${index}].title must be a non-empty string`);
      if (decision.options !== void 0 && (!Array.isArray(decision.options) || decision.options.some((option) => typeof option !== "string" || !option.trim()))) throw new Error(`missionUpdate.decisions[${index}].options must contain only non-empty strings`);
      return {
        title: decision.title.trim(),
        ...typeof decision.prompt === "string" && decision.prompt.trim() ? { prompt: decision.prompt } : {},
        ...Array.isArray(decision.options) ? { options: decision.options } : {},
        ...typeof decision.recommendation === "string" && decision.recommendation.trim() ? { recommendation: decision.recommendation } : {}
      };
    });
  }
  if (Object.keys(update).length === 0) throw new Error("missionUpdate must include at least one supported field");
  return update;
}
function refreshLinkedRunStatus(location, record) {
  const warnings = [];
  const updates = record.runs.flatMap((run) => {
    if (!run.asyncDir) return [];
    const statusPath = path11.join(run.asyncDir, "status.json");
    if (!fs10.existsSync(statusPath)) return [];
    let status2;
    try {
      status2 = JSON.parse(fs10.readFileSync(statusPath, "utf-8"));
    } catch (error) {
      warnings.push(`Failed to read linked run status '${statusPath}': ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
    if (!status2 || typeof status2 !== "object" || Array.isArray(status2)) {
      warnings.push(`Linked run status '${statusPath}' must be an object`);
      return [];
    }
    const state = status2.state;
    if (typeof state !== "string" || !state.trim()) {
      warnings.push(`Linked run status '${statusPath}' is missing state`);
      return [];
    }
    if (state === run.status) return [];
    return [{
      ...run,
      status: state,
      ...!["queued", "running"].includes(state) && !run.completedAt ? { completedAt: (/* @__PURE__ */ new Date()).toISOString() } : {}
    }];
  });
  if (updates.length === 0) return { record, warnings };
  const merged = record.runs.map((run) => updates.find((update) => update.runId === run.runId && update.childIndex === run.childIndex) ?? run);
  const states = merged.map((run) => run.status);
  const status = record.status === "completed" || record.status === "failed" || record.status === "cancelled" ? record.status : record.goal && !states.some((state) => state === "queued" || state === "running" || state === "active") ? "active" : states.some((state) => state === "queued" || state === "running" || state === "active") ? "active" : states.some((state) => state === "paused") ? "waiting" : states.some((state) => state === "failed") ? "failed" : states.some((state) => state === "stopped" || state === "rejected" || state === "cancelled") ? "cancelled" : states.length > 0 && states.every((state) => state === "complete" || state === "completed") ? "completed" : record.status;
  return { record: updateMission(location, record.id, { status, addRuns: updates }), warnings };
}
function formatMission(record) {
  const lines = [
    `Mission: ${record.id}`,
    `Title: ${record.title}`,
    `Status: ${record.status}`,
    `Objective: ${record.objective}`,
    `Updated: ${record.updatedAt}`
  ];
  if (record.goal && record.budget) lines.push(`Goal mode: ${record.goal.status}`, `Budget: ${record.usage?.tokens ?? 0}/${record.budget.tokens} tokens`);
  if (record.summary) lines.push(`Summary: ${record.summary}`);
  if (record.labels?.length) lines.push(`Labels: ${record.labels.join(", ")}`);
  if (record.runs.length) {
    lines.push("Runs:");
    for (const run of record.runs) lines.push(`  ${run.runId} (${run.mode}${run.status ? `, ${run.status}` : ""})${run.asyncDir ? ` \u2014 ${run.asyncDir}` : ""}`);
  }
  if (record.workflowChildren.length) {
    lines.push("Workflow children:");
    for (const child of record.workflowChildren) {
      const identity = child.runId ? `${child.key} (${child.runId})` : child.key;
      const heartbeat = child.heartbeat ? `; heartbeat ${child.heartbeat.status ?? child.status}${child.heartbeat.phase ? `/${child.heartbeat.phase}` : ""} at ${child.heartbeat.updatedAt}` : "";
      const recovery = child.sessionPath ? `; session ${child.sessionPath}` : child.artifactPaths.length ? `; artifacts ${child.artifactPaths.length}` : "";
      lines.push(`  ${identity}: ${child.status}${child.agent ? ` \u2014 ${child.agent}` : ""}${child.phase ? ` [${child.phase}]` : ""}; updated ${child.updatedAt}${heartbeat}${recovery}`);
    }
  }
  if (record.decisions.length) {
    lines.push("Decisions:");
    for (const decision of record.decisions) {
      lines.push(`  ${decision.id}: ${decision.status} \u2014 ${decision.title}${decision.resolution ? `; resolution: ${decision.resolution}` : ""}`);
    }
  }
  if (record.artifacts.length) {
    lines.push("Artifacts:");
    for (const artifact of record.artifacts) lines.push(`  ${artifact.kind}: ${artifact.path}`);
  }
  if (record.receipts.length) {
    lines.push("Delivery receipts:");
    for (const receipt of record.receipts) lines.push(`  ${receipt.kind} (${receipt.status}): ${receipt.title} \u2014 ${receipt.url}`);
  }
  return lines.join("\n");
}
function handleMissionAction(action, params, ctx) {
  const location = resolveMissionStoreLocation({
    projectRoot: ctx.cwd,
    ...ctx.config ? { config: ctx.config } : {},
    ...ctx.agentDir ? { agentDir: ctx.agentDir } : {}
  });
  if (action === "mission.create") {
    const mission = validateMissionLaunch(params.mission);
    const record2 = createMission(location, {
      title: mission.title,
      objective: mission.objective ?? mission.title,
      ...mission.goal === true ? { goal: true } : {},
      ...mission.budget ? { budget: mission.budget } : {},
      status: params.missionStatus ? validateStatus(params.missionStatus, "missionStatus") : "planned",
      ...mission.labels ? { labels: mission.labels } : {},
      ...ctx.currentSessionId ? { ownerSessionId: ctx.currentSessionId } : {}
    }, /* @__PURE__ */ new Date(), ctx.config?.retainTerminal);
    return textResult(`Created mission ${record2.id}: ${record2.title}`, { mode: "management", results: [], missionId: record2.id, missionPath: pathFor(record2.id), mission: record2 });
  }
  if (action === "mission.list") {
    if (params.missionScope !== void 0 && params.missionScope !== "project" && params.missionScope !== "global") {
      throw new Error('missionScope must be "project" or "global"');
    }
    if (params.missionScope === "global") {
      const listed2 = listGlobalMissions(location.globalIndexDir);
      const lines2 = listed2.entries.length === 0 ? ["No indexed missions."] : listed2.entries.map((entry) => `${entry.missionId}  ${entry.status}${entry.stale ? " [stale]" : ""}  ${entry.title}  ${entry.projectRoot}`);
      if (listed2.warnings.length) lines2.push("", ...listed2.warnings.map((warning) => `Warning: ${warning}`));
      return textResult(lines2.join("\n"), { mode: "management", results: [], missions: { globalEntries: listed2.entries, warnings: listed2.warnings } });
    }
    const listed = listMissions(location);
    const lines = listed.records.length === 0 ? ["No project missions."] : listed.records.map((record2) => {
      const open = record2.decisions.filter((decision) => decision.status === "open").length;
      const resolved2 = record2.decisions.length - open;
      return `${record2.id}  ${record2.status}  ${record2.title}  ${record2.updatedAt}${record2.decisions.length ? `  decisions: ${open} open, ${resolved2} resolved` : ""}`;
    });
    if (listed.warnings.length) lines.push("", ...listed.warnings.map((warning) => `Warning: ${warning}`));
    return textResult(lines.join("\n"), { mode: "management", results: [], missions: { records: listed.records, warnings: listed.warnings } });
  }
  if (action === "mission.show") {
    const refreshed = refreshLinkedRunStatus(location, readMission(location, requireMissionId(params)));
    const lines = [formatMission(refreshed.record), `State: ${missionStatePath(location, refreshed.record.id)}`];
    if (refreshed.warnings.length) lines.push("", ...refreshed.warnings.map((warning) => `Warning: ${warning}`));
    return textResult(lines.join("\n"), {
      mode: "management",
      results: [],
      missionId: refreshed.record.id,
      missionPath: pathFor(refreshed.record.id),
      mission: refreshed.record,
      missions: { warnings: refreshed.warnings }
    });
  }
  if (action === "mission.update") {
    const record2 = updateMission(location, requireMissionId(params), validateMissionUpdate(params.missionUpdate));
    return textResult(`Updated mission ${record2.id}.

${formatMission(record2)}`, { mode: "management", results: [], missionId: record2.id, missionPath: pathFor(record2.id), mission: record2 });
  }
  if (action === "mission.resolve-decision") {
    const missionId2 = requireMissionId(params);
    const decisionId = validateMissionId(params.id, "id");
    if (typeof params.summary !== "string" || !params.summary.trim()) throw new Error("mission.resolve-decision requires a non-empty summary");
    const record2 = updateMission(location, missionId2, { resolveDecision: { id: decisionId, resolution: params.summary.trim() } });
    return textResult(`Resolved decision ${decisionId} for mission ${record2.id}.

${formatMission(record2)}`, { mode: "management", results: [], missionId: record2.id, missionPath: pathFor(record2.id), mission: record2 });
  }
  if (action === "mission.attach-run") {
    const missionId2 = requireMissionId(params);
    const runId = params.runId ?? params.id;
    if (typeof runId !== "string" || !runId.trim()) throw new Error("mission.attach-run requires runId or id");
    const rawMode = params.runMode ?? "external";
    if (!["single", "parallel", "chain", "workflow", "scheduled", "external"].includes(rawMode)) throw new Error("runMode is invalid");
    const mode = rawMode;
    if (params.dir !== void 0 && !params.dir.trim()) throw new Error("dir must be a non-empty string");
    if (params.runStatus !== void 0 && !params.runStatus.trim()) throw new Error("runStatus must be a non-empty string");
    const record2 = updateMission(location, missionId2, {
      status: "active",
      addRuns: [{
        runId: runId.trim(),
        mode,
        ...params.dir ? { asyncDir: params.dir } : {},
        ...params.agent ? { agent: params.agent } : {},
        ...params.runStatus ? { status: params.runStatus } : {},
        startedAt: (/* @__PURE__ */ new Date()).toISOString()
      }]
    });
    return textResult(`Attached run ${runId} to mission ${record2.id}.`, { mode: "management", results: [], missionId: record2.id, missionPath: pathFor(record2.id), mission: record2 });
  }
  const missionId = requireMissionId(params);
  const status = params.missionStatus ?? "completed";
  if (status !== "completed" && status !== "failed" && status !== "cancelled") throw new Error("mission.close missionStatus must be completed, failed, or cancelled");
  if (params.summary !== void 0 && !params.summary.trim()) throw new Error("summary must be a non-empty string");
  const record = updateMission(location, missionId, {
    status,
    ...params.summary !== void 0 ? { summary: params.summary.trim() } : {}
  });
  return textResult(`Closed mission ${record.id} as ${record.status}.`, { mode: "management", results: [], missionId: record.id, missionPath: pathFor(record.id), mission: record });
  function pathFor(missionId2) {
    return missionRecordPath(location, missionId2);
  }
}

// src/missions/lifecycle.ts
import * as fs11 from "node:fs";
import * as path12 from "node:path";
import { createHash as createHash4 } from "node:crypto";
var MISSION_BINDING_FILE = "mission.json";
function workflowObjective(params) {
  const objective = params.task?.trim() || params.tasks?.find((task) => task.task?.trim())?.task?.trim() || params.chain?.find((step) => step.task?.trim())?.task?.trim();
  if (objective) return objective;
  for (const step of params.chain ?? []) {
    const parallel = Array.isArray(step.parallel) ? step.parallel : step.parallel ? [step.parallel] : [];
    const task = parallel.find((child) => child.task?.trim())?.task?.trim();
    if (task) return task;
  }
  return void 0;
}
function prepareMissionLaunch(input) {
  const hasMissionId = input.params.missionId !== void 0;
  if (hasMissionId && input.params.mission !== void 0) throw new Error("Use missionId or mission, not both");
  if (input.params.mission === false) return void 0;
  const objective = workflowObjective(input.params);
  const missionsEnabled = input.config?.enabled !== false;
  const shouldCreate = input.params.mission !== void 0 || missionsEnabled && objective !== void 0;
  if (!hasMissionId && !shouldCreate) return void 0;
  const location = resolveMissionStoreLocation({ projectRoot: input.projectRoot, ...input.config ? { config: input.config } : {} });
  if (hasMissionId) {
    const missionId = validateMissionId(input.params.missionId);
    readMission(location, missionId);
    updateMission(location, missionId, { status: "active" });
    return { missionId, location, autoCreated: false, announceInContent: true };
  }
  const mission = input.params.mission !== void 0 ? validateMissionLaunch(input.params.mission) : void 0;
  const promptDerivedObjective = mission?.objective ?? (mission ? mission.title : objective ? PROMPT_REDACTED : void 0);
  const title = mission?.title || PROMPT_REDACTED;
  const record = createMission(location, {
    title,
    objective: promptDerivedObjective || title,
    ...mission?.goal === true ? { goal: true } : {},
    ...mission?.budget ? { budget: mission.budget } : {},
    status: "active",
    ...mission?.labels ? { labels: mission.labels } : {},
    ...input.ownerSessionId ? { ownerSessionId: input.ownerSessionId } : {}
  }, /* @__PURE__ */ new Date(), input.config?.retainTerminal);
  return { missionId: record.id, location, autoCreated: true, announceInContent: true };
}
function toolResultIsError(result) {
  return "isError" in result && result.isError === true;
}
function missionRunModeForResult(mode) {
  return mode === "management" ? "external" : mode;
}
function runStatusForResult(result) {
  if (result.details.asyncDir) return "active";
  if (result.details.results.some((child) => child.interrupted || child.detached)) return "paused";
  if (toolResultIsError(result) || result.details.results.some((child) => child.exitCode !== 0)) return "failed";
  return "completed";
}
function missionStatusForRun(record, runId, runStatus) {
  if (record.status === "completed" || record.status === "failed" || record.status === "cancelled") return record.status;
  if (runStatus === "active" || runStatus === "queued" || runStatus === "running") return "active";
  if (record.goal) return "active";
  if (runStatus === "paused") return "waiting";
  const otherActive = record.runs.some((run) => run.runId !== runId && (run.status === "active" || run.status === "queued" || run.status === "running"));
  if (otherActive) return "active";
  if (runStatus === "completed" || runStatus === "complete") return "completed";
  if (runStatus === "stopped" || runStatus === "rejected" || runStatus === "cancelled") return "cancelled";
  return "failed";
}
function usageForResult(result) {
  const tokens = result.details.results.reduce((total, child) => total + child.usage.input + child.usage.output, 0);
  return tokens > 0 ? { tokens } : void 0;
}
function usageFromUnknown(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const total = value.total;
  return Number.isSafeInteger(total) && total >= 0 ? { tokens: total } : void 0;
}
function artifactsForResult(result) {
  const artifacts = [];
  if (result.details.asyncDir) {
    artifacts.push(
      { kind: "status", path: path12.join(result.details.asyncDir, "status.json") },
      { kind: "other", path: path12.join(result.details.asyncDir, "events.jsonl"), description: "Lifecycle events" }
    );
  }
  for (const child of result.details.results) {
    if (child.artifactPaths?.outputPath) artifacts.push({ kind: "output", path: child.artifactPaths.outputPath });
    if (child.savedOutputPath) artifacts.push({ kind: "output", path: child.savedOutputPath });
    if (child.transcriptPath) artifacts.push({ kind: "other", path: child.transcriptPath, description: "Child transcript" });
    if (child.structuredOutputPath) artifacts.push({ kind: "output", path: child.structuredOutputPath, description: "Structured output" });
  }
  if (result.details.parallelHandoff?.path) artifacts.push({ kind: "manifest", path: result.details.parallelHandoff.path });
  return artifacts;
}
function firstText(result) {
  const text = result.content.find((item) => item.type === "text")?.text.trim();
  if (!text) return void 0;
  return text.length > 2e3 ? `${text.slice(0, 1997)}...` : text;
}
function persistedBinding(binding) {
  return {
    schemaVersion: 1,
    missionId: binding.missionId,
    projectRoot: binding.location.projectRoot,
    missionDir: binding.location.missionDir,
    globalIndexDir: binding.location.globalIndexDir,
    writeGlobalIndex: binding.location.writeGlobalIndex,
    ...binding.location.retainTerminal !== void 0 ? { retainTerminal: binding.location.retainTerminal } : {}
  };
}
function writeMissionAsyncBinding(asyncDir, binding) {
  writePrivateAtomicJson(path12.join(asyncDir, MISSION_BINDING_FILE), persistedBinding(binding));
}
function attachMissionToLaunchResult(input) {
  const runId = input.result.details.runId ?? input.result.details.asyncId;
  if (!runId) {
    const current2 = readMission(input.binding.location, input.binding.missionId);
    const activeRunExists = current2.runs.some((run2) => run2.status === "active" || run2.status === "queued" || run2.status === "running");
    const mission2 = toolResultIsError(input.result) ? updateMission(input.binding.location, input.binding.missionId, {
      status: activeRunExists ? "active" : "failed",
      ...firstText(input.result) ? { summary: firstText(input.result) } : {}
    }) : current2;
    return {
      ...input.result,
      details: {
        ...input.result.details,
        missionId: input.binding.missionId,
        missionPath: missionRecordPath(input.binding.location, input.binding.missionId),
        mission: mission2
      }
    };
  }
  const runStatus = runStatusForResult(input.result);
  const current = readMission(input.binding.location, input.binding.missionId);
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const usage = usageForResult(input.result);
  const run = {
    runId,
    mode: missionRunModeForResult(input.result.details.mode),
    status: runStatus,
    startedAt,
    ...input.result.details.asyncDir ? { asyncDir: input.result.details.asyncDir } : {},
    ...input.result.details.results.length === 1 && input.result.details.results[0]?.agent ? { agent: input.result.details.results[0].agent } : {},
    ...runStatus !== "active" ? { completedAt: startedAt } : {},
    ...usage ? { usage } : {}
  };
  let mission = updateMission(input.binding.location, input.binding.missionId, {
    status: missionStatusForRun(current, runId, runStatus),
    addRuns: [run],
    addArtifacts: artifactsForResult(input.result),
    ...firstText(input.result) && runStatus !== "active" ? { summary: firstText(input.result) } : {},
    ...input.result.details.results.length === 1 && input.result.details.results[0]?.acceptance ? { acceptance: input.result.details.results[0].acceptance } : {}
  });
  if (input.result.details.asyncDir) {
    writeMissionAsyncBinding(input.result.details.asyncDir, input.binding);
    const statusPath = path12.join(input.result.details.asyncDir, "status.json");
    if (fs11.existsSync(statusPath)) {
      try {
        const status = JSON.parse(fs11.readFileSync(statusPath, "utf-8"));
        if (typeof status.state === "string" && !["queued", "running"].includes(status.state)) {
          mission = syncMissionFromAsyncCompletion({
            runId,
            asyncDir: input.result.details.asyncDir,
            mode: input.result.details.mode,
            state: status.state,
            ...firstText(input.result) ? { summary: firstText(input.result) } : {}
          }) ?? mission;
        }
      } catch (error) {
        throw new Error(`Failed to reconcile mission from terminal async status '${statusPath}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  const lastTextIndex = input.result.content.findLastIndex((item) => item.type === "text");
  const hasStructuredOutput = input.result.details.results.some((child) => child.structuredOutputPath !== void 0);
  const textIsJson = lastTextIndex >= 0 && (() => {
    try {
      JSON.parse(input.result.content[lastTextIndex].text);
      return true;
    } catch {
      return false;
    }
  })();
  return {
    ...input.result,
    content: input.binding.announceInContent === true && lastTextIndex >= 0 && !hasStructuredOutput && !textIsJson ? input.result.content.map((item, index) => index === lastTextIndex && item.type === "text" ? { ...item, text: `${item.text}
Mission: ${mission.id} (${mission.status})` } : item) : input.result.content,
    details: {
      ...input.result.details,
      missionId: mission.id,
      missionPath: missionRecordPath(input.binding.location, mission.id),
      mission
    }
  };
}
function parsePersistedBinding(value, source) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${source} must be an object`);
  const input = value;
  if (input.schemaVersion !== 1) throw new Error(`${source}.schemaVersion must be 1`);
  for (const field of ["projectRoot", "missionDir", "globalIndexDir"]) {
    if (typeof input[field] !== "string" || !input[field].trim()) throw new Error(`${source}.${field} must be a non-empty string`);
  }
  if (typeof input.writeGlobalIndex !== "boolean") throw new Error(`${source}.writeGlobalIndex must be boolean`);
  if (input.retainTerminal !== void 0 && (!Number.isInteger(input.retainTerminal) || input.retainTerminal < 1)) throw new Error(`${source}.retainTerminal must be a positive integer`);
  return {
    missionId: validateMissionId(input.missionId, `${source}.missionId`),
    autoCreated: false,
    location: {
      projectRoot: input.projectRoot,
      missionDir: input.missionDir,
      globalIndexDir: input.globalIndexDir,
      writeGlobalIndex: input.writeGlobalIndex,
      ...input.retainTerminal !== void 0 ? { retainTerminal: input.retainTerminal } : {}
    }
  };
}
function readMissionBinding(asyncDir) {
  const bindingPath = path12.join(asyncDir, MISSION_BINDING_FILE);
  if (!fs11.existsSync(bindingPath)) return void 0;
  const raw = fs11.readFileSync(bindingPath, "utf-8");
  try {
    return parsePersistedBinding(JSON.parse(raw), bindingPath);
  } catch (error) {
    throw new Error(`Invalid mission binding file '${bindingPath}': ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}
function syncMissionFromAsyncCompletion(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const event = value;
  if (typeof event.asyncDir !== "string" || !event.asyncDir.trim()) return void 0;
  const binding = readMissionBinding(event.asyncDir);
  if (!binding) return void 0;
  const runId = typeof event.runId === "string" ? event.runId : typeof event.id === "string" ? event.id : void 0;
  if (!runId) throw new Error("Async mission completion is missing runId");
  const runStatus = typeof event.state === "string" ? event.state : event.success === true ? "completed" : "failed";
  let current;
  try {
    current = readMission(binding.location, binding.missionId);
  } catch (error) {
    if (!(error instanceof MissionNotFoundError)) throw error;
    const reason = "mission-record-missing";
    const markerId = createHash4("sha256").update(JSON.stringify([runId, binding.missionId, reason])).digest("hex");
    const markerPath3 = path12.join(event.asyncDir, `.mission-sync-skipped-${markerId}.json`);
    try {
      fs11.writeFileSync(markerPath3, `${JSON.stringify({ runId, missionId: binding.missionId, reason })}
`, { encoding: "utf-8", mode: 384, flag: "wx" });
      fs11.appendFileSync(path12.join(event.asyncDir, "events.jsonl"), `${JSON.stringify({
        type: "subagent.mission.sync.skipped",
        ts: Date.now(),
        runId,
        missionId: binding.missionId,
        reason,
        missionPath: missionRecordPath(binding.location, binding.missionId)
      })}
`, "utf-8");
    } catch {
    }
    return void 0;
  }
  const completedAt = (/* @__PURE__ */ new Date()).toISOString();
  const artifacts = [
    { kind: "status", path: path12.join(event.asyncDir, "status.json") },
    { kind: "other", path: path12.join(event.asyncDir, "events.jsonl"), description: "Lifecycle events" }
  ];
  if (event.parallelHandoff && typeof event.parallelHandoff === "object" && typeof event.parallelHandoff.path === "string") {
    artifacts.push({ kind: "manifest", path: event.parallelHandoff.path });
  }
  if (Array.isArray(event.results)) {
    for (const result of event.results) {
      if (!result || typeof result !== "object") continue;
      const child = result;
      if (typeof child.artifactPath === "string") artifacts.push({ kind: "output", path: child.artifactPath });
      if (child.artifactPaths && typeof child.artifactPaths === "object" && typeof child.artifactPaths.outputPath === "string") {
        artifacts.push({ kind: "output", path: child.artifactPaths.outputPath });
      }
    }
  }
  const summary = typeof event.summary === "string" && event.summary.trim() ? event.summary.slice(0, 2e3) : void 0;
  const usage = usageFromUnknown(event.totalTokens) ?? (Array.isArray(event.results) ? { tokens: event.results.reduce((total, result) => {
    if (!result || typeof result !== "object") return total;
    return total + (usageFromUnknown(result.tokens)?.tokens ?? 0);
  }, 0) } : void 0);
  const workflowRunId = typeof event.parentWorkflowRunId === "string" && event.parentWorkflowRunId.trim() ? event.parentWorkflowRunId.trim() : void 0;
  const workflowKey = typeof event.workflowKey === "string" && event.workflowKey.trim() ? event.workflowKey.trim() : void 0;
  const workflowChildStatus = runStatus === "complete" || runStatus === "completed" || event.success === true ? "completed" : runStatus === "paused" ? "paused" : runStatus === "stopped" ? "stopped" : "failed";
  const workflowChildTerminal = !["running", "queued", "active", "paused"].includes(workflowChildStatus);
  return updateMission(binding.location, binding.missionId, {
    status: missionStatusForRun(current, runId, runStatus),
    addRuns: [{ runId, mode: typeof event.mode === "string" && ["single", "parallel", "chain", "workflow"].includes(event.mode) ? event.mode : "external", asyncDir: event.asyncDir, status: runStatus, completedAt, ...usage && usage.tokens > 0 ? { usage } : {} }],
    addArtifacts: artifacts,
    ...workflowRunId && workflowKey ? { upsertWorkflowChildren: [{
      workflowRunId,
      key: workflowKey,
      runId,
      status: workflowChildStatus,
      artifactPaths: artifacts.map((artifact) => artifact.path),
      ...workflowChildTerminal ? { completedAt } : {},
      heartbeat: { status: workflowChildStatus, ...summary ? { message: summary } : {} }
    }] } : {},
    ...summary ? { summary } : {}
  });
}

// src/runs/background/result-files.ts
import { createHash as createHash5 } from "node:crypto";
import * as fs12 from "node:fs";
import * as path13 from "node:path";
var RESULT_INDEX_VERSION = 1;
var RESULT_INDEX_DIR = "result-index";
var SESSION_INDEX_DIR = "sessions";
var RUN_INDEX_DIR = "runs";
var OBSERVER_INDEX_DIR = "observers";
var TOOL_CALL_INDEX_DIR3 = "tool-calls";
var RESULT_PENDING_DIR = "result-pending";
var RESULT_LEASE_DIR = "result-leases";
var MISSION_OBSERVER = "mission";
var JSON_EXTENSION = ".json";
var MAX_JSON_FILE_STEM_BYTES = MAX_INDEX_SEGMENT_BYTES - Buffer.byteLength(JSON_EXTENSION, "utf-8");
function encodeSegment(value) {
  return encodeIndexSegment(value);
}
function encodedJsonFileName(value) {
  return `${encodeIndexSegment(value, MAX_JSON_FILE_STEM_BYTES)}${JSON_EXTENSION}`;
}
function encodedJsonFileNames(value) {
  return indexSegmentAliases(value, MAX_JSON_FILE_STEM_BYTES).map((segment) => `${segment}${JSON_EXTENSION}`);
}
function nonEmptyString2(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function isUnaddressableResultCandidate(error) {
  return error?.code === "ENAMETOOLONG";
}
function resultFileName(runId) {
  return `${runId}${JSON_EXTENSION}`;
}
function resultFilePath(resultsDir, runId) {
  return path13.join(resultsDir, resultFileName(runId));
}
function sessionIndexDir2(resultsDir, sessionId) {
  return path13.join(resultsDir, RESULT_INDEX_DIR, SESSION_INDEX_DIR, encodeSegment(sessionId));
}
function sessionIndexDirs(resultsDir, sessionId) {
  return indexSegmentAliases(sessionId).map((segment) => path13.join(resultsDir, RESULT_INDEX_DIR, SESSION_INDEX_DIR, segment));
}
function resultIndexPath(resultsDir, sessionId, runId) {
  return path13.join(sessionIndexDir2(resultsDir, sessionId), encodedJsonFileName(runId));
}
function resultIndexPaths(resultsDir, sessionId, runId) {
  return sessionIndexDirs(resultsDir, sessionId).flatMap((dir) => encodedJsonFileNames(runId).map((fileName) => path13.join(dir, fileName)));
}
function runIndexPath(resultsDir, runId) {
  return path13.join(resultsDir, RESULT_INDEX_DIR, RUN_INDEX_DIR, encodedJsonFileName(runId));
}
function resultPendingPath(resultsDir, sessionId, runId) {
  return path13.join(resultsDir, RESULT_PENDING_DIR, encodeSegment(sessionId), encodedJsonFileName(runId));
}
function resultPendingPaths(resultsDir, sessionId, runId) {
  return indexSegmentAliases(sessionId).flatMap((segment) => encodedJsonFileNames(runId).map((fileName) => path13.join(resultsDir, RESULT_PENDING_DIR, segment, fileName)));
}
function pendingSessionDirs(resultsDir, sessionId) {
  return indexSegmentAliases(sessionId).map((segment) => path13.join(resultsDir, RESULT_PENDING_DIR, segment));
}
function firstExistingResultFile(paths) {
  for (const filePath of paths) {
    if (existingResultFile(filePath)) return filePath;
  }
  return void 0;
}
function observerIndexDir(resultsDir, observer) {
  return path13.join(resultsDir, RESULT_INDEX_DIR, OBSERVER_INDEX_DIR, observer);
}
function observerIndexPath(resultsDir, observer, runId) {
  return path13.join(observerIndexDir(resultsDir, observer), encodedJsonFileName(runId));
}
function missionObserverIndexPath(resultsDir, runId) {
  return observerIndexPath(resultsDir, MISSION_OBSERVER, runId);
}
function toolCallIndexDir3(resultsDir, toolCallId) {
  return path13.join(resultsDir, RESULT_INDEX_DIR, TOOL_CALL_INDEX_DIR3, encodeIndexSegment(toolCallId));
}
function toolCallIndexPath2(resultsDir, toolCallId, runId) {
  return path13.join(toolCallIndexDir3(resultsDir, toolCallId), encodedJsonFileName(runId));
}
function parseResultIndexEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const record = value;
  if (record.version !== RESULT_INDEX_VERSION || typeof record.runId !== "string" || typeof record.sessionId !== "string" || typeof record.file !== "string" || typeof record.writtenAt !== "number") return void 0;
  return {
    version: RESULT_INDEX_VERSION,
    runId: record.runId,
    sessionId: record.sessionId,
    file: record.file,
    writtenAt: record.writtenAt,
    ...typeof record.asyncDir === "string" ? { asyncDir: record.asyncDir } : {}
  };
}
function writeResultIndexForData(resultPath, data) {
  const runId = nonEmptyString2(data.runId) ?? nonEmptyString2(data.id) ?? path13.basename(resultPath, ".json");
  const sessionId = nonEmptyString2(data.sessionId);
  if (!runId || !sessionId) return;
  const file = path13.basename(resultPath);
  const entry = {
    version: RESULT_INDEX_VERSION,
    runId,
    sessionId,
    file,
    writtenAt: Date.now(),
    ...nonEmptyString2(data.asyncDir) ? { asyncDir: nonEmptyString2(data.asyncDir) } : {}
  };
  const resultsDir = path13.dirname(resultPath);
  writeAtomicJson(resultIndexPath(resultsDir, sessionId, runId), entry);
  try {
    writeAtomicJson(runIndexPath(resultsDir, runId), entry);
  } catch (error) {
    console.error(`Failed to write async result run index for '${resultPath}':`, error);
  }
  const toolCallId = nonEmptyString2(data.toolCallId);
  try {
    if (toolCallId) writeAtomicJson(toolCallIndexPath2(resultsDir, toolCallId, runId), entry);
  } catch (error) {
    console.error(`Failed to write async result tool-call index for '${resultPath}':`, error);
  }
  try {
    if (entry.asyncDir && fs12.existsSync(path13.join(entry.asyncDir, MISSION_BINDING_FILE))) {
      writeAtomicJson(observerIndexPath(resultsDir, MISSION_OBSERVER, runId), entry);
    }
  } catch (error) {
    console.error(`Failed to write async result observer index for '${resultPath}':`, error);
  }
}
function writeIndexedPendingResultFile(resultPath, data) {
  const runId = nonEmptyString2(data.runId) ?? nonEmptyString2(data.id) ?? path13.basename(resultPath, ".json");
  const sessionId = nonEmptyString2(data.sessionId);
  if (!sessionId) throw new Error(`Cannot write async result '${resultPath}' without a sessionId.`);
  const resultsDir = path13.dirname(resultPath);
  let indexFailure;
  writeAtomicJson(resultPendingPath(resultsDir, sessionId, runId), data, () => {
    try {
      writeResultIndexForData(resultPath, data);
    } catch (error) {
      indexFailure = { error };
    }
  });
  if (indexFailure) throw indexFailure.error;
  return { runId, sessionId, resultsDir };
}
function writeAsyncResultFile(resultPath, data) {
  const { runId, sessionId, resultsDir } = writeIndexedPendingResultFile(resultPath, data);
  return promotePendingResultFile(resultsDir, sessionId, runId, path13.basename(resultPath), { logFailure: false }) === "promoted" ? { state: "public" } : { state: "pending" };
}
function removeResultIndex(resultsDir, sessionId, runId, toolCallId) {
  if (!runId) return;
  if (sessionId) {
    for (const indexPath2 of resultIndexPaths(resultsDir, sessionId, runId)) {
      try {
        fs12.rmSync(indexPath2, { force: true });
      } catch {
      }
    }
    for (const pendingPath of resultPendingPaths(resultsDir, sessionId, runId)) {
      try {
        fs12.rmSync(pendingPath, { force: true });
      } catch {
      }
    }
  }
  try {
    fs12.rmSync(runIndexPath(resultsDir, runId), { force: true });
  } catch {
  }
  if (toolCallId) {
    try {
      fs12.rmSync(toolCallIndexPath2(resultsDir, toolCallId, runId), { force: true });
    } catch {
    }
  }
  try {
    fs12.rmSync(observerIndexPath(resultsDir, MISSION_OBSERVER, runId), { force: true });
  } catch {
  }
}
function removeMissionObserverIndex(resultsDir, runId) {
  if (!runId) return;
  try {
    fs12.rmSync(observerIndexPath(resultsDir, MISSION_OBSERVER, runId), { force: true });
  } catch {
  }
}
function withResultRunLease(resultsDir, runId, action, waitMs) {
  const leaseDir = path13.join(resultsDir, RESULT_LEASE_DIR);
  fs12.mkdirSync(leaseDir, { recursive: true });
  return withFileLease(path13.join(leaseDir, createHash5("sha256").update(runId).digest("hex")), action, waitMs);
}
function readResultPayload(filePath) {
  try {
    return fs12.readFileSync(filePath, "utf-8");
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR" || isUnaddressableResultCandidate(error)) return void 0;
    throw error;
  }
}
function resultPayloadCandidates(publicPath, read) {
  return [...read.sessionId ? resultPendingPaths(path13.dirname(publicPath), read.sessionId, read.runId) : [], publicPath];
}
function readByConsumer(publicPath, read, candidate, current) {
  return current === read.snapshot || candidate === publicPath && current === read.stalePublic;
}
function resultSnapshotReplaced(publicPath, read) {
  return resultPayloadCandidates(publicPath, read).some((candidate) => {
    const current = readResultPayload(candidate);
    return current !== void 0 && !readByConsumer(publicPath, read, candidate, current);
  });
}
function retireResultSnapshot(publicPath, read, payloadPath = publicPath, leaseWaitMs) {
  const resultsDir = path13.dirname(publicPath);
  return withResultRunLease(resultsDir, read.runId, () => {
    if (resultSnapshotReplaced(publicPath, read)) {
      if (payloadPath !== publicPath && readResultPayload(payloadPath) === read.snapshot) fs12.rmSync(payloadPath, { force: true });
      return "replaced";
    }
    let removalFailure;
    for (const candidate of /* @__PURE__ */ new Set([...resultPayloadCandidates(publicPath, read), payloadPath])) {
      const current = readResultPayload(candidate);
      if (current === void 0 || !readByConsumer(publicPath, read, candidate, current)) continue;
      try {
        fs12.rmSync(candidate, { force: true });
      } catch (error) {
        removalFailure ??= { error };
      }
    }
    removeResultIndex(resultsDir, read.sessionId, read.runId, read.toolCallId);
    if (removalFailure) throw removalFailure.error;
    return "retired";
  }, leaseWaitMs);
}
function acknowledgeMissionObserverSnapshot(publicPath, read, leaseWaitMs) {
  const resultsDir = path13.dirname(publicPath);
  if (!fs12.existsSync(observerIndexPath(resultsDir, MISSION_OBSERVER, read.runId))) return "acknowledged";
  return withResultRunLease(resultsDir, read.runId, () => {
    if (resultSnapshotReplaced(publicPath, read)) return "replaced";
    removeMissionObserverIndex(resultsDir, read.runId);
    return "acknowledged";
  }, leaseWaitMs);
}
function existingResultFile(resultPath) {
  try {
    return fs12.statSync(resultPath).isFile();
  } catch (error) {
    if (error.code !== "ENOENT" && !isUnaddressableResultCandidate(error)) console.error(`Failed to inspect async result payload '${resultPath}':`, error);
    return false;
  }
}
function pendingResultExists(resultsDir, sessionId, runId) {
  return firstExistingResultFile(resultPendingPaths(resultsDir, sessionId, runId)) !== void 0;
}
function resultPayloadMatchesSessionRun(data, sessionId, runId) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const record = data;
  return (nonEmptyString2(record.runId) ?? nonEmptyString2(record.id)) === runId && nonEmptyString2(record.sessionId) === sessionId;
}
function pendingResultPayloadMatches(filePath, sessionId, runId) {
  try {
    return resultPayloadMatchesSessionRun(JSON.parse(fs12.readFileSync(filePath, "utf-8")), sessionId, runId);
  } catch (error) {
    if (error.code !== "ENOENT" && !isUnaddressableResultCandidate(error)) console.error(`Ignoring invalid pending async result '${filePath}':`, error);
    return false;
  }
}
function assertPendingResultPayloadMatches(filePath, sessionId, runId) {
  return resultPayloadMatchesSessionRun(JSON.parse(fs12.readFileSync(filePath, "utf-8")), sessionId, runId);
}
function promotePendingResultFile(resultsDir, sessionId, runId, file = resultFileName(runId), options = {}) {
  if (file !== path13.basename(file) || !file.endsWith(".json")) return "none";
  const pendingPath = firstExistingResultFile(resultPendingPaths(resultsDir, sessionId, runId));
  if (!pendingPath) return "none";
  const resultPath = path13.join(resultsDir, file);
  try {
    fs12.renameSync(pendingPath, resultPath);
    return existingResultFile(resultPath) ? "promoted" : "pending";
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT" || code === "EEXIST" || code === "EPERM" || code === "EACCES" || isUnaddressableResultCandidate(error)) {
      const pendingExists = existingResultFile(pendingPath);
      const resultExists = existingResultFile(resultPath);
      if (pendingExists) {
        if (!resultExists && options.logFailure !== false && !isUnaddressableResultCandidate(error)) console.error(`Failed to promote pending async result '${pendingPath}' to '${resultPath}':`, error);
        return "pending";
      }
      if (resultExists) return "promoted";
      if (options.logFailure !== false) console.error(`Pending async result '${pendingPath}' disappeared without a promoted result at '${resultPath}'.`);
      return "none";
    }
    if (options.logFailure !== false) console.error(`Failed to promote pending async result '${pendingPath}' to '${resultPath}':`, error);
    return "pending";
  }
}
function pendingResultLocationForSessionRun(resultsDir, sessionId, runId, file = resultFileName(runId)) {
  if (file !== path13.basename(file) || !file.endsWith(".json")) return void 0;
  const pendingPath = firstExistingResultFile(resultPendingPaths(resultsDir, sessionId, runId));
  if (!pendingPath || !pendingResultPayloadMatches(pendingPath, sessionId, runId)) return void 0;
  return { file, path: pendingPath, state: "pending" };
}
function fallbackResultPayloadPathForSessionRun(resultsDir, sessionId, runId) {
  const pendingPath = firstExistingResultFile(resultPendingPaths(resultsDir, sessionId, runId));
  if (!pendingPath || !assertPendingResultPayloadMatches(pendingPath, sessionId, runId)) return void 0;
  return pendingPath;
}
function resultPayloadFileForSessionRun(resultsDir, sessionId, runId) {
  return firstExistingResultFile([...resultPendingPaths(resultsDir, sessionId, runId), resultFilePath(resultsDir, runId)]);
}
function resultPayloadLocationFromIndex(resultsDir, entry) {
  if (entry.file !== path13.basename(entry.file) || !entry.file.endsWith(".json")) return void 0;
  const pendingState = promotePendingResultFile(resultsDir, entry.sessionId, entry.runId, entry.file);
  if (pendingState === "pending") {
    return pendingResultLocationForSessionRun(resultsDir, entry.sessionId, entry.runId, entry.file);
  }
  const resultPath = path13.join(resultsDir, entry.file);
  if (pendingState === "promoted" || existingResultFile(resultPath)) return { file: entry.file, path: resultPath, state: "public" };
  return void 0;
}
function readResultIndexForSessionRun(resultsDir, sessionId, runId) {
  for (const indexPath2 of resultIndexPaths(resultsDir, sessionId, runId)) {
    try {
      const entry = parseResultIndexEntry(JSON.parse(fs12.readFileSync(indexPath2, "utf-8")));
      if (!entry || entry.sessionId !== sessionId || entry.runId !== runId) continue;
      return entry;
    } catch (error) {
      const code = error.code;
      if (code === "EPERM" || code === "EACCES") throw error;
      if (code !== "ENOENT" && code !== "ENOTDIR" && !isUnaddressableResultCandidate(error)) {
        console.error(`Ignoring invalid async result index for '${runId}':`, error);
      }
    }
  }
  return void 0;
}
function resultPayloadPathForSessionRun(resultsDir, sessionId, runId) {
  const entry = readResultIndexForSessionRun(resultsDir, sessionId, runId);
  return (entry ? resultPayloadLocationFromIndex(resultsDir, entry) : void 0)?.path ?? pendingResultLocationForSessionRun(resultsDir, sessionId, runId)?.path;
}
function resultPayloadPathForMissionObserverRun(resultsDir, runId) {
  try {
    const entry = parseResultIndexEntry(JSON.parse(fs12.readFileSync(observerIndexPath(resultsDir, MISSION_OBSERVER, runId), "utf-8")));
    if (!entry || entry.runId !== runId) return void 0;
    return resultPayloadLocationFromIndex(resultsDir, entry)?.path;
  } catch (error) {
    const code = error.code;
    if (code !== "ENOENT" && code !== "ENOTDIR" && !isUnaddressableResultCandidate(error)) console.error(`Ignoring invalid async result observer index for '${runId}':`, error);
    return void 0;
  }
}
function resultPayloadPathForIndexedRun(resultsDir, runId) {
  const entryPath = runIndexPath(resultsDir, runId);
  try {
    const entry = parseResultIndexEntry(JSON.parse(fs12.readFileSync(entryPath, "utf-8")));
    if (!entry || entry.runId !== runId) {
      fs12.rmSync(entryPath, { force: true });
      return void 0;
    }
    return resultPayloadLocationFromIndex(resultsDir, entry)?.path;
  } catch (error) {
    const code = error.code;
    if (isUnaddressableResultCandidate(error)) return void 0;
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      console.error(`Ignoring invalid async result run index '${entryPath}':`, error);
      try {
        fs12.rmSync(entryPath, { force: true });
      } catch {
      }
    }
  }
  return void 0;
}
function indexedResultFile(resultsDir, entry, includePending = false) {
  const location = resultPayloadLocationFromIndex(resultsDir, entry);
  if (!location) return void 0;
  return includePending || location.state === "public" ? location.file : void 0;
}
function listIndexFiles(dir) {
  let files;
  try {
    files = fs12.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => path13.join(dir, entry.name));
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "EPERM" || code === "EACCES" || isUnaddressableResultCandidate(error)) return [];
    throw error;
  }
  return files;
}
function resultFilesFromIndexDir(resultsDir, dir, includePending = false) {
  const candidates = /* @__PURE__ */ new Set();
  for (const entryPath of listIndexFiles(dir)) {
    try {
      const entry = parseResultIndexEntry(JSON.parse(fs12.readFileSync(entryPath, "utf-8")));
      if (!entry) {
        fs12.rmSync(entryPath, { force: true });
        continue;
      }
      const resultFile = indexedResultFile(resultsDir, entry, includePending);
      if (resultFile) candidates.add(resultFile);
    } catch (error) {
      if (error.code !== "ENOENT" && !isUnaddressableResultCandidate(error)) console.error(`Ignoring invalid async result index '${entryPath}':`, error);
    }
  }
  return [...candidates];
}
function pendingResultFilesForSession(resultsDir, sessionId) {
  const files = /* @__PURE__ */ new Set();
  for (const dir of pendingSessionDirs(resultsDir, sessionId)) {
    let entries;
    try {
      entries = fs12.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      const code = error.code;
      if (code === "ENOENT" || code === "ENOTDIR" || code === "EPERM" || code === "EACCES" || isUnaddressableResultCandidate(error)) continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const pendingPath = path13.join(dir, entry.name);
      try {
        const data = JSON.parse(fs12.readFileSync(pendingPath, "utf-8"));
        const runId = nonEmptyString2(data.runId) ?? nonEmptyString2(data.id);
        if (runId && nonEmptyString2(data.sessionId) === sessionId) files.add(resultFileName(runId));
      } catch (error) {
        if (error.code !== "ENOENT" && !isUnaddressableResultCandidate(error)) console.error(`Ignoring invalid pending async result '${pendingPath}':`, error);
      }
    }
  }
  return [...files];
}
function resultCandidateFilesForSession(resultsDir, sessionId) {
  const files = /* @__PURE__ */ new Set();
  for (const dir of sessionIndexDirs(resultsDir, sessionId)) {
    for (const file of resultFilesFromIndexDir(resultsDir, dir, true)) files.add(file);
  }
  for (const file of pendingResultFilesForSession(resultsDir, sessionId)) files.add(file);
  return [...files];
}
function resultCandidateFilesForToolCall(resultsDir, toolCallId) {
  return resultFilesFromIndexDir(resultsDir, toolCallIndexDir3(resultsDir, toolCallId), true);
}
function missionObserverResultCandidateFiles(resultsDir) {
  return resultFilesFromIndexDir(resultsDir, observerIndexDir(resultsDir, MISSION_OBSERVER), true);
}
function cleanupResultIndexes(resultsDir, now = Date.now(), maxAgeMs = 24 * 60 * 60 * 1e3) {
  const root = path13.join(resultsDir, RESULT_INDEX_DIR);
  const cutoff = now - maxAgeMs;
  let removed = 0;
  const visit = (dir) => {
    let entries;
    try {
      entries = fs12.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      const code = error.code;
      if (code === "ENOENT" || code === "ENOTDIR" || code === "EPERM" || code === "EACCES" || isUnaddressableResultCandidate(error)) return;
      throw error;
    }
    for (const entry of entries) {
      const fullPath = path13.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        try {
          fs12.rmdirSync(fullPath);
        } catch {
        }
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const stat = fs12.statSync(fullPath);
        const index = parseResultIndexEntry(JSON.parse(fs12.readFileSync(fullPath, "utf-8")));
        const resultFile = index ? indexedResultFile(resultsDir, index) : void 0;
        const pendingFile = index ? pendingResultExists(resultsDir, index.sessionId, index.runId) : false;
        if (!index || !resultFile && !pendingFile && stat.mtimeMs <= cutoff) {
          fs12.rmSync(fullPath, { force: true });
          removed += 1;
        }
      } catch (error) {
        if (isUnaddressableResultCandidate(error)) continue;
        if (error.code !== "ENOENT") console.error(`Ignoring invalid async result index '${fullPath}':`, error);
        try {
          fs12.rmSync(fullPath, { force: true });
          removed += 1;
        } catch {
        }
      }
    }
  };
  visit(root);
  return removed;
}

// src/shared/completion-owner.ts
import { randomUUID as randomUUID6 } from "node:crypto";
var COMPLETION_OWNER_KEY = /* @__PURE__ */ Symbol.for("pi-subagents.completion-owner-id");
var OWNING_SESSION_COMPLETION_OWNER = "owning-session";
function currentCompletionOwnerId() {
  const runtime2 = globalThis;
  runtime2[COMPLETION_OWNER_KEY] ??= randomUUID6();
  return runtime2[COMPLETION_OWNER_KEY];
}

// src/runs/background/boot-id.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import * as fs14 from "node:fs";

// src/runs/background/pid-namespace.ts
import * as fs13 from "node:fs";
var resolved = false;
var cachedScope;
function currentPidNamespaceScope() {
  if (resolved) return cachedScope;
  resolved = true;
  if (process.platform !== "linux") return void 0;
  try {
    const scope = fs13.readlinkSync("/proc/self/ns/pid", "utf-8").trim();
    cachedScope = scope || void 0;
  } catch {
    cachedScope = void 0;
  }
  return cachedScope;
}

// src/runs/background/boot-id.ts
function readBootIdFromOs() {
  try {
    if (process.platform === "linux") return fs14.readFileSync("/proc/sys/kernel/random/boot_id", "utf-8").trim() || void 0;
    if (process.platform === "darwin") {
      return execFileSync2("sysctl", ["-n", "kern.bootsessionuuid"], { encoding: "utf-8", timeout: 1e3, stdio: ["ignore", "pipe", "ignore"] }).trim() || void 0;
    }
  } catch {
  }
  return void 0;
}
var BOOT_ID_KEY = /* @__PURE__ */ Symbol.for("pi-subagents.boot-id.v1");
var runtime = globalThis;
var reader = readBootIdFromOs;
function currentBootId() {
  const cached = runtime[BOOT_ID_KEY];
  if (cached) return cached.value;
  const value = reader();
  runtime[BOOT_ID_KEY] = { value };
  return value;
}
function currentRecordedPid() {
  const pidNamespaceScope = currentPidNamespaceScope();
  const bootId = currentBootId();
  return { pid: process.pid, ...pidNamespaceScope ? { pidNamespaceScope } : {}, ...bootId ? { bootId } : {} };
}

// src/runs/background/stale-run-reconciler.ts
import * as fs16 from "node:fs";
import * as path15 from "node:path";

// src/runs/background/parallel-groups.ts
function isValidParallelGroup(group, stepCount, chainStepCount) {
  if (typeof group !== "object" || group === null) return false;
  const { start, count, stepIndex } = group;
  return typeof start === "number" && typeof count === "number" && typeof stepIndex === "number" && Number.isInteger(start) && Number.isInteger(count) && Number.isInteger(stepIndex) && start >= 0 && count > 0 && stepIndex >= 0 && stepIndex < chainStepCount && start + count <= stepCount;
}
function normalizeParallelGroups(groups, stepCount, chainStepCount) {
  if (!Array.isArray(groups)) return [];
  return groups.filter((group) => isValidParallelGroup(group, stepCount, chainStepCount)).sort((left, right) => left.stepIndex - right.stepIndex || left.start - right.start);
}
function flatToLogicalStepIndex(flatIndex, chainStepCount, groups) {
  let logicalIndex = 0;
  let cursor = 0;
  for (const group of groups) {
    while (cursor < group.start && logicalIndex < chainStepCount) {
      if (cursor === flatIndex) return logicalIndex;
      cursor++;
      logicalIndex++;
    }
    if (flatIndex >= group.start && flatIndex < group.start + group.count) return group.stepIndex;
    cursor = group.start + group.count;
    logicalIndex = group.stepIndex + 1;
  }
  while (cursor <= flatIndex && logicalIndex < chainStepCount) {
    if (cursor === flatIndex) return logicalIndex;
    cursor++;
    logicalIndex++;
  }
  return Math.max(0, chainStepCount - 1);
}

// src/workflows/workflow-stop-cause.ts
var WORKFLOW_STOP_CAUSE_RUNTIME_REPLACED = "runtime-replaced";
var WORKFLOW_STOP_CAUSE_OWNER_EXITED = "owner-exited";
function isReusableWorkflowStopCause(cause) {
  return cause === WORKFLOW_STOP_CAUSE_RUNTIME_REPLACED || cause === WORKFLOW_STOP_CAUSE_OWNER_EXITED;
}

// src/runs/background/workflow-terminal-proof.ts
import * as fs15 from "node:fs";
import * as path14 from "node:path";
var TERMINAL_WORKFLOW_STATES = /* @__PURE__ */ new Set(["completed", "failed", "stopped"]);
function isTerminalAsyncState(state) {
  return state !== "queued" && state !== "running" && state !== "paused";
}
function readWorkflowChildRunModel(workflowAsyncDir, step) {
  if (step.async !== true || typeof step.runId !== "string" || path14.basename(step.runId) !== step.runId) return void 0;
  try {
    const child = readStatus(path14.join(path14.dirname(workflowAsyncDir), step.runId));
    const first = Array.isArray(child?.steps) ? child.steps[0] : void 0;
    const model = typeof first?.model === "string" && first.model ? first.model : void 0;
    const thinking = typeof first?.thinking === "string" && first.thinking ? first.thinking : void 0;
    return model || thinking ? { model, thinking } : void 0;
  } catch {
    return void 0;
  }
}
function withWorkflowChildRunModel(workflowAsyncDir, child) {
  if (child.model && child.thinking) return child;
  const reported = readWorkflowChildRunModel(workflowAsyncDir, { async: true, runId: child.runId });
  const model = child.model ?? reported?.model;
  const thinking = child.thinking ?? reported?.thinking;
  return { ...child, ...model ? { model } : {}, ...thinking ? { thinking } : {} };
}
function readWorkflowChildProcessEvidence(workflowAsyncDir, steps) {
  if (!steps) return { state: "unknown", reason: "workflow child roster is missing" };
  const children = [];
  for (const step of steps) {
    const child = readWorkflowChildEvidence(workflowAsyncDir, step);
    if (!child) continue;
    if (child.state !== "resolved") return { state: child.state, reason: child.reason };
    children.push(child.proof);
  }
  return { state: "observed", children };
}
function launchFailedBeforeRunner(step, childDir) {
  if (step.status !== "failed" || !step.error) return false;
  return !childDir || !["process-terminal.json", "runner-startup.json"].some((file) => fs15.existsSync(path14.join(childDir, file)));
}
function readWorkflowChildEvidence(workflowAsyncDir, step) {
  const label = step.workflowKey ?? step.agent;
  if (typeof step.async !== "boolean") return { state: "unknown", reason: `workflow child ${label} is missing async classification` };
  if (!step.async) return void 0;
  if (!step.runId || path14.basename(step.runId) !== step.runId) return { state: "unknown", reason: `async workflow child ${label} is missing run id` };
  const childDir = path14.join(path14.dirname(workflowAsyncDir), step.runId);
  if (!fs15.existsSync(childDir)) return launchFailedBeforeRunner(step) ? void 0 : { state: "unknown", reason: `async workflow child ${label} directory is missing` };
  const childStatus = readStatus(childDir);
  if (!childStatus) return launchFailedBeforeRunner(step, childDir) ? void 0 : { state: "unknown", reason: `async workflow child ${label} status is missing or unreadable` };
  if (!isTerminalAsyncState(childStatus.state)) return { state: "pending", reason: `async workflow child ${label} is still ${childStatus.state}` };
  const recorded = childStatus.processTerminal;
  if (!recorded?.runnerProcessInstanceId) return { state: "unknown", reason: `async workflow child ${label} has no runner process identity` };
  if (recorded.state === "not-started" && recorded.runId === step.runId && typeof childStatus.error === "string" && childStatus.error) {
    return { state: "resolved", proof: recorded };
  }
  const proof = readProcessTerminal(childDir, { runId: step.runId, runnerProcessInstanceId: recorded.runnerProcessInstanceId });
  if (proof?.state !== "observed" || proof.runId !== step.runId) {
    const proofState = proof?.state ?? "missing";
    const bound = childStatus.runId === step.runId && typeof recorded.runnerProcessInstanceId === "string";
    return {
      state: !proof || proof.state === "pending" ? "pending" : "unknown",
      reason: `async workflow child ${label} process-terminal proof is ${proofState}`,
      ...bound ? { unresolvedProof: { status: childStatus, proofState } } : {}
    };
  }
  return { state: "resolved", proof };
}
function unresolved(runId, state, dispatchClosed, reason) {
  return { version: 1, kind: "workflow", runId, state, dispatchClosed, reason };
}
function readWorkflowTerminalProof(asyncDir, steps, summary, hostCommandCount, closedAt) {
  const runId = summary.workflowRunId;
  if (!summary.inventoryComplete || !TERMINAL_WORKFLOW_STATES.has(summary.workflowState)) {
    return unresolved(runId, "pending", false, "Workflow dispatch is still open.");
  }
  if (hostCommandCount > 0) {
    return unresolved(runId, "unknown", true, "Workflow host commands have no process-terminal proof.");
  }
  const evidence = readWorkflowChildProcessEvidence(asyncDir, steps);
  if (evidence.state !== "observed") return unresolved(runId, evidence.state, true, evidence.reason);
  const observedAt = Math.max(closedAt, ...evidence.children.map((child) => child.state === "observed" ? child.observedAt : 0));
  return { version: 1, kind: "workflow", runId, state: "observed", dispatchClosed: true, observedAt, children: evidence.children };
}

// src/runs/background/stale-run-reconciler.ts
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function readRunnerStartupDiagnostics(asyncDir) {
  const stderrPath = path15.join(asyncDir, "runner.stderr.log");
  const maxBytes = 64 * 1024;
  let content;
  try {
    const stat = fs16.statSync(stderrPath);
    if (stat.size <= 0) return void 0;
    const fd = fs16.openSync(stderrPath, "r");
    try {
      const bytesToRead = Math.min(stat.size, maxBytes);
      const start = Math.max(0, stat.size - bytesToRead);
      const buffer = Buffer.alloc(bytesToRead);
      fs16.readSync(fd, buffer, 0, bytesToRead, start);
      content = buffer.toString("utf-8").trim();
    } finally {
      fs16.closeSync(fd);
    }
  } catch {
    return void 0;
  }
  if (!content) return void 0;
  const lines = content.split(/\r?\n/).slice(-30).join("\n");
  return lines.length > 4e3 ? `${lines.slice(-4e3)}
[stderr tail truncated]` : lines;
}
function isNotFoundError(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function appendJsonlBestEffort(filePath, payload) {
  try {
    fs16.mkdirSync(path15.dirname(filePath), { recursive: true });
    fs16.appendFileSync(filePath, `${JSON.stringify(payload)}
`, "utf-8");
  } catch {
  }
}
function regularFileExists(filePath) {
  try {
    return fs16.statSync(filePath).isFile();
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}
function readResultRepairData(resultPath) {
  try {
    const data = JSON.parse(fs16.readFileSync(resultPath, "utf-8"));
    if (data.error !== void 0 && typeof data.error !== "string") throw new Error(`Invalid async result file '${resultPath}': error must be a string.`);
    const state = data.success ? "complete" : data.state === "stopped" ? "stopped" : data.state === "rejected" ? "rejected" : data.state === "partial" ? "partial" : data.state === "paused" || data.exitCode === 0 ? "paused" : "failed";
    const results = Array.isArray(data.results) ? data.results.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return {};
      const child = entry;
      if (child.model !== void 0 && typeof child.model !== "string") throw new Error(`Invalid async result file '${resultPath}': results[${index}].model must be a string.`);
      if (child.thinking !== void 0 && typeof child.thinking !== "string") throw new Error(`Invalid async result file '${resultPath}': results[${index}].thinking must be a string.`);
      return child;
    }) : void 0;
    return { state, ...data.error ? { error: data.error } : {}, ...results ? { results } : {} };
  } catch (error) {
    if (isNotFoundError(error)) return void 0;
    throw new Error(`Failed to read async result file '${resultPath}': ${getErrorMessage(error)}`, {
      cause: error instanceof Error ? error : void 0
    });
  }
}
function childState(overallState, child) {
  if (child?.success === true) return "complete";
  if (child?.success === false) return "failed";
  return overallState;
}
function failureDiagnostic(value) {
  return typeof value === "string" && value.trim() ? value : void 0;
}
function terminalStatusFromResult(status, resultPath, now) {
  const repair = readResultRepairData(resultPath);
  if (!repair) return void 0;
  const rootError = failureDiagnostic(status.error) ?? failureDiagnostic(repair.error) ?? repair.results?.map((child) => child.success === false ? failureDiagnostic(child.error) : void 0).find(Boolean);
  const steps = (status.steps ?? []).map((step, index) => {
    if (step.status !== "running" && step.status !== "pending") return step;
    const child = repair.results?.[index];
    const state = childState(repair.state, child);
    const model = child?.model ?? step.model;
    const thinking = resolveEffectiveThinking(model, child?.thinking ?? step.thinking);
    return {
      ...step,
      status: state === "complete" ? "complete" : state,
      endedAt: step.endedAt ?? now,
      durationMs: step.startedAt !== void 0 && step.durationMs === void 0 ? Math.max(0, now - step.startedAt) : step.durationMs,
      exitCode: step.exitCode ?? (state === "complete" || state === "paused" ? 0 : 1),
      error: state === "failed" || state === "partial" || state === "stopped" ? step.error ?? child?.error : step.error,
      stopped: state === "stopped" ? true : step.stopped,
      sessionName: step.sessionName ?? child?.sessionName,
      sessionFile: step.sessionFile ?? child?.sessionFile,
      model,
      thinking,
      requestedModel: child?.requestedModel ?? step.requestedModel,
      contextOverflow: child?.contextOverflow ?? step.contextOverflow
    };
  });
  const terminalStatus = {
    ...status,
    state: repair.state,
    ...rootError && (repair.state === "failed" || repair.state === "partial") ? { error: rootError } : {},
    ...status.lifecycleArtifactVersion === 3 && (!status.processTerminal || status.processTerminal.state === "pending") ? {
      processTerminal: { version: 1, state: "unknown", runId: status.runId, runnerProcessInstanceId: "observer-unavailable", reason: "observer-unavailable" }
    } : {},
    ...repair.state === "stopped" ? { stopped: true } : {},
    activityState: void 0,
    lastUpdate: now,
    endedAt: status.endedAt ?? now,
    steps
  };
  delete terminalStatus.displayDismissedAt;
  return terminalStatus;
}
function buildStartedStatus(asyncDir, startedRun, now) {
  const startedAt = startedRun.startedAt ?? now;
  const agents = startedRun.agents?.length ? startedRun.agents : ["subagent"];
  const chainStepCount = startedRun.chainStepCount;
  const parallelGroups = chainStepCount !== void 0 ? normalizeParallelGroups(startedRun.parallelGroups, agents.length, chainStepCount) : [];
  return {
    runId: startedRun.runId || path15.basename(asyncDir),
    ...startedRun.sessionId ? { sessionId: startedRun.sessionId } : {},
    ...startedRun.completionOwnerId ? { completionOwnerId: startedRun.completionOwnerId } : {},
    mode: startedRun.mode ?? "single",
    state: "running",
    pid: startedRun.pid,
    pidNamespaceScope: currentPidNamespaceScope(),
    startedAt,
    lastUpdate: now,
    currentStep: 0,
    ...chainStepCount !== void 0 ? { chainStepCount } : {},
    ...parallelGroups.length ? { parallelGroups } : {},
    steps: agents.map((agent) => ({
      agent,
      status: "running",
      startedAt
    })),
    ...startedRun.sessionFile ? { sessionFile: startedRun.sessionFile } : {}
  };
}
function settledWorkflowChildStatus(asyncDir, workflowRunId, step, now) {
  const childRunId = step.runId;
  if (step.async !== true || step.parentWorkflowRunId !== workflowRunId || !childRunId || childRunId === workflowRunId || childRunId !== path15.basename(childRunId) || childRunId === "." || childRunId === "..") return void 0;
  const child = readStatus(path15.join(path15.dirname(asyncDir), childRunId));
  if (!child || child.runId !== childRunId || child.parentWorkflowRunId !== workflowRunId || !isTerminalAsyncState(child.state)) return void 0;
  if (step.workflowKey !== void 0 && child.workflowKey !== step.workflowKey) return void 0;
  const state = child.state;
  const childStep = child.steps?.[0];
  const endedAt = child.endedAt ?? step.endedAt ?? now;
  const settled = {
    ...step,
    status: state,
    activityState: void 0,
    endedAt,
    durationMs: step.startedAt !== void 0 ? Math.max(0, endedAt - step.startedAt) : step.durationMs,
    exitCode: childStep?.exitCode ?? (state === "complete" ? 0 : 1),
    error: state === "complete" ? void 0 : childStep?.error ?? child.error ?? step.error,
    stopped: state === "stopped" ? true : step.stopped
  };
  if (settled.error === void 0) delete settled.error;
  if (settled.stopped === void 0) delete settled.stopped;
  return settled;
}
function buildFailedRepair(status, asyncDir, now, reason, ownerExited = false, adoptCompletionOwnerId) {
  const runId = status.runId || path15.basename(asyncDir);
  const pid = typeof status.pid === "number" ? status.pid : "unknown";
  const exitedWorkflow = ownerExited && status.mode === "workflow" ? status.workflow : void 0;
  const completionOwnerId = exitedWorkflow ? adoptCompletionOwnerId || OWNING_SESSION_COMPLETION_OWNER : status.completionOwnerId;
  const terminal3 = readProcessTerminal(asyncDir, { runId }) ?? status.processTerminal;
  const runnerExit = terminal3?.state === "observed" || terminal3?.state === "unknown" ? terminal3.instances?.find((instance) => instance.kind === "runner" && instance.processInstanceId === terminal3.runnerProcessInstanceId) : void 0;
  const exitText = runnerExit?.kind === "runner" ? `exited with code ${runnerExit.exitCode ?? "none"}${runnerExit.signal ? ` (signal ${runnerExit.signal})` : ""}` : "exited or disappeared";
  const baseMessage = reason ?? (exitedWorkflow ? `The Pi process (PID ${pid}) that ran workflow ${runId} exited before the workflow finished. Marked run failed by stale-run reconciliation. Its finished children are kept.` : `Async runner process ${pid} ${exitText} before writing a result. Marked run failed by stale-run reconciliation.`);
  const diagnostics = readRunnerStartupDiagnostics(asyncDir);
  const message = diagnostics ? `${baseMessage}

Runner stderr tail:
${diagnostics}` : baseMessage;
  const steps = status.steps?.length ? status.steps : [{ agent: "subagent", status: "running" }];
  const repairedSteps = steps.map((step) => {
    if (step.status !== "running" && step.status !== "pending") return step;
    let settled;
    let childReadError;
    try {
      settled = settledWorkflowChildStatus(asyncDir, runId, step, now);
    } catch (error) {
      childReadError = error instanceof Error ? error.message : String(error);
    }
    if (settled) return settled;
    return {
      ...step,
      status: "failed",
      activityState: void 0,
      endedAt: step.endedAt ?? now,
      durationMs: step.startedAt !== void 0 && step.durationMs === void 0 ? Math.max(0, now - step.startedAt) : step.durationMs,
      exitCode: step.exitCode ?? 1,
      error: step.error ?? (childReadError ? `${message} (child status unreadable: ${childReadError})` : message)
    };
  });
  const repairedStatus = {
    ...status,
    state: "failed",
    ...status.lifecycleArtifactVersion === 3 && (!status.processTerminal || status.processTerminal.state === "pending") ? {
      processTerminal: { version: 1, state: "unknown", runId, runnerProcessInstanceId: "observer-unavailable", reason: "stale-repair" }
    } : {},
    activityState: void 0,
    lastUpdate: now,
    endedAt: now,
    steps: repairedSteps,
    // Read from the pre-repair status: the repair time would make an old crash look new.
    ...exitedWorkflow ? { workflow: { ...exitedWorkflow, stopCause: WORKFLOW_STOP_CAUSE_OWNER_EXITED, ownerExitedAt: status.lastUpdate ?? status.startedAt } } : {},
    ...completionOwnerId ? { completionOwnerId } : {}
  };
  const resultAgent = repairedSteps[status.currentStep ?? 0]?.agent ?? repairedSteps[0]?.agent ?? "subagent";
  return {
    status: repairedStatus,
    message,
    result: {
      id: runId,
      agent: resultAgent,
      mode: status.mode,
      ...exitedWorkflow ? { workflow: { stopCause: WORKFLOW_STOP_CAUSE_OWNER_EXITED } } : {},
      ...completionOwnerId ? { completionOwnerId } : {},
      ...status.completionOwnerProcess ? { completionOwnerProcess: status.completionOwnerProcess } : {},
      ...status.parentWorkflowRunId ? { parentWorkflowRunId: status.parentWorkflowRunId } : {},
      ...status.workflowKey ? { workflowKey: status.workflowKey } : {},
      success: false,
      state: "failed",
      summary: message,
      results: repairedSteps.map((step) => ({
        agent: step.agent,
        ...step.sessionName ? { sessionName: step.sessionName } : {},
        output: step.status === "complete" || step.status === "completed" ? "" : message,
        error: step.status === "complete" || step.status === "completed" ? void 0 : step.error ?? message,
        success: step.status === "complete" || step.status === "completed",
        model: step.model,
        requestedModel: step.requestedModel,
        contextOverflow: step.contextOverflow,
        sessionFile: step.sessionFile
      })),
      exitCode: 1,
      timestamp: now,
      durationMs: Math.max(0, now - status.startedAt),
      asyncDir,
      sessionId: status.sessionId,
      sessionFile: status.sessionFile
    }
  };
}
function writeFailedRepair(asyncDir, status, resultPath, now, reason, ownerExited = false, adoptCompletionOwnerId) {
  const repair = buildFailedRepair(status, asyncDir, now, reason, ownerExited, adoptCompletionOwnerId);
  if (repair.result.sessionId) writeAsyncResultFile(resultPath, repair.result);
  writeAtomicJson(path15.join(asyncDir, "status.json"), repair.status);
  updateActiveRunIndex(asyncDir, repair.status.state, repair.status.toolCallId);
  appendJsonlBestEffort(path15.join(asyncDir, "events.jsonl"), {
    type: "subagent.run.repaired_stale",
    ts: now,
    runId: repair.status.runId,
    pid: status.pid,
    ...repair.result.sessionId ? { resultPath } : {},
    message: repair.message
  });
  return { status: repair.status, repaired: true, ...repair.result.sessionId ? { resultPath } : {}, message: repair.message };
}
function terminal2(state) {
  return state === "complete" || state === "failed" || state === "partial" || state === "paused" || state === "stopped" || state === "rejected";
}
function* nestedRuns(children) {
  for (const child of children ?? []) {
    yield child;
    yield* nestedRuns(child.children);
    yield* nestedRuns(child.steps?.flatMap((step) => step.children ?? []));
  }
}
function reconcileNestedAsyncDescendants(route, options = {}) {
  const registry = projectNestedEvents(route);
  for (const run of nestedRuns(registry.children)) {
    if (run.state !== "running" && run.state !== "queued") continue;
    const asyncDir = resolveNestedAsyncDir(route.rootRunId, run);
    if (!asyncDir) continue;
    const result = reconcileAsyncRun(asyncDir, {
      ...options,
      resultsDir: path15.join(options.resultsDir ?? DIRS.results, "nested", route.rootRunId)
    });
    const status = result.status;
    if (!status) continue;
    if (!result.repaired && !terminal2(status.state)) continue;
    const ts = options.now?.() ?? Date.now();
    writeNestedEvent(route, {
      type: terminal2(status.state) ? "subagent.nested.completed" : "subagent.nested.updated",
      ts,
      parentRunId: run.parentRunId,
      parentStepIndex: run.parentStepIndex,
      child: nestedSummaryFromAsyncStatus(status, asyncDir, {
        id: run.id,
        parentRunId: run.parentRunId,
        parentStepIndex: run.parentStepIndex,
        depth: run.depth,
        path: run.path,
        mode: run.mode,
        ts
      })
    });
  }
}
function checkPidLiveness(pid, kill = process.kill, probeZombie = false) {
  try {
    kill(pid, 0);
    if (probeZombie && process.platform === "linux") {
      try {
        const stat = fs16.readFileSync(`/proc/${pid}/stat`, "utf-8");
        const closeParen = stat.lastIndexOf(") ");
        if (closeParen >= 0 && stat[closeParen + 2] === "Z") return "dead";
      } catch {
      }
    }
    return "alive";
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
    if (code === "ESRCH") return "dead";
    if (code === "EPERM") return "unknown";
    return "unknown";
  }
}
function isRecordedPid(value) {
  if (!value || typeof value !== "object") return false;
  const { pid, pidNamespaceScope, bootId } = value;
  return typeof pid === "number" && Number.isSafeInteger(pid) && pid > 0 && (pidNamespaceScope === void 0 || typeof pidNamespaceScope === "string") && (bootId === void 0 || typeof bootId === "string");
}
function checkRecordedPidLiveness(recorded, observation = { observedScope: currentPidNamespaceScope(), observedBootId: currentBootId() }) {
  const { observedScope, observedBootId } = observation;
  if (recorded.pidNamespaceScope === observedScope && recorded.bootId && observedBootId && recorded.bootId !== observedBootId) return "dead";
  const scopeMismatch = recorded.pidNamespaceScope !== void 0 && recorded.pidNamespaceScope !== observedScope;
  const scopeVerified = recorded.pidNamespaceScope !== void 0 && recorded.pidNamespaceScope === observedScope;
  const liveness = observation.probe ? observation.probe(recorded.pid) : checkPidLiveness(recorded.pid, observation.kill, scopeVerified);
  return liveness === "dead" && scopeMismatch ? "unknown" : liveness;
}
function reconcileAsyncRun(asyncDir, options = {}, observeStatus) {
  const now = options.now?.() ?? Date.now();
  const status = readStatus(asyncDir);
  observeStatus?.(status);
  const startedStatus = !status && options.startedRun ? buildStartedStatus(asyncDir, options.startedRun, now) : void 0;
  const effectiveStatus = status ?? startedStatus;
  if (!effectiveStatus) return { status: null, repaired: false };
  assertWorkflowGraphHostSteps(effectiveStatus.workflowGraph, path15.join(asyncDir, "status.json"), effectiveStatus.runId);
  const statusPath = path15.join(asyncDir, "status.json");
  for (const [index, step] of (effectiveStatus.steps ?? []).entries()) {
    const stepRecord = step;
    if (stepRecord.model !== void 0 && typeof stepRecord.model !== "string") throw new Error(`Invalid async status file '${statusPath}': steps[${index}].model must be a string.`);
    if (stepRecord.thinking !== void 0 && typeof stepRecord.thinking !== "string") throw new Error(`Invalid async status file '${statusPath}': steps[${index}].thinking must be a string.`);
  }
  const runId = effectiveStatus.runId || path15.basename(asyncDir);
  const resultsDir = options.resultsDir ?? DIRS.results;
  const resultPath = resultFilePath(resultsDir, runId);
  const existingResultPath = effectiveStatus.sessionId ? resultPayloadPathForSessionRun(resultsDir, effectiveStatus.sessionId, runId) ?? (regularFileExists(resultPath) ? resultPath : void 0) : regularFileExists(resultPath) ? resultPath : void 0;
  if (existingResultPath) {
    const terminalStatus = effectiveStatus.state === "running" || effectiveStatus.state === "queued" ? terminalStatusFromResult(effectiveStatus, existingResultPath, now) : void 0;
    if (terminalStatus) {
      const currentStatus = readStatus(asyncDir);
      const currentRootError = failureDiagnostic(currentStatus?.error);
      const currentTerminal = currentStatus?.processTerminal?.state === "observed" || currentStatus?.processTerminal?.state === "unknown" ? currentStatus.processTerminal : void 0;
      const steps = terminalStatus.steps?.map((step, index) => {
        const currentStepTerminal = currentStatus?.steps?.[index]?.processTerminal;
        return currentStepTerminal?.state === "observed" || currentStepTerminal?.state === "unknown" ? { ...step, processTerminal: currentStepTerminal } : step;
      });
      const statusToWrite = {
        ...terminalStatus,
        ...currentRootError ? { error: currentRootError } : {},
        ...currentTerminal ? { processTerminal: currentTerminal } : {},
        ...steps ? { steps } : {}
      };
      writeAtomicJson(statusPath, statusToWrite);
      updateActiveRunIndex(asyncDir, statusToWrite.state, statusToWrite.toolCallId);
      return { status: statusToWrite, repaired: true, resultPath: existingResultPath, message: "Existing async result file was used to repair stale running status." };
    }
    if (effectiveStatus.displayDismissedAt === void 0) return { status: effectiveStatus, repaired: false, resultPath: existingResultPath };
  }
  if (effectiveStatus.displayDismissedAt !== void 0) {
    return { status: null, repaired: false, resultPath };
  }
  if (effectiveStatus.state !== "running" || typeof effectiveStatus.pid !== "number") {
    return { status: status ?? null, repaired: false, resultPath };
  }
  if (!status) {
    const startedAt = options.startedRun?.startedAt ?? effectiveStatus.startedAt;
    if (now - startedAt < (options.missingStatusGraceMs ?? 1e3)) {
      return { status: null, repaired: false, resultPath };
    }
  }
  const liveness = checkRecordedPidLiveness({ pid: effectiveStatus.pid, pidNamespaceScope: effectiveStatus.pidNamespaceScope, bootId: effectiveStatus.bootId }, {
    kill: options.kill,
    observedScope: options.pidNamespaceScope ? options.pidNamespaceScope() : currentPidNamespaceScope(),
    observedBootId: options.bootId ? options.bootId() : currentBootId()
  });
  if (liveness !== "dead") {
    const staleAfterMs = options.staleAlivePidMs ?? 24 * 60 * 60 * 1e3;
    const lastUpdate = effectiveStatus.lastUpdate ?? effectiveStatus.startedAt;
    if (now - lastUpdate <= staleAfterMs) return { status: status ?? null, repaired: false, resultPath };
    const probe = liveness === "alive" ? "is still live" : "cannot be probed from this process";
    const message = `Async runner PID ${effectiveStatus.pid} ${probe}; status has not updated for ${now - lastUpdate}ms, so stale-run reconciliation marked the run failed because PID ownership is unverified.`;
    return writeFailedRepair(asyncDir, effectiveStatus, resultPath, now, message);
  }
  return writeFailedRepair(asyncDir, effectiveStatus, resultPath, now, void 0, true, options.adoptCompletionOwnerId);
}

// src/policy/authority.ts
var AUTHORITY_ACTIONS = [
  "discardWorktree",
  "destructiveCleanup",
  "spawnBudgetGrant",
  "scheduleCreate",
  "stopRun",
  "steerRun",
  "inspectorOpen",
  "projectOpen"
];
var DEFAULT_AUTHORITY_POLICY = {
  discardWorktree: "confirm",
  destructiveCleanup: "confirm",
  spawnBudgetGrant: "confirm",
  scheduleCreate: "auto",
  stopRun: "auto",
  steerRun: "auto",
  inspectorOpen: "auto",
  projectOpen: "confirm"
};
function resolveAuthorityDecision(input) {
  return input.policy?.[input.action] ?? DEFAULT_AUTHORITY_POLICY[input.action];
}
function validateAuthorityPolicy(value, label = "config.authorityPolicy") {
  if (value === void 0) return void 0;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  const policy = value;
  const allowedActions = new Set(AUTHORITY_ACTIONS);
  for (const [action, decision] of Object.entries(policy)) {
    if (!allowedActions.has(action)) {
      throw new Error(`${label}.${action} is unknown; expected one of ${AUTHORITY_ACTIONS.join(", ")}`);
    }
    if (decision !== "auto" && decision !== "confirm" && decision !== "forbid") {
      throw new Error(`${label}.${action} must be "auto", "confirm", or "forbid"`);
    }
  }
  return policy;
}

// src/runs/shared/worktree.ts
import { createHash as createHash6 } from "node:crypto";
import { spawnSync } from "node:child_process";

// src/runs/shared/worktree-setup-command.ts
import { spawn as spawn2 } from "node:child_process";
function terminateCommandTree(pid, controller) {
  if (process.platform !== "win32") return controller.terminate();
  return new Promise((resolve6) => {
    let settled = false;
    const fallback = () => {
      if (settled) return;
      settled = true;
      void controller.terminate().then(resolve6);
    };
    const cleanup = spawn2("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    cleanup.once("error", fallback);
    cleanup.once("close", (status) => {
      if (settled) return;
      if (status !== 0) return fallback();
      settled = true;
      resolve6({ state: "observed", mechanism: "windows-taskkill", pid, verifiedAt: Date.now() });
    });
  });
}
function commandError(message, code) {
  return Object.assign(new Error(message), { code });
}
async function runSetupCommand(command, args, options) {
  const result = {
    stdout: "",
    stdoutBuffer: Buffer.alloc(0),
    stderr: "",
    status: null,
    signal: null,
    outputIncomplete: false
  };
  const maxBuffer = options.maxBuffer ?? 1024 * 1024;
  if (!Number.isSafeInteger(maxBuffer) || maxBuffer <= 0) throw new Error("Invalid setup command maxBuffer");
  if (options.deadlineAt !== void 0 && !Number.isFinite(options.deadlineAt)) throw new Error("Invalid setup deadline");
  if (options.hookTimeoutMs !== void 0 && (!Number.isSafeInteger(options.hookTimeoutMs) || options.hookTimeoutMs <= 0)) {
    throw new Error("Invalid setup hook timeout");
  }
  const cancellation = () => {
    if (options.signal?.aborted) return commandError("Worktree setup aborted", "ABORT_ERR");
    if (options.deadlineAt !== void 0 && Date.now() >= options.deadlineAt) {
      return commandError("Worktree setup deadline exceeded", "ETIMEDOUT");
    }
    return void 0;
  };
  result.error = cancellation();
  if (result.error) return result;
  let child;
  try {
    child = spawn2(command, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: "pipe",
      shell: false,
      windowsHide: true,
      // Isolated owned POSIX group, never unref'd or fire-and-forget.
      detached: process.platform !== "win32"
    });
  } catch (error) {
    result.error = error instanceof Error ? error : new Error(String(error));
    return result;
  }
  result.pid = child.pid;
  if (child.pid !== void 0 && process.platform !== "win32") result.processGroupId = child.pid;
  const tree = child.pid === void 0 ? void 0 : createOwnedProcessTreeController(child.pid);
  let termination;
  let directSettled = false;
  const releaseUnknownIO = () => {
    if (!directSettled || result.processTree?.state !== "unknown") return;
    const detail = result.processTree.diagnostic ? `: ${result.processTree.diagnostic}` : "";
    result.error = commandError(`Worktree setup process tree settlement is unverified${detail}`, "PROCESS_TREE_UNVERIFIED");
    result.outputIncomplete = true;
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
  };
  const terminate = () => {
    if (termination || !tree) return;
    if (directSettled) {
      result.processTree = {
        state: "unknown",
        reason: "verification-failed",
        diagnostic: "Command exited before termination began; no longer safe to signal its recorded PID."
      };
      releaseUnknownIO();
      return;
    }
    termination = terminateCommandTree(result.pid, tree).then((proof) => {
      result.processTree = proof;
      releaseUnknownIO();
      return proof;
    });
  };
  const fail = (error) => {
    result.error ??= error;
    terminate();
  };
  const onAbort = () => fail(commandError("Worktree setup aborted", "ABORT_ERR"));
  const stdout = [];
  const stderr = [];
  let capturedBytes = 0;
  const capture = (chunks, chunk) => {
    const remaining = maxBuffer - capturedBytes;
    if (remaining > 0) {
      const saved = Buffer.from(chunk.subarray(0, remaining));
      chunks.push(saved);
      capturedBytes += saved.length;
    }
    if (chunk.length > remaining) {
      result.outputIncomplete = true;
      fail(commandError("Worktree setup command output exceeds maxBuffer", "ENOBUFS"));
    }
  };
  const onStdout = (chunk) => capture(stdout, chunk);
  const onStderr = (chunk) => capture(stderr, chunk);
  child.stdout.on("data", onStdout);
  child.stderr.on("data", onStderr);
  child.stdin.on("error", fail);
  const close = new Promise((resolve6) => child.once("close", () => resolve6()));
  const directExit = new Promise((resolve6) => {
    child.once("exit", (status, signal) => {
      directSettled = true;
      result.status = status;
      result.signal = signal;
      if (status === null || !(options.acceptedExitCodes ?? [0]).includes(status)) terminate();
      releaseUnknownIO();
      resolve6();
    });
    child.once("error", (error) => {
      fail(error);
      if (child.pid === void 0) {
        directSettled = true;
        resolve6();
      }
    });
  });
  let timer;
  const deadlineAt = Math.min(
    options.deadlineAt ?? Infinity,
    options.hookTimeoutMs === void 0 ? Infinity : Date.now() + options.hookTimeoutMs
  );
  const armDeadline = () => {
    if (deadlineAt === Infinity) return;
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) fail(commandError("Worktree setup command timed out", "ETIMEDOUT"));
    else timer = setTimeout(armDeadline, Math.min(remaining, 2 ** 31 - 1));
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    armDeadline();
    if (options.signal?.aborted) onAbort();
    if (child.pid !== void 0) {
      try {
        options.onSpawn?.({ pid: child.pid, processGroupId: result.processGroupId });
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    }
    child.stdin.end(options.input);
    await directExit;
    if (termination) result.processTree = await termination;
    releaseUnknownIO();
    await close;
    if (termination) result.processTree = await termination;
    const cancelled = cancellation();
    if (cancelled) fail(cancelled);
    result.stdoutBuffer = Buffer.concat(stdout);
    result.stdout = result.stdoutBuffer.toString("utf8");
    result.stderr = Buffer.concat(stderr).toString("utf8");
    return result;
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
    child.stdout.removeListener("data", onStdout);
    child.stderr.removeListener("data", onStderr);
    child.stdin.removeListener("error", fail);
  }
}

// src/runs/shared/worktree.ts
import * as fs17 from "node:fs";
import * as os2 from "node:os";
import * as path16 from "node:path";
var DEFAULT_WORKTREE_PROVIDER = "auto";
var DEFAULT_WORKTREE_BASE_REF = "HEAD";
var DEFAULT_WORKTREE_BRANCH_PREFIX = "pi-subagents/";
var WORKTREE_AGENT_CWD_PLACEHOLDER = path16.join(path16.parse(process.cwd()).root, "__pi_subagents_worktree_cwd__");
var WORKTREE_NAMING_COMPONENT_MAX_BYTES = 96;
var WORKTREE_NAMING_LABEL_MAX_BYTES = 256;
var WORKTREE_NAMING_BRANCH_MAX_BYTES = 256;
var WORKTREE_COMMAND_OUTPUT_MAX_BYTES = 128 * 1024;
var WORKTRUNK_COMMAND = process.platform === "win32" ? "git" : "wt";
var WORKTRUNK_ARG_PREFIX = process.platform === "win32" ? ["wt"] : [];
var MACHINE_DIFF_OPTIONS = ["--no-color", "--no-ext-diff", "--no-textconv", "--src-prefix=a/", "--dst-prefix=b/", "--line-prefix=", "--no-relative"];
var MACHINE_PATCH_OPTIONS = [...MACHINE_DIFF_OPTIONS, "--binary"];
var PATCH_VALIDATION_OPTIONS = ["apply", "--check", "--cached", "--reverse", "--binary", "--whitespace=nowarn"];
var DEFAULT_WORKTREE_SETUP_HOOK_TIMEOUT_MS = 3e4;
var WorktreeSetupError = class extends Error {
  snapshot;
  constructor(error, snapshot) {
    super(`${error instanceof Error ? error.message : String(error)}${snapshot.unknown ? `; setup settlement unknown: ${snapshot.unknown}; manual reconciliation required` : ""}`, { cause: error });
    this.name = "WorktreeSetupError";
    this.snapshot = snapshot;
  }
};
var worktreeTurn = Promise.resolve();
var setupActive = false;
var setupPoison;
function assertWorktreeMutationAllowed() {
  if (setupPoison) throw new Error(`Worktree mutation blocked: ${setupPoison}`);
  if (setupActive) throw new Error("Worktree setup is active; finalization must await withWorktreeTransaction");
}
async function withWorktreeTransaction(action) {
  const previous = worktreeTurn;
  let release;
  worktreeTurn = new Promise((resolve6) => {
    release = resolve6;
  });
  await previous;
  try {
    if (setupPoison) throw new Error(`Worktree mutation blocked: ${setupPoison}`);
    return await action();
  } finally {
    release();
  }
}
var SetupTransaction = class {
  progress;
  options;
  constructor(cwd, options) {
    this.options = options;
    this.progress = { setup: { cwd, baseCommit: "", worktrees: [] }, attempts: [], phase: "preflight" };
  }
  snapshot() {
    return structuredClone(this.progress);
  }
  publish() {
    this.options.onProgress?.(this.snapshot());
  }
  check() {
    if (setupPoison) throw new Error(setupPoison);
    if (this.options.signal?.aborted) throw new Error("Worktree setup aborted");
    if (this.options.deadlineAt !== void 0 && Date.now() >= this.options.deadlineAt) throw new Error("Worktree setup deadline exceeded");
  }
  unknown(error) {
    const reason = error instanceof Error ? error.message : String(error);
    this.progress.unknown ??= reason;
    setupPoison ??= reason;
  }
  async command(command, args, options = {}) {
    this.check();
    this.progress.command = { command, args };
    if (this.progress.phase === "allocation") this.progress.attempts.at(-1).command = this.progress.command;
    if (this.progress.phase === "hook") this.progress.attempts.find((attempt) => attempt.path === options.cwd).hookCommand = this.progress.command;
    const result = await runSetupCommand(command, args, {
      ...options,
      signal: this.options.signal,
      deadlineAt: this.options.deadlineAt,
      onSpawn: (process2) => {
        Object.assign(this.progress.command, process2);
        this.publish();
      }
    });
    const { stdout: _stdout, stdoutBuffer: _stdoutBuffer, stderr: _stderr, ...metadata } = result;
    this.progress.command.result = metadata;
    if (result.processTree?.state === "unknown") this.unknown(result.error ?? "Command tree settlement unverified");
    this.publish();
    if (result.error) throw result.error;
    return result;
  }
  async git(cwd, args, acceptedExitCodes) {
    return this.command("git", ["-C", cwd, ...args], { acceptedExitCodes });
  }
  async gitChecked(cwd, args) {
    const result = await this.git(cwd, args);
    return result.stdout;
  }
  attempt(index, branch, worktreePath) {
    this.check();
    this.progress.phase = "allocation";
    this.progress.command = void 0;
    this.progress.attempts.push({ index, branch, path: worktreePath, validated: false });
    this.publish();
  }
  validated(worktree) {
    this.progress.phase = "validated";
    Object.assign(this.progress.attempts.at(-1), { path: worktree.path, validated: true });
    this.progress.setup.worktrees.push(worktree);
    this.publish();
  }
};
function runGit(cwd, args, env) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf-8", windowsHide: true, shell: false, ...env ? { env: { ...process.env, ...env } } : {} });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status
  };
}
function runGitChecked(cwd, args) {
  const result = runGit(cwd, args);
  if (result.status !== 0) {
    const command = `git -C ${cwd} ${args.join(" ")}`;
    const message = result.stderr.trim() || result.stdout.trim() || `${command} failed`;
    throw new Error(message);
  }
  return result.stdout;
}
function validateWorktreePatch(worktreePath, patchPath) {
  const result = runGit(worktreePath, [...PATCH_VALIDATION_OPTIONS, patchPath]);
  if (result.status === 0) return void 0;
  return result.stderr.trim() || result.stdout.trim() || `git -C ${worktreePath} apply --check failed`;
}
function currentWorktreePatch(worktreePath, baseCommit) {
  assertWorktreeMutationAllowed();
  let tempDir;
  try {
    tempDir = fs17.mkdtempSync(path16.join(os2.tmpdir(), "pi-worktree-index-"));
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  const env = { GIT_INDEX_FILE: path16.join(tempDir, "index") };
  try {
    const readTree = runGit(worktreePath, ["read-tree", "HEAD"], env);
    if (readTree.status !== 0) return { error: readTree.stderr.trim() || readTree.stdout.trim() || "git read-tree failed" };
    const add = runGit(worktreePath, ["add", "-A"], env);
    if (add.status !== 0) return { error: add.stderr.trim() || add.stdout.trim() || "git add failed" };
    const diff = runGit(worktreePath, ["diff", "--cached", ...MACHINE_PATCH_OPTIONS, baseCommit], env);
    if (diff.status !== 0) return { error: diff.stderr.trim() || diff.stdout.trim() || "git diff failed" };
    return { patch: diff.stdout };
  } finally {
    try {
      fs17.rmSync(tempDir, { recursive: true, force: true });
    } catch {
    }
  }
}
function validateWorktreePatchRepresentsCurrentWorktree(worktreePath, baseCommit, patchPath) {
  const validationError = validateWorktreePatch(worktreePath, patchPath);
  if (validationError) return validationError;
  let capturedPatch;
  try {
    capturedPatch = fs17.readFileSync(patchPath, "utf-8");
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const current = currentWorktreePatch(worktreePath, baseCommit);
  if ("error" in current) return current.error || "failed to capture current worktree patch";
  if (capturedPatch !== current.patch) return "captured handoff patch does not match current worktree changes";
  return void 0;
}
async function probeWorktreeSource(tx, cwd) {
  const repoCheck = await tx.git(cwd, ["rev-parse", "--is-inside-work-tree"], [0, 128]);
  if (repoCheck.status !== 0 || repoCheck.stdout.trim() !== "true") throw new Error("worktree isolation requires a git repository");
  const toplevel = (await tx.gitChecked(cwd, ["rev-parse", "--show-toplevel"])).trim();
  const status = await tx.gitChecked(toplevel, ["status", "--porcelain", "--", `:!${PROJECT_SUBAGENTS_RELATIVE_DIR}`]);
  if (status.trim().length > 0) {
    throw new Error("worktree isolation requires a clean git working tree. Commit or stash changes first.");
  }
  return toplevel;
}
async function preflightWorktreeSource(cwd, options = {}) {
  const git = async (cwd2, args, acceptedExitCodes = [0]) => {
    const result = await runSetupCommand("git", ["-C", cwd2, ...args], { ...options, acceptedExitCodes });
    if (result.error) throw result.error;
    if (result.outputIncomplete || result.status === null || !acceptedExitCodes.includes(result.status)) {
      throw new Error(result.stderr.trim().slice(0, 2e3) || "Worktree source probe failed");
    }
    return result;
  };
  await probeWorktreeSource({ git, gitChecked: async (cwd2, args) => (await git(cwd2, args)).stdout }, cwd);
}
async function resolveRepoState(tx, cwd, requestedBaseRef) {
  const toplevel = await probeWorktreeSource(tx, cwd);
  const rawPrefix = (await tx.gitChecked(cwd, ["rev-parse", "--show-prefix"])).trim();
  const cwdRelative = rawPrefix ? path16.normalize(rawPrefix.replace(/[\\/]+$/, "")) : "";
  const baseRef = normalizeWorktreeBaseRef(requestedBaseRef) ?? DEFAULT_WORKTREE_BASE_REF;
  let baseCommit;
  try {
    const base = await tx.git(toplevel, ["rev-parse", "--verify", "--end-of-options", `${baseRef}^{commit}`], [0, 128]);
    if (base.status !== 0) throw new Error(base.stderr.trim() || "ref not found");
    baseCommit = base.stdout.trim();
  } catch (error) {
    throw new Error(`baseRef '${baseRef}' could not be resolved to a commit: ${error instanceof Error ? error.message : String(error)}`, { cause: error instanceof Error ? error : void 0 });
  }
  if (!baseCommit) throw new Error(`baseRef '${baseRef}' could not be resolved to a commit`);
  return { toplevel, cwdRelative, baseCommit };
}
function normalizeComparableCwd(cwd) {
  const resolved2 = path16.resolve(cwd);
  let existing = resolved2;
  const missingSegments = [];
  while (true) {
    try {
      let realpath;
      try {
        realpath = fs17.realpathSync.native(existing);
      } catch {
        realpath = fs17.realpathSync(existing);
      }
      return path16.join(realpath, ...missingSegments.reverse());
    } catch {
      const parent = path16.dirname(existing);
      if (parent === existing) return resolved2;
      missingSegments.push(path16.basename(existing));
      existing = parent;
    }
  }
}
function safePatchAgentName(agent) {
  return agent.replace(/[^\w.-]/g, "_");
}
function shortWorktreeHash(value) {
  return createHash6("sha256").update(value, "utf-8").digest("hex").slice(0, 8);
}
function truncateUtf8(value, maxBytes) {
  const bytes = Buffer.from(value, "utf-8");
  if (bytes.length <= maxBytes) return value;
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 192) === 128) end -= 1;
  return bytes.subarray(0, end).toString("utf-8");
}
function sanitizeWorktreePathComponent(value, maxBytes = WORKTREE_NAMING_COMPONENT_MAX_BYTES) {
  const raw = value.trim();
  let normalized = raw.replace(/[\\/\s]+/g, "-").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[._-]+|[._-]+$/g, "");
  if (!normalized) return "task";
  const changed = normalized !== raw;
  if (changed || Buffer.byteLength(normalized, "utf-8") > maxBytes) {
    const suffix = `-${shortWorktreeHash(raw || "task")}`;
    const prefix = truncateUtf8(normalized, Math.max(1, maxBytes - Buffer.byteLength(suffix, "utf-8"))).replace(/[._-]+$/g, "");
    normalized = `${prefix || "task"}${suffix}`;
  }
  return truncateUtf8(normalized, maxBytes).replace(/^[._-]+|[._-]+$/g, "") || "task";
}
function validGitRef2(ref) {
  if (!ref || ref === "@" || Buffer.byteLength(ref, "utf-8") > 1024 || ref.startsWith("/") || ref.endsWith("/") || ref.includes("//") || ref.includes("..") || ref.includes("@{")) return false;
  if (/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(ref)) return false;
  if (/[[\]\\~^:?*\u0000-\u0020\u007f]/u.test(ref) || ref.endsWith(".") || ref.endsWith(".lock")) return false;
  return ref.split("/").every((component) => component.length > 0 && component !== "." && component !== ".." && !component.startsWith(".") && !component.endsWith(".") && !component.endsWith(".lock"));
}
function normalizeWorktreeBaseRef(value) {
  if (value === void 0) return void 0;
  if (typeof value !== "string" || !validGitRef2(value)) throw new Error("baseRef must be a valid Git ref: use HEAD or a supported named ref (for example, refs/heads/main). Full 40/64-character commit IDs and revision expressions are unsupported.");
  return value;
}
function normalizeWorktreeBranchPrefix(value) {
  const raw = value === void 0 ? DEFAULT_WORKTREE_BRANCH_PREFIX : value.trim();
  if (!raw) throw new Error("worktree branch prefix cannot be empty");
  if (raw.includes("\\") || /[\u0000-\u001f\u007f\s]/u.test(raw) || raw.startsWith("/") || raw.includes("//") || raw.includes("..") || raw.includes("@{")) {
    throw new Error("worktree branch prefix contains invalid Git ref characters");
  }
  const withoutTrailingSlash = raw.replace(/\/+$/u, "");
  if (!withoutTrailingSlash || withoutTrailingSlash.startsWith("-") || withoutTrailingSlash.split("/").some((component) => component === "." || component === ".." || component.startsWith("."))) {
    throw new Error("worktree branch prefix contains an invalid Git ref component");
  }
  const prefix = `${withoutTrailingSlash}/`;
  if (!validGitRef2(`${prefix}task`)) throw new Error("worktree branch prefix is not a valid Git ref namespace");
  return prefix;
}
function runShortId(runId) {
  const base = runId.replace(/-s\d+$/u, "");
  const normalized = sanitizeWorktreePathComponent(base || runId, 16);
  return normalized.length > 12 ? normalized.slice(0, 12) : normalized;
}
function nonNegativeNamingIndex(value, label, fallback) {
  const resolved2 = value ?? fallback;
  if (!Number.isSafeInteger(resolved2) || resolved2 < 0) throw new Error(`${label} must be a non-negative integer`);
  return resolved2;
}
function buildWorktreeNaming(input) {
  if (!input.runId.trim()) throw new Error("worktree run id cannot be empty");
  const index = nonNegativeNamingIndex(input.index, "worktree index", 0);
  const stepIndex = nonNegativeNamingIndex(input.stepIndex, "worktree step index", Number(input.runId.match(/-s(\d+)$/u)?.[1] ?? 0));
  const taskIndex = nonNegativeNamingIndex(input.taskIndex, "worktree task index", index);
  const label = input.laneKey?.trim() || input.workflowKey?.trim() || input.outputName?.trim() || input.taskKey?.trim() || input.label?.trim() || (input.agent?.trim() && input.task?.trim() ? `${input.agent.trim()}-${input.task.trim()}` : void 0) || input.agent?.trim() || "task";
  const branchPrefix = normalizeWorktreeBranchPrefix(input.branchPrefix);
  const labelComponent = sanitizeWorktreePathComponent(label);
  const pathComponentBase = `${labelComponent}-${runShortId(input.runId)}-s${stepIndex}-t${taskIndex}`;
  const sanitizedPathComponent = validGitRef2(`${branchPrefix}${pathComponentBase}`) ? pathComponentBase : sanitizeWorktreePathComponent(pathComponentBase, WORKTREE_NAMING_COMPONENT_MAX_BYTES);
  let requestedBranch = `${branchPrefix}${sanitizedPathComponent}`;
  if (!validGitRef2(requestedBranch) || Buffer.byteLength(requestedBranch, "utf-8") > WORKTREE_NAMING_BRANCH_MAX_BYTES) {
    const suffix = `-${shortWorktreeHash(pathComponentBase)}`;
    const available = Math.max(1, WORKTREE_NAMING_BRANCH_MAX_BYTES - Buffer.byteLength(branchPrefix, "utf-8") - Buffer.byteLength(suffix, "utf-8"));
    requestedBranch = `${branchPrefix}${truncateUtf8(pathComponentBase, available).replace(/[._-]+$/g, "")}${suffix}`;
  }
  if (!validGitRef2(requestedBranch) || Buffer.byteLength(requestedBranch, "utf-8") > WORKTREE_NAMING_BRANCH_MAX_BYTES) throw new Error(`generated worktree branch is not a valid Git ref: ${requestedBranch}`);
  const metadataLabel = truncateUtf8(label.replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim() || "task", WORKTREE_NAMING_LABEL_MAX_BYTES);
  return {
    requestedBranch,
    branchPrefix,
    label: metadataLabel,
    sanitizedPathComponent: requestedBranch.slice(branchPrefix.length)
  };
}
function hasConfiguredWorktreeBaseDir(baseDir) {
  return baseDir !== void 0 ? true : (process.env.PI_SUBAGENTS_WORKTREE_DIR?.trim().length ?? 0) > 0;
}
function isInsidePiExtensionsDirectory(targetPath) {
  const extensionsDir = normalizeComparableCwd(path16.join(getAgentDir(), "extensions"));
  return isPathInside(extensionsDir, normalizeComparableCwd(targetPath));
}
function runWorktrunk(args, cwd) {
  try {
    const result = spawnSync(WORKTRUNK_COMMAND, [...WORKTRUNK_ARG_PREFIX, ...args], {
      cwd,
      encoding: "utf-8",
      windowsHide: true,
      shell: false,
      maxBuffer: WORKTREE_COMMAND_OUTPUT_MAX_BYTES
    });
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    if (Buffer.byteLength(stdout, "utf-8") > WORKTREE_COMMAND_OUTPUT_MAX_BYTES) throw new Error("Worktrunk stdout exceeds the output limit");
    return { stdout, stderr, status: result.status, ...result.error ? { error: result.error } : {} };
  } catch (error) {
    return { stdout: "", stderr: "", status: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
function probeWorktrunk() {
  const result = runWorktrunk(["--version"]);
  if (result.status !== 0) return { available: false, reason: result.error?.message || result.stderr.trim() || "Worktrunk is unavailable" };
  const version = result.stdout.trim().match(/\b(?:wt\s+)?v?(\d+\.\d+(?:\.\d+)?)\b/i)?.[1];
  if (!version) return { available: false, reason: "Worktrunk returned an invalid version" };
  const help = runWorktrunk(["switch", "--help"]);
  if (help.status !== 0) return { available: false, reason: help.error?.message || help.stderr.trim() || "Worktrunk switch capability is unavailable" };
  const helpText = `${help.stdout}
${help.stderr}`;
  const requiredCapabilities = ["--create", "--base", "--no-cd", "--no-hooks", "--format"];
  const missing = requiredCapabilities.filter((flag) => !helpText.includes(flag));
  if (missing.length > 0) return { available: false, reason: `Worktrunk switch is missing required capabilities: ${missing.join(", ")}` };
  return { available: true };
}
function resolveWorktreeProvider(requested, baseDir) {
  const selection = requested ?? DEFAULT_WORKTREE_PROVIDER;
  if (selection !== "auto" && selection !== "native" && selection !== "worktrunk") throw new Error(`worktree provider must be "auto", "native", or "worktrunk"`);
  if (selection === "native") return "native";
  if (hasConfiguredWorktreeBaseDir(baseDir)) {
    if (selection === "worktrunk") throw new Error("worktreeProvider='worktrunk' cannot be combined with worktreeBaseDir or PI_SUBAGENTS_WORKTREE_DIR");
    return "native";
  }
  const capability = probeWorktrunk();
  if (capability.available) return "worktrunk";
  if (selection === "worktrunk") throw new Error(`Worktrunk provider is unavailable: ${capability.reason ?? "unknown capability failure"}`);
  return "native";
}
async function resolveSetupProvider(tx, requested, baseDir, repoRoot) {
  const selection = requested ?? DEFAULT_WORKTREE_PROVIDER;
  if (selection !== "auto" && selection !== "native" && selection !== "worktrunk") throw new Error('worktree provider must be "auto", "native", or "worktrunk"');
  if (selection === "native") return "native";
  if (hasConfiguredWorktreeBaseDir(baseDir)) {
    if (selection === "worktrunk") throw new Error("worktreeProvider='worktrunk' cannot be combined with worktreeBaseDir or PI_SUBAGENTS_WORKTREE_DIR");
    return "native";
  }
  if (selection === "auto" && isInsidePiExtensionsDirectory(repoRoot)) return "native";
  let reason;
  try {
    const probeExitCodes = Array.from({ length: 256 }, (_, code) => code);
    const version = await tx.command(WORKTRUNK_COMMAND, [...WORKTRUNK_ARG_PREFIX, "--version"], { maxBuffer: WORKTREE_COMMAND_OUTPUT_MAX_BYTES, acceptedExitCodes: probeExitCodes });
    if (version.status !== 0 || !/\b(?:wt\s+)?v?(\d+\.\d+(?:\.\d+)?)\b/i.test(version.stdout.trim())) reason = "Worktrunk is unavailable or returned an invalid version";
    else {
      const help = await tx.command(WORKTRUNK_COMMAND, [...WORKTRUNK_ARG_PREFIX, "switch", "--help"], { maxBuffer: WORKTREE_COMMAND_OUTPUT_MAX_BYTES, acceptedExitCodes: probeExitCodes });
      const missing = ["--create", "--base", "--no-cd", "--no-hooks", "--format"].filter((flag) => !`${help.stdout}
${help.stderr}`.includes(flag));
      if (help.status !== 0 || missing.length) reason = `Worktrunk switch capability unavailable: ${missing.join(", ")}`;
    }
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    reason = error.message;
  }
  if (!reason) return "worktrunk";
  if (selection === "worktrunk") throw new Error(`Worktrunk provider is unavailable: ${reason}`);
  return "native";
}
function shouldDeferWorktreeCwd(requested, baseDir) {
  return (requested ?? DEFAULT_WORKTREE_PROVIDER) !== "native" && !hasConfiguredWorktreeBaseDir(baseDir);
}
function resolveWorktreeDedicatedRoot(configuredBaseDir, repoRoot, relocateExtensionRepo = true) {
  const rawBaseDir = configuredBaseDir ?? process.env.PI_SUBAGENTS_WORKTREE_DIR;
  let expanded;
  if (rawBaseDir === void 0 || configuredBaseDir === void 0 && !rawBaseDir.trim()) {
    expanded = relocateExtensionRepo && isInsidePiExtensionsDirectory(repoRoot) ? path16.join(getAgentDir(), "worktrees") : path16.join(path16.dirname(repoRoot), "worktrees");
  } else {
    const trimmed = rawBaseDir.trim();
    if (!trimmed) throw new Error("worktree base directory cannot be empty");
    const candidate = trimmed.startsWith("~/") ? path16.join(os2.homedir(), trimmed.slice(2)) : trimmed;
    expanded = path16.isAbsolute(candidate) ? candidate : path16.resolve(repoRoot, candidate);
  }
  const extensionsDir = normalizeComparableCwd(path16.join(getAgentDir(), "extensions"));
  if (isPathInside(extensionsDir, normalizeComparableCwd(expanded))) {
    throw new Error(`worktree base directory cannot be inside Pi extensions directory: ${extensionsDir}. Choose a directory outside it.`);
  }
  return expanded;
}
function buildNativeProjectPath(dedicatedRoot, repoRoot) {
  return path16.join(dedicatedRoot, path16.basename(repoRoot));
}
function ensureProjectWorktreeDir(dedicatedRoot, repoRoot) {
  try {
    fs17.mkdirSync(buildNativeProjectPath(dedicatedRoot, repoRoot), { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to create worktree base directory ${dedicatedRoot}: ${message}`);
  }
}
function buildNativeWorktreePath(dedicatedRoot, repoRoot, runId, index) {
  return path16.join(buildNativeProjectPath(dedicatedRoot, repoRoot), `pi-worktree-${sanitizeWorktreePathComponent(runId, 120)}-${index}`);
}
function isPathInside(parent, child) {
  const relative4 = path16.relative(parent, child);
  if (!relative4 || relative4 === ".") return true;
  return relative4 !== ".." && !relative4.startsWith(`..${path16.sep}`) && !path16.isAbsolute(relative4);
}
function isStrictChildPath(parent, child) {
  const relative4 = path16.relative(parent, child);
  return Boolean(relative4) && relative4 !== "." && relative4 !== ".." && !relative4.startsWith(`..${path16.sep}`) && !path16.isAbsolute(relative4);
}
function assertSafeWorktreeLocation(worktreePath, repoRoot, dedicatedRoot) {
  const resolvedLeaf = normalizeComparableCwd(worktreePath);
  const resolvedRepoRoot = normalizeComparableCwd(repoRoot);
  const projectDir = normalizeComparableCwd(buildNativeProjectPath(dedicatedRoot, repoRoot));
  const repoParent = normalizeComparableCwd(path16.dirname(resolvedRepoRoot));
  const leafParent = normalizeComparableCwd(path16.dirname(resolvedLeaf));
  const extensionsDir = normalizeComparableCwd(path16.join(getAgentDir(), "extensions"));
  if (isPathInside(extensionsDir, projectDir) || isPathInside(extensionsDir, resolvedLeaf)) {
    throw new Error(`worktree path cannot be inside Pi extensions directory: ${extensionsDir}. Choose a directory outside it.`);
  }
  if (isPathInside(resolvedRepoRoot, resolvedLeaf)) {
    throw new Error(`worktree path would land inside the repository checkout: ${resolvedLeaf}`);
  }
  if (leafParent === repoParent) {
    throw new Error(`worktree path would be a direct child of the repository parent: ${resolvedLeaf}`);
  }
  if (!isStrictChildPath(projectDir, resolvedLeaf)) {
    throw new Error(`worktree path must be a strict child of the project worktree directory ${projectDir}: ${resolvedLeaf}`);
  }
}
function resolveRepoCwdRelative(cwd) {
  const repoCheck = runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (repoCheck.status !== 0 || repoCheck.stdout.trim() !== "true") {
    throw new Error("worktree isolation requires a git repository");
  }
  const rawPrefix = runGitChecked(cwd, ["rev-parse", "--show-prefix"]).trim();
  const normalizedPrefix = rawPrefix ? path16.normalize(rawPrefix.replace(/[\\/]+$/, "")) : "";
  return normalizedPrefix === "." ? "" : normalizedPrefix;
}
function resolveExpectedWorktreeAgentCwd(cwd, runId, index, baseDir) {
  const cwdRelative = resolveRepoCwdRelative(cwd);
  const repoRoot = runGitChecked(cwd, ["rev-parse", "--show-toplevel"]).trim();
  const dedicatedRoot = resolveWorktreeDedicatedRoot(baseDir, repoRoot);
  const worktreePath = buildNativeWorktreePath(dedicatedRoot, repoRoot, runId, index);
  assertSafeWorktreeLocation(worktreePath, repoRoot, dedicatedRoot);
  return cwdRelative ? path16.join(worktreePath, cwdRelative) : worktreePath;
}
function linkNodeModulesIfPresent(toplevel, worktreePath) {
  const nodeModulesPath = path16.join(toplevel, "node_modules");
  const nodeModulesLinkPath = path16.join(worktreePath, "node_modules");
  const hasDirectoryEntry = (candidate) => {
    try {
      fs17.lstatSync(candidate);
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
      throw error;
    }
  };
  try {
    if (hasDirectoryEntry(nodeModulesLinkPath)) return false;
    let sourceRealPath;
    try {
      if (!fs17.statSync(nodeModulesPath).isDirectory()) throw new Error("source node_modules is not a directory");
      sourceRealPath = fs17.realpathSync.native(nodeModulesPath);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
      throw error;
    }
    fs17.symlinkSync(nodeModulesPath, nodeModulesLinkPath, process.platform === "win32" ? "junction" : "dir");
    if (!fs17.lstatSync(nodeModulesLinkPath).isSymbolicLink() || fs17.realpathSync.native(nodeModulesLinkPath) !== sourceRealPath) {
      throw new Error("created link does not resolve to the source node_modules");
    }
    return true;
  } catch (error) {
    const code = error instanceof Error && "code" in error && typeof error.code === "string" ? `${error.code}: ` : "";
    throw new Error(
      `failed to link node_modules from ${nodeModulesPath} to ${nodeModulesLinkPath}: ${code}${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}
function parseHookTimeout(timeoutMs) {
  if (timeoutMs === void 0) return DEFAULT_WORKTREE_SETUP_HOOK_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("worktree setup hook timeout must be an integer greater than 0");
  }
  return timeoutMs;
}
function resolveWorktreeSetupHook(repoRoot, config) {
  if (!config) return void 0;
  const hookPath = config.hookPath.trim();
  if (!hookPath) {
    throw new Error("worktree setup hook path cannot be empty");
  }
  const expandedHookPath = hookPath.startsWith("~/") ? path16.join(os2.homedir(), hookPath.slice(2)) : hookPath;
  let resolvedPath;
  if (path16.isAbsolute(expandedHookPath)) {
    resolvedPath = expandedHookPath;
  } else if (expandedHookPath.includes("/") || expandedHookPath.includes("\\")) {
    resolvedPath = path16.resolve(repoRoot, expandedHookPath);
  } else {
    throw new Error("worktree setup hook must be an absolute path or a repo-relative path");
  }
  if (!fs17.existsSync(resolvedPath)) {
    throw new Error(`worktree setup hook not found: ${resolvedPath}`);
  }
  if (fs17.statSync(resolvedPath).isDirectory()) {
    throw new Error(`worktree setup hook must be a file, got directory: ${resolvedPath}`);
  }
  return {
    hookPath: resolvedPath,
    timeoutMs: parseHookTimeout(config.timeoutMs)
  };
}
function normalizeSyntheticPath(worktreePath, rawPath) {
  const trimmed = rawPath.trim();
  if (!trimmed) throw new Error("synthetic path cannot be empty");
  if (path16.isAbsolute(trimmed)) throw new Error(`synthetic path must be relative: ${rawPath}`);
  const resolved2 = path16.resolve(worktreePath, trimmed);
  const relative4 = path16.relative(worktreePath, resolved2);
  if (!relative4 || relative4 === ".") {
    throw new Error(`synthetic path cannot target the worktree root: ${rawPath}`);
  }
  if (relative4 === ".." || relative4.startsWith(`..${path16.sep}`) || path16.isAbsolute(relative4)) {
    throw new Error(`synthetic path escapes the worktree root: ${rawPath}`);
  }
  return path16.normalize(relative4);
}
function parseWorktreeSetupHookOutput(rawStdout) {
  const trimmed = rawStdout.trim();
  if (!trimmed) {
    throw new Error("worktree setup hook returned empty stdout; expected JSON object");
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`worktree setup hook returned invalid JSON: ${message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("worktree setup hook stdout must be a JSON object");
  }
  return parsed;
}
async function runWorktreeSetupHook(tx, hook, input) {
  tx.progress.phase = "hook";
  let result;
  try {
    result = await tx.command(hook.hookPath, [], {
      cwd: input.worktreePath,
      input: JSON.stringify(input),
      hookTimeoutMs: hook.timeoutMs
    });
  } catch (error) {
    throw new Error(`worktree setup hook failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  tx.progress.phase = "hook-validation";
  try {
    const output = parseWorktreeSetupHookOutput(result.stdout);
    if (output.syntheticPaths === void 0) return [];
    if (!Array.isArray(output.syntheticPaths)) {
      throw new Error("worktree setup hook output field 'syntheticPaths' must be an array of relative paths");
    }
    const uniquePaths = /* @__PURE__ */ new Set();
    for (const candidate of output.syntheticPaths) {
      if (typeof candidate !== "string") throw new Error("worktree setup hook output field 'syntheticPaths' must contain only strings");
      const normalizedPath = normalizeSyntheticPath(input.worktreePath, candidate);
      if ((await tx.gitChecked(input.worktreePath, ["ls-files", "--", normalizedPath])).trim()) {
        throw new Error(`worktree setup hook cannot mark tracked paths as synthetic: ${normalizedPath}`);
      }
      uniquePaths.add(normalizedPath);
    }
    return [...uniquePaths];
  } catch (error) {
    tx.unknown(error);
    throw error;
  }
}
async function finalizeCreatedWorktree(tx, toplevel, cwdRelative, runId, baseCommit, setupHook, agent, worktree) {
  const agentCwd = cwdRelative ? path16.join(worktree.path, cwdRelative) : worktree.path;
  tx.check();
  const nodeModulesLinked = linkNodeModulesIfPresent(toplevel, worktree.path);
  const syntheticPaths = nodeModulesLinked ? ["node_modules"] : [];
  if (setupHook) {
    const hookSyntheticPaths = await runWorktreeSetupHook(tx, setupHook, {
      version: 1,
      repoRoot: toplevel,
      worktreePath: worktree.path,
      agentCwd,
      branch: worktree.branch,
      index: worktree.index,
      runId,
      baseCommit,
      agent
    });
    syntheticPaths.push(...hookSyntheticPaths);
  }
  return { ...worktree, agentCwd, nodeModulesLinked, syntheticPaths };
}
async function createNativeWorktree(tx, toplevel, cwdRelative, runId, index, baseCommit, setupHook, agent, dedicatedRoot, labels, tasks, branchPrefix) {
  const naming = buildWorktreeNaming({ runId, index, agent, label: labels?.[index], task: tasks?.[index], branchPrefix });
  const worktreePath = buildNativeWorktreePath(dedicatedRoot, toplevel, runId, index);
  assertSafeWorktreeLocation(worktreePath, toplevel, dedicatedRoot);
  const branch = await tx.git(toplevel, ["show-ref", "--verify", "--quiet", `refs/heads/${naming.requestedBranch}`], [0, 1]);
  let pathExists = false;
  try {
    fs17.lstatSync(worktreePath);
    pathExists = true;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  if (branch.status !== 1 || pathExists) throw new Error(`worktree path or branch already exists: ${worktreePath}, ${naming.requestedBranch}`);
  tx.attempt(index, naming.requestedBranch, worktreePath);
  ensureProjectWorktreeDir(dedicatedRoot, toplevel);
  const recordedBaseDir = normalizeComparableCwd(path16.dirname(worktreePath));
  await tx.git(toplevel, ["worktree", "add", worktreePath, "-b", naming.requestedBranch, baseCommit]);
  const worktree = {
    path: worktreePath,
    recordedBaseDir,
    agentCwd: worktreePath,
    branch: naming.requestedBranch,
    index,
    nodeModulesLinked: false,
    syntheticPaths: [],
    provider: "native",
    naming
  };
  tx.validated(worktree);
  return finalizeCreatedWorktree(tx, toplevel, cwdRelative, runId, baseCommit, setupHook, agent, worktree);
}
function parseWorktrunkSwitchOutput(rawStdout) {
  if (Buffer.byteLength(rawStdout, "utf-8") > WORKTREE_COMMAND_OUTPUT_MAX_BYTES) throw new Error("Worktrunk provisioning output exceeds the output limit");
  const trimmed = rawStdout.trim();
  if (!trimmed) throw new Error("Worktrunk provisioning returned empty stdout; expected JSON object");
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Worktrunk provisioning returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Worktrunk provisioning stdout must be a JSON object");
  return parsed;
}
async function createWorktrunkWorktree(tx, toplevel, cwdRelative, runId, index, baseCommit, agents, labels, tasks, branchPrefix) {
  const naming = buildWorktreeNaming({ runId, index, agent: agents?.[index], label: labels?.[index], task: tasks?.[index], branchPrefix });
  const args = ["-C", toplevel, "switch", "--create", naming.requestedBranch, "--base", baseCommit, "--no-cd", "--no-hooks", "--format", "json"];
  tx.attempt(index, naming.requestedBranch);
  const result = await tx.command(WORKTRUNK_COMMAND, [...WORKTRUNK_ARG_PREFIX, ...args], { cwd: toplevel, maxBuffer: WORKTREE_COMMAND_OUTPUT_MAX_BYTES });
  tx.progress.phase = "validation";
  try {
    const output = parseWorktrunkSwitchOutput(result.stdout);
    if (output.action !== "created" || output.created_branch !== true || output.branch !== naming.requestedBranch || output.base_branch !== baseCommit) {
      throw new Error("Worktrunk provisioning returned inconsistent creation metadata");
    }
    if (typeof output.path !== "string" || !path16.isAbsolute(output.path)) throw new Error("Worktrunk provisioning returned a non-absolute worktree path");
    const worktreePathCandidate = path16.resolve(output.path);
    let stat;
    try {
      stat = fs17.lstatSync(worktreePathCandidate);
    } catch (error) {
      throw new Error(`Worktrunk provisioning returned a missing worktree path: ${worktreePathCandidate}`, { cause: error instanceof Error ? error : void 0 });
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Worktrunk provisioning returned a path that is not a real directory");
    const worktreePath = normalizeComparableCwd(worktreePathCandidate);
    if (worktreePath === normalizeComparableCwd(toplevel)) throw new Error("Worktrunk provisioning returned the source checkout path");
    const sourceCommonDirRaw = (await tx.gitChecked(toplevel, ["rev-parse", "--git-common-dir"])).trim();
    const returnedCommonDirRaw = (await tx.gitChecked(worktreePath, ["rev-parse", "--git-common-dir"])).trim();
    const sourceCommonDir = normalizeComparableCwd(path16.isAbsolute(sourceCommonDirRaw) ? sourceCommonDirRaw : path16.resolve(toplevel, sourceCommonDirRaw));
    const returnedCommonDir = normalizeComparableCwd(path16.isAbsolute(returnedCommonDirRaw) ? returnedCommonDirRaw : path16.resolve(worktreePath, returnedCommonDirRaw));
    if (returnedCommonDir !== sourceCommonDir) throw new Error("Worktrunk provisioning returned a worktree for a different repository");
    const returnedBranch = (await tx.gitChecked(worktreePath, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
    if (returnedBranch !== naming.requestedBranch) throw new Error("Worktrunk provisioning returned a worktree on a different branch");
    const returnedHead = (await tx.gitChecked(worktreePath, ["rev-parse", "HEAD"])).trim();
    if (returnedHead !== baseCommit) throw new Error("Worktrunk provisioning returned a worktree at a different base commit");
    const worktree = {
      path: worktreePath,
      recordedBaseDir: normalizeComparableCwd(path16.dirname(worktreePath)),
      agentCwd: cwdRelative ? path16.join(worktreePath, cwdRelative) : worktreePath,
      branch: naming.requestedBranch,
      index,
      nodeModulesLinked: false,
      syntheticPaths: [],
      provider: "worktrunk",
      naming
    };
    tx.validated(worktree);
    return worktree;
  } catch (error) {
    tx.unknown(error);
    throw error;
  }
}
function removeSyntheticPath(worktree, syntheticPath) {
  assertWorktreeMutationAllowed();
  const resolved2 = path16.resolve(worktree.path, syntheticPath);
  const relative4 = path16.relative(worktree.path, resolved2);
  if (!relative4 || relative4 === "." || relative4 === ".." || relative4.startsWith(`..${path16.sep}`) || path16.isAbsolute(relative4)) {
    return;
  }
  let stat;
  try {
    stat = fs17.lstatSync(resolved2);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : void 0;
    if (code === "ENOENT") return;
    throw error;
  }
  if (stat.isSymbolicLink()) {
    fs17.unlinkSync(resolved2);
    return;
  }
  if (stat.isDirectory()) {
    fs17.rmSync(resolved2, { recursive: true, force: true });
    return;
  }
  fs17.rmSync(resolved2, { force: true });
}
function removeSyntheticPathsBeforeDiff(worktree) {
  if (worktree.syntheticPaths.length === 0) return;
  const seen = /* @__PURE__ */ new Set();
  for (const syntheticPath of worktree.syntheticPaths) {
    if (seen.has(syntheticPath)) continue;
    seen.add(syntheticPath);
    removeSyntheticPath(worktree, syntheticPath);
  }
}
function emptyDiff(index, agent, branch, patchPath, error) {
  return {
    index,
    agent,
    branch,
    diffStat: "",
    filesChanged: 0,
    insertions: 0,
    deletions: 0,
    patchPath,
    ...error ? { error } : {}
  };
}
function parseNumstat(numstat) {
  const lines = numstat.split("\n").map((line) => line.trim()).filter(Boolean);
  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;
  for (const line of lines) {
    const [rawInsertions, rawDeletions] = line.split("	");
    if (rawInsertions === void 0 || rawDeletions === void 0) continue;
    filesChanged++;
    if (/^\d+$/.test(rawInsertions)) insertions += parseInt(rawInsertions, 10);
    if (/^\d+$/.test(rawDeletions)) deletions += parseInt(rawDeletions, 10);
  }
  return { filesChanged, insertions, deletions };
}
function captureWorktreeDiff(setup, worktree, agent, patchPath) {
  removeSyntheticPathsBeforeDiff(worktree);
  runGitChecked(worktree.path, ["add", "-A"]);
  const diffStat = runGitChecked(worktree.path, ["diff", "--cached", ...MACHINE_DIFF_OPTIONS, "--stat", setup.baseCommit]).trim();
  const patch = runGitChecked(worktree.path, ["diff", "--cached", ...MACHINE_PATCH_OPTIONS, setup.baseCommit]);
  const numstat = runGitChecked(worktree.path, ["diff", "--cached", ...MACHINE_DIFF_OPTIONS, "--numstat", setup.baseCommit]);
  fs17.writeFileSync(patchPath, patch, "utf-8");
  if (!patch.trim()) {
    return emptyDiff(worktree.index, agent, worktree.branch, patchPath);
  }
  const validationError = validateWorktreePatch(worktree.path, patchPath);
  if (validationError) throw new Error(`captured worktree patch is not machine-applyable: ${validationError}`);
  const parsed = parseNumstat(numstat);
  return {
    index: worktree.index,
    agent,
    branch: worktree.branch,
    diffStat,
    filesChanged: parsed.filesChanged,
    insertions: parsed.insertions,
    deletions: parsed.deletions,
    patchPath
  };
}
function writeEmptyPatch(patchPath) {
  try {
    fs17.writeFileSync(patchPath, "", "utf-8");
  } catch {
  }
}
function handoffRecordsPatch(manifestPath, patchPath) {
  if (!manifestPath || !fs17.existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(fs17.readFileSync(manifestPath, "utf-8"));
    if (manifest.version !== 1 || !Array.isArray(manifest.groups)) return false;
    const resolvedPatchPath = path16.resolve(patchPath);
    return manifest.groups.some((group) => Array.isArray(group.children) && group.children.some(
      (child) => child.patch?.error === void 0 && typeof child.patch?.path === "string" && path16.resolve(child.patch.path) === resolvedPatchPath
    ));
  } catch {
    return false;
  }
}
function cleanupSingleWorktree(setup, worktree, intent) {
  const errors = [];
  let worktreeRemoved = false;
  let branchRemoved = false;
  if (intent.kind === "preserve" && intent.cleanupBlocker) {
    return {
      index: worktree.index,
      path: worktree.path,
      branch: worktree.branch,
      ...worktree.provider ? { provider: worktree.provider } : {},
      ...worktree.naming ? { naming: worktree.naming } : {},
      ...worktree.recordedBaseDir ? { recordedBaseDir: worktree.recordedBaseDir } : {},
      worktreeRemoved: false,
      branchRemoved: false,
      preserved: true,
      reason: intent.cleanupBlocker
    };
  }
  if (intent.kind !== "setup-rollback") {
    try {
      removeSyntheticPathsBeforeDiff(worktree);
    } catch (error) {
      errors.push(`synthetic path cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const status = runGit(worktree.path, ["status", "--porcelain"]);
    const baseDiff = runGit(worktree.path, ["diff", "--quiet", ...MACHINE_DIFF_OPTIONS, setup.baseCommit, "--"]);
    if (status.status !== 0 || baseDiff.status !== 0 && baseDiff.status !== 1) {
      const reason = status.status !== 0 ? status.stderr.trim() || status.stdout.trim() || "git status failed" : baseDiff.stderr.trim() || baseDiff.stdout.trim() || "git diff check failed";
      return {
        index: worktree.index,
        path: worktree.path,
        branch: worktree.branch,
        ...worktree.provider ? { provider: worktree.provider } : {},
        ...worktree.naming ? { naming: worktree.naming } : {},
        ...worktree.recordedBaseDir ? { recordedBaseDir: worktree.recordedBaseDir } : {},
        worktreeRemoved: false,
        branchRemoved: false,
        preserved: true,
        reason: "cleanup safety check failed",
        errors: [...errors, `cleanup refused: ${reason}`]
      };
    }
    const hasWork = status.stdout.trim().length > 0 || baseDiff.status === 1;
    if (hasWork && intent.kind === "preserve") {
      const captured = (intent.capturedDiffs ?? setup.capturedDiffs)?.find((diff) => diff.index === worktree.index);
      let patchValidationError;
      let patchCaptured = false;
      if (captured !== void 0 && captured.error === void 0 && fs17.existsSync(captured.patchPath) && handoffRecordsPatch(intent.handoffManifestPath, captured.patchPath)) {
        try {
          if (fs17.statSync(captured.patchPath).size > 0) {
            patchValidationError = validateWorktreePatchRepresentsCurrentWorktree(worktree.path, setup.baseCommit, captured.patchPath);
            patchCaptured = patchValidationError === void 0;
          }
        } catch (error) {
          patchValidationError = error instanceof Error ? error.message : String(error);
        }
      }
      if (!patchCaptured) {
        const reason = patchValidationError ? `captured handoff patch failed validation: ${patchValidationError}` : "worktree contains changes that are not represented by a captured handoff patch";
        return {
          index: worktree.index,
          path: worktree.path,
          branch: worktree.branch,
          ...worktree.provider ? { provider: worktree.provider } : {},
          ...worktree.naming ? { naming: worktree.naming } : {},
          ...worktree.recordedBaseDir ? { recordedBaseDir: worktree.recordedBaseDir } : {},
          worktreeRemoved: false,
          branchRemoved: false,
          preserved: true,
          reason,
          errors: [...errors, `cleanup refused: ${reason}; preserved ${worktree.path}`]
        };
      }
    }
    if (hasWork && intent.kind === "discard") {
      const decision = resolveAuthorityDecision({ action: "discardWorktree", policy: intent.authorization.policy });
      const authorized = decision === "auto" || decision === "confirm" && intent.authorization.kind === "confirmed";
      if (!authorized) {
        const reason = decision === "forbid" ? "authority policy forbids worktree discard" : "worktree discard requires explicit user confirmation";
        return {
          index: worktree.index,
          path: worktree.path,
          branch: worktree.branch,
          ...worktree.provider ? { provider: worktree.provider } : {},
          ...worktree.naming ? { naming: worktree.naming } : {},
          ...worktree.recordedBaseDir ? { recordedBaseDir: worktree.recordedBaseDir } : {},
          worktreeRemoved: false,
          branchRemoved: false,
          preserved: true,
          reason,
          errors: [...errors, `cleanup refused: ${reason}; preserved ${worktree.path}`]
        };
      }
    }
  }
  try {
    runGitChecked(setup.cwd, ["worktree", "remove", "--force", worktree.path]);
    worktreeRemoved = true;
  } catch (error) {
    errors.push(`worktree removal failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (worktreeRemoved) {
    try {
      runGitChecked(setup.cwd, ["branch", "-D", worktree.branch]);
      branchRemoved = true;
    } catch (error) {
      errors.push(`branch removal failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    index: worktree.index,
    path: worktree.path,
    branch: worktree.branch,
    ...worktree.provider ? { provider: worktree.provider } : {},
    ...worktree.naming ? { naming: worktree.naming } : {},
    ...worktree.recordedBaseDir ? { recordedBaseDir: worktree.recordedBaseDir } : {},
    worktreeRemoved,
    branchRemoved,
    ...errors.length ? { errors } : {}
  };
}
function hasWorktreeChanges(diff) {
  return diff.filesChanged > 0 || diff.insertions > 0 || diff.deletions > 0 || diff.diffStat.trim().length > 0;
}
async function compensateSetup(tx) {
  const { setup, attempts } = tx.progress;
  const report = { state: "partial", tasks: [], pruned: false, errors: [] };
  tx.progress.cleanup = report;
  tx.progress.phase = "rollback";
  const git = async (args, acceptedExitCodes = [0]) => {
    if (setupPoison) throw new Error(setupPoison);
    tx.progress.command = { command: "git", args: ["-C", setup.cwd, ...args] };
    const result = await runSetupCommand("git", tx.progress.command.args, {
      deadlineAt: tx.options.deadlineAt,
      acceptedExitCodes,
      onSpawn: (process2) => {
        Object.assign(tx.progress.command, process2);
        tx.publish();
      }
    });
    const { stdout: _stdout, stdoutBuffer: _stdoutBuffer, stderr: _stderr, ...metadata } = result;
    tx.progress.command.result = metadata;
    if (result.processTree?.state === "unknown") tx.unknown(result.error ?? "Rollback command settlement unverified");
    tx.publish();
    if (result.error || result.status === null || !acceptedExitCodes.includes(result.status)) throw result.error ?? new Error(result.stderr.trim() || "Rollback command failed");
    return result;
  };
  for (const attempt of [...attempts].reverse()) {
    if (!attempt.path) {
      tx.unknown(`Allocation path unconfirmed for branch ${attempt.branch}`);
      report.errors.push(tx.progress.unknown);
      continue;
    }
    const known = setup.worktrees.find((worktree) => worktree.index === attempt.index);
    const task = {
      index: attempt.index,
      path: attempt.path,
      branch: attempt.branch,
      provider: known?.provider ?? "native",
      naming: known?.naming,
      recordedBaseDir: known?.recordedBaseDir,
      worktreeRemoved: false,
      branchRemoved: false
    };
    report.tasks.push(task);
    try {
      if (normalizeComparableCwd(attempt.path) === normalizeComparableCwd(setup.cwd)) throw new Error("Refusing source-checkout removal");
      if (attempt.validated) {
        await git(["worktree", "remove", "--force", attempt.path]);
        task.worktreeRemoved = true;
      } else {
        const listed = (await git(["worktree", "list", "--porcelain"])).stdout;
        const entry = listed.split("\n\n").find((block) => block.split("\n").includes(`worktree ${attempt.path}`));
        if (entry) {
          if (!entry.split("\n").includes(`branch refs/heads/${attempt.branch}`)) {
            tx.unknown("Partial allocation ownership mismatch");
            throw new Error(tx.progress.unknown);
          }
          await git(["worktree", "remove", "--force", attempt.path]);
        } else if (fs17.existsSync(attempt.path)) {
          tx.unknown("Unregistered partial allocation retained");
          throw new Error(tx.progress.unknown);
        }
        task.worktreeRemoved = true;
      }
      const branch = await git(["show-ref", "--verify", "--quiet", `refs/heads/${attempt.branch}`], [0, 1]);
      if (branch.status === 0) await git(["branch", "-D", attempt.branch]);
      task.branchRemoved = true;
    } catch (error) {
      task.preserved = true;
      task.errors = [error instanceof Error ? error.message : String(error)];
    }
  }
  try {
    if (attempts.length > 0) {
      await git(["worktree", "prune"]);
      report.pruned = true;
    }
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
  }
  if (tx.progress.unknown) report.errors.push(tx.progress.unknown);
  report.tasks.sort((a, b) => a.index - b.index);
  if (!setupPoison && (report.pruned || attempts.length === 0) && report.tasks.every((task) => task.worktreeRemoved && task.branchRemoved) && !report.errors.length) report.state = "complete";
  return report;
}
async function allocateWorktrees(tx, cwd, runId, count) {
  const options = tx.options;
  tx.check();
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("worktree count must be a non-negative integer");
  const repo = await resolveRepoState(tx, cwd, options?.baseRef);
  tx.progress.setup.cwd = repo.toplevel;
  tx.progress.setup.baseCommit = repo.baseCommit;
  const setupHook = resolveWorktreeSetupHook(repo.toplevel, options?.setupHook);
  const provider = await resolveSetupProvider(tx, options?.provider, options?.baseDir, repo.toplevel);
  const branchPrefix = normalizeWorktreeBranchPrefix(options?.branchPrefix);
  const dedicatedRoot = provider === "native" ? resolveWorktreeDedicatedRoot(options?.baseDir, repo.toplevel, (options?.provider ?? DEFAULT_WORKTREE_PROVIDER) === "auto") : void 0;
  const worktrees = tx.progress.setup.worktrees;
  try {
    if (provider === "native") {
      for (let index = 0; index < count; index++) {
        worktrees[index] = await createNativeWorktree(
          tx,
          repo.toplevel,
          repo.cwdRelative,
          runId,
          index,
          repo.baseCommit,
          setupHook,
          options?.agents?.[index],
          dedicatedRoot,
          options?.labels,
          options?.tasks,
          branchPrefix
        );
      }
    } else {
      for (let index = 0; index < count; index++) {
        await createWorktrunkWorktree(
          tx,
          repo.toplevel,
          repo.cwdRelative,
          runId,
          index,
          repo.baseCommit,
          options?.agents,
          options?.labels,
          options?.tasks,
          branchPrefix
        );
      }
      for (let index = 0; index < worktrees.length; index++) {
        worktrees[index] = await finalizeCreatedWorktree(
          tx,
          repo.toplevel,
          repo.cwdRelative,
          runId,
          repo.baseCommit,
          setupHook,
          options?.agents?.[index],
          worktrees[index]
        );
      }
    }
    tx.check();
    tx.progress.phase = "ready";
    tx.publish();
    tx.check();
    return tx.progress.setup;
  } catch (error) {
    await compensateSetup(tx);
    throw error;
  }
}
async function createWorktrees(cwd, runId, count, options = {}) {
  const tx = new SetupTransaction(cwd, options);
  try {
    return await withWorktreeTransaction(async () => {
      setupActive = true;
      try {
        return await allocateWorktrees(tx, cwd, runId, count);
      } finally {
        setupActive = false;
      }
    });
  } catch (error) {
    if (setupPoison) tx.progress.unknown ??= setupPoison;
    tx.progress.cleanup ??= { state: tx.progress.unknown ? "partial" : "complete", tasks: [], pruned: false, errors: tx.progress.unknown ? [tx.progress.unknown] : [] };
    try {
      tx.publish();
    } catch (publicationError) {
      tx.progress.cleanup?.errors?.push(`Recovery publication failed: ${String(publicationError)}`);
    }
    throw new WorktreeSetupError(error, tx.snapshot());
  }
}
function diffWorktrees(setup, agents, diffsDir) {
  assertWorktreeMutationAllowed();
  try {
    fs17.mkdirSync(diffsDir, { recursive: true });
  } catch {
    return [];
  }
  const diffs = [];
  for (let index = 0; index < setup.worktrees.length; index++) {
    const worktree = setup.worktrees[index];
    const agent = agents[index] ?? `task-${index + 1}`;
    const patchPath = path16.join(diffsDir, `task-${index}-${safePatchAgentName(agent)}.patch`);
    try {
      diffs.push(captureWorktreeDiff(setup, worktree, agent, patchPath));
    } catch (error) {
      writeEmptyPatch(patchPath);
      diffs.push(emptyDiff(index, agent, worktree.branch, patchPath, error instanceof Error ? error.message : String(error)));
    }
  }
  setup.capturedDiffs = diffs;
  return diffs;
}
function cleanupWorktrees(setup, intent = { kind: "preserve", ...setup.capturedDiffs ? { capturedDiffs: setup.capturedDiffs } : {} }) {
  assertWorktreeMutationAllowed();
  const tasks = [];
  for (let index = setup.worktrees.length - 1; index >= 0; index--) {
    tasks.push(cleanupSingleWorktree(setup, setup.worktrees[index], intent));
  }
  tasks.sort((left, right) => left.index - right.index);
  const errors = [];
  let pruned = false;
  try {
    runGitChecked(setup.cwd, ["worktree", "prune"]);
    pruned = true;
  } catch (error) {
    errors.push(`worktree prune failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const state = tasks.every((task) => task.worktreeRemoved && task.branchRemoved) && pruned ? "complete" : "partial";
  return {
    state,
    tasks,
    pruned,
    ...errors.length ? { errors } : {}
  };
}
function formatWorktreeDiffSummary(diffs) {
  const changed = diffs.filter(hasWorktreeChanges);
  if (changed.length === 0) return "";
  const lines = ["=== Worktree Changes ===", ""];
  for (const diff of changed) {
    lines.push(
      `--- Task ${diff.index + 1} (${diff.agent}): ${diff.filesChanged} files changed, +${diff.insertions} -${diff.deletions} ---`
    );
    if (diff.diffStat.trim().length > 0) {
      lines.push(diff.diffStat);
    }
    lines.push("");
  }
  const patchesDir = path16.dirname(changed[0].patchPath);
  lines.push(`Full patches: ${patchesDir}`);
  return lines.join("\n").trimEnd();
}

// src/shared/model-response-aliases.ts
function validateModelResponseAliases(value, label = "config.modelResponseAliases") {
  if (value === void 0) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object`);
  for (const [candidate, aliases] of Object.entries(value)) {
    const slash = candidate.indexOf("/");
    if (slash <= 0 || !candidate.slice(0, slash).trim() || !candidate.slice(slash + 1).trim()) {
      throw new Error(`${label} key ${JSON.stringify(candidate)} must be a non-empty provider/model ID`);
    }
    if (!Array.isArray(aliases) || aliases.some((alias) => typeof alias !== "string" || !alias.trim())) {
      throw new Error(`${label}[${JSON.stringify(candidate)}] must be an array of non-empty response ID strings`);
    }
  }
}

export {
  hashedSegment,
  encodeIndexSegment,
  TERMINAL_RUN_INDEX_DIR,
  readTerminalRunToolCallIndex,
  readRecentTerminalRunIndex,
  ACTIVE_RUN_INDEX_DIR,
  DEFAULT_STALE_TERMINAL_ACTIVE_MARKER_MS,
  isActiveAsyncState,
  releaseActiveRunIndex,
  updateActiveRunIndex,
  activeRunMarkerAgeMs,
  readActiveRunIndex,
  readActiveRunToolCallIndex,
  processTerminalCandidatePath,
  readProcessTerminalCandidate,
  processTerminalPath,
  initializeProcessTerminal,
  sanitizeProcessTerminal,
  readProcessTerminal,
  finalizeProcessTerminal,
  assertSafeNestedId,
  createNestedRoute,
  resolveInheritedNestedRoute,
  inheritedNestedRouteOf,
  inheritedNestedParentAddressOf,
  nestedRunNotActiveMessage,
  resolveNestedAsyncDir,
  sanitizeSummary,
  findNestedRouteForRootId,
  buildNestedRouteIndex,
  projectNestedRegistryForRoot,
  retainNestedLookupRoute,
  findNestedRunMatchesById,
  projectNestedEvents,
  writeNestedEvent,
  writeNestedControlRequest,
  readNestedControlRequests,
  writeNestedControlResult,
  snapshotNestedEventFiles,
  findNestedControlResult,
  attachRootChildrenToSteps,
  updateAsyncJobNestedProjection,
  updateForegroundNestedProjection,
  hasLiveNestedDescendants,
  nestedSummaryFromAsyncStatus,
  nestedRunScope,
  nestedResultsPath,
  normalizeParallelGroups,
  flatToLogicalStepIndex,
  HOST_STEP_MAX_LABEL_CHARS,
  HOST_STEP_MAX_ROLE_CHARS,
  HOST_STEP_MAX_PROVIDER_CHARS,
  HOST_STEP_MAX_REASON_CHARS,
  HOST_STEP_MAX_DETAIL_CHARS,
  HOST_STEP_MAX_TARGET_CHARS,
  HOST_STEP_MAX_REF_CHARS,
  HOST_STEP_MAX_COUNT,
  parseHostStepNode,
  assertUniqueHostStepIds,
  validHostStepNodes,
  assertWorkflowGraphHostSteps,
  upsertHostStep,
  hostStepVerdictLabel,
  hostStepReportName,
  resolveWorkflowHostOutputClaimPath,
  executeWorkflowHostCommand,
  WorkflowScriptError,
  formatWorkflowJsonPreview,
  previewSimpleWorkflowRun,
  workflowRunParamsFingerprint,
  validateWorkflowScript,
  runWorkflowScript,
  validateMissionId,
  validateMissionStoreConfig,
  resolveMissionStoreLocation,
  missionRecordPath,
  MissionNotFoundError,
  readMission,
  listMissions,
  updateMission,
  missionStatePath,
  createMissionWorkflowState,
  MISSION_ACTIONS,
  handleMissionAction,
  prepareMissionLaunch,
  writeMissionAsyncBinding,
  attachMissionToLaunchResult,
  readMissionBinding,
  syncMissionFromAsyncCompletion,
  resultFilePath,
  missionObserverIndexPath,
  writeResultIndexForData,
  writeAsyncResultFile,
  withResultRunLease,
  readResultPayload,
  resultSnapshotReplaced,
  retireResultSnapshot,
  acknowledgeMissionObserverSnapshot,
  resultPayloadMatchesSessionRun,
  promotePendingResultFile,
  fallbackResultPayloadPathForSessionRun,
  resultPayloadFileForSessionRun,
  resultPayloadPathForSessionRun,
  resultPayloadPathForMissionObserverRun,
  resultPayloadPathForIndexedRun,
  resultCandidateFilesForSession,
  resultCandidateFilesForToolCall,
  missionObserverResultCandidateFiles,
  cleanupResultIndexes,
  OWNING_SESSION_COMPLETION_OWNER,
  currentCompletionOwnerId,
  currentPidNamespaceScope,
  currentBootId,
  currentRecordedPid,
  WORKFLOW_STOP_CAUSE_RUNTIME_REPLACED,
  WORKFLOW_STOP_CAUSE_OWNER_EXITED,
  isReusableWorkflowStopCause,
  isTerminalAsyncState,
  withWorkflowChildRunModel,
  readWorkflowChildProcessEvidence,
  readWorkflowChildEvidence,
  readWorkflowTerminalProof,
  reconcileNestedAsyncDescendants,
  checkPidLiveness,
  isRecordedPid,
  checkRecordedPidLiveness,
  reconcileAsyncRun,
  resolveAuthorityDecision,
  validateAuthorityPolicy,
  WORKTREE_AGENT_CWD_PLACEHOLDER,
  MACHINE_DIFF_OPTIONS,
  withWorktreeTransaction,
  validateWorktreePatchRepresentsCurrentWorktree,
  preflightWorktreeSource,
  normalizeWorktreeBaseRef,
  normalizeWorktreeBranchPrefix,
  resolveWorktreeProvider,
  shouldDeferWorktreeCwd,
  resolveExpectedWorktreeAgentCwd,
  createWorktrees,
  diffWorktrees,
  cleanupWorktrees,
  formatWorktreeDiffSummary,
  validateModelResponseAliases
};
