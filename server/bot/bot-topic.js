'use strict';
const { createHash } = require('node:crypto');
const fail = (message, status = 400, code) => { throw Object.assign(new Error(message), { status, code }); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const MAX_TOPICS = 100;
const DEFAULT_TOPIC_TITLES = Object.freeze({ 'zh-CN': '新话题', en: 'New topic' });
const defaultTopicTitle = value => Object.values(DEFAULT_TOPIC_TITLES).includes(String(value ?? '').trim());

// Shared by HTTP and the worker: no coercion, unknown fields or empty titles.
// Optional title on create defaults to '新话题' so one click opens a fresh topic immediately.
function topicFields(raw, { patch = false, revision = false, requireTitle = false } = {}) {
    const allowed = ['title', 'focus', 'emoji', ...(patch ? ['archived'] : []), ...(revision ? ['expectedRevision'] : [])];
    if (!object(raw) || Object.keys(raw).some(key => !allowed.includes(key))) fail('Invalid topic fields');
    if (revision && (typeof raw.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(raw.expectedRevision))) fail('Expected windows revision is required');
    const result = {};
    for (const [key, max] of [['title', 80], ['focus', 500], ['emoji', 16]]) {
        if (!Object.hasOwn(raw, key)) continue;
        const value = raw[key];
        if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f]/.test(value) || key === 'title' && !value.trim())
            fail(`Invalid topic ${key} (maximum ${max} characters)`);
        result[key] = value.trim();
    }
    if (!patch && !Object.hasOwn(result, 'title')) {
        if (requireTitle) fail('A topic title is required');
        result.title = DEFAULT_TOPIC_TITLES['zh-CN'];
    }
    if (Object.hasOwn(raw, 'archived')) {
        if (typeof raw.archived !== 'boolean') fail('Invalid topic archived flag');
        result.archived = raw.archived;
    }
    if (patch && !Object.keys(result).length) fail('Nothing to update');
    return patch ? result : { focus: '', emoji: '', ...result };
}

// Private stable namespace: one native tool call can create at most one logical topic.
function topicId(sessionId, toolCallId) {
    const hex = createHash('sha256').update(JSON.stringify(['pivane-bot-topic-v1', sessionId, toolCallId])).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function mountBotTopics(router, { bots, authenticate }) {
    for (const action of ['create', 'open-items']) router.post(`/bot-topics/${action}`, async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            const worker = authenticate(req)?.worker;
            if (!worker || worker.disposed || worker.restarting || worker.noSession || !worker.loadedBot) fail('A live Bot window worker is required', 403);
            if (action === 'open-items') {
                if (!object(req.body) || Object.keys(req.body).length) fail('Invalid open-items request');
                return res.json(await bots.openItems(worker));
            }
            if (!object(req.body)) fail('Invalid topic request');
            const { toolCallId, ...raw } = req.body;
            if (typeof toolCallId !== 'string' || !toolCallId.trim() || toolCallId.length > 500) fail('A stable toolCallId is required');
            const fields = topicFields(raw, { requireTitle: true });
            const result = await bots.proposeTopic(worker, toolCallId, fields);
            return res.json({ v: 1, action: 'created', profileId: worker.loadedBot.profileId, window: result.window });
        } catch (error) { res.status(error.status || 400).json({ error: error.message, code: error.code }); }
    });
}

// Stored thread targets may use an allowed path alias while native references are canonical.
function sameThreadTarget(target, refs, resolveProject = value => value) {
    if (!target || typeof target.cwd !== 'string' || typeof target.sessionId !== 'string') return false;
    let cwd;
    try { cwd = resolveProject(target.cwd); } catch { return false; }
    return refs.some(ref => ref.cwd === cwd && ref.sessionId === target.sessionId);
}

module.exports = { MAX_TOPICS, DEFAULT_TOPIC_TITLES, defaultTopicTitle, topicFields, topicId, mountBotTopics, sameThreadTarget };
