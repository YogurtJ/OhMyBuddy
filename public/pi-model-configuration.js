/* Shared model metadata labels and pricing fields for setup and saved model editing. */
(() => {
    const t = globalThis.PiI18n?.t || ((text, ...values) => text.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? `{${index}}`));
    const SOURCES = { service: t('服务商提供'), catalog: t('参考内置目录'), family: t('同系列参考'), default: t('默认值，请核对'), unknown: t('未知'), edited: t('已手动修改') };
    const COST_FIELDS = [['input', t('输入单价')], ['output', t('输出单价')], ['cacheRead', t('缓存读取单价')], ['cacheWrite', t('缓存写入单价')]];
    function sourceText(model, key) {
        const source = key ? model.metadataSources?.[key] || model.metadata
            : Object.values(model.metadataSources || {}).includes('family') ? 'family' : model.metadata;
        if (!key && source === 'family' && model.metadataSources?.contextWindow === 'default' && model.referenceModel)
            return t('上下文使用默认值；能力参考 {0}，请核对渠道限制', model.referenceModel);
        return source === 'family' && model.referenceModel ? t('参考 {0}，尚未经此渠道确认', model.referenceModel) : SOURCES[source] || '';
    }
    function priceFields(parent, value = {}, onChange = () => {}) {
        const section = document.createElement('section'); section.className = 'cps-pricing wide';
        const title = document.createElement('strong'); title.textContent = t('模型价格 · USD / 百万 tokens');
        const help = document.createElement('p'); help.className = 'cps-help'; help.textContent = t('用于费用估算，请填写此渠道的实际单价；留空保留原值，0 表示免费。历史费用不重新计算。');
        const grid = document.createElement('div'); grid.className = 'settings-form-grid';
        const controls = {};
        for (const [key, label] of COST_FIELDS) {
            const wrapper = document.createElement('label'), name = document.createElement('span'), input = document.createElement('input');
            name.textContent = label;
            input.type = 'number'; input.min = '0'; input.max = '100000'; input.step = 'any'; input.placeholder = t('未设置');
            input.setAttribute('aria-label', label); input.dataset.price = key;
            if (Number.isFinite(value[key])) input.value = String(value[key]);
            input.addEventListener('input', onChange);
            input.addEventListener('invalid', () => {
                for (let ancestor = input.parentElement; ancestor; ancestor = ancestor.parentElement) if (ancestor.tagName === 'DETAILS') ancestor.open = true;
            });
            wrapper.append(name,input); grid.append(wrapper); controls[key] = input;
        }
        section.append(title,help,grid);
        if (value.tiers?.length) {
            const note = document.createElement('p'); note.className = 'cps-help'; note.textContent = t('已有阶梯计价保留；此处只修改基础单价。'); section.append(note);
        }
        parent.append(section);
        return {
            read() {
                const cost = {};
                for (const [key,input] of Object.entries(controls)) {
                    if (!input.value.trim()) continue;
                    if (!input.checkValidity() || !Number.isFinite(Number(input.value))) { input.reportValidity(); throw new Error(t('请填写有效的模型价格')); }
                    cost[key] = Number(input.value);
                }
                return Object.keys(cost).length ? cost : undefined;
            },
            fill(cost = {}) { for (const [key,input] of Object.entries(controls)) input.value = Number.isFinite(cost[key]) ? String(cost[key]) : ''; },
            section
        };
    }
    window.PiModelConfiguration = { sourceText, priceFields };
})();
