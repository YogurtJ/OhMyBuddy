// The window notebook inside a Bot window worker (D-028): the window_note tool, and the
// rule that the model can always see the current notebook. The state is replayed from the
// active branch every time; nothing is cached across runs except tool calls whose results
// Pi has not appended yet.
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { LEDGER_ENTRY, KINDS, replay, prepareOps, renderLedger, describeOp, applyOp } from './bot-ledger.js';

export const NOTE_TOOL = 'window_note';
export const NOTEBOOK_MESSAGE = 'pivane-bot-notebook';
const ACTIONS = ['add', 'update', 'done', 'cancel', 'reopen'] as const;

// Raw tool input -> one notebook operation.
export function noteOperation(input: any) {
    const action = input?.action;
    if (action === 'add') return { op: 'add', kind: input.kind, text: input.text, due: input.due, supersedes: input.replaces };
    if (action === 'update') return { op: 'update', id: input.id, text: input.text, kind: input.kind, due: input.due };
    if (action === 'done' || action === 'cancel' || action === 'reopen')
        return { op: 'status', id: input.id, status: action === 'done' ? 'done' : action === 'cancel' ? 'cancelled' : 'active' };
    throw new Error('Unknown notebook action');
}

// Whether the model has seen the notebook since the last compaction: a Bot compaction
// renders it into the summary, a generation seed or a fallback message carries it.
// Returns the entries that changed it afterwards from the notebook panel (user edits).
export function notebookVisibility(branch: any[]) {
    let visible = false, userOps: any[] = [];
    for (const entry of branch) {
        if (entry.type === 'compaction') { visible = Boolean(entry.details?.pivaneBot?.ledger); userOps = []; continue; }
        if (entry.type === 'custom_message' && (entry.customType === NOTEBOOK_MESSAGE || entry.details?.pivaneNotebook === true)) {
            visible = true; userOps = []; continue;
        }
        if (entry.type === 'custom' && entry.customType === LEDGER_ENTRY && Array.isArray(entry.data?.ops))
            userOps.push(...entry.data.ops.filter((op: any) => op?.by === 'user'));
    }
    return { visible, userOps };
}

// What to tell the model before a run, or null: the full notebook when it is not visible
// (after a native fallback compaction, or a generation started before notebooks existed),
// otherwise just the changes the user made in the panel.
export function notebookNotice(branch: any[], now: string) {
    const state = replay(branch);
    const { visible, userOps } = notebookVisibility(branch);
    if (!visible) {
        if (!state.items.length) return null;
        return { customType: NOTEBOOK_MESSAGE, display: false, details: { v: 1, reason: 'render' },
            content: renderLedger(state, { now }) };
    }
    if (!userOps.length) return null;
    const lines = userOps.slice(-20).map(op => '- ' + describeOp(op, state));
    return { customType: NOTEBOOK_MESSAGE, display: false, details: { v: 1, reason: 'user-edits' },
        content: 'The user changed the notebook of this chat themselves:\n' + lines.join('\n') };
}

export function registerNotebook(pi: ExtensionAPI, isBotWindow: (ctx: any) => boolean) {
    // Results of window_note calls that Pi has not appended to the branch yet (parallel
    // calls in one assistant message), so ids stay unique.
    const pending: { toolCallId: string, ops: any[] }[] = [];
    const current = (manager: any) => {
        const branch = manager.getBranch();
        const appended = new Set(branch.filter((entry: any) => entry.type === 'message' && entry.message?.role === 'toolResult')
            .map((entry: any) => entry.message.toolCallId));
        for (let index = pending.length - 1; index >= 0; index--) if (appended.has(pending[index].toolCallId)) pending.splice(index, 1);
        let state = replay(branch);
        for (const item of pending) for (const op of item.ops) { try { state = applyOp(state, op); } catch { /* superseded meanwhile */ } }
        return state;
    };
    pi.on('agent_settled', () => { pending.length = 0; });
    pi.registerTool({
        name: NOTE_TOOL, label: 'Notebook', executionMode: 'sequential',
        description: 'Keep the notebook of this chat: decisions the user made, commitments (what you or the user promised, and by when), '
            + 'open questions waiting for an answer, preferences or constraints for this chat, and key references (exact names, numbers, dates). '
            + 'add creates a note; update changes its text, kind or due date; done, cancel and reopen change its status. Returns the note id.',
        promptSnippet: 'Record decisions, commitments, open questions, preferences and key references of this chat',
        promptGuidelines: [
            'Use window_note when the user decides something, when you or the user commit to doing something (include the due date if one was said), when a question is left waiting for an answer, for preferences or constraints that apply to this chat, and for exact names, numbers or dates worth keeping.',
            'Only note what the user decided, asked for or agreed to. A suggestion of yours is not a decision until the user accepts it. Do not note small talk.',
            'When a noted thing changes, update it (or add a new note with replaces); when it is settled, mark it done or cancelled. Refer to notes by id, for example n3.',
            'The notebook of this chat is shown to you in the conversation context; trust it over your recollection of older messages.'
        ],
        parameters: Type.Object({
            action: Type.Union(ACTIONS.map(value => Type.Literal(value)) as any, { description: 'add, update, done, cancel or reopen.' }),
            id: Type.Optional(Type.String({ maxLength: 12, description: 'Note id such as n3 (required except for add).' })),
            kind: Type.Optional(Type.Union(KINDS.map((value: string) => Type.Literal(value)) as any,
                { description: 'decision, commitment, open, preference or ref (required for add).' })),
            text: Type.Optional(Type.String({ maxLength: 500, description: 'One self-contained sentence in the user\'s language.' })),
            due: Type.Optional(Type.String({ maxLength: 32, description: 'Due date as YYYY-MM-DD (or a full ISO time), for commitments.' })),
            replaces: Type.Optional(Type.String({ maxLength: 12, description: 'For add: id of the note this one replaces.' }))
        }),
        execute: async (toolCallId: string, input: any, _signal: AbortSignal | undefined, _update: any, ctx: any) => {
            if (!isBotWindow(ctx)) throw new Error('The notebook is only available in a Bot chat');
            const manager = ctx.sessionManager, state = current(manager);
            const { ops, state: next } = prepareOps(state, [noteOperation(input)], { at: new Date().toISOString(), by: 'bot',
                source: { sessionId: manager.getSessionId(), entryId: manager.getLeafId() } });
            pending.push({ toolCallId, ops });
            const text = ops.map((op: any) => describeOp(op, next)).join('\n');
            return { content: [{ type: 'text' as const, text: `Notebook ${text}` }], details: { pivaneLedger: { v: 1, ops } } };
        }
    } as any);
}
