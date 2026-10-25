import {
  shouldUseNativeFsWatch
} from "./chunk-NIXWDZZV.js";
import {
  resolveWatchPath,
  writeAtomicJson
} from "./chunk-CIZQXJ5Q.js";
import {
  POLL_INTERVAL_MS
} from "./chunk-5LFLVSTM.js";

// src/runs/background/control-channel.ts
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
var CONTROL_SAFETY_POLL_INTERVAL_MS = 5e3;
var REPEATED_SCAN_ERROR_SUMMARY_MS = 6e4;
function validCommandRequest(raw) {
  if (!raw || typeof raw !== "object") return false;
  const value = raw;
  return value.type === "command" && typeof value.id === "string" && /^[a-f0-9-]{36}$/.test(value.id) && typeof value.ownerId === "string" && /^[a-f0-9-]{36}$/.test(value.ownerId) && (value.operation === "status" || value.operation === "yield" || value.operation === "cancel") && Number.isSafeInteger(value.deadlineAt) && value.deadlineAt > 0 && (value.toolCallId === void 0 ? value.operation === "status" : typeof value.toolCallId === "string" && value.toolCallId.length > 0 && value.toolCallId.length <= 256);
}
function commandRequestsDir(dir) {
  return path.join(controlInboxDir(dir), "command-requests");
}
function requestAsyncCommand(dir, request) {
  if (!validCommandRequest(request)) throw new Error("Malformed command request.");
  writeAtomicJson(path.join(commandRequestsDir(dir), `${request.id}.json`), request);
}
function consumeCommandRequests(dir, fsImpl) {
  const requests = [];
  for (const name of fsImpl.readdirSync(commandRequestsDir(dir)).filter((entry) => entry.endsWith(".json")).sort()) {
    const file = path.join(commandRequestsDir(dir), name);
    let value;
    try {
      value = JSON.parse(fsImpl.readFileSync(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
    }
    try {
      fsImpl.rmSync(file);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (validCommandRequest(value)) requests.push(value);
  }
  return requests;
}
var STEER_REQUESTS_DIR = "steer-requests";
var STOP_REQUESTS_DIR = "stop-requests";
var REVIVAL_BRIEFS_DIR = "revival-briefs";
var MAX_STEER_QUEUE_SIZE = 20;
var STEER_INBOX_CLOSED_FILE = "steer-inbox-closed.json";
var STOP_INBOX_CLOSED_FILE = "stop-inbox-closed.json";
var STOP_INBOX_CLOSED_MESSAGE = "Runner stop inbox is closed. Retry stop after runner shutdown is observed.";
var MAX_STEER_MESSAGE_BYTES = 128 * 1024;
var MAX_STEER_REQUEST_ID_LENGTH = 256;
function controlInboxDir(asyncDir) {
  return path.join(asyncDir, "control");
}
function interruptRequestPath(asyncDir) {
  return path.join(controlInboxDir(asyncDir), "interrupt.json");
}
function timeoutRequestPath(asyncDir) {
  return path.join(controlInboxDir(asyncDir), "timeout.json");
}
function stopRequestPath(asyncDir) {
  return path.join(controlInboxDir(asyncDir), "stop.json");
}
function stopRequestsDir(asyncDir) {
  return path.join(controlInboxDir(asyncDir), STOP_REQUESTS_DIR);
}
function steerRequestsDir(asyncDir) {
  return path.join(controlInboxDir(asyncDir), STEER_REQUESTS_DIR);
}
function steerInboxClosedPath(asyncDir) {
  return path.join(controlInboxDir(asyncDir), STEER_INBOX_CLOSED_FILE);
}
function stopInboxClosedPath(asyncDir) {
  return path.join(controlInboxDir(asyncDir), STOP_INBOX_CLOSED_FILE);
}
function closeSteerInbox(asyncDir, state, write = writeAtomicJson) {
  write(steerInboxClosedPath(asyncDir), { version: 1, closedAt: Date.now(), state });
}
function assertChildIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index > 1e6) throw new Error("child index must be a non-negative integer.");
}
function validStopChildId(childId) {
  return typeof childId === "string" && Boolean(childId.trim()) && childId.length <= 256 && !/[\r\n]/.test(childId);
}
function steerRequestFileName(request) {
  return `${String(request.ts).padStart(13, "0")}-${Buffer.from(request.id).toString("base64url")}.json`;
}
function stopRequestFileName(request) {
  return `${String(request.ts ?? 0).padStart(13, "0")}-${randomUUID()}.json`;
}
function validSteerRequest(request) {
  return request.type === "steer" && typeof request.id === "string" && /^[^\s]+$/.test(request.id) && request.id.length <= MAX_STEER_REQUEST_ID_LENGTH && typeof request.ts === "number" && Number.isFinite(request.ts) && request.ts > 0 && typeof request.message === "string" && Boolean(request.message.trim()) && Buffer.byteLength(request.message, "utf8") <= MAX_STEER_MESSAGE_BYTES && (request.mode === void 0 || request.mode === "steer" || request.mode === "follow_up" || request.mode === "auto") && (request.targetIndex === void 0 || Number.isInteger(request.targetIndex) && request.targetIndex >= 0 && request.targetIndex <= 1e6) && (request.targetIndexes === void 0 || request.targetIndex === void 0 && Array.isArray(request.targetIndexes) && request.targetIndexes.length > 0 && request.targetIndexes.length <= 1e3 && request.targetIndexes.every((index) => Number.isInteger(index) && index >= 0 && index <= 1e6) && new Set(request.targetIndexes).size === request.targetIndexes.length) && (request.source === void 0 || typeof request.source === "string" && Boolean(request.source.trim()) && request.source.length <= 256);
}
function writeSteerRequestToDir(dir, request) {
  if (!validSteerRequest(request)) throw new Error("steer request is malformed or exceeds transport limits.");
  const requestPath = path.join(dir, steerRequestFileName(request));
  writeAtomicJson(requestPath, request);
  return requestPath;
}
function requestAsyncInterrupt(asyncDir, payload = {}, deps = {}) {
  const requestPath = interruptRequestPath(asyncDir);
  const request = { ...payload, ts: payload.ts ?? deps.now?.() ?? Date.now(), type: "interrupt" };
  writeAtomicJson(requestPath, request);
  return requestPath;
}
function requestAsyncStop(asyncDir, payload = {}, deps = {}) {
  if (payload.targetIndex !== void 0) assertChildIndex(payload.targetIndex);
  if (payload.childId !== void 0 && !validStopChildId(payload.childId)) {
    throw new Error("stop childId must be a non-empty string without newlines and at most 256 characters.");
  }
  const closedPath = stopInboxClosedPath(asyncDir);
  if (fs.existsSync(closedPath)) throw new Error(STOP_INBOX_CLOSED_MESSAGE);
  const request = { ...payload, ts: payload.ts ?? deps.now?.() ?? Date.now(), type: "stop" };
  const requestPath = path.join(stopRequestsDir(asyncDir), stopRequestFileName(request));
  (deps.write ?? writeAtomicJson)(requestPath, request);
  if (fs.existsSync(closedPath)) {
    fs.rmSync(requestPath, { force: true });
    throw new Error(STOP_INBOX_CLOSED_MESSAGE);
  }
  return requestPath;
}
function requestAsyncSteer(asyncDir, payload, deps = {}) {
  const message = payload.message.trim();
  if (!message) throw new Error("steer message must not be empty.");
  if (Buffer.byteLength(message, "utf8") > MAX_STEER_MESSAGE_BYTES) throw new Error(`steer message exceeds ${MAX_STEER_MESSAGE_BYTES} UTF-8 bytes.`);
  if (payload.targetIndex !== void 0 && (!Number.isInteger(payload.targetIndex) || payload.targetIndex < 0 || payload.targetIndex > 1e6)) {
    throw new Error("steer targetIndex must be an integer between 0 and 1000000.");
  }
  if (payload.targetIndexes !== void 0 && (!Array.isArray(payload.targetIndexes) || payload.targetIndex !== void 0 || payload.targetIndexes.length === 0 || payload.targetIndexes.length > 1e3 || payload.targetIndexes.some((index) => !Number.isInteger(index) || index < 0 || index > 1e6) || new Set(payload.targetIndexes).size !== payload.targetIndexes.length)) {
    throw new Error("steer targetIndexes must contain 1-1000 unique non-negative integers and cannot be combined with targetIndex.");
  }
  const closedPath = steerInboxClosedPath(asyncDir);
  if (fs.existsSync(closedPath)) throw new Error("Async run no longer accepts steering requests.");
  const request = {
    type: "steer",
    id: payload.id ?? deps.randomId?.() ?? randomUUID(),
    ts: payload.ts ?? deps.now?.() ?? Date.now(),
    message,
    ...payload.mode && payload.mode !== "steer" ? { mode: payload.mode } : {},
    ...payload.targetIndex !== void 0 ? { targetIndex: payload.targetIndex } : {},
    ...payload.targetIndexes !== void 0 ? { targetIndexes: [...payload.targetIndexes] } : {},
    ...payload.source ? { source: payload.source } : {}
  };
  const requestPath = writeSteerRequestToDir(steerRequestsDir(asyncDir), request);
  if (fs.existsSync(closedPath)) {
    fs.rmSync(requestPath, { force: true });
    throw new Error("Async run stopped accepting steering before the request was committed.");
  }
  return requestPath;
}
function parseSteerRequest(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return void 0;
  const input = raw;
  if (!validSteerRequest(input)) return void 0;
  return {
    type: "steer",
    id: input.id.trim(),
    ts: input.ts,
    message: input.message.trim(),
    ...input.mode ? { mode: input.mode } : {},
    ...input.targetIndex !== void 0 ? { targetIndex: input.targetIndex } : {},
    ...input.targetIndexes !== void 0 ? { targetIndexes: [...input.targetIndexes] } : {},
    ...typeof input.source === "string" && input.source.trim() ? { source: input.source } : {}
  };
}
function consumeSteerRequestsFromDir(dir, fsImpl = fs, onError = () => {
}) {
  let entries;
  try {
    entries = fsImpl.readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if (error.code !== "ENOENT") onError(error);
    return [];
  }
  const requests = [];
  for (const entry of entries) {
    const requestPath = path.join(dir, entry);
    let parsed;
    let text;
    try {
      text = fsImpl.readFileSync(requestPath, "utf-8");
    } catch (error) {
      if (error.code !== "ENOENT") onError(error);
      continue;
    }
    try {
      parsed = parseSteerRequest(JSON.parse(text));
    } catch {
      parsed = void 0;
    }
    try {
      fsImpl.rmSync(requestPath, { recursive: true });
    } catch (error) {
      if (error.code !== "ENOENT") onError(error);
      continue;
    }
    if (parsed) requests.push(parsed);
  }
  return requests.sort((left, right) => left.ts - right.ts || left.id.localeCompare(right.id));
}
function consumeSteerRequests(asyncDir, fsImpl = fs, onError) {
  return consumeSteerRequestsFromDir(steerRequestsDir(asyncDir), fsImpl, onError);
}
function queueRevivalBrief(asyncDir, request) {
  const dir = path.join(controlInboxDir(asyncDir), REVIVAL_BRIEFS_DIR);
  const queued = fs.existsSync(dir) ? fs.readdirSync(dir).filter((entry) => entry.endsWith(".json")).length : 0;
  if (queued >= MAX_STEER_QUEUE_SIZE) throw new Error(`Follow-up queue is full (${MAX_STEER_QUEUE_SIZE} messages).`);
  return writeSteerRequestToDir(dir, { ...request, mode: "follow_up" });
}
function readRevivalBriefs(asyncDir) {
  const dir = path.join(controlInboxDir(asyncDir), REVIVAL_BRIEFS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((entry) => entry.endsWith(".json")).sort().flatMap((entry) => {
    const filePath = path.join(dir, entry);
    try {
      const request = parseSteerRequest(JSON.parse(fs.readFileSync(filePath, "utf-8")));
      return request ? [{ request, path: filePath }] : [];
    } catch {
      return [];
    }
  });
}
function consumeInterruptRequest(asyncDir, fsImpl = fs) {
  const requestPath = interruptRequestPath(asyncDir);
  if (!fsImpl.existsSync(requestPath)) return false;
  try {
    fsImpl.rmSync(requestPath, { force: true, recursive: true });
  } catch {
  }
  return true;
}
function consumeTimeoutRequest(asyncDir, fsImpl = fs) {
  const requestPath = timeoutRequestPath(asyncDir);
  if (!fsImpl.existsSync(requestPath)) return false;
  try {
    fsImpl.rmSync(requestPath, { force: true, recursive: true });
  } catch {
  }
  return true;
}
function parseStopRequest(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return void 0;
  const parsed = raw;
  if (parsed.type !== "stop") return void 0;
  if (Object.hasOwn(parsed, "targetIndex") && !(Number.isInteger(parsed.targetIndex) && parsed.targetIndex >= 0 && parsed.targetIndex <= 1e6)) return void 0;
  if (Object.hasOwn(parsed, "childId") && !validStopChildId(parsed.childId)) return void 0;
  return {
    type: "stop",
    ...typeof parsed.ts === "number" ? { ts: parsed.ts } : {},
    ...typeof parsed.source === "string" ? { source: parsed.source } : {},
    ...typeof parsed.reason === "string" ? { reason: parsed.reason } : {},
    ...parsed.targetIndex !== void 0 ? { targetIndex: parsed.targetIndex } : {},
    ...validStopChildId(parsed.childId) ? { childId: parsed.childId } : {}
  };
}
function consumeStopRequestFile(requestPath, fsImpl, onError) {
  let text;
  try {
    text = fsImpl.readFileSync(requestPath, "utf-8");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) onError?.(error);
    return void 0;
  }
  let request;
  try {
    request = parseStopRequest(JSON.parse(text));
  } catch {
    request = void 0;
  }
  try {
    fsImpl.rmSync(requestPath, { force: true, recursive: true });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) onError?.(error);
    return void 0;
  }
  return request;
}
function consumeStopRequestPayloads(asyncDir, fsImpl = fs, onError) {
  const dir = stopRequestsDir(asyncDir);
  const requests = [];
  if (fsImpl.existsSync(dir)) {
    let entries;
    try {
      entries = fsImpl.readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) onError?.(error);
      entries = [];
    }
    for (const entry of entries) {
      const request = consumeStopRequestFile(path.join(dir, entry), fsImpl, onError);
      if (request) requests.push(request);
    }
  }
  const legacyPath = stopRequestPath(asyncDir);
  if (fsImpl.existsSync(legacyPath)) {
    const request = consumeStopRequestFile(legacyPath, fsImpl, onError);
    if (request) requests.push(request);
  }
  return requests.sort((left, right) => (left.ts ?? 0) - (right.ts ?? 0));
}
function deliverInterruptRequest(input) {
  requestAsyncInterrupt(input.asyncDir, input.source ? { source: input.source } : {}, { now: input.now });
}
function deliverStopRequest(input) {
  requestAsyncStop(input.asyncDir, { ...input.source ? { source: input.source } : {}, ...input.targetIndex !== void 0 ? { targetIndex: input.targetIndex } : {}, ...input.childId ? { childId: input.childId } : {} }, { now: input.now });
}
function watchAsyncControlInbox(asyncDir, opts) {
  const fsImpl = opts.fs ?? fs;
  const timers = opts.timers ?? { setInterval, clearInterval };
  const dir = controlInboxDir(asyncDir);
  const report = (error, phase, request) => {
    try {
      if (opts.onError) opts.onError(error, phase, request);
      else console.error(`Control inbox ${phase} failed:`, error);
    } catch (reportError) {
      console.error("Control inbox error reporter failed:", reportError);
    }
  };
  const repeatedScanErrors = /* @__PURE__ */ new Map();
  let scanFailed = false;
  const reportScan = (error) => {
    scanFailed = true;
    const text = error instanceof Error ? error.message : String(error);
    const now = (opts.now ?? Date.now)();
    const repeated = repeatedScanErrors.get(text);
    if (!repeated) {
      repeatedScanErrors.set(text, { suppressed: 0, since: now });
      report(error, "scan");
      return;
    }
    repeated.suppressed++;
    if (now - repeated.since < REPEATED_SCAN_ERROR_SUMMARY_MS) return;
    report(`${repeated.suppressed} more identical failures in the last ${Math.round((now - repeated.since) / 1e3)}s: ${text}`, "scan");
    repeated.suppressed = 0;
    repeated.since = now;
  };
  const dirs = [
    ...opts.onInterrupt || opts.onTimeout || opts.onStop ? [dir] : [],
    ...opts.onStop ? [stopRequestsDir(asyncDir)] : [],
    ...opts.onSteer ? [steerRequestsDir(asyncDir)] : [],
    ...opts.onCommand ? [commandRequestsDir(asyncDir)] : []
  ];
  if (dirs.length === 0) return () => {
  };
  try {
    for (const target of dirs) fsImpl.mkdirSync(target, { recursive: true });
  } catch (error) {
    report(error, "install");
  }
  let disposed = false;
  const check = () => {
    if (disposed) return;
    scanFailed = false;
    try {
      if (opts.onCommand) for (const request of consumeCommandRequests(asyncDir, fsImpl)) {
        try {
          opts.onCommand(request);
        } catch (error) {
          report(error, "callback");
        }
      }
      if (opts.onStop) for (const request of consumeStopRequestPayloads(asyncDir, fsImpl, reportScan)) {
        try {
          opts.onStop(request);
        } catch (error) {
          report(error, "callback");
        }
      }
      if (opts.onTimeout && consumeTimeoutRequest(asyncDir, fsImpl)) {
        try {
          opts.onTimeout();
        } catch (error) {
          report(error, "callback");
        }
      }
      if (opts.onInterrupt && consumeInterruptRequest(asyncDir, fsImpl)) {
        try {
          opts.onInterrupt();
        } catch (error) {
          report(error, "callback");
        }
      }
      if (opts.onSteer) for (const request of consumeSteerRequestsFromDir(steerRequestsDir(asyncDir), fsImpl, reportScan)) {
        try {
          opts.onSteer(request);
        } catch (error) {
          report(error, "callback", request);
        }
      }
    } catch (error) {
      reportScan(error);
    }
    if (!scanFailed) repeatedScanErrors.clear();
  };
  check();
  const watchers = [];
  let interval;
  let safetyInterval;
  const startPolling = () => {
    if (interval || disposed) return;
    if (safetyInterval) {
      timers.clearInterval(safetyInterval);
      safetyInterval = void 0;
    }
    interval = timers.setInterval(check, opts.pollIntervalMs ?? POLL_INTERVAL_MS);
    interval.unref?.();
  };
  try {
    if (shouldUseNativeFsWatch("runner-control-inbox", opts.platform)) {
      for (const target of dirs) {
        const watcher = fsImpl.watch(resolveWatchPath(target, fsImpl.realpathSync.native), check);
        watcher.on?.("error", startPolling);
        watchers.push(watcher);
      }
      if (!interval) {
        safetyInterval = timers.setInterval(check, opts.safetyPollIntervalMs ?? CONTROL_SAFETY_POLL_INTERVAL_MS);
        safetyInterval.unref?.();
      }
    } else {
      startPolling();
    }
  } catch {
    startPolling();
  }
  return () => {
    if (disposed) return;
    disposed = true;
    for (const watcher of watchers) {
      try {
        watcher.close();
      } catch {
      }
    }
    if (interval) timers.clearInterval(interval);
    if (safetyInterval) timers.clearInterval(safetyInterval);
  };
}

export {
  requestAsyncCommand,
  stopInboxClosedPath,
  closeSteerInbox,
  requestAsyncStop,
  requestAsyncSteer,
  consumeSteerRequests,
  queueRevivalBrief,
  readRevivalBriefs,
  deliverInterruptRequest,
  deliverStopRequest,
  watchAsyncControlInbox
};
