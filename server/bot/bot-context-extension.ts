// Bot Mode runtime inside a managed worker. Active only when the Supervisor supplied a
// PIVANE_BOT_CONTEXT whose native window marker, session file and cwd all match this
// worker. Identity, job, permissions preset and window title/focus/instructions are re-read before
// every run, so edits take effect on the next message without restarting the worker.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import avatarPresets from '../../public/pi-avatar-presets.js';
import { SettingsManager, createGrepToolDefinition, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { readRegistry } from '../pi-profile-registry.js';
import { safeFile } from '../pi-native-service.js';
import { setPromptSection } from '../pi-hook-prompt.js';
import { lastRun } from '../pi-cron-runtime.js';
import { readWindowBinding } from './bot-window-state.js';
import { readWindowRecord } from './bot-window-registry.js';
import { readBot } from './bot-settings.js';
import { botPreamble } from './bot-prompt.js';
import { SETUP_TOOL, SETUP_TITLE, SAVE, DECLINE, STEP_OF, normalizeProposal } from './bot-setup.js';
import { APPROVAL_TITLE, BLOCKED, PRESETS, approvalFor, approvalMessage, newToken } from './bot-guard.js';
import { createBotGrepExecutor } from './bot-guard-grep.js';
import { registerBotChangeReceipts } from './bot-change-receipts.js';
import { safeFile as readDocument } from '../profile-memory/management.js';
import { editNotebook } from './bot-notebook.ts';
import { registerBuddyNotebook, buddyNotebookContext, buddyNotebookRetirements, notebookRequest } from './bot-buddy-notebook-tool.ts';
import { registerRecall } from './bot-recall-tools.ts';
import { registerBotSchedule } from './bot-schedule-tool.ts';
import { registerBotTopic } from './bot-topic-tool.ts';
import { topicIndexRetirements } from './bot-topic-context.js';
import { structuredCompaction, summaryReasoning } from './bot-compaction.js';
import { pruneDrafts, idleDelay, idleCompactionWanted, rotationReason } from './bot-maintenance.js';
import { Type } from 'typebox';
import { resolveRuntimeModel } from './bot-model-runtime.js';

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
        if (!window || window.archivedAt || window.trashedAt || window.current?.sessionId !== context.sessionId) return null;
        return { binding, window, model: bot.model, soul: typeof profile.soul === 'string' ? profile.soul : '', profile, bot,
            text: botPreamble({ name: profile.name, bot, cwd: context.cwd, window }) };
    } catch { return null; }
}

// Resolve the current workspace defaults afresh, independent of the model saved in the native
// generation. The SDK resolver supplies its automatic choice when no default was configured.
export async function alignModel(pi: any, ctx: any, desired: any, notify: (value: any) => void, reported: Set<string>,
    thinking: string | null | undefined = desired?.thinking, agentDir?: string) {
    const resolved = await resolveRuntimeModel(ctx, desired, thinking, agentDir);
    if (!resolved) return 'unchanged';
    const { selection, model, level, unsupported } = resolved;
    const key = `${selection.provider}/${selection.id}`;
    const current = ctx.model;
    if (!model || !current || current.provider !== selection.provider || current.id !== selection.id) {
        let ok = false;
        try { ok = Boolean(model) && await pi.setModel(model); } catch { ok = false; }
        if (!ok) {
            if (!reported.has(key)) { reported.add(key); notify({ event: 'model', status: 'unavailable', provider: selection.provider, id: selection.id }); }
            return 'unavailable';
        }
    }
    reported.delete(key);
    if (unsupported) {
        const warning = `thinking:${key}:${thinking}`;
        if (!reported.has(warning)) {
            reported.add(warning);
            ctx.ui?.notify(`Bot 保存的思考等级 ${thinking} 不受 ${key} 支持，本次使用 ${level}；可用 /thinking 修改或 /thinking default 跟随默认。`, 'warning');
        }
    }
    if (pi.getThinkingLevel() !== level) pi.setThinkingLevel(level);
    return 'aligned';
}

// Full current permissions of this worker's Bot, for the approval gate. null only when this
// worker is not running the Bot window it was started for. The gate fails closed: once
// the session is the Bot's, anything that cannot be verified or read (after a short retry
// for a profile file being replaced) counts as "Ask every time".
export async function botPermissions(context: any, manager: any, cwd: string, agentDir: string, wait = (ms: number) => new Promise(done => setTimeout(done, ms))) {
    if (!context || manager.getSessionId() !== context.sessionId) return null;
    try {
        if (cwd !== context.cwd || manager.getCwd() !== context.cwd || fs.realpathSync.native(manager.getSessionFile()) !== context.sessionPath) return { preset: 'ask', rules: [] };
        const binding = readWindowBinding(manager);
        if (!binding || binding.profileId !== context.profileId || binding.windowId !== context.windowId) return { preset: 'ask', rules: [] };
    } catch { return { preset: 'ask', rules: [] }; }
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const profile = readRegistry(safeFile(agentDir, ['pivane-profiles', 'profiles.json'])).state.profiles
                .find((item: any) => item.id === context.profileId);
            const bot = profile?.enabled && profile.trashedAt === undefined ? readBot(profile) : null;
            const permissions = bot?.enabled ? bot.permissions : null;
            return PRESETS.includes(permissions?.preset) ? permissions : { preset: 'ask', rules: [] };
        } catch { if (attempt < 2) await wait(40 * (attempt + 1)); }
    }
    return { preset: 'ask', rules: [] };
}

// Compatibility for callers that only need the preset. The gate uses full permissions.
export async function botPreset(...args: Parameters<typeof botPermissions>) {
    return (await botPermissions(...args))?.preset ?? null;
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
    const avatar = profile?.avatar?.kind === 'emoji' ? profile.avatar.value
        : profile?.avatar?.kind === 'image' ? `(picture ${String(profile.avatar.version).slice(0, 8)})`
        : profile?.avatar?.kind === 'preset' ? { kind: 'preset', id: profile.avatar.id }
        : profile?.avatar?.kind === 'composed' ? { ...profile.avatar } : null;
    const bot = readBot(profile);
    return { name: profile?.name ?? null, avatar, job: bot?.job ?? null, personality: typeof profile?.soul === 'string' ? profile.soul : null,
        workStyle: bot?.permissions?.preset ?? null, phase: bot?.onboarding?.phase ?? null, steps: bot?.onboarding?.steps ?? {}, entries };
}

// The Bot proposes; the user decides on an editable card in the Bot page, where the server
// saves the confirmed values. The result reports only what is actually saved now.
function registerSetupTool(pi: ExtensionAPI, context: any, getAgentDir: () => string) {
    let pending = false;
    pi.registerTool({
        name: SETUP_TOOL, label: 'Propose Bot setup', exposure: 'model-only',
        description: 'Propose changes to your own name, face (a built-in preset), main job, personality or way of working, or short lasting facts about the user (how to address them, what matters to them). The user sees an editable card and decides; nothing is saved unless they confirm. Include only the fields you are proposing to change and leave the others out. Returns status, what was actually saved (the user can edit or untick fields) and your current identity.',
        promptSnippet: 'Propose changes to your own identity or notes about the user for the user to confirm',
        promptGuidelines: [
            'Use bot_setup_propose for your own name, built-in face preset, main job and personality, and for lasting facts about the user. Propose one coherent step at a time, in the user\'s language.',
            'Put in a card only what the user has just told you or agreed to in this step; leave every other field out (never send empty values or fill fields the user did not talk about). Once your name or face is set, propose it again only when the user asks to change it. The default built-in face is ready at creation; do not add an avatar or emoji-selection step to the interview.',
            'If the user is not sure yet what you should mainly help with or how you should talk, that is fine: say you will start in a general way and learn as you go, propose nothing for it, and carry on with what they need. Later, when their requests or feedback show a clear preference, you may propose an update of that one field.',
            'workStyle shows the user the three ways you can work (hands-off, careful, ask every time) and lets them pick; propose it once in its own interview step, or when the user asks you to ask first more or less often. Do not carry an unchanged workStyle into cards about other fields, or ask again after that step is done or skipped. A card can keep the current way or make you more careful; for more freedom the user changes it in your settings.',
            'Only status "saved" means something changed; then use the returned "current" identity, since the user may have edited or unticked fields. After "declined" or "no_answer", carry on without proposing the same thing again right away. "later" lists only steps newly recorded as skipped; "declined" alone does not mean a step was skipped.'
        ],
        parameters: Type.Object({
            name: Type.Optional(Type.String({ maxLength: 40, description: 'Your new name.' })),
            avatar: Type.Optional(Type.Union([
                Type.String({ maxLength: 16, description: 'One emoji for your face.' }),
                Type.Object({ kind: Type.Literal('preset'), id: Type.Union(avatarPresets.presets.map(preset => Type.Literal(preset.id))) },
                    { additionalProperties: false, description: `Built-in face: ${avatarPresets.presets.map(preset => `${preset.id} (${preset.name})`).join(', ')}.` })
            ])),
            job: Type.Optional(Type.String({ maxLength: 300, description: 'One sentence: what you mainly help this user with.' })),
            workStyle: Type.Optional(Type.Union([Type.Literal('free'), Type.Literal('balanced'), Type.Literal('ask')], { description: 'How you work: free (hands-off), balanced (careful) or ask (ask every time). The card shows all three and the user picks.' })),
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
                const after = identitySnapshot(context, getAgentDir());
                // Steps of this card the user left for later (recorded by the Bot page with the answer).
                const later = (Object.entries(STEP_OF) as [string, string][]).filter(([field, step]) => proposal[field] !== undefined
                    && after.steps[step] === 'skipped' && before.steps[step] !== 'skipped').map(([field]) => field);
                if (answer !== SAVE) return reply({ status: 'declined', ...(later.length ? { later } : {}) });
                const trim = (key: string, value: any) => key === 'personality' && value ? String(value).slice(0, 1500) : value;
                // What changed now, what the user kept as it was, and the identity as it now stands
                // (the user may have edited a field back to its current value or unticked it).
                const saved: any = {}, kept: string[] = [];
                for (const key of ['name', 'avatar', 'job', 'personality', 'workStyle'] as const) {
                    if (proposal[key] === undefined) continue;
                    // A way of working confirmed as it was is still the user's answer.
                    const confirmed = key === 'workStyle' && after.steps.work === 'done' && before.steps.work !== 'done';
                    if (!isDeepStrictEqual(after[key], before[key]) || confirmed) saved[key] = trim(key, after[key]); else kept.push(key);
                }
                const added = after.entries.filter((entry: string) => !before.entries.includes(entry));
                if (proposal.aboutUser && added.length) saved.aboutUser = added;
                if (proposal.finish && after.phase === 'done' && before.phase !== 'done') saved.finish = true;
                const status = Object.keys(saved).length ? 'saved' : 'not_saved';
                const current = { name: after.name, avatar: after.avatar, job: after.job, personality: trim('personality', after.personality),
                    workStyle: after.workStyle, interview: after.phase };
                return reply({ status, saved, ...(kept.length ? { kept } : {}), current,
                    ...(status === 'not_saved' ? { note: 'Nothing was changed; "current" is how things stand.' } : {}) });
            } finally { pending = false; }
        }
    } as any);
}

// The channel ingress calls this only after validating a fresh, idle start request.
let modelPreparer: ((ctx: any) => Promise<void>) | null = null;
export async function prepareBotModel(ctx: any) {
    await modelPreparer?.(ctx);
}

// Panel edits arrive through OhMyBuddy's internal command; only a verified Bot window worker accepts them.
let notebookEditor: ((ctx: any, input: any) => any) | null = null;
export function handleBotNotebook(ctx: any, input: any) {
    if (!notebookEditor) throw new Error('This chat has no notebook');
    return notebookEditor(ctx, input);
}

export function registerBotContext(pi: ExtensionAPI, getAgentDir: () => string) {
    const context = parseBotContext(process.env.PIVANE_BOT_CONTEXT);
    if (!context) return;
    const managed = (ctx: any) => ctx.mode === 'rpc' && Boolean(process.env.PI_WEB_NAVIGATION_TOKEN);
    registerBotChangeReceipts(pi, (ctx: any) => {
        const agentDir = getAgentDir();
        return managed(ctx) && botSection(context, ctx.sessionManager, ctx.cwd, agentDir) ? { agentDir, profileId: context.profileId } : null;
    });
    const reported = new Set<string>();
    // Private bridge record: the Supervisor consumes it and never shows it as a notification.
    const notifier = (ctx: any) => (value: any) => ctx.ui.notify(JSON.stringify({ pivaneBot: value, sessionId: ctx.sessionManager.getSessionId() }));
    modelPreparer = async (ctx: any) => {
        if (!managed(ctx)) return;
        const loaded = botSection(context, ctx.sessionManager, ctx.cwd, getAgentDir());
        if (!loaded) throw new Error('Bot window is no longer current');
        if (scheduledRunActive(ctx.sessionManager)) return;
        await alignModel(pi, ctx, loaded.model, notifier(ctx), reported, loaded.bot.thinking, getAgentDir());
        if (!botSection(context, ctx.sessionManager, ctx.cwd, getAgentDir())) throw new Error('Bot window changed before channel start');
    };
    let toolRegistered = false;
    let grepRegistered = false;
    let schedule: ReturnType<typeof registerBotSchedule> | undefined;
    let notebook: ReturnType<typeof registerBuddyNotebook> | undefined;
    pi.on('session_start', async (_event, ctx: any) => {
        if (!managed(ctx)) return;
        const loaded = botSection(context, ctx.sessionManager, ctx.cwd, getAgentDir());
        if (loaded && !toolRegistered) {
            toolRegistered = true;
            registerSetupTool(pi, context, getAgentDir);
            const verified = (toolCtx: any) => Boolean(botSection(context, toolCtx.sessionManager, toolCtx.cwd, getAgentDir()));
            const grep = createGrepToolDefinition(context.cwd);
            pi.registerTool({ ...grep,
                description: `${grep.description} In Bot conversations, searches only descriptor-verified UTF-8 text files; protected files and aliases are excluded. Bounded searches report incomplete results; context is limited to 20 lines and limit to 1000.`,
                execute: createBotGrepExecutor(verified, getAgentDir, (toolCtx: any) => botPreset(context, toolCtx.sessionManager, toolCtx.cwd, getAgentDir())) });
            grepRegistered = true;
            schedule = registerBotSchedule(pi, verified, scheduledRunActive);
            registerBotTopic(pi, verified, scheduledRunActive);
            notebook = registerBuddyNotebook(pi, verified);
            registerRecall(pi, context, getAgentDir, verified);
        }
        const notify = notifier(ctx);
        notify(loaded ? { event: 'loaded', profileId: context.profileId, windowId: context.windowId, generation: loaded.binding.generation }
            : { event: 'loaded', profileId: null });
        // Align at open so the page shows the Bot's model before the first message.
        if (loaded && !scheduledRunActive(ctx.sessionManager)) await alignModel(pi, ctx, loaded.model, notify, reported, loaded.bot.thinking, getAgentDir());
    });
    // Tool-layer policy checks private paths before asking; saved exact grants are re-read
    // on every call. Unattended runs cannot approve a step that still needs confirmation.
    // A nested call (codemode) is cancelled with its parent tool, so its request is too.
    const nested = new Map<string, Set<AbortController>>();
    pi.on('tool_execution_end', (event: any) => {
        schedule?.discard(event?.toolCallId);
        const waiting = nested.get(event?.toolCallId);
        if (!waiting) return;
        nested.delete(event.toolCallId);
        for (const controller of waiting) controller.abort();
    });
    pi.on('tool_call', async (event: any, ctx: any) => {
        if (!managed(ctx) || event.toolName === 'bot_topic_propose') return; // This tool always asks in its own execute, in every preset.
        // Tracked from the start: the parent can end while the preset is still being read.
        const controller = new AbortController(), parent = event.parentToolCallId;
        if (parent) { if (!nested.has(parent)) nested.set(parent, new Set()); nested.get(parent)!.add(controller); }
        let keepSchedule = false;
        try {
            const agentDir = getAgentDir();
            const permissions = await botPermissions(context, ctx.sessionManager, ctx.cwd, agentDir);
            if (!permissions) return;
            if (event.toolName === 'grep' && !grepRegistered)
                return { block: true, reason: 'Managed Bot grep is unavailable until this Bot window is verified. No directory search ran.' };
            const preset = permissions.preset;
            let annotations;
            try { annotations = pi.getAllTools().find((tool: any) => tool.name === event.toolName)?.annotations; } catch { annotations = undefined; }
            const signal = ctx.signal ? AbortSignal.any([controller.signal, ctx.signal]) : controller.signal;
            const scheduled = event.toolName === 'bot_schedule' ? await schedule?.prepareApproval(event, ctx, preset, signal) : undefined;
            const approval = approvalFor({ permissions, toolName: event.toolName, input: scheduled?.input ?? event.input, cwd: context.cwd, agentDir, annotations });
            if (approval?.block) return { block: true, reason: approval.reason };
            if (scheduled?.skipApproval || !approval) { keepSchedule = true; return; }
            if (!ctx.hasUI || scheduledRunActive(ctx.sessionManager)) return { block: true, reason: BLOCKED.unattended };
            // Already cancelled with its parent: nothing to ask about.
            if (signal.aborted) return { block: true, reason: BLOCKED.not_approved };
            const token = newToken();
            let allowed = false;
            // However it ends, the request is over: the Supervisor drops it if still pending.
            try { allowed = (await ctx.ui.confirm(APPROVAL_TITLE, approvalMessage({ ...approval, token }), { signal, timeout: 30 * 60 * 1000 })) === true; }
            finally { notifier(ctx)({ event: 'approval-done', token }); }
            keepSchedule = allowed && !signal.aborted;
            return keepSchedule ? undefined : { block: true, reason: BLOCKED.not_approved };
        } finally {
            if (!keepSchedule) schedule?.discard(event.toolCallId);
            if (parent) { nested.get(parent)?.delete(controller); if (!nested.get(parent)?.size) nested.delete(parent); }
        }
    });
    // S4 due (D-030/D-033): the server moves the window on after the next compaction.
    const rotationDue = (manager: any) => {
        try {
            const file = manager.getSessionFile();
            const bytes = file ? fs.statSync(file).size : 0;
            return rotationReason({ bytes, entries: bytes >= 1024 * 1024 ? manager.getEntries().length : 0,
                startedAt: manager.getHeader?.()?.timestamp, now: Date.now() });
        } catch { return null; }
    };
    // How much Pi keeps verbatim at a compaction (its keepRecentTokens, with model overrides), for
    // the S2 guard: exactly what the latest compaction of this model was prepared with, else the
    // user's global setting (a Bot workspace has no project settings of its own).
    let preparedKeep: { model: string, tokens: number } | null = null;
    const modelKey = (model: any) => model ? `${model.provider}/${model.id}` : '';
    const keepRecentTokens = (ctx: any) => {
        if (preparedKeep && preparedKeep.model === modelKey(ctx.model)) return preparedKeep.tokens;
        try { return SettingsManager.create(ctx.cwd, getAgentDir(), { projectTrusted: false }).getCompactionKeepRecentTokens(ctx.model); }
        catch { return undefined; }
    };
    // Every compaction of a Bot window (idle, threshold, overflow) gets the structured summary with
    // notebook reconciliation (D-029); when the window is about to move on, the part Pi keeps
    // verbatim is reconciled too. Any failure falls back to Pi's own summary; the notebook is
    // then shown to the model again before the next run (notebookNotice).
    pi.on('session_before_compact', async (event: any, ctx: any) => {
        if (!managed(ctx) || !botSection(context, ctx.sessionManager, ctx.cwd, getAgentDir())) return;
        const model = ctx.model;
        if (!model) return;
        const keep = event.preparation?.settings?.keepRecentTokens;
        if (Number.isSafeInteger(keep) && keep >= 0) preparedKeep = { model: modelKey(model), tokens: keep };
        try {
            const shared = await notebookRequest('snapshot', {}, event.signal);
            const result = await structuredCompaction({
                sharedNotebook: shared.state, subject: botSection(context, ctx.sessionManager, ctx.cwd, getAgentDir())?.window.title || '',
                branch: event.branchEntries, projection: ctx.sessionManager.buildSessionProjection().entries,
                firstKeptEntryId: event.preparation.firstKeptEntryId, previousSummary: event.preparation.previousSummary,
                sessionId: ctx.sessionManager.getSessionId(), model, now: new Date().toISOString(), reason: event.reason, signal: event.signal,
                includeKept: Boolean(rotationDue(ctx.sessionManager)),
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
            if (result.notebookOps?.length) {
                await notebookRequest('edit', { expectedVersion: shared.version, reconcile: true,
                    toolCallId: `summary:${ctx.sessionManager.getLeafId()}`,
                    ops: result.notebookOps.map((op: any) => ({ ...op, ...(op.op === 'add' ? { subject: op.subject ?? botSection(context, ctx.sessionManager, ctx.cwd, getAgentDir())?.window.title ?? '' } : {}) })) }, event.signal);
            }
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
    pi.on('context', (event: any, ctx: any) => {
        const loaded = managed(ctx) ? botSection(context, ctx.sessionManager, ctx.cwd, getAgentDir()) : null;
        if (!loaded) return;
        return { messages: buddyNotebookContext(event.messages, ctx.sessionManager.getBranch()) };
    });
    notebookEditor = (ctx: any, input: any) => {
        if (!isBot(ctx)) throw new Error('This chat has no notebook');
        return editNotebook(pi, ctx, input);
    };
    // S1 (D-030): at the end of a completed run, old large tool outputs become short stubs when
    // that saves a lot. Earlier drafts of other extensions are kept as they are.
    pi.on('agent_before_settle', (event: any, ctx: any) => {
        if (!isBot(ctx)) return;
        const projection = event.context?.contextEntries || [];
        const drafts = [...buddyNotebookRetirements(projection), ...topicIndexRetirements(projection),
            ...(event.outcome === 'completed' ? pruneDrafts(projection, ctx.getContextUsage(), {
                branch: ctx.sessionManager.getBranch(), sessionId: ctx.sessionManager.getSessionId()
            }) : [])];
        return drafts.length ? { entries: [...(event.entries || []), ...drafts] } : undefined;
    });
    // S2 (D-030): once the prompt cache has gone cold, a still idle and fairly full window is
    // summarized in the background, so the user does not wait for it in their next message.
    // A generation that is due to move on (S4) is summarized too: the server rotates after a
    // compaction, so the next generation starts from a fresh summary.
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
                if (!rotating && !idleCompactionWanted(ctx.getContextUsage(), ctx.sessionManager.buildSessionProjection().entries, keepRecentTokens(ctx))) return;
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
        if (!scheduledRunActive(ctx.sessionManager)) await alignModel(pi, ctx, loaded.model, notifier(ctx), reported, loaded.bot.thinking, getAgentDir());
        setPromptSection(event, BOT_SECTION, loaded.text, { wrapForced: true });
        // The profile runtime keeps the personality loaded at worker start; a Bot's personality
        // can change mid-conversation (onboarding, settings), so the current one replaces it.
        // A forced prompt is opaque: appending a second personality there would contradict the first.
        if (event.systemPromptOptions.forceSystemPrompt === undefined) {
            if (loaded.soul.trim()) event.systemPromptOptions.sections.assistant_profile_soul = loaded.soul;
            else delete event.systemPromptOptions.sections.assistant_profile_soul;
        }
        // Each chat gets a bounded, fresh view of its Buddy's authoritative notebook.
        const notice = await notebook?.notice(ctx.sessionManager, loaded.window.title || '', ctx.signal);
        if (notice) return { message: notice };
    });
}
