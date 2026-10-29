const fs = require('node:fs');
const path = require('node:path');

const PRODUCT = 'OhMyBuddy';
const PACKAGE = 'ohmybuddy';
const LEGACY_PRODUCT = 'Pivane';
const LEGACY_PACKAGE = 'pivane';
// Public source repository. GitHub keeps redirects from the former YogurtJ/pivane address.
const REPOSITORY = 'YogurtJ/OhMyBuddy';
const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
const isProduct = value => value === PRODUCT || value === LEGACY_PRODUCT;
const isPackage = value => value === PACKAGE || value === LEGACY_PACKAGE;

// Native entry types and bridge payloads are versioned compatibility contracts,
// not display names. Do not rewrite JSONL, SQLite, browser preferences or IPC.
const INTERNAL_COMMAND = 'pivane-web-navigate';
const INTERNAL_COMMAND_PATTERN = '(?:pivane|pi5)-web-navigate';
const isInternalCommand = name => typeof name === 'string' && /^(?:pivane|pi5)-web-navigate(?::\d+)?$/.test(name);
const customTypeIs = (entry, current) => entry?.customType === current || entry?.customType === current.replace(/^pivane-/, 'pi5-');

function exists(file) {
    try { fs.lstatSync(file); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
// Select a single existing identity without moving/copying it. Callers retain
// their own descriptor, symlink/type/permission and before/after checks.
function selectName(directory, names) {
    const candidates = [...new Set(names)];
    const present = candidates.filter(name => exists(path.join(directory, name)));
    if (present.length > 1) throw new Error(`Conflicting current and legacy locations: ${candidates.join(', ')}`);
    return present[0] || candidates[0];
}
function dataFile(directory, name) {
    const current = name.replace(/^(\.?)(?:pivane|ohmybuddy)(?=[-_.]|$)/, '$1ohmybuddy');
    const old = current.replace(/^(\.?)ohmybuddy(?=[-_.]|$)/, '$1pivane');
    const older = old.replace(/^pivane-/, 'pi5-');
    return path.join(directory, selectName(directory, [current, old, older]));
}
function runtimeDirectory(root) { return dataFile(root, '.ohmybuddy-runtime'); }
function knowledgeFile(root, suffix) {
    if (!['.json', '.pending'].includes(suffix)) throw new Error('Unknown knowledge ledger');
    const current = ['.json', '.pending'].some(ext => exists(path.join(root, '.ohmybuddy-knowledge' + ext)));
    const legacy = ['.json', '.pending'].some(ext => exists(path.join(root, '.pivane-knowledge' + ext)));
    if (current && legacy) throw new Error('Conflicting current and legacy knowledge ledgers');
    return path.join(root, (legacy ? '.pivane' : '.ohmybuddy') + '-knowledge' + suffix);
}
function metadataFile(root, kind) {
    if (!['BUNDLE', 'INSTALLATION'].includes(kind)) throw new Error('Unknown installation metadata');
    return path.join(root, selectName(root, [`OHMYBUDDY_${kind}.json`, `PIVANE_${kind}.json`]));
}
function packageMetadata(pkg, suffix) {
    const current = pkg?.['ohmybuddy' + suffix], old = pkg?.['pivane' + suffix];
    if (current !== undefined && old !== undefined) throw new Error(`Conflicting package metadata: ${suffix}`);
    return current ?? old;
}
function privateReply(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
    for (const suffix of ['Models', 'Resources', 'TitleEligibility', 'Title', 'History', 'Context', 'Navigation']) {
        const legacy = `pi5${suffix}`, current = `pivane${suffix}`;
        if (Object.hasOwn(record, legacy) && typeof record[current] !== (suffix === 'TitleEligibility' ? 'boolean' : 'string')) record[current] = record[legacy];
    }
    return record;
}
module.exports = { PRODUCT, PACKAGE, LEGACY_PRODUCT, LEGACY_PACKAGE, REPOSITORY, REPOSITORY_URL, isProduct, isPackage, selectName,
    INTERNAL_COMMAND, INTERNAL_COMMAND_PATTERN, isInternalCommand, customTypeIs, dataFile, runtimeDirectory, knowledgeFile, metadataFile, packageMetadata, privateReply };
