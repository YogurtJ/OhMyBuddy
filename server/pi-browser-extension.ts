import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import browser from './browser/service.js';

// Only register an official server. Pi owns discovery, execution, cancellation
// and transport cleanup; no browser tool schema or page executor lives here.
export function registerBrowser(pi: ExtensionAPI) {
    const source = process.env.OHMYBUDDY_BROWSER_MCP_CONFIG;
    if (!source) return;
    const managed = JSON.parse(source);
    let registered = false;
    const connect = (_event: unknown, ctx: any) => {
        if (registered || ctx.mode !== 'rpc' || !ctx.sessionManager.getSessionFile()
            || ctx.sessionManager.getSessionId() !== managed.sessionId || !process.env.PI_WEB_NAVIGATION_TOKEN) return;
        if (!browser.readSettings(managed.settingsFile).enabled) return;
        pi.registerMcpServer(browser.SERVER_NAME, managed.config);
        registered = true;
    };
    pi.on('session_start', connect);
    pi.on('before_agent_start', connect);
    pi.on('agent_settled', event => {
        if (event.aborted && registered) {
            // A transport cancellation cannot roll back a submission. Disconnect
            // the native stdio server too, so its pending code cannot keep running.
            pi.unregisterMcpServer(browser.SERVER_NAME);
            registered = false;
        }
    });
    pi.on('tool_call', (event, ctx) => {
        if (!registered || !event.toolName.startsWith(`mcp__${browser.SERVER_NAME}__`)) return;
        if (ctx.sessionManager.getSessionId() !== managed.sessionId || !browser.readSettings(managed.settingsFile).enabled)
            return { block: true, reason: 'Browser settings or session changed. Reopen the idle conversation before continuing.' };
    });
}
