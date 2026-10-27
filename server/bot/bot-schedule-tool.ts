import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { normalizeScheduleInput } from './bot-schedule.js';

async function request(action: string, input: any, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const origin = process.env.PI_WORKSPACE_INTERNAL_ORIGIN;
    if (!origin) throw new Error('Bot schedule service is unavailable');
    const url = new URL(`/api/pi/bot-schedule/${action}`, origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid schedule service origin');
    let response;
    try {
        response = await fetch(url, { method: 'POST', redirect: 'error', signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.PI_WEB_NAVIGATION_TOKEN}` }, body: JSON.stringify(input) });
    } catch { throw new Error('Schedule response unavailable. List tasks to check the result; retry creation only with this same tool call.'); }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Schedule HTTP ${response.status}`);
    return result;
}

export function registerBotSchedule(pi: ExtensionAPI, verified: (ctx: any) => boolean, scheduledRunActive: (manager: any) => boolean) {
    const prepared = new Map<string, { input: any, expectedRevision?: number }>();
    const discard = (id: string) => prepared.delete(id);
    pi.registerTool({
        name: 'bot_schedule', label: 'Scheduled task',
        description: 'Create, list or cancel this Bot’s scheduled tasks. Results go to the chat that asks, following its later generations. Create needs title, message and exactly one of once (YYYY-MM-DD HH:mm local wall time) or repeat (five-field cron). timeZone is an IANA zone, defaulting to the server zone. needsTools defaults to false (write a message); true allows work with tools. List includes local now, tasks and your own pending follow-ups; use it to check dates. Cancel uses the listed task or follow-up id. Creation is unavailable during a scheduled run. Say a task is set only after success, with the resolved local time. User-requested tasks run at their requested time, including quiet hours. proactive: true makes it your own check-in instead of a task the user asked for: once only, no tools, delivered in this chat; the user\'s quiet hours and daily limit decide whether it also notifies them, and they can turn these off.',
        parameters: Type.Object({
            action: Type.Union([Type.Literal('create'), Type.Literal('list'), Type.Literal('cancel')]),
            title: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
            message: Type.Optional(Type.String({ minLength: 1, maxLength: 40000 })),
            once: Type.Optional(Type.String({ description: 'YYYY-MM-DD HH:mm in timeZone; future local time.' })),
            repeat: Type.Optional(Type.String({ maxLength: 150, description: 'Five-field cron: minute hour day month weekday.' })),
            timeZone: Type.Optional(Type.String({ maxLength: 100 })),
            needsTools: Type.Optional(Type.Boolean()),
            proactive: Type.Optional(Type.Boolean({ description: 'true: your own check-in (once, a message only), not a user-requested task.' })),
            id: Type.Optional(Type.String({ description: 'Task id from list, for cancellation.' }))
        }),
        prepareArguments: normalizeScheduleInput,
        execute: async (id: string, params: any, signal: AbortSignal | undefined, _update: any, ctx: any) => {
            try {
                if (!verified(ctx)) throw new Error('Scheduling is unavailable in this conversation');
                const cached = prepared.get(id);
                const { action, ...input } = cached?.input ?? normalizeScheduleInput(params);
                if (action === 'create' && scheduledRunActive(ctx.sessionManager)) throw new Error('Cannot create scheduled tasks during an unattended scheduled run');
                const result = await request(action, { ...input, ...(action === 'create' ? { toolCallId: id } : {}),
                    ...(cached?.expectedRevision !== undefined ? { expectedRevision: cached.expectedRevision } : {}) }, signal);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], details: { pivaneBotSchedule: result } };
            } finally { discard(id); }
        }
    } as any);
    return {
        discard,
        async prepareApproval(event: any, ctx: any, preset: string, signal: AbortSignal) {
            if (!verified(ctx)) throw new Error('Scheduling is unavailable in this conversation');
            const input = normalizeScheduleInput(event.input);
            prepared.set(event.toolCallId, { input });
            if (input.action !== 'cancel' || preset === 'free' || !ctx.hasUI || scheduledRunActive(ctx.sessionManager)) return { input };
            const result = await request('list', {}, signal);
            if (/^[a-f0-9]{24}$/.test(input.id)) {
                // The Bot's own check-in is cancelled the way it was set, without asking; a reminder of a
                // noted commitment asks like a task. Unknown ids are refused by the route (404).
                const followUp = (result.followUps || []).find((item: any) => item.id === input.id);
                if (!followUp || followUp.kind === 'checkin') return { input, skipApproval: true };
                return { input: { ...input, approvalFollowUp: followUp } };
            }
            const job = result.jobs.find((item: any) => item.id === input.id);
            if (!job) return { input, skipApproval: true };
            prepared.set(event.toolCallId, { input, expectedRevision: job.revision });
            return { input: { ...input, approvalJob: job } };
        }
    };
}
