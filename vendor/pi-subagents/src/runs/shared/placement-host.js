import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir } from "../../shared/utils.js";
const HERDR_ALLOCATION_LOCK_TIMEOUT_MS = 10_000, HERDR_ALLOCATION_LOCK_POLL_MS = 25;
export function herdrPaneAllocationKey(target, session, cwd) { return JSON.stringify([target, session, cwd]); }
function assertPrivateDir(directory) { const stat = fs.lstatSync(directory); if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 || (typeof process.getuid === "function" && stat.uid !== process.getuid()))
    throw new Error("Herdr allocation path is not a mode-0700 agent-private owned directory."); }
function ensurePrivateChild(parent, name) { const directory = path.join(parent, name); try {
    fs.mkdirSync(directory, { mode: 0o700 });
}
catch (error) {
    if (error.code !== "EEXIST")
        throw error;
} assertPrivateDir(directory); return directory; }
function allocationLockRoot() { const agentDir = getAgentDir(); fs.mkdirSync(agentDir, { recursive: true, mode: 0o700 }); assertPrivateDir(agentDir); const packageDir = ensurePrivateChild(agentDir, "pi-subagents"); return ensurePrivateChild(packageDir, "herdr-allocation-locks"); }
function livePid(pid) { try {
    process.kill(pid, 0);
    return true;
}
catch (error) {
    return error.code === "EPERM";
} }
function readAllocationOwner(ownerPath) { const descriptor = fs.openSync(ownerPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)); try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || (typeof process.getuid === "function" && stat.uid !== process.getuid()))
        throw new Error("Herdr allocation lock owner record is unsafe.");
    const value = JSON.parse(fs.readFileSync(descriptor, "utf8"));
    if (typeof value.pid !== "number" || !Number.isSafeInteger(value.pid) || value.pid <= 0 || typeof value.token !== "string" || !/^[a-f0-9]{32}$/u.test(value.token))
        throw new Error("Herdr allocation lock owner record is malformed.");
    return { pid: value.pid, token: value.token, dev: stat.dev, ino: stat.ino };
}
finally {
    fs.closeSync(descriptor);
} }
function sameOwner(left, right) { return left.token === right.token && left.dev === right.dev && left.ino === right.ino; }
export async function withHerdrPaneAllocationLock(key, action, options = {}) {
    const root = allocationLockRoot(), digest = createHash("sha256").update(key).digest("hex"), lockPath = path.join(root, `${digest}.lock`), recoveryPath = path.join(root, `${digest}.recovery`), token = randomBytes(16).toString("hex"), tempPath = path.join(root, `.${digest}.${token}.tmp`), deadline = Date.now() + (options.timeoutMs ?? HERDR_ALLOCATION_LOCK_TIMEOUT_MS);
    let published;
    try {
        fs.writeFileSync(tempPath, JSON.stringify({ pid: process.pid, token, createdAt: Date.now() }), { mode: 0o600, flag: "wx" });
        const tempOwner = readAllocationOwner(tempPath);
        for (;;) {
            let recovering = false;
            try {
                readAllocationOwner(recoveryPath);
                recovering = true;
            }
            catch (error) {
                if (error.code !== "ENOENT")
                    throw error;
            }
            if (!recovering) {
                let linked = false;
                try {
                    fs.linkSync(tempPath, lockPath);
                    linked = true;
                    try {
                        readAllocationOwner(recoveryPath);
                        const current = readAllocationOwner(lockPath);
                        if (!sameOwner(current, tempOwner))
                            throw new Error("Herdr allocation lock changed during publication.");
                        fs.unlinkSync(lockPath);
                    }
                    catch (recoveryError) {
                        if (recoveryError.code !== "ENOENT")
                            throw recoveryError;
                        published = readAllocationOwner(lockPath);
                        if (!sameOwner(published, tempOwner))
                            throw new Error("Herdr allocation lock publication identity changed.");
                        break;
                    }
                }
                catch (publishError) {
                    if (linked) {
                        try {
                            const current = readAllocationOwner(lockPath);
                            if (sameOwner(current, tempOwner))
                                fs.unlinkSync(lockPath);
                        }
                        catch { }
                    }
                    if (publishError.code !== "EEXIST" && publishError.code !== "ENOENT")
                        throw publishError;
                }
            }
            if (published)
                break;
            try {
                const current = readAllocationOwner(lockPath);
                if (!livePid(current.pid)) {
                    let claimed = false;
                    try {
                        fs.linkSync(lockPath, recoveryPath);
                        claimed = true;
                        const recovery = readAllocationOwner(recoveryPath), latest = readAllocationOwner(lockPath);
                        if (!sameOwner(recovery, current) || !sameOwner(latest, current))
                            throw new Error("Herdr stale lock identity changed during recovery.");
                        fs.unlinkSync(lockPath);
                    }
                    catch (error) {
                        if (error.code !== "EEXIST" && error.code !== "ENOENT")
                            throw error;
                    }
                    finally {
                        if (claimed)
                            fs.unlinkSync(recoveryPath);
                    }
                    if (claimed)
                        continue;
                }
            }
            catch (error) {
                if (error.code !== "ENOENT")
                    throw error;
            }
            if (Date.now() >= deadline)
                throw new Error("Timed out waiting for the Herdr pane allocation lock.");
            await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? HERDR_ALLOCATION_LOCK_POLL_MS));
        }
        fs.unlinkSync(tempPath);
        let value, actionError, releaseError, actionFailed = false, releaseFailed = false;
        try {
            value = await action();
        }
        catch (error) {
            actionFailed = true;
            actionError = error;
        }
        try {
            const current = readAllocationOwner(lockPath);
            if (!published || !sameOwner(current, published))
                throw new Error("Herdr pane allocation lock ownership changed before release.");
            fs.unlinkSync(lockPath);
        }
        catch (error) {
            releaseFailed = true;
            releaseError = error;
        }
        if (actionFailed && releaseFailed)
            throw new AggregateError([actionError, releaseError], "Herdr pane allocation action and release both failed.", { cause: actionError });
        if (actionFailed)
            throw actionError;
        if (releaseFailed)
            throw releaseError;
        return value;
    }
    finally {
        try {
            fs.unlinkSync(tempPath);
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
    }
}
