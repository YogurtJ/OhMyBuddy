'use strict';
// First-time source/Git setup: save path-only defaults outside the program.
const fs = require('node:fs'), path = require('node:path');
const storage = require('../server/ohmybuddy-storage');
async function configure({ root = path.resolve(__dirname, '..'), env = process.env, port = 11408, agentDir } = {}) {
    root = fs.realpathSync.native(root);
    const file = storage.configFile(root, env);
    if (fs.existsSync(file)) return { created: false, configFile: file };
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('A valid fixed port is required');
    if (!agentDir) agentDir = (await import('@earendil-works/pi-coding-agent')).getAgentDir();
    if (!path.isAbsolute(agentDir) || /[\x00-\x1f\x7f]/.test(agentDir) || agentDir.trim() !== agentDir)
        throw new Error('PI_CODING_AGENT_DIR must be an absolute path');
    const prepared = { ...env, PI_CODING_AGENT_DIR: agentDir };
    const folders = storage.applyEnvironment(root, prepared);
    const values = { PORT: String(port), HOST: '127.0.0.1', OHMYBUDDY_WORKSPACE_BASE_URL: `http://127.0.0.1:${port}`,
        PI_CODING_AGENT_DIR: storage.nativeAgentDir(prepared), OHMYBUDDY_PROJECT_ROOTS: process.platform === 'win32' ? '' : '/',
        OHMYBUDDY_CONFIG_DIR: folders.config, OHMYBUDDY_STATE_DIR: folders.state, OHMYBUDDY_DATA_DIR: folders.data,
        OHMYBUDDY_CACHE_DIR: folders.cache, OHMYBUDDY_WORKSPACES_DIR: folders.workspaces,
        OHMYBUDDY_MEDIA_CONFIG_DIR: prepared.PI_MEDIA_CONFIG_DIR, OHMYBUDDY_MEDIA_DATA_DIR: prepared.PI_MEDIA_DATA_DIR };
    storage.prepareDirectory(path.dirname(file), { root, env: prepared });
    require('../server/pi-private-files').writePrivateFileSync(file, Object.entries(values).map(([name, value]) => `${name}=${value}`).join('\n') + '\n', true);
    return { created: true, configFile: file, port };
}
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--port')) { console.error('Usage: node scripts/configure-instance.cjs [--port 11408]'); process.exitCode = 1; }
    else configure({ port: args.length ? Number(args[1]) : 11408 }).then(result => console.log(JSON.stringify(result, null, 2)), error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { configure };
