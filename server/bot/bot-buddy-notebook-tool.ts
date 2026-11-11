import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { createHash } from 'node:crypto';
import { noteOperation } from './bot-notebook.ts';
import { renderSelection } from './bot-buddy-notebook.js';

export const BUDDY_NOTEBOOK_MESSAGE = 'pivane-buddy-notebook-context';
const OLD_NOTICES = new Set(['pivane-bot-notebook', 'pivane-bot-topic-index', BUDDY_NOTEBOOK_MESSAGE]);
export async function notebookRequest(action: string, input: any, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const origin = process.env.PI_WORKSPACE_INTERNAL_ORIGIN;
    if (!origin) throw new Error('Buddy notebook service is unavailable');
    const url = new URL(`/api/pi/bot-notebook/${action}`, origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid notebook service origin');
    let response;
    try {
        response = await fetch(url, { method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.PI_WEB_NAVIGATION_TOKEN}` }, body: JSON.stringify(input) });
    } catch { throw new Error('Notebook response unavailable. Read buddy_notes to check what was saved; do not repeat an uncertain change with another tool call identity.'); }
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || `Notebook HTTP ${response.status}`), { code: result.code });
    return result;
}

export function buddyNotebookContext(messages: any[], branch: any[] = []) {
    const latest = branch.findLast(entry => entry.customType === BUDDY_NOTEBOOK_MESSAGE);
    const visible = messages.findLast(message => message.role === 'custom' && message.customType === BUDDY_NOTEBOOK_MESSAGE
        && (!latest || message.details?.fingerprint === latest.details?.fingerprint));
    const result = messages.filter(message => message.role !== 'custom' || !OLD_NOTICES.has(message.customType) || message === visible);
    if (latest && !visible) {
        // Restore before the current user request, so a tool/result pair never gets a
        // new trailing user message between its execution and the next model response.
        const user = result.findLastIndex(message => message.role === 'user');
        result.splice(user < 0 ? 0 : user, 0, { role: 'custom', customType: latest.customType, content: latest.content, display: false,
            details: latest.details, timestamp: Date.parse(latest.timestamp) });
    }
    return result;
}

export function buddyNotebookRetirements(projection: any[]) {
    const notices = projection.filter(entry => entry.sourceEntry?.type === 'custom_message' && entry.sourceEntry.customType === BUDDY_NOTEBOOK_MESSAGE);
    return notices.slice(0, -1).filter(entry => entry.messages?.length)
        .map(entry => ({ type: 'context_edit', targetId: entry.sourceEntry.id, replacement: null }));
}

export function registerBuddyNotebook(pi: ExtensionAPI, verified: (ctx: any) => boolean) {
    let version: string | undefined;
    const read = async (input: any, signal?: AbortSignal) => { const result = await notebookRequest('read', input, signal); version = result.version; return result; };
    pi.registerTool({
        name: 'buddy_notes', label: 'Search Buddy notebook', executionMode: 'sequential',
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        description: 'Search this Buddy’s shared notebook across ALL its chats, including completed items. Returns current b-ids, status, subject, due dates and original sources. Query by keywords, subject or exact b-id. Empty query lists recent/actionable items. Results report omitted items.',
        promptSnippet: 'Find decisions, commitments and important information remembered across this Buddy’s chats',
        promptGuidelines: ['Use this before adding a possibly existing item, when the user refers to an earlier agreement from any chat, and before saying old work is still unfinished. Check the subject and original source before treating two items as the same.'],
        parameters: Type.Object({ query: Type.Optional(Type.String({ maxLength: 200 })),
            status: Type.Optional(Type.Union([Type.Literal('all'), Type.Literal('active'), Type.Literal('closed')])),
            offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 10000, description: 'Continue with nextOffset from a previous result.' })),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) }, { additionalProperties: false }),
        execute: async (_id: string, input: any, signal: AbortSignal | undefined, _update: any, ctx: any) => {
            if (!verified(ctx)) throw new Error('The Buddy notebook is unavailable in this conversation');
            const result = await read(input, signal);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], details: {} };
        }
    } as any);
    pi.registerTool({
        // Keep the public tool name for existing transcripts and receipt rendering.
        name: 'window_note', label: 'Remember for Buddy', executionMode: 'sequential',
        description: 'Save or update this Buddy’s ONE shared notebook, from any chat. Use current b-ids from buddy_notes. Actions: add, update, done, cancel, reopen. subject identifies the work or object this applies to (e.g. “October Tokyo trip”); leave empty when no named work applies. Original chat and quotation are saved automatically.',
        promptSnippet: 'Keep this Buddy’s shared decisions, commitments, open questions and key information up to date',
        promptGuidelines: [
            'Save things that need to survive beyond this conversation: accepted decisions, promises, unresolved work, requirements for ongoing work and exact reference information. Keep short-lived formatting instructions and already-answered routine questions in the conversation.',
            'Use buddy_notes to find an existing item before adding a duplicate. Update the same b-id when something changes or is completed in another chat. If the target is ambiguous, ask one short question.',
            'Only save decisions and requirements the user stated or accepted. Do not turn your own suggestions into agreements. Include a due date only when one was said.',
            'Keep the subject specific. A requirement for one paper or trip must not become a rule for other work. Stable personal background and habits belong in about-user memory.',
            'Say it was remembered only after this tool succeeded; describe it as saved in your shared notebook, available in every chat.'
        ],
        parameters: Type.Object({ action: Type.Union(['add', 'update', 'done', 'cancel', 'reopen'].map(action => Type.Literal(action)) as any),
            id: Type.Optional(Type.String({ maxLength: 12, description: 'Current Buddy note id, e.g. b3. Old chat-local n-ids are not valid here.' })),
            kind: Type.Optional(Type.Union(['decision', 'commitment', 'open', 'preference', 'ref'].map(kind => Type.Literal(kind)) as any)),
            text: Type.Optional(Type.String({ maxLength: 500 })), subject: Type.Optional(Type.String({ maxLength: 80, description: 'Related work or object. Omit empty optional fields; update with "none" to clear an existing subject.' })),
            due: Type.Optional(Type.String({ maxLength: 32, description: 'YYYY-MM-DD or YYYY-MM-DDTHH:MM with UTC offset. update with "none" clears it.' })),
            replaces: Type.Optional(Type.String({ maxLength: 12 })) }, { additionalProperties: false }),
        execute: async (toolCallId: string, input: any, signal: AbortSignal | undefined, _update: any, ctx: any) => {
            if (!verified(ctx)) throw new Error('The Buddy notebook is unavailable in this conversation');
            const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
            const op = { ...noteOperation(input), ...(subject ? { subject: subject.toLowerCase() === 'none' ? '' : subject } : {}) };
            if (op.op !== 'add' && !/^b[1-9]\d{0,6}$/.test(op.id || '')) throw new Error('Use buddy_notes to find the current b-id; old chat-local n-ids no longer identify shared items.');
            if (op.op !== 'add' && !version) await read({ query: op.id }, signal);
            const result = await notebookRequest('edit', { toolCallId, ops: [op], ...(op.op === 'add' ? {} : { expectedVersion: version }) }, signal);
            version = result.version;
            pi.appendEntry('pivane-buddy-note-receipt', { v: 1, toolCallId, ids: result.ids });
            return { content: [{ type: 'text' as const, text: JSON.stringify({ saved: true, ids: result.ids, items: result.items }) }],
                details: { pivaneNoteSaved: { v: 1, scope: 'buddy', ids: result.ids } } };
        }
    } as any);
    return {
        read,
        notice: async (manager: any, subject: string, signal?: AbortSignal) => {
            let content: string;
            try { content = renderSelection(await read({ subject, limit: 40 }, signal)); }
            catch { content = 'The shared Buddy notebook is temporarily unavailable. Its contents are unknown; do not infer that no items exist or trust old chat-local notebook snapshots. Try buddy_notes before relying on earlier agreements.'; }
            const fingerprint = createHash('sha256').update(content).digest('hex');
            const previous = manager.getBranch().findLast((entry: any) => entry.customType === BUDDY_NOTEBOOK_MESSAGE);
            if (previous?.details?.fingerprint === fingerprint) return null;
            return { customType: BUDDY_NOTEBOOK_MESSAGE, display: false, content, details: { v: 1, fingerprint } };
        }
    };
}
