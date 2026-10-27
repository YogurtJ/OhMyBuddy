(() => {
    // The Bot settings sheet: everything that makes one Bot who it is, in plain words.
    // It saves only what changed, against the revision it was opened at; when something
    // changed elsewhere it rereads, keeps the user's edits and asks to save again.
    const translateUi = globalThis.PiI18n?.t || ((text, ...values) => text.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? `{${index}}`));
    const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };
    const icon = name => { const i = el('i', `fa-solid ${name}`); i.setAttribute('aria-hidden', 'true'); return i; };
    const button = (className, text) => { const b = el('button', className, text); b.type = 'button'; return b; };
    const LIMITS = { name: 40, avatar: 16, job: 500, soul: 6000 };
    const PRESETS = [
        ['free', () => translateUi("放手"), () => translateUi("大部分事直接办好。删东西、改系统配置、对外发消息、花钱多的事会先问你。")],
        ['balanced', () => translateUi("稳妥"), () => translateUi("查资料、记东西、在工作目录里写文件直接做；运行命令、改工作目录以外的文件、交给别的助手前，会弹出确认等你允许。")],
        ['ask', () => translateUi("每次都问"), () => translateUi("除了看和回答，每一步动手前都会弹出确认，等你允许。")]
    ];
    const THINKING = { off: () => translateUi("不启用"), minimal: () => translateUi("极简"), low: () => translateUi("低"), medium: () => translateUi("中"),
        high: () => translateUi("高"), xhigh: () => translateUi("极高"), max: () => translateUi("最大") };
    const modelKey = model => model ? `${model.provider}\u0000${model.id}` : '';
    // From pi-bot.js where it is loaded; otherwise the boxes keep their rows and scroll.
    const fitTextarea = area => window.PiBot?.fitTextarea?.(area);
    // Why the server would not move a Bot to the trash (nothing was changed).
    const TRASH_BLOCKED = {
        BOT_HAS_SCHEDULES: name => translateUi("还有定时任务发给 {0}。先在“定时”页改掉或取消它们。", name),
        BOT_HAS_DEFERRED: name => translateUi("{0} 还有等着稍后发送的消息。等它们发出或取消后再试。", name),
        BOT_WORK_PENDING: name => translateUi("{0} 还在忙（回复、排队或后台工作）。等它停下再试。", name),
        SESSION_QUEUE_RECOVERY: name => translateUi("{0} 的聊天里还有等待取回的排队内容。先在聊天里处理它们。", name),
        BOT_WINDOW_ROTATING: name => translateUi("{0} 的聊天正在接续到新的会话文件，稍等一下再试。", name),
        BOT_WINDOW_STALE: name => translateUi("{0} 的聊天刚刚有变化，和记录对不上。稍等一下再试；一直这样可以刷新页面。", name),
        BOT_TRASH_UNAVAILABLE: () => translateUi("回收站前的检查暂时还没准备好，稍后再试。"),
        BOT_ACTIVITY_UNAVAILABLE: () => translateUi("定时任务的检查暂时还没准备好，稍后再试。"),
        BOT_NOT_FOUND: name => translateUi("找不到 {0} 了，可能已在别处移到回收站。", name)
    };

    let dialog = null;

    function field(label, control, hint) {
        const wrap = el('label', 'pi-bot-sheet-field');
        if (label) wrap.append(el('span', 'pi-bot-sheet-label', label));
        wrap.append(control);
        if (hint) wrap.append(el('span', 'pi-bot-sheet-hint', hint));
        return wrap;
    }

    function section(title, ...children) {
        const node = el('section', 'pi-bot-sheet-section');
        node.append(el('h3', null, title), ...children);
        return node;
    }

    // open({ api, toast, profileId, face, onSaved, onMemory, onRestart, onTrashed })
    async function open(options) {
        dialog?.close();
        dialog = el('dialog', 'pi-bot-sheet');
        dialog.setAttribute('aria-labelledby', 'pi-bot-sheet-title');
        const form = el('form', 'pi-bot-sheet-form'); form.method = 'dialog'; form.noValidate = true;
        const head = el('header', 'pi-bot-sheet-head');
        const title = el('h2', null, translateUi("设置")); title.id = 'pi-bot-sheet-title';
        const close = button('pi-bot-sheet-close'); close.setAttribute('aria-label', translateUi("关闭")); close.title = translateUi("关闭"); close.append(icon('fa-xmark'));
        head.append(el('span', 'pi-bot-sheet-face'), title, close);
        const body = el('div', 'pi-bot-sheet-body');
        body.append(el('p', 'pi-bot-sheet-state', translateUi("正在读取…")));
        const foot = el('footer', 'pi-bot-sheet-foot');
        const status = el('p', 'pi-bot-sheet-status'); status.setAttribute('role', 'status');
        const cancel = button('pi-bot-chip', translateUi("取消"));
        const save = el('button', 'pi-bot-primary pi-bot-sheet-save', translateUi("保存")); save.type = 'submit'; save.disabled = true;
        foot.append(status, cancel, save);
        form.append(head, body, foot);
        dialog.append(form);
        document.body.append(dialog);
        const sheet = dialog;
        let data = null, controls = null, saving = false, warned = null, initial = null;
        // picture: a picture chosen in this sheet (PNG data URL), uploaded when saving;
        // uploaded: the last one this sheet put up, so a retry does not upload it again.
        let picture = null, uploaded = null, faceChoice = null, fileSerial = 0, decoding = false;
        // Ids of "always allow" grants the user chose to revoke; saved with the other edits.
        let revoked = new Set();
        // The avatar and picture are one draft value, so rebasing never combines two sources.
        const formValues = () => controls ? { name: controls.name.value,
            faceDraft: JSON.stringify({ avatar: faceChoice, picture }), job: controls.job.value, soul: controls.soul.value,
            model: controls.model.value, thinking: controls.thinkingWrap.hidden ? '' : controls.thinking.value,
            preset: controls.presets.find(input => input.checked)?.value || '', revoked: [...revoked].sort().join('\n') } : null;
        function applyValues(values) {
            for (const key of ['name', 'job', 'soul']) if (values[key] !== undefined) controls[key].value = values[key];
            fitTextarea(controls.job); fitTextarea(controls.soul);
            if (values.faceDraft !== undefined) {
                const draft = JSON.parse(values.faceDraft); faceChoice = draft.avatar; picture = draft.picture;
            }
            controls.showFace();
            if (values.model !== undefined && [...controls.model.options].some(option => option.value === values.model)) controls.model.value = values.model;
            const levels = data.models?.models.find(item => modelKey(item) === controls.model.value)?.thinkingLevels || [];
            controls.thinkingWrap.hidden = !levels.length;
            if (levels.length) fillThinking(levels, values.thinking ?? controls.thinking.value);
            if (values.preset !== undefined) for (const input of controls.presets) input.checked = input.value === values.preset;
            // A revoked grant stays revoked only while it still exists in the reread settings.
            if (values.revoked !== undefined) {
                const ids = new Set(knownRules().map(rule => rule.id));
                revoked = new Set(values.revoked ? values.revoked.split('\n').filter(id => ids.has(id)) : []);
                controls.showRules();
            }
        }
        const knownRules = () => Array.isArray(data?.bot.bot.permissions?.rules) ? data.bot.bot.permissions.rules.filter(rule => window.PiBotRules?.valid(rule)) : [];

        // Whether the user edited anything, valid or not (UAT-11: an emptied name is an edit too).
        const edited = () => Boolean(controls && initial) && Object.entries(formValues()).some(([key, value]) => value !== initial[key]);
        // Every way out of the sheet (close, Escape, cancel, the memory page, meeting again): with
        // unsaved edits the first try only warns; the same action again leaves without them.
        const leave = (action, then) => {
            if (saving) return false;
            if (edited() && warned !== action) {
                warned = action; status.dataset.tone = 'warn';
                status.textContent = action === 'close' ? translateUi("还有修改没保存。再关一次就放弃这些修改。")
                    : translateUi("还有修改没保存。再点一次就放弃这些修改并离开。");
                return false;
            }
            if (uploaded && data?.bot.avatar?.kind === 'image' && data.bot.avatar.version === uploaded.version) {
                options.toast?.(translateUi("上传的图片已经是头像了；要换回可以在设置里改。"), 'info');
                void options.onSaved?.();
            }
            sheet.close();
            then?.();
            return true;
        };
        const tryClose = () => leave('close');
        close.addEventListener('click', tryClose);
        cancel.addEventListener('click', tryClose);
        sheet.addEventListener('cancel', event => { event.preventDefault(); tryClose(); });
        sheet.addEventListener('close', () => { sheet.remove(); if (dialog === sheet) dialog = null; });
        sheet.addEventListener('input', () => { warned = null; status.textContent = ''; delete status.dataset.tone; refreshState(); });
        sheet.addEventListener('change', () => refreshState());
        sheet.showModal();

        function refreshState() {
            if (!controls) return;
            const pending = changes();
            save.disabled = saving || decoding || !pending || !Object.keys(pending).length;
            for (const control of body.querySelectorAll('input,textarea,select,button')) control.disabled = saving;
            const model = controls.model.value ? data.models?.models.find(item => modelKey(item) === controls.model.value) : null;
            const levels = model?.thinkingLevels || [];
            controls.thinkingWrap.hidden = !levels.length;
            if (levels.length && controls.thinking.dataset.for !== controls.model.value) fillThinking(levels, controls.thinking.value);
        }

        function fillThinking(levels, selected) {
            const select = controls.thinking;
            select.replaceChildren(new Option(translateUi("跟随默认"), ''));
            for (const level of levels) select.append(new Option(THINKING[level]?.() || level, level));
            select.value = levels.includes(selected) ? selected : '';
            select.dataset.for = controls.model.value;
        }

        const DEFAULT_FACE = { kind: 'preset', id: 'pivane-pebble' };
        const savedFace = avatar => avatar?.kind === 'preset' || avatar?.kind === 'image' ? avatar : DEFAULT_FACE;

        // Fields the user changed, against the latest saved settings; null on invalid input.
        function changes() {
            const bot = data.bot, current = bot.bot, out = {}, patch = {};
            const name = controls.name.value.trim();
            if (!name || name.length > LIMITS.name) return null;
            if (name !== bot.name) out.name = name;
            if (picture) out.avatar = { kind: 'image' };
            else if (JSON.stringify(faceChoice) !== JSON.stringify(savedFace(bot.avatar))) out.avatar = faceChoice;
            const soul = controls.soul.value.trim();
            if (soul !== (bot.soul || '').trim()) out.soul = soul;
            const job = controls.job.value.trim();
            if (job !== current.job) patch.job = job;
            const selected = controls.model.value, item = selected ? data.models?.models.find(entry => modelKey(entry) === selected) : null;
            let model = null;
            // A current model that is not listed right now stays exactly as saved.
            if (selected && !item) model = selected === modelKey(current.model) ? { ...current.model } : null;
            else if (item) {
                model = { provider: item.provider, id: item.id };
                if (!controls.thinkingWrap.hidden && controls.thinking.value) model.thinking = controls.thinking.value;
            }
            if (JSON.stringify(model) !== JSON.stringify(current.model ?? null)) patch.model = model;
            const permissions = {}, preset = controls.presets.find(input => input.checked)?.value;
            if (preset && preset !== current.permissions.preset) permissions.preset = preset;
            // Revoking sends the whole list without those grants; unknown grants are always kept.
            const rules = current.permissions.rules;
            if (revoked.size && Array.isArray(rules)) {
                const kept = rules.filter(rule => !(window.PiBotRules?.valid(rule) && revoked.has(rule.id)));
                if (kept.length !== rules.length) permissions.rules = kept;
            }
            if (Object.keys(permissions).length) patch.permissions = permissions;
            if (Object.keys(patch).length) out.bot = patch;
            return out;
        }

        function render() {
            const bot = data.bot, current = bot.bot;
            title.textContent = translateUi("{0} 的设置", bot.name);
            const headFace = options.face(bot, 'md'); headFace.classList.add('pi-bot-sheet-face');
            head.querySelector('.pi-bot-sheet-face').replaceWith(headFace);
            const name = el('input'); name.type = 'text'; name.maxLength = LIMITS.name; name.value = bot.name; name.required = true; name.autocomplete = 'off';
            picture = null; faceChoice = structuredClone(savedFace(bot.avatar)); fileSerial++; decoding = false;
            // Preview stays local until Save; every source replaces the same draft.
            const preview = el('span', 'pi-bot-sheet-avatar-face');
            const facePresets = window.PiAvatar?.choices(faceChoice, value => {
                fileSerial++; decoding = false; picture = null; faceChoice = value; warned = null; showFace(); refreshState();
            });
            const showFace = () => {
                if (picture) { const img = el('img'); img.src = picture; img.alt = ''; const node = el('span', 'pi-bot-face is-xl'); node.append(img); preview.replaceChildren(node); }
                else preview.replaceChildren(options.face({ ...bot, avatar: faceChoice }, 'xl'));
                for (const item of facePresets?.children || []) item.setAttribute('aria-pressed', String(faceChoice?.kind === 'preset' && faceChoice.id === item.dataset.avatarPreset && !picture));
                back.hidden = !picture;
                remove.hidden = Boolean(picture || faceChoice?.kind !== 'image');
                pick.textContent = picture || faceChoice?.kind === 'image' ? translateUi("换一张图片") : translateUi("上传图片");
            };
            const file = el('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp,image/gif'; file.hidden = true; file.dataset.sheetPictureFile = '';
            const pick = button('pi-bot-chip'); pick.dataset.sheetPicture = 'pick';
            pick.addEventListener('click', () => file.click());
            const back = button('pi-bot-chip', translateUi("不用这张图片")); back.dataset.sheetPicture = 'clear';
            back.addEventListener('click', () => { fileSerial++; decoding = false; picture = null; faceChoice = structuredClone(savedFace(bot.avatar)); status.textContent = ''; showFace(); refreshState(); });
            const remove = button('pi-bot-chip', translateUi("移除头像")); remove.dataset.sheetPicture = 'remove';
            remove.addEventListener('click', () => { fileSerial++; decoding = false; picture = null; faceChoice = { ...DEFAULT_FACE }; warned = null; showFace(); refreshState(); });
            file.addEventListener('change', async () => {
                const chosen = file.files?.[0]; file.value = '';
                if (!chosen || saving) return;
                const request = ++fileSerial;
                decoding = true; refreshState();
                try {
                    const decoded = await window.PiBot.pictureData(chosen);
                    if (!sheet.open || request !== fileSerial) return;
                    picture = decoded; faceChoice = null;
                    warned = null; status.textContent = translateUi("图片会在保存时上传"); delete status.dataset.tone;
                } catch (error) { if (sheet.open && request === fileSerial) { status.dataset.tone = 'error'; status.textContent = error.message; } }
                finally { if (request === fileSerial) decoding = false; }
                if (!sheet.open || request !== fileSerial) return;
                showFace(); refreshState();
            });
            const actions = el('div', 'pi-bot-sheet-avatar-actions');
            actions.append(pick, back, remove, file);
            const avatarBox = el('div', 'pi-bot-sheet-avatar');
            const avatarSide = el('div', 'pi-bot-sheet-avatar-side');
            if (facePresets) avatarSide.append(facePresets);
            avatarSide.append(actions);
            avatarBox.append(preview, avatarSide);
            const identity = el('div', 'pi-bot-sheet-identity');
            identity.append(avatarBox, field(translateUi("名字"), name));
            const job = el('textarea', 'pi-bot-sheet-long is-job'); job.rows = 2; job.maxLength = LIMITS.job; job.value = current.job;
            job.placeholder = translateUi("比如：帮我安排生活琐事、陪我练英语");
            const soul = el('textarea', 'pi-bot-sheet-long is-soul'); soul.rows = 5; soul.maxLength = LIMITS.soul; soul.value = bot.soul || '';
            // Long text grows with what is there and typed, up to a bound (pi-bot.css), then scrolls.
            for (const area of [job, soul]) area.addEventListener('input', () => fitTextarea(area));
            soul.placeholder = translateUi("比如：说话简短直接，偶尔开个玩笑。");

            const model = el('select');
            const defaults = data.models?.defaults, defaultModel = defaults && data.models.models.find(item => item.provider === defaults.provider && item.id === defaults.modelId);
            model.append(new Option(defaultModel ? translateUi("跟随默认（{0}）", defaultModel.name || defaultModel.id) : translateUi("跟随默认"), ''));
            const groups = new Map();
            for (const item of data.models?.models || []) {
                if (!groups.has(item.provider)) { const group = el('optgroup'); group.label = item.provider; groups.set(item.provider, group); model.append(group); }
                groups.get(item.provider).append(new Option(item.name || item.id, modelKey(item)));
            }
            if (current.model && !data.models?.models.some(item => modelKey(item) === modelKey(current.model)))
                model.append(new Option(translateUi("{0}（现在不可用）", current.model.id), modelKey(current.model)));
            model.value = modelKey(current.model);
            model.setAttribute('aria-label', translateUi("用哪个模型"));
            const thinking = el('select');
            const thinkingWrap = field(translateUi("思考程度"), thinking);
            const modelHint = data.models ? translateUi("只影响 {0}，不改其他 Bot 和 Pi Agent。", bot.name)
                : translateUi("暂时读不到模型列表，现在的选择会保留。");

            const presets = [];
            const presetList = el('div', 'pi-bot-sheet-presets'); presetList.setAttribute('role', 'radiogroup');
            for (const [value, label, text] of PRESETS) {
                const option = el('label', 'pi-bot-sheet-preset');
                const input = el('input'); input.type = 'radio'; input.name = 'pi-bot-preset'; input.value = value; input.checked = current.permissions.preset === value;
                const copy = el('span', 'pi-bot-sheet-preset-copy');
                copy.append(el('strong', null, label()), el('span', null, text()));
                option.append(input, copy); presetList.append(option); presets.push(input);
            }
            const honesty = el('p', 'pi-bot-sheet-note', translateUi("“稳妥”和“每次都问”会在动手前弹出确认；“放手”靠 {0} 自觉先问。这些都不是安全隔离：它能使用这台电脑上的工具。密码、密钥这类东西它一律不碰。", bot.name));
            // Grants kept from approval cards ("always allow"): shown exactly, revocable here, never added here.
            revoked = new Set();
            const rulesBox = el('div', 'pi-bot-sheet-rules'); rulesBox.setAttribute('role', 'group');
            const rulesTitle = el('h4', null, translateUi("一直允许的事")); rulesTitle.id = 'pi-bot-sheet-rules-title';
            rulesBox.setAttribute('aria-labelledby', rulesTitle.id);
            const showRules = focusId => {
                const list = current.permissions.rules, nodes = [rulesTitle];
                if (!Array.isArray(list)) {
                    nodes.push(el('p', 'pi-bot-sheet-note', Number.isSafeInteger(list) && list > 0
                        ? translateUi("有 {0} 条一直允许的规则，暂时读不到详情。", list) : translateUi("还没有一直允许的事。")));
                } else {
                    const known = list.filter(rule => window.PiBotRules?.valid(rule)), other = list.length - known.length;
                    if (!list.length) nodes.push(el('p', 'pi-bot-sheet-note', translateUi("还没有一直允许的事。在确认卡上选“以后都允许”，会加到这里。")));
                    if (known.length) {
                        const items = el('ul', 'pi-bot-sheet-rule-list');
                        for (const rule of known) {
                            const gone = revoked.has(rule.id);
                            const item = el('li', `pi-bot-sheet-rule${gone ? ' is-revoked' : ''}`);
                            const copy = el('div', 'pi-bot-sheet-rule-copy');
                            copy.append(el('strong', null, window.PiBotRules.label(rule)), el('code', null, rule.value));
                            const where = window.PiBotRules.place(rule);
                            if (where) copy.append(el('small', null, where));
                            if (gone) copy.append(el('small', 'pi-bot-sheet-rule-state', translateUi("保存后撤销")));
                            const toggle = button('pi-bot-chip', gone ? translateUi("不撤销了") : translateUi("撤销"));
                            toggle.dataset.ruleId = rule.id;
                            toggle.setAttribute('aria-label', gone ? translateUi("不撤销：{0}", rule.value) : translateUi("撤销：{0}", rule.value));
                            toggle.addEventListener('click', () => {
                                if (revoked.has(rule.id)) revoked.delete(rule.id); else revoked.add(rule.id);
                                warned = null; status.textContent = ''; delete status.dataset.tone;
                                showRules(rule.id); refreshState();
                            });
                            item.append(copy, toggle); items.append(item);
                        }
                        nodes.push(items);
                    }
                    if (other) nodes.push(el('p', 'pi-bot-sheet-note', translateUi("另有 {0} 条这个版本看不懂的规则，会原样保留。", other)));
                }
                nodes.push(el('p', 'pi-bot-sheet-note', translateUi("一直允许只对完全相同的命令（同一个目录）或同一个文件跳过确认，其他照常询问。它只在 Pivane 的工具层生效，不是系统沙箱：允许的命令以 Pivane 服务的权限运行。")));
                rulesBox.replaceChildren(...nodes);
                if (focusId) [...rulesBox.querySelectorAll('[data-rule-id]')].find(node => node.dataset.ruleId === focusId)?.focus();
            };
            showRules();

            // Quiet hours join this sheet once Bots can start conversations on their own (M4).

            const memory = button('pi-bot-sheet-link'); memory.append(icon('fa-book-open'), el('span', null, translateUi("记忆和关于你")), icon('fa-chevron-right'));
            memory.addEventListener('click', () => leave('memory', () => options.onMemory?.()));
            const restart = button('pi-bot-sheet-link'); restart.append(icon('fa-rotate-left'), el('span', null, translateUi("重新互相认识")), icon('fa-chevron-right'));
            let restartArmed = false;
            restart.addEventListener('click', async () => {
                if (!restartArmed) { restartArmed = true; restart.querySelector('span').textContent = translateUi("再点一次确认：在主聊天里重新认识"); return; }
                let leaving = false;
                leave('restart', () => { leaving = true; });
                if (leaving) await options.onRestart?.();
            });

            // Moving the Bot to the trash keeps everything and can be undone on the identity page.
            const trash = button('pi-bot-sheet-link is-danger'); trash.dataset.sheetAction = 'trash';
            trash.append(icon('fa-trash-can'), el('span', null, translateUi("移到回收站")), icon('fa-chevron-right'));
            trash.addEventListener('click', () => void moveToTrash());

            controls = { name, job, soul, model, thinking, thinkingWrap, presets, showFace, showRules };
            showFace();
            body.replaceChildren(
                section(translateUi("名字和样子"), identity),
                section(translateUi("主要帮你做什么"), job),
                section(translateUi("性格"), soul),
                section(translateUi("用哪个模型"), field(null, model, modelHint), thinkingWrap),
                section(translateUi("做事方式"), presetList, honesty, rulesBox),
                section(translateUi("更多"), memory, restart, trash));
            const levels = data.models?.models.find(item => modelKey(item) === model.value)?.thinkingLevels || [];
            thinkingWrap.hidden = !levels.length;
            if (levels.length) fillThinking(levels, current.model?.thinking || '');
            for (const area of [job, soul]) fitTextarea(area);
            initial = formValues();
            refreshState();
        }

        async function load() {
            data = await options.api(`/api/pi/bots/${encodeURIComponent(options.profileId)}/settings`);
        }

        // The edits made in this sheet, to put back after rereading (only fields the user touched).
        const ownEdits = () => Object.fromEntries(Object.entries(formValues()).filter(([key, value]) => value !== initial[key]));

        // POST /bots/:id/trash after an explicit confirmation. Unsaved edits are warned about first;
        // a failure keeps the sheet open with the user's edits, and success is reported as such.
        async function moveToTrash() {
            if (saving || decoding || !controls || !data) return;
            if (edited() && warned !== 'trash') {
                warned = 'trash'; status.dataset.tone = 'warn';
                status.textContent = translateUi("还有修改没保存。再点一次就放弃这些修改，接着移到回收站。");
                return;
            }
            const name = data.bot.name;
            const accepted = await window.PiProfileDialog?.confirm({ title: translateUi("把 {0} 移到回收站？", name),
                message: translateUi("{0} 会从 Bot 列表里移走。它的名字、性格、记忆、聊天记录和工作目录里的文件都会保留，之后可以在“身份”页的回收站恢复。", name),
                accept: translateUi("移到回收站"), cancelLabel: translateUi("保留"), current: () => sheet.open });
            if (!accepted || !sheet.open || saving) return;
            saving = true; refreshState(); status.textContent = translateUi("正在移到回收站…"); delete status.dataset.tone;
            try {
                const result = await options.api(`/api/pi/bots/${encodeURIComponent(options.profileId)}/trash`, { method: 'POST',
                    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: data.revision }) });
                saving = false;
                sheet.close();
                options.toast?.(translateUi("{0} 已移到回收站，可以在“身份”页的回收站恢复。", name), 'success');
                await options.onTrashed?.(result);
            } catch (error) {
                if (!sheet.open) return;
                // A refusal leaves everything as it was; say why in plain words.
                if (error.status === 409 && (!error.code || error.code === 'BOT_TRASH_STALE')) {
                    const mine = ownEdits();
                    try { await load(); render(); applyValues(mine); } catch {}
                    status.dataset.tone = 'warn';
                    status.textContent = translateUi("设置刚刚在别处改过，还没有移到回收站。检查后可以再试一次。");
                } else {
                    const reason = (TRASH_BLOCKED[error.code] || (error.status === 404 ? TRASH_BLOCKED.BOT_NOT_FOUND : null))?.(name) || error.message || translateUi("保存失败");
                    status.dataset.tone = 'error'; status.textContent = translateUi("没有移到回收站：{0}", reason);
                }
            } finally { saving = false; if (sheet.open) refreshState(); }
        }

        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (saving || decoding || !controls) return;
            const pending = changes();
            if (!pending) { status.dataset.tone = 'error'; status.textContent = translateUi("名字不能为空"); return; }
            if (!Object.keys(pending).length) return;
            saving = true; refreshState(); status.textContent = translateUi("正在保存…"); delete status.dataset.tone;
            try {
                let revision = data.revision;
                const submittedPicture = picture;
                if (pending.avatar?.kind === 'image') {
                    // The picture goes up first (the avatar service keeps the file); saving it here
                    // then records it as the face the user chose.
                    const face = data.bot.avatar;
                    if (!(uploaded?.picture === submittedPicture && face?.kind === 'image' && face.version === uploaded.version)) {
                        const result = await options.api(`/api/pi/profiles/${encodeURIComponent(options.profileId)}/avatar`, { method: 'POST',
                            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: revision, dataUrl: submittedPicture }) });
                        const version = result?.profile?.avatar?.version;
                        if (!/^[a-f0-9]{64}$/.test(version || '') || typeof result.revision !== 'string') throw new Error(translateUi("头像图片没有保存成功，请再试一次"));
                        uploaded = { picture: submittedPicture, version }; revision = result.revision;
                        data.bot.avatar = result.profile.avatar; data.revision = revision;
                    }
                    pending.avatar = { kind: 'image', version: uploaded.version };
                }
                await options.api(`/api/pi/bots/${encodeURIComponent(options.profileId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ expectedRevision: revision, changes: pending }) });
                sheet.close();
                options.toast?.(translateUi("已保存"), 'success');
                await options.onSaved?.();
            } catch (error) {
                if (error.status === 409) {
                    // Reread the saved settings and show them, then put back only the fields this
                    // user edited: anything they did not touch follows the newer saved value.
                    const mine = ownEdits();
                    try { await load(); render(); applyValues(mine); } catch {}
                    status.dataset.tone = 'warn';
                    status.textContent = translateUi("设置刚刚在别处改过。你的修改还在，检查后再保存一次。");
                } else { status.dataset.tone = 'error'; status.textContent = error.message || translateUi("保存失败"); }
            } finally { saving = false; refreshState(); }
        });

        try { await load(); if (sheet.open) render(); }
        catch (error) {
            const retry = button('pi-bot-link', translateUi("重试"));
            retry.addEventListener('click', () => { sheet.close(); void open(options); });
            const state = el('div', 'pi-bot-sheet-state'); state.append(el('p', null, error.message || translateUi("读取失败")), retry);
            body.replaceChildren(state);
        }
        return sheet;
    }

    window.PiBotSettings = Object.freeze({ open });
})();
