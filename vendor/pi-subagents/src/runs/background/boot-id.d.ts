import type { RecordedPid } from "./stale-run-reconciler.ts";
/**
 * Identity of the current machine boot, read once per process. A pid recorded under a
 * different boot id cannot still be running. Undefined when the platform has none.
 */
export declare function currentBootId(): string | undefined;
/** This process as a recorded pid, without the fields the platform does not have. */
export declare function currentRecordedPid(): RecordedPid;
/** Fixes the boot id without reading the OS; runners take Pi's value from their config. */
export declare function primeBootId(value: string | undefined): void;
/** Clears the cache so the next read calls `nextReader` (default: the OS reader). */
export declare function resetBootIdForTesting(nextReader?: () => string | undefined): void;
