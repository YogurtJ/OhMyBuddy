import type { PlacementMachineAccess } from "./placement-host.ts";
/** Machine access for the parent's own machine: the same quoted `sh -c` scripts the SSH access sends, run directly through /bin/sh. */
export declare function localMachineAccess(options?: {
    env?: NodeJS.ProcessEnv;
}): PlacementMachineAccess;
