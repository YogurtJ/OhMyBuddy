import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { createHash } from 'node:crypto';
import { topicFields } from './bot-topic.js';
import { APPROVAL_TITLE, BLOCKED, approvalMessage, newToken } from './bot-guard.js';
import { renderOpenItems } from './bot-topic-index.js';
import { TOPIC_INDEX_MESSAGE, topicIndexUnchanged } from './bot-topic-context.js';

async function request(action: string, input: any, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const origin = process.env.PI_WORKSPACE_INTERNAL_ORIGIN;
    if (!origin) throw new Error('Bot topic service is unavailable');
    const url = new URL(`/api/pi/bot-topics/${action}`, origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid topic service origin');
    let response;
    try {
        response = await fetch(url, { method: 'POST', redirect: 'error', signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.PI_WEB_NAVIGATION_TOKEN}` }, body: JSON.stringify(input) });
    } catch { throw new Error('Topic response unavailable. Check the topic list; retry only with this same tool call.'); }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Topic HTTP ${response.status}`);
    return result;
}

export function registerBotTopic(pi: ExtensionAPI, verified: (ctx: any) => boolean, unattended: (manager: any) => boolean) {
    let pending = false;
    pi.registerTool({
        name: 'bot_topic_propose', label: 'Propose topic', executionMode: 'sequential',
        description: 'Propose a separate topic chat for substantial focused work. The user must approve its title and optional focus/emoji. Creates a fresh chat with an independent notebook and this Bot’s shared profile memory. Copies no conversation. Does not switch the user’s chat. Unavailable during unattended runs. Say it was created only after success.',
        promptSnippet: 'Propose a focused topic chat for the user to confirm',
        parameters: Type.Object({ title: Type.String({ minLength: 1, maxLength: 80 }),
            focus: Type.Optional(Type.String({ maxLength: 500 })), emoji: Type.Optional(Type.String({ maxLength: 16 })) }, { additionalProperties: false }),
        execute: async (id: string, raw: any, signal: AbortSignal | undefined, _update: any, ctx: any) => {
            if (!verified(ctx)) throw new Error('Topics are unavailable in this conversation');
            const input = topicFields(raw);
            const reply = (text: string) => ({ content: [{ type: 'text' as const, text }], details: {} });
            if (!ctx.hasUI || unattended(ctx.sessionManager)) return reply(BLOCKED.unattended);
            if (pending) throw new Error('Another topic proposal is waiting for the user');
            pending = true;
            const token = newToken();
            const activeSignal = ctx.signal ? (signal ? AbortSignal.any([ctx.signal, signal]) : ctx.signal) : signal;
            try {
                activeSignal?.throwIfAborted();
                const allowed = await ctx.ui.confirm(APPROVAL_TITLE,
                    approvalMessage({ kind: 'topic', token, detail: `${input.emoji ? input.emoji + ' ' : ''}${input.title}${input.focus ? '\n' + input.focus : ''}` }),
                    { signal: activeSignal, timeout: 30 * 60 * 1000 });
                if (allowed !== true || activeSignal?.aborted) return reply(BLOCKED.not_approved);
                if (!verified(ctx) || unattended(ctx.sessionManager)) throw new Error('This conversation changed while the topic was awaiting approval');
                const result = await request('create', { ...input, toolCallId: id }, activeSignal);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], details: { pivaneBotTopic: result } };
            } finally {
                pending = false;
                ctx.ui.notify(JSON.stringify({ pivaneBot: { event: 'approval-done', token }, sessionId: ctx.sessionManager.getSessionId() }));
            }
        }
    } as any);
}

export async function topicIndexNotice(manager: any, signal?: AbortSignal) {
    let index = null;
    try { index = await request('open-items', {}, signal ? AbortSignal.any([signal, AbortSignal.timeout(1500)]) : AbortSignal.timeout(1500)); }
    catch { /* A failed read is unknown, never an empty notebook. */ }
    const notice = { customType: TOPIC_INDEX_MESSAGE, display: false, content: renderOpenItems(index),
        details: { v: 1, fingerprint: createHash('sha256').update(JSON.stringify(index)).digest('hex') } };
    return topicIndexUnchanged(manager.buildSessionProjection().entries, notice) ? null : notice;
}
