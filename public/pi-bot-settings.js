// The three ways a Bot works, as Bot settings explains them: one line each, then what the Bot
// does directly, what asks first and what is refused. The lists summarise the Bot's tool gate
// (server/bot/bot-guard.js) in plain words; test/pi-bot-work-styles.test.js checks every item
// against that gate, so change both together. Items carry a stable key for that check.
(() => {
    const translateUi = globalThis.PiI18n?.t || ((text, ...values) => text.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? `{${index}}`));
    const item = (key, label) => Object.freeze({ key, label });
    const STYLES = [
        {
            id: 'free', level: 3, name: () => translateUi("放手"), line: () => translateUi("大多数事直接办，少数高风险操作先问你"),
            direct: [
                item('files', () => translateUi("读写文件")),
                item('commands', () => translateUi("运行命令和脚本")),
                item('install', () => translateUi("安装依赖")),
                item('web', () => translateUi("上网查资料")),
                item('memory-schedule', () => translateUi("记忆和 OhMyBuddy 定时任务")),
                item('delegate', () => translateUi("交给其他助手")),
                item('state', () => translateUi("读写 OhMyBuddy 的设置和记录"))
            ],
            asks: [
                item('elevate', () => translateUi("sudo 等提权")),
                item('delete', () => translateUi("递归删除")),
                item('power', () => translateUi("关机、结束进程、启停服务")),
                item('git', () => translateUi("git push、强制重置")),
                item('publish', () => translateUi("发布包或版本")),
                item('mail', () => translateUi("发邮件")),
                item('autostart', () => translateUi("系统定时（cron 等）和开机自启")),
                item('credentials', () => translateUi("密码和密钥文件")),
                item('runtime', () => translateUi("OhMyBuddy 正在运行的程序目录"))
            ],
            refused: []
        },
        {
            id: 'balanced', level: 2, name: () => translateUi("稳妥"), line: () => translateUi("工作目录里直接做，运行命令前先问你"),
            direct: [
                item('read', () => translateUi("读文件")),
                item('web', () => translateUi("上网查资料")),
                item('memory', () => translateUi("记忆")),
                item('workspace', () => translateUi("在工作目录里写文件")),
                item('media', () => translateUi("图片与语音"))
            ],
            asks: [
                item('commands', () => translateUi("运行任何命令")),
                item('outside', () => translateUi("写工作目录以外的文件")),
                item('delegate', () => translateUi("交给其他助手")),
                item('schedule', () => translateUi("设定或取消 OhMyBuddy 定时任务")),
                item('state', () => translateUi("读写 OhMyBuddy 的设置和记录"))
            ],
            refused: [item('credentials', () => translateUi("密码和密钥文件"))]
        },
        {
            id: 'ask', level: 1, name: () => translateUi("每次都问"), line: () => translateUi("除了看和回答，每一步都先问你"),
            direct: [
                item('read', () => translateUi("阅读文件")),
                item('web', () => translateUi("查资料和回答"))
            ],
            asks: [
                item('write', () => translateUi("写文件，包括工作目录里")),
                item('commands', () => translateUi("运行命令")),
                item('memory', () => translateUi("记下关于你的事")),
                item('delegate', () => translateUi("交给其他助手")),
                item('schedule', () => translateUi("设定或取消 OhMyBuddy 定时任务")),
                item('state', () => translateUi("读写 OhMyBuddy 的设置和记录")),
                item('other', () => translateUi("其他每一步"))
            ],
            refused: [item('credentials', () => translateUi("密码和密钥文件"))]
        }
    ].map(style => Object.freeze({ ...style, direct: Object.freeze(style.direct), asks: Object.freeze(style.asks), refused: Object.freeze(style.refused) }));

    const get = id => STYLES.find(style => style.id === id) || null;
    globalThis.PiBotWorkStyles = Object.freeze({ list: Object.freeze(STYLES), get });
})();

(() => {
    // Bot settings: everything that makes one Bot who it is, in plain words, in seven sections.
    // Wider screens show the sections in a side list beside one section; phones show an overview
    // first, then one section full screen (pi-bot.css). It saves only what changed,
    // against the revision it was opened at; when something changed elsewhere it rereads, keeps
    // the user's edits and asks to save again. WeChat, follow-ups and learning act at once, are
    // marked so, and never count as edits.
    const translateUi = globalThis.PiI18n?.t || ((text, ...values) => text.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? `{${index}}`));
    const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };
    const icon = (name, family = 'fa-solid') => { const i = el('i', `${family} ${name}`); i.setAttribute('aria-hidden', 'true'); return i; };
    const button = (className, text) => { const b = el('button', className, text); b.type = 'button'; return b; };
    const LIMITS = { name: 40, avatar: 16, job: 500, soul: 6000 };
    const THINKING = { off: () => translateUi("不启用"), minimal: () => translateUi("极简"), low: () => translateUi("低"), medium: () => translateUi("中"),
        high: () => translateUi("高"), xhigh: () => translateUi("极高"), max: () => translateUi("最大") };
    const modelKey = model => model ? `${model.provider}\u0000${model.id}` : '';
    const botThinking = bot => Object.hasOwn(bot, 'thinking') ? bot.thinking || '' : bot.model?.thinking || '';
    const defaultSelection = models => models && Object.hasOwn(models, 'effectiveDefault') ? models.effectiveDefault : models?.defaults;
    const modelLevels = (models, key) => {
        const defaults = defaultSelection(models);
        return models?.models?.find(item => key ? modelKey(item) === key : item.provider === defaults?.provider && item.id === (defaults?.modelId ?? defaults?.id))?.thinkingLevels || [];
    };
    const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } };
    const when = at => new Date(at).toLocaleString(globalThis.PiI18n?.locale || 'zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    // From pi-bot.js where it is loaded; otherwise the boxes keep their rows and scroll.
    const fitTextarea = area => window.PiBot?.fitTextarea?.(area);
    // A hidden section has no layout yet; its boxes are fitted when it is shown.
    const fit = area => { if (area?.isConnected && area.getClientRects().length) fitTextarea(area); };
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
    // Phones: overview first, then one section (same width as the full-screen sheet in pi-bot.css).
    const PHONE = '(max-width: 600px)';
    // keys: the draft fields (formValues) each section owns, for its "not saved" mark.
    const SECTIONS = [
        { id: 'profile', icon: 'fa-id-card', label: () => translateUi("资料"), keys: ['name', 'faceDraft', 'job', 'soul'] },
        { id: 'model', icon: 'fa-wand-magic-sparkles', label: () => translateUi("模型"), keys: ['model', 'thinking'] },
        { id: 'mode', icon: 'fa-shield-halved', label: () => translateUi("做事方式"), keys: ['preset', 'revoked'] },
        { id: 'notify', icon: 'fa-bell', label: () => translateUi("主动联系"), keys: ['proactive', 'quietOn', 'quietStart', 'quietEnd', 'limit'] },
        { id: 'wechat', icon: 'fa-weixin', family: 'fa-brands', label: () => translateUi("微信"), keys: [] },
        { id: 'learning', icon: 'fa-seedling', label: () => translateUi("学习与记忆"), keys: [] },
        { id: 'more', icon: 'fa-ellipsis', label: () => translateUi("更多"), keys: [] }
    ];
    const NAV_GROUPS = [['profile'], ['model', 'mode', 'notify'], ['wechat', 'learning'], ['more']];
    const sectionOf = id => SECTIONS.find(item => item.id === id) || null;
    // The three ways of working with their plain-word lists (pi-bot-settings.js); names only
    // if that module is missing.
    const FALLBACK_STYLES = Object.freeze([
        { id: 'free', level: 3, name: () => translateUi("放手") },
        { id: 'balanced', level: 2, name: () => translateUi("稳妥") },
        { id: 'ask', level: 1, name: () => translateUi("每次都问") }
    ].map(style => Object.freeze({ ...style, line: () => '', direct: [], asks: [], refused: [] })));
    const workStyles = () => globalThis.PiBotWorkStyles?.list || FALLBACK_STYLES;
    const styleOf = id => workStyles().find(style => style.id === id) || null;
    const validLearning = snap => snap?.version === 1 && Number.isSafeInteger(snap.revision) && snap.settings && typeof snap.settings === 'object';

    let dialog = null, closeDialog = null;

    function field(label, control, hint) {
        const wrap = el('label', 'pi-bot-sheet-field');
        if (label) wrap.append(el('span', 'pi-bot-sheet-label', label));
        wrap.append(control);
        if (hint) wrap.append(el('span', 'pi-bot-sheet-hint', hint));
        return wrap;
    }
    // A card of rows (or, padded, of fields) on a section page.
    function card(children, { pad = false, className = '' } = {}) {
        const node = el('div', `pi-bot-sheet-card${pad ? ' is-pad' : ''}${className ? ` ${className}` : ''}`);
        node.append(...children);
        return node;
    }
    // A small heading over one card; instant marks what applies without Save.
    function group(title, content, { instant = false, className = '' } = {}) {
        const node = el('div', `pi-bot-sheet-group${className ? ` ${className}` : ''}`);
        if (title || instant) {
            const top = el('div', 'pi-bot-sheet-group-head');
            top.append(typeof title === 'string' ? el('h4', 'pi-bot-sheet-group-title', title) : title || el('span', 'pi-bot-sheet-group-title'));
            if (instant) top.append(instantBadge());
            node.append(top);
        }
        node.append(content);
        return node;
    }
    function instantBadge() {
        const badge = el('span', 'pi-bot-sheet-instant'); badge.title = translateUi("不需要点保存");
        badge.append(icon('fa-bolt'), el('span', null, translateUi("立即生效")));
        return badge;
    }
    // One row: a title and a short line, with the control on the right.
    function row(title, desc, control, { tag = 'div', className = '' } = {}) {
        const node = el(tag, `pi-bot-sheet-item${className ? ` ${className}` : ''}`);
        const copy = el('span', 'pi-bot-sheet-item-copy');
        copy.append(el('strong', null, title));
        if (desc) copy.append(el('span', 'pi-bot-sheet-item-desc', desc));
        node.append(copy);
        if (control) node.append(control);
        return node;
    }
    function switchInput() {
        const input = el('input', 'pi-bot-sheet-switch'); input.type = 'checkbox'; input.setAttribute('role', 'switch');
        return input;
    }
    // A row that opens something else.
    function linkRow(iconName, title, desc, className = '') {
        const node = button(`pi-bot-sheet-link${className ? ` ${className}` : ''}`);
        const copy = el('span', 'pi-bot-sheet-link-copy');
        copy.append(el('strong', null, title));
        if (desc) copy.append(el('small', null, desc));
        node.append(icon(iconName), copy, icon('fa-chevron-right'));
        return node;
    }
    // Details that most people need only once; folded until opened.
    function disclosure(className, iconName, title, desc) {
        const details = el('details', `pi-bot-sheet-disclosure ${className}`);
        const summary = el('summary');
        const mark = el('span', 'pi-bot-sheet-disclosure-icon'); mark.append(icon(iconName));
        const copy = el('span', 'pi-bot-sheet-item-copy');
        copy.append(title);
        if (desc) copy.append(el('span', 'pi-bot-sheet-item-desc', desc));
        summary.append(mark, copy, icon('fa-chevron-down'));
        const content = el('div', 'pi-bot-sheet-disclosure-body');
        details.append(summary, content);
        return { details, content };
    }

    // open({ api, toast, profileId, face, page, onSaved, onMemory, onLearning, onRestart, onTrashed })
    // page: the section to show first (desktop: the first section; phones: the overview).
    async function open(options) {
        if (dialog?.open && closeDialog?.() === false) return dialog;
        dialog = el('dialog', 'pi-bot-sheet pi-bot-settings-sheet');
        dialog.setAttribute('aria-labelledby', 'pi-bot-sheet-title');
        const form = el('form', 'pi-bot-sheet-form'); form.method = 'dialog'; form.noValidate = true;
        const head = el('header', 'pi-bot-sheet-head');
        const backButton = button('pi-bot-sheet-back'); backButton.hidden = true;
        backButton.setAttribute('aria-label', translateUi("返回")); backButton.title = translateUi("返回"); backButton.append(icon('fa-chevron-left'));
        const title = el('h2', null, translateUi("设置")); title.id = 'pi-bot-sheet-title';
        const close = button('pi-bot-sheet-close'); close.setAttribute('aria-label', translateUi("关闭")); close.title = translateUi("关闭"); close.append(icon('fa-xmark'));
        head.append(backButton, el('span', 'pi-bot-sheet-face'), title, close);
        const body = el('div', 'pi-bot-sheet-body');
        body.append(el('p', 'pi-bot-sheet-state', translateUi("正在读取…")));
        const foot = el('footer', 'pi-bot-sheet-foot');
        const status = el('p', 'pi-bot-sheet-status'); status.setAttribute('role', 'status');
        // Which sections have unsaved edits; shown when there is no other message.
        const dirtyNote = el('p', 'pi-bot-sheet-dirty');
        const notes = el('div', 'pi-bot-sheet-foot-notes'); notes.append(status, dirtyNote);
        const cancel = button('pi-bot-chip', translateUi("取消"));
        const save = el('button', 'pi-bot-primary pi-bot-sheet-save', translateUi("保存")); save.type = 'submit'; save.disabled = true;
        foot.append(notes, cancel, save);
        form.append(head, body, foot);
        dialog.append(form);
        document.body.append(dialog);
        const sheet = dialog;
        sheet.dataset.edited = 'false';
        let data = null, controls = null, saving = false, warned = null, initial = null, activitySerial = 0;
        const onBeforeRoute = event => {
            if (!sheet.open || !options.current) return;
            const route = event.detail, profileId = route?.params?.get('profileId');
            if (route?.tab === 'bot' && (!profileId || profileId === options.profileId) && options.current()) return;
            if (!leave(`route:${route.hash}`)) event.preventDefault();
        };
        window.addEventListener('workspace:beforetabchange', onBeforeRoute);
        const onUnload = event => {
            if (saving || decoding || edited()) { event.preventDefault(); event.returnValue = ''; }
        };
        window.addEventListener('beforeunload', onUnload);
        // picture: a picture chosen in this sheet (PNG data URL), uploaded when saving;
        // uploaded: the last one this sheet put up, so a retry does not upload it again.
        let picture = null, uploaded = null, faceChoice = null, fileSerial = 0, decoding = false;
        // Ids of "always allow" grants the user chose to revoke; saved with the other edits.
        let revoked = new Set();
        // The section shown (null on a phone: the overview), the folded details the user opened,
        // and the side list, pages and scroller of the latest render; kept across a reread.
        const phone = window.matchMedia(PHONE);
        let page = sectionOf(options.page) ? options.page : null, chrome = null;
        const opened = new Set();
        const chatsOf = () => (data?.channels?.bindings || []).filter(b => b.bots?.includes(options.profileId));
        // The avatar and picture are one draft value, so rebasing never combines two sources.
        const formValues = () => controls ? { name: controls.name.value,
            faceDraft: JSON.stringify({ avatar: faceChoice, picture }), job: controls.job.value, soul: controls.soul.value,
            model: controls.model.value, thinking: controls.thinking.value,
            preset: controls.presets.find(input => input.checked)?.value || '', revoked: [...revoked].sort().join('\n'),
            proactive: String(controls.proactive.checked), quietOn: String(controls.quietOn.checked), quietStart: controls.quietStart.value,
            quietEnd: controls.quietEnd.value, limit: controls.limit.value } : null;
        function applyValues(values) {
            for (const key of ['name', 'job', 'soul']) if (values[key] !== undefined) controls[key].value = values[key];
            controls.syncCounts(); fit(controls.job); fit(controls.soul);
            if (values.faceDraft !== undefined) {
                const draft = JSON.parse(values.faceDraft); faceChoice = draft.avatar; picture = draft.picture;
            }
            controls.showFace();
            if (values.model !== undefined && [...controls.model.options].some(option => option.value === values.model)) {
                controls.model.value = values.model;
                controls.syncModelPicker?.();
            }
            fillThinking(modelLevels(data.models, controls.model.value), values.thinking ?? controls.thinking.value);
            if (values.preset !== undefined) for (const input of controls.presets) input.checked = input.value === values.preset;
            controls.showScope();
            if (values.proactive !== undefined) controls.proactive.checked = values.proactive === 'true';
            if (values.quietOn !== undefined) controls.quietOn.checked = values.quietOn === 'true';
            for (const key of ['quietStart', 'quietEnd']) if (values[key] !== undefined) controls[key].value = values[key];
            if (values.limit !== undefined && [...controls.limit.options].some(option => option.value === values.limit)) controls.limit.value = values.limit;
            controls.showNotify();
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
            if (saving || decoding) return false;
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
        closeDialog = tryClose;
        close.addEventListener('click', tryClose);
        cancel.addEventListener('click', tryClose);
        // Phones: back from a section to the overview, onto the row that opened it.
        backButton.addEventListener('click', () => {
            const from = page; page = null; showPage();
            (from === 'profile' ? chrome?.hero : chrome?.items.get(from))?.focus();
        });
        const onLayout = () => showPage();
        phone.addEventListener('change', onLayout);
        sheet.addEventListener('cancel', event => { event.preventDefault(); tryClose(); });
        sheet.addEventListener('close', () => {
            phone.removeEventListener('change', onLayout);
            activitySerial++; fileSerial++;
            window.removeEventListener('workspace:beforetabchange', onBeforeRoute);
            window.removeEventListener('beforeunload', onUnload);
            controls?.modelPicker?.dispose?.(); sheet.remove(); if (dialog === sheet) { dialog = null; closeDialog = null; }
        });
        sheet.addEventListener('input', () => { warned = null; status.textContent = ''; delete status.dataset.tone; refreshState(); });
        sheet.addEventListener('change', () => refreshState());
        sheet.showModal();

        // Shows one section (or, on a phone with none chosen, the overview).
        function showPage() {
            if (!chrome) return;
            const shown = page || (phone.matches ? null : 'profile');
            sheet.dataset.view = shown ? 'page' : 'overview';
            for (const [id, node] of chrome.pages) node.hidden = id !== shown;
            for (const [id, node] of chrome.items) {
                if (id === shown) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
            }
            const inside = Boolean(shown && phone.matches);
            backButton.hidden = !inside;
            head.classList.toggle('is-inside', inside);
            title.textContent = inside ? sectionOf(shown).label() : translateUi("{0} 的设置", data.bot.name);
            if (shown) for (const area of chrome.pages.get(shown).querySelectorAll('textarea')) fit(area);
        }
        function go(id) {
            if (!chrome || !sectionOf(id)) return;
            page = id; showPage();
            chrome.scroller.scrollTop = 0;
            if (phone.matches) backButton.focus();
        }

        // What each section is set to now, for the side list and the phone overview.
        function summary(id) {
            if (id === 'profile') return translateUi("名字、头像、职责和性格");
            if (id === 'model') {
                const label = controls.model.selectedOptions[0]?.textContent || '';
                const level = !controls.thinkingWrap.hidden && controls.thinking.value ? controls.thinking.selectedOptions[0]?.textContent : '';
                return level ? translateUi("{0} · 思考{1}", label, level) : label;
            }
            if (id === 'mode') return styleOf(controls.presets.find(input => input.checked)?.value)?.name() || '';
            if (id === 'notify') {
                if (!controls.proactive.checked) return translateUi("关");
                return controls.quietOn.checked ? translateUi("开 · {0}–{1} 安静", controls.quietStart.value, controls.quietEnd.value) : translateUi("开");
            }
            if (id === 'wechat') {
                if (!data.channels) return translateUi("暂时读不到");
                const count = chatsOf().length;
                return count ? translateUi("已连接 {0} 个聊天", count) : translateUi("未连接");
            }
            if (id === 'learning') {
                const snap = data.learning;
                if (!validLearning(snap) || snap.status !== 'ready') return translateUi("学习暂不可用");
                return snap.settings.enabled === true ? translateUi("学习已开启") : translateUi("学习已关闭");
            }
            return translateUi("重新认识、回收站");
        }
        function updateNav() {
            if (!chrome || !controls || !initial) return;
            const values = formValues();
            const dirty = new Set(SECTIONS.filter(item => item.keys.some(key => values[key] !== initial[key])).map(item => item.id));
            for (const [id, node] of chrome.items) {
                node.classList.toggle('is-dirty', dirty.has(id));
                node.querySelector('.pi-bot-sheet-nav-sub').textContent = summary(id);
            }
            const problem = dirty.size && !changes() ? (controls.name.value.trim() ? translateUi("安静时段的开始和结束要是两个不同的时间") : translateUi("名字不能为空")) : '';
            chrome.hero.classList.toggle('is-dirty', dirty.has('profile'));
            chrome.heroName.textContent = controls.name.value.trim() || data.bot.name;
            chrome.heroJob.textContent = controls.job.value.trim() || summary('profile');
            const names = SECTIONS.filter(item => dirty.has(item.id)).map(item => item.label());
            dirtyNote.replaceChildren();
            dirtyNote.classList.toggle('is-error', Boolean(problem));
            if (problem) dirtyNote.append(icon('fa-circle-exclamation'), el('span', null, problem));
            else if (names.length) dirtyNote.append(el('span', 'pi-bot-sheet-dirty-dot'), el('span', null, translateUi("未保存：{0}", names.join(translateUi("、")))));
            sheet.dataset.edited = String(dirty.size > 0);
        }

        function refreshState() {
            if (!controls) return;
            const pending = changes();
            save.disabled = saving || decoding || !pending || !Object.keys(pending).length;
            for (const control of body.querySelectorAll('input,textarea,select,button')) control.disabled = saving;
            controls.modelPicker?.setDisabled(saving);
            controls.syncLearning?.();
            if (controls.thinking.dataset.for !== controls.model.value) fillThinking(modelLevels(data.models, controls.model.value), controls.thinking.value);
            updateNav();
        }

        function fillThinking(levels, selected) {
            const select = controls.thinking;
            select.replaceChildren(new Option(translateUi("跟随默认"), ''));
            for (const level of levels) select.append(new Option(THINKING[level]?.() || level, level));
            if (selected && !levels.includes(selected)) select.append(new Option(translateUi("{0}（当前模型未提供）", THINKING[selected]?.() || selected), selected));
            select.value = selected;
            controls.thinkingWrap.querySelector('.pi-bot-sheet-hint').textContent = selected && !levels.includes(selected)
                ? translateUi("当前模型未提供这个思考等级；保存前请选择支持的等级或跟随默认。")
                : translateUi("独立于模型保存；跟随默认模型时也能选择。越高通常越慢。");
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
            else if (item) model = { provider: item.provider, id: item.id };
            const modelChanged = selected !== modelKey(current.model);
            if (modelChanged) patch.model = model;
            const thinking = controls.thinking.value;
            if (thinking !== botThinking(current) || modelChanged && !Object.hasOwn(current, 'thinking') && botThinking(current)) patch.thinking = thinking || null;
            const permissions = {}, preset = controls.presets.find(input => input.checked)?.value;
            if (preset && preset !== current.permissions.preset) permissions.preset = preset;
            // Revoking sends the whole list without those grants; unknown grants are always kept.
            const rules = current.permissions.rules;
            if (revoked.size && Array.isArray(rules)) {
                const kept = rules.filter(rule => !(window.PiBotRules?.valid(rule) && revoked.has(rule.id)));
                if (kept.length !== rules.length) permissions.rules = kept;
            }
            if (Object.keys(permissions).length) patch.permissions = permissions;
            // Messages the Bot starts itself: only the fields changed; quiet hours follow this browser's time zone.
            const notify = {}, saved = current.notify || {};
            if (controls.proactive.checked !== (saved.proactive !== false)) notify.proactive = controls.proactive.checked;
            const quiet = controls.quietOn.checked ? { start: controls.quietStart.value, end: controls.quietEnd.value } : null;
            if (quiet && (!CLOCK.test(quiet.start) || !CLOCK.test(quiet.end) || quiet.start === quiet.end)) return null;
            if (JSON.stringify(quiet) !== JSON.stringify(saved.quietHours ?? null)) notify.quietHours = quiet;
            const limit = controls.limit.value === 'none' ? null : Number(controls.limit.value);
            if (limit !== (saved.dailyProactiveLimit === undefined ? 20 : saved.dailyProactiveLimit)) notify.dailyProactiveLimit = limit;
            if (Object.keys(notify).length) { const zone = browserZone(); if (zone && zone !== saved.timeZone) notify.timeZone = zone; patch.notify = notify; }
            if (Object.keys(patch).length) out.bot = patch;
            return out;
        }

        function render() {
            controls?.modelPicker?.dispose?.();
            const bot = data.bot, current = bot.bot;
            const headFace = options.face(bot, 'md'); headFace.classList.add('pi-bot-sheet-face');
            head.querySelector('.pi-bot-sheet-face').replaceWith(headFace);
            const pages = new Map();
            const makePage = (id, lede, ...children) => {
                const node = el('section', 'pi-bot-sheet-page'); node.dataset.page = id; node.hidden = true;
                const top = el('div', 'pi-bot-sheet-page-head');
                const heading = el('h3', null, sectionOf(id).label()); heading.id = `pi-bot-sheet-page-${id}`;
                node.setAttribute('aria-labelledby', heading.id);
                top.append(heading);
                if (lede) top.append(el('p', null, lede));
                node.append(top, ...children);
                pages.set(id, node);
                return node;
            };

            // ---- 资料: face, name, what it mainly helps with, personality -----------------------
            const name = el('input'); name.type = 'text'; name.maxLength = LIMITS.name; name.value = bot.name; name.required = true; name.autocomplete = 'off';
            picture = null; faceChoice = structuredClone(savedFace(bot.avatar)); fileSerial++; decoding = false;
            // Preview stays local until Save; every source replaces the same draft.
            const preview = el('span', 'pi-bot-sheet-avatar-face');
            const heroFace = el('span', 'pi-bot-sheet-hero-face');
            const facePresets = window.PiAvatar?.choices(faceChoice, value => {
                fileSerial++; decoding = false; picture = null; faceChoice = value; warned = null; showFace(); refreshState();
            });
            const draftFace = size => {
                if (!picture) return options.face({ ...bot, avatar: faceChoice }, size);
                const img = el('img'); img.src = picture; img.alt = '';
                const node = el('span', `pi-bot-face is-${size}`); node.append(img);
                return node;
            };
            const showFace = () => {
                preview.replaceChildren(draftFace('xl'));
                heroFace.replaceChildren(draftFace('lg'));
                for (const item of facePresets?.children || []) item.setAttribute('aria-pressed', String(faceChoice?.kind === 'preset' && faceChoice.id === item.dataset.avatarPreset && !picture));
                unpick.hidden = !picture;
                remove.hidden = Boolean(picture || faceChoice?.kind !== 'image');
                pick.replaceChildren(icon('fa-arrow-up-from-bracket'), el('span', null, picture || faceChoice?.kind === 'image' ? translateUi("换一张图片") : translateUi("上传图片")));
            };
            const file = el('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp,image/gif'; file.hidden = true; file.dataset.sheetPictureFile = '';
            const pick = button('pi-bot-chip'); pick.dataset.sheetPicture = 'pick';
            pick.addEventListener('click', () => file.click());
            const unpick = button('pi-bot-chip', translateUi("不用这张图片")); unpick.dataset.sheetPicture = 'clear';
            unpick.addEventListener('click', () => { fileSerial++; decoding = false; picture = null; faceChoice = structuredClone(savedFace(bot.avatar)); status.textContent = ''; showFace(); refreshState(); });
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
            actions.append(pick, unpick, remove, file);
            const avatarSide = el('div', 'pi-bot-sheet-avatar-side');
            if (facePresets) avatarSide.append(facePresets);
            avatarSide.append(actions, el('p', 'pi-bot-sheet-hint', translateUi("图片支持 PNG、JPEG、WebP 或 GIF，最多 6 MiB；保存后才换上。")));
            const avatarBox = el('div', 'pi-bot-sheet-avatar');
            avatarBox.append(preview, avatarSide);
            const job = el('textarea', 'pi-bot-sheet-long is-job'); job.rows = 2; job.maxLength = LIMITS.job; job.value = current.job;
            job.placeholder = translateUi("比如：帮我安排生活琐事、陪我练英语"); job.setAttribute('aria-label', translateUi("主要帮你做什么"));
            const soul = el('textarea', 'pi-bot-sheet-long is-soul'); soul.rows = 5; soul.maxLength = LIMITS.soul; soul.value = bot.soul || '';
            soul.placeholder = translateUi("比如：说话简短直接，偶尔开个玩笑。"); soul.setAttribute('aria-label', translateUi("性格"));
            // Long text grows with what is there and typed, up to a bound (pi-bot.css), then scrolls.
            const counts = [];
            const longField = (area, max, hint) => {
                const count = el('span', 'pi-bot-sheet-counter');
                const sync = () => { count.textContent = `${area.value.length} / ${max}`; };
                area.addEventListener('input', () => { fit(area); sync(); });
                sync(); counts.push(sync);
                const below = el('div', 'pi-bot-sheet-field-foot'); below.append(el('span', 'pi-bot-sheet-hint', hint), count);
                const wrap = el('div', 'pi-bot-sheet-long-field'); wrap.append(area, below);
                return wrap;
            };
            makePage('profile', translateUi("{0} 的名字和样子，主要帮你做什么，以及怎么说话。", bot.name),
                group(translateUi("名字和样子"), card([avatarBox, field(translateUi("名字"), name)], { pad: true, className: 'pi-bot-sheet-identity' })),
                group(translateUi("主要帮你做什么"), card([longField(job, LIMITS.job, translateUi("它会把这当作主要职责。"))], { pad: true })),
                group(translateUi("性格"), card([longField(soul, LIMITS.soul, translateUi("说话方式和个性，下一条回复起生效。"))], { pad: true })));

            // ---- 模型 --------------------------------------------------------------------------
            const model = el('select');
            const defaults = defaultSelection(data.models), defaultModel = defaults && data.models.models.find(item => item.provider === defaults.provider && item.id === (defaults.modelId ?? defaults.id));
            const defaultLabel = defaultModel ? translateUi("跟随默认（{0}）", defaultModel.name || defaultModel.id) : translateUi("跟随默认");
            model.append(new Option(defaultLabel, ''));
            const groups = new Map();
            for (const item of data.models?.models || []) {
                if (!groups.has(item.provider)) { const optgroup = el('optgroup'); optgroup.label = item.provider; groups.set(item.provider, optgroup); model.append(optgroup); }
                groups.get(item.provider).append(new Option(item.name || item.id, modelKey(item)));
            }
            if (current.model && !data.models?.models.some(item => modelKey(item) === modelKey(current.model)))
                model.append(new Option(translateUi("{0}（现在不可用）", current.model.id), modelKey(current.model)));
            model.value = modelKey(current.model);
            model.setAttribute('aria-label', translateUi("用哪个模型"));
            const modelBox = el('div', 'pi-model-picker-row pi-bot-model-picker-row');
            modelBox.append(model);
            let modelPicker = null;
            const syncModelPicker = () => {
                if (!modelPicker) return;
                const val = model.value;
                const sep = val.indexOf('\u0000');
                const picked = val ? ((data.models?.models || []).find(item => modelKey(item) === val)
                    || (sep > 0 ? { provider: val.slice(0, sep), id: val.slice(sep + 1) } : null)) : null;
                modelPicker.update(data.models?.models || [], picked, saving, defaultLabel, defaultLabel);
            };
            if (window.PiModelPicker) {
                const trigger = button('pi-bot-model-trigger');
                trigger.dataset.sheetModelTrigger = '';
                modelBox.append(trigger);
                modelPicker = new window.PiModelPicker({
                    button: trigger, select: model, api: options.api, id: 'pi-bot-sheet-model-dialog', defaultLabel,
                    onSelect: chosen => {
                        const next = chosen ? modelKey(chosen) : '';
                        if (model.value !== next) model.value = next;
                        syncModelPicker();
                        warned = null; status.textContent = ''; delete status.dataset.tone; refreshState();
                    }
                });
                syncModelPicker();
            }
            const thinking = el('select');
            const thinkingWrap = field(translateUi("思考程度"), thinking, translateUi("越高越仔细，也越慢。"));
            const modelHint = data.models ? translateUi("用于 {0} 后续的回复；进行中的回复和已开始的定时任务保持原选择。", bot.name)
                : translateUi("暂时读不到模型列表，现在的选择会保留。");
            makePage('model', translateUi("{0} 用哪个模型思考和回答。", bot.name),
                group(null, card([field(translateUi("模型"), modelBox, modelHint), thinkingWrap], { pad: true })),
                el('p', 'pi-bot-sheet-note', translateUi("模型和思考程度分别跟随默认。微信里的 /model 和 /thinking 也会更新这里。")));

            // ---- 做事方式: three ways, what each does, the boundary and "always allow" grants ---
            const presets = [];
            const presetList = el('div', 'pi-bot-sheet-presets'); presetList.setAttribute('role', 'radiogroup');
            presetList.setAttribute('aria-label', translateUi("做事方式"));
            for (const style of workStyles()) {
                const option = el('label', 'pi-bot-sheet-preset'); option.dataset.preset = style.id;
                const input = el('input'); input.type = 'radio'; input.name = 'pi-bot-preset'; input.value = style.id; input.checked = current.permissions.preset === style.id;
                const meter = el('span', 'pi-bot-sheet-meter'); meter.setAttribute('aria-hidden', 'true');
                for (let level = 1; level <= 3; level++) meter.append(el('i', level <= style.level ? 'is-on' : null));
                const nameRow = el('strong', 'pi-bot-sheet-preset-name', style.name());
                if (style.id === 'free') nameRow.append(el('span', 'pi-bot-sheet-tag', translateUi("默认")));
                const copy = el('span', 'pi-bot-sheet-preset-copy'); copy.append(nameRow);
                if (style.line()) copy.append(el('span', null, style.line()));
                option.append(input, meter, copy); presetList.append(option); presets.push(input);
            }
            const scopeTitle = el('h4', 'pi-bot-sheet-group-title');
            const scope = el('div', 'pi-bot-sheet-scope');
            const scopeGroup = group(scopeTitle, card([scope]));
            const showScope = () => {
                const style = styleOf(presets.find(input => input.checked)?.value);
                scopeGroup.hidden = !style || !(style.direct.length || style.asks.length);
                if (scopeGroup.hidden) return;
                scopeTitle.textContent = translateUi("选“{0}”时", style.name());
                const column = (kind, iconName, label, items) => {
                    const col = el('div', `pi-bot-sheet-scope-col is-${kind}`);
                    const top = el('div', 'pi-bot-sheet-scope-head');
                    const mark = el('span', 'pi-bot-sheet-scope-icon'); mark.append(icon(iconName));
                    top.append(mark, el('span', null, label));
                    const list = el('ul', 'pi-bot-sheet-chips');
                    for (const entry of items) list.append(el('li', null, entry.label()));
                    col.append(top, list);
                    return col;
                };
                const nodes = [column('direct', 'fa-check', translateUi("直接做"), style.direct), column('ask', 'fa-hand', translateUi("先问你"), style.asks)];
                if (style.refused.length) {
                    const never = el('p', 'pi-bot-sheet-scope-never'), text = el('span');
                    text.append(el('strong', null, style.refused.map(entry => entry.label()).join(translateUi("、"))), translateUi("：直接拒绝，不会弹出确认"));
                    never.append(icon('fa-ban'), text);
                    nodes.push(never);
                }
                scope.replaceChildren(...nodes);
            };
            presetList.addEventListener('change', showScope);
            const remember = (details, key) => {
                details.open = opened.has(key);
                details.addEventListener('toggle', () => { if (details.open) opened.add(key); else opened.delete(key); });
            };
            const boundary = disclosure('is-boundary', 'fa-circle-info', el('strong', null, translateUi("安全边界")), translateUi("这是工具层的检查，不是系统沙箱"));
            const bullets = el('ul', 'pi-bot-sheet-bullets');
            for (const text of [translateUi("允许执行的命令以 OhMyBuddy 服务的权限运行，不会被隔离。"),
                translateUi("“放手”只认得上面列出的常见高风险操作，藏在复杂脚本里的不一定认得出。"),
                translateUi("对外发消息、明显花钱：靠 {0} 按指令先问你和对应功能自己的确认，工具层不一定识别得出。", bot.name),
                translateUi("任何方式下都不会列出全部环境变量。")]) bullets.append(el('li', null, text));
            boundary.content.append(bullets);
            remember(boundary.details, 'boundary');
            // Grants kept from approval cards ("always allow"): shown exactly, revocable here, never added here.
            revoked = new Set();
            const rulesTitle = el('h4', null, translateUi("一直允许的事")); rulesTitle.id = 'pi-bot-sheet-rules-title';
            const rulesCount = el('span', 'pi-bot-sheet-count');
            const rulesHead = el('span', 'pi-bot-sheet-title-row'); rulesHead.append(rulesTitle, rulesCount);
            const rules = disclosure('pi-bot-sheet-rules', 'fa-bolt', rulesHead, translateUi("在确认卡上选过“以后都允许”的操作"));
            remember(rules.details, 'rules');
            const showRules = focusId => {
                const list = current.permissions.rules, nodes = [];
                let live = 0;
                if (!Array.isArray(list)) {
                    live = Number.isSafeInteger(list) && list > 0 ? list : 0;
                    nodes.push(el('p', 'pi-bot-sheet-note', live ? translateUi("有 {0} 条一直允许的规则，暂时读不到详情。", live) : translateUi("还没有一直允许的事。")));
                } else {
                    const known = list.filter(rule => window.PiBotRules?.valid(rule)), other = list.length - known.length;
                    live = list.length - known.filter(rule => revoked.has(rule.id)).length;
                    if (!list.length) nodes.push(el('p', 'pi-bot-sheet-note', translateUi("还没有一直允许的事。在确认卡上选“以后都允许”，会加到这里。")));
                    if (known.length) {
                        const items = el('ul', 'pi-bot-sheet-rule-list');
                        for (const rule of known) {
                            const gone = revoked.has(rule.id);
                            const item = el('li', `pi-bot-sheet-rule${gone ? ' is-revoked' : ''}`);
                            const mark = el('span', 'pi-bot-sheet-rule-icon'); mark.append(icon(window.PiBotRules.isCommand(rule) ? 'fa-terminal' : 'fa-file-pen'));
                            const copy = el('div', 'pi-bot-sheet-rule-copy');
                            const where = window.PiBotRules.place(rule);
                            copy.append(el('small', null, where ? `${window.PiBotRules.label(rule)} · ${where}` : window.PiBotRules.label(rule)), el('code', null, rule.value));
                            if (gone) copy.append(el('small', 'pi-bot-sheet-rule-state', translateUi("保存后撤销")));
                            const toggle = button('pi-bot-chip', gone ? translateUi("不撤销了") : translateUi("撤销"));
                            toggle.dataset.ruleId = rule.id;
                            toggle.setAttribute('aria-label', gone ? translateUi("不撤销：{0}", rule.value) : translateUi("撤销：{0}", rule.value));
                            toggle.addEventListener('click', () => {
                                if (revoked.has(rule.id)) revoked.delete(rule.id); else revoked.add(rule.id);
                                warned = null; status.textContent = ''; delete status.dataset.tone;
                                showRules(rule.id); refreshState();
                            });
                            item.append(mark, copy, toggle); items.append(item);
                        }
                        nodes.push(items);
                    }
                    if (other) nodes.push(el('p', 'pi-bot-sheet-note', translateUi("另有 {0} 条这个版本看不懂的规则，会原样保留。", other)));
                }
                nodes.push(el('p', 'pi-bot-sheet-note', translateUi("只对完全相同的命令（同一个目录）或同一个文件跳过确认，其他照常问你。")));
                rulesCount.textContent = String(live);
                rules.content.replaceChildren(...nodes);
                if (focusId) [...rules.content.querySelectorAll('[data-rule-id]')].find(node => node.dataset.ruleId === focusId)?.focus();
            };
            showRules();
            makePage('mode', translateUi("决定 {0} 什么时候直接动手，什么时候先停下来问你。", bot.name),
                presetList, scopeGroup,
                el('p', 'pi-bot-sheet-note', translateUi("要先问时，聊天输入框上方会出现确认卡：点“允许”才执行这一次，选“不要”或 30 分钟没回答就不做。")),
                boundary.details, rules.details);

            // ---- 主动联系 (M4-3): on/off, quiet hours, a daily push limit, and the follow-ups it
            // plans, each cancellable right here ----------------------------------------------
            const saved = current.notify || {};
            const proactive = switchInput(); proactive.checked = saved.proactive !== false; proactive.dataset.notify = 'proactive';
            const proactiveRow = row(translateUi("让 {0} 主动找我", bot.name), translateUi("记下的事到期时来提醒你、问问进展。你让它设的提醒不受这里影响。"),
                proactive, { tag: 'label', className: 'pi-bot-sheet-check' });
            const quietOn = switchInput(); quietOn.checked = Boolean(saved.quietHours); quietOn.dataset.notify = 'quiet';
            const quietRow = row(translateUi("安静时段"), translateUi("这段时间它主动发的消息不推送，结束时合成一条提醒。"), quietOn, { tag: 'label', className: 'pi-bot-sheet-check' });
            const clock = value => { const input = el('input'); input.type = 'time'; input.step = 60; input.value = value; return input; };
            const quietStart = clock(saved.quietHours?.start || '23:00'), quietEnd = clock(saved.quietHours?.end || '08:00');
            quietStart.setAttribute('aria-label', translateUi("安静时段开始")); quietEnd.setAttribute('aria-label', translateUi("安静时段结束"));
            const quietTimes = el('div', 'pi-bot-sheet-times');
            quietTimes.append(quietStart, el('span', null, translateUi("到")), quietEnd, el('span', 'pi-bot-sheet-zone', translateUi("按这台设备的时区")));
            const limit = el('select'); limit.dataset.notify = 'limit'; limit.setAttribute('aria-label', translateUi("每天推送上限"));
            const limits = [5, 10, 20, 30, 50, 100];
            const currentLimit = saved.dailyProactiveLimit === undefined ? 20 : saved.dailyProactiveLimit;
            if (Number.isSafeInteger(currentLimit) && !limits.includes(currentLimit)) limits.push(currentLimit);
            for (const count of limits.sort((a, b) => a - b)) limit.append(new Option(translateUi("{0} 条", count), String(count)));
            limit.append(new Option(translateUi("不限"), 'none'));
            limit.value = currentLimit === null ? 'none' : String(currentLimit);
            const limitField = row(translateUi("每天推送上限"), translateUi("只算它主动发的推送；超出后消息照样留在聊天里，只是不再推送。"), limit,
                { tag: 'label', className: 'pi-bot-sheet-field' });
            const followTitle = el('h4', 'pi-bot-sheet-group-title', translateUi("准备跟进的事")); followTitle.id = 'pi-bot-sheet-followups-title';
            followTitle.tabIndex = -1;
            const followCard = card([]);
            const followUps = group(followTitle, followCard, { instant: true, className: 'pi-bot-sheet-followups' });
            followUps.setAttribute('role', 'group'); followUps.setAttribute('aria-labelledby', followTitle.id);
            const showFollowUps = () => {
                const list = data.followUps;
                if (!Array.isArray(list)) followCard.replaceChildren(el('p', 'pi-bot-sheet-note', translateUi("暂时读不到准备跟进的事。")));
                else if (!list.length) followCard.replaceChildren(el('p', 'pi-bot-sheet-note', translateUi("现在没有准备跟进的事。")));
                else {
                    const items = el('ul', 'pi-bot-sheet-rule-list');
                    for (const entry of list) {
                        const item = el('li', 'pi-bot-sheet-rule'); item.dataset.followUpId = entry.id;
                        const mark = el('span', 'pi-bot-sheet-rule-icon'); mark.append(icon(entry.kind === 'due' ? 'fa-bell' : 'fa-clock'));
                        const copy = el('div', 'pi-bot-sheet-rule-copy');
                        copy.append(el('strong', null, entry.title), el('small', null, (entry.kind === 'due' ? translateUi("到期提醒 · {0}", when(entry.at)) : translateUi("回来看看 · {0}", when(entry.at)))));
                        const drop = button('pi-bot-chip', translateUi("取消")); drop.dataset.followUpCancel = entry.id;
                        drop.setAttribute('aria-label', translateUi("取消跟进：{0}", entry.title));
                        drop.addEventListener('click', async () => {
                            if (drop.disabled || saving) return;
                            drop.disabled = true;
                            try {
                                await options.api(`/api/pi/bots/${encodeURIComponent(options.profileId)}/follow-ups/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
                                if (!sheet.open) return;
                                data.followUps = data.followUps.filter(other => other.id !== entry.id);
                                showFollowUps(); followTitle.focus?.();
                                await loadActivity(); if (sheet.open) showActivity();
                                options.toast?.(translateUi("已取消这次跟进"), 'success');
                            } catch (error) {
                                if (!sheet.open) return;
                                if (error.status === 404 || error.status === 409) { await loadFollowUps(); if (!sheet.open) return; showFollowUps(); await loadActivity(); if (!sheet.open) return; showActivity(); }
                                status.dataset.tone = 'error'; status.textContent = translateUi("没有取消：{0}", error.message || translateUi("保存失败"));
                            } finally { drop.disabled = false; }
                        });
                        item.append(mark, copy, drop); items.append(item);
                    }
                    followCard.replaceChildren(items);
                }
            };
            showFollowUps();
            // Read-only facts from the scheduler, follow-ups and channel delivery owners.
            // Refresh replaces this view alone, keeping every unsaved settings field in place.
            const activityCard = card([]), activityQuota = el('div');
            const activityLabels = {
                pending: () => translateUi("等待中"), running: () => translateUi("进行中"), completed: () => translateUi("已完成"),
                silent: () => translateUi("已完成，静默"), skipped: () => translateUi("已跳过"), stopped: () => translateUi("已停止"),
                failed: () => translateUi("失败"), uncertain: () => translateUi("结果不确定"), unknown: () => translateUi("状态未提供"),
                none: () => translateUi("无需投递"), held: () => translateUi("安静时段暂存"), sending: () => translateUi("正在投递"),
                delivered: () => translateUi("已投递"), partial: () => translateUi("部分投递"), reviewed: () => translateUi("已人工核对")
            };
            const reasonText = code => {
                if (['cancelled', 'stop-request', 'dropped', 'target-deleted', 'reviewed-uncertain'].includes(code)) return translateUi("用户已取消或停止");
                if (['off', 'proactive-off'].includes(code)) return translateUi("主动联系已关闭");
                if (['chat-gone', 'bot-unavailable', 'binding-changed', 'notification-revoked', 'delivery-revoked'].includes(code)) return translateUi("聊天或连接已变化");
                if (['late', 'expired', 'offline'].includes(code)) return translateUi("已错过执行时间");
                if (['run-limit', 'time-limit'].includes(code)) return translateUi("已达到本次运行的用量或时间限制");
                if (code === 'user-active') return translateUi("用户正在聊天，已跳过这次任务");
                if (code === 'worker-exited') return translateUi("执行实例已退出，结果待核对");
                if (code === 'reply-context-missing') return translateUi("微信回复条件不足，请先在微信发消息");
                if (code === 'wechat-login-expired') return translateUi("微信登录已过期");
                if (code === 'wechat-rate-limited' || code === 'delivery-retrying') return translateUi("微信限流，等待渠道处理");
                if (['delivery-unconfirmed', 'execution-or-delivery-uncertain', 'restart'].includes(code)) return translateUi("结果未确认，请先核对，勿重复发送");
                if (code === 'attachments-incomplete') return translateUi("部分附件未能送达");
                return translateUi("未完成，打开相关页面核对");
            };
            const activityName = kind => kind === 'scheduled' ? translateUi("定时任务") : kind === 'channel' ? translateUi("微信消息") : translateUi("主动跟进");
            const showActivity = () => {
                const snap = data.activity;
                if (!snap) {
                    activityCard.replaceChildren(el('p', 'pi-bot-sheet-note', translateUi("暂时读不到活动，不能据此判断没有任务。")));
                    activityQuota.replaceChildren(el('p', 'pi-bot-sheet-note', translateUi("今日主动推送用量未知。")));
                    return;
                }
                const nodes = [];
                if (Object.values(snap.sources).some(value => value !== 'available')) nodes.push(el('p', 'pi-bot-sheet-note is-warn', translateUi("部分来源暂不可用，下面只显示已知活动。")));
                if (!snap.items.length) nodes.push(el('p', 'pi-bot-sheet-note', translateUi("这次有限范围内没有活动记录；这不是完整历史。")));
                else {
                    const list = el('ul', 'pi-bot-activity-list');
                    for (const item of snap.items) {
                        const entry = el('li', 'pi-bot-activity-item'); entry.dataset.activityId = item.id;
                        const copy = el('div', 'pi-bot-activity-copy');
                        copy.append(el('strong', null, activityName(item.kind)), el('small', null, Number.isFinite(item.at) ? when(item.at) : translateUi("时间未知")));
                        const label = value => activityLabels[value]?.() || activityLabels.unknown();
                        copy.append(el('span', null, translateUi("执行：{0} · 通知/投递：{1}", label(item.execution), label(item.delivery))));
                        if (item.reason) copy.append(el('small', null, reasonText(item.reason)));
                        const actions = el('div', 'pi-bot-activity-actions');
                        const chat = button('pi-bot-chip', translateUi("打开聊天")); chat.dataset.activityChat = item.windowId;
                        chat.addEventListener('click', async () => {
                            if (chat.disabled || saving) return;
                            chat.disabled = true;
                            let state = 'unavailable';
                            try { state = options.checkChat ? await options.checkChat(item.windowId) : 'available'; }
                            catch { /* Keep this sheet and its edits when the destination cannot be checked. */ }
                            finally { chat.disabled = saving; }
                            if (!sheet.open || options.current && !options.current()) return;
                            if (state !== 'available') {
                                status.dataset.tone = 'warn';
                                status.textContent = state === 'archived' ? translateUi("这个话题已归档。设置和修改仍保留，请先在聊天列表恢复话题。")
                                    : translateUi("暂时不能确认这个聊天仍可打开。设置和修改仍保留，请先查看聊天列表。");
                                if (!actions.querySelector('[data-activity-windows]')) {
                                    const windows = button('pi-bot-chip', translateUi("查看聊天列表")); windows.dataset.activityWindows = '';
                                    windows.addEventListener('click', () => leave('activity-windows', () => options.onWindows?.()));
                                    actions.append(windows);
                                }
                                return;
                            }
                            leave(`activity-chat-${item.windowId}`, () => options.onChat?.(item.windowId));
                        });
                        actions.append(chat);
                        if (item.jobId) {
                            const task = button('pi-bot-chip', translateUi("查看任务"));
                            task.addEventListener('click', () => leave(`activity-task-${item.jobId}`, () => window.PiWorkspaceRoute?.navigate('cron', { jobId: item.jobId })));
                            actions.append(task);
                        }
                        if (item.kind === 'channel' || ['failed', 'uncertain', 'partial'].includes(item.delivery)) {
                            const channel = button('pi-bot-chip', translateUi("查看渠道"));
                            channel.addEventListener('click', () => leave('activity-channels', () => window.dispatchEvent(new CustomEvent('workspace:open-settings', { detail: { tab: 'channels' } }))));
                            actions.append(channel);
                        }
                        entry.append(copy, actions); list.append(entry);
                    }
                    nodes.push(list);
                }
                nodes.push(el('p', 'pi-bot-sheet-note', translateUi("只读最近的有限记录（全局最近 {0} 次定时运行、{1} 条渠道记录），最多显示 {2} 项；每个聊天核对最近 {3} 代，链接打开当前一代。", snap.limits.schedulerRuns, snap.limits.channelJobs, snap.limits.items, snap.limits.generationsPerWindow)));
                activityCard.replaceChildren(...nodes);
                const push = snap.quota?.proactivePushes, schedule = snap.quota?.scheduledTasks;
                const quotaNodes = [el('p', 'pi-bot-sheet-note', push ? translateUi("此 Bot 今日主动推送：{0} / {1}（{2}，{3}）；安静时段暂存 {4} 条。", push.used ?? translateUi("未知"), push.limit ?? translateUi("不限"), push.day, push.timeZone, push.held) : translateUi("今日主动推送用量未知。"))];
                if (schedule) {
                    quotaNodes.push(el('p', 'pi-bot-sheet-note', translateUi("全部用户定时任务今日共用额度（UTC）：运行 {0}/{1}，tokens {2}/{3}。不含 Bot 主动跟进和后台学习。", schedule.runs ?? translateUi("未知"), schedule.maxRuns ?? translateUi("未知"), schedule.tokens ?? translateUi("未知"), schedule.maxTokens ?? translateUi("未知"))));
                    quotaNodes.push(el('p', 'pi-bot-sheet-note', schedule.estimatedCost === null ? translateUi("定时任务费用估算未知。") : translateUi("定时任务费用估算：${0}；费用上限：{1}。", schedule.estimatedCost.toFixed(3), schedule.maxCost === null ? translateUi("未设置") : `$${schedule.maxCost}`)));
                } else quotaNodes.push(el('p', 'pi-bot-sheet-note', translateUi("定时任务共用额度暂不可用。")));
                activityQuota.replaceChildren(...quotaNodes);
            };
            showActivity();
            const refreshActivity = button('pi-bot-chip', translateUi("刷新活动")); refreshActivity.dataset.activityRefresh = '';
            refreshActivity.addEventListener('click', async () => {
                if (refreshActivity.disabled) return;
                refreshActivity.disabled = true;
                await loadActivity();
                if (sheet.open) { showActivity(); refreshActivity.disabled = saving; }
            });
            const activityHead = el('div', 'pi-bot-sheet-actions-row'); activityHead.append(refreshActivity);
            const activity = group(translateUi("最近活动与结果"), card([activityHead, activityCard])); activity.dataset.botActivity = '';
            const costs = disclosure('pi-bot-costs', 'fa-coins', el('strong', null, translateUi("模型调用与费用")), translateUi("推送条数不是费用上限"));
            remember(costs.details, 'costs');
            for (const text of [translateUi("聊天和定时任务使用对话模型；空闲整理摘要也会调用这个 Bot 的模型，可能收费。"),
                translateUi("后台学习另外调用辅助模型；关闭学习只暂停学习，不会停止聊天、空闲摘要或定时任务。"),
                translateUi("关闭主动联系会暂停 Bot 自己的跟进和推送；你设置的定时任务仍按计划执行。安静时段和推送上限只控制通知，不限制模型花费。")]) costs.content.append(el('p', 'pi-bot-sheet-note', text));
            const schedules = linkRow('fa-clock', translateUi("管理定时任务"), translateUi("查看运行预算，暂停或取消你设置的任务"));
            schedules.addEventListener('click', () => leave('schedules', () => window.PiWorkspaceRoute?.navigate('cron')));
            const usage = linkRow('fa-chart-simple', translateUi("查看用量统计"), translateUi("按现有统计范围查看模型用量；未报告的费用仍未知"));
            usage.addEventListener('click', () => leave('usage', () => window.dispatchEvent(new CustomEvent('workspace:open-settings', { detail: { tab: 'usage' } }))));
            costs.content.append(activityQuota, schedules, usage);
            const showNotify = () => {
                quietTimes.hidden = !quietOn.checked;
                for (const node of [quietRow, quietTimes, limitField]) node.classList.toggle('is-off', !proactive.checked);
            };
            proactive.addEventListener('change', showNotify); quietOn.addEventListener('change', showNotify);
            showNotify();
            const notifyBox = el('div', 'pi-bot-sheet-notify');
            notifyBox.append(group(null, card([proactiveRow])), group(translateUi("打扰程度"), card([quietRow, quietTimes, limitField])), followUps, activity, costs.details);
            makePage('notify', translateUi("{0} 自己发起的消息：到期提醒、问问进展、过几天回来看看。它只发消息，不会因此自己动手。", bot.name), notifyBox);

            // ---- 微信 (M4-4): chats connected to this Bot. Connecting and disconnecting act at
            // once, like cancelling a follow-up; they are not part of the sheet's Save --------
            const wechat = el('div', 'pi-bot-sheet-wechat');
            const showWechat = () => { wechat.replaceChildren(...wechatNodes()); updateNav(); };
            const wechatAction = async (body, done) => {
                if (saving) return;
                status.textContent = translateUi("正在处理…"); delete status.dataset.tone;
                try {
                    data.channels = await options.api('/api/pi/channels/weixin/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...body, confirmed: true, expectedRevision: data.channels.revision }) });
                    if (!sheet.open) return;
                    status.textContent = ''; options.toast?.(done, 'success');
                } catch (error) {
                    if (!sheet.open) return;
                    await loadChannels();
                    status.dataset.tone = 'error'; status.textContent = translateUi("没有完成：{0}", error.message || translateUi("保存失败"));
                }
                if (sheet.open) showWechat();
            };
            const wechatNodes = () => {
                const channels = data.channels, name = data.bot.name;
                const openChannels = button('pi-bot-chip', translateUi("打开消息渠道设置"));
                openChannels.addEventListener('click', () => leave('channels', () => window.dispatchEvent(new CustomEvent('workspace:open-settings', { detail: { tab: 'channels' } }))));
                const actionRow = (...children) => { const node = el('div', 'pi-bot-sheet-actions-row'); node.append(...children); return node; };
                if (!channels) return [group(null, card([el('p', 'pi-bot-sheet-note', translateUi("暂时读不到微信连接。")), actionRow(openChannels)]))];
                const chats = chatsOf();
                const users = (channels.accounts || []).filter(a => a.enabled).flatMap(a => a.allowedUsers.map(peerId => ({ accountId: a.id, peerId })));
                if (!chats.length && !users.length) {
                    const empty = el('div', 'pi-bot-sheet-empty');
                    const tile = el('span', 'pi-bot-sheet-tile'); tile.append(icon('fa-weixin', 'fa-brands'));
                    empty.append(tile, el('h4', null, translateUi("还没有连接微信")),
                        el('p', null, translateUi("先在消息渠道设置里扫码连接微信，并加入允许的微信用户。")), openChannels);
                    return [card([empty])];
                }
                const nodes = [];
                let connected;
                if (chats.length) {
                    connected = el('ul', 'pi-bot-sheet-rule-list');
                    for (const chat of chats) {
                        const item = el('li', 'pi-bot-sheet-rule'); item.dataset.wechatChat = `${chat.accountId}/${chat.peerId}`;
                        const mark = el('span', 'pi-bot-sheet-rule-icon is-wechat'); mark.append(icon('fa-weixin', 'fa-brands'));
                        const copy = el('div', 'pi-bot-sheet-rule-copy');
                        copy.append(el('strong', null, chat.peerId), el('small', null, chat.bot?.profileId === options.profileId
                            ? translateUi("正在和 {0} 聊", name) : translateUi("正在和别的 Bot 聊；{0} 的提醒和消息也会发到这里", name)));
                        const drop = button('pi-bot-chip', translateUi("断开")); drop.dataset.wechatDisconnect = '';
                        drop.setAttribute('aria-label', translateUi("断开微信：{0}", chat.peerId));
                        drop.addEventListener('click', async () => {
                            const accepted = await window.PiProfileDialog?.confirm({ title: translateUi("断开这个微信聊天？"),
                                message: translateUi("{0} 不会再收到 {1} 的消息和提醒。聊天记录都保留，之后可以再连接。", chat.peerId, name),
                                accept: translateUi("断开"), cancelLabel: translateUi("保留"), current: () => sheet.open });
                            if (!accepted || !sheet.open) return;
                            await wechatAction({ action: 'unbind-bot', accountId: chat.accountId, peerId: chat.peerId, botProfileId: options.profileId }, translateUi("已断开"));
                        });
                        item.append(mark, copy, drop); connected.append(item);
                    }
                } else connected = el('p', 'pi-bot-sheet-note', translateUi("还没有连接微信。连上后可以在微信里直接和 {0} 聊，它的提醒也会发到微信。", name));
                nodes.push(group(translateUi("已连接"), card([connected]), { instant: true }));
                const free = users.filter(user => !chats.some(chat => chat.accountId === user.accountId && chat.peerId === user.peerId));
                if (!users.length) {
                    nodes.push(group(translateUi("连接新的聊天"), card([el('p', 'pi-bot-sheet-note', translateUi("先在消息渠道设置里扫码连接微信，并加入允许的微信用户。")), actionRow(openChannels)])));
                } else if (free.length) {
                    const pickUser = el('select'); pickUser.dataset.wechatPick = '';
                    pickUser.setAttribute('aria-label', translateUi("选择微信用户"));
                    for (const user of free) pickUser.append(new Option(user.peerId, `${user.accountId}\u0000${user.peerId}`));
                    const connect = button('pi-bot-chip', translateUi("连接")); connect.dataset.wechatConnect = '';
                    connect.addEventListener('click', async () => {
                        const [accountId, peerId] = pickUser.value.split('\u0000');
                        const binding = (channels.bindings || []).find(b => b.accountId === accountId && b.peerId === peerId);
                        if (binding) {
                            const accepted = await window.PiProfileDialog?.confirm({ title: translateUi("让这个微信聊天改和 {0} 聊？", name),
                                message: binding.bot ? translateUi("它现在在和“{0}”聊。连接后改和 {1} 聊，原来的 Bot 仍然连着，在微信里发 /切换 可以换回去。", binding.name || '', name)
                                    : translateUi("它现在绑定在线程“{0}”。连接后改为和 {1} 聊，线程和记录都保留。", binding.name || binding.sessionId, name),
                                accept: translateUi("连接"), cancelLabel: translateUi("取消"), current: () => sheet.open });
                            if (!accepted || !sheet.open) return;
                        }
                        await wechatAction({ action: 'bind', accountId, peerId, botProfileId: options.profileId }, translateUi("已连接微信"));
                    });
                    const connectRow = el('div', 'pi-bot-sheet-wechat-connect'); connectRow.append(pickUser, connect);
                    nodes.push(group(translateUi("连接新的聊天"), card([connectRow])));
                }
                nodes.push(el('p', 'pi-bot-sheet-note', translateUi("在微信里发 /切换 换一个 Bot，发 /话题 换话题，发 /help 看全部。")));
                return nodes;
            };
            makePage('wechat', translateUi("在微信里和 {0} 聊天、收它的提醒。连接和断开都立即生效。", bot.name), wechat);

            // ---- 学习与记忆: background learning (server/profile-memory/learning-service.js)
            // applies at once through PUT /profiles/:id/learning and never counts as a sheet edit -
            const learning = el('div', 'pi-bot-sheet-learning');
            let learningBusy = false, learningUncertain = false;
            const toggleLearning = async enabled => {
                if (saving || learningBusy || learningUncertain || !validLearning(data.learning)) return;
                learningBusy = true; showLearning();
                status.textContent = translateUi("正在处理…"); delete status.dataset.tone;
                try {
                    const next = await options.api(`/api/pi/profiles/${encodeURIComponent(options.profileId)}/learning`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ expectedRevision: data.learning.revision, changes: { enabled } })
                    });
                    if (!sheet.open) return;
                    if (!validLearning(next)) throw new Error(translateUi("保存失败"));
                    data.learning = next;
                    status.textContent = ''; delete status.dataset.tone;
                    options.toast?.(enabled ? translateUi("已开启学习") : translateUi("已关闭学习"), 'success');
                } catch (error) {
                    if (!sheet.open) return;
                    if (error.status === 409) {
                        await loadLearning();
                        if (!sheet.open) return;
                        status.dataset.tone = 'warn';
                        status.textContent = translateUi("学习设置刚刚在别处改过，已刷新。");
                    } else if (error.status >= 400 && error.status < 500) {
                        status.dataset.tone = 'error';
                        status.textContent = translateUi("没有完成：{0}", error.message || translateUi("保存失败"));
                    } else {
                        learningUncertain = true;
                        status.dataset.tone = 'error';
                        status.textContent = translateUi("没能确认刚才是否已改好。请重新打开设置看看，不要直接再试。");
                    }
                } finally {
                    learningBusy = false;
                    if (sheet.open) showLearning();
                }
            };
            const learningNodes = () => {
                const snap = data.learning;
                const more = linkRow('fa-seedling', translateUi("更多学习设置"), translateUi("复盘、技能草稿和学习用的辅助模型")); more.dataset.learningMore = '';
                more.addEventListener('click', () => leave('learning', () => options.onLearning ? options.onLearning() : options.onMemory?.('learning')));
                const maxRuns = Number.isSafeInteger(snap?.settings?.maxRunsPerDay) ? snap.settings.maxRunsPerDay : null;
                const noteText = `${translateUi("聊完以后，它会用辅助模型把你的纠正和偏好记到记忆里；复盘和技能草稿可在“更多学习设置”里打开，技能草稿要你看过才会启用。")}${globalThis.PiI18n?.locale?.startsWith('zh') === false ? ' ' : ''}${(maxRuns === null ? translateUi("学习调用上限暂不可用。") : translateUi("会额外调用模型（每天最多 {0} 次）。", maxRuns))}`;
                if (!validLearning(snap) || snap.status !== 'ready' || snap.capabilities?.installed === false || snap.capabilities?.settingsWrite === false) {
                    return [group(translateUi("自己学习"), card([el('p', 'pi-bot-sheet-note', translateUi("暂时不能用学习功能。可以先打开“记忆和关于你”开启长期记忆。")),
                        el('p', 'pi-bot-sheet-note', noteText), more]))];
                }
                const check = switchInput(); check.checked = snap.settings.enabled === true;
                check.dataset.learningSwitch = '';
                check.disabled = saving || learningBusy || learningUncertain;
                check.addEventListener('click', event => event.stopPropagation());
                check.addEventListener('change', event => {
                    event.stopPropagation();
                    void toggleLearning(check.checked);
                });
                const rows = [row(translateUi("让它从聊天里学习"), noteText, check, { tag: 'label', className: 'pi-bot-sheet-check' })];
                const state = snap.health?.state;
                if (state === 'needs-model') {
                    const hint = el('p', 'pi-bot-sheet-note is-warn', translateUi("还没有配置学习用的辅助模型。"));
                    hint.dataset.learningHealth = 'needs-model';
                    const configModels = button('pi-bot-chip', translateUi("配置辅助模型"));
                    configModels.dataset.learningModels = '';
                    configModels.addEventListener('click', () => leave('learning-models', () => window.dispatchEvent(new CustomEvent('workspace:open-settings', { detail: { tab: 'models' } }))));
                    const fix = el('div', 'pi-bot-sheet-actions-row'); fix.append(hint, configModels);
                    rows.push(fix);
                } else if (state === 'quota-exhausted') {
                    const hint = el('p', 'pi-bot-sheet-note is-warn', translateUi("今天的学习次数或额度已经用完，明天会自动恢复。"));
                    hint.dataset.learningHealth = 'quota-exhausted';
                    rows.push(hint);
                } else if (state === 'failing') {
                    const hint = el('p', 'pi-bot-sheet-note is-warn', translateUi("最近几次学习没成功，可以打开更多学习设置看看。"));
                    hint.dataset.learningHealth = 'failing';
                    rows.push(hint);
                }
                const today = snap.health?.today;
                rows.push(el('p', 'pi-bot-sheet-note', today ? translateUi("此身份今日学习（UTC）：运行 {0}/{1}，预留 tokens {2}/{3}；实际 tokens：{4}。", today.runs ?? translateUi("未知"), today.maxRuns ?? translateUi("未知"), today.reservedTokens ?? translateUi("未知"), today.maxTokens ?? translateUi("未知"), today.usedTokens ?? translateUi("暂无报告")) : translateUi("今日学习用量未知。")));
                rows.push(el('p', 'pi-bot-sheet-note', translateUi("关闭学习只暂停辅助模型的后台学习；聊天、空闲摘要和定时任务继续。次数与预留 tokens 额度不是整个 Bot 的费用上限。")));
                rows.push(more);
                return [group(translateUi("自己学习"), card(rows), { instant: true })];
            };
            const showLearning = () => { learning.replaceChildren(...learningNodes()); updateNav(); };
            const syncLearning = () => {
                const check = learning.querySelector('[data-learning-switch]');
                if (check) check.disabled = saving || learningBusy || learningUncertain;
            };
            const memory = linkRow('fa-book-open', translateUi("记忆和关于你"), translateUi("看看、改改它记下的关于你的事"));
            memory.addEventListener('click', () => leave('memory', () => options.onMemory?.()));
            makePage('learning', translateUi("{0} 怎样从聊天里慢慢了解你。", bot.name), learning, group(translateUi("记忆"), card([memory])));

            // ---- 更多: meeting again and the trash --------------------------------------------
            const restart = linkRow('fa-rotate-left', translateUi("重新互相认识"), translateUi("回到主聊天重新访谈；名字和头像会保留"));
            restart.addEventListener('click', async () => {
                if (saving) return;
                const unsaved = edited();
                const accepted = await window.PiProfileDialog?.confirm({ title: translateUi("重新互相认识？"), tone: 'primary',
                    items: [{ icon: 'fa-rotate-left', text: translateUi("会回到主聊天重新访谈。名字和头像保留，其他设置聊到时再改。") },
                        ...(unsaved ? [{ icon: 'fa-triangle-exclamation', tone: 'warn', text: translateUi("还有修改没保存，继续会放弃这些修改。") }] : [])],
                    accept: translateUi("回到主聊天"), cancelLabel: translateUi("先不了"), current: () => sheet.open });
                if (!accepted || !sheet.open || saving) return;
                // The confirmation already named the unsaved edits, so leaving does not warn again.
                warned = 'restart';
                let leaving = false;
                leave('restart', () => { leaving = true; });
                if (leaving) await options.onRestart?.();
            });
            // Moving the Bot to the trash keeps everything and can be undone on the identity page.
            const trash = linkRow('fa-trash-can', translateUi("移到回收站"), translateUi("从 Bot 列表移走；聊天、记忆和文件都保留，可在“身份”页的回收站恢复。"), 'is-danger');
            trash.dataset.sheetAction = 'trash';
            trash.addEventListener('click', () => void moveToTrash());
            makePage('more', translateUi("不常用、但需要时找得到的操作。"),
                ...(window.PiBotOnboarding?.dataNotice ? [window.PiBotOnboarding.dataNotice(bot)] : []),
                group(translateUi("重新开始"), card([restart])), group(translateUi("移除"), card([trash], { className: 'is-danger' })));

            // ---- the side list (desktop) or overview (phones) ---------------------------------
            const items = new Map();
            const nav = el('nav', 'pi-bot-sheet-nav'); nav.setAttribute('aria-label', translateUi("设置分区"));
            const hero = button('pi-bot-sheet-hero'); hero.dataset.nav = 'profile';
            const heroName = el('strong'), heroJob = el('span');
            const heroCopy = el('span', 'pi-bot-sheet-hero-copy'); heroCopy.append(heroName, heroJob);
            hero.append(heroFace, heroCopy, el('span', 'pi-bot-sheet-dirty-dot'), icon('fa-chevron-right'));
            nav.append(hero);
            for (const ids of NAV_GROUPS) {
                const box = el('div', 'pi-bot-sheet-nav-group');
                for (const id of ids) {
                    const section = sectionOf(id), item = button('pi-bot-sheet-nav-item'); item.dataset.nav = id;
                    const tile = el('span', 'pi-bot-sheet-tile'); tile.append(icon(section.icon, section.family));
                    const text = el('span', 'pi-bot-sheet-nav-text');
                    text.append(el('span', 'pi-bot-sheet-nav-label', section.label()), el('span', 'pi-bot-sheet-nav-sub'));
                    const dot = el('span', 'pi-bot-sheet-dirty-dot'); dot.title = translateUi("有没保存的修改");
                    item.append(tile, text, dot, icon('fa-chevron-right'));
                    items.set(id, item); box.append(item);
                }
                nav.append(box);
            }
            nav.addEventListener('click', event => {
                const target = event.target.closest('[data-nav]');
                if (target && nav.contains(target)) go(target.dataset.nav);
            });
            const scroller = el('div', 'pi-bot-sheet-pages');
            scroller.append(...pages.values());
            chrome = { items, pages, hero, heroName, heroJob, scroller };

            controls = { name, job, soul, model, modelPicker, syncModelPicker, thinking, thinkingWrap, presets, showFace, showRules, showScope, proactive, quietOn, quietStart, quietEnd, limit, showNotify, syncLearning,
                syncCounts: () => { for (const sync of counts) sync(); } };
            showFace(); showScope(); showWechat(); showLearning();
            body.replaceChildren(nav, scroller);
            fillThinking(modelLevels(data.models, model.value), botThinking(current));
            initial = formValues();
            showPage();
            refreshState();
        }

        async function loadActivity() {
            const serial = ++activitySerial;
            let snap = null;
            try {
                const value = await options.api(`/api/pi/bots/${encodeURIComponent(options.profileId)}/activity`);
                if (value?.version === 1 && value.profileId === options.profileId && Array.isArray(value.items) && value.sources && value.limits) snap = value;
            } catch { /* Activity is optional, never an empty-success fallback. */ }
            if (sheet.open && serial === activitySerial && data) data.activity = snap;
        }
        async function loadFollowUps() {
            try { data.followUps = (await options.api(`/api/pi/bots/${encodeURIComponent(options.profileId)}/follow-ups`)).items; }
            catch { data.followUps = null; }
        }
        async function loadChannels() {
            try { data.channels = await options.api('/api/pi/channels'); }
            catch { data.channels = null; }
        }
        async function loadLearning() {
            try { data.learning = await options.api(`/api/pi/profiles/${encodeURIComponent(options.profileId)}/learning`); }
            catch { data.learning = null; }
        }
        async function load() {
            const snapshot = await options.api(`/api/pi/bots/${encodeURIComponent(options.profileId)}/settings`);
            if (!sheet.open || dialog !== sheet) return;
            data = snapshot;
            await Promise.all([loadFollowUps(), loadChannels(), loadLearning(), loadActivity()]);
        }

        // The edits made in this sheet, to put back after rereading (only fields the user touched).
        const ownEdits = () => Object.fromEntries(Object.entries(formValues()).filter(([key, value]) => value !== initial[key]));

        // POST /bots/:id/trash after an explicit confirmation, which also names unsaved edits; a
        // failure keeps the sheet open with the user's edits, and success is reported as such.
        async function moveToTrash() {
            if (saving || decoding || !controls || !data) return;
            const name = data.bot.name;
            const accepted = await window.PiProfileDialog?.confirm({ title: translateUi("把 {0} 移到回收站？", name),
                items: [{ icon: 'fa-box-archive', text: translateUi("{0} 会从 Bot 列表里移走。它的名字、性格、记忆、聊天记录和工作目录里的文件都会保留，之后可以在“身份”页的回收站恢复。", name) },
                    ...(edited() ? [{ icon: 'fa-triangle-exclamation', tone: 'warn', text: translateUi("还有修改没保存，继续会放弃这些修改。") }] : [])],
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
            if (!pending) {
                // Show the section with the problem.
                const unnamed = !controls.name.value.trim();
                status.dataset.tone = 'error'; status.textContent = unnamed ? translateUi("名字不能为空") : translateUi("安静时段的开始和结束要是两个不同的时间");
                go(unnamed ? 'profile' : 'notify');
                (unnamed ? controls.name : controls.quietEnd).focus();
                return;
            }
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
