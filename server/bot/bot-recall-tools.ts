// Read-only recall of this Buddy's source chats. No worker is started for another chat.
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { SessionManager, parseSessionEntries } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import path from 'node:path';
import { windowGenerations, recall, readAround, readVerified, LIMITS } from './bot-recall.js';
import { readWindowRecord } from './bot-window-registry.js';
import { readWindowBinding } from './bot-window-state.js';

export const RECALL_TOOL = 'window_recall';
export const READ_TOOL = 'window_read';

export function registerRecall(pi: ExtensionAPI, context: any, getAgentDir: () => string, isBotWindow: (ctx: any) => boolean) {
    const find = (ctx: any, only: number | null = null, windowId?: string) => {
        if (!windowId || windowId === context.windowId) return windowGenerations({ agentDir: getAgentDir(), context, current: ctx.sessionManager,
            pi: { SessionManager, parseSessionEntries }, only });
        const started = Date.now(), window = readWindowRecord(getAgentDir(), context.profileId, windowId);
        if (!window?.current || window.cwd !== context.cwd || window.trashedAt || window.deleting || window.rotation)
            throw new Error('The source chat is unavailable; its saved quotation may still be in buddy_notes');
        const directory = path.dirname(ctx.sessionManager.getSessionFile());
        const text = readVerified(window.current.sessionPath, directory, LIMITS.fileBytes), entries = parseSessionEntries(text);
        if (!text.endsWith('\n') || entries.length !== text.split('\n').filter(line => line.trim()).length) throw new Error('The source chat is incomplete');
        const manager = SessionManager.inMemory(context.cwd, undefined, entries), binding = readWindowBinding(manager);
        if (manager.getSessionId() !== window.current.sessionId || manager.getCwd() !== context.cwd || binding?.profileId !== context.profileId
            || binding.windowId !== windowId || binding.generation !== window.current.generation) throw new Error('Source chat identity changed');
        const bytes = Buffer.byteLength(text);
        const result = windowGenerations({ agentDir: getAgentDir(), context: { ...context, windowId },
            current: { getSessionId: () => manager.getSessionId(), getSessionFile: () => window.current.sessionPath, getBranch: () => manager.getBranch() },
            pi: { SessionManager, parseSessionEntries }, only,
            limits: { ...LIMITS, totalBytes: LIMITS.totalBytes - bytes, ms: Math.max(0, LIMITS.ms - (Date.now() - started)) } });
        return { ...result, bytes: result.bytes + bytes, windowId };
    };
    const reply = (result: any) => ({ content: [{ type: 'text' as const, text: result.text }], details: result.details });
    const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
    pi.registerTool({
        name: RECALL_TOOL, label: 'Recall', annotations,
        description: 'Search everything said in a chat, including parts older than the current conversation context. '
            + 'Pass windowId from buddy_notes to search the source chat of an item belonging to this same Buddy. '
            + 'Returns short excerpts with where they are (part and entry) and which parts were searched.',
        promptSnippet: 'Search earlier words, names, numbers or dates in this chat or a notebook item’s source chat',
        promptGuidelines: [
            'Use buddy_notes first to locate an earlier agreement from any chat. When exact wording or context matters, use window_recall with its source windowId, then window_read with that same windowId and the result’s part and entry.',
            'Use window_recall without windowId for earlier messages in this chat. Search with a few distinctive words.'
        ],
        parameters: Type.Object({
            windowId: Type.Optional(Type.String({ maxLength: 36, description: 'Source windowId from buddy_notes; defaults to this chat. Only this Buddy’s chats can be read.' })),
            query: Type.String({ minLength: 1, maxLength: 200, description: 'A few distinctive words to look for.' }),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 12, description: 'Maximum results (default 6).' }))
        }),
        execute: async (_id: string, input: any, _signal: AbortSignal | undefined, _update: any, ctx: any) => {
            if (!isBotWindow(ctx)) throw new Error('Recall is only available in a Bot chat');
            return reply(recall(find(ctx, null, input.windowId), input.query, { limit: input.limit ?? 6 }));
        }
    } as any);
    pi.registerTool({
        name: READ_TOOL, label: 'Read earlier messages', annotations,
        description: 'Show the messages around one entry verbatim. Pass windowId from buddy_notes to read another source chat of this same Buddy, '
            + 'including parts older than the current conversation context. Use the part and entry from window_recall or a saved note’s source.',
        promptSnippet: 'Read earlier messages around a source entry, including another chat of this Buddy',
        parameters: Type.Object({
            windowId: Type.Optional(Type.String({ maxLength: 36, description: 'Source windowId from buddy_notes or window_recall; defaults to this chat.' })),
            entry: Type.String({ minLength: 8, maxLength: 64, description: 'Entry id (at least the first 8 characters).' }),
            part: Type.Optional(Type.Integer({ minimum: 0, description: 'Part number from window_recall; searches all parts when omitted.' })),
            before: Type.Optional(Type.Integer({ minimum: 0, maximum: 10, description: 'Messages before it (default 3).' })),
            after: Type.Optional(Type.Integer({ minimum: 0, maximum: 10, description: 'Messages after it (default 3).' }))
        }),
        execute: async (_id: string, input: any, _signal: AbortSignal | undefined, _update: any, ctx: any) => {
            if (!isBotWindow(ctx)) throw new Error('Reading earlier messages is only available in a Bot chat');
            return reply(readAround(find(ctx, Number.isSafeInteger(input.part) ? input.part : null, input.windowId),
                { entry: input.entry, before: input.before ?? 3, after: input.after ?? 3 }));
        }
    } as any);
}
