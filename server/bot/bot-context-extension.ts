// Bot Mode runtime inside a managed worker. Active only when the Supervisor supplied a
// PIVANE_BOT_CONTEXT whose native window marker, session file and cwd all match this
// worker. Identity, job, permissions preset and window title/focus are re-read before
// every run, so edits take effect on the next message without restarting the worker.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { readRegistry } from '../pi-profile-registry.js';
import { safeFile } from '../pi-native-service.js';
import { setPromptSection } from '../pi-hook-prompt.js';
import { lastRun } from '../pi-cron-runtime.js';
import { readWindowBinding } from './bot-window-state.js';
import { readWindowRecord } from './bot-window-registry.js';
import { readBot } from './bot-settings.js';
import { botPreamble } from './bot-prompt.js';
import { SETUP_TOOL, SETUP_TITLE, SAVE, DECLINE, normalizeProposal } from './bot-setup.js';
import { APPROVAL_TITLE, BLOCKED, PRESETS, approvalFor, approvalMessage, newToken } from './bot-guard.js';
import { safeFile as readDocument } from '../profile-memory/management.js';
import { registerNotebook, notebookNotice, editNotebook } from './bot-notebook.ts';
import { registerRecall } from './bot-recall-tools.ts';
import { structuredCompaction, summaryReasoning } from './bot-compaction.js';
import { pruneDrafts, idleDelay, idleCompactionWanted, rotationReason } from './bot-maintenance.js';
import { Type } from 'typebox';

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
        return { binding, model: bot.model, soul: typeof profile.soul === 'string' ? profile.soul : '', profile, bot,
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

// The permission preset of this worker's Bot, for the approval gate. null only when this
// worker is not running the Bot window it was started for. The gate fails closed: once
// the session is the Bot's, anything that cannot be verified or read (after a short retry
// for a profile file being replaced) counts as "Ask every time".
export async function botPreset(context: any, manager: any, cwd: string, agentDir: string, wait = (ms: number) => new Promise(done => setTimeout(done, ms))) {
    if (!context || manager.getSessionId() !== context.sessionId) return null;
    try {
        if (cwd !== context.cwd || manager.getCwd() !== context.cwd || fs.realpathSync.native(manager.getSessionFile()) !== context.sessionPath) return 'ask';
        const binding = readWindowBinding(manager);
        if (!binding || binding.profileId !== context.profileId || binding.windowId !== context.windowId) return 'ask';
    } catch { return 'ask'; }
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const profile = readRegistry(safeFile(agentDir, ['pivane-profiles', 'profiles.json'])).state.profiles
                .find((item: any) => item.id === context.profileId);
            const preset = profile && profile.trashedAt === undefined ? readBot(profile)?.permissions?.preset : undefined;
            return PRESETS.includes(preset) ? preset : 'ask';
        } catch { if (attempt < 2) await wait(40 * (attempt + 1)); }
    }
    return 'ask';
}

// Same rule as the scheduler runtime: a run stays active until it is finished or reviewed,
// and only then is its original model restored.
export function scheduledRunActive(manager: any) {
    const run = lastRun(manager);
    return Boolean(run && !['completed', 'silent', 'skipped', 'error', 'stopped'].includes(run.status));
}

// What the user can see as this Bot right now, for reporting what a setup card saved.
function identitySnapshot(context: any, agentDir: string) {
    const profile = readRegistry(safeFile(agentDir, ['pivane-profiles', 'profiles.json'])).state.profiles
        .find((item: any) => item.id === context.profileId);
    let entries: string[] = [];
    try {
        const file = safeFile(agentDir, ['pivane-profiles', 'data', context.profileId, 'USER.md']);
        const text = readDocument(file)?.text ?? '';
        entries = text ? text.split('\n§\n').map((part: string) => part.trim()).filter(Boolean) : [];
    } catch { entries = []; }
    return { name: profile?.name ?? null, avatar: profile?.avatar?.kind === 'emoji' ? profile.avatar.value : null,
        job: readBot(profile)?.job ?? null, personality: typeof profile?.soul === 'string' ? profile.soul : null, entries };
}

// The Bot proposes; the user decides on an editable card in the Bot page, where the server
// saves the confirmed values. The result reports only what is actually saved now.
function registerSetupTool(pi: ExtensionAPI, context: any, getAgentDir: () => string) {
    let pending = false;
    pi.registerTool({
        name: SETUP_TOOL, label: 'Propose Bot setup', exposure: 'model-only',
        description: 'Propose changes to your own name, face (one emoji), main job or personality, or short lasting facts about the user (how to address them, what matters to them). The user sees an editable card and decides; nothing is saved unless they confirm. Returns status and the values actually saved, which may differ from your proposal because the user can edit them.',
        promptSnippet: 'Propose changes to your own identity or notes about the user for the user to confirm',
        promptGuidelines: [
            'Use bot_setup_propose for your own name, face emoji, main job and personality, and for lasting facts about the user. Propose one coherent step at a time, in the user\'s language.',
            'Only status "saved" means something changed; then use the returned values, since the user may have edited them. After "declined" or "no_answer", carry on without proposing the same thing again right away.'
        ],
        parameters: Type.Object({
            name: Type.Optional(Type.String({ maxLength: 40, description: 'Your new name.' })),
            avatar: Type.Optional(Type.String({ maxLength: 16, description: 'One emoji for your face.' })),
            job: Type.Optional(Type.String({ maxLength: 300, description: 'One sentence: what you mainly help this user with.' })),
            personality: Type.Optional(Type.String({ maxLength: 6000, description: 'Your personality and way of talking, written as guidance to yourself (second person), a few short paragraphs at most.' })),
            aboutUser: Type.Optional(Type.Array(Type.String({ maxLength: 300 }), { maxItems: 6, description: 'Short, self-contained facts about the user, e.g. how to address them.' })),
            finish: Type.Optional(Type.Boolean({ description: 'true when this completes getting to know each other.' }))
        }),
        execute: async (_id: string, input: any, signal: AbortSignal | undefined, _update: any, ctx: any) => {
            if (!botSection(context, ctx.sessionManager, ctx.cwd, getAgentDir())) throw new Error('Bot setup is unavailable in this conversation');
            const proposal = normalizeProposal(input);
            const reply = (value: any) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }], details: { pivaneBotSetup: value } });
            if (!ctx.hasUI) return reply({ status: 'unavailable' });
            if (pending) throw new Error('Another setup card is still waiting for the user');
            pending = true;
            try {
                const before = identitySnapshot(context, getAgentDir());
                const answer = await ctx.ui.select(SETUP_TITLE, [SAVE, DECLINE], { signal, timeout: 30 * 60 * 1000 });
                if (answer === undefined) return reply({ status: signal?.aborted ? 'aborted' : 'no_answer' });
                if (answer !== SAVE) return reply({ status: 'declined' });
                const after = identitySnapshot(context, getAgentDir());
                const saved: any = {};
                for (const key of ['name', 'avatar', 'job', 'personality'] as const) {
                    if (proposal[key] === undefined) continue;
                    if (after[key] !== before[key] || after[key] === proposal[key]) saved[key] = key === 'personality' && after[key]
                        ? String(after[key]).slice(0, 1500) : after[key];
                }
                const added = after.entries.filter((entry: string) => !before.entries.includes(entry));
                if (proposal.aboutUser && added.length) saved.aboutUser = added;
                const status = Object.keys(saved).length ? 'saved' : 'not_saved';
                return reply({ status, saved, ...(status === 'not_saved' ? { note: 'Nothing was saved. The card can only be saved in the Bot page.' } : {}) });
            } finally { pending = false; }
        }
    } as any);
}

// Panel edits arrive through Pivane's internal command; only a verified Bot window worker accepts them.
let notebookEditor: ((ctx: any, input: any) => any) | null = null;
export function handleBotNotebook(ctx: any, input: any) {
    if (!notebookEditor) throw new Error('This chat has no notebook');
    return notebookEditor(ctx, input);
}

export function registerBotContext(pi: ExtensionAPI, getAgentDir: () => string) {
    const context = parseBotContext(process.env.PIVANE_BOT_CONTEXT);
    if (!context) return;
    const managed = (ctx: any) => ctx.mode === 'rpc' && Boolean(process.env.PI_WEB_NAVIGATION_TOKEN);
    const reported = new Set<string>();
    // Private bridge record: the Supervisor consumes it and never shows it as a notification.
    const notifier = (ctx: any) => (value: any) => ctx.ui.notify(JSON.stringify({ pivaneBot: value, sessionId: ctx.sessionManager.getSessionId() }));
    let toolRegistered = false;
    pi.on('session_start', async (_event, ctx: any) => {
        if (!managed(ctx)) return;
        const loaded = botSection(context, ctx.sessionManager, ctx.cwd, getAgentDir());
        if (loaded && !toolRegistered) {
            toolRegistered = true;
            registerSetupTool(pi, context, getAgentDir);
            const verified = (toolCtx: any) => Boolean(botSection(context, toolCtx.sessionManager, toolCtx.cwd, getAgentDir()));
            registerNotebook(pi, verified);
            registerRecall(pi, context, getAgentDir, verified);
        }
        const notify = notifier(ctx);
        notify(loaded ? { event: 'loaded', profileId: context.profileId, windowId: context.windowId, generation: loaded.binding.generation }
            : { event: 'loaded', profileId: null });
        // Align at open so the page shows the Bot's model before the first message.
        if (loaded) await alignModel(pi, ctx, loaded.model, notify, reported);
    });
    // Careful presets: the user approves commands, hand-offs and outside writes ("Ask every
    // time": everything but reading) before they run. Unattended runs cannot be approved.
    // A nested call (codemode) is cancelled with its parent tool, so its request is too.
    const nested = new Map<string, Set<AbortController>>();
    pi.on('tool_execution_end', (event: any) => {
        const waiting = nested.get(event?.toolCallId);
        if (!waiting) return;
        nested.delete(event.toolCallId);
        for (const controller of waiting) controller.abort();
    });
    pi.on('tool_call', async (event: any, ctx: any) => {
        if (!managed(ctx)) return;
        // Tracked from the start: the parent can end while the preset is still being read.
        const controller = new AbortController(), parent = event.parentToolCallId;
        if (parent) { if (!nested.has(parent)) nested.set(parent, new Set()); nested.get(parent)!.add(controller); }
        try {
            const preset = await botPreset(context, ctx.sessionManager, ctx.cwd, getAgentDir());
            if (!preset) return;
            let annotations;
            try { annotations = pi.getAllTools().find((tool: any) => tool.name === event.toolName)?.annotations; } catch { annotations = undefined; }
            const approval = approvalFor({ preset, toolName: event.toolName, input: event.input, cwd: context.cwd, annotations });
            if (!approval) return;
            if (!ctx.hasUI || scheduledRunActive(ctx.sessionManager)) return { block: true, reason: BLOCKED.unattended };
            // Already cancelled with its parent: nothing to ask about.
            if (controller.signal.aborted) return { block: true, reason: BLOCKED.not_approved };
            const token = newToken();
            const signal = ctx.signal ? AbortSignal.any([controller.signal, ctx.signal]) : controller.signal;
            let allowed = false;
            // However it ends, the request is over: the Supervisor drops it if still pending.
            try { allowed = await ctx.ui.confirm(APPROVAL_TITLE, approvalMessage({ ...approval, token }), { signal, timeout: 30 * 60 * 1000 }); }
            finally { notifier(ctx)({ event: 'approval-done', token }); }
            return allowed && !controller.signal.aborted ? undefined : { block: true, reason: BLOCKED.not_approved };
        } finally {
            if (parent) { nested.get(parent)?.delete(controller); if (!nested.get(parent)?.size) nested.delete(parent); }
        }
    });
    // Every compaction of a Bot window (idle, threshold, overflow) gets the structured summary with
    // notebook reconciliation (D-029). Any failure falls back to Pi's own summary; the notebook is
    // then shown to the model again before the next run (notebookNotice).
    pi.on('session_before_compact', async (event: any, ctx: any) => {
        if (!managed(ctx) || !botSection(context, ctx.sessionManager, ctx.cwd, getAgentDir())) return;
        const model = ctx.model;
        if (!model) return;
        try {
            const result = await structuredCompaction({
                branch: event.branchEntries, projection: ctx.sessionManager.buildSessionProjection().entries,
                firstKeptEntryId: event.preparation.firstKeptEntryId, previousSummary: event.preparation.previousSummary,
                sessionId: ctx.sessionManager.getSessionId(), model, now: new Date().toISOString(), reason: event.reason, signal: event.signal,
                complete: async ({ systemPrompt, text, signal }: any) => {
                    // Request options as in Pi's own summaries: the chat's thinking level when the model
                    // reasons (some reasoning models reject a request without one), no cache writes.
                    const response = await ctx.modelRegistry.streamSimple(model, { systemPrompt,
                        messages: [{ role: 'user', content: [{ type: 'text', text }], timestamp: Date.now() }] },
                    { maxTokens: 16000, signal, cacheRetention: 'none', sessionId: randomUUID(), ...summaryReasoning(model, pi.getThinkingLevel()) }).result();
                    const answer = (response.content || []).filter((part: any) => part?.type === 'text').map((part: any) => part.text).join('\n');
                    return { text: answer, usage: response.usage, stopReason: response.stopReason, errorMessage: response.errorMessage };
                }
            });
            notifier(ctx)({ event: 'compacted', reason: event.reason, structured: true });
            return { compaction: { summary: result.summary, firstKeptEntryId: event.preparation.firstKeptEntryId,
                tokensBefore: event.preparation.tokensBefore, details: result.details, usage: result.usage } };
        } catch (error: any) {
            if (!event.signal?.aborted) notifier(ctx)({ event: 'compacted', reason: event.reason, structured: false,
                error: String(error?.message || error).slice(0, 200) });
            return undefined;
        }
    });
    const isBot = (ctx: any) => managed(ctx) && Boolean(botSection(context, ctx.sessionManager, ctx.cwd, getAgentDir()));
    notebookEditor = (ctx: any, input: any) => {
        if (!isBot(ctx)) throw new Error('This chat has no notebook');
        return editNotebook(pi, ctx, input);
    };
    // S1 (D-030): at the end of a completed run, old large tool outputs become short stubs when
    // that saves a lot. Earlier drafts of other extensions are kept as they are.
    pi.on('agent_before_settle', (event: any, ctx: any) => {
        if (event.outcome !== 'completed' || !isBot(ctx)) return;
        const drafts = pruneDrafts(event.context?.contextEntries || [], ctx.getContextUsage());
        return drafts.length ? { entries: [...(event.entries || []), ...drafts] } : undefined;
    });
    // S2 (D-030): once the prompt cache has gone cold, a still idle and fairly full window is
    // summarized in the background, so the user does not wait for it in their next message.
    // A generation that is due to move on (S4) is summarized too: the server rotates after a
    // compaction, so the next generation starts from a fresh summary.
    const rotationDue = (manager: any) => {
        try {
            const file = manager.getSessionFile();
            const bytes = file ? fs.statSync(file).size : 0;
            return rotationReason({ bytes, entries: bytes >= 1024 * 1024 ? manager.getEntries().length : 0,
                startedAt: manager.getHeader?.()?.timestamp, now: Date.now() });
        } catch { return null; }
    };
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const stopIdle = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = null; };
    pi.on('agent_start', stopIdle);
    pi.on('session_shutdown', stopIdle);
    pi.on('agent_settled', (_event: any, ctx: any) => {
        stopIdle();
        if (!isBot(ctx)) return;
        idleTimer = setTimeout(() => {
            idleTimer = null;
            try {
                if (!ctx.isIdle() || ctx.hasPendingMessages() || scheduledRunActive(ctx.sessionManager) || !isBot(ctx)) return;
                const rotating = Boolean(rotationDue(ctx.sessionManager));
                if (!rotating && !idleCompactionWanted(ctx.getContextUsage(), ctx.sessionManager.buildSessionProjection().entries)) return;
                ctx.compact({ customInstructions: rotating ? 'pivane-bot-rotate' : 'pivane-bot-idle', onError: () => {} });
            } catch { /* Best effort: the native threshold still applies. */ }
        }, idleDelay(ctx.model));
        (idleTimer as any).unref?.();
    });
    pi.on('before_agent_start', async (event: any, ctx: any) => {
        if (!managed(ctx)) return;
        const loaded = botSection(context, ctx.sessionManager, ctx.cwd, getAgentDir());
        if (!loaded) return;
        // A scheduled run was admitted and priced with the model it selected; it keeps it.
        if (!scheduledRunActive(ctx.sessionManager)) await alignModel(pi, ctx, loaded.model, notifier(ctx), reported);
        setPromptSection(event, BOT_SECTION, loaded.text, { wrapForced: true });
        // The profile runtime keeps the personality loaded at worker start; a Bot's personality
        // can change mid-conversation (onboarding, settings), so the current one replaces it.
        // A forced prompt is opaque: appending a second personality there would contradict the first.
        if (event.systemPromptOptions.forceSystemPrompt === undefined) {
            if (loaded.soul.trim()) event.systemPromptOptions.sections.assistant_profile_soul = loaded.soul;
            else delete event.systemPromptOptions.sections.assistant_profile_soul;
        }
        // The notebook is appended to the conversation (never the system prompt), so the cached prefix stays.
        const notice = notebookNotice(ctx.sessionManager.getBranch(), new Date().toISOString());
        if (notice) return { message: notice };
    });
}
