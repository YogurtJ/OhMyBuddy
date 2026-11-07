const { setTimeout: delay } = require('node:timers/promises');
const { ChannelDeliveryError } = require('./delivery-errors');

function recipient(service, job) {
    if (service.stopping || service.isSuspended()) throw new ChannelDeliveryError('delivery-interrupted');
    const account = service.db.value.accounts.find(a => a.id === job.accountId);
    if (!account?.enabled || !account.allowedUsers.includes(job.peerId) || !service.bindingFor(job)
        || job.kind === 'cron' && service.canNotifyScheduled && !service.canNotifyScheduled(job.cronJobId)) {
        throw new ChannelDeliveryError('delivery-revoked');
    }
    const peer = service.db.value.peers.find(p => p.accountId === job.accountId && p.peerId === job.peerId);
    if (!peer?.contextToken) throw new ChannelDeliveryError('reply-context-missing');
    return { account, peer };
}
async function sendItem(service, job, operation) {
    for (let attempt = 0; ; attempt++) {
        const { account, peer } = recipient(service, job);
        try { return await operation(account, peer, () => recipient(service, job)); }
        catch (error) {
            // Remember which context WeChat refused; a newer inbound message may already have replaced it.
            if (error instanceof ChannelDeliveryError && error.reason === 'reply-context-expired') error.expiredContext = peer.contextToken;
            if (!(error instanceof ChannelDeliveryError) || !error.retryable || attempt >= 2) throw error;
            // Only a proved pre-send failure/rejection is retried. Never retry a
            // timeout/reset or use client_id as an undocumented idempotency key.
            service.updateJob(job.id, { reason: 'delivery-retrying', deliveryError: error.reason,
                platformCode: error.platformCode, retryCount: (service.job(job.id).retryCount || 0) + 1 });
            await delay(attempt === 0 ? 1000 : 3000, undefined, { signal: service.stopController?.signal });
        }
    }
}
function failure(service, job, error) {
    const current = service.job(job.id);
    if (error instanceof ChannelDeliveryError && error.reason === 'reply-context-expired') {
        if (current.sentChunks || current.sentMedia) {
            // The same context was accepted moments ago in this reply: not an expired context.
            error.reason = 'wechat-rejected';
        } else {
            // WeChat refused this chat's reply context (long idle) and accepted nothing of this reply.
            // Hold the chat's results until its next inbound message renews the context; no review needed.
            service.db.change(v => {
                const peer = v.peers.find(p => p.accountId === job.accountId && p.peerId === job.peerId);
                if (peer && peer.contextToken === error.expiredContext) peer.contextExpiredAt = Date.now();
            });
            if (current.startupNotice) {
                // Startup notices are ephemeral: skip silently instead of sending a stale greeting later.
                service.updateJob(job.id, { status: 'cancelled', reason: 'reply-context-expired', sendStarted: false,
                    directReply: undefined, deliveryError: undefined, platformCode: error.platformCode });
                return;
            }
        }
        const attempts = (current.contextAttempts || 0) + 1;
        if (error.reason === 'reply-context-expired' && attempts < 3) {
            // A definite refusal with nothing accepted: the next attempt is a first send, not a replay.
            service.updateJob(job.id, { status: 'ready', reason: 'reply-context-expired', contextAttempts: attempts, sendStarted: false,
                deliveryError: undefined, platformCode: error.platformCode });
            return;
        }
    }
    if (current.startupNotice && error instanceof ChannelDeliveryError && error.reason === 'reply-context-missing') {
        service.updateJob(job.id, { status: 'cancelled', reason: 'reply-context-missing', sendStarted: false,
            directReply: undefined, deliveryError: undefined });
        return;
    }
    service.updateJob(job.id, { status: error instanceof ChannelDeliveryError ? (current.sentChunks || current.sentMedia ? 'partial' : 'failed') : 'uncertain',
        reason: error instanceof ChannelDeliveryError ? error.reason : 'delivery-unconfirmed',
        deliveryError: undefined, platformCode: error instanceof ChannelDeliveryError ? error.platformCode : undefined });
}
async function deliver(service, job, { chunks, mediaFiles, deliveryIssues, isStop }) {
    service.updateJob(job.id, { status: 'sending', sendStarted: true, sentChunks: 0, sentMedia: 0, deliveryIssues,
        reason: null, deliveryError: undefined, platformCode: undefined, retryCount: 0 });
    for (let i = 0; i < chunks.length; i++) {
        let receipt;
        try { receipt = await sendItem(service, job, (a, p) => service.adapter.send(a, p, chunks[i], `pivane-${job.id}-${i}`)); }
        catch (error) { failure(service, job, error); return; }
        // Keep storage outside the send catch: lost persistence is ambiguous,
        // even when the preceding API call returned a successful receipt.
        service.updateJob(job.id, { sentChunks: i + 1, lastPlatformMessageId: receipt?.message_id ? String(receipt.message_id) : null });
    }
    const sendIssues = [];
    for (let i = 0; i < mediaFiles.length; i++) {
        let receipt;
        try {
            receipt = await sendItem(service, job, (a, p, check) => service.adapter.sendMedia(a, p, mediaFiles[i], `pivane-media-${job.id}-${i}`, check));
        } catch (error) {
            if (error instanceof ChannelDeliveryError && ['delivery-revoked', 'delivery-interrupted', 'wechat-login-expired', 'reply-context-missing'].includes(error.reason)) {
                failure(service, job, error); return;
            }
            // The text of this reply was just accepted with the same context, so a refusal here
            // concerns this attachment only (for example consecutive media), not an expired chat.
            const reason = !(error instanceof ChannelDeliveryError) ? 'send-unconfirmed'
                : error.reason === 'reply-context-expired' ? 'wechat-rejected' : error.reason;
            service.deliveryIssue(deliveryIssues, mediaFiles[i].name, reason);
            service.deliveryIssue(sendIssues, mediaFiles[i].name, reason);
            service.updateJob(job.id, { deliveryIssues });
            // Other attachments are independent. Never retry this uncertain
            // item, but do not discard the remaining files in this reply.
            continue;
        }
        service.updateJob(job.id, { sentMedia: service.job(job.id).sentMedia + 1, lastPlatformMessageId: receipt?.message_id ? String(receipt.message_id) : null });
    }
    if (sendIssues.length) {
        try {
            await sendItem(service, job, (a, p) => service.adapter.send(a, p, service.deliveryWarning(sendIssues)
                + '\n后续消息仍可正常使用，无需到网页放行。', `pivane-delivery-note-${job.id}`));
        } catch (error) { failure(service, job, error); return; }
        service.updateJob(job.id, { sentChunks: service.job(job.id).sentChunks + 1 });
    }
    service.updateJob(job.id, { status: isStop ? 'reviewed' : deliveryIssues.length ? 'partial' : 'delivered',
        reason: isStop ? 'stop-request' : deliveryIssues.length ? 'attachments-incomplete' : null,
        deliveryError: undefined, platformCode: undefined, directReply: undefined, deliverables: undefined, mediaPlans: undefined });
}
module.exports = { deliver };
