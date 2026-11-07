(() => {
    // Bot mode presentation inside the chat panel: the Bot rail and window list in the
    // session pane, a header with the Bot's face and a plain-language status, and the
    // empty states. The conversation itself is the ordinary chat view; pi-chat.js opens
    // the window's current native session through PiChatNavigation.openBotWindow.
    const translateUi = globalThis.PiI18n?.t || ((text, ...values) => text.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? `{${index}}`));
    const LAST_KEY = 'pivane.bot.last';
    // Topic badges are reread on events only (a reply settling, the phone drawer opening), at most
    // once in this many milliseconds; a request inside the gap waits for its end once.
    const TOPIC_INDEX_GAP = 5000;
    const DEFAULT_FACE = '✨';
    // The face a new Bot starts with (server/bot/bot-service.js), shown on the welcome page too.
    const NEW_BOT_FACE = Object.freeze({ kind: 'preset', id: 'pivane-pebble' });
    const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };
    const icon = name => { const i = el('i', `fa-solid ${name}`); i.setAttribute('aria-hidden', 'true'); return i; };
    const button = (className, label) => { const b = el('button', className); b.type = 'button'; if (label) { b.title = label; b.setAttribute('aria-label', label); } return b; };

    function face(bot, size = 'md') {
        const profile = ['preset', 'composed', 'image'].includes(bot?.avatar?.kind) ? bot : { ...bot, avatar: NEW_BOT_FACE };
        if (window.PiAvatar) return window.PiAvatar.render(profile, `pi-bot-face is-${size}`);
        const node = el('span', `pi-bot-face is-${size}`);
        node.setAttribute('aria-hidden', 'true');
        if (profile?.avatar?.kind === 'image' && profile.id) {
            const img = el('img'); img.alt = ''; img.decoding = 'async';
            img.src = `/api/pi/profiles/${encodeURIComponent(profile.id)}/avatar?version=${encodeURIComponent(profile.avatar.version)}`;
            node.append(img);
        }
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
        constructor({ api, toast, open, say, pane, header, input, onChange, draft, focusComposer, focusAttention, sideChat, sideAvailable }) {
            Object.assign(this, { api, toast, open, say, pane, header, input, onChange, draft, focusComposer, focusAttention, sideChat, sideAvailable });
            this.bots = []; this.revision = null; this.profileId = null; this.windowId = null;
            this.active = false; this.epoch = 0; this.loaded = false; this.creating = false; this.error = null;
            this.statusKind = 'connecting';
            this.motionValue = { state: 'idle', live: false };
            this.motion = window.PiBotMotion?.create({ paint: value => { this.motionValue = value; this.paintMotion(); } });
            this.visibility = () => this.motion?.visibility(document.hidden);
            document.addEventListener('visibilitychange', this.visibility);
            this.visibility();
            const interact = () => { if (this.active) this.motion?.interact(); };
            document.addEventListener('pointerdown', interact, { passive: true });
            document.addEventListener('keydown', interact);
            // Keep the floating identity inside the message viewport, below any confirmation banner.
            document.querySelector('.pi-transcript-viewport')?.prepend(header);
            this.placeholder = input.getAttribute('placeholder') || '';
            pane.hidden = true; header.hidden = true;
            pane.addEventListener('click', event => this.click(event));
            header.addEventListener('click', event => this.click(event));
            window.addEventListener('resize', () => {
                const menu = this.header.querySelector('.pi-bot-more-menu');
                const trigger = this.header.querySelector('[data-bot-action="more"]');
                if (menu?.matches(':popover-open') && trigger) {
                    const box = trigger.getBoundingClientRect();
                    menu.style.top = (box.bottom + 6) + 'px'; menu.style.right = Math.max(12, innerWidth - box.right) + 'px';
                }
            });
            header.addEventListener('keydown', event => {
                const menu = event.target.closest('.pi-bot-more-menu');
                if (!menu || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const items = [...menu.querySelectorAll('button:not(:disabled)')];
                const index = items.indexOf(document.activeElement);
                items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus();
            });
            // Number of usable chat models; undefined until known, null when it cannot be read.
            this.models = undefined;
            window.addEventListener('workspace:models-changed', () => { if (this.active) void this.checkModels(); });
            // The end of getting acquainted, docked above the composer by the chat (pi-bot-onboarding.js).
            this.closure = window.PiBotOnboarding?.closure({
                target: () => this.active && this.bot() ? { bot: this.bot(), window: this.window(),
                    idle: this.statusKind === 'connected' && !this.projection?.queued && !this.projection?.stopping } : null,
                load: profileId => this.api(`/api/pi/bots/${encodeURIComponent(profileId)}/settings`),
                submit: (profileId, body) => this.onboardingStep(profileId, body),
                say: text => this.say?.(text), draft: () => Boolean(this.draft?.()), focusComposer: () => this.focusComposer?.(),
                notify: (message, timeout) => this.toast(message, 'info', timeout), face: () => this.face('sm'), changed: () => this.onChange?.('panel') }) || null;
            if (this.closure) { input.addEventListener('input', () => this.closure.composerChanged()); dock(this.closure.element); }
            // Topic ids being restored, and unsettled items per topic (when the server lists them).
            this.restoring = new Set(); this.topicIndex = null; this.topicIndexMissing = false; this.topicIndexSerial = 0; this.archivedOpen = false;
            this.topicIndexAt = 0; this.topicIndexTimer = 0; this.leavingWindow = null;
            // What each Bot's chats are doing, from the page's activity poll (pi-bot-home.js); null until read.
            this.live = null; this.liveKey = 'none';
            // Phones: "All Bots", opened from the drawer; it covers the chat until a Bot or topic is chosen.
            this.home = window.PiBotHome?.create({ face: (bot, size) => face(bot, size),
                onOpen: (botId, windowId) => { this.closeHome(false); this.go(botId, windowId || undefined); },
                onTopics: botId => this.homeTopics(botId),
                onCreate: () => { void this.create(); },
                onClose: () => this.closeHome(true) }) || null;
            if (this.home) {
                pane.closest('.pi-workbench')?.append(this.home.element);
                // The home exists only on phones; widening the window returns to the chat.
                window.matchMedia?.('(max-width: 900px)').addEventListener?.('change', event => { if (!event.matches) this.closeHome(false); });
            }
        }

        // The page's /activity result (fresh false after a failed read). Repaints only when what is
        // shown changes, so the 3-second poll does not rebuild the lists for nothing.
        activity(data, fresh = true) {
            if (!window.PiBotHome) return;
            this.live = window.PiBotHome.live(data, fresh);
            const key = window.PiBotHome.signature(this.bots, this.live);
            if (key === this.liveKey) return;
            this.liveKey = key;
            if (!this.active) return;
            this.renderPane();
            this.home?.update(this.bots, this.live, this.creating);
        }
        get homeOpen() { return Boolean(this.active && this.home?.open); }
        openHome() {
            if (!this.home || !this.active || window.innerWidth > 900) return;
            document.getElementById('pi-session-pane')?.classList.remove('open');
            this.home.show(this.bots, this.live, this.profileId);
            this.onChange?.('home');
        }
        closeHome(focusMenu) {
            if (!this.home?.open) return;
            this.home.hide();
            if (focusMenu) this.header.querySelector('.pi-bot-menu')?.focus({ preventScroll: true });
            this.onChange?.('home');
        }
        // "Topics N" on a home row: that Bot's chats and topics, in the drawer.
        homeTopics(botId) {
            this.closeHome(false);
            if (botId !== this.profileId) { this.drawerAfterOpen = botId; this.go(botId); return; }
            document.getElementById('pi-session-pane')?.classList.add('open');
            this.refreshTopicIndex();
            this.pane.querySelector('.pi-bot-window[aria-current="page"]')?.focus({ preventScroll: true });
        }

        // The user sent a message of their own (from the composer) in the open chat.
        ownMessage() { this.closure?.ownMessage(); }

        async checkModels() {
            try { this.models = (await this.api('/api/pi/bots/readiness')).models ?? null; } catch { this.models = null; }
            if (this.active) this.onChange?.('identity');
        }

        // Only when there is certainly no model: a Bot cannot talk without one.
        needsModel() {
            if (this.models !== 0) return null;
            const note = el('div', 'pi-bot-needs-model');
            note.append(icon('fa-plug'), el('p', null, translateUi("还没有可用的聊天模型。伙伴要接入一个模型才能和你说话。")));
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
            this.status('connecting');
            this.pane.hidden = false; this.header.hidden = false;
            this.render();
            void this.checkModels();
            try {
                await this.load();
                if (epoch !== this.epoch) return;
                if (!this.bots.length) { this.profileId = null; this.windowId = null; this.render(); this.onChange?.('empty'); return; }
                const wanted = params.get('profileId') || localStorage.getItem(LAST_KEY);
                let bot = this.bots.find(item => item.id === wanted && item.enabled) || this.bots.find(item => item.enabled) || this.bots[0];
                if (!bot.enabled) throw new Error(translateUi("这个伙伴已停用，请在设置中重新启用"));
                let main = bot.windows.find(item => item.kind === 'main' && item.generation !== null);
                if (!main) {
                    await this.api(`/api/pi/bots/${encodeURIComponent(bot.id)}/main-window`, { method: 'POST' });
                    await this.load();
                    if (epoch !== this.epoch) return;
                    bot = this.bots.find(item => item.id === bot.id);
                    main = bot?.windows.find(item => item.kind === 'main' && item.generation !== null);
                    if (!main) throw new Error(translateUi("主聊天暂时无法准备好，请稍后重试"));
                }
                const windowId = bot.windows.some(item => item.id === params.get('windowId') && item.generation !== null && !item.archivedAt && !item.trashedAt)
                    ? params.get('windowId') : main.id;
                this.profileId = bot.id; this.windowId = windowId;
                localStorage.setItem(LAST_KEY, bot.id);
                this.render(); this.onChange?.('identity');
                await this.open({ profileId: bot.id, windowId });
                this.rotationRetries = 0;
                if (this.drawerAfterOpen === bot.id && epoch === this.epoch) {
                    this.drawerAfterOpen = null;
                    if (window.innerWidth <= 900) { document.getElementById('pi-session-pane')?.classList.add('open'); this.refreshTopicIndex(); }
                }
                if (this.focusNextOpen === windowId) {
                    this.focusNextOpen = null;
                    this.focusComposer?.();
                }
                void this.loadTopicIndex();
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
            this.closeMore();
            this.epoch++; this.active = false;
            clearTimeout(this.topicIndexTimer); this.topicIndexTimer = 0;
            this.closure?.hide();
            this.home?.hide(); this.drawerAfterOpen = null;
            this.motion?.update({ key: '', connected: false });
            this.pane.closest('#chat-tab')?.classList.remove('pi-bot-welcome');
            this.pane.hidden = true; this.header.hidden = true;
            this.input.setAttribute('placeholder', this.placeholder);
        }

        async load() {
            const data = await this.api('/api/pi/bots?includeTrash=false');
            this.revision = data.revision; this.bots = Array.isArray(data.bots) ? data.bots : []; this.loaded = true;
            return data;
        }

        // Re-read names, faces and windows (after an edit elsewhere or a window change).
        async refresh() {
            if (!this.active) return;
            try { await this.load(); this.render(); this.onChange?.('identity'); void this.loadTopicIndex(); } catch {}
        }

        // Unsettled items in the Bot's topics, shown beside each topic. Asked only when the Bot has
        // topics; a server without the list (404) is not asked again on this page.
        async loadTopicIndex() {
            const bot = this.bot(), serial = ++this.topicIndexSerial;
            if (!bot || !window.PiBotTopics || this.topicIndexMissing
                || !bot.windows.some(item => item.kind === 'topic' && !item.archivedAt && !item.trashedAt && item.generation !== null)) {
                if (this.topicIndex && this.topicIndex.botId !== bot?.id) { this.topicIndex = null; if (this.active) this.renderPane(); }
                return;
            }
            const profileId = bot.id;
            this.topicIndexAt = Date.now();
            try {
                const data = await this.api(`/api/pi/bots/${encodeURIComponent(profileId)}/topics/open-items`);
                if (serial !== this.topicIndexSerial || this.profileId !== profileId || !this.active) return;
                this.topicIndex = { botId: profileId, map: window.PiBotTopics.index(data, this.bot()?.windows) };
                this.renderPane();
            } catch (error) { if (error.status === 404) this.topicIndexMissing = true; }
        }

        // Reread the topic badges after an event, throttled; never a timer loop.
        refreshTopicIndex() {
            if (!this.active || this.topicIndexMissing || this.topicIndexTimer) return;
            const wait = this.topicIndexAt + TOPIC_INDEX_GAP - Date.now();
            if (wait <= 0) { void this.loadTopicIndex(); return; }
            this.topicIndexTimer = setTimeout(() => { this.topicIndexTimer = 0; if (this.active) void this.loadTopicIndex(); }, wait);
        }

        // The open window cannot be opened again: its topic was archived, or it or its Bot was removed
        // (moved to the trash) on another device. Reread the Bots, say so once and continue in the
        // Bot's main chat, with another Bot or on the welcome page. Nothing happens for a window this
        // page has already left.
        async leaveGoneWindow(target, { archived = false } = {}) {
            const epoch = this.epoch;
            const here = () => this.active && epoch === this.epoch && this.profileId === target.profileId && this.windowId === target.windowId;
            if (!here() || this.leavingWindow === target.windowId) return false;
            this.leavingWindow = target.windowId;
            const name = this.bot()?.name || translateUi('伙伴');
            try {
                try { await this.load(); } catch { /* go on with what is known */ }
                if (!here()) return false;
                this.render();
                const bot = this.bots.find(item => item.id === target.profileId && item.enabled);
                const main = bot?.windows.find(item => item.kind === 'main' && item.generation !== null && item.id !== target.windowId);
                if (main) {
                    this.toast(archived ? translateUi("这个话题已在别处归档，聊天记录都保留着；已回到主聊天。")
                        : translateUi("这个聊天已经不在了，已回到主聊天。"), 'info');
                    this.go(bot.id, main.id);
                    return true;
                }
                this.toast(translateUi("找不到 {0} 了，可能已在别处移到回收站。", name), 'info');
                if (localStorage.getItem(LAST_KEY) === target.profileId) localStorage.removeItem(LAST_KEY);
                const next = this.bots.find(item => item.id !== target.profileId && item.enabled);
                if (next) this.go(next.id);
                else { window.PiWorkspaceRoute?.navigate('bot', {}, true); void this.activate(new URLSearchParams()); }
                return true;
            } finally { if (this.leavingWindow === target.windowId) this.leavingWindow = null; }
        }

        go(profileId, windowId) {
            if (window.innerWidth <= 900) document.getElementById('pi-session-pane')?.classList.remove('open');
            if (this.home?.open) this.closeHome(false);
            window.PiWorkspaceRoute?.navigate('bot', { profileId, ...(windowId ? { windowId } : {}) });
        }

        async create() {
            if (this.creating) return;
            this.creating = true; this.render(); this.home?.update(this.bots, this.live, true);
            try {
                if (this.revision === null) await this.load();
                const data = await this.api('/api/pi/bots', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ expectedRevision: this.revision, language: globalThis.PiI18n?.locale === 'en' ? 'en' : 'zh-CN' }) });
                localStorage.setItem(LAST_KEY, data.bot.id);
                await this.load();
                this.go(data.bot.id);
            } catch (error) {
                // A stale revision means another tab changed Bots; reload and let the user try again.
                if (error.status === 409) await this.load().catch(() => {});
                this.toast(error.status === 409 ? translateUi("伙伴列表刚刚有变化，请再试一次") : error.message, 'error');
            } finally { this.creating = false; this.render(); this.home?.update(this.bots, this.live, false); }
        }

        // The Bot as the setup card compares a proposal with it.
        setupIdentity() {
            const bot = this.bot();
            return bot ? { id: bot.id, name: bot.name, avatar: bot.avatar, job: bot.bot?.job || '', workStyle: bot.bot?.permissions?.preset || 'free',
                phase: bot.bot?.onboarding?.phase || null, chosen: bot.chosen || null, steps: bot.bot?.onboarding?.steps || {} } : null;
        }

        // A picture face chosen on a setup card, through the profile avatar service.
        async uploadAvatar(dataUrl) {
            const bot = this.bot();
            if (!bot) throw new Error(translateUi("请先打开伙伴的聊天"));
            if (this.revision === null) await this.load();
            try {
                const result = await this.api(`/api/pi/profiles/${encodeURIComponent(bot.id)}/avatar`, { method: 'POST',
                    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: this.revision, dataUrl }) });
                // The upload's answer is the newest state even if the refresh below cannot read the list.
                // A picture face is the user's choice, as the server's list would report it.
                if (result?.profile?.avatar) { bot.avatar = result.profile.avatar; bot.chosen = { ...(bot.chosen || {}), avatar: true }; }
                if (typeof result?.revision === 'string') this.revision = result.revision;
                return result;
            } finally { await this.refresh(); }
        }

        // picture: the version of the picture just uploaded for this card, if it answers the face.
        // workStyleShown: whether the card showed the way-of-working choice (the server then saves or
        // records that step only if it did); left out by callers that do not know.
        async saveSetup(toolCallId, changes, { picture = null, workStyleShown } = {}) {
            const current = this.current();
            if (!current) throw new Error(translateUi("请先打开伙伴的聊天"));
            if (this.revision === null) await this.load();
            try {
                const result = await this.api(`/api/pi/bots/${encodeURIComponent(current.profileId)}/setup`, { method: 'POST',
                    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ windowId: current.windowId, toolCallId, changes,
                        ...(picture ? { picture } : {}), ...(typeof workStyleShown === 'boolean' ? { workStyleShown } : {}), expectedRevision: this.revision }) });
                if (result.user && result.user.documentSaved === false) this.toast(translateUi("关于你的内容这次没记下：{0}", result.user.error || ''), 'error');
                return result;
            } finally { await this.refresh(); }
        }

        // The user leaves a setup card's steps for later; one retry after a revision conflict.
        // workStyleShown: as for saveSetup, from the card as shown (also on the retry).
        async leaveSetupForLater(toolCallId, { workStyleShown } = {}) {
            const current = this.current();
            if (!current) return;
            if (this.revision === null) await this.load();
            const send = () => this.api(`/api/pi/bots/${encodeURIComponent(current.profileId)}/setup`, { method: 'POST',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ windowId: current.windowId, toolCallId, later: true,
                    ...(typeof workStyleShown === 'boolean' ? { workStyleShown } : {}), expectedRevision: this.revision }) });
            try { return await send(); }
            catch (error) { if (error.status !== 409 || error.code) throw error; await this.load(); return await send(); }
            finally { await this.refresh(); }
        }

        // One closing step of getting acquainted (model-choice or first-task, flow 2). A revision
        // conflict rereads the list and is reported, never retried for the user.
        async onboardingStep(profileId, body) {
            if (this.revision === null) await this.load();
            try {
                return await this.api(`/api/pi/bots/${encodeURIComponent(profileId)}/onboarding`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...body, expectedRevision: this.revision }) });
            } catch (error) {
                if (error.status === 409 && !error.code) await this.load().catch(() => {});
                throw error;
            } finally { await this.refresh(); }
        }

        // "Always allow" from an approval card: read the current grants fresh, append this one and
        // save against that revision. Other grants (including ones this page does not understand)
        // and the way of working are kept; a conflict is reported, not retried.
        async rememberRule(rule) {
            const profileId = this.profileId;
            if (!profileId || !window.PiBotRules?.valid(rule)) throw new Error(translateUi("请先打开伙伴的聊天"));
            const data = await this.api(`/api/pi/bots/${encodeURIComponent(profileId)}/settings`);
            const rules = data?.bot?.bot?.permissions?.rules;
            if (!Array.isArray(rules) || typeof data.revision !== 'string') throw new Error(translateUi("服务暂时不能记住规则，这次可以先只允许一次"));
            if (!rules.some(item => window.PiBotRules.same(item, rule))) {
                if (rules.length >= window.PiBotRules.MAX_RULES) throw new Error(translateUi("一直允许的规则已经满了，先在设置里撤销几条"));
                await this.api(`/api/pi/bots/${encodeURIComponent(profileId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ expectedRevision: data.revision, changes: { bot: { permissions: { rules: [...rules, rule] } } } }) });
            }
            await this.refresh();
            return true;
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
                const pick = el('div', 'pi-bot-known-sources'); pick.setAttribute('role', 'group'); pick.setAttribute('aria-label', translateUi("从哪个伙伴"));
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
            if (action !== 'more' && target.closest('.pi-bot-more-menu')) this.closeMore();
            if (action === 'more') { this.toggleMore(); return; }
            if (action === 'side') { void this.sideChat?.(); return; }
            if (action === 'schedule') { window.PiWorkspaceRoute?.navigate('cron', { profileId: this.profileId }); return; }
            if (action === 'identity-details') { window.PiWorkspaceRoute?.navigate('profiles', { profileId: this.profileId }); return; }
            if (action === 'bot') this.go(target.dataset.botId);
            else if (action === 'window') this.go(this.profileId, target.dataset.windowId);
            else if (action === 'create') void this.create();
            else if (action === 'home') this.openHome();
            else if (action === 'greet-yes') void this.onboarding('start');
            else if (action === 'greet-skip') void this.onboarding('skip');
            else if (action === 'models') window.dispatchEvent(new CustomEvent('workspace:open-settings', { detail: { tab: 'providers' } }));
            else if (action === 'known-copy') void this.knownAction('copy');
            else if (action === 'known-decline') void this.knownAction('decline');
            else if (action === 'known-source' && this.known) { this.known.sourceId = target.dataset.profileId; this.onChange?.('identity'); }
            else if (action === 'retry') void this.activate(new URLSearchParams(this.profileId ? { profileId: this.profileId } : {}));
            else if (action === 'topic-add') void this.createTopic();
            else if (action === 'topic-edit') this.editTopic(target.dataset.windowId);
            else if (action === 'topic-restore') void this.restoreTopic(target.dataset.windowId);
            else if (action === 'topic-trash') this.trashArchivedTopic(target.dataset.windowId);
            else if (action === 'notes') {
                if (window.innerWidth <= 900) document.getElementById('pi-session-pane')?.classList.remove('open');
                this.openNotebook();
            } else if (action === 'attention' && this.active && this.projection?.connected && this.projection?.waiting) this.focusAttention?.(this.projection.key);
            else if (action === 'settings') {
                if (window.innerWidth <= 900) document.getElementById('pi-session-pane')?.classList.remove('open');
                this.openSettings();
            } else if (action === 'menu') {
                if (document.getElementById('pi-session-pane')?.classList.toggle('open')) this.refreshTopicIndex();
            }
        }

        // What the Bot keeps in mind for the open chat (M2-5).
        openNotebook() {
            const bot = this.bot(), current = this.current();
            if (!bot || !current || !window.PiBotNotebook) return;
            window.PiBotNotebook.open({ api: this.api, toast: this.toast, profileId: current.profileId, windowId: current.windowId,
                name: bot.name, face: size => face(bot, size),
                onAbout: () => window.PiWorkspaceRoute?.navigate('profiles', { profileId: current.profileId, section: 'user' }) });
        }

        // Create a fresh topic immediately on click, switch to it and focus the composer.
        async createTopic() {
            const bot = this.bot();
            if (!bot || this.creatingTopic) return;
            const profileId = bot.id, epoch = this.epoch;
            if (window.innerWidth <= 900) document.getElementById('pi-session-pane')?.classList.remove('open');
            this.creatingTopic = true; this.renderPane();
            const post = revision => this.api(`/api/pi/bots/${encodeURIComponent(profileId)}/windows`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                // The server's default title is Chinese; send the interface-language one it also recognises as a default.
                body: JSON.stringify({ expectedRevision: revision, title: globalThis.PiI18n?.locale === 'en' ? 'New topic' : '新话题',
                    groupId: window.PiBotTopicManager?.selectedGroup(profileId) || null })
            });
            try {
                let result;
                try { result = await post(bot.windowsRevision); }
                catch (error) {
                    if (error.status === 409 && !error.code) {
                        await this.load();
                        const fresh = this.bots.find(item => item.id === profileId);
                        if (!fresh) return;
                        result = await post(fresh.windowsRevision);
                    } else throw error;
                }
                await this.refresh();
                if (!this.active || this.epoch !== epoch || this.profileId !== profileId) return;
                const id = result?.window?.id || result?.id;
                if (id) {
                    this.focusNextOpen = id;
                    this.go(profileId, id);
                }
            } catch (error) {
                if (this.profileId === profileId) {
                    this.toast(error.code === 'BOT_TOPIC_LIMIT'
                        ? translateUi("话题已经到上限了（已归档的也算在内），可以先接着用已有的话题。")
                        : error.message || translateUi("创建失败"), 'error');
                }
            } finally {
                this.creatingTopic = false;
                if (this.active) this.renderPane();
            }
        }

        // Create (windowId null) or edit a topic; the main chat has no such sheet.
        editTopic(windowId) {
            const bot = this.bot();
            if (!bot || !window.PiBotTopics) return;
            const topic = windowId ? bot.windows.find(item => item.id === windowId && item.kind === 'topic' && !item.archivedAt && !item.trashedAt) : null;
            if (windowId && !topic) return;
            if (window.innerWidth <= 900) document.getElementById('pi-session-pane')?.classList.remove('open');
            const profileId = bot.id, epoch = this.epoch;
            const current = () => this.active && this.epoch === epoch && this.profileId === profileId;
            window.PiBotTopics.edit({ api: this.api, profileId, name: bot.name, bot, window: topic, current,
                latest: async () => { await this.load(); if (current()) this.render(); return this.bots.find(item => item.id === profileId) || null; },
                onSaved: async (result, action) => {
                    await this.refresh();
                    if (!current()) return;
                    if (action === 'created') {
                        const id = result?.window?.id || result?.id;
                        if (id) this.go(profileId, id);
                    } else if (action === 'archived' || action === 'trashed') {
                        this.toast(action === 'trashed' ? translateUi("话题已移到回收站") : translateUi("话题已归档，聊天记录都保留着"), 'success');
                        const main = this.bot()?.windows.find(item => item.kind === 'main');
                        if (topic.id === this.windowId && main) this.go(profileId, main.id);
                    } else this.toast(translateUi("已保存"), 'success');
                } });
        }

        manageTopics(view = 'move') {
            const bot = this.bot(); if (!bot || !window.PiBotTopicManager) return;
            const profileId = bot.id;
            if (window.innerWidth <= 900) document.getElementById('pi-session-pane')?.classList.remove('open');
            window.PiBotTopicManager.open({ bot, api: this.api, current: () => this.active && this.profileId === profileId,
                latest: async () => { await this.load(); return this.bots.find(item => item.id === profileId); },
                onSaved: async () => { await this.refresh(); } }, view);
        }

        trashArchivedTopic(windowId) {
            const bot = this.bot(), topic = bot?.windows.find(item => item.id === windowId && item.archivedAt && !item.trashedAt);
            if (!topic || !window.PiBotTopics) return;
            // Restore controls stay in the archive; the standard editor provides the trash confirmation.
            window.PiBotTopics.edit({ bot, window: topic, profileId: bot.id, name: bot.name, api: this.api,
                current: () => this.active && this.profileId === bot.id,
                latest: async () => { await this.load(); return this.bots.find(item => item.id === bot.id); },
                onSaved: async () => { await this.refresh(); } });
        }

        // An archived topic comes back with all its history; it is opened from the list again.
        async restoreTopic(windowId) {
            const bot = this.bot();
            const topic = bot?.windows.find(item => item.id === windowId && item.kind === 'topic' && item.archivedAt && !item.trashedAt);
            if (!topic || !window.PiBotTopics || this.restoring.has(windowId)) return;
            const profileId = bot.id;
            this.restoring.add(windowId); this.renderPane();
            try {
                await window.PiBotTopics.restore({ api: this.api, profileId, windowId, revision: bot.windowsRevision });
                if (this.profileId === profileId) this.toast(translateUi("话题已恢复"), 'success');
            } catch (error) {
                if (this.profileId === profileId) this.toast(error.status === 409 && !error.code ? translateUi("话题列表刚刚有变化，请再点一次恢复") : error.message, 'error');
            } finally { this.restoring.delete(windowId); if (this.active) this.renderPane(); await this.refresh(); }
        }

        openSettings() {
            const profileId = this.profileId;
            if (!profileId || !window.PiBotSettings) { window.PiWorkspaceRoute?.navigate('profiles', { profileId }); return; }
            void window.PiBotSettings.open({ api: this.api, toast: this.toast, profileId, face,
                current: () => this.active && this.profileId === profileId,
                checkChat: async windowId => {
                    const data = await this.api('/api/pi/bots?includeTrash=false');
                    if (!this.active || this.profileId !== profileId) return 'unavailable';
                    const bot = data.bots?.find(item => item.id === profileId && item.enabled);
                    const target = bot?.windows?.find(item => item.id === windowId);
                    if (!target || target.generation === null || !target.sessionId) return 'unavailable';
                    this.bots = data.bots; this.revision = data.revision;
                    return target.trashedAt ? 'unavailable' : target.archivedAt ? 'archived' : 'available';
                },
                onChat: windowId => {
                    const target = this.bot()?.windows.find(item => item.id === windowId);
                    if (this.active && this.profileId === profileId && target && !target.archivedAt && !target.trashedAt && target.sessionId && target.generation !== null) this.go(profileId, windowId);
                },
                onWindows: async () => {
                    await this.refresh();
                    if (!this.active || this.profileId !== profileId) return;
                    this.archivedOpen = true; this.renderPane();
                    this.pane.closest('#pi-session-pane')?.classList.add('open');
                    const archived = this.pane.querySelector('.pi-bot-archived > summary');
                    archived?.scrollIntoView({ block: 'nearest' }); archived?.focus();
                },
                onSaved: async () => { await this.refresh(); },
                // Moved to the trash: go on with another Bot, or the welcome page when none is left.
                onTrashed: async () => {
                    if (localStorage.getItem(LAST_KEY) === profileId) localStorage.removeItem(LAST_KEY);
                    if (this.profileId !== profileId || !this.active) return;
                    try { await this.load(); } catch {}
                    const next = this.bots.find(item => item.id !== profileId && item.enabled);
                    if (next) this.go(next.id);
                    else { window.PiWorkspaceRoute?.navigate('bot', {}, true); void this.activate(new URLSearchParams()); }
                },
                // Memory, about-you notes and learning keep living on the identity page.
                onMemory: () => window.PiWorkspaceRoute?.navigate('profiles', { profileId, section: 'user' }),
                onLearning: () => window.PiWorkspaceRoute?.navigate('profiles', { profileId, section: 'learning' }),
                // Getting acquainted again happens in the main chat; the Bot starts once asked.
                onRestart: async () => {
                    const main = this.bot()?.windows.find(item => item.kind === 'main');
                    if (!await this.onboarding('restart')) return;
                    if (main && main.id !== this.windowId) this.go(profileId, main.id);
                    else this.say?.(translateUi("我们重新认识一下吧"));
                } });
        }

        // ---- status --------------------------------------------------------------------

        status(kind, projection = {}) {
            const busy = (value, view) => ['working', 'waiting'].includes(value) || Boolean(view?.queued || view?.stopping);
            const wasBusy = busy(this.statusKind, this.projection);
            this.statusKind = STATUS[kind] ? kind : 'connected';
            this.projection = { key: projection.key || `${this.profileId}/${this.windowId}`, connected: !['connecting', 'offline', 'error'].includes(this.statusKind),
                waiting: kind === 'waiting', working: kind === 'working', ...projection,
                greeting: this.bot()?.bot?.onboarding?.phase === 'greeting', greetingKey: `${this.profileId}/${this.windowId}` };
            this.motion?.update(this.projection);
            this.paintMotion();
            this.closure?.sync();
            // A reply that settles may have changed what topics have open (the index is not live).
            if (wasBusy && this.statusKind === 'connected' && !busy(this.statusKind, this.projection)) this.refreshTopicIndex();
        }
        paintMotion() {
            const node = this.header.querySelector('.pi-bot-identity > .pi-bot-face');
            if (!node) return;
            node.dataset.avatarState = this.motionValue.state;
            node.dataset.avatarLive = String(this.active && this.motionValue.live);
            const line = this.header.querySelector('.pi-bot-status');
            if (line) {
                const pose = this.motionValue.state;
                const label = pose === 'failed' ? translateUi("这轮回复未完成") : pose === 'done' ? translateUi("这轮回复结束")
                    : pose === 'thinking' ? translateUi("正在思考") : pose === 'sleeping' ? translateUi("打盹中") : this.projection?.label || STATUS[this.statusKind]();
                line.dataset.state = pose === 'failed' ? 'error' : this.statusKind;
                // The name badge keeps the Buddy and topic readable: idle and ordinary work show only the coloured
                // (pulsing) dot, as the turn itself shows its progress. Waiting, a failed reply, stopping and
                // connection trouble keep words; the label stays in the tooltip and accessible name.
                line.classList.toggle('is-quiet', ['connected', 'working'].includes(this.statusKind) && !this.projection?.stopping && pose !== 'failed');
                line.title = label;
                line.setAttribute('aria-label', label);
                line.replaceChildren(el('i', 'pi-bot-status-dot'), document.createTextNode(label));
            }
            const attention = this.header.querySelector('.pi-bot-attention');
            if (attention) {
                const waiting = this.active && this.projection?.connected && this.projection?.waiting;
                attention.hidden = !waiting;
                const label = this.projection?.attentionLabel || translateUi("等你确认");
                if (attention.textContent !== label) attention.textContent = label;
                attention.disabled = !waiting;
            }
        }
        motionEvent(type, key, reason) {
            if (type === 'start') this.motion?.begin(key);
            else if (type === 'result') this.motion?.result(key, reason);
            else if (type === 'settled') this.motion?.settle(key);
        }

        // ---- rendering -----------------------------------------------------------------

        render() {
            // The welcome page is a focused first step: no empty pane or idle composer around it.
            this.pane.closest('#chat-tab')?.classList.toggle('pi-bot-welcome', this.active && this.loaded && !this.bots.length);
            if (!this.active) return;
            this.renderPane(); this.renderHeader();
            const bot = this.bot();
            this.input.setAttribute('placeholder', bot ? translateUi("给 {0} 发消息", bot.name) : this.placeholder);
            this.closure?.sync();
        }

        renderPane() {
            // A repaint (activity, a refresh) keeps keyboard focus on the same control.
            const focused = this.pane.contains(document.activeElement) ? document.activeElement : null;
            const focusKey = focused?.dataset.botAction ? `${focused.dataset.botAction}|${focused.dataset.botId || ''}|${focused.dataset.windowId || ''}` : null;
            const selection = typeof focused?.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd] : null;
            const home = window.PiBotHome, live = this.live;
            const rail = el('nav', 'pi-bot-rail'); rail.setAttribute('aria-label', translateUi("我的伙伴"));
            for (const bot of this.bots) {
                const item = button('pi-bot-rail-item', bot.name); item.dataset.botAction = 'bot'; item.dataset.botId = bot.id;
                if (bot.id === this.profileId) item.setAttribute('aria-current', 'true');
                if (!bot.enabled) item.classList.add('is-disabled');
                item.append(face(bot, 'md'));
                // Other Bots: a confirmation waiting, or how many of their chats have a reply not yet seen.
                const summary = home && live && bot.id !== this.profileId ? home.summarize(bot, live) : null;
                const notes = [];
                if (summary?.kind === 'waiting') { item.append(el('span', 'pi-bot-rail-waiting')); notes.push(translateUi("等你确认")); }
                if (summary?.unread) { item.append(el('span', 'pi-bot-rail-unread', String(summary.unread))); notes.push(translateUi("{0} 个聊天有新回复", summary.unread)); }
                if (notes.length) { const label = [bot.name, ...notes].join('，'); item.title = label; item.setAttribute('aria-label', label); }
                rail.append(item);
            }
            const add = button('pi-bot-rail-add', this.creating ? translateUi("正在创建…") : translateUi("新建伙伴"));
            add.dataset.botAction = 'create'; add.disabled = this.creating;
            add.append(this.creating ? el('span', 'pi-spinner') : icon('fa-plus'));
            rail.append(add);

            const side = el('div', 'pi-bot-side');
            const bot = this.bot();
            if (bot && this.bots.length > 1 && this.home) {
                // Phones: back to every Bot at a glance (hidden on wide screens, where the rail shows them).
                const all = button('pi-bot-all'); all.dataset.botAction = 'home';
                all.append(icon('fa-chevron-left'), el('span', null, translateUi("所有伙伴")));
                const others = home && live ? home.othersWithNews(this.bots, live, bot.id) : 0;
                if (others) {
                    const news = el('span', 'pi-bot-all-news'); news.append(el('i', 'pi-bot-status-dot'), document.createTextNode(translateUi("另有 {0} 个有动静", others)));
                    all.append(news);
                    all.setAttribute('aria-label', translateUi("所有伙伴，另有 {0} 个伙伴有新回复或等你确认", others));
                }
                side.append(all);
            }
            if (bot) {
                const head = el('header', 'pi-bot-side-head');
                const copy = el('div', 'pi-bot-side-copy');
                copy.append(el('strong', null, bot.name));
                const onboarding = ['greeting', 'interview'].includes(bot.bot?.onboarding?.phase);
                copy.append(el('span', null, onboarding ? translateUi("还在互相认识") : bot.bot?.job || translateUi("你的私人助理")));
                head.append(face(bot, 'lg'), copy);
                const list = el('nav', 'pi-bot-windows'); list.setAttribute('aria-label', translateUi("聊天"));
                const windows = bot.windows.filter(item => item.generation !== null && !item.archivedAt && !item.trashedAt);
                const main = windows.find(item => item.kind === 'main');
                if (main) list.append(this.windowItem(main, 'fa-comment', translateUi("主聊天")));
                const topics = windows.filter(item => item.kind === 'topic');
                if (window.PiBotTopicManager) list.append(window.PiBotTopicManager.list({ bot, creating: Boolean(this.creatingTopic),
                    topicItem: topic => this.topicItem(bot, topic), create: () => { void this.createTopic(); }, manage: view => this.manageTopics(view) }));
                else for (const topic of topics) list.append(this.topicItem(bot, topic));
                const archived = bot.windows.filter(item => item.kind === 'topic' && item.archivedAt && !item.trashedAt);
                if (archived.length) list.append(this.archivedList(archived));
                const trash = button('pi-bot-topic-trash-link'); trash.setAttribute('aria-label', translateUi("回收站（{0}）", bot.trashCount ?? bot.windows.filter(item => item.trashedAt).length));
                trash.append(icon('fa-trash-can'), el('span', null, translateUi("回收站")), el('small', null, String(bot.trashCount ?? bot.windows.filter(item => item.trashedAt).length)));
                trash.addEventListener('click', () => this.manageTopics('trash')); list.append(trash);
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
            if (focusKey && focused !== document.activeElement) {
                const restored = [...this.pane.querySelectorAll('[data-bot-action]')].find(node => `${node.dataset.botAction}|${node.dataset.botId || ''}|${node.dataset.windowId || ''}` === focusKey);
                restored?.focus({ preventScroll: true });
                if (selection && restored?.setSelectionRange) restored.setSelectionRange(...selection);
            }
        }

        windowItem(item, glyph, title, emoji) {
            const node = button('pi-bot-window'); node.dataset.botAction = 'window'; node.dataset.windowId = item.id;
            if (item.id === this.windowId) node.setAttribute('aria-current', 'page');
            const mark = el('span', 'pi-bot-window-mark');
            if (emoji) mark.textContent = emoji; else mark.append(icon(glyph));
            mark.setAttribute('aria-hidden', 'true');
            node.append(mark, el('span', 'pi-bot-window-title', title));
            // Another chat of this Bot waiting for you, with a reply not yet seen, or working. The open
            // chat shows its own state in the header.
            const state = item.id !== this.windowId ? window.PiBotHome?.windowState(item, this.live) : null;
            if (state) {
                const text = { waiting: translateUi("等你确认"), new: translateUi("新回复"), working: translateUi("正在忙") }[state];
                const badge = el('span', `pi-bot-window-state is-${state}`); badge.setAttribute('aria-hidden', 'true');
                badge.append(el('i', 'pi-bot-status-dot'));
                if (state === 'waiting') badge.append(el('span', 'pi-bot-window-state-text', text));
                node.append(badge, el('span', 'pi-bot-sr', text));
                node.dataset.state = state; node.title = `${title} · ${text}`;
            }
            return node;
        }

        topicItem(bot, topic) {
            const row = el('div', 'pi-bot-topic-row');
            const open = this.windowItem(topic, 'fa-hashtag', topic.title, topic.emoji);
            const unsettled = !open.dataset.state && this.topicIndex?.botId === bot.id ? this.topicIndex.map.get(topic.id) : null;
            if (unsettled) {
                // Busy topics were not read, so their items are unknown rather than none.
                const text = unsettled.busy ? translateUi("这个话题正在忙") : translateUi("{0} 件没办完", unsettled.count);
                const badge = el('span', `pi-bot-topic-badge${unsettled.busy ? ' is-busy' : ''}`, unsettled.busy ? '' : String(unsettled.count));
                badge.title = [text, ...unsettled.titles].join('\n');
                badge.prepend(el('i', 'pi-bot-status-dot')); badge.setAttribute('aria-hidden', 'true');
                open.append(badge, el('span', 'pi-bot-sr', text));
            }
            const edit = button('pi-bot-topic-edit', translateUi("编辑话题“{0}”", topic.title));
            edit.dataset.botAction = 'topic-edit'; edit.dataset.windowId = topic.id;
            edit.append(icon('fa-pen'));
            row.append(open, edit);
            return row;
        }

        // Archived topics are listed to restore, never opened as a live chat.
        archivedList(archived) {
            const box = el('details', 'pi-bot-archived'); box.open = this.archivedOpen;
            box.addEventListener('toggle', () => { this.archivedOpen = box.open; });
            box.append(el('summary', null, translateUi("已归档（{0}）", archived.length)));
            for (const topic of archived) {
                const row = el('div', 'pi-bot-archived-row');
                const mark = el('span', 'pi-bot-window-mark'); mark.setAttribute('aria-hidden', 'true');
                if (topic.emoji) mark.textContent = topic.emoji; else mark.append(icon('fa-box-archive'));
                const restoring = this.restoring.has(topic.id);
                const restore = button('pi-bot-chip pi-bot-topic-restore', translateUi("恢复话题“{0}”", topic.title));
                restore.dataset.botAction = 'topic-restore'; restore.dataset.windowId = topic.id; restore.disabled = restoring;
                restore.textContent = restoring ? translateUi("正在恢复…") : translateUi("恢复");
                const remove = button('pi-bot-topic-edit', translateUi("删除话题“{0}”", topic.title)); remove.dataset.botAction = 'topic-trash'; remove.dataset.windowId = topic.id; remove.append(icon('fa-trash-can'));
                row.append(mark, el('span', 'pi-bot-window-title', topic.title), restore, remove);
                box.append(row);
            }
            return box;
        }

        closeMore() { this.header.querySelector('.pi-bot-more-menu')?.hidePopover(); }
        toggleMore() {
            const menu = this.header.querySelector('.pi-bot-more-menu'), trigger = this.header.querySelector('[data-bot-action="more"]');
            if (!menu || !trigger) return;
            if (menu.matches(':popover-open')) { menu.hidePopover(); return; }
            const box = trigger.getBoundingClientRect();
            menu.style.top = (box.bottom + 6) + 'px'; menu.style.right = Math.max(12, innerWidth - box.right) + 'px';
            menu.querySelector('[data-bot-action="side"]').disabled = !this.sideAvailable?.();
            menu.showPopover(); menu.querySelector('button:not(:disabled)')?.focus();
        }
        sideActivity(value = {}) {
            this.sideState = value;
            const trigger = this.header.querySelector('[data-bot-action="more"]');
            if (trigger) trigger.dataset.sideState = value.waiting ? 'waiting' : value.unread ? 'unread' : value.busy || value.starting ? 'busy' : '';
            const hint = this.header.querySelector('.pi-bot-side-hint');
            if (hint) hint.textContent = value.waiting ? translateUi('等待确认') : value.unread ? translateUi('有新回复') : value.busy || value.starting ? translateUi('回复中') : '';
        }
        renderHeader() {
            const bot = this.bot(), currentWindow = this.window();
            const key = JSON.stringify([bot?.id, bot?.name, bot?.avatar, this.windowId, currentWindow?.kind, currentWindow?.title, currentWindow?.emoji]);
            // Activity and background refreshes must not replace an open menu or its focus.
            if (this.headerKey === key && this.header.childElementCount) { this.sideActivity(this.sideState); this.paintMotion(); return; }
            this.headerKey = key;
            const menu = button('pi-bot-menu', translateUi("我的伙伴与聊天")); menu.dataset.botAction = 'menu';
            menu.append(icon('fa-bars'));
            if (!bot) { this.header.replaceChildren(menu); return; }
            const who = el('div', 'pi-bot-who');
            const name = el('strong', null, bot.name); name.title = bot.name;
            const current = this.window();
            const line = el('span', 'pi-bot-status'); line.dataset.state = this.statusKind;
            line.append(el('i', 'pi-bot-status-dot'), document.createTextNode(STATUS[this.statusKind]()));
            // Name and status share the first line; in a topic its title gets a full second line, so neither
            // crowds the other out. The status line itself is repainted with each pose.
            const first = el('span', 'pi-bot-who-line'); first.append(name, line); who.append(first);
            if (current?.kind === 'topic') {
                const topic = el('span', 'pi-bot-who-topic', current.emoji ? `${current.emoji} ${current.title}` : current.title); topic.title = topic.textContent;
                who.classList.add('has-topic'); who.append(topic);
            }
            const notes = button('pi-bot-notes-button pi-bot-more', translateUi('更多功能')); notes.dataset.botAction = 'more';
            notes.append(icon('fa-ellipsis')); notes.hidden = !this.windowId;
            notes.setAttribute('aria-haspopup', 'menu'); notes.setAttribute('aria-expanded', 'false'); notes.setAttribute('aria-controls', 'pi-bot-more-menu');
            const more = el('div', 'pi-bot-more-menu'); more.id = 'pi-bot-more-menu'; more.popover = 'auto'; more.setAttribute('role', 'menu'); more.setAttribute('aria-label', translateUi('更多功能'));
            for (const [action, label, glyph] of [['side', '侧聊', 'fa-comment-dots'], ['notes', '我记着的事', 'fa-thumbtack'], ['schedule', '定时任务', 'fa-clock'], ['identity-details', '助手身份详情', 'fa-id-card'], ['settings', '伙伴设置', 'fa-gear']]) {
                const item = button('', translateUi(label)); item.dataset.botAction = action; item.setAttribute('role', 'menuitem');
                item.append(icon(glyph), el('span', null, translateUi(label)));
                if (action === 'side') item.append(el('small', 'pi-bot-side-hint'));
                more.append(item);
            }
            more.addEventListener('toggle', event => {
                notes.setAttribute('aria-expanded', String(event.newState === 'open'));
                if (event.newState === 'closed' && this.active && notes.isConnected && (document.activeElement === document.body || more.contains(document.activeElement))) notes.focus({ preventScroll: true });
            });
            const identity = button('pi-bot-identity', translateUi("打开 {0} 的设置", bot.name)); identity.dataset.botAction = 'settings';
            identity.append(face(bot, 'xl'), who);
            const attention = button('pi-bot-attention'); attention.dataset.botAction = 'attention'; attention.hidden = true;
            attention.setAttribute('aria-live', 'polite'); attention.setAttribute('aria-atomic', 'true');
            this.header.replaceChildren(menu, identity, notes, attention, more);
            this.sideActivity(this.sideState); this.paintMotion();
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
                root.append(face({ avatar: NEW_BOT_FACE }, 'xl'));
                root.append(el('h2', null, translateUi("认识你的伙伴")));
                root.append(el('p', null, translateUi("一个一直在的私人助理：记得你说过的话，帮你查、记、写、提醒。先花两三分钟互相认识一下。")));
                if (globalThis.PiBotOnboarding?.dataNotice) root.append(globalThis.PiBotOnboarding.dataNotice(null));
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
                if (globalThis.PiBotOnboarding?.dataNotice) bubble.append(globalThis.PiBotOnboarding.dataNotice(bot));
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
                bubble.append(el('p', null, bot.bot.onboarding.converted
                    ? translateUi("我是{0}，现在有了自己的主聊天和工作目录，记得的事都还在。花一两分钟说说想让我主要帮你做什么？随时可以说“先跳过”。", bot.name)
                    : bot.bot.onboarding.firstBot
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
            if (window?.kind === 'topic') {
                // A fresh topic says what it is for.
                root.append(face(bot, 'xl'), el('h2', null, window.emoji ? `${window.emoji} ${window.title}` : window.title));
                root.append(el('p', null, window.focus ? translateUi("这个话题专心聊：{0}", window.focus) : translateUi("想聊什么都可以直接说。")));
                return root;
            }
            root.append(face(bot, 'xl'), el('h2', null, bot.name));
            root.append(el('p', null, ['skipped', 'done'].includes(bot.bot?.onboarding?.phase)
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
        ['job', () => translateUi("主要帮你做"), 300], ['personality', () => translateUi("性格"), 6000], ['workStyle', () => translateUi("做事方式"), 0]];
    // The three ways a Bot works, from most freedom to most careful: the same one-line summaries
    // as Bot settings (pi-bot-settings.js, whose lists the guard test checks).
    const workLine = (id, fallback) => () => globalThis.PiBotWorkStyles?.get(id)?.line() || fallback();
    const WORK_STYLES = [
        ['free', () => translateUi("放手"), workLine('free', () => translateUi("大多数事直接办，少数高风险操作先问你"))],
        ['balanced', () => translateUi("稳妥"), workLine('balanced', () => translateUi("工作目录里直接做，运行命令前先问你"))],
        ['ask', () => translateUi("每次都问"), workLine('ask', () => translateUi("除了看和回答，每一步都先问你"))]
    ];
    const workRank = value => WORK_STYLES.findIndex(([key]) => key === value);
    // Quick personality styles on the card; one click fills the text, which stays editable.
    const PERSONALITY_STYLES = [
        [() => translateUi("干脆利落"), () => translateUi("说话干脆利落，先给结论，少说客套话。")],
        [() => translateUi("温柔耐心"), () => translateUi("温柔耐心，慢慢解释，多鼓励。")],
        [() => translateUi("幽默一点"), () => translateUi("轻松幽默，偶尔开个玩笑，但正事不含糊。")],
        [() => translateUi("专业严谨"), () => translateUi("专业严谨，用词准确，说清依据和不确定的地方。")]
    ];

    function setupFits(event) {
        return event?.method === 'select' && event.title === SETUP_TITLE && Array.isArray(event.options)
            && event.options.length === 2 && event.options[0] === SAVE && event.options[1] === DECLINE;
    }

    // The fields a card proposes as the server reads them (normalizeProposal in server/bot/bot-setup.js):
    // blank text, a list of blank items, null and finish:false propose nothing.
    const proposedKeys = args => Object.keys(args).filter(key => {
        const value = args[key];
        if (value == null || typeof value === 'string' && !value.trim()) return false;
        if (key === 'finish') return value !== false;
        return !Array.isArray(value) || value.some(item => !(typeof item === 'string' && !item.trim()));
    });
    // Same rule as workStyleOffered in server/bot/bot-setup.js: an unchanged way of working is asked
    // only on its own card while the work step is still open; a copy carried along with other fields,
    // or asked again after the step was answered, is neither shown nor saved.
    function workStyleOffered(args, now) {
        if (workRank(args.workStyle) < 0) return false;
        return args.workStyle !== now.workStyle
            || !now.steps?.work && proposedKeys(args).every(key => key === 'workStyle' || key === 'finish');
    }
    // "Mainly helps with" is saved as one line: runs of line breaks and other control characters
    // (typed or pasted into its wrapping box) become one space.
    const oneLine = value => value.replace(/ *[\x00-\x1f\x7f][\x00-\x1f\x7f ]*/g, ' ').trim();

    // A textarea that grows with its text from its rows up to its CSS max-height, then scrolls.
    // Called once it is in the page and on every input; the scrolling part around it keeps its place.
    function fitTextarea(area) {
        if (!area?.isConnected) return;
        const scroller = area.closest('.pi-bot-setup-fields, .pi-bot-sheet-pages, .pi-bot-sheet-body'), top = scroller?.scrollTop, inner = area.scrollTop;
        const style = getComputedStyle(area);
        area.style.height = 'auto';
        area.style.height = `${area.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)}px`;
        area.scrollTop = inner;
        if (scroller) scroller.scrollTop = top;
    }

    // ---- docked panels ---------------------------------------------------------------
    // Setup, approval and closing panels sit above the composer, under the floating identity in the
    // transcript. Their height comes from the page as it is laid out now (window, on-screen keyboard,
    // composer, chips, large text): the transcript keeps the identity clear (and, on taller screens,
    // a strip of the conversation), the panels share what is left, and only their bodies scroll.
    // With too little room for even the title, the actions and a bit of the body, a panel keeps
    // those and is drawn above the identity (pi-bot.css).
    const docked = new Set(), dockWatched = new WeakSet(), liftedDocks = new Map();
    let dockFrame = 0, dockObserver = null, dockModeObserver = null;
    const DOCK_GAP = 8, DOCK_BODY = 64;
    // Bodies that may shrink and scroll; every other part of a panel keeps its height.
    const DOCK_SCROLLING = '.pi-bot-setup-fields, .pi-bot-approval-detail';
    function dockWatch(node) {
        if (!node || dockWatched.has(node) || typeof ResizeObserver !== 'function') return;
        dockObserver ||= new ResizeObserver(scheduleDock);
        dockObserver.observe(node); dockWatched.add(node);
    }
    function dock(panel) {
        if (!docked.size) {
            window.addEventListener('resize', scheduleDock);
            window.visualViewport?.addEventListener('resize', scheduleDock);
            window.visualViewport?.addEventListener('scroll', scheduleDock);
            const chat = document.getElementById('chat-tab');
            if (chat && typeof MutationObserver === 'function') {
                dockModeObserver = new MutationObserver(scheduleDock);
                dockModeObserver.observe(chat, { attributes: true, attributeFilter: ['class'] });
            }
        }
        docked.add(panel); dockWatch(panel);
        scheduleDock();
    }
    function scheduleDock() { if (!dockFrame) dockFrame = requestAnimationFrame(fitDocked); }
    function liftDock(wrap, height) {
        wrap.classList.toggle('is-bot-dock-lifted', height > 0);
        if (height > 0) { liftedDocks.set(wrap, height); wrap.style.setProperty('--pi-bot-dock-lift', `${height}px`); }
        else { liftedDocks.delete(wrap); wrap.style.removeProperty('--pi-bot-dock-lift'); }
    }
    // The least a panel needs: its fixed parts, gaps and padding, and a little of its body.
    function dockFloor(panel) {
        const style = getComputedStyle(panel), parts = [...panel.children].filter(child => getComputedStyle(child).display !== 'none');
        let total = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
            + Math.max(0, parts.length - 1) * (parseFloat(style.rowGap) || 0);
        for (const part of parts) total += part.matches(DOCK_SCROLLING) ? Math.min(part.scrollHeight, DOCK_BODY) : part.getBoundingClientRect().height;
        return Math.ceil(total);
    }
    function fitDocked() {
        dockFrame = 0;
        const groups = new Map();
        for (const panel of docked) {
            const wrap = panel.isConnected && !panel.hidden ? panel.closest('.pi-composer-wrap') : null;
            const viewport = wrap?.parentElement?.querySelector(':scope > .pi-transcript-viewport');
            if (!viewport || !wrap.closest('#chat-tab.pi-bot-mode')) { panel.style.removeProperty('--pi-bot-card-room'); continue; }
            if (!groups.has(wrap)) groups.set(wrap, { viewport, panels: [] });
            groups.get(wrap).panels.push(panel);
        }
        for (const wrap of liftedDocks.keys()) if (!groups.has(wrap)) liftDock(wrap, 0);
        // A phone keyboard can shrink only the visual viewport, leaving the layout unchanged.
        // Move this Bot's visible dock above it; intentional pinch zoom keeps normal page panning.
        const view = window.visualViewport, visual = view && Math.abs(view.scale - 1) < 0.01 ? view : null;
        for (const [wrap, { viewport, panels }] of groups) {
            const shell = wrap.parentElement, header = viewport.querySelector(':scope > #pi-bot-header');
            const bottom = wrap.getBoundingClientRect().bottom + (liftedDocks.get(wrap) || 0);
            const shellBottom = shell.getBoundingClientRect().bottom, visualBottom = visual ? visual.offsetTop + visual.height : Infinity;
            const lift = visualBottom < shellBottom - 0.5 ? Math.max(0, Math.ceil(bottom - (visualBottom - DOCK_GAP))) : 0;
            liftDock(wrap, lift);
            for (const node of [shell, wrap, header]) dockWatch(node);
            for (const panel of panels) for (const area of panel.querySelectorAll('textarea')) fitTextarea(area);
            const box = header && !header.hidden ? header.getBoundingClientRect() : null;
            const clear = Math.max(0, Math.max(box?.bottom || 0, visual?.offsetTop || 0) - viewport.getBoundingClientRect().top);
            let others = 0;
            for (const child of shell.children) if (child !== viewport && child !== wrap) others += child.offsetHeight;
            const height = Math.max(0, shell.clientHeight - lift), strip = Math.min(96, Math.max(0, height - 520) / 3);
            const rest = wrap.getBoundingClientRect().height - panels.reduce((sum, panel) => sum + panel.getBoundingClientRect().height, 0);
            const room = Math.floor((height - others - rest - clear - DOCK_GAP - strip) / panels.length);
            for (const panel of panels) panel.style.setProperty('--pi-bot-card-room', `${Math.max(room, dockFloor(panel))}px`);
        }
    }

    // The control a redraw puts focus back on: the same field, choice or button of the same card.
    const setupFocusKey = node => !node?.dataset ? '' : node.dataset.setupField ? `field:${node.dataset.setupField}`
        : node.dataset.setupWork ? `work:${node.dataset.setupWork}` : node.dataset.setupUse ? `use:${node.dataset.setupUse}`
        : node.dataset.setupStyle ? `style:${node.dataset.setupStyle}` : node.dataset.avatarPreset ? `preset:${node.dataset.avatarPreset}`
        : node.dataset.setupPicture ? `picture:${node.dataset.setupPicture}` : node.matches('[data-setup-fact]') ? `fact:${node.value}`
        : node.matches('.pi-bot-setup-save') ? 'save' : node.matches('.pi-bot-setup-later') ? 'later' : '';

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

    // identity(): { id, name, avatar, job, workStyle, phase, chosen, steps } of the Bot now; uploadPicture(dataUrl) saves
    // a picture face and resolves to the avatar service's answer; notify(message) tells the user something in passing;
    // later(toolCallId, { workStyleShown }) records that the user leaves the card's steps for later (during the
    // interview); save(toolCallId, changes, { picture, workStyleShown }) saves the card. workStyleShown says whether
    // this card, as drawn, showed the way of working (from its retained draft, never from a reread Bot).
    function createSetupCards({ enabled, calls, respond, save, face: currentFace, changed, identity = () => null, uploadPicture = null, notify = null, later: leaveForLater = null }) {
        const panel = el('section', 'pi-bot-setup'); panel.hidden = true;
        panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', translateUi("请你确认设置"));
        // drawn: the card the panel shows, so a redraw of the same card keeps its scroll and focus.
        let current = null, retry = 0, retries = 0, serial = 0, drawn = null;
        const owns = event => enabled() && setupFits(event);
        dock(panel);

        function hide() { current = null; drawn = null; panel.hidden = true; panel.replaceChildren(); changed?.(); }

        // What the card starts from, kept while the card is open (a failed save keeps every edit).
        // A proposed value the Bot already has is left out; a name or face the user chose before
        // stays unless they tick the change (UAT-03).
        function draftFor(args) {
            const now = identity() || {};
            const existing = key => key === 'name' ? now.name ?? null : key === 'avatar' ? (now.avatar?.kind === 'emoji' ? now.avatar.value : null)
                : key === 'job' ? now.job || null : null;
            // chosen: from the server (picked by any path, kept across a new interview).
            const chosen = key => (key === 'name' || key === 'avatar') && (now.chosen ? now.chosen[key] === true
                : now.steps?.identity === 'done' || now.steps?.[key] === 'done' || key === 'avatar' && ['image', 'preset'].includes(now.avatar?.kind));
            const fields = [];
            for (const [key] of SETUP_FIELDS) {
                const value = key === 'avatar' && args.avatar ? (args.avatar?.kind === 'preset' ? { ...args.avatar } : { ...NEW_BOT_FACE })
                    : typeof args[key] === 'string' ? args[key].trim() : '';
                if (key === 'workStyle') {
                    // Shown when offered (workStyleOffered): the point is then to let the user pick. Only the
                    // current way or more careful ones are offered; more freedom is set in Bot settings.
                    if (!workStyleOffered(args, now)) continue;
                    const now_ = workRank(now.workStyle) < 0 ? 'free' : now.workStyle;
                    fields.push({ key, value: workRank(value) >= workRank(now_) ? value : now_, use: true, kept: null, floor: now_ });
                    continue;
                }
                // A proposed face is always shown, even the current one, so a picture can be uploaded instead (UAT-14).
                if (!value || existing(key) === value && key !== 'avatar') continue;
                const sameFace = key === 'avatar' && now.avatar?.kind === 'preset' && now.avatar.id === value.id;
                // The current face is shown beside a different proposed one, so keeping it is a visible choice.
                const show = chosen(key) || key === 'avatar' && now.avatar && !sameFace;
                fields.push({ key, value, use: !chosen(key), kept: show ? { name: now.name, avatar: now.avatar, id: now.id } : null });
            }
            const facts = [...new Set((Array.isArray(args.aboutUser) ? args.aboutUser : []).filter(item => typeof item === 'string' && item.trim()))]
                .map(text => ({ text, checked: true }));
            // pictureVersion: the chosen picture, once the avatar service has it; uploaded: the last
            // picture this card put up, which stays the face even if the draft changes afterwards.
            return { fields, facts, picture: null, pictureVersion: null, uploaded: null };
        }

        // The three ways of working as choices; ones freer than now are left out (with a pointer to settings).
        function workRow(field) {
            const row = el('div', 'pi-bot-setup-field is-workStyle');
            const group = el('fieldset', 'pi-bot-setup-work');
            group.append(el('legend', 'pi-bot-setup-label', translateUi("做事方式")));
            for (const [key, title, detail] of WORK_STYLES) {
                if (workRank(key) < workRank(field.floor)) continue;
                const option = el('label', 'pi-bot-setup-work-option'), radio = el('input');
                radio.type = 'radio'; radio.name = `pi-bot-setup-${serial}-work`; radio.value = key; radio.checked = field.value === key; radio.dataset.setupWork = key;
                radio.addEventListener('change', () => { if (radio.checked) field.value = key; });
                const text = el('span'); text.append(el('strong', null, title()), el('small', null, detail()));
                option.append(radio, text);
                group.append(option);
            }
            if (workRank(field.floor) > 0) group.append(el('p', 'pi-bot-setup-work-note', translateUi("想让它更放手，可以在设置里改。")));
            row.append(group);
            return row;
        }

        function fieldRow(field, draft) {
            if (field.key === 'workStyle') return workRow(field);
            const [, label, max] = SETUP_FIELDS.find(([key]) => key === field.key);
            const row = el('div', `pi-bot-setup-field is-${field.key}`);
            const id = `pi-bot-setup-${serial}-${field.key}`;
            const caption = el('label', 'pi-bot-setup-label', label()); if (field.key !== 'avatar') caption.htmlFor = id;
            const body = el('div', 'pi-bot-setup-value');
            // Long text wraps and grows (job: one line when saved; personality: keeps its paragraphs).
            const long = field.key === 'job' || field.key === 'personality';
            const input = field.key === 'avatar' ? null : (long ? el('textarea') : el('input'));
            if (input) {
                input.id = id; input.value = typeof field.value === 'string' ? field.value : ''; input.maxLength = max; input.dataset.setupField = field.key;
                if (long) input.rows = field.key === 'job' ? 2 : 3;
            }
            let toggle = null;
            const use = on => { field.use = on; row.classList.toggle('is-kept', !on); if (toggle) toggle.checked = on; };
            input?.addEventListener('input', () => {
                field.value = input.value;
                if (long) fitTextarea(input);
                if (!field.use) use(true);
            });
            if (field.key === 'avatar') {
                if (typeof field.value !== 'object' || field.value?.kind !== 'preset') field.value = { ...NEW_BOT_FACE };
                if (window.PiAvatar) {
                    body.append(window.PiAvatar.choices(field.value, value => {
                        draft.pictureRequest = (draft.pictureRequest || 0) + 1;
                        field.value = value; draft.picture = null; draft.pictureVersion = null; use(true); render();
                    }));
                    if (!draft.picture && field.value?.kind === 'preset') body.append(face({ avatar: field.value }, 'lg'));
                }
            }
            if (field.key === 'personality') {
                const styles = el('div', 'pi-bot-setup-styles'); styles.setAttribute('role', 'group'); styles.setAttribute('aria-label', translateUi("快速选一种性格"));
                for (const [index, [title, text]] of PERSONALITY_STYLES.entries()) {
                    const chip = el('button', 'pi-bot-chip', title()); chip.type = 'button'; chip.dataset.setupStyle = String(index + 1);
                    chip.addEventListener('click', () => { input.value = field.value = text(); use(true); fitTextarea(input); input.focus(); });
                    styles.append(chip);
                }
                body.append(styles);
            }
            if (field.key === 'avatar' && draft.picture) {
                const preview = el('span', 'pi-bot-setup-picture'), img = el('img');
                img.src = draft.picture; img.alt = translateUi("新头像图片"); preview.append(img);
                const back = el('button', 'pi-bot-chip', translateUi("不用这张图片")); back.type = 'button'; back.dataset.setupPicture = 'clear';
                back.addEventListener('click', () => { draft.picture = null; draft.pictureVersion = null; render(); panel.querySelector('[data-avatar-preset]')?.focus(); });
                body.append(preview, back);
            } else if (input) body.append(input);
            if (field.key === 'avatar' && uploadPicture) {
                const file = el('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp,image/gif'; file.hidden = true; file.dataset.setupPictureFile = '';
                const pick = el('button', 'pi-bot-chip', draft.picture ? translateUi("换一张") : translateUi("上传图片")); pick.type = 'button'; pick.dataset.setupPicture = 'pick';
                pick.addEventListener('click', () => file.click());
                file.addEventListener('change', async () => {
                    const chosen = file.files?.[0]; file.value = '';
                    if (!chosen || !current) return;
                    const target = current, request = draft.pictureRequest = (draft.pictureRequest || 0) + 1;
                    try {
                        const dataUrl = await pictureData(chosen);
                        if (current !== target || draft.pictureRequest !== request) return;
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
            const later = el('button', 'pi-bot-setup-later', laterLabel()); later.type = 'button';
            const confirm = el('button', 'pi-bot-primary pi-bot-setup-save', current.saving ? translateUi("正在保存…") : nothing && args.finish !== true ? translateUi("好") : translateUi("保存"));
            confirm.type = 'button';
            later.disabled = confirm.disabled = Boolean(current.saving);
            later.hidden = !interviewing() && nothing && args.finish !== true;
            later.addEventListener('click', () => void decline());
            confirm.addEventListener('click', () => void submit());
            foot.append(note, later, confirm);
            // A redraw of the same card (a picked face or picture, saving, an error) keeps the place the
            // user scrolled to and the control they were on, with its text selection. A control redrawn
            // while disabled (saving) gets focus back once it is usable, unless the user moved on.
            const active = document.activeElement, same = drawn === current;
            const inside = same && panel.contains(active) && active !== panel;
            const { key, selection } = inside ? { key: setupFocusKey(active), selection: typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null }
                : same && (!active || active === document.body) && current.refocus || { key: '', selection: null };
            const scrolled = same ? panel.querySelector('.pi-bot-setup-fields')?.scrollTop || 0 : 0;
            panel.replaceChildren(head, form, foot);
            if (current.saving) for (const control of form.querySelectorAll('button,input,select,textarea')) control.disabled = true;
            panel.hidden = false;
            drawn = current; current.refocus = null;
            for (const area of form.querySelectorAll('textarea')) fitTextarea(area);
            form.scrollTop = scrolled;
            if (key) {
                const target = [...panel.querySelectorAll('button,input,textarea')].find(node => setupFocusKey(node) === key);
                if (target && !target.disabled) {
                    target.focus({ preventScroll: true });
                    if (selection && typeof target.selectionStart === 'number') target.setSelectionRange(...selection);
                } else current.refocus = { key, selection };
            }
            scheduleDock();
        }

        // While getting to know each other every card can be left for later; that is recorded, so
        // the Bot does not ask the same step again (UAT-14). Afterwards it is simply "not now".
        const interviewing = () => ['greeting', 'interview'].includes(identity()?.phase);
        const laterLabel = () => interviewing() ? translateUi("以后再说") : translateUi("先不改");
        async function decline() {
            if (!current || current.saving) return;
            const target = current, draft = target.draft;
            if (interviewing() && leaveForLater) {
                target.saving = true; target.error = ''; render();
                try { await leaveForLater(target.call.id, { workStyleShown: workShown(draft) }); }
                catch (error) {
                    if (current === target) { target.saving = false; target.error = error.message || translateUi("保存失败"); render(); }
                    return;
                }
                if (current !== target) return;
            }
            // A picture this card uploaded stays the face even though the rest is not saved.
            const face = identity()?.avatar;
            if (draft.uploaded && (!face || face.kind === 'image' && face.version === draft.uploaded))
                notify?.(translateUi("上传的图片已经是头像了；要换回可以在设置里改。"));
            respond({ id: target.event.id, value: DECLINE }); hide();
        }

        const workShown = draft => draft.fields.some(field => field.key === 'workStyle');
        // The user's choices, from the draft: a field left unticked or emptied is not saved (null).
        function collect(draft) {
            const changes = {};
            for (const field of draft.fields) {
                const value = typeof field.value === 'string' ? (field.key === 'job' ? oneLine(field.value) : field.value.trim()) : field.value;
                changes[field.key] = field.use && value ? value : null;
            }
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
            // Even unchanged or unticked values answer their own interview steps on the server.
            target.saving = true; target.error = ''; render();
            try {
                if (picture && !draft.pictureVersion) {
                    const uploaded = await uploadPicture(draft.picture);
                    if (!/^[a-f0-9]{64}$/.test(uploaded?.profile?.avatar?.version || '')) throw new Error(translateUi("头像图片没有保存成功，请再试一次"));
                    draft.pictureVersion = draft.uploaded = uploaded.profile.avatar.version;
                }
                await save(target.call.id, changes, { picture: picture ? draft.pictureVersion : null, workStyleShown: workShown(draft) });
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
    // "<kind> #<token>" on its first line, optionally "rule <JSON>" (a grant the user may keep)
    // on the second, and the detail after a blank line. One at a time.
    const APPROVAL_TITLE = '允许这一步吗？ / Allow this step?';
    const APPROVAL_KINDS = {
        command: name => translateUi("{0} 想运行一条命令", name),
        delegate: name => translateUi("{0} 想把这件事交给另一个助手", name),
        outside: name => translateUi("{0} 想改工作目录以外的文件", name),
        write: name => translateUi("{0} 想写入文件", name),
        memory: name => translateUi("{0} 想记下这件事", name),
        action: name => translateUi("{0} 想做这一步", name),
        schedule: name => translateUi("{0} 想安排或取消定时任务", name),
        topic: name => translateUi("{0} 想开一个新话题", name)
    };
    function parseApproval(event) {
        if (event?.method !== 'confirm' || event.title !== APPROVAL_TITLE) return null;
        const match = /^([a-z]+) #[a-f0-9]{16}(?:\nrule (\{[^\n]*\}))?\n\n([\s\S]*)$/.exec(typeof event.message === 'string' ? event.message : '');
        if (!match || !Object.hasOwn(APPROVAL_KINDS, match[1])) return null;
        // Only a valid grant of the matching kind can be kept; otherwise the step is still asked once.
        const rule = match[2] ? globalThis.PiBotRules?.parse(match[2]) || null : null;
        return { kind: match[1], detail: match[3], rule: rule && globalThis.PiBotRules.fits(match[1], rule) ? rule : null };
    }
    // Other steps name a tool; the familiar ones read as what they do.
    const APPROVAL_ACTIONS = { deliver_files: () => translateUi("把文件交给你"), get_attachment: () => translateUi("取出你上传的附件原件"),
        media_generate: () => translateUi("生成图片、视频或语音") };

    // remember(rule): saves a grant the request offered (resolves once saved, throws otherwise);
    // owner(): the open conversation, so a slow save never answers a request of another one.
    function createApprovalCards({ enabled, respond, face: currentFace, name, changed, remember = null, owner = () => '', notify = null }) {
        const panel = el('section', 'pi-bot-setup pi-bot-approval'); panel.hidden = true;
        panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', translateUi("等你确认"));
        // drawn: the request the panel shows, so a redraw of it keeps the detail's scroll and the focus.
        let current = null, drawn = null;
        const owns = event => enabled() && Boolean(parseApproval(event));
        dock(panel);
        const FOCUSABLE = ['.pi-bot-approval-detail', '.pi-bot-approval-allow', '.pi-bot-approval-keep', '.pi-bot-setup-later'];

        function hide() { if (!current && panel.hidden) return; current = null; drawn = null; panel.hidden = true; panel.replaceChildren(); changed?.(); }

        function render(waiting) {
            const target = current, { event, kind, detail, rule } = target;
            const who = name() || translateUi('伙伴');
            const head = el('header', 'pi-bot-setup-head');
            head.append(currentFace(), el('strong', null, APPROVAL_KINDS[kind](who)));
            const shown = kind === 'action' && Object.hasOwn(APPROVAL_ACTIONS, detail) ? APPROVAL_ACTIONS[detail]()
                : kind === 'schedule' ? detail.replace(/^Create: /, translateUi("安排：")).replace(/^Cancel: /, translateUi("取消：")) : detail;
            const body = el('pre', `pi-bot-approval-detail is-${kind}`, shown);
            body.tabIndex = 0;
            const foot = el('footer', 'pi-bot-setup-foot');
            const note = el('p', 'pi-bot-setup-note', target.error || (waiting > 0 ? translateUi("后面还有 {0} 步等你确认", waiting) : ''));
            note.setAttribute('role', 'status'); note.classList.toggle('is-error', Boolean(target.error));
            const deny = el('button', 'pi-bot-setup-later', translateUi("不要")); deny.type = 'button';
            const keepable = Boolean(rule && remember);
            const allow = el('button', 'pi-bot-primary pi-bot-approval-allow', keepable ? translateUi("允许这次") : translateUi("允许")); allow.type = 'button';
            const answer = confirmed => {
                if (current !== target || target.answered || target.saving) return;
                target.answered = true; for (const control of panel.querySelectorAll('button')) control.disabled = true;
                respond({ id: event.id, confirmed });
            };
            deny.addEventListener('click', () => answer(false));
            allow.addEventListener('click', () => answer(true));
            const parts = [head, body];
            if (keepable) {
                // "Always allow" is a separate, explicit choice: the first click shows exactly what
                // it covers, the second saves the grant, and only then is this one step allowed.
                const keep = el('button', 'pi-bot-chip pi-bot-approval-keep', target.saving ? translateUi("正在保存…")
                    : target.armed ? translateUi("确认以后都允许") : translateUi("以后都允许"));
                keep.type = 'button'; keep.setAttribute('aria-expanded', String(Boolean(target.armed)));
                keep.addEventListener('click', () => {
                    if (current !== target || target.answered || target.saving) return;
                    if (!target.armed) { target.armed = true; target.error = ''; render(waiting); panel.querySelector('.pi-bot-approval-keep')?.focus(); return; }
                    void keepRule(target, waiting);
                });
                if (target.armed) {
                    const scope = el('div', 'pi-bot-approval-scope'); scope.setAttribute('role', 'note');
                    const grant = el('p', 'pi-bot-approval-rule');
                    grant.append(el('strong', null, globalThis.PiBotRules.label(rule)), el('code', null, rule.value));
                    const where = globalThis.PiBotRules.place(rule);
                    if (where) grant.append(el('small', null, where));
                    scope.append(grant, el('p', null, globalThis.PiBotRules.scope(rule, who)),
                        el('p', null, translateUi("这条规则只在 OhMyBuddy 的工具层生效，不是系统沙箱：允许的命令以 OhMyBuddy 服务的权限运行。可以随时在设置的“做事方式”里撤销。")));
                    parts.push(scope);
                }
                foot.append(note, deny, keep, allow);
            } else foot.append(note, deny, allow);
            parts.push(foot);
            const active = document.activeElement, same = drawn === target && panel.contains(active);
            const focused = same ? FOCUSABLE.find(selector => active.matches(selector)) : null;
            const scrolled = drawn === target ? panel.querySelector('.pi-bot-approval-detail')?.scrollTop || 0 : 0;
            panel.replaceChildren(...parts);
            if (target.saving || target.answered) for (const control of panel.querySelectorAll('button')) control.disabled = true;
            panel.hidden = false;
            drawn = target; body.scrollTop = scrolled;
            if (focused) panel.querySelector(focused)?.focus({ preventScroll: true });
            scheduleDock();
        }

        // Save the grant first; allow this step only if the same request of the same conversation is
        // still waiting. A failed or conflicting save keeps the card and never answers for the user.
        async function keepRule(target, waiting) {
            const conversation = owner();
            target.saving = true; target.error = ''; render(waiting);
            let saved = false;
            try { await remember(target.rule); saved = true; }
            catch (error) {
                target.error = error.status === 409 ? translateUi("设置刚刚在别处改过，规则还没保存；可以再点一次，或者只允许这次")
                    : translateUi("规则没有保存：{0}", error.message || translateUi("保存失败"));
            }
            target.saving = false;
            if (current !== target || target.answered) {
                if (saved) notify?.(translateUi("规则已保存；那一步已经不在等待，没有替你回答。"));
                return;
            }
            if (saved && owner() === conversation) {
                target.answered = true;
                for (const control of panel.querySelectorAll('button')) control.disabled = true;
                respond({ id: target.event.id, confirmed: true });
                return;
            }
            if (saved) target.error = translateUi("规则已保存，但聊天刚刚切换了；这一步没有替你回答");
            render(waiting);
        }

        // Called whenever pending requests change; the answered request leaves when the
        // server reports it resolved.
        function sync(pending, connected) {
            const requests = connected && enabled() ? [...pending.values()].filter(event => parseApproval(event)) : [];
            if (!requests.length) { hide(); return; }
            const event = requests[0];
            if (current?.event.id !== event.id) current = { event, ...parseApproval(event), answered: false, armed: false, saving: false, error: '' };
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
        history: createWindowHistory, face, pictureData, fitTextarea });
})();
