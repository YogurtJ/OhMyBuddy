'use strict';
// WeChat chats connected to Bots (M4-4, D-021). A Bot binding names a Bot window instead of a
// session file: `bot` = { profileId, windowId, main } is the chat's current Bot window, and the
// binding's cwd/sessionId follow that window's current generation. They are re-pointed when the
// window moves to a new generation and checked again before every turn, so a WeChat message
// never lands in a retired generation (an invisible fork). `bots` lists every Bot connected to
// the chat: their scheduled results and the messages they start themselves reach it too, with
// the Bot's name in front when it is not the chat's current Bot window.
const { randomUUID } = require('node:crypto');

const UUID = /^[a-f0-9-]{36}$/;
const MAX_BOTS = 20;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const same = (a, b) => a?.cwd === b?.cwd && a?.sessionId === b?.sessionId;
// Errors that only mean "not now": the window is moving or its file is being written.
const transient = error => ['BOT_WINDOW_ROTATING', 'BOT_WINDOW_STALE', 'SESSION_BUSY'].includes(error?.code)
    || error?.message === 'Session file changed';

function validBotBinding(b) {
    if (b.bot === undefined && b.bots === undefined) return true;
    const bot = b.bot;
    return Boolean(bot) && typeof bot === 'object' && UUID.test(bot.profileId || '') && UUID.test(bot.windowId || '') && typeof bot.main === 'boolean'
        && Array.isArray(b.bots) && b.bots.length >= 1 && b.bots.length <= MAX_BOTS && b.bots.every(id => typeof id === 'string' && UUID.test(id))
        && new Set(b.bots).size === b.bots.length && b.bots.includes(bot.profileId);
}

const windowRef = target => ({ profileId: target.profileId, windowId: target.window.id, main: target.window.kind === 'main' });
const windowName = window => window.kind === 'main' ? '主聊天' : `${window.emoji ? window.emoji + ' ' : ''}${window.title || '话题'}`;

function botsService(service) {
    if (!service.bots) throw fail('伙伴功能不可用');
    return service.bots;
}

async function resolveTarget(service, profileId, windowId = null) {
    return { profileId, ...await botsService(service).channelTarget(profileId, windowId) };
}

// The web page connects a WeChat chat to a Bot: the chat now talks to the Bot's main chat.
async function bindBot(service, account, input) {
    if (typeof input.botProfileId !== 'string' || !UUID.test(input.botProfileId)) throw fail('无效的伙伴');
    const target = await resolveTarget(service, input.botProfileId);
    const bot = windowRef(target);
    await service.withBindingTarget(target.session.cwd, target.session.id, (session, boundary) => {
        service.healthy();
        service.db.change(v => {
            const previous = v.bindings.find(b => b.accountId === account.id && b.peerId === input.peerId);
            const startupNotice = input.startupNotice ?? previous?.startupNotice ?? true;
            const bots = [...new Set([...(previous?.bots || []), bot.profileId])];
            if (bots.length > MAX_BOTS) throw fail(`一个微信聊天最多连接 ${MAX_BOTS} 个 Buddy`);
            v.bindings = v.bindings.filter(b => !(b.accountId === account.id && b.peerId === input.peerId));
            v.bindings.push({ id: randomUUID(), accountId: account.id, peerId: input.peerId, cwd: session.cwd, sessionId: session.id,
                name: target.name, replyMode: input.replyMode ?? 'all', startupNotice, ...boundary, bot, bots });
        }, { config: true, revision: input.expectedRevision });
    }, { bot });
}

// Disconnects one Bot from a WeChat chat. When it was the current one, the chat moves on to the
// next connected Bot that is still available, or loses its binding when none is.
async function unbindBot(service, input) {
    const binding = service.db.value.bindings.find(b => b.accountId === input.accountId && b.peerId === input.peerId);
    if (!binding?.bots?.includes(input.botProfileId)) throw fail('此微信聊天没有连接这个伙伴');
    service.assertPeerIdle(input.accountId, input.peerId);
    const rest = binding.bots.filter(id => id !== input.botProfileId);
    const keep = changes => service.db.change(v => {
        const current = v.bindings.find(b => b.id === binding.id);
        if (!current) throw fail('微信绑定已变化，请刷新核对', 409);
        if (changes) Object.assign(current, changes);
        else v.bindings = v.bindings.filter(b => b.id !== binding.id);
    }, { config: true, revision: input.expectedRevision });
    if (binding.bot.profileId !== input.botProfileId) return keep({ bots: rest });
    for (const profileId of rest) {
        let target;
        try { target = await resolveTarget(service, profileId); } catch { continue; }
        const bot = windowRef(target);
        return service.withBindingTarget(target.session.cwd, target.session.id, (session, boundary) => {
            service.healthy();
            keep({ cwd: session.cwd, sessionId: session.id, name: target.name, bot, bots: rest, ...boundary });
        }, { bot });
    }
    return keep(null);
}

// Before a WeChat message or command runs: the chat's Bot window at its current generation.
// 'ok' when the job now targets it, 'retry' while it is moving, 'notice' when the message was
// turned into an explanation (the topic was archived or the Bot is unavailable).
async function ensureCurrent(service, jobId) {
    const job = service.job(jobId), binding = service.bindingFor(job);
    if (!binding?.bot) return 'ok';
    let target;
    try { target = await resolveTarget(service, binding.bot.profileId, binding.bot.windowId); }
    catch (error) {
        if (transient(error)) return 'retry';
        if (!['BOT_WINDOW_ARCHIVED', 'BOT_TOPIC_TRASHED', 'BOT_TOPIC_DELETED', 'BOT_DISABLED'].includes(error.code) && error.status !== 404) throw error;
        // The topic is gone: the chat returns to the Bot's main chat. Without an available Bot the
        // binding stays; the message is explained, never run somewhere else.
        let reply = '⚠️ 这个伙伴现在不可用，刚才这条消息没有发出。可以发 /切换 换一个伙伴。';
        if (!binding.bot.main && error.code !== 'BOT_DISABLED') {
            try {
                const main = await resolveTarget(service, binding.bot.profileId);
                await service.withBindingTarget(main.session.cwd, main.session.id, (session, boundary) => service.db.change(v => {
                    const current = v.bindings.find(b => b.id === binding.id);
                    if (current) Object.assign(current, { cwd: session.cwd, sessionId: session.id, bot: windowRef(main), ...boundary });
                }, { config: true }), { bot: windowRef(main) });
                reply = error.code === 'BOT_TOPIC_TRASHED' ? '⚠️ 这个话题已移到回收站，刚才这条消息没有发出。已回到主聊天，请重新发送。'
                    : error.code === 'BOT_TOPIC_DELETED' ? '⚠️ 这个话题已彻底删除，刚才这条消息没有发出。已回到主聊天，请重新发送。'
                    : '⚠️ 这个话题已经归档，刚才这条消息没有发出。已回到主聊天，请重新发送。';
            } catch (inner) { if (transient(inner)) return 'retry'; }
        }
        const current = service.db.value.bindings.find(b => b.id === binding.id) || binding;
        service.updateJob(jobId, { status: 'ready', kind: 'notice', reason: 'binding-changed', text: undefined, images: undefined,
            target: { cwd: current.cwd, sessionId: current.sessionId }, directReply: reply });
        return 'notice';
    }
    const next = { cwd: target.session.cwd, sessionId: target.session.id };
    const bot = { profileId: binding.bot.profileId, windowId: binding.bot.windowId };
    if (same(binding, next) && same(job.target, next) && job.bot?.windowId === bot.windowId) return 'ok';
    service.db.change(v => {
        const current = v.bindings.find(b => b.id === binding.id);
        if (current && !same(current, next)) Object.assign(current, next, { boundAt: Date.now(), excludedTurnId: null });
        const item = v.jobs.find(j => j.id === jobId);
        if (item?.status === 'queued') Object.assign(item, { target: next, bot });
    });
    return 'ok';
}

// The window moved to a new generation: the chats on it follow, and so do messages still waiting.
function windowRotated(service, event) {
    const { profileId, windowId, from, to } = event || {};
    if (!service.db?.owner || !from?.sessionId || !to?.sessionId) return;
    const moved = b => b.bot?.profileId === profileId && b.bot.windowId === windowId && b.sessionId === from.sessionId;
    if (!service.db.value.bindings.some(moved)) return;
    service.db.change(v => {
        const ids = new Set();
        for (const b of v.bindings) if (moved(b)) { b.sessionId = to.sessionId; b.boundAt = Date.now(); b.excludedTurnId = null; ids.add(b.id); }
        for (const j of v.jobs) if (j.status === 'queued' && ids.has(j.bindingId) && j.target?.sessionId === from.sessionId)
            j.target = { cwd: j.target.cwd, sessionId: to.sessionId };
    });
}

// After a restart (or when channels start): moves that happened while no one listened.
async function reconcile(service) {
    if (!service.bots || !service.db?.owner) return;
    for (const binding of service.db.value.bindings.filter(b => b.bot)) {
        let target;
        try { target = await resolveTarget(service, binding.bot.profileId, binding.bot.windowId); } catch { continue; }
        if (!same(binding, { cwd: target.session.cwd, sessionId: target.session.id }))
            windowRotated(service, { profileId: binding.bot.profileId, windowId: binding.bot.windowId,
                from: { sessionId: binding.sessionId }, to: { sessionId: target.session.id } });
    }
}

// Pushes from a Bot window (scheduled results, messages the Bot starts itself) reach every chat
// the Bot is connected to, also when the chat currently talks to another Bot or topic.
function pushRecipients(service, event, accepts = () => true) {
    const bot = event?.target?.bot;
    if (!bot || !UUID.test(bot.profileId || '')) return [];
    return service.db.value.bindings.filter(b => b.bots?.includes(bot.profileId) && accepts(b)
        && service.db.value.accounts.some(a => a.id === b.accountId && a.enabled && a.allowedUsers.includes(b.peerId)))
        .map(b => ({ bindingId: b.id, accountId: b.accountId, peerId: b.peerId, cwd: event.target.cwd, sessionId: event.target.sessionId,
            bot: { profileId: bot.profileId, windowId: bot.windowId ?? null } }));
}

// Who said it, when the chat currently talks to another Bot window: 【小狸】 or 【话题名】.
async function speakerPrefix(service, binding, bot) {
    if (!bot || !binding?.bot || !service.bots) return '';
    const sameBot = binding.bot.profileId === bot.profileId;
    const sameWindow = sameBot && (bot.windowId ? binding.bot.windowId === bot.windowId : binding.bot.main);
    if (sameWindow) return '';
    try {
        const { name, windows } = await service.bots.channelWindows(bot.profileId);
        const window = bot.windowId ? windows.find(item => item.id === bot.windowId) : windows.find(item => item.kind === 'main');
        const label = sameBot ? windowName(window || { kind: 'topic' }) : window && window.kind !== 'main' ? `${name} · ${windowName(window)}` : name;
        return `【${label}】`;
    } catch { return ''; }
}

module.exports = { MAX_BOTS, validBotBinding, windowRef, windowName, resolveTarget, bindBot, unbindBot, ensureCurrent,
    windowRotated, reconcile, pushRecipients, speakerPrefix, transient };
