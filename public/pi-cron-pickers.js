/* Searchable destinations for scheduled tasks. All directory access stays server-scoped. */
(() => {
    const t = (s, ...args) => globalThis.PiI18n?.t(s, ...args) || s;
    const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
    const button = (text, action, cls = '') => { const b = node('button', `cron-button ${cls}`, t(text)); b.type = 'button'; b.onclick = action; return b; };
    const matches = (text, query) => query.toLocaleLowerCase().trim().split(/\s+/).every(word => text.toLocaleLowerCase().includes(word));
    let active = null;
    function shell(title, hint, owner) {
        active?.close();
        const focus = document.activeElement, dialog = node('dialog', 'cron-picker'); dialog.setAttribute('aria-label', t(title));
        const head = node('header', 'cron-picker-head'), copy = node('div'); copy.append(node('h2', '', t(title)), node('p', 'cron-muted', t(hint)));
        const close = button('取消', () => finish()); head.append(copy, close);
        const body = node('div', 'cron-picker-body'), footer = node('footer', 'cron-picker-footer'); dialog.append(head, body, footer);
        function finish() { if (!dialog.isConnected) return; dialog.close(); dialog.remove(); if (active?.dialog === dialog) active = null; if (focus?.isConnected) focus.focus({ preventScroll: true }); }
        dialog.oncancel = event => { event.preventDefault(); finish(); };
        dialog.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(); return; }
            if (!['ArrowDown', 'ArrowUp'].includes(event.key) || !event.target.closest('.cron-picker-results, .cron-picker-search')) return;
            const buttons = [...dialog.querySelectorAll('.cron-picker-results button:not(:disabled)')];
            if (!buttons.length) return;
            const index = buttons.indexOf(document.activeElement), next = index < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1) : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
            event.preventDefault(); buttons[next].focus();
        });
        document.body.append(dialog); dialog.showModal(); active = { dialog, close: finish };
        return { dialog, body, footer, close: finish, current: () => dialog.open && owner.isConnected };
    }
    function searchField(parent, label) {
        const input = node('input', 'cron-picker-search'); input.type = 'search'; input.placeholder = t(label); input.setAttribute('aria-label', t(label)); parent.append(input); return input;
    }
    function result(title, meta, action, selected = false) {
        const b = button('', action, 'cron-picker-result'); b.setAttribute('aria-pressed', String(selected));
        const copy = node('span'); copy.append(node('strong', '', title), node('small', '', meta)); b.append(copy);
        if (selected) { const icon = node('i', 'fa-solid fa-check'); icon.setAttribute('aria-hidden', 'true'); b.append(icon); }
        return b;
    }
    function thread(parent, onChange) {
        const wrap = node('div', 'cron-field cron-thread-field'), caption = node('span', '', t('目标线程'));
        const trigger = button('', open, 'cron-thread-trigger'); trigger.setAttribute('aria-label', t('目标线程')); trigger.setAttribute('aria-haspopup', 'dialog');
        const hint = node('small'); wrap.append(caption, trigger, hint); parent.append(wrap);
        let items = [], selected = '', loading = false, failed = false;
        function paint() {
            const item = items.find(s => s.id === selected);
            trigger.replaceChildren(node('span', '', loading ? t('正在读取线程…') : item ? item.name || item.firstMessage || item.id : t('请选择线程')), node('i', 'fa-solid fa-magnifying-glass'));
            trigger.disabled = loading || failed; trigger.title = item ? `${item.name || item.firstMessage || item.id}\n${item.id}` : '';
            hint.textContent = loading ? '' : failed ? t('线程读取失败，请重试。') : items.length ? t('{0} 个线程，可按名称、身份或 ID 搜索。', items.length) : t('此目录没有可用线程，请更换目录或在工作台新建线程。');
        }
        function open() {
            const modal = shell('选择目标线程', '搜索名称、身份或线程 ID，选择后回到任务。', trigger);
            const search = searchField(modal.body, '搜索线程'), list = node('div', 'cron-picker-results'), count = node('p', 'cron-muted'); count.setAttribute('role', 'status');
            modal.body.append(list); modal.footer.append(count);
            let limit = 80;
            function render() {
                const found = items.filter(s => matches(`${s.name || ''} ${s.firstMessage || ''} ${s.agentProfile?.name || ''} ${s.id}`, search.value)); list.replaceChildren();
                count.textContent = t('{0} 个匹配线程', found.length);
                for (const s of found.slice(0, limit)) {
                    const meta = [s.agentProfile?.name, s.id].filter(Boolean).join(' · ');
                    list.append(result(s.name || s.firstMessage || s.id, meta, () => { if (!modal.current()) return; selected = s.id; paint(); modal.close(); onChange(); }, s.id === selected));
                }
                if (found.length > limit) list.append(button('显示更多', () => { limit += 80; render(); }));
                if (!found.length) list.append(node('p', 'cron-empty-small', t('没有匹配的线程，试试其他关键词。')));
            }
            search.oninput = () => { limit = 80; render(); }; render(); search.focus();
        }
        paint();
        return { element: wrap, get value() { return selected; },
            pending() { items = []; selected = ''; loading = true; failed = false; paint(); },
            setItems(value, id) { items = value; selected = items.some(s => s.id === id) ? id : ''; loading = failed = false; paint(); },
            fail() { loading = false; failed = true; paint(); } };
    }
    function directory(input, { api, getProjects }) {
        const wrap = input.parentElement, group = node('div', 'cron-directory-input'); input.replaceWith(group); group.append(input);
        const choose = button('选择目录', open); group.append(choose);
        function open() {
            const modal = shell('选择工作目录', '选择现有项目，或浏览服务器上的目录。', choose);
            const tabs = node('div', 'cron-picker-tabs'), projectTab = button('现有项目', () => showProjects()), browseTab = button('浏览目录', () => browse(input.value)); tabs.append(projectTab, browseTab); modal.body.append(tabs);
            const content = node('div', 'cron-picker-content'); modal.body.append(content);
            let generation = 0, controller = null;
            const close = modal.close; modal.close = () => { controller?.abort(); close(); };
            function select(path) { if (!modal.current()) return; input.value = path; modal.close(); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
            function mode(project) { projectTab.setAttribute('aria-pressed', String(project)); browseTab.setAttribute('aria-pressed', String(!project)); content.replaceChildren(); modal.footer.replaceChildren(); }
            async function showProjects() {
                const version = ++generation; controller?.abort(); mode(true); content.append(node('p', 'cron-muted', t('正在读取项目…')));
                try {
                    const projects = await getProjects(); if (version !== generation || !modal.current()) return;
                    content.replaceChildren(); const search = searchField(content, '搜索项目名称或路径'), list = node('div', 'cron-picker-results'); content.append(list);
                    function render() {
                        list.replaceChildren(); const found = projects.filter(p => matches(`${p.name || ''} ${p.cwd}`, search.value));
                        for (const p of found) list.append(result(p.name || p.cwd.split(/[\\/]/).filter(Boolean).at(-1) || p.cwd, p.cwd, () => select(p.cwd), p.cwd === input.value));
                        if (!found.length) list.append(node('p', 'cron-empty-small', t('没有匹配的项目，可切换到浏览目录。')));
                    }
                    search.oninput = render; render(); search.focus();
                } catch (error) { if (version === generation && modal.current()) { content.replaceChildren(node('p', 'cron-muted error', error.message), button('重试读取', () => showProjects())); } }
            }
            async function browse(path) {
                const version = ++generation; controller?.abort(); controller = new AbortController(); mode(false);
                const pathRow = node('div', 'cron-picker-path'), pathInput = node('input'); pathInput.value = path; pathInput.setAttribute('aria-label', t('目录路径')); pathInput.placeholder = t('项目的绝对路径');
                const go = button('前往', () => browse(pathInput.value)); pathRow.append(pathInput, go); content.append(pathRow);
                pathInput.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); void browse(pathInput.value); } };
                const status = node('p', 'cron-muted', t('正在读取目录…')); status.setAttribute('role', 'status'); content.append(status);
                try {
                    const data = await api(`/api/pi/files/directories?${new URLSearchParams({ path })}`, { signal: controller.signal });
                    if (version !== generation || !modal.current()) return;
                    pathInput.value = data.current || '';
                    const nav = node('div', 'cron-actions'); nav.append(button('允许的位置', () => browse(''))); if (data.parent) nav.append(button('上一级目录', () => browse(data.parent))); content.append(nav);
                    const search = searchField(content, '筛选子目录'), list = node('div', 'cron-picker-results'); content.append(list);
                    status.textContent = data.partial ? t('仅显示部分目录，可输入完整路径前往。') : data.current || t('允许的位置');
                    function render() { list.replaceChildren(); for (const entry of (data.directories || []).filter(d => matches(d.name, search.value))) list.append(result(entry.name, entry.path, () => browse(entry.path)));
                        if (!list.childElementCount) list.append(node('p', 'cron-empty-small', t('没有可显示的子目录，可选择当前目录。'))); }
                    search.oninput = render; render();
                    if (data.current) { const current = node('span', 'cron-muted', data.current); current.title = data.current; modal.footer.append(current, button('使用此目录', () => select(data.current), 'primary')); }
                } catch (error) { if (version === generation && modal.current()) { status.textContent = error.message; status.classList.add('error'); content.append(button('允许的位置', () => browse('')), button('重试读取', () => browse(path))); } }
            }
            void showProjects();
        }
        return wrap;
    }
    window.PiCronPickers = { thread, directory, close: () => active?.close() };
})();
