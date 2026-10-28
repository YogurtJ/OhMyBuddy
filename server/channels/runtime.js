const { STATE, MESSAGE, DELIVERABLE_ENTRY, stateFor, channelReply, outcome, scheduledOutcome } = require('./turn-results');
const { threadOutcome } = require('./thread-results');
const { readWindowBinding } = require('../bot/bot-window-state');
const idPattern = /^[a-f0-9]{64}$/;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
function registerChannelTurns(pi, { prepareStart } = {}) {
    let active = null, preparing = false;
    pi.on('agent_settled', (event, ctx) => {
        if (!active) return;
        const reply = channelReply(ctx.sessionManager, active.id);
        const status = event.aborted || reply?.message?.stopReason === 'aborted' ? 'stopped'
            : !reply || reply.message.stopReason === 'error' ? 'error' : 'completed';
        pi.appendEntry(STATE, { ...active, status, replyEntryId: reply?.id || null, completedAt: Date.now() });
        active = null;
    });
    return (ctx, input) => {
        if (!input || !idPattern.test(input.id) || input.sessionId !== ctx.sessionManager.getSessionId()) throw new Error('Invalid channel turn');
        if (input.action === 'thread-status') return threadOutcome(ctx.sessionManager, input.id);
        if (input.action === 'status') return outcome(ctx.sessionManager, input.id);
        if (input.action !== 'start' || active || preparing || !ctx.isIdle() || ctx.hasPendingMessages()) throw new Error('Channel target is busy');
        if (stateFor(ctx.sessionManager, input.id)) return { ...outcome(ctx.sessionManager, input.id), reused: true };
        const text = typeof input.text === 'string' ? input.text : '';
        const images = Array.isArray(input.images) ? input.images : [];
        if (text.length > 40000 || images.length > 6 || (!text.trim() && !images.length)
            || typeof input.peerId !== 'string' || input.peerId.length > 256) throw new Error('Invalid channel message');
        let encodedBytes = 0;
        for (const image of images) {
            if (!image || image.type !== 'image' || !IMAGE_TYPES.has(image.mimeType)
                || typeof image.data !== 'string' || !image.data.length || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.data)) throw new Error('Invalid channel image');
            encodedBytes += image.data.length;
        }
        if (encodedBytes > 24 * 1024 * 1024) throw new Error('Channel image attachments exceed limit');
        const start = () => {
            // The async model preparation reserves ingress before awaiting. Recheck the native
            // target and readiness before committing a turn; a timeout never proves readiness.
            if (input.sessionId !== ctx.sessionManager.getSessionId() || active || !ctx.isIdle() || ctx.hasPendingMessages())
                throw new Error('Channel target changed or is busy');
            if (!ctx.model) throw Object.assign(new Error('当前聊天没有可用模型，请用 /model 选择模型或检查工作区默认模型'), { code: 'CHANNEL_MODEL_UNAVAILABLE' });
            if (images.length && !ctx.model.input?.includes('image')) throw Object.assign(new Error('当前聊天模型不支持图片输入，请用 /model 选择支持视觉的模型后重新发送图片'), { code: 'CHANNEL_IMAGE_UNSUPPORTED' });
            active = { version: 1, id: input.id, sessionId: input.sessionId, status: 'running', startedAt: Date.now() };
            pi.appendEntry(STATE, active);
            const approvalHint = readWindowBinding(ctx.sessionManager) ? '工具授权只通过对应的同意/拒绝 A编号回答，不能用 /confirm 代替。' : '';
            const header = '[用户通过已绑定的微信私聊发来消息。请完成本次请求；回复、自动生成完成的媒体（图片/音频）及本次通过 deliver_files 发布的文件/图片将自动发送回该微信聊天。若存在待确认的媒体生成卡片（如视频），用户可在微信发送 /confirm [卡片ID] 确认生成或查询结果，也可到 Pivane 网页处理。' + approvalHint + ']';
            const promptText = `${header}\n\n${text.trim() || '请查看我发来的图片。'}`;
            const content = images.length
                ? [{ type: 'text', text: promptText }, ...images.map(({ mimeType, data }) => ({ type: 'image', mimeType, data }))]
                : promptText;
            pi.sendMessage({ customType: MESSAGE, content, display: true,
                details: { channel: 'weixin', peerId: input.peerId, messageId: input.id, bodyOffset: header.length + 2, imageCount: images.length } }, { triggerTurn: true });
            return active;
        };
        if (!prepareStart) return start();
        preparing = true;
        return Promise.resolve().then(() => prepareStart(ctx)).then(start).finally(() => { preparing = false; });
    };
}
module.exports = { STATE, MESSAGE, DELIVERABLE_ENTRY, registerChannelTurns, stateFor, outcome, scheduledOutcome };
