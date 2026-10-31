// Scheduled execution policy. Null quotas mean metering without a hard stop.
const POLICY_VERSION = 3;
const DEFAULT_LIMITS = Object.freeze({ maxRunsPerDay: null, maxTokensPerDay: null, maxCostPerDay: null });
const DEFAULT_SETTINGS = Object.freeze({ maxConcurrent: 2 });
const legacyExecution = { maxCalls: 4, maxTokens: 32000, maxDurationSeconds: 300 };
function executionDefaults(mode = 'work') {
    return { maxCalls: null, maxTokens: null, maxCost: null,
        maxDurationSeconds: 21600, maxIdleSeconds: 900, maxRepeatedErrors: 5 };
}
const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const optionalInteger = (v, min, max) => v === null || integer(v, min, max);
const optionalCost = v => v === null || Number.isFinite(v) && v > 0 && v <= 10000;
function invalid(message) { throw Object.assign(new Error(message), { status: 400 }); }
function limits(value, defaults = DEFAULT_LIMITS) {
    const result = Object.fromEntries(Object.keys(DEFAULT_LIMITS).map(key => [key, value?.[key] === undefined ? defaults[key] : value[key]]));
    if (!optionalInteger(result.maxRunsPerDay, 1, 100000) || !optionalInteger(result.maxTokensPerDay, 1000, 1000000000000)
        || !optionalCost(result.maxCostPerDay)) invalid('Invalid daily budget');
    return result;
}
function execution(value, mode, version = POLICY_VERSION) {
    const defaults = version === 1 ? { ...legacyExecution, maxCost: null, maxIdleSeconds: null, maxRepeatedErrors: null }
        : version === 2 ? { ...executionDefaults(mode), maxCalls: mode === 'text' ? 8 : 100, maxDurationSeconds: mode === 'text' ? 300 : 3600 }
            : executionDefaults(mode);
    const result = Object.fromEntries(Object.keys(defaults).map(key => [key, value?.[key] === undefined ? defaults[key] : value[key]]));
    if (!optionalInteger(result.maxCalls, 1, 10000) || !optionalInteger(result.maxTokens, 1000, 1000000000000)
        || !optionalCost(result.maxCost) || !integer(result.maxDurationSeconds, 10, 86400)
        || !optionalInteger(result.maxIdleSeconds, 30, 86400) || !optionalInteger(result.maxRepeatedErrors, 2, 100)) invalid('Invalid execution limits');
    return result;
}
function settings(value) {
    const result = { maxConcurrent: value?.maxConcurrent ?? DEFAULT_SETTINGS.maxConcurrent };
    if (!integer(result.maxConcurrent, 1, 10)) invalid('Invalid scheduler concurrency');
    return result;
}
function minimum(...values) { const finite = values.filter(v => v !== null && v !== undefined); return finite.length ? Math.min(...finite) : null; }
function stopReason(state, usage, now = Date.now()) {
    if (now >= state.deadline) return 'time-limit';
    if (state.maxTokens != null && usage.tokens != null && usage.tokens >= state.maxTokens) return 'token-limit';
    if (state.maxCost != null && usage.calls > 0 && usage.cost === null) return 'cost-unknown';
    if (state.maxCost != null && usage.cost >= state.maxCost) return 'cost-limit';
    if (state.maxCalls != null && usage.calls >= state.maxCalls) return 'call-limit';
    return null;
}
const reasons = {
    'token-limit': ['单次 Token 上限已用尽', '调高或关闭 Token 上限后，核对已执行的操作，再手动运行。'],
    'call-limit': ['已达到模型调用次数上限', '检查任务进展，必要时调高调用次数。'],
    'cost-limit': ['本次可用费用额度已用尽', '检查单次、每日与实例费用上限。'],
    'cost-unknown': ['无法确认模型费用，已按费用策略停止', '核对模型价格与用量报告，或调整费用策略。'],
    'time-limit': ['已达到最长执行时长', '检查耗时步骤，必要时延长执行时长。'],
    'idle-limit': ['长时间未收到模型或工具进展', '检查供应商与工具连接，必要时调整停滞时长。'],
    'repeated-errors': ['相同工具连续失败，已停止重复尝试', '检查工具错误与输入，修复后再运行。'],
    'daily-runs': ['每日执行次数已用尽', '调整任务或实例的每日次数上限，或等待次日。'],
    'daily-tokens': ['每日 Token 额度不足', '调整任务或实例的每日 Token 上限，或等待次日。'],
    'daily-cost': ['每日费用额度不足或费用未知', '检查任务与实例的费用上限及模型价格。'],
    'worker-policy': ['目标线程尚未加载新的执行策略', '等待线程空闲后关闭并重新打开运行实例，再手动运行。'],
    'submission-uncertain': ['任务提交结果尚未确认', '核对线程与工具操作，确认结果后再结束待核对状态。'],
    'reconciliation-error': ['无法核对本次执行结果', '检查线程与存储状态，核对已执行的操作，勿直接重复运行。'],
    'admission-error': ['任务启动前检查失败', '根据错误详情修正目标线程、模型或身份设置，再手动运行。'],
    'model-error': ['模型请求失败', '检查模型服务、认证和网络，然后核对本次执行记录。'],
    'user-stopped': ['本次执行已被手动停止', '已执行的工具操作不会撤销。'],
    'run-limit': ['已达到旧版单次预算', '查看用量，编辑任务可切换到推荐执行策略。'],
    'worker-exited': ['运行实例已退出，执行结果待核对', '先核对线程与外部操作，勿直接重复执行。'],
    restart: ['服务重启，执行结果待核对', '先核对线程与外部操作，勿直接重复执行。']
};
function diagnostic(reason, data = {}) {
    const [title, suggestion] = reasons[reason] || ['任务未能完成', '查看运行记录与目标线程，核对已执行的操作后再处理。'];
    return { code: reason || 'execution-error', title, suggestion,
        ...(data.usage ? { usage: data.usage } : {}), ...(data.limits ? { limits: data.limits } : {}) };
}
function feedbackText(name, status, detail) {
    const quota = detail.quota;
    const quotaText = quota ? `${quota.scope === 'instance' ? '实例共享' : '此任务'}每日 ${quota.metric === 'runs' ? '次数' : quota.metric === 'cost' ? '估算美元' : 'Token'}：${quota.used} / ${quota.limit}${quota.requested != null ? `；本次需预留 ${quota.requested}` : ''}。` : '';
    const usage = detail.usage, limits = detail.limits;
    const metric = detail.code === 'token-limit' ? `Token：${usage?.tokens ?? '未知'} / ${limits?.maxTokens ?? '未知'}`
        : detail.code === 'call-limit' ? `模型调用：${usage?.calls ?? '未知'} / ${limits?.maxCalls ?? '未知'}`
        : detail.code === 'cost-limit' ? `估算美元：${usage?.cost ?? '未知'} / ${limits?.maxCost ?? '未知'}` : '';
    return [`定时任务「${String(name || '').slice(0, 120)}」${status === 'uncertain' ? '需要核对' : status === 'stopped' ? '已停止' : '执行失败'}。`,
        detail.title + '。', detail.detail, quotaText, metric, detail.suggestion].filter(Boolean).join('\n');
}
module.exports = { POLICY_VERSION, DEFAULT_LIMITS, DEFAULT_SETTINGS, executionDefaults, execution, limits, settings, minimum, stopReason, diagnostic, feedbackText };
