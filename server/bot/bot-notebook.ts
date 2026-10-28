// The window notebook inside a Bot window worker (D-028): the window_note tool, and the
// rule that the model can always see the current notebook. The state is replayed from the
// active branch every time. A change the tool makes is written to the session file at once
// (a custom entry), so it holds however the tool was called: directly, from a codemode script
// (whose nested tool results are not kept in the session) or several times in parallel.
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { nativeInputIndex, nativeMessage, channelSource, textOf } from '../pi-native-input.js';
import { LEDGER_ENTRY, KINDS, replay, prepareOps, renderLedger, describeOp, describeItem, ledgerVersion, sourceQuote } from './bot-ledger.js';

export const NOTE_TOOL = 'window_note';
export const NOTEBOOK_MESSAGE = 'pivane-bot-notebook';
const ACTIONS = ['add', 'update', 'done', 'cancel', 'reopen'] as const;

// An optional field the model left empty counts as left out (some models send "" for every
// optional field); nothing is filled in for it.
const given = (value: any) => typeof value === 'string' ? (value.trim() ? value.trim() : undefined) : value ?? undefined;

// Raw tool input -> one notebook operation. For update, due "none" removes the due date.
export function noteOperation(input: any) {
    const action = given(input?.action);
    if (action === 'add') return { op: 'add', kind: given(input.kind), text: given(input.text), due: given(input.due), supersedes: given(input.replaces) };
    if (action === 'update') {
        const due = given(input.due);
        return { op: 'update', id: given(input.id), text: given(input.text), kind: given(input.kind),
            due: typeof due === 'string' && due.toLowerCase() === 'none' ? null : due };
    }
    if (action === 'done' || action === 'cancel' || action === 'reopen')
        return { op: 'status', id: given(input.id), status: action === 'done' ? 'done' : action === 'cancel' ? 'cancelled' : 'active' };
    throw new Error('Unknown notebook action; use add, update, done, cancel or reopen');
}

// Whether the model has seen the notebook since the last compaction: a Bot compaction
// renders it into the summary, a generation seed or a fallback message carries it.
// Returns the entries that changed it afterwards from the notebook panel (user edits).
// What the model has seen of the notebook since it was last shown in full (a Bot summary, the
// seed of a generation, or a notebook message): the user's own panel edits, and notes the Bot
// saved whose window_note result is not in the conversation (a call made inside a script, whose
// nested result Pi does not keep, or a run that ended before the result was written).
export function notebookVisibility(branch: any[]) {
    const answered = new Set(branch.filter((entry: any) => entry.type === 'message' && entry.message?.role === 'toolResult'
        && entry.message.toolName === NOTE_TOOL).map((entry: any) => entry.message.toolCallId));
    let visible = false, userOps: any[] = [], unseenOps: any[] = [];
    for (const entry of branch) {
        if (entry.type === 'compaction') { visible = Boolean(entry.details?.pivaneBot?.ledger); userOps = []; unseenOps = []; continue; }
        if (entry.type === 'custom_message' && (entry.customType === NOTEBOOK_MESSAGE || entry.details?.pivaneNotebook === true)) {
            visible = true; userOps = []; unseenOps = []; continue;
        }
        if (entry.type !== 'custom' || entry.customType !== LEDGER_ENTRY || !Array.isArray(entry.data?.ops)) continue;
        userOps.push(...entry.data.ops.filter((op: any) => op?.by === 'user'));
        if (typeof entry.data.toolCallId === 'string' && !answered.has(entry.data.toolCallId))
            unseenOps.push(...entry.data.ops.filter((op: any) => op?.by !== 'user'));
    }
    return { visible, userOps, unseenOps };
}

// Beyond this many changed notes the whole notebook is shown again as well (the changed ones
// are always listed: the rendering leaves out deleted and older closed notes).
const MAX_NOTICE_NOTES = 40;

// What to tell the model before a run, or null: the full notebook when it is not visible
// (after a native fallback compaction, or a generation started before notebooks existed),
// otherwise how every note the user changed in the panel, or the Bot saved without seeing the
// result, stands now (all fields, so a changed or removed due date is seen too).
export function notebookNotice(branch: any[], now: string) {
    const state = replay(branch);
    const { visible, userOps, unseenOps } = notebookVisibility(branch);
    const full = (reason: string) => ({ customType: NOTEBOOK_MESSAGE, display: false, details: { v: 1, reason },
        content: renderLedger(state, { now }) });
    if (!visible) return state.items.length ? full('render') : null;
    // A note that replaces another also changed that one (now superseded): both are described.
    const describe = (ops: any[]) => [...new Set(ops.flatMap(op => [op?.id, op?.supersedes]).filter((id: any) => typeof id === 'string'))]
        .map(id => describeItem(state.items.find((item: any) => item.id === id))).filter(Boolean);
    const userLines = describe(userOps), unseenLines = describe(unseenOps);
    if (!userLines.length && !unseenLines.length) return null;
    const parts = [];
    if (userLines.length) parts.push('The user changed these notes of this chat themselves; this is how they stand now:\n' + userLines.map(line => '- ' + line).join('\n'));
    if (unseenLines.length) parts.push('These notes were saved by your own window_note calls whose results are not in this conversation (for example calls made inside a script); this is how they stand now:\n'
        + unseenLines.map(line => '- ' + line).join('\n'));
    const changes = parts.join('\n\n');
    return { customType: NOTEBOOK_MESSAGE, display: false, details: { v: 1, reason: userLines.length ? 'user-edits' : 'unseen-notes' },
        content: userLines.length + unseenLines.length > MAX_NOTICE_NOTES ? renderLedger(state, { now }) + '\n\n' + changes : changes };
}

const PANEL_OPS = ['update', 'status', 'delete'];

// A note the Bot takes points at the user's message that led to it (the leaf is usually the
// assistant message holding the tool call, which often has no text of its own).
function noteSource(manager: any) {
    const branch = manager.getBranch(), inputs = nativeInputIndex(branch, manager.getSessionId());
    for (let index = branch.length - 1; index >= 0; index--) {
        const message = nativeMessage(branch[index], inputs);
        if (message?.role !== 'user') continue;
        const quote = sourceQuote(textOf(message.content));
        return quote ? { sessionId: manager.getSessionId(), entryId: branch[index].id, role: 'user', quote,
            ...channelSource(inputs.channels.get(branch[index].id)) }
            : { sessionId: manager.getSessionId(), entryId: branch[index].id };
    }
    return { sessionId: manager.getSessionId(), entryId: manager.getLeafId() };
}

// An edit from the notebook panel, applied by the worker that owns the session file (the
// Supervisor only sends it while the session is idle). The panel names the version it saw.
export function editNotebook(pi: any, ctx: any, input: any) {
    if (!ctx.isIdle()) throw Object.assign(new Error('The chat is busy; try again in a moment'), { code: 'SESSION_BUSY' });
    const state = replay(ctx.sessionManager.getBranch());
    if (input?.expectedVersion !== ledgerVersion(state)) throw Object.assign(new Error('The notebook changed; reload it'), { code: 'NOTEBOOK_CHANGED' });
    if (!Array.isArray(input.ops) || input.ops.some((op: any) => !PANEL_OPS.includes(op?.op))) throw new Error('Invalid notebook edit');
    const { ops, state: next } = prepareOps(state, input.ops.map((op: any) => ({ op: op.op, id: op.id, text: op.text, status: op.status, due: op.due })),
        { at: new Date().toISOString(), by: 'user' });
    pi.appendEntry(LEDGER_ENTRY, { v: 1, ops });
    return { ops, version: ledgerVersion(next) };
}

export function registerNotebook(pi: ExtensionAPI, isBotWindow: (ctx: any) => boolean) {
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
            'The notebook of this chat is shown to you in the conversation context; trust it over your recollection of older messages. Before telling the user that an older open question or promise is still open, check with window_recall whether it was settled since.'
        ],
        parameters: Type.Object({
            action: Type.Union(ACTIONS.map(value => Type.Literal(value)) as any, { description: 'add, update, done, cancel or reopen.' }),
            id: Type.Optional(Type.String({ maxLength: 12, description: 'Note id such as n3 (required except for add; leave it out for add).' })),
            kind: Type.Optional(Type.Union(KINDS.map((value: string) => Type.Literal(value)) as any,
                { description: 'decision, commitment, open, preference or ref (required for add).' })),
            text: Type.Optional(Type.String({ maxLength: 500, description: 'One self-contained sentence in the user\'s language.' })),
            due: Type.Optional(Type.String({ maxLength: 32, description: 'Only when the user said one: YYYY-MM-DD, or YYYY-MM-DDTHH:MM with the user\'s UTC offset (e.g. 2026-11-06T17:30+08:00) for a time of day. Leave it out otherwise; never invent one. For update, "none" removes the due date.' })),
            replaces: Type.Optional(Type.String({ maxLength: 12, description: 'For add, only when the new note replaces an existing one: that note\'s id. Leave it out otherwise.' }))
        }),
        execute: async (toolCallId: string, input: any, _signal: AbortSignal | undefined, _update: any, ctx: any) => {
            if (!isBotWindow(ctx)) throw new Error('The notebook is only available in a Bot chat');
            // Read, check and write with no await in between, so parallel calls (codemode scripts
            // can make several at once) each see the previous change and ids stay unique.
            const manager = ctx.sessionManager, state = replay(manager.getBranch());
            const { ops, state: next } = prepareOps(state, [noteOperation(input)], { at: new Date().toISOString(), by: 'bot',
                source: noteSource(manager) });
            pi.appendEntry(LEDGER_ENTRY, { v: 1, ops, toolCallId });
            const text = ops.map((op: any) => describeOp(op, next)).join('\n');
            // The result only names what was written: the custom entry above is the change.
            return { content: [{ type: 'text' as const, text: `Notebook ${text}` }], details: { pivaneNoteSaved: { v: 1, ids: ops.map((op: any) => op.id) } } };
        }
    } as any);
}
