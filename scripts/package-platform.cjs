'use strict';
// Native Linux/Windows builds use pinned upstream inputs. Client installation
// copies an already prepared runtime and never invokes npm.
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createPublicKey } = require('node:crypto');
const { distributionFiles } = require('./source-files.cjs');
const { privateDir, copySafe, readSafe, hashFileSafe, atomicJson } = require('../server/pi-maintenance-files');
const { nodePath, runtimeEnvironment, supported } = require('../server/pi-bundle-layout');
const { baseUrl, bundleName, VERSION } = require('../server/pi-distribution');
const { collect } = require('./package-macos.cjs');
const { createArchive, verifyArchive } = require('./platform-archive.cjs');
const { installEnvironment, runNode } = require('../server/pi-update-installer');
const { powershell } = require('./install-service.cjs');
const ps = value => "'" + value.replace(/'/g, "''") + "'";
function inputFile(input) {
    if (!input || !path.isAbsolute(input.archive) || !/^[a-f0-9]{64}$/.test(input.sha256) || hashFileSafe(input.archive, 256 * 1024 ** 2).sha256 !== input.sha256) throw Error('Build input SHA256 mismatch');
    return input.archive;
}
function extract(input, destination, env) {
    const archive = inputFile(input); privateDir(destination);
    if (process.platform === 'win32') powershell(`Expand-Archive -LiteralPath ${ps(archive)} -DestinationPath ${ps(destination)}`);
    else execFileSync('/usr/bin/tar', ['-xf', archive, '-C', destination], { env: { PATH: '/usr/bin:/bin' } });
    const names = fs.readdirSync(destination).filter(name => !name.startsWith('.'));
    if (names.length !== 1 || !fs.lstatSync(path.join(destination, names[0])).isDirectory()) throw Error('Unexpected upstream archive layout');
    return path.join(destination, names[0]);
}
function compileWindows(source, output, main, resource) {
    const compiler = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
    const manifest = path.join(path.dirname(output), 'installer-' + main + '.manifest');
    fs.writeFileSync(manifest, '<?xml version="1.0" encoding="utf-8"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0"><trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security></trustInfo><application xmlns="urn:schemas-microsoft-com:asm.v3"><windowsSettings><longPathAware xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">true</longPathAware></windowsSettings></application></assembly>', { flag: 'wx' });
    const args = ['/nologo', '/optimize+', '/codepage:65001', '/target:winexe', '/main:' + main, '/out:' + output, '/win32manifest:' + manifest,
        '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll', '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll'];
    if (resource) args.push('/resource:' + resource + ',ohmybuddy-payload');
    args.push(path.join(source, 'scripts/windows-installer.cs'));
    try { execFileSync(compiler, args, { stdio: 'inherit', windowsHide: true, timeout: 120000 }); } finally { fs.unlinkSync(manifest); }
}
async function build({ source, inputs, version, output, work }) {
    const platform = process.platform, arch = process.arch;
    if (!['linux', 'win32'].includes(platform) || !supported(platform, arch)) throw Error('Build on the actual supported Linux/Windows target');
    if (!VERSION.test(version) || version.length > 79 || fs.existsSync(work) || fs.existsSync(output)) throw Error('Invalid or reused build identity');
    const feed = { version: 1, url: baseUrl(inputs.distribution.url), channel: inputs.distribution.channel || 'preview', keys: inputs.distribution.keys };
    if (!['stable', 'preview'].includes(feed.channel) || !Array.isArray(feed.keys) || !feed.keys.length || feed.keys.some(k => !/^[a-z0-9-]{1,64}$/.test(k.id) || createPublicKey(k.pem).asymmetricKeyType !== 'ed25519')) throw Error('Pinned release verification keys are required');
    if (inputs.sourceCommit !== undefined && !/^[a-f0-9]{40}$/.test(inputs.sourceCommit)) throw Error('Invalid source commit');
    privateDir(work); privateDir(output);
    const name = bundleName(version, platform, arch).replace(/\.tar\.gz$/, ''), payload = privateDir(path.join(work, name));
    const budget = { bytes: 0, files: 0, maxBytes: 256 * 1024 ** 2, maxFiles: 20000 };
    for (const file of distributionFiles(source)) { const target = path.join(payload, file); privateDir(path.dirname(target)); copySafe(path.join(source, file), target, budget); }
    const home = privateDir(path.join(work, 'build-home'));
    const baseEnv = { HOME: home, ...(platform === 'win32' ? { USERPROFILE: home, SystemRoot: process.env.SystemRoot || 'C:\\Windows', TEMP: home, TMP: home } : {}) };
    const unpacked = extract(inputs.node, path.join(work, 'node-input'), baseEnv), runtime = path.join(payload, 'runtime'); fs.renameSync(unpacked, runtime);
    const node = nodePath(payload), safeEnv = runtimeEnvironment(payload, baseEnv);
    const info = JSON.parse(execFileSync(node, ['-p', 'JSON.stringify({version:process.versions.node,platform:process.platform,arch:process.arch})'], { env: safeEnv, encoding: 'utf8' }));
    if (info.platform !== platform || info.arch !== arch || !/^22\.\d+\.\d+$/.test(info.version) || Number(info.version.split('.')[1]) < 19) throw Error('Private runtime target mismatch');
    if (platform === 'linux') {
        for (const [tool, script] of [['npm', 'npm-cli.js'], ['npx', 'npx-cli.js']]) { const file = path.join(runtime, 'bin', tool); if (fs.existsSync(file)) fs.unlinkSync(file); fs.writeFileSync(file, '#!/bin/sh\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1\nexec "$HERE/node" "$HERE/../lib/node_modules/npm/bin/' + script + '" "$@"\n', { mode: 0o755 }); }
        fs.rmSync(path.join(runtime, 'bin/corepack'), { force: true });
        for (const relative of ['share', 'include', 'lib/node_modules/corepack']) fs.rmSync(path.join(runtime, relative), { recursive: true, force: true });
    } else {
        const git = path.join(runtime, 'git'); privateDir(git);
        execFileSync(inputFile(inputs.git), ['-y', '-o' + git], { env: safeEnv, stdio: 'inherit', windowsHide: true, timeout: 180000 });
        for (const relative of ['bin/bash.exe', 'cmd/git.exe']) if (!fs.existsSync(path.join(git, relative))) throw Error('Portable Git/Bash input is incomplete');
        compileWindows(source, path.join(runtime, 'OhMyBuddyHost.exe'), 'OhMyBuddyHost');
    }
    privateDir(path.join(payload, 'bin'));
    for (const tool of ['rg', 'fd']) {
        const directory = extract(inputs[tool], path.join(work, tool + '-input'), safeEnv), executable = tool + (platform === 'win32' ? '.exe' : '');
        fs.copyFileSync(path.join(directory, executable), path.join(payload, 'bin', executable)); fs.chmodSync(path.join(payload, 'bin', executable), 0o755);
        const licenses = privateDir(path.join(payload, 'tool-licenses', tool));
        for (const file of fs.readdirSync(directory)) if (/^(LICENSE|COPYING|UNLICENSE|README)/i.test(file) && fs.lstatSync(path.join(directory, file)).isFile()) fs.copyFileSync(path.join(directory, file), path.join(licenses, file));
        execFileSync(path.join(payload, 'bin', executable), ['--version'], { stdio: 'ignore' });
    }
    for (const file of ['package.json', 'package-lock.json']) {
        const target = path.join(payload, file), data = JSON.parse(readSafe(target, 16 * 1024 ** 2)); data.version = version; data.name = 'ohmybuddy';
        if (file === 'package.json') { delete data.pivaneBundle; data.ohmybuddyBundle = { version: 1, platform, arch, nodeVersion: info.version }; }
        else { data.packages[''].version = version; data.packages[''].name = 'ohmybuddy'; }
        atomicJson(target, data);
    }
    atomicJson(path.join(payload, 'config/distribution.json'), feed);
    const env = installEnvironment(runtimeEnvironment(payload, baseEnv), payload); env.npm_config_bin_links = 'false';
    if (inputs.registry) { if (new URL(inputs.registry).protocol !== 'https:') throw Error('Build registry must use HTTPS'); env.npm_config_registry = inputs.registry; }
    const onOutput = (stream, text) => (stream === 'stderr' ? process.stderr : process.stdout).write(text + '\n');
    await runNode([path.join(payload, 'scripts/install.cjs'), '--omit=dev'], { cwd: payload, env, executable: node, onOutput });
    for (const file of ['npm-cache', 'user.npmrc', 'global.npmrc']) fs.rmSync(path.join(payload, file), { recursive: true, force: true });
    if (platform === 'linux') fs.writeFileSync(path.join(payload, 'Install.sh'), '#!/bin/sh\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1\nexec "$HERE/runtime/bin/node" "$HERE/scripts/platform-bootstrap.cjs" "$HERE" "$@"\n', { flag: 'wx', mode: 0o755 });
    else fs.writeFileSync(path.join(payload, 'Install.cmd'), '@echo off\r\n"%~dp0runtime\\node.exe" "%~dp0scripts\\platform-bootstrap.cjs" "%~dp0." %*\r\nif errorlevel 1 pause\r\n', { flag: 'wx' });
    const pkg = JSON.parse(readSafe(path.join(payload, 'package.json')));
    const manifest = { version: 1, product: 'OhMyBuddy', appVersion: version, piVersion: pkg.dependencies['@earendil-works/pi-coding-agent'], platform, arch, nodeVersion: info.version, sourceCommit: inputs.sourceCommit || null,
        inputSha256: Object.fromEntries((platform === 'win32' ? ['node', 'rg', 'fd', 'git'] : ['node', 'rg', 'fd']).map(key => [key, inputs[key].sha256])), files: collect(payload) };
    atomicJson(path.join(payload, 'OHMYBUDDY_BUNDLE.json'), manifest); fs.chmodSync(path.join(payload, 'OHMYBUDDY_BUNDLE.json'), 0o644);
    const archive = path.join(output, name + '.tar.gz'); await createArchive(payload, name, manifest, archive); verifyArchive(archive, version, platform, arch);
    const receipt = { version, product: 'OhMyBuddy', platform, arch, nodeVersion: info.version, piVersion: manifest.piVersion, sourceCommit: manifest.sourceCommit, inputSha256: manifest.inputSha256, archive: path.basename(archive), ...hashFileSafe(archive, 512 * 1024 ** 2) };
    fs.writeFileSync(archive + '.sha256', `${receipt.sha256}  ${receipt.archive}\n`, { flag: 'wx' });
    if (platform === 'win32') {
        const zip = path.join(work, 'installer-payload.zip'); execFileSync('tar.exe', ['--format', 'zip', '-cf', zip, '-C', work, name], { stdio: 'inherit', timeout: 300000 });
        const exe = path.join(output, name + '.exe'); compileWindows(source, exe, 'OhMyBuddyInstaller', zip);
        receipt.installer = { file: path.basename(exe), kind: 'exe', codeSigned: false, ...hashFileSafe(exe, 512 * 1024 ** 2) };
    } else receipt.installer = { file: receipt.archive, kind: 'tar.gz', sha256: receipt.sha256, bytes: receipt.bytes };
    atomicJson(path.join(output, 'build.json'), receipt); console.log(JSON.stringify(receipt, null, 2)); return receipt;
}
if (require.main === module) {
    const args = process.argv.slice(2), values = {};
    for (let i = 0; i < args.length; i += 2) { if (!['--source', '--inputs', '--version', '--output', '--work'].includes(args[i]) || !args[i + 1] || values[args[i]]) throw Error('Invalid platform build arguments'); values[args[i]] = args[i + 1]; }
    if (!['--inputs', '--version', '--output', '--work'].every(key => values[key])) throw Error('Missing platform build arguments');
    build({ source: fs.realpathSync.native(values['--source'] || path.resolve(__dirname, '..')), inputs: JSON.parse(readSafe(path.resolve(values['--inputs']))), version: values['--version'], output: path.resolve(values['--output']), work: path.resolve(values['--work']) }).catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}
module.exports = { build, compileWindows };
