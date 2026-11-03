(() => {
    const t = (zh, en) => window.PiI18n?.locale === 'en' ? en : zh;
    const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
    const button = (label, action, primary = false) => { const n = el('button', label, primary ? 'settings-primary-button' : 'settings-secondary-button'); n.type = 'button'; n.addEventListener('click', action); return n; };
    const reasons = () => ({
        BROWSER_BUSY: t('请等待相关任务结束，再刷新或修改浏览器设置。', 'Wait for the affected tasks to finish, then refresh or change browser settings.'),
        BROWSER_REVISION: t('设置已变化，请刷新后再保存。', 'Settings changed. Refresh before saving.'),
        BROWSER_INSTALL_FAILED: t('浏览器下载失败。请检查网络、代理和磁盘空间，再手动重试。', 'Browser download failed. Check the network, proxy and disk space before retrying.'),
        BROWSER_UNAVAILABLE: t('正在维护或关闭应用，请稍后再试。', 'The application is being maintained or shut down. Try again later.')
    });
    function create(host) {
        const root = el('section', null, 'workspace-settings-panel browser-panel'); root.dataset.settingsPanel = 'browser';
        root.append(el('h3', t('浏览器助手', 'Browser assistant')), el('p', t('让 Agent 打开网页、填写表单、上传附件和下载结果。使用官方 Playwright MCP，浏览器运行在部署 OhMyBuddy 的电脑或服务器上。', 'Let your agent open websites, fill forms, upload files and download results. Powered by official Playwright MCP on the computer or server hosting OhMyBuddy.')));
        const feedback = el('p', '', 'browser-feedback'); feedback.setAttribute('role', 'status');
        const summary = el('p', '', 'browser-summary');
        const config = el('div', null, 'browser-controls');
        const enabled = el('input'); enabled.type = 'checkbox'; enabled.setAttribute('aria-label', t('启用浏览器助手', 'Enable browser assistant'));
        const headless = el('input'); headless.type = 'checkbox'; headless.setAttribute('aria-label', t('在后台运行', 'Run in background'));
        const field = (caption, input) => { const label = el('label', null, 'browser-choice'); label.append(input, el('span', caption)); return label; };
        const save = button(t('保存设置', 'Save settings'), () => mutate('/api/pi/browser', { revision: state.revision, enabled: enabled.checked, headless: headless.checked }, 'PUT'), true);
        const install = button(t('下载浏览器', 'Download browser'), () => mutate('/api/pi/browser/install', {}));
        const refresh = button(t('刷新状态', 'Refresh status'), () => load());
        const close = button(t('关闭浏览器', 'Close browsers'), () => mutate('/api/pi/browser/close', {}));
        const mcp = button(t('查看 MCP 连接', 'View MCP connections'), () => window.dispatchEvent(new CustomEvent('workspace:open-settings', { detail: { tab: 'mcp' } })));
        config.append(field(t('启用浏览器助手', 'Enable browser assistant'), enabled), field(t('在后台运行', 'Run in background'), headless), save, install, refresh, close, mcp);
        const setup = el('p', t('优先使用这台机器上的 Chrome 或 Edge；没有时可按需下载。启用或下载后，在对话菜单中空闲重开当前任务，或新建任务，然后直接告诉 Agent 要操作的网页。', 'Uses Chrome or Edge on this machine when available; otherwise download a browser on demand. After enabling or downloading, reopen the idle task from its conversation menu, or start a new task, then tell your agent which website to use.'), 'browser-note');
        const login = el('p', t('每个对话单独保留浏览器资料和登录状态。取消后台运行后，可在部署端的浏览器窗口完成登录或验证码，再让 Agent 继续；手机上的此面板不提供远程点击接管。', 'Each conversation keeps its own browser profile and login state. Turn off background mode to complete sign-in or verification in the browser window on the host, then ask your agent to continue. This panel does not provide remote click control from a phone.'), 'browser-note');
        const stopping = el('p', t('关闭浏览器会关闭相关空闲任务的运行连接，保留对话和登录资料。设置保存不会中断正在执行的任务；更新或备份前先关闭浏览器。', 'Closing browsers retires the affected idle task connections and preserves conversations and login profiles. Saving settings does not interrupt running tasks. Close browsers before updates or backups.'), 'browser-note');
        root.append(feedback, summary, config, setup, login, stopping);
        let state = null, active = false, generation = 0, readRevision = 0, writing = false;
        const api = (path, body, method = 'POST') => host.apiFetch(path, body === undefined ? undefined : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const paint = () => {
            const unavailable = !state || writing || state.busy;
            enabled.disabled = headless.disabled = save.disabled = unavailable;
            install.disabled = unavailable || state?.component.installing || state?.component.available;
            close.disabled = unavailable || !state?.running;
            refresh.disabled = writing;
            if (state) summary.textContent = [state.enabled ? t('已启用', 'Enabled') : t('未启用', 'Disabled'), state.component.installing ? t('正在下载…', 'Downloading…') : state.component.available ? t('浏览器已就绪', 'Browser ready') : t('尚未安装浏览器', 'No browser available'), `Playwright MCP ${state.component.version}`, t(`已使用浏览器的任务：${state.sessions}`, `Tasks using browsers: ${state.sessions}`)].join(' · ');
        };
        async function load() {
            const ticket = generation, read = ++readRevision;
            try {
                const next = await api('/api/pi/browser');
                if (!active || ticket !== generation || read !== readRevision) return;
                state = next; enabled.checked = state.enabled; headless.checked = state.headless;
                if (state.component.error) feedback.textContent = reasons()[state.component.error] || state.component.error;
            } catch (error) { if (active && ticket === generation) feedback.textContent = reasons()[error.message] || error.message; }
            finally { if (active && ticket === generation) paint(); }
        }
        async function mutate(path, body, method) {
            if (writing) return;
            writing = true; paint(); const ticket = generation;
            feedback.textContent = path.endsWith('/install') ? t('正在下载浏览器，请等待完成。', 'Downloading the browser. Please wait for completion.') : t('正在处理…', 'Working…');
            try {
                await api(path, body, method);
                if (!active || ticket !== generation) return;
                feedback.textContent = t('已完成。新设置在任务重新打开后生效。', 'Done. New settings apply when the task is reopened.');
                await load();
            } catch (error) { if (active && ticket === generation) feedback.textContent = reasons()[error.message] || t('请求未完成，请刷新状态核对：', 'Request did not complete. Refresh to check: ') + error.message; }
            finally { writing = false; if (active) paint(); }
        }
        paint();
        return { root, open() { active = true; generation++; root.classList.add('active'); void load(); }, close() { active = false; generation++; root.classList.remove('active'); } };
    }
    window.PiBrowser = { create };
})();
