import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { writeAtomicJson } from "../shared/atomic-json.js";
import { currentBootId, currentRecordedPid } from "../runs/background/boot-id.js";
import { currentPidNamespaceScope } from "../runs/background/pid-namespace.js";
import { checkRecordedPidLiveness, isRecordedPid } from "../runs/background/stale-run-reconciler.js";
import { readWorkflowLaunchRecord } from "./workflow-launch-record.js";
const CLAIM_FILE_PATTERN = /^resumed-by\.([1-9][0-9]*)\.json$/;
const RELEASED_CLAIM_FILE_PATTERN = /^resumed-by\.([1-9][0-9]*)\.json\.released-/;
const REFUSAL_FILE = "resume-refused.json";
const MAX_CLAIM_ROUNDS = 8;
// Claims this process holds, shared by every runtime in the process so a reload keeps them.
const heldClaimsKey = Symbol.for("pi-subagents.workflow-resume-claims.v1");
const heldClaimsGlobal = globalThis;
const heldClaims = heldClaimsGlobal[heldClaimsKey] ?? (heldClaimsGlobal[heldClaimsKey] = new Set());
function claimFilePath(asyncDir, generation) {
    return path.join(asyncDir, `resumed-by.${generation}.json`);
}
function isClaim(value) {
    if (!isRecordedPid(value) || Array.isArray(value))
        return false;
    const claim = value;
    return claim.version === 1
        && typeof claim.claimedAt === "number"
        && typeof claim.newRunId === "string" && claim.newRunId.length > 0
        && (claim.trigger === "auto" || claim.trigger === "manual" || claim.trigger === "reuse");
}
function readTopClaim(asyncDir, retries = 3) {
    let generation = 0;
    let releasedGeneration = 0;
    try {
        for (const name of fs.readdirSync(asyncDir)) {
            const live = CLAIM_FILE_PATTERN.exec(name);
            if (live)
                generation = Math.max(generation, Number(live[1]));
            const released = RELEASED_CLAIM_FILE_PATTERN.exec(name);
            if (released)
                releasedGeneration = Math.max(releasedGeneration, Number(released[1]));
        }
    }
    catch (error) {
        return error.code === "ENOENT" ? { kind: "open", generation: 0 } : { kind: "unreadable" };
    }
    // A live file and a released one with the same n: the live one was created after the release.
    if (releasedGeneration > generation || generation === 0)
        return { kind: "open", generation: Math.max(releasedGeneration, generation) };
    const filePath = claimFilePath(asyncDir, generation);
    let text;
    try {
        text = fs.readFileSync(filePath, "utf-8");
    }
    catch (error) {
        // A release renamed it after the listing: look again.
        if (error.code === "ENOENT" && retries > 0)
            return readTopClaim(asyncDir, retries - 1);
        return { kind: "unreadable" };
    }
    try {
        const value = JSON.parse(text);
        // The file is created whole, so a body that does not parse is corrupt, not half-written.
        return isClaim(value) ? { kind: "claim", generation, filePath, claim: value } : { kind: "open", generation };
    }
    catch {
        return { kind: "open", generation };
    }
}
export function readWorkflowResumeClaim(asyncDir) {
    const top = readTopClaim(asyncDir);
    return top.kind === "claim" ? top.claim : undefined;
}
/** True once the run that resumes the run in `sourceAsyncDir` as `newRunId` has written its first status. */
export function resumedRunStarted(sourceAsyncDir, newRunId) {
    return path.basename(newRunId) === newRunId
        && fs.existsSync(path.join(path.dirname(sourceAsyncDir), newRunId, "status.json"));
}
function claimantLiveness(filePath, claim, liveness) {
    // A reload keeps the pid, so this process's own claim counts only while one of its runtimes holds
    // it. The same pid in another pid namespace (a container sharing the temp root) is another process.
    if (claim.pid === process.pid && claim.bootId === currentBootId() && claim.pidNamespaceScope === currentPidNamespaceScope())
        return heldClaims.has(filePath) ? "alive" : "dead";
    return liveness ? liveness(claim) : checkRecordedPidLiveness(claim);
}
/** Read-only view for reuse readers and auto-resume: a dead, corrupt, or missing claim blocks nothing. */
export function workflowResumeClaimState(asyncDir, options = {}) {
    const top = readTopClaim(asyncDir);
    if (top.kind === "unreadable")
        return { kind: "unreadable" };
    if (top.kind !== "claim")
        return { kind: "none" };
    if (resumedRunStarted(asyncDir, top.claim.newRunId))
        return { kind: "resumed", newRunId: top.claim.newRunId };
    return claimantLiveness(top.filePath, top.claim, options.liveness) === "dead" ? { kind: "none" } : { kind: "busy", pid: top.claim.pid, newRunId: top.claim.newRunId };
}
/** Creates the claim file only if none exists, with its whole body in place at once. */
function createClaimFile(filePath, claim) {
    const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
        fs.writeFileSync(tempPath, JSON.stringify(claim, null, 2), "utf-8");
        fs.linkSync(tempPath, filePath);
        return true;
    }
    catch (error) {
        if (error.code === "EEXIST")
            return false;
        throw error;
    }
    finally {
        fs.rmSync(tempPath, { force: true });
    }
}
/**
 * Claims the right to continue the stopped run in `asyncDir` as `newRunId`. A dead claimant is
 * superseded by the next generation file; of several takers, the one whose exclusive create
 * succeeds owns the run, and the others see its live claim on their next read.
 */
export function claimWorkflowResume(asyncDir, input) {
    const claim = {
        version: 1,
        ...currentRecordedPid(),
        claimedAt: input.now ?? Date.now(),
        newRunId: input.newRunId,
        trigger: input.trigger,
    };
    for (let round = 0; round < MAX_CLAIM_ROUNDS; round++) {
        const top = readTopClaim(asyncDir);
        if (top.kind === "unreadable")
            return { kind: "unreadable" };
        if (top.kind === "claim") {
            // Already claimed for this exact new run, as a resume does before it launches.
            if (top.claim.newRunId === input.newRunId && top.claim.pid === process.pid) {
                heldClaims.add(top.filePath);
                return { kind: "owner" };
            }
            if (resumedRunStarted(asyncDir, top.claim.newRunId))
                return { kind: "resumed", newRunId: top.claim.newRunId };
            if (claimantLiveness(top.filePath, top.claim, input.liveness) !== "dead")
                return { kind: "busy", pid: top.claim.pid };
        }
        const filePath = claimFilePath(asyncDir, top.generation + 1);
        if (createClaimFile(filePath, claim)) {
            heldClaims.add(filePath);
            return { kind: "owner" };
        }
        // Another taker created that generation first: decide again from its claim.
    }
    // Every round lost to another taker; fail closed with whatever claim is there now.
    const top = readTopClaim(asyncDir);
    return top.kind === "claim" ? { kind: "busy", pid: top.claim.pid } : { kind: "unreadable" };
}
/** Gives up this process's claim on a launch that did not start, so the run can be continued again. */
export function releaseWorkflowResumeClaim(asyncDir, newRunId) {
    const top = readTopClaim(asyncDir);
    if (top.kind !== "claim" || top.claim.newRunId !== newRunId || top.claim.pid !== process.pid)
        return;
    // The only rename in the protocol: the owner moves its own claim aside.
    try {
        fs.renameSync(top.filePath, `${top.filePath}.released-${randomUUID()}`);
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
    }
    heldClaims.delete(top.filePath);
}
export function recordWorkflowResumeRefusal(asyncDir, refusal, now = Date.now()) {
    writeAtomicJson(path.join(asyncDir, REFUSAL_FILE), { version: 1, ...refusal, refusedAt: now });
}
function readWorkflowResumeRefusal(asyncDir) {
    try {
        const value = JSON.parse(fs.readFileSync(path.join(asyncDir, REFUSAL_FILE), "utf-8"));
        return value?.version === 1 && typeof value.reason === "string" && typeof value.byHand === "string" && typeof value.refusedAt === "number"
            && (value.newRunId === undefined || typeof value.newRunId === "string")
            ? value
            : undefined;
    }
    catch {
        return undefined;
    }
}
export function resumeByHandText(runId) {
    return `Resume by hand: subagent({ action: "resume", id: "${runId}" })`;
}
export function relaunchByHandText(runId) {
    return `Relaunch it by hand with options: { reuseFrom: "${runId}" }.`;
}
/** `<reason>. <byHand>`; some reasons quote a message that already ends in a period. */
export function refusalSentence(reason, byHand) {
    return `${reason.replace(/\.$/, "")}.${byHand ? ` ${byHand}` : ""}`;
}
/** A refusal was recorded for this run; the run is not tried again automatically. */
export function hasWorkflowResumeRefusal(asyncDir) {
    return fs.existsSync(path.join(asyncDir, REFUSAL_FILE));
}
const RESUMED_AS = { auto: "Auto-resumed as", manual: "Resumed as", reuse: "Relaunched as" };
/**
 * The one line an interrupted workflow's notice carries about what happens next: the recorded
 * auto-resume refusal, else who continues the run, else how to continue it by hand.
 */
export function describeWorkflowResume(asyncDir, runId) {
    const claim = readWorkflowResumeClaim(asyncDir);
    const refusal = readWorkflowResumeRefusal(asyncDir);
    if (refusal && (!claim || refusal.newRunId === claim.newRunId)) {
        return `Not auto-resumed: ${refusalSentence(refusal.reason, refusal.byHand)}`;
    }
    if (claim)
        return `${RESUMED_AS[claim.trigger]} ${claim.newRunId}.`;
    const launch = readWorkflowLaunchRecord(asyncDir);
    return launch.ok && launch.record.source !== "structured" ? resumeByHandText(runId) : relaunchByHandText(runId);
}
