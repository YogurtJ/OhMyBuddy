// Bot-only presentation of native turn nodes and successful state-change receipts.
(() => {
    const t = (text, ...values) => globalThis.PiI18n?.t?.(text, ...values) || text.replace(/\{(\d+)\}/g, (_, i) => values[i] ?? '');
    const node = (tag, className, text) => { const item = document.createElement(tag); item.className = className || ''; if (text != null) item.textContent = text; return item; };
    const boundary = item => item.matches('.pi-message.user, .pi-agent-turn-start');
    const RECEIPTS = '.pi-bot-change-source, .pi-bot-turn-receipts, .pi-memory-hints, .pi-bot-schedule-receipt, .pi-bot-topic-receipt, .pi-delivery-receipt';
    const FIELDS = { name: '名字', avatar: '头像', job: '主要帮你做', personality: '性格', workStyle: '做事方式', aboutUser: '关于你', finish: '完成互相认识', model: '模型', thinking: '思考程度', notify: '主动联系' };
    const firstLine = value => typeof value === 'string' ? value.trim().split(/\r?\n/)[0].slice(0, 160) : '';
    const all = (nodes, selector) => nodes.flatMap(item => [...(item.matches(selector) ? [item] : []), ...item.querySelectorAll(selector)]);
    const fields = names => names.filter(name => Object.hasOwn(FIELDS, name)).map(name => t(FIELDS[name])).join(t('、'));

    function receiptGroup(user) {
        let last = user, group = null;
        for (let item = user.nextElementSibling; item && !boundary(item); item = item.nextElementSibling) {
            if (item.matches('.pi-bot-turn-receipts')) group = item;
            else last = item;
        }
        if (!group) { group = node('section', 'pi-bot-turn-receipts'); group.setAttribute('aria-label', t('本轮更新')); }
        if (last.nextElementSibling !== group) last.after(group);
        return group;
    }

    function createReceipts(host) {
        const sources = new Map();
        function row(area, text, owner) {
            const item = node('div', 'pi-bot-change-receipt'); item.dataset.area = area;
            const icon = node('i', `fa-solid ${area === 'notebook' ? 'fa-book-open' : area === 'skill' ? 'fa-graduation-cap' : area === 'settings' ? 'fa-sliders' : 'fa-brain'}`);
            icon.setAttribute('aria-hidden', 'true');
            const button = node('button', 'pi-bot-receipt-action', t('查看')); button.type = 'button';
            button.addEventListener('click', () => {
                if (host.context() !== owner.key) return;
                if (area === 'notebook') host.notebook();
                else if (area === 'settings') host.settings();
                else window.PiWorkspaceRoute?.navigate('profiles', { profileId: owner.profileId, section: area === 'skill' ? 'skills' : area === 'user' ? 'user' : 'memory' });
            });
            item.append(icon, node('span', 'pi-bot-receipt-copy', text), button); return item;
        }
        return {
            render(message) {
                if (!host.enabled() || message?.isError || !message?.toolCallId) return null;
                const details = message.details || {}, changes = [];
                const note = details.pivaneNoteSaved, setup = details.pivaneBotSetup, generic = details.pivaneBotChanges;
                if (note?.v === 1 && Array.isArray(note.ids) && note.ids.length) changes.push({ area: 'notebook', count: note.ids.length, preview: firstLine(host.args(message.toolCallId)?.text) });
                if (setup?.status === 'saved' && setup.saved && fields(Object.keys(setup.saved))) changes.push({ area: 'settings', text: t('更新了设置 · {0}', fields(Object.keys(setup.saved))) });
                if (generic?.v === 1 && Array.isArray(generic.changes)) for (const change of generic.changes) {
                    if (!change || !['user', 'memory', 'skill', 'settings'].includes(change.area) || !['added', 'updated', 'removed'].includes(change.action)) continue;
                    const names = Array.isArray(change.names) ? change.names.filter(name => typeof name === 'string').slice(0, 10) : [];
                    const preview = Array.isArray(change.previews) ? change.previews.filter(value => typeof value === 'string').slice(0, 3).map(firstLine).join(t('、')) : '';
                    const labels = { user: { added: '新增关于你', updated: '更新了关于你', removed: '删掉了关于你' }, memory: { added: '新增长期记忆', updated: '更新了长期记忆', removed: '删掉了长期记忆' },
                        skill: { added: '新增技能', updated: '更新技能', removed: '删掉技能' }, settings: { added: '改了设置', updated: '改了设置', removed: '改了设置' } };
                    const detail = change.area === 'settings' ? fields(names) : change.area === 'skill' ? names.join(t('、')) :
                        [Number.isSafeInteger(change.count) && change.count > 0 ? t('{0} 条', change.count) : '', preview].filter(Boolean).join('：');
                    changes.push({ area: change.area, text: [t(labels[change.area][change.action]), detail].filter(Boolean).join(' · ') });
                }
                if (!changes.length) return null;
                const previous = sources.get(message.toolCallId);
                if (previous?.isConnected) return null;
                const source = node('span', 'pi-bot-change-source'); source.hidden = true;
                source._piBotChanges = changes;
                source._piBotOwner = { key: host.context(), profileId: host.profileId() };
                source._piBotReceiptRow = row;
                source.dataset.readingKey = `bot-change:${message.toolCallId}`;
                sources.set(message.toolCallId, source); return source;
            },
            reset() { sources.clear(); },
            prune() { for (const [id, source] of sources) if (!source.isConnected) sources.delete(id); }
        };
    }

    function arrangeReceipts(region) {
        const sources = region.nodes.filter(item => item.matches('.pi-bot-change-source'));
        const user = region.nodes.find(boundary);
        if (!user) return;
        // Keep result nodes directly in the transcript: incremental message reuse owns those nodes.
        const cards = region.nodes.filter(item => item.matches('.pi-bot-schedule-receipt, .pi-bot-topic-receipt, .pi-delivery-receipt'));
        const ordinary = region.nodes.filter(item => !item.matches(RECEIPTS));
        let last = ordinary.at(-1) || user;
        for (const card of cards) { if (last.nextElementSibling !== card) last.after(card); last = card; }
        if (!sources.length && !region.nodes.some(item => item.matches('.pi-bot-turn-receipts, .pi-memory-hints'))) return;
        const group = receiptGroup(user);
        const signature = JSON.stringify(sources.map(source => source._piBotChanges));
        if (group.dataset.signature !== signature) {
            group.querySelectorAll('.pi-bot-change-receipt').forEach(item => item.remove());
            let count = 0, preview = '', noteSource = null;
            const rows = [];
            for (const source of sources) for (const change of source._piBotChanges) {
                if (change.area === 'notebook') { count += change.count; preview ||= change.preview; noteSource ||= source; }
                else rows.push(source._piBotReceiptRow(change.area, change.text, source._piBotOwner));
            }
            if (count) rows.unshift(noteSource._piBotReceiptRow('notebook', t('记在“我记着的事” · {0} 件', count) + (preview ? ` · ${preview}` : ''), noteSource._piBotOwner));
            group.prepend(...rows); group.dataset.signature = signature;
        }
    }

    function refresh(view, region) {
        const nodes = region.nodes.filter(item => !boundary(item) && !item.matches(RECEIPTS));
        const active = view.tailActive && region.boundary === view.boundary(view.content.lastElementChild);
        // Only the last assistant can be the answer. Once it calls a tool its text becomes commentary.
        const last = nodes.findLast(item => item.matches('.pi-message.assistant, .pi-tool-row, .pi-bash-message'));
        const terminal = last?._piAssistantMessage?.errorMessage || ['error', 'aborted'].includes(last?._piAssistantMessage?.stopReason);
        const final = last?.matches('.pi-message.assistant') && (terminal || !last.querySelector('.pi-tool-row'))
            && last.querySelector('.pi-markdown:not(:empty), .pi-inline-error, .pi-inline-stopped, .pi-message-image') ? last : null;
        const members = nodes.filter(item => item !== final && item.matches('.pi-message.assistant, .pi-message.custom, .pi-tool-row, .pi-bash-message, .pi-turn-edits, .pi-runtime-notice, .pi-event-notice, .pi-process-group'));
        const tail = final ? [...final.querySelectorAll('.pi-thinking-block, .pi-tool-row')] : [];
        const tools = all(nodes, '.pi-tool-row, .pi-bash-message');
        const thinking = all(nodes, '.pi-thinking-block');
        const finalMessage = final?._piAssistantMessage;
        const failed = !active && Boolean(finalMessage?.errorMessage || ['error', 'aborted'].includes(finalMessage?.stopReason));
        for (const article of region.nodes.filter(item => item.matches('.pi-message.assistant'))) {
            article.classList.toggle('pi-bot-process-message', article !== final);
            article.classList.toggle('pi-bot-final-with-thinking', article === final && tail.length > 0);
        }
        for (const block of thinking) block.querySelector('summary > span').textContent = t('想了想');
        for (const tool of tools) {
            window.PiToolLabels?.update(tool);
            tool.dataset.botOutcome = tool.dataset.botDenied ? 'denied' : tool.dataset.state === 'error' ? (failed ? 'failed' : 'continued') : tool.dataset.state || 'pending';
        }
        const groups = new Map();
        if (members.length || tail.length) {
            const key = `bot-turn:${region.id}`;
            let group = region.turnGroups.get(key);
            if (!group?.element.isConnected) {
                const element = node('details', 'pi-turn-group pi-bot-process-line'); element.dataset.detailKey = key;
                element.open = region.disclosures.get(key) || false; region.disclosures.delete(key);
                element.innerHTML = '<summary><i class="fa-solid fa-chevron-right" aria-hidden="true"></i><span class="pi-turn-label"></span><span class="pi-turn-status"></span></summary>';
                element.addEventListener('toggle', () => { const position = view.scroll.capture({ details: false }); view.refreshVisibility(group.region); view.scroll.restore(position); });
                group = { element };
            }
            group.members = members; group.tail = tail;
            const anchor = members[0] || final;
            if (anchor.previousElementSibling !== group.element) anchor.before(group.element);
            for (const member of [...members, ...tail]) { member.dataset.turnKey = key; member.id ||= `pi-turn-item-${++view.nextControlId}`; }
            const start = view.nodeTime(region.boundary) ?? view.nodeTime(nodes[0]);
            const end = active ? Date.now() : view.nodeTime(final || nodes.at(-1));
            const duration = start != null && end != null && end > start ? t('用时 {0}', view.formatDuration(end - start)) : '';
            const notes = tools.filter(tool => tool.dataset.toolName === 'window_note' && tool.dataset.state === 'done')
                .reduce((count, tool) => count + (tool._piResult?.details?.pivaneNoteSaved?.ids?.length || 1), 0);
            const activity = view.botActivity?.();
            const transition = all(members, '.pi-message-body > .pi-markdown').map(item => firstLine(item.innerText || item.textContent)).filter(Boolean).at(-1);
            const label = active ? [activity?.waiting() ? t('等你确认') : activity?.phase?.kind === 'retry' ? t('连接不太顺，正在重试')
                : transition || tools.at(-1)?.querySelector('summary > strong')?.textContent || t('正在思考'), duration].filter(Boolean).join(' · ')
                : [duration, tools.length ? t('{0} 个步骤', tools.length) : '', notes ? t('记下 {0} 件事', notes) : ''].filter(Boolean).join(' · ') || t('过程');
            group.element.querySelector('.pi-turn-label').textContent = label;
            group.element.querySelector('.pi-turn-status').textContent = failed ? t(finalMessage.stopReason === 'aborted' ? '回复已停止' : '回复失败') : '';
            group.element.classList.toggle('is-running', active);
            group.element.classList.toggle('has-error', failed);
            group.element.querySelector('summary').setAttribute('aria-controls', [...members, ...tail].map(item => item.id).join(' '));
            groups.set(key, group);
        }
        view.replaceGroups('turnGroups', region, groups);
        arrangeReceipts(region);
        if (region.boundary === view.boundary(view.content.lastElementChild)) view.content.classList.toggle('pi-bot-process-active', active && groups.size > 0);
    }

    function visibility(region) {
        for (const { element, members } of region.groups.values()) { element.hidden = true; for (const member of members) member.hidden = false; }
        for (const article of region.nodes.filter(item => item.matches('.pi-message.assistant'))) {
            article.classList.remove('pi-process-only');
            article.hidden = !article.querySelector('.pi-message-body')?.textContent.trim() && !article.querySelector('img, .pi-tool-row');
        }
        for (const { element, members, tail } of region.turnGroups.values()) {
            element.hidden = false;
            element.querySelector('summary').setAttribute('aria-expanded', String(element.open));
            for (const member of [...members, ...tail]) {
                if (member.matches('.pi-process-group')) continue;
                member.hidden = !element.open;
                if (member.hidden) member.dataset.turnHidden = '1'; else delete member.dataset.turnHidden;
            }
        }
    }
    window.PiBotTurns = Object.freeze({ createReceipts, receiptGroup, refresh, visibility });
})();
