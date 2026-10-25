// src/shared/required-child-extensions.ts
import * as fs from "node:fs";
import * as path from "node:path";
var ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
var MAX_REQUIRED_EXTENSIONS = 32;
var MAX_PATH_BYTES = 4096;
var EMPTY_SNAPSHOT = Object.freeze([]);
function snapshotRequiredChildExtensions(value, label = "Required child extensions", canonicalizeFiles = false) {
  if (!Array.isArray(value) || value.length > MAX_REQUIRED_EXTENSIONS) throw new Error(`${label} must be an array of at most ${MAX_REQUIRED_EXTENSIONS} entries.`);
  const ids = /* @__PURE__ */ new Set();
  const paths = /* @__PURE__ */ new Set();
  return Object.freeze(value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).some((key) => key !== "id" && key !== "path" && (canonicalizeFiles || key !== "requireForAllRunners"))) throw new Error(`${label} entry ${index} requires only id and path.`);
    const id = "id" in entry ? entry.id : void 0;
    const rawPath = "path" in entry ? entry.path : void 0;
    const requireForAllRunners = "requireForAllRunners" in entry ? entry.requireForAllRunners : void 0;
    if (typeof id !== "string" || !ID_PATTERN.test(id)) throw new Error(`${label} entry ${index} requires a safe id of at most 128 characters.`);
    if (ids.has(id)) throw new Error(`${label} id '${id}' is duplicated.`);
    if (requireForAllRunners !== void 0 && requireForAllRunners !== true) throw new Error(`${label} '${id}' requireForAllRunners must be true when present.`);
    if (typeof rawPath !== "string" || !rawPath.trim() || rawPath.includes("\0") || Buffer.byteLength(rawPath, "utf8") > MAX_PATH_BYTES || !canonicalizeFiles && !path.isAbsolute(rawPath)) throw new Error(`${label} '${id}' requires ${canonicalizeFiles ? "a" : "an absolute"} non-empty path of at most ${MAX_PATH_BYTES} bytes without NUL.`);
    let extensionPath = rawPath;
    if (canonicalizeFiles) {
      try {
        extensionPath = fs.realpathSync(path.resolve(rawPath));
        if (!fs.statSync(extensionPath).isFile()) throw new Error("not a file");
      } catch (error) {
        throw new Error(`${label} '${id}' is not an importable file: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (paths.has(extensionPath)) throw new Error(`${label} path '${extensionPath}' is duplicated.`);
    ids.add(id);
    paths.add(extensionPath);
    return Object.freeze(requireForAllRunners ? { id, path: extensionPath, requireForAllRunners } : { id, path: extensionPath });
  }));
}
function registry() {
  const key = /* @__PURE__ */ Symbol.for("pi-subagents.required-child-extensions.v1");
  const root = globalThis;
  const existing = root[key];
  if (existing === void 0) {
    const created = { version: 1, bySession: /* @__PURE__ */ new Map() };
    root[key] = created;
    return created;
  }
  if (!existing || typeof existing !== "object" || !("version" in existing) || existing.version !== 1 || !("bySession" in existing) || !(existing.bySession instanceof Map)) throw new Error("Malformed or unsupported required child extension registry.");
  return { version: 1, bySession: existing.bySession };
}
function registerRequiredChildExtensions(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "sessionId" && key !== "extensions" && key !== "requireForAllRunners")) throw new Error("Required child extension registration accepts only sessionId, extensions, and requireForAllRunners.");
  if (typeof input.sessionId !== "string" || !input.sessionId || input.sessionId.trim() !== input.sessionId || input.sessionId.length > 256 || input.sessionId.includes("\0")) throw new Error("Required child extension registration requires a non-empty trimmed sessionId of at most 256 characters without NUL.");
  if (input.requireForAllRunners !== void 0 && typeof input.requireForAllRunners !== "boolean") throw new Error("Required child extension registration requireForAllRunners must be a boolean.");
  const canonical = snapshotRequiredChildExtensions(input.extensions, "Required child extensions", true);
  const frozen = input.requireForAllRunners ? Object.freeze(canonical.map((entry) => Object.freeze({ ...entry, requireForAllRunners: true }))) : canonical;
  const store = registry();
  if (store.bySession.has(input.sessionId)) throw new Error(`Required child extensions are already registered for session '${input.sessionId}'; dispose them first.`);
  store.bySession.set(input.sessionId, frozen);
  return { dispose() {
    if (store.bySession.get(input.sessionId) === frozen) store.bySession.delete(input.sessionId);
  } };
}
function resolveRequiredChildExtensions(sessionId) {
  if (!sessionId) return EMPTY_SNAPSHOT;
  return registry().bySession.get(sessionId) ?? EMPTY_SNAPSHOT;
}
function assertRequiredChildExtensionsAdmitted(snapshots, launch) {
  const ids = [...new Set(snapshots.flatMap((snapshot) => snapshot ?? []).filter((entry) => entry.requireForAllRunners).map((entry) => entry.id))];
  if (ids.length === 0) return;
  const route = launch.machine ? `machine '${launch.machine}'` : launch.runnerType !== void 0 && launch.runnerType !== "pi" ? `runner.type='${launch.runnerType}'` : void 0;
  if (route) throw new Error(`Agent '${launch.agent}' cannot run on ${route}: the host requires child extensions (${ids.join(", ")}) for every runner, and only local native Pi children load them.`);
}
function hasMandatoryRequiredChildExtensions(snapshot) {
  return snapshot?.some((entry) => entry.requireForAllRunners) === true;
}
var RETAINED_FILE = "required-child-extensions.json";
function writeRetainedRequiredChildExtensions(asyncDir, snapshot) {
  if (!hasMandatoryRequiredChildExtensions(snapshot)) return;
  fs.writeFileSync(path.join(asyncDir, RETAINED_FILE), `${JSON.stringify(snapshot)}
`, { mode: 384 });
}
function readRetainedRequiredChildExtensions(asyncDir) {
  const filePath = path.join(asyncDir, RETAINED_FILE);
  if (!fs.existsSync(filePath)) return void 0;
  return snapshotRequiredChildExtensions(JSON.parse(fs.readFileSync(filePath, "utf-8")), "Retained required child extensions");
}

export {
  snapshotRequiredChildExtensions,
  registerRequiredChildExtensions,
  resolveRequiredChildExtensions,
  assertRequiredChildExtensionsAdmitted,
  hasMandatoryRequiredChildExtensions,
  writeRetainedRequiredChildExtensions,
  readRetainedRequiredChildExtensions
};
