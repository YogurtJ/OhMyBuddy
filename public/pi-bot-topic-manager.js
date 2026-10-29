(() => {
    // Topic organization only. The list keeps per-Buddy filters in memory; edits use the
    // same windows CAS as topics, with no replay after stale/failed requests.
    const t = globalThis.PiI18n?.t || ((text, ...values) => text.replace(/\{(\d+)\}/g, (_, i) => values[i] ?? `{${i}}`));
    const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };
    const btn = (text, cls = 'pi-bot-chip') => { const node = el('button', cls, text); node.type = 'button'; return node; };
    const icon = name => { const node = el('i', `fa-solid ${name}`); node.setAttribute('aria-hidden', 'true'); return node; };
    const body = value => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    const baseUrl = bot => `/api/pi/bots/${encodeURIComponent(bot.id)}`;
    const filters = new Map();
    const stateFor = id => { if (!filters.has(id)) filters.set(id, { group: '*', search: '', closed: new Set() }); return filters.get(id); };
    const groupSelect = (bot, selected = '') => {
        const select = el('select'); select.append(new Option(t('未分组'), ''), ...(bot.groups || []).map(group => new Option(group.name, group.id))); select.value = selected; return select;
    };
    function problem(error) {
        const code = error?.code || '';
        if (code === 'BOT_TOPIC_GROUP_EXISTS') return t('已有同名分组，请换一个名称。');
        if (code === 'BOT_TOPIC_GROUP_LIMIT') return t('分组已到上限（50 个）。');
        if (code === 'BOT_TOPIC_LIMIT') return t('话题已到上限，请先整理已有话题再恢复。');
        if (code === 'BOT_TOPIC_TRASH_LIMIT') return t('回收站已满，请先彻底删除不需要的话题。');
        if (/SCHEDULE/.test(code)) return t('还有定时任务发到这个话题。先在“定时”页调整或取消它，再继续。');
        if (/MEDIA/.test(code)) return t('这个话题还有进行中或结果待核实的媒体任务，请先在媒体卡片中处理。');
        if (/LEARNING/.test(code)) return t('伙伴正在整理学到的内容，等它结束后再试。');
        if (/BUSY|PENDING|QUEUE|ACTIVE|ROTATING|RECOVERY|DEFERRED/.test(code)) return t('这个话题还在忙或有未完成的任务，请先处理后再试。');
        if (/DELETING/.test(code)) return t('这个话题已开始彻底删除，不能恢复；可以继续完成删除。');
        return error?.message || t('保存失败');
    }
    function field(label, control, hint) {
        const node = el('label', 'pi-bot-sheet-field'); node.append(el('span', 'pi-bot-sheet-label', label), control);
        if (hint) node.append(el('span', 'pi-bot-sheet-hint', hint)); return node;
    }
    // Existing topic rows remain the ordinary chat controls (drafts/tool state are untouched).
    function list({ bot, topicItem, creating, create, manage }) {
        const state = stateFor(bot.id), root = el('section', 'pi-bot-topic-list');
        const heading = el('div', 'pi-bot-section-row'), more = btn('', 'pi-bot-topic-edit'), add = btn('', 'pi-bot-topic-add');
        more.dataset.botAction = 'topic-manager-control'; add.dataset.botAction = 'topic-create-control';
        more.title = t('整理话题'); more.setAttribute('aria-label', more.title); more.append(icon('fa-folder-tree')); more.addEventListener('click', () => manage('move'));
        add.title = t('新话题'); add.setAttribute('aria-label', add.title); add.disabled = creating; add.append(creating ? el('span', 'pi-spinner') : icon('fa-plus')); add.addEventListener('click', create);
        heading.append(el('p', 'pi-bot-section', t('话题')), more, add); root.append(heading);
        const topics = bot.windows.filter(item => item.kind === 'topic' && item.generation !== null && !item.archivedAt && !item.trashedAt);
        if (state.group !== '*' && state.group !== '' && !(bot.groups || []).some(group => group.id === state.group)) state.group = '*';
        const controls = el('div', 'pi-bot-topic-filters');
        const search = el('input'); search.type = 'search'; search.dataset.botAction = 'topic-search'; search.placeholder = t('搜索话题'); search.setAttribute('aria-label', t('搜索话题')); search.value = state.search;
        controls.append(search);
        if (bot.groups?.length) {
            const select = groupSelect(bot, state.group); select.prepend(new Option(t('全部话题'), '*')); select.value = state.group; select.dataset.botAction = 'topic-filter'; select.setAttribute('aria-label', t('筛选话题分组'));
            select.addEventListener('change', () => { state.group = select.value; paint(); }); controls.append(select);
        }
        if (topics.length || bot.groups?.length || state.search) root.append(controls);
        const rows = el('div', 'pi-bot-topic-results'); root.append(rows);
        function paint() {
            rows.replaceChildren();
            const query = state.search.trim().toLocaleLowerCase();
            const selected = topics.filter(topic => (state.group === '*' || (topic.groupId || '') === state.group)
                && (!query || `${topic.title} ${topic.focus}`.toLocaleLowerCase().includes(query)));
            if (!selected.length) { rows.append(el('p', 'pi-bot-topic-empty', topics.length ? t('没有匹配的话题') : t('想专心聊某件事时，可以单独开一个话题。'))); return; }
            if (state.group !== '*' || !bot.groups?.length) { rows.append(...selected.map(topicItem)); return; }
            for (const group of [...bot.groups, { id: '', name: t('未分组') }]) {
                const items = selected.filter(topic => (topic.groupId || '') === group.id); if (!items.length) continue;
                const section = el('details', 'pi-bot-topic-group'); section.open = !state.closed.has(group.id) || Boolean(query);
                const summary = el('summary'); summary.dataset.botAction = 'topic-group'; summary.dataset.windowId = group.id || 'ungrouped'; summary.append(el('span', null, group.name), el('small', null, String(items.length))); section.append(summary, ...items.map(topicItem));
                section.addEventListener('toggle', () => { if (!query) { if (section.open) state.closed.delete(group.id); else state.closed.add(group.id); } }); rows.append(section);
            }
        }
        search.addEventListener('input', () => { state.search = search.value; paint(); }); paint(); return root;
    }
    let active = null;
    function open(options, initial = 'move') {
        if (active?.busy) return; active?.sheet.close();
        const sheet = el('dialog', 'pi-bot-sheet pi-bot-topic-manager'); sheet.setAttribute('aria-labelledby', 'pi-bot-topic-manager-title');
        const wrap = el('div', 'pi-bot-sheet-form'), head = el('header', 'pi-bot-sheet-head'), title = el('h2', null, t('整理话题')); title.id = 'pi-bot-topic-manager-title';
        const close = btn('×', 'pi-bot-sheet-close'); close.setAttribute('aria-label', t('关闭')); head.append(title, close);
        const tabs = el('nav', 'pi-bot-topic-tabs'), content = el('div', 'pi-bot-sheet-body'), footer = el('footer', 'pi-bot-sheet-foot'), status = el('p', 'pi-bot-sheet-status'); status.setAttribute('role', 'status'); footer.append(status);
        wrap.append(head, tabs, content, footer); sheet.append(wrap); document.body.append(sheet);
        let bot = options.bot, view = initial, groupId = '', selected = new Set(), searchText = '', armed = null;
        const state = { sheet, busy: false }; active = state;
        const alive = () => sheet.open && active === state && options.current();
        const say = (text, error = false) => { status.textContent = text; status.dataset.tone = error ? 'error' : ''; };
        const latest = async () => { const fresh = await options.latest(); if (alive() && fresh) bot = fresh; };
        const lock = value => { state.busy = value; sheet.querySelectorAll('button,input,select').forEach(node => { node.disabled = value || node.dataset.unavailable === 'true'; }); };
        async function mutate(path, method, fields, done = () => {}) {
            if (state.busy || !alive()) return;
            lock(true); say(t('正在保存…'));
            try {
                const result = await options.api(baseUrl(bot) + path, { method, ...body({ expectedRevision: bot.windowsRevision, ...fields }) });
                if (!alive()) return;
                await options.onSaved?.(result); if (!alive()) return;
                await latest(); if (!alive()) return;
                done(result); paint(); say(t('已保存'));
            } catch (error) {
                if (!alive()) return;
                // Reread after a definite rejection, or a partial delete, for the next explicit click.
                try { await latest(); } catch {}
                if (!alive()) return; paint();
                say(error.status === 409 && !error.code ? t('话题列表刚刚有变化，请检查后重新确认。') : problem(error), true);
            } finally { lock(false); }
        }
        function leave() { if (!state.busy) sheet.close(); }
        close.addEventListener('click', leave); sheet.addEventListener('cancel', event => { event.preventDefault(); leave(); });
        sheet.addEventListener('close', () => { sheet.remove(); if (active === state) active = null; });
        for (const [key, text] of [['move', t('移动话题')], ['groups', t('管理分组')], ['trash', t('回收站')]]) {
            const tab = btn(text); tab.dataset.topicTab = key; tab.addEventListener('click', () => { view = key; armed = null; paint(); say(''); }); tabs.append(tab);
        }
        function paint() {
            content.replaceChildren(); tabs.querySelectorAll('button').forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.topicTab === view)));
            if (view === 'groups') paintGroups(); else if (view === 'trash') paintTrash(); else paintMove();
        }
        function paintGroups() {
            const pick = groupSelect(bot, groupId); pick.options[0].textContent = t('新建分组');
            if (!(bot.groups || []).some(group => group.id === groupId)) groupId = ''; pick.value = groupId;
            pick.setAttribute('aria-label', t('选择要管理的分组'));
            const group = bot.groups?.find(item => item.id === groupId), name = el('input'); name.maxLength = 60; name.value = group?.name || ''; name.placeholder = t('分组名称'); name.dataset.topicGroupName = 'true';
            const save = btn(group ? t('保存名称') : t('新建分组'), 'pi-bot-primary');
            const run = () => { if (name.value.trim()) void mutate(group ? `/topic-groups/${encodeURIComponent(group.id)}` : '/topic-groups', group ? 'PATCH' : 'POST', { name: name.value.trim() }, result => { groupId = result.group.id; }); };
            save.addEventListener('click', run); name.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); run(); } });
            pick.addEventListener('change', () => { groupId = pick.value; armed = null; paint(); say(''); });
            content.append(el('p', 'pi-bot-sheet-note', t('分组只用来整理话题。每个伙伴独立管理，一个话题最多属于一个分组。')), field(t('分组'), pick), field(t('名称'), name, t('最多 60 字。')), save);
            if (group) {
                const position = bot.groups.findIndex(item => item.id === group.id), order = el('div', 'pi-bot-topic-actions');
                const up = btn(t('上移')), down = btn(t('下移'));
                up.disabled = position === 0; up.dataset.unavailable = String(up.disabled); down.disabled = position === bot.groups.length - 1; down.dataset.unavailable = String(down.disabled);
                up.addEventListener('click', () => { void mutate(`/topic-groups/${group.id}`, 'PATCH', { beforeGroupId: bot.groups[position - 1].id }); });
                down.addEventListener('click', () => { void mutate(`/topic-groups/${group.id}`, 'PATCH', { beforeGroupId: bot.groups[position + 2]?.id || null }); });
                const remove = btn(armed === group.id ? t('确认删除分组') : t('删除分组')); remove.classList.add('is-danger');
                remove.addEventListener('click', () => { if (armed !== group.id) { armed = group.id; remove.textContent = t('确认删除分组'); say(t('其中的话题会移到“未分组”，聊天记录不会删除。')); } else void mutate(`/topic-groups/${group.id}`, 'DELETE', {}, () => { groupId = ''; armed = null; }); });
                order.append(up, down, remove); content.append(order, el('p', 'pi-bot-sheet-hint', t('删除分组会将其中所有话题移到“未分组”，包括已归档和回收站里的话题。')));
            }
        }
        function paintMove() {
            const topics = bot.windows.filter(item => item.kind === 'topic' && !item.trashedAt);
            const destination = groupSelect(bot, groupId); destination.append(new Option(t('新建分组…'), '+')); destination.value = groupId;
            destination.setAttribute('aria-label', t('移动到分组'));
            const name = el('input'); name.maxLength = 60; name.placeholder = t('新分组名称'); name.hidden = groupId !== '+';
            destination.addEventListener('change', () => { groupId = destination.value; name.hidden = groupId !== '+'; });
            const query = el('input'); query.type = 'search'; query.placeholder = t('搜索话题'); query.setAttribute('aria-label', t('搜索话题')); query.value = searchText;
            const rows = el('div', 'pi-bot-topic-checklist'), count = el('p', 'pi-bot-sheet-hint'), move = btn(t('移动'), 'pi-bot-primary');
            const available = new Set(topics.map(item => item.id)); selected = new Set([...selected].filter(id => available.has(id)));
            const updateCount = () => { count.textContent = t('已选择 {0} 个话题', selected.size); move.disabled = !selected.size; move.dataset.unavailable = String(move.disabled); };
            function paintRows() {
                rows.replaceChildren(); const matches = topics.filter(topic => topic.title.toLocaleLowerCase().includes(searchText.trim().toLocaleLowerCase()));
                for (const topic of matches) {
                    const label = el('label', 'pi-bot-topic-check-row'), check = el('input'); check.type = 'checkbox'; check.value = topic.id; check.checked = selected.has(topic.id);
                    check.addEventListener('change', () => { if (check.checked) selected.add(topic.id); else selected.delete(topic.id); updateCount(); });
                    const text = el('span', null, `${topic.emoji || '#'} ${topic.title}`);
                    if (topic.archivedAt) text.append(el('small', null, t('已归档'))); label.append(check, text); rows.append(label);
                }
                if (!matches.length) rows.append(el('p', 'pi-bot-sheet-note', t('没有匹配的话题')));
            }
            query.addEventListener('input', () => { searchText = query.value; paintRows(); });
            move.addEventListener('click', () => {
                if (!selected.size || groupId === '+' && !name.value.trim()) { say(t('请先选择话题并填写分组名称。'), true); return; }
                void mutate(groupId === '+' ? '/topic-groups' : '/topics/move', 'POST', groupId === '+'
                    ? { name: name.value.trim(), windowIds: [...selected] } : { groupId: groupId || null, windowIds: [...selected] }, () => { selected.clear(); if (groupId === '+') groupId = ''; });
            });
            const all = btn(t('选择当前结果')); all.addEventListener('click', () => { topics.filter(topic => topic.title.toLocaleLowerCase().includes(searchText.trim().toLocaleLowerCase())).forEach(topic => selected.add(topic.id)); paintRows(); updateCount(); });
            content.append(field(t('移动到分组'), destination), name, query, all, rows, count, move); paintRows(); updateCount();
        }
        function paintTrash() {
            const topics = bot.windows.filter(item => item.kind === 'topic' && item.trashedAt);
            content.append(el('p', 'pi-bot-sheet-note', t('回收站不会自动清空，也不占正常话题额度。恢复后保持原来的分组和归档状态。')));
            if (!topics.length) content.append(el('p', 'pi-bot-topic-empty', t('回收站是空的')));
            for (const topic of topics) {
                const row = el('section', 'pi-bot-topic-trash-row'); row.dataset.windowId = topic.id;
                row.append(el('strong', null, `${topic.emoji || '#'} ${topic.title}`), el('p', 'pi-bot-sheet-hint', topic.deleting ? t('删除尚未完成，不能恢复；请继续完成删除。') : t('保留 {0} 段聊天及话题记事本。', topic.generations)));
                const actions = el('div', 'pi-bot-topic-actions'), restore = btn(t('恢复')); restore.disabled = topic.deleting; restore.dataset.unavailable = String(Boolean(topic.deleting));
                restore.addEventListener('click', () => { void mutate(`/windows/${topic.id}/restore`, 'POST', {}); });
                const remove = btn(topic.deleting ? t('继续彻底删除') : t('彻底删除')); remove.classList.add('is-danger');
                remove.addEventListener('click', () => confirmDelete(topic, row)); actions.append(restore, remove); row.append(actions); content.append(row);
            }
        }
        function confirmDelete(topic, row) {
            if (row.querySelector('[data-delete-confirm]')) return;
            const section = el('div', 'pi-bot-topic-delete-confirm'); section.dataset.deleteConfirm = 'true';
            const name = el('input'); name.placeholder = topic.title; name.setAttribute('aria-label', t('输入话题名称确认删除'));
            const confirm = btn(t('确认彻底删除'), 'pi-bot-primary is-danger'); confirm.disabled = true; confirm.dataset.unavailable = 'true';
            const cancel = btn(t('取消'));
            name.addEventListener('input', () => { confirm.disabled = name.value !== topic.title; confirm.dataset.unavailable = String(confirm.disabled); });
            confirm.addEventListener('click', () => { void mutate(`/windows/${topic.id}`, 'DELETE', { confirmed: true }); }); cancel.addEventListener('click', () => section.remove());
            section.append(el('p', 'pi-bot-sheet-note', t('将永久删除整个话题、全部更早的聊天和记事本，无法恢复。伙伴记忆、技能和单独保存的文件或媒体仍在各自入口管理。')),
                field(t('输入话题名称确认删除'), name), confirm, cancel); row.append(section); name.focus();
        }
        paint(); sheet.showModal(); return sheet;
    }
    window.PiBotTopicManager = { list, open, groupSelect, problem, selectedGroup: id => { const value = stateFor(id).group; return value === '*' || value === '' ? null : value; } };
})();
