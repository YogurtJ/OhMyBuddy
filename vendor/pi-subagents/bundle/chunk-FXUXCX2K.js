import {
  contextModeLabel,
  findAsyncRunPrefixMatches,
  formatActivityLabel,
  formatAsyncRunOutputPath,
  formatAsyncRunProgressLabel,
  formatNestedRunStatusLines,
  isStoppableAsyncStatusStep,
  listAsyncRuns,
  ownsRun,
  resolveAsyncStatusChild,
  stopStoppableAsyncStatusChildren,
  summarizeContextModes,
  utf8Tail,
  workflowPreflightLaneForRuntimeKey
} from "./chunk-6XJB7PIX.js";
import {
  assertSafeNestedId,
  checkRecordedPidLiveness,
  encodeIndexSegment,
  findNestedRunMatchesById,
  isRecordedPid,
  readActiveRunToolCallIndex,
  readProcessTerminal,
  readTerminalRunToolCallIndex,
  reconcileAsyncRun,
  resultCandidateFilesForToolCall,
  resultFilePath,
  resultPayloadFileForSessionRun,
  resultPayloadPathForIndexedRun,
  resultPayloadPathForSessionRun,
  updateActiveRunIndex,
  validateModelResponseAliases,
  writeAsyncResultFile
} from "./chunk-46XKCPJR.js";
import {
  deliverStopRequest,
  stopInboxClosedPath
} from "./chunk-OYF6AFDY.js";
import {
  SUBAGENT_STOPPED_MESSAGE,
  formatDuration,
  formatModelThinking,
  formatTokens,
  readStatus,
  shortenPath,
  validateAcceptanceInput,
  writeAtomicJson,
  writePrivateAtomicJson
} from "./chunk-CIZQXJ5Q.js";
import {
  DIRS
} from "./chunk-5LFLVSTM.js";
import {
  safeTerminalText,
  truncateDisplayText
} from "./chunk-YFCK7H2S.js";

// src/workflows/chat-progress.ts
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
var WORKFLOW_CHAT_PROGRESS_MODES = ["auto", "off", "live-card"];
function git(cwd, args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf-8", windowsHide: true });
  if (result.status !== 0) return void 0;
  const output = result.stdout.trim();
  return output || void 0;
}
function realPath(value) {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}
function resolveGitRepositoryIdentity(cwd) {
  if (git(cwd, ["rev-parse", "--is-inside-work-tree"]) !== "true") return void 0;
  const root = git(cwd, ["rev-parse", "--show-toplevel"]);
  const commonDir = git(cwd, ["rev-parse", "--git-common-dir"]);
  if (!root || !commonDir) return void 0;
  const commonDirPath = path.isAbsolute(commonDir) ? commonDir : [path.resolve(cwd, commonDir), path.resolve(root, commonDir)].find((candidate) => fs.existsSync(candidate)) ?? path.resolve(root, commonDir);
  return {
    root: realPath(root),
    commonDir: realPath(commonDirPath)
  };
}
function normalizeRequestedMode(value) {
  if (value === void 0) return { mode: "auto" };
  if (typeof value !== "string" || !WORKFLOW_CHAT_PROGRESS_MODES.includes(value)) {
    return { error: `chatProgress must be one of: ${WORKFLOW_CHAT_PROGRESS_MODES.join(", ")}.` };
  }
  return { mode: value };
}
function resolveWorkflowChatProgress(input) {
  const requested = normalizeRequestedMode(input.requested);
  if (requested.error) return { error: requested.error };
  const parentIdentity = resolveGitRepositoryIdentity(input.parentCwd);
  const workflowIdentity = resolveGitRepositoryIdentity(input.workflowCwd);
  const sameRepo = !!(parentIdentity && workflowIdentity && (parentIdentity.commonDir === workflowIdentity.commonDir || parentIdentity.root === workflowIdentity.root));
  const repoLabel = workflowIdentity ? path.basename(workflowIdentity.root) : void 0;
  const repoRelation = sameRepo ? "same" : "other";
  const requestedMode = requested.mode ?? "auto";
  let mode;
  if (requestedMode === "auto") mode = sameRepo && !input.background ? "live-card" : "off";
  else mode = requestedMode;
  if (mode === "live-card" && !sameRepo) return { error: "chatProgress: 'live-card' is only available for workflow script runs in the same Git repository." };
  if (mode === "live-card" && input.background) return { error: "chatProgress: 'live-card' is unavailable for async workflow scripts. Async workflows have no inline live card; omit chatProgress or use auto/off. Use async:false only when the parent must block." };
  return { projection: { mode, repoRelation, ...repoLabel ? { repoLabel } : {} } };
}
function cleanLabel(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function buildWorkflowChatProgressRows(trace, preflight) {
  const rows = /* @__PURE__ */ new Map();
  for (const entry of trace) {
    if (entry.operation !== "run") continue;
    const existing = rows.get(entry.key);
    if (entry.state === "reused") {
      if (existing) {
        const label2 = cleanLabel(entry.label);
        const phase2 = cleanLabel(entry.phase);
        if (label2) existing.label = label2;
        if (phase2) existing.phase = phase2;
      }
      continue;
    }
    const lane = workflowPreflightLaneForRuntimeKey(preflight, entry.key, [entry.generatedLaneKey]);
    const next = existing ?? { key: entry.key, state: "running" };
    if (lane && !next.preflight) next.preflight = lane;
    next.state = entry.state === "completed" ? "complete" : entry.state === "failed" ? "failed" : entry.state === "detached" ? "detached" : entry.state === "stopped" ? "stopped" : "running";
    const label = cleanLabel(entry.label);
    const phase = cleanLabel(entry.phase);
    if (label) next.label = label;
    if (phase) next.phase = phase;
    if (entry.runId === void 0) delete next.runId;
    else next.runId = entry.runId;
    if (entry.durationMs === void 0) delete next.durationMs;
    else next.durationMs = entry.durationMs;
    if (entry.error === void 0) delete next.error;
    else next.error = entry.error;
    rows.set(entry.key, next);
  }
  return [...rows.values()];
}

// src/runs/background/fleet-view.ts
import * as fs3 from "node:fs";
import * as path3 from "node:path";

// src/shared/session-file-trust.ts
import * as fs2 from "node:fs";
import * as path2 from "node:path";
function pathWithin(base, candidate) {
  const resolvedBase = path2.resolve(base);
  const resolvedCandidate = path2.resolve(candidate);
  return resolvedCandidate === resolvedBase || resolvedCandidate.startsWith(`${resolvedBase}${path2.sep}`);
}
function isTrustedRecordedSessionFile(realPath2, recordedFiles, sessionsBase) {
  if (!sessionsBase || recordedFiles.length === 0) return false;
  try {
    const realSessionsBase = fs2.realpathSync(sessionsBase);
    if (!pathWithin(realSessionsBase, realPath2)) return false;
    return recordedFiles.some((file) => fs2.realpathSync(path2.resolve(file)) === realPath2);
  } catch {
    return false;
  }
}

// src/runs/background/fleet-view.ts
var DEFAULT_TRANSCRIPT_LINES = 80;
var MAX_TRANSCRIPT_LINES = 500;
var TRANSCRIPT_TAIL_BYTES = 256 * 1024;
var MAX_TRANSCRIPT_LINE_CHARS = 2e3;
var MAX_TRANSCRIPT_BODY_BYTES = 32 * 1024;
var TRANSCRIPT_LINE_OMISSION = "\u2026 [content omitted]";
var TRANSCRIPT_BODY_OMISSION = "  \u2026 [earlier lines omitted]";
function transcriptLineLimit(value) {
  if (value === void 0) return DEFAULT_TRANSCRIPT_LINES;
  if (!Number.isFinite(value)) return DEFAULT_TRANSCRIPT_LINES;
  return Math.max(1, Math.min(MAX_TRANSCRIPT_LINES, Math.trunc(value)));
}
function uniqueStrings(values) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}
function fleetChildDisplayName(child, fallback = "subagent") {
  return child.sessionName?.trim() || child.agent || fallback;
}
function fleetStepDisplayName(step) {
  return step.sessionName?.trim() || (step.label ? `${step.label} (${step.agent})` : step.agent);
}
function resolveMaybeRelative(asyncDir, filePath) {
  if (!filePath) return void 0;
  return path3.resolve(asyncDir, filePath);
}
function pathWithin2(base, candidate) {
  const resolvedBase = path3.resolve(base);
  const resolvedCandidate = path3.resolve(candidate);
  return resolvedCandidate === resolvedBase || resolvedCandidate.startsWith(`${resolvedBase}${path3.sep}`);
}
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function isNotFoundError(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function readTextTail(filePath, maxLines) {
  let stat;
  try {
    stat = fs3.statSync(filePath);
  } catch (error) {
    if (isNotFoundError(error)) return { path: filePath, lines: [], truncated: false };
    return { path: filePath, lines: [], truncated: false, error: getErrorMessage(error) };
  }
  if (stat.size === 0) return { path: filePath, lines: [], truncated: false };
  let fd;
  try {
    const bytesToRead = Math.min(stat.size, TRANSCRIPT_TAIL_BYTES);
    const start = stat.size - bytesToRead;
    const buffer = Buffer.alloc(bytesToRead);
    fd = fs3.openSync(filePath, "r");
    const bytesRead = fs3.readSync(fd, buffer, 0, bytesToRead, start);
    const content = buffer.subarray(0, bytesRead).toString("utf-8");
    let lines = content.split(/\r?\n/);
    if (start > 0 && lines.length > 0) lines = lines.slice(1);
    if (lines.at(-1) === "") lines = lines.slice(0, -1);
    return { path: filePath, lines: lines.slice(-maxLines), truncated: start > 0 || lines.length > maxLines };
  } catch (error) {
    return { path: filePath, lines: [], truncated: false, error: getErrorMessage(error) };
  } finally {
    if (fd !== void 0) fs3.closeSync(fd);
  }
}
function readContainedTextTail(filePath, maxLines, trustedRoots, label, trustedFiles = [], trustedFileRoot) {
  if (trustedRoots.length === 0 && (!trustedFileRoot || trustedFiles.length === 0)) return { path: filePath, lines: [], truncated: false, error: `Refusing to read ${label} transcript path without a trusted root: ${filePath}` };
  const resolvedPath = path3.resolve(filePath);
  const recordedCandidate = trustedFileRoot && pathWithin2(trustedFileRoot, resolvedPath) && trustedFiles.some((file) => path3.resolve(file) === resolvedPath);
  if (!trustedRoots.some((root) => pathWithin2(root, resolvedPath)) && !recordedCandidate) {
    return { path: filePath, lines: [], truncated: false, error: `Refusing to read ${label} transcript path outside trusted roots: ${filePath}` };
  }
  let lstat;
  try {
    lstat = fs3.lstatSync(resolvedPath);
  } catch (error) {
    if (isNotFoundError(error)) return { path: filePath, lines: [], truncated: false };
    return { path: filePath, lines: [], truncated: false, error: getErrorMessage(error) };
  }
  if (lstat.isSymbolicLink()) return { path: filePath, lines: [], truncated: false, error: `Refusing to read symlink ${label} transcript path: ${filePath}` };
  if (!lstat.isFile()) return { path: filePath, lines: [], truncated: false, error: `Refusing to read non-file ${label} transcript path: ${filePath}` };
  let realPath2;
  let realRoots;
  try {
    realPath2 = fs3.realpathSync(resolvedPath);
    realRoots = trustedRoots.filter((root) => fs3.existsSync(root)).map((root) => fs3.realpathSync(root));
  } catch (error) {
    return { path: filePath, lines: [], truncated: false, error: getErrorMessage(error) };
  }
  if (!realRoots.some((root) => pathWithin2(root, realPath2)) && !isTrustedRecordedSessionFile(realPath2, trustedFiles, trustedFileRoot)) {
    return { path: filePath, lines: [], truncated: false, error: `Refusing to read ${label} transcript path outside trusted roots: ${filePath}` };
  }
  return readTextTail(resolvedPath, maxLines);
}
function stringifyJsonPreview(value, maxLength = 240) {
  let raw;
  if (typeof value === "string") raw = value;
  else raw = JSON.stringify(value);
  return raw.length > maxLength ? `${raw.slice(0, maxLength)}\u2026` : raw;
}
function sessionMessageParts(record) {
  if (!record || typeof record !== "object") return [];
  const outer = record;
  const message = outer.message && typeof outer.message === "object" ? outer.message : outer;
  const role = typeof message.role === "string" ? message.role : void 0;
  if (!role) return [];
  const content = message.content;
  if (typeof content === "string") return content.trim() ? [{ role, kind: "text", text: content }] : [];
  if (!Array.isArray(content)) return [];
  const parts = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const entry = part;
    if (typeof entry.text === "string") {
      if (entry.text.trim()) parts.push({ role, kind: "text", text: entry.text });
      continue;
    }
    if (entry.type === "toolCall" || entry.type === "tool_call") {
      const name = typeof entry.name === "string" ? entry.name : typeof entry.toolName === "string" ? entry.toolName : "tool";
      parts.push({ role, kind: "toolCall", name, text: `[tool: ${name}${entry.args === void 0 ? "" : ` ${stringifyJsonPreview(entry.args)}`}]` });
      continue;
    }
    if (entry.type === "toolResult" || entry.type === "tool_result") {
      const name = typeof entry.name === "string" ? entry.name : typeof entry.toolName === "string" ? entry.toolName : void 0;
      parts.push({ role, kind: "toolResult", ...name ? { name } : {}, ...entry.isError === true ? { isError: true } : {}, text: `[tool result${entry.result === void 0 ? "" : `: ${stringifyJsonPreview(entry.result)}`}]` });
      continue;
    }
    if (entry.content !== void 0) {
      const preview = stringifyJsonPreview(entry.content);
      if (preview.trim()) parts.push({ role, kind: "text", text: preview });
    }
  }
  return parts;
}
function sessionMessageLine(record) {
  const parts = sessionMessageParts(record);
  if (parts.length === 0) return void 0;
  const text = parts.map((part) => part.text).join("\n").trim();
  if (!text) return void 0;
  return `${parts[0].role}: ${text}`;
}
function readSessionMessagesTail(sessionFile, maxMessages, trustedRoots, trustedFiles = [], trustedFileRoot) {
  const tail = readContainedTextTail(sessionFile, Math.max(maxMessages * 4, maxMessages), trustedRoots, "session", trustedFiles, trustedFileRoot);
  const warnings = [];
  if (tail.error) warnings.push(`Session read failed for ${sessionFile}: ${tail.error}`);
  const parsedMessages = [];
  let malformed = 0;
  let recordIndex = 0;
  for (const line of tail.lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      for (const part of sessionMessageParts(parsed)) parsedMessages.push({ ...part, recordIndex });
    } catch {
      malformed++;
    }
    recordIndex++;
  }
  if (malformed > 0) warnings.push(`Skipped ${malformed} malformed session tail line${malformed === 1 ? "" : "s"}.`);
  const messages = parsedMessages.slice(-maxMessages);
  return { messages, warnings, truncated: tail.truncated || parsedMessages.length > messages.length };
}
function readSessionTranscriptTail(sessionFile, maxLines, trustedRoots, trustedFiles = [], trustedFileRoot) {
  const tail = readContainedTextTail(sessionFile, Math.max(maxLines * 4, maxLines), trustedRoots, "session", trustedFiles, trustedFileRoot);
  const warnings = [];
  if (tail.error) warnings.push(`Session read failed for ${sessionFile}: ${tail.error}`);
  const lines = [];
  let malformed = 0;
  for (const line of tail.lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      const messageLine = sessionMessageLine(parsed);
      if (messageLine) lines.push(...messageLine.split(/\r?\n/));
    } catch {
      malformed++;
    }
  }
  if (malformed > 0) warnings.push(`Skipped ${malformed} malformed session tail line${malformed === 1 ? "" : "s"}.`);
  return { lines: lines.slice(-maxLines), warnings };
}
function formatActivityFacts(input) {
  const facts = [];
  if (input.currentTool && input.currentToolStartedAt !== void 0) facts.push(`tool ${input.currentTool} ${formatDuration(Math.max(0, Date.now() - input.currentToolStartedAt))}`);
  else if (input.currentTool) facts.push(`tool ${input.currentTool}`);
  if (input.currentPath) facts.push(shortenPath(input.currentPath));
  if (input.turnCount !== void 0) facts.push(`${input.turnCount} turns`);
  if (input.toolCount !== void 0) facts.push(`${input.toolCount} tools`);
  if (input.tokens?.total) facts.push(`${formatTokens(input.tokens.total)} tok`);
  const activity = formatActivityLabel(input.lastActivityAt, input.activityState);
  return activity || facts.length ? [activity, ...facts].filter(Boolean).join(" | ") : void 0;
}
function foregroundModeName(control) {
  const currentDisplayName = control.sessionName?.trim() || control.currentAgent;
  if (control.mode === "single" && currentDisplayName) return currentDisplayName;
  return control.mode;
}
function formatForegroundFleetLines(controls) {
  if (controls.length === 0) return [];
  const lines = ["Foreground runs:"];
  const ordered = [...controls].sort((left, right) => right.updatedAt - left.updatedAt);
  for (const control of ordered) {
    const activity = formatActivityFacts({
      activityState: control.currentActivityState,
      lastActivityAt: control.lastActivityAt,
      currentTool: control.currentTool,
      currentToolStartedAt: control.currentToolStartedAt,
      currentPath: control.currentPath,
      turnCount: control.turnCount,
      toolCount: control.toolCount,
      ...control.tokens !== void 0 ? { tokens: { total: control.tokens } } : {}
    });
    const currentDisplayName = control.sessionName?.trim() || control.currentAgent;
    const current = currentDisplayName ? ` | ${currentDisplayName}${control.currentIndex !== void 0 ? ` #${control.currentIndex}` : ""}` : "";
    lines.push(`- ${control.runId} | running | ${foregroundModeName(control)}${current}${activity ? ` | ${activity}` : ""}`);
    lines.push(`  status: subagent({ action: "status", id: "${control.runId}" })`);
    lines.push("  transcript: live in the expanded foreground result; persisted session transcript appears after completion when sessions are enabled.");
    lines.push(...formatNestedRunStatusLines(control.nestedChildren, { indent: "  ", commandHints: true, maxLines: 12 }));
  }
  return lines;
}
function formatDetachedForegroundFleetLines(runs) {
  if (runs.length === 0) return [];
  const lines = ["Detached foreground runs:"];
  const ordered = [...runs].sort((left, right) => right.updatedAt - left.updatedAt);
  for (const run of ordered) {
    const detachedChildren = run.children.filter((child) => child.status === "detached");
    const childSummary = detachedChildren.map((child) => `${fleetChildDisplayName(child)} #${child.index}`).join(", ");
    lines.push(`- ${run.runId} | detached | ${run.mode}${childSummary ? ` | ${childSummary}` : ""}`);
    lines.push(`  status: subagent({ action: "status", id: "${run.runId}" })`);
    lines.push(`  recovery: reply to the supervisor request first, then wait with bg_wait({ id: "${run.runId}" }); do not resume or launch a replacement while any child remains detached.`);
  }
  return lines;
}
function externalCliStepFacts(step, now) {
  if (step.runner?.type !== "external-cli") return void 0;
  const process2 = step.externalProcess;
  const elapsed = process2 ? process2.durationMs ?? Math.max(0, (process2.endedAt ?? now) - process2.startedAt) : void 0;
  return `external-cli${elapsed !== void 0 ? ` \xB7 ${formatDuration(elapsed)}` : ""}`;
}
function formatAsyncFleetLines(runs, now = Date.now()) {
  if (runs.length === 0) return [];
  const lines = ["Async runs:"];
  for (const run of runs) {
    const progress = formatAsyncRunProgressLabel(run);
    const activity = formatActivityFacts(run);
    const cwd = run.cwd ? shortenPath(run.cwd) : shortenPath(run.asyncDir);
    const pending = run.pendingAppends ? ` | ${run.pendingAppends} pending append${run.pendingAppends === 1 ? "" : "s"}` : "";
    const runContext = contextModeLabel(run.context);
    lines.push(`- ${run.id} | ${run.state}${activity ? ` | ${activity}` : ""} | ${run.mode}${runContext ? ` ${runContext}` : ""} | ${progress}${pending} | ${cwd}`);
    lines.push(`  status: subagent({ action: "status", id: "${run.id}" })`);
    lines.push(`  transcript: subagent({ action: "status", id: "${run.id}", options: { view: "transcript" } })`);
    for (const step of run.steps) {
      const display = fleetStepDisplayName(step);
      const stepContext = contextModeLabel(step.context);
      const phase = step.phase ? `[${step.phase}] ` : "";
      const stepActivity = formatActivityFacts(step);
      const modelThinking = formatModelThinking(step.model, step.thinking);
      const parts = [`${step.index}. ${phase}${display}${stepContext ? ` ${stepContext}` : ""}`, step.status, externalCliStepFacts(step, now), stepActivity, modelThinking].filter(Boolean);
      lines.push(`  ${parts.join(" | ")}`);
      const output = path3.join(run.asyncDir, `output-${step.index}.log`);
      if (fs3.existsSync(output)) lines.push(`    output: ${shortenPath(output)}`);
      if (step.sessionFile) lines.push(`    session: ${shortenPath(step.sessionFile)}`);
      if (step.status === "running" || step.recentOutput?.length || fs3.existsSync(output)) {
        lines.push(`    transcript: subagent({ action: "status", id: "${run.id}", options: { index: ${step.index}, view: "transcript" } })`);
      }
      lines.push(...formatNestedRunStatusLines(step.children, { indent: "    ", commandHints: true, maxLines: 12 }));
    }
    const attached = new Set(run.steps.flatMap((step) => step.children?.map((child) => child.id) ?? []));
    const unattached = run.nestedChildren?.filter((child) => !attached.has(child.id)) ?? [];
    lines.push(...formatNestedRunStatusLines(unattached, { indent: "  ", commandHints: true, maxLines: 12 }));
    if (run.error) lines.push(`  error: ${run.error}`);
    for (const warning of run.nestedWarnings ?? []) lines.push(`  warning: ${warning}`);
    const outputPath = formatAsyncRunOutputPath(run);
    if (outputPath) lines.push(`  output: ${shortenPath(outputPath)}`);
    if (run.sessionFile) lines.push(`  session: ${shortenPath(run.sessionFile)}`);
  }
  return lines;
}
function inspectSubagentFleet(_params, deps = {}) {
  if (deps.childSafe) {
    return {
      content: [{ type: "text", text: 'Child-safe subagent fleet view is unavailable without an explicit run id. Use subagent({ action: "status", id: "..." }) for the delegated run you can see.' }],
      isError: true,
      details: { mode: "management", results: [] }
    };
  }
  let asyncRuns;
  try {
    asyncRuns = listAsyncRuns(deps.asyncDirRoot ?? DIRS.async, {
      states: ["queued", "running"],
      sessionId: deps.state?.currentSessionId ?? void 0,
      resultsDir: deps.resultsDir ?? DIRS.results,
      kill: deps.kill,
      now: deps.now
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: message }], isError: true, details: { mode: "management", results: [] } };
  }
  const foregroundControls = deps.state ? [...deps.state.foregroundControls.values()] : [];
  const activeForegroundIds = new Set(foregroundControls.map((control) => control.runId));
  const detachedForegroundRuns = deps.state?.foregroundRuns ? [...deps.state.foregroundRuns.values()].filter((run) => run.sessionId === deps.state?.currentSessionId && !activeForegroundIds.has(run.runId) && run.children.some((child) => child.status === "detached")) : [];
  const total = foregroundControls.length + detachedForegroundRuns.length + asyncRuns.length;
  if (total === 0) {
    return {
      content: [{ type: "text", text: 'No active subagent fleet. Background runs that already finished are available through completion notifications or subagent({ action: "status", id: "..." }).' }],
      details: { mode: "management", results: [] }
    };
  }
  const lines = [`Subagent fleet: ${total} tracked`, ""];
  const foregroundLines = formatForegroundFleetLines(foregroundControls);
  if (foregroundLines.length) lines.push(...foregroundLines, "");
  const detachedForegroundLines = formatDetachedForegroundFleetLines(detachedForegroundRuns);
  if (detachedForegroundLines.length) lines.push(...detachedForegroundLines, "");
  const asyncLines = formatAsyncFleetLines(asyncRuns, deps.now?.() ?? Date.now());
  if (asyncLines.length) lines.push(...asyncLines, "");
  lines.push("Commands:");
  lines.push('  Refresh fleet: subagent({ action: "status", options: { view: "fleet" } })');
  lines.push('  Tail run transcript: subagent({ action: "status", id: "<run-id>", options: { view: "transcript" } })');
  lines.push('  Tail child transcript: subagent({ action: "status", id: "<run-id>", options: { index: 0, view: "transcript" } })');
  return { content: [{ type: "text", text: lines.join("\n").trimEnd() }], details: { mode: "management", results: [] } };
}
function validateTranscriptIndex(index, steps) {
  if (index === void 0) return void 0;
  if (!Number.isInteger(index)) throw new Error("Transcript index must be an integer.");
  if (index < 0 || index >= steps.length) throw new Error(`Transcript index ${index} is out of range for ${steps.length} child step${steps.length === 1 ? "" : "s"}.`);
  return index;
}
function selectTranscriptStep(status, options) {
  const steps = status.steps ?? [];
  let selectedIndex = validateTranscriptIndex(options.index, steps);
  if (selectedIndex === void 0) {
    if (status.state === "running" && typeof status.currentStep === "number" && status.currentStep >= 0 && status.currentStep < steps.length) {
      selectedIndex = status.currentStep;
    } else if (steps.length === 1) {
      selectedIndex = 0;
    }
  }
  const step = selectedIndex !== void 0 ? steps[selectedIndex] : void 0;
  const hint = options.index === void 0 && steps.length > 1 ? `Tip: pass index to inspect a specific child transcript (${steps.map((candidate, index) => `${index}=${fleetChildDisplayName(candidate)}`).join(", ")}).` : void 0;
  return { index: selectedIndex, step, hint };
}
function stepStateLine(mode, index, step) {
  if (index === void 0 || !step) return void 0;
  const modelThinking = formatModelThinking(step.model, step.thinking);
  const context = contextModeLabel(step.context);
  const parts = [
    `${mode === "parallel" ? "Agent" : "Step"}: ${index} (${fleetChildDisplayName(step)})${context ? ` ${context}` : ""}`,
    step.status,
    formatActivityFacts(step),
    modelThinking,
    step.error ? `error: ${step.error}` : void 0
  ].filter(Boolean);
  return parts.join(" | ");
}
function appendKnownArtifacts(lines, input) {
  const artifacts = [];
  for (const outputPath of input.outputPaths) artifacts.push(`Output: ${outputPath}`);
  if (input.sessionFile) artifacts.push(`Session: ${input.sessionFile}`);
  if (input.eventsPath) artifacts.push(`Events: ${input.eventsPath}`);
  if (input.logPath) artifacts.push(`Log: ${input.logPath}`);
  if (input.resultPath) artifacts.push(`Result: ${input.resultPath}`);
  if (!artifacts.length) return;
  lines.push("Artifacts:");
  for (const artifact of artifacts) lines.push(`  ${artifact}`);
}
function safeTranscriptLines(lines) {
  return lines.map((line) => safeTerminalText(line)).join("\n");
}
function appendTranscriptBody(lines, sourceLabel, sourceLines, truncated) {
  lines.push(`${sourceLabel}${truncated ? " (tail truncated)" : ""}:`);
  if (sourceLines.length === 0) {
    lines.push("  (no transcript lines available yet)");
    return;
  }
  const body = [];
  let bytes = 0;
  for (let index = sourceLines.length - 1; index >= 0; index--) {
    const safe = safeTerminalText(`  ${sourceLines[index]}`);
    const lineLimit = MAX_TRANSCRIPT_LINE_CHARS + 2;
    const line = safe.length <= lineLimit ? safe : truncateDisplayText(safe, lineLimit - TRANSCRIPT_LINE_OMISSION.length) + TRANSCRIPT_LINE_OMISSION;
    const size = Buffer.byteLength(line) + 1;
    if (bytes + size > MAX_TRANSCRIPT_BODY_BYTES) {
      const markerBytes = Buffer.byteLength(TRANSCRIPT_BODY_OMISSION) + 1;
      while (bytes + markerBytes > MAX_TRANSCRIPT_BODY_BYTES) bytes -= Buffer.byteLength(body.pop()) + 1;
      body.push(TRANSCRIPT_BODY_OMISSION);
      break;
    }
    body.push(line);
    bytes += size;
  }
  lines.push(...body.reverse());
}
function resolveWorkflowTranscriptChild(status, asyncDir, options) {
  if (status.mode !== "workflow" || options.index === void 0) return void 0;
  const step = status.steps?.[options.index];
  if (step?.async !== true || typeof step.runId !== "string" || !/^[A-Za-z0-9_-]+$/.test(step.runId) || step.runId === status.runId) return void 0;
  try {
    const asyncRoot = fs3.realpathSync(path3.dirname(asyncDir));
    const childDir = path3.join(asyncRoot, step.runId);
    if (fs3.realpathSync(childDir) !== childDir || fs3.lstatSync(path3.join(childDir, "status.json")).isSymbolicLink()) return void 0;
    const childStatus = readStatus(childDir);
    return childStatus?.runId === step.runId && childStatus.parentWorkflowRunId === status.runId && typeof step.workflowKey === "string" && step.workflowKey.length > 0 && childStatus.workflowKey === step.workflowKey && typeof status.sessionId === "string" && status.sessionId.length > 0 && childStatus.sessionId === status.sessionId ? { status: childStatus, asyncDir: childDir } : void 0;
  } catch (error) {
    if (isNotFoundError(error)) return void 0;
    throw error;
  }
}
function formatAsyncRunTranscript(status, asyncDir, options = {}) {
  const workflowChild = resolveWorkflowTranscriptChild(status, asyncDir, options);
  if (workflowChild) return formatAsyncRunTranscript(workflowChild.status, workflowChild.asyncDir, { ...options, index: void 0 });
  const lineLimit = transcriptLineLimit(options.lines);
  const selected = selectTranscriptStep(status, options);
  const stepOutputPath = selected.index !== void 0 ? path3.join(asyncDir, `output-${selected.index}.log`) : void 0;
  const runOutputPath = resolveMaybeRelative(asyncDir, status.outputFile);
  const logPath = path3.join(asyncDir, `subagent-log-${status.runId}.md`);
  const outputPaths = selected.index !== void 0 ? uniqueStrings([selected.step?.externalProcess?.finalOutputPath, stepOutputPath, runOutputPath && stepOutputPath && path3.resolve(runOutputPath) === path3.resolve(stepOutputPath) ? runOutputPath : void 0]) : uniqueStrings([runOutputPath]);
  const sessionFile = selected.index !== void 0 ? selected.step?.sessionFile : status.sessionFile;
  const eventsPath = path3.join(asyncDir, "events.jsonl");
  const context = contextModeLabel(status.context ?? summarizeContextModes((status.steps ?? []).map((step) => step.context)));
  const lines = [
    `Run: ${status.runId}`,
    `State: ${status.state}`,
    `Mode: ${status.mode}${context ? ` ${context}` : ""}`,
    stepStateLine(status.mode, selected.index, selected.step),
    selected.hint
  ].filter((line) => Boolean(line));
  appendKnownArtifacts(lines, { outputPaths: outputPaths.filter((outputPath) => fs3.existsSync(outputPath)), sessionFile, eventsPath: fs3.existsSync(eventsPath) ? eventsPath : void 0, logPath: fs3.existsSync(logPath) ? logPath : void 0 });
  const warnings = [];
  let transcriptLines = [];
  let transcriptSource = "Transcript tail";
  let truncated = false;
  const externalProcess = selected.step?.runner?.type === "external-cli" ? selected.step.externalProcess : void 0;
  const externalLogPaths = externalProcess ? [
    { path: externalProcess.stderrPath, label: "External stderr tail" },
    { path: externalProcess.stdoutPath, label: "External stdout tail" }
  ] : [];
  const runningExternal = selected.step?.status === "running" && externalProcess;
  const sources = runningExternal ? [...externalLogPaths, ...outputPaths.map((outputPath) => ({ path: outputPath, label: "Transcript tail" }))] : [...outputPaths.map((outputPath) => ({ path: outputPath, label: "Transcript tail" })), ...externalLogPaths];
  for (const source of sources) {
    const outputPath = source.path;
    const tail = readContainedTextTail(outputPath, lineLimit, [asyncDir], "output");
    if (tail.error) warnings.push(`Output read failed for ${tail.path}: ${tail.error}`);
    if (!tail.lines.some((line) => line.trim().length > 0)) continue;
    transcriptLines = tail.lines;
    transcriptSource = `${source.label} from ${tail.path}`;
    truncated = tail.truncated;
    break;
  }
  if (transcriptLines.length === 0 && selected.step?.recentOutput?.length) {
    transcriptLines = selected.step.recentOutput.slice(-lineLimit);
    transcriptSource = "Recent output from status.json";
  }
  if (transcriptLines.length === 0 && sessionFile) {
    const sessionTail = readSessionTranscriptTail(sessionFile, lineLimit, options.sessionRoots ?? [], options.trustedSessionFiles, options.trustedSessionFileRoot);
    transcriptLines = sessionTail.lines;
    warnings.push(...sessionTail.warnings);
    if (transcriptLines.length > 0) transcriptSource = `Session transcript tail from ${sessionFile}`;
  }
  if (warnings.length) {
    lines.push("Warnings:");
    for (const warning of warnings) lines.push(`  ${warning}`);
  }
  appendTranscriptBody(lines, transcriptSource, transcriptLines, truncated);
  return safeTranscriptLines(lines);
}
function formatNestedRunTranscript(run, options = {}) {
  if (run.asyncDir) {
    const status = readStatus(run.asyncDir);
    if (status) return formatAsyncRunTranscript(status, run.asyncDir, options);
  }
  const lineLimit = transcriptLineLimit(options.lines);
  const lines = [
    `Nested run: ${run.id}`,
    `State: ${run.state}`,
    run.mode ? `Mode: ${run.mode}` : void 0,
    run.sessionName?.trim() ? `Agent: ${run.sessionName.trim()}` : run.agent ? `Agent: ${run.agent}` : run.agents?.length ? `Agents: ${run.agents.join(", ")}` : void 0
  ].filter((line) => Boolean(line));
  appendKnownArtifacts(lines, { outputPaths: [], sessionFile: run.sessionFile });
  if (!run.sessionFile) {
    appendTranscriptBody(lines, "Transcript tail", [], false);
    return safeTranscriptLines(lines);
  }
  const sessionTail = readSessionTranscriptTail(run.sessionFile, lineLimit, options.sessionRoots ?? [], options.trustedSessionFiles, options.trustedSessionFileRoot);
  if (sessionTail.warnings.length) {
    lines.push("Warnings:");
    for (const warning of sessionTail.warnings) lines.push(`  ${warning}`);
  }
  appendTranscriptBody(lines, `Session transcript tail from ${run.sessionFile}`, sessionTail.lines, false);
  return safeTranscriptLines(lines);
}
function formatAsyncResultTranscript(data, resultPath, options = {}) {
  const lineLimit = transcriptLineLimit(options.lines);
  const runId = data.runId ?? data.id ?? path3.basename(resultPath, ".json");
  const children = Array.isArray(data.results) ? data.results : data.agent ? [{ agent: data.agent, sessionName: void 0, output: data.output, summary: data.summary, sessionFile: data.sessionFile, state: data.state, success: data.success, exitCode: data.exitCode }] : [];
  let index = options.index;
  if (index !== void 0 && !Number.isInteger(index)) throw new Error("Transcript index must be an integer.");
  if (index === void 0 && children.length === 1) index = 0;
  if (index !== void 0 && (index < 0 || index >= children.length)) throw new Error(`Transcript index ${index} is out of range for ${children.length} result child${children.length === 1 ? "" : "ren"}.`);
  const child = index !== void 0 ? children[index] : void 0;
  const output = index !== void 0 ? child?.output ?? child?.summary ?? (children.length === 1 ? data.output ?? data.summary : void 0) ?? "" : data.output ?? data.summary ?? "";
  const transcriptLines = output.split(/\r?\n/).slice(-lineLimit);
  const sessionFile = child?.sessionFile ?? data.sessionFile;
  const lines = [
    `Run: ${runId}`,
    `State: ${data.state ?? (data.success ? "complete" : "failed")}`,
    index !== void 0 && child ? `Child: ${index} (${fleetChildDisplayName(child)})` : void 0,
    index === void 0 && children.length > 1 ? `Tip: pass index to inspect a specific child transcript (${children.map((candidate, childIndex) => `${childIndex}=${fleetChildDisplayName(candidate)}`).join(", ")}).` : void 0
  ].filter((line) => Boolean(line));
  appendKnownArtifacts(lines, { outputPaths: [], sessionFile, resultPath });
  appendTranscriptBody(lines, "Result transcript tail", transcriptLines.filter((line) => line.trim()), output.split(/\r?\n/).length > lineLimit);
  return safeTranscriptLines(lines);
}

// src/runs/background/run-id-resolver.ts
import * as fs4 from "node:fs";
import * as path4 from "node:path";
function exactAsyncLocation(id, asyncDirRoot, resultsDir) {
  const asyncDir = path4.join(asyncDirRoot, id);
  const hasStatus = fs4.existsSync(path4.join(asyncDir, "status.json"));
  const resultPath = resultPathFor(resultsDir, id);
  if (!hasStatus && !resultPath) return void 0;
  return {
    asyncDir: hasStatus ? asyncDir : null,
    resultPath,
    resolvedId: id
  };
}
function readWorkflowResultIdentity(resultPath) {
  let parsed;
  try {
    parsed = JSON.parse(fs4.readFileSync(resultPath, "utf-8"));
  } catch {
    return void 0;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return void 0;
  const record = parsed;
  return {
    ...typeof record.id === "string" ? { id: record.id } : {},
    ...typeof record.runId === "string" ? { runId: record.runId } : {},
    ...typeof record.toolCallId === "string" ? { toolCallId: record.toolCallId } : {}
  };
}
function resultPathFor(resultsDir, runId) {
  const resultPath = resultPayloadPathForIndexedRun(resultsDir, runId) ?? resultFilePath(resultsDir, runId);
  return fs4.existsSync(resultPath) ? resultPath : null;
}
function toolCallIdMatches(value, query) {
  return value === query;
}
function indexedToolCallIdAsyncLocations(toolCallId, asyncDirRoot, resultsDir) {
  const byId = /* @__PURE__ */ new Map();
  for (const entry of [...readActiveRunToolCallIndex(asyncDirRoot, toolCallId), ...readTerminalRunToolCallIndex(asyncDirRoot, toolCallId)]) {
    const asyncDir = path4.join(asyncDirRoot, entry);
    const status = readStatus(asyncDir);
    if (!status || !toolCallIdMatches(status.toolCallId, toolCallId)) continue;
    const runId = status.runId || entry;
    byId.set(runId, { asyncDir, resultPath: resultPathFor(resultsDir, runId), resolvedId: runId });
  }
  for (const entry of resultCandidateFilesForToolCall(resultsDir, toolCallId)) {
    const runIdFromFile = entry.slice(0, -".json".length);
    const resultPath = resultPayloadPathForIndexedRun(resultsDir, runIdFromFile) ?? path4.join(resultsDir, entry);
    const identity = readWorkflowResultIdentity(resultPath);
    if (!identity || !toolCallIdMatches(identity.toolCallId, toolCallId)) continue;
    const runId = identity.runId ?? identity.id ?? runIdFromFile;
    const asyncDir = path4.join(asyncDirRoot, runId);
    byId.set(runId, { asyncDir: fs4.existsSync(asyncDir) ? asyncDir : null, resultPath, resolvedId: runId });
  }
  return [...byId.entries()].map(([id, location]) => ({ id, location }));
}
function foregroundIds(state) {
  if (!state) return [];
  const remembered = state.currentSessionId ? [...state.foregroundRuns?.values() ?? []].filter((run) => run.sessionId === state.currentSessionId).map((run) => run.runId) : [];
  return [.../* @__PURE__ */ new Set([...state.foregroundControls.keys(), ...remembered])];
}
function hasExactForegroundId(state, id) {
  if (!state) return false;
  if (state.foregroundControls.has(id)) return true;
  const remembered = state.foregroundRuns?.get(id);
  return Boolean(remembered && state.currentSessionId && remembered.sessionId === state.currentSessionId);
}
function exactLiveAsyncToolCallMatch(state, toolCallId, asyncDirRoot, resultsDir) {
  if (!state?.asyncJobs) return void 0;
  const matches = [...state.asyncJobs.values()].filter((job) => job.toolCallId === toolCallId);
  if (matches.length > 1) throw new Error(`Subagent tool-call id '${toolCallId}' is ambiguous across async runs. Use the returned asyncId instead.`);
  const match = matches[0];
  if (!match) return void 0;
  return {
    id: match.asyncId,
    location: {
      asyncDir: fs4.existsSync(match.asyncDir) ? match.asyncDir : path4.join(asyncDirRoot, match.asyncId),
      resultPath: resultPathFor(resultsDir, match.asyncId),
      resolvedId: match.asyncId
    }
  };
}
function nestedScopeFromState(state) {
  if (!state) return void 0;
  const routes = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (route) => {
    if (!route) return;
    const key = `${route.rootRunId}:${route.eventSink}:${route.controlInbox}`;
    if (seen.has(key)) return;
    seen.add(key);
    routes.push(route);
  };
  for (const control of state.foregroundControls.values()) add(control.nestedRoute);
  for (const job of state.asyncJobs.values()) add(job.nestedRoute);
  if (state.retainedNestedLookupRoutes?.sessionId === state.currentSessionId) {
    for (const route of state.retainedNestedLookupRoutes.routes.values()) add(route);
  }
  return { routes };
}
function asyncPrefixMatches(prefix, asyncDirRoot, resultsDir) {
  return findAsyncRunPrefixMatches(prefix, asyncDirRoot, resultsDir).filter(
    (match) => match.location.resultPath || match.location.asyncDir && fs4.existsSync(path4.join(match.location.asyncDir, "status.json"))
  );
}
function resolveSubagentRunId(id, deps = {}) {
  assertSafeNestedId("id", id);
  const asyncDirRoot = deps.asyncDirRoot ?? DIRS.async;
  const resultsDir = deps.resultsDir ?? DIRS.results;
  if (hasExactForegroundId(deps.state, id)) return { kind: "foreground", id };
  const exactAsync = exactAsyncLocation(id, asyncDirRoot, resultsDir);
  if (exactAsync) return { kind: "async", id, location: exactAsync };
  const toolCallMatches = new Map(indexedToolCallIdAsyncLocations(id, asyncDirRoot, resultsDir).map((match) => [match.id, match]));
  const exactLiveToolCallMatch = exactLiveAsyncToolCallMatch(deps.state, id, asyncDirRoot, resultsDir);
  if (exactLiveToolCallMatch) toolCallMatches.set(exactLiveToolCallMatch.id, exactLiveToolCallMatch);
  if (toolCallMatches.size > 1) throw new Error(`Subagent tool-call id '${id}' is ambiguous across async runs. Use the returned asyncId instead.`);
  const [toolCallMatch] = toolCallMatches.values();
  if (toolCallMatch) return { kind: "async", id: toolCallMatch.id, location: toolCallMatch.location };
  const nestedScope = deps.nested ?? nestedScopeFromState(deps.state);
  const exactNested = findNestedRunMatchesById(id, nestedScope ? { scope: nestedScope } : {});
  if (exactNested.length > 1) throw new Error(`Nested run id '${id}' is ambiguous across authorized registries. Provide the full id after stale registries are cleaned up.`);
  if (exactNested[0]) return { kind: "nested", id, match: exactNested[0] };
  const matches = [];
  for (const foregroundId of foregroundIds(deps.state).filter((candidate) => candidate.startsWith(id))) {
    matches.push({ kind: "foreground", id: foregroundId });
  }
  for (const match of asyncPrefixMatches(id, asyncDirRoot, resultsDir)) {
    matches.push({ kind: "async", id: match.id, location: match.location });
  }
  for (const match of findNestedRunMatchesById(id, nestedScope ? { prefix: true, scope: nestedScope } : { prefix: true })) {
    matches.push({ kind: "nested", id: match.run.id, match });
  }
  const unique = new Map(matches.map((match) => [`${match.kind}:${match.id}`, match]));
  const values = [...unique.values()];
  if (values.length > 1) {
    throw new Error(`Ambiguous subagent run id prefix '${id}' matched: ${values.map((match) => `${match.kind}:${match.id}`).join(", ")}. Provide a longer id.`);
  }
  return values[0];
}

// src/runs/foreground/async-stop-action.ts
import * as fs5 from "node:fs";
import * as path5 from "node:path";
function getAsyncStopTarget(state, runId, location) {
  if (location?.asyncDir) {
    return {
      asyncId: location.resolvedId ?? runId ?? path5.basename(location.asyncDir),
      asyncDir: location.asyncDir
    };
  }
  if (!runId) return void 0;
  const direct = state.asyncJobs.get(runId);
  return direct ? { asyncId: direct.asyncId, asyncDir: direct.asyncDir } : void 0;
}
function sealPausedRun(asyncDir, status, resultsDir) {
  const runnerProcessInstanceId = status.processTerminal?.runnerProcessInstanceId;
  if (!runnerProcessInstanceId) return "runner process identity is missing";
  const proof = readProcessTerminal(asyncDir, { runId: status.runId, runnerProcessInstanceId });
  if (proof?.state !== "observed" || proof.runId !== status.runId || proof.runnerProcessInstanceId !== runnerProcessInstanceId) {
    return `process-terminal proof is ${proof?.state === "unknown" ? `unknown (${proof.reason})` : proof?.state ?? "missing"}`;
  }
  if (!status.sessionId) return "session identity is missing";
  const existingResultPath = resultPayloadPathForSessionRun(resultsDir, status.sessionId, status.runId) ?? resultPayloadFileForSessionRun(resultsDir, status.sessionId, status.runId);
  let existingResult;
  if (!existingResultPath) {
    existingResult = {
      id: status.runId,
      mode: status.mode,
      sessionId: status.sessionId,
      asyncDir,
      ...status.completionOwnerId ? { completionOwnerId: status.completionOwnerId } : {},
      ...status.completionOwnerProcess ? { completionOwnerProcess: status.completionOwnerProcess } : {},
      ...status.parentWorkflowRunId ? { parentWorkflowRunId: status.parentWorkflowRunId } : {},
      ...status.toolCallId ? { toolCallId: status.toolCallId } : {},
      results: (status.steps ?? []).map((step) => ({
        agent: step.agent,
        success: step.status === "complete" || step.status === "completed",
        ...step.error ? { error: step.error } : {},
        ...step.exitCode !== void 0 ? { exitCode: step.exitCode } : {}
      }))
    };
  } else {
    try {
      const parsed = JSON.parse(fs5.readFileSync(existingResultPath, "utf-8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("result is not an object");
      existingResult = parsed;
    } catch (error) {
      return `paused result is unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  const resultRunId = typeof existingResult.runId === "string" ? existingResult.runId : existingResult.id;
  if (resultRunId !== status.runId || existingResult.sessionId !== status.sessionId) {
    return "paused result identity does not match the run";
  }
  const now = Date.now();
  const steps = (status.steps ?? []).map((step) => {
    if (step.status !== "pending" && step.status !== "running" && step.status !== "paused") return step;
    const { activityState: _activityState, ...rest } = step;
    return {
      ...rest,
      status: "stopped",
      error: SUBAGENT_STOPPED_MESSAGE,
      exitCode: 1,
      stopped: true,
      endedAt: now,
      durationMs: step.startedAt ? now - step.startedAt : 0,
      lastActivityAt: now
    };
  });
  const results = Array.isArray(existingResult.results) ? existingResult.results.map((entry, index) => {
    const stepState = status.steps?.[index]?.status;
    if (stepState !== "pending" && stepState !== "running" && stepState !== "paused" || !entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const { interrupted: _interrupted, ...result } = entry;
    return { ...result, output: SUBAGENT_STOPPED_MESSAGE, error: SUBAGENT_STOPPED_MESSAGE, success: false, exitCode: 1, stopped: true };
  }) : existingResult.results;
  const stoppedResult = {
    ...existingResult,
    success: false,
    state: "stopped",
    summary: SUBAGENT_STOPPED_MESSAGE,
    error: SUBAGENT_STOPPED_MESSAGE,
    stopped: true,
    exitCode: 1,
    timestamp: now,
    ...Array.isArray(existingResult.results) ? { results } : {}
  };
  const stoppedStatus = {
    ...status,
    state: "stopped",
    stopped: true,
    error: SUBAGENT_STOPPED_MESSAGE,
    endedAt: now,
    lastUpdate: now,
    steps
  };
  delete stoppedStatus.activityState;
  writeAsyncResultFile(resultFilePath(resultsDir, status.runId), stoppedResult);
  writeAtomicJson(path5.join(asyncDir, "status.json"), stoppedStatus);
  updateActiveRunIndex(asyncDir, "stopped", status.toolCallId, { retryCapacityErrors: true, terminalIndexBeforeRelease: true });
}
function deliverAsyncRunStop(input) {
  const { status, resultsDir = DIRS.results, ...delivery } = input;
  const pausedWholeRun = status.state === "paused" && delivery.childId === void 0 && delivery.targetIndex === void 0;
  if (!(pausedWholeRun && fs5.existsSync(stopInboxClosedPath(delivery.asyncDir)))) deliverStopRequest(delivery);
  if (pausedWholeRun) return sealPausedRun(delivery.asyncDir, status, resultsDir);
}
function stopAsyncRun(state, runId, kill, location, childId) {
  const target = getAsyncStopTarget(state, runId, location);
  const workflowRunId = target?.asyncId ?? runId;
  const workflowController = childId === void 0 && workflowRunId ? state.workflowControllers?.get(workflowRunId) : void 0;
  const workflowAsyncDir = workflowController && workflowRunId ? target?.asyncDir ?? state.asyncJobs.get(workflowRunId)?.asyncDir : void 0;
  const workflowStatus = workflowAsyncDir ? readStatus(workflowAsyncDir) : void 0;
  const foreignWorkflow = Boolean(state.currentSessionId && workflowStatus && workflowStatus.sessionId !== state.currentSessionId);
  if (workflowController && workflowRunId && !foreignWorkflow) {
    if (workflowStatus) stopStoppableAsyncStatusChildren(workflowStatus, state.workflowChildStops?.get(workflowRunId), "Workflow stopped.");
    workflowController.abort(new Error("Workflow stopped."));
    return { content: [{ type: "text", text: `Stop requested for async workflow ${workflowRunId}.` }], details: { mode: "management", results: [] } };
  }
  if (!target) return null;
  const status = reconcileAsyncRun(target.asyncDir, { kill }).status;
  if (state.currentSessionId && !ownsRun(state.currentSessionId, status?.sessionId) && location?.reattachedRunId !== target.asyncId) {
    return {
      content: [{ type: "text", text: `Async run '${target.asyncId}' was not found in the active session.` }],
      isError: true,
      details: { mode: "management", results: [] }
    };
  }
  const pausedWholeRun = status?.state === "paused" && childId === void 0;
  if (!status || status.state !== "running" && status.state !== "queued" && !pausedWholeRun) {
    return {
      content: [{ type: "text", text: `No running or queued async run was found for '${runId ?? "current"}'.` }],
      isError: true,
      details: { mode: "management", results: [] }
    };
  }
  let child;
  if (childId !== void 0) {
    const resolution = resolveAsyncStatusChild(status, childId);
    if (!resolution.ok) {
      return {
        content: [{ type: "text", text: resolution.message }],
        isError: true,
        details: { mode: "management", results: [] }
      };
    }
    child = resolution.child;
    if (!isStoppableAsyncStatusStep(child.step)) {
      return {
        content: [{ type: "text", text: `Child '${childId}' in async run '${status.runId}' is ${child.step.status}; stop only supports pending or running children.` }],
        isError: true,
        details: { mode: "management", results: [] }
      };
    }
  }
  try {
    const failure = deliverAsyncRunStop({ asyncDir: target.asyncDir, status, pid: typeof status.pid === "number" ? status.pid : void 0, kill, source: "stop-action", targetIndex: child?.index, childId: child?.id ?? childId });
    if (failure) {
      return {
        content: [{ type: "text", text: `Stop request persisted for paused async run ${target.asyncId}, but terminal proof is not ready (${failure}). Retry stop after runner shutdown is observed.` }],
        isError: true,
        details: { mode: "management", results: [] }
      };
    }
    const tracked = state.asyncJobs.get(target.asyncId);
    if (tracked) {
      tracked.activityState = void 0;
      tracked.updatedAt = Date.now();
    }
    return {
      content: [{ type: "text", text: pausedWholeRun ? `Stopped paused async run ${target.asyncId}.` : child ? `Stop requested for child ${child.id} in async run ${target.asyncId}.` : `Stop requested for async run ${target.asyncId}.` }],
      details: { mode: "management", results: [] }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Failed to stop async run ${target.asyncId}: ${message}` }],
      isError: true,
      details: { mode: "management", results: [] }
    };
  }
}

// src/runs/foreground/foreground-history.ts
import * as fs6 from "node:fs";
import * as path6 from "node:path";
var MAX_REMEMBERED_FOREGROUND_RUNS = 50;
var FOREGROUND_OWNER_EXITED_STOP_ERROR = "Subagent stopped because the Pi process that ran it exited before the run finished.";
var MAX_INLINE_OUTPUT_BYTES = 64 * 1024;
var MAX_RESUME_CONTRACT_BYTES = 64 * 1024;
function historyDir(resultsDir) {
  return path6.join(resultsDir, "foreground-history");
}
function runHistoryPath(resultsDir, runId) {
  return path6.join(historyDir(resultsDir), `${encodeIndexSegment(runId)}.json`);
}
function boundedTail(value) {
  return utf8Tail(value, MAX_INLINE_OUTPUT_BYTES).text;
}
function compactChild(child) {
  const outputPath = child.artifactPaths?.outputPath ?? child.savedOutputPath;
  return {
    agent: child.agent,
    index: child.index,
    ...child.sessionName ? { sessionName: child.sessionName } : {},
    ...child.context ? { context: child.context } : {},
    ...child.sessionFile ? { sessionFile: child.sessionFile } : {},
    ...child.model ? { model: child.model } : {},
    ...child.thinking ? { thinking: child.thinking } : {},
    status: child.status,
    ...child.activityState ? { activityState: child.activityState } : {},
    ...child.lastActivityAt !== void 0 ? { lastActivityAt: child.lastActivityAt } : {},
    ...child.currentTool ? { currentTool: child.currentTool } : {},
    ...child.currentToolStartedAt !== void 0 ? { currentToolStartedAt: child.currentToolStartedAt } : {},
    ...child.currentPath ? { currentPath: child.currentPath } : {},
    ...child.turnCount !== void 0 ? { turnCount: child.turnCount } : {},
    ...child.tokens !== void 0 ? { tokens: child.tokens } : {},
    ...child.toolCount !== void 0 ? { toolCount: child.toolCount } : {},
    ...child.exitCode !== void 0 ? { exitCode: child.exitCode } : {},
    ...child.error ? { error: child.error } : {},
    ...!outputPath && child.finalOutput ? { finalOutput: boundedTail(child.finalOutput) } : {},
    ...child.outputState ? { outputState: child.outputState } : {},
    ...child.outputPartial ? { outputPartial: true } : {},
    ...child.outputMode ? { outputMode: child.outputMode } : {},
    ...child.savedOutputPath ? { savedOutputPath: child.savedOutputPath } : {},
    ...child.outputSaveError ? { outputSaveError: child.outputSaveError } : {},
    ...child.artifactPaths ? { artifactPaths: child.artifactPaths } : {},
    ...child.transcriptPath ? { transcriptPath: child.transcriptPath } : {},
    ...child.transcriptError ? { transcriptError: child.transcriptError } : {},
    ...child.acceptance ? { acceptance: child.acceptance } : {},
    ...child.resumeContract ? { resumeContract: child.resumeContract } : {},
    ...child.launchContractDigest ? { launchContractDigest: child.launchContractDigest } : {},
    ...child.extensionBindings ? { extensionBindings: child.extensionBindings } : {},
    ...child.requiredExtensions ? { requiredExtensions: child.requiredExtensions } : {},
    ...child.capabilityCeiling ? { capabilityCeiling: child.capabilityCeiling } : {},
    ...child.updatedAt !== void 0 ? { updatedAt: child.updatedAt } : {}
  };
}
function isRestorableForegroundStatus(status) {
  return status === "completed" || status === "failed" || status === "paused" || status === "stopped";
}
function hasRunningChild(run) {
  return run.children.some((child) => child.status === "running");
}
function isAdmittedChildStatus(run, status) {
  return isRestorableForegroundStatus(status) || status === "running" && run.mode === "single" && isRecordedPid(run.owner);
}
function isRestorableResumeContract(value) {
  if (value === void 0) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_RESUME_CONTRACT_BYTES) return false;
    validateModelResponseAliases(value?.modelResponseAliases);
  } catch {
    return false;
  }
  const contract = value;
  if (Object.keys(contract).some((key) => !["modelResponseAliases", "outputSchema", "agentContract", "acceptance", "output", "outputMode"].includes(key))) return false;
  if (contract.outputSchema !== void 0 && contract.outputSchema !== false && (!contract.outputSchema || typeof contract.outputSchema !== "object" || Array.isArray(contract.outputSchema))) return false;
  if (contract.agentContract !== void 0 && (!contract.agentContract || typeof contract.agentContract !== "object" || Array.isArray(contract.agentContract) || contract.agentContract.version !== 1)) return false;
  if (validateAcceptanceInput(contract.acceptance).length > 0) return false;
  if (contract.output !== void 0 && typeof contract.output !== "string" && typeof contract.output !== "boolean") return false;
  return contract.outputMode === void 0 || contract.outputMode === "inline" || contract.outputMode === "file-only";
}
function compactRun(run) {
  if (!run.sessionId) return void 0;
  if (run.children.length === 0 || !run.children.every((child) => isAdmittedChildStatus(run, child.status) && isRestorableResumeContract(child.resumeContract))) return void 0;
  const running = hasRunningChild(run);
  return {
    runId: run.runId,
    mode: run.mode,
    cwd: run.cwd,
    sessionId: run.sessionId,
    updatedAt: run.updatedAt,
    children: run.children.map(compactChild),
    ...running ? { owner: run.owner } : {},
    ...run.parentWorkflowRunId ? { parentWorkflowRunId: run.parentWorkflowRunId } : {}
  };
}
function readRunFile(filePath) {
  try {
    const parsed = JSON.parse(fs6.readFileSync(filePath, "utf-8"));
    return isRestorableRun(parsed) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function historyFiles(dir) {
  try {
    return fs6.readdirSync(dir).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
}
function isRestorableRun(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const run = value;
  return typeof run.runId === "string" && Boolean(run.runId) && (run.mode === "single" || run.mode === "parallel" || run.mode === "chain") && typeof run.cwd === "string" && Boolean(run.cwd) && typeof run.sessionId === "string" && Boolean(run.sessionId) && typeof run.updatedAt === "number" && Number.isFinite(run.updatedAt) && Array.isArray(run.children) && run.children.length > 0 && (run.owner === void 0 || isRecordedPid(run.owner)) && (run.parentWorkflowRunId === void 0 || typeof run.parentWorkflowRunId === "string") && run.children.every((child) => Boolean(child && typeof child === "object" && !Array.isArray(child) && typeof child.agent === "string" && typeof child.index === "number" && isRestorableResumeContract(child.resumeContract) && isAdmittedChildStatus(run, child.status)));
}
function pruneHistory(dir, limit) {
  const files = historyFiles(dir);
  if (files.length <= limit) return;
  const byAge = files.flatMap((name) => {
    try {
      return [{ name, mtimeMs: fs6.statSync(path6.join(dir, name)).mtimeMs }];
    } catch {
      return [];
    }
  }).sort((left, right) => left.mtimeMs - right.mtimeMs);
  for (const { name, mtimeMs } of byAge.slice(0, byAge.length - limit)) {
    const filePath = path6.join(dir, name);
    const run = readRunFile(filePath);
    if (run && hasRunningChild(run) && !ownerConfirmedDead(run)) continue;
    try {
      if (fs6.statSync(filePath).mtimeMs !== mtimeMs) continue;
    } catch {
      continue;
    }
    fs6.rmSync(filePath, { force: true });
  }
}
function persistForegroundRun(run, options = {}) {
  const compact = compactRun(run);
  if (!compact) return;
  const resultsDir = options.resultsDir ?? DIRS.results;
  const dir = historyDir(resultsDir);
  if (!fs6.existsSync(dir)) {
    fs6.mkdirSync(dir, { recursive: true });
    fs6.rmSync(path6.join(resultsDir, "foreground-history.json"), { force: true });
  }
  writePrivateAtomicJson(runHistoryPath(resultsDir, compact.runId), compact);
  pruneHistory(dir, options.limit ?? MAX_REMEMBERED_FOREGROUND_RUNS);
}
function discardRunningForegroundRun(runId, options = {}) {
  const filePath = runHistoryPath(options.resultsDir ?? DIRS.results, runId);
  const run = readRunFile(filePath);
  if (run && hasRunningChild(run) && run.owner?.pid === process.pid) fs6.rmSync(filePath, { force: true });
}
function ownerConfirmedDead(run) {
  return checkRecordedPidLiveness(run.owner) === "dead";
}
function restoreInterruptedRun(run) {
  if (!ownerConfirmedDead(run)) return void 0;
  const { owner: _owner, ...rest } = run;
  return {
    ...rest,
    children: run.children.map((child) => {
      if (child.status !== "running") return child;
      const { activityState: _activityState, currentTool: _currentTool, currentToolStartedAt: _currentToolStartedAt, currentPath: _currentPath, sessionFile, ...stopped } = child;
      return {
        ...stopped,
        status: "stopped",
        exitCode: 1,
        error: FOREGROUND_OWNER_EXITED_STOP_ERROR,
        finalOutput: FOREGROUND_OWNER_EXITED_STOP_ERROR,
        ...sessionFile && fs6.existsSync(sessionFile) ? { sessionFile } : {}
      };
    })
  };
}
function foregroundChildStateLabel(run, child) {
  if (child.status !== "stopped" || child.error !== FOREGROUND_OWNER_EXITED_STOP_ERROR) return child.status;
  return child.sessionFile ? `interrupted when Pi exited \xB7 resume ${run.runId}` : "interrupted when Pi exited";
}
function restoreForegroundRunHistory(state, options = {}) {
  const sessionId = options.sessionId ?? state.currentSessionId;
  if (!sessionId) return 0;
  const dir = historyDir(options.resultsDir ?? DIRS.results);
  const saved = historyFiles(dir).flatMap((name) => readRunFile(path6.join(dir, name)) ?? []);
  if (options.observeForeign) {
    for (const run of saved) if (run.sessionId !== sessionId && hasRunningChild(run)) options.observeForeign(run);
  }
  const runs = saved.filter((run) => run.sessionId === sessionId).sort((left, right) => right.updatedAt - left.updatedAt).slice(0, options.limit ?? MAX_REMEMBERED_FOREGROUND_RUNS);
  state.foregroundRuns ??= /* @__PURE__ */ new Map();
  let restored = 0;
  for (const run of runs) {
    if (state.foregroundRuns.has(run.runId)) continue;
    const loaded = hasRunningChild(run) ? restoreInterruptedRun(run) : run;
    if (!loaded) continue;
    state.foregroundRuns.set(run.runId, loaded);
    restored += 1;
  }
  return restored;
}

export {
  resolveGitRepositoryIdentity,
  resolveWorkflowChatProgress,
  buildWorkflowChatProgressRows,
  isTrustedRecordedSessionFile,
  readSessionMessagesTail,
  inspectSubagentFleet,
  formatAsyncRunTranscript,
  formatNestedRunTranscript,
  formatAsyncResultTranscript,
  resolveSubagentRunId,
  deliverAsyncRunStop,
  stopAsyncRun,
  MAX_REMEMBERED_FOREGROUND_RUNS,
  persistForegroundRun,
  discardRunningForegroundRun,
  ownerConfirmedDead,
  foregroundChildStateLabel,
  restoreForegroundRunHistory
};
