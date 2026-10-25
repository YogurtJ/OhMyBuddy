import {
  stableJsonDigest
} from "./chunk-7F6RKT6W.js";

// src/shared/workflow-child-permit.ts
var records = /* @__PURE__ */ new WeakMap();
function projectionDigest(input) {
  return stableJsonDigest({
    version: 1,
    childKey: input.childKey,
    agent: input.agent,
    launchContractDigest: input.launchContractDigest,
    context: input.context,
    runner: input.runner
  });
}
function required(value, label) {
  if (!value.trim() || value !== value.trim()) throw new Error(`${label} must be a non-empty trimmed string.`);
  return value;
}
function validateWorkflowChildPermitRoot(permit, workflowRunId) {
  const record = records.get(permit);
  if (!record) return "Workflow child permit is invalid.";
  if (record.state !== "available") return "Workflow child permit is already consumed.";
  if (record.workflowRunId !== workflowRunId) return "Workflow child permit does not match this workflow root.";
  return void 0;
}
function claimWorkflowChildPermit(permit, workflowRunId, childKey) {
  const record = records.get(permit);
  if (!record) return "Workflow child permit is invalid.";
  if (record.state !== "available") return "Workflow child permit is already consumed.";
  if (record.workflowRunId !== workflowRunId) return "Workflow child permit does not match this workflow root.";
  record.state = record.childKey === childKey ? "claimed" : "consumed";
  if (record.childKey !== childKey) return "Workflow child permit child key mismatch.";
  return void 0;
}
function consumeWorkflowChildPermit(permit, launch) {
  const record = records.get(permit);
  if (!record) return "Workflow child permit is invalid.";
  if (record.state === "available") return "Workflow child permit launch was not claimed.";
  if (record.state === "consumed") return "Workflow child permit is already consumed.";
  if (record.workflowRunId !== launch.workflowRunId) return "Workflow child permit does not match this workflow root.";
  record.state = "consumed";
  if (record.childKey !== launch.childKey) return "Workflow child permit child key mismatch.";
  if (record.agent !== launch.agent) return "Workflow child permit agent mismatch.";
  if (launch.runner !== "pi") return "Workflow child permit supports native Pi children only.";
  if (record.expectedProjectionDigest !== projectionDigest(launch)) return "Workflow child permit does not match the final launch projection.";
  return void 0;
}
var resourceRecords = /* @__PURE__ */ new WeakMap();
function cloneWorkflowResourceAuthority(authority) {
  if (!authority || typeof authority !== "object" || Array.isArray(authority)) throw new Error("Workflow resource authority must be an object.");
  if (authority.host === void 0) return Object.freeze({});
  if (!Array.isArray(authority.host) || authority.host.length > 32) throw new Error("Workflow resource host authority must be an array of at most 32 grants.");
  const keys = /* @__PURE__ */ new Set();
  const host = Array.from(authority.host, (grant) => {
    if (!grant || typeof grant !== "object" || Object.keys(grant).some((field) => field !== "key" && field !== "command")) throw new Error("Workflow resource host grant must contain only key and command.");
    const { key, command } = grant;
    if (typeof key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(key) || keys.has(key)) throw new Error("Workflow resource host grant requires a unique safe key.");
    if (typeof command !== "string" || !command.trim() || Buffer.byteLength(command.trim(), "utf8") > 16 * 1024 || command.includes("\0")) throw new Error("Workflow resource host grant requires a non-empty command of at most 16384 bytes without NUL.");
    keys.add(key);
    return Object.freeze({ key, command: command.trim() });
  });
  return Object.freeze({ host: Object.freeze(host) });
}
function createWorkflowResourcePermit(input) {
  const resourceName = required(input.resourceName, "resourceName");
  const resourceId = required(input.resourceId, "resourceId");
  const scriptDigest = required(input.scriptDigest, "scriptDigest");
  if (!Number.isInteger(input.resourceVersion) || input.resourceVersion < 1) throw new Error("resourceVersion must be a positive integer.");
  const authority = cloneWorkflowResourceAuthority(input.authority);
  const permit = Object.freeze(/* @__PURE__ */ Object.create(null));
  resourceRecords.set(permit, {
    resourceName,
    resourceVersion: input.resourceVersion,
    resourceId,
    scriptDigest,
    authority,
    provenance: Object.freeze({
      kind: "workflow",
      name: resourceName,
      version: input.resourceVersion,
      invocation: "named",
      expansion: "resolved",
      id: resourceId
    }),
    state: "available"
  });
  return permit;
}
function consumeWorkflowResourcePermit(permit, script) {
  const record = resourceRecords.get(permit);
  if (!record) return "Workflow resource permit is invalid.";
  if (record.state !== "available") return "Workflow resource permit is already consumed.";
  if (stableJsonDigest(script) !== record.scriptDigest) return "Workflow resource permit does not match the resolved workflow script.";
  record.state = "consumed";
  return { provenance: record.provenance, authority: record.authority };
}
function authorizeWorkflowResourceHost(permit, key, command) {
  const record = resourceRecords.get(permit);
  if (!record || record.state !== "consumed") return "Workflow resource authority is unavailable.";
  const host = record.authority.host;
  if (!host) return "runs.host is not allowed for this workflow resource.";
  if (!host.some((grant) => grant.key === key && grant.command === command.trim())) return `The command for runs.host('${key}') is not allowed for workflow resource '${record.resourceName}'.`;
  return void 0;
}

// src/workflows/workflow-resources.ts
import { randomUUID } from "node:crypto";

// src/workflows/structured-workflow-scripts.ts
var OUTPUT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
var PLACEHOLDER_PATTERN = /\{(?:task|previous|outputs\.([A-Za-z_][A-Za-z0-9_]*))\}/g;
var CHILD_FIELDS = ["cwd", "model"];
var TOP_LEVEL_CONTROLS_HINT = " Put worktree and other child controls on the subagent call itself; they apply to every child.";
function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function nonEmptyString(value, path) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string.`);
  return value;
}
function exactFields(value, path, allowed, hint) {
  if (!isPlainRecord(value)) throw new Error(`${path} must be an object.`);
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length > 0) throw new Error(`${path} contains unsupported fields: ${unsupported.join(", ")}. ${hint}`);
  return value;
}
function compileTemplate(template, scope) {
  const parts = [];
  let cursor = 0;
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const literal2 = template.slice(cursor, match.index);
    cursor = match.index + match[0].length;
    let variable;
    if (match[0] === "{task}") {
      if (!scope.hasOriginalTask) throw new Error(`${scope.path} references {task}, but no top-level task was provided.`);
      variable = "originalTask";
    } else if (match[0] === "{previous}") {
      if ("unavailable" in scope.previous) throw new Error(`${scope.path} cannot use {previous}; ${scope.previous.unavailable}`);
      variable = scope.previous.variable;
    } else {
      const name = match[1];
      if (!scope.outputs) throw new Error(`${scope.path} cannot use {outputs.${name}}; ${scope.outputsUnavailable}`);
      const named = scope.outputs.get(name);
      if (!named) throw new Error(`${scope.path} references {outputs.${name}}, but no earlier sequential step sets as: "${name}".`);
      variable = named;
    }
    if (literal2) parts.push(JSON.stringify(literal2));
    parts.push(variable);
  }
  const literal = template.slice(cursor);
  if (literal || parts.length === 0) parts.push(JSON.stringify(literal));
  return parts.join(" + ");
}
function prelude(originalTask) {
  return originalTask === void 0 ? [SETTLE_HELPER] : [SETTLE_HELPER, `const originalTask = ${JSON.stringify(originalTask)};`];
}
function childFields(record, path) {
  const fields = {};
  for (const field of CHILD_FIELDS) {
    if (record[field] !== void 0) fields[field] = nonEmptyString(record[field], `${path}.${field}`);
  }
  return fields;
}
function runsAllCall(children) {
  return `await runs.all([${children.map((child) => {
    const fields = Object.entries(child.fields).map(([field, value]) => `, ${field}: ${JSON.stringify(value)}`).join("");
    return `{ key: ${JSON.stringify(child.key)}, agent: ${JSON.stringify(child.agent)}, task: ${child.taskExpression}${fields} }`;
  }).join(", ")}])`;
}
var SETTLE_HELPER = [
  "function settle(results, agents) {",
  "  return results.map(function (result, index) {",
  '    const child = { key: result.key, agent: agents[index], ok: result.ok === true, output: typeof result.output === "string" ? result.output : "" };',
  '    if (!child.ok && typeof result.error === "string") child.error = result.error;',
  "    return child;",
  "  });",
  "}",
  // A failed child fails the workflow; the runtime keeps every settled child in the partial results.
  "function failure(label, children) {",
  '  return new Error(label + ": " + children.filter(function (child) { return !child.ok; }).map(function (child) { return child.key + " (" + child.agent + ") failed" + (child.error ? ": " + child.error : ""); }).join("; "));',
  "}"
].join("\n");
function buildTasksScript(steps, originalTask) {
  if (!Array.isArray(steps) || steps.length === 0) throw new Error("tasks must be a non-empty array of { agent, task } items.");
  const children = steps.map((item, index) => {
    const path = `tasks[${index}]`;
    const record = exactFields(item, path, ["agent", "task", ...CHILD_FIELDS], `Each tasks item accepts agent and task, plus optional cwd and model.${TOP_LEVEL_CONTROLS_HINT}`);
    const agent = nonEmptyString(record.agent, `${path}.agent`);
    const task = nonEmptyString(record.task, `${path}.task`);
    const taskExpression = compileTemplate(task, {
      path: `${path}.task`,
      hasOriginalTask: originalTask !== void 0,
      previous: { unavailable: "tasks items may only use {task}." },
      outputsUnavailable: "tasks items may only use {task}."
    });
    return { key: `task-${index + 1}`, agent, taskExpression, fields: childFields(record, path) };
  });
  return [
    ...prelude(originalTask),
    `const run1 = ${runsAllCall(children)};`,
    `const children = settle(run1, ${JSON.stringify(children.map((child) => child.agent))});`,
    'if (!children.every(function (child) { return child.ok; })) throw failure("tasks failed", children);',
    "return { ok: true, children };"
  ].join("\n");
}
function buildChainScript(steps, originalTask) {
  if (!Array.isArray(steps) || steps.length === 0) throw new Error("chain must be a non-empty array of steps.");
  const lines = [...prelude(originalTask), "const children = [];"];
  const hasOriginalTask = originalTask !== void 0;
  const outputs = /* @__PURE__ */ new Map();
  for (const [index, step] of steps.entries()) {
    const number = index + 1;
    const path = `chain[${index}]`;
    const previous = index === 0 ? { unavailable: "the first chain step has no previous output." } : { variable: `output${index}` };
    let stepChildren;
    let outputName;
    if (isPlainRecord(step) && Object.hasOwn(step, "parallel")) {
      const record = exactFields(step, path, ["parallel"], `A parallel step accepts only parallel; as is supported on sequential steps only.${TOP_LEVEL_CONTROLS_HINT}`);
      const items = record.parallel;
      if (!Array.isArray(items) || items.length === 0) throw new Error(`${path}.parallel must be a non-empty array of { agent, task } items.`);
      stepChildren = items.map((item, itemIndex) => {
        const itemPath = `${path}.parallel[${itemIndex}]`;
        const itemRecord = exactFields(item, itemPath, ["agent", "task", ...CHILD_FIELDS], `Each parallel item accepts agent and task, plus optional cwd and model.${TOP_LEVEL_CONTROLS_HINT}`);
        const agent = nonEmptyString(itemRecord.agent, `${itemPath}.agent`);
        const task = nonEmptyString(itemRecord.task, `${itemPath}.task`);
        return { key: `step-${number}-${itemIndex + 1}`, agent, fields: childFields(itemRecord, itemPath), taskExpression: compileTemplate(task, { path: `${itemPath}.task`, hasOriginalTask, previous, outputs }) };
      });
    } else {
      const record = exactFields(step, path, ["agent", "task", "as", ...CHILD_FIELDS], `A sequential step accepts agent, task, as, cwd and model; a parallel step accepts only parallel.${TOP_LEVEL_CONTROLS_HINT}`);
      const agent = nonEmptyString(record.agent, `${path}.agent`);
      let task;
      if (record.task === void 0) {
        if (index === 0) throw new Error(`${path}.task is required; the first chain step has no previous output.`);
        task = "{previous}";
      } else task = nonEmptyString(record.task, `${path}.task`);
      if (record.as !== void 0) {
        if (typeof record.as !== "string" || !OUTPUT_NAME_PATTERN.test(record.as)) throw new Error(`${path}.as must be an identifier matching ${OUTPUT_NAME_PATTERN}.`);
        if (outputs.has(record.as)) throw new Error(`${path}.as '${record.as}' is already used by an earlier step.`);
        outputName = record.as;
      }
      stepChildren = [{ key: `step-${number}`, agent, fields: childFields(record, path), taskExpression: compileTemplate(task, { path: `${path}.task`, hasOriginalTask, previous, outputs }) }];
    }
    lines.push(
      `const run${number} = ${runsAllCall(stepChildren)};`,
      `const step${number} = settle(run${number}, ${JSON.stringify(stepChildren.map((child) => child.agent))});`,
      `children.push(...step${number});`,
      `if (!step${number}.every(function (child) { return child.ok; })) throw failure(${JSON.stringify(`chain stopped at step ${number}`)}, step${number});`
    );
    if (index < steps.length - 1) lines.push(`const output${number} = step${number}.map(function (child) { return child.output; }).join("\\n\\n");`);
    if (outputName !== void 0) outputs.set(outputName, `output${number}`);
  }
  lines.push("return { ok: true, children };");
  return lines.join("\n");
}
function buildStructuredWorkflowScript(kind, steps, originalTask) {
  return kind === "tasks" ? buildTasksScript(steps, originalTask) : buildChainScript(steps, originalTask);
}

// src/workflows/workflow-resources.ts
var RESOURCE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
var MAX_ARGS_BYTES = 16 * 1024;
var MAX_ARGS_FIELDS = 16;
var MAX_ARGS_ITEMS = 64;
var MAX_ARGS_DEPTH = 8;
var MAX_STRING_BYTES = 16 * 1024;
function registry() {
  const key = /* @__PURE__ */ Symbol.for("pi-subagents.workflow-resources.v1");
  const globalObject = globalThis;
  const existing = globalObject[key];
  if (existing === void 0) {
    const created = { version: 1, bySession: /* @__PURE__ */ new Map() };
    globalObject[key] = created;
    return created;
  }
  if (!isPlainRecord(existing) || existing.version !== 1 || !(existing.bySession instanceof Map)) throw new Error("Malformed or unsupported workflow resource registry.");
  return existing;
}
function registerWorkflowResource(input) {
  if (!isPlainRecord(input) || Object.keys(input).some((key) => key !== "sessionId" && key !== "definition")) throw new Error("Workflow registration requires only sessionId and definition.");
  const { sessionId, definition } = input;
  if (typeof sessionId !== "string" || !sessionId || sessionId.trim() !== sessionId || sessionId.length > 256 || sessionId.includes("\0")) throw new Error("Workflow registration requires a non-empty trimmed sessionId of at most 256 characters without NUL.");
  if (!isPlainRecord(definition) || Object.keys(definition).some((key) => !["name", "version", "resolve"].includes(key))) throw new Error("Workflow definition requires only name, version and resolve.");
  const { name, version, resolve } = definition;
  if (typeof name !== "string" || !RESOURCE_NAME_PATTERN.test(name)) throw new Error("Workflow definition requires a safe resource name.");
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("Workflow definition version must be a positive safe integer.");
  if (typeof resolve !== "function") throw new Error("Workflow definition requires a synchronous resolve function.");
  if (findWorkflowResource(name) || STRUCTURED_WORKFLOW_RESOURCE_NAMES.includes(name)) throw new Error(`Workflow resource '${name}' is a protected builtin.`);
  const current = registry();
  const bucket = current.bySession.get(sessionId) ?? /* @__PURE__ */ new Map();
  if (!(bucket instanceof Map)) throw new Error("Malformed workflow resource session registry.");
  if (bucket.has(name)) throw new Error(`Workflow resource '${name}' is already registered in this session; dispose it first.`);
  const snapshot = Object.freeze({ name, version, resolve });
  bucket.set(name, snapshot);
  current.bySession.set(sessionId, bucket);
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      if (bucket.get(name) === snapshot) bucket.delete(name);
      if (bucket.size === 0 && current.bySession.get(sessionId) === bucket) current.bySession.delete(sessionId);
    }
  };
}
function jsonByteLength(value) {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === void 0) throw new Error("must contain JSON data");
    return Buffer.byteLength(encoded, "utf8");
  } catch (error) {
    throw new Error(`must contain plain JSON data: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function validatePlainJson(value, path, depth = 0) {
  if (depth > MAX_ARGS_DEPTH) throw new Error(`${path} is too deeply nested.`);
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (!value.trim()) throw new Error(`${path} must not be empty.`);
    if (Buffer.byteLength(value, "utf8") > MAX_STRING_BYTES) throw new Error(`${path} exceeds ${MAX_STRING_BYTES} bytes.`);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} must be finite.`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARGS_ITEMS) throw new Error(`${path} contains too many items.`);
    for (const [index, entry] of value.entries()) validatePlainJson(entry, `${path}[${index}]`, depth + 1);
    return;
  }
  if (!isPlainRecord(value)) throw new Error(`${path} must contain plain JSON data.`);
  if (Object.keys(value).length > MAX_ARGS_FIELDS) throw new Error(`${path} contains too many fields.`);
  for (const [key, entry] of Object.entries(value)) {
    if (!key.trim()) throw new Error(`${path} contains an empty field name.`);
    validatePlainJson(entry, `${path}.${key}`, depth + 1);
  }
}
function normalizeWorkflowArgs(value) {
  if (value === void 0) return { args: {} };
  if (!isPlainRecord(value)) return { error: "workflow args must be a plain JSON object." };
  try {
    validatePlainJson(value, "workflow args");
    if (jsonByteLength(value) > MAX_ARGS_BYTES) return { error: `workflow args exceed ${MAX_ARGS_BYTES} bytes.` };
    return { args: JSON.parse(JSON.stringify(value)) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
function deepFreezeWorkflowArgs(args) {
  deepFreezeWorkflowValue(args);
  return args;
}
function deepFreezeWorkflowValue(value) {
  if (!Array.isArray(value) && !isPlainRecord(value)) return;
  for (const entry of Object.values(value)) deepFreezeWorkflowValue(entry);
  Object.freeze(value);
}
function resolveRunCi(args) {
  const allowed = /* @__PURE__ */ new Set(["command", "timeoutMs"]);
  const unsupported = Object.keys(args).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) return { error: `workflow 'run-ci' args contain unsupported fields: ${unsupported.join(", ")}.` };
  const command = args.command === void 0 ? "npm test" : args.command;
  if (command !== "npm test" && command !== "npm run typecheck") return { error: "workflow 'run-ci' args.command must be 'npm test' or 'npm run typecheck'." };
  const timeoutMs = args.timeoutMs === void 0 ? 12e4 : args.timeoutMs;
  if (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 864e5) return { error: "workflow 'run-ci' args.timeoutMs must be an integer from 1 to 86400000." };
  const params = { kind: "command", command, timeoutMs, role: "ci" };
  return {
    script: `return await runs.host("ci", ${JSON.stringify(params)});`,
    hostCommands: [{ key: "ci", command }]
  };
}
function resolveParallel(args) {
  const unsupported = Object.keys(args).filter((key) => key !== "tasks");
  if (unsupported.length > 0) return { error: `workflow 'parallel' args contain unsupported fields: ${unsupported.join(", ")}. Pass args.tasks: [{ agent, task, cwd?, model? }, ...].${TOP_LEVEL_CONTROLS_HINT}` };
  try {
    return { script: buildStructuredWorkflowScript("tasks", args.tasks, void 0) };
  } catch (error) {
    return { error: `workflow 'parallel' args.${error instanceof Error ? error.message : String(error)}` };
  }
}
function resolveReview(args) {
  const unsupported = Object.keys(args).filter((key) => key !== "task");
  if (unsupported.length > 0) return { error: `workflow 'review' args contain unsupported fields: ${unsupported.join(", ")}.` };
  const task = args.task;
  if (typeof task !== "string" || !task.trim()) return { error: "workflow 'review' requires a non-empty string args.task." };
  return {
    script: `return (await runs.run("review", { agent: "reviewer", task: ${JSON.stringify(task.trim())} })).output;`
  };
}
var WORKFLOW_RESOURCES = [
  { name: "review", version: 1, resolve: resolveReview },
  { name: "run-ci", version: 1, resolve: resolveRunCi },
  { name: "parallel", version: 1, resolve: resolveParallel }
];
function findWorkflowResource(name) {
  return WORKFLOW_RESOURCES.find((resource) => resource.name === name);
}
function listWorkflowResourceNames() {
  return WORKFLOW_RESOURCES.map((resource) => resource.name);
}
var STRUCTURED_WORKFLOW_RESOURCE_NAMES = ["tasks", "chain"];
var STRUCTURED_WORKFLOW_RESOURCE_VERSION = 1;
function resolveStructuredWorkflowResource(input) {
  try {
    if (!isPlainRecord(input) || input.kind !== "tasks" && input.kind !== "chain") return { ok: false, error: "Structured workflow kind must be 'tasks' or 'chain'." };
    const { kind, steps, task } = input;
    if (!Array.isArray(steps) || steps.length === 0) return { ok: false, error: `${kind} must be a non-empty array.` };
    validatePlainJson(steps, kind);
    if (task !== void 0) {
      if (typeof task !== "string" || !task.trim()) return { ok: false, error: "task must be a non-empty string when provided." };
      validatePlainJson(task, "task");
    }
    if (jsonByteLength({ [kind]: steps, task }) > MAX_ARGS_BYTES) return { ok: false, error: `${kind} input exceeds ${MAX_ARGS_BYTES} bytes.` };
    const script = buildStructuredWorkflowScript(kind, JSON.parse(JSON.stringify(steps)), task);
    return { ok: true, resource: issueWorkflowResource(kind, STRUCTURED_WORKFLOW_RESOURCE_VERSION, script) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 4096) : "Structured workflow resolution failed." };
  }
}
function resolveWorkflowResource(nameValue, argsValue, sessionId) {
  try {
    const result = resolveResource(nameValue, argsValue, sessionId);
    return result.ok ? result : { ok: false, error: result.error.slice(0, 4096) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 4096) : "Workflow resource resolution failed." };
  }
}
function resolveResource(nameValue, argsValue, sessionId) {
  if (typeof nameValue !== "string" || !nameValue.trim()) return { ok: false, error: "workflow must be a non-empty resource name." };
  const name = nameValue.trim();
  if (!RESOURCE_NAME_PATTERN.test(name)) return { ok: false, error: "workflow must use a safe resource name." };
  const resource = findWorkflowResource(name) ?? (sessionId ? registry().bySession.get(sessionId)?.get(name) : void 0);
  if (!resource) return { ok: false, error: `Unknown workflow resource '${name}'. Available resources: ${listWorkflowResourceNames().join(", ")}.` };
  const normalizedArgs = normalizeWorkflowArgs(argsValue);
  if ("error" in normalizedArgs) return { ok: false, error: normalizedArgs.error };
  const resolved = resource.resolve(normalizedArgs.args);
  if (resolved && typeof resolved.then === "function") {
    void Promise.resolve(resolved).catch(() => {
    });
    throw new Error("Workflow resource resolve must be synchronous.");
  }
  if (!isPlainRecord(resolved)) throw new Error("Workflow resource resolve must return an expansion or error object.");
  if ("error" in resolved) {
    if (Object.keys(resolved).some((key) => key !== "error") || typeof resolved.error !== "string" || !resolved.error.trim()) throw new Error("Workflow resource returned an invalid error.");
    return { ok: false, error: resolved.error };
  }
  const { script, hostCommands } = resolved;
  if (Object.keys(resolved).some((key) => key !== "script" && key !== "hostCommands") || typeof script !== "string" || !script.trim()) throw new Error("Workflow resource returned an invalid expansion.");
  return { ok: true, resource: issueWorkflowResource(resource.name, resource.version, script, hostCommands) };
}
function issueWorkflowResource(name, version, script, hostCommands) {
  const resourceId = randomUUID();
  const permit = createWorkflowResourcePermit({
    resourceName: name,
    resourceVersion: version,
    resourceId,
    scriptDigest: stableJsonDigest(script),
    authority: { host: hostCommands }
  });
  const provenance = Object.freeze({
    kind: "workflow",
    name,
    version,
    invocation: "named",
    expansion: "resolved",
    id: resourceId
  });
  return { script, permit, provenance };
}

export {
  validateWorkflowChildPermitRoot,
  claimWorkflowChildPermit,
  consumeWorkflowChildPermit,
  consumeWorkflowResourcePermit,
  authorizeWorkflowResourceHost,
  MAX_ARGS_BYTES,
  MAX_ARGS_FIELDS,
  MAX_ARGS_ITEMS,
  MAX_ARGS_DEPTH,
  registerWorkflowResource,
  normalizeWorkflowArgs,
  deepFreezeWorkflowArgs,
  resolveStructuredWorkflowResource,
  resolveWorkflowResource
};
