// Pi 1.5 keeps runtime-owned stream identity in a WeakMap for summary auth.
// This internal export is intentionally guarded by the reviewed host version.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import reviewedHost from './pi-reviewed-host.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/@earendil-works/pi-coding-agent');
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (metadata.name !== '@earendil-works/pi-coding-agent' || metadata.version !== reviewedHost.REVIEWED_PI_VERSION)
    throw new Error(`Runtime stream adaptation requires the reviewed Pi ${reviewedHost.REVIEWED_PI_VERSION} host package`);
const native = await import(pathToFileURL(path.join(root, 'dist/core/agent-session.js')).href);
if (typeof native.markRuntimeStreamFunction !== 'function') throw new Error('Native runtime stream identity export is unavailable');

// Call only for sessions created by the native SDK factory: their original
// stream already resolves credentials through this same ModelRuntime.
export function markManagedRuntimeStream(session, stream) {
    if (!session.modelRuntime || typeof stream !== 'function') throw new Error('Managed runtime stream is unavailable');
    native.markRuntimeStreamFunction(stream, session.modelRuntime);
}
