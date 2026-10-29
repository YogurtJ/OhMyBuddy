const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { ChannelStore, pending, blocksFollowing } = require('./store');
const { WeixinComponent } = require('./weixin-component');
const { WeixinAdapter, createTransport, validId } = require('./weixin-adapter');
const { outcome } = require('./runtime');
const { bindingBoundary, threadOutcome } = require('./thread-results');
const { DeliverableStore } = require('../pi-deliverables');
const { customTypeIs } = require('../ohmybuddy-compat');
const botChannel = require('./bot-channel');
const { readWindowBinding } = require('../bot/bot-window-state');
const { ChannelApprovals, parseApproval } = require('./bot-approvals');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same = (a, b) => a?.cwd === b?.cwd && a?.sessionId === b?.sessionId;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
// Persisted Bot model preferences do not touch a running worker. Reads and these owner
// settings commands may pass a waiting turn, including one paused for an approval.
const botControl = (slash, binding) => Boolean(binding?.bot && slash &&
    (['/model', '/thinking'].includes(slash.command)
        || ['/bot', '/topic'].includes(slash.command) && (!slash.args || slash.args.toLowerCase() === 'list')));
// Older workers lack preflight codes. Match only their exact rejection messages; other
// RPC failures and timeouts can follow execution and must keep the uncertain boundary.
const LEGACY_MODEL_REJECTIONS = new Set(['请先为线程配置可用模型',
    '当前线程模型不支持图片输入，请用 /model 切换到支持视觉的模型',
    '当前聊天没有可用模型，请用 /model 选择模型或检查工作区默认模型',
    '当前聊天模型不支持图片输入，请用 /model 选择支持视觉的模型后重新发送图片']);
const SLASH_COMMANDS = new Set(['/help', '/status', '/stop', '/new', '/reset', '/resume', '/name', '/model', '/thinking', '/compact', '/reload', '/confirm', '/bot', '/topic']);
// Chinese names for the Bot commands (M4-4).
const SLASH_ALIASES = new Map([['/切换', '/bot'], ['/话题', '/topic']]);
function parseSlash(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed.startsWith('/')) return null;
    const match = /^(\/[\p{L}\p{N}_-]+)(?:\s+([\s\S]*))?$/u.exec(trimmed);
    if (!match) return null;
    const cmd = SLASH_ALIASES.get(match[1]) || match[1].toLowerCase();
    return SLASH_COMMANDS.has(cmd) ? { command: cmd, args: (match[2] || '').trim() } : null;
}
class ChannelsService {
    constructor({ store, supervisor, mediaLabService, mediaRoot, isSuspended = () => false, directory, componentFactory, adapterFactory }) {
        Object.assign(this, { store, supervisor, mediaLabService, mediaRoot: mediaRoot ? path.resolve(mediaRoot) : null, isSuspended, directory, componentFactory, adapterFactory });
        this.deliverables = new DeliverableStore(store);
        this.mutating = false; this.operations = new Set(); this.pollers = new Map(); this.runs = new Map(); this.connections = new Map();
        this.stopping = false; this.stopController = new AbortController(); this.login = null; this.loginFlight = null; this.error = null;
        this.initializing = true;
        this.onThreadResult = event => {
            try { this.admitThreadResult(event); }
            catch { this.error = '线程结果投递意图无法保存，已停止后续投递，请核对消息渠道。'; }
        };
        this.supervisor.on?.('thread-result', this.onThreadResult);
        this.ready = this.initialize().catch(() => { this.error = '消息渠道记录或组件无法读取，已停止连接，请检查安装与数据。'; }).finally(() => { this.initializing = false; });
    }
    async initialize() {
        this.directory ||= require('../ohmybuddy-compat').dataFile((await require('../pi-session-store').getSdk()).getAgentDir(), 'ohmybuddy-channels');
        this.db = new ChannelStore(this.directory);
        this.component = this.componentFactory?.(this.directory) || new WeixinComponent(this.directory);
        if (this.db.value.accounts.some(a => a.enabled)) {
            this.db.claim();
            try { await this.ensureAdapter(); this.start(); }
            catch { this.componentError = '微信组件无法加载，请先停用连接，再卸载并重新安装组件。'; }
        }
    }
    get busy() { return this.initializing || this.mutating || Boolean(this.login && Date.now() < this.login.expiresAt) || Boolean(this.loginFlight) || this.operations.size > 0 || this.runs.size > 0; }
    healthy() { if (this.error) throw fail(this.error); if (this.stopping || this.isSuspended()) throw fail('工作台正在维护，请稍后再试', 409); }
    async ensureAdapter() {
        if (!this.adapter) this.adapter = this.adapterFactory ? await this.adapterFactory() : new WeixinAdapter(await this.component.load(createTransport(this.stopController.signal, () => this.login?.controller?.signal)));
        return this.adapter;
    }
    track(promise) { this.operations.add(promise); promise.finally(() => this.operations.delete(promise)).catch(() => {}); return promise; }
    start() {
        if (!this.timer) {
            this.timer = setInterval(() => { void this.pump(); }, 1000); this.timer.unref?.();
            void this.track(botChannel.reconcile(this)).catch(() => {});
        }
        for (const account of this.db.value.accounts) if (account.enabled && !this.pollers.has(account.id)) this.startPoll(account.id);
    }
    async snapshot() {
        await this.ready;
        if (this.login && Date.now() >= this.login.expiresAt) { this.login.controller?.abort(); this.login = null; }
        let component = { installed: false };
        try { component = this.component?.status() || component; }
        catch { component = { installed: true, broken: true, error: '微信组件校验失败，请先停用连接，再卸载并重新安装。' }; }
        if (this.componentError) component.error = this.componentError;
        return { revision: this.db?.value.revision, error: this.error, busy: this.mutating, component,
            accounts: (this.db?.value.accounts || []).map(({ id, userId, enabled, allowedUsers }) => ({ id, userId, enabled, allowedUsers, connection: this.connections.get(id) || (enabled ? 'starting' : 'disabled') })),
            bindings: this.db?.value.bindings || [], peers: (this.db?.value.peers || []).map(({ accountId, peerId, lastSeenAt }) => ({ accountId, peerId, lastSeenAt })),
            jobs: (this.db?.value.jobs || []).slice(-60).reverse().map(job => {
                const { id, accountId, peerId, target, status, reason, at, sentChunks, sentMedia, waiting, sendStarted, kind, deliveryIssues, deliveryError, platformCode, retryCount, nextAttemptAt } = job;
                return { id, accountId, peerId, target, status, reason, at, sentChunks, sentMedia, waiting, kind, deliveryIssues,
                    deliveryError, platformCode, retryCount, nextAttemptAt, blocksFollowing: blocksFollowing(job),
                    canRecover: status === 'uncertain' && !sendStarted && kind !== 'slash' };
            }),
            login: this.login ? { id: this.login.id, matrix: this.login.matrix, status: this.login.status, expiresAt: this.login.expiresAt } : null,
            typing: require('./typing').typingSnapshot(this),
            capabilities: { text: true, images: true, files: true, slashCommands: true, typing: true, groups: false, proactive: true, threadResults: true } };
    }
    claim() { this.db.claim(); }
    async action(input) {
        await this.ready; this.healthy();
        if (this.mutating) throw fail('渠道配置正在处理，请刷新核对', 409);
        if (!input || input.confirmed !== true || typeof input.action !== 'string' || input.expectedRevision !== this.db.value.revision) throw fail('配置已变化或操作未确认，请刷新核对', 409);
        const fields = ['action', 'confirmed', 'expectedRevision', 'accountId', 'enabled', 'allowedUsers', 'peerId', 'cwd', 'sessionId', 'newSession', 'replyMode', 'jobId', 'loginId', 'code', 'botProfileId'];
        if (Object.keys(input).some(key => !fields.includes(key))) throw fail('未知渠道参数');
        this.mutating = true;
        try {
            this.claim();
            const action = input.action;
            if (action === 'install') { await this.component.install(this.stopController.signal); this.componentError = null; }
            else if (action === 'uninstall') {
                if (this.db.value.accounts.some(a => a.enabled) || this.runs.size || this.login || this.loginFlight || this.pollers.size) throw fail('请先停用连接并结束登录，再卸载组件');
                this.component.uninstall(); this.adapter = null; this.componentError = null;
            } else if (action === 'login') {
                if (this.login || this.loginFlight) throw fail('已有登录正在进行');
                await this.ensureAdapter();
                const login = await this.adapter.loginStart(this.stopController.signal, this.db.value.accounts.map(a => a.token));
                this.healthy(); this.login = { ...login, controller: new AbortController() }; this.scheduleLogin();
            } else if (action === 'cancel-login') {
                if (input.loginId !== this.login?.id) throw fail('登录已变化');
                this.login.controller?.abort(); this.login = null;
            } else if (action === 'verify-login') {
                if (input.loginId !== this.login?.id || this.login.status !== 'need_verifycode' || !/^\d{1,12}$/.test(input.code || '')) throw fail('验证码或登录状态无效');
                this.login.code = input.code; this.login.status = 'wait'; this.scheduleLogin();
            } else if (action === 'account') {
                const account = this.db.value.accounts.find(a => a.id === input.accountId);
                if (!account || typeof input.enabled !== 'boolean' || !Array.isArray(input.allowedUsers) || input.allowedUsers.length > 100 || !input.allowedUsers.every(validId)) throw fail('微信账号或允许用户无效');
                const allow = [...new Set(input.allowedUsers)];
                if (input.enabled && !allow.length) throw fail('启用前请指定允许使用的微信用户');
                if (input.enabled) await this.ensureAdapter();
                this.healthy();
                this.db.change(v => {
                    Object.assign(v.accounts.find(a => a.id === account.id), { enabled: input.enabled, allowedUsers: allow });
                    for (const j of v.jobs) if (j.accountId === account.id && (j.status === 'queued' || j.kind === 'slash' && j.status === 'dispatching' && !j.commandSubmitted) && (!input.enabled || !allow.includes(j.peerId))) { j.status = 'cancelled'; delete j.text; delete j.images; }
                }, { config: true, revision: input.expectedRevision });
                if (!input.enabled) { await this.stopPoll(account.id); this.connections.set(account.id, 'disabled'); }
                else this.start();
            } else if (action === 'bind') {
                const account = this.db.value.accounts.find(a => a.id === input.accountId);
                if (!account || !validId(input.peerId) || !account.allowedUsers.includes(input.peerId)) throw fail('请先将此微信用户加入允许列表');
                if (!['all', 'wechat'].includes(input.replyMode ?? 'all')) throw fail('无效的微信接收方式');
                if (this.db.value.bindings.length >= 200) throw fail('绑定数量超过限制');
                this.assertPeerIdle(account.id, input.peerId);
                if (input.botProfileId !== undefined) { await botChannel.bindBot(this, account, input); return { ...await this.snapshot(), busy: false }; }
                const cwd = this.store.resolveProject(input.cwd);
                let session;
                if (input.newSession === true) session = await this.store.createSession(cwd, '微信对话');
                else session = await this.store.getSession(cwd, input.sessionId);
                await this.withBindingTarget(cwd, session.id, (target, boundary) => {
                    this.healthy();
                    this.db.change(v => {
                        v.bindings = v.bindings.filter(b => !(b.accountId === account.id && b.peerId === input.peerId));
                        v.bindings.push({ id: randomUUID(), accountId: account.id, peerId: input.peerId, cwd: target.cwd, sessionId: target.id,
                            name: target.name || '微信对话', replyMode: input.replyMode ?? 'all', ...boundary });
                    }, { config: true, revision: input.expectedRevision });
                });
            } else if (action === 'unbind-bot') {
                await botChannel.unbindBot(this, input);
            } else if (action === 'unbind') {
                this.assertPeerIdle(input.accountId, input.peerId);
                this.db.change(v => { v.bindings = v.bindings.filter(b => !(b.accountId === input.accountId && b.peerId === input.peerId)); }, { config: true });
            } else if (action === 'acknowledge') {
                const job = this.job(input.jobId);
                if (!job || this.runs.has(job.id) || !['uncertain', 'failed', 'ready'].includes(job.status)) throw fail('此消息不能标记为已核对');
                this.updateJob(job.id, { status: 'reviewed', reason: 'user-reviewed', text: undefined, images: undefined, directReply: undefined });
            } else if (action === 'recover') {
                const job = this.job(input.jobId);
                if (!job || job.status !== 'uncertain' || job.kind === 'slash' || job.sendStarted || this.runs.has(job.id)) throw fail('此消息不能恢复自动发送，请在网页查看回复');
                const result = job.directReply ? { status: 'completed', body: job.directReply } : await this.readOutcome(job);
                if (!result || !['completed', 'error', 'stopped'].includes(result.status)) throw fail('未找到原生完成记录；不会重新运行任务');
                this.updateJob(job.id, { status: 'ready', reason: null, text: undefined, images: undefined });
            } else if (action === 'stop') {
                const job = this.job(input.jobId), run = job && this.runs.get(job.id);
                if (!run?.worker || (run.worker.channelRun !== job.id && run.worker.channelCommandId !== job.id)) throw fail('此微信任务当前没有运行');
                await run.worker.request('abort');
            } else throw fail('不支持的渠道操作');
            return { ...await this.snapshot(), busy: false };
        } finally { this.mutating = false; }
    }
    async withBindingTarget(cwd, sessionId, commit, { bot } = {}) {
        return this.store.withSessionRead(cwd, sessionId, (session, read) => {
            if (read.manager().getEntries().some(e => e.type === 'custom'
                && (customTypeIs(e, 'pivane-extension-assistant') || customTypeIs(e, 'pivane-profile-authoring')))) {
                throw fail('管理助手线程不能绑定外部聊天');
            }
            // A thread binding names one session file; a Bot chat moves to new files over time, so it
            // is only reachable through a Bot binding that names its window (bot-channel.js).
            const marked = read.manager().getEntries().some(e => e.type === 'custom' && e.customType === 'pivane-bot-window');
            if (marked && !bot) throw fail('Bot 聊天请在 Bot 设置或渠道设置里按 Bot 连接微信');
            // The same native ownership proof the Bot service uses (one marker, bound to this session and its profile).
            const owner = bot ? readWindowBinding(read.manager()) : null;
            if (bot && (owner?.profileId !== bot.profileId || owner.windowId !== bot.windowId || owner.sessionId !== session.id))
                throw fail('Bot 聊天与微信绑定不一致，请刷新核对', 409);
            read.validate();
            // The caller's synchronous commit shares this validated file snapshot.
            return commit(session, bindingBoundary(read.manager()));
        });
    }
    assertPeerIdle(accountId, peerId) {
        if (this.db.value.jobs.some(j => j.accountId === accountId && j.peerId === peerId && pending(j))) throw fail('此聊天还有待处理或待核对消息，请先处理后更改绑定', 409);
    }
    assertUnbound(cwd, sessionId) {
        if (this.initializing || this.error || !this.db) throw fail('消息渠道状态尚无法核对，请先处理后再删除或移动线程', 409);
        if (this.mutating) throw fail('消息渠道配置正在处理，请稍后再操作线程', 409);
        if (this.db?.value.bindings.some(b => b.cwd === cwd && b.sessionId === sessionId)) throw fail('请先解除此线程的消息渠道绑定', 409);
    }
    scheduleLogin() {
        if (this.loginFlight || !this.login || this.stopping) return;
        const login = this.login;
        const promise = (async () => {
            while (this.login === login && !this.stopping && Date.now() < login.expiresAt) {
                if (this.isSuspended()) return;
                const code = login.code; delete login.code;
                let response;
                try { response = await this.adapter.loginPoll(login, code); }
                catch { if (this.login === login) login.status = 'error'; return; }
                if (this.login !== login || this.stopping || this.isSuspended()) return;
                if (Date.now() >= login.expiresAt) { this.login = null; return; }
                login.status = response.status;
                if (response.account) {
                    this.db.change(v => {
                        const old = v.accounts.find(a => a.id === response.account.id);
                        if (old) Object.assign(old, { token: response.account.token, baseUrl: response.account.baseUrl, userId: response.account.userId });
                        else { if (v.accounts.length >= 10) throw fail('最多连接 10 个微信账号'); v.accounts.push(response.account); }
                    }, { config: true });
                    this.login = null; this.start(); return;
                }
                if (['need_verifycode', 'expired', 'verify_code_blocked', 'binded_redirect'].includes(response.status)) return;
                await delay(750, undefined, { signal: this.stopController.signal });
            }
            if (this.login === login) this.login = null;
        })();
        this.loginFlight = promise;
        promise.catch(() => { if (this.login === login) login.status = 'error'; }).finally(() => {
            if (this.loginFlight === promise) this.loginFlight = null;
            if (this.login === login && login.code && login.status === 'wait' && !this.stopping) this.scheduleLogin();
        });
    }
    startPoll(accountId) {
        if (this.stopping || this.pollers.has(accountId)) return;
        const controller = new AbortController(), poller = { controller, promise: null };
        this.pollers.set(accountId, poller);
        poller.promise = (async () => {
            let announced = false, failures = 0;
            while (!this.stopping && !controller.signal.aborted) {
                const account = this.db.value.accounts.find(a => a.id === accountId);
                if (!account?.enabled) return;
                if (this.isSuspended() || this.mutating) { await delay(500, undefined, { signal: controller.signal }); continue; }
                try {
                    if (!announced) { await this.adapter.notify(account, true); announced = true; }
                    const result = await this.adapter.poll(account, controller.signal);
                    if (controller.signal.aborted || this.stopping || this.isSuspended()) continue;
                    try { this.receive(accountId, result); }
                    catch { this.error = '渠道消息记录保存失败，已停止接收与投递，请核对数据文件。'; return; }
                    this.connections.set(accountId, 'connected'); failures = 0;
                    await delay(250, undefined, { signal: controller.signal });
                } catch (error) {
                    if (controller.signal.aborted || this.stopping) return;
                    this.connections.set(accountId, 'error'); failures++;
                    await delay(Math.min(30000, 1000 * 2 ** Math.min(failures, 5)), undefined, { signal: controller.signal });
                }
            }
        })();
        poller.promise.catch(() => {}).finally(() => { if (this.pollers.get(accountId) === poller) this.pollers.delete(accountId); });
    }
    async stopPoll(id) {
        const poller = this.pollers.get(id); if (!poller) return;
        poller.controller.abort(); await poller.promise.catch(() => {});
        const account = this.db.value.accounts.find(a => a.id === id);
        if (account && this.adapter && !this.stopping) await this.adapter.notify(account, false).catch(() => {});
    }
    receive(accountId, response) {
        const current = this.db.value.accounts.find(a => a.id === accountId);
        if (!(response.msgs?.length) && (response.get_updates_buf === undefined || response.get_updates_buf === current?.cursor)) return;
        this.db.change(v => {
            const account = v.accounts.find(a => a.id === accountId); if (!account?.enabled) return;
            for (const raw of response.msgs || []) {
                const msg = this.adapter.message(raw);
                if (!msg || !account.allowedUsers.includes(msg.peerId)) continue;
                const id = digest(['weixin', accountId, msg.peerId, msg.messageId]);
                if (v.jobs.some(j => j.id === id)) continue;
                let peer = v.peers.find(p => p.accountId === accountId && p.peerId === msg.peerId);
                if (!peer) { if (v.peers.length >= 500) continue; peer = { accountId, peerId: msg.peerId, contextToken: '' }; v.peers.push(peer); }
                Object.assign(peer, { ...(msg.contextToken ? { contextToken: msg.contextToken } : {}), lastSeenAt: Date.now() });
                const binding = v.bindings.find(b => b.accountId === accountId && b.peerId === msg.peerId);
                const activeCount = v.jobs.filter(j => ['queued', 'dispatching', 'running'].includes(j.status) && j.accountId === accountId && j.peerId === msg.peerId).length;
                const slash = !msg.images?.length ? parseSlash(msg.text) : null;
                // Answers to a waiting Bot approval go ahead of the turn that waits for them.
                const isApproval = Boolean(!msg.images?.length && parseApproval(msg.text));
                const isControl = Boolean(slash && ['/stop', '/status', '/help'].includes(slash.command)) || botControl(slash, binding) || isApproval;
                const approvalsWaiting = isApproval ? v.jobs.filter(j => pending(j) && j.accountId === accountId && j.peerId === msg.peerId
                    && (j.kind === 'approval' || j.status === 'queued' && parseApproval(j.text))).length : 0;
                const isStop = slash?.command === '/stop';
                const stopQueued = isStop && v.jobs.some(j => pending(j) && j.accountId === accountId && j.peerId === msg.peerId && parseSlash(j.text)?.command === '/stop');
                const hasContent = Boolean(msg.text.trim() || msg.images?.length);
                const reason = !binding ? 'unbound' : msg.unsupported ? 'unsupported-message' : !hasContent ? 'empty-message'
                    : !peer.contextToken && !isStop ? 'reply-context-missing' : stopQueued ? 'stop-already-queued'
                    : activeCount >= 20 && !isControl || approvalsWaiting >= 3 ? 'queue-full' : null;
                v.jobs.push({ id, accountId, peerId: msg.peerId, target: binding ? { cwd: binding.cwd, sessionId: binding.sessionId } : null,
                    bindingId: binding?.id, status: reason ? 'ignored' : 'queued', reason, at: Date.now(),
                    ...(reason ? {} : { text: msg.text, ...(msg.images?.length ? { images: msg.images } : {}) }) });
            }
            // Cursor commits with admitted intents and deduplication receipts.
            if (typeof response.get_updates_buf === 'string') account.cursor = response.get_updates_buf;
            this.trimJobs(v);
        });
    }
    admitThreadResult(event) {
        if (!this.db?.owner || this.error || this.stopping || !event?.target || event.source?.kind === 'cron') return;
        const original = event.source?.kind === 'channel' ? this.job(event.source.id) : null;
        const recipients = this.db.value.bindings.filter(b => same(b, event.target) && b.replyMode !== 'wechat'
            && event.completedAt >= (b.boundAt || 0) && event.id !== b.excludedTurnId
            && !(original && original.accountId === b.accountId && original.peerId === b.peerId)
            && this.db.value.accounts.some(a => a.id === b.accountId && a.enabled && a.allowedUsers.includes(b.peerId)));
        if (!recipients.length) return;
        this.db.change(v => {
            for (const b of recipients) {
                const id = digest(['weixin-thread', event.id, b.accountId, b.peerId]);
                if (v.jobs.some(j => j.id === id)) continue;
                const peer = v.peers.find(p => p.accountId === b.accountId && p.peerId === b.peerId);
                v.jobs.push({ id, kind: 'thread', turnId: event.id, accountId: b.accountId, peerId: b.peerId,
                    target: { cwd: b.cwd, sessionId: b.sessionId }, bindingId: b.id, at: event.completedAt,
                    ...(b.bot ? { bot: { profileId: b.bot.profileId, windowId: b.bot.windowId } } : {}),
                    status: 'ready', reason: peer?.contextToken ? null : 'reply-context-missing' });
            }
            this.trimJobs(v);
        });
    }
    captureScheduledRecipients(event) {
        if (!this.db || this.error) throw fail('渠道状态尚不可读取');
        const accepts = b => event.notificationMode !== 'inherit' || b.replyMode !== 'wechat';
        // A Bot window's results reach every chat connected to the Bot (bot-channel.js).
        if (event.target?.bot) return botChannel.pushRecipients(this, event, accepts);
        return this.db.value.bindings.filter(b => same(b, event.target) && accepts(b)
            && this.db.value.accounts.some(a => a.id === b.accountId && a.enabled && a.allowedUsers.includes(b.peerId)))
            .map(b => ({ bindingId: b.id, accountId: b.accountId, peerId: b.peerId, cwd: b.cwd, sessionId: b.sessionId }));
    }
    scheduledRecipient(ref, event) {
        if (!ref || !same(ref, event.target)) return null;
        const binding = this.db.value.bindings.find(b => b.id === ref.bindingId && b.accountId === ref.accountId
            && b.peerId === ref.peerId && (ref.bot ? b.bots?.includes(ref.bot.profileId) && ref.bot.profileId === event.target.bot?.profileId : same(b, ref)));
        const account = this.db.value.accounts.find(a => a.id === ref.accountId);
        return binding && (event.notificationMode !== 'inherit' || binding.replyMode !== 'wechat')
            && account?.enabled && account.allowedUsers.includes(ref.peerId) ? binding : null;
    }
    async notifyScheduledRun(event) {
        await this.ready;
        if (this.stopping || this.isSuspended() || this.error) return { status: 'retry', reason: 'channel-unavailable' };
        if (!event?.target || !Array.isArray(event.recipients)) return { status: 'skipped', reason: 'recipient-proof-missing' };
        // A Bot-started message has no saved task; bot-proactive.js already cleared it for pushing.
        if (!event.proactive && this.canNotifyScheduled && !this.canNotifyScheduled(event.jobId)) return { status: 'skipped', reason: 'configuration-revoked' };
        const bindings = event.recipients.map(ref => this.scheduledRecipient(ref, event)).filter(Boolean);
        if (!bindings.length) return { status: 'skipped', reason: 'recipients-revoked' };
        if (!this.db.owner) return { status: 'retry', reason: 'channel-unavailable' };
        const key = binding => digest(['weixin-cron', event.runId, binding.accountId, binding.peerId]);
        if (bindings.every(b => this.job(key(b)))) return { status: 'accepted' };
        let result;
        try {
            result = await this.store.withSessionRead(event.target.cwd, event.target.sessionId, (_s, read) => {
                const value = require('./turn-results').scheduledOutcome(read.manager(), event);
                // A Bot window's own marker names the window the push came from.
                if (value && event.target.bot) value.window = readWindowBinding(read.manager());
                read.validate(); return value;
            });
        } catch { return { status: 'retry', reason: 'native-result-unavailable' }; }
        if (!result) return { status: 'retry', reason: 'native-result-unproven' };
        if (event.target.bot && (result.window?.profileId !== event.target.bot.profileId || result.window.sessionId !== event.target.sessionId))
            return { status: 'skipped', reason: 'bot-window-unproven' };
        if (this.stopping || this.isSuspended()) return { status: 'retry', reason: 'channel-unavailable' };
        const header = '⏰ 定时任务「' + event.name + '」';
        // A message a Bot started itself reads like any message from it; failures are not pushed.
        if (event.proactive && (event.status !== 'completed' || !result.body)) return { status: 'skipped', reason: 'nothing-to-push' };
        const body = event.proactive ? result.body : event.status === 'stopped' ? header + '已停止。'
            : event.status === 'error' ? header + '执行失败，请在 OhMyBuddy 网页查看。'
            : header + '\n\n' + (result.body || '已完成，请在 OhMyBuddy 网页查看结果。');
        let accepted = false;
        this.db.change(v => {
            if (!event.proactive && this.canNotifyScheduled && !this.canNotifyScheduled(event.jobId)) return;
            for (const ref of event.recipients) {
                const binding = this.scheduledRecipient(ref, event);
                if (!binding) continue;
                const id = key(binding); accepted = true;
                if (v.jobs.some(j => j.id === id)) continue;
                const peer = v.peers.find(p => p.accountId === binding.accountId && p.peerId === binding.peerId);
                const reason = !peer?.contextToken ? 'reply-context-missing' : null;
                v.jobs.push({ id, kind: event.proactive ? 'bot-push' : 'cron', followsThread: event.notificationMode === 'inherit', cronRunId: event.runId, cronJobId: event.jobId,
                    accountId: binding.accountId, peerId: binding.peerId,
                    // A Bot push keeps the generation it came from as its target (bot-channel.js).
                    ...(ref.bot ? { target: { cwd: event.target.cwd, sessionId: event.target.sessionId }, bot: { profileId: ref.bot.profileId, windowId: result.window.windowId } }
                        : { target: { cwd: binding.cwd, sessionId: binding.sessionId } }), bindingId: binding.id,
                    status: 'ready', reason, at: Date.now(),
                    directReply: body.slice(0, 60000), deliverables: result.deliverables, mediaPlans: result.mediaPlans });
            }
            this.trimJobs(v);
        });
        // Only acknowledge durable admission here. The normal channel pump owns sending.
        return { status: accepted ? 'accepted' : 'skipped', ...(accepted ? {} : { reason: 'recipients-revoked' }) };
    }
    trimJobs(value) {
        while (value.jobs.length > 4500) {
            const index = value.jobs.findIndex(j => !pending(j)
                && !(['cron', 'bot-push'].includes(j.kind) && this.scheduledAdmissionPending?.(j.cronRunId)));
            if (index < 0) throw fail('渠道消息记录已满');
            value.jobs.splice(index, 1);
        }
    }
    job(id) { return this.db.value.jobs.find(j => j.id === id); }
    updateJob(id, changes) { this.db.change(v => { const j = v.jobs.find(j => j.id === id); if (j) Object.assign(j, changes); }); }
    pump() {
        if (this.stopping || this.isSuspended() || this.mutating || this.error || !this.db?.owner) return;
        for (const job of this.db.value.jobs) {
            const slash = job.status === 'queued' && !job.images?.length ? parseSlash(job.text) : null;
            const answer = Boolean(job.status === 'queued' && !job.images?.length && parseApproval(job.text));
            const control = Boolean(slash && ['/stop', '/status', '/help'].includes(slash.command)) || botControl(slash, this.bindingFor(job)) || answer;
            // An approval answer is applied at once (bot-approvals.js): it always has room, as the turn waits for it.
            if (this.runs.size >= (answer ? 8 : control ? 4 : 3)) continue;
            const recover = job.status === 'uncertain' && !job.sendStarted && job.kind !== 'slash' && (job.recoveryAttempts || 0) < 5;
            if ((!['queued', 'ready'].includes(job.status) && !recover) || this.runs.has(job.id) || job.nextAttemptAt > Date.now()) continue;
            const account = this.db.value.accounts.find(a => a.id === job.accountId);
            if (!account?.enabled || !account.allowedUsers.includes(job.peerId)) continue;
            if (job.kind === 'cron' && this.canNotifyScheduled && !this.canNotifyScheduled(job.cronJobId)) {
                this.updateJob(job.id, { status: 'cancelled', reason: 'notification-revoked', directReply: undefined, deliverables: undefined, mediaPlans: undefined }); continue;
            }
            if (job.status === 'ready' && !this.db.value.peers.some(p => p.accountId === job.accountId && p.peerId === job.peerId && p.contextToken)) {
                if (job.reason !== 'reply-context-missing') this.updateJob(job.id, { reason: 'reply-context-missing' });
                continue;
            }
            if (!control && ([...this.runs.entries()].some(([id, r]) => same(r.target, job.target)
                || this.job(id)?.accountId === job.accountId && this.job(id)?.peerId === job.peerId)
                || job.status === 'queued' && this.db.value.jobs.some(j => j.id !== job.id && blocksFollowing(j)
                    && (same(j.target, job.target) || j.accountId === job.accountId && j.peerId === job.peerId)))) continue;
            const run = { target: job.target, worker: null, promise: null }; this.runs.set(job.id, run);
            run.promise = Promise.resolve().then(() => recover ? this.recoverCompleted(job.id) : this.run(job.id, run)).catch(() => {
                try {
                    if (recover) throw new Error('Recovery receipt could not be saved');
                    const current = this.job(job.id);
                    if (current.status === 'ready' && !current.sendStarted) {
                        const attempts = (current.readAttempts || 0) + 1;
                        this.updateJob(job.id, { status: attempts < 5 ? 'ready' : 'failed', reason: 'reply-read-pending', readAttempts: attempts, nextAttemptAt: Date.now() + 30000 });
                    } else if (current.status === 'queued') this.updateJob(job.id, { status: 'failed', reason: 'execution-not-started' });
                    else if (['dispatching', 'running', 'sending'].includes(current.status)) {
                        this.updateJob(job.id, { status: 'uncertain', reason: current.sendStarted ? 'delivery-unconfirmed' : 'execution-or-delivery-uncertain' });
                    }
                }
                catch { this.error = '渠道投递记录无法保存，已停止后续投递'; }
            }).finally(() => this.runs.delete(job.id));
        }
    }
    async recoverCompleted(id) {
        const job = this.job(id);
        let result;
        try { result = typeof job.directReply === 'string' ? { status: 'completed' } : await this.readOutcome(job); }
        catch (error) { if (error.code === 'SESSION_BUSY') return; }
        if (this.stopping || this.isSuspended() || this.job(id)?.status !== 'uncertain') return;
        if (result && ['completed', 'error', 'stopped'].includes(result.status)) {
            this.updateJob(id, { status: 'ready', reason: null, waiting: false, text: undefined, images: undefined, nextAttemptAt: undefined });
        } else {
            this.updateJob(id, { recoveryAttempts: (job.recoveryAttempts || 0) + 1, nextAttemptAt: Date.now() + 30000 });
        }
    }
    bindingFor(job) {
        // A Bot's reply or push stays deliverable after the chat switched to another of its connected
        // Bot windows, or the window moved to a new generation (job.bot names where it came from).
        // Never for admitting a message or command: those run only where the chat currently is.
        const produced = !['queued', 'dispatching'].includes(job.status);
        const binding = this.db.value.bindings.find(b => b.id === job.bindingId && b.accountId === job.accountId && b.peerId === job.peerId
            && (same(b, job.target) || Boolean(produced && job.bot && b.bot && b.bots?.includes(job.bot.profileId))));
        return binding && (!(job.kind === 'thread' || job.followsThread) || binding.replyMode !== 'wechat') ? binding : null;
    }
    canAdmit(job) {
        const account = this.db.value.accounts.find(a => a.id === job?.accountId);
        return !this.stopping && !this.isSuspended() && ['queued', 'dispatching'].includes(job?.status)
            && Boolean(account?.enabled && account.allowedUsers.includes(job.peerId) && this.bindingFor(job));
    }
    startTyping(account, peerId) {
        return require('./typing').startTyping(this, account, peerId);
    }
    async handleSlash(job, slash, run) {
        return require('./commands').handleSlash.call(this, job, slash, run);
    }
    async run(id, run) {
        let job = this.job(id);
        const approvals = this.approvals ||= new ChannelApprovals();
        const approval = job.status === 'queued' && !job.images?.length ? parseApproval(job.text) : null;
        if (approval) {
            // Never a chat message: it answers one pending approval of a turn this chat started, or
            // nothing. It belongs to the chat, not to where the chat talks now (a switch or a moved
            // window does not stop it); the answer is replied in the chat's current place.
            const account = this.db.value.accounts.find(a => a.id === job.accountId);
            const binding = this.db.value.bindings.find(b => b.accountId === job.accountId && b.peerId === job.peerId);
            if (!account?.enabled || !account.allowedUsers.includes(job.peerId) || !binding) {
                this.updateJob(id, { status: 'cancelled', reason: 'admission-changed', text: undefined }); return;
            }
            const answered = approvals.answer({ accountId: job.accountId, peerId: job.peerId, code: approval.code, allow: approval.allow });
            this.updateJob(id, { status: 'ready', kind: 'approval', text: undefined, bindingId: binding.id, target: { cwd: binding.cwd, sessionId: binding.sessionId },
                directReply: answered === 'done' ? approval.allow ? `✅ 已同意 ${approval.code}，继续进行。` : `已拒绝 ${approval.code}，这一步不会做。`
                    : `❌ 确认 ${approval.code} 已失效（已处理、超时或不是这个聊天发起的），没有改变什么。` });
            job = this.job(id);
        }
        if (!this.bindingFor(job)) {
            const current = this.db.value.bindings.find(b => b.accountId === job.accountId && b.peerId === job.peerId);
            if (!current || job.status !== 'queued' || job.kind === 'cron') {
                this.updateJob(id, { status: 'failed', reason: 'binding-changed' }); return;
            }
            // Explain the cancelled input without executing or quoting it in a different thread.
            this.updateJob(id, { status: 'ready', kind: 'notice', reason: 'binding-changed', bindingId: current.id,
                target: { cwd: current.cwd, sessionId: current.sessionId }, text: undefined, images: undefined,
                directReply: '⚠️ 微信绑定已变化，刚才这条消息尚未执行。请确认当前线程后重新发送。' });
            job = this.job(id);
        }
        let stopTyping = () => Promise.resolve();
        let slash = null;
        try {
            // A Bot chat runs in its window's current generation (bot-channel.js).
            if (job.status === 'queued' && this.bindingFor(job)?.bot) {
                if (await botChannel.ensureCurrent(this, id) === 'retry') return;
                job = this.job(id); run.target = job.target;
            }
            const current = this.bindingFor(job);
            const botWindow = job.status === 'queued' ? current?.bot : null;
            // Which Bot window the target must be: the chat's own, or where a reply or push came from.
            const proof = current?.bot && same(current, job.target) ? current.bot : job.bot;
            // Old versions could persist a binding to a legacy management
            // thread. Preserve that record, but never execute or deliver through it.
            try { await this.withBindingTarget(job.target.cwd, job.target.sessionId, () => {}, { bot: proof }); }
            catch (error) {
                // This proof has not executed or delivered anything. A native
                // append may invalidate it; keep queued/ready for the next pump,
                // and never overwrite a cancellation that won during the read.
                if (error.message === 'Session file changed' || error.code === 'SESSION_BUSY') return;
                throw error;
            }
            if (job.status === 'queued') {
                slash = !job.images?.length ? parseSlash(job.text) : null;
                if (slash) {
                    await require('./command-control').executeCommand(this, job, slash, run);
                } else {
                    const session = await this.store.getSession(job.target.cwd, job.target.sessionId);
                    let worker = this.supervisor.getActiveWorker(session.path);
                    if (worker && !worker.isIdle()) return;
                    worker = await this.supervisor.getWorker({ cwd: session.cwd, sessionPath: session.path, sessionId: session.id });
                    run.worker = worker;
                    if (!worker.isIdle() || !this.canAdmit(this.job(id)) || this.job(id).status !== 'queued') return;
                    // Checked again once the runtime is open: a move committed meanwhile leaves the message queued.
                    if (botWindow) {
                        try { await this.bots.assertCurrentWindowSession(botWindow.profileId, botWindow.windowId, session); }
                        catch (error) { if (botChannel.transient(error)) return; throw error; }
                    }
                    const moved = () => Boolean(botWindow && this.bots.sessionMoved(session.id));
                    const account = this.db.value.accounts.find(a => a.id === job.accountId);
                    stopTyping = await this.startTyping(account, job.peerId);
                    let images = [];
                    if (job.images?.length) {
                        try {
                            for (const ref of job.images) images.push(await this.adapter.downloadImage(ref));
                        } catch (error) {
                            this.updateJob(id, { status: 'ready', directReply: `⚠️ 微信图片读取失败：${error.message || '请稍后重试'}`, text: undefined, images: undefined });
                            images = null;
                        }
                    }
                    if (images !== null) {
                        if (moved() || !worker.isIdle() || !this.canAdmit(this.job(id)) || this.job(id).status !== 'queued') return;
                        this.updateJob(id, { status: 'dispatching' });
                        let waitingNotified = false;
                        let result;
                        try {
                            result = await worker.channelTurn({ id, peerId: job.peerId, text: job.text, images }, {
                                admit: () => !moved() && this.canAdmit(this.job(id)),
                                accepted: () => this.updateJob(id, { status: 'running', text: undefined, images: undefined }),
                                waiting: event => {
                                    try { this.updateJob(id, { waiting: true }); } catch { this.error = '渠道记录保存失败'; }
                                    const currentAccount = this.db.value.accounts.find(a => a.id === job.accountId);
                                    const peer = this.db.value.peers.find(p => p.accountId === job.accountId && p.peerId === job.peerId);
                                    const binding = this.bindingFor(this.job(id));
                                    if (!currentAccount?.enabled || !currentAccount.allowedUsers.includes(job.peerId) || !binding || !peer?.contextToken) return;
                                    // A Bot approval can be answered right here (bot-approvals.js); each one is offered once.
                                    const offer = botWindow ? approvals.offer({ event, worker, job, botName: binding.name }) : null;
                                    if (offer) { void this.adapter.send(currentAccount, peer, offer, `pivane-approval-${id}-${event.id}`.slice(0, 120)).catch(() => {}); return; }
                                    if (waitingNotified) return;
                                    waitingNotified = true;
                                    void this.adapter.send(currentAccount, peer, '⚠️ 当前任务正在等待交互确认，请打开 OhMyBuddy 网页端处理。', `pivane-wait-${id}`).catch(() => {});
                                }
                            });
                        } catch (error) {
                            if (error.code === 'SESSION_BUSY') { this.updateJob(id, { status: 'queued' }); return; }
                            if (['CHANNEL_MODEL_UNAVAILABLE', 'CHANNEL_IMAGE_UNSUPPORTED'].includes(error.code)
                                || !error.code && LEGACY_MODEL_REJECTIONS.has(error.message)) {
                                this.updateJob(id, { status: 'ready', directReply: `⚠️ ${error.message}`, text: undefined, images: undefined, waiting: false });
                                result = null;
                            } else throw error;
                        }
                        if (result?.cancelled) {
                            // The Bot window moved on just before the hand-off: nothing was sent; it runs in the new generation.
                            if (moved() && this.canAdmit(this.job(id))) { this.updateJob(id, { status: 'queued' }); return; }
                            this.updateJob(id, { status: 'cancelled', reason: 'admission-changed', text: undefined, images: undefined }); return;
                        }
                        if (result) {
                            if (!['completed', 'stopped', 'error'].includes(result.status)) throw fail('No native completion proof');
                            this.updateJob(id, { status: 'ready', text: undefined, images: undefined, waiting: false });
                        }
                    }
                }
            }
        } finally {
            await stopTyping();
            this.approvals?.forgetJob(id);
        }
        if (this.stopping || this.isSuspended()) return;
        job = this.job(id);
        if (job.status !== 'ready') return;
        const account = this.db.value.accounts.find(a => a.id === job.accountId);
        if (!account?.enabled || !account.allowedUsers.includes(job.peerId) || !this.bindingFor(job)) return;
        const isStop = slash?.command === '/stop' || job.command === '/stop';
        let result;
        if (typeof job.directReply === 'string') {
            if (isStop && (!job.directReply || !this.db.value.peers.find(p => p.accountId === account.id && p.peerId === job.peerId)?.contextToken)) {
                this.updateJob(id, { status: 'reviewed', reason: 'stop-request', directReply: undefined });
                return;
            }
            result = { status: 'completed', body: job.directReply, deliverables: job.deliverables || [], mediaPlans: job.mediaPlans || [] };
        } else {
            const session = await this.store.getSession(job.target.cwd, job.target.sessionId);
            const activeWorker = this.supervisor.getActiveWorker(session.path);
            if (activeWorker && !activeWorker.isIdle()) return;
            try { result = await this.readOutcome(job); }
            catch (error) { if (error.code === 'SESSION_BUSY') return; throw error; }
        }
        if (!result) throw fail('Native reply is unavailable');
        if (job.kind === 'cron' && this.canNotifyScheduled && !this.canNotifyScheduled(job.cronJobId)) {
            this.updateJob(id, { status: 'cancelled', reason: 'notification-revoked', directReply: undefined, deliverables: undefined, mediaPlans: undefined }); return;
        }
        const mediaSummary = this.summarizeMediaPlans(result.mediaPlans || []);
        const baseText = result.status === 'stopped' ? '任务已停止。已发生的操作不会撤销，请在 OhMyBuddy 网页核对。'
            : result.status === 'error' ? '本次任务未成功完成，请在 OhMyBuddy 网页查看。' : result.body || '任务已完成，请在 OhMyBuddy 网页查看工具结果。';
        const deliveryIssues = [];
        const deliverableFiles = await this.collectDeliverables(result.deliverables || [], deliveryIssues);
        const generatedMedia = await this.collectMediaAssets(result.mediaPlans || [], 6 - deliverableFiles.length, deliveryIssues);
        let mediaFiles = [...deliverableFiles, ...generatedMedia].slice(0, 6);
        if (mediaFiles.length && typeof this.adapter.sendMedia !== 'function') {
            for (const media of mediaFiles) this.deliveryIssue(deliveryIssues, media.name, 'unavailable');
            mediaFiles = [];
        }
        const warning = this.deliveryWarning(deliveryIssues);
        // Command answers and notices speak for the chat itself, not for a Bot.
        const speaker = job.bot && !['slash', 'notice', 'approval'].includes(job.kind) ? await botChannel.speakerPrefix(this, this.bindingFor(job), job.bot) : '';
        const text = [speaker ? `${speaker}${baseText}` : baseText, mediaSummary, warning].filter(Boolean).join('\n\n');
        const chunks = Array.from(text.matchAll(/[\s\S]{1,1800}/gu), m => m[0]);
        await require('./delivery').deliver(this, job, { chunks, mediaFiles, deliveryIssues, isStop });
    }
    summarizeMediaPlans(plans) {
        if (!Array.isArray(plans) || !plans.length || !this.mediaLabService?.chatRequests) return '';
        const lines = [];
        for (const plan of plans.slice(0, 6)) {
            const state = this.mediaLabService.chatRequests.publicState(plan.id);
            const last = state?.attempts?.at(-1);
            if (!last) {
                const icon = plan.kind === 'video' ? '🎬' : plan.kind === 'tts' ? '🔊' : '🎨';
                lines.push(`${icon} 待确认媒体卡片：${plan.summary || plan.modelId}（${plan.modelId}）\n💡 在微信回复 /confirm ${plan.id} 确认生成或查询结果。${job.bot ? '工具授权请用对应的同意/拒绝 A编号。' : ''}也可打开 OhMyBuddy 网页修改参数后确认。`);
            }
        }
        return lines.join('\n\n');
    }
    deliveryIssue(issues, name, reason) {
        if (issues.length < 20) issues.push({ name: String(name || '附件').replace(/[\x00-\x1f]/g, ' ').slice(0, 120), reason });
    }
    deliveryWarning(issues) {
        if (!issues.length) return '';
        const labels = { limit: '超过每次 6 个附件限制', size: '超过 16 MiB', unreadable: '无法读取或校验文件',
            unavailable: '文件发送组件不可用', pending: '尚在生成，可稍后发送 /confirm 查询', failed: '生成未完成，请在网页查看',
            'media-upload-failed': '上传失败，已尝试恢复', 'send-unconfirmed': '发送回执未确认，为避免重复未重发',
            'wechat-rejected': '微信拒绝接收', 'wechat-rate-limited': '微信暂时限制发送', 'connection-unavailable': '暂时无法连接微信' };
        const lines = issues.slice(0, 5).map(item => item.name + '：' + (labels[item.reason] || labels.unreadable));
        return '⚠️ 部分附件尚未发送：\n' + lines.join('\n')
            + (issues.length > 5 ? '\n其他未发送附件请在 OhMyBuddy 网页查看投递记录。' : '');
    }
    async collectMediaAssets(plans, maxCount = 6, issues = []) {
        if (!Array.isArray(plans) || !plans.length) return [];
        const items = [];
        const root = this.mediaRoot && path.join(this.mediaRoot, 'public');
        const { readVerifiedFile } = require('../pi-file-bytes');
        const { withinCanonical } = require('../pi-platform-path');
        for (const plan of plans.slice(0, 20)) {
            const name = plan.summary || plan.modelId || '媒体附件';
            if (!this.mediaLabService?.chatRequests || !root) { this.deliveryIssue(issues, name, 'unavailable'); continue; }
            try {
                const state = this.mediaLabService.chatRequests.publicState(plan.id);
                const last = state?.attempts?.at(-1);
                if (!last) continue; // The pending-confirmation summary already explains this card.
                if (last.status !== 'done') { this.deliveryIssue(issues, name, ['running', 'queued'].includes(last.status) ? 'pending' : 'failed'); continue; }
                if (items.length >= maxCount) { this.deliveryIssue(issues, name, 'limit'); continue; }
                const url = typeof last.asset?.url === 'string' ? last.asset.url.split('?')[0] : '';
                const match = /^\/(images|videos|audio)\/([A-Za-z0-9._-]+)$/.exec(url);
                if (!match) { this.deliveryIssue(issues, name, 'unreadable'); continue; }
                const [, folder, filename] = match;
                const target = path.join(root, folder, filename);
                const canonicalRoot = require('node:fs').realpathSync.native(root);
                const verified = await readVerifiedFile(target, { maxBytes: 16 * 1024 * 1024, check: actual => {
                    if (!withinCanonical(canonicalRoot, actual)) throw new Error('outside media root');
                } });
                const type = require('../pi-file-types').classify(verified.bytes, filename);
                items.push({ kind: type.kind === 'image' ? 'image' : 'file', name: filename, mime: last.asset.mimeType || type.mime, bytes: verified.bytes });
            } catch { this.deliveryIssue(issues, name, 'unreadable'); }
        }
        if (plans.length > 20) this.deliveryIssue(issues, '其他媒体附件', 'limit');
        return items;
    }
    async collectDeliverables(refs, issues = []) {
        const items = [];
        for (const ref of refs.slice(0, 6)) {
            let manifest, root;
            try {
                ({ manifest } = await this.deliverables.manifest(ref.id, ref.manifestRevision));
                root = await this.deliverables.root();
            } catch { this.deliveryIssue(issues, '交付文件', 'unreadable'); continue; }
            for (const file of manifest.files) {
                if (items.length >= 6) { this.deliveryIssue(issues, file.name, 'limit'); continue; }
                if (file.size > 16 * 1024 * 1024) { this.deliveryIssue(issues, file.name, 'size'); continue; }
                try {
                    const verified = await this.deliverables.readObject(root, path.join(root, ref.id, file.index + '.bin'), 16 * 1024 * 1024);
                    if (verified.revision !== file.revision || verified.size !== file.size) throw new Error('delivery identity mismatch');
                    const type = require('../pi-file-types').classify(verified.bytes, file.name);
                    items.push({ kind: type.kind === 'image' ? 'image' : 'file', name: file.name, mime: type.mime, bytes: verified.bytes });
                } catch { this.deliveryIssue(issues, file.name, 'unreadable'); }
            }
        }
        if (refs.length > 6) this.deliveryIssue(issues, '其他交付文件', 'limit');
        return items;
    }
    async readOutcome(job) {
        const session = await this.store.getSession(job.target.cwd, job.target.sessionId);
        const worker = this.supervisor.getActiveWorker(session.path);
        const input = { action: job.kind === 'thread' ? 'thread-status' : 'status', id: job.turnId || job.id, sessionId: session.id };
        if (worker) return worker.exclusive(rpc => worker.navigate(rpc, { mode: 'channel', input }));
        return this.store.withSessionRead(session.cwd, session.id, async (_s, read) => {
            const result = job.kind === 'thread' ? threadOutcome(read.manager(), job.turnId) : outcome(read.manager(), job.id);
            read.validate(); return result;
        });
    }
    async dispose() {
        if (this.disposal) return this.disposal;
        this.stopping = true; this.supervisor.removeListener?.('thread-result', this.onThreadResult);
        this.login = null; clearInterval(this.timer); this.stopController.abort();
        const notices = [];
        for (const [id, p] of this.pollers) {
            p.controller.abort();
            const account = this.db?.value.accounts.find(a => a.id === id);
            if (account && this.adapter) notices.push(this.adapter.notify(account, false).catch(() => {}));
        }
        this.disposal = (async () => {
            await this.ready;
            await Promise.allSettled([...notices, this.loginFlight, ...this.operations, ...[...this.pollers.values()].map(p => p.promise), ...[...this.runs.values()].map(r => r.promise)].filter(Boolean));
            this.db?.close();
        })();
        return this.disposal;
    }
}
function mountChannels(router, service) {
    router.get('/channels', async (_req, res) => {
        res.set('Cache-Control', 'no-store');
        try { res.json(await service.snapshot()); } catch { res.status(500).json({ error: '无法读取消息渠道状态' }); }
    });
    router.post('/channels/weixin/actions', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try { res.json(await service.track(service.action(req.body))); }
        catch (error) { res.status(error.status || 400).json({ error: error.status ? error.message : '操作失败或结果待核对，请刷新状态；不会自动重试。' }); }
    });
}
module.exports = { ChannelsService, mountChannels, digest, parseSlash };
