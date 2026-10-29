// Bot mode at a glance: what each Bot's chats are doing, derived only from GET /bots and the
// page's existing /activity poll (no new endpoint, no worker started). Used for the badges in the
// Bot rail and chat list, and for the phone's "All Bots" home. Faces stay static here.
((root, factory) => {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PiBotHome = api;
})(globalThis, () => {
    const translateUi = (text, ...values) => (globalThis.PiI18n?.t || ((source, ...args) => source.replace(/\{(\d+)\}/g, (_, index) => args[index] ?? `{${index}}`)))(text, ...values);

    // The page's activity as Bot mode needs it. null: not read yet; fresh false: the last read failed.
    function live(data, fresh = true) {
        if (!fresh || !data) return { fresh: false, runtimes: new Map(), notices: new Set() };
        const runtimes = new Map();
        for (const item of Array.isArray(data.runtimes) ? data.runtimes : []) {
            if (typeof item?.sessionId === 'string') runtimes.set(item.sessionId, { phase: item.phase || 'idle', busy: Boolean(item.busy || item.backgroundWork) });
        }
        const notices = new Set((Array.isArray(data.replyNotices) ? data.replyNotices : []).map(item => item?.sessionId).filter(id => typeof id === 'string'));
        return { fresh: true, runtimes, notices };
    }

    // A stable string for "did anything shown change", so a poll that changes nothing repaints nothing.
    function signature(bots, state) {
        if (!state) return 'none';
        if (!state.fresh) return 'unknown';
        const parts = [];
        for (const bot of bots || []) for (const item of bot.windows || []) {
            if (!item.sessionId) continue;
            const value = windowState(item, state);
            if (value) parts.push(`${item.sessionId}:${value}`);
        }
        return parts.sort().join('|');
    }

    const open = item => item.generation !== null && !item.archivedAt;

    // One chat's state: waiting for the user, a reply not yet seen, working, or nothing to say.
    function windowState(item, state) {
        if (!state?.fresh || !item?.sessionId) return null;
        const runtime = state.runtimes.get(item.sessionId);
        if (runtime?.phase === 'waiting') return 'waiting';
        if (state.notices.has(item.sessionId)) return 'new';
        if (runtime?.busy) return 'working';
        return null;
    }

    // A Bot's summary: kind (waiting > working > greeting > idle; unknown when activity cannot be
    // read, loading before the first read), where that happens, chats with new replies, and the
    // one topic worth a shortcut (waiting, then new replies, then working).
    function summarize(bot, state) {
        const windows = (bot.windows || []).filter(open);
        const topics = windows.filter(item => item.kind === 'topic');
        const states = new Map(windows.map(item => [item.id, windowState(item, state)]));
        const unread = windows.filter(item => states.get(item.id) === 'new').length;
        const waiting = windows.find(item => states.get(item.id) === 'waiting') || null;
        const working = waiting ? null : windows.find(item => states.get(item.id) === 'working') || null;
        const greeting = ['greeting', 'interview'].includes(bot.bot?.onboarding?.phase);
        const kind = !state ? 'loading' : !state.fresh ? 'unknown' : waiting ? 'waiting' : working ? 'working' : greeting ? 'greeting' : 'idle';
        const rank = item => ({ waiting: 3, new: 2, working: 1 })[states.get(item.id)] || 0;
        const attention = topics.filter(item => rank(item)).sort((a, b) => rank(b) - rank(a))[0] || null;
        return { kind, where: waiting || working, unread, topics, attention, states };
    }

    const place = item => item.kind === 'main' ? translateUi("主聊天") : translateUi("话题“{0}”", item.title);
    function statusText(bot, summary) {
        if (summary.kind === 'waiting') return translateUi("等你确认 · {0}", place(summary.where));
        if (summary.kind === 'working') return translateUi("正在忙 · {0}", place(summary.where));
        if (summary.kind === 'unknown') return translateUi("暂时看不到它在做什么");
        if (summary.kind === 'greeting') return translateUi("还在互相认识");
        return bot.bot?.job || translateUi("你的私人助理");
    }

    // Other Bots with a reply not seen yet or a confirmation waiting (the drawer's "All Bots" row).
    function othersWithNews(bots, state, currentId) {
        return (bots || []).filter(bot => bot.id !== currentId && bot.enabled !== false).filter(bot => {
            const summary = summarize(bot, state);
            return summary.unread > 0 || summary.kind === 'waiting';
        }).length;
    }

    // Rows for the home list after the search and filter; order is GET /bots order (bot.order).
    function rows(bots, state, { query = '', filter = 'all' } = {}) {
        const needle = query.trim().toLowerCase(), result = [];
        for (const bot of bots || []) {
            const summary = summarize(bot, state);
            if (filter === 'waiting' && summary.kind !== 'waiting') continue;
            if (filter === 'unread' && !summary.unread) continue;
            if (!needle || String(bot.name || '').toLowerCase().includes(needle)) { result.push({ bot, summary, match: null }); continue; }
            const match = summary.topics.find(item => String(item.title || '').toLowerCase().includes(needle));
            if (match) result.push({ bot, summary, match });
        }
        return result;
    }

    // ---- the phone home (DOM) ---------------------------------------------------------------
    // face(bot, size) draws a static face; onOpen(botId, windowId?), onTopics(botId), onCreate(),
    // onClose() are the page's actions.
    function create({ face, onOpen, onTopics, onCreate, onClose }) {
        const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };
        const icon = name => { const i = el('i', `fa-solid ${name}`); i.setAttribute('aria-hidden', 'true'); return i; };
        const button = (className, label) => { const b = el('button', className); b.type = 'button'; if (label) b.setAttribute('aria-label', label); return b; };
        const root = el('section', 'pi-bot-home');
        root.hidden = true; root.setAttribute('aria-labelledby', 'pi-bot-home-title');
        let bots = [], state = null, query = '', filter = 'all', creating = false, list = null;

        function head() {
            const bar = el('header', 'pi-bot-home-head');
            const back = button('pi-bot-home-back', translateUi("回到聊天")); back.dataset.homeAction = 'close'; back.append(icon('fa-chevron-left'));
            const title = el('h2', null, translateUi("我的伙伴")); title.id = 'pi-bot-home-title';
            const count = el('span', 'pi-bot-home-count', translateUi("{0} 个", bots.length));
            const add = button('pi-bot-home-new', creating ? translateUi("正在创建…") : translateUi("新建伙伴")); add.dataset.homeAction = 'create'; add.disabled = creating;
            add.append(creating ? el('span', 'pi-spinner') : icon('fa-plus'), el('span', null, translateUi("新建")));
            bar.append(back, title, count, add);
            return bar;
        }

        function render() {
            const inner = el('div', 'pi-bot-home-inner');
            inner.append(head());
            const search = el('div', 'pi-bot-home-search'); search.setAttribute('role', 'search');
            const input = document.createElement('input'); input.type = 'search'; input.id = 'pi-bot-home-query'; input.value = query;
            input.placeholder = translateUi("找伙伴或话题"); input.autocomplete = 'off'; input.enterKeyHint = 'search'; input.setAttribute('aria-label', translateUi("找伙伴或话题"));
            search.append(icon('fa-magnifying-glass'), input);
            const counts = { all: bots.length, waiting: 0, unread: 0 };
            for (const bot of bots) { const summary = summarize(bot, state); if (summary.kind === 'waiting') counts.waiting++; if (summary.unread) counts.unread++; }
            const filters = el('div', 'pi-bot-home-filters'); filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', translateUi("筛选"));
            for (const [key, label] of [['all', translateUi("全部")], ['waiting', translateUi("等你确认")], ['unread', translateUi("有新回复")]]) {
                const chip = button('pi-bot-home-filter'); chip.dataset.homeAction = 'filter'; chip.dataset.filter = key;
                chip.setAttribute('aria-pressed', String(filter === key));
                chip.append(el('span', null, label), el('span', 'pi-bot-home-filter-count', String(counts[key])));
                filters.append(chip);
            }
            list = el('div', 'pi-bot-home-list');
            inner.append(search, filters, list);
            root.replaceChildren(inner);
            renderList();
        }

        function renderList() {
            if (!list) return;
            const found = rows(bots, state, { query, filter });
            if (!found.length) {
                const calm = el('div', 'pi-bot-home-calm');
                const text = query.trim() ? translateUi("没有找到“{0}”", query.trim()) : filter === 'waiting' ? translateUi("现在没有等你确认的事") : translateUi("没有新回复");
                const clear = button('pi-bot-chip'); clear.dataset.homeAction = 'clear'; clear.textContent = translateUi("清除筛选");
                calm.append(el('strong', null, text), el('p', null, query.trim() ? translateUi("试试伙伴的名字或话题名。") : translateUi("有新的动静时会出现在这里。")), clear);
                list.replaceChildren(calm);
                return;
            }
            const ul = el('ul', 'pi-bot-home-bots'); ul.setAttribute('aria-label', translateUi("伙伴列表"));
            for (const row of found) ul.append(item(row));
            list.replaceChildren(ul);
        }

        function item({ bot, summary, match }) {
            const li = el('li', 'pi-bot-home-row'); li.dataset.botId = bot.id;
            const text = statusText(bot, summary);
            const openMain = button('pi-bot-home-open'); openMain.dataset.homeAction = 'open'; openMain.dataset.botId = bot.id;
            openMain.setAttribute('aria-label', [bot.name, text, summary.unread ? translateUi("{0} 个聊天有新回复", summary.unread) : '', translateUi("打开主聊天")].filter(Boolean).join('，'));
            const line = el('span', `pi-bot-home-state is-${summary.kind}`);
            if (['waiting', 'working'].includes(summary.kind)) line.append(el('i', 'pi-bot-status-dot'));
            line.append(el('span', null, text));
            const name = el('span', 'pi-bot-home-name', bot.name); name.title = bot.name;
            openMain.append(face(bot, 'lg'), name, line);
            if (summary.unread) openMain.append(el('span', 'pi-bot-home-unread', String(summary.unread)));
            if (bot.enabled === false) li.classList.add('is-disabled');
            const quick = el('div', 'pi-bot-home-quick'); quick.setAttribute('role', 'group'); quick.setAttribute('aria-label', translateUi("{0} 的话题", bot.name));
            const shortcut = match || summary.attention;
            if (shortcut) {
                const value = summary.states.get(shortcut.id);
                const chip = button('pi-bot-home-topic'); chip.dataset.homeAction = 'open'; chip.dataset.botId = bot.id; chip.dataset.windowId = shortcut.id;
                const label = { waiting: translateUi("等你确认"), new: translateUi("新回复"), working: translateUi("正在忙") }[value] || '';
                chip.setAttribute('aria-label', label ? translateUi("话题“{0}”，{1}", shortcut.title, label) : translateUi("话题“{0}”", shortcut.title));
                chip.append(icon('fa-hashtag'), el('span', 'pi-bot-home-topic-title', shortcut.title));
                if (value) {
                    const mark = el('span', `pi-bot-home-topic-state is-${value}`); mark.append(el('i', 'pi-bot-status-dot'));
                    // The state line already names a waiting or busy topic; its shortcut then keeps only the dot.
                    if (shortcut !== summary.where) mark.append(el('span', null, label));
                    chip.append(mark);
                }
                quick.append(chip);
            }
            const all = button('pi-bot-home-all', translateUi("{0} 的聊天和话题（{1} 个话题）", bot.name, summary.topics.length));
            all.dataset.homeAction = 'topics'; all.dataset.botId = bot.id;
            all.append(el('span', null, translateUi("话题 {0}", summary.topics.length)), icon('fa-chevron-right'));
            quick.append(all);
            li.append(openMain, quick);
            return li;
        }

        root.addEventListener('click', event => {
            const target = event.target.closest('[data-home-action]');
            if (!target || target.disabled) return;
            const action = target.dataset.homeAction;
            if (action === 'close') onClose?.();
            else if (action === 'create') onCreate?.();
            else if (action === 'open') onOpen?.(target.dataset.botId, target.dataset.windowId || null);
            else if (action === 'topics') onTopics?.(target.dataset.botId);
            else if (action === 'filter') { filter = target.dataset.filter; render(); root.querySelector(`[data-filter="${filter}"]`)?.focus(); }
            else if (action === 'clear') { filter = 'all'; query = ''; render(); root.querySelector('#pi-bot-home-query')?.focus(); }
        });
        root.addEventListener('input', event => { if (event.target.id === 'pi-bot-home-query') { query = event.target.value; renderList(); } });
        root.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); onClose?.(); } });

        return {
            element: root,
            get open() { return !root.hidden; },
            show(next, nextState, focusBotId) {
                bots = next || []; state = nextState; root.hidden = false; render();
                const row = focusBotId && root.querySelector(`.pi-bot-home-row[data-bot-id="${CSS.escape(focusBotId)}"] .pi-bot-home-open`);
                (row || root.querySelector('.pi-bot-home-back'))?.focus({ preventScroll: true });
            },
            hide() { root.hidden = true; root.replaceChildren(); list = null; },
            // New data while open: repaint, keeping the search box's focus and caret.
            update(next, nextState, busy = creating) {
                bots = next || []; state = nextState; creating = busy;
                if (root.hidden) return;
                const active = document.activeElement, inside = root.contains(active);
                const key = inside ? (active.id || `${active.dataset.homeAction || ''}|${active.dataset.botId || ''}|${active.dataset.windowId || ''}|${active.dataset.filter || ''}`) : null;
                const caret = active?.id === 'pi-bot-home-query' ? [active.selectionStart, active.selectionEnd] : null;
                render();
                if (!key) return;
                const again = key === 'pi-bot-home-query' ? root.querySelector('#pi-bot-home-query') : [...root.querySelectorAll('[data-home-action]')]
                    .find(node => `${node.dataset.homeAction || ''}|${node.dataset.botId || ''}|${node.dataset.windowId || ''}|${node.dataset.filter || ''}` === key);
                again?.focus({ preventScroll: true });
                if (caret && again) again.setSelectionRange(caret[0], caret[1]);
            }
        };
    }

    return Object.freeze({ live, signature, windowState, summarize, statusText, othersWithNews, rows, create });
});
