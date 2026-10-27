(() => {
    // The end of getting acquainted (onboarding flow 2): once the interview has finished, the
    // main chat shows, locally and without any model call, how the Bot works and where things
    // are kept, an optional choice of model from the existing list, and a few first things to
    // do. A suggestion is sent as the user's message only when they click it. Each choice is
    // saved through POST /bots/:id/onboarding; a failed save keeps the choice on screen and the
    // panel never says a model was saved unless the server's Bot record shows it.
    const translateUi = globalThis.PiI18n?.t || ((text, ...values) => text.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? `{${index}}`));
    const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };
    const icon = name => { const i = el('i', `fa-solid ${name}`); i.setAttribute('aria-hidden', 'true'); return i; };
    const button = (className, text) => { const b = el('button', className, text); b.type = 'button'; return b; };
    const modelKey = model => model ? `${model.provider}\u0000${model.id}` : '';
    const THINKING = { off: () => translateUi("不启用"), minimal: () => translateUi("极简"), low: () => translateUi("低"), medium: () => translateUi("中"),
        high: () => translateUi("高"), xhigh: () => translateUi("极高"), max: () => translateUi("最大") };
    // First things to do: [choice, chip, the message sent when it is clicked]. Chips stay short so
    // all six choices fit two rows on a narrow phone.
    const FIRST_TASKS = [
        ['study', () => translateUi("学点东西"), () => translateUi("我想先从学习开始：帮我定一个小目标，再一步步陪我学。")],
        ['plan', () => translateUi("理一理安排"), () => translateUi("帮我理一理接下来要做的事，排一个轻松可行的计划。")],
        ['write', () => translateUi("写点东西"), () => translateUi("我想请你帮我写点东西，先问问我要写什么吧。")],
        ['chat', () => translateUi("随便聊聊"), () => translateUi("我们先随便聊聊吧。")]
    ];
    // Phones fold the facts so the conversation above stays readable (pi-bot.css uses the same width).
    const COMPACT = '(max-width: 680px)';
    // Moving focus to the composer would open a phone's on-screen keyboard; only fine pointers get it.
    const FINE_POINTER = '(hover: hover) and (pointer: fine)';
    const matches = query => Boolean(globalThis.matchMedia?.(query).matches);
    const WORK = {
        free: () => translateUi("现在的做事方式是“放手”：几乎所有事我直接办好，只有少数危险操作会先问你。"),
        balanced: () => translateUi("现在的做事方式是“稳妥”：运行命令、改工作目录以外的文件之前，会弹出确认等你允许。"),
        ask: () => translateUi("现在的做事方式是“每次都问”：除了看和回答，每一步动手前都会弹出确认。")
    };

    // Only Bots whose (new or restarted) interview used flow 2 get the closure; finished older
    // Bots are never asked again. It ends once the first-task step is answered (done or later).
    function pending(bot) {
        const onboarding = bot?.bot?.onboarding;
        return onboarding?.flowVersion === 2 && onboarding.phase === 'done' && !onboarding.steps?.['first-task'];
    }

    // A model the server refused to save, in plain words.
    function modelProblem(error) {
        if (error?.code === 'BOT_MODEL_UNAVAILABLE') return translateUi("这个模型现在用不了，你的选择还在。可以换一个，或者先跟随默认。");
        if (error?.status === 409 && !error.code) return translateUi("设置刚刚有变化，你的选择还在，请再点一次");
        return translateUi("模型没有保存：{0}", error?.message || translateUi("保存失败"));
    }

    // target(): { bot, window, idle } of the open Bot chat, or null; load(profileId): the Bot's
    // settings with the model list (GET /bots/:id/settings); submit(profileId, body): saves one
    // step and resolves after the Bot list was reread; say(text): sends a message as the user,
    // false when the composer holds a draft; draft(): whether it does; focusComposer();
    // notify(message, timeout): a passing notice.
    function closure({ target, load, submit, say, draft, focusComposer, notify, face, changed }) {
        const panel = el('section', 'pi-bot-setup pi-bot-closure'); panel.hidden = true;
        panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', translateUi("认识好啦"));
        // Per Bot while the page is open: the model list, the user's pick, what is being saved.
        let state = null, shown = '';
        // Bots whose user wrote their own message instead of choosing: the panel stays away on this
        // page (nothing is saved; it comes back after a reload while the step is still open).
        const dismissed = new Set();

        function hide() { if (panel.hidden) return; panel.hidden = true; panel.replaceChildren(); shown = ''; changed?.(); }

        async function models(profileId) {
            state.models = 'loading';
            try {
                const data = await load(profileId);
                if (state?.botId !== profileId) return;
                state.models = data?.models && Array.isArray(data.models.models) ? data.models : null;
                if (state.pick === undefined) state.pick = { key: modelKey(data?.bot?.bot?.model), thinking: data?.bot?.bot?.model?.thinking || '' };
            } catch { if (state?.botId === profileId) state.models = 'error'; }
            if (state?.botId === profileId) render();
        }

        function sync() {
            const now = target();
            // A first task chosen here hides the panel even before the reread list shows it; once the
            // server shows the step settled, a later round (getting acquainted again) may ask anew.
            if (now?.bot && !pending(now.bot)) {
                dismissed.delete(now.bot.id);
                if (state?.answered && state.botId === now.bot.id) state.answered = false;
            }
            const show = Boolean(now && now.window?.kind === 'main' && pending(now.bot) && !dismissed.has(now.bot.id)
                && !(state?.botId === now.bot.id && state.answered) && (now.idle || state?.botId === now.bot.id && state.saving));
            if (!show) { hide(); return; }
            if (state?.botId !== now.bot.id) {
                state = { botId: now.bot.id, models: null, pick: undefined, saving: null, error: '', draftBlocked: false, answered: false, about: undefined };
                void models(now.bot.id);
            }
            // The "draft in the way" note goes once the composer is empty again.
            if (state.draftBlocked && !draft()) { state.draftBlocked = false; state.error = ''; shown = ''; }
            const onboarding = now.bot.bot.onboarding;
            const key = JSON.stringify([now.bot.id, now.bot.name, now.bot.avatar, onboarding.steps, now.bot.bot.model, now.bot.bot.permissions?.preset]);
            if (key !== shown || panel.hidden) render();
        }

        // The model to save: a listed one, the Bot's current one exactly as saved (also when it is not
        // listed right now), or null for following the default.
        const selected = current => {
            const list = state.models && typeof state.models === 'object' ? state.models.models : [];
            const item = list.find(entry => modelKey(entry) === state.pick?.key);
            if (!item) return current && state.pick?.key === modelKey(current) ? { ...current } : null;
            const levels = item.thinkingLevels || [];
            return { provider: item.provider, id: item.id, ...(state.pick.thinking && levels.includes(state.pick.thinking) ? { thinking: state.pick.thinking } : {}) };
        };
        // The name of the model new chats use by default, when the list says.
        const defaultName = data => {
            const defaults = data?.defaults, item = defaults && data.models.find(entry => entry.provider === defaults.provider && entry.id === defaults.modelId);
            return item ? item.name || item.id : '';
        };
        const modelName = (model, data) => {
            if (!model) { const name = defaultName(data); return name ? translateUi("跟随默认（{0}）", name) : translateUi("跟随默认"); }
            const item = data?.models?.find(entry => modelKey(entry) === modelKey(model));
            return item?.name || model.id;
        };
        const savedLine = (model, data) => {
            if (model) return translateUi("用 {0} 说话，以后可以在设置里改。", modelName(model, data));
            const name = defaultName(data);
            return name ? translateUi("用默认模型（{0}）说话，以后可以在设置里改。", name) : translateUi("用默认模型说话，以后可以在设置里改。");
        };

        function modelPart(bot) {
            const part = el('div', 'pi-bot-closure-model');
            const label = el('p', 'pi-bot-closure-label', translateUi("说话用的模型（可以不改）"));
            part.append(label);
            const data = state.models && typeof state.models === 'object' ? state.models : null;
            const done = bot.bot.onboarding.steps?.model;
            if (done) {
                // What the server's Bot record says now, not what was asked for.
                const line = el('p', 'pi-bot-closure-saved');
                line.append(icon('fa-circle-check'), el('span', null, savedLine(bot.bot.model, data)));
                part.append(line);
                return part;
            }
            if (state.models === 'loading' || state.models === null && state.pick === undefined) { part.append(el('p', 'pi-bot-closure-hint', translateUi("正在读取模型列表…"))); return part; }
            if (state.models === 'error') {
                const retry = button('pi-bot-link', translateUi("重试"));
                retry.addEventListener('click', () => void models(bot.id));
                const line = el('p', 'pi-bot-closure-hint', translateUi("模型列表没读到。")); line.append(' ', retry);
                part.append(line);
                return part;
            }
            if (!data) { part.append(el('p', 'pi-bot-closure-hint', translateUi("暂时读不到模型列表，之后可以在设置里选。"))); return part; }
            const row = el('div', 'pi-bot-closure-model-row');
            const select = el('select'); select.dataset.closureModel = '';
            select.setAttribute('aria-label', translateUi("说话用的模型"));
            select.append(new Option(modelName(null, data), ''));
            const groups = new Map();
            for (const item of data.models) {
                if (!groups.has(item.provider)) { const group = el('optgroup'); group.label = item.provider; groups.set(item.provider, group); select.append(group); }
                groups.get(item.provider).append(new Option(item.name || item.id, modelKey(item)));
            }
            // A saved model that is not listed right now stays selectable as it is, as in Bot settings.
            const saved = bot.bot.model;
            if (saved && !data.models.some(item => modelKey(item) === modelKey(saved)))
                select.append(new Option(translateUi("{0}（现在不可用）", saved.id), modelKey(saved)));
            if (![...select.options].some(option => option.value === state.pick.key)) state.pick = { key: '', thinking: '' };
            select.value = state.pick.key;
            row.append(select);
            const levels = data.models.find(item => modelKey(item) === select.value)?.thinkingLevels || [];
            if (levels.length) {
                const thinking = el('select'); thinking.dataset.closureThinking = '';
                thinking.setAttribute('aria-label', translateUi("思考程度"));
                thinking.append(new Option(translateUi("跟随默认"), ''));
                for (const level of levels) thinking.append(new Option(THINKING[level]?.() || level, level));
                thinking.value = levels.includes(state.pick.thinking) ? state.pick.thinking : '';
                thinking.addEventListener('change', () => { state.pick.thinking = thinking.value; });
                row.append(thinking);
            }
            select.addEventListener('change', () => { state.pick = { key: select.value, thinking: '' }; state.error = ''; render(); panel.querySelector('[data-closure-model]')?.focus(); });
            const use = button('pi-bot-chip pi-bot-closure-use', state.saving === 'model' ? translateUi("正在保存…") : translateUi("就用这个"));
            use.dataset.closureAction = 'model';
            use.addEventListener('click', () => void chooseModel(bot));
            row.append(use);
            part.append(row);
            return part;
        }

        async function chooseModel(bot) {
            if (state.saving) return;
            const mine = state, model = selected(bot.bot.model);
            mine.saving = 'model'; mine.error = ''; render();
            try { await submit(bot.id, { action: 'model-choice', model }); }
            catch (error) { mine.error = modelProblem(error); }
            finally { mine.saving = null; }
            if (state === mine) { render(); sync(); }
        }

        // After a choice the panel goes away. Keyboard and mouse users continue in the composer;
        // a phone's keyboard is not opened for them, and focus the user moved elsewhere stays.
        function settleFocus() {
            const active = document.activeElement;
            if ((!active || active === document.body) && matches(FINE_POINTER)) focusComposer?.();
        }

        async function chooseTask(bot, choice, message) {
            if (state.saving) return;
            const mine = state;
            if (message && draft()) { mine.error = translateUi("输入框里还有草稿，先发送或清空它"); mine.draftBlocked = true; render(); return; }
            mine.saving = 'task'; mine.error = ''; mine.draftBlocked = false; render();
            try { await submit(bot.id, { action: 'first-task', choice }); }
            catch (error) {
                mine.saving = null;
                mine.error = error.status === 409 && !error.code ? translateUi("设置刚刚有变化，请再选一次") : error.message || translateUi("保存失败");
                if (state === mine) render();
                return;
            }
            mine.saving = null; mine.answered = true;
            sync();
            // Only now, and only for the suggestion the user clicked, does anything reach the model.
            // The choice is a selection, not the task being done. Text typed into the composer while
            // the choice was saved stays as it is; the suggestion is then not sent, and that is said.
            if (message) {
                if (draft() || say(message) === false) notify?.(translateUi("已记下你的选择，但输入框里有草稿，这条建议没有发出；草稿原样保留。"), 8000);
                else settleFocus();
            } else if (choice === 'own') focusComposer?.();
            else { notify?.(translateUi("好的，想到要做什么，随时跟我说。")); settleFocus(); }
        }

        // The user wrote their own message while the panel was waiting for a choice: step aside on
        // this page instead of coming back after every reply. Nothing is recorded on the server.
        function ownMessage() {
            const now = target();
            if (!now?.bot || now.window?.kind !== 'main' || !pending(now.bot) || state?.botId === now.bot.id && (state.answered || state.saving)) return;
            dismissed.add(now.bot.id);
            hide();
        }

        // The composer changed: a "draft in the way" note leaves once the draft is gone.
        function composerChanged() {
            if (!state?.draftBlocked || draft() || panel.hidden) return;
            state.draftBlocked = false; state.error = ''; render();
        }

        function render() {
            const now = target();
            if (!now || !state || state.botId !== now.bot?.id) { hide(); return; }
            const bot = now.bot, onboarding = bot.bot.onboarding;
            shown = JSON.stringify([bot.id, bot.name, bot.avatar, onboarding.steps, bot.bot.model, bot.bot.permissions?.preset]);
            const head = el('header', 'pi-bot-setup-head');
            head.append(face(), el('strong', null, translateUi("认识好啦！先说说我平时怎么做事")));
            const facts = el('ul', 'pi-bot-closure-facts');
            const fact = (glyph, text) => { const item = el('li'); item.append(icon(glyph), el('span', null, text)); facts.append(item); };
            fact('fa-house-laptop', translateUi("聊天、记忆和我做的文件都保存在运行 Pivane 的这台电脑上；回复时，需要的内容会发给下面选的模型服务。"));
            fact('fa-thumbtack', translateUi("关于你的事记在“关于你”，这段聊天定下的事记在“我记着的事”，都能随时查看和修改。"));
            fact('fa-shield-halved', `${(WORK[bot.bot.permissions?.preset] || WORK.free)()} ${translateUi("这些确认在 Pivane 的工具层进行，不是系统沙箱；可以在设置里改。")}`);
            // The facts fold away on phones (open on wider screens) and keep the user's own toggle.
            const about = el('details', 'pi-bot-closure-about');
            about.open = state.about ?? !matches(COMPACT);
            const summary = el('summary');
            summary.append(icon('fa-circle-info'), el('span', null, translateUi("东西存在哪、动手前怎么问你")));
            about.append(summary, facts);
            const mine = state;
            about.addEventListener('toggle', () => { mine.about = about.open; });
            // Only the facts and the model scroll; the choices below always stay in view.
            const body = el('div', 'pi-bot-setup-fields pi-bot-closure-body');
            body.append(about, modelPart(bot));
            const tasks = el('div', 'pi-bot-closure-tasks'); tasks.setAttribute('role', 'group');
            const ask = el('p', 'pi-bot-closure-label', translateUi("想先做点什么？点一下就会发给 {0}。", bot.name)); ask.id = `pi-bot-closure-ask-${bot.id}`;
            tasks.setAttribute('aria-labelledby', ask.id);
            const chips = el('div', 'pi-bot-closure-chips');
            for (const [choice, label, message] of FIRST_TASKS) {
                const chip = button('pi-bot-chip', label()); chip.dataset.closureTask = choice;
                chip.addEventListener('click', () => void chooseTask(bot, choice, message()));
                chips.append(chip);
            }
            const own = button('pi-bot-chip', translateUi("我自己说")); own.dataset.closureTask = 'own';
            own.addEventListener('click', () => void chooseTask(bot, 'own', ''));
            // Ending here is as easy as choosing: "later" sits with the choices, not behind them.
            const later = button('pi-bot-setup-later', translateUi("以后再说")); later.dataset.closureTask = 'later';
            later.addEventListener('click', () => void chooseTask(bot, 'later', ''));
            chips.append(own, later);
            tasks.append(ask, chips);
            const foot = el('footer', 'pi-bot-setup-foot');
            const note = el('p', 'pi-bot-setup-note', state.error || ''); note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite');
            note.classList.toggle('is-error', Boolean(state.error));
            foot.append(note);
            const focused = panel.contains(document.activeElement) ? document.activeElement : null;
            const focusKey = focused?.dataset.closureTask || focused?.dataset.closureAction || (focused?.hasAttribute('data-closure-model') ? 'model-select'
                : focused?.matches('.pi-bot-closure-about > summary') ? 'about' : '');
            // A redraw (a pick, a save) keeps the reading position of the scrolling part.
            const scrolled = panel.hidden ? 0 : panel.querySelector('.pi-bot-closure-body')?.scrollTop || 0;
            panel.replaceChildren(head, body, tasks, foot);
            if (state.saving) for (const control of panel.querySelectorAll('button,select')) control.disabled = true;
            const wasHidden = panel.hidden;
            panel.hidden = false;
            if (scrolled) body.scrollTop = scrolled;
            // Keep keyboard focus on the same control across a redraw.
            if (focusKey) panel.querySelector(focusKey === 'model-select' ? '[data-closure-model]' : focusKey === 'about' ? '.pi-bot-closure-about > summary'
                : `[data-closure-task="${focusKey}"],[data-closure-action="${focusKey}"]`)?.focus({ preventScroll: true });
            if (wasHidden) changed?.();
        }

        return { element: panel, sync, hide, ownMessage, composerChanged };
    }

    window.PiBotOnboarding = Object.freeze({ closure, pending, FIRST_TASKS: Object.freeze(FIRST_TASKS.map(([choice]) => choice)) });
})();
