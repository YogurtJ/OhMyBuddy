import type { SubagentDelegationProviderDiagnostics } from "../api/delegation.ts";
import type { ChildSessionEvent } from "../runs/shared/child-session.ts";
type Diagnostics = SubagentDelegationProviderDiagnostics;
/** Immutable, bounded observations only. This never decides whether to retry. */
export declare function observeProviderDiagnostics(current: Diagnostics | undefined, event: ChildSessionEvent, at: number): Diagnostics | undefined;
export declare function clearProviderRetry(current: Diagnostics | undefined): Diagnostics | undefined;
export declare function snapshotProviderDiagnostics(current: Diagnostics | undefined): Diagnostics | undefined;
export declare function sameProviderDiagnostics(left: Diagnostics | undefined, right: Diagnostics | undefined): boolean;
export {};
