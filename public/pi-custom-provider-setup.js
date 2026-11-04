/* Custom chat providers: one-step setup and model discovery. Discovery is a read-only
 * server request; nothing is saved until the user confirms the form. */
(() => {
    'use strict';
    const translateUi = globalThis.PiI18n?.t || ((text, ...values) => text.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? `{${index}}`));
    const APIS = [['openai-completions', 'OpenAI Chat Completions'], ['openai-responses', 'OpenAI Responses'], ['anthropic-messages', 'Anthropic Messages'], ['google-generative-ai', 'Google Gemini']];
    const LIMITS = { contextWindow: [1024, 4000000], maxTokens: [1, 1000000] };
    const DEFAULTS = { contextWindow: 128000, maxTokens: 16384 };
    const PREFERRED = ['openai', 'anthropic', 'google', 'xai', 'deepseek', 'mistral', 'moonshotai', 'zai', 'minimax', 'xiaomi'];
    const PAGE = 150;
    const GROUPS = [
        ['chat', ['chat'], translateUi("对话模型")], ['image', ['image'], translateUi("图像")], ['video', ['video'], translateUi("视频")],
        ['tts', ['tts'], translateUi("语音合成")], ['asr', ['asr'], translateUi("语音识别")],
        ['other', ['embedding', 'rerank', 'moderation', 'realtime'], translateUi("其他")]
    ];
    const KINDS = { image: translateUi("图像生成"), video: translateUi("视频生成"), tts: translateUi("语音合成"), asr: translateUi("语音识别"),
        embedding: translateUi("向量"), rerank: translateUi("重排序"), moderation: translateUi("内容审核"), realtime: translateUi("实时音频") };
    const SOURCES = { service: translateUi("服务商提供"), catalog: translateUi("参考内置目录"), default: translateUi("默认值，请核对"), edited: translateUi("已手动修改") };

    function node(tag, className = '', text = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }
    function button(label, className = 'settings-secondary-button') {
        const element = node('button', className, label);
        element.type = 'button';
        return element;
    }
    function iconButton(icon, label) {
        const element = button('', 'icon-btn subtle');
        const glyph = node('i', `fa-solid ${icon}`); glyph.setAttribute('aria-hidden', 'true');
        element.append(glyph); element.setAttribute('aria-label', label); element.title = label;
        return element;
    }
    function field(parent, label, type, options = {}) {
        const wrapper = node('label', options.wide ? 'wide' : '');
        wrapper.append(node('span', '', label));
        const control = node(type === 'select' ? 'select' : 'input');
        if (type === 'select') for (const [value, text] of options.choices) control.append(new Option(text, value));
        else control.type = type;
        for (const key of ['name', 'placeholder', 'autocomplete', 'pattern', 'min', 'max', 'step']) if (options[key] !== undefined) control.setAttribute(key, options[key]);
        if (options.maxLength) control.maxLength = options.maxLength;
        if (options.required) control.required = true;
        if (options.value !== undefined) control.value = options.value;
        if (type === 'text' || type === 'url' || type === 'password') control.spellcheck = false;
        wrapper.append(control);
        if (options.help) wrapper.append(node('small', 'cps-help', options.help));
        parent.append(wrapper);
        return control;
    }
    function formatTokens(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '--';
        if (number >= 1000000) return `${Number((number / 1000000).toFixed(2))}M`;
        if (number >= 1000) return `${Math.round(number / 1000)}k`;
        return String(number);
    }
    function suggestApi(value) {
        let url;
        try { url = new URL(value); } catch { return null; }
        if (url.hostname === 'generativelanguage.googleapis.com') return 'google-generative-ai';
        if (/anthropic/i.test(url.hostname) || /\/anthropic\/?$/i.test(url.pathname)) return 'anthropic-messages';
        return null;
    }
    function failureText(result) {
        const status = result.httpStatus || '';
        const text = {
            auth: translateUi("服务商拒绝了这个 API Key（HTTP {0}）。请检查 Key 是否正确。", status),
            not_found: translateUi("这个地址没有提供模型列表（HTTP {0}）。请核对 API 地址和接口协议，或手动输入模型 ID。", status),
            redirect: translateUi("服务商返回了重定向（HTTP {0}），为保护 Key 未继续请求。请填写最终的 API 地址。", status),
            timeout: translateUi("获取模型列表超时。请检查网络或代理设置，或手动输入模型 ID。"),
            network: translateUi("无法连接到服务商。请检查 API 地址和网络代理设置。"),
            too_large: translateUi("模型列表过大，无法读取。请手动输入模型 ID。"),
            invalid: translateUi("服务商返回的不是可识别的模型列表。请手动输入模型 ID。"),
            http: translateUi("服务商返回错误（HTTP {0}）。请稍后重试，或手动输入模型 ID。", status)
        }[result.reason] || translateUi("获取模型列表失败。请手动输入模型 ID。");
        return result.detail ? `${text} ${translateUi("服务商说明：{0}", result.detail)}` : text;
    }
    function validModelId(id) { return id.length > 0 && id.length <= 500 && !/[\u0000-\u0020\u007f]/.test(id); }

    function create(host) {
        const { apiFetch, toast } = host;

        // Exact IDs from the local built-in catalog; the last segment covers relay prefixes.
        function catalogLookup(id) {
            const models = host.snapshot()?.models || [];
            const rank = model => { const index = PREFERRED.indexOf(model.provider); return index < 0 ? PREFERRED.length : index; };
            const pick = list => list.sort((a, b) => rank(a) - rank(b))[0];
            const suffix = id.split('/').pop();
            const model = pick(models.filter(item => item.id === id)) || pick(models.filter(item => item.id.split('/').pop() === suffix));
            if (!model) return null;
            const contextWindow = Math.min(LIMITS.contextWindow[1], Math.max(LIMITS.contextWindow[0], Number(model.contextWindow) || DEFAULTS.contextWindow));
            return { contextWindow, maxTokens: Math.min(contextWindow, Math.max(1, Number(model.maxTokens) || DEFAULTS.maxTokens)),
                imageInput: Array.isArray(model.input) && model.input.includes('image'), reasoning: Boolean(model.reasoning) };
        }
        function chatEntry(model) {
            if (model.kind === 'chat' && model.contextWindow) return { id: model.id, name: model.name !== model.id ? model.name : '',
                contextWindow: model.contextWindow, maxTokens: model.maxTokens, imageInput: Boolean(model.imageInput), reasoning: Boolean(model.reasoning), metadata: model.metadata || 'default' };
            const known = catalogLookup(model.id);
            return { id: model.id, name: model.name && model.name !== model.id ? model.name : '', ...(known || { ...DEFAULTS, imageInput: false, reasoning: false }), metadata: known ? 'catalog' : 'default' };
        }
        function metaText(entry) {
            const parts = [translateUi("上下文 {0}", formatTokens(entry.contextWindow)), translateUi("最大输出 {0}", formatTokens(entry.maxTokens))];
            if (entry.imageInput) parts.push(translateUi("图片输入"));
            if (entry.reasoning) parts.push(translateUi("推理"));
            return parts.join(' · ');
        }

        function openPicker(result, { selectedIds, onConfirm, returnFocus }) {
            const dialog = node('dialog', 'cps-picker');
            dialog.setAttribute('aria-labelledby', 'cps-picker-title');
            const kinds = new Map(result.models.map(model => [model.id, model.kind]));
            const chosen = new Set(result.models.filter(model => selectedIds.has(model.id) && !model.added).map(model => model.id));
            const groupOf = id => GROUPS.find(([, members]) => members.includes(kinds.get(id)))?.[0] || 'other';
            let active = 'chat', query = '', limit = PAGE;
            if (!result.models.some(model => groupOf(model.id) === 'chat')) active = GROUPS.find(([id]) => result.models.some(model => groupOf(model.id) === id))?.[0] || 'chat';

            const header = node('header', 'cps-picker-header');
            const heading = node('div');
            const title = node('h2', '', translateUi("选择要添加的模型")); title.id = 'cps-picker-title';
            const summary = translateUi("从 {0} 获取到 {1} 个模型。默认都不勾选，只添加你需要的。", result.endpoint, result.models.length);
            heading.append(title, node('p', 'cps-picker-sub', result.truncated ? `${summary} ${translateUi("列表过长，只显示前 {0} 个。", result.models.length)}` : summary));
            const close = iconButton('fa-xmark', translateUi("关闭"));
            header.append(heading, close);
            const search = node('input', 'cps-picker-search');
            search.type = 'search'; search.placeholder = translateUi("搜索模型 ID 或名称"); search.setAttribute('aria-label', translateUi("搜索模型 ID 或名称")); search.autocomplete = 'off'; search.spellcheck = false;
            const tabs = node('div', 'cps-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', translateUi("模型类型"));
            const note = node('p', 'cps-picker-note');
            const toolbar = node('div', 'cps-picker-toolbar');
            const all = button('');
            const count = node('span', 'cps-picker-count'); count.setAttribute('aria-live', 'polite');
            toolbar.append(all, count);
            const list = node('div', 'cps-picker-list');
            const more = button(translateUi("显示更多"), 'settings-secondary-button cps-more');
            const footer = node('footer', 'cps-picker-footer');
            const hint = node('small', 'cps-picker-hint', translateUi("类型依据服务商返回的信息、内置目录或模型名称判断，可能不准确；分错时可改为对话模型。"));
            const actions = node('div', 'cps-picker-actions');
            const cancel = button(translateUi("取消"));
            const confirm = button('', 'settings-primary-button');
            actions.append(cancel, confirm); footer.append(hint, actions);
            dialog.append(header, search, tabs, note, toolbar, list, footer);

            const matches = () => result.models.filter(model => groupOf(model.id) === active
                && (!query || `${model.id} ${model.name}`.toLowerCase().includes(query)));
            function renderCounts() {
                const selectable = active === 'chat' ? matches().filter(model => !model.added) : [];
                const allChosen = selectable.length > 0 && selectable.every(model => chosen.has(model.id));
                all.hidden = !selectable.length;
                all.textContent = allChosen ? translateUi("取消全选当前结果") : translateUi("全选当前结果（{0}）", selectable.length);
                count.textContent = translateUi("已选 {0} 个", chosen.size);
                confirm.textContent = translateUi("添加所选（{0}）", chosen.size);
                confirm.disabled = !chosen.size;
            }
            function renderTabs() {
                tabs.replaceChildren();
                for (const [id, , label] of GROUPS) {
                    const total = result.models.filter(model => groupOf(model.id) === id).length;
                    if (!total && id !== 'chat') continue;
                    const tab = button(`${label} ${total}`, 'cps-tab');
                    tab.dataset.group = id; tab.setAttribute('aria-pressed', String(id === active));
                    tab.addEventListener('click', () => { active = id; limit = PAGE; render(); tabs.querySelector(`[data-group="${id}"]`)?.focus(); });
                    tabs.append(tab);
                }
            }
            function chatRow(model) {
                const row = node('label', 'cps-row');
                const box = node('input'); box.type = 'checkbox';
                box.checked = model.added || chosen.has(model.id); box.disabled = Boolean(model.added);
                box.addEventListener('change', () => { if (box.checked) chosen.add(model.id); else chosen.delete(model.id); renderCounts(); });
                const main = node('span', 'cps-row-main');
                main.append(node('code', '', model.id));
                const info = [model.name && model.name !== model.id ? model.name : '',
                    model.contextWindow ? formatTokens(model.contextWindow) : '', model.imageInput ? translateUi("图片输入") : '', model.reasoning ? translateUi("推理") : ''].filter(Boolean).join(' · ');
                if (info) main.append(node('small', '', info));
                row.append(box, main);
                if (model.added) row.append(node('span', 'settings-badge', translateUi("已添加")));
                return row;
            }
            function otherRow(model) {
                const row = node('div', 'cps-row cps-row-other');
                const main = node('span', 'cps-row-main');
                main.append(node('code', '', model.id));
                if (model.name && model.name !== model.id) main.append(node('small', '', model.name));
                const move = button(translateUi("改为对话模型"), 'settings-secondary-button cps-move');
                move.setAttribute('aria-label', translateUi("把 {0} 改为对话模型", model.id));
                move.addEventListener('click', () => { kinds.set(model.id, 'chat'); if (!model.added) chosen.add(model.id); render(); (list.querySelector('button') || search).focus(); });
                row.append(main, node('span', 'settings-badge', KINDS[kinds.get(model.id)] || translateUi("其他")), move);
                return row;
            }
            function render() {
                renderTabs();
                note.textContent = active === 'chat' ? translateUi("勾选要加入聊天模型列表的模型。已添加的模型不会重复添加。")
                    : active === 'other' ? translateUi("向量、重排序、内容审核和实时音频模型不能用于对话，也不会加入聊天模型列表。")
                        : translateUi("这些模型不能用于对话，不会加入聊天模型列表。图像、视频和语音模型请到“模型与能力”中添加。");
                const items = matches();
                list.replaceChildren(...items.slice(0, limit).map(model => active === 'chat' ? chatRow(model) : otherRow(model)));
                if (!items.length) list.append(node('p', 'cps-empty', query ? translateUi("没有匹配的模型。") : translateUi("这一类没有模型。")));
                more.hidden = items.length <= limit;
                if (!more.hidden) list.append(more);
                renderCounts();
            }
            search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); limit = PAGE; render(); });
            more.addEventListener('click', () => { limit += PAGE; render(); });
            all.addEventListener('click', () => {
                const selectable = matches().filter(model => !model.added);
                const allChosen = selectable.every(model => chosen.has(model.id));
                for (const model of selectable) { if (allChosen) chosen.delete(model.id); else chosen.add(model.id); }
                render(); all.focus();
            });
            close.addEventListener('click', () => dialog.close());
            cancel.addEventListener('click', () => dialog.close());
            confirm.addEventListener('click', () => {
                const picked = result.models.filter(model => chosen.has(model.id) && groupOf(model.id) === 'chat').map(model => ({ ...model, kind: kinds.get(model.id) }));
                onConfirm(picked, new Set(result.models.map(model => model.id)));
                dialog.close();
            });
            dialog.addEventListener('close', () => { dialog.remove(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); });
            document.body.append(dialog);
            render();
            dialog.showModal();
            (matchMedia('(pointer: coarse)').matches ? close : search).focus();
            return dialog;
        }

        function modelSection({ intro, existingIds = new Set(), request }) {
            const selected = new Map();
            const root = node('section', 'cps-models');
            const head = node('div', 'cps-models-head');
            const title = node('strong', '', translateUi("模型"));
            const count = node('span', 'cps-models-count');
            head.append(title, count);
            const fetchRow = node('div', 'cps-fetch');
            const fetchButton = button(translateUi("获取可用模型"), 'settings-primary-button cps-fetch-button');
            fetchButton.dataset.cpsFetch = '';
            const reopen = button(translateUi("从列表选择"));
            reopen.hidden = true;
            fetchRow.append(fetchButton, reopen);
            const status = node('p', 'cps-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
            const list = node('ul', 'cps-selected');
            const empty = node('p', 'cps-empty', intro);
            const manual = node('div', 'cps-manual');
            const input = node('input');
            input.type = 'text'; input.placeholder = translateUi("手动输入模型 ID"); input.setAttribute('aria-label', translateUi("手动输入模型 ID"));
            input.maxLength = 500; input.autocomplete = 'off'; input.spellcheck = false;
            const add = button(translateUi("添加"));
            manual.append(input, add);
            root.append(head, fetchRow, status, list, empty, manual);
            let token = 0, lastResult = null;
            const setStatus = (text, tone = '') => { status.textContent = text; status.dataset.tone = tone; };

            function numberField(parent, label, entry, key) {
                const control = field(parent, label, 'number', { min: LIMITS[key][0], max: LIMITS[key][1], step: 1, value: entry[key] });
                control.addEventListener('change', () => {
                    const value = Number(control.value);
                    if (Number.isSafeInteger(value) && value >= LIMITS[key][0] && value <= LIMITS[key][1]) entry[key] = value;
                    else control.value = entry[key];
                });
                return control;
            }
            function row(entry) {
                const item = node('li', 'cps-selected-row');
                const details = node('details');
                const summary = node('summary');
                const main = node('span', 'cps-sel-main');
                const meta = node('small');
                const refresh = () => { meta.textContent = [entry.name, metaText(entry), SOURCES[entry.metadata]].filter(Boolean).join(' · '); };
                main.append(node('code', '', entry.id), meta);
                summary.append(main);
                const fields = node('div', 'cps-sel-fields settings-form-grid');
                const name = field(fields, translateUi("显示名称"), 'text', { value: entry.name, maxLength: 200, placeholder: translateUi("默认使用模型 ID"), wide: true });
                name.addEventListener('input', () => { entry.name = name.value.trim(); refresh(); });
                numberField(fields, translateUi("上下文窗口"), entry, 'contextWindow');
                numberField(fields, translateUi("最大输出 Tokens"), entry, 'maxTokens');
                for (const [key, label] of [['imageInput', translateUi("支持图片输入")], ['reasoning', translateUi("支持推理")]]) {
                    const wrapper = node('label', 'settings-checkbox-field');
                    const box = node('input'); box.type = 'checkbox'; box.checked = entry[key];
                    box.addEventListener('change', () => { entry[key] = box.checked; refresh(); });
                    wrapper.append(box, node('span', '', label)); fields.append(wrapper);
                }
                fields.addEventListener('change', () => { entry.metadata = 'edited'; refresh(); });
                details.append(summary, fields);
                const remove = iconButton('fa-xmark', translateUi("移除 {0}", entry.id));
                remove.addEventListener('click', () => { selected.delete(entry.id); render(); input.focus(); });
                item.append(details, remove);
                refresh();
                return item;
            }
            function render() {
                count.textContent = selected.size ? translateUi("已选 {0} 个", selected.size) : '';
                list.replaceChildren(...[...selected.values()].map(row));
                list.hidden = empty.hidden = false;
                if (selected.size) empty.hidden = true; else list.hidden = true;
            }
            function addManual() {
                const id = input.value.trim();
                if (!id) return true;
                if (!validModelId(id)) { setStatus(translateUi("模型 ID 不能包含空格或控制字符，且不超过 500 个字符。"), 'error'); input.focus(); return false; }
                if (existingIds.has(id)) { setStatus(translateUi("“{0}”已在此服务商中。", id), 'error'); input.focus(); return false; }
                if (!selected.has(id)) selected.set(id, chatEntry({ id, name: '', kind: 'manual' }));
                input.value = ''; setStatus(''); render();
                return true;
            }
            input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addManual(); } });
            add.addEventListener('click', () => { addManual(); input.focus(); });
            function showPicker() {
                openPicker(lastResult, { selectedIds: new Set(selected.keys()), returnFocus: fetchButton, onConfirm(picked, listed) {
                    if (!root.isConnected) return;
                    const pickedIds = new Set(picked.map(model => model.id));
                    for (const id of [...selected.keys()]) if (listed.has(id) && !pickedIds.has(id)) selected.delete(id);
                    for (const model of picked) if (!selected.has(model.id)) selected.set(model.id, chatEntry(model));
                    render();
                    setStatus(picked.length ? translateUi("已选择 {0} 个模型。展开模型可核对上下文和能力。", picked.length) : '', picked.length ? 'success' : '');
                } });
            }
            fetchButton.addEventListener('click', async () => {
                const target = request();
                if (!target) return;
                const current = ++token;
                host.setBusy(fetchButton, true, translateUi("获取中"));
                setStatus(translateUi("正在获取模型列表…"));
                try {
                    const result = await apiFetch(target.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(target.body) });
                    if (current !== token || !root.isConnected) return;
                    if (!result.ok) { setStatus(failureText(result), 'error'); return; }
                    if (!result.models.length) { setStatus(translateUi("服务商没有返回任何模型。请手动输入模型 ID。"), 'error'); return; }
                    lastResult = { ...result, models: result.models.map(model => existingIds.has(model.id) ? { ...model, added: true } : model) };
                    reopen.hidden = false;
                    setStatus(translateUi("已获取 {0} 个模型。", result.models.length), 'success');
                    showPicker();
                } catch (error) {
                    if (current === token && root.isConnected) setStatus(error.message, 'error');
                } finally { host.setBusy(fetchButton, false); }
            });
            reopen.addEventListener('click', () => { if (lastResult) showPicker(); });
            render();
            return {
                root, fetchButton, setStatus, addManual,
                // Changed connection fields make an earlier list or in-flight result stale.
                invalidate() { token++; lastResult = null; reopen.hidden = true; if (status.dataset.tone !== 'error' || status.textContent) setStatus(''); },
                collect: () => [...selected.values()].map(entry => ({ id: entry.id, ...(entry.name ? { name: entry.name } : {}),
                    contextWindow: entry.contextWindow, maxTokens: entry.maxTokens, imageInput: entry.imageInput, reasoning: entry.reasoning }))
            };
        }

        function actions(form, submitLabel) {
            const error = node('p', 'cps-error'); error.setAttribute('role', 'alert');
            const row = node('div', 'settings-form-actions');
            const cancel = button(translateUi("取消"), '');
            cancel.addEventListener('click', () => host.closeEditor());
            const submit = node('button', 'settings-primary-button', submitLabel); submit.type = 'submit';
            row.append(cancel, submit);
            form.append(error, row);
            return { error, submit };
        }

        function openCreate() {
            host.openEditor(translateUi("添加自定义服务商"), '');
            const epoch = host.editorEpoch();
            const form = node('form', 'settings-form cps-form'); form.id = 'settings-provider-form';
            form.append(node('p', 'cps-intro', translateUi("连接中转站、自部署服务，或兼容 OpenAI / Anthropic / Gemini 协议的接口。Key 由 Pi 保存，不会回显。")));
            const grid = node('div', 'settings-form-grid');
            const name = field(grid, translateUi("名称"), 'text', { name: 'name', required: true, maxLength: 200, placeholder: translateUi("例如：我的中转站"), wide: true });
            const baseUrl = field(grid, translateUi("API 地址"), 'url', { name: 'baseUrl', required: true, maxLength: 2000, placeholder: 'https://api.example.com/v1', wide: true,
                help: translateUi("填写服务商文档中的 Base URL，OpenAI 兼容接口通常以 /v1 结尾。") });
            const api = field(grid, translateUi("接口协议"), 'select', { name: 'api', choices: APIS });
            const key = field(grid, 'API Key', 'password', { name: 'apiKey', autocomplete: 'new-password', maxLength: 32768, placeholder: translateUi("无需认证的本地服务可留空") });
            const section = modelSection({ intro: translateUi("还没有添加模型。填好地址和 Key 后点击“获取可用模型”，或在下方手动输入模型 ID。"), request: () => {
                if (!baseUrl.value.trim() || !baseUrl.checkValidity()) { baseUrl.reportValidity(); return null; }
                return { url: '/api/pi/settings/custom-providers/discover-models', body: { api: api.value, baseUrl: baseUrl.value.trim(), apiKey: key.value, authHeader: auth.checked } };
            } });
            const advanced = node('details', 'cps-advanced');
            advanced.append(node('summary', '', translateUi("高级设置")));
            const advancedGrid = node('div', 'settings-form-grid');
            const id = field(advancedGrid, translateUi("服务商 ID"), 'text', { name: 'id', maxLength: 200, pattern: '[A-Za-z0-9._\\-]+', placeholder: translateUi("留空时按名称自动生成"), wide: true,
                help: translateUi("在配置文件和模型名称中标识此服务商，只能用字母、数字、点、下划线和连字符，创建后不能修改。") });
            const authLabel = node('label', 'settings-checkbox-field wide');
            const auth = node('input'); auth.type = 'checkbox'; auth.name = 'authHeader';
            authLabel.append(auth, node('span', '', translateUi("额外添加 Authorization: Bearer 请求头")));
            advancedGrid.append(authLabel, node('small', 'cps-help wide', translateUi("仅在服务商文档要求时开启。")));
            advanced.append(advancedGrid);
            form.append(grid, section.root, advanced);
            const { error, submit } = actions(form, translateUi("创建服务商"));
            host.body().append(form);
            let apiChosen = false;
            api.addEventListener('change', () => { apiChosen = true; section.invalidate(); });
            baseUrl.addEventListener('input', () => { section.invalidate(); const suggested = suggestApi(baseUrl.value.trim()); if (!apiChosen && suggested) api.value = suggested; });
            key.addEventListener('input', () => section.invalidate());
            auth.addEventListener('change', () => section.invalidate());
            setTimeout(() => { if (host.editorEpoch() === epoch && !matchMedia('(pointer: coarse)').matches) name.focus(); }, 0);
            form.addEventListener('submit', async event => {
                event.preventDefault(); error.textContent = '';
                if (!id.checkValidity()) advanced.open = true;
                if (!form.reportValidity() || !section.addManual()) return;
                const models = section.collect();
                if (!models.length) { error.textContent = translateUi("请至少添加一个模型：点击“获取可用模型”，或手动输入模型 ID。"); return; }
                const payload = { name: name.value.trim(), baseUrl: baseUrl.value.trim(), api: api.value, apiKey: key.value, authHeader: auth.checked, models,
                    ...(id.value.trim() ? { id: id.value.trim() } : {}) };
                host.setBusy(submit, true, translateUi("创建中"));
                try {
                    const result = await apiFetch('/api/pi/settings/custom-providers/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    key.value = '';
                    if (host.editorEpoch() === epoch) host.closeEditor();
                    if (result.credential === 'failed') toast(translateUi("服务商和模型已保存，但 API Key 保存失败：{0}。请在服务商列表中重新配置 API Key。", result.credentialError || ''), 'error', 9000);
                    else toast(result.credential === 'saved' ? translateUi("已添加服务商“{0}”和 {1} 个模型，新会话可以直接选择。", payload.name, result.modelCount)
                        : translateUi("已添加服务商“{0}”和 {1} 个模型。未填写 API Key；如需认证，请在服务商列表中配置。", payload.name, result.modelCount), 'success', 6500);
                    await host.saved(result.providerId);
                } catch (failure) {
                    if (host.editorEpoch() === epoch) error.textContent = failure.status ? failure.message : translateUi("{0}。请刷新服务商列表核对是否已创建；不会自动重试。", failure.message);
                } finally { host.setBusy(submit, false); }
            });
        }

        function openAddModels(providerId) {
            const provider = host.snapshot()?.providers.find(item => item.id === providerId);
            const label = provider?.name || providerId;
            const existingIds = new Set(host.customProvider(providerId)?.models.map(model => model.id) || []);
            host.openEditor(translateUi("为“{0}”添加模型", label), '');
            const epoch = host.editorEpoch();
            const form = node('form', 'settings-form cps-form'); form.id = 'settings-add-models-form';
            form.append(node('p', 'cps-intro', translateUi("从服务商获取可用模型后勾选，或手动输入模型 ID。获取列表使用此服务商已保存的 API Key。")));
            const section = modelSection({ intro: translateUi("还没有选择模型。点击“获取可用模型”，或在下方手动输入模型 ID。"), existingIds,
                request: () => ({ url: `/api/pi/settings/custom-providers/${encodeURIComponent(providerId)}/discover-models`, body: {} }) });
            const detailed = node('p', 'cps-help');
            const detailedButton = button(translateUi("使用详细表单添加单个模型"), 'cps-link');
            detailedButton.addEventListener('click', () => host.openModelEditor(providerId));
            detailed.append(detailedButton);
            form.append(section.root, detailed);
            const { error, submit } = actions(form, translateUi("添加模型"));
            host.body().append(form);
            form.addEventListener('submit', async event => {
                event.preventDefault(); error.textContent = '';
                if (!section.addManual()) return;
                const models = section.collect();
                if (!models.length) { error.textContent = translateUi("请至少选择一个模型：点击“获取可用模型”，或手动输入模型 ID。"); return; }
                host.setBusy(submit, true, translateUi("保存"));
                try {
                    const result = await apiFetch(`/api/pi/settings/custom-providers/${encodeURIComponent(providerId)}/models/batch`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ models }) });
                    if (host.editorEpoch() === epoch) host.closeEditor();
                    toast(translateUi("已为“{0}”添加 {1} 个模型，新会话可以直接选择。", label, result.modelCount), 'success', 6500);
                    await host.saved(providerId);
                } catch (failure) {
                    if (host.editorEpoch() === epoch) error.textContent = failure.status ? failure.message : translateUi("{0}。请刷新服务商列表核对是否已保存；不会自动重试。", failure.message);
                } finally { host.setBusy(submit, false); }
            });
            // Listing is a read-only GET, so start it immediately and go straight to the picker.
            section.fetchButton.click();
        }

        return { openCreate, openAddModels };
    }
    window.PiCustomProviderSetup = { create };
})();
