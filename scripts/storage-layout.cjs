'use strict';
// Read-only inventory: no mkdir, credential output, worker, migration or cleanup.
const path = require('node:path');
const storage = require('../server/ohmybuddy-storage');
function main(args = process.argv.slice(2)) {
    if (args.length && (args.length !== 2 || args[0] !== '--root')) throw new Error('Usage: node scripts/storage-layout.cjs [--root /absolute/application]');
    const root = args.length ? args[1] : path.resolve(__dirname, '..');
    if (!path.isAbsolute(root)) throw new Error('Application root must be absolute');
    const env = { ...process.env };
    require('../server/pi-local-env').loadLocalEnv(storage.configFile(root, env), env);
    return storage.inspect(root, env);
}
if (require.main === module) {
    try { console.log(JSON.stringify(main(), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main };
