(() => {
    const t = (zh, en) => window.PiI18n?.locale === 'en' ? en : zh;
    const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
    const icon = name => { const n = el('i', null, `fa-solid ${name}`); n.setAttribute('aria-hidden', 'true'); return n; };
    const button = (label, action, { primary = false, glyph } = {}) => {
        const n = el('button', label, primary ? 'settings-primary-button browser-button-primary' : 'settings-secondary-button browser-button');
        n.type = 'button';
        if (glyph) n.prepend(icon(glyph));
        n.addEventListener('click', action);
        return n;
    };
    const reasons = () => ({
        BROWSER_BUSY: t('请等待相关任务结束，再刷新或修改浏览器设置。', 'Wait for the affected tasks to finish, then refresh or change browser settings.'),
        BROWSER_REVISION: t('设置已变化，请刷新后再保存。', 'Settings changed. Refresh before saving.'),
        BROWSER_INSTALL_FAILED: t('浏览器下载失败。请检查网络、代理和磁盘空间，再手动重试。', 'Browser download failed. Check the network, proxy and disk space before retrying.'),
        BROWSER_UNAVAILABLE: t('正在维护或关闭应用，请稍后再试。', 'The application is being maintained or shut down. Try again later.')
    });
    function create(host) {
        const root = el('section', null, 'workspace-settings-panel browser-panel'); root.dataset.settingsPanel = 'browser';

        const header = el('header', null, 'browser-header');
        const headerMark = el('span', null, 'browser-header-icon'); headerMark.append(icon('fa-window-maximize'));
        const headerCopy = el('div', null, 'browser-header-copy');
        headerCopy.append(
            el('h3', t('浏览器助手', 'Browser assistant')),
            el('p', t('让 Agent 打开网页、填写表单、上传附件和下载结果。使用官方 Playwright MCP，浏览器运行在部署 OhMyBuddy 的电脑或服务器上。', 'Let your agent open websites, fill forms, upload files and download results. Powered by official Playwright MCP on the computer or server hosting OhMyBuddy.'))
        );
        const refresh = button(t('刷新状态', 'Refresh status'), () => void load(), { glyph: 'fa-rotate' });
        refresh.classList.add('browser-refresh');
        const headerActions = el('div', null, 'browser-header-actions'); headerActions.append(refresh);
        header.append(headerMark, headerCopy, headerActions);

        const feedback = el('p', '', 'browser-feedback'); feedback.setAttribute('role', 'status');

        const statusCard = el('section', null, 'browser-card browser-status-card');
        const statusHead = el('div', null, 'browser-status-head');
        const statusDot = el('span', null, 'browser-status-dot'); statusDot.setAttribute('aria-hidden', 'true');
        const summary = el('p', '', 'browser-summary');
        const version = el('span', '', 'browser-version');
        statusHead.append(statusDot, summary, version);
        const metrics = el('div', null, 'browser-metrics');
        const metric = (caption, value) => {
            const item = el('div', null, 'browser-metric');
            item.append(el('span', caption, 'browser-metric-label'), value);
            return item;
        };
        const programValue = el('strong', '', 'browser-metric-value');
        const sessionsValue = el('strong', '', 'browser-metric-value');
        const modeValue = el('strong', '', 'browser-metric-value');
        metrics.append(
            metric(t('浏览器程序', 'Browser'), programValue),
            metric(t('使用中的任务', 'Tasks using browsers'), sessionsValue),
            metric(t('运行方式', 'Run mode'), modeValue)
        );
        statusCard.append(statusHead, metrics);

        const settingsCard = el('section', null, 'browser-card browser-settings-card');
        const settingsHead = el('div', null, 'browser-card-head');
        const settingsMark = el('span', null, 'browser-card-icon'); settingsMark.append(icon('fa-sliders'));
        const settingsCopy = el('div', null, 'browser-card-copy');
        settingsCopy.append(el('h4', t('运行设置', 'Run settings')), el('p', t('保存后，重新打开任务生效；保存不会中断正在执行的任务。', 'Changes apply when a task is reopened; saving never interrupts a running task.')));
        settingsHead.append(settingsMark, settingsCopy);
        const enabled = el('input'); enabled.type = 'checkbox'; enabled.setAttribute('aria-label', t('启用浏览器助手', 'Enable browser assistant'));
        const headless = el('input'); headless.type = 'checkbox'; headless.setAttribute('aria-label', t('在后台运行', 'Run in background'));
        const choice = (caption, hint, input) => {
            const label = el('label', null, 'browser-choice');
            const copy = el('span', null, 'browser-choice-copy');
            copy.append(el('strong', caption), el('small', hint));
            label.append(copy, input);
            return label;
        };
        const choices = el('div', null, 'browser-choices');
        choices.append(
            choice(t('启用浏览器助手', 'Enable browser assistant'), t('允许 Agent 在任务中操作网页、填写表单和上传下载。', 'Let the agent use websites, fill forms and transfer files in tasks.'), enabled),
            choice(t('在后台运行', 'Run in background'), t('无界面运行；关闭后可在部署端窗口完成登录或验证码。', 'Run without a visible window; turn off to sign in or pass verification on the host.'), headless)
        );
        const saveNote = el('span', '', 'browser-save-note');
        const save = button(t('保存设置', 'Save settings'), () => mutate('/api/pi/browser', { revision: state.revision, enabled: enabled.checked, headless: headless.checked }, 'PUT'), { primary: true });
        const settingsFoot = el('div', null, 'browser-card-foot');
        settingsFoot.append(saveNote, save);
        settingsCard.append(settingsHead, choices, settingsFoot);

        const programCard = el('section', null, 'browser-card browser-program-card');
        const programHead = el('div', null, 'browser-card-head');
        const programMark = el('span', null, 'browser-card-icon'); programMark.append(icon('fa-download'));
        const programCopy = el('div', null, 'browser-card-copy');
        programCopy.append(el('h4', t('浏览器程序', 'Browser program')), el('p', t('优先使用这台机器上的 Chrome 或 Edge；没有时可按需下载。', 'Uses Chrome or Edge on this machine when available; otherwise download a browser on demand.')));
        programHead.append(programMark, programCopy);
        const install = button(t('下载浏览器', 'Download browser'), () => mutate('/api/pi/browser/install', {}), { glyph: 'fa-download' });
        const close = button(t('关闭浏览器', 'Close browsers'), () => mutate('/api/pi/browser/close', {}), { glyph: 'fa-power-off' });
        const mcp = button(t('查看 MCP 连接', 'View MCP connections'), () => window.dispatchEvent(new CustomEvent('workspace:open-settings', { detail: { tab: 'mcp' } })), { glyph: 'fa-plug' });
        const controls = el('div', null, 'browser-controls');
        controls.append(install, close, mcp);
        const programNote = el('p', t('下载来自锁定的 Playwright 版本，浏览器安装在外置缓存中，可随时重新下载。', 'Downloads come from the pinned Playwright version and live in the external cache, so they can be downloaded again at any time.'), 'browser-note');
        programCard.append(programHead, controls, programNote);

        const layout = el('div', null, 'browser-layout');
        layout.append(settingsCard, programCard);

        const guide = el('section', null, 'browser-card browser-guide');
        guide.append(el('h4', t('使用说明', 'How it works')));
        const guideList = el('div', null, 'browser-guide-list');
        const guideItem = (glyph, title, body) => {
            const item = el('div', null, 'browser-guide-item');
            const mark = el('span', null, 'browser-guide-icon'); mark.append(icon(glyph));
            const copy = el('div');
            copy.append(el('strong', title), el('p', body));
            item.append(mark, copy);
            return item;
        };
        guideList.append(
            guideItem('fa-wand-magic-sparkles', t('开始使用', 'Get started'), t('启用或下载后，在对话菜单中空闲重开当前任务，或新建任务，然后直接告诉 Agent 要操作的网页。', 'After enabling or downloading, reopen the idle task from its conversation menu, or start a new task, then tell your agent which website to use.')),
            guideItem('fa-user-shield', t('登录与验证', 'Sign-in and verification'), t('每个对话单独保留浏览器资料和登录状态。取消后台运行后，可在部署端的浏览器窗口完成登录或验证码，再让 Agent 继续；手机上的此面板不提供远程点击接管。', 'Each conversation keeps its own browser profile and login state. Turn off background mode to complete sign-in or verification in the browser window on the host, then ask your agent to continue. This panel does not provide remote click control from a phone.')),
            guideItem('fa-shield-halved', t('关闭与维护', 'Closing and maintenance'), t('关闭浏览器会关闭相关空闲任务的运行连接，保留对话和登录资料。设置保存不会中断正在执行的任务；更新或备份前先关闭浏览器。', 'Closing browsers retires the affected idle task connections and preserves conversations and login profiles. Saving settings does not interrupt running tasks. Close browsers before updates or backups.'))
        );
        guide.append(guideList);

        root.append(header, feedback, statusCard, layout, guide);
        let state = null, active = false, generation = 0, readRevision = 0, writing = false;
        const api = (path, body, method = 'POST') => host.apiFetch(path, body === undefined ? undefined : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const show = (message, tone = 'info') => {
            feedback.textContent = message;
            if (message) feedback.dataset.tone = tone; else delete feedback.dataset.tone;
        };
        const dirty = () => Boolean(state) && (enabled.checked !== state.enabled || headless.checked !== state.headless);
        function paint() {
            const busy = Boolean(state?.busy) || writing;
            const unavailable = !state || busy;
            const installing = Boolean(state?.component.installing);
            enabled.disabled = headless.disabled = unavailable;
            install.disabled = unavailable || installing || Boolean(state?.component.available);
            close.disabled = unavailable || !state?.running;
            refresh.disabled = writing;
            save.disabled = unavailable || !dirty();
            saveNote.textContent = !state ? '' : state.busy ? t('有任务正在使用浏览器，完成后再修改设置。', 'Tasks are using browsers. Change settings when they finish.') : writing ? t('正在处理…', 'Working…') : dirty() ? t('有未保存的更改。', 'Unsaved changes.') : '';
            if (!state) {
                summary.textContent = t('正在读取状态…', 'Reading status…');
                programValue.textContent = sessionsValue.textContent = modeValue.textContent = '—';
                statusCard.dataset.tone = 'loading';
                return;
            }
            const ready = Boolean(state.component.available);
            statusCard.dataset.tone = !state.enabled ? 'off' : ready ? 'on' : installing ? 'busy' : 'warn';
            summary.textContent = !state.enabled
                ? t('未启用', 'Disabled')
                : ready ? t('已启用 · 浏览器已就绪', 'Enabled · Browser ready')
                : installing ? t('已启用 · 正在下载浏览器', 'Enabled · Downloading browser')
                : t('已启用 · 尚未安装浏览器', 'Enabled · No browser available');
            version.textContent = `Playwright MCP ${state.component.version}`;
            programValue.textContent = ready
                ? state.component.source === 'system' ? t('系统 Chrome / Edge', 'System Chrome / Edge') : t('已下载浏览器', 'Downloaded browser')
                : installing ? t('正在下载…', 'Downloading…') : t('尚未安装', 'Not installed');
            sessionsValue.textContent = String(state.sessions);
            modeValue.textContent = state.headless ? t('后台运行', 'Background') : t('显示窗口', 'Visible window');
        }
        async function load() {
            const ticket = generation, read = ++readRevision;
            try {
                const next = await api('/api/pi/browser');
                if (!active || ticket !== generation || read !== readRevision) return;
                state = next; enabled.checked = state.enabled; headless.checked = state.headless;
                if (state.component.error) show(reasons()[state.component.error] || state.component.error, 'error');
            } catch (error) { if (active && ticket === generation) show(reasons()[error.message] || error.message, 'error'); }
            finally { if (active && ticket === generation) paint(); }
        }
        async function mutate(path, body, method) {
            if (writing) return;
            writing = true; paint(); const ticket = generation;
            show(path.endsWith('/install') ? t('正在下载浏览器，请等待完成。', 'Downloading the browser. Please wait for completion.') : t('正在处理…', 'Working…'));
            try {
                await api(path, body, method);
                if (!active || ticket !== generation) return;
                show(path.endsWith('/install') ? t('浏览器下载完成，新设置将在任务重新打开后生效。', 'Browser downloaded. New settings apply when the task is reopened.')
                    : path.endsWith('/close') ? t('已关闭空闲任务中的浏览器连接。', 'Browser connections for idle tasks are closed.')
                    : t('设置已保存，将在任务重新打开后生效。', 'Settings saved. They apply when the task is reopened.'), 'success');
                await load();
            } catch (error) {
                if (active && ticket === generation) show(reasons()[error.message] || t('请求未完成，请刷新状态核对：', 'Request did not complete. Refresh to check: ') + error.message, 'error');
            }
            finally { writing = false; if (active) paint(); }
        }
        enabled.addEventListener('change', paint);
        headless.addEventListener('change', paint);
        paint();
        return {
            root,
            open() { active = true; generation++; root.classList.add('active'); show(''); void load(); },
            close() { active = false; generation++; root.classList.remove('active'); }
        };
    }
    window.PiBrowser = { create };
})();
