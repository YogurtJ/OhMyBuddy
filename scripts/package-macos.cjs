'use strict';
// Run on the target Mac. Inputs are already downloaded, pinned upstream archives;
// only this build step uses npm. Installed users never run dependency installation.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createPublicKey, randomUUID } = require('node:crypto');
const { distributionFiles } = require('./source-files.cjs');
const { privateDir, readSafe, copySafe, hashFileSafe, atomicJson } = require('../server/pi-maintenance-files');
const { runNode, installEnvironment } = require('../server/pi-update-installer');
const { baseUrl, bundleName, VERSION } = require('../server/pi-distribution');
function verifiedArchive(input) {
    if (!input || !path.isAbsolute(input.archive) || !/^[a-f0-9]{64}$/.test(input.sha256)
        || hashFileSafe(input.archive, 256 * 1024 ** 2).sha256 !== input.sha256) throw Error('Build input SHA256 mismatch');
    return input.archive;
}
function extractInput(input, destination) {
    const archive = verifiedArchive(input);
    privateDir(destination);
    // These upstream archives have an explicitly pinned digest, never a remote
    // untrusted filename or mutable "latest" URL supplied to the client.
    execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', destination], { env: { PATH: '/usr/bin:/bin', COPYFILE_DISABLE: '1' } });
    const dirs = fs.readdirSync(destination).filter(name => !name.startsWith('.'));
    if (dirs.length !== 1 || !fs.lstatSync(path.join(destination, dirs[0])).isDirectory()) throw Error('Unexpected upstream archive layout');
    return path.join(destination, dirs[0]);
}
function collect(root) {
    const files = [], folded = new Set(); let total = 0;
    function visit(relative) {
        for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
            const file = relative ? relative + '/' + name : name, absolute = path.join(root, file), stat = fs.lstatSync(absolute);
            if (stat.isSymbolicLink() || !stat.isFile() && !stat.isDirectory()) throw Error('Platform payload contains a link or special file: ' + file);
            if (stat.isDirectory()) { fs.chmodSync(absolute, 0o755); visit(file); }
            else {
                if (folded.has(file.toLowerCase()) || stat.size > 128 * 1024 ** 2 || (total += stat.size) > 1024 ** 3 || files.length >= 39999) throw Error('Platform payload budget or case collision');
                folded.add(file.toLowerCase());
                if (stat.nlink > 1) {
                    // esbuild prepares its executable using a hard link. Give
                    // every payload entry its own inode before tar can turn it
                    // into a link entry that the update reader correctly rejects.
                    const temporary = absolute + '.' + randomUUID() + '.materialize';
                    try {
                        copySafe(absolute, temporary, { bytes: 0, files: 0, maxBytes: 128 * 1024 ** 2, maxFiles: 1 });
                        fs.chmodSync(temporary, stat.mode & 0o777); fs.renameSync(temporary, absolute);
                    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
                }
                const proof = hashFileSafe(absolute, 128 * 1024 ** 2), mode = stat.mode & 0o111 ? 0o755 : 0o644;
                if (proof.bytes !== stat.size) throw Error('Platform payload changed during collection');
                fs.chmodSync(absolute, mode);
                files.push({ path: file, ...proof, mode });
            }
        }
    }
    visit(''); fs.chmodSync(root, 0o755); return files;
}
function verifyArchive(archive, version, arch, product = 'OhMyBuddy') {
    const { parseArchive } = require('../server/pi-release-archive');
    const { verifyManifest } = require('../server/pi-platform-bundle');
    const entries = parseArchive(readSafe(archive, 512 * 1024 ** 2), { prefix: bundleName(version, 'darwin', arch, product).replace(/\.tar\.gz$/, '') + '/',
        maxExpanded: 1024 ** 3, maxFile: 128 * 1024 ** 2, maxFiles: 40000 });
    verifyManifest(JSON.parse(entries.get(product === 'OhMyBuddy' ? 'OHMYBUDDY_BUNDLE.json' : 'PIVANE_BUNDLE.json')?.bytes.toString() || 'null'), entries, { version, platform: 'darwin', arch, product });
}
function wrapper(script) { return '#!/bin/sh\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1\nexec "$HERE/node" "$HERE/../lib/node_modules/npm/bin/' + script + '" "$@"\n'; }
async function build({ source, inputs, version, output, work, dmg = true, product = 'OhMyBuddy' }) {
    if (!require('../server/ohmybuddy-compat').isProduct(product)) throw Error('Unknown build product');
    const packageName = product === 'OhMyBuddy' ? 'ohmybuddy' : 'pivane';
    const metadataName = product === 'OhMyBuddy' ? 'OHMYBUDDY_BUNDLE.json' : 'PIVANE_BUNDLE.json';
    if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch)) throw Error('Build and validate the installer on its target Mac architecture');
    if (!VERSION.test(version) || version.length > 79 || fs.existsSync(work) || fs.existsSync(output)) throw Error('Invalid build identity or output already exists');
    const feed = { version: 1, url: baseUrl(inputs.distribution.url), channel: inputs.distribution.channel || 'stable', keys: inputs.distribution.keys };
    if (!['stable', 'preview'].includes(feed.channel) || !Array.isArray(feed.keys) || !feed.keys.length || feed.keys.some(key => !/^[a-z0-9-]{1,64}$/.test(key.id) || createPublicKey(key.pem).asymmetricKeyType !== 'ed25519')) throw Error('Pinned distribution public keys are required');
    if (inputs.sourceCommit !== undefined && !/^[a-f0-9]{40}$/.test(inputs.sourceCommit)) throw Error('Invalid source commit identity');
    privateDir(work); privateDir(output);
    const name = bundleName(version, 'darwin', process.arch, product).replace(/\.tar\.gz$/, ''), payload = privateDir(path.join(work, name));
    const budget = { bytes: 0, files: 0, maxBytes: 256 * 1024 ** 2, maxFiles: 20000 };
    for (const file of distributionFiles(source)) { const target = path.join(payload, file); privateDir(path.dirname(target)); copySafe(path.join(source, file), target, budget); }
    const unpackedNode = extractInput(inputs.node, path.join(work, 'node-input'));
    const runtime = path.join(payload, 'runtime');
    fs.renameSync(unpackedNode, runtime);
    const node = path.join(runtime, 'bin/node');
    const nodeInfo = JSON.parse(execFileSync(node, ['-p', 'JSON.stringify({version:process.versions.node,arch:process.arch,platform:process.platform})'], { encoding: 'utf8' }));
    if (nodeInfo.platform !== 'darwin' || nodeInfo.arch !== process.arch || !/^22\.(\d+)\.\d+$/.test(nodeInfo.version) || Number(nodeInfo.version.split('.')[1]) < 19) throw Error('Unsupported private Node runtime');
    // Materialize only the npm launchers we support; distributable payloads have
    // no links and are checked by the same bounded tar parser as updates.
    for (const [name, script] of [['npm', 'npm-cli.js'], ['npx', 'npx-cli.js']]) {
        const target = path.join(runtime, 'bin', name); if (fs.existsSync(target)) fs.unlinkSync(target);
        fs.writeFileSync(target, wrapper(script), { flag: 'wx', mode: 0o755 });
    }
    const corepack = path.join(runtime, 'bin/corepack'); if (fs.existsSync(corepack)) fs.unlinkSync(corepack);
    for (const relative of ['share', 'include', 'lib/node_modules/corepack']) fs.rmSync(path.join(runtime, relative), { recursive: true, force: true });
    for (const tool of ['rg', 'fd']) {
        const extracted = extractInput(inputs[tool], path.join(work, tool + '-input'));
        privateDir(path.join(payload, 'bin'));
        fs.copyFileSync(path.join(extracted, tool), path.join(payload, 'bin', tool)); fs.chmodSync(path.join(payload, 'bin', tool), 0o755);
        // Preserve all upstream notices/source-distribution links provided with tools.
        const notices = path.join(payload, 'tool-licenses', tool); privateDir(notices);
        for (const file of fs.readdirSync(extracted)) if (/^(?:LICENSE|COPYING|UNLICENSE|README)/i.test(file) && fs.lstatSync(path.join(extracted, file)).isFile()) fs.copyFileSync(path.join(extracted, file), path.join(notices, file));
        execFileSync(path.join(payload, 'bin', tool), ['--version'], { stdio: 'ignore' });
    }
    for (const file of ['package.json', 'package-lock.json']) {
        const target = path.join(payload, file), data = JSON.parse(readSafe(target, 16 * 1024 ** 2)); data.version = version;
        data.name = packageName;
        if (file === 'package.json') {
            delete data.pivaneBundle; delete data.ohmybuddyBundle;
            data[packageName + 'Bundle'] = { version: 1, platform: 'darwin', arch: process.arch, nodeVersion: nodeInfo.version };
        } else { data.packages[''].version = version; data.packages[''].name = packageName; }
        atomicJson(target, data);
    }
    atomicJson(path.join(payload, 'config/distribution.json'), feed);
    const home = privateDir(path.join(work, 'build-home'));
    const env = installEnvironment({ HOME: home, PATH: [path.join(runtime, 'bin'), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':') }, payload);
    env.npm_config_bin_links = 'false';
    const onOutput = (stream, text) => (stream === 'stderr' ? process.stderr : process.stdout).write(text + '\n');
    await runNode([path.join(payload, 'scripts/install.cjs'), '--omit=dev'], { cwd: payload, env, executable: node, onOutput });
    for (const name of ['npm-cache', 'user.npmrc', 'global.npmrc']) fs.rmSync(path.join(payload, name), { recursive: true, force: true });
    const pkg = JSON.parse(readSafe(path.join(payload, 'package.json')));
    const manifest = { version: 1, product, appVersion: version, piVersion: pkg.dependencies['@earendil-works/pi-coding-agent'],
        platform: 'darwin', arch: process.arch, nodeVersion: nodeInfo.version, sourceCommit: inputs.sourceCommit || null,
        inputSha256: Object.fromEntries(['node', 'rg', 'fd'].map(name => [name, inputs[name].sha256])), files: collect(payload) };
    atomicJson(path.join(payload, metadataName), manifest); fs.chmodSync(path.join(payload, metadataName), 0o644);
    const archive = path.join(output, name + '.tar.gz');
    execFileSync('/usr/bin/tar', ['--format', 'ustar', '--uid', '0', '--gid', '0', '--uname', 'root', '--gname', 'root', '-czf', archive, '-C', work, name], { env: { PATH: '/usr/bin:/bin', COPYFILE_DISABLE: '1' }, stdio: 'inherit' });
    verifyArchive(archive, version, process.arch, product);
    const proof = hashFileSafe(archive, 512 * 1024 ** 2);
    const receipt = { version, product, platform: 'darwin', arch: process.arch, nodeVersion: nodeInfo.version, piVersion: manifest.piVersion, sourceCommit: manifest.sourceCommit, inputSha256: manifest.inputSha256, archive: path.basename(archive), ...proof };
    fs.writeFileSync(archive + '.sha256', `${proof.sha256}  ${path.basename(archive)}\n`, { flag: 'wx', mode: 0o644 });
    if (dmg) {
        const image = privateDir(path.join(work, 'image')), app = path.join(image, 'OhMyBuddy.app'), contents = privateDir(path.join(app, 'Contents'));
        privateDir(path.join(contents, 'MacOS')); privateDir(path.join(contents, 'Resources'));
        // The app is an immutable first-install entry; writable releases and data
        // live under Application Support, preserving future code-signing seals.
        fs.cpSync(payload, path.join(contents, 'Resources/payload'), { recursive: true, preserveTimestamps: false });
        fs.writeFileSync(path.join(contents, 'MacOS/OhMyBuddy'), '#!/bin/sh\nRESOURCES=$(CDPATH= cd -- "$(dirname -- "$0")/../Resources" && pwd) || exit 1\nexec "$RESOURCES/payload/runtime/bin/node" "$RESOURCES/payload/scripts/macos-bootstrap.cjs" "$RESOURCES/payload"\n', { mode: 0o755 });
        fs.writeFileSync(path.join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleName</key><string>OhMyBuddy</string><key>CFBundleDisplayName</key><string>OhMyBuddy</string><key>CFBundleIdentifier</key><string>app.ohmybuddy.desktop</string><key>CFBundleExecutable</key><string>OhMyBuddy</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${version.split('-')[0]}</string><key>CFBundleVersion</key><string>${version.split('-')[0]}</string><key>LSMinimumSystemVersion</key><string>13.5</string><key>LSUIElement</key><true/></dict></plist>`);
        // Unsigned preview by explicit operator choice. No quarantine bypass or
        // modification of the user's macOS trust settings is performed.
        for (const directory of [image, app, contents, path.join(contents, 'MacOS'), path.join(contents, 'Resources')]) fs.chmodSync(directory, 0o755);
        fs.symlinkSync('/Applications', path.join(image, 'Applications'));
        const imageFile = path.join(output, name + '.dmg');
        execFileSync('/usr/bin/hdiutil', ['create', '-quiet', '-volname', 'OhMyBuddy', '-srcfolder', image, '-format', 'UDZO', imageFile], { stdio: 'inherit' });
        receipt.dmg = { file: path.basename(imageFile), ...hashFileSafe(imageFile, 1024 ** 3), notarized: false };
    }
    atomicJson(path.join(output, 'build.json'), receipt); console.log(JSON.stringify(receipt, null, 2));
    return receipt;
}
if (require.main === module) {
    const args = process.argv.slice(2), values = {};
    for (let i = 0; i < args.length; i += 2) { if (!['--source', '--inputs', '--version', '--output', '--work', '--product'].includes(args[i]) || !args[i + 1] || values[args[i]]) throw Error('Usage: package-macos.cjs --inputs FILE --version VERSION --output NEW_DIR --work NEW_DIR [--source DIR]'); values[args[i]] = args[i + 1]; }
    if (!values['--inputs'] || !values['--version'] || !values['--output'] || !values['--work']) throw Error('Missing macOS build arguments');
    build({ source: fs.realpathSync.native(values['--source'] || path.resolve(__dirname, '..')), inputs: JSON.parse(readSafe(path.resolve(values['--inputs']))),
        version: values['--version'], product: values['--product'] || 'OhMyBuddy', output: path.resolve(values['--output']), work: path.resolve(values['--work']) }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { build, collect, verifyArchive };
