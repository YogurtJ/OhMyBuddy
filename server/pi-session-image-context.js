// Public SessionManager facade: storage/entries stay native A2, while Pi's
// context and compaction readers see image blocks for unchanged token estimates.
// All native mutations remain bound to the single real manager. Its internal
// fork/export/rewrite methods therefore never persist this runtime projection.
const { SessionImages, isReference, reference, MARKER } = require('./pi-session-images');
function runtimeContent(content) {
    if (!Array.isArray(content)) return content;
    let changed = false;
    const result = content.map(block => {
        if (!isReference(block)) return block;
        const ref = reference(block); changed = true;
        return { type: 'image', mimeType: ref.image.mimeType, data: '', text: MARKER, pivaneImage: ref };
    });
    return changed ? result : content;
}
function runtimeMessage(message) {
    const content = runtimeContent(message?.content);
    return content === message?.content ? message : { ...message, content };
}
function runtimeEntry(entry) {
    if (entry.type === 'message') { const message = runtimeMessage(entry.message); return message === entry.message ? entry : { ...entry, message }; }
    if (entry.type === 'custom_message') { const content = runtimeContent(entry.content); return content === entry.content ? entry : { ...entry, content }; }
    if (entry.type === 'context_edit' && entry.replacement) {
        const replacement = runtimeMessage(entry.replacement); return replacement === entry.replacement ? entry : { ...entry, replacement };
    }
    return entry;
}
function imageSessionManager(manager, agentDir) {
    const images = new SessionImages(agentDir);
    const project = () => {
        const projected = manager.buildSessionProjection();
        return { ...projected, messages: projected.messages.map(runtimeMessage),
            entries: projected.entries.map(entry => ({ ...entry, messages: entry.messages.map(runtimeMessage) })) };
    };
    const storeMessage = message => {
        if (!manager.getSessionFile()) return message;
        try { return images.message(message, 'save'); }
        catch {
            // The native file remains the durable fallback if object storage is
            // unavailable. Runtime references already point at saved objects;
            // canonicalize those without trying another file write.
            if (!Array.isArray(message?.content)) return message;
            return { ...message, content: message.content.map(block => isReference(block)
                ? { type: 'text', text: MARKER, pivaneImage: reference(block) } : block) };
        }
    };
    const overrides = {
        buildSessionProjection: project,
        buildSessionContext: () => { const { messages, model, thinkingLevel } = project(); return { messages, model, thinkingLevel }; },
        getBranch: (...args) => manager.getBranch(...args).map(runtimeEntry),
        appendMessage: message => manager.appendMessage(storeMessage(message)),
        appendCustomMessageEntry: (kind, content, ...args) => manager.appendCustomMessageEntry(kind,
            storeMessage({ content }).content, ...args),
        appendContextEdit: (id, replacement, ...args) => manager.appendContextEdit(id,
            replacement ? storeMessage(replacement) : replacement, ...args),
    };
    return new Proxy(manager, {
        get(target, key) {
            if (Object.hasOwn(overrides, key)) return overrides[key];
            const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
        },
        // Other public adapters (notably durable queues) can wrap methods without
        // replacing the real manager's native implementations or causing recursion.
        set(target, key, value) {
            if (typeof value === 'function') { overrides[key] = value; return true; }
            return Reflect.set(target, key, value);
        },
    });
}
module.exports = { imageSessionManager, runtimeMessage };
