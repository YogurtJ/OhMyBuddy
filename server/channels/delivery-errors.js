// These errors describe a proved rejection BEFORE a message was accepted.
// Timeouts, resets, malformed replies and unknown failures remain ambiguous.
class ChannelDeliveryError extends Error {
    constructor(reason, retryable = false, code = undefined) {
        super(reason);
        this.reason = reason; this.retryable = retryable;
        if (Number.isSafeInteger(code)) this.platformCode = code;
    }
}
function checkSendResponse(value, status = 200) {
    if ([401, 403].includes(status)) throw new ChannelDeliveryError('wechat-login-expired', false, status);
    if (status === 429) throw new ChannelDeliveryError('wechat-rate-limited', true, status);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid WeChat send receipt');
    // Do not infer rejection from gateway/server failures: a request could have
    // committed upstream even though its response was lost.
    if (status < 200 || status >= 300) throw new Error('Unconfirmed WeChat send');
    const code = [value.ret, value.errcode].find(n => n !== undefined && n !== 0);
    if (code !== undefined) {
        if (!Number.isSafeInteger(code)) throw new Error('Invalid WeChat send status');
        throw new ChannelDeliveryError(code === -14 ? 'wechat-login-expired' : 'wechat-rejected', false, code);
    }
    return value;
}
module.exports = { ChannelDeliveryError, checkSendResponse };
