'use strict';
// Read-only conversational meaning of native input. A channel custom message is a user's
// input only when its own branch contains the matching runtime start record. Native IDs,
// tree edges and stored channel metadata stay untouched; generated delivery instructions
// are excluded from the user's words. Other extension messages retain their own roles.
const CHANNEL_MESSAGE = 'pivane-channel-message';
const CHANNEL_TURN = 'pivane-channel-turn';
const MESSAGE_ID = /^[a-f0-9]{64}$/;

function textOf(content) {
    if (typeof content === 'string') return content;
    return Array.isArray(content) ? content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n') : '';
}

function firstText(content) {
    return typeof content === 'string' ? content : Array.isArray(content) && content[0]?.type === 'text' ? content[0].text : null;
}

function channelInput(entry, start, sessionId) {
    const details = entry.details, run = start?.data;
    if (entry.type !== 'custom_message' || entry.customType !== CHANNEL_MESSAGE || !run || run.version !== 1 || run.status !== 'running'
        || !MESSAGE_ID.test(run.id) || typeof run.sessionId !== 'string' || !run.sessionId || !Number.isFinite(run.startedAt) || sessionId && run.sessionId !== sessionId
        || details?.channel !== 'weixin' || details.messageId !== run.id || typeof details.peerId !== 'string' || details.peerId.length > 256
        || !Number.isSafeInteger(details.bodyOffset) || details.bodyOffset < 1 || !Number.isSafeInteger(details.imageCount)
        || details.imageCount < 0 || details.imageCount > 6) return null;
    const text = firstText(entry.content), offset = details.bodyOffset;
    if (typeof text !== 'string' || offset > text.length || !text.startsWith('[') || !text.slice(0, offset).endsWith(']\n\n')) return null;
    if (Array.isArray(entry.content)) {
        const images = entry.content.slice(1);
        if (images.length !== details.imageCount || images.some(part => part?.type !== 'image' && !require('./pi-session-images').isReference(part))) return null;
    } else if (details.imageCount !== 0) return null;
    return { header: text.slice(0, offset), channel: details.channel, peerId: details.peerId, messageId: details.messageId };
}

function nativeInputIndex(branch, sessionId) {
    const edits = new Map(), pending = new Map(), channels = new Map();
    for (const entry of branch || []) {
        if (entry.type === 'context_edit') edits.set(entry.targetId, entry);
        let start = pending.get(entry.parentId) || null;
        if (entry.type === 'custom' && entry.customType === CHANNEL_TURN) start = entry.data?.status === 'running' ? entry : null;
        if (entry.type === 'custom_message') {
            // A real AgentSession may append model selection, compaction or a system
            // prompt patch before the input. Follow only its native ancestor chain;
            // another conversational input consumes the pending channel start.
            const input = channelInput(entry, start, sessionId);
            if (input) channels.set(entry.id, input);
            start = null;
        }
        if (entry.type === 'message' && entry.message?.role !== 'system' || entry.type === 'branch_summary'
            || entry.type === 'custom' && entry.customType === 'pivane-cron-run') start = null;
        pending.set(entry.id, start);
    }
    return { edits, channels };
}

function bodyContent(content, input) {
    const strip = value => typeof value === 'string' && value.startsWith(input.header) ? value.slice(input.header.length) : value;
    if (typeof content === 'string') return strip(content);
    if (!Array.isArray(content)) return [];
    return content.map((part, index) => index === 0 && part?.type === 'text' ? { ...part, text: strip(part.text) } : part);
}

function channelSource(input) {
    return input ? { channel: input.channel, peerId: input.peerId, messageId: input.messageId } : {};
}

// Reclassify a model projection without undoing its context edits or omissions.
function projectNativeMessage(entry, message, index) {
    const input = index.channels.get(entry?.id);
    return input ? { ...message, role: 'user', content: bodyContent(message.content, input), ...channelSource(input) } : message;
}

// Full branch readers use the last native context edit, just as Pi's projection does.
function nativeMessage(entry, index) {
    const input = index.channels.get(entry.id);
    if (entry.type !== 'message' && !input) return null;
    const edit = index.edits.get(entry.id);
    if (edit?.replacement === null) return null;
    const message = entry.type === 'message' ? entry.message : { role: 'custom', content: entry.content, timestamp: Date.parse(entry.timestamp) };
    if (!message) return null;
    const effective = edit ? { ...message, content: edit.replacement?.content } : message;
    return projectNativeMessage(entry, effective, index);
}

module.exports = { nativeInputIndex, nativeMessage, projectNativeMessage, channelSource, textOf };
