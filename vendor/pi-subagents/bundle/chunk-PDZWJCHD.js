import {
  REX_BUNDLE_BIN,
  REX_CALL_TIMEOUT_MS,
  REX_EXIT_GONE,
  REX_EXIT_UNREACHABLE,
  REX_MAX_OUTPUT,
  connectHerdrMachine,
  isRexLocalMachine,
  remoteShellCommand,
  resolveRexBinary,
  rexCommandEnv,
  rexGlobalArgs,
  runBoundedCommand,
  sshMachineAccess
} from "./chunk-RMQFMMAT.js";
import {
  package_default
} from "./chunk-UTT254JE.js";
import {
  HERDR_PI_MODE_ENV,
  HERDR_PI_PROTOCOL,
  HERDR_PI_RUNTIME_DIR_ENV,
  HERDR_PI_RUN_ENV,
  HerdrPiFrameDecoder,
  encodeHerdrPiFrame,
  validateHerdrPiRunId
} from "./chunk-4QFZZV3O.js";
import {
  getAgentDir,
  getPiSpawnCommand
} from "./chunk-CIZQXJ5Q.js";
import "./chunk-5LFLVSTM.js";
import "./chunk-YFCK7H2S.js";
import "./chunk-Z7KVHQHL.js";

// src/runs/shared/herdr-placed-run.ts
import { randomBytes as randomBytes2 } from "node:crypto";
import * as fs3 from "node:fs";
import * as net from "node:net";
import * as path5 from "node:path";

// src/runs/shared/herdr-pane-host.ts
import { createHash as createHash2 } from "node:crypto";

// src/runs/shared/placed-run-owner.ts
import * as fs from "node:fs";
import * as path from "node:path";
var PLACED_MANIFEST_READ_SCRIPT = 'p="$1/manifest.json"; test -f "$p" && test ! -L "$p" && cat "$p"';
async function discoverPlacedBridgeManifest(access, runId, runtimeDir, missing = "The placed Pi's pi-subagents bridge manifest is not in its runtime directory; the Pi may have exited.") {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await access.runAsync(access.shellCommand(PLACED_MANIFEST_READ_SCRIPT, [runtimeDir]), { timeout: 5e3, maxBuffer: 64 * 1024 });
    if (result.error) throw new Error(`Remote bridge manifest discovery failed: ${result.error.message}`, { cause: result.error });
    if (result.status === 0 && result.stdout.trim()) {
      let value;
      try {
        value = JSON.parse(result.stdout);
      } catch {
        throw new Error("Remote bridge manifest is malformed.");
      }
      const p = value;
      if (p.runId !== runId || typeof p.socketPath !== "string" || path.posix.dirname(p.socketPath) !== runtimeDir || typeof p.nativeSessionId !== "string" || typeof p.packageVersion !== "string" || typeof p.protocol !== "number") throw new Error("Remote bridge manifest identity is incomplete or outside its owned runtime directory.");
      return { socketPath: p.socketPath, nativeSessionId: p.nativeSessionId, packageVersion: p.packageVersion, protocol: p.protocol };
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(missing);
}
async function createPlacedRuntimeDir(access, runId) {
  const result = await access.runAsync(access.shellCommand('umask 077; mktemp -d "${TMPDIR:-/tmp}/pi-subagents-herdr-$1-XXXXXXXX"', [runId]), { timeout: 1e4, maxBuffer: 4096 });
  if (result.error) throw new Error(`Could not provision a run-private remote bridge runtime directory: ${result.error.message}`, { cause: result.error });
  const value = result.stdout.trim();
  if (result.status !== 0 || !path.posix.isAbsolute(value) || value.includes("\n")) throw new Error("Could not provision a run-private remote bridge runtime directory.");
  return value;
}
function removePlacedRuntimeDir(access, runtimeDir) {
  const result = access.run(access.shellCommand('p=$1; case "${p##*/}" in pi-subagents-herdr-*) test -d "$p" && test ! -L "$p" && rm -rf -- "$p";; *) exit 64;; esac', [runtimeDir]), { timeout: 1e4, maxBuffer: 4096 });
  if (result.status !== 0 || result.stdout) throw new Error(`Could not remove the exact owned remote runtime directory: ${String(result.stderr).slice(0, 512)}`);
}
var PlacedRunOwner = class {
  machine;
  runId;
  runtimeDir;
  connection;
  host;
  access;
  owned;
  terminalId;
  agentName;
  startedArgv;
  identity;
  #unsubscribe = () => {
  };
  #snapshot = { connection: "connected", state: "ready", revision: 0 };
  #cleanupPromise;
  #removeRuntime;
  constructor(machine, runId, runtimeDir, connection, host, access, removeRuntime = () => removePlacedRuntimeDir(access, runtimeDir)) {
    this.machine = machine;
    this.runId = runId;
    this.runtimeDir = runtimeDir;
    this.connection = connection;
    this.#removeRuntime = removeRuntime;
    this.host = host;
    this.access = access;
  }
  observeEvent(event) {
    const data = this.host.paneEvent(event, this.#snapshot.state);
    if (data && (!this.terminalId || data.terminalId === this.terminalId || data.paneId === this.owned?.paneId)) this.#snapshot = { ...this.#snapshot, revision: this.#snapshot.revision + 1, state: data.state };
  }
  markConnectionUnknown(observed) {
    if (this.connection !== observed) return false;
    this.#snapshot = { ...this.#snapshot, connection: "unknown", state: "unknown", revision: this.#snapshot.revision + 1 };
    return true;
  }
  async subscribe(listener, disconnected) {
    const observed = this.connection, paneId = this.owned?.paneId;
    let adopted = false, candidateLost;
    if (!paneId) throw new Error("Herdr status subscription requires a provisioned pane.");
    const unsubscribe = await this.host.subscribe(observed, paneId, (event) => {
      this.observeEvent(event);
      listener(event);
    }, (error) => {
      if (!adopted) {
        candidateLost ??= error;
        return;
      }
      if (!this.markConnectionUnknown(observed)) return;
      disconnected(error);
    });
    if (candidateLost) {
      unsubscribe();
      throw candidateLost;
    }
    this.#unsubscribe = unsubscribe;
    adopted = true;
  }
  /** Create the owned pane and start the agent in one host step; onPane runs once the pane exists and before the agent starts. */
  async launch(request, onPane, options = {}) {
    const { owned, terminalId } = await this.host.launch(this.connection, this.machine, this.runId, this.runtimeDir, request, async (pane) => {
      this.owned = pane;
      await onPane(pane);
    }, options), argv = [request.kind, ...request.args];
    this.agentName = request.name;
    this.terminalId = terminalId;
    this.startedArgv = argv;
    return { owned, terminalId, argv };
  }
  journal(identity) {
    this.identity = identity;
    this.#snapshot = { ...this.#snapshot, identity };
    const journalDir = path.join(getAgentDir(), "pi-subagents", "herdr-run-journal");
    fs.mkdirSync(journalDir, { recursive: true, mode: 448 });
    fs.writeFileSync(path.join(journalDir, `${this.runId}.json`), JSON.stringify({ version: 1, identity, state: "ready", updatedAt: Date.now() }), { mode: 384, flag: "wx" });
  }
  get snapshot() {
    return this.#snapshot;
  }
  runRemote(command, options = {}) {
    return this.access.run(command, options);
  }
  async replaceConnection(input) {
    const oldConnection = this.connection, oldUnsubscribe = this.#unsubscribe;
    this.connection = input.connection;
    this.#unsubscribe = input.unsubscribe;
    if (this.identity) this.identity = { ...this.identity, paneId: input.paneId };
    this.#snapshot = { connection: "connected", state: input.state, identity: this.identity, revision: this.#snapshot.revision + 1 };
    oldUnsubscribe();
    await oldConnection.close();
  }
  cleanup(closeStartedPane = true) {
    return this.#cleanupPromise ??= this.#performCleanup(closeStartedPane);
  }
  async #performCleanup(closeStartedPane) {
    let failure;
    try {
      if (closeStartedPane && this.owned) await this.host.closeOwnedPane(this.connection, this.owned, this.terminalId, this.agentName);
    } catch (error) {
      failure = error;
    }
    try {
      this.#unsubscribe();
      await this.connection.close();
      this.#removeRuntime();
    } catch (error) {
      failure ??= error;
    }
    this.#snapshot = { ...this.#snapshot, connection: "closed", revision: this.#snapshot.revision + 1 };
    if (failure) throw failure;
  }
};

// src/runs/shared/placement-host.ts
import { createHash, randomBytes } from "node:crypto";
import * as fs2 from "node:fs";
import * as path2 from "node:path";
var HERDR_ALLOCATION_LOCK_TIMEOUT_MS = 1e4;
var HERDR_ALLOCATION_LOCK_POLL_MS = 25;
function herdrPaneAllocationKey(target, session, cwd) {
  return JSON.stringify([target, session, cwd]);
}
function assertPrivateDir(directory) {
  const stat = fs2.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 511) !== 448 || typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error("Herdr allocation path is not a mode-0700 agent-private owned directory.");
}
function ensurePrivateChild(parent, name) {
  const directory = path2.join(parent, name);
  try {
    fs2.mkdirSync(directory, { mode: 448 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  assertPrivateDir(directory);
  return directory;
}
function allocationLockRoot() {
  const agentDir = getAgentDir();
  fs2.mkdirSync(agentDir, { recursive: true, mode: 448 });
  assertPrivateDir(agentDir);
  const packageDir = ensurePrivateChild(agentDir, "pi-subagents");
  return ensurePrivateChild(packageDir, "herdr-allocation-locks");
}
function livePid(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
function readAllocationOwner(ownerPath) {
  const descriptor = fs2.openSync(ownerPath, fs2.constants.O_RDONLY | (fs2.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs2.fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 511) !== 384 || typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error("Herdr allocation lock owner record is unsafe.");
    const value = JSON.parse(fs2.readFileSync(descriptor, "utf8"));
    if (typeof value.pid !== "number" || !Number.isSafeInteger(value.pid) || value.pid <= 0 || typeof value.token !== "string" || !/^[a-f0-9]{32}$/u.test(value.token)) throw new Error("Herdr allocation lock owner record is malformed.");
    return { pid: value.pid, token: value.token, dev: stat.dev, ino: stat.ino };
  } finally {
    fs2.closeSync(descriptor);
  }
}
function sameOwner(left, right) {
  return left.token === right.token && left.dev === right.dev && left.ino === right.ino;
}
async function withHerdrPaneAllocationLock(key, action, options = {}) {
  const root = allocationLockRoot(), digest = createHash("sha256").update(key).digest("hex"), lockPath = path2.join(root, `${digest}.lock`), recoveryPath = path2.join(root, `${digest}.recovery`), token = randomBytes(16).toString("hex"), tempPath = path2.join(root, `.${digest}.${token}.tmp`), deadline = Date.now() + (options.timeoutMs ?? HERDR_ALLOCATION_LOCK_TIMEOUT_MS);
  let published;
  try {
    fs2.writeFileSync(tempPath, JSON.stringify({ pid: process.pid, token, createdAt: Date.now() }), { mode: 384, flag: "wx" });
    const tempOwner = readAllocationOwner(tempPath);
    for (; ; ) {
      let recovering = false;
      try {
        readAllocationOwner(recoveryPath);
        recovering = true;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (!recovering) {
        let linked = false;
        try {
          fs2.linkSync(tempPath, lockPath);
          linked = true;
          try {
            readAllocationOwner(recoveryPath);
            const current = readAllocationOwner(lockPath);
            if (!sameOwner(current, tempOwner)) throw new Error("Herdr allocation lock changed during publication.");
            fs2.unlinkSync(lockPath);
          } catch (recoveryError) {
            if (recoveryError.code !== "ENOENT") throw recoveryError;
            published = readAllocationOwner(lockPath);
            if (!sameOwner(published, tempOwner)) throw new Error("Herdr allocation lock publication identity changed.");
            break;
          }
        } catch (publishError) {
          if (linked) {
            try {
              const current = readAllocationOwner(lockPath);
              if (sameOwner(current, tempOwner)) fs2.unlinkSync(lockPath);
            } catch {
            }
          }
          if (publishError.code !== "EEXIST" && publishError.code !== "ENOENT") throw publishError;
        }
      }
      if (published) break;
      try {
        const current = readAllocationOwner(lockPath);
        if (!livePid(current.pid)) {
          let claimed = false;
          try {
            fs2.linkSync(lockPath, recoveryPath);
            claimed = true;
            const recovery = readAllocationOwner(recoveryPath), latest = readAllocationOwner(lockPath);
            if (!sameOwner(recovery, current) || !sameOwner(latest, current)) throw new Error("Herdr stale lock identity changed during recovery.");
            fs2.unlinkSync(lockPath);
          } catch (error) {
            if (error.code !== "EEXIST" && error.code !== "ENOENT") throw error;
          } finally {
            if (claimed) fs2.unlinkSync(recoveryPath);
          }
          if (claimed) continue;
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (Date.now() >= deadline) throw new Error("Timed out waiting for the Herdr pane allocation lock.");
      await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? HERDR_ALLOCATION_LOCK_POLL_MS));
    }
    fs2.unlinkSync(tempPath);
    let value, actionError, releaseError, actionFailed = false, releaseFailed = false;
    try {
      value = await action();
    } catch (error) {
      actionFailed = true;
      actionError = error;
    }
    try {
      const current = readAllocationOwner(lockPath);
      if (!published || !sameOwner(current, published)) throw new Error("Herdr pane allocation lock ownership changed before release.");
      fs2.unlinkSync(lockPath);
    } catch (error) {
      releaseFailed = true;
      releaseError = error;
    }
    if (actionFailed && releaseFailed) throw new AggregateError([actionError, releaseError], "Herdr pane allocation action and release both failed.", { cause: actionError });
    if (actionFailed) throw actionError;
    if (releaseFailed) throw releaseError;
    return value;
  } finally {
    try {
      fs2.unlinkSync(tempPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

// src/runs/shared/herdr-pane-host.ts
function herdrRunState(status, fallback = "unknown") {
  return status === "working" ? "working" : status === "blocked" ? "blocked" : status === "idle" || status === "done" ? "settled" : status === "unknown" ? "unknown" : fallback;
}
function herdrStatusSubscriptions(paneId) {
  return [{ type: "pane.agent_status_changed", pane_id: paneId }, { type: "pane.closed" }, { type: "pane.moved" }];
}
function reconcileHerdrPlacedRun(identity, candidate, proveEvidence) {
  if (candidate.endpoint.session !== identity.session) return { ok: false, reason: "Herdr session changed during reconnect." };
  const matches = candidate.agents.filter((agent) => agent.terminal_id === identity.terminalId);
  if (matches.length !== 1 || typeof matches[0].pane_id !== "string") return { ok: false, reason: matches.length ? "Terminal identity is ambiguous." : "Owned terminal is missing." };
  const proof = proveEvidence();
  if (!proof.ok) return proof;
  return { ok: true, state: herdrRunState(matches[0].agent_status), paneId: matches[0].pane_id, cursor: proof.cursor };
}
function idOf(value, key) {
  const found = value && typeof value === "object" ? value[key] : void 0;
  if (typeof found !== "string" || !found) throw new Error(`Herdr did not return ${key}.`);
  return found;
}
function list(value, key) {
  if (Array.isArray(value)) return value;
  const found = value && typeof value === "object" ? value[key] : void 0;
  return Array.isArray(found) ? found : [];
}
function tagged(value, type, key) {
  if (!value || typeof value !== "object" || value.type !== type || !(key in value) || typeof value[key] !== "object") throw new Error(`Herdr returned an invalid ${type} envelope.`);
  return value[key];
}
function parseHerdrCreated(value, type) {
  const envelope = value;
  if (envelope?.type !== type) throw new Error(`Herdr returned an invalid ${type} envelope.`);
  const tab = envelope.tab;
  const pane = envelope.root_pane;
  return { ...type === "workspace_created" ? { workspaceId: idOf(envelope.workspace, "workspace_id") } : {}, tabId: idOf(tab, "tab_id"), paneId: idOf(pane, "pane_id") };
}
function parseHerdrAgent(value, type) {
  return tagged(value, type, "agent");
}
function parseHerdrSessionSnapshot(value) {
  return tagged(value, "session_snapshot", "snapshot");
}
function ownsHerdrPane(agent, terminalId, paneId) {
  return agent.terminal_id === terminalId && agent.pane_id === paneId;
}
function snapshotAgents(snapshot) {
  return list(snapshot, "agents").filter((agent) => Boolean(agent && typeof agent === "object")).map((agent) => ({ terminal_id: typeof agent.terminal_id === "string" ? agent.terminal_id : void 0, pane_id: typeof agent.pane_id === "string" ? agent.pane_id : void 0, agent_status: typeof agent.agent_status === "string" ? agent.agent_status : void 0 }));
}
var HERDR_MAX_OWNED_PANES = 20;
async function provisionHerdrPane(client, cwd, runId, runtimeDir, environment, allocationKey = cwd) {
  return withHerdrPaneAllocationLock(allocationKey, async () => {
    const snapshot = parseHerdrSessionSnapshot(await client.call("session.snapshot"));
    const panes = list(snapshot, "panes").filter((item) => Boolean(item && typeof item === "object")), workspaces = list(snapshot, "workspaces").filter((item) => Boolean(item && typeof item === "object"));
    const ownedLabel = `pi-subagents-${createHash2("sha256").update(cwd).digest("hex").slice(0, 10)}`, owned = workspaces.filter((item) => item.label === ownedLabel);
    if (owned.length > 1) throw new Error("Herdr deterministic owned workspace identity is ambiguous.");
    const cwdWorkspaceIds = new Set(panes.filter((item) => item.cwd === cwd || item.foreground_cwd === cwd).map((item) => item.workspace_id).filter((id) => typeof id === "string")), cwdWorkspaces = workspaces.filter((item) => typeof item.workspace_id === "string" && cwdWorkspaceIds.has(item.workspace_id));
    const selected = owned[0] ?? (cwdWorkspaces.length === 1 ? cwdWorkspaces[0] : void 0), selectedId = selected ? idOf(selected, "workspace_id") : void 0, actual = selectedId ? panes.filter((pane) => pane.workspace_id === selectedId).length : 0;
    if (actual >= HERDR_MAX_OWNED_PANES) throw new Error(`Herdr workspace pane limit of ${HERDR_MAX_OWNED_PANES} is reached; close an existing pane before launching another placed run.`);
    const env = environment ?? { [HERDR_PI_MODE_ENV]: "1", [HERDR_PI_RUN_ENV]: runId, [HERDR_PI_RUNTIME_DIR_ENV]: runtimeDir };
    if (selectedId) {
      const tab = parseHerdrCreated(await client.call("tab.create", { workspace_id: selectedId, cwd, label: `subagent-${runId.slice(-8)}`, env, focus: false }), "tab_created");
      return { workspaceId: selectedId, tabId: tab.tabId, paneId: tab.paneId };
    }
    const workspace = parseHerdrCreated(await client.call("workspace.create", { cwd, label: ownedLabel, env, focus: false }), "workspace_created");
    return { workspaceId: workspace.workspaceId, tabId: workspace.tabId, paneId: workspace.paneId };
  });
}
function provisionHerdrOwnedPane(connection, machine, runId, runtimeDir, environment) {
  return provisionHerdrPane(connection.client, machine.cwd, runId, runtimeDir, environment, herdrPaneAllocationKey(machine.target, connection.endpoint.session, machine.cwd));
}
function asHerdrMachine(machine) {
  if (machine.provider !== "herdr") throw new Error("The Herdr pane host only places runs on Herdr saved machines.");
  return machine;
}
async function startHerdrAgent(connection, owned, kind, name, args, options = {}) {
  const clock = options.clock ?? { now: () => Date.now(), wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }, deadline = clock.now() + (options.timeoutMs ?? 5e3), pollMs = options.pollMs ?? 50;
  let response;
  for (; ; ) {
    try {
      response = await connection.client.call("agent.start", { name, kind, pane_id: owned.paneId, args, timeout_ms: 45e3 }, 6e4);
      break;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("is not an available shell")) throw error;
      const pane = tagged(await connection.client.call("pane.get", { pane_id: owned.paneId }), "pane_info", "pane");
      if (pane.pane_id !== owned.paneId || pane.workspace_id !== owned.workspaceId || pane.tab_id !== owned.tabId) throw new Error("Herdr startup pane identity changed after a transient start rejection.", { cause: error });
      if (pane.agent != null || pane.agent_session != null) throw new Error("Herdr startup pane became occupied after a transient start rejection.", { cause: error });
      if (clock.now() >= deadline) throw new Error("Herdr owned pane remained unavailable until the startup deadline.", { cause: error });
      await clock.wait(Math.min(pollMs, deadline - clock.now()));
    }
  }
  const started = parseHerdrAgent(response, "agent_started"), terminalId = idOf(started, "terminal_id"), paneId = idOf(started, "pane_id");
  if (paneId !== owned.paneId) throw new Error("Herdr started the native agent in an unexpected pane.");
  return { terminalId, paneId };
}
async function closeOwnedHerdrPane(connection, owned, terminalId, agentName) {
  let closed = false;
  if (terminalId && agentName) {
    const current = parseHerdrAgent(await connection.client.call("agent.get", { target: agentName }), "agent_info");
    if (ownsHerdrPane(current, terminalId, owned.paneId)) {
      await connection.client.call("pane.close", { pane_id: owned.paneId });
      closed = true;
    }
  }
  if (!closed) {
    const snapshot = parseHerdrSessionSnapshot(await connection.client.call("session.snapshot"));
    const occupants = snapshotAgents(snapshot).filter((agent) => agent.pane_id === owned.paneId);
    if (occupants.length !== 0) throw new Error("Refusing cleanup because startup pane ownership is uncertain.");
    await connection.client.call("pane.close", { pane_id: owned.paneId });
  }
}
var herdrPaneHost = {
  connect(machine) {
    return connectHerdrMachine(asHerdrMachine(machine));
  },
  sessionOf(connection) {
    return connection.endpoint.session;
  },
  async launch(connection, machine, runId, runtimeDir, request, onPane, options) {
    const owned = await provisionHerdrOwnedPane(connection, asHerdrMachine(machine), runId, runtimeDir, request.environment);
    await onPane(owned);
    const { terminalId } = await startHerdrAgent(connection, owned, request.kind, request.name, request.args, options);
    return { owned, terminalId };
  },
  async prompt(connection, identity, text) {
    await connection.client.call("agent.prompt", { target: identity.agentName, text });
  },
  subscribe(connection, paneId, listener, onDisconnect) {
    return connection.client.subscribe(herdrStatusSubscriptions(paneId), listener, onDisconnect);
  },
  paneEvent(event, fallback) {
    const data = event && typeof event === "object" ? event.data : void 0;
    return data ? { terminalId: data.terminal_id, paneId: data.pane_id, state: herdrRunState(data.agent_status, fallback) } : void 0;
  },
  async panes(connection) {
    return { endpoint: connection.endpoint, agents: snapshotAgents(parseHerdrSessionSnapshot(await connection.client.call("session.snapshot"))) };
  },
  reconcile: reconcileHerdrPlacedRun,
  closeOwnedPane: closeOwnedHerdrPane
};
function createRemoteRuntimeDir(machine, runId, options = {}) {
  return createPlacedRuntimeDir(sshMachineAccess(machine, options), runId);
}
function removeRemoteRuntimeDir(machine, runtimeDir, options = {}) {
  removePlacedRuntimeDir(sshMachineAccess(machine, options), runtimeDir);
}
var HerdrPlacedRunOwner = class _HerdrPlacedRunOwner extends PlacedRunOwner {
  constructor(machine, runId, runtimeDir, connection, removeRuntime) {
    super(machine, runId, runtimeDir, connection, herdrPaneHost, sshMachineAccess(machine), removeRuntime);
  }
  static async create(machine, runId, beforePane) {
    const runtimeDir = await createRemoteRuntimeDir(machine, runId);
    let connection;
    try {
      connection = await herdrPaneHost.connect(machine);
      const owner = new _HerdrPlacedRunOwner(machine, runId, runtimeDir, connection);
      await beforePane?.(owner);
      return owner;
    } catch (error) {
      const cleanupErrors = [];
      try {
        await connection?.close();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      try {
        removeRemoteRuntimeDir(machine, runtimeDir);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], "Herdr owner creation failed and cleanup also failed.", { cause: error });
      throw error;
    }
  }
  async provision(environment) {
    this.owned = await provisionHerdrOwnedPane(this.connection, this.machine, this.runId, this.runtimeDir, environment);
    return this.owned;
  }
  async start(kind, name, args, options = {}) {
    if (!this.owned) throw new Error("Herdr placement owner has not provisioned its pane.");
    const { terminalId, paneId } = await startHerdrAgent(this.connection, this.owned, kind, name, args, options), argv = [kind, ...args];
    this.agentName = name;
    this.terminalId = terminalId;
    this.startedArgv = argv;
    return { terminalId, paneId, argv };
  }
};

// src/runs/shared/rex-pane-host.ts
import { createHash as createHash3 } from "node:crypto";
import * as path4 from "node:path";
import { Type } from "typebox";
import { Compile } from "typebox/compile";

// src/runs/shared/local-machine-access.ts
import { spawnSync } from "node:child_process";
import * as path3 from "node:path";
var DEFAULT_TIMEOUT_MS = 15e3;
var DEFAULT_MAX_BUFFER = 256 * 1024;
function localSockets() {
  return {
    async forwardRemoteSocket(socketPath) {
      if (!path3.isAbsolute(socketPath)) throw new Error("Local socket path must be absolute.");
      return { socketPath, async close() {
      } };
    },
    async close() {
    }
  };
}
function localMachineAccess(options = {}) {
  const env = options.env ?? process.env;
  return {
    shellCommand: remoteShellCommand,
    run(command, limits = {}) {
      const spawned = spawnSync("/bin/sh", ["-c", command], { encoding: "utf8", env, timeout: limits.timeout ?? DEFAULT_TIMEOUT_MS, maxBuffer: limits.maxBuffer ?? DEFAULT_MAX_BUFFER, windowsHide: true });
      const result = { status: spawned.status, stdout: spawned.stdout ?? "", stderr: spawned.stderr ?? "" };
      if (spawned.error) result.error = spawned.error;
      return result;
    },
    runAsync: (command, limits = {}) => runBoundedCommand("/bin/sh", ["-c", command], { env, ...limits }),
    openSockets: localSockets
  };
}

// src/runs/shared/rex-pane-host.ts
var REX_CLOSE_POLLS = 20;
var REX_CLOSE_POLL_MS = 50;
var REX_SSH_SESSION_LABEL = "subagents";
var sessionInspection = Compile(Type.Object({ session_id: Type.String() }));
var sessionList = Compile(Type.Object({ sessions: Type.Array(Type.Object({ session_id: Type.String(), label: Type.Optional(Type.String()) })) }));
var createdWindow = Compile(Type.Object({ window_id: Type.String(), block_ids: Type.Tuple([Type.String()]) }));
var sessionWindows = Compile(Type.Object({ windows: Type.Array(Type.Object({ window_id: Type.String(), label: Type.Optional(Type.String()), layers: Type.Array(Type.Object({ blocks: Type.Array(Type.Object({ block_id: Type.String() })) })) })) }));
var blockProcess = Compile(Type.Object({ foreground: Type.Object({ pid: Type.Integer() }) }));
var bridgeManifestPid = Compile(Type.Object({ pid: Type.Integer() }));
function rexAccess() {
  return localMachineAccess({ env: { ...rexCommandEnv(), TMPDIR: "/tmp" } });
}
function rexSshAccess(machine, access = sshMachineAccess(machine)) {
  return { ...access, shellCommand: (script, args) => remoteShellCommand(`TMPDIR=/tmp; export TMPDIR; ${script}`, args) };
}
function asRexMachine(machine) {
  if (machine.provider !== "rex") throw new Error("The Rex pane host only places runs on Rex machines.");
  return machine;
}
async function runRex(endpoint, args, what) {
  const result = await endpoint.access.runAsync(endpoint.access.shellCommand('exec /usr/bin/env -u REX_SESSION -u REX_BLOCK -u REX_SERVER "$@"', [endpoint.bin, ...rexGlobalArgs(endpoint.server), ...args]), { timeout: REX_CALL_TIMEOUT_MS, maxBuffer: REX_MAX_OUTPUT });
  if (result.error) throw new Error(`Rex ${what} failed: ${result.error.message}`, { cause: result.error });
  if (result.status === REX_EXIT_UNREACHABLE) throw new Error(`The Rex server is unreachable (rex ${what} exited 4); the placed pane's state is unknown.`);
  if (result.status === null) throw new Error(`Rex ${what} did not finish; the placed pane's state is unknown.`);
  return { ...result, status: result.status };
}
function requireRexSuccess(result, what) {
  if (result.status === REX_EXIT_GONE) throw new Error(`Rex ${what} failed because its target no longer exists (exit 3): ${result.stderr.trim().slice(0, 512)}`);
  if (result.status !== 0) throw new Error(`Rex ${what} exited with code ${result.status}: ${result.stderr.trim().slice(0, 512)}`);
}
function parseRexJson(text, validator, what) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`Rex ${what} returned malformed JSON.`);
  }
  return validator.Check(value) ? value : void 0;
}
async function resolveRemoteRexBinary(access, machine) {
  const script = `for c in "\${REX_BIN_DIR:+$REX_BIN_DIR/rex}" "$(command -v rex 2>/dev/null)" "$HOME/${REX_BUNDLE_BIN}"; do if [ -n "$c" ] && [ -f "$c" ] && [ -x "$c" ]; then printf '%s\\n' "$c"; exit 0; fi; done; exit 1`;
  const found = await access.runAsync(access.shellCommand(script), { timeout: REX_CALL_TIMEOUT_MS, maxBuffer: 64 * 1024 });
  if (found.error) throw new Error(`Could not look for the Rex CLI on ${machine.id}: ${found.error.message}`, { cause: found.error });
  const bin = found.stdout.trim();
  if (found.status !== 0 || !path4.posix.isAbsolute(bin) || bin.includes("\n")) throw new Error(`The Rex CLI was not found on ${machine.id}. Install Rex there or put rex on its PATH.`);
  return bin;
}
async function resolveRemoteCwd(access, machine) {
  const script = `case "$1" in "~") d=$HOME;; "~/"*) d=$HOME/\${1#"~/"};; *) d=$1;; esac; cd -P -- "$d" 2>/dev/null && pwd -P`;
  const resolved = await access.runAsync(access.shellCommand(script, [machine.cwd]), { timeout: REX_CALL_TIMEOUT_MS, maxBuffer: 64 * 1024 });
  if (resolved.error) throw new Error(`Could not check ${machine.cwd} on ${machine.id}: ${resolved.error.message}`, { cause: resolved.error });
  const cwd = resolved.stdout.trim();
  if (resolved.status !== 0 || !path4.posix.isAbsolute(cwd) || cwd.includes("\n")) throw new Error(`Nothing at ${machine.cwd} on ${machine.id}. Clone the repo there first; pi-subagents never clones, pulls, or checks out on a machine.`);
  return cwd;
}
async function resolveRemotePi(access, machine) {
  const found = await access.runAsync(access.shellCommand(`exec "\${SHELL:-/bin/sh}" -lc 'command -v pi'`), { timeout: REX_CALL_TIMEOUT_MS, maxBuffer: 64 * 1024 });
  if (found.error) throw new Error(`Could not look for Pi on ${machine.id}: ${found.error.message}`, { cause: found.error });
  const pi = found.stdout.trim().split("\n").at(-1)?.trim() ?? "";
  if (found.status !== 0 || !path4.posix.isAbsolute(pi)) throw new Error(`Pi was not found on ${machine.id}: its login shell has no pi on PATH. Install Pi there.`);
  return pi;
}
async function labeledSessions(endpoint) {
  const listed = await runRex(endpoint, ["ls", "--json"], "ls");
  requireRexSuccess(listed, "ls");
  const parsed = parseRexJson(listed.stdout, sessionList, "ls");
  if (!parsed) throw new Error("Rex ls did not list the server's sessions.");
  return parsed.sessions.filter((session) => session.label === REX_SSH_SESSION_LABEL).map((session) => session.session_id);
}
async function subagentsSession(endpoint, machine) {
  return withHerdrPaneAllocationLock(JSON.stringify(["rex-session", machine.target, REX_SSH_SESSION_LABEL]), async () => {
    let sessions = await labeledSessions(endpoint);
    if (sessions.length === 0) {
      requireRexSuccess(await runRex(endpoint, ["new", REX_SSH_SESSION_LABEL, "--json"], "new"), "new");
      sessions = await labeledSessions(endpoint);
    }
    const [session] = sessions;
    if (sessions.length > 1) throw new Error(`Rex on ${machine.id} has ${sessions.length} sessions labeled ${REX_SSH_SESSION_LABEL}; close or rename the extras so placed runs have one session to open in.`);
    if (!session) throw new Error(`Rex on ${machine.id} did not list the ${REX_SSH_SESSION_LABEL} session it just created.`);
    return session;
  });
}
async function connectRex(machine, options = {}) {
  const rex = asRexMachine(machine);
  let endpoint;
  if (isRexLocalMachine(rex)) {
    endpoint = { access: options.access ?? rexAccess(), bin: options.bin ?? resolveRexBinary(), session: rex.session };
    if (rex.server) endpoint.server = rex.server;
  } else {
    if (!options.session) throw new Error(`Rex machine '${rex.id}' has no recorded session; a placed run never picks one by label after launch.`);
    const access = options.access ?? rexSshAccess(rex);
    endpoint = { access, bin: options.bin ?? await resolveRemoteRexBinary(access, rex), session: options.session };
  }
  const inspected = await runRex(endpoint, ["session", "inspect", endpoint.session, "--json"], "session inspect");
  if (inspected.status === REX_EXIT_GONE) throw new Error(`Rex session ${endpoint.session} no longer exists on the Rex server.`);
  requireRexSuccess(inspected, "session inspect");
  if (parseRexJson(inspected.stdout, sessionInspection, "session inspect")?.session_id !== endpoint.session) throw new Error("Rex session identity changed: the server reported a different session id.");
  return { ...endpoint, ...endpoint.access.openSockets() };
}
async function inspectBlock(connection, blockId) {
  const inspected = await runRex(connection, ["block", "inspect", "-s", connection.session, blockId], "block inspect");
  if (inspected.status === REX_EXIT_GONE) return "gone";
  requireRexSuccess(inspected, "block inspect");
  return "present";
}
async function closeOwnedRexPane(connection, owned) {
  if (owned.workspaceId !== connection.session) throw new Error("Refusing Rex cleanup: the owned pane belongs to a different Rex session.");
  if (await inspectBlock(connection, owned.paneId) === "gone") return;
  const closed = await runRex(connection, ["block", "close", "-s", connection.session, owned.paneId], "block close");
  if (closed.status !== REX_EXIT_GONE) requireRexSuccess(closed, "block close");
  for (let poll = 0; poll < REX_CLOSE_POLLS; poll++) {
    if (await inspectBlock(connection, owned.paneId) === "gone") return;
    await new Promise((resolve) => setTimeout(resolve, REX_CLOSE_POLL_MS));
  }
  throw new Error(`Rex block ${owned.paneId} still exists after close; refusing to report the placed pane closed.`);
}
function reconcileRexPlacedRun(identity, candidate, proveEvidence) {
  if (!candidate.present) return { ok: false, reason: "Owned Rex block is gone." };
  if (candidate.foregroundPid === void 0 || candidate.foregroundPid !== candidate.bridgePid) return { ok: false, reason: "The owned Rex block's foreground process is not the placed Pi." };
  const proof = proveEvidence();
  if (!proof.ok) return proof;
  return { ok: true, state: "unknown", paneId: identity.paneId, cursor: proof.cursor };
}
async function readBridgePid(connection, runtimeDir) {
  const manifest = await connection.access.runAsync(connection.access.shellCommand(PLACED_MANIFEST_READ_SCRIPT, [runtimeDir]), { timeout: 5e3, maxBuffer: 64 * 1024 });
  if (manifest.status !== 0) return void 0;
  return parseRexJson(manifest.stdout, bridgeManifestPid, "bridge manifest")?.pid;
}
async function closeUntrackedRexWindow(connection, label, failure) {
  try {
    const inspected = await runRex(connection, ["session", "inspect", connection.session, "--json"], "session inspect");
    if (inspected.status === REX_EXIT_GONE) throw failure;
    requireRexSuccess(inspected, "session inspect");
    const windows = parseRexJson(inspected.stdout, sessionWindows, "session inspect")?.windows.filter((window) => window.label === label);
    if (!windows) throw new Error("Rex session inspect did not list the session's windows.");
    if (windows.length > 1) throw new Error(`The Rex session has ${windows.length} windows labeled ${label}; refusing to guess which one this run opened.`);
    for (const window of windows) for (const layer of window.layers) for (const block of layer.blocks) await closeOwnedRexPane(connection, { workspaceId: connection.session, tabId: window.window_id, paneId: block.block_id });
  } catch (cleanupError) {
    if (cleanupError === failure) throw failure;
    throw new AggregateError([failure, cleanupError], `Rex window new failed, and the window labeled ${label} that it may have opened could not be closed.`, { cause: failure });
  }
  throw failure;
}
async function openRexWindow(connection, label, cwd, argv) {
  try {
    const created = await runRex(connection, ["window", "new", "-s", connection.session, label, "-c", cwd, "--focus=false", "--json", "--", ...argv], "window new");
    requireRexSuccess(created, "window new");
    const window = parseRexJson(created.stdout, createdWindow, "window new");
    if (!window) throw new Error(`Rex window new did not return exactly one block: ${created.stdout.trim().slice(0, 512)}`);
    return window;
  } catch (error) {
    return closeUntrackedRexWindow(connection, label, error instanceof Error ? error : new Error(String(error)));
  }
}
var rexPaneHost = {
  connect: connectRex,
  sessionOf(connection) {
    return connection.session;
  },
  async launch(connection, machine, runId, _runtimeDir, request, onPane) {
    if (request.kind !== "pi") throw new Error("Rex supports native Pi children only.");
    const environment = Object.entries(request.environment ?? {});
    if (environment.some(([name]) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name))) throw new Error("Rex launch environment names must be shell variable names.");
    const rex = asRexMachine(machine);
    let pi;
    if (isRexLocalMachine(rex)) {
      pi = getPiSpawnCommand(request.args);
      if (!path4.isAbsolute(pi.command)) throw new Error("Rex placement needs an absolute Pi executable; set PI_SUBAGENT_PI_BINARY to the Pi binary path.");
    } else pi = { command: await resolveRemotePi(connection.access, rex), args: request.args };
    const window = await openRexWindow(connection, `subagent-${runId.slice(-8)}`, rex.cwd, ["/usr/bin/env", ...environment.map(([name, value]) => `${name}=${value}`), pi.command, ...pi.args]);
    const owned = { workspaceId: connection.session, tabId: window.window_id, paneId: window.block_ids[0] };
    await onPane(owned);
    return { owned, terminalId: owned.paneId };
  },
  async prompt(connection, identity, text) {
    requireRexSuccess(await runRex(connection, ["send", "-s", connection.session, "-b", identity.paneId, "--", text], "send"), "send");
    requireRexSuccess(await runRex(connection, ["send-key", "-s", connection.session, "-b", identity.paneId, "enter"], "send-key"), "send-key");
  },
  async subscribe() {
    return () => {
    };
  },
  paneEvent() {
    return void 0;
  },
  async panes(connection, identity) {
    const processInfo = await runRex(connection, ["block", "call", "-s", connection.session, "-b", identity.paneId, "process"], "block process");
    if (processInfo.status === REX_EXIT_GONE) return { present: false };
    requireRexSuccess(processInfo, "block process");
    const candidate = { present: true };
    const foregroundPid = parseRexJson(processInfo.stdout, blockProcess, "block process")?.foreground.pid;
    if (foregroundPid !== void 0) candidate.foregroundPid = foregroundPid;
    const bridgePid = await readBridgePid(connection, identity.runtimeDir);
    if (bridgePid !== void 0) candidate.bridgePid = bridgePid;
    return candidate;
  },
  reconcile: reconcileRexPlacedRun,
  closeOwnedPane: closeOwnedRexPane
};
function runtimeDirPresent(access, runtimeDir) {
  const result = access.run(access.shellCommand('test -e "$1" || test -L "$1"', [runtimeDir]), { timeout: 1e4, maxBuffer: 4096 });
  if (result.error) throw new Error(`Could not check the owned runtime directory: ${result.error.message}`, { cause: result.error });
  return result.status === 0;
}
function removeRexRuntimeDir(access, runtimeDir) {
  if (!runtimeDirPresent(access, runtimeDir)) return;
  try {
    removePlacedRuntimeDir(access, runtimeDir);
  } catch (error) {
    if (runtimeDirPresent(access, runtimeDir)) throw error;
  }
}
var RexPlacedRunOwner = class _RexPlacedRunOwner extends PlacedRunOwner {
  constructor(machine, runId, runtimeDir, connection, access, host) {
    super(machine, runId, runtimeDir, connection, host, access, () => removeRexRuntimeDir(access, runtimeDir));
  }
  /** A Rex SSH owner's machine carries the resolved remote cwd, and its host reconnects only to the session recorded here. */
  static async create(machine, runId, options = {}) {
    const hash = createHash3("sha256").update(runId).digest("hex").slice(0, 12);
    if (isRexLocalMachine(machine)) {
      const access2 = rexAccess(), runtimeDir2 = await createPlacedRuntimeDir(access2, hash);
      try {
        return new _RexPlacedRunOwner(machine, runId, runtimeDir2, await connectRex(machine, { access: access2 }), access2, rexPaneHost);
      } catch (error) {
        try {
          removeRexRuntimeDir(access2, runtimeDir2);
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], "Rex owner creation failed and runtime cleanup also failed.", { cause: error });
        }
        throw error;
      }
    }
    const access = rexSshAccess(machine, options.sshAccess), bin = await resolveRemoteRexBinary(access, machine);
    const placed = { ...machine, cwd: await resolveRemoteCwd(access, machine) };
    const session = await subagentsSession({ access, bin }, placed);
    const host = { ...rexPaneHost, connect: (target) => connectRex(target, { access, bin, session }) };
    const runtimeDir = await createPlacedRuntimeDir(access, hash);
    try {
      return new _RexPlacedRunOwner(placed, runId, runtimeDir, await host.connect(placed), access, host);
    } catch (error) {
      try {
        removeRexRuntimeDir(access, runtimeDir);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Rex owner creation failed and runtime cleanup also failed.", { cause: error });
      }
      throw error;
    }
  }
};

// src/runs/shared/herdr-placed-run.ts
function reconcileHerdrReconnect(identity, candidate, lastEvidenceCursor, host = herdrPaneHost) {
  return host.reconcile(identity, candidate, () => {
    const bridge = candidate.bridge;
    if (bridge.runId !== identity.runId || bridge.nativeSessionId !== identity.nativeSessionId || bridge.packageVersion !== package_default.version || bridge.protocol !== HERDR_PI_PROTOCOL) return { ok: false, reason: "Bridge run, package, protocol, or native session identity changed." };
    if (typeof bridge.evidenceCursor !== "number" || typeof bridge.evidenceFloor !== "number" || bridge.evidenceCursor < lastEvidenceCursor || bridge.evidenceFloor > lastEvidenceCursor + 1) return { ok: false, reason: "Bridge evidence has a gap after reconnect." };
    return { ok: true, cursor: bridge.evidenceCursor };
  });
}
async function boundedHerdrReconnect(identity, lastEvidenceCursor, attempt, options = {}) {
  const deadline = Date.now() + (options.deadlineMs ?? 15e3);
  let last = "Reconnect did not run.";
  for (let number = 1; number <= (options.attempts ?? 3) && Date.now() < deadline; number++) {
    if (options.disposed?.()) return { ok: false, reason: "Reconnect was disposed." };
    try {
      const result = reconcileHerdrReconnect(identity, await attempt(number), lastEvidenceCursor, options.host);
      if (result.ok) return result;
      last = result.reason;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(number * 100, Math.max(0, deadline - Date.now()))));
  }
  return { ok: false, reason: last };
}
function safeRunId(value) {
  const prefix = value?.replace(/[^A-Za-z0-9_-]/gu, "_").slice(0, 48) ?? "run";
  return validateHerdrPiRunId(`${prefix}_${randomBytes2(8).toString("hex")}`);
}
function serializeHerdrPiLaunch(launch) {
  if (launch.storage.kind === "file") throw new Error("Pane-native remote Pi does not support fork, resume, or revival; use fresh context.");
  if (launch.extensionPaths.length || launch.requiredExtensions?.length) throw new Error("Pane-native remote Pi cannot transfer local extension paths; install/configure pi-subagents on the remote machine.");
  if (launch.processEnv && Object.values(launch.processEnv).some((value) => value !== void 0 && value !== "__none__")) throw new Error("Pane-native remote Pi cannot transfer local bindings, MCP selections, or process environment.");
  if (launch.runtime.nestedRoute || launch.runtime.fanoutChild || launch.runtime.depth > 1) throw new Error("Nested delegation from a pane-native remote Pi is not supported.");
  if (launch.excludeTools?.length || launch.runtime.permissions || launch.runtime.toolBudget || launch.runtime.requiredExtensions || launch.runtime.requiredTools?.length || launch.runtime.mcpDirectTools?.length) throw new Error("Pane-native remote Pi cannot yet represent exclusions, permission rules, tool budgets, MCP direct tools, or required-tool/extension contracts; remove machine placement.");
  const resources = launch.remoteResources;
  if (!resources || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(resources.agent) || resources.skills?.some((name) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(name)) || resources.toolCeiling?.some((name) => !/^[A-Za-z0-9_-]{1,64}$/u.test(name)) || resources.reads !== void 0 && resources.reads !== false && resources.reads.some((read) => typeof read !== "string" || Buffer.byteLength(read) > 4096)) throw new Error("Pane-native remote resources require bounded logical agent, skill, tool, and read names.");
  const args = [];
  if (launch.noSkills) args.push("--no-skills", "--no-prompt-templates");
  if (launch.noContextFiles) args.push("--no-context-files");
  if (launch.model) args.push("--model", launch.model);
  return { args, resources: { agent: resources.agent, ...resources.skills ? { skills: [...resources.skills] } : {}, ...resources.toolCeiling ? { toolCeiling: [...resources.toolCeiling] } : {}, ...resources.reads !== void 0 ? { reads: resources.reads === false ? false : [...resources.reads] } : {} } };
}
var BridgeChannel = class {
  socket;
  decoder = new HerdrPiFrameDecoder();
  listeners = /* @__PURE__ */ new Set();
  waiters = /* @__PURE__ */ new Map();
  runId;
  frames = [];
  failure;
  #rejectFailure;
  #failed = false;
  #adopted = false;
  constructor(socketPath, runId) {
    this.runId = runId;
    this.failure = new Promise((_resolve, reject) => {
      this.#rejectFailure = reject;
    });
    this.failure.catch(() => {
    });
    this.socket = net.createConnection(socketPath);
    this.socket.on("data", (chunk) => {
      try {
        for (const frame of this.decoder.push(chunk)) {
          if (frame.runId !== runId) throw new Error("Bridge run identity mismatch.");
          if (!this.#adopted) {
            this.frames.push(frame);
            if (this.frames.length > 1024) throw new Error("Bridge replay queue exceeded its bound.");
          }
          const key = typeof frame.requestId === "string" ? `${frame.type}:${frame.requestId}` : "";
          const waiter = this.waiters.get(key);
          if (waiter) {
            this.waiters.delete(key);
            waiter.resolve(frame);
          }
          for (const listener of this.listeners) listener(frame);
        }
      } catch (error) {
        this.fail(error);
      }
    });
    this.socket.on("error", (error) => this.fail(error));
    this.socket.on("close", () => {
      if (!this.#failed) this.fail(new Error("Remote Pi bridge connection was lost; task state is unknown."));
    });
  }
  fail(error) {
    if (this.#failed) return;
    this.#failed = true;
    this.#rejectFailure(error);
    for (const waiter of this.waiters.values()) waiter.reject(error);
    this.waiters.clear();
  }
  get failed() {
    return this.#failed;
  }
  adopt(listener) {
    this.#adopted = true;
    this.listeners.add(listener);
    return this.frames.splice(0);
  }
  wait(type, requestId) {
    return new Promise((resolve, reject) => this.waiters.set(`${type}:${requestId}`, { resolve, reject }));
  }
  configure(resources) {
    const requestId = `cfg_${randomBytes2(6).toString("hex")}`;
    const waiting = this.wait("configured", requestId);
    this.socket.write(encodeHerdrPiFrame({ protocol: HERDR_PI_PROTOCOL, runId: this.runId, type: "configure", requestId, resources }));
    return waiting;
  }
  supervisorDelivered(requestId) {
    this.socket.write(encodeHerdrPiFrame({ protocol: HERDR_PI_PROTOCOL, runId: this.runId, type: "supervisor-delivered", requestId }));
  }
  prepare(requestId, operation, text, supervisorId, supervisorError) {
    const waiting = this.wait("prepared", requestId);
    this.socket.write(encodeHerdrPiFrame({ protocol: HERDR_PI_PROTOCOL, runId: this.runId, type: "prepare", requestId, operation, ...text !== void 0 ? { text } : {}, ...supervisorId ? { supervisorId } : {}, ...supervisorError !== void 0 ? { error: supervisorError } : {} }));
    return waiting;
  }
  close() {
    this.socket.destroy();
  }
};
function waitForReadyBridgeFrame(bridge, timeoutMs, timeoutMessage, configured = false) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    const listener = (frame) => {
      if (frame.type !== "ready" || configured && frame.configured !== true) return;
      clearTimeout(timer);
      bridge.listeners.delete(listener);
      resolve(frame);
    };
    bridge.listeners.add(listener);
  });
}
var HerdrPiSession = class {
  #listeners = /* @__PURE__ */ new Set();
  #messages = [];
  #sequence = 0;
  #disposed = false;
  #aborted = false;
  #initialGit;
  #finalGit;
  #operations = /* @__PURE__ */ new Map();
  bridgeForward;
  bridge;
  requestedTools;
  model;
  #evidenceCursor = 0;
  #reconnecting;
  #reconnectFactory;
  #reconnectFailure;
  #replyTimer;
  supervisorDir;
  runtime;
  owner;
  constructor(owner, bridgeForward, bridge, requestedTools, model, runtime, initialGit) {
    this.owner = owner;
    this.bridgeForward = bridgeForward;
    this.bridge = bridge;
    this.requestedTools = requestedTools;
    this.model = model;
    this.runtime = runtime;
    this.supervisorDir = runtime.supervisorChannelDir;
    this.#initialGit = initialGit;
    bridge.adopt((frame) => this.#frame(frame));
    if (this.supervisorDir) {
      this.#replyTimer = setInterval(() => {
        const replies = path5.join(this.supervisorDir, "replies");
        for (const name of fs3.existsSync(replies) ? fs3.readdirSync(replies) : []) {
          const file = path5.join(replies, name);
          try {
            const value = JSON.parse(fs3.readFileSync(file, "utf8"));
            if (typeof value.message === "string" && typeof value.requestId === "string") void this.#operation("supervisor-reply", value.message, value.requestId, typeof value.error === "string" ? value.error : void 0).then(() => fs3.rmSync(file, { force: true }));
          } catch {
          }
        }
      }, 50);
      this.#replyTimer.unref?.();
    }
  }
  get host() {
    return this.owner.host;
  }
  get identity() {
    return this.owner.identity;
  }
  set identity(value) {
    this.owner.identity = value;
  }
  get connection() {
    return this.owner.connection;
  }
  set connection(value) {
    this.owner.connection = value;
  }
  armReconnect(factory) {
    this.#reconnectFactory = factory;
    const observed = this.bridge;
    observed.failure.catch(() => {
      if (this.bridge === observed) void this.reconnect();
    });
  }
  get evidenceCursor() {
    return this.#evidenceCursor;
  }
  async reconnect() {
    if (this.#disposed || !this.#reconnectFactory || this.#reconnectFailure) return;
    this.#reconnecting ??= this.#reconnectFactory().catch((error) => {
      const unknown = this.#reconnectFailure = new Error(`Remote Pi reconciliation failed; task state is unknown: ${error instanceof Error ? error.message : String(error)}`);
      for (const operation of this.#operations.values()) if (!operation.settled) {
        operation.settled = true;
        operation.reject(unknown);
      }
    }).finally(() => {
      this.#reconnecting = void 0;
    });
    await this.#reconnecting;
  }
  async replaceTransport(input) {
    if (this.#disposed) {
      input.unsubscribe();
      input.bridge.close();
      await input.bridgeForward.close();
      await input.connection.close();
      return;
    }
    const old = { bridgeForward: this.bridgeForward, bridge: this.bridge };
    this.bridgeForward = input.bridgeForward;
    this.bridge = input.bridge;
    this.identity = { ...this.identity, paneId: input.paneId };
    this.#reconnectFailure = void 0;
    for (const frame of input.bridge.adopt((frame2) => this.#frame(frame2))) if (typeof frame.cursor === "number" && frame.cursor > this.#evidenceCursor) this.#frame(frame);
    for (const operation of this.#operations.values()) if (!operation.accepted && !operation.settled) {
      operation.settled = true;
      operation.reject(new Error("Remote operation was not accepted before transport loss; task state is unknown."));
    }
    this.#evidenceCursor = Math.max(this.#evidenceCursor, input.cursor);
    const ownerReplacement = this.owner.replaceConnection({ connection: input.connection, unsubscribe: input.unsubscribe, paneId: input.paneId, state: input.state });
    old.bridge.close();
    await old.bridgeForward.close();
    await ownerReplacement;
    if (this.#disposed) {
      await this.owner.cleanup(this.#aborted);
      return;
    }
    this.armReconnect(this.#reconnectFactory);
  }
  #frame(frame) {
    if (typeof frame.cursor === "number") {
      if (frame.cursor <= this.#evidenceCursor) return;
      this.#evidenceCursor = frame.cursor;
    }
    if (frame.nativeSessionId !== this.identity.nativeSessionId) {
      this.bridge.fail(new Error("Remote Pi native session identity changed."));
      void this.connection.close();
      return;
    }
    if (frame.type === "accepted" && typeof frame.requestId === "string") {
      const operation = this.#operations.get(frame.requestId);
      if (operation) operation.accepted = true;
    }
    if (frame.type === "supervisor-request" && this.supervisorDir && typeof frame.requestId === "string") this.#relaySupervisor(frame);
    if (frame.type === "event" && frame.event && typeof frame.event === "object") {
      const event = frame.event;
      const message = event.message;
      if (event.type === "message_end" && message) this.#messages.push(message);
      for (const listener of this.#listeners) listener(event);
    }
    if (frame.type === "settled" && typeof frame.requestId === "string") {
      if (frame.finalAssistant && typeof frame.finalAssistant === "object") {
        const message = frame.finalAssistant;
        if (!this.#messages.includes(message)) this.#messages.push(message);
      }
      if (frame.finalGit && typeof frame.finalGit === "object") this.#finalGit = frame.finalGit;
      const operation = this.#operations.get(frame.requestId);
      if (operation && !operation.settled) {
        operation.accepted = true;
        operation.settled = true;
        frame.idle === true && frame.pending === false ? operation.resolve() : operation.reject(new Error("Remote Pi did not settle with an empty native queue."));
      }
      for (const listener of this.#listeners) listener({ type: "agent_settled" });
    }
  }
  #relaySupervisor(frame) {
    if (!this.supervisorDir || typeof frame.requestId !== "string") return;
    const reason = frame.reason;
    if (reason !== "need_decision" && reason !== "interview_request" && reason !== "progress_update") return;
    const createdAt = Date.now();
    const file = path5.join(this.supervisorDir, "requests", `${path5.basename(frame.requestId)}.json`);
    const request = { type: "subagent.supervisor.request", id: frame.requestId, createdAt, ...reason !== "progress_update" ? { expiresAt: createdAt + 10 * 6e4 } : {}, reason, message: typeof frame.message === "string" ? frame.message : "", ...frame.interview && typeof frame.interview === "object" ? { interview: frame.interview } : {}, expectsReply: reason !== "progress_update", runId: this.runtime.runId ?? this.identity.runId, agent: this.runtime.agent ?? "remote", childIndex: this.runtime.childIndex ?? 0, orchestratorSessionId: this.runtime.orchestratorSessionId };
    try {
      fs3.writeFileSync(file, JSON.stringify(request), { mode: 384, flag: "wx" });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const existing = JSON.parse(fs3.readFileSync(file, "utf8"));
      if (existing.id !== frame.requestId || existing.reason !== reason) throw new Error("Supervisor relay identity changed during replay.");
    }
    if (reason === "progress_update") this.bridge.supervisorDelivered(frame.requestId);
  }
  async #operation(operation, text, supervisorId, supervisorError) {
    const requestId = `${++this.#sequence}_${randomBytes2(5).toString("hex")}`;
    let completion = Promise.resolve();
    if (operation === "prompt") completion = new Promise((resolve, reject) => this.#operations.set(requestId, { resolve, reject, accepted: false, settled: false }));
    try {
      await Promise.race([this.bridge.prepare(requestId, operation, text, supervisorId, supervisorError), this.bridge.failure]);
      await this.host.prompt(this.connection, this.identity, `/pi-subagents-bridge ${requestId}`);
      await completion;
    } catch (error) {
      if (operation === "prompt" && this.bridge.failed) {
        await this.reconnect();
        await completion;
        return;
      }
      const pending = this.#operations.get(requestId);
      if (pending) pending.settled = true;
      throw error;
    } finally {
      if (operation === "prompt") this.#operations.delete(requestId);
    }
  }
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  prompt(text) {
    return this.#operation("prompt", text);
  }
  steer(text) {
    return this.#operation("steer", text);
  }
  followUp(text) {
    return this.#operation("follow-up", text);
  }
  async abort() {
    this.#aborted = true;
    await this.#operation("abort");
  }
  async dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#replyTimer) clearInterval(this.#replyTimer);
    this.bridge.close();
    await this.bridgeForward.close();
    await this.owner.cleanup(this.#aborted);
  }
  get messages() {
    return this.#messages;
  }
  get sessionFile() {
    return void 0;
  }
  get sessionId() {
    return this.identity.nativeSessionId;
  }
  get modelId() {
    return this.model;
  }
  get machineEvidence() {
    return { provider: this.owner.machine.provider, machineId: this.identity.machineId, ...this.#initialGit ? { initial: this.#initialGit } : {}, ...this.#finalGit ? { final: this.#finalGit } : {} };
  }
  get placementSnapshot() {
    return this.owner.snapshot;
  }
};
async function reconnectHerdrPiSession(session, launch, dependencies = {}) {
  const host = session.host, connect = dependencies.connect ?? ((machine) => host.connect(machine)), discoverManifest = dependencies.discoverManifest ?? ((runId, runtimeDir) => discoverPlacedBridgeManifest(session.owner.access, runId, runtimeDir)), createBridge = dependencies.createBridge ?? ((socketPath, runId) => new BridgeChannel(socketPath, runId));
  let validated;
  const result = await boundedHerdrReconnect(session.identity, session.evidenceCursor, async () => {
    const connection = await connect(launch.machine);
    let unsubscribe = () => {
    };
    let bridgeForward;
    let bridge;
    const generation = { adopted: false };
    try {
      const panes = await host.panes(connection, session.identity);
      const manifest = await discoverManifest(session.identity.runId, session.identity.runtimeDir);
      bridgeForward = await connection.forwardRemoteSocket(manifest.socketPath, "bridge-reconnect");
      bridge = createBridge(bridgeForward.socketPath, session.identity.runId);
      const ready = await waitForReadyBridgeFrame(bridge, 8e3, "Reconnected bridge handshake timed out.", true);
      const candidate = { ...panes, bridge: { runId: ready.runId, nativeSessionId: ready.nativeSessionId, packageVersion: ready.packageVersion, protocol: ready.protocol, evidenceCursor: ready.evidenceCursor, evidenceFloor: ready.evidenceFloor } };
      const check = reconcileHerdrReconnect(session.identity, candidate, session.evidenceCursor, host);
      if (!check.ok) throw new Error(check.reason);
      unsubscribe = await host.subscribe(connection, check.paneId, (event) => session.owner.observeEvent(event), (error) => {
        if (!generation.adopted) {
          generation.lost ??= error;
          return;
        }
        session.owner.markConnectionUnknown(connection);
        void session.reconnect();
      });
      if (generation.lost) throw generation.lost;
      validated = { connection, unsubscribe, bridgeForward, bridge, candidate: generation };
      return candidate;
    } catch (error) {
      unsubscribe();
      bridge?.close();
      await bridgeForward?.close();
      await connection.close();
      throw error;
    }
  }, { attempts: 3, deadlineMs: 15e3, disposed: () => session.placementSnapshot.connection === "closed", host });
  if (!result.ok) throw new Error(`Pane-native reconnect remains unknown: ${result.reason}`);
  if (!validated) throw new Error("Pane-native reconnect produced no validated transport.");
  if (validated.candidate.lost) {
    validated.unsubscribe();
    validated.bridge.close();
    await validated.bridgeForward.close();
    await validated.connection.close();
    throw validated.candidate.lost;
  }
  validated.candidate.adopted = true;
  await session.replaceTransport({ ...validated, paneId: result.paneId, cursor: result.cursor, state: result.state });
}
async function createHerdrPiSession(launch) {
  if (!launch.machine) throw new Error("Pane-native Pi launch requires a saved machine.");
  if (launch.machine.provider !== "herdr") throw new Error("Herdr pane-native Pi launch requires a Herdr saved machine.");
  const policy = serializeHerdrPiLaunch(launch);
  const runId = safeRunId(launch.runtime.runId);
  return startPlacedPiSession(launch, await HerdrPlacedRunOwner.create(launch.machine, runId), policy);
}
async function createRexPiSession(launch) {
  if (launch.machine?.provider !== "rex") throw new Error("Rex pane-native Pi launch requires a Rex machine.");
  const policy = serializeHerdrPiLaunch(launch);
  const runId = safeRunId(launch.runtime.runId);
  return startPlacedPiSession(launch, await RexPlacedRunOwner.create(launch.machine, runId), policy);
}
async function startPlacedPiSession(launch, owner, policy) {
  const machine = owner.machine, runId = owner.runId, runtimeDir = owner.runtimeDir, connection = owner.connection;
  try {
    let reconnectSession;
    const agentName = `pi-${runId.slice(-20)}`;
    const { owned, terminalId } = await owner.launch({ kind: "pi", name: agentName, args: policy.args, environment: { [HERDR_PI_MODE_ENV]: "1", [HERDR_PI_RUN_ENV]: runId, [HERDR_PI_RUNTIME_DIR_ENV]: runtimeDir } }, () => owner.subscribe(() => {
    }, () => void reconnectSession?.reconnect()));
    const manifest = await discoverPlacedBridgeManifest(owner.access, runId, runtimeDir, "The placed Pi did not start the pi-subagents bridge, so its pane was closed. Start pi in a new pane on that machine to see why: it may wait on a prompt (such as a macOS folder-access prompt for the terminal app), exit at startup, or not load the same pi-subagents version as an extension.");
    if (manifest.protocol !== HERDR_PI_PROTOCOL || manifest.packageVersion !== package_default.version) throw new Error(`Remote pi-subagents bridge version mismatch (remote ${manifest.packageVersion}, local ${package_default.version}).`);
    const bridgeForward = await connection.forwardRemoteSocket(manifest.socketPath, "bridge");
    const bridge = new BridgeChannel(bridgeForward.socketPath, runId);
    const ready = await waitForReadyBridgeFrame(bridge, 15e3, "Remote Pi bridge handshake timed out.");
    if (ready.packageVersion !== package_default.version || ready.nativeSessionId !== manifest.nativeSessionId || ready.cwd !== machine.cwd) throw new Error("Remote Pi bridge handshake identity mismatch.");
    const configured = await Promise.race([bridge.configure(policy.resources), bridge.failure]);
    if (configured.nativeSessionId !== manifest.nativeSessionId || configured.agent !== policy.resources.agent) throw new Error("Remote Pi resource resolution identity mismatch.");
    if (!Array.isArray(configured.tools) || policy.resources.toolCeiling && configured.tools.some((tool) => !policy.resources.toolCeiling.includes(String(tool)))) throw new Error("Remote Pi active-tool ceiling acknowledgement mismatch.");
    if (launch.model && configured.model !== launch.model.split(":")[0]) throw new Error(`Remote Pi model '${launch.model}' did not resolve to the requested provider/model.`);
    const identity = { runId, machineId: machine.id, target: isRexLocalMachine(machine) ? machine.id : machine.target, session: owner.host.sessionOf(connection), workspaceId: owned.workspaceId, tabId: owned.tabId, paneId: owned.paneId, terminalId, agentName, nativeSessionId: manifest.nativeSessionId, cwd: machine.cwd, runtimeDir };
    owner.journal(identity);
    const session = new HerdrPiSession(owner, bridgeForward, bridge, configured.tools, typeof ready.model === "string" ? ready.model : void 0, launch.runtime, ready.initialGit);
    reconnectSession = session;
    session.armReconnect(() => reconnectHerdrPiSession(session, launch));
    return session;
  } catch (error) {
    await owner.cleanup();
    throw error;
  }
}
function createPlacedPiSession(launch) {
  return launch.machine?.provider === "rex" ? createRexPiSession(launch) : createHerdrPiSession(launch);
}
function createPlacementAwareChildSessionFactory(local, createRemote = createPlacedPiSession) {
  const remote = /* @__PURE__ */ new Set();
  return { async create(launch) {
    if (!launch.machine) return local.create(launch);
    serializeHerdrPiLaunch(launch);
    const child = await createRemote(launch);
    remote.add(child);
    return child;
  }, async dispose() {
    await Promise.allSettled([...remote].map((child) => child.dispose()));
    remote.clear();
    await local.dispose();
  } };
}
export {
  BridgeChannel,
  HerdrPiSession,
  boundedHerdrReconnect,
  createHerdrPiSession,
  createPlacementAwareChildSessionFactory,
  createRexPiSession,
  reconcileHerdrReconnect,
  reconnectHerdrPiSession,
  serializeHerdrPiLaunch
};
