'use strict';
// Approving a Bot's step from WeChat (M3-3, M4-4c). While a turn started from a WeChat chat waits
// for a Bot approval, that chat gets the step and a short code; 「同意 A3」 or 「拒绝 A3」 answers
// that one pending request, once. Only the chat that started the turn can answer, and only while
// the request is still pending in the same runtime (the web card and the 30-minute timeout end it
// too). Codes live in memory: pending requests do not survive a restart either. "Always allow"
// rules stay on the web, where the exact rule is shown.
const { APPROVAL_TITLE, parseApprovalMessage } = require('../bot/bot-guard');

const PATTERN = /^(同意|允许|批准|approve|allow|拒绝|不同意|不允许|deny|reject)\s*([a-z]\d{1,4})$/i;
const YES = new Set(['同意', '允许', '批准', 'approve', 'allow']);
const DETAIL = 600;
const KIND_TEXT = Object.freeze({ command: '运行命令', delegate: '把事交给别的助手', outside: '改工作目录以外的文件', write: '写文件',
    memory: '改记忆', action: '做一步操作', schedule: '改定时任务', topic: '开新话题' });

// 「同意 A3」 → { allow: true, code: 'A3' }; anything else is not an approval answer.
function parseApproval(text) {
    const match = PATTERN.exec(String(text || '').trim());
    return match ? { allow: YES.has(match[1].toLowerCase()), code: match[2].toUpperCase() } : null;
}

class ChannelApprovals {
    constructor() { this.pending = new Map(); this.serial = 0; }

    // The WeChat text for a Bot approval request (registering its code), or null for anything else.
    offer({ event, worker, job, botName }) {
        if (event?.type !== 'extension_ui_request' || event.method !== 'confirm' || event.title !== APPROVAL_TITLE || typeof event.id !== 'string') return null;
        const parsed = parseApprovalMessage(event.message);
        if (!parsed || !worker || !job) return null;
        // Requests answered on the web, timed out or from a closed runtime are over.
        for (const [code, entry] of this.pending) if (entry.worker.disposed || !entry.worker.pendingUi?.has(entry.requestId)) this.pending.delete(code);
        if ([...this.pending.values()].some(entry => entry.worker === worker && entry.requestId === event.id)) return null;
        if (this.pending.size >= 9000) return null;
        let code;
        do { this.serial = this.serial >= 9999 ? 1 : this.serial + 1; code = `A${this.serial}`; } while (this.pending.has(code));
        this.pending.set(code, { accountId: job.accountId, peerId: job.peerId, jobId: job.id, worker, requestId: event.id });
        const detail = parsed.detail.length > DETAIL ? `${parsed.detail.slice(0, DETAIL)}…` : parsed.detail;
        return `🔐 ${botName || 'Bot'} 想${KIND_TEXT[parsed.kind] || '做一步操作'}，需要你同意：\n${detail}\n\n`
            + `回复「同意 ${code}」允许这一次，回复「拒绝 ${code}」不做。30 分钟内没回复就不做；“以后都允许”请在网页里选。`;
    }

    // One answer from a chat: 'done' when it reached the waiting step, else 'missing'. A code is
    // used up by its first answer from the right chat; another chat cannot use (or burn) it.
    answer({ accountId, peerId, code, allow }) {
        const entry = this.pending.get(code);
        if (!entry || entry.accountId !== accountId || entry.peerId !== peerId) return 'missing';
        this.pending.delete(code);
        if (!entry.worker.pendingUi?.has(entry.requestId)) return 'missing';
        return entry.worker.send({ type: 'extension_ui_response', id: entry.requestId, confirmed: allow === true }) === true ? 'done' : 'missing';
    }

    // The turn is over: its requests are over too.
    forgetJob(jobId) {
        for (const [code, entry] of this.pending) if (entry.jobId === jobId) this.pending.delete(code);
    }
}

module.exports = { ChannelApprovals, parseApproval };
