'use strict';
// Buddy forks use the native branch and a new window marker. The prepared window
// prevents a failed/interrupted fork from being repaired as an empty conversation.
const { randomUUID } = require('node:crypto');
const { readProfileBinding } = require('../pi-profile-state');
const { WINDOW_ENTRY, windowMarker, readWindowBinding } = require('./bot-window-state');
const { MAX_WINDOWS } = require('./bot-window-registry');
const { MAX_TOPICS, topicFields, topicId } = require('./bot-topic');
const settings = require('./bot-settings');
const fail = (message, code = 'BOT_FORK_INVALID', status = 409) => { throw Object.assign(new Error(message), { status, code }); };
const view = record => require('./bot-service').publicWindow(record);

async function sourceWindow(service, session, binding) {
    const { profile, bot } = await service.bot(binding.profileId);
    if (!settings.isBot(profile)) fail('这个伙伴已停用，请先启用', 'BOT_DISABLED');
    if (session.cwd !== bot.workspace) fail('聊天工作目录与伙伴不一致');
    const window = await service.windowRecord(binding.profileId, binding.windowId);
    if (window.archivedAt) fail('请先恢复已归档的话题', 'BOT_WINDOW_ARCHIVED');
    if (window.rotation) fail('聊天正在换代，请稍后重试', 'BOT_WINDOW_ROTATING');
    if (!window.generations.some(item => item.sessionId === session.id && item.sessionPath === session.path && item.generation === binding.generation))
        fail('聊天来源与伙伴话题不一致');
    return { window, profile };
}

async function prepare(service, profileId, source, origin, { title, id = randomUUID(), expectedRevision } = {}, beforeCommit = () => {}) {
    const fields = topicFields({ title: title ?? `${origin.title || '主聊天'} · 分支`.slice(0, 80),
        focus: source.focus || '', emoji: source.kind === 'topic' ? source.emoji : '' });
    const now = new Date().toISOString();
    const record = { id, kind: 'topic', ...fields, topicSeed: fields, instructions: source.instructions || '', groupId: source.groupId ?? null,
        cwd: source.cwd, createdAt: now, updatedAt: now, archivedAt: null, current: null, generations: [], rotation: null, forkOrigin: origin };
    const snapshot = await service.windows.read(profileId);
    // Finish legacy notebook import before adding another view of the same entries.
    await service.notebooks.ensureLocked(profileId, source.cwd, snapshot.state.windows);
    await service.windows.mutate(profileId, expectedRevision ?? snapshot.revision, state => {
        if ((state.deletedTopicIds || []).includes(id)) fail('这个话题已彻底删除', 'BOT_TOPIC_DELETED', 410);
        if (state.windows.some(item => item.id === id)) fail('话题创建结果待核对', 'BOT_TOPIC_CONFLICT');
        if (state.windows.filter(item => item.kind === 'topic' && !item.trashedAt).length >= MAX_TOPICS) fail('话题数量已达到上限', 'BOT_TOPIC_LIMIT');
        if (state.windows.length >= MAX_WINDOWS) fail('话题存储已满，请先清理回收站', 'BOT_TOPIC_TRASH_LIMIT');
        require('./bot-topic-management').assertGroup(state, record.groupId);
        beforeCommit(); state.windows.push(record); return {};
    });
    return record;
}

function initialize(profileId, record, manager) {
    manager.appendCustomEntry(WINDOW_ENTRY, windowMarker({ sessionId: manager.getSessionId(), profileId,
        windowId: record.id, kind: 'topic', generation: 0, topicSeed: record.topicSeed, forkOrigin: record.forkOrigin }));
}

async function fork(service, session, snapshot, input, execute, start) {
    const binding = await service.store.withSessionRead(session.cwd, session.id, (_session, read) => readWindowBinding(read.manager()));
    if (!binding) { start(); return execute(); }
    return service.profiles.reserve(async () => {
        const { window } = await sourceWindow(service, session, binding);
        const selected = input.entryId ? snapshot.entries.find(entry => entry.id === input.entryId) : null;
        if (input.entryId && !selected) fail('分叉位置已变化');
        if (input.position === 'at' && !require('../pi-message-payload').isReplyForkPoint(selected)) fail('请选择已完成的回复');
        if (selected && input.position !== 'at') require('../pi-message-payload').promptFromEntry(selected);
        const targetId = selected ? input.position === 'at' ? selected.id : selected.parentId : snapshot.leafId;
        const branch = targetId ? require('../pi-message-payload').activeBranch({ entries: snapshot.entries, leafId: targetId }) : [];
        const entryId = branch.findLast(entry => entry.type === 'message' && ['user', 'assistant'].includes(entry.message?.role))?.id ?? null;
        const origin = { windowId: window.id, sessionId: session.id, entryId, title: window.title || '主聊天' };
        const record = await prepare(service, binding.profileId, window, origin, { title: input.topicTitle }, start);
        const result = await execute({ initializeSession: manager => initialize(binding.profileId, record, manager) });
        await service.completeWindowLocked(binding.profileId, record);
        service.emit('botChanged', { profileId: binding.profileId, windowId: record.id });
        return { ...result, session: await service.store.getSession(result.session.cwd, result.session.id) };
    });
}

// An old ordinary fork is adoptable only through verified native parent links in
// this Buddy's workspace. An identity tag alone never grants Buddy window ownership.
async function preview(service, session) {
    const { SessionManager } = await require('../pi-session-store').getSdk();
    const inspected = await service.store.withSessionRead(session.cwd, session.id, (_session, read) => {
        const manager = read.manager();
        return { binding: readWindowBinding(manager), profileId: readProfileBinding(manager)?.profileId,
            leafId: manager.getLeafId(), header: manager.getHeader(), entries: manager.getEntries() };
    });
    if (inspected.binding) {
        const { window, profile } = await sourceWindow(service, session, inspected.binding);
        return { existing: true, profileId: profile.id, name: profile.name, window: view(window) };
    }
    if (!inspected.profileId) fail('这段聊天没有伙伴身份');
    const { profile, bot } = await service.bot(inspected.profileId);
    if (!settings.isBot(profile) || session.cwd !== bot.workspace) fail('只能收录这个伙伴工作目录中的分叉');
    const candidates = await service.store._nativeSessionMetadata(session.cwd, SessionManager);
    let current = inspected;
    const visited = new Set([session.id]);
    for (let depth = 0; depth < 16; depth++) {
        const legacy = current.entries.findLast(entry => entry.type === 'custom' && entry.customType === 'pivane-web-fork-origin');
        const parent = current.header?.parentSession;
        const candidate = parent ? candidates.find(item => item.path === parent) : legacy && candidates.find(item => item.id === legacy.data?.sessionId);
        if (!candidate || visited.has(candidate.id)) break;
        visited.add(candidate.id);
        const found = await service.store.withSessionRead(session.cwd, candidate.id, (source, read) => {
            const manager = read.manager();
            if (readProfileBinding(manager)?.profileId !== profile.id) fail('分叉来源的伙伴身份不一致');
            const shared = inspected.entries.findLast(entry => ['message', 'compaction'].includes(entry.type)
                && JSON.stringify(manager.getEntry(entry.id)) === JSON.stringify(entry));
            return { source, binding: readWindowBinding(manager), header: manager.getHeader(), entries: manager.getEntries(), sharedId: shared?.id ?? null };
        });
        if (found.binding) {
            const { window } = await sourceWindow(service, found.source, found.binding);
            if (!found.sharedId && inspected.entries.some(entry => entry.type === 'message') && !legacy)
                fail('无法核对分叉的原始上下文');
            return { existing: false, profileId: profile.id, name: profile.name, expectedLeafId: inspected.leafId,
                windowsRevision: (await service.windows.read(profile.id)).revision,
                title: (session.name || `${window.title || '主聊天'} · 分支`).slice(0, 80),
                origin: { windowId: window.id, sessionId: found.source.id, entryId: found.sharedId, title: window.title || '主聊天' }, sourceWindow: window };
        }
        current = found;
    }
    fail('无法核对这段分叉的伙伴聊天来源');
}

function publicPreview(result) {
    const { sourceWindow: _sourceWindow, ...publicResult } = result;
    return publicResult;
}

function adopt(service, session, input) {
    return service.profiles.reserve(() => service.supervisor.withSessionEdit(session.path, async worker => {
        let checked = await preview(service, session);
        if (checked.existing) return checked;
        if (input?.expectedLeafId !== checked.expectedLeafId || input?.windowsRevision !== checked.windowsRevision || input?.profileId !== checked.profileId)
            fail('聊天或话题列表已变化，请重新预览');
        const pending = { cwd: session.cwd, generations: [{ sessionId: session.id, sessionPath: session.path }] };
        await service.assertWindowQuiescent?.(pending);
        const queue = await service.supervisor.getQueueStore(); queue.assertMovable(session.path);
        if (worker) { worker._broadcast({ type: 'gateway_reconnect' }); await service.supervisor.stopSession(session.path); }
        checked = await preview(service, session);
        if (checked.existing || checked.expectedLeafId !== input.expectedLeafId || checked.windowsRevision !== input.windowsRevision)
            fail('聊天或话题列表已变化，请重新预览');
        const record = await prepare(service, checked.profileId, checked.sourceWindow, checked.origin,
            { id: topicId(session.id, 'buddy-fork-adoption'), title: input.title, expectedRevision: input.windowsRevision });
        await service.store.withSessionRead(session.cwd, session.id, (_session, read) => {
            read.validate(); initialize(checked.profileId, record, read.manager());
        });
        const completed = await service.completeWindowLocked(checked.profileId, record);
        service.store.sessionLists.delete(session.cwd);
        service.emit('botChanged', { profileId: checked.profileId, windowId: record.id });
        return { existing: true, profileId: checked.profileId, name: checked.name, window: view(completed) };
    }));
}

module.exports = { fork, preview, publicPreview, adopt };
