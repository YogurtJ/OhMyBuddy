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
    const KINDS = { openai_input_transformations: ['OpenAI', 'reasoning'], anthropic_input_transformations: ['Anthropic', 'thinking_dropped'] };
    function providerDrops(message) {
        const result = new Map();
        if (message?.role !== 'assistant' || !Array.isArray(message.diagnostics)) return result;
        let seen = 0;
        for (const diagnostic of message.diagnostics.slice(0, 50)) {
            const kind = KINDS[diagnostic?.type], values = diagnostic?.details?.transformations;
            if (!kind || !Array.isArray(values)) continue;
            const budget = 4096 - seen;
            if (budget <= 0) break;
            const slice = values.slice(0, budget);
            seen += slice.length;
            const removed = slice.filter(row => row?.type === kind[1]
                && (kind[1] !== 'reasoning' || row.action === 'removed' && row.reason !== 'turn_boundary'));
            if (!removed.length) continue;
            let entry = result.get(diagnostic.type);
            if (!entry) {
                entry = { type: diagnostic.type, provider: kind[0], count: 0, reasons: new Set(), ids: new Set(), allHaveIds: true };
                result.set(diagnostic.type, entry);
            }
            entry.count += removed.length;
            for (const row of removed) {
                if (typeof row.reason === 'string' && row.reason && entry.reasons.size < 64) entry.reasons.add(row.reason.slice(0, 100));
                if (typeof row.id === 'string' && row.id) entry.ids.add(row.id.slice(0, 200));
                else entry.allHaveIds = false;
            }
        }
        return result;
    }
    function isDiagnosticBaseline(message) {
        if (message?.role !== 'assistant') return false;
        if (providerDrops(message).size > 0) return true;
        return !['error', 'aborted', 'pending'].includes(message.stopReason);
    }
    // Providers report the same withheld historical reasoning items on every later request
    // that replays them (for example after compaction). Suppress unchanged repeats.
    function isRepeatedDrop(current, previous) {
        if (!previous) return false;
        if (current.count > previous.count) return false;
        if (current.allHaveIds && previous.allHaveIds) {
            for (const id of current.ids) if (!previous.ids.has(id)) return false;
        }
        for (const reason of current.reasons) if (!previous.reasons.has(reason)) return false;
        return true;
    }
    function appendMessage(host, message, options = {}) {
        const current = providerDrops(message);
        if (!current.size) return;
        const previous = options.previousAssistant ? providerDrops(options.previousAssistant) : null;
        for (const entry of current.values()) {
            if (previous && isRepeatedDrop(entry, previous.get(entry.type))) continue;
            const reasons = [...entry.reasons].slice(0, 12);
            const details = document.createElement('details'); details.className = 'pi-provider-diagnostic';
            const summary = document.createElement('summary'); summary.textContent = t('{0} 未沿用 {1} 段历史思考', entry.provider, entry.count);
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
    globalThis.PiRuntimeDiagnostics = { runtime, appendMessage, readResult, isDiagnosticBaseline };
})();
