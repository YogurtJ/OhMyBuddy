const { SessionImages, isReference, reference } = require('./pi-session-images');
const { dimensions } = require('./pi-file-types');
const { hash } = require('./pi-maintenance-files');
function imageKey(block) {
    if (isReference(block)) return reference(block).sha256;
    if (block?.type === 'image' && typeof block.data === 'string') return hash(Buffer.from(block.data, 'base64'));
    return null;
}
function imageUrl(cwd, sessionId, key) {
    return '/api/pi/sessions/' + encodeURIComponent(sessionId) + '/images/' + key + '?' + new URLSearchParams({ cwd });
}
function displayMessages(messages, cwd, sessionId) {
    return messages.map(message => {
        if (!Array.isArray(message.content)) return message;
        const content = message.content.map(block => {
            const key = imageKey(block);
            return key ? { type: 'image', mimeType: isReference(block) ? reference(block).image.mimeType : block.mimeType,
                pivaneImageUrl: imageUrl(cwd, sessionId, key) } : block;
        });
        return { ...message, content };
    });
}
function mountSessionImages(router, { store }) {
    router.get('/sessions/:id/images/:key', async (req, res) => {
        res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
        try {
            if (!/^[a-f0-9]{64}$/.test(req.params.key)) throw new Error('图片引用无效');
            const bytes = await store.withSessionRead(req.query.cwd, req.params.id, (_session, read) => {
                const images = new SessionImages();
                // A hash is not authorization. The validated native session must
                // own this image; include its branches for archive/tree viewing.
                for (const entry of read.manager().getEntries()) {
                    const content = entry.type === 'message' ? entry.message?.content : entry.type === 'custom_message' ? entry.content : entry.type === 'context_edit' ? entry.replacement?.content : null;
                    for (const block of Array.isArray(content) ? content : []) {
                        if (imageKey(block) !== req.params.key) continue;
                        const image = images.restore(block);
                        const data = Buffer.from(image.data, 'base64'); read.validate();
                        return data;
                    }
                }
                throw new Error('当前会话不包含此图片');
            });
            const type = dimensions(bytes);
            if (!type || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type.mime)) throw new Error('图片格式无效');
            res.type(type.mime).send(bytes);
        } catch (error) { res.status(404).json({ error: error.message }); }
    });
}
module.exports = { mountSessionImages, displayMessages, imageKey };
