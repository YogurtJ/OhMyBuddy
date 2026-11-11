(() => {
    // One notebook per Buddy. Conversations are sources; editing never depends on their idle state.
    const t = globalThis.PiI18n?.t || ((text, ...values) => text.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? `{${index}}`));
    const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };
    const icon = name => { const node = el('i', `fa-solid ${name}`); node.setAttribute('aria-hidden', 'true'); return node; };
    const button = (cls, text) => { const node = el('button', cls, text); node.type = 'button'; return node; };
    const actionButton = (glyph, label, action) => {
        const node = button('pi-bot-note-action'); node.title = label; node.setAttribute('aria-label', label); node.dataset.noteAction = action; node.append(icon(glyph)); return node;
    };
    const KINDS = [['commitment', '答应的事', 'fa-circle-check'], ['open', '等回答的问题', 'fa-comment-dots'],
        ['decision', '已经定下的', 'fa-check-double'], ['preference', '偏好和要求', 'fa-sliders'], ['ref', '要记牢的信息', 'fa-bookmark']];
    const CLOSED = { done: '已完成', cancelled: '不需要了', superseded: '已被新的取代' };
    const locale = () => globalThis.PiI18n?.locale || 'zh-CN';
    const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
    const when = value => new Date(DATE_ONLY.test(value || '') ? `${value}T00:00:00` : value);
    const day = value => { const date = when(value); return Number.isFinite(date.getTime()) ? date.toLocaleDateString(locale(), { month: 'short', day: 'numeric',
        ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }) : ''; };
    const dueLabel = value => {
        const date = when(value); if (!Number.isFinite(date.getTime())) return '';
        const options = { month: 'short', day: 'numeric', ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) };
        return DATE_ONLY.test(value) ? date.toLocaleDateString(locale(), options) : date.toLocaleString(locale(), { ...options, hour: '2-digit', minute: '2-digit', hour12: false });
    };
    const overdue = value => {
        if (!value) return false;
        const deadline = when(value); if (DATE_ONLY.test(value)) deadline.setHours(23, 59, 59, 999);
        return deadline.getTime() < Date.now();
    };
    const pad = value => String(value).padStart(2, '0');
    const dueParts = value => {
        if (!value) return { date: '', time: '' };
        if (DATE_ONLY.test(value)) return { date: value, time: '' };
        const date = when(value);
        return Number.isFinite(date.getTime()) ? { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, time: `${pad(date.getHours())}:${pad(date.getMinutes())}` } : { date: '', time: '' };
    };
    const dueValue = (date, time) => {
        if (!date) return null; if (!time) return date;
        const local = new Date(`${date}T${time}:00`);
        if (!Number.isFinite(local.getTime()) || `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}` !== `${date}T${time}`) return undefined;
        const offset = -local.getTimezoneOffset(), sign = offset >= 0 ? '+' : '-';
        return `${date}T${time}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
    };
    const valuesOf = item => ({ text: item.text || '', subject: item.subject || '', kind: item.kind || 'commitment', ...dueParts(item.due) });
    const editDraft = item => { const base = valuesOf(item); return { id: item.id, ...base, base }; };
    const rebase = (draft, item) => {
        const fresh = valuesOf(item);
        for (const key of ['text', 'subject', 'kind']) if (draft[key] === draft.base[key]) draft[key] = fresh[key];
        if (draft.date === draft.base.date && draft.time === draft.base.time) { draft.date = fresh.date; draft.time = fresh.time; }
        draft.base = fresh;
    };
    const fold = value => String(value || '').normalize('NFKC').toLowerCase();
    let dialog = null;

    function open(options) {
        if (dialog && !dialog.requestNotebookClose()) return;
        const { api, profileId } = options, name = options.name || t('伙伴');
        const url = `/api/pi/bots/${encodeURIComponent(profileId)}/notebook`;
        const previousFocus = document.activeElement;
        const sheet = el('dialog', 'pi-bot-sheet pi-bot-notes'); dialog = sheet;
        sheet.setAttribute('aria-labelledby', 'pi-bot-notes-title');
        const frame = el('div', 'pi-bot-sheet-form');
        const head = el('header', 'pi-bot-notes-head');
        const emblem = el('div', 'pi-bot-notes-emblem'); emblem.append(options.face?.('sm') || icon('fa-book-open'));
        const heading = el('div', 'pi-bot-notes-heading');
        const title = el('h2', null, t('我记着的事')); title.id = 'pi-bot-notes-title';
        heading.append(el('p', 'pi-bot-notes-eyebrow', t('{0} 的记事本', name)), title,
            el('p', 'pi-bot-notes-subtitle', t('所有聊天里的重要约定，都在这里。')));
        const close = button('pi-bot-sheet-close'); close.setAttribute('aria-label', t('关闭')); close.title = t('关闭'); close.append(icon('fa-xmark'));
        head.append(emblem, heading, close);
        const controls = el('div', 'pi-bot-notes-controls');
        const tabs = el('div', 'pi-bot-notes-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', t('事项分类'));
        const tabNodes = new Map();
        for (const [id, label, glyph] of [['waiting', '待跟进', 'fa-circle-check'], ['reference', '约定与资料', 'fa-bookmark'], ['closed', '已结束', 'fa-check']]) {
            const node = button('pi-bot-notes-tab'); node.dataset.notesTab = id; node.id = `pi-bot-notes-tab-${id}`; node.setAttribute('role', 'tab'); node.setAttribute('aria-controls', 'pi-bot-notes-list');
            node.append(icon(glyph), el('span', null, t(label)), el('span', 'pi-bot-notes-count', '0'));
            node.addEventListener('click', () => { if (!discard()) return; tab = id; search.value = ''; expanded = confirming = null; visibleLimit = 60; render(); });
            tabs.append(node); tabNodes.set(id, node);
        }
        tabs.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            const nodes = [...tabNodes.values()], index = nodes.indexOf(document.activeElement); if (index < 0) return;
            event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + nodes.length) % nodes.length;
            nodes[next].click(); nodes[next].focus();
        });
        const filters = el('div', 'pi-bot-notes-filters');
        const searchBox = el('label', 'pi-bot-notes-search'); searchBox.append(icon('fa-magnifying-glass'));
        const search = el('input'); search.type = 'search'; search.placeholder = t('搜索事项、约定或关键词'); search.setAttribute('aria-label', t('搜索记事本')); searchBox.append(search);
        search.addEventListener('input', () => { visibleLimit = 60; renderList(); });
        const subjectFilter = el('select'); subjectFilter.className = 'pi-bot-notes-subject-filter'; subjectFilter.setAttribute('aria-label', t('相关事情'));
        subjectFilter.addEventListener('change', () => { visibleLimit = 60; renderList(); });
        const add = button('pi-bot-notes-add'); add.setAttribute('aria-label', t('记一件事')); add.append(icon('fa-plus'), el('span', null, t('记一件事')));
        add.addEventListener('click', () => { if (!discard()) return; editing = 'new'; draft = editDraft({ id: 'new' }); expanded = confirming = null; renderList(); });
        filters.append(searchBox, subjectFilter, add); controls.append(tabs, filters);
        const body = el('div', 'pi-bot-sheet-body'); body.id = 'pi-bot-notes-list'; body.setAttribute('role', 'tabpanel'); body.tabIndex = 0;
        const foot = el('footer', 'pi-bot-notes-footer');
        const status = el('p', 'pi-bot-sheet-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        const about = button('pi-bot-notes-about-link', t('关于你')); about.prepend(icon('fa-user'));
        about.addEventListener('click', () => { if (requestClose()) options.onAbout?.(); }); about.hidden = !options.onAbout;
        foot.append(status, about); frame.append(head, controls, body, foot); sheet.append(frame);
        let book = null, saving = false, tab = 'waiting', editing = null, draft = null, expanded = null, confirming = null, visibleLimit = 60, discardArmed = false;
        const active = () => dialog === sheet && sheet.isConnected;
        const say = (text, tone) => { status.textContent = text || ''; if (tone) status.dataset.tone = tone; else delete status.dataset.tone; };
        const hint = () => say(t('在任何聊天里，都能接着记、接着办。'));
        const dirty = () => draft && (editing === 'new' ? Boolean(draft.text || draft.subject || draft.date || draft.time || draft.kind !== 'commitment')
            : Object.keys(draft.base).some(key => draft[key] !== draft.base[key]));
        function discard() {
            if (saving) return false;
            if (dirty() && !discardArmed) { discardArmed = true; say(t('修改还没保存，再点一次将放弃修改。'), 'warn'); return false; }
            editing = draft = null; discardArmed = false; return true;
        }
        function requestClose() { if (!discard()) return false; sheet.close(); return true; }
        sheet.requestNotebookClose = requestClose;
        close.addEventListener('click', requestClose);
        sheet.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
        sheet.addEventListener('close', () => {
            if (dialog === sheet) dialog = null; sheet.remove();
            const target = previousFocus?.isConnected && previousFocus.getClientRects().length ? previousFocus
                : document.querySelector('#pi-bot-header [data-bot-action="more"]');
            target?.focus({ preventScroll: true });
        });
        document.body.append(sheet); sheet.showModal(); close.focus();

        async function load(message) {
            try {
                const result = await api(url); if (!active()) return;
                book = result; render(); if (message) say(message, 'warn'); else hint();
            } catch (error) {
                if (!active()) return;
                const retry = button('pi-bot-chip', t('重新加载')); retry.addEventListener('click', () => { void load(); });
                body.replaceChildren(el('p', 'pi-bot-sheet-state', error.message), retry); say('');
            }
        }
        async function change(ops) {
            if (saving || !book) return;
            saving = true; renderList(); say(t('正在保存…'));
            try {
                const result = await api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: book.version, ops }) });
                if (!active()) return;
                book = result; saving = false;
                if (editing === 'new') {
                    const created = book.items.find(item => result.ids?.includes(item.id));
                    if (created) { tab = ['commitment', 'open'].includes(created.kind) ? 'waiting' : 'reference'; search.value = ''; subjectFilter.value = ''; }
                }
                editing = draft = expanded = confirming = null; discardArmed = false; render();
                say(t('已保存，所有聊天都会使用最新记录。')); body.focus({ preventScroll: true }); options.onChange?.();
            } catch (error) {
                saving = false; if (!active()) return;
                if (error.code === 'NOTEBOOK_CHANGED') {
                    confirming = expanded = null;
                    await load(t('刚刚有新的变化，已刷新；你的修改还在，请再保存一次。'));
                    if (editing && editing !== 'new' && !book?.items.some(item => item.id === editing)) {
                        editing = null;
                        if (draft) { draft.id = 'new'; editing = 'new'; say(t('这条事项已被删除。你的文字仍保留，可另存为新事项。'), 'warn'); }
                        renderList();
                    }
                    return;
                }
                renderList(); say(t('没保存成功，你的修改还在：{0}', error.message), 'error');
            }
        }
        function field(label, control) { const node = el('label', 'pi-bot-note-field'); node.append(el('span', null, t(label)), control); return node; }
        function editor(item) {
            if (draft?.id !== item.id) draft = editDraft(item); else if (item.id !== 'new') rebase(draft, item);
            const form = el('div', 'pi-bot-note-edit');
            const text = el('textarea'); text.value = draft.text; text.maxLength = 500; text.rows = 3; text.dataset.noteField = 'text'; text.setAttribute('aria-label', t('内容')); text.placeholder = t('写下想记住的事…');
            const touch = () => { discardArmed = false; if (status.dataset.tone) hint(); };
            text.addEventListener('input', () => { draft.text = text.value; touch(); }); form.append(field('内容', text));
            const fields = el('div', 'pi-bot-note-edit-fields');
            const subject = el('input'); subject.type = 'text'; subject.maxLength = 80; subject.value = draft.subject; subject.placeholder = t('例如：论文修改、东京旅行'); subject.dataset.noteField = 'subject';
            subject.addEventListener('input', () => { draft.subject = subject.value; touch(); });
            const kind = el('select'); kind.dataset.noteField = 'kind';
            for (const [value, label] of KINDS) { const option = el('option', null, t(label)); option.value = value; kind.append(option); } kind.value = draft.kind;
            kind.addEventListener('change', () => { draft.kind = kind.value; touch(); }); fields.append(field('相关事情（可不填）', subject), field('类型', kind)); form.append(fields);
            const due = el('input'); due.type = 'date'; due.dataset.noteField = 'due'; due.value = draft.date;
            const time = el('input'); time.type = 'time'; time.dataset.noteField = 'time'; time.value = draft.time; time.disabled = !draft.date;
            due.addEventListener('input', () => { draft.date = due.value; time.disabled = !due.value; if (!due.value) { time.value = ''; draft.time = ''; } touch(); });
            time.addEventListener('input', () => { draft.time = time.value; touch(); });
            const dates = el('div', 'pi-bot-note-edit-fields'); dates.append(field('截止日期（可不填）', due), field('截止时间（可不填）', time)); form.append(dates);
            const actions = el('div', 'pi-bot-note-confirm');
            const cancel = button('pi-bot-chip', t('取消')); cancel.dataset.noteAction = 'edit-cancel';
            const save = button('pi-bot-primary', t('保存')); save.dataset.noteAction = 'edit-save'; actions.append(cancel, save); form.append(actions);
            for (const control of form.querySelectorAll('input,textarea,select,button')) if (saving) control.disabled = true;
            queueMicrotask(() => { if (text.isConnected && !saving) { text.focus(); text.setSelectionRange(text.value.length, text.value.length); } });
            return form;
        }
        function source(item) {
            if (!item.source && !item.lastSource) return null;
            const details = el('details', 'pi-bot-note-source'), summary = el('summary'); summary.append(icon('fa-link'), el('span', null, t('出处'))); details.append(summary);
            for (const origin of [item.source, item.lastSource].filter(Boolean)) {
                const box = el('div', 'pi-bot-note-origin');
                const title = origin.title || t('主聊天');
                const link = button('pi-bot-note-source-link', title); link.prepend(icon('fa-comment'));
                link.disabled = !origin.available || origin.archived || !options.onSource;
                if (origin.windowId) link.addEventListener('click', () => { if (requestClose()) options.onSource(origin); });
                box.append(link);
                if (origin.archived) box.append(el('span', 'pi-bot-note-tag', t('已归档')));
                else if (!origin.available) box.append(el('span', 'pi-bot-note-tag', t('原聊天已移除')));
                if (origin.text) box.append(el('p', null, origin.role === 'user' ? t('你说：“{0}”', origin.text)
                    : origin.role === 'assistant' ? t('{0} 说：“{1}”', name, origin.text) : t('查到的：“{0}”', origin.text)));
                details.append(box);
            }
            return details;
        }
        function noteRow(item) {
            const row = el('li', `pi-bot-note is-${item.status}${item.status === 'active' && overdue(item.due) ? ' is-overdue' : ''}`); row.dataset.noteId = item.id;
            if (editing === item.id) { row.classList.add('is-editing'); row.append(editor(item)); return row; }
            if (item.status === 'active' && ['commitment', 'open'].includes(item.kind)) {
                const label = item.kind === 'open' ? t('已有答案') : t('完成');
                const check = button('pi-bot-note-check'); check.dataset.noteAction = 'done'; check.title = label; check.setAttribute('aria-label', `${label}：${item.text}`); check.disabled = saving; check.append(icon('fa-check')); row.append(check);
            } else { const mark = el('span', 'pi-bot-note-kind-icon'); mark.append(icon(item.status !== 'active' ? 'fa-check' : KINDS.find(kind => kind[0] === item.kind)?.[2] || 'fa-bookmark')); row.append(mark); }
            const main = el('div', 'pi-bot-note-main');
            main.append(el('p', 'pi-bot-note-text', item.text));
            const meta = el('div', 'pi-bot-note-meta');
            if (item.subject) meta.append(el('span', 'pi-bot-note-tag', item.subject));
            if (item.status !== 'active') meta.append(el('span', null, `${t(CLOSED[item.status] || item.status)} · ${day(item.updatedAt)}`));
            else if (item.due) meta.append(el('span', `pi-bot-note-deadline${overdue(item.due) ? ' is-overdue' : ''}`, t('截止 {0}', dueLabel(item.due))));
            else meta.append(el('span', null, t('{0} 记下', day(item.createdAt))));
            main.append(meta); const quote = source(item); if (quote) main.append(quote); row.append(main);
            const choices = item.status === 'active' ? [['fa-pen', '修改', 'edit'], ['fa-ban', '不需要了', 'cancel'], ['fa-trash-can', '删除', 'delete']]
                : [['fa-rotate-left', '重新打开', 'reopen'], ['fa-pen', '修改', 'edit'], ['fa-trash-can', '删除', 'delete']];
            const tools = el('div', 'pi-bot-note-tools'); tools.append(...choices.map(([glyph, label, action]) => actionButton(glyph, t(label), action)));
            const more = actionButton('fa-ellipsis', t('更多操作'), 'more'); more.setAttribute('aria-expanded', String(expanded === item.id));
            for (const control of [...tools.children, more]) control.disabled = saving; row.append(tools, more);
            if (confirming === item.id) {
                const panel = el('div', 'pi-bot-note-panel is-confirming'); panel.append(el('p', 'pi-bot-note-ask', t('从 {0} 的记事本删除这条？所有聊天都将不再使用它。', name)));
                const keep = button('pi-bot-chip', t('取消')); keep.dataset.noteAction = 'delete-cancel';
                const remove = button('pi-bot-danger', t('删除')); remove.dataset.noteAction = 'delete-confirm'; keep.disabled = remove.disabled = saving; panel.append(keep, remove); row.append(panel);
            } else if (expanded === item.id) {
                const panel = el('div', 'pi-bot-note-panel');
                for (const [glyph, label, action] of choices) { const choice = button(`pi-bot-chip${action === 'delete' ? ' is-danger' : ''}`); choice.dataset.noteAction = action; choice.disabled = saving; choice.append(icon(glyph), el('span', null, t(label))); panel.append(choice); }
                row.append(panel);
            }
            return row;
        }
        const belongs = (item, kind) => kind === 'closed' ? item.status !== 'active' : item.status === 'active' && (kind === 'waiting' ? ['commitment', 'open'].includes(item.kind) : !['commitment', 'open'].includes(item.kind));
        function renderList() {
            if (!book) { body.replaceChildren(el('p', 'pi-bot-sheet-state', t('正在读取…'))); return; }
            const terms = fold(search.value).split(/\s+/).filter(Boolean), subject = subjectFilter.value;
            const items = book.items.filter(item => (terms.length || belongs(item, tab) || item.id === editing) && (!subject || item.subject === subject || item.id === editing)
                && (item.id === editing || terms.every(term => fold(`${item.text} ${item.subject || ''} ${item.source?.title || ''}`).includes(term))));
            items.sort((a, b) => tab === 'waiting' ? (a.due ? when(a.due).getTime() : Infinity) - (b.due ? when(b.due).getTime() : Infinity)
                || b.updatedAt.localeCompare(a.updatedAt) : b.updatedAt.localeCompare(a.updatedAt));
            const nodes = [];
            if (editing === 'new') { const list = el('ul', 'pi-bot-notes-list'); list.append(noteRow({ id: 'new', status: 'active' })); nodes.push(list); }
            const summary = el('div', 'pi-bot-notes-list-heading'); summary.append(el('span', null, terms.length ? t('所有事项中的搜索结果（{0}）', items.length) : t('共 {0} 件', items.length)));
            if (terms.length || subject) { const clear = button('pi-bot-notes-clear', t('清除筛选')); clear.addEventListener('click', () => { search.value = ''; subjectFilter.value = ''; visibleLimit = 60; renderList(); search.focus(); }); summary.append(clear); }
            nodes.push(summary);
            if (!items.length && editing !== 'new') {
                const empty = el('div', 'pi-bot-notes-empty');
                empty.append(icon(terms.length || subject ? 'fa-magnifying-glass' : tab === 'waiting' ? 'fa-mug-hot' : tab === 'closed' ? 'fa-circle-check' : 'fa-book-open'),
                    el('p', null, terms.length || subject ? t('没有找到相关事项') : tab === 'waiting' ? t('暂时没有要跟进的事') : tab === 'closed' ? t('完成的事，会收在这里') : t('重要约定，慢慢积累')),
                    el('p', null, terms.length || subject ? t('换个关键词，或清除筛选再看看。') : t('和 {0} 聊天时说“记住这件事”，也可以直接在这里添加。', name)));
                nodes.push(empty);
            }
            const shown = items.slice(0, visibleLimit);
            for (const [kind, label] of KINDS) {
                const selected = shown.filter(item => item.kind === kind); if (!selected.length) continue;
                const section = el('section', 'pi-bot-notes-group'), list = el('ul', 'pi-bot-notes-list'); list.append(...selected.map(noteRow));
                const title = el('h3', null, t(label)); title.append(el('span', null, String(items.filter(item => item.kind === kind).length))); section.append(title, list); nodes.push(section);
            }
            if (items.length > visibleLimit) { const more = button('pi-bot-chip pi-bot-notes-load-more', t('再显示 {0} 件', Math.min(60, items.length - visibleLimit))); more.addEventListener('click', () => { visibleLimit += 60; renderList(); }); nodes.push(more); }
            if (terms.length) { body.removeAttribute('aria-labelledby'); body.setAttribute('aria-label', t('所有事项中的搜索结果')); }
            else { body.removeAttribute('aria-label'); body.setAttribute('aria-labelledby', tabNodes.get(tab).id); }
            const scroll = body.scrollTop; body.replaceChildren(...nodes); body.scrollTop = scroll;
        }
        function render() {
            if (book) {
                for (const [id, node] of tabNodes) { node.querySelector('.pi-bot-notes-count').textContent = String(book.items.filter(item => belongs(item, id)).length); node.setAttribute('aria-selected', String(id === tab)); node.tabIndex = id === tab ? 0 : -1; }
                const selected = subjectFilter.value, all = el('option', null, t('所有事情')); all.value = '';
                const subjects = [...new Set(book.items.map(item => item.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, locale()));
                subjectFilter.replaceChildren(all, ...subjects.map(subject => { const option = el('option', null, subject); option.value = subject; return option; }));
                subjectFilter.value = subjects.includes(selected) ? selected : ''; subjectFilter.hidden = !subjects.length;
            }
            add.disabled = saving || !book; renderList();
        }
        body.addEventListener('click', event => {
            const control = event.target.closest?.('[data-note-action]'); if (!control || control.disabled || saving) return;
            const row = control.closest('[data-note-id]'), id = row?.dataset.noteId, item = id === 'new' ? { id: 'new' } : book?.items.find(item => item.id === id); if (!item) return;
            const action = control.dataset.noteAction;
            const focus = (...actions) => { const node = body.querySelector(`[data-note-id="${CSS.escape(id)}"]`); for (const action of actions) { const target = [...node?.querySelectorAll(`[data-note-action="${action}"]`) || []].find(node => node.getClientRects().length); if (target) { target.focus(); return; } } body.focus(); };
            if (['done', 'cancel', 'reopen'].includes(action)) { if (!discard()) return; void change([{ op: 'status', id, status: { done: 'done', cancel: 'cancelled', reopen: 'active' }[action] }]); }
            else if (action === 'more') { expanded = expanded === id ? null : id; confirming = null; renderList(); focus(expanded ? 'edit' : 'more', 'more'); }
            else if (action === 'edit') { if (!discard()) return; editing = id; expanded = confirming = null; renderList(); }
            else if (action === 'edit-cancel') { if (discard()) { renderList(); focus('edit', 'more'); } }
            else if (action === 'delete') { if (!discard()) return; confirming = id; expanded = null; renderList(); focus('delete-cancel'); }
            else if (action === 'delete-cancel') { confirming = null; renderList(); focus('more', 'delete'); }
            else if (action === 'delete-confirm') void change([{ op: 'delete', id }]);
            else if (action === 'edit-save') {
                if (draft?.id !== id) return; if (id !== 'new') rebase(draft, item);
                const text = draft.text.replace(/\s+/g, ' ').trim(), subject = draft.subject.trim();
                if (!text) { say(t('内容不能为空'), 'error'); return; }
                const due = dueValue(draft.date, draft.time); if (due === undefined) { say(t('这个时间在这台设备的时区里不存在（夏令时调整），请换一个时间'), 'error'); return; }
                const op = id === 'new' ? { op: 'add', kind: draft.kind, text, subject, due } : { op: 'update', id };
                if (id !== 'new') {
                    for (const [key, value] of Object.entries({ text, subject, kind: draft.kind })) if (value !== (item[key] || '')) op[key] = value;
                    if (draft.date !== draft.base.date || draft.time !== draft.base.time) op.due = due;
                    if (Object.keys(op).length === 2) { editing = draft = null; renderList(); return; }
                }
                void change([op]);
            }
        });
        render(); void load();
    }
    window.PiBotNotebook = Object.freeze({ open });
})();
