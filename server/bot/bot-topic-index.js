'use strict';
// A fresh, read-only main-chat view of this Bot's other notebooks. No worker starts,
// polling, transcript excerpts or model calls. Failed/busy reads never mean “no items”.
const { readVerified } = require('./bot-recall');
const { readWindowBinding } = require('./bot-window-state');
const { replay } = require('./bot-ledger');
const { TOPIC_INDEX_INTRO } = require('./bot-topic-context');
const LIMITS = Object.freeze({ topics: 20, items: 40, perTopic: 3, title: 120, fileBytes: 2 * 1024 * 1024, totalBytes: 8 * 1024 * 1024, ms: 150 });
const line = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function openItems({ windows, profileId, cwd, directory, supervisor, pi, now = Date.now, limits = LIMITS }) {
    const started = now(), topics = windows.filter(window => window.kind === 'topic' && !window.archivedAt && !window.trashedAt);
    const result = []; let bytes = 0, items = 0;
    for (const window of topics.slice(0, limits.topics)) {
        const row = { windowId: window.id, title: line(window.title, 80), state: 'unavailable', items: [] };
        result.push(row);
        if (!window.current || window.cwd !== cwd || window.rotation) continue;
        if (!supervisor.isSessionIdle(window.current.sessionPath)) { row.state = 'busy'; continue; }
        if (now() - started >= limits.ms || bytes >= limits.totalBytes || items >= limits.items) { row.state = 'budget'; continue; }
        try {
            const text = readVerified(window.current.sessionPath, directory, Math.min(limits.fileBytes, limits.totalBytes - bytes));
            bytes += Buffer.byteLength(text);
            const entries = pi.parseSessionEntries(text);
            // Pi tolerates damaged lines when opening a session; an index cannot report
            // an empty notebook when the line that held it may have been skipped.
            if (entries.length !== text.split('\n').filter(value => value.trim()).length) throw new Error('Incomplete native notebook');
            const manager = pi.SessionManager.inMemory(cwd, undefined, entries);
            const binding = readWindowBinding(manager);
            if (manager.getCwd() !== cwd || manager.getSessionId() !== window.current.sessionId || binding?.profileId !== profileId
                || binding.windowId !== window.id || binding.generation !== window.current.generation) throw new Error('Topic marker changed');
            const active = replay(manager.getBranch()).items.filter(item => item.status === 'active' && ['open', 'commitment'].includes(item.kind));
            if (now() - started >= limits.ms) { row.state = 'budget'; continue; }
            row.state = 'ready';
            row.items = active.slice(0, Math.min(limits.perTopic, limits.items - items))
                .map(item => ({ title: line(item.text, limits.title), kind: item.kind, ...(item.due ? { due: item.due } : {}) }));
            row.omitted = active.length - row.items.length;
            items += row.items.length;
        } catch (error) { if (Number.isSafeInteger(error?.bytesRead)) bytes += error.bytesRead; }
    }
    return { v: 1, topics: result, omittedTopics: Math.max(0, topics.length - result.length) };
}

function renderOpenItems(index) {
    const lines = [TOPIC_INDEX_INTRO];
    if (!index) return lines.concat('- Index unavailable; open items are unknown.').join('\n');
    if (!index.topics.length && !index.omittedTopics) lines.push('- No other active topics.');
    for (const topic of index.topics) {
        const title = JSON.stringify(topic.title);
        if (topic.state !== 'ready') { lines.push(`- ${title}: ${topic.state}; open items unknown.`); continue; }
        if (!topic.items.length) lines.push(`- ${title}: no active open questions or promises in its notebook.`);
        else for (const item of topic.items) lines.push(`- ${title}: ${JSON.stringify(item.title)}${item.due ? ` (due ${item.due})` : ''}`);
        if (topic.omitted) lines.push(`  (${topic.omitted} more items omitted)`);
    }
    if (index.omittedTopics) lines.push(`- ${index.omittedTopics} more topics omitted; open items unknown.`);
    return lines.join('\n');
}
module.exports = { LIMITS, openItems, renderOpenItems };
