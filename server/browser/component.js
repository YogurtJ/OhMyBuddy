'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { privateDir } = require('../pi-maintenance-files');
const storage = require('../ohmybuddy-storage');
const MCP_PACKAGE = path.dirname(require.resolve('@playwright/mcp/package.json'));
const PACKAGE = path.dirname(require.resolve('playwright/package.json', { paths: [MCP_PACKAGE] }));
const VERSION = require('@playwright/mcp/package.json').version;
const PLAYWRIGHT_VERSION = require(path.join(PACKAGE, 'package.json')).version;

function browserEnvironment(env) {
    return Object.fromEntries(Object.entries(env).filter(([key]) => /^(PATH|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|SYSTEMROOT|WINDIR|TEMP|TMP|TMPDIR|DISPLAY|WAYLAND_DISPLAY|XAUTHORITY|XDG_RUNTIME_DIR|DBUS_SESSION_BUS_ADDRESS|LANG|LC_ALL|LC_CTYPE|TZ|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|PLAYWRIGHT_DOWNLOAD_HOST|PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST|PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT)$/i.test(key)));
}
class BrowserComponent {
    constructor({ env = process.env, cache, executablePath } = {}) {
        this.env = env;
        this.cache = cache || path.join(storage.layout({ env }).cache, 'browser');
        this.override = executablePath || env.OHMYBUDDY_BROWSER_EXECUTABLE;
        this.child = null;
        this.error = null;
        this.managed = execFileSync(process.execPath, ['-e', 'process.stdout.write(require("playwright").chromium.executablePath())'], {
            cwd: PACKAGE, env: { ...browserEnvironment(env), PLAYWRIGHT_BROWSERS_PATH: this.cache }, encoding: 'utf8', timeout: 10000, windowsHide: true
        });
    }
    executable() {
        const candidates = [this.override, this.managed];
        if (process.platform === 'darwin') candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium');
        else if (process.platform === 'win32') for (const base of [this.env.PROGRAMFILES, this.env['PROGRAMFILES(X86)'], this.env.LOCALAPPDATA].filter(Boolean))
            candidates.push(path.join(base, 'Google/Chrome/Application/chrome.exe'), path.join(base, 'Microsoft/Edge/Application/msedge.exe'));
        else candidates.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/google/chrome/chrome');
        return candidates.find(file => {
            if (!file || !path.isAbsolute(file)) return false;
            try { return fs.statSync(file).isFile(); } catch { return false; }
        }) || null;
    }
    status() {
        const executable = this.executable();
        return { version: VERSION, playwrightVersion: PLAYWRIGHT_VERSION, available: Boolean(executable), source: executable ? executable === this.managed ? 'managed' : 'system' : null,
            installing: Boolean(this.child), error: this.error };
    }
    install() {
        if (this.child) throw new Error('BROWSER_BUSY');
        privateDir(this.cache);
        this.error = null;
        return new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [path.join(PACKAGE, 'cli.js'), 'install', 'chromium'], {
                env: { ...browserEnvironment(this.env), PLAYWRIGHT_BROWSERS_PATH: this.cache }, stdio: 'ignore', windowsHide: true, shell: false
            });
            this.child = child;
            const done = error => {
                this.child = null;
                this.error = error ? 'BROWSER_INSTALL_FAILED' : null;
                error ? reject(error) : resolve(this.status());
            };
            let failed = false;
            child.once('error', () => { failed = true; });
            child.once('close', code => done(!failed && code === 0 && this.executable() ? null : new Error('BROWSER_INSTALL_FAILED')));
        });
    }
}
module.exports = { BrowserComponent, browserEnvironment, MCP_PACKAGE };
