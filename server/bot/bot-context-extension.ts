// Bot Mode runtime inside a managed worker. Active only when the Supervisor supplied a
// PIVANE_BOT_CONTEXT whose native window marker, session file and cwd all match this
// worker. Identity, job, permissions preset and window title/focus are re-read before
// every run, so edits take effect on the next message without restarting the worker.
import fs from 'node:fs';
import path from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { readRegistry } from '../pi-profile-registry.js';
import { safeFile } from '../pi-native-service.js';
import { setPromptSection } from '../pi-hook-prompt.js';
import { readWindowBinding } from './bot-window-state.js';
import { readWindowRecord } from './bot-window-registry.js';
import { readBot } from './bot-settings.js';
import { botPreamble } from './bot-prompt.js';

export const BOT_SECTION = 'pivane_bot';

export function parseBotContext(raw: string | undefined) {
    if (!raw) return null;
    try {
        const value = JSON.parse(raw);
        if (value?.version !== 1 || typeof value.profileId !== 'string' || typeof value.windowId !== 'string'
            || typeof value.sessionId !== 'string' || typeof value.cwd !== 'string' || !path.isAbsolute(value.cwd)
            || typeof value.sessionPath !== 'string' || !path.isAbsolute(value.sessionPath)) return null;
        return value;
    } catch { return null; }
}

// Returns the section text for this run, or null when this worker is not a verified Bot window.
export function botSection(context: any, manager: any, cwd: string, agentDir: string) {
    if (!context || manager.getSessionId() !== context.sessionId || cwd !== context.cwd || manager.getCwd() !== context.cwd) return null;
    try { if (fs.realpathSync.native(manager.getSessionFile()) !== context.sessionPath) return null; } catch { return null; }
    const binding = readWindowBinding(manager);
    if (!binding || binding.profileId !== context.profileId || binding.windowId !== context.windowId) return null;
    try {
        const profile = readRegistry(safeFile(agentDir, ['pivane-profiles', 'profiles.json'])).state.profiles
            .find((item: any) => item.id === context.profileId);
        const bot = readBot(profile);
        if (!profile?.enabled || profile.trashedAt !== undefined || !bot?.enabled || bot.workspace !== context.cwd) return null;
        const window = readWindowRecord(agentDir, context.profileId, context.windowId);
        if (!window || window.current?.sessionId !== context.sessionId) return null;
        return { binding, model: bot.model, soul: typeof profile.soul === 'string' ? profile.soul : '',
            text: botPreamble({ name: profile.name, bot, cwd: context.cwd, window }) };
    } catch { return null; }
}

// Aligns the run with the Bot's chosen model (null = keep the session's model). Only
// writes a model/thinking change when it differs. An unavailable model leaves the current
// one in place and tells the page once per desired model.
export async function alignModel(pi: any, ctx: any, desired: any, notify: (value: any) => void, reported: Set<string>) {
    if (!desired) return 'unchanged';
    const key = `${desired.provider}/${desired.id}`;
    const current = ctx.model;
    if (!current || current.provider !== desired.provider || current.id !== desired.id) {
        const model = ctx.modelRegistry?.find(desired.provider, desired.id);
        let ok = false;
        try { ok = Boolean(model) && await pi.setModel(model); } catch { ok = false; }
        if (!ok) {
            if (!reported.has(key)) { reported.add(key); notify({ event: 'model', status: 'unavailable', provider: desired.provider, id: desired.id }); }
            return 'unavailable';
        }
    }
    reported.delete(key);
    if (desired.thinking && pi.getThinkingLevel() !== desired.thinking) pi.setThinkingLevel(desired.thinking);
    return 'aligned';
}

export function registerBotContext(pi: ExtensionAPI, getAgentDir: () => string) {
    const context = parseBotContext(process.env.PIVANE_BOT_CONTEXT);
    if (!context) return;
    const managed = (ctx: any) => ctx.mode === 'rpc' && Boolean(process.env.PI_WEB_NAVIGATION_TOKEN);
    const reported = new Set<string>();
    // Private bridge record: the Supervisor consumes it and never shows it as a notification.
    const notifier = (ctx: any) => (value: any) => ctx.ui.notify(JSON.stringify({ pivaneBot: value, sessionId: ctx.sessionManager.getSessionId() }));
    pi.on('session_start', async (_event, ctx: any) => {
        if (!managed(ctx)) return;
        const loaded = botSection(context, ctx.sessionManager, ctx.cwd, getAgentDir());
        const notify = notifier(ctx);
        notify(loaded ? { event: 'loaded', profileId: context.profileId, windowId: context.windowId, generation: loaded.binding.generation }
            : { event: 'loaded', profileId: null });
        // Align at open so the page shows the Bot's model before the first message.
        if (loaded) await alignModel(pi, ctx, loaded.model, notify, reported);
    });
    pi.on('before_agent_start', async (event: any, ctx: any) => {
        if (!managed(ctx)) return;
        const loaded = botSection(context, ctx.sessionManager, ctx.cwd, getAgentDir());
        if (!loaded) return;
        await alignModel(pi, ctx, loaded.model, notifier(ctx), reported);
        setPromptSection(event, BOT_SECTION, loaded.text, { wrapForced: true });
        // The profile runtime keeps the personality loaded at worker start; a Bot's personality
        // can change mid-conversation (onboarding, settings), so the current one replaces it.
        // A forced prompt is opaque: appending a second personality there would contradict the first.
        if (event.systemPromptOptions.forceSystemPrompt === undefined) {
            if (loaded.soul.trim()) event.systemPromptOptions.sections.assistant_profile_soul = loaded.soul;
            else delete event.systemPromptOptions.sections.assistant_profile_soul;
        }
    });
}
