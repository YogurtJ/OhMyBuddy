const { setPromptSection } = require('./pi-hook-prompt');
const { Type } = require('typebox');
const { localParts, dayKey } = require('./pi-cron-schedule');
const policy = require('./pi-cron-policy');
const { createHash } = require('node:crypto');
const safeError = require('./pi-update-output').outputRedactor(process.env);
const STATE = 'pivane-cron-run';
const MESSAGE = 'pivane-cron-message';
function lastRun(manager, id) {
    return manager.getEntries().findLast(entry => entry.type === 'custom' && entry.customType === STATE
        && entry.data?.sessionId === manager.getSessionId() && (!id || entry.data.runId === id))?.data || null;
}
function usageSince(manager, state) {
    const entries = manager.getEntries(), start = entries.findIndex(entry => entry.type === 'custom' && entry.customType === STATE
        && entry.data?.runId === state.runId && entry.data.status === 'prepared');
    const after = entries.slice(start + 1);
    const rows = after.filter(entry => entry.type === 'message' && entry.message?.role === 'assistant');
    const charged = after.filter(entry => entry.type === 'compaction' || entry.type === 'branch_summary'
        || entry.type === 'message' && (entry.message?.role === 'assistant' || entry.message?.usage));
    const usage = { tokens: 0, cost: 0, calls: state.requests ?? rows.filter(row => row.message?.stopReason !== 'aborted').length,
        input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let known = true;
    for (const row of charged) {
        const u = row.message?.usage || row.usage;
        if (!u) { known = false; continue; }
        for (const key of ['input', 'output', 'cacheRead', 'cacheWrite']) usage[key] += Number(u[key]) || 0;
        usage.tokens += ['input', 'output', 'cacheRead', 'cacheWrite'].reduce((n, key) => n + (Number(u[key]) || 0), 0);
        if (typeof u.cost?.total === 'number' && Number.isFinite(u.cost.total) && u.cost.total >= 0) usage.cost += u.cost.total; else known = false;
    }
    if (!known || !rows.length) usage.cost = null;
    if (usage.calls > 0 && usage.tokens === 0) { usage.tokens = null; usage.cost = null; }
    const last = rows.at(-1);
    return { usage, replyEntryId: last?.id || null, stopReason: last?.message.stopReason,
        ...(last?.message.stopReason === 'error' ? { reason: 'model-error', errorDetail: safeError(last.message.errorMessage || '').slice(0, 500) } : {}) };
}
function registerCron(pi) {
    let active = null, timer = null, idleTimer = null, silentToolRegistered = false;
    let lastActivity = Date.now(), lastErrorKey = '', repeatedErrors = 0;
    const runningTools = new Set();
    const touch = () => { lastActivity = Date.now(); };
    const clearTimers = () => { clearTimeout(timer); clearInterval(idleTimer); timer = idleTimer = null; runningTools.clear(); };
    const report = ctx => ctx.ui.notify(JSON.stringify({ pivaneCron: { sessionId: ctx.sessionManager.getSessionId(),
        runId: active?.runId, active: Boolean(active && !['completed', 'silent', 'skipped', 'error', 'stopped'].includes(active.status)),
        status: active?.status, silent: active?.silent === true } }));
    const persist = (ctx, changes) => {
        active = { ...active, ...changes };
        pi.appendEntry(STATE, { ...active, sessionId: ctx.sessionManager.getSessionId() });
        report(ctx);
    };
    pi.on('session_start', (_event, ctx) => {
        if (ctx.mode !== 'rpc' || !ctx.sessionManager.getSessionFile() || !process.env.PI_WEB_NAVIGATION_TOKEN) return;
        const state = lastRun(ctx.sessionManager);
        active = state && !['completed', 'silent', 'skipped', 'error', 'stopped'].includes(state.status) ? state : null;
        report(ctx);
        pi.registerTool({ name: 'cron_silent', label: 'Finish scheduled task silently', defaultActive: false,
            description: 'During a scheduled task only: finish without a greeting or notification when there is nothing useful to send. Do not output a final reply afterward.',
            parameters: Type.Object({ reason: Type.String({ maxLength: 200 }) }),
            execute: async (_id, params, _signal, _update, context) => {
                if (!active || active.status !== 'running') throw new Error('No scheduled task is active');
                persist(context, { silent: true, reason: params.reason });
                return { content: [{ type: 'text', text: 'Scheduled task finished silently.' }], details: { silent: true }, terminate: true };
            } });
        silentToolRegistered = true;
    });
    pi.on('before_agent_start', (event) => {
        if (!active || active.status !== 'running') {
            // A restored scheduled checkpoint can explicitly include cron_silent.
            // Wait until session_start handlers have registered all pending native tools
            // before narrowing the ordinary turn's loadout; never rebuild it from all tools.
            if (silentToolRegistered) {
                const tools = pi.getActiveTools();
                if (tools.includes('cron_silent')) pi.setActiveTools(tools.filter(name => name !== 'cron_silent'));
                // Pi 1.5 lets an explicit prompt loadout win over the live tools.
                // Compose with later extension edits without restoring this private tool.
                if (Array.isArray(event?.systemPromptOptions?.selectedTools))
                    event.systemPromptOptions.selectedTools = event.systemPromptOptions.selectedTools.filter(name => name !== 'cron_silent');
            }
            return;
        }
        if (active.origin === 'bot') {
            setPromptSection(event, 'pivane_scheduled_task', 'This turn is a follow-up you started yourself, not a request from the user. '
                + 'Send at most one short, natural message in your usual voice, or use cron_silent and finish when there is nothing useful to say. '
                + 'Do not start other work, create tasks, delegate or message other threads.');
            return;
        }
        setPromptSection(event, 'pivane_scheduled_task', 'This turn is a user-configured scheduled task. Perform only its saved instructions within existing permissions. '
            + 'Its scheduled timestamp is context, not the current clock. Do not create other tasks, delegate, send messages to other threads, or generate media. '
            + 'If no message is appropriate, use cron_silent and finish. Do not send acknowledgements for a silent run.');
    });
    pi.on('tool_call', event => {
        if (!active || active.status !== 'running') return;
        if (active.mode === 'text' && event.toolName !== 'cron_silent'
            || /^(agent_thread|agent_message|subagent|agent_message|media_|image_generate|video_generate)/.test(event.toolName))
            return { block: true, reason: 'This scheduled run does not allow delegation, cross-thread messaging or media execution.' };
    });
    pi.on('cache_warming_decision', () => active ? { action: 'stop' } : undefined);
    const stop = (ctx, reason) => {
        if (!active || active.status !== 'running' || active.reason) return;
        persist(ctx, { reason }); ctx.abort();
    };
    pi.on('message_update', touch);
    pi.on('tool_execution_start', event => { if (active?.status === 'running') { runningTools.add(event.toolCallId); touch(); } });
    pi.on('tool_execution_update', touch);
    pi.on('tool_execution_end', event => { runningTools.delete(event.toolCallId); touch(); });
    pi.on('tool_result', (event, ctx) => {
        if (active?.status !== 'running' || event.parentToolCallId) return;
        touch();
        if (!event.isError) { lastErrorKey = ''; repeatedErrors = 0; return; }
        const key = createHash('sha256').update(JSON.stringify([event.toolName, event.input, event.content])).digest('hex');
        repeatedErrors = key === lastErrorKey ? repeatedErrors + 1 : 1; lastErrorKey = key;
        if (active.maxRepeatedErrors != null && repeatedErrors >= active.maxRepeatedErrors) stop(ctx, 'repeated-errors');
    });
    pi.on('before_provider_request', (_event, ctx) => {
        if (!active || active.status !== 'running') return;
        const reason = policy.stopReason(active, usageSince(ctx.sessionManager, active).usage);
        if (reason) { stop(ctx, reason); return; }
        touch(); persist(ctx, { requests: (active.requests || 0) + 1 });
    });
    pi.on('turn_start', (_event, ctx) => {
        if (!active || active.status !== 'running') return;
        const reason = policy.stopReason(active, usageSince(ctx.sessionManager, active).usage);
        if (reason) stop(ctx, reason);
    });
    pi.on('agent_before_settle', (event, ctx) => {
        if (active?.status === 'running') persist(ctx, { outcome: event.outcome });
    });
    pi.on('agent_settled', (_event, ctx) => {
        clearTimers();
        if (!active || active.status !== 'running') return;
        const result = usageSince(ctx.sessionManager, active);
        persist(ctx, { status: 'settled', ...result, settledAt: Date.now() });
    });
    pi.on('session_shutdown', clearTimers);
    async function restore(ctx, state) {
        if (state.originalModel) {
            const model = ctx.modelRegistry.find(state.originalModel.provider, state.originalModel.id);
            if (!model || !await pi.setModel(model)) throw new Error('Original model could not be restored');
        }
        if (state.originalThinking) pi.setThinkingLevel(state.originalThinking);
        if (state.originalTools) pi.setActiveTools(state.originalTools);
    }
    return async (ctx, input) => {
        if (!ctx.isIdle() || ctx.hasPendingMessages()) throw new Error('Scheduled target is busy');
        if (input.action === 'status' || input.action === 'finish') {
            const state = lastRun(ctx.sessionManager, input.runId);
            if (!state || input.action === 'status') return state;
            if (state.status === 'settled') {
                await restore(ctx, state);
                active = state;
                const status = state.silent ? 'silent' : state.reason && state.reason !== 'model-error' || state.outcome === 'aborted' ? 'stopped'
                    : state.stopReason === 'stop' ? 'completed' : state.stopReason === 'aborted' ? 'stopped' : 'error';
                const reason = state.reason || (status === 'error' ? 'model-error' : status === 'stopped' ? 'user-stopped' : undefined);
                const feedback = ['stopped', 'error'].includes(status) ? { ...policy.diagnostic(reason, { usage: state.usage,
                    limits: { maxCalls: state.maxCalls, maxTokens: state.maxTokens, maxCost: state.maxCost,
                        maxDurationSeconds: state.maxDurationSeconds, maxIdleSeconds: state.maxIdleSeconds } }),
                    ...(state.errorDetail ? { detail: state.errorDetail } : {}) } : null;
                persist(ctx, { status, reason, ...(feedback ? { feedback } : {}), completedAt: Date.now() });
                const result = active; active = null;
                if (feedback && state.origin !== 'bot') pi.sendMessage({ customType: 'pivane-cron-result',
                    content: policy.feedbackText(state.name, status, feedback), display: true,
                    details: { runId: state.runId, jobId: state.jobId, name: state.name, status, feedback } }, { triggerTurn: false });
                return result;
            }
            return state;
        }
        if (input.action === 'acknowledge') {
            const state = lastRun(ctx.sessionManager, input.runId);
            if (!state) return null;
            await restore(ctx, state);
            active = state; persist(ctx, { status: 'stopped', reason: 'reviewed-uncertain', completedAt: Date.now() });
            const result = active; active = null; return result;
        }
        if (input.action !== 'start' || !/^[a-f0-9]{64}$/.test(input.runId) || input.sessionId !== ctx.sessionManager.getSessionId()
            || typeof input.prompt !== 'string' || input.prompt.length > 40000) throw new Error('Invalid scheduled task');
        const previous = lastRun(ctx.sessionManager, input.runId);
        if (previous) return previous;
        const unfinished = lastRun(ctx.sessionManager);
        if (unfinished && !['completed', 'silent', 'skipped', 'error', 'stopped'].includes(unfinished.status)) throw new Error('A previous scheduled run needs review');
        if (input.condition?.kind === 'no-user-since') {
            const today = dayKey(Date.now(), input.timeZone), [hour, minute] = input.condition.time.split(':').map(Number);
            const appeared = ctx.sessionManager.getBranch().some(entry => {
                if (entry.type !== 'message' || entry.message?.role !== 'user') return false;
                const timestamp = Date.parse(entry.timestamp);
                const p = localParts(timestamp, input.timeZone);
                return dayKey(timestamp, input.timeZone) === today && p.hour * 60 + p.minute >= hour * 60 + minute;
            });
            if (appeared) {
                const skipped = { version: 1, runId: input.runId, sessionId: input.sessionId, status: 'skipped', reason: 'user-active', completedAt: Date.now(), usage: { tokens: 0, cost: 0, calls: 0 } };
                pi.appendEntry(STATE, skipped); return skipped;
            }
        }
        let model = ctx.model;
        if (input.model) {
            model = ctx.modelRegistry.find(input.model.provider, input.model.modelId);
            if (!model) throw new Error('Scheduled model is unavailable');
            const { getSupportedThinkingLevels } = await import('@earendil-works/pi-ai');
            if (!getSupportedThinkingLevels(model).includes(input.model.thinkingLevel)) throw new Error('Unsupported thinking level');
        }
        if (!model) throw new Error('Configure a model for the target thread');
        const origin = input.origin === 'bot' ? 'bot' : undefined;
        if (origin && input.mode !== 'text') throw new Error('Invalid scheduled task');
        active = { version: 1, runId: input.runId, sessionId: input.sessionId, status: 'prepared', mode: input.mode, ...(origin ? { origin } : {}),
            name: input.name, jobId: input.jobId, policyVersion: input.policyVersion || 1,
            maxCalls: input.maxCalls, maxTokens: input.maxTokens, maxCost: input.maxCost ?? null,
            maxDurationSeconds: input.maxDurationSeconds, maxIdleSeconds: input.maxIdleSeconds ?? null,
            maxRepeatedErrors: input.maxRepeatedErrors ?? null, deadline: Date.now() + input.maxDurationSeconds * 1000,
            originalModel: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : null,
            originalThinking: pi.getThinkingLevel(), originalTools: pi.getActiveTools(),
            model: { provider: model.provider, modelId: model.id }, startedAt: Date.now() };
        persist(ctx, {});
        if (input.model) {
            if (!await pi.setModel(model)) throw new Error('Scheduled model is unavailable');
            pi.setThinkingLevel(input.model.thinkingLevel);
        }
        pi.setActiveTools(input.mode === 'text' ? ['cron_silent'] : [...active.originalTools, 'cron_silent']);
        if (input.profile) {
            const { getAgentDir } = await import('@earendil-works/pi-coding-agent');
            const root = getAgentDir();
            const runtime = require('./pi-profile-runtime').readProfileRuntime(ctx.sessionManager, ctx.cwd, root,
                require('node:path').join(require('node:fs').realpathSync.native(root), 'sessions'));
            if (!runtime || runtime.context.profileId !== input.profile.id || runtime.revision !== input.profile.revision)
                throw new Error('Saved profile changed before scheduled execution');
        }
        persist(ctx, { status: 'running', thinkingLevel: pi.getThinkingLevel() });
        const header = origin ? `[Your own follow-up: ${input.name}; scheduled ${new Date(input.scheduledAt).toISOString()}; timezone ${input.timeZone}.]`
            : `[User-configured scheduled task: ${input.name}; scheduled ${new Date(input.scheduledAt).toISOString()}; timezone ${input.timeZone}. Execute within the saved task scope.]`;
        // A Bot's own follow-up shows the user only its short title (note), never the model-facing instructions.
        const note = origin && typeof input.note === 'string' ? input.note.slice(0, 200) : null;
        pi.sendMessage({ customType: MESSAGE, content: `${header}\n\n${input.prompt}`, display: true,
            details: { runId: input.runId, jobId: input.jobId, name: input.name, scheduledAt: input.scheduledAt, bodyOffset: header.length + 2,
                ...(origin ? { origin, note } : {}) } }, { triggerTurn: true });
        touch(); lastErrorKey = ''; repeatedErrors = 0;
        timer = setTimeout(() => stop(ctx, 'time-limit'), input.maxDurationSeconds * 1000);
        timer.unref?.();
        if (active.maxIdleSeconds != null) {
            idleTimer = setInterval(() => {
                if (!runningTools.size && Date.now() - lastActivity >= active?.maxIdleSeconds * 1000) stop(ctx, 'idle-limit');
            }, 1000);
            idleTimer.unref?.();
        }
        return active;
    };
}
module.exports = { registerCron, lastRun, STATE, MESSAGE, usageSince };
