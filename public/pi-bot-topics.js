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
    const tidy = (key, value) => key === 'instructions' ? cleanLines(value) : clean(value);
    const bytes = value => new TextEncoder().encode(value).length;
    const fitTextarea = area => window.PiBot?.fitTextarea?.(area);

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

    let dialog = null;

    function field(label, control, hint) {
        const wrap = el('label', 'pi-bot-sheet-field');
        wrap.append(el('span', 'pi-bot-sheet-label', label), control);
        if (hint) wrap.append(el('span', 'pi-bot-sheet-hint', hint));
        return wrap;
    }

    // edit({ api, profileId, name, bot, window, current, latest, onSaved })
    //   bot: the Bot as listed (windowsRevision, windows); window: the topic to edit, or null to create;
    //   current(): whether the page still shows this Bot; latest(): rereads the Bot (after a conflict);
    //   onSaved(result, action): after the server saved ('created', 'edited' or 'archived').
    function edit(options) {
        dialog?.close();
        const creating = !options.window;
        const sheet = el('dialog', 'pi-bot-sheet pi-bot-topic-sheet');
        dialog = sheet;
        sheet.setAttribute('aria-labelledby', 'pi-bot-topic-title');
        const form = el('form', 'pi-bot-sheet-form'); form.method = 'dialog'; form.noValidate = true;
        const head = el('header', 'pi-bot-sheet-head');
        const title = el('h2', null, creating ? translateUi("新话题") : translateUi("编辑话题")); title.id = 'pi-bot-topic-title';
        const close = button('pi-bot-sheet-close'); close.setAttribute('aria-label', translateUi("关闭")); close.title = translateUi("关闭"); close.append(icon('fa-xmark'));
        const mark = el('span', 'pi-bot-topic-sheet-mark'); mark.setAttribute('aria-hidden', 'true');
        head.append(mark, title, close);

        const emoji = el('input');
        const own = topic => ({ title: topic?.title || '', focus: topic?.focus || '', instructions: topic?.instructions || '', emoji: topic?.emoji || '', groupId: topic?.groupId || '' });
        let revision = options.bot.windowsRevision, base = own(creating ? null : options.window);
        let busy = false, warned = null, archiveArmed = false, trashArmed = false, gone = false;

        const name = el('input'); name.type = 'text'; name.maxLength = LIMITS.title; name.required = true; name.autocomplete = 'off'; name.dataset.topicField = 'title';
        name.placeholder = translateUi("比如：功能开发");
        const focus = el('textarea'); focus.rows = 3; focus.maxLength = LIMITS.focus; focus.dataset.topicField = 'focus';
        focus.placeholder = translateUi("围绕这项功能讨论需求、实现思路和待解决的问题。");
        // Grows with its text (fitTextarea) up to its CSS max-height, then scrolls; the byte limit is checked on input.
        const instructions = el('textarea', 'pi-bot-sheet-long is-instructions'); instructions.rows = 3; instructions.maxLength = INSTRUCTION_BYTES;
        instructions.dataset.topicField = 'instructions';
        instructions.placeholder = translateUi("比如：先给结论再展开；改代码前先说明思路和影响。");
        const group = el('select'); group.dataset.topicField = 'groupId';
        const fillGroups = (bot, selected) => {
            group.replaceChildren(new Option(translateUi("未分组"), ''), ...(bot.groups || []).map(item => new Option(item.name, item.id)));
            group.value = selected || '';
        };
        fillGroups(options.bot, base.groupId);
        const fill = values => {
            name.value = values.title; focus.value = values.focus; instructions.value = values.instructions; emoji.value = values.emoji; group.value = values.groupId;
            fitTextarea(instructions);
        };
        let identity = field(translateUi("话题名"), name);
        if (emoji) {
            emoji.type = 'text'; emoji.maxLength = LIMITS.emoji; emoji.autocomplete = 'off'; emoji.className = 'pi-bot-sheet-emoji';
            emoji.placeholder = '📚'; emoji.dataset.topicField = 'emoji';
            const title = identity;
            identity = el('div', 'pi-bot-topic-identity');
            identity.append(field(translateUi("表情（可不填）"), emoji), title);
        }
        const picker = el('details', 'pi-bot-topic-emoji-picker');
        picker.append(el('summary', null, translateUi("选择图标")));
        const choices = el('div', 'pi-bot-topic-emoji-choices');
        for (const value of ['📖', '📚', '❓', '🌍', '💬', '💻', '🧰', '🧭', '📝', '🎯', '🎨', '🏡', '🎵', '💡', '🏃', '🍳', '📊', '🧪', '🧩', '✈️']) {
            const choose = button('pi-bot-topic-emoji-option', value); choose.setAttribute('aria-label', translateUi("使用图标 {0}", value));
            choose.addEventListener('click', () => { emoji.value = value; emoji.dispatchEvent(new Event('input', { bubbles: true })); }); choices.append(choose);
        }
        const clear = button('pi-bot-chip', translateUi("不使用图标"));
        clear.addEventListener('click', () => { emoji.value = ''; emoji.dispatchEvent(new Event('input', { bubbles: true })); });
        picker.append(choices, clear, el('p', 'pi-bot-sheet-hint', translateUi("也可以在图标输入框里粘贴表情。")));
        fill(base);
        const body = el('div', 'pi-bot-sheet-body');
        body.append(el('p', 'pi-bot-sheet-note pi-bot-topic-intro',
            translateUi("话题是单独的聊天：{0} 在里面只专心聊这件事，“我记着的事”也分开记。主聊天不受影响。", options.name || translateUi('伙伴'))),
        identity, picker, field(translateUi("分组"), group, translateUi("仅用来整理话题，不影响聊天方式。在话题列表的“整理话题”里管理分组。")), field(translateUi("专注什么"), focus, translateUi("最多 {0} 字，可以以后再改。", LIMITS.focus)),
        field(translateUi("话题指令（可不填）"), instructions,
            translateUi("在这个话题里它要一直遵守的做法，比如回答格式、资料来源。最多 {0} KB（约 {1} 个汉字），可以以后再改。", INSTRUCTION_BYTES / 1024, 2700)));

        let archive = null;
        if (!creating && !options.window.archivedAt) {
            archive = button('pi-bot-sheet-link pi-bot-topic-archive'); archive.dataset.topicAction = 'archive';
            archive.append(icon('fa-box-archive'), el('span', null, translateUi("归档这个话题")), icon('fa-chevron-right'));
            const section = el('section', 'pi-bot-sheet-section');
            section.append(el('h3', null, translateUi("归档")), el('p', 'pi-bot-sheet-note',
                translateUi("归档后它从列表里收起，聊天记录都保留，随时可以在“已归档”里恢复。正在忙、有排队消息或有定时任务发到这里时不能归档。")), archive);
            body.append(section);
        }

        let trash = null;
        if (!creating) {
            trash = button('pi-bot-sheet-link pi-bot-topic-trash'); trash.dataset.topicAction = 'trash';
            trash.append(icon('fa-trash-can'), el('span', null, translateUi("移到回收站")));
            const section = el('section', 'pi-bot-sheet-section');
            section.append(el('h3', null, translateUi("删除话题")), el('p', 'pi-bot-sheet-note',
                translateUi("整个话题（包括更早的聊天和记事本）会移到回收站，可以恢复。伙伴记忆、技能和单独保存的成果保留。")), trash);
            body.append(section);
        }
        const foot = el('footer', 'pi-bot-sheet-foot');
        const status = el('p', 'pi-bot-sheet-status'); status.setAttribute('role', 'status');
        const cancel = button('pi-bot-chip', translateUi("取消"));
        const save = el('button', 'pi-bot-primary pi-bot-sheet-save', creating ? translateUi("开始这个话题") : translateUi("保存")); save.type = 'submit';
        foot.append(status, cancel, save);
        form.append(head, body, foot);
        sheet.append(form);
        document.body.append(sheet);

        const values = () => ({ title: name.value, focus: focus.value, instructions: instructions.value, emoji: emoji.value, groupId: group.value });
        const edited = () => Object.entries(values()).some(([key, value]) => value !== base[key]);
        const say = (text, tone) => { status.textContent = text; if (tone) status.dataset.tone = tone; else delete status.dataset.tone; };
        const tooLong = () => bytes(cleanLines(instructions.value)) > INSTRUCTION_BYTES;
        // Fields the user changed, trimmed (single lines, except the instructions); null when something is not valid yet.
        function changes() {
            const next = Object.fromEntries(Object.entries(values()).map(([key, value]) => [key, tidy(key, value)]));
            if (!next.title || next.title.length > LIMITS.title || next.focus.length > LIMITS.focus || (next.emoji ?? '').length > LIMITS.emoji
                || tooLong()) return null;
            if (creating) return { ...next, groupId: next.groupId || null };
            return Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== tidy(key, base[key])).map(([key, value]) => [key, key === 'groupId' ? value || null : value]));
        }
        function refresh() {
            mark.textContent = emoji?.value.trim() || '';
            mark.hidden = !mark.textContent;
            const pending = changes();
            save.disabled = busy || gone || !pending || !Object.keys(pending).length;
            for (const control of form.querySelectorAll('input,textarea,select,.pi-bot-topic-emoji-picker button')) control.disabled = busy || gone;
            for (const choice of choices.children) choice.setAttribute('aria-pressed', String(choice.textContent === emoji.value.trim()));
            if (archive) archive.disabled = busy || gone;
            if (trash) trash.disabled = busy || gone;
        }
        const alive = () => sheet.open && dialog === sheet && options.current();
        const leave = action => {
            if (busy) return false;
            if (edited() && warned !== action) { warned = action; say(translateUi("还有修改没保存。再关一次就放弃这些修改。"), 'warn'); return false; }
            sheet.close();
            return true;
        };
        close.addEventListener('click', () => leave('close'));
        cancel.addEventListener('click', () => leave('close'));
        sheet.addEventListener('cancel', event => { event.preventDefault(); leave('close'); });
        sheet.addEventListener('close', () => { sheet.remove(); if (dialog === sheet) dialog = null; });
        form.addEventListener('input', event => {
            warned = null; archiveArmed = false; trashArmed = false;
            if (trash) trash.querySelector('span').textContent = translateUi("移到回收站");
            if (archive) archive.querySelector('span').textContent = translateUi("归档这个话题");
            // Over the byte limit the field says so here; saving stays off until it fits.
            const over = tooLong();
            instructions.setAttribute('aria-invalid', String(over));
            if (over) say(translateUi("话题指令太长了，最多 {0} KB（约 {1} 个汉字）。", INSTRUCTION_BYTES / 1024, 2700), 'error');
            else say('');
            if (event.target === instructions) fitTextarea(instructions);
            refresh();
        });

        // After a conflict: the latest revision, and for an edit the latest values of the
        // fields the user did not touch. The user's own edits stay.
        async function reread() {
            const fresh = await options.latest();
            if (!alive()) return false;
            revision = fresh?.windowsRevision ?? revision;
            if (creating) { fillGroups(fresh, group.value); return true; }
            const now = fresh?.windows?.find(item => item.id === options.window.id);
            if (!now || now.trashedAt || !options.window.archivedAt && now.archivedAt) { gone = true; say(translateUi("这个话题已经被归档或移走了。"), 'error'); refresh(); return false; }
            fillGroups(fresh, group.value);
            // A field counts as the user's own edit only when its saved form differs from before.
            const mine = values(), next = own(now);
            fill(Object.fromEntries(Object.keys(next).map(key => [key, tidy(key, mine[key]) !== tidy(key, base[key]) ? mine[key] : next[key]])));
            base = next;
            return true;
        }

        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (busy || gone) return;
            const pending = changes();
            if (!pending) { say(name.value.trim() ? translateUi("内容太长了") : translateUi("请给话题起个名字"), 'error'); name.focus(); return; }
            if (!creating && !Object.keys(pending).length) return;
            busy = true; say(translateUi("正在保存…")); refresh();
            try {
                const result = creating
                    ? await options.api(url(options.profileId), { method: 'POST', ...json({ expectedRevision: revision, ...pending }) })
                    : await options.api(url(options.profileId, options.window.id), { method: 'PATCH', ...json({ expectedRevision: revision, ...pending }) });
                if (dialog === sheet) sheet.close();
                if (options.current()) await options.onSaved?.(result, creating ? 'created' : 'edited');
            } catch (error) {
                if (!alive()) return;
                if (stale(error)) {
                    let fresh = false;
                    try { fresh = await reread(); } catch {}
                    if (alive() && fresh) say(translateUi("话题刚刚在别处改过。你的修改还在，检查后再保存一次。"), 'warn');
                } else say(problem(error), 'error');
            } finally { busy = false; if (sheet.open) refresh(); }
        });

        archive?.addEventListener('click', async () => {
            if (busy || gone) return;
            // The first click only says what happens (and about unsaved edits); the second archives.
            if (!archiveArmed) {
                archiveArmed = true; archive.querySelector('span').textContent = translateUi("再点一次确认归档");
                if (edited()) say(translateUi("还有修改没保存。再点一次就放弃这些修改并归档。"), 'warn');
                return;
            }
            busy = true; say(translateUi("正在归档…")); refresh();
            try {
                const result = await options.api(url(options.profileId, options.window.id), { method: 'PATCH', ...json({ expectedRevision: revision, archived: true }) });
                if (dialog === sheet) sheet.close();
                if (options.current()) await options.onSaved?.(result, 'archived');
            } catch (error) {
                if (!alive()) return;
                archiveArmed = false; archive.querySelector('span').textContent = translateUi("归档这个话题");
                if (stale(error)) {
                    let fresh = false;
                    try { fresh = await reread(); } catch {}
                    if (alive() && fresh) say(translateUi("话题刚刚在别处改过，还没有归档。检查后可以再归档一次。"), 'warn');
                } else say(refusal(error), 'error');
            } finally { busy = false; if (sheet.open) refresh(); }
        });

        trash?.addEventListener('click', async () => {
            if (busy || gone) return;
            if (!trashArmed) {
                archiveArmed = false; if (archive) archive.querySelector('span').textContent = translateUi("归档这个话题");
                trashArmed = true; trash.querySelector('span').textContent = translateUi("再点一次移到回收站");
                say(edited() ? translateUi("未保存的修改会放弃，完整聊天和记事本会保留在回收站。") : translateUi("完整聊天和记事本会保留在回收站，可以恢复。"), 'warn'); return;
            }
            busy = true; say(translateUi("正在移到回收站…")); refresh();
            try {
                const result = await options.api(url(options.profileId, options.window.id) + '/trash', { method: 'POST', ...json({ expectedRevision: revision }) });
                if (dialog === sheet) sheet.close();
                if (options.current()) await options.onSaved?.(result, 'trashed');
            } catch (error) {
                if (!alive()) return;
                trashArmed = false; trash.querySelector('span').textContent = translateUi("移到回收站");
                if (stale(error)) { try { await reread(); } catch {} if (alive() && !gone) say(translateUi("话题刚刚在别处改过，请检查后重新确认。"), 'warn'); }
                else say(refusal(error), 'error');
            } finally { busy = false; if (sheet.open) refresh(); }
        });
        refresh();
        sheet.showModal();
        fitTextarea(instructions);
        name.focus();
        return sheet;
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
