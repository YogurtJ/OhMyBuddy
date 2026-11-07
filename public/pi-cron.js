/* Scheduled tasks: the server owns schedules, budgets and native execution. */
(() => {
    const t = (s, ...args) => globalThis.PiI18n?.t(s, ...args) || s;
    // Web Crypto randomUUID is unavailable on ordinary HTTP LAN origins.
    function randomId() {
        if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
        const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
    const notificationMode = job => job.weixinNotification || (job.notifyWeixin ? 'on' : 'inherit');
    const notificationNames = { inherit: '跟随线程的微信接收设置', on: '推送至已绑定微信', off: '不发送微信通知' };
    const statusNames = { waiting: '等待线程空闲', dispatching: '正在提交', running: '运行中', completed: '已完成', silent: '静默完成',
        skipped: '已跳过', failed: '执行失败', error: '执行失败', stopped: '已停止', cancelled: '已取消', uncertain: '需要核对' };
    const date = (value, zone) => value ? new Intl.DateTimeFormat(globalThis.PiI18n?.locale || 'zh-CN',
        { timeZone: zone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value) : '—';
    function create({ api, currentCwd, activate = true }) {
        const root = document.getElementById('cron-tab'); if (!root) return;
        let snapshot = null, profiles = [], projects = [], selected = '', draft = null, dirty = false, busy = false, visible = false, epoch = 0, query = '', filterProfile = '';
        let runRequest = null, previewEpoch = 0, projectsPromise = null, listView = 'current';
        const pickers = window.PiCronPickers;
        async function getProjects() {
            if (!projectsPromise) projectsPromise = api('/api/pi/projects').then(data => {
                const hidden = new Set(data.hiddenProjects || []);
                projects = (data.projects || []).filter(p => p?.cwd && !hidden.has(p.cwd)); return projects;
            }).catch(error => { projectsPromise = null; throw error; });
            return projectsPromise;
        }
        const activeRun = job => job.activeRun || (['waiting', 'dispatching', 'running', 'uncertain'].includes(job.lastRun?.status) ? job.lastRun : null);
        const ended = job => job.schedule.kind === 'once' && !activeRun(job) && (job.nextAt === null || !job.enabled && job.schedule.at <= (snapshot?.serverTime || Date.now()));
        function scheduleText(job) {
            if (job.schedule.kind === 'once') return `${t('仅一次')} · ${date(job.schedule.at, job.schedule.timeZone)}`;
            const [m, h, day, month, week] = job.schedule.expression.split(' ');
            if (/^\d+$/.test(m) && /^\d+$/.test(h) && day === '*' && month === '*' && ['*', '1-5'].includes(week)) return `${t(week === '*' ? '每天' : '工作日')} ${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
            if (/^\d+$/.test(m) && /^\d+$/.test(h) && day === '*' && month === '*' && /^[0-7]$/.test(week)) return `${t('每周')} ${t(['周日', '周一', '周二', '周三', '周四', '周五', '周六'][Number(week) % 7])} ${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
            return `${t('重复任务')} · ${job.schedule.expression}`;
        }
        const header = node('header', 'cron-header'), heading = node('div');
        heading.append(node('span', 'cron-eyebrow', 'OHMYBUDDY'), node('h1', '', t('定时任务')), node('p', '', t('让日常安排，准时回到对话里。')));
        const actions = node('div', 'cron-actions');
        const button = (label, icon, action, cls = '') => {
            const b = node('button', `cron-button ${cls}`); b.type = 'button';
            if (icon) { const i = node('i', `fa-solid ${icon}`); i.setAttribute('aria-hidden', 'true'); b.append(i); }
            b.append(document.createTextNode(t(label))); b.onclick = () => { if (busy) return; return Promise.resolve(action(b)).catch(error => message(error.message, true)); }; return b;
        };
        actions.append(button('主线程', 'fa-house', openHomes), button('全局设置', 'fa-sliders', openBudget), button('刷新', 'fa-rotate', () => load()), button('新建任务', 'fa-plus', () => edit(), 'primary'));
        header.append(heading, actions);
        const notice = node('p', 'cron-notice'); notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
        const stats = node('div', 'cron-stats'), layout = node('div', 'cron-layout'), aside = node('aside', 'cron-sidebar');
        const search = node('input', 'cron-search'); search.type = 'search'; search.placeholder = t('搜索定时任务'); search.setAttribute('aria-label', t('搜索定时任务'));
        const list = node('div', 'cron-list'); list.setAttribute('aria-label', t('定时任务'));
        const listTabs = node('div', 'cron-list-tabs'); listTabs.setAttribute('aria-label', t('任务视图'));
        const listHint = node('p', 'cron-list-hint');
        aside.append(search, listTabs, listHint, list); const detail = node('section', 'cron-detail'); layout.append(aside, detail); root.append(header, notice, stats, layout);
        function message(text = '', error = false) { notice.textContent = text; notice.classList.toggle('error', error); }
        function showDetail() { root.classList.add('cron-has-detail'); }
        function field(parent, label, type, value, options = {}) {
            const wrap = node('label', 'cron-field'), text = node('span', '', t(label));
            const control = node(type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input');
            control.setAttribute('aria-label', t(label));
            if (!['textarea', 'select'].includes(type)) control.type = type;
            if (options.choices) for (const [key, title] of options.choices) { const option = node('option', '', title); option.value = key; control.append(option); }
            if (type === 'checkbox') control.checked = Boolean(value); else control.value = value ?? '';
            for (const key of ['min', 'max', 'step', 'maxLength', 'required', 'placeholder']) if (options[key] !== undefined) control[key] = options[key];
            wrap.append(text, control); if (options.hint) wrap.append(node('small', '', t(options.hint)));
            parent.append(wrap); return control;
        }
        const optionalValue = control => control.value === '' ? null : Number(control.value);
        const quota = (parent, label, value, options = {}) => field(parent, label, 'number', value, { placeholder: t('不限制'), ...options });
        const defaults = mode => snapshot.capabilities?.defaults?.[mode] || { maxCalls: null, maxTokens: null,
            maxCost: null, maxDurationSeconds: 21600, maxIdleSeconds: 900, maxRepeatedErrors: 5 };
        const unlimited = value => value == null ? t('不限制') : Number(value).toLocaleString();
        const confirm = (title, text, accept) => window.PiProfileDialog.confirm({ title: t(title), message: t(text), accept: t(accept), cancelLabel: t('取消') });
        async function leave() { return !dirty || await confirm('有未保存的修改', '放弃当前修改并继续？', '放弃修改'); }
        async function mutate(b, operation) {
            if (busy) return; busy = true;
            const controls = [...root.querySelectorAll('button,input,select,textarea')].map(control => [control, control.disabled]);
            const done = window.PiActionFeedback?.begin(b, t('正在保存…')) || (() => {});
            for (const [control] of controls) control.disabled = true;
            try { const result = await operation(); message(t('已保存')); return result; }
            catch (error) { message(error.message, true); throw error; }
            finally { busy = false; done(); for (const [control, disabled] of controls) control.disabled = disabled; }
        }
        const send = (url, body, method = 'POST') => api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        function loading() {
            stats.replaceChildren(); list.replaceChildren(); detail.replaceChildren();
            const summary = node('div', 'cron-stat cron-placeholder'); summary.append(node('span', '', t('正在读取定时任务…'))); stats.append(summary);
            list.append(node('p', 'cron-muted', t('正在读取定时任务…')));
            const placeholder = node('div', 'cron-loading'); placeholder.setAttribute('role', 'status'); placeholder.setAttribute('aria-live', 'polite');
            placeholder.append(node('i', 'fa-solid fa-calendar-days'), node('h2', '', t('正在读取定时任务…')),
                node('p', '', t('正在确认任务、主线程和预算。')));
            for (let i = 0; i < 3; i++) placeholder.append(node('div', 'cron-loading-line'));
            detail.append(placeholder);
            if (window.PiSkeleton) {
                stats.innerHTML = window.PiSkeleton.html('lines', { rows: 3, label: t('正在读取定时任务…') });
                list.innerHTML = window.PiSkeleton.html('list', { rows: 4, label: t('正在读取定时任务…') });
                detail.innerHTML = window.PiSkeleton.html('lines', { rows: 6, label: t('正在读取定时任务…') });
            }
        }
        async function load() {
            const version = ++epoch;
            if (!snapshot && !draft) { message(); loading(); }
            void getProjects().catch(() => {});
            try {
                const [data, profileData] = await Promise.all([api('/api/pi/cron'), api('/api/pi/profiles')]);
                if (version !== epoch || !visible) return;
                snapshot = data; profiles = profileData.profiles;
                if (data.schedulerError) message(data.schedulerError, true);
                else if (data.channelNotifications?.pending || data.channelNotifications?.failed) {
                    const notice = data.channelNotifications;
                    message(`${t('微信通知待处理')} ${notice.pending || 0} · ${t('无法建立通知')} ${notice.failed || 0}`, Boolean(notice.lastError));
                } else message();
                renderList(); if (!draft) await renderDetail();
            } catch (error) {
                if (version !== epoch || !visible) return;
                message(error.message, true);
                if (!snapshot && !draft) {
                    stats.replaceChildren(); list.replaceChildren(); detail.replaceChildren();
                    detail.append(node('h2', '', t('定时任务暂时无法读取')), node('p', 'cron-muted', error.message),
                        button('重试读取', 'fa-rotate', () => load(), 'primary'));
                }
            }
        }
        function renderList() {
            if (!snapshot) return;
            stats.replaceChildren();
            const enabled = snapshot.jobs.filter(job => job.enabled && !ended(job)).length;
            const attention = snapshot.jobs.filter(job => activeRun(job)?.status === 'uncertain').length;
            for (const [label, value] of [['计划中', enabled], ['今日执行', snapshot.limits.maxRunsPerDay == null ? snapshot.today.runs : `${snapshot.today.runs} / ${snapshot.limits.maxRunsPerDay}`], ['待核对', attention]]) {
                const item = node('div', 'cron-stat'); item.append(node('span', '', t(label)), node('strong', '', String(value))); stats.append(item);
            }
            const scrollTop = list.scrollTop;
            list.replaceChildren(); listTabs.replaceChildren();
            const scoped = snapshot.jobs.filter(job => !filterProfile || job.target.profileId === filterProfile);
            for (const [key, label] of [['current', '当前任务'], ['history', '历史任务']]) {
                const count = scoped.filter(job => ended(job) === (key === 'history')).length;
                const tab = button('', null, () => { listView = key; query = search.value = ''; renderList(); });
                tab.append(node('span', '', t(label)), node('span', 'cron-tab-count', String(count))); tab.setAttribute('aria-pressed', String(listView === key)); listTabs.append(tab);
            }
            listHint.textContent = t(query.trim() ? '搜索包含当前任务与历史任务。' : listView === 'history' ? '已结束的单次安排保留在这里，包括失败记录。' : '重复任务与待执行的单次安排。');
            const jobs = scoped.filter(job => `${job.name} ${job.prompt} ${job.target.cwd || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
                && (query.trim() || ended(job) === (listView === 'history')));
            if (filterProfile) list.append(button('显示全部任务', 'fa-filter-circle-xmark', () => { filterProfile = ''; renderList(); }));
            const groups = [
                ['正在进行', jobs.filter(job => activeRun(job))],
                ['重复任务', jobs.filter(job => !activeRun(job) && !ended(job) && job.enabled && job.schedule.kind === 'cron')],
                ['单次安排', jobs.filter(job => !activeRun(job) && !ended(job) && job.enabled && job.schedule.kind === 'once')],
                ['已暂停', jobs.filter(job => !activeRun(job) && !ended(job) && !job.enabled)],
                ['历史任务', jobs.filter(ended)]
            ];
            for (const [label, entries] of groups) {
                if (!entries.length) continue;
                entries.sort((a, b) => label === '历史任务' ? (b.lastRun?.completedAt || b.schedule.at) - (a.lastRun?.completedAt || a.schedule.at) : (a.nextAt || Infinity) - (b.nextAt || Infinity));
                const group = node('section', 'cron-list-group'); group.append(node('h3', '', `${t(label)} · ${entries.length}`)); list.append(group);
                for (const job of entries) {
                    const row = button('', null, async () => { if (!await leave()) return; draft = null; dirty = false; selected = job.id; renderList(); await renderDetail(); }, 'cron-row');
                    row.setAttribute('aria-current', selected === job.id ? 'true' : 'false'); row.title = job.name; row.replaceChildren();
                    const top = node('span', 'cron-row-top'), icon = node('i', `fa-solid ${job.schedule.kind === 'once' ? 'fa-calendar-day' : 'fa-repeat'}`); icon.setAttribute('aria-hidden', 'true');
                    top.append(icon, node('strong', '', job.name));
                    const target = job.target.kind === 'profile' ? profiles.find(p => p.id === job.target.profileId)?.name || t('身份不可用') : job.target.cwd?.split(/[\\/]/).filter(Boolean).at(-1) || t('指定线程');
                    const meta = node('span', 'cron-row-meta'); meta.append(node('span', 'cron-type', t(job.schedule.kind === 'once' ? '仅一次' : '重复任务')), node('span', 'cron-row-target', target));
                    row.append(top, meta, node('small', '', ended(job) ? scheduleText(job) : job.enabled ? `${t('下次')} ${date(job.nextAt, job.schedule.timeZone)}` : `${t('已暂停')} · ${scheduleText(job)}`));
                    const run = activeRun(job) || job.lastRun;
                    if (run) row.append(node('span', `cron-status ${ended(job) ? 'historical' : run.status}`, `${activeRun(job) ? '' : `${t('上次')} · `}${t(statusNames[run.status] || run.status)}`));
                    group.append(row);
                }
            }
            if (!jobs.length) list.append(node('p', 'cron-empty-small', t(query.trim() ? '没有匹配的任务，试试其他关键词。' : listView === 'history' ? '还没有已结束的单次任务。' : '暂无当前任务。创建新安排，或到历史任务查看以往结果。')));
            list.scrollTop = scrollTop;
        }
        function back() { return button('返回列表', 'fa-arrow-left', () => root.classList.remove('cron-has-detail'), 'cron-mobile-back'); }
        async function renderDetail() {
            let job = snapshot?.jobs.find(item => item.id === selected);
            if (!job && !selected && window.matchMedia('(min-width: 681px)').matches) {
                job = snapshot?.jobs.filter(item => !ended(item) && (!filterProfile || item.target.profileId === filterProfile))
                    .sort((a, b) => Number(Boolean(activeRun(b))) - Number(Boolean(activeRun(a))) || Number(b.enabled) - Number(a.enabled) || (a.nextAt || Infinity) - (b.nextAt || Infinity))[0];
                if (job) { selected = job.id; renderList(); }
            }
            detail.replaceChildren();
            if (!job) {
                const hasJobs = snapshot?.jobs.length > 0;
                const empty = node('div', 'cron-empty'); empty.append(node('i', 'fa-regular fa-calendar-check'), node('h2', '', t(hasJobs ? '选择任务，查看安排与结果' : '把重复的事情，交给时间')),
                    node('p', '', t(hasJobs ? '在列表中选择任务，或到历史任务查看已结束的单次安排。' : '每日简报、项目检查、温柔问候。选择一个线程，让助手按时开始。')), button(hasJobs ? '新建任务' : '创建第一个任务', 'fa-plus', () => edit(), 'primary'));
                detail.append(empty); return;
            }
            showDetail();
            const top = node('div', 'cron-detail-head'), titles = node('div'); titles.append(back(), node('span', 'cron-type', t(job.schedule.kind === 'once' ? '单次安排' : '重复任务')), node('h2', '', job.name), node('p', '', `${scheduleText(job)} · ${job.schedule.timeZone}`));
            const controls = node('div', 'cron-actions');
            controls.append(button('运行一次', 'fa-play', b => action(b, job, 'run')));
            if (!ended(job)) controls.append(button(job.enabled ? '暂停' : '启用', job.enabled ? 'fa-pause' : 'fa-play', b => action(b, job, job.enabled ? 'pause' : 'resume')));
            else controls.append(button('重新安排', 'fa-calendar-plus', () => edit({ ...job, id: randomId(), revision: undefined, enabled: false, schedule: { ...job.schedule, at: null } }), 'primary'));
            controls.append(button('编辑', 'fa-pen', () => edit(job)), button('复制', 'fa-copy', () => edit({ ...job, id: randomId(), revision: undefined, enabled: false, schedule: ended(job) ? { ...job.schedule, at: null } : job.schedule, name: `${job.name} · ${t('副本')}` })),
                button('删除', 'fa-trash', async b => { if (await confirm('删除定时任务', '删除后保留执行记录和线程内容。', '删除')) await action(b, job, 'delete'); }));
            top.append(titles, controls); detail.append(top);
            if (ended(job)) detail.append(node('p', 'cron-history-note', t('这次单次安排已结束，记录与线程会保留。重新安排需选择新的时间。')));
            const live = activeRun(job);
            if (live) {
                for (const control of controls.children) if (!control.textContent.includes(t('暂停'))) { control.disabled = true; control.title = t('本次运行结束或核对后可操作。'); }
                const banner = node('div', 'cron-live-banner'); banner.append(node('strong', `cron-status ${live.status}`, t(statusNames[live.status])));
                if (live.status === 'uncertain') banner.append(node('p', 'cron-muted', t('先核对已执行的操作，再决定是否重新运行。')));
                banner.append(runButtons(job, live)); detail.append(banner);
            }
            const card = node('div', 'cron-card'), grid = node('dl', 'cron-facts');
            const target = job.target.kind === 'profile' ? profiles.find(p => p.id === job.target.profileId)?.name || job.target.profileId : job.target.cwd;
            for (const [label, value] of [['调度', scheduleText(job)], ['目标', target],
                ['执行方式', t(job.mode === 'text' ? '文字问候' : '执行工作')], ['微信通知', t(notificationNames[notificationMode(job)])], ['模型', job.model ? `${job.model.provider}/${job.model.modelId} · ${job.model.thinkingLevel}` : t('跟随目标线程')],
                ['错过执行', t(job.misfire.policy === 'skip' ? '直接跳过' : '宽限期内补最近一次')], ['生效时间', job.startsAt ? date(job.startsAt, job.schedule.timeZone) : t('立即生效')], ['下次执行', date(job.enabled ? job.nextAt : null, job.schedule.timeZone)]]) {
                grid.append(node('dt', '', t(label)), node('dd', '', value));
            }
            card.append(grid);
            const ref = job.target.kind === 'profile' ? snapshot.homes.find(home => home.profileId === job.target.profileId) : job.target;
            if (ref?.bot === true) card.append(openBotHome(ref));
            else if (ref?.sessionId) card.append(button('打开目标线程', 'fa-arrow-up-right-from-square', () => openThread(ref)));
            detail.append(card);
            const execution = job.execution || defaults(job.mode), strategy = node('div', 'cron-policy-summary');
            for (const [label, value] of [['最长执行', `${Math.round(execution.maxDurationSeconds / 60)} ${t('分钟')}`],
                ['模型调用', unlimited(execution.maxCalls)], ['Token 上限', unlimited(execution.maxTokens)], ['单次费用上限', execution.maxCost == null ? t('不限制') : `$${execution.maxCost}`]]) {
                const item = node('div'); item.append(node('span', '', t(label)), node('strong', '', value)); strategy.append(item);
            }
            detail.append(strategy);
            const prompt = node('div', 'cron-card'); prompt.append(node('h3', '', t('任务内容')), node('pre', 'cron-prompt', job.prompt)); detail.append(prompt);
            const history = node('div', 'cron-card'); history.append(node('h3', '', t('运行记录')), node('p', '', t('正在读取…')));
            if (window.PiSkeleton) { const placeholder = node('div'); placeholder.innerHTML = window.PiSkeleton.html('compact', { rows: 3, label: t('正在读取…') }); history.lastElementChild.replaceWith(placeholder); }
            detail.append(history);
            const version = epoch, id = selected;
            try {
                const data = await api(`/api/pi/cron/jobs/${encodeURIComponent(job.id)}/runs`);
                if (version !== epoch || selected !== id || draft || !history.isConnected) return;
                history.replaceChildren(node('h3', '', t('运行记录')));
                if (!data.runs.length) history.append(node('p', 'cron-muted', t('首次运行后，结果与用量会显示在这里。')));
                for (const run of data.runs) {
                    const row = node('div', 'cron-run'), copy = node('div');
                    copy.append(node('strong', `cron-status ${run.status}`, t(statusNames[run.status] || run.status)), node('small', '', date(run.scheduledAt, job.schedule.timeZone)));
                    if (run.feedback) {
                        const feedback = node('div', 'cron-feedback'); feedback.setAttribute('role', 'note');
                        feedback.append(node('strong', '', t(run.feedback.title)));
                        if (run.feedback.detail) feedback.append(node('p', 'cron-muted', run.feedback.detail));
                        feedback.append(node('p', 'cron-muted', t(run.feedback.suggestion)));
                        if (run.feedback.quota) {
                            const quota = run.feedback.quota;
                            feedback.append(node('small', '', `${t(quota.scope === 'instance' ? '实例共享限额' : '此任务的每日限额')} · ${unlimited(quota.used)} / ${unlimited(quota.limit)}`));
                        }
                        if (run.feedback.limits) {
                            const used = run.feedback.usage || run.usage || {}, limits = run.feedback.limits;
                            if (run.feedback.code === 'token-limit') feedback.append(node('small', '', `${t('累计 Token')} ${unlimited(used.tokens)} / ${unlimited(limits.maxTokens)}`));
                            if (run.feedback.code === 'call-limit') feedback.append(node('small', '', `${t('模型调用')} ${used.calls ?? '—'} / ${limits.maxCalls}`));
                            if (run.feedback.code === 'cost-limit') feedback.append(node('small', '', `${t('估算费用')} $${used.cost?.toFixed(4) ?? '—'} / $${limits.maxCost}`));
                        }
                        copy.append(feedback);
                    } else if (run.reason) copy.append(node('p', 'cron-muted', reason(run.reason)));
                    if (run.status === 'uncertain') copy.append(node('p', 'cron-muted', t('先核对已执行的操作，再决定是否重新运行。')));
                    if (run.channelNotify) {
                        const names = { pending: '微信通知等待投递入队', accepted: '微信通知已进入投递队列', skipped: '微信通知已跳过' };
                        const captureFailed = run.channelNotify.reason === 'capture-error';
                        copy.append(node('p', 'cron-muted', t(captureFailed ? '无法建立微信通知，请检查渠道状态' : names[run.channelNotify.status] || '微信通知状态待核对')));
                    }
                    if (run.usage) {
                        copy.append(node('small', 'cron-run-meter', `${run.usage.calls ?? '—'} ${t('次模型调用')} · ${run.usage.tokens?.toLocaleString() ?? '—'} Token · ${run.usage.cost == null ? t('费用未知') : `$${run.usage.cost.toFixed(4)}`}`));
                        if (run.usage.cacheRead != null) copy.append(node('small', '', `${t('输入')} ${unlimited(run.usage.input)} · ${t('输出')} ${unlimited(run.usage.output)} · ${t('缓存读取')} ${unlimited(run.usage.cacheRead)}`));
                    }
                    row.append(copy, runButtons(job, run)); history.append(row);
                }
            } catch (error) { if (history.isConnected) { history.querySelector('.pv-skeleton')?.parentElement.remove(); history.append(node('p', 'error', error.message)); } }
        }
        function runButtons(job, run) {
            const buttons = node('div', 'cron-actions');
            if (['failed', 'error', 'stopped'].includes(run.status)) buttons.append(button('调整执行设置', 'fa-sliders', () => edit(job)));
            if (run.target) buttons.append(button('查看线程', 'fa-arrow-up-right-from-square', () => openThread(run.target)));
            if (['waiting', 'running', 'dispatching'].includes(run.status)) buttons.append(button('停止', 'fa-stop', b => action(b, job, 'stop', { runId: run.id })));
            if (run.status === 'uncertain') buttons.append(button('核对并结束', 'fa-check', async b => {
                if (await confirm('核对执行结果', '请先查看目标线程。此操作结束待核对状态并恢复线程设置，不会重新执行任务。', '已核对，结束本次')) await action(b, job, 'acknowledge', { runId: run.id });
            }));
            return buttons;
        }
        function reason(value) {
            const reasons = { offline: '服务离线，已跳过', expired: '超过执行时间，已跳过', overlap: '上次任务尚未结束', 'user-active': '用户已在今天出现，保持静默', restart: '服务重启，执行结果待核对', 'worker-exited': '运行实例退出，执行结果待核对', 'time-limit': '已达到时长限制', 'run-limit': '已达到单次预算', 'target-deleted': '目标线程已删除' };
            return t(reasons[value] || value);
        }
        function openThread(ref) { window.PiWorkspaceRoute.navigate('chat', { cwd: ref.cwd, sessionId: ref.sessionId }); }
        // A Bot's main thread is its main chat: shown, opened on the Bot page, never replaced here.
        const BOT_HOME = '伙伴的主线程就是它的主聊天，定时任务会进入它当前的聊天。';
        const openBotHome = home => button('打开主聊天', 'fa-arrow-up-right-from-square', () => window.PiWorkspaceRoute.navigate('bot', { profileId: home.profileId }));
        async function action(b, job, kind, extra = {}) {
            const requestId = kind === 'run' ? (runRequest?.jobId === job.id ? runRequest.id : randomId()) : undefined;
            if (kind === 'run') runRequest = { jobId: job.id, id: requestId };
            await mutate(b, () => send(`/api/pi/cron/jobs/${job.id}/actions`, { action: kind, revision: job.revision, requestId, ...extra }));
            runRequest = null; await load();
        }
        async function edit(job, target) {
            if (!snapshot || !await leave()) return;
            const previousSelected = selected;
            draft = structuredClone(job || { id: randomId(), name: '', prompt: '', enabled: false, mode: 'work',
                target: target || { kind: filterProfile ? 'profile' : 'thread', profileId: filterProfile || profiles[0]?.id || '', cwd: currentCwd() || projects[0]?.cwd || '', sessionId: '' },
                schedule: { kind: 'cron', expression: '0 9 * * *', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' },
                misfire: { policy: 'skip', graceMinutes: 30 }, policyVersion: 3, execution: defaults('work'), budget: { maxRunsPerDay: null, maxTokensPerDay: null, maxCostPerDay: null } });
            dirty = false; selected = draft.id; renderList(); showDetail(); detail.replaceChildren();
            const form = node('form', 'cron-form'); form.append(back(), node('h2', '', t(job?.revision ? '编辑定时任务' : '新建定时任务')));
            const name = field(form, '任务名称', 'text', draft.name, { required: true, maxLength: 120, placeholder: t('例如：早间简报') });
            const panel = (title, parent = form) => { const p = node('section', 'cron-card'); p.append(node('h3', '', t(title))); parent.append(p); return p; };
            const destination = panel('发送到哪里'), destGrid = node('div', 'cron-grid'); destination.append(destGrid);
            const kind = field(destGrid, '目标类型', 'select', draft.target.kind, { choices: [['thread', t('指定线程')], ['profile', t('身份的主线程')]] });
            const profile = field(destGrid, '伙伴身份', 'select', draft.target.profileId || profiles[0]?.id, { choices: profiles.filter(p => p.enabled).map(p => [p.id, p.name]) });
            const initialHome = draft.target.kind === 'profile' ? snapshot.homes.find(home => home.profileId === draft.target.profileId) : null;
            const cwd = field(destGrid, '工作目录', 'text', draft.target.cwd || initialHome?.cwd || currentCwd() || projects[0]?.cwd || '', { placeholder: t('项目的绝对路径') });
            const directoryField = pickers.directory(cwd, { api, getProjects });
            const sessions = pickers.thread(destGrid, () => { dirty = true; });
            const targetStatus = node('p', 'cron-muted'), targetActions = node('div', 'cron-actions'); destination.append(targetStatus, targetActions);
            let sessionsEpoch = 0, destinationKey = '';
            async function destinations() {
                const v = ++sessionsEpoch, isProfile = kind.value === 'profile', home = snapshot.homes.find(h => h.profileId === profile.value);
                profile.parentElement.hidden = !isProfile; targetActions.replaceChildren();
                const botHome = isProfile && home?.bot === true;
                directoryField.hidden = sessions.element.hidden = botHome;
                const key = `${kind.value}:${profile.value}:${cwd.value}`, previous = destinationKey === key ? sessions.value : '';
                destinationKey = key; sessions.pending();
                if (botHome) { targetStatus.textContent = t(BOT_HOME); targetActions.append(openBotHome(home)); return; }
                targetStatus.textContent = isProfile ? home?.status === 'ready' ? `${t('当前主线程')}：${home.name || home.sessionId}` : t('尚未设置主线程。可指定已有线程，或在这个目录创建。') : '';
                try {
                    const data = await api(`/api/pi/sessions?cwd=${encodeURIComponent(cwd.value)}`);
                    if (v !== sessionsEpoch || !form.isConnected) return;
                    sessions.setItems(data.sessions.filter(s => !s.profileAuthoring && !s.assistant && (!isProfile || s.agentProfile?.id === profile.value)),
                        previous || (isProfile ? home?.cwd === cwd.value ? home.sessionId : '' : draft.target.cwd === cwd.value ? draft.target.sessionId : ''));
                } catch (error) { if (v === sessionsEpoch && form.isConnected) { sessions.fail(); targetStatus.textContent = error.message; targetActions.append(button('重试读取', 'fa-rotate', () => destinations())); } }
                if (!form.isConnected) return;
                if (isProfile && v === sessionsEpoch) {
                    const saveHome = async (b, create) => {
                        if (create && !await confirm('创建主线程', '将在所填工作目录创建一个持久线程，并设为此身份的主线程。', '创建')) return;
                        const result = await mutate(b, () => send(`/api/pi/cron/homes/${profile.value}`, { revision: home?.revision || 0,
                            cwd: cwd.value, sessionId: sessions.value, create, requestId: randomId(), language: globalThis.PiI18n?.locale }, 'PUT'));
                        snapshot.homes = snapshot.homes.filter(h => h.profileId !== profile.value); snapshot.homes.push({ ...result, profileId: profile.value });
                        await destinations();
                    };
                    targetActions.append(button('设为主线程', 'fa-house', b => saveHome(b, false)), button('创建主线程', 'fa-plus', b => saveHome(b, true)));
                    if (home?.status === 'ready') targetActions.append(button('打开主线程', 'fa-arrow-up-right-from-square', () => openThread(home)));
                }
            }
            cwd.onchange = () => { dirty = true; void destinations(); };
            kind.onchange = profile.onchange = () => {
                const home = kind.value === 'profile' && snapshot.homes.find(item => item.profileId === profile.value);
                if (home?.cwd) cwd.value = home.cwd;
                cwd.dispatchEvent(new Event('change', { bubbles: true }));
            }; void destinations();
            const schedule = panel('什么时候执行'), scheduleGrid = node('div', 'cron-grid'); schedule.append(scheduleGrid);
            const daily = /^\d+ \d+ \* \* \*$/.test(draft.schedule.expression || '');
            const weekdays = /^\d+ \d+ \* \* 1-5$/.test(draft.schedule.expression || '');
            const weekly = /^\d+ \d+ \* \* [0-7]$/.test(draft.schedule.expression || '');
            const preset = field(scheduleGrid, '频率', 'select', draft.schedule.kind === 'once' ? 'once' : daily ? 'daily' : weekdays ? 'weekdays' : weekly ? 'weekly' : 'custom',
                { choices: [['daily', t('每天')], ['weekdays', t('工作日')], ['weekly', t('每周')], ['once', t('仅一次')], ['custom', t('自定义 cron')]] });
            const parts = (draft.schedule.expression || '0 9 * * *').split(' ');
            const weekday = field(scheduleGrid, '星期', 'select', weekly ? String(Number(parts[4]) % 7) : '1',
                { choices: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map((day, i) => [String(i), t(day)]) });
            const time = field(scheduleGrid, '时间', 'time', daily || weekdays || weekly ? `${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}` : '09:00');
            const expression = field(scheduleGrid, 'Cron 表达式', 'text', draft.schedule.expression || '0 9 * * *', { maxLength: 150, hint: '分钟 小时 日期 月份 星期' });
            const once = field(scheduleGrid, '执行日期与时间', 'datetime-local', draft.schedule.at ? new Date(draft.schedule.at - new Date(draft.schedule.at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
            const zone = field(scheduleGrid, '时区', 'text', draft.schedule.timeZone, { required: true, hint: '使用 IANA 时区，例如 Asia/Shanghai。单次时间按当前设备时区输入。' });
            const startsAt = field(scheduleGrid, '生效时间', 'datetime-local', draft.startsAt ? new Date(draft.startsAt - new Date(draft.startsAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
                { hint: '留空立即生效；按当前设备时区输入。手动运行不受此时间限制。' });
            const initialOnce = once.value, initialStart = startsAt.value;
            const startsAtValue = () => !startsAt.value ? null : startsAt.value === initialStart && draft.startsAt != null ? draft.startsAt : new Date(startsAt.value).getTime();
            const preview = node('div', 'cron-preview'); schedule.append(preview);
            function scheduleValue() { return preset.value === 'once' ? { kind: 'once', at: once.value === initialOnce && draft.schedule.kind === 'once' && draft.schedule.at != null ? draft.schedule.at : new Date(once.value).getTime(), timeZone: zone.value }
                : { kind: 'cron', expression: expression.value, timeZone: zone.value }; }
            async function previewTimes() {
                const timed = ['daily', 'weekdays', 'weekly'].includes(preset.value);
                expression.parentElement.hidden = preset.value !== 'custom'; time.parentElement.hidden = !timed; once.parentElement.hidden = preset.value !== 'once'; weekday.parentElement.hidden = preset.value !== 'weekly';
                once.required = preset.value === 'once'; time.required = timed; expression.required = preset.value === 'custom';
                if (timed) { const [h, m] = time.value.split(':'); expression.value = `${Number(m)} ${Number(h)} * * ${preset.value === 'daily' ? '*' : preset.value === 'weekly' ? weekday.value : '1-5'}`; }
                const version = ++previewEpoch;
                try {
                    const data = await send('/api/pi/cron/preview', { schedule: scheduleValue(), startsAt: startsAtValue() });
                    if (version !== previewEpoch || !form.isConnected) return;
                    preview.replaceChildren(node('strong', '', t(preset.value === 'once' ? '执行时间预览' : '接下来五次')));
                    for (const at of data.times) preview.append(node('span', '', date(at, zone.value)));
                } catch (error) { if (version === previewEpoch) preview.textContent = error.message; }
            }
            for (const control of [preset, weekday, time, expression, once, zone, startsAt]) control.onchange = () => { dirty = true; void previewTimes(); };
            const content = panel('做什么');
            const mode = field(content, '执行方式', 'select', draft.mode, { choices: [['text', t('文字问候')], ['work', t('执行工作')]], hint: '文字模式不使用工作工具；工作模式使用目标线程的工具与权限。' });
            const prompt = field(content, '提示词', 'textarea', draft.prompt, { required: true, maxLength: 40000, placeholder: t('描述希望助手完成的事情，以及什么时候应该保持静默。') }); prompt.rows = 8;
            const executionPanel = node('details', 'cron-card cron-execution-settings'), executionGrid = node('div', 'cron-grid');
            executionPanel.append(node('summary', '', t('执行设置'))); form.append(executionPanel);
            executionPanel.append(node('p', 'cron-muted', t('给任务足够的时间。调用次数与 Token 默认只统计，费用与用量上限可按需开启。')), executionGrid);
            const calls = quota(executionGrid, '单次模型调用上限', draft.execution.maxCalls, { min: 1, max: 10000,
                hint: '留空不限制调用次数；一次模型请求可能包含多个工具调用。' });
            const duration = field(executionGrid, '最长执行（分钟）', 'number', draft.execution.maxDurationSeconds / 60, { min: 1 / 6, max: 1440, step: 'any', required: true });
            const idle = quota(executionGrid, '停滞时长（分钟）', draft.execution.maxIdleSeconds == null ? '' : draft.execution.maxIdleSeconds / 60,
                { min: 0.5, max: 1440, step: 'any', hint: '模型没有新输出且没有工具执行时开始计时。留空关闭。' });
            const repeated = quota(executionGrid, '相同工具连续失败上限', draft.execution.maxRepeatedErrors, { min: 2, max: 100, hint: '相同输入与错误重复出现时停止；留空关闭。' });
            const strategyActions = node('div', 'cron-actions'); executionPanel.append(strategyActions);
            if (Object.values(snapshot.limits).some(value => value != null)) executionPanel.append(node('p', 'cron-legacy-note', t('实例仍设有共享每日限额；此任务使用推荐设置后，共享限额仍生效，可在全局设置调整。')));
            let executionEdited = false;
            executionGrid.oninput = () => { executionEdited = true; };
            mode.onchange = () => { if (!job && !executionEdited) { const d = defaults(mode.value); calls.value = d.maxCalls ?? ''; duration.value = d.maxDurationSeconds / 60; } };
            if (job && job.policyVersion !== 3) executionPanel.append(node('p', 'cron-legacy-note', t('此任务保留旧版限制。使用推荐设置后，调用次数、单次与每日配额将解除，时长与停滞保护仍生效。')));
            const advanced = node('details', 'cron-card'); advanced.append(node('summary', '', t('模型、调度与可选限额'))); form.append(advanced);
            const grid = node('div', 'cron-grid'); advanced.append(grid);
            const modelMode = field(grid, '模型', 'select', draft.model ? 'fixed' : 'follow', { choices: [['follow', t('跟随目标线程')], ['fixed', t('固定模型')]] });
            const modelSelect = field(grid, '选择模型', 'select', '', { choices: [['', t('请选择模型')]] });
            const thinking = field(grid, '思考等级', 'select', ''); let catalog = [], modelEpoch = 0;
            async function models() {
                modelSelect.parentElement.hidden = thinking.parentElement.hidden = modelMode.value !== 'fixed';
                if (modelMode.value !== 'fixed') return;
                const version = ++modelEpoch, directory = cwd.value;
                const data = await api(`/api/pi/cron/models?cwd=${encodeURIComponent(directory)}`);
                if (version !== modelEpoch || directory !== cwd.value || modelMode.value !== 'fixed' || !form.isConnected) return;
                catalog = data.models; modelSelect.replaceChildren();
                for (const m of catalog) { const o = node('option', '', `${m.provider} / ${m.name || m.modelId}`); o.value = JSON.stringify([m.provider, m.modelId]); modelSelect.append(o); }
                if (draft.model) modelSelect.value = JSON.stringify([draft.model.provider, draft.model.modelId]);
                levels();
            }
            function levels() { const m = catalog.find(m => JSON.stringify([m.provider, m.modelId]) === modelSelect.value); thinking.replaceChildren();
                for (const level of m?.thinkingLevels || []) { const o = node('option', '', level); o.value = level; thinking.append(o); }
                if (m?.thinkingLevels.includes(draft.model?.thinkingLevel)) thinking.value = draft.model.thinkingLevel;
            }
            modelMode.onchange = () => { dirty = true; void models().catch(error => message(error.message, true)); }; modelSelect.onchange = levels;
            cwd.addEventListener('change', () => { void models().catch(error => message(error.message, true)); });
            void models().catch(error => message(error.message, true));
            const misfire = field(grid, '错过执行', 'select', draft.misfire.policy, { choices: [['skip', t('直接跳过')], ['latest', t('宽限期内补最近一次')]] });
            const grace = field(grid, '宽限期（分钟）', 'number', draft.misfire.graceMinutes, { min: 1, max: 1440 });
            const condition = field(grid, '今天此时之后有用户消息则跳过', 'time', draft.condition?.time || '', { hint: '留空则每次执行。仅检查目标线程当前分支中的用户消息。' });
            advanced.append(node('h3', 'cron-section-title', t('用量与费用限额')),
                node('p', 'cron-muted', t('全部留空即可正常运行并记录用量。累计 Token 包含每轮输入、输出和缓存读取，不等于上下文窗口或输出长度。')));
            const budgetGrid = node('div', 'cron-grid'); advanced.append(budgetGrid);
            const tokens = quota(budgetGrid, '单次 Token 预算', draft.execution.maxTokens, { min: 1000, max: 1000000000000 });
            const runCost = quota(budgetGrid, '单次估算美元上限', draft.execution.maxCost, { min: 0.01, max: 10000, step: 'any' });
            const dailyRuns = quota(budgetGrid, '每日执行次数', draft.budget.maxRunsPerDay, { min: 1, max: 100000 });
            const dailyTokens = quota(budgetGrid, '每日 Token 预算', draft.budget.maxTokensPerDay, { min: 1000, max: 1000000000000 });
            const money = quota(budgetGrid, '每日估算美元预算', draft.budget.maxCostPerDay, { min: 0.01, max: 10000, step: 'any' });
            strategyActions.append(button('使用推荐设置', 'fa-wand-magic-sparkles', () => {
                const d = defaults(mode.value); calls.value = d.maxCalls ?? ''; duration.value = d.maxDurationSeconds / 60;
                idle.value = d.maxIdleSeconds / 60; repeated.value = d.maxRepeatedErrors;
                for (const control of [tokens, runCost, dailyRuns, dailyTokens, money]) control.value = '';
                draft.policyVersion = 3; dirty = true; executionEdited = true;
                message(t('推荐设置已填入，保存后生效。实例总限额仍单独生效。'));
            }));
            advanced.append(node('p', 'cron-muted', t('预算按 UTC 日累计。限额在模型调用之间检查，已发出的请求可能超额；费用按模型价格估算，工具额外费用不包含在内。启用费用限制时，价格未知会停止执行。')));
            const delivery = panel('保存与通知');
            const enabled = field(delivery, '保存后启用', 'checkbox', draft.enabled);
            const notifyWeixin = field(delivery, '微信通知', 'select', notificationMode(draft), {
                choices: Object.entries(notificationNames).map(([value, caption]) => [value, t(caption)]),
                hint: '默认跟随线程；绑定为接收全部结果时自动推送，静默任务不发送。' });
            const footer = node('div', 'cron-form-footer'), saveHint = node('span', 'cron-muted');
            const updateSaveHint = () => { saveHint.textContent = t(enabled.checked ? '启用后，服务将在计划时间自动执行。' : '保存为暂停，稍后可启用。'); }; enabled.onchange = updateSaveHint; updateSaveHint(); footer.append(saveHint);
            const save = button('保存任务', 'fa-check', () => {}, 'primary'); save.type = 'submit';
            footer.append(button('取消', null, async () => { if (!await leave()) return; draft = null; dirty = false; selected = previousSelected; renderList(); await renderDetail(); }), save); form.append(footer);
            form.oninput = () => { dirty = true; };
            form.onsubmit = async event => {
                event.preventDefault();
                if (busy) return;
                if (kind.value === 'thread' && (!sessions.value || destinationKey !== `${kind.value}:${profile.value}:${cwd.value}`)) { message(t('请选择一个可用的目标线程。'), true); sessions.element.querySelector('button').focus(); return; }
                const input = { ...draft, name: name.value, prompt: prompt.value, enabled: enabled.checked, weixinNotification: notifyWeixin.value, notifyWeixin: notifyWeixin.value !== 'off', mode: mode.value,
                    target: kind.value === 'profile' ? { kind: 'profile', profileId: profile.value } : { kind: 'thread', cwd: cwd.value, sessionId: sessions.value },
                    schedule: scheduleValue(), startsAt: startsAtValue(), model: modelMode.value === 'fixed' && modelSelect.value ? { provider: JSON.parse(modelSelect.value)[0], modelId: JSON.parse(modelSelect.value)[1], thinkingLevel: thinking.value } : null,
                    misfire: { policy: misfire.value, graceMinutes: Number(grace.value) }, condition: condition.value ? { kind: 'no-user-since', time: condition.value } : null,
                    policyVersion: 3,
                    execution: { maxCalls: optionalValue(calls), maxTokens: optionalValue(tokens), maxCost: optionalValue(runCost), maxDurationSeconds: Math.round(Number(duration.value) * 60),
                        maxIdleSeconds: idle.value === '' ? null : Math.round(Number(idle.value) * 60), maxRepeatedErrors: optionalValue(repeated) },
                    budget: { maxRunsPerDay: optionalValue(dailyRuns), maxTokensPerDay: optionalValue(dailyTokens), maxCostPerDay: optionalValue(money) } };
                try { const saved = await mutate(save, () => send('/api/pi/cron/jobs', input, 'PUT')); if (!saved) return; selected = saved.id; draft = null; dirty = false; await load(); }
                catch { /* Keep every field and the stable task ID for reconciliation. */ }
            };
            detail.append(form); void previewTimes(); name.focus({ preventScroll: true });
        }
        async function openHomes() {
            if (!snapshot || !await leave()) return;
            draft = { home: true }; dirty = false; showDetail(); detail.replaceChildren();
            const form = node('div', 'cron-form'); form.append(back(), node('h2', '', t('主线程')), node('p', 'cron-muted', t('主线程按需创建，也可以指定已有线程作为定时任务的默认目标。')));
            const profile = field(form, '伙伴身份', 'select', filterProfile || profiles[0]?.id || '', { choices: profiles.filter(p => p.enabled).map(p => [p.id, p.name]) });
            const cwd = field(form, '工作目录', 'text', '', { placeholder: t('项目的绝对路径') });
            pickers.directory(cwd, { api, getProjects });
            const sessions = pickers.thread(form, () => { requestId = randomId(); dirty = true; });
            const status = node('p', 'cron-muted'), controls = node('div', 'cron-actions'); form.append(status, controls); detail.append(form);
            let generation = 0, requestId = randomId();
            async function render(resetDirectory = false) {
                const version = ++generation, id = profile.value, home = snapshot.homes.find(h => h.profileId === id);
                cwd.closest('.cron-field').hidden = sessions.element.hidden = home?.bot === true;
                sessions.pending();
                if (home?.bot === true) { status.textContent = t(BOT_HOME); controls.replaceChildren(openBotHome(home)); return; }
                if (resetDirectory || !cwd.value) cwd.value = home?.cwd || currentCwd() || projects[0]?.cwd || '';
                status.textContent = home?.status === 'ready' ? `${t('当前主线程')}：${home.name || home.sessionId}` : t('尚未设置主线程。可指定已有线程，或在这个目录创建。');
                controls.replaceChildren();
                try {
                    const data = await api(`/api/pi/sessions?cwd=${encodeURIComponent(cwd.value)}`);
                    if (version !== generation || !form.isConnected) return;
                    sessions.setItems(data.sessions.filter(s => s.agentProfile?.id === id && !s.profileAuthoring && !s.assistant), home?.cwd === cwd.value ? home.sessionId : '');
                } catch (error) { if (version === generation && form.isConnected) { sessions.fail(); status.textContent = error.message; controls.append(button('重试读取', 'fa-rotate', () => render())); } }
                if (version !== generation || !form.isConnected) return;
                const save = async (b, create) => {
                    if (create && !await confirm('创建主线程', '将在所填工作目录创建一个持久线程，并设为此身份的主线程。', '创建')) return;
                    const result = await mutate(b, () => send(`/api/pi/cron/homes/${id}`, { revision: home?.revision || 0, cwd: cwd.value,
                        sessionId: create ? undefined : sessions.value, create, requestId, language: globalThis.PiI18n?.locale }, 'PUT'));
                    if (!result) return;
                    snapshot.homes = snapshot.homes.filter(h => h.profileId !== id); snapshot.homes.push({ ...result, profileId: id });
                    requestId = randomId(); dirty = false; await render();
                };
                controls.append(button('设为主线程', 'fa-house', b => save(b, false), 'primary'), button('创建主线程', 'fa-plus', b => save(b, true)));
                if (home?.status === 'ready') controls.append(button('打开主线程', 'fa-arrow-up-right-from-square', () => openThread(home)));
            }
            profile.onchange = () => { requestId = randomId(); void render(true); };
            cwd.onchange = () => { requestId = randomId(); void render(); }; void render(true);
        }
        async function openBudget() {
            if (!await leave()) return;
            const data = await api('/api/pi/cron/limits');
            draft = { budget: true }; dirty = false; showDetail(); detail.replaceChildren();
            const form = node('form', 'cron-form'); form.append(back(), node('h2', '', t('全局设置')), node('p', 'cron-muted', t('控制并发，按需设置所有定时任务共享的每日限额。留空的限额只统计、不拦截。')));
            const executionCard = node('section', 'cron-card'); executionCard.append(node('h3', '', t('运行与排队'))); form.append(executionCard);
            const concurrency = field(executionCard, '同时执行的任务数', 'number', data.settings?.maxConcurrent ?? 2, { min: 1, max: 10, required: true, hint: '达到并发上限时等待；同一任务始终不会重叠执行。' });
            const card = node('section', 'cron-card'); card.append(node('h3', '', t('共享每日限额')), node('p', 'cron-muted', t('按 UTC 日累计。单个任务的限额与这里的共享限额同时生效。'))); form.append(card);
            const grid = node('div', 'cron-grid'); card.append(grid);
            const runs = quota(grid, '每日执行次数', data.limits.maxRunsPerDay, { min: 1, max: 100000 });
            const tokens = quota(grid, '每日 Token 预算', data.limits.maxTokensPerDay, { min: 1000, max: 1000000000000 });
            const money = quota(grid, '每日估算美元预算', data.limits.maxCostPerDay, { min: 0.01, max: 10000, step: 'any' });
            card.append(button('使用推荐设置', 'fa-wand-magic-sparkles', () => { concurrency.value = 2; runs.value = tokens.value = money.value = ''; dirty = true; }));
            form.append(node('p', 'cron-muted', t('累计 Token 包含重复输入与缓存。费用限额按模型价格估算，不能保证服务商扣款绝不超额。')));
            const footer = node('div', 'cron-form-footer'), save = button('保存设置', 'fa-check', () => {}, 'primary'); save.type = 'submit';
            footer.append(button('取消', null, async () => { if (!await leave()) return; draft = null; dirty = false; await load(); }), save); form.append(footer);
            form.oninput = () => { dirty = true; }; form.onsubmit = async event => { event.preventDefault(); try {
                const result = await mutate(save, () => send('/api/pi/cron/limits', { revision: data.revision,
                    settings: { maxConcurrent: Number(concurrency.value) }, limits: { maxRunsPerDay: optionalValue(runs), maxTokensPerDay: optionalValue(tokens), maxCostPerDay: optionalValue(money) } }, 'PUT'));
                if (!result) return; draft = null; dirty = false; await load();
            } catch { /* Preserve budget edits. */ } }; detail.append(form);
        }
        search.oninput = () => { query = search.value; renderList(); };
        window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
        window.addEventListener('workspace:tabchanged', event => {
            visible = event.detail.tab === 'cron'; if (!visible) { epoch++; pickers.close(); return; }
            filterProfile = event.detail.params.get('profileId') || '';
            if (event.detail.params.get('jobId') && !dirty && !busy) selected = event.detail.params.get('jobId');
            const newTarget = event.detail.params.get('sessionId') ? { kind: 'thread', cwd: event.detail.params.get('cwd'), sessionId: event.detail.params.get('sessionId') } : null;
            void load().then(() => { if (newTarget && visible && !draft) return edit(null, newTarget); });
        });
        setInterval(() => { if (visible && !document.hidden && !draft && !busy) void load(); }, 15000);
        visible = activate && window.PiWorkspaceRoute?.current().tab === 'cron'; if (visible) void load();
        return { open: target => window.PiWorkspaceRoute.navigate('cron', target || {}) };
    }
    window.PiCron = { create };
})();
