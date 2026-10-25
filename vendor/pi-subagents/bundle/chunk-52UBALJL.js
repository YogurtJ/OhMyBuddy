import {
  formatShellCommand
} from "./chunk-7J4ZXMY7.js";
import {
  getProjectSubagentsDir
} from "./chunk-5TYMSZX3.js";
import {
  getPiSpawnCommand,
  writeAtomicJson
} from "./chunk-CIZQXJ5Q.js";

// src/inspectors/herdr/project-panes.ts
import * as fs from "node:fs";
import * as path from "node:path";

// src/inspectors/herdr/client.ts
import { spawn } from "node:child_process";
function error(code, message, details) {
  return { ok: false, error: { code, message, ...details !== void 0 ? { details } : {} } };
}
function parseLastJson(value) {
  const trimmed = value.trim();
  if (!trimmed) return void 0;
  try {
    return JSON.parse(trimmed);
  } catch {
  }
  for (const line of trimmed.split(/\r?\n/).reverse()) {
    try {
      return JSON.parse(line);
    } catch {
    }
  }
  return void 0;
}
function normalizeCode(raw) {
  const code = String(raw ?? "").toLowerCase();
  if (code.includes("timeout") || code.includes("timed_out")) return "TIMEOUT";
  if (code.includes("gone")) return "PANE_GONE";
  if (code.includes("not_found") || code.includes("not-found") || code === "no_such_pane") return "NOT_FOUND";
  return "VALIDATION_ERROR";
}
function createHerdrClient(options = {}) {
  const bin = options.bin ?? process.env.HERDR_BIN ?? "herdr";
  const spawnImpl = options.spawn ?? spawn;
  return {
    run(args, runOptions = {}) {
      return new Promise((resolve2) => {
        let child;
        try {
          child = spawnImpl(bin, args, { shell: false, windowsHide: true, env: process.env });
        } catch (cause) {
          const code = cause?.code;
          resolve2(error("HERDR_UNAVAILABLE", code === "ENOENT" ? "Herdr is not installed or is not on PATH. Install Herdr 0.7.5+ or set HERDR_BIN." : `Failed to start Herdr: ${cause instanceof Error ? cause.message : String(cause)}`));
          return;
        }
        let stdout = "";
        let stderr = "";
        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          runOptions.signal?.removeEventListener("abort", abort);
          resolve2(result);
        };
        const abort = () => {
          try {
            child.kill();
          } catch {
          }
          finish(error("TIMEOUT", `Herdr command '${args.join(" ")}' was aborted.`));
        };
        const timer = setTimeout(() => {
          try {
            child.kill();
          } catch {
          }
          finish(error("TIMEOUT", `Herdr command '${args.join(" ")}' timed out after ${runOptions.timeoutMs ?? 15e3}ms.`));
        }, runOptions.timeoutMs ?? 15e3);
        timer.unref?.();
        if (runOptions.signal?.aborted) abort();
        else runOptions.signal?.addEventListener("abort", abort, { once: true });
        child.stdout?.on("data", (chunk) => {
          stdout += chunk.toString();
        });
        child.stderr?.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        child.on("error", (cause) => {
          const code = cause.code;
          finish(error("HERDR_UNAVAILABLE", code === "ENOENT" ? "Herdr is not installed or is not on PATH. Install Herdr 0.7.5+ or set HERDR_BIN." : `Failed to run Herdr: ${cause.message}`));
        });
        child.on("close", (exitCode) => {
          const parsed = parseLastJson(stdout) ?? (exitCode === 0 ? void 0 : parseLastJson(stderr));
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "error" in parsed) {
            const raw = parsed.error;
            finish(error(normalizeCode(raw?.code), String(raw?.message ?? "Herdr command failed."), raw));
            return;
          }
          if (exitCode === 0) {
            if (parsed !== void 0) {
              const envelope = parsed;
              finish({ ok: true, data: envelope.result ?? parsed });
            } else if (runOptions.textOk) finish({ ok: true, data: stdout.trim() });
            else finish({ ok: true, data: {} });
            return;
          }
          const message = stderr.split(/\r?\n/).find((line) => line.trim())?.trim() ?? `Herdr exited with code ${exitCode}.`;
          finish(error("VALIDATION_ERROR", message, { exitCode }));
        });
      });
    }
  };
}
function parseHerdrVersion(value) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(value);
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : void 0;
}
function supportsRawPanes(version) {
  return version.major > 0 || version.minor > 7 || version.minor === 7 && version.patch >= 5;
}
async function detectHerdr(client, signal) {
  const result = await client.run(["--version"], { timeoutMs: 3e3, signal, textOk: true });
  if (result.ok === false) return result;
  const versionText = typeof result.data === "string" ? result.data : JSON.stringify(result.data);
  const version = parseHerdrVersion(versionText);
  if (!version) return error("VALIDATION_ERROR", `Could not parse the Herdr version from '${versionText}'.`);
  if (!supportsRawPanes(version)) return error("HERDR_UNSUPPORTED_VERSION", `Herdr ${versionText} does not support raw inspector panes. Upgrade to Herdr 0.7.5 or newer.`);
  return { ok: true, data: { version, versionText } };
}

// src/inspectors/herdr/focus.ts
function herdrPaneRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const record = value;
  return record.pane && typeof record.pane === "object" && !Array.isArray(record.pane) ? record.pane : record;
}
function text(record, ...keys) {
  for (const key of keys) if (typeof record[key] === "string" && record[key]) return record[key];
  return void 0;
}
function herdrPaneFocusTarget(value) {
  const pane = herdrPaneRecord(value);
  if (!pane) return {};
  return {
    paneId: text(pane, "pane_id", "paneId", "id"),
    tabId: text(pane, "tab_id", "tabId"),
    workspaceId: text(pane, "workspace_id", "workspaceId")
  };
}
async function focusHerdrPane(client, paneId, signal) {
  const live = await client.run(["pane", "get", paneId], { timeoutMs: 5e3, signal });
  if (live.ok === false) return live;
  const target = herdrPaneFocusTarget(live.data);
  if (!target.paneId) {
    return { ok: false, error: { code: "INVALID_PANE_RESPONSE", message: `Herdr pane get returned no pane id for '${paneId}'.`, details: live.data } };
  }
  if (target.tabId) {
    const focused = await client.run(["tab", "focus", target.tabId], { timeoutMs: 5e3, signal });
    return focused.ok ? { ok: true, data: { paneId: target.paneId, tabId: target.tabId, ...target.workspaceId ? { workspaceId: target.workspaceId } : {} } } : focused;
  }
  if (target.workspaceId) {
    const focused = await client.run(["workspace", "focus", target.workspaceId], { timeoutMs: 5e3, signal });
    return focused.ok ? { ok: true, data: { paneId: target.paneId, workspaceId: target.workspaceId } } : focused;
  }
  return {
    ok: false,
    error: {
      code: "PANE_FOCUS_UNSUPPORTED",
      message: `Herdr pane '${paneId}' has no tab_id or workspace_id. Select it in Herdr manually, or upgrade Herdr focus support.`,
      details: live.data
    }
  };
}

// src/inspectors/herdr/project-panes.ts
var HERDR_PROJECT_PANE_ACTIONS = ["project.open", "project.status", "project.close"];
var PROJECT_PANES_API_VERSION = 1;
var PROJECT_PANE_TRUST_STATUS = "human-verification-required";
function toolResult(text2, isError = false) {
  return { content: [{ type: "text", text: text2 }], ...isError ? { isError: true } : {}, details: { mode: "management", results: [] } };
}
function projectPaneError(code, message, fields = {}) {
  return { ok: false, error: { code, message, ...fields } };
}
function formatProjectPaneError(input) {
  return `Herdr project pane error (${input.code}): ${input.message}`;
}
function projectPaneDir(projectRoot) {
  return path.join(getProjectSubagentsDir(projectRoot), "project-panes");
}
function projectPaneBindingPath(projectRoot) {
  return path.join(projectPaneDir(projectRoot), "herdr.json");
}
function projectPaneRootIndexPath(ownerRoot) {
  return path.join(projectPaneDir(ownerRoot), "herdr-roots.json");
}
function parseRootIndex(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Herdr project pane root index.");
  const input = value;
  if (input.schemaVersion !== 1 || input.kind !== "herdr-project-pane-roots" || !Array.isArray(input.projectRoots)) throw new Error("Invalid Herdr project pane root index.");
  if (!input.projectRoots.every((root) => typeof root === "string" && root.length > 0)) throw new Error("Invalid Herdr project pane root index.");
  return input.projectRoots;
}
function listHerdrProjectPaneRoots(ownerRoot) {
  try {
    return parseRootIndex(JSON.parse(fs.readFileSync(projectPaneRootIndexPath(ownerRoot), "utf-8")));
  } catch (error2) {
    const code = error2.code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw error2;
  }
}
function writeHerdrProjectPaneRoot(ownerRoot, projectRoot) {
  const projectRoots = [.../* @__PURE__ */ new Set([...listHerdrProjectPaneRoots(ownerRoot), projectRoot])].sort();
  writeAtomicJson(projectPaneRootIndexPath(ownerRoot), {
    schemaVersion: 1,
    kind: "herdr-project-pane-roots",
    projectRoots
  });
}
function removeHerdrProjectPaneRoot(ownerRoot, projectRoot) {
  const projectRoots = listHerdrProjectPaneRoots(ownerRoot).filter((root) => root !== projectRoot);
  const file = projectPaneRootIndexPath(ownerRoot);
  if (projectRoots.length === 0) {
    fs.rmSync(file, { force: true });
    return;
  }
  writeAtomicJson(file, {
    schemaVersion: 1,
    kind: "herdr-project-pane-roots",
    projectRoots
  });
}
function parseBinding(value, strict = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const input = value;
  if (input.schemaVersion !== 1 || input.kind !== "herdr-project-pane") return void 0;
  if (typeof input.projectRoot !== "string" || typeof input.paneId !== "string" || typeof input.openedAt !== "string" || typeof input.command !== "string") return void 0;
  if (strict) {
    if (![input.projectRoot, input.paneId, input.openedAt, input.command].every((field) => field.trim().length > 0)) return void 0;
    for (const field of ["lastFocusedAt", "herdrVersion", "startupMessage"]) {
      if (input[field] !== void 0 && typeof input[field] !== "string") return void 0;
    }
  }
  return input;
}
function readBinding(projectRoot, strict) {
  const file = projectPaneBindingPath(projectRoot);
  let raw;
  try {
    raw = fs.readFileSync(file, "utf-8");
  } catch (cause) {
    const code = cause.code;
    if (code === "ENOENT" || code === "ENOTDIR") return { state: "absent" };
    return { state: "read-error", cause };
  }
  try {
    const binding = parseBinding(JSON.parse(raw), strict);
    return binding ? { state: "valid", binding } : { state: "invalid" };
  } catch {
    return { state: "invalid" };
  }
}
function readHerdrProjectPaneBinding(projectRoot) {
  const read = readBinding(projectRoot, false);
  return read.state === "valid" ? read.binding : void 0;
}
function readProjectPaneBinding(projectRoot) {
  const read = readBinding(projectRoot, true);
  if (read.state === "absent") return { ok: true, data: void 0 };
  if (read.state === "read-error") {
    const bindingPath = projectPaneBindingPath(projectRoot);
    return projectPaneError("BINDING_READ_FAILED", `Failed to read project pane binding '${bindingPath}': ${read.cause instanceof Error ? read.cause.message : String(read.cause)}`, {
      projectRoot,
      bindingPath,
      details: fileSystemErrorDetails(read.cause)
    });
  }
  if (read.state === "invalid") {
    return projectPaneError("INVALID_BINDING", `Project pane binding '${projectPaneBindingPath(projectRoot)}' is malformed.`, {
      projectRoot,
      bindingPath: projectPaneBindingPath(projectRoot)
    });
  }
  return { ok: true, data: read.binding };
}
function herdrProjectPaneSnapshotFromBinding(binding, now = Date.now()) {
  return {
    projectRoot: binding.projectRoot,
    bindingPath: projectPaneBindingPath(binding.projectRoot),
    paneId: binding.paneId,
    openedAt: binding.openedAt,
    ...binding.lastFocusedAt ? { lastFocusedAt: binding.lastFocusedAt } : {},
    state: "open",
    agentStatus: "unknown",
    ownership: "unknown",
    safeToClose: false,
    refreshedAt: now
  };
}
function restoreHerdrProjectPaneSnapshots(state, projectRoots, now = Date.now()) {
  const restored = new Map(state.herdrProjectPanes ?? []);
  for (const projectRoot of projectRoots) {
    const binding = readHerdrProjectPaneBinding(projectRoot);
    if (binding) restored.set(binding.projectRoot, herdrProjectPaneSnapshotFromBinding(binding, now));
  }
  state.herdrProjectPanes = restored;
}
function sanitizedSummary(value) {
  if (typeof value !== "string") return void 0;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 120) : void 0;
}
function nestedRecord(value, key) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const child = value[key];
  return child && typeof child === "object" && !Array.isArray(child) ? child : void 0;
}
function paneSummary(pane) {
  return sanitizedSummary(pane.summary) ?? sanitizedSummary(pane.state_text) ?? sanitizedSummary(pane.stateText) ?? sanitizedSummary(pane.token_summary) ?? sanitizedSummary(nestedRecord(pane, "tokens")?.summary) ?? sanitizedSummary(nestedRecord(pane, "metadata")?.summary) ?? sanitizedSummary(nestedRecord(nestedRecord(pane, "metadata"), "tokens")?.summary);
}
function projectPaneRuntime(value) {
  const pane = herdrPaneRecord(value);
  const focusTarget = herdrPaneFocusTarget(value);
  const paneId = focusTarget.paneId;
  if (!pane || !paneId) return void 0;
  const text2 = (key) => typeof pane[key] === "string" ? pane[key] : void 0;
  const agentStatus = text2("agent_status") ?? text2("agentStatus") ?? "unknown";
  const summary = paneSummary(pane);
  return {
    paneId,
    ...text2("agent") ? { agent: text2("agent") } : {},
    agentStatus: agentStatus.toLowerCase(),
    ...text2("cwd") ? { cwd: text2("cwd") } : {},
    ...text2("foreground_cwd") || text2("foregroundCwd") ? { foregroundCwd: text2("foreground_cwd") ?? text2("foregroundCwd") } : {},
    ...typeof pane.focused === "boolean" ? { focused: pane.focused } : {},
    ...focusTarget.tabId ? { tabId: focusTarget.tabId } : {},
    ...focusTarget.workspaceId ? { workspaceId: focusTarget.workspaceId } : {},
    ...summary ? { summary } : {},
    ...text2("terminal_title_stripped") || text2("terminal_title") || text2("terminalTitle") ? { terminalTitle: text2("terminal_title_stripped") ?? text2("terminal_title") ?? text2("terminalTitle") } : {}
  };
}
function herdrProjectPaneSnapshotFromStatus(data, now) {
  if (data.state === "absent" || !data.binding) return void 0;
  return {
    projectRoot: data.projectRoot,
    bindingPath: data.bindingPath,
    paneId: data.binding.paneId,
    openedAt: data.binding.openedAt,
    ...data.binding.lastFocusedAt ? { lastFocusedAt: data.binding.lastFocusedAt } : {},
    state: data.state,
    agentStatus: data.runtime?.agentStatus ?? "unknown",
    ownership: data.ownership,
    safeToClose: data.safeToClose,
    refreshedAt: now,
    ...data.runtime?.summary ? { summary: data.runtime.summary } : {},
    ...data.runtime?.tabId ? { tabId: data.runtime.tabId } : {},
    ...data.runtime?.workspaceId ? { workspaceId: data.runtime.workspaceId } : {},
    ...data.runtime?.terminalTitle ? { terminalTitle: data.runtime.terminalTitle } : {},
    ...data.staleReason ? { staleReason: data.staleReason.message } : {}
  };
}
function rememberProjectPane(state, data, now) {
  if (!state) return;
  state.herdrProjectPanes ??= /* @__PURE__ */ new Map();
  const snapshot = herdrProjectPaneSnapshotFromStatus(data, now);
  if (snapshot) state.herdrProjectPanes.set(data.projectRoot, snapshot);
  else state.herdrProjectPanes.delete(data.projectRoot);
}
function forgetProjectPane(state, projectRoot) {
  state?.herdrProjectPanes?.delete(projectRoot);
}
function resolveProjectRoot(requested) {
  const resolved = path.resolve(requested);
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return projectPaneError("INVALID_PROJECT_ROOT", `Project pane target '${resolved}' is not a directory.`, { projectRoot: resolved });
    return { ok: true, data: fs.realpathSync(resolved) };
  } catch (cause) {
    return projectPaneError("INVALID_PROJECT_ROOT", `Project pane target '${resolved}' is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`, { projectRoot: resolved });
  }
}
async function inspectPane(client, paneId, signal) {
  const live = await client.run(["pane", "get", paneId], { timeoutMs: 5e3, signal });
  if (live.ok === false) return projectPaneError(live.error.code, live.error.message, { details: live.error.details });
  const runtime = projectPaneRuntime(live.data);
  if (!runtime) return projectPaneError("INVALID_PANE_RESPONSE", `Herdr pane get returned no pane runtime for '${paneId}'.`, { details: live.data });
  return { ok: true, data: runtime };
}
function projectPaneCommand(message) {
  const args = message?.trim() ? [message.trim()] : [];
  const command = getPiSpawnCommand(args);
  return formatShellCommand(command.command, command.args);
}
function canonicalRuntimePath(value) {
  if (!value) return void 0;
  try {
    return fs.realpathSync(path.resolve(value));
  } catch {
    return path.resolve(value);
  }
}
function projectPaneOwnership(runtime, binding, projectRoot) {
  if (runtime.paneId !== binding.paneId) return "mismatch";
  const runtimeRoot = canonicalRuntimePath(runtime.cwd);
  if (!runtimeRoot) return "unknown";
  return runtimeRoot === projectRoot ? "verified" : "mismatch";
}
function bindingForManager(projectRoot, legacyToolCompatibility) {
  const read = readBinding(projectRoot, !legacyToolCompatibility);
  if (read.state === "absent") return { ok: true, data: void 0 };
  if (read.state === "read-error") {
    if (legacyToolCompatibility) return { ok: true, data: void 0 };
    const bindingPath = projectPaneBindingPath(projectRoot);
    return projectPaneError("BINDING_READ_FAILED", `Failed to read project pane binding '${bindingPath}': ${read.cause instanceof Error ? read.cause.message : String(read.cause)}`, {
      projectRoot,
      bindingPath,
      details: fileSystemErrorDetails(read.cause)
    });
  }
  if (read.state === "invalid") {
    if (legacyToolCompatibility) return { ok: true, data: void 0 };
    return projectPaneError("INVALID_BINDING", `Project pane binding '${projectPaneBindingPath(projectRoot)}' is malformed.`, {
      projectRoot,
      bindingPath: projectPaneBindingPath(projectRoot)
    });
  }
  const binding = read.binding;
  if (!legacyToolCompatibility && canonicalRuntimePath(binding.projectRoot) !== projectRoot) {
    return projectPaneError("INVALID_BINDING", `Project pane binding root '${binding.projectRoot}' does not match '${projectRoot}'.`, {
      projectRoot,
      bindingPath: projectPaneBindingPath(projectRoot),
      details: binding
    });
  }
  return { ok: true, data: binding };
}
function common(projectRoot) {
  return {
    apiVersion: PROJECT_PANES_API_VERSION,
    projectRoot,
    bindingPath: projectPaneBindingPath(projectRoot),
    trust: PROJECT_PANE_TRUST_STATUS
  };
}
function fileSystemErrorDetails(cause) {
  if (!(cause instanceof Error)) return cause;
  const code = cause.code;
  return { name: cause.name, message: cause.message, ...code ? { code } : {} };
}
function removeProjectPaneBinding(projectRoot) {
  const bindingPath = projectPaneBindingPath(projectRoot);
  try {
    fs.rmSync(bindingPath, { force: true });
    return { ok: true, data: void 0 };
  } catch (cause) {
    return projectPaneError("BINDING_REMOVE_FAILED", `Failed to remove project pane binding '${bindingPath}': ${cause instanceof Error ? cause.message : String(cause)}`, {
      projectRoot,
      bindingPath,
      details: fileSystemErrorDetails(cause)
    });
  }
}
function createProjectPaneManagerInternal(options = {}) {
  const client = options.client ?? createHerdrClient();
  return {
    async status(input) {
      const root = resolveProjectRoot(input.cwd);
      if (!root.ok) return root;
      const projectRoot = root.data;
      const bindingResult = bindingForManager(projectRoot, options.legacyToolCompatibility);
      if (!bindingResult.ok) return bindingResult;
      const existing = bindingResult.data;
      if (!existing) return { ok: true, data: { ...common(projectRoot), state: "absent", ownership: "unknown", safeToClose: true } };
      const live = await inspectPane(client, existing.paneId, input.signal);
      if (!live.ok) {
        if (live.error.code === "INVALID_PANE_RESPONSE" && options.legacyToolCompatibility) {
          const runtime = { paneId: existing.paneId, agentStatus: "unknown" };
          return { ok: true, data: { ...common(projectRoot), state: "open", binding: existing, runtime, ownership: "unknown", safeToClose: false } };
        }
        if (live.error.code === "NOT_FOUND" || live.error.code === "PANE_GONE") {
          return { ok: true, data: {
            ...common(projectRoot),
            state: "stale",
            binding: existing,
            ownership: "unknown",
            safeToClose: false,
            staleReason: { code: live.error.code, message: live.error.message }
          } };
        }
        return { ok: false, error: { ...live.error, projectRoot, bindingPath: projectPaneBindingPath(projectRoot) } };
      }
      const ownership = projectPaneOwnership(live.data, existing, projectRoot);
      return { ok: true, data: {
        ...common(projectRoot),
        state: "open",
        binding: existing,
        runtime: live.data,
        ownership,
        safeToClose: live.data.agentStatus === "idle" && ownership === "verified"
      } };
    },
    async focus(input) {
      const status = await this.status(input);
      if (!status.ok) return projectPaneError(status.error.code, status.error.message, status.error);
      if (status.data.state !== "open" || !status.data.binding || !status.data.runtime) {
        return projectPaneError("PANE_GONE", `No open Herdr project pane binding exists for '${status.data.projectRoot}'.`, {
          projectRoot: status.data.projectRoot,
          bindingPath: status.data.bindingPath
        });
      }
      if (status.data.ownership !== "verified") {
        return projectPaneError("PANE_OWNERSHIP_UNVERIFIED", `Project pane '${status.data.binding.paneId}' ownership is '${status.data.ownership}' for '${status.data.projectRoot}'.`, {
          projectRoot: status.data.projectRoot,
          bindingPath: status.data.bindingPath,
          details: status.data.runtime
        });
      }
      const focused = await focusHerdrPane(client, status.data.binding.paneId, input.signal);
      if (!focused.ok) return projectPaneError(focused.error.code, focused.error.message, {
        projectRoot: status.data.projectRoot,
        bindingPath: status.data.bindingPath,
        details: focused.error.details
      });
      const now = (options.now?.() ?? /* @__PURE__ */ new Date()).toISOString();
      const binding = { ...status.data.binding, lastFocusedAt: now };
      try {
        writeAtomicJson(status.data.bindingPath, binding);
      } catch (cause) {
        return projectPaneError("BINDING_WRITE_FAILED", `Failed to update project pane binding '${status.data.bindingPath}': ${cause instanceof Error ? cause.message : String(cause)}`, {
          projectRoot: status.data.projectRoot,
          bindingPath: status.data.bindingPath,
          details: fileSystemErrorDetails(cause)
        });
      }
      return { ok: true, data: {
        ...common(status.data.projectRoot),
        binding,
        runtime: status.data.runtime,
        ownership: status.data.ownership,
        focused: focused.data
      } };
    },
    async open(input) {
      const root = resolveProjectRoot(input.cwd);
      if (!root.ok) return root;
      const projectRoot = root.data;
      const detected = await detectHerdr(client, input.signal);
      if (!detected.ok) return projectPaneError(detected.error.code, detected.error.message, { projectRoot, details: detected.error.details });
      const bindingResult = bindingForManager(projectRoot, options.legacyToolCompatibility);
      if (!bindingResult.ok) return bindingResult;
      const existing = bindingResult.data;
      if (existing) {
        const live = await inspectPane(client, existing.paneId, input.signal);
        if (live.ok) {
          const ownership = projectPaneOwnership(live.data, existing, projectRoot);
          if (!options.legacyToolCompatibility && ownership !== "verified") {
            return projectPaneError("PANE_OWNERSHIP_UNVERIFIED", `Project pane '${existing.paneId}' ownership is '${ownership}' for '${projectRoot}'.`, {
              projectRoot,
              bindingPath: projectPaneBindingPath(projectRoot),
              details: live.data
            });
          }
          return { ok: true, data: { ...common(projectRoot), disposition: "already-open", binding: existing, runtime: live.data } };
        }
        if (live.error.code === "INVALID_PANE_RESPONSE" && options.legacyToolCompatibility) {
          return { ok: true, data: {
            ...common(projectRoot),
            disposition: "already-open",
            binding: existing,
            runtime: { paneId: existing.paneId, agentStatus: "unknown" }
          } };
        }
        const stale = live.error.code === "NOT_FOUND" || live.error.code === "PANE_GONE";
        if (!stale && !options.legacyToolCompatibility) {
          return { ok: false, error: { ...live.error, projectRoot, bindingPath: projectPaneBindingPath(projectRoot) } };
        }
      }
      const splitArgs = ["pane", "split", "--current", "--direction", "right", "--cwd", projectRoot];
      splitArgs.push(input.focus === true ? "--focus" : "--no-focus");
      const split = await client.run(splitArgs, { timeoutMs: 15e3, signal: input.signal });
      if (!split.ok) return projectPaneError(split.error.code, split.error.message, { projectRoot, details: split.error.details });
      const paneId = herdrPaneFocusTarget(split.data).paneId;
      if (!paneId) return projectPaneError(options.legacyToolCompatibility ? "PANE_GONE" : "INVALID_PANE_RESPONSE", "Herdr pane split returned no pane id.", { projectRoot, details: split.data });
      const startupMessage = input.message?.trim();
      const command = projectPaneCommand(startupMessage);
      const started = await client.run(["pane", "run", paneId, command], { timeoutMs: 15e3, signal: input.signal });
      if (!started.ok) {
        await client.run(["pane", "close", paneId], { timeoutMs: 5e3 });
        return projectPaneError(started.error.code, started.error.message, { projectRoot, details: started.error.details });
      }
      const now = (options.now?.() ?? /* @__PURE__ */ new Date()).toISOString();
      const binding = {
        schemaVersion: 1,
        kind: "herdr-project-pane",
        projectRoot,
        paneId,
        openedAt: now,
        ...input.focus === true ? { lastFocusedAt: now } : {},
        herdrVersion: detected.data.versionText,
        command,
        ...startupMessage ? { startupMessage } : {}
      };
      const bindingPath = projectPaneBindingPath(projectRoot);
      try {
        writeAtomicJson(bindingPath, binding);
      } catch (cause) {
        let cleanup;
        try {
          const closed = await client.run(["pane", "close", paneId], { timeoutMs: 5e3 });
          cleanup = closed.ok ? { paneClosed: true } : { paneClosed: false, error: closed.error };
        } catch (cleanupCause) {
          cleanup = { paneClosed: false, error: fileSystemErrorDetails(cleanupCause) };
        }
        const cleanupMessage = cleanup.paneClosed ? ` The newly opened pane '${paneId}' was closed.` : ` Cleanup could not close the newly opened pane '${paneId}'.`;
        return projectPaneError("BINDING_WRITE_FAILED", `Failed to persist project pane binding '${bindingPath}': ${cause instanceof Error ? cause.message : String(cause)}.${cleanupMessage}`, {
          projectRoot,
          bindingPath,
          details: { cause: fileSystemErrorDetails(cause), cleanup }
        });
      }
      return { ok: true, data: { ...common(projectRoot), disposition: "opened", binding } };
    },
    async close(input) {
      const root = resolveProjectRoot(input.cwd);
      if (!root.ok) return root;
      const projectRoot = root.data;
      const bindingResult = bindingForManager(projectRoot, options.legacyToolCompatibility);
      if (!bindingResult.ok) return bindingResult;
      const existing = bindingResult.data;
      if (!existing) return { ok: true, data: { ...common(projectRoot), disposition: "absent" } };
      const live = await inspectPane(client, existing.paneId, input.signal);
      if (!live.ok) {
        if (live.error.code === "NOT_FOUND" || live.error.code === "PANE_GONE") {
          const removed2 = removeProjectPaneBinding(projectRoot);
          if (!removed2.ok) return removed2;
          return { ok: true, data: { ...common(projectRoot), disposition: "stale-binding-removed", binding: existing } };
        }
        return { ok: false, error: { ...live.error, projectRoot, bindingPath: projectPaneBindingPath(projectRoot) } };
      }
      const runtime = live.data;
      const ownership = projectPaneOwnership(runtime, existing, projectRoot);
      if (ownership !== "verified") {
        return projectPaneError("PANE_OWNERSHIP_UNVERIFIED", `Project pane '${existing.paneId}' ownership is '${ownership}' for '${projectRoot}'.`, {
          projectRoot,
          bindingPath: projectPaneBindingPath(projectRoot),
          details: runtime
        });
      }
      if (runtime.agentStatus !== "idle") {
        return projectPaneError("PANE_NOT_IDLE", `Project pane '${existing.paneId}' is '${runtime.agentStatus}', not explicitly idle.`, {
          projectRoot,
          bindingPath: projectPaneBindingPath(projectRoot),
          details: runtime
        });
      }
      const closed = await client.run(["pane", "close", existing.paneId], { timeoutMs: 1e4, signal: input.signal });
      if (!closed.ok && closed.error.code !== "NOT_FOUND" && closed.error.code !== "PANE_GONE") {
        return projectPaneError(closed.error.code, closed.error.message, { projectRoot, bindingPath: projectPaneBindingPath(projectRoot), details: closed.error.details });
      }
      const disposition = closed.ok ? "closed" : "stale-binding-removed";
      const removed = removeProjectPaneBinding(projectRoot);
      if (!removed.ok) return removed;
      return { ok: true, data: { ...common(projectRoot), disposition, binding: existing, ...runtime ? { runtime } : {} } };
    }
  };
}
function createProjectPaneManager(options = {}) {
  return createProjectPaneManagerInternal(options);
}
async function openProjectPane(options) {
  return createProjectPaneManager().open(options);
}
async function getProjectPaneStatus(options) {
  return createProjectPaneManager().status(options);
}
async function closeProjectPane(options) {
  return createProjectPaneManager().close(options);
}
async function focusProjectPane(options) {
  return createProjectPaneManager().focus(options);
}
async function handleHerdrProjectPaneAction(action, params, deps) {
  const requested = params.cwd?.trim() || deps.cwd;
  const ownerRoot = path.resolve(deps.cwd);
  const manager = createProjectPaneManagerInternal({ client: deps.client, now: deps.now, legacyToolCompatibility: true });
  const remember = (data) => rememberProjectPane(deps.state, data, deps.now?.().getTime() ?? Date.now());
  if (action === "project.status") {
    const status2 = await manager.status({ cwd: requested, signal: deps.signal });
    if (!status2.ok) return toolResult(formatProjectPaneError(status2.error), true);
    remember(status2.data);
    if (status2.data.state === "absent") return toolResult(`No Herdr project pane binding exists for ${status2.data.projectRoot}.`);
    if (status2.data.state === "stale") {
      const reason = status2.data.staleReason;
      return toolResult(`${formatProjectPaneError(reason)}
Binding: ${status2.data.bindingPath}`, true);
    }
    return toolResult(`Herdr project pane ${status2.data.binding.paneId} is open for ${status2.data.projectRoot}.
Binding: ${status2.data.bindingPath}`);
  }
  if (action === "project.close") {
    const closed = await manager.close({ cwd: requested, requireIdle: true, signal: deps.signal });
    if (!closed.ok) return toolResult(formatProjectPaneError(closed.error), true);
    forgetProjectPane(deps.state, closed.data.projectRoot);
    try {
      removeHerdrProjectPaneRoot(ownerRoot, closed.data.projectRoot);
    } catch (error2) {
      return toolResult(`Herdr project pane error (BINDING_REMOVE_FAILED): Failed to remove project pane root index '${projectPaneRootIndexPath(ownerRoot)}': ${error2 instanceof Error ? error2.message : String(error2)}`, true);
    }
    if (closed.data.disposition === "absent") return toolResult(`No Herdr project pane binding exists for ${closed.data.projectRoot}.`);
    return toolResult(`Closed Herdr project pane ${closed.data.binding.paneId} for ${closed.data.projectRoot}.`);
  }
  const opened = await manager.open({ cwd: requested, message: params.message, focus: params.focus, signal: deps.signal });
  if (!opened.ok) return toolResult(formatProjectPaneError(opened.error), true);
  try {
    writeHerdrProjectPaneRoot(ownerRoot, opened.data.projectRoot);
  } catch (error2) {
    return toolResult(`Herdr project pane error (BINDING_WRITE_FAILED): Failed to persist project pane root index '${projectPaneRootIndexPath(ownerRoot)}': ${error2 instanceof Error ? error2.message : String(error2)}`, true);
  }
  const status = await manager.status({ cwd: opened.data.projectRoot, signal: deps.signal });
  if (status.ok) remember(status.data);
  if (opened.data.disposition === "already-open") {
    if (params.focus) {
      const focused = await manager.focus({ cwd: opened.data.projectRoot, signal: deps.signal });
      if (!focused.ok) return toolResult(`Herdr project pane ${opened.data.binding.paneId} is already open for ${opened.data.projectRoot}. ${formatProjectPaneError(focused.error)}`, true);
      const focusedStatus = await manager.status({ cwd: opened.data.projectRoot, signal: deps.signal });
      if (focusedStatus.ok) remember(focusedStatus.data);
      return toolResult(`Herdr project pane ${opened.data.binding.paneId} is already open for ${opened.data.projectRoot}. Focused ${focused.data.focused.tabId ? `tab ${focused.data.focused.tabId}` : `workspace ${focused.data.focused.workspaceId}`}.`);
    }
    return toolResult(`Herdr project pane ${opened.data.binding.paneId} is already open for ${opened.data.projectRoot}.`);
  }
  return toolResult(`Opened Herdr project pane ${opened.data.binding.paneId} for ${opened.data.projectRoot}. The pane runs its own Pi session; subagents launched there belong to that project.`);
}

export {
  createHerdrClient,
  detectHerdr,
  HERDR_PROJECT_PANE_ACTIONS,
  PROJECT_PANES_API_VERSION,
  PROJECT_PANE_TRUST_STATUS,
  projectPaneBindingPath,
  listHerdrProjectPaneRoots,
  readProjectPaneBinding,
  restoreHerdrProjectPaneSnapshots,
  createProjectPaneManager,
  openProjectPane,
  getProjectPaneStatus,
  closeProjectPane,
  focusProjectPane,
  handleHerdrProjectPaneAction
};
