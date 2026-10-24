(() => {
    // Bot mode presentation inside the chat panel: the Bot rail and window list in the
    // session pane, a header with the Bot's face and a plain-language status, and the
    // empty states. The conversation itself is the ordinary chat view; pi-chat.js opens
    // the window's current native session through PiChatNavigation.openBotWindow.
    const translateUi = globalThis.PiI18n?.t || ((text, ...values) => text.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? `{${index}}`));
    const LAST_KEY = 'pivane.bot.last';
    const DEFAULT_FACE = '✨';
    const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };
    const icon = name => { const i = el('i', `fa-solid ${name}`); i.setAttribute('aria-hidden', 'true'); return i; };
    const button = (className, label) => { const b = el('button', className); b.type = 'button'; if (label) { b.title = label; b.setAttribute('aria-label', label); } return b; };

    function face(bot, size = 'md') {
        const node = el('span', `pi-bot-face is-${size}`);
        node.setAttribute('aria-hidden', 'true');
        if (bot?.avatar?.kind === 'image' && bot.id) {
            const img = el('img'); img.alt = ''; img.decoding = 'async';
            img.src = `/api/pi/profiles/${encodeURIComponent(bot.id)}/avatar?version=${encodeURIComponent(bot.avatar.version)}`;
            node.append(img);
        } else node.textContent = bot?.avatar?.kind === 'emoji' ? bot.avatar.value : DEFAULT_FACE;
        return node;
    }

    // Plain-language status for the header; the workbench's technical labels stay hidden.
    const STATUS = {
        connecting: () => translateUi("正在连接…"),
        connected: () => translateUi("在线"),
        working: () => translateUi("正在忙…"),
        waiting: () => translateUi("等你确认"),
        offline: () => translateUi("连接中断，正在重连"),
        error: () => translateUi("暂时连不上")
    };

    class PiBotUi {
        constructor({ api, toast, open, say, pane, header, input, onChange }) {
            Object.assign(this, { api, toast, open, say, pane, header, input, onChange });
            this.bots = []; this.revision = null; this.profileId = null; this.windowId = null;
            this.active = false; this.epoch = 0; this.loaded = false; this.creating = false; this.error = null;
            this.statusKind = 'connecting';
            this.placeholder = input.getAttribute('placeholder') || '';
            pane.hidden = true; header.hidden = true;
            pane.addEventListener('click', event => this.click(event));
            header.addEventListener('click', event => this.click(event));
        }

        bot() { return this.bots.find(item => item.id === this.profileId) || null; }
        window() { return this.bot()?.windows.find(item => item.id === this.windowId) || null; }
        identity() { const bot = this.bot(); return bot ? { id: bot.id, name: bot.name, avatar: bot.avatar } : null; }
        face(size) { return face(this.bot(), size); }
        current() { return this.profileId && this.windowId ? { profileId: this.profileId, windowId: this.windowId } : null; }

        // ---- routing ---------------------------------------------------------------------

        // Whether a route needs a (re)open; the route the chat writes back after opening does not.
        wants(params) {
            const profileId = params.get('profileId'), windowId = params.get('windowId');
            return !this.active || !this.loaded || (profileId && profileId !== this.profileId) || (windowId && windowId !== this.windowId);
        }

        async activate(params) {
            const epoch = ++this.epoch;
            this.active = true; this.error = null;
            this.pane.hidden = false; this.header.hidden = false;
            this.render();
            try {
                await this.load();
                if (epoch !== this.epoch) return;
                if (!this.bots.length) { this.profileId = null; this.windowId = null; this.render(); this.onChange?.('empty'); return; }
                const wanted = params.get('profileId') || localStorage.getItem(LAST_KEY);
                let bot = this.bots.find(item => item.id === wanted && item.enabled) || this.bots.find(item => item.enabled) || this.bots[0];
                if (!bot.enabled) throw new Error(translateUi("这个 Bot 已停用，请在设置中重新启用"));
                let main = bot.windows.find(item => item.kind === 'main' && item.generation !== null);
                if (!main) {
                    await this.api(`/api/pi/bots/${encodeURIComponent(bot.id)}/main-window`, { method: 'POST' });
                    await this.load();
                    if (epoch !== this.epoch) return;
                    bot = this.bots.find(item => item.id === bot.id);
                    main = bot?.windows.find(item => item.kind === 'main' && item.generation !== null);
                    if (!main) throw new Error(translateUi("主聊天暂时无法准备好，请稍后重试"));
                }
                const windowId = bot.windows.some(item => item.id === params.get('windowId') && item.generation !== null && !item.archivedAt)
                    ? params.get('windowId') : main.id;
                this.profileId = bot.id; this.windowId = windowId;
                localStorage.setItem(LAST_KEY, bot.id);
                this.render(); this.onChange?.('identity');
                await this.open({ profileId: bot.id, windowId });
            } catch (error) {
                if (epoch !== this.epoch) return;
                this.error = error.message; this.render();
                this.toast(error.message, 'error');
            }
        }

        deactivate() {
            this.epoch++; this.active = false;
            this.pane.closest('#chat-tab')?.classList.remove('pi-bot-welcome');
            this.pane.hidden = true; this.header.hidden = true;
            this.input.setAttribute('placeholder', this.placeholder);
        }

        async load() {
            const data = await this.api('/api/pi/bots');
            this.revision = data.revision; this.bots = Array.isArray(data.bots) ? data.bots : []; this.loaded = true;
            return data;
        }

        // Re-read names, faces and windows (after an edit elsewhere or a window change).
        async refresh() {
            if (!this.active) return;
            try { await this.load(); this.render(); this.onChange?.('identity'); } catch {}
        }

        go(profileId, windowId) {
            if (window.innerWidth <= 900) document.getElementById('pi-session-pane')?.classList.remove('open');
            window.PiWorkspaceRoute?.navigate('bot', { profileId, ...(windowId ? { windowId } : {}) });
        }

        async create() {
            if (this.creating) return;
            this.creating = true; this.render();
            try {
                if (this.revision === null) await this.load();
                const data = await this.api('/api/pi/bots', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ expectedRevision: this.revision }) });
                localStorage.setItem(LAST_KEY, data.bot.id);
                await this.load();
                this.go(data.bot.id);
            } catch (error) {
                // A stale revision means another tab changed Bots; reload and let the user try again.
                if (error.status === 409) await this.load().catch(() => {});
                this.toast(error.status === 409 ? translateUi("Bot 列表刚刚有变化，请再试一次") : error.message, 'error');
            } finally { this.creating = false; this.render(); }
        }

        async saveSetup(toolCallId, changes) {
            const current = this.current();
            if (!current) throw new Error(translateUi("请先打开 Bot 的聊天"));
            if (this.revision === null) await this.load();
            try {
                const result = await this.api(`/api/pi/bots/${encodeURIComponent(current.profileId)}/setup`, { method: 'POST',
                    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ windowId: current.windowId, toolCallId, changes, expectedRevision: this.revision }) });
                if (result.user && result.user.documentSaved === false) this.toast(translateUi("关于你的内容这次没记下：{0}", result.user.error || ''), 'error');
                return result;
            } finally { await this.refresh(); }
        }

        async onboarding(action) {
            const bot = this.bot();
            if (!bot || this.busy) return;
            this.busy = true;
            try {
                await this.api(`/api/pi/bots/${encodeURIComponent(bot.id)}/onboarding`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action, expectedRevision: this.revision }) });
                await this.refresh();
                if (action === 'start') this.say?.(translateUi("好呀"));
            } catch (error) {
                if (error.status === 409) await this.load().catch(() => {});
                this.toast(error.status === 409 ? translateUi("设置刚刚有变化，请再试一次") : error.message, 'error');
            } finally { this.busy = false; this.onChange?.('identity'); }
        }

        click(event) {
            const target = event.target.closest('[data-bot-action]');
            if (!target) return;
            const action = target.dataset.botAction;
            if (action === 'bot') this.go(target.dataset.botId);
            else if (action === 'window') this.go(this.profileId, target.dataset.windowId);
            else if (action === 'create') void this.create();
            else if (action === 'greet-yes') void this.onboarding('start');
            else if (action === 'greet-skip') void this.onboarding('skip');
            else if (action === 'retry') void this.activate(new URLSearchParams(this.profileId ? { profileId: this.profileId } : {}));
            else if (action === 'settings') {
                if (window.innerWidth <= 900) document.getElementById('pi-session-pane')?.classList.remove('open');
                window.PiWorkspaceRoute?.navigate('profiles', { profileId: this.profileId });
            } else if (action === 'menu') document.getElementById('pi-session-pane')?.classList.toggle('open');
        }

        // ---- status --------------------------------------------------------------------

        status(kind) {
            const next = STATUS[kind] ? kind : 'connected';
            if (next === this.statusKind) return;
            this.statusKind = next; this.renderHeader();
        }

        // ---- rendering -----------------------------------------------------------------

        render() {
            // The welcome page is a focused first step: no empty pane or idle composer around it.
            this.pane.closest('#chat-tab')?.classList.toggle('pi-bot-welcome', this.active && this.loaded && !this.bots.length);
            if (!this.active) return;
            this.renderPane(); this.renderHeader();
            const bot = this.bot();
            this.input.setAttribute('placeholder', bot ? translateUi("给 {0} 发消息", bot.name) : this.placeholder);
        }

        renderPane() {
            const rail = el('nav', 'pi-bot-rail'); rail.setAttribute('aria-label', translateUi("我的 Bot"));
            for (const bot of this.bots) {
                const item = button('pi-bot-rail-item', bot.name); item.dataset.botAction = 'bot'; item.dataset.botId = bot.id;
                if (bot.id === this.profileId) item.setAttribute('aria-current', 'true');
                if (!bot.enabled) item.classList.add('is-disabled');
                item.append(face(bot, 'md'));
                rail.append(item);
            }
            const add = button('pi-bot-rail-add', this.creating ? translateUi("正在创建…") : translateUi("新建 Bot"));
            add.dataset.botAction = 'create'; add.disabled = this.creating;
            add.append(this.creating ? el('span', 'pi-spinner') : icon('fa-plus'));
            rail.append(add);

            const side = el('div', 'pi-bot-side');
            const bot = this.bot();
            if (bot) {
                const head = el('header', 'pi-bot-side-head');
                const copy = el('div', 'pi-bot-side-copy');
                copy.append(el('strong', null, bot.name));
                const onboarding = ['greeting', 'interview'].includes(bot.bot?.onboarding?.phase);
                copy.append(el('span', null, onboarding ? translateUi("还在互相认识") : bot.bot?.job || translateUi("你的私人助理")));
                head.append(face(bot, 'lg'), copy);
                const list = el('nav', 'pi-bot-windows'); list.setAttribute('aria-label', translateUi("聊天"));
                const windows = bot.windows.filter(item => item.generation !== null && !item.archivedAt);
                const main = windows.find(item => item.kind === 'main');
                if (main) list.append(this.windowItem(main, 'fa-comment', translateUi("主聊天")));
                const topics = windows.filter(item => item.kind === 'topic');
                if (topics.length) {
                    list.append(el('p', 'pi-bot-section', translateUi("话题")));
                    for (const topic of topics) list.append(this.windowItem(topic, null, topic.title, topic.emoji));
                }
                const foot = el('footer', 'pi-bot-side-foot');
                const settings = button('pi-bot-settings'); settings.dataset.botAction = 'settings';
                settings.append(icon('fa-sliders'), el('span', null, translateUi("{0} 的设置", bot.name)));
                foot.append(settings);
                side.append(head, list, foot);
            } else if (!this.loaded) {
                side.append(el('p', 'pi-bot-side-state', translateUi("正在读取…")));
            } else if (this.error) {
                const state = el('div', 'pi-bot-side-state');
                const retry = button('pi-bot-link'); retry.dataset.botAction = 'retry'; retry.textContent = translateUi("重试");
                state.append(el('p', null, this.error), retry); side.append(state);
            }
            this.pane.replaceChildren(rail, side);
        }

        windowItem(item, glyph, title, emoji) {
            const node = button('pi-bot-window'); node.dataset.botAction = 'window'; node.dataset.windowId = item.id;
            if (item.id === this.windowId) node.setAttribute('aria-current', 'page');
            const mark = el('span', 'pi-bot-window-mark');
            if (emoji) mark.textContent = emoji; else mark.append(icon(glyph));
            mark.setAttribute('aria-hidden', 'true');
            node.append(mark, el('span', 'pi-bot-window-title', title));
            return node;
        }

        renderHeader() {
            const bot = this.bot();
            const menu = button('pi-bot-menu', translateUi("我的 Bot 与聊天")); menu.dataset.botAction = 'menu';
            menu.append(icon('fa-bars'));
            if (!bot) { this.header.replaceChildren(menu); return; }
            const who = el('div', 'pi-bot-who');
            const name = el('strong', null, bot.name);
            const current = this.window();
            const line = el('span', 'pi-bot-status'); line.dataset.state = this.statusKind;
            line.append(el('i', 'pi-bot-status-dot'), document.createTextNode(STATUS[this.statusKind]()));
            if (current?.kind === 'topic') line.append(document.createTextNode(` · ${current.title}`));
            who.append(name, line);
            this.header.replaceChildren(menu, face(bot, 'sm'), who);
        }

        // Shown in the conversation area when nothing else is: no Bot yet, or a fresh chat.
        emptyState(hasSession) {
            if (!this.active) return null;
            // pi-empty-state: the chat removes it as soon as the first message or tool row appears.
            const root = el('div', 'pi-bot-empty pi-empty-state');
            const bot = this.bot();
            if (!this.loaded) return null;
            if (!this.bots.length) {
                root.classList.add('is-welcome');
                root.append(el('span', 'pi-bot-face is-xl', DEFAULT_FACE));
                root.append(el('h2', null, translateUi("认识你的 Bot")));
                root.append(el('p', null, translateUi("一个一直在的私人助理：记得你说过的话，帮你查、记、写、提醒。先花两三分钟互相认识一下。")));
                const start = button('pi-bot-primary'); start.dataset.botAction = 'create'; start.disabled = this.creating;
                start.append(el('span', null, this.creating ? translateUi("正在创建…") : translateUi("开始")));
                root.append(start);
                root.addEventListener('click', event => this.click(event));
                return root;
            }
            if (!bot || !hasSession) return null;
            const window = this.window();
            if (bot.bot?.onboarding?.phase === 'greeting' && window?.kind === 'main') {
                // The first hello is local: no model call until the user agrees to start.
                root.classList.add('is-greeting');
                const bubble = el('div', 'pi-bot-greeting');
                const head = el('div', 'pi-bot-greeting-head'); head.append(face(bot, 'sm'), el('strong', null, bot.name));
                bubble.append(head, el('p', null, bot.bot.onboarding.firstBot
                    ? translateUi("嗨，我是你的新伙伴，还没有名字。想花两三分钟认识你，也让你认识我。随时可以说“先跳过”。")
                    : translateUi("嗨，我是新来的伙伴，还没有名字。花两三分钟互相认识一下？随时可以说“先跳过”。")));
                const chips = el('div', 'pi-bot-greeting-actions');
                const yes = button('pi-bot-primary'); yes.dataset.botAction = 'greet-yes'; yes.textContent = translateUi("好呀");
                const skip = button('pi-bot-chip'); skip.dataset.botAction = 'greet-skip'; skip.textContent = translateUi("先跳过");
                yes.disabled = skip.disabled = Boolean(this.busy);
                chips.append(yes, skip); bubble.append(chips);
                root.append(bubble);
                root.addEventListener('click', event => this.click(event));
                return root;
            }
            root.append(face(bot, 'xl'), el('h2', null, bot.name));
            root.append(el('p', null, ['skipped', 'done'].includes(bot.bot?.onboarding?.phase) || window?.kind === 'topic'
                ? translateUi("想聊什么都可以直接说。") : translateUi("我们接着刚才的认识聊吧，直接说就好。")));
            return root;
        }
    }

    // ---- setup cards -----------------------------------------------------------------
    // bot_setup_propose waits on one native select. The card recognises it from the running
    // tool call, lets the user edit the proposal, saves through the server and only then
    // answers Save. Anything it does not recognise stays with the generic request dialog.
    const SETUP_TITLE = '保存这些设置？ / Save these settings?', SAVE = '保存 / Save', DECLINE = '先不改 / Not now';
    const SETUP_FIELDS = [['name', () => translateUi("名字"), 40], ['avatar', () => translateUi("头像"), 16],
        ['job', () => translateUi("主要帮你做"), 300], ['personality', () => translateUi("性格"), 6000]];

    function setupFits(event) {
        return event?.method === 'select' && event.title === SETUP_TITLE && Array.isArray(event.options)
            && event.options.length === 2 && event.options[0] === SAVE && event.options[1] === DECLINE;
    }

    function createSetupCards({ enabled, calls, respond, save, face: currentFace, changed }) {
        const panel = el('section', 'pi-bot-setup'); panel.hidden = true;
        panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', translateUi("请你确认设置"));
        let current = null, retry = 0, retries = 0;
        const owns = event => enabled() && setupFits(event);

        function hide() { current = null; panel.hidden = true; panel.replaceChildren(); changed?.(); }

        function render() {
            const { event, args } = current;
            const head = el('header', 'pi-bot-setup-head');
            head.append(currentFace(), el('strong', null, args.finish && Object.keys(args).length === 1
                ? translateUi("我们算是认识啦") : translateUi("这样设置可以吗？")));
            const form = el('div', 'pi-bot-setup-fields');
            for (const [key, label, max] of SETUP_FIELDS) {
                if (typeof args[key] !== 'string') continue;
                const field = el('label', `pi-bot-setup-field is-${key}`);
                const input = key === 'personality' ? el('textarea') : el('input');
                input.value = args[key]; input.maxLength = max; input.dataset.setupField = key;
                if (key === 'personality') input.rows = Math.min(8, Math.max(3, args[key].split('\n').length + 1));
                if (key === 'avatar') input.setAttribute('inputmode', 'text');
                field.append(el('span', null, label()), input);
                form.append(field);
            }
            if (Array.isArray(args.aboutUser) && args.aboutUser.length) {
                const group = el('fieldset', 'pi-bot-setup-about');
                group.append(el('legend', null, translateUi("记住关于你的")));
                for (const item of args.aboutUser) {
                    if (typeof item !== 'string') continue;
                    const option = el('label', 'pi-bot-setup-fact'), box = el('input');
                    box.type = 'checkbox'; box.checked = true; box.value = item; box.dataset.setupFact = '';
                    option.append(box, el('span', null, item));
                    group.append(option);
                }
                form.append(group);
            }
            const foot = el('footer', 'pi-bot-setup-foot');
            const note = el('p', 'pi-bot-setup-note'); note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite');
            if (current.error) { note.textContent = current.error; note.classList.add('is-error'); }
            const later = el('button', 'pi-bot-setup-later', translateUi("先不改")); later.type = 'button';
            const confirm = el('button', 'pi-bot-primary pi-bot-setup-save', current.saving ? translateUi("正在保存…") : translateUi("保存")); confirm.type = 'button';
            later.disabled = confirm.disabled = Boolean(current.saving);
            later.addEventListener('click', () => { respond({ id: event.id, value: DECLINE }); hide(); });
            confirm.addEventListener('click', () => void submit());
            foot.append(note, later, confirm);
            panel.replaceChildren(head, form, foot);
            panel.hidden = false;
        }

        function collect() {
            const changes = {};
            for (const [key] of SETUP_FIELDS) {
                const input = panel.querySelector(`[data-setup-field="${key}"]`);
                if (input) changes[key] = input.value.trim() || null;
            }
            const facts = [...panel.querySelectorAll('[data-setup-fact]')];
            if (facts.length) {
                const kept = facts.filter(box => box.checked).map(box => box.value);
                changes.aboutUser = kept.length ? kept : null;
            }
            if (current.args.finish === true) changes.finish = true;
            return changes;
        }

        async function submit() {
            if (!current || current.saving) return;
            const changes = collect();
            const meaningful = Object.entries(changes).some(([key, value]) => key !== 'finish' && value !== null);
            if (!meaningful && changes.finish !== true) { current.error = translateUi("没有要保存的内容，可以选“先不改”"); render(); return; }
            const target = current;
            target.saving = true; target.error = ''; render();
            try {
                await save(target.call.id, changes);
                if (current !== target) return;
                respond({ id: target.event.id, value: SAVE });
                hide();
            } catch (error) {
                if (current !== target) return;
                target.saving = false;
                target.error = error.status === 409 ? translateUi("设置刚刚有变化，请再点一次保存") : error.message;
                render();
            }
        }

        // Called whenever pending requests change.
        function sync(pending, connected) {
            clearTimeout(retry);
            const event = connected && enabled() ? [...pending.values()].find(setupFits) : null;
            const call = event ? calls()[0] : null;
            if (!event) { retries = 0; if (current) hide(); return; }
            // The request can arrive just before its tool row is drawn; look again shortly.
            if (!call) { if (retries++ < 20) retry = setTimeout(() => sync(pending, connected), 150); return; }
            retries = 0;
            if (current?.event.id === event.id) return;
            current = { event, call, args: call.args || {}, saving: false, error: '' };
            render(); changed?.();
        }

        return { element: panel, owns, sync, hide };
    }

    window.PiBot = Object.freeze({ create: options => new PiBotUi(options), setupCards: createSetupCards, face });
})();
