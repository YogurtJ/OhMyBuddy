'use strict';
const path = require('node:path');
const TARGETS = Object.freeze({ darwin: ['arm64', 'x64'], linux: ['arm64', 'x64'], win32: ['x64'] });
function supported(platform, arch) { return !!TARGETS[platform]?.includes(arch); }
function nodePath(root, platform = process.platform) { return path.join(root, platform === 'win32' ? 'runtime/node.exe' : 'runtime/bin/node'); }
function toolPath(name, platform = process.platform) { return 'bin/' + name + (platform === 'win32' ? '.exe' : ''); }
function runtimeEnvironment(root, env = process.env, platform = process.platform) {
    const result = { ...env }, oldKey = Object.keys(env).find(key => key.toLowerCase() === 'path');
    const oldPath = oldKey ? env[oldKey] : '';
    for (const key of Object.keys(result)) if (key.toLowerCase() === 'path') delete result[key];
    const folders = [path.join(root, 'bin'), path.dirname(nodePath(root, platform))];
    if (platform === 'win32') {
        const system = env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows';
        folders.push(path.join(root, 'runtime/git/bin'), path.join(root, 'runtime/git/cmd'), path.join(root, 'runtime/git/usr/bin'), path.join(system, 'System32'), path.join(system, 'System32/WindowsPowerShell/v1.0'), path.join(system, 'System32/Wbem'));
    }
    else folders.push('/usr/bin', '/bin', '/usr/sbin', '/sbin');
    result.PATH = [...folders, oldPath || ''].filter(Boolean).join(platform === 'win32' ? ';' : ':');
    return result;
}
module.exports = { TARGETS, supported, nodePath, toolPath, runtimeEnvironment };
