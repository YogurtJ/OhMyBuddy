'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { NativeDirectoryPicker, commandFor, guiEnvironment, localRequest } = require('../server/pi-native-directory-picker');
const req = (remoteAddress = '127.0.0.1', host = 'localhost:11408', origin = 'http://localhost:11408') => ({ socket: { remoteAddress }, headers: { host, origin } });
test('native dialog admission uses actual socket and loopback origin, never forwarded headers', () => {
    assert(localRequest(req())); assert(localRequest(req('::ffff:127.0.0.1')));
    assert(!localRequest(req('192.0.2.1'))); assert(!localRequest(req('127.0.0.1', 'public.example')));
    assert(!localRequest(req('127.0.0.1', 'localhost:11408', 'https://evil.invalid')));
    const forged = req('192.0.2.2'); forged.headers['x-forwarded-for'] = '127.0.0.1'; assert(!localRequest(forged));
});
test('chooser environment retains GUI session values while dropping every provider and workspace credential', () => {
    const env = guiEnvironment({ HOME: '/home/test', Path: '/bin', DISPLAY: ':0', XAUTHORITY: '/tmp/xauth', OPENAI_API_KEY: 'synthetic', PI_WORKSPACE_INTERNAL_TOKEN: 'synthetic', COOKIE: 'synthetic' }, '/a path');
    assert.equal(env.Path, '/bin'); assert.equal(env.DISPLAY, ':0'); assert.equal(env.OHMYBUDDY_DIRECTORY_PICKER_INITIAL, '/a path');
    assert(!Object.hasOwn(env, 'OPENAI_API_KEY')); assert(!Object.hasOwn(env, 'PI_WORKSPACE_INTERNAL_TOKEN')); assert(!Object.hasOwn(env, 'COOKIE'));
});
test('platform commands keep paths out of executable scripts and support Linux desktop/headless modes', t => {
    const initial = '/tmp/name " with $literal; text';
    if (process.platform === 'darwin') { const mac = commandFor('darwin', {}, initial); assert.equal(mac.args.at(-1), initial); assert(!mac.args[1].includes(initial)); }
    const win = commandFor('win32', { SystemRoot: 'C:\\Windows' }, initial); assert(win.args.includes('-STA')); assert(!Buffer.from(win.args.at(-1), 'base64').toString('utf16le').includes(initial));
    assert.equal(commandFor('linux', { PATH: '/unavailable' }, initial), null);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omb-picker-command-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'zenity'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    const linux = commandFor('linux', { PATH: dir, DISPLAY: ':0' }, initial); assert.equal(linux.command, path.join(dir, 'zenity')); assert(linux.args.includes('--filename=' + initial + path.sep));
});
test('pending chooser owns admission synchronously and remains busy until actual cancellation completes', async () => {
    let finish, observedSignal;
    const picker = new NativeDirectoryPicker({ command: () => ({ command: 'synthetic', args: [] }), run: async (_spec, { signal }) => { observedSignal = signal; return new Promise(resolve => { finish = resolve; }); } });
    const abort = new AbortController(), operation = picker.pick('/project', abort.signal);
    assert.equal(picker.busy, true); await assert.rejects(picker.pick('/other'), error => error.status === 409);
    await Promise.resolve(); abort.abort(); assert.equal(observedSignal.aborted, true); assert.equal(picker.busy, true);
    let closed = false; const closing = picker.dispose().then(() => { closed = true; }); await Promise.resolve(); assert.equal(closed, false);
    finish(null); await operation; await closing; assert.equal(picker.busy, false); await assert.rejects(picker.pick('/project'));
});
test('real child pipe handles Unicode paths and does not interpret their shell characters', async () => {
    const initial = '/tmp/中文 " $literal; folder';
    const picker = new NativeDirectoryPicker({ command: () => ({ command: process.execPath, args: ['-e', 'const b=Buffer.from(process.env.OHMYBUDDY_DIRECTORY_PICKER_INITIAL+"\\n"); process.stdout.write(b.subarray(0,6));setImmediate(()=>process.stdout.write(b.subarray(6)));'] }) });
    try { assert.equal(await picker.pick(initial), initial); } finally { await picker.dispose(); }
});
