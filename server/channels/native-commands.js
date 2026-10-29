// Shared native controls retain worker exclusivity, submission receipts and completion proof.
function fmtTokens(n) {
    if (!Number.isFinite(n) || n < 0) return null;
    if (n >= 1000000) return `${(n / 1000000).toFixed(n >= 10000000 ? 0 : 1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return String(Math.round(n));
}
async function handleNativeControl(service, job, slash, control, busyWithOther, { bot = null } = {}) {
    if (bot && slash.command === '/compact' && slash.args.trim()) return 'Bot 使用结构化摘要，暂不接受附加压缩要求。请发送 /compact；需要长期保留的内容请写进记事本或话题说明。';
    if (slash.command === '/compact') {
        if (busyWithOther()) return '⚠️ 当前线程正在运行任务，请等待完成后再压缩上下文。';
        return control.withWorker(async (worker, rpc, state) => {
            const account = service.db.value.accounts.find(a => a.id === job.accountId);
            const stopTyping = account ? await service.startTyping(account, job.peerId) : () => Promise.resolve();
            try {
                const customInstructions = slash.args.trim().slice(0, 4000);
                await rpc('compact', customInstructions ? { customInstructions } : {}, 11 * 60 * 1000);
                const after = await rpc('get_state');
                const c = after.webCompaction;
                if (c?.status === 'unchanged') return 'ℹ️ 当前上下文无需压缩（内容较少或刚刚压缩过）。';
                if (c?.status === 'cancelled') return '⏹ 上下文压缩已取消。';
                if (c?.status === 'error') return `❌ 上下文压缩未完成：${c.errorMessage || '请稍后重试'}`;
                if (c?.status !== 'success') throw new Error('未取得本次压缩的完成凭据');
                const details = [];
                if (Number.isFinite(c?.tokensBefore)) details.push(`压缩前 ${fmtTokens(c.tokensBefore)}`);
                if (Number.isFinite(c?.estimatedTokensAfter)) details.push(`压缩后约 ${fmtTokens(c.estimatedTokensAfter)} tokens`);
                return `✅ 上下文压缩完成${details.length ? `（${details.join(' → ')}）` : ''}。`;
            } catch (error) {
                if (/Already compacted|Nothing to compact/i.test(error.message || '')) return 'ℹ️ 当前上下文无需压缩（内容较少或刚刚压缩过）。';
                if (error.code === 'CHANNEL_ADMISSION_CHANGED' || error.code === 'RPC_TIMEOUT') throw error;
                const after = await rpc('get_state').catch(() => null);
                if (after?.webCompaction?.status === 'cancelled') return '⏹ 上下文压缩已取消。';
                if (after?.webCompaction?.status === 'error') return '❌ 上下文压缩失败，请在 OhMyBuddy 网页查看详情。';
                throw error;
            } finally {
                await stopTyping();
            }
        });
    }
    if (slash.command === '/reload') {
        if (busyWithOther()) return '⚠️ 当前线程正在运行任务，请等待完成后再重新加载资源。';
        return control.withWorker(async (worker, rpc, state) => {
            const commands = await worker.reloadResources({ rpc });
            const count = commands?.commands?.length ?? 0;
            return `✅ 已重新加载当前线程的技能、提示词与扩展资源（当前可用命令 ${count} 项）。`;
        });
    }
    if (slash.command === '/confirm') {
        if (!service.mediaLabService?.chatRequests) return '⚠️ 当前实例未启用媒体卡片服务。';
        if (busyWithOther()) return '⚠️ 当前线程正在运行任务，请等待完成后再确认媒体卡片。';
        return control.withWorker(async (_worker, _rpc, _state, session) => {
            const plans = bot ? await service.bots.channelMediaPlans(bot.profileId, bot.windowId, session)
                : await readMediaPlans(service.store, session);
            control.check();
            if (!plans.length) return 'ℹ️ 当前聊天没有找到有来源凭据的媒体生成卡片。';
            const arg = slash.args.trim().toLowerCase();
            const chatReq = service.mediaLabService.chatRequests;
            const matchingPlans = arg ? plans.filter(plan => plan.id.toLowerCase().includes(arg)
                || (plan.summary || '').toLowerCase().includes(arg)) : plans;
            if (!matchingPlans.length) return 'ℹ️ 当前聊天没有找到匹配的媒体生成卡片；没有确认其他卡片。';
            if (bot && arg && matchingPlans.length > 1) return '找到多张媒体卡片，请提供完整卡片 ID 或更长的 ID 前缀。';
            let chosen = null;
            for (const plan of [...matchingPlans].reverse()) {
                const state = chatReq.publicState(plan.id);
                if (!state.attempts?.length) { chosen = plan; break; }
            }
            if (!chosen) {
                const latest = matchingPlans.at(-1);
                const latestState = latest && chatReq.publicState(latest.id)?.attempts?.at(-1);
                if (latestState?.status === 'running' || latestState?.status === 'queued') {
                    return `⏳ 媒体卡片「${latest.summary || latest.modelId}」已在${latestState.status === 'queued' ? '排队' : '生成'}中，无需重复确认。`;
                }
                if (latestState?.status === 'done') {
                    const current = service.db.value.jobs.find(j => j.id === job.id);
                    control.check();
                    if (current) service.updateJob(job.id, { mediaPlans: [{ id: latest.id, kind: latest.kind, modelId: latest.modelId, summary: latest.summary }] });
                    return `✅ 媒体卡片「${latest.summary || latest.modelId}」已完成生成。`;
                }
                return 'ℹ️ 当前线程没有待确认的媒体生成卡片。';
            }
            const account = service.db.value.accounts.find(a => a.id === job.accountId);
            const stopTyping = account ? await service.startTyping(account, job.peerId) : () => Promise.resolve();
            try {
                control.submit();
                const submitted = await chatReq.run({ key: chosen.id, modelId: chosen.modelId, parameters: chosen.parameters, confirmed: true });
                if (submitted.status === 'changed') {
                    return `⚠️ 服务端规范化了部分参数，请打开 OhMyBuddy 网页端核对卡片「${chosen.summary || chosen.modelId}」后再确认。`;
                }
                const waitMs = chosen.kind === 'video' ? 15000 : 60000;
                const state = await chatReq.waitFor(chosen.id, waitMs);
                const last = state?.attempts?.at(-1);
                const current = service.db.value.jobs.find(j => j.id === job.id);
                control.check();
                if (current) service.updateJob(job.id, { mediaPlans: [{ id: chosen.id, kind: chosen.kind, modelId: chosen.modelId, summary: chosen.summary }] });
                if (last?.status === 'done') {
                    return `✅ 已确认并完成生成：${chosen.summary || chosen.modelId}（${chosen.modelId}）。`;
                }
                if (last?.status === 'running' || last?.status === 'queued') {
                    return `🎬 已确认并开始生成：${chosen.summary || chosen.modelId}（${chosen.modelId}）。\n当前状态：${last.status === 'queued' ? '排队中' : '后台生成中'}（可在网页查看进度，或稍后发送 /confirm 查看是否完成）。`;
                }
                return `❌ 媒体生成未完成（${last?.status || 'failed'}）：${last?.error || '请打开 OhMyBuddy 网页端查看卡片详情'}`;
            } finally {
                await stopTyping();
            }
        });
    }
    return null;
}
async function readMediaPlans(store, session, verify = () => {}) {
    return store.withSessionRead(session.cwd, session.id, (_s, read) => {
        const manager = read.manager();
        verify(manager);
        const plans = manager.getBranch().filter(e => e.type === 'message' && e.message?.role === 'toolResult'
            && !e.message.isError && ['media_generate', 'media_plan_request'].includes(e.message.toolName))
            .map(e => e.message.details?.plan).filter(p => typeof p?.id === 'string' && /^plan-[0-9a-f-]{36}$/.test(p.id)).slice(-50);
        read.validate();
        return plans;
    });
}
module.exports = { fmtTokens, handleNativeControl, readMediaPlans };
