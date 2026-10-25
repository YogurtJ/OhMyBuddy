import {
  snapshotRequiredChildExtensions
} from "./chunk-CTPAE36Y.js";
import {
  THINKING_LEVELS,
  findConfiguredProjectRoot,
  getAgentDir,
  getConfigDirName,
  getProjectConfigDir
} from "./chunk-CIZQXJ5Q.js";
import {
  TEMP_ROOT_DIR
} from "./chunk-5LFLVSTM.js";
import {
  capabilityCeilingAgentRestrictionSources,
  intersectSubagentCapabilityCeilings,
  isAgentAllowedByCapabilityCeiling
} from "./chunk-Z7KVHQHL.js";

// src/runs/shared/child-tool-plan.ts
import { createHash as createHash2 } from "node:crypto";
import * as fs4 from "node:fs";
import * as path4 from "node:path";
import { fileURLToPath } from "node:url";

// src/runs/shared/mcp-direct-tool-allowlist.ts
import { createHash } from "node:crypto";
import * as fs2 from "node:fs";
import * as os2 from "node:os";
import * as path2 from "node:path";

// src/runs/shared/mcp-config-sources.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
var PACKAGE_CONFIG_ROOT = "npm";
var PACKAGE_GIT_ROOT = "git";
var PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
var PLUGIN_MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
var PLUGIN_NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
var PLUGIN_STDIO_FIELDS = /* @__PURE__ */ new Set(["type", "command", "args", "env", "cwd"]);
var PLUGIN_HTTP_FIELDS = /* @__PURE__ */ new Set(["type", "url", "headers"]);
function isMcpServerDefinition(value) {
  if (!isRecord(value)) return false;
  for (const field of ["command", "socket", "cwd", "url", "bearerToken", "bearerTokenEnv", "protocolVersion", "httpTransport", "pluginDataDir"]) {
    if (value[field] !== void 0 && typeof value[field] !== "string") return false;
  }
  for (const field of ["args", "includeTools", "excludeTools"]) {
    if (value[field] !== void 0 && !isStringArray(value[field])) return false;
  }
  for (const field of ["env", "headers"]) {
    if (value[field] !== void 0 && !isStringRecord(value[field])) return false;
  }
  for (const field of ["exposeResources", "literalEnv", "inheritEnv"]) {
    if (value[field] !== void 0 && typeof value[field] !== "boolean") return false;
  }
  if (value.requestHeadersCommand !== void 0 && !isRequestHeadersCommand(value.requestHeadersCommand)) return false;
  if (value.auth !== void 0 && value.auth !== "oauth" && value.auth !== "bearer" && value.auth !== false) return false;
  return value.directTools === void 0 || typeof value.directTools === "boolean" || isStringArray(value.directTools);
}
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function isStringRecord(value) {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}
function isRequestHeadersCommand(value) {
  if (!isRecord(value) || typeof value.command !== "string") return false;
  if (value.args !== void 0 && !isStringArray(value.args)) return false;
  if (value.env !== void 0 && !isStringRecord(value.env)) return false;
  return value.timeoutMs === void 0 || typeof value.timeoutMs === "number" && Number.isFinite(value.timeoutMs);
}
function loadPackageMcpServers(cwd) {
  const servers = {};
  const seen = /* @__PURE__ */ new Set();
  for (const packageRoot of getConfiguredPackageRoots(cwd)) {
    const manifest = readJson(path.join(packageRoot, "package.json"));
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) continue;
    const packageName = manifest.name;
    if (typeof packageName !== "string" || !packageName) continue;
    const mcpValue = manifest.pi?.mcp;
    const configPaths = typeof mcpValue === "string" ? [mcpValue] : Array.isArray(mcpValue) && mcpValue.every((value) => typeof value === "string") ? mcpValue : [];
    const packagePrefix = formatName(packageName, "package");
    for (const configPath of configPaths) {
      const resolvedPath = resolvePackageConfigPath(packageRoot, configPath);
      if (!resolvedPath) continue;
      const config = readJson(resolvedPath);
      if (!config || typeof config !== "object" || Array.isArray(config)) continue;
      const rawServers = config.mcpServers;
      if (!rawServers || typeof rawServers !== "object" || Array.isArray(rawServers)) continue;
      for (const [serverName, definition] of Object.entries(rawServers)) {
        if (!isMcpServerDefinition(definition)) continue;
        const normalizedName = `${packagePrefix}__${formatName(serverName, "server")}`;
        if (seen.has(normalizedName)) continue;
        seen.add(normalizedName);
        servers[normalizedName] = definition;
      }
    }
  }
  return servers;
}
function loadAgentPluginMcpServers(paths, cwd) {
  const servers = {};
  if (!Array.isArray(paths)) return servers;
  for (const configuredPath of paths) {
    if (typeof configuredPath !== "string") continue;
    const pluginRoot = resolvePluginPath(configuredPath, cwd);
    const manifest = readJson(path.join(pluginRoot, "plugin.json"));
    if (!isValidPluginManifest(manifest)) continue;
    const config = readJson(path.join(pluginRoot, "mcp.json"));
    if (!isValidPluginConfig(config)) continue;
    const rawServers = config.mcpServers;
    for (const [serverName, rawDefinition] of Object.entries(rawServers)) {
      const definition = translatePluginServer(manifest.name, pluginRoot, rawDefinition);
      if (!definition) continue;
      const normalizedName = `${formatName(manifest.name, "plugin")}__${formatName(serverName, "server")}`;
      if (Object.hasOwn(servers, normalizedName)) continue;
      servers[normalizedName] = definition;
    }
  }
  return servers;
}
function getConfiguredPackageRoots(cwd) {
  const roots = [];
  const projectConfigDir = findProjectConfigDir(cwd);
  const sources = [
    { path: path.join(projectConfigDir, "settings.json"), baseDir: projectConfigDir },
    { path: path.join(getAgentDir(), "settings.json"), baseDir: getAgentDir() }
  ];
  for (const source of sources) {
    const settings = readJson(source.path);
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) continue;
    const packages = settings.packages;
    if (!Array.isArray(packages)) continue;
    for (const entry of packages) {
      const packageSource = typeof entry === "string" ? entry : entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.source === "string" ? entry.source : void 0;
      if (!packageSource) continue;
      const root = resolvePackageRoot(packageSource, source.baseDir);
      if (root && !roots.includes(root)) roots.push(root);
    }
  }
  return roots;
}
function findProjectConfigDir(cwd) {
  const projectRoot = findConfiguredProjectRoot(path.resolve(cwd));
  return projectRoot ? getProjectConfigDir(projectRoot) : path.join(path.resolve(cwd), getConfigDirName());
}
function resolvePackageRoot(source, baseDir) {
  const trimmed = source.trim();
  if (!trimmed) return void 0;
  if (trimmed.startsWith("npm:")) {
    const packageName = parseNpmPackageName(trimmed);
    return packageName ? resolveContainedPath(path.join(baseDir, PACKAGE_CONFIG_ROOT, "node_modules"), packageName) ?? void 0 : void 0;
  }
  if (trimmed.startsWith("git:") || /^(?:https?:\/\/|ssh:\/\/|git@[^:]+:)/.test(trimmed)) {
    const parsed = parseGitPackagePath(trimmed.startsWith("git:") ? trimmed : `git:${trimmed}`);
    return parsed ? path.join(baseDir, PACKAGE_GIT_ROOT, parsed.host, parsed.repoPath) : void 0;
  }
  const localPath = trimmed.startsWith("file:") ? trimmed.slice(5) : trimmed;
  if (localPath === "~") return os.homedir();
  if (localPath.startsWith("~/")) return path.join(os.homedir(), localPath.slice(2));
  return path.isAbsolute(localPath) ? path.resolve(localPath) : path.resolve(baseDir, localPath);
}
function parseNpmPackageName(source) {
  const spec = source.slice(4).trim();
  if (!spec) return void 0;
  const match = spec.match(/^(@?[^@]+(?:\/[^@]+)?)(?:@(.+))?$/);
  const packageName = match?.[1] ?? spec;
  return resolveContainedPath("/", packageName) ? packageName : void 0;
}
function parseGitPackagePath(source) {
  const spec = source.slice(4).trim();
  if (!spec) return void 0;
  let host = "";
  let repoPath = "";
  const scpLike = spec.match(/^git@([^:]+):(.+)$/);
  if (scpLike) {
    host = scpLike[1] ?? "";
    repoPath = scpLike[2] ?? "";
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(spec)) {
    try {
      const url = new URL(spec);
      host = url.hostname;
      repoPath = url.pathname.replace(/^\/+/, "");
    } catch {
      return void 0;
    }
  } else {
    const slashIndex = spec.indexOf("/");
    if (slashIndex < 0) return void 0;
    host = spec.slice(0, slashIndex);
    repoPath = spec.slice(slashIndex + 1);
  }
  const normalizedPath = stripGitRef(repoPath).replace(/\.git$/, "").replace(/^\/+/, "");
  if (!host || !isSafePackagePath(host) || !isSafePackagePath(normalizedPath) || normalizedPath.split(/[\\/]/).length < 2) {
    return void 0;
  }
  return { host, repoPath: normalizedPath };
}
function stripGitRef(repoPath) {
  const atIndex = repoPath.indexOf("@");
  const hashIndex = repoPath.indexOf("#");
  const refIndex = [atIndex, hashIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return refIndex === void 0 ? repoPath : repoPath.slice(0, refIndex);
}
function isSafePackagePath(value) {
  return value.length > 0 && !path.isAbsolute(value) && value.split(/[\\/]/).every((part) => part.length > 0 && part !== "." && part !== "..");
}
function resolvePackageConfigPath(packageRoot, configuredPath) {
  const lexicalPath = resolveContainedPath(packageRoot, configuredPath);
  if (!lexicalPath || !fs.existsSync(lexicalPath)) return void 0;
  try {
    if (!fs.statSync(lexicalPath).isFile()) return void 0;
    const packageRealPath = fs.realpathSync(packageRoot);
    const configRealPath = fs.realpathSync(lexicalPath);
    return resolveContainedPath(packageRealPath, configRealPath) ?? void 0;
  } catch {
    return void 0;
  }
}
function resolveContainedPath(root, value) {
  const resolved = path.resolve(root, value);
  const relative2 = path.relative(root, resolved);
  return relative2 === "" || !relative2.startsWith("..") && !relative2.startsWith(path.sep) && !path.isAbsolute(relative2) ? resolved : void 0;
}
function resolvePluginPath(configuredPath, cwd) {
  if (configuredPath === "~") return path.resolve(process.env.HOME ?? "", ".");
  if (configuredPath.startsWith("~/")) return path.resolve(process.env.HOME ?? "", configuredPath.slice(2));
  return path.isAbsolute(configuredPath) ? path.resolve(configuredPath) : path.resolve(cwd, configuredPath);
}
function isValidPluginManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const manifest = value;
  return manifest.$schema === PLUGIN_SCHEMA && typeof manifest.name === "string" && manifest.name.length >= 1 && manifest.name.length <= 64 && PLUGIN_NAME_PATTERN.test(manifest.name);
}
function isValidPluginConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const config = value;
  return config.$schema === PLUGIN_MCP_SCHEMA && Object.keys(config).every((key) => key === "$schema" || key === "mcpServers") && !!config.mcpServers && typeof config.mcpServers === "object" && !Array.isArray(config.mcpServers);
}
function translatePluginServer(pluginName, pluginRoot, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const raw = value;
  if (raw.type === "stdio") return translatePluginStdioServer(pluginName, pluginRoot, raw);
  if (raw.type === "streamable-http" || raw.type === "sse") return translatePluginHttpServer(raw);
  return void 0;
}
function translatePluginStdioServer(pluginName, pluginRoot, raw) {
  if ([...Object.keys(raw)].some((key) => !PLUGIN_STDIO_FIELDS.has(key))) return void 0;
  if (typeof raw.command !== "string" || !raw.command) return void 0;
  if (!isBareCommand(raw.command) && !raw.command.startsWith("./")) return void 0;
  const args = stringArray(raw.args);
  if (raw.args !== void 0 && !args) return void 0;
  const env = stringRecord(raw.env);
  if (raw.env !== void 0 && !env) return void 0;
  if (env && (Object.hasOwn(env, "PLUGIN_ROOT") || Object.hasOwn(env, "PLUGIN_DATA"))) return void 0;
  const pluginDataDir = path.join(getAgentDir(), "agent-plugin-data", pluginName);
  const command = raw.command.startsWith("./") ? resolveContainedPath(pluginRoot, raw.command) : raw.command;
  if (!command) return void 0;
  const cwd = resolvePluginCwd(raw.cwd, pluginRoot, pluginDataDir);
  if (!cwd) return void 0;
  return {
    command,
    args: (args ?? []).map((value) => expandPluginPlaceholders(value, pluginRoot, pluginDataDir)),
    env: {
      ...Object.fromEntries(Object.entries(env ?? {}).map(([key, value]) => [key, expandPluginPlaceholders(value, pluginRoot, pluginDataDir)])),
      PLUGIN_ROOT: pluginRoot,
      PLUGIN_DATA: pluginDataDir
    },
    cwd,
    pluginDataDir,
    literalEnv: true
  };
}
function translatePluginHttpServer(raw) {
  if ([...Object.keys(raw)].some((key) => !PLUGIN_HTTP_FIELDS.has(key))) return void 0;
  if (typeof raw.url !== "string" || !isValidPluginUrl(raw.url)) return void 0;
  const headers = stringRecord(raw.headers);
  if (raw.headers !== void 0 && !headers) return void 0;
  if (headers) {
    const normalized = /* @__PURE__ */ new Set();
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (normalized.has(lower)) return void 0;
      normalized.add(lower);
    }
    try {
      new Headers(headers);
    } catch {
      return void 0;
    }
  }
  return { url: raw.url, ...headers ? { headers } : {}, httpTransport: raw.type };
}
function resolvePluginCwd(value, pluginRoot, pluginDataDir) {
  if (value === void 0) return pluginRoot;
  if (typeof value !== "string") return void 0;
  if (value.startsWith("./")) return resolveContainedPath(pluginRoot, value);
  if (value === "${PLUGIN_ROOT}" || value.startsWith("${PLUGIN_ROOT}/")) return resolveContainedPath(pluginRoot, value.replace("${PLUGIN_ROOT}", "."));
  if (value === "${PLUGIN_DATA}" || value.startsWith("${PLUGIN_DATA}/")) return resolveContainedPath(pluginDataDir, value.replace("${PLUGIN_DATA}", "."));
  return void 0;
}
function expandPluginPlaceholders(value, pluginRoot, pluginDataDir) {
  return value.replaceAll("${PLUGIN_ROOT}", pluginRoot).replaceAll("${PLUGIN_DATA}", pluginDataDir);
}
function isBareCommand(command) {
  return !command.includes("/") && !command.includes("\\") && !command.includes("${PLUGIN_ROOT}") && !command.includes("${PLUGIN_DATA}");
}
function isValidPluginUrl(value) {
  if (value.includes("${") || value.includes("$env:") || value.includes("{env:")) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password || url.hash) return false;
  if (url.protocol === "https:") return true;
  const host = url.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(host);
}
function stringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : void 0;
}
function stringRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const entries = Object.entries(value);
  if (entries.some(([, entry]) => typeof entry !== "string")) return void 0;
  return Object.fromEntries(entries);
}
function formatName(value, fallback) {
  return value.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^[_-]+|[_-]+$/g, "") || fallback;
}
function readJson(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw new Error(`Failed to read JSON file '${filePath}': ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in '${filePath}': ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

// src/runs/shared/mcp-direct-tool-grant.ts
var BUILTIN_TOOL_NAMES = /* @__PURE__ */ new Set(["read", "bash", "edit", "write", "grep", "find", "ls", "mcp"]);
function normalizeMcpDirectToolSelectors(selectors) {
  return [...new Set((selectors ?? []).map((selector) => selector.replace(/\/+$/, "")).filter(Boolean))];
}
function parseMcpDirectToolSelectors(selectors) {
  const servers = /* @__PURE__ */ new Set();
  const tools = /* @__PURE__ */ new Map();
  for (const item of selectors) {
    if (item.includes("/")) {
      const [server, tool] = item.split("/", 2);
      if (server && tool) {
        if (!tools.has(server)) tools.set(server, /* @__PURE__ */ new Set());
        tools.get(server).add(tool);
      } else if (server) {
        servers.add(server);
      }
    } else if (item) {
      servers.add(item);
    }
  }
  return { servers, tools };
}
function planMcpDirectToolGrant(input) {
  const selectors = normalizeMcpDirectToolSelectors(input.selectors);
  if (selectors.length === 0) return { selections: [], unresolvedSelectors: [] };
  const { servers: selectedServers, tools: selectedTools } = parseMcpDirectToolSelectors(selectors);
  const selections = [];
  const seenNames = /* @__PURE__ */ new Set();
  for (const [serverName, server] of Object.entries(input.servers)) {
    const metadata = input.metadata[serverName];
    if (!metadata) continue;
    const toolFilter = selectedServers.has(serverName) ? true : selectedTools.get(serverName);
    if (!toolFilter) continue;
    const prefix = normalizeMcpToolPrefix(server.toolPrefix ?? input.toolPrefix);
    for (const tool of Array.isArray(metadata.tools) ? metadata.tools : []) {
      if (typeof tool?.name !== "string" || !tool.name) continue;
      if (toolFilter !== true && !toolFilter.has(tool.name)) continue;
      if (!isToolAllowed(tool.name, serverName, prefix, server.includeTools, server.excludeTools)) continue;
      const name = formatToolName(tool.name, serverName, prefix);
      if (BUILTIN_TOOL_NAMES.has(name) || seenNames.has(name)) continue;
      seenNames.add(name);
      selections.push({ name, selector: `${serverName}/${tool.name}` });
    }
    if (server.exposeResources === false) continue;
    for (const resource of Array.isArray(metadata.resources) ? metadata.resources : []) {
      if (typeof resource?.name !== "string" || !resource.name || typeof resource.uri !== "string" || !resource.uri) continue;
      const baseName = `get_${resourceNameToToolName(resource.name)}`;
      if (toolFilter !== true && !toolFilter.has(baseName)) continue;
      if (!isToolAllowed(baseName, serverName, prefix, server.includeTools, server.excludeTools)) continue;
      const name = formatToolName(baseName, serverName, prefix);
      if (BUILTIN_TOOL_NAMES.has(name) || seenNames.has(name)) continue;
      seenNames.add(name);
      selections.push({ name, selector: `${serverName}/${baseName}` });
    }
  }
  const unresolvedSelectors = selectors.filter(
    (selector) => selector.includes("/") ? !selections.some((selection) => selection.selector === selector) : !selections.some((selection) => selection.selector.startsWith(`${selector}/`))
  );
  return { selections, unresolvedSelectors };
}
function normalizeMcpToolPrefix(value) {
  return value === "none" || value === "short" || value === "mcp" || value === "server" ? value : "server";
}
function formatUnresolvedMcpDirectToolSelectors(selectors) {
  return `Unresolved MCP direct-tool selectors: ${selectors.join(", ")}. Direct MCP tools require a matching configured server and fresh metadata cache; runtime-registered servers require a host/pi-mcp-adapter handoff before child launch.`;
}
function getServerPrefix(serverName, mode) {
  if (mode === "none") return "";
  if (mode === "short") return sanitizeServerPrefix(serverName.replace(/-?mcp$/i, "")) || "mcp";
  if (mode === "mcp") return `mcp__${sanitizeServerPrefix(serverName)}`;
  return sanitizeServerPrefix(serverName);
}
function sanitizeServerPrefix(serverName) {
  return Array.from(serverName, (char) => /^[A-Za-z0-9_-]$/.test(char) ? char : `_${char.codePointAt(0).toString(16)}_`).join("");
}
function formatToolName(toolName, serverName, prefix) {
  const serverPrefix = getServerPrefix(serverName, prefix);
  const sanitized = toolName.replace(/\./g, "_");
  if (serverPrefix && sanitized.startsWith(`${serverPrefix}_`) && sanitized.length > serverPrefix.length + 1) {
    return sanitized;
  }
  return serverPrefix ? `${serverPrefix}_${sanitized}` : sanitized;
}
function isToolAllowed(toolName, serverName, prefix, includeTools, excludeTools) {
  const candidates = toolNameCandidates(toolName, serverName, prefix);
  return (!Array.isArray(includeTools) || includeTools.length === 0 || matchesToolPatterns(candidates, includeTools)) && !matchesToolPatterns(candidates, excludeTools);
}
function toolNameCandidates(toolName, serverName, prefix) {
  return /* @__PURE__ */ new Set([
    toolName,
    `mcp_${toolName}`,
    formatToolName(toolName, serverName, prefix),
    formatToolName(toolName, serverName, "server"),
    formatToolName(toolName, serverName, "short"),
    formatToolName(toolName, serverName, "mcp"),
    formatToolName(toolName, serverName, "none")
  ]);
}
function matchesToolPatterns(candidates, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return false;
  for (const pattern of patterns) {
    if (typeof pattern !== "string") continue;
    const normalizedPattern = normalizeToolName(pattern);
    const matcher = normalizedPattern.includes("*") || normalizedPattern.includes("?") ? globToRegExp(normalizedPattern) : void 0;
    for (const candidate of candidates) {
      const normalizedCandidate = normalizeToolName(candidate);
      if (matcher ? matcher.test(normalizedCandidate) : normalizedCandidate === normalizedPattern) return true;
    }
  }
  return false;
}
function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
function normalizeToolName(value) {
  return value.replace(/-/g, "_");
}
function resourceNameToToolName(name) {
  let result = name.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_+/, "").replace(/_+$/, "").toLowerCase();
  if (!result || /^\d/.test(result)) result = `resource${result ? `_${result}` : ""}`;
  return result;
}

// src/runs/shared/mcp-direct-tool-allowlist.ts
var CACHE_VERSION = 1;
var CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
var GENERIC_GLOBAL_CONFIG_PATH = path2.join(os2.homedir(), ".config", "mcp", "mcp.json");
var IMPORT_PATHS = {
  cursor: [path2.join(os2.homedir(), ".cursor", "mcp.json")],
  "claude-code": [
    path2.join(os2.homedir(), ".claude", "mcp.json"),
    path2.join(os2.homedir(), ".claude.json"),
    path2.join(os2.homedir(), ".claude", "claude_desktop_config.json")
  ],
  "claude-desktop": [path2.join(os2.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json")],
  codex: [path2.join(os2.homedir(), ".codex", "config.json")],
  windsurf: [path2.join(os2.homedir(), ".windsurf", "mcp.json")],
  vscode: [".vscode/mcp.json"]
};
var MCP_RUNTIME_SNAPSHOT_EVENT = "pi-mcp-adapter:runtime-snapshot:v1";
var MCP_RUNTIME_SNAPSHOT_VERSION = 1;
function resolveMcpDirectToolResolution(mcpDirectTools, cwd = process.cwd(), runtimeSnapshotHost, configOverride) {
  const selectors = normalizeMcpDirectToolSelectors(mcpDirectTools);
  if (selectors.length === 0) return { selections: [], unresolvedSelectors: [] };
  if (usesBuiltinMcp(runtimeSnapshotHost)) {
    return resolveBuiltinMcpSelections(selectors, runtimeSnapshotHost.getAllTools?.() ?? []);
  }
  const config = configOverride ?? loadMcpConfig(cwd);
  const { servers: selectedServers, tools: selectedTools } = parseMcpDirectToolSelectors(selectors);
  const runtimeSelectionServers = /* @__PURE__ */ new Set([...selectedServers, ...selectedTools.keys()]);
  const runtimeServers = resolveRuntimeMcpServers(config, runtimeSelectionServers, runtimeSnapshotHost);
  const resolvedConfig = Object.keys(runtimeServers).length > 0 ? mergeConfigs(config, { mcpServers: runtimeServers }) : config;
  validateSelectedServerDefinitions(resolvedConfig, selectors);
  const runtime = Object.keys(runtimeServers).length > 0 ? { mcpConfig: resolvedConfig, runtimeServerNames: Object.keys(runtimeServers) } : {};
  const cache = loadMetadataCache();
  if (!cache) return { selections: [], unresolvedSelectors: selectors, ...runtime };
  const validMetadata = {};
  for (const [serverName, definition] of Object.entries(resolvedConfig.mcpServers)) {
    const serverCache = cache.servers[serverName];
    if (isServerCacheValid(serverCache, definition)) validMetadata[serverName] = serverCache;
  }
  const grant = planMcpDirectToolGrant({
    selectors,
    servers: resolvedConfig.mcpServers,
    metadata: validMetadata,
    toolPrefix: resolvedConfig.settings?.toolPrefix
  });
  return {
    selections: grant.selections,
    unresolvedSelectors: grant.unresolvedSelectors,
    ...runtime
  };
}
function usesBuiltinMcp(host) {
  const commands = host?.getCommands?.() ?? [];
  return commands.find((command) => command.name === "mcp")?.sourceInfo.path === "builtin:mcp" && !commands.some((command) => /^mcp-adapter(?::\d+)?$/.test(command.name));
}
function resolveBuiltinMcpSelections(selectors, tools) {
  const selections = [];
  const unresolvedSelectors = [];
  for (const selector of selectors) {
    const slash = selector.indexOf("/");
    const server = slash === -1 ? selector : selector.slice(0, slash);
    const inServer = tools.filter((tool) => tool.namespace?.name === `mcp__${server.replace(/-/g, "_")}`);
    const toolName = slash === -1 ? void 0 : builtinMcpToolNames(server, selector.slice(slash + 1)).find((name) => inServer.some((tool) => tool.name === name));
    const matches = inServer.filter((tool) => tool.exposure !== "hidden" && (slash === -1 || tool.name === toolName));
    if (matches.length === 0) unresolvedSelectors.push(selector);
    for (const tool of matches) {
      if (!selections.some((selection) => selection.name === tool.name)) selections.push({ name: tool.name, selector });
    }
  }
  return { selections, unresolvedSelectors, builtin: true };
}
function builtinMcpToolNames(server, tool) {
  const name = `mcp__${server}__${tool}`.replace(/[^A-Za-z0-9_]/g, "_");
  const hash = createHash("sha256").update(`${server}\0${tool}`).digest("hex").slice(0, 8);
  const suffixed = `${name.slice(0, 64 - hash.length - 1)}_${hash}`;
  return name.length <= 64 ? [suffixed, name] : [suffixed];
}
function formatUnresolvedBuiltinMcpSelectors(agentName, selectors) {
  const subject = agentName ? `Agent '${agentName}'` : "Subagent";
  return `${subject} selects MCP tools that Pi's built-in MCP does not offer: ${selectors.map((selector) => `mcp:${selector}`).join(", ")}. The server may be missing, disconnected, still connecting, or its tools hidden; check /mcp.`;
}
function extensionOnlyMcpServers(selections, host, cwd, projectTrusted) {
  const registered = new Set(host.getMcpServers?.().map(({ name }) => name));
  const servers = [...new Set(selections.map(({ selector }) => selector.split("/")[0]))].filter((server) => registered.has(server));
  if (servers.length === 0) return [];
  const files = [path2.join(getAgentDir(), "mcp.json"), ...projectTrusted ? [path2.join(cwd, ".pi", "mcp.json")] : []];
  const configured = new Set(files.flatMap((file) => {
    let parsed;
    try {
      parsed = JSON.parse(fs2.readFileSync(file, "utf-8"));
    } catch {
      return [];
    }
    return isRecord2(parsed) && isRecord2(parsed.mcpServers) ? Object.keys(parsed.mcpServers) : [];
  }));
  return servers.filter((server) => !configured.has(server));
}
function loadMetadataCache() {
  const cachePath = path2.join(getAgentDir(), "mcp-cache.json");
  let parsed;
  try {
    parsed = JSON.parse(fs2.readFileSync(cachePath, "utf-8"));
  } catch {
    return null;
  }
  if (!isRecord2(parsed) || parsed.version !== CACHE_VERSION || !isRecord2(parsed.servers)) return null;
  const servers = {};
  for (const [name, value] of Object.entries(parsed.servers)) {
    const entry = parseServerCacheEntry(value);
    if (entry) servers[name] = entry;
  }
  return { version: CACHE_VERSION, servers };
}
function parseServerCacheEntry(value) {
  if (!isRecord2(value)) return void 0;
  if (value.configHash !== void 0 && typeof value.configHash !== "string") return void 0;
  if (value.cachedAt !== void 0 && (typeof value.cachedAt !== "number" || !Number.isFinite(value.cachedAt))) return void 0;
  if (value.tools !== void 0 && !Array.isArray(value.tools)) return void 0;
  if (value.resources !== void 0 && !Array.isArray(value.resources)) return void 0;
  const tools = value.tools?.map(parseCachedTool);
  const resources = value.resources?.map(parseCachedResource);
  if (tools && !tools.every((entry) => entry !== void 0)) return void 0;
  if (resources && !resources.every((entry) => entry !== void 0)) return void 0;
  return {
    ...value.configHash !== void 0 ? { configHash: value.configHash } : {},
    ...value.cachedAt !== void 0 ? { cachedAt: value.cachedAt } : {},
    ...tools ? { tools } : {},
    ...resources ? { resources } : {}
  };
}
function parseCachedTool(value) {
  if (!isRecord2(value) || value.name !== void 0 && typeof value.name !== "string") return void 0;
  return value.name === void 0 ? {} : { name: value.name };
}
function parseCachedResource(value) {
  if (!isRecord2(value)) return void 0;
  if (value.uri !== void 0 && typeof value.uri !== "string") return void 0;
  if (value.name !== void 0 && typeof value.name !== "string") return void 0;
  return {
    ...value.uri !== void 0 ? { uri: value.uri } : {},
    ...value.name !== void 0 ? { name: value.name } : {}
  };
}
function resolveRuntimeMcpServers(config, selectedServers, runtimeSnapshotHost) {
  if (!runtimeSnapshotHost) return {};
  const runtimeServers = {};
  for (const serverName of selectedServers) {
    if (Object.hasOwn(config.mcpServers, serverName)) continue;
    try {
      const snapshot = getRuntimeMcpServerSnapshot(runtimeSnapshotHost, serverName);
      runtimeServers[serverName] = snapshot.definition;
    } catch {
    }
  }
  return runtimeServers;
}
function getRuntimeMcpServerSnapshot(host, name) {
  const request = {
    version: MCP_RUNTIME_SNAPSHOT_VERSION,
    name
  };
  host.events.emit(MCP_RUNTIME_SNAPSHOT_EVENT, request);
  if (!request.result) throw new Error("pi-mcp-adapter is not installed for this Pi instance");
  if (!request.result.ok) throw request.result.error;
  const snapshot = request.result.snapshot;
  if (!snapshot || snapshot.name !== name || snapshot.runtime !== true || snapshot.persisted !== false || !isMcpServerDefinition(snapshot.definition)) {
    throw new Error(`Invalid MCP runtime snapshot for server "${name}"`);
  }
  return snapshot;
}
function loadMcpConfig(cwd) {
  const resolvedCwd = path2.resolve(cwd);
  const projectRoot = findConfiguredProjectRoot(resolvedCwd) ?? resolvedCwd;
  let config = { mcpServers: {} };
  for (const sourcePath of getConfigPaths(projectRoot)) {
    const loaded = readConfig(sourcePath);
    if (!loaded) continue;
    config = mergeConfigs(config, expandImports(loaded, projectRoot));
  }
  const packageServers = loadPackageMcpServers(projectRoot);
  const pluginServers = loadAgentPluginMcpServers(config.settings?.agentPluginPaths, projectRoot);
  const packageOnlyServers = Object.fromEntries(
    Object.entries(packageServers).filter(([name]) => !Object.hasOwn(pluginServers, name))
  );
  return mergeConfigs(
    { mcpServers: packageOnlyServers },
    mergeConfigs({ mcpServers: pluginServers }, config)
  );
}
function getConfigPaths(projectRoot) {
  const agentDir = getAgentDir();
  const projectDir = getProjectConfigDir(projectRoot);
  const candidates = [
    GENERIC_GLOBAL_CONFIG_PATH,
    path2.join(agentDir, "mcp-adapter.json"),
    path2.resolve(projectRoot, ".mcp.json"),
    path2.join(projectDir, "mcp-adapter.json")
  ];
  return [...new Set(candidates)];
}
function readConfig(configPath) {
  let parsed;
  try {
    parsed = JSON.parse(fs2.readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
  return validateConfig(parsed);
}
function validateConfig(raw) {
  if (!isRecord2(raw)) return { mcpServers: {} };
  const obj = raw;
  const servers = obj.mcpServers ?? obj["mcp-servers"] ?? {};
  return {
    mcpServers: parseServerEntries(servers),
    imports: Array.isArray(obj.imports) ? obj.imports.filter((value) => isImportKind(value)) : void 0,
    settings: parseSettings(obj.settings)
  };
}
function parseServerEntries(value) {
  if (!isRecord2(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry) => isMcpServerDefinition(entry[1])));
}
function parseSettings(value) {
  if (!isRecord2(value)) return void 0;
  const toolPrefix = value.toolPrefix === "server" || value.toolPrefix === "short" || value.toolPrefix === "none" || value.toolPrefix === "mcp" ? value.toolPrefix : void 0;
  const directTools = typeof value.directTools === "boolean" ? value.directTools : void 0;
  const settings = {
    ...toolPrefix ? { toolPrefix } : {},
    ...directTools !== void 0 ? { directTools } : {},
    ...value.agentPluginPaths !== void 0 ? { agentPluginPaths: value.agentPluginPaths } : {}
  };
  return Object.keys(settings).length ? settings : void 0;
}
function mergeConfigs(base, next) {
  const imports = [...base.imports ?? [], ...next.imports ?? []];
  return {
    mcpServers: { ...base.mcpServers, ...next.mcpServers },
    imports: imports.length ? [...new Set(imports)] : void 0,
    settings: next.settings ? { ...base.settings, ...next.settings } : base.settings
  };
}
function expandImports(config, cwd) {
  if (!config.imports?.length) return config;
  const importedServers = {};
  for (const importKind of config.imports) {
    const importPath = resolveImportPath(importKind, cwd);
    if (!importPath) continue;
    let imported;
    try {
      imported = JSON.parse(fs2.readFileSync(importPath, "utf-8"));
    } catch {
      continue;
    }
    for (const [name, definition] of Object.entries(extractServers(imported, importKind))) {
      if (!importedServers[name]) importedServers[name] = definition;
    }
  }
  return {
    imports: config.imports,
    settings: config.settings,
    mcpServers: { ...importedServers, ...config.mcpServers }
  };
}
function resolveImportPath(importKind, cwd) {
  for (const candidate of IMPORT_PATHS[importKind]) {
    const fullPath = candidate.startsWith(".") ? path2.resolve(cwd, candidate) : candidate;
    if (fs2.existsSync(fullPath)) return fullPath;
  }
  return null;
}
function extractServers(config, kind) {
  if (!isRecord2(config)) return {};
  const obj = config;
  const servers = kind === "cursor" || kind === "windsurf" || kind === "vscode" ? obj.mcpServers ?? obj["mcp-servers"] : obj.mcpServers;
  return parseServerEntries(servers);
}
function validateSelectedServerDefinitions(config, selectors) {
  const { servers, tools } = parseMcpDirectToolSelectors(selectors);
  for (const serverName of /* @__PURE__ */ new Set([...servers, ...tools.keys()])) {
    const definition = config.mcpServers[serverName];
    if (definition) computeMcpServerHash(definition);
  }
}
function isServerCacheValid(entry, definition) {
  if (!entry || entry.configHash !== computeMcpServerHash(definition)) return false;
  if (!entry.cachedAt || typeof entry.cachedAt !== "number") return false;
  return Date.now() - entry.cachedAt <= CACHE_MAX_AGE_MS;
}
function computeMcpServerHash(definition) {
  const isStdio = definition.command !== void 0;
  const literalEnv = isStdio && definition.literalEnv === true;
  const identity = {
    command: resolveConfigPath(definition.command),
    args: definition.args,
    socket: resolveConfigPath(definition.socket),
    env: literalEnv ? definition.env : interpolateEnvRecord(definition.env),
    ...isStdio ? { inheritEnv: definition.inheritEnv !== false, literalEnv } : {},
    cwd: resolveConfigPath(definition.cwd),
    url: resolveServerUrl(definition),
    headers: interpolateEnvRecord(definition.headers),
    requestHeadersCommand: definition.requestHeadersCommand ? {
      command: interpolateEnvVars(definition.requestHeadersCommand.command),
      args: definition.requestHeadersCommand.args?.map(interpolateEnvVars),
      env: interpolateEnvRecord(definition.requestHeadersCommand.env),
      timeoutMs: definition.requestHeadersCommand.timeoutMs
    } : void 0,
    auth: definition.auth,
    bearerToken: resolveBearerToken(definition),
    bearerTokenEnv: definition.bearerTokenEnv,
    exposeResources: definition.exposeResources,
    includeTools: definition.includeTools,
    excludeTools: definition.excludeTools,
    protocolVersion: definition.protocolVersion
  };
  return createHash("sha256").update(stableStringify(identity)).digest("hex");
}
function isImportKind(value) {
  return typeof value === "string" && Object.hasOwn(IMPORT_PATHS, value);
}
function isRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function interpolateEnvRecord(values) {
  if (!values) return void 0;
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, interpolateSecretExpression(value)]));
}
function interpolateEnvVars(value) {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "").replace(/\$env:(\w+)/g, (_, name) => process.env[name] ?? "").replace(/\{env:(\w+)\}/g, (_, name) => process.env[name] ?? "");
}
function interpolateSecretExpression(value) {
  if (value.startsWith("!!")) return interpolateEnvVars(value.slice(1));
  return value.startsWith("!") ? value : interpolateEnvVars(value);
}
function getMissingEnvVars(value) {
  const missing = /* @__PURE__ */ new Set();
  for (const match of value.matchAll(/\$\{(\w+)\}|\$env:(\w+)|\{env:(\w+)\}/g)) {
    const name = match[1] ?? match[2] ?? match[3];
    if (name && process.env[name] === void 0) missing.add(name);
  }
  return [...missing];
}
function resolveServerUrl(definition) {
  if (definition.url == null) return void 0;
  if (typeof definition.url !== "string") throw new Error("MCP server URL must be a string");
  const missing = getMissingEnvVars(definition.url);
  if (missing.length > 0) {
    throw new Error(`Missing environment variable${missing.length === 1 ? "" : "s"} in MCP server URL: ${missing.join(", ")}`);
  }
  const resolved = interpolateEnvVars(definition.url);
  try {
    new URL(resolved);
  } catch (error) {
    throw new Error(`Invalid MCP server URL after environment interpolation: ${resolved}`, { cause: error });
  }
  return resolved;
}
function resolveConfigPath(value) {
  if (value === void 0) return void 0;
  const resolved = interpolateEnvVars(value);
  if (resolved === "~") return os2.homedir();
  if (resolved.startsWith("~/") || resolved.startsWith("~\\")) return path2.join(os2.homedir(), resolved.slice(2));
  return resolved;
}
function resolveBearerToken(definition) {
  if (definition.bearerToken !== void 0) return interpolateSecretExpression(definition.bearerToken);
  return definition.bearerTokenEnv ? process.env[definition.bearerTokenEnv] : void 0;
}
function stableStringify(value) {
  if (value === null || value === void 0 || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === void 0 ? "undefined" : serialized;
  }
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  const obj = value;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
}

// src/shared/runtime-module-path.ts
import * as fs3 from "node:fs";
import * as path3 from "node:path";
var RUNTIME_MODULE_EXTENSIONS = [".js", ".ts"];
function resolveRuntimeModuleExtension(dir, basename) {
  return RUNTIME_MODULE_EXTENSIONS.find((extension) => fs3.existsSync(path3.join(dir, `${basename}${extension}`))) ?? ".js";
}
function resolveRuntimeModulePath(dir, basename) {
  return path3.normalize(path3.join(dir, `${basename}${resolveRuntimeModuleExtension(dir, basename)}`));
}

// src/runs/shared/child-tool-plan.ts
var MAX_LAUNCH_RESOLVED_EXTENSION_IDS = 32;
var RUNTIME_EXTENSION_DIR = path4.dirname(fileURLToPath(new URL("../src/runs/shared/child-tool-plan.js", import.meta.url).href));
var FANOUT_CHILD_EXTENSION_DIR = path4.join(RUNTIME_EXTENSION_DIR, "..", "..", "extension");
var SUBAGENT_RUNTIME_EXTENSION_PATHS = new Set([
  path4.join(RUNTIME_EXTENSION_DIR, "subagent-prompt-runtime"),
  path4.join(RUNTIME_EXTENSION_DIR, "fast-mode-extension"),
  path4.join(FANOUT_CHILD_EXTENSION_DIR, "fanout-child")
].flatMap((base) => RUNTIME_MODULE_EXTENSIONS.map((extension) => path4.normalize(`${base}${extension}`))));
function isSubagentRuntimeExtensionPath(extensionPath) {
  return SUBAGENT_RUNTIME_EXTENSION_PATHS.has(path4.normalize(extensionPath));
}
var FAST_MODE_PROVIDER_PREFIX = "openai-codex/";
var OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH = 64;
function deriveForkPromptCacheKey(parentSessionId) {
  const parent = parentSessionId?.trim();
  if (!parent) return void 0;
  const digest = createHash2("sha256").update(parent).digest("hex").slice(0, OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH - "pi-fork:".length);
  return `pi-fork:${digest}`;
}
function sanitizeSupervisorChannelSegment(value) {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}
function supervisorChannelDir(runId, agent, childIndex) {
  return path4.join(
    TEMP_ROOT_DIR,
    "supervisor-channels",
    `${sanitizeSupervisorChannelSegment(runId)}-${sanitizeSupervisorChannelSegment(agent)}-${childIndex}`
  );
}
function applyThinkingSuffix(model, thinking, replaceExisting = false) {
  if (!model || !thinking) return model;
  const colonIdx = model.lastIndexOf(":");
  if (colonIdx !== -1 && THINKING_LEVELS.some((level) => level === model.substring(colonIdx + 1))) {
    return replaceExisting ? `${model.slice(0, colonIdx)}:${thinking}` : model;
  }
  return `${model}:${thinking}`;
}
function stripThinkingSuffix(model) {
  const colonIdx = model.lastIndexOf(":");
  if (colonIdx === -1) return model;
  return THINKING_LEVELS.some((level) => level === model.substring(colonIdx + 1)) ? model.slice(0, colonIdx) : model;
}
function resolveFastModeExtension(input) {
  if (!input.fast) return [];
  const candidates = (input.model ? [input.model] : []).map(stripThinkingSuffix);
  if (candidates.length === 0) {
    throw new Error(`fast mode requires an explicit supported native OpenAI-Codex model${input.agentName ? ` for agent '${input.agentName}'` : ""}.`);
  }
  const unsupported = candidates.filter((model) => !model.startsWith(FAST_MODE_PROVIDER_PREFIX));
  if (unsupported.length > 0) {
    throw new Error(`fast mode supports only native ${FAST_MODE_PROVIDER_PREFIX}* models; unsupported model${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}.`);
  }
  return [resolveRuntimeModulePath(RUNTIME_EXTENSION_DIR, "fast-mode-extension")];
}
function extensionIdentifier(value) {
  return `sha256:${createHash2("sha256").update(path4.normalize(value.trim())).digest("hex").slice(0, 16)}`;
}
function boundedExtensionIdentifiers(values) {
  const ids = [...new Set(values.map(extensionIdentifier))];
  return {
    ids: ids.slice(0, MAX_LAUNCH_RESOLVED_EXTENSION_IDS),
    omitted: Math.max(0, ids.length - MAX_LAUNCH_RESOLVED_EXTENSION_IDS)
  };
}
function hasPermissionRules(rules) {
  return rules !== void 0 && Object.keys(rules).length > 0;
}
function formatRuntimeSnapshotMcpServersError(agentName, serverNames) {
  const subject = agentName ? `Agent '${agentName}'` : "Subagent";
  return `${subject} selects MCP tools from servers that exist only in pi-mcp-adapter's runtime snapshot (${serverNames.join(", ")}). MCP servers from the runtime snapshot cannot be provided to in-process children; MCP tools must come from an ambient adapter extension in a background child (\`async: true\`), so add the server to the adapter's configuration file instead.`;
}
function isToolExtensionPath(entry) {
  return entry.includes("/") || entry.endsWith(".ts") || entry.endsWith(".js");
}
function assertNoToolModifierEntries(agentName, tools) {
  const entries = tools.filter((entry) => /^[+-]/u.test(entry) && !isToolExtensionPath(entry));
  if (entries.length === 0) return;
  const subject = agentName ? `Agent '${agentName}'` : "Subagent";
  throw new Error(`${subject} lists Pi tool modifier ${entries.length === 1 ? "entry" : "entries"} in \`tools\`: ${entries.join(", ")}. A child's \`tools\` list is the complete set of tools it gets, so +name and -name entries are not supported; name every tool the child needs, or omit \`tools\` and use \`excludeTools\` to drop one.`);
}
function projectLaunchResolvedChildExtensions(toolPlan) {
  const runtime = boundedExtensionIdentifiers(toolPlan.runtimeExtensions);
  const configured = boundedExtensionIdentifiers(toolPlan.configuredExtensions);
  const effective = boundedExtensionIdentifiers(toolPlan.extensionArgs);
  return {
    version: 1,
    source: "launch-resolved",
    disableAmbientExtensions: toolPlan.disableAmbientExtensions,
    runtime: runtime.ids,
    configured: configured.ids,
    required: toolPlan.requiredExtensions.map(({ id }) => id),
    effective: effective.ids,
    omitted: {
      runtime: runtime.omitted,
      configured: configured.omitted,
      required: 0,
      effective: effective.omitted
    }
  };
}
function resolvePermissionSystemExtension() {
  const agentDir = getAgentDir();
  const candidates = [
    // npm-scoped package (most common)
    path4.join(
      agentDir,
      "npm",
      "node_modules",
      "@gotgenes",
      "pi-permission-system"
    ),
    // direct extension directory (some layouts)
    path4.join(agentDir, "extensions", "pi-permission-system")
  ];
  const errors = [];
  for (const extDir of candidates) {
    if (!fs4.existsSync(extDir)) continue;
    const pkgPath = path4.join(extDir, "package.json");
    if (!fs4.existsSync(pkgPath)) {
      errors.push(new Error(`Permission-system package manifest is missing at ${pkgPath}.`));
      continue;
    }
    try {
      let pkg;
      const parsed = JSON.parse(fs4.readFileSync(pkgPath, "utf-8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("manifest root must be an object");
      }
      pkg = parsed;
      const extensions = pkg.pi?.extensions;
      const entry = Array.isArray(extensions) ? extensions[0] : void 0;
      if (typeof entry !== "string" || !entry.trim()) {
        throw new Error(
          `Permission-system package manifest at ${pkgPath} must declare pi.extensions[0] as a non-empty string.`
        );
      }
      const resolved = path4.resolve(extDir, entry);
      if (fs4.existsSync(resolved)) return resolved;
      throw new Error(
        `Permission-system extension entry ${JSON.stringify(entry)} in ${pkgPath} does not exist at ${resolved}.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message.startsWith("Permission-system") ? new Error(message) : new Error(`Cannot read permission-system package manifest at ${pkgPath}: ${message}`));
    }
  }
  if (errors.length > 0) throw errors[0];
  return void 0;
}
function resolvePiLaunchToolPlan(input) {
  const capabilityCeiling = intersectSubagentCapabilityCeilings(
    input.capabilityCeiling,
    input.inheritedCapabilityCeiling
  );
  const requiredExtensions = snapshotRequiredChildExtensions(input.requiredExtensions ?? []);
  if (requiredExtensions.length > 0 && capabilityCeiling?.denyExtensions) {
    throw new Error(`Capability ceiling from ${capabilityCeiling.sources.join(", ") || "unknown source"} denies extensions but this host requires: ${requiredExtensions.map(({ id }) => id).join(", ")}.`);
  }
  const allowedToolSet = capabilityCeiling?.allowedTools === void 0 ? void 0 : new Set(capabilityCeiling.allowedTools);
  const requestedBuiltinTools = input.tools?.filter((tool) => !isToolExtensionPath(tool)) ?? [];
  assertNoToolModifierEntries(input.agentName, input.tools ?? []);
  if (input.requireReadTool && allowedToolSet && !allowedToolSet.has("read")) {
    throw new Error(
      `Capability ceiling from ${capabilityCeiling?.sources.join(", ") || "unknown source"} excludes required tool 'read' for lazy skill loading.`
    );
  }
  const ceilingFilteredBuiltinTools = input.tools === void 0 ? allowedToolSet ? [...allowedToolSet].filter((tool) => tool !== "subagent_command") : [] : (input.requireReadTool && requestedBuiltinTools.length > 0 && !requestedBuiltinTools.includes("read") && !allowedToolSet ? ["read", ...requestedBuiltinTools] : requestedBuiltinTools).filter((tool) => !allowedToolSet || allowedToolSet.has(tool));
  const declaredBuiltinTools = ceilingFilteredBuiltinTools;
  const excludeTools = [...new Set((input.excludeTools ?? []).map((tool) => tool.trim()).filter(Boolean))];
  const excludedToolSet = new Set(excludeTools);
  const effectiveDeclaredBuiltinTools = declaredBuiltinTools.filter((tool) => !excludedToolSet.has(tool));
  const fanoutAuthorized = effectiveDeclaredBuiltinTools.includes("subagent") || input.allowNestedSubagents === true && !excludedToolSet.has("subagent") && (!allowedToolSet || allowedToolSet.has("subagent"));
  if (effectiveDeclaredBuiltinTools.includes("subagent_supervisor") && !fanoutAuthorized) {
    throw new Error("Tool 'subagent_supervisor' requires fanout authorization: include 'subagent' in the effective tools allowlist or enable allowNestedSubagents.");
  }
  const toolExtensionPaths = capabilityCeiling?.denyExtensions ? [] : (input.tools ?? []).filter(isToolExtensionPath);
  const mcpResolution = capabilityCeiling?.denyExtensions ? { selections: [], unresolvedSelectors: [] } : input.builtinMcpTools ? { selections: input.builtinMcpTools, unresolvedSelectors: [], builtin: true } : resolveMcpDirectToolResolution(input.mcpDirectTools, input.cwd, input.runtimeSnapshotHost);
  if (mcpResolution.runtimeServerNames?.length) {
    throw new Error(formatRuntimeSnapshotMcpServersError(input.agentName, mcpResolution.runtimeServerNames));
  }
  if (mcpResolution.unresolvedSelectors.length > 0) {
    throw new Error(mcpResolution.builtin ? formatUnresolvedBuiltinMcpSelectors(input.agentName, mcpResolution.unresolvedSelectors) : formatUnresolvedMcpDirectToolSelectors(mcpResolution.unresolvedSelectors));
  }
  const resolvedMcpSelections = mcpResolution.selections;
  const resolvedMcpNames = new Set(resolvedMcpSelections.map((selection) => selection.name));
  const legacyMcpNameCounts = mcpResolution.builtin ? /* @__PURE__ */ new Map() : countLegacyUnderscoreMcpToolNames(resolvedMcpSelections);
  const effectiveMcpSelections = resolvedMcpSelections.filter(
    (selection) => !allowedToolSet || allowedToolSet.has(selection.name) || isLegacyUnderscoreMcpToolAllowed(selection, allowedToolSet, resolvedMcpNames, legacyMcpNameCounts)
  ).filter((selection) => !excludedToolSet.has(selection.name));
  const effectiveMcpTools = effectiveMcpSelections.map(
    (selection) => selection.name
  );
  const builtinMcpTools = mcpResolution.builtin ? effectiveMcpSelections : void 0;
  const explicitToolAllowlist = input.tools !== void 0 || (input.mcpDirectTools?.length ?? 0) > 0 || allowedToolSet !== void 0;
  const internalTools = (input.structuredOutput ? ["structured_output"] : []).filter((tool) => !excludedToolSet.has(tool));
  const effectiveToolAllowlist = [
    .../* @__PURE__ */ new Set([
      ...effectiveDeclaredBuiltinTools,
      ...effectiveMcpTools,
      ...internalTools
    ])
  ];
  const legacySupervisorPairing = effectiveDeclaredBuiltinTools.includes("contact_supervisor");
  const requiredChildTools = explicitToolAllowlist ? [
    ...new Set([
      ...input.tools !== void 0 ? effectiveDeclaredBuiltinTools : [],
      ...input.mcpDirectTools?.length ? effectiveMcpTools : [],
      ...internalTools
    ].filter((tool) => tool !== "contact_supervisor" && (!legacySupervisorPairing || tool !== "intercom")))
  ] : [];
  const permSystemExt = capabilityCeiling?.denyExtensions ? void 0 : hasPermissionRules(input.permissionRules) ? resolvePermissionSystemExtension() : void 0;
  if (input.fast && capabilityCeiling?.denyExtensions) throw new Error("fast mode requires a child runtime extension, but this launch denies extensions.");
  const fastModeExtensions = resolveFastModeExtension({ fast: input.fast, model: input.model, agentName: input.agentName });
  const runtimeExtensions = [
    resolveRuntimeModulePath(RUNTIME_EXTENSION_DIR, "subagent-prompt-runtime"),
    ...fastModeExtensions,
    ...fanoutAuthorized ? [resolveRuntimeModulePath(FANOUT_CHILD_EXTENSION_DIR, "fanout-child")] : [],
    ...permSystemExt ? [permSystemExt] : []
  ];
  const disableAmbientExtensions = capabilityCeiling?.denyExtensions === true || input.extensions !== void 0;
  const warnings = [];
  if (capabilityCeiling?.denyExtensions !== true && Array.isArray(input.extensions) && input.extensions.length === 0) {
    const agentLabel = input.agentName ? ` for agent '${input.agentName}'` : "";
    warnings.push(
      `extensions: [] override${agentLabel} disables ALL ambient extensions for this child (not just "adds nothing"), including any model-provider extension needed to resolve a provider-qualified model. List the extensions this child actually needs instead of an empty array.`
    );
  }
  const configuredExtensions = capabilityCeiling?.denyExtensions ? [] : [
    ...toolExtensionPaths,
    ...input.extensions ?? [],
    ...input.subagentOnlyExtensions ?? []
  ];
  const ordinaryExtensionArgs = disableAmbientExtensions ? [.../* @__PURE__ */ new Set([...runtimeExtensions, ...configuredExtensions])] : [
    .../* @__PURE__ */ new Set([
      ...runtimeExtensions,
      ...toolExtensionPaths,
      ...input.subagentOnlyExtensions ?? []
    ])
  ];
  const extensionArgs = [.../* @__PURE__ */ new Set([...ordinaryExtensionArgs, ...requiredExtensions.map(({ path: path5 }) => path5)])];
  const requestedToolNames = input.tools !== void 0 ? [
    .../* @__PURE__ */ new Set([
      ...requestedBuiltinTools,
      ...resolvedMcpSelections.map((selection) => selection.name)
    ])
  ] : void 0;
  const capabilityAudit = capabilityCeiling ? {
    ceiling: capabilityCeiling,
    ...requestedToolNames ? { requestedTools: requestedToolNames } : {},
    effectiveTools: effectiveToolAllowlist,
    ...excludeTools.length > 0 ? { excludeTools } : {},
    removedTools: requestedToolNames?.filter(
      (tool) => !effectiveToolAllowlist.includes(tool)
    ) ?? [],
    internalTools,
    extensionsDenied: capabilityCeiling.denyExtensions,
    removedExtensionCount: capabilityCeiling.denyExtensions ? (input.extensions?.length ?? 0) + (input.subagentOnlyExtensions?.length ?? 0) + (input.tools ?? []).filter(isToolExtensionPath).length : 0,
    requestedMcpToolCount: input.mcpDirectTools?.length ?? 0,
    effectiveMcpTools,
    agentAllowed: input.agentName === void 0 ? true : isAgentAllowedByCapabilityCeiling(
      input.agentName,
      capabilityCeiling
    ),
    ...capabilityCeilingAgentRestrictionSources(capabilityCeiling) ? {
      agentRestrictionSources: capabilityCeilingAgentRestrictionSources(capabilityCeiling)
    } : {}
  } : void 0;
  return {
    ...capabilityCeiling ? { capabilityCeiling } : {},
    requestedBuiltinTools,
    declaredBuiltinTools,
    excludeTools,
    toolExtensionPaths,
    resolvedMcpSelections,
    effectiveMcpSelections,
    effectiveMcpTools,
    builtinMcpTools,
    explicitToolAllowlist,
    internalTools,
    effectiveToolAllowlist,
    requiredChildTools,
    fanoutAuthorized,
    runtimeExtensions,
    configuredExtensions,
    requiredExtensions,
    extensionArgs,
    disableAmbientExtensions,
    warnings,
    ...capabilityAudit ? { capabilityAudit } : {}
  };
}
function countLegacyUnderscoreMcpToolNames(selections) {
  const counts = /* @__PURE__ */ new Map();
  for (const selection of selections) {
    const legacyName = legacyUnderscoreMcpToolName(selection);
    if (legacyName !== selection.name) counts.set(legacyName, (counts.get(legacyName) ?? 0) + 1);
  }
  return counts;
}
function isLegacyUnderscoreMcpToolAllowed(selection, allowedToolSet, resolvedMcpNames, legacyMcpNameCounts) {
  const legacyName = legacyUnderscoreMcpToolName(selection);
  return legacyMcpNameCounts.get(legacyName) === 1 && !resolvedMcpNames.has(legacyName) && allowedToolSet.has(legacyName);
}
function legacyUnderscoreMcpToolName(selection) {
  const slash = selection.selector.indexOf("/");
  if (slash < 1) return selection.name;
  const toolName = selection.selector.slice(slash + 1);
  const suffix = `_${toolName}`;
  if (!selection.name.endsWith(suffix)) return selection.name;
  const prefix = selection.name.slice(0, -suffix.length);
  return `${prefix.replace(/-/g, "_")}${suffix}`;
}

export {
  extensionOnlyMcpServers,
  resolveRuntimeModulePath,
  isSubagentRuntimeExtensionPath,
  deriveForkPromptCacheKey,
  supervisorChannelDir,
  applyThinkingSuffix,
  assertNoToolModifierEntries,
  projectLaunchResolvedChildExtensions,
  resolvePiLaunchToolPlan
};
