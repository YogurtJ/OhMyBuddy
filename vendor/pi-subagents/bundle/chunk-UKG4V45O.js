import {
  previewDisplayText,
  safeTerminalText,
  sanitizeDisplayText,
  truncateDisplayText
} from "./chunk-YFCK7H2S.js";

// src/api/external-runs.ts
var EXTERNAL_RUN_REGISTRY_VERSION = 2;
var EXTERNAL_RUN_REGISTRY_KEY = "pi-subagents.external-runs.v2";
var EXTERNAL_RUN_LIMITS = {
  maxCachedRuns: 100,
  maxSnapshotRuns: 20,
  maxIdentityLength: 160,
  /**
   * A Pi session id is the session file path, which routinely exceeds a short
   * identity budget in nested worktrees, so it is bounded like the other paths.
   */
  maxSessionIdLength: 4096,
  maxTextLength: 160,
  maxPreviewLength: 4096,
  maxPathLength: 4096,
  maxSerializedBytes: 32 * 1024
};
var trustedRecordsByRegistry = /* @__PURE__ */ new WeakMap();
var RUN_FIELD_NAMES = [
  "id",
  "sessionId",
  "source",
  "label",
  "state",
  "startedAt",
  "updatedAt",
  "endedAt",
  "currentAction",
  "preview",
  "reportPath",
  "transcriptPath"
];
var RUN_FIELDS = new Set(RUN_FIELD_NAMES);
var UPDATE_FIELDS = new Set([...RUN_FIELDS].filter((field) => field !== "id" && field !== "sessionId" && field !== "source"));
function registry() {
  const key2 = Symbol.for(EXTERNAL_RUN_REGISTRY_KEY);
  const target = globalThis;
  const existing = target[key2];
  if (existing === void 0) {
    const created = { version: EXTERNAL_RUN_REGISTRY_VERSION, runs: /* @__PURE__ */ new Map() };
    target[key2] = created;
    return created;
  }
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) throw new Error(`Malformed external-run registry at Symbol.for("${EXTERNAL_RUN_REGISTRY_KEY}").`);
  const candidate = existing;
  if (candidate.version !== EXTERNAL_RUN_REGISTRY_VERSION || !(candidate.runs instanceof Map)) throw new Error(`Unsupported external-run registry at Symbol.for("${EXTERNAL_RUN_REGISTRY_KEY}").`);
  return candidate;
}
function trustedRecords(current) {
  const cached = trustedRecordsByRegistry.get(current);
  if (cached) return cached;
  const records = /* @__PURE__ */ new Map();
  trustedRecordsByRegistry.set(current, records);
  return records;
}
function inputObject(value, field, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  const input = value;
  const unknown = Object.keys(input).filter((key2) => !allowed.has(key2));
  if (unknown.length) throw new Error(`${field} has unknown fields: ${unknown.join(", ")}.`);
  return input;
}
function identity(value, field, maxLength = EXTERNAL_RUN_LIMITS.maxIdentityLength) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || value.includes("\0")) throw new Error(`${field} must be a non-empty trimmed string without NUL characters.`);
  if (value.length > maxLength) throw new Error(`${field} must be at most ${maxLength} characters.`);
  if (/[\t\n\p{Zl}\p{Zp}]/u.test(value) || safeTerminalText(value) !== value) throw new Error(`${field} must contain only display-safe text.`);
  return value;
}
function displayText(value, field, maxLength, required = false) {
  if (value === void 0 && !required) return void 0;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string.`);
  const safe = sanitizeDisplayText(value.slice(0, Math.max(maxLength * 4, maxLength)));
  if (!safe) throw new Error(`${field} must contain displayable text.`);
  return truncateDisplayText(safe, maxLength);
}
function timestamp(value, field, required = false) {
  if (value === void 0 && !required) return void 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 864e13) throw new Error(`${field} must be a non-negative safe timestamp.`);
  return value;
}
function state(value, field) {
  if (value === "queued" || value === "running" || value === "completed" || value === "failed" || value === "stopped") return value;
  throw new Error(`${field} is invalid.`);
}
function validateRun(value) {
  const run = inputObject(value, "External run", RUN_FIELDS);
  const updatedAt = timestamp(run.updatedAt, "External run updatedAt");
  const endedAt = timestamp(run.endedAt, "External run endedAt");
  const currentAction = displayText(run.currentAction, "External run currentAction", EXTERNAL_RUN_LIMITS.maxTextLength);
  const preview = displayText(run.preview, "External run preview", EXTERNAL_RUN_LIMITS.maxPreviewLength);
  const reportPath = displayText(run.reportPath, "External run reportPath", EXTERNAL_RUN_LIMITS.maxPathLength);
  const transcriptPath = displayText(run.transcriptPath, "External run transcriptPath", EXTERNAL_RUN_LIMITS.maxPathLength);
  return {
    id: identity(run.id, "External run id"),
    sessionId: identity(run.sessionId, "External run sessionId", EXTERNAL_RUN_LIMITS.maxSessionIdLength),
    source: displayText(run.source, "External run source", EXTERNAL_RUN_LIMITS.maxTextLength, true),
    label: displayText(run.label, "External run label", EXTERNAL_RUN_LIMITS.maxTextLength, true),
    state: state(run.state, "External run state"),
    startedAt: timestamp(run.startedAt, "External run startedAt", true),
    ...updatedAt !== void 0 ? { updatedAt } : {},
    ...endedAt !== void 0 ? { endedAt } : {},
    ...currentAction ? { currentAction } : {},
    ...preview ? { preview } : {},
    ...reportPath ? { reportPath } : {},
    ...transcriptPath ? { transcriptPath } : {}
  };
}
function key(sessionId, id) {
  return `${sessionId}\0${id}`;
}
function clone(run) {
  return { ...run };
}
function trustedRecord(value, normalized) {
  const candidate = value;
  return {
    value,
    normalized,
    keys: Object.keys(candidate),
    values: RUN_FIELD_NAMES.map((field) => candidate[field])
  };
}
function trustedRecordValue(value, record) {
  if (!record || record.value !== value || !value || typeof value !== "object") return void 0;
  try {
    const candidate = value;
    const keys = Object.keys(candidate);
    if (keys.length !== record.keys.length || keys.some((key2, index) => key2 !== record.keys[index])) return void 0;
    for (const [index, field] of RUN_FIELD_NAMES.entries()) {
      if (candidate[field] !== record.values[index]) return void 0;
    }
    return record.normalized;
  } catch {
    return void 0;
  }
}
function rememberTrustedRecord(current, cacheKey, value, normalized) {
  trustedRecords(current).set(cacheKey, trustedRecord(value, normalized));
}
function normalizeCachedRecord(current, cacheKey, value) {
  const run = validateRun(value);
  rememberTrustedRecord(current, cacheKey, value, run);
  return run;
}
function registerExternalRun(input) {
  const run = validateRun(input);
  const current = registry();
  const runKey = key(run.sessionId, run.id);
  if (current.runs.has(runKey)) throw new Error(`External run '${run.id}' is already registered for session '${run.sessionId}'.`);
  if (current.runs.size >= EXTERNAL_RUN_LIMITS.maxCachedRuns) throw new Error(`External-run registry supports at most ${EXTERNAL_RUN_LIMITS.maxCachedRuns} cached runs.`);
  current.runs.set(runKey, run);
  rememberTrustedRecord(current, runKey, run, run);
  return clone(run);
}
function updateExternalRun(sessionId, id, update) {
  const safeSessionId = identity(sessionId, "External run sessionId", EXTERNAL_RUN_LIMITS.maxSessionIdLength);
  const safeId = identity(id, "External run id");
  const patch = inputObject(update, "External run update", UPDATE_FIELDS);
  const current = registry();
  const runKey = key(safeSessionId, safeId);
  const previous = current.runs.get(runKey);
  if (!previous) throw new Error(`External run '${safeId}' is not registered for session '${safeSessionId}'.`);
  const next = validateRun({ ...previous, ...patch });
  current.runs.set(runKey, next);
  rememberTrustedRecord(current, runKey, next, next);
  return clone(next);
}
function unregisterExternalRun(sessionId, id) {
  const current = registry();
  const runKey = key(identity(sessionId, "External run sessionId", EXTERNAL_RUN_LIMITS.maxSessionIdLength), identity(id, "External run id"));
  const deleted = current.runs.delete(runKey);
  if (deleted) trustedRecords(current).delete(runKey);
  return deleted;
}
function snapshotBytes(runs) {
  return Buffer.byteLength(JSON.stringify(runs), "utf8");
}
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function snapshotExternalRuns(sessionId, options = {}) {
  const safeSessionId = identity(sessionId, "External-run snapshot sessionId", EXTERNAL_RUN_LIMITS.maxSessionIdLength);
  const current = registry();
  const trusted = trustedRecords(current);
  const sessionPrefix = `${safeSessionId}\0`;
  const runs = [];
  for (const [cacheKey, value] of current.runs.entries()) {
    if (typeof cacheKey !== "string" || !cacheKey.startsWith(sessionPrefix)) continue;
    try {
      const run = trustedRecordValue(value, trusted.get(cacheKey)) ?? normalizeCachedRecord(current, cacheKey, value);
      if (run.sessionId === safeSessionId) runs.push(run);
    } catch (error) {
      const message = `Malformed cached external run '${previewDisplayText(cacheKey.slice(sessionPrefix.length), EXTERNAL_RUN_LIMITS.maxIdentityLength)}': ${getErrorMessage(error)}`;
      if (!options.ignoreMalformed) throw new Error(message, { cause: error instanceof Error ? error : void 0 });
      current.runs.delete(cacheKey);
      trusted.delete(cacheKey);
      options.onMalformedRecord?.(message);
    }
  }
  runs.sort((left, right) => {
    const leftActive = left.state === "queued" || left.state === "running";
    const rightActive = right.state === "queued" || right.state === "running";
    if (leftActive !== rightActive) return leftActive ? -1 : 1;
    return (right.updatedAt ?? right.endedAt ?? right.startedAt) - (left.updatedAt ?? left.endedAt ?? left.startedAt) || left.id.localeCompare(right.id);
  });
  const snapshot = runs.slice(0, EXTERNAL_RUN_LIMITS.maxSnapshotRuns).map(clone);
  while (snapshot.length > 0 && snapshotBytes(snapshot) > EXTERNAL_RUN_LIMITS.maxSerializedBytes) snapshot.pop();
  return snapshot;
}
var listExternalRuns = snapshotExternalRuns;

export {
  EXTERNAL_RUN_REGISTRY_VERSION,
  EXTERNAL_RUN_REGISTRY_KEY,
  EXTERNAL_RUN_LIMITS,
  registerExternalRun,
  updateExternalRun,
  unregisterExternalRun,
  snapshotExternalRuns,
  listExternalRuns
};
