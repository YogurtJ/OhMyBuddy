'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { isIP } = require('node:net');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function loopback(input) {
    const host = String(input || '').replace(/^::ffff:/, '').replace(/^\[|\]$/g, '').toLowerCase();
    return host === 'localhost' || host === '::1' || isIP(host) === 4 && host.startsWith('127.');
}
function localRequest(req) {
    try {
        return loopback(req.socket?.remoteAddress) && loopback(new URL('http://' + req.headers.host).hostname)
            && (!req.headers.origin || loopback(new URL(req.headers.origin).hostname));
    } catch { return false; }
}
function executable(name, env) {
    for (const directory of String(env.PATH || '').split(path.delimiter).filter(Boolean)) {
        const file = path.join(directory, name);
        try { fs.accessSync(file, fs.constants.X_OK); return file; } catch {}
    }
    return null;
}
function commandFor(platform, env, initial) {
    if (platform === 'darwin' && fs.existsSync('/usr/bin/osascript')) return {
        command: '/usr/bin/osascript', args: ['-e', 'on run argv\nactivate\ntry\nset chosen to choose folder with prompt "选择项目文件夹 — OhMyBuddy" default location (POSIX file (item 1 of argv) as alias)\nreturn POSIX path of chosen\non error number -128\nreturn ""\nend try\nend run', initial]
    };
    if (platform === 'win32' && env.SESSIONNAME !== 'Services') {
        const script = '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); Add-Type -AssemblyName System.Windows.Forms; if (-not [Environment]::UserInteractive) { exit 2 }; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = "OhMyBuddy: select project folder"; $dialog.SelectedPath = $env.OHMYBUDDY_DIRECTORY_PICKER_INITIAL; try { if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::WriteLine($dialog.SelectedPath) } } finally { $dialog.Dispose() }';
        return { command: path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), args: ['-NoProfile', '-STA', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')] };
    }
    if (platform === 'linux' && (env.DISPLAY || env.WAYLAND_DISPLAY)) {
        const zenity = executable('zenity', env);
        if (zenity) return { command: zenity, args: ['--file-selection', '--directory', '--title=选择项目文件夹 — OhMyBuddy', '--filename=' + initial + path.sep] };
        const kdialog = executable('kdialog', env);
        if (kdialog) return { command: kdialog, args: ['--getexistingdirectory', initial, '--title', '选择项目文件夹 — OhMyBuddy'] };
    }
    return null;
}
// Only GUI/session variables reach the chooser, never provider or workspace tokens.
function guiEnvironment(env, initial) {
    const names = new Set(['HOME', 'PATH', 'LANG', 'LC_ALL', 'USER', 'LOGNAME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'WINDIR', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'SESSIONNAME', 'XAUTHORITY', 'QT_QPA_PLATFORM', 'GDK_BACKEND', 'XDG_SESSION_TYPE', 'XDG_CURRENT_DESKTOP']);
    return { ...Object.fromEntries(Object.entries(env).filter(([key]) => names.has(key.toUpperCase()))), OHMYBUDDY_DIRECTORY_PICKER_INITIAL: initial };
}
function runCommand(spec, { env, signal }) {
    return new Promise((resolve, reject) => {
        let output = '', errorOutput = '', failure, timedOut = false;
        const child = spawn(spec.command, spec.args, { env, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] });
        const cancel = () => { child.kill('SIGTERM'); };
        const timer = setTimeout(() => { timedOut = true; cancel(); }, 10 * 60 * 1000);
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) cancel();
        const collect = (bytes, stderr) => {
            if (Buffer.byteLength(output) + Buffer.byteLength(errorOutput) + Buffer.byteLength(bytes) > 64 * 1024) { failure = fail('系统选择窗口返回的数据过大', 502); cancel(); return; }
            if (stderr) errorOutput += bytes.toString('utf8'); else output += bytes.toString('utf8');
        };
        child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
        child.stdout.on('data', bytes => collect(bytes, false)); child.stderr.on('data', bytes => collect(bytes, true));
        child.on('error', error => { failure = error; });
        // Abort/timeout is not completion: retain ownership until the process closes.
        child.once('close', code => {
            clearTimeout(timer); signal.removeEventListener('abort', cancel);
            if (signal.aborted) return reject(Object.assign(new Error('Directory selection cancelled'), { name: 'AbortError' }));
            if (timedOut) return reject(fail('系统选择窗口已超时，请重新打开', 408));
            if (failure) return reject(failure);
            if (code === 1 && !output && !errorOutput.trim()) return resolve(null);
            if (code !== 0) return reject(fail('系统选择窗口未能打开，请在下方浏览文件夹', 503));
            const chosen = output.replace(/^\uFEFF/, '').replace(/\r?\n$/, '');
            if (/[\x00-\x1f\x7f]/.test(chosen)) return reject(fail('所选文件夹路径包含不支持的字符'));
            resolve(chosen || null);
        });
    });
}
class NativeDirectoryPicker {
    constructor({ platform = process.platform, env = process.env, command = commandFor, run = runCommand } = {}) {
        this.platform = platform; this.env = env; this.command = command; this.run = run; this.pending = null; this.controller = null; this.closed = false;
    }
    get busy() { return Boolean(this.pending); }
    capabilities(req) {
        return { available: !this.closed && localRequest(req) && Boolean(this.command(this.platform, this.env, os.homedir())), platform: this.platform, host: os.hostname() };
    }
    async pick(initial, signal) {
        if (this.closed || this.pending) throw fail('系统选择窗口已打开，请先完成当前选择', 409);
        const spec = this.command(this.platform, this.env, initial);
        if (!spec) throw fail('当前电脑没有可用的系统文件夹选择器', 503);
        const controller = new AbortController(), cancel = () => controller.abort();
        signal?.addEventListener('abort', cancel, { once: true }); if (signal?.aborted) controller.abort();
        this.controller = controller;
        const operation = Promise.resolve().then(() => this.run(spec, { env: guiEnvironment(this.env, initial), signal: controller.signal }));
        this.pending = operation;
        try { return await operation; }
        finally { signal?.removeEventListener('abort', cancel); if (this.pending === operation) { this.pending = null; this.controller = null; } }
    }
    async dispose() { this.closed = true; this.controller?.abort(); await this.pending?.catch(() => {}); }
}
function mountNativeDirectoryPicker(router, { store, picker }) {
    router.get('/directories/picker', (req, res) => res.set('Cache-Control', 'no-store').json(picker.capabilities(req)));
    router.post('/directories/picker', async (req, res) => {
        res.set('Cache-Control', 'no-store'); const controller = new AbortController();
        const cancel = () => { if (!res.writableEnded) controller.abort(); }; res.on('close', cancel);
        try {
            if (!localRequest(req)) throw fail('系统选择器只供本机访问使用，请在下方浏览服务器文件夹', 403);
            if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some(key => key !== 'path')
                || req.body.path !== undefined && (typeof req.body.path !== 'string' || req.body.path.length > 32768)) throw fail('Invalid directory picker request');
            const initial = store.resolveProject(req.body.path || store.defaultProject());
            const chosen = await picker.pick(initial, controller.signal);
            if (!controller.signal.aborted) res.json(chosen ? { cancelled: false, cwd: store.resolveProject(chosen) } : { cancelled: true });
        } catch (error) { if (!controller.signal.aborted) res.status(error.status || 400).json({ error: error.message }); }
        finally { res.off('close', cancel); }
    });
}
module.exports = { NativeDirectoryPicker, mountNativeDirectoryPicker, commandFor, guiEnvironment, localRequest };
