// window_recall and window_read in a Bot window worker (D-031). Read-only; earlier
// generations are opened from verified descriptors by bot-recall.js.
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { SessionManager, parseSessionEntries } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { windowGenerations, recall, readAround } from './bot-recall.js';

export const RECALL_TOOL = 'window_recall';
export const READ_TOOL = 'window_read';

export function registerRecall(pi: ExtensionAPI, context: any, getAgentDir: () => string, isBotWindow: (ctx: any) => boolean) {
    const find = (ctx: any, only: number | null = null) => windowGenerations({ agentDir: getAgentDir(), context, current: ctx.sessionManager,
        pi: { SessionManager, parseSessionEntries }, only });
    const reply = (result: any) => ({ content: [{ type: 'text' as const, text: result.text }], details: result.details });
    const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
    pi.registerTool({
        name: RECALL_TOOL, label: 'Recall', annotations,
        description: 'Search everything said in this chat, including parts older than the current conversation context. '
            + 'Returns short excerpts with where they are (part and entry) and which parts were searched.',
        promptSnippet: 'Search the full history of this chat for exact earlier words, names, numbers or dates',
        promptGuidelines: [
            'Use window_recall when the user refers to something from earlier in this chat that is not in your context or summary, or when exact earlier wording, names, numbers or dates matter. Search with a few distinctive words.',
            'Use window_read with a result\'s part and entry to read the messages around it before relying on details.'
        ],
        parameters: Type.Object({
            query: Type.String({ minLength: 1, maxLength: 200, description: 'A few distinctive words to look for.' }),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 12, description: 'Maximum results (default 6).' }))
        }),
        execute: async (_id: string, input: any, _signal: AbortSignal | undefined, _update: any, ctx: any) => {
            if (!isBotWindow(ctx)) throw new Error('Recall is only available in a Bot chat');
            return reply(recall(find(ctx), input.query, { limit: input.limit ?? 6 }));
        }
    } as any);
    pi.registerTool({
        name: READ_TOOL, label: 'Read earlier messages', annotations,
        description: 'Show the messages around one entry of this chat, verbatim, including parts older than the current conversation context. '
            + 'Use the part and entry from window_recall results or from an omitted-output note.',
        promptSnippet: 'Read earlier messages of this chat around an entry',
        parameters: Type.Object({
            entry: Type.String({ minLength: 8, maxLength: 64, description: 'Entry id (at least the first 8 characters).' }),
            part: Type.Optional(Type.Integer({ minimum: 0, description: 'Part number from window_recall; searches all parts when omitted.' })),
            before: Type.Optional(Type.Integer({ minimum: 0, maximum: 10, description: 'Messages before it (default 3).' })),
            after: Type.Optional(Type.Integer({ minimum: 0, maximum: 10, description: 'Messages after it (default 3).' }))
        }),
        execute: async (_id: string, input: any, _signal: AbortSignal | undefined, _update: any, ctx: any) => {
            if (!isBotWindow(ctx)) throw new Error('Reading earlier messages is only available in a Bot chat');
            return reply(readAround(find(ctx, Number.isSafeInteger(input.part) ? input.part : null),
                { entry: input.entry, before: input.before ?? 3, after: input.after ?? 3 }));
        }
    } as any);
}
