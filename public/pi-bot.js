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
            // Number of usable chat models; undefined until known, null when it cannot be read.
            this.models = undefined;
            window.addEventListener('workspace:models-changed', () => { if (this.active) void this.checkModels(); });
        }

        async checkModels() {
            try { this.models = (await this.api('/api/pi/bots/readiness')).models ?? null; } catch { this.models = null; }
            if (this.active) this.onChange?.('identity');
        }

        // Only when there is certainly no model: a Bot cannot talk without one.
        needsModel() {
            if (this.models !== 0) return null;
            const note = el('div', 'pi-bot-needs-model');
            note.append(icon('fa-plug'), el('p', null, translateUi("还没有可用的聊天模型。Bot 要接入一个模型才能和你说话。")));
            const setup = button('pi-bot-primary'); setup.dataset.botAction = 'models'; setup.textContent = translateUi("接入模型");
            return [note, setup];
        }

        bot() { return this.bots.find(item => item.id === this.profileId) || null; }
        // The server's latest view of one window (e.g. after it moved to a new generation).
        syncWindow(profileId, record) {
            const bot = this.bots.find(item => item.id === profileId);
            const index = bot?.windows.findIndex(item => item.id === record?.id) ?? -1;
            if (index < 0) return;
            bot.windows[index] = { ...bot.windows[index], ...record };
            this.render();
        }
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
            void this.checkModels();
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
                this.rotationRetries = 0;
            } catch (error) {
                if (epoch !== this.epoch) return;
                // The chat is moving to a new conversation file; that settles in moments.
                if (error.code === 'BOT_WINDOW_ROTATING' && (this.rotationRetries = (this.rotationRetries || 0) + 1) <= 5) {
                    setTimeout(() => { if (epoch === this.epoch) void this.activate(params); }, 1500);
                    return;
                }
                this.rotationRetries = 0;
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

        // The Bot as the setup card compares a proposal with it.
        setupIdentity() {
            const bot = this.bot();
            return bot ? { id: bot.id, name: bot.name, avatar: bot.avatar, job: bot.bot?.job || '', chosen: bot.chosen || null, steps: bot.bot?.onboarding?.steps || {} } : null;
        }

        // A picture face chosen on a setup card, through the profile avatar service.
        async uploadAvatar(dataUrl) {
            const bot = this.bot();
            if (!bot) throw new Error(translateUi("请先打开 Bot 的聊天"));
            if (this.revision === null) await this.load();
            try {
                return await this.api(`/api/pi/profiles/${encodeURIComponent(bot.id)}/avatar`, { method: 'POST',
                    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: this.revision, dataUrl }) });
            } finally { await this.refresh(); }
        }

        // picture: the version of the picture just uploaded for this card, if it answers the face.
        async saveSetup(toolCallId, changes, { picture = null } = {}) {
            const current = this.current();
            if (!current) throw new Error(translateUi("请先打开 Bot 的聊天"));
            if (this.revision === null) await this.load();
            try {
                const result = await this.api(`/api/pi/bots/${encodeURIComponent(current.profileId)}/setup`, { method: 'POST',
                    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ windowId: current.windowId, toolCallId, changes,
                        ...(picture ? { picture } : {}), expectedRevision: this.revision }) });
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
                return true;
            } catch (error) {
                if (error.status === 409) await this.load().catch(() => {});
                this.toast(error.status === 409 ? translateUi("设置刚刚有变化，请再试一次") : error.message, 'error');
                return false;
            } finally { this.busy = false; this.onChange?.('identity'); }
        }

        // ---- what other Bots already know (D-013) --------------------------------------
        // A later Bot first offers to keep what another Bot knows about the user. Entries are
        // shown verbatim and ticked by default; only the ticked ones are copied.
        knownOffer(bot) {
            const known = this.known;
            if (!known || known.botId !== bot.id) { void this.loadKnown(bot.id); return 'loading'; }
            if (known.status === 'loading') return 'loading';
            if (known.status !== 'ready' || !known.sources.length) return null;
            const source = known.sources.find(item => item.profileId === known.sourceId) || known.sources[0];
            const nodes = [el('p', null, translateUi("嗨，我是新来的伙伴，还没有名字。")),
                el('p', null, translateUi("{0} 已经知道你的这些事，要我也记住吗？不想让我知道的可以取消勾选。", source.name))];
            if (known.sources.length > 1) {
                const pick = el('div', 'pi-bot-known-sources'); pick.setAttribute('role', 'group'); pick.setAttribute('aria-label', translateUi("从哪个 Bot"));
                for (const item of known.sources) {
                    const choice = button('pi-bot-known-source'); choice.dataset.botAction = 'known-source'; choice.dataset.profileId = item.profileId;
                    choice.setAttribute('aria-pressed', String(item.profileId === source.profileId));
                    choice.append(face({ ...item, id: item.profileId }, 'xs'), el('span', null, item.name));
                    pick.append(choice);
                }
                nodes.push(pick);
            }
            const list = el('ul', 'pi-bot-known-list');
            for (const entry of source.entries) {
                const row = el('li'), label = el('label'), box = document.createElement('input');
                box.type = 'checkbox'; box.checked = !known.unchecked.has(`${source.profileId}\u0000${entry}`);
                box.dataset.knownEntry = entry; box.dataset.profileId = source.profileId;
                label.append(box, el('span', null, entry)); row.append(label); list.append(row);
            }
            const chosen = source.entries.filter(entry => !known.unchecked.has(`${source.profileId}\u0000${entry}`)).length;
            const actions = el('div', 'pi-bot-greeting-actions');
            const yes = button('pi-bot-primary'); yes.dataset.botAction = 'known-copy';
            yes.textContent = translateUi("记住这 {0} 条", chosen); yes.disabled = Boolean(this.busy) || !chosen;
            const no = button('pi-bot-chip'); no.dataset.botAction = 'known-decline'; no.textContent = translateUi("不用，重新认识");
            no.disabled = Boolean(this.busy);
            actions.append(yes, no);
            nodes.push(list, actions);
            return nodes;
        }

        async loadKnown(botId) {
            this.known = { botId, status: 'loading', sources: [], sourceId: null, unchecked: new Set() };
            try {
                const data = await this.api(`/api/pi/bots/${encodeURIComponent(botId)}/about-sources`);
                if (this.known?.botId !== botId) return;
                Object.assign(this.known, { status: 'ready', sources: Array.isArray(data.sources) ? data.sources : [], sourceId: data.sources?.[0]?.profileId ?? null });
            } catch { if (this.known?.botId === botId) this.known.status = 'error'; }
            // Without the notes the usual greeting shows; the offer is optional.
            this.onChange?.('identity');
        }

        knownToggle(box) {
            const known = this.known, key = `${box.dataset.profileId}\u0000${box.dataset.knownEntry}`;
            if (!known) return;
            if (box.checked) known.unchecked.delete(key); else known.unchecked.add(key);
            const source = known.sources.find(item => item.profileId === box.dataset.profileId);
            const chosen = source ? source.entries.filter(entry => !known.unchecked.has(`${source.profileId}\u0000${entry}`)).length : 0;
            const yes = box.closest('.pi-bot-greeting')?.querySelector('[data-bot-action="known-copy"]');
            if (yes) { yes.textContent = translateUi("记住这 {0} 条", chosen); yes.disabled = Boolean(this.busy) || !chosen; }
        }

        async knownAction(action) {
            const bot = this.bot(), known = this.known;
            if (!bot || this.busy || known?.botId !== bot.id || known.status !== 'ready') return;
            const source = known.sources.find(item => item.profileId === known.sourceId) || known.sources[0];
            const entries = action === 'copy' && source ? source.entries.filter(entry => !known.unchecked.has(`${source.profileId}\u0000${entry}`)) : [];
            if (action === 'copy' && !entries.length) return;
            this.busy = true; this.onChange?.('identity');
            try {
                await this.api(`/api/pi/bots/${encodeURIComponent(bot.id)}/about`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action, ...(action === 'copy' ? { fromProfileId: source.profileId, entries } : {}), expectedRevision: this.revision }) });
                await this.refresh();
            } catch (error) {
                if (error.status === 409) { await this.load().catch(() => {}); this.known = null; }
                this.toast(error.status === 409 ? translateUi("内容刚刚有变化，请再选一次") : error.message, 'error');
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
            else if (action === 'models') window.dispatchEvent(new CustomEvent('workspace:open-settings', { detail: { tab: 'providers' } }));
            else if (action === 'known-copy') void this.knownAction('copy');
            else if (action === 'known-decline') void this.knownAction('decline');
            else if (action === 'known-source' && this.known) { this.known.sourceId = target.dataset.profileId; this.onChange?.('identity'); }
            else if (action === 'retry') void this.activate(new URLSearchParams(this.profileId ? { profileId: this.profileId } : {}));
            else if (action === 'notes') {
                if (window.innerWidth <= 900) document.getElementById('pi-session-pane')?.classList.remove('open');
                this.openNotebook();
            } else if (action === 'settings') {
                if (window.innerWidth <= 900) document.getElementById('pi-session-pane')?.classList.remove('open');
                this.openSettings();
            } else if (action === 'menu') document.getElementById('pi-session-pane')?.classList.toggle('open');
        }

        // What the Bot keeps in mind for the open chat (M2-5).
        openNotebook() {
            const bot = this.bot(), current = this.current();
            if (!bot || !current || !window.PiBotNotebook) return;
            window.PiBotNotebook.open({ api: this.api, toast: this.toast, profileId: current.profileId, windowId: current.windowId,
                name: bot.name, face: size => face(bot, size) });
        }

        openSettings() {
            const profileId = this.profileId;
            if (!profileId || !window.PiBotSettings) { window.PiWorkspaceRoute?.navigate('profiles', { profileId }); return; }
            void window.PiBotSettings.open({ api: this.api, toast: this.toast, profileId, face,
                onSaved: async () => { await this.refresh(); },
                // Memory, about-you notes and learning keep living on the identity page.
                onMemory: () => window.PiWorkspaceRoute?.navigate('profiles', { profileId, section: 'user' }),
                // Getting acquainted again happens in the main chat; the Bot starts once asked.
                onRestart: async () => {
                    const main = this.bot()?.windows.find(item => item.kind === 'main');
                    if (!await this.onboarding('restart')) return;
                    if (main && main.id !== this.windowId) this.go(profileId, main.id);
                    else this.say?.(translateUi("我们重新认识一下吧"));
                } });
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
                const notes = button('pi-bot-notes-link'); notes.dataset.botAction = 'notes';
                notes.append(icon('fa-thumbtack'), el('span', null, translateUi("我记着的事")));
                const settings = button('pi-bot-settings'); settings.dataset.botAction = 'settings';
                settings.append(icon('fa-sliders'), el('span', null, translateUi("{0} 的设置", bot.name)));
                foot.append(notes, settings);
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
            const notes = button('pi-bot-notes-button', translateUi("我记着的事")); notes.dataset.botAction = 'notes';
            notes.append(icon('fa-thumbtack'));
            notes.hidden = !this.windowId;
            this.header.replaceChildren(menu, face(bot, 'sm'), who, notes);
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
                const missing = this.needsModel();
                if (missing) root.append(...missing);
                else {
                    const start = button('pi-bot-primary'); start.dataset.botAction = 'create'; start.disabled = this.creating;
                    start.append(el('span', null, this.creating ? translateUi("正在创建…") : translateUi("开始")));
                    root.append(start);
                }
                root.addEventListener('click', event => this.click(event));
                return root;
            }
            if (!bot || !hasSession) return null;
            const window = this.window();
            // A window that already has earlier conversation continues quietly under it.
            if (window?.generations > 1) { root.classList.add('is-continuing'); return root; }
            if (bot.bot?.onboarding?.phase === 'greeting' && window?.kind === 'main') {
                // The first hello is local: no model call until the user agrees to start.
                root.classList.add('is-greeting');
                const bubble = el('div', 'pi-bot-greeting');
                const head = el('div', 'pi-bot-greeting-head'); head.append(face(bot, 'sm'), el('strong', null, bot.name));
                bubble.append(head);
                root.append(bubble);
                root.addEventListener('click', event => this.click(event));
                const steps = bot.bot.onboarding.steps || {};
                const offer = !bot.bot.onboarding.firstBot && !steps.known ? this.knownOffer(bot) : null;
                if (offer === 'loading') { bubble.append(el('p', 'pi-bot-greeting-wait', '…')); bubble.setAttribute('aria-busy', 'true'); return root; }
                if (offer) {
                    bubble.classList.add('is-known');
                    bubble.append(...offer);
                    root.addEventListener('change', event => { if (event.target.matches?.('input[data-known-entry]')) this.knownToggle(event.target); });
                    return root;
                }
                bubble.append(el('p', null, bot.bot.onboarding.firstBot
                    ? translateUi("嗨，我是你的新伙伴，还没有名字。想花两三分钟认识你，也让你认识我。随时可以说“先跳过”。")
                    : steps.known === 'done' ? translateUi("谢谢，这些我都记下了。我还没有名字，再花两三分钟互相认识一下？随时可以说“先跳过”。")
                        : translateUi("嗨，我是新来的伙伴，还没有名字。花两三分钟互相认识一下？随时可以说“先跳过”。")));
                const missing = this.needsModel();
                if (missing) {
                    const actions = el('div', 'pi-bot-greeting-actions'); actions.append(missing[1]);
                    bubble.append(missing[0], actions);
                    return root;
                }
                const chips = el('div', 'pi-bot-greeting-actions');
                const yes = button('pi-bot-primary'); yes.dataset.botAction = 'greet-yes'; yes.textContent = translateUi("好呀");
                const skip = button('pi-bot-chip'); skip.dataset.botAction = 'greet-skip'; skip.textContent = translateUi("先跳过");
                yes.disabled = skip.disabled = Boolean(this.busy);
                chips.append(yes, skip); bubble.append(chips);
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

    // A picture chosen on the card, as the PNG data URL the avatar service accepts (≤ 1 MiB).
    async function pictureData(file) {
        if (!/^image\/(png|jpeg|webp|gif)$/.test(file?.type || '') || file.size > 6 * 1024 * 1024) throw new Error(translateUi("请选择不超过 6 MiB 的 PNG、JPEG、WebP 或 GIF 图片"));
        const bitmap = await createImageBitmap(file);
        let dataUrl = '';
        try {
            for (const size of [512, 384, 256]) {
                const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
                canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                dataUrl = canvas.toDataURL('image/png');
                if (dataUrl.length <= 1.4 * 1024 * 1024) break;
            }
        } finally { bitmap.close(); }
        if (dataUrl.length > 1.4 * 1024 * 1024) throw new Error(translateUi("图片太大了，请换一张小一点的"));
        return dataUrl;
    }

    // identity(): { id, name, avatar, job, chosen, steps } of the Bot now; uploadPicture(dataUrl) saves a picture
    // face and resolves to the avatar service's answer; notify(message) tells the user something in passing.
    function createSetupCards({ enabled, calls, respond, save, face: currentFace, changed, identity = () => null, uploadPicture = null, notify = null }) {
        const panel = el('section', 'pi-bot-setup'); panel.hidden = true;
        panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', translateUi("请你确认设置"));
        let current = null, retry = 0, retries = 0, serial = 0;
        const owns = event => enabled() && setupFits(event);

        function hide() { current = null; panel.hidden = true; panel.replaceChildren(); changed?.(); }

        // What the card starts from, kept while the card is open (a failed save keeps every edit).
        // A proposed value the Bot already has is left out; a name or face the user chose before
        // stays unless they tick the change (UAT-03).
        function draftFor(args) {
            const now = identity() || {};
            const existing = key => key === 'name' ? now.name ?? null : key === 'avatar' ? (now.avatar?.kind === 'emoji' ? now.avatar.value : null)
                : key === 'job' ? now.job || null : null;
            // chosen: from the server (picked by any path, kept across a new interview).
            const chosen = key => (key === 'name' || key === 'avatar') && (now.chosen ? now.chosen[key] === true
                : now.steps?.identity === 'done' || key === 'avatar' && now.avatar?.kind === 'image');
            const fields = [];
            for (const [key] of SETUP_FIELDS) {
                const value = typeof args[key] === 'string' ? args[key].trim() : '';
                if (!value || existing(key) === value) continue;
                fields.push({ key, value, use: !chosen(key), kept: chosen(key) ? { name: now.name, avatar: now.avatar, id: now.id } : null });
            }
            const facts = [...new Set((Array.isArray(args.aboutUser) ? args.aboutUser : []).filter(item => typeof item === 'string' && item.trim()))]
                .map(text => ({ text, checked: true }));
            // pictureVersion: the uploaded picture, once the avatar service has it.
            return { fields, facts, picture: null, pictureVersion: null };
        }

        function fieldRow(field, draft) {
            const [, label, max] = SETUP_FIELDS.find(([key]) => key === field.key);
            const row = el('div', `pi-bot-setup-field is-${field.key}`);
            const id = `pi-bot-setup-${serial}-${field.key}`;
            const caption = el('label', 'pi-bot-setup-label', label()); caption.htmlFor = id;
            const body = el('div', 'pi-bot-setup-value');
            const input = field.key === 'personality' ? el('textarea') : el('input');
            input.id = id; input.value = field.value; input.maxLength = max; input.dataset.setupField = field.key;
            if (field.key === 'personality') input.rows = Math.min(8, Math.max(3, field.value.split('\n').length + 1));
            if (field.key === 'avatar') { input.setAttribute('inputmode', 'text'); input.setAttribute('aria-label', translateUi("头像表情")); }
            let toggle = null;
            const use = on => { field.use = on; row.classList.toggle('is-kept', !on); if (toggle) toggle.checked = on; };
            input.addEventListener('input', () => { field.value = input.value; if (!field.use) use(true); });
            if (field.key === 'avatar' && draft.picture) {
                const preview = el('span', 'pi-bot-setup-picture'), img = el('img');
                img.src = draft.picture; img.alt = translateUi("新头像图片"); preview.append(img);
                const back = el('button', 'pi-bot-chip', translateUi("改用表情")); back.type = 'button'; back.dataset.setupPicture = 'clear';
                back.addEventListener('click', () => { draft.picture = null; draft.pictureVersion = null; render(); panel.querySelector('[data-setup-field="avatar"]')?.focus(); });
                body.append(preview, back);
            } else body.append(input);
            if (field.key === 'avatar' && uploadPicture) {
                const file = el('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp,image/gif'; file.hidden = true; file.dataset.setupPictureFile = '';
                const pick = el('button', 'pi-bot-chip', draft.picture ? translateUi("换一张") : translateUi("上传图片")); pick.type = 'button'; pick.dataset.setupPicture = 'pick';
                pick.addEventListener('click', () => file.click());
                file.addEventListener('change', async () => {
                    const chosen = file.files?.[0]; file.value = '';
                    if (!chosen || !current) return;
                    const target = current;
                    try {
                        const dataUrl = await pictureData(chosen);
                        if (current !== target) return;
                        draft.picture = dataUrl; draft.pictureVersion = null; use(true); target.error = '';
                    } catch (error) { if (current === target) target.error = error.message; }
                    if (current === target) render();
                });
                body.append(pick, file);
            }
            row.append(caption, body);
            if (field.kept) {
                const hint = el('div', 'pi-bot-setup-current');
                const now = el('span', null, translateUi("现在："));
                now.append(field.key === 'avatar' ? face(field.kept, 'sm') : el('strong', null, field.kept.name || ''));
                const choice = el('label', 'pi-bot-setup-use'); toggle = el('input'); toggle.type = 'checkbox'; toggle.dataset.setupUse = field.key;
                toggle.addEventListener('change', () => use(toggle.checked));
                choice.append(toggle, el('span', null, translateUi("改成上面的")));
                hint.append(now, choice);
                row.append(hint);
            }
            use(field.use);
            return row;
        }

        function render() {
            const { event, args, draft } = current;
            const pictured = Boolean(draft.picture && draft.fields.find(field => field.key === 'avatar')?.use);
            const nothing = !draft.fields.length && !draft.facts.length;
            const head = el('header', 'pi-bot-setup-head');
            head.append(currentFace(), el('strong', null, nothing && args.finish === true ? translateUi("我们算是认识啦")
                : nothing ? translateUi("这些已经是现在的设置了") : translateUi("这样设置可以吗？")));
            const form = el('div', 'pi-bot-setup-fields');
            for (const field of draft.fields) form.append(fieldRow(field, draft));
            if (draft.facts.length) {
                const group = el('fieldset', 'pi-bot-setup-about');
                group.append(el('legend', null, translateUi("记住关于你的")));
                for (const fact of draft.facts) {
                    const option = el('label', 'pi-bot-setup-fact'), box = el('input');
                    box.type = 'checkbox'; box.checked = fact.checked; box.value = fact.text; box.dataset.setupFact = '';
                    box.addEventListener('change', () => { fact.checked = box.checked; });
                    option.append(box, el('span', null, fact.text));
                    group.append(option);
                }
                form.append(group);
            }
            const foot = el('footer', 'pi-bot-setup-foot');
            const note = el('p', 'pi-bot-setup-note'); note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite');
            if (current.error) { note.textContent = current.error; note.classList.add('is-error'); }
            else if (pictured) note.textContent = translateUi("图片会在保存时上传");
            const later = el('button', 'pi-bot-setup-later', translateUi("先不改")); later.type = 'button';
            const confirm = el('button', 'pi-bot-primary pi-bot-setup-save', current.saving ? translateUi("正在保存…") : nothing && args.finish !== true ? translateUi("好") : translateUi("保存"));
            confirm.type = 'button';
            later.disabled = confirm.disabled = Boolean(current.saving);
            later.hidden = nothing && args.finish !== true;
            later.addEventListener('click', () => {
                // A picture already uploaded for this card stays the face even though the rest is not saved.
                if (draft.pictureVersion) notify?.(translateUi("上传的图片已经是头像了；要换回可以在设置里改。"));
                respond({ id: event.id, value: DECLINE }); hide();
            });
            confirm.addEventListener('click', () => void submit());
            foot.append(note, later, confirm);
            panel.replaceChildren(head, form, foot);
            panel.hidden = false;
        }

        // The user's choices, from the draft: a field left unticked or emptied is not saved (null).
        function collect(draft) {
            const changes = {};
            for (const field of draft.fields) changes[field.key] = field.use && field.value.trim() ? field.value.trim() : null;
            const picture = Boolean(draft.picture && draft.fields.find(field => field.key === 'avatar')?.use);
            if (picture) changes.avatar = null;
            if (draft.facts.length) {
                const kept = draft.facts.filter(fact => fact.checked).map(fact => fact.text);
                changes.aboutUser = kept.length ? kept : null;
            }
            if (current.args.finish === true) changes.finish = true;
            return { changes, picture };
        }

        async function submit() {
            if (!current || current.saving) return;
            const target = current, draft = target.draft;
            const { changes, picture } = collect(draft);
            const meaningful = picture || Object.entries(changes).some(([key, value]) => key !== 'finish' && value !== null);
            // Nothing proposed differs from what the Bot already has: answer without saving.
            if (!draft.fields.length && !draft.facts.length && changes.finish !== true) { respond({ id: target.event.id, value: SAVE }); hide(); return; }
            if (!meaningful && changes.finish !== true) { target.error = translateUi("没有要保存的内容，可以选“先不改”"); render(); return; }
            target.saving = true; target.error = ''; render();
            try {
                if (picture && !draft.pictureVersion) {
                    const uploaded = await uploadPicture(draft.picture);
                    if (!/^[a-f0-9]{64}$/.test(uploaded?.profile?.avatar?.version || '')) throw new Error(translateUi("头像图片没有保存成功，请再试一次"));
                    draft.pictureVersion = uploaded.profile.avatar.version;
                }
                await save(target.call.id, changes, { picture: picture ? draft.pictureVersion : null });
                if (current !== target) return;
                respond({ id: target.event.id, value: SAVE });
                hide();
            } catch (error) {
                if (current !== target) return;
                target.saving = false;
                // The face was changed elsewhere after the upload: upload the chosen picture again next time.
                if (error.code === 'BOT_PICTURE_CHANGED') draft.pictureVersion = null;
                target.error = error.code === 'BOT_PICTURE_CHANGED' ? translateUi("头像刚刚在别处被换掉了；你的修改还在，再点保存会重新上传这张图片")
                    : error.status === 409 ? translateUi("设置刚刚有变化，你的修改还在，请再点一次保存") : error.message;
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
            serial += 1;
            const args = call.args || {};
            current = { event, call, args, draft: draftFor(args), saving: false, error: '' };
            render(); changed?.();
        }

        return { element: panel, owns, sync, hide };
    }

    // ---- approval cards ----------------------------------------------------------------
    // In the careful presets the worker asks with one native confirm (server/bot/bot-guard.js)
    // before a gated step runs. The card says what the Bot wants to do; the message carries
    // "<kind> #<token>" on its first line and the detail after a blank line. One at a time.
    const APPROVAL_TITLE = '允许这一步吗？ / Allow this step?';
    const APPROVAL_KINDS = {
        command: name => translateUi("{0} 想运行一条命令", name),
        delegate: name => translateUi("{0} 想把这件事交给另一个助手", name),
        outside: name => translateUi("{0} 想改工作目录以外的文件", name),
        write: name => translateUi("{0} 想写入文件", name),
        memory: name => translateUi("{0} 想记下这件事", name),
        action: name => translateUi("{0} 想做这一步", name)
    };
    function parseApproval(event) {
        if (event?.method !== 'confirm' || event.title !== APPROVAL_TITLE) return null;
        const match = /^([a-z]+) #[a-f0-9]{16}\n\n([\s\S]*)$/.exec(typeof event.message === 'string' ? event.message : '');
        return match && Object.hasOwn(APPROVAL_KINDS, match[1]) ? { kind: match[1], detail: match[2] } : null;
    }
    // Other steps name a tool; the familiar ones read as what they do.
    const APPROVAL_ACTIONS = { deliver_files: () => translateUi("把文件交给你"), get_attachment: () => translateUi("取出你上传的附件原件"),
        media_generate: () => translateUi("生成图片、视频或语音") };

    function createApprovalCards({ enabled, respond, face: currentFace, name, changed }) {
        const panel = el('section', 'pi-bot-setup pi-bot-approval'); panel.hidden = true;
        panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', translateUi("等你确认"));
        let current = null;
        const owns = event => enabled() && Boolean(parseApproval(event));

        function hide() { if (!current && panel.hidden) return; current = null; panel.hidden = true; panel.replaceChildren(); changed?.(); }

        function render(waiting) {
            const { event, kind, detail } = current;
            const head = el('header', 'pi-bot-setup-head');
            head.append(currentFace(), el('strong', null, APPROVAL_KINDS[kind](name() || 'Bot')));
            const shown = kind === 'action' && Object.hasOwn(APPROVAL_ACTIONS, detail) ? APPROVAL_ACTIONS[detail]() : detail;
            const body = el('pre', `pi-bot-approval-detail is-${kind}`, shown);
            body.tabIndex = 0;
            const foot = el('footer', 'pi-bot-setup-foot');
            const note = el('p', 'pi-bot-setup-note', waiting > 0 ? translateUi("后面还有 {0} 步等你确认", waiting) : '');
            const deny = el('button', 'pi-bot-setup-later', translateUi("不要")); deny.type = 'button';
            const allow = el('button', 'pi-bot-primary pi-bot-approval-allow', translateUi("允许")); allow.type = 'button';
            const answer = confirmed => {
                if (current?.event.id !== event.id || current.answered) return;
                current.answered = true; deny.disabled = allow.disabled = true;
                respond({ id: event.id, confirmed });
            };
            deny.addEventListener('click', () => answer(false));
            allow.addEventListener('click', () => answer(true));
            foot.append(note, deny, allow);
            panel.replaceChildren(head, body, foot);
            panel.hidden = false;
        }

        // Called whenever pending requests change; the answered request leaves when the
        // server reports it resolved.
        function sync(pending, connected) {
            const requests = connected && enabled() ? [...pending.values()].filter(event => parseApproval(event)) : [];
            if (!requests.length) { hide(); return; }
            const event = requests[0];
            if (current?.event.id !== event.id) current = { event, ...parseApproval(event), answered: false };
            else if (current.answered) return;
            render(requests.length - 1); changed?.();
        }

        return { element: panel, owns, sync, hide };
    }

    // ---- earlier conversation of a window ----------------------------------------------
    // Each earlier generation of the open window is a read-only archive above the live
    // transcript, loaded from the server (no worker). Newest first; older ones on request.
    function createWindowHistory({ host, api, current, archive: archiveOptions, scroll }) {
        let key = null, epoch = 0, generations = [], archives = [];
        const day = value => {
            const date = new Date(value);
            return Number.isFinite(date.getTime()) ? date.toLocaleDateString(globalThis.PiI18n?.locale || 'zh-CN', { month: 'short', day: 'numeric' }) : '';
        };
        const range = record => { const from = day(record.startedAt), to = day(record.endedAt); return from === to || !to ? from : `${from} – ${to}`; };
        const query = input => Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined).map(([name, value]) => [name, String(value)]));

        function reset() {
            epoch++; key = null; generations = []; archives = [];
            host.replaceChildren(); host.hidden = true;
        }

        function addOlder(target) {
            const record = generations[archives.length];
            if (!record) return;
            const mine = epoch;
            const container = el('section', 'pi-transcript-archive pi-bot-history-generation'); container.hidden = true;
            scroll.preserve(() => { host.prepend(container); host.hidden = false; });
            const base = `/api/pi/bots/${encodeURIComponent(target.profileId)}/windows/${encodeURIComponent(target.windowId)}/history?`;
            let instance = null;
            instance = window.PiTranscriptArchive.create({ ...archiveOptions, container, track: null,
                request: (_type, input) => api(base + new URLSearchParams({ generation: String(record.generation), ...query(input) }))
                    .catch(error => { throw Object.assign(error, { errorCode: error.code }); }),
                anchor: () => `bot-generation:${target.windowId}:${record.generation}`,
                // A generation without any turns (rotated before anyone spoke) hides itself; go
                // straight on to the one before it so older conversation stays reachable.
                onIndex: count => { if (!count && mine === epoch && instance === archives.at(-1)) addOlder(target); },
                labels: () => ({
                    head: () => translateUi("更早的聊天 · {0}", range(record)),
                    note: () => '',
                    extra: () => {
                        if (instance !== archives.at(-1) || archives.length >= generations.length) return null;
                        const more = el('button', 'pi-archive-link', translateUi("再往前看")); more.type = 'button';
                        more.addEventListener('click', () => addOlder(target));
                        return more;
                    }
                }) });
            archives.push(instance);
            instance.setEnabled(true);
            // The previously oldest head loses its "further back" link.
            for (const item of archives) item.sync();
        }

        // Called whenever the open conversation (re)connects.
        async function open() {
            const target = current();
            const next = target ? `${target.profileId}|${target.windowId}|${target.generation}` : null;
            if (next === key) { for (const item of archives) item.sync(); return; }
            reset(); key = next;
            if (!target || !target.generation) return;
            const mine = epoch;
            try {
                const data = await api(`/api/pi/bots/${encodeURIComponent(target.profileId)}/windows/${encodeURIComponent(target.windowId)}/generations`);
                if (mine !== epoch) return;
                generations = (data.generations || []).filter(item => !item.current).sort((a, b) => b.generation - a.generation);
                if (generations.length) addOlder(target);
            } catch { if (mine === epoch) key = null; }
        }

        return { open, reset };
    }

    window.PiBot = Object.freeze({ create: options => new PiBotUi(options), setupCards: createSetupCards, approvalCards: createApprovalCards,
        history: createWindowHistory, face });
})();
