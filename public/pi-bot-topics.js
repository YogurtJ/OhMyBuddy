(() => {
    // Topics: separate chats of one Bot, each with a title, an optional focus, instructions and face. The
    // sheet creates and edits them against the Bot's windows revision; archiving keeps every
    // generation's history and can be undone. The main chat is never renamed or archived here.
    // Receipt cards show a topic the Bot opened through its tool, with an explicit way in.
    const translateUi = globalThis.PiI18n?.t || ((text, ...values) => text.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? `{${index}}`));
    const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };
    const icon = name => { const i = el('i', `fa-solid ${name}`); i.setAttribute('aria-hidden', 'true'); return i; };
    const button = (className, text) => { const b = el('button', className, text); b.type = 'button'; return b; };
    const LIMITS = Object.freeze({ title: 80, focus: 500, emoji: 16 });
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const url = (profileId, windowId) => `/api/pi/bots/${encodeURIComponent(profileId)}/windows${windowId ? `/${encodeURIComponent(windowId)}` : ''}`;
    const json = body => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    // A plain revision conflict (no code): reread and let the user decide again.
    const stale = error => error?.status === 409 && !error.code;
    // The server takes single-line values only: line breaks, tabs and other control characters
    // (typed or pasted into the focus box) become one space, so a multi-line focus still saves.
    const clean = value => String(value ?? '').replace(/ *[\x00-\x1f\x7f][\x00-\x1f\x7f ]*/g, ' ').trim();
    // Topic instructions keep their lines and tabs; other control characters become a space. The
    // server limit is in UTF-8 bytes (about 2700 Chinese characters).
    const INSTRUCTION_BYTES = 8192;
    const cleanLines = value => String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ').trim();

    // What the server refused, in plain words; archiving a busy topic or one that scheduled
    // tasks still post to is refused, never forced.
    function refusal(error) {
        const code = String(error?.code || '');
        if (/ROTATING/.test(code)) return translateUi("这个话题正在接续到新的会话文件，稍等一下再试。");
        if (/SCHEDULE/.test(code)) return translateUi("还有定时任务发到这个话题。先在“定时”页调整或取消它，再继续。");
        if (/MEDIA/.test(code)) return translateUi("这个话题还有进行中或结果待核实的媒体任务，请先在媒体卡片中处理。");
        if (/LEARNING/.test(code)) return translateUi("伙伴正在整理学到的内容，等它结束后再试。");
        if (/DEFERRED/.test(code)) return translateUi("这个话题还有等着稍后发送的消息。等它们发出或取消后再继续。");
        if (/BUSY|QUEUE|RUNNING|ACTIVE|PENDING|RECOVERY/.test(code)) return translateUi("这个话题还在忙或有排队的消息，等它停下再继续。");
        return error?.message || translateUi("保存失败");
    }

    // What the server refused when creating or editing a topic, in plain words.
    function problem(error) {
        if (error?.code === 'BOT_TOPIC_LIMIT') return translateUi("话题已经到上限了（已归档的也算在内），可以先接着用已有的话题。");
        if (error?.status === 400) return translateUi("内容没有通过检查：话题名不能为空，最多 {0} 字；“专注什么”最多 {1} 字；话题指令最多 {2} KB；表情最多 {3} 个字符。",
            LIMITS.title, LIMITS.focus, INSTRUCTION_BYTES / 1024, LIMITS.emoji);
        if (error?.status === 404) return translateUi("找不到这个话题了，可能已经在别处移走。");
        return refusal(error);
    }

    // The sheet itself lives in pi-bot-topic-editor.js; this keeps the public entry point and
    // the plain-language refusal texts shared with receipts and the archive list.
    // edit({ api, profileId, name, bot, window, current, latest, onSaved })
    function edit(options) {
        return window.PiBotTopicEditor.edit({ ...options, limits: LIMITS, problem, refusal });
    }

    // Bring an archived topic back; one request, no automatic retry after a conflict.
    function restore({ api, profileId, windowId, revision }) {
        return api(url(profileId, windowId), { method: 'PATCH', ...json({ expectedRevision: revision, archived: false }) });
    }

    // Open questions and promises of the Bot's topics (GET /bots/:id/topics/open-items:
    // { v:1, topics:[{ windowId, title, state, items:[{ title, kind, due? }], omitted? }], omittedTopics }),
    // by topic: { count, busy, titles }. Only 'ready' topics have known items; 'busy' is shown as
    // such; unavailable, over-budget and unknown topics are left without a badge (unknown, not none).
    function index(data, windows) {
        const topics = new Set((windows || []).filter(item => item.kind === 'topic' && !item.archivedAt && !item.trashedAt).map(item => item.id));
        const out = new Map();
        if (data?.v !== 1 || !Array.isArray(data.topics)) return out;
        for (const topic of data.topics.slice(0, 100)) {
            if (!topic || typeof topic !== 'object' || !topics.has(topic.windowId)) continue;
            if (topic.state === 'busy') { out.set(topic.windowId, { count: 0, busy: true, titles: [] }); continue; }
            if (topic.state !== 'ready' || !Array.isArray(topic.items)) continue;
            const count = topic.items.length + (Number.isSafeInteger(topic.omitted) && topic.omitted > 0 ? topic.omitted : 0);
            if (!count) continue;
            const titles = topic.items.map(item => typeof item?.title === 'string' ? item.title.trim().slice(0, 120) : '').filter(Boolean).slice(0, 3);
            out.set(topic.windowId, { count, busy: false, titles });
        }
        return out;
    }

    // ---- receipts of topics the Bot opened ----------------------------------------------
    // host: { api, notify, context(), generation() } as for task cards; a card stays usable
    // across reconnects of the same conversation and does nothing for a stale one. Only results
    // of the topic tool (server/bot/bot-topic-tool.ts) are receipts.
    const validWindow = item => item && typeof item === 'object' && UUID.test(item.id || '') && item.kind === 'topic'
        && typeof item.title === 'string' && item.title.trim() && item.title.length <= LIMITS.title
        && (item.focus == null || typeof item.focus === 'string' && item.focus.length <= LIMITS.focus)
        && (item.emoji == null || typeof item.emoji === 'string' && item.emoji.length <= LIMITS.emoji);

    function receipts(host) {
        const cards = new Map();
        function card(receipt, key) {
            const topic = receipt.window;
            const root = el('section', 'pi-bot-topic-receipt'); root.dataset.windowId = topic.id;
            root.setAttribute('aria-label', translateUi("新话题"));
            const head = el('header');
            const mark = el('span', 'pi-bot-topic-mark'); mark.setAttribute('aria-hidden', 'true');
            if (topic.emoji?.trim()) mark.textContent = topic.emoji.trim(); else mark.append(icon('fa-hashtag'));
            const copy = el('div');
            copy.append(el('small', null, translateUi("新话题")), el('strong', null, topic.title.trim()));
            head.append(mark, copy);
            root.append(head);
            if (topic.focus?.trim()) root.append(el('p', null, topic.focus.trim()));
            const foot = el('footer');
            const state = el('small', 'pi-bot-topic-receipt-state'); state.setAttribute('role', 'status');
            const open = button('pi-bot-chip pi-bot-topic-open');
            open.append(el('span', null, translateUi("打开话题")), icon('fa-arrow-right'));
            open.addEventListener('click', async () => {
                if (host.context() !== key || open.disabled) return;
                open.disabled = true; state.textContent = '';
                const generation = host.generation?.();
                const currentOperation = () => root.isConnected && host.context() === key && host.generation?.() === generation;
                try {
                    // The topic as it is now: it may have been renamed, archived or removed since.
                    const data = await host.api('/api/pi/bots');
                    if (!currentOperation()) return;
                    const bot = Array.isArray(data?.bots) ? data.bots.find(item => item.id === receipt.profileId) : null;
                    const now = bot?.windows?.find(item => item.id === topic.id);
                    if (!bot || bot.enabled === false) state.textContent = translateUi("找不到这个伙伴了。");
                    else if (!now) state.textContent = translateUi("这个话题已经不在了。");
                    else if (now.archivedAt) state.textContent = translateUi("这个话题已归档，可以在话题列表的“已归档”里恢复。");
                    else if (now.generation === null) state.textContent = translateUi("这个话题暂时打不开，请稍后再试。");
                    else window.PiWorkspaceRoute?.navigate('bot', { profileId: receipt.profileId, windowId: topic.id });
                } catch (error) { if (currentOperation()) host.notify(error.message, 'error'); }
                finally { open.disabled = false; }
            });
            foot.append(state, open);
            root.append(foot);
            return root;
        }
        return {
            render(message) {
                const receipt = message?.details?.pivaneBotTopic, id = message?.toolCallId;
                if (message?.isError || message?.toolName !== 'bot_topic_propose' || receipt?.v !== 1 || receipt.action !== 'created' || !UUID.test(receipt.profileId || '')
                    || !validWindow(receipt.window) || !id || cards.get(id)?.isConnected) return null;
                const node = card(receipt, host.context());
                node.dataset.readingKey = `topic:${id}`;
                cards.set(id, node);
                return node;
            },
            reset() { cards.clear(); },
            prune() { for (const [key, node] of cards) if (!node.isConnected) cards.delete(key); }
        };
    }

    window.PiBotTopics = Object.freeze({ LIMITS, edit, restore, index, receipts, refusal });
})();
