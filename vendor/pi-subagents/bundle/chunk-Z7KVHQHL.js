// src/runs/shared/capability-ceiling.ts
import { Buffer } from "node:buffer";
var SUBAGENT_CAPABILITY_CEILING_VERSION = 1;
var SUBAGENT_CAPABILITY_CEILING_REGISTRY_KEY = "pi-subagents.capability-ceiling.v1";
function registry() {
  const key = Symbol.for(SUBAGENT_CAPABILITY_CEILING_REGISTRY_KEY);
  const store = globalThis;
  const existing = store[key];
  if (existing instanceof Map) return existing;
  const created = /* @__PURE__ */ new Map();
  store[key] = created;
  return created;
}
function validateText(value, field) {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f\u007f]/u.test(value) || Buffer.byteLength(value.trim(), "utf8") > 256) {
    throw new Error(`Invalid capability ceiling ${field}; expected a non-empty string without control characters (max 256 UTF-8 bytes).`);
  }
  return value.trim();
}
function normalizeCapabilityCeilingAllowedAgents(values) {
  return normalizeCeiling({ allowedAgents: values }).allowedAgents;
}
function normalizeCeiling(ceiling) {
  if (!ceiling || typeof ceiling !== "object" || Array.isArray(ceiling)) throw new Error("Invalid capability ceiling; expected an object.");
  const hasAllowedTools = Object.hasOwn(ceiling, "allowedTools");
  const hasAllowedAgents = Object.hasOwn(ceiling, "allowedAgents");
  const hasDenyExtensions = Object.hasOwn(ceiling, "denyExtensions");
  if (!hasAllowedTools && !hasAllowedAgents && !hasDenyExtensions) throw new Error("Invalid capability ceiling; expected allowedTools, allowedAgents, or denyExtensions.");
  if (hasDenyExtensions && typeof ceiling.denyExtensions !== "boolean") throw new Error("Invalid capability ceiling denyExtensions; expected a boolean.");
  const normalizeList = (field, pattern) => {
    if (!Object.hasOwn(ceiling, field)) return void 0;
    const values = ceiling[field];
    if (!Array.isArray(values)) throw new Error(`Invalid capability ceiling ${field}; expected an array.`);
    if (values.length > 256) throw new Error(`Invalid capability ceiling ${field}; expected at most 256 names.`);
    return [...new Set(values.map((entry) => {
      const name = validateText(entry, `${field} entry`);
      if (!pattern.test(name)) throw new Error(`Invalid capability ceiling ${field} entry '${name}'.`);
      if (Buffer.byteLength(name, "utf8") > 128) throw new Error(`Invalid capability ceiling ${field} entry '${name}'; max 128 UTF-8 bytes.`);
      return name;
    }))].sort();
  };
  const allowedTools = normalizeList("allowedTools", /^[A-Za-z0-9_.:-]+$/u);
  const allowedAgents = normalizeList("allowedAgents", /^[A-Za-z0-9_.:-]+$/u);
  return {
    version: SUBAGENT_CAPABILITY_CEILING_VERSION,
    ...allowedTools !== void 0 ? { allowedTools } : {},
    ...allowedAgents !== void 0 ? { allowedAgents } : {},
    denyExtensions: ceiling.denyExtensions === true,
    sources: []
  };
}
function parseSubagentCapabilityCeiling(value, field = "capability ceiling") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${field}; expected an object.`);
  const record = value;
  if (record.version !== SUBAGENT_CAPABILITY_CEILING_VERSION) throw new Error(`Invalid ${field} version.`);
  const normalized = normalizeCeiling(record);
  const sources = record.sources;
  if (!Array.isArray(sources) || sources.some((source) => typeof source !== "string")) throw new Error(`Invalid ${field} sources; expected an array of strings.`);
  normalized.sources = [...new Set(sources.map((source) => validateText(source, `${field} source`)))].sort();
  return normalized;
}
function registerSubagentCapabilityCeiling(options) {
  const sessionId = validateText(options.sessionId, "sessionId");
  const source = validateText(options.source, "source");
  let normalized = normalizeCeiling(options.ceiling);
  const token = Symbol(source);
  const store = registry();
  let session = store.get(sessionId);
  if (!session) {
    session = /* @__PURE__ */ new Map();
    store.set(sessionId, session);
  }
  const setRegistration = () => {
    normalized = normalizeCeiling(normalized);
    normalized.sources = [source];
    session.set(token, { source, ceiling: normalized });
  };
  setRegistration();
  let disposed = false;
  return {
    update(ceiling) {
      if (disposed) throw new Error("Cannot update a disposed capability ceiling handle.");
      normalized = normalizeCeiling(ceiling);
      normalized.sources = [source];
      session.set(token, { source, ceiling: normalized });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      session.delete(token);
      if (session.size === 0) store.delete(sessionId);
    }
  };
}
function intersectSubagentCapabilityCeilings(...ceilings) {
  const active = ceilings.filter((ceiling) => ceiling !== void 0);
  if (active.length === 0) return void 0;
  const intersectLists = (field) => {
    const definedLists = active.filter((ceiling) => ceiling[field] !== void 0).map((ceiling) => new Set(ceiling[field]));
    if (definedLists.length === 0) return void 0;
    return [...definedLists[0]].filter((entry) => definedLists.every((list) => list.has(entry))).sort();
  };
  const allowedTools = intersectLists("allowedTools");
  const allowedAgents = intersectLists("allowedAgents");
  return {
    version: SUBAGENT_CAPABILITY_CEILING_VERSION,
    ...allowedTools !== void 0 ? { allowedTools } : {},
    ...allowedAgents !== void 0 ? { allowedAgents } : {},
    denyExtensions: active.some((ceiling) => ceiling.denyExtensions),
    sources: [...new Set(active.flatMap((ceiling) => ceiling.sources))].sort()
  };
}
function resolveSubagentCapabilityCeiling(sessionId, inherited) {
  const active = [];
  if (sessionId) {
    const registrations = registry().get(sessionId);
    if (registrations) active.push(...Array.from(registrations.values(), ({ ceiling }) => ceiling));
  }
  return intersectSubagentCapabilityCeilings(inherited, ...active);
}
function resolveCurrentSubagentCapabilityCeiling(sessionId) {
  return resolveSubagentCapabilityCeiling(sessionId, void 0);
}
function isAgentAllowedByCapabilityCeiling(agentName, ceiling) {
  return ceiling?.allowedAgents === void 0 || ceiling.allowedAgents.includes(agentName);
}
function capabilityCeilingAgentRestrictionMessage(agentName, ceiling) {
  if (isAgentAllowedByCapabilityCeiling(agentName, ceiling)) return void 0;
  const sources = ceiling?.sources.length ? ceiling.sources.join(", ") : "unknown source";
  const allowed = ceiling?.allowedAgents?.length ? ceiling.allowedAgents.join(", ") : "(none)";
  return `Capability ceiling from ${sources} does not allow agent '${agentName}'. Allowed agents: ${allowed}.`;
}
function assertAgentAllowedByCapabilityCeiling(agentName, ceiling) {
  const message = capabilityCeilingAgentRestrictionMessage(agentName, ceiling);
  if (message) throw new Error(message);
}
function capabilityCeilingAgentRestrictionSources(ceiling) {
  return ceiling?.allowedAgents === void 0 ? void 0 : [...ceiling.sources];
}
function encodeSubagentCapabilityCeiling(ceiling) {
  if (!ceiling) return void 0;
  return Buffer.from(JSON.stringify(ceiling), "utf8").toString("base64url");
}
function decodeSubagentCapabilityCeiling(value) {
  if (value === void 0 || value === "") return void 0;
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch (error) {
    throw new Error(`Invalid inherited capability ceiling: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.version !== SUBAGENT_CAPABILITY_CEILING_VERSION) {
    throw new Error("Invalid inherited capability ceiling version.");
  }
  return parseSubagentCapabilityCeiling(parsed, "inherited capability ceiling");
}

export {
  SUBAGENT_CAPABILITY_CEILING_VERSION,
  SUBAGENT_CAPABILITY_CEILING_REGISTRY_KEY,
  normalizeCapabilityCeilingAllowedAgents,
  parseSubagentCapabilityCeiling,
  registerSubagentCapabilityCeiling,
  intersectSubagentCapabilityCeilings,
  resolveSubagentCapabilityCeiling,
  resolveCurrentSubagentCapabilityCeiling,
  isAgentAllowedByCapabilityCeiling,
  capabilityCeilingAgentRestrictionMessage,
  assertAgentAllowedByCapabilityCeiling,
  capabilityCeilingAgentRestrictionSources,
  encodeSubagentCapabilityCeiling,
  decodeSubagentCapabilityCeiling
};
