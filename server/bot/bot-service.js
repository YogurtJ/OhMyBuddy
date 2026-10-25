'use strict';
// Bot Mode coordinator: Bots are profiles with a `bot` section; each Bot owns a private
// workspace directory (its project cwd) and permanent windows whose current native
// session generation is resolved here. Profile and window writes run under the shared
// profile/settings reservation (reserved synchronously, before any await).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { getSdk } = require('../pi-session-store');
const { validateProfile, profileRevision } = require('../pi-profile-registry');
const settings = require('./bot-settings');
const { BotWindowRegistry } = require('./bot-window-registry');
const { WINDOW_ENTRY, windowMarker, readWindowBinding } = require('./bot-window-state');
const { HANDOFF_MESSAGE, buildHandoff } = require('./bot-handoff');
const history = require('./bot-history');
const setup = require('./bot-setup');
const { EventEmitter } = require('node:events');

const MOVING = '这段聊天正在换到新的记录文件，请稍后再试';
const fail = (message, status = 400, code) => { throw Object.assign(new Error(message), { status, ...(code ? { code } : {}) }); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const UUID = /^[a-f0-9-]{36}$/;
const WORKSPACE_PARENT = 'PivaneBots';
const MAX_BOTS = 50;
const PLACEHOLDER = Object.freeze({ 'zh-CN': '新伙伴', en: 'New buddy' });
const DEFAULT_AVATAR = Object.freeze({ kind: 'emoji', value: '✨' });

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
                enabled: settings.isBot(profile), profileRevision: profileRevision(profile), bot: this.publicBot(bot),
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
            const bot = settings.normalizeBot(settings.defaultBot({ workspace, now, firstBot: existingBots.length === 0,
                order: existingBots.reduce((max, profile) => Math.max(max, settings.readBot(profile).order + 1), 0) }));
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

    // Caller holds the profile reservation. Native marker first, index second: an
    // interruption between the two leaves a marked session that reconcile() adopts.
    async createWindowLocked(profileId, kind, { title = '', emoji = '', focus = '' } = {}) {
        const { bot } = await this.bot(profileId);
        const { state, revision } = await this.windows.read(profileId);
        if (kind === 'main' && state.windows.some(window => window.kind === 'main')) fail('Bot already has a main chat', 409);
        const windowId = randomUUID();
        const session = await this.store.createSession(bot.workspace, '', { agentProfileId: profileId,
            initializeSession: manager => manager.appendCustomEntry(WINDOW_ENTRY,
                windowMarker({ sessionId: manager.getSessionId(), profileId, windowId, kind, generation: 0 })) });
        const now = new Date().toISOString();
        const record = { id: windowId, kind, title, emoji, focus, cwd: bot.workspace, createdAt: now, updatedAt: now, archivedAt: null,
            current: { generation: 0, sessionId: session.id, sessionPath: session.path },
            generations: [{ generation: 0, sessionId: session.id, sessionPath: session.path, startedAt: now, endedAt: null, reason: 'initial' }],
            rotation: null };
        const saved = await this.windows.mutate(profileId, revision, windowState => { windowState.windows.push(record); return {}; });
        return { ...publicWindow(record), windowsRevision: saved.revision };
    }

    // Idempotent repair: a Bot without a main window gets one (adopting a marked native
    // session left by an interrupted creation before creating a new one).
    ensureMainWindow(profileId) {
        return this.profiles.reserve(async () => {
            const { state } = await this.windows.read(profileId);
            const main = state.windows.find(window => window.kind === 'main');
            if (main) return publicWindow(main);
            const adopted = await this.reconcileLocked(profileId);
            return adopted.main ? publicWindow(adopted.main) : this.createWindowLocked(profileId, 'main');
        });
    }

    // Adds windows whose native generation-0 marker exists but whose index entry is
    // missing. Never removes or rewrites existing index entries.
    async reconcileLocked(profileId) {
        const { bot } = await this.bot(profileId);
        const markers = await this.nativeMarkers(profileId, bot.workspace);
        const { state, revision } = await this.windows.read(profileId);
        const known = new Set(state.windows.map(window => window.id));
        const adoptable = markers.filter(marker => marker.generation === 0 && !known.has(marker.windowId))
            .filter(marker => marker.kind !== 'main' || !state.windows.some(window => window.kind === 'main'));
        // Only one main window can be adopted; prefer the earliest.
        const mains = adoptable.filter(marker => marker.kind === 'main').sort((a, b) => a.created - b.created);
        const chosen = [...mains.slice(0, 1), ...adoptable.filter(marker => marker.kind === 'topic')];
        if (!chosen.length) return { main: state.windows.find(window => window.kind === 'main') || null, adopted: 0 };
        const now = new Date().toISOString();
        const saved = await this.windows.mutate(profileId, revision, windowState => {
            for (const marker of chosen) windowState.windows.push({ id: marker.windowId, kind: marker.kind, title: '', emoji: '', focus: '',
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
    async rotateLocked(profileId, windowId, { reason = 'manual', expectedGeneration } = {}) {
        if (!['size', 'entries', 'age', 'manual'].includes(reason)) fail('Invalid rotation reason');
        // The generation the caller saw is required, so a repeated or stale request never rotates again.
        if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) fail('Expected generation is required');
        const { bot } = await this.bot(profileId);
        await this.recoverRotationLocked(profileId, windowId);
        const { state, revision } = await this.windows.read(profileId);
        const window = state.windows.find(item => item.id === windowId);
        if (!window) fail('Window not found', 404);
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
                    const result = buildHandoff(manager);
                    read.validate();
                    if (current.path !== from.sessionPath || binding?.windowId !== windowId || binding.generation !== from.generation)
                        fail('Window conversation does not match its native marker', 409);
                    return result;
                });
                return this.store.createSession(window.cwd, '', { agentProfileId: profileId, initializeSession: manager => {
                    if (handoff.model) manager.appendModelChange(handoff.model.provider, handoff.model.modelId);
                    if (handoff.thinkingLevel) manager.appendThinkingLevelChange(handoff.thinkingLevel);
                    if (handoff.text) manager.appendCustomMessageEntry(HANDOFF_MESSAGE, handoff.text, false,
                        { version: 1, fromSessionId: from.sessionId, fromGeneration: from.generation });
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
        if (window.rotation) {
            try { await this.profiles.reserve(() => this.recoverRotationLocked(profileId, windowId)); }
            catch (error) {
                if (error.status === 409) fail(MOVING, 409, 'BOT_WINDOW_ROTATING');
                throw error;
            }
            window = await this.windowRecord(profileId, windowId);
            if (window.rotation) fail(MOVING, 409, 'BOT_WINDOW_ROTATING');
        }
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
        if (window.rotation) fail(MOVING, 409, 'BOT_WINDOW_ROTATING');
        if (!window.current || window.current.sessionId !== session.id || window.current.sessionPath !== session.path)
            fail('这段聊天已经换到新的记录文件', 409, 'BOT_WINDOW_STALE');
        return window;
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
        const profile = (await this.profiles.state()).state.profiles.find(item => item.id === binding.profileId);
        const bot = settings.readBot(profile);
        if (!settings.isBot(profile) || bot.workspace !== cwd) return null;
        const { state } = await this.windows.read(binding.profileId);
        const window = state.windows.find(item => item.id === binding.windowId);
        if (!window || window.cwd !== cwd || window.current?.sessionId !== sessionId || window.current.sessionPath !== sessionPath
            || window.current.generation !== binding.generation) return null;
        return { version: 1, profileId: binding.profileId, windowId: binding.windowId, sessionId, cwd, sessionPath };
    }

    // Saves a setup card the user confirmed (possibly edited). The card must still be pending
    // in the window's current native transcript; only its proposed fields are accepted.
    setup(profileId, input = {}) {
        return this.profiles.reserve(async () => {
            if (!object(input) || typeof input.expectedRevision !== 'string' || typeof input.windowId !== 'string') fail('Invalid setup confirmation');
            const window = await this.windowRecord(profileId, input.windowId);
            if (!window.current) fail('Window has no conversation yet', 409);
            const proposal = await this.store.withSessionRead(window.cwd, window.current.sessionId, (session, read) => {
                const manager = read.manager(), binding = readWindowBinding(manager);
                const found = setup.pendingProposal(manager, input.toolCallId);
                read.validate();
                if (session.path !== window.current.sessionPath || binding?.profileId !== profileId || binding.windowId !== window.id)
                    fail('Window conversation does not match its native marker', 409);
                return found;
            });
            const changes = setup.confirmedChanges(proposal, input.changes ?? proposal);
            if (!Object.keys(changes).length) fail('Nothing to save');
            const now = new Date().toISOString();
            const saved = await this.profiles.mutate(input.expectedRevision, state => {
                const index = state.profiles.findIndex(profile => profile.id === profileId);
                const previous = state.profiles[index], bot = settings.readBot(previous);
                if (index < 0 || !bot || previous.trashedAt !== undefined) fail('Bot not found', 404);
                const base = validateProfile({ name: changes.name ?? previous.name, description: previous.description,
                    soul: changes.personality ?? previous.soul, enabled: previous.enabled, memory: previous.memory, skills: previous.skills,
                    ...(changes.avatar ? { avatar: { kind: 'emoji', value: changes.avatar } } : {}) }, previous);
                const onboarding = { ...bot.onboarding, steps: { ...bot.onboarding.steps } };
                if (changes.name || changes.avatar) onboarding.steps.identity = 'done';
                if (changes.job) onboarding.steps.job = 'done';
                if (changes.personality) onboarding.steps.personality = 'done';
                if (changes.aboutUser) onboarding.steps.about = 'done';
                if (onboarding.phase === 'greeting') onboarding.phase = 'interview';
                if (changes.finish && !['done', 'skipped'].includes(onboarding.phase)) { onboarding.phase = 'done'; onboarding.completedAt = now; }
                const nextBot = settings.normalizeBot({ ...bot, job: changes.job ?? bot.job, onboarding });
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
            this.emit('botChanged', { profileId });
            return { ok: true, revision: saved.revision, bot: saved.bot, saved: changes, ...(user ? { user } : {}) };
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

    // Onboarding without a model call: start (greeting → interview), skip, or start over.
    onboarding(profileId, input = {}) {
        return this.profiles.reserve(async () => {
            if (!object(input) || typeof input.expectedRevision !== 'string' || !['start', 'skip', 'restart'].includes(input.action))
                fail('Invalid onboarding change');
            const now = new Date().toISOString();
            const saved = await this.profiles.mutate(input.expectedRevision, state => {
                const index = state.profiles.findIndex(profile => profile.id === profileId);
                const previous = state.profiles[index], bot = settings.readBot(previous);
                if (index < 0 || !bot || previous.trashedAt !== undefined) fail('Bot not found', 404);
                const onboarding = { ...bot.onboarding, steps: { ...bot.onboarding.steps } };
                if (input.action === 'start') { if (onboarding.phase === 'greeting') onboarding.phase = 'interview'; }
                else if (input.action === 'skip') { onboarding.phase = 'skipped'; onboarding.completedAt = now; }
                else Object.assign(onboarding, { phase: 'interview', steps: {}, startedAt: now, completedAt: null });
                const nextBot = settings.normalizeBot({ ...bot, onboarding });
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
                const nextBot = botPatch === undefined ? bot : settings.applyBotPatch(bot, botPatch);
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
        return { revision, bot: { id: profile.id, name: profile.name, avatar: profile.avatar ?? null, soul: profile.soul, bot: this.publicBot(bot) },
            models, ...(modelsError ? { modelsError } : {}) };
    }
}

module.exports = { BotService, publicWindow, WORKSPACE_PARENT };
