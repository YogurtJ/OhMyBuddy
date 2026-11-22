(() => {
    const t = (text, ...args) => globalThis.PiI18n?.t(text, ...args) || text.replace(/\{(\d+)\}/g, (_, i) => args[i] ?? '');
    function runtime(host, values) {
        if (!host) return;
        const rows = (Array.isArray(values) ? values : []).slice(0, 50)
            .filter(row => ['error', 'warning', 'info'].includes(row?.type) && typeof row.message === 'string')
            .map(row => ({ type: row.type, message: row.message.slice(0, 2000) }));
        const key = JSON.stringify(rows);
        if (host._piDiagnosticKey === key) return;
        host._piDiagnosticKey = key;
        const open = host.querySelector('details')?.open;
        host.replaceChildren(); host.hidden = !rows.length;
        if (!rows.length) return;
        const details = document.createElement('details'); details.open = open ?? rows.some(row => row.type === 'error');
        const summary = document.createElement('summary'); summary.textContent = t('运行提示 · {0}', rows.length);
        const list = document.createElement('ul');
        for (const row of rows) {
            const item = document.createElement('li'); item.dataset.severity = row.type;
            item.textContent = row.message; list.append(item);
        }
        details.append(summary, list); host.append(details);
    }
    function appendMessage(host, message) {
        if (message?.role !== 'assistant') return;
        const kinds = { openai_input_transformations: ['OpenAI', 'reasoning'], anthropic_input_transformations: ['Anthropic', 'thinking_dropped'] };
        for (const diagnostic of (Array.isArray(message.diagnostics) ? message.diagnostics : []).slice(0, 50)) {
            const kind = kinds[diagnostic?.type], values = diagnostic?.details?.transformations;
            if (!kind || !Array.isArray(values)) continue;
            const removed = values.slice(0, 4096).filter(row => row?.type === kind[1]
                && (kind[1] !== 'reasoning' || row.action === 'removed' && row.reason !== 'turn_boundary'));
            if (!removed.length) continue;
            const reasons = [...new Set(removed.map(row => typeof row.reason === 'string' ? row.reason.slice(0, 100) : '').filter(Boolean))].slice(0, 12);
            const details = document.createElement('details'); details.className = 'pi-provider-diagnostic';
            const summary = document.createElement('summary'); summary.textContent = t('{0} 未沿用 {1} 段历史思考', kind[0], removed.length);
            const text = document.createElement('p');
            text.textContent = t('服务商未将这些思考内容用于本次请求，原始记录仍保留。')
                + (reasons.length ? ' ' + t('原因：{0}', reasons.join(', ')) : '');
            details.append(summary, text); host.append(details);
        }
    }
    function readResult(row, result) {
        const id = result?.details?.imageUnsupportedByModel;
        let badge = row.querySelector('.pi-tool-image-warning');
        if (row.dataset.toolName !== 'read' || result?.isError || typeof id !== 'string' || !id || id.length > 500) { badge?.remove(); return; }
        if (!badge) {
            badge = document.createElement('span'); badge.className = 'pi-tool-image-warning';
            row.querySelector('summary > strong')?.after(badge);
        }
        badge.textContent = t('图片未输入');
        badge.title = t('读取时的模型 {0} 不支持图片，本次收到的是占位提示；原图保留。', id);
    }
    globalThis.PiRuntimeDiagnostics = { runtime, appendMessage, readResult };
})();
