'use strict';
const { execFile } = require('node:child_process');
const run = require('node:util').promisify(execFile);
// A single OS trash request. No permanent-delete fallback and no automatic replay.
async function trashTaskDirectory(directory) {
    if (process.platform === 'darwin') {
        const script = `ObjC.import('Foundation'); function run(argv) {
            if (!$.NSFileManager.defaultManager.trashItemAtURLResultingItemURLError($.NSURL.fileURLWithPath(argv[0]), null, null))
                throw new Error('System directory trash did not complete');
        }`;
        await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, directory], { timeout: 10000, maxBuffer: 65536 });
    } else if (process.platform === 'linux') {
        await run('gio', ['trash', '--', directory], { timeout: 10000, maxBuffer: 65536 });
    } else throw new Error('Safe directory trash is unavailable on this platform');
}
trashTaskDirectory.supported = ['darwin', 'linux'].includes(process.platform);
module.exports = { trashTaskDirectory };
