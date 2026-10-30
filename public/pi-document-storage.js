/* Project attachment browsing and explicitly confirmed storage cleanup. */
(() => {
    function mount({ host = document.body, request, getContext, getDraftIds = () => [], getSessions = async () => [],
        fetchFile, openSession, sessionImagesEnabled = () => false, onDeleted = () => {}, t = text => text } = {}) {
        if (typeof request !== 'function' || typeof getContext !== 'function') throw new Error('Attachment storage host callbacks required');
        const el = (tag, text, className) => { const n = document.createElement(tag); if (text) n.textContent = t(text); if (className) n.className = className; return n; };
        const button = (text, action, className) => { const n = el('button', text, className); n.type = 'button'; n.addEventListener('click', action); return n; };
        const dialog = el('dialog', null, 'pi-document-storage pi-native-dialog'); dialog.setAttribute('aria-label', t('附件管理'));
        const layout = el('div', null, 'pi-storage-layout'), header = el('header', null, 'pi-storage-header');
        const heading = el('div'); heading.append(el('h2', '附件管理'), el('p', '查看当前项目的已上传原件，下载文件或整理空间。'));
        const closeButton = button('关闭', close, 'pi-storage-close'); header.append(heading, closeButton);
        const overview = el('div', null, 'pi-storage-overview'); overview.hidden = true;
        const toolbar = el('div', null, 'pi-storage-toolbar');
        const search = el('input'); search.type = 'search'; search.placeholder = t('搜索文件名或来源对话'); search.setAttribute('aria-label', t('搜索附件'));
        const filter = el('select'); filter.setAttribute('aria-label', t('附件状态'));
        for (const [value, label] of [['all', '全部附件'], ['not-found', '可清理'], ['protected', '使用中'], ['unverified', '待核对']]) { const option = el('option', label); option.value = value; filter.append(option); }
        toolbar.append(search, filter); toolbar.hidden = true;
        const notice = el('section', null, 'pi-storage-notice'); notice.hidden = true;
        const status = el('p', null, 'pi-storage-status'); status.setAttribute('role', 'status');
        const content = el('div', null, 'pi-storage-content'); content.dataset.storageContent = '';
        const footer = el('footer', null, 'pi-storage-footer'), hint = el('span', '会话和草稿正在使用的附件会保留。');
        const refresh = button('刷新用量', () => { if (!loading) load(); }); footer.append(hint, refresh);
        const imageSection = el('section', null, 'pi-storage-notice pi-session-image-storage'); imageSection.dataset.sessionImageStorage = ''; imageSection.hidden = true;
        layout.append(header, overview, toolbar, notice, imageSection, status, content, footer); dialog.append(layout); host.append(dialog);
        let generation = 0, controller, cwd, loading = false, disposed = false, snapshot = null, sessions = new Map();
        const pending = new Map(), downloads = new Set(), imagePending = new Map();
        let imageBusy = false, imageController;
        const size = bytes => bytes === 0 ? '0 KB' : bytes < 1024 ** 2 ? `${Math.max(1, Math.ceil(bytes / 1024))} KB` : bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024 ** 3).toFixed(1)} GB`;
        const current = token => !disposed && dialog.open && token === generation;
        const drafts = () => [...getDraftIds(cwd)];
        function showError(error) {
            status.textContent = error.code === 'DOCUMENT_STORAGE_BUSY' || error.code === 'DOCUMENT_BUSY'
                ? t('清理前，请在各线程菜单中选择“退出运行实例”，再从设置 → 用量统计打开附件管理。对话和附件会保留。')
                : error.message || t('操作失败，请稍后再试');
            status.dataset.kind = 'error';
        }
        async function read(endpoint, body, token) {
            controller?.abort(); controller = new AbortController();
            const result = await request(endpoint, { method: 'POST', body, signal: controller.signal });
            return current(token) ? result : null;
        }
        function summary(label, value, detail) {
            const item = el('div', null, 'pi-storage-stat'); item.append(el('span', label), el('strong', value), el('small', detail)); return item;
        }
        function renderNotice() {
            notice.replaceChildren(); notice.hidden = !snapshot.warning && snapshot.complete;
            if (notice.hidden) return;
            notice.append(el('strong', snapshot.complete ? '部分文件需要核对' : '暂时无法清理，原件仍可查看和下载'),
                el('p', snapshot.complete ? '有未完成的清理记录，相关文件继续保留。' : '系统尚未确认全部附件的使用情况，已保留原件。可稍后刷新；持续出现时，请检查历史项目是否仍可访问。'));
            const details = el('details'); details.append(el('summary', '查看原因与清理说明'));
            if (snapshot.warning) details.append(el('p', snapshot.warning));
            details.append(el('p', '清理仅删除没有保存引用的原件。执行前需退出已打开的运行实例，并核对其他页面的草稿和保存的附件链接。'));
            notice.append(details);
        }
        function renderList() {
            if (!snapshot) return;
            const token = generation, owner = cwd, query = search.value.trim().toLocaleLowerCase();
            content.replaceChildren();
            const items = snapshot.items.filter(item => (filter.value === 'all' || item.savedReference === filter.value)
                && `${item.name} ${sessions.get(item.sessionId)?.name || ''}`.toLocaleLowerCase().includes(query));
            for (const item of items) {
                const row = el('article', null, 'pi-storage-file'); row.dataset.documentId = item.id;
                const format = item.format === 'image' ? 'IMG' : (item.name.split('.').at(-1) || item.format || 'FILE').slice(0, 6).toUpperCase();
                const icon = el('span', format, 'pi-storage-file-icon'); icon.dataset.format = item.format;
                const copy = el('div', null, 'pi-storage-file-copy'), name = el('strong', null, 'pi-storage-file-name'); name.textContent = item.name; name.title = item.name;
                const meta = el('p', null, 'pi-storage-file-meta'), date = new Date(item.createdAt);
                meta.textContent = size(item.size) + (Number.isFinite(date.getTime()) ? ' · ' + date.toLocaleDateString() : '');
                copy.append(name, meta);
                const source = sessions.get(item.sessionId);
                if (openSession && item.sessionId) {
                    const link = button(source?.name || '查看来源对话', async () => {
                        if (!current(token)) return;
                        close(); const closedAt = generation;
                        try { await openSession({ cwd: owner, sessionId: item.sessionId }); }
                        catch (error) {
                            if (generation === closedAt && !dialog.open && !disposed) { dialog.showModal(); await load(); showError(error); }
                        }
                    }, 'pi-storage-source');
                    link.title = t('来源对话') + ' · ' + item.sessionId; copy.append(link);
                } else copy.append(el('small', source?.name || '已上传原件', 'pi-storage-file-meta'));
                const actions = el('div', null, 'pi-storage-file-actions');
                const kind = item.deletionPending ? 'unverified' : item.savedReference;
                const label = item.deletionPending ? '清理待确认' : kind === 'protected' ? '使用中' : kind === 'not-found' && snapshot.complete ? '可清理' : '待核对';
                const badge = el('span', label, 'pi-storage-badge'); badge.dataset.state = kind; actions.append(badge);
                if (fetchFile && !item.deletionPending) actions.append(button('下载原件', event => download(item, event.currentTarget, token, owner)));
                if (snapshot.complete && item.savedReference === 'not-found' && !item.deletionPending) {
                    const clean = button('检查并清理', () => preview(item, clean, token), 'pi-storage-clean'); clean.disabled = pending.has(cwd); actions.append(clean);
                }
                row.append(icon, copy, actions); content.append(row);
            }
            if (!items.length) {
                const empty = el('div', null, 'pi-storage-empty');
                empty.append(el('strong', snapshot.items.length ? '没有匹配的附件' : '当前项目还没有已上传附件'),
                    el('p', snapshot.items.length ? '试试其他文件名或切换附件状态。' : '通过输入框的“添加附件”上传后，可以在这里查看原件。'));
                content.append(empty);
            }
            resultNotice(token);
        }
        async function download(item, node, token, owner) {
            if (node.disabled || !current(token)) return;
            const abort = new AbortController(); downloads.add(abort); node.disabled = true; node.textContent = t('正在下载…');
            try {
                const blob = await fetchFile({ cwd: owner, item, signal: abort.signal });
                if (!current(token)) return;
                const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = item.name;
                link.hidden = true; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
            } catch (error) { if (current(token) && error.name !== 'AbortError') showError(error); }
            finally { downloads.delete(abort); if (current(token)) { node.disabled = false; node.textContent = t('下载原件'); } }
        }
        function resultNotice(token) {
            const receipt = pending.get(cwd); if (!receipt) return;
            const owner = cwd;
            status.textContent = t('清理结果尚未确认，请查询结果。不会重复提交清理。');
            const check = button('查询清理结果', async () => {
                if (loading) return; loading = true; check.disabled = true;
                try {
                    const result = await request('/uploads/storage/status?' + new URLSearchParams({ cwd: owner, requestId: receipt.requestId }), { method: 'GET' });
                    if (!current(token)) return;
                    if (result.state === 'deleted') { pending.delete(owner); onDeleted([result.id]); await load(); }
                    else status.textContent = t('清理结果仍不确定，请保留附件并联系管理员核对。');
                } catch (e) { if (current(token)) showError(e); }
                finally { if (current(token)) { loading = false; check.disabled = false; } }
            }); content.prepend(check);
        }
        async function preview(item, node, token) {
            if (loading || pending.has(cwd)) return; loading = true; node.disabled = true;
            status.textContent = t('正在检查文件是否可以清理…'); delete status.dataset.kind;
            try {
                const result = await read('/uploads/storage/preview', { cwd, id: item.id, draftIds: drafts() }, token); if (!result) return;
                toolbar.hidden = true; notice.hidden = true; content.replaceChildren();
                const panel = el('div', null, 'pi-storage-confirm');
                const name = el('strong'); name.textContent = item.name;
                const message = el('p'); message.textContent = t('将永久删除这个原件，释放空间：') + size(item.size);
                const label = el('label'), confirmed = el('input'); confirmed.type = 'checkbox';
                label.append(confirmed, document.createTextNode(t('我已核对其他页面的草稿及附件链接，停止使用同一数据的外部 Pi 进程，并确认删除原件。')));
                const confirm = button('永久删除原件', () => cleanup(result, confirm, token), 'pi-storage-danger'); confirm.disabled = true;
                confirmed.addEventListener('change', () => { confirm.disabled = !confirmed.checked; });
                const actions = el('div', null, 'pi-storage-confirm-actions'); actions.append(button('取消', load), confirm);
                panel.append(el('h3', '确认清理'), name, message, el('p', '没有发现已保存的引用。其他页面尚未发送的草稿、或在别处保存的链接可能会失效。'), label, actions); content.append(panel);
                status.textContent = '';
            } catch (e) { if (current(token)) showError(e); }
            finally { if (current(token)) { loading = false; node.disabled = false; } }
        }
        async function cleanup(previewResult, node, token) {
            if (loading || node.disabled || pending.has(cwd)) return;
            const owner = cwd;
            let requestId, currentDrafts;
            try { requestId = 'cleanup-' + Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''); currentDrafts = drafts(); }
            catch (error) { showError(error); return; }
            loading = true;
            const body = { cwd: owner, ticket: previewResult.ticket, revision: previewResult.revision, requestId, confirmed: true, externalWritersStopped: true, draftIds: currentDrafts };
            pending.set(owner, { requestId });
            content.querySelectorAll('button,input').forEach(n => { n.disabled = true; }); refresh.disabled = true;
            status.textContent = t('正在清理，请等待结果。');
            try {
                // Submitted deletion is never aborted or automatically replayed.
                const result = await request('/uploads/storage/cleanup', { method: 'POST', body });
                if (result.state === 'deleted') { pending.delete(owner); onDeleted([result.id]); }
                if (!current(token)) return;
                if (result.state === 'deleted') await load();
                else { content.replaceChildren(); resultNotice(token); }
            } catch (e) {
                const rejected = (e.status >= 400 && e.status < 500 || e.status === 503) && ['DOCUMENT_STORAGE_CHANGED', 'DOCUMENT_PROTECTED', 'DOCUMENT_INPUT',
                    'DOCUMENT_SCOPE', 'DOCUMENT_BUSY', 'DOCUMENT_SCAN_INCOMPLETE', 'DOCUMENT_STORAGE_BUSY'].includes(e.code);
                if (rejected) pending.delete(owner);
                if (!current(token)) return;
                content.replaceChildren(); showError(e); if (!rejected) resultNotice(token);
            } finally { if (current(token)) { loading = false; refresh.disabled = false; } }
        }
        function renderImageHome() {
            imageSection.hidden = !sessionImagesEnabled(); imageSection.replaceChildren();
            if (imageSection.hidden) return;
            imageSection.append(el('h3', '会话图片与 Buddy 图片'), el('p', '删除后的图片会先检查共享引用。回收站中的会话和 Buddy 仍受保护；无引用图片先隔离保留 30 天，再由你确认永久清理。'));
            const pending = imagePending.get(cwd);
            imageSection.append(button(pending ? '查询图片清理结果' : '检查会话图片用量', () => pending ? imageResult() : imageUsage()));
        }
        function imageError(error) {
            const message = error.code === 'DOCUMENT_STORAGE_BUSY' || error.code === 'IMAGE_STORAGE_BUSY'
                ? '请先退出各线程的运行实例，再检查并清理会话图片。' : error.message || t('图片清理结果待核对');
            imageSection.append(el('p', message));
        }
        async function imageUsage() {
            if (imageBusy || loading) return;
            const token = generation, owner = cwd; imageBusy = true;
            imageController?.abort(); imageController = new AbortController();
            try {
                const result = await request('/session-images/storage/usage', { method: 'POST', body: { cwd: owner }, signal: imageController.signal });
                if (!current(token)) return;
                renderImageHome();
                imageSection.append(el('p', t('图片占用：') + size(result.totalBytes) + ' · ' + t('隔离区：') + size(result.quarantineBytes)));
                if (result.warning) imageSection.append(el('p', result.warning));
                if (result.complete && !imagePending.has(owner)) {
                    if (result.reclaimableCount) imageSection.append(button(t('隔离无引用图片') + ' (' + result.reclaimableCount + ' · ' + size(result.reclaimableBytes) + ')', () => imagePreview('quarantine')));
                    if (result.purgeableCount) imageSection.append(button(t('永久清理到期图片') + ' (' + result.purgeableCount + ' · ' + size(result.purgeableBytes) + ')', () => imagePreview('purge'), 'pi-storage-danger'));
                    for (const record of result.trash) {
                        const row = el('div', null, 'pi-storage-file'), label = el('span'); label.textContent = (record.name || t('已删除会话')) + ' · ' + size(record.bytes);
                        row.append(label, button('放弃该会话的图片恢复保护', () => imagePreview('release', record.id))); imageSection.append(row);
                    }
                    if (!result.reclaimableCount && !result.purgeableCount) imageSection.append(el('p', '当前没有可回收的图片。Buddy 回收站、归档和其他分支仍在使用的图片会保留。'));
                }
            } catch (error) { if (current(token) && error.name !== 'AbortError') imageError(error); }
            finally { if (current(token)) imageBusy = false; }
        }
        async function imagePreview(action, recordId) {
            if (imageBusy || loading || imagePending.has(cwd)) return;
            const token = generation, owner = cwd; imageBusy = true;
            try {
                const result = await request('/session-images/storage/preview', { method: 'POST', body: { cwd: owner, action, ...(recordId ? { recordId } : {}) } });
                if (!current(token)) return;
                renderImageHome();
                const panel = el('div', null, 'pi-storage-confirm');
                panel.append(el('h3', action === 'release' ? '放弃图片恢复保护' : action === 'purge' ? '确认永久清理图片' : '确认隔离无引用图片'));
                const description = action === 'release' ? '这会放弃已删除会话的图片恢复保护，不会删除其他仍在使用这些图片的会话。'
                    : action === 'purge' ? '这些图片已隔离至少 30 天。永久清理后，只有外部备份才能恢复图片。'
                    : '这些图片没有找到保存引用。隔离期间仍可供恢复的会话读取；至少保留 30 天，不会立即释放磁盘空间。';
                panel.append(el('p', description), el('p', result.count + ' · ' + size(result.bytes)));
                const label = el('label'), checked = el('input'); checked.type = 'checkbox';
                label.append(checked, document.createTextNode(t('我已检查系统回收站及外部会话备份，确认没有需要保留的额外图片引用，并已停止使用同一身份目录的外部 Pi 进程。')));
                const confirm = button('确认执行图片清理', () => imageCleanup(result, token, confirm), 'pi-storage-danger'); confirm.disabled = true;
                checked.addEventListener('change', () => { confirm.disabled = !checked.checked; });
                panel.append(label, confirm, button('取消', renderImageHome)); imageSection.append(panel);
            } catch (error) { if (current(token)) imageError(error); }
            finally { if (current(token)) imageBusy = false; }
        }
        function clearImagePending(owner, requestId) {
            if (imagePending.get(owner)?.requestId === requestId) imagePending.delete(owner);
        }
        async function imageCleanup(preview, token, node) {
            if (imageBusy || loading || node.disabled || imagePending.has(cwd)) return;
            const owner = cwd, requestId = 'image-cleanup-' + Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
            imageBusy = true; imagePending.set(owner, { requestId }); node.disabled = true;
            try {
                // Do not abort or retry an accepted destructive operation on close.
                const result = await request('/session-images/storage/cleanup', { method: 'POST', body: { cwd: owner, ticket: preview.ticket,
                    revision: preview.revision, requestId, confirmed: true, externalWritersStopped: true, externalRestoreReviewed: true } });
                if (result.state === 'completed') clearImagePending(owner, requestId);
                if (current(token)) { renderImageHome(); imageSection.append(el('p', result.state === 'completed' ? '图片清理操作已完成。隔离中的图片仍会保留，永久清理后才释放对应空间。' : '图片清理结果待核对')); }
            } catch (error) {
                if ((error.status >= 400 && error.status < 500 || error.status === 503)
                    && ['IMAGE_STORAGE_CHANGED', 'IMAGE_STORAGE_INPUT', 'IMAGE_STORAGE_PROTECTED', 'IMAGE_STORAGE_BUSY', 'IMAGE_STORAGE_INCOMPLETE', 'DOCUMENT_STORAGE_BUSY', 'DOCUMENT_SCAN_INCOMPLETE', 'DOCUMENT_STORAGE_CHANGED'].includes(error.code)) clearImagePending(owner, requestId);
                if (current(token)) { renderImageHome(); imageError(error); }
            } finally { if (current(token)) imageBusy = false; }
        }
        async function imageResult() {
            const pending = imagePending.get(cwd); if (!pending || imageBusy) return;
            const token = generation, owner = cwd; imageBusy = true;
            try {
                const result = await request('/session-images/storage/status?' + new URLSearchParams({ cwd: owner, requestId: pending.requestId }), { method: 'GET' });
                if (result.state === 'completed') clearImagePending(owner, pending.requestId);
                if (current(token)) { renderImageHome(); imageSection.append(el('p', result.state === 'completed' ? '图片清理操作已完成。' : '图片清理结果仍不确定，相关图片已保留，请联系管理员核对。')); }
            } catch (error) { if (current(token)) imageError(error); }
            finally { if (current(token)) imageBusy = false; }
        }
        async function load() {
            const token = ++generation; loading = true; refresh.disabled = true; content.replaceChildren(); status.textContent = t('正在读取附件用量…'); delete status.dataset.kind;
            toolbar.hidden = true; notice.hidden = true;
            try {
                const [result, names] = await Promise.all([read('/uploads/storage/usage', { cwd, draftIds: drafts() }, token), Promise.resolve().then(() => getSessions(cwd)).catch(() => [])]);
                if (!result || !current(token)) return;
                snapshot = result; sessions = new Map(names.map(session => [session.id, session]));
                const bytes = result.items.reduce((sum, item) => sum + item.size, 0), removable = result.complete ? result.items.filter(i => i.savedReference === 'not-found' && !i.deletionPending) : [];
                overview.replaceChildren(summary('当前项目', `${result.items.length} ` + t('个附件'), size(bytes)),
                    summary('全部附件占用', size(result.totalBytes), t('容量上限') + ' ' + size(result.limits.bytes)),
                    summary('可清理空间', result.complete ? size(removable.reduce((sum, item) => sum + item.size, 0)) : '—', result.complete ? `${removable.length} ` + t('个附件') : t('等待引用核对')));
                overview.hidden = false; toolbar.hidden = false; status.textContent = ''; renderNotice(); renderList();
            } catch (e) { if (current(token) && e.name !== 'AbortError') showError(e); }
            finally { if (current(token)) { loading = false; refresh.disabled = false; } }
        }
        function close() { generation++; controller?.abort(); imageController?.abort(); imageBusy = false; for (const abort of downloads) abort.abort(); downloads.clear(); loading = false; if (dialog.open) dialog.close(); }
        dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
        search.addEventListener('input', renderList); filter.addEventListener('change', renderList);
        return {
            dialog,
            open(context = getContext()) {
                if (disposed) return;
                cwd = typeof context === 'string' ? context : context?.cwd;
                if (!cwd) throw new Error(t('请先选择项目'));
                search.value = ''; filter.value = 'all'; snapshot = null; overview.hidden = true;
                renderImageHome();
                if (!dialog.open) dialog.showModal(); closeButton.focus({ preventScroll: true }); load();
            }, close, dispose() { close(); disposed = true; dialog.remove(); }
        };
    }
    globalThis.PiDocumentStorage = { mount };
})();
