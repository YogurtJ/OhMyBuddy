'use strict';
// WeChat commands in a chat connected to Bots (M4-4). The chat talks to one Bot window at a time:
// /切换 (/bot) picks the Bot, /话题 (/topic) the topic. Thread commands that would make the
// Bot's conversation fork or change behind its back (/new, /resume, /model, /compact …) are not
// available; /stop keeps its usual meaning (commands.js).
const { MAX_BOTS, windowRef, windowName, resolveTarget } = require('./bot-channel');

const same = (a, b) => a?.cwd === b?.cwd && a?.sessionId === b?.sessionId;
const norm = value => String(value || '').trim().toLowerCase();

const HELP = [
    '📋 在 Bot 聊天里可以用：',
    '/切换 — 看看有哪些 Bot；/切换 <序号或名字> 换一个 Bot 聊',
    '/话题 — 看看当前 Bot 的话题；/话题 <序号或名字> 进入话题，/话题 主聊天 回到主聊天',
    '/status — 现在在和谁、哪个话题聊',
    '/stop — 停下正在做的事',
    '/help — 查看这份说明',
    '其他 Bot 的提醒和主动消息也会发到这里，前面带着它的名字。'
].join('\n');

// One choice from a numbered list (1-based) or by name: exact, then prefix, then contains.
function choose(items, arg, nameOf) {
    if (/^\d{1,2}$/.test(arg)) return items[Number(arg) - 1] || null;
    const q = norm(arg);
    const exact = items.filter(item => norm(nameOf(item)) === q);
    if (exact.length) return exact.length === 1 ? exact[0] : exact;
    const prefix = items.filter(item => norm(nameOf(item)).startsWith(q));
    if (prefix.length) return prefix.length === 1 ? prefix[0] : prefix;
    const contains = items.filter(item => norm(nameOf(item)).includes(q));
    return contains.length === 1 ? contains[0] : contains.length ? contains : null;
}

// Moves the chat to another Bot window. The binding keeps its ID, so replies still on their way
// from the previous window are delivered (with its name in front); waiting messages follow.
async function switchTo(service, job, run, binding, control, target) {
    const bot = windowRef(target);
    await service.withBindingTarget(target.session.cwd, target.session.id, (session, boundary) => {
        control.submit();
        service.db.change(v => {
            const current = v.bindings.find(b => b.id === binding.id);
            if (!current) throw Object.assign(new Error('微信绑定已变化'), { status: 409 });
            const bots = [...new Set([...(current.bots || []), bot.profileId])];
            const next = { cwd: session.cwd, sessionId: session.id };
            // The newest connections are kept when the list is full; the chosen Bot is always last.
            Object.assign(current, next, { name: target.name, bot, bots: bots.slice(-MAX_BOTS), ...boundary });
            const index = v.jobs.findIndex(j => j.id === job.id);
            for (const [i, item] of v.jobs.entries()) {
                if (item.id === job.id || i > index && item.status === 'queued' && item.kind !== 'cron' && !item.bot
                    && item.accountId === job.accountId && item.peerId === job.peerId && item.bindingId === binding.id && !service.runs.has(item.id)) {
                    item.target = next;
                }
            }
        }, { config: true });
        if (run) run.target = { cwd: session.cwd, sessionId: session.id };
    }, { bot });
}

async function handleBotSlash(service, job, slash, run, binding, control) {
    const bots = service.bots;
    const busy = () => [...service.runs.entries()].some(([key, r]) => key !== job.id && same(r.target, job.target));
    if (slash.command === '/help') return HELP;
    if (slash.command === '/status') {
        const { name, windows } = await bots.channelWindows(binding.bot.profileId);
        const window = windows.find(item => item.id === binding.bot.windowId);
        const session = await service.store.getSession(binding.cwd, binding.sessionId);
        const worker = service.supervisor.getActiveWorker(session.path);
        const others = (binding.bots || []).length - 1;
        return [`🤖 正在和 ${name} 聊 · ${windowName(window || { kind: binding.bot.main ? 'main' : 'topic' })}`,
            `⚙️ ${worker && !worker.isIdle() ? '正在忙' : '空闲'}`,
            ...(others > 0 ? [`🔗 这个聊天还连着 ${others} 个别的 Bot，发 /切换 查看`] : [])].join('\n');
    }
    if (slash.command === '/bot') {
        const list = (await bots.list()).bots.filter(item => item.enabled);
        if (!list.length) return '现在没有可用的 Bot。';
        const arg = slash.args.trim();
        if (!arg) {
            const rows = list.map((item, index) => `[${index + 1}] ${item.name}${item.id === binding.bot.profileId ? '（当前）' : ''}`);
            return `🤖 你的 Bot：\n${rows.join('\n')}\n\n发 /切换 <序号或名字> 换一个 Bot 聊。`;
        }
        const chosen = choose(list, arg, item => item.name);
        if (!chosen) return `❌ 没有找到「${arg}」。发 /切换 看看有哪些 Bot。`;
        if (Array.isArray(chosen)) return `🔍 有 ${chosen.length} 个 Bot 名字相近：${chosen.map(item => item.name).join('、')}。请发更完整的名字或序号。`;
        if (chosen.id === binding.bot.profileId && binding.bot.main) return `已经在和 ${chosen.name} 聊了。`;
        if (busy()) return '⚠️ 还有一件事在进行，等它完成或发 /stop 后再切换。';
        const target = await resolveTarget(service, chosen.id);
        await switchTo(service, job, run, binding, control, target);
        return `✅ 现在和 ${target.name} 聊。`;
    }
    if (slash.command === '/topic') {
        const { name, enabled, windows } = await bots.channelWindows(binding.bot.profileId);
        if (!enabled) return `${name} 现在不可用。发 /切换 换一个 Bot。`;
        const arg = slash.args.trim();
        if (!arg) {
            const rows = windows.map((item, index) => `[${index + 1}] ${windowName(item)}${item.id === binding.bot.windowId ? '（当前）' : ''}`);
            return `💬 ${name} 的话题：\n${rows.join('\n')}\n\n发 /话题 <序号或名字> 进入话题。新话题请在 Pivane 网页里开。`;
        }
        const chosen = ['主聊天', 'main'].includes(norm(arg)) ? windows.find(item => item.kind === 'main')
            : choose(windows, arg, item => item.kind === 'main' ? '主聊天' : item.title || '');
        if (!chosen) return `❌ 没有找到「${arg}」。发 /话题 看看有哪些话题。`;
        if (Array.isArray(chosen)) return `🔍 有 ${chosen.length} 个话题名字相近：${chosen.map(windowName).join('、')}。请发更完整的名字或序号。`;
        if (chosen.id === binding.bot.windowId) return `已经在「${windowName(chosen)}」里了。`;
        if (busy()) return '⚠️ 还有一件事在进行，等它完成或发 /stop 后再切换。';
        const target = await resolveTarget(service, binding.bot.profileId, chosen.id);
        await switchTo(service, job, run, binding, control, target);
        return `✅ 进入「${windowName(target.window)}」。`;
    }
    return `Bot 聊天里不能用 ${slash.command}。发 /help 看看能做什么。`;
}

module.exports = { handleBotSlash, HELP };
