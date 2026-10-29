'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const { readSafe } = require('../server/pi-maintenance-files');
const { inspectPayload, prepareInstallation } = require('./platform-bootstrap.cjs');
async function main() {
    if (process.argv.length !== 3) throw Error('Usage: macos-bootstrap.cjs /path/to/verified/payload');
    const support = path.join(os.homedir(), 'Library/Application Support');
    const source = path.resolve(process.argv[2]), root = path.join(support, require('../server/ohmybuddy-compat').selectName(support, ['OhMyBuddy', 'Pivane']), 'desktop');
    const result = await prepareInstallation({ source, root });
    const serviceFile = path.join(require('../server/ohmybuddy-compat').runtimeDirectory(root), 'service/installation.json');
    if (!fs.existsSync(serviceFile)) {
        execFileSync(path.join(root, 'runtime/bin/node'), [path.join(root, 'scripts/install-service.cjs'), '--no-shortcut'], {
            cwd: root, env: { ...process.env, PATH: [path.join(root, 'bin'), path.join(root, 'runtime/bin'), process.env.PATH || ''].join(path.delimiter) }, stdio: 'inherit', timeout: 180000
        });
    }
    const service = JSON.parse(readSafe(serviceFile));
    if (service.platform !== 'darwin' || service.phase !== 'http-ready') throw Error('Installation was retained, but startup is unconfirmed. Inspect the service log before trying again.');
    const label = path.basename(service.service, '.plist');
    if (!['app.ohmybuddy.', 'app.pivane.'].some(prefix => label === prefix + service.id)) throw Error('Unexpected service identity');
    // A subsequent click starts the registered instance if it was stopped.
    try { execFileSync('/bin/launchctl', ['kickstart', `gui/${process.getuid()}/${label}`], { stdio: 'ignore', timeout: 15000 }); } catch { /* Readiness below is authoritative. */ }
    const response = await fetch(`http://127.0.0.1:${result.port}/api/access/status`, { signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) throw Error('The registered OhMyBuddy instance did not become ready');
    execFileSync('/usr/bin/open', [`http://127.0.0.1:${result.port}`]);
}
if (require.main === module) main().catch(error => {
    console.error(error.message);
    // argv prevents shell/AppleScript interpolation of filenames or diagnostics.
    try { execFileSync('/usr/bin/osascript', ['-e', 'on run argv\ndisplay alert "OhMyBuddy" message (item 1 of argv) as warning\nend run', error.message], { stdio: 'ignore', timeout: 60000 }); } catch {}
    process.exitCode = 1;
});
module.exports = { inspectPayload, prepareInstallation };
