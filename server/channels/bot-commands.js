'use strict';
// Bot commands name durable windows and settings. Native controls share the same guarded helper
// as ordinary Pi chats; they never switch a Bot behind its window registry.
const { MAX_BOTS, windowRef, windowName, resolveTarget } = require('./bot-channel');
const { effectiveModel, sameModel } = require('../bot/bot-model');
const { fmtTokens, handleNativeControl } = require('./native-commands');
const same = (a, b) => a?.cwd === b?.cwd && a?.sessionId === b?.sessionId;
const norm = value => String(value || '').trim().toLowerCase();
const modelName = model => model ? `${model.provider}/${model.id ?? model.modelId}` : '跟随工作区默认';
const HELP = [
    '📋 Bot 聊天指令：',
    '/status — Bot、话题、模型、做事方式与等待原因；/stop — 请求停止',
    '/confirm [卡片ID前缀] — 确认媒体生成或查询结果；不是工具授权',
    '同意 A3 / 拒绝 A3 — 只回答正在等待的那一步工具授权',
    '/model [搜索或 provider/id]；/model default — 后续回复跟随默认模型',
    '/thinking [等级]；/thinking default — 后续回复跟随默认思考等级',
    '/bot（/切换）[序号或名字] — 选择 Bot',
    '/topic（/话题）[序号或名字|main] — 选择话题',
    '/new [标题] — 新建并进入话题；/name <标题> — 改当前话题标题',
    '/help advanced — 高级指令与详细状态'
].join('\n');
const ADVANCED = [HELP, '', '/status detail — 当前原生代的上下文和用量（不是整个 Bot 累计）',
    '/compact — 使用 Bot 结构化摘要压缩当前聊天；不接受附加要求',
    '/reload — 空闲时重新加载当前聊天资源',
    '/resume、/reset 不用于 Bot；请用 /topic 切换或 /new 新建话题。'].join('\n');

// All list indices are one-based, including main + 100 topics. Ambiguous names never choose by order.
function choose(items, arg, nameOf) {
    if (/^\d+$/.test(arg)) return items[Number(arg) - 1] || null;
    const q = norm(arg);
    for (const matches of [items.filter(item => norm(nameOf(item)) === q),
        items.filter(item => norm(nameOf(item)).startsWith(q)), items.filter(item => norm(nameOf(item)).includes(q))]) {
        if (matches.length) return matches.length === 1 ? matches[0] : matches;
    }
    return null;
}

async function switchTo(service, job, run, binding, control, target) {
    const bot = windowRef(target);
    await service.bots.withChannelWindow(target.profileId, target.window.id, target.session, () =>
        service.withBindingTarget(target.session.cwd, target.session.id, (session, boundary) => {
            control.submit();
            service.db.change(v => {
                const current = v.bindings.find(b => b.id === binding.id);
                if (!current) throw Object.assign(new Error('微信绑定已变化'), { status: 409 });
                const bots = [...new Set([...(current.bots || []), bot.profileId])];
                const next = { cwd: session.cwd, sessionId: session.id };
                Object.assign(current, next, { name: target.name, bot, bots: bots.slice(-MAX_BOTS), ...boundary });
                const index = v.jobs.findIndex(j => j.id === job.id);
                for (const [i, item] of v.jobs.entries()) {
                    if (item.id === job.id) { item.target = next; item.bot = { profileId: bot.profileId, windowId: bot.windowId }; }
                    else if (i > index && item.status === 'queued' && !['cron', 'bot-push', 'thread'].includes(item.kind)
                        && item.accountId === job.accountId && item.peerId === job.peerId && item.bindingId === binding.id && !service.runs.has(item.id)) {
                        item.target = next; delete item.bot;
                    }
                }
            }, { config: true });
            if (run) run.target = { cwd: session.cwd, sessionId: session.id };
        }, { bot }));
}

async function modelCommand(service, job, slash, binding, control) {
    const snapshot = await service.bots.settings(binding.bot.profileId);
    control.check();
    const bot = snapshot.bot.bot, catalog = snapshot.models, models = catalog?.models || [];
    const selected = effectiveModel(bot, catalog);
    const arg = norm(slash.args);
    const current = `🤖 Bot 模型：${modelName(bot.model)}${!bot.model && selected ? `（${modelName(selected)}）` : ''}\n🧠 独立思考等级：${bot.thinking ?? '跟随默认'}`;
    const patch = {};
    if (slash.command === '/model') {
        if (!arg || arg === 'list') return `${current}\n\n可用模型：\n${models.slice(0, 20).map(model => `- ${modelName(model)}`).join('\n') || '目录暂不可用；保留已保存的选择。'}\n\n/model <搜索或 provider/id>；/model default。对整个 Bot 的后续回复生效。`;
        if (arg === 'default') patch.model = null;
        else {
            const exact = models.filter(model => norm(modelName(model)) === arg);
            const bare = models.filter(model => norm(model.id) === arg);
            const matches = exact.length ? exact : bare.length ? bare : models.filter(model => norm(`${modelName(model)} ${model.name || ''}`).includes(arg));
            if (!matches.length) return `没有找到可用模型「${slash.args}」。已保存的模型和思考等级未改变。`;
            if (matches.length > 1) return `找到多个匹配模型，请指定完整 provider/id：\n${matches.slice(0, 20).map(model => `- ${modelName(model)}`).join('\n')}`;
            patch.model = { provider: matches[0].provider, id: matches[0].id };
        }
    } else {
        const levels = models.find(model => sameModel(model, selected))?.thinkingLevels || [];
        if (!arg || arg === 'list') return `${current}\n当前配置模型支持：${levels.join('、') || '暂无法读取'}\n\n/thinking <等级>；/thinking default。对整个 Bot 的后续回复生效。`;
        if (arg !== 'default' && !levels.includes(arg)) return `当前配置模型不支持思考等级「${slash.args}」。可选：${levels.join('、') || '暂无法读取'}；也可用 /thinking default。`;
        patch.thinking = arg === 'default' ? null : arg;
    }
    const session = await service.store.getSession(binding.cwd, binding.sessionId);
    control.check();
    await service.bots.update(binding.bot.profileId, { expectedRevision: snapshot.revision, changes: { bot: patch } },
        { beforeCommit: control.submit, source: { windowId: binding.bot.windowId, session } });
    const defaultChoice = !patch.model && slash.command === '/model' ? models.find(model => sameModel(model, effectiveModel({ model: null }, catalog))) : null;
    const warning = defaultChoice && bot.thinking && !defaultChoice.thinkingLevels.includes(bot.thinking)
        ? `\n默认模型不支持已保存的 ${bot.thinking} 思考等级；偏好仍保留，运行采用该模型支持的等级。可用 /thinking default 清除偏好。` : '';
    return `✅ 已保存 Bot 的${slash.command === '/model' ? '模型' : '思考等级'}：${slash.command === '/model' ? modelName(patch.model) : patch.thinking ?? '跟随默认'}。\n主聊天和所有话题的后续回复生效；进行中的任务保持原模型和思考等级。${warning}`;
}

async function status(service, job, slash, binding, control) {
    const { name, windows } = await service.bots.channelWindows(binding.bot.profileId);
    const window = windows.find(item => item.id === binding.bot.windowId);
    const session = await service.store.getSession(binding.cwd, binding.sessionId);
    const worker = service.supervisor.getActiveWorker(session.path);
    const running = [...service.runs.entries()].find(([id, run]) => id !== job.id && same(run.target, job.target));
    const waiting = running && service.job(running[0])?.waiting;
    const configured = await service.bots.settings(binding.bot.profileId);
    let state = null;
    if (worker) { try { state = await worker.request('get_state'); } catch {} }
    control.check();
    const bot = configured.bot.bot;
    const workStyle = { free: '放手', balanced: '稳妥', ask: '每次都问' }[bot.permissions.preset] || bot.permissions.preset;
    const lines = [`🤖 正在和 ${name} 聊 · ${windowName(window || { kind: binding.bot.main ? 'main' : 'topic' })}`,
        `⚙️ ${state?.isCompacting ? '正在压缩上下文' : waiting ? '等待交互确认：工具授权请回复对应的同意/拒绝 A编号；其他表单请打开网页' : worker && !worker.isIdle() ? '正在忙' : '空闲'}`,
        `做事方式：${workStyle}`, `配置模型：${modelName(bot.model)}${!bot.model && effectiveModel(bot, configured.models) ? `（${modelName(effectiveModel(bot, configured.models))}）` : ''}`, `独立思考等级：${bot.thinking ?? '跟随默认'}`,
        ...(state?.model ? [`当前运行模型：${modelName(state.model)}（思考：${state.thinkingLevel || '默认'}）`] : [])];
    if (norm(slash.args) === 'detail') {
        lines.push('以下仅为当前原生代，不是整个 Bot 或话题跨代累计。', `当前代：${window?.generation ?? '未知'} · ${session.id}`);
        let stats = null;
        if (worker) { try { stats = await worker.request('get_session_stats'); } catch {} }
        const usage = stats?.contextUsage;
        if (usage && Number.isFinite(usage.tokens)) lines.push(`上下文：${fmtTokens(usage.tokens)}${Number.isFinite(usage.contextWindow) ? ` / ${fmtTokens(usage.contextWindow)}` : ''} tokens`);
        if (stats?.tokens) lines.push(`本代 tokens：输入 ${fmtTokens(stats.tokens.input || 0)} / 输出 ${fmtTokens(stats.tokens.output || 0)} / 缓存 ${fmtTokens(stats.tokens.cacheRead || 0)}`);
        if (Number.isFinite(Number(stats?.cost))) lines.push(`本代费用：$${Number(stats.cost).toFixed(3)}`);
        if (!stats) lines.push('本代用量暂不可用。');
    }
    control.check();
    return lines.join('\n');
}

async function handleBotSlash(service, job, slash, run, binding, control) {
    const bots = service.bots, arg = slash.args.trim();
    const busy = async () => {
        if ([...service.runs.entries()].some(([key, r]) => key !== job.id && same(r.target, job.target))) return true;
        const session = await service.store.getSession(binding.cwd, binding.sessionId);
        const worker = service.supervisor.getActiveWorker(session.path);
        control.check();
        return Boolean(worker && !worker.isIdle());
    };
    if (slash.command === '/help') return norm(arg) === 'advanced' ? ADVANCED : HELP;
    if (slash.command === '/status') return status(service, job, slash, binding, control);
    if (['/model', '/thinking'].includes(slash.command)) return modelCommand(service, job, slash, binding, control);
    if (['/resume', '/reset'].includes(slash.command)) return `Bot 不支持 ${slash.command} 的原生线程操作。用 /topic 查看或切换已有话题，用 /new [标题] 新建并进入话题；原来的聊天记录会保留。`;
    if (slash.command === '/bot') {
        const list = (await bots.list()).bots.filter(item => item.enabled);
        if (!list.length) return '现在没有可用的 Bot。';
        if (!arg || norm(arg) === 'list') return `🤖 你的 Bot：\n${list.map((item, index) => `[${index + 1}] ${item.name}${item.id === binding.bot.profileId ? '（当前）' : ''}`).join('\n')}\n\n发 /切换 <序号或名字> 换一个 Bot 聊。`;
        const chosen = choose(list, arg, item => item.name);
        if (!chosen) return `❌ 没有找到「${arg}」。发 /切换 看看有哪些 Bot。`;
        if (Array.isArray(chosen)) return `🔍 有 ${chosen.length} 个 Bot 名字相近：${chosen.map(item => item.name).join('、')}。请发更完整的名字或序号。`;
        if (chosen.id === binding.bot.profileId && binding.bot.main) return `已经在和 ${chosen.name} 聊了。`;
        if (await busy()) return '⚠️ 还有一件事在进行，等它完成或发 /stop 后再切换。';
        const target = await resolveTarget(service, chosen.id);
        await switchTo(service, job, run, binding, control, target);
        return `✅ 现在和 ${target.name} 聊。`;
    }
    if (slash.command === '/topic') {
        const { name, enabled, windows } = await bots.channelWindows(binding.bot.profileId);
        if (!enabled) return `${name} 现在不可用。发 /切换 换一个 Bot。`;
        if (!arg || norm(arg) === 'list') return `💬 ${name} 的话题：\n${windows.map((item, index) => `[${index + 1}] ${windowName(item)}${item.id === binding.bot.windowId ? '（当前）' : ''}`).join('\n')}\n\n发 /话题 <序号或名字> 进入话题，/话题 main 回到主聊天；/new [标题] 开新话题。`;
        const chosen = ['主聊天', 'main'].includes(norm(arg)) ? windows.find(item => item.kind === 'main')
            : choose(windows, arg, item => item.kind === 'main' ? '主聊天' : item.title || '');
        if (!chosen) return `❌ 没有找到「${arg}」。发 /话题 看看有哪些话题。`;
        if (Array.isArray(chosen)) return `🔍 有 ${chosen.length} 个话题名字相近：${chosen.map(windowName).join('、')}。请发更完整的名字或序号。`;
        if (chosen.id === binding.bot.windowId) return `已经在「${windowName(chosen)}」里了。`;
        if (await busy()) return '⚠️ 还有一件事在进行，等它完成或发 /stop 后再切换。';
        const target = await resolveTarget(service, binding.bot.profileId, chosen.id);
        await switchTo(service, job, run, binding, control, target);
        return `✅ 进入「${windowName(target.window)}」。`;
    }
    if (slash.command === '/new' || slash.command === '/name') {
        if (slash.command === '/name' && binding.bot.main) return '主聊天的名字属于 Bot。请到 Bot 设置修改 Bot 名字；/name <标题> 只改当前话题。';
        if (slash.command === '/name' && !arg) return '请提供话题标题，例如 /name 旅行计划。';
        if (await busy()) return '⚠️ 当前聊天正忙，请等待完成或发 /stop 后再修改话题。';
        const session = await service.store.getSession(binding.cwd, binding.sessionId);
        const revision = (await bots.windows.read(binding.bot.profileId)).revision;
        control.check();
        if (slash.command === '/name') {
            const saved = await bots.updateWindow(binding.bot.profileId, binding.bot.windowId, { title: arg, expectedRevision: revision },
                { source: session, beforeCommit: control.submit });
            return `✅ 已将当前话题重命名为：${saved.window.title}`;
        }
        const saved = await bots.createChannelTopic(binding.bot.profileId, { requestId: JSON.stringify([job.accountId, job.peerId, job.id]),
            title: arg || '新话题', windowId: binding.bot.windowId, session, expectedRevision: revision }, control.submit);
        const target = await resolveTarget(service, binding.bot.profileId, saved.window.id);
        await switchTo(service, job, run, binding, control, target);
        return `✅ 已新建并进入「${windowName(target.window)}」。原话题和主聊天记录已保留。`;
    }
    if (['/confirm', '/compact', '/reload'].includes(slash.command)) {
        if (await busy()) return '⚠️ 当前聊天正忙，请等待完成或发 /stop 后再执行。';
        return handleNativeControl(service, job, slash, control, () => false, { bot: binding.bot });
    }
    return `Bot 聊天里不能用 ${slash.command}。发 /help 看看能做什么。`;
}
module.exports = { handleBotSlash, HELP, ADVANCED };
