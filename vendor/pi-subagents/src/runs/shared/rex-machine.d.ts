import type { PlacementMachineReference, RexLocalMachineReference } from "../../shared/types.ts";
/** `machine: "local"` is reserved: this machine, in a Rex pane of the parent's own Rex session. It never consults the Herdr catalog. */
export declare const REX_LOCAL_MACHINE = "local";
/** Rex CLI exit codes: 3 means the target is gone, 4 means the server is unreachable (state unknown, never "gone"). */
export declare const REX_EXIT_GONE = 3, REX_EXIT_UNREACHABLE = 4;
/** A `local` child edits this machine's disk; every other placed child edits the remote one. */
export declare function isRexLocalMachine(machine: PlacementMachineReference | undefined): machine is RexLocalMachineReference;
/** The Rex server bundle's CLI, relative to the home directory. */
export declare const REX_BUNDLE_BIN = "Library/Application Support/com.superlogical.rex/RexServer/Versions/Current/Rex Server.app/Contents/MacOS/rex";
export declare const REX_CALL_TIMEOUT_MS = 15000, REX_MAX_OUTPUT: number;
/** Global rex flags: never start a server, and use the recorded one when there is one. */
export declare function rexGlobalArgs(server: string | undefined): string[];
/** `$REX_BIN_DIR/rex`, then `rex` on PATH, then the Rex server bundle. */
export declare function resolveRexBinary(env?: NodeJS.ProcessEnv): string;
/** Every Rex selector comes from the recorded machine reference, never from the calling process's own Rex pane variables. */
export declare function rexCommandEnv(source?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
/**
 * Resolves `machine: "local"` in the parent: records its Rex session (confirmed by the server) and server address, and the real
 * launch directory. `stepCwd` is absolute, `~`, or relative to the parent's launch directory `cwd`.
 */
export declare function resolveRexLocalPlacement(input: {
    cwd: string;
    stepCwd?: string;
    env?: NodeJS.ProcessEnv;
}): RexLocalMachineReference;
