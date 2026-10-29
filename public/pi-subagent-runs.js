(() => {
    const t = (text, ...values) => globalThis.PiI18n?.t ? globalThis.PiI18n.t(text, ...values) : text.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? '');
    const STATES = {
        queued: ['排队中', 'fa-regular fa-clock', 'active'], running: ['运行中', 'fa-solid fa-circle-notch', 'active'],
        paused: ['已暂停', 'fa-solid fa-pause', 'attention'], complete: ['已完成', 'fa-regular fa-circle-check', 'done'],
        partial: ['部分完成', 'fa-solid fa-circle-half-stroke', 'attention'], failed: ['失败', 'fa-solid fa-circle-exclamation', 'error'],
        stopped: ['已停止', 'fa-regular fa-circle-stop', 'muted'], rejected: ['未启动', 'fa-solid fa-ban', 'error']
    };
    const ACTIVE = new Set(['queued', 'running']);
    // Finished runs that need no decision fold under “已结束”.
    const ENDED = new Set(['complete', 'stopped']);
    const RESUMABLE = new Set(['paused', 'stopped', 'failed', 'partial', 'complete']);
    // Same wording as the composer's thinking selector.
    const THINKING = { off: '不启用', minimal: '极简', low: '低', medium: '中', high: '高', xhigh: '极高', max: '最大' };
    const HOST_KIND = { command: '命令', ci: 'CI', gate: '检查' };
    const VERDICT = { pass: ['通过', 'done'], fail: ['未通过', 'error'], inconclusive: ['无结论', 'attention'] };
    const COST_TTL_MS = 30000;
    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };
    const icon = className => { const node = el('i', className); node.setAttribute('aria-hidden', 'true'); return node; };
    const duration = ms => {
        const seconds = Math.max(0, Math.round(ms / 1000));
        if (seconds < 60) return t('{0} 秒', seconds);
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return t('{0} 分 {1} 秒', minutes, seconds % 60);
        return t('{0} 小时 {1} 分', Math.floor(minutes / 60), minutes % 60);
    };
    // Compact elapsed time for the right-hand column: 0:42, 12:49, 1:02:03.
    const clock = ms => {
        const total = Math.max(0, Math.floor(ms / 1000)), pad = value => String(value).padStart(2, '0');
        const hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60), seconds = total % 60;
        return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
    };
    const age = ms => {
        const seconds = Math.max(0, Math.round(ms / 1000));
        if (seconds < 60) return t('{0} 秒', seconds);
        const minutes = Math.floor(seconds / 60);
        return minutes < 60 ? t('{0} 分钟', minutes) : t('{0} 小时', Math.floor(minutes / 60));
    };
    const tokens = value => Number.isFinite(value) ? value >= 10000 ? `${(value / 1000).toFixed(1)}k` : String(value) : '—';
    const money = value => Number.isFinite(value) ? `$${value < 0.01 && value > 0 ? value.toFixed(4) : value.toFixed(2)}` : '—';
    const stateOf = state => STATES[state] || [state, 'fa-regular fa-circle', 'muted'];
    const roleName = agent => agent ? window.PiSubagentSettings?.roleName?.(agent) || agent : '';
    const lanes = run => (run.children || []).filter(child => child.kind !== 'host-step');
    // A single-agent run reports one step that repeats the run: show it on the run row.
    const solo = run => run.children?.length === 1 && run.children[0].kind === 'step' && !run.children[0].children?.length ? run.children[0] : null;
    function runTitle(run) {
        const list = lanes(run);
        if (list.length > 1) {
            const names = list.map(lane => lane.agent || lane.label);
            // “worker, worker, worker” says nothing; name the shape and count instead.
            if (names.every(name => name === names[0])) return run.kind === 'workflow'
                ? t('工作流 · {0} 个子任务', list.length) : t('{0} · {1} 个子任务', roleName(names[0]) || names[0], list.length);
        }
        return run.label;
    }
    function progress(run) {
        const list = lanes(run);
        return list.length > 1 ? { done: list.filter(lane => lane.state === 'complete').length, total: list.length } : null;
    }
    // Live text recomputed by the one-second clock while work runs.
    const live = (node, render) => { node.classList.add('sa-live'); node._piLive = render; return node; };

    class PiSubagentRuns {
        constructor(root, options) {
            this.root = root; this.options = options; this.epoch = 0; this.busy = false;
            root.innerHTML = '<summary><i class="fa-solid fa-people-group" aria-hidden="true"></i><strong></strong><span class="sa-runs-count" role="status" aria-live="polite"></span><span class="sa-runs-progress"></span><span class="sa-runs-keep" hidden><i class="sa-runs-keep-dot" aria-hidden="true"></i><span></span></span><i class="fa-solid fa-chevron-up sa-runs-chevron" aria-hidden="true"></i></summary>'
                + '<div class="sa-runs-body"><div class="sa-runs-list"></div><details class="sa-runs-ended" hidden><summary><i class="fa-solid fa-chevron-right" aria-hidden="true"></i><span></span></summary><div class="sa-runs-list"></div></details><div class="sa-runs-notes"></div><div class="sa-runs-footer"></div></div>';
            this.list = root.querySelector('.sa-runs-body > .sa-runs-list');
            this.ended = root.querySelector('.sa-runs-ended');
            this.endedList = this.ended.querySelector('.sa-runs-list');
            this.notes = root.querySelector('.sa-runs-notes');
            this.footer = root.querySelector('.sa-runs-footer');
            this.cards = new Map();
            this.costButton = this.action(el('button', 'sa-runs-cost-button'), () => this.showCost());
            this.costButton.append(icon('fa-solid fa-coins'), el('span', 'sa-cost-label'), el('span', 'sa-cost-total'));
            this.refreshButton = this.action(el('button', 'sa-runs-refresh'), () => this.refresh());
            this.refreshButton.append(icon('fa-solid fa-rotate'));
            this.footer.append(this.costButton, this.refreshButton);
            this.dialog = el('dialog', 'pi-native-dialog sa-runs-dialog');
            document.body.append(this.dialog);
            this.dialog.addEventListener('close', () => { this.dialog.replaceChildren(); this.returnFocus?.focus?.(); this.returnFocus = null; });
            root.addEventListener('toggle', () => { if (root.open) { this.render(); void this.loadCostSummary(); } else this.closeMenus(); });
            this.clock = setInterval(() => { if (!root.hidden && root.open && this.hasActive()) this.renderTimes(); }, 1000);
            this.reset();
        }
        reset() {
            this.epoch++; this.value = null; this.snapshot = null; this.background = null; this.busy = false;
            this.continued = new Map(); this.costSummary = null; this.costAt = 0; this.costLoading = false;
            this.root.hidden = true; this.root.open = false;
            this.cards.clear(); this.list.replaceChildren(); this.endedList.replaceChildren(); this.notes.replaceChildren();
            this.ended.hidden = true; this.ended.open = false;
            if (this.dialog.open) this.dialog.close();
        }
        hasActive() { return Boolean(this.snapshot?.runs.some(run => ACTIVE.has(run.state))); }
        current(id) { return this.snapshot?.runs.find(run => run.id === id) || null; }
        apply(value) {
            if (!value || typeof value !== 'object') return;
            const signature = JSON.stringify(value);
            if (signature === this.value) return;
            this.value = signature; this.snapshot = value.snapshot || null; this.background = value.background || null;
            this.render();
        }
        render() {
            const runs = this.snapshot?.runs || [];
            const keep = Boolean(this.background?.active);
            this.root.hidden = !runs.length && !keep;
            if (this.root.hidden) return;
            const active = runs.filter(run => ACTIVE.has(run.state));
            const attention = runs.filter(run => STATES[run.state]?.[2] === 'attention' || STATES[run.state]?.[2] === 'error').length;
            this.root.dataset.state = attention ? 'attention' : active.length ? 'active' : 'done';
            const summary = this.root.querySelector(':scope > summary');
            summary.querySelector('strong').textContent = t('子 Agent');
            this.root.querySelector('.sa-runs-count').textContent = attention
                ? [active.length ? t('{0} 个运行中', active.length) : '', t('{0} 个需处理', attention)].filter(Boolean).join(' · ')
                : active.length ? t('{0} 个运行中', active.length) : runs.length ? t('{0} 个已结束', runs.length) : t('后台工作进行中');
            let done = 0, total = 0;
            for (const run of active) { const value = progress(run); if (value) { done += value.done; total += value.total; } }
            const progressNode = this.root.querySelector('.sa-runs-progress');
            progressNode.textContent = total ? `${done}/${total}` : '';
            progressNode.title = total ? t('运行中工作流的子任务：已完成 {0} / 共 {1}', done, total) : '';
            // The retention badge only stands in for runs the plugin has not reported.
            const keepText = t('后台子 Agent 未结束，OhMyBuddy 会保留此会话，以便结果返回后主 Agent 自动继续。');
            const keepBadge = this.root.querySelector('.sa-runs-keep');
            keepBadge.hidden = !keep || runs.length > 0; keepBadge.querySelector('span').textContent = t('会话保持中'); keepBadge.title = keepText;
            summary.title = keep && runs.length ? keepText : '';
            if (!this.root.open) return;
            this.renderRuns(runs);
            this.renderFooter();
            this.renderTimes();
        }
        renderRuns(runs) {
            const seen = new Set(), open = [], ended = [];
            for (const run of runs) {
                seen.add(run.id);
                let card = this.cards.get(run.id);
                if (!card) { card = this.card(run.id); this.cards.set(run.id, card); }
                this.update(card, run);
                (ENDED.has(run.state) ? ended : open).push(card);
            }
            for (const [id, card] of this.cards) if (!seen.has(id)) { card.remove(); this.cards.delete(id); }
            this.place(this.list, open); this.place(this.endedList, ended);
            this.ended.hidden = !ended.length;
            this.ended.querySelector('summary span').textContent = t('已结束 {0}', ended.length);
            const notes = [];
            if (!runs.length) notes.push(t('后台工作尚未提供运行详情。'));
            if (this.snapshot?.omitted?.runs) notes.push(t('另有 {0} 个运行未显示。', this.snapshot.omitted.runs));
            if (this.snapshot?.omitted?.children) notes.push(t('另有 {0} 个子任务未显示。', this.snapshot.omitted.children));
            this.notes.replaceChildren(...notes.map(text => el('p', 'sa-runs-empty', text)));
        }
        // Reorder only when needed: moving a node that holds focus would blur it.
        place(container, cards) {
            cards.forEach((card, index) => { if (container.children[index] !== card) container.insertBefore(card, container.children[index] || null); });
            for (const node of [...container.children].slice(cards.length)) if (!cards.includes(node)) node.remove();
        }
        card(id) {
            const card = el('article', 'sa-run'); card.dataset.runId = id;
            const head = el('div', 'sa-run-head');
            const state = el('span', 'sa-run-state'); state.append(icon(''), el('span', 'sa-run-state-label'));
            const title = el('strong', 'sa-run-title');
            const progressNode = el('span', 'sa-run-progress');
            const time = el('span', 'sa-run-time');
            const menu = el('button', 'sa-run-menu'); menu.type = 'button';
            menu.append(icon('fa-solid fa-ellipsis'));
            menu.setAttribute('aria-label', t('更多操作')); menu.title = t('更多操作');
            menu.setAttribute('aria-expanded', 'false');
            const actions = el('div', 'sa-run-actions'); actions.hidden = true;
            actions.id = `sa-run-actions-${Math.random().toString(36).slice(2)}`; menu.setAttribute('aria-controls', actions.id);
            menu.addEventListener('click', () => this.toggleMenu(card, actions.hidden));
            card.addEventListener('keydown', event => {
                if (event.key !== 'Escape' || event.isComposing || actions.hidden) return;
                event.preventDefault(); event.stopPropagation();
                this.toggleMenu(card, false); menu.focus();
            });
            head.append(state, title, progressNode, time, menu);
            const body = el('div', 'sa-run-body');
            card.append(head, actions, body);
            card._parts = { state, title, progress: progressNode, time, menu, actions, body };
            return card;
        }
        toggleMenu(card, open) {
            if (open) this.closeMenus(card);
            card._parts.actions.hidden = !open;
            card._parts.menu.setAttribute('aria-expanded', String(open));
        }
        closeMenus(except = null) { for (const card of this.cards.values()) if (card !== except && !card._parts.actions.hidden) this.toggleMenu(card, false); }
        update(card, run) {
            const [label, iconClass, tone] = stateOf(run.state);
            const parts = card._parts;
            card.dataset.tone = tone;
            parts.state.firstChild.className = iconClass;
            parts.state.title = t(label);
            parts.state.lastChild.textContent = t(label);
            const title = runTitle(run);
            parts.title.textContent = title; parts.title.title = title === run.label ? run.label : `${title}\n${run.label}`;
            const value = progress(run);
            parts.progress.textContent = value ? `${value.done}/${value.total}` : '';
            parts.progress.hidden = !value;
            if (run.startedAt) live(parts.time, now => {
                const end = ACTIVE.has(run.state) ? now : run.endedAt || run.updatedAt || now;
                parts.time.title = duration(end - run.startedAt);
                return clock(end - run.startedAt);
            }); else { parts.time.classList.remove('sa-live'); parts.time.textContent = ''; }
            this.menu(card, run);
            const signature = JSON.stringify([run, this.continued.get(run.id) || null]);
            if (parts.body.dataset.signature !== signature) {
                parts.body.dataset.signature = signature;
                parts.body.replaceChildren(...this.body(run));
            }
        }
        menu(card, run) {
            const kind = ACTIVE.has(run.state) ? 'active' : RESUMABLE.has(run.state) ? 'resume' : '';
            const { menu, actions } = card._parts;
            menu.hidden = !kind;
            if (actions.dataset.kind === kind) return;
            actions.dataset.kind = kind;
            this.toggleMenu(card, false);
            const item = (text, iconClass, handler, danger) => {
                const button = this.action(el('button', 'sa-run-button' + (danger ? ' danger' : '')), handler, () => { this.toggleMenu(card, false); menu.focus(); });
                button.append(icon(iconClass), el('span', '', text));
                return button;
            };
            const id = run.id;
            if (kind === 'active') actions.replaceChildren(
                item(t('引导'), 'fa-regular fa-comment-dots', () => this.message(id, 'steer')),
                item(t('停止'), 'fa-regular fa-circle-stop', () => this.stop(id), true));
            else if (kind === 'resume') actions.replaceChildren(item(t('继续'), 'fa-solid fa-play', () => this.message(id, 'resume')));
            else actions.replaceChildren();
        }
        body(run) {
            const lead = solo(run);
            const source = lead ? { state: run.state, agent: lead.agent, model: lead.model, thinking: lead.thinking, hostStep: lead.hostStep,
                activity: { ...(run.activity || {}), ...(lead.activity || {}) } } : { state: run.state, activity: run.activity };
            const meta = this.meta(source, { counts: true, continued: this.continued.get(run.id),
                workflow: run.kind === 'workflow' && runTitle(run) === run.label });
            const nodes = [];
            if (meta.childNodes.length) { meta.classList.add('sa-run-meta'); nodes.push(meta); }
            if (!lead && run.children?.length) {
                const list = el('ul', 'sa-run-children');
                for (const child of run.children) list.append(this.row(child, 0));
                nodes.push(list);
            }
            return nodes;
        }
        // One line: role · model · thinking · current activity · host result · counts.
        meta(source, { counts = false, continued = '', workflow = false } = {}) {
            const parts = [];
            if (workflow) parts.push(el('span', '', t('工作流')));
            const role = roleName(source.agent);
            if (role) { const node = el('span', 'sa-meta-role', role); node.title = source.agent; parts.push(node); }
            if (source.model) { const node = el('code', 'sa-meta-model', source.model.split('/').pop()); node.title = source.model; parts.push(node); }
            if (source.thinking) parts.push(el('span', 'sa-meta-thinking', t('思考 {0}', t(THINKING[source.thinking] || source.thinking))));
            const activity = source.activity || {};
            if (ACTIVE.has(source.state)) {
                if (activity.state === 'needs_attention') {
                    const node = el('span', 'sa-meta-stall', t('需要关注'));
                    if (activity.lastActivityAt) live(node, now => t('{0}无活动', age(now - activity.lastActivityAt)));
                    parts.push(node);
                } else if (activity.state === 'active_long_running') parts.push(el('span', 'sa-meta-long', t('长时间运行')));
                if (activity.currentTool) {
                    const node = el('span', 'sa-meta-tool', t('正在使用 {0}', activity.currentTool));
                    if (activity.currentToolStartedAt) live(node, now => t('正在 {0} · {1}', activity.currentTool, age(now - activity.currentToolStartedAt)));
                    parts.push(node);
                }
            }
            const host = source.hostStep;
            if (host) {
                parts.push(el('span', '', t(HOST_KIND[host.kind] || host.kind)));
                if (host.verdict && VERDICT[host.verdict]) { const node = el('span', 'sa-meta-verdict', t(VERDICT[host.verdict][0])); node.dataset.tone = VERDICT[host.verdict][1]; parts.push(node); }
                if (host.stale) parts.push(el('span', 'sa-meta-stall', t('结果已过期')));
                if (host.detail) { const node = el('span', 'sa-meta-detail', host.detail); node.title = host.detail; parts.push(node); }
            }
            if (continued) parts.push(el('span', '', t('继续自 {0}', continued)));
            if (counts) {
                if (Number.isInteger(activity.turnCount)) parts.push(el('span', 'sa-meta-count', t('{0} 轮', activity.turnCount)));
                if (Number.isInteger(activity.toolCount)) parts.push(el('span', 'sa-meta-count', t('{0} 次工具', activity.toolCount)));
            }
            const box = el('span', 'sa-meta');
            parts.forEach((part, index) => { if (index) box.append(el('span', 'sa-meta-sep', ' · ')); box.append(part); });
            if (parts.some(part => part.classList.contains('sa-meta-stall'))) box.dataset.stalled = 'true';
            return box;
        }
        row(node, depth) {
            const [label, iconClass, tone] = stateOf(node.state);
            const row = el('li'); row.dataset.tone = tone;
            const mark = icon(iconClass); mark.title = t(label);
            const main = el('span', 'sa-child-main');
            const name = el('span', 'sa-child-label', node.label); name.title = node.label;
            main.append(name);
            const meta = this.meta(node);
            if (meta.childNodes.length) { meta.classList.add('sa-child-meta'); main.append(meta); if (meta.dataset.stalled) row.dataset.stalled = 'true'; }
            const time = el('span', 'sa-child-time');
            if (node.startedAt) live(time, now => {
                const end = ACTIVE.has(node.state) ? now : node.endedAt || node.updatedAt || now;
                time.title = `${t(label)} · ${duration(end - node.startedAt)}`;
                return clock(end - node.startedAt);
            }); else time.textContent = t(label);
            // Without a start time the right column already names the state.
            row.append(mark, ...(node.startedAt ? [el('span', 'sa-sr', t(label))] : []), main, time);
            if (depth < 2 && node.children?.length) {
                const list = el('ul', 'sa-run-children');
                for (const child of node.children) list.append(this.row(child, depth + 1));
                row.append(list);
            }
            return row;
        }
        renderTimes() {
            const now = Date.now();
            for (const node of this.root.querySelectorAll('.sa-live')) if (node._piLive) node.textContent = node._piLive(now);
        }
        renderFooter() {
            this.costButton.querySelector('.sa-cost-label').textContent = t('用量与费用');
            const cost = this.costSummary?.childTotal?.cost;
            this.costButton.querySelector('.sa-cost-total').textContent = Number.isFinite(cost)
                ? t(this.costSummary.unresolvedAsyncChildren ? '子 Agent 至少 {0}' : '子 Agent 约 {0}', money(cost)) : '';
            this.refreshButton.setAttribute('aria-label', t('刷新状态')); this.refreshButton.title = t('刷新状态');
            this.syncDisabled();
        }
        syncDisabled() {
            const disabled = this.busy || !this.options.connected();
            for (const button of this.root.querySelectorAll('[data-sa-action]')) button.disabled = disabled;
        }
        action(button, handler, before) {
            button.type = 'button'; button.dataset.saAction = '';
            button.disabled = this.busy || !this.options.connected();
            button.addEventListener('click', async () => {
                if (this.busy) return;
                before?.();
                const epoch = this.epoch; this.busy = true; this.syncDisabled();
                try { await handler(button); }
                catch (error) { if (epoch === this.epoch) this.options.toast(error.message || t('子 Agent 操作失败'), 'error'); }
                finally { if (epoch === this.epoch) { this.busy = false; this.render(); this.syncDisabled(); } }
            });
            return button;
        }
        async request(method, params, timeoutMs = 60000) {
            const epoch = this.epoch;
            const data = await this.options.request(method, params, timeoutMs);
            if (epoch !== this.epoch) throw Object.assign(new Error(t('会话已切换')), { stale: true });
            return data;
        }
        async refresh() {
            const data = await this.request('status', {});
            if (data?.snapshot) { this.snapshot = data.snapshot; this.value = null; }
            this.costAt = 0; void this.loadCostSummary();
            this.options.toast(t('已刷新子 Agent 状态'), 'success');
        }
        // One read per panel opening at most every 30 s; never on a timer.
        async loadCostSummary() {
            if (this.costLoading || (this.costAt && Date.now() - this.costAt < COST_TTL_MS) || !this.options.connected()) return;
            const epoch = this.epoch; this.costLoading = true;
            try {
                const data = await this.options.request('cost', {}, 30000);
                if (epoch === this.epoch) this.costSummary = data?.cost || null;
            } catch { if (epoch === this.epoch) this.costSummary = null; }
            finally { if (epoch === this.epoch) { this.costLoading = false; this.costAt = Date.now(); if (this.root.open) this.renderFooter(); } }
        }
        openDialog(title, content, actions = []) {
            this.returnFocus = document.activeElement;
            const heading = el('div', 'pi-native-heading'); heading.append(el('strong', '', title));
            const close = el('button', '', t('关闭')); close.type = 'button'; close.addEventListener('click', () => this.dialog.close());
            heading.append(close);
            const body = el('div', 'pi-native-body sa-runs-dialog-body'); body.append(...content);
            const footer = el('div', 'sa-runs-dialog-actions'); footer.append(...actions);
            this.dialog.replaceChildren(heading, body, footer);
            this.dialog.showModal();
        }
        async confirmStop(run) {
            const message = t('已完成的步骤会保留，进行中的工作会被中断。');
            const dialog = window.PiProfileDialog;
            if (!dialog?.confirm) return window.confirm(`${t('停止“{0}”？', runTitle(run))}\n${message}`);
            return dialog.confirm({ title: t('停止“{0}”？', runTitle(run)), message, accept: t('停止'), cancelLabel: t('取消') });
        }
        async stop(id) {
            const run = this.current(id);
            if (!run || !await this.confirmStop(run)) return;
            const data = await this.request('stop', { id });
            this.options.toast(data?.state === 'stopping' ? t('已请求停止，状态更新后会显示在这里') : t('已发送停止请求'), 'success');
        }
        message(id, method) {
            const run = this.current(id);
            if (!run) return;
            const steer = method === 'steer', name = runTitle(run);
            const label = el('label', 'sa-runs-field');
            label.append(el('span', '', steer ? t('要告诉子 Agent 的内容') : t('继续时的说明')));
            const input = el('textarea'); input.rows = 4; input.maxLength = 8000; input.required = true;
            input.placeholder = steer ? t('例如：优先检查登录流程，不需要修改测试') : t('例如：根据刚才的结果继续完成剩余部分');
            label.append(input);
            const content = [label];
            let mode;
            if (steer) {
                const field = el('label', 'sa-runs-field'); field.append(el('span', '', t('送达时机')));
                mode = el('select');
                mode.append(new Option(t('尽快送达（当前工具执行后）'), 'steer'), new Option(t('当前任务完成后再处理'), 'follow_up'));
                field.append(mode); content.push(field);
            } else content.push(el('p', 'pi-native-help', t('继续会在原运行的基础上新开一轮，使用它原来的模型和权限。')));
            const submit = el('button', 'primary', steer ? t('发送引导') : t('继续运行')); submit.type = 'button';
            submit.addEventListener('click', async () => {
                const text = input.value.trim();
                if (!text) { input.focus(); return; }
                const epoch = this.epoch;
                submit.disabled = true; input.disabled = true;
                try {
                    const data = await this.request(method, steer ? { id, message: text, mode: mode.value } : { id, message: text });
                    if (data?.isError) throw new Error(data.text || t('子 Agent 操作失败'));
                    this.dialog.close();
                    if (steer) {
                        // Report the plugin's acknowledgement; a queued message is not yet delivered.
                        if (data?.delivery === 'delivered') this.options.toast(t('引导已送达子 Agent'), 'success');
                        else if (data?.delivery === 'queued') this.options.toast(t('引导已排队，尚未确认送达子 Agent'), 'info');
                        else this.options.toast(t('引导已提交，未收到送达确认；可刷新状态核对'), 'info');
                    } else if (data?.runId) {
                        this.continued.set(data.runId, name);
                        this.options.toast(t('已继续运行，新运行 {0}', data.runId), 'success');
                        this.render();
                    } else this.options.toast(t('已请求继续运行'), 'success');
                } catch (error) {
                    if (epoch === this.epoch) { submit.disabled = false; input.disabled = false; this.options.toast(error.message, 'error'); }
                }
            });
            this.openDialog(steer ? t('引导 · {0}', name) : t('继续 · {0}', name), content, [submit]);
            input.focus();
        }
        async showCost() {
            const { cost } = await this.request('cost', {});
            if (!cost) throw new Error(t('当前 pi-subagents 版本不提供用量数据'));
            this.costSummary = cost; this.costAt = Date.now(); this.renderFooter();
            const table = el('table', 'sa-runs-cost');
            const head = el('tr'); for (const text of [t('来源'), t('输入'), t('输出'), t('费用')]) head.append(el('th', '', text));
            table.append(head);
            const row = (name, usage, className) => {
                const tr = el('tr', className);
                tr.append(el('td', '', name), el('td', '', tokens(usage?.input)), el('td', '', tokens(usage?.output)), el('td', '', money(usage?.cost)));
                table.append(tr);
            };
            row(t('主 Agent'), cost.parent);
            for (const child of cost.children) row(child.agent ? `${child.label} · ${child.agent}` : child.label, child.usage);
            row(t('子 Agent 合计'), cost.childTotal, 'sum');
            row(t('总计'), cost.total, 'sum');
            const content = [el('p', 'pi-native-help', t('统计当前会话分支中主 Agent 与子 Agent 报告的用量；费用按模型价格估算。'))];
            if (cost.unresolvedAsyncChildren) content.push(el('p', 'pi-native-help warning', t('另有 {0} 个后台子 Agent 的用量未能读取，合计可能偏低。', cost.unresolvedAsyncChildren)));
            const wrap = el('div', 'sa-runs-cost-wrap'); wrap.append(table); content.push(wrap);
            this.openDialog(t('子 Agent 用量与费用'), content);
        }
    }
    window.PiSubagentRuns = PiSubagentRuns;
})();
