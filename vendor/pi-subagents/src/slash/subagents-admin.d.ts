import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
export declare const ADMIN_MESSAGE_TYPE = "subagents-admin";
export declare function openSubagentsAdmin(pi: ExtensionAPI, ctx: ExtensionContext, args?: string): Promise<void>;
