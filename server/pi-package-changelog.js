const fs = require('node:fs/promises');
const path = require('node:path');
const { readVerifiedFile } = require('./pi-file-bytes');
const MAX_CHANGELOG_BYTES = 128 * 1024;
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const decode = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');

// Only the installed package selected by native metadata may choose this file.
// Reject escapes and symlinks; never accept a browser-provided filesystem path.
async function readPackageChangelog(installedPath) {
    const root = await fs.realpath(installedPath);
    const manifestPath = path.join(root, 'package.json');
    const exact = expected => actual => { if (actual !== expected) throw fail('更新日志位置无法核实'); };
    const manifest = await readVerifiedFile(manifestPath, { check: exact(manifestPath), maxBytes: 256 * 1024 });
    const metadata = JSON.parse(decode(manifest.bytes));
    const configured = metadata.pi?.changelogPath ?? 'CHANGELOG.md';
    if (configured === '') return { status: 'disabled', content: '' };
    if (typeof configured !== 'string' || configured.length > 512 || path.isAbsolute(configured) || /[\\\x00-\x1f]/.test(configured))
        throw fail('更新日志位置无效');
    const filename = path.resolve(root, configured), relative = path.relative(root, filename);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !/\.md$/i.test(filename))
        throw fail('更新日志必须是包内的 Markdown 文件');
    let file;
    try { file = await readVerifiedFile(filename, { check: exact(filename), maxBytes: MAX_CHANGELOG_BYTES }); }
    catch (error) { if (error.code === 'ENOENT') return { status: 'missing', content: '' }; throw error; }
    const content = decode(file.bytes);
    const after = await readVerifiedFile(manifestPath, { check: exact(manifestPath), maxBytes: 256 * 1024 });
    if (after.revision !== manifest.revision || await fs.realpath(installedPath) !== root) throw fail('扩展包已变化，请刷新后核对', 409);
    return { status: 'ready', content, revision: file.revision, path: relative.split(path.sep).join('/'), maxBytes: MAX_CHANGELOG_BYTES };
}
module.exports = { readPackageChangelog, MAX_CHANGELOG_BYTES };
