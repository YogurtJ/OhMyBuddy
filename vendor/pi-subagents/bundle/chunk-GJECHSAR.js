import {
  appendAgentRefinementOverlay
} from "./chunk-PLCCBLPY.js";
import {
  buildAgentMemoryInjection,
  buildSkillInjection
} from "./chunk-CIZQXJ5Q.js";

// src/runs/shared/effective-system-prompt.ts
function appendSection(prompt, section) {
  return prompt ? `${prompt}

${section}` : section;
}
function buildEffectiveSystemPrompt(input) {
  let prompt = input.agent.systemPrompt?.trim() ?? "";
  if (input.resolvedSkills.length > 0) prompt = appendSection(prompt, buildSkillInjection(input.resolvedSkills));
  const memoryInjection = buildAgentMemoryInjection(input.agent, input.cwd);
  if (memoryInjection) prompt = appendSection(prompt, memoryInjection);
  prompt = appendAgentRefinementOverlay(prompt, { cwd: input.cwd, agentName: input.agent.name });
  return prompt;
}

// src/shared/fork-context.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
function resolveSubagentContext(value) {
  return value === "fork" ? "fork" : "fresh";
}
function resolveSubagentLaunchContext(input) {
  if (input.explicitContext !== void 0) return input.explicitContext;
  const preferredContext = input.defaultSubagentContext ?? input.agentDefaultContext ?? "fresh";
  return preferredContext === "fork" && input.canUseImplicitFork ? "fork" : "fresh";
}
function canPreferFork(sessionManager) {
  return canPreferForkFromSnapshot({
    parentSessionFile: sessionManager.getSessionFile(),
    leafId: sessionManager.getLeafId?.() ?? null
  });
}
function canPreferForkFromSnapshot(input) {
  if (!input.parentSessionFile || !input.leafId) return false;
  try {
    return fs.existsSync(input.parentSessionFile);
  } catch {
    return false;
  }
}
function isUnsafeAnthropicThinkingBlock(message, block, verbatim) {
  if (!message || !block || typeof block !== "object" || !("type" in block)) return false;
  if (verbatim) return block.type === "redacted_thinking";
  const provider = typeof message.provider === "string" ? message.provider.toLowerCase() : "";
  const api = typeof message.api === "string" ? message.api.toLowerCase() : "";
  const model = typeof message.model === "string" ? message.model.toLowerCase() : "";
  const isAnthropic = provider === "anthropic" || api === "anthropic-messages" || model.startsWith("anthropic/");
  if (block.type === "redacted_thinking") return true;
  if (block.type !== "thinking" || !isAnthropic) return false;
  const record = block;
  const signature = "thinkingSignature" in record ? record.thinkingSignature : "signature" in record ? record.signature : void 0;
  return record.redacted === true || typeof signature === "string" && signature.length > 0;
}
function sanitizeUnsafeThinkingBlocks(entries, rewritten) {
  let sanitized = false;
  const entriesById = new Map(entries.flatMap((entry) => entry.id ? [[entry.id, entry]] : []));
  for (const entry of entries) {
    const targetMessage = entry.type === "context_edit" && entry.targetId ? entriesById.get(entry.targetId)?.message : entry.message;
    const contentOwner = entry.type === "context_edit" ? entry.replacement : targetMessage;
    if (targetMessage?.role !== "assistant" || !contentOwner || !Array.isArray(contentOwner.content)) continue;
    const verbatim = !rewritten && entry.type !== "context_edit";
    const filtered = contentOwner.content.filter((block) => !isUnsafeAnthropicThinkingBlock(targetMessage, block, verbatim));
    if (filtered.length === contentOwner.content.length) continue;
    contentOwner.content = filtered;
    sanitized = true;
  }
  return sanitized;
}
function readSessionEntries(sessionFile) {
  const lines = fs.readFileSync(sessionFile, "utf-8").split("\n").filter((line) => line.trim().length > 0);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      throw new Error(`Unable to inspect forked session ${sessionFile}: invalid JSONL on line ${index + 1}: ${cause.message}`, { cause });
    }
  });
}
function createForkContextResolver(sessionManager, requestedContext, options) {
  if (resolveSubagentContext(requestedContext) !== "fork") {
    return {
      prepareSessionForIndex: async () => {
      },
      sessionFileForIndex: () => void 0
    };
  }
  const parentSessionFile = sessionManager.getSessionFile();
  if (!parentSessionFile) {
    throw new Error("Forked subagent context requires a persisted parent session.");
  }
  const leafId = sessionManager.getLeafId();
  if (!leafId) {
    throw new Error("Forked subagent context requires a current leaf to fork from.");
  }
  const openSession = options.openSession ?? sessionManager.openSession ?? ((file, dir) => SessionManager.open(file, dir));
  const forksDir = path.join(
    path.dirname(parentSessionFile),
    path.basename(parentSessionFile, ".jsonl"),
    "forks"
  );
  const cachedSessionFiles = /* @__PURE__ */ new Map();
  const preparedIndexes = /* @__PURE__ */ new Set();
  const preparationPromises = /* @__PURE__ */ new Map();
  const resolveFork = (index = 0) => {
    const cached = cachedSessionFiles.get(index);
    if (cached) return cached;
    try {
      if (!fs.existsSync(parentSessionFile)) {
        throw new Error(`Parent session file does not exist: ${parentSessionFile}. Pi has not persisted enough history to fork yet.`);
      }
      const sessionDir = path.join(forksDir, options.runDirName());
      const sourceManager = openSession(parentSessionFile, sessionDir);
      const sessionFile = sourceManager.createBranchedSession(leafId);
      if (!sessionFile) {
        throw new Error("Session manager did not return a forked session file.");
      }
      if (!fs.existsSync(sessionFile)) {
        const header = sourceManager.getHeader?.();
        const entries = sourceManager.getEntries?.();
        if (!header || !entries) {
          throw new Error(`Session manager returned a forked session file that does not exist and cannot be persisted by fallback: ${sessionFile}`);
        }
        sanitizeUnsafeThinkingBlocks(entries, Boolean(options.pruneSession));
        fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
        fs.writeFileSync(sessionFile, `${[header, ...entries].map((entry) => JSON.stringify(entry)).join("\n")}
`, "utf-8");
      } else {
        const entries = readSessionEntries(sessionFile);
        if (sanitizeUnsafeThinkingBlocks(entries, Boolean(options.pruneSession))) {
          fs.writeFileSync(sessionFile, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}
`, "utf-8");
        }
      }
      cachedSessionFiles.set(index, sessionFile);
      return sessionFile;
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      throw new Error(`Failed to create forked subagent session: ${cause.message}`, { cause });
    }
  };
  return {
    async prepareSessionForIndex(index = 0) {
      const sessionFile = resolveFork(index);
      if (!options.pruneSession || preparedIndexes.has(index)) return;
      let preparation = preparationPromises.get(index);
      if (!preparation) {
        preparation = options.pruneSession(sessionFile).then(() => {
          preparedIndexes.add(index);
        });
        preparationPromises.set(index, preparation);
      }
      await preparation;
    },
    sessionFileForIndex(index = 0) {
      if (options.pruneSession && !preparedIndexes.has(index)) {
        throw new Error(`Pruned fork session ${index} was used before pruning completed.`);
      }
      return resolveFork(index);
    }
  };
}

export {
  buildEffectiveSystemPrompt,
  resolveSubagentLaunchContext,
  canPreferFork,
  canPreferForkFromSnapshot,
  createForkContextResolver
};
