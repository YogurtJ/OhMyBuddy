'use strict';
// Publish verified immutable platform assets first, then atomically switch the
// signed channel. The signing key must remain outside the public directory.
const fs = require('node:fs');
const path = require('node:path');
const { createPrivateKey, createPublicKey, sign, randomUUID } = require('node:crypto');
const { readSafe, hashFileSafe, inside } = require('../server/pi-maintenance-files');
const { signedManifest, bundleName, VERSION } = require('../server/pi-distribution');
const { compareVersions } = require('../server/pi-update-service');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function publicJson(file, data) {
    const temporary = file + '.' + randomUUID() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
    fs.renameSync(temporary, file);
}
function publish({ buildFile, keyFile, keyId, channel, destination, notes = '' }) {
    destination = path.resolve(destination); keyFile = fs.realpathSync.native(keyFile);
    if (inside(destination, keyFile) || !['stable', 'preview'].includes(channel) || !/^[a-z0-9-]{1,64}$/.test(keyId) || notes.length > 20000) throw Error('Invalid publication arguments or signing key is inside the public directory');
    const build = JSON.parse(readSafe(buildFile)), source = path.dirname(buildFile), name = bundleName(build.version, build.platform, build.arch);
    if (!VERSION.test(build.version) || build.platform !== 'darwin' || !['arm64', 'x64'].includes(build.arch) || build.archive !== name
        || channel === 'stable' && build.version.includes('-')) throw Error('Invalid platform build receipt');
    const archive = path.join(source, name), proof = hashFileSafe(archive, 512 * 1024 ** 2);
    if (proof.sha256 !== build.sha256 || proof.bytes !== build.bytes) throw Error('Platform build changed');
    const privateKey = createPrivateKey(readSafe(keyFile, 64 * 1024));
    if (privateKey.asymmetricKeyType !== 'ed25519') throw Error('Publication requires Ed25519');
    const keys = [{ id: keyId, pem: createPublicKey(privateKey).export({ format: 'pem', type: 'spki' }).toString() }];
    const channelFile = path.join(destination, 'channels', channel + '.json');
    let releases = [];
    if (fs.existsSync(channelFile)) {
        const previous = JSON.parse(readSafe(channelFile));
        const previousDate = Date.parse(JSON.parse(Buffer.from(previous.payload, 'base64').toString()).generatedAt);
        releases = signedManifest(previous, { keys }, { now: previousDate }).releases;
    }
    if (releases.some(release => release.version === build.version && release.bundles[`${build.platform}-${build.arch}`])) throw Error('Published version already exists; never overwrite a release');
    const releaseDir = path.join(destination, 'releases', 'v' + build.version);
    fs.mkdirSync(releaseDir, { recursive: true, mode: 0o755 }); fs.mkdirSync(path.dirname(channelFile), { recursive: true, mode: 0o755 });
    fs.copyFileSync(archive, path.join(releaseDir, name), fs.constants.COPYFILE_EXCL); fs.chmodSync(path.join(releaseDir, name), 0o644);
    fs.writeFileSync(path.join(releaseDir, name + '.sha256'), `${build.sha256}  ${name}\n`, { flag: 'wx', mode: 0o644 });
    if (build.dmg) {
        const expected = name.replace(/\.tar\.gz$/, '.dmg'), dmg = path.join(source, expected), dmgProof = hashFileSafe(dmg, 1024 ** 3);
        if (build.dmg.file !== expected || dmgProof.sha256 !== build.dmg.sha256 || dmgProof.bytes !== build.dmg.bytes) throw Error('Disk image changed');
        fs.copyFileSync(dmg, path.join(releaseDir, expected), fs.constants.COPYFILE_EXCL); fs.chmodSync(path.join(releaseDir, expected), 0o644);
        fs.writeFileSync(path.join(releaseDir, expected + '.sha256'), `${dmgProof.sha256}  ${expected}\n`, { flag: 'wx', mode: 0o644 });
    }
    let release = releases.find(item => item.version === build.version);
    if (!release) { release = { version: build.version, piVersion: build.piVersion, notes, bundles: {} }; releases.push(release); }
    release.bundles[`${build.platform}-${build.arch}`] = { sha256: build.sha256, bytes: build.bytes, nodeVersion: build.nodeVersion };
    releases.sort((a, b) => compareVersions(b.version, a.version));
    const now = Date.now(), manifest = { version: 1, product: 'Pivane', channel, generatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30 * 86400000).toISOString(), releases };
    const bytes = Buffer.from(JSON.stringify(manifest)), envelope = { version: 1, keyId, payload: bytes.toString('base64'), signature: sign(null, bytes, privateKey).toString('base64') };
    signedManifest(envelope, { keys });
    publicJson(path.join(releaseDir, 'build.json'), build);
    publicJson(channelFile, envelope);
    const cards = releases.map(release => `<article id="v${escape(release.version)}"><h2>${escape(release.version)}</h2><p>${escape(release.notes)}</p>${Object.keys(release.bundles).map(target => {
        const arch = target.slice('darwin-'.length), archive = bundleName(release.version, 'darwin', arch), base = `releases/v${release.version}/`;
        return `<p><a class="button" href="${base}${archive.replace(/\.tar\.gz$/, '.dmg')}">下载 macOS ${arch === 'arm64' ? 'Apple Silicon' : 'Intel'} 安装包</a> <a href="${base}${archive.replace(/\.tar\.gz$/, '.dmg')}.sha256">SHA256</a></p>`;
    }).join('')}</article>`).join('');
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pivane 下载与更新</title><style>body{margin:0;background:#f5f7fa;color:#172033;font:16px/1.8 system-ui,-apple-system,sans-serif}main{max-width:860px;margin:60px auto;padding:0 24px}h1{font-size:40px;line-height:1.2}article{background:white;border:1px solid #dde3ec;border-radius:18px;padding:24px;margin:20px 0}a{color:#245bc4;overflow-wrap:anywhere}.button{display:inline-block;padding:10px 18px;background:#245bc4;color:white;border-radius:10px;text-decoration:none}p{white-space:pre-wrap}.badge{color:#8a4a05}footer{color:#526074;margin:36px 0}@media(max-width:600px){main{margin:30px auto}h1{font-size:30px}.button{display:block;text-align:center}}</style><main><p>PIVANE</p><h1>下载，打开，开始使用。</h1><p>安装包自带 Node、Pi 和所需依赖。安装和应用更新无需访问 GitHub 或 npm。</p><p class="badge">${channel === 'preview' ? '预览测试渠道 · macOS 安装包暂未公证' : '稳定渠道'}</p><p>下载 DMG，将 Pivane 拖入“应用程序”，再打开 Pivane。首次启动完成安装后，会打开浏览器配置模型。未公证测试版可能需要在“系统设置 → 隐私与安全性”确认打开。</p>${cards}<footer>已有此安装器的用户可以在 Pivane 的“设置 → 版本与更新”中更新。模型请求需要用户自己的账户和可访问的模型服务。当前仅提供实际验证的平台包。</footer></main></html>`;
    const index = path.join(destination, 'index.html'), temp = index + '.' + randomUUID() + '.tmp'; fs.writeFileSync(temp, html, { flag: 'wx', mode: 0o644 }); fs.renameSync(temp, index);
    return { version: build.version, channel, archiveSha256: build.sha256, expiresAt: manifest.expiresAt };
}
if (require.main === module) {
    const args = process.argv.slice(2), values = {};
    for (let i = 0; i < args.length; i += 2) { if (!['--build', '--key', '--key-id', '--channel', '--destination', '--notes'].includes(args[i]) || !args[i + 1] || values[args[i]]) throw Error('Invalid publication arguments'); values[args[i]] = args[i + 1]; }
    if (!['--build', '--key', '--key-id', '--channel', '--destination'].every(key => values[key])) throw Error('Missing publication arguments');
    console.log(JSON.stringify(publish({ buildFile: path.resolve(values['--build']), keyFile: path.resolve(values['--key']), keyId: values['--key-id'], channel: values['--channel'], destination: values['--destination'], notes: values['--notes'] || '' }), null, 2));
}
module.exports = { publish };
