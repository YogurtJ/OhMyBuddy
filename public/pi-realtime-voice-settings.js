(() => {
    const t = globalThis.PiI18n?.t || ((text) => text);
    const node = (tag, text, className) => { const n = document.createElement(tag); if (text) n.textContent = text; if (className) n.className = className; return n; };
    const id = prefix => prefix + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
    const TURN_MODES = [
        { value: 'smart_turn_v2', label: '智能语义轮次 v2（推荐）' },
        { value: 'smart_turn', label: '智能语义轮次 v1' },
        { value: 'server_vad', label: '声学检测（Server VAD）' },
        { value: 'push_to_talk', label: '按键说话（手动提交）' }
    ];
    function create({ apiFetch }) {
        const section = document.getElementById('settings-realtime-voice');
        const body = document.getElementById('settings-realtime-voice-body');
        if (!section || !body) return;
        let snapshot, epoch = 0, busy = false;
        const action = (label, fn, primary = false) => { const b = node('button', label, primary ? 'settings-primary-button' : 'settings-secondary-button'); b.type = 'button'; b.addEventListener('click', fn); return b; };
        const message = (text, error = false) => { const p = node('p', text, error ? 'lab-error' : 'settings-help'); p.setAttribute('role', error ? 'alert' : 'status'); body.append(p); };
        const configured = () => window.dispatchEvent(new CustomEvent('realtime-voice:configured'));
        const stamp = () => ({ confirmed: true, expectedRevision: snapshot.revision });
        function field(form, label, type = 'text', value = '', choices) {
            const wrap = node('label'), title = node('span', label);
            const input = node(type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input');
            if (choices) for (const option of choices) input.append(new Option(option.label, option.value));
            if (type !== 'select' && type !== 'textarea') input.type = type;
            if (type === 'checkbox') { input.checked = Boolean(value); wrap.classList.add('boolean'); }
            else input.value = value ?? '';
            input.setAttribute('aria-label', label);
            if (type === 'textarea') { input.rows = 3; input.maxLength = 4000; }
            else if (type !== 'select' && type !== 'checkbox' && type !== 'number') input.maxLength = type === 'password' ? 32768 : 2000;
            wrap.append(title, input); form.append(wrap); return { input, wrap };
        }
        async function load() {
            const view = ++epoch; body.replaceChildren(); message(t("正在读取实时语音模型…"));
            if (window.PiSkeleton) body.innerHTML = window.PiSkeleton.html('list', { rows: 3, label: t("正在读取实时语音模型…") });
            try {
                const data = await apiFetch('/api/pi/composer/realtime-voice/settings');
                if (view !== epoch || section.hidden) return;
                snapshot = data; render();
            } catch (error) {
                if (view !== epoch || section.hidden) return;
                body.replaceChildren(); message(error.message, true); body.append(action(t("刷新列表"), load));
            }
        }
        function render() {
            body.replaceChildren();
            const available = snapshot.availableModels || [];
            const preferred = (() => { try { return localStorage.getItem('pi.web.realtimeVoiceModel'); } catch { return ''; } })();
            const control = node('div', '', 'transcription-default');
            const select = field(control, t("实时语音模型"), 'select', '', available.map(model => ({ value: model.id, label: model.name }))).input;
            select.id = 'settings-realtime-voice-model';
            if (!available.length) { select.append(new Option(t("没有可用的实时语音模型。"), '')); select.disabled = true; }
            else select.value = available.some(model => model.id === preferred) ? preferred : available[0].id;
            select.addEventListener('change', () => { try { localStorage.setItem('pi.web.realtimeVoiceModel', select.value); } catch {} configured(); });
            body.append(control);
            if (!available.length) message(t("添加实时语音模型后，点击输入框右侧通话按钮即可开始双工语音对话。"));
            else message(t("选择后自动保存到当前浏览器；语音通话由服务端安全桥接，不暴露 API Key。"));
            for (const definition of snapshot.realtimeModels || []) {
                const provider = snapshot.providers.find(item => item.id === definition.providerId);
                const row = node('article', '', 'transcription-model-row');
                const summary = [provider?.name || '', definition.remoteModel, definition.voice ? `${t("音色")} ${definition.voice}` : ''].filter(Boolean).join(' · ');
                const info = node('div'); info.append(node('strong', definition.name), node('small', summary));
                const buttons = node('div', '', 'transcription-actions');
                buttons.append(action(t("编辑"), () => edit(definition)), action(t("删除"), () => remove(definition)));
                row.append(info, buttons); body.append(row);
            }
            body.append(action(t("添加实时语音模型"), () => edit(), true));
        }
        function edit(existing) {
            const view = ++epoch; body.replaceChildren();
            const form = node('form', '', 'transcription-form');
            const provider = field(form, t("语音服务"), 'select', existing?.providerId || '', [{ value: '', label: t("新建语音服务") }, ...snapshot.providers.map(p => ({ value: p.id, label: p.name }))]);
            const remote = field(form, t("实时语音模型 ID"), 'text', existing?.remoteModel || 'qwen-audio-3.0-realtime-plus'); remote.input.required = true; remote.input.maxLength = 500;
            const name = field(form, t("显示名称"), 'text', existing?.name || ''); name.input.maxLength = 200; name.input.placeholder = t("可留空，使用模型 ID");
            const voice = field(form, t("默认音色 ID"), 'text', existing?.voice || 'longanqian'); voice.input.maxLength = 200; voice.input.placeholder = 'longanqian / longanlingxin / longanlufeng';
            const turn = field(form, t("轮次检测模式"), 'select', existing?.turnDetection || 'smart_turn_v2', TURN_MODES.map(item => ({ value: item.value, label: t(item.label) })));
            const rate = field(form, t("语速（0.5–2.0）"), 'number', existing?.speechRate ?? 1); rate.input.min = '0.5'; rate.input.max = '2'; rate.input.step = '0.1';
            const url = field(form, t("服务地址"), 'url'); url.input.placeholder = 'https://token-plan.maas.qianwenaiapi.com';
            const key = field(form, 'API Key', 'password'); key.input.autocomplete = 'new-password';
            const instructions = field(form, t("默认系统指令（可选）"), 'textarea', existing?.instructions || ''); instructions.wrap.style.gridColumn = '1 / -1';
            instructions.input.placeholder = t("例如：你是语音助手，回答简洁自然。");
            const advanced = node('details'); advanced.append(node('summary', t("协议、联网与认证")));
            const fields = node('div', '', 'transcription-form');
            const protocols = snapshot.realtimeProtocols || [{ id: 'qwen-realtime', name: '千问实时语音对话（WebSocket）' }];
            const protocol = field(fields, t("实时语音协议"), 'select', existing?.protocol || protocols[0].id, protocols.map(item => ({ value: item.id, label: t(item.name) })));
            const search = field(fields, t("开启模型内置联网搜索"), 'checkbox', Boolean(existing?.enableSearch));
            const auth = field(fields, t("认证方式"), 'select', 'bearer', [{ value: 'bearer', label: 'Bearer API Key' }, { value: 'header', label: t("自定义 Key Header") }, { value: 'none', label: t("无需 Key") }]);
            const header = field(fields, t("Key Header 名称"), 'text', 'api-key');
            advanced.append(fields); form.append(advanced);
            const hint = node('p', t("3.0 系列支持音色：longanqian、longanlingxin、longanlingxi、longanxiaoxin、longanlufeng；保存不会建立连接。"), 'settings-help');
            form.append(hint); body.append(form);
            function authView() {
                const needsKey = !provider.input.value && auth.input.value !== 'none';
                key.wrap.hidden = !needsKey; key.input.required = needsKey; key.input.disabled = !needsKey;
                header.wrap.hidden = provider.input.value !== '' || auth.input.value !== 'header';
                header.input.required = !header.wrap.hidden; header.input.disabled = header.wrap.hidden;
            }
            function providerView() {
                const selected = snapshot.providers.find(p => p.id === provider.input.value);
                url.input.value = selected?.baseUrl || ''; url.input.readOnly = Boolean(selected); url.input.required = !selected;
                auth.wrap.hidden = Boolean(selected); authView();
                hint.textContent = selected ? t("复用此服务已保存的地址和凭据；3.0 音色可选 longanqian、longanlingxin、longanlingxi、longanxiaoxin、longanlufeng。") : t("3.0 系列支持音色：longanqian、longanlingxin、longanlingxi、longanxiaoxin、longanlufeng；保存不会建立连接。");
            }
            provider.input.addEventListener('change', providerView); auth.input.addEventListener('change', authView); providerView();
            const save = action(t("保存实时语音模型"), async () => {
                if (busy || !form.reportValidity()) return;
                if (!provider.input.value && auth.input.value !== 'none' && !key.input.value.trim()) { key.input.required = true; key.input.reportValidity(); return; }
                const providerId = provider.input.value || id('speech-');
                const model = {
                    id: existing?.id || id('realtime-'),
                    providerId,
                    name: (name.input.value.trim() || remote.input.value.trim()).slice(0, 200),
                    remoteModel: remote.input.value.trim(),
                    protocol: protocol.input.value,
                    voice: voice.input.value.trim(),
                    turnDetection: turn.input.value,
                    instructions: instructions.input.value.trim(),
                    speechRate: Number(rate.input.value || 1),
                    enableSearch: Boolean(search.input.checked)
                };
                const input = { ...stamp(), model };
                if (!provider.input.value) {
                    input.provider = { id: providerId, name: (name.input.value.trim() || remote.input.value.trim()).slice(0, 200), baseUrl: url.input.value.trim(),
                        auth: auth.input.value === 'header' ? { mode: 'header', header: header.input.value.trim(), prefix: '' } : { mode: auth.input.value }, probePath: '/compatible-mode/v1/models', modelsPath: '/compatible-mode/v1/models', downloadOrigins: [] };
                    if (auth.input.value !== 'none') input.apiKey = key.input.value.trim();
                }
                key.input.value = ''; busy = true; save.disabled = true;
                try {
                    const data = await apiFetch('/api/pi/composer/realtime-voice/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
                    try { localStorage.setItem('pi.web.realtimeVoiceModel', data.modelId); } catch {}
                    configured();
                    if (view === epoch && !section.hidden) {
                        const loadingView = epoch + 1; await load();
                        if (epoch === loadingView && !section.hidden) message(t("实时语音模型已保存，可以开始语音对话。"));
                    }
                } catch (error) {
                    if (view === epoch && !section.hidden) { message(error.message + t("；请刷新列表核对保存状态后再操作。"), true); body.append(action(t("刷新列表"), load)); }
                } finally { busy = false; save.disabled = false; }
            }, true);
            form.addEventListener('submit', e => { e.preventDefault(); save.click(); });
            const buttons = node('div', '', 'transcription-actions'); buttons.append(action(t("取消"), () => { key.input.value = ''; epoch++; render(); }), save); body.append(buttons);
        }
        async function remove(model) {
            if (busy || !confirm(t("删除此实时语音模型？共享服务和凭据会保留。"))) return;
            const view = epoch; busy = true;
            try { await apiFetch('/api/pi/composer/realtime-voice/models/' + encodeURIComponent(model.id), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stamp()) }); configured(); if (view === epoch) await load(); }
            catch (error) { if (view === epoch) message(error.message, true); }
            finally { busy = false; }
        }
        function close() {
            epoch++; section.hidden = true;
            body.querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; });
            body.replaceChildren();
        }
        document.getElementById('settings-realtime-voice-refresh')?.addEventListener('click', load);
        window.addEventListener('media-connections:section', event => {
            if (event.detail?.section === 'realtime') { section.hidden = false; void load(); }
            else close();
        });
        const dialog = document.getElementById('lab-connections-dialog');
        dialog?.addEventListener('close', () => { if (!dialog.open) close(); });
        window.addEventListener('media-lab:configured', () => { if (!section.hidden) void load(); });
    }
    window.PiRealtimeVoiceSettings = { create };
})();
