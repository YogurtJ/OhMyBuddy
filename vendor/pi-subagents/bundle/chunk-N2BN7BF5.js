// src/api/background-work.ts
var BACKGROUND_WORK_PROTOCOL_VERSION = 1;
var BACKGROUND_WORK_REGISTRY_KEY = "pi-subagents.background-work.v1";
var MAX_PROVIDER_NAME_LENGTH = 128;
var MAX_PROVIDERS = 100;
var MAX_ITEM_ID_LENGTH = 256;
var MAX_SESSION_ID_LENGTH = 4096;
var MAX_WAKE_CHANNEL_LENGTH = 256;
var MAX_ITEMS_PER_PROVIDER = 1e4;
function registry() {
  const key = Symbol.for(BACKGROUND_WORK_REGISTRY_KEY);
  const globalObject = globalThis;
  const existing = globalObject[key];
  if (existing === void 0) {
    const created = {
      version: BACKGROUND_WORK_PROTOCOL_VERSION,
      providers: /* @__PURE__ */ new Map()
    };
    globalObject[key] = created;
    return created;
  }
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
    throw new Error(`Malformed background-work registry at Symbol.for("${BACKGROUND_WORK_REGISTRY_KEY}").`);
  }
  const candidate = existing;
  if (candidate.version !== BACKGROUND_WORK_PROTOCOL_VERSION || !(candidate.providers instanceof Map)) {
    throw new Error(`Unsupported background-work registry at Symbol.for("${BACKGROUND_WORK_REGISTRY_KEY}").`);
  }
  return candidate;
}
function validateString(value, field, maxLength) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`${field} must be a non-empty string without leading or trailing whitespace.`);
  }
  if (value.length > maxLength) throw new Error(`${field} must be at most ${maxLength} characters.`);
  if (value.includes("\0")) throw new Error(`${field} must not contain NUL characters.`);
  return value;
}
function validateProvider(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Background-work provider must be an object.");
  }
  const provider = value;
  const unknownFields = Object.keys(provider).filter((key) => !["name", "listActiveWork", "wakeChannels", "reconcile"].includes(key));
  if (unknownFields.length > 0) throw new Error(`Background-work provider has unknown fields: ${unknownFields.join(", ")}.`);
  const name = validateString(provider.name, "Background-work provider name", MAX_PROVIDER_NAME_LENGTH);
  if (typeof provider.listActiveWork !== "function") {
    throw new Error(`Background-work provider '${name}' must expose listActiveWork().`);
  }
  if (provider.reconcile !== void 0 && typeof provider.reconcile !== "function") {
    throw new Error(`Background-work provider '${name}' reconcile must be a function when provided.`);
  }
  if (provider.wakeChannels !== void 0) {
    if (!Array.isArray(provider.wakeChannels)) {
      throw new Error(`Background-work provider '${name}' wakeChannels must be an array when provided.`);
    }
    const channels = provider.wakeChannels.map((channel, index) => validateString(channel, `Background-work provider '${name}' wakeChannels[${index}]`, MAX_WAKE_CHANNEL_LENGTH));
    if (new Set(channels).size !== channels.length) {
      throw new Error(`Background-work provider '${name}' wakeChannels must not contain duplicates.`);
    }
  }
  return value;
}
function validateItem(provider, value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Background-work provider '${provider}' item ${index} must be an object.`);
  }
  const item = value;
  const unknownFields = Object.keys(item).filter((key) => key !== "id" && key !== "sessionId");
  if (unknownFields.length > 0) {
    throw new Error(`Background-work provider '${provider}' item ${index} has unknown fields: ${unknownFields.join(", ")}.`);
  }
  return {
    id: validateString(item.id, `Background-work provider '${provider}' item ${index} id`, MAX_ITEM_ID_LENGTH),
    sessionId: validateString(item.sessionId, `Background-work provider '${provider}' item ${index} sessionId`, MAX_SESSION_ID_LENGTH)
  };
}
function registerBackgroundWorkProvider(provider) {
  const validated = validateProvider(provider);
  const current = registry();
  if (!current.providers.has(validated.name) && current.providers.size >= MAX_PROVIDERS) {
    throw new Error(`Background-work registry supports at most ${MAX_PROVIDERS} providers.`);
  }
  current.providers.set(validated.name, validated);
  return () => {
    if (current.providers.get(validated.name) === validated) current.providers.delete(validated.name);
  };
}
function listBackgroundWorkProviders() {
  const current = registry();
  if (current.providers.size > MAX_PROVIDERS) throw new Error(`Background-work registry contains more than ${MAX_PROVIDERS} providers.`);
  const providers = [];
  for (const [key, value] of current.providers) {
    const provider = validateProvider(value);
    if (key !== provider.name) throw new Error(`Background-work registry key '${key}' does not match provider name '${provider.name}'.`);
    providers.push(provider);
  }
  return providers;
}
function listBackgroundWorkWakeChannels() {
  const channels = /* @__PURE__ */ new Set();
  for (const provider of listBackgroundWorkProviders()) {
    for (const channel of provider.wakeChannels ?? []) channels.add(channel);
  }
  return [...channels];
}
function snapshotBackgroundWork(sessionId, nowMs = Date.now()) {
  validateString(sessionId, "Background-work snapshot sessionId", MAX_SESSION_ID_LENGTH);
  const providers = listBackgroundWorkProviders();
  const items = [];
  const identities = /* @__PURE__ */ new Set();
  for (const provider of providers) {
    try {
      provider.reconcile?.({ sessionId, nowMs });
    } catch (error) {
      throw new Error(
        `Background-work provider '${provider.name}' reconcile failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
    let active;
    try {
      active = provider.listActiveWork({ sessionId, nowMs });
    } catch (error) {
      throw new Error(
        `Background-work provider '${provider.name}' listActiveWork failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
    if (!Array.isArray(active)) {
      throw new Error(`Background-work provider '${provider.name}' listActiveWork() must return an array.`);
    }
    if (active.length > MAX_ITEMS_PER_PROVIDER) {
      throw new Error(`Background-work provider '${provider.name}' returned ${active.length} items; maximum is ${MAX_ITEMS_PER_PROVIDER}.`);
    }
    active.forEach((value, index) => {
      const item = validateItem(provider.name, value, index);
      const identity = `${provider.name}\0${item.sessionId}\0${item.id}`;
      if (identities.has(identity)) {
        throw new Error(`Background-work provider '${provider.name}' returned duplicate item '${item.id}' for session '${item.sessionId}'.`);
      }
      identities.add(identity);
      if (item.sessionId === sessionId) items.push({ provider: provider.name, ...item });
    });
  }
  return {
    providers: providers.map((provider) => provider.name),
    items
  };
}

export {
  BACKGROUND_WORK_PROTOCOL_VERSION,
  BACKGROUND_WORK_REGISTRY_KEY,
  registerBackgroundWorkProvider,
  listBackgroundWorkProviders,
  listBackgroundWorkWakeChannels,
  snapshotBackgroundWork
};
