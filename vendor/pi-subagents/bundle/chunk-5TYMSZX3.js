import {
  getAgentDir
} from "./chunk-CIZQXJ5Q.js";
import {
  TEMP_ARTIFACTS_DIR
} from "./chunk-5LFLVSTM.js";

// src/shared/artifacts.ts
import * as fs from "node:fs";
import * as path from "node:path";
var CLEANUP_MARKER_FILE = ".last-cleanup";
var PROJECT_SUBAGENTS_RELATIVE_DIR = ".pi/subagents";
var PROJECT_ARTIFACT_PATHS = [
  `${PROJECT_SUBAGENTS_RELATIVE_DIR}/artifacts/output.md`,
  `${PROJECT_SUBAGENTS_RELATIVE_DIR}/artifacts/run_worker_input.md`,
  `${PROJECT_SUBAGENTS_RELATIVE_DIR}/artifacts/run_worker_output.md`,
  `${PROJECT_SUBAGENTS_RELATIVE_DIR}/artifacts/run_worker.jsonl`,
  `${PROJECT_SUBAGENTS_RELATIVE_DIR}/artifacts/run_worker_transcript.jsonl`,
  `${PROJECT_SUBAGENTS_RELATIVE_DIR}/artifacts/run_worker_meta.json`,
  `${PROJECT_SUBAGENTS_RELATIVE_DIR}/artifacts/progress/run/progress.md`,
  `${PROJECT_SUBAGENTS_RELATIVE_DIR}/artifacts/outputs/output.md`,
  `${PROJECT_SUBAGENTS_RELATIVE_DIR}/artifacts/outputs/run/output.md`,
  `${PROJECT_SUBAGENTS_RELATIVE_DIR}/chain-runs/run.json`
];
function globMatchesPath(pattern, filePath) {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === void 0) break;
    if (character === "*" && pattern[index + 1] === "*") {
      index += 1;
      if (pattern[index + 1] === "/") {
        index += 1;
        expression += "(?:.*/)?";
      } else {
        expression += ".*";
      }
    } else if (character === "*") {
      expression += "[^/]*";
    } else if (character === "?") {
      expression += "[^/]";
    } else if (character === "[") {
      const end = pattern.indexOf("]", index + 1);
      if (end === -1) expression += "\\[";
      else {
        expression += pattern.slice(index, end + 1);
        index = end;
      }
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  try {
    return new RegExp(`${expression}$`).test(filePath);
  } catch {
    return false;
  }
}
function normalizePattern(pattern) {
  return pattern.replace(/^\.\//, "").replace(/^\//, "").replace(/\/+$/, "");
}
function patternMatchesArtifactPath(pattern, artifactPath) {
  const normalized = normalizePattern(pattern);
  return normalized === PROJECT_SUBAGENTS_RELATIVE_DIR || normalized === "*" || artifactPath.startsWith(`${normalized}/`) || globMatchesPath(normalized, artifactPath);
}
function ignoreFileExcludesProjectArtifacts(filePath) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const excluded = /* @__PURE__ */ new Set();
    for (const rawLine of fs.readFileSync(filePath, "utf-8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const negated = line.startsWith("!");
      const pattern = negated ? line.slice(1) : line;
      for (const artifactPath of PROJECT_ARTIFACT_PATHS) {
        if (!patternMatchesArtifactPath(pattern, artifactPath)) continue;
        if (negated) excluded.delete(artifactPath);
        else excluded.add(artifactPath);
      }
    }
    return excluded.size === PROJECT_ARTIFACT_PATHS.length;
  } catch {
    return false;
  }
}
function filesIncludeProjectArtifacts(files) {
  if (!Array.isArray(files)) return void 0;
  const included = /* @__PURE__ */ new Set();
  for (const entry of files) {
    if (typeof entry !== "string") continue;
    const negated = entry.startsWith("!");
    const pattern = negated ? entry.slice(1) : entry;
    for (const artifactPath of PROJECT_ARTIFACT_PATHS) {
      if (!patternMatchesArtifactPath(pattern, artifactPath)) continue;
      if (negated) included.delete(artifactPath);
      else included.add(artifactPath);
    }
  }
  return included.size > 0;
}
function getProjectArtifactPackagingWarning(cwd) {
  const packagePath = path.join(cwd, "package.json");
  if (!fs.existsSync(packagePath)) return void 0;
  let packageJson;
  try {
    const parsed = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return void 0;
    packageJson = parsed;
  } catch {
    return void 0;
  }
  const filesIncludeArtifacts = filesIncludeProjectArtifacts(packageJson.files);
  if (filesIncludeArtifacts === false) return void 0;
  const npmIgnorePath = path.join(cwd, ".npmignore");
  const ignorePath = fs.existsSync(npmIgnorePath) ? npmIgnorePath : path.join(cwd, ".gitignore");
  if (filesIncludeArtifacts === void 0 && ignoreFileExcludesProjectArtifacts(ignorePath)) return void 0;
  return "Project-scoped subagent artifacts can be included when this package is published. Add '.pi/subagents/' to .npmignore, restrict package.json files, or set artifactDir to 'session' or 'temp'.";
}
function getProjectSubagentsDir(cwd) {
  return path.join(cwd, PROJECT_SUBAGENTS_RELATIVE_DIR);
}
function getProjectArtifactsDir(cwd) {
  return path.join(getProjectSubagentsDir(cwd), "artifacts");
}
function getArtifactsDir(sessionFile, projectCwd, dirPreference = "session") {
  switch (dirPreference) {
    case "session":
      if (sessionFile) {
        const sessionDir = path.dirname(sessionFile);
        return path.join(sessionDir, "subagent-artifacts");
      }
      return TEMP_ARTIFACTS_DIR;
    case "temp":
      return TEMP_ARTIFACTS_DIR;
    case "project":
      if (projectCwd) return getProjectArtifactsDir(projectCwd);
      if (sessionFile) {
        const sessionDir = path.dirname(sessionFile);
        return path.join(sessionDir, "subagent-artifacts");
      }
      return TEMP_ARTIFACTS_DIR;
    default:
      throw new Error(`Unsupported artifactDir ${JSON.stringify(dirPreference)}; expected "project", "session", or "temp".`);
  }
}
function getArtifactPaths(artifactsDir, runId, agent, index) {
  const suffix = index !== void 0 ? `_${index}` : "";
  const safeAgent = agent.replace(/[^\w.-]/g, "_");
  const base = `${runId}_${safeAgent}${suffix}`;
  return {
    inputPath: path.join(artifactsDir, `${base}_input.md`),
    outputPath: path.join(artifactsDir, `${base}_output.md`),
    jsonlPath: path.join(artifactsDir, `${base}.jsonl`),
    transcriptPath: path.join(artifactsDir, `${base}_transcript.jsonl`),
    metadataPath: path.join(artifactsDir, `${base}_meta.json`)
  };
}
function ensureArtifactsDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function writeArtifact(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}
function formatOutputArtifactContent(input) {
  if (input.output.trim() || !input.error) return input.output;
  const lines = ["Subagent run failed before producing output.", "", "Error:", input.error];
  if (input.transcriptPath) lines.push("", `Transcript: ${input.transcriptPath}`);
  if (input.metadataPath) lines.push(`Metadata: ${input.metadataPath}`);
  return lines.join("\n");
}
function writeMetadata(filePath, metadata) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), "utf-8");
}
function appendJsonl(filePath, line) {
  fs.appendFileSync(filePath, `${line}
`);
}
function cleanupOldArtifacts(dir, maxAgeDays) {
  if (maxAgeDays <= 0 || !fs.existsSync(dir)) return;
  const markerPath = path.join(dir, CLEANUP_MARKER_FILE);
  const now = Date.now();
  if (fs.existsSync(markerPath)) {
    const stat = fs.statSync(markerPath);
    if (now - stat.mtimeMs < 24 * 60 * 60 * 1e3) return;
  }
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1e3;
  const cutoff = now - maxAgeMs;
  for (const file of fs.readdirSync(dir)) {
    if (file === CLEANUP_MARKER_FILE) continue;
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    } catch {
    }
  }
  fs.writeFileSync(markerPath, String(now));
}
function cleanupAllArtifactDirs(maxAgeDays) {
  cleanupOldArtifacts(TEMP_ARTIFACTS_DIR, maxAgeDays);
  const sessionsBase = path.join(getAgentDir(), "sessions");
  if (!fs.existsSync(sessionsBase)) return;
  let dirs;
  try {
    dirs = fs.readdirSync(sessionsBase);
  } catch {
    return;
  }
  for (const dir of dirs) {
    const artifactsDir = path.join(sessionsBase, dir, "subagent-artifacts");
    try {
      cleanupOldArtifacts(artifactsDir, maxAgeDays);
    } catch {
    }
  }
}

export {
  PROJECT_SUBAGENTS_RELATIVE_DIR,
  getProjectArtifactPackagingWarning,
  getProjectSubagentsDir,
  getArtifactsDir,
  getArtifactPaths,
  ensureArtifactsDir,
  writeArtifact,
  formatOutputArtifactContent,
  writeMetadata,
  appendJsonl,
  cleanupOldArtifacts,
  cleanupAllArtifactDirs
};
