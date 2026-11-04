(() => {
    // Display metadata only. Every write uses the revision shown to the owner and is submitted once.
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
    const groupName = (bot, id) => bot.groups?.find(group => group.id === id)?.name || t('未分组');
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
    function searchBox(value, changed) {
        const wrap = el('div', 'pi-bot-topic-search'), input = el('input'); input.type = 'search'; input.value = value;
        input.placeholder = t('搜索话题'); input.setAttribute('aria-label', t('搜索话题'));
        const clear = btn('', 'pi-bot-topic-search-clear'); clear.append(icon('fa-xmark')); clear.setAttribute('aria-label', t('清除搜索')); clear.hidden = !value;
        input.addEventListener('input', () => { clear.hidden = !input.value; changed(input.value); });
        clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; changed(''); input.focus(); });
        wrap.append(icon('fa-magnifying-glass'), input, clear); return { wrap, input };
    }
    function list({ bot, topicItem, creating, create, manage }) {
        const state = stateFor(bot.id), root = el('section', 'pi-bot-topic-list');
        const topics = bot.windows.filter(item => item.kind === 'topic' && item.generation !== null && !item.archivedAt && !item.trashedAt);
        const heading = el('div', 'pi-bot-section-row'), label = el('p', 'pi-bot-section', t('话题')), actions = el('div', 'pi-bot-topic-heading-actions');
        label.append(el('span', 'pi-bot-topic-total', String(topics.length)));
        const more = btn('', 'pi-bot-topic-manage'), add = btn('', 'pi-bot-topic-add');
        more.dataset.botAction = 'topic-manager-control'; more.title = t('整理话题'); more.setAttribute('aria-label', more.title); more.append(icon('fa-folder-tree'), el('span', null, t('整理'))); more.addEventListener('click', () => manage('move'));
        add.dataset.botAction = 'topic-create-control'; add.title = t('新话题'); add.setAttribute('aria-label', add.title); add.disabled = creating; add.append(creating ? el('span', 'pi-spinner') : icon('fa-plus')); add.addEventListener('click', create);
        actions.append(more, add); heading.append(label, actions); root.append(heading);
        if (state.group !== '*' && state.group !== '' && !(bot.groups || []).some(group => group.id === state.group)) state.group = '*';
        const controls = el('div', 'pi-bot-topic-filters'), search = searchBox(state.search, value => { state.search = value; paint(); });
        search.input.dataset.botAction = 'topic-search'; controls.append(search.wrap);
        if (bot.groups?.length) {
            const select = groupSelect(bot, state.group); select.prepend(new Option(t('全部'), '*')); select.value = state.group;
            select.dataset.botAction = 'topic-filter'; select.setAttribute('aria-label', t('筛选话题分组'));
            select.addEventListener('change', () => { state.group = select.value; paint(); }); controls.append(select);
        }
        if (topics.length || bot.groups?.length || state.search) root.append(controls);
        const rows = el('div', 'pi-bot-topic-results'); root.append(rows);
        function paint() {
            rows.replaceChildren(); const query = state.search.trim().toLocaleLowerCase();
            const selected = topics.filter(topic => (state.group === '*' || (topic.groupId || '') === state.group)
                && (!query || `${topic.title} ${topic.focus}`.toLocaleLowerCase().includes(query)));
            if (!selected.length) { rows.append(el('p', 'pi-bot-topic-empty', topics.length ? t('没有匹配的话题') : t('想专心聊某件事时，可以单独开一个话题。'))); return; }
            if (state.group !== '*' || !bot.groups?.length) { rows.append(...selected.map(topicItem)); return; }
            for (const group of [...bot.groups, { id: '', name: t('未分组') }]) {
                const items = selected.filter(topic => (topic.groupId || '') === group.id); if (!items.length) continue;
                const section = el('details', 'pi-bot-topic-group'); section.open = !state.closed.has(group.id) || Boolean(query);
                const summary = el('summary'); summary.dataset.botAction = 'topic-group'; summary.dataset.windowId = group.id || 'ungrouped';
                summary.append(icon(group.id ? 'fa-folder' : 'fa-inbox'), el('span', null, group.name), el('small', null, String(items.length))); section.append(summary, ...items.map(topicItem));
                section.addEventListener('toggle', () => { if (!query) { if (section.open) state.closed.delete(group.id); else state.closed.add(group.id); } }); rows.append(section);
            }
        }
        paint(); return root;
    }
    let active = null;
    const liveTopics = bot => bot.windows.filter(item => item.kind === 'topic' && !item.trashedAt);
    const tile = (topic, extra = '') => { const mark = el('span', `pi-bot-topic-tile${extra}`); if (topic?.emoji) mark.textContent = topic.emoji; else mark.append(icon('fa-hashtag')); return mark; };
    function blank(mark, title, text) {
        const node = el('div', 'pi-bot-topic-blank'); node.append(mark ? icon(mark) : el('span', 'pi-spinner'), el('strong', null, title));
        if (text) node.append(el('p', null, text)); return node;
    }
    function open(options, initial = 'move') {
        if (active?.busy) return; active?.sheet.close();
        const sheet = el('dialog', 'pi-bot-sheet pi-bot-topic-manager'); sheet.setAttribute('aria-labelledby', 'pi-bot-topic-manager-title');
        const wrap = el('div', 'pi-bot-sheet-form'), head = el('header', 'pi-bot-sheet-head'), heading = el('div', 'pi-bot-topic-heading');
        const title = el('h2', null, t('整理话题')); title.id = 'pi-bot-topic-manager-title'; heading.append(title, el('p', null, options.bot.name));
        const close = btn('', 'pi-bot-sheet-close'); close.append(icon('fa-xmark')); close.setAttribute('aria-label', t('关闭')); close.title = t('关闭'); head.append(heading, close);
        const tabs = el('nav', 'pi-bot-topic-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', t('话题整理方式'));
        const content = el('div', 'pi-bot-sheet-body'); content.id = 'pi-bot-topic-panel'; content.setAttribute('role', 'tabpanel');
        const footer = el('footer', 'pi-bot-sheet-foot'), actionArea = el('div', 'pi-bot-topic-footer-actions'), status = el('p', 'pi-bot-sheet-status'); status.setAttribute('role', 'status');
        footer.append(actionArea, status); wrap.append(head, tabs, content, footer); sheet.append(wrap); document.body.append(sheet);
        let bot = options.bot, view = initial, selected = new Set(), searchText = '', source = bot.windows.some(item => item.kind === 'topic' && !item.trashedAt && !item.groupId) ? '' : '*';
        let destinationId = '@', moveName = '', newName = '', editing = null, armed = null, trashData = null, trashLoading = false, trashError = null, trashSerial = 0;
        const drafts = new Map(), counts = {}, state = { sheet, busy: false }; active = state;
        const alive = () => sheet.open && active === state && options.current();
        const say = (text, error = false) => { status.textContent = text; status.dataset.tone = error ? 'error' : ''; };
        const latest = async () => { const fresh = await options.latest(); if (alive() && fresh) bot = fresh; };
        const lock = value => { state.busy = value; sheet.querySelectorAll('button,input,select').forEach(node => { node.disabled = value || node.dataset.unavailable === 'true'; }); };
        const invalidateTrash = () => { trashSerial++; trashData = null; trashLoading = false; trashError = null; };
        async function mutate(path, method, fields, done = () => {}) {
            if (state.busy || !alive()) return;
            const expectedRevision = view === 'trash' ? trashData?.windowsRevision : bot.windowsRevision; if (!expectedRevision) return;
            lock(true); say(t('正在保存…'));
            try {
                const result = await options.api(baseUrl(bot) + path, { method, ...body({ expectedRevision, ...fields }) });
                if (!alive()) return; await options.onSaved?.(result); if (!alive()) return;
                await latest(); if (!alive()) return; done(result); invalidateTrash(); paint();
                say(result.imageCleanupWarning ? t(result.imageCleanupWarning) : result.imageDeletionId ? t('话题已删除，图片已登记待核对；其他会话仍使用的图片会保留，可在附件管理中检查。') : t('已保存'), Boolean(result.imageCleanupWarning));
            } catch (error) {
                if (!alive()) return; try { await latest(); } catch {}
                if (!alive()) return; invalidateTrash(); paint();
                say(error.status === 409 && !error.code ? t('话题列表刚刚有变化，请检查后重新确认。') : problem(error), true);
            } finally { lock(false); }
        }
        function leave() { if (!state.busy) sheet.close(); }
        close.addEventListener('click', leave); sheet.addEventListener('cancel', event => { event.preventDefault(); leave(); });
        sheet.addEventListener('close', () => { trashSerial++; sheet.remove(); if (active === state) active = null; });
        function changeView(key) { if (view === key) return; view = key; armed = null; paint(); say(''); }
        for (const [key, text, mark] of [['move', t('移动话题'), 'fa-arrow-right-arrow-left'], ['groups', t('管理分组'), 'fa-folder'], ['trash', t('回收站'), 'fa-trash-can']]) {
            const tab = btn('', 'pi-bot-topic-tab'); tab.dataset.topicTab = key; tab.id = `pi-bot-topic-tab-${key}`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', content.id);
            counts[key] = el('small'); tab.append(icon(mark), el('span', null, text), counts[key]); tab.addEventListener('click', () => changeView(key));
            tab.addEventListener('keydown', event => {
                const keys = ['move', 'groups', 'trash'], index = keys.indexOf(view);
                const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null;
                if (next === null) return; event.preventDefault(); changeView(keys[next]); tabs.children[next].focus();
            }); tabs.append(tab);
        }
        function paint() {
            content.replaceChildren(); actionArea.replaceChildren(); sheet.dataset.topicView = view; content.dataset.topicView = view; content.setAttribute('aria-labelledby', `pi-bot-topic-tab-${view}`);
            tabs.querySelectorAll('button').forEach(tab => { const chosen = tab.dataset.topicTab === view; tab.setAttribute('aria-selected', String(chosen)); tab.tabIndex = chosen ? 0 : -1; });
            const trashTotal = trashData ? trashData.windows.length : bot.trashCount ?? 0;
            for (const [key, value] of [['move', 0], ['groups', 0], ['trash', trashTotal]]) { counts[key].textContent = value ? String(value) : ''; counts[key].hidden = !value; }
            if (view === 'groups') paintGroups(); else if (view === 'trash') paintTrash(); else paintMove();
            if (state.busy) lock(true);
        }
        function paintGroups() {
            content.append(el('p', 'pi-bot-topic-view-hint', t('分组只用来整理话题列表，不改变聊天方式。')));
            const createRow = el('div', 'pi-bot-topic-group-create'), name = el('input'); name.type = 'text'; name.maxLength = 60; name.placeholder = t('新分组名称'); name.setAttribute('aria-label', t('新分组名称')); name.value = newName; name.dataset.topicGroupName = 'true';
            const create = btn('', 'pi-bot-primary'); create.append(icon('fa-plus'), el('span', null, t('新建分组'))); create.dataset.unavailable = String(!newName.trim()); create.disabled = !newName.trim();
            name.addEventListener('input', () => { newName = name.value; create.disabled = !newName.trim(); create.dataset.unavailable = String(create.disabled); });
            const run = () => { if (newName.trim()) void mutate('/topic-groups', 'POST', { name: newName.trim() }, () => { newName = ''; }); };
            create.addEventListener('click', run); name.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); run(); } }); createRow.append(name, create); content.append(createRow);
            if (!bot.groups?.length) { content.append(blank('fa-folder-plus', t('还没有分组'), t('先起个名字，再把相关话题放在一起。'))); return; }
            const cards = el('div', 'pi-bot-topic-group-cards'); content.append(cards);
            for (const [position, group] of bot.groups.entries()) {
                const card = el('section', 'pi-bot-topic-group-card'); card.dataset.groupId = group.id;
                const row = el('div', 'pi-bot-topic-group-card-head'), mark = el('span', 'pi-bot-topic-tile is-group'); mark.append(icon('fa-folder'));
                const total = bot.windows.filter(topic => topic.kind === 'topic' && topic.groupId === group.id && !topic.trashedAt).length;
                if (editing === group.id) {
                    card.classList.add('is-editing');
                    const input = el('input'); input.type = 'text'; input.maxLength = 60; input.value = drafts.get(group.id) ?? group.name; input.dataset.groupRename = group.id; input.setAttribute('aria-label', t('分组名称'));
                    const save = btn(t('保存'), 'pi-bot-primary'), cancel = btn(t('取消')); save.setAttribute('aria-label', t('保存名称'));
                    const validity = () => { save.disabled = !input.value.trim() || input.value.trim() === group.name; save.dataset.unavailable = String(save.disabled); }; validity();
                    const done = () => { drafts.delete(group.id); editing = null; };
                    const submit = () => { if (!save.disabled) void mutate(`/topic-groups/${group.id}`, 'PATCH', { name: input.value.trim() }, done); };
                    input.addEventListener('input', () => { drafts.set(group.id, input.value); validity(); });
                    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); submit(); } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); done(); paint(); } });
                    save.addEventListener('click', submit); cancel.addEventListener('click', () => { done(); paint(); });
                    row.append(mark, input, save, cancel); card.append(row); cards.append(card); continue;
                }
                const copy = el('div', 'pi-bot-topic-group-copy'); copy.append(el('strong', null, group.name), el('small', null, t('{0} 个话题', total)));
                const actions = el('div', 'pi-bot-topic-group-tools');
                const tool = (mark, label, disabled, run, extra = '') => {
                    const node = btn('', `pi-bot-topic-icon-button${extra}`); node.append(icon(mark)); node.title = label; node.setAttribute('aria-label', label);
                    node.disabled = disabled; node.dataset.unavailable = String(disabled); node.addEventListener('click', run); actions.append(node); return node;
                };
                tool('fa-pen', t('改名分组“{0}”', group.name), false, () => { editing = group.id; armed = null; if (!drafts.has(group.id)) drafts.set(group.id, group.name); paint(); const input = cardFor(group.id)?.querySelector('[data-group-rename]'); input?.focus(); input?.select(); });
                tool('fa-arrow-up', t('{0}分组“{1}”', t('上移'), group.name), position === 0, () => { void mutate(`/topic-groups/${group.id}`, 'PATCH', { beforeGroupId: bot.groups[position - 1]?.id }); });
                tool('fa-arrow-down', t('{0}分组“{1}”', t('下移'), group.name), position === bot.groups.length - 1, () => { void mutate(`/topic-groups/${group.id}`, 'PATCH', { beforeGroupId: bot.groups[position + 2]?.id || null }); });
                tool('fa-trash-can', t('删除分组“{0}”', group.name), false, () => { armed = group.id; editing = null; paint(); cardFor(group.id)?.querySelector('[data-confirm-group-delete]')?.focus(); }, ' is-danger');
                row.append(mark, copy, actions); card.append(row);
                if (armed === group.id) {
                    card.classList.add('is-armed');
                    const confirm = el('div', 'pi-bot-topic-group-inline'); confirm.append(el('p', null, t('删除“{0}”分组？其中的话题会回到未分组，聊天不会删除。', group.name)));
                    const yes = btn(t('确认删除分组'), 'pi-bot-chip is-danger'), no = btn(t('取消')); yes.dataset.confirmGroupDelete = 'true';
                    yes.addEventListener('click', () => { void mutate(`/topic-groups/${group.id}`, 'DELETE', {}, () => { armed = null; drafts.delete(group.id); }); }); no.addEventListener('click', () => { armed = null; paint(); });
                    const buttons = el('div', 'pi-bot-topic-actions'); buttons.append(no, yes); confirm.append(buttons); card.append(confirm);
                }
                cards.append(card);
            }
        }
        function cardFor(id) { return [...content.querySelectorAll('[data-group-id]')].find(node => node.dataset.groupId === id); }
        function paintMove() {
            const topics = liveTopics(bot), available = new Set(topics.map(item => item.id)); selected = new Set([...selected].filter(id => available.has(id)));
            if (source !== '*' && source !== '' && !bot.groups?.some(group => group.id === source)) source = '*';
            const toolbar = el('div', 'pi-bot-topic-organizer-tools'), search = searchBox(searchText, value => { searchText = value; paintRows(); });
            const scopes = el('div', 'pi-bot-topic-scopes'); scopes.setAttribute('role', 'group'); scopes.setAttribute('aria-label', t('查看分组'));
            const inGroup = id => topics.filter(topic => (topic.groupId || '') === id).length;
            for (const [id, text, total, mark] of [['*', t('全部'), topics.length, ''], ['', t('未分组'), inGroup(''), 'fa-inbox'], ...(bot.groups || []).map(group => [group.id, group.name, inGroup(group.id), 'fa-folder'])]) {
                const scope = btn('', 'pi-bot-topic-scope'); if (mark) scope.append(icon(mark)); scope.append(el('span', null, text), el('small', null, String(total)));
                scope.setAttribute('aria-pressed', String(source === id)); scope.dataset.topicSource = id; scope.title = text;
                scope.addEventListener('click', () => {
                    if (source === id) return; const left = scopes.scrollLeft; source = id; selected.clear(); paint();
                    const again = content.querySelector('.pi-bot-topic-scopes'); if (again) again.scrollLeft = left; again?.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
                }); scopes.append(scope);
            }
            toolbar.append(search.wrap, scopes); content.append(toolbar);
            const selection = el('div', 'pi-bot-topic-selection'), all = btn(t('选择当前结果'), 'pi-bot-topic-text-button'), matchesLabel = el('span'); selection.append(matchesLabel, all);
            const rows = el('div', 'pi-bot-topic-checklist'); content.append(selection, rows);
            const hint = el('p', 'pi-bot-topic-bulk-hint', t('勾选话题后，在这里选择要移到的分组。'));
            const bulk = el('div', 'pi-bot-topic-bulk'), summary = el('div', 'pi-bot-topic-bulk-summary'), counter = el('strong'), clear = btn(t('清除选择'), 'pi-bot-topic-text-button'); clear.addEventListener('click', () => { selected.clear(); paintRows(); }); summary.append(counter, clear);
            const destination = groupSelect(bot, destinationId); destination.prepend(new Option(t('选择目标分组'), '@')); destination.append(new Option(t('新建分组…'), '+')); destination.value = destinationId; destination.setAttribute('aria-label', t('移动到分组')); destination.dataset.topicDestination = 'true';
            const name = el('input'); name.type = 'text'; name.maxLength = 60; name.placeholder = t('新分组名称'); name.setAttribute('aria-label', t('新分组名称')); name.value = moveName; name.hidden = destinationId !== '+';
            const move = btn('', 'pi-bot-primary'); move.append(icon('fa-arrow-right'), el('span', null, t('移动')));
            const target = el('div', 'pi-bot-topic-bulk-target'); target.append(destination, name, move); bulk.append(summary, target); actionArea.append(hint, bulk);
            const matches = () => topics.filter(topic => (source === '*' || (topic.groupId || '') === source) && `${topic.title} ${topic.focus || ''}`.toLocaleLowerCase().includes(searchText.trim().toLocaleLowerCase()));
            function updateCount() {
                hint.hidden = Boolean(selected.size) || !topics.length; bulk.hidden = !selected.size;
                counter.textContent = t('已选择 {0} 个话题', selected.size);
                const noop = destinationId !== '+' && [...selected].every(id => (topics.find(topic => topic.id === id)?.groupId || '') === destinationId);
                move.disabled = !selected.size || destinationId === '@' || destinationId === '+' && !moveName.trim() || noop; move.dataset.unavailable = String(move.disabled);
                const visible = matches(); all.textContent = visible.length && visible.every(topic => selected.has(topic.id)) ? t('取消选择当前结果') : t('选择当前结果'); all.disabled = !visible.length; all.dataset.unavailable = String(all.disabled);
                all.hidden = !visible.length;
            }
            function paintRows() {
                rows.replaceChildren(); const found = matches(); matchesLabel.textContent = t('{0} 个话题', found.length);
                for (const group of [...(bot.groups || []), { id: '', name: t('未分组') }]) {
                    const items = found.filter(topic => (topic.groupId || '') === group.id); if (!items.length) continue;
                    const section = el('section', 'pi-bot-topic-check-group');
                    if (source === '*') { const head = el('div', 'pi-bot-topic-check-group-head'); head.append(icon(group.id ? 'fa-folder' : 'fa-inbox'), el('strong', null, group.name), el('small', null, String(items.length))); section.append(head); }
                    const list = el('div', 'pi-bot-topic-check-items');
                    for (const topic of items) {
                        const label = el('label', 'pi-bot-topic-check-row'); label.dataset.topicGroupId = group.id; const check = el('input'); check.type = 'checkbox'; check.value = topic.id; check.checked = selected.has(topic.id);
                        check.addEventListener('change', () => { if (check.checked) selected.add(topic.id); else selected.delete(topic.id); label.classList.toggle('is-selected', check.checked); updateCount(); }); label.classList.toggle('is-selected', check.checked);
                        const copy = el('span', 'pi-bot-topic-check-copy'); copy.append(el('span', 'pi-bot-topic-check-title', topic.title));
                        if (topic.archivedAt) copy.append(el('small', 'pi-bot-topic-check-badge', t('已归档')));
                        label.append(check, tile(topic), copy); list.append(label);
                    }
                    section.append(list); rows.append(section);
                }
                if (!found.length) rows.append(blank(searchText.trim() ? 'fa-magnifying-glass' : 'fa-inbox', t('没有匹配的话题')));
                updateCount();
            }
            all.addEventListener('click', () => { const visible = matches(), remove = visible.every(topic => selected.has(topic.id)); visible.forEach(topic => remove ? selected.delete(topic.id) : selected.add(topic.id)); paintRows(); });
            destination.addEventListener('change', () => { destinationId = destination.value; name.hidden = destinationId !== '+'; updateCount(); if (!name.hidden) name.focus(); }); name.addEventListener('input', () => { moveName = name.value; updateCount(); });
            move.addEventListener('click', () => { if (move.disabled) return; void mutate(destinationId === '+' ? '/topic-groups' : '/topics/move', 'POST', destinationId === '+' ? { name: moveName.trim(), windowIds: [...selected] } : { groupId: destinationId || null, windowIds: [...selected] }, () => { selected.clear(); moveName = ''; destinationId = '@'; }); });
            paintRows();
        }
        async function loadTrash() {
            if (trashLoading) return; const serial = ++trashSerial; trashLoading = true; trashError = null;
            try {
                const data = await options.api(baseUrl(bot) + '/topics/trash');
                if (!alive() || serial !== trashSerial) return;
                if (!Array.isArray(data.windows) || typeof data.windowsRevision !== 'string') throw Error(t('回收站暂时无法读取，请重试。'));
                trashData = data; if (view === 'trash') paint();
            } catch (error) { if (alive() && serial === trashSerial) { trashError = error; if (view === 'trash') paint(); } }
            finally { if (serial === trashSerial) trashLoading = false; }
        }
        function paintTrash() {
            content.append(el('p', 'pi-bot-topic-view-hint', t('回收站里的话题可以恢复；彻底删除后无法找回。')));
            if (!trashData) {
                if (trashError) { const box = blank('fa-triangle-exclamation', t('回收站暂时无法读取，请重试。')), retry = btn(t('重试')); retry.addEventListener('click', () => { void loadTrash(); paint(); }); box.append(retry); content.append(box); }
                else { content.append(blank('', t('正在读取…'))); if (!trashLoading && sheet.open) void loadTrash(); }
                return;
            }
            const topics = trashData.windows;
            if (!topics.length) { content.append(blank('fa-trash-can', t('回收站是空的'), t('移到回收站的话题会出现在这里。'))); return; }
            const list = el('div', 'pi-bot-topic-trash-list'); content.append(list);
            for (const topic of topics) {
                const row = el('section', 'pi-bot-topic-trash-row'); row.dataset.windowId = topic.id;
                const info = el('div', 'pi-bot-topic-trash-head'), copy = el('div', 'pi-bot-topic-trash-copy');
                const meta = topic.deleting ? t('删除尚未完成，不能恢复；请继续完成删除。')
                    : [groupName(trashData, topic.groupId), Number.isFinite(topic.generations) ? t('{0} 段聊天', topic.generations) : ''].filter(Boolean).join(' · ');
                copy.append(el('strong', null, topic.title), el('small', topic.deleting ? 'is-danger' : null, meta)); info.append(tile(topic), copy);
                const actions = el('div', 'pi-bot-topic-actions'), restore = btn(''); restore.append(icon('fa-rotate-left'), el('span', null, t('恢复')));
                restore.disabled = Boolean(topic.deleting); restore.dataset.unavailable = String(Boolean(topic.deleting)); restore.hidden = Boolean(topic.deleting);
                restore.addEventListener('click', () => { void mutate(`/windows/${topic.id}/restore`, 'POST', {}); });
                const remove = btn('', 'pi-bot-topic-text-button is-danger'); remove.append(el('span', null, topic.deleting ? t('继续彻底删除') : t('彻底删除'))); remove.addEventListener('click', () => confirmDelete(topic, row));
                actions.append(remove, restore); row.append(info, actions); list.append(row);
            }
        }
        function confirmDelete(topic, row) {
            if (row.querySelector('[data-delete-confirm]')) { row.querySelector('[data-delete-confirm] input')?.focus(); return; }
            const section = el('div', 'pi-bot-topic-delete-confirm'); section.dataset.deleteConfirm = 'true';
            const name = el('input'); name.type = 'text'; name.placeholder = topic.title; name.setAttribute('aria-label', t('输入话题名称确认删除'));
            const confirm = btn(t('确认彻底删除'), 'pi-bot-primary is-danger'); confirm.disabled = true; confirm.dataset.unavailable = 'true'; const cancel = btn(t('取消'));
            name.addEventListener('input', () => { confirm.disabled = name.value !== topic.title; confirm.dataset.unavailable = String(confirm.disabled); });
            confirm.addEventListener('click', () => { void mutate(`/windows/${topic.id}`, 'DELETE', { confirmed: true }); }); cancel.addEventListener('click', () => section.remove());
            const buttons = el('div', 'pi-bot-topic-actions'); buttons.append(cancel, confirm);
            section.append(el('p', null, t('将永久删除整个话题、全部更早的聊天和记事本，无法恢复。伙伴记忆、技能和单独保存的文件或媒体仍在各自入口管理。')), field(t('输入话题名称确认删除'), name), buttons); row.append(section); name.focus();
        }
        paint(); sheet.showModal(); if (view === 'trash') void loadTrash(); return sheet;
    }
    window.PiBotTopicManager = { list, open, groupSelect, problem, selectedGroup: id => { const value = stateFor(id).group; return value === '*' || value === '' ? null : value; } };
})();
