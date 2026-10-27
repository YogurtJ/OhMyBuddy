// src/api/external-job-provider.ts
var EXTERNAL_JOB_PROVIDER_PROTOCOL_VERSION = 1;
var EXTERNAL_JOB_PROVIDER_REGISTRY_KEY = "pi-subagents.external-job-providers.v1";
var MAX_PROVIDER_NAME_LENGTH = 128;
var MAX_PROVIDERS = 100;
var MAX_JOB_ID_LENGTH = 256;
var MAX_FAILURE_CODE_LENGTH = 128;
var MAX_FAILURE_MESSAGE_LENGTH = 4096;
var MAX_URL_LENGTH = 4096;
var ExternalJobProviderError = class extends Error {
  code;
  blockingJobId;
  constructor(message, options) {
    super(message, options.cause === void 0 ? void 0 : { cause: options.cause });
    this.name = "ExternalJobProviderError";
    this.code = options.code;
    this.blockingJobId = options.blockingJobId;
  }
};
function registry() {
  const key = Symbol.for(EXTERNAL_JOB_PROVIDER_REGISTRY_KEY);
  const globalObject = globalThis;
  const existing = globalObject[key];
  if (existing === void 0) {
    const created = {
      version: EXTERNAL_JOB_PROVIDER_PROTOCOL_VERSION,
      providers: /* @__PURE__ */ new Map()
    };
    globalObject[key] = created;
    return created;
  }
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
    throw new Error(`Malformed external-job provider registry at Symbol.for("${EXTERNAL_JOB_PROVIDER_REGISTRY_KEY}").`);
  }
  const candidate = existing;
  if (candidate.version !== EXTERNAL_JOB_PROVIDER_PROTOCOL_VERSION || !(candidate.providers instanceof Map)) {
    throw new Error(`Unsupported external-job provider registry at Symbol.for("${EXTERNAL_JOB_PROVIDER_REGISTRY_KEY}").`);
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
function validateOptionalString(value, field, maxLength) {
  if (value === void 0) return void 0;
  return validateString(value, field, maxLength);
}
function validateState(value, field) {
  if (value === "queued" || value === "running" || value === "completed" || value === "failed" || value === "stopped" || value === "blocked") return value;
  throw new Error(`${field} must be queued, running, completed, failed, stopped, or blocked.`);
}
function validateHandle(provider, value, field, extraFields = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} from external-job provider '${provider}' must be an object.`);
  const handle = value;
  const supported = /* @__PURE__ */ new Set(["providerJobId", "state", "handleUrl", "conversationUrl", "failureCode", "failureMessage", "blockingJobId", ...extraFields]);
  const unknown = Object.keys(handle).filter((key) => !supported.has(key));
  if (unknown.length > 0) throw new Error(`${field} from external-job provider '${provider}' has unknown fields: ${unknown.join(", ")}.`);
  const handleUrl = validateOptionalString(handle.handleUrl, `${field}.handleUrl`, MAX_URL_LENGTH);
  const conversationUrl = validateOptionalString(handle.conversationUrl, `${field}.conversationUrl`, MAX_URL_LENGTH);
  const failureCode = validateOptionalString(handle.failureCode, `${field}.failureCode`, MAX_FAILURE_CODE_LENGTH);
  const failureMessage = validateOptionalString(handle.failureMessage, `${field}.failureMessage`, MAX_FAILURE_MESSAGE_LENGTH);
  const blockingJobId = validateOptionalString(handle.blockingJobId, `${field}.blockingJobId`, MAX_JOB_ID_LENGTH);
  return {
    providerJobId: validateString(handle.providerJobId, `${field}.providerJobId`, MAX_JOB_ID_LENGTH),
    state: validateState(handle.state, `${field}.state`),
    ...handleUrl ? { handleUrl } : {},
    ...conversationUrl ? { conversationUrl } : {},
    ...failureCode ? { failureCode } : {},
    ...failureMessage ? { failureMessage } : {},
    ...blockingJobId ? { blockingJobId } : {}
  };
}
function validateExternalJobHandle(provider, value, field = "External-job handle") {
  return validateHandle(provider, value, field);
}
function validateExternalJobResult(provider, value, field = "External-job result") {
  const result = validateHandle(provider, value, field, ["output", "artifactPath"]);
  const record = value;
  const output = validateOptionalString(record.output, `${field}.output`, 1024 * 1024);
  const artifactPath = validateOptionalString(record.artifactPath, `${field}.artifactPath`, MAX_URL_LENGTH);
  return {
    ...result,
    ...output !== void 0 ? { output } : {},
    ...artifactPath !== void 0 ? { artifactPath } : {}
  };
}
function validateProvider(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("External-job provider must be an object.");
  const provider = value;
  const name = validateString(provider.name, "External-job provider name", MAX_PROVIDER_NAME_LENGTH);
  for (const op of ["start", "status", "result", "reattach"]) {
    if (typeof provider[op] !== "function") throw new Error(`External-job provider '${name}' must expose ${op}().`);
  }
  return value;
}
function registerExternalJobProvider(provider) {
  const validated = validateProvider(provider);
  const current = registry();
  if (!current.providers.has(validated.name) && current.providers.size >= MAX_PROVIDERS) {
    throw new Error(`External-job provider registry supports at most ${MAX_PROVIDERS} providers.`);
  }
  current.providers.set(validated.name, validated);
  return () => {
    if (current.providers.get(validated.name) === validated) current.providers.delete(validated.name);
  };
}
function listExternalJobProviders() {
  const current = registry();
  if (current.providers.size > MAX_PROVIDERS) throw new Error(`External-job provider registry contains more than ${MAX_PROVIDERS} providers.`);
  const providers = [];
  for (const [key, value] of current.providers) {
    const provider = validateProvider(value);
    if (key !== provider.name) throw new Error(`External-job provider registry key '${key}' does not match provider name '${provider.name}'.`);
    providers.push(provider);
  }
  return providers;
}
function getExternalJobProvider(name) {
  const safeName = validateString(name, "External-job provider name", MAX_PROVIDER_NAME_LENGTH);
  return listExternalJobProviders().find((provider) => provider.name === safeName);
}

export {
  EXTERNAL_JOB_PROVIDER_PROTOCOL_VERSION,
  EXTERNAL_JOB_PROVIDER_REGISTRY_KEY,
  ExternalJobProviderError,
  validateExternalJobHandle,
  validateExternalJobResult,
  registerExternalJobProvider,
  listExternalJobProviders,
  getExternalJobProvider
};
