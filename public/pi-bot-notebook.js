(() => {
    // "我记着的事": the notebook of the open Bot chat (decisions, promises, open questions,
    // preferences, key facts). The Bot keeps it while chatting; here the user can correct a
    // note, mark it done or no longer needed, bring it back, or delete it. Every change names
    // the version it was made on; the Bot is told about the change before its next reply.
    const translateUi = globalThis.PiI18n?.t || ((text, ...values) => text.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? `{${index}}`));
    const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };
    const icon = name => { const i = el('i', `fa-solid ${name}`); i.setAttribute('aria-hidden', 'true'); return i; };
    const button = (className, text) => { const b = el('button', className, text); b.type = 'button'; return b; };
    const iconButton = (glyph, label, action) => {
        const b = button('pi-bot-note-action'); b.title = label; b.setAttribute('aria-label', label); b.dataset.noteAction = action; b.append(icon(glyph));
        return b;
    };
    // Most actionable first.
    const KINDS = [
        ['commitment', () => translateUi("答应的事")], ['open', () => translateUi("等回答的问题")], ['decision', () => translateUi("已经定下的")],
        ['preference', () => translateUi("偏好和要求")], ['ref', () => translateUi("要记牢的信息")]
    ];
    const CLOSED = { done: () => translateUi("已完成"), cancelled: () => translateUi("不需要了"), superseded: () => translateUi("已被新的取代") };
    const locale = () => globalThis.PiI18n?.locale || 'zh-CN';
    const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
    const when = value => new Date(DATE_ONLY.test(value || '') ? `${value}T00:00:00` : value);
    const day = value => {
        const date = when(value);
        return Number.isFinite(date.getTime()) ? date.toLocaleDateString(locale(), { month: 'short', day: 'numeric' }) : '';
    };
    // A due date as said: a plain date, or a time of day (shown in this device's time zone); the
    // year only when it is not this year (UAT-12).
    const dueLabel = value => {
        const date = when(value);
        if (!Number.isFinite(date.getTime())) return '';
        const options = { month: 'short', day: 'numeric', ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) };
        if (DATE_ONLY.test(value)) return date.toLocaleDateString(locale(), options);
        return date.toLocaleString(locale(), { ...options, hour: '2-digit', minute: '2-digit', hour12: false });
    };
    const pad = number => String(number).padStart(2, '0');
    // The date and time fields of the editor for a stored due value (local time).
    const dueParts = value => {
        if (!value) return { date: '', time: '' };
        if (DATE_ONLY.test(value)) return { date: value, time: '' };
        const date = when(value);
        if (!Number.isFinite(date.getTime())) return { date: String(value).slice(0, 10), time: '' };
        return { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, time: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
    };
    // Editor fields back to a stored value: a plain date, or the local time with its UTC offset.
    // undefined for a time this device's clock skips (the hour lost when daylight saving starts),
    // which would otherwise be saved as a different moment.
    const dueValue = (date, time) => {
        if (!date) return null;
        if (!time) return date;
        const local = new Date(`${date}T${time}:00`);
        if (!Number.isFinite(local.getTime())) return undefined;
        if (`${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}` !== `${date}T${time}`) return undefined;
        const offset = -local.getTimezoneOffset(), sign = offset >= 0 ? '+' : '-';
        return `${date}T${time}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
    };
    // An edit in progress: what the user typed, and the note as it was when they started
    // (base). After a refresh, fields the user has not touched follow the note's new values,
    // so a retry sends only what the user changed (never an older value of another field).
    const editDraft = item => { const base = { text: item.text, ...dueParts(item.due) }; return { id: item.id, ...base, base }; };
    const rebase = (draft, item) => {
        const fresh = { text: item.text, ...dueParts(item.due) };
        if (draft.text === draft.base.text) draft.text = fresh.text;
        if (draft.date === draft.base.date && draft.time === draft.base.time) { draft.date = fresh.date; draft.time = fresh.time; }
        draft.base = fresh;
    };

    let dialog = null;

    // open({ api, toast, profileId, windowId, name, face })
    function open(options) {
        dialog?.close();
        const { api, profileId, windowId } = options;
        const name = options.name || 'Bot';
        const url = `/api/pi/bots/${encodeURIComponent(profileId)}/windows/${encodeURIComponent(windowId)}/notebook`;
        const sheet = el('dialog', 'pi-bot-sheet pi-bot-notes');
        dialog = sheet;
        sheet.setAttribute('aria-labelledby', 'pi-bot-notes-title');
        const frame = el('div', 'pi-bot-sheet-form');
        const head = el('header', 'pi-bot-sheet-head');
        const title = el('h2', null, translateUi("我记着的事")); title.id = 'pi-bot-notes-title';
        const close = button('pi-bot-sheet-close'); close.setAttribute('aria-label', translateUi("关闭")); close.title = translateUi("关闭"); close.append(icon('fa-xmark'));
        head.append(options.face?.('sm') || el('span'), title, close);
        const body = el('div', 'pi-bot-sheet-body');
        const foot = el('footer', 'pi-bot-sheet-foot');
        const status = el('p', 'pi-bot-sheet-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        foot.append(status);
        frame.append(head, body, foot);
        sheet.append(frame);
        document.body.append(sheet);
        close.addEventListener('click', () => sheet.close());
        sheet.addEventListener('close', () => { sheet.remove(); if (dialog === sheet) dialog = null; });
        sheet.showModal();

        let book = null, saving = false, editing = null, confirming = null, expanded = null, showClosed = false;
        // What the user typed in the open editor; it stays until the change is saved (UAT-10).
        let draft = null;
        const say = (text, tone) => { status.textContent = text || ''; if (tone) status.dataset.tone = tone; else delete status.dataset.tone; };
        const hint = () => say(translateUi("{0} 在聊天里会自己记，也会照这里的修改来做。", name));

        async function load(note) {
            try {
                book = await api(url);
                if (dialog !== sheet) return;
                render();
                if (note) say(note, 'warn'); else hint();
            } catch (error) {
                if (dialog !== sheet) return;
                body.replaceChildren(el('p', 'pi-bot-sheet-state', error.message));
                say('');
            }
        }

        async function change(ops) {
            if (saving || !book) return;
            saving = true; expanded = null; render(); say(translateUi("正在保存…"));
            try {
                book = await api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ expectedGeneration: book.generation, expectedVersion: book.version, ops }) });
                editing = null; draft = null; confirming = null; expanded = null; saving = false;
                if (dialog !== sheet) return;
                render(); hint();
            } catch (error) {
                saving = false;
                if (dialog !== sheet) return;
                const kept = Boolean(editing && draft);
                if (error.code === 'SESSION_BUSY') {
                    render(); say(kept ? translateUi("{0} 正在回复，你的修改还在，等它说完再保存。", name) : translateUi("{0} 正在回复，等它说完再改。", name), 'warn');
                    return;
                }
                if (['NOTEBOOK_CHANGED', 'BOT_WINDOW_STALE', 'BOT_WINDOW_ROTATING'].includes(error.code)) {
                    confirming = null; expanded = null;
                    await load(kept ? translateUi("刚刚有新的变化，已刷新；你的修改还在，请再保存一次。") : translateUi("刚刚有新的变化，已刷新，请再试一次。"));
                    // The note may be gone (deleted meanwhile); then there is nothing to edit.
                    if (editing && !book?.items.some(item => item.id === editing && item.status !== 'deleted')) { editing = null; draft = null; render(); }
                    return;
                }
                render(); say(kept ? translateUi("没保存成功，你的修改还在：{0}", error.message) : error.message, 'error');
            }
        }

        function source(item) {
            if (!item.source) return null;
            const role = item.source.role, said = item.source.text;
            const words = role === 'user' ? translateUi("你说：“{0}”", said) : role === 'assistant' ? translateUi("{0} 说：“{1}”", name, said)
                : role === 'toolResult' ? translateUi("查到的：“{0}”", said) : `“${said}”`;
            const quote = el('details', 'pi-bot-note-source');
            const summary = el('summary', null, translateUi("出处"));
            quote.append(summary, el('p', null, words));
            return quote;
        }

        function noteRow(item) {
            const row = el('li', `pi-bot-note is-${item.status}`); row.dataset.noteId = item.id;
            if (editing === item.id) {
                if (draft?.id !== item.id) draft = editDraft(item); else rebase(draft, item);
                const form = el('div', 'pi-bot-note-edit');
                const text = el('textarea'); text.value = draft.text; text.maxLength = 500; text.rows = 3; text.dataset.noteField = 'text';
                text.setAttribute('aria-label', translateUi("内容"));
                text.addEventListener('input', () => { draft.text = text.value; if (status.dataset.tone === 'error') hint(); });
                form.append(text);
                if (item.kind === 'commitment' || item.due) {
                    const due = el('input'); due.type = 'date'; due.dataset.noteField = 'due'; due.value = draft.date;
                    const time = el('input'); time.type = 'time'; time.dataset.noteField = 'time'; time.value = draft.time; time.disabled = !draft.date;
                    time.setAttribute('aria-label', translateUi("截止时间（可不填）"));
                    due.addEventListener('input', () => { draft.date = due.value; time.disabled = !due.value; if (!due.value) { time.value = ''; draft.time = ''; } });
                    time.addEventListener('input', () => { draft.time = time.value; });
                    const label = el('label', 'pi-bot-note-due'); label.append(el('span', null, translateUi("截止")), due);
                    const row = el('div', 'pi-bot-note-due-row'); row.append(label, time);
                    form.append(row);
                }
                const actions = el('div', 'pi-bot-note-confirm');
                const cancel = button('pi-bot-chip', translateUi("取消")); cancel.dataset.noteAction = 'edit-cancel';
                const save = button('pi-bot-primary', translateUi("保存")); save.dataset.noteAction = 'edit-save';
                cancel.disabled = save.disabled = saving;
                actions.append(cancel, save);
                form.append(actions);
                row.append(form);
                queueMicrotask(() => { if (text.isConnected && document.activeElement !== text) { text.focus(); text.setSelectionRange(text.value.length, text.value.length); } });
                return row;
            }
            // Promises and open questions are ticked off on the left, like a to-do list.
            if (item.status === 'active' && ['commitment', 'open'].includes(item.kind)) {
                const label = item.kind === 'open' ? translateUi("已有答案") : translateUi("完成");
                const check = button('pi-bot-note-check'); check.dataset.noteAction = 'done';
                check.title = label; check.setAttribute('aria-label', `${label}：${item.text}`); check.disabled = saving;
                check.append(icon('fa-check'));
                row.append(check);
            }
            const main = el('div', 'pi-bot-note-main');
            main.append(el('p', 'pi-bot-note-text', item.text));
            const meta = [];
            if (item.status !== 'active') meta.push(`${CLOSED[item.status]?.() || item.status} · ${day(item.updatedAt)}`);
            else {
                if (item.due) meta.push(translateUi("截止 {0}", dueLabel(item.due)));
                meta.push(translateUi("{0} 记下", day(item.createdAt)));
                if (day(item.updatedAt) !== day(item.createdAt)) meta.push(translateUi("{0} 改过", day(item.updatedAt)));
            }
            main.append(el('p', 'pi-bot-note-meta', meta.filter(Boolean).join(' · ')));
            const quote = source(item); if (quote) main.append(quote);
            row.append(main);
            const choices = item.status === 'active'
                ? [['fa-pen', translateUi("修改"), 'edit'], ['fa-ban', translateUi("不需要了"), 'cancel'], ['fa-trash-can', translateUi("删除"), 'delete']]
                : [['fa-rotate-left', translateUi("重新打开"), 'reopen'], ['fa-trash-can', translateUi("删除"), 'delete']];
            // Pointer screens: icons that show with the row. Touch and narrow screens: one "more"
            // button that opens labelled choices under the note (CSS picks which one shows).
            const tools = el('div', 'pi-bot-note-tools');
            tools.append(...choices.map(([glyph, label, action]) => iconButton(glyph, label, action)));
            const more = iconButton('fa-ellipsis', translateUi("更多操作"), 'more');
            more.setAttribute('aria-expanded', String(expanded === item.id));
            for (const control of [...tools.children, more]) control.disabled = saving;
            row.append(tools, more);
            if (confirming === item.id) {
                const panel = el('div', 'pi-bot-note-panel is-confirming');
                panel.append(el('p', 'pi-bot-note-ask', translateUi("删掉这条？{0} 就不会再记得它。", name)));
                const keep = button('pi-bot-chip', translateUi("取消")); keep.dataset.noteAction = 'delete-cancel';
                const remove = button('pi-bot-danger', translateUi("删除")); remove.dataset.noteAction = 'delete-confirm';
                keep.disabled = remove.disabled = saving;
                panel.append(keep, remove);
                row.append(panel);
            } else if (expanded === item.id) {
                const panel = el('div', 'pi-bot-note-panel');
                for (const [glyph, label, action] of choices) {
                    const choice = button(`pi-bot-chip${action === 'delete' ? ' is-danger' : ''}`); choice.dataset.noteAction = action; choice.disabled = saving;
                    choice.append(icon(glyph), el('span', null, label));
                    panel.append(choice);
                }
                row.append(panel);
            }
            return row;
        }

        function render() {
            if (!book) { body.replaceChildren(el('p', 'pi-bot-sheet-state', translateUi("正在读取…"))); return; }
            const active = book.items.filter(item => item.status === 'active');
            const closed = book.items.filter(item => item.status !== 'active').sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
            const nodes = [];
            if (!active.length) {
                const empty = el('div', 'pi-bot-notes-empty');
                empty.append(icon('fa-thumbtack'), el('p', null, translateUi("还没有记下的事。")),
                    el('p', null, translateUi("聊天里定下的事、答应你的事和还在等答案的问题，{0} 会记在这里。", name)));
                nodes.push(empty);
            }
            for (const [kind, label] of KINDS) {
                const items = active.filter(item => item.kind === kind);
                if (!items.length) continue;
                const section = el('section', 'pi-bot-sheet-section pi-bot-notes-group');
                const list = el('ul', 'pi-bot-notes-list');
                list.append(...items.map(noteRow));
                section.append(el('h3', null, label()), list);
                nodes.push(section);
            }
            if (closed.length) {
                const section = el('details', 'pi-bot-sheet-section pi-bot-notes-closed');
                section.open = showClosed;
                section.addEventListener('toggle', () => { showClosed = section.open; });
                const list = el('ul', 'pi-bot-notes-list');
                list.append(...closed.map(noteRow));
                section.append(el('summary', null, translateUi("已完成或不需要了（{0}）", closed.length)), list);
                nodes.push(section);
            }
            const scroll = body.scrollTop;
            body.replaceChildren(...nodes);
            body.scrollTop = scroll;
        }

        body.addEventListener('click', event => {
            const control = event.target.closest?.('[data-note-action]');
            if (!control || control.disabled || saving) return;
            const row = control.closest('[data-note-id]'), id = row?.dataset.noteId;
            const item = book?.items.find(entry => entry.id === id);
            if (!item) return;
            const action = control.dataset.noteAction;
            // Focus returns to the same note's control after a re-render (whichever of the pair shows).
            const focus = (...actions) => {
                const node = body.querySelector(`[data-note-id="${CSS.escape(id)}"]`);
                for (const name of actions) {
                    const target = [...(node?.querySelectorAll(`[data-note-action="${name}"]`) || [])].find(item => item.getClientRects().length);
                    if (target) { target.focus(); return; }
                }
            };
            if (action === 'done') void change([{ op: 'status', id, status: 'done' }]);
            else if (action === 'cancel') void change([{ op: 'status', id, status: 'cancelled' }]);
            else if (action === 'reopen') void change([{ op: 'status', id, status: 'active' }]);
            else if (action === 'more') { expanded = expanded === id ? null : id; confirming = null; render(); focus(expanded ? 'edit' : 'more', 'reopen', 'more'); }
            else if (action === 'edit') { editing = id; draft = null; confirming = null; expanded = null; render(); }
            else if (action === 'edit-cancel') { editing = null; draft = null; render(); focus('edit', 'more'); }
            else if (action === 'delete') { confirming = id; editing = null; expanded = null; render(); focus('delete-cancel'); }
            else if (action === 'delete-cancel') { confirming = null; render(); focus('delete', 'more'); }
            else if (action === 'delete-confirm') void change([{ op: 'delete', id }]);
            else if (action === 'edit-save') {
                if (draft?.id !== id) return;
                rebase(draft, item);
                const text = draft.text.replace(/\s+/g, ' ').trim();
                if (!text) { say(translateUi("内容不能为空"), 'error'); return; }
                const op = { op: 'update', id };
                if (text !== item.text) op.text = text;
                // Only a changed date or time is sent; an unchanged exact time stays exactly as stored.
                if (row.querySelector('[data-note-field="due"]') && (draft.date !== draft.base.date || draft.time !== draft.base.time)) {
                    op.due = dueValue(draft.date, draft.time);
                    if (op.due === undefined) { say(translateUi("这个时间在这台设备的时区里不存在（夏令时调整），请换一个时间"), 'error'); return; }
                }
                if (Object.keys(op).length === 2) { editing = null; draft = null; render(); return; }
                void change([op]);
            }
        });
        render();
        void load();
    }

    window.PiBotNotebook = Object.freeze({ open });
})();
