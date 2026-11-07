'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { readVerifiedFile } = require('../pi-file-bytes');
const { pathAccess, resolvePiPath, resolveShellPath, within } = require('./bot-guard-paths');

const GREP_LIMITS = Object.freeze({ entries: 4096, files: 512, fileBytes: 1024 * 1024, totalBytes: 8 * 1024 * 1024,
    discoveryBytes: 1024 * 1024, positionsBytes: 256 * 1024, outputBytes: 50 * 1024, lineChars: 500, milliseconds: 5000 });
const unavailable = () => new Error('Managed Bot grep could not complete safely. Refine the path, glob or pattern; no native directory-search fallback was used.');
const denied = () => new Error('Managed Bot grep excludes protected paths and file aliases.');

// Discovery reads names/ignore rules only. Content matching receives exclusively verified
// buffers on stdin; rg never reopens a discovered content file. Never return raw stderr.
function runRg(executable, args, { cwd, signal, deadline, maxBytes, input }) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted || Date.now() >= deadline) { reject(unavailable()); return; }
        const child = spawn(executable, args, { cwd, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'ignore'], windowsHide: true });
        const chunks = [];
        let bytes = 0, limited = false, failed = false;
        const stop = () => { child.kill('SIGKILL'); };
        const timer = setTimeout(() => { failed = true; stop(); }, Math.max(1, deadline - Date.now()));
        const abort = () => { failed = true; stop(); };
        signal?.addEventListener('abort', abort, { once: true });
        child.stdout.on('data', chunk => {
            const remaining = maxBytes - bytes;
            if (remaining > 0) { const part = chunk.subarray(0, remaining); chunks.push(part); bytes += part.length; }
            if (chunk.length > remaining) { limited = true; stop(); }
        });
        child.on('error', () => { failed = true; });
        child.on('close', code => {
            clearTimeout(timer); signal?.removeEventListener('abort', abort);
            if (failed || signal?.aborted || !limited && code !== 0 && code !== 1) reject(unavailable());
            else resolve({ bytes: Buffer.concat(chunks, bytes), limited });
        });
        if (input) { child.stdin.on('error', () => { /* EPIPE after a match/output limit; close still owns completion. */ }); child.stdin.end(input); }
    });
}
function validateInput(input) {
    if (!input || typeof input.pattern !== 'string' || input.pattern.length > 4096 || /[\x00\r\n]/.test(input.pattern)
        || input.path !== undefined && (typeof input.path !== 'string' || input.path.length > 4096)
        || input.glob !== undefined && (typeof input.glob !== 'string' || input.glob.length > 1024 || /[\x00\r\n]/.test(input.glob))
        || ['ignoreCase', 'literal'].some(key => input[key] !== undefined && typeof input[key] !== 'boolean')
        || input.context !== undefined && (!Number.isSafeInteger(input.context) || input.context < 0 || input.context > 20)
        || input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1000)) throw unavailable();
}
async function botGrep(input, { cwd, agentDir, preset, signal }) {
    validateInput(input);
    const deadline = Date.now() + GREP_LIMITS.milliseconds;
    const requested = resolvePiPath(input.path || '.', cwd);
    const unrestricted = preset === 'free';
    const rootAccess = pathAccess(requested, cwd, agentDir, resolveShellPath);
    if (rootAccess === 'invalid' || (!unrestricted && rootAccess === 'credential')) throw denied();
    const allowState = unrestricted || preset === 'balanced' || rootAccess === 'state';
    const allowCredential = unrestricted || (preset === 'balanced' && rootAccess === 'credential');
    const root = await fs.promises.realpath(requested), stat = await fs.promises.stat(root);
    if (!stat.isDirectory() && !stat.isFile()) throw denied();
    const directory = stat.isDirectory();
    const check = actual => {
        const access = pathAccess(actual, cwd, agentDir, resolveShellPath);
        if (!(directory ? within(root, actual) : actual === root) || access === 'invalid' || (!allowCredential && access === 'credential') || (!allowState && access === 'state')) throw denied();
    };
    const localRg = path.join(agentDir, 'bin', process.platform === 'win32' ? 'rg.exe' : 'rg');
    const executable = fs.existsSync(localRg) ? localRg : 'rg';
    let candidates = [root], partial = false;
    if (directory) {
        const args = ['--no-config', '--files', '--null', '--hidden'];
        if (input.glob) args.push('--glob', input.glob);
        args.push('--', root);
        const listed = await runRg(executable, args, { cwd, signal, deadline, maxBytes: GREP_LIMITS.discoveryBytes });
        // A cut final filename is discarded, never interpreted as another file.
        const names = listed.bytes.subarray(0, listed.bytes.lastIndexOf(0) + 1).toString('utf8').split('\0').filter(Boolean);
        partial = listed.limited || names.length > GREP_LIMITS.entries;
        candidates = names.slice(0, GREP_LIMITS.entries);
    }
    const files = [];
    let totalBytes = 0, readFiles = 0;
    for (const candidate of candidates) {
        if (signal?.aborted) throw unavailable();
        if (Date.now() >= deadline || readFiles >= GREP_LIMITS.files) { partial = true; break; }
        try { check(candidate); } catch { continue; }
        try {
            const before = await fs.promises.lstat(candidate, { bigint: true });
            if (!before.isFile()) continue;
            if (before.size > BigInt(GREP_LIMITS.fileBytes) || totalBytes + Number(before.size) > GREP_LIMITS.totalBytes) { partial = true; continue; }
            readFiles++;
            // Reserve the observed size before awaiting the read. Failed/changing
            // files still consume the total allowance; growth cannot borrow more.
            const allowance = Number(before.size);
            totalBytes += allowance;
            const file = await readVerifiedFile(candidate, { check, maxBytes: allowance, signal });
            if (!file.bytes.length) continue;
            // Text-only scope avoids binary matches and ambiguous lossy decoding.
            if (file.bytes.includes(0)) { partial = true; continue; }
            let text;
            try { text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes); } catch { partial = true; continue; }
            const lines = text.split('\n');
            if (text.endsWith('\n')) lines.pop();
            files.push({ bytes: file.bytes, lines,
                label: directory ? path.relative(root, candidate).split(path.sep).join('/') : path.basename(root) });
        } catch { if (signal?.aborted) throw unavailable(); partial = true; }
    }
    const limit = input.limit ?? 100, context = input.context ?? 0;
    const output = [];
    let outputBytes = 0, matchCount = 0, searched = 0, searchedBytes = 0, linesTruncated = false, outputTruncated = false;
    for (const file of files) {
        if (Date.now() >= deadline) { partial = true; break; }
        const args = ['--no-config', '--line-number', '--only-matching', '--replace', '', '--color=never', '--max-count', String(limit - matchCount)];
        if (input.ignoreCase) args.push('--ignore-case');
        if (input.literal) args.push('--fixed-strings');
        args.push('--', input.pattern, '-');
        const matched = await runRg(executable, args, { cwd, signal, deadline, maxBytes: GREP_LIMITS.positionsBytes, input: file.bytes });
        searched++; searchedBytes += file.bytes.length;
        partial ||= matched.limited;
        const numbers = [...new Set(matched.bytes.toString('utf8').split('\n').filter(row => /^\d+:$/.test(row)).map(row => Number(row.slice(0, -1))))];
        for (const number of numbers) {
            if (number < 1 || number > file.lines.length) throw unavailable();
            matchCount++;
            const line = number - 1;
            for (let index = Math.max(0, line - context); index <= Math.min(file.lines.length - 1, line + context); index++) {
                let text = file.lines[index].replace(/\r/g, '');
                if (text.length > GREP_LIMITS.lineChars) { text = `${text.slice(0, GREP_LIMITS.lineChars)}…`; linesTruncated = true; }
                const row = index === line ? `${file.label}:${index + 1}: ${text}` : `${file.label}-${index + 1}- ${text}`;
                if (outputBytes + Buffer.byteLength(row) + 1 > GREP_LIMITS.outputBytes) { outputTruncated = true; break; }
                output.push(row); outputBytes += Buffer.byteLength(row) + 1;
            }
            if (outputTruncated || matchCount >= limit) break;
        }
        if (outputTruncated || matchCount >= limit) break;
    }
    const notices = ['Managed Bot grep excludes protected files and aliases'];
    if (partial) notices.push('Incomplete search: some files exceeded a read, format, discovery or time bound, or changed; refine path/glob');
    if (matchCount >= limit) notices.push(`${limit} matches limit reached`);
    if (outputTruncated) notices.push('50KB output limit reached');
    if (linesTruncated) notices.push('Some lines truncated to 500 chars');
    return { content: [{ type: 'text', text: `${output.length ? output.join('\n') : 'No matches found in the verified files searched'}\n\n[${notices.join('. ')}]` }],
        details: { pivaneBotGrep: { partial, filesSearched: searched, bytesSearched: searchedBytes },
            ...(matchCount >= limit ? { matchLimitReached: limit } : {}), ...(linesTruncated ? { linesTruncated: true } : {}) } };
}

function createBotGrepExecutor(verified, getAgentDir, getPreset) {
    let running = false;
    return async (_id, input, signal, _update, ctx) => {
        if (!verified(ctx)) throw new Error('Managed Bot grep is unavailable in this conversation.');
        if (running) throw new Error('Another managed Bot grep is still running.');
        running = true;
        try {
            const preset = typeof getPreset === 'function' ? await getPreset(ctx) : undefined;
            return await botGrep(input, { cwd: ctx.cwd, agentDir: getAgentDir(), preset, signal });
        }
        catch { throw unavailable(); }
        finally { running = false; }
    };
}
module.exports = { GREP_LIMITS, createBotGrepExecutor };
