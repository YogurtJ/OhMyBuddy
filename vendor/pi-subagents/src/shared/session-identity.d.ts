interface SessionIdentityManager {
    getSessionFile(): string | null | undefined;
    getSessionId(): string | null | undefined;
}
export declare function resolveCurrentSessionId(sessionManager: SessionIdentityManager): string;
/** The id in a Pi session file's header, which `pi --session <id>` resolves; only ids that need no shell quoting. */
export declare function resolvePiSessionId(sessionFile: string | undefined): string | undefined;
export {};
