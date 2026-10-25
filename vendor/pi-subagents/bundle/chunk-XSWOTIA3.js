import {
  agentDefinitionDigest
} from "./chunk-7F6RKT6W.js";
import {
  getAgentDir
} from "./chunk-CIZQXJ5Q.js";

// src/intercom/intercom-bridge.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
var NATIVE_INTERCOM_EXTENSION_DIR = "native:pi-subagents-supervisor-channel";
function defaultAgentDir() {
  return getAgentDir();
}
function defaultSubagentConfigDir(agentDir = defaultAgentDir()) {
  return path.join(agentDir, "extensions", "subagent");
}
var DEFAULT_INTERCOM_TARGET_PREFIX = "subagent-chat";
var PI_INTERCOM_SESSION_ID_ENV = "PI_INTERCOM_SESSION_ID";
var INTERCOM_BRIDGE_MARKER = "Intercom orchestration channel:";
var ORCHESTRATOR_TARGET_PLACEHOLDER = "{orchestratorTarget}";
var DEFAULT_INTERCOM_BRIDGE_TEMPLATE = `The inherited thread is reference-only. Do not continue that conversation or send questions, status updates, or completion handoffs to the supervisor in normal assistant text.

Use contact_supervisor first. It resolves the supervisor session and run metadata automatically.
- Need a decision, blocked, approval, or product/API/scope ambiguity: contact_supervisor({ reason: "need_decision", message: "<question>" })
- Need structured supervisor input rather than a freeform reply: contact_supervisor({ reason: "interview_request", message: "<what input is needed>", interview: { title: "...", questions: [] } })
- After contact_supervisor with reason "need_decision" or "interview_request", stay alive and continue only after the reply arrives. Do not finish your final response with a choose-one question.
- Do not ask for clarification when the only conflict is review-only/no-edit versus progress-writing or artifact-writing instructions. If an output path is configured but no write-capable tool is available, return the complete artifact in your final response; the runtime will persist it. Do not contact the supervisor merely because you cannot write that output path directly.
- Meaningful progress or unexpected discoveries that change the plan: contact_supervisor({ reason: "progress_update", message: "UPDATE: <summary>" })

Do not use contact_supervisor for routine completion handoffs. If no coordination is needed, return a focused task result.`;
function validateIntercomBridgeConfig({ value, label }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: `${label} must be an object.` };
  const bridge = value;
  for (const field of Object.keys(bridge)) {
    if (field !== "mode" && field !== "instructionFile" && field !== "resultDelivery") return { ok: false, error: `${label}.${field} is not supported.` };
  }
  if (bridge.mode !== void 0 && bridge.mode !== "off" && bridge.mode !== "fork-only" && bridge.mode !== "always") return { ok: false, error: `${label}.mode is invalid.` };
  if (bridge.instructionFile !== void 0 && typeof bridge.instructionFile !== "string") return { ok: false, error: `${label}.instructionFile must be a string.` };
  if (bridge.resultDelivery !== void 0 && typeof bridge.resultDelivery !== "boolean") return { ok: false, error: `${label}.resultDelivery must be a boolean.` };
  return {
    ok: true,
    value: {
      ...bridge.mode !== void 0 ? { mode: bridge.mode } : {},
      ...bridge.instructionFile !== void 0 ? { instructionFile: bridge.instructionFile } : {},
      ...bridge.resultDelivery !== void 0 ? { resultDelivery: bridge.resultDelivery } : {}
    }
  };
}
function resolveIntercomSessionTarget(sessionName, sessionId, intercomSessionId = process.env[PI_INTERCOM_SESSION_ID_ENV]) {
  const trimmedName = sessionName?.trim();
  if (trimmedName) return trimmedName;
  const fallbackSessionId = intercomSessionId?.trim() || sessionId;
  const normalizedSessionId = fallbackSessionId.startsWith("session-") ? fallbackSessionId.slice("session-".length) : fallbackSessionId;
  return `${DEFAULT_INTERCOM_TARGET_PREFIX}-${normalizedSessionId.slice(0, 18)}`;
}
function sanitizeIntercomTargetPart(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
}
function resolveSubagentIntercomTarget(runId, agent, index) {
  const stepSuffix = index !== void 0 ? `-${index + 1}` : "";
  return `subagent-${sanitizeIntercomTargetPart(agent)}-${sanitizeIntercomTargetPart(runId)}${stepSuffix}`;
}
function resolveIntercomBridgeMode(value) {
  if (value === "off" || value === "always" || value === "fork-only") return value;
  return "always";
}
function resolveIntercomBridgeConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { mode: "always", instructionFile: "", resultDelivery: false };
  }
  return {
    mode: resolveIntercomBridgeMode(value.mode),
    instructionFile: typeof value.instructionFile === "string" ? value.instructionFile : "",
    resultDelivery: value.resultDelivery === true
  };
}
function expandTilde(filePath) {
  return filePath.startsWith("~/") ? path.join(os.homedir(), filePath.slice(2)) : filePath;
}
function resolveInstructionTemplate(instructionFile, settingsDir) {
  if (!instructionFile) return DEFAULT_INTERCOM_BRIDGE_TEMPLATE;
  const expandedPath = expandTilde(instructionFile);
  const resolvedPath = path.isAbsolute(expandedPath) ? expandedPath : path.resolve(settingsDir, expandedPath);
  try {
    return fs.readFileSync(resolvedPath, "utf-8");
  } catch (error) {
    console.warn(`Failed to read intercom bridge instructionFile at '${resolvedPath}'. Using default instructions.`, error);
    return DEFAULT_INTERCOM_BRIDGE_TEMPLATE;
  }
}
function buildIntercomBridgeInstruction(orchestratorTarget, template) {
  const instruction = template.replaceAll(ORCHESTRATOR_TARGET_PLACEHOLDER, orchestratorTarget).trim();
  if (instruction.startsWith(INTERCOM_BRIDGE_MARKER)) return instruction;
  return `${INTERCOM_BRIDGE_MARKER}
${instruction}`;
}
function inactiveReason(mode, context, orchestratorTarget) {
  if (mode === "off") return "bridge mode is off";
  if (mode === "fork-only" && context !== "fork") return "bridge mode is fork-only and context is not fork";
  if (!orchestratorTarget) return "orchestrator target is not available";
  return void 0;
}
function diagnoseIntercomBridge(input) {
  const config = resolveIntercomBridgeConfig(input.config);
  const mode = config.mode;
  const orchestratorTarget = input.orchestratorTarget?.trim();
  const wantsIntercom = mode !== "off" && !(mode === "fork-only" && input.context !== "fork");
  const reason = inactiveReason(mode, input.context, orchestratorTarget);
  return {
    active: reason === void 0,
    mode,
    wantsIntercom,
    supervisorChannelAvailable: true,
    extensionDir: NATIVE_INTERCOM_EXTENSION_DIR,
    ...orchestratorTarget ? { orchestratorTarget } : {},
    ...reason ? { reason } : {}
  };
}
function resolveIntercomBridge(input) {
  const config = resolveIntercomBridgeConfig(input.override !== void 0 ? input.override : input.config);
  const mode = config.mode;
  const orchestratorTarget = input.orchestratorTarget?.trim();
  const agentDir = path.resolve(input.agentDir ?? defaultAgentDir());
  const settingsDir = path.resolve(input.settingsDir ?? defaultSubagentConfigDir(agentDir));
  const reason = inactiveReason(mode, input.context, orchestratorTarget);
  if (reason || !orchestratorTarget) {
    return {
      active: false,
      mode,
      resultDelivery: config.resultDelivery,
      extensionDir: NATIVE_INTERCOM_EXTENSION_DIR,
      instruction: buildIntercomBridgeInstruction(ORCHESTRATOR_TARGET_PLACEHOLDER, DEFAULT_INTERCOM_BRIDGE_TEMPLATE),
      interpolatesOrchestratorTarget: false
    };
  }
  const template = resolveInstructionTemplate(config.instructionFile, settingsDir);
  return {
    active: true,
    mode,
    resultDelivery: config.resultDelivery,
    orchestratorTarget,
    extensionDir: NATIVE_INTERCOM_EXTENSION_DIR,
    instruction: buildIntercomBridgeInstruction(orchestratorTarget, template),
    interpolatesOrchestratorTarget: template.includes(ORCHESTRATOR_TARGET_PLACEHOLDER)
  };
}
function applyIntercomBridgeToAgent(agent, bridge) {
  if (!bridge.active || !bridge.orchestratorTarget) return agent;
  const bridgeTools = ["contact_supervisor"];
  const tools = agent.tools && agent.tools.length > 0 ? [...agent.tools, ...bridgeTools.filter((tool) => !agent.tools?.includes(tool))] : agent.tools;
  const instruction = bridge.instruction;
  const trimmedPrompt = agent.systemPrompt?.trim() || "";
  const systemPrompt = trimmedPrompt.includes(INTERCOM_BRIDGE_MARKER) ? trimmedPrompt : trimmedPrompt ? `${trimmedPrompt}

${instruction}` : instruction;
  if (tools === agent.tools && systemPrompt === agent.systemPrompt) return agent;
  return {
    ...agent,
    definitionDigest: agentDefinitionDigest(agent),
    tools,
    systemPrompt
  };
}

export {
  INTERCOM_BRIDGE_MARKER,
  validateIntercomBridgeConfig,
  resolveIntercomSessionTarget,
  resolveSubagentIntercomTarget,
  diagnoseIntercomBridge,
  resolveIntercomBridge,
  applyIntercomBridgeToAgent
};
