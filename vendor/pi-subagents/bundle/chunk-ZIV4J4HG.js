import {
  MainWatchdogRuntime,
  SUBAGENT_OPTION_KEYS,
  SubagentOptionParams,
  createMainWatchdogReview,
  createSubagentParamsSchema,
  createWatchdogWarningMessage,
  formatResumeFirstFailedRunDetail,
  getWatchdogUserSettingsPath,
  readCompletionReplay,
  startWatchdogDiffBaselineCapture,
  writeUserWatchdogEnabled,
  writeWatchdogModelSettings
} from "./chunk-VSUSLDNW.js";
import {
  resolveGitRepositoryIdentity
} from "./chunk-FXUXCX2K.js";
import {
  listAsyncRuns,
  ownsRun,
  parallelHandoffPath,
  parseWorkflowChildSummary,
  readAsyncRecoveryDescriptor,
  resolveRetainedWorktreeCwd
} from "./chunk-6XJB7PIX.js";
import {
  deepFreezeWorkflowArgs,
  normalizeWorkflowArgs
} from "./chunk-NF7IEKBH.js";
import {
  HOST_STEP_MAX_COUNT,
  WORKFLOW_STOP_CAUSE_OWNER_EXITED,
  WORKFLOW_STOP_CAUSE_RUNTIME_REPLACED,
  assertUniqueHostStepIds,
  checkRecordedPidLiveness,
  currentBootId,
  currentPidNamespaceScope,
  currentRecordedPid,
  hasLiveNestedDescendants,
  isActiveAsyncState,
  isRecordedPid,
  isReusableWorkflowStopCause,
  normalizeWorktreeBaseRef,
  parseHostStepNode,
  previewSimpleWorkflowRun,
  projectNestedEvents,
  readMission,
  readRecentTerminalRunIndex,
  reconcileAsyncRun,
  resolveMissionStoreLocation,
  validateMissionId,
  workflowRunParamsFingerprint
} from "./chunk-46XKCPJR.js";
import {
  requestAsyncCommand,
  watchAsyncControlInbox
} from "./chunk-OYF6AFDY.js";
import {
  supervisorChannelDir
} from "./chunk-4SDU2BZX.js";
import {
  createHerdrClient,
  detectHerdr
} from "./chunk-52UBALJL.js";
import {
  getProjectSubagentsDir
} from "./chunk-5TYMSZX3.js";
import {
  ExternalJobProviderError,
  getExternalJobProvider,
  listExternalJobProviders,
  validateExternalJobHandle,
  validateExternalJobResult
} from "./chunk-YYREO77V.js";
import {
  mergeRuntimeAgents
} from "./chunk-YKEWIB4M.js";
import {
  CODE_OWNED_EXTERNAL_CLI_ADAPTER_LABEL,
  PI_CODING_AGENT_PACKAGE,
  PI_CODING_AGENT_PACKAGE_ROOT_ENV,
  PROMPT_REDACTED,
  SUBAGENT_WATCHDOG_WARNING_TYPE,
  THINKING_LEVELS,
  assertWorkflowLaneKey,
  buildRuntimeName,
  capSummaryOutputs,
  closestMatch,
  createAtomicJsonWriter,
  defaultInheritProjectContext,
  defaultInheritSkills,
  defaultSystemPromptMode,
  discoverAgentsAll,
  discoverAvailableSkills,
  findBlockingAgentDiagnostic,
  formatReviewGateLabel,
  frontmatterNameForConfig,
  getAgentDir,
  getConfigDirName,
  getProjectConfigDir,
  getSupportedThinkingLevels,
  isCodeOwnedExternalCliAdapterId,
  mergeAgentsForScope,
  mergeBuiltinAgentOverride,
  normalizeModelSegment,
  normalizeWorkflowLaneMetadata,
  parseFrontmatter,
  parsePackageName,
  parseUnquotedList,
  readStatus,
  removeBuiltinAgentOverride,
  removeBuiltinAgentOverrideFields,
  resolveAgentName,
  resolveEffectiveThinking,
  resolveExternalCliBinaryAvailability,
  resolveExternalCliRunnerStatus,
  resolveHostPiPackageRoot,
  resolveModelCandidate,
  resolveSkills,
  resolveSubagentModelOverride,
  serializeAgent,
  shortenPath,
  splitKnownThinkingSuffix,
  toModelInfo,
  validateAcceptanceInput,
  validateCodeOwnedProfileRunner,
  validateExecutionAcceptance,
  validateToolBudgetConfig,
  withFileLease,
  writeAtomicJson,
  writePrivateAtomicJson
} from "./chunk-CIZQXJ5Q.js";
import {
  DIRS,
  INTERCOM_DETACH_REQUEST_EVENT,
  SLASH_TEXT_RESULT_TYPE,
  SLASH_TEXT_VIEW_ONLY_DETAILS,
  SUBAGENT_ASYNC_COMPLETE_EVENT,
  SUBAGENT_ASYNC_STARTED_EVENT,
  SUBAGENT_CONTROL_EVENT,
  SUBAGENT_CONTROL_INTERCOM_EVENT,
  SUBAGENT_FOREGROUND_COMPLETE_EVENT,
  SUBAGENT_RESULT_INTERCOM_DELIVERY_EVENT,
  SUBAGENT_RESULT_INTERCOM_EVENT
} from "./chunk-5LFLVSTM.js";
import {
  previewDisplayText,
  safeTerminalText,
  sanitizeDisplayText
} from "./chunk-YFCK7H2S.js";
import {
  INSPECTOR_REGISTER_EVENT
} from "./chunk-62OCY2S4.js";
import {
  capabilityCeilingAgentRestrictionSources,
  isAgentAllowedByCapabilityCeiling,
  resolveCurrentSubagentCapabilityCeiling
} from "./chunk-Z7KVHQHL.js";

// src/inspectors/herdr/actions.ts
import * as fs from "node:fs";
import * as path from "node:path";
function bindingPath(asyncDir, index) {
  return path.join(asyncDir, "inspectors", `herdr${index === void 0 ? "" : `-${index}`}.json`);
}
function parse(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const binding = value;
  if (binding.schemaVersion !== 1 || binding.kind !== "herdr-inspector" || binding.childIndex !== void 0 && (!Number.isInteger(binding.childIndex) || binding.childIndex < 0) || typeof binding.runId !== "string" || typeof binding.asyncDir !== "string" || typeof binding.paneId !== "string" || typeof binding.openedAt !== "string" || typeof binding.command !== "string") return void 0;
  return binding;
}
function readHerdrInspectorBinding(asyncDir, index) {
  try {
    return parse(JSON.parse(fs.readFileSync(bindingPath(asyncDir, index), "utf8")));
  } catch {
    return void 0;
  }
}
function readHerdrInspectorBindingForTarget(target) {
  const binding = readHerdrInspectorBinding(target.asyncDir, target.index);
  if (!binding || binding.runId !== target.runId || binding.childIndex !== target.index) return void 0;
  try {
    if (fs.realpathSync(binding.asyncDir) !== fs.realpathSync(target.asyncDir)) return void 0;
  } catch {
    return void 0;
  }
  return binding;
}
function result(text2, isError = false) {
  return {
    content: [{ type: "text", text: text2 }],
    ...isError ? { isError: true } : {},
    details: { mode: "management", results: [] }
  };
}
function errorText(input) {
  return `Herdr inspector error (${input.code}): ${input.message}`;
}
function paneId(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const record = value;
  const pane2 = record.pane && typeof record.pane === "object" ? record.pane : record;
  for (const key of ["pane_id", "paneId", "id"]) {
    if (typeof pane2[key] === "string") return pane2[key];
  }
  return void 0;
}
async function pane(client, id, signal) {
  return client.run(["pane", "get", id], { timeoutMs: 5e3, signal });
}
async function openHerdrInspector(context, launch, params, client) {
  const detected = await detectHerdr(client, context.signal);
  if (!detected.ok) return result(errorText(detected.error), true);
  const existing = readHerdrInspectorBindingForTarget(context.target);
  if (existing) {
    const current = await pane(client, existing.paneId, context.signal);
    if (current.ok && paneId(current.data) === existing.paneId) {
      return result(`Herdr inspector pane ${existing.paneId} is already open for async run ${context.target.runId}.${params.focus ? " Herdr cannot refocus an arbitrary raw pane id; select it in the Herdr UI." : ""}`);
    }
  }
  const split = await client.run([
    "pane",
    "split",
    "--current",
    "--direction",
    "right",
    "--cwd",
    context.target.status.cwd ?? context.cwd,
    params.focus === true ? "--focus" : "--no-focus"
  ], { timeoutMs: 15e3, signal: context.signal });
  if (!split.ok) return result(errorText(split.error), true);
  const id = paneId(split.data);
  if (!id) return result("Herdr inspector error (PANE_GONE): pane split returned no pane id.", true);
  const started = await client.run(["pane", "run", id, launch.displayCommand], { timeoutMs: 15e3, signal: context.signal });
  if (!started.ok) {
    await client.run(["pane", "close", id], { timeoutMs: 5e3 });
    return result(errorText(started.error), true);
  }
  const now = (context.now?.() ?? /* @__PURE__ */ new Date()).toISOString();
  const binding = {
    schemaVersion: 1,
    kind: "herdr-inspector",
    runId: context.target.runId,
    asyncDir: context.target.asyncDir,
    ...context.target.index === void 0 ? {} : { childIndex: context.target.index },
    ...launch.mission ? { missionId: launch.mission.id, missionPath: launch.mission.path } : {},
    paneId: id,
    openedAt: now,
    ...params.focus === true ? { lastFocusedAt: now } : {},
    herdrVersion: detected.data.versionText,
    command: launch.displayCommand
  };
  writeAtomicJson(bindingPath(context.target.asyncDir, context.target.index), binding);
  return result(`Opened read-only Herdr inspector pane ${id} for async run ${context.target.runId}. Closing the pane does not stop the run.
Controls inside the pane: steer <message>, stop, status.`);
}
async function statusHerdrInspector(context, client) {
  const binding = readHerdrInspectorBindingForTarget(context.target);
  if (!binding) {
    return result(`No Herdr inspector binding exists for async run ${context.target.runId}${context.target.index === void 0 ? "" : ` child ${context.target.index}`}.`);
  }
  const live = await pane(client, binding.paneId, context.signal);
  if (!live.ok) {
    return result(`${errorText(live.error)}
Binding: ${bindingPath(context.target.asyncDir, context.target.index)}
Run state remains authoritative: ${context.target.status.state}.`, true);
  }
  return result(`Herdr inspector ${binding.paneId} is open for async run ${context.target.runId}.
Run state: ${context.target.status.state}
Binding: ${bindingPath(context.target.asyncDir, context.target.index)}`);
}
async function closeHerdrInspector(context, client) {
  const binding = readHerdrInspectorBindingForTarget(context.target);
  if (!binding) return result(`No Herdr inspector binding exists for async run ${context.target.runId}.`);
  const closed = await client.run(["pane", "close", binding.paneId], { timeoutMs: 1e4, signal: context.signal });
  if (!closed.ok && closed.error.code !== "NOT_FOUND" && closed.error.code !== "PANE_GONE") {
    return result(errorText(closed.error), true);
  }
  fs.rmSync(bindingPath(context.target.asyncDir, context.target.index), { force: true });
  return result(`Closed Herdr inspector pane ${binding.paneId} for async run ${context.target.runId}. The subagent run was not stopped.`);
}

// src/inspectors/herdr/plugin.ts
function createHerdrInspectorPlugin(deps = {}) {
  const client = deps.client ?? createHerdrClient();
  return {
    name: "herdr",
    available: async (context) => context.env.HERDR_ENV === "1" && Boolean(context.env.HERDR_PANE_ID?.trim()),
    owns: (context) => readHerdrInspectorBindingForTarget(context.target) !== void 0,
    open: (context, launch, params) => openHerdrInspector(context, launch, params, client),
    status: (context) => statusHerdrInspector(context, client),
    close: (context) => closeHerdrInspector(context, client)
  };
}

// src/inspectors/ghostty/actions.ts
import { execFile } from "node:child_process";
var GHOSTTY_APPLESCRIPT = `on run argv
  set launchCommand to item 1 of argv
  set launchCwd to item 2 of argv
  set shouldFocus to item 3 of argv
  tell application "Ghostty"
    set sourceWindow to front window
    set sourceTab to selected tab of sourceWindow
    set sourceTerminal to focused terminal of sourceTab
    set surfaceConfiguration to new surface configuration
    set initial working directory of surfaceConfiguration to launchCwd
    set command of surfaceConfiguration to launchCommand
    set newTerminal to split sourceTerminal direction right with configuration surfaceConfiguration
    if shouldFocus is "true" then
      focus newTerminal
    else
      focus sourceTerminal
    end if
    return id of newTerminal
  end tell
end run`;
function defaultRunner(args, options) {
  return new Promise((resolve4, reject) => {
    execFile("/usr/bin/osascript", [...args], options, (error2, stdout, stderr) => {
      if (error2) {
        const failure = error2 instanceof Error ? error2 : new Error(String(error2));
        reject(failure);
        return;
      }
      resolve4({ stdout, stderr });
    });
  });
}
function result2(text2, isError = false) {
  const response = {
    content: [{ type: "text", text: text2 }],
    details: { mode: "management", results: [] }
  };
  if (isError) response.isError = true;
  return response;
}
var failureHint = "Ghostty inspector requires Ghostty 1.3+ and Automation permission for osascript.";
async function openGhosttyInspector(context, launch, params, runner = defaultRunner) {
  try {
    const output = await runner(["-e", GHOSTTY_APPLESCRIPT, "--", launch.displayCommand, context.target.status.cwd ?? context.cwd, params.focus === true ? "true" : "false"], {
      signal: context.signal,
      timeout: 15e3,
      encoding: "utf8",
      maxBuffer: 64 * 1024
    });
    const id = output.stdout.trim();
    if (!id) return result2(`Ghostty inspector error: Ghostty returned an empty terminal id. ${failureHint}`, true);
    return result2(`Opened read-only Ghostty inspector terminal ${id} for async run ${context.target.runId}. Status and close are unavailable because this plugin writes no binding.`);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return result2(`Ghostty inspector error: ${message}. ${failureHint}`, true);
  }
}

// src/inspectors/ghostty/plugin.ts
var GHOSTTY_BUNDLE_ID = "com.mitchellh.ghostty";
function createGhosttyInspectorPlugin(deps = {}) {
  const platform = deps.platform ?? process.platform;
  return {
    name: "ghostty",
    available: (context) => {
      if (platform !== "darwin") return false;
      if (context.env.TERM_PROGRAM?.toLowerCase() !== "ghostty") return false;
      return context.env.__CFBundleIdentifier?.trim() === GHOSTTY_BUNDLE_ID;
    },
    owns: () => false,
    open: (context, launch, params) => openGhosttyInspector(context, launch, params, deps.runner)
  };
}

// src/inspectors/tmux/actions.ts
import * as fs2 from "node:fs";
import * as path2 from "node:path";
function bindingPath2(asyncDir, index) {
  return path2.join(asyncDir, "inspectors", `tmux${index === void 0 ? "" : `-${index}`}.json`);
}
function parse2(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const binding = value;
  if (binding.schemaVersion !== 1 || binding.kind !== "tmux-inspector" || binding.childIndex !== void 0 && (!Number.isInteger(binding.childIndex) || binding.childIndex < 0) || typeof binding.runId !== "string" || typeof binding.asyncDir !== "string" || typeof binding.paneId !== "string" || binding.serverPid !== void 0 && typeof binding.serverPid !== "string" || typeof binding.openedAt !== "string" || typeof binding.command !== "string") return void 0;
  return binding;
}
function readTmuxInspectorBinding(asyncDir, index) {
  try {
    return parse2(JSON.parse(fs2.readFileSync(bindingPath2(asyncDir, index), "utf8")));
  } catch {
    return void 0;
  }
}
function readTmuxInspectorBindingForTarget(target) {
  const binding = readTmuxInspectorBinding(target.asyncDir, target.index);
  if (!binding || binding.runId !== target.runId || binding.childIndex !== target.index) return void 0;
  try {
    if (fs2.realpathSync(binding.asyncDir) !== fs2.realpathSync(target.asyncDir)) return void 0;
  } catch {
    return void 0;
  }
  return binding;
}
function result3(text2, isError = false) {
  return {
    content: [{ type: "text", text: text2 }],
    ...isError ? { isError: true } : {},
    details: { mode: "management", results: [] }
  };
}
function errorText2(input) {
  return `tmux inspector error (${input.code}): ${input.message}`;
}
var OWNER_OPTION = "@pi-subagents-inspector";
function ownerTag(runId, index) {
  return `pi-subagents:${runId}:${index ?? "-"}`;
}
async function probePane(client, binding, signal) {
  const probe = await client.run(["list-panes", "-t", binding.paneId, "-F", `#{pane_id}|#{${OWNER_OPTION}}|#{pid}`], { timeoutMs: 5e3, signal });
  if (!probe.ok) return probe.error.code === "PANE_GONE" ? { state: "gone" } : { state: "error", error: probe.error };
  const line = probe.data.split(/\r?\n/).map((entry) => entry.trim()).find((entry) => entry.startsWith(`${binding.paneId}|`));
  if (!line) return { state: "gone" };
  const [tag, serverPid] = line.split("|").slice(1);
  if (tag !== ownerTag(binding.runId, binding.childIndex)) return { state: "stale" };
  if (binding.serverPid !== void 0 && binding.serverPid !== serverPid) return { state: "stale" };
  return { state: "alive" };
}
async function openTmuxInspector(context, launch, focus, client) {
  const detected = await client.run(["-V"], { timeoutMs: 3e3, signal: context.signal });
  if (!detected.ok) return result3(errorText2(detected.error), true);
  const existing = readTmuxInspectorBindingForTarget(context.target);
  if (existing) {
    const probe = await probePane(client, existing, context.signal);
    if (probe.state === "alive") {
      if (focus) {
        const refocus = await client.run(["select-pane", "-t", existing.paneId], { timeoutMs: 5e3, signal: context.signal });
        if (!refocus.ok) return result3(errorText2(refocus.error), true);
      }
      return result3(`tmux inspector pane ${existing.paneId} is already open for async run ${context.target.runId}. Ctrl-C inside the pane closes it.`);
    }
    if (probe.state === "error") return result3(errorText2(probe.error), true);
  }
  const originalPane = focus ? void 0 : await client.run(["display-message", "-p", "#{pane_id}"], { timeoutMs: 5e3, signal: context.signal });
  const split = await client.run([
    "split-window",
    "-h",
    "-P",
    "-F",
    "#{pane_id}",
    "-c",
    context.target.status.cwd ?? context.cwd,
    launch.displayCommand
  ], { timeoutMs: 15e3, signal: context.signal });
  if (!split.ok) return result3(errorText2(split.error), true);
  const id = split.data;
  if (!id.startsWith("%")) return result3(errorText2({ code: "TMUX_ERROR", message: `split-window returned no pane id ('${id}').` }), true);
  if (context.signal?.aborted) {
    await client.run(["kill-pane", "-t", id], { timeoutMs: 5e3 });
    return result3(errorText2({ code: "TIMEOUT", message: `tmux inspector open was aborted.` }), true);
  }
  if (originalPane?.ok && originalPane.data) {
    await client.run(["select-pane", "-t", originalPane.data], { timeoutMs: 5e3, signal: context.signal });
  }
  const stamp = await client.run(["set-option", "-p", "-t", id, OWNER_OPTION, ownerTag(context.target.runId, context.target.index)], { timeoutMs: 5e3 });
  if (!stamp.ok) {
    await client.run(["kill-pane", "-t", id], { timeoutMs: 5e3 });
    return result3(errorText2(stamp.error), true);
  }
  const server = await client.run(["display-message", "-p", "#{pid}"], { timeoutMs: 5e3 });
  const binding = {
    schemaVersion: 1,
    kind: "tmux-inspector",
    runId: context.target.runId,
    asyncDir: context.target.asyncDir,
    ...context.target.index === void 0 ? {} : { childIndex: context.target.index },
    paneId: id,
    ...server.ok ? { serverPid: server.data } : {},
    openedAt: (context.now?.() ?? /* @__PURE__ */ new Date()).toISOString(),
    tmuxVersion: detected.data,
    ...launch.mission ? { missionId: launch.mission.id, missionPath: launch.mission.path } : {},
    command: launch.displayCommand
  };
  try {
    writeAtomicJson(bindingPath2(context.target.asyncDir, context.target.index), binding);
  } catch (error2) {
    await client.run(["kill-pane", "-t", id], { timeoutMs: 5e3 });
    throw error2;
  }
  return result3(`Opened read-only tmux inspector pane ${id} for async run ${context.target.runId}. Closing the pane does not stop the run.
Controls inside the pane: steer <message>, stop, status. Ctrl-C closes the pane.`);
}
async function statusTmuxInspector(context, client) {
  const binding = readTmuxInspectorBindingForTarget(context.target);
  if (!binding) {
    return result3(`No tmux inspector binding exists for async run ${context.target.runId}${context.target.index === void 0 ? "" : ` child ${context.target.index}`}.`);
  }
  const label = context.target.index === void 0 ? "" : ` child ${context.target.index}`;
  const probe = await probePane(client, binding, context.signal);
  if (probe.state === "error") return result3(errorText2(probe.error), true);
  if (probe.state === "stale") {
    return result3(`tmux inspector pane ${binding.paneId} (run ${context.target.runId}${label}) is alive but does not carry this run's inspector marker; it may belong to other work after a tmux server restart.
Binding: ${bindingPath2(context.target.asyncDir, context.target.index)}
Run state remains authoritative: ${context.target.status.state}.`);
  }
  if (probe.state === "gone") {
    return result3(`tmux inspector pane ${binding.paneId} (run ${context.target.runId}${label}) no longer exists.
Binding: ${bindingPath2(context.target.asyncDir, context.target.index)}
Run state remains authoritative: ${context.target.status.state}.`);
  }
  return result3(`tmux inspector pane ${binding.paneId} is open for async run ${context.target.runId}${label}.
Run state: ${context.target.status.state}
Binding: ${bindingPath2(context.target.asyncDir, context.target.index)}`);
}
async function closeTmuxInspector(context, client) {
  const binding = readTmuxInspectorBindingForTarget(context.target);
  if (!binding) return result3(`No tmux inspector binding exists for async run ${context.target.runId}.`);
  const probe = await probePane(client, binding, context.signal);
  if (probe.state === "error") return result3(errorText2(probe.error), true);
  if (probe.state === "stale") {
    fs2.rmSync(bindingPath2(context.target.asyncDir, context.target.index), { force: true });
    return result3(`tmux inspector pane ${binding.paneId} does not carry this run's inspector marker; removed the stale binding without killing the pane.`);
  }
  if (probe.state === "alive") {
    const closed = await client.run(["kill-pane", "-t", binding.paneId], { timeoutMs: 1e4, signal: context.signal });
    if (!closed.ok && closed.error.code !== "PANE_GONE") {
      return result3(errorText2(closed.error), true);
    }
  }
  fs2.rmSync(bindingPath2(context.target.asyncDir, context.target.index), { force: true });
  return result3(`Closed tmux inspector pane ${binding.paneId} for async run ${context.target.runId}. The subagent run was not stopped.`);
}

// src/inspectors/tmux/client.ts
import { execFile as execFile2 } from "node:child_process";
function error(code, message, details) {
  return { ok: false, error: { code, message, ...details !== void 0 ? { details } : {} } };
}
function failureText(execError, stderr) {
  const direct = stderr?.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (direct) return direct;
  const lines = execError.message.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const withoutPrefix = lines.filter((line) => !/^Command failed:/.test(line));
  return withoutPrefix[0] ?? "tmux failed.";
}
function classifyFailure(text2) {
  const lower = text2.toLowerCase();
  if (lower.includes("can't find pane") || lower.includes("can't find window")) return "PANE_GONE";
  if (lower.includes("no server running") || lower.includes("no current client")) return "TMUX_UNAVAILABLE";
  return "TMUX_ERROR";
}
function createTmuxClient(options = {}) {
  const bin = options.bin ?? process.env.TMUX_BIN ?? "tmux";
  const execImpl = options.exec ?? execFile2;
  return {
    run(args, runOptions = {}) {
      return new Promise((resolve4) => {
        let settled = false;
        const abort = () => finish(error("TIMEOUT", `tmux command '${args.join(" ")}' was aborted.`));
        const finish = (result5) => {
          if (settled) return;
          settled = true;
          runOptions.signal?.removeEventListener("abort", abort);
          resolve4(result5);
        };
        if (runOptions.signal?.aborted) {
          abort();
          return;
        }
        runOptions.signal?.addEventListener("abort", abort, { once: true });
        execImpl(bin, args, { timeout: runOptions.timeoutMs ?? 1e4, signal: runOptions.signal }, (execError, stdout, stderr) => {
          if (execError) {
            const code = execError.code;
            if (code === "ENOENT") {
              finish(error("TMUX_UNAVAILABLE", "tmux is not installed or is not on PATH."));
              return;
            }
            const killed = execError;
            if (killed.killed === true || killed.signal) {
              finish(error("TIMEOUT", `tmux command '${args.join(" ")}' timed out.`));
              return;
            }
            const text2 = failureText(execError, stderr);
            const exitCode = Number(code);
            finish(error(exitCode === 127 ? "TMUX_UNAVAILABLE" : classifyFailure(text2), text2));
            return;
          }
          finish({ ok: true, data: stdout.trim() });
        });
      });
    }
  };
}

// src/inspectors/tmux/plugin.ts
function createTmuxInspectorPlugin(deps = {}) {
  const platform = deps.platform ?? process.platform;
  const client = deps.client ?? createTmuxClient();
  return {
    name: "tmux",
    available: (context) => platform !== "win32" && Boolean(context.env.TMUX),
    owns: (context) => readTmuxInspectorBindingForTarget(context.target) !== void 0,
    open: (context, launch, params) => openTmuxInspector(context, launch, params.focus === true, client),
    status: (context) => statusTmuxInspector(context, client),
    close: (context) => closeTmuxInspector(context, client)
  };
}

// src/inspectors/plugins.ts
var registries = /* @__PURE__ */ new WeakMap();
function getInspectorPlugins(pi) {
  return [createHerdrInspectorPlugin(), createGhosttyInspectorPlugin(), createTmuxInspectorPlugin(), ...registries.get(pi.events)?.plugins.values() ?? []];
}
function registerInspectorEventListener(pi) {
  let registry = registries.get(pi.events);
  if (!registry) {
    registry = { plugins: /* @__PURE__ */ new Map(), owners: 0 };
    registries.set(pi.events, registry);
  }
  registry.owners += 1;
  const { plugins } = registry;
  const builtinNames = /* @__PURE__ */ new Set([createHerdrInspectorPlugin().name, createGhosttyInspectorPlugin().name, createTmuxInspectorPlugin().name]);
  const unsubscribe = pi.events.on(INSPECTOR_REGISTER_EVENT, (rawRequest) => {
    if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) return;
    const request = rawRequest;
    if (request.result !== void 0) return;
    try {
      if (request.version !== 1) throw new Error(`Unsupported inspector registration version '${String(request.version)}'.`);
      const plugin = request.plugin;
      if (!plugin || typeof plugin !== "object" || Array.isArray(plugin)) throw new Error("Inspector plugin must be an object.");
      const name = plugin.name;
      if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)) {
        throw new Error("Inspector plugin name must contain 1\u2013128 letters, digits, dots, underscores, or hyphens and start with a letter or digit.");
      }
      if (builtinNames.has(name) || plugins.has(name)) throw new Error(`Inspector plugin '${name}' is already registered.`);
      for (const method of ["available", "owns", "open"]) {
        if (typeof plugin[method] !== "function") throw new Error(`Inspector plugin '${name}' requires ${method}().`);
      }
      for (const method of ["status", "close"]) {
        if (plugin[method] !== void 0 && typeof plugin[method] !== "function") throw new Error(`Inspector plugin '${name}' ${method} must be a function when provided.`);
      }
      plugins.set(name, plugin);
      let disposed = false;
      request.result = {
        ok: true,
        registration: {
          dispose() {
            if (disposed) return;
            disposed = true;
            plugins.delete(name);
          }
        }
      };
    } catch (error2) {
      request.result = { ok: false, error: error2 instanceof Error ? error2 : new Error(String(error2)) };
    }
  });
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    unsubscribe();
    registry.owners -= 1;
    if (registry.owners > 0) return;
    plugins.clear();
    if (registries.get(pi.events) === registry) registries.delete(pi.events);
  };
}

// src/runs/shared/tool-timeout.ts
var TOOL_TIMEOUT_ENV = "PI_SUBAGENT_TOOL_TIMEOUT_MS";
var MAX_TIMER_DELAY_MS = 2147483647;
var DEFAULT_FAST_TOOL_TIMEOUT_MS = 3e5;
var DEFAULT_FAST_TOOL_TIMEOUT_TOOLS = /* @__PURE__ */ new Set([
  "read",
  "grep",
  "find",
  "ls",
  "edit",
  "write",
  "structured_output"
]);
var TOOL_TIMEOUT_EXEMPT_TOOLS = /* @__PURE__ */ new Set(["contact_supervisor", "intercom", "bg_wait"]);
function isToolTimeoutExempt(toolName) {
  return toolName !== void 0 && TOOL_TIMEOUT_EXEMPT_TOOLS.has(toolName);
}
function defaultToolTimeoutMs(toolName) {
  return toolName !== void 0 && DEFAULT_FAST_TOOL_TIMEOUT_TOOLS.has(toolName) ? DEFAULT_FAST_TOOL_TIMEOUT_MS : void 0;
}
function effectiveToolTimeoutMs(toolName, configuredToolTimeoutMs) {
  if (isToolTimeoutExempt(toolName)) return void 0;
  return configuredToolTimeoutMs ?? defaultToolTimeoutMs(toolName);
}
function formatToolTimeoutMessage(toolName, timeoutMs) {
  return `Tool '${toolName}' exceeded its timeout of ${timeoutMs}ms.`;
}
function toolTimeoutCallKey(event, fallbackId) {
  return typeof event.toolCallId === "string" && event.toolCallId.length > 0 ? `id:${event.toolCallId}` : `anon:${String(event.toolName ?? "tool")}:${fallbackId}`;
}
function resolveToolTimeoutMs(input) {
  const candidates = [
    { label: "toolTimeoutMs", value: input.callValue },
    { label: "agent.toolTimeoutMs", value: input.agentValue },
    { label: "config.toolTimeoutMs", value: input.configValue }
  ];
  let winner;
  for (const candidate of candidates) {
    if (candidate.value === void 0) continue;
    winner = candidate;
    break;
  }
  if (winner === void 0 && input.envValue !== void 0 && input.envValue.trim() !== "") {
    winner = { label: TOOL_TIMEOUT_ENV, value: input.envValue };
  }
  if (winner === void 0) return {};
  let raw = winner.value;
  let parsed;
  if (winner.label === TOOL_TIMEOUT_ENV && typeof raw === "string") {
    parsed = Number(raw);
    if (raw.trim() !== "" && !Number.isNaN(parsed)) raw = parsed;
  }
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0 || raw > MAX_TIMER_DELAY_MS) {
    return { error: `${winner.label} must be a positive integer no larger than ${MAX_TIMER_DELAY_MS}.` };
  }
  return { toolTimeoutMs: raw };
}
function toolTimeoutFromEnv(env = process.env) {
  return env[TOOL_TIMEOUT_ENV];
}

// src/runs/shared/subagent-control.ts
import { createHash } from "node:crypto";
var CONTROL_EVENT_TYPES = ["active_long_running", "needs_attention"];
var CONTROL_NOTIFICATION_CHANNELS = ["event", "async", "intercom"];
var DEFAULT_NOTIFY_ON = ["active_long_running", "needs_attention"];
var DEFAULT_CONTROL_CONFIG = {
  enabled: true,
  needsAttentionAfterMs: 6e4,
  needsAttentionAfterMsIsExplicit: false,
  activeNoticeAfterMs: 24e4,
  failedToolAttemptsBeforeAttention: 3,
  notifyOn: DEFAULT_NOTIFY_ON,
  notifyChannels: CONTROL_NOTIFICATION_CHANNELS
};
function parsePositiveInt(value) {
  if (typeof value !== "number") return void 0;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) return void 0;
  return value;
}
function parseControlList(value, allowed) {
  if (!Array.isArray(value)) return void 0;
  if (value.length === 0) return [];
  const allowedSet = new Set(allowed);
  const parsed = value.filter((entry) => typeof entry === "string" && allowedSet.has(entry));
  return parsed.length > 0 ? Array.from(new Set(parsed)) : void 0;
}
function resolveControlConfig(globalConfig, override) {
  const enabled = override?.enabled ?? globalConfig?.enabled ?? DEFAULT_CONTROL_CONFIG.enabled;
  const overrideNeedsAttentionAfterMs = parsePositiveInt(override?.needsAttentionAfterMs);
  const globalNeedsAttentionAfterMs = parsePositiveInt(globalConfig?.needsAttentionAfterMs);
  const globalNeedsAttentionAfterMsIsExplicit = globalConfig?.needsAttentionAfterMsIsExplicit ?? globalNeedsAttentionAfterMs !== void 0;
  const needsAttentionAfterMs = overrideNeedsAttentionAfterMs ?? globalNeedsAttentionAfterMs ?? DEFAULT_CONTROL_CONFIG.needsAttentionAfterMs;
  const needsAttentionAfterMsIsExplicit = overrideNeedsAttentionAfterMs !== void 0 || globalNeedsAttentionAfterMsIsExplicit;
  const activeNoticeAfterMs = parsePositiveInt(override?.activeNoticeAfterMs) ?? parsePositiveInt(globalConfig?.activeNoticeAfterMs) ?? DEFAULT_CONTROL_CONFIG.activeNoticeAfterMs;
  const activeNoticeAfterTurns = parsePositiveInt(override?.activeNoticeAfterTurns) ?? parsePositiveInt(globalConfig?.activeNoticeAfterTurns);
  const activeNoticeAfterTokens = parsePositiveInt(override?.activeNoticeAfterTokens) ?? parsePositiveInt(globalConfig?.activeNoticeAfterTokens);
  const failedToolAttemptsBeforeAttention = parsePositiveInt(override?.failedToolAttemptsBeforeAttention) ?? parsePositiveInt(globalConfig?.failedToolAttemptsBeforeAttention) ?? DEFAULT_CONTROL_CONFIG.failedToolAttemptsBeforeAttention;
  const notifyOn = parseControlList(override?.notifyOn, CONTROL_EVENT_TYPES) ?? parseControlList(globalConfig?.notifyOn, CONTROL_EVENT_TYPES) ?? DEFAULT_CONTROL_CONFIG.notifyOn;
  const notifyChannels = parseControlList(override?.notifyChannels, CONTROL_NOTIFICATION_CHANNELS) ?? parseControlList(globalConfig?.notifyChannels, CONTROL_NOTIFICATION_CHANNELS) ?? DEFAULT_CONTROL_CONFIG.notifyChannels;
  return {
    enabled,
    needsAttentionAfterMs,
    needsAttentionAfterMsIsExplicit,
    activeNoticeAfterMs,
    activeNoticeAfterTurns,
    activeNoticeAfterTokens,
    failedToolAttemptsBeforeAttention,
    notifyOn: [...notifyOn],
    notifyChannels: [...notifyChannels]
  };
}
function scaledNeedsAttentionAfterMs(config, thinking) {
  if (config.needsAttentionAfterMsIsExplicit !== false) return config.needsAttentionAfterMs;
  switch (thinking) {
    case "medium":
      return config.needsAttentionAfterMs * 2;
    case "high":
      return config.needsAttentionAfterMs * 5;
    case "xhigh":
    case "max":
      return config.needsAttentionAfterMs * 10;
    default:
      return config.needsAttentionAfterMs;
  }
}
function deriveActivityState(input) {
  if (!input.config.enabled || input.currentTool || (input.turnCount ?? 0) === 0) return void 0;
  const now = input.now ?? Date.now();
  const lastActivity = input.lastActivityAt ?? input.startedAt;
  const ageMs = Math.max(0, now - lastActivity);
  return ageMs > scaledNeedsAttentionAfterMs(input.config, input.thinking) ? "needs_attention" : void 0;
}
function shouldEmitOpenToolAttention(input) {
  if (!input.config.enabled || !input.currentTool || input.currentToolStartedAt === void 0) return false;
  if (isToolTimeoutExempt(input.currentTool)) return false;
  const now = input.now ?? Date.now();
  return Math.max(0, now - input.currentToolStartedAt) >= input.config.activeNoticeAfterMs;
}
function buildControlEvent(input) {
  const ts = input.ts ?? Date.now();
  const type = input.type ?? (input.to === "active_long_running" ? "active_long_running" : "needs_attention");
  const elapsedMs = input.elapsedMs ?? (input.lastActivityAt ? Math.max(0, ts - input.lastActivityAt) : void 0);
  const elapsedSeconds = elapsedMs !== void 0 ? Math.floor(elapsedMs / 1e3) : void 0;
  const message = input.message ?? (type === "active_long_running" ? `${input.agent} is still active but long-running` : elapsedSeconds !== void 0 ? `${input.agent} needs attention (no observed activity for ${elapsedSeconds}s)` : `${input.agent} needs attention`);
  return {
    type,
    ...input.from ? { from: input.from } : {},
    to: input.to,
    ts,
    runId: input.runId,
    agent: input.agent,
    ...input.index !== void 0 ? { index: input.index } : {},
    message,
    reason: input.reason ?? (type === "active_long_running" ? "active_long_running" : "idle"),
    ...input.turns !== void 0 ? { turns: input.turns } : {},
    ...input.tokens !== void 0 ? { tokens: input.tokens } : {},
    ...input.toolCount !== void 0 ? { toolCount: input.toolCount } : {},
    ...input.currentTool ? { currentTool: input.currentTool } : {},
    ...input.toolCallId ? { toolCallId: input.toolCallId } : {},
    ...input.hasCommandController !== void 0 ? { hasCommandController: input.hasCommandController } : {},
    ...input.currentToolDurationMs !== void 0 ? { currentToolDurationMs: input.currentToolDurationMs } : {},
    ...input.currentPath ? { currentPath: input.currentPath } : {},
    ...elapsedMs !== void 0 ? { elapsedMs } : {},
    ...input.recentFailureSummary ? { recentFailureSummary: input.recentFailureSummary } : {},
    ...input.workflowKey ? { workflowKey: input.workflowKey } : {},
    ...input.phase ? { phase: input.phase } : {},
    ...input.label ? { label: input.label } : {},
    ...input.taskPreview ? { taskPreview: previewDisplayText(input.taskPreview, 160) } : {}
  };
}
function shouldNotifyControlEvent(config, event) {
  return config.enabled && config.notifyOn.includes(event.type);
}
function controlNotificationKey(event, childIntercomTarget) {
  const childKey = childIntercomTarget ?? (event.index !== void 0 ? `${event.runId}:${event.index}` : event.runId);
  const contextHash = createHash("sha256").update(formatControlNudge(event)).digest("hex").slice(0, 8);
  const callKey = event.reason === "tool_open_threshold" && event.toolCallId ? `:${event.toolCallId}` : "";
  return `${childKey}:${event.type}:${event.reason ?? "idle"}${callKey}:${contextHash}`;
}
function claimControlNotification(config, event, seenKeys, childIntercomTarget) {
  if (!shouldNotifyControlEvent(config, event)) return false;
  const key = controlNotificationKey(event, childIntercomTarget);
  if (seenKeys.has(key)) return false;
  seenKeys.add(key);
  return true;
}
function formatLongRunningFacts(event) {
  const facts = [];
  if (event.elapsedMs !== void 0) facts.push(`elapsed ${Math.floor(Math.max(0, event.elapsedMs) / 1e3)}s`);
  if (event.turns !== void 0) facts.push(`${event.turns} turns`);
  if (event.tokens !== void 0) facts.push(`${event.tokens} tokens`);
  if (event.toolCount !== void 0) facts.push(`${event.toolCount} tools`);
  if (event.currentTool) facts.push(`tool ${event.currentTool}${event.currentToolDurationMs !== void 0 ? ` ${Math.floor(Math.max(0, event.currentToolDurationMs) / 1e3)}s` : ""}`);
  if (event.currentPath) facts.push(`path ${event.currentPath}`);
  return facts.length > 0 ? facts.join(" | ") : void 0;
}
function formatControlNudge(event) {
  const scope = event.label ?? event.phase ?? event.workflowKey ?? event.taskPreview;
  if (event.recentFailureSummary) return previewDisplayText(`Resolve the recent failure${scope ? ` for ${scope}` : ""}: ${event.recentFailureSummary}. Report the smallest next step or ask for a decision.`, 160);
  if (event.currentTool || event.currentPath) {
    const current = [event.currentTool ? `tool ${event.currentTool}` : void 0, event.currentPath ? `path ${event.currentPath}` : void 0].filter(Boolean).join(" at ");
    return previewDisplayText(`Check ${current}${scope ? ` for ${scope}` : ""}. Report the smallest next step or ask for a decision.`, 160);
  }
  if (scope) return previewDisplayText(`Continue ${scope}. Report the smallest next step or ask for a decision.`, 160);
  return "What are you blocked on? Reply with the smallest next step or ask for a decision.";
}
function formatControlNoticeMessage(event, childIntercomTarget) {
  const runTarget = event.runId;
  const nudgeMessage = formatControlNudge(event);
  const steerCommand = `subagent({ action: "steer", id: "${runTarget}", message: ${JSON.stringify(nudgeMessage)}${event.index !== void 0 ? `, options: { index: ${event.index} }` : ""} })`;
  const nestedResumeCommand = `subagent({ action: "resume", id: "${runTarget}", message: ${JSON.stringify(nudgeMessage)} })`;
  const facts = formatLongRunningFacts(event);
  const head = (title) => [
    `${title}: ${event.agent}`,
    `Run: ${runTarget}${event.index !== void 0 ? ` step ${event.index + 1}` : ""}`,
    `Signal: ${event.message}`,
    facts ? `Facts: ${facts}` : void 0
  ];
  const status = `Status: subagent({ action: "status", id: "${runTarget}" })`;
  const lines = (items) => items.filter((line) => Boolean(line)).join("\n");
  if (event.type === "active_long_running") {
    return lines([
      ...head("Subagent active but long-running"),
      "Hint: Inspect status first. Use steer for a top-level live async child, routed resume for a live nested child, or resume to revive a paused/completed/failed child.",
      `Top-level live async nudge: ${steerCommand}`,
      `Routed live nested nudge: ${nestedResumeCommand}`,
      childIntercomTarget ? `Direct intercom target: ${childIntercomTarget}` : void 0,
      status,
      `Interrupt: subagent({ action: "interrupt", id: "${runTarget}" })`
    ]);
  }
  if (event.reason === "tool_open_threshold" && event.currentTool === "bash") {
    const command = (label, action) => `${label}: subagent(${JSON.stringify({ action, id: runTarget, options: { ...event.index !== void 0 ? { index: event.index } : {}, toolCallId: event.toolCallId } })})`;
    return lines([
      ...head("Subagent needs attention"),
      "Hint: Inspect the running command and recent output before nudging. A queued steer does not cancel an in-flight bash call. A dev server or watch command may intentionally never return. Elapsed time alone does not prove the command is stuck.",
      "Recovery: For a local Pi child explicitly granted subagent_command, yield a needed persistent command or cancel the exact incorrect command, then steer the child. Query command.status to confirm the result. If command controls are unavailable, inspect partial changes and interruption scope before interrupt/resume; interrupt is run-scoped and may affect siblings.",
      ...event.toolCallId && event.hasCommandController ? [command("Command", "command.status"), command("Yield", "command.yield"), command("Cancel", "command.cancel")] : [],
      status,
      `Transcript: subagent({ action: "status", id: "${runTarget}", options: { view: "transcript"${event.index !== void 0 ? `, index: ${event.index}` : ""} } })`
    ]);
  }
  const supervisorHint = event.reason === "supervisor_request" ? "Supervisor request: reply to the pending request. If subagent_supervisor pending is empty, check intercom pending because an external intercom tool may own the request." : void 0;
  return lines([
    ...head("Subagent needs attention"),
    event.recentFailureSummary ? `Recent failures: ${event.recentFailureSummary}` : void 0,
    supervisorHint,
    "Hint: Inspect status first unless the run is clearly blocked. Use steer for a top-level live async child, routed resume for a live nested child, or resume to revive a paused/completed/failed child.",
    `Top-level live async nudge: ${steerCommand}`,
    `Routed live nested nudge: ${nestedResumeCommand}`,
    childIntercomTarget ? `Direct intercom target: ${childIntercomTarget}` : void 0,
    status,
    `Interrupt: subagent({ action: "interrupt", id: "${runTarget}" })`
  ]);
}
function formatControlIntercomMessage(event, childIntercomTarget) {
  const statusLabel2 = event.type === "active_long_running" ? "subagent active but long-running" : "subagent needs attention";
  return [
    statusLabel2,
    "",
    event.type === "active_long_running" ? `${event.agent} is still active but long-running in run ${event.runId}.` : `${event.agent} needs attention in run ${event.runId}.`,
    "",
    formatControlNoticeMessage(event, childIntercomTarget)
  ].join("\n");
}

// src/workflows/workflow-revival.ts
import * as fs3 from "node:fs";
import * as path3 from "node:path";
var REVIVAL_LINK_FILE = "workflow-revival.json";
var REVIVAL_ORIGIN_FILE = "workflow-revival-origin.json";
var MAX_REVIVAL_DEPTH = 16;
var KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function isRunId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 255 && path3.basename(value) === value && value !== "." && value !== "..";
}
function readLink(file) {
  let value;
  try {
    value = JSON.parse(fs3.readFileSync(file, "utf-8"));
  } catch {
    return void 0;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const link = value;
  if (link.version !== 1 || !isRunId(link.workflowRunId) || typeof link.workflowKey !== "string" || !KEY_PATTERN.test(link.workflowKey) || !isRunId(link.sourceRunId) || !isRunId(link.revivedRunId)) return void 0;
  if (!Number.isInteger(link.depth) || link.depth < 1 || link.depth > MAX_REVIVAL_DEPTH) return void 0;
  return { version: 1, workflowRunId: link.workflowRunId, workflowKey: link.workflowKey, sourceRunId: link.sourceRunId, revivedRunId: link.revivedRunId, depth: link.depth };
}
function recordWorkflowRevival(asyncDirRoot, sourceRunId, revivedRunId) {
  const sourceDir = path3.join(asyncDirRoot, sourceRunId);
  const status = readStatus(sourceDir);
  if (status?.runId !== sourceRunId || status.state !== "failed") return;
  const origin = isRunId(status.parentWorkflowRunId) && typeof status.workflowKey === "string" && KEY_PATTERN.test(status.workflowKey) ? { workflowRunId: status.parentWorkflowRunId, workflowKey: status.workflowKey, depth: 0 } : readLink(path3.join(sourceDir, REVIVAL_ORIGIN_FILE));
  if (!origin || "revivedRunId" in origin && origin.revivedRunId !== sourceRunId) return;
  if (origin.depth >= MAX_REVIVAL_DEPTH) throw new Error(`workflow key '${origin.workflowKey}' of ${origin.workflowRunId} already has ${MAX_REVIVAL_DEPTH} chained revivals.`);
  const link = { version: 1, workflowRunId: origin.workflowRunId, workflowKey: origin.workflowKey, sourceRunId, revivedRunId, depth: origin.depth + 1 };
  const originFile = path3.join(asyncDirRoot, revivedRunId, REVIVAL_ORIGIN_FILE);
  writePrivateAtomicJson(originFile, link);
  try {
    writePrivateAtomicJson(path3.join(sourceDir, REVIVAL_LINK_FILE), link);
  } catch (error2) {
    if (readLink(path3.join(sourceDir, REVIVAL_LINK_FILE))?.revivedRunId !== revivedRunId) fs3.rmSync(originFile, { force: true });
    throw error2;
  }
}
function projectWorkflowKeyRevival(asyncDirRoot, workflowRunId, workflowKey, runId) {
  if (!isRunId(runId)) return void 0;
  const revivedRunIds = [];
  let current = runId;
  while (revivedRunIds.length < MAX_REVIVAL_DEPTH) {
    const link = readLink(path3.join(asyncDirRoot, current, REVIVAL_LINK_FILE));
    if (!link || link.sourceRunId !== current || link.workflowRunId !== workflowRunId || link.workflowKey !== workflowKey) break;
    revivedRunIds.push(link.revivedRunId);
    current = link.revivedRunId;
  }
  if (revivedRunIds.length === 0) return void 0;
  let status = null;
  try {
    status = readStatus(path3.join(asyncDirRoot, current));
  } catch {
  }
  return { revivedRunIds, latestRunId: current, ...status?.runId === current ? { state: status.state } : {} };
}
function formatWorkflowKeyRevival(revival) {
  return `Revived \u2192 ${revival.revivedRunIds.join(" \u2192 ")}: ${revival.state === "complete" ? "completed" : revival.state ?? "status unavailable"}`;
}
function withWorkflowRevivals(asyncDirRoot, workflowRunId, children) {
  return children.map((child) => {
    if (child.ok || child.state === "running" || !child.runId) return child;
    const lineage = child.continuation?.runIds ?? [child.runId];
    const revival = projectWorkflowKeyRevival(asyncDirRoot, workflowRunId, child.key, lineage.at(-1) ?? child.runId);
    return revival ? { ...child, continuation: { runIds: [...lineage, ...revival.revivedRunIds] }, revival } : child;
  });
}

// src/intercom/result-intercom.ts
import { randomUUID } from "node:crypto";
import * as fs4 from "node:fs";

// src/runs/shared/process-signal.ts
function formatMidToolExitError(input) {
  if (input.exitCode === void 0 && !input.processSignal) {
    return `Subagent session ended during '${input.toolName}' tool execution before the tool completed. Earlier assistant output is not a terminal result.`;
  }
  const terminal = [`exit ${input.exitCode ?? "unknown"}`, ...input.processSignal ? [`signal ${input.processSignal}`] : []].join(", ");
  return `Subagent process exited during '${input.toolName}' tool execution (${terminal}) before the tool completed. Earlier assistant output is not a terminal result.`;
}
function isOrdinaryToolForMidToolExit(toolName) {
  return toolName !== "intercom" && toolName !== "contact_supervisor";
}
function isUnexplainedProcessSignal(input) {
  return Boolean(input.processSignal) && input.interrupted !== true && input.timedOut !== true && input.stopped !== true && input.turnBudgetExceeded !== true && input.forcedDrainAfterFinalSuccess !== true;
}

// src/intercom/result-intercom.ts
function resolveSubagentResultStatus(input) {
  if (input.detached) return "detached";
  if (input.stopped || input.state === "stopped") return "stopped";
  if (input.interrupted || input.state === "paused") return "paused";
  if (input.state === "running" || input.state === "queued") return "running";
  if (input.success === true) return "completed";
  if (isUnexplainedProcessSignal(input) && input.exitCode !== 0) return "stopped";
  if (input.success === false) return "failed";
  if (input.state === "complete") return "completed";
  if (input.state === "failed") return "failed";
  if (typeof input.exitCode === "number") return input.exitCode === 0 ? "completed" : "failed";
  return "failed";
}
function countStatuses(children) {
  const counts = {
    running: 0,
    completed: 0,
    failed: 0,
    paused: 0,
    stopped: 0,
    detached: 0
  };
  for (const child of children) {
    counts[child.status] += 1;
  }
  return counts;
}
function formatStatusCounts(counts) {
  const parts = [
    counts.running ? `${counts.running} running` : void 0,
    counts.completed ? `${counts.completed} completed` : void 0,
    counts.failed ? `${counts.failed} failed` : void 0,
    counts.stopped ? `${counts.stopped} stopped` : void 0,
    counts.paused ? `${counts.paused} paused` : void 0,
    counts.detached ? `${counts.detached} detached` : void 0
  ].filter((part) => Boolean(part));
  return parts.length ? parts.join(", ") : "0 results";
}
function countOutputStates(children) {
  const counts = { present: 0, absent: 0, unknown: 0 };
  for (const child of children) counts[child.outputState ?? "unknown"] += 1;
  return counts;
}
function formatOutputCounts(counts) {
  const parts = [
    counts.present ? `${counts.present} present` : void 0,
    counts.absent ? `${counts.absent} absent` : void 0,
    counts.unknown ? `${counts.unknown} unknown` : void 0
  ].filter((part) => Boolean(part));
  return parts.length ? parts.join(", ") : "0 outputs";
}
function resolveGroupedStatus(children) {
  const counts = countStatuses(children);
  if (counts.failed > 0) return "failed";
  if (counts.stopped > 0) return "stopped";
  if (counts.paused > 0) return "paused";
  if (counts.running > 0) return "running";
  if (counts.completed > 0) return "completed";
  if (counts.detached > 0) return "detached";
  return "failed";
}
function compactNestedRun(run, depth = 0) {
  return {
    id: run.id,
    parentRunId: run.parentRunId,
    ...run.parentStepIndex !== void 0 ? { parentStepIndex: run.parentStepIndex } : {},
    ...run.parentAgent ? { parentAgent: run.parentAgent } : {},
    depth: run.depth,
    path: run.path.slice(0, 4).map((part) => ({
      runId: part.runId,
      ...part.stepIndex !== void 0 ? { stepIndex: part.stepIndex } : {},
      ...part.agent ? { agent: part.agent } : {}
    })),
    ...run.asyncDir ? { asyncDir: run.asyncDir } : {},
    ...run.sessionId ? { sessionId: run.sessionId } : {},
    ...run.sessionName ? { sessionName: run.sessionName } : {},
    ...run.sessionFile ? { sessionFile: run.sessionFile } : {},
    ...run.intercomTarget ? { intercomTarget: run.intercomTarget } : {},
    ...run.ownerIntercomTarget ? { ownerIntercomTarget: run.ownerIntercomTarget } : {},
    ...run.leafIntercomTarget ? { leafIntercomTarget: run.leafIntercomTarget } : {},
    ...run.ownerState ? { ownerState: run.ownerState } : {},
    ...run.mode ? { mode: run.mode } : {},
    state: run.state,
    ...run.agent ? { agent: run.agent } : {},
    ...run.agents?.length ? { agents: run.agents.slice(0, 12) } : {},
    ...run.model ? { model: run.model } : {},
    ...run.thinking ? { thinking: run.thinking } : {},
    ...run.currentStep !== void 0 ? { currentStep: run.currentStep } : {},
    ...run.chainStepCount !== void 0 ? { chainStepCount: run.chainStepCount } : {},
    ...run.parallelGroups?.length ? { parallelGroups: run.parallelGroups.slice(0, 8) } : {},
    ...run.activityState ? { activityState: run.activityState } : {},
    ...run.lastActivityAt !== void 0 ? { lastActivityAt: run.lastActivityAt } : {},
    ...run.currentTool ? { currentTool: run.currentTool } : {},
    ...run.currentToolStartedAt !== void 0 ? { currentToolStartedAt: run.currentToolStartedAt } : {},
    ...run.currentPath ? { currentPath: run.currentPath } : {},
    ...run.turnCount !== void 0 ? { turnCount: run.turnCount } : {},
    ...run.toolCount !== void 0 ? { toolCount: run.toolCount } : {},
    ...run.totalTokens ? { totalTokens: run.totalTokens } : {},
    ...run.startedAt !== void 0 ? { startedAt: run.startedAt } : {},
    ...run.endedAt !== void 0 ? { endedAt: run.endedAt } : {},
    ...run.lastUpdate !== void 0 ? { lastUpdate: run.lastUpdate } : {},
    ...run.error ? { error: run.error } : {},
    ...run.steps?.length ? { steps: run.steps.slice(0, 12).map((step) => ({
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
      ...depth < 2 && step.children?.length ? { children: step.children.slice(0, 8).map((child) => compactNestedRun(child, depth + 1)) } : {}
    })) } : {},
    ...depth < 2 && run.children?.length ? { children: run.children.slice(0, 8).map((child) => compactNestedRun(child, depth + 1)) } : {}
  };
}
function compactNestedResultChildren(children) {
  if (!children?.length) return void 0;
  return children.slice(0, 16).map((child) => compactNestedRun(child));
}
function attachNestedChildrenToResultChildren(runId, children, nestedChildren) {
  const compact = compactNestedResultChildren(nestedChildren);
  if (!compact?.length) return children.map((child) => ({ ...child, children: compactNestedResultChildren(child.children) }));
  return children.map((child, index) => {
    const childIndex = child.index ?? index;
    const alreadyAttachedIds = new Set(child.children?.map((nested) => nested.id) ?? []);
    const attached = compact.filter((nested) => nested.parentRunId === runId && nested.parentStepIndex === childIndex && !alreadyAttachedIds.has(nested.id));
    const fallbackAttached = children.length === 1 ? compact.filter((nested) => nested.parentRunId === runId && nested.parentStepIndex === void 0 && !alreadyAttachedIds.has(nested.id)) : [];
    const merged = compactNestedResultChildren([...child.children ?? [], ...attached, ...fallbackAttached]);
    return merged?.length ? { ...child, children: merged } : { ...child, children: void 0 };
  });
}
function formatNestedResultLines(children) {
  if (!children?.length) return [];
  const lines = ["Nested subagents:"];
  let remaining = 10;
  const append = (runs, indent) => {
    for (const run of runs ?? []) {
      if (remaining <= 0) {
        lines.push(`${indent}\u21B3 +more nested runs; inspect status for full tree`);
        return;
      }
      remaining--;
      const label = run.agent ?? run.agents?.join("+") ?? run.id;
      lines.push(`${indent}\u21B3 ${label} \u2014 ${run.state} [${run.id}]`);
      if (run.sessionFile) lines.push(`${indent}  Session: ${run.sessionFile}`);
      append(run.children, `${indent}  `);
      for (const step of run.steps ?? []) append(step.children, `${indent}    `);
    }
  };
  append(children, "");
  return lines;
}
function asyncResumeGuidance(input) {
  if (input.source !== "async" || !input.asyncId) return void 0;
  const resumable = input.children.filter((child) => typeof child.sessionPath === "string" && fs4.existsSync(child.sessionPath));
  if (input.children.length === 1 && resumable.length === 1) {
    return `Revive: subagent({ action: "resume", id: "${input.asyncId}", message: "..." })`;
  }
  if (resumable.length > 0) {
    const firstIndex = resumable[0]?.index ?? input.children.indexOf(resumable[0]);
    return `Revive child: subagent({ action: "resume", id: "${input.asyncId}", message: "...", options: { index: ${firstIndex} } })`;
  }
  return "Resume: unavailable; no child session file was persisted.";
}
function formatSubagentResultIntercomMessage(input) {
  const counts = countStatuses(input.children);
  const outputCounts = countOutputStates(input.children);
  const lines = [
    "subagent results",
    "",
    `Run: ${input.runId}`,
    `Mode: ${input.mode}`,
    `Process status: ${input.status}`,
    `Children: ${formatStatusCounts(counts)}`,
    `Outputs: ${formatOutputCounts(outputCounts)} (semantic adequacy unassessed)`
  ];
  if (input.children.some((child) => child.status === "failed" && child.outputState === "present")) {
    lines.push("Recovery: At least one failed process produced output. Inspect that output before retrying; output presence does not establish task completion.");
  }
  if (input.mode === "chain" && typeof input.chainSteps === "number") {
    lines.push(`Chain steps: ${input.chainSteps}`);
  }
  if (input.asyncId) lines.push(`Async id: ${input.asyncId}`);
  if (input.asyncDir) lines.push(`Async dir: ${input.asyncDir}`);
  if (input.parallelHandoff) lines.push(`Parallel handoff: ${input.parallelHandoff.path}`);
  const resumeGuidance = asyncResumeGuidance(input);
  if (resumeGuidance) lines.push(resumeGuidance);
  if (input.children.some((child) => child.intercomTarget)) {
    lines.push("");
    lines.push(input.source === "async" ? "Previous intercom targets below identify child sessions used while they were running. Inspect artifacts or session logs if resume is unavailable." : "Intercom targets below identify child sessions used while they were running; completed child sessions may no longer be reachable. Inspect artifacts or session logs for follow-up.");
  }
  for (let index = 0; index < input.children.length; index++) {
    const child = input.children[index];
    lines.push("");
    lines.push(`${index + 1}. ${child.agent} \u2014 process ${child.status} \xB7 output ${child.outputState ?? "unknown"}${child.outputPartial ? " (partial)" : ""}`);
    if (child.intercomTarget) lines.push(`${input.source === "async" ? "Previous intercom target" : "Run intercom target"}: ${child.intercomTarget}`);
    if (child.artifactPath) lines.push(`Output artifact: ${child.artifactPath}`);
    if (child.sessionPath) lines.push(`Session: ${child.sessionPath}`);
    lines.push(...formatNestedResultLines(child.children));
    lines.push("Summary:");
    lines.push(child.summary);
  }
  return lines.join("\n");
}
function buildSubagentResultIntercomPayload(input) {
  const children = input.children.map((child) => ({
    ...child,
    outputState: child.outputState ?? "unknown",
    ...child.outputPartial ? { outputPartial: true } : {},
    summary: child.summary.trim() || "(no output)",
    children: compactNestedResultChildren(child.children)
  }));
  const status = resolveGroupedStatus(children);
  const summary = formatStatusCounts(countStatuses(children));
  const firstChild = children[0];
  const payload = {
    to: input.to,
    runId: input.runId,
    mode: input.mode,
    status,
    summary,
    source: input.source,
    children,
    ...input.asyncId ? { asyncId: input.asyncId } : {},
    ...input.asyncDir ? { asyncDir: input.asyncDir } : {},
    ...typeof input.chainSteps === "number" ? { chainSteps: input.chainSteps } : {},
    ...input.parallelHandoff ? { parallelHandoff: input.parallelHandoff } : {},
    ...firstChild?.agent ? { agent: firstChild.agent } : {},
    ...firstChild?.index !== void 0 ? { index: firstChild.index } : {},
    ...firstChild?.artifactPath ? { artifactPath: firstChild.artifactPath } : {},
    ...firstChild?.sessionPath ? { sessionPath: firstChild.sessionPath } : {},
    message: ""
  };
  payload.message = formatSubagentResultIntercomMessage(payload);
  return payload;
}
async function deliverSubagentResultIntercomEvent(events, payload, timeoutMs = 500) {
  return deliverSubagentIntercomMessageEvent(events, payload.to, payload.message, timeoutMs, payload);
}
async function deliverSubagentIntercomMessageEvent(events, to, message, timeoutMs = 500, extra = {}) {
  if (typeof events.on !== "function" || typeof events.emit !== "function") return false;
  const requestId = typeof extra.requestId === "string" ? extra.requestId : randomUUID();
  return new Promise((resolve4) => {
    let settled = false;
    let unsubscribe;
    let timer;
    const finish = (delivered) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
      resolve4(delivered);
    };
    unsubscribe = events.on(SUBAGENT_RESULT_INTERCOM_DELIVERY_EVENT, (data) => {
      if (!data || typeof data !== "object") return;
      const delivery = data;
      if (delivery.requestId !== requestId) return;
      finish(delivery.delivered === true);
    });
    timer = setTimeout(() => finish(false), timeoutMs);
    try {
      events.emit(SUBAGENT_RESULT_INTERCOM_EVENT, { ...extra, to, message, requestId });
    } catch {
      finish(false);
    }
  });
}
function stripSingleResultOutputs(result5) {
  return {
    ...result5,
    messages: void 0,
    finalOutput: void 0,
    truncation: void 0
  };
}
function stripDetailsOutputsForIntercomReceipt(details) {
  return {
    ...details,
    results: details.results.map(stripSingleResultOutputs)
  };
}
function formatSubagentResultReceipt(input) {
  const counts = countStatuses(input.payload.children);
  const modeLabel = input.mode === "single" ? "single subagent result" : input.mode === "parallel" ? "parallel subagent results" : "chain subagent results";
  const lines = [
    `Delivered ${modeLabel} via intercom.`,
    `Run: ${input.runId}`,
    `Children: ${formatStatusCounts(counts)}`
  ];
  if (input.payload.parallelHandoff) lines.push(`Parallel handoff: ${input.payload.parallelHandoff.path}`);
  const artifacts = input.payload.children.filter((child) => typeof child.artifactPath === "string");
  if (artifacts.length > 0) {
    lines.push("Artifacts:");
    for (const child of artifacts) {
      lines.push(`- ${child.agent} [${child.status}]: ${child.artifactPath}`);
    }
  }
  const intercomTargets = input.payload.children.filter((child) => typeof child.intercomTarget === "string");
  if (intercomTargets.length > 0) {
    lines.push("Run intercom targets (may be inactive after completion):");
    for (const child of intercomTargets) {
      lines.push(`- ${child.agent} [${child.status}]: ${child.intercomTarget}`);
    }
  }
  const sessions = input.payload.children.filter((child) => typeof child.sessionPath === "string");
  if (sessions.length > 0) {
    lines.push("Sessions:");
    for (const child of sessions) {
      lines.push(`- ${child.agent} [${child.status}]: ${child.sessionPath}`);
    }
  }
  lines.push("Full grouped output was sent over intercom.");
  return lines.join("\n");
}

// src/runs/background/scheduled-runs.ts
import { spawnSync } from "node:child_process";
import { createHash as createHash2, randomUUID as randomUUID2 } from "node:crypto";
import * as fs5 from "node:fs";
import * as os from "node:os";
import * as path4 from "node:path";

// src/runs/background/calendar-schedule.ts
import { createRequire } from "node:module";
var require2 = createRequire(new URL("../src/runs/background/calendar-schedule.js", import.meta.url).href);
var cachedTemporal;
function getTemporal() {
  return cachedTemporal ??= require2("@js-temporal/polyfill").Temporal;
}
var CALENDAR_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var SEARCH_DAYS = 32;
function normalizeCalendarRule(input) {
  if (input.every !== "day" && input.every !== "week") throw new Error("Calendar every must be 'day' or 'week'.");
  if (typeof input.at !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.at)) throw new Error("Calendar at must use HH:mm (00:00-23:59).");
  if (typeof input.timezone !== "string" || !input.timezone.trim() || /^[+-]/.test(input.timezone.trim())) throw new Error("Calendar timezone requires an IANA name, such as 'Asia/Taipei', or 'UTC'.");
  let timezone;
  try {
    timezone = new Intl.DateTimeFormat("en", { timeZone: input.timezone.trim() }).resolvedOptions().timeZone;
  } catch {
    throw new Error(`Invalid calendar timezone '${input.timezone}'. Use an IANA name or 'UTC'.`);
  }
  if (input.every === "day") {
    if (input.on !== void 0) throw new Error("Daily schedules do not accept on; use every:'week' with a weekday array.");
    return { every: "day", at: input.at, timezone };
  }
  if (!Array.isArray(input.on) || input.on.length === 0 || input.on.some((day) => !CALENDAR_WEEKDAYS.includes(day))) throw new Error("Weekly on must be a non-empty array of mon/tue/wed/thu/fri/sat/sun.");
  const selected = input.on;
  return { every: "week", at: input.at, timezone, on: CALENDAR_WEEKDAYS.filter((day) => selected.includes(day)) };
}
function localDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Calendar nextLocalDate must use YYYY-MM-DD.");
  return getTemporal().PlainDate.from(value, { overflow: "reject" });
}
function referenceDate(rule, reference) {
  return getTemporal().Instant.fromEpochMilliseconds(reference).toZonedDateTimeISO(rule.timezone).toPlainDate();
}
function occurrence(rule, date) {
  if (rule.every === "week" && !rule.on.includes(CALENDAR_WEEKDAYS[date.dayOfWeek - 1])) return void 0;
  const requested = date.toPlainDateTime(rule.at);
  const zoned = requested.toZonedDateTime(rule.timezone, { disambiguation: "earlier" });
  if (!zoned.toPlainDateTime().equals(requested)) return void 0;
  return { nextLocalDate: date.toString(), nextRunAt: new Date(zoned.epochMilliseconds).toISOString() };
}
function nextCalendarOccurrence(rule, after, minimumDate) {
  let date = referenceDate(rule, after);
  if (minimumDate && getTemporal().PlainDate.compare(date, localDate(minimumDate)) < 0) date = localDate(minimumDate);
  for (let i = 0; i < SEARCH_DAYS; i++, date = date.add({ days: 1 })) {
    const candidate = occurrence(rule, date);
    if (candidate && Date.parse(candidate.nextRunAt) > after) return candidate;
  }
  throw new Error("No valid calendar occurrence within 32 local dates; check the timezone and rule.");
}
function latestCalendarOccurrence(rule, now, minimumDate) {
  const floor = localDate(minimumDate);
  let date = referenceDate(rule, now);
  for (let i = 0; i < SEARCH_DAYS; i++, date = date.subtract({ days: 1 })) {
    if (getTemporal().PlainDate.compare(date, floor) < 0) return void 0;
    const candidate = occurrence(rule, date);
    if (candidate && Date.parse(candidate.nextRunAt) <= now) return candidate;
  }
  throw new Error("No valid calendar occurrence within 32 local dates; check the timezone and rule.");
}
function calendarDateAfter(rule, consumedAt, pendingDate) {
  const consumed = referenceDate(rule, consumedAt);
  const pending = localDate(pendingDate);
  return (getTemporal().PlainDate.compare(consumed, pending) > 0 ? consumed : pending).add({ days: 1 }).toString();
}
function restoreCalendarTrigger(input) {
  const rule = normalizeCalendarRule(input);
  let date = localDate(input.nextLocalDate);
  if (rule.every === "week" && !rule.on.includes(CALENDAR_WEEKDAYS[date.dayOfWeek - 1])) throw new Error("Calendar nextLocalDate is outside the selected weekdays.");
  if (typeof input.nextRunAt !== "string" || !Number.isFinite(Date.parse(input.nextRunAt))) throw new Error("Calendar nextRunAt must be a valid timestamp.");
  for (let i = 0; i < SEARCH_DAYS; i++, date = date.add({ days: 1 })) {
    const candidate = occurrence(rule, date);
    if (candidate) return { kind: "calendar", ...rule, ...candidate };
  }
  throw new Error("No valid pending calendar occurrence within 32 local dates.");
}

// src/runs/background/scheduled-runs.ts
var SCHEDULED_RUN_ACTIONS = [
  "schedule.create",
  "schedule.list",
  "schedule.show",
  "schedule.history",
  "schedule.pause",
  "schedule.resume",
  "schedule.run",
  "schedule.run-due",
  "schedule.delete"
];
var MAX_TIMER_DELAY_MS2 = 2147483647;
var DEFAULT_MAX_PENDING = 20;
var MAX_HISTORY = 100;
var STALE_LAUNCH_CLAIM_MS = 5 * 6e4;
var SCHEDULE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function isScheduledRunAction(action) {
  return typeof action === "string" && SCHEDULED_RUN_ACTIONS.includes(action);
}
function scheduledRunsEnabled(config) {
  return config.scheduledRuns?.enabled !== false;
}
function scheduledRunStorePath(cwd, _sessionId, root) {
  if (!root) return path4.join(getProjectSubagentsDir(path4.resolve(cwd)), "schedules");
  const projectKey = createHash2("sha256").update(path4.resolve(cwd)).digest("hex").slice(0, 20);
  return path4.join(root, projectKey);
}
function parseScheduledRunTime(at, now = Date.now()) {
  const trimmed = at.trim();
  const relative2 = trimmed.match(/^\+(\d+)(s|m|h|d)$/);
  if (relative2) {
    const amount = Number(relative2[1]);
    if (!Number.isSafeInteger(amount) || amount < 1) throw new Error(`Invalid at value "${at}". Relative delays must be positive, such as "+10m".`);
    const unitMs = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[relative2[2]];
    const result5 = now + amount * unitMs;
    if (!Number.isSafeInteger(result5)) throw new Error(`Invalid at value "${at}". Relative delay is too large.`);
    return result5;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/);
  if (!iso) throw new Error(`Invalid at value "${at}". Use a one-shot delay such as "+10m" or an ISO timestamp with timezone.`);
  const year = Number(iso[1]);
  const month = Number(iso[2]);
  const day = Number(iso[3]);
  const hour = Number(iso[4]);
  const minute = Number(iso[5]);
  const second = iso[6] === void 0 ? 0 : Number(iso[6]);
  const zone = iso[7];
  const offsetHour = zone === "Z" ? 0 : Number(zone.slice(1, 3));
  const offsetMinute = zone === "Z" ? 0 : Number(zone.slice(4, 6));
  const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  const parsed = Date.parse(trimmed);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59 || !Number.isFinite(parsed)) throw new Error(`Invalid at value "${at}". Use a valid ISO timestamp.`);
  if (parsed <= now) throw new Error(`Scheduled time ${new Date(parsed).toISOString()} is in the past.`);
  return parsed;
}
function parseScheduleInterval(every) {
  const match = every.trim().match(/^(\d+)(m|h|d|w)$/);
  if (!match) throw new Error(`Invalid every value "${every}". This first recurring slice supports fixed intervals such as "30m", "6h", "2d", or "2w".`);
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error(`Invalid every value "${every}". Interval must be positive.`);
  const unitMs = { m: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[match[2]];
  const result5 = amount * unitMs;
  if (!Number.isSafeInteger(result5)) throw new Error(`Invalid every value "${every}". Interval is too large.`);
  return result5;
}
function timestamp(value) {
  return new Date(value).toISOString();
}
function validateScheduleId(id) {
  if (!SCHEDULE_ID.test(id)) throw new Error("Schedule id must be 1-64 characters and contain only letters, numbers, '.', '_', or '-'.");
  return id;
}
function normalizedComparisonPath(value) {
  const absolute = path4.resolve(value);
  if (process.platform !== "win32") return absolute;
  let normalized = absolute;
  try {
    normalized = fs5.realpathSync.native(absolute);
  } catch {
  }
  normalized = normalized.replaceAll("/", "\\");
  if (normalized.startsWith("\\\\?\\UNC\\")) normalized = `\\\\${normalized.slice(8)}`;
  else if (normalized.startsWith("\\\\?\\")) normalized = normalized.slice(4);
  normalized = path4.win32.normalize(normalized).toLowerCase();
  if (normalized.length > 3) normalized = normalized.replace(/[\\]+$/, "");
  return normalized;
}
function pathWithin(root, candidate) {
  const relative2 = path4.relative(normalizedComparisonPath(root), normalizedComparisonPath(candidate));
  return relative2 === "" || relative2 !== ".." && !relative2.startsWith(`..${path4.sep}`) && !path4.isAbsolute(relative2);
}
function resolveGitCommonDirForCheckout(checkoutRoot) {
  const gitPath = path4.join(checkoutRoot, ".git");
  try {
    const stat = fs5.statSync(gitPath);
    if (stat.isDirectory()) return fs5.realpathSync.native(gitPath);
    if (!stat.isFile()) return void 0;
    const match = /^gitdir:[ \t]*([^\r\n]+)$/i.exec(fs5.readFileSync(gitPath, "utf-8").trim());
    return match?.[1] ? fs5.realpathSync.native(path4.resolve(checkoutRoot, match[1])) : void 0;
  } catch {
    return void 0;
  }
}
function samePath(left, right) {
  return normalizedComparisonPath(left) === normalizedComparisonPath(right);
}
function resolveTrustedGitConfigRoot(checkoutRoot, commonDir) {
  const resolvedCommonDir = resolveGitCommonDirForCheckout(checkoutRoot);
  if (!resolvedCommonDir || !samePath(resolvedCommonDir, commonDir)) return void 0;
  const configRoot = path4.join(checkoutRoot, getConfigDirName());
  try {
    const resolved = fs5.realpathSync.native(configRoot);
    return fs5.statSync(resolved).isDirectory() && pathWithin(checkoutRoot, resolved) ? resolved : void 0;
  } catch {
    return void 0;
  }
}
function registeredGitWorktreeRoots(projectCwd) {
  const result5 = spawnSync("git", ["-C", projectCwd, "worktree", "list", "--porcelain"], { encoding: "utf-8", windowsHide: true });
  if (result5.status !== 0 || typeof result5.stdout !== "string") return [];
  const roots = [];
  for (const line of result5.stdout.split(/\r?\n/)) {
    if (!line.startsWith("worktree ")) continue;
    try {
      roots.push(fs5.realpathSync.native(line.slice("worktree ".length).trim()));
    } catch {
    }
  }
  return roots;
}
function resolveSharedGitConfigRoot(projectCwd) {
  const repository = resolveGitRepositoryIdentity(projectCwd);
  if (!repository) return void 0;
  let projectConfigRoot;
  try {
    projectConfigRoot = fs5.realpathSync.native(path4.join(projectCwd, getConfigDirName()));
  } catch {
    return void 0;
  }
  for (const checkoutRoot of new Set(registeredGitWorktreeRoots(projectCwd))) {
    const resolved = resolveTrustedGitConfigRoot(checkoutRoot, repository.commonDir);
    if (resolved && samePath(resolved, projectConfigRoot)) return resolved;
  }
  return void 0;
}
function resolveHomeConfigRoot(projectPath) {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  try {
    if (!samePath(fs5.realpathSync.native(home), projectPath)) return void 0;
    return fs5.realpathSync.native(path4.join(home, getConfigDirName()));
  } catch {
    return void 0;
  }
}
function assertScheduleRoot(root, projectCwd, create) {
  if (!projectCwd) {
    if (create) fs5.mkdirSync(root, { recursive: true, mode: 448 });
    return;
  }
  let projectPath;
  try {
    projectPath = fs5.realpathSync.native(projectCwd);
  } catch (error2) {
    if (!create && error2.code === "ENOENT") return;
    throw error2;
  }
  let existing = root;
  while (!fs5.existsSync(existing)) {
    const parent = path4.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const existingPath = fs5.realpathSync.native(existing);
  const withinProject = pathWithin(projectPath, existingPath);
  const sharedGitConfigRoot = withinProject ? void 0 : resolveSharedGitConfigRoot(projectCwd);
  const homeConfigRoot = withinProject ? void 0 : resolveHomeConfigRoot(projectPath);
  const isTrustedPath = (candidate) => pathWithin(projectPath, candidate) || sharedGitConfigRoot !== void 0 && pathWithin(sharedGitConfigRoot, candidate) || homeConfigRoot !== void 0 && pathWithin(homeConfigRoot, candidate);
  if (!isTrustedPath(existingPath)) throw new Error(`Project schedule root '${root}' resolves outside the real project.`);
  if (!create) return;
  fs5.mkdirSync(root, { recursive: true, mode: 448 });
  if (!isTrustedPath(fs5.realpathSync.native(root))) throw new Error(`Project schedule root '${root}' resolves outside the real project.`);
}
function scheduleDir(root, id, create = false, projectCwd) {
  assertScheduleRoot(root, projectCwd, create);
  const dir = path4.join(root, validateScheduleId(id));
  try {
    const stat = fs5.lstatSync(dir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Schedule path '${dir}' must be a real directory.`);
  } catch (error2) {
    if (error2.code !== "ENOENT") throw error2;
    if (!create) return dir;
    fs5.mkdirSync(dir, { mode: 448 });
  }
  const rootPath = fs5.realpathSync.native(root);
  const dirPath = fs5.realpathSync.native(dir);
  if (!samePath(dirPath, path4.join(rootPath, id))) throw new Error(`Schedule path '${dir}' escapes the project schedule root.`);
  return dir;
}
function readJson(file, label) {
  try {
    return JSON.parse(fs5.readFileSync(file, "utf-8"));
  } catch (error2) {
    throw new Error(`Failed to read ${label} '${file}': ${error2 instanceof Error ? error2.message : String(error2)}`, { cause: error2 instanceof Error ? error2 : void 0 });
  }
}
function parseScheduleTarget(value, file) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Schedule record '${file}' has invalid trigger or target.`);
  const target = value;
  if (typeof target.workflowScript === "string" && target.workflowScript.trim()) {
    let baseRef;
    let missionId;
    try {
      baseRef = normalizeWorktreeBaseRef(target.baseRef);
    } catch (error2) {
      throw new Error(`Schedule record '${file}' has an invalid baseRef: ${error2 instanceof Error ? error2.message : String(error2)}`);
    }
    try {
      missionId = target.missionId === void 0 ? void 0 : validateMissionId(target.missionId);
    } catch (error2) {
      throw new Error(`Schedule record '${file}' has an invalid missionId: ${error2 instanceof Error ? error2.message : String(error2)}`);
    }
    const normalizedArgs = normalizeWorkflowArgs(target.args);
    if ("error" in normalizedArgs) throw new Error(`Schedule record '${file}' has invalid args: ${normalizedArgs.error}`);
    return { workflowScript: target.workflowScript.trim(), args: deepFreezeWorkflowArgs(normalizedArgs.args), ...baseRef === void 0 ? {} : { baseRef }, ...missionId === void 0 ? {} : { missionId } };
  }
  if (target.agent !== void 0 || target.task !== void 0) throw new Error(`Schedule record '${file}' uses a removed legacy agent target; recreate it with schedule.create and workflow: true or a workflow script path.`);
  throw new Error(`Schedule record '${file}' requires a workflowScript target.`);
}
function parseSchedule(value, file) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Schedule record '${file}' must be a JSON object.`);
  const record = value;
  if (record.schemaVersion !== 1 && record.schemaVersion !== 2 || typeof record.id !== "string" || typeof record.name !== "string" || typeof record.cwd !== "string" || typeof record.createdAt !== "string" || typeof record.updatedAt !== "string" || typeof record.paused !== "boolean") throw new Error(`Schedule record '${file}' has invalid required fields.`);
  validateScheduleId(record.id);
  if (!record.trigger || typeof record.trigger !== "object" || !record.target || typeof record.target !== "object") throw new Error(`Schedule record '${file}' has invalid trigger or target.`);
  if (record.overlap !== "skip" || record.catchUp !== "none" && record.catchUp !== "latest") throw new Error(`Schedule record '${file}' has unsupported policy fields.`);
  if (record.trigger.kind === "once") {
    if (typeof record.trigger.at !== "string" || record.trigger.nextRunAt !== void 0 && typeof record.trigger.nextRunAt !== "string") throw new Error(`Schedule record '${file}' has an invalid one-shot trigger.`);
  } else if (record.trigger.kind === "interval") {
    if (typeof record.trigger.every !== "string" || typeof record.trigger.everyMs !== "number" || typeof record.trigger.anchorAt !== "string" || typeof record.trigger.nextRunAt !== "string") throw new Error(`Schedule record '${file}' has an invalid interval trigger.`);
  } else if (record.trigger.kind === "calendar") {
    restoreCalendarTrigger(record.trigger);
  } else throw new Error(`Schedule record '${file}' has an unsupported trigger.`);
  if (record.sessionOnly !== void 0 && typeof record.sessionOnly !== "boolean") throw new Error(`Schedule record '${file}' has invalid sessionOnly.`);
  if (record.quiet !== void 0 && typeof record.quiet !== "boolean") throw new Error(`Schedule record '${file}' has invalid quiet.`);
  if (record.sessionOnly === true && (typeof record.ownerSessionFile !== "string" || !record.ownerSessionFile.trim())) throw new Error(`Schedule record '${file}' is session-only but has no owner session file.`);
  const target = parseScheduleTarget(record.target, file);
  if (record.schemaVersion === 2 !== (target.missionId !== void 0)) throw new Error(`Schedule record '${file}' requires schemaVersion 2 exactly when missionId is present.`);
  return { ...record, target };
}
var ScheduleStore = class {
  root;
  projectCwd;
  constructor(root, projectCwd) {
    this.root = root;
    this.projectCwd = projectCwd;
  }
  directory(id, create = false) {
    return scheduleDir(this.root, id, create, this.projectCwd);
  }
  ids() {
    assertScheduleRoot(this.root, this.projectCwd, false);
    if (!fs5.existsSync(this.root)) return [];
    return fs5.readdirSync(this.root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && SCHEDULE_ID.test(entry.name)).map((entry) => entry.name);
  }
  list() {
    return this.ids().map((id) => this.find(id)).filter((record) => record !== void 0);
  }
  get(id) {
    const record = this.find(id);
    if (!record) throw new Error(`Schedule '${id}' not found.`);
    return record;
  }
  /** Like {@link get}, but returns undefined when the schedule no longer exists. */
  find(id) {
    const file = path4.join(scheduleDir(this.root, id, false, this.projectCwd), "schedule.json");
    if (!fs5.existsSync(file)) return void 0;
    return parseSchedule(readJson(file, "schedule record"), file);
  }
  write(record) {
    writePrivateAtomicJson(path4.join(scheduleDir(this.root, record.id, true, this.projectCwd), "schedule.json"), record);
  }
  delete(id) {
    fs5.rmSync(scheduleDir(this.root, id, false, this.projectCwd), { recursive: true, force: true });
  }
  history(id) {
    const file = path4.join(scheduleDir(this.root, id, false, this.projectCwd), "history.json");
    if (!fs5.existsSync(file)) return [];
    const value = readJson(file, "schedule history");
    if (value?.schemaVersion !== 1 || !Array.isArray(value.runs)) throw new Error(`Schedule history '${file}' has invalid fields.`);
    return value.runs;
  }
  /** The run's own receipt; it is written before history.json and is never trimmed. */
  getRun(id, runId) {
    if (!SCHEDULE_ID.test(runId)) throw new Error(`Invalid schedule run id '${runId}'.`);
    const file = path4.join(scheduleDir(this.root, id, false, this.projectCwd), "runs", `${runId}.json`);
    if (!fs5.existsSync(file)) return void 0;
    const run = readJson(file, "schedule run");
    if (run?.id !== runId || run.scheduleId !== id) throw new Error(`Schedule run '${file}' has invalid fields.`);
    return run;
  }
  writeRun(schedule, run, event) {
    const dir = scheduleDir(this.root, schedule.id, true, this.projectCwd);
    writePrivateAtomicJson(path4.join(dir, "runs", `${run.id}.json`), run);
    withFileLease(path4.join(dir, "history.json"), () => {
      const earlier = this.history(schedule.id).filter((item) => item.id !== run.id).map((item) => item.state === "running" ? this.getRun(schedule.id, item.id) ?? item : item);
      const runs = [run, ...earlier].slice(0, MAX_HISTORY);
      writePrivateAtomicJson(path4.join(dir, "history.json"), { schemaVersion: 1, runs });
      fs5.appendFileSync(path4.join(dir, "events.jsonl"), `${JSON.stringify({ schemaVersion: 1, timestamp: (/* @__PURE__ */ new Date()).toISOString(), event, scheduleId: schedule.id, runId: run.id, state: run.state })}
`, { encoding: "utf-8", mode: 384 });
    });
  }
  appendEvent(schedule, event) {
    const dir = scheduleDir(this.root, schedule.id, true, this.projectCwd);
    fs5.mkdirSync(dir, { recursive: true, mode: 448 });
    fs5.appendFileSync(path4.join(dir, "events.jsonl"), `${JSON.stringify({ schemaVersion: 1, timestamp: (/* @__PURE__ */ new Date()).toISOString(), event, scheduleId: schedule.id })}
`, { encoding: "utf-8", mode: 384 });
  }
};
function resolveMaxPending(config) {
  const value = config.scheduledRuns?.maxPending;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : DEFAULT_MAX_PENDING;
}
function hasPendingScheduleWork(schedule) {
  return schedule.activeRunId !== void 0 || schedule.trigger.nextRunAt !== void 0;
}
function nextAfter(trigger, plannedAt, now) {
  if (trigger.kind === "once") return { ...trigger, nextRunAt: void 0 };
  if (trigger.kind === "calendar") return {
    ...trigger,
    ...nextCalendarOccurrence(trigger, Math.max(plannedAt, now), calendarDateAfter(trigger, plannedAt, trigger.nextLocalDate))
  };
  const next = plannedAt + (Math.floor(Math.max(0, now - plannedAt) / trigger.everyMs) + 1) * trigger.everyMs;
  return { ...trigger, nextRunAt: timestamp(next) };
}
function nextRunAt(schedule) {
  const value = schedule.trigger.nextRunAt;
  if (!value) return void 0;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Schedule '${schedule.id}' has invalid nextRunAt.`);
  return parsed;
}
function duePlannedAt(schedule, now) {
  const next = nextRunAt(schedule);
  if (next === void 0 || next > now || schedule.catchUp !== "latest") return next;
  if (schedule.trigger.kind === "calendar") return Date.parse(latestCalendarOccurrence(schedule.trigger, now, schedule.trigger.nextLocalDate).nextRunAt);
  if (schedule.trigger.kind === "interval") return next + Math.floor((now - next) / schedule.trigger.everyMs) * schedule.trigger.everyMs;
  return next;
}
function triggerLabel(trigger) {
  if (trigger.kind === "calendar") return `every ${trigger.every}${trigger.on ? ` (${trigger.on.join(", ")})` : ""} at ${trigger.at} ${trigger.timezone}`;
  return trigger.kind === "once" ? `at ${trigger.at}` : `every ${trigger.every}`;
}
function textResult(text2, schedules, runs, isError = false) {
  const publicSchedules = schedules?.map(publicScheduleRecord);
  return {
    content: [{ type: "text", text: text2 }],
    ...isError ? { isError: true } : {},
    details: { mode: "management", results: [], schedules: { ...publicSchedules ? { records: publicSchedules } : {}, ...runs ? { runs } : {} } }
  };
}
function publicScheduleRecord(schedule) {
  const { ownerSessionFile: _ownerSessionFile, ...rest } = schedule;
  return rest;
}
function targetLabel(target) {
  const preview = previewSimpleWorkflowRun(target.workflowScript);
  return preview?.agent ? `workflow -> agent ${preview.agent}` : "workflow (dynamic)";
}
function sanitizeTarget(params) {
  if (params.tasks || params.chain) return { error: "Recurring schedules require a workflow script; legacy tasks and chain inputs are unsupported." };
  if (params.agent !== void 0 || params.task !== void 0) return { error: "schedule.create requires workflow: true or a workflow script path, e.g. a ```js workflow block containing return runs.run('main', { agent, task })." };
  if (typeof params.workflowScript !== "string" || !params.workflowScript.trim()) return { error: "schedule.create requires workflow: true or a workflow script path." };
  if (params.context === "fork") return { error: "Scheduled runs require fresh context." };
  if (params.async === false) return { error: "Scheduled runs are always async." };
  let baseRef;
  let missionId;
  try {
    baseRef = normalizeWorktreeBaseRef(params.baseRef);
    missionId = params.missionId === void 0 ? void 0 : validateMissionId(params.missionId);
  } catch (error2) {
    return { error: error2 instanceof Error ? error2.message : String(error2) };
  }
  const acceptanceErrors = validateExecutionAcceptance(params);
  if (acceptanceErrors.length) return { error: acceptanceErrors.join(" ") };
  const normalizedArgs = normalizeWorkflowArgs(params.args);
  if ("error" in normalizedArgs) return { error: normalizedArgs.error };
  return { target: { workflowScript: params.workflowScript.trim(), args: deepFreezeWorkflowArgs(normalizedArgs.args), ...baseRef === void 0 ? {} : { baseRef }, ...missionId === void 0 ? {} : { missionId } } };
}
function executionParams(schedule, quiet = false) {
  return {
    ...schedule.target,
    async: true,
    context: "fresh",
    cwd: schedule.cwd,
    ...schedule.target.missionId === void 0 ? { mission: false } : {},
    // Scheduled fires have no operator watching, so completions must name the origin.
    scheduleOrigin: { id: schedule.id, ...schedule.name ? { name: schedule.name } : {}, ...quiet ? { quiet: true } : {} },
    ...schedule.timeoutMs === void 0 ? {} : { timeoutMs: schedule.timeoutMs }
  };
}
function snapshotContext(ctx, cwd) {
  const source = ctx.sessionManager;
  const sessionId = source.getSessionId();
  const sessionFile = source.getSessionFile();
  const sessionManager = new Proxy(source, {
    get(target, property) {
      if (property === "getSessionId") return () => sessionId;
      if (property === "getSessionFile") return () => sessionFile;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return { ...ctx, cwd, sessionManager };
}
function normalizedSessionFile(value) {
  if (!value || !value.trim()) return void 0;
  const normalized = path4.normalize(path4.resolve(value));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
function scheduleBelongsToSession(schedule, ctx) {
  if (schedule.sessionOnly !== true) return true;
  const ownerSessionFile = normalizedSessionFile(schedule.ownerSessionFile);
  const currentSessionFile = normalizedSessionFile(ctx.sessionManager.getSessionFile());
  return ownerSessionFile !== void 0 && ownerSessionFile === currentSessionFile;
}
function listScheduledRunSummaries(cwd, root) {
  return new ScheduleStore(scheduledRunStorePath(cwd, void 0, root), root === void 0 ? path4.resolve(cwd) : void 0).list();
}
var ScheduledRunManager = class {
  store;
  stores = /* @__PURE__ */ new Map();
  contexts = /* @__PURE__ */ new Map();
  timers = /* @__PURE__ */ new Map();
  observedAsyncIds = /* @__PURE__ */ new Set();
  now;
  randomId;
  timersApi;
  deps;
  constructor(deps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.randomId = deps.randomId ?? (() => randomUUID2().slice(0, 8));
    this.timersApi = deps.timers ?? globalThis;
  }
  bindSession(ctx) {
    if (!scheduledRunsEnabled(this.deps.config)) return;
    this.selectProject(ctx.cwd, ctx);
  }
  stop() {
    this.stopTimers();
    this.store = void 0;
    this.stores.clear();
    this.contexts.clear();
    this.observedAsyncIds.clear();
  }
  async handleToolCall(params, ctx) {
    try {
      if (!scheduledRunsEnabled(this.deps.config)) return textResult("Scheduled runs are disabled by scheduledRuns.enabled=false.", void 0, void 0, true);
      this.selectProject(params.cwd ?? ctx.cwd, ctx);
      switch (params.action) {
        case "schedule.create":
          return this.create(params, ctx);
        case "schedule.list":
          return this.list();
        case "schedule.show":
          return this.show(params);
        case "schedule.history":
          return this.history(params);
        case "schedule.pause":
          return this.pause(params, true);
        case "schedule.resume":
          return this.pause(params, false);
        case "schedule.run":
          return await this.runManual(params);
        case "schedule.run-due":
          return await this.runDue();
        case "schedule.delete":
          return this.remove(params);
        default:
          return textResult(`Unknown schedule action: ${params.action}`, void 0, void 0, true);
      }
    } catch (error2) {
      return textResult(error2 instanceof Error ? error2.message : String(error2), void 0, void 0, true);
    }
  }
  observedCompletionRunIds() {
    return new Set(this.observedAsyncIds);
  }
  referencedAsyncRunIds() {
    const runIds = new Set(this.observedAsyncIds);
    for (const store of this.stores.values()) {
      for (const scheduleId of store.ids()) {
        for (const run of store.history(scheduleId)) {
          if (run.asyncId) runIds.add(run.asyncId);
        }
      }
    }
    return runIds;
  }
  handleAsyncCompletion(payload) {
    if (!payload || typeof payload !== "object") return;
    const data = payload;
    const asyncId = typeof data.runId === "string" ? data.runId : typeof data.id === "string" ? data.id : void 0;
    if (!asyncId) return;
    for (const store of this.stores.values()) {
      let ids;
      try {
        ids = store.ids();
      } catch (error2) {
        console.error(`Failed to inspect schedule store '${store.root}' during async completion:`, error2);
        continue;
      }
      for (const id of ids) {
        try {
          const schedule = store.get(id);
          const listed = store.history(id).find((item) => item.asyncId === asyncId) ?? this.activeRun(store, schedule);
          const run = listed && (store.getRun(id, listed.id) ?? listed);
          if (run?.asyncId !== asyncId || run.state !== "running") continue;
          this.finishRun(store, schedule, run, data.success === true, typeof data.summary === "string" ? data.summary : void 0);
          return;
        } catch (error2) {
          console.error(`Failed to inspect schedule '${id}' in '${store.root}' during async completion:`, error2);
        }
      }
    }
  }
  create(params, ctx) {
    const store = this.requireStore();
    const target = sanitizeTarget(params);
    if (target.error) return textResult(target.error, void 0, void 0, true);
    const at = params.at?.trim();
    const every = params.every?.trim();
    const calendar = every === "day" || every === "week";
    if (!calendar && Boolean(at) === Boolean(every)) return textResult("schedule.create requires exactly one trigger: at or every.", void 0, void 0, true);
    if (params.overlap !== void 0 && params.overlap !== "skip") return textResult("This first recurring slice supports overlap='skip' only.", void 0, void 0, true);
    if (params.catchUp !== void 0 && params.catchUp !== "none" && params.catchUp !== "latest") return textResult("catchUp must be 'none' or 'latest'.", void 0, void 0, true);
    if (params.mission !== void 0 || params.missionUpdate !== void 0 || params.missionStatus !== void 0 || params.missionScope !== void 0) return textResult("Schedules accept only an existing missionId; mission creation and updates are unsupported.", void 0, void 0, true);
    if (!calendar && (params.on !== void 0 || params.timezone !== void 0)) return textResult("on and timezone require every:'day' or every:'week'.", void 0, void 0, true);
    if (params.quiet !== void 0 && typeof params.quiet !== "boolean") return textResult("quiet must be a boolean.", void 0, void 0, true);
    if (!calendar && at && params.quiet === true) return textResult("quiet is only supported for recurring schedules.", void 0, void 0, true);
    const sessionOnly = params.sessionOnly === true;
    if (sessionOnly && params.cwd !== void 0 && !samePath(params.cwd, ctx.cwd)) return textResult("sessionOnly schedules cannot use an explicit cross-project cwd.", void 0, void 0, true);
    const ownerSessionFile = sessionOnly ? ctx.sessionManager.getSessionFile() : void 0;
    if (sessionOnly && !ownerSessionFile) return textResult("sessionOnly schedules require a persisted current session.", void 0, void 0, true);
    if (target.target.missionId !== void 0) {
      readMission(resolveMissionStoreLocation({ projectRoot: path4.resolve(params.cwd ?? ctx.cwd), ...this.deps.config.missions ? { config: this.deps.config.missions } : {} }), target.target.missionId);
    }
    const sessionId = ctx.sessionManager.getSessionId() ?? "unknown";
    if (this.deps.resolveCapabilityCeiling?.(sessionId)) return textResult("Cannot persist a schedule while a capability ceiling is active.", void 0, void 0, true);
    const pendingCount = store.list().filter(hasPendingScheduleWork).length;
    const maxPending = resolveMaxPending(this.deps.config);
    if (pendingCount >= maxPending) return textResult(`Schedule limit reached (${maxPending}).`, void 0, void 0, true);
    const id = validateScheduleId(params.id?.trim() || this.randomId());
    if (store.ids().includes(id)) return textResult(`Schedule '${id}' already exists.`, void 0, void 0, true);
    const now = this.now();
    let trigger;
    if (calendar) {
      const rule = normalizeCalendarRule({ every, at, on: params.on, timezone: params.timezone });
      trigger = { kind: "calendar", ...rule, ...nextCalendarOccurrence(rule, now) };
    } else if (at) {
      const planned = parseScheduledRunTime(at, now);
      trigger = { kind: "once", at, nextRunAt: timestamp(planned) };
    } else {
      const everyMs = parseScheduleInterval(every);
      trigger = { kind: "interval", every, everyMs, anchorAt: timestamp(now), nextRunAt: timestamp(now + everyMs) };
    }
    const schedule = {
      // Older readers ignore unknown target fields; they must reject mission-bound definitions.
      schemaVersion: target.target.missionId === void 0 ? 1 : 2,
      id,
      name: params.name?.trim() || targetLabel(target.target),
      cwd: path4.resolve(params.cwd ?? ctx.cwd),
      trigger,
      target: target.target,
      overlap: "skip",
      catchUp: params.catchUp ?? "latest",
      ...params.timeoutMs === void 0 ? {} : { timeoutMs: params.timeoutMs },
      paused: false,
      ...sessionOnly ? { sessionOnly: true, ownerSessionFile: path4.resolve(ownerSessionFile) } : {},
      ...trigger.kind !== "once" && params.quiet === true ? { quiet: true } : {},
      createdAt: timestamp(now),
      updatedAt: timestamp(now)
    };
    store.write(schedule);
    store.appendEvent(schedule, "schedule.created");
    this.arm(schedule, store);
    return textResult(`Created schedule ${id}.
Name: ${schedule.name}
Trigger: ${triggerLabel(trigger)}
Session only: ${schedule.sessionOnly === true ? "yes" : "no"}
Quiet: ${schedule.quiet === true ? "yes" : "no"}
Next: ${schedule.trigger.nextRunAt}
Target: ${targetLabel(schedule.target)}${schedule.target.missionId === void 0 ? "" : `
Mission: ${schedule.target.missionId}`}`, [schedule]);
  }
  list() {
    const schedules = this.requireStore().list().sort((a, b) => (a.trigger.nextRunAt ?? "").localeCompare(b.trigger.nextRunAt ?? ""));
    if (!schedules.length) return textResult("No project schedules.", []);
    return textResult([`Project schedules: ${schedules.length}`, ...schedules.map((item) => `- ${item.id} | ${item.paused ? "paused" : item.activeRunId ? "running" : "scheduled"} | ${item.trigger.nextRunAt ?? "no next run"} | ${item.sessionOnly === true ? "session-only" : "project"} | ${item.name}${item.target.missionId === void 0 ? "" : ` | mission ${item.target.missionId}`}`)].join("\n"), schedules);
  }
  show(params) {
    const schedule = this.resolve(params);
    return textResult([`Schedule: ${schedule.id}`, `Name: ${schedule.name}`, `State: ${schedule.paused ? "paused" : schedule.activeRunId ? "running" : "scheduled"}`, `Session only: ${schedule.sessionOnly === true ? "yes" : "no"}`, `Quiet: ${schedule.quiet === true ? "yes" : "no"}`, `Target: ${targetLabel(schedule.target)}`, schedule.target.missionId === void 0 ? void 0 : `Mission: ${schedule.target.missionId}`, `CWD: ${shortenPath(schedule.cwd)}`, `Trigger: ${triggerLabel(schedule.trigger)}`, `Next: ${schedule.trigger.nextRunAt ?? "none"}`, `Catch up: ${schedule.catchUp}`, schedule.activeRunId ? `Active run: ${schedule.activeRunId}` : void 0].filter(Boolean).join("\n"), [schedule]);
  }
  history(params) {
    const schedule = this.resolve(params);
    const runs = this.requireStore().history(schedule.id);
    return textResult(runs.length ? [`Schedule history: ${schedule.id}`, ...runs.map((run) => `- ${run.id} | ${run.state} | ${run.plannedAt}${run.asyncId ? ` | async ${run.asyncId}` : ""}`)].join("\n") : `No runs recorded for schedule ${schedule.id}.`, [schedule], runs);
  }
  pause(params, paused) {
    const schedule = this.resolve(params);
    if (schedule.paused === paused) return textResult(`Schedule ${schedule.id} is already ${paused ? "paused" : "active"}.`, [schedule]);
    schedule.paused = paused;
    schedule.updatedAt = timestamp(this.now());
    this.requireStore().write(schedule);
    this.requireStore().appendEvent(schedule, paused ? "schedule.paused" : "schedule.resumed");
    const store = this.requireStore();
    if (paused) this.clearTimer(store, schedule.id);
    else this.restoreOne(store, schedule);
    return textResult(`${paused ? "Paused" : "Resumed"} schedule ${schedule.id}.`, [schedule]);
  }
  async runManual(params) {
    const store = this.requireStore();
    const schedule = this.resolve(params);
    const context = this.requireContext(store);
    if (!scheduleBelongsToSession(schedule, context)) {
      return textResult(`Skipped schedule ${schedule.id}: current session is not its owner.`, [schedule]);
    }
    if (params.quiet !== void 0 && typeof params.quiet !== "boolean") return textResult("quiet must be a boolean.", void 0, void 0, true);
    const manualTrigger = schedule.trigger;
    const run = await this.launch(store, schedule, this.now(), "manual", false, params.quiet === true);
    const updated = store.get(schedule.id);
    if (run.state === "running") {
      const now = this.now();
      if (updated.trigger.kind === "calendar") {
        if (manualTrigger.kind !== "calendar") throw new Error("Schedule trigger changed during manual launch.");
        const consumed = latestCalendarOccurrence(manualTrigger, now, manualTrigger.nextLocalDate)?.nextRunAt ?? manualTrigger.nextRunAt;
        const advanced = nextAfter(manualTrigger, Date.parse(consumed), now);
        if (advanced.nextLocalDate > updated.trigger.nextLocalDate) updated.trigger = advanced;
      } else if (updated.trigger.kind === "interval") updated.trigger.nextRunAt = timestamp(now + updated.trigger.everyMs);
      else updated.trigger.nextRunAt = void 0;
      updated.updatedAt = timestamp(now);
      store.write(updated);
      store.appendEvent(updated, "schedule.manual_satisfied");
      this.arm(updated, store);
    }
    return textResult(`Manual schedule run ${run.id}: ${run.state}${run.asyncId ? ` (async ${run.asyncId})` : ""}.`, [store.get(schedule.id)], [run], run.state === "failed_launch");
  }
  async runDue() {
    const store = this.requireStore();
    const context = this.requireContext(store);
    const due = store.list().filter((schedule) => scheduleBelongsToSession(schedule, context) && !schedule.paused && nextRunAt(schedule) !== void 0 && nextRunAt(schedule) <= this.now());
    const runs = [];
    for (const schedule of due) {
      const planned = duePlannedAt(schedule, this.now());
      if (!schedule.activeRunId && schedule.catchUp === "none" && planned < this.now()) runs.push(this.recordMissed(store, schedule, planned, "run-due"));
      else runs.push(await this.launch(store, schedule, planned, "run-due", true));
    }
    return textResult(runs.length ? `Processed ${runs.length} due schedule(s).` : "No schedules are due.", store.list(), runs);
  }
  remove(params) {
    const schedule = this.resolve(params);
    const store = this.requireStore();
    if (schedule.activeRunId) {
      const run = this.activeRun(store, schedule);
      let terminal = false;
      if (run?.scheduleId === schedule.id && run.state === "running" && run.asyncId && run.asyncDir) {
        const status = readJson(path4.join(run.asyncDir, "status.json"), "async status");
        terminal = status.runId === run.asyncId && typeof status.state === "string" && ["complete", "failed", "stopped", "rejected"].includes(status.state);
      }
      if (!terminal) return textResult(`Schedule ${schedule.id} has active run ${schedule.activeRunId}; stop that run before deleting the schedule.`, [schedule], void 0, true);
    }
    this.clearTimer(store, schedule.id);
    store.appendEvent(schedule, "schedule.deleted");
    store.delete(schedule.id);
    return textResult(`Deleted schedule ${schedule.id}.`);
  }
  restore(store) {
    for (const schedule of store.list()) this.restoreOne(store, schedule);
  }
  restoreOne(store, schedule, notBefore, rearm = true) {
    if (!scheduleBelongsToSession(schedule, this.requireContext(store))) return;
    if (schedule.trigger.kind === "calendar") {
      const refreshed = restoreCalendarTrigger(schedule.trigger);
      if (JSON.stringify(refreshed) !== JSON.stringify(schedule.trigger)) {
        schedule.trigger = refreshed;
        schedule.updatedAt = timestamp(this.now());
        store.write(schedule);
      }
    }
    if (schedule.activeRunId) {
      const run = this.activeRun(store, schedule);
      if (run?.state === "running" && run.asyncId) this.observedAsyncIds.add(run.asyncId);
      const startedAt = run?.startedAt ? Date.parse(run.startedAt) : Number.NaN;
      const outcome = this.terminalAsyncOutcome(run);
      if (run && outcome) {
        let latest;
        try {
          latest = this.finishRun(store, schedule, run, outcome.success, outcome.error, true) ?? store.find(schedule.id);
        } catch (error2) {
          if (rearm) {
            try {
              const current = store.find(schedule.id);
              if (current) this.arm(current, store, notBefore);
            } catch {
            }
          }
          throw error2;
        }
        if (!latest) {
          this.clearTimer(store, schedule.id);
          return;
        }
        schedule = latest;
      }
      if (schedule.activeRunId && (!run || run.state !== "running" || !run.asyncId && Number.isFinite(startedAt) && startedAt + STALE_LAUNCH_CLAIM_MS <= this.now())) {
        if (run?.state === "running") {
          run.state = "failed_launch";
          run.completedAt = timestamp(this.now());
          run.error = "Recovered a stale launch claim before an async run was attached.";
          store.writeRun(schedule, run, "schedule.run.failed");
        }
        schedule.activeRunId = void 0;
        schedule.updatedAt = timestamp(this.now());
        store.write(schedule);
        fs5.rmSync(path4.join(store.directory(schedule.id), "active.lock"), { force: true });
      }
    }
    if (!rearm || schedule.paused) return;
    const next = nextRunAt(schedule);
    if (next === void 0) return;
    if (!schedule.activeRunId && next < this.now() && schedule.catchUp === "none") {
      try {
        this.recordMissed(store, schedule, next, "timer");
      } catch (error2) {
        if (notBefore !== void 0) this.arm(schedule, store, notBefore);
        throw error2;
      }
    }
    this.arm(schedule, store, notBefore);
  }
  arm(schedule, store, notBefore) {
    this.clearTimer(store, schedule.id);
    if (schedule.paused) return;
    const next = nextRunAt(schedule);
    if (next === void 0) return;
    const timer = this.timersApi.setTimeout(() => {
      void this.fire(store, schedule.id).catch((error2) => {
        console.warn(`[pi-subagents] Scheduled run '${schedule.id}' failed to fire: ${error2 instanceof Error ? error2.message : String(error2)}`);
        this.restoreAfterFireError(store, schedule.id);
      });
    }, Math.min(Math.max(0, next - this.now(), (notBefore ?? 0) - this.now()), MAX_TIMER_DELAY_MS2));
    timer.unref?.();
    this.timers.set(this.timerKey(store, schedule.id), timer);
  }
  restoreAfterFireError(store, id) {
    try {
      const schedule = store.find(id);
      if (!schedule) return;
      const now = this.now();
      const planned = schedule.trigger.kind !== "once" ? duePlannedAt(schedule, now) : void 0;
      const notBefore = planned !== void 0 && planned <= now ? Date.parse(nextAfter(schedule.trigger, planned, now).nextRunAt) : void 0;
      this.restoreOne(store, schedule, notBefore, schedule.trigger.kind !== "once");
    } catch (error2) {
      console.warn(`[pi-subagents] Scheduled run '${id}' could not be restored after fire failure: ${error2 instanceof Error ? error2.message : String(error2)}`);
    }
  }
  async fire(store, id) {
    this.clearTimer(store, id);
    const schedule = store.find(id);
    if (!schedule) return;
    if (!scheduleBelongsToSession(schedule, this.requireContext(store))) return;
    const planned = duePlannedAt(schedule, this.now());
    if (planned === void 0 || schedule.paused) return;
    if (planned > this.now()) return this.arm(schedule, store);
    await this.launch(store, schedule, planned, "timer", true);
  }
  async launch(store, schedule, planned, dueReason, advance, quiet) {
    const now = this.now();
    const nextRunAtBeforeClaim = schedule.trigger.nextRunAt;
    const nextLocalDateBeforeClaim = schedule.trigger.kind === "calendar" ? schedule.trigger.nextLocalDate : void 0;
    const run = { schemaVersion: 1, id: this.randomId(), scheduleId: schedule.id, plannedAt: timestamp(planned), dueReason, state: "running", startedAt: timestamp(now) };
    if (schedule.activeRunId) {
      let active2;
      let outcome;
      try {
        active2 = this.activeRun(store, schedule);
        outcome = this.terminalAsyncOutcome(active2);
      } catch (error2) {
        console.warn(`[pi-subagents] Could not reconcile active run '${schedule.activeRunId}' of schedule '${schedule.id}': ${error2 instanceof Error ? error2.message : String(error2)}`);
      }
      if (active2 && outcome) {
        const released = this.finishRun(store, schedule, active2, outcome.success, outcome.error, true);
        if (!released) return this.skipLostClaim(store, schedule.id, run, planned, now);
        schedule = released;
      }
    }
    if (schedule.activeRunId) {
      run.state = "skipped";
      run.completedAt = timestamp(now);
      if (advance) {
        schedule.trigger = nextAfter(schedule.trigger, planned, now);
        schedule.updatedAt = timestamp(now);
        store.write(schedule);
      }
      store.writeRun(schedule, run, "schedule.skipped_overlap");
      this.arm(schedule, store);
      return run;
    }
    const lockPath = path4.join(store.directory(schedule.id, true), "active.lock");
    fs5.mkdirSync(path4.dirname(lockPath), { recursive: true, mode: 448 });
    let lock;
    try {
      lock = fs5.openSync(lockPath, "wx", 384);
      fs5.writeFileSync(lock, run.id, "utf-8");
      fs5.closeSync(lock);
    } catch (error2) {
      if (lock !== void 0) {
        try {
          const owned = fs5.fstatSync(lock, { bigint: true });
          const current = fs5.lstatSync(lockPath, { bigint: true });
          if (owned.ino !== 0n && owned.dev === current.dev && owned.ino === current.ino) fs5.rmSync(lockPath);
        } catch {
        }
        try {
          fs5.closeSync(lock);
        } catch {
        }
        throw error2;
      }
      if (error2.code !== "EEXIST") throw error2;
      return this.skipLostClaim(store, schedule.id, run, planned, now);
    }
    schedule.activeRunId = run.id;
    schedule.lastRunId = run.id;
    if (advance) schedule.trigger = nextAfter(schedule.trigger, planned, now);
    schedule.updatedAt = timestamp(now);
    try {
      store.write(schedule);
      store.writeRun(schedule, run, "schedule.run.started");
    } catch (error2) {
      try {
        const latest = store.find(schedule.id);
        if (latest?.activeRunId === run.id) {
          latest.activeRunId = void 0;
          latest.updatedAt = timestamp(this.now());
          store.write(latest);
        }
        if (fs5.readFileSync(lockPath, "utf-8") === run.id) fs5.rmSync(lockPath);
      } catch (cleanupError) {
        console.warn(`[pi-subagents] Could not release schedule claim '${run.id}': ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
      }
      throw error2;
    }
    try {
      const result5 = await this.deps.launch(executionParams(schedule, dueReason === "manual" ? quiet === true : schedule.quiet === true), this.requireContext(store), new AbortController().signal);
      const asyncId = result5.details?.asyncId ?? result5.details?.runId;
      if (result5.isError || !asyncId) throw new Error(result5.content.find((item) => item.type === "text")?.text ?? "Scheduled launch failed.");
      run.asyncId = asyncId;
      run.asyncDir = result5.details?.asyncDir;
      this.observedAsyncIds.add(asyncId);
      store.writeRun(schedule, run, "schedule.run.attached_async");
      this.arm(schedule, store);
      return run;
    } catch (error2) {
      if (run.asyncId) throw new Error(`Scheduled run '${run.id}' attached to async run '${run.asyncId}', but recording it failed: ${error2 instanceof Error ? error2.message : String(error2)}`, { cause: error2 });
      run.state = "failed_launch";
      run.completedAt = timestamp(this.now());
      run.error = error2 instanceof Error ? error2.message : String(error2);
      const latest = store.get(schedule.id);
      latest.activeRunId = void 0;
      if (!advance && nextRunAtBeforeClaim) {
        if (latest.trigger.kind === "calendar") {
          if (nextLocalDateBeforeClaim !== void 0) {
            latest.trigger.nextLocalDate = nextLocalDateBeforeClaim;
            latest.trigger.nextRunAt = nextRunAtBeforeClaim;
          }
        } else latest.trigger.nextRunAt = nextRunAtBeforeClaim;
      }
      latest.updatedAt = timestamp(this.now());
      store.write(latest);
      fs5.rmSync(lockPath, { force: true });
      try {
        store.writeRun(latest, run, "schedule.run.failed");
      } finally {
        this.arm(latest, store);
      }
      return run;
    }
  }
  /**
   * `releaseOnly` releases a dead run's claim and leaves the pending occurrence to the caller: it neither skips nor re-arms it.
   * It acts only while the schedule on disk still names that run, and returns the record it wrote, or undefined when another
   * session already released or re-claimed it.
   */
  finishRun(store, schedule, run, success, error2, releaseOnly = false) {
    const now = this.now();
    if (run.asyncId) this.observedAsyncIds.delete(run.asyncId);
    if (releaseOnly) {
      const latest = store.find(schedule.id);
      if (latest?.activeRunId !== run.id) return void 0;
      schedule = latest;
    }
    const next = nextRunAt(schedule);
    let skipped;
    if (!releaseOnly && next !== void 0 && next <= now) {
      const planned = duePlannedAt(schedule, now);
      skipped = {
        schemaVersion: 1,
        id: this.randomId(),
        scheduleId: schedule.id,
        plannedAt: timestamp(planned),
        dueReason: "timer",
        state: "skipped",
        completedAt: timestamp(now)
      };
      schedule.trigger = nextAfter(schedule.trigger, planned, now);
    }
    run.state = success ? "completed" : "failed_run";
    run.completedAt = timestamp(now);
    if (!success && error2) run.error = error2;
    schedule.activeRunId = void 0;
    schedule.updatedAt = timestamp(now);
    store.write(schedule);
    const lockPath = path4.join(store.directory(schedule.id), "active.lock");
    let holder;
    if (releaseOnly) try {
      holder = fs5.readFileSync(lockPath, "utf-8");
    } catch {
    }
    if (!releaseOnly || holder === run.id) fs5.rmSync(lockPath, { force: true });
    try {
      store.writeRun(schedule, run, success ? "schedule.run.completed" : "schedule.run.failed");
      if (skipped) store.writeRun(schedule, skipped, "schedule.skipped_overlap");
    } finally {
      if (!releaseOnly) this.arm(schedule, store);
    }
    return schedule;
  }
  skipLostClaim(store, scheduleId, run, planned, now) {
    run.state = "skipped";
    run.completedAt = timestamp(now);
    const latest = store.find(scheduleId);
    if (!latest) {
      this.clearTimer(store, scheduleId);
      return run;
    }
    store.writeRun(latest, run, "schedule.skipped_overlap");
    if (latest.trigger.kind === "once") {
      this.clearTimer(store, latest.id);
    } else {
      const next = nextRunAt(latest);
      const notBefore = next !== void 0 && next <= now ? Date.parse(nextAfter(latest.trigger, duePlannedAt(latest, now) ?? planned, now).nextRunAt) : void 0;
      this.arm(latest, store, notBefore);
    }
    return run;
  }
  recordMissed(store, schedule, planned, dueReason) {
    const run = {
      schemaVersion: 1,
      id: this.randomId(),
      scheduleId: schedule.id,
      plannedAt: timestamp(planned),
      dueReason,
      state: "missed",
      completedAt: timestamp(this.now())
    };
    schedule.trigger = nextAfter(schedule.trigger, planned, this.now());
    schedule.updatedAt = timestamp(this.now());
    store.write(schedule);
    store.writeRun(schedule, run, "schedule.missed");
    return run;
  }
  selectProject(cwd, ctx) {
    const projectCwd = path4.resolve(cwd);
    const root = scheduledRunStorePath(projectCwd, void 0, this.deps.storeRoot);
    const isBoundContext = path4.resolve(ctx.cwd) === projectCwd;
    const previousContext = this.contexts.get(root);
    const contextChanged = isBoundContext && previousContext !== void 0 && normalizedSessionFile(previousContext.sessionManager.getSessionFile()) !== normalizedSessionFile(ctx.sessionManager.getSessionFile());
    if (isBoundContext) this.contexts.set(root, snapshotContext(ctx, projectCwd));
    else if (!this.contexts.has(root)) throw new Error(`Cannot use project '${projectCwd}' until that project has been opened in this runtime.`);
    let store = this.stores.get(root);
    if (!store) {
      store = new ScheduleStore(root, this.deps.storeRoot === void 0 ? projectCwd : void 0);
      this.stores.set(root, store);
      this.restore(store);
    } else if (contextChanged) {
      this.restore(store);
    }
    this.store = store;
  }
  resolve(params) {
    const id = params.id?.trim();
    if (!id) throw new Error(`${params.action} requires id.`);
    return this.requireStore().get(id);
  }
  requireStore() {
    if (!this.store) throw new Error("Schedule store is unavailable.");
    return this.store;
  }
  requireContext(store) {
    const ctx = this.contexts.get(store.root);
    if (!ctx) throw new Error("Schedule runtime context is unavailable.");
    return ctx;
  }
  activeRun(store, schedule) {
    if (!schedule.activeRunId) return void 0;
    return store.getRun(schedule.id, schedule.activeRunId) ?? store.history(schedule.id).find((run) => run.id === schedule.activeRunId);
  }
  /** Reconciles an attached running run (a dead runner PID becomes failed) and returns its outcome once terminal. */
  terminalAsyncOutcome(run) {
    if (run?.state !== "running" || !run.asyncDir) return void 0;
    const status = reconcileAsyncRun(run.asyncDir, { now: this.now, kill: this.deps.kill }).status;
    if (!status || !["complete", "failed", "stopped", "rejected"].includes(status.state)) return void 0;
    const error2 = [status.error, ...(status.steps ?? []).map((step) => step.error)].find((value) => typeof value === "string");
    return { success: status.state === "complete", error: error2 };
  }
  timerKey(store, id) {
    return `${store.root}\0${id}`;
  }
  clearTimer(store, id) {
    const key = this.timerKey(store, id);
    const timer = this.timers.get(key);
    if (!timer) return;
    this.timersApi.clearTimeout(timer);
    this.timers.delete(key);
  }
  stopTimers() {
    for (const timer of this.timers.values()) this.timersApi.clearTimeout(timer);
    this.timers.clear();
  }
};
function createScheduledRunManager(deps) {
  return new ScheduledRunManager(deps);
}

// src/workflows/workflow-receipt.ts
import * as fs6 from "node:fs";
import * as path5 from "node:path";
var WORKFLOW_RECEIPT_VERSION = 1;
var WORKFLOW_RECEIPT_FILE = "workflow-receipt.json";
var MAX_WORKFLOW_RECEIPT_BYTES = 2 * 1024 * 1024;
var KEY_PATTERN2 = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
var RESOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
function assertSafeRunId(value, label) {
  const normalized = value.trim();
  if (!normalized || path5.basename(normalized) !== normalized || normalized === "." || normalized === "..") {
    throw new Error(`${label} must be an exact workflow run id, not a path or prefix.`);
  }
  return normalized;
}
function assertKey(value, label) {
  if (!KEY_PATTERN2.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}
function workflowReceiptPath(asyncDirRoot, workflowRunId) {
  return path5.join(asyncDirRoot, assertSafeRunId(workflowRunId, "workflowRunId"), WORKFLOW_RECEIPT_FILE);
}
function buildWorkflowReceipt(input) {
  const workflowRunId = assertSafeRunId(input.workflowRunId, "workflowRunId");
  if (input.argsDigest !== void 0 && !/^[a-f0-9]{64}$/u.test(input.argsDigest)) throw new Error("workflow receipt argsDigest must be a lowercase SHA-256 digest.");
  if (input.workflowChildren?.workflowRunId !== void 0 && input.workflowChildren.workflowRunId !== workflowRunId) throw new Error("workflowChildren workflowRunId does not match its receipt.");
  const entries = /* @__PURE__ */ Object.create(null);
  for (const child of input.children) {
    const key = assertKey(child.key, "workflow receipt child key");
    if (entries[key]) throw new Error(`Workflow receipt has duplicate child key '${key}'.`);
    const lane = normalizeWorkflowLaneMetadata(child.lane, `workflow receipt child '${key}'.lane`);
    assertWorkflowLaneKey(lane, key, `workflow receipt child '${key}'.lane`);
    const runIds = [...new Set((child.continuation?.runIds ?? (child.runId ? [child.runId] : [])).filter((runId) => typeof runId === "string" && runId.trim()).map((runId) => runId.trim()))];
    const latestRunId = runIds.at(-1);
    const resumability = child.resumability ?? { state: "not-resumable", reason: child.runId ? "resumability was not recorded" : "child produced no run id" };
    if (resumability.state === "resumable" && !latestRunId) throw new Error(`Workflow receipt child '${key}' is resumable but has no retained run id.`);
    const base = {
      key,
      ...lane ? { lane } : {},
      ...child.terminalOutcome ? { terminalOutcome: child.terminalOutcome } : {},
      ...child.agent ? { agent: child.agent } : {},
      ...child.requestedContext ? { requestedContext: child.requestedContext } : {},
      ...child.resolvedContext ? { resolvedContext: child.resolvedContext } : {},
      ...child.outputReference ? { outputReference: child.outputReference } : {},
      ...child.recovery ? { acceptanceRecovery: child.recovery } : {},
      ...child.externalAdapter ? { externalAdapter: child.externalAdapter } : {},
      continuation: { runIds }
    };
    entries[key] = resumability.state === "resumable" ? { ...base, latestRunId, resumability } : { ...base, ...latestRunId ? { latestRunId } : {}, resumability };
  }
  if (input.hostSteps && input.hostSteps.length > HOST_STEP_MAX_COUNT) throw new Error(`Workflow receipt has more than ${HOST_STEP_MAX_COUNT} host steps.`);
  const hostSteps = input.hostSteps?.map((hostStep, index) => parseHostStepNode(hostStep, `workflow receipt hostSteps[${index}]`));
  if (hostSteps) assertUniqueHostStepIds(hostSteps, "workflow receipt");
  const resource = parseWorkflowResource(input.resource, "workflow receipt");
  return { version: WORKFLOW_RECEIPT_VERSION, workflowRunId, state: input.state, createdAt: input.createdAt ?? Date.now(), entries, ...input.argsDigest ? { argsDigest: input.argsDigest } : {}, ...resource ? { resource } : {}, ...hostSteps?.length ? { hostSteps } : {}, ...input.workflowChildren ? { workflowChildren: input.workflowChildren } : {}, ...input.terminalOutcome ? { terminalOutcome: input.terminalOutcome } : {} };
}
function writeWorkflowReceipt(asyncDir, receipt) {
  const receiptPath = path5.join(asyncDir, WORKFLOW_RECEIPT_FILE);
  writePrivateAtomicJson(receiptPath, receipt);
  return receiptPath;
}
function readWorkflowReceiptFile(receiptPath) {
  let fd;
  try {
    fd = fs6.openSync(receiptPath, "r");
    const stat = fs6.fstatSync(fd);
    if (!stat.isFile()) throw new Error("workflow receipt is not a regular file.");
    if (stat.size > MAX_WORKFLOW_RECEIPT_BYTES) throw new Error(`workflow receipt exceeds the ${MAX_WORKFLOW_RECEIPT_BYTES}-byte limit.`);
    const buffer = Buffer.allocUnsafe(stat.size);
    let offset = 0;
    while (offset < buffer.length) {
      const bytesRead = fs6.readSync(fd, buffer, offset, buffer.length - offset, null);
      if (bytesRead <= 0) throw new Error("workflow receipt ended before its declared size.");
      offset += bytesRead;
    }
    return JSON.parse(buffer.toString("utf-8"));
  } finally {
    if (fd !== void 0) fs6.closeSync(fd);
  }
}
var EXTERNAL_CLI_CAPABILITIES = {
  stop: true,
  steer: false,
  resume: false,
  structuredOutput: false,
  toolEvents: false,
  supervisor: "unsupported",
  forkContext: false,
  extensionBindings: false
};
function parseExternalCliMachine(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}.machine must be an object.`);
  const machine = value;
  const unknownMachine = Object.keys(machine).filter((field) => !["provider", "id", "label", "target", "session", "cwd", "remoteGit"].includes(field));
  if (unknownMachine.length > 0) throw new Error(`${label}.machine has unsupported fields: ${unknownMachine.join(", ")}.`);
  if (machine.provider !== "herdr" || typeof machine.id !== "string" || !machine.id.trim() || typeof machine.target !== "string" || !machine.target.trim() || typeof machine.cwd !== "string" || !machine.cwd.trim()) throw new Error(`${label}.machine is invalid.`);
  for (const field of ["label", "session"]) if (machine[field] !== void 0 && (typeof machine[field] !== "string" || !machine[field].trim())) throw new Error(`${label}.machine.${field} is invalid.`);
  if (machine.remoteGit === void 0) return;
  if (!machine.remoteGit || typeof machine.remoteGit !== "object" || Array.isArray(machine.remoteGit)) throw new Error(`${label}.machine.remoteGit must be an object.`);
  const remoteGit = machine.remoteGit;
  const unknownRemoteGit = Object.keys(remoteGit).filter((field) => !["head", "branch", "dirty"].includes(field));
  if (unknownRemoteGit.length > 0 || remoteGit.head !== void 0 && (typeof remoteGit.head !== "string" || !remoteGit.head.trim()) || remoteGit.branch !== void 0 && (typeof remoteGit.branch !== "string" || !remoteGit.branch.trim()) || remoteGit.dirty !== void 0 && typeof remoteGit.dirty !== "boolean") throw new Error(`${label}.machine.remoteGit is invalid.`);
}
function parseExternalCliReceiptMetadata(value, key, source) {
  if (value === void 0) return void 0;
  const label = `Invalid workflow receipt '${source}': entry '${key}' externalAdapter`;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const metadata = value;
  const unknownMetadata = Object.keys(metadata).filter((field) => !["adapter", "capabilities", "machine", "safety", "outputArtifacts", "handoff", "supervisor", "nonResumableReason"].includes(field));
  if (unknownMetadata.length > 0) throw new Error(`${label} has unsupported fields: ${unknownMetadata.join(", ")}.`);
  const adapter = metadata.adapter;
  if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) throw new Error(`${label}.adapter must be an object.`);
  const adapterRecord = adapter;
  const unknownAdapter = Object.keys(adapterRecord).filter((field) => !["id", "version", "executionMode"].includes(field));
  if (unknownAdapter.length > 0) throw new Error(`${label}.adapter has unsupported fields: ${unknownAdapter.join(", ")}.`);
  if (adapterRecord.id !== "external-cli" && adapterRecord.id !== "codex-exec" && adapterRecord.id !== "codex-exec-writer" && adapterRecord.id !== "claude-code" && adapterRecord.id !== "claude-code-writer" && adapterRecord.id !== "cursor-agent" && adapterRecord.id !== "cursor-agent-writer" && adapterRecord.id !== "grok-build" || adapterRecord.version !== 1 || adapterRecord.executionMode !== (adapterRecord.id === "cursor-agent" || adapterRecord.id === "cursor-agent-writer" || adapterRecord.id === "grok-build" ? "one-shot-prompt-file" : "one-shot-stdin")) throw new Error(`${label}.adapter is invalid.`);
  const capabilities = metadata.capabilities;
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) throw new Error(`${label}.capabilities must be an object.`);
  const capabilityRecord = capabilities;
  const unknownCapabilities = Object.keys(capabilityRecord).filter((field) => !(field in EXTERNAL_CLI_CAPABILITIES));
  if (unknownCapabilities.length > 0) throw new Error(`${label}.capabilities has unsupported fields: ${unknownCapabilities.join(", ")}.`);
  for (const [capability, expected] of Object.entries(EXTERNAL_CLI_CAPABILITIES)) {
    if (capabilityRecord[capability] !== expected) throw new Error(`${label}.capabilities.${capability} is invalid.`);
  }
  if (metadata.machine !== void 0) parseExternalCliMachine(metadata.machine, label);
  const safety = metadata.safety;
  if (adapterRecord.id === "codex-exec") {
    if (!safety || typeof safety !== "object" || Array.isArray(safety)) throw new Error(`${label}.safety is missing.`);
    const safetyRecord = safety;
    const unknownSafety = Object.keys(safetyRecord).filter((field) => !["sandbox", "approvalPolicy", "ephemeral"].includes(field));
    if (unknownSafety.length > 0) throw new Error(`${label}.safety has unsupported fields: ${unknownSafety.join(", ")}.`);
    if (safetyRecord.sandbox !== "read-only" || safetyRecord.approvalPolicy !== "never" || safetyRecord.ephemeral !== true) throw new Error(`${label}.safety is invalid.`);
  } else if (adapterRecord.id === "codex-exec-writer") {
    if (!safety || typeof safety !== "object" || Array.isArray(safety)) throw new Error(`${label}.safety is missing.`);
    const safetyRecord = safety;
    const unknownSafety = Object.keys(safetyRecord).filter((field) => !["access", "sandbox", "approvalPolicy", "ephemeral"].includes(field));
    if (unknownSafety.length > 0) throw new Error(`${label}.safety has unsupported fields: ${unknownSafety.join(", ")}.`);
    if (safetyRecord.access !== "workspace-write" || safetyRecord.sandbox !== "workspace-write" || safetyRecord.approvalPolicy !== "never" || safetyRecord.ephemeral !== true) throw new Error(`${label}.safety is invalid.`);
  } else if (adapterRecord.id === "claude-code") {
    if (!safety || typeof safety !== "object" || Array.isArray(safety)) throw new Error(`${label}.safety is missing.`);
    const safetyRecord = safety;
    const legacy = safetyRecord.authentication === void 0;
    const unknownSafety = Object.keys(safetyRecord).filter((field) => !(legacy ? ["permissionMode", "tools", "mcp", "settingSources", "sessionPersistence"] : ["access", "authentication", "permissionMode", "tools", "mcp", "settingSources", "userSettingsTrust", "sessionPersistence"]).includes(field));
    if (unknownSafety.length > 0) throw new Error(`${label}.safety has unsupported fields: ${unknownSafety.join(", ")}.`);
    if (legacy) {
      if (safetyRecord.permissionMode !== "plan" || safetyRecord.tools !== "none" || safetyRecord.mcp !== "empty-strict" || safetyRecord.settingSources !== "none" || safetyRecord.sessionPersistence !== false) throw new Error(`${label}.safety is invalid.`);
    } else if (safetyRecord.access !== "read-only" || safetyRecord.authentication !== "existing-cli-required" || safetyRecord.permissionMode !== "plan" || safetyRecord.tools !== "none" || safetyRecord.mcp !== "empty-strict" || safetyRecord.settingSources !== "user" || safetyRecord.userSettingsTrust !== "required" || safetyRecord.sessionPersistence !== false) throw new Error(`${label}.safety is invalid.`);
  } else if (adapterRecord.id === "claude-code-writer") {
    if (!safety || typeof safety !== "object" || Array.isArray(safety)) throw new Error(`${label}.safety is missing.`);
    const safetyRecord = safety;
    const unknownSafety = Object.keys(safetyRecord).filter((field) => !["access", "authentication", "permissionMode", "tools", "mcp", "settingSources", "userSettingsTrust", "sessionPersistence"].includes(field));
    if (unknownSafety.length > 0) throw new Error(`${label}.safety has unsupported fields: ${unknownSafety.join(", ")}.`);
    if (safetyRecord.access !== "workspace-write" || safetyRecord.authentication !== "existing-cli-required" || safetyRecord.permissionMode !== "acceptEdits" || safetyRecord.tools !== "Read,Write,Edit,Glob,Grep" || safetyRecord.mcp !== "empty-strict" || safetyRecord.settingSources !== "user" || safetyRecord.userSettingsTrust !== "required" || safetyRecord.sessionPersistence !== false) throw new Error(`${label}.safety is invalid.`);
  } else if (adapterRecord.id === "cursor-agent" || adapterRecord.id === "cursor-agent-writer") {
    if (!safety || typeof safety !== "object" || Array.isArray(safety)) throw new Error(`${label}.safety is missing.`);
    const safetyRecord = safety;
    const unknownSafety = Object.keys(safetyRecord).filter((field) => !["access", "authentication", "mode", "sandbox", "workspaceTrust", "sessionReuse"].includes(field));
    if (unknownSafety.length > 0) throw new Error(`${label}.safety has unsupported fields: ${unknownSafety.join(", ")}.`);
    const writer = adapterRecord.id === "cursor-agent-writer";
    if (safetyRecord.access !== (writer ? "workspace-write" : "read-only") || safetyRecord.authentication !== "cursor-api-key-or-existing-login" || safetyRecord.mode !== (writer ? "print" : "ask") || safetyRecord.sandbox !== "enabled" || safetyRecord.workspaceTrust !== "existing-required" || safetyRecord.sessionReuse !== false) throw new Error(`${label}.safety is invalid.`);
  } else if (adapterRecord.id === "grok-build") {
    if (!safety || typeof safety !== "object" || Array.isArray(safety)) throw new Error(`${label}.safety is missing.`);
    const safetyRecord = safety;
    const unknownSafety = Object.keys(safetyRecord).filter((field) => !["access", "authentication", "permissionMode", "tools", "deniedTools", "sandbox", "webSearch", "subagents", "config", "updates", "sessionPersistence"].includes(field));
    if (unknownSafety.length > 0) throw new Error(`${label}.safety has unsupported fields: ${unknownSafety.join(", ")}.`);
    if (safetyRecord.access !== "read-only" || safetyRecord.authentication !== "xai-api-key-required" || safetyRecord.permissionMode !== "plan" || safetyRecord.tools !== "read_file,grep,list_dir" || safetyRecord.deniedTools !== "run_terminal_cmd,search_replace,Agent,Bash,Edit,Write,MCPTool" || safetyRecord.sandbox !== "read-only" || safetyRecord.webSearch !== false || safetyRecord.subagents !== false || safetyRecord.config !== "temporary-home" || safetyRecord.updates !== "disabled" || safetyRecord.sessionPersistence !== false) throw new Error(`${label}.safety is invalid.`);
  } else if (safety !== void 0) throw new Error(`${label}.safety is invalid for the generic adapter.`);
  const handoff = metadata.handoff;
  if (!handoff || typeof handoff !== "object" || Array.isArray(handoff)) throw new Error(`${label}.handoff must be an object.`);
  const handoffRecord = handoff;
  const unknownHandoff = Object.keys(handoffRecord).filter((field) => field !== "mode");
  if (unknownHandoff.length > 0) throw new Error(`${label}.handoff has unsupported fields: ${unknownHandoff.join(", ")}.`);
  if (handoffRecord.mode !== "fresh") throw new Error(`${label}.handoff is invalid.`);
  const supervisor = metadata.supervisor;
  if (!supervisor || typeof supervisor !== "object" || Array.isArray(supervisor)) throw new Error(`${label}.supervisor must be an object.`);
  const supervisorRecord = supervisor;
  const unknownSupervisor = Object.keys(supervisorRecord).filter((field) => !["mode", "reason"].includes(field));
  if (unknownSupervisor.length > 0) throw new Error(`${label}.supervisor has unsupported fields: ${unknownSupervisor.join(", ")}.`);
  if (supervisorRecord.mode !== "unsupported" || typeof supervisorRecord.reason !== "string" || !supervisorRecord.reason.trim()) throw new Error(`${label}.supervisor is invalid.`);
  if (typeof metadata.nonResumableReason !== "string" || !metadata.nonResumableReason.trim()) throw new Error(`${label}.nonResumableReason is missing.`);
  const outputArtifacts = metadata.outputArtifacts;
  if (outputArtifacts !== void 0) {
    if (!outputArtifacts || typeof outputArtifacts !== "object" || Array.isArray(outputArtifacts)) throw new Error(`${label}.outputArtifacts must be an object.`);
    const unknownArtifacts = Object.keys(outputArtifacts).filter((field) => !["stdoutPath", "stderrPath", "finalOutputPath"].includes(field));
    if (unknownArtifacts.length > 0) throw new Error(`${label}.outputArtifacts has unsupported fields: ${unknownArtifacts.join(", ")}.`);
    for (const field of ["stdoutPath", "stderrPath", "finalOutputPath"]) {
      const artifactPath = outputArtifacts[field];
      if (artifactPath !== void 0 && (typeof artifactPath !== "string" || !artifactPath.trim())) throw new Error(`${label}.outputArtifacts.${field} must be a non-empty string.`);
    }
  }
  return value;
}
function parseTerminalOutcome(value, label) {
  if (value === void 0) return void 0;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const outcome = value;
  if (outcome.state !== "partial" || outcome.reason !== "budget_exhausted" && outcome.reason !== "timeout") throw new Error(`${label} is invalid.`);
  return { state: "partial", reason: outcome.reason };
}
function parseAcceptanceRecoveryMetadata(value, label) {
  if (value === void 0) return void 0;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const recovery = value;
  if (recovery.status !== "available-for-review" || recovery.reason !== "acceptance-metadata-rejected") throw new Error(`${label} is invalid.`);
  if (typeof recovery.reportPath !== "string" || !recovery.reportPath.trim() || typeof recovery.reportHash !== "string" || !/^[a-f0-9]{64}$/u.test(recovery.reportHash)) throw new Error(`${label} is invalid.`);
  return {
    status: "available-for-review",
    reason: "acceptance-metadata-rejected",
    reportPath: recovery.reportPath,
    reportHash: recovery.reportHash
  };
}
function parseEntry(value, key, source) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid workflow receipt '${source}': entry '${key}' must be an object.`);
  const entry = value;
  if (entry.key !== key) throw new Error(`Invalid workflow receipt '${source}': entry '${key}' has a mismatched key.`);
  const latestRunId = entry.latestRunId;
  if (latestRunId !== void 0 && (typeof latestRunId !== "string" || !latestRunId.trim())) throw new Error(`Invalid workflow receipt '${source}': entry '${key}' latestRunId must be non-empty.`);
  const continuation = entry.continuation;
  if (!continuation || typeof continuation !== "object" || Array.isArray(continuation) || !Array.isArray(continuation.runIds)) {
    throw new Error(`Invalid workflow receipt '${source}': entry '${key}' continuation is missing.`);
  }
  const runIds = continuation.runIds;
  if (runIds.some((runId) => typeof runId !== "string" || !runId.trim())) throw new Error(`Invalid workflow receipt '${source}': entry '${key}' continuation contains an invalid run id.`);
  if (latestRunId !== void 0 && runIds.at(-1) !== latestRunId) throw new Error(`Workflow receipt '${source}' entry '${key}' is stale: latestRunId does not match its continuation lineage.`);
  const resumability = entry.resumability;
  if (!resumability || typeof resumability !== "object" || Array.isArray(resumability)) throw new Error(`Invalid workflow receipt '${source}': entry '${key}' resumability is missing.`);
  const state = resumability.state;
  if (state !== "resumable" && state !== "not-resumable") throw new Error(`Invalid workflow receipt '${source}': entry '${key}' resumability state is invalid.`);
  const reason = resumability.reason;
  if (state === "resumable" && latestRunId === void 0) throw new Error(`Invalid workflow receipt '${source}': entry '${key}' resumable entry has no retained run id.`);
  if (state === "not-resumable" && (typeof reason !== "string" || !reason.trim())) throw new Error(`Invalid workflow receipt '${source}': entry '${key}' non-resumable reason is missing.`);
  const terminalOutcome = parseTerminalOutcome(entry.terminalOutcome, `Invalid workflow receipt '${source}': entry '${key}' terminalOutcome`);
  const acceptanceRecovery = parseAcceptanceRecoveryMetadata(entry.acceptanceRecovery, `Invalid workflow receipt '${source}': entry '${key}' acceptanceRecovery`);
  parseExternalCliReceiptMetadata(entry.externalAdapter, key, source);
  const lane = normalizeWorkflowLaneMetadata(entry.lane, `Invalid workflow receipt '${source}': entry '${key}'.lane`);
  assertWorkflowLaneKey(lane, key, `Invalid workflow receipt '${source}': entry '${key}'.lane`);
  return { ...value, ...lane ? { lane } : {}, ...terminalOutcome ? { terminalOutcome } : {}, ...acceptanceRecovery ? { acceptanceRecovery } : {} };
}
function parseWorkflowResolution(value, source) {
  if (value === void 0) return void 0;
  if (value !== "settled-awaiting-resume" && value !== "failed-child" && value !== "interrupted-child") throw new Error(`Invalid workflow receipt '${source}': workflowResolution is invalid.`);
  return value;
}
function parseWorkflowResource(value, source) {
  if (value === void 0) return void 0;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid workflow receipt '${source}': resource must be an object.`);
  const resource = value;
  if (resource.kind !== "workflow" || typeof resource.name !== "string" || !KEY_PATTERN2.test(resource.name) || !Number.isInteger(resource.version) || resource.version < 1 || resource.version > 1e6 || resource.invocation !== "named" || resource.expansion !== "resolved" || typeof resource.id !== "string" || !RESOURCE_ID_PATTERN.test(resource.id)) {
    throw new Error(`Invalid workflow receipt '${source}': resource is invalid.`);
  }
  return {
    kind: "workflow",
    name: resource.name,
    version: resource.version,
    invocation: "named",
    expansion: "resolved",
    id: resource.id
  };
}
function parseRecovery(value, workflowRunId, entries, source) {
  if (value === void 0) return void 0;
  if (!Array.isArray(value)) throw new Error(`Invalid workflow receipt '${source}': recovery must be an array.`);
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Invalid workflow receipt '${source}': recovery[${index}] must be an object.`);
    const action = item;
    const key = action.key;
    const resume = action.resume;
    if (typeof key !== "string" || !entries[key] || action.call !== "runs.run" || action.taskRequired !== true || !resume || typeof resume !== "object" || Array.isArray(resume)) throw new Error(`Invalid workflow receipt '${source}': recovery[${index}] is invalid.`);
    const reference = resume;
    if (reference.workflowRunId !== workflowRunId || reference.key !== key || reference.latest !== true || entries[key].resumability.state !== "resumable") throw new Error(`Invalid workflow receipt '${source}': recovery[${index}] does not identify a resumable entry.`);
    return { key, call: "runs.run", resume: { workflowRunId, key, latest: true }, taskRequired: true };
  });
}
function readWorkflowReceipt(asyncDirRoot, workflowRunId) {
  const receiptPath = workflowReceiptPath(asyncDirRoot, workflowRunId);
  let value;
  try {
    value = readWorkflowReceiptFile(receiptPath);
  } catch (error2) {
    if (error2.code === "ENOENT") {
      const workflowDir = path5.dirname(receiptPath);
      if (fs6.existsSync(path5.join(workflowDir, "status.json")) || fs6.existsSync(path5.join(workflowDir, "events.jsonl"))) {
        throw new Error(`Workflow receipt '${workflowRunId}' is not available because the workflow may still be active or terminal receipt writing failed. Use direct child run IDs from status/events for direct resume after the normal retained-child checks.`, { cause: error2 });
      }
      throw new Error(`Workflow receipt '${workflowRunId}' was not found.`, { cause: error2 });
    }
    throw new Error(`Workflow receipt '${workflowRunId}' could not be read: ${error2 instanceof Error ? error2.message : String(error2)}`, { cause: error2 instanceof Error ? error2 : void 0 });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid workflow receipt '${receiptPath}': expected an object.`);
  const receipt = value;
  if (receipt.version !== WORKFLOW_RECEIPT_VERSION) throw new Error(`Invalid workflow receipt '${receiptPath}': unsupported version.`);
  if (receipt.workflowRunId !== workflowRunId) throw new Error(`Workflow receipt '${receiptPath}' is stale: workflowRunId does not match.`);
  if (receipt.state !== "complete" && receipt.state !== "failed" && receipt.state !== "paused" && receipt.state !== "stopped") {
    throw new Error(`Workflow receipt '${receiptPath}' is stale: workflow is not terminal.`);
  }
  if (typeof receipt.createdAt !== "number" || !Number.isFinite(receipt.createdAt)) throw new Error(`Invalid workflow receipt '${receiptPath}': createdAt is invalid.`);
  if (!receipt.entries || typeof receipt.entries !== "object" || Array.isArray(receipt.entries)) throw new Error(`Invalid workflow receipt '${receiptPath}': entries must be an object.`);
  const entries = /* @__PURE__ */ Object.create(null);
  for (const [key, entry] of Object.entries(receipt.entries)) entries[assertKey(key, "workflow receipt key")] = parseEntry(entry, key, receiptPath);
  const workflowChildren = parseWorkflowChildSummary(receipt.workflowChildren);
  if (workflowChildren && workflowChildren.workflowRunId !== workflowRunId) throw new Error(`Workflow receipt '${receiptPath}' is stale: workflowChildren.workflowRunId does not match.`);
  let hostSteps;
  if (receipt.hostSteps !== void 0) {
    if (!Array.isArray(receipt.hostSteps)) throw new Error(`Invalid workflow receipt '${receiptPath}': hostSteps must be an array.`);
    if (receipt.hostSteps.length > HOST_STEP_MAX_COUNT) throw new Error(`Invalid workflow receipt '${receiptPath}': hostSteps exceeds ${HOST_STEP_MAX_COUNT} entries.`);
    hostSteps = receipt.hostSteps.map((hostStep, index) => parseHostStepNode(hostStep, `${receiptPath} hostSteps[${index}]`));
    assertUniqueHostStepIds(hostSteps, receiptPath);
  }
  const workflowResolution = parseWorkflowResolution(receipt.workflowResolution, receiptPath);
  if (receipt.argsDigest !== void 0 && (typeof receipt.argsDigest !== "string" || !/^[a-f0-9]{64}$/u.test(receipt.argsDigest))) throw new Error(`Invalid workflow receipt '${receiptPath}': argsDigest is invalid.`);
  const resource = parseWorkflowResource(receipt.resource, receiptPath);
  const terminalOutcome = parseTerminalOutcome(receipt.terminalOutcome, `Invalid workflow receipt '${receiptPath}': terminalOutcome`);
  const recovery = parseRecovery(receipt.recovery, workflowRunId, entries, receiptPath);
  return { version: 1, workflowRunId, state: receipt.state, createdAt: receipt.createdAt, entries, ...receipt.argsDigest ? { argsDigest: receipt.argsDigest } : {}, ...resource ? { resource } : {}, ...hostSteps?.length ? { hostSteps } : {}, ...workflowChildren ? { workflowChildren } : {}, ...workflowResolution ? { workflowResolution } : {}, ...terminalOutcome ? { terminalOutcome } : {}, ...recovery ? { recovery } : {} };
}
function resolveWorkflowReceiptResumeEntry(input) {
  if (input.reference.latest !== true) throw new Error("Keyed workflow receipt resume requires latest: true.");
  const key = assertKey(input.reference.key, "keyed resume key");
  const receipt = readWorkflowReceipt(input.asyncDirRoot, input.reference.workflowRunId.trim());
  const recorded = receipt.entries[key];
  if (!recorded) throw new Error(`Workflow receipt '${receipt.workflowRunId}' has no child key '${key}'.`);
  const revival = recorded.latestRunId ? projectWorkflowKeyRevival(input.asyncDirRoot, receipt.workflowRunId, key, recorded.latestRunId) : void 0;
  const entry = revival ? { ...recorded, latestRunId: revival.latestRunId, continuation: { runIds: [...recorded.continuation.runIds, ...revival.revivedRunIds] } } : recorded;
  assertResumableEntry(entry, receipt.workflowRunId, key);
  input.assertResumable?.(entry.latestRunId);
  return entry;
}
function assertResumableEntry(entry, workflowRunId, key) {
  if (entry.resumability.state !== "resumable") throw new Error(`Workflow receipt '${workflowRunId}' child '${key}' is not resumable: ${entry.resumability.reason}.`);
  if (!entry.latestRunId) throw new Error(`Workflow receipt '${workflowRunId}' child '${key}' has no retained run id.`);
}

// src/shared/child-session-name.ts
var TASK_EXCERPT_MAX_CHARS = 60;
var CHILD_SESSION_NAME_MAX_CHARS = 80;
function deriveChildSessionName(input) {
  const agent = input.agent?.trim() ?? "";
  const rawLabel = input.label?.trim() ?? "";
  const rawTask = input.task?.trim() ?? "";
  const excerptSource = rawLabel && rawLabel !== PROMPT_REDACTED ? rawLabel : rawTask && rawTask !== PROMPT_REDACTED ? rawTask : "";
  const excerpt = excerptSource ? previewDisplayText(excerptSource, TASK_EXCERPT_MAX_CHARS) : "";
  const base = agent && excerpt ? `${agent}: ${excerpt}` : agent || excerpt;
  if (!base) return void 0;
  return previewDisplayText(base, CHILD_SESSION_NAME_MAX_CHARS);
}

// src/agents/agent-management.ts
import * as fs7 from "node:fs";
import * as path6 from "node:path";

// src/agents/proactive-skills.ts
var SUBAGENT_ORCHESTRATION_SKILL = "pi-subagents";
var DEFAULT_MIN_REFERENCES = 2;
var DEFAULT_MAX_RECOMMENDATIONS = 3;
var DEFAULT_PREFERRED_AGENT = "reviewer";
var FALLBACK_AGENT_ORDER = ["reviewer", "delegate"];
var MAX_RECOMMENDATION_CAP = 5;
function positiveInteger(value) {
  if (typeof value !== "number") return void 0;
  if (!Number.isInteger(value) || !Number.isFinite(value) || value < 1) return void 0;
  return value;
}
function resolveProactiveSkillSubagentsConfig(config) {
  if (config === false) {
    return {
      enabled: false,
      minReferences: DEFAULT_MIN_REFERENCES,
      maxRecommendations: DEFAULT_MAX_RECOMMENDATIONS,
      preferredAgent: DEFAULT_PREFERRED_AGENT
    };
  }
  const maxRecommendations = positiveInteger(config?.maxRecommendations) ?? DEFAULT_MAX_RECOMMENDATIONS;
  return {
    enabled: config?.enabled ?? true,
    minReferences: positiveInteger(config?.minReferences) ?? DEFAULT_MIN_REFERENCES,
    maxRecommendations: Math.min(maxRecommendations, MAX_RECOMMENDATION_CAP),
    preferredAgent: typeof config?.preferredAgent === "string" && config.preferredAgent.trim() ? config.preferredAgent.trim() : DEFAULT_PREFERRED_AGENT
  };
}
function normalizeSkillNames(value) {
  if (value === false || value === true || value === void 0 || value === null) return [];
  if (Array.isArray(value)) {
    return [...new Set(value.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean))];
  }
  if (typeof value === "string") {
    return [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
  }
  return [];
}
function collectStepSkills(step, out) {
  for (const skill of normalizeSkillNames(step.skills ?? step.skill)) {
    out.add(skill);
  }
  const parallel = step.parallel;
  if (!parallel) return;
  if (Array.isArray(parallel)) {
    for (const child of parallel) {
      if (child && typeof child === "object" && !Array.isArray(child)) {
        collectStepSkills(child, out);
      }
    }
    return;
  }
  if (typeof parallel === "object") {
    collectStepSkills(parallel, out);
  }
}
function chooseRecommendationAgent(agents, preferredAgent) {
  const enabled = agents.filter((agent) => !agent.disabled);
  if (enabled.some((agent) => agent.name === preferredAgent)) return preferredAgent;
  for (const name of FALLBACK_AGENT_ORDER) {
    if (enabled.some((agent) => agent.name === name)) return name;
  }
  return enabled[0]?.name;
}
function addSource(counts, skill, source) {
  if (skill === SUBAGENT_ORCHESTRATION_SKILL) return;
  const sources = counts.get(skill) ?? /* @__PURE__ */ new Set();
  sources.add(source);
  counts.set(skill, sources);
}
function recommendProactiveSkillSubagents(input) {
  const config = resolveProactiveSkillSubagentsConfig(input.config);
  if (!config.enabled) return [];
  const agent = chooseRecommendationAgent(input.agents, config.preferredAgent);
  if (!agent) return [];
  const availableByName = input.availableSkills ? new Map(input.availableSkills.map((skill) => [skill.name, skill])) : void 0;
  const counts = /* @__PURE__ */ new Map();
  for (const candidate of input.agents) {
    if (candidate.disabled) continue;
    for (const skill of candidate.skills ?? []) {
      addSource(counts, skill, `agent:${candidate.name}`);
    }
  }
  for (const chain of input.chains ?? []) {
    const chainSkills = /* @__PURE__ */ new Set();
    for (const step of chain.steps) {
      collectStepSkills(step, chainSkills);
    }
    for (const skill of chainSkills) {
      addSource(counts, skill, `chain:${chain.name}`);
    }
  }
  return [...counts.entries()].filter(([skill, sources]) => sources.size >= config.minReferences && (!availableByName || availableByName.has(skill)) && availableByName?.get(skill)?.disableModelInvocation !== true).map(([skill, sources]) => {
    const description = availableByName?.get(skill)?.description;
    return {
      skill,
      agent,
      references: sources.size,
      sources: [...sources].sort((a, b) => a.localeCompare(b)),
      ...description !== void 0 ? { description } : {},
      reason: `referenced by ${sources.size} configured agents/chains`
    };
  }).sort((a, b) => b.references - a.references || a.skill.localeCompare(b.skill)).slice(0, config.maxRecommendations);
}
function formatProactiveSkillSubagentRecommendations(recommendations) {
  if (recommendations.length === 0) return [];
  return [
    "Proactive skill subagent suggestions:",
    ...recommendations.map((recommendation) => {
      const sampleSources = recommendation.sources.slice(0, 3).join(", ");
      const extra = recommendation.sources.length > 3 ? `, +${recommendation.sources.length - 3} more` : "";
      const description = recommendation.description ? ` - ${recommendation.description}` : "";
      return `- ${recommendation.skill} via ${recommendation.agent} (${recommendation.reason}; ${sampleSources}${extra})${description}`;
    }),
    "Guardrails: use these for broad tasks where a skill-specialist pass is useful; keep fanout small, use fresh context unless private/session context is explicitly needed, and skip when the user asks for a direct answer."
  ];
}
function buildProactiveSkillSubagentRecommendationLines(input) {
  if (!resolveProactiveSkillSubagentsConfig(input.config).enabled) return [];
  let availableSkills;
  try {
    availableSkills = input.discoverAvailableSkills();
  } catch {
    availableSkills = [];
  }
  return formatProactiveSkillSubagentRecommendations(recommendProactiveSkillSubagents({
    agents: input.agents,
    ...input.chains !== void 0 ? { chains: input.chains } : {},
    availableSkills,
    ...input.config !== void 0 ? { config: input.config } : {}
  }));
}

// src/agents/agent-management.ts
function discoverCatalog(ctx, cwd = ctx.cwd, provider) {
  return (ctx.discoverAgentsAll ?? discoverAgentsAll)(cwd, provider);
}
function result4(text2, isError = false, details) {
  return { content: [{ type: "text", text: text2 }], isError, details: { mode: "management", results: [], ...details } };
}
function jsonDetails(value) {
  return JSON.parse(JSON.stringify(value));
}
function presentDetails(value) {
  const cleaned = jsonDetails(value);
  return Object.keys(cleaned).length > 0 ? cleaned : void 0;
}
function parseCsv(value) {
  return [...new Set(value.split(",").map((v) => v.trim()).filter(Boolean))];
}
function configObject(config) {
  let val = config;
  if (typeof val === "string") {
    try {
      val = JSON.parse(val);
    } catch (error2) {
      const message = error2 instanceof Error ? error2.message : String(error2);
      return { status: "error", message: `config must be valid JSON: ${message}` };
    }
  }
  if (!val || typeof val !== "object" || Array.isArray(val)) return { status: "missing" };
  return { status: "ok", value: val };
}
function hasKey(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
function isJsonSerializable(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonSerializable);
  if (value && typeof value === "object") return Object.values(value).every(isJsonSerializable);
  return false;
}
function asDisambiguationScope(scope) {
  if (scope === "user" || scope === "project") return scope;
  return void 0;
}
function actionScope(scope, action) {
  if (scope === void 0) return { scope: "user" };
  const parsed = asDisambiguationScope(scope);
  return parsed ? { scope: parsed } : { error: result4(`agentScope must be 'user' or 'project' for ${action}.`, true) };
}
function normalizeListScope(scope) {
  if (scope === void 0) return "both";
  if (scope === "user" || scope === "project" || scope === "both") return scope;
  return void 0;
}
function sanitizeName(name) {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}
function parsePackageConfig(value) {
  return parsePackageName(value, "config.package");
}
function allAgents(d) {
  return [...d.builtin, ...d.package, ...d.user, ...d.project];
}
function effectiveAgentsForScope(scope, d, runtimeAgentOwner, preferredModelProvider) {
  let agents = mergeAgentsForScope(scope, d.user, d.project, d.builtin, d.package);
  if (runtimeAgentOwner) {
    agents = mergeRuntimeAgents(runtimeAgentOwner, { agents }, allAgents(d), { cwd: d.cwd, scope, preferredModelProvider }).agents;
  }
  return agents;
}
function availableAgentNamesFromDiscovery(d, runtimeAgentOwner, preferredModelProvider) {
  const agents = runtimeAgentOwner ? effectiveAgentsForScope("both", d, runtimeAgentOwner, preferredModelProvider) : allAgents(d);
  return [...new Set(agents.map((agent) => agent.name))].sort((a, b) => a.localeCompare(b));
}
function availableAgentNames(ctx, cwd = ctx.cwd) {
  return availableAgentNamesFromDiscovery(discoverCatalog(ctx, cwd));
}
function findAgentsInDiscovery(name, d, scope = "both", runtimeAgentOwner, preferredModelProvider) {
  const raw = name.trim();
  const sanitized = sanitizeName(raw);
  const scoped = effectiveAgentsForScope(scope, d, runtimeAgentOwner, preferredModelProvider);
  let resolved = resolveAgentName(raw, scoped);
  if (!resolved.agent && !resolved.error && sanitized !== raw) resolved = resolveAgentName(sanitized, scoped);
  if (resolved.agent) return scoped.filter((agent) => agent.name === resolved.agent.name).sort((a, b) => a.source.localeCompare(b.source));
  return scoped.filter((agent) => Boolean(resolveAgentName(raw, [agent]).agent) || sanitized !== raw && Boolean(resolveAgentName(sanitized, [agent]).agent)).sort((a, b) => a.source.localeCompare(b.source));
}
function findAgents(name, ctx, scope = "both") {
  return findAgentsInDiscovery(name, discoverCatalog(ctx), scope);
}
function diagnosticsForScope(diagnostics, scope) {
  if (scope === "both") return diagnostics;
  const excludedSource = scope === "user" ? "project" : "user";
  return diagnostics?.filter((diagnostic) => diagnostic.source !== excludedSource);
}
var AGENT_SOURCE_PRECEDENCE = { builtin: 0, package: 1, user: 2, project: 3, runtime: 4 };
function resolveEffectiveAgent(d, name) {
  const raw = name.trim();
  const candidates = allAgents(d);
  let resolved = resolveAgentName(raw, candidates);
  if (!resolved.agent && !resolved.error) {
    const sanitized = sanitizeName(raw);
    if (sanitized !== raw) resolved = resolveAgentName(sanitized, candidates);
  }
  if (resolved.error) return { error: resolved.error };
  if (!resolved.agent) return {};
  const matches = candidates.filter((agent) => agent.name === resolved.agent.name);
  return { agent: matches.reduce((best, agent) => AGENT_SOURCE_PRECEDENCE[agent.source] > AGENT_SOURCE_PRECEDENCE[best.source] ? agent : best) };
}
function nameExistsInScope(ctx, scope, name, excludePath) {
  const d = discoverCatalog(ctx);
  for (const a of scope === "user" ? d.user : d.project) {
    if (a.name === name && a.filePath !== excludePath) return true;
  }
  return false;
}
function isMutableSource(source) {
  return source === "user" || source === "project";
}
function modelWarning(ctx, model) {
  if (!model) return void 0;
  const found = ctx.modelRegistry.getAvailable().some((m) => `${m.provider}/${m.id}` === model || m.id === model);
  if (found) return void 0;
  return `Warning: model '${model}' is not in the current model registry. Run subagent({ action: "models" }) to list valid provider/id selectors, then use the exact provider/id form (bare ids resolve only when unique).`;
}
function skillsWarning(cwd, agent) {
  if (!agent.skills?.length) return void 0;
  const { missing } = resolveSkills(
    agent.skills,
    cwd,
    agent.skillPath,
    agent.filePath ? path6.dirname(agent.filePath) : cwd
  );
  return missing.length ? `Warning: skills not found: ${missing.join(", ")}.` : void 0;
}
function withDeclaredExtensionPaths(config, filePath) {
  const { frontmatter } = parseFrontmatter(fs7.readFileSync(filePath, "utf-8"));
  const { extensions: _extensions, subagentOnlyExtensions: _subagentOnlyExtensions, ...withoutResolvedExtensions } = config;
  return {
    ...withoutResolvedExtensions,
    ...frontmatter.extensions !== void 0 ? { extensions: parseUnquotedList(frontmatter.extensions) } : {},
    ...frontmatter.subagentOnlyExtensions !== void 0 ? { subagentOnlyExtensions: parseUnquotedList(frontmatter.subagentOnlyExtensions) } : {}
  };
}
function editableAgentConfig(agent) {
  const { extensions: _extensions, ...withoutExtensions } = agent;
  const base = agent.override?.base;
  const description = base?.description ?? agent.description;
  const frontmatterFields = agent.source === "builtin" || agent.source === "runtime" ? void 0 : readAgentFrontmatterFields(agent.filePath);
  const hasDeclaredField = (...fields) => frontmatterFields === void 0 || fields.some((field) => frontmatterFields.has(field));
  const withoutSettingsDefaults = (config) => {
    if (!frontmatterFields) return config;
    const next = { ...config };
    if (!hasDeclaredField("model")) delete next.model;
    if (!hasDeclaredField("thinking")) delete next.thinking;
    return next;
  };
  const {
    override: _override,
    description: _description,
    output: _output,
    outputMode: _outputMode,
    defaultReads: _defaultReads,
    model: _model,
    fast: _fast,
    thinking: _thinking,
    systemPromptMode: _systemPromptMode,
    inheritProjectContext: _inheritProjectContext,
    inheritGlobalContext: _inheritGlobalContext,
    inheritSkills: _inheritSkills,
    defaultContext: _defaultContext,
    acceptanceRole: _acceptanceRole,
    disabled: _disabled,
    systemPrompt: _systemPrompt,
    skills: _skills,
    skillPath: _skillPath,
    tools: _tools,
    excludeTools: _excludeTools,
    mcpDirectTools: _mcpDirectTools,
    allowNestedSubagents: _allowNestedSubagents,
    allowedAgents: _allowedAgents,
    subagentOnlyExtensions: _subagentOnlyExtensions,
    mutationTools: _mutationTools,
    toolBudget: _toolBudget,
    ...editable
  } = withoutExtensions;
  if (!base) {
    return withDeclaredExtensionPaths(withoutSettingsDefaults({
      ...withoutExtensions,
      ...agent.extensionsFromDefault ? {} : agent.extensions !== void 0 ? { extensions: [...agent.extensions] } : {}
    }), agent.filePath);
  }
  return withDeclaredExtensionPaths({
    ...editable,
    description,
    ...base.output !== void 0 ? { output: base.output } : {},
    ...base.outputMode !== void 0 ? { outputMode: base.outputMode } : {},
    ...base.defaultReads !== void 0 ? { defaultReads: [...base.defaultReads] } : {},
    ...base.model !== void 0 && hasDeclaredField("model") ? { model: base.model } : {},
    ...base.fast !== void 0 ? { fast: base.fast } : {},
    ...base.thinking !== void 0 && hasDeclaredField("thinking") ? { thinking: base.thinking } : {},
    systemPromptMode: base.systemPromptMode,
    inheritProjectContext: base.inheritProjectContext,
    inheritGlobalContext: base.inheritGlobalContext,
    inheritSkills: base.inheritSkills,
    ...base.defaultContext !== void 0 ? { defaultContext: base.defaultContext } : {},
    ...base.acceptanceRole !== void 0 ? { acceptanceRole: base.acceptanceRole } : {},
    ...base.disabled !== void 0 ? { disabled: base.disabled } : {},
    systemPrompt: base.systemPrompt,
    ...base.skills !== void 0 ? { skills: [...base.skills] } : {},
    ...base.skillPath !== void 0 ? { skillPath: [...base.skillPath] } : {},
    ...base.tools !== void 0 ? { tools: [...base.tools] } : {},
    ...base.excludeTools !== void 0 ? { excludeTools: [...base.excludeTools] } : {},
    ...base.mcpDirectTools !== void 0 ? { mcpDirectTools: [...base.mcpDirectTools] } : {},
    ...base.allowNestedSubagents !== void 0 ? { allowNestedSubagents: base.allowNestedSubagents } : {},
    ...base.allowedAgents !== void 0 ? { allowedAgents: [...base.allowedAgents] } : {},
    ...base.extensions !== void 0 ? { extensions: [...base.extensions] } : {},
    ...base.subagentOnlyExtensions !== void 0 ? { subagentOnlyExtensions: [...base.subagentOnlyExtensions] } : {},
    ...base.mutationTools !== void 0 ? { mutationTools: [...base.mutationTools] } : {},
    ...base.toolBudget !== void 0 ? { toolBudget: base.toolBudget } : {}
  }, agent.filePath);
}
function readAgentFrontmatterFields(filePath) {
  try {
    const { frontmatter } = parseFrontmatter(fs7.readFileSync(filePath, "utf-8"));
    return new Set(Object.keys(frontmatter));
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function preservedAgentFrontmatterFields(agent, cfg) {
  const fields = readAgentFrontmatterFields(agent.filePath);
  const changed = (...names) => {
    for (const name of names) fields.delete(name);
  };
  if (hasKey(cfg, "name")) changed("name");
  if (hasKey(cfg, "package")) changed("package");
  if (hasKey(cfg, "description")) changed("description");
  if (hasKey(cfg, "advertise")) changed("advertise");
  if (hasKey(cfg, "aliases")) changed("alias", "aliases");
  if (hasKey(cfg, "systemPrompt")) changed("systemPrompt");
  if (hasKey(cfg, "runner")) changed("runner");
  if (hasKey(cfg, "model")) changed("model");
  if (hasKey(cfg, "tools")) changed("tools");
  if (hasKey(cfg, "excludeTools")) changed("excludeTools");
  if (hasKey(cfg, "skills")) changed("skill", "skills");
  if (hasKey(cfg, "skillPath")) changed("skillPath");
  if (hasKey(cfg, "extensions")) changed("extensions");
  if (hasKey(cfg, "subagentOnlyExtensions")) changed("subagentOnlyExtensions");
  if (hasKey(cfg, "mutationTools")) changed("mutationTools");
  if (hasKey(cfg, "thinking")) {
    changed("thinking");
    if (cfg.thinking === "off") fields.add("thinking");
  }
  if (hasKey(cfg, "systemPromptMode")) {
    changed("systemPromptMode");
    fields.add("systemPromptMode");
  }
  if (hasKey(cfg, "inheritProjectContext")) {
    changed("inheritProjectContext");
    fields.add("inheritProjectContext");
  }
  if (hasKey(cfg, "inheritGlobalContext")) {
    changed("inheritGlobalContext");
    fields.add("inheritGlobalContext");
  }
  if (hasKey(cfg, "inheritSkills")) {
    changed("inheritSkills");
    fields.add("inheritSkills");
  }
  if (hasKey(cfg, "defaultContext")) changed("defaultContext");
  if (hasKey(cfg, "async")) changed("async");
  if (hasKey(cfg, "timeoutMs")) changed("timeoutMs");
  if (hasKey(cfg, "acceptance")) changed("acceptance");
  if (hasKey(cfg, "acceptanceRole")) changed("acceptanceRole");
  if (hasKey(cfg, "output")) changed("output");
  if (hasKey(cfg, "outputMode")) changed("outputMode");
  if (hasKey(cfg, "reads")) changed("defaultReads");
  if (hasKey(cfg, "progress")) changed("defaultProgress");
  if (hasKey(cfg, "maxSubagentDepth")) changed("maxSubagentDepth");
  if (hasKey(cfg, "toolBudget")) changed("toolBudget");
  return fields;
}
function parseTools(raw) {
  const tools = [];
  const mcpDirectTools = [];
  for (const item of parseCsv(raw)) {
    if (item.startsWith("mcp:")) {
      const direct = item.slice(4).trim();
      if (direct) mcpDirectTools.push(direct);
    } else tools.push(item);
  }
  return {
    ...tools.length ? { tools } : {},
    ...mcpDirectTools.length ? { mcpDirectTools } : {}
  };
}
function applyAgentConfig(target, cfg) {
  if (hasKey(cfg, "advertise")) {
    if (cfg.advertise === "") delete target.advertise;
    else if (typeof cfg.advertise === "boolean") target.advertise = cfg.advertise;
    else return "config.advertise must be a boolean or empty string when provided.";
  }
  if (hasKey(cfg, "aliases")) {
    if (cfg.aliases === false || cfg.aliases === "") delete target.aliases;
    else if (typeof cfg.aliases === "string") {
      const aliases = parseCsv(cfg.aliases).filter((alias) => alias !== target.name);
      if (aliases.length) target.aliases = aliases;
      else delete target.aliases;
    } else if (Array.isArray(cfg.aliases) && cfg.aliases.every((entry) => typeof entry === "string")) {
      const aliases = [...new Set(cfg.aliases.map((entry) => entry.trim()).filter(Boolean).filter((alias) => alias !== target.name))];
      if (aliases.length) target.aliases = aliases;
      else delete target.aliases;
    } else return "config.aliases must be a comma-separated string, string array, or false when provided.";
  }
  if (hasKey(cfg, "systemPrompt")) {
    if (cfg.systemPrompt === false || cfg.systemPrompt === "") target.systemPrompt = "";
    else if (typeof cfg.systemPrompt === "string") target.systemPrompt = cfg.systemPrompt;
    else return "config.systemPrompt must be a string or false when provided.";
  }
  if (hasKey(cfg, "runner")) {
    if (cfg.runner === false || cfg.runner === "") delete target.runner;
    else if (cfg.runner && typeof cfg.runner === "object" && !Array.isArray(cfg.runner)) {
      const runner = cfg.runner;
      if (runner.type === "pi" && Object.keys(runner).every((key) => key === "type")) target.runner = { type: "pi" };
      else if (runner.type === "external-cli" && typeof runner.command === "string" && runner.command.trim() && (runner.args === void 0 || Array.isArray(runner.args) && runner.args.every((arg) => typeof arg === "string")) && (runner.adapter === void 0 || isCodeOwnedExternalCliAdapterId(runner.adapter)) && (runner.adapter === void 0 || runner.args === void 0 || runner.args.length === 0) && (runner.promptDelivery === void 0 || runner.promptDelivery === "stdin") && Object.keys(runner).every((key) => ["type", "adapter", "command", "args", "promptDelivery"].includes(key))) {
        const runnerArgs = Array.isArray(runner.args) ? runner.args.filter((arg) => typeof arg === "string") : void 0;
        target.runner = { type: "external-cli", ...isCodeOwnedExternalCliAdapterId(runner.adapter) ? { adapter: runner.adapter } : {}, command: runner.command.trim(), ...runnerArgs?.length ? { args: runnerArgs } : {}, ...runner.promptDelivery ? { promptDelivery: "stdin" } : {} };
      } else if (runner.type === "external-job" && typeof runner.provider === "string" && runner.provider.trim() === runner.provider && runner.provider && (runner.options === void 0 || runner.options && typeof runner.options === "object" && !Array.isArray(runner.options) && isJsonSerializable(runner.options)) && Object.keys(runner).every((key) => ["type", "provider", "options"].includes(key))) {
        target.runner = { type: "external-job", provider: runner.provider, ...runner.options ? { options: runner.options } : {} };
      } else return `config.runner must be { type: 'pi' }, { type: 'external-cli', adapter?: ${CODE_OWNED_EXTERNAL_CLI_ADAPTER_LABEL}, command: string, args?: string[], promptDelivery?: 'stdin' }, or { type: 'external-job', provider: string, options?: object }.`;
    } else return "config.runner must be an object, false, or empty string when provided.";
  }
  if (hasKey(cfg, "launcher")) return "config.launcher is not supported by agent management; edit the agent file's 'launcher' frontmatter directly.";
  if (target.launcher && (target.runner?.type === "external-cli" || target.runner?.type === "external-job")) {
    return `config.runner type '${target.runner.type}' cannot be combined with this agent's 'launcher' frontmatter.`;
  }
  if (hasKey(cfg, "model")) {
    if (cfg.model === false || cfg.model === "") delete target.model;
    else if (typeof cfg.model === "string") {
      const model = cfg.model.trim();
      if (model) target.model = model;
      else delete target.model;
    } else return "config.model must be a string or false when provided.";
  }
  if (hasKey(cfg, "fallbackModels")) return "config.fallbackModels was removed; configure one model instead.";
  if (hasKey(cfg, "tools")) {
    if (cfg.tools === false || cfg.tools === "") {
      delete target.tools;
      delete target.mcpDirectTools;
    } else if (typeof cfg.tools === "string") {
      const parsed = parseTools(cfg.tools);
      if (parsed.tools) target.tools = parsed.tools;
      else delete target.tools;
      if (parsed.mcpDirectTools) target.mcpDirectTools = parsed.mcpDirectTools;
      else delete target.mcpDirectTools;
    } else return "config.tools must be a comma-separated string or false when provided.";
  }
  if (hasKey(cfg, "excludeTools")) {
    if (cfg.excludeTools === false || cfg.excludeTools === "") delete target.excludeTools;
    else if (typeof cfg.excludeTools === "string") {
      const excludeTools = parseCsv(cfg.excludeTools);
      if (excludeTools.length) target.excludeTools = [...new Set(excludeTools)];
      else delete target.excludeTools;
    } else if (Array.isArray(cfg.excludeTools) && cfg.excludeTools.every((entry) => typeof entry === "string")) {
      const excludeTools = [...new Set(cfg.excludeTools.map((entry) => entry.trim()).filter(Boolean))];
      if (excludeTools.length) target.excludeTools = excludeTools;
      else delete target.excludeTools;
    } else return "config.excludeTools must be a comma-separated string, string array, or false when provided.";
  }
  if (hasKey(cfg, "skills")) {
    if (cfg.skills === false || cfg.skills === "") delete target.skills;
    else if (typeof cfg.skills === "string") {
      const skills = parseCsv(cfg.skills);
      if (skills.length) target.skills = skills;
      else delete target.skills;
    } else return "config.skills must be a comma-separated string or false when provided.";
  }
  if (hasKey(cfg, "skillPath")) {
    if (cfg.skillPath === false || cfg.skillPath === "") delete target.skillPath;
    else if (typeof cfg.skillPath === "string") {
      const skillPath = parseCsv(cfg.skillPath);
      if (skillPath.length) target.skillPath = skillPath;
      else delete target.skillPath;
    } else if (Array.isArray(cfg.skillPath) && cfg.skillPath.every((entry) => typeof entry === "string")) {
      const skillPath = [...new Set(cfg.skillPath.map((entry) => entry.trim()).filter(Boolean))];
      if (skillPath.length) target.skillPath = skillPath;
      else delete target.skillPath;
    } else return "config.skillPath must be a comma-separated string, string array, or false when provided.";
  }
  if (hasKey(cfg, "extensions")) {
    if (cfg.extensions === false) delete target.extensions;
    else if (cfg.extensions === "") target.extensions = [];
    else if (typeof cfg.extensions === "string") target.extensions = parseCsv(cfg.extensions);
    else return "config.extensions must be a comma-separated string, empty string, or false when provided.";
  }
  if (hasKey(cfg, "subagentOnlyExtensions")) {
    if (cfg.subagentOnlyExtensions === false) delete target.subagentOnlyExtensions;
    else if (cfg.subagentOnlyExtensions === "") target.subagentOnlyExtensions = [];
    else if (typeof cfg.subagentOnlyExtensions === "string") target.subagentOnlyExtensions = parseCsv(cfg.subagentOnlyExtensions);
    else return "config.subagentOnlyExtensions must be a comma-separated string, empty string, or false when provided.";
  }
  if (hasKey(cfg, "mutationTools")) {
    if (cfg.mutationTools === false) delete target.mutationTools;
    else if (cfg.mutationTools === "") target.mutationTools = [];
    else if (typeof cfg.mutationTools === "string") target.mutationTools = parseCsv(cfg.mutationTools);
    else return "config.mutationTools must be a comma-separated string, empty string, or false when provided.";
  }
  if (hasKey(cfg, "thinking")) {
    if (cfg.thinking === false || cfg.thinking === "") delete target.thinking;
    else if (typeof cfg.thinking === "string") {
      const thinking = cfg.thinking.trim();
      if (thinking) target.thinking = thinking;
      else delete target.thinking;
    } else return "config.thinking must be a string or false when provided.";
  }
  if (hasKey(cfg, "systemPromptMode")) {
    if (cfg.systemPromptMode === "append" || cfg.systemPromptMode === "replace") target.systemPromptMode = cfg.systemPromptMode;
    else return "config.systemPromptMode must be 'append' or 'replace' when provided.";
  }
  if (hasKey(cfg, "inheritProjectContext")) {
    if (typeof cfg.inheritProjectContext !== "boolean") return "config.inheritProjectContext must be a boolean when provided.";
    target.inheritProjectContext = cfg.inheritProjectContext;
  }
  if (hasKey(cfg, "inheritGlobalContext")) {
    if (typeof cfg.inheritGlobalContext !== "boolean") return "config.inheritGlobalContext must be a boolean when provided.";
    target.inheritGlobalContext = cfg.inheritGlobalContext;
  }
  if (hasKey(cfg, "inheritSkills")) {
    if (typeof cfg.inheritSkills !== "boolean") return "config.inheritSkills must be a boolean when provided.";
    target.inheritSkills = cfg.inheritSkills;
  }
  if (hasKey(cfg, "defaultContext")) {
    if (cfg.defaultContext === false || cfg.defaultContext === "") delete target.defaultContext;
    else if (cfg.defaultContext === "fresh" || cfg.defaultContext === "fork") target.defaultContext = cfg.defaultContext;
    else return "config.defaultContext must be 'fresh', 'fork', or false when provided.";
  }
  if (hasKey(cfg, "async")) {
    if (cfg.async === "") delete target.defaultAsync;
    else if (typeof cfg.async === "boolean") target.defaultAsync = cfg.async;
    else return "config.async must be a boolean or empty string when provided.";
  }
  if (hasKey(cfg, "timeoutMs")) {
    if (cfg.timeoutMs === false || cfg.timeoutMs === "") delete target.defaultTimeoutMs;
    else if (typeof cfg.timeoutMs === "number" && Number.isInteger(cfg.timeoutMs) && cfg.timeoutMs > 0) target.defaultTimeoutMs = cfg.timeoutMs;
    else return "config.timeoutMs must be a positive integer or false when provided.";
  }
  if (hasKey(cfg, "acceptance")) {
    if (cfg.acceptance === "") delete target.defaultAcceptance;
    else {
      const errors = validateAcceptanceInput(cfg.acceptance, "config.acceptance");
      if (errors.length > 0) return errors.join(" ");
      target.defaultAcceptance = cfg.acceptance;
    }
  }
  if (hasKey(cfg, "acceptanceRole")) {
    if (cfg.acceptanceRole === false || cfg.acceptanceRole === "") delete target.acceptanceRole;
    else if (cfg.acceptanceRole === "read-only" || cfg.acceptanceRole === "writer") target.acceptanceRole = cfg.acceptanceRole;
    else return "config.acceptanceRole must be 'read-only', 'writer', or false when provided.";
  }
  if (hasKey(cfg, "output")) {
    if (cfg.output === false || cfg.output === "") delete target.output;
    else if (typeof cfg.output === "string") target.output = cfg.output;
    else return "config.output must be a string or false when provided.";
  }
  if (hasKey(cfg, "outputMode")) {
    if (cfg.outputMode === "inline" || cfg.outputMode === "file-only") target.outputMode = cfg.outputMode;
    else return "config.outputMode must be 'inline' or 'file-only' when provided.";
  }
  if (hasKey(cfg, "reads")) {
    if (cfg.reads === false || cfg.reads === "") delete target.defaultReads;
    else if (typeof cfg.reads === "string") {
      const reads = parseCsv(cfg.reads);
      if (reads.length) target.defaultReads = reads;
      else delete target.defaultReads;
    } else return "config.reads must be a comma-separated string or false when provided.";
  }
  if (hasKey(cfg, "progress")) {
    if (typeof cfg.progress !== "boolean") return "config.progress must be a boolean when provided.";
    target.defaultProgress = cfg.progress;
  }
  if (hasKey(cfg, "maxSubagentDepth")) {
    if (cfg.maxSubagentDepth === false || cfg.maxSubagentDepth === "") delete target.maxSubagentDepth;
    else if (typeof cfg.maxSubagentDepth === "number" && Number.isInteger(cfg.maxSubagentDepth) && cfg.maxSubagentDepth >= 0) {
      target.maxSubagentDepth = cfg.maxSubagentDepth;
    } else return "config.maxSubagentDepth must be an integer >= 0 or false when provided.";
  }
  if (hasKey(cfg, "toolBudget")) {
    if (cfg.toolBudget === false || cfg.toolBudget === "") delete target.toolBudget;
    else {
      const validation = validateToolBudgetConfig(cfg.toolBudget, "config.toolBudget");
      if (validation.error) return validation.error;
      target.toolBudget = cfg.toolBudget;
    }
  }
  if (target.runner?.type === "external-cli" || target.runner?.type === "external-job") {
    const unsupported = [
      target.tools?.length || target.mcpDirectTools?.length ? "tools" : void 0,
      target.excludeTools?.length ? "excludeTools" : void 0,
      target.model ? "model" : void 0,
      target.thinking ? "thinking" : void 0,
      target.extensions?.length ? "extensions" : void 0,
      target.subagentOnlyExtensions?.length ? "subagentOnlyExtensions" : void 0,
      target.mutationTools?.length ? "mutationTools" : void 0,
      target.skills?.length || target.skillPath?.length ? "skills" : void 0,
      target.maxSubagentDepth !== void 0 ? "maxSubagentDepth" : void 0,
      target.toolBudget ? "toolBudget" : void 0
    ].filter((field) => Boolean(field));
    if (unsupported.length > 0) return `config.runner type '${target.runner.type}' does not support Pi-only fields: ${unsupported.join(", ")}.`;
  }
  return void 0;
}
function resolveTarget(name, matches, cwd, ctx, scopeHint) {
  const distinctNames = [...new Set(matches.map((match) => match.name))];
  if (distinctNames.length > 1) return result4(`Ambiguous agent alias or name '${name}': ${distinctNames.sort((a, b) => a.localeCompare(b)).join(", ")}`, true);
  const mutable = matches.filter((match) => isMutableSource(match.source));
  if (mutable.length === 0) {
    if (matches.length > 0) return result4(`Agent '${name}' is read-only and cannot be modified. Create a same-named agent in user or project scope to override it.`, true);
    return result4(`Agent '${name}' not found. Available: ${availableAgentNames(ctx, cwd).join(", ") || "none"}.`, true);
  }
  if (mutable.length === 1) return mutable[0];
  const scope = asDisambiguationScope(scopeHint);
  if (!scope) {
    const paths = mutable.map((match) => `${match.source}: ${match.filePath}`).join("\n");
    return result4(`Agent '${name}' exists in both scopes. Specify agentScope: 'user' or 'project'.
${paths}`, true);
  }
  const scoped = mutable.filter((match) => match.source === scope);
  if (scoped.length === 0) return result4(`Agent '${name}' not found in scope '${scope}'.`, true);
  if (scoped.length > 1) return result4(`Multiple agents named '${name}' found in scope '${scope}': ${scoped.map((match) => match.filePath).join(", ")}`, true);
  return scoped[0];
}
function renamePath(currentPath, newName, scope, ctx) {
  if (nameExistsInScope(ctx, scope, newName, currentPath)) return { error: `Name '${newName}' already exists in ${scope} scope.` };
  const filePath = path6.join(path6.dirname(currentPath), `${newName}.md`);
  if (fs7.existsSync(filePath) && filePath !== currentPath) return { error: `File already exists at ${filePath} but is not a valid agent definition. Remove or rename it first.` };
  fs7.renameSync(currentPath, filePath);
  return { filePath };
}
function packageSourceLabel(agent) {
  if (!agent.packageSourceName) return agent.source;
  return agent.packageSourceVersion ? `${agent.packageSourceName}@${agent.packageSourceVersion}` : agent.packageSourceName;
}
function errorMessage(error2) {
  return error2 instanceof Error ? error2.message : String(error2);
}
function registeredExternalJobProviderStatus() {
  try {
    return { ok: true, names: new Set(listExternalJobProviders().map((provider) => provider.name)) };
  } catch (error2) {
    return { ok: false, error: errorMessage(error2) };
  }
}
function externalJobProviderSuffix(provider, names) {
  if (!names) return "?";
  return names.has(provider) ? "\u2713" : "missing";
}
function externalCliAvailabilityKey(command, machine) {
  return machine ? `ssh@${machine}` : command;
}
function externalCliAvailabilityForAgents(agents) {
  const availability = /* @__PURE__ */ new Map();
  for (const agent of agents) {
    const runner = agent.runner;
    if (runner?.type !== "external-cli") continue;
    const key = externalCliAvailabilityKey(runner.command, agent.machine);
    if (availability.has(key)) continue;
    availability.set(key, resolveExternalCliBinaryAvailability(agent.machine ? "ssh" : runner.command, process.env));
  }
  return availability;
}
function runnerListBadge(agent, providerNames2, externalCliAvailability) {
  if (agent.runner?.type === "external-job") return `external-job:${agent.runner.provider} ${externalJobProviderSuffix(agent.runner.provider, providerNames2)}`;
  if (agent.runner?.type === "external-cli") {
    const placed = agent.machine ? `${agent.runner.command} @ ${agent.machine}` : agent.runner.command;
    const availability = externalCliAvailability?.get(externalCliAvailabilityKey(agent.runner.command, agent.machine));
    if (!availability) return `external-cli:${placed}`;
    if (agent.machine) return `external-cli:${placed} saved Herdr placement; transport ${availability.available ? "\u2713" : "missing"}; machine not preflighted`;
    return `external-cli:${placed} ${availability.available ? "\u2713" : "missing"}`;
  }
  if (agent.machine) return `machine: ${agent.machine} (saved Herdr placement)`;
  return void 0;
}
function agentListMetadata(agent, providerNames2, externalCliAvailability) {
  const source = agent.source === "package" ? packageSourceLabel(agent) : agent.source;
  return [
    source,
    runnerListBadge(agent, providerNames2, externalCliAvailability),
    agent.defaultContext ? `context: ${agent.defaultContext}` : void 0,
    agent.aliases?.length ? `aliases: ${agent.aliases.join(", ")}` : void 0
  ].filter((part) => Boolean(part)).join(", ");
}
function formatAgentListLine(agent, providerNames2) {
  return `- ${agent.name} (${agentListMetadata(agent, providerNames2)}): ${agent.description}`;
}
function formatAgentCapabilitiesLine(agent, providerNames2, externalCliAvailability) {
  const declaredTools = [
    ...agent.tools ?? [],
    ...(agent.mcpDirectTools ?? []).map((tool) => `mcp:${tool}`)
  ];
  let tools = "none";
  if (agent.tools === void 0 && agent.mcpDirectTools === void 0) {
    tools = "default/ambient";
  } else if (declaredTools.length > 0) {
    tools = declaredTools.join(", ");
  }
  if (agent.excludeTools?.length) tools = `${tools}; excludes: ${agent.excludeTools.join(", ")}`;
  let model = "inherits current session";
  if (agent.model !== void 0) {
    model = agent.model;
    if (agent.modelProvider && !agent.model.includes("/")) model = `${agent.modelProvider}/${agent.model}`;
  }
  const thinking = agent.thinking === false ? "off" : agent.thinking ?? "default";
  const machine = agent.machine ? `; Machine: ${agent.machine} (saved Herdr placement)` : "";
  const acceptance = formatAcceptanceSummary(agent);
  return `- ${agent.name} (${agentListMetadata(agent, providerNames2, externalCliAvailability)}): Description: ${previewDisplayText(agent.description, 240)}; Tools: ${tools}; Model: ${model}; Thinking: ${thinking}${machine}${acceptance ? `; ${acceptance}` : ""}`;
}
function formatAcceptanceSummary(agent) {
  const policy = agent.defaultAcceptance;
  const summary = [];
  if (policy === false) summary.push("Acceptance: disabled");
  else if (typeof policy === "string") summary.push(`Acceptance: ${policy}`);
  else if (policy) {
    const modifiers = [
      ...policy.evidence ?? [],
      ...(policy.verify ?? []).map((command) => `verify: ${formatAcceptanceDisplayLabel(command.id)}`),
      ...policy.criteria?.length ? [`criteria: ${policy.criteria.length}`] : [],
      ...policy.stopRules?.length ? [`stopRules: ${policy.stopRules.length}`] : []
    ];
    if (policy.review === false) modifiers.push("review: off");
    else if (policy.review) {
      const displayReview = policy.review.agent ? { ...policy.review, agent: formatAcceptanceDisplayLabel(policy.review.agent) } : policy.review;
      modifiers.push(`review: ${formatReviewGateLabel(displayReview)}`);
    }
    if (policy.report) modifiers.push(`report: ${policy.report}`);
    summary.push(`Acceptance: ${policy.level ?? "auto"}${modifiers.length > 0 ? ` (${modifiers.join(", ")})` : ""}`);
  }
  if (agent.acceptanceRole) summary.push(`Acceptance role: ${agent.acceptanceRole}`);
  return summary.length > 0 ? summary.join("; ") : void 0;
}
function formatAcceptanceDisplayLabel(value) {
  return JSON.stringify(previewDisplayText(value, 80));
}
var EXTERNAL_JOB_CAPABILITIES = { stop: false, steer: false, resume: false, structuredOutput: false, toolEvents: false };
var PI_AGENT_RUNNER = { type: "pi" };
function listOrEmpty(values) {
  return values ?? [];
}
function agentCapabilityRunner(agent, providerNames2, externalCliAvailability) {
  const runner = agent.runner;
  if (!runner || runner.type === "pi") return PI_AGENT_RUNNER;
  if (runner.type === "external-cli") {
    const availability = externalCliAvailability.get(externalCliAvailabilityKey(runner.command, agent.machine));
    return {
      type: "external-cli",
      adapter: runner.adapter,
      command: runner.command,
      ...agent.machine ? { machine: agent.machine } : {},
      ...availability,
      capabilities: resolveExternalCliRunnerStatus(runner).capabilities
    };
  }
  return { type: "external-job", provider: runner.provider, available: providerNames2?.has(runner.provider), capabilities: EXTERNAL_JOB_CAPABILITIES };
}
function agentCapabilityTools(agent) {
  return {
    ambient: agent.tools === void 0 && agent.mcpDirectTools === void 0,
    names: listOrEmpty(agent.tools),
    ...agent.excludeTools !== void 0 ? { excludeTools: [...agent.excludeTools] } : {},
    mcpDirectTools: listOrEmpty(agent.mcpDirectTools),
    mutationTools: agent.mutationTools
  };
}
function agentCapabilityRow(agent, options) {
  return {
    name: agent.name,
    description: previewDisplayText(agent.description, 1e3),
    source: agent.source,
    executable: options.executable,
    restrictionSources: options.executable ? void 0 : options.restrictionSources ?? [],
    aliases: agent.aliases ? [...agent.aliases] : void 0,
    runner: agentCapabilityRunner(agent, options.providerNames, options.externalCliAvailability),
    tools: agentCapabilityTools(agent),
    model: presentDetails({ value: agent.model, thinking: agent.thinking }),
    execution: presentDetails({ defaultAsync: agent.defaultAsync, timeoutMs: agent.defaultTimeoutMs }),
    acceptance: presentDetails({ policy: agent.defaultAcceptance, role: agent.acceptanceRole }),
    output: presentDetails({ path: agent.output, mode: agent.outputMode }),
    extensions: presentDetails({ names: agent.extensions, subagentOnly: agent.subagentOnlyExtensions, skills: agent.skills })
  };
}
function agentCapabilitiesSnapshot(input) {
  return {
    agents: [
      ...input.agents.map((agent) => agentCapabilityRow(agent, { executable: true, providerNames: input.providerNames, externalCliAvailability: input.externalCliAvailability })),
      ...input.restrictedAgents.map((agent) => agentCapabilityRow(agent, { executable: false, providerNames: input.providerNames, externalCliAvailability: input.externalCliAvailability, restrictionSources: input.restrictedSources }))
    ],
    restrictedCount: input.restrictedAgents.length,
    ...input.restrictedSources?.length ? { capabilityCeilingSources: [...input.restrictedSources] } : {}
  };
}
function providerNames(status) {
  return status.ok ? status.names : void 0;
}
function appendRestrictedAgentLines(input) {
  if (input.agents.length === 0) return;
  input.lines.push(
    "",
    `Restricted agents (not executable in this session${input.sources?.length ? `; capability ceiling: ${input.sources.join(", ")}` : ""}):`,
    ...input.agents.map((agent) => input.formatLine(agent, input.providerNames))
  );
}
function appendExternalJobRegistryLine(lines, agents, status) {
  if (status.ok || !agents.some((agent) => agent.runner?.type === "external-job")) return;
  lines.push("", `External-job provider registry unavailable: ${status.error}`);
}
function appendAgentDiagnosticLines(lines, diagnostics) {
  if (!diagnostics?.length) return;
  lines.push(
    "",
    "Invalid agent definitions:",
    ...diagnostics.map((diagnostic) => `- ${diagnostic.name ?? diagnostic.filePath} (${diagnostic.source}): ${diagnostic.error}`)
  );
}
function agentCapabilityDetails(input) {
  if (!input.capabilityMode) return void 0;
  return {
    agentCapabilities: jsonDetails(agentCapabilitiesSnapshot({
      agents: input.agents,
      restrictedAgents: input.restrictedAgents,
      providerNames: input.providerNames,
      externalCliAvailability: input.externalCliAvailability,
      restrictedSources: input.restrictedSources
    }))
  };
}
function formatAgentListSections(agents, providerNames2, formatLine = formatAgentListLine) {
  if (agents.length === 0) return ["- (none)"];
  const sections = [
    ["package", "Package agents"],
    ["user", "User agents"],
    ["project", "Project agents"],
    ["runtime", "Runtime agents"],
    ["builtin", "Builtin agents"]
  ];
  const lines = [];
  for (const [source, label] of sections) {
    const matches = agents.filter((agent) => agent.source === source);
    if (matches.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(label, ...matches.map((agent) => formatLine(agent, providerNames2)));
  }
  return lines;
}
function formatRunnerDetail(agent, providerNames2) {
  if (!agent.runner) return void 0;
  if (agent.runner.type === "external-job") return `Runner: external-job via ${agent.runner.provider} ${externalJobProviderSuffix(agent.runner.provider, providerNames2)}`;
  if (agent.runner.type === "external-cli") return `Runner: external-cli ${agent.runner.command}`;
  return `Runner: ${JSON.stringify(agent.runner)}`;
}
function formatAgentDetail(agent) {
  const tools = [...agent.tools ?? [], ...(agent.mcpDirectTools ?? []).map((t) => `mcp:${t}`)];
  const providerStatus = registeredExternalJobProviderStatus();
  const lines = [`Agent: ${agent.name} (${agent.source})`, `Path: ${agent.filePath}`, `Description: ${agent.description}`];
  if (agent.source === "package" && agent.packageSourceName) {
    lines.push(`Source package: ${packageSourceLabel(agent)}`);
    if (agent.packageSourceRoot) lines.push(`Package root: ${agent.packageSourceRoot}`);
  }
  if (agent.packageName) {
    lines.push(`Local name: ${frontmatterNameForConfig(agent)}`);
    lines.push(`Package: ${agent.packageName}`);
  }
  if (agent.aliases?.length) lines.push(`Aliases: ${agent.aliases.join(", ")}`);
  if (agent.model) lines.push(`Model: ${agent.model}`);
  if (tools.length) lines.push(`Tools: ${tools.join(", ")}`);
  if (agent.excludeTools?.length) lines.push(`Excluded tools: ${agent.excludeTools.join(", ")}`);
  if (agent.skills?.length) lines.push(`Skills: ${agent.skills.join(", ")}`);
  if (agent.skillPath?.length) lines.push(`Skill paths: ${agent.skillPath.join(", ")}`);
  lines.push(`System prompt mode: ${agent.systemPromptMode}`);
  const runnerDetail = formatRunnerDetail(agent, providerStatus.ok ? providerStatus.names : void 0);
  if (runnerDetail) {
    lines.push(runnerDetail);
    if (agent.runner?.type === "external-job" && !providerStatus.ok) lines.push(`External-job provider registry unavailable: ${providerStatus.error}`);
    if (agent.runner?.type === "external-job" && agent.runner.options) lines.push(`Runner options: ${JSON.stringify(agent.runner.options)}`);
  }
  lines.push(`Inherit project context: ${agent.inheritProjectContext ? "true" : "false"}`);
  lines.push(`Inherit global context: ${agent.inheritGlobalContext ? "true" : "false"}`);
  lines.push(`Inherit skills: ${agent.inheritSkills ? "true" : "false"}`);
  if (agent.defaultContext) lines.push(`Default context: ${agent.defaultContext}`);
  if (agent.defaultAsync !== void 0) lines.push(`Async: ${agent.defaultAsync ? "true" : "false"}`);
  if (agent.defaultTimeoutMs !== void 0) lines.push(`Timeout: ${agent.defaultTimeoutMs}ms`);
  if (agent.defaultAcceptance !== void 0) lines.push(`Acceptance: ${typeof agent.defaultAcceptance === "object" ? JSON.stringify(agent.defaultAcceptance) : String(agent.defaultAcceptance)}`);
  if (agent.acceptanceRole) lines.push(`Acceptance role: ${agent.acceptanceRole}`);
  if (agent.source === "builtin") lines.push(`Disabled: ${agent.disabled ? "true" : "false"}`);
  if (agent.extensions !== void 0) lines.push(`Extensions: ${agent.extensions.length ? agent.extensions.join(", ") : "(none)"}`);
  if (agent.subagentOnlyExtensions !== void 0) lines.push(`Subagent-only extensions: ${agent.subagentOnlyExtensions.length ? agent.subagentOnlyExtensions.join(", ") : "(none)"}`);
  if (agent.mutationTools !== void 0) lines.push(`Mutation tools: ${agent.mutationTools.length ? agent.mutationTools.join(", ") : "(none)"}`);
  if (agent.thinking) lines.push(`Thinking: ${agent.thinking}`);
  if (agent.output) lines.push(`Output: ${agent.output}`);
  if (agent.outputMode) lines.push(`Output mode: ${agent.outputMode}`);
  if (agent.defaultReads?.length) lines.push(`Reads: ${agent.defaultReads.join(", ")}`);
  if (agent.defaultProgress) lines.push("Progress: true");
  if (agent.maxSubagentDepth !== void 0) lines.push(`Max subagent depth: ${agent.maxSubagentDepth}`);
  if (agent.toolBudget) lines.push(`Tool budget: ${JSON.stringify(agent.toolBudget)}`);
  if (agent.memory) lines.push(`Memory: ${agent.memory.scope} scope, path: ${agent.memory.path}`);
  if (agent.systemPrompt.trim()) lines.push("", "System Prompt:", agent.systemPrompt);
  return lines.join("\n");
}
function handleList(params, ctx) {
  const scope = normalizeListScope(params.agentScope) ?? "both";
  const d = discoverCatalog(ctx, ctx.cwd, ctx.model?.provider);
  let scopedAgents = effectiveAgentsForScope(scope, d, ctx.runtimeAgentOwner, ctx.model?.provider);
  scopedAgents = scopedAgents.sort((a, b) => a.name.localeCompare(b.name));
  const capabilityCeiling = resolveCurrentSubagentCapabilityCeiling(ctx.currentSessionId);
  const visibleAgents = scopedAgents.filter((a) => !a.disabled);
  const agents = visibleAgents.filter((a) => isAgentAllowedByCapabilityCeiling(a.name, capabilityCeiling));
  const restrictedAgents = visibleAgents.filter((a) => !isAgentAllowedByCapabilityCeiling(a.name, capabilityCeiling));
  const restrictedSources = capabilityCeilingAgentRestrictionSources(capabilityCeiling);
  const proactiveSuggestions = buildProactiveSkillSubagentRecommendationLines({
    agents,
    ...ctx.config?.proactiveSkillSubagents !== void 0 ? { config: ctx.config.proactiveSkillSubagents } : {},
    discoverAvailableSkills: () => discoverAvailableSkills(ctx.cwd)
  });
  const providerStatus = registeredExternalJobProviderStatus();
  const providerNameSet = providerNames(providerStatus);
  const capabilityMode = params.capabilities === true;
  const externalCliAvailability = capabilityMode ? externalCliAvailabilityForAgents([...agents, ...restrictedAgents]) : void 0;
  const formatLine = capabilityMode ? (agent, names) => formatAgentCapabilitiesLine(agent, names, externalCliAvailability) : formatAgentListLine;
  const lines = [
    capabilityMode ? "Executable agents (capabilities):" : "Executable agents:",
    ...formatAgentListSections(agents, providerNameSet, formatLine)
  ];
  appendRestrictedAgentLines({ lines, agents: restrictedAgents, sources: restrictedSources, providerNames: providerNameSet, formatLine });
  appendExternalJobRegistryLine(lines, [...agents, ...restrictedAgents], providerStatus);
  appendAgentDiagnosticLines(lines, d.agentDiagnostics);
  if (proactiveSuggestions.length) lines.push("", ...proactiveSuggestions);
  return result4(lines.join("\n"), false, agentCapabilityDetails({
    capabilityMode,
    agents,
    restrictedAgents,
    providerNames: providerNameSet,
    externalCliAvailability: externalCliAvailability ?? /* @__PURE__ */ new Map(),
    restrictedSources
  }));
}
function formatModelSource(agent, currentModel) {
  if (agent.override && agent.model !== agent.override.base.model) {
    return `${agent.override.scope} override`;
  }
  if (agent.modelSource?.type === "subagents.defaultModel" && agent.model === agent.modelSource.model) {
    return `${agent.modelSource.scope} defaultModel`;
  }
  if (agent.model) return `${agent.source} agent config`;
  if (currentModel) return "inherits current session model";
  return "inherit requested, but no current session model is available";
}
function handleModels(params, ctx) {
  const requestedAgent = params.agent?.trim();
  const scope = normalizeListScope(params.agentScope);
  if (!scope) return result4("agentScope must be 'user', 'project', or 'both' for models.", true);
  const discovered = discoverCatalog(ctx, ctx.cwd, ctx.model?.provider);
  const effectiveAgents = effectiveAgentsForScope(scope, discovered, ctx.runtimeAgentOwner, ctx.model?.provider).sort((a, b) => a.name.localeCompare(b.name));
  const availableModels = ctx.modelRegistry.getAvailable().map(toModelInfo);
  const currentModel = ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : void 0;
  const preferredProvider = ctx.model?.provider;
  const capabilityCeiling = resolveCurrentSubagentCapabilityCeiling(ctx.currentSessionId);
  let selectedAgents = effectiveAgents;
  if (requestedAgent) {
    const matches = findAgentsInDiscovery(requestedAgent, discovered, scope, ctx.runtimeAgentOwner, ctx.model?.provider);
    const diagnostics = diagnosticsForScope(discovered.agentDiagnostics, scope);
    const normalizedName = sanitizeName(requestedAgent);
    const diagnostic = findBlockingAgentDiagnostic(requestedAgent, matches, diagnostics) ?? (normalizedName !== requestedAgent ? findBlockingAgentDiagnostic(normalizedName, matches, diagnostics) : void 0);
    if (diagnostic) return result4(`Agent '${params.agent}' has invalid configuration: ${diagnostic.error}`, true);
    const distinctNames = [...new Set(matches.map((agent) => agent.name))];
    if (distinctNames.length > 1) return result4(`Ambiguous agent alias or name '${params.agent}': ${distinctNames.sort((a, b) => a.localeCompare(b)).join(", ")}`, true);
    if (!matches.length) {
      return result4(`Agent '${params.agent}' not found. Available: ${availableAgentNamesFromDiscovery(discovered, ctx.runtimeAgentOwner, ctx.model?.provider).join(", ") || "none"}.`, true);
    }
    selectedAgents = [matches[0]];
  }
  const lines = [
    requestedAgent ? "Subagent model" : "Subagent models",
    "",
    ...requestedAgent ? [] : [
      "Current session model:",
      `  ${currentModel ? `${currentModel.provider}/${currentModel.id}` : "(unavailable)"}`,
      ""
    ]
  ];
  const modelEntries = selectedAgents.flatMap((agent) => requestedAgent ? [{ agent, name: requestedAgent }] : [{ agent, name: agent.name }, ...(agent.aliases ?? []).map((name) => ({ agent, name }))]);
  for (const { agent, name } of modelEntries) {
    const resolvedModel = resolveSubagentModelOverride(agent.model, currentModel, availableModels, agent.modelProvider ?? preferredProvider);
    const effectiveThinking = resolveEffectiveThinking(resolvedModel, agent.thinking) ?? (agent.thinking === false ? "off" : void 0);
    const source = `${formatModelSource(agent, currentModel)}${agent.disabled ? "; disabled" : ""}${isAgentAllowedByCapabilityCeiling(agent.name, capabilityCeiling) ? "" : "; restricted"}`;
    if (requestedAgent) {
      lines.push(`Agent: ${requestedAgent}`);
      lines.push("Effective model:");
      lines.push(`  ${resolvedModel ?? "(unresolved)"}`);
      lines.push(`Source: ${source}`);
      lines.push(`Thinking: ${effectiveThinking ?? "default"}`);
      if (agent.override) {
        lines.push("Override file:");
        lines.push(`  ${agent.override.path}`);
      }
      if (agent.model && resolvedModel && agent.model !== resolvedModel) {
        lines.push("Requested model setting:");
        lines.push(`  ${agent.model}`);
      }
      if (agent.disabled) lines.push("Disabled: true");
      if (!isAgentAllowedByCapabilityCeiling(agent.name, capabilityCeiling)) lines.push("Restricted: true");
      lines.push("Current session model:");
      lines.push(`  ${currentModel ? `${currentModel.provider}/${currentModel.id}` : "(unavailable)"}`);
      break;
    }
    lines.push(name);
    lines.push("  model:");
    lines.push(`    ${resolvedModel ?? "(unresolved)"}`);
    lines.push(`  source: ${source}`);
    lines.push(`  thinking: ${effectiveThinking ?? "default"}`);
    if (agent.override) {
      lines.push("  override file:");
      lines.push(`    ${agent.override.path}`);
    }
    if (agent.model && resolvedModel && agent.model !== resolvedModel) {
      lines.push("  requested model setting:");
      lines.push(`    ${agent.model}`);
    }
    lines.push("");
  }
  const availableFullIds = availableModels.map((m) => m.fullId).sort();
  if (!requestedAgent && availableFullIds.length > 0) {
    lines.push("Available models in this session's registry (copy an exact provider/id when passing model):");
    lines.push("");
    const shown = availableFullIds.slice(0, 80);
    for (const fullId of shown) lines.push(`  ${fullId}`);
    if (availableFullIds.length > shown.length) lines.push(`  ... and ${availableFullIds.length - shown.length} more`);
    lines.push("");
    lines.push("Use an exact provider/id from this list when you pass model; bare ids resolve only when unique in the registry.");
  }
  if (!requestedAgent) appendAgentDiagnosticLines(lines, diagnosticsForScope(discovered.agentDiagnostics, scope));
  return result4(lines.join("\n"));
}
function handleGet(params, ctx) {
  if (!params.agent) return result4("Specify 'agent' for get.", true);
  const scope = normalizeListScope(params.agentScope);
  if (!scope) return result4("agentScope must be 'user', 'project', or 'both' for get.", true);
  const discovered = discoverCatalog(ctx, ctx.cwd, ctx.model?.provider);
  const matches = findAgentsInDiscovery(params.agent, discovered, scope);
  const diagnostics = diagnosticsForScope(discovered.agentDiagnostics, scope);
  const rawName = params.agent.trim();
  const normalizedName = sanitizeName(rawName);
  const diagnostic = findBlockingAgentDiagnostic(rawName, matches, diagnostics) ?? (normalizedName !== rawName ? findBlockingAgentDiagnostic(normalizedName, matches, diagnostics) : void 0);
  if (diagnostic) return result4(`Agent '${params.agent}' has invalid configuration: ${diagnostic.error}`, true);
  const distinctNames = [...new Set(matches.map((agent) => agent.name))];
  if (distinctNames.length > 1) return result4(`Ambiguous agent alias or name '${params.agent}': ${distinctNames.sort((a, b) => a.localeCompare(b)).join(", ")}`, true);
  if (!matches.length) {
    return result4(`Agent '${params.agent}' not found. Available: ${availableAgentNamesFromDiscovery(discovered).join(", ") || "none"}.`, true);
  }
  return result4(matches.map(formatAgentDetail).join("\n\n"));
}
function handleCreate(params, ctx) {
  const parsedConfig = configObject(params.config);
  if (parsedConfig.status === "error") return result4(parsedConfig.message, true);
  if (parsedConfig.status === "missing") return result4("config required for create.", true);
  const cfg = parsedConfig.value;
  if (typeof cfg.name !== "string" || !cfg.name.trim()) return result4("config.name is required and must be a non-empty string.", true);
  if (typeof cfg.description !== "string" || !cfg.description.trim()) return result4("config.description is required and must be a non-empty string.", true);
  const name = sanitizeName(cfg.name);
  if (!name) return result4("config.name is invalid after sanitization. Use letters, numbers, spaces, or hyphens.", true);
  const parsedPackage = parsePackageConfig(cfg.package);
  if (parsedPackage.error) return result4(parsedPackage.error, true);
  const runtimeName = buildRuntimeName(name, parsedPackage.packageName);
  const scopeRaw = cfg.scope ?? "user";
  if (scopeRaw !== "user" && scopeRaw !== "project") return result4("config.scope must be 'user' or 'project'.", true);
  const scope = scopeRaw;
  if (hasKey(cfg, "steps")) return result4("Durable chain definitions were removed; use a workflow script or /prompt-workflow for repeatable workflows.", true);
  const d = discoverCatalog(ctx);
  const projectConfigDir = getProjectConfigDir(ctx.cwd);
  const targetDir = scope === "user" ? d.userDir : d.projectDir ?? path6.join(projectConfigDir, "agents");
  fs7.mkdirSync(targetDir, { recursive: true });
  if (nameExistsInScope(ctx, scope, runtimeName)) return result4(`Name '${runtimeName}' already exists in ${scope} scope. Use update instead.`, true);
  const targetPath = path6.join(targetDir, `${runtimeName}.md`);
  if (fs7.existsSync(targetPath)) return result4(`File already exists at ${targetPath} but is not a valid agent definition. Remove or rename it first.`, true);
  const warnings = [];
  if (d.builtin.some((a) => a.name === runtimeName)) warnings.push(`Note: this shadows the builtin agent '${runtimeName}'.`);
  const agent = {
    name: runtimeName,
    localName: name,
    ...parsedPackage.packageName !== void 0 ? { packageName: parsedPackage.packageName } : {},
    description: cfg.description.trim(),
    source: scope,
    filePath: targetPath,
    systemPrompt: "",
    systemPromptMode: defaultSystemPromptMode(name),
    inheritProjectContext: defaultInheritProjectContext(name),
    inheritGlobalContext: false,
    inheritSkills: defaultInheritSkills()
  };
  const applyError = applyAgentConfig(agent, cfg);
  if (applyError) return result4(applyError, true);
  const profileError = validateCodeOwnedProfileRunner(agent);
  if (profileError) return result4(profileError, true);
  const mw = modelWarning(ctx, agent.model);
  if (mw) warnings.push(mw);
  const sw = skillsWarning(ctx.cwd, agent);
  if (sw) warnings.push(sw);
  fs7.writeFileSync(targetPath, serializeAgent(agent), "utf-8");
  ctx.onAgentsChanged?.();
  return result4([`Created agent '${runtimeName}' at ${targetPath}.`, ...warnings].join("\n"));
}
function handleUpdate(params, ctx) {
  if (!params.agent) return result4("Specify 'agent' for update.", true);
  const parsedConfig = configObject(params.config);
  if (parsedConfig.status === "error") return result4(parsedConfig.message, true);
  if (parsedConfig.status === "missing") return result4("config required for update.", true);
  const cfg = parsedConfig.value;
  if (hasKey(cfg, "steps")) return result4("Durable chain definitions were removed; use a workflow script or /prompt-workflow for repeatable workflows.", true);
  const warnings = [];
  const scopeHint = asDisambiguationScope(params.agentScope);
  const targetOrError = resolveTarget(params.agent, findAgents(params.agent, ctx, scopeHint ?? "both"), ctx.cwd, ctx, scopeHint);
  if ("content" in targetOrError) return targetOrError;
  const target = targetOrError;
  if (target.source !== "user" && target.source !== "project") return result4(`Cannot update ${target.source} agent '${target.name}'. Eject it to user or project scope first.`, true);
  let updated;
  try {
    updated = editableAgentConfig(target);
  } catch (error2) {
    const message = error2 instanceof Error ? error2.message : String(error2);
    return result4(`Could not reread agent definition ${target.filePath} before updating '${target.name}': ${message}`, true);
  }
  const oldName = target.name;
  if (hasKey(cfg, "name") && (typeof cfg.name !== "string" || !cfg.name.trim())) return result4("config.name must be a non-empty string when provided.", true);
  if (hasKey(cfg, "description") && (typeof cfg.description !== "string" || !cfg.description.trim())) return result4("config.description must be a non-empty string when provided.", true);
  let newLocalName = target.localName ?? frontmatterNameForConfig(target);
  if (hasKey(cfg, "name")) {
    newLocalName = sanitizeName(cfg.name);
    if (!newLocalName) return result4("config.name is invalid after sanitization.", true);
  }
  let newPackageName = target.packageName;
  if (hasKey(cfg, "package")) {
    const parsedPackage = parsePackageConfig(cfg.package);
    if (parsedPackage.error) return result4(parsedPackage.error, true);
    newPackageName = parsedPackage.packageName;
  }
  const applyError = applyAgentConfig(updated, cfg);
  if (applyError) return result4(applyError, true);
  const preserveFrontmatterFields = preservedAgentFrontmatterFields(target, cfg);
  updated.localName = newLocalName;
  if (newPackageName !== void 0) updated.packageName = newPackageName;
  else delete updated.packageName;
  updated.name = buildRuntimeName(newLocalName, newPackageName);
  const profileError = validateCodeOwnedProfileRunner(updated);
  if (profileError) return result4(profileError, true);
  if (hasKey(cfg, "description")) updated.description = cfg.description.trim();
  if (hasKey(cfg, "model")) {
    const mw = modelWarning(ctx, updated.model);
    if (mw) warnings.push(mw);
  }
  if (hasKey(cfg, "skills") || hasKey(cfg, "skillPath")) {
    const sw = skillsWarning(ctx.cwd, updated);
    if (sw) warnings.push(sw);
  }
  if (updated.name !== oldName) {
    const renamed = renamePath(target.filePath, updated.name, target.source, ctx);
    if (renamed.error) return result4(renamed.error, true);
    updated.filePath = renamed.filePath;
  }
  fs7.writeFileSync(updated.filePath, serializeAgent(updated, { preserveFrontmatterFields }), "utf-8");
  ctx.onAgentsChanged?.();
  const headline = updated.name === oldName ? `Updated agent '${updated.name}' at ${updated.filePath}.` : `Updated agent '${oldName}' to '${updated.name}' at ${updated.filePath}.`;
  return result4([headline, ...warnings].join("\n"));
}
function handleDelete(params, ctx) {
  if (!params.agent) return result4("Specify 'agent' for delete.", true);
  const scopeHint = asDisambiguationScope(params.agentScope);
  const targetOrError = resolveTarget(params.agent, findAgents(params.agent, ctx, scopeHint ?? "both"), ctx.cwd, ctx, scopeHint);
  if ("content" in targetOrError) return targetOrError;
  const target = targetOrError;
  fs7.unlinkSync(target.filePath);
  ctx.onAgentsChanged?.();
  return result4(`Deleted agent '${target.name}' at ${target.filePath}.`);
}
function handleEject(params, ctx) {
  if (!params.agent) return result4("Specify 'agent' for eject.", true);
  const raw = params.agent.trim();
  const sanitized = sanitizeName(raw);
  const parsedScope = actionScope(params.agentScope, "eject");
  if (parsedScope.error) return parsedScope.error;
  const scope = parsedScope.scope;
  const d = discoverCatalog(ctx);
  const source = [...d.package, ...d.builtin].find((a) => a.name === raw || a.name === sanitized);
  if (!source) {
    return result4(`Agent '${raw}' not found or is not a bundled/package agent. eject copies a builtin or package agent to ${scope} scope so it can be customized. Available: ${availableAgentNames(ctx).join(", ") || "none"}.`, true);
  }
  const runtimeName = source.name;
  const existingCustom = (scope === "user" ? d.user : d.project).find((a) => a.name === runtimeName);
  if (existingCustom) {
    return result4(`Agent '${runtimeName}' is already a custom ${scope} agent at ${existingCustom.filePath}. Edit it with { action: "update", agent: "${runtimeName}" } or delete it first.`, true);
  }
  if (nameExistsInScope(ctx, scope, runtimeName)) {
    return result4(`An agent named '${runtimeName}' already exists in ${scope} scope. Remove or rename it first.`, true);
  }
  const projectConfigDir = getProjectConfigDir(ctx.cwd);
  const targetDir = scope === "user" ? d.userDir : d.projectDir ?? path6.join(projectConfigDir, "agents");
  fs7.mkdirSync(targetDir, { recursive: true });
  const targetPath = path6.join(targetDir, `${runtimeName}.md`);
  if (fs7.existsSync(targetPath)) {
    return result4(`File already exists at ${targetPath} but is not a valid agent definition. Remove or rename it first.`, true);
  }
  let content;
  try {
    content = fs7.readFileSync(source.filePath, "utf-8");
  } catch (error2) {
    const message = error2 instanceof Error ? error2.message : String(error2);
    return result4(`Failed to read source agent at ${source.filePath}: ${message}`, true);
  }
  fs7.writeFileSync(targetPath, content, "utf-8");
  ctx.onAgentsChanged?.();
  return result4(`Ejected agent '${runtimeName}' from ${source.source} to ${scope} scope at ${targetPath}. Edit it there to customize; it shadows the bundled ${source.source} agent of the same name.`);
}
function handleDisable(params, ctx) {
  if (!params.agent) return result4("Specify 'agent' for disable.", true);
  const raw = params.agent.trim();
  const parsedScope = actionScope(params.agentScope, "disable");
  if (parsedScope.error) return parsedScope.error;
  const scope = parsedScope.scope;
  const d = discoverCatalog(ctx);
  if (scope === "project" && d.projectSettingsPath === null) {
    return result4("Project override is not available here: no project config root (.pi or .agents) was found above the cwd. Use agentScope: 'user' or run from inside a project.", true);
  }
  const effective = resolveEffectiveAgent(d, raw);
  if (effective.error) return result4(effective.error, true);
  if (!effective.agent) {
    return result4(`Agent '${raw}' not found. Available: ${availableAgentNames(ctx).join(", ") || "none"}.`, true);
  }
  const runtimeName = effective.agent.name;
  const settingsPath = mergeBuiltinAgentOverride(ctx.cwd, runtimeName, scope, { disabled: true });
  const after = resolveEffectiveAgent(discoverCatalog(ctx), raw).agent;
  if (after?.disabled === true) {
    ctx.onAgentsChanged?.();
    return result4(`Disabled agent '${runtimeName}' via ${scope} settings override at ${settingsPath}. It is now hidden from runtime discovery and { action: "list" }.`);
  }
  return result4(`Wrote a disabled override for '${runtimeName}' at ${settingsPath}, but the agent is still enabled. A higher-precedence ${after?.override?.scope ?? "project"} override is likely winning. Try agentScope: '${after?.override?.scope ?? "project"}'.`, true);
}
function handleEnable(params, ctx) {
  if (!params.agent) return result4("Specify 'agent' for enable.", true);
  const raw = params.agent.trim();
  const parsedScope = actionScope(params.agentScope, "enable");
  if (parsedScope.error) return parsedScope.error;
  const scope = parsedScope.scope;
  const d = discoverCatalog(ctx);
  if (scope === "project" && d.projectSettingsPath === null) {
    return result4("Project override is not available here: no project config root (.pi or .agents) was found above the cwd. Use agentScope: 'user' or run from inside a project.", true);
  }
  const effective = resolveEffectiveAgent(d, raw);
  if (effective.error) return result4(effective.error, true);
  if (!effective.agent) {
    return result4(`Agent '${raw}' not found. Available: ${availableAgentNames(ctx).join(", ") || "none"}.`, true);
  }
  const runtimeName = effective.agent.name;
  const { path: settingsPath, removed } = removeBuiltinAgentOverrideFields(ctx.cwd, runtimeName, scope, ["disabled"]);
  const after = resolveEffectiveAgent(discoverCatalog(ctx), raw).agent;
  if (after && after.disabled !== true) {
    if (removed) ctx.onAgentsChanged?.();
    if (removed) return result4(`Enabled agent '${runtimeName}' (removed disabled override at ${settingsPath}).`);
    return result4(`Agent '${runtimeName}' is already enabled.`);
  }
  if (after?.override?.scope && after.override.scope !== scope) {
    return result4(`Agent '${runtimeName}' is still disabled via a ${after.override.scope} scope override at ${after.override.path}. Specify agentScope: '${after.override.scope}' to enable it.`, true);
  }
  return result4(`Agent '${runtimeName}' is still disabled after removing the ${scope} disabled override. It may be hidden via subagents.disableBuiltins in ${after?.override?.scope ?? scope} settings at ${after?.override?.path ?? settingsPath}.`, true);
}
function handleReset(params, ctx) {
  if (!params.agent) return result4("Specify 'agent' for reset.", true);
  const raw = params.agent.trim();
  const sanitized = sanitizeName(raw);
  const parsedScope = actionScope(params.agentScope, "reset");
  if (parsedScope.error) return parsedScope.error;
  const scope = parsedScope.scope;
  const d = discoverCatalog(ctx);
  if (scope === "project" && d.projectSettingsPath === null) {
    return result4("Project override is not available here: no project config root (.pi or .agents) was found above the cwd. Use agentScope: 'user' or run from inside a project.", true);
  }
  const bundled = [...d.package, ...d.builtin].find((a) => a.name === raw || a.name === sanitized);
  if (!bundled) {
    const custom2 = [...d.user, ...d.project].find((a) => a.name === raw || a.name === sanitized);
    if (custom2) {
      return result4(`Agent '${raw}' has no bundled default to reset to. Use { action: "delete", agent: "${custom2.name}" } to remove the custom ${custom2.source} agent.`, true);
    }
    return result4(`Agent '${raw}' not found. Available: ${availableAgentNames(ctx).join(", ") || "none"}.`, true);
  }
  const runtimeName = bundled.name;
  const custom = (scope === "user" ? d.user : d.project).find((a) => a.name === raw || a.name === sanitized);
  const lines = [];
  if (custom) {
    fs7.unlinkSync(custom.filePath);
    lines.push(`Deleted custom ${scope} agent file at ${custom.filePath}.`);
  }
  const overrideRemoval = removeBuiltinAgentOverride(ctx.cwd, runtimeName, scope, { preserveMachine: true });
  if (overrideRemoval.removed) lines.push(`${overrideRemoval.machinePreserved ? "Cleared customization in" : "Removed"} ${scope} settings override at ${overrideRemoval.path}.${overrideRemoval.machinePreserved ? " Retained machine placement." : ""}`);
  if (lines.length === 0) {
    const otherScope = scope === "user" ? "project" : "user";
    const otherCustom = (otherScope === "user" ? d.user : d.project).find((a) => a.name === raw || a.name === sanitized);
    const hasOtherOverride = bundled.override?.scope === otherScope;
    const note = otherCustom || hasOtherOverride ? ` Customization exists in ${otherScope} scope; specify agentScope: '${otherScope}' to reset it.` : "";
    return result4(`Agent '${runtimeName}' has no ${scope} customization to reset.${note} It is at its bundled ${bundled.source} default.`);
  }
  lines.push(`Reset agent '${runtimeName}' to its bundled ${bundled.source} default.`);
  ctx.onAgentsChanged?.();
  return result4(lines.join("\n"));
}
function handleManagementAction(action, params, ctx) {
  switch (action) {
    case "list":
      return handleList(params, ctx);
    case "get":
      return handleGet(params, ctx);
    case "models":
      return handleModels(params, ctx);
    case "create":
      return handleCreate(params, ctx);
    case "update":
      return handleUpdate(params, ctx);
    case "delete":
      return handleDelete(params, ctx);
    case "eject":
      return handleEject(params, ctx);
    case "disable":
      return handleDisable(params, ctx);
    case "enable":
      return handleEnable(params, ctx);
    case "reset":
      return handleReset(params, ctx);
    default:
      return result4(`Unknown action: ${action}`, true);
  }
}

// src/extension/subagent-guide.ts
import * as fs8 from "node:fs";
import * as path7 from "node:path";
import { fileURLToPath } from "node:url";
var SUBAGENT_GUIDE_TOPICS = [
  "overview",
  "workflows",
  "agents",
  "missions",
  "observability",
  "tool-reference",
  "configuration",
  "models",
  "watchdog",
  "extension-api",
  "council"
];
var SUBAGENT_GUIDE_SECTION_MAX_CHARS = 8e3;
var packageRoot = path7.resolve(path7.dirname(fileURLToPath(new URL("../src/extension/subagent-guide.js", import.meta.url).href)), "..", "..");
var COUNCIL_FILES = [
  "skills/council-mode/SKILL.md",
  "skills/council-mode/references/pass-contracts.md"
];
function isGuideTopic(value) {
  return SUBAGENT_GUIDE_TOPICS.includes(value);
}
function headingSlug(title) {
  return title.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s/g, "-");
}
function parseSections(topic, lines) {
  const sections = [];
  let fence;
  lines.forEach((line, index) => {
    const marker = /^\s*(```+|~~~+)/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker.startsWith(fence)) fence = void 0;
      return;
    }
    const heading = fence ? void 0 : /^(#{2,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) sections.push({ address: "", title: heading[2], level: heading[1].length, start: index, end: lines.length, children: [] });
  });
  const used = /* @__PURE__ */ new Set();
  const parents = [];
  for (const [index, section] of sections.entries()) {
    const next = sections.slice(index + 1).find((other) => other.level <= section.level);
    if (next) section.end = next.start;
    while (parents.length && parents.at(-1).level >= section.level) parents.pop();
    const parent = parents.at(-1);
    parent?.children.push(section);
    let slug = headingSlug(section.title);
    if (used.has(slug) && parent) slug = `${parent.address.slice(topic.length + 1)}-${slug}`;
    for (let suffix = 2, base = slug; used.has(slug); suffix++) slug = `${base}-${suffix}`;
    used.add(slug);
    section.address = `${topic}/${slug}`;
    parents.push(section);
  }
  return sections;
}
function tableOfContents(topic, sections) {
  const rows = sections.map((section) => `${"  ".repeat(section.level - 2)}${section.address} \u2014 ${section.title}`);
  return `Sections of guide topic '${topic}'. Read one with {action:"guide",options:{topic:"<section address>"}}:
${rows.join("\n")}`;
}
function sectionText(lines, section) {
  const text2 = lines.slice(section.start, section.end).join("\n").trim();
  if (text2.length <= SUBAGENT_GUIDE_SECTION_MAX_CHARS || !section.children.length) return text2;
  const intro = lines.slice(section.start, section.children[0].start).join("\n").trim();
  return `${intro}

Subsections (read one with {action:"guide",options:{topic:"<address>"}}):
${section.children.map((child) => `${child.address} \u2014 ${child.title}`).join("\n")}`;
}
function readGuideFiles(topic, files, root) {
  try {
    return files.map((file) => fs8.readFileSync(path7.join(root, file), "utf-8").replace(/\r\n/g, "\n"));
  } catch (error2) {
    const message = error2 instanceof Error ? error2.message : String(error2);
    throw new Error(`Failed to read packaged subagents guide '${topic}': ${message}`, { cause: error2 instanceof Error ? error2 : void 0 });
  }
}
function readSubagentGuide(topic = "overview", root = packageRoot) {
  const separator = topic.indexOf("/");
  const name = separator === -1 ? topic : topic.slice(0, separator);
  const sectioned = isGuideTopic(name) && name !== "overview" && name !== "council";
  if (!isGuideTopic(name) || separator !== -1 && !sectioned) {
    return `Unknown subagents guide topic '${topic}'. Valid topics: ${SUBAGENT_GUIDE_TOPICS.join(", ")}. No files were changed.`;
  }
  if (!sectioned) {
    const files = name === "overview" ? ["README.md"] : COUNCIL_FILES;
    const contents = readGuideFiles(name, files, root);
    return files.length === 1 ? contents[0] : contents.map((content, index) => `<!-- ${files[index]} -->

${content}`).join("\n\n");
  }
  const lines = readGuideFiles(name, [path7.join("docs", `${name}.md`)], root)[0].split("\n");
  const sections = parseSections(name, lines);
  if (separator === -1) {
    const intro = lines.slice(0, sections[0]?.start ?? lines.length).join("\n").trim();
    return `${intro}

${tableOfContents(name, sections)}`;
  }
  const section = sections.find((candidate) => candidate.address === topic);
  if (!section) return `Unknown section '${topic}'. No files were changed.

${tableOfContents(name, sections)}`;
  return sectionText(lines, section);
}

// src/watchdog/model-selection.ts
var STRONG_WATCHDOG_THINKING = "high";
var STRONG_WATCHDOG_MODELS = {
  opus48: {
    label: "Opus 4.8",
    queries: [
      "anthropic/claude-opus-4-8",
      "anthropic/claude-opus-4.8",
      "anthropic/opus-4-8",
      "anthropic/opus-4.8"
    ]
  },
  gpt55: {
    label: "GPT 5.5",
    queries: [
      "openai-codex/gpt-5.5",
      "openai-codex/gpt-5-5",
      "openai/gpt-5.5",
      "openai/gpt-5-5"
    ]
  }
};
function fullModelId(model) {
  return `${model.provider}/${model.id}`;
}
function modelRegistryEntries(ctx) {
  return ctx.modelRegistry.getAvailable().map(toModelInfo);
}
function splitProviderModel(value) {
  const slashIndex = value.indexOf("/");
  if (slashIndex <= 0 || slashIndex === value.length - 1) return void 0;
  return { provider: value.slice(0, slashIndex), id: value.slice(slashIndex + 1) };
}
function assertSupportedThinking(value, source) {
  if (THINKING_LEVELS.includes(value)) return value;
  throw new Error(`Unsupported watchdog thinking '${value}' from ${source}; expected ${THINKING_LEVELS.join(", ")}, false, or inherit.`);
}
function parseWatchdogThinkingInput(value, source = "watchdog input") {
  if (value === void 0 || value === "") return void 0;
  if (value === false) return false;
  if (value === "false") return false;
  return assertSupportedThinking(value, source);
}
function resolveWatchdogModelInput(ctx, rawModel) {
  const trimmed = rawModel.trim();
  if (!trimmed) throw new Error("Watchdog model must be a non-empty provider/model value.");
  const availableModels = modelRegistryEntries(ctx);
  const preferredProvider = typeof ctx.model?.provider === "string" ? ctx.model.provider : void 0;
  const resolved = resolveModelCandidate(trimmed, availableModels, preferredProvider) ?? trimmed;
  const { baseModel, thinkingSuffix } = splitKnownThinkingSuffix(resolved);
  const named = splitProviderModel(baseModel);
  if (!named) throw new Error(`Watchdog model '${rawModel}' did not resolve to provider/model. Use a provider-qualified model such as openai-codex/gpt-5.5:high or anthropic/claude-opus-4-8:high.`);
  const registryModel = ctx.modelRegistry.find(named.provider, named.id);
  if (!registryModel) throw new Error(`Watchdog model '${rawModel}' was not found as '${baseModel}'.`);
  if (!ctx.modelRegistry.hasConfiguredAuth(registryModel)) {
    throw new Error(`Watchdog model '${baseModel}' is not authenticated. Configure credentials for provider '${named.provider}' or choose an authenticated model.`);
  }
  return {
    model: `${named.provider}/${named.id}`,
    ...thinkingSuffix ? { thinking: assertSupportedThinking(thinkingSuffix.slice(1), "watchdog model suffix") } : {},
    registryModel
  };
}
function familyForModel(model) {
  if (!model) return void 0;
  const provider = normalizeModelSegment(model.provider);
  const id = normalizeModelSegment(model.id);
  if (provider.includes("openai") && /^gpt-5-5(-\d{8}|-\d{4}-\d{2}-\d{2})?$/.test(id)) return "gpt55";
  if (provider.includes("anthropic") && /^(claude-opus-4-8|opus-4-8)(-\d{8}|-\d{4}-\d{2}-\d{2})?$/.test(id)) return "opus48";
  return void 0;
}
function currentProviderFamily(ctx) {
  const provider = typeof ctx.model?.provider === "string" ? normalizeModelSegment(ctx.model.provider) : "";
  if (provider.includes("openai")) return "openai";
  if (provider.includes("anthropic")) return "anthropic";
  return void 0;
}
function strongFamilyOrder(ctx) {
  const current = ctx.model ? familyForModel(toModelInfo(ctx.model)) : void 0;
  if (current === "gpt55") return ["opus48"];
  if (current === "opus48") return ["gpt55"];
  const providerFamily = currentProviderFamily(ctx);
  if (providerFamily === "openai") return ["opus48", "gpt55"];
  if (providerFamily === "anthropic") return ["gpt55", "opus48"];
  return ["gpt55", "opus48"];
}
function findFamilyMatch(family, availableModels) {
  const matches = availableModels.filter((entry) => familyForModel(entry) === family);
  if (matches.length === 1) return matches[0].fullId;
  return void 0;
}
function resolveStrongCandidate(ctx, family) {
  const availableModels = modelRegistryEntries(ctx);
  const preference = STRONG_WATCHDOG_MODELS[family];
  const queries = [...preference.queries];
  const familyMatch = findFamilyMatch(family, availableModels);
  if (familyMatch) queries.push(familyMatch);
  for (const query of queries) {
    let resolved;
    try {
      resolved = resolveWatchdogModelInput(ctx, query);
    } catch {
      continue;
    }
    const modelInfo = toModelInfo(resolved.registryModel);
    if (familyForModel(modelInfo) !== family) continue;
    if (!getSupportedThinkingLevels(modelInfo).includes(STRONG_WATCHDOG_THINKING)) continue;
    const current = ctx.model ? fullModelId(toModelInfo(ctx.model)) : "no current session model";
    return {
      source: "suggested",
      model: resolved.model,
      thinking: STRONG_WATCHDOG_THINKING,
      label: preference.label,
      reason: `Use ${preference.label} with thinking high as a strong independent watchdog for ${current}.`,
      registryModel: resolved.registryModel
    };
  }
  return void 0;
}
function recommendStrongWatchdogModel(ctx) {
  for (const family of strongFamilyOrder(ctx)) {
    const recommendation = resolveStrongCandidate(ctx, family);
    if (recommendation) return recommendation;
  }
  const current = ctx.model ? fullModelId(toModelInfo(ctx.model)) : "the current session";
  throw new Error(`No authenticated strong complementary watchdog model was found for ${current}. Configure access to Opus 4.8 or GPT 5.5, then run the recommendation again.`);
}
function recommendWatchdogModel(ctx, configured) {
  if (!configured.model) return recommendStrongWatchdogModel(ctx);
  const resolved = resolveWatchdogModelInput(ctx, configured.model);
  const thinking = resolved.thinking ?? parseWatchdogThinkingInput(configured.thinking) ?? "off";
  return {
    ...resolved,
    source: "configured",
    thinking: thinking === false ? "off" : thinking,
    label: "configured watchdog",
    reason: "Keep the configured watchdog model and thinking; no replacement recommendation is needed. This is not a strength or independence assessment."
  };
}
function formatWatchdogRecommendation(recommendation) {
  return `${recommendation.source === "configured" ? "Keep configured watchdog" : "Recommended strong watchdog"}: ${recommendation.model}:${recommendation.thinking}`;
}

// src/watchdog/register-main.ts
function sendSlashText(pi, text2) {
  pi.sendMessage({ customType: SLASH_TEXT_RESULT_TYPE, content: text2, display: true, details: SLASH_TEXT_VIEW_ONLY_DETAILS });
}
function messageFromError(error2) {
  return error2 instanceof Error ? error2.message : String(error2);
}
function boolLabel(value) {
  return value ? "on" : "off";
}
function statusLabel(status) {
  return status.replaceAll("-", " ");
}
function sourceLine(source) {
  const location = source.path ? ` ${source.path}` : "";
  return `- ${source.scope}${location}: ${source.exists ? "found" : "not found"}`;
}
function currentSessionModelLine(ctx) {
  const model = ctx.model;
  if (model && typeof model.provider === "string" && typeof model.id === "string") return `current session (${model.provider}/${model.id})`;
  return "current session (not configured)";
}
function mainThinkingLine(snapshot, ctx) {
  const configuredModel = snapshot.config.main.model;
  const configuredThinking = snapshot.config.main.thinking;
  if (configuredModel) {
    const effective = resolveEffectiveThinking(configuredModel, configuredThinking);
    if (effective) return effective;
    return "off (default for explicit watchdog model)";
  }
  if (configuredThinking === false) return "off";
  if (configuredThinking !== void 0) return configuredThinking;
  const currentThinking = ctx.thinkingLevel;
  return typeof currentThinking === "string" ? `current session (${currentThinking})` : "current session";
}
function mainModelLine(snapshot, ctx) {
  if (snapshot.config.main.model) {
    const source = snapshot.sessionModelOverride?.model ? "session override" : "configured";
    return `Main model: ${splitKnownThinkingSuffix(snapshot.config.main.model).baseModel} (${source})`;
  }
  return `Main model: ${currentSessionModelLine(ctx)}`;
}
function childrenLine(snapshot) {
  const children = snapshot.config.children;
  const model = children.model ? splitKnownThinkingSuffix(children.model).baseModel : "current child session";
  const thinking = children.thinking === void 0 ? "current child session" : children.thinking === false ? "off" : children.thinking;
  const overrides = Object.entries(children.overrides);
  const overrideText = overrides.length ? ` \xB7 overrides ${overrides.map(([agent, override]) => {
    const bits = [agent];
    if (override.enabled !== void 0) bits.push(boolLabel(override.enabled));
    if (override.model) bits.push(splitKnownThinkingSuffix(override.model).baseModel);
    if (override.thinking !== void 0) bits.push(`thinking ${override.thinking === false ? "off" : override.thinking}`);
    return bits.join(" ");
  }).join("; ")}` : "";
  return `Children: ${boolLabel(snapshot.config.enabled && children.enabled)} \xB7 model ${model} \xB7 thinking ${thinking}${overrideText}`;
}
function recommendationLine(snapshot, ctx) {
  try {
    return formatWatchdogRecommendation(recommendWatchdogModel(ctx, snapshot.config.main));
  } catch (error2) {
    return `Watchdog recommendation unavailable (${messageFromError(error2)})`;
  }
}
function lspLine(snapshot) {
  const lsp = snapshot.lsp;
  const provider = lsp.provider ? ` \xB7 ${lsp.provider}` : "";
  const counts = lsp.diagnosticCount > 0 || lsp.freshDiagnosticCount > 0 ? ` \xB7 ${lsp.freshDiagnosticCount} new/${lsp.diagnosticCount} total` : "";
  const message = lsp.message ? ` \xB7 ${lsp.message}` : "";
  return `LSP diagnostics: ${lsp.enabled ? "on" : "off"} \xB7 ${lsp.status}${provider}${counts}${message}`;
}
function buildWatchdogStatus(snapshot, ctx) {
  const lines = [
    "Subagent watchdog",
    `Main: ${boolLabel(snapshot.enabled)}${!snapshot.config.enabled && snapshot.sessionOverride === void 0 ? " (default off)" : ""}`,
    `Runtime: ${statusLabel(snapshot.status)}${snapshot.bufferedDeltas > 0 ? ` \xB7 buffered deltas ${snapshot.bufferedDeltas}` : ""}`,
    `Review trigger: ${snapshot.reviewTrigger === "repo-edits" ? snapshot.config.clarification ? "repo edits + bounded main orchestration activity" : "repo edits only" : "every non-empty turn delta"}`,
    `Main clarification: ${snapshot.config.clarification ? "on" : "off"}`,
    `Scope context: ${snapshot.config.scope.enabled ? "on" : "off"}`,
    `Cadence: ${snapshot.config.cadence.everyNTools === null ? "boundary only" : `every ${snapshot.config.cadence.everyNTools} tools + boundary`}`,
    lspLine(snapshot),
    `Session override: ${snapshot.sessionOverride === void 0 ? "none" : boolLabel(snapshot.sessionOverride)}`,
    mainModelLine(snapshot, ctx),
    `Main thinking: ${mainThinkingLine(snapshot, ctx)}`,
    childrenLine(snapshot),
    recommendationLine(snapshot, ctx),
    `Agent-end timeout: ${snapshot.config.agentEndTimeoutMs}ms`,
    `Stalemate: ${snapshot.boundaryRepeats}/${snapshot.config.stalemateRepeats}${snapshot.stalemate ? " \xB7 stopped" : ""}`,
    `Rules: ${snapshot.config.rules ? `${Object.keys(snapshot.config.rules.roleModels).length} role models \xB7 ${snapshot.config.rules.action}` : "none"}`,
    `Review model call: ${snapshot.reviewDescription}`
  ];
  if (snapshot.failedReviews > 0) lines.push(`Failed reviews: ${snapshot.failedReviews}`);
  if (snapshot.staleReviews > 0) lines.push(`Stale reviews: ${snapshot.staleReviews}`);
  if (snapshot.changedPaths?.length) {
    lines.push(`Changed paths: ${snapshot.changedPaths.slice(0, 8).join(", ")}${snapshot.changedPaths.length > 8 ? `, +${snapshot.changedPaths.length - 8} more` : ""}`);
  }
  if (snapshot.lastWarning) {
    lines.push(`Last warning: ${snapshot.lastWarning.severity} \xB7 ${snapshot.lastWarning.state ?? "candidate"} \xB7 ${snapshot.lastWarning.summary}`);
  }
  if (snapshot.lastError) lines.push(`Last error: ${snapshot.lastError}`);
  if (!snapshot.configOk) {
    lines.push("", "Config errors:", ...snapshot.errors.map((error2) => `- ${error2.message}`), "Watchdog is disabled until the config is fixed.");
  } else {
    lines.push("", "Config: ok");
  }
  lines.push(
    "Sources:",
    ...snapshot.sources.map(sourceLine),
    "",
    "Model commands:",
    "- /subagents-watchdog recommend-model",
    "- /subagents-watchdog model recommended (saves to user settings, not project settings)",
    "- /subagents-watchdog model <provider/model[:thinking]>",
    "- /subagents-watchdog model inherit",
    "- /subagents-watchdog session model recommended",
    'Agent action: subagent({ action: "watchdog.configure", model: "recommended", options: { scope: "session" } })'
  );
  return lines.join("\n");
}
function parseTestCommand(input) {
  const match = input.match(/^test\s+(concern|blocker)\s+(low|medium|high)\s+([\s\S]+)$/);
  if (!match) return void 0;
  return { severity: match[1], importance: match[2], text: match[3].trim() };
}
function formatThinking(value) {
  if (value === void 0) return "inherit";
  return value === false ? "off" : value;
}
function parseThinkingCommand(raw) {
  const value = raw.trim();
  if (value === "inherit") return null;
  return parseWatchdogThinkingInput(value, "/subagents-watchdog thinking") ?? null;
}
function resolveModelCommandValue(runtime, ctx, raw) {
  const value = raw.trim();
  if (!value) throw new Error("Expected a model, 'recommended', or 'inherit'.");
  if (value === "inherit") return { model: null, thinking: null, description: "current session model and thinking" };
  if (value === "recommended") {
    const recommendation = recommendWatchdogModel(ctx, runtime.getSnapshot(ctx.cwd).config.main);
    return {
      model: recommendation.model,
      thinking: recommendation.thinking,
      description: `${recommendation.model}:${recommendation.thinking} (${recommendation.label})`
    };
  }
  const resolved = resolveWatchdogModelInput(ctx, value);
  return {
    model: resolved.model,
    thinking: resolved.thinking ?? null,
    description: `${resolved.model}${resolved.thinking ? `:${resolved.thinking}` : ""}`
  };
}
function buildRecommendationText(runtime, ctx) {
  const recommendation = recommendWatchdogModel(ctx, runtime.getSnapshot(ctx.cwd).config.main);
  return [
    "Subagent watchdog recommended model",
    `Current session: ${currentSessionModelLine(ctx)}`,
    recommendation.source === "configured" ? formatWatchdogRecommendation(recommendation) : `Recommended: ${recommendation.model}:${recommendation.thinking}`,
    `Reason: ${recommendation.reason}`,
    "",
    "Apply for this session:",
    "/subagents-watchdog session model recommended",
    "",
    "Save as your user default (affects other projects without overrides; does not change project settings):",
    "/subagents-watchdog model recommended"
  ].join("\n");
}
function buildCheckText(runtime, ctx) {
  const snapshot = runtime.getSnapshot(ctx.cwd);
  if (!snapshot.configOk) {
    return ["Subagent watchdog config check", "", "Config errors:", ...snapshot.errors.map((error2) => `- ${error2.message}`)].join("\n");
  }
  const lines = ["Subagent watchdog config check", "", "Config: ok"];
  if (snapshot.config.main.model) {
    const resolved = resolveWatchdogModelInput(ctx, snapshot.config.main.model);
    lines.push(`Main model: ${resolved.model} auth ok`);
  } else {
    lines.push(`Main model: ${currentSessionModelLine(ctx)}`);
  }
  lines.push(`Main thinking: ${mainThinkingLine(snapshot, ctx)}`);
  lines.push(lspLine(snapshot));
  lines.push(recommendationLine(snapshot, ctx));
  return lines.join("\n");
}
function createTestWarning(severity, importance, text2) {
  return {
    severity,
    category: "other",
    importance,
    source: "main",
    state: "displayed",
    summary: text2,
    evidence: `Manual /subagents-watchdog test ${severity} message from the main session.`,
    recommendedAction: severity === "blocker" ? "Verify the renderer and transcript delivery." : "Verify the renderer and transcript delivery; decide manually whether any action is needed."
  };
}
async function handleWatchdogCommand(pi, runtime, args, ctx) {
  const input = args.trim();
  if (!input || input === "status") {
    sendSlashText(pi, buildWatchdogStatus(runtime.getSnapshot(ctx.cwd), ctx));
    return;
  }
  if (input === "recommend-model") {
    try {
      sendSlashText(pi, buildRecommendationText(runtime, ctx));
    } catch (error2) {
      sendSlashText(pi, `Subagent watchdog recommended model

${messageFromError(error2)}`);
    }
    return;
  }
  if (input === "check") {
    try {
      sendSlashText(pi, buildCheckText(runtime, ctx));
    } catch (error2) {
      sendSlashText(pi, `Subagent watchdog config check

${messageFromError(error2)}`);
    }
    return;
  }
  if (input === "on" || input === "off") {
    const enabled = input === "on";
    try {
      const settingsPath = writeUserWatchdogEnabled(enabled);
      const snapshot = runtime.getSnapshot(ctx.cwd);
      sendSlashText(pi, [
        `Subagent watchdog ${boolLabel(enabled)} saved to user settings.`,
        `Updated: ${settingsPath}`,
        `Main now: ${boolLabel(snapshot.enabled)}${snapshot.sessionOverride !== void 0 ? ` (session override ${boolLabel(snapshot.sessionOverride)})` : ""}`
      ].join("\n"));
    } catch (error2) {
      sendSlashText(pi, `Subagent watchdog

Could not update ${getWatchdogUserSettingsPath()}: ${messageFromError(error2)}`);
    }
    return;
  }
  if (input === "session on" || input === "session off") {
    const enabled = input.endsWith("on");
    const snapshot = runtime.setSessionEnabled(enabled, ctx.cwd);
    sendSlashText(pi, [
      `Subagent watchdog session override: ${boolLabel(enabled)}.`,
      "No settings files were changed.",
      "",
      buildWatchdogStatus(snapshot, ctx)
    ].join("\n"));
    return;
  }
  if (input.startsWith("session model ")) {
    const rawModel = input.slice("session model ".length);
    try {
      const value = resolveModelCommandValue(runtime, ctx, rawModel);
      const snapshot = value.model === null ? runtime.clearSessionModel(ctx.cwd) : runtime.setSessionModel({ model: value.model, thinking: value.thinking ?? null }, ctx.cwd);
      sendSlashText(pi, [
        `Subagent watchdog session model: ${value.description}.`,
        "No settings files were changed.",
        "",
        buildWatchdogStatus(snapshot, ctx)
      ].join("\n"));
    } catch (error2) {
      sendSlashText(pi, `Subagent watchdog session model

${messageFromError(error2)}`);
    }
    return;
  }
  if (input.startsWith("model ")) {
    const rawModel = input.slice("model ".length);
    try {
      const value = resolveModelCommandValue(runtime, ctx, rawModel);
      const settingsPath = writeWatchdogModelSettings({
        scope: "user",
        target: { kind: "main" },
        model: value.model,
        thinking: value.thinking
      });
      runtime.refreshConfig(ctx.cwd);
      const snapshot = runtime.getSnapshot(ctx.cwd);
      sendSlashText(pi, [
        `Subagent watchdog model saved to user settings: ${value.description}. Project and session overrides still take precedence.`,
        `Updated: ${settingsPath}`,
        `Main now: ${boolLabel(snapshot.enabled)}`,
        value.model === null ? "The watchdog now inherits the current session model and thinking." : "Run /subagents-watchdog on if the watchdog is still off.",
        "",
        buildWatchdogStatus(snapshot, ctx)
      ].join("\n"));
    } catch (error2) {
      sendSlashText(pi, `Subagent watchdog model

${messageFromError(error2)}
No settings files were changed.`);
    }
    return;
  }
  if (input.startsWith("thinking ")) {
    const rawThinking = input.slice("thinking ".length);
    try {
      const thinking = parseThinkingCommand(rawThinking);
      const settingsPath = writeWatchdogModelSettings({
        scope: "user",
        target: { kind: "main" },
        thinking
      });
      runtime.refreshConfig(ctx.cwd);
      sendSlashText(pi, [
        `Subagent watchdog thinking saved: ${formatThinking(thinking ?? void 0)}.`,
        `Updated: ${settingsPath}`,
        "",
        buildWatchdogStatus(runtime.getSnapshot(ctx.cwd), ctx)
      ].join("\n"));
    } catch (error2) {
      sendSlashText(pi, `Subagent watchdog thinking

${messageFromError(error2)}
No settings files were changed.`);
    }
    return;
  }
  const test = parseTestCommand(input);
  if (test) {
    if (!test.text) {
      ctx.ui.notify("Usage: /subagents-watchdog test concern|blocker low|medium|high <text>", "error");
      return;
    }
    const warning = createTestWarning(test.severity, test.importance, test.text);
    runtime.displayRecordedWarning(warning);
    return;
  }
  ctx.ui.notify(`Usage: /subagents-watchdog [status|on|off|session on|session off|recommend-model|model recommended|model <provider/model[:thinking]>|model inherit|thinking ${THINKING_LEVELS.join("|")}|thinking inherit|session model recommended|check|test concern|blocker low|medium|high <text>]`, "error");
}
function registerMainWatchdog(pi, options = {}) {
  let currentContext;
  let diffBaseline;
  const rememberContext = (ctx) => {
    currentContext = ctx;
  };
  const runtime = options.runtime ?? new MainWatchdogRuntime({
    review: options.review ?? createMainWatchdogReview(() => currentContext, { getThinkingLevel: () => pi.getThinkingLevel(), diffBaseline: () => diffBaseline }),
    reviewDescription: options.review ? "injected seam" : "real model review",
    reviewChangesOnly: true,
    displayWarning: (details, options2) => pi.sendMessage(createWatchdogWarningMessage(details, { display: true, details }), options2),
    displayUserWarning: (details) => pi.appendEntry(SUBAGENT_WATCHDOG_WARNING_TYPE, details),
    displayClarification: (content) => pi.sendMessage({ customType: "subagent_watchdog_clarification", content, display: true }, { deliverAs: "steer", triggerTurn: true })
  });
  if (options.slashCommand !== false) pi.registerCommand("subagents-watchdog", {
    description: "Show or toggle the default-off subagent watchdog",
    handler: (args, ctx) => {
      rememberContext(ctx);
      return handleWatchdogCommand(pi, runtime, args, ctx);
    }
  });
  pi.on("session_start", (_event, ctx) => {
    rememberContext(ctx);
    diffBaseline = startWatchdogDiffBaselineCapture(ctx.cwd);
    runtime.bindSession(ctx);
  });
  pi.on("before_agent_start", (event, ctx) => {
    rememberContext(ctx);
    runtime.handleBeforeAgentStart(event, ctx);
  });
  pi.on("turn_end", (event, ctx) => {
    rememberContext(ctx);
    runtime.handleTurnEnd(event, ctx);
  });
  pi.on("input", (event) => runtime.handleUserInput(event));
  pi.on("model_select", () => runtime.handleModelChange());
  pi.on("tool_result", (_event, ctx) => {
    rememberContext(ctx);
    runtime.handleToolResult(ctx);
  });
  pi.on("agent_end", (event, ctx) => {
    rememberContext(ctx);
    return runtime.handleAgentEnd(event, ctx);
  });
  pi.on("session_before_switch", () => runtime.reset("session switch", { clearReviewInputSignature: true, clearLspLedger: true, clearScope: true }));
  pi.on("session_before_fork", () => runtime.reset("session fork", { clearReviewInputSignature: true, clearLspLedger: true, clearScope: true }));
  pi.on("session_compact", () => runtime.reset("session compact", { clearActivity: true }));
  pi.on("session_shutdown", () => {
    currentContext = void 0;
    runtime.dispose();
  });
  return runtime;
}

// src/extension/public-execution.ts
var RAW_SCRIPT_FORMS = "workflow: true or a workflow script path";
var REMOVED_WORKFLOW_SCRIPT = 'workflowScript was removed; write the script in one ```js workflow block in this reply and call subagent({ workflow: true }), or pass a script file as workflow: "./path/to/script.js".';
var REMOVED_WORKFLOW_SCRIPT_PATH = `workflowScriptPath was removed; pass the script file as workflow: "./path/to/script.js" (a workflow value containing '/' is a path).`;
function isWorkflowScriptPath(workflow) {
  return workflow.includes("/") || workflow.includes("\\");
}
function removedModelWorkflowFieldError(params) {
  if (Object.hasOwn(params, "workflowScript")) return REMOVED_WORKFLOW_SCRIPT;
  if (Object.hasOwn(params, "workflowScriptPath")) return REMOVED_WORKFLOW_SCRIPT_PATH;
  return void 0;
}
function validateWorkflowCapacityOverrides(params) {
  for (const [name, value] of [
    ["globalConcurrencyLimit", params.globalConcurrencyLimit],
    ["maxSubagentSpawnsPerRun", params.maxSubagentSpawnsPerRun]
  ]) {
    if (value !== void 0 && (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)) return `${name} must be a positive safe integer.`;
  }
}
function normalizePublicSubagentExecution(params, options = {}) {
  for (const field of ["resource", "resourceProvenance", "workflowResource", "workflowResourceProvenance", "workflowResourcePermit", "resourcePermit", "permit"]) {
    if (Object.hasOwn(params, field) && params[field] !== void 0) {
      return { ok: false, error: "Public execution does not accept workflow resource provenance or permit fields.", mode: params.action === void 0 ? "workflow" : "management" };
    }
  }
  if (params.baseRef !== void 0) {
    try {
      normalizeWorktreeBaseRef(params.baseRef);
    } catch (error2) {
      return { ok: false, error: error2 instanceof Error ? error2.message : String(error2), mode: params.action === void 0 ? "workflow" : "management" };
    }
  }
  if (params.workflowScriptPath !== void 0) {
    return { ok: false, error: REMOVED_WORKFLOW_SCRIPT_PATH, mode: params.action === void 0 ? "workflow" : "management" };
  }
  if (params.workflow === "true") params = { ...params, workflow: true };
  const workflow = params.workflow;
  if (workflow !== void 0 && workflow !== true && (typeof workflow !== "string" || !workflow.trim())) {
    return { ok: false, error: "workflow must be true (the ```js workflow block in this reply), a script path containing '/', or a named workflow resource.", mode: "workflow" };
  }
  const hasNamedWorkflow = typeof workflow === "string" && !isWorkflowScriptPath(workflow);
  if (workflow !== void 0 && params.workflowScript !== void 0) {
    return { ok: false, error: "workflow cannot be combined with an internal workflowScript.", mode: "workflow" };
  }
  const hasRawScript = params.workflowScript !== void 0 || workflow !== void 0 && !hasNamedWorkflow;
  const hasWorkflowInput = hasRawScript || hasNamedWorkflow;
  if (!hasWorkflowInput && params.args !== void 0) {
    return { ok: false, error: "args requires workflow.", mode: "workflow" };
  }
  if (!hasWorkflowInput && params.reuseFrom !== void 0) {
    return { ok: false, error: "options.reuseFrom requires a workflow launch.", mode: "workflow" };
  }
  const hasCapacityOverride = params.globalConcurrencyLimit !== void 0 || params.maxSubagentSpawnsPerRun !== void 0;
  if (hasCapacityOverride) {
    const capacityOverrideError = validateWorkflowCapacityOverrides(params);
    if (capacityOverrideError) return { ok: false, error: capacityOverrideError, mode: params.action === void 0 ? "workflow" : "management" };
    const validatesSpawnBudget = typeof params.action === "string" && params.action.trim() === "validate" && params.globalConcurrencyLimit === void 0 && params.maxSubagentSpawnsPerRun !== void 0;
    if (params.action !== void 0 && !validatesSpawnBudget || !hasRawScript) {
      return { ok: false, error: `Workflow capacity overrides are only supported on top-level ${RAW_SCRIPT_FORMS} calls; validate accepts maxSubagentSpawnsPerRun for static budget checks.`, mode: params.action === void 0 ? "workflow" : "management" };
    }
  }
  if (params.preflight !== void 0 && !hasWorkflowInput) {
    return { ok: false, error: `preflight requires ${RAW_SCRIPT_FORMS}.`, mode: params.action === void 0 ? "workflow" : "management" };
  }
  if (params.preflight !== void 0 && hasNamedWorkflow) {
    return { ok: false, error: "preflight is not supported with named workflow resources.", mode: "workflow" };
  }
  const hasValidWorkflowInput = workflow !== void 0 || typeof params.workflowScript === "string" && Boolean(params.workflowScript.trim());
  if (params.isolation !== void 0) {
    if (params.isolation !== "none" && params.isolation !== "worktree") {
      return { ok: false, error: "isolation must be 'none' or 'worktree'.", mode: hasWorkflowInput ? "workflow" : "management" };
    }
    const isolationWorktree = params.isolation === "worktree";
    if (params.worktree !== void 0 && params.worktree !== isolationWorktree) {
      return { ok: false, error: `isolation '${params.isolation}' conflicts with worktree: ${String(params.worktree)}.`, mode: hasWorkflowInput ? "workflow" : "management" };
    }
    const { isolation: _isolation, ...normalizedParams } = params;
    params = { ...normalizedParams, worktree: isolationWorktree };
  }
  if (params.runFanoutBudget !== void 0 || params.runFanoutAdmitted !== void 0) {
    return { ok: false, error: "Public execution does not accept internal run fan-out fields.", mode: hasWorkflowInput ? "workflow" : "management" };
  }
  if (params.workflowParentRunId !== void 0 || params.workflowKey !== void 0 || params.workflowChildAsyncId !== void 0 || params.workflowAwaitAsync !== void 0 || params.workflowAwaitDetached !== void 0 || params.workflowParentDeadlineAt !== void 0 || params.suppressRoutineResultIntercom !== void 0) {
    return { ok: false, error: "Public execution does not accept internal workflow child fields.", mode: hasWorkflowInput ? "workflow" : "management" };
  }
  const action = params.action;
  if (action !== void 0 && (typeof action !== "string" || !action.trim())) {
    return { ok: false, error: "action must be a non-empty management/control action, or omit action and use workflow.", mode: "management" };
  }
  const normalizedAction = typeof action === "string" ? action.trim() : void 0;
  if (params.baseRef !== void 0 && normalizedAction !== void 0 && normalizedAction !== "resume" && normalizedAction !== "schedule.create") {
    return { ok: false, error: "baseRef is only supported for child execution, resume, and schedule.create.", mode: "management" };
  }
  if (normalizedAction !== void 0 && hasNamedWorkflow) {
    return { ok: false, error: "Named workflow resource execution must omit action.", mode: "management" };
  }
  if (params.clarify !== void 0) {
    return { ok: false, error: "Public workflow execution does not support clarify UI.", mode: "workflow" };
  }
  if (params.chainName !== void 0) {
    return { ok: false, error: "Durable chain management was removed; use a workflow script or /prompt-workflow for repeatable workflows.", mode: "management" };
  }
  if (params.config && typeof params.config === "object" && !Array.isArray(params.config) && Object.prototype.hasOwnProperty.call(params.config, "steps")) {
    return { ok: false, error: "Durable chain definitions were removed; use a workflow script or /prompt-workflow for repeatable workflows.", mode: "management" };
  }
  if (params.resume !== void 0) {
    return { ok: false, error: "Top-level resume execution is not available. Put resume on a workflow script runs.run/runs.all item.", mode: "workflow" };
  }
  const legacyOrchestrationAction = ["parallel", "tasks", "chain"].includes(normalizedAction?.toLowerCase() ?? "");
  const hasStructuredWorkflow = options.structuredWorkflows === true && !legacyOrchestrationAction && (params.tasks !== void 0 || params.chain !== void 0);
  const hasLegacyOrchestration = !hasStructuredWorkflow && (params.tasks !== void 0 || params.chain !== void 0) || params.parallel !== void 0 || params.concurrency !== void 0 || params.chainDir !== void 0;
  if (hasLegacyOrchestration) {
    return { ok: false, error: `Legacy top-level chain and parallel inputs were removed; use a workflow script (${RAW_SCRIPT_FORMS}).`, mode: normalizedAction ? "management" : "workflow" };
  }
  if (hasStructuredWorkflow) {
    if (params.tasks !== void 0 && params.chain !== void 0) {
      return { ok: false, error: "Pass either tasks or chain, not both.", mode: "workflow" };
    }
    const field = params.tasks !== void 0 ? "tasks" : "chain";
    for (const [name, value] of [["action", params.action], ["agent", params.agent], ["step", params.step]]) {
      if (value !== void 0) return { ok: false, error: `${field} cannot be combined with ${name}.`, mode: normalizedAction ? "management" : "workflow" };
    }
    return { ok: true, params };
  }
  if (normalizedAction !== void 0) {
    const legacyAction = normalizedAction.toLowerCase();
    if (legacyAction === "append-step") {
      return { ok: false, error: "Legacy append-step control was removed from the public subagent tool; use workflow script orchestration.", mode: "management" };
    }
    if (legacyAction === "approve-checkpoint" || legacyAction === "reject-checkpoint") {
      return { ok: false, error: "Legacy checkpoint approval controls were removed from the public subagent tool; use workflow script orchestration.", mode: "management" };
    }
    if (legacyAction === "single") {
      return { ok: false, error: "action='single' is not supported. Omit action and pass { agent, task } for one child.", mode: "workflow" };
    }
    if (legacyAction === "parallel" || legacyAction === "tasks" || legacyAction === "chain") {
      return { ok: false, error: `Legacy top-level chain and parallel inputs were removed; use a workflow script (${RAW_SCRIPT_FORMS}).`, mode: "workflow" };
    }
    if (normalizedAction === "validate") {
      if (params.agent !== void 0 || params.task !== void 0 || params.step !== void 0) {
        return { ok: false, error: `validate requires ${RAW_SCRIPT_FORMS} and does not accept direct agent, task, or step execution fields.`, mode: "management" };
      }
      if (!hasValidWorkflowInput) {
        return { ok: false, error: `validate requires ${RAW_SCRIPT_FORMS}.`, mode: "management" };
      }
      return { ok: true, params: { ...params, action: normalizedAction } };
    }
    if (normalizedAction === "schedule.create") {
      if (params.agent !== void 0 || params.task !== void 0 || params.step !== void 0) {
        return { ok: false, error: `schedule.create requires ${RAW_SCRIPT_FORMS} and does not accept direct agent, task, or step execution fields.`, mode: "management" };
      }
      if (!hasValidWorkflowInput) {
        return { ok: false, error: `schedule.create requires ${RAW_SCRIPT_FORMS}.`, mode: "management" };
      }
      return { ok: true, params: { ...params, action: normalizedAction } };
    }
    if (hasWorkflowInput) {
      return { ok: false, error: `Workflow execution must omit action; only validate and schedule.create accept action with ${RAW_SCRIPT_FORMS}.`, mode: "management" };
    }
    if (params.task !== void 0) {
      return { ok: false, error: "Structured single-child task cannot be combined with a management/control action.", mode: "management" };
    }
    return { ok: true, params: { ...params, action: normalizedAction } };
  }
  if (params.step !== void 0) {
    return { ok: false, error: `step is not a public execution field; use a workflow script (${RAW_SCRIPT_FORMS}) for orchestration.`, mode: "workflow" };
  }
  if (hasWorkflowInput && (params.agent !== void 0 || params.task !== void 0)) {
    return { ok: false, error: "Structured single-child execution cannot be combined with workflow.", mode: "workflow" };
  }
  if (params.agent !== void 0 || params.task !== void 0) {
    if (typeof params.agent !== "string" || !params.agent.trim()) {
      return { ok: false, error: "Structured single-child execution requires agent to be a non-empty string.", mode: "workflow" };
    }
    if (params.task !== void 0 && typeof params.task !== "string") {
      return { ok: false, error: "Structured single-child task must be a string when provided.", mode: "workflow" };
    }
    return {
      ok: true,
      params: {
        ...params,
        agent: params.agent.trim(),
        output: params.output === void 0 ? true : params.output
      }
    };
  }
  if (!hasValidWorkflowInput) {
    return { ok: false, error: "Execution requires either { agent, task? } for one child or workflow (true, a script path, or a named workflow resource) for orchestration.", mode: "workflow" };
  }
  return { ok: true, params };
}

// src/shared/parent-wake.ts
var COMPLETION_ACTION = "Read the saved results above and resume the already-authorized parent task, or report completion. If approval is required, explicitly ask the user. Do not silently yield, rerun completed work, or infer new authorization.";
var STATUS_ACTION = "Check the run status and details above, then resume the already-authorized parent task or report the problem. If approval is required, explicitly ask the user. Do not silently yield, rerun completed work, or infer new authorization.";
var WAKE_PENDING_MS = 1e4;
var reservationsSymbol = /* @__PURE__ */ Symbol.for("pi.idle-wake.v1");
var wakeGlobal = globalThis;
var reservations = wakeGlobal[reservationsSymbol] ?? (wakeGlobal[reservationsSymbol] = /* @__PURE__ */ new WeakMap());
function createParentWake(pi, now = Date.now) {
  let ctx;
  let session;
  let held = false;
  const reservation = () => {
    if (!session) return { sessionId: "" };
    const current = reservations.get(session.manager);
    if (current?.sessionId === session.id) return current;
    const next = { sessionId: session.id };
    reservations.set(session.manager, next);
    return next;
  };
  const reserved = () => {
    const { sentAt } = reservation();
    return sentAt !== void 0 && now() - sentAt < WAKE_PENDING_MS;
  };
  return {
    sendMessage(message, options) {
      if (options?.triggerTurn !== true) {
        pi.sendMessage(message, options);
        return false;
      }
      if (held || ctx.isIdle() && reserved()) {
        pi.sendMessage(message, { triggerTurn: false });
        return true;
      }
      if (ctx.isIdle()) reservation().sentAt = now();
      pi.sendMessage(message, options);
      return false;
    },
    isPending: () => reservation().sentAt !== void 0 && (reserved() || !ctx.isIdle()),
    bindSession(context) {
      ctx = context;
      session = { manager: context.sessionManager, id: context.sessionManager.getSessionId() };
      held = false;
    },
    agentStarted() {
      reservation().sentAt = void 0;
      held = false;
    },
    userAborted: () => {
      held = true;
    },
    releaseHold: () => {
      held = false;
    },
    isHeld: () => held,
    sessionShutdown(reason) {
      if (reason !== "reload") reservation().sentAt = void 0;
    }
  };
}

// src/workflows/workflow-launch-record.ts
import * as fs9 from "node:fs";
import * as path8 from "node:path";
var WORKFLOW_LAUNCH_RECORD_FILE = "launch.json";
function launchRecordPath(asyncDir) {
  return path8.join(asyncDir, WORKFLOW_LAUNCH_RECORD_FILE);
}
function writeWorkflowLaunchRecord(asyncDir, record) {
  writeAtomicJson(launchRecordPath(asyncDir), record);
}
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function invalid(error2) {
  return { ok: false, missing: false, error: error2 };
}
function readWorkflowLaunchRecord(asyncDir) {
  let text2;
  try {
    text2 = fs9.readFileSync(launchRecordPath(asyncDir), "utf-8");
  } catch (error2) {
    if (error2.code === "ENOENT") return { ok: false, missing: true, error: "launch.json is missing" };
    return invalid(`could not be read: ${error2 instanceof Error ? error2.message : String(error2)}`);
  }
  let value;
  try {
    value = JSON.parse(text2);
  } catch (error2) {
    return invalid(`not valid JSON: ${error2 instanceof Error ? error2.message : String(error2)}`);
  }
  if (!isPlainObject(value)) return invalid("not a JSON object");
  if (value.version !== 1) return invalid("version must be 1");
  if (typeof value.scriptDigest !== "string" || !value.scriptDigest) return invalid("scriptDigest must be a non-empty string");
  if (value.source === "structured") return { ok: true, record: { version: 1, source: "structured", scriptDigest: value.scriptDigest } };
  if (value.source !== "script" && value.source !== "resource") return invalid('source must be "script", "resource", or "structured"');
  if (!isPlainObject(value.params)) return invalid("params must be an object");
  return { ok: true, record: { version: 1, source: value.source, params: value.params, scriptDigest: value.scriptDigest } };
}

// src/workflows/workflow-resume-claim.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import * as fs10 from "node:fs";
import * as path9 from "node:path";
var CLAIM_FILE_PATTERN = /^resumed-by\.([1-9][0-9]*)\.json$/;
var RELEASED_CLAIM_FILE_PATTERN = /^resumed-by\.([1-9][0-9]*)\.json\.released-/;
var REFUSAL_FILE = "resume-refused.json";
var MAX_CLAIM_ROUNDS = 8;
var heldClaimsKey = /* @__PURE__ */ Symbol.for("pi-subagents.workflow-resume-claims.v1");
var heldClaimsGlobal = globalThis;
var heldClaims = heldClaimsGlobal[heldClaimsKey] ?? (heldClaimsGlobal[heldClaimsKey] = /* @__PURE__ */ new Set());
function claimFilePath(asyncDir, generation) {
  return path9.join(asyncDir, `resumed-by.${generation}.json`);
}
function isClaim(value) {
  if (!isRecordedPid(value) || Array.isArray(value)) return false;
  const claim = value;
  return claim.version === 1 && typeof claim.claimedAt === "number" && typeof claim.newRunId === "string" && claim.newRunId.length > 0 && (claim.trigger === "auto" || claim.trigger === "manual" || claim.trigger === "reuse");
}
function readTopClaim(asyncDir, retries = 3) {
  let generation = 0;
  let releasedGeneration = 0;
  try {
    for (const name of fs10.readdirSync(asyncDir)) {
      const live = CLAIM_FILE_PATTERN.exec(name);
      if (live) generation = Math.max(generation, Number(live[1]));
      const released = RELEASED_CLAIM_FILE_PATTERN.exec(name);
      if (released) releasedGeneration = Math.max(releasedGeneration, Number(released[1]));
    }
  } catch (error2) {
    return error2.code === "ENOENT" ? { kind: "open", generation: 0 } : { kind: "unreadable" };
  }
  if (releasedGeneration > generation || generation === 0) return { kind: "open", generation: Math.max(releasedGeneration, generation) };
  const filePath = claimFilePath(asyncDir, generation);
  let text2;
  try {
    text2 = fs10.readFileSync(filePath, "utf-8");
  } catch (error2) {
    if (error2.code === "ENOENT" && retries > 0) return readTopClaim(asyncDir, retries - 1);
    return { kind: "unreadable" };
  }
  try {
    const value = JSON.parse(text2);
    return isClaim(value) ? { kind: "claim", generation, filePath, claim: value } : { kind: "open", generation };
  } catch {
    return { kind: "open", generation };
  }
}
function readWorkflowResumeClaim(asyncDir) {
  const top = readTopClaim(asyncDir);
  return top.kind === "claim" ? top.claim : void 0;
}
function resumedRunStarted(sourceAsyncDir, newRunId) {
  return path9.basename(newRunId) === newRunId && fs10.existsSync(path9.join(path9.dirname(sourceAsyncDir), newRunId, "status.json"));
}
function claimantLiveness(filePath, claim, liveness) {
  if (claim.pid === process.pid && claim.bootId === currentBootId() && claim.pidNamespaceScope === currentPidNamespaceScope()) return heldClaims.has(filePath) ? "alive" : "dead";
  return liveness ? liveness(claim) : checkRecordedPidLiveness(claim);
}
function workflowResumeClaimState(asyncDir, options = {}) {
  const top = readTopClaim(asyncDir);
  if (top.kind === "unreadable") return { kind: "unreadable" };
  if (top.kind !== "claim") return { kind: "none" };
  if (resumedRunStarted(asyncDir, top.claim.newRunId)) return { kind: "resumed", newRunId: top.claim.newRunId };
  return claimantLiveness(top.filePath, top.claim, options.liveness) === "dead" ? { kind: "none" } : { kind: "busy", pid: top.claim.pid, newRunId: top.claim.newRunId };
}
function createClaimFile(filePath, claim) {
  const tempPath = `${filePath}.${process.pid}.${randomUUID3()}.tmp`;
  try {
    fs10.writeFileSync(tempPath, JSON.stringify(claim, null, 2), "utf-8");
    fs10.linkSync(tempPath, filePath);
    return true;
  } catch (error2) {
    if (error2.code === "EEXIST") return false;
    throw error2;
  } finally {
    fs10.rmSync(tempPath, { force: true });
  }
}
function claimWorkflowResume(asyncDir, input) {
  const claim = {
    version: 1,
    ...currentRecordedPid(),
    claimedAt: input.now ?? Date.now(),
    newRunId: input.newRunId,
    trigger: input.trigger
  };
  for (let round = 0; round < MAX_CLAIM_ROUNDS; round++) {
    const top2 = readTopClaim(asyncDir);
    if (top2.kind === "unreadable") return { kind: "unreadable" };
    if (top2.kind === "claim") {
      if (top2.claim.newRunId === input.newRunId && top2.claim.pid === process.pid) {
        heldClaims.add(top2.filePath);
        return { kind: "owner" };
      }
      if (resumedRunStarted(asyncDir, top2.claim.newRunId)) return { kind: "resumed", newRunId: top2.claim.newRunId };
      if (claimantLiveness(top2.filePath, top2.claim, input.liveness) !== "dead") return { kind: "busy", pid: top2.claim.pid };
    }
    const filePath = claimFilePath(asyncDir, top2.generation + 1);
    if (createClaimFile(filePath, claim)) {
      heldClaims.add(filePath);
      return { kind: "owner" };
    }
  }
  const top = readTopClaim(asyncDir);
  return top.kind === "claim" ? { kind: "busy", pid: top.claim.pid } : { kind: "unreadable" };
}
function releaseWorkflowResumeClaim(asyncDir, newRunId) {
  const top = readTopClaim(asyncDir);
  if (top.kind !== "claim" || top.claim.newRunId !== newRunId || top.claim.pid !== process.pid) return;
  try {
    fs10.renameSync(top.filePath, `${top.filePath}.released-${randomUUID3()}`);
  } catch (error2) {
    if (error2.code !== "ENOENT") throw error2;
  }
  heldClaims.delete(top.filePath);
}
function recordWorkflowResumeRefusal(asyncDir, refusal, now = Date.now()) {
  writeAtomicJson(path9.join(asyncDir, REFUSAL_FILE), { version: 1, ...refusal, refusedAt: now });
}
function readWorkflowResumeRefusal(asyncDir) {
  try {
    const value = JSON.parse(fs10.readFileSync(path9.join(asyncDir, REFUSAL_FILE), "utf-8"));
    return value?.version === 1 && typeof value.reason === "string" && typeof value.byHand === "string" && typeof value.refusedAt === "number" && (value.newRunId === void 0 || typeof value.newRunId === "string") ? value : void 0;
  } catch {
    return void 0;
  }
}
function resumeByHandText(runId) {
  return `Resume by hand: subagent({ action: "resume", id: "${runId}" })`;
}
function relaunchByHandText(runId) {
  return `Relaunch it by hand with options: { reuseFrom: "${runId}" }.`;
}
function refusalSentence(reason, byHand) {
  return `${reason.replace(/\.$/, "")}.${byHand ? ` ${byHand}` : ""}`;
}
function hasWorkflowResumeRefusal(asyncDir) {
  return fs10.existsSync(path9.join(asyncDir, REFUSAL_FILE));
}
var RESUMED_AS = { auto: "Auto-resumed as", manual: "Resumed as", reuse: "Relaunched as" };
function describeWorkflowResume(asyncDir, runId) {
  const claim = readWorkflowResumeClaim(asyncDir);
  const refusal = readWorkflowResumeRefusal(asyncDir);
  if (refusal && (!claim || refusal.newRunId === claim.newRunId)) {
    return `Not auto-resumed: ${refusalSentence(refusal.reason, refusal.byHand)}`;
  }
  if (claim) return `${RESUMED_AS[claim.trigger]} ${claim.newRunId}.`;
  const launch = readWorkflowLaunchRecord(asyncDir);
  return launch.ok && launch.record.source !== "structured" ? resumeByHandText(runId) : relaunchByHandText(runId);
}

// src/runs/background/notify.ts
import { statSync as statSync2 } from "node:fs";
import { debuglog } from "node:util";

// src/runs/background/completion-dedupe.ts
function asNonEmptyString(value) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
function asFiniteNumber(value) {
  if (typeof value !== "number") return void 0;
  return Number.isFinite(value) ? value : void 0;
}
function buildCompletionKey(data, fallback) {
  const sessionId = asNonEmptyString(data.sessionId) ?? "no-session";
  const id = asNonEmptyString(data.id);
  const state = asNonEmptyString(data.state);
  if (id) return state ? `session:${sessionId}:id:${id}:state:${state}` : `session:${sessionId}:id:${id}`;
  const agent = asNonEmptyString(data.agent) ?? "unknown";
  const timestamp2 = asFiniteNumber(data.timestamp);
  const taskIndex = asFiniteNumber(data.taskIndex);
  const totalTasks = asFiniteNumber(data.totalTasks);
  const success = typeof data.success === "boolean" ? data.success ? "1" : "0" : "?";
  return [
    "meta",
    sessionId,
    agent,
    timestamp2 !== void 0 ? String(timestamp2) : "no-ts",
    taskIndex !== void 0 ? String(taskIndex) : "-",
    totalTasks !== void 0 ? String(totalTasks) : "-",
    success,
    fallback
  ].join(":");
}
function pruneSeenMap(seen, now, ttlMs) {
  for (const [key, ts] of seen.entries()) {
    if (now - ts > ttlMs) seen.delete(key);
  }
}
function markSeenWithTtl(seen, key, now, ttlMs) {
  pruneSeenMap(seen, now, ttlMs);
  if (seen.has(key)) return true;
  seen.set(key, now);
  return false;
}

// src/runs/background/completion-batcher.ts
var DEFAULT_COMPLETION_BATCH_CONFIG = {
  enabled: true,
  debounceMs: 150,
  maxWaitMs: 1e3,
  stragglerDebounceMs: 75,
  stragglerMaxWaitMs: 400,
  stragglerWindowMs: 2e3
};
function parsePositiveInt2(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) return void 0;
  return value;
}
function resolveCompletionBatchConfig(globalConfig, override) {
  const enabled = typeof override?.enabled === "boolean" ? override.enabled : typeof globalConfig?.enabled === "boolean" ? globalConfig.enabled : DEFAULT_COMPLETION_BATCH_CONFIG.enabled;
  return {
    enabled,
    debounceMs: parsePositiveInt2(override?.debounceMs) ?? parsePositiveInt2(globalConfig?.debounceMs) ?? DEFAULT_COMPLETION_BATCH_CONFIG.debounceMs,
    maxWaitMs: parsePositiveInt2(override?.maxWaitMs) ?? parsePositiveInt2(globalConfig?.maxWaitMs) ?? DEFAULT_COMPLETION_BATCH_CONFIG.maxWaitMs,
    stragglerDebounceMs: parsePositiveInt2(override?.stragglerDebounceMs) ?? parsePositiveInt2(globalConfig?.stragglerDebounceMs) ?? DEFAULT_COMPLETION_BATCH_CONFIG.stragglerDebounceMs,
    stragglerMaxWaitMs: parsePositiveInt2(override?.stragglerMaxWaitMs) ?? parsePositiveInt2(globalConfig?.stragglerMaxWaitMs) ?? DEFAULT_COMPLETION_BATCH_CONFIG.stragglerMaxWaitMs,
    stragglerWindowMs: parsePositiveInt2(override?.stragglerWindowMs) ?? parsePositiveInt2(globalConfig?.stragglerWindowMs) ?? DEFAULT_COMPLETION_BATCH_CONFIG.stragglerWindowMs
  };
}
var defaultTimers = {
  setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimeout: (handle) => clearTimeout(handle)
};
function unrefHandle(handle) {
  if (handle && typeof handle === "object" && "unref" in handle && typeof handle.unref === "function") {
    handle.unref();
  }
}
function createCompletionBatcher(options) {
  const timers = options.timers ?? defaultTimers;
  const now = options.now ?? Date.now;
  const config = options.config;
  if (!config.enabled) {
    return {
      push(item) {
        options.emit([item]);
      },
      flush() {
      },
      dispose() {
        return [];
      }
    };
  }
  let pending = [];
  let debounceTimer = null;
  let maxWaitTimer = null;
  let straggler = false;
  let lastEmitAt = null;
  const clearTimers = () => {
    if (debounceTimer) {
      timers.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (maxWaitTimer) {
      timers.clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }
  };
  const emitGroup = () => {
    clearTimers();
    if (pending.length === 0) return;
    const items = pending;
    pending = [];
    lastEmitAt = now();
    options.emit(items);
  };
  return {
    push(item) {
      if (pending.length === 0) {
        straggler = lastEmitAt !== null && now() - lastEmitAt < config.stragglerWindowMs;
      }
      pending.push(item);
      if (debounceTimer) timers.clearTimeout(debounceTimer);
      const debounceDelay = straggler ? config.stragglerDebounceMs : config.debounceMs;
      debounceTimer = timers.setTimeout(emitGroup, debounceDelay);
      unrefHandle(debounceTimer);
      if (!maxWaitTimer) {
        const maxWaitDelay = straggler ? config.stragglerMaxWaitMs : config.maxWaitMs;
        maxWaitTimer = timers.setTimeout(emitGroup, maxWaitDelay);
        unrefHandle(maxWaitTimer);
      }
    },
    flush: emitGroup,
    dispose() {
      clearTimers();
      const abandoned = pending;
      pending = [];
      return abandoned;
    }
  };
}

// src/runs/background/notify.ts
var CHILD_OUTPUT_PREVIEW_MAX_BYTES = 2e3;
var ERROR_LINE_MAX_BYTES = 300;
var CHILD_OUTPUT_PREVIEW_COUNT = 8;
var PREVIEW_TRUNCATION_MARKER = "...[preview truncated]";
var COMPLETION_SEND_TTL_MS = 10 * 60 * 1e3;
var COMPLETION_SEND_REGISTRY_CAP = 4096;
function truncateUtf8Head(value, maxBytes) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= maxBytes) return { text: value, truncated: false };
  const markerBytes = Buffer.byteLength(PREVIEW_TRUNCATION_MARKER, "utf8");
  const contentBytes = Math.max(0, maxBytes - markerBytes);
  let end = contentBytes;
  while (end > 0 && (bytes[end] & 192) === 128) end -= 1;
  return {
    text: `${bytes.subarray(0, end).toString("utf8")}${PREVIEW_TRUNCATION_MARKER}`,
    truncated: true
  };
}
function boundedSafeText(value, maxBytes = 1024) {
  return truncateUtf8Head(safeTerminalText(value).replace(/\n/g, "\\n"), maxBytes).text;
}
function outputPathFromReference(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && typeof value.path === "string" && value.path.trim()) return value.path.trim();
  return void 0;
}
function childSavedOutputPath(child) {
  return outputPathFromReference(child.outputReference);
}
function nonemptyPath(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function retainedChildPath(value, producerConfirmed = false) {
  const path17 = nonemptyPath(value);
  if (!path17) return { status: "unavailable" };
  if (producerConfirmed) return { status: "verified", path: path17 };
  try {
    return statSync2(path17).isFile() ? { status: "verified", path: path17 } : { status: "unavailable" };
  } catch (error2) {
    const code = typeof error2 === "object" && error2 !== null && "code" in error2 && typeof error2.code === "string" ? error2.code : void 0;
    if (code === "ENOENT" || code === "ENOTDIR") return { status: "unavailable" };
    return { status: "error", error: { path: path17, ...code ? { code } : {}, message: error2 instanceof Error ? error2.message : String(error2) } };
  }
}
function formatRetainedPathError(label, error2) {
  return `  ${label} verification failed: stat ${error2.code ? boundedSafeText(error2.code, 32) : "unknown"}; path=${boundedSafeText(error2.path, 384)}; ${boundedSafeText(error2.message, 512)}`;
}
function childStatus(child, workflowState) {
  const knownStatus = child.status === "complete" ? "completed" : child.status === "running" || child.status === "completed" || child.status === "failed" || child.status === "paused" || child.status === "stopped" || child.status === "detached" ? child.status : void 0;
  if (knownStatus) return knownStatus;
  return resolveSubagentResultStatus({
    success: child.success,
    state: child.state ?? (child.success === void 0 ? workflowState : void 0),
    interrupted: child.interrupted,
    detached: child.detached,
    processSignal: child.processSignal,
    timedOut: child.timedOut,
    stopped: child.stopped,
    turnBudgetExceeded: child.turnBudgetExceeded,
    exitCode: typeof child.exitCode === "number" ? child.exitCode : void 0
  });
}
function structuredOutputText(value) {
  if (value === void 0) return void 0;
  try {
    const serialized = JSON.stringify(value, null, 2);
    return typeof serialized === "string" ? serialized : void 0;
  } catch {
    return void 0;
  }
}
function isDegenerateOutput(text2) {
  return !text2.trim() || text2.trim() === "</think>";
}
function firstErrorLine(error2) {
  if (typeof error2 !== "string") return void 0;
  const line = error2.split("\n").find((part) => part.trim())?.trim();
  return line ? boundedSafeText(line, ERROR_LINE_MAX_BYTES) : void 0;
}
function childInlinePreview(child) {
  const output = typeof child.output === "string" ? child.output : "";
  const outputReference = childSavedOutputPath(child);
  const referenceOnly = Boolean(outputReference && output.trim().startsWith("Output saved to:"));
  const raw = child.outputState === "absent" || referenceOnly ? structuredOutputText(child.structuredOutput) : isDegenerateOutput(output) ? structuredOutputText(child.structuredOutput) ?? output : output;
  if (!raw?.trim()) {
    return { unavailableReason: referenceOnly ? "saved output is file-only" : "no safe inline output" };
  }
  const safe = safeTerminalText(raw);
  if (!safe.trim()) return { unavailableReason: "no safe inline output" };
  const bounded = truncateUtf8Head(safe, CHILD_OUTPUT_PREVIEW_MAX_BYTES);
  return { preview: bounded.text, ...bounded.truncated ? { truncated: true } : {} };
}
function formatChildOutputBlock(children) {
  if (!children?.length) return void 0;
  const lines = ["Child outputs:"];
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    const key = child.workflowKey ? boundedSafeText(child.workflowKey) : "unavailable";
    const runId = child.runId ? boundedSafeText(child.runId) : "unavailable";
    const status = boundedSafeText(child.status) || "unavailable";
    lines.push(`- key=${key} run=${runId} status=${status}`);
    if (child.revival) lines.push(`  ${boundedSafeText(child.revival)}`);
    lines.push(`  Saved output: ${child.savedOutputPath ? boundedSafeText(child.savedOutputPath) : "unavailable"}`);
    if (child.outputArtifactPath) lines.push(`  Output artifact (retention-managed): ${boundedSafeText(child.outputArtifactPath)}`);
    if (child.structuredOutputPath) lines.push(`  Structured output (retention-managed): ${boundedSafeText(child.structuredOutputPath)}`);
    if (child.outputArtifactError) lines.push(formatRetainedPathError("Output artifact", child.outputArtifactError));
    if (child.structuredOutputError) lines.push(formatRetainedPathError("Structured output", child.structuredOutputError));
    if (child.error) lines.push(`  Error: ${child.error}`);
    if (child.previewTruncated && !child.savedOutputPath && !child.outputArtifactPath) lines.push("  Full output unavailable");
    if (index >= CHILD_OUTPUT_PREVIEW_COUNT) {
      lines.push("  Preview: unavailable (notice preview budget exceeded)");
      continue;
    }
    if (!child.preview) {
      lines.push(`  Preview: unavailable (${child.previewUnavailableReason ?? "no safe inline output"})`);
      continue;
    }
    lines.push("  Preview:");
    for (const line of child.preview.split("\n")) lines.push(`    | ${line}`);
  }
  if (children.length > CHILD_OUTPUT_PREVIEW_COUNT) {
    lines.push(`- ${children.length - CHILD_OUTPUT_PREVIEW_COUNT} additional child preview(s) omitted by notice budget; child run metadata is retained below.`);
  }
  return lines.join("\n");
}
function formatResultPreview(details) {
  const summary = details.resultPreview.trim() ? details.resultPreview : "(no output)";
  const childOutputs = formatChildOutputBlock(details.childOutputs);
  return childOutputs ? `${summary}

${childOutputs}` : summary;
}
function formatSessionLine(details) {
  if (!details.sessionValue) return void 0;
  return details.sessionLabel ? `${details.sessionLabel}: ${details.sessionValue}` : details.sessionValue;
}
function formatChildRun(child) {
  const label = child.workflowKey ?? child.agent;
  const status = child.status ? ` (${child.status})` : "";
  return `${label ? `${label}=` : ""}${child.runId}${status}`;
}
function formatCorrelationLines(details) {
  return [
    details.asyncDir ? `Retention-managed async directory: ${boundedSafeText(details.asyncDir)}` : void 0,
    details.workflowRunId ? `Workflow run: ${details.workflowRunId}` : void 0,
    details.resumeNotice,
    details.childRuns?.length ? `Child runs: ${details.childRuns.map(formatChildRun).join(", ")}` : void 0,
    details.reconciledFromDetachedChild ? `Reconciled detached child: ${details.reconciledFromDetachedChild}` : void 0
  ].filter((line) => line !== void 0);
}
var RESUME_NOTICE_PREFIXES = ["Auto-resumed as ", "Resumed as ", "Relaunched as ", "Not auto-resumed: ", "Resume by hand: ", "Relaunch it by hand with "];
var WATCHDOG_BLOCKERS_HEADING = "Watchdog blockers:";
function formatWatchdogBlockerLines(details) {
  if (!details.watchdogBlockers?.length) return [];
  return [WATCHDOG_BLOCKERS_HEADING, ...details.watchdogBlockers.map((blocker) => `- ${blocker.agent}: ${blocker.summary} (${blocker.stalemate ? "stalemate" : blocker.addressed ? "addressed" : "unaddressed"})`)];
}
function parseWatchdogBlockerLines(lines) {
  const blockers = [];
  for (const line of lines) {
    const match = line.match(/^- (.+?): (.+) \((addressed|unaddressed|stalemate)\)$/);
    if (!match) break;
    blockers.push({ agent: match[1], summary: match[2], addressed: match[3] === "addressed", stalemate: match[3] === "stalemate" });
  }
  return blockers;
}
function formatSingleCompletion(details) {
  const sessionLine = formatSessionLine(details);
  const correlationLines = formatCorrelationLines(details);
  const watchdogLines = formatWatchdogBlockerLines(details);
  const taskKind = details.source === "foreground" ? "Detached foreground task" : "Background task";
  const scheduleLine = details.scheduleOrigin ? `Scheduled run from **${details.scheduleOrigin.name ?? details.scheduleOrigin.id}** (schedule ${details.scheduleOrigin.id}).` : void 0;
  return [
    `${taskKind} ${details.status}: **${details.agent}**${details.taskInfo ?? ""}`,
    details.workflowReceiptPath ? `Workflow receipt: ${details.workflowReceiptPath}` : void 0,
    "",
    scheduleLine,
    scheduleLine ? "" : void 0,
    formatResultPreview(details),
    ...watchdogLines.length ? ["", ...watchdogLines] : [],
    details.handoffPath ? "" : void 0,
    details.handoffPath ? `Parallel handoff: ${details.handoffPath}` : void 0,
    correlationLines.length && !details.handoffPath ? "" : void 0,
    ...correlationLines,
    sessionLine ? "" : void 0,
    sessionLine
  ].filter((line) => line !== void 0).join("\n");
}
function scheduledCompletionTriggersTurn(origin, outcome) {
  return !(origin?.quiet === true && outcome === "completed");
}
function incrementalChildCompletionTriggersTurn(child, origin) {
  if (child.workflowRunning && child.outcome === "completed") return false;
  return scheduledCompletionTriggersTurn(origin, child.outcome);
}
function formatIncrementalChildCompletion(child) {
  const statusText = child.outcome === "completed" ? "completed" : child.outcome === "failed" ? "failed" : child.outcome === "paused" ? "paused (needs attention)" : "stopped";
  const workflowStatus = child.workflowRunning ? "workflow still running" : "workflow finished";
  return [
    `Workflow child ${statusText}: **${child.childKey}**`,
    `Workflow run: ${child.workflowRunId}`,
    ...child.childRunId ? [`Child run: ${child.childRunId}`] : [],
    ...child.outputReference ? [`Output: ${child.outputReference}`] : [],
    ...child.error ? [`Error: ${child.error}`] : [],
    `Status: ${workflowStatus}`
  ].join("\n");
}
function parseSubagentNotifyContent(content) {
  const lines = content.split("\n");
  const match = (lines[0] ?? "").match(/^(Background task|Detached foreground task) (completed|failed|paused|stopped): \*\*(.+?)\*\*(?:\s+(\([^)]*\)))?$/);
  if (!match) return void 0;
  const receiptHeader = lines[1]?.startsWith("Workflow receipt: ") && lines[2] === "";
  const workflowReceiptPath2 = receiptHeader ? lines[1].slice("Workflow receipt: ".length) : void 0;
  let body = lines.slice(receiptHeader ? 3 : 2);
  const scheduleMatch = (body[0] ?? "").match(/^Scheduled run from \*\*(.+?)\*\* \(schedule (.+?)\)\.$/);
  let parsedScheduleOrigin;
  if (scheduleMatch) {
    const label = scheduleMatch[1];
    const id = scheduleMatch[2];
    parsedScheduleOrigin = { id, ...label === id ? {} : { name: label } };
    body = body.slice(body[1]?.trim() === "" ? 2 : 1);
  }
  let sessionIndex = -1;
  for (let i = body.length - 1; i >= 1; i--) {
    if (body[i - 1]?.trim() === "" && /^(Session|Session file|Session share error):\s+/.test(body[i])) {
      sessionIndex = i;
      break;
    }
  }
  const sessionLine = sessionIndex >= 0 ? body[sessionIndex] : void 0;
  const handoffIndex = body.findIndex((line) => line.startsWith("Parallel handoff: "));
  const workflowRunIndex = body.findIndex((line) => line.startsWith("Workflow run: "));
  const childRunsIndex = body.findIndex((line) => line.startsWith("Child runs: "));
  const reconciledIndex = body.findIndex((line) => line.startsWith("Reconciled detached child: "));
  const resumeNoticeLine = workflowRunIndex >= 0 ? body[workflowRunIndex + 1] : void 0;
  const resumeNotice = resumeNoticeLine && RESUME_NOTICE_PREFIXES.some((prefix) => resumeNoticeLine.startsWith(prefix)) ? resumeNoticeLine : void 0;
  const watchdogIndex = body.findIndex((line) => line === WATCHDOG_BLOCKERS_HEADING);
  const watchdogBlockers = watchdogIndex >= 0 ? parseWatchdogBlockerLines(body.slice(watchdogIndex + 1)) : [];
  const metadataIndexes = [sessionIndex, handoffIndex, workflowRunIndex, childRunsIndex, reconciledIndex, watchdogIndex].filter((index) => index >= 0);
  const firstMetadataIndex = metadataIndexes.length ? Math.min(...metadataIndexes) : body.length;
  const resultEnd = firstMetadataIndex > 0 && body[firstMetadataIndex - 1]?.trim() === "" ? firstMetadataIndex - 1 : firstMetadataIndex;
  const resultPreview = body.slice(0, resultEnd).join("\n").trim() || "(no output)";
  const handoffPath = handoffIndex >= 0 ? body[handoffIndex].slice("Parallel handoff: ".length).trim() : void 0;
  const workflowRunId = workflowRunIndex >= 0 ? body[workflowRunIndex].slice("Workflow run: ".length).trim() : void 0;
  const childRuns = childRunsIndex >= 0 ? body[childRunsIndex].slice("Child runs: ".length).split(", ").map((part) => {
    const trimmed = part.trim();
    const statusMatch = trimmed.match(/^(.*?)(?: \(([^)]*)\))?$/);
    const raw = statusMatch?.[1] ?? trimmed;
    const separator = raw.indexOf("=");
    return separator >= 0 ? { workflowKey: raw.slice(0, separator), runId: raw.slice(separator + 1), ...statusMatch?.[2] ? { status: statusMatch[2] } : {} } : { runId: raw, ...statusMatch?.[2] ? { status: statusMatch[2] } : {} };
  }).filter((child) => child.runId) : void 0;
  const reconciledFromDetachedChild = reconciledIndex >= 0 ? body[reconciledIndex].slice("Reconciled detached child: ".length).trim() : void 0;
  let sessionLabel;
  let sessionValue;
  if (sessionLine) {
    const separator = sessionLine.indexOf(":");
    sessionLabel = sessionLine.slice(0, separator).toLowerCase();
    sessionValue = sessionLine.slice(separator + 1).trim();
  }
  return {
    agent: match[3],
    status: match[2],
    ...match[1] === "Detached foreground task" ? { source: "foreground" } : {},
    ...match[4] ? { taskInfo: match[4] } : {},
    ...parsedScheduleOrigin ? { scheduleOrigin: parsedScheduleOrigin } : {},
    ...workflowReceiptPath2 ? { workflowReceiptPath: workflowReceiptPath2 } : {},
    resultPreview,
    ...handoffPath ? { handoffPath } : {},
    ...workflowRunId ? { workflowRunId } : {},
    ...resumeNotice ? { resumeNotice } : {},
    ...childRuns?.length ? { childRuns } : {},
    ...reconciledFromDetachedChild ? { reconciledFromDetachedChild } : {},
    ...watchdogBlockers.length ? { watchdogBlockers } : {},
    ...sessionLabel && sessionValue ? { sessionLabel, sessionValue } : {}
  };
}
function formatGroupedCompletion(details) {
  const header = `Background tasks completed (${details.length}): ${details.map((d) => `**${d.agent}**${d.taskInfo ?? ""}`).join(", ")}`;
  const blocks = [header, ""];
  for (let index = 0; index < details.length; index++) {
    const detail = details[index];
    if (!detail) continue;
    const sessionLine = formatSessionLine(detail);
    blocks.push(`${index + 1}. ${detail.agent}${detail.taskInfo ?? ""}${detail.scheduleOrigin ? ` \u2014 scheduled run from ${detail.scheduleOrigin.name ?? detail.scheduleOrigin.id} (schedule ${detail.scheduleOrigin.id})` : ""}`);
    if (detail.workflowReceiptPath) blocks.push(`Workflow receipt: ${detail.workflowReceiptPath}`);
    blocks.push(formatResultPreview(detail));
    blocks.push(...formatWatchdogBlockerLines(detail));
    if (detail.handoffPath) blocks.push(`Parallel handoff: ${detail.handoffPath}`);
    blocks.push(...formatCorrelationLines(detail));
    if (sessionLine) blocks.push(sessionLine);
    blocks.push("");
  }
  return blocks.join("\n").trimEnd();
}
var notificationDebug = debuglog("pi-subagents-notify");
function traceIdentity(result5) {
  const identity = (value) => typeof value === "string" ? value.slice(0, 128).replace(/[^a-zA-Z0-9_.:-]/g, "_") : void 0;
  return { id: identity(result5.id), runId: identity(result5.runId), source: result5.source === "foreground" ? "foreground" : "async" };
}
function traceNotification(reason, result5) {
  if (!notificationDebug.enabled) return;
  try {
    notificationDebug("%s", JSON.stringify({ reason, ...result5 ? traceIdentity(result5) : {} }));
  } catch {
  }
}
function createCompletionSendRegistry(ttlMs = COMPLETION_SEND_TTL_MS, cap = COMPLETION_SEND_REGISTRY_CAP) {
  const entries = /* @__PURE__ */ new Map();
  const prune = (now) => {
    for (const [key, entry] of entries) {
      if (entry.deliveredAt !== void 0 && now - entry.deliveredAt > ttlMs) entries.delete(key);
    }
    if (entries.size <= cap) return;
    for (const [key, entry] of entries) {
      if (entries.size <= cap) break;
      if (entry.deliveredAt !== void 0) entries.delete(key);
    }
  };
  return {
    claim(key, now) {
      prune(now);
      const existing = entries.get(key);
      if (existing) return { owned: false, outcome: existing.outcome };
      let resolve4;
      const entry = {
        outcome: new Promise((settle) => {
          resolve4 = settle;
        }),
        resolve: (accepted) => resolve4(accepted)
      };
      entries.set(key, entry);
      return {
        owned: true,
        outcome: entry.outcome,
        settle(accepted) {
          if (entries.get(key) !== entry) return;
          if (accepted) {
            entry.deliveredAt = now;
            prune(now);
          } else {
            entries.delete(key);
          }
          entry.resolve(accepted);
        }
      };
    }
  };
}
var completionSendRegistrySymbol = /* @__PURE__ */ Symbol.for("pi-subagents.completion-send-registry.v1");
var processGlobal = globalThis;
var processCompletionSendRegistry = processGlobal[completionSendRegistrySymbol] ?? (processGlobal[completionSendRegistrySymbol] = createCompletionSendRegistry());
var queuedWakesSymbol = /* @__PURE__ */ Symbol.for("pi-subagents.queued-completion-wakes.v2");
var wakeGlobal2 = globalThis;
var queuedWakes = wakeGlobal2[queuedWakesSymbol] ?? (wakeGlobal2[queuedWakesSymbol] = /* @__PURE__ */ new WeakMap());
function notifyRunDetails({ resultPreview: _preview, childOutputs, ...run }) {
  return {
    ...run,
    ...childOutputs ? { childOutputs: childOutputs.map(({ preview: _childPreview, previewTruncated: _truncated, previewUnavailableReason: _reason, ...child }) => child) } : {}
  };
}
var PENDING_NOTICE_ENTRY = "subagent-notify-pending";
function unreplayedPendingNotices(entries) {
  const pending = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (entry.type === "custom" && entry.customType === PENDING_NOTICE_ENTRY) {
      const message = entry.data?.message;
      if (message?.customType === "subagent-notify" && typeof message.content === "string") pending.set(message.content, message);
    } else if (entry.type === "custom_message" && entry.customType === "subagent-notify" && typeof entry.content === "string") {
      pending.delete(entry.content);
    }
  }
  return [...pending.values()];
}
var HELD_COMPLETION_ACTION = "The user stopped the parent turn. Report these results at the user's next prompt and do not resume the stopped task unless asked.";
function sendCompletion(pi, items, unstartedWakes, unansweredCompletions, updateSettleSubscription, queuedNotices) {
  if (items.length === 0) return true;
  const details = items.map((item) => item.details);
  const triggerTurn = items.some((item) => item.triggerTurn);
  const formatted = details.length === 1 ? formatSingleCompletion(details[0]) : formatGroupedCompletion(details);
  const held = pi.isHeld();
  const content = triggerTurn ? `${formatted}

Parent action: ${held ? HELD_COMPLETION_ACTION : COMPLETION_ACTION}` : formatted;
  const display = details.some((detail) => detail.source === "foreground" || detail.status !== "completed" || detail.scheduleOrigin !== void 0);
  const tracked = triggerTurn && !held;
  const message = {
    customType: "subagent-notify",
    content,
    display,
    // Pi does not send details to the model. Hosts match runs by id; the text previews stay in content only.
    details: { runs: details.map(notifyRunDetails) }
  };
  if (tracked) {
    unstartedWakes.push(content);
    queuedNotices.set(content, message);
    unansweredCompletions.set(content, { reminded: false });
    updateSettleSubscription();
  }
  try {
    const appended = pi.sendMessage(message, { triggerTurn });
    if (appended && tracked) unstartedWakes.splice(unstartedWakes.lastIndexOf(content), 1);
    if (tracked && !unstartedWakes.includes(content)) queuedNotices.delete(content);
    return true;
  } catch {
    if (tracked) {
      unstartedWakes.splice(unstartedWakes.lastIndexOf(content), 1);
      if (!unstartedWakes.includes(content)) queuedNotices.delete(content);
      unansweredCompletions.delete(content);
      updateSettleSubscription();
    }
    return false;
  }
}
function completionBatchKey(result5) {
  const sessionId = typeof result5.sessionId === "string" ? result5.sessionId.trim() : "";
  if (sessionId) return `session:${sessionId}`;
  const cwd = typeof result5.cwd === "string" ? result5.cwd.trim() : "";
  return cwd ? `cwd:${cwd}` : "unknown";
}
function buildCompletionDetails(result5) {
  const agent = result5.agent ?? "unknown";
  const summary = typeof result5.summary === "string" ? result5.summary : "";
  const stopped = result5.stopped === true || result5.state === "stopped" || result5.success !== true && result5.exitCode !== 0 && isUnexplainedProcessSignal(result5) || result5.results?.some((child) => child.stopped === true || child.status === "stopped" || child.success !== true && child.exitCode !== 0 && isUnexplainedProcessSignal(child)) === true;
  const paused = !stopped && !result5.success && (result5.exitCode === 0 || result5.state === "paused" || result5.interrupted === true || summary.startsWith("Paused after interrupt."));
  const status = stopped ? "stopped" : paused ? "paused" : result5.success ? "completed" : "failed";
  const runningChildren = result5.mode === "workflow" || agent === "workflow" ? result5.results?.filter((child) => childStatus(child) === "running").length ?? 0 : 0;
  const taskInfo = runningChildren > 0 ? ` (${status === "completed" ? "dispatch complete; " : ""}${runningChildren} ${runningChildren === 1 ? "child" : "children"} running or uncollected)` : result5.taskIndex !== void 0 && result5.totalTasks !== void 0 ? ` (${result5.taskIndex + 1}/${result5.totalTasks})` : void 0;
  const parallelHandoff = result5.parallelHandoff && typeof result5.parallelHandoff === "object" ? result5.parallelHandoff : void 0;
  const handoffPath = typeof parallelHandoff?.path === "string" ? parallelHandoff.path : void 0;
  const receipt = result5.workflowReceipt;
  const receiptPath = receipt && typeof receipt === "object" && !Array.isArray(receipt) ? receipt.path : void 0;
  const workflowReceiptPath2 = typeof receiptPath === "string" && receiptPath ? receiptPath : void 0;
  const rawRunId = typeof result5.runId === "string" ? result5.runId : typeof result5.id === "string" ? result5.id : void 0;
  const workflowRunId = (result5.mode === "workflow" || agent === "workflow") && rawRunId ? rawRunId : void 0;
  const directChild = !workflowRunId && result5.results?.length === 1 ? result5.results[0] : void 0;
  const directStructuredPreview = directChild ? childInlinePreview(directChild).preview : void 0;
  const directSummary = summary.trim();
  const directAgent = typeof directChild?.agent === "string" ? directChild.agent : agent;
  const directSummaryBody = directAgent && summary.trimStart().startsWith(`${directAgent}:
`) ? summary.trimStart().slice(directAgent.length + 2) : directSummary;
  const directDegenerateSummary = directChild && isDegenerateOutput(typeof directChild.output === "string" ? directChild.output : "") && isDegenerateOutput(directSummaryBody) && structuredOutputText(directChild.structuredOutput) !== void 0;
  const directNoOutputSummary = directChild && (!directSummary || directSummary === "(no output)" || directAgent && directSummary === `${directAgent}:
(no output)`);
  const outputPreview = directStructuredPreview && (directNoOutputSummary || directDegenerateSummary) ? `Structured output:
${directStructuredPreview}` : capSummaryOutputs(summary, result5.results);
  const errorSources = status === "completed" ? [] : [
    { agent: void 0, error: result5.error },
    ...(workflowRunId ? [] : result5.results ?? []).filter((child) => child.success !== true).map((child) => ({ agent: child.agent, error: child.error }))
  ];
  const errorLines = [...new Set(errorSources.flatMap(({ agent: errorAgent, error: error2 }) => {
    const line = firstErrorLine(error2);
    return line && !outputPreview.includes(line) ? [`Error${errorAgent && (result5.results?.length ?? 0) > 1 ? ` (${errorAgent})` : ""}: ${line}`] : [];
  }))];
  const resultPreview = errorLines.length ? `${errorLines.join("\n")}

${outputPreview}` : outputPreview;
  const childRuns = result5.results?.flatMap((child) => {
    const runId = typeof child.runId === "string" && child.runId.trim() ? child.runId.trim() : void 0;
    const workflowKey = typeof child.workflowKey === "string" && child.workflowKey.trim() ? child.workflowKey.trim() : void 0;
    if (!runId && (!workflowRunId || !workflowKey)) return [];
    return [{
      runId: runId ?? "unavailable",
      ...workflowKey ? { workflowKey } : {},
      ...typeof child.agent === "string" ? { agent: child.agent } : {},
      status: childStatus(child, workflowRunId ? result5.state : void 0)
    }];
  }) ?? [];
  const childOutputs = workflowRunId && result5.results?.length ? result5.results.map((child) => {
    const inline = childInlinePreview(child);
    const workflowKey = typeof child.workflowKey === "string" && child.workflowKey.trim() ? child.workflowKey.trim() : void 0;
    const runId = typeof child.runId === "string" && child.runId.trim() ? child.runId.trim() : void 0;
    const savedOutputPath = childSavedOutputPath(child);
    const outputArtifact = child.artifactOutputSaveFailed === true ? { status: "unavailable" } : retainedChildPath(child.artifactPaths?.outputPath);
    const structuredOutput = child.stopped === true || child.timedOut === true ? { status: "unavailable" } : retainedChildPath(child.structuredOutputPath, child.structuredOutput !== void 0);
    const status2 = childStatus(child, result5.state);
    const error2 = status2 === "completed" || status2 === "running" ? void 0 : firstErrorLine(child.error);
    return {
      ...workflowKey ? { workflowKey } : {},
      ...runId ? { runId } : {},
      ...typeof child.agent === "string" ? { agent: child.agent } : {},
      status: status2,
      ...typeof child.revival === "string" && child.revival ? { revival: child.revival } : {},
      ...savedOutputPath ? { savedOutputPath } : {},
      ...outputArtifact.status === "verified" ? { outputArtifactPath: outputArtifact.path } : {},
      ...structuredOutput.status === "verified" ? { structuredOutputPath: structuredOutput.path } : {},
      ...outputArtifact.status === "error" ? { outputArtifactError: outputArtifact.error } : {},
      ...structuredOutput.status === "error" ? { structuredOutputError: structuredOutput.error } : {},
      ...error2 ? { error: error2 } : {},
      ...inline.preview ? { preview: inline.preview } : { preview: "" },
      ...inline.truncated ? { previewTruncated: true } : {},
      ...inline.unavailableReason ? { previewUnavailableReason: inline.unavailableReason } : {}
    };
  }) : void 0;
  const reconciledFromDetachedChild = typeof result5.reconciledFromDetachedChild === "string" ? result5.reconciledFromDetachedChild : void 0;
  const asyncDir = nonemptyPath(result5.asyncDir);
  const stopCause = result5.workflow?.stopCause;
  const resumeNotice = workflowRunId && asyncDir && isReusableWorkflowStopCause(stopCause) ? describeWorkflowResume(asyncDir, workflowRunId) : void 0;
  const watchdogBlockers = [];
  const watchdogConcerns = [];
  const collectWatchdogFindings = (owner, progress) => {
    for (const warning of progress?.warnings ?? []) {
      if (warning.importance !== "high") continue;
      if (warning.severity === "blocker") watchdogBlockers.push({ agent: owner, summary: warning.summary, addressed: warning.addressed, stalemate: warning.stalemate });
      else watchdogConcerns.push(`${owner}: ${warning.summary}
Evidence: ${warning.evidence}
Recommended action: ${warning.recommendedAction}`);
    }
  };
  collectWatchdogFindings(agent, result5.watchdog);
  for (const child of result5.results ?? []) collectWatchdogFindings(typeof child.agent === "string" ? child.agent : agent, child.watchdog);
  const session = result5.shareUrl ? { label: "Session", value: result5.shareUrl } : result5.shareError ? { label: "Session share error", value: result5.shareError } : result5.sessionFile ? { label: "Session file", value: result5.sessionFile } : void 0;
  const rawOrigin = result5.scheduleOrigin;
  const scheduleOrigin = rawOrigin && typeof rawOrigin.id === "string" ? { id: rawOrigin.id, ...typeof rawOrigin.name === "string" ? { name: rawOrigin.name } : {} } : void 0;
  return {
    agent,
    status,
    ...scheduleOrigin ? { scheduleOrigin } : {},
    ...workflowReceiptPath2 ? { workflowReceiptPath: workflowReceiptPath2 } : {},
    ...asyncDir ? { asyncDir } : {},
    ...result5.source ? { source: result5.source } : {},
    ...taskInfo ? { taskInfo } : {},
    resultPreview: watchdogConcerns.length ? `${resultPreview}

High-importance watchdog concerns:
${watchdogConcerns.map((warning) => `- ${warning}`).join("\n")}` : resultPreview,
    ...typeof result5.durationMs === "number" ? { durationMs: result5.durationMs } : {},
    ...handoffPath ? { handoffPath } : {},
    ...rawRunId ? { runId: rawRunId } : {},
    ...workflowRunId ? { workflowRunId } : {},
    ...resumeNotice ? { resumeNotice } : {},
    ...childRuns.length ? { childRuns } : {},
    ...childOutputs?.length ? { childOutputs } : {},
    ...reconciledFromDetachedChild ? { reconciledFromDetachedChild } : {},
    ...watchdogBlockers.length ? { watchdogBlockers } : {},
    ...session ? { sessionLabel: session.label, sessionValue: session.value } : {}
  };
}
function registerSubagentNotify(pi, state, options = {}) {
  const seen = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Map();
  const ttlMs = COMPLETION_SEND_TTL_MS;
  const now = options.now ?? Date.now;
  const sendRegistry = options.sendRegistry ?? processCompletionSendRegistry;
  const batchConfig = resolveCompletionBatchConfig(options.batchConfig);
  const batchers = /* @__PURE__ */ new Map();
  let unstartedWakes = [];
  let queuedNotices = /* @__PURE__ */ new Map();
  let unansweredCompletions = /* @__PURE__ */ new Map();
  let bound = false;
  let boundSessionId;
  let disposed = false;
  let unsubscribeSettle;
  const ownsResult = options.ownership?.owns ?? ((sessionId, completionOwnerId) => sessionId === state.currentSessionId && typeof completionOwnerId === "string" && completionOwnerId === state.completionOwnerId);
  const settle = (items, accepted, reason) => {
    for (const item of items) {
      if (reason) traceNotification(reason, item.trace);
      pending.delete(item.key);
      if (accepted) markSeenWithTtl(seen, item.key, now(), ttlMs);
      item.resolve(accepted);
    }
  };
  const emit = (items) => {
    const accepted = [];
    const rejected = [];
    for (const item of items) {
      const owned = item.details.source === "foreground" ? item.sessionId === state.currentSessionId : ownsResult(item.sessionId, item.completionOwnerId);
      if (!owned) traceNotification(item.details.source === "foreground" ? "emit_foreground_session_mismatch" : "emit_not_owned", item.trace);
      (owned ? accepted : rejected).push(item);
    }
    settle(rejected, false);
    const claimed = [];
    for (const item of accepted) {
      const claim = sendRegistry.claim(item.key, now());
      if (claim.owned) {
        claimed.push({ item, claim });
        continue;
      }
      traceNotification("send_joined", item.trace);
      void claim.outcome.then((outcome) => settle([item], outcome, outcome ? void 0 : "send_failed"));
    }
    const claimedItems = claimed.map(({ item }) => item);
    const sent = sendCompletion(pi, claimedItems, unstartedWakes, unansweredCompletions, updateSettleSubscription, queuedNotices);
    for (const { claim } of claimed) claim.settle?.(sent);
    settle(claimedItems, sent, sent ? "send_accepted" : "send_failed");
  };
  const getBatcher = (result5) => {
    const key = completionBatchKey(result5);
    let batcher = batchers.get(key);
    if (!batcher) {
      batcher = createCompletionBatcher({
        config: batchConfig,
        emit,
        ...options.timers ? { timers: options.timers } : {},
        now
      });
      batchers.set(key, batcher);
    }
    return batcher;
  };
  const deliver = (result5) => {
    if (disposed || typeof result5.sessionId !== "string") {
      traceNotification(disposed ? "disposed" : "missing_session", result5);
      return Promise.resolve(false);
    }
    if (result5.source === "foreground") {
      if (result5.sessionId !== state.currentSessionId) {
        traceNotification("foreground_session_mismatch", result5);
        return Promise.resolve(false);
      }
    } else if (!ownsResult(result5.sessionId, result5.completionOwnerId)) {
      traceNotification("not_owned", result5);
      return Promise.resolve(false);
    }
    if (result5.intercomDelivered === true) {
      traceNotification("intercom_delivered", result5);
      return Promise.resolve(true);
    }
    const key = buildCompletionKey(result5, "notify");
    const seenAt = seen.get(key);
    if (seenAt !== void 0 && now() - seenAt <= ttlMs) {
      traceNotification("deduped_ttl", result5);
      return Promise.resolve(true);
    }
    if (seenAt !== void 0) seen.delete(key);
    const inFlight2 = pending.get(key);
    if (inFlight2) {
      traceNotification("deduped_pending", result5);
      return inFlight2;
    }
    const details = buildCompletionDetails(result5);
    let resolve4;
    const completion = new Promise((settleCompletion) => {
      resolve4 = settleCompletion;
    });
    pending.set(key, completion);
    const item = {
      key,
      details,
      sessionId: result5.sessionId,
      completionOwnerId: result5.completionOwnerId,
      triggerTurn: result5.triggerTurn !== false && scheduledCompletionTriggersTurn(result5.scheduleOrigin, details.status),
      resolve: resolve4
    };
    if (notificationDebug.enabled) item.trace = traceIdentity(result5);
    if (details.source === "foreground") {
      emit([item]);
      return completion;
    }
    const batcher = getBatcher(result5);
    if (details.status !== "completed") {
      batcher.flush();
      emit([item]);
      return completion;
    }
    if (batchConfig.enabled) traceNotification("batch_deferred", item.trace);
    batcher.push(item);
    return completion;
  };
  const replayNotices = (sessionId, messages) => {
    if (disposed || boundSessionId !== sessionId) return;
    for (const message of messages) {
      if (unstartedWakes.includes(message.content)) continue;
      const tracked = !pi.isHeld();
      if (tracked) {
        unstartedWakes.push(message.content);
        unansweredCompletions.set(message.content, { reminded: false });
        queuedNotices.set(message.content, message);
        updateSettleSubscription();
      }
      traceNotification("replayed");
      const release = () => {
        unstartedWakes.splice(unstartedWakes.lastIndexOf(message.content), 1);
        if (!unstartedWakes.includes(message.content)) queuedNotices.delete(message.content);
      };
      try {
        if (pi.sendMessage(message, { triggerTurn: true }) && tracked) release();
      } catch (error2) {
        console.error("Failed to resend a subagent completion notice recorded at the last shutdown; the next start retries it:", error2);
        if (tracked) {
          release();
          unansweredCompletions.delete(message.content);
          updateSettleSubscription();
        }
      }
    }
  };
  const handleBeforeSettle = (event) => {
    if (disposed || event.outcome !== "completed" || event.continue || event.context.pendingMessages.length)
      return;
    const messages = event.context.contextMessages;
    const ignored = [];
    for (const [content, notice] of unansweredCompletions) {
      const index = messages.findLastIndex((message) => message.role === "custom" && message.customType === "subagent-notify" && message.content === content);
      if (index === -1) {
        unansweredCompletions.delete(content);
        continue;
      }
      const acted = messages.slice(index + 1).some((message) => message.role === "assistant" && message.content.some((part) => part.type === "toolCall" || part.type === "text" && part.text.trim()));
      if (acted) {
        unansweredCompletions.delete(content);
        continue;
      }
      ignored.push([content, notice]);
    }
    updateSettleSubscription();
    if (!ignored.length)
      return;
    const fresh = ignored.filter(([, notice]) => !notice.reminded);
    if (fresh.length) {
      for (const [, notice] of fresh)
        notice.reminded = true;
      return {
        entries: [...event.entries, {
          type: "custom_message",
          customType: "subagent-completion-unanswered",
          display: true,
          content: "Completion wake ended silently. See the subagent completion notices above. " + COMPLETION_ACTION
        }],
        continue: true
      };
    }
    for (const [content] of ignored)
      unansweredCompletions.delete(content);
    updateSettleSubscription();
    return {
      entries: [...event.entries, {
        type: "custom_message",
        customType: "subagent-completion-unhandled",
        display: true,
        content: "UNHANDLED: no response to the subagent completion notices above. Reminder budget exhausted; results remain saved. No work was rerun or approval inferred."
      }]
    };
  };
  const updateSettleSubscription = () => {
    if (!disposed && unansweredCompletions.size && !unsubscribeSettle)
      unsubscribeSettle = pi.on?.("agent_before_settle", handleBeforeSettle);
    if (disposed || !unansweredCompletions.size) {
      unsubscribeSettle?.();
      unsubscribeSettle = void 0;
    }
  };
  const unsubscribeAsync = pi.events.on(SUBAGENT_ASYNC_COMPLETE_EVENT, (data) => {
    if (data.awaitedByWorkflow === true) return;
    void deliver(data);
  });
  const unsubscribeForeground = pi.events.on(SUBAGENT_FOREGROUND_COMPLETE_EVENT, (data) => {
    void deliver(data);
  });
  return {
    deliver,
    hasPendingDelivery: () => pending.size > 0 || unstartedWakes.length > 0,
    messageStarted(message) {
      if (message.role !== "custom" || message.customType !== "subagent-notify") return;
      const index = unstartedWakes.indexOf(message.content);
      if (index !== -1) unstartedWakes.splice(index, 1);
      if (!unstartedWakes.includes(message.content)) queuedNotices.delete(message.content);
    },
    bindSession(sessionManager) {
      if (disposed) return;
      const sessionId = sessionManager.getSessionId();
      const retained = queuedWakes.get(sessionManager);
      const wakes = retained?.sessionId === sessionId ? retained.wakes : [];
      const unanswered = retained?.sessionId === sessionId && retained.unansweredCompletions instanceof Map ? retained.unansweredCompletions : new Map(wakes.map((content) => [content, { reminded: false }]));
      const notices = retained?.sessionId === sessionId && retained.notices instanceof Map ? retained.notices : /* @__PURE__ */ new Map();
      if (!bound) {
        wakes.push(...unstartedWakes);
        for (const [content, notice] of unansweredCompletions) unanswered.set(content, notice);
        for (const [content, notice] of queuedNotices) notices.set(content, notice);
      }
      bound = true;
      boundSessionId = sessionId;
      unstartedWakes = wakes;
      unansweredCompletions = unanswered;
      queuedNotices = notices;
      const firstBind = retained?.sessionId !== sessionId;
      queuedWakes.set(sessionManager, { sessionId, wakes, unansweredCompletions, notices });
      updateSettleSubscription();
      if (firstBind && typeof sessionManager.getBranch === "function") {
        const pendingNotices = unreplayedPendingNotices(sessionManager.getBranch());
        if (pendingNotices.length) (options.timers?.setTimeout ?? setTimeout)(() => replayNotices(sessionId, pendingNotices), 0);
      }
    },
    sessionShutdown(reason) {
      if (reason !== "reload") {
        for (const content of new Set(unstartedWakes)) {
          const message = queuedNotices.get(content) ?? { customType: "subagent-notify", content, display: true, details: { runs: [] } };
          try {
            pi.appendEntry?.(PENDING_NOTICE_ENTRY, { message });
            traceNotification(pi.appendEntry ? "shutdown_persisted" : "shutdown_persist_failed");
          } catch (error2) {
            traceNotification("shutdown_persist_failed");
            console.error("Failed to record an undelivered subagent completion notice in the session; it is lost:", error2);
          }
        }
        queuedNotices.clear();
        unstartedWakes.length = 0;
        unansweredCompletions.clear();
      }
      unsubscribeSettle?.();
      unsubscribeSettle = void 0;
    },
    flush() {
      for (const batcher of batchers.values()) batcher.flush();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      updateSettleSubscription();
      for (const batcher of batchers.values()) settle(batcher.dispose(), false, "dispose_pending");
      batchers.clear();
      unansweredCompletions = /* @__PURE__ */ new Map();
      for (const unsubscribe of [unsubscribeAsync, unsubscribeForeground]) {
        try {
          unsubscribe?.();
        } catch {
        }
      }
    }
  };
}

// src/integrations/herdr-status.ts
var HERDR_FOREGROUND_CONTROL_CHANGED_EVENT = "pi-subagents:herdr:foreground-control-changed";
var DEFAULT_SOURCE = "pi-subagents:herdr";
var DEFAULT_TTL_MS = 12e4;
var DEFAULT_REFRESH_MS = 45e3;
var MAX_TASK_LABEL_CHARS = 80;
var MAX_TITLE_TASK_CHARS = 42;
var MAX_WORKFLOW_LABEL_NODES = 128;
var MAX_WORKFLOW_LABEL_DEPTH = 8;
var metadataReportSeq = Date.now() * 1e3;
function nextMetadataReportSeq() {
  metadataReportSeq = Math.max(metadataReportSeq + 1, Date.now() * 1e3);
  return metadataReportSeq;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function boundedTaskLabel(value, maxChars = MAX_TASK_LABEL_CHARS) {
  if (typeof value !== "string") return void 0;
  const normalized = sanitizeDisplayText(value).trim();
  if (!normalized) return void 0;
  return previewDisplayText(normalized, maxChars);
}
function workflowTaskLabel(data) {
  const explicit = boundedTaskLabel(data.taskLabel);
  if (explicit) return explicit;
  if (!isRecord(data.workflowGraph) || !Array.isArray(data.workflowGraph.nodes)) return void 0;
  const currentNodeId = typeof data.workflowGraph.currentNodeId === "string" ? data.workflowGraph.currentNodeId : void 0;
  const nodes = [];
  const collect = (values, depth) => {
    if (depth > MAX_WORKFLOW_LABEL_DEPTH || nodes.length >= MAX_WORKFLOW_LABEL_NODES) return;
    for (const value of values) {
      if (nodes.length >= MAX_WORKFLOW_LABEL_NODES) return;
      if (!isRecord(value)) continue;
      nodes.push(value);
      if (Array.isArray(value.children)) collect(value.children, depth + 1);
    }
  };
  collect(data.workflowGraph.nodes, 0);
  const current = currentNodeId ? nodes.find((node) => node.id === currentNodeId) : void 0;
  const active2 = current ?? nodes.find((node) => node.status === "running") ?? nodes.find((node) => node.status === "pending");
  return boundedTaskLabel(active2?.label);
}
function startedRun(data) {
  if (!isRecord(data) || typeof data.id !== "string" || !data.id) return void 0;
  const taskLabel = workflowTaskLabel(data);
  const isWorkflowCoordinator = data.mode === "workflow";
  return {
    id: data.id,
    ...isWorkflowCoordinator ? { coordinator: true } : {},
    ...!isWorkflowCoordinator && typeof data.agent === "string" ? { agent: data.agent } : {},
    ...isWorkflowCoordinator ? { agents: [] } : Array.isArray(data.agents) && data.agents.every((agent) => typeof agent === "string") ? { agents: data.agents } : {},
    ...taskLabel ? { taskLabel } : {}
  };
}
function completedRunId(data) {
  if (!isRecord(data)) return void 0;
  const id = typeof data.runId === "string" ? data.runId : data.id;
  return typeof id === "string" && id.length > 0 ? id : void 0;
}
function attentionRunId(data) {
  if (!isRecord(data) || data.source !== "async" || !isRecord(data.event)) return void 0;
  if (data.event.type !== "needs_attention" || typeof data.event.runId !== "string" || !data.event.runId) return void 0;
  return data.event.runId;
}
function registerHerdrStatusBridge(options) {
  const env = options.env ?? process.env;
  const paneId2 = env.HERDR_PANE_ID;
  const enabled = env.HERDR_ENV === "1" && typeof paneId2 === "string" && paneId2.length > 0;
  const runHerdr = options.runHerdr;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const refreshMs = options.refreshMs ?? DEFAULT_REFRESH_MS;
  const timers = options.timers ?? { setInterval, clearInterval };
  const runs = /* @__PURE__ */ new Map();
  const attentionRuns = /* @__PURE__ */ new Set();
  const acknowledgedAttention = /* @__PURE__ */ new Set();
  const subscriptions = [];
  let rootSession = false;
  let published = false;
  let busyRaised = false;
  let busyLabel;
  let disposed = false;
  let pendingReport;
  let draining = false;
  let drainPromise = Promise.resolve();
  let refreshTimer;
  const activeAgentNames = () => [...new Set([...runs.values()].flatMap((run) => run.agents?.length ? run.agents : run.agent ? [run.agent] : []))];
  const activeSubagentCount = () => [...runs.values()].reduce((total, run) => total + (run.coordinator && !run.agents?.length ? 0 : Math.max(1, run.agents?.length ?? (run.agent ? 1 : 0))), 0);
  const activeTaskLabel = () => [...runs.values()].reverse().find((run) => run.taskLabel)?.taskLabel;
  const label = (includeAttention = false) => {
    const agents = activeAgentNames();
    const activeCount = activeSubagentCount();
    const who = agents.length > 0 ? ` (${agents.slice(0, 3).join(", ")}${agents.length > 3 ? ", \u2026" : ""})` : "";
    const panes = Math.max(0, options.getProjectPaneCount?.() ?? 0);
    const paneText = panes > 0 ? ` \xB7 ${panes} pane${panes === 1 ? "" : "s"}` : "";
    const task = activeTaskLabel();
    const taskText = task ? ` \xB7 ${task}` : "";
    const attention = includeAttention && attentionRuns.size > 0 ? " \u26A0" : "";
    return `\u23F3 ${activeCount} subagent${activeCount === 1 ? "" : "s"}${who}${paneText}${taskText}${attention}`;
  };
  const titleSuffix = () => {
    if (runs.size === 0) return void 0;
    const agentNames = activeAgentNames();
    const activeCount = activeSubagentCount();
    const task = boundedTaskLabel(activeTaskLabel(), MAX_TITLE_TASK_CHARS);
    const target = task ?? (activeCount === 1 && agentNames.length === 1 ? agentNames[0] : String(activeCount));
    return `\u23F3${target}${attentionRuns.size > 0 ? "\u26A0" : ""}`;
  };
  const enqueue = (args) => {
    pendingReport = args;
    if (draining) return;
    draining = true;
    drainPromise = (async () => {
      while (pendingReport) {
        const next = pendingReport;
        pendingReport = void 0;
        try {
          await runHerdr(next);
        } catch {
        }
      }
    })().finally(() => {
      draining = false;
    });
  };
  const publish = () => {
    if (!enabled || !rootSession || disposed || !paneId2) return;
    if (runs.size === 0 && !published) return;
    const seq = String(nextMetadataReportSeq());
    if (runs.size === 0) {
      published = false;
      enqueue([
        "pane",
        "report-metadata",
        paneId2,
        "--source",
        DEFAULT_SOURCE,
        "--agent",
        "pi",
        "--applies-to-source",
        "herdr:pi",
        "--clear-state-labels",
        "--clear-token",
        "summary",
        "--clear-token",
        "title-suffix",
        "--seq",
        seq
      ]);
      return;
    }
    const text2 = label(true);
    const suffix = titleSuffix();
    published = true;
    enqueue([
      "pane",
      "report-metadata",
      paneId2,
      "--source",
      DEFAULT_SOURCE,
      "--agent",
      "pi",
      "--applies-to-source",
      "herdr:pi",
      "--state-label",
      `idle=${text2}`,
      "--state-label",
      `done=${text2}`,
      "--state-label",
      `working=${text2}`,
      "--token",
      `summary=${text2}`,
      ...suffix ? ["--token", `title-suffix=${suffix}`] : [],
      "--ttl-ms",
      String(ttlMs),
      "--seq",
      seq
    ]);
  };
  const syncRefreshTimer = () => {
    if (runs.size > 0 && refreshMs > 0 && !refreshTimer) {
      refreshTimer = timers.setInterval(() => refresh(), refreshMs);
      refreshTimer.unref?.();
    } else if ((runs.size === 0 || refreshMs <= 0) && refreshTimer) {
      timers.clearInterval(refreshTimer);
      refreshTimer = void 0;
    }
  };
  const syncBusy = () => {
    if (!enabled || !rootSession || disposed) return;
    if (runs.size > 0) {
      const text2 = label();
      if (busyRaised && busyLabel === text2) return;
      if (busyRaised) options.events.emit("herdr:busy", { active: false });
      busyRaised = true;
      busyLabel = text2;
      options.events.emit("herdr:busy", { active: true, label: text2 });
      return;
    }
    if (busyRaised) {
      busyRaised = false;
      busyLabel = void 0;
      options.events.emit("herdr:busy", { active: false });
    }
  };
  const clearAttention = () => {
    attentionRuns.clear();
    publish();
  };
  const raiseAttention = (runId) => {
    if (!rootSession || attentionRuns.has(runId)) return;
    acknowledgedAttention.delete(runId);
    attentionRuns.add(runId);
    publish();
  };
  const replaceRuns = (nextRuns) => {
    const activeIds = /* @__PURE__ */ new Set();
    runs.clear();
    attentionRuns.clear();
    for (const run of nextRuns) {
      if (!run || typeof run.id !== "string" || !run.id) continue;
      activeIds.add(run.id);
      const taskLabel = boundedTaskLabel(run.taskLabel);
      const { taskLabel: _rawTaskLabel, ...sanitizedRun } = run;
      runs.set(run.id, { ...sanitizedRun, ...taskLabel ? { taskLabel } : {} });
      if (!run.needsAttention) {
        acknowledgedAttention.delete(run.id);
      } else if (!acknowledgedAttention.has(run.id)) {
        attentionRuns.add(run.id);
      }
    }
    for (const id of acknowledgedAttention) {
      if (!activeIds.has(id)) acknowledgedAttention.delete(id);
    }
    syncBusy();
    syncRefreshTimer();
    publish();
  };
  const refresh = () => {
    if (!options.getRuns) {
      publish();
      return;
    }
    try {
      replaceRuns(options.getRuns());
    } catch {
      publish();
    }
  };
  const subscribe = (event, handler) => {
    const unsubscribe = options.events.on(event, handler);
    if (typeof unsubscribe === "function") subscriptions.push(unsubscribe);
  };
  if (enabled) {
    subscribe(HERDR_FOREGROUND_CONTROL_CHANGED_EVENT, () => {
      if (rootSession && options.getRuns) refresh();
    });
    subscribe(SUBAGENT_ASYNC_STARTED_EVENT, (data) => {
      if (!rootSession) return;
      const run = startedRun(data);
      if (!run) return;
      acknowledgedAttention.delete(run.id);
      runs.set(run.id, run);
      syncBusy();
      syncRefreshTimer();
      publish();
    });
    subscribe(SUBAGENT_ASYNC_COMPLETE_EVENT, (data) => {
      if (!rootSession) return;
      const id = completedRunId(data);
      if (!id || !runs.delete(id)) return;
      acknowledgedAttention.delete(id);
      attentionRuns.delete(id);
      syncBusy();
      syncRefreshTimer();
      publish();
    });
    subscribe(SUBAGENT_CONTROL_EVENT, (data) => {
      if (!rootSession) return;
      const runId = attentionRunId(data);
      if (!runId || !runs.has(runId)) return;
      raiseAttention(runId);
    });
  }
  return {
    agentStarted() {
      for (const id of attentionRuns) acknowledgedAttention.add(id);
      clearAttention();
    },
    sessionStarted({ hasUI, runs: restoredRuns }) {
      if (!enabled || disposed || hasUI !== true) return;
      rootSession = true;
      replaceRuns(restoredRuns);
    },
    syncRuns() {
      if (!enabled || !rootSession || disposed) return;
      refresh();
    },
    async flush() {
      while (draining || pendingReport) await drainPromise;
    },
    dispose() {
      if (disposed) return;
      clearAttention();
      acknowledgedAttention.clear();
      runs.clear();
      syncBusy();
      syncRefreshTimer();
      publish();
      for (const unsubscribe of subscriptions) unsubscribe();
      disposed = true;
    }
  };
}

// src/integrations/pi-web-session-liveness.ts
var PI_WEB_SESSION_LIVENESS_REGISTRY_KEY = "@agegr/pi-web/session-liveness/v1";
var PI_WEB_SESSION_LIVENESS_PROTOCOL_VERSION = 1;
function resolveRegistry() {
  const value = globalThis[Symbol.for(PI_WEB_SESSION_LIVENESS_REGISTRY_KEY)];
  if (!value || typeof value !== "object") return null;
  const registry = value;
  if (registry.version !== PI_WEB_SESSION_LIVENESS_PROTOCOL_VERSION || typeof registry.register !== "function") return null;
  return registry;
}
function retainLiveForegroundNestedRoute(state, route) {
  const nested = projectNestedEvents(route);
  if (!hasLiveNestedDescendants(nested.children)) return false;
  state.retainedForegroundNestedRoutes ??= /* @__PURE__ */ new Map();
  state.retainedForegroundNestedRoutes.set(route.rootRunId, route);
  return true;
}
function hasLiveSubagentWork(state) {
  for (const job of state.asyncJobs.values()) {
    if (job.status === "queued" || job.status === "running" || hasLiveNestedDescendants(job.nestedChildren)) return true;
  }
  for (const control of state.foregroundControls.values()) {
    if ((control.schedulingOwners ?? 0) > 0 || (control.activeChildren?.size ?? 0) > 0 || hasLiveNestedDescendants(control.nestedChildren)) return true;
  }
  return (state.retainedForegroundNestedRoutes?.size ?? 0) > 0;
}
function registerPiWebSessionLiveness(registration) {
  const registry = resolveRegistry();
  if (!registry) return { registered: false, release: () => {
  } };
  try {
    const release = registry.register({
      name: "pi-subagents",
      sessionId: registration.sessionId,
      ...registration.sessionFile ? { sessionFile: registration.sessionFile } : {},
      isActive: registration.isActive
    });
    if (typeof release === "function") return { registered: true, release };
    console.error("Failed to register pi-web session liveness: host registry returned no release function.");
  } catch (error2) {
    console.error("Failed to register pi-web session liveness:", error2);
  }
  return { registered: false, release: () => {
  } };
}

// src/runs/background/wait-subscriptions.ts
import * as fs11 from "node:fs";
import * as path10 from "node:path";
import { randomUUID as randomUUID4 } from "node:crypto";
var SUBSCRIPTION_VERSION = 1;
var STATUS_OUTCOMES = /* @__PURE__ */ new Set(["timed out", "could not be reconciled", "needs attention", "reconciliation failed"]);
var RECONCILE_INTERVAL_MS = 1e3;
var FOREIGN_SWEEP_INTERVAL_MS = 6e4;
var FOREIGN_SWEEP_GRACE_MS = 24 * 60 * 60 * 1e3;
function isNotFound(error2) {
  return typeof error2 === "object" && error2 !== null && "code" in error2 && error2.code === "ENOENT";
}
function parseRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const record = value;
  if (record.version !== SUBSCRIPTION_VERSION || typeof record.token !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.token) || typeof record.sessionId !== "string" || record.targetKind !== "async" && record.targetKind !== "foreground" || typeof record.runId !== "string" || typeof record.requestedId !== "string" || typeof record.createdAt !== "number" || typeof record.expiresAt !== "number") return void 0;
  return record;
}
function needsAttention(run) {
  return run.activityState === "needs_attention" || run.steps.some((step) => step.activityState === "needs_attention");
}
function subscriptionFile(dir, token) {
  return path10.join(dir, `${token}.json`);
}
function formatWaitSubscriptions(state, now = Date.now()) {
  const subscriptions = [...state.waitSubscriptions?.values() ?? []].sort((left, right) => left.createdAt - right.createdAt);
  if (subscriptions.length === 0) return void 0;
  const lines = [`Armed wait subscriptions (${subscriptions.length}):`];
  for (const record of subscriptions) {
    lines.push(`- ${record.token}: ${record.targetKind} run ${record.runId}, timeout in ${Math.max(0, record.expiresAt - now)}ms`);
  }
  return lines.join("\n");
}
function createWaitSubscriptionManager(pi, state, options = {}) {
  const asyncDirRoot = options.asyncDirRoot ?? DIRS.async;
  const resultsDir = options.resultsDir ?? DIRS.results;
  const subscriptionsDir = options.subscriptionsDir ?? path10.join(path10.dirname(asyncDirRoot), "wait-subscriptions");
  const now = options.now ?? Date.now;
  const subscriptions = state.waitSubscriptions ?? /* @__PURE__ */ new Map();
  state.waitSubscriptions = subscriptions;
  const unresolvedRestoredForegroundTokens = /* @__PURE__ */ new Set();
  let disposed = false;
  let interval;
  let lastForeignSweepAt = 0;
  const sweepExpiredForeignSubscriptions = (force = false) => {
    const sweptAt = now();
    if (!force && sweptAt - lastForeignSweepAt < FOREIGN_SWEEP_INTERVAL_MS) return;
    lastForeignSweepAt = sweptAt;
    let files;
    try {
      files = fs11.readdirSync(subscriptionsDir).filter((file) => file.endsWith(".json"));
    } catch (error2) {
      if (!isNotFound(error2)) console.error(`Failed to scan wait subscriptions in '${subscriptionsDir}':`, error2);
      return;
    }
    for (const file of files) {
      const filePath = path10.join(subscriptionsDir, file);
      let record;
      try {
        record = parseRecord(JSON.parse(fs11.readFileSync(filePath, "utf-8")));
      } catch (error2) {
        console.error(`Ignoring invalid wait subscription '${filePath}':`, error2);
        continue;
      }
      if (!record || file !== `${record.token}.json`) continue;
      if (record.sessionId === state.currentSessionId) continue;
      if (sweptAt < record.expiresAt + FOREIGN_SWEEP_GRACE_MS) continue;
      try {
        fs11.unlinkSync(filePath);
      } catch (error2) {
        if (!isNotFound(error2)) console.error(`Failed to remove expired wait subscription '${filePath}':`, error2);
      }
    }
  };
  const remove = (record) => {
    try {
      fs11.unlinkSync(subscriptionFile(subscriptionsDir, record.token));
    } catch (error2) {
      if (!isNotFound(error2)) throw error2;
    }
    subscriptions.delete(record.token);
    unresolvedRestoredForegroundTokens.delete(record.token);
  };
  const settle = (record, outcome, detail, completion) => {
    if (disposed || state.currentSessionId !== record.sessionId) return;
    try {
      remove(record);
    } catch (error2) {
      console.error(`Failed to clear wait subscription '${record.token}'; it remains armed:`, error2);
      return;
    }
    try {
      pi.sendMessage({
        customType: "subagent-wait-subscription",
        content: `Wait subscription ${record.token} fired for run ${record.runId}: ${outcome}. ${detail}

Parent action: ${STATUS_OUTCOMES.has(outcome) ? STATUS_ACTION : COMPLETION_ACTION}`,
        display: true,
        details: {
          token: record.token,
          runId: record.runId,
          outcome,
          ...completion ? { completions: [completion] } : {}
        }
      }, { triggerTurn: true });
    } catch (error2) {
      console.error(`Failed to deliver wait subscription '${record.token}' after clearing it:`, error2);
    }
  };
  const reconcileRecord = (record) => {
    if (record.sessionId !== state.currentSessionId) return;
    if (now() >= record.expiresAt) {
      settle(record, "timed out", "The targeted run may still be active; inspect its status before taking follow-up action.");
      return;
    }
    if (record.targetKind === "foreground") {
      const run2 = state.foregroundRuns?.get(record.runId);
      if (!run2 && unresolvedRestoredForegroundTokens.has(record.token)) return;
      if (run2) unresolvedRestoredForegroundTokens.delete(record.token);
      if (!run2 || run2.sessionId !== record.sessionId) {
        settle(record, "could not be reconciled", "The remembered foreground run disappeared before completion was confirmed.");
        return;
      }
      const detached = run2.children.filter((child) => child.status === "detached");
      if (detached.some((child) => child.activityState === "needs_attention" && child.currentTool === "contact_supervisor")) {
        settle(record, "needs attention", "Reply to the pending supervisor request or inspect the run status.");
        return;
      }
      if (detached.length === 0) {
        const failed = run2.children.some((child) => child.status === "failed");
        settle(record, failed ? "failed" : "completed", "Inspect the run status for its final output.");
      }
      return;
    }
    const runs = listAsyncRuns(asyncDirRoot, {
      sessionId: record.sessionId,
      runId: record.runId,
      exactRunId: true,
      resultsDir,
      kill: options.kill,
      now
    });
    const run = runs.find((candidate) => candidate.id === record.runId);
    if (!run) {
      settle(record, "could not be reconciled", "The exact async run disappeared before a terminal result was confirmed.");
      return;
    }
    if (needsAttention(run)) {
      settle(record, "needs attention", "Inspect the run status and answer any pending supervisor request.");
      return;
    }
    if (run.state !== "queued" && run.state !== "running") {
      let completion;
      try {
        completion = readCompletionReplay(resultsDir, record.runId, { sessionId: record.sessionId, now: now() })?.completion;
      } catch (error2) {
        console.error(`Failed to read completion replay for wait subscription '${record.token}':`, error2);
      }
      const detail = formatResumeFirstFailedRunDetail(run) ?? "Inspect the run status for its final output.";
      const archiveDetail = completion?.archivePath ? ` Completion archive: ${completion.archivePath}.` : "";
      settle(record, run.state === "complete" ? "completed" : run.state, `${detail}${archiveDetail}`, completion);
    }
  };
  const reconcile = () => {
    if (disposed) return;
    sweepExpiredForeignSubscriptions();
    if (!state.currentSessionId) return;
    for (const record of [...subscriptions.values()]) {
      try {
        reconcileRecord(record);
      } catch (error2) {
        console.error(`Failed to reconcile wait subscription '${record.token}':`, error2);
        settle(record, "reconciliation failed", "The targeted run could not be reconciled. Inspect its status before taking follow-up action.");
      }
    }
  };
  const wakeChannels = [
    INTERCOM_DETACH_REQUEST_EVENT,
    SUBAGENT_ASYNC_COMPLETE_EVENT,
    SUBAGENT_FOREGROUND_COMPLETE_EVENT,
    SUBAGENT_CONTROL_EVENT,
    SUBAGENT_CONTROL_INTERCOM_EVENT,
    SUBAGENT_RESULT_INTERCOM_EVENT
  ];
  const unsubscribes = wakeChannels.map((channel) => pi.events.on(channel, reconcile));
  return {
    start() {
      if (disposed || interval) return;
      interval = setInterval(reconcile, options.pollIntervalMs ?? RECONCILE_INTERVAL_MS);
      interval.unref?.();
    },
    arm(input) {
      const sessionId = state.currentSessionId;
      if (!sessionId) throw new Error("A wait subscription requires an active session identity.");
      const createdAt = now();
      const record = {
        version: SUBSCRIPTION_VERSION,
        token: randomUUID4(),
        sessionId,
        targetKind: input.targetKind,
        runId: input.runId,
        requestedId: input.requestedId,
        createdAt,
        expiresAt: createdAt + input.timeoutMs
      };
      fs11.mkdirSync(subscriptionsDir, { recursive: true });
      writeAtomicJson(subscriptionFile(subscriptionsDir, record.token), record);
      subscriptions.set(record.token, record);
      return record;
    },
    restore() {
      subscriptions.clear();
      unresolvedRestoredForegroundTokens.clear();
      sweepExpiredForeignSubscriptions(true);
      if (!state.currentSessionId) return;
      let files;
      try {
        files = fs11.readdirSync(subscriptionsDir).filter((file) => file.endsWith(".json"));
      } catch (error2) {
        if (isNotFound(error2)) return;
        throw error2;
      }
      for (const file of files) {
        try {
          const record = parseRecord(JSON.parse(fs11.readFileSync(path10.join(subscriptionsDir, file), "utf-8")));
          if (!record || file !== `${record.token}.json`) continue;
          if (record.sessionId === state.currentSessionId) {
            subscriptions.set(record.token, record);
            if (record.targetKind === "foreground" && !state.foregroundRuns?.has(record.runId)) unresolvedRestoredForegroundTokens.add(record.token);
          }
        } catch (error2) {
          console.error(`Ignoring invalid wait subscription '${path10.join(subscriptionsDir, file)}':`, error2);
        }
      }
      reconcile();
    },
    reconcile,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (interval) clearInterval(interval);
      interval = void 0;
      for (const unsubscribe of unsubscribes) {
        try {
          unsubscribe();
        } catch {
        }
      }
      subscriptions.clear();
    }
  };
}

// src/runs/shared/child-session.ts
import * as fs14 from "node:fs";
import * as path13 from "node:path";
import { pathToFileURL } from "node:url";

// src/runs/shared/child-commands.ts
import { randomUUID as randomUUID5 } from "node:crypto";
import * as fs12 from "node:fs";
import * as path11 from "node:path";
import { Type } from "typebox";
var CHILD_COMMAND_TOOL = "subagent_command";
var writeAtomicJson2 = createAtomicJsonWriter({ mode: 384 });
var MAX_OUTPUT_BYTES = 8 * 1024;
var RECENT_COMMANDS = 20;
function childCommandStatePath(channelDir) {
  return path11.join(channelDir, "commands.json");
}
function readChildCommandState(channelDir) {
  try {
    return JSON.parse(fs12.readFileSync(childCommandStatePath(channelDir), "utf8"));
  } catch (error2) {
    if (error2.code === "ENOENT") return void 0;
    throw error2;
  }
}
function retainsChildCommand(channelDir, toolCallId) {
  return readChildCommandState(channelDir)?.commands.some((command) => command.toolCallId === toolCallId) === true;
}
function active(job) {
  return job.snapshot.endedAt === void 0;
}
function text(result5) {
  return Buffer.from(result5.content.filter((part) => part.type === "text").map((part) => part.text).join("\n")).subarray(-MAX_OUTPUT_BYTES).toString("utf8");
}
function createChildCommandRuntime(channelDir) {
  const ownerId = randomUUID5();
  const jobs = /* @__PURE__ */ new Map();
  const usedIds = /* @__PURE__ */ new Set();
  let closed = false;
  let disposeInbox;
  const state = () => ({ ownerId, closed, commands: [...jobs.values()].map((job) => ({ ...job.snapshot })) });
  const persist = () => writeAtomicJson2(childCommandStatePath(channelDir), {
    ownerId,
    closed,
    commands: [...jobs.values()].map((job) => ({ ...job.snapshot, output: job.yielded ? job.snapshot.output : "" }))
  });
  const operate = (operation, toolCallId) => {
    if (operation === "status" && toolCallId === void 0) return state();
    const job = toolCallId ? jobs.get(toolCallId) : void 0;
    if (!job) throw new Error(`No retained command '${toolCallId ?? ""}' in this child session.`);
    if (operation !== "status" && closed) throw new Error("Child command controller is closed.");
    const before = job.snapshot.state;
    if (active(job)) {
      if (operation === "yield" && job.snapshot.state === "running") {
        job.yielded = true;
        job.snapshot.state = "yielded";
        job.yieldResult();
      } else if (operation === "cancel") {
        job.snapshot.state = "cancel_requested";
        job.controller.abort();
      }
    }
    if (job.snapshot.state !== before) persist();
    return { ownerId, closed, commands: [{ ...job.snapshot }] };
  };
  const startInbox = () => {
    if (disposeInbox) return;
    disposeInbox = watchAsyncControlInbox(channelDir, {
      onCommand(request) {
        const replyPath = commandReplyPath(channelDir, request.id);
        try {
          if (request.ownerId !== ownerId) throw new Error("Command request belongs to another child session.");
          if (Date.now() > request.deadlineAt) throw new Error("Command request expired before delivery.");
          writeAtomicJson2(replyPath, { state: operate(request.operation, request.toolCallId) });
        } catch (error2) {
          writeAtomicJson2(replyPath, { error: error2 instanceof Error ? error2.message : String(error2) });
        }
      }
    });
  };
  const stop = async () => {
    closed = true;
    disposeInbox?.();
    for (const job of jobs.values()) if (active(job)) {
      job.snapshot.state = "cancel_requested";
      job.controller.abort();
    }
    await Promise.all([...jobs.values()].map((job) => job.settled));
    if (jobs.size) persist();
  };
  return {
    state,
    operate,
    shutdown: stop,
    async finish() {
      const pending = [...jobs.values()].filter(active);
      if (!pending.length) return;
      await stop();
      throw new Error(`Child finished with unfinished commands: ${pending.map((job) => job.snapshot.toolCallId).join(", ")}. Commands were cancelled; query or cancel background commands before finishing.`);
    },
    wrap(tool) {
      return {
        ...tool,
        parameters: Type.Unsafe({ ...tool.parameters, properties: {
          ...tool.parameters.properties,
          yieldTimeMs: Type.Optional(Type.Integer({ minimum: 0, maximum: 3e4, description: "Return a managed command handle after this wait; does not terminate the command. Omit to wait for completion." }))
        } }),
        description: `${tool.description}
Optional yieldTimeMs returns a command handle without stopping execution. Use subagent_command to query or cancel it. Finish or cancel every command before completing the task.`,
        async execute(toolCallId, params, signal, onUpdate, ctx) {
          if (closed) throw new Error("Child command controller is closed.");
          if (usedIds.has(toolCallId)) throw new Error(`Command id '${toolCallId}' was already used in this child session.`);
          usedIds.add(toolCallId);
          const { yieldTimeMs, ...args } = params;
          const controller = new AbortController();
          const commandSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
          let yieldResult;
          const yielded = new Promise((resolve4) => {
            yieldResult = resolve4;
          });
          const job = { snapshot: { toolCallId, state: "running", startedAt: Date.now(), output: "" }, controller, yieldResult, settled: Promise.resolve() };
          const completed = [...jobs].filter(([, candidate]) => !active(candidate));
          for (const [id] of completed.slice(0, Math.max(0, completed.length - RECENT_COMMANDS + 1))) jobs.delete(id);
          jobs.set(toolCallId, job);
          persist();
          startInbox();
          let timer;
          if (typeof yieldTimeMs === "number") timer = setTimeout(() => operate("yield", toolCallId), yieldTimeMs);
          const execution = Promise.resolve().then(() => tool.execute(toolCallId, args, commandSignal, (update) => {
            job.snapshot.output = text(update);
            if (job.snapshot.state === "running") onUpdate?.(update);
          }, ctx)).then((result6) => {
            job.snapshot.output = text(result6);
            job.snapshot.state = result6.isError ? "failed" : "completed";
            const fullOutputPath = result6.details?.fullOutputPath;
            if (fullOutputPath) job.snapshot.fullOutputPath = fullOutputPath;
            return result6;
          }, (error2) => {
            job.snapshot.state = controller.signal.aborted ? "cancelled" : "failed";
            job.snapshot.output = String(error2).slice(-MAX_OUTPUT_BYTES);
            throw error2;
          }).finally(() => {
            if (timer) clearTimeout(timer);
            job.snapshot.endedAt = Date.now();
            persist();
          });
          job.settled = execution.then(() => {
          }, () => {
          });
          const result5 = await Promise.race([execution.then((value) => ({ value })), yielded.then(() => void 0)]);
          if (result5) return result5.value;
          return { content: [{ type: "text", text: `Command is still running (toolCallId: ${toolCallId}). This is not a successful exit. Use subagent_command({ action: "status", toolCallId: ${JSON.stringify(toolCallId)} }) to inspect or wait, or action: "cancel" to stop it.
${job.snapshot.output}` }], details: { command: { ...job.snapshot } } };
        }
      };
    },
    tool() {
      return {
        name: CHILD_COMMAND_TOOL,
        label: "Child command",
        description: "Inspect or cancel bash commands owned by this child. Cancellation stops only the selected command, not the agent. Check terminal state before finishing.",
        parameters: Type.Object({ action: Type.String({ enum: ["status", "cancel"] }), toolCallId: Type.Optional(Type.String()), waitMs: Type.Optional(Type.Integer({ minimum: 0, maximum: 3e4 })) }),
        async execute(_id, params, signal) {
          const { action, toolCallId, waitMs = 0 } = params;
          operate(action, toolCallId);
          const job = toolCallId ? jobs.get(toolCallId) : void 0;
          if (job && active(job) && waitMs > 0) await waitForCommand(job.settled, waitMs, signal);
          const snapshot = operate("status", toolCallId);
          return { content: [{ type: "text", text: JSON.stringify(snapshot) }], details: snapshot };
        }
      };
    }
  };
}
async function waitForCommand(settled, waitMs, signal) {
  let timer;
  let abort;
  const wait = new Promise((resolve4, reject) => {
    timer = setTimeout(resolve4, waitMs);
    abort = () => reject(new Error("Command wait aborted; command remains managed by the child."));
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
  try {
    await Promise.race([settled, wait]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
function commandReplyPath(channelDir, id) {
  return path11.join(channelDir, "command-replies", `${id}.json`);
}
async function controlChildCommand(channelDir, operation, toolCallId, signal) {
  const current = readChildCommandState(channelDir);
  if (!current) throw new Error("No command controller is available for this child. Command controls require a local native Pi child with bash.");
  if (current.closed) {
    if (operation === "status") {
      if (toolCallId === void 0) return current;
      const command = current.commands.find((entry) => entry.toolCallId === toolCallId);
      if (!command) throw new Error(`No retained command '${toolCallId}' in this child session.`);
      return { ...current, commands: [command] };
    }
    throw new Error("Child command controller is closed.");
  }
  if (operation !== "status" && !toolCallId) throw new Error("An exact toolCallId is required; command controls never target the next command.");
  const id = randomUUID5();
  const deadlineAt = Date.now() + 5e3;
  const request = { type: "command", id, ownerId: current.ownerId, operation, ...toolCallId ? { toolCallId } : {}, deadlineAt };
  requestAsyncCommand(channelDir, request);
  const replyPath = commandReplyPath(channelDir, id);
  try {
    while (Date.now() < deadlineAt) {
      if (signal?.aborted) throw new Error("Command control wait aborted; delivery may still be pending.");
      try {
        const reply = JSON.parse(fs12.readFileSync(replyPath, "utf8"));
        if (reply.error) throw new Error(reply.error);
        if (reply.state) return reply.state;
      } catch (error2) {
        if (error2.code !== "ENOENT") throw error2;
      }
      await new Promise((resolve4) => setTimeout(resolve4, 20));
    }
    throw new Error("Command control acknowledgement timed out. Inspect command status; cancellation is not confirmed.");
  } finally {
    fs12.rmSync(replyPath, { force: true });
  }
}

// src/shared/child-cache-retention.ts
function childCacheRetention(env = process.env) {
  return env.PI_SUBAGENT_CACHE_RETENTION || void 0;
}
function childCacheRetentionEnv(env) {
  const retention = childCacheRetention(env);
  return retention ? { PI_CACHE_RETENTION: retention } : {};
}
function pinChildCacheRetention(agent, env) {
  if (!agent?.streamFunction) return;
  const retention = childCacheRetention(env);
  if (!retention) return;
  const base = agent.streamFunction;
  agent.streamFunction = (model, context, options) => base(model, context, {
    ...options,
    env: { ...options?.env ?? {}, PI_CACHE_RETENTION: retention }
  });
}

// src/runs/background/runner-aliases.ts
import * as fs13 from "node:fs";
import * as path12 from "node:path";
var JITI_ALIAS_ENV = "JITI_ALIAS";
var HOST_PEER_ALIASES = [
  { specifier: "@earendil-works/pi-coding-agent", pkg: "@earendil-works/pi-coding-agent", subpath: "." },
  { specifier: "@earendil-works/pi-agent-core", pkg: "@earendil-works/pi-agent-core", subpath: "." },
  // Optional: hosts whose pi-agent-core declares no "./node" export cannot import it, so no alias is needed.
  { specifier: "@earendil-works/pi-agent-core/node", pkg: "@earendil-works/pi-agent-core", subpath: "./node", optional: true },
  { specifier: "@earendil-works/pi-tui", pkg: "@earendil-works/pi-tui", subpath: "." },
  { specifier: "@earendil-works/pi-ai", pkg: "@earendil-works/pi-ai", subpath: "./compat" },
  { specifier: "@earendil-works/pi-ai/compat", pkg: "@earendil-works/pi-ai", subpath: "./compat" },
  { specifier: "@earendil-works/pi-ai/oauth", pkg: "@earendil-works/pi-ai", subpath: "./oauth" },
  { specifier: "@earendil-works/pi-ai/providers/all", pkg: "@earendil-works/pi-ai", subpath: "./providers/all" },
  { specifier: "typebox", pkg: "typebox", subpath: "." },
  { specifier: "typebox/compile", pkg: "typebox", subpath: "./compile" },
  { specifier: "typebox/value", pkg: "typebox", subpath: "./value" }
];
var CHORD_PACKAGE = "@earendil-works/chord";
var CHORD_PEER_ALIASES = [
  { specifier: "@earendil-works/chord", pkg: "@earendil-works/chord", subpath: "." },
  { specifier: "@earendil-works/chord/context", pkg: "@earendil-works/chord", subpath: "./context" }
];
function readManifest(packageDir) {
  try {
    return JSON.parse(fs13.readFileSync(path12.join(packageDir, "package.json"), "utf-8"));
  } catch {
    return void 0;
  }
}
var BLOCKED_EXPORT = /* @__PURE__ */ Symbol("blocked export");
function exportTarget(entry) {
  if (typeof entry === "string") return entry;
  if (entry === null) return BLOCKED_EXPORT;
  if (Array.isArray(entry)) {
    let blocked = entry.length === 0;
    for (const candidate of entry) {
      const target = exportTarget(candidate);
      if (typeof target === "string") return target;
      if (target === BLOCKED_EXPORT) blocked = true;
    }
    return blocked ? BLOCKED_EXPORT : void 0;
  }
  if (entry && typeof entry === "object") {
    const conditions = entry;
    for (const [condition, value] of Object.entries(conditions)) {
      if (condition === "default" || condition === "import" || condition === "node" || condition === "node-addons" || condition === "module-sync") {
        const target = exportTarget(value);
        if (target) return target;
      }
    }
  }
  return void 0;
}
function resolvePackageSubpath(packageDir, subpath) {
  const manifest = readManifest(packageDir);
  if (!manifest) return void 0;
  const exportsField = manifest.exports;
  if (exportsField !== void 0 && exportsField !== null) {
    const map = typeof exportsField === "string" || Array.isArray(exportsField) || exportsField && typeof exportsField === "object" && !Object.keys(exportsField).some((key) => key.startsWith(".")) ? { ".": exportsField } : exportsField;
    if (subpath in map) {
      const exact = exportTarget(map[subpath]);
      return typeof exact === "string" ? path12.resolve(packageDir, exact) : void 0;
    }
    let best;
    for (const [pattern, entry] of Object.entries(map)) {
      const star = pattern.indexOf("*");
      if (star === -1) continue;
      const prefix = pattern.slice(0, star);
      const suffix = pattern.slice(star + 1);
      if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix) || subpath.length < prefix.length + suffix.length) continue;
      if (!best || prefix.length > best.prefix.length || prefix.length === best.prefix.length && suffix.length > best.suffix.length) best = { entry, prefix, suffix };
    }
    if (!best) return void 0;
    const target = exportTarget(best.entry);
    if (typeof target !== "string") return void 0;
    const wildcard = subpath.slice(best.prefix.length, subpath.length - best.suffix.length);
    return path12.resolve(packageDir, target.replaceAll("*", () => wildcard));
  }
  if (subpath !== ".") return void 0;
  return path12.resolve(packageDir, typeof manifest.main === "string" && manifest.main.trim() ? manifest.main : "index.js");
}
function findPeerPackageDir(piPackageRoot, pkg, hostName) {
  if (hostName === pkg) return piPackageRoot;
  const candidates = [path12.join(piPackageRoot, "node_modules", pkg)];
  let dir = piPackageRoot;
  for (; ; ) {
    const parent = path12.dirname(dir);
    if (parent === dir) break;
    if (path12.basename(parent) === "node_modules" || path12.basename(path12.dirname(parent)) === "node_modules") {
      const modulesRoot = path12.basename(parent) === "node_modules" ? parent : path12.dirname(parent);
      candidates.push(path12.join(modulesRoot, pkg));
    }
    candidates.push(path12.join(parent, "node_modules", pkg));
    dir = parent;
  }
  return candidates.find((candidate) => readManifest(candidate)?.name === pkg);
}
function declaresDependency(manifest, pkg) {
  return [manifest.dependencies, manifest.optionalDependencies].some((deps) => !!deps && typeof deps === "object" && Object.hasOwn(deps, pkg));
}
function resolveHostPeerAliases(piPackageRoot) {
  const aliases = {};
  const missing = [];
  const hostManifest = readManifest(piPackageRoot);
  const chordRequired = !hostManifest || declaresDependency(hostManifest, CHORD_PACKAGE);
  for (const { specifier, pkg, subpath, optional } of [...HOST_PEER_ALIASES, ...CHORD_PEER_ALIASES]) {
    const packageDir = findPeerPackageDir(piPackageRoot, pkg, hostManifest?.name);
    const target = packageDir ? resolvePackageSubpath(packageDir, subpath) : void 0;
    if (optional && packageDir && target === void 0) continue;
    if (target && fs13.existsSync(target)) aliases[specifier] = fs13.realpathSync(target);
    else if (pkg !== CHORD_PACKAGE || chordRequired) missing.push(specifier);
  }
  return { aliases, missing };
}

// src/runs/shared/child-session.ts
function projectChildSessionEventForJson(event) {
  if (event.type !== "message_update") return event;
  const assistantMessageEvent = event.assistantMessageEvent;
  if (!assistantMessageEvent || typeof assistantMessageEvent !== "object") return event;
  const { partial: _partial, ...delta } = assistantMessageEvent;
  return { type: "message_update", usage: event.message?.usage, assistantMessageEvent: delta };
}
function childSessionHasQueuedMessages(session) {
  try {
    return session?.hasQueuedMessages?.() === true;
  } catch {
    return false;
  }
}
function inheritParentProviders(modelRuntime, parentProviders, claimedProviderIds, onError) {
  let providerIds;
  try {
    providerIds = parentProviders.getRegisteredProviderIds();
  } catch (error2) {
    onError?.({ extensionPath: "<parent-providers>", event: "inherit_provider", error: error2 });
    throw new Error(`Failed to enumerate parent providers: ${error2 instanceof Error ? error2.message : String(error2)}`, { cause: error2 });
  }
  const inherited = /* @__PURE__ */ new Set();
  for (const providerId of new Set(providerIds)) {
    if (claimedProviderIds.has(providerId)) continue;
    try {
      const native = parentProviders.getRegisteredNativeProvider(providerId);
      const config = native ? void 0 : parentProviders.getRegisteredProviderConfig(providerId);
      if (native) modelRuntime.registerNativeProvider(native);
      else if (config) modelRuntime.registerProvider(providerId, config);
      else throw new Error(`Parent provider '${providerId}' has no registered native provider or config.`);
      inherited.add(providerId);
    } catch (error2) {
      onError?.({ extensionPath: `<parent-provider:${providerId}>`, event: "inherit_provider", error: error2 });
      throw new Error(`Failed to inherit parent provider '${providerId}': ${error2 instanceof Error ? error2.message : String(error2)}`, { cause: error2 });
    }
  }
  return inherited;
}
var CHILD_PROMPT_RUNTIME_EXTENSION_PATH = "<inline:pi-subagents:prompt-runtime>";
var CHILD_PROMPT_BOUNDARY_EXTENSION_PATH = "<inline:pi-subagents:prompt-boundary>";
var PI_UNICODE_SPACES = new RegExp("[\\u00A0\\u2000-\\u200A\\u202F\\u205F\\u3000]", "g");
function childExtensionFileIdentity(extensionPath) {
  if (!path13.isAbsolute(extensionPath)) return void 0;
  try {
    const stat = fs14.statSync(extensionPath, { bigint: true });
    return stat.isFile() ? `${stat.dev}:${stat.ino}` : void 0;
  } catch {
    return void 0;
  }
}
function createRequiredChildExtensionIdentity(requiredPaths) {
  const aliases = new Map([...requiredPaths].map((extensionPath) => [extensionPath, childExtensionFileIdentity(extensionPath) ?? extensionPath]));
  const identities = new Set(aliases.values());
  return (extensionPath) => {
    const known = aliases.get(extensionPath);
    if (known !== void 0) return known;
    const identity = childExtensionFileIdentity(extensionPath);
    if (identity === void 0 || !identities.has(identity)) return void 0;
    aliases.set(extensionPath, identity);
    return identity;
  };
}
function orderChildPromptHooks(result5) {
  const runtime = result5.extensions.filter(({ path: path17 }) => path17 === CHILD_PROMPT_RUNTIME_EXTENSION_PATH);
  const boundary = result5.extensions.filter(({ path: path17 }) => path17 === CHILD_PROMPT_BOUNDARY_EXTENSION_PATH);
  const others = result5.extensions.filter(({ path: path17 }) => path17 !== CHILD_PROMPT_RUNTIME_EXTENSION_PATH && path17 !== CHILD_PROMPT_BOUNDARY_EXTENSION_PATH);
  return { ...result5, extensions: [...runtime, ...others, ...boundary] };
}
function prioritizeChildCommandRuntime(result5) {
  const index = result5.extensions.findIndex(({ path: path17 }) => path17 === "<inline:pi-subagents:commands>");
  if (index < 0) return result5;
  if (result5.extensions.some((extension, otherIndex) => otherIndex !== index && extension.tools?.has("bash"))) {
    const extensions2 = result5.extensions.filter((_, otherIndex) => otherIndex !== index);
    if (!extensions2.some((extension) => extension.tools?.has(CHILD_COMMAND_TOOL))) {
      const commands2 = result5.extensions[index];
      const registered = commands2.tools.get(CHILD_COMMAND_TOOL);
      const reason = "Native command controls are unavailable with the active custom bash backend. Use that backend's own command controls.";
      extensions2.push({ ...commands2, tools: /* @__PURE__ */ new Map([[CHILD_COMMAND_TOOL, { ...registered, definition: {
        ...registered.definition,
        description: reason,
        execute: async () => {
          throw new Error(reason);
        }
      } }]]) });
    }
    return { ...result5, extensions: extensions2 };
  }
  if (index === 0) return result5;
  const extensions = [...result5.extensions];
  const [commands] = extensions.splice(index, 1);
  extensions.unshift(commands);
  return { ...result5, extensions };
}
var loading = Promise.resolve();
function resetExtensionCacheOnReload(loader) {
  if (!("loaded" in loader)) return false;
  loader.loaded = true;
  return true;
}
function applyProcessEnv(values) {
  if (!values) return;
  for (const [name, value] of Object.entries(values)) {
    if (value === void 0) delete process.env[name];
    else process.env[name] = value;
  }
}
function selectedBuiltinMcpExtension(pi, selections, readinessTool) {
  const createMcpExtension = pi.createMcpExtension;
  if (typeof createMcpExtension !== "function") throw new Error(`Selected built-in MCP tools (${selections.map(({ name }) => name).join(", ")}) need a Pi version with built-in MCP.`);
  const selectors = new Map(selections.map(({ name, selector }) => [name, selector]));
  const split = (value) => {
    const slash = value.indexOf("/");
    return { server: (slash === -1 ? value : value.slice(0, slash)).replace(/-/g, "_"), tool: slash === -1 ? void 0 : value.slice(slash + 1) };
  };
  const granted = (tool) => {
    const selector = selectors.get(tool.name);
    if (selector === void 0 || tool.exposure === "hidden" || tool.label === void 0) return false;
    const want = split(selector);
    const have = split(tool.label);
    return have.tool !== void 0 && have.server === want.server && (want.tool === void 0 || want.tool === have.tool);
  };
  const mcp = createMcpExtension();
  let waitForTools;
  let checkingStartup = false;
  const factory = async (api) => {
    const toolCallHandlers = [];
    await mcp(new Proxy(api, {
      get(target, prop) {
        if (prop === "getAllTools") return () => checkingStartup && readinessTool() ? [readinessTool()] : target.getAllTools();
        if (prop === "registerTool") {
          return (tool) => target.registerTool({ ...tool, exposure: granted(tool) ? "direct" : "hidden" });
        }
        if (prop === "on") {
          return (event, handler) => {
            if (event === "tool_call") toolCallHandlers.push(handler);
            return target.on(event, handler);
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    }));
    api.on("session_start", (_event, ctx) => {
      waitForTools = async (signal) => {
        if (toolCallHandlers.length === 0) throw new Error(`Selected built-in MCP tools (${selections.map(({ name }) => name).join(", ")}) need Pi 0.99.2 or later; earlier built-in MCP cannot report when its servers have connected.`);
        const event = { type: "tool_call", toolCallId: "pi-subagents:mcp-startup", toolName: "codemode", input: { code: selections.map(({ name }) => `tools.${name}`).join(";\n") } };
        const context = new Proxy(ctx, { get: (target, prop, receiver) => prop === "signal" ? signal : Reflect.get(target, prop, receiver) });
        checkingStartup = true;
        try {
          for (const handler of toolCallHandlers) {
            if (signal.aborted) return;
            const result5 = await handler(event, context);
            if (result5?.block) throw new Error(result5.reason ?? "MCP startup readiness was blocked.");
          }
        } finally {
          checkingStartup = false;
        }
      };
    });
  };
  return { name: "mcp", factory, builtin: true, replaceable: true, async waitForTools(signal, loadError) {
    if (!waitForTools) {
      const error2 = loadError();
      throw new Error(`Pi's built-in MCP readiness hook did not start in the child session${error2 ? `: ${error2}` : "."}`);
    }
    await waitForTools(signal);
  } };
}
function missingBuiltinMcpTools(session, names) {
  const active2 = new Set(session.getActiveToolNames());
  const direct = new Set(session.getAllTools().filter((tool) => tool.exposure === "direct").map(({ name }) => name));
  return names.filter((name) => !active2.has(name) || !direct.has(name));
}
function flushQueuedProviderRegistrations(loader, modelRuntime, onError, isRequiredSource) {
  const claimedProviderIds = /* @__PURE__ */ new Set();
  if (!("getExtensions" in loader) || typeof loader.getExtensions !== "function") return { claimedProviderIds, registered: false };
  const { runtime } = loader.getExtensions();
  let registered = false;
  for (const { name, config, extensionPath } of runtime.pendingProviderRegistrations ?? []) {
    claimedProviderIds.add(name);
    try {
      modelRuntime.registerProvider(name, config);
      registered = true;
    } catch (error2) {
      onError?.({ extensionPath, event: "register_provider", error: error2 });
      if (isRequiredSource(extensionPath)) throw new Error(`Required child extension provider registration failed for '${extensionPath}': ${error2 instanceof Error ? error2.message : String(error2)}`);
    }
  }
  if (Array.isArray(runtime.pendingProviderRegistrations)) runtime.pendingProviderRegistrations = [];
  for (const { provider, extensionPath } of runtime.pendingNativeProviderRegistrations ?? []) {
    claimedProviderIds.add(provider.id);
    try {
      modelRuntime.registerNativeProvider(provider);
      registered = true;
    } catch (error2) {
      onError?.({ extensionPath, event: "register_provider", error: error2 });
      if (isRequiredSource(extensionPath)) throw new Error(`Required child extension provider registration failed for '${extensionPath}': ${error2 instanceof Error ? error2.message : String(error2)}`);
    }
  }
  if (Array.isArray(runtime.pendingNativeProviderRegistrations)) runtime.pendingNativeProviderRegistrations = [];
  const virtualModelRuntime = modelRuntime;
  const virtualModelQueue = runtime;
  const pendingVirtualModelRegistrations = virtualModelQueue.pendingVirtualModelRegistrations ?? [];
  for (const { definition, extensionPath } of pendingVirtualModelRegistrations) {
    if (typeof virtualModelRuntime.registerVirtualModel !== "function") break;
    try {
      virtualModelRuntime.registerVirtualModel(definition);
      registered = true;
    } catch (error2) {
      onError?.({ extensionPath, event: "register_virtual_model", error: error2 });
      if (isRequiredSource(extensionPath)) throw new Error(`Required child extension virtual model registration failed for '${extensionPath}': ${error2 instanceof Error ? error2.message : String(error2)}`);
    }
  }
  if (Array.isArray(virtualModelQueue.pendingVirtualModelRegistrations)) virtualModelQueue.pendingVirtualModelRegistrations = [];
  return { claimedProviderIds, registered };
}
async function loadHostPiCodingAgent() {
  const overrideRoot = process.env[PI_CODING_AGENT_PACKAGE_ROOT_ENV]?.trim() || void 0;
  const root = resolveHostPiPackageRoot();
  if (root) {
    const entry = fs14.realpathSync(resolveHostPackageEntry(root, root === overrideRoot ? overrideRoot : void 0));
    return import(pathToFileURL(entry).href);
  }
  return import(PI_CODING_AGENT_PACKAGE);
}
function resolveHostPackageEntry(root, overrideRoot) {
  const packageJson = path13.join(root, "package.json");
  const source = fs14.readFileSync(packageJson, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error2) {
    throw new Error(`invalid host SDK manifest at ${packageJson}: malformed JSON`, { cause: error2 });
  }
  if (!isUnknownRecord(parsed)) throw new Error(`invalid host SDK manifest at ${packageJson}: expected a JSON object`);
  const pkg = parsed;
  if (pkg.name !== PI_CODING_AGENT_PACKAGE) {
    const source2 = overrideRoot !== void 0 ? ` (${PI_CODING_AGENT_PACKAGE_ROOT_ENV} override)` : "";
    throw new Error(`refusing to load the host SDK from ${root}${source2}: package.json name is "${String(pkg.name ?? "(none)")}", expected "${PI_CODING_AGENT_PACKAGE}"`);
  }
  const entry = resolvePackageSubpath(root, ".");
  if (!entry) throw new Error(`host SDK manifest at ${packageJson} has no resolvable root export`);
  return entry;
}
function isUnknownRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function createDefaultChildSessionFactory(options = {}) {
  const loadPiCodingAgent = options.loadPiCodingAgent ?? loadHostPiCodingAgent;
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 5e3;
  let runtime;
  const live = /* @__PURE__ */ new Set();
  const shutdowns = /* @__PURE__ */ new Set();
  const mcpWaits = /* @__PURE__ */ new Map();
  let disposals = 0;
  const sharedRuntime = async (pi) => {
    runtime ??= pi.ModelRuntime.create().catch((error2) => {
      runtime = void 0;
      throw error2;
    });
    return runtime;
  };
  return {
    async create(launch) {
      const disposalsAtStart = disposals;
      const pi = await loadPiCodingAgent();
      const builtinMcpTools = launch.builtinMcpTools ?? [];
      let readinessTool;
      const builtinMcp = builtinMcpTools.length ? selectedBuiltinMcpExtension(pi, builtinMcpTools, () => readinessTool) : void 0;
      const modelRuntime = launch.parentProviderRegistry ? await pi.ModelRuntime.create() : await sharedRuntime(pi);
      const agentDir = getAgentDir();
      const commands = launch.runtime.runId && launch.runtime.agent && launch.runtime.childIndex !== void 0 && launch.tools?.includes("bash") && launch.tools.includes(CHILD_COMMAND_TOOL) && !launch.excludeTools?.includes("bash") && !launch.excludeTools?.includes(CHILD_COMMAND_TOOL) && typeof pi.createBashTool === "function" ? createChildCommandRuntime(supervisorChannelDir(launch.runtime.runId, launch.runtime.agent, launch.runtime.childIndex)) : void 0;
      const settingsManager = pi.SettingsManager.create(launch.cwd, agentDir, { projectTrusted: launch.projectTrusted });
      const themeKey = /* @__PURE__ */ Symbol.for("@earendil-works/pi-coding-agent:theme");
      const themeInitialized = Boolean(globalThis[themeKey]);
      if (!themeInitialized && typeof pi.initTheme === "function") pi.initTheme(settingsManager.getTheme());
      const createCodemodeExtension = pi.createCodemodeExtension;
      const codemodeAllowed = !launch.runtime.capabilityCeiling?.denyExtensions && (launch.tools === void 0 || launch.tools.includes("codemode")) && !launch.excludeTools?.includes("codemode");
      const codemode = typeof createCodemodeExtension === "function" && (codemodeAllowed || builtinMcp) ? [{ name: "codemode", replaceable: true, factory: (api) => createCodemodeExtension()(new Proxy(api, {
        get(target, prop) {
          if (prop === "registerTool") return (tool) => {
            if (tool.name === "codemode") readinessTool = tool;
            target.registerTool(codemodeAllowed ? tool : { ...tool, exposure: "hidden" });
          };
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
      })) }] : [];
      const requiredPaths = new Set((launch.requiredExtensions ?? []).map(({ path: path17 }) => path17));
      const requiredExtensionIdentity = createRequiredChildExtensionIdentity(requiredPaths);
      const resolvedExtensionPaths = /* @__PURE__ */ new Map();
      const isRequiredSource = (extensionPath) => requiredPaths.size > 0 && requiredExtensionIdentity(
        resolvedExtensionPaths.get(extensionPath) ?? extensionPath.replace(PI_UNICODE_SPACES, " ")
      ) !== void 0;
      const loader = new pi.DefaultResourceLoader({
        cwd: launch.cwd,
        agentDir,
        settingsManager,
        noExtensions: !launch.ambientExtensions,
        noSkills: launch.noSkills,
        // Pi merges skills from extensions' resources_discover without checking noSkills.
        skillsOverride: launch.noSkills ? (base) => ({ ...base, skills: [] }) : void 0,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: launch.noContextFiles,
        additionalExtensionPaths: builtinMcp ? [...launch.extensionPaths, "builtin:mcp"] : launch.extensionPaths,
        extensionFactories: [...launch.hooks, ...commands ? [{ name: "pi-subagents:commands", factory: (api) => {
          api.registerTool(commands.wrap(pi.createBashTool(launch.cwd, { commandPrefix: settingsManager.getShellCommandPrefix(), shellPath: settingsManager.getShellPath() })));
          api.registerTool(commands.tool());
        } }] : [], ...codemode, ...builtinMcp ? [builtinMcp] : []],
        extensionsOverride: (result5) => orderChildPromptHooks(prioritizeChildCommandRuntime(result5)),
        ...launch.systemPrompt !== void 0 ? { systemPrompt: launch.systemPrompt } : {},
        // An empty list stops Pi from filling the slot with the operator's APPEND_SYSTEM.md (#2960).
        appendSystemPrompt: launch.appendSystemPrompt !== void 0 ? [launch.appendSystemPrompt] : []
      });
      const shutdownSession = async (session2) => {
        try {
          await commands?.shutdown();
          const runner = session2.extensionRunner;
          if (runner.hasHandlers("session_shutdown")) {
            await Promise.race([runner.emit({ type: "session_shutdown", reason: "quit" }), new Promise((resolve4) => setTimeout(resolve4, shutdownTimeoutMs).unref?.())]);
          }
        } catch (error2) {
          launch.onExtensionError?.({ extensionPath: "<session>", event: "session_shutdown", error: error2 });
        } finally {
          session2.dispose();
        }
      };
      let inheritedProviders = /* @__PURE__ */ new Set();
      const open = async () => {
        applyProcessEnv(launch.processEnv);
        if (!resetExtensionCacheOnReload(loader) && (launch.ambientExtensions || launch.extensionPaths.length)) launch.onExtensionError?.({ extensionPath: "<loader>", event: "load", error: new Error("pi's extension cache reset is unavailable; extensions loaded into this child share module state with other sessions in this process.") });
        await loader.reload();
        if (requiredPaths.size > 0) for (const extension of loader.getExtensions().extensions) resolvedExtensionPaths.set(extension.path, extension.resolvedPath);
        const loadErrors = requiredPaths.size > 0 ? loader.getExtensions().errors.filter(({ path: path17 }) => isRequiredSource(path17)) : [];
        if (loadErrors.length > 0) throw new Error(`Required child extension failed to load: ${loadErrors.map(({ path: path17, error: error2 }) => `${path17}: ${error2}`).join("; ")}`);
        const queued = flushQueuedProviderRegistrations(loader, modelRuntime, launch.onExtensionError, isRequiredSource);
        if (requiredPaths.size > 0) {
          const loadedIdentities = new Set(loader.getExtensions().extensions.map(({ resolvedPath }) => requiredExtensionIdentity(resolvedPath)));
          const missing = [...requiredPaths].filter((extensionPath) => !loadedIdentities.has(requiredExtensionIdentity(extensionPath)));
          if (missing.length) throw new Error(`Required child extension failed to load: ${missing.join(", ")}`);
        }
        if (launch.parentProviderRegistry) inheritedProviders = inheritParentProviders(modelRuntime, launch.parentProviderRegistry, queued.claimedProviderIds, launch.onExtensionError);
        if (queued.registered || inheritedProviders.size > 0) {
          try {
            await modelRuntime.refresh({ allowNetwork: false });
          } catch (error2) {
            launch.onExtensionError?.({ extensionPath: "<provider-refresh>", event: "refresh_providers", error: error2 });
            throw new Error(`Failed to refresh child providers: ${error2 instanceof Error ? error2.message : String(error2)}`, { cause: error2 });
          }
        }
        const newSessionOptions = launch.parentSessionFile ? { parentSession: launch.parentSessionFile } : void 0;
        const newSessionFile = launch.storage.kind === "file" && !fs14.existsSync(launch.storage.sessionFile);
        const sessionManager = launch.storage.kind === "file" ? pi.SessionManager.open(launch.storage.sessionFile, void 0, launch.cwd) : launch.storage.kind === "dir" ? pi.SessionManager.create(launch.cwd, launch.storage.sessionDir, newSessionOptions) : launch.storage.kind === "memory" ? pi.SessionManager.inMemory(launch.cwd, newSessionOptions) : pi.SessionManager.create(launch.cwd, void 0, newSessionOptions);
        const header = newSessionFile && launch.parentSessionFile ? sessionManager.getHeader() : null;
        if (header) header.parentSession = launch.parentSessionFile;
        const resolvedModel = launch.model ? pi.resolveCliModel({ cliModel: launch.model, modelRuntime }) : void 0;
        if (resolvedModel?.error) throw new Error(resolvedModel.error);
        const { session: session2 } = await pi.createAgentSession({
          cwd: launch.cwd,
          agentDir,
          modelRuntime,
          ...resolvedModel?.model ? { model: resolvedModel.model } : {},
          ...resolvedModel?.thinkingLevel ? { thinkingLevel: resolvedModel.thinkingLevel } : {},
          ...launch.tools ? { tools: launch.tools } : {},
          ...launch.excludeTools?.length ? { excludeTools: launch.excludeTools } : {},
          resourceLoader: loader,
          sessionManager,
          settingsManager,
          sessionStartEvent: { type: "session_start", reason: "startup" }
        });
        pinChildCacheRetention(session2.agent);
        const requiredStartupErrors = [];
        let binding = true;
        try {
          await session2.bindExtensions({
            mode: "print",
            onError: (error2) => {
              if (binding && isRequiredSource(error2.extensionPath)) requiredStartupErrors.push(`${error2.extensionPath} (${error2.event}): ${error2.error}`);
              launch.onExtensionError?.({ extensionPath: error2.extensionPath, event: error2.event, error: error2.error });
            }
          });
        } catch (error2) {
          session2.dispose();
          throw error2;
        } finally {
          binding = false;
        }
        if (requiredStartupErrors.length > 0) {
          await shutdownSession(session2);
          throw new Error(`Required child extension failed during startup: ${requiredStartupErrors.join("; ")}`);
        }
        return session2;
      };
      const opened = loading.catch(() => {
      }).then(open);
      loading = opened;
      const session = await opened;
      let pending;
      const shutdown = () => shutdownSession(session);
      if (builtinMcp) {
        const cancel = new AbortController();
        const signal = launch.signal ? AbortSignal.any([cancel.signal, launch.signal]) : cancel.signal;
        if (disposals !== disposalsAtStart) cancel.abort();
        const ready = (async () => {
          try {
            await builtinMcp.waitForTools(signal, () => loader.getExtensions().errors.find(({ path: path17 }) => path17 === "builtin:mcp")?.error);
            if (disposals !== disposalsAtStart) throw new Error("The child session factory was disposed while the child waited for its MCP tools.");
            if (signal.aborted) throw new Error("The child launch was cancelled while waiting for its MCP tools.");
            const missing = missingBuiltinMcpTools(session, builtinMcpTools.map(({ name }) => name));
            if (missing.length) throw new Error(`Selected built-in MCP tools did not register in the child session: ${missing.join(", ")}. The MCP server may have failed to connect, or the name belongs to a different tool than the selector names; check it with /mcp.`);
          } catch (error2) {
            await shutdown();
            throw error2;
          }
        })();
        mcpWaits.set(cancel, ready);
        try {
          await ready;
        } finally {
          mcpWaits.delete(cancel);
        }
      }
      const child = {
        subscribe: (listener) => session.subscribe((event) => listener(event)),
        prompt: (text2) => session.prompt(text2),
        ...commands ? { finishCommands: () => commands.finish() } : {},
        steer: async (text2) => {
          await session.steer(text2);
        },
        followUp: async (text2) => {
          await session.followUp(text2);
        },
        abort: () => session.abort(),
        hasQueuedMessages: () => session.agent?.hasQueuedMessages?.() === true,
        dispose: () => {
          if (!pending) {
            live.delete(child);
            const shutdownDone = shutdown();
            pending = shutdownDone;
            shutdowns.add(shutdownDone);
            void shutdownDone.finally(() => shutdowns.delete(shutdownDone));
          }
          return pending;
        },
        get messages() {
          return session.messages;
        },
        get sessionFile() {
          return session.sessionFile;
        },
        get sessionId() {
          return session.sessionId;
        },
        get modelId() {
          return session.model ? `${session.model.provider}/${session.model.id}` : void 0;
        },
        get inheritedProvider() {
          return session.model && inheritedProviders.has(session.model.provider) ? session.model.provider : void 0;
        },
        get virtualModelId() {
          return session.model?.api === "pi-virtual" ? `${session.model.provider}/${session.model.id}` : void 0;
        },
        get contextWindow() {
          return session.model?.contextWindow;
        }
      };
      live.add(child);
      return child;
    },
    async dispose() {
      disposals += 1;
      for (const cancel of mcpWaits.keys()) cancel.abort();
      const children = [...live].filter((child) => !child.detached);
      for (const child of children) child.shutDown = true;
      await Promise.allSettled(children.map((child) => child.abort()));
      for (const child of children) {
        try {
          void child.dispose();
        } catch {
        }
      }
      await Promise.allSettled([...shutdowns, ...mcpWaits.values()]);
      if (live.size === 0) runtime = void 0;
    }
  };
}
var activeFactory;
var activeFactoryModule;
function childSessionFactory() {
  activeFactory ??= createLazyPlacementFactory(createDefaultChildSessionFactory());
  return activeFactory;
}
function createLazyPlacementFactory(local) {
  let placed;
  const factory = async () => placed ??= (await import("./chunk-PDZWJCHD.js")).createPlacementAwareChildSessionFactory(local);
  return {
    async create(launch) {
      return launch.machine ? (await factory()).create(launch) : local.create(launch);
    },
    async dispose() {
      if (placed) await placed.dispose();
      else await local.dispose();
    }
  };
}
function childSessionFactoryModule() {
  return activeFactoryModule;
}
async function disposeChildSessions() {
  const factory = activeFactory;
  if (!factory) return;
  await factory.dispose();
}

// src/workflows/workflow-reuse.ts
import { createHash as createHash3 } from "node:crypto";
import * as fs15 from "node:fs";
import * as path14 from "node:path";
var WORKFLOW_CHILD_JOURNAL_FILE = "workflow-children.jsonl";
var WORKFLOW_RUNTIME_REPLACED_STOP_NOTICE = "Async children that were still running keep running, and finished children are kept.";
function runtimeReplacedAbortReason() {
  return Object.assign(new Error("Workflow stopped because the extension session was replaced or reloaded."), { workflowStopCause: WORKFLOW_STOP_CAUSE_RUNTIME_REPLACED });
}
function workflowStopCause(reason) {
  return reason instanceof Error && "workflowStopCause" in reason && reason.workflowStopCause === WORKFLOW_STOP_CAUSE_RUNTIME_REPLACED ? WORKFLOW_STOP_CAUSE_RUNTIME_REPLACED : void 0;
}
function sha256(text2) {
  return createHash3("sha256").update(text2).digest("hex");
}
function workflowScriptDigest(script) {
  return sha256(script);
}
function workflowChildFingerprint(params) {
  return sha256(workflowRunParamsFingerprint(params));
}
function appendWorkflowChildJournal(workflowAsyncDir, record) {
  const journalPath = path14.join(workflowAsyncDir, WORKFLOW_CHILD_JOURNAL_FILE);
  try {
    fs15.appendFileSync(journalPath, `${JSON.stringify(record)}
`, "utf-8");
  } catch (error2) {
    console.error(`Failed to append workflow child journal '${journalPath}':`, error2);
  }
}
function readWorkflowChildJournal(runId, workflowAsyncDir) {
  const source = { runId, started: /* @__PURE__ */ new Map(), settled: /* @__PURE__ */ new Map() };
  let text2 = "";
  try {
    text2 = fs15.readFileSync(path14.join(workflowAsyncDir, WORKFLOW_CHILD_JOURNAL_FILE), "utf-8");
  } catch {
    return source;
  }
  for (const line of text2.split("\n")) {
    let record;
    try {
      record = line.trim() ? JSON.parse(line) : void 0;
    } catch {
      continue;
    }
    if (!record || typeof record.key !== "string" || typeof record.fingerprint !== "string") continue;
    if (record.type === "start" && typeof record.runId === "string") {
      source.started.set(record.key, { fingerprint: record.fingerprint, runId: record.runId });
    } else if (record.type === "settle" && record.result && typeof record.result === "object") {
      source.settled.set(record.key, { fingerprint: record.fingerprint, result: record.result });
    }
  }
  return source;
}
var WORKFLOW_REUSE_CHAIN_MAX_LINKS = 16;
function readWorkflowReuseChain(asyncDirRoot, headRunId, headStatus) {
  const source = readWorkflowChildJournal(headRunId, path14.join(asyncDirRoot, headRunId));
  const visited = /* @__PURE__ */ new Set([headRunId]);
  let next = headStatus.workflow?.reusedFrom;
  for (let links = 0; isRunId(next) && links < WORKFLOW_REUSE_CHAIN_MAX_LINKS && !visited.has(next); links++) {
    visited.add(next);
    const asyncDir = path14.join(asyncDirRoot, next);
    let status;
    try {
      status = readStatus(asyncDir);
    } catch {
      break;
    }
    if (status?.mode !== "workflow" || status.workflow?.scriptDigest !== headStatus.workflow?.scriptDigest) break;
    const link = readWorkflowChildJournal(next, asyncDir);
    for (const key of /* @__PURE__ */ new Set([...link.started.keys(), ...link.settled.keys()])) {
      if (source.started.has(key) || source.settled.has(key)) continue;
      const started = link.started.get(key);
      const settled = link.settled.get(key);
      if (started) source.started.set(key, started);
      if (settled) source.settled.set(key, settled);
    }
    next = status.workflow?.reusedFrom;
  }
  return source;
}
function claimedWorkflowRunRefusal(runId, claim, named) {
  const run = `${named ? "options.reuseFrom: workflow" : "Workflow"} run '${runId}'`;
  if (claim.kind === "resumed") return `${run} was resumed as ${claim.newRunId}; wait on it or stop it.`;
  if (claim.kind === "busy") return `${run} is being resumed by pid ${claim.pid}; wait for it.`;
  return `${run} has a resume claim that cannot be read; wait or remove it.`;
}
function assertWorkflowRunNotClaimed(asyncDir, runId, named, claimOwnerRunId) {
  const claim = workflowResumeClaimState(asyncDir);
  if (claim.kind === "none" || claim.kind !== "unreadable" && claim.newRunId === claimOwnerRunId) return;
  throw new Error(claimedWorkflowRunRefusal(runId, claim, named));
}
function findWorkflowReuseSource(asyncDirRoot, sessionId, scriptDigest, argsDigest) {
  let runIds;
  try {
    runIds = readRecentTerminalRunIndex(asyncDirRoot, { sessionId });
  } catch {
    return void 0;
  }
  for (const runId of runIds) {
    const asyncDir = path14.join(asyncDirRoot, runId);
    let status;
    try {
      status = readStatus(asyncDir);
    } catch {
      continue;
    }
    if (status?.mode !== "workflow" || status.workflow?.scriptDigest !== scriptDigest || status.workflow.argsDigest !== argsDigest) continue;
    if (!isReusableWorkflowStopCause(status.workflow.stopCause)) return void 0;
    assertWorkflowRunNotClaimed(asyncDir, runId, false);
    return readWorkflowReuseChain(asyncDirRoot, runId, status);
  }
  return void 0;
}
function readNamedWorkflowReuseSource(asyncDirRoot, runId, scriptDigest, cwd, claimOwnerRunId) {
  const runName = isRunId(runId);
  if (runName) reconcileAsyncRun(path14.join(asyncDirRoot, runId));
  const status = runName ? readStatus(path14.join(asyncDirRoot, runId)) : null;
  if (!status) throw new Error(`options.reuseFrom: workflow run '${runId}' was not found.`);
  if (status.mode !== "workflow") throw new Error(`options.reuseFrom: run '${runId}' is not a workflow run.`);
  if (!isReusableWorkflowStopCause(status.workflow?.stopCause)) throw new Error(`options.reuseFrom: workflow run '${runId}' did not stop because its session was replaced or its Pi process exited, so its children cannot be reused.`);
  if (status.workflow.scriptDigest !== scriptDigest) throw new Error(`options.reuseFrom: workflow run '${runId}' ran a different workflow script.`);
  if (status.cwd !== cwd) throw new Error(`options.reuseFrom: workflow run '${runId}' ran in '${status.cwd}', not '${cwd}'.`);
  assertWorkflowRunNotClaimed(path14.join(asyncDirRoot, runId), runId, true, claimOwnerRunId);
  return readWorkflowReuseChain(asyncDirRoot, runId, status);
}
function matchWorkflowReuse(source, key, fingerprint) {
  const settled = source.settled.get(key);
  if (settled) return settled.fingerprint === fingerprint && settled.result.ok ? { kind: "settled", result: settled.result } : void 0;
  const started = source.started.get(key);
  return started?.fingerprint === fingerprint ? { kind: "started", runId: started.runId } : void 0;
}

// src/workflows/workflow-resume.ts
import { randomUUID as randomUUID6 } from "node:crypto";
import * as path15 from "node:path";
var MAX_WORKFLOW_RESUME_ATTEMPTS = 3;
function workflowResumeRefusal(code, reason, runId) {
  const byHand = code === "launch-missing" || code === "launch-invalid" || code === "structured" || code === "digest" || code === "authority" ? relaunchByHandText(runId) : code === "capacity" || code === "attempts" || code === "launch-failed" ? resumeByHandText(runId) : "";
  return { code, reason, byHand };
}
function manualWorkflowResumeRefusalText(runId, refusal) {
  return `Cannot resume workflow '${runId}': ${refusalSentence(refusal.reason, refusal.byHand === relaunchByHandText(runId) ? refusal.byHand : "")}`;
}
function workflowResumeTargetId(asyncDirRoot, params) {
  if (params.message !== void 0 || params.task !== void 0 || params.index !== void 0) return void 0;
  if (Array.isArray(params.chain) && params.chain.length > 0) return void 0;
  const id = params.id ?? params.runId;
  if (!isRunId(id)) return void 0;
  let status;
  try {
    status = readStatus(path15.join(asyncDirRoot, id));
  } catch {
    return void 0;
  }
  return status?.mode === "workflow" && status.parentWorkflowRunId === void 0 ? id : void 0;
}
function prepareWorkflowResume(input) {
  const { asyncDirRoot, sourceRunId, trigger } = input;
  const refuse = (code, reason) => ({ ok: false, ...workflowResumeRefusal(code, reason, sourceRunId) });
  const sourceAsyncDir = path15.join(asyncDirRoot, sourceRunId);
  const stored = readStatus(sourceAsyncDir);
  if (stored && !ownsRun(input.currentSessionId, stored.sessionId)) return refuse("not-owned", "it was started in another session; reopen that session to resume it");
  if (trigger === "manual") reconcileAsyncRun(sourceAsyncDir);
  const status = readStatus(sourceAsyncDir);
  if (!status || status.mode !== "workflow" || !isReusableWorkflowStopCause(status.workflow?.stopCause)) return refuse("not-interrupted", "not interrupted; pass message to revive one of its children");
  const attempt = (status.workflow?.resumeOrigin?.attempt ?? 0) + (status.workflow?.stopCause === WORKFLOW_STOP_CAUSE_OWNER_EXITED ? 1 : 0);
  if (trigger === "auto" && attempt > MAX_WORKFLOW_RESUME_ATTEMPTS) return refuse("attempts", `${MAX_WORKFLOW_RESUME_ATTEMPTS} resumes already followed Pi exits`);
  const read = readWorkflowLaunchRecord(sourceAsyncDir);
  if (!read.ok) return read.missing ? refuse("launch-missing", "launch.json is missing (the run started before launches were saved)") : refuse("launch-invalid", `launch.json is invalid: ${read.error}`);
  const record = read.record;
  if (record.source === "structured") return refuse("structured", "launched from tasks/chain");
  if (record.source === "script" && (typeof record.params.workflowScript !== "string" || workflowScriptDigest(record.params.workflowScript) !== record.scriptDigest)) {
    return refuse("launch-invalid", "launch.json is invalid: its script does not match its scriptDigest");
  }
  const normalized = normalizePublicSubagentExecution(record.params);
  if (!normalized.ok) return refuse("launch-invalid", `launch.json is invalid: ${normalized.error}`);
  const newRunId = input.newRunId ?? randomUUID6();
  const claim = claimWorkflowResume(sourceAsyncDir, { newRunId, trigger, now: input.now });
  if (claim.kind === "resumed") return refuse("claim-resumed", `resumed as ${claim.newRunId}; wait on it or stop it`);
  if (claim.kind === "busy") return refuse("claim-busy", `being resumed by pid ${claim.pid}`);
  if (claim.kind === "unreadable") return refuse("claim-busy", "its resume claim cannot be read; wait or remove it");
  return {
    ok: true,
    prepared: {
      sourceRunId,
      sourceAsyncDir,
      newRunId,
      trigger,
      params: {
        ...record.params,
        async: true,
        reuseFrom: sourceRunId,
        ...status.admissionCapabilityCeiling ? { capabilityCeiling: status.admissionCapabilityCeiling } : {}
      },
      expectedScriptDigest: record.scriptDigest,
      resumeOrigin: { sourceRunId, attempt }
    }
  };
}

// src/extension/subagent-options.ts
import { isDeepStrictEqual } from "node:util";
import { Compile } from "typebox/compile";
var optionKeys = new Set(SUBAGENT_OPTION_KEYS);
var ALIAS_HINTS = { runId: "id (top-level)", maxRuntimeMs: "options.timeoutMs", isolation: "worktree (top-level)" };
var optionsValidator = Compile(SubagentOptionParams);
function flattenSubagentToolOptions(params, disabled) {
  const removedTopLevel = removedModelWorkflowFieldError(params);
  if (removedTopLevel) throw new Error(removedTopLevel);
  const { options, ...topLevel } = params;
  if (options === void 0) return topLevel;
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("subagent: options must be an object.");
  const removedField = removedModelWorkflowFieldError(options);
  if (removedField) throw new Error(removedField);
  const entries = Object.entries(options);
  const enabledKeys = SUBAGENT_OPTION_KEYS.filter((key) => !disabled?.params.has(key));
  const unknown = entries.map(([key]) => key).filter((key) => !optionKeys.has(key));
  if (unknown.length > 0) {
    const fields = Object.keys(createSubagentParamsSchema(disabled).properties);
    const hints = unknown.map((key) => {
      if (Object.hasOwn(ALIAS_HINTS, key)) return `unknown options key '${key}'; use ${ALIAS_HINTS[key]}.`;
      if (fields.includes(key)) return `'${key}' is a top-level field, not an option.`;
      const suggestion = closestMatch(key, enabledKeys);
      return `unknown options key '${key}'.${suggestion ? ` Did you mean '${suggestion}'?` : ""}`;
    });
    throw new Error(`subagent: ${hints.join(" ")} Valid options: ${enabledKeys.sort().join(", ")}.`);
  }
  const disabledKey = entries.find(([key]) => disabled?.params.has(key))?.[0];
  if (disabledKey) throw new Error(`subagent option 'options.${disabledKey}' is disabled by config ${disabled.params.get(disabledKey)}.`);
  if (!optionsValidator.Check(options)) {
    const errors = [...optionsValidator.Errors(options)].slice(0, 4).map((error2) => `options${error2.instancePath.replaceAll("/", ".")} ${error2.message}`);
    throw new Error(`subagent: ${errors.join("; ")}.`);
  }
  const conflicts = entries.filter(([key, value]) => topLevel[key] !== void 0 && !isDeepStrictEqual(topLevel[key], value)).map(([key]) => `'${key}'`);
  if (conflicts.length > 0) throw new Error(`subagent: ${conflicts.join(", ")} given both at the top level and in options with different values; give each once.`);
  return { ...topLevel, ...options };
}

// src/runs/background/retained-children.ts
import * as fs16 from "node:fs";
var MAX_RETAINED_CHILDREN = 10;
var MAX_RETAINED_CHILD_CANDIDATES = 100;
var MAX_TASK_SUMMARY_LENGTH = 120;
function isRetainedChildState(state) {
  return state === "complete" || state === "failed" || state === "partial" || state === "paused" || state === "stopped";
}
function isTerminalStepStatus(status) {
  return status === "complete" || status === "completed" || status === "failed" || status === "paused" || status === "stopped";
}
function retainedSessionFile(sessionFile) {
  if (!sessionFile) return { state: "not-resumable", reason: "no persisted session file" };
  if (!sessionFile.endsWith(".jsonl")) return { state: "not-resumable", reason: "persisted session file is not a .jsonl file" };
  try {
    const stat = fs16.lstatSync(sessionFile);
    if (!stat.isFile() || stat.isSymbolicLink()) return { state: "not-resumable", reason: "persisted session file is not a regular file" };
    return { state: "resumable", sessionPath: sessionFile };
  } catch (error2) {
    if (typeof error2 === "object" && error2 !== null && "code" in error2 && error2.code === "ENOENT") {
      return { state: "not-resumable", reason: `persisted session file is missing: ${sessionFile}` };
    }
    return { state: "not-resumable", reason: `persisted session file could not be inspected: ${error2 instanceof Error ? error2.message : String(error2)}` };
  }
}
function childResumability(run, step) {
  if (run.state === "stopped" || step.status === "stopped") return { state: "not-resumable", reason: "stopped run" };
  if (step.runner?.type === "external-cli" || step.runner?.type === "external-job") return { state: "not-resumable", reason: "external runner" };
  const session = retainedSessionFile(step.sessionFile ?? run.sessionFile);
  if (session.state === "not-resumable") return session;
  let recoveryDescriptor;
  try {
    recoveryDescriptor = readAsyncRecoveryDescriptor(run.asyncDir);
    if (!recoveryDescriptor) return { state: "not-resumable", reason: "missing recovery descriptor" };
    if (recoveryDescriptor.sourceRunId !== run.id) return { state: "not-resumable", reason: `recovery descriptor belongs to run ${recoveryDescriptor.sourceRunId}` };
    if (recoveryDescriptor.agent !== step.agent) return { state: "not-resumable", reason: `recovery descriptor belongs to agent ${recoveryDescriptor.agent}` };
  } catch (error2) {
    return { state: "not-resumable", reason: `invalid recovery descriptor: ${error2 instanceof Error ? error2.message : String(error2)}` };
  }
  let requiredCwd;
  try {
    requiredCwd = resolveRetainedWorktreeCwd(parallelHandoffPath(run.asyncDir), run.id, step.index) ?? recoveryDescriptor.cwd ?? run.cwd;
    if (!requiredCwd || !fs16.statSync(requiredCwd).isDirectory()) return { state: "not-resumable", reason: `required cwd is missing: ${requiredCwd ?? "unknown"}` };
  } catch (error2) {
    return { state: "not-resumable", reason: `resume dependency unavailable: ${error2 instanceof Error ? error2.message : String(error2)}` };
  }
  return session;
}
function boundedTaskSummary(value) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > MAX_TASK_SUMMARY_LENGTH ? `${normalized.slice(0, MAX_TASK_SUMMARY_LENGTH - 1)}\u2026` : normalized;
}
function listRetainedChildren(asyncDirRoot, sessionId) {
  const children = listAsyncRuns(asyncDirRoot, { sessionId, states: ["complete", "failed", "paused", "stopped"], entryLimit: MAX_RETAINED_CHILD_CANDIDATES, reconcile: false }).flatMap((run) => {
    if (!run.parentWorkflowRunId || run.steps.length !== 1) return [];
    if (!isRetainedChildState(run.state)) return [];
    const step = run.steps[0];
    if (!isTerminalStepStatus(step.status)) return [];
    const completedAt = run.endedAt ?? run.lastUpdate;
    if (completedAt === void 0) return [];
    const resumability = childResumability(run, step);
    return [{
      runId: run.id,
      ...run.parentWorkflowRunId ? { parentRunId: run.parentWorkflowRunId } : {},
      ...run.workflowKey ? { workflowKey: run.workflowKey } : {},
      state: run.state,
      agent: step.agent,
      taskSummary: boundedTaskSummary(step.description),
      completedAt,
      resumability,
      ...resumability.state === "resumable" ? { sessionPath: resumability.sessionPath } : {},
      ...step.tokens ?? run.totalTokens ? { tokenTotals: step.tokens ?? run.totalTokens } : {}
    }];
  }).sort((left, right) => right.completedAt - left.completedAt);
  return children;
}
function formatRetainedChildren(children) {
  const noKnownEligibleTargetGuidance = 'children.list is workflow-only and is not an exhaustive list of direct native children. If the exact run id of the intended child is known, inspect it with subagent({ action: "status", id: "..." }); if status identifies the candidate, attempt subagent({ action: "resume", id: "...", message: "..." }), which authoritatively checks eligibility and may reject it. Launch a same-role fallback challenge, labeled as fallback, only when there is no known candidate or resume rejects eligibility.';
  if (children.length === 0) return `No retained workflow children in the active parent session. ${noKnownEligibleTargetGuidance}`;
  const retained = children.slice(0, MAX_RETAINED_CHILDREN);
  if (!retained.some((child) => child.resumability.state === "resumable")) {
    const resumable = children.slice(MAX_RETAINED_CHILDREN).find((child) => child.resumability.state === "resumable");
    if (resumable && retained.length === MAX_RETAINED_CHILDREN) retained[MAX_RETAINED_CHILDREN - 1] = resumable;
  }
  const hasResumableChild = retained.some((child) => child.resumability.state === "resumable");
  return [
    `Retained workflow children (up to ${MAX_RETAINED_CHILDREN}; newest first, with a resumable child retained when available):`,
    ...retained.flatMap((child) => [
      `- ${child.runId} | ${child.agent} | ${child.state} | ${new Date(child.completedAt).toISOString()}`,
      ...child.parentRunId ? [`  workflow: ${child.parentRunId}${child.workflowKey ? ` (${child.workflowKey})` : ""}`] : [],
      `  task: ${child.taskSummary || "(no task summary)"}`,
      child.resumability.state === "resumable" ? "  resumability: resumable" : `  resumability: not resumable (${child.resumability.reason})`,
      ...child.resumability.state === "resumable" ? [
        `  session: ${child.resumability.sessionPath}`,
        `  resume: subagent({ action: "resume", id: "${child.runId}", message: "..." })`
      ] : [],
      ...child.tokenTotals ? [`  tokens: input ${child.tokenTotals.input}, output ${child.tokenTotals.output}, total ${child.tokenTotals.total}`] : []
    ]),
    ...hasResumableChild ? [] : [`No resumable retained workflow child is listed. ${noKnownEligibleTargetGuidance}`]
  ].join("\n");
}

// src/runs/shared/external-job-bridge.ts
import { randomUUID as randomUUID7 } from "node:crypto";
import * as fs17 from "node:fs";
import * as os2 from "node:os";
import * as path16 from "node:path";
var EXTERNAL_JOB_BRIDGE_REQUEST_DIR = "external-job-requests";
var EXTERNAL_JOB_BRIDGE_RESPONSE_DIR = "external-job-responses";
var CHILD_BRIDGE_SWEEP_INTERVAL_MS = 1e3;
var MAX_REQUESTS_PER_SWEEP = 100;
var inFlight = /* @__PURE__ */ new Set();
function requestDir(asyncDir) {
  return path16.join(asyncDir, EXTERNAL_JOB_BRIDGE_REQUEST_DIR);
}
function responseDir(asyncDir) {
  return path16.join(asyncDir, EXTERNAL_JOB_BRIDGE_RESPONSE_DIR);
}
function requestPath(asyncDir, id) {
  return path16.join(requestDir(asyncDir), `${id}.json`);
}
function isDispatchOperation(operation) {
  return operation === "start" || operation === "follow-up";
}
function dispatchClaimDir(asyncDir, id) {
  return path16.join(requestDir(asyncDir), `${id}.claim`);
}
function dispatchClaimTempDir(asyncDir, id) {
  return path16.join(requestDir(asyncDir), `${id}.claim.tmp-${randomUUID7()}`);
}
function dispatchClaimCompletedPath(claimDir) {
  return path16.join(claimDir, "completed.json");
}
function dispatchClaimHandlePath(claimDir) {
  return path16.join(claimDir, "handle.json");
}
function completedDispatchClaimExists(asyncDir, id) {
  return fs17.existsSync(dispatchClaimCompletedPath(dispatchClaimDir(asyncDir, id)));
}
function responsePath(asyncDir, id) {
  return path16.join(responseDir(asyncDir), `${id}.json`);
}
function readJson2(filePath) {
  return JSON.parse(fs17.readFileSync(filePath, "utf-8"));
}
function processStartIdentity(pid) {
  if (process.platform === "linux") {
    try {
      const stat = fs17.readFileSync(`/proc/${pid}/stat`, "utf-8");
      const commandEnd = stat.lastIndexOf(")");
      if (commandEnd === -1) return void 0;
      const fields = stat.slice(commandEnd + 1).trim().split(/\s+/);
      const startTicks = fields[19];
      return startTicks ? `linux:${startTicks}` : void 0;
    } catch {
      return void 0;
    }
  }
  return void 0;
}
function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error2) {
    const code = error2.code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    return void 0;
  }
}
function currentClaimOwner() {
  const startIdentity = processStartIdentity(process.pid);
  return {
    version: 1,
    pid: process.pid,
    hostname: os2.hostname(),
    claimedAt: Date.now(),
    ...startIdentity ? { processStartIdentity: startIdentity } : {}
  };
}
function isClaimConflictError(error2) {
  if (typeof error2 !== "object" || error2 === null || !("code" in error2)) return false;
  const code = error2.code;
  return code === "EEXIST" || code === "ENOTEMPTY" || code === "EPERM";
}
function isNotFoundError(error2) {
  return typeof error2 === "object" && error2 !== null && "code" in error2 && error2.code === "ENOENT";
}
function bridgeError(error2) {
  if (error2 instanceof ExternalJobProviderError) {
    return { code: error2.code, message: error2.message, ...error2.blockingJobId ? { blockingJobId: error2.blockingJobId } : {} };
  }
  if (error2 && typeof error2 === "object") {
    const record = error2;
    const code = typeof record.code === "string" && record.code.trim() ? record.code : "provider-error";
    const blockingJobId = typeof record.blockingJobId === "string" && record.blockingJobId.trim() ? record.blockingJobId : void 0;
    return {
      code,
      message: error2 instanceof Error ? error2.message : String(error2),
      ...blockingJobId ? { blockingJobId } : {}
    };
  }
  return { code: "provider-error", message: String(error2) };
}
function assertRequest(value, filePath) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`External-job bridge request '${filePath}' must be an object.`);
  const request = value;
  if (typeof request.id !== "string" || !request.id) throw new Error(`External-job bridge request '${filePath}' has invalid id.`);
  if (request.operation !== "start" && request.operation !== "follow-up" && request.operation !== "status" && request.operation !== "result" && request.operation !== "reattach") throw new Error(`External-job bridge request '${filePath}' has invalid operation.`);
  if (typeof request.provider !== "string" || !request.provider.trim()) throw new Error(`External-job bridge request '${filePath}' has invalid provider.`);
  if (typeof request.createdAt !== "number") throw new Error(`External-job bridge request '${filePath}' has invalid createdAt.`);
  if (request.claimedAt !== void 0 && typeof request.claimedAt !== "number") throw new Error(`External-job bridge request '${filePath}' has invalid claimedAt.`);
  if (request.operation === "start") {
    if (!request.start || typeof request.start !== "object" || Array.isArray(request.start)) throw new Error(`External-job bridge start request '${filePath}' is missing start input.`);
  } else if (request.operation === "follow-up") {
    if (!request.followUp || typeof request.followUp !== "object" || Array.isArray(request.followUp)) throw new Error(`External-job bridge follow-up request '${filePath}' is missing follow-up input.`);
  } else if (typeof request.providerJobId !== "string" || !request.providerJobId.trim()) {
    throw new Error(`External-job bridge ${request.operation} request '${filePath}' is missing providerJobId.`);
  }
  return request;
}
async function executeBridgeRequest(request, claimDir) {
  const provider = getExternalJobProvider(request.provider);
  if (!provider) {
    return {
      id: request.id,
      ok: false,
      operation: request.operation,
      provider: request.provider,
      code: "provider-unavailable",
      message: `External-job provider '${request.provider}' is not registered. Load the Surf Pi extension and its external-job provider bridge before starting this agent.`,
      completedAt: Date.now()
    };
  }
  try {
    let raw;
    if (request.operation === "start") {
      raw = await provider.start(request.start);
    } else if (request.operation === "follow-up") {
      if (typeof provider.followUp !== "function") {
        throw new ExternalJobProviderError(`External-job provider '${request.provider}' does not support follow-up. Update or reload the provider package, then retry action='resume'.`, { code: "follow-up-unsupported" });
      }
      raw = await provider.followUp(request.followUp);
    } else {
      raw = request.operation === "status" ? await provider.status(request.providerJobId) : request.operation === "reattach" ? await provider.reattach(request.providerJobId) : await provider.result(request.providerJobId);
    }
    const result5 = request.operation === "result" ? validateExternalJobResult(provider.name, raw, "External-job bridge result") : validateExternalJobHandle(provider.name, raw, "External-job bridge handle");
    if (isDispatchOperation(request.operation) && claimDir) writeAtomicJson(dispatchClaimHandlePath(claimDir), result5);
    return { id: request.id, ok: true, operation: request.operation, provider: request.provider, result: result5, completedAt: Date.now() };
  } catch (error2) {
    const details = bridgeError(error2);
    return {
      id: request.id,
      ok: false,
      operation: request.operation,
      provider: request.provider,
      ...details,
      completedAt: Date.now()
    };
  }
}
function claimDispatchRequest(asyncDir, filePath, request) {
  const owner = currentClaimOwner();
  const claimed = { ...request, claimedAt: owner.claimedAt };
  const claimDir = dispatchClaimDir(asyncDir, request.id);
  const tempClaimDir = dispatchClaimTempDir(asyncDir, request.id);
  try {
    fs17.mkdirSync(tempClaimDir);
    writeAtomicJson(path16.join(tempClaimDir, "owner.json"), owner);
    writeAtomicJson(path16.join(tempClaimDir, "request.json"), claimed);
    fs17.renameSync(tempClaimDir, claimDir);
  } catch (error2) {
    fs17.rmSync(tempClaimDir, { recursive: true, force: true });
    if (isClaimConflictError(error2)) return void 0;
    throw error2;
  }
  fs17.rmSync(filePath, { force: true });
  return { request: claimed, filePath: claimDir };
}
function parseClaimOwner(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const owner = value;
  if (owner.version !== 1 || typeof owner.pid !== "number" || !Number.isInteger(owner.pid) || owner.pid <= 0 || typeof owner.hostname !== "string" || typeof owner.claimedAt !== "number") return void 0;
  if (owner.processStartIdentity !== void 0 && typeof owner.processStartIdentity !== "string") return void 0;
  return owner;
}
function claimOwnerIsDead(owner) {
  if (!owner || owner.hostname !== os2.hostname()) return false;
  const alive = processIsAlive(owner.pid);
  if (alive === false) return true;
  if (alive !== true || !owner.processStartIdentity) return false;
  const currentIdentity = processStartIdentity(owner.pid);
  return currentIdentity !== void 0 && currentIdentity !== owner.processStartIdentity;
}
function readClaimOwner(claimDir) {
  try {
    return parseClaimOwner(readJson2(path16.join(claimDir, "owner.json")));
  } catch {
    return void 0;
  }
}
function readClaimHandle(provider, claimDir) {
  try {
    return validateExternalJobHandle(provider, readJson2(dispatchClaimHandlePath(claimDir)), "External-job bridge recovered dispatch handle");
  } catch {
    return void 0;
  }
}
function externalJobBridgeEligibility(steps) {
  if (!Array.isArray(steps)) return "unknown";
  for (const step of steps) {
    const runner = step?.runner;
    if (runner === void 0) continue;
    if (!runner || typeof runner !== "object" || Array.isArray(runner)) return "unknown";
    const runnerType = runner.type;
    if (typeof runnerType !== "string") return "unknown";
    if (runnerType === "external-job") return "required";
    if (runnerType !== "pi" && runnerType !== "external-cli") return "unknown";
  }
  return "not-required";
}
function createChildExternalJobBridgeSweeper() {
  const runs = /* @__PURE__ */ new Map();
  let timer;
  const sweep = () => {
    for (const [runId, asyncDir] of runs) {
      try {
        const status = readStatus(asyncDir);
        if (externalJobBridgeEligibility(status?.steps) !== "not-required") serviceExternalJobBridgeRequests(asyncDir);
        if (status && !isActiveAsyncState(status.state)) runs.delete(runId);
      } catch (error2) {
        console.error(`Failed to service external-job bridge requests for '${asyncDir}':`, error2);
      }
    }
    if (runs.size === 0 && timer) {
      clearInterval(timer);
      timer = void 0;
    }
    return runs.size;
  };
  return {
    track(runId, asyncDir) {
      runs.set(runId, asyncDir);
      if (timer) return;
      timer = setInterval(sweep, CHILD_BRIDGE_SWEEP_INTERVAL_MS);
      timer.unref?.();
    },
    sweep,
    dispose() {
      runs.clear();
      if (timer) clearInterval(timer);
      timer = void 0;
    }
  };
}
function serviceExternalJobBridgeRequests(asyncDir) {
  let files;
  try {
    files = fs17.readdirSync(requestDir(asyncDir), { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !completedDispatchClaimExists(asyncDir, entry.name.replace(/\.json$/, "")) || entry.isDirectory() && entry.name.endsWith(".claim") && !fs17.existsSync(dispatchClaimCompletedPath(path16.join(requestDir(asyncDir), entry.name)))).map((entry) => entry.name).slice(0, MAX_REQUESTS_PER_SWEEP);
  } catch (error2) {
    if (error2.code === "ENOENT") return;
    throw error2;
  }
  fs17.mkdirSync(responseDir(asyncDir), { recursive: true });
  for (const file of files) {
    serviceExternalJobBridgeRequestFile(asyncDir, file);
  }
}
function serviceExternalJobBridgeRequestFile(asyncDir, file) {
  fs17.mkdirSync(responseDir(asyncDir), { recursive: true });
  if (file.endsWith(".claim")) {
    serviceExternalJobDispatchClaim(asyncDir, file);
    return;
  }
  const filePath = path16.join(requestDir(asyncDir), file);
  let request;
  try {
    request = assertRequest(readJson2(filePath), filePath);
  } catch (error2) {
    if (isNotFoundError(error2)) return;
    const id = file.replace(/\.json$/, "");
    writeAtomicJson(responsePath(asyncDir, id), {
      id,
      ok: false,
      operation: "status",
      provider: "unknown",
      code: "malformed-request",
      message: error2 instanceof Error ? error2.message : String(error2),
      completedAt: Date.now()
    });
    fs17.rmSync(filePath, { force: true });
    return;
  }
  if (isDispatchOperation(request.operation) && completedDispatchClaimExists(asyncDir, request.id)) {
    fs17.rmSync(filePath, { force: true });
    return;
  }
  if (inFlight.has(request.id) || fs17.existsSync(responsePath(asyncDir, request.id))) return;
  if (isDispatchOperation(request.operation) && request.claimedAt !== void 0) return;
  const claimed = isDispatchOperation(request.operation) ? claimDispatchRequest(asyncDir, filePath, request) : { request, filePath };
  if (!claimed) return;
  const claimedRequest = claimed.request;
  inFlight.add(claimedRequest.id);
  void executeBridgeRequest(claimedRequest, isDispatchOperation(claimedRequest.operation) ? claimed.filePath : void 0).then((response) => {
    writeAtomicJson(responsePath(asyncDir, claimedRequest.id), response);
    if (isDispatchOperation(claimedRequest.operation)) {
      writeAtomicJson(dispatchClaimCompletedPath(claimed.filePath), { completedAt: Date.now() });
    } else {
      fs17.rmSync(claimed.filePath, { recursive: true, force: true });
    }
  }).catch((error2) => {
    writeAtomicJson(responsePath(asyncDir, claimedRequest.id), {
      id: claimedRequest.id,
      ok: false,
      operation: claimedRequest.operation,
      provider: claimedRequest.provider,
      code: "bridge-error",
      message: error2 instanceof Error ? error2.message : String(error2),
      completedAt: Date.now()
    });
    if (isDispatchOperation(claimedRequest.operation)) writeAtomicJson(dispatchClaimCompletedPath(claimed.filePath), { completedAt: Date.now() });
  }).finally(() => {
    inFlight.delete(claimedRequest.id);
  });
}
function serviceExternalJobDispatchClaim(asyncDir, file) {
  const claimDir = path16.join(requestDir(asyncDir), file);
  if (fs17.existsSync(dispatchClaimCompletedPath(claimDir))) return;
  const owner = readClaimOwner(claimDir);
  if (!owner && fs17.existsSync(requestPath(asyncDir, file.replace(/\.claim$/, ""))) && !fs17.existsSync(responsePath(asyncDir, file.replace(/\.claim$/, "")))) {
    fs17.rmSync(claimDir, { recursive: true, force: true });
    return;
  }
  if (!claimOwnerIsDead(owner)) return;
  let request;
  try {
    request = assertRequest(readJson2(path16.join(claimDir, "request.json")), path16.join(claimDir, "request.json"));
  } catch {
    return;
  }
  if (!isDispatchOperation(request.operation) || fs17.existsSync(responsePath(asyncDir, request.id))) return;
  const handle = readClaimHandle(request.provider, claimDir);
  if (handle) {
    writeAtomicJson(responsePath(asyncDir, request.id), {
      id: request.id,
      ok: true,
      operation: request.operation,
      provider: request.provider,
      result: handle,
      completedAt: Date.now()
    });
    writeAtomicJson(dispatchClaimCompletedPath(claimDir), { completedAt: Date.now() });
    fs17.rmSync(requestPath(asyncDir, request.id), { force: true });
    return;
  }
  writeAtomicJson(responsePath(asyncDir, request.id), {
    id: request.id,
    ok: false,
    operation: request.operation,
    provider: request.provider,
    code: `${request.operation}-dispatch-abandoned`,
    message: `External-job ${request.operation} for provider '${request.provider}' was claimed by a host process that is no longer alive before a provider job id was committed. Refusing to redispatch the prompt automatically.`,
    completedAt: Date.now()
  });
  fs17.rmSync(claimDir, { recursive: true, force: true });
  fs17.rmSync(requestPath(asyncDir, request.id), { force: true });
}

// src/shared/provider-diagnostics.ts
import { isRetryableAssistantError } from "@earendil-works/pi-ai";
var ACCOUNT_LIMIT = /quota|billing|out of budget|available balance|(?:account|subscription|credits?|balance|usage)[\s_-]*(?:(?:is|are|has been|have been)[\s_-]*)?(?:limit|exhaust|deplet|exceed)|(?:insufficient|exhausted|depleted|low|no(?:[\s_-]+remaining)?)[\s_-]*(?:credits?|balance|fund)/i;
var RATE_LIMIT = /\brate[\s_-]*limit(?:ed|ing|s|_(?:exceeded|error))?\b|\btoo[\s_-]+many[\s_-]+requests\b|\b(?:HTTP(?:\/\d(?:\.\d)?)?\s*[:=]?\s*429|(?:status|statusCode|status_code)["']?\s*[:=]?\s*429)\b|^\s*429\b/i;
function classifyError(message) {
  const text2 = message.errorMessage;
  if (!text2 || ACCOUNT_LIMIT.test(text2) || !isRetryableAssistantError(message)) return "unknown";
  return RATE_LIMIT.test(text2) ? "rate_limited" : "transient_other";
}
var SAFE_ERROR_MESSAGES = {
  rate_limited: "Assistant request was rate limited.",
  transient_other: "Assistant request encountered a transient provider or transport error.",
  unknown: "Assistant request failed."
};
function observeProviderDiagnostics(current, event, at) {
  if (event.type === "message_end") {
    const message = event.message;
    if (message?.role === "assistant" && message.stopReason === "error") {
      const kind = classifyError(message);
      return {
        ...current,
        errorCount: (current?.errorCount ?? 0) + 1,
        lastError: { kind, message: SAFE_ERROR_MESSAGES[kind], at }
      };
    }
  } else if (event.type === "auto_retry_start") {
    const { attempt, maxAttempts, delayMs } = event;
    if (typeof attempt === "number" && Number.isSafeInteger(attempt) && attempt > 0 && typeof maxAttempts === "number" && Number.isSafeInteger(maxAttempts) && maxAttempts >= attempt && typeof delayMs === "number" && Number.isFinite(delayMs) && delayMs >= 0) {
      return { ...current, errorCount: current?.errorCount ?? 0, retry: { phase: "backoff", attempt, maxAttempts, delayMs, scheduledAt: at } };
    }
  } else if ((event.type === "agent_start" || event.type === "turn_start") && current?.retry?.phase === "backoff") {
    return { ...current, retry: { ...current.retry, phase: "in_flight" } };
  } else if (event.type === "auto_retry_end" || event.type === "agent_settled") {
    return clearProviderRetry(current);
  }
  return current;
}
function clearProviderRetry(current) {
  if (!current?.retry) return current;
  const { retry: _retry, ...history } = current;
  return history;
}
function snapshotProviderDiagnostics(current) {
  if (!current) return void 0;
  return {
    errorCount: current.errorCount,
    ...current.lastError ? { lastError: { ...current.lastError } } : {},
    ...current.retry ? { retry: { ...current.retry } } : {}
  };
}
function sameProviderDiagnostics(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.errorCount === right.errorCount && left.lastError?.kind === right.lastError?.kind && left.lastError?.message === right.lastError?.message && left.lastError?.at === right.lastError?.at && left.retry?.phase === right.retry?.phase && left.retry?.attempt === right.retry?.attempt && left.retry?.maxAttempts === right.retry?.maxAttempts && left.retry?.delayMs === right.retry?.delayMs && left.retry?.scheduledAt === right.retry?.scheduledAt;
}

export {
  getInspectorPlugins,
  registerInspectorEventListener,
  effectiveToolTimeoutMs,
  formatToolTimeoutMessage,
  toolTimeoutCallKey,
  resolveToolTimeoutMs,
  toolTimeoutFromEnv,
  DEFAULT_CONTROL_CONFIG,
  resolveControlConfig,
  deriveActivityState,
  shouldEmitOpenToolAttention,
  buildControlEvent,
  shouldNotifyControlEvent,
  controlNotificationKey,
  claimControlNotification,
  formatControlNoticeMessage,
  formatControlIntercomMessage,
  EXTERNAL_JOB_BRIDGE_REQUEST_DIR,
  externalJobBridgeEligibility,
  createChildExternalJobBridgeSweeper,
  serviceExternalJobBridgeRequests,
  REVIVAL_ORIGIN_FILE,
  recordWorkflowRevival,
  projectWorkflowKeyRevival,
  formatWorkflowKeyRevival,
  withWorkflowRevivals,
  buildCompletionKey,
  markSeenWithTtl,
  formatMidToolExitError,
  isOrdinaryToolForMidToolExit,
  resolveSubagentResultStatus,
  compactNestedResultChildren,
  attachNestedChildrenToResultChildren,
  buildSubagentResultIntercomPayload,
  deliverSubagentResultIntercomEvent,
  deliverSubagentIntercomMessageEvent,
  stripDetailsOutputsForIntercomReceipt,
  formatSubagentResultReceipt,
  isScheduledRunAction,
  listScheduledRunSummaries,
  createScheduledRunManager,
  workflowReceiptPath,
  buildWorkflowReceipt,
  writeWorkflowReceipt,
  readWorkflowReceipt,
  resolveWorkflowReceiptResumeEntry,
  deriveChildSessionName,
  editableAgentConfig,
  preservedAgentFrontmatterFields,
  handleManagementAction,
  SUBAGENT_GUIDE_TOPICS,
  readSubagentGuide,
  observeProviderDiagnostics,
  clearProviderRetry,
  snapshotProviderDiagnostics,
  sameProviderDiagnostics,
  parseWatchdogThinkingInput,
  resolveWatchdogModelInput,
  recommendStrongWatchdogModel,
  recommendWatchdogModel,
  formatWatchdogRecommendation,
  buildWatchdogStatus,
  registerMainWatchdog,
  isWorkflowScriptPath,
  validateWorkflowCapacityOverrides,
  normalizePublicSubagentExecution,
  COMPLETION_ACTION,
  STATUS_ACTION,
  createParentWake,
  writeWorkflowLaunchRecord,
  resumedRunStarted,
  workflowResumeClaimState,
  claimWorkflowResume,
  releaseWorkflowResumeClaim,
  recordWorkflowResumeRefusal,
  refusalSentence,
  hasWorkflowResumeRefusal,
  incrementalChildCompletionTriggersTurn,
  formatIncrementalChildCompletion,
  parseSubagentNotifyContent,
  registerSubagentNotify,
  HERDR_FOREGROUND_CONTROL_CHANGED_EVENT,
  registerHerdrStatusBridge,
  retainLiveForegroundNestedRoute,
  hasLiveSubagentWork,
  registerPiWebSessionLiveness,
  formatWaitSubscriptions,
  createWaitSubscriptionManager,
  retainsChildCommand,
  controlChildCommand,
  childCacheRetentionEnv,
  JITI_ALIAS_ENV,
  resolveHostPeerAliases,
  projectChildSessionEventForJson,
  childSessionHasQueuedMessages,
  childSessionFactory,
  childSessionFactoryModule,
  disposeChildSessions,
  WORKFLOW_RUNTIME_REPLACED_STOP_NOTICE,
  runtimeReplacedAbortReason,
  workflowStopCause,
  workflowScriptDigest,
  workflowChildFingerprint,
  appendWorkflowChildJournal,
  claimedWorkflowRunRefusal,
  findWorkflowReuseSource,
  readNamedWorkflowReuseSource,
  matchWorkflowReuse,
  workflowResumeRefusal,
  manualWorkflowResumeRefusalText,
  workflowResumeTargetId,
  prepareWorkflowResume,
  flattenSubagentToolOptions,
  listRetainedChildren,
  formatRetainedChildren
};
