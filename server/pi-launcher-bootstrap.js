'use strict';
// The installed service keeps a fixed entry point while application releases
// (including their maintenance implementation) remain independently versioned.
const fs = require('node:fs');
const path = require('node:path');
const { readSafe } = require('./pi-maintenance-files');
function start(root) {
    root = fs.realpathSync.native(root);
    require('./pi-local-env').loadLocalEnv(require('./ohmybuddy-storage').configFile(root));
    const stateFile = path.join(require('./ohmybuddy-compat').runtimeDirectory(root), 'state.json');
    let entry = root;
    if (fs.existsSync(stateFile)) {
        const state = JSON.parse(readSafe(stateFile));
        if (state.version !== 1 || state.needsRecovery) throw Error('Installation needs recovery');
        // releasePath verifies the installation marker and locked package before
        // any code from the selected release is loaded. No state is mutated here.
        const inspector = new (require('./pi-managed-launcher').ManagedLauncher)({ root });
        entry = inspector.releasePath(state.active);
    }
    return require(path.join(entry, 'server/pi-server-entry.js')).startManaged(root);
}
module.exports = { start };
