// Cards project successful native bot_schedule results. The scheduler remains authoritative.
(() => {
    const t = (text, ...values) => globalThis.PiI18n?.t?.(text, ...values) || text.replace(/\{(\d+)\}/g, (_, i) => values[i] ?? '');
    const node = (tag, className, text) => { const n = document.createElement(tag); n.className = className || ''; if (text != null) n.textContent = text; return n; };
    const idOk = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
    const valid = job => idOk(job?.id) && typeof job.title === 'string' && typeof job.message === 'string'
        && ['once', 'cron'].includes(job.schedule?.kind) && typeof job.schedule.timeZone === 'string' && Number.isSafeInteger(job.revision);
    const time = job => job.schedule.kind === 'once'
        ? new Date(job.schedule.at).toLocaleString(globalThis.PiI18n?.locale || 'zh-CN', { timeZone: job.schedule.timeZone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        : t('重复 · {0}', job.schedule.expression);
    function create(host) {
        const cards = new Map();
        function jobCard(saved, action, key) {
            const card = node('section', 'pi-bot-schedule-card'); card.dataset.jobId = saved.id;
            const head = node('header'), mark = node('i', 'fa-regular fa-calendar-check'); mark.setAttribute('aria-hidden', 'true');
            const copy = node('div'), title = node('strong', null, saved.title), state = node('small');
            state.textContent = action === 'cancelled' ? t('已取消') : t('已安排 · {0}', time(saved));
            copy.append(title, state); head.append(mark, copy);
            const text = node('p', null, saved.message), zone = node('small', 'pi-bot-schedule-zone', saved.schedule.timeZone);
            const foot = node('footer'), open = node('button', 'pi-bot-chip', t('查看 / 修改')), cancel = node('button', 'pi-bot-schedule-cancel', t('取消任务'));
            open.type = cancel.type = 'button';
            open.addEventListener('click', () => { if (host.context() === key) window.PiWorkspaceRoute?.navigate('cron', { jobId: saved.id }); });
            cancel.hidden = action === 'cancelled';
            cancel.addEventListener('click', async () => {
                if (host.context() !== key || cancel.disabled) return;
                cancel.disabled = true;
                try {
                    // Read fresh status; an edited job needs a fresh explicit decision, not a blind retry.
                    const snapshot = await host.api('/api/pi/cron');
                    if (!card.isConnected || host.context() !== key) return;
                    const current = snapshot.jobs?.find(job => job.id === saved.id);
                    if (!current) { state.textContent = t('已取消'); cancel.hidden = true; return; }
                    const accepted = await window.PiProfileDialog.confirm({ title: t('取消这项定时任务？'), message: current.name, accept: t('取消任务'), cancelLabel: t('保留') });
                    if (!accepted || !card.isConnected || host.context() !== key) return;
                    await host.api(`/api/pi/cron/jobs/${encodeURIComponent(saved.id)}/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ revision: current.revision, action: 'delete' }) });
                    if (card.isConnected && host.context() === key) { state.textContent = t('已取消'); cancel.hidden = true; }
                } catch (error) { if (host.context() === key) host.notify(error.message, 'error'); }
                finally { cancel.disabled = false; }
            });
            foot.append(open, cancel); card.append(head, text, zone, foot); return card;
        }
        return {
            render(message) {
                const receipt = message?.details?.pivaneBotSchedule, id = message?.toolCallId;
                if (message?.isError || message?.toolName !== 'bot_schedule' || receipt?.v !== 1 || !['created', 'cancelled', 'listed'].includes(receipt.action) || !id || cards.get(id)?.isConnected) return null;
                const jobs = receipt.action === 'listed' ? receipt.jobs : [receipt.job];
                if (!Array.isArray(jobs) || jobs.length > 100 || !jobs.every(valid)) return null;
                const key = host.context(), group = node('section', 'pi-bot-schedule-receipt'); group.dataset.readingKey = `schedule:${id}`;
                group.setAttribute('aria-label', t('定时任务'));
                try { for (const job of jobs) group.append(jobCard(job, receipt.action, key)); }
                catch { return null; }
                if (!jobs.length) group.append(node('p', 'pi-bot-schedule-empty', t('还没有定时任务。')));
                cards.set(id, group); return group;
            },
            reset() { cards.clear(); },
            prune() { for (const [key, card] of cards) if (!card.isConnected) cards.delete(key); }
        };
    }
    window.PiBotScheduleCards = Object.freeze({ create });
})();
