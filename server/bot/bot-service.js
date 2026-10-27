'use strict';
// Bot Mode coordinator: Bots are profiles with a `bot` section; each Bot owns a private
// workspace directory (its project cwd) and permanent windows whose current native
// session generation is resolved here. Profile and window writes run under the shared
// profile/settings reservation (reserved synchronously, before any await).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { getSdk } = require('../pi-session-store');
const { validateProfile, profileRevision } = require('../pi-profile-registry');
const settings = require('./bot-settings');
const { BotWindowRegistry, MAX_WINDOWS } = require('./bot-window-registry');
const { MAX_TOPICS, defaultTopicTitle, topicFields, topicId, sameThreadTarget } = require('./bot-topic');
const { WINDOW_ENTRY, windowMarker, readWindowBinding } = require('./bot-window-state');
const { HANDOFF_MESSAGE, buildHandoff } = require('./bot-handoff');
const ledger = require('./bot-ledger');
const { LEDGER_ENTRY } = ledger;
const { rotationReason, freshRotationSummary } = require('./bot-maintenance');
const history = require('./bot-history');
const setup = require('./bot-setup');
const onboardingFlow = require('./bot-onboarding');
const { EventEmitter } = require('node:events');

const MOVING = '这段聊天正在换到新的记录文件，请稍后再试';
// Entries of a native JSONL file (one per line after the header), read in bounded chunks.
function countLines(file) {
    const fd = fs.openSync(file, 'r'), buffer = Buffer.alloc(1024 * 1024);
    let lines = 0, read;
    try { while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) for (let i = 0; i < read; i++) if (buffer[i] === 10) lines++; }
    finally { fs.closeSync(fd); }
    return Math.max(0, lines - 1);
}
const fail = (message, status = 400, code) => { throw Object.assign(new Error(message), { status, ...(code ? { code } : {}) }); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const UUID = /^[a-f0-9-]{36}$/;
const WORKSPACE_PARENT = 'PivaneBots';
const MAX_BOTS = 50;
const PLACEHOLDER = Object.freeze({ 'zh-CN': '新伙伴', en: 'New buddy' });
const DEFAULT_AVATAR = Object.freeze({ kind: 'preset', id: 'pivane-pebble' });
const LEGACY_DEFAULT_AVATAR = Object.freeze({ kind: 'emoji', value: '✨' });
// Whether the user has picked the name and the face, kept across a new interview: recorded when
// they save one on a setup card or in Bot settings (bot.chosen), else inferred (older records,
// the identity page) from the interview's name/face step (or the older combined identity step)
// or a value a new Bot does not start with. A later setup card keeps these unless the user asks (UAT-03).
function chosenIdentity(profile, bot) {
    const steps = bot.onboarding?.steps || {}, both = steps.identity === 'done', avatar = profile.avatar;
    // Only new records carry this default marker. A pre-existing 小石 choice remains chosen.
    const defaultFace = isDeepStrictEqual(avatar, LEGACY_DEFAULT_AVATAR)
        || bot.onboarding?.defaultAvatar === DEFAULT_AVATAR.id && isDeepStrictEqual(avatar, DEFAULT_AVATAR);
    return { name: bot.chosen?.name === true || both || steps.name === 'done' || !Object.values(PLACEHOLDER).includes(profile.name),
        avatar: bot.chosen?.avatar === true || both || steps.avatar === 'done' || Boolean(avatar) && !defaultFace };
}
// Interview steps answered elsewhere count as settled; the older combined step covers name and face.
const settled = (steps, step) => Boolean(steps[step]) || (step === 'name' || step === 'avatar') && steps.identity === 'done';

// What the notebook panel shows: every note except tombstones, with the quote it came from
// (kept with the note), or else a short excerpt of the message when it is in the current generation.
function notebookView(state, branch, current) {
    const byId = new Map(branch.map(entry => [entry.id, entry]));
    const excerpt = source => {
        if (source?.quote) return { role: source.role, text: source.quote };
        if (!source || source.sessionId !== current.sessionId) return null;
        const message = byId.get(source.entryId)?.message;
        if (!message || !['user', 'assistant', 'toolResult'].includes(message.role)) return null;
        const text = (typeof message.content === 'string' ? message.content : Array.isArray(message.content)
            ? message.content.filter(part => part?.type === 'text').map(part => part.text).join(' ') : '').replace(/\s+/g, ' ').trim();
        return text ? { role: message.role, text: text.length > 160 ? text.slice(0, 159) + '…' : text } : null;
    };
    return { generation: current.generation, version: ledger.ledgerVersion(state),
        items: state.items.filter(item => item.status !== 'deleted').map(item => ({ id: item.id, kind: item.kind, text: item.text, status: item.status,
            due: item.due, by: item.by, supersedes: item.supersedes, createdAt: item.createdAt, updatedAt: item.updatedAt, source: excerpt(item.source) })) };
}

function publicWindow(window) {
    const { id, kind, title, emoji, focus, createdAt, updatedAt, archivedAt, current, generations } = window;
    return { id, kind, title, emoji, focus, createdAt, updatedAt, archivedAt,
        generation: current?.generation ?? null, sessionId: current?.sessionId ?? null, generations: generations.length };
}

class BotService extends EventEmitter {
    constructor({ store, profiles, supervisor, getAgentDir, documents = null, catalog = null }) {
        super();
        this.store = store;
        this.profiles = profiles;
        this.supervisor = supervisor;
        this.maintaining = new Set();
        this.documents = documents;
        this.catalog = catalog;
        this.getAgentDir = getAgentDir || (async () => fs.realpathSync.native((await getSdk()).getAgentDir()));
        this.windows = new BotWindowRegistry({ getAgentDir: this.getAgentDir });
    }

    // Bots in display order, with their windows. Profiles without a valid section are not Bots.
    async list() {
        const { state, revision } = await this.profiles.state();
        const bots = [];
        for (const profile of state.profiles) {
            const bot = settings.readBot(profile);
            if (!bot || profile.trashedAt !== undefined) continue;
            const { state: windowState, revision: windowsRevision } = await this.windows.read(profile.id);
            bots.push({ id: profile.id, name: profile.name, description: profile.description, avatar: profile.avatar ?? null,
                enabled: settings.isBot(profile), profileRevision: profileRevision(profile), bot: this.publicBot(bot), chosen: chosenIdentity(profile, bot),
                windowsRevision, windows: windowState.windows.map(publicWindow) });
        }
        bots.sort((a, b) => a.bot.order - b.bot.order || Date.parse(a.bot.createdAt) - Date.parse(b.bot.createdAt));
        return { version: 1, revision, bots };
    }

    publicBot(bot) {
        const { version, enabled, order, job, model, permissions, notify, onboarding, createdAt } = bot;
        return { version, enabled, order, job, model, permissions: { preset: permissions.preset, rules: permissions.rules.length },
            notify, onboarding, createdAt };
    }

    async bot(profileId) {
        if (typeof profileId !== 'string' || !UUID.test(profileId)) fail('Invalid bot ID');
        const profile = await this.profiles.getProfile(profileId);
        const bot = settings.readBot(profile);
        if (!profile || !bot || profile.trashedAt !== undefined) fail('Bot not found', 404);
        return { profile, bot };
    }

    // Where Bot workspaces go: the home folder when it is an allowed project, else the first
    // allowed project root. The workspaces themselves (<base>/PivaneBots/…) never land in the
    // service's working directory or the Pivane install: that is where the generic default
    // project falls back to.
    workspaceExcluded(directory) {
        const inside = (child, parent) => child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
        const real = value => { try { return fs.realpathSync.native(value); } catch { return path.resolve(value); } };
        return [real(process.cwd()), real(path.resolve(__dirname, '..', '..'))].some(blocked => inside(real(directory), blocked));
    }

    workspaceBase() {
        for (const candidate of [os.homedir(), ...(this.store.roots || [])]) {
            try {
                const resolved = this.store.resolveProject(candidate);
                if (this.workspaceExcluded(path.join(resolved, WORKSPACE_PARENT))) continue;
                fs.accessSync(resolved, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
                return resolved;
            } catch {}
        }
        return null;
    }

    // A private directory inside the allowed project roots; named by ID so renaming a Bot
    // never moves its sessions (a native session cwd is immutable).
    prepareWorkspace(profileId, name, language) {
        const base = this.workspaceBase();
        if (!base) fail('No accessible project directory is available for Bot workspaces', 409);
        const parent = path.join(base, WORKSPACE_PARENT);
        for (const directory of [parent, path.join(parent, `bot-${profileId.slice(0, 8)}`)]) {
            try { fs.mkdirSync(directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
            const stat = fs.lstatSync(directory);
            if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Bot workspace must be a real directory', 409);
        }
        const workspace = this.store.resolveProject(path.join(parent, `bot-${profileId.slice(0, 8)}`));
        if (this.workspaceExcluded(workspace)) fail('Bot workspace would be inside the Pivane service directory', 409);
        if (process.platform !== 'win32') fs.chmodSync(workspace, 0o700);
        const readme = path.join(workspace, 'README.md');
        const note = language === 'en'
            ? `# Bot workspace\n\nFiles created by your Pivane Bot (${name}) live here. Bot ID: ${profileId}\n`
            : `# Bot 工作目录\n\n这里存放你的 Pivane Bot（${name}）创建的文件。Bot ID：${profileId}\n`;
        try { fs.writeFileSync(readme, note, { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
        return workspace;
    }

    create(input = {}) {
        return this.profiles.reserve(async () => {
            if (!object(input) || typeof input.expectedRevision !== 'string') fail('Expected revision is required');
            const language = input.language === 'en' ? 'en' : 'zh-CN';
            const id = randomUUID(), name = PLACEHOLDER[language];
            const { state: current } = await this.profiles.state();
            const existingBots = current.profiles.filter(profile => settings.readBot(profile) && profile.trashedAt === undefined);
            if (existingBots.length >= MAX_BOTS) fail('Bot limit reached', 409);
            const workspace = this.prepareWorkspace(id, name, language);
            const now = new Date().toISOString();
            const defaults = settings.defaultBot({ workspace, now, firstBot: existingBots.length === 0,
                order: existingBots.reduce((max, profile) => Math.max(max, settings.readBot(profile).order + 1), 0) });
            const bot = settings.normalizeBot({ ...defaults, onboarding: { ...defaults.onboarding, flowVersion: 2, defaultAvatar: DEFAULT_AVATAR.id } });
            const base = validateProfile({ name, description: '', soul: '', enabled: true, avatar: DEFAULT_AVATAR,
                memory: { enabled: true, autoLearn: false }, skills: { learnedEnabled: true } });
            const saved = await this.profiles.mutate(input.expectedRevision, state => {
                if (state.profiles.length >= 50) fail('Profile limit reached', 409);
                const record = { ...base, id, bot, createdAt: now, updatedAt: now };
                state.profiles.push(record);
                return { profile: record };
            });
            const window = await this.createWindowLocked(id, 'main');
            return { ok: true, revision: saved.revision, bot: { id, name, avatar: saved.profile.avatar, bot: this.publicBot(bot) }, window };
        });
    }

    // An existing assistant identity becomes a Bot (M4-5b, D-024 step 3): the same profile keeps its
    // name, face, personality, memory and skills, and gets a private workspace and a main chat. Its
    // earlier conversations keep their identity and stay in the Pi Agent list; nothing is moved or
    // deleted. Scheduled tasks aimed at the identity go to the Bot's main chat from now on.
    fromProfile(input = {}) {
        return this.profiles.reserve(async () => {
            if (!object(input) || typeof input.expectedRevision !== 'string') fail('Expected revision is required');
            const profileId = input.profileId;
            if (typeof profileId !== 'string' || !UUID.test(profileId)) fail('Invalid identity ID');
            const language = input.language === 'en' ? 'en' : 'zh-CN';
            const eligible = profile => {
                if (!profile || profile.trashedAt !== undefined) fail('Identity not found', 404, 'PROFILE_NOT_FOUND');
                if (profile.bot !== undefined) fail('This identity is already a Bot', 409, 'PROFILE_ALREADY_BOT');
                if (profile.enabled !== true) fail('Turn this identity on before making it a Bot', 409, 'PROFILE_DISABLED');
            };
            const { state: current } = await this.profiles.state();
            const profile = current.profiles.find(item => item.id === profileId);
            eligible(profile);
            const existingBots = current.profiles.filter(item => settings.readBot(item) && item.trashedAt === undefined);
            if (existingBots.length >= MAX_BOTS) fail('Bot limit reached', 409);
            const workspace = this.prepareWorkspace(profileId, profile.name, language);
            const now = new Date().toISOString();
            const defaults = settings.defaultBot({ workspace, now, firstBot: existingBots.length === 0,
                order: existingBots.reduce((max, item) => Math.max(max, settings.readBot(item).order + 1), 0) });
            // Its name, face and (when written) personality are already settled, and its memory already
            // knows the user: the first chat only asks what is still open (job, way of working).
            const steps = { name: 'done', avatar: 'done', known: 'done', ...(String(profile.soul || '').trim() ? { personality: 'done' } : {}) };
            const bot = settings.normalizeBot({ ...defaults, chosen: { name: true, avatar: true },
                onboarding: { ...defaults.onboarding, flowVersion: 2, converted: true, steps } });
            const saved = await this.profiles.mutate(input.expectedRevision, state => {
                const record = state.profiles.find(item => item.id === profileId);
                eligible(record);
                record.bot = bot; record.updatedAt = now;
                return { profile: record };
            });
            this.emit('botChanged', { profileId });
            const window = await this.createWindowLocked(profileId, 'main');
            return { ok: true, revision: saved.revision, bot: { id: profileId, name: saved.profile.name, avatar: saved.profile.avatar ?? null, bot: this.publicBot(bot) }, window };
        });
    }

    createTopic(profileId, input) {
        const fields = topicFields(input, { revision: true });
        return this.profiles.reserve(async () => {
            const { windowsRevision, ...window } = await this.createWindowLocked(profileId, 'topic', { ...fields, expectedRevision: input.expectedRevision });
            return { ok: true, window, windowsRevision };
        });
    }

    async assertTopicWorker(worker) {
        const { profileId, windowId, generation } = worker.loadedBot;
        const window = await this.assertCurrentWindowSession(profileId, windowId, { id: worker.sessionId, path: worker.sessionPath });
        if (worker.disposed || worker.restarting || worker.noSession || window.cwd !== worker.cwd || window.current.generation !== generation)
            fail('Bot window generation changed', 409, 'BOT_WINDOW_STALE');
        return window;
    }

    proposeTopic(worker, toolCallId, fields) {
        fields = topicFields(fields, { requireTitle: true });
        return this.profiles.reserve(async () => {
            await this.assertTopicWorker(worker);
            if (worker.cronRun) fail('Topics require the user in an attended conversation', 409, 'BOT_TOPIC_UNATTENDED');
            const profileId = worker.loadedBot.profileId, id = topicId(worker.sessionId, toolCallId);
            await this.reconcileLocked(profileId, id);
            const { state } = await this.windows.read(profileId);
            let existing = state.windows.find(item => item.id === id);
            if (existing) {
                if (!isDeepStrictEqual(existing.topicSeed, fields)) fail('This topic call already used different fields', 409, 'BOT_TOPIC_CONFLICT');
                if (!existing.current) existing = await this.completeWindowLocked(profileId, existing);
                return { window: publicWindow(existing) };
            }
            const { windowsRevision, ...window } = await this.createWindowLocked(profileId, 'topic', { ...fields, id });
            return { window };
        });
    }

    // Reserve the window CAS before native creation. A prepared row survives interruptions;
    // its last native marker proves creation completed and carries the original metadata.
    async createWindowLocked(profileId, kind, { title = '', emoji = '', focus = '', expectedRevision, id = randomUUID() } = {}) {
        const { bot } = await this.bot(profileId);
        const { revision } = await this.windows.read(profileId);
        const now = new Date().toISOString(), topicSeed = { title, focus, emoji };
        if (kind === 'topic') topicFields(topicSeed);
        const record = { id, kind, title, emoji, focus, cwd: bot.workspace, createdAt: now, updatedAt: now, archivedAt: null,
            current: null, generations: [], rotation: null, ...(kind === 'topic' ? { topicSeed } : {}) };
        await this.windows.mutate(profileId, expectedRevision ?? revision, state => {
            if (kind === 'main' && state.windows.some(window => window.kind === 'main')) fail('Bot already has a main chat', 409);
            if (state.windows.length >= MAX_WINDOWS || kind === 'topic' && state.windows.filter(window => window.kind === 'topic').length >= MAX_TOPICS)
                fail('Topic limit reached (including archived topics)', 409, 'BOT_TOPIC_LIMIT');
            state.windows.push(record); return {};
        });
        const completed = await this.completeWindowLocked(profileId, record, { fresh: true });
        const saved = await this.windows.read(profileId);
        return { ...publicWindow(completed), windowsRevision: saved.revision };
    }

    async completeWindowLocked(profileId, record, { fresh = false } = {}) {
        record = (await this.windows.read(profileId)).state.windows.find(item => item.id === record.id);
        if (!record) fail('Window not found', 404);
        if (record.current) return record;
        if (record.archivedAt) fail('This topic is archived; restore it before sending', 409, 'BOT_WINDOW_ARCHIVED');
        const matches = fresh ? [] : (await this.nativeMarkers(profileId, record.cwd))
            .filter(marker => marker.windowId === record.id && marker.kind === record.kind && marker.generation === 0);
        if (matches.length > 1) fail('Multiple native conversations claim this topic; recovery is required', 409, 'BOT_TOPIC_CONFLICT');
        let session = matches[0] && { id: matches[0].sessionId, path: matches[0].path };
        if (!session) session = await this.store.createSession(record.cwd, '', { agentProfileId: profileId,
            autoTitle: record.kind === 'topic' && (!record.title || defaultTopicTitle(record.title) || !record.focus),
            initializeSession: manager => manager.appendCustomEntry(WINDOW_ENTRY,
                windowMarker({ sessionId: manager.getSessionId(), profileId, windowId: record.id, kind: record.kind, generation: 0,
                    ...(record.topicSeed ? { topicSeed: record.topicSeed } : {}) })) });
        const { revision } = await this.windows.read(profileId);
        const saved = await this.windows.mutate(profileId, revision, state => {
            const item = state.windows.find(window => window.id === record.id);
            if (!item || item.current) fail('Window changed during creation', 409);
            item.current = { generation: 0, sessionId: session.id, sessionPath: session.path };
            item.generations = [{ ...item.current, startedAt: item.createdAt, endedAt: null, reason: 'initial' }];
            return {};
        });
        return saved.state.windows.find(window => window.id === record.id);
    }

    updateWindow(profileId, windowId, input) {
        const fields = topicFields(input, { patch: true, revision: true });
        return this.profiles.reserve(() => {
            const update = async () => {
                const window = await this.windowRecord(profileId, windowId);
                const { revision } = await this.windows.read(profileId);
                if (revision !== input.expectedRevision) fail('Bot windows changed; reload before saving', 409);
                if (window.kind !== 'topic') fail('The main chat cannot be renamed or archived', 409, 'BOT_MAIN_WINDOW_FIXED');
                if (window.rotation) fail(MOVING, 409, 'BOT_WINDOW_ROTATING');
                const save = async () => {
                    const saved = await this.windows.mutate(profileId, input.expectedRevision, state => {
                        const item = state.windows.find(entry => entry.id === windowId);
                        if (fields.archived && !window.archivedAt) this.assertWindowQuiescent?.(window);
                        for (const key of ['title', 'focus', 'emoji']) if (Object.hasOwn(fields, key)) item[key] = fields[key];
                        if (Object.hasOwn(fields, 'archived')) item.archivedAt = fields.archived ? item.archivedAt ?? new Date().toISOString() : null;
                        item.updatedAt = new Date().toISOString(); return {};
                    });
                    return { ok: true, window: publicWindow(saved.state.windows.find(item => item.id === windowId)), windowsRevision: saved.revision };
                };
                if (!fields.archived || window.archivedAt) return save();
                return this.archiveWindowLocked(profileId, window, save);
            };
            // Scheduler writes and dispatch admission observe this reservation before any await.
            return fields.archived && this.cron ? this.cron.reserve(update) : update();
        });
    }

    async archiveWindowLocked(profileId, window, save) {
        const busy = () => fail('This topic has unfinished work; finish or clear it before archiving', 409, 'BOT_WINDOW_BUSY');
        const paths = window.generations.map(item => item.sessionPath);
        const check = async () => {
            await this.assertWindowQuiescent?.(window);
            const queue = await this.supervisor.getQueueStore();
            for (const file of paths) {
                try { queue.assertMovable(file); } catch { busy(); }
                const worker = this.supervisor.getActiveWorker(file);
                if (worker?.controls?.recoveries?.length || worker?.controls?.drafts?.length) busy();
            }
            if (this.cron) {
                await this.cron.ready; this.cron.healthy();
                const refs = window.generations.map(item => ({ cwd: window.cwd, sessionId: item.sessionId }));
                const thread = target => sameThreadTarget(target, refs, cwd => this.store.resolveProject(cwd));
                const targets = target => target?.kind === 'profile' && target.profileId === profileId && target.windowId === window.id
                    || target?.kind === 'thread' && thread(target);
                if (this.cron.db.jobs().some(job => !job.deleted && job.enabled && targets(job.target)))
                    fail('Disable or retarget this topic’s scheduled tasks before archiving', 409, 'BOT_TOPIC_SCHEDULED');
                // A follow-up the Bot started itself that has not run yet is dropped with the topic.
                if (this.cron.db.activeRuns().some(run => !(run.origin === 'bot' && run.status === 'waiting') && (targets(run.job?.target)
                    || thread(run.target)))) busy();
            }
        };
        for (const file of paths) if (!this.supervisor.isSessionIdle(file)) busy();
        await check();
        // Reserve every generation, including native-page workers, until the archive commits.
        const reserve = index => index === paths.length ? (async () => {
            await check();
            for (const file of paths) {
                const worker = this.supervisor.getActiveWorker(file);
                if (worker) { worker._broadcast({ type: 'gateway_reconnect' }); await this.supervisor.stopSession(file); }
            }
            const saved = await save();
            this.cron?.dropBotRuns({ profileId, windowId: window.id });
            return saved;
        })() : this.supervisor.withSessionEdit(paths[index], () => reserve(index + 1));
        try { return await reserve(0); }
        catch (error) { if (error.status === 409 || error.code === 'SESSION_BUSY') busy(); throw error; }
    }

    async openItems(worker) {
        const main = await this.assertTopicWorker(worker);
        if (main.kind !== 'main') fail('The topic index is available only in the main chat', 403);
        const { state } = await this.windows.read(worker.loadedBot.profileId);
        return require('./bot-topic-index').openItems({ windows: state.windows, profileId: worker.loadedBot.profileId,
            cwd: main.cwd, directory: path.dirname(worker.sessionPath), supervisor: this.supervisor, pi: await getSdk() });
    }

    // Owner UI reads the same bounded index without opening or starting the main chat.
    async topicOpenItems(profileId) {
        const { bot } = await this.bot(profileId);
        const cwd = this.store.resolveProject(bot.workspace);
        if (cwd !== bot.workspace) fail('Bot workspace identity changed', 409, 'BOT_WINDOW_STALE');
        const { state, revision } = await this.windows.read(profileId);
        const pi = await getSdk();
        const index = require('./bot-topic-index').openItems({ windows: state.windows, profileId, cwd,
            directory: pi.SessionManager.create(cwd).getSessionDir(), supervisor: this.supervisor, pi });
        return { ...index, windowsRevision: revision };
    }

    // Idempotent repair: a Bot without a main window gets one (adopting a marked native
    // session left by an interrupted creation before creating a new one).
    ensureMainWindow(profileId) {
        return this.profiles.reserve(async () => {
            const { state } = await this.windows.read(profileId);
            const main = state.windows.find(window => window.kind === 'main');
            if (main) return publicWindow(main.current ? main : await this.completeWindowLocked(profileId, main));
            const adopted = await this.reconcileLocked(profileId);
            return adopted.main ? publicWindow(adopted.main) : this.createWindowLocked(profileId, 'main');
        });
    }

    // Adds windows whose native generation-0 marker exists but whose index entry is
    // missing. Never removes or rewrites existing index entries.
    async reconcileLocked(profileId, onlyWindowId = null) {
        const { bot } = await this.bot(profileId);
        const markers = (await this.nativeMarkers(profileId, bot.workspace)).filter(marker => onlyWindowId === null || marker.windowId === onlyWindowId);
        const { state, revision } = await this.windows.read(profileId);
        const known = new Set(state.windows.map(window => window.id));
        const adoptable = markers.filter(marker => marker.generation === 0 && !known.has(marker.windowId))
            .filter(marker => marker.kind !== 'main' || !state.windows.some(window => window.kind === 'main'));
        // Only one main window can be adopted; prefer the earliest.
        const mains = adoptable.filter(marker => marker.kind === 'main').sort((a, b) => a.created - b.created);
        const counts = new Map();
        for (const marker of adoptable) counts.set(marker.windowId, (counts.get(marker.windowId) || 0) + 1);
        if (onlyWindowId && counts.get(onlyWindowId) > 1) fail('Multiple native conversations claim this topic; recovery is required', 409, 'BOT_TOPIC_CONFLICT');
        const chosen = [...mains.slice(0, 1), ...adoptable.filter(marker => marker.kind === 'topic')
            .slice(0, Math.max(0, MAX_TOPICS - state.windows.filter(item => item.kind === 'topic').length))]
            .filter(marker => counts.get(marker.windowId) === 1).slice(0, MAX_WINDOWS - state.windows.length);
        if (!chosen.length) return { main: state.windows.find(window => window.kind === 'main') || null, adopted: 0 };
        const now = new Date().toISOString();
        const saved = await this.windows.mutate(profileId, revision, windowState => {
            for (const marker of chosen) windowState.windows.push({ id: marker.windowId, kind: marker.kind, title: marker.topicSeed?.title ?? '', emoji: marker.topicSeed?.emoji ?? '', focus: marker.topicSeed?.focus ?? '',
                ...(marker.topicSeed ? { topicSeed: marker.topicSeed } : {}),
                cwd: bot.workspace, createdAt: now, updatedAt: now, archivedAt: null,
                current: { generation: 0, sessionId: marker.sessionId, sessionPath: marker.path },
                generations: [{ generation: 0, sessionId: marker.sessionId, sessionPath: marker.path, startedAt: now, endedAt: null, reason: 'initial' }],
                rotation: null });
            return {};
        });
        return { main: saved.state.windows.find(window => window.kind === 'main') || null, adopted: chosen.length };
    }

    // Window markers of every verified native session in a Bot workspace.
    async nativeMarkers(profileId, cwd) {
        const { SessionManager } = await getSdk();
        const markers = [];
        for (const candidate of await this.store._nativeSessionMetadata(cwd, SessionManager)) {
            let binding = null, leafId = null;
            try {
                const manager = this.store.profileManager({ ...candidate, cwd }, SessionManager);
                binding = readWindowBinding(manager); leafId = manager.getLeafId();
            } catch { continue; }
            if (binding?.profileId === profileId) markers.push({ ...binding, leafId, path: fs.realpathSync.native(candidate.path),
                created: new Date(candidate.created).getTime() || 0 });
        }
        return markers;
    }

    rotate(profileId, windowId, input = {}) {
        return this.profiles.reserve(() => this.rotateLocked(profileId, windowId, input));
    }

    // Moves a window to a fresh native session generation. Journal first, then (with the
    // old file reserved and its worker stopped) create the successor whose window marker
    // is its last initial entry, then commit the index. Any failure leaves routing on the
    // old generation; recovery decides only from native evidence and never replays turns.
    // requireSummary (automatic rotation, D-033): the predecessor's native branch must end with a
    // Bot summary that reconciled the kept part; checked again here under the reservation.
    async rotateLocked(profileId, windowId, { reason = 'manual', expectedGeneration, requireSummary = false } = {}) {
        if (!['size', 'entries', 'age', 'manual'].includes(reason)) fail('Invalid rotation reason');
        // The generation the caller saw is required, so a repeated or stale request never rotates again.
        if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) fail('Expected generation is required');
        const { bot } = await this.bot(profileId);
        await this.recoverRotationLocked(profileId, windowId);
        const { state, revision } = await this.windows.read(profileId);
        const window = state.windows.find(item => item.id === windowId);
        if (!window) fail('Window not found', 404);
        if (window.archivedAt) fail('This topic is archived; restore it before sending', 409, 'BOT_WINDOW_ARCHIVED');
        if (!window.current) fail('Window has no conversation yet', 409);
        if (window.cwd !== bot.workspace) fail('Window workspace does not match its Bot', 409);
        if (window.current.generation !== expectedGeneration) fail('Window changed; reload before rotating', 409);
        const from = { ...window.current }, toGeneration = from.generation + 1, requestId = randomUUID();
        const preparedAt = new Date().toISOString();
        await this.windows.mutate(profileId, revision, windowState => {
            const item = windowState.windows.find(entry => entry.id === windowId);
            if (!item || item.current?.sessionId !== from.sessionId || item.rotation) fail('Window changed; reload before rotating', 409);
            item.rotation = { state: 'prepared', requestId, toGeneration, fromSessionId: from.sessionId, reason, preparedAt };
            item.updatedAt = preparedAt;
            return {};
        });
        let session;
        try {
            session = await this.supervisor.withSessionEdit(from.sessionPath, async worker => {
                if (worker) await this.supervisor.stopSession(from.sessionPath);
                const handoff = await this.store.withSessionRead(window.cwd, from.sessionId, (current, read) => {
                    const manager = read.manager(), binding = readWindowBinding(manager);
                    if (requireSummary && !freshRotationSummary(manager.getBranch())) fail('The window waits for its next summary before moving on', 409);
                    const result = buildHandoff(manager);
                    read.validate();
                    if (current.path !== from.sessionPath || binding?.windowId !== windowId || binding.generation !== from.generation)
                        fail('Window conversation does not match its native marker', 409);
                    return result;
                });
                return this.store.createSession(window.cwd, '', { agentProfileId: profileId, initializeSession: manager => {
                    if (handoff.model) manager.appendModelChange(handoff.model.provider, handoff.model.modelId);
                    if (handoff.thinkingLevel) manager.appendThinkingLevelChange(handoff.thinkingLevel);
                    // The notebook continues from its snapshot; the seed message also shows it to the model.
                    if (handoff.snapshot) manager.appendCustomEntry(LEDGER_ENTRY, { v: 1, snapshot: handoff.snapshot });
                    if (handoff.text) manager.appendCustomMessageEntry(HANDOFF_MESSAGE, handoff.text, false,
                        { version: 1, fromSessionId: from.sessionId, fromGeneration: from.generation,
                            ...(handoff.sections ? { sections: handoff.sections } : {}),
                            ...(handoff.sections || handoff.notebook ? { pivaneNotebook: true } : {}),
                            // reconciled: the summary before the move read the verbatim part (D-033 proof);
                            // otherwise (a manual move) the next summary reads the carried messages.
                            tail: handoff.tail, ...(requireSummary ? { reconciled: true } : {}) });
                    // Last initial entry: its presence proves the seed above was written.
                    manager.appendCustomEntry(WINDOW_ENTRY, windowMarker({ sessionId: manager.getSessionId(), profileId, windowId,
                        kind: window.kind, generation: toGeneration, predecessor: { sessionId: from.sessionId, lastEntryId: handoff.lastEntryId } }));
                } });
            });
        } catch (error) {
            await this.recoverRotationLocked(profileId, windowId).catch(() => {});
            throw error;
        }
        const committed = await this.commitRotationLocked(profileId, windowId, requestId, from, { sessionId: session.id, sessionPath: session.path });
        this.emit('windowRotated', { profileId, windowId, from, to: committed.current });
        return { ok: true, window: publicWindow(committed), session: { cwd: window.cwd, id: session.id, path: session.path } };
    }

    // S4 (D-030/D-033): move the window to a new generation when its file is large, long or old.
    // trigger: 'compaction' right after a summary was written, else 'completion'. A new generation
    // starts from a fresh Bot summary that (made while the generation was due) also reconciled the
    // notebook with the part kept verbatim; the native branch has to show it (freshRotationSummary),
    // so a Pi fallback summary or a turn finished in between waits for the next summary. After an
    // ordinary reply the worker's idle summary runs first. Only an idle window rotates.
    // Never throws; returns the rotation or null.
    async maintainWindow(worker, { now = Date.now(), trigger = 'completion' } = {}) {
        const loaded = worker?.loadedBot, sessionPath = worker?.sessionPath;
        if (!loaded || typeof sessionPath !== 'string' || !this.supervisor) return null;
        const key = `${loaded.profileId}/${loaded.windowId}`;
        if (this.maintaining.has(key)) return null;
        this.maintaining.add(key);
        try {
            const { state } = await this.windows.read(loaded.profileId);
            const window = state.windows.find(item => item.id === loaded.windowId);
            if (!window?.current || window.archivedAt || window.rotation || window.current.sessionPath !== sessionPath || window.current.generation !== loaded.generation) return null;
            const started = window.generations.find(item => item.generation === window.current.generation)?.startedAt ?? window.createdAt;
            const bytes = fs.statSync(sessionPath).size;
            const reason = rotationReason({ bytes, entries: bytes >= 1024 * 1024 ? countLines(sessionPath) : 0, startedAt: started, now });
            if (!reason || trigger !== 'compaction' || !this.supervisor.isSessionIdle(sessionPath)) return null;
            if (trigger === 'compaction' && window.kind === 'topic' && !window.focus?.trim()) {
                await this.syncTopicFromSummary(loaded.profileId, loaded.windowId, sessionPath).catch(() => {});
            }
            const ready = await this.store.withSessionRead(window.cwd, window.current.sessionId, (session, read) => {
                const fresh = freshRotationSummary(read.manager().getBranch());
                read.validate();
                return session.path === sessionPath && fresh;
            });
            if (!ready) return null;
            return await this.rotate(loaded.profileId, loaded.windowId, { reason, expectedGeneration: loaded.generation, requireSummary: true });
        } catch (error) {
            if (error?.status !== 409) console.error(`Bot window maintenance failed: ${error?.message || error}`);
            return null;
        } finally { this.maintaining.delete(key); }
    }

    // Automatically fill an untitled/unfocused topic from its first auto-title or structured summary.
    // Never overwrites a title or focus the user already set.
    learnTopicMeta(worker, { title, focus } = {}) {
        const loaded = worker?.loadedBot;
        if (!loaded) return Promise.resolve(null);
        return this.applyLearnedTopicMeta(loaded.profileId, loaded.windowId, { title, focus }).catch(() => null);
    }

    async syncTopicFromSummary(profileId, windowId, sessionPath) {
        const { state } = await this.windows.read(profileId);
        const window = state.windows.find(item => item.id === windowId);
        if (!window?.current || window.kind !== 'topic' || window.focus?.trim()) return null;
        const topic = await this.store.withSessionRead(window.cwd, window.current.sessionId, (session, read) => {
            const branch = read.manager().getBranch();
            read.validate();
            if (session.path !== sessionPath) return null;
            for (let i = branch.length - 1; i >= 0; i--) {
                const text = branch[i]?.type === 'compaction' ? branch[i].details?.pivaneBot?.sections?.topic : null;
                if (typeof text === 'string' && text.trim()) return text.trim();
            }
            return null;
        });
        if (!topic) return null;
        return this.applyLearnedTopicMeta(profileId, windowId, { focus: topic });
    }

    applyLearnedTopicMeta(profileId, windowId, { title, focus } = {}) {
        const clean = (value, max) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
        const nextTitle = clean(title, 80), nextFocus = clean(focus, 500);
        if (!nextTitle && !nextFocus) return Promise.resolve(null);
        return this.profiles.reserve(async () => {
            const { state, revision } = await this.windows.read(profileId);
            const current = state.windows.find(item => item.id === windowId && item.kind === 'topic' && !item.archivedAt);
            if (!current) return null;
            const takeTitle = Boolean(nextTitle && (!current.title || defaultTopicTitle(current.title)));
            const takeFocus = Boolean(nextFocus && !current.focus?.trim());
            if (!takeTitle && !takeFocus) return null;
            const saved = await this.windows.mutate(profileId, revision, windowState => {
                const item = windowState.windows.find(entry => entry.id === windowId);
                if (!item || item.archivedAt) return {};
                if (takeTitle && (!item.title || defaultTopicTitle(item.title))) item.title = nextTitle;
                if (takeFocus && !item.focus?.trim()) item.focus = nextFocus;
                item.updatedAt = new Date().toISOString();
                return {};
            });
            const updated = saved.state.windows.find(entry => entry.id === windowId);
            this.emit('botChanged', { profileId, windowId });
            return updated ? publicWindow(updated) : null;
        });
    }

    async commitRotationLocked(profileId, windowId, requestId, from, to) {
        const { revision } = await this.windows.read(profileId);
        const saved = await this.windows.mutate(profileId, revision, windowState => {
            const item = windowState.windows.find(entry => entry.id === windowId);
            if (!item?.rotation || item.rotation.requestId !== requestId || item.current?.sessionId !== from.sessionId)
                fail('Window changed during rotation; it was not switched', 409);
            const now = new Date().toISOString();
            item.generations.at(-1).endedAt = now;
            item.generations.push({ generation: item.rotation.toGeneration, sessionId: to.sessionId, sessionPath: to.sessionPath,
                startedAt: now, endedAt: null, reason: item.rotation.reason });
            item.current = { generation: item.rotation.toGeneration, sessionId: to.sessionId, sessionPath: to.sessionPath };
            item.rotation = null; item.updatedAt = now;
            return {};
        });
        return saved.state.windows.find(entry => entry.id === windowId);
    }

    // Completes or abandons an interrupted rotation. A successor is adopted only when its
    // marker names the current generation as predecessor at the exact leaf the current
    // generation still has; otherwise the journal is cleared and the successor file is
    // left untouched (it never becomes current).
    // Caller holds the profile reservation. The predecessor session is reserved while the
    // native evidence is read and the decision committed, so no turn can land on it in
    // between. Its runtime is only stopped when the successor is going to be adopted; pages
    // attached to it are told to reconnect first. An abandoned recovery leaves it running.
    async recoverRotationLocked(profileId, windowId) {
        const { state } = await this.windows.read(profileId);
        const window = state.windows.find(item => item.id === windowId);
        if (!window?.rotation) return { recovered: false };
        if (!window.current?.sessionPath || !this.supervisor) return this.settleRotationLocked(profileId, windowId, window);
        const path = window.current.sessionPath;
        try {
            return await this.supervisor.withSessionEdit(path, async worker => {
                if (worker && await this.adoptableSuccessor(profileId, windowId, window)) {
                    worker._broadcast({ type: 'gateway_reconnect' });
                    await this.supervisor.stopSession(path);
                }
                // Settlement reads the evidence again; with the runtime still running it only clears.
                return this.settleRotationLocked(profileId, windowId, window);
            });
        } catch (error) {
            // A busy predecessor keeps being the window's conversation. Clearing the journal is
            // safe without the reservation; adopting the successor is not, so it is never done here.
            if (error.status === 409 && this.supervisor.getActiveWorker(path))
                return this.settleRotationLocked(profileId, windowId, window, { adopt: false });
            throw error;
        }
    }

    // The successor a prepared rotation may adopt: its marker names the current generation
    // as predecessor at the exact leaf the current generation still has.
    async adoptableSuccessor(profileId, windowId, window) {
        const rotation = window.rotation;
        const markers = await this.nativeMarkers(profileId, window.cwd);
        const current = markers.find(marker => marker.windowId === windowId && marker.sessionId === window.current?.sessionId);
        const successor = markers.find(marker => marker.windowId === windowId && marker.generation === rotation.toGeneration
            && marker.predecessor?.sessionId === rotation.fromSessionId);
        return successor && current && current.generation === rotation.toGeneration - 1 && successor.predecessor.lastEntryId === current.leafId ? successor : null;
    }

    async settleRotationLocked(profileId, windowId, window, { adopt = true } = {}) {
        const rotation = window.rotation;
        const successor = adopt ? await this.adoptableSuccessor(profileId, windowId, window) : null;
        if (successor && !this.supervisor?.getActiveWorker(window.current.sessionPath)) {
            const committed = await this.commitRotationLocked(profileId, windowId, rotation.requestId, window.current,
                { sessionId: successor.sessionId, sessionPath: successor.path });
            this.emit('windowRotated', { profileId, windowId, from: window.current, to: committed.current });
            return { recovered: true, committed: true };
        }
        const { revision } = await this.windows.read(profileId);
        await this.windows.mutate(profileId, revision, windowState => {
            const item = windowState.windows.find(entry => entry.id === windowId);
            if (item?.rotation?.requestId === rotation.requestId) { item.rotation = null; item.updatedAt = new Date().toISOString(); }
            return {};
        });
        return { recovered: true, committed: false };
    }

    // Resolves a window to its current generation and proves the native marker. An
    // interrupted rotation is settled first, before anyone can open the predecessor again.
    async resolve(profileId, windowId) {
        let window = await this.windowRecord(profileId, windowId);
        if (window.archivedAt) fail('This topic is archived; restore it before sending', 409, 'BOT_WINDOW_ARCHIVED');
        if (!window.current) {
            await this.profiles.reserve(() => this.completeWindowLocked(profileId, window));
            window = await this.windowRecord(profileId, windowId);
        }
        if (window.rotation) {
            try { await this.profiles.reserve(() => this.recoverRotationLocked(profileId, windowId)); }
            catch (error) {
                if (error.status === 409) fail(MOVING, 409, 'BOT_WINDOW_ROTATING');
                throw error;
            }
            window = await this.windowRecord(profileId, windowId);
            if (window.rotation) fail(MOVING, 409, 'BOT_WINDOW_ROTATING');
        }
        if (window.archivedAt) fail('This topic is archived; restore it before sending', 409, 'BOT_WINDOW_ARCHIVED');
        if (!window.current) fail('Window has no conversation yet', 409);
        return this.store.withSessionRead(window.cwd, window.current.sessionId, (session, read) => {
            const binding = readWindowBinding(read.manager());
            read.validate();
            if (session.path !== window.current.sessionPath || binding?.profileId !== profileId || binding.windowId !== windowId
                || binding.generation !== window.current.generation) fail('Window conversation does not match its native marker', 409);
            // The same row shape as the session list, so the chat page opens it like any session.
            return { window: publicWindow(window), session: { ...session, cwd: session.cwd || window.cwd } };
        });
    }

    async windowRecord(profileId, windowId) {
        const { bot } = await this.bot(profileId);
        if (typeof windowId !== 'string' || !UUID.test(windowId)) fail('Invalid window ID');
        const window = (await this.windows.read(profileId)).state.windows.find(item => item.id === windowId);
        if (!window) fail('Window not found', 404);
        if (window.cwd !== bot.workspace) fail('Window workspace does not match its Bot', 409);
        return window;
    }

    // Whether an opened session is the window's current generation (Bot-mode admission).
    async assertCurrentWindowSession(profileId, windowId, session) {
        const window = await this.windowRecord(profileId, windowId);
        if (window.archivedAt) fail('This topic is archived; restore it before sending', 409, 'BOT_WINDOW_ARCHIVED');
        if (window.rotation) fail(MOVING, 409, 'BOT_WINDOW_ROTATING');
        if (!window.current || window.current.sessionId !== session.id || window.current.sessionPath !== session.path)
            fail('这段聊天已经换到新的记录文件', 409, 'BOT_WINDOW_STALE');
        return window;
    }

    // Deferred sends use the same archive boundary even when addressed as native sessions.
    async assertNativeSendable(session) {
        return this.store.withSessionRead(session.cwd, session.id, async (_current, read) => {
            const binding = readWindowBinding(read.manager());
            if (!binding) return;
            const window = await this.windowRecord(binding.profileId, binding.windowId);
            read.validate();
            if (window.archivedAt) fail('This topic is archived; restore it before sending', 409, 'BOT_WINDOW_ARCHIVED');
            if (this.profiles.busy) fail('Bot windows are being changed; try again shortly', 409, 'BOT_WINDOW_BUSY');
        });
    }

    // Display-only reference to a Bot's main chat for the scheduler overview. Execution
    // always goes through mainSession(), which verifies the native marker.
    async mainWindowRef(profileId) {
        const { state } = await this.windows.read(profileId);
        const main = state.windows.find(item => item.kind === 'main' && item.current);
        return main ? { cwd: main.cwd, sessionId: main.current.sessionId, generation: main.current.generation } : null;
    }

    // The current session of a Bot's main chat (scheduled tasks and channels address it).
    async mainSession(profileId) {
        const { state } = await this.windows.read(profileId);
        const main = state.windows.find(item => item.kind === 'main' && item.current);
        if (!main) fail('This Bot has no main chat yet', 409);
        return (await this.resolve(profileId, main.id)).session;
    }

    // The window notebook (M2-5), replayed from the current generation's verified native file.
    async notebook(profileId, windowId) {
        const window = await this.windowRecord(profileId, windowId);
        if (!window.current) return { generation: null, version: ledger.ledgerVersion(ledger.emptyLedger()), items: [] };
        return this.store.withSessionRead(window.cwd, window.current.sessionId, (session, read) => {
            const manager = read.manager(), binding = readWindowBinding(manager);
            const branch = manager.getBranch();
            read.validate();
            if (session.path !== window.current.sessionPath || binding?.windowId !== windowId || binding.generation !== window.current.generation)
                fail('Window conversation does not match its native marker', 409);
            return notebookView(ledger.replay(branch), branch, window.current);
        });
    }

    // Edits from the notebook panel: change text or due date, mark done/cancelled/open again,
    // or delete (tombstone). Written by the window's running worker while it is idle, or,
    // without a worker, appended here with the file reserved. Names the version it saw.
    editNotebook(profileId, windowId, input = {}) {
        if (!object(input) || !Number.isSafeInteger(input.expectedGeneration) || typeof input.expectedVersion !== 'string'
            || !Array.isArray(input.ops) || !input.ops.length || input.ops.length > 20
            || input.ops.some(op => !object(op) || !['update', 'status', 'delete'].includes(op.op))) fail('Invalid notebook edit');
        const ops = input.ops.map(op => ({ op: op.op, id: op.id, text: op.text, status: op.status, due: op.due }));
        return this.profiles.reserve(async () => {
            const window = await this.windowRecord(profileId, windowId);
            if (window.archivedAt) fail('This topic is archived; restore it before editing', 409, 'BOT_WINDOW_ARCHIVED');
            if (window.rotation) fail(MOVING, 409, 'BOT_WINDOW_ROTATING');
            if (!window.current || window.current.generation !== input.expectedGeneration) fail('This chat moved on; reload the notebook', 409, 'BOT_WINDOW_STALE');
            const sessionPath = window.current.sessionPath;
            const worker = this.supervisor?.getActiveWorker(sessionPath);
            try {
                if (worker && !worker.disposed) await worker.botNotebook({ expectedVersion: input.expectedVersion, ops });
                else await this.supervisor.withSessionEdit(sessionPath, async running => {
                    if (running) fail('The chat is busy; try again in a moment', 409, 'SESSION_BUSY');
                    const { SessionManager } = await getSdk();
                    const session = await this.store.getSession(window.cwd, window.current.sessionId);
                    if (session.path !== sessionPath) fail('Window conversation does not match its native marker', 409);
                    const manager = this.store.profileManager(session, SessionManager), binding = readWindowBinding(manager);
                    if (binding?.windowId !== windowId || binding.generation !== window.current.generation) fail('Window conversation does not match its native marker', 409);
                    const state = ledger.replay(manager.getBranch());
                    if (ledger.ledgerVersion(state) !== input.expectedVersion) fail('The notebook changed; reload it', 409, 'NOTEBOOK_CHANGED');
                    const prepared = ledger.prepareOps(state, ops, { at: new Date().toISOString(), by: 'user' });
                    manager.appendCustomEntry(LEDGER_ENTRY, { v: 1, ops: prepared.ops });
                    require('../pi-private-files').privateFileMode(sessionPath);
                    this.store.sessionLists?.delete(window.cwd);
                });
            } catch (error) {
                if (['SESSION_BUSY', 'NOTEBOOK_CHANGED'].includes(error.code)) error.status = 409;
                if (error.code === 'LEDGER_INVALID') error.status = 400;
                throw error;
            }
            return this.notebook(profileId, windowId);
        });
    }

    async generations(profileId, windowId) {
        const window = await this.windowRecord(profileId, windowId);
        return { window: publicWindow(window), generations: history.generationList(window) };
    }

    async history(profileId, windowId, query) {
        const { generation, input } = history.historyRequest(query);
        const window = await this.windowRecord(profileId, windowId);
        return history.generationHistory({ store: this.store, profileId, window, generation, input });
    }

    // Worker environment for a verified Bot window session, or null for every other session.
    // manager: the store's verified read of the exact file the worker will open.
    async windowContext(manager, { cwd, sessionId, sessionPath }) {
        const binding = readWindowBinding(manager);
        if (!binding) return null;
        const { state } = await this.windows.read(binding.profileId);
        const window = state.windows.find(item => item.id === binding.windowId);
        if (window?.archivedAt) fail('This topic is archived; restore it before sending', 409, 'BOT_WINDOW_ARCHIVED');
        const profile = (await this.profiles.state()).state.profiles.find(item => item.id === binding.profileId);
        const bot = settings.readBot(profile);
        if (!settings.isBot(profile) || bot.workspace !== cwd) return null;
        if (!window || window.cwd !== cwd || window.current?.sessionId !== sessionId || window.current.sessionPath !== sessionPath
            || window.current.generation !== binding.generation) return null;
        return { version: 1, profileId: binding.profileId, windowId: binding.windowId, sessionId, cwd, sessionPath };
    }

    // Saves a setup card the user confirmed (possibly edited). The card must still be pending
    // in the window's current native transcript; only its proposed fields are accepted.
    // picture: the version of the picture the user answered a proposed face with, which the
    // card has just saved through the avatar service; the profile's face must still be exactly
    // that picture (another client may have changed it in between).
    // later: the user answered the card with "later": nothing is saved, and the interview steps
    // it asked about are recorded as skipped, so the Bot does not ask them again (UAT-14).
    // Each step is its own: saving only a name leaves the face step open. A proposed field the
    // user left out (unticked or emptied) records its step as skipped unless already settled.
    // workStyle may keep the current way of working or make it more careful, never freer.
    setup(profileId, input = {}) {
        return this.profiles.reserve(async () => {
            if (!object(input) || typeof input.expectedRevision !== 'string' || typeof input.windowId !== 'string') fail('Invalid setup confirmation');
            const window = await this.windowRecord(profileId, input.windowId);
            if (window.archivedAt) fail('This topic is archived; restore it before sending', 409, 'BOT_WINDOW_ARCHIVED');
            if (!window.current) fail('Window has no conversation yet', 409);
            const proposal = await this.store.withSessionRead(window.cwd, window.current.sessionId, (session, read) => {
                const manager = read.manager(), binding = readWindowBinding(manager);
                const found = setup.pendingProposal(manager, input.toolCallId);
                read.validate();
                if (session.path !== window.current.sessionPath || binding?.profileId !== profileId || binding.windowId !== window.id)
                    fail('Window conversation does not match its native marker', 409);
                return found;
            });
            if (input.workStyleShown !== undefined && (typeof input.workStyleShown !== 'boolean'
                || input.workStyleShown && !Object.hasOwn(proposal, 'workStyle'))) fail('Invalid setup confirmation');
            if (input.later !== undefined && (input.later !== true || input.changes !== undefined || input.picture !== undefined)) fail('Invalid setup confirmation');
            const later = input.later === true;
            const changes = later ? {} : setup.confirmedChanges(proposal, input.changes ?? proposal);
            if (input.picture !== undefined && (typeof input.picture !== 'string' || !/^[a-f0-9]{64}$/.test(input.picture))) fail('Invalid setup confirmation');
            const picture = input.picture !== undefined;
            if (picture && !Object.hasOwn(proposal, 'avatar')) fail('Only the proposed fields can be saved');
            if (picture) delete changes.avatar;
            // Even an empty edited card answers its proposed steps (kept as-is or skipped).
            if (!later && !Object.keys(changes).length && !picture && !Object.keys(setup.STEP_OF).some(field => Object.hasOwn(proposal, field))) fail('Nothing to save');
            const now = new Date().toISOString();
            let progressBefore;
            let saved = await this.profiles.mutate(input.expectedRevision, state => {
                const index = state.profiles.findIndex(profile => profile.id === profileId);
                const previous = state.profiles[index], bot = settings.readBot(previous);
                if (index < 0 || !bot || previous.trashedAt !== undefined) fail('Bot not found', 404);
                progressBefore = bot.onboarding;
                // The current page reports whether its retained draft actually showed the
                // selector. This survives refresh/conflict without answering a hidden field.
                // Older clients infer it from the proposal and any explicit edited mode.
                const workOffered = input.workStyleShown ?? (setup.workStyleOffered(proposal, bot.permissions.preset, bot.onboarding.steps)
                    || changes.workStyle !== undefined && changes.workStyle !== bot.permissions.preset);
                if (!workOffered) delete changes.workStyle;
                if (picture && (previous.avatar?.kind !== 'image' || previous.avatar.version !== input.picture))
                    fail('The face is no longer the uploaded picture; upload it again', 409, 'BOT_PICTURE_CHANGED');
                const base = validateProfile({ name: changes.name ?? previous.name, description: previous.description,
                    soul: changes.personality ?? previous.soul, enabled: previous.enabled, memory: previous.memory, skills: previous.skills,
                    ...(changes.avatar ? { avatar: typeof changes.avatar === 'string' ? { kind: 'emoji', value: changes.avatar } : changes.avatar } : {}) }, previous);
                if (changes.workStyle && !setup.moreCareful(changes.workStyle, bot.permissions.preset))
                    fail('A setup card can only make the Bot more careful; give it more freedom in Bot settings', 409, 'BOT_WORK_STYLE_FREER');
                const onboarding = { ...bot.onboarding, steps: { ...bot.onboarding.steps } };
                // A proposed value the Bot already has is left off the card; that step is answered.
                const has = { name: previous.name, avatar: previous.avatar?.kind === 'emoji' ? previous.avatar.value : previous.avatar?.kind === 'preset' ? previous.avatar : null, job: bot.job,
                    personality: previous.soul, workStyle: bot.permissions.preset };
                for (const [field, step] of Object.entries(setup.STEP_OF)) {
                    if (!Object.hasOwn(proposal, field) || field === 'workStyle' && !workOffered) continue;
                    if (changes[field] !== undefined || field === 'avatar' && picture || !later && isDeepStrictEqual(has[field], proposal[field])) onboarding.steps[step] = 'done';
                    else if (!settled(onboarding.steps, step)) onboarding.steps[step] = 'skipped';
                }
                if (onboarding.phase === 'greeting') onboarding.phase = 'interview';
                if (changes.finish && !['done', 'skipped'].includes(onboarding.phase)) {
                    onboarding.phase = 'done'; onboarding.completedAt = now; onboarding.flowVersion = 2;
                }
                const chosen = { ...bot.chosen, ...(changes.name ? { name: true } : {}), ...(changes.avatar || picture ? { avatar: true } : {}) };
                const permissions = changes.workStyle ? { ...bot.permissions, preset: changes.workStyle } : bot.permissions;
                const nextBot = settings.normalizeBot({ ...bot, job: changes.job ?? bot.job, permissions, onboarding, chosen });
                const record = { ...previous, ...base, bot: { ...previous.bot, ...nextBot }, updatedAt: now };
                state.profiles[index] = record;
                return { bot: { id: record.id, name: record.name, avatar: record.avatar ?? null, bot: this.publicBot(nextBot) } };
            });
            let user = null;
            if (changes.aboutUser) {
                // A separate document with its own revision; the identity change above stands either way.
                try {
                    if (!this.documents) fail('About-you notes are unavailable', 409);
                    const document = await this.documents.run(profileId, 'user', false);
                    if (document.status !== 'ready') fail('About-you notes are unavailable', 409);
                    const next = setup.appendUserEntries(document.content, changes.aboutUser);
                    if (!next.added.length) user = { added: [], documentSaved: true };
                    else {
                        const written = await this.documents.run(profileId, 'user', true, { content: next.content,
                            expectedRevision: document.revision, expectedProfileRevision: document.profileRevision });
                        user = { added: next.added, documentSaved: written.documentSaved === true, ...(written.error ? { error: written.error } : {}) };
                    }
                } catch (error) { user = { added: [], documentSaved: false, error: error.message }; }
            }
            let progressReverted;
            if (user && !user.documentSaved) {
                // The identity stands, but an unsaved fact must not settle the about step or
                // finish the interview. Keep the shared reservation through this correction.
                try {
                    saved = await this.profiles.mutate(saved.revision, state => {
                        const index = state.profiles.findIndex(profile => profile.id === profileId);
                        const previous = state.profiles[index], bot = settings.readBot(previous);
                        if (index < 0 || !bot || previous.trashedAt !== undefined) fail('Bot not found', 404);
                        const onboarding = { ...bot.onboarding, steps: { ...bot.onboarding.steps } };
                        if (Object.hasOwn(progressBefore.steps, 'about')) onboarding.steps.about = progressBefore.steps.about;
                        else delete onboarding.steps.about;
                        if (changes.finish && onboarding.phase === 'done' && !['done', 'skipped'].includes(progressBefore.phase)) {
                            onboarding.phase = progressBefore.phase;
                            onboarding.completedAt = progressBefore.completedAt;
                        }
                        const record = { ...previous, bot: { ...previous.bot, onboarding } };
                        state.profiles[index] = record;
                        return { bot: { id: record.id, name: record.name, avatar: record.avatar ?? null, bot: this.publicBot({ ...bot, onboarding }) } };
                    });
                } catch { progressReverted = false; }
            }
            this.emit('botChanged', { profileId });
            return { ok: true, revision: saved.revision, bot: saved.bot, saved: { ...changes, ...(picture ? { picture: true } : {}) },
                ...(later ? { later: true } : {}), ...(user ? { user } : {}), ...(progressReverted === false ? { progressReverted } : {}) };
        });
    }

    // What the user's other Bots already know about them (their about-you notes), offered
    // when a new Bot is being set up. Read-only.
    async aboutSources(profileId) {
        const { state } = await this.profiles.state();
        if (!state.profiles.some(profile => profile.id === profileId && settings.isBot(profile) && profile.trashedAt === undefined)) fail('Bot not found', 404);
        if (!this.documents) return { sources: [] };
        const others = state.profiles.filter(profile => profile.id !== profileId && settings.isBot(profile) && profile.trashedAt === undefined)
            .sort((a, b) => settings.readBot(a).order - settings.readBot(b).order);
        const sources = [];
        for (const profile of others) {
            try {
                const document = await this.documents.run(profile.id, 'user', false);
                const entries = document.status === 'ready' ? setup.userEntries(document.content) : [];
                if (entries.length) sources.push({ profileId: profile.id, name: profile.name, avatar: profile.avatar ?? null, entries });
            } catch { /* an unreadable Bot simply is not offered */ }
        }
        return { sources };
    }

    // Copy the about-you entries the user ticked from another Bot (D-013), or record that they
    // declined. Entries must still be present in the source, so nothing else can be passed off as copied.
    about(profileId, input = {}) {
        return this.profiles.reserve(async () => {
            if (!object(input) || typeof input.expectedRevision !== 'string' || !['copy', 'decline'].includes(input.action)) fail('Invalid about-you change');
            const { state, revision } = await this.profiles.state();
            if (revision !== input.expectedRevision) fail('Settings just changed, please try again', 409);
            const target = state.profiles.find(profile => profile.id === profileId);
            if (!settings.isBot(target) || target.trashedAt !== undefined) fail('Bot not found', 404);
            let added = [];
            if (input.action === 'copy') {
                const source = state.profiles.find(profile => profile.id === input.fromProfileId);
                if (!source || source.id === profileId || !settings.isBot(source) || source.trashedAt !== undefined) fail('Source Bot not found', 404);
                if (!Array.isArray(input.entries) || !input.entries.length || input.entries.length > 200
                    || input.entries.some(entry => typeof entry !== 'string')) fail('Choose what to copy');
                if (!this.documents) fail('About-you notes are unavailable', 409);
                const from = await this.documents.run(source.id, 'user', false);
                const known = new Set(from.status === 'ready' ? setup.userEntries(from.content) : []);
                if (input.entries.some(entry => !known.has(entry))) fail('Those notes just changed, please choose again', 409);
                const document = await this.documents.run(profileId, 'user', false);
                if (document.status !== 'ready') fail('About-you notes are unavailable', 409);
                const next = setup.appendUserEntries(document.content, [...new Set(input.entries)]);
                if (next.added.length) {
                    const written = await this.documents.run(profileId, 'user', true, { content: next.content,
                        expectedRevision: document.revision, expectedProfileRevision: document.profileRevision });
                    if (written.documentSaved !== true) fail(written.error || 'About-you notes were not saved', 409);
                }
                added = next.added;
            }
            const now = new Date().toISOString();
            const saved = await this.profiles.mutate(revision, current => {
                const index = current.profiles.findIndex(profile => profile.id === profileId);
                const previous = current.profiles[index], bot = settings.readBot(previous);
                const onboarding = { ...bot.onboarding, steps: { ...bot.onboarding.steps, known: input.action === 'copy' ? 'done' : 'skipped' } };
                const nextBot = settings.normalizeBot({ ...bot, onboarding });
                current.profiles[index] = { ...previous, bot: { ...previous.bot, ...nextBot }, updatedAt: now };
                return { bot: { id: previous.id, name: previous.name, avatar: previous.avatar ?? null, bot: this.publicBot(nextBot) } };
            });
            this.emit('botChanged', { profileId });
            return { ok: true, revision: saved.revision, bot: saved.bot, added };
        });
    }

    trash(profileId, input = {}) {
        return this.profiles.reserve(() => require('./bot-trash').trashBot(this, profileId, input));
    }

    // Local onboarding choices share the profile reservation and never send a chat message.
    onboarding(profileId, input = {}) {
        return this.profiles.reserve(async () => {
            onboardingFlow.validateOnboardingInput(input);
            const current = await this.profiles.state();
            if (current.revision !== input.expectedRevision) fail('Profiles changed; reload before saving', 409);
            const { bot: before } = await this.bot(profileId);
            const desiredModel = input.action === 'model-choice' ? await onboardingFlow.modelChoice(before, input.model, this.catalog) : undefined;
            const now = new Date().toISOString();
            const saved = await this.profiles.mutate(input.expectedRevision, state => {
                const index = state.profiles.findIndex(profile => profile.id === profileId);
                const previous = state.profiles[index], bot = settings.readBot(previous);
                if (index < 0 || !bot || previous.trashedAt !== undefined) fail('Bot not found', 404);
                const changed = onboardingFlow.localStep(bot, input, now, desiredModel);
                // Preserve choices inferred from legacy/per-step answers before restart clears them.
                const chosen = input.action === 'restart' ? chosenIdentity(previous, bot) : bot.chosen;
                const nextBot = settings.normalizeBot({ ...changed, chosen });
                state.profiles[index] = { ...previous, bot: { ...previous.bot, ...nextBot }, updatedAt: now };
                return { bot: { id: previous.id, bot: this.publicBot(nextBot) } };
            });
            this.emit('botChanged', { profileId });
            return { ok: true, revision: saved.revision, bot: saved.bot };
        });
    }

    update(profileId, input = {}) {
        return this.profiles.reserve(async () => {
            if (!object(input) || typeof input.expectedRevision !== 'string' || !object(input.changes)) fail('Invalid bot change');
            const { name, description, soul, avatar, bot: botPatch, ...rest } = input.changes;
            if (Object.keys(rest).length) fail('Invalid bot change');
            return this.profiles.mutate(input.expectedRevision, state => {
                const index = state.profiles.findIndex(profile => profile.id === profileId);
                const previous = state.profiles[index];
                const bot = settings.readBot(previous);
                if (index < 0 || !bot || previous.trashedAt !== undefined) fail('Bot not found', 404);
                const base = validateProfile({ name: name ?? previous.name, description: description ?? previous.description,
                    soul: soul ?? previous.soul, enabled: previous.enabled, memory: previous.memory, skills: previous.skills,
                    ...(avatar !== undefined ? { avatar } : {}) }, previous);
                if (base.avatar?.kind === 'image' && (previous.avatar?.kind !== 'image' || previous.avatar.version !== base.avatar.version)) fail('Image avatar must be uploaded');
                const patched = botPatch === undefined ? bot : settings.applyBotPatch(bot, botPatch);
                // A name or face set here is the user's choice, even one that looks like a new Bot's.
                // A picture is uploaded first and then saved here as the face (it is already the
                // current face by then), which is the user's choice too.
                const faced = avatar !== undefined && (!isDeepStrictEqual(base.avatar ?? null, previous.avatar ?? null) || base.avatar?.kind === 'image');
                const chosen = { ...patched.chosen, ...(name !== undefined && base.name !== previous.name ? { name: true } : {}),
                    ...(faced ? { avatar: true } : {}) };
                // What the user sets here during the interview is not asked again there.
                const onboarding = { ...patched.onboarding, steps: { ...patched.onboarding.steps } };
                const answered = { name: base.name !== previous.name, avatar: faced,
                    job: patched.job !== bot.job, personality: base.soul !== previous.soul, work: patched.permissions.preset !== bot.permissions.preset };
                if (['greeting', 'interview'].includes(onboarding.phase))
                    for (const [step, changed] of Object.entries(answered)) if (changed && onboarding.steps[step] !== 'done' && !settled({ identity: onboarding.steps.identity }, step)) onboarding.steps[step] = 'done';
                const nextBot = settings.normalizeBot({ ...patched, chosen, onboarding });
                const record = { ...previous, ...base, bot: { ...previous.bot, ...nextBot }, updatedAt: new Date().toISOString() };
                state.profiles[index] = record;
                return { ok: true, bot: { id: record.id, name: record.name, avatar: record.avatar ?? null, bot: this.publicBot(nextBot) },
                    profileRevision: profileRevision(record) };
            }).then(result => { this.emit('botChanged', { profileId }); return result; });
        });
    }

    // Whether a Bot could talk at all: the number of usable chat models (null when unknown).
    async readiness() {
        if (!this.catalog) return { models: null };
        try {
            const catalog = await this.catalog(this.store.defaultProject());
            return { models: catalog.models.length };
        } catch (error) { return { models: null, error: error.message }; }
    }

    // Everything the Bot settings sheet edits, plus the models it can choose from. The model
    // list is best effort: without it the current choice still shows and can be kept.
    async settings(profileId) {
        const { state, revision } = await this.profiles.state();
        const profile = state.profiles.find(item => item.id === profileId);
        const bot = settings.readBot(profile);
        if (!bot || profile.trashedAt !== undefined) fail('Bot not found', 404);
        let models = null, modelsError = null;
        if (this.catalog) {
            try {
                const catalog = await this.catalog(bot.workspace);
                models = { defaults: catalog.defaults, models: catalog.models.map(model => ({ provider: model.provider, id: model.modelId,
                    name: model.name, thinkingLevels: model.thinkingLevels })) };
            } catch (error) { modelsError = error.message; }
        }
        return { revision, bot: { id: profile.id, name: profile.name, avatar: profile.avatar ?? null, soul: profile.soul, bot: { ...this.publicBot(bot), permissions: { ...bot.permissions, rules: structuredClone(bot.permissions.rules) } } },
            models, ...(modelsError ? { modelsError } : {}) };
    }
}

module.exports = { BotService, publicWindow, WORKSPACE_PARENT };
