(() => {
    const t = (text, ...values) => globalThis.PiI18n?.t(text, ...values) || text.replace(/\{(\d+)\}/g, (_, i) => values[i] ?? `{${i}}`);
    const el = (tag, text, attrs = {}) => { const node = document.createElement(tag); if (text) node.textContent = text; for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); return node; };
    const phases = { preparing: '正在准备更新…', installing: '正在安装更新…', downloading: '正在下载并校验 Pivane…', unpacking: '正在解压更新…', verifying: '正在验证新版…', stopping: '正在安全停止 Pivane…', 'backing-up': '正在备份会话、配置和媒体…', starting: '正在启动新版…', retaining: '正在整理更新备份…', succeeded: '更新完成，正在重新连接…', failed: '更新失败，请查看下方信息。', interrupted: '上次更新已中断，请先核对当前版本和备份。' };
    function create({ apiFetch }) {
        const element = el('section', '', { class: 'updates-application', 'aria-label': t('更新 Pivane') });
        let snapshot, status, ticket, submitting = false, uncertain = false, timer, epoch = 0, visible = false, ownJob = null;
        const cancelTimer = () => { clearTimeout(timer); timer = null; };
        const request = (path, body) => apiFetch('/api/pi/settings/updates/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const terminal = job => job && ['succeeded', 'failed', 'interrupted'].includes(job.phase);
        const check = (label, id) => { const row = el('label', '', { class: 'maintenance-check' }), input = el('input', '', { type: 'checkbox', id }); row.append(input, el('span', t(label))); return { row, input }; };
        function draw(message) {
            element.replaceChildren();
            if (snapshot?.installMode !== 'managed-bundle') { element.hidden = true; return; }
            element.hidden = false;
            element.append(el('h4', t('更新 Pivane')));
            const job = status?.job;
            const feedback = el('p', message || (job ? t(phases[job.phase] || '正在准备更新…') : status?.idle === false ? t('正在等待会话启动和当前操作结束…') : t('更新会先下载和验证新版，再备份并重启。')), { role: 'status', 'aria-live': 'polite' });
            element.append(feedback);
            if (job?.output) { const details = el('details'), summary = el('summary', t('查看更新日志')), output = el('pre', job.output, { class: 'updates-operation-output' }); details.append(summary, output); element.append(details); }
            if (submitting || uncertain || status?.busy || job && !terminal(job)) return;
            if (ticket) {
                element.append(el('p', t('将从 {0} 更新到 {1}，并暂时断开所有设备连接。', snapshot.appVersion, ticket.version)));
                element.append(el('p', t('备份包含会话、配置和媒体。项目文件请另行备份，预约将在更新时暂停。')));
                const drafts = check('已保存草稿、附件和临时对话', 'updates-drafts-saved');
                const writers = check('已停止使用同一身份的外部 Pi 或其他写入进程', 'updates-writers-stopped');
                const actions = el('div', '', { class: 'updates-agent-action' }), confirm = el('button', t('更新并重启'), { type: 'button', class: 'settings-primary-button', id: 'updates-confirm-install' }), cancel = el('button', t('取消'), { type: 'button', class: 'settings-secondary-button' });
                confirm.disabled = true;
                const changed = () => { confirm.disabled = !(drafts.input.checked && writers.input.checked); };
                drafts.input.addEventListener('change', changed); writers.input.addEventListener('change', changed);
                cancel.addEventListener('click', () => { ticket = null; draw(); });
                confirm.addEventListener('click', () => { if (!confirm.disabled) void execute(); });
                actions.append(confirm, cancel); element.append(drafts.row, writers.row, actions); return;
            }
            if (snapshot.pivane?.status === 'available') {
                const install = el('button', t('更新到 {0}', snapshot.pivane.version), { type: 'button', class: 'settings-primary-button', id: 'updates-install-pivane' });
                install.disabled = !status?.supported || !status.appUpdateSupported || status.idle === false;
                install.addEventListener('click', () => void review()); element.append(install);
            }
            if (status && !status.supported) element.append(el('p', t('当前实例未通过独立更新器启动，请使用安装入口修复启动方式。')));
        }
        function schedule() { cancelTimer(); if (visible) timer = setTimeout(() => void poll(), 1500); }
        async function poll() {
            const n = epoch;
            try {
                const next = await apiFetch('/api/pi/settings/updates/maintenance');
                if (!visible || n !== epoch) return;
                status = next;
                // An unknown submission is resolved only by the exact job id.
                if (uncertain && next.job?.id === ownJob) { uncertain = false; submitting = false; }
                draw(uncertain ? t('更新提交结果尚未确认，请勿重复提交。正在核对状态…') : undefined);
                if (ownJob && next.job?.id === ownJob && terminal(next.job)) {
                    const succeeded = next.job.phase === 'succeeded'; ownJob = null; submitting = false;
                    try { sessionStorage.removeItem('pivane.application-update'); } catch {}
                    if (succeeded) { timer = setTimeout(() => window.location.reload(), 1500); return; }
                }
                if (uncertain || next.busy || next.idle === false || next.job && !terminal(next.job)) schedule();
            } catch {
                if (!visible || n !== epoch) return;
                draw(t('正在等待 Pivane 重新连接，请保持页面打开…')); schedule();
            }
        }
        async function review() {
            if (submitting || ticket || uncertain) return;
            const n = epoch; submitting = true; draw(t('正在核对更新版本和空闲状态…'));
            try { const next = await request('review', { action: 'application', channel: snapshot.channel }); if (visible && n === epoch) ticket = next; }
            catch (error) { submitting = false; if (visible && n === epoch) draw(error.message || t('无法准备更新，请稍后再试。')); return; }
            submitting = false; if (visible && n === epoch) draw();
        }
        async function execute() {
            if (submitting || uncertain || !ticket) return;
            const selected = ticket, n = epoch; ticket = null; ownJob = selected.id; submitting = true; draw(t('正在提交更新，请勿重复操作…'));
            // Persist before the one and only submission, including uncertain network outcomes.
            try { sessionStorage.setItem('pivane.application-update', ownJob); } catch {}
            try { await request('execute', { ticket: selected.id, confirmed: true, externalWritersStopped: true, draftsSaved: true }); }
            catch (error) {
                if (error.status >= 400 && error.status < 500) {
                    submitting = false; ownJob = null;
                    try { sessionStorage.removeItem('pivane.application-update'); } catch {}
                    if (visible && n === epoch) draw(error.message); return;
                }
                uncertain = true;
            }
            submitting = false;
            if (!visible || n !== epoch) return;
            await poll();
        }
        return {
            render(data) {
                snapshot = data;
                if (data.installMode !== 'managed-bundle') { element.hidden = true; return element; }
                if (!visible) { visible = true; epoch++; try { ownJob ||= sessionStorage.getItem('pivane.application-update'); } catch {} void poll(); }
                draw(); return element;
            },
            close() { visible = false; epoch++; ticket = null; cancelTimer(); }
        };
    }
    window.PiApplicationUpdate = { create };
})();
