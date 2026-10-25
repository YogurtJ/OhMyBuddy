// src/shared/launch-contract.ts
import { createHash } from "node:crypto";
import * as fs from "node:fs";
var AGENT_DEFINITION_PROJECTION_VERSION = 2;
var LAUNCH_BINDING_PROJECTION_VERSION = 2;
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, entry]) => entry !== void 0).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function stableJsonDigest(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
function fileDigest(filePath) {
  try {
    return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  } catch {
    return void 0;
  }
}
function projectAgentDefinition(agent) {
  return {
    version: AGENT_DEFINITION_PROJECTION_VERSION,
    name: agent.name,
    localName: agent.localName,
    packageName: agent.packageName,
    filePath: agent.filePath,
    fileContentDigest: fileDigest(agent.filePath),
    runner: agent.runner,
    systemPrompt: agent.systemPrompt,
    systemPromptMode: agent.systemPromptMode,
    inheritProjectContext: agent.inheritProjectContext,
    inheritGlobalContext: agent.inheritGlobalContext,
    inheritSkills: agent.inheritSkills,
    model: agent.model,
    modelProvider: agent.modelProvider,
    fast: agent.fast,
    thinking: agent.thinking,
    tools: agent.tools,
    excludeTools: agent.excludeTools,
    allowNestedSubagents: agent.allowNestedSubagents,
    allowedAgents: agent.allowedAgents,
    mcpDirectTools: agent.mcpDirectTools,
    extensions: agent.extensions,
    subagentOnlyExtensions: agent.subagentOnlyExtensions,
    mutationTools: agent.mutationTools,
    skills: agent.skills,
    skillPath: agent.skillPath,
    output: agent.output,
    outputSchema: agent.outputSchema,
    defaultReads: agent.defaultReads,
    defaultProgress: agent.defaultProgress,
    defaultContext: agent.defaultContext,
    defaultAsync: agent.defaultAsync,
    defaultTimeoutMs: agent.defaultTimeoutMs,
    defaultAcceptance: agent.defaultAcceptance,
    acceptanceRole: agent.acceptanceRole,
    interactive: agent.interactive,
    maxSubagentDepth: agent.maxSubagentDepth,
    toolBudget: agent.toolBudget,
    memory: agent.memory
  };
}
function agentDefinitionDigest(agent) {
  return agent.definitionDigest ?? stableJsonDigest(projectAgentDefinition(agent));
}
function projectLaunchBinding(input) {
  return {
    version: LAUNCH_BINDING_PROJECTION_VERSION,
    definitionDigest: input.definitionDigest,
    taskDigest: input.task === void 0 ? void 0 : stableJsonDigest(input.task),
    model: input.model,
    fast: input.fast,
    thinking: input.thinking,
    systemPromptDigest: input.systemPrompt === void 0 || input.systemPrompt === null ? void 0 : stableJsonDigest(input.systemPrompt),
    systemPromptMode: input.systemPromptMode,
    inheritProjectContext: input.inheritProjectContext,
    inheritGlobalContext: input.inheritGlobalContext,
    inheritSkills: input.inheritSkills,
    skills: input.skills,
    tools: input.tools,
    excludeTools: input.excludeTools,
    extensions: input.extensions,
    subagentOnlyExtensions: input.subagentOnlyExtensions,
    mcpDirectTools: input.mcpDirectTools,
    outputPath: input.outputPath,
    outputMode: input.outputMode,
    structuredOutputSchema: input.structuredOutputSchema,
    extensionBindings: input.extensionBindings
  };
}
function launchBindingDigest(input) {
  return stableJsonDigest(projectLaunchBinding(input));
}
function resolveLaunchBinding(source) {
  const identity = "agent" in source ? {
    definitionDigest: agentDefinitionDigest(source.agent),
    systemPromptMode: source.agent.systemPromptMode,
    inheritProjectContext: source.agent.inheritProjectContext,
    inheritGlobalContext: source.agent.inheritGlobalContext,
    inheritSkills: source.agent.inheritSkills
  } : source;
  return {
    definitionDigest: identity.definitionDigest,
    launchContractDigest: launchBindingDigest({
      ...identity,
      task: source.task,
      model: source.model,
      fast: source.fast,
      thinking: source.thinking || void 0,
      systemPrompt: source.systemPrompt,
      skills: source.skills,
      tools: source.toolPlan.effectiveToolAllowlist,
      excludeTools: source.toolPlan.excludeTools.length > 0 ? source.toolPlan.excludeTools : void 0,
      extensions: source.toolPlan.extensionArgs,
      mcpDirectTools: source.toolPlan.effectiveMcpTools,
      outputPath: source.outputPath || void 0,
      outputMode: source.outputMode,
      structuredOutputSchema: source.structuredOutputSchema,
      extensionBindings: source.extensionBindings || void 0
    })
  };
}

export {
  AGENT_DEFINITION_PROJECTION_VERSION,
  stableJsonDigest,
  agentDefinitionDigest,
  resolveLaunchBinding
};
