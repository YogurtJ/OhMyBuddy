'use strict';
// A deliberately small tar reader shared by source and platform releases.
// Only ustar regular files/directories are accepted; links and extended headers
// are never interpreted. Callers verify every file before writing anything.
const { gunzipSync } = require('node:zlib');
function parseArchive(bytes, { prefix, maxExpanded, maxFile, maxFiles }) {
    const tar = gunzipSync(bytes, { maxOutputLength: maxExpanded });
    const files = new Map(), names = new Set(); let offset = 0, ended = false;
    const text = buffer => buffer.toString('utf8').replace(/\0.*$/s, '');
    while (offset + 512 <= tar.length) {
        const header = tar.subarray(offset, offset + 512); offset += 512;
        if (header.every(b => b === 0)) { ended = true; if (tar.subarray(offset).some(b => b !== 0)) throw Error('Trailing archive content'); break; }
        const octal = buffer => { const value = text(buffer).trim(); if (!/^[0-7]+$/.test(value)) throw Error('Invalid tar number'); return parseInt(value, 8); };
        const checksum = octal(header.subarray(148, 156));
        if (header.reduce((sum, b, i) => sum + (i >= 148 && i < 156 ? 32 : b), 0) !== checksum) throw Error('Invalid tar header');
        const name = (text(header.subarray(345, 500)) ? text(header.subarray(345, 500)) + '/' : '') + text(header.subarray(0, 100));
        const type = header[156], size = octal(header.subarray(124, 136)), mode = octal(header.subarray(100, 108));
        if (![0, 48, 53].includes(type) || !name.startsWith(prefix) || name.includes('\\') || /[\x00-\x1f\x7f:]/.test(name)) throw Error('Unsupported archive entry');
        const relative = name.slice(prefix.length).replace(/\/$/, '');
        if (relative && relative.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error('Unsafe archive path');
        if (offset + size > tar.length || size > maxFile || names.size >= maxFiles || names.has(relative.toLowerCase())) throw Error('Invalid archive size or duplicate entry');
        names.add(relative.toLowerCase());
        if (type === 53) { if (size) throw Error('Invalid directory'); }
        else { if (!relative) throw Error('Invalid file'); files.set(relative, { bytes: tar.subarray(offset, offset + size), mode: mode & 0o777 }); }
        offset += Math.ceil(size / 512) * 512;
    }
    if (!ended) throw Error('Truncated archive');
    // A file can never also be an ancestor, regardless of entry ordering.
    for (const name of files.keys()) { let parent = name; while (parent.includes('/')) { parent = parent.slice(0, parent.lastIndexOf('/')); if (files.has(parent)) throw Error('Archive file is also a directory'); } }
    return files;
}
module.exports = { parseArchive };
