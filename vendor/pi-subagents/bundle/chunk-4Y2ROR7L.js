import {
  buildWorkflowChatProgressRows
} from "./chunk-FXUXCX2K.js";
import {
  aggregateStepStatus,
  contextModeBadge,
  contextModeLabel,
  contextModePrefix,
  formatActivityLabel,
  formatAgentRunningLabel,
  formatNestedAggregate,
  formatParallelOutcome,
  formatWorkflowChecklistBottleneck,
  formatWorkflowChecklistPhase,
  formatWorkflowChecklistSummary,
  formatWorkflowPreflight,
  formatWorkflowPreflightPlanSummary,
  formatWorkflowPreflightWarningSummary,
  formatWorkflowPreflightWarnings,
  isStaleExtensionContextError,
  isUnboundExtensionRuntimeError,
  ownerSessionIds,
  projectAsyncStatusSnapshot,
  projectAsyncWorkflowRows,
  projectWorkflowChecklist,
  withCachedUiContext,
  workflowGraphStageNodes
} from "./chunk-6XJB7PIX.js";
import {
  flatToLogicalStepIndex,
  formatWorkflowJsonPreview,
  hostStepReportName,
  hostStepVerdictLabel
} from "./chunk-46XKCPJR.js";
import {
  snapshotExternalRuns
} from "./chunk-UKG4V45O.js";
import {
  PROMPT_REDACTED,
  childThinkingLevel,
  formatContextUsage,
  formatDuration,
  formatModelThinking,
  formatTokenUsage,
  formatTokens,
  formatToolCall,
  formatUsage,
  getDisplayItems,
  getSingleResultOutput,
  shortenPath,
  unresolvedChildWatchdogBlockers
} from "./chunk-CIZQXJ5Q.js";
import {
  MAX_WIDGET_JOBS,
  WIDGET_ANIMATION_INTERVAL_MS,
  WIDGET_KEY
} from "./chunk-5LFLVSTM.js";
import {
  previewDisplayText,
  sanitizeDisplayText,
  truncateDisplayText
} from "./chunk-YFCK7H2S.js";

// src/tui/running-tone.ts
var mainThinkingLevelSource = () => void 0;
function setMainThinkingLevelSource(source) {
  mainThinkingLevelSource = source;
}
function readMainThinkingLevel(read) {
  try {
    return read();
  } catch (error) {
    if (isStaleExtensionContextError(error) || isUnboundExtensionRuntimeError(error)) return void 0;
    throw error;
  }
}
function runningTone(theme, childLevel) {
  const level = childLevel ?? mainThinkingLevelSource();
  return level ? theme.getThinkingBorderColor(level) : (text) => theme.fg("accent", text);
}

// src/tui/render.ts
import * as path from "node:path";
import { createHash } from "node:crypto";
import { getMarkdownTheme, keyText } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text, visibleWidth as visibleWidth2 } from "@earendil-works/pi-tui";

// src/shared/shortcuts.ts
function formatShortcutLabel(shortcut) {
  return shortcut.split("+").map((part) => {
    const normalized = part.trim().toLowerCase();
    if (normalized === "ctrl") return "Ctrl";
    if (normalized === "alt") return "Alt";
    if (normalized === "shift") return "Shift";
    if (normalized === "super") return "Super";
    return normalized.length === 1 ? normalized.toUpperCase() : part.trim();
  }).join("+");
}

// src/tui/render-helpers.ts
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
function stripRepeatedAgentPrefix(label, jobName) {
  const value = label.trim();
  const prefix = jobName?.trim();
  if (!prefix || !value.startsWith(prefix)) return value;
  const suffix = value.slice(prefix.length);
  if (!suffix || !/^(?::|·|\s)/u.test(suffix)) return value;
  return suffix.replace(/^\s*(?::|·)?\s*/u, "").trim();
}
function shouldSuppressSingleStep(chainStepCount, stepsTotal) {
  return (chainStepCount ?? stepsTotal) === 1;
}
function withDuplicateLabelDiscriminators(rows, total) {
  const counts = /* @__PURE__ */ new Map();
  for (const row of rows) counts.set(row.displayName, (counts.get(row.displayName) ?? 0) + 1);
  return rows.map((row) => ({
    ...row,
    rowLabel: (counts.get(row.displayName) ?? 0) > 1 ? `Agent ${row.index + 1}/${total}: ${row.displayName}` : row.displayName
  }));
}

// src/runs/background/async-status-snapshot.ts
var ASYNC_STATUS_SNAPSHOT_WIDGET_PREFIX = "PI_SUBAGENT_ASYNC_JSON:";
function asyncStatusSnapshotJobsForState(state, sessionId) {
  if (!state || !sessionId || state.currentSessionId !== sessionId) return [];
  const owners = ownerSessionIds(sessionId);
  const jobs = /* @__PURE__ */ new Map();
  for (const job of state.asyncJobs.values()) {
    if (owners.has(job.sessionId)) jobs.set(job.asyncId, job);
  }
  for (const job of state.fleetJobs?.values() ?? []) {
    if (owners.has(job.sessionId) && !jobs.has(job.asyncId)) jobs.set(job.asyncId, job);
  }
  return [...jobs.values()];
}
function buildAsyncStatusSnapshotForState(state, sessionId, options = {}) {
  return projectAsyncStatusSnapshot(asyncStatusSnapshotJobsForState(state, sessionId), options);
}
function encodeAsyncStatusSnapshotWidget(jobs, options = {}) {
  return [`${ASYNC_STATUS_SNAPSHOT_WIDGET_PREFIX}${JSON.stringify(projectAsyncStatusSnapshot(jobs, options))}`];
}

// src/tui/render.ts
function resolveMainWindowRenderLayout(config) {
  return {
    horizontalSpacing: config?.horizontalSpacing ?? 2,
    ...config?.compactResultMaxLines !== void 0 ? { compactResultMaxLines: config.compactResultMaxLines } : {}
  };
}
function mainWindowIndent(layout, level) {
  return " ".repeat(Math.max(0, layout.horizontalSpacing * level));
}
function capCompactMainWindowResult(component, layout, theme, enabled) {
  const maxLines = layout.compactResultMaxLines;
  if (!enabled || maxLines === void 0) return component;
  const capped = new Container();
  capped.render = (width) => {
    const lines = component.render(width);
    if (lines.length <= maxLines) return lines;
    const visibleRows = maxLines === 1 ? 1 : maxLines - 1;
    const hiddenCount = lines.length - visibleRows;
    const hint = theme.fg("accent", `\u2026 ${hiddenCount} rows hidden \xB7 ${expandKeyHint("to expand")}`);
    if (maxLines === 1) return [truncLine(`${lines[0] ?? ""} ${hint}`, width)];
    return [...lines.slice(0, visibleRows), truncLine(hint, width)];
  };
  return capped;
}
function expandKeyHint(action) {
  return `Press ${keyText("app.tools.expand") || "the expand key"} ${action}`;
}
function liveDetailHintText() {
  return expandKeyHint("for live detail");
}
function workflowDetailHintText() {
  return expandKeyHint("for details");
}
function foregroundSingleHintText(shortcut) {
  if (!shortcut) return liveDetailHintText();
  const label = formatShortcutLabel(shortcut);
  return `${liveDetailHintText()} \xB7 ${label} to run in background`;
}
function getTermWidth() {
  return process.stdout.columns || 120;
}
var segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
var ansiStylePattern = /\x1b\[[0-9;]*m/y;
function truncLine(text, maxWidth) {
  if (maxWidth <= 0) return "";
  if (visibleWidth2(text) <= maxWidth) return text;
  const targetWidth = maxWidth - 1;
  let result = "";
  let currentWidth = 0;
  let activeStyles = [];
  let i = 0;
  while (i < text.length) {
    ansiStylePattern.lastIndex = i;
    const ansiMatch = ansiStylePattern.exec(text);
    if (ansiMatch) {
      const code = ansiMatch[0];
      result += code;
      if (code === "\x1B[0m" || code === "\x1B[m") {
        activeStyles = [];
      } else {
        activeStyles.push(code);
      }
      i += code.length;
      continue;
    }
    let end = text.indexOf("\x1B[", i);
    if (end === i) end = text.indexOf("\x1B[", i + 2);
    if (end === -1) end = text.length;
    const textPortion = text.slice(i, end);
    for (const seg of segmenter.segment(textPortion)) {
      const grapheme = seg.segment;
      const graphemeWidth = grapheme === "\x1B" ? 0 : visibleWidth2(grapheme);
      if (currentWidth + graphemeWidth > targetWidth) {
        return result + activeStyles.join("") + "\u2026";
      }
      result += grapheme;
      currentWidth += graphemeWidth;
    }
    i = end;
  }
  return result + activeStyles.join("") + "\u2026";
}
function wrapPlainText(text, maxWidth) {
  if (maxWidth <= 0) return [""];
  const lines = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    let currentWidth = 0;
    for (const seg of segmenter.segment(rawLine)) {
      const grapheme = seg.segment;
      const graphemeWidth = visibleWidth2(grapheme);
      if (graphemeWidth > maxWidth) continue;
      if (currentWidth > 0 && currentWidth + graphemeWidth > maxWidth) {
        lines.push(current);
        current = grapheme;
        currentWidth = graphemeWidth;
        continue;
      }
      current += grapheme;
      currentWidth += graphemeWidth;
    }
    lines.push(current);
  }
  return lines;
}
var RUNNING_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
var STATIC_RUNNING_GLYPH = "\u25CF";
function runningSeed(...values) {
  let seed;
  for (const value of values) {
    if (value === void 0 || !Number.isFinite(value)) continue;
    seed = (seed ?? 0) + Math.trunc(value);
  }
  return seed;
}
function runningGlyph(seed) {
  if (seed === void 0) return STATIC_RUNNING_GLYPH;
  return RUNNING_FRAMES[Math.abs(seed) % RUNNING_FRAMES.length];
}
function animatedSeed(seed, frame) {
  if (frame === void 0) return seed;
  return (seed ?? 0) + frame;
}
function progressRunningSeed(progress) {
  if (!progress) return void 0;
  return runningSeed(
    progress.index,
    progress.toolCount,
    progress.tokens,
    progress.durationMs,
    progress.lastActivityAt,
    progress.currentToolStartedAt,
    progress.turnCount
  );
}
function clearLegacyResultAnimationTimer(context) {
  const timer = context.state.subagentResultAnimationTimer;
  if (!timer) return;
  clearInterval(timer);
  context.state.subagentResultAnimationTimer = void 0;
}
function extractOutputTarget(task) {
  const writeToMatch = task.match(/\[Write to:\s*([^\]\n]+)\]/i);
  if (writeToMatch?.[1]?.trim()) return writeToMatch[1].trim();
  const findingsMatch = task.match(/Write your findings to(?: exactly this path)?:\s*([^\r\n]+)/i);
  if (findingsMatch?.[1]?.trim()) return findingsMatch[1].trim();
  const outputMatch = task.match(/[Oo]utput(?:\s+to)?\s*:\s*(\S+)/i);
  if (outputMatch?.[1]?.trim()) return outputMatch[1].trim();
  return void 0;
}
function hasEmptyTextOutputWithoutOutputTarget(task, output) {
  if (output.trim()) return false;
  return !extractOutputTarget(task);
}
function getToolCallLines(result, expanded) {
  if (result.messages) {
    return getDisplayItems(result.messages).filter((item) => item.type === "tool").map((item) => formatToolCall(item.name, item.args, expanded));
  }
  return result.toolCalls?.map((toolCall) => expanded ? toolCall.expandedText : toolCall.text) ?? [];
}
var ansiEscapePattern = /\x1b\[[0-9;]*m/g;
var noisyStatusPatterns = [
  /^(?:i|we)\s+(?:will|need|can|should|am|are)\b/i,
  /^i(?:'m|’m| am)\b/i,
  /\bso i (?:will|need|can)\b/i,
  /^(?:checking|fetching|reading|inspecting|verifying|collecting|confirming|polling)\b/i,
  /^(?:async\s+subagent\s+)?[\w.-]+\s*·\s*(?:step|agent)\s+\d+\/\d+\s*·/i,
  /^(?:Step|Agent)\s+\d+\/\d+:\s+[\w.-]+\s*·\s*(?:running|queued|pending|complete|completed)\b/i,
  /^(?:async\s+subagent\s+)?[\w.-]+(?:\s+\[(?:fresh|fork|mixed)\])?\s*·\s*(?:running|queued|pending|complete|completed|done)\b/i,
  /^Press\s+\S+\s+for\s+live\s+detail$/i,
  /^output:\s+.+\/async-subagent-runs\//i
];
var liveOutputWordSignalPattern = /\b(?:access denied|denied|error|exception|fail(?:ed|ure)?|fatal|panic|rejected|timeout|timed out|unable|warning)\b/i;
var liveOutputCodeSignalPattern = /\bE[A-Z0-9_]{2,}\b/;
function oneLine(text) {
  return text.replace(ansiEscapePattern, "").replace(/\s+/g, " ").trim();
}
var COMPACT_TASK_MAX_CHARS = 96;
function childDisplayName(result, fallback = "subagent") {
  return result?.sessionName?.trim() || result?.agent || fallback;
}
function compactTaskText(task, label) {
  const taskText = task?.trim();
  const labelText = label?.trim();
  const normalizedTask = taskText && taskText !== PROMPT_REDACTED ? oneLine(taskText) : "";
  const normalizedLabel = labelText && labelText !== PROMPT_REDACTED ? oneLine(labelText) : "";
  const normalized = normalizedLabel && normalizedTask && normalizedLabel !== normalizedTask ? `${normalizedLabel} \u2014 ${normalizedTask}` : normalizedLabel || normalizedTask;
  if (!normalized) return void 0;
  return previewDisplayText(normalized, COMPACT_TASK_MAX_CHARS);
}
var LANE_VALUE_MAX_CHARS = 48;
function boundedLaneValue(value, maxChars = LANE_VALUE_MAX_CHARS) {
  if (!value?.trim() || value.trim() === PROMPT_REDACTED) return void 0;
  return previewDisplayText(oneLine(value), maxChars);
}
function workflowNodeStepStatus(status) {
  switch (status) {
    case "completed":
      return "completed";
    case "detached":
      return "paused";
    default:
      return status;
  }
}
function workflowNodeStatusLabel(status) {
  switch (status) {
    case "completed":
      return "complete";
    case "detached":
      return "paused";
    default:
      return status;
  }
}
function workflowStepPriority(step, currentNodeId) {
  const isCurrent = step.workflowKey === currentNodeId;
  if (step.status === "running" || isCurrent && step.status !== "complete" && step.status !== "completed") return 0;
  const gate = laneGate(step);
  if (step.status === "failed" || step.status === "partial" || step.status === "paused" || step.status === "stopped" || step.status === "rejected" || step.toolBudgetBlocked === true || step.turnBudgetExceeded === true || step.activityState === "needs_attention" || step.watchdog?.phase === "stale" || unresolvedChildWatchdogBlockers(step.watchdog).length > 0 || gate !== void 0) return 1;
  if (step.status === "pending") return 2;
  return 3;
}
function workflowWidgetSteps(job, planned = job.mode === "workflow" ? workflowGraphStageNodes(job.workflowGraph) : []) {
  const loaded = job.steps ?? [];
  if (planned.length === 0) return loaded;
  const loadedIndexesByKey = /* @__PURE__ */ new Map();
  for (const [index, step] of loaded.entries()) {
    if (!step.workflowKey) continue;
    const indexes = loadedIndexesByKey.get(step.workflowKey) ?? [];
    indexes.push(index);
    loadedIndexesByKey.set(step.workflowKey, indexes);
  }
  const consumed = /* @__PURE__ */ new Set();
  const entries = [];
  for (const [order, node] of planned.entries()) {
    const loadedIndex = loadedIndexesByKey.get(node.id)?.find((index) => !consumed.has(index));
    if (loadedIndex !== void 0) {
      consumed.add(loadedIndex);
      const loadedStep = loaded[loadedIndex];
      entries.push({
        step: {
          ...loadedStep,
          index: node.flatIndex ?? loadedStep.index ?? order,
          agent: loadedStep.agent || node.agent || job.agents?.[0] || "workflow",
          phase: loadedStep.phase ?? node.phase,
          label: loadedStep.label ?? node.label,
          workflowKey: loadedStep.workflowKey ?? node.id,
          ...loadedStep.outputName === void 0 && node.outputName !== void 0 ? { outputName: node.outputName } : {},
          ...loadedStep.structured === void 0 && node.structured !== void 0 ? { structured: node.structured } : {},
          ...loadedStep.error === void 0 && node.error !== void 0 ? { error: node.error } : {}
        },
        order
      });
      continue;
    }
    entries.push({
      step: {
        index: node.flatIndex ?? order,
        agent: node.agent ?? job.agents?.[0] ?? "workflow",
        status: workflowNodeStepStatus(node.status),
        workflowKey: node.id,
        label: node.label,
        ...node.phase ? { phase: node.phase } : {},
        ...node.outputName ? { outputName: node.outputName } : {},
        ...node.structured !== void 0 ? { structured: node.structured } : {},
        ...node.error ? { error: node.error } : {}
      },
      order
    });
  }
  for (const [index, step] of loaded.entries()) {
    if (!consumed.has(index)) entries.push({ step, order: planned.length + index });
  }
  entries.sort((left, right) => workflowStepPriority(left.step, job.workflowGraph?.currentNodeId) - workflowStepPriority(right.step, job.workflowGraph?.currentNodeId) || left.order - right.order);
  return entries.map(({ step }) => step);
}
function workflowStageProgress(job, stages = job.mode === "workflow" ? workflowGraphStageNodes(job.workflowGraph) : []) {
  if (job.mode !== "workflow") return void 0;
  if (stages.length === 0) return void 0;
  const currentId = job.workflowGraph?.currentNodeId;
  const currentIndex = currentId ? stages.findIndex((stage) => stage.id === currentId) : -1;
  if (currentIndex >= 0 && stages[currentIndex]?.status !== "completed") return { total: stages.length, current: currentIndex };
  const runningIndex = stages.findIndex((stage) => stage.status === "running");
  if (runningIndex >= 0) return { total: stages.length, current: runningIndex };
  const indexedStage = job.currentStep !== void 0 && job.currentStep >= 0 ? stages[job.currentStep] : void 0;
  if (indexedStage && indexedStage.status !== "completed") return { total: stages.length, current: job.currentStep };
  if (stages.every((stage) => stage.status === "completed")) return { total: stages.length, current: stages.length - 1 };
  return { total: stages.length };
}
function buildWorkflowWidgetProjection(job, now = Date.now()) {
  const stages = job.mode === "workflow" ? workflowGraphStageNodes(job.workflowGraph) : [];
  const stageProgress = workflowStageProgress(job, stages);
  const clock = job.status === "running" ? now : job.updatedAt;
  const loadedSteps = workflowWidgetSteps(job, stages);
  const steps = job.mode === "workflow" ? loadedSteps.map((step) => step.status === "running" && step.startedAt !== void 0 && clock !== void 0 ? { ...step, durationMs: Math.max(0, clock - step.startedAt) } : step) : loadedSteps;
  const projection = { stages, steps, now };
  if (stageProgress) projection.stageProgress = stageProgress;
  if (stages.length) projection.plannedKeys = new Set(stages.map((node) => node.id));
  if (job.mode === "workflow") {
    const checklist = projectWorkflowChecklist({
      graph: job.workflowGraph,
      steps: job.steps,
      hostSteps: job.hostSteps,
      preflight: job.preflight,
      trace: job.workflow?.trace,
      now: clock
    });
    if (checklist.total > 0) projection.checklist = checklist;
  }
  return projection;
}
function workflowWidgetProjectionLookup(now = Date.now(), childrenByParent = /* @__PURE__ */ new Map()) {
  const projections = /* @__PURE__ */ new WeakMap();
  return (job) => {
    const cached = projections.get(job);
    if (cached) return cached;
    const projection = buildWorkflowWidgetProjection(job, now);
    const children = childrenByParent.get(job.asyncId);
    if (children?.length) {
      projection.children = children;
      projection.materializedKeys = new Set(children.flatMap((child) => [child.asyncId, ...child.workflowKey ? [child.workflowKey] : []]));
      for (const step of projection.steps) {
        if (step.runId && projection.materializedKeys.has(step.runId) && step.workflowKey) projection.materializedKeys.add(step.workflowKey);
      }
    }
    projections.set(job, projection);
    return projection;
  };
}
function laneStepForJob(job, steps = workflowWidgetSteps(job)) {
  if (steps.length === 0) return void 0;
  const graphCurrent = job.workflowGraph?.currentNodeId;
  if (graphCurrent) {
    const current = steps.find((step) => step.workflowKey === graphCurrent);
    if (current) return current;
  }
  if (job.currentStep !== void 0) {
    const current = steps[job.currentStep];
    if (current && (current.index === void 0 || current.index === job.currentStep)) return current;
    const indexedCurrent = steps.find((step) => step.index === job.currentStep);
    if (indexedCurrent) return indexedCurrent;
    return steps[0];
  }
  return steps.find((step) => step.status === "running") ?? steps.find((step) => step.status === "pending") ?? steps.at(-1);
}
function laneTraceForJob(job) {
  return Array.isArray(job.workflow?.trace) ? job.workflow.trace.at(-1) : void 0;
}
function laneGate(step) {
  const review = step?.review?.status ?? step?.acceptance?.reviewResult?.status;
  if (review === "blockers") return "review blockers";
  if (review === "review-required") return "review required";
  if (review === "reviewed") return "reviewed";
  const acceptance = step?.acceptance?.status;
  if (acceptance === "review-required") return "acceptance review";
  if (acceptance === "checked" || acceptance === "verified" || acceptance === "accepted") return "acceptance";
  return void 0;
}
function laneNextAction(state, step, output, gate) {
  if (unresolvedChildWatchdogBlockers(step?.watchdog).length > 0) return "resolve watchdog blockers";
  if (step?.watchdog?.phase === "stale") return "inspect stale state";
  if (step?.toolBudgetBlocked === true || step?.turnBudgetExceeded === true) return "inspect blocked state";
  if (gate === "review blockers") return "resolve review blockers";
  if (gate === "review required" || gate === "acceptance review") return "review output";
  if (step?.activityState === "needs_attention") return "inspect attention";
  if (state === "queued" || state === "pending") return "await launch";
  if (state === "failed" || state === "rejected") return "inspect failure";
  if (state === "partial") return "inspect partial state";
  if (state === "paused") return "inspect paused state";
  if (state === "stopped") return "inspect stopped state";
  if ((state === "complete" || state === "completed") && gate === "reviewed") return "ready";
  if ((state === "complete" || state === "completed") && output) return "inspect output";
  return void 0;
}
function isTerminalLaneState(state) {
  return state !== "queued" && state !== "running";
}
function projectAsyncLane(job, ...args) {
  const selectedStep = args.length === 0 ? laneStepForJob(job) : args[0];
  const trace = laneTraceForJob(job);
  const workspace = job.cwd ? boundedLaneValue(shortenPath(job.cwd)) : void 0;
  const label = compactTaskText(selectedStep?.description, selectedStep?.label) ?? boundedLaneValue(trace?.label) ?? (workspace ? void 0 : boundedLaneValue(selectedStep?.workflowKey ?? job.workflowKey));
  const role = boundedLaneValue(selectedStep?.agent ?? trace?.agent ?? job.agents?.[0] ?? widgetJobName(job), 32) ?? "subagent";
  const phase = boundedLaneValue(selectedStep?.phase ?? trace?.phase);
  const gate = laneGate(selectedStep);
  const output = boundedLaneValue(selectedStep?.outputName);
  const ref = boundedLaneValue(selectedStep?.workflowKey ?? job.workflowKey ?? job.asyncId.slice(0, 8), 24) ?? job.asyncId.slice(0, 8);
  const chips = [
    selectedStep?.context,
    selectedStep?.structured ? "structured" : void 0,
    selectedStep?.activityState === "active_long_running" ? "long-running" : void 0,
    selectedStep?.activityState === "needs_attention" ? "attention" : void 0,
    selectedStep?.watchdog?.phase === "stale" ? "stale" : void 0,
    unresolvedChildWatchdogBlockers(selectedStep?.watchdog).length > 0 ? `wd:${unresolvedChildWatchdogBlockers(selectedStep?.watchdog).length}` : void 0,
    selectedStep?.toolBudgetBlocked === true || selectedStep?.turnBudgetExceeded === true ? "blocked" : void 0
  ].filter((chip) => Boolean(chip));
  const state = isTerminalLaneState(job.status) ? job.status : selectedStep?.status ?? job.status;
  const next = laneNextAction(state, selectedStep, output, gate);
  if (!label && !phase && !gate && !output && !selectedStep?.workflowKey && !job.workflowKey && !trace?.label && !trace?.phase) return void 0;
  return { ...label ? { label } : {}, role, ...phase ? { phase } : {}, state, ...gate ? { gate } : {}, ...next ? { next } : {}, ...output ? { output } : {}, ...workspace ? { workspace } : {}, ref, chips };
}
function laneStateLabel(state, theme) {
  if (state === "running") return theme.fg("accent", "running");
  if (state === "queued" || state === "pending") return theme.fg("muted", state);
  if (state === "complete" || state === "completed") return theme.fg("success", "complete");
  if (state === "failed" || state === "rejected") return theme.fg("error", state === "rejected" ? "rejected" : "failed");
  return theme.fg("warning", state);
}
function formatLaneProjection(lane, theme) {
  const label = boundedLaneValue(lane.label, 56);
  const identity = [label, lane.role ? `role:${lane.role}` : void 0].filter(Boolean).join(" \xB7 ");
  return `${identity ? theme.bold(identity) : theme.bold(lane.role)} \xB7 ${laneStateLabel(lane.state, theme)}`;
}
function formatLaneChip(chip, theme) {
  const text = `[${chip}]`;
  if (chip === "blocked") return theme.fg("error", text);
  if (chip === "stale") return theme.fg("warning", text);
  return text;
}
function formatLaneProjectionDetails(lane, theme) {
  const details = [
    lane.phase ? `phase:${lane.phase}` : void 0,
    lane.gate ? `gate:${lane.gate}` : void 0,
    lane.next ? `next:${lane.next}` : void 0,
    lane.output ? `out:${lane.output}` : void 0,
    lane.workspace ? `workspace:${lane.workspace}` : lane.ref ? `ref:${lane.ref}` : void 0
  ].filter(Boolean);
  const chips = lane.chips.map((chip) => formatLaneChip(chip, theme));
  return [...details.length ? [theme.fg("dim", details.join(" \xB7 "))] : [], ...chips].join(" \xB7 ") || void 0;
}
function formatLaneProjectionLines(lane, theme, indent) {
  const details = formatLaneProjectionDetails(lane, theme);
  return [
    `${indent}${formatLaneProjection(lane, theme)}`,
    ...details ? [`${indent}  ${details}`] : []
  ];
}
function laneRenderKey(job, projection) {
  const selectedStep = projection ? laneStepForJob(job, projection.steps) : laneStepForJob(job);
  const lane = projectAsyncLane(job, selectedStep);
  return lane ? [lane.label, lane.role, lane.phase, lane.state, lane.gate, lane.next, lane.output, lane.workspace, lane.ref, lane.chips] : void 0;
}
function widgetLaneDetailLines(job, theme, projection) {
  if (job.steps?.length && (job.mode === "parallel" || job.mode === "chain")) return [];
  const selectedStep = projection ? laneStepForJob(job, projection.steps) : laneStepForJob(job);
  const lane = projectAsyncLane(job, selectedStep);
  return lane ? formatLaneProjectionLines(lane, theme, "  ") : [];
}
function workflowPreflightLines(job) {
  if (job.mode !== "workflow" || !job.preflight) return [];
  return [
    ...formatWorkflowPreflight(job.preflight, { indent: "  " }).split("\n"),
    ...job.workflow?.preflightWarnings ? formatWorkflowPreflightWarnings(job.workflow.preflightWarnings, { indent: "  " }).split("\n") : []
  ];
}
function workflowLabelForResult(details, resultIndex) {
  const flatIndex = foregroundResultIndex(details, resultIndex);
  const visit = (nodes) => {
    for (const node of nodes) {
      if (node.flatIndex === flatIndex && node.label.trim()) return node.label;
      const nested = node.children ? visit(node.children) : void 0;
      if (nested) return nested;
    }
    return void 0;
  };
  return details.workflowGraph ? visit(details.workflowGraph.nodes) : void 0;
}
function foregroundProgressForResult(details, resultIndex) {
  const result = details.results[resultIndex];
  if (result?.progress) return result.progress;
  const index = result?.index ?? resultIndex;
  const indexed = details.progress?.find((progress) => progress.index === index);
  if (indexed) return indexed;
  return result?.agent ? details.progress?.find((progress) => progress.agent === result.agent && progress.status === "running") : void 0;
}
function foregroundResultIndex(details, resultIndex) {
  const result = details.results[resultIndex];
  if (typeof result?.index === "number") return result.index;
  return foregroundProgressForResult(details, resultIndex)?.index ?? resultIndex;
}
function foregroundResultDisplayName(details, resultIndex, result, fallback) {
  const progress = foregroundProgressForResult(details, resultIndex);
  const agent = normalizedParallelDisplayText(result?.agent) ?? normalizedParallelDisplayText(progress?.agent);
  const workflowLabel = normalizedParallelDisplayText(workflowLabelForResult(details, resultIndex));
  if (workflowLabel) return compactTaskText(void 0, workflowLabel) ?? workflowLabel;
  const sessionName = normalizedParallelDisplayText(result?.sessionName) ?? normalizedParallelDisplayText(progress?.sessionName);
  if (sessionName) {
    const sessionTask = stripRepeatedAgentPrefix(sessionName, agent);
    if (sessionTask && sessionTask !== PROMPT_REDACTED && sessionTask.toLowerCase() !== agent?.toLowerCase()) {
      return compactTaskText(sessionTask) ?? sessionTask;
    }
  }
  return compactTaskText(result?.task) ?? compactTaskText(progress?.task) ?? agent ?? fallback;
}
function foregroundSingleDisplayName(result) {
  return normalizedParallelDisplayText(result?.agent) ?? normalizedParallelDisplayText(result?.sessionName) ?? compactTaskText(result?.task) ?? "subagent";
}
function hasLiveOutputSignal(line) {
  const clean = oneLine(line);
  return liveOutputWordSignalPattern.test(clean) || liveOutputCodeSignalPattern.test(clean);
}
function isNoisyStatusLine(line) {
  const clean = oneLine(line);
  return clean.length > 0 && clean.length <= 240 && !hasLiveOutputSignal(clean) && noisyStatusPatterns.some((pattern) => pattern.test(clean));
}
function latestActivityText(line) {
  return oneLine(line).replace(/^i (?:will|can|need to|am going to)\s+/i, "").replace(/^i(?:'m|’m| am)\s+/i, "");
}
function progressUpdateSummary(lines) {
  const counts = /* @__PURE__ */ new Map();
  for (const line of lines) counts.set(line.toLowerCase(), (counts.get(line.toLowerCase()) ?? 0) + 1);
  const exactRepeatCount = Math.max(...counts.values());
  const latest = latestActivityText(lines[lines.length - 1]);
  const repeat = exactRepeatCount > 1 ? ` \xB7 repeated ${exactRepeatCount}\xD7` : "";
  return `\u21BB ${lines.length} progress updates${repeat} \xB7 latest: ${latest}`;
}
function compactRecentOutputLines(recentOutput) {
  const lines = [];
  const noisyLines = [];
  const otherLines = [];
  for (const rawLine of recentOutput ?? []) {
    const line = oneLine(rawLine);
    if (!line || line === "(running...)") continue;
    lines.push(line);
    (isNoisyStatusLine(line) ? noisyLines : otherLines).push(line);
  }
  if (noisyLines.length >= 4 && !otherLines.some(hasLiveOutputSignal)) {
    if (otherLines.length === 0) {
      return [
        progressUpdateSummary(noisyLines),
        "pattern: repeated short status lines"
      ];
    }
    const visibleTail = otherLines.slice(-3);
    const hiddenSignals2 = otherLines.slice(0, -3).filter(hasLiveOutputSignal);
    return [
      progressUpdateSummary(noisyLines),
      ...hiddenSignals2.length > 0 ? [`\u2026 ${hiddenSignals2.length} older signal ${hiddenSignals2.length === 1 ? "line" : "lines"}: ${hiddenSignals2.at(-1)}`] : [],
      ...visibleTail
    ].slice(0, 5);
  }
  if (lines.length <= 5) return lines;
  const tail = lines.slice(-5);
  const hiddenSignals = lines.slice(0, -5).filter(hasLiveOutputSignal);
  if (hiddenSignals.length === 0) return tail;
  return [
    `\u2026 ${hiddenSignals.length} older signal ${hiddenSignals.length === 1 ? "line" : "lines"}: ${hiddenSignals.at(-1)}`,
    ...lines.slice(-4)
  ];
}
function compactWorkflowError(error) {
  const outputMatch = error.match(/(?:^|\n)Output:\s*([\s\S]+)/);
  if (!outputMatch) return oneLine(error);
  const prefix = oneLine(error.slice(0, outputMatch.index)).replace(/:$/, "") || "Failed";
  const outputLines = outputMatch[1].split(/\r?\n/).map(oneLine).filter(Boolean);
  const allOutputLinesAreNoisy = outputLines.length > 0 && outputLines.every(isNoisyStatusLine);
  const latest = outputLines.at(-1);
  return allOutputLinesAreNoisy && latest ? `${prefix} \xB7 latest: ${latestActivityText(latest)}` : `${prefix} \xB7 ${oneLine(outputMatch[1] ?? "")}`;
}
var WORKFLOW_LIVE_ROW_LIMIT = 8;
function visibleWorkflowRows(rows) {
  if (rows.length <= WORKFLOW_LIVE_ROW_LIMIT) return { rows, hiddenRows: 0 };
  const selected = /* @__PURE__ */ new Set();
  const add = (row) => {
    if (selected.size >= WORKFLOW_LIVE_ROW_LIMIT || selected.has(row.key)) return;
    selected.add(row.key);
  };
  for (const row of [...rows].reverse()) {
    if (row.state === "failed" || row.state === "detached") add(row);
  }
  for (const row of [...rows].reverse()) add(row);
  return {
    rows: rows.filter((row) => selected.has(row.key)),
    hiddenRows: rows.length - selected.size
  };
}
function snapshotNowForProgress(progress) {
  if (progress.currentToolStartedAt !== void 0 && progress.durationMs !== void 0) return progress.currentToolStartedAt + progress.durationMs;
  return progress.lastActivityAt;
}
function renderToolArgsPreview(value, maxLength, expanded) {
  const normalized = sanitizeDisplayText(value);
  if (expanded || normalized.length <= maxLength) return normalized;
  return `${truncateDisplayText(normalized, maxLength)}...`;
}
function formatCurrentToolLine(progress, availableWidth, expanded, snapshotNow) {
  if (!progress.currentTool) return void 0;
  const maxToolArgsLen = Math.max(50, availableWidth - 20);
  const toolArgsPreview = progress.currentToolArgs ? renderToolArgsPreview(progress.currentToolArgs, maxToolArgsLen, expanded) : "";
  const durationSuffix = progress.currentToolStartedAt !== void 0 && snapshotNow !== void 0 ? ` | ${formatDuration(Math.max(0, snapshotNow - progress.currentToolStartedAt))}` : "";
  return toolArgsPreview ? `${progress.currentTool}: ${toolArgsPreview}${durationSuffix}` : `${progress.currentTool}${durationSuffix}`;
}
function buildLiveStatusLine(progress, snapshotNow) {
  if (progress.lastActivityAt !== void 0 && snapshotNow !== void 0) return formatActivityLabel(progress.lastActivityAt, progress.activityState, snapshotNow);
  if (progress.activityState === "needs_attention") return "needs attention";
  if (progress.activityState === "active_long_running") return "active but long-running";
  if (progress.lastActivityAt !== void 0) return "active";
  return void 0;
}
function themeBold(theme, text) {
  return theme.bold?.(text) ?? text;
}
function statJoin(theme, parts) {
  return parts.filter(Boolean).map((part) => theme.fg("dim", part)).join(` ${theme.fg("dim", "\xB7")} `);
}
function formatTokenStat(tokens) {
  return `${formatTokens(tokens)} token`;
}
function formatToolUseStat(count) {
  return `${count} tool use${count === 1 ? "" : "s"}`;
}
function formatTotalCostStat(totalCost) {
  if (!totalCost || totalCost.inputTokens === 0 && totalCost.outputTokens === 0 && totalCost.costUsd === 0) return "";
  const parts = [];
  if (totalCost.inputTokens) parts.push(`in:${formatTokens(totalCost.inputTokens)}`);
  if (totalCost.outputTokens) parts.push(`out:${formatTokens(totalCost.outputTokens)}`);
  if (totalCost.costUsd) parts.push(`$${totalCost.costUsd.toFixed(4)}`);
  return parts.join(" ");
}
function formatProgressStats(theme, progress, includeDuration = true) {
  if (!progress) return "";
  const parts = [];
  if (progress.toolCount > 0) parts.push(formatToolUseStat(progress.toolCount));
  if (progress.tokens > 0) parts.push(formatTokenStat(progress.tokens));
  if (includeDuration && progress.durationMs > 0) parts.push(formatDuration(progress.durationMs));
  return statJoin(theme, parts);
}
function firstOutputLine(text) {
  return text.split("\n").find((line) => line.trim())?.trim() ?? "";
}
function resultStatusLine(result, output) {
  if (result.detached) return result.detachedReason ? `Detached: ${result.detachedReason}` : "Detached";
  if (result.stopped) return "Stopped";
  if (result.interrupted) return "Paused";
  if (result.exitCode !== 0) return `Error: ${result.error ?? (firstOutputLine(output) || `exit ${result.exitCode}`)}`;
  if (result.acceptance?.status && result.acceptance.status !== "not-required") return `Done \xB7 acceptance: ${result.acceptance.status}`;
  if (hasEmptyTextOutputWithoutOutputTarget(result.task, output)) return "Done (no text output)";
  return "Done";
}
function semanticResultPresentation(input) {
  if (input.running) {
    const glyph = input.frame !== void 0 ? runningGlyph((input.seed ?? 0) + input.frame) : runningGlyph(input.seed);
    return { glyph, label: "running", tone: "accent", ...input.thinking ? { thinking: input.thinking } : {} };
  }
  if (input.detached) return { glyph: "\u25A0", label: "detached", tone: "warning" };
  if (input.stopped) return { glyph: "\u25A0", label: "stopped", tone: "warning" };
  if (input.interrupted) return { glyph: "\u25A0", label: "paused", tone: "warning" };
  if (input.failed) return { glyph: "\u2717", label: "failed", tone: "error" };
  if (input.partial) return { glyph: "\u25A0", label: "partial", tone: "warning" };
  return { glyph: "\u2713", label: "completed", tone: input.completedWithoutOutput ? "warning" : "success" };
}
function hasTerminalResultFlag(result) {
  return Boolean(result.detached || result.stopped || result.interrupted);
}
function hasTerminalResult(result) {
  if (hasTerminalResultFlag(result)) return true;
  const status = result.progress?.status;
  if (status === "running" || status === "pending") return false;
  return result.exitCode !== void 0;
}
function isResultRunning(result, status = result.progress?.status) {
  return status === "running" && !hasTerminalResultFlag(result);
}
function detailsHaveRunningResult(details) {
  return details.progress?.some((progress) => {
    if (progress.status !== "running") return false;
    const result = details.results.find((entry) => entry.progress?.index === progress.index) ?? details.results[progress.index];
    return !result || !hasTerminalResultFlag(result);
  }) || details.results.some((result) => isResultRunning(result)) || workflowGraphHasStatus(details, ["running"]);
}
function resultPresentation(result, output, running = isResultRunning(result), seed = progressRunningSeed(result.progress ?? result.progressSummary), frame) {
  return semanticResultPresentation({
    running,
    detached: result.detached,
    stopped: result.stopped,
    interrupted: result.interrupted,
    failed: result.exitCode !== 0,
    completedWithoutOutput: hasEmptyTextOutputWithoutOutputTarget(result.task, output),
    seed,
    frame,
    thinking: childThinkingLevel(result, result.progress)
  });
}
function presentationTone(presentation, theme) {
  return presentation.label === "running" ? runningTone(theme, presentation.thinking) : (text) => theme.fg(presentation.tone, text);
}
function resultGlyph(result, output, theme, running = isResultRunning(result), seed = progressRunningSeed(result.progress ?? result.progressSummary), frame) {
  const presentation = resultPresentation(result, output, running, seed, frame);
  return presentationTone(presentation, theme)(presentation.glyph);
}
function styledResultPresentation(presentation, theme) {
  const tone = presentationTone(presentation, theme);
  return {
    glyph: tone(presentation.glyph),
    label: tone(presentation.label)
  };
}
function compactCurrentActivity(progress) {
  const snapshotNow = snapshotNowForProgress(progress);
  return formatCurrentToolLine(progress, getTermWidth() - 4, false, snapshotNow) ?? buildLiveStatusLine(progress, snapshotNow) ?? "thinking\u2026";
}
function textDigest(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
function displayTextRenderKey(text) {
  const normalized = sanitizeDisplayText(text);
  return [normalized.length, textDigest(normalized)];
}
function expandedStepActivityRenderKey(step) {
  return [
    step.recentTools?.slice(-3).map((tool) => [tool.tool, displayTextRenderKey(tool.args), tool.endMs]),
    compactRecentOutputLines(step.recentOutput).map(displayTextRenderKey)
  ];
}
function widgetStepRenderKey(step, index, expanded = false) {
  return [
    step.index ?? index,
    step.agent,
    step.sessionName,
    step.workflowKey,
    step.phase,
    step.label,
    step.status,
    step.activityState,
    step.lastActivityAt,
    step.currentTool,
    step.currentToolArgs,
    step.currentToolStartedAt,
    step.currentPath,
    step.turnCount,
    step.toolCount,
    step.startedAt,
    step.endedAt,
    step.durationMs,
    step.tokens?.total,
    step.model,
    step.thinking,
    step.context,
    step.description,
    step.outputName,
    step.structured,
    step.acceptance?.status,
    step.acceptance?.reviewResult?.status,
    step.review?.status,
    step.toolBudgetBlocked,
    step.turnBudgetExceeded,
    step.timedOut,
    step.stopped,
    step.execution?.status,
    step.execution?.error,
    step.execution?.timedOut,
    step.execution?.interrupted,
    step.execution?.stopped,
    step.execution?.detached,
    step.watchdog?.phase,
    unresolvedChildWatchdogBlockers(step.watchdog).length,
    step.error,
    expanded ? expandedStepActivityRenderKey(step) : void 0,
    nestedRenderKey(step.children, expanded)
  ];
}
function nestedRenderKey(children, expanded = false) {
  return (children ?? []).map((child) => [
    child.id,
    child.state,
    child.agent,
    child.sessionName,
    child.model,
    child.thinking,
    child.activityState,
    child.lastActivityAt,
    child.currentTool,
    child.currentToolStartedAt,
    child.currentPath,
    child.turnCount,
    child.toolCount,
    child.startedAt,
    child.endedAt,
    child.lastUpdate,
    child.error,
    child.totalTokens?.total,
    child.steps?.map((step, index) => widgetStepRenderKey({ ...step, agent: step.agent, status: step.status }, index, expanded)),
    nestedRenderKey(child.children, expanded)
  ]);
}
function hostStepRenderKey(row) {
  return [
    row.kind,
    row.name,
    row.state,
    row.provider,
    row.role,
    row.verdict,
    row.reasonCode,
    row.detail,
    row.target,
    row.freshness,
    row.reportPath
  ];
}
function widgetRenderKey(job, expanded = false) {
  const projection = buildWorkflowWidgetProjection(job, job.updatedAt ?? 0);
  return JSON.stringify({
    asyncDir: job.asyncDir,
    parentWorkflowRunId: job.parentWorkflowRunId,
    workflowKey: job.workflowKey,
    status: job.status,
    description: job.mode === "workflow" ? job.description : void 0,
    activityState: job.activityState,
    lastActivityAt: job.lastActivityAt,
    currentTool: job.currentTool,
    currentToolStartedAt: job.currentToolStartedAt,
    currentPath: job.currentPath,
    turnCount: job.turnCount,
    toolCount: job.toolCount,
    mode: job.mode,
    agents: job.agents,
    currentStep: job.currentStep,
    chainStepCount: job.chainStepCount,
    parallelGroups: job.parallelGroups,
    workflowHostSteps: projectAsyncWorkflowRows([], job.hostSteps).map(hostStepRenderKey),
    workflowGraph: job.mode === "workflow" && job.workflowGraph ? {
      currentNodeId: job.workflowGraph.currentNodeId,
      stages: projection.stages.map((node) => [node.id, node.status, node.agent, node.phase, node.label, node.flatIndex, node.outputName, node.structured, node.error])
    } : void 0,
    preflight: expanded ? job.preflight : job.preflight?.lanes.map((lane) => [lane.key, lane.mode, lane.decision, lane.claims, lane.expectedOutput]),
    preflightWarnings: expanded ? job.workflow?.preflightWarnings : void 0,
    checklist: projection.checklist ? {
      total: projection.checklist.total,
      done: projection.checklist.done,
      running: projection.checklist.running,
      queued: projection.checklist.queued,
      blocked: projection.checklist.blocked,
      failed: projection.checklist.failed,
      phases: projection.checklist.phases.map((phase) => [phase.key, phase.state, phase.done, phase.total, phase.running, phase.queued, phase.blocked, phase.failed, phase.paused, phase.stopped, phase.items.map((item) => [item.key, item.label, item.agent, item.state, item.preflight?.key, item.preflight?.mode, item.preflight?.decision, item.preflight?.claims, item.preflight?.expectedOutput, item.currentTool, item.currentPath, item.durationMs, item.toolCount, item.error])])
    } : void 0,
    steps: job.steps?.map((step, index) => widgetStepRenderKey(step, index, expanded)),
    nestedChildren: nestedRenderKey(job.nestedChildren, expanded),
    lane: laneRenderKey(job, projection),
    stepsTotal: job.stepsTotal,
    runningSteps: job.runningSteps,
    completedSteps: job.completedSteps,
    activeParallelGroup: job.activeParallelGroup,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    timedOut: job.timedOut,
    stopped: job.stopped,
    totalTokens: job.totalTokens
  });
}
function formatWidgetAgents(agents) {
  const distinct = [...new Set(agents)];
  if (distinct.length === 1 && agents.length > 1) return `${distinct[0]} \xD7${agents.length}`;
  if (agents.length > 3) return `${agents.slice(0, 2).join(", ")} +${agents.length - 2} more`;
  return agents.join(", ");
}
function widgetJobName(job) {
  if (job.mode === "parallel") return "parallel";
  if (job.mode === "chain") return "chain";
  if (job.mode === "single" && job.agents?.length === 1) return job.agents[0];
  if (job.agents?.length) return formatWidgetAgents(job.agents);
  return job.mode ?? "subagent";
}
function isSingleChildAsyncJob(job) {
  return job.mode === "single" && job.steps?.length === 1 && shouldSuppressSingleStep(job.chainStepCount, job.stepsTotal);
}
function isCompletedWidgetStepStatus(status) {
  return status === "complete" || status === "completed";
}
function singleChildAgentName(job, step) {
  return job.agents?.length === 1 ? job.agents[0] : step.agent || widgetJobName(job);
}
function hasSingleChildDetailEvidence(job, step) {
  return Boolean(
    step.error?.trim() || step.execution?.error?.trim() || step.phase?.trim() || step.label?.trim() || step.workflowKey?.trim() || step.outputName?.trim() || step.lane || job.workflowKey?.trim() || job.lane || laneTraceForJob(job)?.phase?.trim() || laneTraceForJob(job)?.label?.trim() || step.timedOut || step.stopped || step.execution?.timedOut || step.execution?.interrupted || step.execution?.stopped || step.execution?.detached || job.timedOut || job.stopped || ["failed", "partial", "paused", "stopped", "detached"].includes(step.execution?.status ?? "") || step.acceptance?.status === "rejected" || step.acceptance?.reviewResult?.status === "blockers" || step.review?.status === "blockers"
  );
}
function shouldCollapseSingleChildDetails(job, step) {
  if (!isSingleChildAsyncJob(job) || hasSingleChildDetailEvidence(job, step)) return false;
  if (job.status === "running") return step.status === "running";
  if (job.status === "complete") return isCompletedWidgetStepStatus(step.status);
  return false;
}
function stepTaskSummary(step, agentName) {
  const task = compactTaskText(step.description, step.label);
  if (task) return task;
  const sessionName = step.sessionName?.trim();
  if (!sessionName) return void 0;
  const sessionTask = stripRepeatedAgentPrefix(sessionName, agentName);
  return sessionTask === agentName ? void 0 : compactTaskText(sessionTask);
}
function widgetActivity(job) {
  const facts = [];
  if (job.currentTool && job.currentToolStartedAt !== void 0 && job.updatedAt !== void 0) facts.push(`${job.currentTool} ${formatDuration(Math.max(0, job.updatedAt - job.currentToolStartedAt))}`);
  else if (job.currentTool) facts.push(job.currentTool);
  if (job.currentPath) facts.push(shortenPath(job.currentPath));
  if (job.turnCount !== void 0) facts.push(`${job.turnCount} turns`);
  if (job.toolCount !== void 0) facts.push(`${job.toolCount} tools`);
  const activity = buildLiveStatusLine(job, job.updatedAt);
  if (activity && facts.length) return `${activity} \xB7 ${facts.join(" \xB7 ")}`;
  if (activity) return activity;
  if (facts.length) return facts.join(" \xB7 ");
  if (job.status === "running") return "thinking\u2026";
  if (job.status === "queued") return "queued\u2026";
  if (job.status === "paused") return "Paused";
  if (job.status === "stopped") return "Stopped";
  if (job.status === "partial") return "Partial";
  if (job.status === "failed") return "Failed";
  return "Done";
}
function widgetStepRunningSeed(step, fallbackIndex) {
  return runningSeed(
    fallbackIndex,
    step.index,
    step.toolCount,
    step.turnCount,
    step.tokens?.total,
    step.lastActivityAt,
    step.currentToolStartedAt,
    step.durationMs
  );
}
function widgetStepsRunningSeed(steps) {
  let seed;
  for (const [index, step] of (steps ?? []).entries()) seed = runningSeed(seed, widgetStepRunningSeed(step, index));
  return seed;
}
function widgetJobRunningSeed(job) {
  return runningSeed(
    job.updatedAt,
    job.lastActivityAt,
    job.toolCount,
    job.turnCount,
    job.totalTokens?.total,
    job.currentStep,
    job.runningSteps,
    job.completedSteps,
    widgetStepsRunningSeed(job.steps)
  );
}
function widgetJobsRunningSeed(jobs) {
  let seed;
  for (const job of jobs) seed = runningSeed(seed, widgetJobRunningSeed(job));
  return seed;
}
function activeHeaderTone(theme, hasActive) {
  return hasActive ? runningTone(theme) : (text) => theme.fg("dim", text);
}
function widgetStatusGlyph(job, theme, frame) {
  if (job.status === "running") return runningTone(theme, job.mode === "single" ? childThinkingLevel(job.steps?.[0]) : void 0)(runningGlyph(animatedSeed(widgetJobRunningSeed(job), frame)));
  if (job.status === "queued") return theme.fg("muted", "\u25E6");
  if (job.status === "complete") return theme.fg("success", "\u2713");
  if (job.status === "paused") return theme.fg("warning", "\u25A0");
  if (job.status === "stopped") return theme.fg("warning", "\u25A0");
  return theme.fg("error", "\u2717");
}
function widgetStepGlyph(status, theme, seed, frame, thinking) {
  if (status === "running") return runningTone(theme, thinking)(runningGlyph(animatedSeed(seed, frame)));
  if (status === "complete" || status === "completed") return theme.fg("success", "\u2713");
  if (status === "failed") return theme.fg("error", "\u2717");
  if (status === "paused") return theme.fg("warning", "\u25A0");
  if (status === "stopped") return theme.fg("warning", "\u25A0");
  return theme.fg("muted", "\u25E6");
}
function widgetStepStatus(status, theme, thinking) {
  if (status === "running") return runningTone(theme, thinking)("running");
  if (status === "complete" || status === "completed") return theme.fg("success", "complete");
  if (status === "failed") return theme.fg("error", "failed");
  if (status === "paused") return theme.fg("warning", "paused");
  if (status === "stopped") return theme.fg("warning", "stopped");
  return theme.fg("dim", status);
}
function workflowChecklistStateLabel(state) {
  if (state === "running") return "running";
  if (state === "complete") return "complete";
  return state;
}
function workflowChecklistGlyph(item, theme, frame) {
  if (item.state === "running") return runningTone(theme, item.thinking)(runningGlyph(animatedSeed(runningSeed(item.startedAt, item.durationMs, item.toolCount, item.currentToolStartedAt), frame)));
  if (item.state === "complete") return theme.fg("success", "\u2713");
  if (item.state === "blocked") return theme.fg("error", "!");
  if (item.state === "failed") return theme.fg("error", "\u2717");
  if (item.state === "paused" || item.state === "stopped") return theme.fg("warning", "\u25A0");
  return theme.fg("muted", "\u25E6");
}
function workflowChecklistItemPriority(state) {
  if (state === "blocked") return 0;
  if (state === "failed") return 1;
  if (state === "running") return 2;
  if (state === "paused") return 3;
  if (state === "stopped") return 4;
  if (state === "queued") return 5;
  return 6;
}
function workflowChecklistItemLine(item, theme, indent, frame, includeError) {
  const identity = [item.label, item.agent && item.agent !== item.label ? item.agent : void 0].filter(Boolean).join(" \xB7 ");
  const context = contextModeBadge(theme, item.context);
  const state = item.state === "complete" ? "" : ` ${theme.fg("dim", `\xB7 ${workflowChecklistStateLabel(item.state)}`)}`;
  const details = [
    item.currentTool ? `${item.currentTool}${item.durationMs !== void 0 ? ` ${formatDuration(item.durationMs)}` : ""}` : void 0,
    !item.currentTool && item.currentPath ? shortenPath(item.currentPath) : void 0,
    !item.currentTool && item.durationMs !== void 0 ? formatDuration(item.durationMs) : void 0,
    item.toolCount !== void 0 ? `${item.toolCount} tools` : void 0,
    item.outputName ? `out:${item.outputName}` : void 0,
    includeError && item.error ? `error:${oneLine(item.error)}` : void 0
  ].filter(Boolean).join(" \xB7 ");
  return `${indent}${workflowChecklistGlyph(item, theme, frame)} ${theme.bold(identity || item.key)}${context}${state}${details ? ` ${theme.fg("dim", `\xB7 ${details}`)}` : ""}`;
}
var COLLAPSED_WORKFLOW_PHASE_LIMIT = 4;
function workflowChecklistWidgetLines(checklist, theme, indent, expanded, frame, options = {}) {
  if (!checklist?.total) return [];
  const includeSummary = options.includeSummary ?? true;
  const limitPhases = options.limitPhases ?? !expanded;
  const includeBottleneckOutput = options.includeBottleneckOutput ?? expanded;
  const includeItemErrors = options.includeItemErrors ?? true;
  const lines = includeSummary ? [`${indent}${theme.fg("dim", `Checklist ${formatWorkflowChecklistSummary(checklist)}`)}`] : [];
  const phases = !limitPhases || checklist.phases.length <= COLLAPSED_WORKFLOW_PHASE_LIMIT ? checklist.phases : checklist.phases.map((phase, index) => ({ phase, index })).sort((left, right) => Number(left.phase.state !== "running") - Number(right.phase.state !== "running") || Number(left.phase.state === "complete") - Number(right.phase.state === "complete") || left.index - right.index).slice(0, COLLAPSED_WORKFLOW_PHASE_LIMIT).sort((left, right) => left.index - right.index).map(({ phase }) => phase);
  for (const phase of phases) {
    const phaseItem = phase.items.find((item) => item.state === "running") ?? phase.items[0];
    const glyph = workflowChecklistGlyph({
      state: phase.state,
      startedAt: phaseItem?.startedAt,
      durationMs: phaseItem?.durationMs,
      toolCount: phaseItem?.toolCount,
      currentToolStartedAt: phaseItem?.currentToolStartedAt
    }, theme, frame);
    lines.push(`${indent}${glyph} ${theme.bold(formatWorkflowChecklistPhase(phase))}`);
    if (expanded) {
      for (const item of [...phase.items].sort((left, right) => workflowChecklistItemPriority(left.state) - workflowChecklistItemPriority(right.state))) {
        lines.push(workflowChecklistItemLine(item, theme, `${indent}  `, frame, includeItemErrors || item.kind === "host"));
      }
    }
  }
  const bottleneck = formatWorkflowChecklistBottleneck(checklist.bottleneck, { includeOutput: includeBottleneckOutput, includeError: !expanded });
  if (bottleneck) {
    const tone = checklist.bottleneck?.state === "blocked" || checklist.bottleneck?.state === "failed" ? "error" : checklist.bottleneck?.state === "running" ? "accent" : "warning";
    lines.push(`${indent}${theme.fg(tone, `bottleneck \xB7 ${bottleneck}`)}`);
  }
  return lines;
}
function compactWorkflowLaneState(items) {
  let state;
  for (const item of items) {
    if (state === void 0 || workflowChecklistItemPriority(item.state) < workflowChecklistItemPriority(state)) state = item.state;
  }
  return state ?? "queued";
}
function compactWorkflowLaneOwner(items) {
  const owners = [...new Set(items.map((item) => item.agent ?? item.role).filter((value) => Boolean(value?.trim())))];
  if (owners.length === 0) return void 0;
  return boundedLaneValue(owners.length > 2 ? `${owners.slice(0, 2).join(", ")} +${owners.length - 2}` : owners.join(", "), 32);
}
function compactWorkflowLaneLabel(items, key) {
  const labels = [...new Set(items.map((item) => item.label).filter((value) => Boolean(value?.trim() && value.trim() !== key)))];
  if (labels.length === 0) return void 0;
  return boundedLaneValue(labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0], 48);
}
function compactWorkflowLaneRow(key, items, lane = items.find((item) => item.preflight)?.preflight, fallbackState = "queued") {
  const state = items.length ? compactWorkflowLaneState(items) : fallbackState;
  const toolCounts = items.map((item) => item.toolCount).filter((value) => value !== void 0);
  const durations = items.map((item) => item.durationMs).filter((value) => value !== void 0);
  const label = compactWorkflowLaneLabel(items, key);
  return {
    key: boundedLaneValue(key, 40) ?? key,
    state,
    agent: compactWorkflowLaneOwner(items),
    ...items.length === 1 && items[0]?.thinking ? { thinking: items[0].thinking } : {},
    ...lane?.mode ? { mode: lane.mode } : {},
    ...lane?.decision ? { decision: boundedLaneValue(lane.decision, 56) } : {},
    ...lane?.claims?.length ? { claims: boundedLaneValue(lane.claims.join(", "), 56) } : {},
    ...lane?.expectedOutput ? { expectedOutput: boundedLaneValue(lane.expectedOutput, 56) } : {},
    ...label ? { label } : {},
    ...toolCounts.length ? { toolUses: toolCounts.reduce((sum, value) => sum + value, 0) } : {},
    ...durations.length ? { durationMs: Math.max(...durations) } : {}
  };
}
function compactWorkflowFallbackState(job) {
  if (job.activityState === "needs_attention" || job.timedOut || job.toolBudgetBlocked || job.turnBudgetExceeded) return "blocked";
  switch (job.status) {
    case "complete":
      return "complete";
    case "failed":
      return "failed";
    case "paused":
      return "paused";
    case "stopped":
      return "stopped";
    case "partial":
    case "rejected":
      return "blocked";
    default:
      return "queued";
  }
}
function compactWorkflowLaneRows(job, checklist) {
  const groups = /* @__PURE__ */ new Map();
  for (const item of checklist?.phases.flatMap((phase) => phase.items) ?? []) {
    const key = item.preflight?.key ?? item.key;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  const rows = [];
  const preflightKeys = new Set(job.preflight?.lanes.map((lane) => lane.key) ?? []);
  if (job.preflight?.lanes.length) {
    for (const lane of job.preflight.lanes) {
      rows.push(compactWorkflowLaneRow(lane.key, groups.get(lane.key) ?? [], lane, compactWorkflowFallbackState(job)));
    }
  }
  for (const [key, items] of groups) {
    if (preflightKeys.has(key)) continue;
    rows.push(compactWorkflowLaneRow(key, items));
  }
  return rows;
}
function compactWorkflowLaneCounts(rows) {
  const counts = { total: rows.length, done: 0, active: 0, queued: 0, blocked: 0, failed: 0, paused: 0, stopped: 0 };
  for (const row of rows) {
    switch (row.state) {
      case "complete":
        counts.done++;
        break;
      case "running":
        counts.active++;
        break;
      case "queued":
        counts.queued++;
        break;
      case "blocked":
        counts.blocked++;
        break;
      case "failed":
        counts.failed++;
        break;
      case "paused":
        counts.paused++;
        break;
      case "stopped":
        counts.stopped++;
        break;
    }
  }
  return counts;
}
function compactWorkflowLaneLine(row, theme, indent, frame) {
  const owner = row.agent && row.mode ? `${row.agent}/${row.mode}` : row.agent ?? row.mode;
  const state = row.state === "complete" ? void 0 : row.state === "running" ? "active" : row.state;
  const intent = [
    row.decision,
    row.claims,
    row.expectedOutput,
    !row.mode && row.label ? row.label : void 0
  ].filter((value) => Boolean(value));
  return `${indent}${workflowChecklistGlyph({ state: row.state, durationMs: row.durationMs, toolCount: row.toolUses, thinking: row.thinking }, theme, frame)} ${theme.bold(row.key)}${owner ? ` ${theme.fg("dim", `\xB7 ${owner}`)}` : ""}${state ? ` ${theme.fg("dim", `\xB7 ${state}`)}` : ""}${intent.length ? ` ${theme.fg("dim", `\xB7 ${intent.join(" \xB7 ")}`)}` : ""}`;
}
function compactWorkflowShortId(job) {
  return job.asyncId.slice(0, 8);
}
function compactWorkflowDisplayLabel(job) {
  return boundedLaneValue(job.description, 64) ?? compactWorkflowShortId(job);
}
function compactWorkflowStats(job, rows, theme, projection) {
  const counts = compactWorkflowLaneCounts(rows);
  const total = counts.total || projection.stageProgress?.total || job.stepsTotal || job.agents?.length || 0;
  const progress = [
    total > 0 ? `${counts.done}/${total} done` : void 0,
    counts.active ? `${counts.active} active` : void 0,
    counts.queued ? `${counts.queued} queued` : void 0,
    counts.blocked ? `${counts.blocked} blocked` : void 0,
    counts.failed ? `${counts.failed} failed` : void 0,
    counts.paused ? `${counts.paused} paused` : void 0,
    counts.stopped ? `${counts.stopped} stopped` : void 0
  ].filter((value) => Boolean(value));
  const rowToolUses = rows.map((row) => row.toolUses).filter((value) => value !== void 0);
  const toolUses = job.toolCount ?? (rowToolUses.length ? rowToolUses.reduce((sum, value) => sum + value, 0) : void 0);
  const rowDuration = rows.map((row) => row.durationMs).filter((value) => value !== void 0);
  const end = job.status === "running" ? projection.now : job.updatedAt;
  const durationMs = job.status !== "queued" && job.startedAt !== void 0 && end !== void 0 ? Math.max(0, end - job.startedAt) : job.status !== "queued" && rowDuration.length ? Math.max(...rowDuration) : void 0;
  return statJoin(theme, [
    `id: ${compactWorkflowShortId(job)}`,
    ...progress,
    toolUses !== void 0 ? formatToolUseStat(toolUses) : void 0,
    durationMs !== void 0 ? formatDuration(durationMs) : void 0
  ].filter((value) => Boolean(value)));
}
function compactWorkflowBottleneck(rows, job) {
  let row;
  for (const candidate of rows) {
    if (candidate.state !== "blocked" && candidate.state !== "failed" && candidate.state !== "paused" && candidate.state !== "stopped") continue;
    if (!row || workflowChecklistItemPriority(candidate.state) < workflowChecklistItemPriority(row.state)) row = candidate;
  }
  if (row) return { text: `${row.key} \xB7 ${row.state}`, tone: row.state === "blocked" || row.state === "failed" ? "error" : "warning" };
  if (job.activityState === "needs_attention" || job.timedOut || job.toolBudgetBlocked || job.turnBudgetExceeded) return { text: `workflow \xB7 ${job.activityState === "needs_attention" ? "needs attention" : "blocked"}`, tone: job.activityState === "needs_attention" ? "warning" : "error" };
  if (job.status === "failed" || job.status === "partial" || job.status === "rejected") return { text: `workflow \xB7 ${job.status}`, tone: "error" };
  if (job.status === "paused" || job.status === "stopped") return { text: `workflow \xB7 ${job.status}`, tone: "warning" };
  return void 0;
}
function compactWorkflowHeaderLine(job, theme, width) {
  const label = compactWorkflowDisplayLabel(job);
  const full = `${theme.fg("toolTitle", themeBold(theme, `async workflow: ${label}`))} ${theme.fg("dim", "\u2500 background")}`;
  if (width === void 0 || visibleWidth2(full) <= width) return full;
  return `${theme.fg("toolTitle", themeBold(theme, `async workflow ${label}`))} ${theme.fg("dim", "\xB7 background")}`;
}
function compactWorkflowWidgetBodyLines(job, theme, frame, projection) {
  const rows = compactWorkflowLaneRows(job, projection.checklist);
  const lines = [`  ${compactWorkflowStats(job, rows, theme, projection)}`];
  if (projection.inlineFleetCovered) return [...lines, `  ${theme.fg("dim", "Workflow children shown in Fleet roster")}`];
  if (rows.length) {
    for (const row of rows) {
      if (!projection.materializedKeys?.has(row.key)) lines.push(compactWorkflowLaneLine(row, theme, "  ", frame));
    }
  } else {
    lines.push(`  ${theme.fg("dim", "\u25E6 waiting for workflow lanes")}`);
  }
  const bottleneck = compactWorkflowBottleneck(rows, job);
  if (bottleneck) lines.push(`  ${theme.fg(bottleneck.tone, `bottleneck \xB7 ${bottleneck.text}`)}`);
  if (job.status === "running" || rows.some((row) => row.state === "running")) lines.push(`  ${theme.fg("accent", workflowDetailHintText())}`);
  return lines;
}
function widgetStepActivity(step, snapshotNow) {
  const facts = [];
  if (step.currentTool && step.currentToolStartedAt !== void 0 && snapshotNow !== void 0) facts.push(`${step.currentTool} ${formatDuration(Math.max(0, snapshotNow - step.currentToolStartedAt))}`);
  else if (step.currentTool) facts.push(step.currentTool);
  if (step.currentPath) facts.push(shortenPath(step.currentPath));
  if (step.turnCount !== void 0) facts.push(`${step.turnCount} turns`);
  if (step.toolCount !== void 0) facts.push(`${step.toolCount} tools`);
  if (step.tokens?.total) facts.push(formatTokenUsage(step.tokens, "token"));
  const activity = buildLiveStatusLine(step, snapshotNow);
  if (activity && facts.length) return `${activity} \xB7 ${facts.join(" \xB7 ")}`;
  if (activity) return activity;
  return facts.join(" \xB7 ");
}
function widgetChainDetails(job, theme, expanded = false, width = getTermWidth(), frame) {
  if (!job.steps?.length) return [];
  const total = job.chainStepCount ?? job.steps.length;
  const lines = [];
  for (const span of buildAsyncChainStepSpans(total, job.steps.length, job.parallelGroups)) {
    const steps = job.steps.slice(span.start, span.start + span.count);
    if (span.isParallel) {
      lines.push(...parallelWidgetGroupDetails(job, theme, { steps, total: span.count, stepIndex: span.stepIndex, chainTotal: total }, expanded, width, frame, false));
      continue;
    }
    const step = steps[0];
    if (!step) {
      lines.push(`  ${theme.fg("dim", `\u25E6 Step ${span.stepIndex + 1}/${total}: pending`)}`);
      continue;
    }
    lines.push(...foregroundStyleWidgetStepLines(job, theme, step, "Step", span.stepIndex + 1, total, expanded, width, frame));
  }
  return lines;
}
function widgetParallelAgentDetails(job, theme, expanded = false, width = getTermWidth(), frame) {
  if (!job.steps?.length) return [];
  if (job.mode !== "parallel" && job.mode !== "chain") return [];
  if (job.mode === "chain" && !job.activeParallelGroup && job.parallelGroups?.length) return widgetChainDetails(job, theme, expanded, width, frame);
  const group = activeParallelWidgetGroup(job);
  if (group) return parallelWidgetGroupDetails(job, theme, group, expanded, width, frame, Boolean(job.activeParallelGroup));
  const total = job.stepsTotal ?? job.steps.length;
  const lines = [];
  for (const [index, step] of job.steps.entries()) {
    const marker = index === job.steps.length - 1 ? "\u2514" : "\u251C";
    const activity = widgetStepActivity(step, job.updatedAt);
    const itemTitle = job.mode === "parallel" || job.activeParallelGroup ? "Agent" : "Step";
    const modelDisplay = modelThinkingBadge(theme, step.model, step.thinking);
    const label = compactTaskText(step.description, step.label);
    const display = step.sessionName?.trim() || (label ? `${label} (${step.agent})` : step.agent);
    const thinking = childThinkingLevel(step);
    lines.push(`  ${theme.fg("dim", `${marker} ${widgetStepGlyph(step.status, theme, widgetStepRunningSeed(step, index), frame, thinking)} ${itemTitle} ${index + 1}/${total}: ${display} \xB7 ${widgetStepStatus(step.status, theme, thinking)}${modelDisplay}${activity ? ` \xB7 ${activity}` : ""}`)}`);
    const lane = projectAsyncLane(job, step);
    if (lane) lines.push(...formatLaneProjectionLines(lane, theme, "    "));
    for (const nestedLine of formatNestedWidgetLines(step.children, theme, width, expanded, job.updatedAt, expanded ? 8 : 6)) lines.push(`    ${nestedLine}`);
  }
  return lines;
}
function parseParallelGroupAgentCount(label) {
  if (!label || !label.startsWith("[") || !label.endsWith("]")) return void 0;
  const inner = label.slice(1, -1).trim();
  if (!inner) return 0;
  return inner.split("+").map((part) => part.trim()).filter(Boolean).length;
}
function buildChainStepSpans(details) {
  if (details.workflowGraph?.nodes?.length) {
    const spans2 = [];
    let flatCursor = 0;
    for (const node of details.workflowGraph.nodes) {
      if (node.stepIndex === void 0) continue;
      if (node.kind === "parallel-group" || node.kind === "dynamic-parallel-group") {
        const childFlatIndexes = (node.children ?? []).map((child) => child.flatIndex).filter((value) => typeof value === "number");
        const start3 = childFlatIndexes.length ? Math.min(...childFlatIndexes) : flatCursor;
        const count = node.children?.length ?? 0;
        spans2.push({ stepIndex: node.stepIndex, start: start3, count, isParallel: true, status: node.status, label: node.label, error: node.error });
        flatCursor = Math.max(flatCursor, start3 + count);
        continue;
      }
      const start2 = node.flatIndex ?? flatCursor;
      spans2.push({ stepIndex: node.stepIndex, start: start2, count: 1, isParallel: false, status: node.status, label: node.label, error: node.error });
      flatCursor = Math.max(flatCursor, start2 + 1);
    }
    if (spans2.length) return spans2.sort((left, right) => left.stepIndex - right.stepIndex);
  }
  if (!details.chainAgents?.length) return [];
  const spans = [];
  let start = 0;
  for (let stepIndex = 0; stepIndex < details.chainAgents.length; stepIndex++) {
    const label = details.chainAgents[stepIndex];
    const parsedCount = parseParallelGroupAgentCount(label);
    const count = parsedCount ?? 1;
    spans.push({ stepIndex, start, count, isParallel: parsedCount !== void 0 });
    start += count;
  }
  return spans;
}
function buildAsyncChainStepSpans(total, stepCount, parallelGroups = []) {
  const groupsByStep = /* @__PURE__ */ new Map();
  for (const group of parallelGroups) {
    if (!groupsByStep.has(group.stepIndex)) groupsByStep.set(group.stepIndex, group);
  }
  const spans = [];
  let flatIndex = 0;
  for (let stepIndex = 0; stepIndex < total; stepIndex++) {
    const group = groupsByStep.get(stepIndex);
    if (group) {
      spans.push({ stepIndex, start: group.start, count: group.count, isParallel: true });
      flatIndex = Math.max(flatIndex, group.start + group.count);
      continue;
    }
    spans.push({ stepIndex, start: flatIndex, count: flatIndex < stepCount ? 1 : 0, isParallel: false });
    flatIndex++;
  }
  return spans;
}
function normalizedParallelDisplayText(value) {
  if (!value?.trim()) return void 0;
  const normalized = oneLine(value);
  return normalized && normalized !== PROMPT_REDACTED ? normalized : void 0;
}
function parallelWidgetStepDisplayName(step) {
  const agent = normalizedParallelDisplayText(step.agent);
  const explicitLabel = normalizedParallelDisplayText(step.label);
  if (explicitLabel) {
    const label = compactTaskText(step.description, explicitLabel) ?? explicitLabel;
    return agent ? `${label} (${agent})` : label;
  }
  const sessionName = normalizedParallelDisplayText(step.sessionName);
  if (sessionName) {
    const sessionTask = stripRepeatedAgentPrefix(sessionName, agent);
    if (sessionTask && sessionTask !== PROMPT_REDACTED && sessionTask.toLowerCase() !== agent?.toLowerCase()) return sessionTask;
  }
  return compactTaskText(step.description) ?? agent ?? "subagent";
}
function parallelWidgetStepPriority(step) {
  if (step.status === "running" || step.activityState === "needs_attention") return 0;
  switch (step.status) {
    case "failed":
    case "rejected":
    case "partial":
    case "stopped":
    case "paused":
      return 1;
    case "complete":
    case "completed":
      return 2;
    default:
      return 3;
  }
}
function parallelWidgetStepRows(steps, total, prioritizeActive) {
  const indexed = steps.map((step, index) => ({ step, index, displayName: parallelWidgetStepDisplayName(step) }));
  if (prioritizeActive) indexed.sort((left, right) => parallelWidgetStepPriority(left.step) - parallelWidgetStepPriority(right.step) || left.index - right.index);
  return withDuplicateLabelDiscriminators(indexed, total).map(({ displayName, ...row }) => row);
}
function activeParallelWidgetGroup(job) {
  const steps = job.steps ?? [];
  if (!steps.length) return void 0;
  if (job.mode === "parallel") return { steps, total: job.stepsTotal ?? steps.length };
  if (job.mode !== "chain" || !job.activeParallelGroup) return void 0;
  const chainTotal = job.chainStepCount ?? job.stepsTotal ?? steps.length;
  const spans = buildAsyncChainStepSpans(chainTotal, steps.length, job.parallelGroups);
  const currentStep = job.currentStep;
  const activeSpan = currentStep === void 0 ? spans.find((span) => span.isParallel) : spans.find((span) => span.isParallel && currentStep >= span.start && currentStep < span.start + span.count);
  return {
    steps,
    total: activeSpan?.count ?? job.stepsTotal ?? steps.length,
    stepIndex: activeSpan?.stepIndex,
    chainTotal
  };
}
function parallelWidgetGroupHeader(group, theme, frame) {
  const status = aggregateStepStatus(group.steps);
  const label = group.stepIndex !== void 0 && group.chainTotal !== void 0 ? `Step ${group.stepIndex + 1}/${group.chainTotal}: parallel group` : "parallel group";
  return `  ${widgetStepGlyph(status, theme, widgetStepsRunningSeed(group.steps), frame)} ${themeBold(theme, label)} ${theme.fg("dim", "\xB7")} ${theme.fg("dim", formatParallelOutcome(group.steps, group.total))}`;
}
function parallelWidgetGroupDetails(job, theme, group, expanded, width, frame, prioritizeActive) {
  const lines = [parallelWidgetGroupHeader(group, theme, frame)];
  const rows = parallelWidgetStepRows(group.steps, group.total, prioritizeActive);
  for (const [rowIndex, row] of rows.entries()) {
    const marker = rowIndex === rows.length - 1 && rows.length >= group.total ? "\u2514\u2500" : "\u251C\u2500";
    lines.push(...foregroundStyleWidgetStepLines(job, theme, row.step, "Agent", row.index + 1, group.total, expanded, width, frame, {
      rowLabel: row.rowLabel,
      rowIndent: "    ",
      detailIndent: "      ",
      rowMarker: marker,
      includeCurrentPath: true
    }));
  }
  for (let index = rows.length; index < group.total; index++) {
    const marker = index === group.total - 1 ? "\u2514\u2500" : "\u251C\u2500";
    lines.push(`    ${marker} ${theme.fg("muted", "\u25E6")} ${theme.fg("dim", "pending")}`);
  }
  return lines;
}
function isDoneResult(result) {
  const status = result.progress?.status;
  if (status === "completed") return true;
  if (status === "running" || status === "pending") return false;
  if (result.interrupted || result.detached) return false;
  return result.exitCode === 0;
}
function workflowGraphHasStatus(details, statuses) {
  return details.workflowGraph?.nodes.some((node) => statuses.includes(node.status)) ?? false;
}
function chainSpanStatus(details, span) {
  if (span.status) return span.status;
  const results = details.results.slice(span.start, span.start + span.count);
  if (results.some((result) => isResultRunning(result))) return "running";
  if (results.some((result) => !hasTerminalResultFlag(result) && (result.progress?.status === "failed" || result.exitCode !== 0) && !isResultRunning(result))) return "failed";
  if (results.some((result) => result.stopped)) return "stopped";
  if (results.some((result) => result.interrupted)) return "paused";
  if (results.some((result) => result.detached || result.progress?.status === "detached")) return "detached";
  if (results.length < span.count) return "pending";
  if (results.length > 0 && results.every(isDoneResult)) return "completed";
  return "pending";
}
function withDuplicateForegroundLabels(entries, total) {
  return withDuplicateLabelDiscriminators(
    entries.map((entry) => ({ ...entry, index: entry.displayIndex, displayName: entry.agentName })),
    total
  ).map(({ displayName, rowLabel, ...entry }) => ({
    ...entry,
    rowLabel: rowLabel === displayName ? void 0 : rowLabel.slice(0, -(displayName.length + 2))
  }));
}
function buildChainRenderEntries(details, label) {
  if (details.mode !== "chain" || !label.hasParallelInChain || label.showActiveGroupOnly) return void 0;
  const entries = [];
  for (const span of buildChainStepSpans(details)) {
    if (span.isParallel) {
      entries.push({
        kind: "group",
        stepLabel: `Step ${span.stepIndex + 1}/${label.logicalStepCount}: parallel group`,
        groupLabel: span.label?.trim() || void 0,
        status: chainSpanStatus(details, span),
        error: span.error
      });
      const groupEntries = [];
      for (let index = span.start; index < span.start + span.count; index++) {
        const result = details.results[index];
        const localIndex = foregroundResultIndex(details, index);
        const displayIndex = localIndex >= span.start && localIndex < span.start + span.count ? localIndex - span.start : index - span.start;
        groupEntries.push({
          kind: "result",
          resultIndex: index,
          rowNumber: index - span.start + 1,
          agentName: foregroundResultDisplayName(details, index, result, `agent-${displayIndex + 1}`),
          displayIndex,
          isParallel: true
        });
      }
      entries.push(...withDuplicateForegroundLabels(groupEntries, span.count));
      continue;
    }
    for (let index = span.start; index < span.start + span.count; index++) {
      const result = details.results[index];
      entries.push({
        kind: "result",
        resultIndex: index,
        rowNumber: span.stepIndex + 1,
        rowLabel: resultRowLabel(label, span.stepIndex + 1),
        agentName: foregroundResultDisplayName(details, index, result, details.chainAgents?.[span.stepIndex] ?? `step-${span.stepIndex + 1}`),
        displayIndex: foregroundResultIndex(details, index)
      });
    }
  }
  return entries;
}
function buildMultiProgressLabel(details, hasRunning) {
  const stepSpans = buildChainStepSpans(details);
  const hasParallelInChain = details.mode === "chain" && stepSpans.some((span) => span.isParallel);
  const activeParallelGroup = details.mode === "chain" && details.currentStepIndex !== void 0 && stepSpans.some((span) => span.stepIndex === details.currentStepIndex && span.isParallel);
  const itemTitle = details.mode === "parallel" || activeParallelGroup ? "Agent" : "Step";
  if (details.mode === "parallel") {
    const totalCount2 = details.totalSteps ?? details.results.length;
    const statuses = new Array(totalCount2).fill("pending");
    for (const progress of details.progress ?? []) {
      if (progress.index >= 0 && progress.index < totalCount2) statuses[progress.index] = progress.status;
    }
    for (let i = 0; i < details.results.length; i++) {
      const result = details.results[i];
      const progressFromArray = details.progress?.find((progress) => progress.index === i) || details.progress?.find((progress) => progress.agent === result.agent && progress.status === "running");
      const index = result.progress?.index ?? progressFromArray?.index ?? i;
      if (index < 0 || index >= totalCount2) continue;
      const status = result.stopped ? "stopped" : result.interrupted || result.detached ? "detached" : result.progress?.status ?? (result.exitCode === 0 ? "completed" : "failed");
      statuses[index] = status;
    }
    const running = statuses.filter((status) => status === "running").length;
    const done2 = statuses.filter((status) => status === "completed").length;
    const headerLabel2 = hasRunning ? `${formatAgentRunningLabel(running)} \xB7 ${done2}/${totalCount2} done` : `${done2}/${totalCount2} done`;
    return { headerLabel: headerLabel2, itemTitle, totalCount: totalCount2, hasParallelInChain, activeParallelGroup, groupStartIndex: 0, groupEndIndex: totalCount2, showActiveGroupOnly: false, logicalStepCount: totalCount2 };
  }
  if (activeParallelGroup) {
    const currentStepIndex = details.currentStepIndex;
    const span = stepSpans[currentStepIndex];
    const groupSize = span?.count ?? 1;
    const groupStart = span?.start ?? 0;
    const groupEnd = groupStart + groupSize;
    let running = 0;
    let done2 = 0;
    for (let index = groupStart; index < groupEnd; index++) {
      const progressEntry = details.progress?.find((progress) => progress.index === index);
      const resultEntry = details.results.find((result) => result.progress?.index === index) ?? details.results[index];
      if (progressEntry?.status === "running" && (!resultEntry || !hasTerminalResultFlag(resultEntry))) {
        running++;
        continue;
      }
      if (progressEntry?.status === "completed") {
        done2++;
        continue;
      }
      if (resultEntry && isDoneResult(resultEntry)) done2++;
    }
    const totalSteps = details.totalSteps ?? details.chainAgents?.length ?? 1;
    const headerLabel2 = hasRunning ? `step ${currentStepIndex + 1}/${totalSteps} \xB7 parallel group: ${formatAgentRunningLabel(running)} \xB7 ${done2}/${groupSize} done` : `step ${currentStepIndex + 1}/${totalSteps} \xB7 parallel group: ${done2}/${groupSize} done`;
    return { headerLabel: headerLabel2, itemTitle, totalCount: groupSize, hasParallelInChain, activeParallelGroup, groupStartIndex: groupStart, groupEndIndex: groupEnd, showActiveGroupOnly: true, logicalStepCount: totalSteps };
  }
  if (details.mode === "chain" && details.chainAgents?.length) {
    const totalCount2 = details.totalSteps ?? details.chainAgents.length;
    const doneLogical = stepSpans.filter((span) => {
      if (span.status && span.status !== "completed") return false;
      if (span.count === 0) return span.status === "completed";
      for (let index = span.start; index < span.start + span.count; index++) {
        const progressEntry = details.progress?.find((progress) => progress.index === index);
        const resultEntry = details.results.find((result) => result.progress?.index === index) ?? details.results[index];
        if (progressEntry?.status === "running" || progressEntry?.status === "pending" || progressEntry?.status === "failed") return false;
        if (!resultEntry || !isDoneResult(resultEntry)) return false;
      }
      return true;
    }).length;
    const currentStep2 = details.currentStepIndex !== void 0 ? details.currentStepIndex + 1 : Math.min(totalCount2, doneLogical + (hasRunning ? 1 : 0));
    const headerLabel2 = hasRunning ? `step ${currentStep2}/${totalCount2}` : `step ${doneLogical}/${totalCount2}`;
    return { headerLabel: headerLabel2, itemTitle, totalCount: totalCount2, hasParallelInChain, activeParallelGroup, groupStartIndex: 0, groupEndIndex: details.results.length, showActiveGroupOnly: false, logicalStepCount: totalCount2 };
  }
  const totalCount = details.totalSteps ?? details.results.length;
  const currentStep = details.currentStepIndex !== void 0 ? details.currentStepIndex + 1 : Math.min(totalCount, details.results.filter(isDoneResult).length + (hasRunning ? 1 : 0));
  const done = details.results.filter(isDoneResult).length;
  const headerLabel = hasRunning ? `step ${currentStep}/${totalCount}` : `step ${done}/${totalCount}`;
  return { headerLabel, itemTitle, totalCount, hasParallelInChain, activeParallelGroup, groupStartIndex: 0, groupEndIndex: details.results.length, showActiveGroupOnly: false, logicalStepCount: totalCount };
}
function resultRowLabel(label, stepNumber) {
  if (label.itemTitle === "Agent") return void 0;
  if (shouldSuppressSingleStep(label.logicalStepCount)) return void 0;
  return `Step ${stepNumber}/${label.logicalStepCount}`;
}
function buildForegroundResultEntries(details, label, displayStart, displayEnd, useResultsDirectly) {
  const fallbackLabel = label.itemTitle.toLowerCase();
  const entries = Array.from({ length: displayEnd - displayStart }, (_, offset) => {
    const index = displayStart + offset;
    const result = details.results[index];
    const stableIndex = foregroundResultIndex(details, index);
    const rowNumber = label.showActiveGroupOnly ? index - label.groupStartIndex + 1 : stableIndex + 1;
    const fallbackAgent = useResultsDirectly ? result?.agent || `${fallbackLabel}-${rowNumber}` : details.chainAgents[index] || result?.agent || `${fallbackLabel}-${rowNumber}`;
    const displayIndex = label.activeParallelGroup && stableIndex >= label.groupStartIndex && stableIndex < label.groupEndIndex ? stableIndex - label.groupStartIndex : label.activeParallelGroup ? index - label.groupStartIndex : stableIndex;
    return {
      kind: "result",
      resultIndex: index,
      rowNumber,
      rowLabel: resultRowLabel(label, rowNumber),
      agentName: foregroundResultDisplayName(details, index, result, fallbackAgent),
      displayIndex
    };
  });
  return label.itemTitle === "Agent" ? withDuplicateForegroundLabels(entries, label.totalCount) : entries;
}
function widgetStats(job, theme, projection = buildWorkflowWidgetProjection(job), collapsed = false) {
  const parts = [];
  const { stageProgress } = projection;
  const stepsTotal = stageProgress?.total ?? job.stepsTotal ?? (job.agents?.length ?? 1);
  const isSingleChild = isSingleChildAsyncJob(job);
  const checklistPrimary = collapsed && job.mode === "workflow" && projection.checklist !== void 0;
  if (checklistPrimary) {
    parts.push(formatWorkflowChecklistSummary(projection.checklist));
  } else if (stageProgress) {
    const currentStage = stageProgress.current !== void 0 ? projection.stages[stageProgress.current] : void 0;
    const focus = currentStage ? [compactTaskText(void 0, currentStage.label) ?? boundedLaneValue(currentStage.id), currentStage.agent ? boundedLaneValue(currentStage.agent) : "", workflowNodeStatusLabel(currentStage.status)].filter(Boolean) : [];
    parts.push(["staged lane", stageProgress.current !== void 0 ? `stage ${stageProgress.current + 1}/${stageProgress.total}` : `${stageProgress.total} stages`, ...focus].join(" \xB7 "));
  } else if (job.activeParallelGroup) {
    const running = job.runningSteps ?? (job.status === "running" ? 1 : 0);
    const done = job.completedSteps ?? (job.status === "complete" ? stepsTotal : 0);
    if (job.mode === "parallel") {
      if (job.status === "running" && running > 0) parts.push(formatAgentRunningLabel(running));
      if (stepsTotal > 0) parts.push(`${done}/${stepsTotal} done`);
    } else {
      const activeGroup = job.currentStep !== void 0 ? job.parallelGroups?.find((group) => job.currentStep >= group.start && job.currentStep < group.start + group.count) : job.parallelGroups?.find((group) => group.start === 0);
      const logicalStep = activeGroup?.stepIndex ?? job.currentStep ?? 0;
      const total = job.chainStepCount ?? stepsTotal;
      const groupParts = [`${done}/${stepsTotal} done`];
      if (job.status === "running" && running > 0) groupParts.unshift(formatAgentRunningLabel(running));
      parts.push(`step ${logicalStep + 1}/${total} \xB7 parallel group: ${groupParts.join(" \xB7 ")}`);
    }
  } else if (job.currentStep !== void 0) {
    if (job.mode === "chain") {
      const total = job.chainStepCount ?? stepsTotal;
      parts.push(`step ${flatToLogicalStepIndex(job.currentStep, total, job.parallelGroups ?? []) + 1}/${total}`);
    } else if (!isSingleChild) {
      parts.push(`step ${job.currentStep + 1}/${stepsTotal}`);
    }
  } else if (stepsTotal > 1) {
    parts.push(`steps ${stepsTotal}`);
  }
  if (projection.checklist && !checklistPrimary) parts.push(formatWorkflowChecklistSummary(projection.checklist));
  if (job.toolCount !== void 0) parts.push(formatToolUseStat(job.toolCount));
  if (job.totalTokens?.total) parts.push(formatTokenUsage(job.totalTokens, "token"));
  const end = job.status === "running" && (job.mode === "workflow" || job.parentWorkflowRunId) ? projection.now : job.updatedAt;
  if (job.status !== "queued" && job.startedAt !== void 0 && end !== void 0) parts.push(formatDuration(Math.max(0, end - job.startedAt)));
  return statJoin(theme, parts);
}
function widgetStepStats(theme, step, snapshotNow = Date.now()) {
  const externalElapsed = step.runner?.type === "external-cli" && step.externalProcess ? step.externalProcess.durationMs ?? Math.max(0, (step.externalProcess.endedAt ?? snapshotNow) - step.externalProcess.startedAt) : void 0;
  return statJoin(theme, [
    step.runner?.type === "external-cli" ? "external-cli" : "",
    step.turnCount !== void 0 ? `${step.turnCount} turns` : "",
    step.toolCount !== void 0 ? formatToolUseStat(step.toolCount) : "",
    step.tokens ? step.contextLimit !== void 0 ? formatContextUsage(step.tokens, step.contextLimit) ?? formatTokenUsage(step.tokens, "token") : step.tokens.total ? formatTokenUsage(step.tokens, "token") : "" : "",
    externalElapsed !== void 0 ? formatDuration(externalElapsed) : step.durationMs !== void 0 ? formatDuration(step.durationMs) : ""
  ]);
}
function modelThinkingBadge(theme, model, thinking) {
  const label = formatModelThinking(model, thinking);
  return label ? theme.fg("dim", ` (${label})`) : "";
}
function widgetStepActivityLine(step, width, expanded, snapshotNow) {
  const toolLine = formatCurrentToolLine(step, width, expanded, snapshotNow);
  if (toolLine) return toolLine;
  const activity = buildLiveStatusLine(step, snapshotNow);
  if (activity) return activity;
  if (step.status === "running") return "thinking\u2026";
  return "";
}
function widgetOutputPath(job, step) {
  if (typeof step.index !== "number") return void 0;
  return path.join(job.asyncDir, `output-${step.index}.log`);
}
function nestedRunName(run) {
  if (run.sessionName?.trim()) return run.sessionName.trim();
  if (run.agent) return run.agent;
  if (run.agents?.length) return formatWidgetAgents(run.agents);
  return run.id;
}
function nestedStatusGlyph(state, theme, seed, thinking) {
  if (state === "running") return runningTone(theme, thinking)(runningGlyph(seed));
  if (state === "complete" || state === "completed") return theme.fg("success", "\u2713");
  if (state === "failed") return theme.fg("error", "\u2717");
  if (state === "partial") return theme.fg("warning", "\u25A0");
  if (state === "paused") return theme.fg("warning", "\u25A0");
  if (state === "stopped") return theme.fg("warning", "\u25A0");
  return theme.fg("muted", "\u25E6");
}
function nestedRunSeed(run) {
  return runningSeed(run.lastUpdate, run.lastActivityAt, run.currentStep, run.toolCount, run.turnCount, run.totalTokens?.total, run.currentToolStartedAt);
}
function formatClockTime(ms) {
  if (ms === void 0 || !Number.isFinite(ms)) return void 0;
  const date = new Date(ms);
  const pad = (value) => value.toString().padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function nestedRunEventTime(run) {
  return run.state === "running" ? run.lastActivityAt ?? run.currentToolStartedAt ?? run.lastUpdate ?? run.startedAt : run.endedAt ?? run.lastUpdate ?? run.lastActivityAt ?? run.startedAt;
}
function nestedStepTimestamp(step, fallback) {
  return formatClockTime(step.status === "running" ? step.lastActivityAt ?? step.currentToolStartedAt ?? fallback ?? step.startedAt : step.endedAt ?? step.lastActivityAt ?? fallback ?? step.startedAt);
}
function nestedTimestampPrefix(timestamp) {
  return timestamp ? `[${timestamp}] ` : "";
}
function nestedActivity(input, state, snapshotNow) {
  const facts = [];
  if (input.currentTool && input.currentToolStartedAt !== void 0 && snapshotNow !== void 0) facts.push(`${input.currentTool} ${formatDuration(Math.max(0, snapshotNow - input.currentToolStartedAt))}`);
  else if (input.currentTool) facts.push(input.currentTool);
  if (input.currentPath) facts.push(shortenPath(input.currentPath));
  if (input.turnCount !== void 0) facts.push(`${input.turnCount} turns`);
  if (input.toolCount !== void 0) facts.push(`${input.toolCount} tools`);
  const activity = buildLiveStatusLine(input, snapshotNow);
  if (activity && facts.length) return `${activity} \xB7 ${facts.join(" \xB7 ")}`;
  if (activity) return activity;
  if (facts.length) return facts.join(" \xB7 ");
  if (state === "running") return "thinking\u2026";
  if (state === "queued" || state === "pending") return "queued\u2026";
  if (state === "paused") return "Paused";
  if (state === "stopped") return "Stopped";
  if (state === "partial") return "Partial";
  if (state === "failed") return "Failed";
  return "Done";
}
function formatNestedWidgetLines(children, theme, width, expanded, snapshotNow, lineBudget = expanded ? 12 : 1) {
  if (!children?.length || lineBudget <= 0) return [];
  if (!expanded) {
    const rows = [];
    const maxLeaves = 4;
    const maxLines = Math.min(6, lineBudget);
    let leaves = 0;
    let overflow = 0;
    const appendLeaf = (step, prefix, fallback) => {
      if (leaves >= maxLeaves) {
        overflow++;
        return;
      }
      leaves++;
      const state = "status" in step ? step.status : step.state;
      const modelThinking = formatModelThinking(step.model, step.thinking);
      const activity = nestedActivity(step, state, snapshotNow ?? fallback);
      const timestamp = "status" in step ? nestedStepTimestamp(step, fallback) : formatClockTime(nestedRunEventTime(step));
      const error = step.error ? ` \xB7 ${step.error}` : "";
      const name = "status" in step ? childDisplayName(step) : nestedRunName(step);
      rows.push({
        prefix,
        text: `${nestedTimestampPrefix(timestamp)}${nestedStatusGlyph(state, theme, void 0, childThinkingLevel(step))} ${name} \xB7 ${state}${modelThinking ? ` \xB7 ${modelThinking}` : ""}${activity ? ` \xB7 ${activity}` : ""}${error}`
      });
    };
    for (const child of children) {
      const steps = child.mode === "parallel" || child.mode === "chain" ? child.steps ?? [] : [];
      if (steps.length > 0) {
        const ownerModelThinking = formatModelThinking(child.model, child.thinking);
        const ownerActivity = nestedActivity(child, child.state, snapshotNow ?? child.lastUpdate);
        const ownerError = child.error ? ` \xB7 ${child.error}` : "";
        rows.push({
          prefix: "\u21B3 ",
          text: `OWNER ${nestedStatusGlyph(child.state, theme, nestedRunSeed(child), childThinkingLevel(child))} ${nestedRunName(child)} \xB7 ${child.state}${ownerModelThinking ? ` \xB7 ${ownerModelThinking}` : ""}${ownerActivity ? ` \xB7 ${ownerActivity}` : ""}${ownerError}`
        });
        for (const step of steps) appendLeaf(step, "\u21B3 \u2502  ", child.lastUpdate);
      } else {
        appendLeaf(child, "\u21B3 ", child.lastUpdate);
      }
    }
    if (overflow > 0) rows.push({ prefix: "\u21B3 ", text: `\u2026 +${overflow} more nested leaves` });
    const visibleRows = rows.length <= maxLines ? rows : overflow > 0 ? [...rows.slice(0, Math.max(0, maxLines - 1)), rows.at(-1)] : rows.slice(0, maxLines);
    return visibleRows.map((row, index) => {
      const marker = index === visibleRows.length - 1 ? "\u2514\u2500" : "\u251C\u2500";
      const prefix = row.prefix;
      const text = row.text.startsWith("OWNER ") ? row.text.slice("OWNER ".length) : row.text;
      return truncLine(theme.fg("dim", `${prefix}${marker} ${text}`), width);
    });
  }
  const lines = [];
  const maxDepth = 2;
  const append = (items, depth, prefix) => {
    if (!items?.length || lines.length >= lineBudget) return;
    if (depth > maxDepth) {
      const aggregate = formatNestedAggregate(items);
      if (aggregate && lines.length < lineBudget) lines.push(theme.fg("dim", `${prefix}\u21B3 ${aggregate}`));
      return;
    }
    for (let index = 0; index < items.length; index++) {
      const child = items[index];
      if (lines.length >= lineBudget) {
        const aggregate = formatNestedAggregate(items.slice(index));
        if (aggregate) lines[lines.length - 1] = theme.fg("dim", `${prefix}\u21B3 ${aggregate}`);
        return;
      }
      const activity = nestedActivity(child, child.state, snapshotNow ?? child.lastUpdate);
      const error = child.error ? ` \xB7 ${child.error}` : "";
      const modelThinking = formatModelThinking(child.model, child.thinking);
      lines.push(theme.fg("dim", `${prefix}\u21B3 ${nestedTimestampPrefix(formatClockTime(nestedRunEventTime(child)))}${nestedStatusGlyph(child.state, theme, nestedRunSeed(child), childThinkingLevel(child))} ${nestedRunName(child)} \xB7 ${child.state}${modelThinking ? ` \xB7 ${modelThinking}` : ""} \xB7 ${activity}${error}`));
      if (depth === maxDepth) {
        const aggregate = formatNestedAggregate([...child.steps?.flatMap((step) => step.children ?? []) ?? [], ...child.children ?? []]);
        if (aggregate && lines.length < lineBudget) lines.push(theme.fg("dim", `${prefix}  \u21B3 ${aggregate}`));
        continue;
      }
      for (const step of child.steps ?? []) {
        if (lines.length >= lineBudget) return;
        const modelThinking2 = formatModelThinking(step.model, step.thinking);
        lines.push(theme.fg("dim", `${prefix}  \u21B3 ${nestedTimestampPrefix(nestedStepTimestamp(step, child.lastUpdate))}${nestedStatusGlyph(step.status, theme, void 0, childThinkingLevel(step))} ${childDisplayName(step)} \xB7 ${step.status}${modelThinking2 ? ` \xB7 ${modelThinking2}` : ""} \xB7 ${nestedActivity(step, step.status, snapshotNow ?? child.lastUpdate)}`));
        append(step.children, depth + 1, `${prefix}    `);
      }
      append(child.children, depth + 1, `${prefix}  `);
    }
  };
  append(children, 0, "");
  return lines.map((line) => truncLine(line, width));
}
function foregroundStyleWidgetStepLines(job, theme, step, itemTitle, index, total, expanded, width, frame, options) {
  const rowIndent = options?.rowIndent ?? "  ";
  const detailIndent = options?.detailIndent ?? "    ";
  const thinking = childThinkingLevel(step);
  const status = widgetStepStatus(step.status, theme, thinking);
  const stats = widgetStepStats(theme, step, job.updatedAt);
  const modelDisplay = modelThinkingBadge(theme, step.model, step.thinking);
  const collapseDetails = shouldCollapseSingleChildDetails(job, step);
  const displayName = collapseDetails ? singleChildAgentName(job, step) : childDisplayName(step);
  const stageName = itemTitle === "Stage" ? compactTaskText(void 0, step.label) ?? boundedLaneValue(step.workflowKey) ?? displayName : void 0;
  const stageIdentity = stageName && stageName !== displayName ? `${stageName} (${displayName})` : stageName ?? displayName;
  const rowLabel = collapseDetails ? displayName : options?.rowLabel ?? `${itemTitle} ${index}/${total}: ${itemTitle === "Stage" ? stageIdentity : displayName}`;
  const rowMarker = options?.rowMarker ? `${options.rowMarker} ` : "";
  const lines = [`${rowIndent}${rowMarker}${widgetStepGlyph(step.status, theme, widgetStepRunningSeed(step, index - 1), frame, thinking)} ${themeBold(theme, rowLabel)}${contextModeBadge(theme, step.context)} ${theme.fg("dim", "\xB7")} ${status}${modelDisplay}${stats ? ` ${theme.fg("dim", "\xB7")} ${stats}` : ""}`];
  const lane = projectAsyncLane(job, step);
  if (lane) lines.push(...formatLaneProjectionLines(lane, theme, detailIndent));
  const task = collapseDetails ? stepTaskSummary(step, displayName) : compactTaskText(step.description, step.label);
  if (task) lines.push(`${detailIndent}${theme.fg("dim", `task: ${task}`)}`);
  const activity = widgetStepActivityLine(step, width, expanded, job.updatedAt);
  const currentPath = options?.includeCurrentPath && step.currentPath ? shortenPath(step.currentPath) : void 0;
  const activityWithPath = currentPath && activity && !activity.includes(currentPath) ? `${activity} \xB7 ${currentPath}` : activity ?? currentPath;
  if (activityWithPath) lines.push(`${detailIndent}${theme.fg("dim", `\u23BF  ${activityWithPath}`)}`);
  for (const nestedLine of formatNestedWidgetLines(step.children, theme, width, expanded, job.updatedAt, expanded ? 12 : 6)) {
    lines.push(`${detailIndent}${nestedLine}`);
  }
  const error = step.error?.trim() || step.execution?.error?.trim();
  if (error) lines.push(`${detailIndent}${theme.fg("error", `error: ${oneLine(error)}`)}`);
  if (step.status === "running") {
    if (!expanded) lines.push(`${detailIndent}${theme.fg("accent", liveDetailHintText())}`);
    const output = widgetOutputPath(job, step);
    if (output) lines.push(`${detailIndent}${theme.fg("dim", `output: ${shortenPath(output)}`)}`);
    if (expanded) {
      const liveStatus = buildLiveStatusLine(step, job.updatedAt);
      if (liveStatus && liveStatus !== activity) lines.push(`${detailIndent}${theme.fg("accent", liveStatus)}`);
      for (const tool of step.recentTools?.slice(-3) ?? []) {
        const maxArgsLen = Math.max(40, width - 30);
        const argsPreview = renderToolArgsPreview(tool.args, maxArgsLen, expanded);
        lines.push(`${detailIndent}  ${theme.fg("dim", `${tool.tool}${argsPreview ? `: ${argsPreview}` : ""}`)}`);
      }
      for (const line of compactRecentOutputLines(step.recentOutput)) {
        lines.push(`${detailIndent}  ${theme.fg("dim", line)}`);
      }
    }
  }
  return lines;
}
function hostStepWidgetLines(job, theme, indent) {
  const rows = projectAsyncWorkflowRows([], job.hostSteps).filter((row) => row.kind);
  const visible = rows.slice(0, 8);
  const lines = visible.map((row) => {
    const state = hostStepVerdictLabel(row.state, row.verdict);
    const glyph = state === "running" ? theme.fg("accent", "\u25CF") : state === "pending" ? theme.fg("muted", "\u25E6") : state === "pass" ? theme.fg("success", "\u2713") : state === "fail" || state === "error" ? theme.fg("error", "\u2717") : theme.fg("warning", "\u25A0");
    const details = [
      row.provider ? `provider:${row.provider}` : void 0,
      row.role ? `role:${row.role}` : void 0,
      row.target,
      row.detail,
      row.reasonCode ? `reason:${row.reasonCode}` : void 0,
      row.freshness?.stale ? "stale" : row.freshness?.observedRef ? `ref:${row.freshness.observedRef}` : void 0,
      row.reportPath ? `out:${hostStepReportName(row.reportPath)}` : void 0
    ].filter(Boolean).join(" \xB7 ");
    return `${indent}${glyph} ${row.kind}: ${row.name} \xB7 ${state}${details ? ` \xB7 ${details}` : ""}`;
  });
  if (rows.length > visible.length) lines.push(`${indent}${theme.fg("dim", `\u2026 +${rows.length - visible.length} host steps hidden`)}`);
  return lines;
}
function foregroundStyleWidgetDetails(job, theme, expanded, width, frame, projection = buildWorkflowWidgetProjection(job)) {
  const steps = projection.steps.filter((step) => !projection.materializedKeys?.has(step.workflowKey ?? "") && !projection.materializedKeys?.has(step.runId ?? ""));
  const checklist = widgetChecklistWithoutMaterializedChildren(projection);
  if (!expanded && job.mode === "workflow") {
    return compactWorkflowWidgetBodyLines(job, theme, frame, projection);
  }
  if (!steps.length) {
    const lane = projectAsyncLane(job, laneStepForJob(job, steps));
    return [
      ...expanded ? workflowPreflightLines(job) : [],
      ...workflowChecklistWidgetLines(checklist, theme, "  ", expanded, frame),
      ...lane ? formatLaneProjectionLines(lane, theme, "  ") : [],
      ...hostStepWidgetLines(job, theme, "  "),
      `  ${theme.fg("dim", `\u23BF  ${widgetActivity(job)}`)}`,
      ...formatNestedWidgetLines(job.nestedChildren, theme, width, expanded, job.updatedAt, expanded ? 12 : 6).map((line) => `  ${line}`)
    ];
  }
  if (job.mode === "chain" && !job.activeParallelGroup && job.parallelGroups?.length) return widgetChainDetails(job, theme, expanded, width, frame);
  const lines = [
    ...expanded ? workflowPreflightLines(job) : [],
    ...workflowChecklistWidgetLines(checklist, theme, "  ", expanded, frame, { includeItemErrors: !expanded })
  ];
  const group = activeParallelWidgetGroup(job);
  if (group) {
    lines.push(...parallelWidgetGroupDetails(job, theme, group, expanded, width, frame, Boolean(job.activeParallelGroup)));
  } else {
    const { stageProgress, plannedKeys } = projection;
    const total = job.mode === "chain" ? job.chainStepCount ?? job.stepsTotal ?? steps.length : stageProgress?.total ?? job.stepsTotal ?? steps.length;
    const stageTotal = stageProgress?.total ?? total;
    const extraStepCount = plannedKeys ? steps.filter((step) => step.workflowKey === void 0 || !plannedKeys.has(step.workflowKey)).length : total;
    let extraStepIndex = 0;
    for (const [index, step] of steps.entries()) {
      const isPlannedStage = plannedKeys !== void 0 && step.workflowKey !== void 0 && plannedKeys.has(step.workflowKey);
      const itemTitle = isPlannedStage ? "Stage" : "Step";
      const displayIndex = isPlannedStage ? (step.index ?? index) + 1 : plannedKeys ? ++extraStepIndex : index + 1;
      const displayTotal = isPlannedStage ? stageTotal : extraStepCount;
      lines.push(...foregroundStyleWidgetStepLines(job, theme, step, itemTitle, displayIndex, displayTotal, expanded, width, frame));
    }
  }
  lines.push(...hostStepWidgetLines(job, theme, "  "));
  const attached = new Set(steps.flatMap((step) => step.children?.map((child) => child.id) ?? []));
  const unattached = job.nestedChildren?.filter((child) => !attached.has(child.id)) ?? [];
  for (const nestedLine of formatNestedWidgetLines(unattached, theme, width, expanded, job.updatedAt, expanded ? 12 : 6)) {
    lines.push(`  ${nestedLine}`);
  }
  return lines;
}
function buildSingleWidgetLines(job, theme, width, expanded, frame, projection = buildWorkflowWidgetProjection(job)) {
  if ((!expanded || projection.inlineFleetCovered) && job.mode === "workflow") return [compactWorkflowHeaderLine(job, theme, width), ...compactWorkflowWidgetBodyLines(job, theme, frame, projection)].map((line) => truncLine(line, width));
  const stats = widgetStats(job, theme, projection, !expanded);
  const count = job.mode === "workflow" ? projection.checklist?.total ?? projection.stageProgress?.total ?? job.stepsTotal ?? job.agents?.length ?? job.steps?.length : job.mode === "chain" ? job.chainStepCount : projection.stageProgress?.total ?? job.stepsTotal ?? job.agents?.length ?? job.steps?.length;
  const mode = widgetJobName(job);
  const title = isSingleChildAsyncJob(job) ? "async subagent" : `async subagent ${mode}${count && count > 1 ? ` (${count})` : ""}`;
  const checklistPrimary = !expanded && job.mode === "workflow" && projection.checklist !== void 0;
  const collapseDetails = !checklistPrimary && job.steps?.length === 1 && shouldCollapseSingleChildDetails(job, job.steps[0]);
  const summary = `${widgetStatusGlyph(job, theme, frame)} ${themeBold(theme, mode)}${contextModeBadge(theme, job.context)}${stats ? ` ${theme.fg("dim", "\xB7")} ${stats}` : ""}`;
  return [
    `${theme.fg("toolTitle", themeBold(theme, title))} ${theme.fg("dim", "\xB7 background")}`,
    ...collapseDetails ? [] : [summary],
    ...foregroundStyleWidgetDetails(job, theme, expanded, width, frame, projection)
  ].map((line) => truncLine(line, width));
}
function compactSingleWidgetLines(job, theme, width, frame, projection = buildWorkflowWidgetProjection(job)) {
  const fullLines = buildSingleWidgetLines(job, theme, width, false, frame, projection);
  if (fullLines.length <= 10 || !job.steps?.length || job.mode !== "parallel" && !job.activeParallelGroup) return fullLines;
  const group = activeParallelWidgetGroup(job);
  if (!group) return fullLines;
  const rows = parallelWidgetStepRows(group.steps, group.total, Boolean(job.activeParallelGroup));
  const lines = fullLines.slice(0, 2);
  lines.push(parallelWidgetGroupHeader(group, theme, frame));
  for (const [rowIndex, row] of rows.entries()) {
    const step = row.step;
    const thinking = childThinkingLevel(step);
    const status = widgetStepStatus(step.status, theme, thinking);
    const activity = widgetStepActivityLine(step, width, false, job.updatedAt);
    const stepStats = widgetStepStats(theme, step, job.updatedAt);
    const activitySuffix = activity ? ` ${theme.fg("dim", "\xB7")} ${theme.fg("dim", activity)}` : "";
    const modelDisplay = modelThinkingBadge(theme, step.model, step.thinking);
    const task = compactTaskText(step.description, step.label);
    const taskSuffix = task ? ` ${theme.fg("dim", "\xB7")} ${theme.fg("dim", `task: ${task}`)}` : "";
    const marker = rowIndex === rows.length - 1 && rowIndex >= group.total - 1 ? "\u2514\u2500" : "\u251C\u2500";
    lines.push(`    ${marker} ${widgetStepGlyph(step.status, theme, widgetStepRunningSeed(step, row.index), frame, thinking)} ${themeBold(theme, row.rowLabel)}${contextModeBadge(theme, step.context)} ${theme.fg("dim", "\xB7")} ${status}${modelDisplay}${taskSuffix}${activitySuffix}${stepStats ? ` ${theme.fg("dim", "\xB7")} ${stepStats}` : ""}`);
    const lane = projectAsyncLane(job, step);
    if (lane) lines.push(...formatLaneProjectionLines(lane, theme, "      "));
    for (const nestedLine of formatNestedWidgetLines(step.children, theme, width, false, job.updatedAt, 6)) lines.push(`      ${nestedLine}`);
  }
  lines.push(...hostStepWidgetLines(job, theme, "  "));
  if (job.steps.some((step) => step.status === "running")) lines.push(theme.fg("accent", `  ${liveDetailHintText()}`));
  return lines.map((line) => truncLine(line, width));
}
var RESERVED_NON_WIDGET_ROWS = 19;
var widgetLayoutSession;
function resetWidgetLayoutSession() {
  widgetLayoutSession = void 0;
}
function estimateAvailableWidgetRows() {
  const rows = process.stdout.rows || 30;
  return Math.max(1, rows - RESERVED_NON_WIDGET_ROWS);
}
function currentTerminalRows() {
  return process.stdout.rows || 30;
}
function currentTerminalColumns() {
  return process.stdout.columns || 120;
}
function widgetSessionMatches(expanded) {
  return widgetLayoutSession?.expanded === expanded && widgetLayoutSession.rows === currentTerminalRows() && widgetLayoutSession.columns === currentTerminalColumns();
}
function widgetHeaderCounts(jobs) {
  return {
    running: jobs.filter((job) => job.status === "running"),
    queued: jobs.filter((job) => job.status === "queued"),
    complete: jobs.filter((job) => job.status === "complete"),
    failed: jobs.filter((job) => job.status === "failed"),
    paused: jobs.filter((job) => job.status === "paused"),
    stopped: jobs.filter((job) => job.status === "stopped")
  };
}
var roundStateByUi = /* @__PURE__ */ new WeakMap();
function trackSubagentsRound(ui, jobs, now) {
  const running = jobs.filter((job) => job.status === "running");
  if (running.length > 0) {
    if (!roundStateByUi.has(ui)) roundStateByUi.set(ui, { startedAt: Math.min(now, ...running.map((job) => job.startedAt ?? now)) });
    return;
  }
  roundStateByUi.delete(ui);
}
function roundElapsedSuffix(ui, now) {
  const state = roundStateByUi.get(ui);
  return state ? ` ${formatRoundElapsed(now - state.startedAt)}` : "";
}
function formatRoundElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1e3));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h${minutes}m${seconds}s`;
  if (minutes > 0) return `${minutes}m${seconds}s`;
  return `${seconds}s`;
}
function buildSingleLineWidgetLines(jobs, theme, width, frame, elapsedSuffix = "") {
  const counts = widgetHeaderCounts(jobs);
  const hasActive = counts.running.length > 0 || counts.queued.length > 0;
  const glyph = counts.running.length > 0 ? runningGlyph(animatedSeed(widgetJobsRunningSeed(counts.running), frame)) : hasActive ? "\u25CF" : "\u25CB";
  const parts = [];
  if (counts.running.length > 0) parts.push(`${counts.running.length}/${jobs.length} running${elapsedSuffix}`);
  if (counts.queued.length > 0) parts.push(`${counts.queued.length} queued`);
  if (counts.failed.length > 0) parts.push(`${counts.failed.length} failed`);
  if (counts.stopped.length > 0) parts.push(`${counts.stopped.length} stopped`);
  if (counts.paused.length > 0) parts.push(`${counts.paused.length} paused`);
  for (const status of ["partial", "rejected"]) {
    const count = jobs.filter((job) => job.status === status).length;
    if (count > 0) parts.push(`${count} ${status}`);
  }
  if (!hasActive && counts.complete.length > 0) parts.push(`${counts.complete.length}/${jobs.length} done`);
  const tone = activeHeaderTone(theme, hasActive);
  return [truncLine(`${tone(glyph)} ${tone("subagents")} (${parts.join(", ") || `${jobs.length} total`})`, width)];
}
function orderedWidgetJobs(jobs) {
  return [
    ...jobs.filter((job) => job.status === "running"),
    ...jobs.filter((job) => job.status === "queued"),
    ...jobs.filter((job) => job.status !== "running" && job.status !== "queued")
  ];
}
function progressiveJobKey(job) {
  return job.asyncId;
}
function isProgressiveActiveJob(job) {
  return job?.status === "running" || job?.status === "queued";
}
function selectProgressiveJobKeys(jobs, previousKeys, bodyRows) {
  if (bodyRows <= 0) return [];
  const jobsByKey = new Map(jobs.map((job) => [progressiveJobKey(job), job]));
  const selected = [];
  const append = (key) => {
    if (selected.includes(key) || !jobsByKey.has(key)) return;
    selected.push(key);
  };
  for (const key of previousKeys) {
    if (!isProgressiveActiveJob(jobsByKey.get(key))) continue;
    append(key);
    if (selected.length >= bodyRows) return selected;
  }
  for (const job of orderedWidgetJobs(jobs)) {
    if (!isProgressiveActiveJob(job)) continue;
    const key = progressiveJobKey(job);
    append(key);
    if (selected.length >= bodyRows) break;
  }
  if (selected.length >= bodyRows) return selected;
  for (const key of previousKeys) {
    if (isProgressiveActiveJob(jobsByKey.get(key))) continue;
    append(key);
    if (selected.length >= bodyRows) return selected;
  }
  for (const job of orderedWidgetJobs(jobs)) {
    const key = progressiveJobKey(job);
    append(key);
    if (selected.length >= bodyRows) break;
  }
  return selected;
}
function runningLeafAgentCount(job, projectionFor) {
  if (job.mode === "workflow") return (projectionFor(job).children ?? []).reduce((total, child) => total + runningLeafAgentCount(child, projectionFor), 0);
  if (job.status !== "running") return 0;
  const sequential = job.mode === "chain" && !job.activeParallelGroup;
  const current = job.currentStep ?? 0;
  const steps = job.steps?.length ? job.steps : job.agents?.map((_, index) => ({ index, status: sequential && index !== current ? "pending" : "running" }));
  if (!steps?.length) return 1;
  return steps.filter((step, offset) => ["running", "queued", "pending"].includes(step.status) && !(step.status === "pending" && sequential && (step.index ?? offset) !== current)).length;
}
function progressiveHeaderLine(jobs, theme, width, frame, projectionFor) {
  const counts = widgetHeaderCounts(jobs);
  const hasActive = counts.running.length > 0 || counts.queued.length > 0;
  const glyph = counts.running.length > 0 ? runningGlyph(animatedSeed(widgetJobsRunningSeed(counts.running), frame)) : hasActive ? "\u25CF" : "\u25CB";
  const parts = [];
  const runningAgents = jobs.reduce((total, job) => total + runningLeafAgentCount(job, projectionFor), 0);
  if (runningAgents > 0) parts.push(formatAgentRunningLabel(runningAgents));
  if (counts.queued.length > 0) parts.push(`${counts.queued.length} queued`);
  if (!hasActive) {
    if (counts.failed.length > 0) parts.push(`${counts.failed.length} failed`);
    if (counts.stopped.length > 0) parts.push(`${counts.stopped.length} stopped`);
    if (counts.paused.length > 0) parts.push(`${counts.paused.length} paused`);
    if (counts.complete.length > 0) parts.push(`${counts.complete.length}/${jobs.length} done`);
  }
  const tone = activeHeaderTone(theme, hasActive);
  return truncLine(`${tone(glyph)} ${tone("Async agents")} ${theme.fg("dim", "\xB7")} ${theme.fg("dim", parts.join(", ") || `${jobs.length} total`)}`, width);
}
function progressiveJobLine(job, theme, width, frame, projection = buildWorkflowWidgetProjection(job), compactRows = job.mode === "workflow" ? compactWorkflowLaneRows(job, projection.checklist) : void 0) {
  const compactWorkflow = job.mode === "workflow";
  const stats = compactWorkflow ? compactWorkflowStats(job, compactRows ?? [], theme, projection) : widgetStats(job, theme, projection, true);
  if (compactWorkflow) {
    const bottleneck = compactWorkflowBottleneck(compactRows ?? [], job);
    const suffix = [stats, bottleneck ? theme.fg(bottleneck.tone, `bottleneck \xB7 ${bottleneck.text}`) : void 0].filter((value) => Boolean(value)).join(` ${theme.fg("dim", "\xB7")} `);
    return truncLine(`  ${widgetStatusGlyph(job, theme, frame)} ${compactWorkflowHeaderLine(job, theme, Math.max(0, width - 4))}${suffix ? ` ${theme.fg("dim", "\xB7")} ${suffix}` : ""}`, width);
  }
  const activity = widgetActivity(job);
  const status = job.status === "complete" ? "done" : job.status;
  const lane = projectAsyncLane(job, laneStepForJob(job, projection.steps));
  const laneSummary = lane ? [lane.label ?? lane.role, lane.phase ? `phase:${lane.phase}` : void 0, lane.output ? `out:${lane.output}` : void 0, lane.workspace ? `workspace:${lane.workspace}` : `ref:${lane.ref}`].filter(Boolean).join(" \xB7 ") : "";
  const laneSignals = lane ? [lane.next ? `next:${lane.next}` : void 0, ...lane.chips.map((chip) => formatLaneChip(chip, theme))].filter(Boolean).join(" \xB7 ") : "";
  const parts = [
    `${themeBold(theme, widgetJobName(job))}${contextModeBadge(theme, job.context)}`,
    theme.fg("dim", status),
    laneSignals ? laneSignals : "",
    laneSummary ? theme.fg("dim", laneSummary) : "",
    stats,
    activity && activity.toLowerCase() !== status ? theme.fg("dim", activity) : ""
  ].filter(Boolean);
  return truncLine(`  ${widgetStatusGlyph(job, theme, frame)} ${parts.join(` ${theme.fg("dim", "\xB7")} `)}`, width);
}
function progressiveHiddenLine(hiddenJobs, theme, width) {
  const counts = widgetHeaderCounts(hiddenJobs);
  const parts = [];
  if (counts.running.length > 0) parts.push(`${counts.running.length} running`);
  if (counts.queued.length > 0) parts.push(`${counts.queued.length} queued`);
  const finished = counts.complete.length + counts.failed.length + counts.paused.length + counts.stopped.length;
  if (finished > 0) parts.push(`${finished} finished`);
  return truncLine(theme.fg("dim", `  +${hiddenJobs.length} more${parts.length ? ` (${parts.join(", ")})` : ""}`), width);
}
function buildProgressiveWidgetLines(jobs, theme, width, lockedRows, previousKeys, frame, projectionFor = workflowWidgetProjectionLookup(), elapsedSuffix = "") {
  const rowCount = Math.max(1, lockedRows);
  if (rowCount === 1) return { lines: buildSingleLineWidgetLines(jobs, theme, width, frame, elapsedSuffix), visibleJobKeys: [], contentRows: 1 };
  const bodyRows = rowCount - 1;
  let visibleJobKeys = selectProgressiveJobKeys(jobs, previousKeys, bodyRows);
  const jobsByKey = new Map(jobs.map((job) => [progressiveJobKey(job), job]));
  let visibleJobs = visibleJobKeys.map((key) => jobsByKey.get(key)).filter((job) => Boolean(job));
  let hiddenJobs = jobs.filter((job) => !visibleJobKeys.includes(progressiveJobKey(job)));
  const needsHiddenLine = hiddenJobs.length > 0;
  if (needsHiddenLine && visibleJobs.length >= bodyRows && bodyRows > 0) {
    visibleJobs = visibleJobs.slice(0, bodyRows - 1);
    visibleJobKeys = visibleJobs.map(progressiveJobKey);
    hiddenJobs = jobs.filter((job) => !visibleJobKeys.includes(progressiveJobKey(job)));
  }
  let spareRows = rowCount - 1 - visibleJobs.length - (hiddenJobs.length > 0 ? 1 : 0);
  const lines = [progressiveHeaderLine(jobs, theme, width, frame, projectionFor)];
  for (const job of visibleJobs) {
    const projection = projectionFor(job);
    const laneRows = job.mode === "workflow" ? compactWorkflowLaneRows(job, projection.checklist) : void 0;
    lines.push(progressiveJobLine(job, theme, width, frame, projection, laneRows));
    if (!laneRows || projection.inlineFleetCovered) continue;
    const shownLanes = laneRows.slice(0, Math.max(0, spareRows));
    for (const row of shownLanes) lines.push(truncLine(compactWorkflowLaneLine(row, theme, "    ", frame), width));
    spareRows -= shownLanes.length;
  }
  if (hiddenJobs.length > 0 && lines.length < rowCount) lines.push(progressiveHiddenLine(hiddenJobs, theme, width));
  const contentRows = Math.min(lines.length, rowCount);
  while (lines.length < rowCount) lines.push(" ");
  return { lines: lines.slice(0, rowCount), visibleJobKeys, contentRows };
}
function collapsedWidgetLineBudget(rows) {
  return Math.max(10, Math.min(14, Math.floor(rows * 0.35)));
}
function paddedWidgetLine(line, width) {
  if (width <= 2) return " ".repeat(Math.max(0, width));
  const text = ` ${truncLine(line, width - 2)} `;
  return `${text}${" ".repeat(Math.max(0, width - visibleWidth2(text)))}`;
}
function fitWidgetLineBudget(lines, theme, width, expanded) {
  const rows = process.stdout.rows || 30;
  const budget = expanded ? Math.max(12, Math.min(24, Math.floor(rows * 0.55))) : collapsedWidgetLineBudget(rows);
  if (lines.length <= budget) return lines;
  const visibleLines = Math.max(1, budget - 1);
  const hiddenCount = lines.length - visibleLines;
  const hint = expanded ? `\u2026 ${hiddenCount} live-detail lines hidden` : `\u2026 ${hiddenCount} lines hidden \xB7 ${expandKeyHint("to expand")}`;
  return [...lines.slice(0, visibleLines), truncLine(theme.fg("dim", hint), width)];
}
function fitAdaptiveWidgetLines(jobs, buildLines, theme, width, expanded, frame, projectionFor, layout = "adaptive", elapsedSuffix = "") {
  if (expanded) {
    resetWidgetLayoutSession();
    return fitWidgetLineBudget(buildLines(), theme, width, true);
  }
  const hasMatchingSession = widgetSessionMatches(expanded);
  const rows = currentTerminalRows();
  const columns = currentTerminalColumns();
  const availableRows = estimateAvailableWidgetRows();
  if (hasMatchingSession && widgetLayoutSession?.tier === "single-line") {
    return buildSingleLineWidgetLines(jobs, theme, width, frame, elapsedSuffix);
  }
  if (hasMatchingSession && widgetLayoutSession?.tier === "progressive" && widgetLayoutSession.lockedRows !== void 0) {
    const session = widgetLayoutSession;
    const lockedRows2 = widgetLayoutSession.lockedRows;
    let rendered2 = buildProgressiveWidgetLines(jobs, theme, width, lockedRows2, session.visibleJobKeys, frame, projectionFor, elapsedSuffix);
    const capRows = Math.min(availableRows, collapsedWidgetLineBudget(rows));
    if (rendered2.visibleJobKeys.length < jobs.length && lockedRows2 < capRows) {
      rendered2 = buildProgressiveWidgetLines(jobs, theme, width, capRows, session.visibleJobKeys, frame, projectionFor, elapsedSuffix);
      session.lockedRows = Math.max(lockedRows2, rendered2.contentRows);
    } else if (jobs.length < (session.rootJobCount ?? 0)) {
      session.lockedRows = rendered2.contentRows;
    }
    session.rootJobCount = jobs.length;
    session.visibleJobKeys = rendered2.visibleJobKeys;
    return rendered2.lines.slice(0, session.lockedRows);
  }
  if (layout === "adaptive") {
    const lines = buildLines();
    if (lines.length <= availableRows) {
      widgetLayoutSession = { expanded, rows, columns, tier: "full", visibleJobKeys: [] };
      return fitWidgetLineBudget(lines, theme, width, false);
    }
    if (availableRows > 2 && jobs.length === 1 && projectionFor?.(jobs[0]).stageProgress) {
      widgetLayoutSession = { expanded, rows, columns, tier: "full", visibleJobKeys: [] };
      return fitWidgetLineBudget(lines, theme, width, false);
    }
  }
  if (availableRows <= 2) {
    widgetLayoutSession = { expanded, rows, columns, tier: "single-line", visibleJobKeys: [] };
    return buildSingleLineWidgetLines(jobs, theme, width, frame, elapsedSuffix);
  }
  const rendered = buildProgressiveWidgetLines(jobs, theme, width, Math.min(availableRows, collapsedWidgetLineBudget(rows)), [], frame, projectionFor, elapsedSuffix);
  const lockedRows = rendered.contentRows;
  widgetLayoutSession = { expanded, rows, columns, tier: "progressive", lockedRows, rootJobCount: jobs.length, visibleJobKeys: rendered.visibleJobKeys };
  return rendered.lines.slice(0, lockedRows);
}
var asyncWidgetUpdates = /* @__PURE__ */ new WeakMap();
var inlineWorkflowCoverage = /* @__PURE__ */ new WeakMap();
var asyncWidgetInvalidations = /* @__PURE__ */ new WeakMap();
function inlineWorkflowDescendantShape(children) {
  return children?.map((child) => [child.id, child.agent, inlineWorkflowDescendantShape(child.children)]);
}
function inlineWorkflowRowShape(job) {
  return [
    job.asyncId,
    job.parentWorkflowRunId,
    job.workflowKey,
    job.mode,
    job.currentStep,
    job.activeParallelGroup,
    job.status,
    job.context,
    job.agents,
    job.steps?.map((step, index) => [
      step.index ?? index,
      step.workflowKey,
      step.agent,
      step.status,
      Boolean(step.runner),
      inlineWorkflowDescendantShape(step.children)
    ]),
    inlineWorkflowDescendantShape(job.nestedChildren),
    job.hostSteps?.map((row) => [row.id, row.monitorKind, row.label]),
    Boolean(job.workflowGraph)
  ];
}
function inlineWorkflowRenderKey(job, children) {
  return JSON.stringify([inlineWorkflowRowShape(job), children.map(inlineWorkflowRowShape)]);
}
function setInlineWorkflowCoverage(ui, coverage) {
  const previous = inlineWorkflowCoverage.get(ui);
  if ((previous?.size ?? 0) === coverage.size && [...coverage].every(([id, key]) => previous?.get(id) === key)) return;
  if (coverage.size) inlineWorkflowCoverage.set(ui, coverage);
  else inlineWorkflowCoverage.delete(ui);
  asyncWidgetInvalidations.get(ui)?.();
}
function widgetJobTree(jobs, now) {
  const parents = new Map(jobs.filter((job) => job.mode === "workflow").map((job) => [job.asyncId, job]));
  const childrenByParent = /* @__PURE__ */ new Map();
  const roots = [];
  for (const job of jobs) {
    const parent = job.parentWorkflowRunId ? parents.get(job.parentWorkflowRunId) : void 0;
    const keepLiveRoot = isProgressiveActiveJob(job) && parent?.status !== "running";
    if (parent && parent.asyncId !== job.asyncId && !keepLiveRoot) {
      const children = childrenByParent.get(parent.asyncId) ?? [];
      children.push(job);
      childrenByParent.set(parent.asyncId, children);
    } else roots.push(job);
  }
  return { roots, projectionFor: workflowWidgetProjectionLookup(now, childrenByParent) };
}
function widgetChecklistWithoutMaterializedChildren(projection) {
  const { checklist, materializedKeys } = projection;
  if (!checklist || !materializedKeys) return checklist;
  return { ...checklist, phases: checklist.phases.map((phase) => ({ ...phase, items: phase.items.filter((item) => !materializedKeys.has(item.key)) })) };
}
function materializedWidgetChildLines(job, theme, width, expanded, frame, projectionFor) {
  const { children, inlineFleetCovered } = projectionFor(job);
  if (inlineFleetCovered || !children?.length) return [];
  const lines = [];
  const shown = orderedWidgetJobs(children).slice(0, MAX_WIDGET_JOBS);
  for (const [index, child] of shown.entries()) {
    const projection = projectionFor(child);
    const last = index === children.length - 1;
    const identity = child.workflowKey ?? child.asyncId;
    const stats = widgetStats(child, theme, projection, !expanded);
    lines.push(`  ${last ? "\u2514\u2500" : "\u251C\u2500"} ${theme.bold(identity)} ${widgetStatusGlyph(child, theme, frame)} ${themeBold(theme, widgetJobName(child))}${contextModeBadge(theme, child.context)}${stats ? ` ${theme.fg("dim", "\xB7")} ${stats}` : ""}`);
    for (const detail of foregroundStyleWidgetDetails(child, theme, expanded, Math.max(0, width - 6), frame, projection)) lines.push(`  ${last ? "  " : "\u2502 "}${detail}`);
    for (const detail of materializedWidgetChildLines(child, theme, Math.max(0, width - 4), expanded, frame, projectionFor)) lines.push(`    ${detail}`);
  }
  if (shown.length < children.length) lines.push(`  +${children.length - shown.length} more workflow children`);
  return lines;
}
function buildWidgetComponent(jobs, ui, initiallyCollapsed = false, layout) {
  return (tui, theme) => {
    const container = new Container();
    let cachedRenderWidth;
    let cachedFrame;
    let cachedExpanded;
    let cachedLines;
    let cachedCoverage = "[]";
    let collapsed = initiallyCollapsed;
    const invalidate = () => {
      cachedLines = void 0;
      resetWidgetLayoutSession();
      tui.requestRender();
    };
    const invalidateCoverage = () => {
      cachedLines = void 0;
      tui.requestRender();
    };
    asyncWidgetInvalidations.set(ui, invalidateCoverage);
    const update = (nextJobs) => {
      jobs = nextJobs;
      cachedLines = void 0;
      tui.requestRender();
    };
    asyncWidgetUpdates.set(ui, update);
    const component = Object.assign(container, {
      // Only the mouse fields used here, without requiring newer Pi type exports.
      handleMouse(event) {
        if (event.type !== "click" || event.button !== "left" || event.y !== 0) return void 0;
        if (event.shift || event.alt || event.ctrl) return void 0;
        collapsed = !collapsed;
        invalidate();
        return { handled: true };
      },
      dispose() {
        if (asyncWidgetUpdates.get(ui) === update) asyncWidgetUpdates.delete(ui);
        if (asyncWidgetInvalidations.get(ui) === invalidateCoverage) asyncWidgetInvalidations.delete(ui);
      }
    });
    container.render = (renderWidth) => {
      const now = Date.now();
      const frame = Math.floor(now / WIDGET_ANIMATION_INTERVAL_MS);
      trackSubagentsRound(ui, jobs, now);
      const expanded = ui.getToolsExpanded?.() ?? false;
      const coverage = inlineWorkflowCoverage.get(ui);
      const covered = /* @__PURE__ */ new Set();
      if (coverage?.size) {
        const childrenByParent = /* @__PURE__ */ new Map();
        for (const child of jobs) {
          if (!child.parentWorkflowRunId) continue;
          const children = childrenByParent.get(child.parentWorkflowRunId) ?? [];
          children.push(child);
          childrenByParent.set(child.parentWorkflowRunId, children);
        }
        for (const job of jobs) {
          const snapshot = coverage.get(job.asyncId);
          if (snapshot === void 0) continue;
          const children = childrenByParent.get(job.asyncId) ?? [];
          if (!children.some((child) => childrenByParent.has(child.asyncId)) && snapshot === inlineWorkflowRenderKey(job, children)) covered.add(job.asyncId);
        }
      }
      const coverageKey = JSON.stringify([...covered]);
      if (cachedLines && cachedRenderWidth === renderWidth && cachedFrame === frame && cachedExpanded === expanded && cachedCoverage === coverageKey) return cachedLines;
      if (cachedCoverage !== coverageKey) resetWidgetLayoutSession();
      cachedCoverage = coverageKey;
      const width = Math.max(0, renderWidth - 2);
      const { roots, projectionFor } = widgetJobTree(jobs, now);
      for (const job of roots) projectionFor(job).inlineFleetCovered = covered.has(job.asyncId);
      const buildLines = () => expanded ? buildWidgetLinesWithProjection(roots, theme, width, true, frame, projectionFor) : roots.length === 1 && !projectionFor(roots[0]).children?.length ? compactSingleWidgetLines(roots[0], theme, width, frame, projectionFor(roots[0])) : buildWidgetLinesWithProjection(roots, theme, width, false, frame, projectionFor);
      cachedRenderWidth = renderWidth;
      cachedFrame = frame;
      cachedExpanded = expanded;
      const elapsedSuffix = roundElapsedSuffix(ui, now);
      cachedLines = (collapsed ? buildSingleLineWidgetLines(jobs, theme, width, frame, elapsedSuffix) : fitAdaptiveWidgetLines(roots, buildLines, theme, width, expanded, frame, projectionFor, layout, elapsedSuffix)).map((line) => paddedWidgetLine(line, renderWidth));
      return cachedLines;
    };
    return component;
  };
}
function buildWidgetLinesWithProjection(jobs, theme, width = getTermWidth(), expanded = false, frame, projectionFor = workflowWidgetProjectionLookup()) {
  if (jobs.length === 0) return [];
  if (jobs.length === 1) return [
    ...buildSingleWidgetLines(jobs[0], theme, width, expanded, frame, projectionFor(jobs[0])),
    ...materializedWidgetChildLines(jobs[0], theme, width, expanded, frame, projectionFor).map((line) => truncLine(line, width))
  ];
  const running = jobs.filter((job) => job.status === "running");
  const queued = jobs.filter((job) => job.status === "queued");
  const finished = jobs.filter((job) => job.status !== "running" && job.status !== "queued");
  const lines = [];
  const hasActive = running.length > 0 || queued.length > 0;
  const headerGlyph = running.length > 0 ? runningGlyph(animatedSeed(widgetJobsRunningSeed(running), frame)) : hasActive ? "\u25CF" : "\u25CB";
  const tone = activeHeaderTone(theme, hasActive);
  lines.push(truncLine(`${tone(headerGlyph)} ${tone("Async agents")} ${theme.fg("dim", "\xB7 background")}`, width));
  const items = [];
  let hiddenRunning = 0;
  let hiddenFinished = 0;
  let queuedSummaryShown = false;
  let slots = MAX_WIDGET_JOBS;
  const appendJob = (job) => {
    const projection = projectionFor(job);
    const compactWorkflow = (!expanded || projection.inlineFleetCovered) && job.mode === "workflow";
    const stats = compactWorkflow ? "" : widgetStats(job, theme, projection, !expanded);
    const details = compactWorkflow ? [
      ...compactWorkflowWidgetBodyLines(job, theme, frame, projection)
    ] : [
      `  ${theme.fg("dim", `\u23BF  ${widgetActivity(job)}`)}`,
      ...widgetLaneDetailLines(job, theme, projection),
      ...workflowChecklistWidgetLines(widgetChecklistWithoutMaterializedChildren(projection), theme, "  ", expanded, frame, { includeItemErrors: !expanded || !job.steps?.length }),
      ...widgetParallelAgentDetails(job, theme, expanded, width, frame)
    ];
    items.push([
      compactWorkflow ? compactWorkflowHeaderLine(job, theme, width) : `${widgetStatusGlyph(job, theme, frame)} ${themeBold(theme, widgetJobName(job))}${contextModeBadge(theme, job.context)}${stats ? ` ${theme.fg("dim", "\xB7")} ${stats}` : ""}`,
      ...details,
      ...materializedWidgetChildLines(job, theme, width, expanded, frame, projectionFor)
    ]);
  };
  for (const job of running) {
    if (slots <= 0) {
      hiddenRunning++;
      continue;
    }
    appendJob(job);
    slots--;
  }
  if (queued.length > 0 && slots > 0) {
    items.push([`${theme.fg("muted", "\u25E6")} ${theme.fg("dim", `${queued.length} queued`)}`]);
    queuedSummaryShown = true;
    slots--;
  }
  for (const job of finished) {
    if (slots <= 0) {
      hiddenFinished++;
      continue;
    }
    appendJob(job);
    slots--;
  }
  const hiddenQueued = queued.length > 0 && !queuedSummaryShown ? queued.length : 0;
  const hiddenTotal = hiddenRunning + hiddenFinished + hiddenQueued;
  if (hiddenTotal > 0) {
    const parts = [];
    if (hiddenRunning > 0) parts.push(`${hiddenRunning} running`);
    if (hiddenQueued > 0) parts.push(`${hiddenQueued} queued`);
    if (hiddenFinished > 0) parts.push(`${hiddenFinished} finished`);
    items.push([theme.fg("dim", `+${hiddenTotal} more (${parts.join(", ")})`)]);
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const last = i === items.length - 1;
    const branch = last ? "\u2514\u2500" : "\u251C\u2500";
    const continuation = last ? "   " : "\u2502  ";
    lines.push(truncLine(`${theme.fg("dim", branch)} ${item[0]}`, width));
    for (const detail of item.slice(1)) {
      lines.push(truncLine(`${theme.fg("dim", continuation)} ${detail}`, width));
    }
  }
  return lines;
}
function renderWidget(ctx, jobs, initiallyCollapsed = false, layout = "adaptive") {
  trackSubagentsRound(ctx.ui, jobs, Date.now());
  if (jobs.length === 0) {
    resetWidgetLayoutSession();
    asyncWidgetUpdates.delete(ctx.ui);
    if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, void 0);
    return;
  }
  if (!ctx.hasUI) return;
  if (ctx.mode === "rpc") {
    ctx.ui.setWidget(WIDGET_KEY, encodeAsyncStatusSnapshotWidget(jobs));
    return;
  }
  const update = asyncWidgetUpdates.get(ctx.ui);
  if (update) update(jobs);
  else ctx.ui.setWidget(WIDGET_KEY, buildWidgetComponent(jobs, ctx.ui, initiallyCollapsed, layout));
}
function renderSingleCompact(d, r, theme, layout, frame, foregroundDetachShortcut) {
  const output = r.truncation?.text || getSingleResultOutput(r);
  const progress = r.progress || r.progressSummary;
  const isRunning = isResultRunning(r);
  const contextBadge = contextModeBadge(theme, r.context ?? d.context);
  const stats = statJoin(theme, [
    r.usage?.turns ? `\u27F3 ${r.usage.turns}` : "",
    formatProgressStats(theme, progress)
  ]);
  const c = new Container();
  const width = getTermWidth() - 4;
  const detailIndent = mainWindowIndent(layout, 1);
  const continuationIndent = mainWindowIndent(layout, 2) + (layout.horizontalSpacing > 0 ? " " : "");
  const modelDisplay = modelThinkingBadge(theme, r.progress?.model ?? r.model, r.thinking ?? r.progress?.thinking);
  c.addChild(new Text(truncLine(`${resultGlyph(r, output, theme, isRunning, void 0, frame)} ${theme.fg("toolTitle", theme.bold(foregroundSingleDisplayName(r)))}${modelDisplay}${contextBadge}${stats ? ` ${theme.fg("dim", "\xB7")} ${stats}` : ""}`, width), 0, 0));
  if (isRunning && r.progress) {
    const task = compactTaskText(r.task);
    if (task) c.addChild(new Text(truncLine(theme.fg("dim", `${detailIndent}task: ${task}`), width), 0, 0));
    const progressSnapshotNow = snapshotNowForProgress(r.progress);
    const activity = compactCurrentActivity(r.progress);
    c.addChild(new Text(truncLine(theme.fg("dim", `${detailIndent}\u23BF  ${activity}`), width), 0, 0));
    const liveStatus = buildLiveStatusLine(r.progress, progressSnapshotNow);
    if (liveStatus && liveStatus !== activity) c.addChild(new Text(truncLine(theme.fg("dim", `${continuationIndent}${liveStatus}`), width), 0, 0));
    for (const nestedLine of formatNestedWidgetLines(r.children, theme, width, false, progressSnapshotNow)) {
      c.addChild(new Text(truncLine(`${detailIndent}${nestedLine}`, width), 0, 0));
    }
    c.addChild(new Text(truncLine(theme.fg("accent", `${detailIndent}${foregroundSingleHintText(foregroundDetachShortcut)}`), width), 0, 0));
    if (r.artifactPaths) c.addChild(new Text(truncLine(theme.fg("dim", `${detailIndent}output: ${shortenPath(r.artifactPaths.outputPath)}`), width), 0, 0));
    return c;
  }
  for (const nestedLine of formatNestedWidgetLines(r.children, theme, width, false, r.progress?.lastActivityAt)) {
    c.addChild(new Text(truncLine(`${detailIndent}${nestedLine}`, width), 0, 0));
  }
  c.addChild(new Text(truncLine(theme.fg("dim", `${detailIndent}\u23BF  ${resultStatusLine(r, output)}`), width), 0, 0));
  const preview = firstOutputLine(output);
  if (preview && r.exitCode === 0 && !hasEmptyTextOutputWithoutOutputTarget(r.task, output)) {
    c.addChild(new Text(truncLine(theme.fg("dim", `${continuationIndent}${preview}`), width), 0, 0));
  }
  if (r.sessionFile) c.addChild(new Text(truncLine(theme.fg("dim", `${detailIndent}session: ${shortenPath(r.sessionFile)}`), width), 0, 0));
  if (r.artifactPaths) c.addChild(new Text(truncLine(theme.fg("dim", `${detailIndent}output: ${shortenPath(r.artifactPaths.outputPath)}`), width), 0, 0));
  if (r.truncation?.artifactPath) c.addChild(new Text(truncLine(theme.fg("dim", `${detailIndent}full output: ${shortenPath(r.truncation.artifactPath)}`), width), 0, 0));
  return c;
}
function workflowRowGlyph(row, theme, frame, thinking) {
  if (row.state === "planned") return theme.fg("muted", "\u25E6");
  if (row.state === "running") return runningTone(theme, thinking)(runningGlyph(frame));
  if (row.state === "complete") return theme.fg("success", "\u2713");
  if (row.state === "detached" || row.state === "stopped") return theme.fg("warning", "\u25A0");
  return theme.fg("error", "\u2717");
}
function workflowRowStateLabel(row, theme, thinking) {
  const label = (row.state === "complete" ? "complete" : row.state).padEnd(8);
  if (row.state === "planned") return theme.fg("dim", label);
  if (row.state === "running") return runningTone(theme, thinking)(label);
  if (row.state === "complete") return theme.fg("success", label);
  if (row.state === "detached" || row.state === "stopped") return theme.fg("warning", label);
  return theme.fg("error", label);
}
function workflowOverallState(rows, hasTerminalValue, isError) {
  if (rows.some((row) => row.state === "failed")) return "failed";
  if (rows.some((row) => row.state === "detached")) return "paused";
  if (isError) return "failed";
  if (rows.length > 0 && rows.every((row) => row.state === "complete") || hasTerminalValue) return "complete";
  return "running";
}
function foregroundWorkflowChecklist(details) {
  if (details.mode !== "workflow") return void 0;
  const stageNodes = details.workflowGraph ? workflowGraphStageNodes(details.workflowGraph) : [];
  const steps = details.results.flatMap((result, resultIndex) => {
    const stableIndex = foregroundResultIndex(details, resultIndex);
    const workflowKey = result.workflowKey;
    if (details.workflowGraph && typeof workflowKey !== "string") return [];
    const node = typeof workflowKey === "string" ? stageNodes.find((candidate) => candidate.id === workflowKey) : void 0;
    const progress = foregroundProgressForResult(details, resultIndex);
    const status = isResultRunning(result) || progress?.status === "running" ? "running" : result.detached ? "paused" : result.stopped ? "stopped" : result.exitCode === 0 ? "complete" : "failed";
    return [{
      key: node?.id ?? (typeof workflowKey === "string" ? workflowKey : `result-${resultIndex + 1}`),
      label: node?.label ?? workflowLabelForResult(details, resultIndex) ?? result.task ?? result.agent,
      phase: node?.phase,
      agent: result.agent,
      thinking: result.thinking ?? progress?.thinking,
      status,
      context: result.context,
      activityState: progress?.activityState,
      startedAt: progress?.lastActivityAt !== void 0 && progress.durationMs !== void 0 ? progress.lastActivityAt - progress.durationMs : void 0,
      durationMs: progress?.durationMs,
      currentTool: progress?.currentTool,
      currentToolStartedAt: progress?.currentToolStartedAt,
      currentPath: progress?.currentPath,
      turnCount: progress?.turnCount,
      toolCount: progress?.toolCount ?? result.progressSummary?.toolCount,
      error: result.error,
      toolBudgetBlocked: result.toolBudgetBlocked,
      turnBudgetExceeded: result.turnBudgetExceeded,
      timedOut: result.timedOut,
      stopped: result.stopped,
      acceptance: result.acceptance ? { status: result.acceptance.status, reviewResult: result.acceptance.reviewResult ? { status: result.acceptance.reviewResult.status } : void 0 } : void 0,
      review: result.review ? { status: result.review.status } : void 0,
      watchdog: result.watchdog
    }];
  });
  const checklist = projectWorkflowChecklist({
    graph: details.workflowGraph,
    steps,
    hostSteps: details.workflow?.receipt?.hostSteps,
    preflight: details.preflight,
    trace: details.workflow?.trace,
    now: Date.now()
  });
  return checklist.total > 0 ? checklist : void 0;
}
function renderWorkflowChatProgress(d, result, theme, layout, frame, expanded = false) {
  const workflow = d.workflow;
  const rows = workflow ? buildWorkflowChatProgressRows(workflow.trace, d.preflight) : d.preflight ? buildWorkflowChatProgressRows([], d.preflight) : [];
  const state = workflowOverallState(rows, workflow?.value !== void 0, result.isError);
  const glyph = state === "running" ? runningTone(theme)(runningGlyph(frame)) : state === "complete" ? theme.fg("success", "\u2713") : state === "paused" ? theme.fg("warning", "\u25A0") : theme.fg("error", "\u2717");
  const width = getTermWidth() - 4;
  const runId = d.runId ? d.runId.slice(0, 12) : "workflow";
  const repoLabel = d.chatProgress?.repoLabel ?? (d.chatProgress?.repoRelation === "same" ? "same repo" : "other repo");
  const phase = rows.find((row) => row.state === "running" && row.phase)?.phase ?? [...rows].reverse().find((row) => row.phase)?.phase;
  const c = new Container();
  const rowIndent = mainWindowIndent(layout, 1);
  c.addChild(new Text(truncLine(`${glyph} ${theme.fg("toolTitle", theme.bold("workflow"))} ${runId} ${theme.fg("dim", "\xB7")} ${d.chatProgress?.repoRelation === "same" ? "same repo" : "other repo"} ${theme.fg("dim", "\xB7")} ${state}`, width), 0, 0));
  c.addChild(new Text(truncLine(theme.fg("dim", `${rowIndent}Repo   ${repoLabel}`), width), 0, 0));
  if (d.preflight) c.addChild(new Text(truncLine(theme.fg("dim", formatWorkflowPreflightPlanSummary(d.preflight, { indent: rowIndent })), width), 0, 0));
  if (phase) c.addChild(new Text(truncLine(theme.fg("dim", `${rowIndent}Phase  ${phase}`), width), 0, 0));
  const checklist = projectWorkflowChecklist({ hostSteps: workflow?.receipt?.hostSteps, preflight: d.preflight, trace: workflow?.trace, now: Date.now() });
  for (const line of workflowChecklistWidgetLines(checklist, theme, rowIndent, false, frame, { limitPhases: !expanded, includeBottleneckOutput: expanded })) {
    c.addChild(new Text(truncLine(line, width), 0, 0));
  }
  if (rows.length === 0) {
    c.addChild(new Text(truncLine(theme.fg("dim", `${rowIndent}\u25E6 waiting for workflow child launches`), width), 0, 0));
    return c;
  }
  const visible = visibleWorkflowRows(rows);
  if (visible.hiddenRows > 0) c.addChild(new Text(truncLine(theme.fg("dim", `${rowIndent}\u2026 ${visible.hiddenRows} older workflow rows hidden`), width), 0, 0));
  const childLevels = new Map((d.workflowChildren?.children ?? []).map((child) => [child.childId, childThinkingLevel(child)]));
  for (const row of visible.rows) {
    const thinking = childLevels.get(row.key);
    const status = workflowRowStateLabel(row, theme, thinking);
    const label = row.label && row.label !== row.key ? ` ${oneLine(row.label)}` : "";
    const duration = row.durationMs !== void 0 ? ` ${theme.fg("dim", `\xB7 ${formatDuration(row.durationMs)}`)}` : "";
    const run = row.runId ? ` ${theme.fg("dim", `[${row.runId.slice(0, 8)}]`)}` : "";
    const error = row.error ? ` ${theme.fg(row.state === "detached" ? "warning" : "error", `\xB7 ${compactWorkflowError(row.error)}`)}` : "";
    const hints = expanded && row.preflight ? [
      row.preflight.mode ? `mode:${row.preflight.mode}` : void 0,
      row.preflight.decision ? `decision:${row.preflight.decision}` : void 0,
      row.preflight.claims?.length ? `claims:${row.preflight.claims.join(",")}` : void 0,
      row.preflight.expectedOutput ? `expected:${row.preflight.expectedOutput}` : void 0,
      row.preflight.independence ? `independence:${row.preflight.independence}` : void 0
    ].filter((value) => Boolean(value)).join(" \xB7 ") : "";
    c.addChild(new Text(truncLine(`${rowIndent}${workflowRowGlyph(row, theme, frame, thinking)} ${status} ${theme.bold(row.key)}${label}${run}${duration}${error}${hints ? ` ${theme.fg("dim", `\xB7 ${hints}`)}` : ""}`, width), 0, 0));
  }
  if (workflow?.preflightWarnings?.length) {
    const warningLines = expanded ? formatWorkflowPreflightWarnings(workflow.preflightWarnings, { indent: rowIndent }).split("\n") : [formatWorkflowPreflightWarningSummary(workflow.preflightWarnings, { indent: rowIndent, hint: "expand for debug" })];
    for (const warningLine of warningLines) c.addChild(new Text(truncLine(theme.fg("warning", warningLine), width), 0, 0));
  }
  if (workflow?.emits.length) c.addChild(new Text(truncLine(theme.fg("dim", `${rowIndent}Emits  ${workflow.emits.length}`), width), 0, 0));
  return c;
}
function renderMultiCompact(d, theme, layout, frame) {
  const hasRunning = detailsHaveRunningResult(d);
  const detached = d.results.some((r) => r.detached) || workflowGraphHasStatus(d, ["detached"]);
  const stopped = d.results.some((r) => r.stopped) || workflowGraphHasStatus(d, ["stopped"]);
  const failed = d.results.some((r) => !hasTerminalResultFlag(r) && r.exitCode !== 0 && !isResultRunning(r)) || workflowGraphHasStatus(d, ["failed"]);
  const paused = d.results.some((r) => r.interrupted) || workflowGraphHasStatus(d, ["paused"]);
  const partial = workflowGraphHasStatus(d, ["partial"]);
  let totalSummary = d.progressSummary;
  if (!totalSummary) {
    let sawProgress = false;
    const summary = { toolCount: 0, tokens: 0, durationMs: 0 };
    for (const r of d.results) {
      const prog = r.progress || r.progressSummary;
      if (!prog) continue;
      sawProgress = true;
      summary.toolCount += prog.toolCount;
      summary.tokens += prog.tokens;
      summary.durationMs = d.mode === "chain" ? summary.durationMs + prog.durationMs : Math.max(summary.durationMs, prog.durationMs);
    }
    if (sawProgress) totalSummary = summary;
  }
  const multiLabel = buildMultiProgressLabel(d, hasRunning);
  const itemTitle = multiLabel.itemTitle;
  const workflowChecklist = foregroundWorkflowChecklist(d);
  const checklistPrimary = d.mode === "workflow" && workflowChecklist !== void 0;
  const stats = statJoin(theme, [checklistPrimary ? formatWorkflowChecklistSummary(workflowChecklist) : multiLabel.headerLabel, formatProgressStats(theme, totalSummary), formatTotalCostStat(d.totalCost)]);
  const aggregatePresentation = semanticResultPresentation({
    running: hasRunning,
    detached,
    stopped,
    interrupted: paused,
    failed,
    partial,
    seed: runningSeed(progressRunningSeed(totalSummary), d.currentStepIndex),
    frame
  });
  const glyph = presentationTone(aggregatePresentation, theme)(aggregatePresentation.glyph);
  const contextBadge = contextModeBadge(theme, d.context);
  const c = new Container();
  const width = getTermWidth() - 4;
  const rowIndent = mainWindowIndent(layout, 1);
  const detailIndent = mainWindowIndent(layout, 2);
  c.addChild(new Text(truncLine(`${glyph} ${theme.fg("toolTitle", theme.bold(d.mode))}${contextBadge}${stats ? ` ${theme.fg("dim", "\xB7")} ${stats}` : ""}`, width), 0, 0));
  if (checklistPrimary) {
    for (const line of workflowChecklistWidgetLines(workflowChecklist, theme, rowIndent, false, frame, { includeSummary: false })) {
      c.addChild(new Text(truncLine(line, width), 0, 0));
    }
    if (hasRunning || workflowChecklist.running > 0) c.addChild(new Text(truncLine(theme.fg("accent", `${rowIndent}${liveDetailHintText()}`), width), 0, 0));
    return c;
  }
  for (const line of workflowChecklistWidgetLines(workflowChecklist, theme, rowIndent, false, frame)) {
    c.addChild(new Text(truncLine(line, width), 0, 0));
  }
  const useResultsDirectly = multiLabel.hasParallelInChain || !d.chainAgents?.length;
  const displayStart = multiLabel.showActiveGroupOnly ? multiLabel.groupStartIndex : 0;
  const displayEnd = multiLabel.showActiveGroupOnly ? multiLabel.groupEndIndex : useResultsDirectly ? d.results.length : d.chainAgents.length;
  const chainEntries = buildChainRenderEntries(d, multiLabel);
  const renderEntries = chainEntries ?? buildForegroundResultEntries(d, multiLabel, displayStart, displayEnd, useResultsDirectly);
  for (const entry of renderEntries) {
    if (entry.kind === "group") {
      const glyph3 = widgetStepGlyph(entry.status, theme);
      const statusLabel = widgetStepStatus(entry.status, theme);
      const groupLabel = entry.groupLabel ? ` (${compactTaskText(void 0, entry.groupLabel) ?? entry.groupLabel})` : "";
      c.addChild(new Text(truncLine(`${rowIndent}${glyph3} ${entry.stepLabel}${groupLabel} ${theme.fg("dim", "\xB7")} ${statusLabel}`, width), 0, 0));
      if (entry.error) c.addChild(new Text(truncLine(theme.fg("error", `${detailIndent}\u23BF  Error: ${entry.error}`), width), 0, 0));
      continue;
    }
    const i = entry.resultIndex;
    const r = d.results[i];
    const rowNumber = entry.rowNumber;
    const agentName = entry.agentName;
    if (!r) {
      const pendingLabel2 = entry.rowLabel ?? (entry.isParallel ? "" : `${itemTitle} ${rowNumber}`);
      const labelPrefix2 = pendingLabel2 ? `${pendingLabel2}: ` : "";
      c.addChild(new Text(truncLine(theme.fg("dim", `${rowIndent}\u25E6 ${labelPrefix2}${agentName} \xB7 pending`), width), 0, 0));
      continue;
    }
    const output = getSingleResultOutput(r);
    const progressFromArray = foregroundProgressForResult(d, i);
    const rProg = r.progress || progressFromArray || r.progressSummary;
    const rRunning = rProg && "status" in rProg && isResultRunning(r, rProg.status);
    const rPending = rProg && "status" in rProg && rProg.status === "pending";
    const stepStats = formatProgressStats(theme, rProg);
    const glyph2 = rPending ? theme.fg("dim", "\u25E6") : resultGlyph(r, output, theme, rRunning, progressRunningSeed(rProg), frame);
    const pendingLabel = rPending ? ` ${theme.fg("dim", "\xB7 pending")}` : "";
    const stepLabel = entry.rowLabel;
    const rowProgressModel = rProg && "status" in rProg ? rProg : void 0;
    const rowModelDisplay = modelThinkingBadge(theme, rowProgressModel?.model ?? r.model, r.thinking ?? rowProgressModel?.thinking);
    const labelPrefix = stepLabel ? `${stepLabel}: ` : "";
    const line = `${glyph2} ${labelPrefix}${themeBold(theme, agentName)}${contextModeBadge(theme, r.context)}${rowModelDisplay}${stepStats ? ` ${theme.fg("dim", "\xB7")} ${stepStats}` : ""}${pendingLabel}`;
    c.addChild(new Text(truncLine(`${rowIndent}${line}`, width), 0, 0));
    if (rRunning || rPending) {
      const task = compactTaskText(r.task, workflowLabelForResult(d, i));
      if (task) c.addChild(new Text(truncLine(theme.fg("dim", `${detailIndent}task: ${task}`), width), 0, 0));
    }
    if (rRunning && rProg && "status" in rProg) {
      const liveProgress = rProg;
      const activity = compactCurrentActivity(liveProgress);
      c.addChild(new Text(truncLine(theme.fg("dim", `${detailIndent}\u23BF  ${activity}`), width), 0, 0));
      for (const nestedLine of formatNestedWidgetLines(r.children, theme, width, false, snapshotNowForProgress(liveProgress))) {
        c.addChild(new Text(truncLine(`${detailIndent}${nestedLine}`, width), 0, 0));
      }
      c.addChild(new Text(truncLine(theme.fg("accent", `${detailIndent}${liveDetailHintText()}`), width), 0, 0));
    } else if (!rPending && (r.exitCode !== 0 || r.interrupted || r.detached || hasEmptyTextOutputWithoutOutputTarget(r.task, output))) {
      c.addChild(new Text(truncLine(theme.fg(r.exitCode !== 0 ? "error" : "dim", `${detailIndent}\u23BF  ${resultStatusLine(r, output)}`), width), 0, 0));
    }
    if (!rRunning && !rPending) {
      for (const nestedLine of formatNestedWidgetLines(r.children, theme, width, false, r.progress?.lastActivityAt)) {
        c.addChild(new Text(truncLine(`${detailIndent}${nestedLine}`, width), 0, 0));
      }
    }
    const outputTarget = extractOutputTarget(r.task);
    if (outputTarget) c.addChild(new Text(truncLine(theme.fg("dim", `${detailIndent}output: ${outputTarget}`), width), 0, 0));
    if (r.artifactPaths) c.addChild(new Text(truncLine(theme.fg("dim", `${detailIndent}output: ${shortenPath(r.artifactPaths.outputPath)}`), width), 0, 0));
  }
  if (d.artifacts) c.addChild(new Text(truncLine(theme.fg("dim", `${rowIndent}artifacts: ${shortenPath(d.artifacts.dir)}`), width), 0, 0));
  return c;
}
function renderSubagentSummary(result, options, theme) {
  const details = result.details;
  const results = details?.results ?? [];
  const hasSingleTerminalResult = results.length === 1 && hasTerminalResult(results[0]);
  const hasOnlyTerminalResults = results.length > 0 && results.every(hasTerminalResult);
  const running = !hasSingleTerminalResult && !hasOnlyTerminalResults && (options.isPartial === true || Boolean(details?.asyncId && details.mode !== "management") || Boolean(details && detailsHaveRunningResult(details)));
  const stopped = results.some((entry) => entry.stopped) || Boolean(details && workflowGraphHasStatus(details, ["stopped"]));
  const paused = results.some((entry) => entry.interrupted || entry.detached) || Boolean(details && workflowGraphHasStatus(details, ["paused", "detached"]));
  const failed = result.isError === true || results.some((entry) => !hasTerminalResultFlag(entry) && entry.exitCode !== 0 && !isResultRunning(entry)) || Boolean(details && workflowGraphHasStatus(details, ["failed"]));
  const partial = Boolean(details && workflowGraphHasStatus(details, ["partial"]));
  const state = running ? "running" : failed ? "failed" : stopped ? "stopped" : paused ? "paused" : partial ? "partial" : "completed";
  const glyph = state === "running" ? runningTone(theme, details?.mode === "single" && results.length === 1 ? childThinkingLevel(results[0], results[0]?.progress) : void 0)(STATIC_RUNNING_GLYPH) : state === "completed" ? theme.fg("success", "\u2713") : state === "failed" ? theme.fg("error", "\u2717") : theme.fg("warning", "\u25A0");
  const label = details?.mode === "single" && results.length === 1 ? foregroundSingleDisplayName(results[0]) : details?.mode || "subagent";
  return new Text(
    truncLine(`${glyph} ${theme.fg("toolTitle", theme.bold(label))} ${theme.fg("dim", "\xB7")} ${theme.fg(state === "failed" ? "error" : state === "completed" ? "success" : state === "running" ? "accent" : "warning", state)}`, getTermWidth() - 4),
    0,
    0
  );
}
function renderSubagentResult(result, options, theme, frame, rendererConfig, foregroundDetachShortcut) {
  const layout = resolveMainWindowRenderLayout(rendererConfig);
  const compact = (component) => capCompactMainWindowResult(component, layout, theme, !options.expanded);
  const d = result.details;
  if (d?.mode === "workflow" && d.chatProgress?.mode === "live-card" && d.workflow?.value === void 0 && (!result.isError || (d.workflow?.trace.length ?? 0) > 0)) {
    return compact(renderWorkflowChatProgress(d, result, theme, options.expanded ? resolveMainWindowRenderLayout() : layout, frame, options.expanded));
  }
  if (!d || !d.results.length) {
    const t = result.content[0];
    const text = t?.type === "text" ? t.text : "(no output)";
    const contextPrefix = contextModePrefix(theme, d?.context);
    const width = getTermWidth() - 4;
    if (!text.includes("\n")) return compact(new Text(truncLine(`${contextPrefix}${text}`, width), 0, 0));
    if (d && !options.expanded && !result.isError) {
      const lines = text.split(/\r?\n/);
      const firstNonEmptyLine = lines.find((line) => line.trim())?.trim() || "(no output)";
      const compactLine = d.mode === "workflow" && d.preflight ? formatWorkflowPreflightPlanSummary(d.preflight) : firstNonEmptyLine;
      const c3 = new Container();
      const detailIndent = mainWindowIndent(layout, 1);
      c3.addChild(new Text(truncLine(`${contextPrefix}${compactLine} \xB7 ${lines.length} lines`, width), 0, 0));
      c3.addChild(new Text(truncLine(theme.fg("accent", `${detailIndent}${expandKeyHint("for full output")}`), width), 0, 0));
      return compact(c3);
    }
    const c2 = new Container();
    const wrapped = wrapPlainText(`${contextPrefix}${text}`, width);
    for (const line of wrapped) c2.addChild(new Text(line, 0, 0));
    return c2;
  }
  const expanded = options.expanded;
  const mdTheme = getMarkdownTheme();
  if (d.mode === "single" && d.results.length === 1) {
    const r = d.results[0];
    const detachableShortcut = d.asyncId || d.background ? void 0 : foregroundDetachShortcut;
    if (!r) return compact(renderMultiCompact(d, theme, layout, frame));
    if (!expanded) return compact(renderSingleCompact(d, r, theme, layout, frame, detachableShortcut));
    const isRunning = isResultRunning(r);
    const contextBadge2 = contextModeBadge(theme, r.context ?? d.context);
    const output = r.truncation?.text || getSingleResultOutput(r);
    const presentation2 = styledResultPresentation(resultPresentation(r, output, isRunning, void 0, frame), theme);
    const progressInfo = isRunning && r.progress ? ` | ${r.progress.toolCount} tools, ${formatTokens(r.progress.tokens)} tok, ${formatDuration(r.progress.durationMs)}` : r.progressSummary ? ` | ${r.progressSummary.toolCount} tools, ${formatTokens(r.progressSummary.tokens)} tok, ${formatDuration(r.progressSummary.durationMs)}` : "";
    const w2 = getTermWidth() - 4;
    const fit2 = (text) => expanded ? text : truncLine(text, w2);
    const toolCallLines = getToolCallLines(r, expanded);
    const c2 = new Container();
    c2.addChild(new Text(fit2(`${presentation2.glyph} ${theme.fg("toolTitle", theme.bold(foregroundSingleDisplayName(r)))}${contextBadge2}${progressInfo} ${theme.fg("dim", "\xB7")} ${presentation2.label}`), 0, 0));
    c2.addChild(new Spacer(1));
    const taskMaxLen = Math.max(20, w2 - 8);
    const taskPreview = expanded || r.task.length <= taskMaxLen ? r.task : `${r.task.slice(0, taskMaxLen)}...`;
    c2.addChild(
      new Text(fit2(theme.fg("dim", `Task: ${taskPreview}`)), 0, 0)
    );
    c2.addChild(new Spacer(1));
    if (!isRunning && (r.exitCode !== 0 || r.interrupted || r.detached || r.stopped)) {
      c2.addChild(new Text(fit2(theme.fg(r.exitCode !== 0 ? "error" : "dim", `  \u23BF  ${resultStatusLine(r, output)}`)), 0, 0));
    }
    if (isRunning && r.progress) {
      const progressSnapshotNow = snapshotNowForProgress(r.progress);
      for (const nestedLine of formatNestedWidgetLines(r.children, theme, w2, true, progressSnapshotNow, 12)) {
        c2.addChild(new Text(fit2(`  ${nestedLine}`), 0, 0));
      }
      const toolLine = formatCurrentToolLine(r.progress, w2, expanded, progressSnapshotNow);
      if (toolLine) {
        c2.addChild(new Text(fit2(theme.fg("warning", `> ${toolLine}`)), 0, 0));
      }
      const liveStatusLine = buildLiveStatusLine(r.progress, progressSnapshotNow);
      if (liveStatusLine) {
        c2.addChild(new Text(fit2(theme.fg("accent", liveStatusLine)), 0, 0));
      }
      c2.addChild(new Text(fit2(theme.fg("accent", foregroundSingleHintText(detachableShortcut))), 0, 0));
      if (r.artifactPaths) {
        c2.addChild(new Text(fit2(theme.fg("dim", `Artifacts: ${shortenPath(r.artifactPaths.outputPath)}`)), 0, 0));
      }
      if (r.progress.recentTools?.length) {
        for (const t of r.progress.recentTools.slice(-3)) {
          const maxArgsLen = Math.max(40, w2 - 24);
          const argsPreview = renderToolArgsPreview(t.args, maxArgsLen, expanded);
          c2.addChild(new Text(fit2(theme.fg("dim", `${t.tool}: ${argsPreview}`)), 0, 0));
        }
      }
      for (const line of compactRecentOutputLines(r.progress.recentOutput)) {
        c2.addChild(new Text(fit2(theme.fg("dim", `  ${line}`)), 0, 0));
      }
      if (toolLine || liveStatusLine || r.progress.recentTools?.length || r.progress.recentOutput?.length || r.artifactPaths) {
        c2.addChild(new Spacer(1));
      }
    } else {
      for (const nestedLine of formatNestedWidgetLines(r.children, theme, w2, true, r.progress?.lastActivityAt, 8)) {
        c2.addChild(new Text(fit2(`  ${nestedLine}`), 0, 0));
      }
    }
    if (expanded) {
      for (const line of toolCallLines) {
        c2.addChild(new Text(fit2(theme.fg("muted", line)), 0, 0));
      }
      if (toolCallLines.length) c2.addChild(new Spacer(1));
    }
    if (output) c2.addChild(new Markdown(output, 0, 0, mdTheme));
    c2.addChild(new Spacer(1));
    if (r.skills?.length) {
      c2.addChild(new Text(fit2(theme.fg("dim", `Skills: ${r.skills.join(", ")}`)), 0, 0));
    }
    if (r.skillsWarning) {
      c2.addChild(new Text(fit2(theme.fg("warning", `Warning: ${r.skillsWarning}`)), 0, 0));
    }
    c2.addChild(new Text(fit2(theme.fg("dim", formatUsage(r.usage, r.progress?.model ?? r.model))), 0, 0));
    if (r.sessionFile) {
      c2.addChild(new Text(fit2(theme.fg("dim", `Session: ${shortenPath(r.sessionFile)}`)), 0, 0));
    }
    if (!isRunning && r.artifactPaths) {
      c2.addChild(new Spacer(1));
      c2.addChild(new Text(fit2(theme.fg("dim", `Artifacts: ${shortenPath(r.artifactPaths.outputPath)}`)), 0, 0));
    }
    return c2;
  }
  if (!expanded) return compact(renderMultiCompact(d, theme, layout, frame));
  const hasRunning = detailsHaveRunningResult(d);
  const detached = d.results.some((r) => r.detached) || workflowGraphHasStatus(d, ["detached"]);
  const stopped = d.results.some((r) => r.stopped) || workflowGraphHasStatus(d, ["stopped"]);
  const failed = d.results.some((r) => !hasTerminalResultFlag(r) && r.exitCode !== 0 && !isResultRunning(r)) || workflowGraphHasStatus(d, ["failed"]);
  const paused = d.results.some((r) => r.interrupted) || workflowGraphHasStatus(d, ["paused"]);
  const partial = workflowGraphHasStatus(d, ["partial"]);
  const completedWithoutOutput = d.results.some(
    (r) => !hasTerminalResultFlag(r) && r.exitCode === 0 && !isResultRunning(r) && hasEmptyTextOutputWithoutOutputTarget(r.task, getSingleResultOutput(r))
  );
  const presentation = styledResultPresentation(semanticResultPresentation({
    running: hasRunning,
    detached,
    stopped,
    interrupted: paused,
    failed,
    partial,
    completedWithoutOutput,
    frame
  }), theme);
  const totalSummary = d.progressSummary || d.results.reduce(
    (acc, r) => {
      const prog = r.progress || r.progressSummary;
      if (prog) {
        acc.toolCount += prog.toolCount;
        acc.tokens += prog.tokens;
        acc.durationMs = d.mode === "chain" ? acc.durationMs + prog.durationMs : Math.max(acc.durationMs, prog.durationMs);
      }
      return acc;
    },
    { toolCount: 0, tokens: 0, durationMs: 0 }
  );
  const summaryParts = [
    totalSummary.toolCount || totalSummary.tokens ? `${totalSummary.toolCount} tools, ${formatTokens(totalSummary.tokens)} tok, ${formatDuration(totalSummary.durationMs)}` : "",
    formatTotalCostStat(d.totalCost)
  ].filter(Boolean);
  const summaryStr = summaryParts.length ? ` | ${summaryParts.join(", ")}` : "";
  const modeLabel = d.mode;
  const contextBadge = contextModeBadge(theme, d.context);
  const multiLabel = buildMultiProgressLabel(d, hasRunning);
  const itemTitle = multiLabel.itemTitle;
  const chainVis = d.chainAgents?.length && !multiLabel.hasParallelInChain ? d.chainAgents.map((agent, i) => {
    const result2 = d.results[i];
    const displayName = foregroundResultDisplayName(d, i, result2, agent);
    const isCurrent = i === (d.currentStepIndex ?? d.results.length);
    const stepPresentation = result2 ? styledResultPresentation(resultPresentation(result2, getSingleResultOutput(result2), isCurrent && hasRunning && !hasTerminalResultFlag(result2)), theme) : void 0;
    const stepStatus = stepPresentation ? `${stepPresentation.glyph} ${stepPresentation.label}` : theme.fg("dim", "\u25E6 pending");
    return `${stepStatus} ${displayName}${contextModeBadge(theme, result2?.context)}`;
  }).join(theme.fg("dim", " \u2192 ")) : null;
  const w = getTermWidth() - 4;
  const fit = (text) => expanded ? text : truncLine(text, w);
  const c = new Container();
  c.addChild(
    new Text(
      fit(`${presentation.glyph} ${theme.fg("toolTitle", theme.bold(modeLabel))}${contextBadge} \xB7 ${multiLabel.headerLabel}${summaryStr} ${theme.fg("dim", "\xB7")} ${presentation.label}`),
      0,
      0
    )
  );
  if (chainVis) {
    c.addChild(new Text(fit(`  ${chainVis}`), 0, 0));
  }
  const workflowChecklist = foregroundWorkflowChecklist(d);
  for (const line of workflowChecklistWidgetLines(workflowChecklist, theme, "  ", true, frame, { includeItemErrors: false })) {
    c.addChild(new Text(fit(line), 0, 0));
  }
  const useResultsDirectly = multiLabel.hasParallelInChain || !d.chainAgents?.length;
  const displayStart = multiLabel.showActiveGroupOnly ? multiLabel.groupStartIndex : 0;
  const displayEnd = multiLabel.showActiveGroupOnly ? multiLabel.groupEndIndex : useResultsDirectly ? d.results.length : d.chainAgents.length;
  const chainEntries = buildChainRenderEntries(d, multiLabel);
  const renderEntries = chainEntries ?? buildForegroundResultEntries(d, multiLabel, displayStart, displayEnd, useResultsDirectly);
  c.addChild(new Spacer(1));
  for (const entry of renderEntries) {
    if (entry.kind === "group") {
      const statusLabel = widgetStepStatus(entry.status, theme);
      const groupLabel = entry.groupLabel ? ` (${compactTaskText(void 0, entry.groupLabel) ?? entry.groupLabel})` : "";
      c.addChild(new Text(fit(`  ${statusLabel} ${entry.stepLabel}${groupLabel}`), 0, 0));
      c.addChild(new Text(theme.fg(entry.status === "failed" ? "error" : "dim", `    status: ${entry.status}`), 0, 0));
      if (entry.error) c.addChild(new Text(theme.fg("error", `    error: ${entry.error}`), 0, 0));
      c.addChild(new Spacer(1));
      continue;
    }
    const i = entry.resultIndex;
    const r = d.results[i];
    const rowNumber = entry.rowNumber;
    const agentName = entry.agentName;
    if (!r) {
      const pendingLabel = entry.rowLabel ?? (entry.isParallel ? "" : `${itemTitle} ${rowNumber}`);
      const labelPrefix2 = pendingLabel ? `${pendingLabel}: ` : "";
      c.addChild(new Text(fit(theme.fg("dim", `  ${labelPrefix2}${agentName}`)), 0, 0));
      c.addChild(new Text(theme.fg("dim", `    status: pending`), 0, 0));
      c.addChild(new Spacer(1));
      continue;
    }
    const progressFromArray = foregroundProgressForResult(d, i);
    const rProg = r.progress || progressFromArray || r.progressSummary;
    const rRunning = isResultRunning(r, rProg?.status);
    const resultOutput = getSingleResultOutput(r);
    const rowPresentation = styledResultPresentation(resultPresentation(r, resultOutput, rRunning, progressRunningSeed(rProg), frame), theme);
    const stats = rProg ? ` | ${rProg.toolCount} tools, ${formatDuration(rProg.durationMs)}` : "";
    const modelDisplay = modelThinkingBadge(theme, rProg?.model ?? r.model, r.thinking ?? rProg?.thinking);
    const stepLabel = entry.rowLabel;
    const contextBadge2 = contextModeBadge(theme, r.context);
    const labelPrefix = stepLabel ? `${stepLabel}: ` : "";
    const stepHeader = rRunning ? `${rowPresentation.glyph} ${labelPrefix}${theme.bold(theme.fg("warning", agentName))}${contextBadge2}${modelDisplay}${stats} ${theme.fg("dim", "\xB7")} ${rowPresentation.label}` : `${rowPresentation.glyph} ${labelPrefix}${theme.bold(agentName)}${contextBadge2}${modelDisplay}${stats} ${theme.fg("dim", "\xB7")} ${rowPresentation.label}`;
    const toolCallLines = getToolCallLines(r, expanded);
    c.addChild(new Text(fit(stepHeader), 0, 0));
    const taskMaxLen = Math.max(20, w - 12);
    const taskPreview = expanded || r.task.length <= taskMaxLen ? r.task : `${r.task.slice(0, taskMaxLen)}...`;
    c.addChild(new Text(fit(theme.fg("dim", `    task: ${taskPreview}`)), 0, 0));
    const outputTarget = extractOutputTarget(r.task);
    if (outputTarget) {
      c.addChild(new Text(fit(theme.fg("dim", `    output: ${outputTarget}`)), 0, 0));
    }
    if (!rRunning && (r.exitCode !== 0 || r.interrupted || r.detached || r.stopped)) {
      c.addChild(new Text(fit(theme.fg(r.exitCode !== 0 ? "error" : "dim", `    \u23BF  ${resultStatusLine(r, resultOutput)}`)), 0, 0));
    }
    if (r.skills?.length) {
      c.addChild(new Text(fit(theme.fg("dim", `    skills: ${r.skills.join(", ")}`)), 0, 0));
    }
    if (r.skillsWarning) {
      c.addChild(new Text(fit(theme.fg("warning", `    Warning: ${r.skillsWarning}`)), 0, 0));
    }
    if (rRunning && rProg) {
      if (rProg.skills?.length) {
        c.addChild(new Text(fit(theme.fg("accent", `    skills: ${rProg.skills.join(", ")}`)), 0, 0));
      }
      const progressSnapshotNow = snapshotNowForProgress(rProg);
      const toolLine = formatCurrentToolLine(rProg, w, expanded, progressSnapshotNow);
      if (toolLine) {
        c.addChild(new Text(fit(theme.fg("warning", `    > ${toolLine}`)), 0, 0));
      }
      const liveStatusLine = buildLiveStatusLine(rProg, progressSnapshotNow);
      if (liveStatusLine) {
        c.addChild(new Text(fit(theme.fg("accent", `    ${liveStatusLine}`)), 0, 0));
      }
      for (const nestedLine of formatNestedWidgetLines(r.children, theme, w, true, progressSnapshotNow, 8)) {
        c.addChild(new Text(fit(`    ${nestedLine}`), 0, 0));
      }
      c.addChild(new Text(fit(theme.fg("accent", `    ${liveDetailHintText()}`)), 0, 0));
      if (r.artifactPaths) {
        c.addChild(new Text(fit(theme.fg("dim", `    artifacts: ${shortenPath(r.artifactPaths.outputPath)}`)), 0, 0));
      }
      if (rProg.recentTools?.length) {
        for (const t of rProg.recentTools.slice(-3)) {
          const maxArgsLen = Math.max(40, w - 30);
          const argsPreview = renderToolArgsPreview(t.args, maxArgsLen, expanded);
          c.addChild(new Text(fit(theme.fg("dim", `      ${t.tool}: ${argsPreview}`)), 0, 0));
        }
      }
      for (const line of compactRecentOutputLines(rProg.recentOutput)) {
        c.addChild(new Text(fit(theme.fg("dim", `      ${line}`)), 0, 0));
      }
    }
    if (!rRunning) {
      for (const nestedLine of formatNestedWidgetLines(r.children, theme, w, true, r.progress?.lastActivityAt, 8)) {
        c.addChild(new Text(fit(`    ${nestedLine}`), 0, 0));
      }
    }
    if (!rRunning && r.artifactPaths) {
      c.addChild(new Text(fit(theme.fg("dim", `    artifacts: ${shortenPath(r.artifactPaths.outputPath)}`)), 0, 0));
    }
    if (expanded && !rRunning) {
      for (const line of toolCallLines) {
        c.addChild(new Text(fit(theme.fg("muted", `      ${line}`)), 0, 0));
      }
      if (toolCallLines.length) c.addChild(new Spacer(1));
    }
    c.addChild(new Spacer(1));
  }
  if (d.artifacts) {
    c.addChild(new Spacer(1));
    c.addChild(new Text(fit(theme.fg("dim", `Artifacts dir: ${shortenPath(d.artifacts.dir)}`)), 0, 0));
  }
  return c;
}

// src/tui/fleet-status.ts
import { isKeyRelease, Key, matchesKey, truncateToWidth as truncateToWidth2, visibleWidth as visibleWidth3 } from "@earendil-works/pi-tui";
var FLEET_STATUS_WIDGET_KEY = "subagent-fleet-status";
var MAX_AGENT_ROWS = 6;
var REFRESH_MS = 500;
var FLEET_AGENT_IDENTITY_COLORS = [
  "mdLink",
  "mdHeading",
  "syntaxFunction",
  "syntaxKeyword",
  "syntaxNumber",
  "syntaxType",
  "syntaxVariable",
  "customMessageLabel",
  "toolTitle",
  "thinkingMedium",
  "thinkingHigh",
  "mdQuote",
  "bashMode",
  "userMessageText",
  "mdCode",
  "syntaxOperator"
];
function fleetAgentIdentityColor(identity) {
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i++) {
    hash ^= identity.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return FLEET_AGENT_IDENTITY_COLORS[(hash >>> 0) % FLEET_AGENT_IDENTITY_COLORS.length];
}
function resolveFleetViewPlacement(value) {
  return value === "aboveEditor" ? "aboveEditor" : "belowEditor";
}
function formatFleetElapsed(ms) {
  return `${Math.max(0, Math.round(ms / 1e3))}s`;
}
function detailElapsed(row) {
  const duration = row.state === "running" && row.startedAt !== void 0 ? Date.now() - row.startedAt : row.durationMs ?? (row.startedAt !== void 0 && row.endedAt !== void 0 ? row.endedAt - row.startedAt : void 0);
  return duration !== void 0 ? formatFleetElapsed(duration) : void 0;
}
function formatFleetTokens(count, window, windowCount = 1) {
  const compact = (value) => value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}k` : `${Math.max(0, Math.round(value))}`;
  return window !== void 0 ? `\u2193 ${compact(window)} ${windowCount > 1 ? "\u03A3 windows" : "window"} \xB7 ${compact(count)} spent` : `\u2193 ${compact(count)} tokens`;
}
function rightAlign(left, right, width) {
  const rightWidth = visibleWidth3(right);
  const maxLeftWidth = Math.max(0, width - rightWidth - 1);
  const leftClamped = truncateToWidth2(left, maxLeftWidth);
  const gap = Math.max(1, width - visibleWidth3(leftClamped) - rightWidth);
  return truncateToWidth2(`${leftClamped}${" ".repeat(gap)}${right}`, width);
}
function isActiveState(value) {
  return value === "running" || value === "queued" || value === "pending";
}
function nestedRunLabel(run) {
  if (run.agent) return run.agent;
  if (run.agents?.length) return run.agents.length === 1 ? run.agents[0] : `${run.agents.slice(0, 2).join(", ")}${run.agents.length > 2 ? ` +${run.agents.length - 2}` : ""}`;
  return run.id;
}
function nestedActivity2(node) {
  if (node.currentTool) return `tool ${node.currentTool}`;
  if (node.currentPath) return node.currentPath.split(/[\\/]/).at(-1);
  if (node.activityState === "needs_attention") return "needs attention";
  if (node.activityState === "active_long_running") return "long-running";
  return void 0;
}
function visibleWorkflowRows2(rows, visibleLimit) {
  if (!rows?.length) return [];
  if (rows.length <= visibleLimit) return rows;
  const selected = /* @__PURE__ */ new Set();
  for (const [index, row] of rows.entries()) {
    if (!isWorkflowRowTerminal(row)) selected.add(index);
    if (selected.size >= visibleLimit) break;
  }
  for (let index = rows.length - 1; index >= 0 && selected.size < visibleLimit; index--) selected.add(index);
  const visible = [...selected].sort((left, right) => left - right).map((index) => rows[index]);
  return [{ name: `\u2026 +${rows.length - visible.length} hidden workflow steps`, state: "complete", overflow: rows.length - visible.length }, ...visible];
}
function visibleWorkflowPhases(checklist, visibleLimit) {
  const phases = checklist?.phases ?? [];
  if (phases.length <= visibleLimit) return phases;
  const selected = /* @__PURE__ */ new Set();
  for (const [index, phase] of phases.entries()) {
    if (phase.state !== "complete") selected.add(index);
    if (selected.size >= visibleLimit) break;
  }
  for (let index = phases.length - 1; index >= 0 && selected.size < visibleLimit; index--) selected.add(index);
  return [...selected].sort((left, right) => left - right).map((index) => phases[index]);
}
function isWorkflowRowTerminal(row) {
  if (row.kind) return row.state === "done" || row.state === "cancelled" || row.state === "error";
  return row.state === "complete" || row.state === "completed";
}
function nestedStatusGlyph2(state, theme, thinking) {
  if (state === "running") return runningTone(theme, thinking)("\u25CF");
  if (state === "queued" || state === "pending" || state === "planned") return theme.fg("muted", "\u25E6");
  if (state === "complete" || state === "completed") return theme.fg("success", "\u2713");
  if (state === "failed" || state === "rejected") return theme.fg("error", "\u2717");
  return theme.fg("warning", "\u25A0");
}
function nestedStepDisplayCount(steps, start = 0) {
  let count = 0;
  for (let index = start; index < (steps?.length ?? 0); index++) {
    count += 1 + nestedDisplayCount(steps[index].children);
  }
  return count;
}
function nestedDisplayCount(children, start = 0) {
  let count = 0;
  for (let index = start; index < (children?.length ?? 0); index++) {
    const child = children[index];
    const steps = child.mode === "parallel" || child.mode === "chain" ? child.steps ?? [] : [];
    count += steps.length > 0 ? nestedStepDisplayCount(steps) : 1;
    count += nestedDisplayCount(child.children);
  }
  return count;
}
function nestedFleetRows(children, visibleLimit) {
  const rows = [];
  let omitted = 0;
  const appendRuns = (runs, depth) => {
    for (let runIndex = 0; runIndex < (runs?.length ?? 0); runIndex++) {
      const child = runs[runIndex];
      const steps = child.mode === "parallel" || child.mode === "chain" ? child.steps ?? [] : [];
      if (steps.length > 0) {
        for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
          if (rows.length >= visibleLimit) {
            omitted += nestedStepDisplayCount(steps, stepIndex);
            omitted += nestedDisplayCount(child.children);
            omitted += nestedDisplayCount(runs, runIndex + 1);
            return false;
          }
          const step = steps[stepIndex];
          const modelThinking = formatModelThinking(step.model, step.thinking) || void 0;
          const thinking = childThinkingLevel(step);
          const activity = nestedActivity2(step);
          rows.push({
            name: step.agent,
            agentIdentity: step.agent,
            state: step.status,
            depth,
            ...modelThinking ? { modelThinking } : {},
            ...thinking ? { thinking } : {},
            ...activity ? { activity } : {},
            ...step.startedAt !== void 0 ? { startedAt: step.startedAt } : {},
            ...step.endedAt !== void 0 ? { endedAt: step.endedAt } : {}
          });
          if (!appendRuns(step.children, depth + 1)) {
            omitted += nestedStepDisplayCount(steps, stepIndex + 1);
            omitted += nestedDisplayCount(child.children);
            omitted += nestedDisplayCount(runs, runIndex + 1);
            return false;
          }
        }
      } else {
        if (rows.length >= visibleLimit) {
          omitted += nestedDisplayCount(runs, runIndex);
          return false;
        }
        const modelThinking = formatModelThinking(child.model, child.thinking) || void 0;
        const thinking = childThinkingLevel(child);
        const activity = nestedActivity2(child);
        rows.push({
          name: nestedRunLabel(child),
          agentIdentity: child.agent ?? child.agents?.join("\0") ?? child.id,
          state: child.state,
          depth,
          ...modelThinking ? { modelThinking } : {},
          ...thinking ? { thinking } : {},
          ...activity ? { activity } : {},
          ...child.startedAt !== void 0 ? { startedAt: child.startedAt } : {},
          ...child.endedAt !== void 0 ? { endedAt: child.endedAt } : {}
        });
      }
      if (!appendRuns(child.children, depth + 1)) {
        omitted += nestedDisplayCount(runs, runIndex + 1);
        return false;
      }
    }
    return true;
  };
  appendRuns(children, 0);
  if (omitted > 0) rows.push({ name: `\u2026 +${omitted} more nested leaves`, state: "complete", depth: 0, overflow: omitted });
  return rows;
}
function fleetTreeRows(entries) {
  const rows = [];
  const entryKeys = new Set(entries.map((entry) => entry.key));
  const childrenByParent = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (!entry.parentKey || !entryKeys.has(entry.parentKey)) continue;
    const children = childrenByParent.get(entry.parentKey) ?? [];
    children.push(entry);
    childrenByParent.set(entry.parentKey, children);
  }
  for (const entry of entries) {
    if (entry.parentKey && entryKeys.has(entry.parentKey)) continue;
    rows.push({ kind: "owner", entry });
    const attached = childrenByParent.get(entry.key) ?? [];
    const workflowPhases = visibleWorkflowPhases(entry.workflowChecklist, attached.length > 0 ? 2 : 4);
    const workflowRows = visibleWorkflowRows2(entry.workflowRows, attached.length > 0 ? 2 : 4);
    for (const [index, child] of attached.entries()) {
      const nested2 = nestedFleetRows(child.nestedChildren, 3);
      const laterRows = index < attached.length - 1 || workflowPhases.length > 0 || workflowRows.length > 0 || Boolean(entry.nestedChildren?.length);
      rows.push({ kind: "child", entry: child, last: !laterRows && nested2.length === 0 });
      for (const [nestedIndex, row] of nested2.entries()) rows.push({
        kind: "nested",
        ownerKey: child.key,
        row: { ...row, depth: row.depth + 1 },
        last: nestedIndex === nested2.length - 1 && !laterRows
      });
    }
    for (const [index, phase] of workflowPhases.entries()) rows.push({
      kind: "workflow-phase",
      ownerKey: entry.key,
      phase,
      last: index === workflowPhases.length - 1 && workflowRows.length === 0 && !entry.nestedChildren?.length
    });
    for (const [index, row] of workflowRows.entries()) rows.push({ kind: "workflow", ownerKey: entry.key, row, last: index === workflowRows.length - 1 && !entry.nestedChildren?.length });
    const nested = nestedFleetRows(entry.nestedChildren, attached.length > 0 ? 3 : 4);
    for (const [index, row] of nested.entries()) rows.push({ kind: "nested", ownerKey: entry.key, row, last: index === nested.length - 1 });
  }
  return rows;
}
function foregroundDescription(control, description) {
  if (!control.parentWorkflowRunId) return description;
  const workflow = `workflow child: ${control.parentWorkflowRunId}${control.workflowKey ? ` (${control.workflowKey})` : ""}`;
  return description ? `${workflow} \xB7 ${description}` : workflow;
}
function workflowIdentityCandidates(step) {
  return [...new Set([step.workflowKey, step.runId].filter((value) => typeof value === "string" && value.length > 0))];
}
function asyncJobIdentityCandidates(job) {
  return [...new Set([job.workflowKey, job.asyncId].filter((value) => typeof value === "string" && value.length > 0))];
}
function linkedWorkflowParentKey(parentWorkflowRunId, activeWorkflowKeys) {
  if (!parentWorkflowRunId) return void 0;
  const parentKey = `async:${parentWorkflowRunId}`;
  return activeWorkflowKeys.has(parentKey) ? parentKey : void 0;
}
function workflowStepsWithoutMaterializedChildren(steps, materializedChildIds) {
  if (!steps?.length || !materializedChildIds?.size) return steps;
  return steps.filter((step) => !workflowIdentityCandidates(step).some((identity) => materializedChildIds.has(identity)));
}
function activeLeafAgentCount(entries) {
  return entries.filter((entry) => !entry.workflowWrapper && !entry.surface).length;
}
function projectPaneNeedsAttention(pane) {
  return ["attention", "blocked", "paused", "failed", "error"].some((status) => pane.agentStatus.includes(status)) || pane.summary?.includes("\u26A0") === true;
}
function projectName(projectRoot) {
  return projectRoot.split(/[\\/]/).filter(Boolean).at(-1) ?? projectRoot;
}
function projectPaneEntries(state) {
  return [...state.herdrProjectPanes?.values() ?? []].filter((pane) => pane.state === "open").sort((left, right) => left.openedAt.localeCompare(right.openedAt) || left.projectRoot.localeCompare(right.projectRoot)).map((pane) => ({
    key: `project-pane:${pane.projectRoot}`,
    surface: "project-pane",
    agent: `${projectName(pane.projectRoot)} \xB7 ${pane.paneId}`,
    description: pane.summary,
    startedAt: Date.parse(pane.openedAt) || pane.refreshedAt,
    tokens: 0,
    state: pane.agentStatus || "unknown",
    projectPane: pane
  }));
}
var reportedFleetWarnings = /* @__PURE__ */ new Set();
function reportFleetWarning(state, message) {
  if (reportedFleetWarnings.has(message)) return;
  reportedFleetWarnings.add(message);
  const text = `[pi-subagents] ${message}`;
  const cached = state.lastUiContext;
  const notified = withCachedUiContext(cached, () => {
    if (state.lastUiContext === cached) state.lastUiContext = null;
  }, (ctx) => {
    ctx.ui.notify(text, "warning");
    return true;
  });
  if (!notified) console.warn(text);
}
function collectFleetStatusEntries(state) {
  const now = Date.now();
  const entries = [];
  const activeWorkflowKeys = new Set([...state.asyncJobs.values()].filter((job) => job.mode === "workflow" && isActiveState(job.status)).map((job) => `async:${job.asyncId}`));
  const materializedChildrenByWorkflow = /* @__PURE__ */ new Map();
  for (const job of state.asyncJobs.values()) {
    if (!isActiveState(job.status) || !job.parentWorkflowRunId) continue;
    const parentKey = linkedWorkflowParentKey(job.parentWorkflowRunId, activeWorkflowKeys);
    if (!parentKey) continue;
    const childIds = materializedChildrenByWorkflow.get(parentKey) ?? /* @__PURE__ */ new Set();
    for (const identity of asyncJobIdentityCandidates(job)) childIds.add(identity);
    materializedChildrenByWorkflow.set(parentKey, childIds);
  }
  for (const control of state.foregroundControls.values()) {
    const linkedParentKey = linkedWorkflowParentKey(control.parentWorkflowRunId, activeWorkflowKeys);
    if (control.activeChildren) {
      const nestedChildren = control.nestedChildren ?? [];
      const nestedChildrenByParentStep = /* @__PURE__ */ new Map();
      for (const nested of nestedChildren) {
        if (nested.parentStepIndex === void 0) continue;
        const children = nestedChildrenByParentStep.get(nested.parentStepIndex) ?? [];
        children.push(nested);
        nestedChildrenByParentStep.set(nested.parentStepIndex, children);
      }
      for (const child of [...control.activeChildren.values()].sort((left, right) => left.index - right.index)) {
        const modelThinking2 = formatModelThinking(child.model, child.thinking) || void 0;
        const childNestedChildren = nestedChildrenByParentStep.get(child.index) ?? (control.activeChildren.size === 1 && nestedChildren.length ? nestedChildren : void 0);
        entries.push({
          key: `foreground-active:${control.runId}:${child.index}`,
          ...linkedParentKey ? { parentKey: linkedParentKey } : {},
          agent: child.agent,
          ...modelThinking2 ? { modelThinking: modelThinking2 } : {},
          description: foregroundDescription(control, child.description),
          startedAt: child.startedAt,
          tokens: child.tokens ?? 0,
          ...child.window !== void 0 ? { window: child.window } : {},
          state: "running",
          ...childNestedChildren?.length ? { nestedChildren: childNestedChildren } : {}
        });
      }
      continue;
    }
    const modelThinking = formatModelThinking(control.model, control.thinking) || void 0;
    entries.push({
      key: `foreground-active:${control.runId}:${control.currentIndex ?? 0}`,
      ...linkedParentKey ? { parentKey: linkedParentKey } : {},
      agent: control.currentAgent ?? control.mode,
      ...modelThinking ? { modelThinking } : {},
      description: foregroundDescription(control, control.description),
      startedAt: control.startedAt,
      tokens: control.tokens ?? 0,
      ...control.window !== void 0 ? { window: control.window } : {},
      state: "running",
      ...control.nestedChildren?.length ? { nestedChildren: control.nestedChildren } : {}
    });
  }
  for (const job of state.asyncJobs.values()) {
    if (!isActiveState(job.status)) continue;
    const startedAt = job.startedAt ?? job.updatedAt ?? now;
    const linkedParentKey = linkedWorkflowParentKey(job.parentWorkflowRunId, activeWorkflowKeys);
    if (job.mode === "workflow") {
      const latestEmit = job.workflow?.emits?.length ? formatWorkflowJsonPreview(job.workflow.emits.at(-1), 120) : void 0;
      const workflowSteps = workflowStepsWithoutMaterializedChildren(job.steps, materializedChildrenByWorkflow.get(`async:${job.asyncId}`));
      const workflowRows = projectAsyncWorkflowRows(workflowSteps, job.workflowGraph ?? job.hostSteps, job.preflight);
      const workflowChecklist = projectWorkflowChecklist({
        graph: job.workflowGraph,
        steps: job.steps,
        hostSteps: job.hostSteps,
        preflight: job.preflight,
        trace: job.workflow?.trace,
        now
      });
      entries.push({
        key: `async:${job.asyncId}`,
        ...linkedParentKey ? { parentKey: linkedParentKey } : {},
        workflowWrapper: true,
        agent: "workflow",
        description: latestEmit !== void 0 ? `latest emit: ${latestEmit}` : job.description,
        startedAt,
        tokens: job.totalTokens?.total ?? 0,
        ...job.totalTokens?.window !== void 0 ? { window: job.totalTokens.window } : {},
        state: job.status,
        ...workflowRows.length ? { workflowRows } : {},
        ...workflowChecklist.total ? { workflowChecklist } : {},
        ...job.nestedChildren?.length ? { nestedChildren: job.nestedChildren } : {}
      });
      continue;
    }
    const steps = job.steps?.length ? job.steps : job.agents?.map((agent, index) => {
      const pending = job.status === "queued" || job.mode === "chain" && !job.activeParallelGroup && index !== (job.currentStep ?? 0);
      return { agent, index, status: pending ? "pending" : "running" };
    });
    if (!steps?.length) {
      entries.push({
        key: `async:${job.asyncId}`,
        ...linkedParentKey ? { parentKey: linkedParentKey } : {},
        agent: job.mode ?? "subagent",
        description: job.description,
        startedAt,
        tokens: job.totalTokens?.total ?? 0,
        ...job.totalTokens?.window !== void 0 ? { window: job.totalTokens.window } : {},
        state: job.status,
        ...job.nestedChildren?.length ? { nestedChildren: job.nestedChildren } : {}
      });
      continue;
    }
    for (const [offset, step] of steps.entries()) {
      if (!isActiveState(step.status)) continue;
      const index = step.index ?? offset;
      if (step.status === "pending" && job.mode === "chain" && !job.activeParallelGroup && index !== (job.currentStep ?? 0)) continue;
      const modelThinking = formatModelThinking(step.model, step.thinking) || void 0;
      entries.push({
        key: `async:${job.asyncId}:${index}`,
        ...linkedParentKey ? { parentKey: linkedParentKey } : {},
        agent: step.agent,
        ...step.label ? { displayLabel: `${step.label} (${step.agent})` } : {},
        ...modelThinking ? { modelThinking } : {},
        description: step.description ?? job.description,
        startedAt: step.startedAt ?? startedAt,
        tokens: step.tokens?.total ?? (steps.length === 1 ? job.totalTokens?.total ?? 0 : 0),
        ...(step.tokens?.window ?? (steps.length === 1 ? job.totalTokens?.window : void 0)) !== void 0 ? { window: step.tokens?.window ?? job.totalTokens?.window } : {},
        state: step.status,
        ...(step.children?.length ?? 0) > 0 ? { nestedChildren: step.children } : job.nestedChildren?.filter((nested) => nested.parentStepIndex === index).length ? { nestedChildren: job.nestedChildren.filter((nested) => nested.parentStepIndex === index) } : {}
      });
    }
  }
  if (state.currentSessionId) {
    try {
      for (const run of snapshotExternalRuns(state.currentSessionId, { ignoreMalformed: true, onMalformedRecord: (message) => reportFleetWarning(state, `Removed ${message}`) })) {
        if (!isActiveState(run.state)) continue;
        entries.push({
          key: `external:${run.id}`,
          agent: `external \xB7 ${run.label}`,
          description: run.currentAction ?? `source: ${run.source}`,
          startedAt: run.startedAt,
          tokens: 0,
          state: run.state,
          external: true
        });
      }
    } catch (cause) {
      reportFleetWarning(state, `Failed to inspect external jobs: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  entries.push(...projectPaneEntries(state));
  return entries.sort((left, right) => left.startedAt - right.startedAt || left.key.localeCompare(right.key));
}
var SubagentFleetStatus = class {
  ctx;
  ui;
  tui;
  inputUnsubscribe;
  timer;
  widgetRegistered = false;
  active = false;
  selectedKey = "main";
  inspectorOpen = false;
  lastRenderKey = "";
  lastPaint;
  prepaint;
  entries = [];
  workflowSnapshots = /* @__PURE__ */ new Map();
  onWorkflowCoverageChange;
  state;
  openInspector;
  refreshMs;
  maxAgentRows;
  placement;
  constructor(state, openInspector, options = {}) {
    this.state = state;
    this.openInspector = openInspector;
    this.refreshMs = options.refreshMs ?? REFRESH_MS;
    this.maxAgentRows = options.maxAgentRows ?? MAX_AGENT_ROWS;
    this.placement = options.placement ?? "belowEditor";
    this.onWorkflowCoverageChange = options.onWorkflowCoverageChange;
  }
  setContext(ctx) {
    if (!ctx.hasUI) {
      this.clearUiRegistration();
      return;
    }
    const ui = ctx.ui;
    if (this.ui === ui) {
      this.ctx = ctx;
      this.refresh();
      return;
    }
    this.clearUiRegistration();
    this.ctx = ctx;
    this.ui = ui;
    if (typeof ui.onTerminalInput === "function") {
      this.inputUnsubscribe = ui.onTerminalInput((data) => this.handleKey(data));
    }
    this.timer = setInterval(() => this.refresh(), this.refreshMs);
    this.timer.unref?.();
    this.refresh();
  }
  dispose() {
    this.clearUiRegistration();
    this.ctx = void 0;
    this.ui = void 0;
    this.entries = [];
    this.active = false;
    this.selectedKey = "main";
    this.inspectorOpen = false;
    this.lastRenderKey = "";
  }
  refresh() {
    this.prepaint = void 0;
    const ctx = this.getActiveUiContext();
    if (!ctx) return;
    if (this.state.widgetsSuspended) {
      this.clearWidget();
      return;
    }
    this.entries = collectFleetStatusEntries(this.state);
    this.workflowSnapshots.clear();
    if (this.active && !this.inspectorOpen && !this.state.fleetInspectorOpen && this.onWorkflowCoverageChange) {
      const childrenByParent = /* @__PURE__ */ new Map();
      for (const child of this.state.asyncJobs.values()) {
        if (!child.parentWorkflowRunId) continue;
        const children = childrenByParent.get(child.parentWorkflowRunId) ?? [];
        children.push(child);
        childrenByParent.set(child.parentWorkflowRunId, children);
      }
      const attachedByParent = /* @__PURE__ */ new Map();
      for (const entry of this.entries) {
        if (!entry.parentKey) continue;
        const attached = attachedByParent.get(entry.parentKey) ?? [];
        attached.push(entry);
        attachedByParent.set(entry.parentKey, attached);
      }
      for (const job of this.state.asyncJobs.values()) {
        if (job.mode !== "workflow" || !isActiveState(job.status) || job.parentWorkflowRunId || job.nestedChildren?.length || job.steps?.some((step) => step.children?.length)) continue;
        const key = `async:${job.asyncId}`;
        const children = childrenByParent.get(job.asyncId) ?? [];
        const attached = attachedByParent.get(key) ?? [];
        if (children.length && job.status !== "running") continue;
        if (attached.length >= this.maxAgentRows) continue;
        const rowKeys = /* @__PURE__ */ new Set();
        let unsupported = false;
        for (const child of children) {
          if (!isActiveState(child.status) || child.mode !== "single" && child.mode !== "parallel" && child.mode !== "chain" || child.hostSteps?.length || child.workflowGraph || childrenByParent.has(child.asyncId) || child.nestedChildren?.length || child.steps?.some((step) => step.children?.length || step.runner || !isActiveState(step.status))) {
            unsupported = true;
            break;
          }
          const count = child.steps?.length || child.agents?.length || 0;
          if (!count || (child.stepsTotal ?? 0) > count || (child.chainStepCount ?? 0) > count) {
            unsupported = true;
            break;
          }
          for (let index = 0; index < count; index++) rowKeys.add(`async:${child.asyncId}:${child.steps?.[index]?.index ?? index}`);
        }
        if (unsupported || attached.length !== rowKeys.size || attached.some((entry) => !rowKeys.has(entry.key))) continue;
        this.workflowSnapshots.set(key, { snapshot: inlineWorkflowRenderKey(job, children), childRows: rowKeys });
      }
    }
    this.clampSelection();
    if (this.inspectorOpen || this.state.fleetInspectorOpen) {
      this.lastRenderKey = "";
      this.clearWidget();
      return;
    }
    if (!this.hasInlineSurface()) {
      this.active = false;
      this.selectedKey = "main";
      this.lastRenderKey = "";
      this.clearWidget();
      return;
    }
    const renderKey = this.getRenderKey();
    if (!this.active) this.clearWorkflowCoverage();
    else if (renderKey !== this.lastRenderKey && this.lastPaint) {
      const { width, theme } = this.lastPaint;
      this.prepaint = { key: renderKey, width, theme, lines: this.render(width, theme) };
    }
    if (!this.widgetRegistered) {
      ctx.ui.setWidget(FLEET_STATUS_WIDGET_KEY, (tui, theme) => {
        this.tui = tui;
        return {
          render: (width) => {
            this.lastPaint = { width, theme };
            const prepaint = this.prepaint;
            this.prepaint = void 0;
            if (prepaint && prepaint.key === this.lastRenderKey && prepaint.key === this.getRenderKey() && prepaint.width === width && prepaint.theme === theme && !this.state.widgetsSuspended && !this.inspectorOpen && !this.state.fleetInspectorOpen) return prepaint.lines;
            return this.render(width, theme);
          },
          invalidate: () => {
            this.lastRenderKey = "";
            this.prepaint = void 0;
          },
          dispose: () => {
            if (this.tui !== tui) return;
            this.prepaint = void 0;
            this.lastPaint = void 0;
            this.clearWorkflowCoverage();
            this.widgetRegistered = false;
            this.tui = void 0;
          }
        };
      }, { placement: this.placement });
      this.widgetRegistered = true;
      this.lastRenderKey = renderKey;
      return;
    }
    if (renderKey === this.lastRenderKey) {
      if (this.entries.some((entry) => entry.state === "running")) this.tui?.requestRender();
      return;
    }
    this.lastRenderKey = renderKey;
    this.tui?.requestRender();
  }
  handleKey(data) {
    if (this.state.widgetsSuspended) return void 0;
    const ctx = this.getActiveUiContext();
    if (!ctx || this.entries.length === 0 || isKeyRelease(data)) return void 0;
    if (this.inspectorOpen) return void 0;
    if (!this.editorHasFocus()) {
      if (this.active) this.deactivate();
      return void 0;
    }
    if (!this.active) {
      const activates = matchesKey(data, "down") || matchesKey(data, "left");
      if (!activates || ctx.ui.getEditorText() !== "") return void 0;
      this.active = true;
      this.selectedKey = "main";
      this.refresh();
      return { consume: true };
    }
    const roster = this.rosterKeys();
    const selectedIndex = Math.max(0, roster.indexOf(this.selectedKey));
    if (matchesKey(data, "down") || matchesKey(data, "j")) {
      this.selectedKey = roster[Math.min(roster.length - 1, selectedIndex + 1)] ?? "main";
      this.refresh();
      return { consume: true };
    }
    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      if (selectedIndex === 0) {
        this.deactivate();
        return { consume: true };
      }
      this.selectedKey = roster[selectedIndex - 1] ?? "main";
      this.refresh();
      return { consume: true };
    }
    if (matchesKey(data, "escape")) {
      this.deactivate();
      return { consume: true };
    }
    if (matchesKey(data, Key.enter)) {
      if (this.selectedKey === "main") {
        this.deactivate();
        return { consume: true };
      }
      this.inspectorOpen = true;
      this.refresh();
      const selectedKey = this.selectedKey;
      void Promise.resolve().then(() => this.openInspector(selectedKey)).catch((error) => ctx.ui.notify(error instanceof Error ? error.message : String(error), "error")).finally(() => {
        this.inspectorOpen = false;
        this.refresh();
      });
      return { consume: true };
    }
    this.deactivate();
    return void 0;
  }
  render(width, theme) {
    if (!this.hasInlineSurface() || this.state.widgetsSuspended || this.inspectorOpen || this.state.fleetInspectorOpen) {
      this.clearWorkflowCoverage();
      return [];
    }
    if (!this.active) {
      this.clearWorkflowCoverage();
      const workEntries2 = this.entries.filter((entry) => !entry.surface);
      const projectEntries = this.entries.filter((entry) => entry.surface === "project-pane");
      const hasWorkflow = workEntries2.some((entry) => entry.workflowWrapper);
      const nativeEntries = workEntries2.filter((entry) => !entry.external && !entry.workflowWrapper && !entry.parentKey);
      const tokens = nativeEntries.reduce((total, entry) => total + entry.tokens, 0);
      const window = nativeEntries.length > 0 && nativeEntries.every((entry) => entry.window !== void 0) ? nativeEntries.reduce((total, entry) => total + entry.window, 0) : void 0;
      const capacity = this.state.activeAsyncCapacity;
      const hasNativeRows = nativeEntries.length > 0 || hasWorkflow;
      const showNativeSummary = hasNativeRows || Boolean(capacity?.used);
      const asyncRuns = capacity && showNativeSummary && (capacity.used > 0 || capacity.limit > 0) ? `Async runs ${capacity.used}/${capacity.limit || "\u221E"}` : "";
      const activeEntries = activeLeafAgentCount(workEntries2);
      const noun = workEntries2.some((entry) => entry.external) ? "job" : "agent";
      const agents = activeEntries > 0 ? `${activeEntries} active ${noun}${activeEntries === 1 ? "" : "s"}` : "";
      const paneAttention = projectEntries.filter((entry) => entry.projectPane && projectPaneNeedsAttention(entry.projectPane)).length;
      const panes = projectEntries.length > 0 ? `${projectEntries.length} pane${projectEntries.length === 1 ? "" : "s"}${paneAttention ? ` (${paneAttention} \u26A0)` : ""}` : "";
      const label = [agents, asyncRuns, panes].filter(Boolean).join(" \xB7 ");
      const nativeUsage = formatFleetTokens(tokens, window, nativeEntries.length);
      const usage = hasWorkflow ? nativeEntries.length > 0 ? `standalone: ${nativeUsage} \xB7 workflow usage on child rows` : "usage on child rows" : nativeUsage;
      const detail = [showNativeSummary ? usage : void 0, "\u2193/\u2190 to inspect"].filter(Boolean).join(" \xB7 ");
      return [truncateToWidth2(`  ${theme.fg("muted", label)}${label && detail ? " \xB7 " : ""}${theme.fg("dim", detail)}`, width)];
    }
    const roster = this.rosterKeys();
    const selectedIndex = Math.max(0, roster.indexOf(this.selectedKey));
    const rosterIndexByKey = /* @__PURE__ */ new Map();
    for (const [index, entry] of this.entries.entries()) {
      if (!rosterIndexByKey.has(entry.key)) rosterIndexByKey.set(entry.key, index + 1);
    }
    const lines = [truncateToWidth2(`  ${theme.fg("dim", "\u2191\u2193/jk select \xB7 enter inspect \xB7 esc back")}`, width), ""];
    lines.push(truncateToWidth2(`  ${this.bullet(0, selectedIndex, theme)} main`, width));
    const workEntries = this.entries.filter((entry) => !entry.surface);
    const tree = fleetTreeRows(workEntries);
    const selectedTreeIndex = Math.max(0, tree.findIndex((row) => (row.kind === "owner" || row.kind === "child") && row.entry.key === this.selectedKey));
    const visibleCount = Math.min(this.maxAgentRows, tree.length);
    const start = selectedTreeIndex < visibleCount ? 0 : selectedTreeIndex - visibleCount + 1;
    const hiddenBelow = tree.length - (start + visibleCount);
    if (start > 0) lines.push(rightAlign("", theme.fg("dim", `\u2191 ${start} more`), width));
    for (let index = start; index < start + visibleCount; index++) {
      const row = tree[index];
      if (row.kind === "owner" || row.kind === "child") {
        const rosterIndex = rosterIndexByKey.get(row.entry.key) ?? 0;
        lines.push(this.renderEntry(rosterIndex, selectedIndex, row.entry, width, theme, row.kind === "child" ? row.last ? "\u2514\u2500" : "\u251C\u2500" : void 0));
      } else if (row.kind === "workflow") {
        lines.push(this.renderWorkflowRow(row.row, row.last, width, theme));
      } else if (row.kind === "workflow-phase") {
        lines.push(this.renderWorkflowPhaseRow(row.phase, row.last, width, theme));
      } else {
        lines.push(this.renderNestedRow(row.row, row.last, width, theme));
      }
    }
    if (hiddenBelow > 0) lines.push(rightAlign("", theme.fg("dim", `\u2193 ${hiddenBelow} more`), width));
    if (this.ui && this.widgetRegistered && this.onWorkflowCoverageChange) {
      const coverage = /* @__PURE__ */ new Map();
      for (const [key, { snapshot, childRows }] of this.workflowSnapshots) {
        const ownerIndex = tree.findIndex((row) => row.kind === "owner" && row.entry.key === key);
        const owner = tree[ownerIndex];
        if (owner?.kind !== "owner" || ownerIndex < start) continue;
        const count = childRows.size + (owner.entry.workflowRows?.length ?? 0) + (owner.entry.workflowChecklist?.phases.length ?? 0);
        if (!count || ownerIndex + count >= start + visibleCount) continue;
        const descendants = tree.slice(ownerIndex + 1, ownerIndex + count + 1);
        if (!descendants.every((row) => row.kind === "workflow" && row.ownerKey === key && !row.row.overflow && visibleWidth3(this.renderWorkflowRow(row.row, row.last, Infinity, theme)) <= width || row.kind === "workflow-phase" && row.ownerKey === key && visibleWidth3(this.renderWorkflowPhaseRow(row.phase, row.last, Infinity, theme)) <= width || row.kind === "child" && childRows.has(row.entry.key) && visibleWidth3(this.renderEntry(rosterIndexByKey.get(row.entry.key) ?? 0, selectedIndex, row.entry, 0, theme, row.last ? "\u2514\u2500" : "\u251C\u2500", true)) <= width)) continue;
        if (childRows.size && visibleWidth3(this.renderEntry(rosterIndexByKey.get(key) ?? 0, selectedIndex, owner.entry, 0, theme, void 0, true)) > width) continue;
        coverage.set(key.slice("async:".length), snapshot);
      }
      this.onWorkflowCoverageChange(this.ui, coverage);
    }
    this.renderProjectPaneSection(lines, selectedIndex, width, theme, rosterIndexByKey);
    return lines;
  }
  renderProjectPaneSection(lines, selectedIndex, width, theme, rosterIndexByKey) {
    const entries = this.entries.filter((entry) => entry.surface === "project-pane");
    if (!entries.length) return;
    lines.push("", truncateToWidth2(`  ${theme.fg("dim", "project panes")}`, width));
    for (const entry of entries) {
      const rosterIndex = rosterIndexByKey.get(entry.key) ?? 0;
      lines.push(this.renderEntry(rosterIndex, selectedIndex, entry, width, theme));
    }
  }
  renderEntry(rosterIndex, selectedIndex, entry, width, theme, branch, unclipped = false) {
    const label = entry.displayLabel ?? entry.agent;
    const agent = entry.modelThinking ? `${label} (${entry.modelThinking})` : label;
    const prefix = branch ? `    ${branch}` : " ";
    const checklist = entry.workflowWrapper && entry.workflowChecklist ? ` \xB7 checklist ${formatWorkflowChecklistSummary(entry.workflowChecklist)}${entry.workflowChecklist.bottleneck ? ` \xB7 bottleneck ${formatWorkflowChecklistBottleneck(entry.workflowChecklist.bottleneck)}` : ""}` : "";
    const left = `${prefix} ${this.bullet(rosterIndex, selectedIndex, theme)} ${theme.fg(fleetAgentIdentityColor(entry.agent), agent)} \xB7 ${entry.state}${checklist}`;
    const elapsed = Date.now() - entry.startedAt;
    const rightText = entry.projectPane ? `${entry.projectPane.summary ?? "\u2014"} \xB7 ${formatFleetElapsed(Date.now() - entry.projectPane.refreshedAt)} ago` : entry.external ? formatFleetElapsed(elapsed) : `${formatFleetElapsed(elapsed)} \xB7 ${entry.workflowWrapper ? "usage on child rows" : formatFleetTokens(entry.tokens, entry.window)}`;
    const right = theme.fg("dim", rightText);
    if (unclipped) return `${left} ${right}`;
    return rightAlign(left, right, width);
  }
  renderNestedRow(row, last, width, theme) {
    const marker = last ? "\u2514\u2500" : "\u251C\u2500";
    const indent = "    ".repeat(row.depth + 1);
    if (row.overflow !== void 0) return truncateToWidth2(`${indent}${marker} ${theme.fg("dim", `+${row.overflow} nested leaves`)}`, width);
    const modelThinking = row.modelThinking ? ` (${row.modelThinking})` : "";
    const activity = row.activity ? ` \xB7 ${row.activity}` : "";
    const left = `${indent}${marker} ${nestedStatusGlyph2(row.state, theme, row.thinking)} ${theme.fg(fleetAgentIdentityColor(row.agentIdentity ?? row.name), `${row.name}${modelThinking}`)} \xB7 ${row.state}${activity}`;
    const elapsed = detailElapsed(row);
    return truncateToWidth2(`${left}${elapsed !== void 0 ? theme.fg("dim", ` \xB7 ${elapsed}`) : ""}`, width);
  }
  workflowRowGlyph(row, theme) {
    if (!row.kind) return nestedStatusGlyph2(row.state, theme, row.thinking);
    const state = row.state;
    if (state === "pending") return theme.fg("muted", "\u25E6");
    if (state === "running") return theme.fg("accent", "\u25CF");
    if (state === "done") return row.verdict === "pass" ? theme.fg("success", "\u2713") : row.verdict === "fail" ? theme.fg("error", "\u2717") : theme.fg("warning", "\u25A0");
    if (state === "error") return theme.fg("error", "\u2717");
    return theme.fg("warning", "\u25A0");
  }
  workflowRowStateLabel(row, theme) {
    const state = row.kind ? hostStepVerdictLabel(row.state, row.verdict) : row.state;
    if (state === "running") return row.kind ? theme.fg("accent", state) : runningTone(theme, row.thinking)(state);
    if (state === "pending" || state === "queued") return theme.fg("muted", state);
    if (state === "pass" || state === "complete" || state === "completed") return theme.fg("success", state === "pass" ? "pass" : "complete");
    if (state === "fail" || state === "failed" || state === "error") return theme.fg("error", state === "fail" ? "fail" : state);
    return theme.fg("warning", state);
  }
  renderWorkflowPhaseRow(phase, last, width, theme) {
    const marker = last ? "\u2514\u2500" : "\u251C\u2500";
    const glyph = phase.state === "complete" ? theme.fg("success", "\u2713") : phase.state === "running" ? runningTone(theme)("\u25CF") : phase.state === "blocked" || phase.state === "failed" ? theme.fg("error", phase.state === "blocked" ? "!" : "\u2717") : phase.state === "queued" ? theme.fg("muted", "\u25E6") : theme.fg("warning", "\u25A0");
    return truncateToWidth2(`    ${marker} ${glyph} ${theme.fg("muted", formatWorkflowChecklistPhase(phase))}`, width);
  }
  renderWorkflowRow(row, last, width, theme) {
    const marker = last ? "\u2514\u2500" : "\u251C\u2500";
    const indent = "    ";
    if (row.overflow !== void 0) return truncateToWidth2(`${indent}${marker} ${theme.fg("dim", `+${row.overflow} hidden workflow steps`)}`, width);
    const context = contextModeLabel(row.context);
    const modelThinking = row.modelThinking ? ` (${row.modelThinking})` : "";
    const activity = row.activity ? ` \xB7 ${row.activity}` : "";
    const kind = row.kind ? `${row.kind}: ` : "";
    const hints = row.preflight ? [
      row.preflight.mode ? `mode:${row.preflight.mode}` : void 0,
      row.preflight.decision ? `decision:${row.preflight.decision}` : void 0,
      row.preflight.claims?.length ? `claims:${row.preflight.claims.join(",")}` : void 0,
      row.preflight.expectedOutput ? `expected:${row.preflight.expectedOutput}` : void 0,
      row.preflight.independence ? `independence:${row.preflight.independence}` : void 0
    ].filter((value) => Boolean(value)).join(" \xB7 ") : "";
    const left = `${indent}${marker} ${this.workflowRowGlyph(row, theme)} ${theme.fg("muted", `${kind}${row.name}${context ? ` ${context}` : ""}${modelThinking}`)} \xB7 ${this.workflowRowStateLabel(row, theme)}${activity}${hints ? ` \xB7 ${hints}` : ""}`;
    const details = [
      detailElapsed(row),
      row.tokens !== void 0 ? formatFleetTokens(row.tokens, row.window) : void 0,
      row.provider ? `provider:${row.provider}` : void 0,
      row.role ? `role:${row.role}` : void 0,
      row.target,
      row.detail,
      row.reasonCode ? `reason:${row.reasonCode}` : void 0,
      row.freshness?.stale ? "stale" : row.freshness?.observedRef ? `ref:${row.freshness.observedRef}` : void 0,
      row.reportPath ? `out:${hostStepReportName(row.reportPath)}` : void 0
    ].filter(Boolean).join(" \xB7 ");
    return truncateToWidth2(`${left}${details ? theme.fg("dim", ` \xB7 ${details}`) : ""}`, width);
  }
  bullet(rosterIndex, selectedIndex, theme) {
    return rosterIndex === selectedIndex ? theme.fg("accent", ">") : " ";
  }
  rosterKeys() {
    return ["main", ...this.entries.map((entry) => entry.key)];
  }
  clampSelection() {
    if (!this.rosterKeys().includes(this.selectedKey)) this.selectedKey = "main";
  }
  deactivate() {
    this.active = false;
    this.selectedKey = "main";
    this.refresh();
  }
  editorHasFocus() {
    const focused = this.tui?.focusedComponent;
    if (!focused || typeof focused !== "object") return false;
    const candidate = focused;
    return typeof candidate.render === "function" && typeof candidate.invalidate === "function" && typeof candidate.handleInput === "function" && typeof candidate.getText === "function" && typeof candidate.setText === "function";
  }
  getRenderKey() {
    const now = Date.now();
    return JSON.stringify({
      active: this.active,
      selected: this.selectedKey,
      inspectorOpen: this.inspectorOpen,
      entries: this.entries.map((entry) => this.active ? [
        entry.key,
        entry.surface,
        entry.parentKey,
        entry.agent,
        entry.displayLabel,
        entry.state,
        entry.modelThinking,
        entry.description,
        entry.external,
        Math.round((now - entry.startedAt) / 1e3),
        entry.tokens,
        entry.workflowChecklist ? [
          entry.workflowChecklist.total,
          entry.workflowChecklist.done,
          entry.workflowChecklist.running,
          entry.workflowChecklist.queued,
          entry.workflowChecklist.blocked,
          entry.workflowChecklist.failed,
          entry.workflowChecklist.phases.map((phase) => [phase.key, phase.state, phase.done, phase.total, phase.running, phase.queued, phase.blocked, phase.failed, phase.items.map((item) => [item.key, item.state, item.currentTool, item.currentPath, item.durationMs, item.toolCount, item.error])])
        ] : void 0,
        visibleWorkflowRows2(entry.workflowRows, entry.parentKey ? 2 : 4).map((row) => [
          row.kind,
          row.name,
          row.state,
          row.context,
          row.modelThinking,
          row.activity,
          row.startedAt,
          row.endedAt,
          row.durationMs,
          row.tokens,
          row.provider,
          row.role,
          row.verdict,
          row.reasonCode,
          row.detail,
          row.target,
          row.freshness,
          row.reportPath,
          row.overflow
        ]),
        nestedFleetRows(entry.nestedChildren, entry.parentKey ? 3 : 4).map((row) => [
          row.name,
          row.agentIdentity,
          row.state,
          row.modelThinking,
          row.activity,
          row.startedAt,
          row.endedAt,
          row.depth,
          row.overflow
        ])
      ] : [entry.key, entry.state, entry.external, entry.surface, entry.tokens, entry.projectPane?.refreshedAt, entry.projectPane?.summary])
    });
  }
  hasInlineSurface() {
    return this.entries.length > 0 || Boolean(this.state.activeAsyncCapacity?.used);
  }
  getActiveUiContext() {
    const ctx = this.ctx;
    if (!ctx) return void 0;
    try {
      return ctx.hasUI ? ctx : void 0;
    } catch (error) {
      if (!isStaleExtensionContextError(error)) throw error;
      this.clearUiRegistration();
      return void 0;
    }
  }
  clearWidget() {
    this.prepaint = void 0;
    this.clearWorkflowCoverage();
    if (!this.widgetRegistered) return;
    try {
      this.ui?.setWidget(FLEET_STATUS_WIDGET_KEY, void 0);
    } catch (error) {
      if (!isStaleExtensionContextError(error)) throw error;
      this.clearUiRegistration();
      return;
    }
    this.widgetRegistered = false;
    this.tui = void 0;
  }
  clearUiRegistration() {
    this.prepaint = void 0;
    this.clearWorkflowCoverage();
    if (this.timer) clearInterval(this.timer);
    this.timer = void 0;
    const inputUnsubscribe = this.inputUnsubscribe;
    const ui = this.ui;
    const widgetRegistered = this.widgetRegistered;
    this.inputUnsubscribe = void 0;
    this.ctx = void 0;
    this.ui = void 0;
    this.widgetRegistered = false;
    this.tui = void 0;
    const cleanupErrors = [];
    try {
      inputUnsubscribe?.();
    } catch (error) {
      if (!isStaleExtensionContextError(error)) cleanupErrors.push(error);
    }
    if (ui && widgetRegistered) {
      try {
        ui.setWidget(FLEET_STATUS_WIDGET_KEY, void 0);
      } catch (error) {
        if (!isStaleExtensionContextError(error)) cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    if (cleanupErrors.length > 1) {
      throw new AggregateError(cleanupErrors, "Failed to clean up FleetView UI registration");
    }
  }
  clearWorkflowCoverage() {
    if (this.ui) this.onWorkflowCoverageChange?.(this.ui, /* @__PURE__ */ new Map());
  }
};

export {
  setMainThinkingLevelSource,
  readMainThinkingLevel,
  runningTone,
  buildAsyncStatusSnapshotForState,
  clearLegacyResultAnimationTimer,
  widgetRenderKey,
  stepTaskSummary,
  setInlineWorkflowCoverage,
  renderWidget,
  renderSubagentSummary,
  renderSubagentResult,
  FLEET_STATUS_WIDGET_KEY,
  resolveFleetViewPlacement,
  reportFleetWarning,
  SubagentFleetStatus
};
