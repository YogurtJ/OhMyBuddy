import {
  HERDR_PI_MODE_ENV
} from "./chunk-4QFZZV3O.js";

// src/shared/package-version.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
var packagePath = path.resolve(path.dirname(fileURLToPath(new URL("../src/shared/package-version.js", import.meta.url).href)), "..", "..", "package.json");
function readInstalledPackageVersion() {
  const parsed = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
  if (typeof parsed.version !== "string" || !parsed.version.trim()) {
    throw new Error(`Invalid package version in '${packagePath}'.`);
  }
  return parsed.version;
}
var loadedPackageVersion = readInstalledPackageVersion();

// index.ts
var registerExtension = process.env[HERDR_PI_MODE_ENV] === "1" ? (await import("./chunk-JYUKW2SY.js")).default : process.env.PI_SUBAGENT_CHILD === "1" ? void 0 : (await import("./chunk-IVAE5Z6Q.js")).default;
function registerSubagentExtension(pi) {
  const installedVersion = readInstalledPackageVersion();
  if (installedVersion !== loadedPackageVersion) {
    throw new Error(`pi-subagents ${installedVersion} is installed, but this Pi process still has ${loadedPackageVersion} loaded. Restart Pi to load the update; /reload cannot replace extension modules that Node has already loaded.`);
  }
  registerExtension?.(pi);
}
export {
  registerSubagentExtension as default
};
